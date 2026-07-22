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
