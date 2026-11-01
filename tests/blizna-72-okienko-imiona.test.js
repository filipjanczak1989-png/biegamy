/* BLIZNA 72 (1.11.2026, M3 v2 / M3-0): detektor osoby ze słownikiem imion; osoba bez trafień nie jest ślepą uliczką.

   Ryzyka:
   1) FAŁSZYWA OSOBA. Dwa małe słowa („bieg ultrakotlina", „warszawa praga") nie mogą wpadać w tryb osoby —
      osoba = pierwsze słowo jest imieniem ze słownika (PESEL + zdrobnienia) albo wszystkie wielką literą.
   2) SŁOWNIK. Generowany z otwartych danych, nie ręcznie; nie może zawierać słów zwykłych z pytań („kim", „park").
   3) ŚLEPA ULICZKA. Osoba bez profilu/wyników/sieci → ścieżka ogólna (nie „Nie znalazłem tej osoby" od razu).
   4) PRYWATNOŚĆ BEZ ZMIAN. Ścieżka ogólna nie wysyła do Google pytania wyglądającego na imię i nazwisko (stary,
      szeroki detektor), ani pytania osoby bez trafień; pamięć sieci też pominięta. Brak wszystkiego → ODP_NIC. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8');

test('słownik: źródło PESEL podane w pliku, > 1000 imion, zdrobnienia, bez słów zwykłych; formy bez polskich znaków', async () => {
  const I = await zaladuj('supabase/functions/_shared/imiona.mjs');
  const src = czytaj('supabase', 'functions', '_shared', 'imiona.mjs');
  assert.match(src, /dane\.gov\.pl, zbiór 1501/);
  assert.match(src, /1159637/); assert.match(src, /1159639/);
  assert.ok(I.LICZBA_IMION > 1000, String(I.LICZBA_IMION));
  for (const n of ['Katarzyna', 'KATARZYNA', 'Łukasz', 'Iwona', 'Jan', 'kasia', 'Gosia', 'tomek']) assert.ok(I.czyImie(n), n);
  for (const s of ['kim', 'park', 'bieg', 'maraton', 'warszawa', 'ultrakotlina', 'wiosna', 'trener', 'plan']) assert.equal(I.czyImie(s), false, s);
  assert.ok([...I.IMIONA].every((x) => /^[a-z]+$/.test(x)), 'forma spoza a–z');
});

test('detektor osoby: słownik albo wielkie litery; „bieg ultrakotlina", „maraton warszawski", „warszawa praga" → nie', async () => {
  const P = await zaladuj('supabase/functions/okienko/pamiec.mjs');
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  for (const t of ['kasia nowak', 'Jan Kowalski', 'filip janczak', 'Katarzyna Chojnacka', 'iwona testowa', 'Anna Maria Nowak'])
    assert.ok(P.wygladaNaOsobeSlownik(t), t);
  for (const t of ['bieg ultrakotlina', 'maraton warszawski', 'warszawa praga', 'ultrakotlina', 'kim jest mój trener', 'jutro rano', 'trasa Poznań'])
    assert.equal(O.osobaZPytania(t), null, t);
  assert.deepEqual(O.osobaZPytania('kasia nowak'), { q: 'kasia nowak', wprost: false });
  assert.ok(P.wygladaNaOsobe('warszawa praga'), 'stary detektor (strażnik sieci) dalej szeroki');
});

test('EF: osoba bez trafień → odpowiedź informacyjna (M3-0b, bez modelu); strażnik sieci w ścieżce ogólnej zostaje; ODP_NIC dla pytań spoza detektora', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  assert.equal(O.ODP_NIC, 'Nie znalazłem tego w aplikacji, w wynikach ani w kalendarzu.');
  const ef = czytaj('supabase', 'functions', 'okienko', 'index.ts');
  assert.ok(!/osobaBezTrafien/.test(ef), 'ścieżka „osoba bez trafień → model" (M3-0) zastąpiona odpowiedzią informacyjną');
  assert.match(ef, /const blokadaSieci = wygladaNaOsobe\(tekst\);\s*\n\s*if \(!blokadaSieci && czyDoSieci\(/);
  assert.ok(ef.indexOf('const blokadaSieci') < ef.indexOf('zapytajSiec({ fetchFn: fetch, klucz: GEMINI, tekst, dzis })'), 'strażnik przed siecią ogólną');
  assert.match(ef, /\(blokadaSieci && !karty\.length && \(s\.puste \|\| s\.zdania\[0\] === NIE_MAM \|\| m\.poza_danymi\)\) \? \[ODP_NIC\]/);
});
