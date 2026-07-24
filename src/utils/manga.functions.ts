import { createServerFn } from "@tanstack/react-start";
import { unlink } from "node:fs/promises";
import {
  and,
  arrayContains,
  cosineDistance,
  desc,
  eq,
  inArray,
} from "drizzle-orm";

import db from "#/lib/db.server";
import { chapter, chapterGroup, image, manga, user } from "#/db/schema";
import { useAppSession } from "#/utils/session.server";
import { embed } from "#/utils/embedding.server";
import {
  CHAPTER_IMAGES_DIR,
  MANGA_IMAGES_DIR,
  MAX_IMAGE_BYTES,
} from "#/utils/image.server.ts";
import {
  Genre,
  Status,
  ReadingDirection,
  type CreateGenre,
  type CreateStatus,
} from "#/utils/types";

// ---------- Upsert Manga ----------

export type UpsertMangaInput = {
  id?: string;
  title: string;
  description?: string;
  authors?: string[];
  genres?: CreateGenre[];
  status?: CreateStatus;
  readingDirection?: ReadingDirection;
  remarks?: string;
  cover?: string;
  removeCover?: boolean;
};

export type UpsertMangaResult =
  { ok: true; id: string } | { ok: false; error: string };

export const upsertMangaFn = createServerFn({ method: "POST" })
  .validator((data: UpsertMangaInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      return { ok: false, error: "Unauthorized" };
    }

    if (data.id) {
      const [existing, currentUser] = await Promise.all([
        db.query.manga.findFirst({
          where: { id: data.id },
          columns: { createdBy: true },
        }),
        db.query.user.findFirst({
          where: { id: userId, isActive: true },
          columns: { role: true },
        }),
      ]);

      if (existing) {
        const isCreator = existing.createdBy === userId;
        const isAdmin = currentUser?.role === "admin";
        if (!isCreator && !isAdmin) {
          return {
            ok: false,
            error:
              "Forbidden: only the creator or an admin can edit this manga",
          };
        }
      }
    }

    const title = data.title?.trim();
    if (!title) {
      return { ok: false, error: "Title is required" };
    }

    const description = data.description?.trim() || null;
    const authors =
      data.authors && data.authors.length > 0 ? data.authors : null;
    const genres = data.genres && data.genres.length > 0 ? data.genres : null;
    const status = data.status ?? null;
    const readingDirection = data.readingDirection ?? null;
    const remarks = data.remarks?.trim() || null;

    let coverBytes: Buffer | null = null;
    const coverBase64 = data.cover?.trim();
    if (coverBase64) {
      try {
        coverBytes = Buffer.from(coverBase64, "base64");
      } catch {
        return {
          ok: false,
          error: "Invalid cover image data",
        };
      }
      if (coverBytes.length > MAX_IMAGE_BYTES) {
        return {
          ok: false,
          error: `Cover image must be smaller than ${
            MAX_IMAGE_BYTES / (1024 * 1024)
          } MB`,
        };
      }
    }

    const embeddingText = [
      title,
      description ?? "",
      authors?.join(", ") ?? "",
      genres?.join(", ") ?? "",
      remarks ?? "",
    ]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" \n ");

    let embedding: number[] | null = null;
    if (embeddingText) {
      try {
        embedding = await embed(embeddingText);
      } catch (err) {
        console.error("Failed to embed manga:", err);
      }
    }

    let coverImageId: string | null = null;
    let coverFilePath: string | null = null;
    if (coverBytes) {
      coverImageId = crypto.randomUUID();
      coverFilePath = `${MANGA_IMAGES_DIR}/${coverImageId}.webp`;
      try {
        const webpBytes = await new Bun.Image(coverBytes)
          .webp({ lossless: true })
          .bytes();
        await Bun.write(coverFilePath, webpBytes);
      } catch (err) {
        console.error("Failed to encode/write manga cover:", err);
        return {
          ok: false,
          error: "Failed to save cover image",
        };
      }
    }

    let resultId: string | null = null;
    let oldCoverImageId: string | null = null;
    try {
      [resultId, oldCoverImageId] = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(manga)
          .values({
            id: data.id,
            title,
            description,
            authors,
            genres,
            status,
            readingDirection,
            remarks,
            embedding,
            createdBy: userId,
          })
          .onConflictDoUpdate({
            target: manga.id,
            set: {
              title,
              description,
              authors,
              genres,
              status,
              readingDirection,
              remarks,
              embedding,
              updatedAt: new Date(),
            },
          })
          .returning();

        if (!row) throw new Error("Manga upsert returned no row");

        let replacedCoverId: string | null = null;
        if (coverImageId) {
          const deleted = await tx
            .delete(image)
            .where(eq(image.mangaId, row.id))
            .returning();
          replacedCoverId = deleted[0]?.id ?? null;

          await tx.insert(image).values({
            id: coverImageId,
            mangaId: row.id,
          });
        } else if (data.removeCover) {
          const deleted = await tx
            .delete(image)
            .where(eq(image.mangaId, row.id))
            .returning();
          replacedCoverId = deleted[0]?.id ?? null;
        }

        return [row.id, replacedCoverId] as [string, string | null];
      });
    } catch (err) {
      console.error("Failed to upsert manga:", err);

      if (coverFilePath) {
        try {
          await unlink(coverFilePath);
        } catch {}
      }

      return {
        ok: false,
        error: "Failed to save manga",
      };
    }

    if (oldCoverImageId) {
      const oldCoverFilePath = `${MANGA_IMAGES_DIR}/${oldCoverImageId}.webp`;
      try {
        await unlink(oldCoverFilePath);
      } catch {}
    }

    return { ok: true, id: resultId };
  });

// ---------- Fetch Mangas ----------

export type FetchMangaInput = {
  status?: Status;
  genre?: Genre;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type MangaListItem = {
  id: string;
  title: string | null;
  description: string | null;
  authors: string[] | null;
  genres: Genre[] | null;
  status: number | null;
  readingDirection: number | null;
  coverImageId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FetchMangaResult = {
  items: MangaListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

export const fetchMangasFn = createServerFn({ method: "GET" })
  .validator((data: FetchMangaInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const page = Math.max(1, data.page ?? 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, data.pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const status = data.status ?? Status.Any;
    const genre = data.genre ?? Genre.All;
    const search = data.search?.trim() || undefined;

    let searchEmbedding: number[] | null = null;
    if (search) {
      try {
        searchEmbedding = await embed(search);
      } catch (err) {
        console.error("Failed to embed search query:", err);
      }
    }

    const conditions = [];
    if (status !== Status.Any) conditions.push(eq(manga.status, status));
    if (genre !== Genre.All)
      conditions.push(arrayContains(manga.genres, [genre]));
    const whereSql = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, total] = await Promise.all([
      db.query.manga.findMany({
        where: {
          status: status !== Status.Any ? status : undefined,
          genres: genre !== Genre.All ? { arrayContains: [genre] } : undefined,
        },
        with: { cover: true },
        orderBy: searchEmbedding
          ? (t, { asc }) => asc(cosineDistance(t.embedding, searchEmbedding!))
          : { createdAt: "desc" },
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      db.$count(manga, whereSql),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        authors: row.authors,
        genres: row.genres,
        status: row.status,
        readingDirection: row.readingDirection,
        coverImageId: row.cover?.id ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      total,
      page,
      pageSize,
      totalPages,
    };
  });

// ---------- Get Manga by ID ----------

export type GetMangaInput = {
  id: string;
};

export type MangaCreator = Pick<
  typeof user.$inferSelect,
  "id" | "email" | "role"
>;

export type MangaChapter = typeof chapter.$inferSelect;

export type MangaChapterGroup = typeof chapterGroup.$inferSelect & {
  chapters: MangaChapter[];
};

export type GetMangaResult =
  | (Omit<typeof manga.$inferSelect, "embedding" | "createdBy"> & {
      coverImageId: string | null;
      creator: MangaCreator | null;
      chapterGroups: MangaChapterGroup[];
    })
  | null;

export const getMangaFn = createServerFn({ method: "GET" })
  .validator((data: GetMangaInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const row = await db.query.manga.findFirst({
      where: { id: data.id },
      columns: { embedding: false },
      with: {
        cover: { columns: { id: true } },
        creator: { columns: { id: true, email: true, role: true } },
        chapterGroups: {
          orderBy: { sequence: "asc" },
          with: {
            chapters: {
              orderBy: { sequence: "asc" },
            },
          },
        },
      },
    });

    if (!row) return null;

    const { cover, createdBy, ...rest } = row;

    return {
      ...rest,
      coverImageId: cover?.id ?? null,
    };
  });

// ---------- Delete Manga ----------

export type DeleteMangaInput = {
  id: string;
};

export type DeleteMangaResult =
  { ok: true; id: string } | { ok: false; error: string };

export const deleteMangaFn = createServerFn({ method: "POST" })
  .validator((data: DeleteMangaInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      return { ok: false, error: "Unauthorized" };
    }

    const [existing, currentUser] = await Promise.all([
      db.query.manga.findFirst({
        where: { id: data.id },
        columns: { createdBy: true },
        with: {
          cover: { columns: { id: true } },
          chapterGroups: {
            columns: { id: true },
            with: {
              chapters: {
                columns: { id: true },
                with: {
                  images: { columns: { id: true } },
                },
              },
            },
          },
        },
      }),
      db.query.user.findFirst({
        where: { id: userId, isActive: true },
        columns: { role: true },
      }),
    ]);

    if (!existing) {
      return { ok: false, error: "Manga not found" };
    }

    const isCreator = existing.createdBy === userId;
    const isAdmin = currentUser?.role === "admin";
    if (!isCreator && !isAdmin) {
      return {
        ok: false,
        error: "Forbidden: only the creator or an admin can delete this manga",
      };
    }

    const coverImageId = existing.cover?.id ?? null;
    const chapterImageIds = existing.chapterGroups.flatMap((cg) =>
      cg.chapters.flatMap((c) => c.images.map((img) => img.id)),
    );
    const imageIdsToDelete = [
      ...(coverImageId ? [coverImageId] : []),
      ...chapterImageIds,
    ];

    try {
      await db.transaction(async (tx) => {
        if (imageIdsToDelete.length > 0) {
          await tx.delete(image).where(inArray(image.id, imageIdsToDelete));
        }

        await tx.delete(manga).where(eq(manga.id, data.id));
      });
    } catch (err) {
      console.error("Failed to delete manga:", err);
      return { ok: false, error: "Failed to delete manga" };
    }

    // Best-effort cleanup of image files on disk.
    if (coverImageId) {
      try {
        await unlink(`${MANGA_IMAGES_DIR}/${coverImageId}.webp`);
      } catch {}
    }

    for (const chapterImageId of chapterImageIds) {
      try {
        await unlink(`${CHAPTER_IMAGES_DIR}/${chapterImageId}.webp`);
      } catch {}
    }

    return { ok: true, id: data.id };
  });

// ---------- Upsert Chapter Group ----------

export type UpsertChapterGroupInput = {
  id?: string;
  mangaId: string;
  title?: string;
};

export type UpsertChapterGroupResult =
  { ok: true; id: string } | { ok: false; error: string };

export const upsertChapterGroupFn = createServerFn({ method: "POST" })
  .validator((data: UpsertChapterGroupInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      return { ok: false, error: "Unauthorized" };
    }

    let effectiveMangaId = data.mangaId;
    let mangaCreatedBy: string | null | undefined;

    if (data.id) {
      const existingGroup = await db.query.chapterGroup.findFirst({
        where: { id: data.id },
        with: { manga: { columns: { createdBy: true } } },
      });
      if (existingGroup) {
        effectiveMangaId = existingGroup.mangaId;
        mangaCreatedBy = existingGroup.manga?.createdBy;
      }
    }

    if (!mangaCreatedBy) {
      const mangaRow = await db.query.manga.findFirst({
        where: { id: effectiveMangaId },
        columns: { createdBy: true },
      });
      if (!mangaRow) {
        return { ok: false, error: "Manga not found" };
      }
      mangaCreatedBy = mangaRow.createdBy;
    }

    const currentUser = await db.query.user.findFirst({
      where: { id: userId, isActive: true },
      columns: { role: true },
    });

    const isCreator = mangaCreatedBy === userId;
    const isAdmin = currentUser?.role === "admin";
    if (!isCreator && !isAdmin) {
      return {
        ok: false,
        error:
          "Forbidden: only the creator or an admin can modify chapter groups in this manga",
      };
    }

    const title = data.title?.trim() || null;

    try {
      const row = await db.transaction(async (tx) => {
        // Lock the manga row so concurrent chapter group writes for the same manga serialize,
        // preventing two transactions from picking the same sequence.
        const [mangaRow] = await tx
          .select({ id: manga.id })
          .from(manga)
          .where(eq(manga.id, effectiveMangaId))
          .for("update");

        if (!mangaRow) return null;

        const lastGroup = await tx
          .select({ sequence: chapterGroup.sequence })
          .from(chapterGroup)
          .where(eq(chapterGroup.mangaId, effectiveMangaId))
          .orderBy(desc(chapterGroup.sequence))
          .limit(1);

        const nextSequence = (lastGroup[0]?.sequence ?? -1) + 1;

        const [upserted] = await tx
          .insert(chapterGroup)
          .values({
            id: data.id,
            mangaId: effectiveMangaId,
            title,
            sequence: nextSequence,
          })
          .onConflictDoUpdate({
            target: chapterGroup.id,
            set: { title },
          })
          .returning();

        return upserted ?? null;
      });

      if (!row) {
        return { ok: false, error: "Failed to upsert chapter group" };
      }

      return { ok: true, id: row.id };
    } catch (err) {
      console.error("Failed to upsert chapter group:", err);
      return { ok: false, error: "Failed to upsert chapter group" };
    }
  });

// ---------- Delete Chapter Group ----------

export type DeleteChapterGroupInput = {
  id: string;
};

export type DeleteChapterGroupResult =
  { ok: true; id: string } | { ok: false; error: string };

export const deleteChapterGroupFn = createServerFn({ method: "POST" })
  .validator((data: DeleteChapterGroupInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      return { ok: false, error: "Unauthorized" };
    }

    const [existing, currentUser] = await Promise.all([
      db.query.chapterGroup.findFirst({
        where: { id: data.id },
        with: {
          manga: { columns: { createdBy: true } },
          chapters: {
            columns: { id: true },
            with: {
              images: { columns: { id: true } },
            },
          },
        },
      }),
      db.query.user.findFirst({
        where: { id: userId, isActive: true },
        columns: { role: true },
      }),
    ]);

    if (!existing) {
      return { ok: false, error: "Chapter group not found" };
    }

    if (!existing.manga) {
      return { ok: false, error: "Manga not found" };
    }

    const isCreator = existing.manga.createdBy === userId;
    const isAdmin = currentUser?.role === "admin";
    if (!isCreator && !isAdmin) {
      return {
        ok: false,
        error:
          "Forbidden: only the creator or an admin can delete this chapter group",
      };
    }

    const chapterImageIds = existing.chapters.flatMap((c) =>
      c.images.map((img) => img.id),
    );

    try {
      await db.transaction(async (tx) => {
        if (chapterImageIds.length > 0) {
          await tx.delete(image).where(inArray(image.id, chapterImageIds));
        }

        await tx.delete(chapterGroup).where(eq(chapterGroup.id, data.id));
      });
    } catch (err) {
      console.error("Failed to delete chapter group:", err);
      return { ok: false, error: "Failed to delete chapter group" };
    }

    // Best-effort cleanup of image files on disk.
    for (const chapterImageId of chapterImageIds) {
      try {
        await unlink(`${CHAPTER_IMAGES_DIR}/${chapterImageId}.webp`);
      } catch {}
    }

    return { ok: true, id: data.id };
  });

// ---------- Arrange Chapter Groups ----------

export type ArrangeChapterGroupsInput = {
  mangaId: string;
  ids: string[];
};

export type ArrangeChapterGroupsResult =
  { ok: true } | { ok: false; error: string };

export const arrangeChapterGroupsFn = createServerFn({ method: "POST" })
  .validator((data: ArrangeChapterGroupsInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      return { ok: false, error: "Unauthorized" };
    }

    const [existing, currentUser] = await Promise.all([
      db.query.manga.findFirst({
        where: { id: data.mangaId },
        columns: { createdBy: true },
      }),
      db.query.user.findFirst({
        where: { id: userId, isActive: true },
        columns: { role: true },
      }),
    ]);

    if (!existing) {
      return { ok: false, error: "Manga not found" };
    }

    const isCreator = existing.createdBy === userId;
    const isAdmin = currentUser?.role === "admin";
    if (!isCreator && !isAdmin) {
      return {
        ok: false,
        error:
          "Forbidden: only the creator or an admin can arrange chapter groups for this manga",
      };
    }

    try {
      const validationError = await db.transaction(async (tx) => {
        // Lock the manga row so concurrent sequence changes serialize.
        const [mangaRow] = await tx
          .select({ id: manga.id })
          .from(manga)
          .where(eq(manga.id, data.mangaId))
          .for("update");

        if (!mangaRow) return "Manga not found";

        // Fetch all current chapter group IDs for this manga.
        const currentGroups = await tx
          .select({ id: chapterGroup.id })
          .from(chapterGroup)
          .where(eq(chapterGroup.mangaId, data.mangaId));

        const currentIds = currentGroups.map((g) => g.id);

        // Validate that every ID is included exactly once.
        if (data.ids.length !== currentIds.length) {
          return "All chapter group IDs must be provided exactly once";
        }
        const currentSet = new Set(currentIds);
        if (new Set(data.ids).size !== currentSet.size) {
          return "All chapter group IDs must be provided exactly once";
        }
        for (const id of data.ids) {
          if (!currentSet.has(id)) {
            return "All chapter group IDs must be provided exactly once";
          }
        }

        // Assign new sequences based on array position.
        for (let i = 0; i < data.ids.length; i++) {
          await tx
            .update(chapterGroup)
            .set({ sequence: i })
            .where(eq(chapterGroup.id, data.ids[i]));
        }

        return null;
      });

      if (validationError) {
        return { ok: false, error: validationError };
      }

      return { ok: true };
    } catch (err) {
      console.error("Failed to arrange chapter groups:", err);
      return { ok: false, error: "Failed to arrange chapter groups" };
    }
  });

// ---------- Upsert Chapter ----------

export type UpsertChapterInput = {
  id?: string;
  chapterGroupId: string;
  title?: string;
  locked?: boolean;
};

export type UpsertChapterResult =
  { ok: true; id: string } | { ok: false; error: string };

export const upsertChapterFn = createServerFn({ method: "POST" })
  .validator((data: UpsertChapterInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      return { ok: false, error: "Unauthorized" };
    }

    let effectiveGroupId = data.chapterGroupId;
    let mangaCreatedBy: string | null | undefined;

    if (data.id) {
      const existingChapter = await db.query.chapter.findFirst({
        where: { id: data.id },
        with: {
          chapterGroup: {
            columns: { id: true },
            with: { manga: { columns: { createdBy: true } } },
          },
        },
      });
      if (existingChapter) {
        effectiveGroupId = existingChapter.chapterGroupId;
        mangaCreatedBy = existingChapter.chapterGroup?.manga?.createdBy;
      }
    }

    if (!mangaCreatedBy) {
      const groupRow = await db.query.chapterGroup.findFirst({
        where: { id: effectiveGroupId },
        with: { manga: { columns: { createdBy: true } } },
      });
      if (!groupRow) {
        return { ok: false, error: "Chapter group not found" };
      }
      if (!groupRow.manga) {
        return { ok: false, error: "Manga not found" };
      }
      mangaCreatedBy = groupRow.manga.createdBy;
    }

    const currentUser = await db.query.user.findFirst({
      where: { id: userId, isActive: true },
      columns: { role: true },
    });

    const isCreator = mangaCreatedBy === userId;
    const isAdmin = currentUser?.role === "admin";
    if (!isCreator && !isAdmin) {
      return {
        ok: false,
        error:
          "Forbidden: only the creator or an admin can modify chapters in this manga",
      };
    }

    const title = data.title?.trim() || null;
    const locked = data.locked ?? false;

    try {
      const row = await db.transaction(async (tx) => {
        // Lock the chapter group row so concurrent chapter writes for the same group serialize,
        // preventing two transactions from picking the same sequence.
        const [groupRow] = await tx
          .select({ id: chapterGroup.id })
          .from(chapterGroup)
          .where(eq(chapterGroup.id, effectiveGroupId))
          .for("update");

        if (!groupRow) return null;

        const lastChapter = await tx
          .select({ sequence: chapter.sequence })
          .from(chapter)
          .where(eq(chapter.chapterGroupId, effectiveGroupId))
          .orderBy(desc(chapter.sequence))
          .limit(1);

        const nextSequence = (lastChapter[0]?.sequence ?? -1) + 1;

        const [upserted] = await tx
          .insert(chapter)
          .values({
            id: data.id,
            chapterGroupId: effectiveGroupId,
            title,
            locked,
            sequence: nextSequence,
          })
          .onConflictDoUpdate({
            target: chapter.id,
            set: {
              title,
              locked,
              updatedAt: new Date(),
            },
          })
          .returning();

        return upserted ?? null;
      });

      if (!row) {
        return { ok: false, error: "Failed to upsert chapter" };
      }

      return { ok: true, id: row.id };
    } catch (err) {
      console.error("Failed to upsert chapter:", err);
      return { ok: false, error: "Failed to upsert chapter" };
    }
  });

// ---------- Delete Chapter ----------

export type DeleteChapterInput = {
  id: string;
};

export type DeleteChapterResult =
  { ok: true; id: string } | { ok: false; error: string };

export const deleteChapterFn = createServerFn({ method: "POST" })
  .validator((data: DeleteChapterInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      return { ok: false, error: "Unauthorized" };
    }

    const [existing, currentUser] = await Promise.all([
      db.query.chapter.findFirst({
        where: { id: data.id },
        with: {
          chapterGroup: {
            columns: { id: true },
            with: {
              manga: { columns: { createdBy: true } },
            },
          },
          images: { columns: { id: true } },
        },
      }),
      db.query.user.findFirst({
        where: { id: userId, isActive: true },
        columns: { role: true },
      }),
    ]);

    if (!existing) {
      return { ok: false, error: "Chapter not found" };
    }

    if (!existing.chapterGroup?.manga) {
      return { ok: false, error: "Manga not found" };
    }

    const isCreator = existing.chapterGroup.manga.createdBy === userId;
    const isAdmin = currentUser?.role === "admin";
    if (!isCreator && !isAdmin) {
      return {
        ok: false,
        error:
          "Forbidden: only the creator or an admin can delete this chapter",
      };
    }

    const chapterImageIds = existing.images.map((img) => img.id);

    try {
      await db.transaction(async (tx) => {
        if (chapterImageIds.length > 0) {
          await tx.delete(image).where(inArray(image.id, chapterImageIds));
        }

        await tx.delete(chapter).where(eq(chapter.id, data.id));
      });
    } catch (err) {
      console.error("Failed to delete chapter:", err);
      return { ok: false, error: "Failed to delete chapter" };
    }

    // Best-effort cleanup of image files on disk.
    for (const chapterImageId of chapterImageIds) {
      try {
        await unlink(`${CHAPTER_IMAGES_DIR}/${chapterImageId}.webp`);
      } catch {}
    }

    return { ok: true, id: data.id };
  });

// ---------- Arrange Chapters ----------

export type ArrangeChaptersInput = {
  chapterGroupId: string;
  ids: string[];
};

export type ArrangeChaptersResult = { ok: true } | { ok: false; error: string };

export const arrangeChaptersFn = createServerFn({ method: "POST" })
  .validator((data: ArrangeChaptersInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      return { ok: false, error: "Unauthorized" };
    }

    const [existing, currentUser] = await Promise.all([
      db.query.chapterGroup.findFirst({
        where: { id: data.chapterGroupId },
        with: { manga: { columns: { createdBy: true } } },
      }),
      db.query.user.findFirst({
        where: { id: userId, isActive: true },
        columns: { role: true },
      }),
    ]);

    if (!existing) {
      return { ok: false, error: "Chapter group not found" };
    }

    if (!existing.manga) {
      return { ok: false, error: "Manga not found" };
    }

    const isCreator = existing.manga.createdBy === userId;
    const isAdmin = currentUser?.role === "admin";
    if (!isCreator && !isAdmin) {
      return {
        ok: false,
        error:
          "Forbidden: only the creator or an admin can arrange chapters for this manga",
      };
    }

    try {
      const validationError = await db.transaction(async (tx) => {
        // Lock the chapter group row so concurrent sequence changes serialize.
        const [groupRow] = await tx
          .select({ id: chapterGroup.id })
          .from(chapterGroup)
          .where(eq(chapterGroup.id, data.chapterGroupId))
          .for("update");

        if (!groupRow) return "Chapter group not found";

        // Fetch all current chapter IDs for this group.
        const currentChapters = await tx
          .select({ id: chapter.id })
          .from(chapter)
          .where(eq(chapter.chapterGroupId, data.chapterGroupId));

        const currentIds = currentChapters.map((c) => c.id);

        // Validate that every ID is included exactly once.
        if (data.ids.length !== currentIds.length) {
          return "All chapter IDs must be provided exactly once";
        }
        const currentSet = new Set(currentIds);
        if (new Set(data.ids).size !== currentSet.size) {
          return "All chapter IDs must be provided exactly once";
        }
        for (const id of data.ids) {
          if (!currentSet.has(id)) {
            return "All chapter IDs must be provided exactly once";
          }
        }

        // Assign new sequences based on array position.
        for (let i = 0; i < data.ids.length; i++) {
          await tx
            .update(chapter)
            .set({ sequence: i })
            .where(eq(chapter.id, data.ids[i]));
        }

        return null;
      });

      if (validationError) {
        return { ok: false, error: validationError };
      }

      return { ok: true };
    } catch (err) {
      console.error("Failed to arrange chapters:", err);
      return { ok: false, error: "Failed to arrange chapters" };
    }
  });

// ---------- Get Chapter ----------

export type GetChapterInput = {
  id: string;
};

export type ChapterImage = {
  id: string;
  sequence: number | null;
};

export type GetChapterResult =
  | (typeof chapter.$inferSelect & {
      images: Pick<typeof image.$inferSelect, "id" | "sequence">[];
    })
  | null;

export const getChapterFn = createServerFn({ method: "GET" })
  .validator((data: GetChapterInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const row = await db.query.chapter.findFirst({
      where: { id: data.id },
      with: {
        images: {
          orderBy: { sequence: "asc" },
          columns: { id: true, sequence: true },
        },
      },
    });

    if (!row) return null;

    return row;
  });

// ---------- Create Chapter Image ----------

export type CreateChapterImagesInput = {
  chapterId: string;
  images: string[];
};

export type CreateChapterImageItemResult =
  { ok: true; id: string; sequence: number } | { ok: false; error: string };

export type CreateChapterImagesResult =
  | { ok: true; results: CreateChapterImageItemResult[] }
  | { ok: false; error: string };

export const createChapterImageFn = createServerFn({ method: "POST" })
  .validator((data: CreateChapterImagesInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      return { ok: false, error: "Unauthorized" };
    }

    const [existing, currentUser] = await Promise.all([
      db.query.chapter.findFirst({
        where: { id: data.chapterId },
        with: {
          chapterGroup: {
            columns: { id: true },
            with: {
              manga: { columns: { createdBy: true } },
            },
          },
        },
      }),
      db.query.user.findFirst({
        where: { id: userId, isActive: true },
        columns: { role: true },
      }),
    ]);

    if (!existing) {
      return { ok: false, error: "Chapter not found" };
    }

    if (!existing.chapterGroup?.manga) {
      return { ok: false, error: "Manga not found" };
    }

    const isCreator = existing.chapterGroup.manga.createdBy === userId;
    const isAdmin = currentUser?.role === "admin";
    if (!isCreator && !isAdmin) {
      return {
        ok: false,
        error:
          "Forbidden: only the creator or an admin can add images to this chapter",
      };
    }

    if (!Array.isArray(data.images) || data.images.length === 0) {
      return { ok: false, error: "At least one image is required" };
    }

    type Prepared = { ok: true; id: string } | { ok: false; error: string };
    const prepared: Prepared[] = await Promise.all(
      data.images.map(async (raw) => {
        const base64 = raw?.trim();
        if (!base64) {
          return { ok: false, error: "Image data is required" } as const;
        }

        let bytes: Buffer;
        try {
          bytes = Buffer.from(base64, "base64");
        } catch {
          return { ok: false, error: "Invalid image data" } as const;
        }

        if (bytes.length > MAX_IMAGE_BYTES) {
          return {
            ok: false,
            error: `Image must be smaller than ${
              MAX_IMAGE_BYTES / (1024 * 1024)
            } MB`,
          } as const;
        }

        const id = crypto.randomUUID();
        try {
          const webpBytes = await new Bun.Image(bytes)
            .webp({ lossless: true })
            .bytes();
          await Bun.write(`${CHAPTER_IMAGES_DIR}/${id}.webp`, webpBytes);
        } catch (err) {
          console.error("Failed to encode/write chapter image:", err);
          return { ok: false, error: "Failed to save image" } as const;
        }

        return { ok: true, id } as const;
      }),
    );

    const writtenPaths = prepared
      .filter((p): p is { ok: true; id: string } => p.ok)
      .map((p) => `${CHAPTER_IMAGES_DIR}/${p.id}.webp`);

    const readyToInsert = prepared.filter(
      (p): p is { ok: true; id: string } => p.ok,
    );

    // If nothing survived validation/encoding there's nothing to persist.
    if (readyToInsert.length === 0) {
      return {
        ok: false,
        results: prepared.map((p) =>
          p.ok
            ? { ok: true, id: p.id, sequence: 0 }
            : { ok: false, error: p.error },
        ),
      };
    }

    const inserted: { id: string; sequence: number }[] = [];

    try {
      await db.transaction(async (tx) => {
        // Lock the chapter row so concurrent image uploads for the same chapter serialize,
        // preventing two transactions from picking the same sequence.
        const [chapterRow] = await tx
          .select({ id: chapter.id })
          .from(chapter)
          .where(eq(chapter.id, data.chapterId))
          .for("update");

        if (!chapterRow) throw new Error("Chapter not found");

        const lastImage = await tx
          .select({ sequence: image.sequence })
          .from(image)
          .where(eq(image.chapterId, data.chapterId))
          .orderBy(desc(image.sequence))
          .limit(1);

        const nextSequence = (lastImage[0]?.sequence ?? -1) + 1;
        const rows = await tx
          .insert(image)
          .values(
            readyToInsert.map((item, index) => ({
              id: item.id,
              chapterId: data.chapterId,
              sequence: nextSequence + index,
            })),
          )
          .returning();

        if (rows.length !== readyToInsert.length) {
          throw new Error("Failed to insert chapter images");
        }

        inserted.push(
          ...rows.map((row) => ({
            id: row.id,
            sequence: row.sequence ?? 0,
          })),
        );
      });
    } catch (err) {
      console.error("Failed to create chapter images:", err);

      // Clean up any files we wrote since none of them are now referenced by the database (the transaction rolled back).
      await Promise.allSettled(
        writtenPaths.map((filePath) => unlink(filePath)),
      );

      const results: CreateChapterImageItemResult[] = prepared.map((p) =>
        p.ok
          ? { ok: false, error: "Failed to create chapter image" }
          : { ok: false, error: p.error },
      );
      return { ok: false, results };
    }

    // Stitch per-image results back together in input order so the client can map each input file to its outcome.
    let insertIdx = 0;
    const results: CreateChapterImageItemResult[] = prepared.map((p) => {
      if (!p.ok) return { ok: false, error: p.error };
      const row = inserted[insertIdx++];
      return { ok: true, id: p.id, sequence: row.sequence };
    });

    const ok = results.every((r) => r.ok);
    return ok ? { ok: true, results } : { ok: false, results };
  });

// ---------- Delete Chapter Image ----------

export type DeleteChapterImageInput = {
  id: string;
};

export type DeleteChapterImageResult =
  { ok: true; id: string } | { ok: false; error: string };

export const deleteChapterImageFn = createServerFn({ method: "POST" })
  .validator((data: DeleteChapterImageInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      return { ok: false, error: "Unauthorized" };
    }

    const [existing, currentUser] = await Promise.all([
      db.query.image.findFirst({
        where: { id: data.id },
        with: {
          chapter: {
            columns: { id: true },
            with: {
              chapterGroup: {
                columns: { id: true },
                with: {
                  manga: { columns: { createdBy: true } },
                },
              },
            },
          },
        },
      }),
      db.query.user.findFirst({
        where: { id: userId, isActive: true },
        columns: { role: true },
      }),
    ]);

    if (!existing) {
      return { ok: false, error: "Image not found" };
    }

    if (!existing.chapter?.chapterGroup?.manga) {
      return { ok: false, error: "Manga not found" };
    }

    const isCreator = existing.chapter.chapterGroup.manga.createdBy === userId;
    const isAdmin = currentUser?.role === "admin";
    if (!isCreator && !isAdmin) {
      return {
        ok: false,
        error:
          "Forbidden: only the creator or an admin can delete this chapter image",
      };
    }

    try {
      await db.delete(image).where(eq(image.id, data.id));
    } catch (err) {
      console.error("Failed to delete chapter image:", err);
      return { ok: false, error: "Failed to delete chapter image" };
    }

    // Best-effort cleanup of image file on disk.
    try {
      await unlink(`${CHAPTER_IMAGES_DIR}/${data.id}.webp`);
    } catch {}

    return { ok: true, id: data.id };
  });

// ---------- Arrange Chapter Images ----------

export type ArrangeChapterImagesInput = {
  chapterId: string;
  ids: string[];
};

export type ArrangeChapterImagesResult =
  { ok: true } | { ok: false; error: string };

export const arrangeChapterImagesFn = createServerFn({ method: "POST" })
  .validator((data: ArrangeChapterImagesInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      return { ok: false, error: "Unauthorized" };
    }

    const [existing, currentUser] = await Promise.all([
      db.query.chapter.findFirst({
        where: { id: data.chapterId },
        with: {
          chapterGroup: {
            columns: { id: true },
            with: { manga: { columns: { createdBy: true } } },
          },
        },
      }),
      db.query.user.findFirst({
        where: { id: userId, isActive: true },
        columns: { role: true },
      }),
    ]);

    if (!existing) {
      return { ok: false, error: "Chapter not found" };
    }

    if (!existing.chapterGroup?.manga) {
      return { ok: false, error: "Manga not found" };
    }

    const isCreator = existing.chapterGroup.manga.createdBy === userId;
    const isAdmin = currentUser?.role === "admin";
    if (!isCreator && !isAdmin) {
      return {
        ok: false,
        error:
          "Forbidden: only the creator or an admin can arrange images for this chapter",
      };
    }

    try {
      const validationError = await db.transaction(async (tx) => {
        // Lock the chapter row so concurrent sequence changes serialize.
        const [chapterRow] = await tx
          .select({ id: chapter.id })
          .from(chapter)
          .where(eq(chapter.id, data.chapterId))
          .for("update");

        if (!chapterRow) return "Chapter not found";

        // Fetch all current image IDs for this chapter.
        const currentImages = await tx
          .select({ id: image.id })
          .from(image)
          .where(eq(image.chapterId, data.chapterId));

        const currentIds = currentImages.map((img) => img.id);

        // Validate that every ID is included exactly once.
        if (data.ids.length !== currentIds.length) {
          return "All image IDs must be provided exactly once";
        }
        const currentSet = new Set(currentIds);
        if (new Set(data.ids).size !== currentSet.size) {
          return "All image IDs must be provided exactly once";
        }
        for (const id of data.ids) {
          if (!currentSet.has(id)) {
            return "All image IDs must be provided exactly once";
          }
        }

        // Assign new sequences based on array position.
        for (let i = 0; i < data.ids.length; i++) {
          await tx
            .update(image)
            .set({ sequence: i })
            .where(eq(image.id, data.ids[i]));
        }

        return null;
      });

      if (validationError) {
        return { ok: false, error: validationError };
      }

      return { ok: true };
    } catch (err) {
      console.error("Failed to arrange chapter images:", err);
      return { ok: false, error: "Failed to arrange chapter images" };
    }
  });
