// CYTATY AKCJI (decyzja Filipa 2.11.2026) — baner cytatu na Dziś (#daily-motivation), PO filmie i bez filmu.
// Plik BEZ import/export (globalThis.BM_AKCJA_CYTATY), jak js/plan-pusty.mjs: <script src> w zawodnik.html i import w testach.
// Dzień liczony w Europe/Warsaw (nie UTC, nie strefa urządzenia). Cytat akcji ma pierwszeństwo przed zwykłym cytatem
// dnia i przed „Twój plan"; poza datami akcji — null, czyli zwykłe cytaty bez zmian (blizna-92).
//   - 2026-11-02 … 2026-11-07: teaser dzień po dniu (nic nie zdradza);
//   - 2026-11-08 i później, PRZED startem akcji: „Jedno kliknięcie zmieni wszystko." (także gdy start się opóźni);
//   - 2026-11-08 PO starcie: „12 500 kilometrów. Jeden powód. Fabianek."; od 2026-11-09 po starcie: rotacja ROTACJA;
//   Start akcji = czyAkcjaRuszyla() — stan z bazy (RPC akcji, projekt F) wpisywany przez ustawStan(); bez zgadywania
//   po godzinie. Do podłączenia guzika Fabianka zwraca false.
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
    "2026-11-06": "Peleryny wiszą w szafie. Jeszcze dwa dni.",
    "2026-11-07": "Jutro wszystko stanie się jasne.",
  };
  var DZIEN_STARTU = "2026-11-08", PRZED_STARTEM = "Jedno kliknięcie zmieni wszystko.", W_DNIU_STARTU = "12 500 kilometrów. Jeden powód. Fabianek.";
  /* STAN AKCJI — JEDNO miejsce podłączenia (projekt F, guzik Fabianka): odczyt stanu z bazy przez RPC akcji woła
     ustawStan({ ruszyla, zamknieta, zamknietaOd }). Do tego czasu nikt go nie woła → akcja „nie ruszyła". */
  var STAN = { ruszyla: false, zamknieta: ZAMKNIETA, zamknietaOd: ZAMKNIETA_OD };
  function ustawStan(s) {
    if (!s || typeof s !== "object") return;
    if (s.ruszyla != null) STAN.ruszyla = s.ruszyla === true;
    if (s.zamknieta != null) STAN.zamknieta = s.zamknieta === true;
    if (s.zamknietaOd != null) STAN.zamknietaOd = /^\d{4}-\d{2}-\d{2}$/.test(String(s.zamknietaOd)) ? String(s.zamknietaOd) : null;
  }
  function czyAkcjaRuszyla() { return STAN.ruszyla === true; }
  var START_ROTACJI = "2026-11-09";   // dzień po DZIEN_STARTU
  var ROTACJA = [
    "Twój kilometr to jego krok.",
    "Nie musisz biec szybko. Wystarczy, że biegniesz z nami.",
    "Każdy trening się liczy. Dziś liczy się podwójnie.",
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
     bez kart, bez sieci, bez modelu. Po starcie (czyAkcjaRuszyla) → PO_STARCIE, do czasu karty akcji z projektu F. */
  var ZAGADKI = [
    "Jeszcze nie mogę powiedzieć. Ale zapamiętaj datę: 8.11.",
    "Będą znaki. Patrz pod nogi i licz kilometry.",
    "Coś się zaczyna. Twoje buty mogą się przydać.",
    "Odpowiedź przyjdzie jednym kliknięciem. Jeszcze nie dziś.",
    "Na razie tylko tyle: nie biegniesz sam.",
    "Daleka droga, dużo ludzi, jeden powód. Więcej 8.11.",
  ];
  var PO_STARCIE = "Akcja trwa — szczegóły na Dziś.";
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
    if (TEASER[d]) return { tekst: TEASER[d], zrodlo: ZRODLO };
    if (d < DZIEN_STARTU) return null;
    if (!ruszyla) return { tekst: PRZED_STARTEM, zrodlo: ZRODLO };   // 8.11 przed kliknięciem albo opóźniony start
    if (d === DZIEN_STARTU) return { tekst: W_DNIU_STARTU, zrodlo: ZRODLO };
    if (zamknieta) {
      if (!zamknietaOd) return null;
      var po = dniMiedzy(zamknietaOd, d);
      return po >= 0 && po < DNI_PO_ZAMKNIECIU ? { tekst: PO_ZAMKNIECIU, zrodlo: ZRODLO } : null;
    }
    return { tekst: ROTACJA[dniMiedzy(START_ROTACJI, d) % ROTACJA.length], zrodlo: ZRODLO };
  }

  g.BM_AKCJA_CYTATY = { cytat: cytat, dzienWaw: dzienWaw, czyAkcjaRuszyla: czyAkcjaRuszyla, ustawStan: ustawStan, ZRODLO: ZRODLO, TEASER: TEASER,
    ZAGADKI: ZAGADKI, PO_STARCIE: PO_STARCIE, odpowiedzZagadki: odpowiedzZagadki,
    ROTACJA: ROTACJA, PRZED_STARTEM: PRZED_STARTEM, W_DNIU_STARTU: W_DNIU_STARTU, DZIEN_STARTU: DZIEN_STARTU, PO_ZAMKNIECIU: PO_ZAMKNIECIU,
    START_ROTACJI: START_ROTACJI, DNI_PO_ZAMKNIECIU: DNI_PO_ZAMKNIECIU, ZAMKNIETA: ZAMKNIETA };
})(globalThis);
