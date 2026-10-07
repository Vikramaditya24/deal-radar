import { getWorkspace } from "@/lib/session";
import { prepareExport, csvStream, exportQuerySchema } from "@/lib/export";
import { query, failure } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const input = exportQuerySchema.parse(query(request));
    const prepared = await prepareExport(await getWorkspace(), input);
    return new Response(csvStream(prepared), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="deal-radar-${input.format}.csv"`,
        "Cache-Control": "no-store",
        "X-Export-Count": String(prepared.rows.length),
      },
    });
  } catch (e) {
    return failure(e);
  }
}
