import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { sources, sourceList } from "./registry.js";
import { proxyImage, proxyMedia, proxyHls, proxySubtitle } from "./lib/proxy.js";
import { cached, cacheStats } from "./lib/cache.js";
import { jsonCached, jsonNoStore } from "./lib/respond.js";
import { fetchDocDetailed } from "./lib/http.js";
import { isValidCode, readSync, sanitizeEntries, syncAvailable, writeSync } from "./lib/sync.js";
import type { SourceId } from "@onyxchin/shared";

const app = new Hono();
app.use("*", logger());
app.use("*", cors({ origin: "*", allowMethods: ["GET", "PUT", "OPTIONS"], maxAge: 86400 }));

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "onyxchin-api",
    sources: sourceList.map((s) => s.id),
    cache: cacheStats(),
    sync: syncAvailable(),
    memory: memorySnapshot(),
    ts: Date.now(),
  })
);


const DIAG_HOSTS = ["donghuaworld.com", "animexin.dev", "anichin.my", "rajadonghua.com"];

app.get("/api/diag", async (c) => {
  const target = c.req.query("u");
  if (!target) return c.json({ error: "missing u" }, 400);
  let host = "";
  try {
    host = new URL(target).hostname.toLowerCase();
  } catch {
    return c.json({ error: "bad url" }, 400);
  }
  if (!DIAG_HOSTS.some((h) => host === h || host.endsWith("." + h))) {
    return c.json({ error: "host not allowed", allow: DIAG_HOSTS }, 403);
  }
  const force = c.req.query("via");
  if (force === "relay") process.env.ONYX_RELAY_ONLY = "1";
  if (force === "proxy") process.env.ONYX_FORCE_PROXY = "1";
  try {
    const { res, via, ms, attempts } = await fetchDocDetailed(target, { timeoutMs: 20000 });
    const body = await res.text();
    delete process.env.ONYX_RELAY_ONLY;
    delete process.env.ONYX_FORCE_PROXY;
    return c.json({ via, ms, status: res.status, bytes: body.length, attempts, sample: body.slice(0, 80) });
  } catch (e) {
    delete process.env.ONYX_RELAY_ONLY;
    delete process.env.ONYX_FORCE_PROXY;
    const attempts = (e as { attempts?: unknown }).attempts ?? [];
    return c.json({ error: String(e), attempts }, 502);
  }
});

app.get("/api/sources", (c) =>
  jsonCached(c, {
    data: sourceList.map((s) => ({
      id: s.id,
      name: s.name,
      baseUrl: s.baseUrl,
      lang: s.lang,
    })),
  }, { maxAge: 300, sMaxAge: 600, swr: 3600 })
);

app.get("/api/img", proxyImage);
app.get("/api/hls", proxyHls);
app.get("/api/hls/seg", proxyMedia);
app.get("/api/media", proxyMedia);
app.get("/api/sub", proxySubtitle);

app.get("/api/sync/:code", async (c) => {
  if (!syncAvailable()) return c.json({ error: "sync_disabled" }, 503);
  const code = c.req.param("code").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!isValidCode(code)) return c.json({ error: "invalid_code" }, 400);
  try {
    const snapshot = await readSync(code);
    if (!snapshot) return c.json({ error: "not_found" }, 404);
    return c.json({ code, ...snapshot });
  } catch (error) {
    console.error("[sync:get]", error);
    return c.json({ error: "sync_unavailable", detail: String(error).slice(0, 180) }, 503);
  }
});

app.put("/api/sync/:code", async (c) => {
  if (!syncAvailable()) return c.json({ error: "sync_disabled" }, 503);
  const code = c.req.param("code").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!isValidCode(code)) return c.json({ error: "invalid_code" }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const payload = body as { entries?: unknown };
  const entries = sanitizeEntries(payload?.entries);
  try {
    const snapshot = await writeSync(code, entries);
    return c.json({ code, ...snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "payload_too_large") return c.json({ error: "payload_too_large" }, 413);
    console.error("[sync:put]", error);
    return c.json({ error: "sync_unavailable", detail: String(error).slice(0, 180) }, 503);
  }
});

app.get("/api/:source/home", async (c) => {
  const src = pick(c.req.param("source"));
  if (!src) return c.json({ error: "unknown source" }, 404);
  try {
    const data = await cached(`${src.id}:home`, 300_000, () => src.home());
    return jsonCached(c, { data }, { maxAge: 30, sMaxAge: 300, swr: 1200 });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.get("/api/:source/list", async (c) => {
  const src = pick(c.req.param("source"));
  if (!src) return c.json({ error: "unknown source" }, 404);
  try {
    const page = Number(c.req.query("page") ?? 1) || 1;
    const genre = c.req.query("genre") || undefined;
    const status = c.req.query("status") || undefined;
    const order = c.req.query("order") || undefined;
    const data = await cached(`${src.id}:list:${page}:${genre ?? ""}:${status ?? ""}:${order ?? ""}`, 180_000, () =>
      src.list({ page, genre, status, order })
    );
    return jsonCached(c, { data }, { maxAge: 30, sMaxAge: 180, swr: 720 });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.get("/api/:source/search", async (c) => {
  const src = pick(c.req.param("source"));
  if (!src) return c.json({ error: "unknown source" }, 404);
  const q = (c.req.query("q") ?? "").trim();
  if (!q) return c.json({ data: [] });
  try {
    const data = await cached(`${src.id}:search:${q.toLowerCase()}`, 300_000, () => src.search(q));
    return jsonCached(c, { data }, { maxAge: 60, sMaxAge: 300, swr: 900 });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.get("/api/:source/anime/:slug", async (c) => {
  const src = pick(c.req.param("source"));
  if (!src) return c.json({ error: "unknown source" }, 404);
  try {
    const slug = c.req.param("slug");
    const data = await cached(`${src.id}:detail:${slug}`, 600_000, () => src.detail(slug));
    return jsonCached(c, { data }, { maxAge: 60, sMaxAge: 600, swr: 1800 });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.get("/api/:source/watch/:slug/:ep", async (c) => {
  const src = pick(c.req.param("source"));
  if (!src) return c.json({ error: "unknown source" }, 404);
  try {
    const data = await src.watch(c.req.param("slug"), c.req.param("ep"));
    return jsonNoStore(c, { data });
  } catch (e) {
    return c.json({ error: String(e) }, errorStatus(e));
  }
});

function errorStatus(e: unknown): 400 | 403 | 404 | 502 {
  const msg = String(e).toLowerCase();
  if (msg.includes("vip_locked")) return 403;
  if (msg.includes("not_found") || msg.includes("not found")) return 404;
  if (msg.includes("invalid episode")) return 400;
  return 502;
}

function pick(id: string) {
  return sources[id as SourceId];
}


/** Render free instances die at 512 MB; expose the number so it is visible early. */
function memorySnapshot() {
  const usage = process.memoryUsage();
  return {
    rssMb: Math.round(usage.rss / 1024 / 1024),
    heapMb: Math.round(usage.heapUsed / 1024 / 1024),
    limitMb: 512,
  };
}

const port = Number(process.env.PORT ?? 8891);
serve({ fetch: app.fetch, port }, (i) => {
  console.log(`onyxchin-api listening on :${i.port}`);
});
