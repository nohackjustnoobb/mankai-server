import HyperExpress from "hyper-express";
import { setupAdminUserRoutes } from "./user";
import { setupAdminMangaRoutes } from "./manga";

function setupAdminRoutes(server: HyperExpress.Server) {
  setupAdminUserRoutes(server);
  setupAdminMangaRoutes(server);
}

export { setupAdminRoutes };
