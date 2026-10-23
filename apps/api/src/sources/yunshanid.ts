/**
 * YunshanID adapter — Astro site (React islands) on https://yunshanid.site.
 *
 * Discovery facts verified live on 2026-10-24:
 * - Every page ships its data twice: as escaped Astro island props
 *   (`<astro-island props="{&quot;items&quot;:[1,[[0,{&quot;id&quot;:[0,25],…}]]}">`)
 *   and as server-rendered cards. The island props are the authoritative and
 *   complete lists, so they are parsed first; the DOM is only a fallback.
 *   Astro serialises values as `[0, value]` and arrays as `[1, [ [0, value], … ]]`.
 * - There is no catalog page. The homepage features 30 series + 9 movies, and
 *   `/jadwal` carries the weekly schedule (79 unique series). The sitemap
 *   enumerates all 98 `/synopsis/<id>` pages, so the ~10 titles missing from
 *   both HTML sources are hydrated once from their own synopsis page (cached).
 * - The only JSON endpoint is the header search: `GET /ipa/search?q=` — max 12
 *   hits, no pagination, empty query returns [].
 * - Upstream has no genre/status facets (no category pages, no filter endpoint)
 *   and no subtitle tracks; `list()` therefore ignores `genre`/`status`.
 * - Posters are public CDN URLs (wsrv.nl, i.ibb.co.com, i.pinimg.com, iili.io,
 *   i.postimg.cc) and load without a referer, so they are returned absolute and
 *   never routed through our `/api/img` proxy.
 * - Playback is iframe-only: Google Drive `/preview`, Dailymotion, OK.ru,
 *   VK Video, Abyss, RUBY. Downloads on the page duplicate those mirrors in a
 *   non-embeddable form, so they are not surfaced as sources.
 */
import { load, type CheerioAPI } from "cheerio";
import type {
  Anime,
  Card,
  DetailPayload,
  Episode,
  HomePayload,
  ListPayload,
  SourceAdapter,
  SourceKind,
  VideoSource,
  WatchPayload,
} from "@onyxchin/shared";
import { fetchJson, fetchText } from "../lib/http.js";

const BASE = "https://yunshanid.site";
const REFERER = `${BASE}/`;
const PAGE_SIZE = 24;
const TTL_PAGE_MS = 5 * 60_000;
const TTL_DATA_MS = 10 * 60_000;
/** Hard cap; per-episode page keys would otherwise grow the cache forever. */
const CACHE_MAX_ENTRIES = 400;
/** Above this many sitemap-only ids we skip hydration instead of hammering the site. */
const MAX_HYDRATE = 24;
const HYDRATE_CONCURRENCY = 3;

// ---------------------------------------------------------------------------
// Promise cache (concurrency-safe: the in-flight promise is what gets cached)
// ---------------------------------------------------------------------------

interface CacheEntry {
  expiresAt: number;
  value: Promise<unknown>;
}

const cache = new Map<string, CacheEntry>();

function cached<T>(key: string, ttlMs: number, produce: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now < hit.expiresAt) return hit.value as Promise<T>;
  const value = produce();
  const entry: CacheEntry = { expiresAt: now + ttlMs, value };
  cache.set(key, entry);
  if (cache.size > CACHE_MAX_ENTRIES) {
    for (const [cachedKey, cachedEntry] of cache) {
      if (cachedEntry.expiresAt <= now) cache.delete(cachedKey);
    }
    // Map iteration preserves insertion order, so the oldest keys go first.
    for (const cachedKey of cache.keys()) {
      if (cache.size <= CACHE_MAX_ENTRIES) break;
      if (cachedKey !== key) cache.delete(cachedKey);
    }
  }
  value.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return value;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const width = Math.min(Math.max(1, limit), items.length);
  let cursor = 0;
  const runners = Array.from({ length: width }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index] as T, index);
    }
  });
  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------------------
// Astro island props
// ---------------------------------------------------------------------------


interface Island {
  url: string;
  props: Record<string, unknown>;
}

/** Decodes Astro's `[0, value]` / `[1, [ [0, value], … ]]` serialisation. */
function astroUnwrap(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 2 && (value[0] === 0 || value[0] === 1)) {
      const inner: unknown = value[1];
      if (value[0] === 1 && Array.isArray(inner)) return inner.map((entry) => astroUnwrap(entry));
      return astroUnwrap(inner);
    }
    return value.map((entry) => astroUnwrap(entry));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = astroUnwrap(entry);
    }
    return out;
  }
  return value;
}

function parseIslands(html: string): { $: CheerioAPI; islands: Island[] } {
  const $ = load(html);
  const islands: Island[] = [];
  $("astro-island").each((_, element) => {
    const raw = $(element).attr("props");
    if (!raw) return;
    let decoded: unknown;
    try {
      decoded = astroUnwrap(JSON.parse(raw));
    } catch {
      return;
    }
    if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) return;
    islands.push({
      url: $(element).attr("component-url") ?? "",
      props: decoded as Record<string, unknown>,
    });
  });
  return { $, islands };
}

function findIsland(islands: Island[], component: string): Island | undefined {
  return islands.find((island) => island.url.includes(component));
}

// ---------------------------------------------------------------------------
// Small value helpers
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Posters are public CDN assets — absolute URL, never our image proxy. */
function posterUrl(raw: unknown): string | null {
  const value = asString(raw)?.trim();
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${BASE}${value}`;
  return value;
}

function absoluteUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${BASE}${value}`;
  return value;
}

// ---------------------------------------------------------------------------
// Upstream records → shared contract
// ---------------------------------------------------------------------------

interface SeriesRecord {
  id: string;
  title: string;
  poster: string | null;
  /** Upstream "EP n" badge: newest episode *number*, which can skip values. */
  latestEp?: number;
  status?: string;
  type?: string;
}

function toSeriesRecord(raw: unknown): SeriesRecord | null {
  const source = asRecord(raw);
  const id = asString(source.id)?.trim();
  const title = asString(source.title)?.trim();
  if (!id || !title) return null;
  return {
    id,
    title,
    poster: posterUrl(source.poster_url),
    latestEp: asNumber(source.latest_ep),
    status: asString(source.status)?.trim() || undefined,
    type: asString(source.type)?.trim() || undefined,
  };
}

function seriesRecords(value: unknown): SeriesRecord[] {
  return asArray(value)
    .map(toSeriesRecord)
    .filter((record): record is SeriesRecord => record !== null);
}

function toCard(record: SeriesRecord): Card {
  return {
    id: record.id,
    slug: record.id,
    title: record.title,
    poster: record.poster,
    type: record.type,
    status: record.status,
    episodes: record.latestEp,
  };
}

function toAnime(record: SeriesRecord, synopsis?: string): Anime {
  return {
    id: record.id,
    slug: record.id,
    title: record.title,
    synopsis,
    poster: record.poster,
    type: record.type,
    status: record.status,
    totalEpisodes: record.latestEp,
    sourceId: "yunshanid",
  };
}

function toEpisode(number: number): Episode {
  return { number, slug: String(number) };
}

/** Episode numbers from an EpisodeGrid / allEpisodes island payload. */
function episodeNumbers(value: unknown): number[] {
  const numbers = new Set<number>();
  for (const raw of asArray(value)) {
    const number = asNumber(asRecord(raw).ep_number);
    if (number !== undefined) numbers.add(number);
  }
  return [...numbers].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Fetch layer
// ---------------------------------------------------------------------------

function scheduleHtml(): Promise<string> {
  return cached("page:jadwal", TTL_PAGE_MS, () => fetchText(`${BASE}/jadwal`, { referer: REFERER }));
}

function synopsisHtml(id: string): Promise<string> {
  return cached(`page:synopsis:${id}`, TTL_DATA_MS, () =>
    fetchText(`${BASE}/synopsis/${id}`, { referer: REFERER }),
  );
}

// ---------------------------------------------------------------------------
// Homepage islands
// ---------------------------------------------------------------------------

interface HomeData {
  hero: SeriesRecord[];
  latest: SeriesRecord[];
  movies: SeriesRecord[];
}

async function homeData(): Promise<HomeData> {
  const { islands } = parseIslands(
    await cached("page:home", TTL_PAGE_MS, () => fetchText(`${BASE}/`, { referer: REFERER })),
  );
  const banner = findIsland(islands, "Banner");
  const grids = islands.filter((island) => island.url.includes("HomeGrid"));
  const latestGrid =
    grids.find((island) => asString(island.props.sectionId) === "latest-update-section") ?? grids[0];
  const movieGrid = grids.find((island) => asString(island.props.sectionId) === "movie-section");

  const latest = seriesRecords(latestGrid?.props.items);
  return {
    hero: seriesRecords(banner?.props.items),
    latest,
    movies: seriesRecords(movieGrid?.props.items),
  };
}

// ---------------------------------------------------------------------------
// /jadwal (weekly schedule) — plain server-rendered cards per day panel
// ---------------------------------------------------------------------------

interface ScheduleDay {
  day: string;
  items: SeriesRecord[];
}

function scheduleDays(html: string): ScheduleDay[] {
  const $ = load(html);
  const dayTabs: string[] = [];
  $("[data-day-tab]").each((_, element) => {
    const day = $(element).attr("data-day-tab")?.trim();
    if (day) dayTabs.push(day);
  });

  const days: ScheduleDay[] = [];
  $(".schedule-day-panel").each((index, panel) => {
    const items: SeriesRecord[] = [];
    const seen = new Set<string>();
    $(panel)
      .find('a[href^="/synopsis/"]')
      .each((_, link) => {
        const href = $(link).attr("href") ?? "";
        const id = href.match(/\/synopsis\/(\d+)/)?.[1];
        if (!id || seen.has(id)) return;
        const title = $(link).find("div.truncate").first().text().replace(/\s+/g, " ").trim();
        if (!title) return;
        seen.add(id);
        const badge = $(link).text().match(/EP\s+(\d+)/i);
        items.push({
          id,
          title,
          poster: posterUrl($(link).find("img").attr("src")),
          latestEp: badge ? Number(badge[1]) : undefined,
        });
      });
    if (!items.length) return;
    const cardDay = $(panel).find("span").last().text().trim();
    days.push({ day: dayTabs[index] ?? cardDay, items });
  });
  return days;
}

// ---------------------------------------------------------------------------
// Catalog (homepage + schedule + sitemap hydration)
// ---------------------------------------------------------------------------

function sitemapSeriesIds(xml: string): string[] {
  const ids = new Set<string>();
  for (const match of xml.matchAll(/\/synopsis\/(\d+)</g)) ids.add(match[1] as string);
  return [...ids];
}

function seriesRecordFromIsland(islands: Island[]): SeriesRecord | null {
  for (const component of ["SynopsisActions", "WatchClient"]) {
    const island = findIsland(islands, component);
    if (!island) continue;
    const record = toSeriesRecord(island.props.donghua);
    if (record) return record;
  }
  return null;
}

function seriesRecordFromDom($: CheerioAPI, id: string): SeriesRecord | null {
  const ogTitle = $('meta[property="og:title"]')
    .attr("content")
    ?.replace(/\s*Sub Indo\s*-\s*YunshanID\s*$/i, "")
    .trim();
  const title = ogTitle || $("h1").first().text().replace(/\s+/g, " ").trim();
  if (!title) return null;
  return { id, title, poster: posterUrl($('meta[property="og:image"]').attr("content")) };
}

async function buildCatalog(): Promise<SeriesRecord[]> {
  return cached("catalog", TTL_DATA_MS, async () => {
    const [homeResult, daysResult, sitemapResult] = await Promise.allSettled([
      homeData(),
      scheduleHtml().then(scheduleDays),
      cached("page:sitemap", TTL_DATA_MS, () => fetchText(`${BASE}/sitemap.xml`, { referer: REFERER })),
    ]);
    const home: HomeData =
      homeResult.status === "fulfilled" ? homeResult.value : { hero: [], latest: [], movies: [] };
    const days = daysResult.status === "fulfilled" ? daysResult.value : [];
    const sitemap = sitemapResult.status === "fulfilled" ? sitemapResult.value : "";

    const ordered: SeriesRecord[] = [];
    const byId = new Map<string, SeriesRecord>();
    const add = (record: SeriesRecord) => {
      if (byId.has(record.id)) return;
      byId.set(record.id, record);
      ordered.push(record);
    };
    // Homepage "Update Terbaru" is the site's real recency order; everything
    // after it has no timestamp available upstream.
    home.latest.forEach(add);
    home.movies.forEach(add);
    for (const day of days) day.items.forEach(add);

    const missing = sitemapSeriesIds(sitemap)
      .filter((id) => !byId.has(id))
      .sort((a, b) => Number(a) - Number(b));
    if (missing.length <= MAX_HYDRATE) {
      const hydrated = await mapLimit(missing, HYDRATE_CONCURRENCY, async (id) => {
        try {
          const { $, islands } = parseIslands(await synopsisHtml(id));
          return seriesRecordFromIsland(islands) ?? seriesRecordFromDom($, id);
        } catch {
          return null;
        }
      });
      for (const record of hydrated) if (record) add(record);
    }
    return ordered;
  });
}

// ---------------------------------------------------------------------------
// Detail page
// ---------------------------------------------------------------------------

interface SeriesPage {
  record: SeriesRecord | null;
  episodes: number[];
  synopsis?: string;
  related: SeriesRecord[];
}

function episodesFromDom($: CheerioAPI, id: string): number[] {
  const numbers = new Set<number>();
  $(`a[href^="/episode/${id}/"]`).each((_, link) => {
    const href = $(link).attr("href") ?? "";
    const match = href.match(/\/episode\/(\d+)\/(\d+)/);
    if (!match || match[1] !== id) return;
    const number = Number(match[2]);
    if (Number.isFinite(number)) numbers.add(number);
  });
  return [...numbers].sort((a, b) => a - b);
}

function relatedRecords($: CheerioAPI, currentId: string): SeriesRecord[] {
  const related: SeriesRecord[] = [];
  const seen = new Set<string>([currentId]);
  $('a[href^="/synopsis/"]').each((_, link) => {
    const id = ($(link).attr("href") ?? "").match(/\/synopsis\/(\d+)/)?.[1];
    if (!id || seen.has(id)) return;
    const title = $(link).find("h4").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;
    seen.add(id);
    const badge = $(link).text().match(/Ep\s+(\d+)/i);
    related.push({
      id,
      title,
      poster: posterUrl($(link).find("img").attr("src")),
      latestEp: badge ? Number(badge[1]) : undefined,
    });
  });
  return related.slice(0, 12);
}

async function seriesPage(id: string): Promise<SeriesPage> {
  const { $, islands } = parseIslands(await synopsisHtml(id));
  const record = seriesRecordFromIsland(islands);
  if (!record && $("title").text().includes("Tidak Ditemukan")) {
    throw new Error(`yunshanid: series ${id} not found`);
  }
  const gridEpisodes = episodeNumbers(findIsland(islands, "EpisodeGrid")?.props.episodes);
  const synopsis =
    ($("#synopsis-full").first().text() || $("#synopsis-short").first().text())
      .replace(/\s+/g, " ")
      .trim() || undefined;
  return {
    record: record ?? seriesRecordFromDom($, id),
    // The rendered list is truncated to the newest chunk; the island holds all.
    episodes: gridEpisodes.length ? gridEpisodes : episodesFromDom($, id),
    synopsis,
    related: relatedRecords($, id),
  };
}

// ---------------------------------------------------------------------------
// Playback sources
// ---------------------------------------------------------------------------

interface ServerRecord {
  id?: string;
  name?: string;
  url: string;
}

interface Shape {
  label: string;
  kind: SourceKind;
  playable: boolean;
  verifyDailymotion?: boolean;
}

const SERVER_LABELS: Record<string, string> = {
  GDRIVE: "Google Drive",
  "GOOGLE DRIVE": "Google Drive",
  GD: "Google Drive",
  VKRU: "VK Video",
  VK: "VK Video",
  OKRU: "OK.ru",
  OK: "OK.ru",
  ABYSS: "Abyss",
  RUBY: "RUBY",
  DAILYMOTION: "Dailymotion",
  DEFAULT: "",
};

const FILE_HOSTS = [
  "download.openx.xyz",
  "pixeldrain.com",
  "mega.nz",
  "mega.io",
  "mediafire.com",
  "terabox.com",
  "4funbox.com",
  "1fichier.com",
  "krakenfiles.com",
  "gofile.io",
  "dropbox.com",
  "solidfiles.com",
];

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function shapeFor(url: string): Shape {
  let host = "";
  let path = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
    path = parsed.pathname;
  } catch {
    return { label: "Link", kind: "external", playable: false };
  }

  if (hostMatches(host, "drive.google.com")) {
    // /preview is the embed; /view is a download page and does not play in an iframe.
    return path.includes("/preview")
      ? { label: "Google Drive", kind: "iframe", playable: true }
      : { label: "Google Drive", kind: "external", playable: false };
  }
  if (hostMatches(host, "docs.google.com")) {
    return { label: "Google Drive", kind: "iframe", playable: true };
  }
  if (hostMatches(host, "dailymotion.com") || host === "dai.ly") {
    return { label: "Dailymotion", kind: "iframe", playable: true, verifyDailymotion: true };
  }
  if (hostMatches(host, "ok.ru") || hostMatches(host, "odnoklassniki.ru")) {
    return { label: "OK.ru", kind: "iframe", playable: true };
  }
  if (hostMatches(host, "vkvideo.ru") || hostMatches(host, "vk.com") || hostMatches(host, "vk.ru")) {
    return { label: "VK Video", kind: "iframe", playable: true };
  }
  if (hostMatches(host, "abyssplayer.com")) {
    return { label: "Abyss", kind: "iframe", playable: true };
  }
  if (hostMatches(host, "rubyvidhub.com")) {
    return { label: "RUBY", kind: "iframe", playable: true };
  }
  if (hostMatches(host, "youtube.com") || host === "youtu.be") {
    return { label: "YouTube", kind: "iframe", playable: true };
  }
  if (FILE_HOSTS.some((domain) => hostMatches(host, domain))) {
    return { label: host, kind: "external", playable: false };
  }
  return { label: host, kind: "iframe", playable: true };
}

function serverLabel(name: string | undefined): string | undefined {
  const value = name?.trim();
  if (!value) return undefined;
  const key = value.toUpperCase();
  if (key in SERVER_LABELS) return SERVER_LABELS[key] || undefined;
  return value;
}

function dailymotionId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const fromQuery = parsed.searchParams.get("video");
    if (fromQuery) return fromQuery;
    const match = parsed.pathname.match(/\/(?:embed\/)?video\/([A-Za-z0-9]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

interface DailymotionInfo {
  private?: boolean;
  status?: string;
  allow_embed?: boolean;
}

/** Confirms the embed is public; any verification failure keeps the upstream embed playable. */
async function dailymotionPlayable(url: string): Promise<boolean> {
  const videoId = dailymotionId(url);
  if (!videoId) return true;
  try {
    const info = await cached(`dm:${videoId}`, TTL_DATA_MS, () =>
      fetchJson<DailymotionInfo>(
        `https://api.dailymotion.com/video/${encodeURIComponent(videoId)}?fields=private,status,allow_embed`,
        { referer: REFERER, headers: { accept: "application/json" }, timeoutMs: 6000 },
      ),
    );
    if (info.private === true) return false;
    if (info.status !== undefined && info.status !== "published") return false;
    if (info.allow_embed === false) return false;
    return true;
  } catch {
    return true;
  }
}

async function buildSources(candidates: ServerRecord[]): Promise<VideoSource[]> {
  const unique: ServerRecord[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const url = absoluteUrl(candidate.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push({ ...candidate, url });
  }

  return mapLimit(unique, 3, async (candidate, index) => {
    const shape = shapeFor(candidate.url);
    const playable = shape.verifyDailymotion ? await dailymotionPlayable(candidate.url) : shape.playable;
    return {
      id: candidate.id ? `srv-${candidate.id}` : `src-${index + 1}`,
      label: serverLabel(candidate.name) ?? shape.label,
      kind: shape.kind,
      url: candidate.url,
      playable,
    };
  });
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

function seriesIdOf(slug: string): string {
  const match = slug.match(/\d+/);
  if (!match) throw new Error(`yunshanid: invalid series slug "${slug}"`);
  return match[0];
}

function episodeNumberOf(episode: string): number {
  const match = episode.match(/\d+/);
  const number = match ? Number(match[0]) : Number.NaN;
  if (!Number.isFinite(number)) throw new Error(`yunshanid: invalid episode "${episode}"`);
  return number;
}

async function home(): Promise<HomePayload> {
  const [homePage, days] = await Promise.all([
    homeData(),
    scheduleHtml()
      .then(scheduleDays)
      .catch(() => [] as ScheduleDay[]),
  ]);

  // Upstream's "Daftar Donghua" grid is the same 30 items in the same order as
  // "Update Terbaru", so it is intentionally not duplicated as a section.
  const sections: HomePayload["sections"] = [];
  if (homePage.latest.length) sections.push({ title: "Update Terbaru", items: homePage.latest.map(toCard) });
  if (homePage.movies.length) sections.push({ title: "Daftar Movie", items: homePage.movies.map(toCard) });
  // Seven per-day rows make the home screen noisy; merge into one deduped
  // "Jadwal Minggu Ini" rail (order preserved: Mon → Sun).
  const seenSchedule = new Set<string>();
  const scheduleItems: HomePayload["sections"][number]["items"] = [];
  for (const day of days) {
    for (const card of day.items.map(toCard)) {
      const key = card.slug || card.title;
      if (seenSchedule.has(key)) continue;
      seenSchedule.add(key);
      scheduleItems.push(card);
    }
  }
  if (scheduleItems.length) sections.push({ title: "Jadwal Minggu Ini", items: scheduleItems.slice(0, 24) });

  return {
    hero: (homePage.hero.length ? homePage.hero : homePage.latest.slice(0, 5)).map(toCard),
    sections,
  };
}

function orderRecords(records: SeriesRecord[], order: string | undefined): SeriesRecord[] {
  const key = (order ?? "").trim().toLowerCase();
  if (key === "title" || key === "a-z" || key === "az") {
    return [...records].sort((a, b) => a.title.localeCompare(b.title));
  }
  if (key === "episodes" || key === "episode" || key === "updated") {
    return [...records].sort(
      (a, b) => (b.latestEp ?? -1) - (a.latestEp ?? -1) || a.title.localeCompare(b.title),
    );
  }
  // "latest" (default) keeps the homepage update order first, then schedule order.
  return records;
}

async function list(params: {
  page: number;
  genre?: string;
  status?: string;
  order?: string;
}): Promise<ListPayload> {
  // Upstream exposes no genre/status facets (no category pages, no filter
  // endpoint), so `genre` and `status` are ignored rather than faked.
  const records = orderRecords(await buildCatalog(), params.order);
  const page = Math.max(1, Math.floor(Number.isFinite(params.page) ? params.page : 1));
  const start = (page - 1) * PAGE_SIZE;
  return {
    items: records.slice(start, start + PAGE_SIZE).map(toCard),
    page,
    hasNext: start + PAGE_SIZE < records.length,
    totalPages: Math.max(1, Math.ceil(records.length / PAGE_SIZE)),
  };
}

async function search(query: string): Promise<Card[]> {
  const q = query.trim();
  if (!q) return [];
  const hits = await fetchJson<unknown>(`${BASE}/ipa/search?q=${encodeURIComponent(q)}`, {
    referer: REFERER,
    headers: { accept: "application/json" },
  });
  const cards: Card[] = [];
  const seen = new Set<string>();
  for (const hit of asArray(hits)) {
    const record = toSeriesRecord(hit);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    cards.push(toCard(record));
  }
  // Upstream search caps at 12 hits and offers no paging or cursor.
  return cards;
}

async function detail(slug: string): Promise<DetailPayload> {
  const id = seriesIdOf(slug);
  const page = await seriesPage(id);
  if (!page.record) throw new Error(`yunshanid: series ${id} not found`);
  return {
    anime: toAnime(page.record, page.synopsis),
    episodes: page.episodes.map(toEpisode),
    related: page.related.map(toCard),
  };
}

async function watch(slug: string, episode: string): Promise<WatchPayload> {
  const id = seriesIdOf(slug);
  const number = episodeNumberOf(episode);

  // The synopsis page is the authoritative episode list for prev/next; a watch
  // must still succeed if it is unavailable, so its failure is tolerated.
  const [html, page] = await Promise.all([
    cached(`page:episode:${id}:${number}`, TTL_DATA_MS, () =>
      fetchText(`${BASE}/episode/${id}/${number}`, { referer: `${BASE}/synopsis/${id}` }),
    ),
    seriesPage(id).catch(() => null),
  ]);

  const { $, islands } = parseIslands(html);
  const watchIsland = findIsland(islands, "WatchClient")?.props;
  const record = (watchIsland ? toSeriesRecord(watchIsland.donghua) : null) ?? page?.record ?? null;
  if (!record) throw new Error(`yunshanid: no metadata for ${id}/${number}`);

  const servers: ServerRecord[] = [];
  for (const raw of asArray(watchIsland?.servers)) {
    const server = asRecord(raw);
    const url = asString(server.embed_url)?.trim();
    if (!url) continue;
    servers.push({ id: asString(server.id)?.trim(), name: asString(server.name), url });
  }
  // Episodes without a WatchClient island ("Video tidak tersedia") can still
  // carry a plain <iframe>; pick those up too (dedupe happens in buildSources).
  $("iframe").each((_, frame) => {
    const src = $(frame).attr("src")?.trim();
    if (src) servers.push({ url: src });
  });

  const episodes = page?.episodes.length ? page.episodes : episodeNumbers(watchIsland?.allEpisodes);
  const prevNumber = [...episodes].reverse().find((candidate) => candidate < number);
  const nextNumber = episodes.find((candidate) => candidate > number);

  const payload: WatchPayload = {
    anime: toAnime(record, page?.synopsis),
    episode: toEpisode(number),
    sources: await buildSources(servers),
    subtitles: [],
  };
  if (prevNumber !== undefined) payload.prev = toEpisode(prevNumber);
  if (nextNumber !== undefined) payload.next = toEpisode(nextNumber);
  return payload;
}

export const yunshanid: SourceAdapter = {
  id: "yunshanid",
  name: "YunshanID",
  baseUrl: BASE,
  lang: "id",
  home,
  list,
  search,
  detail,
  watch,
};
