/* BLIZNA 64 (1.11.2026, M1 „Zapytaj" — krok 1: narzędzia bez modelu).

   Ryzyka:
   1) DRUGA KOPIA WYZWAŃ. EF (Deno) nie załaduje sb.js, więc _shared/wyzwania.mjs to kopia. Ten test puszcza obie kopie
      na tych samych losowych logach — rozjazd = czerwony.
   2) CUDZE DANE. Narzędzie filtruje po athlete_id ustalonym przez EF z sesji (nie z modelu). Atrapa bazy ma wiersze
      dwóch osób — wynik ma zawierać wyłącznie wiersze wołającego (na prawdziwej bazie dochodzi RLS).
   3) ZAPIS. Okienko jest tylko do odczytu: w supabase/functions/okienko/ nie ma insert/update/delete/upsert/rpc
      (wyjątek przyjdzie z krokiem 3: okienko_log).
   4) DATY. Zakresy liczy EF w Europe/Warsaw — granica doby przy zmianie czasu, tydzień pn–nd, > 366 dni / od > do = błąd. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);

/* ── atrapa Supabase: tabele w pamięci, filtry jak w PostgREST (tylko te, których używa narzedzia.mjs) ── */
function atrapa(tabele) {
  const zapytania = [];
  function from(nazwa) {
    const f = [], st = { nazwa, filtry: f, zapis: false };
    zapytania.push(st);
    let porz = null, lim = null, licz = false;
    const q = {
      select(_k, o) { licz = !!(o && o.count); return q; },
      eq(k, v) { f.push((r) => r[k] === v); st[k] = v; return q; },
      gte(k, v) { f.push((r) => String(r[k]) >= String(v)); return q; },
      lte(k, v) { f.push((r) => String(r[k]) <= String(v)); return q; },
      lt(k, v) { f.push((r) => String(r[k]) < String(v)); return q; },
      in(k, v) { f.push((r) => v.includes(r[k])); return q; },
      not(k, op, v) { const re = new RegExp('^' + v.replace(/%/g, '.*') + '$'); f.push((r) => !re.test(String(r[k]))); return q; },
      order(k, o) { porz = [k, o && o.ascending === false ? -1 : 1]; return q; },
      limit(n) { lim = n; return q; },
      insert() { st.zapis = true; return q; }, update() { st.zapis = true; return q; }, delete() { st.zapis = true; return q; }, upsert() { st.zapis = true; return q; },
      maybeSingle() { const w = wynik(); return Promise.resolve({ data: w.data[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve(wynik()).then(res, rej); },
    };
    function wynik() {
      let d = (tabele[nazwa] || []).filter((r) => f.every((p) => p(r)));
      const count = d.length;
      if (porz) d = d.slice().sort((a, b) => (String(a[porz[0]]) < String(b[porz[0]]) ? -1 : 1) * porz[1]);
      if (lim != null) d = d.slice(0, lim);
      return { data: d, error: null, count: licz ? count : null };
    }
    return q;
  }
  return { from, zapytania };
}

const JA = 'ath-ja', OBCY = 'ath-obcy';
function baza() {
  return {
    trainings: [
      { athlete_id: JA, date: '2026-11-01', type: 'Spokojny', description: 'luźno', distance_km: 8, duration_min: 50, pace: '6:15', status: 'planned' },
      { athlete_id: JA, date: '2026-11-02', type: 'Tempo', description: '3×2 km', distance_km: 10, duration_min: null, pace: null, status: 'planned' },
      { athlete_id: OBCY, date: '2026-11-01', type: 'Wybieganie', description: 'OBCY', distance_km: 25, status: 'planned' },
    ],
    training_logs: [
      { athlete_id: JA, logged_at: '2026-10-27T07:00:00Z', training_type: 'Spokojny', distance_km: '10.2', duration: '1:00:00', pace: '5:53' },
      { athlete_id: JA, logged_at: '2026-10-29T07:00:00Z', training_type: 'Rower', distance_km: '40', duration: '1:30:00', pace: null },
      { athlete_id: JA, logged_at: '2026-10-30T07:00:00Z', training_type: '__badge__x', distance_km: '99' },
      { athlete_id: OBCY, logged_at: '2026-10-28T07:00:00Z', training_type: 'Spokojny', distance_km: '500' },
    ],
    athletes: [
      { id: JA, race_goals: JSON.stringify([{ name: 'Bieg Niepodległości', date: '2026-11-11', race_id: 'r1' }, { name: 'stary', date: '2026-05-01' }, 'śmieć']) },
      { id: OBCY, race_goals: JSON.stringify([{ name: 'OBCY START', date: '2026-11-05' }]) },
    ],
    races: [{ id: 'r1', city: 'Warszawa' }],
    achievements: [
      { athlete_id: JA, badge_id: 'pierwszy_bieg', earned_at: '2026-10-01T10:00:00Z' },
      { athlete_id: OBCY, badge_id: 'maraton', earned_at: '2026-10-02T10:00:00Z' },
    ],
  };
}
const TERAZ = new Date('2026-11-01T10:00:00Z');   // niedziela

test('kopia WYZWAŃ (_shared/wyzwania.mjs) = sb.js na 1500 losowych zestawach logów (w tym rower)', async () => {
  const { WYZWANIA: W } = await zaladuj('supabase/functions/_shared/wyzwania.mjs');
  const S = zaladujSb().WYZWANIA;
  assert.equal(JSON.stringify(W.WEEKLY), JSON.stringify(S.WEEKLY));   // JSON, nie deepEqual: tablice z vm mają inny prototyp
  assert.equal(JSON.stringify(W.MONTHLY), JSON.stringify(S.MONTHLY));
  const T = ['Spokojny', 'Tempo', 'Interwały', 'Wybieganie', 'Rower', 'Wzmacniający'];
  let los = 7; const r = () => (los = (los * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 1500; k++) {
    const teraz = new Date(2026, Math.floor(r() * 12), 1 + Math.floor(r() * 28), 9 + Math.floor(r() * 12));
    const mS = new Date(teraz.getFullYear(), teraz.getMonth(), 1);
    const logi = Array.from({ length: Math.floor(r() * 25) }, (_, i) => ({ logged_at: new Date(mS.getTime() + r() * (teraz - mS)).toISOString(), distance_km: (r() * 30).toFixed(1), training_type: T[i % T.length] }));
    assert.equal(JSON.stringify(W.postep(logi, teraz)), JSON.stringify(S.postep(logi, teraz)), `zestaw ${k}`);
    assert.equal(W.najblizsze(logi, teraz), S.najblizsze(logi, teraz), `najblizsze ${k}`);
  }
});

test('walidacja: zła data, od > do, > 366 dni, zły typ → błąd; nieznane pola odpadają', async () => {
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  assert.equal(N.waliduj('moje_treningi', { od: '2026-11-02', do: '2026-11-01' }).ok, false);
  assert.equal(N.waliduj('moje_treningi', { od: '2025-10-31', do: '2026-11-01' }).ok, false, '367 dni włącznie');
  assert.equal(N.waliduj('moje_treningi', { od: '2025-11-01', do: '2026-11-01' }).ok, true, 'dokładnie 366 dni włącznie');
  assert.equal(N.waliduj('moje_treningi', { od: '2026-02-30', do: '2026-03-01' }).ok, false, '30 lutego');
  assert.equal(N.waliduj('moje_treningi', { od: '2026-11-01', do: '2026-11-01', typ: 'Pływanie' }).ok, false);
  assert.deepEqual(N.waliduj('moje_treningi', { od: '2026-11-01', do: '2026-11-01', athlete_id: 'X' }).args, { od: '2026-11-01', do: '2026-11-01' }, 'athlete_id od modelu odpada');
  assert.deepEqual(N.waliduj('moj_plan', {}).args, { zakres: 'dzis' });
  assert.equal(N.waliduj('moj_plan', { zakres: 'wczoraj' }).ok, false);
  assert.equal(N.waliduj('usun_konto', {}).ok, false);
});

test('daty Warszawy: tydzień pn–nd, granica doby przy zmianie czasu (marzec/październik)', async () => {
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  assert.deepEqual(N.zakresPlanu({ zakres: 'tydzien' }, '2026-11-01'), ['2026-10-26', '2026-11-01'], 'niedziela należy do tygodnia od pn');
  assert.deepEqual(N.zakresPlanu({ zakres: 'nastepny_tydzien' }, '2026-11-01'), ['2026-11-02', '2026-11-08']);
  assert.deepEqual(N.zakresPlanu({ zakres: 'jutro' }, '2026-12-31'), ['2027-01-01', '2027-01-01']);
  assert.equal(N.poczatekDniaWaw('2026-07-01'), '2026-06-30T22:00:00.000Z', 'lato UTC+2');
  assert.equal(N.poczatekDniaWaw('2026-11-01'), '2026-10-31T23:00:00.000Z', 'zima UTC+1');
  assert.equal(N.poczatekDniaWaw('2026-03-29'), '2026-03-28T23:00:00.000Z', 'dzień zmiany na letni zaczyna się jeszcze w UTC+1');
  assert.equal(N.poczatekDniaWaw('2026-03-30'), '2026-03-29T22:00:00.000Z', 'dzień po zmianie: już UTC+2');
  assert.equal(N.poczatekDniaWaw('2026-10-25'), '2026-10-24T22:00:00.000Z', 'dzień zmiany na zimowy zaczyna się jeszcze w UTC+2');
  assert.equal(N.dzisWaw(new Date('2026-10-31T23:30:00Z')), '2026-11-01', '23:30 UTC = już 1.11 w Warszawie');
});

test('wykonanie: każde narzędzie widzi WYŁĄCZNIE wiersze wołającego; kilometry biegowe, bez __badge__', async () => {
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const sb = atrapa(baza());
  const plan = await N.wykonaj(sb, JA, 'moj_plan', { zakres: 'tydzien' }, TERAZ);
  assert.deepEqual(plan.treningi.map((t) => t.typ), ['Spokojny'], 'pn 26.10 – nd 1.11: jeden trening (2.11 to następny tydzień)');
  const tr = await N.wykonaj(sb, JA, 'moje_treningi', { od: '2026-10-26', do: '2026-11-01' }, TERAZ);
  assert.equal(tr.suma_km, 10.2, 'rower i __badge__ poza sumą biegową, obcy 500 km poza wynikiem');
  assert.equal(tr.liczba, 2);
  const st = await N.wykonaj(sb, JA, 'moje_starty', {}, TERAZ);
  assert.deepEqual(st.cele.map((c) => [c.nazwa, c.dni_do, c.miasto]), [['Bieg Niepodległości', 10, 'Warszawa']]);
  const od = await N.wykonaj(sb, JA, 'odznaki_moje', {}, TERAZ);
  assert.equal(od.liczba, 1); assert.equal(od.ostatnie[0].id, 'pierwszy_bieg');
  const wy = await N.wykonaj(sb, JA, 'wyzwania_postep', {}, TERAZ);
  assert.equal(wy.aktywne.length, 5);
  for (const z of sb.zapytania) {
    assert.equal(z.zapis, false, `${z.nazwa}: zapis`);
    if (z.nazwa !== 'races') assert.ok(z.athlete_id === JA || z.id === JA, `${z.nazwa}: zapytanie bez filtra na wołającego`);
  }
  assert.ok(!JSON.stringify([plan, tr, st, od, wy]).includes('OBCY'), 'cudze dane w wyniku');
});

test('nawigacja z narzędzi (nie od modelu); każda deklaracja ma wykonanie i ekran', async () => {
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  assert.deepEqual(N.nawigacja(['moje_starty']), { nawiguj: 'races.html' });
  assert.deepEqual(N.nawigacja(['moj_plan', 'moje_starty']), { nawiguj: 'kalendarz.html?role=athlete' });
  assert.equal(N.nawigacja([]), null);
  const sb = atrapa(baza());
  for (const n of N.NAZWY) {
    const w = N.waliduj(n, n === 'moje_treningi' ? { od: '2026-10-01', do: '2026-10-31' } : {});
    assert.ok(w.ok, n);
    await N.wykonaj(sb, JA, n, w.args, TERAZ);
    assert.ok(N.nawigacja([n]), `${n}: brak ekranu`);
  }
  for (const u of Object.values(N.EKRANY)) assert.ok(fs.existsSync(path.join(KORZEN, u.split(/[?#]/)[0])), u);
});

test('statycznie: w supabase/functions/okienko/ nic nie pisze do bazy', () => {
  const kat = path.join(KORZEN, 'supabase', 'functions', 'okienko');
  for (const plik of fs.readdirSync(kat)) {
    const kod = fs.readFileSync(path.join(kat, plik), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const zapisy = kod.match(/\.(insert|update|delete|upsert|rpc)\s*\(/g) || [];
    const dozwolone = (kod.match(/from\(["']okienko_log["']\)\s*\.insert\(/g) || []).length;
    assert.equal(zapisy.length, dozwolone, `${plik}: zapis do bazy poza okienko_log: ${zapisy}`);
  }
});

/* ── KROK 2: router bez modelu (M1 pkt 5) + odpowiedź z szablonów ─────────────────────────────────────────── */
const DZIS = '2026-11-01';   // niedziela
const ROUTER = [
  ['Kiedy mam start?', 'moje_starty', {}],
  ['kiedy mam najblizszy start', 'moje_starty', {}],
  ['Jaki mam start', 'moje_starty', {}],
  ['moje starty', 'moje_starty', {}],
  ['Ile przebiegłem w tym miesiącu?', 'moje_treningi', { od: '2026-11-01', do: '2026-11-01' }],
  ['ile km w tym miesiacu', 'moje_treningi', { od: '2026-11-01', do: '2026-11-01' }],
  ['ile kilometrow w tym tygodniu', 'moje_treningi', { od: '2026-10-26', do: '2026-11-01' }],
  ['Ile km w październiku?', 'moje_treningi', { od: '2026-10-01', do: '2026-10-31' }],
  ['ile km w pazdzierniku', 'moje_treningi', { od: '2026-10-01', do: '2026-10-31' }],
  ['ile kilometrów w grudniu', 'moje_treningi', { od: '2025-12-01', do: '2025-12-31' }],
  ['ile km w maju', 'moje_treningi', { od: '2026-05-01', do: '2026-05-31' }],
  ['Plan na jutro', 'moj_plan', { zakres: 'jutro' }],
  ['co jutro', 'moj_plan', { zakres: 'jutro' }],
  ['co mam dziś', 'moj_plan', { zakres: 'dzis' }],
  ['plan na dzisiaj', 'moj_plan', { zakres: 'dzis' }],
  ['plan na ten tydzień', 'moj_plan', { zakres: 'tydzien' }],
  ['plan na nastepny tydzien', 'moj_plan', { zakres: 'nastepny_tydzien' }],
  ['Jakie mam odznaki?', 'odznaki_moje', {}],
  ['Pokaż wyzwania', 'wyzwania_postep', {}],
  ['jak ide z wyzwaniami', 'wyzwania_postep', {}],
];
const NAWIGACJA = [['otwórz log', 'zawodnik.html?log=1'], ['idz do jedzenia', 'nutrition.html'], ['pokaż radio', 'radio.html'], ['otworz plan', 'kalendarz.html?role=athlete']];
const NIE_PASUJE = ['Jaka jest pogoda?', 'Kto wygrał maraton w Berlinie?', 'jak poprawić tempo', 'opowiedz dowcip', 'ile mam lat'];

test('router: 20 zdań (literówki, bez polskich znaków) → właściwe narzędzie i argumenty; argumenty przechodzą walidację', async () => {
  const { dopasuj } = await zaladuj('supabase/functions/okienko/router.mjs');
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  assert.equal(ROUTER.length, 20);
  for (const [q, narz, args] of ROUTER) {
    const r = dopasuj(q, DZIS);
    assert.ok(r && r.narzedzie, `${q}: brak dopasowania`);
    assert.equal(r.narzedzie, narz, q);
    assert.deepEqual(r.args, args, q);
    assert.ok(N.waliduj(r.narzedzie, r.args).ok, `${q}: argumenty routera nie przechodzą walidacji`);
  }
  for (const [q, url] of NAWIGACJA) assert.equal((dopasuj(q, DZIS) || {}).nawiguj, url, q);
});

test('router: 5 zdań „nie pasuje" → null (krok 3: model)', async () => {
  const { dopasuj } = await zaladuj('supabase/functions/okienko/router.mjs');
  for (const q of NIE_PASUJE) assert.equal(dopasuj(q, DZIS), null, q);
});

test('odpowiedź z szablonów: każda liczba w zdaniu jest w wyniku narzędzia; pusto → „Nie mam tego w Twoich danych."', async () => {
  const { zWyniku, NIE_MAM } = await zaladuj('supabase/functions/okienko/odpowiedz.mjs');
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const sb = atrapa(baza());
  for (const [narz, args] of [['moj_plan', { zakres: 'dzis' }], ['moje_treningi', { od: '2026-10-26', do: '2026-11-01' }], ['moje_starty', {}], ['wyzwania_postep', {}], ['odznaki_moje', {}]]) {
    const w = await N.wykonaj(sb, JA, narz, args, TERAZ);
    const { zdania } = zWyniku(narz, w, args);
    const zrodlo = JSON.stringify(w).replace(/\./g, ',') + JSON.stringify(w);
    const daty = (JSON.stringify(w).match(/\d{4}-\d{2}-\d{2}/g) || []).map((d) => `${Number(d.slice(8))}.${d.slice(5, 7)}`).join(' ');   // D.MM jak strażnik (M1 pkt 4)
    for (const z of zdania) for (const c of z.match(/\d+(?:[.,]\d+)?/g) || []) {
      const ok = zrodlo.includes(c) || daty.split(' ').includes(c);
      assert.ok(ok, `${narz}: liczba ${c} spoza wyniku w „${z}"`);
    }
  }
  assert.deepEqual(zWyniku('moje_starty', { cele: [] }).zdania, [NIE_MAM]);
  assert.deepEqual(zWyniku('moje_treningi', { liczba: 0, suma_km: 0 }).zdania, [NIE_MAM]);
  assert.deepEqual(zWyniku('moj_plan', null).zdania, [NIE_MAM]);
  assert.match(zWyniku('moje_starty', { cele: [{ nazwa: 'X', data: '2026-11-11', dni_do: 10 }] }).zdania[0], /za 10 dni \(11\.11\)/);
  assert.match(zWyniku('odznaki_moje', { liczba: 5, ostatnie: [] }).zdania[0], /5 odznak\b/);
  assert.match(zWyniku('odznaki_moje', { liczba: 2, ostatnie: [] }).zdania[0], /2 odznaki\b/);
});

test('EF okienko: wymagajUsera na wejściu, athlete_id z sesji, verify_jwt w config.toml, tryb router bez modelu', () => {
  const ef = fs.readFileSync(path.join(KORZEN, 'supabase', 'functions', 'okienko', 'index.ts'), 'utf8');
  assert.match(ef, /const user = await wymagajUsera\(req\);\s*\n\s*if \(!user\) return odp\(401/);
  assert.match(ef, /\.from\("athletes"\)\.select\("id"\)\.eq\("user_id", user\.id\)/);
  assert.ok(!/body\.athlete|body\.athleteId|body\.dzis/.test(ef), 'athlete_id / dzis od klienta');
  /* krok 3: model jest, ale ZAWSZE po routerze i po limitach — router odpowiada bez tokenów i bez limitu */
  assert.ok(ef.indexOf('dopasuj(tekst, dzis)') < ef.indexOf('sprawdzLimity(') && ef.indexOf('sprawdzLimity(') < ef.indexOf('zapytajModel({'), 'kolejność router → limity → model');
  assert.match(fs.readFileSync(path.join(KORZEN, 'supabase', 'config.toml'), 'utf8'), /\[functions\.okienko\]\s*\nverify_jwt = true/);
});
