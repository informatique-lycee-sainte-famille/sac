// ./front/public/sw.service_worker.js
const CACHE_NAME = "sac-pwa-v2";
const APP_SHELL = [
  "/",
  "/index.page.html",
  "/manifest.webmanifest.json",
  "/script.app.js",
  "/js/component_loader.loader.js",
  "/mentions-legales.html",
  "/politique-confidentialite.html",
  "/cookies.html",
  "/accessibilite.html",
  "/ressources/ensemble_scolaire_lyce_sainte_famille_saintonge_formation_logo_512x512.png",
  "/ressources/fond_page_login.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin || request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.page.html"))
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) return;

  if (
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.startsWith("/components/")
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    }))
  );
});
