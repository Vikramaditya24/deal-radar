import { and, count, eq, like, or, asc, desc, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { leads, theses, workspaces } from "./schema";
import {
  scoreSchema,
  draftSchema,
  factsSchema,
  evidenceSchema,
  signalSchema,
  sourceSchema,
  type LeadListItem,
  type LeadDetail,
} from "./contracts";
import { sampleBusinesses, sampleThesis } from "../data/sample";
import { getThesis } from "./assessment";
import { isSuppressed } from "./enrichment";
import { scoreIsStale } from "./scoring";
import { ApiError } from "./api";
export async function loadDemo(workspaceId: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [workspace] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace) throw new ApiError(404, "NOT_FOUND", "Workspace not found");
    if (workspace.demoLoadedAt !== null) return;
    const now = Date.now();
    for (const business of sampleBusinesses()) {
      const [alreadyImported] = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            eq(leads.workspaceId, workspaceId),
            eq(leads.domain, business.domain),
            eq(leads.synthetic, true),
          ),
        )
        .limit(1);
      if (alreadyImported) continue;
      await tx
        .insert(leads)
        .values({
          id: `${workspaceId}:${business.key}`,
          workspaceId,
          name: business.name,
          normalizedName: business.name.toLowerCase(),
          domain: business.domain,
          normalizedPhone: business.facts.phone?.replace(/\D/g, "") ?? null,
          synthetic: true,
          facts: business.facts,
          evidence: business.evidence,
          signals: [],
          sources: business.sources,
          mergeHistory: [],
          score: null,
          drafts: [],
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
    }
    await tx
      .insert(theses)
      .values({
        id: `${workspaceId}:sample-thesis`,
        workspaceId,
        name: "Established recurring services",
        criteria: sampleThesis,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    await tx
      .update(workspaces)
      .set({ demoLoadedAt: now })
      .where(eq(workspaces.id, workspaceId));
  });
  return workspaceSummary(workspaceId);
}
export async function workspaceSummary(workspaceId: string) {
  const db = await getDb();
  const [workspace] = await db
    .select({ demoLoadedAt: workspaces.demoLoadedAt })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  const [leadCount] = await db
    .select({ value: count() })
    .from(leads)
    .where(eq(leads.workspaceId, workspaceId));
  const [thesisCount] = await db
    .select({ value: count() })
    .from(theses)
    .where(eq(theses.workspaceId, workspaceId));
  const [syntheticCount] = await db
    .select({ value: count() })
    .from(leads)
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.synthetic, true)));
  return {
    syntheticCount: syntheticCount.value,
    demoLoaded: workspace?.demoLoadedAt != null,
    leadCount: leadCount.value,
    thesisCount: thesisCount.value,
  };
}
export async function listLeads(
  workspaceId: string,
  filters: {
    page: number;
    limit: number;
    q: string;
    synthetic?: "true" | "false";
    thesisId?: string;
    sort?: "name" | "score";
  },
) {
  const db = await getDb();
  const thesis = filters.thesisId
    ? await getThesis(workspaceId, filters.thesisId)
    : null;
  const date = new Date().toISOString().slice(0, 10);
  const safeSearch = filters.q.replace(/[\%_]/g, "");
  const where = and(
    eq(leads.workspaceId, workspaceId),
    safeSearch
      ? or(
          like(leads.name, `%${safeSearch}%`),
          like(leads.domain, `%${safeSearch}%`),
        )
      : undefined,
    filters.synthetic
      ? eq(leads.synthetic, filters.synthetic === "true")
      : undefined,
  );
  const [total] = await db.select({ value: count() }).from(leads).where(where);
  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      domain: leads.domain,
      stage: leads.stage,
      synthetic: leads.synthetic,
      enrichmentStatus: leads.enrichmentStatus,
      facts: leads.facts,
      createdAt: leads.createdAt,
      revision: leads.revision,
      score: leads.score,
    })
    .from(leads)
    .where(where)
    .orderBy(
      ...(filters.sort === "score" && thesis
        ? [
            desc(
              sql`CASE WHEN json_extract(${leads.score}, '$.thesisId') = ${thesis.id} AND json_extract(${leads.score}, '$.thesisRevision') = ${thesis.revision} AND json_extract(${leads.score}, '$.leadRevision') = ${leads.revision} AND json_extract(${leads.score}, '$.assessmentDate') = ${date} THEN json_extract(${leads.score}, '$.total') ELSE -1 END`,
            ),
          ]
        : []),
      asc(leads.name),
      asc(leads.id),
    )
    .limit(filters.limit)
    .offset((filters.page - 1) * filters.limit);
  const items: LeadListItem[] = rows.map((row) => ({
    ...row,
    score:
      row.score &&
      (!thesis || !scoreIsStale(row.score, row.revision, thesis, date))
        ? scoreSchema.parse(row.score)
        : null,
    facts: factsSchema.parse(row.facts),
  }));
  return {
    items,
    total: total.value,
    page: filters.page,
    limit: filters.limit,
  };
}
export async function leadDetail(
  workspaceId: string,
  id: string,
): Promise<LeadDetail> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Business not found");
  const evidence = evidenceSchema.array().max(100).parse(row.evidence);
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    stage: row.stage,
    synthetic: row.synthetic,
    enrichmentStatus: row.enrichmentStatus,
    facts: factsSchema.parse(row.facts),
    score: row.score ? scoreSchema.parse(row.score) : null,
    drafts: draftSchema.array().parse(row.drafts),
    suppressed: await isSuppressed(workspaceId, row),
    evidenceCount: evidence.length,
    evidence,
    signals: signalSchema.array().parse(row.signals),
    sources: sourceSchema.array().parse(row.sources),
    revision: row.revision,
    createdAt: row.createdAt,
  };
}
export async function createLocalWorkspace() {
  const db = await getDb();
  await db
    .insert(workspaces)
    .values({
      id: "local-workspace",
      sessionTokenHash: `seed-${randomUUID()}`,
      createdAt: Date.now(),
    })
    .onConflictDoNothing();
  return "local-workspace";
}
