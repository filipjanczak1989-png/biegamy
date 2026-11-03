/* BLIZNA 127 (3.11.2026, R2 „rozmowa i pamięć”, OK Filipa): tryb ROZMOWA — dopytanie w świeżej rozmowie („a dlaczego?”, „wyjaśnij prościej”,
   „a dla mnie?”, „jak to zrobić w praktyce”, „a jeszcze?”) → jedno wywołanie modelu z poprzednimi wymianami (pytanie + skrót odpowiedzi
   z okienko_v2_rozmowa). LICZBY wyłącznie z rozmowy (strażnik v1); OGÓLNIKI → ponowienie → krócej; charakter trenera („Ty”, 2–4 zdania,
   bez „jako AI”); limit 20 tur/dobę; dopytanie nigdy do sieci (jest PRZED bramką osób); bez świeżej rozmowy → zwykła ścieżka. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);

test('rozmowa.mjs: tura z treścią (pytanie ≤ 300, odpowiedź ≤ 400, zdania sklejane), czytanie oddaje treść; bez treści jak dawniej', async () => {
  const R = await zaladuj('supabase/functions/okienko-v2/rozmowa.mjs');
  const t = { okienko_v2_rozmowa: [] }; const adm = atrapa(t);
  assert.equal(await R.zapiszTure(adm, JA, 'moj_plan', { zakres: 'dzis' }, { pytanie: ' co mam dzis ', odpowiedz: ['Dziś 8 km spokojnie.', 'Potem rozciąganie.', 'x'.repeat(500)] }), true);
  assert.equal(t.okienko_v2_rozmowa[0].pytanie, 'co mam dzis'); assert.match(t.okienko_v2_rozmowa[0].odpowiedz, /^Dziś 8 km spokojnie\. Potem rozciąganie\. x+$/); assert.equal(t.okienko_v2_rozmowa[0].odpowiedz.length, 400);
  assert.equal(await R.zapiszTure(adm, JA, 'osoba', { osoba: 'Jan' }), true); assert.equal(t.okienko_v2_rozmowa[1].pytanie, undefined, 'bez treści = jak E4');
  const r = await R.czytajRozmowe(adm, JA, new Date());
  assert.equal(r.length, 2); const zTrescia = r.find((x) => x.intencja === 'moj_plan'); assert.equal(zTrescia.pytanie, 'co mam dzis'); assert.match(zTrescia.odpowiedz, /^Dziś 8 km/);
  assert.equal(r.find((x) => x.intencja === 'osoba').odpowiedz, null);
});

test('rozmowa-model.mjs: detektor dopytań (tylko przy świeżej rozmowie z odpowiedzią), charakter trenera, liczby tylko z rozmowy, ogólnik → ponowienie → krócej', async () => {
  const M = await zaladuj('supabase/functions/okienko-v2/rozmowa-model.mjs');
  const roz = [{ intencja: 'moj_plan', pytanie: 'co mam dzis', odpowiedz: 'Dziś 8 km spokojnie w 5:30/km. Jutro 12 km.' }];
  for (const q of ['a dlaczego?', 'dlaczego tak', 'wyjasnij prosciej', 'a dla mnie?', 'jak to zrobic w praktyce', 'a jeszcze?', 'co jeszcze', 'a co z tempem', 'nie rozumiem', 'rozwin', 'a jak mam zmeczenie', 'po co']) assert.equal(M.czyDopytanie(q, roz), true, q);
  for (const q of ['co mam dzis', 'plan na jutro', 'kto wygral maraton', 'kim jest filip', 'ile km w tym tygodniu', '']) assert.equal(M.czyDopytanie(q, roz), false, q);
  assert.equal(M.czyDopytanie('a dlaczego?', []), false, 'bez rozmowy'); assert.equal(M.czyDopytanie('a dlaczego?', [{ intencja: 'moj_plan' }]), false, 'tura bez odpowiedzi (stare wpisy E4)');
  assert.match(M.CHARAKTER, /na „Ty”/); assert.match(M.CHARAKTER, /2–4 krótkimi zdaniami/); assert.match(M.CHARAKTER, /Nie mówisz o sobie „jako AI”/); assert.match(M.CHARAKTER, /słuchaj swojego ciała/); assert.match(M.CHARAKTER, /porad medycznych/);
  assert.match(M.promptRozmowy('2026-11-03', ['biegam rano']), /Co wiesz o tym biegaczu[^\n]*„biegam rano”/); assert.doesNotMatch(M.promptRozmowy('2026-11-03', []), /Co wiesz o tym biegaczu/);
  const wywolania = [];
  const gen = (odp) => async (o) => { wywolania.push(o); return { json: { zdania: odp.shift() || [] }, tok: { we: 900, wy: 60 } }; };
  // liczby: 8 km i 5:30 padły w rozmowie → zostają; „10 km” nie padło → zdanie wycięte
  const w1 = await M.odpowiedzRozmowy({ fetchFn: null, klucz: 'k', tekst: 'a dlaczego?', dzis: '2026-11-03', rozmowa: roz, generujJsonFn: gen([['Bo 8 km w 5:30/km buduje bazę bez zmęczenia.', 'Za tydzień zrobisz 10 km.']]) });
  assert.deepEqual(w1.zdania, ['Bo 8 km w 5:30/km buduje bazę bez zmęczenia.']); assert.equal(w1.odrzucone.length, 1); assert.equal(w1.ponowiono, false); assert.equal(w1.tok.we, 900);
  assert.equal(wywolania[0].contents.length, 3, 'pytanie + odpowiedź z rozmowy + nowe pytanie'); assert.equal(wywolania[0].contents[1].role, 'model'); assert.match(wywolania[0].system, /^Jesteś Okienkiem/);
  assert.equal(wywolania[0].temperature, 0.3); assert.equal(wywolania[0].maxOutputTokens, M.MAX_TOK_ROZMOWY);
  // ogólnik → ponowienie z instrukcją → konkret
  const w2 = await M.odpowiedzRozmowy({ fetchFn: null, klucz: 'k', tekst: 'a dlaczego?', dzis: '2026-11-03', rozmowa: roz, generujJsonFn: gen([['Słuchaj swojego ciała.'], ['Bo 8 km to Twoja baza, a 12 km jutro to krok wyżej.']]) });
  assert.equal(w2.ponowiono, true); assert.equal(w2.ogolnik, false); assert.deepEqual(w2.zdania, ['Bo 8 km to Twoja baza, a 12 km jutro to krok wyżej.']);
  assert.match(wywolania[wywolania.length - 1].contents.at(-1).parts[0].text, /Poprzednia odpowiedź była ogólnikiem/);
  // nadal ogólnik → krócej, wytrychy wycięte
  const w3 = await M.odpowiedzRozmowy({ fetchFn: null, klucz: 'k', tekst: 'a dlaczego?', dzis: '2026-11-03', rozmowa: roz, generujJsonFn: gen([['Każdy organizm jest inny.'], ['Biegaj spokojnie.', 'To zależy od wielu czynników.']]) });
  assert.equal(w3.ogolnik, true); assert.deepEqual(w3.zdania, ['Biegaj spokojnie.']);
  // model bez zdań / wszystkie z obcymi liczbami → null
  assert.equal(await M.odpowiedzRozmowy({ fetchFn: null, klucz: 'k', tekst: 'a dlaczego?', dzis: '2026-11-03', rozmowa: roz, generujJsonFn: gen([['Zrób 42 km.']]) }), null);
  assert.equal(await M.odpowiedzRozmowy({ fetchFn: null, klucz: 'k', tekst: 'a dlaczego?', dzis: '2026-11-03', rozmowa: roz, generujJsonFn: async () => { throw new Error('x'); } }), null, 'błąd modelu → null (potok: NIE_MAM + chipy)');
});

test('potok: rozmowa po pamięci E4 i PRZED bramką osób; limit 20 tur; każda udana odpowiedź zapisuje treść tury; ławka ma wiersze dopytań', async () => {
  const p = czytaj('supabase/functions/okienko-v2/potok.mjs');
  const iKont = p.indexOf('const kont = czyKontynuacja('), iRoz = p.indexOf('czyDopytanie(normalizuj(tekst), rozmowa)'), iOs = p.indexOf('const os = osobaZPytania(tekst);');
  assert.ok(iKont > 0 && iKont < iRoz && iRoz < iOs, 'kolejność: pamięć → rozmowa → osoba');
  assert.match(p, /\(await d\.uzyteRozmowDzis\(adm, athleteId, dzis\)\) >= d\.LIMIT_ROZMOW\) limit = "rozmowa";/);
  assert.match(p, /await zapiszTure\(adm, athleteId, "rozmowa", \{\}, \{ pytanie: tekst, odpowiedz: w\.zdania \}\);/);
  assert.equal((p.match(/zapiszTure\([^)]*\{ pytanie: tekst, odpowiedz: /g) || []).length, 9, 'router, akcja (zagadka i dopytanie po akcji — 3.11), rozmowa, osoba, impreza, v2, sieć, flash — treść tury wszędzie');
  const L = await zaladuj('supabase/functions/okienko-v2/log-v2.mjs'); assert.equal(L.LIMIT_ROZMOW, 20);
  assert.equal(await L.uzyteRozmowDzisV2(atrapa({ okienko_v2_log: [] }), JA, '2026-11-03'), 0, 'atrapa bez contains → 0, bez wyjątku');
  const { przebieg } = require('./_lawka-v2.js');
  const w = await przebieg([{ p: 'a dlaczego?', kat: 'rozmowa', waga: 3, oczekiwane: 'v2:rozmowa', po: ['co mam dzis'] }, { p: 'a dlaczego', kat: 'poza', waga: 2, oczekiwane: 'v2-niepewne:dopytanie' }]);
  assert.equal(w[0].pasuje, true, 'po turze z odpowiedzią → rozmowa'); assert.match(w[0].tresc, /^Bo tak układa się bazę/);
  assert.equal(w[1].pasuje, true, 'bez rozmowy → chipy');
  const l = czytaj('tests/_lawka-v2-pytania.js'); assert.match(l, /W\('a dlaczego\?', 'rozmowa', 4, 'v2:rozmowa', \{ po: \['co mam dzis'\] \}\)/);
});
