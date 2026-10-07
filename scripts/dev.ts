import { loadEnvConfig } from "@next/env";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { databaseConfig, closeDb } from "../lib/db";
import { migrateDatabase } from "./migrate";
async function main() {
  loadEnvConfig(process.cwd(), true);
  if (databaseConfig().local) {
    await migrateDatabase();
    closeDb();
  } else
    console.log(
      "Hosted database selected; run npm run db:migrate explicitly before startup.",
    );
  const require = createRequire(import.meta.url);
  const child = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", env: process.env },
  );
  const stop = () => child.kill("SIGTERM");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
}
main().catch((error) => {
  console.error(error.message);
  closeDb();
  process.exitCode = 1;
});
