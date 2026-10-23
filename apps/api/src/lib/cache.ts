/**
 * Tiny TTL cache. Render free instances are small and upstream sites are slow —
 * a 60-120s cache keeps the UI snappy without ever serving stale playback URLs
 * (watch() is intentionally never cached: media tokens are short-lived).
 */
type Entry = { value: unknown; expires: number; inflight?: Promise<unknown> };

const store = new Map<string, Entry>();
const MAX_KEYS = 400;

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) {
    if (hit.inflight) return hit.inflight as Promise<T>;
    return hit.value as T;
  }
  const inflight = fn().then(
    (value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      evict();
      return value;
    },
    (err) => {
      store.delete(key);
      throw err;
    }
  );
  store.set(key, { value: hit?.value, expires: now + 5_000, inflight });
  return inflight;
}

function evict() {
  if (store.size <= MAX_KEYS) return;
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expires <= now) store.delete(k);
    if (store.size <= MAX_KEYS * 0.8) break;
  }
  while (store.size > MAX_KEYS) {
    const first = store.keys().next().value;
    if (first === undefined) break;
    store.delete(first);
  }
}

export function cacheStats() {
  return { keys: store.size };
}
