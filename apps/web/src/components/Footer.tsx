import { useState } from "react";
import { Link } from "react-router-dom";
import { DOCS_URL } from "../lib/links";
import { Icon } from "./Icon";
import { SyncDialog } from "./SyncDialog";
import { getSyncCode } from "../lib/sync";

export function Footer() {
  const [syncOpen, setSyncOpen] = useState(false);
  return (
    <footer className="foot">
      <div className="container foot__inner">
        <div className="foot__brand">
          <p className="brand brand--sm" aria-label="OnyxChin">
            <span className="brand__word">ONYX</span>
            <span className="brand__accent">CHIN</span>
          </p>
          <p className="foot__tag mono mono--faint">Donghua, tanpa derau.</p>
        </div>
        <nav className="foot__nav" aria-label="Navigasi footer">
          <Link to="/">Beranda</Link>
          <Link to="/browse">Jelajah</Link>
          <button type="button" className="foot__link" onClick={() => setSyncOpen(true)}>
            <Icon name="link" size={12} />
            {getSyncCode() ? "Tersinkron" : "Sinkron perangkat"}
          </button>
          <a href={DOCS_URL} target="_blank" rel="noreferrer">
            API Docs
          </a>
        </nav>
        <p className="foot__note mono mono--faint">OnyxChin — indeks katalog &amp; pemutar.</p>
      </div>
      <SyncDialog open={syncOpen} onClose={() => setSyncOpen(false)} />
    </footer>
  );
}
