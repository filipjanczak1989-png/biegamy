/* BLIZNA 330 (Filip 21.11): szersze dopasowanie pytań o akcję i bieg (blizna-329) nie może zabrać pytań, które Okienko dziś obsługuje inaczej.
   Zbiór: wszystkie pytania z ławek w repo (tests/_lawka-*.js, tests/_nagrania-v2.json, tests/_lawka-v2-kandydaci.json, tools/okienko-ab-pytania.json),
   21.11: 2663 pytania. Poza 94 wariantami z propozycji żadne nie trafia w nowe wzorce akcji ani w nasz bieg. Wyjątek: „co to za akcja”, które już
   przed zmianą było zagadką (ZAGADKA_AKCJA). Pierwsze kolizje prototypu (poprawione przed commitem): „kiedy znowu przypinam numer startowy?”,
   „ile wody pić w czasie biegu”, „ile kosztuje bieg Wedla”, „przy każdym biegu boli…”. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { WARIANTY } = require('./_okienko-warianty-akcja-bieg.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const JUZ_ZAGADKA = ['co to za akcja'];   // po normalizacji; przed zmianą ZAGADKA_AKCJA („co to za akcj…”)
const NOWE_W_LAWCE_AKCJI = ['co za akcja', 'czym jest akcja', 'do kiedy trwa akcja', 'ile zostało do celu'];   // dopisane do tests/_lawka-akcji.js razem z tą zmianą

function zbiorPytan() {
  const zbior = new Set();
  const dodaj = (x) => { if (typeof x === 'string' && x.trim().length >= 2 && x.length < 200) zbior.add(x.trim()); };
  const zbierz = (v) => { if (Array.isArray(v)) { if (typeof v[0] === 'string') dodaj(v[0]); else v.forEach(zbierz); } else if (v && typeof v === 'object') { for (const k of ['p', 'q', 'pytanie', 'tekst', 'pyt']) dodaj(v[k]); } };
  for (const f of ['_lawka-pytan.js', '_lawka-v2-pytania.js', '_lawka-wiedzy.js', '_lawka-akcji.js']) { const m = require('./' + f); for (const k of Object.keys(m)) zbierz(m[k]); }
  zbierz(JSON.parse(fs.readFileSync(path.join(KORZEN, 'tools/okienko-ab-pytania.json'), 'utf8')));
  Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, '_nagrania-v2.json'), 'utf8'))).forEach(dodaj);
  for (const d of Object.values(JSON.parse(fs.readFileSync(path.join(__dirname, '_lawka-v2-kandydaci.json'), 'utf8')))) zbierz(d);
  return [...zbior];
}

test('zbiór pytań z ławek: ponad 2600 pytań (wczytanie nie może się po cichu skurczyć)', () => {
  const z = zbiorPytan();
  assert.ok(z.length >= 2600, 'pytań w zbiorze: ' + z.length);
});

test('zbiór pytań z ławek bez kolizji: poza 94 wariantami nic nie trafia w nowe wzorce akcji ani w nasz bieg', async () => {
  await zaladuj('js/akcja-cytaty.mjs');
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const { ZAGADKA_AKCJA_KROTKA, ZAGADKA_KONIEC_AKCJI, KM_DO_CELU } = R._WARIANTY_AKCJI;
  const warianty = new Set([...WARIANTY.map((w) => w[1]), ...NOWE_W_LAWCE_AKCJI].map((q) => R.normalizuj(q)));
  globalThis.BM_AKCJA_CYTATY.ustawStan({ ruszyla: true, zamknieta: false, proba: false });
  const kolizje = [];
  let sprawdzone = 0;
  for (const q of zbiorPytan()) {
    if (warianty.has(R.normalizuj(q))) continue;
    sprawdzone++;
    const t = R.normalizuj(q);
    if ((ZAGADKA_AKCJA_KROTKA.test(t) || ZAGADKA_KONIEC_AKCJI.test(t) || KM_DO_CELU.test(t)) && !JUZ_ZAGADKA.includes(t)) kolizje.push('akcja: ' + q);
    // skutek, nie sam wzorzec: odpowiedź biegiem daje router (log „bieg”) albo — gdy router nic nie zwrócił — strażnik BiegaMy (EF: „nie wiem” + strona biegu).
    // „kiedy znowu przypinam numer startowy?” ma temat biegu, ale router odpowiada wcześniej regułą moje_starty — i tak ma zostać.
    const d = R.dopasuj(q, '2026-11-21');
    if (d && d.log === 'bieg') kolizje.push('router bieg: ' + q + ' → ' + JSON.stringify(d.bieg));
    if (!d && R.rodzajBiegaMy(q) === 'bieg') kolizje.push('strażnik bieg: ' + q);
  }
  assert.ok(sprawdzone >= 2500, 'sprawdzone pytania: ' + sprawdzone);
  assert.deepEqual(kolizje, []);
});
