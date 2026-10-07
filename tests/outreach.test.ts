import { it, expect, afterEach, vi } from "vitest";
import { sampleBusinesses, sampleThesis } from "../data/sample";
import type { LeadDetail } from "../lib/contracts";
import { generateDraft, draftText } from "../lib/outreach";
import { improveReasoning } from "../lib/reasoning";
import { scoreLead } from "../lib/scoring";
const b = sampleBusinesses()[1],
  t = { id: "t", name: "test", revision: 1, criteria: sampleThesis };
const lead: LeadDetail = {
  id: "x",
  name: b.name,
  domain: b.domain,
  facts: b.facts,
  evidence: b.evidence,
  evidenceCount: b.evidence.length,
  signals: [],
  sources: b.sources,
  revision: 1,
  stage: "New",
  synthetic: true,
  enrichmentStatus: "pending",
  createdAt: 0,
  score: null,
  drafts: [],
  suppressed: false,
  mergeHistory:[],
};
afterEach(() => vi.unstubAllEnvs());
it("produces all six tone/channel combinations with valid provenance", () => {
  for (const tone of ["professional", "warm", "direct"] as const)
    for (const channel of ["email", "linkedin"] as const) {
      const d = generateDraft(lead, t, tone, channel);
      expect(d.tone).toBe(tone);
      for (const s of d.sentences) {
        if (s.kind === "fact") {
          expect(s.evidenceIds.length).toBeGreaterThan(0);
          expect(
            s.evidenceIds.every((id) =>
              lead.evidence.some((e) => e.id === id && e.selected),
            ),
          ).toBe(true);
        }
        if (s.kind === "buyer_intent")
          expect(s.thesisFields.length).toBeGreaterThan(0);
      }
      if (channel === "linkedin")
        expect(draftText(d).length).toBeLessThanOrEqual(700);
      expect(draftText(d)).not.toMatch(/retir|willing|profitable/i);
    }
});
it("uses a neutral request without sourced facts", () => {
  const d = generateDraft({ ...lead, evidence: [] }, t, "warm", "email");
  expect(d.sentences.some((s) => s.kind === "fact")).toBe(false);
});
it("does not use alternate evidence", () => {
  expect(
    generateDraft(
      {
        ...lead,
        evidence: lead.evidence.map((e) => ({ ...e, selected: false })),
      },
      t,
      "direct",
      "email",
    ).sentences.some((s) => s.kind === "fact"),
  ).toBe(false);
});
it("skips the network without a key", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const fetcher = vi.fn();
  const s = scoreLead(lead, t, "2026-10-07");
  expect(await improveReasoning(s, fetcher)).toEqual(s);
  expect(fetcher).not.toHaveBeenCalled();
});
it("falls back on refusal, timeout, schema errors or invented indices", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  const s = scoreLead(lead, t, "2026-10-07");
  for (const payload of [
    { output: [] },
    { output: [{ content: [{ type: "refusal" }] }] },
    {
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                choices: [{ index: 999, style: "plain" }],
              }),
            },
          ],
        },
      ],
    },
  ])
    expect(
      await improveReasoning(
        s,
        vi.fn(async () => new Response(JSON.stringify(payload))),
      ),
    ).toEqual(s);
  expect(
    await improveReasoning(
      s,
      vi.fn(async () => {
        throw Error("timeout");
      }),
    ),
  ).toEqual(s);
});
it("accepts grounded ordering without modifying scores", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  const s = scoreLead(lead, t, "2026-10-07");
  const payload = {
    output: [
      {
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              choices: s.reasons.map((_, index) => ({
                index,
                style: "review",
              })),
            }),
          },
        ],
      },
    ],
  };
  const result = await improveReasoning(
    s,
    vi.fn(async () => new Response(JSON.stringify(payload))),
  );
  expect(result.reasoningMode).toBe("llm");
  expect(result.total).toBe(s.total);
  expect(result.factors).toEqual(s.factors);
  expect(result.reasons[0]).toBe(`Review: ${s.reasons[0]}`);
});
