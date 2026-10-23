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
   Transport: 60s in-memory cache + in-flight de-dupe + per-caller abort
   -------------------------------------------------------------------------- */

const CACHE_TTL = 60_000;
const CACHE_LIMIT = 120;
const DEFAULT_TIMEOUT = 30_000;

interface CacheEntry {
  at: number;
  data: unknown;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function remember(key: string, data: unknown): void {
  cache.delete(key);
  cache.set(key, { at: Date.now(), data });
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException("Permintaan dibatalkan.", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
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
  });
}

async function getJson<T>(
  path: string,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<T> {
  const key = path;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return withAbort(Promise.resolve(hit.data as T), signal);
  }

  let pending = inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const url = `${API_BASE}${path}`;
      try {
        const response = await fetch(url, {
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
          throw new ApiError(
            humanize(response.status, extractDetail(payload)),
            response.status,
            extractDetail(payload),
          );
        }
        if (!payload || typeof payload !== "object" || !("data" in payload)) {
          throw new ApiError("Balasan API tidak dikenali.", response.status);
        }
        const data = (payload as { data: unknown }).data;
        remember(key, data);
        return data as T;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (controller.signal.aborted) {
          throw new ApiError("Permintaan melewati batas waktu. Coba lagi.", 0);
        }
        throw new ApiError(
          "Tidak bisa menghubungi API. Periksa koneksi lalu coba lagi.",
          0,
        );
      } finally {
        clearTimeout(timer);
        inflight.delete(key);
      }
    })();
    inflight.set(key, pending);
  }

  return withAbort(pending, signal);
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
