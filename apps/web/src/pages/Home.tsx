import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Anime } from "@onyxchin/shared";
import { getDetail, getHome, resolveUrl } from "../lib/api";
import { plainText, statusLabel } from "../lib/format";
import { clearProgress, readProgress, type ProgressEntry } from "../lib/progress";
import { useSources } from "../lib/sources";
import { useAsync } from "../lib/useAsync";
import { Icon } from "../components/Icon";
import { ContinueCard, PosterCard } from "../components/PosterCard";
import { Poster } from "../components/Poster";
import { Row } from "../components/Row";
import { SectionHead } from "../components/SectionHead";
import { HeroSkeleton, RowSkeleton } from "../components/Skeleton";
import { EmptyState, ErrorCard } from "../components/State";

export function Home() {
  const { source, sourceInfo } = useSources();
  const home = useAsync((signal) => getHome(source, signal), [source]);
  const data = home.data;
  const heroCards = useMemo(() => data?.hero.slice(0, 4) ?? [], [data]);
  const sections = data?.sections ?? [];

  const [heroIndex, setHeroIndex] = useState(0);
  const [history, setHistory] = useState<ProgressEntry[]>([]);

  useEffect(() => {
    setHeroIndex(0);
  }, [source]);

  useEffect(() => {
    setHistory(readProgress());
  }, [source]);

  const activeCard = heroCards[Math.min(heroIndex, Math.max(heroCards.length - 1, 0))] ?? null;

  const heroDetail = useAsync<Anime | null>(
    (signal) =>
      activeCard
        ? getDetail(source, activeCard.slug, signal).then((payload) => payload.anime)
        : Promise.resolve(null),
    [source, activeCard?.slug],
  );
  const anime = heroDetail.data;
  const synopsis = plainText(anime?.synopsis);
  const continueItems = history.filter((entry) => entry.source === source).slice(0, 10);

  const heroTitle = anime?.title ?? activeCard?.title ?? "";
  const heroPoster = anime?.banner ?? activeCard?.poster ?? null;
  const heroYear = anime?.year ?? activeCard?.year;
  const heroStatus = statusLabel(anime?.status ?? activeCard?.status);
  const heroRating = anime?.rating ?? activeCard?.rating;
  const heroEpisodes = anime?.totalEpisodes ?? activeCard?.episodes;
  const heroType = anime?.type ?? activeCard?.type;
  const sourceName = sourceInfo?.name ?? source;

  const loading = home.loading;
  const failed = Boolean(home.error);

  return (
    <div className="home">
      {loading ? (
        <>
          <HeroSkeleton />
          <div className="home__section container">
            <div className="skeleton sk-head" />
            <RowSkeleton />
          </div>
        </>
      ) : null}

      {!loading && failed ? (
        <div className="container home__error">
          <ErrorCard
            message={home.error ?? "Katalog gagal dimuat."}
            onRetry={home.reload}
            retryLabel="Muat ulang katalog"
          />
        </div>
      ) : null}

      {!loading && !failed && activeCard ? (
        <section className="hero" aria-label="Sorotan">
          <div className="hero__backdrop" key={`${activeCard.slug}-backdrop`}>
            {heroPoster ? (
              <img
                className="hero__backdrop-img"
                src={resolveUrl(heroPoster)}
                alt=""
                aria-hidden="true"
                loading="eager"
                decoding="async"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            ) : null}
          </div>
          <div className="hero__scrim" aria-hidden="true" />

          <div className="container hero__inner">
            <div className="hero__copy" key={`${activeCard.slug}-copy`}>
              <p
                className="hero__eyebrow mono"
                aria-label={`${sourceName}, sorotan ${heroIndex + 1}`}
              >
                <span>{sourceName}</span>
                <span className="hero__eyebrow-sep" aria-hidden="true">
                  ·
                </span>
                <span className="mono--faint">
                  Sorotan {String(heroIndex + 1).padStart(2, "0")}
                </span>
              </p>

              <h1 className="hero__title display">{heroTitle}</h1>

              {synopsis ? (
                <p className="hero__synopsis">{synopsis}</p>
              ) : heroDetail.loading ? (
                <div className="hero__synopsis-skeleton" aria-hidden="true">
                  <span className="skeleton" />
                  <span className="skeleton" />
                </div>
              ) : null}

              <div className="hero__chips">
                {heroYear ? <span className="chip">{heroYear}</span> : null}
                {heroStatus ? <span className="chip">{heroStatus}</span> : null}
                {heroRating ? (
                  <span className="chip chip--gold">
                    <Icon name="star" size={11} />
                    {heroRating.toFixed(1)}
                  </span>
                ) : null}
                {heroEpisodes ? <span className="chip">{heroEpisodes} eps</span> : null}
                {heroType ? <span className="chip">{heroType}</span> : null}
              </div>

              <div className="hero__actions">
                <Link
                  className="btn btn--accent"
                  to={`/a/${encodeURIComponent(source)}/${encodeURIComponent(activeCard.slug)}?play=1`}
                >
                  <Icon name="play" size={15} />
                  Tonton
                </Link>
                <Link
                  className="btn btn--ghost"
                  to={`/a/${encodeURIComponent(source)}/${encodeURIComponent(activeCard.slug)}`}
                >
                  Detail
                  <Icon name="arrowRight" size={14} />
                </Link>
              </div>
            </div>
            {heroPoster ? (
              <div className="hero__art" aria-hidden="true">
                <div className="hero__art-frame">
                  <Poster src={heroPoster} title={heroTitle} priority />
                </div>
                <p className="mono mono--faint hero__art-cap">
                  {[heroYear, heroStatus].filter(Boolean).join(" · ")}
                </p>
              </div>
            ) : null}
          </div>

          {heroCards.length > 1 ? (
            <div className="hero__dots" role="group" aria-label="Pilih sorotan">
              {heroCards.map((card, index) => (
                <button
                  key={card.slug}
                  type="button"
                  className="hero__dot"
                  aria-label={`Sorotan ${index + 1}: ${card.title}`}
                  aria-current={index === heroIndex}
                  onClick={() => setHeroIndex(index)}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {!loading && !failed && !activeCard && (sections.length > 0 || continueItems.length > 0) ? (
        <header className="masthead container">
          <p className="mono mono--faint">{sourceName} · Edisi harian</p>
          <h1 className="masthead__title display">
            Donghua,
            <br />
            tanpa derau.
          </h1>
          <p className="masthead__body prose">
            Katalog pilihan dari {sourceName}. Tanpa autoplay, tanpa notifikasi — hanya
            judul dan cerita.
          </p>
        </header>
      ) : null}

      {!loading && !failed && continueItems.length > 0 ? (
        <section className="home__section container" aria-label="Lanjut tonton">
          <SectionHead
            index={1}
            title="Lanjut tonton"
            aside={
              <button
                type="button"
                className="sect-head__more mono"
                onClick={() => {
                  clearProgress();
                  setHistory([]);
                }}
              >
                <Icon name="trash" size={12} />
                Bersihkan
              </button>
            }
          />
          <Row label="Lanjut tonton">
            {continueItems.map((entry) => (
              <ContinueCard
                key={`${entry.slug}-${entry.ep}`}
                source={entry.source}
                slug={entry.slug}
                ep={entry.ep}
                epNumber={entry.epNumber}
                title={entry.title}
                poster={entry.poster}
                position={entry.position}
                duration={entry.duration}
              />
            ))}
          </Row>
        </section>
      ) : null}

      {!loading && !failed
        ? sections.map((section, index) => (
            <section
              className="home__section container"
              key={`${section.title}-${index}`}
              aria-label={section.title}
            >
              <SectionHead
                index={index + (continueItems.length > 0 ? 2 : 1)}
                title={section.title}
                href="/browse"
                hrefLabel="Jelajah"
              />
              {section.items.length > 0 ? (
                <Row label={section.title}>
                  {section.items.map((card) => (
                    <PosterCard
                      key={`${card.id}-${card.slug}`}
                      card={card}
                      source={source}
                      sourceName={sourceInfo?.name}
                      eager={index === 0}
                    />
                  ))}
                </Row>
              ) : (
                <p className="home__row-empty mono mono--faint">
                  Daftar ini belum berisi judul.
                </p>
              )}
            </section>
          ))
        : null}

      {!loading && !failed && !activeCard && sections.length === 0 && continueItems.length === 0 ? (
        <div className="container home__empty">
          <EmptyState
            label={sourceName}
            title="Katalog ini masih sunyi."
            body="Sumber belum mengembalikan judul apa pun. Coba sumber lain, atau muat ulang sebentar lagi."
          >
            <button type="button" className="btn btn--ghost btn--sm" onClick={home.reload}>
              Muat ulang
            </button>
            <Link className="btn btn--quiet btn--sm" to="/browse">
              Buka jelajah
              <Icon name="arrowRight" size={13} />
            </Link>
          </EmptyState>
        </div>
      ) : null}

      {!loading && !failed && (sections.length > 0 || continueItems.length > 0) ? (
        <div className="home__end container">
          <p className="mono mono--faint">
            {sections.length + (continueItems.length > 0 ? 1 : 0)} daftar · {sourceName}
          </p>
          <Link className="btn btn--ghost btn--sm" to="/browse">
            Telusuri seluruh katalog
            <Icon name="arrowRight" size={13} />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
