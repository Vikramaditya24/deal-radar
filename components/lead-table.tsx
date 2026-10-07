"use client";
import { useEffect, useRef, useState } from "react";
import type { LeadListItem } from "@/lib/contracts";
import { stages } from "@/lib/contracts";
import { Badge } from "./ui/badge";
export function LeadTable({
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
  const [top, setTop] = useState(0),
    scroll = useRef<HTMLDivElement>(null);
  const rowHeight = 88;
  useEffect(() => {
    scroll.current?.scrollTo(0, 0);
    setTop(0);
  }, [items]);
  const start = Math.max(0, Math.floor(top / rowHeight) - 3),
    end = Math.min(items.length, start + 16),
    shown = items.slice(start, end);
  return (
    <div
      ref={scroll}
      className="max-h-[640px] overflow-auto"
      tabIndex={0}
      aria-label="Scrollable business table"
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
    >
      <table
        className="w-full min-w-[950px] table-fixed text-left text-sm"
        aria-rowcount={items.length + 1}
      >
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            {[
              "Select",
              "Business",
              "Industry / location",
              "Revenue",
              "Fit",
              "Pipeline",
            ].map((h, i) => (
              <th
                key={h}
                className={`px-4 py-3 text-xs font-medium ${i === 0 ? "w-16" : i === 1 ? "w-64" : i === 2 ? "w-56" : i === 3 ? "w-36" : i === 4 ? "w-24" : "w-40"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {start > 0 && (
            <tr aria-hidden="true">
              <td
                colSpan={6}
                style={{ height: start * rowHeight, padding: 0 }}
              />
            </tr>
          )}
          {shown.map((lead, index) => (
            <tr
              key={lead.id}
              aria-rowindex={start + index + 2}
              className="border-t border-border hover:bg-muted/40"
              style={{ height: rowHeight }}
            >
              <td className="px-4">
                <input
                  type="checkbox"
                  aria-label={`Select ${lead.name}`}
                  checked={selected.has(lead.id)}
                  onChange={() => onToggle(lead.id)}
                  disabled={busy}
                />
              </td>
              <td className="px-4">
                <button
                  className="block w-full truncate text-left font-medium hover:text-primary hover:underline"
                  onClick={() => onOpen(lead.id)}
                >
                  {lead.name}
                </button>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {lead.domain || "No website"}
                </p>
                <div className="mt-1 flex gap-1">
                  <Badge>{lead.synthetic ? "Synthetic" : "Real"}</Badge>
                  {lead.suppressed && <Badge>Suppressed</Badge>}
                </div>
              </td>
              <td className="px-4">
                <p className="truncate">
                  {lead.facts.industry || "Industry unknown"}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {[lead.facts.city, lead.facts.state, lead.facts.country]
                    .filter(Boolean)
                    .join(", ") || "Location unknown"}
                </p>
              </td>
              <td className="px-4 tabular-nums">
                {lead.facts.revenueCents === null
                  ? "Unknown"
                  : `${lead.facts.currency || ""} ${(lead.facts.revenueCents / 100).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })}`}
                <p className="mt-1 text-xs text-muted-foreground">
                  {lead.synthetic ? "Illustrative" : "Unverified"}
                </p>
              </td>
              <td className="px-4 tabular-nums">
                {lead.score ? `${lead.score.total}/100` : "—"}
                {lead.score && !lead.score.eligible && (
                  <p className="text-xs">Excluded</p>
                )}
              </td>
              <td className="px-4">
                <select
                  className="w-full rounded border border-border bg-background p-2 text-xs"
                  aria-label={`Pipeline stage for ${lead.name}`}
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
              </td>
            </tr>
          ))}
          {end < items.length && (
            <tr aria-hidden="true">
              <td
                colSpan={6}
                style={{ height: (items.length - end) * rowHeight, padding: 0 }}
              />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
