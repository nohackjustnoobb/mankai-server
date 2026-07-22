import { createFileRoute } from "@tanstack/react-router";

import { apiAuthMiddleware } from "#/middleware/auth.ts";
import db from "#/lib/db.server";
import { Genre, Status } from "#/utils/types.ts";
import {
  PAGE_SIZE,
  toAPIManga,
  parsePage,
  type APIManga,
} from "#/utils/api.server.ts";

const GENRE_VALUES = new Set<string>(Object.values(Genre));
const STATUS_VALUES = new Set<number>(
  Object.values(Status).filter((v): v is number => typeof v === "number"),
);

function parseGenre(value: string | null): Genre {
  const g = (value ?? Genre.All) as Genre;
  if (!GENRE_VALUES.has(g)) {
    throw new Response("Invalid genre", { status: 400 });
  }
  return g;
}

function parseStatus(value: string | null): Status {
  const n = Number(value ?? Status.Any);
  if (!Number.isInteger(n) || !STATUS_VALUES.has(n)) {
    throw new Response("Invalid status", { status: 400 });
  }
  return n as Status;
}

export const Route = createFileRoute("/api/manga/")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;

        const page = parsePage(params.get("page"));
        const genre = parseGenre(params.get("genre"));
        const status = parseStatus(params.get("status"));

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
          orderBy: { updatedAt: "desc" },
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        });

        return Response.json(rows.map(toAPIManga));
      },
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json(
            { message: "Invalid JSON body" },
            { status: 400 },
          );
        }

        if (!Array.isArray(body) || body.some((id) => typeof id !== "string")) {
          return Response.json(
            { message: "Expected a list of manga IDs" },
            { status: 400 },
          );
        }

        // Dedupe while preserving input order.
        const ids: string[] = [];
        const seen = new Set<string>();
        for (const id of body) {
          if (!seen.has(id)) {
            seen.add(id);
            ids.push(id);
          }
        }

        if (ids.length === 0) return Response.json([]);

        const rows = await db.query.manga.findMany({
          columns: { id: true, title: true, status: true },
          where: { id: { in: ids } },
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
        });

        const byId = new Map(rows.map((row) => [row.id, toAPIManga(row)]));

        const items: APIManga[] = [];
        for (const id of ids) {
          const manga = byId.get(id);
          if (manga) items.push(manga);
        }

        return Response.json(items);
      },
    },
  },
});
