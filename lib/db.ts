import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
export function databaseConfig() {
  const configured =
    process.env.TURSO_DATABASE_URL || "file:./data/deal-radar.db";
  const url = configured.startsWith("file:")
    ? `file:${resolve(decodeURIComponent(configured.slice(5)))}`
    : configured;
  const local = url.startsWith("file:");
  if (!local && !url.startsWith("libsql://") && !url.startsWith("https://"))
    throw new Error("Use a file: URL locally or a hosted libSQL/HTTPS URL");
  if (local && process.env.VERCEL)
    throw new Error("Vercel requires a hosted Turso database");
  if (!local && !process.env.TURSO_AUTH_TOKEN)
    throw new Error("TURSO_AUTH_TOKEN is required for hosted Turso");
  return { url, authToken: process.env.TURSO_AUTH_TOKEN, local };
}
function connect() {
  const { url, authToken } = databaseConfig();
  const client = createClient({ url, authToken });
  const ready = client.execute("PRAGMA foreign_keys = ON");
  return { client, db: drizzle(client, { schema }), ready };
}
const globalDb = globalThis as typeof globalThis & {
  dealRadarDatabase?: ReturnType<typeof connect>;
};
export async function getDb() {
  const state = (globalDb.dealRadarDatabase ??= connect());
  await state.ready;
  return state.db;
}
export function closeDb() {
  globalDb.dealRadarDatabase?.client.close();
  delete globalDb.dealRadarDatabase;
}
