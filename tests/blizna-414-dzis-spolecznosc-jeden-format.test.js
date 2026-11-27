// Blizna #414 (27.11.2026) — nowe Dziś, kafel „Społeczność”, paczka S1 (decyzje Filipa 27.11):
//   1. bez podpisu „profile publiczne” pod etykietą;
//   2. kilometry jednym formatem w całym kaflu: w wierszach biegów zawsze jedno miejsce po przecinku, także zero (4,0 · 10,2),
//      suma w podsumowaniu bez miejsc po przecinku (36 km). Wcześniej: wiersze 2 miejsca poniżej 10 km z obcinaniem zer („4”, „6,35”),
//      suma 1 miejsce poniżej 10 km („7,3”). Inne kafle zostają bez zmian (km() i liczba() bez nowego parametru), lista w raporcie S1;
//   3. bez ikonki rodzaju przed imieniem (rysunek z pigułki rodzaju na telefonie wyglądał jak buźka); rodzaj zostaje słowem.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, czytaj, MODUL } = require('./_dzis-nowy-strona.js');

const U = (n) => '0000000' + n + '-1111-4222-8333-44444444444' + n;
const T0 = Date.UTC(2026, 10, 27, 17, 0, 0), TEMU = (min) => new Date(T0 - min * 60000).toISOString();
/** Dane jak z prawdziwej doby (te same co SPOL=s1 w narzędziu pomiaru do zrzutu 390): 6 osób, dwa biegi, odznaka. */
const DOBA = { osob: 6, km: 36.4, od_polnocy: true, miasta: ['Poznań', 'Gniezno', 'Września'],
  biegi: [{ id: U(1), imie: 'Kasia', miasto: 'Poznań', rodzaj: 'Wybieganie', km: 4, kiedy: TEMU(95) },
          { id: U(2), imie: 'Piotr', miasto: 'Gniezno', rodzaj: 'Interwały', km: 10.24, kiedy: TEMU(240) }],
  odznaka: { id: U(3), imie: 'Ola', odznaka: 'pierwszy_krok', kiedy: TEMU(180) } };
const BADGES = (() => { const m = /\{id:'pierwszy_krok',\s*name:'([^']+)'/.exec(czytaj('zawodnik.html')); return [{ id: 'pierwszy_krok', name: m[1] }]; })();
const kafelka = (d) => { const s = strona(); s.w.BADGES = BADGES; return s.B.spolHtml(d, T0); };
const wiersz = (km) => kafelka({ osob: 1, km: 1, miasta: [], biegi: [{ id: U(1), imie: 'Kasia', miasto: null, rodzaj: 'Spokojny', km, kiedy: TEMU(10) }] });
const suma = (km) => kafelka({ osob: 2, km, miasta: [], biegi: [], od_polnocy: true });

test('(1) bez podpisu „profile publiczne”: pod etykietą nic, „Wszystko ›” zostaje', () => {
  const h = kafelka(DOBA);
  assert.ok(h.startsWith('<div class="dn-gora"><div><h2 class="dn-etykieta">Społeczność</h2></div><button type="button" class="dn-link" data-sekcja="social">Wszystko ›</button></div>'));
  assert.doesNotMatch(h, /dn-kto|profile publiczne/);
  assert.doesNotMatch(MODUL.replace(/\/\*[\s\S]*?\*\//g, ''), /<div class="dn-kto">profile publiczne/);
});

test('(2a) wiersze biegów: zawsze jedno miejsce po przecinku, także zero; tysiące ze spacją; brak albo 0 = bez kilometrów', () => {
  for (const [x, t] of [[4, '4,0'], [10.24, '10,2'], [0.96, '1,0'], [9.99, '10,0'], [21.1, '21,1'], [42.195, '42,2'], [1234.56, '1 234,6'], ['5.5', '5,5']])
    assert.match(wiersz(x), new RegExp('<b>Kasia</b> · spokojny ' + t + ' km<small>'), x + ' → ' + t);
  for (const x of [0, null, undefined, -3, 'abc', NaN]) assert.match(wiersz(x), /<b>Kasia<\/b> · spokojny<small>/, 'bez km dla ' + String(x));
});

test('(2b) suma w podsumowaniu: bez miejsc po przecinku', () => {
  for (const [x, t] of [[36.4, '36'], [7.25, '7'], [41.2, '41'], [9.5, '10'], [1234.6, '1 235'], [3, '3']])
    assert.match(suma(x), new RegExp('<b>2 osoby biegały dziś</b>, razem ' + t + ' km</span>'), x + ' → ' + t);
});

test('(2c) jeden format w całym kaflu: każda liczba przed „km” w wierszu biegu ma jedno miejsce po przecinku, suma żadnego', () => {
  const h = kafelka(DOBA), wiersze = [...h.matchAll(/data-dn="sp-profil"[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]);
  const wBiegach = wiersze.flatMap((w) => [...w.matchAll(/ ([0-9][0-9 ]*(?:,[0-9]+)?) km/g)].map((m) => m[1]));
  assert.deepEqual(wBiegach, ['4,0', '10,2']);
  for (const x of wBiegach) assert.match(x, /^[0-9]{1,3}( [0-9]{3})*,[0-9]$/);
  assert.match(h, /, razem 36 km</);
  assert.equal((MODUL.match(/liczba\([^)]*, true\)/g) || []).length, 1, 'stałe zero po przecinku tylko w kmSpol');
  assert.ok(MODUL.includes('function km(x) { var n = Number(x); return isFinite(n) && n > 0 ? liczba(n, n < 10 ? 2 : 1) : "—"; }'), 'km() innych kafli bez zmian (bez decyzji Filipa)');
});

test('(3) bez ikonki rodzaju: wiersz biegu zaczyna się od imienia, rodzaj słowem; medal odznaki zostaje', () => {
  const s = strona(); let wolania = 0; s.w.renderTypePill = () => { wolania++; return '<span class="tp"><svg width="12" height="12"><circle r="5"/></svg>Wybieganie</span>'; }; s.w.BADGES = BADGES;
  const h = s.B.spolHtml(DOBA, T0);
  assert.equal(wolania, 0, 'kafel nie pyta o pigułkę rodzaju');
  for (const m of h.matchAll(/<span class="dn-sp-t">([\s\S]*?)<\/span>/g)) assert.match(m[1], /^<b>/, 'treść wiersza zaczyna się od pogrubionego tekstu: ' + m[1].slice(0, 40));
  assert.equal((h.match(/<svg/g) || []).length, 1, 'jeden rysunek: medal');
  assert.match(h, /<span class="dn-sp-av dn-sp-medal" aria-hidden="true"><svg class="dn-svg"/);
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(kod, /ikonaRodzaju|\.dn-sp-t svg\{/, 'pomocnik i jego CSS usunięte (nie miały innych użytkowników)');
});

test('(4) dane jak z prawdziwej doby (6 osób, dwa biegi, odznaka): cały kafel', () => {
  const h = kafelka(DOBA);
  assert.match(h, /<li><div class="dn-sp-w"><span class="dn-sp-av dn-sp-licz" aria-hidden="true">6<\/span><span class="dn-sp-t"><b>6 osób biegało dziś<\/b>, razem 36 km<small>Poznań, Gniezno, Września<\/small><\/span><\/div><\/li>/);
  assert.match(h, /<li><button type="button" class="dn-sp-w" data-dn="sp-profil" data-id="00000001-[^"]+"><span class="dn-sp-av" style="background:#[0-9a-f]{6}" aria-hidden="true">K<\/span><span class="dn-sp-t"><b>Kasia<\/b> · wybieganie 4,0 km<small>Poznań · 1 h temu<\/small><\/span><\/button><\/li>/);
  assert.match(h, /<span class="dn-sp-t"><b>Piotr<\/b> · interwały 10,2 km<small>Gniezno · 4 h temu<\/small><\/span>/);
  assert.match(h, /<span class="dn-sp-t"><b>Ola<\/b> · odznaka „Pierwszy krok”<small>3 h temu<\/small><\/span>/);
  assert.equal((h.match(/<li>/g) || []).length, 4, 'podsumowanie, dwa biegi, odznaka');
});
