import { createFileRoute } from "@tanstack/react-router";
import { eq, inArray } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { z } from "zod";

import { chapter, image } from "#/db/schema.ts";
import db from "#/lib/db.server.ts";
import { apiLogger } from "#/lib/logger.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";
import { CHAPTER_IMAGES_DIR } from "#/utils/image.server.ts";

const paramsSchema = z.object({ id: z.string().min(1) });

export const Route = createFileRoute("/api/edit/chapter/$id/")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      DELETE: async ({ params, context }) => {
        const parsedParams = paramsSchema.safeParse(params);
        if (!parsedParams.success) {
          return Response.json(
            { message: "Invalid chapter ID" },
            { status: 400 },
          );
        }

        const existing = await db.query.chapter.findFirst({
          where: { id: parsedParams.data.id },
          with: {
            chapterGroup: {
              columns: { id: true },
              with: { manga: { columns: { createdBy: true } } },
            },
            images: { columns: { id: true } },
          },
        });

        if (!existing) {
          return Response.json(
            { message: "Chapter not found" },
            { status: 404 },
          );
        }
        if (
          context.role !== "admin" &&
          existing.chapterGroup?.manga?.createdBy !== context.userId
        ) {
          return Response.json({ message: "Forbidden" }, { status: 403 });
        }

        const imageIds = existing.images.map((item) => item.id);
        try {
          await db.transaction(async (tx) => {
            if (imageIds.length > 0) {
              await tx.delete(image).where(inArray(image.id, imageIds));
            }

            await tx
              .delete(chapter)
              .where(eq(chapter.id, parsedParams.data.id));
          });
        } catch (databaseError) {
          apiLogger.error(
            { err: databaseError },
            "failed to delete editor chapter",
          );
          return Response.json(
            { message: "Failed to delete chapter" },
            { status: 500 },
          );
        }

        await Promise.allSettled(
          imageIds.map((imageId) =>
            unlink(`${CHAPTER_IMAGES_DIR}/${imageId}.webp`),
          ),
        );

        return new Response(null, { status: 204 });
      },
    },
  },
});
