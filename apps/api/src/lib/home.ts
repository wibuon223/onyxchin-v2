import type { Card, HomePayload } from "@onyxchin/shared";

/**
 * Keep home rows honest: several upstream sites ignore genre/order params and
 * return the same list for every query (animexin, donghuaworld genres). A row
 * whose leading slugs duplicate an earlier row is dropped instead of shipped as
 * fake variety.
 */
export function distinctRows(rows: [string, Card[]][]): HomePayload["sections"] {
  const seen = new Set<string>();
  const sections: HomePayload["sections"] = [];
  for (const [title, items] of rows) {
    if (!items.length) continue;
    const key = items
      .slice(0, 10)
      .map((card) => card.slug)
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    sections.push({ title, items });
  }
  return sections;
}
