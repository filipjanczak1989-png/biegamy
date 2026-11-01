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

// Kształt events_search (017): nadchodzące rosnąco, potem przeszłe malejąco; atrapa robi rdzenie jak baza (klucz_szukania).
const KALENDARZ = [
  { nazwa: 'Ultrakotlina 2027', data: '2027-06-12', dokladnosc_daty: null, miejscowosc: 'Lądek-Zdrój', dystanse: '26 km, 52 km, 110 km', zrodlo: 'kalendarz', url_organizer: 'https://ultrakotlina.pl/x', status: null, przeszla: false },
  { nazwa: '49. Maraton Warszawski', data: '2027-09-26', dokladnosc_daty: null, miejscowosc: 'Warszawa', dystanse: '42.195', zrodlo: 'kalendarz', url_organizer: 'https://maratonwarszawski.com', status: null, przeszla: false },
  { nazwa: 'UltraKotlina', data: '2026-10-09', dokladnosc_daty: null, miejscowosc: 'Szklarska Poręba', dystanse: null, zrodlo: 'kalendarz', url_organizer: null, status: null, przeszla: true },
];
const klucz = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]/g, '');
const rdzenie = (q) => String(q).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').split(/[^a-z0-9]+/).filter((w) => w.length >= 3).map((w) => (w.length > 4 ? w.slice(0, Math.max(4, w.length - 3)) : w));
function f6Atrapa({ wiersze = KALENDARZ, status = 200 } = {}) {
  const wolania = [];
  return { wolania, fetchFn: async (url, init) => {
    const a = JSON.parse(init.body); wolania.push({ url, args: a, auth: init.headers.Authorization });
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => wiersze.filter((w) => !a.p_q || rdzenie(a.p_q).every((r) => klucz(w.nazwa + ' ' + w.miejscowosc).includes(r))) };
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

test('kalendarz przez adapter → events_search (017): całe zapytanie, bez zakresu (przeszłe edycje), odmiana trafia, kolejność serwera', async () => {
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  const { o, f6 } = await odp(I, { q: 'ultrakotliny' });
  assert.equal(f6.wolania.length, 1);
  assert.deepEqual(f6.wolania[0].args, { p_q: 'ultrakotliny', p_limit: 20 });
  assert.match(f6.wolania[0].url, /\/rpc\/events_search$/); assert.equal(f6.wolania[0].auth, 'Bearer TOK');
  const k = o.karty.filter((x) => x.typ === 'impreza');
  assert.deepEqual(k.map((x) => [x.dane.nazwa, x.dane.miejscowosc, x.dane.data, x.dane.przeszla]),
    [['Ultrakotlina 2027', 'Lądek-Zdrój', '2027-06-12', false], ['UltraKotlina', 'Szklarska Poręba', '2026-10-09', true]], 'nadchodząca, potem ostatnia edycja');
  assert.deepEqual(k[0].dane.dystanse, [26, 52, 110], 'dystanse tekstowe → liczby');
  // etap 5 ławki (1.11, decyzja Filipa): karta ma „Strona imprezy ›" — url TYLKO https z url_zapisy/url_organizer/url_regulamin,
  // nigdy surowe source_url; w UI przez safeExternalHref (blizna-89)
  assert.ok(!('source_url' in k[0].dane), 'bez surowego source_url');
  assert.ok(k[0].dane.url === null || /^https:\/\/[^\s"'<>]+$/.test(k[0].dane.url), 'link tylko https');
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
  assert.deepEqual(o.karty.map((k) => k.typ), ['impreza', 'start_nasz'], 'dedup: nasz start (data ±1, nazwa bez numeru edycji) zastępuje kalendarzowy 2027; przeszła edycja zostaje');
  assert.equal(o.karty[0].dane.przeszla, true);
});

test('pamięć 24 h trafiona → bez sieci; limit sieci → bez sieci, karty zostają', async () => {
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  const z = await odp(I, { q: 'ultrakotlina', pam: { zdania: ['Z pamięci.'], zrodla: [{ tytul: 'a.pl', url: 'https://a.pl' }] } });
  assert.equal(z.s.siec.length, 0); assert.deepEqual(z.o.zdania, ['Z pamięci.']); assert.equal(z.o.z_pamieci, true);
  const l = await odp(I, { q: 'ultrakotlina', dozwolona: false });
  assert.equal(l.s.siec.length, 0); assert.equal(l.o.karty.length, 2); assert.deepEqual(l.o.zdania, []);
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

test('jeden adapter: events_search tylko w kalendarz.mjs, upcoming_races tylko w biegi.mjs; EF: impreza przed pamięcią i modelem, log tryb impreza', () => {
  const kat = path.join(KORZEN, 'supabase', 'functions', 'okienko');
  const kod = (f) => fs.readFileSync(path.join(kat, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const kto = (rpc) => fs.readdirSync(kat).filter((f) => new RegExp(rpc).test(kod(f))).sort();
  assert.deepEqual(kto('upcoming_races'), ['biegi.mjs'], 'upcoming_races tylko w liście biegów (router „jakie biegi w X")');
  assert.deepEqual(kto('events_search'), ['kalendarz.mjs'], 'kalendarz imprez tylko przez adapter');
  assert.match(czytaj('supabase', 'functions', 'okienko', 'kalendarz.mjs'), /export const RPC_KALENDARZA = "events_search";/, 'przepięte na K-API 017');
  const ef = czytaj('supabase', 'functions', 'okienko', 'index.ts');
  const iImp = ef.indexOf('const imp = imprezaZPytania(tekst);');
  assert.ok(iImp > ef.indexOf('const os = osobaZPytania(tekst);'), 'osoba przed imprezą');
  assert.ok(iImp < ef.indexOf('const pam = await zPamieci') && iImp < ef.indexOf('zapytajModel({'), 'impreza przed pamięcią i modelem');
  assert.match(ef, /tryb: "impreza"/);
  assert.match(czytaj('supabase', 'functions', 'okienko', 'limity.mjs'), /\.in\("tryb", \["osoba", "impreza"\]\)\.gte\("zapytania_sieci", 1\)/, 'sieć imprezy w limicie 20/dobę');
  const m = czytaj('supabase', 'migrations', '20261101_okienko_impreza.sql');
  assert.match(m, /'osoba', 'impreza', 'limit'/); assert.match(m, /'odrzucone', 'kalendarz'/);
  assert.ok(fs.existsSync(path.join(KORZEN, 'supabase', 'migrations', '20261101_WYCOFANIE_okienko_impreza.sql')));
});
