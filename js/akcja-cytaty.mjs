// CYTATY AKCJI (decyzja Filipa 2.11.2026) — baner cytatu na Dziś (#daily-motivation), PO filmie i bez filmu.
// Plik BEZ import/export (globalThis.BM_AKCJA_CYTATY), jak js/plan-pusty.mjs: <script src> w zawodnik.html i import w testach.
// Dzień liczony w Europe/Warsaw (nie UTC, nie strefa urządzenia). Cytat akcji ma pierwszeństwo przed zwykłym cytatem
// dnia i przed „Twój plan"; poza datami akcji — null, czyli zwykłe cytaty bez zmian (blizna-92).
//   DATA STARTU W JEDNYM MIEJSCU (Filip 2.11 16:22: sobota 7.11, nie niedziela 8.11): DZIEN_STARTU niżej = akcje.start
//   w bazie; dzień rotacji, okno guzika i zapis daty w tekstach są z niej LICZONE (blizna-92/96 pilnują równości z migracją).
//   - 2.11 … dzień przed startem: teaser dzień po dniu (nic nie zdradza; 2–5.11 bez zmian po przesunięciu);
//   - DZIEŃ STARTU przed naciśnięciem: „Dziś. Jedno kliknięcie zmieni wszystko."; po nim (opóźniony start) „Jedno kliknięcie…";
//   - dzień startu PO starcie: „12 500 kilometrów. Jeden powód. Fabianek."; od następnego dnia po starcie: rotacja ROTACJA;
//   Start akcji = czyAkcjaRuszyla() — stan z bazy (RPC akcja_licznik) wpisywany przez odswiezStan() → ustawStan();
//   bez zgadywania po godzinie. Konto testowe czyta akcję 'proba' (slugDla).
//   - po zamknięciu (ZAMKNIETA = true + ZAMKNIETA_OD, docelowo ze stanu akcja_licznik): jeden cytat przez 7 dni, potem null.
(function (g) {
  "use strict";
  var ZRODLO = "BiegaMy · akcja";
  var ZAMKNIETA = false;          // AKCJA_ZAMKNIETA — do czasu tabeli akcja_licznik ręcznie
  var ZAMKNIETA_OD = null;        // 'YYYY-MM-DD' (Warszawa) — dzień zamknięcia; bez niego zamknięcie nie ma okna 7 dni
  var TEASER = {
    "2026-11-02": "Może lepiej było nie zaczynać. Za późno.",
    "2026-11-03": "Ktoś już zawiązał buty. Jeszcze nie wiesz po co.",
    "2026-11-04": "Na mapie pojawiła się linia. Daleka. Bardzo daleka.",
    "2026-11-05": "Liczba jest gotowa. Brakuje tylko ludzi.",
    // 6.11 = ostatni dzień teasera (przesunięcie startu na 7.11). „Peleryny wiszą w szafie. Jeszcze dwa dni." wypadło —
    // liczyło dni do starego terminu.
    "2026-11-06": "Jutro wszystko stanie się jasne.",
  };
  var DZIEN_STARTU = "2026-11-07", PRZED_STARTEM = "Jedno kliknięcie zmieni wszystko.", W_DNIU_STARTU = "12 500 kilometrów. Jeden powód. Fabianek.";
  var DZIS_PRZED_STARTEM = "Dziś. " + PRZED_STARTEM;
  function dodajDni(d, n) { var x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  var MIESIACE_D = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  var DATA_KROTKA = Number(DZIEN_STARTU.slice(8, 10)) + "." + DZIEN_STARTU.slice(5, 7);                        // „7.11"
  var DATA_SLOWNIE = Number(DZIEN_STARTU.slice(8, 10)) + " " + MIESIACE_D[Number(DZIEN_STARTU.slice(5, 7)) - 1];  // „7 listopada"
  /* Okno guzika = akcje.okno_startu_od/do: dzień startu 04:00–23:59:59 Europe/Warsaw. Listopad = CET (UTC+1), bez zmiany czasu. */
  var OKNO_STARTU = { od: Date.parse(DZIEN_STARTU + "T04:00:00+01:00"), do: Date.parse(DZIEN_STARTU + "T23:59:59+01:00") };
  /* STAN AKCJI — JEDNO miejsce podłączenia (projekt F, guzik Fabianka): odczyt stanu z bazy przez RPC akcji woła
     ustawStan({ ruszyla, zamknieta, zamknietaOd }). Do tego czasu nikt go nie woła → akcja „nie ruszyła". */
  var STAN = { ruszyla: false, zamknieta: ZAMKNIETA, zamknietaOd: ZAMKNIETA_OD, proba: false };
  function ustawStan(s) {
    if (!s || typeof s !== "object") return;
    if (s.proba != null) STAN.proba = s.proba === true;
    if (s.ruszyla != null) STAN.ruszyla = s.ruszyla === true;
    if (s.zamknieta != null) STAN.zamknieta = s.zamknieta === true;
    if (s.zamknietaOd != null) STAN.zamknietaOd = /^\d{4}-\d{2}-\d{2}$/.test(String(s.zamknietaOd)) ? String(s.zamknietaOd) : null;
  }
  function czyAkcjaRuszyla() { return STAN.ruszyla === true; }
  function czyAkcjaZamknieta() { return STAN.zamknieta === true; }

  /* PODPIĘCIE STANU (projekt F dzień 2, 3.11.2026): jedno źródło prawdy = akcje.wystartowala_at przez RPC akcja_licznik
     (zalogowani; authenticated ma EXECUTE). Cache 60 s w sessionStorage (try/catch — prywatne okno, Deno w okienku).
     Brak sieci → ostatni stan z tej sesji, a bez niego „nie ruszyła" (zostaje teaser).
     PRÓBA (v3 pkt 4): konto testowe czyta akcję 'proba' zamiast 'dla-fabianka' — guzik próby zmienia cytat TYLKO jemu.
     PROBA_KONTA = akcje.konta_testowe wiersza 'proba' (migracja 20261102_akcje_startujacy_poprawka; blizna-96 + migawka blizna-97). */
  var PROBA_KONTA = ["9c2df65c-6a46-410e-ad5f-474e5d973ec9"];   // konto testowe (poprawka 2.11 — NIE główne konto Filipa)
  var CACHE_MS = 60000, CACHE_PRZED_STARTEM_MS = 5000;   // przed guzikiem krótko, jak w js/akcja.mjs: po naciśnięciu Dziś ma pokazać akcję od razu, nie po minucie
  function slugDla(athleteId) { return PROBA_KONTA.indexOf(String(athleteId || "")) >= 0 ? "proba" : "dla-fabianka"; }
  function _schowek() { try { return g.sessionStorage || null; } catch (e) { return null; } }
  /* Film akcji: plik tajny do startu, adres podpisany z prywatnego kubełka, licznik oddaje go tylko po starcie i przy zgodzie (20261105_akcja_film.sql). Bez adresu FILM_AKCJI zostaje null i baner gra to, co dotąd. Pozycje: telefon i biegacze w pasie 23–72%, od 10 s plansza w pełnej klatce (contain), żeby plakat nie był obcięty u góry. */
  var ADRES_FILMU = /^https:\/\/afqojgkaveykxbltxzwm\.supabase\.co\/storage\/v1\/object\/sign\/akcja-wizerunek\/[A-Za-z0-9._-]+\.mp4\?token=[A-Za-z0-9._-]+$/;
  function filmAkcjiZLicznika(d) {
    var u = d && d.wystartowala && d.film_akcji_url;
    if (typeof u !== "string" || !ADRES_FILMU.test(u)) return null;
    /* Od 10. sekundy w pliku stoi plakat w małej rozdzielczości: po to jest osobny plik plakatu, a dźwięk gra dalej. Bez plakatu wszystko jak dotąd. */
    var pl = d.plakat_url && g.safeUrlAttr && g.safeUrlAttr(d.plakat_url) ? d.plakat_url : "";
    var zb = g.BM_AKCJA && g.BM_AKCJA.linkZbiorki ? g.BM_AKCJA.linkZbiorki(d) : "";
    return { id: "film-akcja", mp4: u, dzwiek: true, pozycje: [{ od: 0, pos: "50% 45%" }, { od: 10, pos: "50% 50%", fit: "contain" }], plakat: pl, plakat_od: 10, zbiorka: zb };
  }
  /* FILMY KAMIENI MILOWYCH (Filip 9.11, 20261109_akcja_filmy): [{id, km | pct, url}], z bazy (akcja_filmy_konta) albo na próbie z funkcji próby (adres na 15 min).
     Film wchodzi do kolejki dopiero po przekroczeniu progu (suma km albo procent celu z licznika). Ten sam kubełek i ta sama zgoda na wizerunek co film startu. */
  var RE_ID_FILMU = /^[a-z0-9][a-z0-9-]{0,39}$/;
  function filmyProgow(d, progi) {
    if (!d || !d.wystartowala || !Array.isArray(progi)) return [];
    var km = Number(d.suma_km) || 0, pct = Number(d.pct) || 0;
    return progi.filter(function (p) {
      return p && RE_ID_FILMU.test(String(p.id || "")) && typeof p.url === "string" && ADRES_FILMU.test(p.url) &&
        ((typeof p.km === "number" && km >= p.km) || (typeof p.pct === "number" && pct >= p.pct));
    }).map(function (p) { return { id: p.id, mp4: p.url, dzwiek: true, pozycje: [{ od: 0, pos: "50% 50%" }] }; });
  }
  /* Widziane filmy: profil (akcja_filmy_konta.obejrzane) + kopia w telefonie (konto i akcja). Stary znacznik „film_akcji” = film startu widziany na tym telefonie. */
  var _filmy = { slug: "", baza: null, sb: null };
  function kluczFilmow() { var uid = null; try { var s = JSON.parse(g.localStorage.getItem("sb-afqojgkaveykxbltxzwm-auth-token") || "null"); uid = s && s.user && s.user.id; } catch (e) {} return uid ? "bm_filmy_akcji_" + _filmy.slug + "_" + uid : ""; }
  function lokalneFilmy() {
    var l = []; try { var k = kluczFilmow(); l = k ? JSON.parse(g.localStorage.getItem(k) || "[]") : []; if (_filmy.slug !== "proba" && g.localStorage.getItem("film_akcji") === "1" && l.indexOf("film-akcja") < 0) l.push("film-akcja"); } catch (e) { l = []; }
    return Array.isArray(l) ? l.filter(function (x) { return RE_ID_FILMU.test(String(x)); }) : [];
  }
  function filmWidziany(id) { return lokalneFilmy().indexOf(id) >= 0 || (Array.isArray(_filmy.baza) && _filmy.baza.indexOf(id) >= 0); }
  function oznaczFilm(id) {
    if (!RE_ID_FILMU.test(String(id || ""))) return;
    try { var k = kluczFilmow(), l = lokalneFilmy(); if (k && l.indexOf(id) < 0) { l.push(id); g.localStorage.setItem(k, JSON.stringify(l)); } if (id === "film-akcja" && _filmy.slug !== "proba") g.localStorage.setItem("film_akcji", "1"); } catch (e) {}
    if (_filmy.sb && _filmy.slug) Promise.resolve(_filmy.sb.rpc("akcja_film_obejrzany", { p_slug: _filmy.slug, p_film: id })).then(function () {}, function () {});
  }
  /** Profil konta: progi i widziane. Lokalnie widziane, a w profilu nie (bez sieci, stary znacznik): dopisz do profilu. Błąd / stara baza = tylko telefon. */
  async function filmyKonta(sb, slug, d) {
    _filmy.slug = slug; _filmy.sb = sb && typeof sb.rpc === "function" ? sb : null;
    if (!_filmy.sb || !d || !d.wystartowala) return [];
    try {
      var r = await _filmy.sb.rpc("akcja_filmy_konta", { p_slug: slug });
      if (r.error || !r.data) return [];
      _filmy.baza = Array.isArray(r.data.obejrzane) ? r.data.obejrzane : [];
      lokalneFilmy().forEach(function (id) { if (_filmy.baza.indexOf(id) < 0) oznaczFilm(id); });
      return Array.isArray(r.data.progi) ? r.data.progi : [];
    } catch (e) { return []; }
  }
  /* ŚCIEŻKA FABIANKA: licznik nigdy nie oddaje rysunku ani filmu dla próby. Trener i konto testowe dostają je osobną funkcją, na 15 minut. Odmowa = bez adresów, reszta próby działa. */
  var _wizerunekProby = null, _wizerunekT = 0, _bladWizerunku = "";
  function wizerunekProby(sb) {
    var teraz = Date.now();
    if (_wizerunekProby && teraz - _wizerunekT < 600000) return _wizerunekProby;
    _wizerunekT = teraz;
    _wizerunekProby = Promise.resolve().then(function () {
      if (!sb || !sb.functions) return null;
      return sb.functions.invoke("akcja-proba-wizerunek", { body: {} }).then(function (r) {
        if (r.data && r.data.ok) { _bladWizerunku = ""; return r.data; }
        /* Nieudana odpowiedź nie zostaje na 10 minut: jeden chwilowy błąd zabierał rysunek, piosenkę i przycisk premiery. */
        _bladWizerunku = String((r.error && r.error.context && r.error.context.status) || "bez odpowiedzi"); _wizerunekProby = null;
        return null;
      }, function () { _bladWizerunku = "bez odpowiedzi"; _wizerunekProby = null; return null; });
    }).catch(function () { _wizerunekProby = null; return null; });
    return _wizerunekProby;
  }
  function bladWizerunku() { return _bladWizerunku; }
  /* Próba ma wyglądać jak sobota: adresy i dane prawdziwej akcji dochodzą do licznika tylko z osobnej funkcji, wyłącznie dla trenera i konta testowego. */
  function scalProbe(d, w) {
    if (!d || !w) return d;
    ["koparka_url", "koparka_arkusz_url", "film_akcji_url", "plakat_url"].forEach(function (k) { d[k] = w[k]; });
    if (Array.isArray(w.filmy_progow)) d.filmy_progow = w.filmy_progow;   // filmy kamieni milowych próby (20261109_akcja_filmy), adresy na 15 min
    ["nazwa", "imie", "url_zbiorki"].forEach(function (k) { if (w[k]) d[k] = w[k]; });
    return d;
  }
  function _zastosuj(slug, d) {
    /* Kafel akcji stoi na Dziś tylko, gdy akcja trwa: po zamknięciu i po „od zera” wraca zwykły kafel. */
    if (g.BM_AKCJA && g.BM_AKCJA.zdejmijKafel && g.BM_AKCJA.stanKarty(d) !== "trwa") g.BM_AKCJA.zdejmijKafel();
    var film = filmAkcjiZLicznika(d);
    if (film) g.FILM_AKCJI = film;
    /* Próba od zera: film akcji ma zagrać jeszcze raz, tak jak zagra każdemu pierwszy raz (także kopia „widziane” w telefonie; profil liczy od nowego naciśnięcia). */
    else if (slug === "proba" && d && !d.wystartowala) { g.FILM_AKCJI = null; try { g.localStorage.removeItem("film_akcji"); g.sessionStorage.removeItem("bm_ulica_wjazd"); _filmy.slug = slug; var kf = kluczFilmow(); if (kf) g.localStorage.removeItem(kf); } catch (e) {} }
    /* kolejka filmów akcji: start, potem kamienie milowe po progu (progi z profilu; na próbie adresy z funkcji próby) */
    var progi = slug === "proba" ? d && d.filmy_progow : d && d._progi_filmow;
    g.FILMY_AKCJI = (film ? [film] : []).concat(filmyProgow(d, progi));
    ustawStan({ ruszyla: !!(d && d.wystartowala), zamknieta: !!(d && d.koniec), zamknietaOd: d && d.koniec ? String(d.koniec) : null,
                proba: slug === "proba" });
  }
  /** Odczyt stanu akcji z bazy → ustawStan. sb = klient Supabase (window.sb albo klient z JWT w EF). → licznik | null. */
  async function odswiezStan(sb, athleteId, opcje) {
    var o = opcje || {}, slug = slugDla(athleteId), klucz = "bm_akcja_stan_" + slug, teraz = o.teraz || Date.now(), ss = _schowek(), stary = null;
    try { stary = ss ? JSON.parse(ss.getItem(klucz) || "null") : null; } catch (e) { stary = null; }
    if (stary && !o.wymus && teraz - stary.t < (stary.d && stary.d.wystartowala ? CACHE_MS : CACHE_PRZED_STARTEM_MS)) { _zastosuj(slug, stary.d); return stary.d; }
    try {
      if (!sb || typeof sb.rpc !== "function") throw new Error("brak klienta");
      var r = await sb.rpc("akcja_licznik", { p_slug: slug });
      if (r.error) throw r.error;
      var d = r.data || null;
      if (slug === "proba" && d && d.wystartowala && g.document) {
        var w = await wizerunekProby(sb);
        scalProbe(d, w);
      }
      if (d && d.wystartowala && athleteId) { var progi = await filmyKonta(sb, slug, d); if (slug !== "proba") d._progi_filmow = progi; }
      try { if (ss) ss.setItem(klucz, JSON.stringify({ t: teraz, d: d })); } catch (e) {}
      _zastosuj(slug, d);
      return d;
    } catch (e) {
      if (stary) { _zastosuj(slug, stary.d); return stary.d; }
      ustawStan({ ruszyla: false, proba: slug === "proba" });
      return null;
    }
  }
  var START_ROTACJI = dodajDni(DZIEN_STARTU, 1);   // dzień po DZIEN_STARTU — liczony, nie wpisany
  var ROTACJA = [
    "Twój kilometr to jego krok.",
    "Nie musisz biec szybko. Wystarczy, że biegniesz z nami.",
    "Każdy krok się liczy. Dziś liczy się podwójnie.",
    "Jesteśmy obok. Kilometr po kilometrze.",
    "Ty biegniesz. Licznik rośnie. Fabianek czuje drużynę.",
    "Sami pobiegniemy szybko. Razem dobiegniemy do końca.",
    "Najkrótszy bieg też przesuwa licznik.",
    "Zawiąż buty. Ktoś na Ciebie liczy.",
    "To nie jest wyścig. To jest drużyna.",
    "Każdy kilometr ma znaczenie. Twój też.",
    "Dziś biegniesz dla kogoś. To lekki bieg.",
  ];
  var PO_ZAMKNIECIU = "Daliśmy radę. Razem. Dla Fabianka.", DNI_PO_ZAMKNIECIU = 7;
  /* ZAGADKI (okienko „Zapytaj", decyzja Filipa 2.11): pytania o akcję PRZED startem → losowo jedna z nich, 0 tokenów,
     bez kart, bez sieci, bez modelu. Po starcie (czyAkcjaRuszyla) → PO_STARCIE, do czasu karty akcji z projektu F.
     ⚠️ PRZEGLĄD (decyzja Filipa 2.11.2026): wzorzec `fabian\w*` w routerze okienka (ZAGADKA_ZAWSZE, router.mjs) jest
     CELOWO szeroki — łapie też dorosłych Fabianów („Fabian Kowalski wyniki"), bo ochrona dziecka > wyniki dorosłych.
     DATA PRZEGLĄDU: dzień zamknięcia akcji (ZAMKNIETA = true / ZAMKNIETA_OD) — wtedy zawęzić do form „Fabianek/
     Fabianka/Fabiankowi/Fabiankiem" albo zdjąć regułę razem z zagadką, w tym samym commicie co blizna-93. */
  var ZAGADKI = [
    "Jeszcze nie mogę powiedzieć. Niedługo.",   // Z (3.11): zagadki bez dnia — zapowiedź (8.11) ≠ start (7.11)
    "Będą znaki. Patrz pod nogi i licz kilometry.",
    "Coś się zaczyna. Twoje buty mogą się przydać.",
    "Odpowiedź przyjdzie jednym kliknięciem. Jeszcze nie dziś.",
    "Na razie tylko tyle: nie biegniesz sam.",
    "Daleka droga, dużo ludzi, jeden powód. Więcej wkrótce.",
  ];
  var PO_STARCIE = "Akcja trwa — każdy Twój kilometr biegu i spaceru w BiegaMy liczy się sam, nic nie trzeba włączać. Rower nie. Szczegóły na Dziś.";
  /** Odpowiedź okienka na pytanie o akcję: przed startem losowa zagadka, po starcie zdanie (miejsce na kartę akcji, projekt F). */
  function odpowiedzZagadki(los) {
    if (czyAkcjaRuszyla()) return { zdanie: PO_STARCIE, karta: null };   // PROJEKT F: tu karta akcji (licznik, link)
    var r = typeof los === "function" ? los() : Math.random();
    return { zdanie: ZAGADKI[Math.min(ZAGADKI.length - 1, Math.floor(r * ZAGADKI.length))], karta: null };
  }

  /** Klucz dnia w Europe/Warsaw: Date → 'YYYY-MM-DD'. */
  function dzienWaw(teraz) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(teraz || new Date());
  }
  function dniMiedzy(a, b) { return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000); }

  /** → {tekst, zrodlo} | null. opcje: {ruszyla, zamknieta, zamknietaOd} — nadpisują STAN (testy). */
  function cytat(teraz, opcje) {
    var o = opcje || {};
    var ruszyla = o.ruszyla != null ? !!o.ruszyla : czyAkcjaRuszyla();
    var zamknieta = o.zamknieta != null ? !!o.zamknieta : STAN.zamknieta;
    var zamknietaOd = o.zamknietaOd != null ? o.zamknietaOd : STAN.zamknietaOd;
    var d = dzienWaw(teraz);
    // PRÓBA: po naciśnięciu guzika próby konto testowe widzi to, co wszyscy zobaczą w dniu startu po naciśnięciu — niezależnie od daty.
    if ((o.proba != null ? !!o.proba : STAN.proba) && ruszyla && !zamknieta) return { tekst: W_DNIU_STARTU, zrodlo: ZRODLO };
    if (TEASER[d]) return { tekst: TEASER[d], zrodlo: ZRODLO };
    if (d < DZIEN_STARTU) return null;
    if (!ruszyla) return { tekst: d === DZIEN_STARTU ? DZIS_PRZED_STARTEM : PRZED_STARTEM, zrodlo: ZRODLO };   // dzień startu przed kliknięciem / opóźniony start
    if (d === DZIEN_STARTU) return { tekst: W_DNIU_STARTU, zrodlo: ZRODLO };
    if (zamknieta) {
      if (!zamknietaOd) return null;
      var po = dniMiedzy(zamknietaOd, d);
      return po >= 0 && po < DNI_PO_ZAMKNIECIU ? { tekst: PO_ZAMKNIECIU, zrodlo: ZRODLO } : null;
    }
    return { tekst: ROTACJA[dniMiedzy(START_ROTACJI, d) % ROTACJA.length], zrodlo: ZRODLO };
  }

  g.BM_AKCJA_CYTATY = { bladWizerunku: bladWizerunku, scalProbe: scalProbe, wizerunekProby: wizerunekProby, filmAkcjiZLicznika: filmAkcjiZLicznika, cytat: cytat, dzienWaw: dzienWaw, czyAkcjaRuszyla: czyAkcjaRuszyla, ustawStan: ustawStan, ZRODLO: ZRODLO, TEASER: TEASER,
    odswiezStan: odswiezStan, slugDla: slugDla, czyAkcjaZamknieta: czyAkcjaZamknieta, filmyProgow: filmyProgow, filmWidziany: filmWidziany, oznaczFilm: oznaczFilm, filmyKonta: filmyKonta, PROBA_KONTA: PROBA_KONTA, CACHE_MS: CACHE_MS,
    ZAGADKI: ZAGADKI, PO_STARCIE: PO_STARCIE, odpowiedzZagadki: odpowiedzZagadki,
    ROTACJA: ROTACJA, PRZED_STARTEM: PRZED_STARTEM, W_DNIU_STARTU: W_DNIU_STARTU, DZIEN_STARTU: DZIEN_STARTU, PO_ZAMKNIECIU: PO_ZAMKNIECIU,
    START_ROTACJI: START_ROTACJI, DNI_PO_ZAMKNIECIU: DNI_PO_ZAMKNIECIU, ZAMKNIETA: ZAMKNIETA,
    DZIS_PRZED_STARTEM: DZIS_PRZED_STARTEM, DATA_KROTKA: DATA_KROTKA, DATA_SLOWNIE: DATA_SLOWNIE, OKNO_STARTU: OKNO_STARTU };
})(globalThis);
