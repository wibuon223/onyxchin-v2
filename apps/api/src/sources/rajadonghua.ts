import type {
  Anime,
  Card,
  DetailPayload,
  Episode,
  HomePayload,
  ListPayload,
  SourceAdapter,
  SubtitleTrack,
  VideoSource,
  WatchPayload,
} from "@onyxchin/shared";
import { HttpError, absolute, fetchJson } from "../lib/http.js";

const BASE_URL = "https://rajadonghua.com";
const API_BASE = `${BASE_URL}/api/v1`;
const REFERER = `${BASE_URL}/`;

const HOME_HERO_LIMIT = 6;
const HOME_SECTION_LIMIT = 12;
const LIST_PAGE_SIZE = 24;
const SEARCH_LIMIT = 20;
const EPISODE_PAGE_SIZE = 200;
const MAX_EPISODE_PAGES = 10;
const RELATED_LIMIT = 6;
/** Upstream bursts are cheap but 7 parallel calls is rude: settle in waves of 4. */
const HOME_WAVE_SIZE = 4;

const HOME_GENRES = ["Action", "Fantasy", "Adventure", "Martial Arts"] as const;

/** Upstream FastAPI rejects anything outside these tables with HTTP 422. */
const VALID_SORTS: Record<string, true> = {
  latest: true,
  popular: true,
  rating: true,
  title: true,
  trending: true,
  episodes: true,
};
const VALID_STATUSES: Record<string, true> = { ongoing: true, completed: true, upcoming: true };

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data: T | null;
  pagination?: Pagination | null;
}

interface UpstreamItem {
  id?: string | null;
  title?: string | null;
  slug?: string | null;
  poster?: string | null;
  status?: string | null;
  type?: string | null;
  rating?: number | null;
  total_episodes?: number | null;
  genres?: string[] | null;
  year?: number | null;
}

interface UpstreamDetail extends UpstreamItem {
  banner?: string | null;
  alternative_titles?: string[] | null;
  synopsis?: string | null;
  synopsis_id?: string | null;
  studio?: string | null;
  release_year?: number | null;
}

interface UpstreamEpisode {
  id: string;
  episode_number: number;
  title?: string | null;
  released_at?: string | null;
}

interface UpstreamQuality {
  label?: string | null;
  url?: string | null;
  height?: number | null;
}

interface UpstreamSubtitle {
  url?: string | null;
  lang?: string | null;
  label?: string | null;
}

interface UpstreamStream {
  id?: string | null;
  video_url?: string | null;
  qualities?: UpstreamQuality[] | null;
  subtitles?: UpstreamSubtitle[] | null;
}

interface EpisodePage {
  items: UpstreamEpisode[];
  pagination: Pagination | null;
}

interface EpisodeSet {
  raw: UpstreamEpisode[];
  mapped: Episode[];
}

interface QualityCandidate {
  label: string;
  abs: string;
  rank: number;
}

function text(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : undefined;
}

/** `synopsis_id` is sometimes the literal placeholder "string" — never surface that. */
function realText(value: string | null | undefined): string | undefined {
  const trimmed = text(value);
  if (!trimmed) return undefined;
  const lowered = trimmed.toLowerCase();
  return lowered === "string" || lowered === "null" || lowered === "undefined" ? undefined : trimmed;
}

function positiveNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function positiveInt(value: number | null | undefined): number | undefined {
  const num = positiveNumber(value);
  return num === undefined ? undefined : Math.trunc(num);
}

function cleanList(values: string[] | null | undefined): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const cleaned = values.map((value) => text(value)).filter((value): value is string => value !== undefined);
  return cleaned.length ? cleaned : undefined;
}

async function getJson<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<ApiEnvelope<T>> {
  const url = new URL(API_BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return fetchJson<ApiEnvelope<T>>(url.toString(), {
    referer: REFERER,
    headers: { accept: "application/json" },
  });
}

function toCard(item: UpstreamItem): Card | null {
  const slug = text(item.slug);
  const title = text(item.title);
  if (!slug || !title) return null;
  return {
    id: text(item.id) ?? slug,
    slug,
    title,
    poster: absolute(BASE_URL, item.poster),
    type: text(item.type),
    status: text(item.status),
    year: positiveInt(item.year),
    rating: positiveNumber(item.rating),
    episodes: positiveInt(item.total_episodes),
    genres: cleanList(item.genres),
  };
}

function mapCards(items: UpstreamItem[] | null | undefined): Card[] {
  if (!Array.isArray(items)) return [];
  const cards: Card[] = [];
  for (const item of items) {
    const card = toCard(item);
    if (card) cards.push(card);
  }
  return cards;
}

function toEpisode(raw: UpstreamEpisode): Episode | null {
  const number = positiveNumber(raw.episode_number);
  if (number === undefined) return null;
  return {
    number,
    slug: String(number),
    title: text(raw.title),
    releasedAt: text(raw.released_at),
  };
}

function mapEpisodes(items: UpstreamEpisode[]): Episode[] {
  const mapped: Episode[] = [];
  const seen = new Set<number>();
  for (const item of items) {
    const episode = toEpisode(item);
    if (!episode || seen.has(episode.number)) continue;
    seen.add(episode.number);
    mapped.push(episode);
  }
  mapped.sort((a, b) => a.number - b.number);
  return mapped;
}

function toAnime(detail: UpstreamDetail, fallbackSlug: string): Anime {
  const slug = text(detail.slug) ?? fallbackSlug;
  return {
    id: text(detail.id) ?? slug,
    slug,
    title: text(detail.title) ?? slug,
    altTitles: cleanList(detail.alternative_titles),
    synopsis: text(detail.synopsis) ?? realText(detail.synopsis_id),
    poster: absolute(BASE_URL, detail.poster),
    banner: absolute(BASE_URL, detail.banner),
    type: text(detail.type),
    status: text(detail.status),
    year: positiveInt(detail.release_year) ?? positiveInt(detail.year),
    rating: positiveNumber(detail.rating),
    genres: cleanList(detail.genres),
    studio: text(detail.studio),
    totalEpisodes: positiveInt(detail.total_episodes),
    sourceId: "rajadonghua",
  };
}

async function fetchCards(params: Record<string, string | number | undefined>): Promise<Card[]> {
  const res = await getJson<UpstreamItem[]>("/donghua", params);
  return mapCards(res.data);
}

async function fetchDetail(slug: string): Promise<Anime> {
  try {
    const res = await getJson<UpstreamDetail>(`/donghua/${encodeURIComponent(slug)}`);
    if (!res.data) throw new Error(`not_found: ${slug} tidak ada di rajadonghua.com`);
    return toAnime(res.data, slug);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw new Error(`not_found: ${slug} tidak ada di rajadonghua.com`);
    }
    throw error;
  }
}

async function fetchEpisodePage(slug: string, page: number): Promise<EpisodePage> {
  const res = await getJson<UpstreamEpisode[]>(`/donghua/${encodeURIComponent(slug)}/episodes`, {
    limit: EPISODE_PAGE_SIZE,
    page,
  });
  return { items: Array.isArray(res.data) ? res.data : [], pagination: res.pagination ?? null };
}

/** Episodes are capped at 200 per page upstream, so long shows need extra pages. */
async function fetchAllEpisodes(slug: string): Promise<EpisodeSet> {
  const raw: UpstreamEpisode[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const current = await fetchEpisodePage(slug, page);
    raw.push(...current.items);
    totalPages = current.pagination?.total_pages ?? 1;
    if (!current.items.length) break;
    page += 1;
  } while (page <= Math.min(totalPages, MAX_EPISODE_PAGES));
  return { raw, mapped: mapEpisodes(raw) };
}

async function fetchRelated(anime: Anime, slug: string): Promise<Card[]> {
  const genre = anime.genres?.[0];
  if (!genre) return [];
  try {
    const cards = await fetchCards({
      genre,
      limit: RELATED_LIMIT + 1,
      page: 1,
      sort: "popular",
    });
    return cards.filter((card) => card.slug !== slug).slice(0, RELATED_LIMIT);
  } catch {
    return [];
  }
}

async function fetchStream(target: UpstreamEpisode): Promise<UpstreamStream> {
  try {
    const res = await getJson<UpstreamStream>(`/episode/${encodeURIComponent(target.id)}/stream`);
    if (!res.data) throw new Error(`no_source: stream episode ${target.episode_number} kosong`);
    return res.data;
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 403) {
        throw new Error(`vip_locked: episode ${target.episode_number} khusus VIP di rajadonghua.com`);
      }
      if (error.status === 404) {
        throw new Error(`not_found: stream episode ${target.episode_number} tidak tersedia`);
      }
    }
    throw error;
  }
}

/** Signed URLs carry a short-lived `tk` token, so playback is always re-resolved per request. */
function sourceFor(episodeId: string, label: string, absUrl: string, note?: string): VideoSource {
  const isHls = /\.m3u8(\?|$)/i.test(absUrl);
  const source: VideoSource = {
    id: `${episodeId}:${label.toLowerCase()}`,
    label,
    kind: isHls ? "hls" : "direct",
    url: isHls
      ? `/api/hls?u=${encodeURIComponent(absUrl)}`
      : `/api/media?u=${encodeURIComponent(absUrl)}&ref=${encodeURIComponent(REFERER)}`,
    quality: label,
    playable: true,
  };
  if (note) source.note = note;
  return source;
}

function qualityLabel(quality: UpstreamQuality): string {
  const label = text(quality.label);
  if (label) return label;
  const height = positiveInt(quality.height);
  return height ? `${height}p` : "Auto";
}

function qualityRank(label: string, height: number | null | undefined): number {
  const measured = positiveNumber(height);
  if (measured !== undefined) return measured;
  if (/4k|uhd/i.test(label)) return 2160;
  const match = /(\d{3,4})/.exec(label);
  return match ? Number(match[1]) : 0;
}

function buildSources(episodeId: string, stream: UpstreamStream): VideoSource[] {
  const candidates: QualityCandidate[] = [];
  for (const quality of stream.qualities ?? []) {
    const abs = absolute(BASE_URL, quality.url);
    if (!abs) continue;
    const label = qualityLabel(quality);
    candidates.push({ label, abs, rank: qualityRank(label, quality.height) });
  }
  candidates.sort((a, b) => b.rank - a.rank);

  const sources: VideoSource[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(sourceFor(episodeId, candidate.label, candidate.abs));
  }

  const mainAbs = absolute(BASE_URL, stream.video_url);
  if (mainAbs) {
    const match = candidates.find((candidate) => candidate.abs === mainAbs);
    const pathMatch = /\/(\d{3,4})p\//i.exec(new URL(mainAbs).pathname);
    const label =
      match?.label ?? (pathMatch ? `${pathMatch[1]}p` : undefined) ?? candidates[0]?.label ?? "Auto";
    const key = label.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      sources.push(sourceFor(episodeId, label, mainAbs, "default upstream"));
    }
  }

  return sources;
}

/** SRT is not playable in <track>; /api/sub converts it to WebVTT on the fly. */
function buildSubtitles(stream: UpstreamStream): SubtitleTrack[] {
  const tracks: SubtitleTrack[] = [];
  const seen = new Set<string>();
  for (const subtitle of stream.subtitles ?? []) {
    const abs = absolute(BASE_URL, subtitle.url);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    const lang = text(subtitle.lang) ?? "und";
    tracks.push({
      label: text(subtitle.label) ?? lang.toUpperCase(),
      lang,
      url: `/api/sub?u=${encodeURIComponent(abs)}`,
    });
  }
  return tracks;
}

/** Waves of at most HOME_WAVE_SIZE concurrent upstream calls. */
async function settleInWaves<T>(tasks: Array<() => Promise<T>>): Promise<Array<PromiseSettledResult<T>>> {
  const results: Array<PromiseSettledResult<T>> = [];
  for (let index = 0; index < tasks.length; index += HOME_WAVE_SIZE) {
    const wave = tasks.slice(index, index + HOME_WAVE_SIZE).map((task) => task());
    results.push(...(await Promise.allSettled(wave)));
  }
  return results;
}

function cardsOf(result: PromiseSettledResult<Card[]>): Card[] {
  return result.status === "fulfilled" ? result.value : [];
}

async function home(): Promise<HomePayload> {
  const [heroResult, trendingResult, latestResult, ...genreResults] = await settleInWaves<Card[]>([
    () => fetchCards({ limit: HOME_HERO_LIMIT, page: 1, sort: "popular" }),
    () => fetchCards({ limit: HOME_SECTION_LIMIT, page: 1, sort: "popular" }),
    () => fetchCards({ limit: HOME_SECTION_LIMIT, page: 1, sort: "latest" }),
    ...HOME_GENRES.map((genre) => () =>
      fetchCards({ limit: HOME_SECTION_LIMIT, page: 1, sort: "popular", genre }),
    ),
  ]);

  const popular = cardsOf(trendingResult);
  const hero = cardsOf(heroResult).slice(0, HOME_HERO_LIMIT);
  if (!hero.length) hero.push(...popular.slice(0, HOME_HERO_LIMIT));

  const latest = cardsOf(latestResult);
  const rows: [string, Card[]][] = [
    ["Terbaru", latest],
    ["Populer", popular],
    ...HOME_GENRES.map((genre, offset): [string, Card[]] => [genre, cardsOf(genreResults[offset])]),
  ];
  const sections: HomePayload["sections"] = rows
    .filter(([, items]) => items.length > 0)
    .map(([title, items]) => ({
      title,
      items,
      href: `/api/rajadonghua/list?page=1&genre=${encodeURIComponent(title)}`,
    }));

  return { hero, sections };
}

async function list(params: {
  page: number;
  genre?: string;
  status?: string;
  order?: string;
}): Promise<ListPayload> {
  const requested = Number.isFinite(params.page) ? Math.trunc(params.page) : 1;
  const page = requested > 0 ? requested : 1;
  const sortInput = (params.order ?? "").trim().toLowerCase();
  const statusInput = (params.status ?? "").trim().toLowerCase();
  const res = await getJson<UpstreamItem[]>("/donghua", {
    page,
    limit: LIST_PAGE_SIZE,
    sort: VALID_SORTS[sortInput] ? sortInput : "latest",
    genre: text(params.genre),
    status: VALID_STATUSES[statusInput] ? statusInput : undefined,
  });

  const items = mapCards(res.data);
  const totalPages = res.pagination?.total_pages;
  const hasNext = typeof totalPages === "number" ? page < totalPages : items.length >= LIST_PAGE_SIZE;

  const payload: ListPayload = {
    items,
    page: res.pagination?.page ?? page,
    hasNext,
  };
  if (typeof totalPages === "number") payload.totalPages = totalPages;
  return payload;
}

async function search(query: string): Promise<Card[]> {
  const value = query.trim();
  if (!value) return [];
  const res = await getJson<UpstreamItem[]>("/donghua", {
    search: value,
    limit: SEARCH_LIMIT,
    page: 1,
  });
  return mapCards(res.data);
}

async function detail(slug: string): Promise<DetailPayload> {
  const seriesSlug = slug.trim();
  if (!seriesSlug) throw new Error("bad_request: slug kosong");

  const [detailResult, episodeResult] = await Promise.allSettled([
    fetchDetail(seriesSlug),
    fetchEpisodePage(seriesSlug, 1),
  ]);

  if (detailResult.status === "rejected") {
    const reason: unknown = detailResult.reason;
    throw reason instanceof Error ? reason : new Error(String(reason));
  }

  const episodes = episodeResult.status === "fulfilled" ? mapEpisodes(episodeResult.value.items) : [];
  const related = await fetchRelated(detailResult.value, seriesSlug);

  const payload: DetailPayload = { anime: detailResult.value, episodes };
  if (related.length) payload.related = related;
  return payload;
}

async function watch(slug: string, episode: string): Promise<WatchPayload> {
  const seriesSlug = slug.trim();
  if (!seriesSlug) throw new Error("bad_request: slug kosong");

  const wanted = Number(episode);
  if (!Number.isFinite(wanted) || wanted <= 0) {
    throw new Error(`bad_request: nomor episode "${episode}" tidak valid`);
  }

  const [anime, episodeSet] = await Promise.all([fetchDetail(seriesSlug), fetchAllEpisodes(seriesSlug)]);

  const target = episodeSet.raw.find((raw) => raw.episode_number === wanted);
  if (!target) throw new Error(`not_found: episode ${wanted} tidak ada di ${seriesSlug}`);
  const targetEpisode = toEpisode(target);
  if (!targetEpisode) throw new Error(`not_found: episode ${wanted} tidak valid di ${seriesSlug}`);

  const stream = await fetchStream(target);

  const sources = buildSources(target.id, stream);
  if (!sources.length) throw new Error(`no_source: episode ${wanted} tidak punya sumber video`);

  const episodes = episodeSet.mapped;
  const index = episodes.findIndex((item) => item.number === targetEpisode.number);

  const payload: WatchPayload = {
    anime,
    episode: targetEpisode,
    sources,
    subtitles: buildSubtitles(stream),
  };
  if (index > 0) payload.prev = episodes[index - 1];
  if (index >= 0 && index < episodes.length - 1) payload.next = episodes[index + 1];
  return payload;
}

export const rajadonghua: SourceAdapter = {
  id: "rajadonghua",
  name: "Raja Donghua",
  baseUrl: BASE_URL,
  lang: "id",
  home,
  list,
  search,
  detail,
  watch,
};
