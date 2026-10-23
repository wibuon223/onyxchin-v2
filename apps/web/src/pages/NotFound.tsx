import { Link } from "react-router-dom";
import { useTitle } from "../lib/useTitle";
import { Icon } from "../components/Icon";

export function NotFound() {
  useTitle("Halaman tidak ditemukan");

  return (
    <div className="notfound container">
      <p className="mono mono--faint">404 · Arsip</p>
      <h1 className="notfound__title display">Halaman ini tidak ada di arsip.</h1>
      <p className="notfound__body prose">
        Mungkin tautannya berubah, atau judulnya sudah ditarik dari sumber.
      </p>
      <div className="notfound__actions">
        <Link className="btn btn--accent" to="/">
          Kembali ke beranda
        </Link>
        <Link className="btn btn--ghost" to="/browse">
          Jelajah katalog
          <Icon name="arrowRight" size={14} />
        </Link>
      </div>
    </div>
  );
}
