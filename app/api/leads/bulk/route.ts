import { getWorkspace } from "@/lib/session";
import { bulkAction } from "@/lib/leads";
import { emptyQuery, bulkWriteSchema } from "@/lib/contracts";
import { query, readJson, success, failure } from "@/lib/api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    emptyQuery.parse(query(request));
    return success(
      await bulkAction(
        await getWorkspace(),
        bulkWriteSchema.parse(await readJson(request)),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
