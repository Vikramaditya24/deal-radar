import { emptyQuery } from "@/lib/contracts";
import { jobInputSchema, createJob, listJobs } from "@/lib/enrichment";
import { getWorkspace } from "@/lib/session";
import { query, readJson, success, failure } from "@/lib/api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    emptyQuery.parse(query(request));
    return success(await listJobs(await getWorkspace()));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    emptyQuery.parse(query(request));
    const input = jobInputSchema.parse(await readJson(request));
    return success(await createJob(await getWorkspace(), input));
  } catch (error) {
    return failure(error);
  }
}
