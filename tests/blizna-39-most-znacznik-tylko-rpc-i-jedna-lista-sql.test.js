// Blizna #39 (07.10.2026) — paczka 3, dwa długi domknięte jednym kształtem: „jedno źródło".
//
//  B. MOST (biegus_most.ostatni_odbior): kolumna miała GRANT UPDATE dla authenticated, więc
//     zalogowany mógł cofnąć własny znacznik przez REST i odebrać pióra ponownie (UI tego nie
//     robiło, ale liczy się GRANT). Od 7.10: RPC `biegus_most_odbierz()` security definer liczy,
//     przesuwa znacznik TYLKO do przodu (greatest(stary, now())) i oddaje logi; klient nie ma
//     już INSERT/UPDATE na znaczniku. Saldo piór w JSON zostaje — osobna decyzja.
//  A. RUN_TYPES: `public.is_run_type(text)` IMMUTABLE STRICT jako jedyna lista po stronie bazy;
//     suma_biegowa i pomiar tygodni reakcji ją wołają; trzecia kopia w kolizja-importu.mjs
//     zastąpiona importem. Bramka pythonowa dostała wzorzec na CIAŁO funkcji.
//
// Migracje nie wchodzą do node — testy tekstowe (konwencja tests/pb-daty.test.js).
// 07.10.2026: część B dotyczyła klienta gry Bieguś — gra skasowana, test B2 zdjęty (patrz niżej).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8');
const bezKomentarzySql = (s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

/* B1) [migracja RPC biegus_most_odbierz: security definer, znacznik tylko do przodu, granty] — USUNIĘTY
   07.10.2026 (faza 2 kasacji gry): RPC, biegus_ranking, biegus_most i game_events SKASOWANE na prod
   (zmierzone: pg_proc/to_regclass = brak, REST → 404 PGRST202/PGRST205). Migracja
   20261007_biegus_most_odbior_przez_rpc.sql zostaje w repo jako historia (LEKCJE #23 ją cytuje),
   kasację opisuje 20261007_kasacja_biegus_baza.sql; pilnuje tego tests/blizna-41-kasacja-biegusia.test.js. */

/* B2) [biegus.html: MOST.odbierz woła RPC] — USUNIĘTY 07.10.2026: gra Bieguś skasowana, biegus.html to
   przekierowanie. B1 zostaje do fazy 2 (drop RPC i tabeli) — pilnuje, że plik migracji w repo nadal opisuje
   to, co JEST na prod, dopóki faza 2 tego nie zdejmie. Patrz tests/blizna-41-kasacja-biegusia.test.js. */

test('A1) is_run_type: IMMUTABLE STRICT, ta sama lista co sb.js, suma_biegowa i pomiar ją wołają', () => {
  const m = bezKomentarzySql(czytaj('supabase/migrations/20261007_is_run_type_jedna_lista_w_bazie.sql'));
  assert.match(m, /create or replace function public\.is_run_type\(p_typ text\)/);
  assert.match(m, /\r?\nimmutable\r?\n/);   // \r? — git autocrlf przepisuje migracje na CRLF po commicie
  assert.match(m, /\r?\nstrict\r?\n/);
  const lista = m.match(/is_run_type[\s\S]*?ARRAY\s*\[\s*((?:'[^']+'\s*,\s*)+'[^']+')\s*\]/);
  assert.ok(lista, 'ciało is_run_type nie ma listy w ARRAY[...] — bramka pythonowa przestanie ją widzieć');
  const zSql = new Set(lista[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1)));
  const sb = czytaj('sb.js').match(/window\.RUN_TYPES = new Set\(\[([\s\S]*?)\]\)/);
  const zSb = new Set(sb[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1)));
  assert.deepEqual([...zSql].sort(), [...zSb].sort(), 'lista w is_run_type rozjechała się z sb.js');
  assert.match(m, /and public\.is_run_type\(t\.training_type\);/, 'suma_biegowa nie woła is_run_type');
  assert.doesNotMatch(m.slice(m.indexOf('suma_biegowa')), /= ANY \(ARRAY\[/, 'suma_biegowa ma nadal listę inline obok funkcji');
  assert.match(m, /grant execute on function public\.is_run_type\(text\) to authenticated, service_role;/, 'EXECUTE na is_run_type zmienił adresatów');
  // LEKCJE #23: default privileges Supabase dają anonowi JAWNY EXECUTE na nowej funkcji — `revoke … from public`
  // go nie zdejmuje (zmierzone 7.10: anon → 200 true). Potrzebny osobny revoke od anon, jak w suma_biegowa.
  assert.match(m, /revoke all on function public\.is_run_type\(text\) from anon;/, 'brak revoke od anon — default privileges zostawią anonowi EXECUTE');
  assert.match(m, /revoke all on function public\.suma_biegowa\(uuid, timestamptz, timestamptz\) from anon, authenticated;/);
  assert.ok(!/\bto\s+anon\b/i.test(m), 'migracja nadaje coś anonowi (anon nie potrzebuje is_run_type — SECURITY DEFINER wykonuje ją jako właściciel)');
  const pomiar = bezKomentarzySql(czytaj('tools/pomiar-tygodni-reakcji.sql'));
  assert.match(pomiar, /public\.is_run_type\(l\.training_type\)/);
  assert.doesNotMatch(pomiar, /'wybieganie'/, 'pomiar ma znów własną listę');
});

test('A2) bramka pythonowa rozpoznaje ciało is_run_type po NAZWIE funkcji i pomija WYCOFANIA', () => {
  const py = czytaj('tools/sprawdz-run-types.py');
  assert.match(py, /WZOR_FUNKCJI = r"function\\s\+public\\\.is_run_type/);
  assert.match(py, /if 'WYCOFANIE' in f:\s*\n\s*continue/);
  // 07.10 wieczór: 10 → 5 świadomie — pięć migracji definiujących skasowaną community_km pomijane po treści (blizna-43)
  assert.match(py, /MIN_ZRODEL = 5 /, 'próg zmieniony — ma być świadomie, w tym samym commicie co zmiana źródeł');
  // WYCOFANIE is_run_type zawiera listę inline (stary stan) — gdyby nie było pomijane, próg by się przesunął bez decyzji
  const w = czytaj('supabase/migrations/20261007_WYCOFANIE_is_run_type_jedna_lista_w_bazie.sql');
  assert.match(w, /= ANY \(ARRAY\[/);
  const iSuma = w.indexOf('create or replace function public.suma_biegowa'), iDrop = w.indexOf('drop function if exists public.is_run_type');
  assert.ok(iSuma > 0 && iDrop > iSuma, 'wycofanie: suma_biegowa wraca do inline PRZED drop is_run_type');
});

test('A3) kolizja-importu.mjs nie ma własnej listy — importuje z reguly-treningow.mjs', async () => {
  const src = czytaj('supabase/functions/_shared/kolizja-importu.mjs');
  assert.match(src, /import \{ RUN_TYPES, isRunType \} from '\.\/reguly-treningow\.mjs'/);
  assert.doesNotMatch(src, /new Set\(\[\s*'spokojny'/);
  const K = await import('../supabase/functions/_shared/kolizja-importu.mjs');
  const R = await import('../supabase/functions/_shared/reguly-treningow.mjs');
  assert.strictEqual(K.RUN_TYPES, R.RUN_TYPES);
  assert.equal(K.jestBiegiem(' Interwały '), true);
  assert.equal(K.jestBiegiem('Rower'), false);
  assert.equal(K.jestBiegiem(null), false);
});
