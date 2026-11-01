/* BLIZNA 73 (1.11.2026, M3a — numer wg projektu M3 v2; do v2 plik nazywał się blizna-72): biegi_nadchodzace — kalendarz imprez z maszyny wyników F6 w okienku.

   Ryzyka:
   1) ZŁE PYTANIE W ZŁYM NARZĘDZIU. „Kto wygrał maraton w Berlinie?" to wynik, nie termin — nie może trafić do
      kalendarza (i odpowiedzieć „Maszyna wyników nie ma biegów…"). Tak samo trasy, zapisy, „moje"/„mam".
   2) ODMIANA. „w Poznaniu", „pod Środą" — F6 p_q szuka podciągu i nie trafi w „Poznań"; EF filtruje po rdzeniu.
   3) „maraton" zawiera „mar" — nie wolno go wziąć za marzec.
   4) Zakres > 366 dni → 400; ≤ 10 kart; karta bez linków zewnętrznych; 429 F6 → „Maszyna wyników jest teraz zajęta".
   5) Pusto = „Maszyna wyników nie ma biegów w tym zakresie." — granica naszych danych, nie świata. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8');
const DZIS = '2026-11-01';

const IMPREZY = [
  { group_key: 'a', name: '12. Poznański Bieg Niepodległości', event_date: '2026-11-11', city: 'Poznań', distances: [10], source_url: 'https://www.dostartu.pl/x' },
  { group_key: 'b', name: 'Bieg Mikołajkowy', event_date: '2026-12-06', city: 'Poznań', distances: [5, 10], source_url: 'https://b4sport.pl/y' },
  { group_key: 'c', name: 'Półmaraton Jesienny', event_date: '2026-11-15', city: 'Kraków', distances: [21.0975], source_url: 'https://x.pl' },
  { group_key: 'd', name: 'Bieg pod Środą', event_date: '2026-11-20', city: 'Środa Wielkopolska', distances: [10], source_url: null },
  { group_key: 'e', name: 'Maraton Zimowy', event_date: '2027-02-14', city: 'Warszawa', distances: [42.195], source_url: 'https://y.pl' },
  { group_key: 'f', name: 'Bieg poza zakresem', event_date: '2026-10-30', city: 'Poznań', distances: [10], source_url: null },
];
function f6Atrapa({ wiersze = IMPREZY, status = 200 } = {}) {
  const wolania = [];
  return { wolania, fetchFn: async (url, init) => {
    wolania.push({ url, init, args: JSON.parse(init.body) });
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    const a = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => (typeof wiersze === 'function' ? wiersze(a) : wiersze) };
  } };
}

test('router: 10 zdań (bez polskich znaków, z literówkami) → biegi_nadchodzace z parametrami', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const P = [
    ['jakie biegi w listopadzie w poznaniu', { od: '2026-11-01', do: '2026-11-30', miejsce: 'poznaniu', przy: 'w' }],
    ['gdzie pobiec dyche w grudnu', { dystans: '10', od: '2026-12-01', do: '2026-12-31' }],
    ['biegi pod Sroda', { miejsce: 'Sroda', przy: 'pod' }],
    ['jakie zawody we wroclawu?', { miejsce: 'wroclawu', przy: 'we' }],
    ['maraton w lutym', { dystans: '42', od: '2027-02-01', do: '2027-02-28' }],
    ['polmaraton w krakowie w marcu', { dystans: '21', od: '2027-03-01', do: '2027-03-31', miejsce: 'krakowie', przy: 'w' }],
    ['gdzie pobiec 5 km', { dystans: '5' }],
    ['biegi w okolicach gdanska', { miejsce: 'gdanska', przy: 'w okolicach' }],
    ['jakie biegi w weekend', {}],
    ['zawody na slasku w styczniu', { od: '2027-01-01', do: '2027-01-31', miejsce: 'slasku', przy: 'na' }],
  ];
  for (const [t, args] of P) assert.deepEqual(R.dopasuj(t, DZIS), { narzedzie: 'biegi_nadchodzace', args }, t);
});

test('router: wyniki, trasy, zapisy, własne starty i osoby NIE idą do kalendarza', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  for (const t of ['Kto wygrał maraton w Berlinie?', 'trasa maratonu w Poznaniu', 'zapisy na bieg w Krakowie', 'moje biegi w listopadzie',
    'jak pobiegłem w Dębnie', 'wyniki biegu w Poznaniu', 'Katarzyna Chojnacka', 'ile km w listopadzie'])
    assert.notEqual((R.dopasuj(t, DZIS) || {}).narzedzie, 'biegi_nadchodzace', t);
  assert.equal(R.dopasuj('Kiedy mam start?', DZIS).narzedzie, 'moje_starty');
});

test('walidacja: zakres > 366 dni / od po do / zły dystans / złe miejsce → błąd (400 w EF)', async () => {
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  assert.equal(N.waliduj('biegi_nadchodzace', { od: '2026-11-01', do: '2027-11-02' }).ok, false);
  assert.equal(N.waliduj('biegi_nadchodzace', { od: '2026-11-01', do: '2027-11-01' }).ok, true, '366 dni');
  assert.equal(N.waliduj('biegi_nadchodzace', { od: '2026-12-01', do: '2026-11-01' }).ok, false);
  assert.equal(N.waliduj('biegi_nadchodzace', { dystans: '15' }).ok, false);
  assert.equal(N.waliduj('biegi_nadchodzace', { miejsce: 'Poznań<script>' }).ok, false);
  assert.equal(N.waliduj('biegi_nadchodzace', { miejsce: 'Poznań', przy: 'za' }).ok, false);
  assert.deepEqual(N.waliduj('biegi_nadchodzace', { miejsce: 'Środa Wielkopolska', inne: 1 }).args, { miejsce: 'Środa Wielkopolska' });
  assert.ok(N.NAZWY.includes('biegi_nadchodzace'), 'deklaracja dla modelu');
});

test('F6: zakres do F6, miasto po rdzeniu w EF (Poznaniu → Poznań/Poznański, Środą → Środa), dystans, daty poza zakresem odpadają', async () => {
  const B = await zaladuj('supabase/functions/okienko/biegi.mjs');
  const F = await zaladuj('supabase/functions/okienko/f6.mjs');
  F._wyczyscPamiecF6();
  const a = f6Atrapa();
  const w = await B.biegiNadchodzace(a.fetchFn, 'TOK', { od: '2026-11-01', do: '2026-11-30', miejsce: 'Poznaniu' });
  assert.deepEqual(w.biegi.map((b) => b.nazwa), ['12. Poznański Bieg Niepodległości']);
  assert.equal(w.liczba, 1);
  assert.deepEqual(a.wolania[0].args, { p_from: '2026-11-01', p_to: '2026-11-30', lim: 300 });
  assert.equal(a.wolania[0].init.headers.Authorization, 'Bearer TOK');
  assert.match(a.wolania[0].url, /^https:\/\/api\.biegamy\.run\/rpc\/upcoming_races$/);
  F._wyczyscPamiecF6();
  assert.deepEqual((await B.biegiNadchodzace(f6Atrapa().fetchFn, 'T', { od: '2026-11-01', do: '2026-12-31', miejsce: 'Środą' })).biegi.map((b) => b.miasto), ['Środa Wielkopolska']);
  F._wyczyscPamiecF6();
  assert.deepEqual((await B.biegiNadchodzace(f6Atrapa().fetchFn, 'T', { od: '2026-11-01', do: '2027-03-01', dystans: '21' })).biegi.map((b) => b.nazwa), ['Półmaraton Jesienny']);
  assert.equal(B.rdzen('Poznaniu'), 'pozna'); assert.equal(B.rdzen('Gdyni'), 'gdyn'); assert.equal(B.rdzen('Krakowie'), 'krako');
});

test('F6 ucięte (300 wierszy) → drugie zapytanie z p_q = rdzeń; ≤ 10 kart; bez linków (tylko domena jako tekst)', async () => {
  const B = await zaladuj('supabase/functions/okienko/biegi.mjs');
  const F = await zaladuj('supabase/functions/okienko/f6.mjs');
  F._wyczyscPamiecF6();
  const duzo = Array.from({ length: 300 }, (_, i) => ({ group_key: 'g' + i, name: 'Bieg ' + i, event_date: '2026-11-1' + (i % 9), city: 'Gniezno', distances: [5], source_url: 'https://z.pl/' + i }));
  const a = f6Atrapa({ wiersze: (args) => (args.p_q ? IMPREZY.slice(0, 2) : duzo) });
  const w = await B.biegiNadchodzace(a.fetchFn, 'T', { od: '2026-11-01', do: '2026-12-31', miejsce: 'Poznaniu' });
  assert.equal(a.wolania.length, 2); assert.equal(a.wolania[1].args.p_q, 'pozna');
  assert.equal(w.liczba, 2);
  F._wyczyscPamiecF6();
  const wszystkie = await B.biegiNadchodzace(f6Atrapa({ wiersze: duzo }).fetchFn, 'T', { od: '2026-11-01', do: '2026-12-31' });
  assert.equal(wszystkie.liczba, 300); assert.equal(wszystkie.biegi.length, 10);
  for (const b of wszystkie.biegi) { assert.ok(!('source_url' in b) && !('url' in b)); assert.equal(b.zrodlo_domena, 'z.pl'); }
});

test('zdania: „W listopadzie w Poznaniu maszyna wyników zna N biegów."; pusto; 429 → maszyna zajęta', async () => {
  const { zWyniku } = await zaladuj('supabase/functions/okienko/odpowiedz.mjs');
  const jeden = { nazwa: 'X', data: '2026-11-11', miasto: 'Poznań', dystanse: [10], zrodlo_domena: 'a.pl' };
  assert.equal(zWyniku('biegi_nadchodzace', { od: '2026-11-01', do: '2026-11-30', miejsce: 'Poznaniu', przy: 'w', liczba: 4, biegi: [jeden] }).zdania[0],
    'W listopadzie w Poznaniu maszyna wyników zna 4 biegi.');
  assert.equal(zWyniku('biegi_nadchodzace', { od: '2026-12-01', do: '2026-12-31', dystans_km: 10, liczba: 12, biegi: [] }).zdania[0], 'W grudniu na 10 km maszyna wyników zna 12 biegów.');
  assert.equal(zWyniku('biegi_nadchodzace', { od: '2026-11-01', do: '2027-01-30', liczba: 1, biegi: [jeden] }).zdania[0], 'Od 1.11 do 30.01 maszyna wyników zna 1 bieg.');
  assert.deepEqual(zWyniku('biegi_nadchodzace', { od: '2026-11-01', do: '2026-11-30', liczba: 0, biegi: [] }).zdania, ['Maszyna wyników nie ma biegów w tym zakresie.']);
  assert.deepEqual(zWyniku('biegi_nadchodzace', { blad_f6: 'limit', liczba: 0, biegi: [] }).zdania, ['Maszyna wyników jest teraz zajęta — spróbuj za chwilę.']);
  assert.equal(zWyniku('biegi_nadchodzace', { od: '2026-11-01', do: '2026-11-30', liczba: 1, biegi: [jeden] }).karty[0].typ, 'impreza');
});

test('wykonaj: token użytkownika z EF (nie od modelu), 429 → blad_f6, brak tokenu → wyjątek; EF przekazuje f6ctx w routerze i modelu', async () => {
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const F = await zaladuj('supabase/functions/okienko/f6.mjs');
  F._wyczyscPamiecF6();
  const teraz = new Date('2026-11-01T10:00:00Z');
  const w = await N.wykonaj(null, 'ja', 'biegi_nadchodzace', {}, teraz, { fetchFn: f6Atrapa({ status: 429 }).fetchFn, token: 'T' });
  assert.equal(w.blad_f6, 'limit'); assert.equal(w.od, '2026-11-01'); assert.equal(w.do, '2027-01-30', 'domyślnie +90 dni');
  await assert.rejects(N.wykonaj(null, 'ja', 'biegi_nadchodzace', {}, teraz, null));
  const ef = czytaj('supabase', 'functions', 'okienko', 'index.ts');
  assert.match(ef, /wykonaj\(sb, ath\.id, traf\.narzedzie, w\.args, teraz, \{ fetchFn: fetch, token: jwt \}\)/);
  assert.match(ef, /f6ctx: \{ fetchFn: fetch, token: jwt \}/);
  assert.match(czytaj('supabase', 'functions', 'okienko', 'model.mjs'), /wykonaj\(sb, athleteId, fc\.name, w\.args, teraz, f6ctx\)/);
});

test('UI: karta imprezy bez <a> i bez href, tekst escapowany, dystanse po polsku', () => {
  const okno = { escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) };
  const ctx = vm.createContext({ window: okno, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: {}, setTimeout, console });
  vm.runInContext(czytaj('js', 'okienko.js'), ctx);
  const html = okno.OKIENKO.htmlOdpowiedzi(200, { tryb: 'router', zdania: ['W listopadzie maszyna wyników zna 2 biegi.'], karty: [
    { typ: 'impreza', dane: { nazwa: '<b>Bieg</b>', data: '2026-11-11', miasto: 'Poznań', dystanse: [5, 21.0975, 42.195], zrodlo_domena: 'dostartu.pl' } }] });
  assert.ok(!/<a\b|href=/.test(html), html);
  assert.ok(html.includes('&lt;b&gt;Bieg&lt;/b&gt;'));
  assert.match(html, /11\.11\.2026 · Poznań · 5 km, półmaraton, maraton/);
  assert.match(html, /źródło: dostartu\.pl/);
});
