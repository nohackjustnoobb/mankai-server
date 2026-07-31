import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

import db from "#/lib/db.server";
import { apiLogger } from "#/lib/logger.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";

export const Route = createFileRoute("/api/saveds/hash")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ context }) => {
        const { userId } = context;

        try {
          // Fetch all saved items for the user, sorted by primary key
          const saveds = await db.query.saved.findMany({
            where: { userId, isDeleted: false },
            orderBy: { mangaId: "asc", pluginId: "asc" },
            columns: {
              mangaId: true,
              pluginId: true,
              datetime: true,
              updates: true,
              latestChapter: true,
            },
          });

          // Concatenate primary keys
          const keyString = saveds
            .map((s) => `${s.mangaId}|${s.pluginId}`)
            .join("");

          const hash = createHash("sha256").update(keyString).digest("hex");

          return Response.json({ hash });
        } catch (error) {
          apiLogger.error({ err: error }, "failed to generate saved-item hash");
          return Response.json(
            { error: "Failed to generate hash" },
            { status: 400 },
          );
        }
      },
    },
  },
});
