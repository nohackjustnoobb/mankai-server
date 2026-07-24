import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { mkdir, unlink } from "node:fs/promises";
import { z } from "zod";

import { image, manga } from "#/db/schema.ts";
import db from "#/lib/db.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";
import { MANGA_IMAGES_DIR, MAX_IMAGE_BYTES } from "#/utils/image.server.ts";

const paramsSchema = z.object({ id: z.string().min(1) });

export const Route = createFileRoute("/api/edit/manga/$id/cover")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      POST: async ({ request, params, context }) => {
        const parsedParams = paramsSchema.safeParse(params);
        if (!parsedParams.success) {
          return Response.json(
            { message: "Invalid manga ID" },
            { status: 400 },
          );
        }
        const mangaId = parsedParams.data.id;

        const existing = await db.query.manga.findFirst({
          where: { id: mangaId },
          columns: { createdBy: true },
          with: { cover: { columns: { id: true } } },
        });

        if (!existing) {
          return Response.json({ message: "Manga not found" }, { status: 404 });
        }

        if (context.role !== "admin" && existing.createdBy !== context.userId) {
          return Response.json({ message: "Forbidden" }, { status: 403 });
        }

        const bytes = Buffer.from(await request.arrayBuffer());
        if (bytes.length === 0) {
          return Response.json(
            { message: "Cover image is required" },
            { status: 400 },
          );
        }
        if (bytes.length > MAX_IMAGE_BYTES) {
          return Response.json(
            { message: "Cover image must be 10 MB or smaller" },
            { status: 413 },
          );
        }

        const newImageId = crypto.randomUUID();
        const newFilePath = `${MANGA_IMAGES_DIR}/${newImageId}.webp`;
        try {
          await mkdir(MANGA_IMAGES_DIR, { recursive: true });
          const webpBytes = await new Bun.Image(bytes)
            .webp({ lossless: true })
            .bytes();
          await Bun.write(newFilePath, webpBytes);
        } catch (imageError) {
          console.error("Failed to encode editor cover:", imageError);
          return Response.json(
            { message: "Invalid cover image data" },
            { status: 400 },
          );
        }

        let oldImageId: string | null = null;
        try {
          await db.transaction(async (tx) => {
            const [lockedManga] = await tx
              .select({ id: manga.id })
              .from(manga)
              .where(eq(manga.id, mangaId))
              .for("update");
            if (!lockedManga) throw new Error("Manga not found");

            const deleted = await tx
              .delete(image)
              .where(eq(image.mangaId, mangaId))
              .returning();
            oldImageId = deleted[0]?.id ?? null;

            await tx.insert(image).values({
              id: newImageId,
              mangaId,
            });
          });
        } catch (databaseError) {
          console.error("Failed to save editor cover:", databaseError);
          try {
            await unlink(newFilePath);
          } catch {}

          return Response.json(
            { message: "Failed to save cover image" },
            { status: 500 },
          );
        }

        if (oldImageId) {
          try {
            await unlink(`${MANGA_IMAGES_DIR}/${oldImageId}.webp`);
          } catch {}
        }

        return new Response(null, { status: 204 });
      },
    },
  },
});
