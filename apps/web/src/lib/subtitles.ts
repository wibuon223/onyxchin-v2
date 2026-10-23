/**
 * SRT → WebVTT fallback for absolute subtitle URLs. The API converts
 * server-side (`/api/sub`); this only covers raw upstream .srt files.
 */
export function toVtt(input: string): string {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (text.trimStart().startsWith("WEBVTT")) return text;
  const cues = text
    .replace(/^\d+\s*$/gm, "")
    .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .trim();
  return `WEBVTT\n\n${cues}\n`;
}
