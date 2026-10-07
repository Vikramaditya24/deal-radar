import { emptyQuery, idParamsSchema } from "@/lib/contracts";
import { getJob } from "@/lib/enrichment";
import { getWorkspace } from "@/lib/session";
import { query, success, failure } from "@/lib/api";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    emptyQuery.parse(query(request));
    const { id } = idParamsSchema.parse(await context.params);
    const job = await getJob(await getWorkspace(), id);
    return success({
      id: job.id,
      status: job.status,
      total: job.total,
      completed: job.completed,
      failed: job.failed,
      blocked: job.blocked,
      progress: job.progress,
      updatedAt: job.updatedAt,
    });
  } catch (error) {
    return failure(error);
  }
}
