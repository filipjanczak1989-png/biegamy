/* BLIZNA 128 (3.11.2026, plan B Garmin/intervals — docs/garmin-plan-b-2026-11-03.md): aktywność Garmina jako WYDMUSZKA (bez dystansu, czasu,
   obciążenia) → log „wykonany, szczegóły niedostępne” bez km (nie liczy się do akcji/odznak), plan się domyka; nigdy nie wzbogaca wpisu
   ręcznego; prawdziwy ogryzek (< 60 s i < 300 m z dodatnim czasem/dystansem) nadal pomijany. Importy NIGDY nie kasują ani nie nadpisują
   istniejących logów pustymi polami. Status: ≥ 2 wydmuszki Garmina + ostatnia to wydmuszka → ogniwo garmin (nie „import”, nie „zegarek”).
   Czujka forum: nowy post autora wątku o Garminie → alarm. Teksty gotowe na odcięcie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);

test('wydmuszka.mjs: rozpoznanie (null/0 dystans+czas+obciążenie), źródło Garmin, wiersz bez km/czasu z komentarzem', async () => {
  const W = await zaladuj('supabase/functions/_shared/wydmuszka.mjs');
  assert.equal(W.czyWydmuszka({ id: 'i1', source: 'GARMIN_CONNECT', start_date_local: '2026-11-03T08:00:00' }), true);
  assert.equal(W.czyWydmuszka({ id: 'i1', distance: 0, moving_time: 0, elapsed_time: null }), true);
  assert.equal(W.czyWydmuszka({ id: 'i1', distance: 0, moving_time: 45 }), false, '45 s to ogryzek, nie wydmuszka');
  assert.equal(W.czyWydmuszka({ id: 'i1', distance: 250, moving_time: 0 }), false); assert.equal(W.czyWydmuszka({ id: 'i1', icu_training_load: 12 }), false); assert.equal(W.czyWydmuszka({ distance: null }), false, 'bez id');
  assert.equal(W.zGarmina({ source: 'GARMIN_CONNECT' }), true); assert.equal(W.zGarmina({ device_name: 'Garmin fenix 3' }), true); assert.equal(W.zGarmina({ source: 'COROS' }), false);
  const w = W.wierszWydmuszki({ id: 'i77', name: 'Morning Run', start_date_local: '2026-11-03T07:10:00', source: 'GARMIN_CONNECT' }, 'ath', 'Spokojny', 'Run');
  assert.equal(w.distance_km, null); assert.equal(w.duration, null); assert.equal(w.pace, null); assert.equal(w.external_id, 'i77'); assert.equal(w.training_type, 'Spokojny'); assert.equal(w.external_type, 'Run');
  assert.equal(w.comment, 'Morning Run — ' + W.KOMENTARZ_WYDMUSZKI); assert.equal(w.logged_at, '2026-11-03T07:10:00'); assert.equal(w.source, 'intervals'); assert.equal(w.external_source, 'intervals');
  for (const k of ['heart_rate', 'elevation_gain', 'calories', 'icu_load', 'cadence']) assert.equal(w[k], null, k);
});

test('intervals-sync / webhook: wydmuszki osobno przed filtrem ogryzków, nigdy wzbogacanie; żadnego delete/update istniejących logów poza wzbogaceniem', () => {
  const s = czytaj('supabase/functions/intervals-sync/index.ts');
  assert.match(s, /import \{ czyWydmuszka, wierszWydmuszki \} from '\.\.\/_shared\/wydmuszka\.mjs';/);
  assert.match(s, /\.filter\(\(a: any\) => !seen\.has\(String\(a\.id\)\) && czyWydmuszka\(a\)\)/, 'wydmuszki: tylko nowe (dedup po external_id)');
  assert.match(s, /\.filter\(\(a: any\) => !seen\.has\(String\(a\.id\)\) && !czyWydmuszka\(a\)\)/, 'zwykłe wiersze bez wydmuszek');
  assert.match(s, /for \(const w of wydmuszki\) doWstawienia\.push\(w\);/, 'wydmuszki zawsze INSERT, nigdy wzbogacenie');
  assert.match(s, /wydmuszki: wydmuszki\.length/);
  assert.doesNotMatch(s, /from\('training_logs'\)\s*\.delete|from\("training_logs"\)\s*\.delete/, 'sync nie kasuje');
  const updaty = [...s.matchAll(/from\('training_logs'\)\.update\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(updaty, ['w.dane'], 'jedyny UPDATE logów = wzbogacenie wpisu ręcznego');
  const k = czytaj('supabase/functions/_shared/kolizja-importu.mjs');
  assert.match(k, /if \(!\(km > 0\)\) return \{ akcja: 'wstaw', powod: 'brak_dystansu' \};/, 'bez dystansu → nigdy scalenie z wpisem ręcznym');
  assert.match(k, /if \(wiersz\[p\] != null\) out\[p\] = wiersz\[p\];/, 'wzbogacenie tylko polami ≠ null'); assert.doesNotMatch(k.slice(k.indexOf('POLA_WZBOGACENIA = ['), k.indexOf('];', k.indexOf('POLA_WZBOGACENIA = ['))), /distance_km|duration|comment/, 'nigdy km/czas/komentarz');
  const w = czytaj('supabase/functions/intervals-webhook/index.ts');
  assert.match(w, /const wydmuszka = czyWydmuszka\(a\);/); assert.match(w, /if \(!wydmuszka && _sec < 60 && _m < 300\) \{ skipped\+\+; continue; \}/);
  assert.match(w, /const row = wydmuszka \? wierszWydmuszki\(a, ath\.id, typeForActivity\(a, plan\?\.type \?\? null\), rawActivityType\(a\)\) : mapActivity\(/);
  assert.doesNotMatch(w, /training_logs'\)\s*\.(delete|update)/, 'webhook tylko wstawia');
  for (const ef of ['intervals-status', 'intervals-oauth', 'intervals-push', 'intervals-activity-detail', 'intervals-hr-aggregate']) {
    const p = path.join(KORZEN, 'supabase/functions', ef, 'index.ts'); if (!fs.existsSync(p)) continue;
    assert.doesNotMatch(fs.readFileSync(p, 'utf8'), /training_logs["']\)\s*\.(delete|update|upsert)/, ef + ': nie rusza logów');
  }
});

test('ogniwo: ≥ 2 wydmuszki Garmina i ostatnia to wydmuszka → garmin; jedna wydmuszka → jak dotąd; wydmuszki Coros nie liczą się; status przekazuje pola', async () => {
  const O = await zaladuj('supabase/functions/intervals-status/ogniwo.mjs');
  const d = '2026-11-03';
  const wyd = (dd, src = 'GARMIN_CONNECT') => ({ id: 'w' + dd, start_date_local: dd + 'T08:00:00', source: src, distance: null, moving_time: null, elapsed_time: null, icu_training_load: null });
  const pelna = (dd, src = 'GARMIN_CONNECT') => ({ id: 'p' + dd, start_date_local: dd + 'T08:00:00', source: src, distance: 10000, moving_time: 3000, icu_training_load: 50 });
  const g = O.ustalOgniwo({ polaczony: true, http: 200, aktywnosci: [wyd('2026-11-02'), wyd('2026-10-30'), pelna('2026-10-20')], ostBiegamy: '2026-11-02', dzis: d });
  assert.equal(g.ogniwo, 'garmin'); assert.equal(g.szczegoly.wydmuszki, 2); assert.equal(g.zrodlo, 'Garmin Connect');
  assert.equal(O.ustalOgniwo({ polaczony: true, http: 200, aktywnosci: [wyd('2026-11-02'), pelna('2026-10-30')], ostBiegamy: '2026-11-02', dzis: d }).ogniwo, 'ok', 'jedna wydmuszka = przypadek');
  assert.equal(O.ustalOgniwo({ polaczony: true, http: 200, aktywnosci: [pelna('2026-11-02'), wyd('2026-10-30'), wyd('2026-10-25')], ostBiegamy: '2026-11-02', dzis: d }).ogniwo, 'ok', 'ostatnia pełna → Garmin znów płynie');
  assert.equal(O.ustalOgniwo({ polaczony: true, http: 200, aktywnosci: [wyd('2026-11-02', 'COROS'), wyd('2026-10-30', 'COROS')], ostBiegamy: '2026-11-02', dzis: d }).ogniwo, 'ok', 'wydmuszki innej marki nie są dowodem na Garmina');
  assert.equal(O.PROG_WYDMUSZEK, 2);
  const e = czytaj('supabase/functions/intervals-status/index.ts');
  assert.match(e, /distance: a\.distance, moving_time: a\.moving_time, elapsed_time: a\.elapsed_time, icu_training_load: a\.icu_training_load/);
});

test('teksty gotowe na odcięcie (pasek + kreator): „dotychczasowe treningi są bezpieczne”, „nowe dodaj ręcznie, wkrótce .FIT”; szkic posta w docs', () => {
  const { zaladujSb } = require('./_srodowisko.js');
  const W = zaladujSb().WATCH;
  assert.match(W.opisOgniwa({ ogniwo: 'garmin' }), /Twoje dotychczasowe treningi są bezpieczne; nowe dodaj ręcznie, wkrótce także plikiem \.FIT\./);
  const kr = W.kreatorHtml({ ogniwo: 'garmin', ost_intervals: '2026-10-28' }, 'a1', '');
  assert.match(kr, /nic nie znika/); assert.match(kr, /ostatni pełny: <b>28\.10<\/b>/); assert.match(kr, /wykonane, szczegóły niedostępne/); assert.doesNotMatch(kr, /wgraj plik/i);
  const d = czytaj('docs/garmin-plan-b-2026-11-03.md');
  assert.match(d, /Szkic posta Filipa/); assert.match(d, /wszystko, co już jest w BiegaMy, zostaje/); assert.match(d, /GARMIN_BLOKADA=1/);
});

test('czujka: nowe posty autora wątku o Garminie od ostatniego sprawdzenia; stan w docs; krok w nocy + issue; bez sekretów', async () => {
  const C = await zaladuj('tools/czujka-intervals.mjs');
  const posty = [
    { post_number: 890, username: 'david', created_at: '2026-10-26T10:00:00Z', cooked: '<p>Garmin data feeds…</p>' },
    { post_number: 893, username: 'sprouty76', created_at: '2026-11-01T10:00:00Z', cooked: '<p>Garmin again</p>' },
    { post_number: 894, username: 'david', created_at: '2026-11-02T10:00:00Z', cooked: '<p>We will block <b>Garmin</b> data on 15 Nov.</p>' },
    { post_number: 895, username: 'david', created_at: '2026-11-02T11:00:00Z', cooked: '<p>Unrelated: new API field.</p>' },
  ];
  const n = C.noweOGarminie(posty, 'david', 892);
  assert.equal(n.length, 1); assert.equal(n[0].post_number, 894); assert.equal(n[0].url, 'https://forum.intervals.icu/t/609/894'); assert.equal(n[0].cytat, 'We will block Garmin data on 15 Nov.');
  assert.equal(C.noweOGarminie(posty, 'david', 894).length, 0); assert.equal(C.noweOGarminie(posty, 'david', 0).length, 2, 'bez stanu — wszystkie Davida o Garminie');
  const stan = JSON.parse(czytaj('docs/czujka-intervals.json')); assert.ok(Number.isInteger(stan.ostatni_post) && stan.ostatni_post >= 892, 'stan przesuwa nocny krok, nigdy w tył'); assert.equal(stan.autor, 'david');
  const w = czytaj('.github/workflows/okienko-noc.yml');
  assert.match(w, /node tools\/czujka-intervals\.mjs/); assert.match(w, /if: steps\.czujka\.outputs\.kod == '4'/); assert.match(w, /docs\/czujka-intervals\.json/);
  assert.ok(w.indexOf('node tools/czujka-intervals.mjs') < w.indexOf('git commit'), 'czujka przed commitem (stan trafia do repo)');
  const src = czytaj('tools/czujka-intervals.mjs'); assert.doesNotMatch(src, /process\.env\.[A-Z_]*(KEY|SECRET|TOKEN)/, 'czujka bez sekretów'); assert.match(src, /process\.exitCode = nowe\.length \? 4 : 0;/);
});
