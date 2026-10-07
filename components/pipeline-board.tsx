"use client";
import { useState } from "react";
import { stages, type LeadListItem } from "@/lib/contracts";
import { Badge } from "./ui/badge";
export function PipelineBoard({
  items,
  selected,
  onToggle,
  onOpen,
  onMove,
  busy,
}: {
  items: LeadListItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onMove: (lead: LeadListItem, stage: LeadListItem["stage"]) => void;
  busy: boolean;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
      {stages.map((stage) => {
        const rows = items.filter((l) => l.stage === stage);
        return (
          <section
            key={stage}
            aria-label={`${stage} pipeline column`}
            className={`min-h-52 rounded-xl border p-3 ${dragged ? "border-primary/50 bg-primary/5" : "border-border bg-muted/30"}`}
            onDragOver={(e) => {
              if (dragged && !busy) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const lead = items.find((l) => l.id === dragged);
              setDragged(null);
              if (lead && !busy && lead.stage !== stage) onMove(lead, stage);
            }}
          >
            <h3 className="mb-3 flex items-center justify-between text-sm font-semibold">
              {stage}
              <Badge>{rows.length} shown</Badge>
            </h3>
            <div className="max-h-[600px] space-y-3 overflow-auto">
              {rows.length ? (
                rows.map((lead) => (
                  <article
                    key={lead.id}
                    draggable={!busy}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", lead.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDragged(lead.id);
                    }}
                    onDragEnd={() => setDragged(null)}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={() => onToggle(lead.id)}
                        disabled={busy}
                        aria-label={`Select ${lead.name}`}
                      />{" "}
                      Select business
                    </label>
                    <button
                      className="text-left text-sm font-medium hover:text-primary"
                      onClick={() => onOpen(lead.id)}
                    >
                      {lead.name}
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {lead.facts.industry || "Industry unknown"}
                    </p>
                    <div className="my-2 flex flex-wrap gap-1">
                      <Badge>{lead.synthetic ? "Synthetic" : "Real"}</Badge>
                      {lead.suppressed && <Badge>Suppressed</Badge>}
                      <Badge>
                        {lead.score ? `${lead.score.total}/100` : "Unscored"}
                      </Badge>
                    </div>
                    <label className="text-xs">
                      Move to
                      <select
                        className="mt-1 w-full rounded border border-border bg-background p-2"
                        aria-label={`Move ${lead.name} to stage`}
                        value={lead.stage}
                        disabled={busy}
                        onChange={(e) =>
                          onMove(lead, e.target.value as LeadListItem["stage"])
                        }
                      >
                        {stages.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </article>
                ))
              ) : (
                <p className="py-7 text-center text-xs text-muted-foreground">
                  No businesses in this stage on the shown page. Drop a card
                  here or use a stage menu.
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
