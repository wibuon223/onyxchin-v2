/*
 * OnyxChin service worker.
 *
 * Goals: instant repeat visits and a usable app shell offline. Media is never
 * cached — episode files are hundreds of MB and the URLs are signed.
 */
const VERSION = "onyxchin-v1";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const SHELL_ASSETS = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => undefined));
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

  // App shell / static assets: cache first, then network.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((response) => {
          if (
            response.ok &&
            (request.destination === "script" ||
              request.destination === "style" ||
              request.mode === "navigate")
          ) {
            const copy = response.clone();
            caches.open(RUNTIME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          if (request.mode === "navigate") {
            const shell = await caches.match("/");
            if (shell) return shell;
          }
          throw new Error("offline");
        });
    })
  );
});
