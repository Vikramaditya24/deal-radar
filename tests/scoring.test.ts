import { describe, it, expect } from "vitest";
import { sampleBusinesses, sampleThesis } from "../data/sample";
import {
  scoreLead,
  phraseMatch,
  scoreIsStale,
  type Thesis,
} from "../lib/scoring";
import type { LeadDetail } from "../lib/contracts";
const fixture = sampleBusinesses()[1];
export const example: LeadDetail = {
  id: "fixture",
  name: fixture.name,
  domain: fixture.domain,
  synthetic: true,
  stage: "New",
  enrichmentStatus: "pending",
  facts: fixture.facts,
  evidence: fixture.evidence,
  evidenceCount: fixture.evidence.length,
  signals: [],
  sources: fixture.sources,
  revision: 1,
  createdAt: 0,
  score: null,
  drafts: [],
  suppressed: false,
};
const thesis: Thesis = {
  id: "test",
  name: "Test",
  revision: 1,
  criteria: sampleThesis,
};
const date = "2026-10-07";
describe("fit-v1", () => {
  it("is deterministic and totals round only once", () => {
    const a = scoreLead(example, thesis, date);
    expect(a).toEqual(scoreLead(example, thesis, date));
    expect(a.total).toBe(
      Math.round(a.factors.reduce((s, f) => s + f.points, 0)),
    );
    expect(a.factors.map((f) => f.max)).toEqual([50, 20, 15, 15]);
  });
  it("renormalizes configured criteria", () => {
    const t = {
      ...thesis,
      criteria: {
        ...sampleThesis,
        industries: [example.facts.industry!],
        geographies: [],
        revenueMinCents: null,
        revenueMaxCents: null,
        minYears: null,
        mustHaves: [],
        dealBreakers: [],
      },
    };
    expect(scoreLead(example, t, date).factors[0].points).toBeCloseTo(45);
  });
  it("reports missing revenue and does not convert currencies", () => {
    const s = scoreLead(
      { ...example, facts: { ...example.facts, currency: "EUR" } },
      thesis,
      date,
    );
    expect(s.unknowns.some((s) => s.includes("currency"))).toBe(true);
    expect(s.factors[2].points).toBe(scoreLead(example,thesis,date).factors[2].points);
    const missing = scoreLead(
      { ...example, facts: { ...example.facts, revenueCents: null } },
      thesis,
      date,
    );
    expect(missing.unknowns.some((s) => s.startsWith("Revenue"))).toBe(true);
  });
  it("caps an evidenced exclusion", () => {
    const s = scoreLead(
      example,
      {
        ...thesis,
        criteria: { ...sampleThesis, dealBreakers: [example.facts.industry!] },
      },
      date,
    );
    expect(s.eligible).toBe(false);
    expect(s.total).toBeLessThanOrEqual(20);
  });
  it("does not treat absent must-haves as confirmed failure", () => {
    const s = scoreLead(
      example,
      {
        ...thesis,
        criteria: { ...sampleThesis, mustHaves: ["unverified financing"] },
      },
      date,
    );
    expect(s.eligible).toBe(true);
    expect(s.unknowns.some((s) => s.includes("absence is not proof"))).toBe(
      true,
    );
  });
  it("rejects empty positive criteria", () => {
    expect(() =>
      scoreLead(
        example,
        {
          ...thesis,
          criteria: {
            ...sampleThesis,
            industries: [],
            geographies: [],
            revenueMinCents: null,
            revenueMaxCents: null,
            minYears: null,
            mustHaves: [],
          },
        },
        date,
      ),
    ).toThrow();
  });
  it("does not score uncited or unselected succession signals", () => {
    const lead = {
      ...example,
      signals: [
        {
          type: "family_ownership",
          strength: 1,
          evidenceIds: ["missing"],
          explanation: "Family",
        },
      ],
    };
    expect(scoreLead(lead, thesis, date).factors[1].points).toBe(
      scoreLead(example, thesis, date).factors[1].points,
    );
  });
  it("awards no old-copyright succession points", () => {
    const lead = {
      ...example,
      signals: [
        {
          type: "site_freshness",
          strength: 1,
          evidenceIds: [example.evidence[0].id],
          explanation: "Old",
        },
      ],
    };
    expect(scoreLead(lead, thesis, date).factors[1].points).toBe(
      scoreLead(example, thesis, date).factors[1].points,
    );
  });
  it("requires evidence for contactability", () => {
    expect(
      scoreLead({ ...example, evidence: [] }, thesis, date).factors[3].points,
    ).toBe(0);
  });
  it("matches whole phrases, not incidental substrings", () => {
    expect(phraseMatch("Security services", "IT")).toBe(false);
    expect(phraseMatch("Commercial HVAC maintenance", "HVAC")).toBe(true);
  });
  it("detects changes in date, evidence and thesis", () => {
    const s = scoreLead(example, thesis, date);
    expect(scoreIsStale(s, 1, thesis, date)).toBe(false);
    expect(scoreIsStale(s, 2, thesis, date)).toBe(true);
    expect(scoreIsStale(s, 1, { ...thesis, revision: 2 }, date)).toBe(true);
    expect(scoreIsStale(s, 1, thesis, "2026-10-08")).toBe(true);
  });
  it("uses valid explicit assessment dates", () => {
    expect(() => scoreLead(example, thesis, "2026-02-30")).toThrow();
  });
});
