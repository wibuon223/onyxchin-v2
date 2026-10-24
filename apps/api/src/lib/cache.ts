/**
 * Tiny TTL cache with stale-while-revalidate.
 *
 * Render's free instance is small and upstream donghua sites take 1-8s per page,
 * so every read path is cached. Stale entries are served instantly (and refreshed
 * in the background) instead of making a visitor wait for a slow scrape.
 *
 * watch() is deliberately never cached: media URLs are signed and short-lived.
 */
type Entry = { value: unknown; expires: number; staleUntil: number; inflight?: Promise<unknown> };

const store = new Map<string, Entry>();
const MAX_KEYS = 400;

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  staleMs = ttlMs * 4
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);

  if (hit) {
    if (hit.expires > now) {
      if (hit.inflight) return hit.inflight as Promise<T>;
      return hit.value as T;
    }
    if (hit.staleUntil > now && hit.value !== undefined) {
      // Serve stale immediately, refresh in the background.
      if (!hit.inflight) {
        hit.inflight = fn()
          .then((value) => {
            store.set(key, { value, expires: Date.now() + ttlMs, staleUntil: Date.now() + ttlMs + staleMs });
            return value;
          })
          .catch(() => hit.value)
          .finally(() => {
            const current = store.get(key);
            if (current) delete current.inflight;
          });
      }
      return hit.value as T;
    }
  }

  const inflight = fn()
    .then((value) => {
      const done = Date.now();
      store.set(key, { value, expires: done + ttlMs, staleUntil: done + ttlMs + staleMs });
      evict();
      return value;
    })
    .catch((err) => {
      store.delete(key);
      throw err;
    });

  store.set(key, {
    value: hit?.value,
    expires: now + 5_000,
    staleUntil: now + ttlMs + staleMs,
    inflight,
  });
  return inflight;
}

function evict() {
  if (store.size <= MAX_KEYS) return;
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.staleUntil <= now) store.delete(k);
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
