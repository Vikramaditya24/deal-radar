import { z } from "zod";
import { scoreSchema, type LeadDetail, type ThesisCriteria } from "./contracts";
export type Score = z.infer<typeof scoreSchema>;
export type Thesis = {
  id: string;
  name: string;
  revision: number;
  criteria: ThesisCriteria;
};
export const hasCriteria = (c: ThesisCriteria) =>
  !!(
    c.industries.length ||
    c.geographies.length ||
    c.revenueMinCents !== null ||
    c.revenueMaxCents !== null ||
    c.minYears !== null ||
    c.mustHaves.length
  );
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
// Whole normalized phrases, not raw substring matches ("IT" must not match "security").
export const phraseMatch = (value: string, term: string) =>
  ` ${norm(value)} `.includes(` ${norm(term)} `);
export function scoreLead(
  lead: LeadDetail,
  thesis: Thesis,
  assessmentDate: string,
): Score {
  if (!hasCriteria(thesis.criteria))
    throw new Error("Configure at least one positive thesis criterion");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(assessmentDate) ||
    !Number.isFinite(Date.parse(assessmentDate)) ||
    new Date(assessmentDate).toISOString().slice(0, 10) !== assessmentDate
  )
    throw new Error("Invalid assessment date");
  const year = Number(assessmentDate.slice(0, 4)),
    c = thesis.criteria,
    f = lead.facts;
  const selected = lead.evidence.filter((e) => e.selected);
  const valid = (field: string) =>
    selected.filter(
      (e) =>
        e.field === field &&
        JSON.stringify(e.value) === JSON.stringify(f[field as keyof typeof f]),
    );
  const conf = (field: string): number => {
    const direct = Math.max(0, ...valid(field).map((e) => e.confidence));
    if (direct) return direct;
    // Phase 2 stored geography as a composite assertion, and currency as
    // explicit revenue metadata. Preserve that original evidence convention.
    if (["city", "state", "country"].includes(field))
      return Math.max(
        0,
        ...selected
          .filter(
            (e) =>
              e.field === "geography" &&
              phraseMatch(
                String(e.value),
                String(f[field as keyof typeof f] || "__unknown__"),
              ),
          )
          .map((e) => e.confidence),
      );
    if (
      field === "currency" &&
      ["USD", "INR", "EUR", "GBP"].includes(f.currency || "")
    )
      return Math.max(0, ...valid("revenueCents").map((e) => e.confidence));
    return 0;
  };
  const reasons: string[] = [],
    unknowns: string[] = [];
  const criteria: { weight: number; fraction: number }[] = [];
  const assess = (
    label: string,
    weight: number,
    configured: boolean,
    known: boolean,
    match: boolean,
    confidence: number,
  ) => {
    if (!configured) return;
    criteria.push({ weight, fraction: known && match ? confidence : 0 });
    if (!known) unknowns.push(`${label}: needs verification.`);
    else
      reasons.push(
        `${label}: ${match ? "matches the buy-box" : "outside the buy-box"}.`,
      );
  };
  assess(
    "Industry",
    15,
    !!c.industries.length,
    !!f.industry && conf("industry") > 0,
    c.industries.some((t) => phraseMatch(f.industry || "", t)),
    conf("industry"),
  );
  const geoFields = ["city", "state", "country"] as const;
  const geoMatch = Math.max(
    0,
    ...geoFields.flatMap((key) =>
      c.geographies
        .filter((t) => phraseMatch(f[key] || "", t))
        .map(() => conf(key)),
    ),
  );
  assess(
    "Geography",
    10,
    !!c.geographies.length,
    geoFields.some((k) => conf(k) > 0),
    geoMatch > 0,
    geoMatch,
  );
  const revenueConfigured =
    c.revenueMinCents !== null || c.revenueMaxCents !== null;
  const revenueComplete =
    f.revenueCents !== null &&
    ["USD", "INR", "EUR", "GBP"].includes(f.currency || "") &&
    conf("revenueCents") > 0 &&
    conf("currency") > 0;
  const revenueKnown = revenueComplete && f.currency === c.currency;
  assess(
    "Revenue",
    10,
    revenueConfigured,
    revenueKnown,
    revenueKnown &&
      f.revenueCents! >= (c.revenueMinCents ?? 0) &&
      f.revenueCents! <= (c.revenueMaxCents ?? Infinity),
    Math.min(conf("revenueCents"), conf("currency")),
  );
  if (revenueConfigured && f.currency && f.currency !== c.currency)
    unknowns.push(
      "Revenue currency differs; no currency conversion is applied.",
    );
  const yearsEvidence = selected.filter(
    (e) =>
      e.field === "yearsInBusiness" &&
      typeof e.value === "number" &&
      e.value >= 0,
  );
  const age =
    f.foundedYear !== null && f.foundedYear <= year && conf("foundedYear") > 0
      ? { years: year - f.foundedYear, confidence: conf("foundedYear") }
      : yearsEvidence.length
        ? {
            years: Number(yearsEvidence[0].value),
            confidence: yearsEvidence[0].confidence,
          }
        : null;
  assess(
    "Longevity",
    5,
    c.minYears !== null,
    !!age,
    !!age && age.years >= (c.minYears ?? 0),
    age?.confidence ?? 0,
  );
  // Only selected positive field values are searched; snippets can contain negations.
  const phraseEvidence = selected.filter((e) =>
    [
      "industry",
      "services",
      "familyOwnership",
      "founderBio",
      "teamSizeHint",
      "techHints",
    ].includes(e.field),
  );
  const matchTerm = (term: string) =>
    Math.max(
      0,
      ...phraseEvidence
        .filter((e) =>
          phraseMatch(
            Array.isArray(e.value) ? e.value.join("; ") : String(e.value),
            term,
          ),
        )
        .map((e) => e.confidence),
    );
  if (c.mustHaves.length) {
    let sum = 0;
    for (const term of c.mustHaves) {
      const certainty = matchTerm(term);
      sum += certainty;
      if (certainty) reasons.push(`Must-have “${term}”: evidenced match.`);
      else
        unknowns.push(
          `Must-have “${term}”: needs verification; absence is not proof of failure.`,
        );
    }
    criteria.push({ weight: 10, fraction: sum / c.mustHaves.length });
  }
  const excluded = c.dealBreakers.filter((t) => matchTerm(t) > 0);
  for (const term of excluded)
    reasons.push(`Deal-breaker “${term}”: evidenced match; excluded.`);
  for (const term of c.dealBreakers.filter((t) => !excluded.includes(t)))
    unknowns.push(`Deal-breaker “${term}”: not evidenced; verify absence.`);
  const thesisPoints =
    (50 * criteria.reduce((s, x) => s + x.weight * x.fraction, 0)) /
    criteria.reduce((s, x) => s + x.weight, 0);
  let succession = 0;
  for (const type of [
    "family_ownership",
    "founder_owner",
    "transition_language",
  ]) {
    const signal = lead.signals.find((s) => s.type === type);
    const refs =
      signal?.evidenceIds
        .map((id) => selected.find((e) => e.id === id))
        .filter((e) => !!e) ?? [];
    const confidence =
      signal && refs.length === signal.evidenceIds.length && refs.length > 0
        ? Math.min(signal.strength, ...refs.map((e) => e.confidence))
        : 0;
    succession += 5 * confidence;
    if (confidence)
      reasons.push(
        `${type.replaceAll("_", " ")}: sourced research clue, not proof of seller intent.`,
      );
  }
  if (age && age.years >= 20) {
    succession += 5 * age.confidence;
    reasons.push("At least 20 years in business: a longevity research clue.");
  }
  const complete =
    3 * Number(!!lead.name && !!lead.sources.length) +
    3 * conf("industry") +
    3 * Math.max(...geoFields.map(conf)) +
    3 * (revenueComplete ? Math.min(conf("revenueCents"), conf("currency")) : 0) +
    3 *
      (f.foundedYear !== null && f.foundedYear <= year
        ? conf("foundedYear")
        : 0);
  const contact =
    8 * conf("email") + 4 * conf("phone") + 3 * conf("contactPage");
  if (!contact)
    unknowns.push("Contactability: no evidenced public contact method.");
  const factors = [
    { name: "Thesis match", points: thesisPoints, max: 50 },
    { name: "Succession clues", points: succession, max: 20 },
    { name: "Data completeness", points: complete, max: 15 },
    { name: "Contactability", points: contact, max: 15 },
  ];
  return scoreSchema.parse({
    thesisId: thesis.id,
    thesisRevision: thesis.revision,
    leadRevision: lead.revision,
    algorithmVersion: "fit-v1",
    assessmentDate,
    total: Math.min(
      excluded.length ? 20 : 100,
      Math.round(factors.reduce((s, x) => s + x.points, 0)),
    ),
    eligible: !excluded.length,
    factors,
    reasons,
    unknowns,
    reasoningMode: "heuristic",
  });
}
export function scoreIsStale(
  score: Score | null,
  leadRevision: number,
  thesis: Thesis,
  date: string,
) {
  return (
    !score ||
    score.leadRevision !== leadRevision ||
    score.thesisId !== thesis.id ||
    score.thesisRevision !== thesis.revision ||
    score.assessmentDate !== date
  );
}
