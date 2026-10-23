import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { sources, sourceList } from "./registry.js";
import { proxyImage, proxyMedia, proxyHls, proxySubtitle } from "./lib/proxy.js";
import { cached, cacheStats } from "./lib/cache.js";
import type { SourceId } from "@onyxchin/shared";

const app = new Hono();
app.use("*", logger());
app.use("*", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"], maxAge: 86400 }));

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "onyxchin-api",
    sources: sourceList.map((s) => s.id),
    cache: cacheStats(),
    ts: Date.now(),
  })
);

app.get("/api/sources", (c) =>
  c.json({
    data: sourceList.map((s) => ({
      id: s.id,
      name: s.name,
      baseUrl: s.baseUrl,
      lang: s.lang,
    })),
  })
);

app.get("/api/img", proxyImage);
app.get("/api/hls", proxyHls);
app.get("/api/hls/seg", proxyMedia);
app.get("/api/media", proxyMedia);
app.get("/api/sub", proxySubtitle);

app.get("/api/:source/home", async (c) => {
  const src = pick(c.req.param("source"));
  if (!src) return c.json({ error: "unknown source" }, 404);
  try {
    const data = await cached(`${src.id}:home`, 90_000, () => src.home());
    return c.json({ data });
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
    const data = await cached(`${src.id}:list:${page}:${genre ?? ""}:${status ?? ""}:${order ?? ""}`, 60_000, () =>
      src.list({ page, genre, status, order })
    );
    return c.json({ data });
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
    const data = await cached(`${src.id}:search:${q.toLowerCase()}`, 120_000, () => src.search(q));
    return c.json({ data });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.get("/api/:source/anime/:slug", async (c) => {
  const src = pick(c.req.param("source"));
  if (!src) return c.json({ error: "unknown source" }, 404);
  try {
    const slug = c.req.param("slug");
    const data = await cached(`${src.id}:detail:${slug}`, 120_000, () => src.detail(slug));
    return c.json({ data });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.get("/api/:source/watch/:slug/:ep", async (c) => {
  const src = pick(c.req.param("source"));
  if (!src) return c.json({ error: "unknown source" }, 404);
  try {
    const data = await src.watch(c.req.param("slug"), c.req.param("ep"));
    return c.json({ data });
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

const port = Number(process.env.PORT ?? 8891);
serve({ fetch: app.fetch, port }, (i) => {
  console.log(`onyxchin-api listening on :${i.port}`);
});
