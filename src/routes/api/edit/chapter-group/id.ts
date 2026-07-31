import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import db from "#/lib/db.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";

const querySchema = z.object({
  mangaId: z.string().trim().min(1, "Manga ID is required"),
  index: z
    .string()
    .regex(/^\d+$/, "Index must be a non-negative integer")
    .transform(Number)
    .pipe(z.number().safe()),
});

export const Route = createFileRoute("/api/edit/chapter-group/id")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ request }) => {
        const searchParams = new URL(request.url).searchParams;
        const parsed = querySchema.safeParse({
          mangaId: searchParams.get("mangaId"),
          index: searchParams.get("index"),
        });
        if (!parsed.success) {
          return Response.json(
            {
              message:
                parsed.error.issues[0]?.message ?? "Invalid query parameters",
            },
            { status: 400 },
          );
        }

        const row = await db.query.chapterGroup.findFirst({
          where: { mangaId: parsed.data.mangaId },
          columns: { id: true },
          orderBy: { sequence: "asc" },
          offset: parsed.data.index,
        });

        return Response.json({ id: row?.id ?? null });
      },
    },
  },
});
