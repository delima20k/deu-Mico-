/**
 * Service Worker — Deu Mico PWA
 * Estratégia: Cache First para assets estáticos, Network First para dados.
 */

const CACHE_NAME = 'deu-mico-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/css/animations.css',
  '/css/menu.css',
  '/css/phase3.css',
  '/css/game-table.css',
  '/css/hex-table.css',
  '/css/card-deck-pile.css',
  '/css/deck-deal.css',
  '/css/deck-shuffle.css',
  '/css/deck-action-panel.css',
  '/css/hand-modal.css',
  '/img/carta_logo.png',
  '/img/logoMarca.png',
  '/img/carta_home.png',
  '/img/carta_verso.png',
  '/img/baixa-android.png',
  '/img/baixaIOS.png',
];

// ── Instalação: pré-cache dos assets principais ────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Ativação: remove caches antigos ───────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Cache First para assets estáticos ──────────────────────────────
self.addEventListener('fetch', (event) => {
  // Ignora requisições não-GET e origens externas (Firebase, fonts, etc.)
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Armazena em cache somente respostas válidas
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
