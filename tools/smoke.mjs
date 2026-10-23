#!/usr/bin/env node
/**
 * Smoke test every OnyxChin source against a running API.
 *   node tools/smoke.mjs [baseUrl]
 * Default base: http://127.0.0.1:8891
 */
const BASE = process.argv[2] ?? process.env.ONYX_API ?? "http://127.0.0.1:8891";
const SOURCES = ["rajadonghua", "anichin", "animexin", "yunshanid", "donghuaworld"];

async function j(path) {
  const t0 = performance.now();
  const res = await fetch(BASE + path, { headers: { accept: "application/json" } });
  const ms = Math.round(performance.now() - t0);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ms, body };
}

const rows = [];
let failures = 0;

for (const src of SOURCES) {
  const row = { source: src };

  const home = await j(`/api/${src}/home`);
  row.home = `${home.status} · ${home.body?.data?.sections?.length ?? 0} rows · ${home.ms}ms`;

  const list = await j(`/api/${src}/list?page=1`);
  row.list = `${list.status} · ${list.body?.data?.items?.length ?? 0} items · ${list.ms}ms`;

  const search = await j(`/api/${src}/search?q=soul`);
  row.search = `${search.status} · ${search.body?.data?.length ?? 0} hits · ${search.ms}ms`;

  let detailSlug = list.body?.data?.items?.[0]?.slug ?? null;
  if (detailSlug) {
    const detail = await j(`/api/${src}/anime/${encodeURIComponent(detailSlug)}`);
    const eps = detail.body?.data?.episodes?.length ?? 0;
    row.detail = `${detail.status} · ${eps} eps · ${detail.ms}ms`;
    const ep = detail.body?.data?.episodes?.[0]?.slug ?? "1";
    if (eps > 0) {
      const watch = await j(`/api/${src}/watch/${encodeURIComponent(detailSlug)}/${encodeURIComponent(ep)}`);
      const s = watch.body?.data?.sources ?? [];
      const playable = s.filter((x) => x.playable).length;
      row.watch = `${watch.status} · ${s.length} sources (${playable} playable) · ${watch.ms}ms`;
    } else {
      row.watch = "no episodes";
    }
  } else {
    row.detail = "no list item";
    row.watch = "-";
  }

  for (const [k, v] of Object.entries(row)) {
    if (k !== "source" && String(v).startsWith("5") === false && String(v).startsWith("2") === false) {
      if (!["no episodes", "-", "no list item"].includes(String(v))) failures++;
    }
  }
  rows.push(row);
}

const cols = ["source", "home", "list", "search", "detail", "watch"];
const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)));
console.log(cols.map((c, i) => c.padEnd(widths[i])).join("  "));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const r of rows) console.log(cols.map((c, i) => String(r[c] ?? "").padEnd(widths[i])).join("  "));

console.log(`\n${failures === 0 ? "OK" : `${failures} failure(s)`} — ${BASE}`);
process.exit(failures === 0 ? 0 : 1);
