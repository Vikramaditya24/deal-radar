import { getWorkspace } from "@/lib/session";
import { leadDetail } from "@/lib/leads";
import { idParamsSchema, emptyQuery } from "@/lib/contracts";
import { query, success, failure } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    emptyQuery.parse(query(request));
    const { id } = idParamsSchema.parse(await context.params);
    return success(await leadDetail(await getWorkspace(), id));
  } catch (error) {
    return failure(error);
  }
}
