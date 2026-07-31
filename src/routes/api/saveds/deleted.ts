import { createFileRoute } from "@tanstack/react-router";

import { apiLogger } from "#/lib/logger.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";
import { parsePagination, fetchDeletedSaveds } from "#/utils/sync.server";

export const Route = createFileRoute("/api/saveds/deleted")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ request, context }) => {
        const { userId } = context;
        const pagination = parsePagination(request);

        try {
          const saveds = await fetchDeletedSaveds(userId, pagination);
          return Response.json(saveds);
        } catch (error) {
          apiLogger.error({ err: error }, "failed to retrieve deleted items");
          return Response.json(
            { error: "Failed to retrieve deleted items" },
            { status: 400 },
          );
        }
      },
    },
  },
});
