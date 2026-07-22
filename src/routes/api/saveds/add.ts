import { createFileRoute } from "@tanstack/react-router";

import { apiAuthMiddleware } from "#/middleware/auth.ts";
import { upsertSaveds, type SavedInput } from "#/utils/sync.server";

export const Route = createFileRoute("/api/saveds/add")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      POST: async ({ request, context }) => {
        const { userId } = context;

        let items: SavedInput[];
        try {
          items = (await request.json()) as SavedInput[];
        } catch {
          return Response.json(
            { error: "Expected array of items" },
            { status: 400 },
          );
        }

        if (!Array.isArray(items)) {
          return Response.json(
            { error: "Expected array of items" },
            { status: 400 },
          );
        }

        if (items.length === 0) {
          return Response.json({ message: "No items to add" });
        }

        // Keep only items with all required fields
        const valid = items.filter(
          (item) =>
            item.mangaId &&
            item.pluginId &&
            item.datetime &&
            item.updates !== undefined &&
            item.latestChapter !== undefined,
        );

        await upsertSaveds(userId, valid);

        return Response.json({ message: "Items processed successfully" });
      },
    },
  },
});
