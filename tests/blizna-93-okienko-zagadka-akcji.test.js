/* BLIZNA 93 (2.11.2026) — OKIENKO: zagadka akcji (decyzja Filipa). (Numer 93, nie 91 z komendy: blizna-91 to powiadomienia
   na współdzielonym urządzeniu.)

   Pytania o akcję → router, 0 tokenów, PRZED osobą/imprezą/katalogiem/siecią. Przed startem (czyAkcjaRuszyla = false)
   losowo jedna z 6 ZAGADEK (js/akcja-cytaty.mjs); po starcie „Akcja trwa — szczegóły na Dziś." (miejsce na kartę akcji,
   projekt F). Bez kart, bez sieci, bez modelu. „Fabianek" NIGDY do sieci ani trybu osoby — przed i po starcie.
   Ogólne wzorce („co się dzieje", „o co chodzi z…") nie przechwytują pytań o własne dane i pojęcia aplikacji. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const DZIS = '2026-11-02';
const PYTANIA = ['co sie dzieje 8 listopada', 'Kim jest Fabianek?', 'fabianek', 'jaka akcja się szykuje', 'co będzie 8.11', '08.11 co bedzie', 'co się szykuje?',
  'o co chodzi z tą akcją', 'jaki challenge?', 'wyzwanie specjalne', 'będą znaki', 'tajemnica', 'jakaś niespodzianka?', '12 500 km', '12500', 'Jasna Góra', 'peleryny', 'Fabianka'];

test('przed startem: każde pytanie → zdanie z ZAGADEK, log „zagadka", bez narzędzia i bez kart; losowanie z całej listy', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const A = globalThis.BM_AKCJA_CYTATY;
  assert.equal(A.ZAGADKI.length, 6);
  assert.equal(A.czyAkcjaRuszyla(), false);
  for (const q of PYTANIA) {
    const r = R.dopasuj(q, DZIS);
    assert.ok(r && A.ZAGADKI.includes(r.zdanie) && r.log === 'zagadka' && !r.narzedzie && !r.karty, q + ' → ' + JSON.stringify(r));
  }
  const widziane = new Set(); for (let i = 0; i < 6; i++) widziane.add(A.odpowiedzZagadki(() => i / 6 + 0.01).zdanie);
  assert.equal(widziane.size, 6, 'każda z 6 osiągalna');
  assert.equal(A.odpowiedzZagadki(() => 0.9999).zdanie, A.ZAGADKI[5]);
});

test('bez fałszywych trafień: pytania o własne dane i pojęcia aplikacji idą jak dotąd', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  for (const [q, oczek] of [['o co chodzi z tsb', null], ['co sie dzieje z moim planem', null], ['plan na jutro', 'moj_plan'], ['jakie biegi w listopadzie', 'biegi_nadchodzace'],
    ['jaka mam forme', 'moja_forma'], ['co sie dzieje z moja forma', 'moja_forma']]) {
    const r = R.dopasuj(q, DZIS);
    assert.ok(!r || r.log !== 'zagadka', q);
    if (oczek) assert.equal(r && r.narzedzie, oczek, q);
  }
});

test('„Fabianek" nigdy do trybu osoby ani sieci — router zatrzymuje pytanie PRZED osobą (EF: router pierwszy), przed i po starcie', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const A = globalThis.BM_AKCJA_CYTATY;
  for (const q of ['Kim jest Fabianek?', 'fabianek', 'Fabianek Nowak', 'szukaj Fabianka w sieci']) assert.equal(R.dopasuj(q, DZIS).log, 'zagadka', q);
  const ef = czytaj('supabase/functions/okienko/index.ts');
  const iRouter = ef.indexOf('const traf = dopasuj(tekst, dzis);'), iZdanie = ef.indexOf('if (traf && "zdanie" in traf)');
  assert.ok(iRouter > 0 && iZdanie > iRouter, 'zdanie routera obsłużone');
  for (const k of ['const os = osobaZPytania(tekst);', 'const imp = imprezaZPytania(tekst);', 'szukajWKatalogu(sb, tekst)', 'zapytajModel({']) assert.ok(ef.indexOf(k) > iZdanie, 'router przed: ' + k);
  assert.match(ef.slice(iZdanie, iZdanie + 400), /narzedzia: \[traf\.log\]/);
  A.ustawStan({ ruszyla: true });
  try {
    for (const q of ['Kim jest Fabianek?', 'co sie dzieje 8 listopada', 'jaka akcja']) assert.deepEqual(R.dopasuj(q, DZIS), { zdanie: 'Akcja trwa — szczegóły na Dziś.', log: 'zagadka' }, q);
  } finally { A.ustawStan({ ruszyla: false }); }
});

test('ławka: 3 pytania akcji; js/akcja-cytaty.mjs jedno źródło (router importuje, bez kopii zdań)', () => {
  const l = czytaj('tests/_lawka-pytan.js');
  for (const q of ['co sie dzieje 8 listopada', 'kim jest Fabianek', 'jaka akcja sie szykuje']) assert.ok(l.includes(`['${q}', 'akcja'`), q);
  const r = czytaj('supabase/functions/okienko/router.mjs');
  assert.match(r, /import "\.\.\/\.\.\/\.\.\/js\/akcja-cytaty\.mjs";/);
  assert.ok(!/nie biegniesz sam/.test(r), 'zdania zagadek tylko w js/akcja-cytaty.mjs');
});
