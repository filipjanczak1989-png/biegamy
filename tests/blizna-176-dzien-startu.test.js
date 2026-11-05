/* BLIZNA 176 / DZIEŃ STARTU BEZ RĘCZNYCH KROKÓW (Filip 5.11).
   - akcja_start na prawdziwej akcji sam włącza grę, koparkę i rowerzystę (gdy jest opis); próba niczego nie włącza, ponowny start nic nie psuje;
   - plakat w prywatnym kubełku, adres tylko z licznika po starcie i przy zgodzie, bez pliku w repo; na Dziś i na stronie akcji pod sceną, na końcu filmu;
   - zawodnik.html zamrożony do 8.11: wszystko przez js/akcja.mjs i sb.js.
   Po skutku: tools/akcja-start-test.sql. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
const MIG = 'supabase/migrations/20261106_akcja_start_przelaczniki.sql';
const jestMigracja = fs.existsSync(path.join(__dirname, '..', MIG));

test('migracja: start włącza tylko na prawdziwej akcji, w tej samej instrukcji co wystartowala_at; uprawnienia bez zmian', { skip: !jestMigracja && 'migracja jeszcze poza repo' }, () => {
  const m = czytaj(MIG);
  assert.match(m, /set wystartowala_at = v_t,[\s\S]{0,120}gra_aktywna = case when testowa then gra_aktywna else true end,\s+fabianek_postac_gra = case when testowa then fabianek_postac_gra else true end,\s+rowerzysta_wlaczony = case when not testowa and btrim\(coalesce\(rowerzysta_opis, ''\)\) <> '' then true else rowerzysta_wlaczony end/);
  assert.match(m, /if a\.wystartowala_at is not null then return public\.akcja_licznik\(p_slug\); end if;/, 'ponowny start wraca wcześniej');
  assert.doesNotMatch(m, /on function public\.akcja_start/, 'create or replace zachowuje uprawnienia');
  assert.doesNotMatch(m, /add column plakat_url/, 'kolumna istnieje od 2.11');
  assert.ok(m.indexOf("akcja_start na bazie zmienił się") < m.indexOf('CREATE OR REPLACE FUNCTION public.akcja_start'), 'strażnik przed podmianą');
});

test('plakat: nazwa pliku tylko w funkcji próby, żadnego pliku w repo; WebP, bo kubełek przyjmuje tylko WebP i MP4', () => {
  assert.match(czytaj('supabase/migrations/20261105_akcja_film.sql'), /allowed_mime_types = array\['image\/webp', 'video\/mp4'\]/);
  assert.match(czytaj('supabase/functions/_shared/proba-wizerunek.mjs'), /plakat_url: "plakat-akcji\.webp"/);
  for (const k of ['assets', 'assets/gra', 'assets/ulica', 'assets/akcja']) if (fs.existsSync(path.join(__dirname, '..', k))) assert.ok(!fs.readdirSync(path.join(__dirname, '..', k)).some((n) => /plakat-akcji/i.test(n)), k);
  for (const p of ['js/akcja.mjs', 'js/akcja-cytaty.mjs', 'sb.js', 'dla-fabianka.html']) assert.doesNotMatch(czytaj(p), /plakat-akcji\.webp/, p + ': adres tylko z licznika');
});

test('Dziś i strona akcji: scena, pod nią plakat z przyciskiem Zbiórka', () => {
  const a = czytaj('js/akcja.mjs');
  assert.match(a, /punktUlicy\(d\) \+ plakatHtml\(d, "akcja-plakat--dzis"\) \+ pasekHtml\(d\)/);
  assert.match(a, /z\.textContent = "Zbiórka";/);
  assert.match(a, /pokazPlakat\(el\.getAttribute\("data-plakat"\), el\.getAttribute\("data-zbiorka"\) \|\| ""\)/);
  const h = czytaj('dla-fabianka.html');
  assert.ok(h.indexOf('<div id="ulica-po"></div>') < h.indexOf('<div id="plakat"></div>'), 'plakat pod sceną');
});

test('film: plakat od chwili plakatu w pliku, dźwięk gra dalej, bez plakatu jak dotąd', () => {
  const c = czytaj('js/akcja-cytaty.mjs');
  assert.match(c, /plakat: pl, plakat_od: 10, zbiorka: zb/);
  assert.match(c, /d\.plakat_url = w\.plakat_url;/, 'próba: plakat z funkcji próby');
  const s = czytaj('sb.js');
  assert.match(s, /function koniecFilmu\(\) \{ if \(!film\.plakat\) return zakoncz\(\); pokazPlansze\(\); setTimeout\(zakoncz, 5000\); \}/);
  assert.match(s, /v\.addEventListener\('ended', koniecFilmu\);/);
  assert.match(s, /\(v\.currentTime \|\| 0\) >= film\.plakat_od\) pokazPlansze\(\);/);
  const a = czytaj('js/akcja.mjs');
  assert.match(a, /v\.addEventListener\("ended", function \(\) \{ if \(f\.plakat\) pokazPlansze\(\); else zamknij\(\); \}\);/);
});

test('premiera: duży guzik zaraz po zapisie, droga na Dziś tylko na prawdziwej akcji', () => {
  const st = czytaj('start-akcji.html');
  assert.match(st, /#zagraj-szef \{ display: block; width: min\(86vw, 380px\); min-height: 76px;/);
  assert.match(st, /if \(potwierdzone\) \{ przyciskDotarcia\(d\); przyciskPremiery\(d\);/);
  assert.match(czytaj('js/cegielki-konto.js'), /\$\("pr-dzis"\)\.hidden = premieraNaProbie\(\);/);
  assert.match(czytaj('gra-cegielki.html'), /id="pr-dzis" href="zawodnik\.html" hidden>Przejdź na Dziś</);
});
