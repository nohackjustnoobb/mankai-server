CREATE TYPE "tracking_status" AS ENUM('pending', 'tracking', 'paused', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "tracking_chapter" (
	"tracking_id" text,
	"tracking_manga_id" text,
	"id" text,
	"tracking_chapter_group_title" text NOT NULL,
	"title" text,
	"chapter_id" text UNIQUE,
	"status" "tracking_status" NOT NULL,
	"pending_at" timestamp,
	"tracking_at" timestamp,
	"paused_at" timestamp,
	"completed_at" timestamp,
	"failed_count" integer,
	"failed_at" timestamp,
	"failed_reason" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_chapter_pkey" PRIMARY KEY("tracking_id","tracking_manga_id","id")
);
--> statement-breakpoint
CREATE TABLE "tracking_chapter_group" (
	"tracking_id" text,
	"tracking_manga_id" text,
	"title" text,
	"chapter_group_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_chapter_group_pkey" PRIMARY KEY("tracking_id","tracking_manga_id","title")
);
--> statement-breakpoint
CREATE TABLE "tracking_image" (
	"tracking_id" text,
	"tracking_manga_id" text,
	"tracking_chapter_id" text,
	"sequence" integer,
	"url" text NOT NULL,
	"image_id" text,
	"status" "tracking_status" NOT NULL,
	"pending_at" timestamp,
	"tracking_at" timestamp,
	"paused_at" timestamp,
	"completed_at" timestamp,
	"failed_count" integer,
	"failed_at" timestamp,
	"failed_reason" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_image_pkey" PRIMARY KEY("tracking_id","tracking_manga_id","tracking_chapter_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "tracking_manga" (
	"tracking_id" text,
	"id" text,
	"meta" text,
	"manga_id" text UNIQUE,
	"status" "tracking_status" NOT NULL,
	"pending_at" timestamp,
	"tracking_at" timestamp,
	"paused_at" timestamp,
	"completed_at" timestamp,
	"failed_count" integer,
	"failed_at" timestamp,
	"failed_reason" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_manga_pkey" PRIMARY KEY("tracking_id","id")
);
--> statement-breakpoint
CREATE TABLE "tracking_manga_request" (
	"tracking_id" text,
	"tracking_manga_id" text,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_manga_request_pkey" PRIMARY KEY("tracking_id","tracking_manga_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "tracking_chapter_tracking_chapter_group_idx" ON "tracking_chapter" ("tracking_id","tracking_manga_id","tracking_chapter_group_title");--> statement-breakpoint
CREATE INDEX "tracking_chapter_tracking_id_status_idx" ON "tracking_chapter" ("tracking_id","status");--> statement-breakpoint
CREATE INDEX "tracking_chapter_group_chapter_group_id_idx" ON "tracking_chapter_group" ("chapter_group_id");--> statement-breakpoint
CREATE INDEX "tracking_image_image_id_idx" ON "tracking_image" ("image_id");--> statement-breakpoint
CREATE INDEX "tracking_image_tracking_id_status_idx" ON "tracking_image" ("tracking_id","status");--> statement-breakpoint
CREATE INDEX "tracking_manga_tracking_id_status_idx" ON "tracking_manga" ("tracking_id","status");--> statement-breakpoint
CREATE INDEX "tracking_manga_request_user_id_idx" ON "tracking_manga_request" ("user_id");--> statement-breakpoint
ALTER TABLE "tracking_chapter" ADD CONSTRAINT "tracking_chapter_chapter_id_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapter"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tracking_chapter" ADD CONSTRAINT "tracking_chapter_KGaFg2vistOH_fkey" FOREIGN KEY ("tracking_id","tracking_manga_id","tracking_chapter_group_title") REFERENCES "tracking_chapter_group"("tracking_id","tracking_manga_id","title") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tracking_chapter_group" ADD CONSTRAINT "tracking_chapter_group_chapter_group_id_chapter_group_id_fkey" FOREIGN KEY ("chapter_group_id") REFERENCES "chapter_group"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tracking_chapter_group" ADD CONSTRAINT "tracking_chapter_group_yA55PaVji4xb_fkey" FOREIGN KEY ("tracking_id","tracking_manga_id") REFERENCES "tracking_manga"("tracking_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tracking_image" ADD CONSTRAINT "tracking_image_image_id_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "image"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tracking_image" ADD CONSTRAINT "tracking_image_8SrLGOs8YcTf_fkey" FOREIGN KEY ("tracking_id","tracking_manga_id","tracking_chapter_id") REFERENCES "tracking_chapter"("tracking_id","tracking_manga_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tracking_manga" ADD CONSTRAINT "tracking_manga_manga_id_manga_id_fkey" FOREIGN KEY ("manga_id") REFERENCES "manga"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tracking_manga_request" ADD CONSTRAINT "tracking_manga_request_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tracking_manga_request" ADD CONSTRAINT "tracking_manga_request_o0fT51hARhX4_fkey" FOREIGN KEY ("tracking_id","tracking_manga_id") REFERENCES "tracking_manga"("tracking_id","id") ON DELETE CASCADE;