// Blizna #389 (26.11.2026) — nowe Dziś, audyt A1: cel treningu miał najsłabszą typografię na ekranie.
//
// „8 km · 4:30 /km”, czyli to, co zawodnik ma dziś zrobić, stało zwykłym tekstem 15 px obok pigułki rodzaju, a licznik
// Ulicy pod spodem miał 40 px. Najważniejsza liczba dnia była najmniejsza. Decyzja Filipa 26.11:
//   - cel treningu fontem liczb 28–30 px (wybrane 28), pigułka rodzaju NAD nim;
//   - licznik Ulicy 30–32 px (wybrane 32);
//   - długi cel („16,4 km · 95 min · 5:37 /km”) łamie się tylko MIĘDZY członami, nigdy w środku członu;
//   - dwa treningi jednego dnia: każdy ma swoją pigułkę i swój cel.
// Łamanie zmierzone w przeglądarce; tu pilnowany jest kształt, z którego to łamanie wynika.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, MODUL } = require('./_dzis-nowy-strona.js');

const T = (o) => Object.assign({ id: 't', date: '2026-11-26', type: 'Interwały', distance_km: 8, duration_min: null, pace: '4:30', description: '', status: 'planned', plan_source: 'coach', coach_id: 'c-9' }, o);
const plany = (h) => [...h.matchAll(/<div class="dn-plan"><div class="dn-plan-g">(.*?)<\/div>(<span class="dn-cel">.*?<\/span><\/span>)?<\/div>/g)].map((m) => [m[1].replace(/<[^>]+>/g, '|').replace(/\|+/g, '|'), m[2] ? m[2].replace(/^<span class="dn-cel">|<\/span>$/g, '') : null]);

test('(1) pigułka rodzaju nad celem; cel fontem liczb 28 px; licznik Ulicy 32 px', () => {
  const B = strona().B, h = B.treningHtml([T({})], '');
  assert.match(h, /<div class="dn-plan"><div class="dn-plan-g"><span class="dn-typ">Interwały<\/span><\/div><span class="dn-cel"><span>8 km ·<\/span> <span>4:30 \/km<\/span><\/span><\/div>/, 'najpierw rząd z pigułką, pod nim cel');
  assert.ok(MODUL.includes('#dzis-nowy .dn-plan{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:0 0 8px}'), 'kolumna: pigułka nad celem');
  assert.ok(MODUL.includes("#dzis-nowy .dn-cel{color:#f5f3ef;font:400 28px/1.1 'Bebas Neue','DM Sans',sans-serif;letter-spacing:.02em}"), 'cel fontem liczb 28 px (ten sam krój co liczby w kaflach)');
  assert.ok(MODUL.includes("#dzis-nowy .dn-ul-km b{font:400 32px/1 'Bebas Neue','DM Sans',sans-serif;"), 'licznik Ulicy 32 px: mniejszy niż dotąd (40), większy od celu o jeden stopień');
  assert.doesNotMatch(MODUL, /\.dn-cel\{[^}]*15px|\.dn-ul-km b\{[^}]*40px/);
});

test('(2) długi cel łamie się tylko między członami: każdy człon to osobny niełamliwy kawałek, kropka zostaje przy członie przed nią', () => {
  const B = strona().B;
  assert.equal(B.celHtml(['16,4 km', '95 min', '5:37 /km']), '<span class="dn-cel"><span>16,4 km ·</span> <span>95 min ·</span> <span>5:37 /km</span></span>');
  assert.equal(B.celHtml(['8 km']), '<span class="dn-cel"><span>8 km</span></span>', 'jeden człon: bez kropki');
  assert.ok(MODUL.includes('#dzis-nowy .dn-cel span{display:inline-block;white-space:nowrap}'), 'człon nie pęka w środku („5:37” i „/km” zostają razem)');
  const h = B.treningHtml([T({ distance_km: 16.4, duration_min: 95, pace: '5:37' })], '');
  assert.deepEqual(plany(h), [['|Interwały|', '<span>16,4 km ·</span> <span>95 min ·</span> <span>5:37 /km</span>']]);
  assert.doesNotMatch(h, /· <\/span>|<span> ·|<span>·/, 'żaden wiersz nie zaczyna się od kropki');
  assert.equal(B.celHtml(['<b>x</b>', 'y']), '<span class="dn-cel"><span>&lt;b&gt;x&lt;/b&gt; ·</span> <span>y</span></span>', 'człony escapowane');
});

test('(3) dwa treningi jednego dnia: każdy ma swoją pigułkę i swój cel; „zrobione” stoi przy pigułce', () => {
  const B = strona().B;
  const h = B.treningHtml([T({ id: 'rano', type: 'Spokojny', distance_km: 6, pace: '5:40', status: 'done', description: 'Luźno.' }), T({ id: 'wieczor', type: 'Siła', distance_km: null, pace: null, duration_min: 30, description: 'Core.' })], '');
  assert.deepEqual(plany(h), [['|Spokojny|zrobione|', '<span>6 km ·</span> <span>5:40 /km</span>'], ['|Siła|', '<span>30 min</span>']]);
  assert.match(h, /<span class="dn-typ">Spokojny<\/span><span class="dn-zrobione">zrobione<\/span><\/div>/, '„zrobione” w rzędzie z pigułką, nie doklejone do dużej liczby');
  assert.ok(h.indexOf('Luźno.') < h.indexOf('<span class="dn-typ">Siła'), 'opis pierwszego treningu przed drugim treningiem');
  assert.match(MODUL, /#dzis-nowy \.dn-tekst \+ \.dn-plan,#dzis-nowy \.dn-plan \+ \.dn-plan,#dzis-nowy \.dn-tekst \+ \.dn-tytul\{margin-top:14px\}/, 'odstęp między dwoma treningami zostaje');
  // trening bez celu (sam rodzaj): pigułka bez pustego wiersza pod spodem
  assert.deepEqual(plany(B.treningHtml([T({ distance_km: null, pace: null })], '')), [['|Interwały|', null]]);
});

test('(4) na ekranie: kafel dnia z treningiem i przycisk „Zaloguj wynik” bez zmian poza typografią', async () => {
  const s = strona(); s.B.start(); await s.doKonca();
  const h = s.kafel('trening').innerHTML;
  assert.match(h, /<div class="dn-plan-g">.*?Interwały.*?<\/div><span class="dn-cel"><span>8 km ·<\/span> <span>4:30 \/km<\/span><\/span><\/div><p class="dn-tekst">Rozgrzewka 2 km, potem 4 × 1 km\.<\/p><button type="button" class="dn-glowny" data-dn="zaloguj">Zaloguj wynik<\/button>/);
});
