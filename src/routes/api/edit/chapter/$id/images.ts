import { createFileRoute } from "@tanstack/react-router";
import { desc, eq } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { z } from "zod";

import { chapter, image } from "#/db/schema.ts";
import db from "#/lib/db.server.ts";
import { apiLogger } from "#/lib/logger.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";
import {
  BASE64_IMAGE_RE,
  CHAPTER_IMAGES_DIR,
  MAX_IMAGE_BYTES,
} from "#/utils/image.server.ts";

const paramsSchema = z.object({ id: z.string().min(1) });
const imagesRequestSchema = z.object({
  images: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Image data is required")
        .regex(BASE64_IMAGE_RE, "Invalid base64 image data"),
    )
    .min(1, "Expected a non-empty list of base64 images"),
});

export const Route = createFileRoute("/api/edit/chapter/$id/images")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      POST: async ({ request, params, context }) => {
        const parsedParams = paramsSchema.safeParse(params);
        if (!parsedParams.success) {
          return Response.json(
            { message: "Invalid chapter ID" },
            { status: 400 },
          );
        }
        const chapterId = parsedParams.data.id;

        const existing = await db.query.chapter.findFirst({
          where: { id: chapterId },
          columns: { id: true },
          with: {
            chapterGroup: {
              columns: { id: true },
              with: { manga: { columns: { createdBy: true } } },
            },
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

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json(
            { message: "Invalid JSON body" },
            { status: 400 },
          );
        }
        const parsed = imagesRequestSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            {
              message:
                parsed.error.issues[0]?.message ?? "Invalid images request",
            },
            { status: 400 },
          );
        }

        type Prepared = { ok: true; id: string } | { ok: false; error: string };
        const prepared: Prepared[] = await Promise.all(
          parsed.data.images.map(async (base64) => {
            const bytes = Buffer.from(base64, "base64");
            if (bytes.length > MAX_IMAGE_BYTES) {
              return {
                ok: false,
                error: "Each image must be 10 MB or smaller",
              } as const;
            }

            const id = crypto.randomUUID();
            try {
              const webpBytes = await new Bun.Image(bytes)
                .webp({ lossless: true })
                .bytes();
              await Bun.write(`${CHAPTER_IMAGES_DIR}/${id}.webp`, webpBytes);
            } catch (error) {
              apiLogger.error(
                { err: error },
                "failed to encode chapter image",
              );
              return { ok: false, error: "Failed to save images" } as const;
            }

            return { ok: true, id } as const;
          }),
        );

        const writtenPaths = prepared
          .filter((item): item is { ok: true; id: string } => item.ok)
          .map((item) => `${CHAPTER_IMAGES_DIR}/${item.id}.webp`);

        const failed = prepared.find((item) => !item.ok);
        if (failed && !failed.ok) {
          await Promise.allSettled(writtenPaths.map((path) => unlink(path)));
          return Response.json(
            { message: failed.error },
            { status: failed.error.includes("10 MB") ? 413 : 500 },
          );
        }

        const readyToInsert = prepared.filter(
          (item): item is { ok: true; id: string } => item.ok,
        );

        try {
          await db.transaction(async (tx) => {
            const [lockedChapter] = await tx
              .select({ id: chapter.id })
              .from(chapter)
              .where(eq(chapter.id, chapterId))
              .for("update");
            if (!lockedChapter) throw new Error("Chapter not found");

            const lastImage = await tx
              .select({ sequence: image.sequence })
              .from(image)
              .where(eq(image.chapterId, chapterId))
              .orderBy(desc(image.sequence))
              .limit(1);

            let sequence = (lastImage[0]?.sequence ?? -1) + 1;
            await tx.insert(image).values(
              readyToInsert.map((item) => ({
                id: item.id,
                chapterId,
                sequence: sequence++,
              })),
            );
          });
        } catch (databaseError) {
          apiLogger.error(
            { err: databaseError },
            "failed to persist editor chapter images",
          );

          await Promise.allSettled(writtenPaths.map((path) => unlink(path)));
          return Response.json(
            { message: "Failed to save images" },
            { status: 500 },
          );
        }

        return new Response(null, { status: 204 });
      },
    },
  },
});
