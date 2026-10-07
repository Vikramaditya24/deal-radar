import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "./db";
import { leads, suppressions, enrichmentJobs } from "./schema";
import { suppressionWriteSchema } from "./contracts";
import { canonicalDomain, normalizedPhone } from "./dedupe";
import { ApiError } from "./api";
export function matchesSuppression(
  s: typeof suppressions.$inferSelect,
  lead: Pick<
    typeof leads.$inferSelect,
    "id" | "domain" | "facts" | "normalizedPhone"
  >,
) {
  return (
    (s.kind === "lead" && s.normalizedValue === lead.id) ||
    (s.kind === "domain" && s.normalizedValue === lead.domain) ||
    (s.kind === "email" &&
      s.normalizedValue === lead.facts.email?.toLowerCase()) ||
    (s.kind === "phone" &&
      (s.normalizedValue === normalizedPhone(lead.facts.phone) ||
        s.normalizedValue === normalizedPhone(lead.normalizedPhone)))
  );
}
// One correlated EXISTS keeps filtering, display and CSV policy consistent.
export function suppressedSql(workspaceId: string) {
  return sql<boolean>`EXISTS (SELECT 1 FROM suppression s WHERE s.workspace_id = ${workspaceId} AND ((s.kind = 'lead' AND s.normalized_value = ${leads.id}) OR (s.kind = 'domain' AND s.normalized_value = ${leads.domain}) OR (s.kind = 'email' AND s.normalized_value = lower(json_extract(${leads.facts}, '$.email'))) OR (s.kind = 'phone' AND (s.normalized_value = ${leads.normalizedPhone} OR s.normalized_value = CASE WHEN length(${leads.normalizedPhone}) = 10 THEN '1' || ${leads.normalizedPhone} ELSE ${leads.normalizedPhone} END))))`;
}
export async function listSuppressions(workspaceId: string) {
  return (await getDb())
    .select()
    .from(suppressions)
    .where(eq(suppressions.workspaceId, workspaceId))
    .orderBy(suppressions.createdAt);
}
export function normalizeSuppression(
  kind: z.infer<typeof suppressionWriteSchema>["kind"],
  value: string,
) {
  if (kind === "email") return z.email().parse(value).toLowerCase();
  if (kind === "phone") {
    const phone = normalizedPhone(value);
    if (!phone || phone.length < 7 || phone.length > 15)
      throw new ApiError(
        400,
        "INVALID_PHONE",
        "Use 7–15 digits, with a country code",
      );
    return phone;
  }
  if (kind === "domain") {
    try {
      const domain = canonicalDomain(value);
      if (!domain.includes(".") || /[\s@]/.test(domain)) throw Error();
      return domain;
    } catch {
      throw new ApiError(400, "INVALID_DOMAIN", "Use a business domain or URL");
    }
  }
  return value;
}
export async function addSuppressions(
  workspaceId: string,
  inputs: z.infer<typeof suppressionWriteSchema>[],
) {
  const db = await getDb(),
    now = Date.now();
  const normalized = inputs.map((i) => ({
    ...i,
    normalizedValue: normalizeSuppression(i.kind, i.value),
  }));
  return db.transaction(async (tx) => {
    const leadIds = normalized
      .filter((i) => i.kind === "lead")
      .map((i) => i.normalizedValue);
    if (leadIds.length) {
      const rows = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(eq(leads.workspaceId, workspaceId), inArray(leads.id, leadIds)),
        );
      if (rows.length !== new Set(leadIds).size)
        throw new ApiError(
          404,
          "NOT_FOUND",
          "Business not found in this workspace",
        );
    }
    for (const i of normalized)
      await tx
        .insert(suppressions)
        .values({
          id: randomUUID(),
          workspaceId,
          kind: i.kind,
          normalizedValue: i.normalizedValue,
          reason: i.reason,
          createdAt: now,
        })
        .onConflictDoNothing();
    const entries = await tx
      .select()
      .from(suppressions)
      .where(eq(suppressions.workspaceId, workspaceId));
    const affected = await tx
      .select()
      .from(leads)
      .where(
        and(eq(leads.workspaceId, workspaceId), suppressedSql(workspaceId)),
      );
    for (const lead of affected)
      await tx
        .update(leads)
        .set({
          drafts: lead.drafts.map((d) => ({ ...d, stale: true })),
          enrichmentStatus: "blocked",
          updatedAt: now,
        })
        .where(eq(leads.id, lead.id));
    const jobs = await tx
      .select()
      .from(enrichmentJobs)
      .where(
        and(
          eq(enrichmentJobs.workspaceId, workspaceId),
          inArray(enrichmentJobs.status, ["pending", "running"]),
        ),
      );
    const ids = new Set(affected.map((l) => l.id));
    for (const job of jobs) {
      const progress = job.progress.map((t) =>
        ids.has(t.leadId) &&
        ["pending", "waiting", "processing"].includes(t.state)
          ? {
              ...t,
              state: "blocked" as const,
              error: "Suppressed: processing stopped",
              nextAttemptAt: null,
            }
          : t,
      );
      const completed = progress.filter((t) =>
          ["completed", "partial"].includes(t.state),
        ).length,
        failed = progress.filter((t) => t.state === "failed").length,
        blocked = progress.filter((t) => t.state === "blocked").length;
      const done = progress.every((t) =>
        ["completed", "partial", "blocked", "failed", "cancelled"].includes(
          t.state,
        ),
      );
      await tx
        .update(enrichmentJobs)
        .set({
          progress,
          completed,
          failed,
          blocked,
          status: done ? "completed" : job.status,
          updatedAt: now,
        })
        .where(eq(enrichmentJobs.id, job.id));
    }
    return { entries, affected: affected.length };
  });
}
export async function removeSuppression(workspaceId: string, id: string) {
  const db = await getDb();
  const removed = await db
    .delete(suppressions)
    .where(
      and(eq(suppressions.id, id), eq(suppressions.workspaceId, workspaceId)),
    )
    .returning({ id: suppressions.id });
  if (!removed.length)
    throw new ApiError(404, "NOT_FOUND", "Suppression not found");
  return { removed: id };
}
