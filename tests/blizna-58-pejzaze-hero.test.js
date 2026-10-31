/* BLIZNA 58 (31.10.2026, Grafiki v4 / G3): pejzaże 21:9 w .bm-hero na 10 widokach.

   Ryzyka, których pilnuje ten plik:
   1) DRUGA PULA PRZEZ TE SAME KLUCZE. SOLO.dopasujN miało jeden wynik dnia (solo_dzien) i jedną historię
      (solo_hist). Pejzaże wołane tą samą drogą nadpisałyby kadry „Dziś" i zjadały ich anty-powtórkę —
      każde wejście na Kalendarz zmieniałoby Dziś. Teraz pula pejzaży ma solo_dzien_pejzaz / solo_hist_pejzaz.
   2) ZŁA PORA ROKU. Pejzaż dnia ma porę z daty (sezonDnia) — październik = jesień, na każdej z 10 stron.
   3) TA SAMA KARTKA NA 10 STRONACH. Przesunięcie per strona: tego samego dnia strony widzą różne pejzaże
      (pora ma ≥ 8 pejzaży przy N = 40; jesień i lato po 11, więc 10 różnych).
   4) PUSTA PULA / BRAK PLIKU. Bez SOLO albo przy N = 0 → stary obraz (FLOTA/STALE) od razu; błąd ładowania
      pejzażu → podmiana na stary URL, dopiero jego błąd zostawia gradient.
   Liczy na prawdziwym sb.js (vm), z własnym localStorage. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const N = 40;
const STRONY = ['races', 'kalendarz', 'raporty', 'nutrition', 'odznaki', 'wyzwania', 'radio', 'compare', 'trener', 'ankieta'];
function magazyn(dane = {}) {
  const m = new Map(Object.entries(dane));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, _m: m };
}
function swiat() {
  const ctx = zaladujSb();
  ctx.localStorage = magazyn({ solo_salt: '424242' });
  ctx.sessionStorage = magazyn();
  return { S: ctx.SOLO, B: ctx.BANERY, ctx };
}
const dzienNr = (d) => Math.floor(d.getTime() / 86400000);
const sezonPejzazu = (S, n) => S.sezonKadru(n, {});

test('osobne klucze: pejzaże nie ruszają solo_dzien ani solo_hist kadrów „Dziś"', () => {
  const teraz = new Date('2026-10-31T12:00:00Z'), dn = dzienNr(teraz);
  const a = swiat(), b = swiat();
  const dzisA = a.S.dopasujN(89, dn, 3, teraz);
  const przed = { d: a.ctx.localStorage.getItem('solo_dzien'), h: a.ctx.localStorage.getItem('solo_hist') };
  for (let k = 0; k < STRONY.length; k++) a.S.pejzazDnia(N, dn, k, teraz);
  assert.equal(a.ctx.localStorage.getItem('solo_dzien'), przed.d, 'pejzaż nadpisał wynik dnia „Dziś"');
  assert.equal(a.ctx.localStorage.getItem('solo_hist'), przed.h, 'pejzaż dopisał się do historii „Dziś"');
  assert.ok(a.ctx.localStorage.getItem('solo_dzien_pejzaz'), 'brak własnego wyniku dnia pejzaży');
  assert.ok(a.ctx.localStorage.getItem('solo_hist_pejzaz'), 'brak własnej historii pejzaży');
  // pejzaże PRZED „Dziś" nie zmieniają kadrów „Dziś"
  for (let k = 0; k < STRONY.length; k++) b.S.pejzazDnia(N, dn, k, teraz);
  assert.equal(JSON.stringify(b.S.dopasujN(89, dn, 3, teraz)), JSON.stringify(dzisA));
});

test('31.10 (jesień): 10 stron → 10 RÓŻNYCH pejzaży, wszystkie jesienne', () => {
  const { S } = swiat();
  const teraz = new Date('2026-10-31T12:00:00Z');
  const nr = STRONY.map((_, k) => S.pejzazDnia(N, dzienNr(teraz), k, teraz));
  for (const n of nr) assert.equal(sezonPejzazu(S, n), 'jesien', `pejzaż ${n}`);
  assert.equal(new Set(nr).size, 10, JSON.stringify(nr));
});

test('⚠️ każdy dzień roku: pora pejzażu = pora dnia na każdej stronie; różnych ≥ min(10, pejzaży pory)', () => {
  const { S } = swiat();
  const pory = {};
  for (let n = 1; n <= N; n++) (pory[sezonPejzazu(S, n)] ||= []).push(n);
  for (const [p, l] of Object.entries(pory)) assert.ok(l.length >= 8, `pora ${p}: tylko ${l.length} pejzaży`);
  for (let i = 0; i < 366; i++) {
    const teraz = new Date(Date.UTC(2026, 0, 1 + i, 12)), dn = dzienNr(teraz), sez = S.sezonDnia(teraz);
    const nr = STRONY.map((_, k) => S.pejzazDnia(N, dn, k, teraz));
    for (const n of nr) { assert.ok(n >= 1 && n <= N); assert.equal(sezonPejzazu(S, n), sez, `dzień ${i}: pejzaż ${n}`); }
    assert.ok(new Set(nr).size >= Math.min(10, pory[sez].length), `dzień ${i}: ${nr}`);
  }
});

test('wynik dnia stały przy ponownym wejściu; pejzaż bazowy nie powtarza się w oknie anty-powtórki', () => {
  const { S } = swiat();
  const start = new Date('2026-10-01T12:00:00Z');
  const a = S.pejzazDnia(N, dzienNr(start), 3, start), b = S.pejzazDnia(N, dzienNr(start), 3, start);
  assert.equal(a, b);
  const jesien = Array.from({ length: N }, (_, i) => i + 1).filter((n) => sezonPejzazu(S, n) === 'jesien').length;
  const limit = Math.min(30, Math.floor(jesien / 2));
  const bazy = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    if (S.sezonDnia(d) !== 'jesien') break;
    const n = S.pejzazDnia(N, dzienNr(d), 0, d);
    assert.ok(!bazy.slice(-limit).includes(n), `dzień +${i}: pejzaż ${n} w oknie ${limit}`);
    bazy.push(n);
  }
  assert.ok(bazy.length >= 30);
});

test('BANERY: 10 widoków → pejzaz-NN.jpg z biegamy-assets; inne widoki i brak SOLO → stary obraz', () => {
  const { B, ctx } = swiat();
  assert.deepEqual([...B.STRONY], STRONY);
  for (const p of STRONY) assert.match(B.src(p), /\/biegamy-assets\/pejzaz-\d\d\.jpg$/, p);
  assert.equal(new Set(STRONY.map((p) => B.src(p))).size, 10, 'te same pejzaże na dwóch stronach');
  for (const p of STRONY) assert.ok(B.stary(p), `${p}: brak zapasowego starego obrazu`);
  assert.equal(B.src('login'), B.stary('login'));
  ctx.SOLO = undefined;
  for (const p of STRONY) assert.equal(B.src(p), B.stary(p), `${p}: bez SOLO nie wraca do starego URL`);
});

test('BANERY: błąd ładowania pejzażu → stary URL; błąd starego → gradient (obraz usunięty)', () => {
  const { B, ctx } = swiat();
  let img = null, usuniety = false;
  const klasy = new Set();
  const atrybuty = {};
  ctx.document.createElement = () => {
    img = { style: { setProperty() {} }, classList: { add() {} }, setAttribute: (k, v) => { atrybuty[k] = v; },
      getAttribute: (k) => atrybuty[k] ?? null, remove: () => { usuniety = true; }, src: '' };
    return img;
  };
  const sekcja = { getAttribute: () => 'kalendarz', querySelector: () => null, insertBefore() {},
    classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c) } };
  B.ozyw({ querySelectorAll: () => [sekcja] });
  assert.match(img.src, /pejzaz-\d\d\.jpg$/);
  img.onerror();
  assert.equal(img.src, B.stary('kalendarz'));
  assert.ok(!usuniety && klasy.has('z-obrazem'));
  img.onerror();
  assert.ok(usuniety && !klasy.has('z-obrazem'));
});

test('PEJZAZE_N w sb.js = N puli pejzaży w generatorze', () => {
  const sb = fs.readFileSync(path.join(__dirname, '..', 'sb.js'), 'utf8');
  const gen = fs.readFileSync(path.join(__dirname, '..', 'tools', 'kadry', 'generuj-kadry.mjs'), 'utf8');
  assert.equal(+sb.match(/var PEJZAZE_N = (\d+);/)[1], +gen.match(/pejzaz:\s*\{[^}]*N:\s*(\d+)/)[1]);
});
