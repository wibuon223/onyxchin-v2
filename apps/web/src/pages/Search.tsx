import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchTitles } from "../lib/api";
import { pushRecentSearch, readRecentSearches } from "../lib/prefs";
import { useSources } from "../lib/sources";
import { useAsync } from "../lib/useAsync";
import { Icon } from "../components/Icon";
import { PosterCard } from "../components/PosterCard";
import { GridSkeleton } from "../components/Skeleton";
import { EmptyState, ErrorCard } from "../components/State";

const SUGGESTIONS = [
  "Soul Land",
  "Battle Through the Heavens",
  "Perfect World",
  "Renegade Immortal",
  "Swallowed Star",
  "Throne of Seal",
];

export function Search() {
  const [params, setParams] = useSearchParams();
  const { source, sourceInfo, sources, setSource } = useSources();
  const rawQuery = params.get("q") ?? "";
  const query = rawQuery.trim();
  const [draft, setDraft] = useState(rawQuery);
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    setDraft(rawQuery);
  }, [rawQuery]);

  useEffect(() => {
    setRecents(readRecentSearches());
  }, [query]);

  const results = useAsync(
    (signal) => (query ? searchTitles(source, query, signal) : Promise.resolve([])),
    [source, query],
  );

  const submit = (value: string) => {
    const next = value.trim();
    if (!next) return;
    setRecents(pushRecentSearch(next));
    setParams({ q: next });
  };

  const sourceName = sourceInfo?.name ?? source;
  const otherSources = sources.filter((item) => item.id !== source);

  return (
    <div className="search-page">
      <header className="page-head container">
        <p className="mono mono--faint">{sourceName} · Pencarian</p>
        <h1 className="page-head__title display">Cari</h1>
      </header>

      <form
        className="searchbar container"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
        role="search"
      >
        <Icon name="search" size={18} />
        <input
          className="searchbar__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Cari judul di ${sourceName}…`}
          aria-label="Cari judul donghua"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        <button type="submit" className="btn btn--accent btn--sm">
          Cari
        </button>
      </form>

      <div className="container search-page__body">
        {query ? (
          <p className="search-page__meta mono mono--faint">
            {results.loading
              ? "Mencari…"
              : `${results.data?.length ?? 0} hasil untuk “${query}” di ${sourceName}`}
          </p>
        ) : null}

        {query && results.loading ? <GridSkeleton count={12} /> : null}

        {query && results.error ? (
          <ErrorCard message={results.error} onRetry={results.reload} retryLabel="Ulangi pencarian" />
        ) : null}

        {query && !results.loading && !results.error && (results.data?.length ?? 0) > 0 ? (
          <div className="poster-grid">
            {(results.data ?? []).map((card) => (
              <PosterCard
                key={`${card.id}-${card.slug}`}
                card={card}
                source={source}
                sourceName={sourceInfo?.name}
              />
            ))}
          </div>
        ) : null}

        {query && !results.loading && !results.error && (results.data?.length ?? 0) === 0 ? (
          <EmptyState
            label={`${sourceName} · 0 hasil`}
            title={`Tidak ada “${query}”.`}
            body="Coba kata yang lebih pendek, judul alternatif, atau periksa sumber lain. Ejaan Inggris biasanya lebih akurat."
          >
            {SUGGESTIONS.slice(0, 4).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="chip"
                onClick={() => submit(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </EmptyState>
        ) : null}

        {!query ? (
          <div className="search-page__blank">
            <EmptyState
              label="Kata kunci kosong"
              title="Mulai dari satu judul."
              body="Pencarian berjalan di sumber yang sedang aktif. Gunakan judul asli atau romanisasi bila hasilnya kosong."
            >
              {SUGGESTIONS.slice(0, 4).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="chip"
                  onClick={() => submit(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </EmptyState>

            {recents.length > 0 ? (
              <section className="search-page__recents" aria-labelledby="recent-heading">
                <h2 className="search-page__recents-title mono mono--faint" id="recent-heading">
                  Pencarian terakhir
                </h2>
                <ul>
                  {recents.map((item, index) => (
                    <li key={item}>
                      <button type="button" className="search-page__recent" onClick={() => submit(item)}>
                        <span className="mono mono--faint">{String(index + 1).padStart(2, "0")}</span>
                        <span>{item}</span>
                        <Icon name="arrowRight" size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        {otherSources.length > 0 ? (
          <section className="search-page__switch" aria-labelledby="switch-heading">
            <h2 className="mono mono--faint" id="switch-heading">
              Cari di sumber lain
            </h2>
            <div className="search-page__switch-list">
              {otherSources.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="chip"
                  onClick={() => setSource(item.id)}
                >
                  {item.name}
                  <Icon name="arrowRight" size={11} />
                </button>
              ))}
            </div>
            <p className="search-page__switch-note mono mono--faint">
              Sumber aktif: {sourceName}.{" "}
              <Link className="search-page__browse-link" to="/browse">
                Atau jelajah katalog
              </Link>
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
