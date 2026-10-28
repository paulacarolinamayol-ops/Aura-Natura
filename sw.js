// Guarda los archivos de la app para que funcione sin internet.
// Cambiar VERSION en cada publicación para que el iPad descargue la versión nueva.
const VERSION = 'estudio-aura-v1';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/ui.js',
  'js/db.js',
  'js/store.js',
  'js/brand.js',
  'js/images.js',
  'js/zip.js',
  'js/backup.js',
  'js/views/marca.js',
  'js/views/originales.js',
  'js/views/respaldo.js',
  'fonts/Fraunces.woff2',
  'fonts/Fraunces-Italic.woff2',
  'fonts/Manrope.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Primero intenta internet, así siempre se ve la última versión;
// sin conexión, usa la copia guardada.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((cached) => cached || caches.match('index.html'))),
  );
});
