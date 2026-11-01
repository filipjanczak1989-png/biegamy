/* BLIZNA 80 (1.11.2026, M3-0b „puste znaczy coś"): osoba bez trafień dostaje odpowiedź informacyjną, nie model.

   Diagnoza wpisu 16:04:34 (1.11): brak konta w BiegaMy (nie is_public=false), F6 0 wyników dla imienia i nazwiska,
   1 osoba pod samym nazwiskiem (inne imię) — pytający dostał ścieżkę modelu (flash) i nic konkretnego.

   Ryzyka:
   1) KOSZT. Brak trafień = 0 tokenów: EF zwraca odpowiedź trybu osoba PRZED pamięcią/limitami/modelem.
   2) PRAWDA WARUNKOWA. „W BiegaMy nie ma nikogo…" tylko gdy odczyt profili się udał; „Maszyna nie zna startów…" tylko
      gdy F6 odpowiedziało (nie przy 429/awarii). Nic nie da się powiedzieć → ODP_NIC.
   3) ZBIÓR JAK W SPOŁECZNOŚCI. Profile bez filtra is_public — decyduje RLS (zawodnik: publiczne; trener: + swoi);
      prywatny ze znacznikiem, karta nie niesie nic poza imieniem i nazwiskiem.
   4) BEZ ZAPROSZEŃ. Mechanizmu „Zaproś do BiegaMy" w aplikacji nie ma (zwiad 1.11) — żadnego przycisku z pustą obietnicą. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');
const { tekstDlaOkna } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8');
const f6 = (status = 200, wiersze = []) => ({ fetchFn: async () => ({ ok: status === 200, status, json: async () => wiersze }) });
async function odp(O, { q = 'Zenon Nieistniejący', baza = { athletes: [] }, f = f6(), sb = atrapa(baza) } = {}) {
  (await zaladuj('supabase/functions/okienko/f6.mjs'))._wyczyscPamiecF6();
  const siec = [];
  const o = await O.odpowiedzOsoba({ sb, athleteId: JA, fetchFn: f.fetchFn, token: 'T', q, wprost: false, sieciDozwolona: async () => true,
    siec: async (t) => { siec.push(t); return { zdania: [], zrodla: [], tok: { we: 0, wy: 0 }, zapytania: 1 }; } });
  return { o, siec, sb };
}

test('brak konta i brak startów → dwa zdania prawdy, 0 tokenów, bez sieci, bez kart', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const { o, siec } = await odp(O);
  assert.deepEqual(o.zdania, ['W BiegaMy nie ma nikogo o tym imieniu i nazwisku.', 'Maszyna wyników nie zna startów pod tym nazwiskiem — sprawdź pisownię.']);
  assert.equal(o.nic, true); assert.deepEqual(o.karty, []); assert.deepEqual(o.tok, { we: 0, wy: 0 }); assert.equal(siec.length, 0);
});

test('zdanie tylko gdy dotyczy: F6 429 → zajęta (bez „sprawdź pisownię"); F6 awaria → tylko zdanie o BiegaMy; wszystko padło → ODP_NIC', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  assert.deepEqual((await odp(O, { f: f6(429) })).o.zdania, [O.ODP_F6_ZAJETA]);
  assert.deepEqual((await odp(O, { f: f6(500) })).o.zdania, [O.ODP_BRAK_W_BIEGAMY]);
  const sbZly = { from: () => { throw new Error('athletes'); } };
  assert.deepEqual((await odp(O, { f: f6(500), sb: sbZly })).o.zdania, [O.ODP_NIC]);
});

test('profile jak w Społeczności: bez filtra is_public (RLS), prywatny ze znacznikiem; znaleziony profil = brak zdania o BiegaMy', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const U = '11111111-1111-4111-8111-111111111111';
  const { o, sb } = await odp(O, { q: 'Zenon Testowy', baza: { athletes: [{ id: U, full_name: 'Zenon Testowy', is_public: false }], friendships: [] } });
  assert.ok(sb.zapytania.some((z) => z.nazwa === 'athletes' && z.is_public === undefined), 'filtr is_public w zapytaniu — Społeczność go nie ma');
  assert.deepEqual(o.karty.map((k) => [k.typ, k.dane.prywatny]), [['osoba', true]]);
  assert.ok(!o.zdania.includes(O.ODP_BRAK_W_BIEGAMY));
  assert.deepEqual(Object.keys(o.karty[0].dane).sort(), ['id', 'nazwa', 'prywatny', 'znajomosc'], 'karta nie niesie nic poza imieniem i nazwiskiem');
  const Z = czytaj('zawodnik.html');
  const i = Z.indexOf('async function _doSearch(q)');
  assert.ok(!/eq\('is_public'/.test(Z.slice(i, Z.indexOf('.ilike(', i))), 'Społeczność też bez filtra is_public w zapytaniu');
});

test('EF: tryb osoby kończy pytanie przed pamięcią, limitami i modelem; log „brak trafień: odpowiedź informacyjna"; bez przycisku zaproszeń', () => {
  const ef = czytaj('supabase', 'functions', 'okienko', 'index.ts');
  const start = ef.indexOf('const os = osobaZPytania(tekst);');
  const blok = ef.slice(start, ef.indexOf('const imp = imprezaZPytania(tekst);'));
  assert.match(blok, /return odp\(200, \{ \.\.\.pusto\("osoba"\)/);
  assert.ok(!/if \(!o\.nic\)/.test(blok), 'warunkowy return z M3-0 — brak trafień szedł do modelu');
  assert.match(blok, /"brak trafień: odpowiedź informacyjna"/);
  for (const dalej of ['zPamieci(adm', 'sprawdzLimity(', 'zapytajModel({']) assert.ok(start < ef.indexOf(dalej), dalej);
  const ui = czytaj('js', 'okienko.js');
  assert.ok(!/Zapro[sś] do BiegaMy|data-zapros/.test(ui), 'przycisk zaproszeń bez mechanizmu');
  assert.match(ui, /d\.prywatny \? 'profil prywatny' : 'profil w BiegaMy'/);
});

test('UI: karta prywatnego profilu — znacznik, te same przyciski co publiczny', () => {
  const okno = { BM_TEKST: tekstDlaOkna(), escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) };
  const ctx = vm.createContext({ window: okno, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: {}, setTimeout, console });
  vm.runInContext(czytaj('js', 'okienko.js'), ctx);
  const html = okno.OKIENKO.htmlOdpowiedzi(200, { tryb: 'osoba', zdania: [], karty: [{ typ: 'osoba', dane: { id: '11111111-1111-4111-8111-111111111111', nazwa: 'Zenon Testowy', prywatny: true, znajomosc: null } }] });
  assert.match(html, /profil prywatny/); assert.match(html, /data-osoba="znajomy"/); assert.match(html, /data-osoba="profil"/);
});
