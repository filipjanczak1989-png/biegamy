// Blizna #38 (06.10.2026) — synchronizacja zegarka NIE jest źródłem punktów Biegusia.
//
// Zgłoszenie Filipa: po synchronizacji UI pokazuje przyznane punkty; ryzyko „kilkanaście kliknięć
// synchronizuj = nabite pióra". Zwiad 6.10: sama ścieżka sync (sb.js WATCH.sync / _badgeSync /
// profil.html) nigdy punktów nie przyznawała ani o nich nie mówiła. Komunikat „+75 🪶" siedział
// w intervals-callback.html (strona po OAuth, także po „Połącz ponownie") i stawiał flagę
// localStorage, z której gra dawała 75 piór za KLIKNIĘCIE podłączenia — dedup tylko na
// urządzeniu. Zdjęte w całości. Pióra za treningi idą wyłącznie przez MOST w biegus.html:
// 5 🪶/km z training_logs o logged_at > ostatni_odbior, z przesunięciem znacznika PRZED wypłatą.
//
// Co ten test pilnuje (tekstem, bo biegus.html i callback nie wchodzą do node):
//  1. na ścieżce sync/OAuth nie ma słowa o piórach/punktach/Biegusiu;
//  2. bonus ZEGAREK i flaga biegus_bonus_zegarek nie wracają;
//  3. intervals-sync liczy `synced` z faktycznie WSTAWIONYCH wierszy po dedupie external_id —
//     czyli dwa syncy bez nowych aktywności dają synced=0 i zero nowych training_logs;
//  4. MOST wypłaca tylko za logged_at > ostatni_odbior i tylko po udanym przesunięciu znacznika.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8');
const PUNKTY = /🪶|punkt|Biegusi|biegus_bonus|KOD_GRA|przyznajKod/i;

test('1) ścieżka sync w sb.js (WATCH.sync, _komunikatSync, _badgeSync) nie mówi o punktach i bierze liczbę z EF', () => {
  const sb = czytaj('sb.js');
  const i = sb.indexOf('_komunikatSync: function');
  const j = sb.indexOf('_badgeSync: function');
  assert.ok(i > 0 && j > i, 'brak _komunikatSync/_badgeSync');
  const fragment = sb.slice(i, j + 1500);
  assert.doesNotMatch(fragment, PUNKTY, 'ścieżka sync wspomina o punktach/Biegusiu');
  assert.match(fragment, /var n = \(data && data\.synced\) \|\| 0;/, 'komunikat sync ma liczyć z data.synced (EF), nie lokalnie');
  const prof = czytaj('profil.html');
  const k = prof.indexOf("'/intervals-sync'");
  assert.ok(k > 0);
  assert.doesNotMatch(prof.slice(k - 800, k + 1500), PUNKTY, 'profil.html przy syncu wspomina o punktach');
});

test('2) intervals-callback.html: zero komunikatu o piórach i zero flagi biegus_bonus_zegarek', () => {
  const cb = czytaj('intervals-callback.html').replace(/\/\*[\s\S]*?\*\//g, '');   // bez nagrobka
  assert.doesNotMatch(cb, /KOD_GRA|biegus_bonus_zegarek|🪶|Bonus w/, 'komunikat +75 🪶 / flaga wróciły na stronę OAuth');
});

test('2b) biegus.html: bonus ZEGAREK i sprawdzBonusZegarka nie wracają; pozostałe kody zostają', () => {
  const b = czytaj('biegus.html');
  const kody = b.slice(b.indexOf('const KODY_BONUS='), b.indexOf('const KODY_BONUS=') + 900);
  assert.doesNotMatch(kody, /'ZEGAREK'\s*:/, 'kod ZEGAREK wrócił do KODY_BONUS');
  assert.match(kody, /'RADIO'\s*:/, 'RADIO ma zostać (nie jest związany z zegarkiem)');
  assert.doesNotMatch(b, /function\s+sprawdzBonusZegarka|\bsprawdzBonusZegarka\(\);/, 'auto-bonus za podłączenie wrócił');
  assert.doesNotMatch(b, /localStorage\.getItem\('biegus_bonus_zegarek'\)/);
});

test('3) intervals-sync: synced = wstawione PO dedupie external_id → drugi sync bez nowości daje 0 wierszy', () => {
  const ef = czytaj('supabase/functions/intervals-sync/index.ts');
  assert.match(ef, /const seen = new Set\(\(have \|\| \[\]\)\.map\(\(r: \{ external_id: string \}\) => r\.external_id\)\);/, 'dedup po external_id zniknął');
  assert.match(ef, /synced = w\.wstawione;/, 'synced ma być liczbą faktycznie wstawionych wierszy');
  assert.doesNotMatch(ef, /synced\s*=\s*(acts|rows|activities)\.length/, 'synced liczone z listy z API zamiast z wstawionych');
  assert.doesNotMatch(ef, PUNKTY, 'EF sync wie coś o punktach — nie ma prawa');
  const wh = czytaj('supabase/functions/intervals-webhook/index.ts');
  assert.match(wh, /error\.code === '23505'/, 'webhook bez dedupu 23505 — redelivery dałoby drugi wiersz');
  assert.doesNotMatch(wh, PUNKTY);
});

test('3b) wstawZOdzyskiem: pusta paczka = 0 wstawionych bez żadnego zapytania (symulacja drugiego syncu)', async () => {
  const W = await import('../supabase/functions/_shared/wstaw-z-odzyskiem.mjs');
  let zapytan = 0;
  const klient = { from() { zapytan++; return { insert: async () => ({ error: null }) }; } };
  const w = await W.wstawZOdzyskiem(klient, 'training_logs', []);
  assert.equal(w.wstawione, 0);
  assert.equal(zapytan, 0, 'pusta paczka nie może dotykać bazy');
});

test('4) MOST: wypłata tylko za logged_at > ostatni_odbior i tylko po przesunięciu znacznika — od 7.10 w RPC, nie w kliencie', () => {
  /* 06.10 ten test pilnował kształtu w biegus.html (filtr logged_at=gt. + PATCH przed wypłatą).
     07.10 (paczka 3B) liczenie i przesunięcie znacznika przeszły do RPC biegus_most_odbierz()
     security definer — klient nie ma już UPDATE na ostatni_odbior. Ta sama własność, inne miejsce. */
  const m = czytaj('supabase/migrations/20261007_biegus_most_odbior_przez_rpc.sql')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.match(m, /and l\.logged_at > v_od/, 'RPC nie filtruje logów po znaczniku');
  assert.match(m, /v_piora := floor\(v_km \* 5\);/, 'stawka 5 🪶/km zmieniona — sprawdź, czy świadomie');
  const iUpd = m.indexOf('set ostatni_odbior = greatest(ostatni_odbior, now())');
  const iRet = m.indexOf("return jsonb_build_object('piora'");
  assert.ok(iUpd > 0 && iRet > iUpd, 'znacznik ma być przesunięty w tej samej transakcji, przed zwróceniem wyniku');
  assert.match(m, /for update;/, 'bez blokady wiersza dwa równoległe wywołania wypłacą dwa razy');
  const b = czytaj('biegus.html');
  const i = b.indexOf('async odbierz(){'), k = b.indexOf('async tydzien(){', i);
  const blok = b.slice(i, k);
  assert.match(blok, /this\.rpc\(s\.tok,'biegus_most_odbierz'\)/, 'klient nie woła RPC');
  assert.doesNotMatch(blok, /ostatni_odbior:new Date\(\)/, 'klient znów przesuwa znacznik sam');
  const iRpc = blok.indexOf("'biegus_most_odbierz'"), iWyplata = blok.indexOf('Biegus.portfelPior+=piora');
  assert.ok(iRpc > 0 && iWyplata > iRpc, 'wypłata przed odpowiedzią RPC');
});

test('sb.js ładuje się w piaskownicy i WATCH istnieje (test nie jest martwy)', () => {
  const sb = zaladujSb();
  assert.equal(typeof sb.WATCH, 'object');
  assert.equal(typeof sb.WATCH._komunikatSync, 'function');
  assert.equal(sb.WATCH._komunikatSync({ synced: 0 }).includes('🪶'), false);
});
