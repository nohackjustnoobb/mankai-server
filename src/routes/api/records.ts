import { createFileRoute } from "@tanstack/react-router";

import { apiLogger } from "#/lib/logger.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";
import {
  parsePagination,
  fetchRecords,
  upsertRecords,
  type RecordInput,
} from "#/utils/sync.server";

export const Route = createFileRoute("/api/records")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ request, context }) => {
        const { userId } = context;
        const pagination = parsePagination(request);

        try {
          const records = await fetchRecords(userId, pagination);
          return Response.json(records);
        } catch (error) {
          apiLogger.error({ err: error }, "failed to retrieve record items");
          return Response.json(
            { error: "Failed to retrieve record items" },
            { status: 400 },
          );
        }
      },
      POST: async ({ request, context }) => {
        const { userId } = context;

        let records: RecordInput[];
        try {
          records = (await request.json()) as RecordInput[];
        } catch {
          return Response.json(
            { error: "Invalid record items" },
            { status: 400 },
          );
        }

        if (!Array.isArray(records)) {
          return Response.json(
            { error: "Invalid record items" },
            { status: 400 },
          );
        }

        // Validate all items first
        for (const item of records) {
          const { mangaId, pluginId, datetime, chapterId, page } = item;
          if (
            mangaId === undefined ||
            pluginId === undefined ||
            datetime === undefined ||
            chapterId === undefined ||
            page === undefined
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

        await upsertRecords(userId, records);

        return Response.json({
          message: "Record items processed successfully",
          records,
        });
      },
    },
  },
});
