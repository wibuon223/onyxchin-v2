import { Link } from "react-router-dom";
import { DOCS_URL } from "../lib/links";

export function Footer() {
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
          <a href={DOCS_URL} target="_blank" rel="noreferrer">
            API Docs
          </a>
        </nav>
        <p className="foot__note mono mono--faint">
          OnyxChin menampilkan katalog dan memutar tautan publik milik sumber pihak
          ketiga. Tidak menyimpan berkas video.
        </p>
      </div>
    </footer>
  );
}
