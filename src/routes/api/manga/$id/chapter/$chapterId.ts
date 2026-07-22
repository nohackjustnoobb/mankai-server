import { createFileRoute } from "@tanstack/react-router";

import { apiAuthMiddleware } from "#/middleware/auth.ts";
import db from "#/lib/db.server";

export const Route = createFileRoute("/api/manga/$id/chapter/$chapterId")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ params }) => {
        const { id, chapterId } = params;

        const row = await db.query.chapter.findFirst({
          where: {
            id: chapterId,
            chapterGroup: { mangaId: id },
          },
          with: {
            images: {
              columns: { id: true },
              orderBy: { sequence: "asc" },
            },
          },
        });

        if (!row) {
          return new Response("Not found", { status: 404 });
        }

        const urls = row.images.map((img) => `/image/chapter/${img.id}.webp`);

        return Response.json(urls);
      },
    },
  },
});
