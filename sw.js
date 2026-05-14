// ════════════════════════════════════════════════════════════════════
// BiegaMy — Service Worker (PWA)
// ════════════════════════════════════════════════════════════════════
// Strategia cache:
//   - Statyczne pliki HTML/CSS/JS/fonty: stale-while-revalidate
//     (user dostaje natychmiast z cache, w tle pobierana świeża wersja)
//   - Storage Supabase (avatary, banery): cache-first
//   - REST API Supabase: network-first (z fallbackiem na cache)
//   - Strava API i inne external: network-only
//
// Update mechanism:
//   - Każdy deploy zmienia CACHE_VERSION → stary cache czyszczony
//   - skipWaiting + clients.claim → user dostaje nową wersję natychmiast
// ════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'biegamy-2026-05-14-a027b72';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const STORAGE_CACHE = `${CACHE_VERSION}-storage`;

// Pliki które chcemy mieć offline od samego start (precache)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/zawodnik.html',
  '/trener.html',
  '/profil.html',
  '/statystyki.html',
  '/odznaki.html',
  '/wyzwania.html',
  '/kalendarz.html',
  '/races.html',
  '/gra.html',
  '/o-nas.html',
  '/terms.html',
  '/sb.js',
  '/manifest.json',
  '/offline.html'
];

// Opcjonalne pliki — jeśli nie istnieją, NIE pokazuj ostrzeżenia
// Klaudiusz oczekuje że zostaną dodane w przyszłości (PWA ikony)
const OPTIONAL_PRECACHE_URLS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ─── INSTALL ─────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Install', CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        // Precache - tolerujemy częściowe niepowodzenie (np. brak jakiegoś pliku)
        const requiredPromise = Promise.allSettled(
          PRECACHE_URLS.map((url) => cache.add(url).catch((err) => {
            console.warn(`[SW] Precache failed for ${url}:`, err.message);
          }))
        );
        // Opcjonalne - cisza jeśli plik nie istnieje (PWA ikony jeszcze nie wgrane)
        const optionalPromise = Promise.allSettled(
          OPTIONAL_PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))
        );
        return Promise.all([requiredPromise, optionalPromise]);
      })
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then((names) => {
        // Usuń stare cache (z poprzednich wersji)
        return Promise.all(
          names
            .filter((name) => !name.startsWith(CACHE_VERSION))
            .map((name) => {
              console.log(`[SW] Deleting old cache: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// ─── FETCH STRATEGY ──────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Pomiń non-GET (POST/PUT/DELETE) — nie cachujemy
  if (request.method !== 'GET') return;

  // Pomiń requests z różnych protokołów (chrome-extension, etc)
  if (!url.protocol.startsWith('http')) return;

  // Pomiń Supabase Auth — zawsze przez sieć (login/refresh tokens)
  if (url.pathname.startsWith('/auth/v1/')) return;

  // Pomiń edge functions
  if (url.pathname.startsWith('/functions/v1/')) return;

  // Pomiń Strava i inne external API
  if (url.hostname.includes('strava.com')) return;
  if (url.hostname.includes('googleapis.com')) return;

  // Strategia per typ zasobu
  if (isStaticAsset(request, url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  } else if (isStorageAsset(url)) {
    event.respondWith(cacheFirst(request, STORAGE_CACHE));
  } else if (isSupabaseAPI(url)) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
  } else if (request.mode === 'navigate') {
    // Nawigacja do strony HTML
    event.respondWith(navigationHandler(request));
  }
  // Reszta — przeglądarka radzi sobie sama (network)
});

// ─── HELPERS: Czy zasób X to ... ────────────────────────────────────
function isStaticAsset(request, url) {
  // Lokalne HTML, CSS, JS, fonty, ikony — nasze pliki
  if (url.origin === self.location.origin) {
    return /\.(html|css|js|png|jpg|jpeg|svg|ico|woff2?|ttf|json)$/i.test(url.pathname)
      || url.pathname === '/';
  }
  return false;
}

function isStorageAsset(url) {
  // Supabase storage public assets (avatary, banery, zdjęcia)
  return url.hostname.includes('supabase.co') && url.pathname.includes('/storage/v1/object/public/');
}

function isSupabaseAPI(url) {
  // Supabase REST API
  return url.hostname.includes('supabase.co') && url.pathname.startsWith('/rest/v1/');
}

// ─── STRATEGIE ──────────────────────────────────────────────────────

// Stale-while-revalidate: zwróć cache od razu, w tle update
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached); // jeśli network fail i mamy cache, użyj cache

  return cached || networkPromise;
}

// Cache-first: szukaj w cache, dopiero potem network
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Offline', { status: 503 });
  }
}

// Network-first: spróbuj sieć, fallback na cache
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

// Navigation: spróbuj sieć, fallback na cache, ostatecznie offline.html
async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback na offline page
    const offline = await caches.match('/offline.html');
    return offline || new Response('Offline', { status: 503 });
  }
}

// ─── PUSH NOTIFICATIONS ─────────────────────────────────────────────
// Odbiór push z Web Push API
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // Plain text fallback
    data = { title: 'BiegaMy', body: event.data ? event.data.text() : 'Nowa aktywność' };
  }

  const title = data.title || 'BiegaMy';
  const options = {
    body: data.body || 'Masz nową aktywność',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    // UWAGA: każdy ai_report ma WŁASNY tag żeby nie zastępował się wzajemnie
    tag: data.tag || 'biegamy',
    data: {
      url: data.url || '/zawodnik.html',
      type: data.type,
      report_id: data.report_id || null
    },
    requireInteraction: false,
    silent: false,
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ════════════════════════════════════════════════════════════════════
// Klik w powiadomienie → otwórz odpowiedni URL
// ════════════════════════════════════════════════════════════════════
// PROBLEM którego unikamy:
//   - client.navigate(url) bywa ignorowany przez Chrome jeśli karta
//     jest już na zawodnik.html (różny query string nie wystarcza)
//   - client.focus() kończy event handler zanim navigate się dokona
//
// ROZWIĄZANIE:
//   - Jeśli karta jest otwarta → fokusuj + wyślij postMessage
//     do strony, która sama otworzy modal raportu (bez reload)
//   - Jeśli karta jest zamknięta → openWindow z deep-linkiem
//     (handler URL params w zawodnik.html zajmie się resztą)
// ════════════════════════════════════════════════════════════════════
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = data.url || '/zawodnik.html';
  const reportId = data.report_id || null;
  const notifType = data.type || null;

  // Wyciągnij ścieżkę i query do oddzielnych zmiennych — przyda się
  // przy decyzji "czy ta sama strona już jest otwarta"
  const targetPath = targetUrl.split('?')[0];

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    // Szukamy otwartej karty z BiegaMy (origin match)
    const myOrigin = self.location.origin;
    const matched = allClients.find((c) => {
      try {
        const u = new URL(c.url);
        return u.origin === myOrigin;
      } catch (e) {
        return false;
      }
    });

    if (matched) {
      // Karta otwarta — fokusuj i wyślij postMessage
      // (strona zdecyduje czy nawigować, czy tylko otworzyć modal)
      try {
        await matched.focus();
      } catch (e) {
        console.warn('[SW] focus failed', e);
      }

      // Wyślij wiadomość do strony — niech sama obsłuży deep-link
      try {
        matched.postMessage({
          type: 'PUSH_NOTIFICATION_CLICK',
          targetUrl: targetUrl,
          targetPath: targetPath,
          reportId: reportId,
          notifType: notifType
        });
      } catch (e) {
        console.warn('[SW] postMessage failed, fallback to navigate', e);
        // Fallback: jeśli postMessage nie zadziała, spróbuj navigate
        if ('navigate' in matched) {
          try { await matched.navigate(targetUrl); } catch (_) {}
        }
      }
      return;
    }

    // Brak otwartej karty — otwórz nową z pełnym URL (deep-link)
    // Handler URL params w zawodnik.html (linia ~7700) sam otworzy modal
    if (clients.openWindow) {
      return clients.openWindow(targetUrl);
    }
  })());
});

// ─── MESSAGE CHANNEL: pozwala apce kontrolować SW ────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
});
