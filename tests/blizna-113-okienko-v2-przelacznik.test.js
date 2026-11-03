/* BLIZNA 113 (3.11.2026, Okienko 2.0 etap E0 — docs/projekt-okienko-2-0-2026-11-03.md §2, OK Filipa 3.11).
   1) Przełącznik W BAZIE, nie w kodzie: migracja 20261105 (okienko_ustawienia, okienko_v2_konta, RPC okienko_wersja, okienko_v2_log z ms,
      okienko_v2_rozmowa) — revoke jawny, authenticated czyta tylko swój log v2 i woła RPC; dwa konta na liście; WYCOFANIE; test RLS po skutku.
   2) Klient: wersję wybiera RPC raz na sesję, błąd/brak RPC → v1; adres EF tylko z 'v2' idzie do okienko-v2; nagłówek X-Okienko-Wersja: v1
      z EF v2 przełącza sesję na v1; etykieta „okienko 2.0” tylko przy wersja:'v2'; stary kształt odpowiedzi bez zmian.
   3) EF okienko-v2 NIE KOPIUJE: żadnych własnych regexów routera, deklaracji narzędzi ani strażnika — tylko importy z ../okienko/;
      zapis service wyłącznie do okienko_v2_log (log-v2.mjs); każdy wpis z ms; config.toml ma wpis; limity v2 z progami v1. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');
const { atrapa, JA } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8').replace(/\r/g, '');
const OKN = czytaj('js', 'okienko.js');
const FILIP = '56092926-2cf1-44b6-952f-38614497fdc2', TEST = '9c2df65c-6a46-410e-ad5f-474e5d973ec9';

function swiat(rpc, naglowek) {
  const ctx = zaladujSb();
  const m = new Map();
  ctx.sessionStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  ctx.navigator = Object.assign({}, ctx.navigator, { onLine: true });
  ctx.SB_URL = 'https://x.supabase.co'; ctx.SB_KEY = 'k';
  ctx.sb = { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) }, rpc };
  ctx.__fetch = [];
  ctx.fetch = async (url, o) => { ctx.__fetch.push(url); return { status: 200, headers: { get: (h) => (h === 'x-okienko-wersja' ? naglowek || null : null) }, json: async () => ({ zdania: ['Oto.'], karty: [], akcja: null, tryb: 'router' }) }; };
  vm.runInContext(OKN, ctx, { filename: 'js/okienko.js' });
  return { ctx, O: ctx.OKIENKO };
}

test('1) migracja: cztery tabele z jawnym revoke, log v2 z ms/intencja/pewnosc/ocena, RPC tylko dla authenticated, dwa konta, retencja, WYCOFANIE, test RLS', () => {
  const m = czytaj('supabase/migrations/20261105_okienko_v2_przelacznik.sql');
  for (const t of ['okienko_ustawienia', 'okienko_v2_konta', 'okienko_v2_log', 'okienko_v2_rozmowa']) {
    assert.match(m, new RegExp(`create table if not exists public\\.${t} \\(`), t);
    assert.match(m, new RegExp(`alter table public\\.${t} enable row level security;`), t + ' RLS');
    assert.match(m, new RegExp(`revoke all on public\\.${t} from anon, authenticated;`), t + ' revoke');
  }
  assert.equal((m.match(/^grant select on public\.okienko_v2_log to authenticated;$/gm) || []).length, 1, 'jedyny grant tabelowy: SELECT na logu v2');
  assert.equal((m.match(/^grant /gm) || []).length, 2, 'dwa granty w całej migracji: select log v2 + execute RPC');
  assert.match(m, /create policy okienko_v2_log_wlasciciel_czyta on public\.okienko_v2_log\s+for select to authenticated\s+using \(athlete_id = \(select a\.id from public\.athletes a where a\.user_id = auth\.uid\(\) limit 1\)\);/);
  assert.equal((m.match(/create policy/g) || []).length, 1, 'ustawienia/konta/rozmowa bez polityk — nikt z przeglądarki');
  assert.match(m, /create or replace function public\.okienko_wersja\(\)\s+returns text\s+language sql stable security definer\s+set search_path = public, pg_temp/);
  assert.match(m, /k\.athlete_id = public\.auth_my_athlete_id\(\)/, 'konto z sesji, nie z parametru');
  assert.match(m, /revoke all on function public\.okienko_wersja\(\) from public, anon, authenticated;\s*grant execute on function public\.okienko_wersja\(\) to authenticated;/);
  assert.match(m, /\('v2_wlaczone', 'true'\), \('v2_dla_wszystkich', 'false'\)/, 'start: v2 włączone tylko dla listy');
  assert.ok(m.includes(`('${FILIP}', 'Filip — konto główne')`) && m.includes(`('${TEST}', 'konto testowe (próba akcji)')`), 'Filip + konto testowe (Filip 3.11)');
  assert.match(m, /tryb\s+text not null check \(tryb in \('router', 'flash', 'siec', 'siec-cache', 'osoba', 'impreza', 'limit', 'blad', 'budzet80', 'v2', 'v2-awaria', 'v2-niepewne'\)\)/);
  for (const k of ['intencja', 'pewnosc', 'plan', 'ms', 'samosprawdzenie', 'ocena']) assert.match(m, new RegExp(`^  ${k}\\s`, 'm'), 'kolumna ' + k);
  assert.match(m, /ocena\s+smallint check \(ocena is null or ocena in \(-1, 1\)\)/);
  assert.match(m, /cron\.schedule\('okienko-v2-log-30d', '29 3 \* \* \*'/); assert.match(m, /cron\.schedule\('okienko-v2-rozmowa-1d', '31 3 \* \* \*'/);
  assert.match(m, /if public\.okienko_wersja\(\) <> 'v1' then/, 'asercja: bez sesji v1');
  const w = czytaj('supabase/migrations/20261105_WYCOFANIE_okienko_v2_przelacznik.sql');
  for (const t of ['okienko_v2_rozmowa', 'okienko_v2_log', 'okienko_v2_konta', 'okienko_ustawienia']) assert.match(w, new RegExp(`drop table if exists public\\.${t};`));
  assert.match(w, /drop function if exists public\.okienko_wersja\(\);/);
  const t = czytaj('tools/okienko-v2-test.sql');
  for (const f of ['FAIL 1a', 'FAIL 1b', 'FAIL 1e', 'FAIL 2a', 'FAIL 2b', 'FAIL 3a', 'FAIL 3b', 'FAIL 4a']) assert.ok(t.includes(f), f);
  assert.match(czytaj('tools/okienko-v2-test.sh'), /OV2_Z_MIGRACJA/);
  assert.match(czytaj('supabase/config.toml'), /\[functions\.okienko-v2\]\s*\nverify_jwt = true/);
});

test('2) klient: RPC raz na sesję, v2 → okienko-v2, błąd/brak RPC → v1, nagłówek v1 przełącza sesję, etykieta tylko przy wersja v2', async () => {
  let wolan = 0;
  const v2 = swiat(async () => { wolan++; return { data: 'v2', error: null }; });
  await v2.O.zapytaj('plan na jutro'); await v2.O.zapytaj('ile km');
  assert.deepEqual(v2.ctx.__fetch, ['https://x.supabase.co/functions/v1/okienko-v2', 'https://x.supabase.co/functions/v1/okienko-v2']);
  assert.equal(wolan, 1, 'RPC raz na sesję');
  const v1 = swiat(async () => ({ data: 'v1', error: null }));
  await v1.O.zapytaj('plan'); assert.equal(v1.ctx.__fetch[0], 'https://x.supabase.co/functions/v1/okienko');
  const blad = swiat(async () => { throw new Error('rpc'); });
  await blad.O.zapytaj('plan'); assert.equal(blad.ctx.__fetch[0], 'https://x.supabase.co/functions/v1/okienko', 'błąd RPC → v1');
  const brak = swiat(undefined);
  await brak.O.zapytaj('plan'); assert.equal(brak.ctx.__fetch[0], 'https://x.supabase.co/functions/v1/okienko', 'brak RPC (stare sb) → v1');
  const smiec = swiat(async () => ({ data: 'v3', error: null }));
  await smiec.O.zapytaj('plan'); assert.equal(smiec.ctx.__fetch[0], 'https://x.supabase.co/functions/v1/okienko', 'nieznana wartość → v1');
  const awaria = swiat(async () => ({ data: 'v2', error: null }), 'v1');
  await awaria.O.zapytaj('a'); await awaria.O.zapytaj('b');
  assert.deepEqual(awaria.ctx.__fetch.map((u) => u.split('/').pop()), ['okienko-v2', 'okienko'], 'X-Okienko-Wersja: v1 → do końca sesji v1');
  const O = v2.O;
  assert.match(O.htmlOdpowiedzi(200, { zdania: ['Oto.'], karty: [], akcja: null, wersja: 'v2' }), /^<p class="okn-etykieta-siec okn-wersja">okienko 2\.0<\/p><p class="okn-zdanie">Oto\.<\/p>/);
  assert.doesNotMatch(O.htmlOdpowiedzi(200, { zdania: ['Oto.'], karty: [], akcja: null }), /okienko 2\.0/);
  assert.doesNotMatch(O.htmlOdpowiedzi(429, { limit: 'dzien', wersja: 'v2' }, ''), /okienko 2\.0/, 'etykieta tylko przy 200');
  assert.match(OKN, /function otworz\(\) \{[\s\S]*?wersjaOkienka\(\);/, 'RPC rusza przy otwarciu arkusza');
});

test('3) EF okienko-v2: tylko importy z ../okienko (zero kopii), zapis service wyłącznie okienko_v2_log, ms w każdym wpisie, limity z progów v1', async () => {
  const kat = path.join(KORZEN, 'supabase', 'functions', 'okienko-v2');
  const pliki = fs.readdirSync(kat).filter((f) => /\.(ts|mjs)$/.test(f));
  const tabeleZapisu = new Set();
  for (const f of pliki) {
    const kod = czytaj('supabase/functions/okienko-v2', f);
    for (const m of kod.matchAll(/from\(["']([a-z_0-9]+)["']\)\s*\.(insert|upsert|update|delete)\(/g)) tabeleZapisu.add(m[1]);
    assert.ok(!/\.rpc\(/.test(kod), `${f}: rpc`);
    assert.doesNotMatch(kod, /const (ZAGADKA|REAKCJA|PYT_|ZDROWIE|DEKLARACJE|NAZWY)\w* = /, `${f}: własna kopia reguły routera / narzędzi`);
    assert.doesNotMatch(kod, /export function (dopasuj|sprawdz|osobaZPytania|imprezaZPytania|zapytajModel|zapytajSiec)\b/, `${f}: kopia funkcji v1`);
    assert.doesNotMatch(kod, /googleapis\.com/, `${f}: model woła się tylko przez moduły v1`);
  }
  assert.equal(JSON.stringify([...tabeleZapisu].sort()), '["okienko_v2_log"]');
  const ef = czytaj('supabase/functions/okienko-v2/index.ts'), pt = czytaj('supabase/functions/okienko-v2/potok.mjs');
  assert.match(ef, /import \{ potok \} from "\.\/potok\.mjs";/, 'index.ts = tylko HTTP; orkiestracja w potok.mjs (ta sama na ławce v2)');
  assert.ok(!/from "\.\/(router|narzedzia|model|siec|osoba|impreza|katalog|straznik|pamiec|odpowiedz|limity)\.mjs"/.test(pt), 'moduły v1 z ../okienko/, nie z ./');
  for (const mod of ['router', 'narzedzia', 'model', 'siec', 'osoba', 'impreza', 'katalog', 'straznik', 'pamiec', 'odpowiedz']) assert.match(pt, new RegExp(`from "\\.\\./okienko/${mod}\\.mjs"`), mod);
  assert.match(pt, /return d\.zapiszLog\(adm, \{ athlete_id: athleteId, tekst, \.\.\.w, ms: Date\.now\(\) - T0 \}\);/, 'ms w każdym wpisie');
  assert.ok(!/zapiszLog\(adm/.test(ef + pt.replace(/d\.zapiszLog\(adm/g, '')), 'v2 nie pisze do okienko_log');
  assert.equal((pt.match(/zapiszLogV2\(/g) || []).length, 0, 'wszystkie wpisy przez log() z ms (zapiszLogV2 tylko jako DOMYSLNE.zapiszLog)');
  assert.match(ef, /"Access-Control-Expose-Headers": "X-Okienko-Wersja"/);
  assert.match(pt, /const traf = dopasuj\(tekst, dzis\);/); assert.ok(pt.indexOf('const traf = dopasuj(tekst, dzis);') < pt.indexOf('const os = osobaZPytania(tekst);'), 'router (B1) przed osobą');
  assert.match(pt, /export async function potok\(we, nadpisz = \{\}\)/, 'zależności podmienialne (ławka: atrapy modelu/sieci/limitów/logu)');
  // log-v2.mjs na atrapie: limit dzienny liczy 'v2' i 'flash', zapis z ms/intencja/pewnosc przyciętymi
  const L = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/okienko-v2/log-v2.mjs')).href);
  const t = { okienko_v2_log: [], okienko_log: [] };
  const adm = atrapa(t);
  assert.equal(await L.zapiszLogV2(adm, { athlete_id: JA, tekst: 'x'.repeat(400), tryb: 'v2', ms: 1234.6, pewnosc: 1.7, intencja: 'moj_plan', plan: ['moj_plan'] }), true);
  const w = t.okienko_v2_log[0];
  assert.equal(w.tekst.length, 300); assert.equal(w.ms, 1235); assert.equal(w.pewnosc, 1); assert.equal(w.intencja, 'moj_plan'); assert.deepEqual(w.plan, ['moj_plan']); assert.equal(w.samosprawdzenie, null);
  for (let i = 0; i < 60; i++) t.okienko_v2_log.push({ athlete_id: JA, tryb: i % 2 ? 'flash' : 'v2', kiedy: '2026-11-05T09:00:00.000Z' });   // pierwszy wpis ma kiedy=dziś, poza dobą 5.11
  assert.equal(await L.uzyteDzisV2(adm, JA, '2026-11-05'), 60); assert.equal(await L.sprawdzLimityV2(adm, JA, '2026-11-05', 0), 'dzien');
  assert.equal(L.TRYBY_MODELU.includes('router'), false, 'router i chipy nie liczą się do limitu');
  const l = czytaj('supabase/functions/okienko-v2/log-v2.mjs');
  assert.match(l, /import \{ LIMIT_DZIENNY, LIMIT_SIEC, PROG_OSTRZEZENIA, kosztMiesiaca as kosztMiesiacaV1 \} from "\.\.\/okienko\/limity\.mjs";/, 'progi z v1, budżet v1+v2');
  assert.match(l, /const koszt = \(await kosztMiesiacaV1\(adm, dzis\)\) \+ \(await kosztMiesiacaV2\(adm, dzis\)\);/);
});
