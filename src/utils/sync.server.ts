import { sql } from "drizzle-orm";

import db from "#/lib/db.server";
import { apiLogger } from "#/lib/logger.server.ts";
import { record, saved } from "#/db/schema";

// ---------- Types ----------

export type RecordInput = {
  mangaId: string;
  pluginId: string;
  datetime: string | number;
  chapterId: string;
  chapterTitle?: string | null;
  page: number;
};

export type SavedInput = {
  mangaId: string;
  pluginId: string;
  datetime: string | number;
  updates: boolean;
  latestChapter: string;
};

export type Pagination = {
  ts: number | null;
  offset: number | undefined;
  limit: number;
};

// ---------- Pagination ----------

export function parsePagination(request: Request): Pagination {
  const params = new URL(request.url).searchParams;

  const tsParam = params.get("ts");
  let ts: number | null = null;
  if (tsParam) {
    const parsed = Number(tsParam);
    if (!isNaN(parsed)) ts = parsed;
  }

  const osParam = params.get("os");
  const lmParam = params.get("lm");
  let offset: number | undefined;
  let limit = 50;

  if (osParam) {
    const parsed = Number(osParam);
    if (!isNaN(parsed) && parsed >= 0) offset = parsed;
  }

  if (lmParam) {
    const parsed = Number(lmParam);
    if (!isNaN(parsed) && parsed > 0) limit = parsed;
  }

  return { ts, offset, limit };
}

// ---------- Fetch ----------

export async function fetchRecords(userId: string, pagination: Pagination) {
  return db.query.record.findMany({
    where: {
      userId,
      ...(pagination.ts !== null
        ? { updatedAt: { gte: new Date(pagination.ts) } }
        : {}),
    },
    orderBy: { datetime: "desc" },
    offset: pagination.offset,
    limit: Math.min(pagination.limit, 50),
    columns: {
      mangaId: true,
      pluginId: true,
      datetime: true,
      chapterId: true,
      chapterTitle: true,
      page: true,
    },
  });
}

export async function fetchActiveSaveds(
  userId: string,
  pagination: Pagination,
) {
  return db.query.saved.findMany({
    where: {
      userId,
      isDeleted: false,
      ...(pagination.ts !== null
        ? { updatedAt: { gte: new Date(pagination.ts) } }
        : {}),
    },
    orderBy: { datetime: "desc" },
    offset: pagination.offset,
    limit: Math.min(pagination.limit, 50),
    columns: {
      mangaId: true,
      pluginId: true,
      datetime: true,
      updates: true,
      latestChapter: true,
    },
  });
}

export async function fetchDeletedSaveds(
  userId: string,
  pagination: Pagination,
) {
  return db.query.saved.findMany({
    where: {
      userId,
      isDeleted: true,
      ...(pagination.ts !== null
        ? { updatedAt: { gte: new Date(pagination.ts) } }
        : {}),
    },
    orderBy: { datetime: "desc" },
    offset: pagination.offset,
    limit: Math.min(pagination.limit, 50),
    columns: {
      mangaId: true,
      pluginId: true,
      datetime: true,
    },
  });
}

export async function fetchSyncData(userId: string, pagination: Pagination) {
  const [records, saveds, deleted] = await Promise.all([
    fetchRecords(userId, pagination),
    fetchActiveSaveds(userId, pagination),
    fetchDeletedSaveds(userId, pagination),
  ]);

  return { records, saveds, deleted };
}

// ---------- Upserts ----------

export async function upsertRecords(
  userId: string,
  records: RecordInput[],
  now: Date = new Date(),
): Promise<void> {
  if (records.length === 0) return;

  try {
    await db
      .insert(record)
      .values(
        records.map((r) => ({
          mangaId: r.mangaId,
          pluginId: r.pluginId,
          userId,
          datetime: new Date(r.datetime),
          chapterId: r.chapterId,
          chapterTitle: r.chapterTitle ?? null,
          page: r.page,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [record.mangaId, record.pluginId, record.userId],
        set: {
          datetime: sql`excluded."datetime"`,
          chapterId: sql`excluded."chapter_id"`,
          chapterTitle: sql`excluded."chapter_title"`,
          page: sql`excluded."page"`,
          updatedAt: sql`excluded."updated_at"`,
        },
        setWhere: sql`excluded."datetime" > "record"."datetime"`,
      });
  } catch (e) {
    apiLogger.error({ err: e }, "failed to upsert records");
  }
}

export async function upsertSaveds(
  userId: string,
  saveds: SavedInput[],
  now: Date = new Date(),
): Promise<void> {
  if (saveds.length === 0) return;

  try {
    await db
      .insert(saved)
      .values(
        saveds.map((s) => ({
          mangaId: s.mangaId,
          pluginId: s.pluginId,
          userId,
          datetime: new Date(s.datetime),
          updates: s.updates,
          latestChapter: s.latestChapter,
          isDeleted: false,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [saved.mangaId, saved.pluginId, saved.userId],
        set: {
          datetime: sql`excluded."datetime"`,
          updates: sql`excluded."updates"`,
          latestChapter: sql`excluded."latest_chapter"`,
          isDeleted: sql`excluded."is_deleted"`,
          updatedAt: sql`excluded."updated_at"`,
        },
        setWhere: sql`excluded."datetime" > "saved"."datetime"`,
      });
  } catch (e) {
    apiLogger.error({ err: e }, "failed to upsert saved items");
  }
}
