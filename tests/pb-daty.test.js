// ─────────────────────────────────────────────────────────────────────────────
// DATA PRZY ŻYCIÓWCE — walidujDatePB + pbWiek.
//
// !! PO CO: `athletes.pb_*` to cztery pola `text` bez daty. Zmierzone
//    16.08.2026: 32 z 34 osób z ≥2 PB ma parę NIEDATOWALNĄ (94%), a odtworzenie
//    daty z logów udaje się dla 6 ze 111 PB (5%). Karta mówiła „Twój rekord"
//    i milczała o tym, że rekord może być sprzed trzech lat.
//
// !! MIESIĄC, NIE SAM ROK: sam rok wymusiłby założenie środka roku, czyli
//    ±6 miesięcy błędu. PB ze stycznia i z grudnia tego samego roku wyglądałyby
//    na jednoczesne, a z grudnia i ze stycznia następnego — na odległe o rok.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const ctx = zaladujSb();
const w = ctx.window.walidujDatePB;
const czytaj = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('walidujDatePB — reguły, o które prosił Filip', () => {
  test('pusta data jest legalna i daje null', () => {
    for (const p of [null, undefined, '', '   ']) {
      const r = w(p, '25:20');
      assert.equal(r.ok, true);
      assert.equal(r.data, null);
    }
  });

  test('⚠️ data z PRZYSZŁOŚCI odrzucona', () => {
    const d = new Date();
    const rok = d.getFullYear() + 1;
    assert.equal(w(rok + '-01', '25:20').ok, false);
  });

  test('bieżący miesiąc JEST legalny — granica nie może odcinać dzisiaj', () => {
    const d = new Date();
    const mies = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    assert.equal(w(mies, '25:20').ok, true, 'PB z tego miesiąca musi przejść');
  });

  test('⚠️ data sprzed 1990 odrzucona', () => {
    assert.equal(w('1989-12', '25:20').ok, false);
    assert.equal(w('1990-01', '25:20').ok, true, 'granica jest włączna');
  });

  test('⚠️ data przy PUSTYM PB odrzucona — sierota nic nie znaczy', () => {
    const r = w('2024-05', '');
    assert.equal(r.ok, false);
    assert.match(r.blad, /życiówk/i);
  });

  test('poprawna data daje PIERWSZY DZIEŃ miesiąca', () => {
    assert.equal(w('2024-05', '25:20').data, '2024-05-01');
  });

  test('śmieci odrzucone, nie przepuszczone jako null', () => {
    for (const zly of ['2024', '05-2024', '2024-13', '2024-00', 'maj 2024']) {
      assert.equal(w(zly, '25:20').ok, false, zly);
    }
  });
});

describe('⚠️ WIEK REKORDU — próg, nie każdy wiersz', () => {
  const T = '2026-08-16';
  const w = ctx.window.pbWiek;

  test('0–1 rok: MILCZY — rekord jest aktualny', () => {
    /* „PB z 2025" przy życiówce sprzed ośmiu miesięcy to szum. Pokazujemy wiek
       tylko tam, gdzie niesie informację — ta sama zasada, co przy paśmie. */
    for (const d of ['2026-08-01', '2026-01-01', '2025-09-01']) {
      assert.equal(w(d, T).tekst, '', d);
    }
  });

  test('2–3 lata: sam fakt, bez oceny', () => {
    /* ⚠️ Pola porownujemy pojedynczo, NIE deepEqual: window pochodzi z sandboxu
       `vm`, wiec obiekt ma inny Object.prototype i strict deepEqual odrzuca go
       mimo identycznej tresci — komunikat pokazuje wtedy dwie takie same
       wartosci obok siebie i wyglada na blad w kodzie, ktorego nie ma. */
    for (const [d, oczek] of [['2024-05-01', 'PB z 2024'], ['2023-05-01', 'PB z 2023']]) {
      const r = w(d, T);
      assert.equal(r.tekst, oczek);
      assert.equal(r.ostrzega, false);
    }
  });

  test('⚠️ 4+ lat: ostrzeżenie, bo człowiek nie wie, na czym stoi liczba', () => {
    const r = w('2019-06-01', T);
    assert.equal(r.tekst, 'PB z 2019 — szacunek może być zawyżony');
    assert.equal(r.ostrzega, true, 'ostrzeżenie musi być oznaczone, nie tylko dłuższe');
  });

  test('granica progu jest ostra i po właściwej stronie', () => {
    /* 3 lata i 11 miesięcy to jeszcze fakt, 4 lata to już ostrzeżenie. */
    assert.equal(w('2022-09-01', T).ostrzega, false, '3 lata 11 mies.');
    assert.equal(w('2022-08-01', T).ostrzega, true, 'równo 4 lata');
  });

  test('brak daty i data z przyszłości = brak podwiersza', () => {
    for (const d of [null, undefined, '', '2030-01-01']) assert.equal(w(d, T).tekst, '');
  });

  test('⚠️ PRÓG 4 LAT NIE MA POKRYCIA W DANYCH — i to jest zapisane', () => {
    /* Zmierzone 16.08.2026: najstarszy log w całej bazie ma 1,1 roku, więc
       obserwacji rekordów starszych niż rok jest ZERO. Próg jest decyzją.
       Ten test pilnuje, żeby nikt nie zaczął go traktować jak wyniku. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'sb.js'), 'utf8');
    const blok = src.slice(src.indexOf('PB_WIEK_PROG_OSTRZEZENIA') - 2000,
      src.indexOf('PB_WIEK_PROG_OSTRZEZENIA') + 200);
    assert.match(blok, /DECYZJA, NIE POMIAR/, 'brak zastrzeżenia przy progu');
    assert.match(blok, /2025-07-13|1,1 roku/, 'brak liczby, która to uzasadnia');
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
    const sql = czytaj('supabase/migrations/20260816_athletes_pb_daty.sql');
    assert.match(sql, /grant\s+select\s*\(pb_5k_at,\s*pb_10k_at,\s*pb_half_at,\s*pb_marathon_at\)/i);
  });

  test('⚠️ ŻADNA migracja nie nadaje uprawnień roli anon', () => {
    /* Pierwsza wersja migracji ankiety grantowała anonowi „bo ankietę wypełnia
       niezalogowany" — a anon nie ma DZIŚ żadnych praw do tej tabeli, więc
       byłoby to rozszerzenie przywilejów przemycone pod dodaniem kolumny. */
    for (const f of ['20260816_athletes_pb_daty.sql', '20260816_intake_pb_daty.sql',
                     '20260816_training_logs_casual_effort.sql']) {
      const sql = czytaj('supabase/migrations/' + f);
      const linie = sql.split('\n').filter((l) => !l.trim().startsWith('--'));
      assert.ok(!/\bto\b[^;]*\banon\b/i.test(linie.join('\n')), f + ' nadaje coś anonowi');
    }
  });

  test('⚠️ CHECK nie używa current_date — Postgres wymaga IMMUTABLE', () => {
    const sql = czytaj('supabase/migrations/20260816_athletes_pb_daty.sql');
    const check = sql.slice(sql.indexOf('add constraint'), sql.indexOf('not valid'));
    assert.ok(!/current_date|now\(\)/i.test(check),
      'CHECK z funkcją STABLE nie utworzy się w ogóle');
  });
});

describe('⚠️ ŚCIEŻKA ANKIETY — data musi DOJŚĆ do athletes', () => {
  const fn = czytaj('supabase/migrations/20260816_intake_pb_daty.sql');

  test('tabela ankiety dostaje cztery kolumny', () => {
    assert.match(fn, /alter table public\.athlete_intake_forms[\s\S]*pb_marathon_at date/);
  });

  test('accept_intake_form przenosi daty w OBU gałęziach', () => {
    /* Bez tego data wpisana przy rejestracji utknęłaby w ankiecie i nigdy nie
       dotarła do zawodnika — po cichu, bo nic by nie krzyknęło. */
    assert.ok(/INSERT INTO athletes[\s\S]*pb_5k_at/.test(fn), 'gałąź INSERT');
    assert.ok(/UPDATE athletes[\s\S]*pb_5k_at =/.test(fn), 'gałąź UPDATE');
  });

  test('⚠️ data idzie ZA SWOIM czasem, nie osobnym COALESCE', () => {
    /* `COALESCE(v_existing.pb_5k_at, v_intake.pb_5k_at)` rozprzęgłoby parę:
       zostawiłoby stary czas i podpięło pod niego datę z ankiety. Zła data przy
       dobrym czasie jest gorsza niż brak daty, bo wygląda na informację. */
    assert.ok(!/pb_5k_at = COALESCE\(v_existing\.pb_5k_at/.test(fn),
      'rozprzęgnięcie pary czas/data');
    assert.match(fn, /pb_5k_at = CASE WHEN NULLIF\(v_existing\.pb_5k, ''\) IS NOT NULL/);
  });
});
