import { createFileRoute } from "@tanstack/react-router";
import { eq, inArray } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { z } from "zod";

import { image, manga } from "#/db/schema.ts";
import db from "#/lib/db.server.ts";
import { apiLogger } from "#/lib/logger.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";
import { CHAPTER_IMAGES_DIR, MANGA_IMAGES_DIR } from "#/utils/image.server.ts";

const paramsSchema = z.object({ id: z.string().min(1) });

export const Route = createFileRoute("/api/edit/manga/$id/")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      DELETE: async ({ params, context }) => {
        const parsedParams = paramsSchema.safeParse(params);
        if (!parsedParams.success) {
          return Response.json(
            { message: "Invalid manga ID" },
            { status: 400 },
          );
        }

        const existing = await db.query.manga.findFirst({
          where: { id: parsedParams.data.id },
          columns: { createdBy: true },
          with: {
            cover: { columns: { id: true } },
            chapterGroups: {
              columns: { id: true },
              with: {
                chapters: {
                  columns: { id: true },
                  with: { images: { columns: { id: true } } },
                },
              },
            },
          },
        });

        if (!existing) {
          return Response.json({ message: "Manga not found" }, { status: 404 });
        }

        if (context.role !== "admin" && existing.createdBy !== context.userId) {
          return Response.json({ message: "Forbidden" }, { status: 403 });
        }

        const coverId = existing.cover?.id ?? null;
        const chapterImageIds = existing.chapterGroups.flatMap((group) =>
          group.chapters.flatMap((chapter) =>
            chapter.images.map((item) => item.id),
          ),
        );
        const imageIds = [...(coverId ? [coverId] : []), ...chapterImageIds];

        try {
          await db.transaction(async (tx) => {
            if (imageIds.length > 0) {
              await tx.delete(image).where(inArray(image.id, imageIds));
            }
            await tx.delete(manga).where(eq(manga.id, parsedParams.data.id));
          });
        } catch (databaseError) {
          apiLogger.error(
            { err: databaseError },
            "failed to delete editor manga",
          );
          return Response.json(
            { message: "Failed to delete manga" },
            { status: 500 },
          );
        }

        await Promise.allSettled([
          ...(coverId ? [unlink(`${MANGA_IMAGES_DIR}/${coverId}.webp`)] : []),
          ...chapterImageIds.map((imageId) =>
            unlink(`${CHAPTER_IMAGES_DIR}/${imageId}.webp`),
          ),
        ]);

        return new Response(null, { status: 204 });
      },
    },
  },
});
