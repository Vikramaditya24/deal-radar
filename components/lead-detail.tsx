"use client";
import { useEffect, useRef, useState } from "react";
import { api, jsonPost } from "@/lib/client";
import { stages, type LeadDetail } from "@/lib/contracts";
import type { Thesis } from "@/lib/scoring";
import { OutreachEditor } from "./outreach-editor";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
export function LeadDetailPanel({
  lead,
  loadError,
  thesis,
  onClose,
  onChanged,
  onEnrich,
  busy,
}: {
  lead: LeadDetail | null;
  loadError: string;
  thesis: Thesis | undefined;
  onClose: () => void;
  onChanged: () => void;
  onEnrich: () => void;
  busy: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  async function move(stage: LeadDetail["stage"]) {
    if (!lead) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/leads/${encodeURIComponent(lead.id)}`, {
        ...jsonPost({ stage, expectedStage: lead.stage }),
        method: "PATCH",
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Move failed");
    } finally {
      setSaving(false);
    }
  }
  if (!lead)
    return (
      <dialog
        ref={dialog}
        onCancel={onClose}
        className="fixed inset-y-0 left-auto right-0 m-0 ml-auto h-dvh max-h-none w-full max-w-2xl border-l border-border bg-card p-5 text-foreground backdrop:bg-black/50"
      >
        <div className="flex justify-between">
          <h2 className="font-semibold">Business details</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close · Esc
          </Button>
        </div>
        {loadError ? (
          <p role="alert" className="mt-5 text-sm">
            {loadError}
          </p>
        ) : (
          <p role="status" className="mt-5 text-sm">
            Loading evidence and scores…
          </p>
        )}
      </dialog>
    );
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 ml-auto h-dvh max-h-none w-full max-w-2xl border-l border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/50"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card p-5">
        <div>
          <h2 className="text-lg font-semibold">{lead.name}</h2>
          <Badge>
            {lead.synthetic ? "Synthetic demo" : "Real · verify sources"}
          </Badge>
          {lead.suppressed && <Badge>Suppressed</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close · Esc
        </Button>
      </div>
      <div className="space-y-5 p-5">
        <p className="text-sm text-muted-foreground">
          {[lead.facts.industry, lead.facts.city, lead.facts.state]
            .filter(Boolean)
            .join(" · ") || "Business facts await research"}
        </p>
        <p className="break-all text-xs text-muted-foreground">
          Business ID: {lead.id}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            Pipeline stage
            <select
              className="ml-2 rounded border border-border bg-background p-2"
              value={lead.stage}
              disabled={saving}
              onChange={(e) => void move(e.target.value as LeadDetail["stage"])}
            >
              {stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || lead.suppressed}
            onClick={onEnrich}
          >
            Enrich this business
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Contacted is manual tracking; the app sends no messages.
        </p>
        <OutreachEditor lead={lead} thesis={thesis} onChanged={onChanged} />
        <section className="rounded-xl border border-border p-4">
          <h3 className="font-semibold">Data quality & ethics</h3>
          <p className="my-2 text-xs text-muted-foreground">
            Enrichment: {lead.enrichmentStatus}. Confidence indicates evidence
            quality, not statistical certainty. Revenue is{" "}
            {lead.synthetic
              ? "illustrative synthetic data"
              : "unverified input"}
            . Unknown fields stay unknown.
          </p>
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            {Object.entries(lead.facts).map(([field, value]) => (
              <div key={field} className="rounded bg-muted p-2">
                <dt className="font-medium">{field}</dt>
                <dd className="mt-1 break-words text-muted-foreground">
                  {value === null || (Array.isArray(value) && !value.length)
                    ? "Unknown"
                    : Array.isArray(value)
                      ? value.join(", ")
                      : String(value)}
                </dd>
              </div>
            ))}
          </dl>
          <h4 className="mt-4 text-sm font-medium">
            Robots & crawl observations
          </h4>
          {lead.synthetic ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Synthetic fixtures: no network or robots request. Reserved
              .example URLs are never crawled.
            </p>
          ) : (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                Public pages are checked against robots.txt; blocks, challenges
                and unsafe URLs stop retrieval. Rate limits are per server
                process.
              </p>
              {lead.sources
                .filter((s) => s.kind === "crawl")
                .map((s, i) => (
                  <p key={i} className="mt-2 break-all text-xs">
                    {s.sourceUrl} ·{" "}
                    {String(s.original.robotsNote || "Outcome not recorded")} ·{" "}
                    {new Date(s.observedAt).toLocaleString()}
                  </p>
                ))}
              {!lead.sources.some((s) => s.kind === "crawl") && (
                <p className="mt-2 text-xs">
                  No successful live page observations. Check enrichment job
                  outcomes for blocked/failed attempts.
                </p>
              )}
            </>
          )}
          {lead.mergeHistory.length > 0 && (
            <details className="mt-4 text-xs">
              <summary>
                Merge history and conflicts ({lead.mergeHistory.length})
              </summary>
              {lead.mergeHistory.map((m, i) => (
                <p key={i} className="mt-2">
                  {m.sourceLabel} · {m.rule} ·{" "}
                  {m.conflicts.length
                    ? `Conflicts: ${m.conflicts.join(", ")}`
                    : "No recorded conflicts"}
                </p>
              ))}
            </details>
          )}
        </section>
        {lead.signals.length > 0 && (
          <section>
            <h3 className="font-semibold">Succession research clues</h3>
            {lead.signals.map((s) => (
              <p
                key={s.type}
                className="mt-2 text-xs leading-5 text-muted-foreground"
              >
                {s.explanation}
              </p>
            ))}
          </section>
        )}
        <section>
          <h3 className="mb-3 font-semibold">Field-level evidence</h3>
          {!lead.evidence.length && (
            <p className="text-sm text-muted-foreground">
              No selected evidence yet. Import or enrich to populate facts.
            </p>
          )}
          <div className="space-y-3">
            {lead.evidence.map((e) => (
              <article
                key={e.id}
                className="rounded-xl border border-border p-4"
              >
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm font-semibold">{e.field}</span>
                  <Badge>{e.selected ? "Selected" : "Alternate"}</Badge>
                  <Badge>{Math.round(e.confidence * 100)}% confidence</Badge>
                </div>
                <p className="my-2 break-words text-sm">
                  {Array.isArray(e.value)
                    ? e.value.join(", ")
                    : String(e.value)}
                </p>
                <p className="text-xs leading-5">{e.excerpt}</p>
                <p className="mt-2 break-all text-xs text-primary">
                  {e.sourceUrl &&
                  !e.synthetic &&
                  /^https?:/.test(e.sourceUrl) ? (
                    <a
                      href={e.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {e.sourceUrl}
                    </a>
                  ) : (
                    e.sourceUrl || "Imported assertion"
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {e.method} ·{" "}
                  {e.synthetic ? "synthetic" : "public/import evidence"} ·{" "}
                  {new Date(e.observedAt).toLocaleString()}
                </p>
              </article>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-border p-4">
          <h3 className="font-semibold">Opt-out protection</h3>
          {lead.suppressed ? (
            <p className="mt-2 text-sm">
              This business matches the suppression list. Manage entries in the
              Suppression tab; removal does not regenerate drafts.
            </p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                setError("");
                try {
                  await api(
                    "/api/suppressions",
                    jsonPost({ kind: "lead", value: lead.id, reason }),
                  );
                  setReason("");
                  onChanged();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Suppression failed",
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              <label className="mt-3 block text-xs">
                Reason
                <input
                  required
                  value={reason}
                  maxLength={300}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded border border-border bg-background p-2"
                  placeholder="Owner requested no further contact"
                />
              </label>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                disabled={saving}
              >
                Suppress this business
              </Button>
            </form>
          )}
        </section>
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
