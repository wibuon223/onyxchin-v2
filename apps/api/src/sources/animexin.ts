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
import { absolute, fetchText } from "../lib/http.js";

const BASE = "https://animexin.dev";
const REFERER = `${BASE}/`;

/** Episode posts are single posts: `<series>-episode-<n>-subbed|subtitle|subtitle-indonesia|...`. */
const EPISODE_SLUG = /-episode-\d+/i;

/** `/anime/?order=` values the animestream theme actually honours (verified live). */
const SERIES_ORDER: Record<string, true> = {
  update: true,
  popular: true,
  rating: true,
  latest: true,
  title: true,
};

/** Single-segment paths that are site pages, not series posts. */
const RESERVED: Record<string, true> = {
  anime: true,
  author: true,
  blog: true,
  "bookmark-2": true,
  completed: true,
  contact: true,
  country: true,
  dmca: true,
  genre: true,
  genres: true,
  "help-information": true,
  hiatus: true,
  "how-to-download": true,
  manga: true,
  network: true,
  ongoing: true,
  page: true,
  "privacy-policy": true,
  "release-date": true,
  schedule: true,
  series: true,
  studio: true,
  tag: true,
  tvshows: true,
  upcoming: true,
  "wp-content": true,
  "wp-json": true,
};

const PUBLIC_IMG = [/(^|\.)wsrv\.nl$/i, /(^|\.)i\.ibb\.co(\.com)?$/i, /(^|\.)iili\.io$/i, /(^|\.)i\.postimg\.cc$/i];

const clean = (s?: string | null): string => (s ?? "").replace(/\s+/g, " ").trim();

function toInt(v?: string | null): number | null {
  const m = /(\d+)/.exec(v ?? "");
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function isoDate(raw?: string | null): string | undefined {
  const text = clean(raw);
  if (!text) return undefined;
  const t = Date.parse(text);
  return Number.isNaN(t) ? text : new Date(t).toISOString().slice(0, 10);
}

/** Absolute upstream URL -> `/api/img` proxy, except hosts that already allow hotlinking. */
function poster(src?: string | null): string | null {
  const url = absolute(BASE, src ?? null);
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    if (PUBLIC_IMG.some((re) => re.test(host))) return url;
  } catch {
    return null;
  }
  return `/api/img?url=${encodeURIComponent(url)}`;
}

function slugOf(href?: string | null): string | null {
  const url = absolute(BASE, href ?? null);
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "animexin.dev" && !parsed.hostname.endsWith(".animexin.dev")) return null;
  const seg = parsed.pathname.replace(/^\/+|\/+$/g, "");
  if (!seg || seg.includes("/") || seg.includes(".")) return null;
  if (RESERVED[seg.toLowerCase()] === true) return null;
  return seg;
}

function normalizeSlug(input: string): string {
  const raw = input.trim();
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).pathname.replace(/^\/+|\/+$/g, "");
    } catch {
      return raw;
    }
  }
  return raw.replace(/^\/+|\/+$/g, "").split(/[?#]/)[0] ?? raw;
}

function cardList($: CheerioAPI, selector: string): Card[] {
  const cards: Card[] = [];
  const seen = new Set<string>();
  $(selector).each((_, el) => {
    const $el = $(el);
    const anchor = $el.find(".bsx > a").first();
    const slug = slugOf(anchor.attr("href"));
    if (!slug || seen.has(slug)) return;
    const title = clean($el.find(".tt h2").first().text()) || clean(anchor.attr("title"));
    if (!title) return;
    seen.add(slug);
    const type = clean($el.find(".typez").first().text());
    const epx = clean($el.find(".epx").first().text());
    cards.push({
      id: slug,
      slug,
      title,
      poster: poster($el.find("img").first().attr("src")),
      type: type || undefined,
      status:
        clean($el.find(".status").first().text()) ||
        (/^(ongoing|completed|upcoming|hiatus)$/i.test(epx)
          ? epx.charAt(0).toUpperCase() + epx.slice(1).toLowerCase()
          : undefined),
    });
  });
  return cards;
}

function speMap($: CheerioAPI): Map<string, string> {
  const map = new Map<string, string>();
  $(".animefull .spe span, .spe span").each((_, el) => {
    const text = clean($(el).text());
    const sep = text.indexOf(":");
    if (sep <= 0) return;
    const key = text.slice(0, sep).trim().toLowerCase();
    const value = text.slice(sep + 1).trim();
    if (key && value && !map.has(key)) map.set(key, value);
  });
  return map;
}

function parseEpisodes($: CheerioAPI): Episode[] {
  const out: Episode[] = [];
  const seen = new Set<number>();
  $(".eplister ul li").each((_, li) => {
    const $li = $(li);
    const slug = slugOf($li.find("a").first().attr("href"));
    if (!slug) return;
    const number =
      toInt($li.find(".epl-num").first().text()) ?? toInt(/episode-(\d+)/i.exec(slug)?.[1] ?? null);
    if (number === null || seen.has(number)) return;
    seen.add(number);
    out.push({
      number,
      slug,
      title: clean($li.find(".epl-title").first().text()) || undefined,
      releasedAt: isoDate($li.find(".epl-date").first().text()),
    });
  });
  out.sort((a, b) => a.number - b.number);
  return out;
}

function seriesSlugFromEpisodePage($: CheerioAPI): string | null {
  const found: string[] = [];
  $(".ts-breadcrumb a").each((_, a) => {
    const slug = slugOf($(a).attr("href"));
    if (slug && !EPISODE_SLUG.test(slug)) found.push(slug);
  });
  $("span.year a").each((_, a) => {
    const slug = slugOf($(a).attr("href"));
    if (slug && !EPISODE_SLUG.test(slug)) found.push(slug);
  });
  return found[0] ?? null;
}

interface SeriesContent {
  anime: Anime;
  episodes: Episode[];
  related: Card[];
}

interface SeriesPage extends SeriesContent {
  slug: string;
}

function parseSeries($: CheerioAPI, slug: string): SeriesContent {
  const spe = speMap($);
  const episodes = parseEpisodes($);
  const alt = clean($(".infox .alter").first().text());
  const genres = $(".genxed a")
    .map((_, a) => clean($(a).text()))
    .get()
    .filter(Boolean);
  const ratingRaw =
    $('meta[itemprop="ratingValue"]').attr("content") ?? clean($(".rating strong").text()).replace(/[^\d.]/g, "");
  const rating = Number.parseFloat(ratingRaw);
  const synopsis =
    clean($('.entry-content[itemprop="description"]').first().text()) || clean($(".desc").first().text());
  const releasedYear = /(\d{4})/.exec(spe.get("released") ?? "")?.[1];

  const anime: Anime = {
    id: slug,
    slug,
    title: clean($(".infox h1").first().text()) || clean($("h1.entry-title").first().text()),
    altTitles: alt ? [alt] : undefined,
    synopsis: synopsis || undefined,
    poster: poster($(".thumbook .thumb img").first().attr("src") ?? $(".bigcover img").first().attr("src")),
    banner: null,
    type: spe.get("type"),
    status: spe.get("status"),
    year: releasedYear ? Number.parseInt(releasedYear, 10) : undefined,
    rating: Number.isFinite(rating) ? rating : undefined,
    genres: genres.length ? genres : undefined,
    studio: spe.get("studio") ?? spe.get("network"),
    totalEpisodes: toInt(spe.get("episodes")) ?? (episodes.length || undefined),
    sourceId: "animexin",
  };

  return {
    anime,
    episodes,
    related: cardList($, ".listupd article.bs").filter((c) => c.slug !== slug),
  };
}

async function loadSeries(input: string): Promise<SeriesPage> {
  const requested = normalizeSlug(input);
  if (!requested) throw new Error("animexin: empty slug");
  let $ = load(await fetchText(`${BASE}/${requested}/`, { referer: REFERER }));
  let slug = requested;
  if (EPISODE_SLUG.test(requested)) {
    const parent = seriesSlugFromEpisodePage($);
    if (!parent) throw new Error(`animexin: cannot resolve series for episode ${requested}`);
    slug = parent;
    $ = load(await fetchText(`${BASE}/${slug}/`, { referer: REFERER }));
  }
  return { slug, ...parseSeries($, slug) };
}

interface HostRule {
  test: RegExp;
  name: string;
  kind: SourceKind;
  playable: boolean;
  note?: string;
}

const HOST_RULES: HostRule[] = [
  {
    test: /(^|\.)dood\.(to|so|watch|li|pm|sh|ws)$|(^|\.)playmogo\.com$|doodstream|doodapi/i,
    name: "DoodStream",
    kind: "iframe",
    playable: false,
    note: "sering mati di IP server",
  },
  {
    test: /(^|\.)dailymotion\.com$/i,
    name: "Dailymotion",
    kind: "iframe",
    playable: false,
    note: "domain-locked",
  },
  { test: /(^|\.)mega\.(nz|co\.nz)$/i, name: "MEGA", kind: "external", playable: false },
  { test: /(^|\.)gdriveplayer\.to$/i, name: "GDrivePlayer", kind: "iframe", playable: true },
  { test: /(^|\.)drive\.google\.com$/i, name: "Google Drive", kind: "iframe", playable: true },
  { test: /(^|\.)ok\.ru$/i, name: "OK.ru", kind: "iframe", playable: true },
  { test: /(^|\.)rumble\.com$/i, name: "Rumble", kind: "iframe", playable: true },
  { test: /(^|\.)odysee\.com$/i, name: "Odysee", kind: "iframe", playable: true },
  { test: /(^|\.)d\.tube$/i, name: "DTube", kind: "iframe", playable: true },
  { test: /(^|\.)seekplayer\.vip$/i, name: "SeekPlayer", kind: "iframe", playable: true },
];

const LANG_WORDS: [RegExp, string][] = [
  [/\bindonesia\b/i, "id"],
  [/\benglish\b/i, "en"],
  [/\bportuguese\b/i, "pt"],
  [/\bturkish\b/i, "tr"],
  [/\bspanish\b/i, "es"],
  [/\bitalian\b/i, "it"],
  [/\bpolish\b/i, "pl"],
  [/\barabic\b/i, "ar"],
  [/\bthai\b/i, "th"],
  [/\bgerman\b/i, "de"],
  [/\bbangla\b/i, "bn"],
];

function classify(url: URL): { name: string; kind: SourceKind; playable: boolean; note?: string } {
  const host = url.hostname.toLowerCase();
  for (const rule of HOST_RULES) {
    if (rule.test.test(host)) {
      return { name: rule.name, kind: rule.kind, playable: rule.playable, note: rule.note };
    }
  }
  if (/\.m3u8$/i.test(url.pathname)) return { name: host, kind: "hls", playable: true };
  if (/\.mp4$/i.test(url.pathname)) return { name: host, kind: "direct", playable: true };
  return { name: host.replace(/^www\./, ""), kind: "iframe", playable: true };
}

/** Mirror options hold base64-encoded iframe snippets; a few pages use raw URLs. */
function decodeMirror(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^(https?:)?\/\//i.test(value)) return value;
  const html = Buffer.from(value, "base64").toString("utf8");
  const src = /<(?:iframe|embed|video|source)\b[^>]*\bsrc=["']([^"']+)["']/i.exec(html)?.[1];
  return src ? src.trim() : null;
}

function mirrorSources($: CheerioAPI, episodeUrl: string): VideoSource[] {
  const rows: { src: string; label: string }[] = [];
  const fallback = $(".player-embed iframe").first().attr("src") ?? $(".video-content iframe").first().attr("src");
  if (fallback) rows.push({ src: fallback, label: "" });
  $("select.mirror option").each((_, option) => {
    const src = decodeMirror($(option).attr("value") ?? "");
    if (src) rows.push({ src, label: clean($(option).text()) });
  });

  const out: VideoSource[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const upstream = absolute(BASE, row.src);
    if (!upstream || seen.has(upstream)) continue;
    let url: URL;
    try {
      url = new URL(upstream);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    seen.add(upstream);
    const info = classify(url);
    const hostId = url.hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");
    let playUrl = upstream;
    if (info.kind === "direct") {
      playUrl = `/api/media?u=${encodeURIComponent(upstream)}&ref=${encodeURIComponent(episodeUrl)}`;
    } else if (info.kind === "hls") {
      playUrl = `/api/hls?u=${encodeURIComponent(upstream)}`;
    }
    out.push({
      id: `${hostId}-${out.length + 1}`,
      label: row.label ? `${info.name} · ${row.label}` : info.name,
      kind: info.kind,
      url: playUrl,
      lang: LANG_WORDS.find(([re]) => re.test(row.label))?.[1],
      note: info.note,
      playable: info.playable,
    });
  }
  return out;
}

function parseEpisode($: CheerioAPI, fallback: Episode): Episode {
  const title =
    clean($(".title-section h1").first().text()) ||
    clean($("h1.entry-title").first().text()) ||
    fallback.title ||
    "";
  return {
    number: toInt($('meta[itemprop="episodeNumber"]').attr("content")) ?? fallback.number,
    slug: fallback.slug,
    title: title || undefined,
    releasedAt: isoDate($("span.year .updated").first().text()) ?? fallback.releasedAt,
  };
}

function episodeFromHref(href: string | undefined, episodes: Episode[]): Episode | undefined {
  const slug = slugOf(href);
  if (slug) {
    const hit = episodes.find((e) => e.slug === slug);
    if (hit) return hit;
  }
  const number = toInt(/episode-(\d+)/i.exec(href ?? "")?.[1] ?? null);
  if (number !== null) return episodes.find((e) => e.number === number);
  return undefined;
}

function listUrl(page: number, genre?: string, status?: string, order?: string): string {
  const qs = new URLSearchParams();
  if (page > 1) qs.set("page", String(page));
  if (genre) qs.append("genre[]", genre);
  if (status) qs.set("status", status);
  if (order && SERIES_ORDER[order] === true) qs.set("order", order);
  const query = qs.toString();
  return `${BASE}/anime/${query ? `?${query}` : ""}`;
}

async function fetchSeriesPage(url: string): Promise<{ items: Card[]; hasNext: boolean }> {
  const $ = load(await fetchText(url, { referer: REFERER }));
  return { items: cardList($, ".listupd article.bs"), hasNext: $(".hpage a.r").length > 0 };
}

export const animexin: SourceAdapter = {
  id: "animexin",
  name: "AnimeXin",
  baseUrl: BASE,
  lang: "id",

  async home(): Promise<HomePayload> {
    const [latest, popular, action, martial] = await Promise.allSettled([
      fetchSeriesPage(listUrl(1, undefined, undefined, "update")),
      fetchSeriesPage(listUrl(1, undefined, undefined, "popular")),
      fetchSeriesPage(listUrl(1, "action")),
      fetchSeriesPage(listUrl(1, "martial-arts")),
    ]);
    const take = (r: PromiseSettledResult<{ items: Card[] }>): Card[] => (r.status === "fulfilled" ? r.value.items : []);

    const latestItems = take(latest);
    const popularItems = take(popular);
    const actionItems = take(action);
    const martialItems = take(martial);

    const hero = (latestItems.length ? latestItems : popularItems).slice(0, 6);
    const sections: HomePayload["sections"] = [];
    if (latestItems.length) {
      sections.push({ title: "Baru Rilis", items: latestItems, href: `${BASE}/anime/?order=update` });
    }
    if (popularItems.length) {
      sections.push({ title: "Populer", items: popularItems, href: `${BASE}/anime/?order=popular` });
    }
    if (actionItems.length) {
      sections.push({ title: "Action", items: actionItems, href: `${BASE}/anime/?genre%5B%5D=action` });
    }
    if (martialItems.length) {
      sections.push({
        title: "Martial Arts",
        items: martialItems,
        href: `${BASE}/anime/?genre%5B%5D=martial-arts`,
      });
    }
    return { hero, sections };
  },

  async list(params): Promise<ListPayload> {
    const page = Number.isFinite(params.page) && params.page > 0 ? Math.floor(params.page) : 1;
    const { items, hasNext } = await fetchSeriesPage(
      listUrl(page, params.genre?.trim(), params.status?.trim(), params.order?.trim()),
    );
    return { items, page, hasNext };
  },

  async search(query: string): Promise<Card[]> {
    const term = query.trim();
    if (!term) return [];
    const $ = load(await fetchText(`${BASE}/?s=${encodeURIComponent(term)}`, { referer: REFERER }));
    return cardList($, ".listupd article.bs");
  },

  async detail(slug: string): Promise<DetailPayload> {
    const series = await loadSeries(slug);
    return { anime: series.anime, episodes: series.episodes, related: series.related };
  },

  async watch(slug: string, episode: string): Promise<WatchPayload> {
    const series = await loadSeries(slug);
    const wanted = normalizeSlug(episode);
    let target: Episode | undefined;
    if (/^\d+$/.test(wanted)) {
      const number = Number.parseInt(wanted, 10);
      target = series.episodes.find((e) => e.number === number);
    } else {
      target = series.episodes.find((e) => e.slug === wanted);
    }
    if (!target) {
      if (/^\d+$/.test(wanted)) {
        throw new Error(`animexin: episode ${wanted} not found for ${series.slug}`);
      }
      const number = toInt(/episode-(\d+)/i.exec(wanted)?.[1] ?? null);
      if (number === null) throw new Error(`animexin: cannot resolve episode "${episode}" for ${series.slug}`);
      target = { number, slug: wanted };
    }

    const episodeUrl = `${BASE}/${target.slug}/`;
    const $ = load(await fetchText(episodeUrl, { referer: `${BASE}/${series.slug}/` }));
    if (!$("select.mirror, .player-embed iframe").length) {
      throw new Error(`animexin: no player markup on ${episodeUrl}`);
    }

    return {
      anime: series.anime,
      episode: parseEpisode($, target),
      sources: mirrorSources($, episodeUrl),
      subtitles: [],
      prev: episodeFromHref($('.naveps a[rel="prev"]').attr("href"), series.episodes),
      next: episodeFromHref($('.naveps a[rel="next"]').attr("href"), series.episodes),
    };
  },
};
