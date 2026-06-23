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

const CACHE_VERSION = 'biegamy-2026-06-23-eb35a78';
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
  '/narzedzia.html',
  '/odznaki.html',
  '/wyzwania.html',
  '/kalendarz.html',
  '/compare.html',
  '/races.html',
  '/gra.html',
  '/o-nas.html',
  '/terms.html',
  '/sb.js',
  '/theme.css',
  '/manifest.json',
  '/offline.html'
];

// Opcjonalne pliki — jeśli nie istnieją, NIE pokazuj ostrzeżenia
// Klaudiusz oczekuje że zostaną dodane w przyszłości (PWA ikony)
const OPTIONAL_PRECACHE_URLS = [
  '/icon-192.png',
  '/icon-512.png'
];

// ─── INSTALL ─────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Install', CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        // Precache resilience: cache'uj TYLKO świeżą odpowiedź 200 OK.
        // Chroni przed zatruciem cache błędną/pustą theme.css przy wyścigu z propagacją deployu
        // (cache.add nie odrzuca 200-empty/opaque). cache:'reload' = pomiń HTTP-cache, weź z sieci.
        const cacheIfOk = (url, quiet) =>
          fetch(new Request(url, { cache: 'reload' }))
            .then((res) => {
              if (res && res.ok && res.status === 200) return cache.put(url, res.clone());
              if (!quiet) console.warn(`[SW] Precache skip (status ${res && res.status}): ${url}`);
            })
            .catch((err) => { if (!quiet) console.warn(`[SW] Precache failed for ${url}:`, err.message); });
        // Wymagane - tolerujemy częściowe niepowodzenie (plik dociągnie się runtime)
        const requiredPromise = Promise.allSettled(PRECACHE_URLS.map((url) => cacheIfOk(url, false)));
        // Opcjonalne - cisza jeśli plik nie istnieje (PWA ikony jeszcze nie wgrane)
        const optionalPromise = Promise.allSettled(OPTIONAL_PRECACHE_URLS.map((url) => cacheIfOk(url, true)));
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

  // Pomiń pliki media (audio/wideo) — MUSZĄ iść bezpośrednio do sieci.
  // <audio>/<video> odtwarza żądaniami zakresowymi (Range → 206 Partial Content).
  // SW nie obsługuje Range, a cacheFirst zwracałby pełne 200 / nie cache'uje 206
  // → odtwarzanie urywa się w tle / przy zgaszonym ekranie (iOS wymaga natywnego,
  // range-capable zasobu dla background audio). Radio (radio-audio/*.mp4) gra przez to.
  if (/\.(mp4|m4a|mp3|webm|ogg|wav|aac|mov|m4v)$/i.test(url.pathname)) return;

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
  // FIX (2026-05-27): ikony są w root, NIE /icons/ (404). Self-heal payloadów z EF —
  //   data.icon bywa ABSOLUTNY ("https://biegamy.run/icons/...") więc replace BEZWARUNKOWY
  //   (łapie relatywną i absolutną formę; no-op gdy brak /icons/). EF send-push do poprawy u źródła.
  let icon  = (data.icon  || '/icon-192.png').replace('/icons/', '/');
  let badge = (data.badge || 'https://filipjanczak1989-png.github.io/biegamy-assets/icon-badge.png').replace('/icons/', '/');
  const options = {
    body: data.body || 'Masz nową aktywność',
    icon: icon,
    badge: badge,
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

// ─── PUSH SUBSCRIPTION AUTO-HEAL (W3, 2026-05-26) ────────────────────
// Gdy przeglądarka rotuje/unieważnia subskrypcję push, odpala
// pushsubscriptionchange. Bez handlera subskrypcja umiera cicho → DB ma
// stary endpoint → push przestaje działać aż user ręcznie włączy.
// Handler: re-subskrybuje (sub zostaje żywa) + best-effort postMessage do
// otwartej karty, która (authenticated) zapisze nowy endpoint. Reszta:
// reconcile w sb.js przy następnym otwarciu app (catch-all).
// VAPID PUBLIC key (NIE secret) — identyczny z sb.js.
const SW_VAPID_PUBLIC_KEY = 'BATC1Y7rglazNCcKQXV1bqaNA_SnxC3003c5_eSKDBaUykhbZSUevTQDL-KMyVDs55oNBJogJkx4g_5irwUObTk';
function _swUrlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
self.addEventListener('pushsubscriptionchange', (event) => {
  const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint;
  console.log('[SW] pushsubscriptionchange', oldEndpoint ? oldEndpoint.slice(-20) : '(no old)');
  event.waitUntil((async () => {
    try {
      let sub = event.newSubscription;
      if (!sub) {
        sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: _swUrlBase64ToUint8Array(SW_VAPID_PUBLIC_KEY)
        });
      }
      // SW nie ma auth session → nie zapisze do DB (RLS own-scoped).
      // Powiadom otwarte karty, by zrobiły authenticated upsert.
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      wins.forEach((c) => c.postMessage({ type: 'push-resubscribed', oldEndpoint: oldEndpoint || null }));
    } catch (e) {
      console.warn('[SW] pushsubscriptionchange resubscribe failed', e);
    }
  })());
});
