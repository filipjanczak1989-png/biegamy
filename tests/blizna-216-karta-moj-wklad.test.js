/* BLIZNA 216 (11.11.2026, noc bez nadzoru, część 4) — karta „Mój wkład”: obraz do udostępnienia rysowany w przeglądarce (js/akcja-wklad-karta.mjs).
   Pilnuje:
   - prywatność: tylko dane klikającego (imię = pierwsze słowo, bez nazwiska), bez kwot, bez innych osób, bez znaku organizacji; nic nie idzie na serwer;
   - formaty 1080×1350 i 1080×1920; grafika z assets/ulica (pliki istnieją w repo); nazwa ulicy z licznika (imię z bazy, nie z kodu);
   - moduł bez import/export (globalThis.BM_WKLAD_KARTA), dociągany przez akcja.mjs dopiero po dotknięciu; jedyny odczyt to istniejące RPC akcja_moje_dni;
   - Web Share z plikiem i zapas: pobranie PNG; tekstWSzer skraca z wielokropkiem tylko gdy pełny tekst się nie mieści. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

function kontekst() {
  const miary = { fillText: [], images: [] };
  const ctx = {
    font: '', fillStyle: '', textAlign: '', textBaseline: '',
    fillRect() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: (t) => ({ width: String(t).length * (Number((/(\d+)px/.exec(ctx.font) || [])[1]) || 16) * 0.55 }),
    fillText: (t, x, y) => miary.fillText.push([String(t), x, y]),
    drawImage: (im, x, y, w, h) => miary.images.push([im.nazwa, Math.round(x), Math.round(y), Math.round(w), Math.round(h)]),
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,AAAA', toBlob: (cb) => cb({ size: 3 }) };
  const g = {
    document: { createElement: (t) => (t === 'canvas' ? canvas : { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelectorAll: () => [], remove() {} }), getElementById: () => null, head: { appendChild() {} }, body: { appendChild() {} }, fonts: null },
    Image: function () { const im = this; im.naturalWidth = 0; setTimeout(() => { im.naturalWidth = 100; im.naturalHeight = 100; im.nazwa = im.src; im.onload && im.onload(); }, 0); },
    setTimeout, Promise, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, navigator: {},
    BM_AKCJA: { dopelniacz: (i) => (i === 'Imię' ? 'Imienia' : i) },
  };
  g.globalThis = g; g.window = g;
  vm.createContext(g);
  vm.runInContext(czytaj('js/akcja-wklad-karta.mjs'), g, { filename: 'akcja-wklad-karta.mjs' });
  return { g, K: g.BM_WKLAD_KARTA, miary, canvas };
}

test('obraz: dwa formaty, nazwa ulicy z licznika, imię bez nazwiska, pasek całej ulicy nad sceną, bez kwot', () => {
  const { K, miary, canvas } = kontekst();
  const dane = { imie: K.imieZ('anna kowalska-nowak'), km: 12.7, dni: 7, ulica: K.daneUlicy({ imie: 'Imię', suma_km: 912.4, cel_km: 12500, pct: 7.3 }), adres: 'biegamy.run/dla-fabianka.html' };
  assert.equal(dane.imie, 'Anna', 'tylko pierwsze słowo, wielką literą');
  assert.equal(dane.ulica.ulica, 'Ulica Imienia'); assert.equal(dane.ulica.pct, 7.3);
  K.obraz(dane, 'pion', {});
  assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1350);
  const teksty = miary.fillText.map((t) => t[0]);
  assert.ok(teksty.includes('BIEGAMY · ULICA IMIENIA')); assert.ok(teksty.includes('MÓJ WKŁAD')); assert.ok(teksty.includes('Anna')); assert.ok(teksty.includes('12,7'));
  assert.ok(teksty.includes('7 dni z biegiem albo spacerem')); assert.ok(teksty.includes('cała ulica: 912 z 12 500 km · 7,3 %')); assert.ok(teksty.includes('biegamy.run/dla-fabianka.html'));
  assert.ok(!teksty.some((t) => /zł|kowalska|organizacj/i.test(t)), 'bez kwot, nazwiska i organizacji');
  const podpisPaska = miary.fillText.find((t) => /^cała ulica/.test(t[0]));
  assert.ok(podpisPaska[2] < 1350 - 320 - 100, 'podpis paska nad sceną (scena od 930 px w pionie): ' + podpisPaska[2]);
  miary.fillText.length = 0;
  K.obraz({ ...dane, dni: null }, 'story', {});
  assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1920);
  assert.ok(!miary.fillText.some((t) => /dni z biegiem/.test(t[0])), 'bez liczby dni, gdy RPC nic nie dało');
  assert.ok(miary.fillText.some((t) => t[0] === 'Ja') === false && miary.fillText.some((t) => t[0] === 'Anna'));
  miary.fillText.length = 0;
  K.obraz({ imie: '', km: 0.5, dni: null, ulica: K.daneUlicy(null), adres: '' }, 'pion', {});
  assert.ok(miary.fillText.some((t) => t[0] === 'Ja'), 'bez imienia w migawce: „Ja”');
  assert.ok(miary.fillText.some((t) => t[0] === 'BIEGAMY · ULICA AKCJI'));
});

test('grafika z assets/ulica: pliki istnieją; tekstWSzer skraca tylko, gdy pełny tekst się nie mieści', () => {
  const { K } = kontekst();
  for (const g of K.GRAFIKI) assert.ok(fs.existsSync(path.join(KORZEN, g)), g);
  const napisy = []; const c = { font: '', measureText: (t) => ({ width: String(t).length * 10 }), fillText: (t) => napisy.push(t) };
  K.tekstWSzer(c, 'Krótki', 0, 0, 200, 'X', 20); assert.equal(napisy.pop(), 'Krótki');
  K.tekstWSzer(c, 'Bardzo długi tekst, którego nie da się zmieścić', 0, 0, 100, 'X', 20); assert.match(napisy.pop(), /…$/);
});

test('zaczep i prywatność: imię z migawki Dziś (pierwsze słowo), dni z istniejącego akcja_moje_dni, nic na serwer, Web Share z zapasem', async () => {
  const { g, K } = kontekst();
  g.DzisOffline = { _userIdCache: 'u1', odczytaj: (id) => (id === 'u1' ? { czesci: { zawodnik: { full_name: 'Jan Przykładowy' } } } : null) };
  assert.equal(K.imieZMigawki(), 'Jan');
  g.DzisOffline = null; assert.equal(K.imieZMigawki(), '');
  const kod = czytaj('js/akcja-wklad-karta.mjs');
  assert.doesNotMatch(kod, /^\s*(import|export)\b/m, 'bez import/export: zwykły skrypt dociągany po dotknięciu');
  assert.doesNotMatch(kod, /fetch\(|sendBeacon|\.insert\(|\.update\(|\.from\(/, 'nic nie idzie na serwer, żadnych tabel');
  assert.deepEqual([...kod.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]), ['akcja_moje_dni'], 'jedyny odczyt: istniejące RPC dni (to samo, co woła zawodnik.html)');
  assert.match(kod, /navigator\.canShare\(\{ files: \[plik\] \}\)/); assert.match(kod, /a\.download = nazwa/, 'zapas: pobranie PNG');
  assert.match(kod, /Nic nie idzie na serwer/, 'informacja dla osoby w nakładce');
  assert.doesNotMatch(kod.replace(/dla-fabianka(\.html)?/g, ''), /fabian/i, 'imię dziecka nie w kodzie');
  const a = czytaj('js/akcja.mjs');
  assert.match(a, /closest\("\[data-moj-wklad\]"\)/); assert.match(a, /el\.src = "js\/akcja-wklad-karta\.mjs"; el\.async = true; el\.onload = pokaz;/);
  assert.match(a, /BM_WKLAD_KARTA\.zKafla\(d, wklad, adresStrony\(d\)\)/, 'zaczep przekazuje tylko licznik, wkład i adres');
  assert.match(a, /data-moj-wklad>Pokaż mój wkład<\/button>' : ""\)/, 'przycisk tylko przy wkładzie > 0');
  assert.doesNotMatch(czytaj('zawodnik.html'), /akcja-wklad-karta|data-moj-wklad/, 'zamrożony zawodnik.html bez zmian');
  assert.doesNotMatch(czytaj('sw.js'), /akcja-wklad-karta/, 'sw.js bez zmian (moduł nie w precache; cache w locie jak inne js/)');
});
