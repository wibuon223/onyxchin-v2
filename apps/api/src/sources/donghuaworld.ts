import { upgradeDailymotionSources } from "../lib/dailymotion.js";
import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type {
  Anime,
  Card,
  DetailPayload,
  Episode,
  HomePayload,
  ListPayload,
  SourceAdapter,
  VideoSource,
  WatchPayload,
} from "@onyxchin/shared";
import { absolute, fetchText } from "../lib/http.js";

const BASE = "https://donghuaworld.com";
const PLAYBACK_NOTE = "dark server";
/** The site's own player host only serves a JW shell with an empty playlist (needs VPN). */
const DARK_HOST = /(^|\.)donghuaworld\.in$/i;
const STATUS_WORDS: Record<string, true> = {
  ongoing: true,
  completed: true,
  upcoming: true,
  hiatus: true,
};
const ORDER_WORDS: Record<string, true> = {
  latest: true,
  update: true,
  popular: true,
  rating: true,
  title: true,
  titlereverse: true,
};
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

interface EpEntry {
  episode: Episode;
  /** Last episode number covered by this post (multi-episode batches like "478-479"). */
  end: number;
}

interface SeriesData {
  anime: Anime;
  episodes: EpEntry[];
  related: Card[];
}

interface Embed {
  label: string;
  url: string;
}

const tidy = (value?: string | null): string => (value ?? "").replace(/\s+/g, " ").trim();

function proxied(raw?: string | null): string | null {
  if (!raw) return null;
  const abs = absolute(BASE, raw);
  if (!abs || !/^https?:/i.test(abs) || abs.includes("lazy_placeholder")) return null;
  return `/api/img?url=${encodeURIComponent(abs)}`;
}

function lastSegment(href?: string | null): string | null {
  const abs = absolute(BASE, href);
  if (!abs) return null;
  const parts = new URL(abs).pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

function isoDate(text: string): string | undefined {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(text);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return undefined;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function uniqueText($: CheerioAPI, selector: string, scope?: Cheerio<Element>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  (scope ? scope.find(selector) : $(selector)).each((_, el) => {
    const text = tidy($(el).text());
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

function cardFrom($: CheerioAPI, scope: Cheerio<Element>): Card | null {
  const anchor = scope.find("a.tip").first().length
    ? scope.find("a.tip").first()
    : scope.find("a.series").first();
  const slug = lastSegment(anchor.attr("href"));
  if (!slug) return null;

  const title =
    tidy(scope.find(".eggtitle").first().text()) ||
    tidy(scope.find(".tt h2").first().text()) ||
    tidy(scope.find("h4 a").first().text()) ||
    tidy(anchor.attr("title"));
  if (!title) return null;

  const lazy = scope.find("noscript").first().text();
  const lazySrc = /src="([^"]+)"/.exec(lazy);
  const rawPoster =
    scope.find("img[data-src]").first().attr("data-src") ??
    scope.find("img[data-lazy-src]").first().attr("data-lazy-src") ??
    scope
      .find("img")
      .filter((_, img) => !/^data:/i.test($(img).attr("src") ?? ""))
      .first()
      .attr("src") ??
    (lazySrc ? lazySrc[1] : null);

  const statusClass = scope.find(".status").first().attr("class") ?? "";
  const statusFromClass = statusClass.split(/\s+/).find((token) => STATUS_WORDS[token.toLowerCase()]);
  const epx = tidy(scope.find(".epx").first().text());
  const status = statusFromClass ?? (STATUS_WORDS[epx.toLowerCase()] ? epx : undefined);

  const ratingText = tidy(scope.find(".numscore").first().text());
  const rating = Number(ratingText);
  const genres = uniqueText($, "a[href*='/genres/']", scope);

  return {
    id: slug,
    slug,
    title,
    poster: proxied(rawPoster),
    type: tidy(scope.find(".typez, .eggtype").first().text()) || undefined,
    status,
    rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
    genres: genres.length ? genres : undefined,
  };
}

function parseCards($: CheerioAPI, nodes: Cheerio<Element>): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  nodes.each((_, el) => {
    const card = cardFrom($, $(el));
    if (!card || seen.has(card.slug)) return;
    seen.add(card.slug);
    out.push(card);
  });
  return out;
}

async function getDoc(url: string): Promise<CheerioAPI> {
  const html = await fetchText(url, { referer: `${BASE}/`, timeoutMs: 25000 });
  return load(html);
}

function pageUrl(input: string): string {
  const raw = input.trim();
  if (/^https?:/i.test(raw)) return raw;
  const path = raw.replace(/^\/+|\/+$/g, "");
  const route = path.startsWith("anime/") || path.includes("-episode-") ? path : `anime/${path}`;
  return `${BASE}/${route}/`;
}

function parseEpisodes($: CheerioAPI): EpEntry[] {
  const out: EpEntry[] = [];
  const seen = new Set<string>();
  $(".eplister li a[href]").each((_, el) => {
    const anchor = $(el);
    const slug = lastSegment(anchor.attr("href"));
    if (!slug || seen.has(slug)) return;
    const label = tidy(anchor.find(".epl-num").text()) || tidy(anchor.closest("li").find(".epl-num").text());
    const range = /^(\d+)(?:\s*[-–]\s*(\d+))?/.exec(label);
    if (!range) return;
    const number = Number(range[1]);
    seen.add(slug);
    out.push({
      episode: {
        number,
        slug,
        title: tidy(anchor.find(".epl-title").text()) || undefined,
        releasedAt: isoDate(tidy(anchor.find(".epl-date").text())),
      },
      end: range[2] ? Number(range[2]) : number,
    });
  });
  return out.sort((a, b) => a.episode.number - b.episode.number);
}

function infoMap($: CheerioAPI): Record<string, string> {
  const info: Record<string, string> = {};
  $(".spe span").each((_, el) => {
    const span = $(el);
    const label = tidy(span.find("b").first().text()).replace(/:\s*$/, "").toLowerCase();
    if (!label || info[label]) return;
    const value = tidy(span.text().replace(span.find("b").first().text(), ""));
    if (value) info[label] = value;
  });
  return info;
}

function synopsisOf($: CheerioAPI): string | undefined {
  const paragraph = $(".synp .entry-content p").first();
  if (paragraph.length) {
    const clone = paragraph.clone();
    clone.children("a").first().remove();
    clone.children("strong").first().remove();
    const text = tidy(clone.text());
    if (text) return text;
  }
  return tidy($(".mindesc").first().text()) || undefined;
}

function parseAnime($: CheerioAPI, slug: string): Anime {
  const info = infoMap($);
  const title = tidy($("h1.entry-title").first().text()) || tidy($("h1").first().text());
  const altTitles = tidy($(".alter").first().text())
    .split(",")
    .map((name) => tidy(name))
    .filter((name) => name && name.toLowerCase() !== title.toLowerCase());
  const poster = proxied($(".thumb img").first().attr("src") ?? $(".thumb img").first().attr("data-src"));
  const banner = proxied($(".bigcover img").first().attr("src")) ?? poster;
  const released = info["released"] ?? "";
  const yearMatch = /(\d{4})/.exec(released);
  const ratingMeta = Number($('meta[itemprop="ratingValue"]').first().attr("content"));
  const ratingFallback = Number(tidy($(".numscore").first().text()));
  const rating = Number.isFinite(ratingMeta) && ratingMeta > 0 ? ratingMeta : ratingFallback;

  return {
    id: slug,
    slug,
    title,
    altTitles: altTitles.length ? altTitles : undefined,
    synopsis: synopsisOf($),
    poster,
    banner,
    type: info["type"] || undefined,
    status: info["status"] || undefined,
    year: yearMatch ? Number(yearMatch[1]) : undefined,
    rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
    genres: uniqueText($, "a[href*='/genres/']", $(".genxed").first()),
    studio: info["studio"] || info["network"] || undefined,
    sourceId: "donghuaworld",
  };
}

async function loadSeries(input: string): Promise<SeriesData> {
  let url = pageUrl(input);
  let $ = await getDoc(url);

  if ($(".player-embed").length > 0 || $(".naveps").length > 0) {
    const seriesHref = $(".ts-breadcrumb a[href*='/anime/']").first().attr("href");
    if (!seriesHref) throw new Error(`donghuaworld: not a series page: ${input}`);
    url = absolute(BASE, seriesHref) ?? seriesHref;
    $ = await getDoc(url);
  }

  const slug = lastSegment(url) ?? input.trim().replace(/^\/+|\/+$/g, "");
  const anime = parseAnime($, slug);
  const entries = parseEpisodes($);
  if (entries.length) {
    anime.totalEpisodes = Math.max(...entries.map((entry) => entry.end));
  }

  const relatedBox = $(".bixbox")
    .filter((_, box) => /Recommended Series/i.test(tidy($(box).find("h3").first().text())))
    .first();

  return {
    anime,
    episodes: entries,
    related: relatedBox.length ? parseCards($, relatedBox.find("article")) : [],
  };
}

function decodeHash(hash?: string): string | null {
  if (!hash) return null;
  const decoded = Buffer.from(hash, "base64").toString("utf8");
  return /<iframe|<a\s|<script/i.test(decoded) ? decoded : null;
}

async function fetchEmbeds(episodePageUrl: string): Promise<Embed[]> {
  const $ = await getDoc(episodePageUrl);
  const out: Embed[] = [];
  const add = (label: string, raw?: string | null): void => {
    const abs = absolute(BASE, raw ?? "");
    if (!abs || !/^https?:/i.test(abs) || out.some((entry) => entry.url === abs)) return;
    out.push({ label: tidy(label) || new URL(abs).hostname, url: abs });
  };

  $(".server-item a").each((_, el) => {
    const anchor = $(el);
    const decoded = decodeHash(anchor.attr("data-hash"));
    const inner = decoded ? load(decoded) : null;
    add(anchor.text(), inner ? inner("iframe").attr("src") ?? inner("a[href]").attr("href") : null);
  });

  $(".player-embed iframe, #pembed iframe").each((_, el) => {
    add("", $(el).attr("src"));
  });

  return out;
}

function buildSources(embeds: Embed[], episodePageUrl: string): VideoSource[] {
  const sources: VideoSource[] = [];
  embeds.forEach((embed, index) => {
    const dark = DARK_HOST.test(new URL(embed.url).hostname);
    const note = dark ? `${PLAYBACK_NOTE} — butuh VPN` : undefined;
    sources.push({
      id: `embed-${index + 1}`,
      label: embed.label,
      kind: "iframe",
      url: embed.url,
      note,
      playable: !dark,
    });
    if (dark) {
      sources.push({
        id: `tab-${index + 1}`,
        label: `${embed.label} · buka tab baru`,
        kind: "external",
        url: embed.url,
        note,
        playable: false,
      });
    }
  });

  if (!sources.length) {
    sources.push({
      id: "episode-page",
      label: "Episode page",
      kind: "external",
      url: episodePageUrl,
      note: `${PLAYBACK_NOTE} — player tidak ditemukan`,
      playable: false,
    });
  }

  return sources.sort((a, b) => Number(b.playable) - Number(a.playable));
}

function resolveEpisode(entries: EpEntry[], raw: string): EpEntry | null {
  const value = raw.trim();
  if (!value) return null;

  const slug = lastSegment(value) ?? value;
  const exact = entries.find((entry) => entry.episode.slug === slug);
  if (exact) return exact;

  const numbered = /^(?:ep[-_ ]?)?(\d+)/i.exec(value);
  if (numbered) {
    const number = Number(numbered[1]);
    return entries.find((entry) => number >= entry.episode.number && number <= entry.end) ?? null;
  }
  return null;
}

function genreSlug(raw?: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const fromUrl = /\/genres\/([^/?#]+)/.exec(value);
  const slug = (fromUrl ? fromUrl[1] : value)
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return slug || null;
}

/** Genre listings live on /genres/<slug>/page/N/; ?genre[]= is ignored upstream. */
function genrePageUrl(slug: string, page: number): string {
  return page > 1 ? `${BASE}/genres/${slug}/page/${page}/` : `${BASE}/genres/${slug}/`;
}

function mergeUnique(first: Card[], second: Card[]): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const card of [...first, ...second]) {
    if (seen.has(card.slug)) continue;
    seen.add(card.slug);
    out.push(card);
  }
  return out;
}
export const donghuaworld: SourceAdapter = {
  id: "donghuaworld",
  name: "Donghua World",
  baseUrl: BASE,
  lang: "id",


  async home(): Promise<HomePayload> {
    const [homePage, action, fantasy, adventure, martial] = await Promise.allSettled([
      getDoc(`${BASE}/`),
      getDoc(genrePageUrl("action", 1)),
      getDoc(genrePageUrl("fantasy", 1)),
      getDoc(genrePageUrl("adventure", 1)),
      getDoc(genrePageUrl("martial-arts", 1)),
    ]);

    const $ = homePage.status === "fulfilled" ? homePage.value : null;
    const latest = $ ? parseCards($, $(".listupd.normal article")).slice(0, 20) : [];
    const hero = $ ? parseCards($, $(".popconslide article, .listupd.normal article")).slice(0, 6) : [];
    const popular = $ ? mergeUnique(parseCards($, $(".wpop-weekly li")), parseCards($, $(".wpop-alltime li"))) : [];

    const genreRow = (r: PromiseSettledResult<CheerioAPI>): Card[] =>
      r.status === "fulfilled" ? parseCards(r.value, r.value(".listupd .bsx")).slice(0, 20) : [];

    const rows: [string, Card[]][] = [
      ["Terbaru", latest],
      ["Populer", popular.slice(0, 20)],
      ["Action", genreRow(action)],
      ["Fantasy", genreRow(fantasy)],
      ["Adventure", genreRow(adventure)],
      ["Martial Arts", genreRow(martial)],
    ];
    const sections: HomePayload["sections"] = rows
      .filter(([, items]) => items.length > 0)
      .map(([title, items]) => ({
        title,
        items,
        href: `/api/donghuaworld/list?page=1&genre=${encodeURIComponent(title)}`,
      }));

    return { hero, sections };
  },

  async list(params): Promise<ListPayload> {
    const page = Number.isFinite(params.page) && params.page > 0 ? Math.floor(params.page) : 1;
    const genre = genreSlug(params.genre);
    if (genre) {
      const $g = await getDoc(genrePageUrl(genre, page));
      const items = parseCards($g, $g(".listupd .bsx"));
      return { items, page, hasNext: items.length > 0 && $g(".hpage a.r").length > 0 };
    }
    const query = new URLSearchParams({ page: String(page) });

    const status = (params.status ?? "").toLowerCase();
    if (STATUS_WORDS[status]) query.set("status", status);

    const order = (params.order ?? "").toLowerCase();
    if (ORDER_WORDS[order]) query.set("order", order);

    const $ = await getDoc(`${BASE}/anime/?${query.toString()}`);
    const items = parseCards($, $(".listupd .bsx"));

    return { items, page, hasNext: items.length > 0 && $(".hpage a.r").length > 0 };
  },

  async search(query: string): Promise<Card[]> {
    const term = query.trim();
    if (!term) return [];
    const $ = await getDoc(`${BASE}/?s=${encodeURIComponent(term)}`);
    return parseCards($, $(".listupd .bsx"));
  },

  async detail(slug: string): Promise<DetailPayload> {
    const series = await loadSeries(slug);
    return {
      anime: series.anime,
      episodes: series.episodes.map((entry) => entry.episode),
      related: series.related,
    };
  },

  async watch(slug, episode): Promise<WatchPayload> {
    const series = await loadSeries(slug);
    const target = resolveEpisode(series.episodes, episode) ?? resolveEpisode(series.episodes, slug);
    if (!target) throw new Error(`donghuaworld: episode not found: ${slug}/${episode}`);

    const episodePageUrl = `${BASE}/${target.episode.slug}/`;
    const embeds = await fetchEmbeds(episodePageUrl).catch((): Embed[] => []);

    const episodes = series.episodes.map((entry) => entry.episode);
    const index = series.episodes.findIndex((entry) => entry.episode.slug === target.episode.slug);

    return {
      anime: series.anime,
      episode: episodes[index],
      sources: await upgradeDailymotionSources(buildSources(embeds, episodePageUrl)),
      subtitles: [],
      prev: index > 0 ? episodes[index - 1] : undefined,
      next: index < episodes.length - 1 ? episodes[index + 1] : undefined,
    };
  },
};
