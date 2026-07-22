import { createFileRoute } from "@tanstack/react-router";
import { cosineDistance } from "drizzle-orm";

import { apiAuthMiddleware } from "#/middleware/auth.ts";
import db from "#/lib/db.server";
import { embed } from "#/utils/embedding.server";
import { PAGE_SIZE, toAPIManga, parsePage } from "#/utils/api.server.ts";

export const Route = createFileRoute("/api/search")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;

        const search = params.get("query")?.trim();
        if (!search) {
          throw new Response("Missing search query", { status: 400 });
        }
        const page = parsePage(params.get("page"));

        let searchEmbedding: number[] | null = null;
        try {
          searchEmbedding = await embed(search);
        } catch (err) {
          console.error("Failed to embed search query:", err);
        }

        const rows = await db.query.manga.findMany({
          columns: { id: true, title: true, status: true },
          with: {
            cover: { columns: { id: true } },
            chapterGroups: {
              orderBy: { sequence: "desc" },
              limit: 1,
              with: {
                chapters: {
                  columns: { id: true, title: true, locked: true },
                  orderBy: { sequence: "desc" },
                  limit: 1,
                },
              },
            },
          },
          orderBy: searchEmbedding
            ? (t, { asc }) => asc(cosineDistance(t.embedding, searchEmbedding!))
            : { updatedAt: "desc" },
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        });

        return Response.json(rows.map(toAPIManga));
      },
    },
  },
});
