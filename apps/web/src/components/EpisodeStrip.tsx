import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { Episode } from "@onyxchin/shared";
import { episodeCode } from "../lib/format";
import { Icon } from "./Icon";

export interface EpisodeStripProps {
  source: string;
  slug: string;
  episodes: Episode[];
  currentSlug: string;
  prev?: Episode;
  next?: Episode;
}

function watchPath(source: string, slug: string, episodeSlug: string): string {
  return `/watch/${encodeURIComponent(source)}/${encodeURIComponent(slug)}/${encodeURIComponent(episodeSlug)}`;
}

export function EpisodeStrip({
  source,
  slug,
  episodes,
  currentSlug,
  prev,
  next,
}: EpisodeStripProps) {
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const active = rail.querySelector<HTMLElement>('[data-current="true"]');
    active?.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
  }, [currentSlug, episodes]);

  return (
    <section className="epstrip" aria-label="Navigasi episode">
      <div className="epstrip__top">
        <p className="mono mono--faint">Episode</p>
        <Link
          className="mono epstrip__all"
          to={`/a/${encodeURIComponent(source)}/${encodeURIComponent(slug)}`}
        >
          Semua episode
          <Icon name="arrowRight" size={12} />
        </Link>
      </div>

      <div className="epstrip__jumps">
        {prev ? (
          <Link className="jump" to={watchPath(source, slug, prev.slug)}>
            <Icon name="chevronLeft" size={18} />
            <span className="jump__text">
              <span className="mono mono--faint">Sebelumnya</span>
              <span className="jump__code">{episodeCode(prev.number)}</span>
            </span>
          </Link>
        ) : (
          <span className="jump is-disabled" aria-hidden="true">
            <Icon name="chevronLeft" size={18} />
            <span className="jump__text">
              <span className="mono mono--faint">Sebelumnya</span>
              <span className="jump__code">—</span>
            </span>
          </span>
        )}
        {next ? (
          <Link className="jump jump--next" to={watchPath(source, slug, next.slug)}>
            <span className="jump__text">
              <span className="mono mono--faint">Berikutnya</span>
              <span className="jump__code">{episodeCode(next.number)}</span>
            </span>
            <Icon name="chevronRight" size={18} />
          </Link>
        ) : (
          <span className="jump jump--next is-disabled" aria-hidden="true">
            <span className="jump__text">
              <span className="mono mono--faint">Berikutnya</span>
              <span className="jump__code">—</span>
            </span>
            <Icon name="chevronRight" size={18} />
          </span>
        )}
      </div>

      {episodes.length > 0 ? (
        <div className="epstrip__rail no-scrollbar" ref={railRef}>
          {episodes.map((episode) => {
            const current = episode.slug === currentSlug;
            return (
              <Link
                key={episode.slug}
                className={`epchip${current ? " is-current" : ""}`}
                to={watchPath(source, slug, episode.slug)}
                data-current={current}
                aria-current={current ? "page" : undefined}
                aria-label={`Episode ${episode.number}`}
                title={episode.title ?? `Episode ${episode.number}`}
              >
                {episode.number}
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="epstrip__empty mono mono--faint">Daftar episode tidak tersedia.</p>
      )}
    </section>
  );
}
