import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

const relations = defineRelations(schema, (r) => ({
  user: {
    createdManga: r.many.manga(),
    records: r.many.record(),
    saveds: r.many.saved(),
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
  },
  chapterGroup: {
    manga: r.one.manga({
      from: r.chapterGroup.mangaId,
      to: r.manga.id,
    }),
    chapters: r.many.chapter(),
  },
  chapter: {
    chapterGroup: r.one.chapterGroup({
      from: r.chapter.chapterGroupId,
      to: r.chapterGroup.id,
    }),
    images: r.many.image(),
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
}));

export default relations;
