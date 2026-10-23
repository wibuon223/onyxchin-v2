import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { DOCS_URL } from "../lib/links";
import { clearRecentSearches, pushRecentSearch, readRecentSearches } from "../lib/prefs";
import { useSources } from "../lib/sources";
import { Icon } from "./Icon";
import { SourceSegmented } from "./SourceSegmented";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

/**
 * One command surface for search: header button, ⌘K/Ctrl+K and the mobile sheet
 * all land here, so there is never a second competing search field.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const { source, sourceInfo } = useSources();

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setRecents(readRecentSearches());
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  const submit = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setRecents(pushRecentSearch(value));
    onClose();
    navigate(`/search?q=${encodeURIComponent(value)}`);
  };

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  };

  const trimmed = query.trim();

  return (
    <div className="cmdk">
      <button
        type="button"
        className="cmdk__backdrop"
        aria-label="Tutup pencarian"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        className="cmdk__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Cari di OnyxChin"
        ref={panelRef}
        onKeyDown={onPanelKeyDown}
      >
        <form
          className="cmdk__field"
          onSubmit={(event) => {
            event.preventDefault();
            submit(query);
          }}
        >
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            className="cmdk__input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Cari di ${sourceInfo?.name ?? source}…`}
            aria-label="Kata kunci pencarian"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          <span className="kbd" aria-hidden="true">
            ESC
          </span>
        </form>

        <div className="cmdk__section">
          <p className="mono mono--faint cmdk__label">Sumber aktif</p>
          <SourceSegmented compact wrap />
        </div>

        {trimmed ? (
          <button type="button" className="cmdk__go" onClick={() => submit(query)}>
            <span className="cmdk__go-text">Cari “{trimmed}”</span>
            <span className="mono mono--faint">di {sourceInfo?.name ?? source}</span>
            <Icon name="arrowRight" size={15} />
          </button>
        ) : null}

        {!trimmed && recents.length > 0 ? (
          <div className="cmdk__section">
            <div className="cmdk__label-row">
              <p className="mono mono--faint cmdk__label">Pencarian terakhir</p>
              <button
                type="button"
                className="mono cmdk__clear"
                onClick={() => {
                  clearRecentSearches();
                  setRecents([]);
                }}
              >
                Hapus
              </button>
            </div>
            <ul className="cmdk__list">
              {recents.map((item, index) => (
                <li key={item}>
                  <button type="button" className="cmdk__row" onClick={() => submit(item)}>
                    <span className="mono mono--faint cmdk__idx">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="cmdk__row-text">{item}</span>
                    <Icon name="arrowRight" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="cmdk__section">
          <p className="mono mono--faint cmdk__label">{trimmed ? "Lompat ke" : "Jelajahi"}</p>
          <ul className="cmdk__list">
            <li>
              <button type="button" className="cmdk__row" onClick={() => go("/browse")}>
                <span className="mono mono--faint cmdk__idx">→</span>
                <span className="cmdk__row-text">Jelajah semua judul</span>
                <Icon name="arrowRight" size={14} />
              </button>
            </li>
            <li>
              <button type="button" className="cmdk__row" onClick={() => go("/")}>
                <span className="mono mono--faint cmdk__idx">→</span>
                <span className="cmdk__row-text">Beranda</span>
                <Icon name="arrowRight" size={14} />
              </button>
            </li>
            <li>
              <a
                className="cmdk__row"
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                onClick={onClose}
              >
                <span className="mono mono--faint cmdk__idx">↗</span>
                <span className="cmdk__row-text">API Docs</span>
                <Icon name="external" size={14} />
              </a>
            </li>
          </ul>
        </div>

        <div className="cmdk__foot mono mono--faint">
          <span>
            <span className="kbd">↵</span> Cari
          </span>
          <span>
            <span className="kbd">ESC</span> Tutup
          </span>
          <span className="cmdk__foot-source">{sourceInfo?.name ?? source}</span>
        </div>
      </div>
    </div>
  );
}
