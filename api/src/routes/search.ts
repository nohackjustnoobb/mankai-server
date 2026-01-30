import HyperExpress, { Request, Response } from "hyper-express";
import prisma from "../utils/prisma";
import { Manga, Status } from "../utils/models";

function setupSearchEndpoints(server: HyperExpress.Server) {
  server.get("/api/search", async (req: Request, res: Response) => {
    try {
      const query = req.query.query as string;
      const page = parseInt(req.query.page as string) || 1;

      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      const pageSize = 50;
      const skip = (page - 1) * pageSize;

      const mangas = await prisma.manga.findMany({
        where: {
          title: {
            contains: query,
          },
        },
        skip,
        take: pageSize,
        include: {
          chapterGroups: {
            include: {
              chapters: {
                orderBy: {
                  createdAt: "desc",
                },
                take: 1,
              },
            },
          },
          cover: true,
        },
      });

      const response: Manga[] = mangas.map((m) => {
        let latestChapter: any = null;
        for (const group of m.chapterGroups) {
          if (group.chapters.length > 0) {
            if (
              !latestChapter ||
              group.chapters[0].createdAt > latestChapter.createdAt
            ) {
              latestChapter = group.chapters[0];
            }
          }
        }

        return {
          id: m.id.toString(),
          title: m.title || undefined,
          cover: m.cover?.id ? `/images/${m.cover.id}.webp` : undefined,
          status: m.status as Status,
          latestChapter: latestChapter
            ? {
                id: latestChapter.id.toString(),
                title: latestChapter.title || undefined,
                locked: latestChapter.locked,
              }
            : undefined,
        };
      });

      return res.json(response);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });
}

export { setupSearchEndpoints };
