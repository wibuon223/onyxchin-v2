import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Card } from "@onyxchin/shared";
import { errorMessage, getList } from "../lib/api";
import { useSources } from "../lib/sources";
import { Icon } from "../components/Icon";
import { PosterCard } from "../components/PosterCard";
import { GridSkeleton } from "../components/Skeleton";
import { EmptyState, ErrorCard } from "../components/State";

const ORDER_OPTIONS: { value: string; label: string }[] = [
  { value: "latest", label: "Terbaru" },
  { value: "popular", label: "Populer" },
  { value: "rating", label: "Rating" },
];

const STATUS_LABELS: Record<string, string> = {
  ongoing: "Sedang Tayang",
  completed: "Selesai",
  upcoming: "Akan Datang",
  hiatus: "Hiatus",
};

/**
 * Genre vocabulary every adapter understands (display names, matched by the
 * adapters). Genres discovered in loaded cards are appended after this list.
 */
const GENRE_CHIPS = [
  "Action",
  "Adventure",
  "Fantasy",
  "Martial Arts",
  "Romance",
  "Drama",
  "Comedy",
  "Historical",
  "Isekai",
  "Sci-Fi",
  "Supernatural",
  "Mystery",
];

export function Browse() {
  const { source, sourceInfo } = useSources();
  const [params, setParams] = useSearchParams();
  const genre = params.get("genre") ?? "";
  const rawOrder = params.get("order") ?? "";
  const order = ["popular", "rating"].includes(rawOrder) ? rawOrder : "latest";
  const status = params.get("status") ?? "";

  const [items, setItems] = useState<Card[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [nextPage, setNextPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [appending, setAppending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const genrePool = useRef<Set<string>>(new Set());

  const load = useCallback(
    async (page: number, mode: "reset" | "append") => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const id = requestId.current + 1;
      requestId.current = id;

      if (mode === "reset") {
        setLoading(true);
        setItems([]);
        setHasNext(false);
        setNextPage(1);
        setTotalPages(null);
      } else {
        setAppending(true);
      }
      setError(null);

      try {
        const payload = await getList(
          source,
          { page, genre: genre || undefined, order, status: status || undefined },
          controller.signal,
        );
        if (id !== requestId.current) return;
        payload.items.forEach((card) => {
          (card.genres ?? []).forEach((name) => genrePool.current.add(name));
        });
        setGenres(Array.from(genrePool.current));
        setItems((previous) =>
          mode === "append" ? [...previous, ...payload.items] : payload.items,
        );
        setNextPage(payload.page + 1);
        setHasNext(Boolean(payload.hasNext));
        setTotalPages(payload.totalPages ?? null);
      } catch (reason) {
        if (controller.signal.aborted || id !== requestId.current) return;
        setError(errorMessage(reason));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setAppending(false);
        }
      }
    },
    [source, genre, order, status],
  );

  useEffect(() => {
    genrePool.current = new Set();
    setGenres([]);
    void load(1, "reset");
    return () => controllerRef.current?.abort();
  }, [load]);

  const updateParams = (next: { genre?: string; order?: string; status?: string }) => {
    const merged = { genre, order, status, ...next };
    const query = new URLSearchParams(params);
    if (merged.genre) query.set("genre", merged.genre);
    else query.delete("genre");
    if (merged.order && merged.order !== "latest") query.set("order", merged.order);
    else query.delete("order");
    if (merged.status) query.set("status", merged.status);
    else query.delete("status");
    setParams(query, { replace: true });
  };

  const chips = useMemo(() => {
    const extra = genres.filter((name) => !GENRE_CHIPS.includes(name));
    const list = [...GENRE_CHIPS, ...extra];
    return genre && !list.includes(genre) ? [genre, ...list] : list;
  }, [genre, genres]);

  const sourceName = sourceInfo?.name ?? source;

  return (
    <div className="browse-page">
      <header className="page-head container">
        <p className="mono mono--faint">{sourceName} · Katalog</p>
        <h1 className="page-head__title display">Jelajah</h1>
        <p className="page-head__sub mono mono--faint">
          {loading ? "Memuat daftar…" : `${items.length} judul dimuat`}
          {totalPages ? ` · ${totalPages} halaman` : ""}
        </p>
      </header>

      <div className="filters">
        <div className="container filters__inner">
          <div className="filters__genres no-scrollbar" role="group" aria-label="Filter genre">
            <button
              type="button"
              className="chip"
              aria-pressed={!genre}
              onClick={() => updateParams({ genre: "" })}
            >
              Semua
            </button>
            {chips.map((name) => (
              <button
                key={name}
                type="button"
                className="chip"
                aria-pressed={genre === name}
                onClick={() => updateParams({ genre: name })}
              >
                {name}
              </button>
            ))}
          </div>
          {status ? (
            <button
              type="button"
              className="chip chip--active"
              onClick={() => updateParams({ status: "" })}
              title="Hapus filter status"
            >
              Status: {STATUS_LABELS[status] ?? status} ✕
            </button>
          ) : null}
          <label className="filters__sort">
            <span className="mono mono--faint">Urut</span>
            <select
              className="select"
              value={order}
              onChange={(event) => updateParams({ order: event.target.value })}
              aria-label="Urutkan daftar"
            >
              {ORDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="container browse-page__body">
        {loading ? <GridSkeleton count={12} /> : null}

        {!loading && error && items.length === 0 ? (
          <ErrorCard message={error} onRetry={() => void load(1, "reset")} />
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <EmptyState
            label={sourceName}
            title="Tidak ada judul di sini."
            body={
              genre
                ? `Filter “${genre}” tidak mengembalikan apa pun. Coba genre lain atau lihat semua.`
                : "Sumber belum mengembalikan judul untuk halaman ini."
            }
          >
            {genre ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => updateParams({ genre: "" })}
              >
                Hapus filter
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void load(1, "reset")}
              >
                Muat ulang
              </button>
            )}
            <Link className="btn btn--quiet btn--sm" to="/">
              Kembali ke beranda
            </Link>
          </EmptyState>
        ) : null}

        {items.length > 0 ? (
          <>
            <div className="poster-grid" aria-busy={appending}>
              {items.map((card) => (
                <PosterCard
                  key={`${card.id}-${card.slug}`}
                  card={card}
                  source={source}
                  sourceName={sourceInfo?.name}
                  showSource
                />
              ))}
            </div>

            {error ? (
              <div className="browse-page__inline-error">
                <ErrorCard
                  compact
                  message={error}
                  onRetry={() => void load(nextPage, "append")}
                />
              </div>
            ) : null}

            <div className="browse-page__more">
              {hasNext ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={appending}
                  onClick={() => void load(nextPage, "append")}
                >
                  {appending ? "Memuat…" : "Muat lagi"}
                  <Icon name="arrowRight" size={14} />
                </button>
              ) : (
                <p className="mono mono--faint">Akhir daftar · {items.length} judul</p>
              )}
              {totalPages ? (
                <span className="mono mono--faint">
                  Halaman {Math.max(nextPage - 1, 1)} / {totalPages}
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
