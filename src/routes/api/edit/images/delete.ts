import { createFileRoute } from "@tanstack/react-router";
import { and, eq, exists, inArray, isNotNull } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { z } from "zod";

import { chapter, chapterGroup, image, manga } from "#/db/schema.ts";
import db from "#/lib/db.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";
import {
  CHAPTER_IMAGES_DIR,
  parseChapterImageReference,
} from "#/utils/image.server.ts";

const deleteRequestSchema = z
  .array(z.string().trim().min(1))
  .refine((references) => new Set(references).size === references.length, {
    message: "Image references must be unique",
  });
const INCOMPLETE_DELETE = Symbol("incomplete image delete");

export const Route = createFileRoute("/api/edit/images/delete")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      POST: async ({ request, context }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json(
            { message: "Invalid JSON body" },
            { status: 400 },
          );
        }
        const parsed = deleteRequestSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            {
              message:
                parsed.error.issues[0]?.message ??
                "Expected a list of image references",
            },
            { status: 400 },
          );
        }
        if (parsed.data.length === 0) {
          return new Response(null, { status: 204 });
        }

        const ids = parsed.data.map((reference) =>
          parseChapterImageReference(reference),
        );
        if (ids.some((id) => id === null)) {
          return Response.json(
            { message: "Invalid image reference" },
            { status: 400 },
          );
        }

        const normalizedIds = ids as string[];
        if (new Set(normalizedIds).size !== normalizedIds.length) {
          return Response.json(
            { message: "Image references must be unique" },
            { status: 400 },
          );
        }

        let deletedIds: string[];
        try {
          deletedIds = await db.transaction(async (tx) => {
            const authorized =
              context.role === "admin"
                ? undefined
                : exists(
                    db
                      .select({ id: chapter.id })
                      .from(chapter)
                      .innerJoin(
                        chapterGroup,
                        eq(chapterGroup.id, chapter.chapterGroupId),
                      )
                      .innerJoin(manga, eq(manga.id, chapterGroup.mangaId))
                      .where(
                        and(
                          eq(chapter.id, image.chapterId),
                          eq(manga.createdBy, context.userId),
                        ),
                      ),
                  );

            const deleted = await tx
              .delete(image)
              .where(
                and(
                  inArray(image.id, normalizedIds),
                  isNotNull(image.chapterId),
                  authorized,
                ),
              )
              .returning();

            if (deleted.length !== normalizedIds.length) {
              throw INCOMPLETE_DELETE;
            }
            return deleted.map((row) => row.id);
          });
        } catch (databaseError) {
          if (databaseError === INCOMPLETE_DELETE) {
            return Response.json(
              { message: "Image not found or not editable" },
              { status: 404 },
            );
          }

          console.error("Failed to delete editor images:", databaseError);
          return Response.json(
            { message: "Failed to delete images" },
            { status: 500 },
          );
        }

        await Promise.allSettled(
          deletedIds.map((id) => unlink(`${CHAPTER_IMAGES_DIR}/${id}.webp`)),
        );

        return new Response(null, { status: 204 });
      },
    },
  },
});
