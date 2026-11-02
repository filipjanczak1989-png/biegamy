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
  /* Okno guzika = akcje.okno_startu_od/do: dzień startu 06:00–23:59:59 Europe/Warsaw. Listopad = CET (UTC+1), bez zmiany czasu. */
  var OKNO_STARTU = { od: Date.parse(DZIEN_STARTU + "T06:00:00+01:00"), do: Date.parse(DZIEN_STARTU + "T23:59:59+01:00") };
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

  /* PODPIĘCIE STANU (projekt F dzień 2, 3.11.2026): jedno źródło prawdy = akcje.wystartowala_at przez RPC akcja_licznik
     (zalogowani; authenticated ma EXECUTE). Cache 60 s w sessionStorage (try/catch — prywatne okno, Deno w okienku).
     Brak sieci → ostatni stan z tej sesji, a bez niego „nie ruszyła" (zostaje teaser).
     PRÓBA (v3 pkt 4): konto testowe czyta akcję 'proba' zamiast 'dla-fabianka' — guzik próby zmienia cytat TYLKO jemu.
     PROBA_KONTA = akcje.konta_testowe wiersza 'proba' (migracja 20261102_akcje_startujacy_poprawka; blizna-96 + migawka blizna-97). */
  var PROBA_KONTA = ["9c2df65c-6a46-410e-ad5f-474e5d973ec9"];   // konto testowe (poprawka 2.11 — NIE główne konto Filipa)
  var CACHE_MS = 60000;
  function slugDla(athleteId) { return PROBA_KONTA.indexOf(String(athleteId || "")) >= 0 ? "proba" : "dla-fabianka"; }
  function _schowek() { try { return g.sessionStorage || null; } catch (e) { return null; } }
  function _zastosuj(slug, d) {
    ustawStan({ ruszyla: !!(d && d.wystartowala), zamknieta: !!(d && d.koniec), zamknietaOd: d && d.koniec ? String(d.koniec) : null,
                proba: slug === "proba" });
  }
  /** Odczyt stanu akcji z bazy → ustawStan. sb = klient Supabase (window.sb albo klient z JWT w EF). → licznik | null. */
  async function odswiezStan(sb, athleteId, opcje) {
    var o = opcje || {}, slug = slugDla(athleteId), klucz = "bm_akcja_stan_" + slug, teraz = o.teraz || Date.now(), ss = _schowek(), stary = null;
    try { stary = ss ? JSON.parse(ss.getItem(klucz) || "null") : null; } catch (e) { stary = null; }
    if (stary && !o.wymus && teraz - stary.t < CACHE_MS) { _zastosuj(slug, stary.d); return stary.d; }
    try {
      if (!sb || typeof sb.rpc !== "function") throw new Error("brak klienta");
      var r = await sb.rpc("akcja_licznik", { p_slug: slug });
      if (r.error) throw r.error;
      var d = r.data || null;
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
    "Jeszcze nie mogę powiedzieć. Ale zapamiętaj datę: " + DATA_KROTKA + ".",
    "Będą znaki. Patrz pod nogi i licz kilometry.",
    "Coś się zaczyna. Twoje buty mogą się przydać.",
    "Odpowiedź przyjdzie jednym kliknięciem. Jeszcze nie dziś.",
    "Na razie tylko tyle: nie biegniesz sam.",
    "Daleka droga, dużo ludzi, jeden powód. Więcej " + DATA_KROTKA + ".",
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

  g.BM_AKCJA_CYTATY = { cytat: cytat, dzienWaw: dzienWaw, czyAkcjaRuszyla: czyAkcjaRuszyla, ustawStan: ustawStan, ZRODLO: ZRODLO, TEASER: TEASER,
    odswiezStan: odswiezStan, slugDla: slugDla, PROBA_KONTA: PROBA_KONTA, CACHE_MS: CACHE_MS,
    ZAGADKI: ZAGADKI, PO_STARCIE: PO_STARCIE, odpowiedzZagadki: odpowiedzZagadki,
    ROTACJA: ROTACJA, PRZED_STARTEM: PRZED_STARTEM, W_DNIU_STARTU: W_DNIU_STARTU, DZIEN_STARTU: DZIEN_STARTU, PO_ZAMKNIECIU: PO_ZAMKNIECIU,
    START_ROTACJI: START_ROTACJI, DNI_PO_ZAMKNIECIU: DNI_PO_ZAMKNIECIU, ZAMKNIETA: ZAMKNIETA,
    DZIS_PRZED_STARTEM: DZIS_PRZED_STARTEM, DATA_KROTKA: DATA_KROTKA, DATA_SLOWNIE: DATA_SLOWNIE, OKNO_STARTU: OKNO_STARTU };
})(globalThis);
