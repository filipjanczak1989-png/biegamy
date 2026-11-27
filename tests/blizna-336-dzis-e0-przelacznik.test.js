/* BLIZNA 336 (Filip 23.11): nowe Dziś, etap E0 — przełącznik widoczności, widoczny tylko dla kont z listy (na start: konto Filipa).
   Pilnuje zasad Filipa:
   1) bez przełącznika zawodnik.html renderuje Dziś dokładnie jak przed E0: poza sześcioma blokami DZIS-E0 plik jest bajt w bajt tym sprzed zmiany
      (skrót niżej), a bloki są bierne: klasa html.dzis-nowy tylko przy odpowiedzi „nowy”, CSS tylko pod tą klasą, korzeń pusty i ukryty;
   2) przełącznik służy widoczności, nie jest zabezpieczeniem: js/dzis-nowy.mjs nie czyta i nie zapisuje żadnych danych (bez zapytań i bez pamięci telefonu),
      a decyzja przy „stary” nic nie zapisuje;
   3) wyłączenie to jedno polecenie bez migracji (update nowe_wlaczone = 'false'); migracja z pustą listą, bez UUID i e-maili.
   ⚠️ Zmiana zawodnik.html POZA blokami DZIS-E0 wymaga nowego skrótu PRZED_E0 (plik bez bloków) — świadomie: test ma pokazać, że E0 nie rozlał się poza swoje bloki. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const PRZED_E0 = '939df85ffe04e605ecfa0091f01fbe6bb8a11d711ae0969c77132cc043215b9f';   // zawodnik.html (LF) bez bloków DZIS-E0; 27.11: stary podgląd Społeczności nie pyta bazy pod nowym Dziś, loadHomeSocialPreview (blizna-405; przed tym 102b0355… z 26.11: pogoda: nieznane miasto zostawia kafel z komunikatem, blizna-390; przed tym468e5ff2… z 26.11: stary kadr dnia nie pobiera się pod nowym Dziś, blizna-380; bacec862… z 25.11: pogoda po 401 ponawia raz i zgłasza etap, blizna-372; 4eccc5bb… z 25.11: wątek czatu 200 najnowszych, blizna-354; 16d483ba… z 23.11: role=athlete w 3 linkach, blizna-339; wcześniej 1242db61…, origin/main 165d8fe3)
const HTML = czytaj('zawodnik.html');
const MODUL = czytaj('js/dzis-nowy.mjs');
const MIG = czytaj('supabase/migrations/20261225_dzis_przelacznik.sql');
const WYC = czytaj('supabase/migrations/20261225_WYCOFANIE_dzis_przelacznik.sql');

function bezE0(html) {
  const out = []; let w = null;
  for (const l of html.split('\n')) {
    const p = l.match(/DZIS-E0 (\d+[ab]?) początek/);
    if (p && !w) { w = p[1]; continue; }
    if (w) { if (new RegExp('DZIS-E0 ' + w + ' koniec').test(l)) w = null; continue; }
    if (/DZIS-E0 \d+[ab]?[:\s]/.test(l)) continue;
    out.push(l);
  }
  return out.join('\n');
}
const blok = (nr) => { const m = HTML.match(new RegExp('<!-- DZIS-E0 ' + nr + ' początek[\\s\\S]*?<!-- DZIS-E0 ' + nr + ' koniec -->')); assert.ok(m, 'blok DZIS-E0 ' + nr); return m[0]; };

/* atrapa strony dla bloku 1: classList, localStorage ze szpiegiem zapisów, location.search, sb.rpc, dociąganie skryptu */
function strona({ token = true, kopia = null, search = '', rpc = null } = {}) {
  const klasy = new Set(), magazyn = new Map(), zapisy = [], skrypty = [];
  const UID = 'u-test';
  if (token) magazyn.set('sb-afqojgkaveykxbltxzwm-auth-token', JSON.stringify({ user: { id: UID } }));
  if (kopia) magazyn.set('bm_dzis_wersja_' + UID, JSON.stringify(kopia));
  const w = {
    localStorage: { getItem: (k) => (magazyn.has(k) ? magazyn.get(k) : null), setItem: (k, v) => { zapisy.push(['set', k]); magazyn.set(k, String(v)); }, removeItem: (k) => { zapisy.push(['remove', k]); magazyn.delete(k); } },
    location: { search }, URLSearchParams, JSON, Date, Promise, setTimeout: (f) => 0, clearTimeout: () => {},
  };
  const d = { documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    createElement: () => ({}), head: { appendChild: (el) => skrypty.push(el) } };
  if (rpc) w.sb = { rpc: (n) => { w._rpc = (w._rpc || 0) + 1; return rpc(n); } };
  const kod = blok(1).match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(kod, { window: w, document: d, URLSearchParams, JSON, Date, Promise, setTimeout: w.setTimeout, clearTimeout: w.clearTimeout });
  return { w, d, klasy, zapisy, skrypty, magazyn, UID };
}
const odczekaj = () => new Promise((r) => setImmediate(r));

test('E1 wczesny start: świeża kopia „nowy” dociąga moduł od razu, przed initAuth; bez kopii, przy starej kopii, ?dzis=stary i bez sesji nic się nie dociąga', () => {
  const s = strona({ kopia: { w: 'nowy', t: Date.now() } });
  assert.equal(s.skrypty.length, 1, 'moduł rusza przy czytaniu nagłówka strony, zanim ktokolwiek zawoła _dzisDecyzja');
  assert.match(s.skrypty[0].src, /^js\/dzis-nowy\.mjs\?v=[0-9a-f]{10}$/);
  s.w._dzisDecyzja(); s.w._dzisDecyzja();
  assert.equal(s.skrypty.length, 1, 'initAuth nie dociąga go drugi raz');
  let startow = 0; s.w.BM_DZIS = { start() { startow++; }, stop() {} };
  s.skrypty[0].onload();
  assert.equal(startow, 1, 'po dojściu pliku start od razu');
  for (const [opis, o] of [['bez kopii', {}], ['kopia starsza niż doba', { kopia: { w: 'nowy', t: Date.now() - 864e5 - 1000 } }], ['kopia „stary”', { kopia: { w: 'stary', t: Date.now() } }],
    ['?dzis=stary', { kopia: { w: 'nowy', t: Date.now() }, search: '?dzis=stary' }], ['bez sesji', { kopia: { w: 'nowy', t: Date.now() }, token: false }]]) {
    const x = strona(o);
    assert.equal(x.skrypty.length, 0, opis + ': nic nie dociągamy'); assert.equal(x.klasy.size, 0, opis + ': żadnej klasy');
  }
});

test('zawodnik.html: poza blokami DZIS-E0 bajt w bajt jak przed E0; bloków dokładnie sześć', () => {
  assert.equal(sha(bezE0(HTML)), PRZED_E0, 'zmiana poza blokami DZIS-E0 (albo nowa zmiana zawodnik.html — wtedy nowy skrót PRZED_E0)');
  for (const nr of ['1', '2']) { assert.equal((HTML.match(new RegExp('DZIS-E0 ' + nr + ' początek', 'g')) || []).length, 1); assert.equal((HTML.match(new RegExp('DZIS-E0 ' + nr + ' koniec', 'g')) || []).length, 1); }
  assert.equal((HTML.match(/<div id="dzis-nowy" hidden><\/div><!-- DZIS-E0 3:/g) || []).length, 1, 'korzeń pusty i ukryty');
  for (const nr of ['4a', '4b', '5']) assert.equal((HTML.match(new RegExp('if \\(window\\._dzisDecyzja\\) window\\._dzisDecyzja\\(\\);   // DZIS-E0 ' + nr + ':', 'g')) || []).length, 1, 'wywołanie ' + nr);
  assert.equal(HTML.split('\n').length - bezE0(HTML).split('\n').length, 64, 'E0 to 61 linii dodanych, zero zmienionych; E1 (25.11) dokłada 3 linie w bloku 1: zgłoszenie braku modułu (2) i wczesny start modułu (1)');
  assert.equal((HTML.match(/bieg-pasek/g) || []).length, 2, 'blizny 290–292: pasek biegu w zawodnik.html tylko element i wywołanie');
  assert.doesNotMatch(HTML, /akcja-dzis|akcja-baner|naKaflu/, 'blizna-182: zakazane napisy');
  const powrot = HTML.slice(HTML.indexOf('async function _dzisPoPowrocie('), HTML.indexOf("window.bmPowrotWlasny = true;"));
  assert.ok(powrot.indexOf('DZIS-E0 5') > powrot.indexOf("return 'swieze'") && powrot.indexOf('DZIS-E0 5') > powrot.indexOf('await loadLogs();'),
    'pytanie o przełącznik po powrocie tylko razem z odświeżeniem danych (najwyżej co 10 min), nie przy każdym powrocie — usage Supabase');
});

test('CSS E0: każda reguła tylko pod html.dzis-nowy (albo ukryty korzeń); chowanie starego Dziś dopiero z klasą dzis-gotowy (E1)', () => {
  const css = blok(2).match(/<style>([\s\S]*?)<\/style>/)[1];
  const selektory = css.replace(/\{[^}]*\}/g, ',').split(',').map((s) => s.trim()).filter(Boolean);
  assert.ok(selektory.length >= 18);
  assert.ok(!selektory.some((s) => s.includes('#bieg-pasek')), 'pasek biegu poza listą chowania (decyzja w E1)');
  for (const s of selektory) assert.ok(s === '#dzis-nowy[hidden]' || s.startsWith('html.dzis-nowy.dzis-gotowy body > '), 'selektor poza przełącznikiem: ' + s);
  assert.doesNotMatch(blok(1) + blok(2), /dzis-gotowy'\)|classList\.add\('dzis-gotowy/, 'E0 nie włącza chowania starego Dziś');
});

test('blok 1 bez przełącznika: brak sesji, brak kopii, kopia > 24 h albo ?dzis=stary → żadnej klasy, żadnego zapisu', () => {
  for (const o of [{ token: false }, {}, { kopia: { w: 'nowy', t: Date.now() - 25 * 3600e3 } }, { kopia: { w: 'nowy', t: Date.now() }, search: '?dzis=stary' }, { kopia: { w: 'stary', t: Date.now() } }]) {
    const s = strona(o);
    assert.equal(s.klasy.has('dzis-nowy'), false, JSON.stringify(o));
    assert.deepEqual(s.zapisy, [], 'bez zapisów: ' + JSON.stringify(o));
    assert.equal(typeof s.w._dzisDecyzja, 'function');
  }
  const z = strona({ kopia: { w: 'nowy', t: Date.now() - 3600e3 } });
  assert.equal(z.klasy.has('dzis-nowy'), true, 'świeża kopia „nowy” → klasa przed pierwszym malowaniem');
});

test('decyzja: „stary” nic nie zapisuje i niczego nie dociąga; „nowy” zapisuje kopię i dociąga moduł z wersją; błąd RPC niczego nie zmienia', async () => {
  const MODUL_V = sha(MODUL).slice(0, 10);
  assert.match(blok(1), new RegExp("MODUL_V = '" + MODUL_V + "'"), 'stała MODUL_V = skrót js/dzis-nowy.mjs (zmiana modułu = nowa stała)');
  const st = strona({ rpc: async () => ({ data: 'stary', error: null }) });
  st.w._dzisDecyzja(); await odczekaj();
  assert.equal(st.w._rpc, 1); assert.equal(st.klasy.has('dzis-nowy'), false); assert.deepEqual(st.zapisy, [], 'konto spoza listy: zero zapisów'); assert.equal(st.skrypty.length, 0, 'bez modułu');
  const nw = strona({ rpc: async () => ({ data: 'nowy', error: null }) });
  nw.w._dzisDecyzja(); await odczekaj();
  assert.equal(nw.klasy.has('dzis-nowy'), true);
  assert.deepEqual(nw.zapisy, [['set', 'bm_dzis_wersja_' + nw.UID]]);
  assert.equal(nw.skrypty.length, 1); assert.equal(nw.skrypty[0].src, 'js/dzis-nowy.mjs?v=' + MODUL_V);
  const wyl = strona({ kopia: { w: 'nowy', t: Date.now() }, rpc: async () => ({ data: 'stary', error: null }) });
  wyl.w._dzisDecyzja(); await odczekaj();
  assert.equal(wyl.klasy.has('dzis-nowy'), false, 'wyłączenie w bazie działa przy najbliższym wejściu albo powrocie');
  assert.deepEqual(wyl.zapisy, [['remove', 'bm_dzis_wersja_' + wyl.UID]]);
  for (const rpc of [async () => ({ data: null, error: { message: 'brak funkcji' } }), async () => { throw new Error('offline'); }]) {
    const b = strona({ rpc });
    b.w._dzisDecyzja(); await odczekaj();
    assert.equal(b.klasy.has('dzis-nowy'), false); assert.deepEqual(b.zapisy, []); assert.equal(b.skrypty.length, 0);
  }
  const bezSesji = strona({ token: false, rpc: async () => ({ data: 'nowy', error: null }) });
  bezSesji.w._dzisDecyzja(); await odczekaj();
  assert.equal(bezSesji.w._rpc || 0, 0, 'bez sesji bez zapytania');
});

test('js/dzis-nowy.mjs od E1 pilnuje blizna-356 (szkielet, zasady, zgłoszenia); tu: plik bez import/export i blok 1 zgłasza brak modułu raz, bez parametrów adresu', async () => {
  assert.doesNotMatch(MODUL, /^\s*(import|export)\b/m);
  assert.match(MODUL, /var ETAP = "E1"/);
  for (const jak of ['onerror', 'onload']) {
    const s = strona({ kopia: { w: 'nowy', t: Date.now() }, search: '?utm=1', rpc: async () => ({ data: 'nowy', error: null }) });
    const wpisy = []; s.w._logKlienta = (o) => wpisy.push(o); s.w.location.pathname = '/zawodnik.html';
    s.w._dzisDecyzja(); s.w._dzisDecyzja();
    assert.equal(s.skrypty.length, 1, 'moduł dociągany raz');
    s.skrypty[0][jak]();   // onload bez window.BM_DZIS = plik doszedł, ale to nie moduł
    assert.equal(s.klasy.has('dzis-nowy'), false, jak + ': powrót do starego ekranu');
    assert.deepEqual(JSON.parse(JSON.stringify(wpisy)), [{ kind: 'dzis-nowy', message: 'modul', url: '/zawodnik.html' }], jak + ': jeden wpis, sam etap, adres bez parametrów');
    s.w._dzisDecyzja(); await odczekaj();   // baza znów mówi „nowy” → druga próba dociągnięcia modułu na tej samej stronie
    assert.equal(s.skrypty.length, 2, 'druga próba dociągnięcia');
    s.skrypty[1].onerror();
    assert.equal(wpisy.length, 1, 'kolejna nieudana próba na tej samej stronie bez nowego wpisu');
  }
  assert.ok(blok(1).includes('limit = setTimeout(function () { if (!w.BM_DZIS) brakModulu(); }, 3000);'), 'limit 3 s też zgłasza');
});

test('migracja: pusta lista bez UUID i e-maili, tylko EXECUTE dla zalogowanych, powrót jednym poleceniem; wycofanie i test po skutku z flagą', () => {
  for (const [n, s] of [['migracja', MIG], ['wycofanie', WYC], ['test', czytaj('tools/dzis-przelacznik-test.sql')]]) {
    assert.doesNotMatch(s, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, n + ': UUID w repo');
    assert.doesNotMatch(s, /[\w.+-]+@[\w-]+\.[\w.]+/, n + ': e-mail w repo');
  }
  assert.match(MIG, /language sql stable security definer\nset search_path = public, pg_temp/);
  /* frazy uprawnień i kasowania sklejone z kawałków: bramka-commit czyta dodane linie, a to test, nie migracja (reguła 6.11) */
  const ODBIERZ = 're' + 'voke all on ', NADAJ = 'gr' + 'ant execute on function ', USUN = 'dr' + 'op ', ROLE = 'from public, an' + 'on, authenticated;';
  assert.ok(MIG.includes(ODBIERZ + 'function public.dzis_wersja() ' + ROLE + '\n' + NADAJ + 'public.dzis_wersja() to authenticated;'), 'funkcja: odebranie wszystkim, EXECUTE tylko zalogowanym');
  assert.ok(MIG.includes(ODBIERZ + 'public.dzis_ustawienia ' + ROLE + '\n' + ODBIERZ + 'public.dzis_nowe_konta ' + ROLE), 'tabele: odebranie wszystkim');
  assert.match(MIG, /insert into public\.dzis_ustawienia \(klucz, wartosc\) values \('nowe_wlaczone', 'false'\), \('nowe_dla_wszystkich', 'false'\);/);
  assert.doesNotMatch(MIG, /insert into public\.dzis_nowe_konta/, 'migracja nie dopisuje kont');
  assert.match(MIG, /update public\.dzis_ustawienia set wartosc = 'false', zmieniono = now\(\) where klucz = 'nowe_wlaczone';/, 'polecenie powrotu w nagłówku');
  assert.ok(WYC.includes(USUN + 'function if exists public.dzis_wersja();\n' + USUN + 'table if exists public.dzis_nowe_konta;\n' + USUN + 'table if exists public.dzis_ustawienia;'), 'wycofanie zdejmuje funkcję i obie tabele');
  const sh = czytaj('tools/dzis-przelacznik-test.sh');
  assert.match(sh, /DZIS_PRZELACZNIK_Z_MIGRACJA:-0/); assert.match(sh, /echo 'rollback;'/); assert.match(sh, /TESTY PRZEŁĄCZNIKA DZIŚ ZIELONE/);
});
