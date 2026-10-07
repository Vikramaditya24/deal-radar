import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { leads, theses, suppressions } from "./schema";
import { thesisCriteriaSchema, scoreSchema, draftSchema } from "./contracts";
import { leadDetail } from "./leads";
import { ApiError } from "./api";
import { scoreLead, hasCriteria, type Thesis } from "./scoring";
import { improveReasoning } from "./reasoning";
import { generateDraft, type Draft } from "./outreach";

export const thesisWriteSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    criteria: thesisCriteriaSchema,
  })
  .strict()
  .refine((v) => hasCriteria(v.criteria), {
    message: "Configure at least one positive criterion",
  });
export const thesisUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    criteria: thesisCriteriaSchema,
    revision: z.number().int().positive(),
  })
  .strict()
  .refine((v) => hasCriteria(v.criteria), {
    message: "Configure at least one positive criterion",
  });
export async function getThesis(
  workspaceId: string,
  id: string,
): Promise<Thesis> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(theses)
    .where(and(eq(theses.workspaceId, workspaceId), eq(theses.id, id)));
  if (!row) throw new ApiError(404, "NOT_FOUND", "Thesis not found");
  return {
    id: row.id,
    name: row.name,
    revision: row.revision,
    criteria: thesisCriteriaSchema.parse(row.criteria),
  };
}
export const scoreRequestSchema = z
  .object({
    thesisId: z.string().min(1).max(120),
    leadIds: z.array(z.string().min(1).max(120)).min(1).max(150),
    useAI: z.boolean().default(false),
  })
  .strict()
  .refine((v) => new Set(v.leadIds).size === v.leadIds.length, {
    message: "Lead IDs must be unique",
  })
  .refine((v) => !v.useAI || v.leadIds.length === 1, {
    message: "Optional AI reasoning is limited to one lead per request",
  });
export async function scoreBatch(
  workspaceId: string,
  input: z.infer<typeof scoreRequestSchema>,
) {
  const thesis = await getThesis(workspaceId, input.thesisId),
    db = await getDb(),
    date = new Date().toISOString().slice(0, 10);
  // Resolve every ID before writing; cross-workspace IDs cannot partially update a batch.
  const details = await Promise.all(
    input.leadIds.map((id) => leadDetail(workspaceId, id)),
  );
  const computed = await Promise.all(
    details.map(async (lead) => ({
      lead,
      score: input.useAI
        ? await improveReasoning(scoreLead(lead, thesis, date))
        : scoreLead(lead, thesis, date),
    })),
  );
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(theses)
      .where(
        and(eq(theses.id, thesis.id), eq(theses.workspaceId, workspaceId)),
      );
    if (current?.revision !== thesis.revision)
      throw new ApiError(409, "STALE_THESIS", "Thesis changed; score again");
    for (const { lead, score } of computed) {
      const result = await tx
        .update(leads)
        .set({ score: scoreSchema.parse(score) })
        .where(
          and(
            eq(leads.id, lead.id),
            eq(leads.workspaceId, workspaceId),
            eq(leads.revision, lead.revision),
          ),
        )
        .returning({ id: leads.id });
      if (!result.length)
        throw new ApiError(409, "STALE_LEAD", "Evidence changed; score again");
    }
  });
  return computed.map((x) => ({ id: x.lead.id, score: x.score }));
}
export const outreachRequestSchema = z
  .object({
    thesisId: z.string().min(1).max(120),
    tone: z.enum(["professional", "warm", "direct"]),
    channel: z.enum(["email", "linkedin"]),
  })
  .strict();
export const outreachEditSchema = outreachRequestSchema
  .extend({
    leadRevision: z.number().int().positive(),
    thesisRevision: z.number().int().positive(),
    text: z.string().trim().min(1).max(5000),
  })
  .strict();
export async function saveOutreach(
  workspaceId: string,
  id: string,
  input: z.infer<typeof outreachRequestSchema>,
  edit?: z.infer<typeof outreachEditSchema>,
): Promise<Draft> {
  const db = await getDb(),
    thesis = await getThesis(workspaceId, input.thesisId),
    detail = await leadDetail(workspaceId, id);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.workspaceId, workspaceId)));
    if (!row) throw new ApiError(404, "NOT_FOUND", "Business not found");
    const entries = await tx
      .select()
      .from(suppressions)
      .where(eq(suppressions.workspaceId, workspaceId));
    if (
      entries.some(
        (s) =>
          (s.kind === "lead" && s.normalizedValue === row.id) ||
          (s.kind === "domain" && s.normalizedValue === row.domain) ||
          (s.kind === "email" &&
            s.normalizedValue === row.facts.email?.toLowerCase()) ||
          (s.kind === "phone" && s.normalizedValue === row.normalizedPhone),
      )
    )
      throw new ApiError(
        403,
        "SUPPRESSED",
        "Outreach blocked by the suppression list",
      );
    const [currentThesis] = await tx
      .select()
      .from(theses)
      .where(
        and(eq(theses.id, thesis.id), eq(theses.workspaceId, workspaceId)),
      );
    if (
      row.revision !== detail.revision ||
      currentThesis?.revision !== thesis.revision
    )
      throw new ApiError(
        409,
        "STALE_DRAFT",
        "Evidence or thesis changed; regenerate the draft",
      );
    if (
      edit &&
      (edit.leadRevision !== row.revision ||
        edit.thesisRevision !== thesis.revision)
    )
      throw new ApiError(
        409,
        "STALE_DRAFT",
        "Evidence or thesis changed; regenerate the draft",
      );
    if (edit && input.channel === "linkedin" && edit.text.length > 700)
      throw new ApiError(
        400,
        "NOTE_TOO_LONG",
        "LinkedIn notes are limited to 700 characters",
      );
    const original = generateDraft(detail, thesis, input.tone, input.channel);
    const draft = edit
      ? draftSchema.parse({
          ...original,
          originalSentences: original.sentences,
          sentences: [
            {
              text: edit.text,
              kind: "user_written",
              evidenceIds: [],
              thesisFields: [],
            },
          ],
        })
      : original;
    const keep = row.drafts.filter(
      (d) =>
        !(
          d.thesisId === input.thesisId &&
          d.channel === input.channel &&
          d.tone === input.tone
        ),
    );
    await tx
      .update(leads)
      .set({ drafts: [...keep, draft].slice(-30) })
      .where(and(eq(leads.id, id), eq(leads.workspaceId, workspaceId)));
    return draft;
  });
}
