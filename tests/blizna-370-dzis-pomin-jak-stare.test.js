// Blizna #370 (25.11.2026) — nowe Dziś: po „Pomiń” w „Jak poszło?” pytanie przechodziło na kolejny wpis.
//
// Stara karta (zawodnik.html, _frCheck) pyta bazę o JEDEN najnowszy wpis z zegarka bez odczucia z ostatnich 48 h
// (limit 1) i gdy ten wpis jest pominięty (klucz fr_skip_<id> w telefonie), po prostu wychodzi: nie szuka starszego.
// Nowe Dziś szło dalej po liście i po „Pomiń” od razu pytało o poprzedni trening. Kto wciska „Pomiń”, chce spokoju,
// nie następnego pytania. Decyzja Filipa 25.11: jak w starym, cisza.
// Zapis odczucia to co innego: wpis z odczuciem wypada z warunku także w starej karcie, więc wtedy starszy,
// nieoceniony wpis z okna 48 h może dostać pytanie (przy następnym wczytaniu). Tego nie zmieniamy.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const MODUL = czytaj('js/dzis-nowy.mjs');
const HTML = czytaj('zawodnik.html');
const TERAZ = new Date(2026, 10, 25, 12, 0, 0).getTime();
const wpis = (id, h, z) => Object.assign({ id, logged_at: new Date(TERAZ - h * 3600e3).toISOString(), training_type: 'Spokojny', distance_km: 10.01, feel: null, external_source: 'intervals', comment: 'Morning Run' }, z);

function modul(pominiete) {
  const pamiec = new Map(pominiete.map((id) => ['fr_skip_' + id, '1']));
  const w = { location: { search: '', hash: '', pathname: '/zawodnik.html' }, localStorage: { getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null), setItem: (k, v) => pamiec.set(k, v) } };
  vm.runInNewContext(MODUL, { window: w, document: { documentElement: { classList: { contains: () => false, add() {}, remove() {} } }, getElementById: () => null }, URLSearchParams, Date, Promise });
  return (wpisy) => { const k = w.BM_DZIS.kandydatOdczucia(wpisy, TERAZ); return k ? k.id : null; };
}

test('(1) pominięty najnowszy wpis z zegarka = cisza, także gdy w oknie 48 h czeka starszy; kształt wpisów jak na koncie z produkcji', () => {
  // konto z listy nowego Dziś, odczyt 25.11: sześć wpisów z zegarka, wszystkie bez odczucia i z komentarzem, dwa w oknie 48 h
  const WPISY = [wpis('w1', 23.8), wpis('w2', 47.5), wpis('w3', 76), wpis('w4', 151.9), wpis('w5', 166.4), wpis('w6', 174.4)];
  assert.equal(modul([])(WPISY), 'w1', 'bez pominięć pytamy o najnowszy');
  assert.equal(modul(['w1'])(WPISY), null, 'po „Pomiń” na najnowszym: cisza (przed poprawką pytanie wskakiwało na w2)');
  assert.equal(modul(['w2'])(WPISY), 'w1', 'pominięcie starszego nie wyłącza pytania o nowszy');
  assert.equal(modul(['w1', 'w2'])(WPISY), null);
});

test('(2) pominięcie dotyczy tylko wpisu, który stara karta by wybrała: ręczne, ocenione i stare wpisy przed nim nie liczą się', () => {
  const k = modul(['z']);
  assert.equal(k([wpis('r', 2, { external_source: 'app', feel: 'good' }), wpis('z', 20), wpis('s', 30)]), null, 'przed pominiętym stoi wpis ręczny: stara karta i tak wybrałaby „z”');
  assert.equal(k([wpis('o', 2, { feel: 'good' }), wpis('z', 20), wpis('s', 30)]), null, 'przed pominiętym stoi wpis już oceniony');
  assert.equal(modul(['stary'])([wpis('stary', 60), wpis('x', 70)]), null, 'poza oknem 48 h nie ma o co pytać');
  assert.equal(modul(['z'])([wpis('n', 5), wpis('z', 20)]), 'n', 'nowszy trening po pominiętym dostaje własne pytanie');
  // po ZAPISIE odczucia (nie po „Pomiń”) starszy nieoceniony wpis z okna może dostać pytanie, jak w starej karcie
  assert.equal(modul([])([wpis('n', 5, { feel: 'good' }), wpis('z', 20)]), 'z');
});

test('(3) to jest zachowanie starej karty: jedno zapytanie z limitem 1 i wyjście przy pominiętym', () => {
  assert.match(HTML, /\.order\('logged_at',\{ascending:false\}\)\.limit\(1\);\s*var l=q && q\.data && q\.data\[0\]; if\(!l\) return;\s*try\{ if\(localStorage\.getItem\('fr_skip_'\+l\.id\)\) return; \}catch\(e\)\{\}/,
    'stara _frCheck: najnowszy pasujący wpis, a przy fr_skip_ po prostu return');
  assert.match(MODUL, /return pominiety\(l\.id\) \? null : l;/);
  assert.doesNotMatch(MODUL, /if \(pominiety\(l\.id\)\) continue;/);
});
