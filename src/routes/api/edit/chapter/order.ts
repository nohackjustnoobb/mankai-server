import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { chapter, chapterGroup } from "#/db/schema.ts";
import db from "#/lib/db.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";

const orderRequestSchema = z
  .array(z.string().min(1))
  .min(1, "Expected a non-empty list of chapter IDs")
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Chapter IDs must be unique",
  });

export const Route = createFileRoute("/api/edit/chapter/order")({
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
                "Invalid chapter order request",
            },
            { status: 400 },
          );
        }
        const ids = parsed.data;

        const rows = await db.query.chapter.findMany({
          where: { id: { in: ids } },
          columns: { id: true, chapterGroupId: true },
          with: {
            chapterGroup: {
              columns: { id: true },
              with: { manga: { columns: { createdBy: true } } },
            },
          },
        });

        if (rows.length !== ids.length) {
          return Response.json(
            { message: "Chapter not found" },
            { status: 404 },
          );
        }

        if (
          context.role !== "admin" &&
          rows[0]?.chapterGroup?.manga?.createdBy !== context.userId
        ) {
          return Response.json({ message: "Forbidden" }, { status: 403 });
        }

        const chapterGroupId = rows[0]?.chapterGroupId;
        if (
          !chapterGroupId ||
          rows.some((row) => row.chapterGroupId !== chapterGroupId)
        ) {
          return Response.json(
            { message: "All chapters must belong to the same group" },
            { status: 400 },
          );
        }

        try {
          const validationError = await db.transaction(async (tx) => {
            const [lockedGroup] = await tx
              .select({ id: chapterGroup.id })
              .from(chapterGroup)
              .where(eq(chapterGroup.id, chapterGroupId))
              .for("update");
            if (!lockedGroup) return "Chapter group not found";

            const currentRows = await tx.query.chapter.findMany({
              where: { chapterGroupId },
              columns: { id: true },
            });
            if (currentRows.length !== ids.length) {
              return "All chapter IDs must be provided exactly once";
            }

            const currentIds = new Set(currentRows.map((row) => row.id));
            if (ids.some((id) => !currentIds.has(id))) {
              return "All chapter IDs must be provided exactly once";
            }

            for (let sequence = 0; sequence < ids.length; sequence++) {
              await tx
                .update(chapter)
                .set({ sequence })
                .where(eq(chapter.id, ids[sequence]));
            }

            return null;
          });

          if (validationError === "Chapter group not found") {
            return Response.json({ message: validationError }, { status: 404 });
          }

          if (validationError) {
            return Response.json({ message: validationError }, { status: 400 });
          }

          return new Response(null, { status: 204 });
        } catch (databaseError) {
          console.error("Failed to order editor chapters:", databaseError);
          return Response.json(
            { message: "Failed to order chapters" },
            { status: 500 },
          );
        }
      },
    },
  },
});
