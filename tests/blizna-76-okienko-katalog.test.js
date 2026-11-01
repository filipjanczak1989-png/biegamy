/* BLIZNA 76 (1.11.2026, M3 v2 / M3c): katalog treści aplikacji w okienku + wyszukiwanie przepisów w Jedzeniu.

   Ryzyka:
   1) DWIE WYSZUKIWARKI PRZEPISÓW. Okienko i Jedzenie mają dawać TEN SAM zbiór („ciasto") — jedna funkcja
      (js/przepisy-szukaj.mjs), test porównuje oba wywołania na atrapie 16 przepisów.
   2) DRUGA KOPIA NAZW ĆWICZEŃ. Nazwy tylko w js/cwiczenia-nazwy.mjs; zawodnik.html czyta z pliku (zero `name:` w
      słownikach), klucze = deep linki ?tab=cwiczenia&prog=/&breath=.
   3) KOSZT. Mocne trafienie (≥ 0,6) = 0 tokenów, model nie startuje; słabe → null (ścieżka jak dotąd).
   4) PRYWATNOŚĆ. Katalog czyta wyłącznie radio_tracks i recipes; nic nie zapisuje.
   5) KOLEJNOŚĆ. router → osoba → impreza → katalog → pamięć → model; „Katarzyna Chojnacka" zostaje osobą.
   6) DEEP LINKI. ?utwor= i ?przepis= tylko z UUID; karty przez data-*, bez onclick. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { tekstDlaOkna } = require('./_srodowisko.js');   // porządek 1.11: js/tekst.mjs w window okienka
const { atrapa } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8');
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TYTULY = ['Owsianka z bananem i masłem orzechowym', 'Pierś kurczaka z ryżem i warzywami', 'Omlet z mozzarellą i pomidorem',
  'Zupa miso z tofu i warzywami', 'Sałatka z łososiem i kaszą', 'Jajecznica z kurczakiem, mozzarellą i pomidorem', 'Placki bananowe',
  'Ciepła sałatka z jajkiem, kaszą jaglaną i burakiem', 'Drożdżowe placki z owocami', 'Drożdżowe ciasto z owocami',
  'Jajecznica z wołowiną i pieczarkami', 'Proteinowe Pancakes', 'Jajecznica z indykiem i pieczarkami na żytnim pieczywie',
  'Pasta z tuńczykiem, pomidorami i oliwkami', 'Makaron z tuńczykiem, brokułem i pomidorami', 'Filet z dorsza z warzywami i kaszy jaglanej'];
const PRZEPISY = TYTULY.map((t, i) => ({ id: U(100 + i), title: t, emoji: '🍽️', tags: i === 6 ? ['śniadanie', 'ciasto'] : ['obiad'],
  ingredients: [{ item: i === 11 ? 'mąka na ciasto' : 'sól', amount: '1 g' }] }));
const RADIO = [{ id: U(1), title: 'Żelazna wola', artist: 'BiegaMy', cover_slug: 'cover-1' }, { id: U(2), title: 'Czwarta Godzina', artist: 'X', cover_slug: null },
  { id: U(3), title: 'Radio Bieg', artist: 'Y', cover_slug: null }];
const baza = () => ({ radio_tracks: JSON.parse(JSON.stringify(RADIO)), recipes: JSON.parse(JSON.stringify(PRZEPISY)) });
async function katalog(q) { const K = await zaladuj('supabase/functions/okienko/katalog.mjs'); const sb = atrapa(baza()); return { w: await K.szukajWKatalogu(sb, q), sb }; }

test('„ciasto" w okienku = ten sam zbiór co w Jedzeniu (jedna funkcja, atrapa 16 przepisów)', async () => {
  await zaladuj('js/tekst.mjs');   // nutrition.html ładuje go przed przepisy-szukaj.mjs
  await zaladuj('js/przepisy-szukaj.mjs');
  const jedzenie = globalThis.BM_SZUKAJ.szukajPrzepisow(PRZEPISY, 'ciasto').map((x) => x.p.id).sort();
  assert.deepEqual(jedzenie.length, 3, 'tytuł + tag + składnik');
  const K = await zaladuj('supabase/functions/okienko/katalog.mjs');
  const sb = atrapa(baza());
  const w = await K.szukajWKatalogu(sb, 'ciasto');
  assert.deepEqual(w.karty.filter((k) => k.typ === 'przepis').map((k) => k.dane.id).sort(), jedzenie);
  const N = czytaj('nutrition.html');
  assert.match(N, /<script src="js\/przepisy-szukaj\.mjs"><\/script>/);
  assert.match(N, /window\.BM_SZUKAJ\.szukajPrzepisow\(_libRecipes, _libQ\)/, 'Jedzenie filtruje tą samą funkcją');
  assert.match(N, /placeholder="Szukaj przepisu"/);
  assert.match(N, /Brak przepisu z tym słowem\./);
  assert.match(N, /<div class="search-wrap"[^>]*><input id="recipe-lib-q"/, 'ten sam styl co „Szukaj" produktów');
});

test('katalog: „zelazna" → utwór, „omlet" → przepis, „core" → program, „radio" → ekran; mocne = 0 tokenów; ≤ 5 kart', async () => {
  const z = (await katalog('zelazna')).w;
  assert.equal(z.karty[0].typ, 'utwor'); assert.equal(z.karty[0].dane.id, U(1));
  assert.equal((await katalog('omlet')).w.karty[0].typ, 'przepis');
  const c = (await katalog('core')).w.karty[0];
  assert.deepEqual([c.typ, c.dane.rodzaj, c.dane.klucz], ['cwiczenie', 'prog', 'core']);
  const r = (await katalog('radio')).w;
  assert.ok(r.karty.some((k) => k.typ === 'kat_ekran' && k.dane.ekran === 'radio'));
  assert.equal(r.karty[0].typ, 'utwor', 'remis: radio przed resztą');
  assert.equal((await katalog('4-7-8 oddech')).w.karty[0].dane.klucz, '478', 'M3-1 (2): „oddech” = kategoria, cyfry = słowa → technika');
  assert.equal((await katalog('zelazna kotlina gory')).w, null, 'słabe trafienie (1 z 3 słów < 0,6) → null');
  assert.equal((await katalog('xyz qwe')).w, null);
  assert.equal((await katalog('ab')).w, null, '< 3 znaki');
  assert.ok((await katalog('jajecznica')).w.karty.length <= 5);
  const ef = czytaj('supabase', 'functions', 'okienko', 'index.ts');
  assert.match(ef, /if \(kat\) \{\s*\n\s*await zapiszLog\(adm, \{ athlete_id: ath\.id, tekst, narzedzia: \["katalog"\], tryb: "router" \}\);\s*\n\s*return odp\(200, \{ \.\.\.pusto\("router"\)/, '0 tokenów, bez modelu');
});

test('kolejność w EF: router → osoba → impreza → katalog → pamięć → model', () => {
  const ef = czytaj('supabase', 'functions', 'okienko', 'index.ts');
  const i = (s) => { const k = ef.indexOf(s); assert.ok(k > 0, s); return k; };
  const kol = [i('const traf = dopasuj(tekst, dzis);'), i('const os = osobaZPytania(tekst);'), i('const imp = imprezaZPytania(tekst);'),
    i('kat = await szukajWKatalogu(sb, tekst)'), i('const pam = await zPamieci'), i('m = await zapytajModel({')];
  assert.deepEqual([...kol].sort((a, b) => a - b), kol);
});

test('prywatność: katalog czyta wyłącznie radio_tracks i recipes, nic nie zapisuje', async () => {
  const { sb } = await katalog('ciasto');
  assert.deepEqual([...new Set(sb.zapytania.map((z) => z.nazwa))].sort(), ['radio_tracks', 'recipes']);
  assert.ok(sb.zapytania.every((z) => z.zapis === false));
  assert.ok(!/\.(insert|upsert|update|delete|rpc)\(/.test(czytaj('supabase', 'functions', 'okienko', 'katalog.mjs')));
});

test('ćwiczenia: nazwy tylko w js/cwiczenia-nazwy.mjs, zawodnik.html bez `name:` w słownikach i z <script src>; klucze = słowniki strony', async () => {
  await zaladuj('js/cwiczenia-nazwy.mjs');
  const C = globalThis.BM_CWICZENIA_NAZWY;
  const Z = czytaj('zawodnik.html');
  const blok = (a, b) => Z.slice(Z.indexOf(a), Z.indexOf(b, Z.indexOf(a)));
  const ex = blok('const EXERCISES = {', '\n};'), pr = blok('const PROGRAMS = [', '\n];'), br = blok('const BREATH_TECHNIQUES = {', '\n};');
  for (const b of [ex, pr, br]) assert.ok(!/\bname\s*:/.test(b.replace(/\r/g, '')), 'druga kopia nazw w zawodnik.html');
  assert.ok(!/const WIMHOF = \{ name:/.test(Z));
  assert.deepEqual([...ex.matchAll(/^\s+([A-Za-z0-9_]+):\s*\{/gm)].map((m) => m[1]).sort(), Object.keys(C.cwiczenia).sort());
  assert.deepEqual([...pr.matchAll(/\{ id:'([^']+)'/g)].map((m) => m[1]).sort(), Object.keys(C.programy).sort());
  assert.deepEqual(Object.keys(C.oddech).sort(), ['478', 'box', 'wim']);
  assert.match(Z, /<script src="js\/cwiczenia-nazwy\.mjs"><\/script>/);
  assert.ok(Z.indexOf('<script src="js/cwiczenia-nazwy.mjs">') < Z.indexOf('const EXERCISES = {'), 'nazwy przed słownikami');
  assert.match(Z, /EXERCISES\[k\]\.name = N\.cwiczenia\[k\] \|\| k;/);
  for (const n of Object.values(C.cwiczenia)) assert.ok(!Z.includes(`'${n}'`), `nazwa „${n}" wpisana w zawodnik.html`);
  const sw = czytaj('sw.js');
  assert.match(sw, /'\/js\/cwiczenia-nazwy\.mjs'/); assert.match(sw, /'\/js\/przepisy-szukaj\.mjs'/);
});

test('UI: karty katalogu przez data-*, bez onclick; akcje → radio.html?utwor=, nutrition.html?przepis=, deep linki ćwiczeń; nazwy ekranów = EF', async () => {
  const okno = { BM_TEKST: tekstDlaOkna(), escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    safeUrlAttr: (u) => u, RADIO: { coverUrl: (t) => 'https://x.supabase.co/storage/v1/object/public/radio-audio/' + t.cover_slug + '.webp' } };
  const loc = { search: '', href: '' };
  const ctx = vm.createContext({ window: okno, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: () => null, setItem() {} }, location: loc, navigator: {}, setTimeout, console, encodeURIComponent });
  vm.runInContext(czytaj('js', 'okienko.js'), ctx);
  const O = okno.OKIENKO;
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  assert.equal(JSON.stringify(O.NAZWY_EKRANOW), JSON.stringify(N.NAZWY_EKRANOW));
  const html = O.htmlOdpowiedzi(200, { tryb: 'router', zdania: ['Znalazłem w aplikacji:'], karty: [
    { typ: 'utwor', dane: { id: U(1), tytul: '<b>Żelazna</b>', cover_slug: 'c' } }, { typ: 'utwor', dane: { id: 'zly', tytul: 'X' } },
    { typ: 'przepis', dane: { id: U(105), tytul: 'Omlet' } }, { typ: 'cwiczenie', dane: { rodzaj: 'prog', klucz: 'core', nazwa: 'Core' } },
    { typ: 'kat_ekran', dane: { cel: 'radio.html', nazwa: 'Radio' } }] });
  assert.ok(!/onclick/i.test(html)); assert.ok(html.includes('&lt;b&gt;Żelazna')); assert.ok(!html.includes('>X<'), 'utwór bez UUID');
  assert.match(html, /data-katalog="utwor" data-id="[0-9a-f-]{36}">▶ Odtwórz/);
  assert.match(html, /data-cel="radio\.html">Otwórz ›/);
  const b = (atr) => ({ getAttribute: (k) => atr[k] ?? null });
  O.akcjaKatalogu(b({ 'data-katalog': 'utwor', 'data-id': U(1) })); assert.equal(loc.href, 'radio.html?utwor=' + U(1));
  O.akcjaKatalogu(b({ 'data-katalog': 'przepis', 'data-id': U(105) })); assert.equal(loc.href, 'nutrition.html?przepis=' + U(105));
  O.akcjaKatalogu(b({ 'data-katalog': 'cwiczenie', 'data-rodzaj': 'breath', 'data-klucz': '478' })); assert.equal(loc.href, 'zawodnik.html?tab=cwiczenia&breath=478');
  loc.href = '';
  O.akcjaKatalogu(b({ 'data-katalog': 'utwor', 'data-id': "x');alert(1)" })); assert.equal(loc.href, '', 'nie-UUID ignorowany');
});

test('?utwor= i ?przepis=: tylko UUID, raz na wejście, podświetl + przewiń; radio próbuje grać', () => {
  const R = czytaj('radio.html'), N = czytaj('nutrition.html');
  const r = R.slice(R.indexOf('function _radioZAdresu(){'), R.indexOf('function _radioZAdresu(){') + 1100);
  assert.match(r, /\/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$\/i\.test\(id\)/);
  assert.match(r, /karta\.classList\.add\('rad-podswietl'\)/); assert.match(r, /scrollIntoView/); assert.match(r, /try \{ radioPlay\(id\); \} catch\(e\)\{\}/);
  assert.match(R, /_radioZAdresu\(\);\n?\r?\n?\}/, 'wołane po wyrenderowaniu katalogu');
  const n = N.slice(N.indexOf('function _libOtworzZAdresu() {'), N.indexOf('function _libOtworzZAdresu() {') + 900);
  assert.match(n, /\/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$\/i\.test\(id\)/);
  assert.match(n, /toggleLibRow\(row\)/); assert.match(n, /row\.classList\.add\('lib-podswietl'\)/);
  assert.match(N, /_renderRecipeLibrary\(\);\r?\n\s*_libOtworzZAdresu\(\);/);
});
