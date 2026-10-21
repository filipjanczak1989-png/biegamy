/* Klient publicznego API wyników https://api.biegamy.run (F6, serwer wyników) — klasyczny skrypt, bez modułów ES:
     <script src="js/wyniki-api.js"> po sb.js;  var api = window.wynikiApi(sb);  await api.rpc('search_runners', { q })
   Zwraca { data, error } jak sb.rpc, więc widżet wyszukiwarki i usun-dane.html mają jeden kształt odpowiedzi.

   Zasady:
   - WYNIKI_API_WLACZONE = false → żadnego zapytania do api.biegamy.run (error.kod 'wylaczone'). Zmiana na true to U3 (B8).
   - Tylko środowisko 'prod' (BM_SRODOWISKO z sb.js): serwer przyjmuje wyłącznie tokeny Supabase PROD, więc tokenu
     TEST nie wysyłamy wcale (error.kod 'srodowisko').
   - Token: przy każdym wywołaniu z sb.auth.getSession(), tylko w nagłówku Authorization. Nie zapisujemy go nigdzie
     (bez localStorage/sessionStorage/zmiennych modułu), nie logujemy, nie wkładamy do komunikatów błędów.
   - credentials 'omit', cache 'no-store', redirect 'error'; timeout (domyślnie 15 s) przez AbortController.
   - Tylko RPC z listy RPC_DOZWOLONE — ta sama lista co w Caddy (caddy-f6-api.caddy) i f6.bramka; inne nazwy nie wychodzą.
   - 401 → jedno sb.auth.refreshSession() i ponowienie; potem error.kod 'nieautoryzowany'.
   - Kody błędów: status HTTP (0 = sieć/timeout/offline), kod (stały, po polsku), retryAfter (s, z nagłówka Retry-After),
     komunikat (TYLKO tekst z funkcji SQL 012 — kody PT4xx — inne treści odpowiedzi serwera nie wychodzą do UI). */
(function () {
  'use strict';

  var WYNIKI_API_WLACZONE = false;
  var API_URL = 'https://api.biegamy.run';
  var TIMEOUT_MS = 15000;
  var RPC_DOZWOLONE = ['search_runners', 'runner_results', 'upcoming_races', 'event_course_status',
    'erasure_preview', 'erasure_request', 'erasure_confirm', 'erasure_cancel', 'erasure_status'];
  var KODY = { 400: 'zle_dane', 401: 'nieautoryzowany', 403: 'odmowa', 404: 'brak', 413: 'za_duze', 429: 'limit' };

  function blad(status, kod, extra) {
    var e = { status: status, kod: kod, retryAfter: null, komunikat: null };
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return { data: null, error: e };
  }

  function retryAfter(res) {
    var h = res && res.headers && typeof res.headers.get === 'function' ? res.headers.get('Retry-After') : null;
    var n = Number(h);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  async function token(sb) {
    try {
      var r = await sb.auth.getSession();
      var s = r && r.data && r.data.session;
      return s && s.access_token ? s.access_token : null;
    } catch (e) { return null; }
  }

  function wynikiApi(sb, opts) {
    opts = opts || {};
    var fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch.bind(window) : null);
    var timeoutMs = opts.timeoutMs || TIMEOUT_MS;

    async function zapytanie(nazwa, args, tok) {
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var t = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs) : null;
      try {
        return await fetchImpl(API_URL + '/rpc/' + nazwa, {
          method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + tok },
          body: JSON.stringify(args || {}),
          signal: ctrl ? ctrl.signal : undefined,
        });
      } catch (e) {
        return { _bladSieci: true, timeout: !!(e && e.name === 'AbortError') };
      } finally {
        if (t) clearTimeout(t);
      }
    }

    async function rpc(nazwa, args) {
      if (!WYNIKI_API_WLACZONE) return blad(0, 'wylaczone');
      if (window.BM_SRODOWISKO !== 'prod') return blad(0, 'srodowisko');
      if (RPC_DOZWOLONE.indexOf(nazwa) < 0) return blad(0, 'nieznane_rpc');
      if (!fetchImpl) return blad(0, 'siec');
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return blad(0, 'offline');
      var tok = await token(sb);
      if (!tok) return blad(401, 'brak_sesji');

      var res = await zapytanie(nazwa, args, tok);
      if (!res._bladSieci && res.status === 401) {
        try { await sb.auth.refreshSession(); } catch (e) { /* zostaje 401 */ }
        var tok2 = await token(sb);
        if (!tok2) return blad(401, 'brak_sesji');
        res = await zapytanie(nazwa, args, tok2);
      }
      if (res._bladSieci) return blad(0, res.timeout ? 'timeout' : 'siec');

      var tresc = null;
      try { tresc = await res.json(); } catch (e) { tresc = null; }
      if (res.ok) return { data: tresc, error: null };

      var kod = KODY[res.status] || (res.status >= 500 ? 'serwer' : 'blad');
      // komunikat tylko z funkcji 012 (raise sqlstate 'PT4xx'): stałe zdania po polsku, bez danych osób
      var komunikat = tresc && typeof tresc.code === 'string' && /^PT4\d\d$/.test(tresc.code) && typeof tresc.message === 'string'
        ? tresc.message.slice(0, 300) : null;
      return blad(res.status, kod, { retryAfter: retryAfter(res), komunikat: komunikat });
    }

    return { rpc: rpc };
  }

  // Czy wywołanie ma sens na tej stronie: flaga + środowisko prod. Widżet i usun-dane.html pytają o to przed użyciem.
  function dostepne() { return WYNIKI_API_WLACZONE === true && window.BM_SRODOWISKO === 'prod'; }

  window.wynikiApi = wynikiApi;
  window.wynikiApiDostepne = dostepne;
  if (!('WYNIKI_API_WLACZONE' in window)) Object.defineProperty(window, 'WYNIKI_API_WLACZONE', { value: WYNIKI_API_WLACZONE, writable: false, configurable: false });
  window._wynikiApi = { RPC_DOZWOLONE: RPC_DOZWOLONE.slice(), API_URL: API_URL, TIMEOUT_MS: TIMEOUT_MS };
})();
