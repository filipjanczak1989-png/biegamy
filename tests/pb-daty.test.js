// ─────────────────────────────────────────────────────────────────────────────
// DATA PRZY ŻYCIÓWCE — walidujRokPB + pbWiek.
//
// !! PO CO: `athletes.pb_*` to cztery pola `text` bez daty. Zmierzone
//    16.08.2026: 32 z 34 osób z ≥2 PB ma parę NIEDATOWALNĄ (94%), a odtworzenie
//    daty z logów udaje się dla 6 ze 111 PB (5%). Karta mówiła „Twój rekord"
//    i milczała o tym, że rekord może być sprzed trzech lat.
//
// !! SAM ROK (smallint) — decyzja produktowa Filipa, potwierdzona trzykrotnie.
//    KOSZT, odnotowany raz: rocznik nie odróżnia stycznia od grudnia, więc
//    przyszłe pytanie „czy dwa PB są z tego samego okresu formy" zostaje
//    z niepewnością ±12 miesięcy. Wyświetlanie jest rocznikowe, więc na
//    ekranie nie zmienia to nic.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const ctx = zaladujSb();
const w = ctx.window.walidujRokPB;
const czytaj = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('walidujRokPB — reguły, o które prosił Filip', () => {
  test('pusty rok jest legalny i daje null', () => {
    for (const p of [null, undefined, '', '   ']) {
      const r = w(p, '25:20');
      assert.equal(r.ok, true);
      assert.equal(r.rok, null);
    }
  });

  test('⚠️ rok z PRZYSZŁOŚCI odrzucony', () => {
    assert.equal(w(new Date().getFullYear() + 1, '25:20').ok, false);
  });

  test('bieżący rok JEST legalny — granica nie może odcinać dzisiaj', () => {
    assert.equal(w(new Date().getFullYear(), '25:20').ok, true, 'PB z tego roku musi przejść');
  });

  test('⚠️ rok sprzed 1990 odrzucony', () => {
    assert.equal(w(1989, '25:20').ok, false);
    assert.equal(w(1990, '25:20').ok, true, 'granica jest włączna');
  });

  test('⚠️ rok przy PUSTYM PB odrzucony — sierota nic nie znaczy', () => {
    const r = w(2024, '');
    assert.equal(r.ok, false);
    assert.match(r.blad, /życiówk/i);
  });

  test('poprawny rok wraca jako LICZBA, nie tekst — kolumna jest smallint', () => {
    const r = w('2024', '25:20');
    assert.equal(r.rok, 2024);
    assert.equal(typeof r.rok, 'number');
  });

  test('śmieci odrzucone, nie przepuszczone jako null', () => {
    for (const zly of ['24', '2024-05', 'maj 2024', '20244', 'dwa tysiące']) {
      assert.equal(w(zly, '25:20').ok, false, zly);
    }
  });
});

describe('⚠️ WIEK REKORDU — próg, nie każdy wiersz', () => {
  const T = 2026;
  const w = ctx.window.pbWiek;

  test('0–1 rok: MILCZY — rekord jest aktualny', () => {
    /* „PB z 2025" przy życiówce sprzed ośmiu miesięcy to szum. Pokazujemy wiek
       tylko tam, gdzie niesie informację — ta sama zasada, co przy paśmie. */
    for (const d of [2026, 2025]) {
      assert.equal(w(d, T).tekst, '', d);
    }
  });

  test('2–3 lata: sam fakt, bez oceny', () => {
    /* ⚠️ Pola porownujemy pojedynczo, NIE deepEqual: window pochodzi z sandboxu
       `vm`, wiec obiekt ma inny Object.prototype i strict deepEqual odrzuca go
       mimo identycznej tresci — komunikat pokazuje wtedy dwie takie same
       wartosci obok siebie i wyglada na blad w kodzie, ktorego nie ma. */
    for (const [d, oczek] of [[2024, 'PB z 2024'], [2023, 'PB z 2023']]) {
      const r = w(d, T);
      assert.equal(r.tekst, oczek);
      assert.equal(r.ostrzega, false);
    }
  });

  test('⚠️ 4+ lat: ostrzeżenie, bo człowiek nie wie, na czym stoi liczba', () => {
    const r = w(2019, T);
    assert.equal(r.tekst, 'PB z 2019 — może być zawyżone');
    assert.equal(r.ostrzega, true, 'ostrzeżenie musi być oznaczone, nie tylko dłuższe');
  });

  test('granica progu jest ostra i po właściwej stronie', () => {
    /* 3 lata i 11 miesięcy to jeszcze fakt, 4 lata to już ostrzeżenie. */
    assert.equal(w(2023, T).ostrzega, false, '3 lata');
    assert.equal(w(2022, T).ostrzega, true, 'równo 4 lata');
  });

  test('brak daty i data z przyszłości = brak podwiersza', () => {
    for (const d of [null, undefined, '', 2030]) assert.equal(w(d, T).tekst, '');
  });

  test('⚠️ PRÓG 4 LAT NIE MA POKRYCIA W DANYCH — i to jest zapisane', () => {
    /* Zmierzone 16.08.2026: najstarszy log w całej bazie ma 1,1 roku, więc
       obserwacji rekordów starszych niż rok jest ZERO. Próg jest decyzją.
       Ten test pilnuje, żeby nikt nie zaczął go traktować jak wyniku. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'sb.js'), 'utf8');
    const blok = src.slice(src.indexOf('PB_WIEK_PROG_OSTRZEZENIA') - 2000,
      src.indexOf('PB_WIEK_PROG_OSTRZEZENIA') + 200);
    assert.match(blok, /Z ROZSĄDKU, NIE Z POMIARU/, 'brak zastrzeżenia przy progu');
    assert.match(blok, /2025-07-13|1,1 roku/, 'brak liczby, która to uzasadnia');
    assert.match(blok, /5\+ OSÓB Z PB STARSZYM NIŻ 4 LATA/, 'brak warunku weryfikacji');
  });

  test('⚠️ ostrzeżenie NIE zmienia żadnej liczby na karcie', () => {
    /* To jest cała różnica wobec modyfikatora TSB i wykładnika, które
       odrzuciliśmy: tamte zmieniały prognozę na podstawie zgadniętej
       wielkości. Ten podwiersz mówi tylko, na czym liczba stoi. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'zawodnik.html'), 'utf8');
    /* Koniec bloku szukamy po znaczniku BEZ apostrofu — cytowanie apostrofu
       w łańcuchu narzędziowym już raz zjadło ucieczkę i dało plik, który się
       nie parsował. Marker musi być odporny na cytowanie. */
    const blok = src.slice(src.indexOf('const wiek = (maRekord'),
      src.indexOf('display:flex;justify-content:space-between;align-items:baseline'));
    assert.ok(!/riegel\s*=|dzis\s*=|wartosc\s*=/.test(blok),
      'wiek rekordu nie może wchodzić w tor liczenia prognozy');
  });
});

describe('⚠️ GRANTY — sprawdzone per tabela, nie z nawyku', () => {
  /* Blizna `feedback_athletes_column_grants` mówi „GRANT po ADD COLUMN", ale
     dotyczy tabel, gdzie SELECT nadano KOLUMNOWO. Zmierzone 16.08.2026:
       athletes             -> SELECT kolumnowy  → grant KONIECZNY
       training_logs        -> SELECT tabelowy   → grant zbędny
       athlete_intake_forms -> SELECT tabelowy   → grant zbędny */
  test('athletes dostaje GRANT SELECT na nowe kolumny', () => {
    const sql = czytaj('supabase/migrations/20260816_pb_rok_zamiast_daty.sql');
    assert.match(sql, /grant\s+select\s*\(pb_5k_year,\s*pb_10k_year,\s*pb_half_year,\s*pb_marathon_year\)/i);
  });

  test('⚠️ ŻADNA migracja nie nadaje uprawnień roli anon', () => {
    /* Pierwsza wersja migracji ankiety grantowała anonowi „bo ankietę wypełnia
       niezalogowany" — a anon nie ma DZIŚ żadnych praw do tej tabeli, więc
       byłoby to rozszerzenie przywilejów przemycone pod dodaniem kolumny. */
    for (const f of ['20260816_pb_rok_zamiast_daty.sql', '20260816_intake_pb_daty.sql',
                     '20260816_training_logs_casual_effort.sql']) {
      const sql = czytaj('supabase/migrations/' + f);
      const linie = sql.split('\n').filter((l) => !l.trim().startsWith('--'));
      assert.ok(!/\bto\b[^;]*\banon\b/i.test(linie.join('\n')), f + ' nadaje coś anonowi');
    }
  });

  test('⚠️ CHECK nie używa current_date — Postgres wymaga IMMUTABLE', () => {
    const sql = czytaj('supabase/migrations/20260816_pb_rok_zamiast_daty.sql');
    const check = sql.slice(sql.indexOf('add constraint athletes_pb_lata'), sql.indexOf('not valid;'));
    assert.ok(!/current_date|now\(\)|extract\(/i.test(check),
      'CHECK z funkcją STABLE nie utworzy się w ogóle');
  });
});

describe('⚠️ ŚCIEŻKA ANKIETY — rok musi DOJŚĆ do athletes', () => {
  const fn = czytaj('supabase/migrations/20260816_pb_rok_zamiast_daty.sql');

  test('tabela ankiety dostaje cztery kolumny rocznika', () => {
    assert.match(fn, /alter table public\.athlete_intake_forms[\s\S]*pb_marathon_year smallint/);
  });

  test('accept_intake_form przenosi roczniki w OBU gałęziach', () => {
    /* Bez tego rok wpisany przy rejestracji utknąłby w ankiecie i nigdy nie
       dotarł do zawodnika — po cichu, bo nic by nie krzyknęło.
       ⚠️ Funkcja MUSI być w tej samej migracji co DROP kolumn: plpgsql nie
          sprawdza ciał przy `drop column`, więc rozjazd wyszedłby dopiero przy
          pierwszym przyjęciu zawodnika. */
    assert.ok(/INSERT INTO athletes[\s\S]*pb_5k_year/.test(fn), 'gałąź INSERT');
    assert.ok(/UPDATE athletes[\s\S]*pb_5k_year =/.test(fn), 'gałąź UPDATE');
  });

  test('⚠️ rok idzie ZA SWOIM czasem, nie osobnym COALESCE', () => {
    /* `COALESCE(v_existing.pb_5k_at, v_intake.pb_5k_year)` rozprzęgłoby parę:
       zostawiłoby stary czas i podpięło pod niego datę z ankiety. Zła data przy
       dobrym czasie jest gorsza niż brak daty, bo wygląda na informację. */
    assert.ok(!/pb_5k_year = COALESCE\(v_existing\.pb_5k_year/.test(fn),
      'rozprzęgnięcie pary czas/data');
    assert.match(fn, /pb_5k_year = CASE WHEN NULLIF\(v_existing\.pb_5k, ''\) IS NOT NULL/);
  });

  test('⚠️ podmiana _at→_year nie uszkodziła nazw spoza PB', () => {
    /* BLIZNA Z TEJ MIGRACJI: pierwsza wersja podmieniała `_at` na `_year`
       w całym ciele funkcji. `v_athlete_id` zawiera `_at` w środku, więc
       stało się `v_yearhlete_id`, a `terms_accepted_at` zamieniło się w
       `terms_accepted_year` — kolumnę, której nie ma. Funkcja SECURITY DEFINER
       wyglądałaby na poprawną i wywaliła się przy pierwszym przyjęciu
       zawodnika, bo plpgsql nie sprawdza ciała przy zapisie.
       ⚠️ Granice słowa (\b) świadomie NIE MA w tych wyrażeniach: ta asercja
          już raz przeszła przez narzędzie, które zamieniło `\b` na literalny
          znak backspace — regexp wyglądał poprawnie w edytorze i nie pasował
          do niczego. Zwykłe podciągi wystarczą i nie da się ich zepsuć. */
    assert.ok(fn.includes('v_athlete_id'), 'v_athlete_id zniekształcone');
    assert.ok(fn.includes('terms_accepted_at'), 'terms_accepted_at zniekształcone');
    assert.ok(!fn.includes('v_yearhlete'), 'ślad ślepej podmiany: v_yearhlete');
    assert.ok(!fn.includes('accepted_year'), 'ślad ślepej podmiany: accepted_year');
  });
});
