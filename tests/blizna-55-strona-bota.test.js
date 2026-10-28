// Blizna #55 (22.10.2026) — bot.html, strona bota zaciągu archiwum wyników (biegamy-collector, tools/archiwum).
//
// Kolektor archiwum przed pierwszym pobraniem pyta HEAD https://biegamy.run/bot.html i bez odpowiedzi 200 nie pobiera nic,
// a jego User-Agent wskazuje tę stronę. Skasowanie albo przemianowanie pliku zatrzymuje zaciąg; zmiana kontaktu albo opisu
// User-Agenta zostawia administratorów serwisów z wynikami bez wiarygodnej informacji, kto ich odwiedza i jak to zatrzymać.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const PLIK = path.join(KORZEN, 'bot.html');
const czytaj = () => fs.readFileSync(PLIK, 'utf8').replace(/\r/g, '');
const KONTAKT = 'biegamy.run+bot@gmail.com';

test('bot.html istnieje pod stałą nazwą (adres jest w User-Agencie kolektora)', () => {
  assert.ok(fs.existsSync(PLIK), 'bot.html — bez niej kolektor archiwum nic nie pobiera');
  assert.match(czytaj(), /<html lang="pl">/);
});

test('bot.html: kontakt biegamy.run+bot@gmail.com i ŻADNEGO innego adresu e-mail', () => {
  const s = czytaj();
  assert.ok(s.includes(`href="mailto:${KONTAKT}"`), 'kontakt jako link mailto');
  const adresy = [...new Set(s.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || [])];
  assert.deepEqual(adresy, [KONTAKT]);
});

test('bot.html: opis User-Agenta i zasad zgodny z kolektorem', () => {
  const s = czytaj();
  assert.ok(s.includes('BiegaMyBot/1.0 (+https://biegamy.run/bot.html)'), 'pełny User-Agent jak w tools/archiwum/zasady.js');
  assert.match(s, /User-agent: BiegaMyBot\nDisallow: \//, 'przykład wpisu robots.txt, który kolektor respektuje');
  assert.match(s, /1 zapytanie na 2 sekundy/);
  assert.match(s, /18:00–03:00 UTC/);
  assert.match(s, /403, 429 albo błędzie serwera 5xx/);
  assert.match(s, /dzieci i młodzieży/);
  assert.match(s, /href="usun-dane\.html"/);
});

test('bot.html: statyczna — bez skryptów aplikacji i bez wywołań sieci', () => {
  const s = czytaj();
  assert.doesNotMatch(s, /<script[^>]+src=/, 'żadnych zewnętrznych skryptów (sb.js, SDK)');
  assert.doesNotMatch(s, /supabase|api\.biegamy\.run|fetch\(/);
  assert.match(s, /<meta name="viewport"[^>]*viewport-fit=cover/);
});
