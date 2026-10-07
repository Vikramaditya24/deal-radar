import { getWorkspace } from "@/lib/session";
import { listSuppressions, addSuppressions } from "@/lib/suppression";
import { emptyQuery, suppressionWriteSchema } from "@/lib/contracts";
import { query, readJson, success, failure } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    emptyQuery.parse(query(request));
    return success(await listSuppressions(await getWorkspace()));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    emptyQuery.parse(query(request));
    return success(
      await addSuppressions(await getWorkspace(), [
        suppressionWriteSchema.parse(await readJson(request)),
      ]),
    );
  } catch (e) {
    return failure(e);
  }
}
