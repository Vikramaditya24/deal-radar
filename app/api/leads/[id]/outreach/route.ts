import { getWorkspace } from "@/lib/session";
import { emptyQuery, idParamsSchema } from "@/lib/contracts";
import {
  outreachRequestSchema,
  outreachEditSchema,
  saveOutreach,
} from "@/lib/assessment";
import { query, readJson, success, failure } from "@/lib/api";
export const runtime = "nodejs";
async function handle(
  request: Request,
  context: { params: Promise<{ id: string }> },
  edit: boolean,
) {
  try {
    emptyQuery.parse(query(request));
    const { id } = idParamsSchema.parse(await context.params),
      body = await readJson(request);
    const input = edit
      ? outreachEditSchema.parse(body)
      : outreachRequestSchema.parse(body);
    return success(
      await saveOutreach(
        await getWorkspace(),
        id,
        input,
        edit ? outreachEditSchema.parse(input) : undefined,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export const POST = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => handle(request, context, false);
export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => handle(request, context, true);
