import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { manga } from "#/db/schema.ts";
import db from "#/lib/db.server.ts";
import { apiLogger } from "#/lib/logger.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";
import { embed } from "#/utils/embedding.server.ts";
import { Genre, Status } from "#/utils/types.ts";

const STATUSES = new Set<number>(
  Object.values(Status).filter((value): value is number => {
    return typeof value === "number";
  }),
);

const mangaRequestSchema = z.object({
  id: z.string().min(1).optional(),
  title: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  status: z
    .number()
    .int()
    .refine((value) => STATUSES.has(value), "Invalid status")
    .transform((value) => value as Status)
    .optional()
    .transform((value) => value ?? null),
  description: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  authors: z.array(z.string().trim()),
  genres: z.array(z.enum(Genre)),
  remarks: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
});

export const Route = createFileRoute("/api/edit/manga/")({
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

        const parsed = mangaRequestSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            {
              message:
                parsed.error.issues[0]?.message ?? "Invalid manga object",
            },
            { status: 400 },
          );
        }
        const { id, title, description, remarks, authors, genres, status } =
          parsed.data;

        const embeddingText = [
          title ?? "",
          description ?? "",
          authors.join(", "),
          genres.join(", "),
          remarks ?? "",
        ]
          .filter(Boolean)
          .join(" \n ");

        let embedding: number[] | null = null;
        if (embeddingText) {
          try {
            embedding = await embed(embeddingText);
          } catch (embeddingError) {
            apiLogger.warn(
              { err: embeddingError },
              "failed to embed editor manga",
            );
          }
        }

        try {
          if (id) {
            const [updated] = await db
              .update(manga)
              .set({
                title,
                status,
                description,
                authors: authors.length > 0 ? authors : null,
                genres: genres.length > 0 ? genres : null,
                remarks,
                embedding,
                updatedAt: new Date(),
              })
              .where(
                context.role === "admin"
                  ? eq(manga.id, id)
                  : and(eq(manga.id, id), eq(manga.createdBy, context.userId)),
              )
              .returning();

            if (!updated) {
              return Response.json(
                { message: "Manga not found or not editable" },
                { status: 404 },
              );
            }
            return Response.json({ id: updated.id });
          }

          const [created] = await db
            .insert(manga)
            .values({
              title,
              status,
              description,
              authors: authors.length > 0 ? authors : null,
              genres: genres.length > 0 ? genres : null,
              remarks,
              embedding,
              createdBy: context.userId,
            })
            .returning();

          if (!created) throw new Error("Manga insert returned no row");
          return Response.json({ id: created.id });
        } catch (databaseError) {
          apiLogger.error(
            { err: databaseError },
            "failed to upsert editor manga",
          );
          return Response.json(
            { message: "Failed to save manga" },
            { status: 500 },
          );
        }
      },
    },
  },
});
