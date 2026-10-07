import { loadEnvConfig } from "@next/env";
import { databaseConfig, closeDb } from "../lib/db";
import { migrateDatabase } from "./migrate";
import { createLocalWorkspace, loadDemo } from "../lib/leads";
async function main() {
  loadEnvConfig(process.cwd());
  if (!databaseConfig().local)
    throw new Error(
      "CLI seeding is local only. Use the labeled demo button for hosted browser workspaces.",
    );
  await migrateDatabase();
  console.log(await loadDemo(await createLocalWorkspace()));
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
