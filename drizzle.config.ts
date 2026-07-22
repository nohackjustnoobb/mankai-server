import { defineConfig } from "drizzle-kit";
import { client } from "#/lib/db.server.ts";

const usePglite =
  process.env.USE_PGLITE !== "0" && process.env.USE_PGLITE !== "false";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  ...(usePglite
    ? {
        driver: "pglite" as const,
        dbCredentials: {
          url: process.env.DATABASE_URL!,
          // `client` is supported via a patch to drizzle-kit
          client: client,
        },
      }
    : {
        dbCredentials: {
          url: process.env.DATABASE_URL!,
        },
      }),
});
