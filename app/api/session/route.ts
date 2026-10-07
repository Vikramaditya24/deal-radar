import { getWorkspace } from "@/lib/session";
import { workspaceSummary } from "@/lib/leads";
import { emptyQuery } from "@/lib/contracts";
import { success, failure, query } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    emptyQuery.parse(query(request));
    return success(await workspaceSummary(await getWorkspace()));
  } catch (error) {
    return failure(error);
  }
}
