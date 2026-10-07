import { getWorkspace } from "@/lib/session";
import { listLeads } from "@/lib/leads";
import { leadQuerySchema } from "@/lib/contracts";
import { query, success, failure } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return success(
      await listLeads(
        await getWorkspace(),
        leadQuerySchema.parse(query(request)),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
