/** Lightweight key/value preferences: active source + recent searches. */

const SOURCE_KEY = "onyxchin:source";
const RECENT_KEY = "onyxchin:recent-searches";
const RECENT_LIMIT = 6;

let storageProbe: Storage | null | undefined;

/** Safari private mode and hardened browsers throw on localStorage access. */
function store(): Storage | null {
  if (storageProbe !== undefined) return storageProbe;
  try {
    const candidate = window.localStorage;
    const probe = "__onyxchin_probe__";
    candidate.setItem(probe, "1");
    candidate.removeItem(probe);
    storageProbe = candidate;
  } catch {
    storageProbe = null;
  }
  return storageProbe;
}

export function readSourcePref(): string | null {
  try {
    const value = store()?.getItem(SOURCE_KEY)?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

export function writeSourcePref(id: string): void {
  try {
    store()?.setItem(SOURCE_KEY, id);
  } catch {
    /* preference is best-effort */
  }
}

export function readRecentSearches(): string[] {
  try {
    const raw = store()?.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function pushRecentSearch(query: string): string[] {
  const clean = query.trim();
  if (!clean) return readRecentSearches();
  const next = [clean, ...readRecentSearches().filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(
    0,
    RECENT_LIMIT,
  );
  try {
    store()?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* best-effort */
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    store()?.removeItem(RECENT_KEY);
  } catch {
    /* best-effort */
  }
}

const VOLUME_KEY = "onyxchin:volume";

export function readVolume(): number {
  try {
    const raw = store()?.getItem(VOLUME_KEY);
    if (raw == null) return 0.8;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.8;
  } catch {
    return 0.8;
  }
}

export function writeVolume(volume: number): void {
  try {
    store()?.setItem(VOLUME_KEY, String(Math.max(0, Math.min(1, volume))));
  } catch {
    /* best-effort */
  }
}
