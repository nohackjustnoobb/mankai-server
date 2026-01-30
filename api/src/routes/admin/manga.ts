import HyperExpress from "hyper-express";
import prisma from "../../utils/prisma";
import sharp from "sharp";
import { cleanupOrphanImages } from "../../utils/cleanup";

function setupAdminMangaRoutes(server: HyperExpress.Server) {
  server.post("/admin/api/manga", async (request, response) => {
    try {
      const { title, status, description, authors, genres, remarks, cover } =
        await request.json();

      const manga = await prisma.$transaction(async (tx) => {
        const manga = await tx.manga.create({
          data: {
            title,
            status,
            description,
            authors,
            genres,
            remarks,
            cover: cover ? { create: {} } : undefined,
          },
          include: {
            cover: true,
          },
        });

        if (cover && manga.cover) {
          const buffer = Buffer.from(cover, "base64");
          await sharp(buffer)
            .webp()
            .toFile(`./data/images/${manga.cover.id}.webp`);
        }

        return manga;
      });

      response.status(201).json(manga);
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "Internal server error" });
    }
  });

  server.get("/admin/api/manga/:id", async (request, response) => {
    try {
      const { id } = request.params;

      const manga = await prisma.manga.findUnique({
        where: {
          id: Number(id),
        },
        include: {
          cover: true,
          chapterGroups: {
            include: {
              chapters: {
                include: {
                  images: true,
                },
              },
            },
          },
        },
      });

      response.json(manga);
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "Internal server error" });
    }
  });

  server.patch("/admin/api/manga/:id", async (request, response) => {
    try {
      const { id } = request.params;
      const {
        title,
        status,
        description,
        authors,
        genres,
        remarks,
        cover,
        chapterGroups,
      } = await request.json();

      const manga = await prisma.$transaction(async (tx) => {
        // Update direct Manga fields
        const updatedManga = await tx.manga.update({
          where: { id: Number(id) },
          data: {
            title,
            status,
            description,
            authors,
            genres,
            remarks,
            cover: cover
              ? {
                  upsert: {
                    create: {},
                    update: {},
                  },
                }
              : undefined,
          },
          include: {
            cover: true,
          },
        });

        // Handle nested ChapterGroup updates
        if (chapterGroups && Array.isArray(chapterGroups)) {
          for (const group of chapterGroups) {
            if (group.id) {
              await tx.chapterGroup.update({
                where: { id: group.id },
                data: {
                  title: group.title,
                  sequence: group.sequence,
                },
              });

              // Handle nested Chapter updates
              if (group.chapters && Array.isArray(group.chapters)) {
                for (const chapter of group.chapters) {
                  if (chapter.id) {
                    await tx.chapter.update({
                      where: { id: chapter.id },
                      data: {
                        title: chapter.title,
                        sequence: chapter.sequence,
                        locked: chapter.locked,
                      },
                    });

                    // Handle nested Image updates
                    if (chapter.images && Array.isArray(chapter.images)) {
                      for (const image of chapter.images) {
                        if (image.id) {
                          await tx.image.update({
                            where: { id: image.id },
                            data: {
                              sequence: image.sequence,
                            },
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }

        if (cover && updatedManga.cover) {
          const buffer = Buffer.from(cover, "base64");
          await sharp(buffer)
            .webp()
            .toFile(`./data/images/${updatedManga.cover.id}.webp`);
        }

        return updatedManga;
      });

      response.json(manga);
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "Internal server error" });
    }
  });

  server.delete("/admin/api/manga/:id", async (request, response) => {
    try {
      const { id } = request.params;

      await prisma.manga.delete({
        where: {
          id: Number(id),
        },
      });

      response.status(200).send();

      // Cleanup
      void cleanupOrphanImages();
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "Internal server error" });
    }
  });

  // ChapterGroup Routes
  server.post(
    "/admin/api/manga/:mangaId/chapter-group",
    async (request, response) => {
      try {
        const { mangaId } = request.params;
        const { title, sequence } = await request.json();

        const chapterGroup = await prisma.chapterGroup.create({
          data: {
            title,
            sequence,
            mangaId: Number(mangaId),
          },
        });

        response.status(201).json(chapterGroup);
      } catch (error) {
        console.error(error);
        response.status(500).json({ error: "Internal server error" });
      }
    },
  );

  server.delete(
    "/admin/api/manga/:mangaId/chapter-group/:groupId",
    async (request, response) => {
      try {
        const { mangaId, groupId } = request.params;

        // Verify ownership
        const group = await prisma.chapterGroup.findFirst({
          where: {
            id: Number(groupId),
            mangaId: Number(mangaId),
          },
        });

        if (!group)
          return response.status(404).json({ error: "ChapterGroup not found" });

        await prisma.chapterGroup.delete({
          where: {
            id: Number(groupId),
          },
        });

        response.status(200).send();

        // Cleanup
        void cleanupOrphanImages();
      } catch (error) {
        console.error(error);
        response.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // Chapter Routes
  server.post(
    "/admin/api/manga/:mangaId/chapter-group/:groupId/chapter",
    async (request, response) => {
      try {
        const { mangaId, groupId } = request.params;
        const { title, sequence } = await request.json();

        // Verify group belongs to manga
        const group = await prisma.chapterGroup.findFirst({
          where: {
            id: Number(groupId),
            mangaId: Number(mangaId),
          },
        });

        if (!group)
          return response.status(404).json({ error: "ChapterGroup not found" });

        const chapter = await prisma.chapter.create({
          data: {
            title,
            sequence,
            chapterGroupId: Number(groupId),
          },
        });

        response.status(201).json(chapter);
      } catch (error) {
        console.error(error);
        response.status(500).json({ error: "Internal server error" });
      }
    },
  );

  server.delete(
    "/admin/api/manga/:mangaId/chapter-group/:groupId/chapter/:chapterId",
    async (request, response) => {
      try {
        const { mangaId, groupId, chapterId } = request.params;

        // Verify nested ownership
        const chapter = await prisma.chapter.findFirst({
          where: {
            id: Number(chapterId),
            chapterGroup: {
              id: Number(groupId),
              mangaId: Number(mangaId),
            },
          },
        });

        if (!chapter)
          return response.status(404).json({ error: "Chapter not found" });

        await prisma.chapter.delete({
          where: {
            id: Number(chapterId),
          },
        });

        response.status(200).send();

        // Cleanup
        void cleanupOrphanImages();
      } catch (error) {
        console.error(error);
        response.status(500).json({ error: "Internal server error" });
      }
    },
  );

  server.post(
    "/admin/api/manga/:mangaId/chapter-group/:groupId/chapter/:chapterId/images",
    async (request, response) => {
      try {
        const { mangaId, groupId, chapterId } = request.params;
        const { images } = await request.json();

        const chapter = await prisma.chapter.findFirst({
          where: {
            id: Number(chapterId),
            chapterGroup: {
              id: Number(groupId),
              mangaId: Number(mangaId),
            },
          },
        });

        if (!chapter)
          return response.status(404).json({ error: "Chapter not found" });

        if (!images || !Array.isArray(images)) {
          return response.status(400).json({ error: "Invalid images data" });
        }

        const createdImages = [];

        await prisma.$transaction(async (tx) => {
          const lastImage = await tx.image.findFirst({
            where: { chapterId: Number(chapterId) },
            orderBy: { sequence: "desc" },
          });
          let nextSequence = (lastImage?.sequence ?? 0) + 1;

          for (const base64Image of images) {
            const image = await tx.image.create({
              data: {
                chapterId: Number(chapterId),
                sequence: nextSequence++,
              },
            });

            const buffer = Buffer.from(base64Image, "base64");
            await sharp(buffer).webp().toFile(`./data/images/${image.id}.webp`);

            createdImages.push(image);
          }
        });

        response.status(201).json(createdImages);
      } catch (error) {
        console.error(error);
        response.status(500).json({ error: "Internal server error" });
      }
    },
  );

  server.delete(
    "/admin/api/manga/:mangaId/chapter-group/:groupId/chapter/:chapterId/image/:imageId",
    async (request, response) => {
      try {
        const { mangaId, groupId, chapterId, imageId } = request.params;

        const image = await prisma.image.findFirst({
          where: {
            id: Number(imageId),
            chapter: {
              id: Number(chapterId),
              chapterGroup: {
                id: Number(groupId),
                mangaId: Number(mangaId),
              },
            },
          },
        });

        if (!image)
          return response.status(404).json({ error: "Image not found" });

        await prisma.image.update({
          where: { id: Number(imageId) },
          data: {
            chapterId: null,
          },
        });

        response.status(204).send();

        // Cleanup
        void cleanupOrphanImages();
      } catch (error) {
        console.error(error);
        response.status(500).json({ error: "Internal server error" });
      }
    },
  );
}

export { setupAdminMangaRoutes };
