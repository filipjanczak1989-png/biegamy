// ─────────────────────────────────────────────────────────────────────────────
// ZNACZNIK „TRENINGOWO" PRZY STARCIE — casual_effort.
//
// !! DLACZEGO W OGÓLE ISTNIEJE: `training_type = 'Start'` znaczyło jednocześnie
//    parkrun w luzie i dychę na zawodach. Przez to nie dało się zweryfikować
//    ŻADNEJ liczby w aplikacji — ani predykcji, ani formy. Zmierzone 16.08.2026
//    na 65 startach: 48 to prawdziwe maksy, 10 luźne, 7 nierozstrzygalnych.
//
// !! DOMYŚLNIE false = „na maksa", bo to prawda dla ~74% istniejących wpisów.
//    Znacznik zaznacza WYJĄTEK, nie regułę.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const czytaj = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('SSOT — jeden warunek dla trzech modali', () => {
  const ctx = zaladujSb();

  test('window.jestStartem rozpoznaje Start i Wyścig, odrzuca resztę', () => {
    const j = ctx.window.jestStartem;
    for (const t of ['Start', 'Wyścig', 'start', ' WYŚCIG ']) assert.equal(j(t), true, t);
    for (const t of ['Spokojny', 'Interwały', 'Tempo', 'Zastępczy', '', null, undefined])
      assert.equal(j(t), false, String(t));
  });

  test('⚠️ „Wyścig" MUSI być na liście — istnieje w bazie obok „Start"', () => {
    /* 84 wiersze to Start + Wyścig łącznie. Gdyby lista miała tylko „Start",
       wpisy typu „Wyścig" byłyby nieoznaczalne na zawsze — modal nigdy by
       nie pokazał pytania. */
    assert.ok(ctx.window.TYPY_STARTU.includes('Wyścig'));
  });
});

describe('⚠️ TRZY MODALE MUSZĄ PYTAĆ — nie jeden', () => {
  /* Trzy modale logowania nadal istnieją (zawodnik + dwa w kalendarzu) i każdy
     musi podać znacznik, inaczej część startów wchodzi bez niego i próbka
     znowu jest zanieczyszczona.
     !! ZMIANA 27.08.2026: zapisy zostały SCALONE — kolumnę pisze teraz jedno
        miejsce, `window.zapiszLog` w sb.js. Niezmiennik jest ten sam, ale
        sprawdzamy go inaczej: każdy modal PODAJE `casual_effort` rdzeniowi,
        a rdzeń go PRZEPUSZCZA do payloadu. Liczenie wystąpień w stronach
        przestało mierzyć „ile ścieżek zapisu", bo ścieżka zapisu jest jedna. */
  const pliki = { 'zawodnik.html': czytaj('zawodnik.html'), 'kalendarz.html': czytaj('kalendarz.html') };

  test('każdy modal PODAJE casual_effort do rdzenia', () => {
    assert.ok(/casual_effort:/.test(pliki['zawodnik.html']), 'zawodnik.html');
    /* kalendarz: modal treningu (saveTraining) + log-modal (saveLog) = 2 */
    assert.equal((pliki['kalendarz.html'].match(/casual_effort:/g) || []).length, 2,
      'kalendarz ma dwa modale podające znacznik: saveTraining i saveLog');
  });

  test('⚠️ RDZEŃ faktycznie przepuszcza kolumnę do payloadu', () => {
    /* Bez tego trzy modale mogłyby podawać znacznik w próżnię: rdzeń kopiuje
       do payloadu tylko pola z jawnej listy, więc pominięcie `casual_effort`
       na tej liście CICHO wyrzuciłoby kolumnę ze wszystkich trzech ścieżek
       naraz — dokładnie ta klasa ryzyka, którą scalenie wprowadza. */
    assert.match(czytaj('sb.js'), /'casual_effort',/,
      'sb.js: casual_effort nie ma na liście pól kopiowanych do payloadu');
  });

  test('⚠️ żaden zapis nie ufa samemu checkboxowi — zawsze przez jestStartem', () => {
    /* Sekcja jest UKRYWANA przy zmianie typu, ale ukrycie to nie wyzerowanie.
       Gdyby zapis czytał tylko `.checked`, dałoby się wysłać znacznik na
       wpisie typu Spokojny, gdzie kolumna nie ma znaczenia. */
    for (const [nz, src] of Object.entries(pliki)) {
      for (const m of src.matchAll(/casual_effort:\s*([^,]*(?:\n[^,]*)*?),\n/g)) {
        assert.ok(/jestStartem/.test(m[1]),
          nz + ': zapis casual_effort bez bramki jestStartem -> ' + m[1].slice(0, 80));
      }
    }
  });

  test('każdy modal czyści zaznaczenie przy zmianie typu na nie-start', () => {
    for (const [nz, src] of Object.entries(pliki)) {
      assert.ok(/checked = false/.test(src), nz + ': brak czyszczenia checkboxa');
    }
  });
});

describe('MIGRACJA', () => {
  const sql = czytaj('supabase/migrations/20260816_training_logs_casual_effort.sql');

  test('kolumna jest NOT NULL z domyślnym false', () => {
    assert.match(sql, /add column if not exists casual_effort boolean not null default false/i);
  });

  test('⚠️ BRAK grantu jest tu SPRAWDZONY, nie pominięty', () => {
    /* Pierwsza wersja tej migracji miała `grant select (casual_effort)` —
       z nawyku, na podstawie blizny z `athletes`. Zmierzone 16.08.2026:
         athletes             -> authenticated ma SELECT tylko KOLUMNOWO
         training_logs        -> authenticated ma SELECT TABELOWO
         athlete_intake_forms -> authenticated ma SELECT TABELOWO
       Grant tabelowy obejmuje kolumny dodane później, więc tutaj grant byłby
       martwą linią udającą zabezpieczenie. Test pilnuje, żeby ktoś nie dopisał
       go „na wszelki wypadek" i żeby powód został zapisany. */
    assert.ok(!/grant\s+select\s*\(casual_effort\)/i.test(sql),
      'grant jest zbędny — training_logs ma SELECT tabelowo');
    assert.match(sql, /SELECT jest nadany KOLUMNOWO|SELECT tabelowo/,
      'powód braku grantu musi być zapisany w migracji, inaczej ktoś go „naprawi"');
  });

  test('⚠️ ŻADNEGO BACKFILLU — 84 istniejące starty zostają jako „na maksa"', () => {
    /* Mój wykrywacz opiera się na PROXY tętna maksymalnego, nie na pomiarze.
       Wpisanie jego wyniku do bazy zamieniłoby oszacowanie w fakt. */
    assert.ok(!/^\s*update\s+public\.training_logs/im.test(sql), 'migracja nie może nic backfillować');
    assert.ok(!/insert\s+into/i.test(sql));
  });
});
