import { getWorkspace } from "@/lib/session";
import { loadDemo } from "@/lib/leads";
import { emptyBody, emptyQuery } from "@/lib/contracts";
import { readJson, success, failure, query } from "@/lib/api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    emptyQuery.parse(query(request));
    emptyBody.parse(await readJson(request));
    return success(await loadDemo(await getWorkspace()));
  } catch (error) {
    return failure(error);
  }
}
