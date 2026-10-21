// Blizna #54 (21.10.2026) — sekcja „Wyniki zawodników” (races.html) na PRAWDZIWYM sb.js, bez ręcznego BM_SRODOWISKO.
//
// Ryzyko złapane przed wdrożeniem U1: testy U1 same ustawiały window.BM_SRODOWISKO, więc były zielone także wtedy,
// gdy sb.js z main tej zmiennej w ogóle nie ustawiał. Na takim sb.js warunek „!== 'prod'” odkrywał sekcję na prod
// i widżet wołał PROD Supabase, gdzie funkcji wyszukiwarki nie ma. Teraz: sb.js ładowany jak w przeglądarce
// (tests/_srodowisko.js, host biegamy.run), js/wyniki-api.js z repo, kod sekcji wycięty z races.html i wykonany.
// Sekcja ma być odkryta TYLKO przy jawnym 'test' albo dostępnym API; każda niepewność (brak zmiennej) = ukryta.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '');
// wartości z sb.js na main (stan sprzed przełącznika środowiska): na biegamy.run mają zostać identyczne
const PROD_URL = 'https://afqojgkaveykxbltxzwm.supabase.co';
const PROD_KEY = 'sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY';

// Kod sekcji z races.html: od komentarza F6/U1 do końca bloku if (prawdziwy kod strony, nie kopia w teście)
function kodSekcji() {
  const html = czytaj('races.html');
  const i = html.indexOf('  // F6/U1: sekcja (domyślnie hidden)');
  const j = html.indexOf('\n  }\n', html.indexOf('if (sekcjaWynikow && ', i));
  assert.ok(i > 0 && j > i, 'blok sekcji wyników w races.html');
  return html.slice(i, j + 4);
}

function uruchomSekcje(ctx) {
  const sekcja = { hidden: true, sluchacze: [], addEventListener(t) { this.sluchacze.push(t); } };
  const inicjalizacje = [];
  ctx.document.getElementById = (id) => (id === 'wyniki-szukaj-sekcja' ? sekcja : { id });
  ctx.initResultsSearch = (o) => { inicjalizacje.push(o); return {}; };
  vm.runInContext('(function () { var _sb = window.sb;\n' + kodSekcji() + '\n})();', ctx, { filename: 'races.html#sekcja-wynikow' });
  return { sekcja, inicjalizacje };
}

function zApi(ctx) { vm.runInContext(czytaj('js/wyniki-api.js'), ctx, { filename: 'js/wyniki-api.js' }); return ctx; }

test('prawdziwy sb.js na biegamy.run: BM_SRODOWISKO = prod, SB_URL/SB_KEY/SB_FN_URL jak na main', () => {
  const ctx = zaladujSb();
  assert.equal(ctx.location.hostname, 'biegamy.run');
  assert.equal(ctx.BM_SRODOWISKO, 'prod');
  assert.equal(ctx.SB_URL, PROD_URL);
  assert.equal(ctx.SB_KEY, PROD_KEY);
  assert.equal(ctx.SB_FN_URL, PROD_URL + '/functions/v1');
});

test('prawdziwy sb.js + flaga false: wynikiApiDostepne() = false, sekcja wyników ukryta, wyszukiwarka nie startuje', () => {
  const ctx = zApi(zaladujSb());
  assert.equal(ctx.WYNIKI_API_WLACZONE, false);
  assert.equal(ctx.wynikiApiDostepne(), false);
  assert.equal(ctx.wynikiApiPodglad(), false);
  const { sekcja, inicjalizacje } = uruchomSekcje(ctx);
  assert.equal(sekcja.hidden, true, 'sekcja ma zostać ukryta');
  assert.deepEqual([sekcja.sluchacze.length, inicjalizacje.length], [0, 0]);
});

test('brak BM_SRODOWISKO (sb.js bez przełącznika) i test bez konfiguracji: sekcja ukryta (zamknięte przy niepewności)', () => {
  for (const ustaw of [(c) => { delete c.BM_SRODOWISKO; }, (c) => { c.BM_SRODOWISKO = 'test-bez-konfiguracji'; }, (c) => { c.BM_SRODOWISKO = 'PROD'; }]) {
    const ctx = zApi(zaladujSb());
    ustaw(ctx);
    const { sekcja } = uruchomSekcje(ctx);
    assert.equal(sekcja.hidden, true, String(ctx.BM_SRODOWISKO));
    assert.equal(sekcja.sluchacze.length, 0);
  }
});

test('jawne środowisko test: sekcja widoczna, klient = _sb (TEST Supabase), bez linku usuwania; prod z podglądem: klient API', async () => {
  const t = zApi(zaladujSb());
  t.BM_SRODOWISKO = 'test';
  const a = uruchomSekcje(t);
  assert.equal(a.sekcja.hidden, false);
  assert.deepEqual(a.sekcja.sluchacze, ['toggle']);
  const p = zaladujSb();
  p.localStorage = { getItem: (k) => (k === 'wyniki_api_podglad' ? '1' : null), setItem() {}, removeItem() {} };
  zApi(p);
  assert.equal(p.wynikiApiDostepne(), true, 'prawdziwy sb.js + klucz podglądu na biegamy.run');
  const b = uruchomSekcje(p);
  assert.equal(b.sekcja.hidden, false);
});
