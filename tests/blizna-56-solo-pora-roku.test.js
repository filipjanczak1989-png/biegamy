/* BLIZNA 56 (31.10.2026, „Dziś v2" B): kadr dnia z ZŁEJ PORY ROKU.

   Do 31.10 SOLO dobierało kadr wyłącznie po pogodzie (tag p:) i typie treningu (t:). Kadr bez tagu p:
   narysowany jako zima (śnieg na murawie stadionu, kadr 31 z pierwszej próby) mógł wypaść w lipcowy
   dzień — a hero „Dziś" ma pokazywać to, co człowiek dziś naprawdę zobaczy za oknem.

   Teraz każdy kadr ma porę roku (sezonKadru: p:snieg → zima, p:upal → lato, reszta n % 4), dzień ma porę
   z daty w Warszawie (sezonDnia), a kadr innej pory jest TWARDO wykluczony. Pula nie może być pusta:
   anty-powtórka i pogoda ustępują przed zwróceniem pustego kafla.

   ⚠️ Test liczy na prawdziwym kodzie z sb.js (vm), z własnym localStorage i sessionStorage (pogoda),
      po 400 kolejnych dniach — błąd „raz na kilkadziesiąt dni" nie przejdzie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { zaladujSb } = require('./_srodowisko.js');

const N = 65;
function magazyn(dane = {}) {
  const m = new Map(Object.entries(dane));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null };
}
function pogodaSesja(rodzaj) {
  const dzien = { snieg: { weather_code: 73 }, deszcz: { weather_code: 61 }, mgla: { weather_code: 45 }, upal: { weather_code: 1, temp_max: 31 }, wiatr: { weather_code: 3 } }[rodzaj];
  return magazyn(dzien ? { 'weather:test': JSON.stringify({ data: { days: [dzien] } }) } : {});
}
function solo(pogoda) {
  const ctx = zaladujSb();
  ctx.localStorage = magazyn({ solo_salt: '424242' });
  ctx.sessionStorage = pogodaSesja(pogoda);
  return { S: ctx.window ? ctx.window.SOLO : ctx.SOLO, ctx };
}
const dzienNr = (d) => Math.floor(d.getTime() / 86400000);

test('sezonKadru: śnieg → zima, upał → lato, każdy numer ma porę', () => {
  const { S } = solo(null);
  for (const n of [6, 49, 50, 51]) assert.equal(S.sezonKadru(n), 'zima', `kadr ${n} (p:snieg)`);
  for (const n of [28, 52, 53, 54]) assert.equal(S.sezonKadru(n), 'lato', `kadr ${n} (p:upal)`);
  for (let n = 1; n <= N; n++) assert.ok(['wiosna', 'lato', 'jesien', 'zima'].includes(S.sezonKadru(n)), `kadr ${n}`);
});

test('kadry nocne (n % 12 = 0) rotują po porach — przy samym n % 4 wszystkie pięć byłyby wiosenne', () => {
  const { S } = solo(null);
  assert.deepEqual([12, 24, 36, 48, 60].map((n) => S.sezonKadru(n)), ['wiosna', 'lato', 'jesien', 'zima', 'wiosna']);
});

test('sezonDnia liczy porę z daty w Warszawie (granica miesiąca o północy czasu polskiego)', () => {
  const { S } = solo(null);
  assert.equal(S.sezonDnia(new Date('2026-07-15T12:00:00Z')), 'lato');
  assert.equal(S.sezonDnia(new Date('2026-01-15T12:00:00Z')), 'zima');
  assert.equal(S.sezonDnia(new Date('2026-04-15T12:00:00Z')), 'wiosna');
  assert.equal(S.sezonDnia(new Date('2026-10-15T12:00:00Z')), 'jesien');
  // 28.02 23:30 UTC = 1.03 00:30 w Warszawie → już wiosna
  assert.equal(S.sezonDnia(new Date('2026-02-28T23:30:00Z')), 'wiosna');
});

test('⚠️ LIPIEC nie dostaje kadru zimowego (400 dni, każda pogoda)', () => {
  for (const pog of [null, 'deszcz', 'upal', 'mgla', 'wiatr', 'snieg']) {
    const { S } = solo(pog);
    for (let i = 0; i < 400; i++) {
      const teraz = new Date(Date.UTC(2026, 6, 1 + (i % 31), 12));
      const nr = S.dopasujN(N, 30000 + i, 3, teraz);
      for (const n of nr) assert.notEqual(S.sezonKadru(n), 'zima', `pogoda ${pog}, dzień ${i}: kadr ${n} jest zimowy`);
    }
  }
});

test('⚠️ STYCZEŃ nie dostaje upału ani lata (400 dni, każda pogoda)', () => {
  for (const pog of [null, 'deszcz', 'upal', 'mgla', 'wiatr', 'snieg']) {
    const { S } = solo(pog);
    for (let i = 0; i < 400; i++) {
      const teraz = new Date(Date.UTC(2026, 0, 1 + (i % 31), 12));
      const nr = S.dopasujN(N, 40000 + i, 3, teraz);
      for (const n of nr) {
        assert.notEqual(S.sezonKadru(n), 'lato', `pogoda ${pog}, dzień ${i}: kadr ${n} jest letni`);
        assert.ok(![28, 52, 53, 54].includes(n), `pogoda ${pog}, dzień ${i}: kadr upału ${n}`);
      }
    }
  }
});

test('⚠️ PULA NIGDY PUSTA: każdy miesiąc × każda pogoda → zawsze 3 różne kadry z 1..65', () => {
  for (let m = 0; m < 12; m++) {
    for (const pog of [null, 'deszcz', 'upal', 'mgla', 'wiatr', 'snieg']) {
      const { S } = solo(pog);
      for (let i = 0; i < 60; i++) {
        const teraz = new Date(Date.UTC(2026, m, 1 + (i % 28), 12));
        const nr = S.dopasujN(N, 50000 + m * 1000 + i, 3, teraz);
        assert.equal(nr.length, 3, `miesiąc ${m + 1}, pogoda ${pog}, dzień ${i}: ${JSON.stringify(nr)}`);
        assert.equal(new Set(nr).size, 3, `powtórzony kadr w dniu: ${nr}`);
        for (const n of nr) assert.ok(n >= 1 && n <= N);
      }
    }
  }
});

test('wynik dnia stały przy ponownym wejściu; anty-powtórka trzyma pół puli pory (max 30)', () => {
  const { S, ctx } = solo(null);
  const teraz = new Date('2026-10-15T12:00:00Z');
  const a = S.dopasujN(N, 60000, 3, teraz), b = S.dopasujN(N, 60000, 3, teraz);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'przeładowanie tego samego dnia zmieniło kadry');   // tablice z vm mają inny prototyp
  const sezonu = Array.from({ length: N }, (_, i) => i + 1).filter((n) => S.sezonKadru(n) === 'jesien').length;
  const limit = Math.min(30, Math.floor(sezonu / 2));
  let poprzednie = [];
  for (let i = 1; i <= 20; i++) {
    const d = new Date(teraz.getTime() + i * 86400000);
    const nr = S.dopasujN(N, 60000 + i, 3, d);
    if (S.sezonDnia(d) !== 'jesien') break;
    const okno = poprzednie.slice(-limit);
    for (const n of nr) assert.ok(!okno.includes(n), `dzień +${i}: kadr ${n} powtórzony w oknie ${limit}`);
    poprzednie = poprzednie.concat(nr);
  }
  assert.ok(JSON.parse(ctx.localStorage.getItem('solo_hist')).length <= 30);
});

test('dopasuj (1 kadr) = pierwszy z dopasujN — zgodność wstecz', () => {
  const a = solo(null).S.dopasuj(N, 70000);
  const b = solo(null).S.dopasujN(N, 70000, 1)[0];
  assert.equal(a, b);
});
