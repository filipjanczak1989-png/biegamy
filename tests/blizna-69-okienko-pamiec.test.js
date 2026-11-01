/* BLIZNA 69 (1.11.2026, M2d): pamięć odpowiedzi z sieci + znaleziska + prywatność pytań o osoby.

   Ryzyka:
   1) NAZWISKO DO GOOGLE. Pytanie będące samym imieniem i nazwiskiem (w logu 1.11 przyszły dwa) nie idzie do sieci
      ani do modelu — tryb 'osoba', „Wyniki osób znajdę w wyszukiwarce wyników.".
   2) STARA PAMIĘĆ. Cache nie zwraca wpisu starszego niż 24 h; trafienie nie woła modelu (0 zł).
   3) CUDZE DANE W PAMIĘCI I ZNALEZISKACH. Cache bez athlete_id i bez pytań o osoby; znaleziska BEZ tekstu pytania —
      tylko nazwa biegu i rok; jedyna dana osobowa = athlete_id zgłaszającego.
   4) ZAPIS GDZIE INDZIEJ. okienko/ pisze wyłącznie do okienko_log, okienko_siec_cache, okienko_znaleziska.
   5) WIDOK TRENERA. Tekst przez textContent, link tylko https (safeExternalHref {tylkoHttps}), rel noopener. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8');

test('detektor osoby: imię i nazwisko (także małymi, jak w logu) → osoba; pytania o biegi, z liczbami, pytające → nie', async () => {
  const P = await zaladuj('supabase/functions/okienko/pamiec.mjs');
  for (const t of ['Jan Kowalski', 'Anna Nowak-Kowalska', 'Jan Maria Rokita', 'filip janczak', 'katarzyna chojnacka\\', 'Jan Kowalski?'])
    assert.equal(P.wygladaNaOsobe(t), true, t);
  for (const t of ['Kto wygrał maraton w Berlinie?', 'trasa Poznań', 'Maraton Warszawski', 'parkrun Gdynia', 'Jan', 'Jan Kowalski 2024',
    'kiedy zapisy', 'ile ważę', 'Jaka jest trasa Półmaratonu Poznańskiego', 'Jan Kowalski Nowak Zieliński'])
    assert.equal(P.wygladaNaOsobe(t), false, t);
});

test('EF: pytanie o osobę zatrzymane PRZED pamięcią i modelem; odpowiedź osobowa NIE idzie do pamięci sieci ani do znalezisk (M2b)', () => {
  const ef = czytaj('supabase', 'functions', 'okienko', 'index.ts');
  const iOsoba = ef.indexOf('const os = osobaZPytania(tekst);');
  assert.ok(iOsoba > ef.indexOf('dopasuj(tekst, dzis)'), 'router zostaje pierwszy');
  for (const dalej of ['zPamieci(adm', 'sprawdzLimity(', 'zapytajModel({']) assert.ok(iOsoba < ef.indexOf(dalej), `osoba po ${dalej}`);
  const blok = ef.slice(iOsoba, ef.indexOf('zPamieci(adm'));
  assert.ok(!/doPamieci|zapiszZnaleziska/.test(blok), 'odpowiedź o osobie w pamięci sieci albo w znaleziskach');
  assert.match(blok, /tryb: "osoba"/);
});

test('pamięć: trafienie ≤ 24 h zwraca zdania i źródła; wpis starszy niż 24 h nie wraca; bez źródeł nie zapisujemy', async () => {
  const P = await zaladuj('supabase/functions/okienko/pamiec.mjs');
  const teraz = new Date('2026-11-01T12:00:00Z');
  const t = { okienko_siec_cache: [
    { klucz: 'kto wygral maraton w berlinie', zdania: ['Wygrał X.'], zrodla: [{ tytul: 'a.pl', url: 'https://a.pl' }], model: 'm', utworzono: '2026-11-01T01:00:00.000Z' },
    { klucz: 'stare pytanie', zdania: ['Stare.'], zrodla: [{ tytul: 'b.pl', url: 'https://b.pl' }], model: 'm', utworzono: '2026-10-31T11:59:00.000Z' }] };
  const adm = atrapa(t);
  const hit = await P.zPamieci(adm, 'kto wygral maraton w berlinie', teraz);
  assert.equal(JSON.stringify(hit.zdania), '["Wygrał X."]');
  assert.equal(await P.zPamieci(adm, 'stare pytanie', teraz), null, 'wpis sprzed 24 h 1 min');
  assert.equal(await P.zPamieci(adm, 'nie ma', teraz), null);
  assert.equal(await P.doPamieci(adm, 'x', ['Zdanie.'], [], 'm', teraz), false, 'bez źródeł nie do pamięci');
  const ef = czytaj('supabase', 'functions', 'okienko', 'index.ts');
  assert.ok(ef.indexOf('zPamieci(adm, klucz, teraz)') < ef.indexOf('zapytajModel({'), 'trafienie przed modelem = 0 zł');
  assert.match(ef, /tryb: "siec-cache" \}\);\s*\n\s*return odp\(200/);
  assert.match(ef, /if \(o\.zrodla\.length && o\.zdania\[0\] !== NIE_ZNALAZLEM\) \{[\s\S]{0,120}doPamieci\(/);
});

test('znaleziska: BEZ tekstu pytania (nazwa biegu + rok), domena z listy albo bieg z rokiem, tylko https; osoba → nic', async () => {
  const P = await zaladuj('supabase/functions/okienko/pamiec.mjs');
  const z = [{ tytul: 'datasport.pl', url: 'https://vertexaisearch.cloud.google.com/r/1' }, { tytul: 'losowy.pl', url: 'https://vertexaisearch.cloud.google.com/r/2' },
    { tytul: 'datasport.pl', url: 'http://zly.example' }];
  const w = P.znaleziskaZ('jakie wyniki miał mój kolega na Maraton Poznański 2025, bo zapomniałem', z);
  assert.equal(w.length, 2, 'bieg z rokiem → obie domeny https; http odpada');
  for (const x of w) {
    assert.equal(x.pytanie, 'Maraton Poznański 2025');
    assert.ok(!/kolega|zapomnia|mój/.test(JSON.stringify(x)), 'tekst pytania w znalezisku');
    assert.equal(x.rok, 2025);
  }
  assert.equal(P.znaleziskaZ('kto wygrał w Berlinie', z).map((x) => x.domena).join(), 'datasport.pl', 'bez roku: tylko domena z listy');
  assert.equal(P.znaleziskaZ('Jan Kowalski', z).length, 0, 'pytanie o osobę nie trafia do znalezisk');
  const Z = await zaladuj('supabase/functions/_shared/zrodla-wynikow.mjs');
  for (const d of ['maratonypolskie.pl', 'protiming.pl', 'zmierzymyczas.pl', 'time2go.pl', 'plus-timing.pl', 'timekeeper.pl', 'inessport.pl', 'time-sport.pl', 'datasport.pl'])
    assert.ok(Z.czyDomenaWynikow(d), d);
  assert.ok(Z.czyDomenaWynikow('wyniki.datasport.pl') && !Z.czyDomenaWynikow('datasport.pl.zly.example') && !Z.czyDomenaWynikow('biegamy.run'));
  const adm = atrapa({ okienko_znaleziska: [] });
  await P.zapiszZnaleziska(adm, JA, w);
  assert.ok(adm.tabele.okienko_znaleziska.every((r) => r.athlete_id === JA && Object.keys(r).every((k) => ['url', 'domena', 'nazwa_biegu', 'rok', 'pytanie', 'athlete_id'].includes(k))), 'zapisane pola');
});

test('okienko/ pisze WYŁĄCZNIE do okienko_log, okienko_siec_cache, okienko_znaleziska', () => {
  const kat = path.join(KORZEN, 'supabase', 'functions', 'okienko');
  const tabeleZapisu = new Set();
  for (const plik of fs.readdirSync(kat)) {
    const kod = fs.readFileSync(path.join(kat, plik), 'utf8');
    for (const m of kod.matchAll(/from\(["']([a-z_]+)["']\)\s*\.(insert|upsert|update|delete)\(/g)) tabeleZapisu.add(m[1]);
    assert.ok(!/\.rpc\(/.test(kod), `${plik}: rpc`);
  }
  assert.equal(JSON.stringify([...tabeleZapisu].sort()), '["okienko_log","okienko_siec_cache","okienko_znaleziska"]');
});

test('widok trenera: textContent, link tylko https (tylkoHttps), rel noopener; ładowany z sekcją Analityka', () => {
  const tr = czytaj('trener.html');
  const f = tr.slice(tr.indexOf('async function loadZnaleziskaOkienka()'), tr.indexOf('async function loadAnalytics()'));
  assert.ok(f.length > 200);
  assert.ok(!/innerHTML/.test(f), 'innerHTML w widoku znalezisk');
  assert.match(f, /safeExternalHref\(z\.url, \{ tylkoHttps: true \}\)/);
  assert.match(f, /a\.rel = 'noopener noreferrer'/);
  assert.match(f, /from\('okienko_znaleziska'\)\.select\(/);
  assert.match(tr, /loadAnalytics\(\);\s*\n\s*loadZnaleziskaOkienka\(\);/);
});

test('migracja okienko_pamiec: cache bez dostępu z przeglądarki i bez athlete_id, znaleziska tylko SELECT trenera, cron 24 h, nowe tryby logu', () => {
  const m = czytaj('supabase', 'migrations', '20261101_okienko_pamiec.sql');
  const cache = m.slice(m.indexOf('create table if not exists public.okienko_siec_cache'), m.indexOf(');', m.indexOf('create table if not exists public.okienko_siec_cache')));
  assert.ok(!/athlete_id/.test(cache), 'athlete_id w cache');
  assert.match(m, /revoke all on public\.okienko_siec_cache from anon, authenticated;/);
  assert.equal((m.match(/create policy/g) || []).length, 1);
  assert.match(m, /using \(exists \(select 1 from public\.coaches c where c\.id = auth\.uid\(\)\)\)/);
  assert.match(m, /url like 'https:\/\/%'/);
  assert.match(m, /cron\.schedule\('okienko-siec-cache-24h'[\s\S]*interval '24 hours'/);
  assert.match(m, /'siec', 'siec-cache', 'osoba'/);
  const w = czytaj('supabase', 'migrations', '20261101_WYCOFANIE_okienko_pamiec.sql');
  assert.match(w, /cron\.unschedule\('okienko-siec-cache-24h'\)/);
  assert.match(w, /drop table if exists public\.okienko_znaleziska/);
});
