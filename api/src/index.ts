import HyperExpress from "hyper-express";
import LiveDirectory from "live-directory";
import fs from "fs";
import { colors, logger, logRequest } from "./utils/logger";
import { requireAuth, setupAuthEndpoints } from "./routes/auth";
import { setupUserEndpoints } from "./routes/user";
import { setupAdminRoutes } from "./routes/admin/admin";
import prisma from "./utils/prisma";
import { hashPassword, verifyPassword } from "./routes/auth";
import { setupMangaEndpoints } from "./routes/manga";
import { setupSearchEndpoints } from "./routes/search";
import { setupSuggestionEndpoints } from "./routes/suggestion";
import packageJson from "../package.json";

const server = new HyperExpress.Server({
  max_body_length: 1024 * 1024 * 1024,
});

// Middleware
server.use(logRequest);
server.use("/api", (request, response, next) => {
  if (
    request.path == "/api/auth/login" ||
    request.path == "/api/auth/refresh" ||
    request.path == "/api" ||
    process.env.ENABLE_AUTH === "false"
  ) {
    return next();
  }

  return requireAuth(request, response, next);
});

server.use("/admin/api", (request, response, next) => {
  return requireAuth(request, response, () => {
    const payload = request.payload;
    if (!payload || !payload.isAdmin) {
      return response.status(403).json({ error: "Forbidden" });
    }

    next();
  });
});

// Serve static files from the "static" directory
if (!fs.existsSync("./static")) fs.mkdirSync("./static");
const staticAssets = new LiveDirectory("./static", {
  filter: {
    keep: {
      extensions: ["css", "js", "html"],
    },
    ignore: (path) => {
      return path.startsWith(".");
    },
  },
  cache: {
    max_file_count: 250,
    max_file_size: 1024 * 1024,
  },
});

server.get("/static/*", (request, response) => {
  const path = request.path.replace("/static", "");
  const file = staticAssets.get(path);

  if (file === undefined) return response.status(404).send();

  const fileParts = file.path.split(".");
  const extension = fileParts[fileParts.length - 1];

  const content = file.content;
  return response.status(200).type(extension).send(content);
});

server.get("/", (_, response) => {
  const file = staticAssets.get("index.html");
  if (file === undefined) return response.status(404).send();

  const content = file.content;
  return response.status(200).type("html").send(content);
});

// Serve "images" directory
if (!fs.existsSync("./data/images"))
  fs.mkdirSync("./data/images", { recursive: true });
const imagesAssets = new LiveDirectory("./data/images", {
  filter: {
    keep: {
      extensions: ["webp"],
    },
    ignore: (path) => {
      return path.startsWith(".");
    },
  },
  cache: {
    max_file_count: 250,
    max_file_size: 1024 * 1024,
  },
});

server.get("/api/images/*", (request, response) => {
  const path = request.path.replace("/api/images", "");
  const file = imagesAssets.get(path);

  if (file === undefined) return response.status(404).send();

  const fileParts = file.path.split(".");
  const extension = fileParts[fileParts.length - 1];

  const content = file.content;
  return response.status(200).type(extension).send(content);
});

// Api endpoint
server.get("/api", (_, response) => {
  response.json({
    id: "mankai-server",
    authenticationEnabled: process.env.ENABLE_AUTH !== "false",
    name: "Mankai Server",
    version: packageJson.version,
    description:
      "Official Implementation for Showcasing the Mankai HttpPlugin API Specification",
    authors: ["Travis XU"],
    repository: "https://github.com/nohackjustnoobb/mankai-server",
    availableGenres: [
      "all",
      "action",
      "romance",
      "yuri",
      "boysLove",
      "schoolLife",
      "adventure",
      "harem",
      "speculativeFiction",
      "war",
      "suspense",
      "fanFiction",
      "comedy",
      "magic",
      "horror",
      "historical",
      "sports",
      "mature",
      "mecha",
      "otokonoko",
    ],
  });
});

// Api endpoint
setupAuthEndpoints(server);
setupUserEndpoints(server);
setupAdminRoutes(server);
setupMangaEndpoints(server);
setupSearchEndpoints(server);
setupSuggestionEndpoints(server);

async function setupAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (email && password) {
    logger.info("Setting up admin user...");

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      const isMatch = await verifyPassword(password, existingUser.password);
      if (!isMatch) {
        const passwordHash = await hashPassword(password);
        await prisma.user.update({
          where: { email },
          data: {
            password: passwordHash,
            isAdmin: true,
          },
        });
      } else if (!existingUser.isAdmin) {
        await prisma.user.update({
          where: { email },
          data: { isAdmin: true },
        });
      }
    } else {
      const passwordHash = await hashPassword(password);
      await prisma.user.create({
        data: {
          email,
          password: passwordHash,
          isAdmin: true,
        },
      });
    }

    logger.info("Admin user setup completed.");
  }
}

// Start the server on the specified port
const PORT: number = Number(process.env.PORT) || 3000;

setupAdminUser()
  .then(() => server.listen(PORT))
  .then(() =>
    logger.info(
      `${colors.cyan}Server is running on ${colors.magenta}${PORT}${colors.reset}`,
    ),
  )
  .catch((error) =>
    logger.error(
      { error: error.message },
      `${colors.red}Failed to start server on port ${PORT}${colors.reset}`,
    ),
  );
