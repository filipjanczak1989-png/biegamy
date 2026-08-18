/* ── KOLIZJA IMPORTU Z WPISEM RĘCZNYM ──────────────────────────────────────
   Czysta decyzja: czy aktywność z zegarka jest tym samym treningiem, który
   człowiek już wpisał ręcznie. Bez I/O, bez DOM, bez Deno — żeby dała się
   przetestować z Node tak samo jak działa w Edge Function.

   POWÓD ISTNIENIA. 18.08.2026 Damian podłączył zegarek mając wpisany ręcznie
   dzienniczek. `intervals-sync` deduplikował WYŁĄCZNIE wobec wcześniejszych
   importów (po `external_id`) i o wpisach ręcznych nie wiedział nic — więc
   zaimportował te same biegi drugi raz. 18,5 km wpadło do licznika wyzwania
   podwójnie. Zmierzone: to nie jest incydent jednego konta — pięć osób ma dni
   z obydwoma źródłami, a Damian Bolewski ma ich 62, od kwietnia, i nikt tego
   nie zauważył.

   ⚠️ ZASADA NACZELNA: PRZY WĄTPLIWOŚCI IMPORTUJ OSOBNO, NIGDY NIE ZGADUJ.
   Duplikat jest widoczny — wyjdzie w liczniku, u trenera albo w oczy rzuci się
   samemu zawodnikowi. Błędne scalenie jest NIEWIDOCZNE: dwa różne treningi
   zlewają się w jeden i nikt się nie dowie, bo nie ma czego porównać.
   Dlatego każdy warunek niżej domyka się w stronę „wstaw osobno".

   ⚠️ CZEGO TA REGUŁA NIE ROBI — świadomie, żeby nikt nie uznał sprawy
   za zamkniętą:
     • nie chroni wpisu ręcznego zrobionego PO imporcie (sync widzi tylko stan
       z chwili synchronizacji),
     • nie ma tolerancji czasu startu. Sprawdzone 18.08.2026 na całej bazie:
       ZERO zduplikowanych `external_id`, czyli intervals nie re-eksportuje
       aktywności pod nowym ID. Tolerancja ±90 s leczyłaby zjawisko, którego
       nie ma, a zjadałaby po cichu realnie różne aktywności zaczęte blisko
       siebie (u Natalii 15.08 dwie aktywności dzieli 1,5 godziny, ale
       u kogoś na siłowni odstęp bywa minutowy). */

/* Tolerancja dystansu. ⚠️ OSĄD, NIE POMIAR — 5% wybrane jako „mieści się błąd
   GPS i zaokrąglenie ręcznego wpisu, nie mieści się inny trening".
   DO ZMIERZENIA: 62 dni Damiana Bolewskiego z obydwoma źródłami to gotowa
   próbka rozkładu różnic; policzyć przed utrwaleniem progu. */
export const TOLERANCJA_DYSTANSU = 0.05;

/* Kopia RUN_TYPES z sb.js — pilnuje jej tools/sprawdz-run-types.py.
   Potrzebna, żeby nie scalić roweru z biegiem: 15.08 Damian miał ręcznie
   „Regeneracja 24,89 km" i z zegarka „Rower 24,89 km" — identyczny dystans,
   zupełnie inny trening. Sam dystans by je scalił. */
export const RUN_TYPES = new Set([
  'spokojny', 'bieg spokojny', 'wybieganie', 'długi', 'tempo',
  'progresja', 'interwały', 'start', 'wyścig', 'regeneracja'
]);

export function jestBiegiem(typ) {
  return RUN_TYPES.has(String(typ || '').toLowerCase().trim());
}

/**
 * @param akt        {{ distance_km:number|null, isRun:boolean }} aktywność z zegarka
 * @param kandydaci  wpisy zawodnika z TEJ SAMEJ doby lokalnej, dowolnego źródła
 * @returns {{akcja:'wzbogac'|'wstaw', cel?:string, powod:string}}
 */
export function rozstrzygnijKolizje(akt, kandydaci) {
  const lista = Array.isArray(kandydaci) ? kandydaci : [];

  /* Bez dystansu nie ma czym porównywać. Dotyczy siłowni i większości
     aktywności bez GPS — tam scalenie opierałoby się wyłącznie na dacie,
     a jednego dnia mieści się kilka takich jednostek. */
  const km = Number(akt && akt.distance_km);
  if (!(km > 0)) return { akcja: 'wstaw', powod: 'brak_dystansu' };

  const pasujace = lista.filter(k => {
    /* Wpis już wzbogacony ma external_id — drugi raz go nie ruszamy, bo
       to znaczy, że jakaś aktywność już się z nim zrosła. */
    if (k.external_id) return false;
    /* Wiersze pochodzące z importu pomijamy: dedup po external_id robi to
       piętro wyżej, a tutaj szukamy WYŁĄCZNIE pracy człowieka. */
    if (String(k.source || '') === 'intervals') return false;
    /* Klasa aktywności musi się zgadzać — patrz komentarz przy RUN_TYPES. */
    if (jestBiegiem(k.training_type) !== !!(akt && akt.isRun)) return false;
    const kkm = Number(k.distance_km);
    if (!(kkm > 0)) return false;
    return Math.abs(kkm - km) / km <= TOLERANCJA_DYSTANSU;
  });

  if (pasujace.length === 1) {
    return { akcja: 'wzbogac', cel: pasujace[0].id, powod: 'jednoznaczna' };
  }
  /* ⚠️ WIĘCEJ NIŻ JEDEN PASUJĄCY = NIEJEDNOZNACZNIE, mimo że kuszące byłoby
     wziąć „najbliższy". Dwa wpisy ręczne o zbliżonym dystansie tego samego dnia
     to albo dwa realne wyjścia, albo podwójny zapis — a tego stąd nie widać.
     Wybór najbliższego zlałby import z przypadkowym z nich. */
  if (pasujace.length > 1) return { akcja: 'wstaw', powod: 'wielu_kandydatow' };
  return { akcja: 'wstaw', powod: 'brak_dopasowania' };
}

/* Pola, które import WOLNO dopisać do wpisu ręcznego. Świadomie NIE MA tu
   `feel`, `comment`, `attachment_url`, `training_type`, `distance_km`,
   `duration` — to jest wkład człowieka i on wygrywa z telemetrią.
   ⚠️ `external_source:'intervals'` przy `source` innym niż 'intervals' JEST
   ŚLADEM wzbogacenia i to jedyny ślad, jakiego potrzebujemy: kombinacja dziś
   nie występuje ani razu (sprawdzone 18.08.2026 — 4 wiersze mają
   external_source='app', czyli inny mechanizm). Nie zakładamy nowej tabeli ani
   nie doklejamy „[auto]" do notatki zawodnika. */
export const POLA_WZBOGACENIA = [
  'heart_rate', 'pace', 'gap_pace', 'cadence',
  'icu_load', 'icu_intensity', 'elevation_gain', 'calories'
];

export function zbudujWzbogacenie(wiersz) {
  const out = {};
  for (const p of POLA_WZBOGACENIA) {
    if (wiersz[p] != null) out[p] = wiersz[p];
  }
  out.external_id = wiersz.external_id;
  out.external_source = 'intervals';
  return out;
}
