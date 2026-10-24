import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { DOCS_URL, NAV_LINKS } from "../lib/links";
import { Icon } from "./Icon";
import { SourceSegmented } from "./SourceSegmented";

export interface HeaderProps {
  onOpenSearch: () => void;
}

export function Header({ onOpenSearch }: HeaderProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sheetOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  const openSearch = () => {
    setSheetOpen(false);
    onOpenSearch();
  };

  return (
    <header className="head">
      <div className="head__bar">
        <div className="head__inner container">
          <Link className="brand" to="/" aria-label="OnyxChin — beranda">
            <span className="brand__word">ONYX</span>
            <span className="brand__accent">CHIN</span>
          </Link>

          <nav className="head__nav" aria-label="Navigasi utama">
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `head__link${isActive ? " is-active" : ""}`}
              >
                {item.label}
              </NavLink>
            ))}
            <a className="head__link head__docs" href={DOCS_URL} target="_blank" rel="noreferrer">
              API Docs
              <Icon name="external" size={11} />
            </a>
          </nav>

          <div className="head__tools">
            <div className="head__sources">
              <SourceSegmented compact />
            </div>
            <button
              type="button"
              className="head__search"
              onClick={openSearch}
              aria-label="Cari donghua"
              aria-keyshortcuts="Meta+K Control+K"
            >
              <Icon name="search" size={15} />
              <span className="head__search-text">Cari</span>
              <span className="kbd head__kbd">⌘K</span>
            </button>
            <button
              type="button"
              className="head__burger"
              onClick={() => setSheetOpen((value) => !value)}
              aria-expanded={sheetOpen}
              aria-controls="mobile-menu"
              aria-label={sheetOpen ? "Tutup menu" : "Buka menu"}
            >
              <Icon name={sheetOpen ? "close" : "menu"} size={19} />
            </button>
          </div>
        </div>
      </div>

      {sheetOpen ? (
        <div className="sheet" id="mobile-menu">
          <button
            type="button"
            className="sheet__backdrop"
            onClick={() => setSheetOpen(false)}
            aria-label="Tutup menu"
            tabIndex={-1}
          />
          <div className="sheet__panel" role="dialog" aria-modal="true" aria-label="Menu">
            <nav className="sheet__nav" aria-label="Navigasi seluler">
              {NAV_LINKS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `sheet__link display${isActive ? " is-active" : ""}`
                  }
                  onClick={() => setSheetOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
              <a
                className="sheet__link display"
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() => setSheetOpen(false)}
              >
                API Docs
                <Icon name="external" size={15} />
              </a>
            </nav>
            <div className="sheet__block">
              <p className="mono mono--faint">Sumber</p>
              <SourceSegmented wrap />
            </div>
            <button type="button" className="btn btn--ghost sheet__search" onClick={openSearch}>
              <Icon name="search" size={15} />
              Cari donghua
              <span className="kbd">⌘K</span>
            </button>
            <p className="sheet__note mono mono--faint">OnyxChin · 4 sumber</p>
          </div>
        </div>
      ) : null}
    </header>
  );
}
