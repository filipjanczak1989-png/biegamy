// Blizna #48 (08.10.2026) — dokument sprzed deployu wznowiony z tła: jedno przeładowanie w chwili powrotu.
//
// Smoke Filipa po a3e546c: przez cały dzień „wejścia" były wznowieniami dokumentu z nocy — stary kod żył,
// a pasek „Nowa wersja" się nie pokazał (reg.update() co 60 s tylko przy widocznej stronie). Rozszerzenie
// paska (sb.js bmPowrotSprawdzWersje): przy powrocie, gdy jest nowszy SW i dokument żyje > 30 min, przy
// sieci i bez niezapisanej treści w polach → location.reload(). W innym razie odświeżenie danych.
// Smoke: tools/smoke-offline.js SMOKE_SW=1, scenariusze H1–H3.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '');
const SB = czytaj('sb.js');

function zaladuj(stan) {
  const i = SB.indexOf('  window._bmStartDokumentu = Date.now();');
  const j = SB.indexOf('  window.bmRejestrujSW = function () {');
  assert.ok(i > 0 && j > i, 'blok powrotu w sb.js przed bmRejestrujSW');
  const okno = { location: { reload: () => { stan.przeladowan++; } }, bmPasekNowejWersji: () => { stan.paskow++; } };
  const reg = { waiting: stan.waiting || null, installing: null,
    update: async () => { stan.update++; if (stan.updateRzuca) throw new Error('offline'); if (stan.poUpdate) reg.installing = {}; } };
  const nav = { onLine: stan.onLine !== false, serviceWorker: { getRegistration: async () => (stan.bezRejestracji ? undefined : reg), controller: stan.kontroler === undefined ? {} : stan.kontroler } };
  const doc = { querySelectorAll: () => stan.pola || [] };
  new Function('window', 'navigator', 'document', 'setTimeout', 'clearTimeout', 'MessageChannel', SB.slice(i, j))(okno, nav, doc, setTimeout, clearTimeout, undefined);
  okno._bmStartDokumentu = Date.now() - (stan.wiekMin == null ? 31 : stan.wiekMin) * 60000;
  okno._bmNowaWersja = !!stan.pasekZglosil;
  okno._bmWersjaStartu = stan.wersjaStartu || null;
  if (stan.wersjaTeraz !== undefined) okno.bmWersjaSW = async () => stan.wersjaTeraz;
  return okno;
}
const nowy = (o) => Object.assign({ przeladowan: 0, paskow: 0, update: 0 }, o);

test('nowszy SW (installing po update / waiting / pasek / inna CACHE_VERSION) + dokument > 30 min → jedno przeładowanie', async () => {
  for (const [opis, o] of [
    ['update znalazł installing', { poUpdate: true }],
    ['waiting', { waiting: {} }],
    ['pasek już zgłosił (updatefound → installed)', { pasekZglosil: true }],
    ['kontroler ma inną CACHE_VERSION niż przy starcie', { wersjaStartu: 'biegamy-A', wersjaTeraz: 'biegamy-B' }],
  ]) {
    const st = nowy(o); const w = zaladuj(st);
    assert.equal(await w.bmPowrotSprawdzWersje(), true, opis);
    assert.equal(st.przeladowan, 1, opis + ': dokładnie jedno przeładowanie');
    assert.equal(await w.bmPowrotSprawdzWersje(), true, opis + ': drugie wywołanie nie przeładowuje ponownie');
    assert.equal(st.przeladowan, 1);
  }
});

test('bez przeładowania: dokument < 30 min, offline, brak nowszej wersji, ta sama CACHE_VERSION, brak rejestracji', async () => {
  for (const [opis, o] of [
    ['dokument 29 min', { wiekMin: 29, poUpdate: true }],
    ['offline', { onLine: false, poUpdate: true }],
    ['nic nowego', {}],
    ['ta sama CACHE_VERSION', { wersjaStartu: 'biegamy-A', wersjaTeraz: 'biegamy-A' }],
    ['update rzuca (sieć padła w trakcie)', { updateRzuca: true }],
    ['brak rejestracji SW', { bezRejestracji: true, poUpdate: true }],
  ]) {
    const st = nowy(o); const w = zaladuj(st);
    assert.equal(await w.bmPowrotSprawdzWersje(), false, opis);
    assert.equal(st.przeladowan, 0, opis);
  }
  const st = nowy({ wiekMin: 5, poUpdate: true }); await zaladuj(st).bmPowrotSprawdzWersje();
  assert.equal(st.update, 0, 'młody dokument — nawet nie pyta o aktualizację');
});

test('niezapisana treść w widocznym polu → BEZ przeładowania, zamiast tego pasek „Nowa wersja"', async () => {
  const pole = (v, d, widoczne) => ({ value: v, defaultValue: d, getClientRects: () => (widoczne ? [1] : []) });
  let st = nowy({ poUpdate: true, pola: [pole('12,4 km', '', true)] });
  assert.equal(await zaladuj(st).bmPowrotSprawdzWersje(), false);
  assert.equal(st.przeladowan, 0); assert.equal(st.paskow, 1);
  st = nowy({ poUpdate: true, pola: [pole('12,4 km', '', false), pole('x', 'x', true)] });
  assert.equal(await zaladuj(st).bmPowrotSprawdzWersje(), true, 'ukryte pole i pole bez zmian nie blokują');
});

test('sb.js: sygnał z paska, wersja startowa z kontrolera, ogólna obsługa powrotu tylko na stronach bez własnej', () => {
  assert.match(SB, /window\._bmNowaWersja = true;\s+\/\/ sygnał dla bmPowrotSprawdzWersje[^\n]*\n\s+window\.bmPasekNowejWersji\(\);/);
  assert.match(SB, /if \(kontroler\) window\.bmWersjaSW\(kontroler\)\.then\(function \(v\) \{ if \(!window\._bmWersjaStartu\) window\._bmWersjaStartu = v; \}\);/);
  assert.match(SB, /if \(document\.visibilityState === 'visible' && !window\.bmPowrotWlasny\) window\.bmPowrotSprawdzWersje\(\);/);
  assert.match(SB, /window\.BM_POWROT_PRZELADUJ_PO_MS = 30 \* 60 \* 1000;/);
  const sw = czytaj('sw.js');
  assert.match(sw, /if \(event\.data && event\.data\.type === 'BM_WERSJA' && event\.ports && event\.ports\[0\]\) \{\n\s+event\.ports\[0\]\.postMessage\(CACHE_VERSION\);/);
});

test('zawodnik.html i kalendarz.html: sprawdzenie wersji PIERWSZE (przed regułą 10 min), wewnątrz blokady; bmPowrotWlasny ustawione', () => {
  for (const [plik, fn, blokada] of [['zawodnik.html', 'async function _dzisPoPowrocie(powod) {', '_dzisOdswiezanie'], ['kalendarz.html', 'async function _calPoPowrocie(powod) {', '_calOdswiezanie']]) {
    const z = czytaj(plik);
    const f = z.slice(z.indexOf(fn), z.indexOf('\n}\n', z.indexOf(fn)));
    const iBlok = f.indexOf('window.' + blokada + ' = true;'), iWer = f.indexOf('await window.bmPowrotSprawdzWersje()'), iSw = f.indexOf("return 'swieze'");
    assert.ok(iBlok > 0 && iWer > iBlok && iSw > iWer, plik + ': blokada → wersja → reguła 10 min');
    assert.match(f, /return 'przeladowanie';/);
    assert.match(z, /window\.bmPowrotWlasny = true;/);
  }
});

test('smoke: scenariusze H1–H3 (stary dokument po deployu, młody dokument, wpisane pole)', () => {
  const t = czytaj('tools/smoke-offline.js');
  for (const s of ['SW H1:', 'SW H2:', 'SW H3:']) assert.ok(t.includes(s), s);
});
