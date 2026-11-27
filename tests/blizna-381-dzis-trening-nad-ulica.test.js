// Blizna #381 (26.11.2026) — nowe Dziś: trening na dziś stał POD kaflem Ulicy.
//
// Kolejność z E1 to: Ulica, Trening na dziś, skróty, Ostatni trening. Najważniejsza rzecz dnia (co mam dziś zrobić
// i przycisk „Zaloguj wynik”) była druga, a z kadrem w nagłówku (plan dzis\grafiki\plan-kadr.md) przycisk wypadałby
// pod dolne menu. Decyzja Filipa 25.11: trening nad Ulicą. Szkielet rysuje się w tej samej kolejności, więc nic
// się nie przestawia po dociągnięciu danych.
// Ulica dochodzi w pierwszej fali danych, trening w drugiej: kafel treningu rośnie nad Ulicą i przesuwa ją w dół.
// To ruch POD miejscem, które człowiek czyta (trening), nie nad nim; test pilnuje tylko kolejności i szkieletu.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, MODUL } = require('./_dzis-nowy-strona.js');

const kolejnosc = (h) => [...h.matchAll(/data-kafel="([a-z]+)"/g)].map((m) => m[1]);

test('(1) kolejność kafli: Trening na dziś, Ulica, skróty, Ostatni trening, Ten tydzień, Społeczność (od blizna-406), lista; szkielet w tej samej kolejności', async () => {
  const s = strona(); s.B.start();
  assert.deepEqual(kolejnosc(s.korzen.innerHTML), ['trening', 'ulica', 'skroty', 'ostatni', 'tydzien', 'spol', 'lista']);
  assert.deepEqual([...s.korzen.innerHTML.matchAll(/class="dn-etykieta">([^<]*)</g)].map((m) => m[1]), ['Trening na dziś', 'Ulica', 'Ostatni trening', 'Ten tydzień', 'Społeczność', 'Twoje ostatnie treningi']);
  assert.match(s.korzen.innerHTML, /<div class="dn-zd" data-dn="zdarzenie" hidden><\/div><div class="dn-kafle"><section class="dn-kafel" data-kafel="trening" aria-busy="true">/, 'trening zaraz pod paskiem zdarzeń');
  assert.match(MODUL, /var KAFLE = \[\["trening", "Trening na dziś"\], \["ulica", "Ulica"\], \["skroty", ""\], /);
});

test('(2) po wczytaniu nic się nie przestawia: oba kafle rysują się w swoich miejscach ze szkieletu, w dowolnej kolejności odpowiedzi', async () => {
  const s = strona(); s.B.start(); await s.tik();
  s.zapytania.forEach((z) => z.odpowiedz()); await s.tik();   // fala 1: profil i licznik ulicy
  assert.match(s.kafel('ulica').innerHTML, /Ulica próbna/, 'Ulica jest pierwsza z danymi');
  assert.equal(s.kafel('trening').innerHTML, '', 'trening jeszcze na szkielecie (jego dane idą w drugiej fali)');
  await s.doKonca();
  assert.match(s.kafel('trening').innerHTML, /Rozgrzewka/); assert.match(s.kafel('ulica').innerHTML, /Ulica próbna/);
  assert.deepEqual(kolejnosc(s.korzen.innerHTML), ['trening', 'ulica', 'skroty', 'ostatni', 'tydzien', 'spol', 'lista'], 'szkielet nie jest przerysowywany po danych');
});
