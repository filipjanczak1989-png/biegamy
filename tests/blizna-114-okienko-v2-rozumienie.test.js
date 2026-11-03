/* BLIZNA 114 (3.11.2026, Okienko 2.0 etap E2 — rozumienie przed narzędziem; docs/projekt-okienko-2-0-2026-11-03.md §1.1–1.3).
   1) Klasyfikator dostaje WYŁĄCZNIE tekst pytania, datę i ≤ 3 poprzednie pytania z intencją — zero danych użytkownika, zero narzędzi,
      JSON wg schematu, ≤ 96 tokenów, timeout 1,5 s; zła intencja/pewność spoza zakresu → nie_wiem/0; kandydaci bez duplikatu intencji.
   2) Twarde bramki NAD modelem: intencja 'osoba' bez slotu, który jest w pytaniu i wygląda na imię/nazwisko → zdanie + chipy (nigdy
      odpowiedzOsoba); etykiety chipów pisze kod (CHIPY_INTENCJI), model nigdy; pewność < 0,6 / dopytac / nie_wiem → chipy, 0 narzędzi.
   3) Potok: rozumienie PO routerze/osobie/imprezie/katalogu/pamięci sieci i PO limitach (liczy się do 60/dobę), awaria → ścieżka v1
      z powodem 'v2-awaria'; tokeny rozumienia doliczone do wpisu końcowego; 'fakt' → sieć bez modelu z narzędziami; 'odmowa'/'opinia'/
      'pogoda' → stałe zdania bez narzędzi; porada → model bez narzędzi i bez sieci + dopisek, zdania z cyframi odrzucone.
   4) Sloty → argumenty narzędzi v1 (waliduj): data/zakres/weekend dla moj_plan, od/do dla moje_treningi, domyślnie bieżący tydzień. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { atrapa, JA, baza } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const Z = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const DZIS = '2026-11-01';
const odpGemini = (obj, we = 500, wy = 40) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }], usageMetadata: { promptTokenCount: we, candidatesTokenCount: wy } }) });

test('1) rozumienie: tylko tekst + data + 3 poprzednie intencje; schemat; sanityzacja odpowiedzi; timeout', async () => {
  const R = await Z('supabase/functions/okienko-v2/rozumienie.mjs');
  const zadania = [];
  const fetchFn = async (url, o) => { zadania.push({ url, cialo: JSON.parse(o.body) }); return odpGemini({ intencja: 'moje_treningi', pewnosc: 0.92, dopytac: false, kandydaci: ['moje_treningi', 'moj_plan'], sloty: { od: '2026-10-19', do: '2026-10-25', miejsce: ' Poznań ', data: 'wczoraj' } }); };
  const r = await R.rozumienie({ fetchFn, klucz: 'K', tekst: 'a w zeszłym tygodniu?', dzis: DZIS, poprzednie: [{ q: 'ile km w tym tygodniu', intencja: 'moje_treningi' }, { q: 'x', intencja: 'nie-ma-takiej' }, { q: '' }] });
  assert.equal(zadania.length, 1); const c = zadania[0].cialo;
  assert.match(zadania[0].url, /gemini-3\.5-flash-lite:generateContent$/, 'ten sam tani model co v1 (import MODEL)');
  assert.equal(c.generationConfig.responseMimeType, 'application/json'); assert.equal(c.generationConfig.maxOutputTokens, 96); assert.equal(c.generationConfig.temperature, 0);
  assert.ok(!c.tools, 'klasyfikator bez narzędzi');
  const tekst = JSON.stringify(c);
  assert.ok(!/athlete|Testowa|trainings|race_goals|10,2/.test(tekst), 'zero danych użytkownika w zapytaniu');
  assert.match(c.systemInstruction.parts[0].text, /Dziś jest 2026-11-01 \(niedziela\)/);
  assert.deepEqual(c.contents.map((x) => x.role), ['user', 'model', 'user', 'model', 'user'], 'poprzednie pytania jako pary user/model (tylko intencja, nie odpowiedź)');
  assert.equal(c.contents[3].parts[0].text, JSON.stringify({ intencja: 'nie_wiem' }), 'nieznana intencja z historii → nie_wiem');
  assert.deepEqual(r.kandydaci, ['moj_plan'], 'kandydat = własna intencja odrzucony');
  assert.deepEqual(r.sloty, { od: '2026-10-19', do: '2026-10-25', miejsce: 'Poznań' }, 'data „wczoraj” odrzucona, miejsce przycięte');
  assert.equal(r.dopytac, false); assert.deepEqual(r.tok, { we: 500, wy: 40 });
  const zle = await R.rozumienie({ fetchFn: async () => odpGemini({ intencja: 'hack', pewnosc: 7, dopytac: false, kandydaci: ['hack', 'osoba'], sloty: 'x' }), klucz: 'K', tekst: 'x', dzis: DZIS });
  assert.equal(zle.intencja, 'nie_wiem'); assert.equal(zle.pewnosc, 1); assert.equal(zle.dopytac, true); assert.deepEqual(zle.kandydaci, ['osoba']); assert.deepEqual(zle.sloty, {});
  const niska = await R.rozumienie({ fetchFn: async () => odpGemini({ intencja: 'moj_plan', pewnosc: 0.4, dopytac: false, kandydaci: [], sloty: {} }), klucz: 'K', tekst: 'x', dzis: DZIS });
  assert.equal(niska.dopytac, true, 'pewność < 0,6 → dopytać');
  await assert.rejects(R.rozumienie({ fetchFn: async (u, o) => new Promise((_, rej) => { o.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))); }), klucz: 'K', tekst: 'x', dzis: DZIS, timeoutMs: 20 }), /timeout/);
  await assert.rejects(R.rozumienie({ fetchFn: async () => ({ ok: false, status: 503 }), klucz: 'K', tekst: 'x', dzis: DZIS }), /http 503/);
  assert.ok(R.NAZWY_INTENCJI.includes('odmowa') && R.NAZWY_INTENCJI.includes('opinia') && R.NAZWY_INTENCJI.includes('nie_wiem'));
  assert.equal(R.PROG_PEWNOSCI, 0.6);
});

test('2) intencje: osoba tylko ze slotem w pytaniu wyglądającym na osobę; chipy z kodu; stałe zdania; porada bez cyfr + dopisek', async () => {
  const I = await Z('supabase/functions/okienko-v2/intencje.mjs');
  const wolania = [];
  const d = { wykonaj: async () => ({}), szukajWKatalogu: async () => null, odpowiedzOsoba: async (o) => { wolania.push(o.q); return { zdania: ['x'], karty: [], zrodla: [], akcja: null, tok: { we: 0, wy: 0 }, zapytania_sieci: 0, f6: 'ok' }; },
    odpowiedzImpreza: async () => null, zPamieci: async () => null, doPamieci: async () => {}, zapiszZnaleziska: async () => {}, generujJson: async () => ({ json: { zdania: ['Biegaj spokojnie.', 'Zrób 3 treningi w tygodniu po 5 km.'] }, tok: { we: 1, wy: 1 } }) };
  const ctx = { tekst: 'co robi on', sb: atrapa(baza()), adm: atrapa({}), athleteId: JA, jwt: 'T', dzis: DZIS, teraz: new Date(DZIS + 'T10:00:00Z'), fetchFn: async () => ({}), gemini: 'K', d, sieciDozwolona: async () => false, siecZeZrodlami: async () => ({ zdania: [], zrodla: [], tok: { we: 0, wy: 0 }, zapytania: 0 }) };
  const bez = await I.wykonajIntencje(ctx, { intencja: 'osoba', sloty: {}, kandydaci: ['osoba'] });
  assert.equal(bez.body.zdania[0], I.ODP_OSOBA_BEZ_NAZWISKA); assert.ok(bez.body.chipy.length >= 2); assert.deepEqual(wolania, []);
  const nieWPytaniu = await I.wykonajIntencje(ctx, { intencja: 'osoba', sloty: { osoba: 'Jan Kowalski' }, kandydaci: [] });
  assert.equal(nieWPytaniu.body.zdania[0], I.ODP_OSOBA_BEZ_NAZWISKA, 'slot, którego nie ma w pytaniu (model zmyślił) → nie wołamy osoby'); assert.deepEqual(wolania, []);
  const nieOsoba = await I.wykonajIntencje({ ...ctx, tekst: 'wyniki maraton warszawski' }, { intencja: 'osoba', sloty: { osoba: 'maraton warszawski' }, kandydaci: [] });
  assert.equal(nieOsoba.body.zdania[0], I.ODP_OSOBA_BEZ_NAZWISKA, 'slot w pytaniu, ale nie wygląda na osobę'); assert.deepEqual(wolania, []);
  const ok = await I.wykonajIntencje({ ...ctx, tekst: 'ile razy kasia nowak biegla maraton' }, { intencja: 'osoba', sloty: { osoba: 'kasia nowak' }, kandydaci: [] });
  assert.equal(ok.log.tryb, 'osoba'); assert.deepEqual(wolania, ['kasia nowak']);
  for (const [k, zd] of [['pogoda', I.ODP_POGODA], ['odmowa', I.ODP_ODMOWA], ['opinia', I.ODP_OPINIA]]) {
    const w = await I.wykonajIntencje(ctx, { intencja: k, sloty: {}, kandydaci: [] }); assert.equal(w.body.zdania[0], zd, k); assert.deepEqual(w.body.narzedzia, []); assert.deepEqual(w.log.narzedzia, [k]);
  }
  const por = await I.wykonajIntencje({ ...ctx, tekst: 'jak zaczac biegac' }, { intencja: 'porada', sloty: {}, kandydaci: [] });
  assert.deepEqual(por.body.zdania, ['Biegaj spokojnie.', I.DOPISEK_PORADY], 'zdanie z cyframi odrzucone, dopisek na końcu'); assert.deepEqual(por.log.narzedzia, ['porada']);
  for (const k of ['rywal', 'gotowosc', 'porownaj', 'nawigacja', 'fakt', 'nie_wiem']) assert.equal(await I.wykonajIntencje(ctx, { intencja: k, sloty: {}, kandydaci: [] }), null, k + ' → null (ścieżka v1 / E5)');
  assert.deepEqual(I.chipyDla(['moj_plan', 'moje_treningi', 'hack', 'osoba', 'impreza', 'katalog']).map((c) => c.etykieta), ['Mój plan', 'Moje treningi', 'Osoba', 'Impreza'], '≤ 4, tylko znane, etykiety z kodu');
  assert.equal(I.chipyDla(['moj_plan']).length, 4, 'jeden kandydat → domyślne 4 chipy');
  const src = czytaj('supabase/functions/okienko-v2/intencje.mjs');
  assert.ok(!/\.rpc\(|googleapis/.test(src));
});

test('3) sloty → argumenty narzędzi v1 (przez waliduj), domyślny tydzień, weekend = sobota', async () => {
  const I = await Z('supabase/functions/okienko-v2/intencje.mjs');
  const wyk = [];
  const d = { wykonaj: async (sb, a, n, args) => { wyk.push([n, args]); throw new Error('stop — liczą się argumenty'); } };   // 503 z intencje.mjs, zWyniku nie rusza
  const ctx = { tekst: 'x', sb: atrapa(baza()), adm: atrapa({}), athleteId: JA, jwt: 'T', dzis: DZIS, teraz: new Date(DZIS + 'T10:00:00Z'), fetchFn: async () => ({}), gemini: 'K', d };
  await I.wykonajIntencje(ctx, { intencja: 'moj_plan', sloty: { data: '2026-11-07' } }); await I.wykonajIntencje(ctx, { intencja: 'moj_plan', sloty: { zakres: 'weekend' } });
  await I.wykonajIntencje({ ...ctx, dzis: '2026-11-04' }, { intencja: 'moj_plan', sloty: { zakres: 'weekend' } }); await I.wykonajIntencje(ctx, { intencja: 'moj_plan', sloty: { zakres: 'smieci' } });
  await I.wykonajIntencje(ctx, { intencja: 'moje_treningi', sloty: {} }); await I.wykonajIntencje(ctx, { intencja: 'moje_treningi', sloty: { data: '2026-10-31' } });
  await I.wykonajIntencje(ctx, { intencja: 'moje_treningi', sloty: { od: '2026-10-01', do: '2026-10-31' } }); await I.wykonajIntencje(ctx, { intencja: 'biegi_nadchodzace', sloty: { miejsce: 'Kraków', dystans: '21', od: '2026-12-01', do: '2026-12-31' } });
  await I.wykonajIntencje(ctx, { intencja: 'odznaki', sloty: {} }); await I.wykonajIntencje(ctx, { intencja: 'moje_wyniki', sloty: { miejsce: 'Dębno' } });
  assert.deepEqual(wyk, [['moj_plan', { data: '2026-11-07' }], ['moj_plan', { data: '2026-11-01' }], ['moj_plan', { data: '2026-11-07' }], ['moj_plan', { zakres: 'dzis' }],
    ['moje_treningi', { od: '2026-10-26', do: '2026-11-01' }], ['moje_treningi', { od: '2026-10-31', do: '2026-10-31' }], ['moje_treningi', { od: '2026-10-01', do: '2026-10-31' }],
    ['biegi_nadchodzace', { od: '2026-12-01', do: '2026-12-31', miejsce: 'Kraków', dystans: '21' }], ['odznaki_moje', {}], ['moje_wyniki', { gdzie: 'Dębno' }]]);
});

test('4) potok: rozumienie po limitach i po tanich ścieżkach; awaria → v1 z powodem; tokeny doliczone; fakt → sieć bez modelu; niepewne → chipy', async () => {
  const { potok } = await Z('supabase/functions/okienko-v2/potok.mjs');
  const R = await Z('supabase/functions/okienko/router.mjs');
  const we = (tekst, nadpisz, t = {}) => {
    const tab = { okienko_v2_log: [], okienko_siec_cache: [], okienko_znaleziska: [], ...t }; const adm = atrapa(tab);
    const modelWolany = [];
    return { tab, modelWolany, run: () => potok({ tekst, historia: [{ q: 'poprzednie', a: 'x' }], ekran: 'home', athleteId: JA, sb: atrapa(baza()), adm, jwt: 'T', dzis: DZIS, teraz: new Date(DZIS + 'T10:00:00Z'), gemini: 'K', budzet: 0, fetchFn: async () => ({ ok: true, status: 200, json: async () => [] }) },
      { sprawdzLimity: async () => null, uzyteSiecDzis: async () => 0,
        zapytajModel: async () => { modelWolany.push(1); return { zdania: ['Tego nie znajdę w aplikacji.'], karty_z: [], uzyte: [], tok: { we: 2000, wy: 50 }, poza_danymi: true }; },
        zapytajSiec: async () => ({ tekst: 'Wynik.', gm: { groundingChunks: [{ web: { uri: 'https://x.pl/a', title: 'a' } }], groundingSupports: [] }, tok: { we: 1800, wy: 150 }, zapytania: 1 }), ...nadpisz }) };
  };
  const widziane = [];
  const fakt = we('kto wygral maraton w berlinie', { rozumienie: async (o) => { widziane.push(o); return { intencja: 'fakt', pewnosc: 0.95, dopytac: false, kandydaci: [], sloty: {}, tok: { we: 600, wy: 40 } }; } });
  const r1 = await fakt.run();
  assert.equal(r1.body.tryb, 'siec'); assert.equal(fakt.modelWolany.length, 0, 'fakt → sieć bez modelu z narzędziami');
  assert.deepEqual(widziane[0].poprzednie, [{ q: 'poprzednie', intencja: undefined }], 'klasyfikator widzi poprzednie pytania, nie odpowiedzi');
  const log1 = fakt.tab.okienko_v2_log[0]; assert.equal(log1.tok_we, 1800 + 600, 'tokeny rozumienia doliczone'); assert.equal(log1.intencja, 'fakt'); assert.equal(log1.pewnosc, 0.95);
  const awaria = we('ile wody pic na dlugim biegu', { rozumienie: async () => { throw new Error('timeout'); } });
  const r2 = await awaria.run();
  assert.equal(r2.body.tryb, 'siec', 'awaria klasyfikatora → ścieżka v1 (model z narzędziami → poza danymi → sieć)'); assert.equal(awaria.modelWolany.length, 1);
  assert.match(awaria.tab.okienko_v2_log[0].powod_odrzucenia || '', /v2-awaria: rozumienie timeout|^$/);
  const awaria2 = we('jak oceniasz moje szanse na dobry czas', { rozumienie: async () => { throw new Error('timeout'); }, zapytajModel: async () => ({ zdania: ['Nie mam tego w Twoich danych.'], karty_z: [], uzyte: [], tok: { we: 2000, wy: 50 }, poza_danymi: false }) });
  const r2b = await awaria2.run();
  assert.equal(r2b.body.tryb, 'flash'); assert.match(awaria2.tab.okienko_v2_log[0].powod_odrzucenia, /^v2-awaria: rozumienie timeout/, 'powód awarii w logu wpisu modelu');
  const niep = we('ile wody pic na dlugim biegu', { rozumienie: async () => ({ intencja: 'gotowosc', pewnosc: 0.3, dopytac: true, kandydaci: ['moje_starty', 'moja_forma'], sloty: {}, tok: { we: 600, wy: 40 } }) });
  const r3 = await niep.run();
  assert.equal(r3.body.zdania[0], R.ODP_NIEPEWNE); assert.deepEqual(r3.body.chipy.map((c) => c.etykieta), ['Moje starty', 'Forma']); assert.equal(niep.modelWolany.length, 0);
  assert.equal(niep.tab.okienko_v2_log[0].tryb, 'v2-niepewne'); assert.equal(niep.tab.okienko_v2_log[0].intencja, 'gotowosc');
  const limit = we('ile wody pic na dlugim biegu', { sprawdzLimity: async () => 'dzien', rozumienie: async () => { throw new Error('nie wolno wołać'); } });
  const r4 = await limit.run(); assert.equal(r4.status, 429, 'limit PRZED rozumieniem (klasyfikator liczy się do 60/dobę)');
  const router = we('plan na jutro', { rozumienie: async () => { throw new Error('nie wolno wołać'); } });
  const r5 = await router.run(); assert.deepEqual(r5.body.narzedzia, ['moj_plan'], 'router przed rozumieniem — 0 tokenów');
  const pt = czytaj('supabase/functions/okienko-v2/potok.mjs');
  assert.ok(pt.indexOf('const pam = await d.zPamieci(') < pt.indexOf('await d.rozumienie(') && pt.indexOf('await d.sprawdzLimity(') < pt.indexOf('await d.rozumienie('), 'kolejność: pamięć sieci → limity → rozumienie → model v1');
});
