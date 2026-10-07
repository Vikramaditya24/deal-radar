"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Loader2, Pause, Play, Square } from "lucide-react";
import { api, jsonPost } from "@/lib/client";
import type { JobView } from "@/lib/enrichment";
export function JobProgress({
  jobId,
  runToken,
  onDetected,
  onBusy,
  onChanged,
}: {
  jobId: string | null;
  runToken: number;
  onDetected: (id: string) => void;
  onBusy: (busy: boolean) => void;
  onChanged: () => void;
}) {
  const [job, setJob] = useState<JobView | null>(null),
    [running, setRunning] = useState(false),
    [error, setError] = useState("");
  const callback = useRef({ onDetected, onBusy, onChanged });
  callback.current = { onDetected, onBusy, onChanged };
  useEffect(() => {
    if (jobId) return;
    let active = true;
    api<JobView[]>("/api/enrichment/jobs")
      .then((jobs) => {
        if (active && jobs[0]) callback.current.onDetected(jobs[0].id);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [jobId]);
  useEffect(() => {
    setError("");
    setJob(null);
    if (jobId && runToken > 0) setRunning(true);
    else setRunning(false);
  }, [jobId, runToken]);
  useEffect(() => {
    callback.current.onBusy(running);
    return () => callback.current.onBusy(false);
  }, [running]);
  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<JobView>(`/api/enrichment/jobs/${jobId}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setJob(next);
        if (["completed", "cancelled", "failed"].includes(next.status)) {
          setRunning(false);
          return;
        }
        timer = setTimeout(poll, 1000);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Progress unavailable");
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [jobId, running]);
  useEffect(() => {
    if (!jobId || !running) return;
    let active = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const step = async () => {
      try {
        const next = await api<JobView>(
          `/api/enrichment/jobs/${jobId}/process`,
          { ...jsonPost({}), signal: controller.signal },
        );
        if (!active) return;
        setJob(next);
        if (["completed", "cancelled", "failed"].includes(next.status)) {
          callback.current.onChanged();
          setRunning(false);
          return;
        }
        const wakeTimes = next.progress
          .filter((p) => p.state === "waiting" && p.nextAttemptAt)
          .map((p) => p.nextAttemptAt!);
        const canWork = next.progress.some(
          (p) => p.state === "pending" || p.state === "processing",
        );
        const delay = canWork
          ? 250
          : wakeTimes.length
            ? Math.max(500, Math.min(5000, Math.min(...wakeTimes) - Date.now()))
            : 1000;
        timer = setTimeout(step, delay);
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : "Processing failed");
          setRunning(false);
        }
      }
    };
    void step();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [jobId, running]);
  async function cancel() {
    if (!jobId) return;
    setRunning(false);
    try {
      setJob(
        await api<JobView>(
          `/api/enrichment/jobs/${jobId}/cancel`,
          jsonPost({}),
        ),
      );
      callback.current.onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    }
  }
  if (!jobId && !error) return null;
  const finished = job ? job.completed + job.failed + job.blocked : 0;
  const terminal =
    job && ["completed", "cancelled", "failed"].includes(job.status);
  return (
    <Card className="mb-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            {running && <Loader2 className="size-4 animate-spin" />}Enrichment
            progress<Badge>{job?.status || "Loading"}</Badge>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {job
              ? `${finished}/${job.total} finished · ${job.completed} completed/partial · ${job.blocked} blocked · ${job.failed} failed`
              : "Reading saved progress"}
          </p>
        </div>
        <div className="flex gap-2">
          {!terminal && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!job}
                onClick={() => {
                  setError("");
                  setRunning((v) => !v);
                }}
              >
                {running ? <Pause /> : <Play />}
                {running ? "Pause" : "Resume"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!job}
                onClick={cancel}
              >
                <Square />
                Cancel job
              </Button>
            </>
          )}
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Enrichment completion"
        aria-valuenow={finished}
        aria-valuemin={0}
        aria-valuemax={job?.total || 1}
        className="mt-4 h-2 overflow-hidden rounded bg-muted"
      >
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${job ? (finished / job.total) * 100 : 0}%` }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Per-business outcome, retry waits and restrictions
        </summary>
        <ul className="mt-3 max-h-44 space-y-2 overflow-y-auto text-xs">
          {job?.progress.map((p) => (
            <li key={p.leadId} className="rounded border border-border p-2">
              <span className="font-medium">{p.pageUrls[0] || p.leadId}</span> ·{" "}
              {p.state} · {p.pageCursor}/{p.pageUrls.length} pages
              {p.error && (
                <p className="mt-1 text-muted-foreground">{p.error}</p>
              )}
              {p.nextAttemptAt && p.state === "waiting" && (
                <p className="mt-1 text-muted-foreground">
                  Next eligible attempt:{" "}
                  {new Date(p.nextAttemptAt).toLocaleTimeString()}
                </p>
              )}
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-3 text-xs text-muted-foreground">
        Client-driven work pauses when this page closes. Resume persisted
        progress after reopening. Host throttling is per server process.
      </p>
    </Card>
  );
}
