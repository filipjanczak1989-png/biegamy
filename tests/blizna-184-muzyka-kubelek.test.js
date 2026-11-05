/* BLIZNA 184 / MUZYKA W PRYWATNYM KUBEŁKU (Filip 6.11).
   Kubełek akcja-wizerunek odrzucał MP3. Teksty piosenek mają imię dziecka, więc jak film: plik prywatny, adres podpisany w bazie, licznik oddaje go po starcie i przy zgodzie.
   Limit rozmiaru bez zmian, wycofanie przywraca dokładnie obecną listę typów. Po skutku: tools/akcja-muzyka-test.sh. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const M = czytaj('supabase/migrations/20261107_akcja_muzyka.sql'), W = czytaj('supabase/migrations/20261107_WYCOFANIE_akcja_muzyka.sql'), T = czytaj('tools/akcja-muzyka-test.sql');

test('kubełek: audio/mpeg dopisane, limit bez zmian, wycofanie przywraca obecną listę', () => {
  assert.match(M, /update storage\.buckets set allowed_mime_types = array\['image\/webp', 'video\/mp4', 'audio\/mpeg'\] where id = 'akcja-wizerunek';/);
  assert.match(W, /update storage\.buckets set allowed_mime_types = array\['image\/webp', 'video\/mp4'\] where id = 'akcja-wizerunek';/);
  assert.doesNotMatch(M, /file_size_limit\s*=/, 'limit rozmiaru bez zmian');
  assert.doesNotMatch(W, /file_size_limit\s*=/, 'wycofanie też nie rusza limitu');
  assert.match(M, /b\.allowed_mime_types is distinct from array\['image\/webp', 'video\/mp4'\]/, 'inna lista na bazie = odmowa, bo wycofanie przywraca właśnie tę');
  assert.match(T, /b\.file_size_limit is distinct from 5242880/);
});

test('licznik: tylko po starcie, przy zgodzie, nigdy na próbie; rower przy włączonym rowerzyście', () => {
  assert.match(M, /'muzyka', case when a\.wizerunek_zgoda and not a\.testowa then a\.muzyka - \(case when a\.rowerzysta_wlaczony then array\[\]::text\[\] else array\['rower'\] end\) end, /);
  assert.match(M, /j_po - 'muzyka'\) is distinct from j_przed/, 'odpowiedź licznika bez zmian poza nowym polem');
  assert.match(M, /przed startem licznik nie może znać muzyki/);
  assert.match(M, /has_column_privilege\('authenticated', 'public\.akcje', 'muzyka', 'SELECT'\)/);
  assert.doesNotMatch(M, /\bgrant\b/i, 'create or replace zachowuje uprawnienia');
  assert.match(W, /drop column if exists muzyka/);
});

test('adresy: tylko podpisane MP3 z prywatnego kubełka i tylko znane pozycje', () => {
  assert.match(M, /sign\/akcja-wizerunek\/\[A-Za-z0-9\._-\]\+\\\\\.mp3\\\\\?token=/);
  for (const k of ['premiera', 'menu1', 'menu2', 'rower', 'noc', 'mur', 'final', 'magazyn']) assert.match(M, new RegExp(`'${k}'`));
  assert.match(T, /FAIL 5f: niewypełniony wzór/);
  assert.match(czytaj('tools/akcja-muzyka-test.sh'), /TESTY MUZYKI ZIELONE/);
});

test('w repo żadnych adresów, tekstów ani plików muzyki', () => {
  assert.doesNotMatch(M + W + T, /token=[A-Za-z0-9._-]{40,}/, 'adresy podpisane tylko w bazie');
  assert.doesNotMatch(M + W + T, /s[lł]awek|wigr|wojtaszak/i);
  const pliki = (k) => { try { return fs.readdirSync(path.join(KORZEN, k)); } catch (e) { return []; } };
  assert.deepEqual(pliki('assets/gra').concat(pliki('assets/akcja'), pliki('assets/gra/dzwieki')).filter((n) => /\.mp3$/.test(n) && /muzyka|piosenka|biegniemy|nocna|magazyn|mur-stoi/.test(n)), [], 'tajna muzyka nie leży w publicznych plikach');
});
