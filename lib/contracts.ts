import { z } from "zod";
export const emptyQuery = z.object({}).strict();
export const emptyBody = z.object({}).strict();
export const stages = ["New", "Contacted", "Replied", "Meeting"] as const;
export const thesisCriteriaSchema = z
  .object({
    industries: z.array(z.string().trim().min(1).max(80)).max(20),
    geographies: z.array(z.string().trim().min(1).max(100)).max(30),
    revenueMinCents: z.number().int().nonnegative().nullable(),
    revenueMaxCents: z.number().int().nonnegative().nullable(),
    currency: z.enum(["USD", "INR", "EUR", "GBP"]),
    minYears: z.number().int().min(0).max(200).nullable(),
    mustHaves: z.array(z.string().trim().min(1).max(150)).max(10),
    dealBreakers: z.array(z.string().trim().min(1).max(150)).max(10),
  })
  .strict()
  .refine(
    (c) =>
      c.revenueMinCents === null ||
      c.revenueMaxCents === null ||
      c.revenueMaxCents >= c.revenueMinCents,
    { message: "Maximum revenue must be at least minimum revenue" },
  );
export const factsSchema = z
  .object({
    industry: z.string().max(80).nullable(),
    city: z.string().max(80).nullable(),
    state: z.string().max(80).nullable(),
    country: z.string().max(80).nullable(),
    revenueCents: z.number().int().nonnegative().nullable(),
    currency: z.string().length(3).nullable(),
    foundedYear: z.number().int().min(1800).max(2100).nullable(),
    services: z.array(z.string().max(150)).max(20),
    email: z.email().nullable(),
    phone: z.string().max(40).nullable(),
    contactPage: z.url().nullable(),
    teamSizeHint: z.string().max(100).nullable(),
    techHints: z.array(z.string().max(80)).max(10),
  })
  .strict();
export const evidenceSchema = z
  .object({
    id: z.string().min(1),
    field: z.string().min(1),
    value: z.union([z.string(), z.number(), z.array(z.string())]),
    confidence: z.number().min(0).max(1),
    sourceUrl: z.url().nullable(),
    excerpt: z.string().max(1000),
    observedAt: z.number().int(),
    method: z.enum([
      "synthetic_fixture",
      "import",
      "visible_text",
      "json_ld",
      "hint",
    ]),
    synthetic: z.boolean(),
    selected: z.boolean(),
  })
  .strict();
export const signalSchema = z
  .object({
    type: z.string(),
    evidenceIds: z.array(z.string()),
    strength: z.number().min(0).max(1),
    explanation: z.string(),
  })
  .strict();
export const sourceSchema = z
  .object({
    label: z.string(),
    kind: z.enum(["synthetic", "csv", "url", "crawl"]),
    sourceUrl: z.url().nullable(),
    observedAt: z.number().int(),
    original: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
  })
  .strict();
export const mergeSchema = z
  .object({
    sourceLabel: z.string(),
    rule: z.string(),
    similarity: z.number().min(0).max(1),
    conflicts: z.array(z.string()),
    at: z.number().int(),
  })
  .strict();
export const scoreSchema = z.object({
  thesisId: z.string(),
  thesisRevision: z.number().int(),
  leadRevision: z.number().int(),
  algorithmVersion: z.literal("fit-v1"),
  assessmentDate: z.string(),
  total: z.number().min(0).max(100),
  eligible: z.boolean(),
  factors: z.array(
    z.object({ name: z.string(), points: z.number(), max: z.number() }),
  ),
  reasons: z.array(z.string()),
  unknowns: z.array(z.string()),
  reasoningMode: z.enum(["heuristic", "llm"]),
});
export const draftSchema = z.object({
  tone: z.enum(["professional", "warm", "direct"]),
  channel: z.enum(["email", "linkedin"]),
  subject: z.string(),
  sentences: z.array(
    z.object({
      text: z.string(),
      kind: z.enum(["fact", "buyer_intent", "non_factual", "user_written"]),
      evidenceIds: z.array(z.string()),
      thesisFields: z.array(z.string()),
    }),
  ),
  thesisId: z.string(),
  thesisRevision: z.number().int(),
  leadRevision: z.number().int(),
  stale: z.boolean(),
});
export const jobProgressSchema = z
  .array(
    z.object({
      leadId: z.string(),
      state: z.enum([
        "pending",
        "processing",
        "waiting",
        "completed",
        "partial",
        "blocked",
        "failed",
        "cancelled",
      ]),
      pageUrls: z.array(z.string()).max(3),
      pageCursor: z.number().int().nonnegative(),
      attempts: z.number().int().min(0).max(3),
      nextAttemptAt: z.number().int().nullable(),
      error: z.string().nullable(),
    }),
  )
  .max(150);
export const leadQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().max(100).default(""),
    synthetic: z.enum(["true", "false"]).optional(),
  })
  .strict();
export const idParamsSchema = z
  .object({ id: z.string().min(1).max(120) })
  .strict();
export type Facts = z.infer<typeof factsSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type ThesisCriteria = z.infer<typeof thesisCriteriaSchema>;
export type LeadListItem = {
  id: string;
  name: string;
  domain: string | null;
  stage: (typeof stages)[number];
  synthetic: boolean;
  enrichmentStatus: string;
  facts: Facts;
  createdAt: number;
};
export type LeadDetail = LeadListItem & {
  evidenceCount: number;
  evidence: Evidence[];
  signals: z.infer<typeof signalSchema>[];
  sources: z.infer<typeof sourceSchema>[];
  revision: number;
};
export type SessionData = {
  demoLoaded: boolean;
  leadCount: number;
  thesisCount: number;
};
