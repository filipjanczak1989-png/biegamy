/* BLIZNA 333 (Filip 22.11, krok 3, red team z logów 1–21.11): w v1 szły do modelu „jak ma nazwisko Kasia”, „kto korzysta z BiegaMy” i „na jakim modelu AI bazujesz”.
   Teraz stałe odpowiedzi w routerze (v1 i v2): nazwisko osoby → bramka odmowy jak przy innych osobach; „kto korzysta” → liczba biegaczy z bazy (nigdy nazwy),
   wspólna funkcja dla v1 i v2; pytanie o model → zdanie bez nazwy dostawcy, zgodne z polityką prywatności. Własne nazwisko w profilu i nazwisko Fabianka (zagadka) bez zmian. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { moduly, przebiegV2, trasaRoutera, KORZEN } = require('./_okienko-potok-atrapa.js');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('nazwisko osoby → odmowa; własne nazwisko w profilu, wyniki po nazwisku i nazwisko Fabianka (zagadka) jak dotąd', async () => {
  const { R } = await moduly();
  for (const q of ['jak ma nazwiso kasia', 'jak ma na nazwisko Kasia', 'jakie nazwisko ma trenerka', 'podaj nazwisko trenera', 'nazwisko Kasi']) {
    assert.equal(await trasaRoutera(q), 'odmowa', q);
    assert.equal(R.dopasuj(q, '2026-11-22').zdanie, R.ODP_ODMOWA, q);
  }
  for (const q of ['jak zmienić nazwisko w profilu', 'moje nazwisko się nie wyświetla', 'wyniki po nazwisku']) assert.notEqual(await trasaRoutera(q), 'odmowa', q);
  assert.equal(await trasaRoutera('jakie nazwisko ma Fabianek'), 'zagadka', 'dziecko: zagadka akcji przed bramką odmowy');
});

test('pytanie o model AI → stałe zdanie bez nazwy dostawcy', async () => {
  const { R } = await moduly();
  assert.equal(R.ODP_O_OKIENKU, 'Jestem Okienkiem BiegaMy. Odpowiadam z Twoich danych w aplikacji, a przy części pytań pomaga mi model AI zewnętrznego dostawcy — tak, jak opisuje polityka prywatności.');
  assert.doesNotMatch(R.ODP_O_OKIENKU, /gemini|google|openai|chatgpt|claude|anthropic/i, 'bez nazwy dostawcy');
  for (const q of ['Na jakim modelu ai bazujesz ?', 'czy jesteś ChatGPT', 'jaki jest twój model', 'używasz gemini?']) assert.equal(await trasaRoutera(q), 'o-okienku', q);
  for (const q of ['jaki model butów do maratonu', 'Plan na jutro']) assert.notEqual(await trasaRoutera(q), 'o-okienku', q);
});

test('„kto korzysta z BiegaMy” → temat „liczba” (v1 i v2), liczba z bazy w dół do dziesiątek, zapasowe zdanie bez liczby; jedna funkcja dla obu wersji', async () => {
  const { zaladuj } = await moduly();
  const { oNas } = await zaladuj('supabase/functions/_shared/o-nas.mjs');
  const L = await zaladuj('supabase/functions/_shared/liczba-biegaczy.mjs');
  for (const q of ['Kto korzysta z biegamy', 'kto używa tej aplikacji', 'jacy ludzie korzystają z BiegaMy', 'Ile osob korzysta z biegamy']) assert.equal((oNas(q) || {}).temat, 'liczba', q);
  const adm = (count, error = null) => ({ from: () => ({ select: () => ({ not: () => ({ neq: async () => ({ count, error }) }) }) }) });
  assert.equal(await L.liczbaBiegaczy(adm(193)), 'Z BiegaMy korzysta ponad 190 biegaczy.');
  assert.equal(await L.liczbaBiegaczy(adm(null, { message: 'x' })), null);
  assert.equal(L.ZDANIE_LICZBY_ZAPAS, 'Z BiegaMy korzystają biegacze i ich trenerzy.');
  const r = await przebiegV2('Kto korzysta z biegamy');
  assert.equal(r.slad, 'router:o-nas');
  assert.match(r.body.zdania[0], /^Z BiegaMy korzysta(ją biegacze i ich trenerzy\.| ponad \d+ biegaczy\.| \d+ biegaczy\.)$/, 'liczba albo zapasowe, nigdy nazwy');
  assert.equal(r.sieci + r.modele, 0);
  // jedna funkcja: definicja tylko w _shared, v2 przekazuje dalej, v1 importuje
  const definicje = [];
  const zbierz = (d) => { for (const e of fs.readdirSync(path.join(KORZEN, d), { withFileTypes: true })) { const p = d + '/' + e.name; if (e.isDirectory()) zbierz(p); else if (/\.(mjs|ts)$/.test(e.name) && /function zdanieLiczby|function liczbaBiegaczy/.test(czytaj(p))) definicje.push(p); } };
  zbierz('supabase/functions');
  assert.deepEqual(definicje, ['supabase/functions/_shared/liczba-biegaczy.mjs']);
  assert.match(czytaj('supabase/functions/okienko-v2/akcja-v2.mjs'), /export \{ ZDANIE_LICZBY_ZAPAS, zdanieLiczby, liczbaBiegaczy \} from "\.\.\/_shared\/liczba-biegaczy\.mjs";/);
  const v1 = czytaj('supabase/functions/okienko/index.ts');
  assert.match(v1, /if \(on\.temat === "liczba"\) \{ let n = null; try \{ n = await liczbaBiegaczy\(adm\); \} catch \{ n = null; \} zdaniaOn = \[n \|\| ZDANIE_LICZBY_ZAPAS\]; \}/);
});

test('v2: nazwisko i model AI kończą się w routerze, bez sieci i modelu', async () => {
  for (const [q, slad] of [['jak ma na nazwisko Kasia', 'router:odmowa'], ['Na jakim modelu ai bazujesz ?', 'router:o-okienku']]) {
    const r = await przebiegV2(q);
    assert.equal(r.slad, slad, q);
    assert.equal(r.sieci + r.modele, 0, q);
  }
});
