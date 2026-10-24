import type {
  Card,
  DetailPayload,
  HomePayload,
  ListPayload,
  WatchPayload,
} from "@onyxchin/shared";

/* --------------------------------------------------------------------------
   Base URL resolution
   - VITE_API_BASE wins (set on Render).
   - Dev falls through to the local API (8891).
   - Production falls back to the deployed API.
   -------------------------------------------------------------------------- */

const PROD_BASE = "https://onyxchin-api.onrender.com";
const DEV_BASE = "http://localhost:8891";

export const API_BASE: string = (() => {
  const fromEnv = import.meta.env.VITE_API_BASE?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return import.meta.env.DEV ? DEV_BASE : PROD_BASE;
})();

/**
 * Adapters return API-relative URLs for anything that must travel through a
 * proxy (`/api/img`, `/api/media`, `/api/hls`, `/api/sub`). Absolute URLs are
 * already publicly loadable and stay untouched. Never bake the host elsewhere.
 */
export function resolveUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return url;
  if (url.startsWith("/api/")) return `${API_BASE}${url}`;
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

/** Second-chance URL for posters whose upstream host refuses hotlinking. */
export function imageFallbackUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("/api/")) return null;
  const resolved = resolveUrl(trimmed);
  if (!/^https?:\/\//i.test(resolved)) return null;
  return `${API_BASE}/api/img?url=${encodeURIComponent(resolved)}`;
}

/* --------------------------------------------------------------------------
   Errors
   -------------------------------------------------------------------------- */

export class ApiError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(message: string, status = 0, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function humanize(status: number, rawDetail?: string): string {
  const detail = rawDetail?.replace(/^Error:\s*/i, "").trim().slice(0, 180);
  if (detail) {
    if (/not implemented/i.test(detail)) {
      return "Sumber ini belum menyediakan data untuk judul tersebut.";
    }
    return detail;
  }
  if (status === 404) return "Sumber atau judul tidak ditemukan.";
  if (status === 429) return "API sedang membatasi permintaan. Coba lagi sebentar.";
  if (status >= 500) return "Sumber sedang bermasalah. Coba lagi.";
  return `Permintaan ditolak API (${status}).`;
}

function extractDetail(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const body = payload as Record<string, unknown>;
  const err = body.error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  if (typeof body.message === "string") return body.message;
  return undefined;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Terjadi kesalahan yang tidak terduga.";
}

/* --------------------------------------------------------------------------
   Transport: memory → localStorage → network, with stale-while-revalidate.

   Server TTLs (apps/api): home 5m · list 3m · search 5m · detail 10m.
   The browser keeps the same payloads on disk so a reload paints instantly and
   a stale entry is returned right away while a fresh copy loads in background.
   -------------------------------------------------------------------------- */

const CACHE_LIMIT = 120;
const DEFAULT_TIMEOUT = 30_000;
const STORE_PREFIX = "onyxchin:api:";
const STORE_MAX_ENTRIES = 40;
const STORE_MAX_BYTES = 180_000;
const STORE_HARD_TTL = 24 * 60 * 60_000;

/** Matches the TTL the API uses, so the browser never re-asks while fresh. */
function ttlFor(path: string): number {
  if (/^\/api\/[^/]+\/home/.test(path)) return 300_000;
  if (/^\/api\/[^/]+\/list/.test(path)) return 180_000;
  if (/^\/api\/[^/]+\/search/.test(path)) return 300_000;
  if (/^\/api\/[^/]+\/anime\//.test(path)) return 600_000;
  if (path === "/api/sources") return 600_000;
  return 60_000;
}

interface StoredEntry {
  at: number;
  data: unknown;
}

function readStore(key: string): StoredEntry | null {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEntry;
    if (!parsed?.at || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > STORE_HARD_TTL) {
      localStorage.removeItem(STORE_PREFIX + key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStore(key: string, data: unknown): void {
  try {
    const body = JSON.stringify({ at: Date.now(), data });
    if (body.length > STORE_MAX_BYTES) return;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const name = localStorage.key(i);
      if (name?.startsWith(STORE_PREFIX)) keys.push(name);
    }
    if (keys.length >= STORE_MAX_ENTRIES) {
      const oldest = keys
        .map((name) => ({ name, at: (readStore(name.slice(STORE_PREFIX.length))?.at ?? 0) }))
        .sort((a, b) => a.at - b.at)[0];
      if (oldest) localStorage.removeItem(oldest.name);
    }
    localStorage.setItem(STORE_PREFIX + key, body);
  } catch {
    /* storage full or unavailable — memory cache still works */
  }
}

interface CacheEntry {
  at: number;
  data: unknown;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function remember(key: string, data: unknown, at = Date.now()): void {
  cache.delete(key);
  cache.set(key, { at, data });
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

function isFresh(key: string, at: number): boolean {
  return Date.now() - at < ttlFor(key);
}


/** Promise.withResolvers with a fallback for older Safari. */
function defer<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  if (typeof Promise.withResolvers === "function") return Promise.withResolvers<T>();
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException("Permintaan dibatalkan.", "AbortError"));
  }
  const { promise: guarded, resolve, reject } = defer<T>();
  const onAbort = () => reject(new DOMException("Permintaan dibatalkan.", "AbortError"));
  signal.addEventListener("abort", onAbort, { once: true });
  promise.then(
    (value) => {
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    },
    (error: unknown) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    },
  );
  return guarded;
}

/** Network fetch only — no cache reads, so refreshes cannot recurse. */
async function fetchNetwork<T>(path: string, signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
    if (!response.ok) {
      throw new ApiError(humanize(response.status, extractDetail(payload)), response.status, extractDetail(payload));
    }
    if (!payload || typeof payload !== "object" || !("data" in payload)) {
      throw new ApiError("Balasan API tidak dikenali.", response.status);
    }
    const data = (payload as { data: unknown }).data;
    remember(path, data);
    writeStore(path, data);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError("Permintaan melewati batas waktu. Coba lagi.", 0);
    }
    throw new ApiError("Tidak bisa menghubungi API. Periksa koneksi lalu coba lagi.", 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}

/** Single-flight network call shared by foreground reads and background refreshes. */
function request<T>(path: string, signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT): Promise<T> {
  let pending = inflight.get(path) as Promise<T> | undefined;
  if (!pending) {
    pending = fetchNetwork<T>(path, undefined, timeoutMs).finally(() => inflight.delete(path));
    inflight.set(path, pending);
  }
  return withAbort(pending, signal);
}

async function getJson<T>(path: string, signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT): Promise<T> {
  const memory = cache.get(path);
  if (memory && isFresh(path, memory.at)) {
    return withAbort(Promise.resolve(memory.data as T), signal);
  }

  const stored = readStore(path);
  if (stored) {
    remember(path, stored.data, stored.at);
    if (isFresh(path, stored.at)) {
      return withAbort(Promise.resolve(stored.data as T), signal);
    }
    // Stale: paint immediately, revalidate in background for the next page.
    void request<T>(path, undefined, timeoutMs).catch(() => undefined);
    return withAbort(Promise.resolve(stored.data as T), signal);
  }

  return request<T>(path, signal, timeoutMs);
}

/* --------------------------------------------------------------------------
   Endpoints
   -------------------------------------------------------------------------- */

export interface SourceInfo {
  id: string;
  name: string;
  baseUrl: string;
  lang: string;
}

export function getSources(signal?: AbortSignal): Promise<SourceInfo[]> {
  return getJson<SourceInfo[]>("/api/sources", signal);
}

export function getHome(source: string, signal?: AbortSignal): Promise<HomePayload> {
  return getJson<HomePayload>(`/api/${encodeURIComponent(source)}/home`, signal);
}

export interface ListParams {
  page?: number;
  genre?: string;
  status?: string;
  order?: string;
}

export function getList(
  source: string,
  params: ListParams = {},
  signal?: AbortSignal,
): Promise<ListPayload> {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  if (params.genre) query.set("genre", params.genre);
  if (params.status) query.set("status", params.status);
  if (params.order) query.set("order", params.order);
  return getJson<ListPayload>(
    `/api/${encodeURIComponent(source)}/list?${query.toString()}`,
    signal,
  );
}

export function searchTitles(
  source: string,
  query: string,
  signal?: AbortSignal,
): Promise<Card[]> {
  return getJson<Card[]>(
    `/api/${encodeURIComponent(source)}/search?q=${encodeURIComponent(query)}`,
    signal,
  );
}

export function getDetail(
  source: string,
  slug: string,
  signal?: AbortSignal,
): Promise<DetailPayload> {
  return getJson<DetailPayload>(
    `/api/${encodeURIComponent(source)}/anime/${encodeURIComponent(slug)}`,
    signal,
  );
}

export function getWatch(
  source: string,
  slug: string,
  episode: string,
  signal?: AbortSignal,
): Promise<WatchPayload> {
  return getJson<WatchPayload>(
    `/api/${encodeURIComponent(source)}/watch/${encodeURIComponent(slug)}/${encodeURIComponent(episode)}`,
    signal,
    45_000,
  );
}
