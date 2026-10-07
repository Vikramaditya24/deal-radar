import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { theses } from "@/lib/schema";
import { getWorkspace } from "@/lib/session";
import { emptyQuery, idParamsSchema } from "@/lib/contracts";
import { thesisUpdateSchema } from "@/lib/assessment";
import { ApiError, query, readJson, success, failure } from "@/lib/api";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    emptyQuery.parse(query(request));
    const { id } = idParamsSchema.parse(await context.params),
      input = thesisUpdateSchema.parse(await readJson(request)),
      db = await getDb();
    const [row] = await db
      .update(theses)
      .set({
        name: input.name,
        criteria: input.criteria,
        revision: input.revision + 1,
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(theses.id, id),
          eq(theses.workspaceId, await getWorkspace()),
          eq(theses.revision, input.revision),
        ),
      )
      .returning();
    if (!row)
      throw new ApiError(
        409,
        "STALE_THESIS",
        "Thesis unavailable or changed; reload before editing",
      );
    return success({
      id: row.id,
      name: row.name,
      revision: row.revision,
      criteria: row.criteria,
    });
  } catch (e) {
    return failure(e);
  }
}
