CREATE TYPE "role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "chapter" (
	"id" text PRIMARY KEY,
	"title" text,
	"locked" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"chapter_group_id" text NOT NULL,
	"sequence" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter_group" (
	"id" text PRIMARY KEY,
	"title" text,
	"manga_id" text NOT NULL,
	"sequence" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image" (
	"id" text PRIMARY KEY,
	"chapter_id" text,
	"sequence" integer,
	"manga_id" text UNIQUE,
	CONSTRAINT "image_exactly_one_of_chapter_or_manga" CHECK ((chapter_id IS NULL) <> (manga_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "manga" (
	"id" text PRIMARY KEY,
	"title" text,
	"status" integer,
	"reading_direction" integer,
	"description" text,
	"authors" text[],
	"genres" text[],
	"remarks" text,
	"embedding" vector(1024),
	"created_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record" (
	"manga_id" text,
	"plugin_id" text,
	"user_id" text,
	"datetime" timestamp NOT NULL,
	"chapter_id" text NOT NULL,
	"chapter_title" text,
	"page" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "record_pkey" PRIMARY KEY("manga_id","plugin_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "saved" (
	"manga_id" text,
	"plugin_id" text,
	"user_id" text,
	"datetime" timestamp NOT NULL,
	"updates" boolean NOT NULL,
	"latest_chapter" text NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saved_pkey" PRIMARY KEY("manga_id","plugin_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"email" text NOT NULL UNIQUE,
	"password" text NOT NULL,
	"role" "role" DEFAULT 'member'::"role" NOT NULL,
	"api_key" text NOT NULL,
	"is_active" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chapter_chapter_group_id_idx" ON "chapter" ("chapter_group_id");--> statement-breakpoint
CREATE INDEX "chapter_group_manga_id_idx" ON "chapter_group" ("manga_id");--> statement-breakpoint
CREATE INDEX "image_chapter_id_idx" ON "image" ("chapter_id");--> statement-breakpoint
CREATE INDEX "manga_embedding_idx" ON "manga" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "record_user_id_idx" ON "record" ("user_id");--> statement-breakpoint
CREATE INDEX "saved_user_id_idx" ON "saved" ("user_id");--> statement-breakpoint
ALTER TABLE "chapter" ADD CONSTRAINT "chapter_chapter_group_id_chapter_group_id_fkey" FOREIGN KEY ("chapter_group_id") REFERENCES "chapter_group"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chapter_group" ADD CONSTRAINT "chapter_group_manga_id_manga_id_fkey" FOREIGN KEY ("manga_id") REFERENCES "manga"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "image" ADD CONSTRAINT "image_chapter_id_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapter"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "image" ADD CONSTRAINT "image_manga_id_manga_id_fkey" FOREIGN KEY ("manga_id") REFERENCES "manga"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "manga" ADD CONSTRAINT "manga_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "record" ADD CONSTRAINT "record_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "saved" ADD CONSTRAINT "saved_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;