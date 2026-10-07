import { getWorkspace } from "@/lib/session";
import { removeSuppression } from "@/lib/suppression";
import { emptyQuery, idParamsSchema, emptyBody } from "@/lib/contracts";
import { query, readJson, success, failure } from "@/lib/api";
export const runtime = "nodejs";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    emptyQuery.parse(query(request));
    emptyBody.parse(await readJson(request));
    const { id } = idParamsSchema.parse(await context.params);
    return success(await removeSuppression(await getWorkspace(), id));
  } catch (e) {
    return failure(e);
  }
}
