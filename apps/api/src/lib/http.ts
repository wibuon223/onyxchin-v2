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

/** Direct request first; on a bot-wall status fall back to a relay. */
export async function fetchDoc(url: string, opts: FetchOpts = {}): Promise<Response> {
  const forceRelay = process.env.ONYX_RELAY_ONLY === "1";
  if (!forceRelay) {
    try {
      return await fetchRaw(url, opts);
    } catch (err) {
      if (!isBlocked(err) || opts.method === "POST") throw err;
    }
  }
  return fetchViaRelay(url, opts);
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
