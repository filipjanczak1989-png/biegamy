/* BLIZNA 74 (1.11.2026, M3 v2 / M3a): tryb „impreza" — kalendarz maszyny (adapter) + nasze starty + sieć.

   Ryzyka:
   1) DWA KODY KALENDARZA. Impreza i lista biegów mają iść przez JEDEN adapter (kalendarz.mjs) — przepięcie na
      events_search (K-API) zmienia jeden plik. Okienko nie woła upcoming_races z p_q nigdzie poza adapterem.
   2) ODMIANA. „trasa ultrakotliny" musi trafić w „Ultrakotlina" (rdzeń do F6, filtr lokalny po rdzeniach).
   3) WYNIK ≠ IMPREZA. „Kto wygrał maraton w Berlinie?" nie jest imprezą (zostaje ścieżka sieci jak dziś).
   4) SIEĆ. Dla imprezy dozwolona (nazwa biegu), ale NIE gdy pytanie wygląda na imię i nazwisko, a kalendarz go
      nie zna. Pamięć 24 h trafiona → bez sieci. Źródła → znaleziska ze statusem „kalendarz".
   5) Bez słowa z listy i bez trafień → null (pytanie idzie dalej, nie ślepa uliczka).
   6) 429 F6 → „Maszyna wyników jest teraz zajęta", reszta zostaje; karty kalendarza bez linków zewnętrznych. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { atrapa } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8');
const DZIS = '2026-11-01';

const KALENDARZ = [
  { group_key: 'uk', name: 'Ultrakotlina 2027', event_date: '2027-06-12', city: 'Lądek-Zdrój', distances: [26, 52, 110], source_url: 'https://ultrakotlina.pl/x' },
  { group_key: 'mw', name: '49. Maraton Warszawski', event_date: '2027-09-26', city: 'Warszawa', distances: [42.195], source_url: 'https://maratonwarszawski.com' },
];
function f6Atrapa({ wiersze = KALENDARZ, status = 200 } = {}) {
  const wolania = [];
  return { wolania, fetchFn: async (url, init) => {
    const a = JSON.parse(init.body); wolania.push({ url, args: a, auth: init.headers.Authorization });
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => wiersze.filter((w) => !a.p_q || (w.name + ' ' + w.city).toLowerCase().includes(String(a.p_q).toLowerCase())) };
  } };
}
async function odp(I, { q, jawne = true, f6 = f6Atrapa(), races = [], pam = null, dozwolona = true } = {}) {
  (await zaladuj('supabase/functions/okienko/f6.mjs'))._wyczyscPamiecF6();
  const s = { siec: [], doPam: [], znal: [] };
  const sb = atrapa({ races });
  const o = await I.odpowiedzImpreza({ sb, fetchFn: f6.fetchFn, token: 'TOK', q, jawne, dzis: DZIS,
    sieciDozwolona: async () => dozwolona,
    siec: async (t) => { s.siec.push(t); return { zdania: ['Bieg górski w Lądku.'], zrodla: [{ tytul: 'ultrakotlina.pl', url: 'https://vertexaisearch.cloud.google.com/r/1' }], tok: { we: 9, wy: 3 }, zapytania: 1 }; },
    zPamieci: async () => pam, doPamieci: async (z, zr) => { s.doPam.push([z, zr]); }, znaleziska: async (w) => { s.znal.push(...w); } });
  return { o, s, f6, sb };
}

test('detektor: słowo z listy + nazwa; wyniki/rekordy/moje — nie; samo „ultrakotlina" → impreza (ultra*)', async () => {
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  assert.deepEqual(I.imprezaZPytania('bieg ultrakotlina'), { q: 'ultrakotlina', jawne: true });
  assert.deepEqual(I.imprezaZPytania('maraton warszawski kiedy'), { q: 'maraton warszawski', jawne: true });
  assert.deepEqual(I.imprezaZPytania('trasa ultrakotliny'), { q: 'ultrakotliny', jawne: true });
  assert.deepEqual(I.imprezaZPytania('Kotlina Kłodzka'), { q: 'Kotlina Kłodzka', jawne: false }, 'bez słowa z listy — wymaga trafienia');
  for (const t of ['Kto wygrał maraton w Berlinie?', 'wyniki maratonu', 'moje biegi', 'plan na jutro', 'ile km', 'jakie mam odznaki', '2026'])
    assert.equal(I.imprezaZPytania(t), null, t);
});

test('kalendarz przez adapter: rdzeń do F6, odmiana trafia („ultrakotliny" → Ultrakotlina), zakres dziś…+366, token użytkownika', async () => {
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  const { o, f6 } = await odp(I, { q: 'ultrakotliny' });
  assert.equal(f6.wolania.length, 1);
  assert.deepEqual(f6.wolania[0].args, { p_from: '2026-11-01', p_to: '2027-11-02', p_q: 'ultrakotl', lim: 20 });
  assert.match(f6.wolania[0].url, /\/rpc\/upcoming_races$/); assert.equal(f6.wolania[0].auth, 'Bearer TOK');
  const k = o.karty.filter((x) => x.typ === 'impreza');
  assert.deepEqual(k.map((x) => [x.dane.nazwa, x.dane.miejscowosc, x.dane.data]), [['Ultrakotlina 2027', 'Lądek-Zdrój', '2027-06-12']]);
  assert.ok(!('source_url' in k[0].dane) && !('url' in k[0].dane), 'karta bez linku');
  assert.equal(k[0].dane.zrodlo_domena, 'ultrakotlina.pl');
});

test('sieć dozwolona dla imprezy: zdania ze źródłami → pamięć + znaleziska ze statusem „kalendarz"; kolejność zdania → kalendarz → nasze', async () => {
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  const races = [{ id: 'r1', name: 'Ultrakotlina', date: '2027-06-13', city: 'Lądek-Zdrój', status: 'approved' }];
  const { o, s } = await odp(I, { q: 'ultrakotlina', races });
  assert.equal(s.siec.length, 1); assert.match(s.siec[0], /^Ultrakotlina bieg — termin, dystanse, miejsce$/);
  assert.deepEqual(o.zdania, ['Bieg górski w Lądku.']); assert.equal(o.zrodla.length, 1);
  assert.equal(s.doPam.length, 1);
  assert.equal(s.znal.length, 1); assert.equal(s.znal[0].status, 'kalendarz'); assert.equal(s.znal[0].rok, 2027);
  assert.deepEqual(o.karty.map((k) => k.typ), ['start_nasz'], 'dedup: nasz start (data ±1, ta sama nazwa bez numeru edycji) zastępuje kalendarzowy');
});

test('pamięć 24 h trafiona → bez sieci; limit sieci → bez sieci, karty zostają', async () => {
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  const z = await odp(I, { q: 'ultrakotlina', pam: { zdania: ['Z pamięci.'], zrodla: [{ tytul: 'a.pl', url: 'https://a.pl' }] } });
  assert.equal(z.s.siec.length, 0); assert.deepEqual(z.o.zdania, ['Z pamięci.']); assert.equal(z.o.z_pamieci, true);
  const l = await odp(I, { q: 'ultrakotlina', dozwolona: false });
  assert.equal(l.s.siec.length, 0); assert.equal(l.o.karty.length, 1); assert.deepEqual(l.o.zdania, []);
});

test('imię i nazwisko bez trafienia w kalendarzu → bez sieci; bez słowa z listy i bez trafień → null (dalej)', async () => {
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  const n = await odp(I, { q: 'Kotlina Kłodzka', jawne: false, f6: f6Atrapa({ wiersze: [] }) });
  assert.equal(n.o, null);
  const os = await odp(I, { q: 'Jan Kowalski', jawne: true, f6: f6Atrapa({ wiersze: [] }) });
  assert.equal(os.s.siec.length, 0, 'nazwisko do Google przez tryb imprezy');
  assert.deepEqual(os.o.zdania, ['Nie znalazłem tego biegu w kalendarzu ani w sieci.']);
});

test('429 F6 → maszyna zajęta, nasze starty i sieć zostają', async () => {
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  const races = [{ id: 'r1', name: 'Maraton Warszawski', date: '2027-09-26', city: 'Warszawa', status: 'approved' }];
  const { o } = await odp(I, { q: 'maraton warszawski', f6: f6Atrapa({ status: 429 }), races });
  assert.equal(o.f6, 'limit');
  assert.ok(o.zdania.includes('Maszyna wyników jest teraz zajęta — spróbuj za chwilę.'));
  assert.deepEqual(o.karty.map((k) => k.typ), ['start_nasz']);
});

test('jeden adapter: upcoming_races wołane tylko w kalendarz.mjs i biegi.mjs (lista); EF: impreza przed pamięcią i modelem, log tryb impreza', () => {
  const kat = path.join(KORZEN, 'supabase', 'functions', 'okienko');
  const kto = fs.readdirSync(kat).filter((f) => /upcoming_races/.test(fs.readFileSync(path.join(kat, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.deepEqual(kto.sort(), ['biegi.mjs', 'kalendarz.mjs']);
  assert.match(czytaj('supabase', 'functions', 'okienko', 'kalendarz.mjs'), /export const RPC_KALENDARZA = "upcoming_races";/);
  const ef = czytaj('supabase', 'functions', 'okienko', 'index.ts');
  const iImp = ef.indexOf('const imp = imprezaZPytania(tekst);');
  assert.ok(iImp > ef.indexOf('const os = osobaZPytania(tekst);'), 'osoba przed imprezą');
  assert.ok(iImp < ef.indexOf('const pam = osobaBezTrafien') && iImp < ef.indexOf('zapytajModel({'), 'impreza przed pamięcią i modelem');
  assert.match(ef, /tryb: "impreza"/);
  assert.match(czytaj('supabase', 'functions', 'okienko', 'limity.mjs'), /\.in\("tryb", \["osoba", "impreza"\]\)\.gte\("zapytania_sieci", 1\)/, 'sieć imprezy w limicie 20/dobę');
  const m = czytaj('supabase', 'migrations', '20261101_okienko_impreza.sql');
  assert.match(m, /'osoba', 'impreza', 'limit'/); assert.match(m, /'odrzucone', 'kalendarz'/);
  assert.ok(fs.existsSync(path.join(KORZEN, 'supabase', 'migrations', '20261101_WYCOFANIE_okienko_impreza.sql')));
});
