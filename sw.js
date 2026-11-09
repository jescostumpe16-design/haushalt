// Offline-Cache: Die App-Dateien liegen auf dem Handy, damit sie auch ohne Netz startet.
// Nach einem Update hier die Versionsnummer erhöhen, dann holen sich die Handys die neue Version.
const VERSION = 'haushalt-v1';
const SHELL = [
  './', './index.html', './app.js', './config.js', './manifest.webmanifest',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Firebase-Bibliothek und Schriften: einmal laden, danach aus dem Cache.
const CACHE_FIRST = [/^https:\/\/www\.gstatic\.com\/firebasejs\//, /^https:\/\/fonts\.gstatic\.com\//];
const REFRESH_IN_BACKGROUND = [/^https:\/\/fonts\.googleapis\.com\//];

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  const sameOrigin = new URL(url).origin === self.location.origin;

  if (CACHE_FIRST.some(r => r.test(url))) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  if (sameOrigin || REFRESH_IN_BACKGROUND.some(r => r.test(url))) {
    // Sofort aus dem Cache antworten und im Hintergrund aktualisieren.
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req, { ignoreSearch: sameOrigin });
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
  // Alles andere (Datenbank, Anmeldung, Scan-Server) geht direkt ins Netz.
});
