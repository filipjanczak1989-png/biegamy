/* BLIZNA 130 (3.11.2026, przepięcie Okienka dla wszystkich): dla użytkownika to po prostu Okienko — w interfejsie, odpowiedziach, chipach
   i tytułach nie ma „2.0”, „v2”, „nowe okienko”, „beta”. Przełącznik w bazie bez deployu (okienko_ustawienia.v2_dla_wszystkich), powrót jednym
   UPDATE; SQL w docs/okienko-przepiecie-2026-11-03.md. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const bezKomentarzy = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1').replace(/<!--[\s\S]*?-->/g, '');
const ZAKAZANE = /okienk\w* 2\.0|okienk\w* v2|nowe okienko|nowym okienku|okienko 2|\bbeta\b|wersja v2|wersji 2\.0/i;

/** wszystkie literały tekstowe (stringi i szablony) z kodu bez komentarzy — to, co może zobaczyć człowiek */
function literaly(src) { return [...bezKomentarzy(src).matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]); }

test('teksty widoczne dla ludzi: brak „2.0”, „v2”, „nowe okienko”, „beta” (UI Okienka, EF obu wersji, „o nas”)', () => {
  const pliki = ['js/okienko.js', 'supabase/functions/_shared/o-nas.mjs', 'supabase/functions/okienko/router.mjs', 'supabase/functions/okienko/odpowiedz.mjs', 'supabase/functions/okienko/osoba.mjs',
    'supabase/functions/okienko/impreza.mjs', 'supabase/functions/okienko/katalog.mjs', 'supabase/functions/okienko/straznik.mjs', 'supabase/functions/okienko/siec.mjs',
    ...fs.readdirSync(path.join(KORZEN, 'supabase/functions/okienko-v2')).filter((f) => /\.(mjs|ts)$/.test(f)).map((f) => 'supabase/functions/okienko-v2/' + f)];
  for (const p of pliki) {
    const zle = literaly(czytaj(p)).filter((l) => ZAKAZANE.test(l) && !/^https?:|googleapis|\/v1beta\//.test(l));
    assert.deepEqual(zle, [], p + ': napis wersji widoczny dla użytkownika');
  }
  const zaw = bezKomentarzy(czytaj('zawodnik.html'));
  const okienkoHtml = zaw.slice(zaw.indexOf('id="okienko-arkusz"') - 200, zaw.indexOf('id="okienko-zamknij"') + 200);
  assert.ok(okienkoHtml.length > 400, 'znaleziony blok arkusza Okienka'); assert.doesNotMatch(okienkoHtml, ZAKAZANE);
  assert.doesNotMatch(zaw.slice(zaw.indexOf('id="okienko-pole"') - 50, zaw.indexOf('id="okienko-pole"') + 600), ZAKAZANE, 'pole „Zapytaj” na Dziś');
});

test('render odpowiedzi v2: bez etykiety wersji; kciuki zostają tylko z log_id; v1 bez zmian', () => {
  const ctx = zaladujSb();
  ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  vm.runInContext(czytaj('js/okienko.js'), ctx, { filename: 'js/okienko.js' });
  const O = ctx.OKIENKO;
  const v2 = O.htmlOdpowiedzi(200, { wersja: 'v2', log_id: 5, zdania: ['Oto plan.'], karty: [] });
  assert.doesNotMatch(v2, ZAKAZANE); assert.doesNotMatch(v2, /okn-wersja/); assert.match(v2, /okn-kciuki/);
  assert.equal(O.htmlOdpowiedzi(200, { wersja: 'v2', zdania: ['Oto.'], karty: [] }), O.htmlOdpowiedzi(200, { zdania: ['Oto.'], karty: [] }), 'bez log_id v2 wygląda jak v1');
});

test('przełącznik w bazie: v2_dla_wszystkich w RPC okienko_wersja (bez deployu), docs z SQL włączenia i powrotu, test po skutku obu przełączników', () => {
  const m = czytaj('supabase/migrations/20261105_okienko_v2_przelacznik.sql');
  assert.match(m, /when coalesce\(\(select u\.wartosc from public\.okienko_ustawienia u where u\.klucz = 'v2_wlaczone'\), 'false'\) <> 'true' then 'v1'/);
  assert.match(m, /when coalesce\(\(select u\.wartosc from public\.okienko_ustawienia u where u\.klucz = 'v2_dla_wszystkich'\), 'false'\) = 'true' then 'v2'/);
  const d = czytaj('docs/okienko-przepiecie-2026-11-03.md');
  assert.match(d, /update public\.okienko_ustawienia set wartosc = 'true', zmieniono = now\(\) where klucz = 'v2_dla_wszystkich';/);
  assert.match(d, /update public\.okienko_ustawienia set wartosc = 'false', zmieniono = now\(\) where klucz = 'v2_dla_wszystkich';/);
  assert.match(d, /update public\.okienko_ustawienia set wartosc = 'false', zmieniono = now\(\) where klucz = 'v2_wlaczone';/);
  const t = czytaj('tools/okienko-v2-test.sql'); assert.match(t, /FAIL 3a: v2_dla_wszystkich nie działa/); assert.match(t, /FAIL 3b: v2_wlaczone=false/);
  assert.match(czytaj('js/okienko.js'), /r\.headers\.get\('x-okienko-wersja'\) === 'v1'\) _wersja = 'v1'/, 'awaria nowej wersji przełącza sesję na stare okienko');
});
