import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { chapter, image } from "#/db/schema.ts";
import db from "#/lib/db.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";
import { parseChapterImageReference } from "#/utils/image.server.ts";

const orderRequestSchema = z
  .array(z.string().trim().min(1))
  .min(1, "Expected a non-empty list of image references")
  .refine((references) => new Set(references).size === references.length, {
    message: "Image references must be unique",
  });

export const Route = createFileRoute("/api/edit/images/order")({
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
        const parsed = orderRequestSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            {
              message:
                parsed.error.issues[0]?.message ??
                "Invalid image order request",
            },
            { status: 400 },
          );
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

        const rows = await db.query.image.findMany({
          where: { id: { in: normalizedIds } },
          columns: { id: true, chapterId: true },
          with: {
            chapter: {
              columns: { id: true },
              with: {
                chapterGroup: {
                  columns: { id: true },
                  with: { manga: { columns: { createdBy: true } } },
                },
              },
            },
          },
        });
        if (rows.length !== normalizedIds.length) {
          return Response.json({ message: "Image not found" }, { status: 404 });
        }

        const chapterId = rows[0]?.chapterId;
        if (!chapterId || rows.some((row) => row.chapterId !== chapterId)) {
          return Response.json(
            { message: "All images must belong to the same chapter" },
            { status: 400 },
          );
        }

        if (
          context.role !== "admin" &&
          rows[0]?.chapter?.chapterGroup?.manga?.createdBy !== context.userId
        ) {
          return Response.json({ message: "Forbidden" }, { status: 403 });
        }

        try {
          const validationError = await db.transaction(async (tx) => {
            const [lockedChapter] = await tx
              .select({ id: chapter.id })
              .from(chapter)
              .where(eq(chapter.id, chapterId))
              .for("update");
            if (!lockedChapter) return "Chapter not found";

            const currentRows = await tx.query.image.findMany({
              where: { chapterId },
              columns: { id: true },
            });
            if (currentRows.length !== normalizedIds.length) {
              return "All image references must be provided exactly once";
            }

            const currentIds = new Set(currentRows.map((row) => row.id));
            if (normalizedIds.some((id) => !currentIds.has(id))) {
              return "All image references must be provided exactly once";
            }

            for (
              let sequence = 0;
              sequence < normalizedIds.length;
              sequence++
            ) {
              await tx
                .update(image)
                .set({ sequence })
                .where(eq(image.id, normalizedIds[sequence]));
            }

            return null;
          });

          if (validationError === "Chapter not found") {
            return Response.json({ message: validationError }, { status: 404 });
          }

          if (validationError) {
            return Response.json({ message: validationError }, { status: 400 });
          }

          return new Response(null, { status: 204 });
        } catch (databaseError) {
          console.error("Failed to order editor images:", databaseError);
          return Response.json(
            { message: "Failed to order images" },
            { status: 500 },
          );
        }
      },
    },
  },
});
