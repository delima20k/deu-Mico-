/**
 * Service Worker — Deu Mico PWA
 *
 * Estratégias:
 *   - STATIC_ASSETS  → Cache First (pré-cache no install, serve offline)
 *   - /api/*         → Network Only  (dados em tempo real, nunca cacheados)
 *   - Navegação SPA  → Network First → fallback cache → fallback /offline.html
 *   - Outros GET      → Stale-While-Revalidate
 *
 * Para invalidar o cache em produção: incremente CACHE_VERSION.
 */

const CACHE_VERSION = 'v9';
const CACHE_NAME    = `deu-mico-${CACHE_VERSION}`;

/** Assets pré-cacheados no install — todos devem existir em produção. */
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
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
  '/css/ads.css',
  '/img/carta_logo.png',
  '/img/logoMarca.png',
  '/img/carta_home.png',
  '/img/carta_verso.png',
  '/img/carta_mico.png',
  '/img/baixa-android.png',
  '/img/baixaIOS.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

/**
 * Origens que NUNCA devem ser interceptadas pelo SW.
 * Firebase usa WebSocket (wss://) e long-polling (https://); qualquer
 * interferência do SW pode bloquear a sincronização em tempo real no Android.
 */
const FIREBASE_BYPASS_HOSTNAMES = [
  'firebaseio.com',
  'googleapis.com',
  'firebase.com',
  'firebaseapp.com',
  'firebasestorage.googleapis.com',
  'gstatic.com',
];

// ── Install: pré-cache dos assets essenciais ──────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: expira caches de versões anteriores ─────────────────────────
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

// ── Message: responde imediatamente para não deixar canal de mensagem aberto ─
// Evita: "A listener indicated an asynchronous response by returning true,
//         but the message channel closed before a response was received"
// O Firebase Auth SDK envia mensagens ao SW durante o fluxo de autenticação;
// sem este handler, o canal fecha sem resposta e gera warnings/instabilidade.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  // Notifica todos os clientes para chamar goOnline() no Firebase
  // (o SW não tem acesso direto ao Firebase SDK)
  if (event.data && event.data.type === 'FIREBASE_GOTO_ONLINE') {
    self.clients.matchAll({ type: 'window' }).then(clients => {
      clients.forEach(client => client.postMessage({ type: 'RECONNECT_FIREBASE' }));
    });
    return;
  }
  // Responde imediatamente a qualquer outra mensagem (Firebase Auth, etc.)
  if (event.ports && event.ports[0]) {
    event.ports[0].postMessage({ handled: false });
  }
});

// ── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Só intercepta GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1a. Origens Firebase/Google → nunca interceptar (WebSocket + long-polling)
  if (FIREBASE_BYPASS_HOSTNAMES.some(h => url.hostname.endsWith(h))) {
    return; // passa direto para o browser/network
  }

  // 1b. Requisições de API ou qualquer outra origem externa → Network Only
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
    return; // deixa o browser tratar normalmente
  }

  // 2. Navegação SPA → Network First, fallback cache, fallback offline.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          // Atualiza cache com resposta fresca
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(event.request)
            .then((cached) => cached || caches.match('/offline.html'))
        )
    );
    return;
  }

  // 3. Assets estáticos → Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(event.request, res.clone());
            }
            return res;
          })
          .catch(() => cached); // offline: usa cache se disponível

        // Retorna cache imediatamente e atualiza em background
        return cached || networkFetch;
      })
    )
  );
});

