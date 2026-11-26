// Blizna #382 (26.11.2026) — nowe Dziś, audyt A2: linia pod „Trening na dziś” łamała się w pół zdania.
//
// Źródło planu i pogoda stały w jednej linii obok linku „Plan ›”: „od trenera · dziś 3–8 °C, częściowe / zachmurzenie”.
// Przy 360 i 390 px opis pogody pękał między słowami. Teraz pogoda ma własny wiersz pod nagłówkiem kafla, na całą
// jego szerokość. Brzmienie bez zmian (pilnuje go blizna-368), zmienia się miejsce.
// Decyzja Filipa 26.11: gdy mimo to brakuje miejsca, łamanie PO PRZECINKU (temperatura w pierwszym wierszu, opis
// w drugim), bez wielokropka. Dlatego temperatura i opis to dwa osobne kawałki, które przenoszą się w całości.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, MODUL } = require('./_dzis-nowy-strona.js');

const TRENER = [{ type: 'Tempo', coach_id: 'c', distance_km: 8 }];

test('(1) dwa wiersze: źródło planu w nagłówku kafla, pogoda pod nim w osobnym, pełnej szerokości', () => {
  const B = strona().B, h = B.treningHtml(TRENER, 'dziś 3–8 °C, częściowe zachmurzenie');
  assert.match(h, /^<div class="dn-gora"><div><h2 class="dn-etykieta">Trening na dziś<\/h2><div class="dn-kto">od trenera<\/div><\/div><a class="dn-link" href="[^"]*">Plan ›<\/a><\/div><p class="dn-pog"><span>dziś 3–8 °C,<\/span> <span>częściowe zachmurzenie<\/span><\/p>/,
    'pogoda stoi PO zamknięciu nagłówka z linkiem „Plan ›”, więc ma całą szerokość kafla');
  assert.doesNotMatch(h, /od trenera · dziś|<div class="dn-kto">[^<]*°C/, 'pogody nie ma już w linii ze źródłem planu');
  assert.match(B.treningHtml([{ type: 'Tempo', plan_source: 'generator' }], 'dziś 5 °C'), /<div class="dn-kto">z generatora<\/div>.*?<p class="dn-pog"><span>dziś 5 °C<\/span><\/p>/, 'sama temperatura: jeden kawałek');
  assert.match(B.treningHtml([], 'dziś od −6 do 2 °C, śnieg'), /<div class="dn-kto">bez planu<\/div>.*?<\/div><p class="dn-pog"><span>dziś od −6 do 2 °C,<\/span> <span>śnieg<\/span><\/p><h3 class="dn-tytul">Dziś bez planu<\/h3>/);
});

test('(2) bez pogody nie ma pustego wiersza; bez źródła planu zostaje sama pogoda', () => {
  const B = strona().B;
  assert.doesNotMatch(B.treningHtml(TRENER, ''), /dn-pog/); assert.doesNotMatch(B.treningHtml(TRENER), /dn-pog/); assert.doesNotMatch(B.treningHtml([], null), /dn-pog/);
  const wlasny = B.treningHtml([{ type: 'Tempo' }], 'dziś 5 °C, deszcz');
  assert.doesNotMatch(wlasny, /dn-kto/); assert.match(wlasny, /<\/div><p class="dn-pog"><span>dziś 5 °C,<\/span> <span>deszcz<\/span><\/p>/);
});

test('(3) łamanie tylko po przecinku, bez wielokropka: temperatura nie pęka, opis przenosi się w całości; tekst escapowany', () => {
  assert.ok(MODUL.includes("#dzis-nowy .dn-pog span{display:inline-block}#dzis-nowy .dn-pog span:first-child{white-space:nowrap}"), 'kawałki przenoszą się w całości; temperatura nigdy się nie łamie');
  assert.doesNotMatch(MODUL, /\.dn-pog[^}]*text-overflow|\.dn-pog[^}]*ellipsis/, 'bez obcinania wielokropkiem');
  const B = strona().B;
  assert.match(B.treningHtml(TRENER, 'dziś 3 °C, mgła, miejscami marznąca'), /<span>dziś 3 °C,<\/span> <span>mgła, miejscami marznąca<\/span>/, 'dzielimy na pierwszym przecinku: reszta opisu zostaje razem');
  assert.match(B.treningHtml(TRENER, 'dziś 3 °C, <b>x</b>'), /<span>dziś 3 °C,<\/span> <span>&lt;b&gt;x&lt;\/b&gt;<\/span>/);
});

test('(4) na ekranie: pogoda dochodzi ze starego kafla później i trafia do własnego wiersza; odświeżenie pogody zmienia tylko ten wiersz', async () => {
  const s = strona(); s.B.start(); await s.doKonca();
  assert.doesNotMatch(s.kafel('trening').innerHTML, /dn-pog/, 'bez danych pogody wiersza nie ma');
  const dzis = (() => { const t = new Date(s.st.zegar); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); })();
  s.w._weatherCache = { city: 'Poznań', days: [{ date: dzis, temp_min: 3, temp_max: 8, label: 'Częściowe zachmurzenie' }] };
  s.B.wczytaj(true); await s.doKonca();
  assert.match(s.kafel('trening').innerHTML, /<div class="dn-kto">od trenera<\/div>.*?<p class="dn-pog"><span>dziś 3–8 °C,<\/span> <span>częściowe zachmurzenie<\/span><\/p>/);
});
