import { createFileRoute } from "@tanstack/react-router";
import { Genre } from "#/utils/types.ts";

export const Route = createFileRoute("/api/")({
  server: {
    handlers: {
      GET: () => {
        const response = {
          id: process.env.SERVER_ID?.trim() || "mankai-server",
          authenticationEnabled: true,
          editorEnabled: true,
          name: "Mankai Server",
          availableGenres: Object.values(Genre).filter((g) => g !== Genre.All),
          description:
            "Official Implementation for Showcasing the Mankai HttpPlugin API Specification",
          authors: ["Travis XU"],
          repository: "https://github.com/nohackjustnoobb/mankai-server",
        };

        return Response.json(response);
      },
    },
  },
});
