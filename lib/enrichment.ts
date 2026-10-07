import * as cheerio from "cheerio";
import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { and, eq, ne, desc, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { leads, enrichmentJobs, suppressions } from "./schema";
import {
  evidenceSchema,
  jobProgressSchema,
  factsSchema,
  type Evidence,
} from "./contracts";
import { ingest, importSchema, mergeAssertions, selectedFacts } from "./ingest";
import { targetUrl, crawler, CrawlWait, CrawlError } from "./crawler";
import { canonicalDomain, normalizedName, normalizedPhone } from "./dedupe";
import { cache } from "./cache";
import { sampleBusinesses } from "../data/sample";
import { ApiError } from "./api";
export const jobInputSchema = z.union([
  z
    .object({ leadIds: z.array(z.string().min(1).max(120)).min(1).max(150) })
    .strict(),
  z
    .object({ urls: z.array(z.string().trim().min(1).max(2000)).min(1).max(5) })
    .strict(),
]);
export type JobView = {
  id: string;
  status: string;
  total: number;
  completed: number;
  failed: number;
  blocked: number;
  progress: z.infer<typeof jobProgressSchema>;
  updatedAt: number;
};
const fixtures = new Map(sampleBusinesses().map((b) => [b.domain, b]));
export function parsePage(
  html: string,
  url: string,
  synthetic: boolean,
  observedAt: number,
) {
  const key = `parsed:v1:${createHash("sha256")
    .update(url + html + synthetic + observedAt)
    .digest("hex")}`;
  const cached = cache.get<ReturnType<typeof extract>>(key);
  if (cached) return cached;
  const result = extract(html, url, synthetic, observedAt);
  cache.set(key, result, 24 * 3600_000);
  return result;
}
function extract(
  html: string,
  url: string,
  synthetic: boolean,
  observedAt: number,
) {
  const $ = cheerio.load(html);
  const structured: Record<string, unknown>[] = [];
  function collect(value: unknown) {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      structured.push(obj);
      if (obj["@graph"]) collect(obj["@graph"]);
    }
  }
  $('script[type="application/ld+json"]').each((_, node) => {
    try {
      collect(JSON.parse($(node).text()));
    } catch {
      /* Malformed structured data is ignored; visible evidence still works. */
    }
  });
  const hints: string[] = [];
  if (/wp-content|wp-includes/i.test(html))
    hints.push("WordPress asset signature");
  if (/cdn\.shopify\.com/i.test(html)) hints.push("Shopify asset signature");
  if (/wixstatic\.com/i.test(html)) hints.push("Wix asset signature");
  $("script,style,template,[hidden],[aria-hidden='true']").remove();
  $("br").replaceWith(" ");
  $("p,h1,h2,h3,li,div,section,article,address,a").each((_, node) => {
    $(node).append(" ");
  });
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const evidence: Evidence[] = [],
    signals: {
      type: string;
      evidenceIds: string[];
      strength: number;
      explanation: string;
    }[] = [];
  const add = (
    field: string,
    value: string | number | string[],
    excerpt: string,
    confidence = 0.9,
    method: "visible_text" | "json_ld" | "hint" = "visible_text",
  ) => {
    const id = createHash("sha256")
      .update(url + field + JSON.stringify(value))
      .digest("hex")
      .slice(0, 24);
    const assertion = evidenceSchema.parse({
      id,
      field,
      value,
      confidence,
      sourceUrl: url,
      excerpt: excerpt.slice(0, 1000),
      observedAt,
      method: synthetic ? "synthetic_fixture" : method,
      synthetic,
      selected: true,
    });
    if (!evidence.some((e) => e.id === id)) evidence.push(assertion);
    return id;
  };
  const links: string[] = [];
  let contact: string | null = null;
  $("a[href]").each((_, node) => {
    const href = $(node).attr("href") || "";
    if (/^mailto:/i.test(href)) {
      const email = href.slice(7).split("?")[0];
      if (z.email().safeParse(email).success)
        add("email", email, `Public email link: ${email}`);
    }
    if (/^tel:/i.test(href)) {
      const phone = href.slice(4);
      if (phone.length <= 40)
        add("phone", phone, `Public telephone link: ${phone}`);
    }
    try {
      const linked = new URL(href, url);
      if (
        linked.origin === new URL(url).origin &&
        /about|contact|team/i.test(linked.pathname + $(node).text())
      ) {
        linked.hash = "";
        if (!links.includes(linked.href)) links.push(linked.href);
        if (/contact/i.test(linked.pathname)) contact = linked.href;
      }
    } catch {
      /* Invalid links are not crawl candidates. */
    }
  });
  if (contact)
    add(
      "contactPage",
      contact,
      "Contact page discovered through a same-origin link.",
    );
  if (!evidence.some((e) => e.field === "email")) {
    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    if (email && z.email().safeParse(email).success)
      add("email", email, `Visible contact email: ${email}`, 0.85);
  }
  if (!evidence.some((e) => e.field === "phone")) {
    const phone = text.match(
      /(?:\+1[ -]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/,
    )?.[0];
    if (phone) add("phone", phone, `Visible contact phone: ${phone}`, 0.8);
  }
  const founding = text.match(
    /\b(?:founded|established)\s+(?:in\s+)?((?:18|19|20)\d{2})\b/i,
  );
  if (
    founding &&
    Number(founding[1]) <= new Date(observedAt).getUTCFullYear()
  ) {
    const id = add("foundedYear", Number(founding[1]), founding[0]);
    signals.push({
      type: "longevity",
      evidenceIds: [id],
      strength: 0.9,
      explanation: `Explicit founding-year claim: ${founding[1]}.`,
    });
  }
  const years = text.match(
    /\b(\d{1,3})\+?\s+years\s+(?:in business|of experience|serving)/i,
  );
  if (years) add("yearsInBusiness", Number(years[1]), years[0], 0.8);
  const family = text.match(
    /\bfamily[- ]owned(?:\s+(?:and operated|business))?(?:\s+since\s+(?:18|19|20)\d{2})?/i,
  );
  if (family) {
    const id = add("familyOwnership", family[0], family[0]);
    signals.push({
      type: "family_ownership",
      evidenceIds: [id],
      strength: 0.9,
      explanation:
        "Website explicitly states family ownership; this does not establish willingness to sell.",
    });
  }
  const founder = text.match(
    /\b(?:our founder|founder[- ]owner|owner and founder|founded by)[^.]{0,140}/i,
  );
  if (founder) {
    const id = add("founderBio", founder[0], founder[0], 0.85);
    signals.push({
      type: "founder_owner",
      evidenceIds: [id],
      strength: 0.85,
      explanation:
        "Founder biography language merits manual ownership verification.",
    });
  }
  const transition = text.match(
    /[^.]{0,60}\b(?:retirement|retiring|leadership transition|succession plan)[^.]{0,100}/i,
  );
  if (transition) {
    const id = add("transitionHint", transition[0].trim(), transition[0]);
    signals.push({
      type: "transition_language",
      evidenceIds: [id],
      strength: 0.9,
      explanation:
        "Explicit transition language is a research clue, not a sale announcement.",
    });
  }
  const copyright = text.match(/(?:copyright|©)\s*((?:19|20)\d{2})/i);
  if (
    copyright &&
    new Date(observedAt).getUTCFullYear() - Number(copyright[1]) >= 3
  ) {
    const id = add(
      "siteFreshnessHint",
      copyright[0],
      copyright[0],
      0.35,
      "hint",
    );
    signals.push({
      type: "site_freshness",
      evidenceIds: [id],
      strength: 0.35,
      explanation:
        "Old copyright text only; a single crawl cannot establish the last website update.",
    });
  }
  const team = text.match(
    /\b(?:team (?:of|includes)|employ(?:s|ing))\s+(\d{1,4}(?:[–-]\d{1,4})?\s*(?:employees|people|staff|professionals)?)/i,
  );
  if (team) add("teamSizeHint", team[1].trim(), team[0], 0.85);
  const servicePhrases = text
    .split(/[.;]/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 5 &&
        s.length <= 150 &&
        /maintenance|installation|repair|cleaning|machining|landscaping|inspection|pest management|IT support|supplies|production/i.test(
          s,
        ),
    )
    .slice(0, 8);
  if (servicePhrases.length)
    add("services", servicePhrases, servicePhrases.join("; "), 0.75);
  if (hints.length)
    add(
      "techHints",
      hints,
      `Indirect technology hints: ${hints.join(", ")}.`,
      0.45,
      "hint",
    );
  const org = structured.find((o) =>
    /(Organization|LocalBusiness|Corporation)/.test(String(o["@type"])),
  );
  let name: string | null = null;
  if (org) {
    if (typeof org.name === "string" && org.name.length <= 200) name = org.name;
    if (typeof org.foundingDate === "string") {
      const year = Number(org.foundingDate.slice(0, 4));
      if (year >= 1800 && year <= new Date(observedAt).getUTCFullYear())
        add(
          "foundedYear",
          year,
          `JSON-LD foundingDate: ${org.foundingDate}`,
          0.95,
          "json_ld",
        );
    }
    if (org.address && typeof org.address === "object") {
      const a = org.address as Record<string, unknown>;
      for (const [field, key] of [
        ["city", "addressLocality"],
        ["state", "addressRegion"],
        ["country", "addressCountry"],
      ])
        if (typeof a[key] === "string" && a[key].length <= 80)
          add(
            field,
            a[key] as string,
            `JSON-LD ${key}: ${a[key]}`,
            0.95,
            "json_ld",
          );
    }
  }
  if (!name) {
    const h1 = $("h1").first().text().trim();
    if (
      h1.length > 3 &&
      h1.length <= 150 &&
      !/^(about|contact|welcome|home|our team|services)(?: us)?$/i.test(h1)
    )
      name = h1;
  }
  return { evidence, signals, links: links.slice(0, 3), name };
}
export async function isSuppressed(
  workspaceId: string,
  lead: typeof leads.$inferSelect,
) {
  const db = await getDb();
  const entries = await db
    .select()
    .from(suppressions)
    .where(eq(suppressions.workspaceId, workspaceId));
  return entries.some(
    (s) =>
      (s.kind === "lead" && s.normalizedValue === lead.id) ||
      (s.kind === "domain" && s.normalizedValue === lead.domain) ||
      (s.kind === "email" &&
        s.normalizedValue === lead.facts.email?.toLowerCase()) ||
      (s.kind === "phone" && s.normalizedValue === lead.normalizedPhone),
  );
}
function jobView(job: typeof enrichmentJobs.$inferSelect): JobView {
  return {
    id: job.id,
    status: job.status,
    total: job.total,
    completed: job.completed,
    failed: job.failed,
    blocked: job.blocked,
    progress: jobProgressSchema.parse(job.progress),
    updatedAt: job.updatedAt,
  };
}
export async function listJobs(workspaceId: string) {
  const db = await getDb();
  return (
    await db
      .select()
      .from(enrichmentJobs)
      .where(eq(enrichmentJobs.workspaceId, workspaceId))
      .orderBy(desc(enrichmentJobs.createdAt))
      .limit(5)
  ).map(jobView);
}
export async function getJob(workspaceId: string, id: string) {
  const db = await getDb();
  const [job] = await db
    .select()
    .from(enrichmentJobs)
    .where(
      and(
        eq(enrichmentJobs.id, id),
        eq(enrichmentJobs.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!job) throw new ApiError(404, "NOT_FOUND", "Enrichment job not found");
  return { ...job, progress: jobProgressSchema.parse(job.progress) };
}
export async function createJob(
  workspaceId: string,
  input: z.infer<typeof jobInputSchema>,
) {
  let ids: string[];
  if ("urls" in input) {
    try {
      input.urls.forEach((u) => targetUrl(u));
    } catch (error) {
      throw new ApiError(
        422,
        "UNSAFE_URL",
        error instanceof Error ? error.message : "Unsafe URL",
      );
    }
    const imported = await ingest(
      workspaceId,
      importSchema.parse({ kind: "urls", content: input.urls.join("\n") }),
    );
    ids = imported.leadIds;
  } else ids = [...new Set(input.leadIds)];
  const db = await getDb();
  const records = await db
    .select()
    .from(leads)
    .where(and(eq(leads.workspaceId, workspaceId), inArray(leads.id, ids)));
  if (records.length !== ids.length)
    throw new ApiError(404, "NOT_FOUND", "One or more leads are unavailable");
  const progress: z.infer<typeof jobProgressSchema> = [];
  for (const lead of records) {
    const blocked = await isSuppressed(workspaceId, lead);
    const root =
      lead.sources.find((s) => s.sourceUrl)?.sourceUrl ||
      (lead.domain ? `https://${lead.domain}` : null);
    if (blocked || !root)
      await db
        .update(leads)
        .set({ enrichmentStatus: "blocked", updatedAt: Date.now() })
        .where(and(eq(leads.id, lead.id), eq(leads.workspaceId, workspaceId)));
    progress.push({
      leadId: lead.id,
      state: blocked || !root ? "blocked" : "pending",
      pageUrls: root ? [root] : [],
      pageCursor: 0,
      attempts: 0,
      nextAttemptAt: null,
      error: blocked
        ? "Suppressed: enrichment disabled"
        : !root
          ? "No website supplied"
          : null,
    });
  }
  const now = Date.now(),
    id = randomUUID();
  const blocked = progress.filter((p) => p.state === "blocked").length;
  await db.insert(enrichmentJobs).values({
    id,
    workspaceId,
    status: blocked === progress.length ? "completed" : "pending",
    progress,
    total: progress.length,
    completed: 0,
    failed: 0,
    blocked,
    createdAt: now,
    updatedAt: now,
  });
  return jobView(await getJob(workspaceId, id));
}
export async function cancelJob(workspaceId: string, id: string) {
  const db = await getDb();
  const job = await getJob(workspaceId, id);
  if (job.status === "completed") return jobView(job);
  const progress = jobProgressSchema
    .parse(job.progress)
    .map((p) =>
      ["pending", "processing", "waiting"].includes(p.state)
        ? { ...p, state: "cancelled" as const }
        : p,
    );
  await db
    .update(enrichmentJobs)
    .set({ status: "cancelled", progress, updatedAt: Date.now() })
    .where(
      and(
        eq(enrichmentJobs.id, id),
        eq(enrichmentJobs.workspaceId, workspaceId),
      ),
    );
  return jobView(await getJob(workspaceId, id));
}
const runtimeState = globalThis as typeof globalThis & {
  dealRadarProcessing?: Set<string>;
};
const processing = (runtimeState.dealRadarProcessing ??= new Set<string>());
const terminal = (state: string) =>
  ["completed", "partial", "blocked", "failed", "cancelled"].includes(state);
export async function processJob(workspaceId: string, id: string) {
  if (processing.has(id))
    throw new ApiError(
      409,
      "PROCESSING",
      "This job is already processing on this instance",
    );
  processing.add(id);
  try {
    const db = await getDb();
    let job = await getJob(workspaceId, id);
    if (["completed", "cancelled", "failed"].includes(job.status))
      return jobView(job);
    let progress = jobProgressSchema.parse(job.progress);
    const deadline = Date.now() + 20_000;
    for (let step = 0; step < 2 && Date.now() < deadline - 1000; step++) {
      if ((await getJob(workspaceId, id)).status === "cancelled")
        return jobView(await getJob(workspaceId, id));
      const cursor = progress.findIndex(
        (p) =>
          !terminal(p.state) &&
          (!p.nextAttemptAt || p.nextAttemptAt <= Date.now()),
      );
      if (cursor < 0) break;
      const item = progress[cursor];
      const [lead] = await db
        .select()
        .from(leads)
        .where(
          and(eq(leads.id, item.leadId), eq(leads.workspaceId, workspaceId)),
        )
        .limit(1);
      if (!lead || (await isSuppressed(workspaceId, lead))) {
        item.state = "blocked";
        item.error = "Lead unavailable or suppressed";
        continue;
      }
      try {
        item.state = "processing";
        await db
          .update(enrichmentJobs)
          .set({ status: "running", progress, updatedAt: Date.now() })
          .where(
            and(
              eq(enrichmentJobs.id, id),
              eq(enrichmentJobs.workspaceId, workspaceId),
              ne(enrichmentJobs.status, "cancelled"),
            ),
          );
        const requested = item.pageUrls[item.pageCursor];
        if (!requested) {
          item.state = item.error ? "partial" : "completed";
          continue;
        }
        const fixture =
          lead.synthetic && lead.domain ? fixtures.get(lead.domain) : undefined;
        let page: {
          text: string;
          url: string;
          observedAt: number;
          robotsNote: string;
        };
        if (fixture) {
          const path = new URL(requested).pathname;
          const text = path.includes("contact")
            ? fixture.contactHtml
            : path.includes("about")
              ? fixture.aboutHtml
              : fixture.fixtureHtml;
          page = {
            text,
            url: requested,
            observedAt: Date.UTC(2026, 9, 1),
            robotsNote:
              "Synthetic fixture: no network or real robots.txt request",
          };
        } else
          page = await crawler.page(requested, deadline, async (url) => {
            const [domainOptOut] = await db
              .select({ id: suppressions.id })
              .from(suppressions)
              .where(
                and(
                  eq(suppressions.workspaceId, workspaceId),
                  eq(suppressions.kind, "domain"),
                  eq(suppressions.normalizedValue, canonicalDomain(url)),
                ),
              )
              .limit(1);
            if (domainOptOut || (await isSuppressed(workspaceId, lead)))
              throw new CrawlError(
                "SUPPRESSED",
                "Target opted out before retrieval",
              );
            if ((await getJob(workspaceId, id)).status === "cancelled")
              throw new CrawlError(
                "CANCELLED",
                "Job cancelled before retrieval",
              );
          });
        const parsed = parsePage(
          page.text,
          page.url,
          lead.synthetic,
          page.observedAt,
        );
        const policy = evidenceSchema.parse({
          id: `robots:${createHash("sha256").update(page.url).digest("hex").slice(0, 20)}`,
          field: "robotsPolicy",
          value: page.robotsNote,
          confidence: 1,
          sourceUrl: `${new URL(page.url).origin}/robots.txt`,
          excerpt: page.robotsNote,
          observedAt: page.observedAt,
          method: lead.synthetic ? "synthetic_fixture" : "hint",
          synthetic: lead.synthetic,
          selected: true,
        });
        const latestJob = await getJob(workspaceId, id);
        if (latestJob.status === "cancelled") return jobView(latestJob);
        const [latestLead] = await db
          .select()
          .from(leads)
          .where(and(eq(leads.id, lead.id), eq(leads.workspaceId, workspaceId)))
          .limit(1);
        if (!latestLead || (await isSuppressed(workspaceId, latestLead))) {
          item.state = "blocked";
          item.error = "Suppressed before save";
          continue;
        }
        const evidence = mergeAssertions(
          latestLead.evidence.map((e) => ({ ...e })),
          [...parsed.evidence, policy],
        );
        const facts = selectedFacts(
          factsSchema.parse(latestLead.facts),
          evidence,
        );
        const signals = [...latestLead.signals];
        for (const signal of parsed.signals) {
          const existing = signals.findIndex((s) => s.type === signal.type);
          if (existing >= 0) signals[existing] = signal;
          else signals.push(signal);
        }
        const validEvidence = new Set(evidence.map((e) => e.id));
        const retainedSignals = signals.filter((s) =>
          s.evidenceIds.every((i) => validEvidence.has(i)),
        );
        const name =
          latestLead.name === latestLead.domain && parsed.name
            ? parsed.name
            : latestLead.name;
        const sources = [
          ...latestLead.sources.filter(
            (s) => s.sourceUrl !== page.url || s.kind !== "crawl",
          ),
          {
            label: `crawl:${page.url}`,
            kind: lead.synthetic ? ("synthetic" as const) : ("crawl" as const),
            sourceUrl: page.url,
            observedAt: page.observedAt,
            original: { pageUrl: page.url, robotsNote: page.robotsNote },
          },
        ].slice(-40);
        await db
          .update(leads)
          .set({
            name,
            normalizedName: normalizedName(name),
            normalizedPhone: normalizedPhone(facts.phone),
            facts,
            evidence,
            signals: retainedSignals,
            sources,
            revision: latestLead.revision + 1,
            score: null,
            drafts: latestLead.drafts.map((d) => ({ ...d, stale: true })),
            enrichmentStatus: "running",
            updatedAt: Date.now(),
          })
          .where(
            and(eq(leads.id, lead.id), eq(leads.workspaceId, workspaceId)),
          );
        if (item.pageCursor === 0)
          for (const link of parsed.links)
            if (!item.pageUrls.includes(link) && item.pageUrls.length < 3)
              item.pageUrls.push(link);
        item.pageCursor++;
        item.attempts = 0;
        item.nextAttemptAt = null;
        if (item.error?.includes("(retry ")) item.error = null;
        item.state =
          item.pageCursor >= item.pageUrls.length
            ? item.error
              ? "partial"
              : "completed"
            : "pending";
      } catch (error) {
        if (error instanceof CrawlWait) {
          item.state = "waiting";
          item.nextAttemptAt = error.until;
        } else {
          const failure =
            error instanceof CrawlError
              ? error
              : new CrawlError(
                  "PARSE_ERROR",
                  error instanceof Error ? error.message : "Parsing failed",
                );
          item.attempts++;
          if (failure.retryable && item.attempts < 3) {
            item.state = "waiting";
            item.nextAttemptAt =
              failure.retryAt || Date.now() + 2000 * item.attempts;
            item.error = `${failure.code}: ${failure.message} (retry ${item.attempts}/2)`;
          } else {
            item.error = `${failure.code}: ${failure.message}`;
            if (item.pageCursor === 0)
              item.state =
                /BLOCKED|ROBOTS|UNSAFE|DISALLOWED|CAPTCHA|SUPPRESSED/.test(
                  failure.code,
                )
                  ? "blocked"
                  : "failed";
            else {
              item.pageCursor++;
              item.attempts = 0;
              item.nextAttemptAt = null;
              if (item.error?.includes("(retry ")) item.error = null;
              item.state =
                item.pageCursor >= item.pageUrls.length ? "partial" : "pending";
            }
          }
        }
      }
      const latest = await getJob(workspaceId, id);
      if (latest.status === "cancelled") return jobView(latest);
      const latestProgress = jobProgressSchema.parse(latest.progress);
      for (let n = 0; n < progress.length; n++)
        if (n !== cursor) {
          const recent = latestProgress.find(
            (p) => p.leadId === progress[n].leadId,
          );
          if (recent && terminal(recent.state)) progress[n] = recent;
        }
      const completed = progress.filter(
          (p) => p.state === "completed" || p.state === "partial",
        ).length,
        failed = progress.filter((p) => p.state === "failed").length,
        blocked = progress.filter((p) => p.state === "blocked").length;
      await db
        .update(enrichmentJobs)
        .set({
          progress,
          completed,
          failed,
          blocked,
          status: progress.every((p) => terminal(p.state))
            ? "completed"
            : "running",
          updatedAt: Date.now(),
        })
        .where(
          and(
            eq(enrichmentJobs.id, id),
            eq(enrichmentJobs.workspaceId, workspaceId),
            ne(enrichmentJobs.status, "cancelled"),
          ),
        );
      if (terminal(item.state))
        await db
          .update(leads)
          .set({
            enrichmentStatus: item.state as
              | "completed"
              | "partial"
              | "blocked"
              | "failed",
            updatedAt: Date.now(),
          })
          .where(
            and(eq(leads.id, item.leadId), eq(leads.workspaceId, workspaceId)),
          );
    }
    const saved = await getJob(workspaceId, id);
    if (saved.status !== "cancelled") {
      const completed = progress.filter(
          (p) => p.state === "completed" || p.state === "partial",
        ).length,
        failed = progress.filter((p) => p.state === "failed").length,
        blocked = progress.filter((p) => p.state === "blocked").length;
      await db
        .update(enrichmentJobs)
        .set({
          progress,
          completed,
          failed,
          blocked,
          status: progress.every((p) => terminal(p.state))
            ? "completed"
            : "running",
          updatedAt: Date.now(),
        })
        .where(
          and(
            eq(enrichmentJobs.id, id),
            eq(enrichmentJobs.workspaceId, workspaceId),
            ne(enrichmentJobs.status, "cancelled"),
          ),
        );
      for (const item of progress.filter((p) => p.state === "blocked"))
        await db
          .update(leads)
          .set({ enrichmentStatus: "blocked" })
          .where(
            and(eq(leads.id, item.leadId), eq(leads.workspaceId, workspaceId)),
          );
    }
    return jobView(await getJob(workspaceId, id));
  } finally {
    processing.delete(id);
  }
}
