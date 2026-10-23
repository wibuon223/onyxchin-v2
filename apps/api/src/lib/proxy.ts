import type { Context } from "hono";
import { fetchRaw } from "./http.js";

const ALLOW = [
  "rajadonghua.com",
  "anichin.my",
  "animexin.dev",
  "yunshanid.site",
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
];

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
    const res = await fetchRaw(target, { referer: new URL(target).origin + "/", timeoutMs: 25000 });
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
    const res = await fetchRaw(decoded, {
      referer,
      timeoutMs: 30000,
      headers: range ? { range } : {},
    });
    const headers = new Headers();
    const upstreamType = res.headers.get("content-type") ?? "";
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

function mediaType(url: string, upstream: string): string {
  const generic = !upstream || /^(text\/plain|application\/octet-stream|binary\/octet-stream)/i.test(upstream);
  if (!generic) return upstream;
  const path = url.split("?")[0].toLowerCase();
  if (path.endsWith(".mp4") || path.endsWith(".m4v")) return "video/mp4";
  if (path.endsWith(".webm")) return "video/webm";
  if (path.endsWith(".ts")) return "video/mp2t";
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
    const res = await fetchRaw(decoded, { referer: base.origin + "/", timeoutMs: 25000 });
    const text = await res.text();
    const out = text
      .split("\n")
      .map((line) => {
        const l = line.trim();
        if (!l) return line;
        if (l.startsWith("#")) {
          return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${segUrl(base, uri)}"`);
        }
        return segUrl(base, l);
      })
      .join("\n");
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

function segUrl(base: URL, raw: string): string {
  const abs = new URL(raw, base).toString();
  return `/api/hls/seg?u=${encodeURIComponent(abs)}`;
}
