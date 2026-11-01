/* BLIZNA 78 (1.11.2026, M3 v2 / M3d): moje_rekordy + moje_wyniki („Który to Ty?"), athletes.f6_runner_key.

   Ryzyka:
   1) PROGNOZA. „Szanse na rekordy" = rekordy + najbliższy start, BEZ przewidywanego czasu; rekord tylko gdy dystans
      startu pasuje do jednego z czterech.
   2) CUDZE WYNIKI. Imiennicy w maszynie → karta „Który to Ty?", nigdy wyniki pierwszego z brzegu; rocznik z profilu
      zawęża. Zapamiętany wybór (f6_runner_key) wygrywa.
   3) ZAPIS. Jedyny zapis = RPC ustaw_f6_runner_key po tapnięciu (przeglądarka, auth.uid()); EF i model nie piszą.
      Migracja: kolumna z CHECK formatu, wyzwalacz blokujący zmianę poza RPC (tabelowy UPDATE authenticated by ją
      inaczej przepuścił), GRANT SELECT kolumny, anon bez EXECUTE, plik WYCOFANIE.
   4) Brak imienia i nazwiska → do Profilu, nie zgadywanie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8');
const TERAZ = new Date('2026-11-01T10:00:00Z');

const WYNIKI = [
  { event_name: '52. Maraton Dębno 2026', event_date: '2026-10-18', event_city: 'Dębno', distance_km: 42.195, time_seconds: 10652, position_total: 45 },
  { event_name: 'Bieg Kiliński', event_date: '2026-09-01', event_city: 'Łódź', distance_km: 21.0975, time_seconds: 6000, position_total: 19 },
];
function f6Atrapa({ runners = [], status = 200 } = {}) {
  const wolania = [];
  return { wolania, fetchFn: async (url, init) => {
    const a = JSON.parse(init.body); const rpc = url.split('/rpc/')[1]; wolania.push({ rpc, args: a });
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => (rpc === 'search_runners' ? runners : WYNIKI) };
  } };
}
const R = (k, yob, n = 12) => ({ runner_key: 'datasport:' + k, display_name: 'CHOJNACKA KATARZYNA', yob, results_count: n, last_event: 'Maraton Dębno', last_city: 'Dębno' });
async function wyn(ath, f6, args = {}) {
  (await zaladuj('supabase/functions/okienko/f6.mjs'))._wyczyscPamiecF6();
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const sb = atrapa({ athletes: [{ id: JA, ...ath }] });
  return { w: await N.wykonaj(sb, JA, 'moje_wyniki', args, TERAZ, { fetchFn: f6.fetchFn, token: 'TOK' }), sb };
}

test('moje_rekordy: cztery dystanse z rokiem; pusto → do Profilu; szanse = start + rekord na tym dystansie, bez prognozy', async () => {
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const { zWyniku } = await zaladuj('supabase/functions/okienko/odpowiedz.mjs');
  const sb = atrapa({ athletes: [{ id: JA, pb_5k: '22:41', pb_5k_year: 2025, pb_half: '1:45:10', pb_half_year: 2024,
    race_goals: JSON.stringify([{ name: 'Półmaraton Jesienny', date: '2026-11-15', distance_km: 21.1 }]) }], races: [] });
  const w = await N.wykonaj(sb, JA, 'moje_rekordy', {}, TERAZ);
  assert.deepEqual(w.rekordy.map((r) => [r.dystans, r.czas, r.rok]), [['5 km', '22:41', 2025], ['półmaraton', '1:45:10', 2024]]);
  assert.equal(zWyniku('moje_rekordy', w, {}).zdania[0], 'Twoje rekordy: 5 km 22:41 (2025), półmaraton 1:45:10 (2024).');
  const s = await N.wykonaj(sb, JA, 'moje_rekordy', { szanse: true }, TERAZ);
  const z = zWyniku('moje_rekordy', s, { szanse: true }).zdania;
  assert.deepEqual(z, ['Najbliższy start: Półmaraton Jesienny, za 14 dni (15.11).', 'Twój rekord na tym dystansie: 1:45:10 (2024).']);
  assert.ok(!/przewid|prognoz|pobiegniesz|szansa|%|około/i.test(z.join(' ')), 'prognoza czasu');
  assert.equal(zWyniku('moje_rekordy', { rekordy: [] }, {}).zdania[0], 'Nie masz jeszcze wpisanych rekordów — uzupełnisz je w Profilu.');
  const R0 = await zaladuj('supabase/functions/okienko/router.mjs');
  assert.deepEqual(R0.dopasuj('jakie mam szanse na rekordy', '2026-11-01'), { narzedzie: 'moje_rekordy', args: { szanse: true } });
  assert.equal(R0.dopasuj('najlepszy czas na 10 km', '2026-11-01').narzedzie, 'moje_rekordy');
  assert.equal(R0.dopasuj('Kto ma rekord trasy w Berlinie', '2026-11-01'), null);
});

test('moje_wyniki: imiennicy → „Który to Ty?" (≤ 5, klucze z wzorca); rocznik zawęża do jednego → karta wyników', async () => {
  const runners = [R('1', 1991), R('2', 1973, 14), R('3', 1993, 2)];
  const kilku = await wyn({ full_name: 'Katarzyna Chojnacka', date_of_birth: null }, f6Atrapa({ runners }));
  assert.equal(kilku.w.wybor.length, 3);
  assert.ok(kilku.w.wybor.every((o) => /^datasport:\d+$/.test(o.klucz)));
  const jeden = await wyn({ full_name: 'Katarzyna Chojnacka', date_of_birth: '1991-05-02' }, f6Atrapa({ runners }));
  assert.equal(jeden.w.wyniki.starty, 12); assert.equal(jeden.w.wyniki.rocznik, 1991);
  const { zWyniku } = await zaladuj('supabase/functions/okienko/odpowiedz.mjs');
  assert.equal(zWyniku('moje_wyniki', kilku.w, {}).karty[0].typ, 'ktory_to_ty');
  assert.equal(zWyniku('moje_wyniki', jeden.w, {}).karty[0].typ, 'wyniki');
});

test('moje_wyniki: zapamiętany f6_runner_key wygrywa (bez search_runners); „w Dębnie" filtruje; brak imienia → Profil; 429 → maszyna zajęta', async () => {
  const f = f6Atrapa({ runners: [R('1', 1991), R('2', 1973)] });
  const z = await wyn({ full_name: 'Katarzyna Chojnacka', f6_runner_key: 'datasport:368751' }, f);
  assert.deepEqual(f.wolania.map((x) => x.rpc), ['runner_results']); assert.equal(f.wolania[0].args.p_runner_key, 'datasport:368751');
  assert.equal(z.w.wyniki.starty, 2);
  const g = await wyn({ full_name: 'Katarzyna Chojnacka', f6_runner_key: 'datasport:368751' }, f6Atrapa(), { gdzie: 'Dębnie' });
  assert.equal(g.w.wyniki.starty, 1); assert.equal(g.w.wyniki.ostatnie[0].miasto, 'Dębno');
  assert.equal((await wyn({ full_name: 'Katarzyna Chojnacka', f6_runner_key: 'datasport:1' }, f6Atrapa(), { gdzie: 'Berlinie' })).w.brak_gdzie, true);
  const { zWyniku } = await zaladuj('supabase/functions/okienko/odpowiedz.mjs');
  const bi = zWyniku('moje_wyniki', (await wyn({ full_name: 'Kasia' }, f6Atrapa())).w, {});
  assert.deepEqual(bi.zdania, ['Uzupełnij imię i nazwisko w Profilu, to znajdę Twoje wyniki.']); assert.deepEqual(bi.akcja, { nawiguj: 'profil.html' });
  assert.deepEqual(zWyniku('moje_wyniki', (await wyn({ full_name: 'Katarzyna Chojnacka' }, f6Atrapa({ status: 429 }))).w, {}).zdania, ['Maszyna wyników jest teraz zajęta — spróbuj za chwilę.']);
  const { sb } = await wyn({ full_name: 'Katarzyna Chojnacka', date_of_birth: '1991-01-01' }, f6Atrapa({ runners: [R('1', 1991)] }));
  assert.ok(sb.zapytania.every((q) => q.zapis === false), 'EF nie zapisuje');
  const R0 = await zaladuj('supabase/functions/okienko/router.mjs');
  assert.deepEqual(R0.dopasuj('jak mi poszło w Dębnie', '2026-11-01'), { narzedzie: 'moje_wyniki', args: { gdzie: 'Dębnie' } });
});

test('migracja: kolumna z CHECK formatu, wyzwalacz blokuje zapis poza RPC, RPC z auth.uid(), anon bez EXECUTE, GRANT SELECT, WYCOFANIE', () => {
  const m = czytaj('supabase', 'migrations', '20261101_f6_runner_key.sql');
  assert.match(m, /add column if not exists f6_runner_key text\s*\n\s*check \(f6_runner_key is null or f6_runner_key ~ '\^\[a-z0-9_-\]\{2,30\}:\[A-Za-z0-9\._-\]\{1,80\}\$'\)/);
  assert.match(m, /grant select \(f6_runner_key\) on public\.athletes to authenticated;/);
  assert.match(m, /create trigger athletes_f6_klucz_tylko_rpc before insert or update of f6_runner_key on public\.athletes/);
  assert.match(m, /current_setting\('biegamy\.f6_rpc', true\)/);
  assert.match(m, /security definer/); assert.match(m, /where user_id = auth\.uid\(\);/);
  assert.match(m, /revoke all on function public\.ustaw_f6_runner_key\(text\) from public, anon;/);
  assert.match(m, /has_function_privilege\('anon', 'public\.ustaw_f6_runner_key\(text\)', 'execute'\)/);
  const wy = czytaj('supabase', 'migrations', '20261101_WYCOFANIE_f6_runner_key.sql');
  assert.match(wy, /drop column if exists f6_runner_key/); assert.match(wy, /drop function if exists public\.ustaw_f6_runner_key\(text\)/);
  for (const f of fs.readdirSync(path.join(KORZEN, 'supabase', 'functions', 'okienko')))
    assert.ok(!/ustaw_f6_runner_key|f6_runner_key\s*[:=]\s*[^=]/.test(fs.readFileSync(path.join(KORZEN, 'supabase', 'functions', 'okienko', f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/a\.f6_runner_key/g, '')), `${f}: zapis klucza w EF`);
});

test('UI: „To ja" przez data-ktoty → RPC ustaw_f6_runner_key z kluczem z wzorca, potem ponowne pytanie; zły klucz → nic', async () => {
  const rpc = [];
  const okno = { escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    sb: { rpc: async (n, a) => { rpc.push([n, a]); return { error: null }; }, auth: { getSession: async () => ({ data: { session: null } }) } } };
  const ctx = vm.createContext({ window: okno, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: {}, setTimeout, console, Promise });
  vm.runInContext(czytaj('js', 'okienko.js'), ctx);
  const O = okno.OKIENKO;
  const html = O.htmlOdpowiedzi(200, { tryb: 'router', zdania: ['Który to Ty?'], karty: [{ typ: 'ktory_to_ty', dane: { opcje: [
    { klucz: 'datasport:1', nazwa: 'CHOJNACKA KATARZYNA', rocznik: 1991, starty: 12, ostatni: 'Maraton Dębno' }, { klucz: "x');alert(1)", nazwa: 'Zły' }] } },
    { typ: 'rekord', dane: { dystans: '5 km', czas: '22:41', rok: 2025 } }] });
  assert.equal((html.match(/data-ktoty=/g) || []).length, 1); assert.ok(!html.includes('Zły')); assert.ok(!/onclick/i.test(html));
  assert.match(html, /rocznik 1991 · 12 startów · ostatni: Maraton Dębno/); assert.match(html, /<b>5 km<\/b><span class="okn-meta">22:41 · 2025/);
  const b = (k) => ({ getAttribute: () => k, disabled: false });
  assert.equal(await O.akcjaKtoTy(b('datasport:1')), true);
  assert.equal(JSON.stringify(rpc), JSON.stringify([['ustaw_f6_runner_key', { p_key: 'datasport:1' }]]));
  assert.equal(await O.akcjaKtoTy(b('zly klucz')), false); assert.equal(rpc.length, 1);
});
