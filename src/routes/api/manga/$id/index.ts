import { createFileRoute } from "@tanstack/react-router";

import { apiAuthMiddleware } from "#/middleware/auth.ts";
import db from "#/lib/db.server";
import { chapter, chapterGroup, manga } from "#/db/schema";
import { Status, ReadingDirection } from "#/utils/types.ts";
import type { APIChapter, APIDetailedManga } from "#/utils/api.server.ts";

const DEFAULT_GROUP_TITLE = "Untitled group";

type ChapterRow = typeof chapter.$inferSelect;

type ChapterGroupRow = typeof chapterGroup.$inferSelect & {
  chapters: ChapterRow[];
};

type MangaDetailRow = Omit<
  typeof manga.$inferSelect,
  "embedding" | "createdAt"
> & {
  cover: { id: string } | null;
  chapterGroups: ChapterGroupRow[];
};

function toAPIChapter(ch: ChapterRow): APIChapter {
  const item: APIChapter = { id: ch.id };
  if (ch.title) item.title = ch.title;
  if (ch.locked) item.locked = true;
  return item;
}

function groupKey(group: ChapterGroupRow, used: Set<string>): string {
  const base = group.title?.trim() || DEFAULT_GROUP_TITLE;
  // Disambiguate duplicate group titles so no chapters are silently lost.
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let key = `${base} (${group.id})`;
  while (used.has(key)) key = `${base} (${group.id}) ${crypto.randomUUID()}`;
  used.add(key);

  return key;
}

export const Route = createFileRoute("/api/manga/$id/")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ params, context }) => {
        const row = await db.query.manga.findFirst({
          where: { id: params.id },
          columns: {
            embedding: false,
            createdAt: false,
          },
          with: {
            cover: { columns: { id: true } },
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

        if (!row) {
          return new Response("Not found", { status: 404 });
        }

        const detail = row as MangaDetailRow;

        let latest: ChapterRow | undefined;
        for (let g = 0; g < detail.chapterGroups.length; g++) {
          const chapters = detail.chapterGroups[g].chapters;
          if (chapters.length > 0) {
            latest = chapters[chapters.length - 1];
            break;
          }
        }

        const usedKeys = new Set<string>();
        const chapters: Record<string, APIChapter[]> = {};
        for (const group of detail.chapterGroups) {
          chapters[groupKey(group, usedKeys)] =
            group.chapters.map(toAPIChapter);
        }

        const coverId = detail.cover?.id ?? null;

        const result: APIDetailedManga = {
          id: detail.id,
          authors: detail.authors ?? [],
          genres: detail.genres ?? [],
          chapters,
          updatedAt: detail.updatedAt.getTime(),
          editable:
            context.role === "admin" || detail.createdBy === context.userId,
        };

        if (detail.title) result.title = detail.title;
        if (coverId) result.cover = `/image/manga/${coverId}.webp`;
        if (detail.status != null) result.status = detail.status as Status;
        if (detail.readingDirection != null)
          result.readingDirection = detail.readingDirection as ReadingDirection;
        if (detail.description) result.description = detail.description;
        if (latest) result.latestChapter = toAPIChapter(latest);
        if (detail.remarks) result.remarks = detail.remarks;

        return Response.json(result);
      },
    },
  },
});
