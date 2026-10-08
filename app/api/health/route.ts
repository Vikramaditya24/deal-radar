import { version } from "@/package.json";
import { workspaces } from "@/lib/schema";
import { getDb } from "@/lib/db";
import { emptyQuery } from "@/lib/contracts";
import { success, failure, query } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    emptyQuery.parse(query(request));
    const db = await getDb();
    await db.select({ id: workspaces.id }).from(workspaces).limit(1);
    return success({ status: "ok", database: "libsql", version });
  } catch (error) {
    return failure(error);
  }
}
