import authService from "./auth";

enum Status {
  Any = 0,
  OnGoing = 1,
  Ended = 2,
}

enum Genre {
  All = "all",
  Action = "action",
  Romance = "romance",
  Yuri = "yuri",
  BoysLove = "boysLove",
  SchoolLife = "schoolLife",
  Adventure = "adventure",
  Harem = "harem",
  SpeculativeFiction = "speculativeFiction",
  War = "war",
  Suspense = "suspense",
  FanFiction = "fanFiction",
  Comedy = "comedy",
  Magic = "magic",
  Horror = "horror",
  Historical = "historical",
  Sports = "sports",
  Mature = "mature",
  Mecha = "mecha",
  Otokonoko = "otokonoko",
}

interface Chapter {
  id: string;
  title?: string;
  locked?: boolean;
}

interface Manga {
  id: string;
  title?: string;
  cover?: string;
  status?: Status;
  latestChapter?: Chapter;
}

interface AdminChapter {
  id: string;
  title: string;
  sequence: number;
  locked: boolean;
  images: { id: string; sequence: number }[];
}

interface AdminChapterGroup {
  id: string;
  title: string;
  sequence: number;
  chapters: AdminChapter[];
}

// Redefine DetailedManga to match what we need for the form
interface AdminMangaDetail extends Omit<Manga, "latestChapter"> {
  description: string;
  authors: string[];
  genres: string[];
  remarks: string;
  chapterGroups: AdminChapterGroup[];
}

async function getMangas(page: number, search?: string): Promise<Manga[]> {
  let url = `/api/manga?page=${page}`;

  if (search)
    url = `/api/search?query=${encodeURIComponent(search)}&page=${page}`;

  const resp = await authService.get(url);

  return resp.map((manga: Manga) => ({
    ...manga,
    cover: manga.cover ? `/api${manga.cover}` : undefined,
  }));
}

async function createManga(
  title: string,
  status: Status,
  description: string,
  authors: string[],
  genres: string[],
  cover: string,
  remarks: string,
): Promise<Manga> {
  const resp = await authService.post("/admin/api/manga", {
    title,
    status,
    description,
    authors: authors.join("|"),
    genres: genres.join("|"),
    remarks,
    cover,
  });

  return resp;
}

async function deleteManga(id: string): Promise<void> {
  await authService.delete(`/admin/api/manga/${id}`);
}

async function getMangaDetail(id: string): Promise<AdminMangaDetail> {
  const resp = await authService.get(`/admin/api/manga/${id}`);

  return {
    ...resp,
    cover: resp.cover ? `/api/images/${resp.cover.id}.webp` : undefined,
    authors: resp.authors ? resp.authors.split("|") : [],
    genres: resp.genres ? resp.genres.split("|") : [],
  };
}

async function updateManga(
  id: string,
  data: Partial<Omit<AdminMangaDetail, "cover" | "authors" | "genres">> & {
    cover?: string;
    authors?: string[] | string;
    genres?: string[] | string;
  },
): Promise<void> {
  const payload = { ...data };

  if (Array.isArray(data.authors)) payload.authors = data.authors.join("|");

  if (Array.isArray(data.genres)) payload.genres = data.genres.join("|");

  await authService.patch(`/admin/api/manga/${id}`, payload);
}

async function createChapterGroup(
  mangaId: string,
  title: string,
  sequence: number,
): Promise<AdminChapterGroup> {
  const resp = await authService.post(
    `/admin/api/manga/${mangaId}/chapter-group`,
    {
      title,
      sequence,
    },
  );
  return { ...resp, chapters: [] };
}

async function deleteChapterGroup(
  mangaId: string,
  groupId: string,
): Promise<void> {
  await authService.delete(
    `/admin/api/manga/${mangaId}/chapter-group/${groupId}`,
  );
}

async function createChapter(
  mangaId: string,
  groupId: string,
  title: string,
  sequence: number,
): Promise<AdminChapter> {
  return await authService.post(
    `/admin/api/manga/${mangaId}/chapter-group/${groupId}/chapter`,
    {
      title,
      sequence,
    },
  );
}

async function deleteChapter(
  mangaId: string,
  groupId: string,
  chapterId: string,
): Promise<void> {
  await authService.delete(
    `/admin/api/manga/${mangaId}/chapter-group/${groupId}/chapter/${chapterId}`,
  );
}

async function addChapterImages(
  mangaId: string,
  groupId: string,
  chapterId: string,
  images: string[],
): Promise<{ id: string; sequence: number }[]> {
  return await authService.post(
    `/admin/api/manga/${mangaId}/chapter-group/${groupId}/chapter/${chapterId}/images`,
    {
      images,
    },
  );
}

async function deleteChapterImage(
  mangaId: string,
  groupId: string,
  chapterId: string,
  imageId: string,
): Promise<void> {
  await authService.delete(
    `/admin/api/manga/${mangaId}/chapter-group/${groupId}/chapter/${chapterId}/image/${imageId}`,
  );
}

export {
  getMangas,
  createManga,
  deleteManga,
  getMangaDetail,
  updateManga,
  createChapterGroup,
  deleteChapterGroup,
  createChapter,
  deleteChapter,
  addChapterImages,
  deleteChapterImage,
  Status,
  Genre,
};
export type {
  Chapter,
  Manga,
  AdminMangaDetail,
  AdminChapterGroup,
  AdminChapter,
};
