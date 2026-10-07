"use client";
import { useEffect, useState } from "react";
import { api, jsonPost } from "@/lib/client";
import type { LeadDetail } from "@/lib/contracts";
import { scoreIsStale, type Thesis } from "@/lib/scoring";
import { draftText, type Draft } from "@/lib/outreach";
import { Button } from "./ui/button";
export function OutreachEditor({
  lead,
  thesis,
  onChanged,
}: {
  lead: LeadDetail;
  thesis: Thesis | undefined;
  onChanged: () => void;
}) {
  const [tone, setTone] = useState<Draft["tone"]>("professional"),
    [channel, setChannel] = useState<Draft["channel"]>("email"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [text, setText] = useState("");
  const draft = lead.drafts.find(
    (d) =>
      d.thesisId === thesis?.id && d.tone === tone && d.channel === channel,
  );
  const stale =
    !!draft &&
    (draft.stale ||
      draft.leadRevision !== lead.revision ||
      draft.thesisRevision !== thesis?.revision);
  useEffect(() => {
    setText(draft ? draftText(draft) : "");
    setMessage("");
  }, [draft]);
  const score = lead.score;
  const current =
    thesis &&
    score &&
    !scoreIsStale(
      score,
      lead.revision,
      thesis,
      new Date().toISOString().slice(0, 10),
    );
  async function action(kind: "score" | "draft" | "edit" | "ai") {
    if (!thesis) return;
    setBusy(true);
    setMessage("");
    try {
      if (kind === "score" || kind === "ai")
        await api(
          "/api/scores",
          jsonPost({
            thesisId: thesis.id,
            leadIds: [lead.id],
            useAI: kind === "ai",
          }),
        );
      else
        await api(`/api/leads/${encodeURIComponent(lead.id)}/outreach`, {
          ...jsonPost({
            thesisId: thesis.id,
            tone,
            channel,
            ...(kind === "edit"
              ? {
                  text,
                  leadRevision: lead.revision,
                  thesisRevision: thesis.revision,
                }
              : {}),
          }),
          method: kind === "edit" ? "PATCH" : "POST",
        });
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mb-6 space-y-4 rounded-xl border border-primary/30 p-4">
      <h3 className="font-semibold">Acquisition fit & outreach</h3>
      {!thesis ? (
        <p className="text-sm">Choose or create a thesis to score and draft.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void action("score")}
            >
              Score this business
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void action("ai")}
            >
              Optional AI reasoning
            </Button>
          </div>
          {current ? (
            <>
              <p className="text-2xl font-semibold">
                {score!.total}/100{" "}
                <span className="text-sm">
                  {score!.eligible ? "Research fit" : "Excluded · deal-breaker"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                fit-v1 · {score!.assessmentDate} ·{" "}
                {score!.reasoningMode === "llm"
                  ? "AI-selected grounded wording"
                  : "Deterministic reasoning (also the no-key fallback)"}
              </p>
              {score!.factors.map((f) => (
                <div key={f.name}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span>{f.name}</span>
                    <span>
                      {f.points.toFixed(1)} / {f.max}
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded bg-muted"
                    role="meter"
                    aria-label={f.name}
                    aria-valuenow={f.points}
                    aria-valuemin={0}
                    aria-valuemax={f.max}
                  >
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(100 * f.points) / f.max}%` }}
                    />
                  </div>
                </div>
              ))}
              {score!.reasons.map((r, i) => (
                <p key={i} className="text-xs">
                  {r}
                </p>
              ))}
              {score!.unknowns.map((r, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {r}
                </p>
              ))}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {score
                ? "Stored score is stale for this evidence, thesis or assessment date. Score again."
                : "Not scored for this thesis yet."}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Succession clues prioritize research. They do not establish intent
            to sell. An exclusion caps the total; factor bars show the uncapped
            calculation.
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="text-xs">
              Tone
              <select
                className="ml-2 rounded border border-border bg-background p-2"
                value={tone}
                onChange={(e) => setTone(e.target.value as Draft["tone"])}
              >
                {["professional", "warm", "direct"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Channel
              <select
                className="ml-2 rounded border border-border bg-background p-2"
                value={channel}
                onChange={(e) => setChannel(e.target.value as Draft["channel"])}
              >
                <option>email</option>
                <option>linkedin</option>
              </select>
            </label>
          </div>
          {lead.suppressed ? (
            <p className="text-sm text-red-500">
              Suppressed: drafting and copying are blocked.
            </p>
          ) : (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void action("draft")}
            >
              {draft ? "Regenerate draft" : "Generate draft"}
            </Button>
          )}
          {draft && !lead.suppressed && (
            <>
              <p className="text-sm font-medium">{draft.subject}</p>
              {stale && (
                <p role="alert" className="text-sm text-red-500">
                  Draft is stale. Regenerate before copying or editing.
                </p>
              )}
              <div className="space-y-3">
                {draft.sentences.map((s, i) => (
                  <div key={i}>
                    <p className="text-sm leading-6">{s.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.kind === "user_written"
                        ? "User-written · unsupported claims require manual verification"
                        : s.kind === "buyer_intent"
                          ? `Your thesis: ${s.thesisFields.join(", ")}`
                          : s.kind === "non_factual"
                            ? "Greeting / request · no factual assertion"
                            : "Sourced fact"}
                    </p>
                    {s.evidenceIds.map((id) => {
                      const e = lead.evidence.find((e) => e.id === id);
                      return (
                        <p key={id} className="break-all text-xs text-primary">
                          {e?.field} · {e?.sourceUrl || "Imported record"} ·{" "}
                          {e?.synthetic ? "synthetic" : e?.method}
                        </p>
                      );
                    })}
                  </div>
                ))}
              </div>
              {draft.originalSentences && (
                <details className="text-xs">
                  <summary>Original generated draft and evidence</summary>
                  {draft.originalSentences.map((s, i) => (
                    <p className="mt-2" key={i}>
                      {s.text} ·{" "}
                      {s.evidenceIds
                        .map(
                          (id) =>
                            lead.evidence.find((e) => e.id === id)?.sourceUrl ||
                            "Import",
                        )
                        .join(", ") || s.kind}
                    </p>
                  ))}
                </details>
              )}
              <label className="block text-xs">
                Edit draft (saved edits are marked user-written, without
                generated citations)
                <textarea
                  className="mt-2 min-h-36 w-full rounded border border-border bg-background p-3 text-sm"
                  value={text}
                  maxLength={channel === "linkedin" ? 700 : 5000}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || stale || !text.trim()}
                  onClick={() => void action("edit")}
                >
                  Save user edit
                </Button>
                <Button
                  size="sm"
                  disabled={stale || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const fresh = await api<LeadDetail>(
                        `/api/leads/${encodeURIComponent(lead.id)}`,
                      );
                      const currentTheses = await api<Thesis[]>("/api/theses");
                      const currentThesis = currentTheses.find(
                        (t) => t.id === thesis.id,
                      );
                      const saved = fresh.drafts.find(
                        (d) =>
                          d.thesisId === thesis.id &&
                          d.tone === tone &&
                          d.channel === channel,
                      );
                      if (fresh.suppressed) {
                        onChanged();
                        throw new Error(
                          "Copy blocked: this business is suppressed.",
                        );
                      }
                      if (
                        !saved ||
                        !currentThesis ||
                        saved.stale ||
                        saved.leadRevision !== fresh.revision ||
                        saved.thesisRevision !== currentThesis.revision
                      ) {
                        onChanged();
                        throw new Error(
                          "Draft changed or became stale. Regenerate before copying.",
                        );
                      }
                      await navigator.clipboard.writeText(
                        (saved.subject ? `Subject: ${saved.subject}\n\n` : "") +
                          draftText(saved),
                      );
                      setMessage("Saved draft copied. No message was sent.");
                    } catch (e) {
                      setMessage(
                        e instanceof Error
                          ? e.message
                          : "Clipboard unavailable. Copy the verified saved draft manually.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Copy saved draft
                </Button>
              </div>
            </>
          )}
        </>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
