/* ─────────────────────────────────────────────────────────────────────────────
   „DZIŚ" OFFLINE — migawka ostatniego udanego ładowania karty „Dziś" (07.10.2026)

   PO CO: bez sieci zawodnik widział na „Dziś" fałszywe zdania („Brak zaplanowanego
   treningu na dziś.", „Brak planu na ten tydzień.") i pustą listę treningów — bo
   supabase-js przy braku sieci zwraca `{ data: null, error }`, a loadery traktowały
   null jak „nie ma". Teraz: po KAŻDYM udanym odczycie część widoku trafia do migawki,
   a przy błędzie SIECI (nie przy innych błędach) widok rysuje się z migawki i dostaje
   pasek „Offline · dane z HH:MM".

   TYLKO ODCZYT. Zapis offline (Background Sync) poza zakresem.

   GDZIE DANE: localStorage, klucz `bm_dzis_migawka_<user_id>`. Zmierzone 7.10 na prod
   (86 zawodników, 30 logów + 2 tygodnie planu + wiersz athletes): mediana 5,8 kB,
   p90 33 kB, max 37 kB — a „Dziś" bierze 5 logów, nie 30. Limit localStorage to ~5 MB
   na origin, więc nawet skrajny przypadek zajmuje poniżej 1%. IndexedDB dałoby
   asynchroniczność i brak limitu, ale kosztowałoby osobny kod otwierania bazy,
   wersjonowania i obsługi błędów — za 40 kB to nieproporcjonalne. Twardy limit
   LIMIT_B poniżej: większa migawka NIE jest zapisywana (zostaje poprzednia).

   PRYWATNOŚĆ: migawka trzyma WYŁĄCZNIE dane zalogowanego (klucz per user_id);
   `odczytaj(userId)` kasuje migawki innych kont, `wyczysc()` idzie z logout();
   w widoku trenera (?from=trener / sessionStorage._fromTrener) zapis jest wyłączony,
   żeby trener oglądający „Dziś" nie zostawił niczego w cudzej przeglądarce.

   Moduł działa w przeglądarce (window.DzisOffline) i w node (module.exports) —
   testy: tests/blizna-45-dzis-offline.test.js.
   ───────────────────────────────────────────────────────────────────────────── */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DzisOffline = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var PREFIX = 'bm_dzis_migawka_';
  var LIMIT_B = 200 * 1024;          // 200 kB — 5× p90 z pomiaru; powyżej zapis odrzucony
  var CZESCI = ['logi', 'dzis', 'tydzien', 'trener', 'postep', 'zawodnik', 'wiadomosc', 'hero'];
  // trener = flaga ma_trenera; postep = {trainings, logs} tygodnia; zawodnik = {id, full_name} (initAuth offline);
  // wiadomosc = ostatnia wiadomość trenera {body, sent_at}; hero = URL ostatnio WYŚWIETLONEGO kadru hero.
  // Części BEZ_CZASU nie przesuwają znacznika „dane z HH:MM" ani nie zdejmują paska offline: kadr hero
  // zapisuje się także offline (obraz z cache SW się załadował), a to nie jest świeża synchronizacja danych.
  var BEZ_CZASU = ['hero'];
  var M = {};

  M.PREFIX = PREFIX;
  M.LIMIT_B = LIMIT_B;
  M.CZESCI = CZESCI;
  M.BEZ_CZASU = BEZ_CZASU;
  M.HERO_DOMYSLNY = '/assets/ui/banery/baner-index-01.webp';   // origin biegamy.run, w PRECACHE_URLS sw.js
  M.DNI_TYGODNIA = 13;                                           // loadWeekPlan zapisuje dziś..+13
  M._storage = null;                 // test wstrzykuje atrapę; w przeglądarce = localStorage
  M._userIdCache = null;

  function storage() {
    if (M._storage) return M._storage;
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; }
  }
  M.klucz = function (userId) { return PREFIX + String(userId || ''); };

  /* Błąd SIECI, nie błąd danych: tylko wtedy wolno sięgnąć do migawki. 42501, PGRST*
     i reszta to prawdziwe odpowiedzi serwera — pokazanie przy nich starych danych
     ukryłoby usterkę. `navigator.onLine === false` liczy się jak błąd sieci. */
  M.czyBladSieci = function (error) {
    try { if (typeof navigator !== 'undefined' && navigator.onLine === false) return true; } catch (e) {}
    var m = String((error && (error.message || error.details)) || error || '');
    return /Failed to fetch|NetworkError|Load failed|network error|ERR_INTERNET_DISCONNECTED|fetch failed/i.test(m);
  };

  /* Widok trenera — żadnego zapisu. Ta sama definicja co w loadLogs (zawodnik.html). */
  M.widokTrenera = function () {
    try {
      if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('from') === 'trener') return true;
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('_fromTrener') === '1') return true;
    } catch (e) {}
    return false;
  };

  /* user_id z lokalnej sesji supabase-js — getSession() czyta localStorage, więc działa
     także offline (bez odświeżania tokenu). Wynik trzymany w pamięci strony. */
  M.userId = async function (sb) {
    if (M._userIdCache) return M._userIdCache;
    try {
      var r = await sb.auth.getSession();
      var id = r && r.data && r.data.session && r.data.session.user && r.data.session.user.id;
      if (id) M._userIdCache = id;
      return id || null;
    } catch (e) { return null; }
  };

  M.wyczysc = function () {
    var s = storage(); if (!s) return 0;
    var doKasacji = [];
    for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && k.indexOf(PREFIX) === 0) doKasacji.push(k); }
    doKasacji.forEach(function (k) { try { s.removeItem(k); } catch (e) {} });
    M._userIdCache = null;
    return doKasacji.length;
  };

  /* Migawka zalogowanego. Migawki INNYCH kont w tej przeglądarce są kasowane przy okazji —
     zmiana konta nie zostawia cudzych danych. */
  M.odczytaj = function (userId) {
    var s = storage(); if (!s || !userId) return null;
    var moj = M.klucz(userId);
    var obce = [];
    for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && k.indexOf(PREFIX) === 0 && k !== moj) obce.push(k); }
    obce.forEach(function (k) { try { s.removeItem(k); } catch (e) {} });
    try {
      var raw = s.getItem(moj); if (!raw) return null;
      var m = JSON.parse(raw);
      if (!m || m.userId !== userId || typeof m.ts !== 'number' || !m.czesci) return null;
      return m;
    } catch (e) { return null; }
  };

  /* Zapis JEDNEJ części po udanym odczycie. Zwraca true tylko, gdy coś zapisano. */
  M.zapisz = function (userId, czesc, dane) {
    if (!userId || CZESCI.indexOf(czesc) === -1) return false;
    if (M.widokTrenera()) return false;
    var s = storage(); if (!s) return false;
    var m = M.odczytaj(userId) || { userId: userId, ts: 0, czesci: {} };
    m.czesci[czesc] = (dane === undefined) ? null : dane;
    var zCzasem = BEZ_CZASU.indexOf(czesc) === -1;
    if (zCzasem) {
      m.ts = Date.now();
      if (czesc === 'tydzien') m.tydzienOd = M.dataLokalna(m.ts);   // początek zakresu dni z migawki (Plan offline)
    }
    var raw;
    try { raw = JSON.stringify(m); } catch (e) { return false; }
    if (raw.length > LIMIT_B) return false;
    try { s.setItem(M.klucz(userId), raw); } catch (e) { return false; }   // QuotaExceeded itp. = cicho
    if (zCzasem) M.ukryjPasek();
    return true;
  };

  M.dataLokalna = function (ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /* Zakres dni, które migawka „tydzien" naprawdę opisuje: od dnia zapisu do +13.
     Dzień poza zakresem = NIEZNANY (nie „bez treningu"). Bez migawki → null. */
  M.zakresTygodnia = function (m) {
    if (!m || !m.czesci || !('tydzien' in m.czesci) || !m.tydzienOd) return null;
    var p = m.tydzienOd.split('-').map(Number);
    var k = new Date(p[0], p[1] - 1, p[2] + M.DNI_TYGODNIA);
    return { od: m.tydzienOd, do: M.dataLokalna(k.getTime()) };
  };
  M.dzienWZakresie = function (zakres, ds) { return !!zakres && ds >= zakres.od && ds <= zakres.do; };

  /* Odczyt awaryjny: tylko przy błędzie sieci i tylko, gdy część JEST w migawce
     (`'dzis' in czesci` — zapisany null znaczy „nie było treningu", brak klucza znaczy
     „nie wiadomo"). Zwraca { dane, ts } albo null. Pokazuje pasek. */
  M.awaryjnie = function (userId, czesc, error) {
    if (!M.czyBladSieci(error)) return null;
    var m = M.odczytaj(userId); if (!m || !(czesc in m.czesci)) return null;
    M.pokazPasek(m.ts);
    return { dane: m.czesci[czesc], ts: m.ts };
  };

  M.formatCzas = function (ts) {
    var d = new Date(ts);
    var dzis = new Date();
    var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === dzis.toDateString()) return hm;
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + hm;
  };

  /* Pasek jak „Nowa wersja aplikacji" (sb.js bmPasekNowejWersji): dół nad nawigacją, z-index 400. */
  M.pokazPasek = function (ts) {
    if (typeof document === 'undefined') return;
    var p = document.getElementById('bm-offline-pasek');
    if (!p) {
      p = document.createElement('div');
      p.id = 'bm-offline-pasek';
      p.style.cssText = 'position:fixed;bottom:calc(env(safe-area-inset-bottom,0px) + 80px);left:50%;transform:translateX(-50%);' +
        'z-index:400;display:flex;align-items:center;gap:10px;background:rgba(20,15,30,0.96);border:1px solid rgba(255,255,255,0.14);' +
        'border-radius:12px;padding:9px 12px;font-family:\'DM Sans\',sans-serif;font-size:13px;color:#f0ede8;box-shadow:0 8px 24px rgba(0,0,0,0.45);max-width:92vw;';
      var txt = document.createElement('span'); txt.id = 'bm-offline-pasek-txt'; p.appendChild(txt);
      document.body.appendChild(p);
    }
    var t = document.getElementById('bm-offline-pasek-txt');
    if (t) t.textContent = 'Offline · dane z ' + M.formatCzas(ts);
  };
  M.ukryjPasek = function () {
    if (typeof document === 'undefined') return;
    var p = document.getElementById('bm-offline-pasek'); if (p) p.remove();
  };

  return M;
});
