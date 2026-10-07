import { z } from "zod";
import { draftSchema, type LeadDetail } from "./contracts";
import type { Thesis } from "./scoring";
export type Draft = z.infer<typeof draftSchema>;
export function generateDraft(
  lead: LeadDetail,
  thesis: Thesis,
  tone: Draft["tone"],
  channel: Draft["channel"],
): Draft {
  const sentences: Draft["sentences"] = [];
  const add = (
    text: string,
    kind: Draft["sentences"][number]["kind"],
    evidenceIds: string[] = [],
    thesisFields: string[] = [],
  ) => sentences.push({ text, kind, evidenceIds, thesisFields });
  add(
    tone === "warm"
      ? "Hello there,"
      : tone === "direct"
        ? "Hello,"
        : "Hello business owner,",
    "non_factual",
  );
  const e =
    lead.evidence.find(
      (e) =>
        e.selected &&
        e.field === "services" &&
        Array.isArray(e.value) &&
        e.value.length &&
        JSON.stringify(e.value) === JSON.stringify(lead.facts.services),
    ) ||
    lead.evidence.find(
      (e) =>
        e.selected &&
        e.field === "foundedYear" &&
        e.value === lead.facts.foundedYear,
    );
  if (e) {
    const fact =
      e.field === "services"
        ? `services including ${(e.value as string[]).slice(0, 2).join(" and ")}`
        : `a founding year of ${e.value}`;
    add(
      `Your ${e.method === "import" ? "imported record" : e.synthetic ? "synthetic demo record" : "public website"} lists ${fact}.`,
      "fact",
      [e.id],
    );
  }
  const configured = thesis.criteria.industries.length
    ? "industries"
    : thesis.criteria.geographies.length
      ? "geographies"
      : thesis.criteria.mustHaves.length
        ? "mustHaves"
        : null;
  if (configured) {
    const values = thesis.criteria[configured].slice(0, 2).join(" / ");
    add(
      `I am exploring an acquisition in ${values}.`,
      "buyer_intent",
      [],
      [configured],
    );
  } else
    add(
      "I am exploring a business acquisition.",
      "buyer_intent",
      [],
      ["revenueMinCents", "revenueMaxCents", "minYears"].filter(
        (k) => thesis.criteria[k as keyof typeof thesis.criteria] !== null,
      ),
    );
  add(
    tone === "warm"
      ? "Would you be open to a brief introductory conversation, if the timing feels right?"
      : tone === "direct"
        ? "Would you consider a short call about a possible acquisition?"
        : "Would you be open to an introductory conversation about a potential acquisition?",
    "non_factual",
  );
  if (channel === "email")
    add(
      "If this is not relevant, please let me know and I will avoid further contact.",
      "non_factual",
    );
  // LinkedIn is a manual note, not an integration. Keep the generated note bounded.
  if (
    channel === "linkedin" &&
    sentences.map((s) => s.text).join("\n\n").length > 700
  )
    sentences.splice(1, e ? 1 : 0);
  return draftSchema.parse({
    tone,
    channel,
    subject: channel === "email" ? "A conversation about your business" : "",
    sentences,
    thesisId: thesis.id,
    thesisRevision: thesis.revision,
    leadRevision: lead.revision,
    stale: false,
  });
}
export function draftText(draft: Draft) {
  return draft.sentences.map((s) => s.text).join("\n\n");
}
