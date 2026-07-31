import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { apiAuthMiddleware } from "#/middleware/auth.ts";
import db from "#/lib/db.server";
import { apiLogger } from "#/lib/logger.server.ts";
import { saved } from "#/db/schema";
import {
  parsePagination,
  fetchActiveSaveds,
  type SavedInput,
} from "#/utils/sync.server";

export const Route = createFileRoute("/api/saveds/")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ request, context }) => {
        const { userId } = context;
        const pagination = parsePagination(request);

        try {
          const saveds = await fetchActiveSaveds(userId, pagination);
          return Response.json(saveds);
        } catch (error) {
          apiLogger.error({ err: error }, "failed to retrieve saved items");
          return Response.json(
            { error: "Failed to retrieve saved items" },
            { status: 400 },
          );
        }
      },
      POST: async ({ request, context }) => {
        const { userId } = context;

        let saveds: SavedInput[];
        try {
          saveds = (await request.json()) as SavedInput[];
        } catch {
          return Response.json(
            { error: "Invalid saved items" },
            { status: 400 },
          );
        }

        if (!Array.isArray(saveds)) {
          return Response.json(
            { error: "Invalid saved items" },
            { status: 400 },
          );
        }

        // Validate all items first
        for (const item of saveds) {
          const { mangaId, pluginId, datetime, updates, latestChapter } = item;
          if (
            mangaId === undefined ||
            pluginId === undefined ||
            datetime === undefined ||
            updates === undefined ||
            latestChapter === undefined
          ) {
            return Response.json(
              { error: "Missing required fields" },
              { status: 400 },
            );
          }

          const date = new Date(datetime);
          if (isNaN(date.getTime())) {
            return Response.json(
              { error: "Invalid datetime format" },
              { status: 400 },
            );
          }
        }

        try {
          // Fetch all relevant saved items in a single query
          const keys = saveds.map((s) => ({
            mangaId: s.mangaId,
            pluginId: s.pluginId,
          }));

          const storedSaveds = await db.query.saved.findMany({
            where: {
              userId,
              OR: keys,
            },
          });

          // Create a map for quick lookup
          const storedMap = new Map(
            storedSaveds.map((s) => [`${s.mangaId}|${s.pluginId}`, s]),
          );

          // Determine which items need to be updated
          const toUpdate: {
            mangaId: string;
            pluginId: string;
            data: {
              datetime: Date;
              updates: boolean;
              latestChapter: string;
              isDeleted: boolean;
            };
          }[] = [];

          for (const item of saveds) {
            const key = `${item.mangaId}|${item.pluginId}`;
            const stored = storedMap.get(key);

            if (!stored) {
              // Ignore items that don't exist in the database
              continue;
            }

            const date = new Date(item.datetime);
            if (date.getTime() > stored.datetime.getTime()) {
              toUpdate.push({
                mangaId: item.mangaId,
                pluginId: item.pluginId,
                data: {
                  datetime: date,
                  updates: item.updates,
                  latestChapter: item.latestChapter,
                  isDeleted: false,
                },
              });
            }
          }

          // Batch update all items in a transaction
          const updatedRows =
            toUpdate.length > 0
              ? await db.transaction(async (tx) => {
                  const results = await Promise.all(
                    toUpdate.map((u) =>
                      tx
                        .update(saved)
                        .set(u.data)
                        .where(
                          and(
                            eq(saved.mangaId, u.mangaId),
                            eq(saved.pluginId, u.pluginId),
                            eq(saved.userId, userId),
                          ),
                        )
                        .returning(),
                    ),
                  );
                  return results.flat();
                })
              : [];

          const updatedMap = new Map(
            updatedRows.map((r) => [`${r.mangaId}|${r.pluginId}`, r]),
          );

          // Combine updated and unchanged items
          const allResults = saveds
            .map((s) => {
              const key = `${s.mangaId}|${s.pluginId}`;
              const stored = storedMap.get(key);
              if (!stored) return null;

              return updatedMap.get(key) ?? stored;
            })
            .filter((s) => s !== null);

          return Response.json({
            message: "Saved items processed successfully",
            saveds: allResults,
          });
        } catch (error) {
          apiLogger.error({ err: error }, "failed to save item");
          return Response.json(
            { error: "Failed to save item" },
            { status: 400 },
          );
        }
      },
    },
  },
});
