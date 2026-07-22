import { createFileRoute } from "@tanstack/react-router";
import { and, eq, or } from "drizzle-orm";

import { apiAuthMiddleware } from "#/middleware/auth.ts";
import db from "#/lib/db.server";
import { saved } from "#/db/schema";

type RemoveItem = {
  mangaId?: string;
  pluginId?: string;
};

export const Route = createFileRoute("/api/saveds/remove")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      POST: async ({ request, context }) => {
        const { userId } = context;

        let items: RemoveItem[];
        try {
          items = (await request.json()) as RemoveItem[];
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

        const keys = items
          .filter((i) => i.mangaId && i.pluginId)
          .map((i) => ({ mangaId: i.mangaId!, pluginId: i.pluginId! }));

        if (keys.length > 0) {
          try {
            await db
              .update(saved)
              .set({
                datetime: new Date(),
                isDeleted: true,
              })
              .where(
                and(
                  eq(saved.userId, userId),
                  or(
                    ...keys.map((k) =>
                      and(eq(saved.mangaId, k.mangaId), eq(saved.pluginId, k.pluginId)),
                    ),
                  ),
                ),
              );
          } catch (error) {
            console.error(error);
            return Response.json(
              { error: "Failed to remove items" },
              { status: 500 },
            );
          }
        }

        return Response.json({ message: "Items removed successfully" });
      },
    },
  },
});
