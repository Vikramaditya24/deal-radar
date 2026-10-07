import { parse } from "csv-parse/sync";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { getDb } from "./db";
import { leads } from "./schema";
import { ApiError } from "./api";
import {
  factsSchema,
  evidenceSchema,
  sourceSchema,
  type Facts,
  type Evidence,
} from "./contracts";
import {
  IdentityIndex,
  canonicalDomain,
  normalizedName,
  normalizedPhone,
  matchIdentity,
  identityConflicts,
  type Identity,
} from "./dedupe";
import { targetUrl } from "./crawler";
import { sampleBusinesses } from "../data/sample";
const fieldKeys = [
  "name",
  "website",
  "phone",
  "email",
  "industry",
  "city",
  "state",
  "country",
  "annual_revenue",
  "currency",
  "founded_year",
  "synthetic",
] as const;
export const importSchema = z
  .object({
    kind: z.enum(["csv", "urls"]),
    content: z
      .string()
      .min(1)
      .max(2 * 1024 * 1024),
    mapping: z
      .partialRecord(z.enum(fieldKeys), z.string().max(150))
      .default({}),
    resolutions: z
      .record(z.string().regex(/^row:\d+$/), z.string().max(150))
      .default({}),
  })
  .strict();
export type ImportInput = z.infer<typeof importSchema>;
export type ImportRow = {
  row: number;
  name: string;
  domain: string | null;
  website: string | null;
  synthetic: boolean;
  facts: Facts;
  evidence: Evidence[];
  source: z.infer<typeof sourceSchema>;
};
export const blankFacts = (): Facts =>
  factsSchema.parse({
    industry: null,
    city: null,
    state: null,
    country: null,
    revenueCents: null,
    currency: null,
    foundedYear: null,
    services: [],
    email: null,
    phone: null,
    contactPage: null,
    teamSizeHint: null,
    techHints: [],
  });
const aliases: Record<string, string[]> = {
  name: ["name", "business_name", "company", "company_name"],
  website: ["website", "url", "domain"],
  phone: ["phone", "telephone"],
  email: ["email"],
  industry: ["industry"],
  city: ["city"],
  state: ["state", "region"],
  country: ["country"],
  annual_revenue: ["annual_revenue", "revenue"],
  currency: ["currency"],
  founded_year: ["founded_year", "founding_year"],
  synthetic: ["synthetic"],
};
const headerKey = (x: string) =>
  x
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
export function parseImport(input: ImportInput) {
  if (Buffer.byteLength(input.content) > 2 * 1024 * 1024)
    throw new ApiError(413, "INPUT_TOO_LARGE", "Import limit is 2 MB");
  let raw: Record<string, string>[] = [],
    headers: string[] = [];
  if (input.kind === "csv") {
    try {
      const parsed = parse(input.content, {
        bom: true,
        skip_empty_lines: true,
        trim: true,
        max_record_size: 20_000,
      }) as string[][];
      if (!parsed.length) throw Error("CSV is empty");
      headers = parsed[0];
      if (new Set(headers.map(headerKey)).size !== headers.length)
        throw Error("Duplicate CSV headers");
      if (headers.length > 50) throw Error("Maximum 50 CSV columns");
      raw = parsed.slice(1).map((values) => {
        if (values.length !== headers.length)
          throw Error("CSV rows have inconsistent column counts");
        return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
      });
    } catch (error) {
      throw new ApiError(
        422,
        "INVALID_CSV",
        error instanceof Error ? error.message : "Invalid CSV",
      );
    }
  } else {
    const urls = input.content
      .split(/[\r\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (urls.length > 150)
      throw new ApiError(413, "TOO_MANY_URLS", "Maximum 150 pasted URLs");
    raw = urls.map((website) => ({ website }));
  }
  if (!raw.length || raw.length > 1000)
    throw new ApiError(422, "ROW_LIMIT", "Supply 1 to 1,000 rows");
  const mapping: Record<string, string> = {};
  if (input.kind === "csv")
    for (const key of fieldKeys) {
      const explicit = input.mapping[key];
      if (explicit && !headers.includes(explicit))
        throw new ApiError(422, "INVALID_MAPPING", `Unknown column for ${key}`);
      const h =
        explicit || headers.find((h) => aliases[key].includes(headerKey(h)));
      if (h) mapping[key] = h;
    }
  const rows: ImportRow[] = [],
    errors: { row: number; message: string }[] = [];
  const fixtures = new Map(sampleBusinesses().map((b) => [b.domain, b]));
  const batch = `import:${createHash("sha256").update(input.content).digest("hex").slice(0, 12)}`;
  raw.forEach((original, index) => {
    try {
      const read = (key: string) =>
        (input.kind === "urls"
          ? original[key]
          : original[mapping[key]]
        )?.trim() || "";
      const now = Date.now();
      const website = read("website")
        ? read("website").includes("://")
          ? read("website")
          : "https://" + read("website")
        : null;
      let domain: string | null = null;
      if (website) {
        const u = new URL(website);
        domain = canonicalDomain(u.href);
        if (!fixtures.has(domain)) targetUrl(u.href);
        if (u.username || u.password)
          throw Error("URL credentials not allowed");
      }
      const synthetic = !!domain && fixtures.has(domain);
      if (/^(true|yes|1)$/i.test(read("synthetic")) && !synthetic)
        throw Error("Synthetic marker requires a recognized .example fixture");
      const name = read("name") || domain;
      if (!name || name.length > 200)
        throw Error(
          "Business name or public website required (maximum 200 characters)",
        );
      const facts = blankFacts();
      for (const key of [
        "industry",
        "city",
        "state",
        "country",
        "phone",
      ] as const)
        facts[key] = read(key) || null;
      facts.email = read("email") || null;
      if (facts.email) z.email().parse(facts.email);
      if (read("founded_year")) {
        const year = Number(read("founded_year"));
        if (
          !Number.isInteger(year) ||
          year < 1800 ||
          year > new Date(now).getUTCFullYear()
        )
          throw Error("Invalid founding year");
        facts.foundedYear = year;
      }
      if (read("annual_revenue")) {
        const amount = Number(read("annual_revenue").replace(/[$,\s]/g, ""));
        if (!Number.isFinite(amount) || amount < 0 || amount > 1e11)
          throw Error("Invalid annual revenue");
        facts.currency = read("currency").toUpperCase();
        if (!["USD", "INR", "EUR", "GBP"].includes(facts.currency))
          throw Error("Revenue requires explicit USD/INR/EUR/GBP currency");
        facts.revenueCents = Math.round(amount * 100);
      }
      factsSchema.parse(facts);
      const evidence: Evidence[] = [];
      for (const [field, value] of Object.entries(facts))
        if (value !== null && (!Array.isArray(value) || value.length)) {
          evidence.push(
            evidenceSchema.parse({
              id: `${batch}:row:${index + 1}:${field}`,
              field,
              value,
              confidence: 0.65,
              sourceUrl: null,
              excerpt: `Supplied ${field} in ${batch}:row:${index + 1}; not independently verified.`,
              observedAt: now,
              method: synthetic ? "synthetic_fixture" : "import",
              synthetic,
              selected: true,
            }),
          );
        }
      rows.push({
        row: index + 1,
        name,
        domain,
        website,
        synthetic,
        facts,
        evidence,
        source: sourceSchema.parse({
          label: `${batch}:row:${index + 1}`,
          kind: synthetic ? "synthetic" : input.kind === "csv" ? "csv" : "url",
          sourceUrl: website,
          observedAt: now,
          original,
        }),
      });
    } catch (error) {
      errors.push({
        row: index + 1,
        message:
          error instanceof z.ZodError
            ? error.issues.map((i) => i.message).join("; ")
            : error instanceof Error
              ? error.message
              : "Invalid row",
      });
    }
  });
  return { rows, errors, headers, mapping, total: raw.length };
}
type Stored = typeof leads.$inferSelect;
function identity(row: ImportRow): Identity {
  return {
    id: `row:${row.row}`,
    name: row.name,
    domain: row.domain,
    phone: row.facts.phone,
    city: row.facts.city,
    state: row.facts.state,
    email: row.facts.email,
    synthetic: row.synthetic,
  };
}
function storedIdentity(row: Stored): Identity {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    phone: row.facts.phone,
    city: row.facts.city,
    state: row.facts.state,
    email: row.facts.email,
    synthetic: row.synthetic,
  };
}
export function planImport(
  rows: ImportRow[],
  existing: Stored[],
  resolutions: Record<string, string>,
) {
  const index = new IdentityIndex(),
    members = new Map<string, Identity[]>();
  existing.forEach((r) => {
    const i = storedIdentity(r);
    index.add(i);
    members.set(i.id, [i]);
  });
  return rows.map((row) => {
    const current = identity(row);
    const candidates = index
      .candidates(current)
      .map((candidate) => {
        const match = matchIdentity(current, candidate);
        if (!match) return null;
        const clusterConflicts = [
          ...new Set(
            (members.get(candidate.id) || [candidate]).flatMap((m) =>
              identityConflicts(current, m),
            ),
          ),
        ];
        return {
          ...match,
          conflicts: clusterConflicts,
          automatic: match.automatic && !clusterConflicts.length,
          id: candidate.id,
          name: candidate.name,
        };
      })
      .filter((v): v is NonNullable<typeof v> => !!v)
      .sort(
        (a, b) =>
          Number(b.automatic) - Number(a.automatic) ||
          b.similarity - a.similarity,
      )
      .slice(0, 5);
    const requested = resolutions[current.id];
    if (
      requested &&
      requested !== "separate" &&
      !candidates.some((c) => c.id === requested)
    )
      throw new ApiError(
        422,
        "STALE_RESOLUTION",
        "Duplicate review changed. Preview the import again.",
      );
    const automatic = candidates.filter((c) => c.automatic);
    const target =
      requested && requested !== "separate"
        ? requested
        : requested === "separate"
          ? null
          : automatic.length === 1
            ? automatic[0].id
            : null;
    if (target) {
      const previous = members.get(target) || [];
      const base = previous[0];
      members.set(target, [...previous, current]);
      if (base)
        index.add({
          ...base,
          id: target,
          domain: base.domain || current.domain,
          phone: base.phone || current.phone,
          city: base.city || current.city,
          state: base.state || current.state,
          email: base.email || current.email,
        });
    } else {
      index.add(current);
      members.set(current.id, [current]);
    }
    return {
      row: row.row,
      name: row.name,
      targetId: target,
      candidates,
      decision: target ? ("merge" as const) : ("new" as const),
    };
  });
}
export function mergeAssertions(old: Evidence[], incoming: Evidence[]) {
  const evidence = [...old];
  for (const assertion of incoming) {
    const existing = evidence.find((e) => e.id === assertion.id);
    if (existing) continue;
    const selected = evidence.filter(
      (e) => e.field === assertion.field && e.selected,
    );
    const best = selected.sort(
      (a, b) => b.confidence - a.confidence || b.observedAt - a.observedAt,
    )[0];
    const use =
      !best ||
      assertion.confidence > best.confidence ||
      (assertion.confidence === best.confidence &&
        assertion.observedAt >= best.observedAt);
    if (use)
      evidence.forEach((e) => {
        if (e.field === assertion.field) e.selected = false;
      });
    evidence.push({ ...assertion, selected: use });
  }
  return evidence
    .sort(
      (a, b) =>
        Number(b.selected) - Number(a.selected) || b.observedAt - a.observedAt,
    )
    .slice(0, 100);
}
export function selectedFacts(previous: Facts, evidence: Evidence[]): Facts {
  const facts = { ...previous };
  for (const e of evidence.filter((e) => e.selected)) {
    if (e.field in facts) (facts as Record<string, unknown>)[e.field] = e.value;
  }
  return factsSchema.parse(facts);
}
export async function previewImport(workspaceId: string, input: ImportInput) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(leads)
    .where(eq(leads.workspaceId, workspaceId))
    .limit(5001);
  if (existing.length > 5000)
    throw new ApiError(
      413,
      "WORKSPACE_LIMIT",
      "This assessment build supports up to 5,000 stored targets",
    );
  const parsed = parseImport(input);
  const plan = planImport(parsed.rows, existing, input.resolutions);
  return {
    headers: parsed.headers,
    mapping: parsed.mapping,
    total: parsed.total,
    valid: parsed.rows.length,
    errors: parsed.errors,
    duplicatesMerged: plan.filter((p) => p.targetId).length,
    reviewNeeded: plan.filter((p) => !p.targetId && p.candidates.length).length,
    plan,
  };
}
export async function ingest(workspaceId: string, input: ImportInput) {
  const db = await getDb(),
    parsed = parseImport(input);
  if (!parsed.rows.length)
    throw new ApiError(
      422,
      "NO_VALID_ROWS",
      "No valid business records to import",
    );
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(leads)
      .where(eq(leads.workspaceId, workspaceId))
      .limit(5001);
    if (existing.length + parsed.rows.length > 5000)
      throw new ApiError(
        413,
        "WORKSPACE_LIMIT",
        "Maximum 5,000 stored targets",
      );
    const plan = planImport(parsed.rows, existing, input.resolutions),
      ids = new Map<string, string>(),
      records = new Map(existing.map((e) => [e.id, e]));
    let added = 0,
      merged = 0;
    const leadIds: string[] = [];
    for (let n = 0; n < parsed.rows.length; n++) {
      const row = parsed.rows[n],
        decision = plan[n],
        target = decision.targetId
          ? ids.get(decision.targetId) || decision.targetId
          : null;
      const now = Date.now();
      const rowId = `row:${row.row}`;
      if (target) {
        const prior = records.get(target)!;
        const evidence = mergeAssertions(
          prior.evidence.map((e) => ({ ...e })),
          row.evidence,
        );
        const facts = selectedFacts(prior.facts, evidence);
        const conflicts =
          decision.candidates.find((c) => c.id === decision.targetId)
            ?.conflicts || [];
        const updated = {
          ...prior,
          facts,
          evidence,
          domain: prior.domain || row.domain,
          normalizedPhone: normalizedPhone(facts.phone),
          sources: [
            ...prior.sources.filter((s) => s.label !== row.source.label),
            row.source,
          ].slice(-40),
          mergeHistory: [
            ...prior.mergeHistory,
            {
              sourceLabel: row.source.label,
              rule:
                decision.candidates.find((c) => c.id === decision.targetId)
                  ?.rule || "Reviewed merge",
              similarity:
                decision.candidates.find((c) => c.id === decision.targetId)
                  ?.similarity || 1,
              conflicts,
              at: now,
            },
          ].slice(-40),
          revision: prior.revision + 1,
          score: null,
          drafts: prior.drafts.map((d) => ({ ...d, stale: true })),
          updatedAt: now,
        };
        await tx
          .update(leads)
          .set(updated)
          .where(and(eq(leads.id, target), eq(leads.workspaceId, workspaceId)));
        records.set(target, updated);
        ids.set(rowId, target);
        leadIds.push(target);
        merged++;
      } else {
        const id = randomUUID();
        const record: Stored = {
          id,
          workspaceId,
          name: row.name,
          normalizedName: normalizedName(row.name),
          domain: row.domain,
          normalizedPhone: normalizedPhone(row.facts.phone),
          stage: "New",
          synthetic: row.synthetic,
          enrichmentStatus: "pending",
          revision: 1,
          facts: row.facts,
          evidence: row.evidence,
          signals: [],
          sources: [row.source],
          mergeHistory: [],
          score: null,
          drafts: [],
          createdAt: now,
          updatedAt: now,
        };
        await tx.insert(leads).values(record);
        records.set(id, record);
        ids.set(rowId, id);
        leadIds.push(id);
        added++;
      }
    }
    return {
      total: parsed.total,
      accepted: parsed.rows.length,
      rejected: parsed.errors.length,
      errors: parsed.errors,
      added,
      duplicatesMerged: merged,
      leadIds: [...new Set(leadIds)],
    };
  });
}
