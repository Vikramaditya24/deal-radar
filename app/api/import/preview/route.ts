import { emptyQuery } from "@/lib/contracts";
import { importSchema, previewImport } from "@/lib/ingest";
import { getWorkspace } from "@/lib/session";
import { query, readJson, success, failure } from "@/lib/api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    emptyQuery.parse(query(request));
    const input = importSchema.parse(await readJson(request, 4 * 1024 * 1024));
    return success(await previewImport(await getWorkspace(), input));
  } catch (error) {
    return failure(error);
  }
}
