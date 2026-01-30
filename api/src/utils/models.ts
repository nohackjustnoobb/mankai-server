enum Status {
  Any = 0,
  OnGoing = 1,
  Ended = 2,
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

interface DetailedManga extends Manga {
  description?: string;
  updatedAt?: number;
  authors: string[];
  genres: string[];
  chapters: Record<string, Chapter[]>; // key is Group ID or Title
  remarks: string;
}

export type { Status, Chapter, Manga, DetailedManga };
