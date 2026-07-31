import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

const relations = defineRelations(schema, (r) => ({
  user: {
    createdManga: r.many.manga(),
    records: r.many.record(),
    saveds: r.many.saved(),
    trackingMangaRequests: r.many.trackingMangaRequest(),
  },
  manga: {
    creator: r.one.user({
      from: r.manga.createdBy,
      to: r.user.id,
    }),
    chapterGroups: r.many.chapterGroup(),
    cover: r.one.image({
      from: r.manga.id,
      to: r.image.mangaId,
    }),
    trackingManga: r.one.trackingManga({
      from: r.manga.id,
      to: r.trackingManga.mangaId,
    }),
  },
  chapterGroup: {
    manga: r.one.manga({
      from: r.chapterGroup.mangaId,
      to: r.manga.id,
    }),
    chapters: r.many.chapter(),
    trackingChapterGroup: r.one.trackingChapterGroup({
      from: r.chapterGroup.id,
      to: r.trackingChapterGroup.chapterGroupId,
    }),
  },
  chapter: {
    chapterGroup: r.one.chapterGroup({
      from: r.chapter.chapterGroupId,
      to: r.chapterGroup.id,
    }),
    images: r.many.image(),
    trackingChapter: r.one.trackingChapter({
      from: r.chapter.id,
      to: r.trackingChapter.chapterId,
    }),
  },
  image: {
    chapter: r.one.chapter({
      from: r.image.chapterId,
      to: r.chapter.id,
    }),
    manga: r.one.manga({
      from: r.image.mangaId,
      to: r.manga.id,
    }),
    trackingImages: r.many.trackingImage({
      from: r.image.id,
      to: r.trackingImage.imageId,
    }),
  },
  record: {
    user: r.one.user({
      from: r.record.userId,
      to: r.user.id,
    }),
  },
  saved: {
    user: r.one.user({
      from: r.saved.userId,
      to: r.user.id,
    }),
  },
  trackingManga: {
    manga: r.one.manga({
      from: r.trackingManga.mangaId,
      to: r.manga.id,
    }),
    requests: r.many.trackingMangaRequest({
      from: [r.trackingManga.trackingId, r.trackingManga.id],
      to: [
        r.trackingMangaRequest.trackingId,
        r.trackingMangaRequest.trackingMangaId,
      ],
    }),
    chapterGroups: r.many.trackingChapterGroup({
      from: [r.trackingManga.trackingId, r.trackingManga.id],
      to: [
        r.trackingChapterGroup.trackingId,
        r.trackingChapterGroup.trackingMangaId,
      ],
    }),
    chapters: r.many.trackingChapter({
      from: [r.trackingManga.trackingId, r.trackingManga.id],
      to: [
        r.trackingChapter.trackingId,
        r.trackingChapter.trackingMangaId,
      ],
    }),
    images: r.many.trackingImage({
      from: [r.trackingManga.trackingId, r.trackingManga.id],
      to: [
        r.trackingImage.trackingId,
        r.trackingImage.trackingMangaId,
      ],
    }),
  },
  trackingMangaRequest: {
    user: r.one.user({
      from: r.trackingMangaRequest.userId,
      to: r.user.id,
    }),
    trackingManga: r.one.trackingManga({
      from: [
        r.trackingMangaRequest.trackingId,
        r.trackingMangaRequest.trackingMangaId,
      ],
      to: [r.trackingManga.trackingId, r.trackingManga.id],
    }),
  },
  trackingChapterGroup: {
    trackingManga: r.one.trackingManga({
      from: [
        r.trackingChapterGroup.trackingId,
        r.trackingChapterGroup.trackingMangaId,
      ],
      to: [r.trackingManga.trackingId, r.trackingManga.id],
    }),
    chapterGroup: r.one.chapterGroup({
      from: r.trackingChapterGroup.chapterGroupId,
      to: r.chapterGroup.id,
    }),
    chapters: r.many.trackingChapter({
      from: [
        r.trackingChapterGroup.trackingId,
        r.trackingChapterGroup.trackingMangaId,
        r.trackingChapterGroup.title,
      ],
      to: [
        r.trackingChapter.trackingId,
        r.trackingChapter.trackingMangaId,
        r.trackingChapter.trackingChapterGroupTitle,
      ],
    }),
  },
  trackingChapter: {
    trackingManga: r.one.trackingManga({
      from: [
        r.trackingChapter.trackingId,
        r.trackingChapter.trackingMangaId,
      ],
      to: [r.trackingManga.trackingId, r.trackingManga.id],
    }),
    trackingChapterGroup: r.one.trackingChapterGroup({
      from: [
        r.trackingChapter.trackingId,
        r.trackingChapter.trackingMangaId,
        r.trackingChapter.trackingChapterGroupTitle,
      ],
      to: [
        r.trackingChapterGroup.trackingId,
        r.trackingChapterGroup.trackingMangaId,
        r.trackingChapterGroup.title,
      ],
    }),
    chapter: r.one.chapter({
      from: r.trackingChapter.chapterId,
      to: r.chapter.id,
    }),
    images: r.many.trackingImage({
      from: [
        r.trackingChapter.trackingId,
        r.trackingChapter.trackingMangaId,
        r.trackingChapter.id,
      ],
      to: [
        r.trackingImage.trackingId,
        r.trackingImage.trackingMangaId,
        r.trackingImage.trackingChapterId,
      ],
    }),
  },
  trackingImage: {
    trackingManga: r.one.trackingManga({
      from: [
        r.trackingImage.trackingId,
        r.trackingImage.trackingMangaId,
      ],
      to: [r.trackingManga.trackingId, r.trackingManga.id],
    }),
    trackingChapter: r.one.trackingChapter({
      from: [
        r.trackingImage.trackingId,
        r.trackingImage.trackingMangaId,
        r.trackingImage.trackingChapterId,
      ],
      to: [
        r.trackingChapter.trackingId,
        r.trackingChapter.trackingMangaId,
        r.trackingChapter.id,
      ],
    }),
    image: r.one.image({
      from: r.trackingImage.imageId,
      to: r.image.id,
    }),
  },
}));

export default relations;
