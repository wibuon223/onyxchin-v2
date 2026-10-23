/**
 * Watch history lives entirely in localStorage.
 * One entry per series: last episode, position, and the episode numbers seen.
 */

const KEY = "onyxchin:progress";
const LIMIT = 24;

export interface ProgressEntry {
  source: string;
  slug: string;
  title: string;
  poster: string | null;
  /** Episode slug used in `/watch/:source/:slug/:ep`. */
  ep: string;
  epNumber: number;
  epTitle?: string;
  position: number;
  duration: number;
  /** Episode numbers the viewer has started. */
  seen: number[];
  updatedAt: number;
}

export interface ProgressInput {
  source: string;
  slug: string;
  title: string;
  poster: string | null;
  ep: string;
  epNumber: number;
  epTitle?: string;
  position: number;
  duration: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeSeen(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isFiniteNumber).map((n) => Math.trunc(n)))].sort(
    (a, b) => a - b,
  );
}

function readRaw(): ProgressEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ProgressEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (
        typeof row.source !== "string" ||
        typeof row.slug !== "string" ||
        typeof row.title !== "string" ||
        typeof row.ep !== "string" ||
        !isFiniteNumber(row.epNumber) ||
        !isFiniteNumber(row.position) ||
        !isFiniteNumber(row.duration) ||
        !isFiniteNumber(row.updatedAt)
      ) {
        continue;
      }
      out.push({
        source: row.source,
        slug: row.slug,
        title: row.title,
        poster: typeof row.poster === "string" ? row.poster : null,
        ep: row.ep,
        epNumber: Math.trunc(row.epNumber),
        epTitle: typeof row.epTitle === "string" ? row.epTitle : undefined,
        position: Math.max(0, row.position),
        duration: Math.max(0, row.duration),
        seen: normalizeSeen(row.seen),
        updatedAt: row.updatedAt,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function writeRaw(entries: ProgressEntry[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, LIMIT)));
  } catch {
    /* storage may be full or blocked — history is best-effort */
  }
}

export function readProgress(): ProgressEntry[] {
  return readRaw().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSeriesProgress(
  source: string,
  slug: string,
): ProgressEntry | null {
  return readRaw().find((entry) => entry.source === source && entry.slug === slug) ?? null;
}

export function saveProgress(input: ProgressInput): ProgressEntry | null {
  if (!input.duration || input.duration < 10) return null;
  const entries = readRaw();
  const index = entries.findIndex(
    (entry) => entry.source === input.source && entry.slug === input.slug,
  );
  const previous = index >= 0 ? entries[index] : null;
  const entry: ProgressEntry = {
    ...input,
    position: Math.max(0, Math.min(input.position, input.duration)),
    seen: normalizeSeen([...(previous?.seen ?? []), input.epNumber]),
    updatedAt: Date.now(),
  };
  if (index >= 0) entries.splice(index, 1);
  entries.unshift(entry);
  writeRaw(entries);
  return entry;
}

/** Record an episode as started even if playback never reached a save point. */
export function markEpisodeSeen(
  source: string,
  slug: string,
  epNumber: number,
): void {
  const entries = readRaw();
  const index = entries.findIndex((entry) => entry.source === source && entry.slug === slug);
  if (index < 0) return;
  entries[index] = {
    ...entries[index],
    seen: normalizeSeen([...entries[index].seen, epNumber]),
  };
  writeRaw(entries);
}

export function clearProgress(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* best-effort */
  }
}

export function episodeSeen(entry: ProgressEntry | null, epNumber: number): boolean {
  return entry?.seen.includes(epNumber) ?? false;
}
