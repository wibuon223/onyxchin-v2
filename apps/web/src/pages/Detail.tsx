import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getDetail } from "../lib/api";
import {
  episodeCode,
  formatDate,
  formatTime,
  plainText,
  statusLabel,
} from "../lib/format";
import { getSeriesProgress, type ProgressEntry } from "../lib/progress";
import { useSources } from "../lib/sources";
import { useAsync } from "../lib/useAsync";
import { Icon } from "../components/Icon";
import { Poster } from "../components/Poster";
import { PosterCard } from "../components/PosterCard";
import { Row } from "../components/Row";
import { SectionHead } from "../components/SectionHead";
import { DetailSkeleton } from "../components/Skeleton";
import { EmptyState, ErrorCard } from "../components/State";

function watchPath(source: string, slug: string, ep: string): string {
  return `/watch/${encodeURIComponent(source)}/${encodeURIComponent(slug)}/${encodeURIComponent(ep)}`;
}

export function Detail() {
  const params = useParams<{ source: string; slug: string }>();
  const source = params.source ?? "";
  const slug = params.slug ?? "";
  const [searchParams] = useSearchParams();
  const autoplay = searchParams.get("play") === "1";
  const navigate = useNavigate();
  const { sourceInfo, setSource } = useSources();
  const detail = useAsync((signal) => getDetail(source, slug, signal), [source, slug]);
  const [progress, setProgress] = useState<ProgressEntry | null>(null);
  const autoPlayed = useRef(false);

  useEffect(() => {
    setProgress(getSeriesProgress(source, slug));
  }, [source, slug]);

  useEffect(() => {
    if (source) setSource(source);
  }, [source, setSource]);

  const anime = detail.data?.anime ?? null;
  const episodes = detail.data?.episodes ?? [];
  const related = detail.data?.related ?? [];
  const saved = progress && episodes.some((episode) => episode.slug === progress.ep) ? progress : null;
  const target = saved?.ep ?? episodes[0]?.slug ?? null;

  useEffect(() => {
    if (!autoplay || autoPlayed.current || !target) return;
    autoPlayed.current = true;
    navigate(watchPath(source, slug, target), { replace: true });
  }, [autoplay, navigate, slug, source, target]);

  const sourceName = sourceInfo?.name ?? source;
  const synopsis = plainText(anime?.synopsis);
  const paragraphs = synopsis ? synopsis.split(/\n{2,}/).filter(Boolean) : [];
  const status = statusLabel(anime?.status);

  if (detail.loading) {
    return (
      <div className="detail-page">
        <DetailSkeleton />
      </div>
    );
  }

  if (detail.error) {
    return (
      <div className="detail-page container detail-page__error">
        <ErrorCard message={detail.error} onRetry={detail.reload} retryLabel="Muat ulang" />
        <Link className="btn btn--quiet btn--sm" to="/browse">
          <Icon name="arrowLeft" size={13} />
          Kembali ke jelajah
        </Link>
      </div>
    );
  }

  if (!anime) return null;

  return (
    <article className="detail-page container">
      <aside className="detail-page__aside">
        <div className="detail-page__poster">
          <Poster src={anime.poster} title={anime.title} priority />
        </div>
        <dl className="detail-page__facts">
          {anime.studio ? (
            <div>
              <dt className="mono mono--faint">Studio</dt>
              <dd>{anime.studio}</dd>
            </div>
          ) : null}
          {anime.type ? (
            <div>
              <dt className="mono mono--faint">Tipe</dt>
              <dd>{anime.type}</dd>
            </div>
          ) : null}
          {status ? (
            <div>
              <dt className="mono mono--faint">Status</dt>
              <dd>{status}</dd>
            </div>
          ) : null}
          {anime.totalEpisodes ? (
            <div>
              <dt className="mono mono--faint">Episode</dt>
              <dd>{anime.totalEpisodes}</dd>
            </div>
          ) : null}
          {anime.year ? (
            <div>
              <dt className="mono mono--faint">Tahun</dt>
              <dd>{anime.year}</dd>
            </div>
          ) : null}
        </dl>
      </aside>

      <div className="detail-page__body">
        <Link className="detail-page__back mono" to="/browse">
          <Icon name="arrowLeft" size={13} />
          Jelajah
        </Link>

        <p className="mono mono--faint detail-page__source">{sourceName} · Seri</p>
        <h1 className="detail-page__title display">{anime.title}</h1>
        {anime.altTitles?.length ? (
          <p className="detail-page__alt">{anime.altTitles.slice(0, 4).join(" · ")}</p>
        ) : null}

        <div className="detail-page__chips">
          {anime.rating ? (
            <span className="chip chip--gold">
              <Icon name="star" size={11} />
              {anime.rating.toFixed(1)}
            </span>
          ) : null}
          {anime.year ? <span className="chip">{anime.year}</span> : null}
          {status ? <span className="chip">{status}</span> : null}
          {anime.type ? <span className="chip">{anime.type}</span> : null}
          {episodes.length ? <span className="chip">{episodes.length} eps tersedia</span> : null}
        </div>

        <div className="detail-page__actions">
          {target ? (
            <Link className="btn btn--accent" to={watchPath(source, slug, target)}>
              <Icon name="play" size={15} />
              {saved ? `Lanjut ${episodeCode(saved.epNumber)}` : "Tonton episode 1"}
            </Link>
          ) : (
            <span className="btn btn--ghost" aria-disabled="true">
              Belum ada episode
            </span>
          )}
          {saved && episodes[0] ? (
            <Link className="btn btn--ghost" to={watchPath(source, slug, episodes[0].slug)}>
              Dari awal
            </Link>
          ) : null}
          {saved ? (
            <span className="detail-page__resume mono mono--faint">
              Terakhir {episodeCode(saved.epNumber)} · {formatTime(saved.position)} /{" "}
              {formatTime(saved.duration)}
            </span>
          ) : null}
        </div>

        <section className="detail-page__synopsis" aria-label="Sinopsis">
          {paragraphs.length ? (
            paragraphs.map((paragraph, index) => (
              <p className="prose" key={`${index}-${paragraph.slice(0, 24)}`}>
                {paragraph}
              </p>
            ))
          ) : (
            <p className="prose">Sinopsis belum tersedia dari sumber ini.</p>
          )}
        </section>

        {anime.genres?.length ? (
          <div className="detail-page__genres">
            {anime.genres.map((genre) => (
              <Link
                key={genre}
                className="chip"
                to={`/browse?genre=${encodeURIComponent(genre)}`}
              >
                {genre}
              </Link>
            ))}
          </div>
        ) : null}

        <section className="eps" aria-labelledby="episodes-heading">
          <SectionHead
            index={1}
            title="Episode"
            id="episodes-heading"
            aside={
              <span className="mono mono--faint">
                {episodes.length ? `${episodes.length} episode` : "belum tersedia"}
              </span>
            }
          />
          {episodes.length ? (
            <div className="eps__grid">
              {episodes.map((episode) => {
                const isSeen = progress?.seen.includes(episode.number) ?? false;
                const isCurrent = progress?.ep === episode.slug;
                const date = formatDate(episode.releasedAt);
                return (
                  <Link
                    key={episode.slug}
                    className={`ep${isCurrent ? " is-current" : ""}${isSeen ? " is-seen" : ""}`}
                    to={watchPath(source, slug, episode.slug)}
                    aria-current={isCurrent ? "page" : undefined}
                    aria-label={`Episode ${episode.number}${isSeen ? ", sudah ditonton" : ""}`}
                    title={episode.title ?? `Episode ${episode.number}${date ? ` · ${date}` : ""}`}
                  >
                    <span className="ep__num">{episode.number}</span>
                    {isSeen ? <span className="ep__dot" aria-hidden="true" /> : null}
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              label="Episode"
              title="Daftar episode belum ada."
              body="Sumber ini belum mempublikasikan episode untuk judul tersebut. Coba lagi nanti atau periksa sumber lain."
            />
          )}
        </section>

        {related.length ? (
          <section className="detail-page__related" aria-labelledby="related-heading">
            <SectionHead
              index={2}
              title="Mirip dengan ini"
              id="related-heading"
              href={
                anime.genres?.length
                  ? `/browse?genre=${encodeURIComponent(anime.genres[0])}`
                  : "/browse"
              }
              hrefLabel="Lihat genre"
            />
            <Row label="Judul terkait">
              {related.map((card) => (
                <PosterCard
                  key={`${card.id}-${card.slug}`}
                  card={card}
                  source={source}
                  sourceName={sourceInfo?.name}
                />
              ))}
            </Row>
          </section>
        ) : null}
      </div>
    </article>
  );
}
