/*
 * OnyxChin service worker.
 *
 * Goals: instant repeat visits and a usable shell offline. Media is never
 * cached — episode files are hundreds of MB and the URLs are signed.
 *
 * Navigation is NETWORK-FIRST on purpose: a cached document pins the hashed
 * bundle from the deploy it was cached on, so users would keep an old build
 * forever. Only fall back to the cached shell when the network is gone.
 */
const VERSION = "onyxchin-v2";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const SHELL_ASSETS = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const isMedia = (url) =>
  url.pathname.startsWith("/api/media") ||
  url.pathname.startsWith("/api/hls") ||
  /\.(mp4|m4s|ts|m3u8)$/i.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin && !url.pathname.startsWith("/api/")) return;
  if (isMedia(url)) return; // let the network handle video entirely

  // Documents: always ask the network so the shell matches the current deploy.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const direct = await caches.match(request);
          if (direct) return direct;
          const shell = await caches.match("/");
          if (shell) return shell;
          throw new Error("offline");
        })
    );
    return;
  }

  // API JSON: network first, fall back to the last good copy when offline.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? Response.error()))
    );
    return;
  }

  // Hashed build assets are immutable: cache first.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      });
    })
  );
});
