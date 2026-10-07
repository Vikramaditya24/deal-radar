"use client";
import { useEffect, useRef, useState } from "react";
import { ImportDialog } from "./import-dialog";
import { JobProgress } from "./job-progress";
import { api, jsonPost } from "@/lib/client";
import type { JobView } from "@/lib/enrichment";
import { useTheme } from "next-themes";
import {
  ArrowRight,
  Database,
  Loader2,
  Moon,
  Radar,
  Search,
  Sun,
  X,
  ArrowLeft,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeadListItem, LeadDetail, SessionData } from "@/lib/contracts";
type PageData = {
  items: LeadListItem[];
  total: number;
  page: number;
  limit: number;
};
const money = (cents: number | null, currency = "USD") =>
  cents === null
    ? "Not reported"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(cents / 100);
export function DealRadar() {
  const { resolvedTheme, setTheme } = useTheme();
  const [importMode, setImportMode] = useState<"import" | "live" | null>(null);
  const [notice, setNotice] = useState("");
  const [jobId, setJobId] = useState<string | null>(null),
    [runToken, setRunToken] = useState(0),
    [jobBusy, setJobBusy] = useState(false),
    [creatingJob, setCreatingJob] = useState(false);
  function jobCreated(job: JobView) {
    setJobId(job.id);
    setRunToken((t) => t + 1);
  }
  async function enrich(ids: string[]) {
    setCreatingJob(true);
    setError("");
    try {
      jobCreated(
        await api<JobView>("/api/enrichment/jobs", jsonPost({ leadIds: ids })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot start enrichment");
    } finally {
      setCreatingJob(false);
    }
  }

  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);
  const [data, setData] = useState<PageData | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      api<SessionData>("/api/session", { signal: controller.signal })
        .then(async (s) => {
          const rows = await api<PageData>(
            `/api/leads?page=${page}&limit=20&q=${encodeURIComponent(search)}`,
            { signal: controller.signal },
          );
          setSession(s);
          setData(rows);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, page, version]);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setDetail(null);
    setDetailError("");
    api<LeadDetail>(`/api/leads/${encodeURIComponent(selectedId)}`, {
      signal: controller.signal,
    })
      .then(setDetail)
      .catch((e) => {
        if (e.name !== "AbortError") setDetailError(e.message);
      });
    return () => controller.abort();
  }, [selectedId, version]);
  useEffect(() => {
    if (!selectedId) return;
    lastFocus.current = document.activeElement as HTMLElement;
    closeButton.current?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
      if (event.key === "Tab") {
        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="dialog"] button, [role="dialog"] a',
          ),
        );
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", key);
      lastFocus.current?.focus();
    };
  }, [selectedId]);
  async function loadDemo() {
    setSeeding(true);
    setError("");
    try {
      await api<SessionData>("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      setSearch("");
      setPage(1);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo load failed");
    } finally {
      setSeeding(false);
    }
  }
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary p-2.5 text-primary-foreground">
              <Radar className="size-6" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">Deal Radar</p>
              <p className="text-xs text-muted-foreground">
                Acquisition research, with evidence
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="hidden sm:inline-flex">Phase 3 · Research</Badge>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle light and dark theme"
              disabled={!mounted}
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {mounted && resolvedTheme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-primary">
              Your next chapter starts here
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Find businesses worth a closer look.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Start with a transparent dataset. Every assertion has an origin;
              unknowns stay unknown.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="size-4" /> libSQL · persistent workspace
          </div>
        </div>
        <Card className="mb-7 flex flex-wrap items-center justify-between gap-5 border-primary/20 p-6">
          <div className="flex gap-4">
            <ShieldCheck className="mt-1 size-6 shrink-0 text-primary" />
            <div>
              <h2 className="font-semibold">An honest, key-free demo</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                150 synthetic US businesses. Reserved .example websites and
                illustrative revenue. No real businesses, discovered contacts,
                or network crawling.
              </p>
            </div>
          </div>
          <Button
            onClick={loadDemo}
            disabled={seeding || loading || session?.demoLoaded}
          >
            {seeding ? <Loader2 className="animate-spin" /> : <ArrowRight />}
            {seeding
              ? "Loading dataset…"
              : session?.demoLoaded
                ? "Sample dataset loaded"
                : "Load 150 sample businesses"}
          </Button>
        </Card>
        <div className="mb-7 grid gap-4 sm:grid-cols-3">
          {[
            ["Businesses", session?.leadCount ?? 0, "Stored in your workspace"],
            [
              "Saved theses",
              session?.thesisCount ?? 0,
              "A sample buy-box accompanies the demo",
            ],
            [
              "Synthetic records",
              session?.syntheticCount ?? 0,
              "Clearly labeled, never crawled",
            ],
          ].map(([label, value, hint]) => (
            <Card key={label} className="p-5">
              <p className="text-xs font-medium text-muted-foreground">
                {label}
              </p>
              {loading && !session ? (
                <Skeleton className="my-3 h-8 w-16" />
              ) : (
                <p className="my-2 text-3xl font-semibold">{value}</p>
              )}
              <p className="text-xs text-muted-foreground">{hint}</p>
            </Card>
          ))}
        </div>
        {error && (
          <div
            role="alert"
            className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-red-400/40 bg-red-500/5 p-4 text-sm"
          >
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVersion((v) => v + 1)}
            >
              Retry
            </Button>
          </div>
        )}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={!session || jobBusy}
            onClick={() => {
              setSelectedId(null);
              setImportMode("import");
            }}
          >
            Import CSV / URLs
          </Button>
          <Button
            disabled={!session || jobBusy}
            onClick={() => {
              setSelectedId(null);
              setImportMode("live");
            }}
          >
            Live crawl · up to 5 URLs
          </Button>
          <Button
            variant="outline"
            disabled={!data?.items.length || jobBusy || creatingJob}
            onClick={() => void enrich(data!.items.map((l) => l.id))}
          >
            {creatingJob
              ? "Starting…"
              : `Enrich shown (${data?.items.length || 0})`}
          </Button>
          <span className="text-xs text-muted-foreground">
            No paid keys. No outreach is sent.
          </span>
        </div>
        {notice && (
          <div
            role="status"
            className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm"
          >
            <span>{notice}</span>
            <Button variant="ghost" size="sm" onClick={() => setNotice("")}>
              Dismiss
            </Button>
          </div>
        )}
        {session && (
          <JobProgress
            jobId={jobId}
            runToken={runToken}
            onDetected={setJobId}
            onBusy={setJobBusy}
            onChanged={() => setVersion((v) => v + 1)}
          />
        )}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-5">
            <div>
              <h2 className="font-semibold">Business directory</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Imported facts and source-backed enrichment · ranking arrives in
                Phase 4
              </p>
            </div>
            <label className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <span className="sr-only">Search business name or domain</span>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name or domain"
                className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
          {loading ? (
            <div className="space-y-3 p-6" aria-label="Loading businesses">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data?.items.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      {[
                        "Business",
                        "Industry",
                        "Location",
                        "Reported revenue",
                        "Founded",
                        "",
                      ].map((label, i) => (
                        <th key={i} className="px-5 py-3 font-medium">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((lead) => (
                      <tr
                        key={lead.id}
                        className="border-t border-border transition-colors hover:bg-muted/40"
                      >
                        <td className="px-5 py-4">
                          <button
                            className="text-left font-medium text-foreground hover:text-primary hover:underline"
                            onClick={() => setSelectedId(lead.id)}
                          >
                            {lead.name}
                          </button>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {lead.domain}
                            </span>
                            <Badge>
                              {lead.synthetic
                                ? "Synthetic"
                                : ["completed", "partial"].includes(
                                      lead.enrichmentStatus,
                                    )
                                  ? "Real · enriched"
                                  : "Real · imported"}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {lead.facts.industry}
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {lead.facts.city}, {lead.facts.state}
                        </td>
                        <td className="px-5 py-4 tabular-nums">
                          {money(
                            lead.facts.revenueCents,
                            lead.facts.currency || "USD",
                          )}
                        </td>
                        <td className="px-5 py-4 tabular-nums">
                          {lead.facts.foundedYear ?? "Unknown"}
                        </td>
                        <td className="px-5 py-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Inspect ${lead.name}`}
                            onClick={() => setSelectedId(lead.id)}
                          >
                            <ArrowRight />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-5 py-4">
                <span className="text-xs text-muted-foreground">
                  {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} of{" "}
                  {data.total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ArrowLeft />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * 20 >= data.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                    <ArrowRight />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="px-6 py-16 text-center">
              <Database className="mx-auto mb-4 size-8 text-muted-foreground" />
              <h3 className="font-semibold">
                {search
                  ? "No businesses match your search"
                  : "Your directory is ready for its first businesses"}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {search
                  ? "Try a different name or domain."
                  : "Load the synthetic dataset above to explore stored facts and evidence."}
              </p>
              {search && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setSearch("");
                    setPage(1);
                  }}
                >
                  Clear search
                </Button>
              )}
            </div>
          )}
        </Card>
        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          Phase 3 adds ingest, duplicate review and polite enrichment. Scoring,
          outreach and pipeline actions arrive in the next phases.
        </p>
      </main>
      {selectedId && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          onClick={() => setSelectedId(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            className="h-full w-full max-w-xl overflow-y-auto bg-card p-6 shadow-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <Badge className="mb-3">
                  {detail
                    ? detail.synthetic
                      ? "Synthetic fixture · no live website"
                      : "Real business · public website"
                    : "Loading business evidence"}
                </Badge>
                <h2 id="detail-title" className="text-2xl font-semibold">
                  {detail?.name ?? "Business evidence"}
                </h2>
              </div>
              <Button
                ref={closeButton}
                variant="ghost"
                size="icon"
                aria-label="Close business detail"
                onClick={() => setSelectedId(null)}
              >
                <X />
              </Button>
            </div>
            {detailError ? (
              <p role="alert">{detailError}</p>
            ) : !detail ? (
              <div className="space-y-4">
                <Skeleton className="h-24" />
                <Skeleton className="h-48" />
              </div>
            ) : (
              <>
                <p className="mb-5 text-sm leading-6 text-muted-foreground">
                  {detail.facts.industry} · {detail.facts.city},{" "}
                  {detail.facts.state}
                  <br />
                  Reported revenue:{" "}
                  {money(
                    detail.facts.revenueCents,
                    detail.facts.currency || "USD",
                  )}{" "}
                  {detail.synthetic ? "(illustrative)" : "(unverified import)"}
                  <br />
                  {detail.synthetic
                    ? "These evidence URLs identify fixtures, not real businesses."
                    : "Public website claims are research evidence; verify them before diligence."}
                </p>
                <Button
                  variant="outline"
                  className="mb-5"
                  disabled={jobBusy || creatingJob}
                  onClick={() => void enrich([detail.id])}
                >
                  Enrich this business
                </Button>
                <p className="mb-4 text-xs text-muted-foreground">
                  Enrichment: {detail.enrichmentStatus}
                </p>
                {detail.signals.length > 0 && (
                  <div className="mb-5 rounded-xl border border-primary/30 p-4">
                    <h3 className="font-semibold">
                      Succession research signals
                    </h3>
                    {detail.signals.map((signal) => (
                      <p
                        key={signal.type}
                        className="mt-2 text-sm text-muted-foreground"
                      >
                        {signal.explanation}
                      </p>
                    ))}
                  </div>
                )}
                <h3 className="mb-3 font-semibold">Field-level evidence</h3>
                <div className="space-y-3">
                  {detail.evidence.map((e) => (
                    <div
                      key={e.id}
                      className="rounded-xl border border-border p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">{e.field}</span>
                        <Badge>{e.selected ? "Selected" : "Alternate"}</Badge>
                        <Badge>
                          {Math.round(e.confidence * 100)}% confidence
                        </Badge>
                      </div>
                      <p className="mt-2 break-words text-sm font-medium">
                        {Array.isArray(e.value)
                          ? e.value.join(", ")
                          : String(e.value)}
                      </p>
                      <p className="mt-2 text-sm leading-6">{e.excerpt}</p>
                      <p className="mt-2 break-all text-xs text-muted-foreground">
                        {e.sourceUrl ?? e.id}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {e.synthetic
                          ? "Synthetic fixture"
                          : "Public/import evidence"}{" "}
                        ·{" "}
                        {new Date(e.observedAt).toLocaleDateString("en-US", {
                          timeZone: "UTC",
                        })}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-lg bg-muted p-4 text-xs leading-5 text-muted-foreground">
                  <ExternalLink className="mb-2 size-4" />
                  {detail.synthetic
                    ? "Reserved .example domains are never opened or crawled."
                    : "Live crawls check robots.txt and stop on blocks or challenges."}{" "}
                  Confidence is an evidence-quality convention, not a calibrated
                  probability.
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {importMode && (
        <ImportDialog
          mode={importMode}
          onClose={() => setImportMode(null)}
          onImported={(message) => {
            setNotice(message);
            setSearch("");
            setPage(1);
            setVersion((v) => v + 1);
          }}
          onJob={jobCreated}
        />
      )}
    </div>
  );
}
