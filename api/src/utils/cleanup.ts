import { unlink } from "fs/promises";
import path from "path";
import prisma from "./prisma";
import { logger } from "./logger";

export async function cleanupOrphanImages() {
  logger.info("Starting cleanup of orphan images...");
  try {
    const orphanImages = await prisma.image.findMany({
      where: {
        AND: [{ chapterId: null }, { mangaId: null }],
      },
    });

    logger.info(`Found ${orphanImages.length} orphan images.`);

    for (const image of orphanImages) {
      try {
        // Assuming the process runs from where 'data' folder is accessible as ./data/images
        const imagePath = path.resolve(`./data/images/${image.id}.webp`);
        await unlink(imagePath);
        logger.info(`Deleted file for image ${image.id}`);
      } catch (err: any) {
        if (err.code === "ENOENT") {
          logger.warn(`File for image ${image.id} not found on disk.`);
        } else {
          logger.error(
            `Failed to delete file for image ${image.id}: ${err.message}`,
          );
        }
      }

      await prisma.image.delete({
        where: { id: image.id },
      });
      logger.info(`Deleted database record for image ${image.id}`);
    }

    logger.info("Cleanup completed.");
  } catch (error) {
    logger.error("Error during cleanup:", error);
    throw error;
  }
}
