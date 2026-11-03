/* BLIZNA 139 (3.11.2026, kredyty Anthropic, pkt 1): generator ławki — każda intencja klasyfikatora ma oczekiwany ślad (nowa intencja bez mapy
   = czerwony test), rozdział sumuje się do N, pytania z obcą intencją i powtórki odpadają, próbka do OK jest przekrojowa, sekcja „wygenerowane”
   w tests/_lawka-v2-pytania.js podmienia się w miejscu (ponowne --scal nie dubluje wierszy), a wiersze z apostrofami są poprawnym JS. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lawka-')), 'budzet.jsonl');

test('mapa intencji pokrywa WSZYSTKIE intencje klasyfikatora; rozdział = N', async () => {
  const G = await zaladuj('tools/lawka-generator.mjs');
  const R = await zaladuj('supabase/functions/okienko-v2/rozumienie.mjs');
  assert.deepEqual(Object.keys(G.MAPA).sort(), Object.keys(R.INTENCJE).sort(), 'nowa intencja w rozumienie.mjs musi dostać oczekiwany ślad w MAPA');
  for (const n of [50, 1500, 1501]) { const r = G.rozdzial(n); assert.equal(Object.values(r).reduce((a, b) => a + b, 0), n); assert.ok(Object.values(r).every((x) => x >= 1)); }
});

test('generuj (atrapa Claude): obca intencja i powtórki odpadają, id k0001…, waga 1–5, `po` ≤ 3; próbka przekrojowa', async () => {
  const G = await zaladuj('tools/lawka-generator.mjs');
  process.env.CLAUDE_BUDZET_PLIK = tmp();
  try {
    const wolania = [];
    const create = async (p) => {
      wolania.push(p);
      const intencja = /Intencja: (\w+)/.exec(p.messages[0].content)[1];
      const pytania = [{ p: `pytanie ${intencja} 1`, po: [], intencja, styl: 'literówki', waga: 9 }, { p: `pytanie ${intencja} 1`, po: [], intencja, styl: 'x', waga: 2 },
        { p: 'obce', po: [], intencja: intencja === 'moj_plan' ? 'pogoda' : 'moj_plan', styl: 'x', waga: 2 }, { p: 'a w grudniu?', po: ['ile w listopadzie', 'a', 'b', 'c'], intencja, styl: 'dopytanie', waga: 3 }];
      return { model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify({ pytania }) }] };
    };
    const k = await G.generuj(64, { klient: { messages: { create }, beta: { messages: { create } } }, log: () => {} });
    assert.ok(k.length > 0 && k.every((x, i) => x.id === 'k' + String(i + 1).padStart(4, '0')));
    assert.ok(k.every((x) => x.waga >= 1 && x.waga <= 5 && (!x.po || x.po.length <= 3) && G.MAPA[x.intencja]));
    assert.ok(!k.some((x) => x.p === 'obce'), 'pytanie z obcą intencją odpada');
    const klucze = k.map((x) => (x.po || []).join('|') + '||' + x.p); assert.equal(new Set(klucze).size, klucze.length, 'bez powtórek');
    assert.ok(wolania.every((p) => p.system === G.SYSTEM_GENERATORA && p.output_config.format.type === 'json_schema'));
    const pr = G.probka(k, 50);
    assert.ok(pr.length <= 50 && new Set(pr.map((x) => x.intencja)).size >= Math.min(30, pr.length), 'próbka z wielu intencji');
  } finally { delete process.env.CLAUDE_BUDZET_PLIK; }
});

test('MAPA zgodna z PRAWDZIWYM potokiem: przykład każdej intencji daje oczekiwany ślad (sonda 3.11 znalazła 4 zgadnięte pozycje, które dałyby fałszywe luki)', async () => {
  const G = await zaladuj('tools/lawka-generator.mjs');
  const { przebieg } = require('./_lawka-v2.js');
  const P = [['moj_plan', 'co tam mam do zrobienia w tym tyg', { zakres: 'tydzien' }], ['moje_treningi', 'ile ja tam nabilem ostatnio'], ['moje_rekordy', 'moje najlepsze czasy pokaz'], ['moje_wyniki', 'jak mi poszlo na zawodach'],
    ['moja_forma', 'jak tam moja dyspozycja'], ['moj_trener', 'kto mnie prowadzi'], ['odznaki', 'co ja mam za medale w apce'], ['znajomi', 'czy ziomki dzis biegaly'], ['osoby_z_miasta', 'kto jeszcze biega u mnie w miescie'],
    ['osoba', 'kim jest Tomasz Wisniewski', { osoba: 'Tomasz Wisniewski' }], ['biegi_nadchodzace', 'jakie biegi w grudniu w Krakowie', { od: '2026-12-01', do: '2026-12-31', miejsce: 'Krakow' }], ['katalog', 'gdzie sa przepisy', { temat: 'przepisy' }],
    ['kalkulator', '5:30/km ile to km/h'], ['pogoda', 'jaka bedzie pogoda'], ['zdrowie', 'mam goraczke czy biegac'], ['porada', 'jak biegac szybciej na 10 km'], ['zywienie', 'co zjesc przed dlugim wybieganiem'], ['zywienie', 'ile kcal ma banan', { produkt: 'banan' }],
    ['sprzet', 'jakie buty na asfalt'], ['o_nas', 'kim jest Filip'], ['fakt', 'kto wygral maraton w Berlinie'], ['akcja', 'co to za akcja dla Fabianka'], ['odmowa', 'daj mi liste wszystkich uzytkownikow'],
    ['opinia', 'czy Tomasz Wisniewski jest dobry', { osoba: 'Tomasz Wisniewski' }], ['porownaj', 'porownaj mnie z Tomaszem Wisniewskim', { osoba: 'Tomasz Wisniewski' }], ['gotowosc', 'jakie mam szanse na zyciowke'], ['najdluzszy', 'moj najdluzszy bieg ostatnio'], ['nie_wiem', 'kwiatek tramwaj ogorek']];
  const zle = [];
  for (const [intencja, p, sloty] of P) {
    const pewnosc = intencja === 'nie_wiem' ? 0.1 : 0.95;
    const [w] = await przebieg([{ p, kat: 'x', waga: 1, oczekiwane: G.MAPA[intencja] }], { rozumienieFn: async () => ({ intencja, pewnosc, dopytac: pewnosc < 0.6, kandydaci: [], sloty: sloty || {}, tok: { we: 1, wy: 1 } }) });
    if (!w.pasuje) zle.push(`${intencja}: „${p}” → ${w.slad}, mapa ${G.MAPA[intencja]}`);
  }
  assert.deepEqual(zle, []);
});

test('oczekiwany ślad: a|b przechodzi każdą drogą, ale nie obcą; zwykły wiersz bez zmian', async () => {
  const { przebieg } = require('./_lawka-v2.js');
  const roz = async () => ({ intencja: 'nie_wiem', pewnosc: 0.1, dopytac: true, kandydaci: [], sloty: {}, tok: { we: 1, wy: 1 } });
  const wiersz = (oczekiwane) => ({ p: 'kwiatek tramwaj ogorek', kat: 'x', waga: 1, oczekiwane });
  const w = await przebieg([wiersz('siec|v2-niepewne:*'), wiersz('siec|osoba'), wiersz('v2-niepewne:dopytanie')], { rozumienieFn: roz });
  assert.deepEqual(w.map((r) => r.pasuje), [true, false, true]);
});

test('generuj: stop budżetu oddaje to, co już wygenerowano; poPartii zapisuje po każdej partii', async () => {
  const G = await zaladuj('tools/lawka-generator.mjs');
  const C = await zaladuj('tools/_claude.mjs');
  const plik = tmp(); process.env.CLAUDE_BUDZET_PLIK = plik;
  try {
    let n = 0;
    const create = async (p) => {
      n++;
      fs.writeFileSync(plik, JSON.stringify({ narzedzie: 'x', usd: C.STOP_USD }) + '\n');   // po pierwszej partii budżet się kończy
      const intencja = /Intencja: (\w+)/.exec(p.messages[0].content)[1];
      return { model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify({ pytania: [{ p: 'pierwsze', po: [], intencja, styl: 's', waga: 3 }] }) }] };
    };
    const zapisy = [];
    const k = await G.generuj(64, { klient: { messages: { create }, beta: { messages: { create } } }, log: () => {}, poPartii: (l) => zapisy.push(l.length) });
    assert.equal(n, 1, 'po stopie bez kolejnych wywołań API');
    assert.equal(k.length, 1, 'zapłacone pytanie zostaje');
    assert.deepEqual(zapisy, [1]);
  } finally { delete process.env.CLAUDE_BUDZET_PLIK; }
});

test('dopiszNagrania: tylko brakujące, bez ms; ręczne i istniejące nietknięte', async () => {
  const G = await zaladuj('tools/lawka-generator.mjs');
  const ci = { _recznie_3_11: 'uwaga', stare: { intencja: 'fakt' } };
  assert.equal(G.dopiszNagrania(ci, { stare: { intencja: 'moj_plan', ms: 5 }, nowe: { intencja: 'porada', pewnosc: 1, ms: 700 }, _x: { intencja: 'y' } }), 1);
  assert.deepEqual(ci, { _recznie_3_11: 'uwaga', stare: { intencja: 'fakt' }, nowe: { intencja: 'porada', pewnosc: 1 } });
});

test('noc: próbka wygenerowanych ma stały rozmiar, zmienia się z datą, a w ~10 nocy obejmuje cały zestaw; ręczne nie wchodzą do próbki', () => {
  const { probkaNocy } = require('./_lawka-v2.js');
  const P = [{ p: 'reczne', zrodlo: undefined }, ...Array.from({ length: 1500 }, (_, i) => ({ p: 'g' + i, zrodlo: 'claude' }))];
  const a = probkaNocy(P, '2026-11-05'), b = probkaNocy(P, '2026-11-06');
  assert.equal(a.length, 150); assert.ok(a.every((w) => w.zrodlo === 'claude')); assert.notDeepEqual(a.map((w) => w.p), b.map((w) => w.p));
  const widziane = new Set(); for (let d = 1; d <= 10; d++) for (const w of probkaNocy(P, `2026-11-${String(d).padStart(2, '0')}`)) widziane.add(w.p);
  assert.equal(widziane.size, 1500, 'dziesięć nocy = cały zestaw');
  assert.equal(probkaNocy(P.slice(0, 11), '2026-11-05').length, 10, 'mniej niż próbka = wszystkie');
});

test('przebieg równoległy: ta sama kolejność i te same wyniki co sekwencyjny; własny klasyfikator liczy się w śladzie', async () => {
  const { przebieg, PYTANIA } = require('./_lawka-v2.js');
  const proba = PYTANIA.slice(0, 40);
  const a = await przebieg(proba), b = await przebieg(proba, { rownolegle: 6 });
  assert.deepEqual(b.map((r) => [r.p, r.slad, r.pasuje]), a.map((r) => [r.p, r.slad, r.pasuje]));
  let wywolan = 0;
  const w = await przebieg([{ p: 'zupelnie niejasne pytanie xyz', kat: 'poza', waga: 1, oczekiwane: 'x' }], { rozumienieFn: async () => { wywolan++; return { intencja: 'nie_wiem', pewnosc: 0, dopytac: true, kandydaci: [], sloty: {}, tok: { we: 1, wy: 1 } }; } });
  assert.equal(wywolan, 1); assert.equal(w[0].rozIntencja, 'nie_wiem');
});

test('sekcja wygenerowana: wstawiona przed końcem PYTANIA, ponowny zapis podmienia ją w miejscu; apostrofy i `po` to poprawny JS', async () => {
  const G = await zaladuj('tools/lawka-generator.mjs');
  const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'lawka-plik-'));
  const plik = path.join(kat, '_lawka-v2-pytania.js');
  fs.copyFileSync(path.join(KORZEN, 'tests/_lawka-v2-pytania.js'), plik);
  const ile = require(plik).PYTANIA.length; delete require.cache[require.resolve(plik)];
  const kand = [{ id: 'k0001', p: "what's my plan 'jutro'?", intencja: 'moj_plan', kat: 'wlasne', waga: 4 },
    { id: 'k0002', p: 'a w grudniu?', po: ['ile przebieglem w listopadzie'], intencja: 'moje_treningi', kat: 'wlasne', waga: 3 }];
  G.zapiszSekcje(plik, kand);
  let P = require(plik).PYTANIA; delete require.cache[require.resolve(plik)];
  assert.equal(P.length, ile + 2);
  assert.equal(P[P.length - 2].p, "what's my plan 'jutro'?"); assert.equal(P[P.length - 1].oczekiwane, 'router:moje_treningi'); assert.deepEqual(P[P.length - 1].po, ['ile przebieglem w listopadzie']);
  G.zapiszSekcje(plik, kand, { k0001: 'siec' });
  P = require(plik).PYTANIA; delete require.cache[require.resolve(plik)];
  assert.equal(P.length, ile + 2, 'drugi zapis podmienia sekcję, nie dubluje');
  assert.equal(P[P.length - 2].luka, 'gen'); assert.equal(P[P.length - 2].uwaga, 'dziś: siec'); assert.equal(P[P.length - 1].luka, undefined);
  assert.equal(fs.readFileSync(plik, 'utf8').split(G.ZNACZNIK_OD).length - 1, 1);
});
