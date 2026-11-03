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
