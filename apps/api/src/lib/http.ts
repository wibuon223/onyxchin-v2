import { ProxyAgent, fetch as undiciFetch } from "undici";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface FetchOpts {
  referer?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

/**
 * Cloudflare-fronted upstreams (animexin.dev, yunshanid.site, donghuaworld.com)
 * answer 403 to datacenter ASNs such as Render's. Local/WSL egress works, so the
 * adapters use these helpers and silently fall back to an outbound relay when the
 * direct request is blocked. Media/proxy traffic keeps using fetchRaw (no relay).
 */
export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await fetchDoc(url, opts);
  return res.text();
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetchDoc(url, opts);
  return (await res.json()) as T;
}

/**
 * Direct request first. If the host bot-walls us (Cloudflare 403 on datacenter
 * IPs), retry through the residential proxy, then through a relay as last resort.
 *
 *   ONYX_PROXY_URL=http://user:pass@brd.superproxy.io:44445
 */
export async function fetchDoc(url: string, opts: FetchOpts = {}): Promise<Response> {
  return (await fetchDocDetailed(url, opts)).res;
}

export type FetchVia = "direct" | "proxy" | "relay";

/** Same chain as fetchDoc but reports which route served the request (for /api/diag). */
export interface FetchAttempt {
  via: FetchVia;
  ms: number;
  error?: string;
}

export async function fetchDocDetailed(
  url: string,
  opts: FetchOpts = {}
): Promise<{ res: Response; via: FetchVia; ms: number; attempts: FetchAttempt[] }> {
  const t0 = Date.now();
  const attempts: FetchAttempt[] = [];
  const mark = (via: FetchVia, error?: unknown) =>
    attempts.push({ via, ms: Date.now() - t0, ...(error ? { error: String(error).slice(0, 120) } : {}) });
  const done = (res: Response, via: FetchVia) => ({ res, via, ms: Date.now() - t0, attempts });

  if (process.env.ONYX_FORCE_PROXY === "1" && hasProxy()) {
    try {
      const res = await fetchViaProxy(url, opts);
      mark("proxy");
      return done(res, "proxy");
    } catch (err) {
      mark("proxy", err);
      throw err;
    }
  }
  const forceRelay = process.env.ONYX_RELAY_ONLY === "1";
  // Known bot-walled hosts never answer Render directly (Cloudflare stalls ~20s
  // before a 403), so skip that dead end instead of burning the request budget.
  const knownBlocked = shouldProxy(url, null) || relayAllowed(url);
  let lastError: unknown = null;
  if (!forceRelay && !knownBlocked) {
    try {
      const res = await fetchRaw(url, opts);
      mark("direct");
      return done(res, "direct");
    } catch (err) {
      mark("direct", err);
      lastError = err;
      if (!isBlocked(err) || opts.method === "POST") throw err;
    }
    // Rate limits on a direct-friendly host are usually transient: one short
    // retry beats paying for a proxy round-trip.
    if (!shouldProxy(url, lastError) && lastError instanceof HttpError && [429, 503].includes(lastError.status)) {
      await sleep(450);
      try {
        return done(await fetchRaw(url, opts), "direct");
      } catch (err) {
        lastError = err;
      }
    }
  }
  // Hosts that our own relay can reach go through it first: Bright Data stalls
  // from Render's egress for these very sites, and the relay answers in ~2-7s.
  if (relayAllowed(url) && !forceRelay) {
    try {
      const res = await fetchViaRelay(url, opts);
      mark("relay");
      return done(res, "relay");
    } catch (err) {
      mark("relay", err);
      lastError = err;
    }
  }
  if (hasProxy() && !proxyDisabled() && shouldProxy(url, lastError)) {
    // Rotating residential exits occasionally hang; one retry lands on a fresh
    // exit and usually succeeds.
    try {
      const res = await fetchViaProxy(url, opts);
      mark("proxy");
      return done(res, "proxy");
    } catch (err) {
      mark("proxy", err);
      markProxyFailure();
    }
  }
  if (!relayAllowed(url) && !forceRelay) {
    throw lastError ?? new Error(`upstream blocked: ${url}`);
  }
  try {
    const res = await fetchViaRelay(url, opts);
    mark("relay");
    return done(res, "relay");
  } catch (err) {
    mark("relay", err);
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { attempts });
  }
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/**
 * Free relays are a last resort and rate limited; only spend them on hosts we
 * know nothing else can reach.
 */
function relayAllowed(url: string): boolean {
  const hosts = (process.env.ONYX_RELAY_HOSTS ?? "animexin.dev,yunshanid.site,donghuaworld.com")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  try {
    const host = new URL(url).hostname.toLowerCase();
    return hosts.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

let proxyAgent: ProxyAgent | null = null;
let proxyFails = 0;
let proxyCooldownUntil = 0;


/**
 * Prefer direct egress unless the host is known to bot-wall datacenter IPs.
 * A transient network error on a normally-direct host must not burn proxy
 * bandwidth (or 20s of latency) — only 403/429/503 earns the proxy there.
 */
function shouldProxy(url: string, err: unknown): boolean {
  const hosts = (process.env.ONYX_PROXY_HOSTS ?? "animexin.dev,yunshanid.site,donghuaworld.com")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (hosts.some((h) => host === h || host.endsWith("." + h))) return true;
  return err instanceof HttpError && [403, 429, 503].includes(err.status);
}

function hasProxy(): boolean {
  return Boolean(process.env.ONYX_PROXY_URL);
}

function proxyDisabled(): boolean {
  return Date.now() < proxyCooldownUntil;
}

function getProxyAgent(): ProxyAgent {
  if (!proxyAgent) {
    proxyAgent = new ProxyAgent({ uri: process.env.ONYX_PROXY_URL as string });
  }
  return proxyAgent as ProxyAgent;
}

function markProxyFailure(): void {
  proxyFails += 1;
  if (proxyFails >= 2) {
    // Bright Data sometimes stalls from Render's egress; skip it for a while and
    // let the relay serve those hosts instead of making users wait.
    proxyCooldownUntil = Date.now() + 300_000;
    proxyFails = 0;
  }
}

async function fetchViaProxy(url: string, opts: FetchOpts): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12000);
  try {
    const init = {
      method: opts.method ?? "GET",
      body: opts.body,
      signal: ctrl.signal,
      redirect: "follow",
      dispatcher: getProxyAgent(),
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        ...(opts.referer ? { referer: opts.referer } : {}),
        ...(opts.headers ?? {}),
      },
    } as RequestInit;
    // Node's global fetch ignores undici's `dispatcher`; use undici's own fetch
    // so the ProxyAgent actually carries the request.
    const res = await undiciFetch(url, init as Parameters<typeof undiciFetch>[1]);
    if (!res.ok) throw new HttpError(res.status, url);
    proxyFails = 0;
    return res as unknown as Response;
  } finally {
    clearTimeout(timer);
  }
}

function isBlocked(err: unknown): boolean {
  if (err instanceof HttpError) return [403, 429, 503].includes(err.status);
  return err instanceof Error && /fetch failed|aborted|timeout|ENOTFOUND|ECONNRESET/i.test(err.message);
}

type Relay = { build: (url: string, referer?: string) => string; headers?: Record<string, string>; timeoutMs?: number };

/**
 * Relay order matters: our own tunnel relay (residential egress, fast) first,
 * then free public proxies as a last resort. Configure with
 *   ONYX_RELAY_BASE=https://ocf.empty.codes/       (receives ?u=…&ref=…)
 *   ONYX_RELAY_TOKEN=…                             (sent as x-relay-token)
 */
function relayChain(): Relay[] {
  const chain: Relay[] = [];
  const base = process.env.ONYX_RELAY_BASE;
  if (base) {
    chain.push({
      build: (u, ref) => `${base}${base.includes("?") ? "&" : "?"}u=${encodeURIComponent(u)}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`,
      headers: process.env.ONYX_RELAY_TOKEN ? { "x-relay-token": process.env.ONYX_RELAY_TOKEN } : undefined,
      timeoutMs: 20_000,
    });
  }
  chain.push(
    { build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, timeoutMs: 15_000 },
    { build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`, timeoutMs: 15_000 }
  );
  return chain;
}

async function fetchViaRelay(url: string, opts: FetchOpts): Promise<Response> {
  let lastErr: unknown = new Error("relay unavailable");
  for (const relay of relayChain()) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), relay.timeoutMs ?? opts.timeoutMs ?? 20_000);
    try {
      const res = await fetch(relay.build(url, opts.referer), {
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          "user-agent": UA,
          accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          ...(relay.headers ?? {}),
        },
      });
      if (res.ok) return res;
      lastErr = new HttpError(res.status, url);
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export async function fetchRaw(url: string, opts: FetchOpts = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      body: opts.body,
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        ...(opts.referer ? { referer: opts.referer } : {}),
        ...(opts.headers ?? {}),
      },
    });
    if (!res.ok) throw new HttpError(res.status, url);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export class HttpError extends Error {
  constructor(public status: number, public url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

export function absolute(base: string, maybe: string | null | undefined): string | null {
  if (!maybe) return null;
  try {
    return new URL(maybe, base).toString();
  } catch {
    return null;
  }
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#8217;|&#039;|&apos;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}
