import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  boolean,
  index,
  check,
  vector,
  primaryKey,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { Genre } from "#/utils/types.ts";

// User

export const roleEnum = pgEnum("role", ["admin", "member"]);

/** Generates a 256-bit random API key as a 64-char hex string. */
export function generateApiKey(bytes = 32): string {
  const array = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const user = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: roleEnum("role").notNull().default("member"),
  apiKey: text("api_key")
    .notNull()
    .$defaultFn(() => generateApiKey()),
  isActive: boolean("is_active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Manga

export const manga = pgTable(
  "manga",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title"),
    status: integer("status"),
    readingDirection: integer("reading_direction"),
    description: text("description"),
    authors: text("authors").array(),
    genres: text("genres").array().$type<Genre>(),
    remarks: text("remarks"),

    embedding: vector("embedding", { dimensions: 1024 }),

    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("manga_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const chapterGroup = pgTable(
  "chapter_group",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title"),

    mangaId: text("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
  },
  (t) => [index("chapter_group_manga_id_idx").on(t.mangaId)],
);

export const chapter = pgTable(
  "chapter",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title"),
    locked: boolean("locked").notNull().default(false),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),

    chapterGroupId: text("chapter_group_id")
      .notNull()
      .references(() => chapterGroup.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
  },
  (t) => [index("chapter_chapter_group_id_idx").on(t.chapterGroupId)],
);

export const image = pgTable(
  "image",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // as content
    chapterId: text("chapter_id").references(() => chapter.id, {
      onDelete: "set null",
    }),
    sequence: integer("sequence"),

    // as cover
    mangaId: text("manga_id")
      .references(() => manga.id, { onDelete: "set null" })
      .unique(),
  },
  (t) => [
    index("image_chapter_id_idx").on(t.chapterId),
    check(
      "image_exactly_one_of_chapter_or_manga",
      sql`(chapter_id IS NULL) <> (manga_id IS NULL)`,
    ),
  ],
);

// Sync

export const record = pgTable(
  "record",
  {
    mangaId: text("manga_id").notNull(),
    pluginId: text("plugin_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    datetime: timestamp("datetime").notNull(),
    chapterId: text("chapter_id").notNull(),
    chapterTitle: text("chapter_title"),
    page: integer("page").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.mangaId, t.pluginId, t.userId] }),
    index("record_user_id_idx").on(t.userId),
  ],
);

export const saved = pgTable(
  "saved",
  {
    mangaId: text("manga_id").notNull(),
    pluginId: text("plugin_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    datetime: timestamp("datetime").notNull(),
    updates: boolean("updates").notNull(),
    latestChapter: text("latest_chapter").notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.mangaId, t.pluginId, t.userId] }),
    index("saved_user_id_idx").on(t.userId),
  ],
);

// Tracker

export const trackingStatusEnum = pgEnum("tracking_status", [
  "pending",
  "tracking",
  "paused",
  "completed",
  "failed",
]);

export const trackingManga = pgTable(
  "tracking_manga",
  {
    trackingId: text("tracking_id").notNull(),
    id: text("id").notNull(),
    meta: text("meta"),

    mangaId: text("manga_id")
      .references(() => manga.id, {
        onDelete: "set null",
      })
      .unique(),

    status: trackingStatusEnum("status").notNull(),
    pendingAt: timestamp("pending_at"),
    trackingAt: timestamp("tracking_at"),
    pausedAt: timestamp("paused_at"),
    completedAt: timestamp("completed_at"),
    failedCount: integer("failed_count"),
    failedAt: timestamp("failed_at"),
    failedReason: text("failed_reason"),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.trackingId, t.id] }),
    index("tracking_manga_tracking_id_status_idx").on(t.trackingId, t.status),
  ],
);

export const trackingMangaRequest = pgTable(
  "tracking_manga_request",
  {
    trackingId: text("tracking_id").notNull(),
    trackingMangaId: text("tracking_manga_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.trackingId, t.trackingMangaId, t.userId],
    }),
    foreignKey({
      columns: [t.trackingId, t.trackingMangaId],
      foreignColumns: [trackingManga.trackingId, trackingManga.id],
    }).onDelete("cascade"),
    index("tracking_manga_request_user_id_idx").on(t.userId),
  ],
);

export const trackingChapterGroup = pgTable(
  "tracking_chapter_group",
  {
    trackingId: text("tracking_id").notNull(),
    trackingMangaId: text("tracking_manga_id").notNull(),
    title: text("title").notNull(),

    chapterGroupId: text("chapter_group_id").references(() => chapterGroup.id, {
      onDelete: "set null",
    }),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.trackingId, t.trackingMangaId, t.title] }),
    foreignKey({
      columns: [t.trackingId, t.trackingMangaId],
      foreignColumns: [trackingManga.trackingId, trackingManga.id],
    }).onDelete("cascade"),
    index("tracking_chapter_group_chapter_group_id_idx").on(t.chapterGroupId),
  ],
);

export const trackingChapter = pgTable(
  "tracking_chapter",
  {
    trackingId: text("tracking_id").notNull(),
    trackingMangaId: text("tracking_manga_id").notNull(),
    id: text("id").notNull(),

    trackingChapterGroupTitle: text("tracking_chapter_group_title").notNull(),
    title: text("title"),

    chapterId: text("chapter_id")
      .references(() => chapter.id, {
        onDelete: "set null",
      })
      .unique(),

    status: trackingStatusEnum("status").notNull(),
    pendingAt: timestamp("pending_at"),
    trackingAt: timestamp("tracking_at"),
    pausedAt: timestamp("paused_at"),
    completedAt: timestamp("completed_at"),
    failedCount: integer("failed_count"),
    failedAt: timestamp("failed_at"),
    failedReason: text("failed_reason"),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.trackingId, t.trackingMangaId, t.id] }),
    foreignKey({
      columns: [t.trackingId, t.trackingMangaId, t.trackingChapterGroupTitle],
      foreignColumns: [
        trackingChapterGroup.trackingId,
        trackingChapterGroup.trackingMangaId,
        trackingChapterGroup.title,
      ],
    }).onDelete("cascade"),
    index("tracking_chapter_tracking_chapter_group_idx").on(
      t.trackingId,
      t.trackingMangaId,
      t.trackingChapterGroupTitle,
    ),
    index("tracking_chapter_tracking_id_status_idx").on(t.trackingId, t.status),
  ],
);

export const trackingImage = pgTable(
  "tracking_image",
  {
    trackingId: text("tracking_id").notNull(),
    trackingMangaId: text("tracking_manga_id").notNull(),
    trackingChapterId: text("tracking_chapter_id").notNull(),
    sequence: integer("sequence").notNull(),

    url: text("url").notNull(),

    imageId: text("image_id").references(() => image.id, {
      onDelete: "set null",
    }),

    status: trackingStatusEnum("status").notNull(),
    pendingAt: timestamp("pending_at"),
    trackingAt: timestamp("tracking_at"),
    pausedAt: timestamp("paused_at"),
    completedAt: timestamp("completed_at"),
    failedCount: integer("failed_count"),
    failedAt: timestamp("failed_at"),
    failedReason: text("failed_reason"),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [
        t.trackingId,
        t.trackingMangaId,
        t.trackingChapterId,
        t.sequence,
      ],
    }),
    foreignKey({
      columns: [t.trackingId, t.trackingMangaId, t.trackingChapterId],
      foreignColumns: [
        trackingChapter.trackingId,
        trackingChapter.trackingMangaId,
        trackingChapter.id,
      ],
    }).onDelete("cascade"),
    index("tracking_image_image_id_idx").on(t.imageId),
    index("tracking_image_tracking_id_status_idx").on(t.trackingId, t.status),
  ],
);
