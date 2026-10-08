import { afterEach, it, expect, vi } from "vitest";
import { query, readJson, failure, ApiError } from "../lib/api";
import { databaseConfig } from "../lib/db";
import { sessionSecret } from "../lib/session";
import { z } from "zod";
afterEach(() => vi.unstubAllEnvs());
function local() {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("APP_ORIGIN", "");
  vi.stubEnv("TURSO_DATABASE_URL", "");
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
  vi.stubEnv("SESSION_SECRET", "");
}
function request(body = "{}", headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/demo", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}
it("rejects repeated query values instead of silently choosing one", () => {
  expect(() =>
    query(new Request("http://localhost/api/leads?page=1&page=2")),
  ).toThrow(ApiError);
  expect(query(new Request("http://localhost/api/leads?q=HVAC"))).toEqual({
    q: "HVAC",
  });
});
it("accepts matching-origin JSON and reports malformed JSON", async () => {
  local();
  expect(await readJson(request('{"ok":true}'))).toEqual({ ok: true });
  await expect(readJson(request("{broken"))).rejects.toMatchObject({
    status: 400,
    code: "INVALID_JSON",
  });
});
it("blocks absent or foreign origins and non-JSON content", async () => {
  local();
  await expect(readJson(request("{}", { origin: "" }))).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    readJson(request("{}", { origin: "https://foreign.example" })),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    readJson(request("{}", { "content-type": "text/plain" })),
  ).rejects.toMatchObject({ status: 400 });
});
it("enforces payload limits by UTF-8 bytes rather than character count", async () => {
  local();
  await expect(readJson(request('"ééé"'), 7)).rejects.toMatchObject({
    status: 413,
  });
});
it("uses explicit APP_ORIGIN when Next's internal URL differs", async () => {
  local();
  vi.stubEnv("APP_ORIGIN", "https://deal.example");
  const r = new Request("http://internal/api/demo", {
    method: "POST",
    headers: {
      origin: "https://deal.example",
      "content-type": "application/json",
    },
    body: "{}",
  });
  expect(await readJson(r)).toEqual({});
});
it("fails clearly for missing or malformed Vercel origin configuration", async () => {
  local();
  vi.stubEnv("VERCEL", "1");
  await expect(readJson(request())).rejects.toMatchObject({
    status: 503,
    code: "INVALID_CONFIGURATION",
  });
  for (const origin of [
    "https://deal.example/",
    "https://deal.example/path",
    "http://deal.example",
    "not-a-url",
  ]) {
    vi.stubEnv("APP_ORIGIN", origin);
    await expect(readJson(request())).rejects.toMatchObject({ status: 503 });
  }
});
it("returns safe structured Zod and application error responses", async () => {
  const invalid = z.object({ value: z.number() }).safeParse({ value: "bad" });
  expect(invalid.success).toBe(false);
  if (!invalid.success) {
    const response = failure(invalid.error);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_INPUT");
  }
  expect(failure(new ApiError(409, "STALE_STAGE", "Changed")).status).toBe(409);
});
it("preserves real in-memory/local libSQL URLs", () => {
  local();
  vi.stubEnv("TURSO_DATABASE_URL", "file::memory:");
  expect(databaseConfig().url).toBe("file::memory:");
  vi.stubEnv("TURSO_DATABASE_URL", "file:./data/deal-radar.db");
  expect(databaseConfig().local).toBe(true);
  expect(databaseConfig().url).toMatch(/deal-radar\.db$/);
});
it("requires a hosted URL and token on Vercel", () => {
  local();
  vi.stubEnv("VERCEL", "1");
  expect(() => databaseConfig()).toThrow("Vercel requires");
  vi.stubEnv("TURSO_DATABASE_URL", "libsql://unit-test.turso.io");
  expect(() => databaseConfig()).toThrow("TURSO_AUTH_TOKEN");
  vi.stubEnv("TURSO_AUTH_TOKEN", "test-only-not-a-real-token");
  expect(databaseConfig().local).toBe(false);
  vi.stubEnv("TURSO_DATABASE_URL", "postgres://unused");
  expect(() => databaseConfig()).toThrow("file: URL");
});
it("requires strong hosted session secrets without connecting to a provider", () => {
  local();
  expect(sessionSecret()).toContain("local-development");
  vi.stubEnv("VERCEL", "1");
  expect(() => sessionSecret()).toThrow("requires SESSION_SECRET");
  vi.stubEnv("SESSION_SECRET", "short");
  expect(() => sessionSecret()).toThrow("32 characters");
  vi.stubEnv("SESSION_SECRET", "a".repeat(40));
  expect(sessionSecret()).toBe("a".repeat(40));
});
