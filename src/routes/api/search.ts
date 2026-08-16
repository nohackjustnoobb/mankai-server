import { createFileRoute } from "@tanstack/react-router";
import { cosineDistance } from "drizzle-orm";

import { apiAuthMiddleware } from "#/middleware/auth.ts";
import db from "#/lib/db.server";
import { apiLogger } from "#/lib/logger.server.ts";
import { embed } from "#/utils/embedding.server";
import { Genre, Status } from "#/utils/types.ts";
import {
  PAGE_SIZE,
  parseGenre,
  parsePage,
  parseStatus,
  toAPIManga,
} from "#/utils/api.server.ts";

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
        const genre = parseGenre(params.get("genre"));
        const status = parseStatus(params.get("status"));

        let searchEmbedding: number[] | null = null;
        try {
          searchEmbedding = await embed(search);
        } catch (err) {
          apiLogger.warn({ err }, "failed to embed search query");
        }

        const rows = await db.query.manga.findMany({
          columns: { id: true, title: true, status: true },
          where: {
            status: status !== Status.Any ? status : undefined,
            genres:
              genre !== Genre.All ? { arrayContains: [genre] } : undefined,
          },
          with: {
            cover: { columns: { id: true } },
            chapterGroups: {
              orderBy: { sequence: "asc" },
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
