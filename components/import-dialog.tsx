"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Upload, Loader2, X } from "lucide-react";
import { api, jsonPost } from "@/lib/client";
import type { ImportInput } from "@/lib/ingest";
import type { JobView } from "@/lib/enrichment";
type Preview = {
  headers: string[];
  mapping: Record<string, string>;
  total: number;
  valid: number;
  errors: { row: number; message: string }[];
  duplicatesMerged: number;
  reviewNeeded: number;
  plan: {
    row: number;
    name: string;
    targetId: string | null;
    candidates: {
      id: string;
      name: string;
      rule: string;
      similarity: number;
      conflicts: string[];
      automatic: boolean;
    }[];
    decision: "new" | "merge";
  }[];
};
const keys = [
  "name",
  "website",
  "industry",
  "city",
  "state",
  "country",
  "phone",
  "email",
  "annual_revenue",
  "currency",
  "founded_year",
  "synthetic",
] as const;
const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
export function ImportDialog({
  mode,
  onClose,
  onImported,
  onJob,
}: {
  mode: "import" | "live";
  onClose: () => void;
  onImported: (message: string) => void;
  onJob: (job: JobView) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<"csv" | "urls">("csv"),
    [content, setContent] = useState(""),
    [fileName, setFileName] = useState(""),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [resolutions, setResolutions] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mappingDirty, setMappingDirty] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function reset() {
    setMappingDirty(false);
    setPreview(null);
    setResolutions({});
    setError("");
  }
  const input = (): ImportInput => ({ kind, content, mapping, resolutions });
  async function fileSelected(file: File) {
    reset();
    setMapping({});
    if (file.size > 2 * 1024 * 1024) {
      setError("CSV limit is 2 MB");
      return;
    }
    try {
      setContent(await file.text());
      setFileName(file.name);
    } catch {
      setError("Could not read this file");
    }
  }
  async function inspect() {
    setBusy(true);
    setError("");
    try {
      const p = await api<Preview>("/api/import/preview", jsonPost(input()));
      setPreview(p);
      setMapping(p.mapping);
      setMappingDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (mode === "live") {
        const urls = content
          .split(/[\r\n,]+/)
          .map((u) => u.trim())
          .filter(Boolean);
        if (!urls.length || urls.length > 5)
          throw Error("Paste one to five absolute public HTTP(S) URLs");
        const job = await api<JobView>(
          "/api/enrichment/jobs",
          jsonPost({ urls }),
        );
        onJob(job);
        onImported(
          `${urls.length} live URLs accepted. Enrichment respects website restrictions.`,
        );
      } else {
        const result = await api<{
          added: number;
          duplicatesMerged: number;
          rejected: number;
        }>("/api/import", jsonPost(input()));
        onImported(
          `${result.added} businesses added · ${result.duplicatesMerged} duplicates merged · ${result.rejected} rows rejected.`,
        );
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      aria-labelledby="import-title"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[min(95vw,850px)] overflow-y-auto rounded-2xl border border-border bg-card p-6 text-foreground shadow-2xl backdrop:bg-black/60"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 id="import-title" className="text-xl font-semibold">
            {mode === "live"
              ? "Live crawl · up to five businesses"
              : "Import & resolve duplicates"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "live"
              ? "Public websites only. No Google, LinkedIn, private addresses or challenge bypass."
              : "Preview before importing. Sources are retained and uncertain matches remain separate."}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={busy}
          aria-label="Close import"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      {mode === "import" && (
        <div className="mb-4 flex gap-2">
          <Button
            variant={kind === "csv" ? "default" : "outline"}
            disabled={busy}
            onClick={() => {
              setKind("csv");
              setContent("");
              setFileName("");
              setMapping({});
              reset();
            }}
          >
            CSV file
          </Button>
          <Button
            variant={kind === "urls" ? "default" : "outline"}
            disabled={busy}
            onClick={() => {
              setKind("urls");
              setContent("");
              setMapping({});
              reset();
            }}
          >
            Paste URLs
          </Button>
        </div>
      )}
      {mode === "import" && kind === "csv" ? (
        <label className="mb-4 block rounded-xl border border-dashed border-border bg-muted/40 p-5">
          <span className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Upload className="size-4" />
            {fileName || "Choose a CSV · up to 1,000 rows"}
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void fileSelected(file);
            }}
            className="block w-full text-sm text-muted-foreground"
          />
        </label>
      ) : (
        <label className="block">
          <span className="mb-2 block text-sm font-medium">
            One URL per line
            {mode === "live" ? " · maximum five" : " · maximum 150"}
          </span>
          <textarea
            rows={6}
            value={content}
            disabled={busy}
            onChange={(e) => {
              setContent(e.target.value);
              reset();
            }}
            placeholder="https://your-public-business-website.com"
            className={fieldClass}
          />
        </label>
      )}
      {error && (
        <p
          role="alert"
          className="my-4 rounded-lg border border-red-400/40 p-3 text-sm"
        >
          {error}
        </p>
      )}
      {preview && (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge>
              {preview.valid}/{preview.total} valid
            </Badge>
            <Badge>{preview.duplicatesMerged} proposed merges</Badge>
            <Badge>{preview.reviewNeeded} need review</Badge>
          </div>
          {mappingDirty && (
            <p className="text-sm text-primary">
              Column mapping changed. Preview again before importing.
            </p>
          )}
          {kind === "csv" && (
            <details className="rounded-xl border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Column mapping · change then preview again
              </summary>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {keys.map((key) => (
                  <label key={key} className="text-xs text-muted-foreground">
                    {key}
                    <select
                      value={mapping[key] || ""}
                      disabled={busy}
                      onChange={(e) => {
                        setMapping((m) => ({ ...m, [key]: e.target.value }));
                        setMappingDirty(true);
                        setResolutions({});
                      }}
                      className={fieldClass}
                    >
                      <option value="">Automatic / absent</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </details>
          )}
          {preview.errors.length > 0 && (
            <div className="rounded-xl border border-red-400/30 p-4">
              <p className="text-sm font-semibold">Rejected rows</p>
              <ul className="mt-2 max-h-36 overflow-y-auto space-y-1 text-xs">
                {preview.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="max-h-64 overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3">Row / business</th>
                  <th className="p-3">Duplicate decision</th>
                </tr>
              </thead>
              <tbody>
                {preview.plan.map((p) => (
                  <tr key={p.row} className="border-t border-border">
                    <td className="p-3">
                      {p.row}. {p.name}
                    </td>
                    <td className="p-3">
                      {p.candidates.length ? (
                        <>
                          <select
                            aria-label={`Duplicate decision for row ${p.row}`}
                            disabled={busy}
                            value={resolutions[`row:${p.row}`] || ""}
                            onChange={(e) =>
                              setResolutions((r) => ({
                                ...r,
                                [`row:${p.row}`]: e.target.value,
                              }))
                            }
                            className={fieldClass}
                          >
                            <option value="">
                              {p.targetId
                                ? "Automatic merge"
                                : "Keep separate (uncertain)"}
                            </option>
                            <option value="separate">
                              Keep separate explicitly
                            </option>
                            {p.candidates.map((c) => (
                              <option value={c.id} key={c.id}>
                                Merge with {c.name}
                                {c.conflicts.length ? " · conflicts" : ""}
                              </option>
                            ))}
                          </select>
                          {p.candidates.map((c) => (
                            <p
                              key={c.id}
                              className="mt-1 text-muted-foreground"
                            >
                              {c.rule} · {Math.round(c.similarity * 100)}% name
                              similarity
                              {c.conflicts.length
                                ? ` · ${c.conflicts.join(", ")}`
                                : ""}
                            </p>
                          ))}
                        </>
                      ) : (
                        "New business"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            An explicit merge accepts the displayed identity conflicts and
            preserves evidence. Changed data is revalidated when you submit.
            Importing does not automatically crawl websites.
          </p>
        </div>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {mode === "import" && (
          <Button
            variant="outline"
            onClick={inspect}
            disabled={busy || !content}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}Preview
          </Button>
        )}
        <Button
          onClick={submit}
          disabled={
            busy ||
            !content ||
            (mode === "import" &&
              (!preview || preview.valid === 0 || mappingDirty))
          }
        >
          {busy ? <Loader2 className="animate-spin" /> : null}
          {mode === "live" ? "Start polite live crawl" : "Import businesses"}
        </Button>
      </div>
    </dialog>
  );
}
