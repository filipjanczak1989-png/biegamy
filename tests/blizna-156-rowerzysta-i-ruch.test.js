/* BLIZNA 156 (4.11.2026): dwie decyzje Filipa przed ruchem z mediów.
   ROWERZYSTA: rower nie liczy się do licznika, wszystko za przełącznikiem, domyślnie wyłączone, po zgodzie tej osoby. Imię nie trafia do publicznego repo.
   RUCH: wejście na stronę nie może oznaczać zapytania do bazy. Pamięć w funkcjach + jedno wspólne zapytanie przy naporze, licznik na scenie nie częściej niż ma sens. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const bezSql = (s) => s.replace(/--[^\n]*/g, '');
const MIG = 'supabase/migrations/20261105_akcja_rowerzysta.sql', EF = 'supabase/functions/akcja-wyprawa-slad/index.ts';

test('rowerzysta: domyślnie wyłączony, niczego nie włącza migracja', () => {
  const t = bezSql(czytaj(MIG));
  assert.match(t, /rowerzysta_wlaczony boolean not null default false/);
  assert.doesNotMatch(t, /update\s+public\.akcje/i);
});

test('rowerzysta: nie liczy się do kilometrów', () => {
  const m = bezSql(czytaj(MIG));
  assert.doesNotMatch(m, /create (or replace )?function/i, 'migracja nie rusza licznika');
  const ef = czytaj(EF);
  assert.match(ef, /rowerzysta: rower\?\.rowerzysta_wlaczony === true && u\.ostatni \? \{ pozycja: u\.ostatni, opis: rower\.rowerzysta_opis \|\| "" \} : null/, 'kropka tylko po włączeniu, pozycja z widocznego śladu');
  const km = ef.slice(ef.indexOf('km: Math.round(u.dlugosc_m'), ef.indexOf('segmenty: u.segmenty'));
  assert.doesNotMatch(km, /rower/, 'dystans bez roweru');
  assert.doesNotMatch(ef.slice(ef.indexOf('async function odswiez'), ef.indexOf('async function slad')), /rower/i, 'odświeżanie śladu nie pobiera roweru');
});

test('rowerzysta: imię, nazwisko i nazwa roweru tylko w bazie', () => {
  for (const p of [MIG, EF, 'mapa-wyprawy.html', 'supabase/migrations/20261105_WYCOFANIE_akcja_rowerzysta.sql']) assert.doesNotMatch(czytaj(p), /bednarek|s[lł]awek|wigry/i, p);
});

/* Zgoda jest (Filip 4.11), więc plik może leżeć w repo. Strony działają też bez niego, więc test sprawdza plik tylko wtedy, gdy jest. */
test('plik rowerzysty: prawdziwy WebP, lekki', () => {
  const p = path.join(KORZEN, 'assets/akcja/rowerzysta.webp');
  if (!fs.existsSync(p)) return;
  const b = fs.readFileSync(p);
  assert.equal(b.subarray(0, 4).toString(), 'RIFF');
  assert.equal(b.subarray(8, 12).toString(), 'WEBP');
  assert.ok(b.length < 200 * 1024, 'waga ' + b.length);
});

test('bez przełącznika strony nie proszą nawet o plik', () => {
  const m = czytaj('mapa-wyprawy.html');
  assert.ok(m.indexOf('if (d.rowerzysta && Array.isArray(d.rowerzysta.pozycja))') < m.indexOf('proba.src = IKONA_ROWERU'), 'mapa pobiera ikonę dopiero po włączeniu');
  const sc = czytaj('js/ulica-scena.mjs');
  assert.ok(sc.indexOf('d.rowerzysta === true && ruch') < sc.indexOf('assets/akcja/rowerzysta.webp'), 'ulica pobiera plik dopiero po włączeniu');
});

test('mapa: postać tylko z odpowiedzi serwera, z naszego originu, podpis przez escape', () => {
  const m = czytaj('mapa-wyprawy.html');
  assert.match(m, /if \(d\.rowerzysta && Array\.isArray\(d\.rowerzysta\.pozycja\)\)/);
  assert.match(m, /rower\.bindPopup\(esc\(d\.rowerzysta\.opis\)\)/);
});

test('ruch: mapa nie omija cache i ma pamięć w funkcji', () => {
  assert.doesNotMatch(czytaj('mapa-wyprawy.html'), /cache: 'no-store'/);
  const ef = czytaj(EF);
  assert.match(ef, /CACHE_SLADU_MS = 120_000/);
  assert.match(ef, /sladWTrakcie\.get\(slug\)/, 'jedno wspólne zapytanie przy naporze');
  assert.match(ef, /if \(error\) throw error;/, 'błąd bazy nie trafia do pamięci jako pusty ślad');
  const odczyt = ef.slice(ef.indexOf('if (rodzaj !== "slad")'));
  assert.ok(odczyt.indexOf('pamiecSladu.get(slug)') < odczyt.indexOf('sb.from("akcje")'), 'najpierw pamięć, potem baza');
});

test('ruch: licznik czeka na jedno zapytanie, scena nie odpytuje co 30 s', () => {
  const l = czytaj('supabase/functions/akcja-licznik/index.ts');
  assert.match(l, /wTrakcie\.get\(slug\)/);
  assert.match(l, /CACHE_MS = 60_000/);
  assert.ok(l.indexOf('pamiec.get(slug)') < l.indexOf("sb.rpc('akcja_licznik'"), 'najpierw pamięć, potem baza');
  assert.match(czytaj('js/ulica-scena.mjs'), /\}, 300000 \+ Math\.random\(\) \* 60000\);/);
});
