/* BLIZNA 70 (1.11.2026, zgłoszenie Maćka): karta „podsumowanie miesiąca".
   1) Etykieta porównania w MIANOWNIKU („vs WRZESIEŃ"), nie w dopełniaczu („vs WRZEŚNIA") — z tej samej tablicy co podpis.
   2) Karta miesiąca z tłem z biblioteki rysuje się układem `miesiac` (większe pismo); własne tło zostaje przy `portret`
      (strefy pomiaru jasności w karta-uklad.json). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const EF = fs.readFileSync(path.join(KORZEN, 'supabase', 'functions', 'share-card', 'index.ts'), 'utf8');

test('etykieta porównania = „vs" + poprzedni miesiąc w mianowniku, dla każdego z 12 miesięcy', async () => {
  const { MIESIACE_MIANOWNIK: M, etykietaPorownania } = await zaladuj('supabase/functions/_shared/miesiace.mjs');
  assert.equal(M.length, 12);
  assert.equal(etykietaPorownania(9), 'vs WRZESIEŃ', 'karta za październik');
  assert.equal(etykietaPorownania(0), 'vs GRUDZIEŃ', 'styczeń porównuje z grudniem');
  assert.equal(etykietaPorownania(10), 'vs PAŹDZIERNIK');
  const DOPELNIACZ = /(STYCZNIA|LUTEGO|MARCA|KWIETNIA|MAJA|CZERWCA|LIPCA|SIERPNIA|WRZEŚNIA|PAŹDZIERNIKA|LISTOPADA|GRUDNIA)$/;
  for (let m = 0; m < 12; m++) {
    const e = etykietaPorownania(m);
    assert.equal(e, 'vs ' + M[(m + 11) % 12]);
    assert.ok(!DOPELNIACZ.test(e), `dopełniacz: ${e}`);
  }
});

test('share-card: etykieta i podpis z jednej tablicy w mianowniku; brak tablicy dopełniacza', () => {
  assert.match(EF, /import \{ MIESIACE_MIANOWNIK, etykietaPorownania \} from "\.\.\/_shared\/miesiace\.mjs";/);
  assert.match(EF, /etykieta: etykietaPorownania\(mies\)/);
  assert.match(EF, /podpis = `\$\{MIESIACE_MIANOWNIK\[mies\]\} \$\{rok\}`/);
  assert.ok(!/MIESIACE_DOPELNIACZ|const MIESIACE_MIANOWNIK/.test(EF), 'druga kopia nazw miesięcy w share-card');
});

test('karta miesiąca: układ `miesiac` tylko z tłem z biblioteki; pismo większe niż w `standard`', () => {
  assert.match(EF, /uklad: tloMomentu \? "portret" : mom\.type === "miesiac" \? "miesiac" : "standard"/);
  const blok = (k) => { const i = EF.indexOf(`  ${k}: {`); return EF.slice(i, i + EF.slice(i).search(/\r?\n  \},/)); };
  const liczba = (b, p) => Number((b.match(new RegExp(`\\b${p}: (\\d+)`)) || [])[1]);
  const st = blok('standard'), mi = blok('miesiac');
  for (const p of ['bohaterPx', 'statWartoscPx', 'statEtykietaPx4', 'statJednostkaPx']) assert.ok(liczba(mi, p) > liczba(st, p), p);
  for (const p of ['statEtykietaPx4', 'statWartoscPx', 'statJednostkaPx', 'podpisPx']) assert.ok([12, 14, 18, 24, 32, 48, 72, 96, 240].includes(liczba(mi, p)), `${p} spoza skali theme.css`);
  assert.equal(liczba(mi, 'maxKolumn'), 4);
});
