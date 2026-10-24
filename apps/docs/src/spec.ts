/**
 * The documentation model. Every endpoint block, parameter table, sample
 * response, schema and nav entry on the page is derived from this file.
 *
 * Keep prose short and factual: this is a reference, not a landing page.
 */

export const API_BASE = "https://onyxchin-api.onrender.com";
export const API_VERSION = "v1";

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

export type SourceId = "rajadonghua" | "anichin" | "animexin" | "donghuaworld";

export interface SourceInfo {
  id: SourceId;
  name: string;
  baseUrl: string;
  lang: string;
}

export const SOURCES: SourceInfo[] = [
  { id: "rajadonghua", name: "Raja Donghua", baseUrl: "https://rajadonghua.com", lang: "id" },
  { id: "anichin", name: "Anichin", baseUrl: "https://anichin.my", lang: "id" },
  { id: "animexin", name: "AnimeXin", baseUrl: "https://animexin.dev", lang: "id" },
  { id: "donghuaworld", name: "Donghua World", baseUrl: "https://donghuaworld.com", lang: "id" },
];

export const SOURCE_IDS: SourceId[] = SOURCES.map((s) => s.id);

export interface SourceMatrixRow {
  id: SourceId;
  name: string;
  catalog: string;
  playback: string;
  extras: string;
}

export const SOURCE_MATRIX: SourceMatrixRow[] = [
  {
    id: "rajadonghua",
    name: "Raja Donghua",
    catalog: "≈715 titles",
    playback: "Direct MP4 — 1080p / 720p / 480p / 360p",
    extras: "SRT subtitles, playable through /api/media",
  },
  {
    id: "anichin",
    name: "Anichin",
    catalog: "18k+ posts",
    playback: "5 mirrors per episode",
    extras: "Iframe embeds; mirror fallback when one dies",
  },
  {
    id: "animexin",
    name: "AnimeXin",
    catalog: "8 mirrors",
    playback: "gdriveplayer embeds",
    extras: "Multi-language embeds; iframe/external only",
  },
  {
    id: "donghuaworld",
    name: "Donghua World",
    catalog: "Dark server catalog",
    playback: "Requires VPN from restricted regions",
    extras: "May be unreachable from some ISPs",
  },
];

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export type ParamLocation = "path" | "query";

export interface ParamSpec {
  name: string;
  in: ParamLocation;
  required: boolean;
  type: string;
  desc: string;
  example: string;
  /** Rendered as a select instead of a free-text input. */
  values?: string[];
  placeholder?: string;
}

export type ResponseSpec =
  | { kind: "json"; value: unknown }
  | { kind: "text"; text: string; language: "http" | "m3u8" | "vtt" }
  | {
      kind: "headers";
      statusLine: string;
      headers: [string, string][];
      binary?: "image" | "video";
      summary?: string;
    };

export type GroupId = "discovery" | "catalog" | "proxy";

export const GROUP_LABEL: Record<GroupId, string> = {
  discovery: "Discovery",
  catalog: "Catalog",
  proxy: "Proxies",
};

export interface ErrorCase {
  status: string;
  meaning: string;
}

export interface EndpointSpec {
  /** Short id; the section anchor is `ep-${id}`. */
  id: string;
  group: GroupId;
  title: string;
  method: "GET";
  path: string;
  summary: string;
  description: string;
  params: ParamSpec[];
  response: ResponseSpec;
  errors?: ErrorCase[];
  notes?: string[];
}

/* ------------------------------------------------------------------ */
/* Sample builders — all samples illustrate the documented contract.   */
/* ------------------------------------------------------------------ */

const img = (url: string) => `/api/img?url=${encodeURIComponent(url)}`;
const media = (url: string, ref: string) =>
  `/api/media?u=${encodeURIComponent(url)}&ref=${encodeURIComponent(ref)}`;
const sub = (url: string) => `/api/sub?u=${encodeURIComponent(url)}`;

export interface CardSample {
  id: string;
  slug: string;
  title: string;
  poster: string | null;
  type?: string;
  status?: string;
  year?: number;
  rating?: number;
  episodes?: number;
  genres?: string[];
}

export interface AnimeSample extends CardSample {
  altTitles?: string[];
  synopsis?: string;
  banner?: string | null;
  studio?: string;
  totalEpisodes?: number;
  sourceId: SourceId;
}

export interface EpisodeSample {
  number: number;
  slug: string;
  title?: string;
  releasedAt?: string;
}

const CARD_BTTH: CardSample = {
  id: "battle-through-the-heavens",
  slug: "battle-through-the-heavens",
  title: "Battle Through the Heavens",
  poster: img("https://rajadonghua.com/wp-content/uploads/2018/09/btth.jpg"),
  type: "Donghua",
  status: "Ongoing",
  year: 2018,
  rating: 8.1,
  episodes: 130,
  genres: ["Action", "Fantasy", "Adventure"],
};

const CARD_DOULUO: CardSample = {
  id: "soul-land",
  slug: "soul-land",
  title: "Soul Land",
  poster: img("https://rajadonghua.com/wp-content/uploads/2018/01/soul-land.jpg"),
  type: "Donghua",
  status: "Ongoing",
  year: 2018,
  rating: 8.4,
  episodes: 260,
  genres: ["Action", "Fantasy"],
};

const CARD_PERFECT: CardSample = {
  id: "perfect-world",
  slug: "perfect-world",
  title: "Perfect World",
  poster: img("https://rajadonghua.com/wp-content/uploads/2021/04/perfect-world.jpg"),
  type: "Donghua",
  status: "Ongoing",
  year: 2021,
  rating: 7.9,
  episodes: 190,
  genres: ["Action", "Martial Arts"],
};

const ANIME_BTTH: AnimeSample = {
  id: "battle-through-the-heavens",
  slug: "battle-through-the-heavens",
  title: "Battle Through the Heavens",
  altTitles: ["斗破苍穹", "Doupo Cangqiong"],
  synopsis:
    "Xiao Yan loses his cultivation, then rebuilds it under the guidance of a hidden spirit and rises through the Dou Qi continent.",
  poster: img("https://rajadonghua.com/wp-content/uploads/2018/09/btth.jpg"),
  banner: null,
  type: "Donghua",
  status: "Ongoing",
  year: 2018,
  rating: 8.1,
  genres: ["Action", "Fantasy", "Adventure"],
  studio: "Motion Magic",
  totalEpisodes: 130,
  sourceId: "rajadonghua",
};

const EPISODE_1: EpisodeSample = {
  number: 1,
  slug: "episode-1",
  title: "Episode 1",
  releasedAt: "2018-09-03",
};

const EPISODE_2: EpisodeSample = {
  number: 2,
  slug: "episode-2",
  title: "Episode 2",
  releasedAt: "2018-09-10",
};

const VIDEO_SOURCES = [
  {
    id: "1080p",
    label: "Raja Donghua 1080p",
    kind: "direct",
    url: media(
      "https://rajadonghua.com/wp-content/uploads/video/btth-ep01-1080p.mp4",
      "https://rajadonghua.com/",
    ),
    quality: "1080p",
    lang: "id",
    playable: true,
  },
  {
    id: "720p",
    label: "Raja Donghua 720p",
    kind: "direct",
    url: media(
      "https://rajadonghua.com/wp-content/uploads/video/btth-ep01-720p.mp4",
      "https://rajadonghua.com/",
    ),
    quality: "720p",
    lang: "id",
    playable: true,
  },
  {
    id: "mirror-anichin",
    label: "Anichin mirror",
    kind: "iframe",
    url: "https://anichin.my/embed/btth-episode-1",
    lang: "id",
    note: "Third-party embed; mount it in an iframe.",
    playable: true,
  },
  {
    id: "gdrive",
    label: "Google Drive",
    kind: "external",
    url: "https://drive.google.com/file/d/1ExampleFileId/view",
    note: "Opens on the upstream site.",
    playable: true,
  },
];

const SUBTITLES = [
  {
    label: "Indonesian",
    lang: "id",
    url: sub("https://rajadonghua.com/wp-content/uploads/subs/btth-ep01.srt"),
  },
];

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

const sourceParam: ParamSpec = {
  name: "source",
  in: "path",
  required: true,
  type: "SourceId",
  desc: "Catalog to read from. One of the five ids listed under Sources.",
  example: "rajadonghua",
  values: SOURCE_IDS,
};

const slugParam: ParamSpec = {
  name: "slug",
  in: "path",
  required: true,
  type: "string",
  desc: "Series slug exactly as returned in `Card.slug` / `Anime.slug`.",
  example: "battle-through-the-heavens",
};

export const ENDPOINTS: EndpointSpec[] = [
  {
    id: "health",
    group: "discovery",
    title: "Health",
    method: "GET",
    path: "/api/health",
    summary: "Liveness probe with the registered source ids.",
    description:
      "Returns the service name, every registered source id and a server timestamp. Cheap to call; use it to confirm the API is awake before a batch of requests.",
    params: [],
    response: {
      kind: "json",
      value: {
        ok: true,
        service: "onyxchin-api",
        sources: SOURCE_IDS,
        ts: 1761300000000,
      },
    },
    notes: [
      "`ts` is milliseconds since the Unix epoch, generated per request.",
      "The `sources` array always mirrors the registry, in registration order.",
    ],
  },
  {
    id: "sources",
    group: "discovery",
    title: "Sources",
    method: "GET",
    path: "/api/sources",
    summary: "List every source adapter and its upstream base URL.",
    description:
      "Metadata only — no scraping. Each entry carries the id you pass as `:source`, a display name, the upstream base URL and the catalog language.",
    params: [],
    response: {
      kind: "json",
      value: {
        data: SOURCES.map((s) => ({
          id: s.id,
          name: s.name,
          baseUrl: s.baseUrl,
          lang: s.lang,
        })),
      },
    },
  },
  {
    id: "home",
    group: "catalog",
    title: "Home",
    method: "GET",
    path: "/api/:source/home",
    summary: "Hero picks plus curated sections for one source.",
    description:
      "Returns a normalized home page: a `hero` list for the top row and named `sections`. Sections are ordered upstream-first; `href` is present when the section maps to a list query.",
    params: [sourceParam],
    response: {
      kind: "json",
      value: {
        data: {
          hero: [CARD_BTTH, CARD_DOULUO],
          sections: [
            { title: "Latest Episodes", items: [CARD_BTTH, CARD_PERFECT] },
            {
              title: "Popular This Week",
              items: [CARD_DOULUO, CARD_BTTH],
              href: "/api/rajadonghua/list?order=popular",
            },
          ],
        },
      },
    },
    notes: [
      "`poster` may be a relative `/api/img?url=…` path or an absolute public image URL. Resolve relative values against the API base.",
      "`href` is API-relative when present; pass it through the same origin.",
    ],
    errors: [
      { status: "404", meaning: "`source` is not one of the five ids." },
      { status: "502", meaning: "Upstream site failed; the body carries the reason." },
    ],
  },
  {
    id: "list",
    group: "catalog",
    title: "List",
    method: "GET",
    path: "/api/:source/list",
    summary: "Paginated catalog with optional genre, status and order filters.",
    description:
      "Page-oriented listing. Filters are passed through to the upstream site and may be ignored by sources that do not expose them; the response always reports the page that was actually served.",
    params: [
      sourceParam,
      {
        name: "page",
        in: "query",
        required: false,
        type: "number",
        desc: "1-based page number. Defaults to `1` when omitted or not numeric.",
        example: "1",
        placeholder: "1",
      },
      {
        name: "genre",
        in: "query",
        required: false,
        type: "string",
        desc: "Upstream genre slug, for example `action`. Empty means unfiltered.",
        example: "",
        placeholder: "action",
      },
      {
        name: "status",
        in: "query",
        required: false,
        type: "string",
        desc: "Release status understood by the source, for example `ongoing` or `completed`.",
        example: "",
        placeholder: "ongoing",
      },
      {
        name: "order",
        in: "query",
        required: false,
        type: "string",
        desc: "Sort order understood by the source, for example `latest` or `popular`.",
        example: "",
        placeholder: "latest",
      },
    ],
    response: {
      kind: "json",
      value: {
        data: {
          items: [CARD_BTTH, CARD_DOULUO, CARD_PERFECT],
          page: 1,
          hasNext: true,
          totalPages: 42,
        },
      },
    },
    notes: [
      "`hasNext` is the only pagination field you must honour; `totalPages` is optional and can be absent.",
      "Filter names are source-specific. A filter the source does not implement may be ignored.",
    ],
  },
  {
    id: "search",
    group: "catalog",
    title: "Search",
    method: "GET",
    path: "/api/:source/search",
    summary: "Title search returning lightweight cards.",
    description:
      "Queries the upstream search endpoint and normalizes hits into `Card` objects. An empty or whitespace-only `q` short-circuits to an empty list — no upstream request is made.",
    params: [
      sourceParam,
      {
        name: "q",
        in: "query",
        required: true,
        type: "string",
        desc: "Free-text query. Trimmed; empty queries return `{ data: [] }`.",
        example: "battle through the heavens",
        placeholder: "title",
      },
    ],
    response: {
      kind: "json",
      value: {
        data: [CARD_BTTH, CARD_DOULUO],
      },
    },
    notes: [
      "Results are not paginated; take the first page the upstream returns.",
      "Diacritics and CJK characters are passed through as-is — encode `q` with `encodeURIComponent`.",
    ],
  },
  {
    id: "detail",
    group: "catalog",
    title: "Series detail",
    method: "GET",
    path: "/api/:source/anime/:slug",
    summary: "Full metadata, episode index and related series.",
    description:
      "One request per series page. `episodes` is ordered by `number`; `related` is best-effort and may be omitted.",
    params: [sourceParam, slugParam],
    response: {
      kind: "json",
      value: {
        data: {
          anime: ANIME_BTTH,
          episodes: [EPISODE_1, EPISODE_2, { number: 3, slug: "episode-3", title: "Episode 3" }],
          related: [CARD_DOULUO, CARD_PERFECT],
        },
      },
    },
    notes: [
      "`episodes[].slug` is the value to pass as `:ep` on `/watch`; numbers and slugs can differ.",
      "A series with an unknown slug surfaces as `502` with the upstream error, not `404`.",
    ],
    errors: [
      { status: "404", meaning: "Unknown `source` id." },
      { status: "502", meaning: "Upstream page missing or unparsable." },
    ],
  },
  {
    id: "watch",
    group: "catalog",
    title: "Watch",
    method: "GET",
    path: "/api/:source/watch/:slug/:ep",
    summary: "Resolved playback sources, subtitles and episode neighbours.",
    description:
      "Resolves one episode into playable entries. Direct MP4 and HLS are wrapped in the media proxy as relative `/api/media` and `/api/hls` URLs; iframe and external entries keep their raw upstream URL. Signed media URLs expire, so resolve again instead of caching `sources[].url`.",
    params: [
      sourceParam,
      slugParam,
      {
        name: "ep",
        in: "path",
        required: true,
        type: "string",
        desc: "Episode slug from `detail.episodes[].slug`. Numeric episode indexes work on sources that use them.",
        example: "episode-1",
        placeholder: "episode-1",
      },
    ],
    response: {
      kind: "json",
      value: {
        data: {
          anime: ANIME_BTTH,
          episode: EPISODE_1,
          sources: VIDEO_SOURCES,
          subtitles: SUBTITLES,
          prev: undefined,
          next: EPISODE_2,
        },
      },
    },
    notes: [
      "`playable: false` marks entries that resolved but cannot be embedded; skip them instead of guessing.",
      "`prev` / `next` are omitted on the first and last episode.",
      "Fetch this endpoint immediately before playback. Media signatures are short-lived.",
    ],
    errors: [
      { status: "404", meaning: "Unknown `source` id." },
      { status: "502", meaning: "Episode page failed or no source could be resolved." },
    ],
  },
  {
    id: "img",
    group: "proxy",
    title: "Image proxy",
    method: "GET",
    path: "/api/img",
    summary: "Fetch a poster from an allowlisted host with a valid referer.",
    description:
      "Streams an image with `Cache-Control: immutable` so CDNs and browsers keep it. Upstream hosts that block hotlinks are fetched with their own origin as referer. Only allowlisted hostnames are accepted.",
    params: [
      {
        name: "url",
        in: "query",
        required: true,
        type: "string (encoded)",
        desc: "Absolute image URL. Encode it with `encodeURIComponent`.",
        example: "https://rajadonghua.com/wp-content/uploads/2018/09/btth.jpg",
        placeholder: "https://…/poster.jpg",
      },
    ],
    response: {
      kind: "headers",
      statusLine: "HTTP/2 200",
      binary: "image",
      summary: "Image bytes, content type taken from upstream.",
      headers: [
        ["content-type", "image/jpeg"],
        ["cache-control", "public, max-age=604800, immutable"],
        ["access-control-allow-origin", "*"],
      ],
    },
    notes: [
      "Allowlist: rajadonghua.com, anichin.my, animexin.dev, donghuaworld.com, donghuaworld.in, wsrv.nl, i0–i3.wp.com, i.ibb.co, i.ibb.co.com, iili.io, i.postimg.cc, img.youtube.com, cdn.myanimelist.net.",
      "Public hosts (wsrv.nl, i.ibb.co, iili.io, i.postimg.cc) can be used directly, without the proxy.",
      "`403 host not allowed` means the URL is outside the allowlist — proxy it yourself or pick the upstream image.",
    ],
    errors: [
      { status: "400", meaning: "Missing `url`." },
      { status: "403", meaning: "Host not allowlisted." },
      { status: "502", meaning: "Upstream image fetch failed." },
    ],
  },
  {
    id: "media",
    group: "proxy",
    title: "Media proxy",
    method: "GET",
    path: "/api/media",
    summary: "Range-aware MP4 streaming with the upstream referer.",
    description:
      "Pass-through for direct media. Forwards your `Range` header and returns the upstream status (including `206`), so `<video>` seeking works. Responses expose `Content-Range` and `Accept-Ranges`.",
    params: [
      {
        name: "u",
        in: "query",
        required: true,
        type: "string (encoded)",
        desc: "Absolute media URL. Encode it with `encodeURIComponent`.",
        example: "https://rajadonghua.com/wp-content/uploads/video/btth-ep01-1080p.mp4",
        placeholder: "https://…/episode.mp4",
      },
      {
        name: "ref",
        in: "query",
        required: false,
        type: "string (encoded)",
        desc: "Referer sent upstream. Defaults to the media URL's origin.",
        example: "https://rajadonghua.com/",
        placeholder: "https://…/",
      },
    ],
    response: {
      kind: "headers",
      statusLine: "HTTP/2 206",
      binary: "video",
      summary: "Media bytes. Status mirrors upstream: 200 full body, 206 partial.",
      headers: [
        ["content-type", "video/mp4"],
        ["content-length", "1048576"],
        ["content-range", "bytes 0-1048575/187654321"],
        ["accept-ranges", "bytes"],
        ["cache-control", "public, max-age=3600"],
        ["access-control-allow-origin", "*"],
      ],
    },
    notes: [
      "Generic upstream content types are corrected from the file extension, so `.mp4`, `.ts`, `.vtt` and `.srt` arrive with usable types.",
      "Send `Range: bytes=0-` when you need to seek; without it the proxy streams the whole file.",
      "Signed URLs expire — rebuild them through `/watch` rather than storing them.",
    ],
    errors: [
      { status: "400", meaning: "Missing `u`." },
      { status: "403", meaning: "Host not allowlisted." },
      { status: "502", meaning: "Upstream fetch failed or timed out." },
    ],
  },
  {
    id: "hls",
    group: "proxy",
    title: "HLS proxy",
    method: "GET",
    path: "/api/hls",
    summary: "Rewrite an m3u8 so every segment loads through the API.",
    description:
      "Fetches a playlist and rewrites every URI — variant streams, keys, init segments and media segments — to `/api/hls/seg?u=…`. Segment URLs are relative to the playlist, so resolve them against the API base. The playlist itself is returned unmodified apart from URIs.",
    params: [
      {
        name: "u",
        in: "query",
        required: true,
        type: "string (encoded)",
        desc: "Absolute m3u8 URL. Encode it with `encodeURIComponent`.",
        example: "https://anichin.my/stream/btth/episode-1/master.m3u8",
        placeholder: "https://…/master.m3u8",
      },
    ],
    response: {
      kind: "text",
      language: "m3u8",
      text: [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:10",
        '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Indonesian",LANGUAGE="id",URI="/api/hls/seg?u=https%3A%2F%2Fanichin.my%2Fsubs%2Fep01.vtt"',
        "#EXTINF:10.000,",
        "/api/hls/seg?u=https%3A%2F%2Fcdn.anichin.my%2Fhls%2Fbtth%2Fep01%2F0001.ts",
        "#EXTINF:10.000,",
        "/api/hls/seg?u=https%3A%2F%2Fcdn.anichin.my%2Fhls%2Fbtth%2Fep01%2F0002.ts",
      ].join("\n"),
    },
    notes: [
      "`content-type` is `application/vnd.apple.mpegurl` and the response is not cached.",
      "Segment requests go through the media proxy, so byte ranges and CORS behave the same as `/api/media`.",
      "Point hls.js `loadSource` at the proxied playlist URL, not the upstream one.",
    ],
    errors: [
      { status: "400", meaning: "Missing `u`." },
      { status: "403", meaning: "Host not allowlisted." },
      { status: "502", meaning: "Playlist fetch failed." },
    ],
  },
  {
    id: "sub",
    group: "proxy",
    title: "Subtitle proxy",
    method: "GET",
    path: "/api/sub",
    summary: "Convert SRT to WebVTT on the fly.",
    description:
      "Most upstream subtitles are SRT, which browsers do not play in `<track>`. This endpoint converts timestamps, strips the numeric cue index and returns `text/vtt`. Already-valid WebVTT is passed through after BOM and CRLF normalization.",
    params: [
      {
        name: "u",
        in: "query",
        required: true,
        type: "string (encoded)",
        desc: "Absolute subtitle URL (SRT or VTT). Encode it with `encodeURIComponent`.",
        example: "https://rajadonghua.com/wp-content/uploads/subs/btth-ep01.srt",
        placeholder: "https://…/episode.srt",
      },
    ],
    response: {
      kind: "text",
      language: "vtt",
      text: [
        "WEBVTT",
        "",
        "00:00:01.000 --> 00:00:04.000",
        "Selamat datang di OnyxChin.",
        "",
        "00:00:04.500 --> 00:00:08.000",
        "Episode ini tersedia dalam 1080p.",
      ].join("\n"),
    },
    notes: [
      "Use the returned URL directly as `track.src`; the content type is already correct.",
      "Cached for 24 hours at the edge and in the browser.",
      "UTF-8 upstream subtitles only. Other encodings will render as mojibake.",
    ],
    errors: [
      { status: "400", meaning: "Missing `u`." },
      { status: "403", meaning: "Host not allowlisted." },
      { status: "502", meaning: "Subtitle fetch failed." },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export interface QuickFact {
  label: string;
  value: string;
  mono?: boolean;
}

export const QUICK_FACTS: QuickFact[] = [
  { label: "Base URL", value: API_BASE, mono: true },
  { label: "Auth", value: "None — no key, no cookies" },
  { label: "Format", value: "JSON · UTF-8" },
  { label: "Methods", value: "GET only · OPTIONS preflight" },
  { label: "CORS", value: "Access-Control-Allow-Origin: *" },
];

export const ENVELOPE_ROWS: { shape: string; routes: string }[] = [
  { shape: "{ ok, service, sources, ts }", routes: "/api/health" },
  { shape: "{ data: SourceInfo[] }", routes: "/api/sources" },
  { shape: "{ data: HomePayload }", routes: "/api/:source/home" },
  { shape: "{ data: ListPayload }", routes: "/api/:source/list" },
  { shape: "{ data: Card[] }", routes: "/api/:source/search" },
  { shape: "{ data: DetailPayload }", routes: "/api/:source/anime/:slug" },
  { shape: "{ data: WatchPayload }", routes: "/api/:source/watch/:slug/:ep" },
  { shape: "{ error }", routes: "Any non-2xx response" },
];

export const ERROR_ROWS: { status: string; body: string; meaning: string }[] = [
  { status: "400", body: '{ "error": "missing u" }', meaning: "Required query parameter absent on a proxy route." },
  { status: "403", body: '{ "error": "host not allowed" }', meaning: "Proxy target is outside the allowlist." },
  { status: "404", body: '{ "error": "unknown source" }', meaning: "`:source` is not one of the five ids." },
  { status: "502", body: '{ "error": "…" }', meaning: "Upstream source failed, changed markup, or timed out." },
];

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

export interface FieldSpec {
  name: string;
  type: string;
  required: boolean;
  desc: string;
}

export interface SchemaSpec {
  id: string;
  name: string;
  summary: string;
  fields?: FieldSpec[];
  code: string;
  notes?: string[];
}

export const SCHEMAS: SchemaSpec[] = [
  {
    id: "card",
    name: "Card",
    summary: "Compact catalog entry used by home, list and search.",
    fields: [
      { name: "id", type: "string", required: true, desc: "Stable identifier inside the source." },
      { name: "slug", type: "string", required: true, desc: "Path segment for detail and watch routes." },
      { name: "title", type: "string", required: true, desc: "Display title, upstream language preserved." },
      { name: "poster", type: "string | null", required: true, desc: "Relative `/api/img?…` or absolute public URL." },
      { name: "type", type: "string", required: false, desc: "Series / movie / donghua label as published." },
      { name: "status", type: "string", required: false, desc: "Release status, free text." },
      { name: "year", type: "number", required: false, desc: "First release year." },
      { name: "rating", type: "number", required: false, desc: "Upstream score when one exists." },
      { name: "episodes", type: "number", required: false, desc: "Known episode count at scrape time." },
      { name: "genres", type: "string[]", required: false, desc: "Genre labels, source language." },
    ],
    code: `interface Card {
  id: string;
  slug: string;
  title: string;
  poster: string | null;
  type?: string;
  status?: string;
  year?: number;
  rating?: number;
  episodes?: number;
  genres?: string[];
}`,
  },
  {
    id: "anime",
    name: "Anime",
    summary: "Full metadata, superset of Card plus description fields.",
    fields: [
      { name: "id", type: "string", required: true, desc: "Stable identifier inside the source." },
      { name: "slug", type: "string", required: true, desc: "Slug used by detail and watch routes." },
      { name: "title", type: "string", required: true, desc: "Primary title." },
      { name: "altTitles", type: "string[]", required: false, desc: "Native and romanized alternates." },
      { name: "synopsis", type: "string", required: false, desc: "Plain-text description." },
      { name: "poster", type: "string | null", required: true, desc: "Portrait artwork URL or null." },
      { name: "banner", type: "string | null", required: false, desc: "Wide artwork when upstream has one." },
      { name: "type", type: "string", required: false, desc: "Series / movie / donghua label." },
      { name: "status", type: "string", required: false, desc: "Release status." },
      { name: "year", type: "number", required: false, desc: "First release year." },
      { name: "rating", type: "number", required: false, desc: "Upstream score." },
      { name: "genres", type: "string[]", required: false, desc: "Genre labels." },
      { name: "studio", type: "string", required: false, desc: "Animation studio when listed." },
      { name: "totalEpisodes", type: "number", required: false, desc: "Planned or known total." },
      { name: "sourceId", type: "SourceId", required: true, desc: "Adapter that produced the record." },
    ],
    code: `interface Anime {
  id: string;
  slug: string;
  title: string;
  altTitles?: string[];
  synopsis?: string;
  poster: string | null;
  banner?: string | null;
  type?: string;
  status?: string;
  year?: number;
  rating?: number;
  genres?: string[];
  studio?: string;
  totalEpisodes?: number;
  sourceId: SourceId;
}`,
  },
  {
    id: "episode",
    name: "Episode",
    summary: "One entry in a series episode index.",
    fields: [
      { name: "number", type: "number", required: true, desc: "Episode number, sort key." },
      { name: "slug", type: "string", required: true, desc: "Value to pass as `:ep` on watch." },
      { name: "title", type: "string", required: false, desc: "Episode title when published." },
      { name: "releasedAt", type: "string", required: false, desc: "ISO date from upstream, when exposed." },
    ],
    code: `interface Episode {
  number: number;
  slug: string;
  title?: string;
  releasedAt?: string;
}`,
  },
  {
    id: "video-source",
    name: "VideoSource",
    summary: "One playable (or explicitly unplayable) stream entry.",
    fields: [
      { name: "id", type: "string", required: true, desc: "Stable id inside the episode." },
      { name: "label", type: "string", required: true, desc: "Human label, for example the mirror name." },
      { name: "kind", type: '"direct" | "hls" | "iframe" | "external"', required: true, desc: "How to consume `url`." },
      { name: "url", type: "string", required: true, desc: "Relative proxy URL or absolute upstream URL." },
      { name: "quality", type: "string", required: false, desc: "Quality tag, for example `1080p`." },
      { name: "lang", type: "string", required: false, desc: "Audio / subtitle language tag." },
      { name: "note", type: "string", required: false, desc: "Caveat from the adapter." },
      { name: "playable", type: "boolean", required: true, desc: "False when the entry resolved but cannot play." },
    ],
    notes: [
      "`direct` — progressive MP4 through `/api/media`; feed it to `<video src>`.",
      "`hls` — playlist through `/api/hls`; feed it to hls.js or Safari.",
      "`iframe` — embed the absolute URL in an `<iframe>`.",
      "`external` — send the user to the upstream page; do not embed.",
    ],
    code: `type SourceKind = "direct" | "hls" | "iframe" | "external";

interface VideoSource {
  id: string;
  label: string;
  kind: SourceKind;
  url: string;
  quality?: string;
  lang?: string;
  note?: string;
  playable: boolean;
}`,
  },
  {
    id: "subtitle",
    name: "SubtitleTrack",
    summary: "WebVTT track, already converted by the subtitle proxy.",
    fields: [
      { name: "label", type: "string", required: true, desc: "Display name for a track picker." },
      { name: "lang", type: "string", required: true, desc: "BCP-47-ish language tag." },
      { name: "url", type: "string", required: true, desc: "Relative `/api/sub?u=…` WebVTT URL." },
    ],
    code: `interface SubtitleTrack {
  label: string;
  lang: string;
  url: string;
}`,
  },
  {
    id: "payloads",
    name: "Payload envelopes",
    summary: "What each catalog route puts inside `data`.",
    fields: [
      { name: "HomePayload.hero", type: "Card[]", required: true, desc: "Top-row spotlight entries." },
      { name: "HomePayload.sections", type: "{ title; items; href? }[]", required: true, desc: "Ordered rows with optional list link." },
      { name: "ListPayload.items", type: "Card[]", required: true, desc: "Current page." },
      { name: "ListPayload.page", type: "number", required: true, desc: "Page actually served." },
      { name: "ListPayload.hasNext", type: "boolean", required: true, desc: "Whether another page exists." },
      { name: "ListPayload.totalPages", type: "number", required: false, desc: "Total when upstream reports it." },
      { name: "DetailPayload.anime", type: "Anime", required: true, desc: "Series metadata." },
      { name: "DetailPayload.episodes", type: "Episode[]", required: true, desc: "Episode index, ascending." },
      { name: "DetailPayload.related", type: "Card[]", required: false, desc: "Best-effort related titles." },
      { name: "WatchPayload.anime", type: "Anime", required: true, desc: "Series metadata." },
      { name: "WatchPayload.episode", type: "Episode", required: true, desc: "Episode being watched." },
      { name: "WatchPayload.sources", type: "VideoSource[]", required: true, desc: "Resolved playback entries." },
      { name: "WatchPayload.subtitles", type: "SubtitleTrack[]", required: true, desc: "Playable subtitle tracks." },
      { name: "WatchPayload.prev / next", type: "Episode?", required: false, desc: "Neighbouring episodes." },
    ],
    code: `interface HomePayload {
  hero: Card[];
  sections: { title: string; items: Card[]; href?: string }[];
}

interface ListPayload {
  items: Card[];
  page: number;
  hasNext: boolean;
  totalPages?: number;
}

interface DetailPayload {
  anime: Anime;
  episodes: Episode[];
  related?: Card[];
}

interface WatchPayload {
  anime: Anime;
  episode: Episode;
  sources: VideoSource[];
  subtitles: SubtitleTrack[];
  prev?: Episode;
  next?: Episode;
}`,
  },
  {
    id: "adapter",
    name: "SourceAdapter",
    summary: "Contract every source implementation satisfies on the server.",
    fields: [
      { name: "home()", type: "Promise<HomePayload>", required: true, desc: "Spotlight and curated rows." },
      { name: "list(params)", type: "Promise<ListPayload>", required: true, desc: "Paged catalog; `params` is `{ page, genre?, status?, order? }`." },
      { name: "search(query)", type: "Promise<Card[]>", required: true, desc: "Title search, no pagination." },
      { name: "detail(slug)", type: "Promise<DetailPayload>", required: true, desc: "Metadata plus episode index." },
      { name: "watch(slug, episode)", type: "Promise<WatchPayload>", required: true, desc: "Resolve playback for one episode." },
    ],
    code: `interface SourceAdapter {
  id: SourceId;
  name: string;
  baseUrl: string;
  lang: string;
  home(): Promise<HomePayload>;
  list(params: {
    page: number;
    genre?: string;
    status?: string;
    order?: string;
  }): Promise<ListPayload>;
  search(query: string): Promise<Card[]>;
  detail(slug: string): Promise<DetailPayload>;
  watch(slug: string, episode: string): Promise<WatchPayload>;
}`,
  },
];

/* ------------------------------------------------------------------ */
/* Operational notes                                                   */
/* ------------------------------------------------------------------ */

export interface NoteSpec {
  title: string;
  body: string;
}

export const NOTES: NoteSpec[] = [
  {
    title: "CORS is open",
    body: "Every route answers with `Access-Control-Allow-Origin: *` and preflight is cached for 24 hours. Browser `fetch` works directly against the base URL; no proxy of your own is required.",
  },
  {
    title: "No authentication",
    body: "There are no API keys, cookies or signed requests. Every route is a plain `GET`. Do not ship credentials to this API — there is nothing to protect.",
  },
  {
    title: "Rate-limit friendly",
    body: "The API is a scrape cache in front of five upstream sites, so be gentle: cache catalog responses, reuse one request for a grid, and back off with a delay when a source answers `502`.",
  },
  {
    title: "Resolve URLs against the base",
    body: "Media, subtitle and hotlink-protected poster values may be relative `/api/…` paths. Prefix them with the base URL before using them. Absolute iframe/external URLs are used as-is.",
  },
  {
    title: "Signed media URLs are short-lived",
    body: "Direct MP4 and HLS links carry upstream signatures. Never persist `sources[].url` or `subtitles[].url`; call `/watch` again right before playback instead.",
  },
  {
    title: "Images are proxied only when needed",
    body: "Posters on hotlink-protected hosts are returned as `/api/img?url=…`. Public hosts such as wsrv.nl, i.ibb.co, iili.io and i.postimg.cc are returned as absolute URLs and can be loaded directly.",
  },
  {
    title: "Upstream failures are 502",
    body: "A `502` is the upstream source failing — not a malformed request. Retry later, or fall back to another source id for the same title.",
  },
  {
    title: "Cold starts",
    body: "The demo API runs on a free plan. The first request after an idle period can take tens of seconds; `GET /api/health` is the cheapest way to wake it.",
  },
];

/* ------------------------------------------------------------------ */
/* Hero copy                                                           */
/* ------------------------------------------------------------------ */

export const HERO = {
  eyebrow: "API reference",
  title: "OnyxChin API",
  lede: "Five donghua catalogs behind one normalized JSON contract. Home, list, search, detail and watch resolve to the same shapes; media, images, HLS playlists and subtitles come back through the same origin.",
  version: API_VERSION,
};
