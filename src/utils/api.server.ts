import { Genre, ReadingDirection, Status } from "#/utils/types.ts";

export const DEFAULT_PAGE = 1;
export const PAGE_SIZE = 25;

export interface APIChapter {
  id: string;
  title?: string;
  locked?: boolean;
}

export interface APIChapterGroup {
  title: string;
  chapters: APIChapter[];
}

export interface APIManga {
  id: string;
  title?: string;
  cover?: string;
  status?: Status;
  latestChapter?: APIChapter;
  meta?: string;
}

export interface APIDetailedManga extends APIManga {
  readingDirection?: ReadingDirection;
  description?: string;
  updatedAt?: number;
  authors: string[];
  genres: Genre[];
  chapters: APIChapterGroup[];
  remarks?: string;
  editable?: boolean;
}

export type MangaListRow = {
  id: string;
  title: string | null;
  status: number | null;
  cover: { id: string } | null;
  chapterGroups: {
    chapters: { id: string; title: string | null; locked: boolean }[];
  }[];
};

export function toAPIManga(row: MangaListRow): APIManga {
  const coverId = row.cover?.id ?? null;
  const latest = row.chapterGroups[0]?.chapters[0];

  const item: APIManga = { id: row.id };
  if (row.title) item.title = row.title;
  if (coverId) item.cover = `/image/manga/${coverId}.webp`;
  if (row.status != null) item.status = row.status as Status;
  if (latest) {
    item.latestChapter = {
      id: latest.id,
      title: latest.title ?? undefined,
      locked: latest.locked,
    };
  }
  return item;
}

export function parsePage(value: string | null): number {
  const n = Number(value ?? DEFAULT_PAGE);
  if (!Number.isInteger(n) || n < 1) {
    throw new Response("Invalid page", { status: 400 });
  }
  return n;
}
