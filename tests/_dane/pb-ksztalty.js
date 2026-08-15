// ─────────────────────────────────────────────────────────────────────────────
// KSZTAŁTY WARTOŚCI PB — dane SYNTETYCZNE. To NIE jest migawka produkcji
// i nie ma nią być. Zanim uznasz to za lenistwo, przeczytaj dlaczego.
//
// !! MIGAWKA Z PRODUKCJI NIE TESTOWAŁABY KLAS, DLA KTÓRYCH WALIDATOR POWSTAŁ.
//    Zmierzone 15.08.2026, po normalizacji z KROKU 1, `athletes.pb_*` zawiera
//    już tylko TRZY klasy:
//        NULL                       110
//        dwuczłonowy  (MM:SS)        61
//        trójczłonowy (H:MM:SS)      41
//    Gołe liczby, zera, `9:99:99` i `h:mm` na długim dystansie ZNIKNĘŁY — bo
//    właśnie je wyprostowaliśmy. Fixture zamrożony z produkcji sprawdzałby
//    wyłącznie, że walidator przepuszcza `25:20` i `1:45:00`, a nie że odrzuca
//    `9:99:99`. Zielony, nic nie sprawdza. To jest .ai/LEKCJE.md #2 w postaci
//    danych testowych.
//
// !! Pokrycie produkcji jest PRZYPADKOWE — zawiera to, co ludzie akurat wpisali.
//    Pokrycie syntetyczne jest ZAPROJEKTOWANE: trzyma klasy, których produkcja
//    już nie ma, i klasy, których nigdy nie miała.
//
// !! DRUGI POWÓD, NIEZALEŻNY: repo jest publiczne, a 144 logi z datami,
//    dystansami i tempami to profil, który da się przypisać do osoby, jeśli
//    ktoś zna grupę. Usunięcie imion nie pomaga — identyfikatorem jest sam
//    szereg czasowy. To dane treningowe ludzi, którzy nie wyrazili zgody.
//
// !! PYTANIE "czy WSZYSTKO, co teraz jest w bazie, nadal przechodzi?" NIE JEST
//    TESTEM — to audyt danych, a odpowiedź zmienia się przy każdym wpisanym PB.
//    Zamrożony fixture na to nie odpowiada, tylko kłamie. Ma własną bramkę:
//    tools/sprawdz-pb-walidacja.js, uruchamianą na ŻYWEJ bazie (KROK 3).
//
// Progi brzegowe przepisane z produkcji jako LICZBY, nie jako rekordy —
// zmierzone 15.08.2026, najszybsze i najwolniejsze tempo per dystans (s/km):
//     5 km 189..432 · 10 km 198..380 · HM 227..407 · maraton 209..415
'use strict';

module.exports = [
  // ── klasy, które produkcja MIAŁA i które naprawiliśmy ────────────────────
  { w: '25:20',   d: 5,       ok: true,  sek: 1520,
    blizna: '+s na kolumnie text dawalo NaN na POPRAWNYM PB — karta znikala 30 osobom' },
  { w: '1:45:00', d: 21.0975, ok: true,  sek: 6300,
    blizna: 'trojczlonowy na dlugim — najczestsza poprawna postac w produkcji' },
  { w: '56',      d: 10,      ok: false,
    blizna: 'gola liczba: +s czytalo 56 jako 56 SEKUND, stad "0:56" na karcie' },
  { w: '36',      d: 5,       ok: false,
    blizna: 'gola liczba u Natalii — 36 minut, nie 36 sekund' },
  { w: '2:14',    d: 21.0975, ok: false,
    blizna: 'h:mm na dlugim dystansie — 6 takich wartosci bylo w bazie' },
  { w: '03:46',   d: 42.195,  ok: false,
    blizna: 'h:mm z zerem wiodacym — ta sama klasa, inny zapis' },
  { w: '9:99:99', d: 42.195,  ok: false,
    blizna: 'LEKCJE #5 — maske autoColonTime TO WYPRODUKOWALA z pieciu cyfr' },
  { w: '0',       d: 42.195,  ok: true, sek: null,
    blizna: 'zero ma isc na NULL, nie na odrzucenie ani na 0 sekund' },
  { w: '0:00:00', d: 42.195,  ok: true, sek: null,
    blizna: 'zero w postaci trojczlonowej — ta sama decyzja' },
  { w: '00:00',   d: 5,       ok: true, sek: null,
    blizna: 'zero dwuczlonowe — Kamil mial to w pb_5k' },

  // ── klasy, których produkcja NIGDY nie miała ─────────────────────────────
  { w: 'abc',     d: 5,       ok: false,
    blizna: 'LEKCJE #6 — bez walidacji ksztaltu komunikat brzmial "czytamy jako abc sekund"' },
  { w: '',        d: 5,       ok: true, sek: null,
    blizna: 'puste pole ma czyscic wartosc, nie zglaszac bledu' },
  { w: '99:99',   d: 5,       ok: false,
    blizna: 'czlon poza wiodacym >= 60 — regula 1, tu bez pomocy maski' },
  { w: '1:2:3:4', d: 5,       ok: false,
    blizna: 'cztery czlony — ksztalt spoza gramatyki, ma paść na regexpie' },
  { w: ' 25:20',  d: 5,       ok: true, sek: 1520,
    blizna: 'spacja wiodaca z wklejenia — trim ma to zniesc' },

  // ── granice fizyczne ─────────────────────────────────────────────────────
  { w: '15:45',   d: 5,       ok: true,  sek: 945,
    blizna: '189 s/km — najszybsza wartosc w produkcji 15.08, NIE moze byc odrzucona' },
  { w: '36:00',   d: 5,       ok: true,  sek: 2160,
    blizna: '432 s/km — najwolniejsza w produkcji 15.08, NIE moze byc odrzucona' },
  { w: '10:00',   d: 5,       ok: false,
    blizna: 'szybciej niz rekord swiata na 5 km — typowa zamiana minut z godzinami' },
  { w: '1:30:00', d: 42.195,  ok: false,
    blizna: 'szybciej niz rekord swiata na maratonie' },
  { w: '55:00',   d: 5,       ok: true, sek: 3300, ostrzezenie: true,
    blizna: '11:00/km — wolniej niz 10:00/km ma OSTRZEGAC, nie blokowac; poczatkujacy istnieja' },
];
