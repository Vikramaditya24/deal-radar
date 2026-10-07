import { z } from "zod";
import { leadQuerySchema, type LeadListItem } from "./contracts";
import { getThesis } from "./assessment";
import { scoreIsStale } from "./scoring";
import { listLeads } from "./leads";
import { ApiError } from "./api";
export const exportQuerySchema = leadQuerySchema
  .extend({
    format: z.enum(["hubspot", "salesforce"]),
    ids: z.string().min(1).max(19000).optional(),
  })
  .strict();
// Quote every cell; prefix dangerous formulas even after whitespace/control chars.
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
const headers = {
  hubspot: [
    "Company name",
    "Company domain name",
    "Phone number",
    "Industry",
    "City",
    "State/Region",
    "Country/Region",
    "Contact email (custom)",
    "Annual revenue",
    "Currency (custom)",
    "Deal Radar fit (custom)",
    "Deal Radar stage (custom)",
    "Synthetic (custom)",
    "Research origin (custom)",
  ],
  salesforce: [
    "Name",
    "Website",
    "Phone",
    "Industry",
    "BillingCity",
    "BillingState",
    "BillingCountry",
    "ContactEmail__c",
    "AnnualRevenue",
    "CurrencyIsoCode",
    "DealRadarFit__c",
    "DealRadarStage__c",
    "Synthetic__c",
    "ResearchOrigin__c",
  ],
};
export function exportRow(
  lead: LeadListItem,
  format: "hubspot" | "salesforce",
) {
  const f = lead.facts;
  return (
    [
      lead.name,
      format === "hubspot"
        ? lead.domain
        : lead.domain
          ? `https://${lead.domain}`
          : "",
      f.phone,
      f.industry,
      f.city,
      f.state,
      f.country,
      f.email,
      f.revenueCents === null ? "" : f.revenueCents / 100,
      f.currency,
      lead.score?.total ?? "",
      lead.stage,
      lead.synthetic ? "TRUE" : "FALSE",
      lead.synthetic
        ? "Synthetic demo fixture"
        : lead.domain
          ? `Supplied website: https://${lead.domain}; verify source facts`
          : "Unverified imported record",
    ]
      .map(csvCell)
      .join(",") + "\r\n"
  );
}
export async function prepareExport(
  workspaceId: string,
  input: z.infer<typeof exportQuerySchema>,
) {
  const ids = input.ids ? input.ids.split(",") : null;
  if (
    ids &&
    (!ids.length ||
      ids.length > 150 ||
      ids.some((id) => !id || id.length > 120) ||
      new Set(ids).size !== ids.length)
  )
    throw new ApiError(
      400,
      "INVALID_SELECTION",
      "Select 1–150 distinct businesses",
    );
  const filters = {
    ...input,
    page: 1,
    limit: 100,
    suppression: "active" as const,
  };
  // Selected exports deliberately use identity only; filter exports use current filters.
  const effective = ids
    ? {
        page: 1,
        limit: 100,
        q: "",
        thesisId: input.thesisId,
        sort: input.sort,
        suppression: "active" as const,
      }
    : filters;
  const first = await listLeads(workspaceId, effective);
  if (!ids && input.suppression !== "suppressed" && first.total > 1000)
    throw new ApiError(
      413,
      "EXPORT_TOO_LARGE",
      "Narrow filters to at most 1,000 businesses",
    );
  const thesis = input.thesisId
    ? await getThesis(workspaceId, input.thesisId)
    : null;
  const rows: LeadListItem[] = [];
  if (ids) {
    // Direct ID resolution checks workspace ownership and suppression without scanning
    // an unbounded directory. Selection remains bounded to 150 records.
    const { leadDetail } = await import("./leads");
    for (const id of ids) {
      const lead = await leadDetail(workspaceId, id);
      if (!lead.suppressed) {
        const score = lead.score;
        rows.push({
          ...lead,
          score:
            thesis &&
            score &&
            !scoreIsStale(
              score,
              lead.revision,
              thesis,
              new Date().toISOString().slice(0, 10),
            )
              ? score
              : null,
        });
      }
    }
  } else if (input.suppression !== "suppressed") {
    rows.push(...first.items);
    for (let page = 2; page <= Math.ceil(first.total / 100); page++)
      rows.push(
        ...(await listLeads(workspaceId, { ...effective, page })).items,
      );
  }
  // Recheck suppression immediately before emitting the prepared bytes.
  const { listSuppressions, matchesSuppression } =
    await import("./suppression");
  const entries = await listSuppressions(workspaceId);
  const safeRows = rows.filter(
    (l) =>
      !entries.some((s) =>
        matchesSuppression(s, {
          ...l,
          normalizedPhone: l.facts.phone?.replace(/\D/g, "") ?? null,
        }),
      ),
  );
  return {
    rows: safeRows,
    format: input.format,
    header: headers[input.format].map(csvCell).join(",") + "\r\n",
  };
}
export function csvStream(prepared: Awaited<ReturnType<typeof prepareExport>>) {
  let offset = -1;
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === -1) {
        controller.enqueue(encoder.encode(prepared.header));
        offset = 0;
        return;
      }
      if (offset >= prepared.rows.length) {
        controller.close();
        return;
      }
      controller.enqueue(
        encoder.encode(
          prepared.rows
            .slice(offset, offset + 100)
            .map((l) => exportRow(l, prepared.format))
            .join(""),
        ),
      );
      offset += 100;
    },
  });
}
