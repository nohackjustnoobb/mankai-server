import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import db from "#/lib/db.server.ts";
import { apiAuthMiddleware } from "#/middleware/auth.ts";
import type { APIChapter } from "#/utils/api.server.ts";

const paramsSchema = z.object({ id: z.string().min(1) });

export const Route = createFileRoute(
  "/api/edit/chapter-group/$id/chapters",
)({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ params }) => {
        const parsedParams = paramsSchema.safeParse(params);
        if (!parsedParams.success) {
          return Response.json(
            { message: "Invalid chapter group ID" },
            { status: 400 },
          );
        }

        const group = await db.query.chapterGroup.findFirst({
          where: { id: parsedParams.data.id },
          columns: { id: true },
          with: {
            chapters: {
              columns: { id: true, title: true, locked: true },
              orderBy: { sequence: "asc" },
            },
          },
        });
        if (!group) {
          return Response.json(
            { message: "Chapter group not found" },
            { status: 404 },
          );
        }

        const chapters: APIChapter[] = group.chapters.map((chapter) => {
          const item: APIChapter = { id: chapter.id };
          if (chapter.title) item.title = chapter.title;
          if (chapter.locked) item.locked = true;
          return item;
        });
        return Response.json(chapters);
      },
    },
  },
});
