import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
import robotsParser from "robots-parser";
import { getDomain } from "tldts";
import { LruCache, cache } from "./cache";
export const USER_AGENT =
  "DealRadar/1.0 (public business research; respects robots.txt)";
export class CrawlError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
    public retryAt: number | null = null,
  ) {
    super(message);
  }
}
export class CrawlWait extends Error {
  constructor(public until: number) {
    super("Waiting for polite crawl schedule");
  }
}
export function publicAddress(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export function targetUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CrawlError("UNSAFE_URL", "Enter an absolute HTTP(S) URL");
  }
  const host = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  const domain = getDomain(host) || host;
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port &&
      !(
        (url.protocol === "https:" && url.port === "443") ||
        (url.protocol === "http:" && url.port === "80")
      ))
  )
    throw new CrawlError(
      "UNSAFE_URL",
      "Only public HTTP(S) URLs on standard ports are allowed",
    );
  if (
    !host.includes(".") ||
    /(?:^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) ||
    (isIP(host) && !publicAddress(host))
  )
    throw new CrawlError(
      "UNSAFE_URL",
      "Local, private, reserved and example hosts are not live crawl targets",
    );
  if (domain === "linkedin.com" || /^google\./.test(domain))
    throw new CrawlError(
      "DISALLOWED_SOURCE",
      "Google and LinkedIn are not supported crawl sources",
    );
  url.hash = "";
  return url;
}
export async function resolveTarget(
  raw: string,
  resolver: typeof lookup = lookup,
) {
  const url = targetUrl(raw),
    host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: { address: string; family: number }[];
  try {
    addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await resolver(host, { all: true, verbatim: true });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "DNS_ERROR";
    throw new CrawlError(
      "DNS_ERROR",
      `DNS lookup failed (${code})`,
      code !== "ENOTFOUND",
    );
  }
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new CrawlError(
      "UNSAFE_ADDRESS",
      "DNS includes a non-public address; request blocked",
    );
  const chosen = addresses.find((a) => a.family === 4) || addresses[0];
  return { url, address: chosen.address, family: chosen.family };
}
export type RawPage = {
  status: number;
  headers: Record<string, string>;
  text: string;
  observedAt: number;
};
export type SafeRequest = (
  target: Awaited<ReturnType<typeof resolveTarget>>,
  timeoutMs: number,
) => Promise<RawPage>;
export const pinnedRequest: SafeRequest = (target, timeoutMs) =>
  new Promise((resolve, reject) => {
    const transport = target.url.protocol === "https:" ? https : http;
    let settled = false;
    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    };
    const request = transport.request(
      target.url,
      {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,text/plain;q=0.8",
          "Accept-Encoding": "identity",
        },
        agent: false,
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options.all)
            callback(null, [
              { address: target.address, family: target.family },
            ]);
          else callback(null, target.address, target.family);
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > 1024 * 1024) {
            request.destroy();
            response.destroy();
            fail(new CrawlError("TOO_LARGE", "Response exceeds 1 MB"));
          } else chunks.push(Buffer.from(chunk));
        });
        response.on("error", fail);
        response.on("end", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(response.headers))
            if (value)
              headers[key] = Array.isArray(value) ? value.join(", ") : value;
          resolve({
            status: response.statusCode || 500,
            headers,
            text: Buffer.concat(chunks).toString("utf8"),
            observedAt: Date.now(),
          });
        });
      },
    );
    const timer = setTimeout(() => {
      request.destroy();
      fail(
        new CrawlError("TIMEOUT", "Request exceeded five-second timeout", true),
      );
    }, timeoutMs);
    request.on("error", (error) =>
      fail(
        error instanceof CrawlError
          ? error
          : new CrawlError("NETWORK", error.message, true),
      ),
    );
    request.end();
  });
export function retryAfter(value: string | undefined, now: number) {
  if (!value) return now + 2000;
  const seconds = Number(value);
  const at = Number.isFinite(seconds)
    ? now + Math.max(0, seconds) * 1000
    : Date.parse(value);
  return Math.min(
    now + 3600_000,
    Math.max(now + 2000, Number.isFinite(at) ? at : now + 2000),
  );
}
export class SafeCrawler {
  private hosts = new Map<
    string,
    { next: number; active: boolean; delay: number }
  >();
  private inflight = new Map<string, Promise<RawPage>>();
  constructor(
    private store: LruCache = cache,
    private resolver: typeof lookup = lookup,
    private transport: SafeRequest = pinnedRequest,
    private clock = Date.now,
  ) {}
  private async raw(url: string, deadline: number, purpose: "robots" | "page") {
    const key = `${purpose}:${url}`;
    const cached = this.store.get<RawPage>(key);
    if (cached) return cached;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const hostKey = targetUrl(url).hostname,
      host = this.hosts.get(hostKey) || { next: 0, active: false, delay: 2000 };
    if (host.active || host.next > this.clock())
      throw new CrawlWait(Math.max(host.next, this.clock() + 1000));
    host.active = true;
    host.next = this.clock() + host.delay;
    this.hosts.set(hostKey, host);
    const operation = (async () => {
      const timeout = Math.min(5000, deadline - this.clock());
      if (timeout <= 0) throw new CrawlWait(this.clock() + 1000);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const requestEnd = this.clock() + timeout;
      const target = await Promise.race([
        resolveTarget(url, this.resolver),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new CrawlError("TIMEOUT", "DNS lookup timeout", true)),
            timeout,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      const remaining = Math.min(
        requestEnd - this.clock(),
        deadline - this.clock(),
      );
      if (remaining <= 0)
        throw new CrawlError("TIMEOUT", "Request budget elapsed", true);
      host.next = this.clock() + host.delay;
      const page = await this.transport(target, remaining);
      if (page.status === 429 || page.status === 503) {
        host.next = Math.max(
          host.next,
          retryAfter(page.headers["retry-after"], this.clock()),
        );
        throw new CrawlError(
          "THROTTLED",
          `Website returned ${page.status}; respecting Retry-After`,
          true,
          host.next,
        );
      }
      if (page.status >= 500)
        throw new CrawlError(
          "HTTP_ERROR",
          `Website returned ${page.status}`,
          true,
        );
      if (
        purpose === "robots" ||
        page.status === 200 ||
        [301, 302, 303, 307, 308].includes(page.status)
      )
        this.store.set(
          key,
          page,
          purpose === "robots" ? 3600_000 : 6 * 3600_000,
        );
      return page;
    })().finally(() => {
      host.active = false;
      this.inflight.delete(key);
    });
    this.inflight.set(key, operation);
    return operation;
  }
  private async robots(
    url: URL,
    deadline: number,
    guard?: (url: string) => Promise<void>,
  ) {
    const robotsUrl = `${url.origin}/robots.txt`;
    let current = robotsUrl;
    let result: RawPage;
    for (let redirects = 0; ; redirects++) {
      await guard?.(current);
      result = await this.raw(current, deadline, "robots");
      if (![301, 302, 303, 307, 308].includes(result.status)) break;
      if (redirects === 3 || !result.headers.location)
        throw new CrawlError("ROBOTS_UNAVAILABLE", "robots.txt redirect limit");
      current = targetUrl(new URL(result.headers.location, current).href).href;
    }
    if (result.status === 404) return "No published robots.txt (404)";
    if (result.status !== 200)
      throw new CrawlError(
        "ROBOTS_UNAVAILABLE",
        `robots.txt returned ${result.status}; page retrieval deferred`,
        result.status >= 500,
      );
    if (/<html[\s>]/i.test(result.text) || result.text.includes("\0"))
      throw new CrawlError(
        "ROBOTS_INVALID",
        "robots.txt could not be safely interpreted",
      );
    if (result.text.trim() && !/user-agent\s*:/i.test(result.text))
      throw new CrawlError(
        "ROBOTS_INVALID",
        "robots.txt lacks a recognizable user-agent directive",
      );
    const policy = robotsParser(robotsUrl, result.text);
    const delay = policy.getCrawlDelay("DealRadar") || 0;
    const host = this.hosts.get(url.hostname);
    if (host && delay > 2) {
      host.delay = Math.min(delay * 1000, 24 * 3600_000);
      host.next = Math.max(host.next, result.observedAt + host.delay);
    }
    if (policy.isAllowed(url.href, "DealRadar") === false)
      throw new CrawlError("ROBOTS_BLOCKED", "robots.txt disallows this URL");
    return "Allowed by robots.txt for DealRadar";
  }
  async page(
    raw: string,
    deadline = this.clock() + 20_000,
    guard?: (url: string) => Promise<void>,
  ) {
    let url = targetUrl(raw);
    let note = "";
    for (let redirects = 0; redirects <= 3; redirects++) {
      await guard?.(url.href);
      note = await this.robots(url, deadline, guard);
      await guard?.(url.href);
      const page = await this.raw(url.href, deadline, "page");
      if ([301, 302, 303, 307, 308].includes(page.status)) {
        if (redirects === 3 || !page.headers.location)
          throw new CrawlError(
            "REDIRECT_LIMIT",
            "Redirect limit or missing redirect location",
          );
        url = targetUrl(new URL(page.headers.location, url).href);
        continue;
      }
      if (page.status !== 200)
        throw new CrawlError(
          page.status === 403 ? "BLOCKED" : "HTTP_ERROR",
          `Website returned ${page.status}; no bypass attempted`,
        );
      if (
        /(?:g-recaptcha|hcaptcha-container|cf-chl-|verify you are human|checking your browser)/i.test(
          page.text,
        )
      )
        throw new CrawlError(
          "CAPTCHA",
          "Website challenge detected; no bypass attempted",
        );
      if (
        page.headers["content-encoding"] &&
        !/^(identity)$/i.test(page.headers["content-encoding"])
      )
        throw new CrawlError(
          "CONTENT_ENCODING",
          "Website ignored identity encoding; compressed response not parsed",
        );
      if (
        !/text\/html|application\/xhtml\+xml/i.test(
          page.headers["content-type"] || "",
        )
      )
        throw new CrawlError("NOT_HTML", "Business page did not return HTML");
      return { ...page, url: url.href, robotsNote: note };
    }
    throw new CrawlError("REDIRECT_LIMIT", "Too many redirects");
  }
}
const globalCrawler = globalThis as typeof globalThis & {
  dealRadarCrawler?: SafeCrawler;
};
export const crawler = (globalCrawler.dealRadarCrawler ??= new SafeCrawler());
