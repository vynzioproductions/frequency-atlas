// Caches the app shell so it opens fast and works as an installed app.
const CACHE = 'freq-atlas-v28';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'history.js', 'engine.js', 'data.js', 'library.js', 'auto.js', 'composite.js', 'clock.js', 'dj.js', 'broadcast.js', 'durations.js', 'builder-auto.js', 'builder.js', 'sync.js', 'config.js', 'accounts.js', 'yt.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // map tiles, fonts and Spotify go straight to the network
  // network first, so updates you upload show up right away; cache as the offline fallback
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
