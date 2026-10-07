import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb, closeDb } from "../lib/db";
import { workspaces, enrichmentJobs, suppressions } from "../lib/schema";
import { ingest, importSchema } from "../lib/ingest";
import { createJob, getJob, processJob, cancelJob } from "../lib/enrichment";
import { crawler, CrawlError } from "../lib/crawler";
const originalUrl = process.env.TURSO_DATABASE_URL;
beforeAll(async () => {
  // Use the real libSQL engine and migrations without a disposable file.
  // Windows can retain native database handles until the worker exits, making
  // unlinking a temporary database in afterAll unreliable even after close().
  closeDb();
  process.env.TURSO_DATABASE_URL = "file::memory:";
  const db = await getDb();
  await migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["test-one", "test-two"])
    await db
      .insert(workspaces)
      .values({ id, sessionTokenHash: id, createdAt: Date.now() });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  closeDb();
  if (originalUrl === undefined) delete process.env.TURSO_DATABASE_URL;
  else process.env.TURSO_DATABASE_URL = originalUrl;
});
async function add(domain: string) {
  return (
    await ingest(
      "test-one",
      importSchema.parse({ kind: "urls", content: `https://${domain}` }),
    )
  ).leadIds[0];
}
describe("database-backed polled jobs", () => {
  it("merges repeated imports without adding targets", async () => {
    const first = await add("acme.com");
    const second = await add("acme.com");
    expect(second).toBe(first);
  });
  it("isolates job reads and rejects unavailable target IDs", async () => {
    const leadId = await add("isolation.com");
    const job = await createJob("test-one", { leadIds: [leadId] });
    await expect(getJob("test-two", job.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      createJob("test-two", { leadIds: [leadId] }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("uses initial attempt plus exactly two retries", async () => {
    const leadId = await add("timeouts.com");
    const job = await createJob("test-one", { leadIds: [leadId] });
    const spy = vi
      .spyOn(crawler, "page")
      .mockRejectedValue(
        new CrawlError("TIMEOUT", "Five-second timeout", true),
      );
    for (let n = 0; n < 3; n++) {
      const db = await getDb();
      const saved = await getJob("test-one", job.id);
      await db
        .update(enrichmentJobs)
        .set({
          progress: saved.progress.map((p) => ({ ...p, nextAttemptAt: 0 })),
        })
        .where(eq(enrichmentJobs.id, job.id));
      await processJob("test-one", job.id);
    }
    const saved = await getJob("test-one", job.id);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(saved.failed).toBe(1);
    expect(saved.status).toBe("completed");
    await processJob("test-one", job.id);
    expect(spy).toHaveBeenCalledTimes(3);
  });
  it("clears a recovered transient error and completes", async () => {
    const leadId = await add("recovered.com"),
      job = await createJob("test-one", { leadIds: [leadId] });
    vi.spyOn(crawler, "page")
      .mockRejectedValueOnce(new CrawlError("TIMEOUT", "timeout", true))
      .mockResolvedValue({
        status: 200,
        headers: { "content-type": "text/html" },
        text: "<html><body>Founded in 1980.</body></html>",
        observedAt: Date.now(),
        url: "https://recovered.com",
        robotsNote: "Allowed by robots.txt",
      });
    await processJob("test-one", job.id);
    const db = await getDb(),
      saved = await getJob("test-one", job.id);
    await db
      .update(enrichmentJobs)
      .set({
        progress: saved.progress.map((p) => ({ ...p, nextAttemptAt: 0 })),
      })
      .where(eq(enrichmentJobs.id, job.id));
    const finished = await processJob("test-one", job.id);
    expect(finished.progress[0].state).toBe("completed");
    expect(finished.progress[0].error).toBeNull();
  });
  it("blocks suppression before a save and persists the blocked outcome", async () => {
    const leadId = await add("suppressed.com"),
      job = await createJob("test-one", { leadIds: [leadId] });
    vi.spyOn(crawler, "page").mockImplementation(async () => {
      const db = await getDb();
      await db
        .insert(suppressions)
        .values({
          id: randomUUID(),
          workspaceId: "test-one",
          kind: "lead",
          normalizedValue: leadId,
          reason: "opt out",
          createdAt: Date.now(),
        });
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        text: "<html><body>Founded in 1980.</body></html>",
        observedAt: Date.now(),
        url: "https://suppressed.com",
        robotsNote: "Allowed",
      };
    });
    const finished = await processJob("test-one", job.id);
    expect(finished.blocked).toBe(1);
    expect(finished.status).toBe("completed");
    const again = await createJob("test-one", { leadIds: [leadId] });
    expect(again.blocked).toBe(1);
  });
  it("does no work after cancellation", async () => {
    const leadId = await add("cancelled.com"),
      job = await createJob("test-one", { leadIds: [leadId] });
    await cancelJob("test-one", job.id);
    const spy = vi.spyOn(crawler, "page");
    expect((await processJob("test-one", job.id)).status).toBe("cancelled");
    expect(spy).not.toHaveBeenCalled();
  });
});
