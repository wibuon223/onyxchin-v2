import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/pages.css";
import { attachAutoPush, startSync } from "./lib/sync";

const root = document.getElementById("root");
if (!root) throw new Error("Elemen #root tidak ditemukan");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// Cross-device history: pull at boot, push on every local save.
attachAutoPush();
startSync();

// PWA: register the service worker in production builds only.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
