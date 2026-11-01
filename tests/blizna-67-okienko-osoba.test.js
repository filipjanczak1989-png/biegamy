/* BLIZNA 67 (1.11.2026, M2b): tryb „osoba" w okienku — trzy fronty zamiast komunikatu o wyszukiwarce.

   Ryzyka:
   1) NAZWISKO DO GOOGLE. Prywatna osoba (kilka startów, bez Mistrzostw Polski, bez podium open) NIE trafia do
      googleSearch. Do sieci: ≥ 30 startów w F6, start w MP, podium open, albo pytanie wprost („kim jest X").
      Podium w KATEGORII nie wystarcza — zmierzone na prawdziwych danych: 9 z 12 startów jednej zawodniczki.
   2) PRYWATNE PROFILE. Karta osoby tylko z athletes.is_public = true (Społeczność pokazuje też prywatne — okienko nie).
   3) ZAPIS. Tryb osoby nie pisze nigdzie poza okienko_log (zapisuje index.ts); osoba.mjs tylko czyta; F6 tylko RPC
      odczytu, token wyłącznie w nagłówku Authorization.
   4) MASZYNA ZAJĘTA. 429 z F6 → „Maszyna wyników jest teraz zajęta — spróbuj za chwilę.", reszta odpowiedzi zostaje.
   5) PAMIĘĆ F6 wspólna: klucz = RPC + argumenty, 10 min, ≤ 500 wpisów.
   6) UI: karta osoby bez JS w atrybutach (data-*), id tylko UUID, nazwy escapowane. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { tekstDlaOkna } = require('./_srodowisko.js');   // porządek 1.11: js/tekst.mjs w window okienka
const { atrapa, JA } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8');
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222', U3 = '33333333-3333-4333-8333-333333333333';

function baza() {
  return {
    athletes: [
      { id: U1, full_name: 'Katarzyna Chojnacka', is_public: true },
      { id: U2, full_name: 'Katarzyna Chojnacka', is_public: false },   // prywatna — atrapa nie ma RLS; w EF o widoczności decyduje RLS (jak Społeczność)
      { id: U3, full_name: 'Iwona Testowa', is_public: true },
      { id: JA, full_name: 'Ja Sam', is_public: true },
    ],
    friendships: [{ requester_id: JA, addressee_id: U3, status: 'accepted' }],
  };
}
/** Atrapa F6: search_runners → biegacze, runner_results → wyniki; liczy wołania; status 429 na żądanie. */
function f6Atrapa({ starty = 3, wyniki = null, status = 200, pusto = false } = {}) {
  const wolania = [];
  const fetchFn = async (url, init) => {
    wolania.push({ url, init });
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    const rpc = url.split('/rpc/')[1];
    if (rpc === 'search_runners') return { ok: true, status: 200, json: async () => (pusto ? [] : [
      { runner_key: 'rk1', display_name: 'CHOJNACKA KATARZYNA', yob: 1991, results_count: starty },
      { runner_key: 'rk2', display_name: 'CHOJNACKA KATARZYNA', yob: 1973, results_count: 2 }]) };
    if (rpc === 'runner_results') return { ok: true, status: 200, json: async () => (wyniki || [
      { event_name: 'Bieg Testowy 10 km', event_date: '2026-10-18', distance_km: 10, time_seconds: 2700, position_total: 45, position_category: 3, category: 'K30' },
      { event_name: 'Bieg Wiosenny 10 km', event_date: '2026-04-01', distance_km: 10, time_seconds: 2650, position_total: 60, position_category: 2, category: 'K30' }]) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchFn, wolania };
}
async function odpowiedz(O, { q = 'Katarzyna Chojnacka', wprost = false, f6 = f6Atrapa(), dozwolona = true, sb = atrapa(baza()) } = {}) {
  O._wyczyscPamiecF6();
  const siec = [];
  const o = await O.odpowiedzOsoba({ sb, athleteId: JA, fetchFn: f6.fetchFn, token: 'TOKEN-UZYTKOWNIKA', q, wprost,
    sieciDozwolona: async () => dozwolona,
    siec: async (t) => { siec.push(t); return { zdania: ['Zdanie z sieci.'], zrodla: [{ tytul: 'a.pl', url: 'https://a.pl' }], tok: { we: 10, wy: 5 }, zapytania: 1 }; } });
  return { o, siec, f6, sb };
}

test('rozpoznanie: samo imię i nazwisko, „kim jest …", „… w sieci", „wyniki …"; pytania o biegi — nie', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  assert.deepEqual(O.osobaZPytania('Katarzyna Chojnacka'), { q: 'Katarzyna Chojnacka', wprost: false });
  assert.deepEqual(O.osobaZPytania('Kim jest Katarzyna Chojnacka?'), { q: 'Katarzyna Chojnacka', wprost: true });
  assert.deepEqual(O.osobaZPytania('Katarzyna Chojnacka w sieci'), { q: 'Katarzyna Chojnacka', wprost: true });
  assert.deepEqual(O.osobaZPytania('google Jan Kowalski'), { q: 'Jan Kowalski', wprost: true });
  assert.deepEqual(O.osobaZPytania('wyniki Jan Kowalski'), { q: 'Jan Kowalski', wprost: false });
  for (const t of ['Kto wygrał maraton w Berlinie?', 'kim jest mój trener', 'moja koleżanka', 'kim jest pani Ania', 'trasa Poznań', 'Kiedy mam start?', 'wyniki maratonu'])
    assert.equal(O.osobaZPytania(t), null, t);
});

test('nazwisko z 3 startami (bez MP i podium open) NIE trafia do sieci; karty osób = zbiór jak w Społeczności (RLS, prywatny ze znacznikiem) + karta wyników', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const { o, siec } = await odpowiedz(O);
  assert.equal(siec.length, 0, 'nazwisko poszło do googleSearch');
  assert.equal(o.sieci, false);
  const osoby = o.karty.filter((k) => k.typ === 'osoba');
  assert.deepEqual(osoby.map((k) => [k.dane.id, k.dane.prywatny]), [[U1, false], [U2, true]], 'własny profil w karcie / brak znacznika prywatności');
  const w = o.karty.find((k) => k.typ === 'wyniki').dane;
  assert.equal(w.starty, 3);
  assert.equal(w.najlepszy_czas.czas_s, 2650, 'najlepszy czas na dystansie ostatniego startu');
  assert.equal(w.inne.length, 1);
  assert.deepEqual(o.zdania, [], 'bez sieci — bez zdania o braku sieci');
  assert.deepEqual(o.akcja, { nawiguj: 'races.html' });
});

test('30+ startów, Mistrzostwa Polski albo podium OPEN → sieć; podium tylko w kategorii → nie', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  assert.equal((await odpowiedz(O, { f6: f6Atrapa({ starty: 30 }) })).siec.length, 1, '30 startów');
  assert.equal((await odpowiedz(O, { f6: f6Atrapa({ wyniki: [{ event_name: 'Mistrzostwa Polski w Maratonie', distance_km: 42.195, time_seconds: 9000, position_total: 40 }] }) })).siec.length, 1, 'MP');
  assert.equal((await odpowiedz(O, { f6: f6Atrapa({ wyniki: [{ event_name: 'Bieg', distance_km: 5, time_seconds: 1000, position_total: 2 }] }) })).siec.length, 1, 'podium open');
  assert.equal((await odpowiedz(O, { f6: f6Atrapa({ wyniki: [{ event_name: 'Bieg', distance_km: 5, time_seconds: 1000, position_total: 40, position_category: 1 }] }) })).siec.length, 0, 'podium w kategorii');
  const z = await odpowiedz(O, { f6: f6Atrapa({ starty: 31 }) });
  assert.deepEqual(z.o.zdania, ['Zdanie z sieci.']);
  assert.equal(z.o.zrodla.length, 1);
  assert.deepEqual(z.o.karty.map((k) => k.typ), ['osoba', 'osoba', 'wyniki'], 'kolejność: zdania z sieci → osoby (atrapa bez RLS: obie) → wyniki');
});

test('„kim jest X" trafia do sieci nawet przy 3 startach; limit sieci wyczerpany → bez sieci', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  assert.equal((await odpowiedz(O, { wprost: true })).siec.length, 1);
  assert.equal((await odpowiedz(O, { wprost: true, dozwolona: false })).siec.length, 0);
});

test('brak wszystkiego → odpowiedź informacyjna (M3-0b, 0 tokenów); 429 z F6 → maszyna zajęta, profil zostaje', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const brak = await odpowiedz(O, { q: 'Zenon Nieistniejący', f6: f6Atrapa({ pusto: true }) });
  assert.equal(brak.o.nic, true);
  assert.deepEqual(brak.o.zdania, [O.ODP_BRAK_W_BIEGAMY, O.ODP_BRAK_W_F6]);
  assert.equal(brak.o.karty.length, 0);
  assert.deepEqual(brak.o.tok, { we: 0, wy: 0 });
  const zajeta = await odpowiedz(O, { f6: f6Atrapa({ status: 429 }) });
  assert.deepEqual(zajeta.o.zdania, [O.ODP_F6_ZAJETA]);
  assert.deepEqual(zajeta.o.karty.map((k) => k.typ), ['osoba', 'osoba']);
  assert.equal(zajeta.o.f6, 'limit');
  assert.equal(zajeta.siec.length, 0);
});

test('pamięć F6 wspólna: to samo RPC + argumenty w 10 min = jedno wołanie; po 10 min znowu; ≤ 500 wpisów', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  O._wyczyscPamiecF6();
  const a = f6Atrapa();
  await O.f6(a.fetchFn, 'T1', 'search_runners', { q: 'x', lim: 3 }, 0);
  await O.f6(a.fetchFn, 'T2-inny-uzytkownik', 'search_runners', { q: 'x', lim: 3 }, 9 * 60000);
  assert.equal(a.wolania.length, 1, 'drugi użytkownik w 10 min dostaje z pamięci');
  await O.f6(a.fetchFn, 'T1', 'search_runners', { q: 'x', lim: 3 }, 10 * 60000 + 1);
  assert.equal(a.wolania.length, 2, 'po 10 min — świeże');
  for (let i = 0; i < 600; i++) await O.f6(a.fetchFn, 'T', 'search_runners', { q: 'q' + i, lim: 3 }, 20 * 60000);
  assert.ok(O._rozmiarPamieciF6() <= 500);
  await assert.rejects(O.f6(f6Atrapa({ status: 429 }).fetchFn, 'T', 'search_runners', { q: 'nowe' }), (e) => e.kod === 'limit');
});

test('F6: tylko api.biegamy.run, tylko search_runners/runner_results, token wyłącznie w nagłówku Authorization', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const { f6 } = await odpowiedz(O);
  assert.ok(f6.wolania.length >= 2);
  for (const w of f6.wolania) {
    assert.match(w.url, /^https:\/\/api\.biegamy\.run\/rpc\/(search_runners|runner_results)$/);
    assert.equal(w.init.headers.Authorization, 'Bearer TOKEN-UZYTKOWNIKA');
    assert.ok(!w.url.includes('TOKEN') && !String(w.init.body).includes('TOKEN'), 'token poza nagłówkiem');
  }
});

test('brak zapisu: osoba.mjs i zapytania trybu osoby tylko czytają; jedyny zapis trybu w index.ts to okienko_log', async () => {
  const kod = czytaj('supabase', 'functions', 'okienko', 'osoba.mjs');
  assert.ok(!/\.(insert|upsert|update|delete|rpc)\(/.test(kod.replace(/PAMIEC\.delete\(/g, '')), 'zapis albo rpc w osoba.mjs (poza pamięcią F6 w izolacie)');
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const { sb } = await odpowiedz(O, { f6: f6Atrapa({ starty: 40 }) });
  assert.ok(sb.zapytania.every((z) => z.zapis === false), 'zapis do bazy w trybie osoby');
  assert.ok(sb.zapytania.some((z) => z.nazwa === 'athletes' && z.is_public === undefined && z.ilike), 'profile: bez filtra is_public — ten sam zbiór co Społeczność, decyduje RLS');
  const ef = czytaj('supabase', 'functions', 'okienko', 'index.ts');
  const blok = ef.slice(ef.indexOf('const os = osobaZPytania(tekst);'), ef.indexOf('zPamieci(adm'));
  assert.deepEqual([...blok.matchAll(/(zapiszLog|doPamieci|zapiszZnaleziska|\.insert\(|\.upsert\()/g)].map((m) => m[1]), ['zapiszLog']);
});

test('UI: karta osoby — data-*, bez onclick, id tylko UUID, nazwa escapowana; karta wyników z „Otwórz wyniki" do races.html', () => {
  const okno = { BM_TEKST: tekstDlaOkna(), escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    safeExternalHref: (u) => (/^https:\/\//.test(u) ? u : '') };
  const ctx = vm.createContext({ window: okno, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null }, sessionStorage: { getItem: () => null, setItem() {} },
    localStorage: { getItem: () => null }, location: { search: '' }, navigator: {}, setTimeout, console });
  vm.runInContext(czytaj('js', 'okienko.js'), ctx);
  const O = okno.OKIENKO;
  const html = O.htmlOdpowiedzi(200, { tryb: 'osoba', zdania: [], zrodla: [], karty: [
    { typ: 'osoba', dane: { id: U1, nazwa: '<img src=x onerror=alert(1)>', znajomosc: null } },
    { typ: 'osoba', dane: { id: "x');alert(1);//", nazwa: 'Zły' } },
    { typ: 'wyniki', dane: { nazwa: 'CHOJNACKA KATARZYNA', rocznik: 1991, starty: 12, ostatni: { bieg: 'Maraton Dębno', data: '2026-10-18' },
      najlepszy_czas: { czas_s: 10652, dystans_km: 42.195 }, ostatnie: [{ bieg: 'Maraton Dębno', data: '2026-10-18', czas_s: 10652, miejsce: 45 }], inne: [] } }] });
  assert.ok(!/onclick|onerror=alert/i.test(html.replace(/&lt;img src=x onerror=alert\(1\)&gt;/g, '')), html);
  assert.ok(html.includes('&lt;img'), 'nazwa nieescapowana');
  assert.ok(!html.includes('Zły'), 'karta z id spoza UUID');
  assert.equal((html.match(/data-osoba="(profil|znajomy|napisz)"/g) || []).length, 3);
  assert.match(html, /12 startów · ostatni: Maraton Dębno \(18\.10\.2026\) · najlepszy czas 2:57:32 na 42,2 km/);
  assert.match(html, /data-cel="races\.html">Otwórz wyniki</);
  assert.equal(O.htmlOdpowiedzi(200, { tryb: 'osoba', zdania: ['Nie znalazłem tej osoby w aplikacji ani w wynikach.'], karty: [] }),
    '<p class="okn-zdanie">Nie znalazłem tej osoby w aplikacji ani w wynikach.</p>');
});

test('flaga WYNIKI_API_WLACZONE = true (wyszukiwarka wyników w races.html dla wszystkich, M2b)', () => {
  assert.match(czytaj('js', 'wyniki-api.js'), /^\s*var WYNIKI_API_WLACZONE = true;/m);
});
