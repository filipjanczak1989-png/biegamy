/* BLIZNA 341 (23.11): strona biegu (bieg.html) i ulica akcji (dla-fabianka.html) — brak dolnego paska i trudny powrót do aplikacji.
   (1) Pasek TYLKO dla zalogowanych: window.NAV.zamontujDlaZalogowanych() z sb.js. Bez sesji: zero zapytań i zero zmian w DOM. Rola jak w races.html
       (trener bez wiersza zawodnika → pasek trenera; konto trener + zawodnik → trenera tylko po wejściu z trener.html). Strona sama nie czyta tabel
       (blizna-235), robi to NAV. Style paska = kopia reguł z theme.css (cały theme.css zmieniłby wygląd strony).
   (2) „‹ Ulica akcji” w bieg.html: reguła jak „← Powrót” w kalendarzu (blizna-339). Z naszej strony → history.back(); z zewnątrz → location.replace
       na Dziś (zalogowany) albo na ulicę akcji (niezalogowany; w próbie dla-fabianka.html?proba=1), bez nowego wpisu. Napis „‹ Ulica akcji” tylko, gdy
       wstecz naprawdę wraca na ulicę (gość z zewnątrz: tak, jak przed zmianą). Decyzja 23.11 wieczór: gość z zewnątrz na ulicę, nie na index.html.
   Ulica nie ma własnego „wstecz” (nie dokładamy go); zalogowany wraca paskiem. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const funkcja = (zrodlo, nazwa) => { const i = zrodlo.indexOf('function ' + nazwa + '('); assert.ok(i >= 0, 'brak ' + nazwa); let g = 0, j = zrodlo.indexOf('{', i);
  for (; j < zrodlo.length; j++) { if (zrodlo[j] === '{') g++; else if (zrodlo[j] === '}' && --g === 0) break; } return zrodlo.slice(i, j + 1); };
const BIEG = czytaj('bieg.html'), ULICA = czytaj('dla-fabianka.html'), THEME = czytaj('theme.css');
const WYWOLANIE = "try { if (window.NAV && typeof window.NAV.zamontujDlaZalogowanych === 'function') Promise.resolve(window.NAV.zamontujDlaZalogowanych()).catch(function () {}); } catch (e) {}";

/* ── NAV.zamontujDlaZalogowanych w atrapie: sesja, tabele i DOM z licznikiem zmian ── */
function przygotuj({ sesja = true, athlete = null, coach = false, referrer = '', bladSesji = false, bezSb = false, juzJest = false, bladTabeli = false } = {}) {
  const ctx = zaladujSb();
  ctx.location = { pathname: '/bieg.html', search: '', href: 'https://biegamy.run/bieg.html', origin: 'https://biegamy.run' };
  const zapytania = [], dodane = [], klasy = new Set();
  ctx.document = {
    referrer,
    getElementById: (id) => ((juzJest && id === 'nav-mount') ? { id } : dodane.find((e) => e.id === id) || null),
    createElement: (tag) => ({ tag, id: '', textContent: '', innerHTML: '' }),
    querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, removeEventListener() {},   // sb.js po załadowaniu sam przegląda dokument
    head: { appendChild: (e) => { dodane.push(e); return e; } },
    body: { appendChild: (e) => { dodane.push(e); return e; }, classList: { add: (c) => klasy.add(c) } },
  };
  ctx.sb = bezSb ? undefined : {
    auth: { getSession: async () => { if (bladSesji) throw new Error('atrapa'); return { data: { session: sesja ? { user: { id: 'u1' } } : null } }; } },
    from: (t) => {
      zapytania.push(t);
      const ch = { select() { return ch; }, eq() { return ch; },
        maybeSingle: async () => (bladTabeli ? { data: null, error: { message: 'x' } } : { data: t === 'athletes' ? (athlete ? { id: athlete } : null) : (coach ? { id: 'u1' } : null), error: null }) };
      return ch;
    },
  };
  return { ctx, NAV: ctx.NAV, zapytania, dodane, klasy };
}
async function zamontuj(opcje) {
  const p = przygotuj(opcje);
  const wynik = await p.NAV.zamontujDlaZalogowanych();
  const pasek = p.dodane.find((e) => e.id === 'nav-mount'), styl = p.dodane.find((e) => e.id === 'nav-css-bez-motywu');
  return { wynik, zapytania: p.zapytania, dodane: p.dodane.length, klasy: [...p.klasy], html: pasek ? pasek.innerHTML : '', styl: styl ? styl.textContent : '', NAV: p.NAV };
}

test('sb.js: NAV.zamontujDlaZalogowanych i rolaKonta; style paska zgodne z theme.css (kopia, nie cały motyw)', () => {
  const { NAV } = przygotuj();
  assert.equal(typeof NAV.zamontujDlaZalogowanych, 'function'); assert.equal(typeof NAV.rolaKonta, 'function');
  const css = NAV._cssBezMotywu, regula = (zr, sel) => { const i = zr.indexOf(sel + '{'); assert.ok(i >= 0, 'brak ' + sel); return zr.slice(i, zr.indexOf('}', i) + 1); };
  for (const sel of ['.bottom-nav', '.nav-it']) assert.equal(regula(css, sel), regula(THEME, sel), sel + ': inna niż w theme.css');
  for (const sel of ['.nav-it svg', '.nav-lbl']) assert.equal(regula(css, sel).replace(/var\(--muted,#8a8798\)/g, 'var(--muted)'), regula(THEME, sel), sel + ': inna niż w theme.css (poza zapasem koloru)');
  assert.match(THEME, /--muted:#8a8798;/, 'zapas koloru = --muted z theme.css');
  assert.ok(css.includes('#nav-mount{ position:relative; z-index:50; }') && THEME.includes('#nav-mount{ position:relative; z-index:50; }'));
  assert.match(css, /body\.z-paskiem main\{padding-bottom:calc\(112px \+ env\(safe-area-inset-bottom, 0px\)\);\}/, 'koniec strony nad paskiem');
  for (const [n, h] of [['bieg.html', BIEG], ['dla-fabianka.html', ULICA]]) {
    assert.doesNotMatch(h, /href="theme\.css"/, n + ': bez całego theme.css');
    assert.doesNotMatch(h, /id="nav-mount"|class="bottom-nav"/, n + ': w HTML nie ma paska (niezalogowany widzi stronę bez zmian)');
  }
});

test('NAV.zamontujDlaZalogowanych: bez sesji zero zapytań i zero zmian; zalogowany — pasek zawodnika albo trenera jak w races.html', async () => {
  for (const [opis, o] of [['bez sesji', { sesja: false }], ['błąd sesji', { bladSesji: true }], ['bez klienta', { bezSb: true }], ['pasek już jest', { juzJest: true, athlete: 'a1' }]]) {
    const r = await zamontuj(o);
    assert.equal(r.wynik, null, opis); assert.deepEqual(r.zapytania, [], opis + ': zero zapytań'); assert.equal(r.dodane, 0, opis + ': zero zmian w DOM'); assert.deepEqual(r.klasy, [], opis);
  }
  let r = await zamontuj({ athlete: 'a1' });
  assert.deepEqual({ ...r.wynik }, { rola: 'athlete', athleteId: 'a1' }); assert.deepEqual(r.zapytania.sort(), ['athletes', 'coaches']);
  assert.match(r.html, /^<nav class="bottom-nav">/); assert.match(r.html, /href="zawodnik\.html"/); assert.match(r.html, /href="profil\.html\?id=a1"/); assert.doesNotMatch(r.html, /trener\.html| active/);
  assert.equal(r.styl, r.NAV._cssBezMotywu); assert.deepEqual(r.klasy, ['z-paskiem']); assert.equal(r.dodane, 2, 'styl + pasek');
  r = await zamontuj({ coach: true });
  assert.equal(r.wynik.rola, 'coach', 'trener bez wiersza zawodnika'); assert.match(r.html, /href="trener\.html"/); assert.doesNotMatch(r.html, /zawodnik\.html/);
  r = await zamontuj({ coach: true, athlete: 'a1', referrer: 'https://biegamy.run/zawodnik.html' });
  assert.deepEqual({ ...r.wynik }, { rola: 'athlete', athleteId: 'a1' }, 'trener + zawodnik z Dziś → pasek zawodnika');
  r = await zamontuj({ coach: true, athlete: 'a1', referrer: 'https://biegamy.run/trener.html' });
  assert.deepEqual({ ...r.wynik }, { rola: 'coach', athleteId: null }, 'trener + zawodnik z panelu trenera → pasek trenera');
  r = await zamontuj({ bladTabeli: true });
  assert.deepEqual({ ...r.wynik }, { rola: 'athlete', athleteId: null }, 'błąd odczytu: pasek zawodnika bez id'); assert.match(r.html, /href="profil\.html"/);
});

test('obie strony wołają pasek po starcie (z zabezpieczeniem); ulica bez własnego „wstecz”', () => {
  assert.ok(BIEG.includes(WYWOLANIE), 'bieg.html woła NAV.zamontujDlaZalogowanych');
  assert.ok(ULICA.includes(WYWOLANIE), 'dla-fabianka.html woła NAV.zamontujDlaZalogowanych');
  const i = ULICA.indexOf(WYWOLANIE);
  assert.ok(i > ULICA.indexOf("document.addEventListener('DOMContentLoaded'") && i < ULICA.indexOf('function dzisWaw()'), 'ulica: wywołanie na starcie obsługi DOMContentLoaded');
  assert.doesNotMatch(ULICA, /history\.back|location\.replace/, 'ulica: bez nowego „wstecz” (zalogowany wraca paskiem)');
  assert.doesNotMatch(BIEG, /\.from\(|createClient\(/, 'bieg.html dalej nie czyta tabel wprost (blizna-235)');
});

/* ── „‹ Ulica akcji” w bieg.html: prawdziwe funkcje ze strony w atrapie ── */
const KOD_WSTECZ = ['zNaszejStrony', 'zHistorii', 'celZZewnatrz', 'napisWstecz', 'wsteczBiegu'].map((n) => funkcja(BIEG, n)).join('\n');
function biegWstecz({ referrer = '', dlugosc = 3, sesja = true, proba = false, href = 'https://biegamy.run/dla-fabianka.html' + (proba ? '?proba=1' : '') } = {}) {
  const zd = [], w = { href, textContent: '‹ Ulica akcji' };
  const ctx = { document: { referrer }, URL, $: () => w, PROBA: proba, pobierzSesje: () => Promise.resolve(sesja ? { user: {} } : null),
    history: { length: dlugosc, back: () => zd.push('back'), pushState: () => zd.push('PUSH') },
    location: { origin: 'https://biegamy.run', href: 'https://biegamy.run/bieg.html', replace: (u) => zd.push('replace:' + u), assign: (u) => zd.push('ASSIGN:' + u) } };
  vm.runInNewContext(KOD_WSTECZ + '\nnapisWstecz(); wsteczBiegu({ preventDefault() {} });', ctx);
  return new Promise((ok) => setImmediate(() => ok({ zd: zd.join(','), napis: w.textContent })));
}

test('bieg.html „‹ Ulica akcji”: z naszej strony back, z zewnątrz replace (zalogowany → Dziś, gość → ulica); napis tylko, gdy wraca na ulicę', async () => {
  assert.match(BIEG, /<a class="bw-wroc" id="bw-wroc" href="dla-fabianka\.html">‹ Ulica akcji<\/a>/, 'HTML bez zmian (blizna-283, 288)');
  assert.ok(BIEG.includes("napisWstecz(); $('bw-wroc').addEventListener('click', wsteczBiegu);"), 'obsługa kliknięcia podpięta');
  assert.doesNotMatch(KOD_WSTECZ, /index\.html/, 'gość z zewnątrz nie ląduje na stronie startowej (decyzja 23.11 wieczór)');
  const P = 'https://biegamy.run/';
  assert.deepEqual(await biegWstecz({ referrer: P + 'dla-fabianka.html' }), { zd: 'back', napis: '‹ Ulica akcji' }, 'z ulicy: wraca na ulicę');
  assert.deepEqual(await biegWstecz({ referrer: P + 'dla-fabianka.html?proba=1', proba: true }), { zd: 'back', napis: '‹ Ulica akcji' }, 'z ulicy próbnej');
  assert.deepEqual(await biegWstecz({ referrer: P + 'zawodnik.html' }), { zd: 'back', napis: '‹ Wstecz' }, 'z Dziś (kafel, Okienko): wraca na Dziś');
  assert.deepEqual(await biegWstecz({ referrer: '', dlugosc: 1, sesja: true }), { zd: 'replace:zawodnik.html', napis: '‹ Wstecz' }, 'z zewnątrz, zalogowany → Dziś');
  assert.deepEqual(await biegWstecz({ referrer: '', dlugosc: 1, sesja: false }), { zd: 'replace:dla-fabianka.html', napis: '‹ Ulica akcji' }, 'z zewnątrz, gość → ulica, napis jak dotąd');
  assert.deepEqual(await biegWstecz({ referrer: '', dlugosc: 1, sesja: false, proba: true }), { zd: 'replace:dla-fabianka.html?proba=1', napis: '‹ Ulica akcji' }, 'próba: gość → ulica próbna');
  assert.deepEqual(await biegWstecz({ referrer: '', dlugosc: 1, sesja: true, proba: true }), { zd: 'replace:zawodnik.html', napis: '‹ Wstecz' }, 'próba: zalogowany → Dziś');
  assert.deepEqual(await biegWstecz({ referrer: 'https://l.facebook.com/x', dlugosc: 3, sesja: false }), { zd: 'replace:dla-fabianka.html', napis: '‹ Ulica akcji' }, 'link z Facebooka, gość');
  assert.deepEqual(await biegWstecz({ referrer: 'https://l.facebook.com/x', dlugosc: 3, sesja: true }), { zd: 'replace:zawodnik.html', napis: '‹ Wstecz' }, 'link z Facebooka, zalogowany');
  assert.deepEqual(await biegWstecz({ referrer: P + 'dla-fabianka.html', dlugosc: 1, sesja: false }), { zd: 'replace:dla-fabianka.html', napis: '‹ Ulica akcji' }, 'nowa karta bez historii → zastąp');
  assert.deepEqual(await biegWstecz({ referrer: P + 'zawodnik.html', dlugosc: 1, sesja: true }), { zd: 'replace:zawodnik.html', napis: '‹ Wstecz' }, 'nowa karta z Dziś → zastąp na Dziś');
  assert.deepEqual(await biegWstecz({ referrer: 'nie-adres', dlugosc: 3 }), { zd: 'replace:zawodnik.html', napis: '‹ Wstecz' }, 'zepsuty referrer = z zewnątrz');
});

test('ulica ↔ bieg bez rosnącej historii: Dziś → ulica → bieg → „‹ Ulica akcji” → wstecz w telefonie → Dziś', async () => {
  const stos = ['zawodnik.html', 'dla-fabianka.html', 'bieg.html']; let i = 2;
  for (let n = 0; n < 3; n++) {   // trzy razy w tę i z powrotem: „Zapisz się na bieg ›” (link) i „‹ Ulica akcji”
    const { zd } = await biegWstecz({ referrer: 'https://biegamy.run/' + stos[i - 1], dlugosc: stos.length });
    assert.equal(zd, 'back'); i--;
    stos.splice(i + 1); stos.push('bieg.html'); i++;
  }
  assert.deepEqual(stos, ['zawodnik.html', 'dla-fabianka.html', 'bieg.html'], 'historia stoi w miejscu (dawniej każde „‹ Ulica akcji” dopisywało ulicę)');
});
