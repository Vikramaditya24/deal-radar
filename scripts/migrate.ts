import { loadEnvConfig } from "@next/env";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb, databaseConfig, closeDb } from "../lib/db";
export async function migrateDatabase() {
  loadEnvConfig(process.cwd());
  const { url, local } = databaseConfig();
  if (local)
    await mkdir(dirname(resolve(decodeURIComponent(url.slice(5)))), {
      recursive: true,
    });
  const db = await getDb();
  await migrate(db, { migrationsFolder: resolve("drizzle") });
  console.log(
    `Migrations applied (${local ? "local libSQL file" : "hosted Turso"}).`,
  );
}
if (process.argv[1]?.endsWith("migrate.ts")) {
  migrateDatabase()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
