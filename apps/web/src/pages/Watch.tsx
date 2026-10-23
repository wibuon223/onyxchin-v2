import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Episode } from "@onyxchin/shared";
import { getDetail, getWatch, resolveUrl } from "../lib/api";
import { episodeCode, serverMeta } from "../lib/format";
import { getSeriesProgress, saveProgress } from "../lib/progress";
import { useSources } from "../lib/sources";
import { useAsync } from "../lib/useAsync";
import { useTitle } from "../lib/useTitle";
import { Icon } from "../components/Icon";
import { EpisodeStrip } from "../components/EpisodeStrip";
import { Player } from "../components/Player";
import { WatchSkeleton } from "../components/Skeleton";
import { ErrorCard } from "../components/State";

function watchPath(source: string, slug: string, episodeSlug: string): string {
  return `/watch/${encodeURIComponent(source)}/${encodeURIComponent(slug)}/${encodeURIComponent(episodeSlug)}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function Watch() {
  const params = useParams<{ source: string; slug: string; ep: string }>();
  const source = params.source ?? "";
  const slug = params.slug ?? "";
  const ep = params.ep ?? "";
  const { sourceInfo, setSource } = useSources();

  const navigate = useNavigate();
  const watch = useAsync((signal) => getWatch(source, slug, ep, signal), [source, slug, ep]);
  const detail = useAsync((signal) => getDetail(source, slug, signal), [source, slug]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resumeAt, setResumeAt] = useState(0);
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);
  const lastPosition = useRef(0);

  useEffect(() => {
    if (source) setSource(source);
  }, [source, setSource]);

  useEffect(() => {
    if (!watch.data) return;
    const list = watch.data.sources;
    const preferred =
      list.find((item) => item.playable && (item.kind === "hls" || item.kind === "direct")) ??
      list.find((item) => item.playable) ??
      list[0] ??
      null;
    setSelectedId(preferred ? preferred.id : null);
    const saved = getSeriesProgress(source, slug);
    const sameEpisode = saved != null && saved.ep === watch.data.episode.slug;
    setResumeAt(sameEpisode ? saved.position : 0);
    setPendingSeek(null);
    lastPosition.current = 0;
    setEnded(false);
  }, [watch.data, source, slug]);

  const handleProgress = useCallback(
    (position: number, duration: number) => {
      lastPosition.current = position;
      const payload = watch.data;
      if (!payload) return;
      saveProgress({
        source,
        slug,
        title: payload.anime.title,
        poster: payload.anime.poster,
        ep: payload.episode.slug,
        epNumber: payload.episode.number,
        epTitle: payload.episode.title,
        position,
        duration,
      });
    },
    [source, slug, watch.data],
  );

  const resolvedSources = useMemo(
    () =>
      (watch.data?.sources ?? []).map((item) => ({
        ...item,
        url: resolveUrl(item.url),
      })),
    [watch.data],
  );

  const resolvedSubtitles = useMemo(
    () =>
      (watch.data?.subtitles ?? []).map((track) => ({
        ...track,
        url: resolveUrl(track.url),
      })),
    [watch.data],
  );

  const selected = resolvedSources.find((item) => item.id === selectedId) ?? null;
  const unavailable = resolvedSources.filter((item) => !item.playable);

  const anime = watch.data?.anime ?? detail.data?.anime ?? null;
  const episode = watch.data?.episode ?? null;
  const prev = watch.data?.prev;
  const next = watch.data?.next;
  const sourceName = sourceInfo?.name ?? source;

  useTitle(anime ? `${anime.title}${episode ? ` · ${episodeCode(episode.number)}` : ""}` : null);

  const episodesForStrip: Episode[] = useMemo(() => {
    if (detail.data?.episodes.length) return detail.data.episodes;
    const list: (Episode | undefined)[] = [prev, episode ?? undefined, next];
    return list.filter((item): item is Episode => Boolean(item));
  }, [detail.data, episode, next, prev]);

  const detailPath = `/a/${encodeURIComponent(source)}/${encodeURIComponent(slug)}`;

  const handleSelectServer = (id: string) => {
    if (id === selectedId) return;
    setPendingSeek(lastPosition.current > 3 ? lastPosition.current : null);
    setSelectedId(id);
    setEnded(false);
  };

  const renderStage = () => {
    if (!watch.data) return null;
    if (!selected) {
      return (
        <div className="stage stage--empty">
          <Icon name="warning" size={22} />
          <p className="mono mono--gold">Tanpa server</p>
          <p className="stage__empty-body">
            Episode ini tidak menyertakan tautan yang bisa diputar.
          </p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={watch.reload}>
            Muat ulang
          </button>
        </div>
      );
    }
    if (selected.kind === "iframe") {
      return (
        <div className="stage stage--frame">
          <iframe
            className="stage__iframe"
            src={selected.url}
            title={`${anime?.title ?? "Episode"} — ${selected.label}`}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="origin"
            loading="lazy"
          />
          <span className="stage__tag mono">Sematan pihak ketiga</span>
        </div>
      );
    }
    if (selected.kind === "external") {
      return (
        <div className="stage stage--gate">
          <div className="gate">
            <p className="mono mono--gold">Tautan eksternal</p>
            <p className="gate__title display">{selected.label}</p>
            <p className="gate__body prose">
              Server ini membuka pemutar di {hostOf(selected.url)}. Konten berada di luar
              OnyxChin dan tunduk pada kebijakan situs tersebut.
            </p>
            <a
              className="btn btn--accent"
              href={selected.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              Buka di tab baru
              <Icon name="external" size={14} />
            </a>
            <p className="gate__note mono mono--faint">{selected.note ?? hostOf(selected.url)}</p>
          </div>
        </div>
      );
    }
    return (
      <Player
        key={`${selected.id}:${ep}`}
        url={selected.url}
        kind={selected.kind === "hls" ? "hls" : "direct"}
        title={`${anime?.title ?? "Episode"}${
          episode ? ` — ${episodeCode(episode.number)}` : ""
        }`}
        poster={anime?.poster ?? null}
        serverLabel={selected.label}
        quality={selected.quality}
        startAt={pendingSeek ?? resumeAt}
        subtitles={resolvedSubtitles}
        onProgress={handleProgress}
        onEnded={() => setEnded(true)}
        onNext={next ? () => navigate(watchPath(source, slug, next.slug)) : null}
        nextLabel={next ? episodeCode(next.number) : null}
      />
    );
  };

  if (watch.loading) {
    return (
      <div className="watch-page">
        <WatchSkeleton />
      </div>
    );
  }

  if (watch.error) {
    return (
      <div className="watch-page container watch-page__error">
        <ErrorCard message={watch.error} onRetry={watch.reload} retryLabel="Muat ulang" />
        <Link className="btn btn--quiet btn--sm" to={detailPath}>
          <Icon name="arrowLeft" size={13} />
          Kembali ke detail
        </Link>
      </div>
    );
  }

  if (!watch.data) return null;

  return (
    <div className="watch-page">
      <header className="watch-page__head container">
        <Link className="watch-page__back mono" to={detailPath}>
          <Icon name="arrowLeft" size={13} />
          {anime?.title ?? "Detail"}
        </Link>
        <h1
          className="watch-page__title display"
          aria-label={
            anime
              ? `${anime.title}${episode ? ` episode ${episode.number}` : ""}`
              : "Episode"
          }
        >
          {anime?.title ?? "Episode"}
          {episode ? <span className="watch-page__ep mono">{episodeCode(episode.number)}</span> : null}
        </h1>
        <p className="watch-page__meta mono mono--faint">
          {[episode?.title, sourceName, `${watch.data.sources.length} server`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <div className="watch-page__stage container">{renderStage()}</div>

      {ended ? (
        <div className="watch-page__ended container">
          <div>
            <p className="mono mono--gold">Selesai</p>
            <p className="watch-page__ended-title display">
              {next ? `Lanjut ${episodeCode(next.number)}?` : "Ini episode terakhir."}
            </p>
          </div>
          {next ? (
            <Link className="btn btn--accent btn--sm" to={watchPath(source, slug, next.slug)}>
              Putar berikutnya
              <Icon name="arrowRight" size={13} />
            </Link>
          ) : (
            <Link className="btn btn--ghost btn--sm" to={detailPath}>
              Kembali ke detail
            </Link>
          )}
        </div>
      ) : null}

      <div className="watch-page__servers container">
        <div className="servers">
          <div className="servers__head">
            <p className="mono mono--faint">Server</p>
            <p className="mono mono--faint">
              {selected ? serverMeta(selected.label, selected.quality) : "—"}
            </p>
          </div>
          <div className="servers__list" role="group" aria-label="Pilih server">
            {resolvedSources.map((item) => (
              <button
                key={item.id}
                type="button"
                className="server"
                aria-pressed={item.id === selectedId}
                disabled={!item.playable}
                onClick={() => handleSelectServer(item.id)}
                title={
                  item.playable
                    ? serverMeta(item.label, item.quality)
                    : `${item.label} — ${item.note ?? "tidak tersedia"}`
                }
                aria-label={
                  item.playable
                    ? serverMeta(item.label, item.quality)
                    : `${item.label}, tidak tersedia: ${item.note ?? "terkunci"}`
                }
              >
                <span className="server__label">{item.label}</span>
                {item.quality &&
                item.quality.trim().toLowerCase() !== item.label.trim().toLowerCase() ? (
                  <span className="server__q mono">{item.quality}</span>
                ) : null}
                {!item.playable ? (
                  <Icon name="lock" size={12} />
                ) : item.kind === "external" ? (
                  <Icon name="external" size={12} />
                ) : null}
              </button>
            ))}
          </div>
          {unavailable.length ? (
            <p className="servers__note mono mono--faint">
              {unavailable
                .map(
                  (item) =>
                    `${item.label}${item.note ? ` — ${item.note}` : " — terkunci"}`,
                )
                .join("  ·  ")}
            </p>
          ) : null}
        </div>

        <p className="watch-page__credit mono mono--faint">
          Sumber: {sourceName}
          {sourceInfo ? ` — ${hostOf(sourceInfo.baseUrl)}` : ""} ·{" "}
          {selected?.kind === "external"
            ? "tautan eksternal"
            : selected?.kind === "iframe"
              ? "sematan pihak ketiga"
              : "diputar di peramban"}
        </p>
      </div>

      <div className="watch-page__strip container">
        <EpisodeStrip
          source={source}
          slug={slug}
          episodes={episodesForStrip}
          currentSlug={ep}
          prev={prev}
          next={next}
        />
      </div>
    </div>
  );
}
