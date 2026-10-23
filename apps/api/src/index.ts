import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { sources, sourceList } from "./registry.js";
import { proxyImage, proxyMedia, proxyHls } from "./lib/proxy.js";
import type { SourceId } from "@onyxchin/shared";

const app = new Hono();
app.use("*", logger());
app.use("*", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"], maxAge: 86400 }));

app.get("/api/health", (c) =>
  c.json({ ok: true, service: "onyxchin-api", sources: sourceList.map((s) => s.id), ts: Date.now() })
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

app.get("/api/:source/home", async (c) => {
  const src = pick(c.req.param("source"));
  if (!src) return c.json({ error: "unknown source" }, 404);
  try {
    return c.json({ data: await src.home() });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.get("/api/:source/list", async (c) => {
  const src = pick(c.req.param("source"));
  if (!src) return c.json({ error: "unknown source" }, 404);
  try {
    const page = Number(c.req.query("page") ?? 1) || 1;
    const data = await src.list({
      page,
      genre: c.req.query("genre") || undefined,
      status: c.req.query("status") || undefined,
      order: c.req.query("order") || undefined,
    });
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
    return c.json({ data: await src.search(q) });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.get("/api/:source/anime/:slug", async (c) => {
  const src = pick(c.req.param("source"));
  if (!src) return c.json({ error: "unknown source" }, 404);
  try {
    return c.json({ data: await src.detail(c.req.param("slug")) });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.get("/api/:source/watch/:slug/:ep", async (c) => {
  const src = pick(c.req.param("source"));
  if (!src) return c.json({ error: "unknown source" }, 404);
  try {
    return c.json({ data: await src.watch(c.req.param("slug"), c.req.param("ep")) });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

function pick(id: string) {
  return sources[id as SourceId];
}

const port = Number(process.env.PORT ?? 8790);
serve({ fetch: app.fetch, port }, (i) => {
  console.log(`onyxchin-api listening on :${i.port}`);
});
