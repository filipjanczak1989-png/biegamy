/* BLIZNA 150 (4.11.2026) — FIRMY WSPIERAJĄCE AKCJĘ (Filip 4.11): „Firmy, które pomogły <imię>” na dla-fabianka.html, karcie na Dziś i w Okienku,
   lista z akcja_licznik, formularz w panelu trenera, tabela akcja_firmy + bucket akcja-firmy-logo.

   Pilnuje:
   - sekcja znika w całości przy pustej liście, przy braku listy, przy błędzie odczytu i przy awarii renderu (zero samego nagłówka); strona akcji działa dalej;
   - tekst pod sekcją dosłownie jak w zleceniu, tylko przy niepustej liście; kolejność z bazy;
   - kwota tylko przy zgodzie: warunek W BAZIE (licznik wymienia pola po imieniu), front pokazuje wyłącznie to, co przyszło; potwierdzenie i autor nie wychodzą;
   - XSS: nazwa przez escapeHtml, link tylko https przez safeExternalHref, logo wyłącznie z naszego bucketu (safeUrlAttr przepuściłby też Tenora i GH Pages);
   - zapis tylko trener przez RLS (auth_is_coach), nie user_metadata; revoke anona po create table + asercje has_table_privilege; CHECK-i; bucket bez SVG, z limitem;
   - licznik w migracji = licznik z produkcji + tylko firmy, wycofanie wraca dokładnie do niego;
   - imienia nie ma w kodzie (repo publiczne, przed startem nic nie zdradza): tytuł z bazy w celowniku.
   Zachowanie w bazie po skutku: tools/akcja-firmy-test.sh (set local role + request.jwt.claims). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { zaladujSb, blokiSkryptow } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const POD_SEKCJA = 'Firmy wpłacają bezpośrednio na zbiórkę. BiegaMy nie pośredniczy w pieniądzach. Wymienienie firmy to podziękowanie, nie reklama. Firmy nie używają imienia ani wizerunku dziecka bez zgody rodzica.';
const PLIK = '00000000-0000-4000-8000-000000000001.png';
const LOGO = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/' + PLIK;
const FIRMA = { nazwa: 'Firma Testowa', link: 'https://firma-testowa.pl/o-nas', logo_url: LOGO, kwota_gr: 100000 };
const D = { wystartowala: true, imie: 'Fabianek', nazwa: 'Akcja', cel_km: 100, suma_km: 1, pct: 1, start: '2026-11-07', stawka_filip_gr: 10, filip_gr: 10, filip_max_gr: 1000, url_zbiorki: 'https://www.siepomaga.pl/x', koniec: null, zamknieta: false };
let A;

test.before(async () => {
  const ctx = zaladujSb();   // PRAWDZIWE helpery z sb.js, nie atrapy
  for (const k of ['escapeHtml', 'safeUrlAttr', 'safeExternalHref', 'SB_URL']) globalThis[k] = ctx[k];
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  await import(pathToFileURL(path.join(KORZEN, 'js/moderacja.mjs')).href);
  A = globalThis.BM_AKCJA;
});

test('sekcja: pusta lista, brak listy, przed startem i null → pusty napis, bez nagłówka', () => {
  assert.equal(A.firmyHtml({ ...D, firmy: [] }), '');
  assert.equal(A.firmyHtml({ ...D }), '', 'licznik bez pola firmy (front przed migracją)');
  assert.equal(A.firmyHtml({ ...D, firmy: 'zepsute' }), '');
  assert.equal(A.firmyHtml({ ...D, firmy: [{ nazwa: '   ' }, null] }), '', 'same puste wpisy = pusta lista');
  assert.equal(A.firmyHtml({ ...D, wystartowala: false, firmy: [FIRMA] }), '', 'przed startem nic');
  assert.equal(A.firmyHtml(null), '');
});

test('sekcja przy niepustej liście: tytuł z imieniem z bazy w celowniku, tekst dosłownie, kolejność z bazy', () => {
  const h = A.firmyHtml({ ...D, firmy: [{ ...FIRMA, nazwa: 'Pierwsza' }, { ...FIRMA, nazwa: 'Druga' }] }, 'akcja-firmy--strona');
  assert.match(h, /<h3 class="akcja-firmy-tytul">Firmy, które pomogły Fabiankowi<\/h3>/);
  assert.ok(h.includes('<p class="akcja-firmy-uwaga">' + POD_SEKCJA + '</p>'), 'tekst pod sekcją');
  assert.ok(h.indexOf('</ul>') < h.indexOf(POD_SEKCJA), 'tekst POD listą');
  assert.ok(h.indexOf('Pierwsza') < h.indexOf('Druga'), 'kolejność z bazy');
  assert.match(h, /class="akcja-firmy akcja-firmy--strona"/);
  assert.equal(A.tytulFirm({ imie: null }), 'Firmy, które pomogły', 'bez imienia w bazie: tytuł bez imienia');
  assert.equal(A.celownik('Marek'), 'Markowi'); assert.equal(A.celownik('Jan'), 'Janowi'); assert.equal(A.celownik('Kuba'), '', 'bez słownika nie zgadujemy');
});

test('kwota: tylko to, co przyszło z bazy, z etykietą, w złotych; bez kwoty żadnej etykiety', () => {
  assert.match(A.firmyHtml({ ...D, firmy: [FIRMA] }), /<div class="akcja-firma-kwota">Wpłata: 1\s000\szł<\/div>/);
  assert.match(A.firmyHtml({ ...D, firmy: [{ ...FIRMA, kwota_gr: 123450 }] }), /Wpłata: 1\s234,50\szł/);
  for (const k of [null, undefined, 0, -5, 'x']) assert.doesNotMatch(A.firmyHtml({ ...D, firmy: [{ ...FIRMA, kwota_gr: k }] }), /Wpłata|zł/, String(k));
});

test('XSS: nazwa escapowana w tytule i na liście, imię z bazy też', () => {
  const zla = '<img src=x onerror=alert(1)>';
  const h = A.firmyHtml({ ...D, imie: '<b>Jan', firmy: [{ ...FIRMA, nazwa: zla }] });
  assert.doesNotMatch(h, /<img src=x|<b>Jan/);
  assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
  const bezLinku = A.firmyHtml({ ...D, firmy: [{ nazwa: zla, link: 'javascript:alert(1)' }] });
  assert.doesNotMatch(bezLinku, /<img src=x/);
});

test('link: tylko https przez safeExternalHref; zły link odrzucony, nazwa zostaje bez odnośnika', () => {
  assert.match(A.firmyHtml({ ...D, firmy: [FIRMA] }), /<a class="akcja-firma-nazwa" href="https:\/\/firma-testowa\.pl\/o-nas" target="_blank" rel="noopener noreferrer nofollow">Firma Testowa<\/a>/);
  for (const zly of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'http://firma.pl', 'firma.pl', '//firma.pl', '', null, 5]) {
    const h = A.firmyHtml({ ...D, firmy: [{ ...FIRMA, link: zly }] });
    assert.doesNotMatch(h, /<a /, String(zly));
    assert.match(h, /<span class="akcja-firma-nazwa">Firma Testowa<\/span>/, String(zly));
  }
  assert.doesNotMatch(A.firmyHtml({ ...D, firmy: [{ ...FIRMA, link: 'https://a.pl/"onmouseover="x' }] }), /href="[^"]*"onmouseover/, 'cudzysłów nie wychodzi z atrybutu');
});

test('logo: wyłącznie plik z naszego bucketu; obce hosty z listy safeUrlAttr też odpadają', () => {
  assert.equal(A.logoFirmy({ logo_url: LOGO }), LOGO);
  assert.match(A.firmyHtml({ ...D, firmy: [FIRMA] }), new RegExp('<img class="akcja-firma-logo" src="' + LOGO.replace(/[./]/g, '\\$&') + '" alt="" loading="lazy">'));
  const obce = ['https://evil.example/logo.png', 'http://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/' + PLIK,
    'https://media.tenor.com/x.png', 'https://media1.giphy.com/x.png', 'https://filipjanczak1989-png.github.io/biegamy-assets/x.png',
    'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/avatars/' + PLIK, LOGO.replace('.png', '.svg'), LOGO + '"onerror="x', 'javascript:alert(1)', '', null];
  for (const u of obce) {
    assert.equal(A.logoFirmy({ logo_url: u }), '', String(u));
    assert.doesNotMatch(A.firmyHtml({ ...D, firmy: [{ ...FIRMA, logo_url: u }] }), /<img/, String(u));
  }
  assert.ok(globalThis.safeUrlAttr('https://media.tenor.com/x.png'), 'safeUrlAttr sam przepuszcza Tenora: dlatego własny prefiks bucketu');
});

function strona(Aatrapa) {
  const el = {};
  const dok = { title: '', visibilityState: 'visible', addEventListener() {}, getElementById: (id) => (el[id] = el[id] || { hidden: false, textContent: '', innerHTML: '', href: '' }) };
  const kod = blokiSkryptow('dla-fabianka.html').join('\n');
  vm.runInNewContext(kod, { window: { BM_AKCJA: Aatrapa }, document: dok, Intl, Date, String, Number, JSON, location: { hash: '', search: '' }, setInterval: () => 0 });
  return el;
}
const pokazana = async (Aatrapa) => { const el = strona(Aatrapa); await new Promise(setImmediate); return el; };

test('dla-fabianka.html (kod strony): widoczna przy liście, ukryta przy pustej, przy błędzie odczytu i przy awarii renderu; reszta strony działa', async () => {
  const z = (d, nad) => pokazana({ ...A, pobierzPubliczny: async () => d, ...nad });
  let el = await z({ ...D, firmy: [FIRMA] });
  assert.equal(el.firmy.hidden, false); assert.equal(el.pelna.hidden, false);
  assert.match(el.firmy.innerHTML, /Firmy, które pomogły Fabiankowi/); assert.ok(el.firmy.innerHTML.includes(POD_SEKCJA));
  for (const d of [{ ...D, firmy: [] }, { ...D }]) {
    el = await z(d);
    assert.equal(el.firmy.hidden, true); assert.equal(el.firmy.innerHTML, ''); assert.equal(el.pelna.hidden, false, 'strona akcji żyje');
  }
  el = await z({ ...D, firmy: [FIRMA] }, { firmyHtml() { throw new Error('awaria'); } });
  assert.equal(el.firmy.hidden, true, 'render rzuca'); assert.equal(el.pelna.hidden, false); assert.match(el.filip.textContent, /Filip dokłada/);
  el = await z({ ...D, firmy: [FIRMA] }, { firmyHtml: undefined });
  assert.equal(el.firmy.hidden, true, 'stary js/akcja.mjs bez firmyHtml');
  el = await pokazana({ ...A, pobierzPubliczny: async () => { throw new Error('siec'); } });
  assert.equal(el.pelna.hidden, true); assert.equal(el.teaser.hidden, false); assert.equal((el.firmy || {}).innerHTML || '', '', 'błąd odczytu: nic o firmach');
  el = await z({ wystartowala: false, start: '2026-11-07' });
  assert.equal(el.pelna.hidden, true, 'przed startem teaser');
  const html = czytaj('dla-fabianka.html');
  assert.match(html, /<div id="firmy" hidden><\/div>/);
  assert.doesNotMatch(html, /\.rpc\(|createClient\(|akcja_firmy['"]/, 'strona publiczna nie woła bazy wprost (wariant b)');
});

test('karta na Dziś (js/akcja.mjs, bez zmiany zawodnik.html) i Okienko (js/okienko.js, _akcjaStan): firmy są, a pusta lista nie zostawia śladu', () => {
  const dzis = new Date('2026-11-08T12:00:00Z');
  const pusta = A.kartaDzisHtml({ ...D, firmy: [] }, { km: 1 }, dzis);
  assert.doesNotMatch(pusta, /akcja-firmy[ "]|Firmy, które/, 'pusta lista: nic poza stylami');
  const k = A.kartaDzisHtml({ ...D, firmy: [FIRMA] }, { km: 1 }, dzis);
  assert.match(k, /Firmy, które pomogły Fabiankowi/); assert.ok(k.includes(POD_SEKCJA));
  assert.match(A.kartaDzisHtml({ ...D, firmy: [FIRMA], koniec: '2026-11-08', zamknieta: true }, { km: 1 }, dzis), /Firmy, które pomogły Fabiankowi/, 'po zamknięciu podziękowanie zostaje');
  assert.deepEqual(Object.keys(A.kartaOkienka({ ...D, firmy: [FIRMA] }).dane).sort(), ['cel_km', 'nazwa', 'pct', 'suma_km', 'url_zbiorki', 'zamknieta'], 'EF okienko bez zmian');
  const ctx = zaladujSb(); ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  vm.runInContext(czytaj('js/okienko.js'), ctx, { filename: 'js/okienko.js' });
  const odp = { tryb: 'akcja', zdania: [], karty: [A.kartaOkienka({ ...D, firmy: [FIRMA] })] }, html = () => ctx.OKIENKO.htmlOdpowiedzi(200, odp);
  ctx.BM_AKCJA = A; ctx._akcjaStan = { ...D, firmy: [FIRMA] };
  assert.match(html(), /Firmy, które pomogły Fabiankowi/); assert.ok(html().includes(POD_SEKCJA));
  ctx._akcjaStan = { ...D, firmy: [] };
  assert.doesNotMatch(html(), /Firmy, które/, 'Okienko: pusta lista');
  ctx._akcjaStan = undefined;
  assert.doesNotMatch(html(), /Firmy, które/, 'Okienko: bez stanu z Dziś nic');
  assert.match(html(), /Oficjalna zbiórka/, 'karta akcji działa dalej');
  ctx.BM_AKCJA = undefined;
  assert.match(html(), /Oficjalna zbiórka/, 'Okienko bez js/akcja.mjs: karta jak dotąd');
});

test('imienia nie ma w kodzie: js/akcja.mjs, dla-fabianka.html, js/okienko.js, trener.html (repo publiczne)', () => {
  for (const p of ['js/akcja.mjs', 'dla-fabianka.html', 'js/okienko.js', 'trener.html']) {
    assert.doesNotMatch(czytaj(p).replace(/dla-fabianka(\.html)?/g, ''), /fabian/i, p);
  }
  for (const p of ['supabase/migrations/20261104_akcja_firmy.sql', 'supabase/migrations/20261104_WYCOFANIE_akcja_firmy.sql', 'tools/akcja-firmy-test.sql', 'js/akcja.mjs', 'trener.html']) {
    assert.doesNotMatch(czytaj(p), /jasn\w* gór|częstochow/i, p + ': cel wyprawy jest tajemnicą');
  }
});

test('link firmy na ekranie: ten sam wzorzec co CHECK, bez danych logowania w adresie (red team 2)', () => {
  const g = globalThis, bylo = g.safeExternalHref;
  g.safeExternalHref = (u) => u;
  try {
    assert.equal(A.linkFirmy({ link: 'https://firma.pl/x' }), 'https://firma.pl/x');
    for (const zly of ['https://zly.example@a.pl/', 'https://a:b@a.pl', 'http://firma.pl', 'javascript:alert(1)', 'https://bez-kropki', 'https://a.pl/"><img', ' //a.pl', null, 7]) assert.equal(A.linkFirmy({ link: zly }), '', String(zly));
  } finally { if (bylo) g.safeExternalHref = bylo; else delete g.safeExternalHref; }
});

test('formularz: filtr nazw przy zbiórce; wulgaryzmu nie da się potwierdzić, polityczną nazwę trener potwierdza; bez filtra nie zapisujemy (decyzja Filipa 4.11)', () => {
  const ok = { nazwa: 'Firma Testowa', link: 'https://firma.pl/x', kwotaZl: '', zgoda: false, zgodaWymienienie: true, potwierdzenie: true };
  const zly = A.firmaDoZapisu({ ...ok, nazwa: 'Kurwa Trans' });
  assert.ok(zly.blad && !zly.wiersz); assert.equal(zly.mozna_potwierdzic, false);
  assert.ok(A.firmaDoZapisu({ ...ok, nazwa: 'Kurwa Trans', nazwaSprawdzona: true }).blad, 'potwierdzenie nie zdejmuje wulgaryzmu');
  const pol = A.firmaDoZapisu({ ...ok, nazwa: 'Auto Duda' });
  assert.ok(pol.blad && !pol.wiersz); assert.equal(pol.mozna_potwierdzic, true); assert.match(pol.blad, /Sprawdziłem tę nazwę/);
  assert.equal(A.firmaDoZapisu({ ...ok, nazwa: 'Auto Duda', nazwaSprawdzona: true }).wiersz.nazwa, 'Auto Duda');
  const bylo = globalThis.BM_MODERACJA; delete globalThis.BM_MODERACJA;
  try { assert.match(A.firmaDoZapisu(ok).blad, /Filtr nazw/); } finally { globalThis.BM_MODERACJA = bylo; }
});

test('formularz: walidacja jak CHECK-i w bazie (komunikat po polsku, zamkiem jest baza)', () => {
  const ok = { nazwa: ' Firma Testowa ', link: 'https://firma.pl/x', kwotaZl: '', zgoda: false, zgodaWymienienie: true, potwierdzenie: true };
  assert.deepEqual(A.firmaDoZapisu(ok).wiersz, { nazwa: 'Firma Testowa', link: 'https://firma.pl/x', rodzaj: 'domek', wsparcie: 'wplata', kwota_gr: null, zgoda_na_kwote: false, potwierdzenie_widziane: true, zgoda_na_wymienienie: true });
  assert.equal(A.firmaDoZapisu({ ...ok, link: 'firma.pl' }).wiersz.link, 'https://firma.pl/', 'adres bez schematu dostaje https');
  assert.equal(A.firmaDoZapisu({ ...ok, kwotaZl: '1 000,50 zł', zgoda: true }).wiersz.kwota_gr, 100050);
  assert.equal(A.firmaDoZapisu({ ...ok, kwotaZl: '1000', zgoda: false }).wiersz.zgoda_na_kwote, false, 'kwota bez zgody zapisana, ale niepubliczna');
  for (const [nad, re] of [[{ potwierdzenie: false }, /potwierdzenie wpłaty/], [{ zgodaWymienienie: false }, /Firma zgodziła się na wymienienie/], [{ zgodaWymienienie: undefined }, /Firma zgodziła się na wymienienie/], [{ nazwa: 'x' }, /Nazwa/], [{ nazwa: 'x'.repeat(121) }, /Nazwa/],
    [{ link: 'http://firma.pl' }, /https/], [{ link: 'javascript:alert(1)' }, /https/], [{ link: '' }, /Link/], [{ link: 'https://firma.pl@zly.example' }, /https/], [{ link: 'https://bez-kropki' }, /https/],
    [{ kwotaZl: 'abc' }, /Kwota/], [{ kwotaZl: '0' }, /Kwota/], [{ kwotaZl: '-5' }, /Kwota/], [{ kwotaZl: '99999999' }, /Kwota/], [{ zgoda: true }, /Zgoda/]]) {
    const w = A.firmaDoZapisu({ ...ok, ...nad });
    assert.ok(w.blad && !w.wiersz, JSON.stringify(nad)); assert.match(w.blad, re, JSON.stringify(nad));
  }
  const plik = (type, size) => ({ type, size });
  assert.deepEqual(A.logoDoWgrania(null), { rozszerzenie: null }, 'logo opcjonalne');
  assert.equal(A.logoDoWgrania(plik('image/png', 10)).rozszerzenie, 'png'); assert.equal(A.logoDoWgrania(plik('image/jpeg', 10)).rozszerzenie, 'jpg'); assert.equal(A.logoDoWgrania(plik('image/webp', 1048576)).rozszerzenie, 'webp');
  for (const zly of [plik('image/svg+xml', 10), plik('text/html', 10), plik('constructor', 10), plik('image/png', 1048577), plik('image/png', 0)]) assert.ok(A.logoDoWgrania(zly).blad, JSON.stringify(zly));
});

test('panel trenera: pole plik, nie adres; potwierdzenie; dane w dataset, bez JS w atrybutach; zapis przez akcja_firmy; bez adresu z przeglądarki w logo', () => {
  const h = czytaj('trener.html');
  const f = h.slice(h.indexOf('<details class="fi" id="firmy-sec"'), h.indexOf('id="firmy-lista"'));
  assert.match(f, /<input type="file" id="firma-logo" accept="image\/png,image\/jpeg,image\/webp,application\/pdf">/);
  assert.doesNotMatch(f, /type="url" id="firma-logo|svg/i);
  assert.match(f, /id="firma-potwierdzenie-tekst">Wpłata powyżej progu potwierdzona<\/span><\/label>/);
  assert.match(f, /id="firma-wymienienie" required[^>]*>Firma zgodziła się na wymienienie<\/label>/, 'obowiązkowa (Filip 4.11)');
  assert.match(h, /<script src="js\/akcja\.mjs"><\/script>/);
  const start = h.indexOf('/* Firmy wspierające akcję: jeden formularz'), k = h.slice(start, h.indexOf('</script>', start));
  assert.match(k, /sb\.from\('akcja_firmy'\)\.insert\(p\.wiersz\)/);
  assert.match(k, /sb\.from\('akcja_firmy'\)\.delete\(\)\.eq\('id', f\.id\)\.select\('id'\)/, 'RLS daje 0 wierszy bez błędu: bez select skasowanie „udałoby się” po cichu');
  assert.match(k, /crypto\.randomUUID\(\) \+ '\.' \+ lg\.rozszerzenie/); assert.match(k, /upsert: false/);
  assert.match(k, /window\.escapeHtml\(f\.nazwa\)/); assert.match(k, /A\.linkFirmy\(f\)/); assert.match(k, /A\.logoFirmy\(f\)/);
  assert.doesNotMatch(k, /onclick=|onerror=|onload=/, 'bez JS w atrybutach');
  assert.doesNotMatch(k, /user_metadata/, 'uprawnienia nie z user_metadata');
  assert.doesNotMatch(k, /potwierdzenie_widziane|zgoda_na_wymienienie/, 'lista nie czyta potwierdzenia ani zgody: to tylko zapis (firmaDoZapisu)');
  assert.match(k, /zgodaWymienienie: \$\('firma-wymienienie'\)\.checked/);
});

const MIG = czytaj('supabase/migrations/20261104_akcja_firmy.sql');
const bezKom = (s) => s.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

test('migracja: revoke anona po create table + asercje, granty kolumnowe, RLS tylko trener przez auth_is_coach', () => {
  const m = bezKom(MIG);
  assert.ok(m.indexOf('create table public.akcja_firmy') < m.search(/revoke\s+all\s+on\s+public\.akcja_firmy\s+from\s+anon;/), 'revoke PO create (default privileges)');
  assert.match(m, /revoke\s+all\s+on\s+public\.akcja_firmy\s+from\s+anon;/); assert.match(m, /revoke\s+all\s+on\s+public\.akcja_firmy\s+from\s+authenticated;/);
  assert.match(m, /enable\s+row\s+level\s+security/);
  assert.match(m, /has_table_privilege\('anon', 'public\.akcja_firmy'/); assert.match(m, /has_any_column_privilege\('anon', 'public\.akcja_firmy'/);
  assert.doesNotMatch(m, /to\s+anon\b/i, 'żadnego nadania dla anona');
  const zapis = m.match(/grant\s+insert\s+\(([^)]+)\)\s+on\s+public\.akcja_firmy\s+to\s+authenticated;/);
  assert.ok(zapis, 'zapis kolumnowo');
  assert.doesNotMatch(zapis[1], /dodal|dodano|\bid\b/, 'autor i data nie z przeglądarki');
  assert.doesNotMatch(m, /grant\s+[^;]*update[^;]*on\s+public\.akcja_firmy/i, 'bez UPDATE');
  const pol = [...m.matchAll(/create\s+policy\s+\w+\s+on\s+public\.akcja_firmy\s+for\s+(\w+)\s+to\s+(\w+)\s+([^;]+);/g)];
  assert.deepEqual(pol.map((p) => p[1]).sort(), ['delete', 'insert', 'select']);
  for (const p of pol) { assert.equal(p[2], 'authenticated'); assert.match(p[3], /public\.auth_is_coach\(\)/); }
  assert.match(m, /with\s+check\s+\(public\.auth_is_coach\(\)\s+and\s+dodal\s+=\s+auth\.uid\(\)\)/);
  assert.doesNotMatch(m, /user_metadata/);
  assert.doesNotMatch(m, /references\s+public\.athletes/, 'bez klucza do athletes: delete_my_account bez zmian');
  assert.match(m, /references\s+auth\.users\(id\)\s+on\s+delete\s+set\s+null/, 'firma nie blokuje kasowania konta trenera');
});

test('migracja: CHECK-i — potwierdzenie, https, logo z bucketu, długość nazwy, zgoda wymaga kwoty', () => {
  const m = bezKom(MIG);
  assert.match(m, /potwierdzenie_widziane boolean not null check \(potwierdzenie_widziane = true\)/);
  assert.match(m, /zgoda_na_wymienienie\s+boolean not null check \(zgoda_na_wymienienie = true\)/, 'bez wartości domyślnej: nikt nie doda firmy bez zaznaczenia');
  assert.match(m, /char_length\(btrim\(nazwa\)\) between 2 and 120/);
  const linkRe = m.match(/link ~ '([^\n]+)'\),\n/)[1].replace(/''/g, "'");
  const logoRe = m.match(/logo_url ~ '([^']+)'/)[1];
  assert.ok(linkRe.startsWith('^https://')); assert.ok(logoRe.startsWith('^https://afqojgkaveykxbltxzwm\\.supabase\\.co/storage/v1/object/public/akcja-firmy-logo/'));
  assert.match(logoRe, /\(png\|jpg\|webp\)\$$/);
  assert.match(m, /check \(not zgoda_na_kwote or kwota_gr is not null\)/);
});

test('migracja: bucket bez SVG, z limitem; zapis i kasowanie pliku tylko trener; nadpisania brak', () => {
  const m = bezKom(MIG);
  assert.match(m, /values \('akcja-firmy-logo', 'akcja-firmy-logo', true, 1048576, array\['image\/png', 'image\/jpeg', 'image\/webp'\]\)/);
  assert.doesNotMatch(m, /svg/i);
  const pol = [...m.matchAll(/create\s+policy\s+\w+\s+on\s+storage\.objects\s+for\s+(\w+)\s+to\s+(\w+)\s+([^;]+);/g)];
  assert.deepEqual(pol.map((p) => p[1]).sort(), ['delete', 'insert', 'select'], 'bez UPDATE: pliku nie da się nadpisać');
  for (const p of pol) { assert.equal(p[2], 'authenticated'); assert.match(p[3], /bucket_id = 'akcja-firmy-logo' and public\.auth_is_coach\(\)/); }
  assert.match(m, /public\.auth_is_coach\(\) and name ~ '\^\[0-9a-f-\]\{36\}\\\.\(png\|jpg\|webp\)\$'/);
  assert.match(czytaj('supabase/migrations/20261104_WYCOFANIE_akcja_firmy.sql'), /BUCKET ZOSTAJE/, 'storage blokuje bezpośredni DELETE: wycofanie nie udaje, że kasuje bucket');
});

test('licznik: pola po imieniu, kwota tylko przy zgodzie, tylko po starcie, reszta dokładnie jak na produkcji; wycofanie wraca do tej wersji', () => {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const licznik = (s) => { const a = s.indexOf('create or replace function public.akcja_licznik'); return s.slice(a, s.indexOf('end $function$', a) + 14); };
  const poprzedni = norm(licznik(czytaj('supabase/migrations/20261104_akcja_wyprawa.sql')));
  const nowy = licznik(MIG);
  assert.match(nowy, /jsonb_build_object\('nazwa', f\.nazwa, 'link', f\.link, 'logo_url', f\.logo_url,\s+'kwota_gr', case when f\.zgoda_na_kwote then f\.kwota_gr end\) order by f\.dodano, f\.id\)/);
  assert.doesNotMatch(nowy, /to_jsonb\(|row_to_json|f\.\*/, 'żadnego całego wiersza');
  assert.doesNotMatch(bezKom(nowy), /potwierdzenie|f\.dodal/);
  assert.match(nowy, /exception when others then v_firmy := '\[\]'::jsonb;/, 'awaria listy nie psuje licznika');
  const przed = nowy.slice(nowy.indexOf('if a.wystartowala_at is null then'), nowy.indexOf('end if;', nowy.indexOf('if a.wystartowala_at is null then')));
  assert.doesNotMatch(przed, /firmy/, 'gałąź przed startem nie zna firm');
  const usunFirmy = norm(bezKom(nowy)
    .replace(" v_firmy jsonb := '[]'::jsonb;", '')
    .replace(/  begin\n    select coalesce\(jsonb_agg\(jsonb_build_object\('nazwa'[\s\S]*?  end;\n/, '')
    .replace("    'firmy',               v_firmy,\n", ''));
  assert.equal(usunFirmy, norm(bezKom(licznik(czytaj('supabase/migrations/20261104_akcja_wyprawa.sql')))), 'migracja zmienia w liczniku tylko firmy');
  assert.equal(norm(licznik(czytaj('supabase/migrations/20261104_WYCOFANIE_akcja_firmy.sql'))), poprzedni, 'wycofanie = wersja sprzed firm');
  assert.match(MIG, /licznik na bazie zmienił się od 4\.11/, 'migracja odmawia nadpisania nowszej definicji');
});

test('test po skutku istnieje i testuje z rolą, nie z postgresa; migawka dostępu w repo', () => {
  const t = czytaj('tools/akcja-firmy-test.sql');
  assert.match(t, /set local role authenticated/); assert.match(t, /set local role anon/); assert.match(t, /request\.jwt\.claims/);
  assert.match(t, /'user_metadata', json_build_object\('role', 'coach'\)/, 'user_metadata udające trenera');
  assert.match(t, /TESTY FIRM ZIELONE/);
  const sh = czytaj('tools/akcja-firmy-test.sh');
  assert.match(sh, /FIRMY_Z_MIGRACJA/); assert.match(sh, /db query --linked/); assert.doesNotMatch(sh, /db push/);
  const mg = czytaj('supabase/schema/rls/akcja_firmy.txt');
  assert.match(mg, /anon\s+: — brak/); assert.match(mg, /authenticated\s+: DELETE, SELECT/);
  const warunki = mg.match(/(warunek|przy zapisie)\s*: .*/g) || [];
  assert.ok(warunki.length >= 3, 'polityki w migawce'); for (const w of warunki) assert.match(w, /auth_is_coach\(\)/, 'każda polityka wymaga trenera: ' + w);
  assert.match(czytaj('supabase/schema/rls/SUMY.txt'), /  akcja_firmy\n/);
});
