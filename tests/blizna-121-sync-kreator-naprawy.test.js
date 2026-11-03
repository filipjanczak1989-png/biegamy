/* BLIZNA 121 (3.11.2026, Filip 11:53 — Kasia po zmianie telefonu: import martwy od 6.10, w intervals przy Garminie 401).
   STATUS SYNCHRONIZACJI + KREATOR NAPRAWY: status wskazuje OGNIWO (brak | token | zegarek | import | ok | siec) na podstawie intervals
   (ogniwo.mjs), nie samego czasu; nazwa źródła z intervals („Garmin Connect”), żeby kroki mówiły „Garmin”, nie ogólnie.
   Tabela intervals_status: pisze tylko EF, czyta właściciel i trener. Klient: pełny kreator w Profilu (kroki ①–④ z linkami), jednorazowy pasek
   na Dziś, lista trenera + „Sprawdź zegarki wszystkich”. Teksty bez żargonu (token/OAuth/CSRF). Poprawiony state OAuth: zapas w localStorage
   (zgoda wraca w innej karcie na telefonie). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const ZARGON = /\btoken\b|OAuth|CSRF|JWT|refresh/i;

test('ogniwo.mjs — decyzja z intervals, nie z czasu; źródło po polsku; 401 = nasze połączenie; cisza > 7 dni = zegarek; nowsze w intervals = import', async () => {
  const O = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/intervals-status/ogniwo.mjs')).href);
  const d = '2026-11-03';
  assert.equal(O.ustalOgniwo({ polaczony: false, http: null, aktywnosci: [], ostBiegamy: null, dzis: d }).ogniwo, 'brak');
  assert.equal(O.ustalOgniwo({ polaczony: true, http: 401, aktywnosci: [], ostBiegamy: '2026-10-06', dzis: d }).ogniwo, 'token');
  assert.equal(O.ustalOgniwo({ polaczony: true, http: 403, aktywnosci: [], ostBiegamy: null, dzis: d }).ogniwo, 'token');
  const kasia = O.ustalOgniwo({ polaczony: true, http: 200, aktywnosci: [{ start_date_local: '2026-10-06T11:49:28', source: 'GARMIN_CONNECT', device_name: 'Garmin fenix 3' }, { start_date_local: '2026-10-01T08:00:00', source: 'GARMIN_CONNECT' }], ostBiegamy: '2026-10-06', dzis: d });
  assert.equal(kasia.ogniwo, 'zegarek'); assert.equal(kasia.zrodlo, 'Garmin Connect'); assert.equal(kasia.urzadzenie, 'Garmin fenix 3'); assert.equal(kasia.ost_intervals, '2026-10-06'); assert.equal(kasia.dni_ciszy, 28); assert.equal(kasia.szczegoly.aktywnosci_30d, 2);
  assert.equal(O.ustalOgniwo({ polaczony: true, http: 200, aktywnosci: [], ostBiegamy: null, dzis: d }).ogniwo, 'zegarek', 'zero aktywności w 30 dni');
  assert.equal(O.ustalOgniwo({ polaczony: true, http: 200, aktywnosci: [{ start_date_local: '2026-11-02T08:00:00', source: 'COROS' }], ostBiegamy: '2026-10-20', dzis: d }).ogniwo, 'import');
  assert.equal(O.ustalOgniwo({ polaczony: true, http: 200, aktywnosci: [{ start_date_local: '2026-11-02T08:00:00' }], ostBiegamy: '2026-11-02', dzis: d }).ogniwo, 'ok');
  assert.equal(O.ustalOgniwo({ polaczony: true, http: 200, aktywnosci: [{ start_date_local: '2026-11-02T08:00:00' }], ostBiegamy: '2026-11-01', dzis: d }).ogniwo, 'ok', '1 dzień różnicy (strefa) to nie import');
  assert.equal(O.ustalOgniwo({ polaczony: true, http: 0, aktywnosci: [], ostBiegamy: null, dzis: d }).ogniwo, 'siec'); assert.equal(O.ustalOgniwo({ polaczony: true, http: 500, aktywnosci: [], ostBiegamy: null, dzis: d }).ogniwo, 'siec');
  assert.equal(O.nazwaZrodla('POLAR', null), 'Polar Flow'); assert.equal(O.nazwaZrodla(null, 'COROS PACE 3'), 'Coros'); assert.equal(O.nazwaZrodla(null, 'Forerunner 255'), 'Garmin Connect'); assert.equal(O.nazwaZrodla(null, null), null);
  assert.equal(O.PROG_CISZY_DNI, 7);
});

test('EF intervals-status + migracja: własny albo podopieczny, service pisze tylko intervals_status i flagę martwego tokena, RLS własny+trener', () => {
  const e = czytaj('supabase/functions/intervals-status/index.ts');
  assert.match(e, /if \(!user\) return J\(401/); assert.match(e, /\.eq\("id", athleteId\)\.eq\("coach_id", user\.id\)\.maybeSingle\(\);\s*if \(!pod\) return J\(403/, 'cudzy status tylko dla trenera podopiecznego');
  assert.match(e, /\.eq\("coach_id", user\.id\)\.not\("intervals_athlete_id", "is", null\)\.limit\(MAX_WSZYSCY\)/);
  assert.match(e, /activities\?oldest=\$\{oldest\}&newest=\$\{newest\}/); assert.match(e, /source: a\.source, device_name: a\.device_name/);
  const tabele = new Set(); for (const m of e.matchAll(/from\("([a-z_]+)"\)\s*\.(insert|upsert|update|delete)\(/g)) tabele.add(m[1]);
  assert.deepEqual([...tabele].sort(), ['athletes', 'intervals_status']);
  assert.match(e, /update\(\{ intervals_token_dead_at: new Date\(\)\.toISOString\(\) \}\)/); assert.match(e, /update\(\{ intervals_token_dead_at: null \}\)/);
  assert.doesNotMatch(e, /access_token[^\n]*J\(|api_key[^\n]*J\(/, 'poświadczenia nigdy w odpowiedzi');
  const m = czytaj('supabase/migrations/20261105_intervals_status.sql');
  assert.match(m, /ogniwo\s+text not null check \(ogniwo in \('ok', 'brak', 'token', 'zegarek', 'import', 'siec'\)\)/);
  assert.match(m, /revoke all on public\.intervals_status from public, anon, authenticated;\s*grant select on public\.intervals_status to authenticated;/);
  assert.match(m, /create policy intervals_status_wlasny[\s\S]*for select to authenticated/); assert.match(m, /create policy intervals_status_trener[\s\S]*a\.coach_id = auth\.uid\(\)/);
  assert.equal((m.match(/create policy/g) || []).length, 2);
  assert.match(czytaj('supabase/config.toml'), /\[functions\.intervals-status\]\s*\nverify_jwt = true/);
  const t = czytaj('tools/intervals-status-test.sql'); for (const f of ['FAIL 2a', 'FAIL 2b', 'FAIL 2c', 'FAIL 2d', 'FAIL 2e']) assert.ok(t.includes(f), f);
});

test('sb.js WATCH: kreator per ogniwo (kroki ①–④, źródło z intervals, linki), bez żargonu; pasek Dziś; status raz na dobę; poprawiony state', () => {
  const ctx = zaladujSb();
  ctx.ICU_POLACZENIA_URL = 'https://intervals.icu/settings/connections';
  const W = ctx.WATCH;
  const zeg = W.kreatorHtml({ ogniwo: 'zegarek', zrodlo: 'Garmin Connect', urzadzenie: 'Garmin fenix 3', ost_intervals: '2026-10-06', dni_ciszy: 28, sprawdzono_at: '2026-11-03T10:00:00Z' }, 'a1', "'profil.html'");
  assert.match(zeg, /Zegarek nie wysyła treningów do intervals\.icu/); assert.match(zeg, /6\.10/); assert.match(zeg, /28 dni temu/); assert.match(zeg, /źródło: <b>Garmin Connect<\/b>/);
  assert.match(zeg, /Czy treningi są w Garmin Connect na telefonie\?/, 'krok ① z nazwą aplikacji');
  assert.match(zeg, /sparuj zegarek z telefonem na nowo \(typowe po zmianie telefonu\)/);
  assert.match(zeg, /intervals\.icu\/settings\/connections/); assert.match(zeg, /Disconnect<\/b>, potem <b>Connect<\/b>/); assert.match(zeg, /„401”/); assert.match(zeg, /Garmin Connect → Ustawienia konta → Połączone aplikacje/); assert.match(zeg, /connect\.garmin\.com/);
  assert.match(zeg, /intervals\.icu\/calendar/); assert.match(zeg, /Sprawdź teraz/);
  assert.doesNotMatch(zeg.replace(/<[^>]+>/g, ''), ZARGON, 'bez żargonu w tekście dla ludzi');
  const bez = W.kreatorHtml({ ogniwo: 'zegarek', zrodlo: null, ost_intervals: null, dni_ciszy: 30 }, 'a1', '');
  assert.match(bez, /aplikacji zegarka \(Garmin Connect \/ Coros \/ Suunto \/ Polar\)/, 'bez źródła — ogólnie, ale konkretnie o aplikacjach');
  const tok = W.kreatorHtml({ ogniwo: 'token' }, 'a1', "'profil.html'");
  assert.match(tok, /Połączenie BiegaMy ↔ intervals\.icu wygasło/); assert.match(tok, /onclick="WATCH\.odpalOAuth\('profil\.html'\)">Połącz ponownie z intervals</); assert.doesNotMatch(tok.replace(/<[^>]+>/g, ''), ZARGON);
  assert.match(W.kreatorHtml({ ogniwo: 'import', ost_intervals: '2026-11-02', ost_biegamy: '2026-10-20' }, 'a1', ''), /intervals\.icu ma nowe treningi, BiegaMy jeszcze nie/);
  assert.equal(W.kreatorHtml({ ogniwo: 'ok' }, 'a1', ''), ''); assert.equal(W.kreatorHtml({ ogniwo: 'brak' }, 'a1', ''), ''); assert.equal(W.kreatorHtml(null, 'a1', ''), '');
  assert.match(W.opisOgniwa({ ogniwo: 'zegarek', zrodlo: 'Coros', dni_ciszy: 9 }), /^Zegarek nie wysyła treningów do intervals\.icu \(Coros\) — ostatni 9 dni temu\.$/);
  assert.doesNotMatch(W.opisOgniwa({ ogniwo: 'token' }), ZARGON);
  const sb = czytaj('sb.js');
  assert.match(sb, /localStorage\.setItem\('icu_oauth_state_ls', JSON\.stringify\(\{ n: nonce, t: Date\.now\(\) \}\)\)/, 'zapas state w localStorage');
  assert.match(sb, /statusDnia: async function\(athleteId\)[\s\S]*?< 24 \* 3600000/, 'raz na dobę w tle');
  assert.match(sb, /pasekProblemu: async function\(athleteId\)[\s\S]*?\['token', 'zegarek', 'import'\]\.indexOf\(st\.ogniwo\) < 0\) return '';/);
  assert.match(sb, /href="profil\.html\?open=icu"[^>]*>Napraw ›<\/a>/); assert.match(sb, /localStorage\.setItem\(this\.parentNode\.dataset\.klucz/, 'zamknięcie paska pamiętane');
  assert.match(sb, /<div class="wc-status-wrap" data-athlete="' \+ opts\.athleteId \+ '">/); assert.match(sb, /const brakHtml = kreator && stS && stS\.ogniwo === 'zegarek' \? '' : brak;/, 'bez dwóch paneli o tym samym');
  assert.match(sb, /sprawdzTeraz: async function\(athleteId, btn\)[\s\S]*?await this\.sync\(athleteId, null, false\);[\s\S]*?await this\.sprawdzSync\(athleteId\);[\s\S]*?await this\._rerenderStatus\(athleteId\);/);
});

test('intervals-callback: state z sessionStorage ALBO localStorage (15 min, jednorazowe), komunikat bez „CSRF”; Dziś: slot paska; trener: lista + przycisk', () => {
  const c = czytaj('intervals-callback.html');
  assert.match(c, /let savedState = sessionStorage\.getItem\('icu_oauth_state'\);/); assert.match(c, /localStorage\.removeItem\('icu_oauth_state_ls'\);/);
  assert.match(c, /if \(!savedState && ls && ls\.n && Date\.now\(\) - Number\(ls\.t \|\| 0\) < 15 \* 60000\) savedState = ls\.n;/);
  assert.match(c, /if \(!state \|\| !savedState \|\| state !== savedState\) \{/, 'twardy blok zostaje');
  assert.match(c, /Nie udało się potwierdzić połączenia/); assert.doesNotMatch(c.slice(c.indexOf("show('🛑'"), c.indexOf("show('🛑'") + 300), /CSRF/);
  const z = czytaj('zawodnik.html');
  assert.match(z, /<div id="watch-pasek-slot"><\/div>/); assert.match(z, /const pasek = await window\.WATCH\.pasekProblemu\(_athleteId\);/);
  const t = czytaj('trener.html');
  assert.match(t, /from\('intervals_status'\)\.select\('athlete_id,ogniwo,zrodlo,dni_ciszy,sprawdzono_at'\)\.in\('athlete_id', ids\)/);
  assert.match(t, /zegarek nie wysy\\u0142a do intervals/); assert.match(t, /sprawdzZegarki\(this\)/); assert.match(t, /JSON\.stringify\(\{ wszyscy: true \}\)/);
  assert.doesNotMatch(t.slice(t.indexOf('async function sprawdzZegarki'), t.indexOf('async function zaladujPoranek')), ZARGON);
});
