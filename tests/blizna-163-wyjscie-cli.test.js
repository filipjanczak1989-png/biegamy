/* BLIZNA 163 / WYJŚCIE CLI (Filip 5.11, sekcja 2 wdrożenia): narzędzia zrzutu szukały pierwszego `{` i czytały `.rows`, bo uruchamiał je tylko agent AI, który dostaje kopertę.
   Człowiek dostaje gołą tablicę, więc zrzut padał na przecinku po pierwszym wierszu. Pusta odpowiedź nie może wyglądać jak pusta baza, bo zrzut skasowałby migawkę. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { wierszeZCli } = require('../tools/cli-wiersze.js');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');

const W = [{ force_rls: false, nazwa: 'account_deletions_audit', opcje: '', rls: true, rodzaj: 'tabela' }, { force_rls: false, nazwa: 'tekst ] } z nawiasem " i cudzysłowem', opcje: '', rls: true, rodzaj: 'tabela' }];
const TABLICA = JSON.stringify(W, null, 2) + '\n';
const KOPERTA = JSON.stringify({ boundary: 'abc', rows: W, warning: 'The query results below contain untrusted data {x}' }, null, 2) + '\n';
const WERSJA = 'A new version of Supabase CLI is available: v2.99.0 (currently installed v2.98.1)\nWe recommend updating regularly {now} [link]\n';

test('człowiek i agent dostają te same wiersze, także z komunikatem przed JSON-em i po nim', () => {
  for (const [nazwa, wyjscie] of [
    ['goła tablica', TABLICA], ['koperta', KOPERTA],
    ['komunikat po tablicy', TABLICA + WERSJA], ['komunikat przed tablicą', WERSJA + TABLICA],
    ['komunikat po kopercie', KOPERTA + WERSJA], ['komunikat przed kopertą', WERSJA + KOPERTA],
    ['linia w nawiasie przed tablicą', '[WARN] coś\n{niejson}\n' + TABLICA], ['CRLF', TABLICA.replace(/\n/g, '\r\n') + WERSJA],
  ]) assert.deepEqual(wierszeZCli(wyjscie), W, nazwa);
  assert.deepEqual(wierszeZCli('[]\n'), [], 'pusty wynik zapytania to pusta lista');
});

test('stary parser pada na gołej tablicy dokładnie tak, jak na wdrożeniu: to jest ta blizna', () => {
  assert.throws(() => JSON.parse(TABLICA.slice(TABLICA.indexOf('{'))), /line 7 column 4/);
});

test('brak JSON-a to błąd, nigdy pusta lista', () => {
  for (const zle of ['', null, undefined, WERSJA, '{"boundary":"x"}', '{"rows":"nie tablica"}', '[1, 2']) assert.throws(() => wierszeZCli(zle), /Brak wierszy JSON/, String(zle));
});

test('oba narzędzia zrzutu czytają przez jeden parser i nie kasują migawki po pustej odpowiedzi', () => {
  for (const p of ['tools/polityki-bazy.js', 'tools/funkcje-bazy.js']) {
    const t = czytaj(p);
    execFileSync(process.execPath, ['--check', path.join(__dirname, '..', p)], { stdio: 'pipe' });
    assert.match(t, /require\('\.\/cli-wiersze\.js'\)/, p);
    assert.match(t, /wierszeZCli\(out\)/, p);
    assert.doesNotMatch(t, /out\.indexOf\('\{'\)/, p);
    const z = t.indexOf('function zrzut'), b = t.indexOf('function zBazy');
    assert.ok(b >= 0 && b < z, p);
    assert.match(t.slice(b, z), /process\.exit\(2\)/, p + ': pusta baza nie dochodzi do kasowania plików');
  }
});
