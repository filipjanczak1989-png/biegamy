/* BLIZNA 136 (3.11.2026, Filip: „po merge i deployu Okienko na każde pytanie odpowiada »Nie dam rady teraz odpowiedzieć«”, przepięcie cofnięte).
   Od wdrożenia 19:36 do cofnięcia 19:45: ZERO wierszy w okienko_v2_log i okienko_log, ZERO w client_errors — kod na serwerze = repo, moduły
   ładują się, wejście bez sesji odpowiada 401 z kodu funkcji; przyczyny nie dało się odczytać, bo żadna ścieżka awarii nie zostawiała śladu:
     • wywołania Gemini (model v1, sieć) bez limitu czasu — wiszące dłużej niż klient czeka (20 s) kończą się bez wpisu;
     • wczesne powroty potoku (limity, narzędzie, brak klucza, złe argumenty) bez wpisu;
     • wyjątek poza try → 500 BEZ CORS → przeglądarka widzi „błąd sieci”, log pusty;
     • klient nie zgłaszał niczego (status, kod bramki, czas).
   Poprawka: limit czasu na każde wywołanie Gemini, termin całej obsługi EF (16 s < 20 s klienta) + catch z wpisem 'blad' i CORS,
   wpis 'blad' przy każdym wczesnym powrocie, klient zgłasza awarię do client_errors (bez treści pytania) i przy wadliwej v2 ponawia w v1. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');
const { atrapa, JA } = require('./_okienko-atrapy.js');
const { baza, fetchF6, DZIS, TERAZ } = require('./_lawka-pytan.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const wiszacy = (licznik) => (url, o) => { if (licznik) licznik.n++; licznik && (licznik.signal = o && o.signal);
  return new Promise((_, odrzuc) => { if (o && o.signal) o.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; odrzuc(e); }); }); };

test('straż HTTP: termin odrzuca PrzekroczonyTermin, wynik i wyjątek przechodzą; opis błędu bez długich tokenów; termin < 20 s klienta', async () => {
  const S = await zaladuj('supabase/functions/okienko/straz-http.mjs');
  assert.equal(await S.zTerminem(Promise.resolve(7), 50), 7);
  await assert.rejects(S.zTerminem(new Promise(() => {}), 20), (e) => e instanceof S.PrzekroczonyTermin && /termin 20 ms/.test(e.message));
  await assert.rejects(S.zTerminem(Promise.reject(new TypeError('x is not a function')), 50), /x is not a function/);
  const op = S.opisBledu(new TypeError('klucz eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9abcdefghijk zły'));
  assert.match(op, /^TypeError: klucz … zły/); assert.doesNotMatch(op, /eyJhbGci/);
  assert.ok(S.TERMIN_MS < 20000, 'EF odpowiada, zanim klient się podda');
  assert.match(czytaj('js/okienko.js'), /setTimeout\(function \(\) \{ ctrl\.abort\(\); \}, 20000\)/, 'klient czeka 20 s (TERMIN_MS ma być krótszy)');
});

test('model v1: wiszący Gemini → BladModelu „timeout” po limicie (fetch dostaje signal); sieć: timeout i brak ponowienia, gdy pierwsze trwało > połowy', async () => {
  const M = await zaladuj('supabase/functions/okienko/model.mjs');
  const l = { n: 0 };
  const t0 = Date.now();
  await assert.rejects(M.zapytajModel({ fetchFn: wiszacy(l), klucz: 'K', sb: null, athleteId: JA, tekst: 'ile przebiegłem', dzis: DZIS, teraz: TERAZ, timeoutMs: 30 }),
    (e) => e instanceof M.BladModelu && /timeout 30 ms/.test(e.message));
  assert.ok(Date.now() - t0 < 2000); assert.ok(l.signal, 'fetch dostał AbortSignal');
  assert.equal(M.LIMIT_KROKU_MS, 8000);
  const Si = await zaladuj('supabase/functions/okienko/siec.mjs');
  await assert.rejects(Si.zapytajSiec({ fetchFn: wiszacy(null), klucz: 'K', tekst: 'rekord świata', dzis: DZIS, timeoutMs: 30 }), /sieć timeout 30 ms/);
  let n = 0;
  const wolnyBezZrodel = async () => { n++; await new Promise((r) => setTimeout(r, 40)); return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }) }; };
  const w = await Si.zapytajSiec({ fetchFn: wolnyBezZrodel, klucz: 'K', tekst: 'rekord świata', dzis: DZIS, timeoutMs: 60 });
  assert.equal(n, 1, 'bez ponowienia, gdy pierwsze wyszukanie zjadło > połowę limitu'); assert.equal(w.proby, 1);
  n = 0;
  const szybkiBezZrodel = async () => { n++; return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }) }; };
  assert.equal((await Si.zapytajSiec({ fetchFn: szybkiBezZrodel, klucz: 'K', tekst: 'rekord świata', dzis: DZIS })).proby, 2, 'szybkie bez źródeł → jedno ponowienie jak dotąd');
});

async function potokZ(nadpisz, we = {}) {
  const { potok } = await zaladuj('supabase/functions/okienko-v2/potok.mjs');
  const adm = atrapa({ okienko_v2_log: [], okienko_v2_rozmowa: [], okienko_siec_cache: [], okienko_znaleziska: [] });
  const r = await potok(Object.assign({ tekst: 'rekord swiata w maratonie', historia: [], ekran: 'home', athleteId: JA, sb: atrapa(baza()), adm, jwt: 'T', dzis: DZIS, teraz: TERAZ,
    gemini: 'K', budzet: 0, fetchFn: fetchF6 }, we), Object.assign({ sprawdzLimity: async () => null, uzyteSiecDzis: async () => 0 }, nadpisz));
  return { r, log: adm.tabele.okienko_v2_log };
}

test('potok v2: każdy wczesny powrót ≠ 200 zostawia wpis „blad” z powodem (limity, brak klucza, narzędzie)', async () => {
  let { r, log } = await potokZ({ sprawdzLimity: async () => { throw new Error('okienko_v2_log'); } });
  assert.equal(r.status, 503); assert.equal(r.body.blad, 'limity');
  assert.equal(log.at(-1).tryb, 'blad'); assert.match(log.at(-1).powod_odrzucenia, /^limity: okienko_v2_log/); assert.equal(log.at(-1).ok, false);
  ({ r, log } = await potokZ({}, { gemini: '' }));
  assert.equal(r.status, 502); assert.equal(log.at(-1).tryb, 'blad'); assert.equal(log.at(-1).powod_odrzucenia, 'brak GEMINI_API_KEY');
  ({ r, log } = await potokZ({ wykonaj: async () => { throw new Error('F6 http 500'); } }, { tekst: 'ile przebiegłem w tym tygodniu' }));
  assert.equal(r.status, 503); assert.equal(log.at(-1).tryb, 'blad'); assert.match(log.at(-1).powod_odrzucenia, /^narzędzie \w+: F6 http 500/);
});

test('potok v2: wyjątek zapisu logu nie psuje odpowiedzi', async () => {
  const { r } = await potokZ({ zapiszLog: async () => { throw new Error('baza leży'); } }, { tekst: 'kim jest Filip' });
  assert.equal(r.status, 200); assert.ok(r.body.zdania.length);
});

test('EF okienko i okienko-v2: cała obsługa w zTerminem + catch → wpis „blad”, console.error, odpowiedź przez odp (CORS); stan zawodnika przed potokiem', () => {
  for (const [plik, zapis] of [['supabase/functions/okienko-v2/index.ts', 'zapiszLogV2'], ['supabase/functions/okienko/index.ts', 'zapiszLog']]) {
    const s = czytaj(plik);
    const serve = s.slice(s.indexOf('Deno.serve('), s.indexOf('async function obsluz('));
    assert.ok(serve.length > 0 && s.indexOf('async function obsluz(') > s.indexOf('Deno.serve('), plik + ': handler = obsluz w straży');
    assert.match(serve, /try \{ return await zTerminem\(obsluz\(req, stan\), TERMIN_MS\); \}/, plik);
    assert.match(serve, /const czas = e instanceof PrzekroczonyTermin;/, plik);
    assert.match(serve, /console\.error\(/, plik);
    assert.match(serve, new RegExp('try \\{ await ' + zapis + '\\(stan\\.adm, \\{ athlete_id: stan\\.athleteId, tekst: stan\\.tekst, tryb: "blad", ok: false, powod_odrzucenia: powod'), plik);
    assert.match(serve, /return odp\(czas \? 504 : 500, \{ blad: czas \? "czas" : "wyjątek" \}\);/, plik + ': błąd idzie przez odp (CORS)');
    assert.match(s, /stan\.athleteId = ath\.id; stan\.tekst = tekst; stan\.adm = adm;/, plik);
    assert.doesNotMatch(s.slice(s.indexOf('async function obsluz(')), /catch \{ return odp\(50\d/, plik + ': wczesny powrót 5xx bez wpisu');
  }
  const v1 = czytaj('supabase/functions/okienko/index.ts');
  assert.match(v1, /if \(!GEMINI\) return await blad\(502/); assert.match(v1, /catch \(e\) \{ return await blad\(503, \{ blad: "limity" \}/);
  assert.match(v1, /catch \(e\) \{ return await blad\(503, \{ blad: "narzędzie" \}/);
});

test('Gemini: każde wywołanie z okienka ma limit czasu (model, sieć, v2/gemini.mjs)', () => {
  const m = czytaj('supabase/functions/okienko/model.mjs'), si = czytaj('supabase/functions/okienko/siec.mjs'), g = czytaj('supabase/functions/okienko-v2/gemini.mjs');
  for (const [n, s] of [['model', m], ['siec', si], ['gemini', g]]) {
    const wywolania = s.match(/await fetchFn\(url, \{[^\n]*/g) || [];
    assert.ok(wywolania.length >= 1, n);
    for (const w of wywolania) assert.match(w, /signal: ctrl \? ctrl\.signal : undefined/, n + ': fetch do Gemini bez AbortSignal');
  }
});

function swiat(odpowiedzi) {
  const ctx = zaladujSb();
  ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  ctx.navigator = Object.assign({}, ctx.navigator, { onLine: true, userAgent: 'test' });
  const zgloszenia = [], adresy = [];
  ctx.fetch = async (url) => {
    adresy.push(String(url).replace(/^.*\/functions\/v1\//, ''));
    const o = odpowiedzi.shift();
    if (o instanceof Error) throw o;
    return { status: o.status, headers: { get: () => null }, json: async () => o.json };
  };
  ctx.window.sb = Object.assign({}, ctx.window.sb, {
    auth: { getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'u-1' } } } }) },
    rpc: () => Promise.resolve({ data: 'v2' }),
    from: (t) => ({ insert: (w) => { zgloszenia.push(Object.assign({ tabela: t }, w)); return Promise.resolve({ error: null }); } }) });
  vm.runInContext(fs.readFileSync(path.join(KORZEN, 'js/okienko.js'), 'utf8'), ctx, { filename: 'js/okienko.js' });
  return { O: ctx.OKIENKO, zgloszenia, adresy };
}
const OK = { status: 200, json: { zdania: ['Odpowiedź z v1.'], karty: [] } };

test('klient: v2 → 500 (wyjątek) → zgłoszenie do client_errors, to samo pytanie w v1, kolejne pytania od razu v1', async () => {
  const { O, zgloszenia, adresy } = swiat([{ status: 500, json: { blad: 'wyjątek', wersja: 'v2' } }, OK, OK]);
  const o = await O.zapytaj('Moja kontuzja kolana i plan');
  assert.equal(o.status, 200); assert.deepEqual(adresy, ['okienko-v2', 'okienko']);
  assert.equal(zgloszenia.length, 1);
  const z = zgloszenia[0];
  assert.equal(z.tabela, 'client_errors'); assert.equal(z.kind, 'okienko'); assert.equal(z.source, 'okienko-v2'); assert.equal(z.user_id, 'u-1');
  assert.match(z.message, /^http 500 · wyjątek · \d+ ms · ponowione w v1$/);
  assert.doesNotMatch(JSON.stringify(z), /kontuzja|kolana|plan/, 'NIGDY treść pytania');
  await O.zapytaj('drugie'); assert.deepEqual(adresy, ['okienko-v2', 'okienko', 'okienko']);
});

test('klient: błąd sieci/CORS z v2 → ponowienie w v1; bramka 401 (kod Supabase) i przerwanie po 20 s → zgłoszenie bez ponowienia; 429 bez zgłoszenia', async () => {
  let s = swiat([new TypeError('Failed to fetch'), OK]);
  assert.equal((await s.O.zapytaj('a')).status, 200); assert.deepEqual(s.adresy, ['okienko-v2', 'okienko']);
  assert.match(s.zgloszenia[0].message, /^http 502 · TypeError · \d+ ms · ponowione w v1$/);
  s = swiat([{ status: 401, json: { code: 'UNAUTHORIZED_ASYMMETRIC_JWT', message: 'Invalid JWT' } }]);
  assert.equal((await s.O.zapytaj('a')).status, 401); assert.deepEqual(s.adresy, ['okienko-v2']);
  assert.match(s.zgloszenia[0].message, /^http 401 · UNAUTHORIZED_ASYMMETRIC_JWT · \d+ ms$/);
  const przerwanie = new Error('aborted'); przerwanie.name = 'AbortError';
  s = swiat([przerwanie]);
  assert.equal((await s.O.zapytaj('a')).status, 502); assert.deepEqual(s.adresy, ['okienko-v2'], 'po 20 s bez drugiej próby');
  assert.match(s.zgloszenia[0].message, /^http 502 · AbortError · \d+ ms$/);
  s = swiat([{ status: 429, json: { limit: 'dzien' } }]);
  await s.O.zapytaj('a'); assert.equal(s.zgloszenia.length, 0);
  s = swiat(Array.from({ length: 8 }, () => ({ status: 503, json: { blad: 'limity' } })));
  for (let i = 0; i < 8; i++) await s.O.zapytaj('a' + i);
  assert.equal(s.zgloszenia.length, 5, 'najwyżej 5 zgłoszeń na stronę');
});

test('docs: zapis awarii z kolejnością wdrożenia, próbą przed przepięciem i SQL powrotu (bez db push)', () => {
  const d = czytaj('docs/okienko-awaria-2026-11-03.md');
  assert.match(d, /supabase functions deploy okienko --use-api\nsupabase functions deploy okienko-v2 --use-api/);
  assert.match(d, /where klucz = 'v2_dla_wszystkich'/); assert.match(d, /from client_errors where kind = 'okienko'/);
  assert.doesNotMatch(d, /db push/);
});
