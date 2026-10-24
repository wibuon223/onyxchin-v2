import { upgradeDailymotionSources } from "../lib/dailymotion.js";
import { distinctRows } from "../lib/home.js";
import * as cheerio from "cheerio";
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
import { HttpError, absolute, fetchText } from "../lib/http.js";

const BASE = "https://anichin.my";
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 64;

/** CDNs that serve posters with `access-control-allow-origin: *`, so no proxy needed. */
const PUBLIC_IMAGE_HOSTS = [
  "i0.wp.com",
  "i1.wp.com",
  "i2.wp.com",
  "i3.wp.com",
  "wsrv.nl",
  "i.ibb.co",
  "i.ibb.co.com",
  "iili.io",
  "i.postimg.cc",
];

/** Download pages that can appear in a mirror dropdown but are not players. */
const DOWNLOAD_HOSTS = ["mega.nz", "mega.co.nz", "pixeldrain", "drive.google.com", "mediafire", "mitedrive", "buzzheavier", "qiwi"];

/** DoodStream family: reachable, but refuses embeds on unknown domains. */
const DOOD_HOSTS = /(^|\.)(do+od\.[a-z]{2,6}|playmogo\.com|doodstream|doodapi|ds2play\.[a-z]{2,6})$/i;
/** Mirrors whose TLS handshake no longer completes (verified 2026-10-24). */
const DEAD_HOSTS = /(^|\.)(ahvsh\.com|sblona\.com|vanfem\.com|fembed\.com|femax\d*\.com|fvd\d*\.com)$/i;

const STATUS_FILTERS = new Set(["ongoing", "completed", "upcoming", "hiatus"]);

const cache = new Map<string, { at: number; html: string }>();

const squash = (value: string): string => value.replace(/\s+/g, " ").trim();

async function page(url: string): Promise<string> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.html;
  const html = await fetchText(url, { referer: `${BASE}/` });
  cache.set(url, { at: Date.now(), html });
  if (cache.size > CACHE_MAX) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return html;
}

/** Past-the-end listing pages answer 404 upstream; callers treat that as an empty page. */
async function pageIfExists(url: string): Promise<string | null> {
  try {
    return await page(url);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

function slugFromHref(href: string | undefined): string | null {
  if (!href) return null;
  try {
    const path = new URL(href, BASE).pathname.replace(/^\/+|\/+$/g, "");
    if (!path) return null;
    return path.startsWith("series/") ? path.slice("series/".length) : path;
  } catch {
    return null;
  }
}

function normalizeSlug(input: string): string {
  let path = input.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      // keep the raw value; it will simply fail upstream
    }
  }
  path = path.split(/[?#]/)[0] ?? "";
  path = path.replace(/^\/+|\/+$/g, "");
  return path.startsWith("series/") ? path.slice("series/".length) : path;
}

function imageUrl(raw: string | null | undefined): string | null {
  const value = absolute(BASE, raw ?? null);
  if (!value) return null;
  if (PUBLIC_IMAGE_HOSTS.includes(new URL(value).hostname.toLowerCase())) return value;
  return `/api/img?url=${encodeURIComponent(value)}`;
}

function hasNextPage($: cheerio.CheerioAPI): boolean {
  return (
    $(".hpage a, .pagination a")
      .filter((_, el) => /selanjutnya|next/i.test(squash($(el).text())))
      .length > 0
  );
}

function cardsFrom($: cheerio.CheerioAPI, selector: string, limit?: number): Card[] {
  const cards: Card[] = [];
  $(selector).each((_, el) => {
    const node = $(el);
    const slug = slugFromHref(node.find("a.tip").first().attr("href"));
    if (!slug) return;
    const heading = squash(node.find("h2").first().text());
    const titleNode = node.find(".tt").first().clone();
    titleNode.find("h2").remove();
    const seriesName = squash(titleNode.text());
    const title = seriesName || heading;
    if (!title) return;

    const epx = squash(node.find(".epx").first().text());
    const epNumber = Number.parseInt(epx.replace(/^[^\d]*/, ""), 10);
    const badge = squash(node.find(".status").first().text());
    const img = node.find("img.ts-post-image").first();
    const card: Card = {
      id: slug,
      slug,
      title,
      poster: imageUrl(img.attr("src") ?? img.attr("data-src") ?? node.find("img").first().attr("src")),
    };
    const type = squash(node.find(".typez").first().text());
    if (type) card.type = type;
    const status = badge || (/^(ongoing|completed|upcoming|hiatus)$/i.test(epx) ? epx : "");
    if (status) card.status = status;
    if (Number.isFinite(epNumber)) card.episodes = epNumber;
    cards.push(card);
  });
  return limit ? cards.slice(0, limit) : cards;
}

function cardsFromSeriesList($: cheerio.CheerioAPI, limit: number): Card[] {
  const cards: Card[] = [];
  $(".serieslist li").each((_, el) => {
    const node = $(el);
    const link = node.find("a.series").first();
    const slug = slugFromHref(link.attr("href"));
    const title = squash(node.find("h4").first().text()) || squash(link.text());
    if (!slug || !title) return;
    cards.push({
      id: slug,
      slug,
      title,
      poster: imageUrl(node.find("img.ts-post-image").first().attr("src")),
    });
  });
  return cards.slice(0, limit);
}

interface SeriesPage {
  anime: Anime;
  episodes: Episode[];
  related: Card[];
}

async function seriesSlugFromPost(postSlug: string): Promise<string> {
  const $ = cheerio.load(await page(`${BASE}/${postSlug}/`));
  const seriesHref =
    $(".naveps a")
      .filter((_, el) => ($(el).attr("href") ?? "").includes("/series/"))
      .first()
      .attr("href") ??
    $(".ts-breadcrumb a")
      .filter((_, el) => ($(el).attr("href") ?? "").includes("/series/"))
      .last()
      .attr("href");
  const fromPage = slugFromHref(seriesHref);
  if (fromPage) return fromPage;
  // Last resort: some episode slugs carry the series name plus `-episode-N...`.
  const derived = postSlug.replace(/-episode-\d+.*$/i, "");
  if (derived !== postSlug) return derived;
  throw new Error(`anichin: no series link on post ${postSlug}`);
}

async function loadSeries(seriesSlug: string): Promise<SeriesPage> {
  const $ = cheerio.load(await page(`${BASE}/series/${seriesSlug}/`));
  if ($(".animefull").length === 0 && $(".eplister").length === 0) {
    throw new Error(`anichin: ${seriesSlug} is not a series page`);
  }

  const title = squash($(".animefull h1").first().text()) || squash($(".entry-title").first().text()) || seriesSlug;

  const info = new Map<string, string>();
  let releasedText = "";
  $(".info-content .spe span").each((_, el) => {
    const key = squash($(el).find("b").first().text()).replace(/:$/, "").toLowerCase();
    const value = squash($(el).text()).replace(/^[^:]*:\s*/, "");
    if (!key) return;
    if (key === "dirilis" && !releasedText) releasedText = value;
    info.set(key, value);
  });

  const yearMatch = /(\d{4})/.exec(releasedText);
  const totalEpisodes = Number.parseInt(info.get("episode") ?? "", 10);
  const rating = Number.parseFloat(squash($(".rating .numscore").first().text()));

  const synopsisParts = $(".bixbox.synp .entry-content p")
    .map((_, el) => squash($(el).text()))
    .get()
    .filter(Boolean);
  let synopsis = synopsisParts.join("\n\n");
  if (synopsis.toLowerCase().startsWith(title.toLowerCase())) synopsis = synopsis.slice(title.length).trim();

  const altTitles = $(".alter")
    .map((_, el) => squash($(el).text()))
    .get()
    .filter(Boolean);
  const genres = $(".genxed a")
    .map((_, el) => squash($(el).text()))
    .get()
    .filter(Boolean);
  const posterSource = $(".animefull .thumb img").first();
  const banner = imageUrl($('meta[property="og:image"]').attr("content"));

  const episodes: Episode[] = [];
  const seenEpisodes = new Set<string>();
  $(".eplister li a").each((_, el) => {
    const node = $(el);
    const epSlug = slugFromHref(node.attr("href"));
    const number = Number.parseInt(squash(node.find(".epl-num").text()), 10);
    // Non-numeric rows are site notices (e.g. "LIBUR"), not episodes.
    if (!epSlug || !Number.isFinite(number) || seenEpisodes.has(epSlug)) return;
    seenEpisodes.add(epSlug);
    const epTitle = squash(node.find(".epl-title").text());
    const releasedAt = squash(node.find(".epl-date").text());
    const timestamp = Date.parse(releasedAt);
    episodes.push({
      number,
      slug: epSlug,
      ...(epTitle ? { title: epTitle } : {}),
      ...(Number.isFinite(timestamp) ? { releasedAt: new Date(timestamp).toISOString().slice(0, 10) } : {}),
    });
  });
  episodes.sort((a, b) => a.number - b.number);
  // The episode list is authoritative; the sidebar "Episode:" field goes stale on long-runners.
  const episodeCount = episodes.length > 0 ? episodes.length : Number.isFinite(totalEpisodes) ? totalEpisodes : 0;

  const anime: Anime = {
    id: seriesSlug,
    slug: seriesSlug,
    title,
    poster: imageUrl(posterSource.attr("src") ?? posterSource.attr("data-src")),
    sourceId: "anichin",
    ...(altTitles.length ? { altTitles } : {}),
    ...(synopsis ? { synopsis } : {}),
    ...(banner ? { banner } : {}),
    ...(info.get("tipe") ? { type: info.get("tipe") } : {}),
    ...(info.get("status") ? { status: info.get("status") } : {}),
    ...(yearMatch ? { year: Number(yearMatch[1]) } : {}),
    ...(Number.isFinite(rating) ? { rating } : {}),
    ...(genres.length ? { genres } : {}),
    ...(info.get("studio") ? { studio: info.get("studio") } : {}),
    ...(episodeCount ? { totalEpisodes: episodeCount } : {}),
  };

  const recommended = cardsFrom($, 'div.bixbox:has(.releases h3:contains("Rekomendasi")) .listupd article.bs', 6);
  const related = recommended.length > 0 ? recommended : cardsFromSeriesList($, 6);

  return { anime, episodes, related };
}

async function loadSeriesFor(slugInput: string): Promise<SeriesPage> {
  const slug = normalizeSlug(slugInput);
  if (!slug) throw new Error("anichin: empty slug");
  if (!slug.includes("-episode-")) {
    try {
      return await loadSeries(slug);
    } catch {
      // Not a series slug; fall through and resolve it as a post page.
    }
  }
  return loadSeries(await seriesSlugFromPost(slug));
}

/** Cards from a homepage widget identified by its heading text. */
function sectionCards($: cheerio.CheerioAPI, needle: string, tag: string): Card[] {
  let best: Card[] = [];
  $("h2,h3").each((_, el) => {
    const text = squash($(el).text());
    if (!text.includes(needle)) return;
    const box = $(el).closest(".bixbox, .section, .releases").parent();
    box.attr("data-onyx-sec", tag);
    const cards = cardsFrom($, `[data-onyx-sec="${tag}"] .listupd article.bs`);
    if (cards.length > best.length) best = cards;
  });
  return best.slice(0, 20);
}


function browseHref(title: string): string {
  if (title === "Terpopuler Hari Ini") return "/browse?order=popular";
  if (["Action", "Fantasy", "Adventure", "Martial Arts"].includes(title)) {
    return `/browse?genre=${encodeURIComponent(title)}`;
  }
  return "/browse";
}

export const anichin: SourceAdapter = {
  id: "anichin",
  name: "Anichin",
  baseUrl: BASE,
  lang: "id",

  async home(): Promise<HomePayload> {
    const [homeResult, actionResult, fantasyResult, adventureResult, martialResult] = await Promise.allSettled([
      page(`${BASE}/`),
      page(`${BASE}/genres/action/`),
      page(`${BASE}/genres/fantasy/`),
      page(`${BASE}/genres/adventure/`),
      page(`${BASE}/genres/martial-arts/`),
    ]);
    if (homeResult.status === "rejected") throw homeResult.reason;

    const $ = cheerio.load(homeResult.value);
    const popularToday = sectionCards($, "Terpopuler Hari Ini", "pop-today");
    const latest = sectionCards($, "Rilisan Terbaru", "latest");
    const recommended = sectionCards($, "Rekomendasi", "recommended");
    let popular = cardsFrom($, ".listupd.popularslider article.bs");
    if (popular.length < 10) {
      try {
        popular = cardsFrom(cheerio.load(await page(`${BASE}/series/?order=popular`)), ".listupd article.bs", 20);
      } catch {
        popular = popular;
      }
    }

    const genreRow = (r: PromiseSettledResult<string>): Card[] =>
      r.status === "fulfilled" ? cardsFrom(cheerio.load(r.value), ".listupd article.bs").slice(0, 20) : [];

    const rows: [string, Card[]][] = [
      ["Terpopuler Hari Ini", popularToday.length ? popularToday : popular.slice(0, 20)],
      ["Rilisan Terbaru", latest],
      ["Rekomendasi", recommended],
      ["Action", genreRow(actionResult)],
      ["Fantasy", genreRow(fantasyResult)],
      ["Adventure", genreRow(adventureResult)],
      ["Martial Arts", genreRow(martialResult)],
    ];
    const sections = distinctRows(rows).map((section) => ({
      ...section,
      href: browseHref(section.title),
    }));

    const hero = latest.slice(0, 6);
    return { hero, sections };
  },

  async list({ page: pageNo, genre, status, order }): Promise<ListPayload> {
    const currentPage = Number.isFinite(pageNo) && pageNo > 0 ? Math.trunc(pageNo) : 1;
    const genreSlug = (genre ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    if (genreSlug) {
      const url = currentPage > 1 ? `${BASE}/genres/${genreSlug}/page/${currentPage}/` : `${BASE}/genres/${genreSlug}/`;
      const html = await pageIfExists(url);
      if (!html) return { items: [], page: currentPage, hasNext: false };
      const $ = cheerio.load(html);
      const totals = $(".page-numbers a, a.page-numbers")
        .map((_, el) => Number.parseInt(squash($(el).text()), 10))
        .get()
        .filter((value) => Number.isFinite(value));
      const totalPages = totals.length ? Math.max(currentPage, ...totals) : undefined;
      return {
        items: cardsFrom($, ".listupd article.bs"),
        page: currentPage,
        hasNext: totalPages ? totalPages > currentPage : hasNextPage($),
        ...(totalPages ? { totalPages } : {}),
      };
    }

    const filters: string[] = [];
    const statusKey = (status ?? "").trim().toLowerCase();
    if (STATUS_FILTERS.has(statusKey)) filters.push(`status=${encodeURIComponent(statusKey)}`);
    const orderKey = (order ?? "").trim().toLowerCase();
    if (orderKey === "popular" || orderKey === "rating") filters.push(`order=${orderKey}`);
    if (filters.length > 0) {
      const html = await pageIfExists(`${BASE}/series/?${filters.join("&")}&page=${currentPage}`);
      if (!html) return { items: [], page: currentPage, hasNext: false };
      const $ = cheerio.load(html);
      return { items: cardsFrom($, ".listupd article.bs"), page: currentPage, hasNext: hasNextPage($) };
    }

    // `/anime/` is a 404 on anichin.my; `/page/N/` is the real latest-updates listing (20/page).
    const html = await pageIfExists(currentPage > 1 ? `${BASE}/page/${currentPage}/` : `${BASE}/`);
    if (!html) return { items: [], page: currentPage, hasNext: false };
    const $ = cheerio.load(html);
    return {
      items: cardsFrom($, "div.bixbox:has(.releases.latesthome) .listupd article.bs"),
      page: currentPage,
      hasNext: hasNextPage($),
    };
  },

  async search(query: string): Promise<Card[]> {
    const q = query.trim();
    if (!q) return [];
    // Missing matches render a "Tidak ditemukan" page whose `.listupd` holds zero articles.
    const $ = cheerio.load(await page(`${BASE}/?s=${encodeURIComponent(q)}`));
    return cardsFrom($, ".listupd article.bs");
  },

  async detail(slug: string): Promise<DetailPayload> {
    const { anime, episodes, related } = await loadSeriesFor(slug);
    return { anime, episodes, ...(related.length ? { related } : {}) };
  },

  async watch(slug: string, episode: string): Promise<WatchPayload> {
    const raw = String(episode).trim();
    const wanted = normalizeSlug(raw);
    if (!wanted) throw new Error("anichin: episode is required");
    const { anime, episodes } = await loadSeriesFor(slug);
    const wantedNumber = /^\d+$/.test(raw) ? Number(raw) : null;

    let resolved = wantedNumber !== null ? episodes.find((item) => item.number === wantedNumber) : undefined;
    if (!resolved) {
      const stripped = wanted.replace(/-subtitle-indonesia$/, "");
      resolved = episodes.find(
        (item) => item.slug === wanted || item.slug.replace(/-subtitle-indonesia$/, "") === stripped,
      );
    }
    if (!resolved) {
      const numberMatch = /-episode-(\d+)/.exec(wanted);
      if (numberMatch) resolved = episodes.find((item) => item.number === Number(numberMatch[1]));
    }
    if (!resolved && wantedNumber !== null) {
      throw new Error(`anichin: episode ${raw} not found for ${anime.slug}`);
    }

    const episodeSlug = resolved?.slug ?? wanted;
    const $ = cheerio.load(await page(`${BASE}/${episodeSlug}/`));

    const sources: VideoSource[] = [];
    $("select.mirror option").each((index, el) => {
      const encoded = ($(el).attr("value") ?? "").trim();
      if (!encoded) return;
      const label = squash($(el).text());
      const snippet = Buffer.from(encoded, "base64").toString("utf8");
      const src =
        /<iframe[^>]*\bsrc=["']([^"']+)["']/i.exec(snippet)?.[1] ??
        /<a[^>]*\bhref=["']([^"']+)["']/i.exec(snippet)?.[1] ??
        /(https?:\/\/[^\s"'<>]+)/i.exec(snippet)?.[1];
      if (!src) return;
      const url = src.startsWith("//") ? `https:${src}` : src;
      // Broken "Rumble" rows occasionally embed the chrome-extension PDF viewer.
      if (!/^https?:\/\//i.test(url)) return;
      let host = "";
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch {
        return;
      }
      const source: VideoSource = { id: `mirror-${index}`, label: label || host, kind: "iframe", url, playable: true };
      const quality = /(\d{3,4}p)/i.exec(label)?.[1];
      if (quality) source.quality = quality;
      if (DOOD_HOSTS.test(host)) {
        source.playable = false;
        source.note = "embed dibatasi";
      } else if (DEAD_HOSTS.test(host)) {
        source.playable = false;
        source.note = "host tidak merespons";
      } else if (host.includes("dailymotion")) {
        source.playable = false;
        source.note = "domain-locked";
      } else if (DOWNLOAD_HOSTS.some((known) => host.includes(known))) {
        source.kind = "external";
        source.playable = false;
        source.note = "download";
      }
      sources.push(source);
    });

    let episodeInfo: Episode;
    if (resolved) {
      episodeInfo = resolved;
    } else {
      const numberMatch = /-episode-(\d+)/.exec(episodeSlug);
      const pageTitle = squash($("h1.entry-title").first().text());
      episodeInfo = {
        number: numberMatch ? Number(numberMatch[1]) : 0,
        slug: episodeSlug,
        ...(pageTitle ? { title: pageTitle } : {}),
      };
    }

    let prev: Episode | undefined;
    let next: Episode | undefined;
    if (resolved) {
      const position = episodes.findIndex((item) => item.slug === resolved.slug);
      if (position > 0) prev = episodes[position - 1];
      if (position >= 0 && position < episodes.length - 1) next = episodes[position + 1];
    }

    return {
      anime,
      episode: episodeInfo,
      sources: await upgradeDailymotionSources(sources),
      subtitles: [],
      ...(prev ? { prev } : {}),
      ...(next ? { next } : {}),
    };
  },
};
