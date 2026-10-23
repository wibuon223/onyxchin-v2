/** Small display formatters shared by pages and the player. */

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function episodeCode(number: number): string {
  return `E${String(number).padStart(2, "0")}`;
}

const STATUS_LABELS: Record<string, string> = {
  ongoing: "Sedang Tayang",
  airing: "Sedang Tayang",
  completed: "Tamat",
  complete: "Tamat",
  finished: "Tamat",
  upcoming: "Segera",
  hiatus: "Hiatus",
};

export function statusLabel(raw?: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return STATUS_LABELS[key] ?? raw.trim();
}

export function percentOf(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

const SHORT_SOURCE_NAMES: Record<string, string> = {
  rajadonghua: "Raja",
  anichin: "Anichin",
  animexin: "AnimeXin",
  yunshanid: "Yunshan",
  donghuaworld: "DHW",
};

export function sourceShortName(id: string, fallback?: string): string {
  return SHORT_SOURCE_NAMES[id] ?? (fallback?.split(/\s+/)[0] ?? id);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Synopsis strings arrive from HTML scrapers; flatten them for display. */
export function plainText(input?: string | null): string {
  if (!input) return "";
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match: string, code: string) => {
      if (code.startsWith("#x") || code.startsWith("#X")) {
        const point = Number.parseInt(code.slice(2), 16);
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : match;
      }
      if (code.startsWith("#")) {
        const point = Number.parseInt(code.slice(1), 10);
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FORMAT.format(date);
}

/** "1080p" + quality "1080p" must not render as "1080p · 1080p". */
export function serverMeta(label: string, quality?: string | null): string {
  const trimmed = quality?.trim();
  if (!trimmed || trimmed.toLowerCase() === label.trim().toLowerCase()) return label;
  return `${label} · ${trimmed}`;
}
