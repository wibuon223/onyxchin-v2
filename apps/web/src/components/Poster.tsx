import { useState } from "react";
import { imageFallbackUrl, resolveUrl } from "../lib/api";

export interface PosterProps {
  src: string | null | undefined;
  title: string;
  /** Overrides the accessible alt text; pass "" for decorative use. */
  alt?: string;
  priority?: boolean;
  className?: string;
}

function markOf(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? "");
  return (letters.join("") || "ON").toUpperCase();
}

/**
 * Poster image with a two-step degrade: upstream image → API proxy → typographic
 * placeholder. Failure is tracked per `src` so a new card never inherits it.
 */
export function Poster({ src, title, alt, priority = false, className }: PosterProps) {
  const [failure, setFailure] = useState<{ key: string; level: 1 | 2 } | null>(null);
  const raw = src?.trim() ?? "";
  const level = failure?.key === raw ? failure.level : 0;
  const primary = raw ? resolveUrl(raw) : null;
  const proxied = raw ? imageFallbackUrl(raw) : null;
  const current = level === 0 ? primary : level === 1 ? proxied : null;
  const classes = className ? `poster-img ${className}` : "poster-img";

  if (!current) {
    return (
      <div className="poster-fallback" role="img" aria-label={alt ?? title}>
        <span className="poster-fallback__mark" aria-hidden="true">
          {markOf(title)}
        </span>
        <span className="poster-fallback__line" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={current}
      alt={alt ?? title}
      className={classes}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onError={() => {
        const nextLevel = level === 0 && proxied ? 1 : 2;
        setFailure({ key: raw, level: nextLevel });
      }}
    />
  );
}
