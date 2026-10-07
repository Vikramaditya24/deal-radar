import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { theses } from "@/lib/schema";
import { getWorkspace } from "@/lib/session";
import { emptyQuery, thesisCriteriaSchema } from "@/lib/contracts";
import { query, success, failure } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    emptyQuery.parse(query(request));
    const db = await getDb();
    const rows = await db
      .select()
      .from(theses)
      .where(eq(theses.workspaceId, await getWorkspace()));
    return success(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        revision: row.revision,
        criteria: thesisCriteriaSchema.parse(row.criteria),
      })),
    );
  } catch (error) {
    return failure(error);
  }
}
