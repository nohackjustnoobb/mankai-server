import HyperExpress, { Request, Response } from "hyper-express";
import prisma from "../utils/prisma";
import { Chapter, DetailedManga, Manga, Status } from "../utils/models";

function setupMangaEndpoints(server: HyperExpress.Server) {
  server.get("/api/manga", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const genre = (req.query.genre as string) || "all";
      const status = parseInt(req.query.status as string) || 0;

      const pageSize = 50;
      const skip = (page - 1) * pageSize;

      const where: any = {};

      if (status !== 0) {
        where.status = status;
      }

      if (genre !== "all") {
        where.genres = {
          contains: genre,
        };
      }

      const mangas = await prisma.manga.findMany({
        where,
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
        // Find the absolute latest chapter across all groups
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

  server.post("/api/manga", async (req: Request, res: Response) => {
    try {
      const ids: string[] = await req.json();

      if (!Array.isArray(ids)) {
        return res
          .status(400)
          .json({ error: "Invalid body, expected array of strings" });
      }

      const numericIds = ids
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));

      const mangas = await prisma.manga.findMany({
        where: {
          id: {
            in: numericIds,
          },
        },
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

  server.get("/api/manga/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const manga = await prisma.manga.findUnique({
        where: { id },
        include: {
          chapterGroups: {
            include: {
              chapters: {
                orderBy: {
                  sequence: "asc",
                },
              },
            },
            orderBy: {
              sequence: "asc",
            },
          },
          cover: true,
        },
      });

      if (!manga) {
        return res.status(404).json({ error: "Manga not found" });
      }

      let latestChapter: any = null;
      const allChapters = manga.chapterGroups.flatMap((g) => g.chapters);
      if (allChapters.length > 0) {
        latestChapter = allChapters.reduce((prev, current) =>
          prev.createdAt > current.createdAt ? prev : current,
        );
      }

      const chaptersRecord: Record<string, Chapter[]> = {};
      for (const group of manga.chapterGroups) {
        const groupKey = group.title || String(group.id);
        if (!chaptersRecord[groupKey]) {
          chaptersRecord[groupKey] = [];
        }
        chaptersRecord[groupKey].push(
          ...group.chapters.map((c) => ({
            id: c.id.toString(),
            title: c.title || undefined,
            locked: c.locked,
          })),
        );
      }

      const response: DetailedManga = {
        id: manga.id.toString(),
        title: manga.title || undefined,
        cover: manga.cover?.id ? `/images/${manga.cover.id}.webp` : undefined,
        status: manga.status as Status,
        latestChapter: latestChapter
          ? {
              id: latestChapter.id.toString(),
              title: latestChapter.title || undefined,
              locked: latestChapter.locked,
            }
          : undefined,
        description: manga.description || undefined,
        updatedAt: manga.updatedAt.getTime(),
        authors: manga.authors ? manga.authors.split("|") : [],
        genres: manga.genres ? manga.genres.split("|") : [],
        chapters: chaptersRecord,
        remarks: manga.remarks,
      };

      return res.json(response);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  server.get(
    "/api/manga/:id/chapter/:chapterId",
    async (req: Request, res: Response) => {
      try {
        const chapterId = parseInt(req.params.chapterId);
        if (isNaN(chapterId)) {
          return res.status(400).json({ error: "Invalid Chapter ID" });
        }

        const chapter = await prisma.chapter.findUnique({
          where: { id: chapterId },
          include: {
            images: {
              orderBy: {
                sequence: "asc",
              },
            },
          },
        });

        if (!chapter) {
          return res.status(404).json({ error: "Chapter not found" });
        }

        const images = chapter.images.map((img) => `/images/${img.id}.webp`);

        return res.json(images);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );
}

export { setupMangaEndpoints };
