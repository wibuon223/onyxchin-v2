#!/usr/bin/env node
/**
 * OnyxChin outbound fetch relay.
 *
 * Render's datacenter IPs get 403 from Cloudflare-fronted donghua sites. This
 * relay runs on the home box (residential egress) and is exposed through the
 * existing cloudflared tunnel, so the API can fall back to it for those hosts.
 *
 *   PORT=8896 RELAY_TOKEN=xxx node tools/fetch-relay.mjs
 *
 * GET /?u=<encoded url>[&ref=<referer>]  with  x-relay-token: <token>
 */
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8896);
const TOKEN = process.env.RELAY_TOKEN ?? "";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 25_000;

const PRIVATE =
  /^(localhost|127\.|0\.|10\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|\[?::1\]?|.*\.local)$/i;

function badHost(host) {
  return PRIVATE.test(host) || !host.includes(".");
}

const cache = new Map(); // url -> { status, type, body, expires }
const CACHE_TTL = 60_000;
const CACHE_MAX = 120;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, relay: "onyxchin-fetch", ts: Date.now() }));
    return;
  }
  if (TOKEN && req.headers["x-relay-token"] !== TOKEN) {
    res.writeHead(401).end("bad token");
    return;
  }
  const target = url.searchParams.get("u");
  if (!target) {
    res.writeHead(400).end("missing u");
    return;
  }
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.writeHead(400).end("bad url");
    return;
  }
  if (!/^https?:$/.test(parsed.protocol) || badHost(parsed.hostname)) {
    res.writeHead(403).end("host blocked");
    return;
  }

  const cached = cache.get(parsed.toString());
  if (cached && cached.expires > Date.now()) {
    res.writeHead(cached.status, {
      "content-type": cached.type,
      "cache-control": "no-store",
      "x-relay-cache": "hit",
    });
    res.end(cached.body);
    return;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(parsed, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        ...(url.searchParams.get("ref") ? { referer: url.searchParams.get("ref") } : {}),
      },
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      res.writeHead(502).end("too large");
      return;
    }
    const type = upstream.headers.get("content-type") ?? "application/octet-stream";
    if (upstream.status === 200 && buf.length < 1_500_000) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(parsed.toString(), { status: 200, type, body: buf, expires: Date.now() + CACHE_TTL });
    }
    res.writeHead(upstream.status, {
      "content-type": type,
      "cache-control": "no-store",
      "x-relay-status": String(upstream.status),
    });
    res.end(buf);
  } catch (err) {
    res.writeHead(502).end(`relay error: ${String(err).slice(0, 120)}`);
  } finally {
    clearTimeout(timer);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`onyxchin fetch relay on http://127.0.0.1:${PORT}`);
});
