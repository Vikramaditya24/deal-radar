"use client";
import { useState } from "react";
import { api, jsonPost } from "@/lib/client";
import type { Thesis } from "@/lib/scoring";
import { thesisCriteriaSchema } from "@/lib/contracts";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
const blank = {
  industries: [],
  geographies: [],
  revenueMinCents: null,
  revenueMaxCents: null,
  currency: "USD" as const,
  minYears: null,
  mustHaves: [],
  dealBreakers: [],
};
const split = (s: string) =>
  s
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const inputClass =
  "mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm";
export function ThesisBuilder({
  theses,
  activeId,
  onSelect,
  onSaved,
}: {
  theses: Thesis[];
  activeId: string;
  onSelect: (id: string) => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<Thesis | null | undefined>(undefined),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const number = (key: string, mult = 1) =>
        form.get(key) === "" ? null : Number(form.get(key)) * mult;
      const criteria = thesisCriteriaSchema.parse({
        industries: split(String(form.get("industries"))),
        geographies: split(String(form.get("geographies"))),
        revenueMinCents: number("min", 100),
        revenueMaxCents: number("max", 100),
        currency: form.get("currency"),
        minYears: number("years"),
        mustHaves: split(String(form.get("must"))),
        dealBreakers: split(String(form.get("breakers"))),
      });
      const body = {
        name: form.get("name"),
        criteria,
        ...(editing ? { revision: editing.revision } : {}),
      };
      const row = await api<Thesis>(
        editing
          ? `/api/theses/${encodeURIComponent(editing.id)}`
          : "/api/theses",
        { ...jsonPost(body), method: editing ? "PATCH" : "POST" },
      );
      onSelect(row.id);
      onSaved();
      setEditing(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  const c = editing?.criteria || blank;
  return (
    <Card className="mb-6 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 text-sm font-medium">
          Active acquisition thesis
          <select
            aria-label="Active acquisition thesis"
            className={inputClass}
            value={activeId}
            onChange={(e) => onSelect(e.target.value)}
          >
            <option value="">Choose a thesis</option>
            {theses.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · v{t.revision}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          disabled={!activeId}
          onClick={() => {
            setError("");
            setEditing(theses.find((t) => t.id === activeId));
          }}
        >
          Edit thesis
        </Button>
        <Button
          onClick={() => {
            setError("");
            setEditing(null);
          }}
        >
          New thesis
        </Button>
      </div>
      {editing !== undefined && (
        <form
          key={editing?.id || "new"}
          onSubmit={save}
          className="mt-5 border-t border-border pt-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Thesis name
              <input
                required
                name="name"
                maxLength={100}
                defaultValue={editing?.name || ""}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              Industries (comma-separated)
              <input
                name="industries"
                defaultValue={c.industries.join(", ")}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              Geographies (city, state or country)
              <input
                name="geographies"
                defaultValue={c.geographies.join(", ")}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              Currency
              <select
                name="currency"
                defaultValue={c.currency}
                className={inputClass}
              >
                {["USD", "INR", "EUR", "GBP"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Minimum annual revenue
              <input
                type="number"
                min="0"
                step="0.01"
                name="min"
                defaultValue={
                  c.revenueMinCents === null ? "" : c.revenueMinCents / 100
                }
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              Maximum annual revenue
              <input
                type="number"
                min="0"
                step="0.01"
                name="max"
                defaultValue={
                  c.revenueMaxCents === null ? "" : c.revenueMaxCents / 100
                }
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              Minimum years in business
              <input
                type="number"
                min="0"
                max="200"
                name="years"
                defaultValue={c.minYears ?? ""}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              Must-haves (literal phrases)
              <input
                name="must"
                defaultValue={c.mustHaves.join(", ")}
                className={inputClass}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Deal-breakers (literal phrases)
              <input
                name="breakers"
                defaultValue={c.dealBreakers.join(", ")}
                className={inputClass}
              />
            </label>
          </div>
          <p className="my-3 text-xs text-muted-foreground">
            Leave unused criteria empty. Matching uses whole phrases in selected
            evidence. Unknowns require diligence; no currency conversion is
            applied.
          </p>
          {error && (
            <p role="alert" className="mb-3 text-sm text-red-500">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button disabled={busy}>{busy ? "Saving…" : "Save thesis"}</Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setEditing(undefined)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
