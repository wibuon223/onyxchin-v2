/**
 * Cross-device sync for watch history.
 *
 * No accounts: the user picks a code, both devices type the same code, and the
 * API merges entries by newest-wins + union of seen episodes. Everything is
 * best-effort — if the network or the server is down, local history keeps
 * working exactly as before.
 */
import { API_BASE } from "./api";
import { mergeProgress, readProgress, type ProgressEntry } from "./progress";

const CODE_KEY = "onyxchin:sync";
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const PUSH_DEBOUNCE_MS = 5_000;

let pushTimer: number | null = null;
let inFlight = false;
let suppressEcho = false;

/** Merging a server response re-writes local history; don't echo it back. */
function mergeRemote(entries: ProgressEntry[]): ProgressEntry[] {
  suppressEcho = true;
  try {
    return mergeProgress(entries);
  } finally {
    suppressEcho = false;
  }
}

/** Push on every local save, debounced. Returns an unsubscribe. */
export function attachAutoPush(): () => void {
  const handler = () => {
    if (!suppressEcho) schedulePush();
  };
  window.addEventListener("onyxchin:progress", handler);
  return () => window.removeEventListener("onyxchin:progress", handler);
}

export function getSyncCode(): string | null {
  try {
    const raw = window.localStorage.getItem(CODE_KEY);
    return raw && /^[a-z0-9]{6,24}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function setSyncCode(code: string | null): void {
  try {
    if (code) window.localStorage.setItem(CODE_KEY, code);
    else window.localStorage.removeItem(CODE_KEY);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event("onyxchin:sync"));
}

/** Human-friendly, unambiguous, 8 chars in two groups (xxxx-xxxx). */
export function generateCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    if (i === 4) out += "-";
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function normalizeCode(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
}

export interface SyncResult {
  entries: number;
  updatedAt: string | null;
  error?: string;
}

export async function pullProgress(code = getSyncCode()): Promise<SyncResult> {
  if (!code) return { entries: 0, updatedAt: null, error: "no_code" };
  try {
    const response = await fetch(`${API_BASE}/api/sync/${encodeURIComponent(normalizeCode(code))}`, {
      headers: { accept: "application/json" },
    });
    if (response.status === 404) return { entries: 0, updatedAt: null };
    if (!response.ok) return { entries: 0, updatedAt: null, error: `http_${response.status}` };
    const body = (await response.json()) as { entries?: ProgressEntry[]; updatedAt?: string };
    const merged = mergeRemote(body.entries ?? []);
    return { entries: merged.length, updatedAt: body.updatedAt ?? null };
  } catch {
    return { entries: 0, updatedAt: null, error: "offline" };
  }
}

export async function pushProgress(code = getSyncCode()): Promise<SyncResult> {
  if (!code || inFlight) return { entries: 0, updatedAt: null, error: "busy" };
  const entries = readProgress();
  if (entries.length === 0) return { entries: 0, updatedAt: null, error: "empty" };
  inFlight = true;
  try {
    const response = await fetch(`${API_BASE}/api/sync/${encodeURIComponent(normalizeCode(code))}`, {
      method: "PUT",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ entries }),
    });
    if (!response.ok) return { entries: 0, updatedAt: null, error: `http_${response.status}` };
    const body = (await response.json()) as { entries?: ProgressEntry[]; updatedAt?: string };
    const merged = mergeRemote(body.entries ?? []);
    return { entries: merged.length, updatedAt: body.updatedAt ?? null };
  } catch {
    return { entries: 0, updatedAt: null, error: "offline" };
  } finally {
    inFlight = false;
  }
}

/** Coalesce bursty saves (player flushes progress every few seconds). */
export function schedulePush(delay = PUSH_DEBOUNCE_MS): void {
  if (!getSyncCode()) return;
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    void pushProgress();
  }, delay);
}

/**
 * Called once at app start: merge what the server has, keep retrying on
 * reconnect, and refresh every minute while the tab is visible.
 */
export function startSync(): () => void {
  if (!getSyncCode()) return () => undefined;
  void pullProgress();
  const onOnline = () => void pullProgress();
  const onVisible = () => {
    if (document.visibilityState === "visible") void pullProgress();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(onVisible, 60_000);
  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
  };
}
