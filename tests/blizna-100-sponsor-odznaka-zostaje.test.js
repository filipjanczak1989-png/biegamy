/* BLIZNA 100 (2.11.2026) — sponsor kilometrów: odznaka akcja-sponsor przy ZAPISIE deklaracji w oknie akcji i ZOSTAJE na zawsze,
   także po wycofaniu deklaracji (decyzja Filipa 2.11 15:03 / 15:16). Zachowanie na żywej bazie: tools/akcja-deklaracje-test.sh
   (15 asercji, w tym „wycofanie → odznaka zostaje"). Tu tekst migracji i formularz.
   Formularz bez zmian: „Wpłacasz sam na oficjalną zbiórkę po zakończeniu akcji. Aplikacja tylko liczy." */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const SQL = czytaj('supabase/migrations/20261102_akcja_deklaracje.sql').replace(/--[^\n]*/g, '');
const fn = (n) => SQL.match(new RegExp('create function public\\.' + n + '\\([\\s\\S]*?\\$fn\\$;'))[0];

test('deklaracja przyznaje odznakę w tej samej transakcji, tylko w oknie; wycofanie NIE dotyka achievements', () => {
  const d = fn('akcja_deklaruj');
  assert.match(d, /insert into public\.achievements \(athlete_id, badge_id\) values \(v_ja, 'akcja-sponsor'\)\s+on conflict \(athlete_id, badge_id\) do nothing;/);
  assert.match(d, /a\.wystartowala_at is null or v_dzis < a\.start or \(a\.koniec is not null and v_dzis > a\.koniec\)/);
  assert.match(d, /a\.testowa and not \(v_ja = any/);
  assert.match(d, /p_stawka_gr < 1 or p_stawka_gr > 10000/);
  const w = fn('akcja_wycofaj_deklaracje');
  assert.match(w, /delete from public\.akcja_sponsorzy where akcja_id = a\.id and athlete_id = v_ja;/);
  assert.doesNotMatch(w, /achievements/, 'wycofanie dotyka odznak — odznaka ma zostać na zawsze');
  assert.doesNotMatch(SQL, /\bgrant\b[^;]*\banon\b/i);
  assert.ok(czytaj('supabase/migrations/20261102_WYCOFANIE_akcja_deklaracje.sql').includes('drop function if exists public.akcja_deklaruj(text, integer);'));
});

test('formularz: tekst Filipa bez zmian, za przełącznikiem włączanym razem z migracją, przyciski przez data-akcja', async () => {
  globalThis.escapeHtml = (s) => String(s);
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  const A = globalThis.BM_AKCJA;
  assert.equal(A.TEKST_DEKLARACJI, 'Wpłacasz sam na oficjalną zbiórkę po zakończeniu akcji. Aplikacja tylko liczy.');
  const kod = czytaj('js/akcja.mjs');
  assert.match(kod, /var DEKLARACJE_GOTOWE = (true|false);/);
  assert.doesNotMatch(kod, /data-akcja="zapisz"/, 'od 12.11 (blizna-231) formularz nowej deklaracji schowany; wraca w wersji z potwierdzeniem');
  assert.match(kod, /data-akcja="wycofaj"/);
  const z = czytaj('zawodnik.html');
  assert.match(z, /sb\.rpc\('akcja_deklaruj', \{ p_slug: slug, p_stawka_gr: st \}\)/);
  assert.match(z, /sb\.rpc\('akcja_wycofaj_deklaracje', \{ p_slug: slug \}\)/);
  assert.doesNotMatch(z.slice(z.indexOf('SPONSOR KILOMETRÓW'), z.indexOf('ODZNAKI AKCJI (projekt F dzień 4, finał')), /from\('achievements'\)\.delete|\.delete\(\)/, 'klient kasuje odznakę');
});
