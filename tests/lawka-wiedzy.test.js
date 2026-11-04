/* ŁAWKA BAZY WIEDZY jako test CI (Filip 3.11, pkt 5): 30 par „to samo pytanie innymi słowami” przez PRAWDZIWY potok v2 musi trafić w ten sam wpis, bez sieci i bez modelu odpowiedzi;
   pary podobne, lecz inne, nigdy. Na końcu wypisuje wynik par POZA_STROJENIEM: to uczciwa miara czułości na pytaniach, na których reguł nie stroiliśmy (bez wymagania progu). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');
const { baza, fetchF6, DZIS, TERAZ } = require('./_lawka-pytan.js');
const { PARY, POZA_STROJENIEM, PIERWSZY_POMIAR, INNE } = require('./_lawka-wiedzy.js');

const zaladuj = (p) => import(pathToFileURL(path.join(__dirname, '..', p)).href);

async function przezPotok(tekst, intencja, wpisy) {
  await zaladuj('js/akcja.mjs');
  const { potok } = await zaladuj('supabase/functions/okienko-v2/potok.mjs');
  const adm = atrapa({ okienko_v2_log: [], okienko_v2_rozmowa: [], okienko_siec_cache: [], okienko_znaleziska: [], okienko_wiedza: wpisy });
  const sb = atrapa(baza()); sb.rpc = async () => ({ data: null, error: { message: 'rpc' } });
  let siec = 0;
  const r = await potok({ tekst, historia: [], ekran: 'home', athleteId: JA, sb, adm, jwt: 'T', dzis: DZIS, teraz: TERAZ, gemini: 'K', budzet: 0, fetchFn: fetchF6 },
    { sprawdzLimity: async () => null, uzyteSiecDzis: async () => 0, uzyteRozmowDzis: async () => 0, szukajWKatalogu: async () => null, zPamieci: async () => null,
      rozumienie: async () => ({ intencja, pewnosc: 0.95, dopytac: false, kandydaci: [], sloty: {}, tok: { we: 1, wy: 1 } }),
      zapytajSiec: async () => { siec++; return { tekst: 'Odpowiedź z sieci na 20 km trasy.', gm: { groundingChunks: [{ web: { uri: 'https://example.org/x', title: 'x' } }], groundingSupports: [{ segment: { startIndex: 0, endIndex: 100 } }] }, tok: { we: 1, wy: 1 }, zapytania: 1 }; } });
  return { slad: r.slad.join('>'), siec, plan: (adm.tabele.okienko_v2_log[0] || {}).plan };
}

test('30 par: oba zapisy pytania trafiają w ten sam wpis; bez sieci', async () => {
  const B = await zaladuj('supabase/functions/okienko-v2/baza-wiedzy.mjs');
  assert.equal(PARY.length, 30);
  const wpisy = PARY.map(([intencja, p], i) => ({ id: i + 1, klucz: B.kluczWiedzy(p), pytanie: p, warianty: [], odpowiedz: `Odpowiedź wpisu numer ${i + 1} dla tego pytania.`, zrodla: [], intencja, status: 'zatwierdzona', waznosc: 'wieczna', wazna_do: null, zapytan: 0 }));
  const klucze = new Set(wpisy.map((w) => w.klucz));
  assert.equal(klucze.size, 30, 'pary nie zlewają się ze sobą');
  const zle = [];
  for (const [i, [intencja, a, b]] of PARY.entries()) for (const q of [a, b]) {
    const r = await przezPotok(q, intencja, wpisy);
    if (r.slad !== 'wiedza:wiedza' || r.siec !== 0 || String(r.plan) !== `wiedza:${i + 1}`) zle.push(`${q} → ${r.slad} ${r.plan}, oczekiwany wpis ${i + 1}`);
  }
  assert.deepEqual(zle, []);
});

test('pary podobne, lecz inne, nigdy nie trafiają w ten sam wpis', async () => {
  const B = await zaladuj('supabase/functions/okienko-v2/baza-wiedzy.mjs');
  const zle = INNE.filter(([a, b]) => B.podobienstwo(a, b) > 0 || B.kluczWiedzy(a) === B.kluczWiedzy(b)).map(([a, b]) => `${a} / ${b}`);
  assert.deepEqual(zle, []);
  assert.ok(INNE.length >= 15);
  for (const q of ['', 'a', 'buty?', '   ', '12345']) assert.equal(B.podobienstwo(q, 'jakie buty'), 0, `za mało treści: „${q}”`);
  assert.equal(B.kluczWiedzy('buty?'), null, 'jedno słowo nie tworzy klucza');
});

test('dopisek zmieniający sens nigdy nie trafia w ten sam wpis: każde pytanie z par × 8 dopisków', async () => {
  const B = await zaladuj('supabase/functions/okienko-v2/baza-wiedzy.mjs');
  const KW = ['zimą', 'w upale', 'dla kobiet', 'dla dzieci', 'po pięćdziesiątce', 'na bieżni', 'w górach', 'w nocy'];
  const zle = [];
  for (const q of PARY.flatMap(([, a, b]) => [a, b])) for (const k of KW) if (![...B.sygnatura(k).tokeny].every((x) => B.sygnatura(q).tokeny.has(x)) && B.podobienstwo(q, q + ' ' + k) > 0) zle.push(q + ' + ' + k);   // dopisek, który pytanie już ma, niczego nie zmienia
  assert.deepEqual(zle, []);
});

test('miara: pary spoza strojenia (bez progu, tylko raport)', async () => {
  const B = await zaladuj('supabase/functions/okienko-v2/baza-wiedzy.mjs');
  const trafia = async ([intencja, a, b]) => (await przezPotok(b, intencja, [{ id: 1, klucz: B.kluczWiedzy(a), pytanie: a, warianty: [], odpowiedz: 'Odpowiedź wpisu dla tego pytania, dość długa.', zrodla: [], intencja, status: 'zatwierdzona', waznosc: 'wieczna', wazna_do: null, zapytan: 0 }])).slad === 'wiedza:wiedza';
  let swieze = 0, stare = 0; const pudla = [];
  for (const p of POZA_STROJENIEM) if (await trafia(p)) swieze++; else pudla.push(p[2]);
  for (const p of PIERWSZY_POMIAR) if (await trafia(p)) stare++;
  console.log(`baza wiedzy: świeże pary spoza strojenia ${swieze}/${POZA_STROJENIEM.length}, pierwszy pomiar po poprawkach ${stare}/${PIERWSZY_POMIAR.length} (na początku 1/12); pudło to wyszukanie i osobny kandydat, nie zła odpowiedź\n  pudła: ${pudla.join(' | ')}`);
  assert.equal(POZA_STROJENIEM.length, 22);
});
