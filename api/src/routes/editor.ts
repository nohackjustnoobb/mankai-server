import HyperExpress, { Request, Response } from "hyper-express";
import prisma from "../utils/prisma";
import { requireAuth } from "./auth";
import { logger } from "../utils/logger";
import sharp from "sharp";
import { cleanupOrphanImages } from "../utils/cleanup";

// Helper to ensure buffer from base64 or raw
function saveImage(buffer: Buffer): Promise<number> {
  return new Promise(async (resolve, reject) => {
    try {
      const image = await prisma.image.create({ data: {} });
      sharp(buffer).webp().toFile(`./data/images/${image.id}.webp`);
      resolve(image.id);
    } catch (e) {
      reject(e);
    }
  });
}
// Helper to save base64 image
async function saveBase64Image(base64Data: string): Promise<number> {
  const base64Image = base64Data.split(";base64,").pop();
  if (!base64Image) {
    throw new Error("Invalid base64 data");
  }
  const buffer = Buffer.from(base64Image, "base64");
  return saveImage(buffer);
}

function setupEditorEndpoints(server: HyperExpress.Server) {
  // Middleware to check for admin access
  server.use("/api/edit", (request, response, next) => {
    return requireAuth(request, response, () => {
      const payload = (request as any).payload;
      if (!payload || !payload.isAdmin) {
        return response.status(403).json({ error: "Forbidden" });
      }
      next();
    });
  });

  // -------------------------
  // Manga Management
  // -------------------------

  server.post("/api/edit/manga", async (req: Request, res: Response) => {
    try {
      const body = await req.json();

      const { id, title, status, description, authors, genres, remarks } = body;

      let mangaId = parseInt(id);
      let manga;

      if (!isNaN(mangaId)) {
        // Try to find existing
        const existing = await prisma.manga.findUnique({
          where: { id: mangaId },
        });
        if (existing) {
          manga = await prisma.manga.update({
            where: { id: mangaId },
            data: {
              title,
              status,
              description,
              authors: Array.isArray(authors) ? authors.join("|") : authors,
              genres: Array.isArray(genres) ? genres.join("|") : genres,
              remarks,
            },
          });
        }
      }

      if (!manga) {
        // Create new
        manga = await prisma.manga.create({
          data: {
            title,
            status,
            description,
            authors: Array.isArray(authors) ? authors.join("|") : authors,
            genres: Array.isArray(genres) ? genres.join("|") : genres,
            remarks,
          },
        });
      }

      return res.json({ id: manga.id.toString() });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  server.delete("/api/edit/manga/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      await prisma.manga.delete({ where: { id } });
      void cleanupOrphanImages();
      return res.status(200).send();
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  server.post(
    "/api/edit/manga/:id/cover",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

        const buffer = await req.buffer();
        if (!buffer || buffer.length === 0) {
          return res.status(400).json({ error: "No image data" });
        }

        const imageId = await saveImage(buffer);

        const existingCover = await prisma.image.findFirst({
          where: { mangaId: id },
        });

        const operations = [];

        if (existingCover) {
          operations.push(
            prisma.image.update({
              where: { id: existingCover.id },
              data: { mangaId: null },
            }),
          );
        }

        operations.push(
          prisma.image.update({
            where: { id: imageId },
            data: { mangaId: id },
          }),
        );

        await prisma.$transaction(operations);

        // Cleanup the old cover if it was unlinked
        void cleanupOrphanImages();

        return res.json({ id: imageId.toString() });
      } catch (error) {
        logger.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );

  // -------------------------
  // Chapter Group Management
  // -------------------------

  server.post(
    "/api/edit/chapter-group",
    async (req: Request, res: Response) => {
      try {
        const body = await req.json();
        const { id, mangaId, title } = body;

        if (!mangaId || !title) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        const mId = parseInt(mangaId);
        if (isNaN(mId))
          return res.status(400).json({ error: "Invalid Manga ID" });

        let group;
        if (id) {
          const groupId = parseInt(id);
          if (!isNaN(groupId)) {
            // Update
            group = await prisma.chapterGroup.update({
              where: { id: groupId },
              data: { title },
            });
          }
        }

        if (!group) {
          // Create
          const maxSeq = await prisma.chapterGroup.findFirst({
            where: { mangaId: mId },
            orderBy: { sequence: "desc" },
          });
          const sequence = maxSeq ? maxSeq.sequence + 1 : 0;

          group = await prisma.chapterGroup.create({
            data: {
              mangaId: mId,
              title,
              sequence,
            },
          });
        }

        return res.json({ id: group.id.toString() });
      } catch (error) {
        logger.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );

  server.delete(
    "/api/edit/chapter-group/:id",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

        await prisma.chapterGroup.delete({ where: { id } });
        void cleanupOrphanImages();
        return res.status(200).send();
      } catch (error) {
        logger.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );

  server.get(
    "/api/edit/chapter-group/id",
    async (req: Request, res: Response) => {
      try {
        const mangaId = parseInt(req.query.mangaId as string);
        const title = req.query.title as string;

        if (isNaN(mangaId) || !title) {
          return res.status(400).json({ error: "Missing parameters" });
        }

        const group = await prisma.chapterGroup.findFirst({
          where: {
            mangaId,
            title,
          },
        });

        return res.json({ id: group ? group.id.toString() : null });
      } catch (error) {
        logger.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );

  server.get(
    "/api/edit/chapter-group/:id/chapters",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

        const chapters = await prisma.chapter.findMany({
          where: { chapterGroupId: id },
          orderBy: { sequence: "asc" },
        });

        return res.json(
          chapters.map((c) => ({
            id: c.id.toString(),
            title: c.title || undefined,
            locked: c.locked,
          })),
        );
      } catch (error) {
        logger.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );

  // -------------------------
  // Chapter Management
  // -------------------------

  server.post("/api/edit/chapter", async (req: Request, res: Response) => {
    try {
      const body = await req.json();
      const { id, title, chapterGroupId } = body;

      if (!title || !chapterGroupId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const cgId = parseInt(chapterGroupId);
      if (isNaN(cgId))
        return res.status(400).json({ error: "Invalid Chapter Group ID" });

      let chapter;
      if (id) {
        const cId = parseInt(id);
        if (!isNaN(cId)) {
          chapter = await prisma.chapter.update({
            where: { id: cId },
            data: { title },
          });
        }
      }

      if (!chapter) {
        const maxSeq = await prisma.chapter.findFirst({
          where: { chapterGroupId: cgId },
          orderBy: { sequence: "desc" },
        });
        const sequence = maxSeq ? maxSeq.sequence + 1 : 0;

        chapter = await prisma.chapter.create({
          data: {
            chapterGroupId: cgId,
            title,
            sequence,
          },
        });
      }

      return res.json({ id: chapter.id.toString() });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  server.delete(
    "/api/edit/chapter/:id",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

        await prisma.chapter.delete({ where: { id } });
        void cleanupOrphanImages();
        return res.status(200).send();
      } catch (error) {
        logger.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );

  server.post(
    "/api/edit/chapter/order",
    async (req: Request, res: Response) => {
      try {
        const ids: string[] = await req.json();
        if (!Array.isArray(ids)) {
          return res.status(400).json({ error: "Invalid body" });
        }

        await prisma.$transaction(
          ids.map((id, index) => {
            const cId = parseInt(id);
            if (isNaN(cId))
              return prisma.chapter.update({ where: { id: -1 }, data: {} }); // Dummy fail?

            return prisma.chapter.update({
              where: { id: cId },
              data: { sequence: index },
            });
          }),
        );

        return res.status(200).send();
      } catch (error) {
        logger.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );

  server.post(
    "/api/edit/chapter/:id/images",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

        const body = await req.json();
        const { images } = body;
        if (!Array.isArray(images)) {
          return res.status(400).json({ error: "Invalid images array" });
        }

        // Get current max sequence for images in this chapter
        const maxSeq = await prisma.image.findFirst({
          where: { chapterId: id },
          orderBy: { sequence: "desc" },
        });
        let nextSequence =
          maxSeq && maxSeq.sequence !== null ? maxSeq.sequence + 1 : 0;

        const createdImageIds: number[] = [];

        for (const base64 of images) {
          const imageId = await saveBase64Image(base64);
          await prisma.image.update({
            where: { id: imageId },
            data: {
              chapterId: id,
              sequence: nextSequence++,
            },
          });
          createdImageIds.push(imageId);
        }

        return res.json({ ids: createdImageIds.map((i) => i.toString()) });
      } catch (error) {
        logger.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );

  server.post(
    "/api/edit/images/delete",
    async (req: Request, res: Response) => {
      try {
        const urls: string[] = await req.json();
        if (!Array.isArray(urls)) {
          return res.status(400).json({ error: "Invalid body" });
        }

        const ids = urls
          .map((url) => {
            const match = url.match(/\/images\/(\d+)\.webp/);
            return match ? parseInt(match[1]) : NaN;
          })
          .filter((id) => !isNaN(id));

        if (ids.length > 0) {
          await prisma.image.updateMany({
            where: { id: { in: ids } },
            data: {
              chapterId: null,
              mangaId: null,
            },
          });

          void cleanupOrphanImages();
        }

        return res.status(200).send();
      } catch (error) {
        logger.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );

  server.post("/api/edit/images/order", async (req: Request, res: Response) => {
    try {
      const urls: string[] = await req.json();
      if (!Array.isArray(urls)) {
        return res.status(400).json({ error: "Invalid body" });
      }

      const ids = urls
        .map((url) => {
          const match = url.match(/\/images\/(\d+)\.webp/);
          return match ? parseInt(match[1]) : NaN;
        })
        .filter((id) => !isNaN(id));

      await prisma.$transaction(
        ids.map((id, index) => {
          return prisma.image.update({
            where: { id },
            data: { sequence: index },
          });
        }),
      );

      return res.status(200).send();
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });
}

export { setupEditorEndpoints };
