/* BLIZNA 66 (1.11.2026, M2a): „Zapytaj" z sieci (Google Search grounding).

   Ryzyka:
   1) WYCIEK DANYCH DO SIECI. Wywołanie z googleSearch dostaje WYŁĄCZNIE tekst pytania i datę — żadnych wyników
      narzędzi, athlete_id ani historii rozmowy (mogłaby nieść odpowiedzi z danymi).
   2) ZŁY LINK. Źródła tylko https (EF i UI niezależnie); javascript:/http: odpadają.
   3) ZMYŚLONA LICZBA Z SIECI. Zdanie z cyfrą zostaje tylko, gdy groundingSupports obejmuje jego treść.
   4) BEZ ŹRÓDEŁ = BEZ ZDAŃ („Tego nie znalazłem w sieci.").
   5) LIMIT. 20 pytań z sieci / osobę / dobę → 21. = 429 'siec'; koszt zapytań wyszukiwania w budżecie.
   6) TRASA. „Kto wygrał maraton w Berlinie?" → sieć; „ile km w październiku" → router, NIGDY sieć. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');
const { atrapa, baza, JA, OBCY, TERAZ, atrapaGemini, fc, txt } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8');
const gmBerlin = {
  groundingChunks: [
    { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'bmw-berlin-marathon.com' } },
    { web: { uri: 'http://niebezpieczny.example/x', title: 'http' } },
    { web: { uri: 'javascript:alert(1)', title: 'js' } },
  ],
  groundingSupports: [{ segment: { text: 'Maraton w Berlinie w 2025 roku wygrał **Sabastian Sawe** z czasem 2:02:16.' } }],
  webSearchQueries: ['BMW Berlin Marathon 2025 winners'],
};

test('do wywołania z sieci nie trafia żaden wynik narzędzia, athlete_id ani historia — tylko pytanie, data i googleSearch', async () => {
  const S = await zaladuj('supabase/functions/okienko/siec.mjs');
  const g = atrapaGemini([{ candidates: [{ content: { parts: [{ text: 'Wygrał Sabastian Sawe.' }] }, groundingMetadata: gmBerlin }], usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 20 } }]);
  const w = await S.zapytajSiec({ fetchFn: g.fetchFn, klucz: 'K', tekst: 'Kto wygrał maraton w Berlinie?', dzis: '2026-11-01',
    athleteId: JA, wyniki: [{ cele: [{ nazwa: 'Bieg Niepodległości' }] }], historia: [{ q: 'ile km', a: 'Przebiegłeś 120 km.' }] });   // nadmiarowe pola mają być zignorowane
  const cialo = JSON.stringify(g.zadania[0].cialo);
  for (const zakazane of [JA, OBCY, 'Bieg Niepodległości', 'Przebiegłeś', '120 km', 'functionDeclarations', 'functionResponse'])
    assert.ok(!cialo.includes(zakazane), `w żądaniu do sieci: ${zakazane}`);
  assert.equal(JSON.stringify(g.zadania[0].cialo.tools), '[{"googleSearch":{}}]');
  assert.equal(g.zadania[0].cialo.contents.length, 1, 'tylko pytanie, bez historii');
  assert.equal(w.zapytania, 1);
  /* wywołanie w EF przekazuje dokładnie cztery pola */
  assert.match(czytaj('supabase', 'functions', 'okienko', 'index.ts'), /zapytajSiec\(\{ fetchFn: fetch, klucz: GEMINI, tekst, dzis \}\)/);
});

test('źródła tylko https; brak źródeł = brak zdań; strażnik: cyfra bez potwierdzenia w groundingSupports odpada', async () => {
  const S = await zaladuj('supabase/functions/okienko/siec.mjs');
  const o = S.zOdpowiedziSieci('Maraton w Berlinie w 2025 roku wygrał **Sabastian Sawe** z czasem 2:02:16. Pobił rekord o 15 sekund. Kibiców było wielu.', gmBerlin);
  assert.equal(JSON.stringify(o.zrodla.map((z) => z.url)), JSON.stringify(['https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc']));
  assert.equal(JSON.stringify(o.zdania), JSON.stringify(['Maraton w Berlinie w 2025 roku wygrał Sabastian Sawe z czasem 2:02:16.', 'Kibiców było wielu.']));
  assert.equal(o.odrzucone.length, 1); assert.match(o.odrzucone[0].zdanie, /15 sekund/);
  for (const gm of [{}, { groundingChunks: [{ web: { uri: 'http://x', title: 'x' } }] }, { groundingChunks: [{ web: { uri: 'javascript:alert(1)' } }] }]) {
    const p = S.zOdpowiedziSieci('Coś ważnego.', gm);
    assert.equal(JSON.stringify(p.zdania), JSON.stringify([S.NIE_ZNALAZLEM]));
    assert.equal(p.zrodla.length, 0);
  }
  assert.equal(S.zOdpowiedziSieci('', gmBerlin).zdania[0], S.NIE_ZNALAZLEM, 'źródła bez zdań → nic nie mówimy');
});

test('trasa: „Kto wygrał maraton w Berlinie?" → sieć; „ile km w październiku" → router (nigdy sieć); pytania „o mnie" bez narzędzia → nie sieć', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const S = await zaladuj('supabase/functions/okienko/siec.mjs');
  assert.equal(R.dopasuj('Kto wygrał maraton w Berlinie?', '2026-11-01'), null);
  assert.equal(S.czyDoSieci(R.normalizuj('Kto wygrał maraton w Berlinie?'), false, 0), true);
  assert.equal(S.czyDoSieci(R.normalizuj('jaka trasa Półmaratonu Poznańskiego'), false, 0), true);
  assert.ok(R.dopasuj('ile km w październiku', '2026-11-01'), 'router łapie przed modelem — do sieci nie dochodzi');
  for (const q of ['ile kilometrów przebiegłem w lutym 2024', 'czy mam jakieś zaległe treningi', 'jak mi idzie']) assert.equal(S.czyDoSieci(R.normalizuj(q), false, 0), false, q);
  assert.equal(S.czyDoSieci(R.normalizuj('jak poprawić moje tempo na 10 km'), true, 0), true, 'poza_danymi od modelu wygrywa z „moje"');
  assert.equal(S.czyDoSieci(R.normalizuj('kto wygrał w Berlinie'), true, 1), true, 'poza_danymi wygrywa z narzędziem (żywe API 1.11: Berlin → moje_starty)');
  assert.equal(S.czyDoSieci(R.normalizuj('kiedy start'), false, 1), false, 'narzędzie bez poza_danymi = dane, nie sieć');
  const ef = czytaj('supabase', 'functions', 'okienko', 'index.ts');
  assert.ok(ef.indexOf('dopasuj(tekst, dzis)') < ef.indexOf('czyDoSieci('), 'router przed siecią');
});

test('limit sieci: 20 wpisów „siec" dziś → 21. odrzucone (429 siec); inne tryby i cudze się nie liczą; koszt wyszukiwania w budżecie', async () => {
  const L = await zaladuj('supabase/functions/okienko/limity.mjs');
  const rano = '2026-11-01T06:00:00Z';
  const w = (tryb, extra = {}) => Object.assign({ athlete_id: JA, kiedy: rano, tryb, tok_we: 0, tok_wy: 0, zapytania_sieci: 0 }, extra);
  assert.equal(L.LIMIT_SIEC, 20);
  const log = (r) => atrapa({ okienko_log: r });
  assert.equal(await L.uzyteSiecDzis(log([...Array.from({ length: 20 }, () => w('siec')), ...Array.from({ length: 9 }, () => w('flash')), w('siec', { athlete_id: OBCY })]), JA, '2026-11-01'), 20);
  assert.match(czytaj('supabase', 'functions', 'okienko', 'index.ts'), /if \(ileSiec >= LIMIT_SIEC\) \{[\s\S]{0,260}return odp\(429, \{ limit: "siec" \}\);/);
  const koszt = await L.kosztMiesiaca(log([w('siec', { zapytania_sieci: 100 })]), '2026-11-01');
  assert.ok(Math.abs(koszt - 1.4) < 1e-9, `100 zapytań × 0,014 = 1,40 USD, jest ${koszt}`);
  assert.equal(await L.sprawdzLimity(log([w('siec', { athlete_id: OBCY, zapytania_sieci: 1500 })]), JA, '2026-11-01', 20), 'miesiac', '1500 × 0,014 = 21 USD > 20');
});

test('UI: etykieta „z sieci", „Źródła:" jako linki https z rel noopener, bez kart i bez „Otwórz ›"; http/javascript pominięte; tekst przez escapeHtml', () => {
  const ctx = zaladujSb();
  ctx.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  vm.runInContext(czytaj('js', 'okienko.js'), ctx);
  const O = ctx.OKIENKO;
  const html = O.htmlOdpowiedzi(200, { tryb: 'siec', zdania: ['Wygrał <b>Sawe</b>.'], karty: [{ typ: 'start', dane: { nazwa: 'X' } }], akcja: { nawiguj: 'races.html' },
    zrodla: [{ tytul: 'bmw-berlin-marathon.com', url: 'https://vertexaisearch.cloud.google.com/r/abc' }, { tytul: 'zły', url: 'http://x' }, { tytul: 'js', url: 'javascript:alert(1)' }] });
  assert.match(html, /okn-etykieta-siec">z sieci</);
  assert.match(html, /Źródła:/);
  assert.equal((html.match(/<a /g) || []).length, 1, html);
  assert.match(html, /<a href="https:\/\/vertexaisearch\.cloud\.google\.com\/r\/abc" target="_blank" rel="noopener noreferrer">bmw-berlin-marathon\.com<\/a>/);
  assert.ok(!/okn-karta|okn-otworz|javascript:|http:\/\/x/.test(html), html);
  assert.ok(!/<b>Sawe/.test(html) && /&lt;b&gt;Sawe/.test(html));
  assert.match(O.htmlOdpowiedzi(200, { tryb: 'siec', zdania: ['Coś.'], zrodla: [] }), /Tego nie znalazłem w sieci\./, 'brak źródeł = brak zdań');
  assert.match(O.htmlOdpowiedzi(429, { limit: 'siec' }, ''), /koniec szukania w sieci/);
});

test('migracja okienko_log_siec: tryb „siec" w checku, kolumna zapytania_sieci ≥ 0, asercje dostępu, wycofanie', () => {
  const m = czytaj('supabase', 'migrations', '20261101_okienko_log_siec.sql');
  assert.match(m, /check \(tryb in \('router', 'flash', 'siec', 'limit', 'blad', 'budzet80'\)\)/);
  assert.match(m, /add column if not exists zapytania_sieci integer not null default 0 check \(zapytania_sieci >= 0\)/);
  assert.match(m, /has_table_privilege\('anon'/);
  const w = czytaj('supabase', 'migrations', '20261101_WYCOFANIE_okienko_log_siec.sql');
  assert.match(w, /delete from public\.okienko_log where tryb = 'siec'/);
  assert.match(w, /drop column if exists zapytania_sieci/);
});

test('strażnik po zakresach bajtów (1.11): support nakładający się na zdanie wystarczy, tekst nie musi być identyczny; polskie znaki liczone w bajtach', async () => {
  const S = await zaladuj('supabase/functions/okienko/siec.mjs');
  const t = 'Żółta trasa ma 21 km. Start o 9:00 przy Targach. Rekord trasy to 1:01:05.';
  const zz = S.zdaniaZZakresem(t);
  assert.equal(zz[0].do, new TextEncoder().encode('Żółta trasa ma 21 km.').length, 'zakres w bajtach UTF-8');
  const gm = { groundingChunks: [{ web: { uri: 'https://halfmarathon.poznan.pl/trasa', title: 'halfmarathon.poznan.pl' } }],
    groundingSupports: [{ segment: { startIndex: zz[0].od + 3, endIndex: zz[0].do - 2, text: 'zupełnie inny tekst' } }, { segment: { startIndex: zz[1].od, endIndex: zz[1].od + 5, text: 'x' } }] };
  const o = S.zOdpowiedziSieci(t, gm);
  assert.equal(JSON.stringify(o.zdania), JSON.stringify(['Żółta trasa ma 21 km.', 'Start o 9:00 przy Targach.']));
  assert.equal(o.odrzucone.length, 1); assert.match(o.odrzucone[0].zdanie, /1:01:05/);
});

test('brak groundingChunks → JEDNA ponowna próba; dalej brak → „Tego nie znalazłem w sieci."; prompt wymusza wyszukanie', async () => {
  const S = await zaladuj('supabase/functions/okienko/siec.mjs');
  const pusta = { candidates: [{ content: { parts: [{ text: 'Z pamięci: 42 km.' }] }, groundingMetadata: {} }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } };
  const pelna = { candidates: [{ content: { parts: [{ text: 'Trasa wiedzie przez Górczyn.' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://a.example/t', title: 'a' } }], webSearchQueries: ['q'] } }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 6 } };
  const g = atrapaGemini([pusta, pelna]);
  const w = await S.zapytajSiec({ fetchFn: g.fetchFn, klucz: 'K', tekst: 'trasa', dzis: '2026-11-01' });
  assert.equal(g.zadania.length, 2); assert.equal(w.proby, 2);
  assert.equal(JSON.stringify(w.tok), '{"we":30,"wy":11}', 'tokeny obu prób w koszcie');
  assert.equal(S.zOdpowiedziSieci(w.tekst, w.gm).zrodla.length, 1);
  const g2 = atrapaGemini([pusta, pusta, pelna]);
  const w2 = await S.zapytajSiec({ fetchFn: g2.fetchFn, klucz: 'K', tekst: 'trasa', dzis: '2026-11-01' });
  assert.equal(g2.zadania.length, 2, 'trzeciej próby nie ma');
  assert.equal(S.zOdpowiedziSieci(w2.tekst, w2.gm).zdania[0], S.NIE_ZNALAZLEM, 'nigdy zdań bez źródeł');
  assert.match(S.promptSieci('2026-11-01'), /Użyj Google Search przed odpowiedzią; nie odpowiadaj z pamięci\./);
});
