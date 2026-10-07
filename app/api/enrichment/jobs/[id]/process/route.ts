import { emptyQuery, emptyBody, idParamsSchema } from "@/lib/contracts";
import { processJob } from "@/lib/enrichment";
import { getWorkspace } from "@/lib/session";
import { query, readJson, success, failure } from "@/lib/api";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    emptyQuery.parse(query(request));
    emptyBody.parse(await readJson(request));
    const { id } = idParamsSchema.parse(await context.params);
    return success(await processJob(await getWorkspace(), id));
  } catch (error) {
    return failure(error);
  }
}
