/* BLIZNA 112 (3.11.2026, test Filipa 2.11 22:37: „Na kogo zbiorka" → model → znajomi_tydzien → profil znajomego; „co odwaliłeś" → osoby_z_miasta).
   a) KAŻDA forma zbiórk…, zbiera…, „na kogo”, „dla kogo”, „komu” → zagadka przed startem, karta akcji po starcie — nigdy tryb osoby ani model;
   b) reakcje i meta („co odwaliłeś", „źle", „nie o to pytałem", „bez sensu", „głupie", „co ty gadasz", „nie rozumiesz") → stałe zdanie
      + 3–4 chipy (etykieta → pytanie), log jako feedback z poprzednim pytaniem, bez narzędzi;
   c) niska pewność: bez liter / 1–2 słowa bez trafienia → chipy „Chodzi Ci o…?"; narzędzia o ludziach (znajomi_tydzien, osoby_z_miasta)
      tylko z routera — model ich nie widzi; tryb osoby tylko przy imieniu/nazwisku (blizna-107);
   d) klient rysuje chipy z odpowiedzi tym samym przyciskiem co podpowiedzi (data-pytanie). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const R = () => import(pathToFileURL(path.join(KORZEN, 'supabase/functions/okienko/router.mjs')).href);
const DZIS = '2026-11-05';

test('a) zbiórka w każdej formie → zagadka / karta akcji; nigdy osoba', async () => {
  const r = await R(); const A = globalThis.BM_AKCJA_CYTATY; const O = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/okienko/osoba.mjs')).href);
  const Q = ['Na kogo zbiorka', 'Na kogo zbiórki', 'na kogo jest zbiórka', 'dla kogo jest ta zbiorka', 'komu pomagamy', 'na co zbieracie pieniadze', 'zbiórka', 'na co idzie kasa ze zbiorki', 'Stary zapytałem na kogo zbiórka a ty dajesz profil Macieja', 'kto zbiera i na co'];
  try {
    A.ustawStan({ ruszyla: false });
    for (const q of Q) { const x = r.dopasuj(q, DZIS); assert.equal(x && x.log, 'zagadka', q); assert.ok(A.ZAGADKI.includes(x.zdanie), 'zagadka z listy: ' + q); assert.equal(r.czyZagadka(q), true, 'czyZagadka: ' + q); }
    const ef = czytaj('supabase/functions/okienko/index.ts'); assert.ok(ef.indexOf('const traf = dopasuj(tekst, dzis);') < ef.indexOf('const os = osobaZPytania(tekst);'), 'router (zagadka) przed trybem osoby');
    assert.equal(typeof O.osobaZPytania, 'function');
    A.ustawStan({ ruszyla: true });
    for (const q of Q) assert.deepEqual(r.dopasuj(q, DZIS), { zdanie: A.PO_STARCIE, log: 'zagadka' }, 'po starcie: ' + q);
    for (const q of ['ile mam km w tym tygodniu', 'plan na jutro', 'kto biega z mojego miasta']) assert.notEqual((r.dopasuj(q, DZIS) || {}).log, 'zagadka', q);
  } finally { A.ustawStan({ ruszyla: false }); }
});

test('b) reakcje → stałe zdanie + chipy, log feedback; zbiórka w reakcji wygrywa (pytanie ważniejsze niż ton)', async () => {
  const r = await R();
  for (const q of ['co odwaliłeś', 'Co ty odwaliłeś?', 'źle', 'nie o to pytałem', 'bez sensu', 'głupie', 'co ty gadasz', 'nie rozumiesz', 'bzdura', 'stary, zapytałem o plan a ty co']) {
    const x = r.dopasuj(q, DZIS); assert.ok(x && x.log === 'reakcja', q); assert.equal(x.zdanie, r.ODP_NIEZROZUMIALEM); assert.equal(x.feedback, true);
    assert.deepEqual(x.chipy.map((c) => c.etykieta), ['Mój plan', 'Moje treningi', 'Wyniki', 'Biegi w kalendarzu']);
  }
  for (const c of r.CHIPY_WYBORU) assert.notEqual(r.dopasuj(c.pytanie, DZIS), null, 'chip „' + c.etykieta + '" prowadzi do narzędzia routera: ' + c.pytanie);
  for (const q of ['zle mi sie biega po 10 km', 'nie rozumiem tsb', 'co to jest forma', 'nie tak szybko jak chcialem', 'nie wiem czy biec jutro']) assert.notEqual((r.dopasuj(q, DZIS) || {}).log, 'reakcja', 'nie reakcja: ' + q);
  const ef = czytaj('supabase/functions/okienko/index.ts');
  assert.match(ef, /powod_odrzucenia: poprz \? "feedback: " \+ poprz : null/, 'feedback z poprzednim pytaniem w logu');
  assert.match(ef, /function poprzedniePytanie\(traf: unknown, historia: unknown\): string \{[\s\S]*?\.feedback[\s\S]*?historia\[historia\.length - 1\][\s\S]*?\.slice\(0, 120\)/, 'tylko ostatnie pytanie klienta, ucięte do 120 znaków');
  assert.match(ef, /chipy: \(traf as \{ chipy\?: unknown\[\] \}\)\.chipy \|\| \[\]/);
});

test('c) niska pewność → chipy (0 tokenów) przed modelem; narzędzia o ludziach tylko z routera', async () => {
  const r = await R();
  for (const q of ['???', '12', '🏃‍♂️', 'bieg', 'no', 'dzieki', 'maciej', 'ok', 'hmm', 'start']) assert.equal(r.czyNiepewne(q), true, q);
  for (const q of ['plan na jutro', 'ile mam km', 'kim jest Kipchoge', 'jakie biegi', 'moje wyniki', 'tempo 5:30', 'co to jest tsb']) assert.equal(r.czyNiepewne(q), false, 'pewne: ' + q);
  const ef = czytaj('supabase/functions/okienko/index.ts');
  const iNiep = ef.indexOf('if (czyNiepewne(tekst)) {'), iKat = ef.indexOf('szukajWKatalogu(sb, tekst)'), iModel = ef.indexOf('zapytajModel({');
  assert.ok(iNiep > iKat && iNiep < iModel, 'bramka po katalogu, przed pamięcią sieci i modelem');
  const n = czytaj('supabase/functions/okienko/narzedzia.mjs');
  assert.match(n, /export const TYLKO_ROUTER = new Set\(\["znajomi_tydzien", "osoby_z_miasta"\]\);/);
  assert.match(czytaj('supabase/functions/okienko/model.mjs'), /tools: \[\{ functionDeclarations: DEKLARACJE_MODELU \}\]/);
  assert.doesNotMatch(czytaj('supabase/functions/okienko/model.mjs'), /functionDeclarations: DEKLARACJE \}/);
  assert.equal((r.dopasuj('kto biega z mojego miasta', DZIS) || {}).narzedzie, 'osoby_z_miasta', 'router nadal umie: jawne „z mojego miasta"');
  assert.equal((r.dopasuj('moi znajomi', DZIS) || {}).narzedzie, 'znajomi_tydzien');
});

test('d) klient: chipy z odpowiedzi jako data-pytanie (etykieta na przycisku), ≤ 4, tylko poprawne pary', () => {
  const k = czytaj('js/okienko.js');
  assert.match(k, /if \(Array\.isArray\(json\.chipy\) && json\.chipy\.length\) html \+= '<div class="okn-chipy">' \+ json\.chipy\.slice\(0, 4\)\.filter\(function \(c\) \{ return c && typeof c\.pytanie === 'string' && typeof c\.etykieta === 'string'; \}\)/);
  assert.match(k, /data-pytanie="' \+ esc\(c\.pytanie\) \+ '">' \+ esc\(c\.etykieta\) \+ '<\/button>'/);
});
