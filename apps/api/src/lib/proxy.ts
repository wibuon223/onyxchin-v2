import type { Context } from "hono";
import { fetchDoc, fetchRaw } from "./http.js";

const ALLOW = [
  "rajadonghua.com",
  "anichin.my",
  "animexin.dev",
  "donghuaworld.com",
  "donghuaworld.in",
  "wsrv.nl",
  "i0.wp.com",
  "i1.wp.com",
  "i2.wp.com",
  "i3.wp.com",
  "i.ibb.co",
  "i.ibb.co.com",
  "iili.io",
  "i.postimg.cc",
  "img.youtube.com",
  "cdn.myanimelist.net",
  "dailymotion.com",
  "dmcdn.net",
];

/** Hosts that reject non-browser TLS and must ride the curl_cffi relay. */
const DM_HOSTS = /(^|\.)(dailymotion\.com|dmcdn\.net)$/i;

/**
 * Dailymotion's Fastly edge 403s curl/undici but 200s a Chrome handshake, so DM
 * media is fetched through the dm-relay service (curl_cffi impersonation).
 */
async function fetchUpstream(
  url: string,
  opts: { referer: string; range?: string; timeoutMs?: number }
): Promise<Response> {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  const relay = process.env.ONYX_DM_RELAY;
  if (relay && DM_HOSTS.test(host)) {
    const target = `${relay.replace(/\/$/, "")}/fetch?u=${encodeURIComponent(url)}&ref=${encodeURIComponent(opts.referer)}`;
    const headers: Record<string, string> = {};
    if (opts.range) headers.range = opts.range;
    if (process.env.ONYX_DM_RELAY_TOKEN) headers["x-relay-token"] = process.env.ONYX_DM_RELAY_TOKEN;
    const res = await fetch(target, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 40000) });
    return res;
  }
  return fetchRaw(url, {
    referer: opts.referer,
    timeoutMs: opts.timeoutMs ?? 30000,
    headers: opts.range ? { range: opts.range } : {},
  });
}

function hostAllowed(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return ALLOW.some((a) => h === a || h.endsWith("." + a));
  } catch {
    return false;
  }
}

export const IMG_HOSTS = ALLOW;

export async function proxyImage(c: Context) {
  const target = c.req.query("url");
  if (!target) return c.json({ error: "missing url" }, 400);
  if (!hostAllowed(target)) return c.json({ error: "host not allowed" }, 403);
  try {
    const res = await fetchDoc(target, { referer: new URL(target).origin + "/", timeoutMs: 20000 });
    const body = await res.arrayBuffer();
    const type = res.headers.get("content-type") ?? "image/jpeg";
    return new Response(body, {
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=604800, immutable",
        "access-control-allow-origin": "*",
      },
    });
  } catch {
    return c.json({ error: "upstream failed" }, 502);
  }
}

/** Media proxy: forwards Range so <video> seeking works. */
export async function proxyMedia(c: Context) {
  const target = c.req.query("u");
  if (!target) return c.json({ error: "missing u" }, 400);
  const decoded = decodeURIComponent(target);
  if (!hostAllowed(decoded)) return c.json({ error: "host not allowed" }, 403);
  const range = c.req.header("range");
  const referer = c.req.query("ref") || new URL(decoded).origin + "/";
  try {
    const res = await fetchUpstream(decoded, { referer, range, timeoutMs: 40000 });
    const upstreamType = res.headers.get("content-type") ?? "";
    const length = Number(res.headers.get("content-length") ?? 0);
    // HLS masters point at variant playlists, not segments. The browser reaches
    // those through /api/hls/seg, so this endpoint must rewrite nested playlists
    // too — otherwise relative segment paths resolve against our own origin.
    if (isPlaylist(decoded, upstreamType, length, range)) {
      const text = await res.text();
      return new Response(rewritePlaylist(text, new URL(decoded), referer), {
        headers: {
          "content-type": "application/vnd.apple.mpegurl",
          "access-control-allow-origin": "*",
          "cache-control": "no-store",
        },
      });
    }
    const headers = new Headers();
    for (const h of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const v = res.headers.get(h);
      if (v) headers.set(h, v);
    }
    headers.set("content-type", mediaType(decoded, upstreamType));
    headers.set("access-control-allow-origin", "*");
    headers.set("cache-control", "public, max-age=3600");
    return new Response(res.body, { status: res.status, headers });
  } catch {
    return c.json({ error: "upstream failed" }, 502);
  }
}

/**
 * Dailymotion serves variants from URLs like `…/x.m3u8#cell=cf3` and often with
 * a generic content-type, so hash/query stripping plus a size check are both
 * required — a missed match here makes hls.js resolve `0.m4s` against our host.
 */
function isPlaylist(url: string, contentType: string, length: number, range?: string): boolean {
  if (/mpegurl/i.test(contentType)) return true;
  const clean = url.split("#")[0].split("?")[0].toLowerCase();
  if (clean.endsWith(".m3u8")) return true;
  if (clean.endsWith(".m4s") || clean.endsWith(".ts") || clean.endsWith(".mp4")) return false;
  if (range) return false;
  const generic = !contentType || /text\/plain|octet-stream|application\/vnd\.apple/i.test(contentType);
  return generic && (length === 0 || length < 900_000);
}

/** Rewrite every URI in a playlist so the browser only ever talks to us. */
export function rewritePlaylist(text: string, base: URL, referer?: string): string {
  return text
    .split("\n")
    .map((line) => {
      const l = line.trim();
      if (!l) return line;
      if (l.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${segUrl(base, uri, referer)}"`);
      }
      return segUrl(base, l, referer);
    })
    .join("\n");
}

function mediaType(url: string, upstream: string): string {
  const generic = !upstream || /^(text\/plain|application\/octet-stream|binary\/octet-stream)/i.test(upstream);
  if (!generic) return upstream;
  const path = url.split("?")[0].toLowerCase();
  if (path.endsWith(".mp4") || path.endsWith(".m4v")) return "video/mp4";
  if (path.endsWith(".webm")) return "video/webm";
  if (path.endsWith(".ts")) return "video/mp2t";
  if (path.endsWith(".m4s") || path.endsWith(".cmfv")) return "video/iso.segment";
  if (path.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (path.endsWith(".vtt")) return "text/vtt; charset=utf-8";
  if (path.endsWith(".srt")) return "text/plain; charset=utf-8";
  if (/\.(jpg|jpeg)$/.test(path)) return "image/jpeg";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

/**
 * Subtitle proxy: SRT is not playable in <track>, so convert to WebVTT on the fly.
 * Upstream subs are usually UTF-8; strip BOM and normalize CRLF.
 */
export async function proxySubtitle(c: Context) {
  const target = c.req.query("u");
  if (!target) return c.json({ error: "missing u" }, 400);
  const decoded = decodeURIComponent(target);
  if (!hostAllowed(decoded)) return c.json({ error: "host not allowed" }, 403);
  try {
    const res = await fetchRaw(decoded, { referer: new URL(decoded).origin + "/", timeoutMs: 20000 });
    const raw = (await res.text()).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    return new Response(toVtt(raw), {
      headers: {
        "content-type": "text/vtt; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=86400",
      },
    });
  } catch {
    return c.json({ error: "upstream failed" }, 502);
  }
}

export function toVtt(raw: string): string {
  if (/^WEBVTT/.test(raw)) return raw;
  const body = raw
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .replace(/^\s*\d+\s*\n(?=\d{2}:\d{2}:\d{2})/gm, "");
  return "WEBVTT\n\n" + body.trim() + "\n";
}

/** HLS proxy: rewrites every URI in a playlist through /api/hls/seg. */
export async function proxyHls(c: Context) {
  const target = c.req.query("u");
  if (!target) return c.json({ error: "missing u" }, 400);
  const decoded = decodeURIComponent(target);
  if (!hostAllowed(decoded)) return c.json({ error: "host not allowed" }, 403);
  const base = new URL(decoded);
  try {
    const dmReferer = c.req.query("ref") || base.origin + "/";
    const res = await fetchUpstream(decoded, { referer: dmReferer, timeoutMs: 30000 });
    const text = await res.text();
    const out = rewritePlaylist(text, base, dmReferer);
    return new Response(out, {
      headers: {
        "content-type": "application/vnd.apple.mpegurl",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
    });
  } catch {
    return c.json({ error: "upstream failed" }, 502);
  }
}

function segUrl(base: URL, raw: string, referer?: string): string {
  const resolved = new URL(raw, base);
  resolved.hash = ""; // Dailymotion tags variants with "#cell=…"; keep it out of u=
  const ref = referer ? `&ref=${encodeURIComponent(referer)}` : "";
  return `/api/hls/seg?u=${encodeURIComponent(resolved.toString())}${ref}`;
}
