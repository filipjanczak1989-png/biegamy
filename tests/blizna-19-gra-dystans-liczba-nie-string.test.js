/* BLIZNA 19: `gra.html` wysyłała `distance_km` jako STRING.
   Zgłoszone 14.08.2026, naprawione 19.08.2026.

       const distance_km = (d.distance / 1000).toFixed(2);   // "0.00", nie 0

   ⚠️ KLASA BŁĘDU: „działa, bo ktoś inny sprząta". Postgres rzutował string na
   `numeric`, więc zapis przechodził — usterka była niewidoczna i czekała na
   walidację po stronie klienta albo zmianę typu kolumny.

   ⚠️ DRUGI, GROŹNIEJSZY SKUTEK, wykryty przy naprawie: przy `d.distance`
   niebędącym liczbą `toFixed` dawał string "NaN". Postgres przyjmuje `numeric
   NaN`, ale CHECK `training_logs_distance_sane` go odrzuca — bo `NaN <= 500`
   jest FAŁSZEM — wywalając CAŁY insert. Teraz brak dystansu to jawny `null`,
   który ten sam CHECK dopuszcza wprost (`distance_km IS NULL OR ...`).

   Zmierzone 19.08.2026: `training_type = 'Warm-up mentalny'` ma w bazie
   0 wierszy, więc naprawa nie dotyka żadnych danych historycznych. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

/* Wzór wyjęty Z PLIKU, nie przepisany — inaczej test sprawdzałby swoją kopię.
   Ta sama lekcja co przy podłodze 3 km (blizna 6): asercja porównująca się
   z samą sobą nie pilnuje niczego. */
const src = fs.readFileSync(path.join(__dirname, '..', 'gra.html'), 'utf8');
const m = /const _km = Number\(d\.distance\) \/ 1000;\s*\n\s*const distance_km = ([^;]+);/.exec(src);
assert.ok(m, 'nie znaleziono wyliczenia distance_km w gra.html — zmienił się kształt naprawy');
const policz = new Function('d', 'const _km = Number(d.distance) / 1000; return ' + m[1] + ';');

/* Odtworzenie CHECK-a z bazy, zweryfikowanego 19.08.2026:
   CHECK ((distance_km IS NULL) OR (distance_km >= 0 AND distance_km <= 500))
   ⚠️ Semantyka Postgresa, nie JS: `numeric NaN` jest większy od każdej liczby,
   więc `NaN <= 500` to FAŁSZ i wiersz odpada. */
function checkPrzechodzi(v) {
  if (v === null || v === undefined) return true;          // IS NULL
  if (typeof v === 'string') v = Number(v);                 // rzutowanie Postgresa
  if (Number.isNaN(v)) return false;                        // NaN <= 500 => false
  return v >= 0 && v <= 500;
}

test('19 — gra wysyła LICZBĘ, nie string', async (t) => {

  await t.test('⚠️ typ to number, nie string', () => {
    for (const dist of [0, 1, 950, 1234.5, 42195]) {
      const v = policz({ distance: dist });
      assert.strictEqual(typeof v, 'number', 'distance=' + dist + ' dało ' + typeof v);
    }
  });

  await t.test('wartość się nie zmieniła — to naprawa typu, nie arytmetyki', () => {
    assert.strictEqual(policz({ distance: 0 }), 0);
    assert.strictEqual(policz({ distance: 1234.5 }), 1.23);
    assert.strictEqual(policz({ distance: 950 }), 0.95);
  });

  await t.test('⚠️ CHECK distance_km >= 0 nadal przechodzi po zmianie na liczbę', () => {
    for (const dist of [0, 1, 950, 1234.5, 42195, 100000]) {
      const v = policz({ distance: dist });
      assert.ok(checkPrzechodzi(v), 'CHECK odrzuciłby ' + JSON.stringify(v) + ' (distance=' + dist + ')');
    }
  });

  await t.test('⚠️ BRAK DYSTANSU TO null, nie "NaN" — i to jest sedno naprawy', () => {
    for (const zly of [undefined, NaN, 'abc', {}]) {
      const v = policz({ distance: zly });
      assert.strictEqual(v, null, JSON.stringify(String(zly)) + ' dało ' + JSON.stringify(v));
      assert.ok(checkPrzechodzi(v), 'null musi przechodzić CHECK (gałąź IS NULL)');
    }
  });

  await t.test('null jako dystans zachowuje się jak przed naprawą (0), bez regresji', () => {
    assert.strictEqual(policz({ distance: null }), 0);
  });

  /* ══ TEST NEGATYWNY ═══════════════════════════════════════════════════════
     Stary wzór obok nowego. Bez tego nie wiadomo, czy asercje wyżej cokolwiek
     pilnują — mogłyby przechodzić także dla kodu sprzed naprawy. */
  await t.test('⚠️ REGRESJA NA STRING: stary wzór musi oblać asercje wyżej', () => {
    const stary = (d) => (d.distance / 1000).toFixed(2);

    assert.strictEqual(typeof stary({ distance: 0 }), 'string',
      'gdyby toFixed zwracał liczbę, asercja o typie byłaby pusta');
    assert.strictEqual(stary({ distance: 0 }), '0.00');

    // …i twardszy dowód: przy braku dystansu stary wzór produkował "NaN",
    // którego CHECK NIE przepuszcza — czyli tracił cały insert.
    assert.strictEqual(stary({ distance: undefined }), 'NaN');
    assert.strictEqual(checkPrzechodzi(stary({ distance: undefined })), false,
      'stary wzór dawał wartość odrzucaną przez CHECK — na tym polegało ryzyko');
    assert.strictEqual(checkPrzechodzi(policz({ distance: undefined })), true,
      'nowy wzór musi tę samą sytuację przeprowadzić przez CHECK');
  });
});
