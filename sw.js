/* Relative-path offline shell. Used only on HTTPS or localhost, never file://. */
const PREFIX = `michi-shell-${encodeURIComponent(self.registration.scope)}-`;
const CACHE = `${PREFIX}v1`;
const FILES = ['./', './index.html', './styles.css', './app.js', './deck.js', './srs.js', './grading.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  // Delete only caches created by this app in its own path scope.
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (!FILES.some(file => new URL(file, self.registration.scope).pathname === new URL(event.request.url).pathname)) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
