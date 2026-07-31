import { createFileRoute } from "@tanstack/react-router";

import { apiLogger } from "#/lib/logger.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";
import {
  parsePagination,
  fetchSyncData,
  upsertRecords,
  upsertSaveds,
  type RecordInput,
  type SavedInput,
} from "#/utils/sync.server";

type SyncBody = {
  records?: RecordInput[];
  saveds?: SavedInput[];
};

export const Route = createFileRoute("/api/sync")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ request, context }) => {
        const { userId } = context;
        const pagination = parsePagination(request);

        try {
          const data = await fetchSyncData(userId, pagination);
          return Response.json(data);
        } catch (error) {
          apiLogger.error({ err: error }, "failed to fetch sync data");
          return Response.json(
            { error: "Failed to fetch sync data" },
            { status: 400 },
          );
        }
      },
      POST: async ({ request, context }) => {
        const { userId } = context;
        const pagination = parsePagination(request);

        let body: SyncBody;
        try {
          body = (await request.json()) as SyncBody;
        } catch {
          return Response.json({ error: "Failed to sync" }, { status: 400 });
        }

        const recordsToSync = Array.isArray(body.records) ? body.records : [];
        const savedsToSync = Array.isArray(body.saveds) ? body.saveds : [];

        const now = new Date();

        // --- 1. Handle Records Mutation (Upsert) ---
        const validRecords = recordsToSync.filter(
          (r) =>
            r.mangaId &&
            r.pluginId &&
            r.datetime &&
            r.chapterId &&
            r.page !== undefined,
        );
        await upsertRecords(userId, validRecords, now);

        // --- 2. Handle Saveds Mutation (Upsert) ---
        const validSaveds = savedsToSync.filter(
          (s) =>
            s.mangaId &&
            s.pluginId &&
            s.datetime &&
            s.updates !== undefined &&
            s.latestChapter !== undefined,
        );
        await upsertSaveds(userId, validSaveds, now);

        try {
          const data = await fetchSyncData(userId, pagination);
          return Response.json(data);
        } catch (error) {
          apiLogger.error({ err: error }, "failed to sync data");
          return Response.json({ error: "Failed to sync" }, { status: 400 });
        }
      },
    },
  },
});
