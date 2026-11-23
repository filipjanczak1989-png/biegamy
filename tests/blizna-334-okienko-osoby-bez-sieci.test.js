/* BLIZNA 334 (Filip 22.11, krok 4; red team z logów 1–21.11): tryb osoby zbierał z sieci opisy osób (miejscowość, kluby). Teraz opisy osób z internetu są
   wyłączone na stałe (osoba.mjs: OPISY_OSOB_Z_SIECI = false): żadna ścieżka trybu osoby nie woła sieci, także „kim jest X”, „X w sieci”, „google X” i osoba
   publiczna sportowo (≥ 30 startów, Mistrzostwa Polski, podium). Zostają wyniki z maszyny, karta „który to Ty?” i publiczne profile w BiegaMy.
   Odwrócone oczekiwania: blizna-67 (30+ startów / MP / podium → sieć) i blizna-107 (publiczna sportowo → sieć). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { moduly, przebiegV2, KORZEN } = require('./_okienko-potok-atrapa.js');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('v2 (prawdziwy potok, maszyna wyników z osobą publiczną sportowo): tryb osoby bez sieci w każdym wariancie pytania', async () => {
  const { zaladuj } = await moduly();
  const f6 = await zaladuj('supabase/functions/okienko/f6.mjs');
  for (const q of ['kim jest Robert Korzeniowski', 'Robert Korzeniowski w sieci', 'google Robert Korzeniowski', 'Robert Korzeniowski wyniki', 'jak pobiegł Robert Korzeniowski']) {
    f6._wyczyscPamiecF6();
    const r = await przebiegV2(q);
    assert.match(r.slad, /^osoba/, q + ' → ' + r.slad);
    assert.equal(r.sieci, 0, 'bez sieci: ' + q);
    assert.equal((r.body.zrodla || []).length, 0, 'bez źródeł z internetu: ' + q);
    // wyniki z maszyny zostają: osobna karta „wyniki” albo — przy jednej publicznej osobie w BiegaMy — wyniki w jej karcie (Filip 3.11)
    assert.ok((r.body.karty || []).some((k) => k.typ === 'wyniki' || (k.typ === 'osoba' && k.dane && k.dane.wyniki && k.dane.wyniki.starty >= 30)), 'wyniki z maszyny zostają: ' + q);
  }
});

test('osoba.mjs: przełącznik wyłączony i jedyne miejsce wołania sieci za nim; v1 i v2 korzystają z tego samego modułu', () => {
  const o = czytaj('supabase/functions/okienko/osoba.mjs');
  assert.match(o, /^export const OPISY_OSOB_Z_SIECI = false;$/m);
  assert.match(o, /const doSieci = OPISY_OSOB_Z_SIECI && !!\(wyniki && wyniki\.publiczna\);/);
  assert.equal((o.match(/deps\.siec\(/g) || []).length, 1, 'jedno wywołanie sieci w module');
  assert.match(o, /if \(doSieci && await deps\.sieciDozwolona\(\)\) \{/, 'wywołanie tylko za przełącznikiem');
  assert.match(czytaj('supabase/functions/okienko/index.ts'), /import \{ osobaZPytania, odpowiedzOsoba, osobaWZdaniu, ODP_NIC \} from "\.\/osoba\.mjs";/);
  assert.match(czytaj('supabase/functions/okienko-v2/potok.mjs'), /import \{ osobaZPytania, odpowiedzOsoba, osobaWZdaniu, ODP_NIC, kartyProfilu \} from "\.\.\/okienko\/osoba\.mjs";/);
});
