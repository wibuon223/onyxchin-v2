/**
 * Dailymotion resolver.
 *
 * Two facts learned the hard way (2026-10-24):
 *  1. `/player/metadata/video/<id>` answers 200 to a plain server-side fetch and
 *     exposes the signed HLS manifest even when the video is `private: true`,
 *     i.e. domain-locked for embeds.
 *  2. The DM CDN (Fastly) rejects non-browser TLS with 403 — so the manifest and
 *     every segment must be fetched through the curl_cffi relay.
 *
 * This module only resolves the manifest; playback goes through /api/hls, which
 * forwards DM hosts to the relay.
 */
import { fetchJson } from "./http.js";
import type { VideoSource } from "@onyxchin/shared";

export interface DmResolved {
  id: string;
  title: string;
  duration: number;
  private: boolean;
  manifest: string;
  referer: string;
}

const CACHE_TTL = 10 * 60_000;
const cache = new Map<string, { value: DmResolved | null; expires: number }>();

export function dailymotionId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.endsWith("dai.ly")) return u.pathname.split("/").filter(Boolean)[0] ?? null;
    if (!host.endsWith("dailymotion.com")) return null;
    const fromQuery = u.searchParams.get("video");
    if (fromQuery) return fromQuery;
    const m = /\/(?:embed\/)?video\/([A-Za-z0-9]+)/.exec(u.pathname);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}


/**
 * Dailymotion binds the signed manifest token to the requesting IP. Metadata and
 * media must therefore leave from the SAME egress, so both ride the dm relay
 * (residential) whenever it is configured. Fetching metadata directly from the
 * datacenter here yields manifests that 403 when the relay asks for them.
 */
async function fetchMetadata(id: string): Promise<DmMetadata> {
  const relay = process.env.ONYX_DM_RELAY;
  if (!relay) {
    return fetchJson<DmMetadata>(`https://www.dailymotion.com/player/metadata/video/${id}`, {
      referer: "https://www.dailymotion.com/",
      headers: { origin: "https://www.dailymotion.com" },
      timeoutMs: 15_000,
    });
  }
  const target = `https://www.dailymotion.com/player/metadata/video/${id}`;
  const url = `${relay.replace(/\/$/, "")}/fetch?u=${encodeURIComponent(target)}&ref=${encodeURIComponent("https://www.dailymotion.com/")}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.ONYX_DM_RELAY_TOKEN) headers["x-relay-token"] = process.env.ONYX_DM_RELAY_TOKEN;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`dm metadata ${res.status}`);
  return (await res.json()) as DmMetadata;
}

interface DmMetadata {
  id?: string;
  title?: string;
  duration?: number;
  private?: boolean;
  qualities?: { auto?: { type?: string; url?: string }[] };
}

export async function resolveDailymotion(url: string): Promise<DmResolved | null> {
  const id = dailymotionId(url);
  if (!id) return null;

  const hit = cache.get(id);
  if (hit && hit.expires > Date.now()) return hit.value;

  try {
    const meta = await fetchMetadata(id);
    const manifest = meta.qualities?.auto?.find((q) => q.url)?.url ?? null;
    const value: DmResolved | null = manifest
      ? {
          id,
          title: meta.title ?? "",
          duration: meta.duration ?? 0,
          private: Boolean(meta.private),
          manifest,
          referer: "https://geo.dailymotion.com/",
        }
      : null;
    cache.set(id, { value, expires: Date.now() + CACHE_TTL });
    return value;
  } catch {
    cache.set(id, { value: null, expires: Date.now() + 60_000 });
    return null;
  }
}

/** Wrap a DM URL in our relay-backed proxies so the browser never talks to the CDN. */
export function dmHlsUrl(manifest: string, referer: string): string {
  return `/api/hls?u=${encodeURIComponent(manifest)}&dm=1&ref=${encodeURIComponent(referer)}`;
}

/**
 * Replace a Dailymotion iframe mirror with a relay-backed HLS source, keeping the
 * original iframe as an unplayable fallback. Playable sources sort first so the
 * web player auto-selects something that actually works.
 */
export async function upgradeDailymotionSources(sources: VideoSource[]): Promise<VideoSource[]> {
  const out: VideoSource[] = [];
  await Promise.all(
    sources.map(async (source) => {
      if (source.kind !== "iframe" || !/dailymotion\.com/i.test(source.url)) {
        out.push(source);
        return;
      }
      const resolved = await resolveDailymotion(source.url);
      if (resolved) {
        out.push({
          id: `${source.id}-hls`,
          label: source.label.replace(/\s*\[Ads\]/i, "") || "Dailymotion",
          kind: "hls",
          url: dmHlsUrl(resolved.manifest, resolved.referer),
          quality: "auto",
          playable: true,
          note: "HLS via relay",
        });
      }
      out.push({ ...source, playable: false, note: source.note ?? "domain-locked" });
    })
  );
  return out.sort((a, b) => Number(b.playable) - Number(a.playable));
}
