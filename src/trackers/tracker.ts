import { mkdir, unlink } from "node:fs/promises";
import {
  and,
  eq,
  inArray,
  isNull,
  ne,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";

import {
  chapter,
  chapterGroup,
  image,
  manga,
  trackingChapter,
  trackingChapterGroup,
  trackingImage,
  trackingManga,
} from "#/db/schema.ts";
import db from "#/lib/db.server.ts";
import { trackerLogger } from "#/lib/logger.server.ts";
import type { APIChapter, APIDetailedManga } from "#/utils/api.server.ts";
import { embed } from "#/utils/embedding.server.ts";
import {
  CHAPTER_IMAGES_DIR,
  MANGA_IMAGES_DIR,
  MAX_IMAGE_BYTES,
} from "#/utils/image.server.ts";

const IDLE_POLL_MS = 1_000;
const MAX_RETRY_BACKOFF_MS = 60 * 60_000;
const MAX_RETRY_BACKOFF_EXPONENT = 30;

function failedRetryIsDue(
  failedAt: SQLWrapper,
  failedCount: SQLWrapper,
  operationTimeoutMs: number,
): SQL {
  return sql`${failedAt} + (
    least(
      ${MAX_RETRY_BACKOFF_MS},
      ${operationTimeoutMs} * power(
        2,
        least(
          greatest(coalesce(${failedCount}, 1) - 1, 0),
          ${MAX_RETRY_BACKOFF_EXPONENT}
        )
      )
    ) * interval '1 millisecond'
  ) <= current_timestamp`;
}

export type TrackerChapter = Omit<APIChapter, "locked">;

export type TrackerChapterGroup = {
  title: string;
  chapters: TrackerChapter[];
};

export type TrackerManga = Omit<
  APIDetailedManga,
  "latestChapter" | "chapters" | "editable"
> & {
  chapters: TrackerChapterGroup[];
};

type PendingOrFailed = "pending" | "failed";

type MangaCandidate = {
  id: string;
  status: PendingOrFailed;
  failedAt: Date | null;
};

type ChapterCandidate = {
  trackingMangaId: string;
  id: string;
  status: PendingOrFailed;
  failedAt: Date | null;
};

type ImageCandidate = {
  trackingMangaId: string;
  trackingChapterId: string;
  sequence: number;
  status: PendingOrFailed;
  failedAt: Date | null;
};

type FailedCandidate =
  | ({ kind: "manga" } & MangaCandidate)
  | ({ kind: "chapter" } & ChapterCandidate)
  | ({ kind: "image" } & ImageCandidate);

type NormalizedChapter = {
  id: string;
  title: string | null;
  sequence: number;
  groupTitle: string;
};

type NormalizedGroup = {
  title: string;
  sequence: number;
  chapters: NormalizedChapter[];
};

type NormalizedManga = {
  title: string | null;
  status: TrackerManga["status"] | null;
  readingDirection: TrackerManga["readingDirection"] | null;
  description: string | null;
  authors: TrackerManga["authors"] | null;
  genres: TrackerManga["genres"] | null;
  remarks: string | null;
  meta: string | null;
  coverUrl: string | null;
  updatedAt: Date;
  groups: NormalizedGroup[];
  chaptersById: Map<string, NormalizedChapter>;
};

type PreparedImage = {
  id: string;
  path: string;
};

class StaleJobError extends Error {
  constructor() {
    super("Tracker job is no longer active");
  }
}

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {}
}

async function unlinkImageFiles(
  directory: string,
  ids: Iterable<string>,
): Promise<void> {
  await Promise.allSettled(
    Array.from(new Set(ids), (id) => safeUnlink(`${directory}/${id}.webp`)),
  );
}

export default abstract class Tracker {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly invalidMangaIdMessage: string;

  abstract normalizeMangaId(id: string): string;
  abstract validateMangaId(id: string): boolean;

  abstract updateInterval: number; // run getUpdates every updateInterval milliseconds
  abstract getUpdatesTimeout: number; // sleep for getUpdatesTimeout milliseconds after getUpdates
  abstract getUpdates(ids: TrackerManga[]): Promise<
    {
      id: string;
      needsUpdate: boolean;
    }[]
  >;

  abstract getMangaTimeout: number; // sleep for getMangaTimeout milliseconds after getManga
  abstract getManga(id: string): Promise<TrackerManga>;

  abstract getChapterTimeout: number; // sleep for getChapterTimeout milliseconds after getChapter
  abstract getChapter(
    manga: TrackerManga,
    chapter: TrackerChapter,
  ): Promise<string[]>;

  abstract getImageTimeout: number; // sleep for getImageTimeout milliseconds after getImage
  abstract getImage(url: string): Promise<Buffer>;

  // A tracker instance owns at most one serialized scheduler.
  private runPromise: Promise<void> | undefined;
  private stopping = false;
  private nextUpdatesAt = 0;
  private nextRepairAt = 0;

  start(): Promise<void> {
    if (this.runPromise) return this.runPromise;

    this.stopping = false;
    let promise: Promise<void>;
    promise = this.runLoop().finally(() => {
      if (this.runPromise === promise) {
        this.runPromise = undefined;
      }
    });
    this.runPromise = promise;

    return promise;
  }

  stop(): void {
    if (!this.runPromise || this.stopping) return;
    this.stopping = true;
  }

  private async runLoop(): Promise<void> {
    await Promise.all([
      mkdir(MANGA_IMAGES_DIR, { recursive: true }),
      mkdir(CHAPTER_IMAGES_DIR, { recursive: true }),
    ]);

    // Resume durable work before the first source update poll.
    try {
      await this.recoverInterruptedJobs();
      await this.repairBrokenMappings();
    } catch (error) {
      this.error("failed to initialize scheduler state", error);
    }
    this.nextUpdatesAt = Date.now();
    this.nextRepairAt = Date.now() + IDLE_POLL_MS;

    trackerLogger.info({ trackerId: this.id }, "tracker started");

    while (!this.stopping) {
      try {
        const cooldown = await this.runOneJob();
        if (cooldown != null && !this.stopping) {
          await Bun.sleep(cooldown);
        } else if (!this.stopping) {
          const untilUpdates = Math.max(0, this.nextUpdatesAt - Date.now());
          await Bun.sleep(Math.min(IDLE_POLL_MS, untilUpdates));
        }
      } catch (error) {
        this.error("unexpected scheduler error", error);
        try {
          await this.recoverInterruptedJobs();
        } catch (recoveryError) {
          this.error("failed to recover interrupted jobs", recoveryError);
        }
        await Bun.sleep(IDLE_POLL_MS);
      }
    }

    trackerLogger.info({ trackerId: this.id }, "tracker stopped");
  }

  private async runOneJob(): Promise<number | null> {
    if (Date.now() >= this.nextRepairAt) {
      await this.repairBrokenMappings();
      this.nextRepairAt = Date.now() + IDLE_POLL_MS;
    }

    if (Date.now() >= this.nextUpdatesAt) {
      trackerLogger.debug({ trackerId: this.id }, "checking tracker updates");
      return this.checkForUpdates();
    }

    // Reconcile parents before descendants; retry failures only after pending work.
    const pendingManga = await this.findMangaCandidate("pending");
    if (pendingManga) {
      return this.processManga(pendingManga);
    }

    const pendingChapter = await this.findChapterCandidate("pending");
    if (pendingChapter) {
      return this.processChapter(pendingChapter);
    }

    const pendingImage = await this.findImageCandidate("pending");
    if (pendingImage) {
      return this.processImage(pendingImage);
    }

    const [mangaCandidate, chapterCandidate, imageCandidate] =
      await Promise.all([
        this.findMangaCandidate("failed"),
        this.findChapterCandidate("failed"),
        this.findImageCandidate("failed"),
      ]);

    const candidates: FailedCandidate[] = [];
    if (mangaCandidate) {
      candidates.push({ kind: "manga", ...mangaCandidate });
    }
    if (chapterCandidate) {
      candidates.push({ kind: "chapter", ...chapterCandidate });
    }
    if (imageCandidate) {
      candidates.push({ kind: "image", ...imageCandidate });
    }

    candidates.sort(
      (left, right) =>
        (left.failedAt?.getTime() ?? 0) - (right.failedAt?.getTime() ?? 0),
    );
    const failed = candidates[0];
    if (!failed) return null;

    switch (failed.kind) {
      case "manga":
        return this.processManga(failed);
      case "chapter":
        return this.processChapter(failed);
      case "image":
        return this.processImage(failed);
    }
  }

  private async recoverInterruptedJobs(): Promise<void> {
    trackerLogger.debug(
      { trackerId: this.id },
      "recovering interrupted tracker jobs",
    );
    const pendingAt = new Date();
    await db
      .update(trackingManga)
      .set({ status: "pending", pendingAt })
      .where(
        and(
          eq(trackingManga.trackingId, this.id),
          eq(trackingManga.status, "tracking"),
        ),
      );
    await db
      .update(trackingChapter)
      .set({ status: "pending", pendingAt })
      .where(
        and(
          eq(trackingChapter.trackingId, this.id),
          eq(trackingChapter.status, "tracking"),
        ),
      );
    await db
      .update(trackingImage)
      .set({ status: "pending", pendingAt })
      .where(
        and(
          eq(trackingImage.trackingId, this.id),
          eq(trackingImage.status, "tracking"),
        ),
      );

    trackerLogger.debug(
      { trackerId: this.id },
      "interrupted tracker jobs recovered",
    );
  }

  private async repairBrokenMappings(): Promise<void> {
    // Replay the nearest durable job when a mapped local row disappears.
    const pendingAt = new Date();

    await db
      .update(trackingManga)
      .set({ status: "pending", pendingAt })
      .where(
        and(
          eq(trackingManga.trackingId, this.id),
          eq(trackingManga.status, "completed"),
          isNull(trackingManga.mangaId),
        ),
      );

    const [brokenGroups, brokenChapters] = await Promise.all([
      db.query.trackingChapterGroup.findMany({
        columns: { trackingMangaId: true },
        where: {
          trackingId: this.id,
          chapterGroupId: { isNull: true },
          trackingManga: { status: "completed" },
        },
      }),
      db.query.trackingChapter.findMany({
        columns: { trackingMangaId: true },
        where: {
          trackingId: this.id,
          chapterId: { isNull: true },
          trackingManga: { status: "completed" },
        },
      }),
    ]);

    const brokenMangaIds = Array.from(
      new Set(
        [...brokenGroups, ...brokenChapters].map((row) => row.trackingMangaId),
      ),
    );
    if (brokenMangaIds.length > 0) {
      await db
        .update(trackingManga)
        .set({ status: "pending", pendingAt })
        .where(
          and(
            eq(trackingManga.trackingId, this.id),
            inArray(trackingManga.id, brokenMangaIds),
            eq(trackingManga.status, "completed"),
          ),
        );
      trackerLogger.debug(
        {
          trackerId: this.id,
          mangaCount: brokenMangaIds.length,
        },
        "broken tracker mappings requeued",
      );
    }

    await db
      .update(trackingImage)
      .set({ status: "pending", pendingAt })
      .where(
        and(
          eq(trackingImage.trackingId, this.id),
          eq(trackingImage.status, "completed"),
          isNull(trackingImage.imageId),
        ),
      );
  }

  private async checkForUpdates(): Promise<number> {
    try {
      const rows = await db.query.trackingManga.findMany({
        columns: { id: true },
        where: {
          trackingId: this.id,
          status: "completed",
        },
        orderBy: { createdAt: "asc" },
      });
      trackerLogger.info(
        {
          trackerId: this.id,
          mangaCount: rows.length,
        },
        "loaded tracker update candidates",
      );

      const snapshots = await this.loadSourceMangas(rows.map((row) => row.id));
      const updates = await this.getUpdates(snapshots);

      const known = new Set(snapshots.map((item) => item.id));
      // Omitted results are conservative: only an explicit false skips refresh.
      const changed = new Set(known);
      for (const update of updates) {
        if (!known.has(update.id)) {
          trackerLogger.warn(
            {
              trackerId: this.id,
              mangaId: update.id,
            },
            "getUpdates returned an unknown manga",
          );
          continue;
        }
        if (update.needsUpdate) {
          changed.add(update.id);
        } else {
          changed.delete(update.id);
        }
      }

      if (changed.size > 0) {
        const pendingAt = new Date();
        await db
          .update(trackingManga)
          .set({ status: "pending", pendingAt })
          .where(
            and(
              eq(trackingManga.trackingId, this.id),
              inArray(trackingManga.id, Array.from(changed)),
              eq(trackingManga.status, "completed"),
            ),
          );
      }

      trackerLogger.debug(
        {
          trackerId: this.id,
          checkedCount: snapshots.length,
          changedCount: changed.size,
        },
        "tracker update check completed",
      );
    } catch (error) {
      this.error("failed to check for updates", error);
    } finally {
      this.nextUpdatesAt = Date.now() + this.updateInterval;
    }

    return this.getUpdatesTimeout;
  }

  private async findMangaCandidate(
    status: PendingOrFailed,
  ): Promise<MangaCandidate | null> {
    const row = await db.query.trackingManga.findFirst({
      columns: {
        id: true,
        failedAt: true,
      },
      where: {
        trackingId: this.id,
        status,
        OR:
          status === "failed"
            ? [
                { failedAt: { isNull: true } },
                {
                  RAW: (table) =>
                    failedRetryIsDue(
                      table.failedAt,
                      table.failedCount,
                      this.getMangaTimeout,
                    ),
                },
              ]
            : undefined,
      },
      orderBy:
        status === "pending"
          ? { pendingAt: "asc", createdAt: "asc" }
          : { failedAt: "asc", createdAt: "asc" },
    });

    if (!row) return null;
    return {
      id: row.id,
      status,
      failedAt: row.failedAt,
    };
  }

  private async findChapterCandidate(
    status: PendingOrFailed,
  ): Promise<ChapterCandidate | null> {
    const row = await db.query.trackingChapter.findFirst({
      columns: {
        trackingMangaId: true,
        id: true,
        failedAt: true,
      },
      where: {
        trackingId: this.id,
        status,
        trackingManga: { status: "completed" },
        chapterId: { isNotNull: true },
        OR:
          status === "failed"
            ? [
                { failedAt: { isNull: true } },
                {
                  RAW: (table) =>
                    failedRetryIsDue(
                      table.failedAt,
                      table.failedCount,
                      this.getChapterTimeout,
                    ),
                },
              ]
            : undefined,
      },
      orderBy:
        status === "pending"
          ? { pendingAt: "asc", createdAt: "asc" }
          : { failedAt: "asc", createdAt: "asc" },
    });

    if (!row) return null;
    return {
      trackingMangaId: row.trackingMangaId,
      id: row.id,
      status,
      failedAt: row.failedAt,
    };
  }

  private async findImageCandidate(
    status: PendingOrFailed,
  ): Promise<ImageCandidate | null> {
    const row = await db.query.trackingImage.findFirst({
      columns: {
        trackingMangaId: true,
        trackingChapterId: true,
        sequence: true,
        failedAt: true,
      },
      where: {
        trackingId: this.id,
        status,
        trackingManga: { status: "completed" },
        trackingChapter: {
          status: "completed",
          chapterId: { isNotNull: true },
        },
        OR:
          status === "failed"
            ? [
                { failedAt: { isNull: true } },
                {
                  RAW: (table) =>
                    failedRetryIsDue(
                      table.failedAt,
                      table.failedCount,
                      this.getImageTimeout,
                    ),
                },
              ]
            : undefined,
      },
      orderBy:
        status === "pending"
          ? { pendingAt: "asc", createdAt: "asc" }
          : { failedAt: "asc", createdAt: "asc" },
    });

    if (!row) return null;
    return {
      trackingMangaId: row.trackingMangaId,
      trackingChapterId: row.trackingChapterId,
      sequence: row.sequence,
      status,
      failedAt: row.failedAt,
    };
  }

  private async processManga(candidate: MangaCandidate): Promise<number> {
    const [claimed] = await db
      .update(trackingManga)
      .set({ status: "tracking", trackingAt: new Date() })
      .where(
        and(
          eq(trackingManga.trackingId, this.id),
          eq(trackingManga.id, candidate.id),
          eq(trackingManga.status, candidate.status),
        ),
      )
      .returning();
    if (!claimed) {
      trackerLogger.debug(
        {
          trackerId: this.id,
          job: "manga",
          mangaId: candidate.id,
          status: candidate.status,
        },
        "tracker job claim skipped",
      );
      return 0;
    }

    trackerLogger.info(
      {
        trackerId: this.id,
        job: "manga",
        mangaId: candidate.id,
        status: candidate.status,
      },
      "tracker job claimed",
    );

    let cooldown = this.getMangaTimeout;
    let preparedCover: PreparedImage | null = null;
    try {
      const details = await this.getManga(candidate.id);
      const normalized = this.normalizeManga(candidate.id, details);

      if (normalized.coverUrl) {
        // Finish getManga's cooldown before switching to getImage.
        await Bun.sleep(this.getMangaTimeout);
        cooldown = this.getImageTimeout;
        preparedCover = await this.downloadImage(
          normalized.coverUrl,
          MANGA_IMAGES_DIR,
        );
      }

      const embedding = await this.createMangaEmbedding(normalized);
      const oldFileIds = await this.reconcileManga(
        candidate.id,
        normalized,
        preparedCover,
        embedding,
      );
      await unlinkImageFiles(MANGA_IMAGES_DIR, oldFileIds.cover);
      await unlinkImageFiles(CHAPTER_IMAGES_DIR, oldFileIds.chapter);
      trackerLogger.debug(
        {
          trackerId: this.id,
          job: "manga",
          mangaId: candidate.id,
          removedCoverCount: oldFileIds.cover.length,
          removedPageCount: oldFileIds.chapter.length,
          cooldownMs: cooldown,
        },
        "tracker job completed",
      );
    } catch (error) {
      if (preparedCover) await safeUnlink(preparedCover.path);

      if (error instanceof StaleJobError) {
        await db
          .update(trackingManga)
          .set({ status: "pending", pendingAt: new Date() })
          .where(
            and(
              eq(trackingManga.trackingId, this.id),
              eq(trackingManga.id, candidate.id),
              eq(trackingManga.status, "tracking"),
            ),
          );
        trackerLogger.debug(
          {
            trackerId: this.id,
            job: "manga",
            mangaId: candidate.id,
          },
          "stale tracker job requeued",
        );
        return cooldown;
      }

      this.error("failed to mirror manga", error, {
        job: "manga",
        mangaId: candidate.id,
      });
      await db
        .update(trackingManga)
        .set({
          status: "failed",
          failedAt: new Date(),
          failedCount: sql<number>`coalesce(${trackingManga.failedCount}, 0) + 1`,
          failedReason: error instanceof Error ? error.message : String(error),
        })
        .where(
          and(
            eq(trackingManga.trackingId, this.id),
            eq(trackingManga.id, candidate.id),
            eq(trackingManga.status, "tracking"),
          ),
        );
    }

    return cooldown;
  }

  private async processChapter(candidate: ChapterCandidate): Promise<number> {
    const [claimed] = await db
      .update(trackingChapter)
      .set({ status: "tracking", trackingAt: new Date() })
      .where(
        and(
          eq(trackingChapter.trackingId, this.id),
          eq(trackingChapter.trackingMangaId, candidate.trackingMangaId),
          eq(trackingChapter.id, candidate.id),
          eq(trackingChapter.status, candidate.status),
        ),
      )
      .returning();
    if (!claimed) {
      trackerLogger.debug(
        {
          trackerId: this.id,
          job: "chapter",
          mangaId: candidate.trackingMangaId,
          chapterId: candidate.id,
          status: candidate.status,
        },
        "tracker job claim skipped",
      );
      return 0;
    }

    trackerLogger.info(
      {
        trackerId: this.id,
        job: "chapter",
        mangaId: candidate.trackingMangaId,
        chapterId: candidate.id,
        status: candidate.status,
      },
      "tracker job claimed",
    );

    let cooldown = 0;
    try {
      const [sourceManga] = await this.loadSourceMangas([
        candidate.trackingMangaId,
      ]);
      if (!sourceManga) {
        await this.requeueParentManga(candidate.trackingMangaId);
        throw new StaleJobError();
      }

      const sourceChapter = sourceManga.chapters
        .flatMap((group) => group.chapters)
        .find((item) => item.id === candidate.id);
      if (!sourceChapter) {
        await this.requeueParentManga(candidate.trackingMangaId);
        throw new StaleJobError();
      }

      cooldown = this.getChapterTimeout;
      const urls = await this.getChapter(sourceManga, sourceChapter);
      if (urls.length === 0) {
        throw new Error("getChapter returned no image URLs");
      }

      const normalizedUrls = urls.map((url, sequence) => {
        const normalized = url.trim();
        if (!normalized) {
          throw new Error(
            `getChapter returned an invalid URL at sequence ${String(sequence)}`,
          );
        }

        return normalized;
      });

      const oldImageIds = await this.reconcileChapter(
        candidate.trackingMangaId,
        candidate.id,
        normalizedUrls,
      );
      await unlinkImageFiles(CHAPTER_IMAGES_DIR, oldImageIds);
      trackerLogger.debug(
        {
          trackerId: this.id,
          job: "chapter",
          mangaId: candidate.trackingMangaId,
          chapterId: candidate.id,
          pageCount: normalizedUrls.length,
          removedPageCount: oldImageIds.length,
          cooldownMs: cooldown,
        },
        "tracker job completed",
      );
    } catch (error) {
      if (error instanceof StaleJobError) {
        await db
          .update(trackingChapter)
          .set({ status: "pending", pendingAt: new Date() })
          .where(
            and(
              eq(trackingChapter.trackingId, this.id),
              eq(trackingChapter.trackingMangaId, candidate.trackingMangaId),
              eq(trackingChapter.id, candidate.id),
              eq(trackingChapter.status, "tracking"),
            ),
          );
        trackerLogger.debug(
          {
            trackerId: this.id,
            job: "chapter",
            mangaId: candidate.trackingMangaId,
            chapterId: candidate.id,
          },
          "stale tracker job requeued",
        );
        return cooldown;
      }

      this.error("failed to mirror chapter", error, {
        job: "chapter",
        mangaId: candidate.trackingMangaId,
        chapterId: candidate.id,
      });
      await db
        .update(trackingChapter)
        .set({
          status: "failed",
          failedAt: new Date(),
          failedCount: sql<number>`coalesce(${trackingChapter.failedCount}, 0) + 1`,
          failedReason: error instanceof Error ? error.message : String(error),
        })
        .where(
          and(
            eq(trackingChapter.trackingId, this.id),
            eq(trackingChapter.trackingMangaId, candidate.trackingMangaId),
            eq(trackingChapter.id, candidate.id),
            eq(trackingChapter.status, "tracking"),
          ),
        );
    }

    return cooldown;
  }

  private async processImage(candidate: ImageCandidate): Promise<number> {
    const [claimed] = await db
      .update(trackingImage)
      .set({ status: "tracking", trackingAt: new Date() })
      .where(
        and(
          eq(trackingImage.trackingId, this.id),
          eq(trackingImage.trackingMangaId, candidate.trackingMangaId),
          eq(trackingImage.trackingChapterId, candidate.trackingChapterId),
          eq(trackingImage.sequence, candidate.sequence),
          eq(trackingImage.status, candidate.status),
        ),
      )
      .returning();
    if (!claimed) {
      trackerLogger.debug(
        {
          trackerId: this.id,
          job: "image",
          mangaId: candidate.trackingMangaId,
          chapterId: candidate.trackingChapterId,
          sequence: candidate.sequence,
          status: candidate.status,
        },
        "tracker job claim skipped",
      );
      return 0;
    }

    trackerLogger.info(
      {
        trackerId: this.id,
        job: "image",
        mangaId: candidate.trackingMangaId,
        chapterId: candidate.trackingChapterId,
        sequence: candidate.sequence,
        status: candidate.status,
      },
      "tracker job claimed",
    );

    let prepared: PreparedImage | null = null;
    try {
      prepared = await this.downloadImage(claimed.url, CHAPTER_IMAGES_DIR);
      const oldImageId = await this.reconcileImage(
        candidate.trackingMangaId,
        candidate.trackingChapterId,
        candidate.sequence,
        claimed.url,
        prepared,
      );
      if (oldImageId) {
        await safeUnlink(`${CHAPTER_IMAGES_DIR}/${oldImageId}.webp`);
      }
      trackerLogger.debug(
        {
          trackerId: this.id,
          job: "image",
          mangaId: candidate.trackingMangaId,
          chapterId: candidate.trackingChapterId,
          sequence: candidate.sequence,
          replacedImage: Boolean(oldImageId),
          cooldownMs: this.getImageTimeout,
        },
        "tracker job completed",
      );
    } catch (error) {
      if (prepared) await safeUnlink(prepared.path);

      if (error instanceof StaleJobError) {
        await db
          .update(trackingImage)
          .set({ status: "pending", pendingAt: new Date() })
          .where(
            and(
              eq(trackingImage.trackingId, this.id),
              eq(trackingImage.trackingMangaId, candidate.trackingMangaId),
              eq(trackingImage.trackingChapterId, candidate.trackingChapterId),
              eq(trackingImage.sequence, candidate.sequence),
              eq(trackingImage.status, "tracking"),
            ),
          );
        trackerLogger.debug(
          {
            trackerId: this.id,
            job: "image",
            mangaId: candidate.trackingMangaId,
            chapterId: candidate.trackingChapterId,
            sequence: candidate.sequence,
          },
          "stale tracker job requeued",
        );
        return this.getImageTimeout;
      }

      this.error("failed to mirror image", error, {
        job: "image",
        mangaId: candidate.trackingMangaId,
        chapterId: candidate.trackingChapterId,
        sequence: candidate.sequence,
      });
      await db
        .update(trackingImage)
        .set({
          status: "failed",
          failedAt: new Date(),
          failedCount: sql<number>`coalesce(${trackingImage.failedCount}, 0) + 1`,
          failedReason: error instanceof Error ? error.message : String(error),
        })
        .where(
          and(
            eq(trackingImage.trackingId, this.id),
            eq(trackingImage.trackingMangaId, candidate.trackingMangaId),
            eq(trackingImage.trackingChapterId, candidate.trackingChapterId),
            eq(trackingImage.sequence, candidate.sequence),
            eq(trackingImage.status, "tracking"),
          ),
        );
    }

    return this.getImageTimeout;
  }

  private normalizeManga(
    requestedId: string,
    details: TrackerManga,
  ): NormalizedManga {
    if (details.id !== requestedId) {
      throw new Error(
        `getManga returned id ${details.id} for requested id ${requestedId}`,
      );
    }

    let updatedAt = new Date();
    if (details.updatedAt !== undefined) {
      if (!Number.isFinite(details.updatedAt)) {
        throw new Error("getManga returned invalid updatedAt");
      }
      updatedAt = new Date(details.updatedAt);
      if (Number.isNaN(updatedAt.getTime())) {
        throw new Error("getManga returned invalid updatedAt");
      }
    }

    const groups: NormalizedGroup[] = [];
    const groupTitles = new Set<string>();
    const chaptersById = new Map<string, NormalizedChapter>();
    for (const [groupSequence, sourceGroup] of details.chapters.entries()) {
      const groupTitle = sourceGroup.title.trim();
      if (!groupTitle) {
        throw new Error(
          `Chapter group at sequence ${String(groupSequence)} has an invalid title`,
        );
      }
      if (groupTitles.has(groupTitle)) {
        throw new Error(`Duplicate chapter group title ${groupTitle}`);
      }
      groupTitles.add(groupTitle);

      const normalizedChapters: NormalizedChapter[] = [];
      const sourceChapters = sourceGroup.chapters;
      for (let sequence = 0; sequence < sourceChapters.length; sequence++) {
        const sourceChapter = sourceChapters[sequence]!;
        if (!sourceChapter.id.trim()) {
          throw new Error(`Chapter group ${groupTitle} has an invalid id`);
        }
        if (chaptersById.has(sourceChapter.id)) {
          throw new Error(`Duplicate chapter id ${sourceChapter.id}`);
        }

        const normalizedChapter: NormalizedChapter = {
          id: sourceChapter.id,
          title: optionalText(sourceChapter.title),
          sequence,
          groupTitle,
        };
        normalizedChapters.push(normalizedChapter);
        chaptersById.set(normalizedChapter.id, normalizedChapter);
      }

      groups.push({
        title: groupTitle,
        sequence: groupSequence,
        chapters: normalizedChapters,
      });
    }

    return {
      title: optionalText(details.title),
      status: details.status ?? null,
      readingDirection: details.readingDirection ?? null,
      description: optionalText(details.description),
      authors: details.authors.length > 0 ? details.authors : null,
      genres: details.genres.length > 0 ? details.genres : null,
      remarks: optionalText(details.remarks),
      meta: details.meta ?? null,
      coverUrl: optionalText(details.cover),
      updatedAt,
      groups,
      chaptersById,
    };
  }

  private async createMangaEmbedding(
    details: NormalizedManga,
  ): Promise<number[] | null> {
    const embeddingText = [
      details.title ?? "",
      details.description ?? "",
      details.authors?.join(", ") ?? "",
      details.genres?.join(", ") ?? "",
      details.remarks ?? "",
    ]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" \n ");

    if (!embeddingText) return null;

    try {
      return await embed(embeddingText);
    } catch (error) {
      this.error("failed to embed mirrored manga", error);
      return null;
    }
  }

  private async downloadImage(
    url: string,
    directory: string,
  ): Promise<PreparedImage> {
    const bytes = await this.getImage(url);
    if (bytes.length === 0) {
      throw new Error("Tracker returned an empty image");
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new Error(`Tracker image exceeds ${String(MAX_IMAGE_BYTES)} bytes`);
    }

    const id = crypto.randomUUID();
    const path = `${directory}/${id}.webp`;
    try {
      const webpBytes = await new Bun.Image(bytes)
        .webp({ lossless: true })
        .bytes();
      await Bun.write(path, webpBytes);
      trackerLogger.debug(
        {
          trackerId: this.id,
          imageId: id,
          imageType: directory === MANGA_IMAGES_DIR ? "cover" : "page",
          sourceBytes: bytes.length,
          storedBytes: webpBytes.byteLength,
        },
        "tracker image stored",
      );
    } catch (error) {
      await safeUnlink(path);
      throw new Error("Failed to encode tracker image", { cause: error });
    }

    return { id, path };
  }

  private async loadSourceMangas(
    externalMangaIds: string[],
  ): Promise<TrackerManga[]> {
    if (externalMangaIds.length === 0) return [];

    // Tracker methods receive external IDs while metadata comes from the mirror.
    const trackingRows = await db.query.trackingManga.findMany({
      columns: { id: true, meta: true },
      where: {
        trackingId: this.id,
        id: { in: externalMangaIds },
      },
      with: {
        manga: {
          columns: {
            id: true,
            title: true,
            status: true,
            readingDirection: true,
            description: true,
            authors: true,
            genres: true,
            remarks: true,
            updatedAt: true,
          },
          with: {
            cover: { columns: { id: true } },
          },
        },
        chapterGroups: {
          columns: {
            title: true,
            createdAt: true,
          },
          with: {
            chapterGroup: {
              columns: { sequence: true },
            },
          },
        },
        chapters: {
          columns: {
            trackingChapterGroupTitle: true,
            id: true,
            createdAt: true,
          },
          with: {
            chapter: {
              columns: {
                title: true,
                sequence: true,
              },
            },
          },
        },
      },
    });

    const snapshots = new Map<string, TrackerManga>();
    for (const trackingRow of trackingRows) {
      const local = trackingRow.manga;
      if (!local) continue;

      const groupRows = trackingRow.chapterGroups
        .filter(
          (
            row,
          ): row is typeof row & {
            chapterGroup: NonNullable<typeof row.chapterGroup>;
          } => row.chapterGroup != null,
        )
        .sort(
          (left, right) =>
            left.chapterGroup.sequence - right.chapterGroup.sequence ||
            left.createdAt.getTime() - right.createdAt.getTime(),
        );
      const chapterRows = trackingRow.chapters
        .filter(
          (
            row,
          ): row is typeof row & {
            chapter: NonNullable<typeof row.chapter>;
          } => row.chapter != null,
        )
        .sort(
          (left, right) =>
            left.chapter.sequence - right.chapter.sequence ||
            left.createdAt.getTime() - right.createdAt.getTime(),
        );

      const chapters: TrackerChapterGroup[] = groupRows.map((groupRow) => ({
        title: groupRow.title,
        chapters: [],
      }));
      const chaptersByGroupTitle = new Map(
        chapters.map((group) => [group.title, group.chapters]),
      );
      for (const chapterRow of chapterRows) {
        const group = chaptersByGroupTitle.get(
          chapterRow.trackingChapterGroupTitle,
        );
        if (!group) continue;
        const item: TrackerChapter = {
          id: chapterRow.id,
        };
        if (chapterRow.chapter.title) {
          item.title = chapterRow.chapter.title;
        }
        group.push(item);
      }

      const result: TrackerManga = {
        id: trackingRow.id,
        authors: local.authors ?? [],
        genres: local.genres ?? [],
        chapters,
        updatedAt: local.updatedAt.getTime(),
      };
      if (local.title) result.title = local.title;
      if (local.status != null) {
        result.status = local.status as NonNullable<TrackerManga["status"]>;
      }
      if (local.readingDirection != null) {
        result.readingDirection = local.readingDirection as NonNullable<
          TrackerManga["readingDirection"]
        >;
      }
      if (local.description) result.description = local.description;
      if (local.remarks) result.remarks = local.remarks;
      if (trackingRow.meta != null) result.meta = trackingRow.meta;
      const coverId = local.cover?.id;
      if (coverId) result.cover = `/image/manga/${coverId}.webp`;

      snapshots.set(trackingRow.id, result);
    }

    return externalMangaIds.flatMap((id) => {
      const snapshot = snapshots.get(id);
      return snapshot ? [snapshot] : [];
    });
  }

  private async reconcileManga(
    externalMangaId: string,
    source: NormalizedManga,
    preparedCover: PreparedImage | null,
    embedding: number[] | null,
  ): Promise<{ cover: string[]; chapter: string[] }> {
    const coverFilesToDelete: string[] = [];
    const chapterFilesToDelete: string[] = [];

    // Reconcile manga metadata and mappings atomically.
    await db.transaction(async (tx) => {
      // Lock and validate the active manga job.
      const liveRows = await tx
        .select()
        .from(trackingManga)
        .where(
          and(
            eq(trackingManga.trackingId, this.id),
            eq(trackingManga.id, externalMangaId),
          ),
        )
        .for("update");
      const live = liveRows[0];
      if (!live || live.status !== "tracking") {
        throw new StaleJobError();
      }

      // Lock the mapped manga if it still exists.
      let localMangaId = live.mangaId;
      let localExists = false;
      if (localMangaId) {
        const localRows = await tx
          .select({ id: manga.id })
          .from(manga)
          .where(eq(manga.id, localMangaId))
          .for("update");
        localExists = Boolean(localRows[0]);
      }

      // Upsert the local manga metadata.
      const mangaValues = {
        title: source.title,
        status: source.status,
        readingDirection: source.readingDirection,
        description: source.description,
        authors: source.authors,
        genres: source.genres,
        remarks: source.remarks,
        embedding,
        updatedAt: source.updatedAt,
      };

      if (!localExists) {
        const [created] = await tx
          .insert(manga)
          .values(mangaValues)
          .returning();
        if (!created) throw new Error("Failed to create mirrored manga");
        localMangaId = created.id;
      } else {
        await tx
          .update(manga)
          .set(mangaValues)
          .where(eq(manga.id, localMangaId!));
      }

      // Replace the mirrored cover.
      const oldCoverRows = await tx.query.image.findMany({
        columns: { id: true },
        where: { mangaId: localMangaId! },
      });
      if (oldCoverRows.length > 0) {
        coverFilesToDelete.push(...oldCoverRows.map((row) => row.id));
        await tx.delete(image).where(eq(image.mangaId, localMangaId!));
      }
      if (preparedCover) {
        await tx.insert(image).values({
          id: preparedCover.id,
          mangaId: localMangaId!,
        });
      }

      // Load current tracking and local mappings.
      const [
        currentGroupRows,
        currentChapterRows,
        currentImages,
        allLocalGroups,
      ] = await Promise.all([
        tx.query.trackingChapterGroup.findMany({
          columns: { title: true },
          where: {
            trackingId: this.id,
            trackingMangaId: externalMangaId,
          },
          with: {
            chapterGroup: {
              columns: {
                id: true,
                mangaId: true,
              },
            },
          },
        }),
        tx.query.trackingChapter.findMany({
          columns: {
            id: true,
            trackingChapterGroupTitle: true,
            title: true,
            status: true,
            chapterId: true,
          },
          where: {
            trackingId: this.id,
            trackingMangaId: externalMangaId,
          },
          with: {
            chapter: {
              columns: {
                id: true,
                chapterGroupId: true,
              },
            },
          },
        }),
        tx.query.trackingImage.findMany({
          columns: {
            trackingChapterId: true,
            imageId: true,
          },
          where: {
            trackingId: this.id,
            trackingMangaId: externalMangaId,
          },
        }),
        tx.query.chapterGroup.findMany({
          columns: { id: true },
          where: { mangaId: localMangaId! },
        }),
      ]);

      // Index the current state for reconciliation.
      const currentGroups = currentGroupRows.map((row) => ({
        title: row.title,
        localId: row.chapterGroup?.id ?? null,
        localMangaId: row.chapterGroup?.mangaId ?? null,
      }));
      const currentChapters = currentChapterRows.map((row) => ({
        id: row.id,
        trackingGroupTitle: row.trackingChapterGroupTitle,
        sourceTitle: row.title,
        status: row.status,
        chapterId: row.chapterId,
        localId: row.chapter?.id ?? null,
        localGroupId: row.chapter?.chapterGroupId ?? null,
      }));
      const localGroupIds = new Set(allLocalGroups.map((row) => row.id));

      const currentGroupByTitle = new Map(
        currentGroups.map((row) => [row.title, row]),
      );
      const currentChapterById = new Map(
        currentChapters.map((row) => [row.id, row]),
      );
      const currentImagesByChapter = new Map<
        string,
        { imageId: string | null }[]
      >();
      for (const row of currentImages) {
        const rows = currentImagesByChapter.get(row.trackingChapterId) ?? [];
        rows.push({ imageId: row.imageId });
        currentImagesByChapter.set(row.trackingChapterId, rows);
      }

      // Remove tracked pages and resequence remaining pages.
      const removeTrackedImages = async (
        externalChapterId: string,
        localChapterId: string | null,
      ) => {
        const mappedIds = (currentImagesByChapter.get(externalChapterId) ?? [])
          .map((row) => row.imageId)
          .filter((id): id is string => Boolean(id));

        if (localChapterId && mappedIds.length > 0) {
          const validImages = await tx.query.image.findMany({
            columns: { id: true },
            where: {
              id: { in: mappedIds },
              chapterId: localChapterId,
            },
          });
          const validIds = validImages.map((row) => row.id);
          if (validIds.length > 0) {
            await tx.delete(image).where(inArray(image.id, validIds));
            chapterFilesToDelete.push(...validIds);
          }
        }

        await tx
          .delete(trackingImage)
          .where(
            and(
              eq(trackingImage.trackingId, this.id),
              eq(trackingImage.trackingMangaId, externalMangaId),
              eq(trackingImage.trackingChapterId, externalChapterId),
            ),
          );

        if (localChapterId) {
          const remaining = await tx.query.image.findMany({
            columns: { id: true },
            where: { chapterId: localChapterId },
            orderBy: { sequence: "asc", id: "asc" },
          });
          for (let sequence = 0; sequence < remaining.length; sequence++) {
            await tx
              .update(image)
              .set({ sequence })
              .where(eq(image.id, remaining[sequence]!.id));
          }
        }
      };

      // Reconcile source chapter groups.
      const desiredGroupIds = new Map<string, string>();
      for (const sourceGroup of source.groups) {
        const current = currentGroupByTitle.get(sourceGroup.title);
        let localGroupId =
          current?.localId && current.localMangaId === localMangaId
            ? current.localId
            : null;

        if (!localGroupId) {
          const [created] = await tx
            .insert(chapterGroup)
            .values({
              title: sourceGroup.title,
              mangaId: localMangaId!,
              sequence: sourceGroup.sequence,
            })
            .returning();
          if (!created) {
            throw new Error("Failed to create mirrored chapter group");
          }
          localGroupId = created.id;
          localGroupIds.add(localGroupId);
        } else {
          await tx
            .update(chapterGroup)
            .set({
              title: sourceGroup.title,
              sequence: sourceGroup.sequence,
            })
            .where(eq(chapterGroup.id, localGroupId));
        }

        if (current) {
          await tx
            .update(trackingChapterGroup)
            .set({ chapterGroupId: localGroupId })
            .where(
              and(
                eq(trackingChapterGroup.trackingId, this.id),
                eq(trackingChapterGroup.trackingMangaId, externalMangaId),
                eq(trackingChapterGroup.title, sourceGroup.title),
              ),
            );
        } else {
          await tx.insert(trackingChapterGroup).values({
            trackingId: this.id,
            trackingMangaId: externalMangaId,
            title: sourceGroup.title,
            chapterGroupId: localGroupId,
          });
        }

        desiredGroupIds.set(sourceGroup.title, localGroupId);
      }

      // Reconcile source chapters and job states.
      const desiredChapterIdsByGroup = new Map<string, Set<string>>();
      for (const sourceGroup of source.groups) {
        const localGroupId = desiredGroupIds.get(sourceGroup.title)!;
        const desiredLocalIds = new Set<string>();

        for (const sourceChapter of sourceGroup.chapters) {
          const current = currentChapterById.get(sourceChapter.id);
          const validLocalChapter =
            current?.localId &&
            current.localGroupId &&
            localGroupIds.has(current.localGroupId);
          let localChapterId = validLocalChapter ? current.localId : null;
          const changed =
            !current ||
            !validLocalChapter ||
            current.trackingGroupTitle !== sourceChapter.groupTitle ||
            current.sourceTitle !== sourceChapter.title;

          if (!localChapterId) {
            const [created] = await tx
              .insert(chapter)
              .values({
                title: sourceChapter.title,
                // New tracker chapters stay hidden until their pages download.
                locked: true,
                chapterGroupId: localGroupId,
                sequence: sourceChapter.sequence,
              })
              .returning();
            if (!created) {
              throw new Error("Failed to create mirrored chapter");
            }
            localChapterId = created.id;
          } else {
            await tx
              .update(chapter)
              .set({
                title: sourceChapter.title,
                chapterGroupId: localGroupId,
                sequence: sourceChapter.sequence,
                updatedAt: new Date(),
              })
              .where(eq(chapter.id, localChapterId));
          }

          desiredLocalIds.add(localChapterId);

          if (!current) {
            const now = new Date();
            await tx.insert(trackingChapter).values({
              trackingId: this.id,
              trackingMangaId: externalMangaId,
              id: sourceChapter.id,
              trackingChapterGroupTitle: sourceChapter.groupTitle,
              title: sourceChapter.title,
              chapterId: localChapterId,
              status: "pending",
              pendingAt: now,
            });
          } else {
            const set: Partial<typeof trackingChapter.$inferInsert> = {
              trackingChapterGroupTitle: sourceChapter.groupTitle,
              title: sourceChapter.title,
              chapterId: localChapterId,
            };
            if (
              current.status !== "paused" &&
              (changed || current.status === "tracking")
            ) {
              set.status = "pending";
              set.pendingAt = new Date();
            }

            await tx
              .update(trackingChapter)
              .set(set)
              .where(
                and(
                  eq(trackingChapter.trackingId, this.id),
                  eq(trackingChapter.trackingMangaId, externalMangaId),
                  eq(trackingChapter.id, sourceChapter.id),
                ),
              );
          }
        }

        desiredChapterIdsByGroup.set(sourceGroup.title, desiredLocalIds);
      }

      // Remove chapters missing from the source.
      for (const current of currentChapters) {
        if (source.chaptersById.has(current.id)) continue;

        await removeTrackedImages(current.id, current.localId);
        if (current.localId) {
          const remainingImages = await tx.query.image.findMany({
            columns: { id: true },
            where: { chapterId: current.localId },
          });
          if (remainingImages.length === 0) {
            await tx.delete(chapter).where(eq(chapter.id, current.localId));
          }
        }
        await tx
          .delete(trackingChapter)
          .where(
            and(
              eq(trackingChapter.trackingId, this.id),
              eq(trackingChapter.trackingMangaId, externalMangaId),
              eq(trackingChapter.id, current.id),
            ),
          );
      }

      // Remove groups missing from the source.
      const desiredGroupTitles = new Set(
        source.groups.map((group) => group.title),
      );
      const desiredLocalGroupIds = new Set(desiredGroupIds.values());
      for (const current of currentGroups) {
        if (desiredGroupTitles.has(current.title)) continue;

        await tx
          .delete(trackingChapterGroup)
          .where(
            and(
              eq(trackingChapterGroup.trackingId, this.id),
              eq(trackingChapterGroup.trackingMangaId, externalMangaId),
              eq(trackingChapterGroup.title, current.title),
            ),
          );

        if (
          current.localId &&
          current.localMangaId === localMangaId &&
          !desiredLocalGroupIds.has(current.localId)
        ) {
          const remainingChapters = await tx.query.chapter.findMany({
            columns: { id: true },
            where: { chapterGroupId: current.localId },
          });
          if (remainingChapters.length === 0) {
            await tx
              .delete(chapterGroup)
              .where(eq(chapterGroup.id, current.localId));
          }
        }
      }

      // Move manual content after source content.
      const localGroups = await tx.query.chapterGroup.findMany({
        columns: {
          id: true,
          sequence: true,
          title: true,
        },
        where: { mangaId: localMangaId! },
        orderBy: { sequence: "asc", id: "asc" },
      });
      const manualGroups = localGroups.filter(
        (group) => !desiredLocalGroupIds.has(group.id),
      );
      for (let index = 0; index < manualGroups.length; index++) {
        await tx
          .update(chapterGroup)
          .set({ sequence: source.groups.length + index })
          .where(eq(chapterGroup.id, manualGroups[index]!.id));
      }

      for (const sourceGroup of source.groups) {
        const localGroupId = desiredGroupIds.get(sourceGroup.title)!;
        const desiredLocalIds =
          desiredChapterIdsByGroup.get(sourceGroup.title) ?? new Set();
        const localChapters = await tx.query.chapter.findMany({
          columns: { id: true },
          where: { chapterGroupId: localGroupId },
          orderBy: { sequence: "asc", createdAt: "asc" },
        });
        const manualChapters = localChapters.filter(
          (item) => !desiredLocalIds.has(item.id),
        );
        for (let index = 0; index < manualChapters.length; index++) {
          await tx
            .update(chapter)
            .set({
              sequence: sourceGroup.chapters.length + index,
            })
            .where(eq(chapter.id, manualChapters[index]!.id));
        }
      }

      // Complete the manga job.
      await tx
        .update(trackingManga)
        .set({
          mangaId: localMangaId,
          meta: source.meta,
          status: "completed",
          completedAt: new Date(),
          failedCount: null,
          failedAt: null,
          failedReason: null,
        })
        .where(
          and(
            eq(trackingManga.trackingId, this.id),
            eq(trackingManga.id, externalMangaId),
            eq(trackingManga.status, "tracking"),
          ),
        );
    });

    return {
      cover: coverFilesToDelete.filter((id) => id !== preparedCover?.id),
      chapter: chapterFilesToDelete,
    };
  }

  private async reconcileChapter(
    externalMangaId: string,
    externalChapterId: string,
    urls: string[],
  ): Promise<string[]> {
    const filesToDelete: string[] = [];

    await db.transaction(async (tx) => {
      // Lock and validate the active chapter job.
      const liveRows = await tx
        .select({
          status: trackingChapter.status,
          chapterId: trackingChapter.chapterId,
          mangaStatus: trackingManga.status,
        })
        .from(trackingChapter)
        .innerJoin(
          trackingManga,
          and(
            eq(trackingManga.trackingId, trackingChapter.trackingId),
            eq(trackingManga.id, trackingChapter.trackingMangaId),
          ),
        )
        .innerJoin(chapter, eq(chapter.id, trackingChapter.chapterId))
        .where(
          and(
            eq(trackingChapter.trackingId, this.id),
            eq(trackingChapter.trackingMangaId, externalMangaId),
            eq(trackingChapter.id, externalChapterId),
          ),
        )
        .for("update");
      const live = liveRows[0];
      if (
        !live ||
        live.status !== "tracking" ||
        live.mangaStatus !== "completed" ||
        !live.chapterId
      ) {
        throw new StaleJobError();
      }

      // Keep the chapter hidden during reconciliation.
      await tx
        .update(chapter)
        .set({ locked: true, updatedAt: new Date() })
        .where(eq(chapter.id, live.chapterId));

      // Load current tracked pages.
      const currentImageRows = await tx.query.trackingImage.findMany({
        columns: {
          sequence: true,
          url: true,
          imageId: true,
          status: true,
        },
        where: {
          trackingId: this.id,
          trackingMangaId: externalMangaId,
          trackingChapterId: externalChapterId,
        },
        with: {
          image: {
            columns: {
              id: true,
              chapterId: true,
            },
          },
        },
      });
      const currentRows = currentImageRows.map((row) => ({
        sequence: row.sequence,
        url: row.url,
        imageId: row.imageId,
        status: row.status,
        localImageId: row.image?.id ?? null,
        localChapterId: row.image?.chapterId ?? null,
      }));
      const currentBySequence = new Map(
        currentRows.map((row) => [row.sequence, row]),
      );
      let hasIncompleteImages = false;

      // Reconcile source pages by sequence and URL.
      for (let sequence = 0; sequence < urls.length; sequence++) {
        const url = urls[sequence]!;
        const current = currentBySequence.get(sequence);
        if (!current) {
          hasIncompleteImages = true;
          await tx.insert(trackingImage).values({
            trackingId: this.id,
            trackingMangaId: externalMangaId,
            trackingChapterId: externalChapterId,
            sequence,
            url,
            status: "pending",
            pendingAt: new Date(),
          });
          continue;
        }

        const validLocalImage =
          current.localImageId != null &&
          current.localChapterId === live.chapterId;
        if (current.url === url && validLocalImage) {
          await tx
            .update(image)
            .set({ sequence })
            .where(eq(image.id, current.localImageId!));
          if (current.status !== "paused") {
            await tx
              .update(trackingImage)
              .set({
                status: "completed",
                completedAt: new Date(),
                failedCount: null,
                failedAt: null,
                failedReason: null,
              })
              .where(
                and(
                  eq(trackingImage.trackingId, this.id),
                  eq(trackingImage.trackingMangaId, externalMangaId),
                  eq(trackingImage.trackingChapterId, externalChapterId),
                  eq(trackingImage.sequence, sequence),
                ),
              );
          } else {
            hasIncompleteImages = true;
          }
          continue;
        }

        hasIncompleteImages = true;
        if (validLocalImage) {
          await tx.delete(image).where(eq(image.id, current.localImageId!));
          filesToDelete.push(current.localImageId!);
        }

        const set: Partial<typeof trackingImage.$inferInsert> = {
          url,
          imageId: null,
        };
        if (current.status !== "paused") {
          set.status = "pending";
          set.pendingAt = new Date();
        }
        await tx
          .update(trackingImage)
          .set(set)
          .where(
            and(
              eq(trackingImage.trackingId, this.id),
              eq(trackingImage.trackingMangaId, externalMangaId),
              eq(trackingImage.trackingChapterId, externalChapterId),
              eq(trackingImage.sequence, sequence),
            ),
          );
      }

      // Remove pages missing from the source.
      for (const current of currentRows) {
        if (current.sequence < urls.length) continue;
        if (current.localImageId && current.localChapterId === live.chapterId) {
          await tx.delete(image).where(eq(image.id, current.localImageId));
          filesToDelete.push(current.localImageId);
        }
        await tx
          .delete(trackingImage)
          .where(
            and(
              eq(trackingImage.trackingId, this.id),
              eq(trackingImage.trackingMangaId, externalMangaId),
              eq(trackingImage.trackingChapterId, externalChapterId),
              eq(trackingImage.sequence, current.sequence),
            ),
          );
      }

      // Move manual pages after source pages.
      const mappedRows = await tx.query.trackingImage.findMany({
        columns: { imageId: true },
        where: {
          trackingId: this.id,
          trackingMangaId: externalMangaId,
          trackingChapterId: externalChapterId,
        },
      });
      const mappedIds = new Set(
        mappedRows
          .map((row) => row.imageId)
          .filter((id): id is string => Boolean(id)),
      );
      const localImages = await tx.query.image.findMany({
        columns: { id: true },
        where: { chapterId: live.chapterId },
        orderBy: { sequence: "asc", id: "asc" },
      });
      const manualImages = localImages.filter(
        (item) => !mappedIds.has(item.id),
      );
      for (let index = 0; index < manualImages.length; index++) {
        await tx
          .update(image)
          .set({ sequence: urls.length + index })
          .where(eq(image.id, manualImages[index]!.id));
      }

      // Update publication state and complete the job.
      await tx
        .update(chapter)
        .set({
          locked: hasIncompleteImages,
          updatedAt: new Date(),
        })
        .where(eq(chapter.id, live.chapterId));
      await tx
        .update(trackingChapter)
        .set({
          status: "completed",
          completedAt: new Date(),
          failedCount: null,
          failedAt: null,
          failedReason: null,
        })
        .where(
          and(
            eq(trackingChapter.trackingId, this.id),
            eq(trackingChapter.trackingMangaId, externalMangaId),
            eq(trackingChapter.id, externalChapterId),
            eq(trackingChapter.status, "tracking"),
          ),
        );
    });

    return filesToDelete;
  }

  private async reconcileImage(
    externalMangaId: string,
    externalChapterId: string,
    sequence: number,
    expectedUrl: string,
    prepared: PreparedImage,
  ): Promise<string | null> {
    let oldImageId: string | null = null;

    // Reconcile the prepared image atomically.
    await db.transaction(async (tx) => {
      // Lock and validate the active image job.
      const liveRows = await tx
        .select({
          status: trackingImage.status,
          url: trackingImage.url,
          imageId: trackingImage.imageId,
          mangaStatus: trackingManga.status,
          chapterStatus: trackingChapter.status,
          chapterId: trackingChapter.chapterId,
        })
        .from(trackingImage)
        .innerJoin(
          trackingManga,
          and(
            eq(trackingManga.trackingId, trackingImage.trackingId),
            eq(trackingManga.id, trackingImage.trackingMangaId),
          ),
        )
        .innerJoin(
          trackingChapter,
          and(
            eq(trackingChapter.trackingId, trackingImage.trackingId),
            eq(trackingChapter.trackingMangaId, trackingImage.trackingMangaId),
            eq(trackingChapter.id, trackingImage.trackingChapterId),
          ),
        )
        .innerJoin(chapter, eq(chapter.id, trackingChapter.chapterId))
        .where(
          and(
            eq(trackingImage.trackingId, this.id),
            eq(trackingImage.trackingMangaId, externalMangaId),
            eq(trackingImage.trackingChapterId, externalChapterId),
            eq(trackingImage.sequence, sequence),
          ),
        )
        .for("update");
      const live = liveRows[0];
      if (
        !live ||
        live.status !== "tracking" ||
        live.url !== expectedUrl ||
        live.mangaStatus !== "completed" ||
        live.chapterStatus !== "completed" ||
        !live.chapterId
      ) {
        throw new StaleJobError();
      }

      // Remove the previous mapped image.
      if (live.imageId) {
        const oldRow = await tx.query.image.findFirst({
          columns: { id: true },
          where: {
            id: live.imageId,
            chapterId: live.chapterId,
          },
        });
        if (oldRow) {
          await tx.delete(image).where(eq(image.id, live.imageId));
          oldImageId = live.imageId;
        }
      }

      // Store the prepared image and complete the job.
      await tx.insert(image).values({
        id: prepared.id,
        chapterId: live.chapterId,
        sequence,
      });
      await tx
        .update(trackingImage)
        .set({
          imageId: prepared.id,
          status: "completed",
          completedAt: new Date(),
          failedCount: null,
          failedAt: null,
          failedReason: null,
        })
        .where(
          and(
            eq(trackingImage.trackingId, this.id),
            eq(trackingImage.trackingMangaId, externalMangaId),
            eq(trackingImage.trackingChapterId, externalChapterId),
            eq(trackingImage.sequence, sequence),
            eq(trackingImage.status, "tracking"),
          ),
        );

      // Update the chapter publication state.
      const incompleteImage = await tx.query.trackingImage.findFirst({
        columns: { sequence: true },
        where: {
          trackingId: this.id,
          trackingMangaId: externalMangaId,
          trackingChapterId: externalChapterId,
          status: { ne: "completed" },
        },
      });

      await tx
        .update(chapter)
        .set({
          locked: Boolean(incompleteImage),
          updatedAt: new Date(),
        })
        .where(eq(chapter.id, live.chapterId));
    });

    return oldImageId;
  }

  private async requeueParentManga(externalMangaId: string): Promise<void> {
    await db
      .update(trackingManga)
      .set({ status: "pending", pendingAt: new Date() })
      .where(
        and(
          eq(trackingManga.trackingId, this.id),
          eq(trackingManga.id, externalMangaId),
          ne(trackingManga.status, "paused"),
        ),
      );
  }

  private error(
    message: string,
    error: unknown,
    details: Record<string, unknown> = {},
  ): void {
    trackerLogger.error(
      {
        ...details,
        trackerId: this.id,
        err: error,
      },
      message,
    );
  }
}
