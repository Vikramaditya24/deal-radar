import { getWorkspace } from "@/lib/session";
import { emptyQuery } from "@/lib/contracts";
import { scoreRequestSchema, scoreBatch } from "@/lib/assessment";
import { query, readJson, success, failure } from "@/lib/api";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    emptyQuery.parse(query(request));
    const input = scoreRequestSchema.parse(await readJson(request));
    return success(await scoreBatch(await getWorkspace(), input));
  } catch (e) {
    return failure(e);
  }
}
