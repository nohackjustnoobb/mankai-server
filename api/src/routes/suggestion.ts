import HyperExpress, { Request, Response } from "hyper-express";
import prisma from "../utils/prisma";

function setupSuggestionEndpoints(server: HyperExpress.Server) {
  server.get("/api/suggestion", async (req: Request, res: Response) => {
    try {
      const query = req.query.query as string;
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      const mangas = await prisma.manga.findMany({
        where: {
          title: {
            contains: query,
          },
        },
        take: 10,
        select: {
          title: true,
        },
      });

      const suggestions = mangas
        .map((m) => m.title)
        .filter((t): t is string => t !== null);

      return res.json(suggestions);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });
}

export { setupSuggestionEndpoints };
