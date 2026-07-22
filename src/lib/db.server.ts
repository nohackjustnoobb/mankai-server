import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleBunSql } from "drizzle-orm/bun-sql";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import relations from "#/db/relations";

const usePglite =
  process.env.USE_PGLITE !== "0" && process.env.USE_PGLITE !== "false";

export const client = usePglite
  ? new PGlite(process.env.DATABASE_URL!, {
      extensions: { vector },
    })
  : new Bun.SQL(process.env.DATABASE_URL!);

const db = usePglite
  ? drizzlePglite({ client: client as PGlite, relations })
  : drizzleBunSql({ client: client as Bun.SQL, relations });

export default db;
