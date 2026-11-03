/* BLIZNA 119 (3.11.2026, KALENDARZ etap 1 — Filip 3.11 02:31): karta imprezy z maszyny = jak nasza.
   1) races.html: tap w kartę → openImpreza (id z data-*, nie JS w atrybucie), link i „Ukryj” nie otwierają arkusza; arkusz = #race-modal
      (data, miasto, dystanse, link tylko https, „0 os.”, okładka z imprezy_okladki albo zaślepka); „Wezmę udział” → RPC impreza_do_races
      z OBIEKTU stanu → loadRaces → doSignup (zwykły zapis: race_signups + cel) → openRace; trener: „Dodaj do naszych” bez zapisu;
      dokładność „miesiąc” = bez zapisu; closeModal/openRace czyszczą _currentImpreza.
   2) migracja 20261105: races.impreza_klucz (CHECK), klucz_nazwy_imprezy ≡ BM_KALENDARZ.kluczNazwy (asercja w migracji), RPC SECURITY
      DEFINER tylko dla zalogowanych z profilem/trenera, walidacje, dedup (klucz | nazwa+data±1+miasto), approved, okładka tylko z race-covers,
      link tylko https; anon nic. Test po skutku: tools/impreza-do-races-test.sh (14 asercji).
   3) js/kalendarz-lista.mjs: zNaszego czyta url_organizer (organizer_url było martwe) i impreza_klucz. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('1) races.html — karta → arkusz, „Wezmę udział” przez RPC z obiektu stanu, zwykły zapis po RPC, trener bez zapisu', () => {
  const r = czytaj('races.html');
  const karta = r.slice(r.indexOf('function renderImprezaCard'), r.indexOf('function imprezyStopka'));
  assert.match(karta, /data-id="' \+ escAttr\(x\.id\) \+ '" onclick="openImpreza\(this\.dataset\.id\)"/, 'id z data-*, nie JS w atrybucie');
  assert.doesNotMatch(karta, /onclick="openRace/);
  assert.equal((karta.match(/onclick="event\.stopPropagation\(\)"/g) || []).length, 2, 'link „Strona imprezy” i „Ukryj” nie otwierają arkusza');
  assert.match(r, /_imprezyWgId\[x\.id\] = x;/, 'mapa id → impreza budowana przy renderze');
  const o = r.slice(r.indexOf('function openImpreza'), r.indexOf('async function imprezaDoNaszych'));
  assert.match(o, /_currentImpreza = x; _currentRace = null;/);
  assert.match(o, /safeExternalHref\(x\.url, \{ tylkoHttps: true \}\)/); assert.match(o, /getElementById\('m-count'\)\.textContent = '0 os\.'/);
  assert.match(o, /kluczBezRoku\(x\.nazwa, x\.miasto\)/, 'okładka z imprezy_okladki po kluczu bez roku');
  assert.match(o, /btn\.disabled = x\.dokladnosc === 'miesiac'/, 'termin z dokładnością do miesiąca = bez zapisu');
  assert.match(o, /_isCoach \? '＋ Dodaj do naszych startów'/);
  for (const el of ['m-submitted-by', 'm-same-day', 'm-coach-pending', 'm-coach-approved']) assert.ok(o.includes(`'${el}'`), 'sekcje trenera schowane: ' + el);
  const d = r.slice(r.indexOf('async function imprezaDoNaszych'), r.indexOf('async function toggleSignup'));
  assert.match(d, /_sb\.rpc\('impreza_do_races', \{ p_klucz: x\.klucz \|\| null, p_nazwa: String\(x\.nazwa \|\| ''\)\.slice\(0, 200\), p_data: x\.data, p_miasto: x\.miasto \? String\(x\.miasto\)\.slice\(0, 80\) : null,\s*p_dystans: x\.dystanse\[0\] \|\| null, p_url: x\.url \|\| null, p_okladka: zBazy \}\)/);
  assert.match(d, /if \(!x \|\| x\.dokladnosc === 'miesiac'\) return null;/);
  assert.match(d, /await loadRaces\(\);[^\n]*\n\s*if \(!_isCoach && _athleteId\) await doSignup\(id\); else showToast\('Dodano do naszych startów ✓'\);/, 'zwykły zapis po RPC; trener bez zapisu');
  assert.match(d, /if \(_allRaces\.find\(r => r\.id === id\)\) openRace\(id\);/, 'po zapisie arkusz naszego startu (Zapisany)');
  assert.match(r, /async function toggleSignup\(\) \{\n\s*if \(_currentImpreza\) \{ await wezmeUdzialImpreza\(\); return; \}/);
  assert.match(r, /function closeModal\(\) \{[\s\S]*?_currentImpreza = null;\n\}/); assert.match(r, /_currentRace = race; _currentImpreza = null;/);
  assert.doesNotMatch(r, /from\('races'\)\.insert\([^)]*impreza/, 'impreza wchodzi do races tylko przez RPC');
});

test('2) migracja impreza_do_races — kolumna, dedup, approved, walidacje, uprawnienia, test po skutku', () => {
  const m = czytaj('supabase/migrations/20261105_impreza_do_races.sql');
  assert.match(m, /alter table public\.races add column impreza_klucz text\s+check \(impreza_klucz is null or impreza_klucz ~ '\^\(kalendarz\|biegamy\|wyniki\|zgloszenie\):/);
  assert.match(m, /create function public\.impreza_do_races\(p_klucz text, p_nazwa text, p_data date, p_miasto text, p_dystans numeric, p_url text, p_okladka text\)/);
  assert.match(m, /language plpgsql volatile security definer\s+set search_path = public, pg_temp/);
  assert.match(m, /if auth\.uid\(\) is null then raise exception 'impreza_do_races: tylko zalogowani' using errcode = '42501'/);
  assert.match(m, /v_trener := exists \(select 1 from public\.coaches c where c\.id = auth\.uid\(\)\);/);
  assert.match(m, /if v_url is not null and \(char_length\(v_url\) > 500 or v_url !~ '\^https:\/\/\[\^\\s''"<>\]\+\$'\) then v_url := null; end if;/, 'link tylko https');
  assert.match(m, /race-covers\/impreza-\[0-9a-f\]\{40\}\\\.jpg/, 'okładka tylko z race-covers');
  assert.match(m, /x\.date between p_data - 1 and p_data \+ 1 and v_knazwy <> '' and public\.klucz_nazwy_imprezy\(x\.name\) = v_knazwy/, 'dedup nazwa+data±1');
  assert.match(m, /values \(v_nazwa, p_data, p_dystans, v_miasto, v_url, 'approved', v_ath, 0, v_klucz, v_okladka\)/, 'approved, okładka przejęta');
  assert.match(m, /revoke all on function public\.impreza_do_races\(text, text, date, text, numeric, text, text\) from public, anon, authenticated;\s*grant execute on function public\.impreza_do_races\(text, text, date, text, numeric, text, text\) to authenticated;/);
  assert.match(m, /klucz_nazwy_imprezy\('XII Bieg Niepodległości 2026'\) <> 'biegniepodleglosci'/, 'asercja zgodności z kluczNazwy (blizna-108)');
  assert.ok(fs.existsSync(path.join(KORZEN, 'supabase/migrations/20261105_WYCOFANIE_impreza_do_races.sql')));
  const t = czytaj('tools/impreza-do-races-test.sql');
  for (const f of ['FAIL 1a', 'FAIL 1b', 'FAIL 2b', 'FAIL 3a', 'FAIL 3b', 'FAIL 3d', 'FAIL 3e', 'FAIL 4a', 'FAIL 5a']) assert.ok(t.includes(f), f);
});

test('3) kalendarz-lista: zNaszego czyta url_organizer i impreza_klucz; klucz nazwy zgodny z asercją SQL', async () => {
  const k = czytaj('js/kalendarz-lista.mjs');
  assert.match(k, /url: r\.url_organizer \|\| null \}/); assert.doesNotMatch(k, /r\.organizer_url/); assert.match(k, /klucz: r\.impreza_klucz \|\| null/);
  await import(pathToFileURL(path.join(KORZEN, 'js/tekst.mjs')).href); await import(pathToFileURL(path.join(KORZEN, 'js/kalendarz-lista.mjs')).href);
  const K = globalThis.BM_KALENDARZ;
  for (const [n, oczek] of [['XII Bieg Niepodległości 2026', 'biegniepodleglosci'], ['12. Bieg Niepodległości', 'biegniepodleglosci'], ['Bieg Niepodległości – XIII edycja', 'biegniepodleglosci'], ['VI Nocny Bieg Nyski', 'nocnybiegnyski'], ['Bieg i Marsz Pamięci', 'biegimarszpamieci']])
    assert.equal(K.kluczNazwy(n), oczek, n);
  const z = K.scal([{ id: 'r1', name: 'Bieg Testowy', date: '2026-12-05', city: 'Śrem', distance_km: 10, status: 'approved', url_organizer: 'https://x.pl', impreza_klucz: 'kalendarz:a' }], []);
  assert.equal(z[0].url, 'https://x.pl'); assert.equal(z[0].klucz, 'kalendarz:a');
});
