/**
 * Cross-device watch sync.
 *
 * Keyed by a user-chosen code (no accounts, no email). The row holds a small
 * JSON array of progress entries; writes merge rather than overwrite so two
 * devices never lose each other's episodes.
 *
 * The feature is optional: without DATABASE_URL every route answers 503 and the
 * web app hides the control.
 */
import { Pool } from "pg";

const MAX_ENTRIES = 200;
const MAX_BODY_BYTES = 200_000;
const CODE_PATTERN = /^[a-z0-9]{6,24}$/;

export interface SyncEntry {
  source: string;
  slug: string;
  ep: string;
  epNumber: number;
  title: string;
  poster?: string | null;
  position: number;
  duration: number;
  seen: number[];
  updatedAt: number;
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function syncAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 6_000,
      ssl: false,
    });
    // A dead idle client must not take the process down.
    pool.on("error", () => undefined);
  }
  return pool;
}

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const pending: Promise<void> = getPool()
      .query(
        `create table if not exists watch_sync (
           code text primary key,
           entries jsonb not null default '[]'::jsonb,
           updated_at timestamptz not null default now()
         )`
      )
      .then(() => undefined)
      .catch((error: unknown) => {
        schemaReady = null;
        throw error;
      });
    schemaReady = pending;
  }
  return schemaReady;
}

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

/** Keep only the fields we own, coerce numbers, drop junk. */
export function sanitizeEntries(input: unknown): SyncEntry[] {
  if (!Array.isArray(input)) return [];
  const out: SyncEntry[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const source = typeof item.source === "string" ? item.source.slice(0, 32) : "";
    const slug = typeof item.slug === "string" ? item.slug.slice(0, 200) : "";
    const ep = typeof item.ep === "string" ? item.ep.slice(0, 200) : "";
    if (!source || !slug || !ep) continue;
    const number = (value: unknown, fallback = 0) =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    out.push({
      source,
      slug,
      ep,
      epNumber: Math.trunc(number(item.epNumber, 1)),
      title: typeof item.title === "string" ? item.title.slice(0, 240) : slug,
      poster: typeof item.poster === "string" ? item.poster.slice(0, 500) : null,
      position: Math.max(0, number(item.position)),
      duration: Math.max(0, number(item.duration)),
      seen: Array.isArray(item.seen)
        ? [...new Set(item.seen.filter((n): n is number => Number.isInteger(n)))].sort((a, b) => a - b)
        : [],
      updatedAt: number(item.updatedAt, Date.now()),
    });
    if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

function mergeEntries(local: SyncEntry[], remote: SyncEntry[]): SyncEntry[] {
  const byKey = new Map<string, SyncEntry>();
  for (const entry of [...local, ...remote]) {
    const key = `${entry.source}|${entry.slug}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, entry);
      continue;
    }
    const newer = entry.updatedAt >= current.updatedAt ? entry : current;
    byKey.set(key, {
      ...newer,
      seen: [...new Set([...current.seen, ...entry.seen])].sort((a, b) => a - b),
      position: newer.position,
      duration: newer.duration || current.duration,
    });
  }
  return [...byKey.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ENTRIES);
}

export interface SyncSnapshot {
  entries: SyncEntry[];
  updatedAt: string;
}

export async function readSync(code: string): Promise<SyncSnapshot | null> {
  await ensureSchema();
  const result = await getPool().query<{ entries: SyncEntry[]; updated_at: Date }>(
    "select entries, updated_at from watch_sync where code = $1",
    [code]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { entries: sanitizeEntries(row.entries), updatedAt: row.updated_at.toISOString() };
}

export async function writeSync(code: string, incoming: SyncEntry[]): Promise<SyncSnapshot> {
  if (JSON.stringify(incoming).length > MAX_BODY_BYTES) {
    throw new Error("payload_too_large");
  }
  await ensureSchema();
  const existing = await readSync(code);
  const merged = mergeEntries(existing?.entries ?? [], incoming);
  if (!existing && merged.length === 0) {
    // Nothing to store: don't create empty rows for random codes.
    return { entries: [], updatedAt: new Date().toISOString() };
  }
  const result = await getPool().query<{ updated_at: Date }>(
    `insert into watch_sync (code, entries, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (code) do update set entries = excluded.entries, updated_at = now()
     returning updated_at`,
    [code, JSON.stringify(merged)]
  );
  return { entries: merged, updatedAt: result.rows[0].updated_at.toISOString() };
}
