import { Link } from "react-router-dom";
import type { Card } from "@onyxchin/shared";
import { episodeCode, percentOf, sourceShortName, statusLabel } from "../lib/format";
import { Icon } from "./Icon";
import { Poster } from "./Poster";

export interface PosterCardProps {
  card: Card;
  source: string;
  sourceName?: string;
  showSource?: boolean;
  /** 0-100; renders a progress hairline under the poster. */
  progress?: number | null;
  /** Overrides the destination, e.g. a continue-watching entry. */
  to?: string;
  badge?: string;
  eager?: boolean;
}

function metaLine(card: Card): string {
  const parts: string[] = [];
  if (card.year) parts.push(String(card.year));
  if (card.type) parts.push(card.type);
  if (card.episodes) parts.push(`${card.episodes} eps`);
  if (!parts.length) {
    const status = statusLabel(card.status);
    if (status) parts.push(status);
  }
  return parts.join(" · ");
}

export function PosterCard({
  card,
  source,
  sourceName,
  showSource = false,
  progress = null,
  to,
  badge,
  eager = false,
}: PosterCardProps) {
  const target = to ?? `/a/${encodeURIComponent(source)}/${encodeURIComponent(card.slug)}`;
  const meta = metaLine(card);
  const showProgress = typeof progress === "number" && progress > 0;

  return (
    <Link className="pcard" to={target} aria-label={`${card.title}${meta ? ` — ${meta}` : ""}`}>
      <span className="pcard__frame">
        <Poster src={card.poster} title={card.title} priority={eager} />
        {showSource ? (
          <span className="pcard__badge mono">{sourceShortName(source, sourceName)}</span>
        ) : null}
        {badge ? <span className="pcard__badge pcard__badge--accent mono">{badge}</span> : null}
        <span className="pcard__cue" aria-hidden="true">
          <Icon name="play" size={13} />
          <span className="mono">Tonton</span>
          <Icon name="arrowRight" size={13} />
        </span>
        {showProgress ? (
          <span className="pcard__progress" aria-hidden="true">
            <i style={{ width: `${Math.max(0, Math.min(100, progress ?? 0))}%` }} />
          </span>
        ) : null}
      </span>
      <span className="pcard__meta">
        <span className="pcard__title">{card.title}</span>
        <span className="pcard__sub mono">
          {card.rating ? (
            <span className="pcard__rating">
              <Icon name="star" size={10} />
              {card.rating.toFixed(1)}
              {meta ? <span className="pcard__dot" aria-hidden="true">·</span> : null}
            </span>
          ) : null}
          {meta}
        </span>
      </span>
    </Link>
  );
}

export interface ContinueCardProps {
  source: string;
  slug: string;
  ep: string;
  epNumber: number;
  title: string;
  poster: string | null;
  position: number;
  duration: number;
}

/** Continue-watching entry: jumps straight to the saved episode. */
export function ContinueCard({
  source,
  slug,
  ep,
  epNumber,
  title,
  poster,
  position,
  duration,
}: ContinueCardProps) {
  const percent = percentOf(position, duration);
  return (
    <Link
      className="pcard pcard--continue"
      to={`/watch/${encodeURIComponent(source)}/${encodeURIComponent(slug)}/${encodeURIComponent(ep)}`}
      aria-label={`Lanjut tonton ${title}, episode ${epNumber}`}
    >
      <span className="pcard__frame">
        <Poster src={poster} title={title} />
        <span className="pcard__badge pcard__badge--accent mono">{episodeCode(epNumber)}</span>
        <span className="pcard__cue" aria-hidden="true">
          <Icon name="play" size={13} />
          <span className="mono">Lanjut</span>
          <Icon name="arrowRight" size={13} />
        </span>
        <span className="pcard__progress" aria-hidden="true">
          <i style={{ width: `${percent}%` }} />
        </span>
      </span>
      <span className="pcard__meta">
        <span className="pcard__title">{title}</span>
        <span className="pcard__sub mono">
          {episodeCode(epNumber)} · {Math.round(percent)}% ditonton
        </span>
      </span>
    </Link>
  );
}
