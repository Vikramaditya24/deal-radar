import { describe, it, expect } from "vitest";
import { lookup } from "node:dns/promises";
import {
  SafeCrawler,
  CrawlWait,
  targetUrl,
  publicAddress,
  resolveTarget,
  retryAfter,
  type SafeRequest,
} from "../lib/crawler";
import { LruCache } from "../lib/cache";
import { parsePage } from "../lib/enrichment";
const resolver = (async () => [
  { address: "93.184.216.34", family: 4 },
]) as unknown as typeof lookup;
function setup(
  robots = "User-agent: *\nAllow: /",
  page = "<html><body>Hello</body></html>",
  location?: string,
) {
  let now = Date.UTC(2026, 9, 1);
  const calls: string[] = [];
  const transport: SafeRequest = async (target) => {
    calls.push(target.url.href);
    return {
      status:
        target.url.pathname === "/robots.txt" ? 200 : location ? 302 : 200,
      headers: {
        "content-type":
          target.url.pathname === "/robots.txt" ? "text/plain" : "text/html",
        ...(location ? { location } : {}),
      },
      text: target.url.pathname === "/robots.txt" ? robots : page,
      observedAt: now,
    };
  };
  const crawler = new SafeCrawler(
    new LruCache(200, 1e6, () => now),
    resolver,
    transport,
    () => now,
  );
  return {
    crawler,
    calls,
    advance: () => {
      now += 2000;
    },
  };
}
describe("safe polite retrieval", () => {
  it.each([
    "http://127.0.0.1",
    "http://169.254.169.254",
    "http://localhost",
    "http://10.0.0.1",
    "https://user:pass@public.com",
    "https://public.com:8080",
    "https://linkedin.com",
    "https://google.co.in",
    "https://anything.example",
  ])("rejects %s", (url) => {
    expect(() => targetUrl(url)).toThrow();
  });
  it("rejects private, mapped and mixed DNS addresses", async () => {
    expect(publicAddress("::ffff:127.0.0.1")).toBe(false);
    expect(publicAddress("100.64.0.1")).toBe(false);
    expect(publicAddress("93.184.216.34")).toBe(true);
    const mixed = (async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]) as unknown as typeof lookup;
    await expect(
      resolveTarget("https://public.com", mixed),
    ).rejects.toMatchObject({ code: "UNSAFE_ADDRESS" });
  });
  it("marks transient DNS failure retryable", async () => {
    const failing = (async () => {
      throw Object.assign(new Error("DNS temporarily unavailable"), {
        code: "EAI_AGAIN",
      });
    }) as unknown as typeof lookup;
    await expect(
      resolveTarget("https://public.com", failing),
    ).rejects.toMatchObject({ code: "DNS_ERROR", retryable: true });
  });
  it("retrieves robots first, waits two seconds, then reuses cache", async () => {
    const s = setup();
    await expect(s.crawler.page("https://public.com/")).rejects.toBeInstanceOf(
      CrawlWait,
    );
    expect(s.calls).toEqual(["https://public.com/robots.txt"]);
    s.advance();
    const page = await s.crawler.page("https://public.com/");
    expect(page.robotsNote).toContain("Allowed");
    await s.crawler.page("https://public.com/");
    expect(s.calls).toHaveLength(2);
  });
  it("never fetches a robots-disallowed page", async () => {
    const s = setup("User-agent: *\nDisallow: /");
    await expect(s.crawler.page("https://public.com/")).rejects.toMatchObject({
      code: "ROBOTS_BLOCKED",
    });
    expect(s.calls).toHaveLength(1);
  });
  it("blocks invalid robots, challenge HTML, and private redirects", async () => {
    const invalid = setup("<html>Login</html>");
    await expect(
      invalid.crawler.page("https://public.com/"),
    ).rejects.toMatchObject({ code: "ROBOTS_INVALID" });
    const challenge = setup(undefined, "<html>Verify you are human</html>");
    await expect(
      challenge.crawler.page("https://public.com/"),
    ).rejects.toBeInstanceOf(CrawlWait);
    challenge.advance();
    await expect(
      challenge.crawler.page("https://public.com/"),
    ).rejects.toMatchObject({ code: "CAPTCHA" });
    const redirect = setup(undefined, undefined, "http://127.0.0.1/admin");
    await expect(
      redirect.crawler.page("https://public.com/"),
    ).rejects.toBeInstanceOf(CrawlWait);
    redirect.advance();
    await expect(
      redirect.crawler.page("https://public.com/"),
    ).rejects.toMatchObject({ code: "UNSAFE_URL" });
    expect(redirect.calls).toHaveLength(2);
  });
  it("obeys Retry-After and sends a bounded request budget", async () => {
    let now = Date.UTC(2026, 9, 1),
      budget = 0;
    const transport: SafeRequest = async (target, timeout) => {
      budget = timeout;
      return {
        status: 429,
        headers: { "retry-after": "10" },
        text: "",
        observedAt: now,
      };
    };
    const crawler = new SafeCrawler(
      new LruCache(),
      resolver,
      transport,
      () => now,
    );
    await expect(crawler.page("https://public.com/")).rejects.toMatchObject({
      code: "THROTTLED",
      retryAt: now + 10000,
    });
    expect(budget).toBeLessThanOrEqual(5000);
    expect(retryAfter("10", now)).toBe(now + 10000);
    now += 2000;
    await expect(crawler.page("https://public.com/")).rejects.toBeInstanceOf(
      CrawlWait,
    );
  });
});
describe("quality evidence", () => {
  it("extracts visible history, contacts, services and tech without hidden claims", () => {
    const p = parsePage(
      '<html><head><script src="/wp-content/x.js"></script></head><body><h1>Acme</h1><p>Founded in 1982. Family-owned since 1982. Our founder is exploring a leadership transition. Team includes 12 employees. Commercial HVAC maintenance.</p><div hidden>Founded in 1900.</div><a href="/contact">Contact</a><a href="mailto:hello@acme.com">Email</a></body></html>',
      "https://acme.com",
      false,
      Date.UTC(2026, 9, 1),
    );
    expect(p.evidence.find((e) => e.field === "foundedYear")?.value).toBe(1982);
    expect(p.evidence.find((e) => e.field === "email")?.value).toBe(
      "hello@acme.com",
    );
    expect(p.evidence.find((e) => e.field === "techHints")?.confidence).toBe(
      0.45,
    );
    expect(p.signals.map((s) => s.type)).toContain("transition_language");
    expect(
      p.evidence.every(
        (e) => e.sourceUrl === "https://acme.com" && !e.synthetic,
      ),
    ).toBe(true);
  });
  it("does not infer revenue or last update from appearance", () => {
    const p = parsePage(
      "<html><body>Copyright 2017. We look successful.</body></html>",
      "https://acme.com",
      false,
      Date.UTC(2026, 9, 1),
    );
    expect(p.evidence.some((e) => e.field === "revenueCents")).toBe(false);
    expect(p.signals[0].explanation).toContain("cannot establish");
  });
  it("expires and evicts bounded LRU entries", () => {
    let now = 0;
    const c = new LruCache(2, 100, () => now);
    c.set("a", 1, 100);
    c.set("b", 2, 100);
    c.get("a");
    c.set("c", 3, 100);
    expect(c.get("b")).toBeUndefined();
    now = 101;
    expect(c.get("a")).toBeUndefined();
  });
});
