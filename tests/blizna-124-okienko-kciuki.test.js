/* BLIZNA 124 (3.11.2026, Filip „stały rytm uczenia” pkt 1): KCIUKI 👍/👎 pod odpowiedzią — TYLKO okienko v2 (konta z listy). Zapis do
   okienko_v2_log.ocena (+ komentarz po 👎) przez RPC okienko_ocena: właściciel, swój wpis, ≤ 24 h; authenticated nadal bez UPDATE na logu.
   EF v2 oddaje `log_id` (zapis logu zwraca id) i dopisuje skrót odpowiedzi do wpisu (raport poranny, sędzia). Stare okienko (v1) bez zmian:
   bez log_id → bez kciuków. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('migracja: kolumny komentarz/odpowiedz, RPC okienko_ocena (właściciel, 24 h, -1|1, komentarz tylko przy 👎), bez UPDATE dla authenticated', () => {
  const m = czytaj('supabase/migrations/20261105_okienko_kciuki.sql');
  assert.match(m, /add column if not exists komentarz text check \(komentarz is null or char_length\(komentarz\) <= 300\)/);
  assert.match(m, /add column if not exists odpowiedz text check \(odpowiedz is null or char_length\(odpowiedz\) <= 400\)/);
  assert.match(m, /create or replace function public\.okienko_ocena\(p_id bigint, p_ocena smallint, p_komentarz text default null\)/);
  assert.match(m, /security definer set search_path = public/); assert.match(m, /l\.kiedy > now\(\) - interval '24 hours'/); assert.match(m, /a\.user_id = auth\.uid\(\)/);
  assert.match(m, /case when p_ocena = -1 and p_komentarz is not null/); assert.match(m, /revoke all on function public\.okienko_ocena\(bigint, smallint, text\) from public, anon;/);
  assert.match(m, /has_table_privilege\('authenticated', 'public\.okienko_v2_log', 'UPDATE'\)/, 'asercja: ocena tylko przez RPC');
  assert.match(czytaj('supabase/migrations/20261105_WYCOFANIE_okienko_kciuki.sql'), /drop function if exists public\.okienko_ocena/);
  const t = czytaj('tools/okienko-kciuki-test.sql'); for (const f of ['FAIL 1b', 'FAIL 1d', 'FAIL 1e', 'FAIL 1g', 'FAIL 2a', 'FAIL 3a']) assert.ok(t.includes(f), f);
});

test('log-v2: zapis zwraca id, gdy klient umie .select (prod), true na atrapie; skrót odpowiedzi best-effort; potok oddaje log_id tylko przy 200', async () => {
  const L = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/okienko-v2/log-v2.mjs')).href);
  const zId = { from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: { id: 42 }, error: null }) }) }) }) };
  assert.equal(await L.zapiszLogV2(zId, { athlete_id: JA, tekst: 'x', tryb: 'router' }), 42);
  const t = { okienko_v2_log: [] };
  assert.equal(await L.zapiszLogV2(atrapa(t), { athlete_id: JA, tekst: 'x', tryb: 'router' }), true, 'atrapa bez .select → true (ławka bez zmian)');
  const bledny = { from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'x' } }) }) }) }) };
  assert.equal(await L.zapiszLogV2(bledny, { athlete_id: JA, tekst: 'x', tryb: 'router' }), false);
  let upd = null; const zUpd = { from: () => ({ update: (w) => ({ eq: async (k, v) => { upd = { w, k, v }; return { error: null }; } }) }) };
  assert.equal(await L.zapiszOdpowiedzV2(zUpd, 42, ['Raz.', 'Dwa.', 'x'.repeat(500)]), true); assert.equal(upd.v, 42); assert.equal(upd.w.odpowiedz.length, 400); assert.match(upd.w.odpowiedz, /^Raz\. Dwa\./);
  assert.equal(await L.zapiszOdpowiedzV2(atrapa(t), 42, ['Raz.']), false, 'atrapa bez update → false, bez wyjątku');
  assert.equal(await L.zapiszOdpowiedzV2(zUpd, 'zly', ['Raz.']), false);
  const pt = czytaj('supabase/functions/okienko-v2/potok.mjs');
  assert.match(pt, /d\.zapiszLog = async \(a, w\) => \{ const r = await zapiszOryg\(a, w\); if \(Number\.isFinite\(Number\(r\)\) && typeof r === "number"\) ostatni\.id = r; return r; \};/);
  assert.match(pt, /const odp = \(status, body\) => \(\{ status, body: status === 200 && ostatni\.id && body && typeof body === "object" && !body\.log_id \? \{ \.\.\.body, log_id: ostatni\.id \} : body, slad \}\);/);
  const ef = czytaj('supabase/functions/okienko-v2/index.ts');
  assert.match(ef, /if \(w\.status === 200 && b && b\.log_id && Array\.isArray\(b\.zdania\) && b\.zdania\.length\) \{ try \{ await zapiszOdpowiedzV2\(adm, b\.log_id, b\.zdania\); \} catch/);   // blizna-136: best-effort
});

test('potok na atrapie z id: odpowiedź 200 ma log_id, 429/400 nie', async () => {
  const { przebieg } = require('./_lawka-v2.js');
  const w = await przebieg([{ p: 'co mam dzis', kat: 'wlasne', waga: 5, oczekiwane: 'router:moj_plan' }]);
  assert.equal(w.length, 1); assert.equal(w[0].pasuje, true);
});

test('UI (js/okienko.js): kciuki tylko dla v2 z log_id; 👍 → RPC i podziękowanie; 👎 → pole komentarza + Wyślij; v1 bez kciuków; CSS w zawodnik.html', () => {
  const src = czytaj('js/okienko.js');
  const ctx = { window: {}, document: { getElementById: () => null, addEventListener: () => {}, createElement: () => ({ style: {} }) }, localStorage: { getItem: () => null, setItem: () => {} }, navigator: {}, console, setTimeout, clearTimeout, Number, String, Array, Promise, JSON, Math, Object, Date, RegExp, Error, encodeURIComponent, decodeURIComponent, URL };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const O = ctx.window.OKIENKO || ctx.OKIENKO;
  assert.ok(O && typeof O.htmlOdpowiedzi === 'function', 'OKIENKO.htmlOdpowiedzi (jak blizna-65)');
  const v2 = O.htmlOdpowiedzi(200, { wersja: 'v2', log_id: 77, zdania: ['Oto plan.'], karty: [], akcja: null });
  assert.match(v2, /class="okn-kciuki" data-log="77"/); assert.match(v2, /data-ocena="1"[^>]*>👍/); assert.match(v2, /data-ocena="-1"[^>]*>👎/); assert.match(v2, /Pomogło\?/);
  assert.doesNotMatch(O.htmlOdpowiedzi(200, { wersja: 'v2', zdania: ['Oto.'], karty: [] }), /okn-kciuki/, 'v2 bez log_id (np. limit) → bez kciuków');
  assert.doesNotMatch(O.htmlOdpowiedzi(200, { zdania: ['Oto.'], karty: [] }), /okn-kciuki|okienko 2\.0/, 'v1 bez zmian');
  assert.doesNotMatch(O.htmlOdpowiedzi(200, { wersja: 'v2', log_id: '<img>', zdania: ['x'], karty: [] }), /okn-kciuki/, 'log_id musi być liczbą');
  assert.match(src, /\[data-ocena\],\[data-kciuk-wyslij\]/, 'delegacja kliknięć'); assert.match(src, /window\.sb\.rpc\('okienko_ocena', \{ p_id: Number\(id\), p_ocena: ocena, p_komentarz:/);
  assert.match(src, /placeholder="Co było nie tak\? \(opcjonalnie\)"/); assert.match(src, /maxlength="300"/);
  assert.match(czytaj('zawodnik.html'), /\.okn-kciuki\{display:flex/);
});
