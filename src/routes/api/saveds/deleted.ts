import { createFileRoute } from "@tanstack/react-router";

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
          console.error(error);
          return Response.json(
            { error: "Failed to retrieve deleted items" },
            { status: 400 },
          );
        }
      },
    },
  },
});
