import { createFileRoute } from "@tanstack/react-router";
import { and, eq, exists } from "drizzle-orm";
import { z } from "zod";

import { chapterGroup, manga } from "#/db/schema.ts";
import db from "#/lib/db.server.ts";
import { apiLogger } from "#/lib/logger.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";

const chapterGroupRequestSchema = z.object({
  id: z.string().min(1).optional(),
  mangaId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required"),
});

export const Route = createFileRoute("/api/edit/chapter-group/")({
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

        const parsed = chapterGroupRequestSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            {
              message:
                parsed.error.issues[0]?.message ??
                "Invalid chapter group object",
            },
            { status: 400 },
          );
        }

        const { id, mangaId, title } = parsed.data;

        if (id) {
          try {
            const where =
              context.role === "admin"
                ? and(
                    eq(chapterGroup.id, id),
                    eq(chapterGroup.mangaId, mangaId),
                  )
                : and(
                    eq(chapterGroup.id, id),
                    eq(chapterGroup.mangaId, mangaId),
                    exists(
                      db
                        .select({ id: manga.id })
                        .from(manga)
                        .where(
                          and(
                            eq(manga.id, chapterGroup.mangaId),
                            eq(manga.createdBy, context.userId),
                          ),
                        ),
                    ),
                  );

            const [updated] = await db
              .update(chapterGroup)
              .set({ title })
              .where(where)
              .returning();

            if (!updated) {
              return Response.json(
                { message: "Chapter group not found or not editable" },
                { status: 404 },
              );
            }
            return Response.json({ id: updated.id });
          } catch (databaseError) {
            apiLogger.error(
              { err: databaseError },
              "failed to update editor chapter group",
            );
            return Response.json(
              { message: "Failed to save chapter group" },
              { status: 500 },
            );
          }
        }

        try {
          const created = await db.transaction(async (tx) => {
            const [lockedManga] = await tx
              .select({ id: manga.id })
              .from(manga)
              .where(
                context.role === "admin"
                  ? eq(manga.id, mangaId)
                  : and(
                      eq(manga.id, mangaId),
                      eq(manga.createdBy, context.userId),
                    ),
              )
              .for("update");
            if (!lockedManga) return null;

            const lastChapterGroup = await tx.query.chapterGroup.findFirst({
              columns: { sequence: true },
              where: { mangaId },
              orderBy: { sequence: "desc" },
            });

            const [row] = await tx
              .insert(chapterGroup)
              .values({
                mangaId,
                title,
                sequence: (lastChapterGroup?.sequence ?? -1) + 1,
              })
              .returning();

            return row ?? null;
          });

          if (!created) {
            return Response.json(
              { message: "Manga not found or not editable" },
              { status: 404 },
            );
          }
          return Response.json({ id: created.id });
        } catch (databaseError) {
          apiLogger.error(
            { err: databaseError },
            "failed to create editor chapter group",
          );
          return Response.json(
            { message: "Failed to save chapter group" },
            { status: 500 },
          );
        }
      },
    },
  },
});
