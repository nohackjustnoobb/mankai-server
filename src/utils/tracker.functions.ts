import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, max, sql } from "drizzle-orm";

import {
  manga,
  trackingChapter,
  trackingImage,
  trackingManga,
  trackingMangaRequest,
} from "#/db/schema";
import db from "#/lib/db.server.ts";
import trackerManager, { type TrackerInfo } from "#/trackers/manager.server";
import { useAppSession } from "#/utils/session.server";

export type { TrackerInfo };

export type TrackerJobStatus =
  "pending" | "tracking" | "paused" | "completed" | "failed";

export type TrackerState =
  "queued" | "importing" | "retrying" | "upToDate" | "paused";

export type TrackerStateInput = {
  mangaStatus: TrackerJobStatus;
  hasFailedDescendant: boolean;
  hasIncompleteDescendant: boolean;
};

export function deriveTrackerState({
  mangaStatus,
  hasFailedDescendant,
  hasIncompleteDescendant,
}: TrackerStateInput): TrackerState {
  if (mangaStatus === "paused") return "paused";

  if (mangaStatus === "failed" || hasFailedDescendant) {
    return "retrying";
  }

  if (mangaStatus === "pending") return "queued";

  if (mangaStatus !== "completed" || hasIncompleteDescendant) {
    return "importing";
  }

  return "upToDate";
}

export type TrackerSource = TrackerInfo;

export type TrackerProgress = {
  total: number;
  completed: number;
};

export type TrackerSummary = {
  trackingId: string;
  trackerName: string;
  trackerDescription: string;
  trackingMangaId: string;
  localMangaId: string | null;
  localMangaTitle: string | null;
  state: TrackerState;
  chapters: TrackerProgress;
  images: TrackerProgress;
  failedReason: string | null;
  failedAt: Date | null;
  lastActivityAt: Date;
  requestedAt: Date | null;
  isSubscribed: boolean;
};

export type GetMangaTrackingInput = {
  mangaId: string;
};

export type TrackingMangaInput = {
  trackingId: string;
  trackingMangaId: string;
};

export type TrackingMutationResult =
  { ok: true; changed: boolean } | { ok: false; error: string };

const chapterStats = db
  .select({
    trackingId: trackingChapter.trackingId,
    trackingMangaId: trackingChapter.trackingMangaId,
    total: count().as("chapter_total"),
    completed: sql<number>`
      count(*) filter (where ${trackingChapter.status} = 'completed')
    `
      .mapWith(Number)
      .as("chapter_completed"),
    failed: sql<number>`
      count(*) filter (where ${trackingChapter.status} = 'failed')
    `
      .mapWith(Number)
      .as("chapter_failed"),
    incomplete: sql<number>`
      count(*) filter (where ${trackingChapter.status} <> 'completed')
    `
      .mapWith(Number)
      .as("chapter_incomplete"),
    failedAt: sql<Date | null>`
      max(${trackingChapter.failedAt})
        filter (where ${trackingChapter.status} = 'failed')
    `
      .mapWith(trackingChapter.failedAt)
      .as("chapter_failed_at"),
    failedReason: sql<string | null>`
      (
        array_agg(
          ${trackingChapter.failedReason}
          order by ${trackingChapter.failedAt} desc nulls last
        ) filter (where ${trackingChapter.status} = 'failed')
      )[1]
    `.as("chapter_failed_reason"),
    lastActivityAt: max(trackingChapter.updatedAt).as(
      "chapter_last_activity_at",
    ),
  })
  .from(trackingChapter)
  .groupBy(trackingChapter.trackingId, trackingChapter.trackingMangaId)
  .as("tracking_chapter_stats");

const imageStats = db
  .select({
    trackingId: trackingImage.trackingId,
    trackingMangaId: trackingImage.trackingMangaId,
    total: count().as("image_total"),
    completed: sql<number>`
      count(*) filter (where ${trackingImage.status} = 'completed')
    `
      .mapWith(Number)
      .as("image_completed"),
    failed: sql<number>`
      count(*) filter (where ${trackingImage.status} = 'failed')
    `
      .mapWith(Number)
      .as("image_failed"),
    incomplete: sql<number>`
      count(*) filter (where ${trackingImage.status} <> 'completed')
    `
      .mapWith(Number)
      .as("image_incomplete"),
    failedAt: sql<Date | null>`
      max(${trackingImage.failedAt})
        filter (where ${trackingImage.status} = 'failed')
    `
      .mapWith(trackingImage.failedAt)
      .as("image_failed_at"),
    failedReason: sql<string | null>`
      (
        array_agg(
          ${trackingImage.failedReason}
          order by ${trackingImage.failedAt} desc nulls last
        ) filter (where ${trackingImage.status} = 'failed')
      )[1]
    `.as("image_failed_reason"),
    lastActivityAt: max(trackingImage.updatedAt).as("image_last_activity_at"),
  })
  .from(trackingImage)
  .groupBy(trackingImage.trackingId, trackingImage.trackingMangaId)
  .as("tracking_image_stats");

const summarySelection = {
  trackingId: trackingManga.trackingId,
  trackingMangaId: trackingManga.id,
  localMangaId: trackingManga.mangaId,
  localMangaTitle: manga.title,
  mangaStatus: trackingManga.status,
  mangaFailedAt: trackingManga.failedAt,
  mangaFailedReason: trackingManga.failedReason,
  mangaLastActivityAt: trackingManga.updatedAt,
  requestedAt: trackingMangaRequest.createdAt,
  chapterTotal: chapterStats.total,
  chapterCompleted: chapterStats.completed,
  chapterFailed: chapterStats.failed,
  chapterIncomplete: chapterStats.incomplete,
  chapterFailedAt: chapterStats.failedAt,
  chapterFailedReason: chapterStats.failedReason,
  chapterLastActivityAt: chapterStats.lastActivityAt,
  imageTotal: imageStats.total,
  imageCompleted: imageStats.completed,
  imageFailed: imageStats.failed,
  imageIncomplete: imageStats.incomplete,
  imageFailedAt: imageStats.failedAt,
  imageFailedReason: imageStats.failedReason,
  imageLastActivityAt: imageStats.lastActivityAt,
};

type RawSummaryRow = {
  trackingId: string;
  trackingMangaId: string;
  localMangaId: string | null;
  localMangaTitle: string | null;
  mangaStatus: TrackerJobStatus;
  mangaFailedAt: Date | null;
  mangaFailedReason: string | null;
  mangaLastActivityAt: Date;
  requestedAt: Date | null;
  chapterTotal: number | null;
  chapterCompleted: number | null;
  chapterFailed: number | null;
  chapterIncomplete: number | null;
  chapterFailedAt: Date | null;
  chapterFailedReason: string | null;
  chapterLastActivityAt: Date | null;
  imageTotal: number | null;
  imageCompleted: number | null;
  imageFailed: number | null;
  imageIncomplete: number | null;
  imageFailedAt: Date | null;
  imageFailedReason: string | null;
  imageLastActivityAt: Date | null;
};

type Failure = {
  reason: string | null;
  at: Date | null;
};

function newestDate(first: Date, ...values: (Date | null | undefined)[]): Date {
  let newest = first;
  for (const value of values) {
    if (value && (!newest || value.getTime() > newest.getTime())) {
      newest = value;
    }
  }
  return newest;
}

function newestFailure(failures: Failure[]): Failure | null {
  let newest: Failure | null = null;

  for (const failure of failures) {
    if (!failure.at && !failure.reason) continue;
    if (!newest || (failure.at?.getTime() ?? 0) > (newest.at?.getTime() ?? 0)) {
      newest = failure;
    }
  }

  return newest;
}

function trackerInfoById(): Map<string, TrackerInfo> {
  return new Map(
    trackerManager.getTrackerInfo().map((tracker) => [tracker.id, tracker]),
  );
}

function toTrackerSummary(
  row: RawSummaryRow,
  trackerInfo: ReadonlyMap<string, TrackerInfo>,
): TrackerSummary {
  const tracker = trackerInfo.get(row.trackingId);
  const failed = newestFailure([
    ...(row.mangaStatus === "failed"
      ? [{ reason: row.mangaFailedReason, at: row.mangaFailedAt }]
      : []),
    { reason: row.chapterFailedReason, at: row.chapterFailedAt },
    { reason: row.imageFailedReason, at: row.imageFailedAt },
  ]);

  return {
    trackingId: row.trackingId,
    trackerName: tracker?.name ?? row.trackingId,
    trackerDescription:
      tracker?.description ?? "This tracker source is no longer available.",
    trackingMangaId: row.trackingMangaId,
    localMangaId: row.localMangaId,
    localMangaTitle: row.localMangaTitle,
    state: deriveTrackerState({
      mangaStatus: row.mangaStatus,
      hasFailedDescendant:
        (row.chapterFailed ?? 0) > 0 || (row.imageFailed ?? 0) > 0,
      hasIncompleteDescendant:
        (row.chapterIncomplete ?? 0) > 0 || (row.imageIncomplete ?? 0) > 0,
    }),
    chapters: {
      total: row.chapterTotal ?? 0,
      completed: row.chapterCompleted ?? 0,
    },
    images: {
      total: row.imageTotal ?? 0,
      completed: row.imageCompleted ?? 0,
    },
    failedReason: failed?.reason ?? null,
    failedAt: failed?.at ?? null,
    lastActivityAt: newestDate(
      row.mangaLastActivityAt,
      row.chapterLastActivityAt,
      row.imageLastActivityAt,
    ),
    requestedAt: row.requestedAt,
    isSubscribed: row.requestedAt != null,
  };
}

async function requireUserId(): Promise<string> {
  const session = await useAppSession();
  const userId = session.data.userId;
  if (!userId) throw new Error("Unauthorized");

  const activeUser = await db.query.user.findFirst({
    where: { id: userId, isActive: true },
    columns: { id: true },
  });
  if (!activeUser) {
    await session.clear();
    throw new Error("Unauthorized");
  }

  return activeUser.id;
}

export const getTrackerSourcesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<TrackerSource[]> => {
    await requireUserId();
    return trackerManager.getTrackerInfo();
  },
);

export const fetchTrackingRequestsFn = createServerFn({
  method: "GET",
}).handler(async (): Promise<TrackerSummary[]> => {
  const userId = await requireUserId();

  const rows = await db
    .select(summarySelection)
    .from(trackingMangaRequest)
    .innerJoin(
      trackingManga,
      and(
        eq(trackingManga.trackingId, trackingMangaRequest.trackingId),
        eq(trackingManga.id, trackingMangaRequest.trackingMangaId),
      ),
    )
    .leftJoin(manga, eq(manga.id, trackingManga.mangaId))
    .leftJoin(
      chapterStats,
      and(
        eq(chapterStats.trackingId, trackingManga.trackingId),
        eq(chapterStats.trackingMangaId, trackingManga.id),
      ),
    )
    .leftJoin(
      imageStats,
      and(
        eq(imageStats.trackingId, trackingManga.trackingId),
        eq(imageStats.trackingMangaId, trackingManga.id),
      ),
    )
    .where(eq(trackingMangaRequest.userId, userId))
    .orderBy(desc(trackingMangaRequest.createdAt));

  const trackerInfo = trackerInfoById();
  return rows.map((row) => toTrackerSummary(row as RawSummaryRow, trackerInfo));
});

export const getMangaTrackingFn = createServerFn({ method: "GET" })
  .validator((data: GetMangaTrackingInput) => data)
  .handler(async ({ data }): Promise<TrackerSummary | null> => {
    const userId = await requireUserId();
    const mangaId = data.mangaId.trim();
    if (!mangaId) return null;

    const [row] = await db
      .select(summarySelection)
      .from(trackingManga)
      .leftJoin(
        trackingMangaRequest,
        and(
          eq(trackingMangaRequest.trackingId, trackingManga.trackingId),
          eq(trackingMangaRequest.trackingMangaId, trackingManga.id),
          eq(trackingMangaRequest.userId, userId),
        ),
      )
      .leftJoin(manga, eq(manga.id, trackingManga.mangaId))
      .leftJoin(
        chapterStats,
        and(
          eq(chapterStats.trackingId, trackingManga.trackingId),
          eq(chapterStats.trackingMangaId, trackingManga.id),
        ),
      )
      .leftJoin(
        imageStats,
        and(
          eq(imageStats.trackingId, trackingManga.trackingId),
          eq(imageStats.trackingMangaId, trackingManga.id),
        ),
      )
      .where(eq(trackingManga.mangaId, mangaId))
      .limit(1);

    return row
      ? toTrackerSummary(row as RawSummaryRow, trackerInfoById())
      : null;
  });

export const addTrackingMangaFn = createServerFn({ method: "POST" })
  .validator((data: TrackingMangaInput) => data)
  .handler(async ({ data }): Promise<TrackingMutationResult> => {
    let userId: string;
    try {
      userId = await requireUserId();
    } catch {
      return { ok: false, error: "Unauthorized" };
    }

    const target = trackerManager.resolveTrackingTarget(
      data.trackingId,
      data.trackingMangaId,
    );
    if (!target.ok) return target;

    try {
      const changed = await trackerManager.addTrackingManga(
        userId,
        target.trackingId,
        target.mangaId,
      );
      return { ok: true, changed };
    } catch (error) {
      console.error("Failed to add tracking manga:", error);
      return { ok: false, error: "Could not track manga. Please try again." };
    }
  });

export const removeTrackingMangaFn = createServerFn({ method: "POST" })
  .validator((data: TrackingMangaInput) => data)
  .handler(async ({ data }): Promise<TrackingMutationResult> => {
    let userId: string;
    try {
      userId = await requireUserId();
    } catch {
      return { ok: false, error: "Unauthorized" };
    }

    // Permit cleanup of a durable request if its source was removed from the
    // runtime registry after the user subscribed.
    const target = trackerManager.resolveTrackingTarget(
      data.trackingId,
      data.trackingMangaId,
      true,
    );
    if (!target.ok) return target;

    try {
      const changed = await trackerManager.removeTrackingManga(
        userId,
        target.trackingId,
        target.mangaId,
      );
      return { ok: true, changed };
    } catch (error) {
      console.error("Failed to remove tracking manga:", error);
      return {
        ok: false,
        error: "Could not stop tracking manga. Please try again.",
      };
    }
  });
