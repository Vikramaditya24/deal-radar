"use client";
import { useEffect, useState } from "react";
import { api, jsonPost } from "@/lib/client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
type Entry = {
  id: string;
  kind: "lead" | "domain" | "email" | "phone";
  normalizedValue: string;
  reason: string;
  createdAt: number;
};
export function SuppressionPanel({
  version,
  onChanged,
}: {
  version: number;
  onChanged: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [remove, setRemove] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    api<Entry[]>("/api/suppressions", { signal: c.signal })
      .then(setEntries)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [version]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget,
      data = new FormData(form);
    try {
      await api(
        "/api/suppressions",
        jsonPost({
          kind: data.get("kind"),
          value: data.get("value"),
          reason: data.get("reason"),
        }),
      );
      form.reset();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-5">
      <h2 className="font-semibold">Suppression & opt-outs</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Suppressed businesses stay visible for review. Enrichment, drafting,
        copy and CRM exports are blocked. Removing an entry does not restart
        jobs or restore old drafts.
      </p>
      <form onSubmit={submit} className="my-5 flex flex-wrap items-end gap-3">
        <label className="text-xs">
          Match by
          <select
            name="kind"
            className="mt-1 block rounded border border-border bg-background p-2"
          >
            <option value="domain">Domain</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="lead">Business ID</option>
          </select>
        </label>
        <label className="min-w-52 flex-1 text-xs">
          Value
          <input
            required
            maxLength={300}
            name="value"
            placeholder="example.com"
            className="mt-1 w-full rounded border border-border bg-background p-2"
          />
        </label>
        <label className="min-w-52 flex-1 text-xs">
          Reason
          <input
            required
            maxLength={300}
            name="reason"
            placeholder="Owner requested no contact"
            className="mt-1 w-full rounded border border-border bg-background p-2"
          />
        </label>
        <Button disabled={busy}>Add suppression</Button>
      </form>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-500">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="text-sm">
          Loading suppression list…
        </p>
      ) : !entries.length ? (
        <p className="rounded-lg bg-muted p-6 text-sm">
          No suppression entries yet. Add an opt-out here or from a business
          detail.
        </p>
      ) : (
        <ul className="max-h-[600px] space-y-3 overflow-auto">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-3"
            >
              <div className="min-w-0">
                <p className="break-all text-sm font-medium">
                  {e.kind}: {e.normalizedValue}
                </p>
                <p className="text-xs text-muted-foreground">{e.reason}</p>
              </div>
              {remove === e.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs">Remove this suppression?</span>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await api(
                          `/api/suppressions/${encodeURIComponent(e.id)}`,
                          { ...jsonPost({}), method: "DELETE" },
                        );
                        setRemove(null);
                        onChanged();
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Remove failed",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Remove entry
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRemove(null)}
                  >
                    Keep
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRemove(e.id)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
