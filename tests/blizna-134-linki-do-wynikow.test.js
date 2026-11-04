/* BLIZNA 134 (3.11.2026, Filip): „Otwórz wyniki” prowadziło do kalendarza startów (races.html) zamiast do Wyników. Każdy link do wyników
   ma prowadzić do wyniki.html: karta zawodnika `#/zawodnik/<klucz>` (klucz z maszyny, zakodowany), bez klucza — wyszukiwarka Wyników.
   Ekran imprezy (`#/impreza/…`) działa od blizna-143 (F6 019); link do niego dostaje każda edycja na karcie imprezy. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

function okienko() {
  const ctx = zaladujSb(); ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  vm.runInContext(czytaj('js/okienko.js'), ctx, { filename: 'js/okienko.js' });
  return ctx.OKIENKO;
}

test('Okienko: „Otwórz wyniki” → wyniki.html#/zawodnik/<klucz> (zakodowany), bez klucza → wyniki.html; nigdy races.html', async () => {
  const O = okienko();
  const karta = (klucz) => O.htmlOdpowiedzi(200, { tryb: 'osoba', zdania: [], karty: [{ typ: 'wyniki', dane: { nazwa: 'Jan', starty: 3, ostatnie: [], klucz } }] });
  const cel = (h) => (h.match(/data-cel="([^"]*)">Otwórz wyniki/) || [])[1];
  assert.equal(cel(karta('datasport:368751')), 'wyniki.html#/zawodnik/datasport%3A368751');
  assert.equal(cel(karta('k:Jan Kowalski|1990')), 'wyniki.html#/zawodnik/k%3AJan%20Kowalski%7C1990');
  assert.equal(cel(karta('k:Łukasz Żak|1985')), 'wyniki.html#/zawodnik/' + encodeURIComponent('k:Łukasz Żak|1985'));
  assert.equal(cel(karta(null)), 'wyniki.html'); assert.equal(cel(karta('"><script>')), 'wyniki.html', 'zły klucz → bez hasha');
  for (const k of ['datasport:368751', 'k:Jan Kowalski|1990', 'k:Łukasz Żak|1985']) {
    const c = 'wyniki.html#/zawodnik/' + encodeURIComponent(k);
    assert.equal(O.bezpiecznyCel(c), c, 'klik przechodzi przez bezpiecznyCel: ' + c);
  }
  assert.equal(O.bezpiecznyCel('wyniki.html'), 'wyniki.html');
  assert.equal(O.bezpiecznyCel('wyniki.html#/zawodnik/a"onmouseover'), null); assert.equal(O.bezpiecznyCel('https://zly.pl/wyniki.html'), null);
  assert.doesNotMatch(czytaj('js/okienko.js'), /data-cel="' \+ esc\(EKRANY\.starty\) \+ '">Otwórz wyniki/, 'stary link do kalendarza');
});

test('cel z Okienka otwiera w Wynikach właściwy ekran (parsuj ← hash, ten sam klucz)', async () => {
  globalThis.window = globalThis;
  for (const p of ['js/tekst.mjs', 'js/kalendarz-lista.mjs', 'js/riegel.js', 'js/wyniki-lista.mjs']) await import(pathToFileURL(path.join(KORZEN, p)).href);
  const W = globalThis.BM_WYNIKI;
  for (const k of ['datasport:368751', 'k:Jan Kowalski|1990', 'k:Łukasz Żak|1985']) {
    const hash = '#/zawodnik/' + encodeURIComponent(k);
    assert.deepEqual(W.parsuj(hash), { ekran: 'zawodnik', klucz: k }); assert.equal(W.hashDla({ ekran: 'zawodnik', klucz: k }), hash);
  }
});

test('EF: karta wyników niesie klucz zawodnika (tryb osoby i „moje wyniki” z zapamiętanym kluczem)', async () => {
  const O = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/okienko/osoba.mjs')).href);
  assert.equal(O.podsumujWyniki({ display_name: 'X', runner_key: 'datasport:1' }, []).podsumowanie.klucz, 'datasport:1');
  assert.equal(O.podsumujWyniki({ display_name: 'X', runner_key: 'k:Jan Kowalski|1990' }, []).podsumowanie.klucz, 'k:Jan Kowalski|1990');
  assert.equal(O.podsumujWyniki({ display_name: 'X', runner_key: 'zly' }, []).podsumowanie.klucz, null);
  assert.equal(O.podsumujWyniki({ display_name: 'X' }, []).podsumowanie.klucz, null);
  assert.match(czytaj('supabase/functions/okienko/moje.mjs'), /results_count: w\.length, runner_key: a\.f6_runner_key \};/);
});

test('każdy link „wyniki” w stronach i skryptach prowadzi do wyniki.html (nie do kalendarza)', () => {
  const pliki = ['races.html', 'profil.html', 'zawodnik.html', 'kalendarz.html', 'trener.html', 'wyniki.html', 'js/okienko.js', 'js/wyszukiwarka-wynikow.js', 'js/kalendarz-lista.mjs'];
  for (const p of pliki) {
    const s = czytaj(p);
    for (const m of s.matchAll(/(?:href|data-cel)="([^"]*)"[^>]*>[^<]*(?:[Ww]ynik(?:i|ów)|Otwórz wyniki)/g)) {
      if (/^#$|^javascript:/.test(m[1])) continue;
      if (m[1] === 'usun-dane.html') continue;   // „Usuń moje wyniki” w stopce ekranu imprezy (blizna-143) to nie link do wyników
      assert.match(m[1], /^wyniki\.html|' \+ esc\(cel(?:Wynikow|Imprezy)/, `${p}: link do wyników prowadzi do ${m[1]}`);
    }
    assert.doesNotMatch(s, /races\.html[^"']*"[^>]*>\s*(Otwórz wyniki|Zobacz wyniki)/, p);
  }
});
