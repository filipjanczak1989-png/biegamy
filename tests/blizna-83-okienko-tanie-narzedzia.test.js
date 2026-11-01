/* BLIZNA 83 (1.11.2026, M3-1 (3) tanie narzędzia) — luki z ławki, które kosztowały model/sieć, a dane są w aplikacji.

   1) moj_trener: coach_id → imię trenera (coaches, SELECT publiczny), karta z „Napisz" (czat z trenerem, istniejąca
      akcja data-plan=trener); bez trenera → „Trenujesz bez trenera w BiegaMy." Bez modelu.
   2) Pogoda po stronie KLIENTA (js/okienko.js): to samo źródło co kafel Dziś (sessionStorage weather:<miasto>), dziś /
      jutro / pojutrze, 0 tokenów, bez EF; brak kafla → do Profilu; inne miasto w pytaniu → mówimy, dla jakiego mamy.
   3) Powitanie → jedno zdanie z routera, 0 tokenów.
   4) „moje rekordy" przy pustych pb_* → najlepsze czasy Z WYNIKÓW ZAWODÓW (F6) z etykietą „z wyników zawodów", nie
      z treningów; imiennicy → „Który to Ty?"; F6 429 → zajęta. */
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
const DZIS = '2026-11-01', TERAZ = new Date('2026-11-01T10:00:00Z');
const T1 = 'bd9cbbac-0000-4000-8000-000000000001';

test('(1) moj_trener: router 0 tokenów; z trenerem → karta „Napisz"; bez → zdanie; nie jest „osobą"', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const { zWyniku } = await zaladuj('supabase/functions/okienko/odpowiedz.mjs');
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  for (const t of ['kto jest moim trenerem', 'kim jest moj trener', 'jak nazywa sie mojego trenera', 'czy mam trenera', 'kto mnie trenuje'])
    assert.equal(R.dopasuj(t, DZIS).narzedzie, 'moj_trener', t);
  assert.equal(O.osobaZPytania('kto jest moim trenerem'), null);
  const z = await N.wykonaj(atrapa({ athletes: [{ id: JA, coach_id: T1 }], coaches: [{ id: T1, full_name: 'Filip Trenerski', specialization: 'biegi długie' }] }), JA, 'moj_trener', {}, TERAZ);
  const o = zWyniku('moj_trener', z, {});
  assert.deepEqual(o.zdania, ['Twój trener: Filip Trenerski.']); assert.equal(o.karty[0].typ, 'trener');
  assert.ok(N.nawigacja(['moj_trener']).nawiguj.includes('tab=msgs'));
  const b = zWyniku('moj_trener', await N.wykonaj(atrapa({ athletes: [{ id: JA, coach_id: null }], coaches: [] }), JA, 'moj_trener', {}, TERAZ), {});
  assert.deepEqual(b.zdania, ['Trenujesz bez trenera w BiegaMy.']); assert.deepEqual(b.karty, []); assert.equal(b.akcja, null);
  assert.ok(N.NAZWY.includes('moj_trener'));
});

test('(3) powitanie → zdanie z routera; EF zwraca je bez modelu', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  for (const t of ['dzien dobry', 'Cześć!', 'hej', 'siema', 'Dobry wieczór'])
    assert.equal(R.dopasuj(t, DZIS).zdanie, R.POWITANIE, t);
  assert.equal(R.dopasuj('hej ile km w tym tygodniu', DZIS).narzedzie, 'moje_treningi', 'powitanie z pytaniem → pytanie');
  const ef = czytaj('supabase', 'functions', 'okienko', 'index.ts');
  const i = ef.indexOf('if (traf && "zdanie" in traf)');
  assert.ok(i > 0 && i < ef.indexOf('zapytajModel({'));
  assert.match(ef.slice(i, i + 400), /tryb: "router", narzedzia: \["powitanie"\]/);
});

test('(4) moje rekordy przy pustych pb_* → z wyników zawodów (etykieta), nie z treningów; imiennicy → „Który to Ty?"', async () => {
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const { zWyniku } = await zaladuj('supabase/functions/okienko/odpowiedz.mjs');
  const F = await zaladuj('supabase/functions/okienko/f6.mjs');
  const f6 = (runners) => ({ token: 'T', fetchFn: async (url) => { const rpc = url.split('/rpc/')[1]; return { ok: true, status: 200, json: async () => (rpc === 'search_runners' ? runners
    : [{ event_name: 'Bieg A 10 km', event_date: '2026-09-10', distance_km: 10, time_seconds: 2890 }, { event_name: 'Bieg B 10 km', event_date: '2025-09-10', distance_km: 10, time_seconds: 2750 },
       { event_name: 'Półmaraton C', event_date: '2026-04-10', distance_km: 21.0975, time_seconds: 6400 }, { event_name: 'Marsz 7 km', event_date: '2026-01-01', distance_km: 7, time_seconds: 3000 }]) }; } });
  const sb = () => atrapa({ athletes: [{ id: JA, full_name: 'Testowa Osoba', date_of_birth: '1990-05-05' }], training_logs: [{ athlete_id: JA, logged_at: '2026-10-01T07:00:00Z', training_type: 'Spokojny', distance_km: '10', duration: '0:40:00' }] });
  F._wyczyscPamiecF6();
  const r = await N.wykonaj(sb(), JA, 'moje_rekordy', {}, TERAZ, f6([{ runner_key: 'datasport:9', display_name: 'TESTOWA OSOBA', yob: 1990, results_count: 4 }]));
  assert.equal(r.zrodlo, 'wyniki');
  assert.deepEqual(r.rekordy.map((x) => [x.dystans, x.czas, x.rok, x.bieg]), [['10 km', '45:50', 2025, 'Bieg B 10 km'], ['półmaraton', '1:46:40', 2026, 'Półmaraton C']]);
  const o = zWyniku('moje_rekordy', r, {});
  assert.equal(o.zdania[0], 'Twoje najlepsze czasy z wyników zawodów: 10 km 45:50 (2025), półmaraton 1:46:40 (2026).');
  assert.ok(o.karty.every((k) => k.dane.zrodlo === 'wyniki'));
  F._wyczyscPamiecF6();
  const w = await N.wykonaj(sb(), JA, 'moje_rekordy', {}, TERAZ, f6([{ runner_key: 'datasport:1', display_name: 'TESTOWA OSOBA', yob: 1990, results_count: 4 }, { runner_key: 'datasport:2', display_name: 'TESTOWA OSOBA', yob: 1990, results_count: 1 }]));
  assert.equal(zWyniku('moje_rekordy', w, {}).karty[0].typ, 'ktory_to_ty');
  F._wyczyscPamiecF6();
  const n = await N.wykonaj(sb(), JA, 'moje_rekordy', {}, TERAZ, f6([]));
  assert.deepEqual(zWyniku('moje_rekordy', n, {}).zdania, ['Nie masz jeszcze wpisanych rekordów — uzupełnisz je w Profilu.']);
  assert.ok(!JSON.stringify(r).includes('Spokojny'), 'rekordy nigdy z treningów');
});

test('(2) pogoda po stronie klienta: dziś/jutro z kafla, inne miasto → dopisek, brak kafla → Profil; bez wywołania EF', () => {
  const mag = new Map();
  const okno = { escapeHtml: (s) => String(s), BM_TEKST: tekstDlaOkna(), sb: { auth: { getSession: async () => ({ data: { session: { access_token: 'x' } } }) } }, SB_URL: 'https://x', SB_KEY: 'k' };
  let fetche = 0;
  const ctx = vm.createContext({ window: okno, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    sessionStorage: { get length() { return mag.size; }, key: (i) => [...mag.keys()][i], getItem: (k) => (mag.has(k) ? mag.get(k) : null), setItem() {} },
    location: { search: '' }, navigator: { onLine: true }, setTimeout, console, fetch: async () => { fetche++; return { status: 200, json: async () => ({}) }; } });
  vm.runInContext(czytaj('js', 'okienko.js'), ctx);
  const O = okno.OKIENKO;
  assert.match(O.pogodaLokalnie('jaka pogoda jutro'), /Pogodę biorę z kafla na Dziś — ustaw miasto w Profilu/);
  mag.set('weather:poznań', JSON.stringify({ ts: Date.now(), data: { city: 'Poznań', days: [{ date: DZIS, temp_max: 9.4, weather_code: 3, precip_pct: 20 }, { date: '2026-11-02', temp_max: 11, weather_code: 61, precip_pct: 70 }] } }));
  assert.equal(O.pogodaLokalnie('jaka pogoda jutro w poznaniu'), '<p class="okn-zdanie">Jutro (Poznań): deszcz, do 11°C, opady 70%.</p>');
  assert.equal(O.pogodaLokalnie('jaka dzis pogoda'), '<p class="okn-zdanie">Dziś (Poznań): pochmurno, do 9°C, opady 20%.</p>');
  assert.match(O.pogodaLokalnie('pogoda jutro w krakowie'), /Mam pogodę tylko dla miasta Poznań \(z kafla na Dziś\)\./);
  assert.equal(O.pogodaLokalnie('ile km w tym tygodniu'), null);
  assert.equal(fetche, 0, 'pogoda bez EF');
  const ui = czytaj('js', 'okienko.js');
  assert.match(ui, /var lokalnie = pogodaLokalnie\(tekst\);\s*\n\s*if \(lokalnie\) \{ wynik\.innerHTML = lokalnie; zapamietajPytanie\(tekst\); return; \}/);
});

test('UI: karta trenera z „Napisz" (data-plan=trener → czat z trenerem); karta rekordu z etykietą „z wyników zawodów"', () => {
  const okno = { escapeHtml: (s) => String(s), BM_TEKST: tekstDlaOkna() };
  const ctx = vm.createContext({ window: okno, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: {}, setTimeout, console });
  vm.runInContext(czytaj('js', 'okienko.js'), ctx);
  const html = okno.OKIENKO.htmlOdpowiedzi(200, { tryb: 'router', zdania: ['x'], karty: [{ typ: 'trener', dane: { nazwa: 'Filip T', specjalizacja: null } }, { typ: 'rekord', dane: { dystans: '10 km', czas: '45:50', rok: 2025, bieg: 'Bieg B', zrodlo: 'wyniki' } }] });
  assert.match(html, /<b>Filip T<\/b><span class="okn-meta">Twój trener<\/span><button type="button" class="okn-otworz" data-plan="trener">Napisz<\/button>/);
  assert.match(html, /45:50 · 2025 · z wyników zawodów: Bieg B/);
});
