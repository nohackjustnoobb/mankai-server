import { createFileRoute } from "@tanstack/react-router";

import { apiAuthMiddleware } from "#/middleware/auth.ts";
import db from "#/lib/db.server";
import { chapter, chapterGroup, manga } from "#/db/schema";
import { Status, ReadingDirection } from "#/utils/types.ts";
import type {
  APIChapter,
  APIChapterGroup,
  APIDetailedManga,
} from "#/utils/api.server.ts";

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

function groupTitle(group: ChapterGroupRow, used: Set<string>): string {
  const base = group.title?.trim() || DEFAULT_GROUP_TITLE;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  const disambiguated = `${base} (${group.id})`;
  let title = disambiguated;
  let suffix = 2;
  while (used.has(title)) {
    title = `${disambiguated} ${String(suffix)}`;
    suffix++;
  }
  used.add(title);

  return title;
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

        const usedTitles = new Set<string>();
        const chapters: APIChapterGroup[] = detail.chapterGroups.map(
          (group) => {
            const item: APIChapterGroup = {
              id: group.id,
              title: groupTitle(group, usedTitles),
              chapters: group.chapters.map(toAPIChapter),
            };
            return item;
          },
        );

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
