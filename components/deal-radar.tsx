"use client";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Radar,
  Search,
  Sun,
  Moon,
  Database,
  ArrowLeft,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { api, jsonPost } from "@/lib/client";
import {
  stages,
  type LeadListItem,
  type LeadDetail,
  type SessionData,
} from "@/lib/contracts";
import type { Thesis } from "@/lib/scoring";
import type { JobView } from "@/lib/enrichment";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Badge } from "./ui/badge";
import { ThesisBuilder } from "./thesis-builder";
import { ImportDialog } from "./import-dialog";
import { JobProgress } from "./job-progress";
import { LeadTable } from "./lead-table";
import { PipelineBoard } from "./pipeline-board";
import { LeadDetailPanel } from "./lead-detail";
import { SuppressionPanel } from "./suppression-panel";
import { CommandMenu } from "./command-menu";
type PageData = {
  items: LeadListItem[];
  total: number;
  page: number;
  limit: number;
};
const control = "rounded-lg border border-border bg-background p-2 text-sm";
const initialFilters = {
  industry: "",
  geography: "",
  stage: "",
  synthetic: "",
  enrichmentStatus: "",
  minScore: "",
  eligible: "",
  suppression: "active",
};
export function DealRadar() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false),
    [version, setVersion] = useState(0),
    [session, setSession] = useState<SessionData | null>(null),
    [theses, setTheses] = useState<Thesis[]>([]),
    [thesisId, setThesisId] = useState("");
  const [tab, setTab] = useState<"directory" | "pipeline" | "suppression">(
      "directory",
    ),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [sort, setSort] = useState("score"),
    [filters, setFilters] = useState(initialFilters),
    [data, setData] = useState<PageData | null>(null),
    [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [scoring, setScoring] = useState(false),
    [seeding, setSeeding] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [importMode, setImportMode] = useState<"import" | "live" | null>(null),
    [commandsOpen, setCommandsOpen] = useState(false),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [detail, setDetail] = useState<LeadDetail | null>(null),
    [detailError, setDetailError] = useState("");
  const [jobId, setJobId] = useState<string | null>(null),
    [runToken, setRunToken] = useState(0),
    [jobBusy, setJobBusy] = useState(false),
    [creatingJob, setCreatingJob] = useState(false);
  const [bulkStage, setBulkStage] =
      useState<LeadListItem["stage"]>("Contacted"),
    [bulkReason, setBulkReason] = useState(""),
    [confirmSuppression, setConfirmSuppression] = useState(false),
    [exportFormat, setExportFormat] = useState("hubspot");
  const searchRef = useRef<HTMLInputElement>(null);
  const working = busy || scoring || seeding;
  const enrichable = (data?.items || []).filter(
    (l) => !l.suppressed && (!selected.size || selected.has(l.id)),
  );
  function changed() {
    setVersion((v) => v + 1);
  }
  function selectThesis(id: string) {
    setThesisId(id);
    localStorage.setItem("deal-radar-thesis", id);
    setPage(1);
    setSelected(new Set());
  }
  function queryString(includePage = true) {
    const params = new URLSearchParams({ q: search, sort });
    if (includePage) {
      params.set("page", String(page));
      params.set("limit", "100");
    }
    if (thesisId) params.set("thesisId", thesisId);
    for (const [k, v] of Object.entries(filters))
      if (v && (thesisId || !["minScore", "eligible"].includes(k)))
        params.set(k, v);
    return params.toString();
  }
  const listQuery = queryString();
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api<Thesis[]>("/api/theses", { signal: controller.signal })
      .then((rows) => {
        setTheses(rows);
        setThesisId((id) =>
          rows.some((t) => t.id === id)
            ? id
            : rows.find(
                (t) => t.id === localStorage.getItem("deal-radar-thesis"),
              )?.id ||
              rows[0]?.id ||
              "",
        );
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [version]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      Promise.all([
        api<SessionData>("/api/session", { signal: controller.signal }),
        api<PageData>(`/api/leads?${listQuery}`, { signal: controller.signal }),
      ])
        .then(([s, rows]) => {
          if (controller.signal.aborted) return;
          setSession(s);
          setData(rows);
          setSelected(
            (ids) =>
              new Set(
                [...ids].filter((id) => rows.items.some((l) => l.id === id)),
              ),
          );
          if (page > Math.max(1, Math.ceil(rows.total / 100)))
            setPage(Math.max(1, Math.ceil(rows.total / 100)));
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [listQuery, version, page]);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
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
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (importMode) return;
        setSelectedId(null);
        setCommandsOpen((v) => !v);
      } else if (
        e.key === "/" &&
        !typing &&
        !selectedId &&
        !importMode &&
        !commandsOpen
      ) {
        e.preventDefault();
        setTab("directory");
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedId, importMode, commandsOpen]);
  function open(id: string) {
    setDetail(null);
    setSelectedId(id);
  }
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
  async function loadDemo() {
    setSeeding(true);
    setError("");
    try {
      await api("/api/demo", jsonPost({}));
      setSearch("");
      setFilters(initialFilters);
      setPage(1);
      changed();
      setNotice(
        "150 labeled demo businesses loaded. Choose a thesis, rank businesses, then inspect evidence and draft outreach.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo load failed");
    } finally {
      setSeeding(false);
    }
  }
  async function score(ids?: string[]) {
    if (!thesisId) return;
    setScoring(true);
    setError("");
    try {
      let leadIds = ids;
      if (!leadIds) {
        const first = await api<PageData>("/api/leads?limit=100");
        const second =
          first.total > 100
            ? await api<PageData>("/api/leads?limit=100&page=2")
            : null;
        leadIds = [...first.items, ...(second?.items || [])]
          .slice(0, 150)
          .map((l) => l.id);
      }
      if (!leadIds.length) return;
      await api("/api/scores", jsonPost({ thesisId, leadIds }));
      changed();
      setNotice(`Scored ${leadIds.length} businesses for the active thesis.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scoring failed");
    } finally {
      setScoring(false);
    }
  }
  async function move(lead: LeadListItem, stage: LeadListItem["stage"]) {
    if (lead.stage === stage) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/leads/${encodeURIComponent(lead.id)}`, {
        ...jsonPost({ stage, expectedStage: lead.stage }),
        method: "PATCH",
      });
      changed();
      setNotice(`${lead.name} moved to ${stage}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Move failed");
      changed();
    } finally {
      setBusy(false);
    }
  }
  async function bulk(action: "stage" | "suppress") {
    const targets = (data?.items || []).filter((l) => selected.has(l.id));
    setBusy(true);
    setError("");
    try {
      await api(
        "/api/leads/bulk",
        jsonPost(
          action === "stage"
            ? {
                action,
                stage: bulkStage,
                targets: targets.map((l) => ({
                  id: l.id,
                  expectedStage: l.stage,
                })),
              }
            : { action, leadIds: targets.map((l) => l.id), reason: bulkReason },
        ),
      );
      setNotice(
        `${targets.length} selected businesses ${action === "stage" ? `moved to ${bulkStage}` : "suppressed"}.`,
      );
      setSelected(new Set());
      setConfirmSuppression(false);
      setBulkReason("");
      changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk action failed");
      changed();
    } finally {
      setBusy(false);
    }
  }
  async function download(selectedOnly: boolean) {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams(queryString(false));
      params.set("format", exportFormat);
      if (selectedOnly) params.set("ids", [...selected].join(","));
      const response = await fetch(`/api/export?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error?.message || "Export failed");
      }
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `deal-radar-${exportFormat}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        `Exported ${response.headers.get("X-Export-Count") || ""} unsuppressed businesses. Custom CRM columns may need mapping.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }
  function toggle(id: string) {
    setSelected((ids) => {
      const next = new Set(ids);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setConfirmSuppression(false);
  }
  function filter(key: keyof typeof initialFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
    setSelected(new Set());
  }
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
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
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedId(null);
                setCommandsOpen(true);
              }}
            >
              Quick actions <span className="hidden sm:inline">⌘ / Ctrl K</span>
            </Button>
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
      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-primary">
            From raw leads to a considered shortlist
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Find your next business chapter.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Define your buy-box, inspect the evidence, and start a thoughtful
            conversation. Unknowns stay visible.
          </p>
        </div>
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 border-primary/20 p-5">
          <div>
            <h2 className="font-semibold">Your first 60 seconds</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              1. Load 150 synthetic businesses → 2. Choose a thesis and rank →
              3. Inspect a score and copy a sourced draft.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Demo businesses, revenue and contacts are fictional. Reserved
              .example websites use fixtures; Live crawl works with your public
              URLs.
            </p>
          </div>
          <Button
            onClick={() => void loadDemo()}
            disabled={seeding || loading || session?.demoLoaded}
          >
            {seeding ? <Loader2 className="animate-spin" /> : <Database />}
            {seeding
              ? "Loading…"
              : session?.demoLoaded
                ? "Demo dataset loaded"
                : "Load 150 sample businesses"}
          </Button>
        </Card>
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            ["Businesses", session?.leadCount ?? 0],
            ["Saved theses", session?.thesisCount ?? 0],
            ["Synthetic demo records", session?.syntheticCount ?? 0],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              {loading && !session ? (
                <Skeleton className="mt-2 h-8 w-16" />
              ) : (
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              )}
            </Card>
          ))}
        </div>
        {error && (
          <div
            role="alert"
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-400/40 bg-red-500/5 p-4 text-sm"
          >
            <span>{error}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setError("");
                  changed();
                }}
              >
                Retry / reload
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setError("")}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm"
          >
            <span>{notice}</span>
            <Button size="sm" variant="ghost" onClick={() => setNotice("")}>
              Dismiss
            </Button>
          </div>
        )}
        <ThesisBuilder
          theses={theses}
          activeId={thesisId}
          onSelect={selectThesis}
          onSaved={changed}
        />
        <div className="mb-5 flex flex-wrap gap-2">
          <Button
            disabled={!thesisId || !session?.leadCount || working}
            onClick={() => void score()}
          >
            {scoring ? "Scoring…" : "Rank first 150"}
          </Button>
          <Button
            variant="outline"
            disabled={!session || jobBusy || working}
            onClick={() => setImportMode("import")}
          >
            Import CSV / URLs
          </Button>
          <Button
            variant="outline"
            disabled={!session || jobBusy || working}
            onClick={() => setImportMode("live")}
          >
            Live crawl · up to 5
          </Button>
        </div>
        {session && (
          <JobProgress
            jobId={jobId}
            runToken={runToken}
            onDetected={setJobId}
            onBusy={setJobBusy}
            onChanged={changed}
          />
        )}
        <nav className="mb-4 flex gap-2" aria-label="Workspace views">
          {(["directory", "pipeline", "suppression"] as const).map((t) => (
            <Button
              key={t}
              variant={tab === t ? "default" : "outline"}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {t === "directory"
                ? "Directory"
                : t === "pipeline"
                  ? "Pipeline"
                  : "Suppression"}
            </Button>
          ))}
        </nav>
        {tab === "suppression" ? (
          <SuppressionPanel version={version} onChanged={changed} />
        ) : (
          <Card className="overflow-hidden">
            <div className="space-y-4 border-b border-border p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold">
                    {tab === "directory"
                      ? "Research shortlist"
                      : "Acquisition pipeline"}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data?.total ?? 0} matches · board counts represent the
                    shown page · no outreach is sent
                  </p>
                </div>
                <label className="relative w-full sm:w-80">
                  <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                  <span className="sr-only">
                    Search business name or domain
                  </span>
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                      setSelected(new Set());
                    }}
                    placeholder="Search name or domain · /"
                    className={`${control} w-full pl-10`}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <label className="text-xs">
                  Industry
                  <input
                    className={`${control} mt-1 w-full`}
                    value={filters.industry}
                    onChange={(e) => filter("industry", e.target.value)}
                    placeholder="Any industry"
                  />
                </label>
                <label className="text-xs">
                  Geography
                  <input
                    className={`${control} mt-1 w-full`}
                    value={filters.geography}
                    onChange={(e) => filter("geography", e.target.value)}
                    placeholder="City, state, country"
                  />
                </label>
                <label className="text-xs">
                  Stage
                  <select
                    className={`${control} mt-1 w-full`}
                    value={filters.stage}
                    onChange={(e) => filter("stage", e.target.value)}
                  >
                    <option value="">All stages</option>
                    {stages.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Dataset
                  <select
                    className={`${control} mt-1 w-full`}
                    value={filters.synthetic}
                    onChange={(e) => filter("synthetic", e.target.value)}
                  >
                    <option value="">Real + synthetic</option>
                    <option value="false">Real only</option>
                    <option value="true">Synthetic only</option>
                  </select>
                </label>
                <label className="text-xs">
                  Enrichment
                  <select
                    className={`${control} mt-1 w-full`}
                    value={filters.enrichmentStatus}
                    onChange={(e) => filter("enrichmentStatus", e.target.value)}
                  >
                    <option value="">All outcomes</option>
                    {[
                      "pending",
                      "running",
                      "completed",
                      "partial",
                      "blocked",
                      "failed",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Minimum fit
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    className={`${control} mt-1 w-full`}
                    value={filters.minScore}
                    disabled={!thesisId}
                    onChange={(e) => filter("minScore", e.target.value)}
                    placeholder="Any score"
                  />
                </label>
                <label className="text-xs">
                  Eligibility
                  <select
                    className={`${control} mt-1 w-full`}
                    value={filters.eligible}
                    disabled={!thesisId}
                    onChange={(e) => filter("eligible", e.target.value)}
                  >
                    <option value="">All / unknown</option>
                    <option value="true">Eligible scored</option>
                    <option value="false">Excluded scored</option>
                  </select>
                </label>
                <label className="text-xs">
                  Suppression
                  <select
                    className={`${control} mt-1 w-full`}
                    value={filters.suppression}
                    onChange={(e) => filter("suppression", e.target.value)}
                  >
                    <option value="active">Active only</option>
                    <option value="all">Include suppressed</option>
                    <option value="suppressed">Suppressed only</option>
                  </select>
                </label>
                <label className="text-xs">
                  Sort
                  <select
                    className={`${control} mt-1 w-full`}
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="score">Current fit score</option>
                    <option value="name">Business name</option>
                  </select>
                </label>
                <Button
                  variant="ghost"
                  className="self-end"
                  onClick={() => {
                    setFilters(initialFilters);
                    setSearch("");
                    setPage(1);
                    setSelected(new Set());
                  }}
                >
                  Reset filters
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!data?.items.length || loading || working}
                  onClick={() => {
                    setSelected(
                      selected.size === data?.items.length
                        ? new Set()
                        : new Set(data?.items.map((l) => l.id)),
                    );
                    setConfirmSuppression(false);
                  }}
                >
                  {selected.size === data?.items.length && selected.size
                    ? "Clear selection"
                    : "Select shown"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {selected.size} selected
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !thesisId || !data?.items.length || working || loading
                  }
                  onClick={() =>
                    void score(
                      selected.size
                        ? [...selected]
                        : data!.items.map((l) => l.id),
                    )
                  }
                >
                  Score {selected.size ? "selected" : "shown"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !enrichable.length ||
                    jobBusy ||
                    working ||
                    creatingJob ||
                    loading
                  }
                  onClick={() =>
                    void enrich(
                      data!.items
                        .filter(
                          (l) =>
                            !l.suppressed &&
                            (!selected.size || selected.has(l.id)),
                        )
                        .map((l) => l.id),
                    )
                  }
                >
                  Enrich {selected.size ? "selected" : "shown"}
                </Button>
                <label className="text-xs">
                  <span className="sr-only">Bulk destination stage</span>
                  <select
                    className={control}
                    value={bulkStage}
                    onChange={(e) =>
                      setBulkStage(e.target.value as LeadListItem["stage"])
                    }
                  >
                    {stages.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <Button
                  size="sm"
                  disabled={!selected.size || working || loading}
                  onClick={() => void bulk("stage")}
                >
                  Move {selected.size || "selected"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selected.size || working || loading}
                  onClick={() => setConfirmSuppression(true)}
                >
                  Suppress selected
                </Button>
              </div>
              {confirmSuppression && (
                <div className="rounded-lg border border-border bg-muted p-3">
                  <p className="mb-2 text-sm">
                    Suppress {selected.size} selected businesses? Pending
                    enrichment, drafting and exports will be blocked.
                  </p>
                  <label className="text-xs">
                    Reason
                    <input
                      value={bulkReason}
                      maxLength={300}
                      onChange={(e) => setBulkReason(e.target.value)}
                      className={`${control} ml-2`}
                      placeholder="Opt-out reason"
                    />
                  </label>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      disabled={!bulkReason.trim() || working || !selected.size}
                      onClick={() => void bulk("suppress")}
                    >
                      Confirm suppression
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmSuppression(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <label className="text-xs">
                  CSV mapping{" "}
                  <select
                    className={control}
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value)}
                  >
                    <option value="hubspot">HubSpot</option>
                    <option value="salesforce">Salesforce</option>
                  </select>
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={working || loading || !data?.total}
                  onClick={() => void download(false)}
                >
                  Export filtered
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={working || loading || !selected.size}
                  onClick={() => void download(true)}
                >
                  Export selected ({selected.size})
                </Button>
                <p className="text-xs text-muted-foreground">
                  Suppressed records excluded. Synthetic labels and custom
                  columns retained.
                </p>
              </div>
            </div>
            {loading ? (
              <div className="space-y-3 p-6" aria-label="Loading businesses">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : data?.items.length ? (
              tab === "directory" ? (
                <LeadTable
                  items={data.items}
                  selected={selected}
                  onToggle={toggle}
                  onOpen={open}
                  onMove={(l, s) => void move(l, s)}
                  busy={working}
                />
              ) : (
                <PipelineBoard
                  items={data.items}
                  selected={selected}
                  onToggle={toggle}
                  onOpen={open}
                  onMove={(l, s) => void move(l, s)}
                  busy={working}
                />
              )
            ) : (
              <div className="px-6 py-14 text-center">
                <Database className="mx-auto mb-4 size-8 text-muted-foreground" />
                <h3 className="font-semibold">
                  {session?.leadCount
                    ? "No businesses match these filters"
                    : "Start with a sample dataset or your own leads"}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {session?.leadCount
                    ? "Try resetting filters. Suppressed businesses are hidden by default."
                    : "Load the labeled demo or import a CSV / public business URLs."}
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setFilters(initialFilters);
                    setSearch("");
                    setPage(1);
                  }}
                >
                  Reset filters
                </Button>
              </div>
            )}
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
              <span className="text-xs text-muted-foreground">
                {data?.total
                  ? `${(page - 1) * 100 + 1}–${Math.min(page * 100, data.total)} of ${data.total}`
                  : "0 matches"}{" "}
                · up to 100 per page
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 1 || loading}
                  onClick={() => {
                    setPage((p) => p - 1);
                    setSelected(new Set());
                  }}
                >
                  <ArrowLeft />
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!data || page * 100 >= data.total || loading}
                  onClick={() => {
                    setPage((p) => p + 1);
                    setSelected(new Set());
                  }}
                >
                  Next
                  <ArrowRight />
                </Button>
              </div>
            </footer>
          </Card>
        )}
        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          Fit-v1 prioritizes research; it does not predict seller intent or
          valuation. Website/import assertions require verification. Active
          thesis and theme persist in this browser.
        </p>
      </main>
      {selectedId && (
        <LeadDetailPanel
          lead={detail}
          loadError={detailError}
          thesis={theses.find((t) => t.id === thesisId)}
          onClose={() => setSelectedId(null)}
          onChanged={changed}
          onEnrich={() => detail && void enrich([detail.id])}
          busy={jobBusy || creatingJob}
        />
      )}
      {importMode && (
        <ImportDialog
          mode={importMode}
          onClose={() => setImportMode(null)}
          onImported={(message) => {
            setNotice(message);
            setPage(1);
            setSearch("");
            changed();
          }}
          onJob={jobCreated}
        />
      )}
      {commandsOpen && (
        <CommandMenu
          onClose={() => setCommandsOpen(false)}
          commands={[
            {
              label: "Search directory",
              run: () => {
                setTab("directory");
                setTimeout(() => searchRef.current?.focus(), 0);
              },
            },
            { label: "View pipeline", run: () => setTab("pipeline") },
            { label: "Manage suppression", run: () => setTab("suppression") },
            {
              label: "Import CSV or URLs",
              run: () => setImportMode("import"),
              disabled: jobBusy || working || !session,
            },
            {
              label: "Live crawl up to 5 URLs",
              run: () => setImportMode("live"),
              disabled: jobBusy || working || !session,
            },
            {
              label: "Rank first 150 businesses",
              run: () => void score(),
              disabled: !thesisId || working || !session?.leadCount,
            },
            {
              label: "Toggle theme",
              run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
            },
            {
              label: "Load synthetic demo",
              run: () => void loadDemo(),
              disabled: working || loading || session?.demoLoaded,
            },
          ]}
        />
      )}
    </div>
  );
}
