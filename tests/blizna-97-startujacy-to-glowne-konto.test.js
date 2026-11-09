/* BLIZNA 97 (2.11.2026) — startujący akcji to GŁÓWNE konto Filipa, a konto testowe próby to konto testowe.
   2.11 było odwrotnie (wybór po e-mailu, nie po faktach): guzik odmówił Filipowi na jego koncie, a próba liczyłaby
   jego prawdziwe kilometry. Poprawka: 20261102_akcje_startujacy_poprawka.sql.

   Test na MIGAWCE z produkcji (supabase/schema/akcje/startujacy.json, tools/akcje-migawka.js --zrzut), NIE na żywo:
   - startujący 'dla-fabianka' ma wpis w coaches, ma zawodników i logował się w ciągu 7 dni PRZED ZRZUTEM
     (względem daty zrzutu, nie dziś — test nie gnije; świeżość migawki odnawia się kolejnym zrzutem);
   - konto testowe próby nie jest trenerem, nie jest startującym i jest tym samym kontem co PROBA_KONTA w kliencie
     i konta_testowe w poprawce;
   - ten sam startujący dla obu akcji = athlete_id z poprawki. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const M = JSON.parse(czytaj('supabase/schema/akcje/startujacy.json'));
const POPRAWKA = czytaj('supabase/migrations/20261102_akcje_startujacy_poprawka.sql').replace(/--[^\n]*/g, '');
const wiersz = (slug, rola) => M.wiersze.filter((w) => w.slug === slug && w.rola === rola);
const DOBA = 86400000;

test('startujący dla-fabianka: dokładnie jeden, w coaches, z zawodnikami, logowanie ≤ 7 dni przed zrzutem', () => {
  const s = wiersz('dla-fabianka', 'startujacy');
  assert.equal(s.length, 1, 'startujący dla-fabianka ≠ 1');
  assert.equal(s[0].w_coaches, true, 'startujący nie jest trenerem — to nie główne konto');
  assert.ok(s[0].zawodnikow > 0, 'startujący bez zawodników');
  assert.ok(s[0].last_sign_in_at, 'brak last_sign_in_at');
  const zrzut = Date.parse(M.zrzut_at), log = Date.parse(String(s[0].last_sign_in_at).replace(' ', 'T').replace(/\+00$/, 'Z'));
  assert.ok(Number.isFinite(zrzut) && Number.isFinite(log), 'nieczytelne daty migawki');
  assert.ok(zrzut - log <= 7 * DOBA && log <= zrzut + 60000, `logowanie ${s[0].last_sign_in_at} nie mieści się w 7 dniach przed zrzutem ${M.zrzut_at}`);
});

test('próba: ten sam startujący; konto testowe nie jest trenerem ani startującym', () => {
  const glowny = wiersz('dla-fabianka', 'startujacy')[0].athlete_id;
  assert.deepEqual(wiersz('proba', 'startujacy').map((w) => w.athlete_id), [glowny]);
  const t = wiersz('proba', 'konto_testowe');
  assert.equal(t.length, 1);
  assert.equal(t[0].w_coaches, false, 'konto testowe jest trenerem');
  assert.equal(t[0].zawodnikow, 0);
  assert.notEqual(t[0].athlete_id, glowny, 'konto testowe = główne konto (błąd z 2.11)');
});

test('migawka = klient (PROBA_KONTA); poprawka z rolami zamiast UUID (9.11, blizna-204)', async () => {
  const glowny = wiersz('dla-fabianka', 'startujacy')[0].athlete_id;
  const testowe = wiersz('proba', 'konto_testowe')[0].athlete_id;
  assert.notEqual(glowny, testowe);
  assert.match(POPRAWKA, /set athlete_id = '<KONTO STARTUJĄCE: wartość poza repo>'/);
  assert.match(POPRAWKA, /set konta_testowe = array\['<KONTO TESTOWE PRÓBY: wartość poza repo>'::uuid\]/);
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja-cytaty.mjs')).href);
  assert.deepEqual(globalThis.BM_AKCJA_CYTATY.PROBA_KONTA, [testowe]);
});
