import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { chapter, chapterGroup, manga } from "#/db/schema.ts";
import db from "#/lib/db.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";

const chapterRequestSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1, "Title is required"),
  chapterGroupId: z.string().min(1, "Chapter group ID is required"),
});

export const Route = createFileRoute("/api/edit/chapter/")({
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

        const parsed = chapterRequestSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            {
              message:
                parsed.error.issues[0]?.message ?? "Invalid chapter object",
            },
            { status: 400 },
          );
        }

        const { id, chapterGroupId, title } = parsed.data;

        if (id) {
          const existing = await db.query.chapter.findFirst({
            where: { id },
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

          try {
            if (existing.chapterGroupId === chapterGroupId) {
              const [updated] = await db
                .update(chapter)
                .set({ title, updatedAt: new Date() })
                .where(eq(chapter.id, id))
                .returning();
              if (!updated) {
                return Response.json(
                  { message: "Chapter not found" },
                  { status: 404 },
                );
              }
              return Response.json({ id: updated.id });
            }

            const updated = await db.transaction(async (tx) => {
              const [lockedDestination] = await tx
                .select({ id: chapterGroup.id })
                .from(chapterGroup)
                .innerJoin(manga, eq(manga.id, chapterGroup.mangaId))
                .where(
                  context.role === "admin"
                    ? eq(chapterGroup.id, chapterGroupId)
                    : and(
                        eq(chapterGroup.id, chapterGroupId),
                        eq(manga.createdBy, context.userId),
                      ),
                )
                .for("update");
              if (!lockedDestination) return null;

              const lastChapter = await tx.query.chapter.findFirst({
                columns: { sequence: true },
                where: { chapterGroupId },
                orderBy: { sequence: "desc" },
              });

              const [row] = await tx
                .update(chapter)
                .set({
                  title,
                  chapterGroupId,
                  sequence: (lastChapter?.sequence ?? -1) + 1,
                  updatedAt: new Date(),
                })
                .where(eq(chapter.id, id))
                .returning();
              return row ?? null;
            });

            if (!updated) {
              return Response.json(
                {
                  message:
                    "Chapter or destination group not found or not editable",
                },
                { status: 404 },
              );
            }
            return Response.json({ id: updated.id });
          } catch (databaseError) {
            console.error("Failed to update editor chapter:", databaseError);
            return Response.json(
              { message: "Failed to save chapter" },
              { status: 500 },
            );
          }
        }

        try {
          const created = await db.transaction(async (tx) => {
            const [lockedGroup] = await tx
              .select({ id: chapterGroup.id })
              .from(chapterGroup)
              .innerJoin(manga, eq(manga.id, chapterGroup.mangaId))
              .where(
                context.role === "admin"
                  ? eq(chapterGroup.id, chapterGroupId)
                  : and(
                      eq(chapterGroup.id, chapterGroupId),
                      eq(manga.createdBy, context.userId),
                    ),
              )
              .for("update");
            if (!lockedGroup) return null;

            const lastChapter = await tx.query.chapter.findFirst({
              columns: { sequence: true },
              where: { chapterGroupId },
              orderBy: { sequence: "desc" },
            });

            const [row] = await tx
              .insert(chapter)
              .values({
                chapterGroupId,
                title,
                sequence: (lastChapter?.sequence ?? -1) + 1,
              })
              .returning();

            return row ?? null;
          });

          if (!created) {
            return Response.json(
              { message: "Chapter group not found or not editable" },
              { status: 404 },
            );
          }

          return Response.json({ id: created.id });
        } catch (databaseError) {
          console.error("Failed to create editor chapter:", databaseError);
          return Response.json(
            { message: "Failed to save chapter" },
            { status: 500 },
          );
        }
      },
    },
  },
});
