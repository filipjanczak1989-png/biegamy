/* BLIZNA 173 / PODGLĄD GRY (Filip 5.11): parametry adresu pokazują plansze, finał, premierę i Górkę bez kont i bez czekania.
   - działają tylko poza produkcją: ten sam warunek na hostname co ranking=przyklad;
   - arkusz koparki w podglądzie leży w katalogu podglad/, który NIGDY nie trafia do repo (wizerunek do startu jest tajemnicą). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('katalogu podglądu nie ma w repo', () => {
  assert.equal(execSync('git ls-files podglad', { cwd: KORZEN, encoding: 'utf8' }).trim(), '');
});

test('każdy nowy parametr konta siedzi za przyklad, a przyklad za warunkiem na hostname', () => {
  const k = czytaj('js/cegielki-konto.js');
  assert.match(k, /var przyklad = parametry\.get\("ranking"\) === "przyklad" && location\.hostname !== "biegamy\.run" && location\.hostname !== "run\.biegamy\.app";/);
  assert.match(k, /if \(parametry\.get\("premiera"\) === "przyklad" && przyklad\) return \{ slug: "proba", podglad: true \};/);
  assert.match(k, /if \(przyklad && parametry\.get\("final"\) === "1"\)/);
  assert.match(k, /if \(przyklad && parametry\.get\("plansze"\) === "znowu"\)/);
  assert.match(k, /if \(przyklad && parametry\.get\("plansza"\)\) gotowe\.then\(planszaPodgladu\);/);
  assert.equal((k.match(/ARKUSZ_PODGLADU/g) || []).length, 3, 'stała, atrapa koparki i premiera na podglądzie');
  const blok = k.slice(k.indexOf('async function sprawdzDostep'), k.indexOf('rysujMur();', k.indexOf('async function sprawdzDostep')));
  assert.match(blok, /if \(przyklad\) \{/); assert.match(blok, /parametry\.get\("koparka_lokalna"\) === "1" \? ARKUSZ_PODGLADU/);
  assert.match(k, /if \(premiera\.podglad\) \{ adres = ARKUSZ_PODGLADU;/, 'podgląd premiery tylko dla obiektu z przyklad');
  const atrapa = k.slice(k.indexOf('async function pobierzRanking'), k.indexOf('if (stan.zalogowany && window.sb)', k.indexOf('async function pobierzRanking')));
  for (const p of ['mur', 'zamknieta', 'meta', 'podpis']) assert.ok(atrapa.includes('parametry.get("' + p + '")'), p + ' tylko w atrapie rankingu');
});

test('Górka z adresu tylko poza produkcją', () => {
  assert.match(czytaj('js/cegielki.js'), /if \(parametry\.get\("gorka"\) === "1" && location\.hostname !== "biegamy\.run" && location\.hostname !== "run\.biegamy\.app"\) \{ L\.GORKA\.poziom_od = 1; L\.GORKA\.start_s = 3; \}/);
});
