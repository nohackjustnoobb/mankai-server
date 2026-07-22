import { createFileRoute } from "@tanstack/react-router";
import { cosineDistance } from "drizzle-orm";

import { apiAuthMiddleware } from "#/middleware/auth.ts";
import db from "#/lib/db.server";
import { embed } from "#/utils/embedding.server";

const SUGGESTION_LIMIT = 5;

export const Route = createFileRoute("/api/suggestion")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;

        const search = params.get("query")?.trim() || undefined;

        let searchEmbedding: number[] | null = null;
        if (search) {
          try {
            searchEmbedding = await embed(search);
          } catch (err) {
            console.error("Failed to embed search query:", err);
          }
        }

        const rows = await db.query.manga.findMany({
          columns: { title: true },
          orderBy: searchEmbedding
            ? (t, { asc }) => asc(cosineDistance(t.embedding, searchEmbedding!))
            : { createdAt: "desc" },
          limit: SUGGESTION_LIMIT,
        });

        const titles = Array.from(
          new Set(
            rows
              .map((row) => row.title?.trim())
              .filter((title): title is string => Boolean(title)),
          ),
        );

        return Response.json(titles);
      },
    },
  },
});
