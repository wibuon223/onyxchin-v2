import { lazy, Suspense, useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { CommandPalette } from "./components/CommandPalette";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { SourcesProvider } from "./lib/sources";
import { Home } from "./pages/Home";

/* Watch pulls in hls.js (~200 kB); keep it out of the landing bundle. */
const Browse = lazy(() => import("./pages/Browse").then((module) => ({ default: module.Browse })));
const Detail = lazy(() => import("./pages/Detail").then((module) => ({ default: module.Detail })));
const Search = lazy(() => import("./pages/Search").then((module) => ({ default: module.Search })));
const Watch = lazy(() => import("./pages/Watch").then((module) => ({ default: module.Watch })));
const NotFound = lazy(() => import("./pages/NotFound").then((module) => ({ default: module.NotFound })));

function RouteLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="sr-only">Memuat halaman</span>
      <span className="route-loading__bar" aria-hidden="true" />
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SourcesProvider>
      <a className="skip" href="#konten">
        Lewati ke konten
      </a>
      <ScrollToTop />
      <Header onOpenSearch={() => setPaletteOpen(true)} />
      <main id="konten">
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/search" element={<Search />} />
            <Route path="/a/:source/:slug" element={<Detail />} />
            <Route path="/watch/:source/:slug/:ep" element={<Watch />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </SourcesProvider>
  );
}
