import { z } from "zod";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import { randomUUID } from "node:crypto";
import { getDb, closeDb } from "../lib/db";
import { workspaces, theses } from "../lib/schema";
import { ingest, importSchema } from "../lib/ingest";
import {
  leadDetail,
  listLeads,
  moveLead,
  bulkAction,
  loadDemo,
} from "../lib/leads";
import { scoreBatch, saveOutreach } from "../lib/assessment";
import { createJob, getJob, processJob } from "../lib/enrichment";
import {
  addSuppressions,
  removeSuppression,
  listSuppressions,
  normalizeSuppression,
} from "../lib/suppression";
import {
  csvCell,
  prepareExport,
  csvStream,
  exportQuerySchema,
} from "../lib/export";
import { leadQuerySchema, bulkWriteSchema } from "../lib/contracts";
const url = process.env.TURSO_DATABASE_URL;
beforeAll(async () => {
  closeDb();
  process.env.TURSO_DATABASE_URL = "file::memory:";
  const db = await getDb();
  await migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["phase5", "other"])
    await db
      .insert(workspaces)
      .values({ id, sessionTokenHash: id, createdAt: 0 });
});
afterAll(() => {
  closeDb();
  if (url === undefined) delete process.env.TURSO_DATABASE_URL;
  else process.env.TURSO_DATABASE_URL = url;
});
async function add(name = "Sample", phone = "", email = "") {
  const domain = `${randomUUID()}.com`;
  const csv = `name,website,phone,email,industry,city,state,country,revenue,currency,foundedYear\n${name},https://${domain},${phone},${email},HVAC,Columbus,Ohio,US,1000000,USD,1985`;
  const result = await ingest(
    "phase5",
    importSchema.parse({ kind: "csv", content: csv }),
  );
  return leadDetail("phase5", result.leadIds[0]);
}
const filters = { page: 1, limit: 100, q: "" };
it("persists stage moves without invalidating evidence revision", async () => {
  const lead = await add();
  await moveLead("phase5", lead.id, {
    stage: "Contacted",
    expectedStage: "New",
  });
  const saved = await leadDetail("phase5", lead.id);
  expect(saved.stage).toBe("Contacted");
  expect(saved.revision).toBe(lead.revision);
  await expect(
    moveLead("phase5", lead.id, { stage: "Meeting", expectedStage: "New" }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    moveLead("other", lead.id, {
      stage: "Meeting",
      expectedStage: "Contacted",
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it("rolls back all bulk moves if one selected stage changed", async () => {
  const a = await add(),
    b = await add();
  await moveLead("phase5", b.id, { stage: "Replied", expectedStage: "New" });
  await expect(
    bulkAction("phase5", {
      action: "stage",
      stage: "Meeting",
      targets: [
        { id: a.id, expectedStage: "New" },
        { id: b.id, expectedStage: "New" },
      ],
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await leadDetail("phase5", a.id)).stage).toBe("New");
});
it("moves an entire valid selection atomically", async () => {
  const a = await add(),
    b = await add();
  await bulkAction("phase5", {
    action: "stage",
    stage: "Meeting",
    targets: [
      { id: a.id, expectedStage: "New" },
      { id: b.id, expectedStage: "New" },
    ],
  });
  expect((await leadDetail("phase5", a.id)).stage).toBe("Meeting");
  expect((await leadDetail("phase5", b.id)).stage).toBe("Meeting");
});
it("filters stage, industry, geography and synthetic data before pagination", async () => {
  await loadDemo("phase5");
  const result = await listLeads("phase5", {
    ...filters,
    industry: "HVAC",
    geography: "Ohio",
    synthetic: "false",
    stage: "Meeting",
  });
  expect(result.items.length).toBeGreaterThan(0);
  expect(
    result.items.every(
      (l) =>
        l.facts.industry === "HVAC" &&
        l.facts.state === "Ohio" &&
        l.stage === "Meeting" &&
        !l.synthetic,
    ),
  ).toBe(true);
});
it("filters only current thesis scores and rejects score filters without a thesis", async () => {
  const lead = await add();
  const thesisId = "phase5:sample-thesis";
  await scoreBatch("phase5", { thesisId, leadIds: [lead.id], useAI: false });
  const result = await listLeads("phase5", {
    ...filters,
    thesisId,
    minScore: 0,
    eligible: "true",
  });
  expect(result.items.some((l) => l.id === lead.id)).toBe(true);
  await expect(
    listLeads("phase5", { ...filters, minScore: 0 }),
  ).rejects.toMatchObject({ status: 400 });
  const db = await getDb();
  await db.update(theses).set({ revision: 2 }).where(eq(theses.id, thesisId));
  expect(
    (await listLeads("phase5", { ...filters, thesisId, minScore: 0 })).total,
  ).toBe(0);
});
it("suppression blocks job, drafting and both selected/filter exports", async () => {
  const lead = await add("Optout"),
    thesisId = "phase5:sample-thesis";
  await saveOutreach("phase5", lead.id, {
    thesisId,
    tone: "professional",
    channel: "email",
  });
  const job = await createJob("phase5", { leadIds: [lead.id] });
  await addSuppressions("phase5", [
    { kind: "domain", value: lead.domain!, reason: "Requested" },
  ]);
  const saved = await leadDetail("phase5", lead.id);
  expect(saved.suppressed).toBe(true);
  expect(saved.drafts[0].stale).toBe(true);
  expect((await getJob("phase5", job.id)).progress[0].state).toBe("blocked");
  expect((await processJob("phase5", job.id)).blocked).toBe(1);
  await expect(
    saveOutreach("phase5", lead.id, {
      thesisId,
      tone: "warm",
      channel: "linkedin",
    }),
  ).rejects.toMatchObject({ status: 403 });
  const selected = await prepareExport(
    "phase5",
    exportQuerySchema.parse({ format: "hubspot", ids: lead.id }),
  );
  expect(selected.rows).toHaveLength(0);
  const filtered = await prepareExport(
    "phase5",
    exportQuerySchema.parse({
      format: "salesforce",
      suppression: "suppressed",
    }),
  );
  expect(filtered.rows).toHaveLength(0);
  expect(filtered.rows.some((l) => l.id === lead.id)).toBe(false);
  expect(filtered.rows.every((l) => !l.suppressed)).toBe(true);
});
it("removal does not resume a job or restore draft freshness", async () => {
  const lead = await add(),
    job = await createJob("phase5", { leadIds: [lead.id] });
  await addSuppressions("phase5", [
    { kind: "lead", value: lead.id, reason: "Opt out" },
  ]);
  const entry = (await listSuppressions("phase5")).find(
    (e) => e.kind === "lead" && e.normalizedValue === lead.id,
  )!;
  await expect(removeSuppression("other", entry.id)).rejects.toMatchObject({
    status: 404,
  });
  await removeSuppression("phase5", entry.id);
  expect((await leadDetail("phase5", lead.id)).suppressed).toBe(false);
  expect((await getJob("phase5", job.id)).progress[0].state).toBe("blocked");
});
it("normalizes opt-out contacts consistently", async () => {
  const lead = await add(
    "Phone optout",
    "(614) 555-0112",
    "Owner@public.example",
  );
  await addSuppressions("phase5", [
    { kind: "phone", value: "6145550112", reason: "No calls" },
  ]);
  expect((await leadDetail("phase5", lead.id)).suppressed).toBe(true);
  expect(
    (
      await listLeads("phase5", { ...filters, suppression: "suppressed" })
    ).items.some((l) => l.id === lead.id),
  ).toBe(true);
  expect(normalizeSuppression("email", "Owner@PUBLIC.example")).toBe(
    "owner@public.example",
  );
  expect(
    normalizeSuppression("domain", "https://www.sample.example/about"),
  ).toBe("sample.example");
});
it("suppression entries never affect a different workspace", async () => {
  const lead = await add();
  await addSuppressions("other", [
    { kind: "domain", value: lead.domain!, reason: "Other workspace" },
  ]);
  expect((await leadDetail("phase5", lead.id)).suppressed).toBe(false);
});
it("rejects mixed-workspace suppression selections without partial writes", async () => {
  const lead = await add();
  await expect(
    bulkAction("phase5", {
      action: "suppress",
      leadIds: [lead.id, "missing"],
      reason: "Opt out",
    }),
  ).rejects.toMatchObject({ status: 404 });
  expect((await leadDetail("phase5", lead.id)).suppressed).toBe(false);
});
it("escapes CSV quotes, commas, line breaks and spreadsheet formulas", () => {
  for (const value of ["=1+1", " +SUM(A1:A2)", "\t@attack", "-1+2"])
    expect(csvCell(value)).toContain("'");
  expect(csvCell('A, "B"\nC')).toBe('"A, ""B""\nC"');
  expect(csvCell("ordinary")).toBe('"ordinary"');
});
it("streams complete CRM CSV with synthetic labels and bounded rows", async () => {
  for (const format of ["hubspot", "salesforce"] as const) {
    const prepared = await prepareExport(
      "phase5",
      exportQuerySchema.parse({ format, synthetic: "true" }),
    );
    const text = await new Response(csvStream(prepared)).text();
    const csv = z
      .array(z.record(z.string(), z.string()))
      .parse(parse(text, { columns: true }));
    expect(csv.length).toBe(150);
    expect(Object.keys(csv[0])).toContain(
      format === "hubspot" ? "Company name" : "Name",
    );
    expect(
      csv.every(
        (r: Record<string, string>) =>
          r[format === "hubspot" ? "Synthetic (custom)" : "Synthetic__c"] ===
          "TRUE",
      ),
    ).toBe(true);
  }
});
it("exports selected identity independently of active filters and hides stale scores", async () => {
  const lead = await add(),
    t = "phase5:sample-thesis";
  await scoreBatch("phase5", { thesisId: t, leadIds: [lead.id], useAI: false });
  const data = await prepareExport(
    "phase5",
    exportQuerySchema.parse({
      format: "hubspot",
      ids: lead.id,
      q: "does-not-match",
      thesisId: t,
    }),
  );
  expect(data.rows).toHaveLength(1);
  expect(data.rows[0].score).not.toBeNull();
  await getDb().then((db) =>
    db.update(theses).set({ revision: 3 }).where(eq(theses.id, t)),
  );
  expect(
    (
      await prepareExport(
        "phase5",
        exportQuerySchema.parse({
          format: "hubspot",
          ids: lead.id,
          thesisId: t,
        }),
      )
    ).rows[0].score,
  ).toBeNull();
  await expect(
    prepareExport(
      "other",
      exportQuerySchema.parse({ format: "hubspot", ids: lead.id }),
    ),
  ).rejects.toMatchObject({ status: 404 });
});
it("rejects invalid route contracts and duplicated export selections", async () => {
  expect(() => leadQuerySchema.parse({ stage: "Won" })).toThrow();
  expect(() => leadQuerySchema.parse({ minScore: 101 })).toThrow();
  expect(() =>
    bulkWriteSchema.parse({
      action: "stage",
      stage: "New",
      targets: [
        { id: "x", expectedStage: "New" },
        { id: "x", expectedStage: "New" },
      ],
    }),
  ).toThrow();
  await expect(
    prepareExport(
      "phase5",
      exportQuerySchema.parse({ format: "hubspot", ids: "x,x" }),
    ),
  ).rejects.toMatchObject({ status: 400 });
});
