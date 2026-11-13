/* BLIZNA 240 / MOTYW SEZONU (Filip 13.11): jedno ustawienie (daty + ręczne nadpisanie w js/sezon.mjs) zmienia scenerię ulicy, Miasta, gry i plakatu.
   Grafiki motywu leżą w assets/sezony/<sezon>/<katalog>/<ta sama nazwa> i mają te same wymiary co jesienne (kod zna położenie szyldów, tablic i kotwic w pikselach).
   Jesień zostaje domyślna do przełączenia przez Filipa. Gra zimą: Mikołaj na saniach to skóra Kasi, więc zasady liczenia cegieł i rankingu się nie zmieniają:
   przy tym samym ziarnie runda kończy się tym samym wynikiem w obu motywach. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const KAT_ZIMY = path.join(KORZEN, 'assets/sezony/zima');

function sezon(search) {
  const c = vm.createContext({ URLSearchParams, location: { search: search || '' } });
  c.globalThis = c; vm.runInContext(czytaj('js/sezon.mjs'), c);
  return c.BM_SEZON;
}
/* Wymiary WebP z nagłówka (VP8 / VP8L / VP8X), bez bibliotek. */
function wymiaryWebp(plik) {
  const b = fs.readFileSync(plik), typ = b.toString('ascii', 12, 16);
  if (typ === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (typ === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (typ === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  throw new Error('nie WebP: ' + plik);
}

test('manifest plików zimy = zawartość katalogu, każdy plik z jesiennym odpowiednikiem ma jego wymiary co do piksela', () => {
  const S = sezon(''), w = [];
  for (const k of fs.readdirSync(KAT_ZIMY)) for (const f of fs.readdirSync(path.join(KAT_ZIMY, k))) w.push(k + '/' + f);
  assert.deepEqual(Array.from(S.PLIKI.zima).sort(), w.sort(), 'manifest PLIKI.zima a katalog assets/sezony/zima');
  const bezOdpowiednika = ['gra/mikolaj.webp', 'gra/mikolaj_karta.webp'];
  for (const p of S.PLIKI.zima) {
    if (bezOdpowiednika.includes(p)) continue;
    assert.ok(fs.existsSync(path.join(KORZEN, 'assets', p)), 'brak jesiennego ' + p);
    assert.deepEqual(wymiaryWebp(path.join(KAT_ZIMY, p)), wymiaryWebp(path.join(KORZEN, 'assets', p)), 'wymiary ' + p);
  }
  for (const p of bezOdpowiednika) assert.deepEqual(wymiaryWebp(path.join(KAT_ZIMY, p)), [1800, 240], p + ': 6 klatek 300 × 240');
});

test('adres(): jesień bez zmian, zima tylko dla plików z manifestu, z zachowaniem ?v= i prefiksu', () => {
  const S = sezon('');
  assert.equal(S.adres('assets/ulica/drzewo.webp', 'jesien'), 'assets/ulica/drzewo.webp');
  assert.equal(S.adres('assets/ulica/drzewo.webp', 'zima'), 'assets/sezony/zima/ulica/drzewo.webp');
  assert.equal(S.adres('assets/gra/kask.webp?v=5', 'zima'), 'assets/sezony/zima/gra/kask.webp?v=5');
  assert.equal(S.adres('./assets/miasto/tlo-mapy.webp', 'zima'), './assets/sezony/zima/miasto/tlo-mapy.webp');
  assert.equal(S.adres('assets/ulica/koparka.webp', 'zima'), 'assets/ulica/koparka.webp', 'maszyny bez wersji zimowej');
  assert.equal(S.adres('assets/gra/cegla.webp', 'zima'), 'assets/gra/cegla.webp', 'cegła ta sama (liczenie bez zmian)');
  assert.equal(S.adres('https://example.com/assets/ulica/drzewo.webp', 'zima'), 'https://example.com/assets/ulica/drzewo.webp');
});

test('wybór sezonu: ?sezon= → ręczne nadpisanie → daty (zakres przez Nowy Rok) → jesień; dziś jesień do przełączenia', () => {
  const S = sezon('');
  assert.equal(S.WYMUSZONY, 'jesien', 'jesień do przełączenia przez Filipa (zmiana tej linii = świadoma decyzja, popraw też test)');
  assert.equal(S.aktywny(new Date(2026, 11, 24)), 'jesien', 'nadpisanie wygrywa z datą');
  assert.equal(sezon('?sezon=zima').aktywny(), 'zima', 'podgląd ?sezon=zima');
  assert.equal(sezon('?sezon=lato').aktywny(), 'jesien', 'nieznany sezon w adresie nic nie zmienia');
  for (const [d, oczek] of [[new Date(2026, 10, 30), null], [new Date(2026, 11, 1), 'zima'], [new Date(2026, 11, 31), 'zima'], [new Date(2027, 0, 6), 'zima'], [new Date(2027, 0, 7), null]]) {
    assert.equal(S.zDaty(d), oczek, d.toDateString());
  }
});

test('kolory łąki: jesień bez zmian, zima z tabeli; paleta jesieni = dzisiejsze wartości z kodu', () => {
  const S = sezon('');
  const css = '.bs-laka{background:linear-gradient(#86ad55,#5f8a3a)}';
  assert.equal(S.kolory(css, 'jesien'), css);
  assert.equal(S.kolory(css, 'zima'), '.bs-laka{background:linear-gradient(#e3edf6,#c3d5e6)}');
  assert.equal(S.kolory('#ABCDEF', 'zima'), '#ABCDEF', 'obcy kolor bez zmian');
  const scena = czytaj('js/ulica-scena.mjs');
  assert.ok(scena.includes(S.paleta('jesien').laka), 'łąka jesieni jak w ulica-scena.mjs');
  assert.ok(scena.includes(S.paleta('jesien').grunt), 'grunt jesieni jak w ulica-scena.mjs');
});

/* Prawdziwy silnik gry w Node (jak blizna-197/238), opcjonalnie z js/sezon.mjs i ?sezon=zima. */
const ATLAS = czytaj('assets/gra/atlas.json');
function losowanie(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function element() {
  const nic = () => {}, gradient = { addColorStop: nic }, k = { measureText: (t) => ({ width: String(t).length * 8 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient, getImageData: () => ({ data: new Uint8ClampedArray(4) }) };
  ['save', 'restore', 'scale', 'setTransform', 'drawImage', 'fillRect', 'strokeRect', 'beginPath', 'closePath', 'ellipse', 'arc', 'rect', 'roundRect', 'moveTo', 'lineTo', 'quadraticCurveTo', 'fill', 'stroke', 'clip', 'fillText', 'strokeText', 'translate', 'rotate', 'setLineDash'].forEach((n) => { k[n] = nic; });
  return { hidden: false, textContent: '', value: '', checked: false, style: { setProperty() {} }, dataset: {}, children: [], width: 100, height: 100, addEventListener() {}, removeEventListener() {}, setAttribute() {}, prepend() {}, select() {}, click() {}, classList: { toggle() {}, add() {} }, querySelector() { return element(); }, querySelectorAll() { return []; }, getContext() { return k; } };
}
async function runda(zima, ziarno) {
  const raf = [], el = {}, los = { f: losowanie(ziarno) };
  class Obraz { constructor() { this.width = this.height = this.naturalWidth = this.naturalHeight = 100; this.complete = true; } set src(v) { this._s = v; Promise.resolve().then(() => this.onload && this.onload()); } get src() { return this._s; } }
  const c = vm.constants && vm.constants.DONT_CONTEXTIFY ? vm.createContext(vm.constants.DONT_CONTEXTIFY) : vm.createContext({});
  Object.assign(c, {
    URLSearchParams, Intl, console, setTimeout: () => 0, clearTimeout() {}, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
    location: { search: '?test=1&pora=dzien&poziom_gry=7' + (zima ? '&sezon=zima' : ''), hostname: 'localhost', href: 'http://localhost/gra-cegielki.html' },
    navigator: {}, performance: { now: () => 0 }, matchMedia: () => ({ matches: false }), addEventListener() {},
    localStorage: { d: {}, getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = String(v); } },
    requestAnimationFrame: (f) => raf.push(f), cancelAnimationFrame() {}, Image: Obraz, __los: los,
    document: { getElementById: (id) => el[id] || (el[id] = element()), createElement: () => element(), querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    fetch: async (u) => { if (/atlas\.json/.test(u)) return { ok: true, json: async () => JSON.parse(ATLAS) }; throw new Error('bez sieci'); },
  });
  c.window = c;
  vm.runInContext('Math.random = function () { return __los.f(); };', c);
  if (zima) vm.runInContext(czytaj('js/sezon.mjs'), c);
  vm.runInContext(czytaj('js/cegielki-logika.mjs'), c); vm.runInContext(czytaj('js/cegielki.js'), c);
  const pompuj = async () => { for (const f of raf.splice(0)) { if (f.name !== 'petla') f(0); } await new Promise((r) => setImmediate(r)); };
  for (let i = 0; i < 200 && !c.__gra; i++) await pompuj();
  los.f = losowanie(ziarno);   // ten sam ciąg losowania od startu rundy w obu motywach
  c.BM_CEGIELKI_GRA.start(zima ? 'mikolaj' : 'kasia');
  let maly = false;
  for (let i = 0; i < 400; i++) { await pompuj(); const g = c.__gra(); if (g.maly) maly = true; else if (maly && g.t === 0) break; }
  const G = c.__gra();
  los.f = losowanie(ziarno * 31 + 7);
  /* Bot: skok przed każdą przeszkodą w zasięgu (deterministycznie), upadki liczą się jak zawsze. */
  for (let k = 0; k < 9000 && !G.st.koniec; k++) {   // 60 s plus bidony
    const blisko = G.przeszkody.some((p) => !p.zuzyta && p.x - G.s > 40 && p.x - G.s < 120);
    if (blisko && G.naZiemi && G.reakcja <= 0) { G.naZiemi = false; G.vy = c.BM_CEGIELKI.FIZYKA.SKOK; G.y = 0.01; }
    c.__krok(1 / 60);
  }
  return { postac: G.postac, skora: G.skora || null, cegly: G.cegly, punkty: c.BM_CEGIELKI.punktyRundy(G.cegly, G.poziom), st: JSON.stringify(G.st), koniec: !!G.st.koniec };
}

test('gra zimą: Mikołaj na saniach to skóra Kasi; ten sam wynik rundy co jesienią przy tym samym ziarnie (cegły, punkty, statystyki)', async () => {
  for (const ziarno of [3, 11, 29]) {
    const j = await runda(false, ziarno), z = await runda(true, ziarno);
    assert.equal(j.postac, 'kasia'); assert.equal(z.postac, 'kasia', 'zimą zapis i zasady jak Kasia');
    assert.equal(j.skora, null); assert.equal(z.skora, 'mikolaj');
    assert.ok(j.koniec && z.koniec, 'obie rundy skończone');
    assert.ok(j.cegly > 0, 'bot coś zebrał');
    assert.equal(z.cegly, j.cegly, 'ziarno ' + ziarno + ': cegły');
    assert.equal(z.punkty, j.punkty, 'ziarno ' + ziarno + ': punkty');
    assert.equal(z.st, j.st, 'ziarno ' + ziarno + ': statystyki rundy');
  }
});

test('podpięcie: ścieżki ulicy, sceny, Miasta i gry przez sezon; strony Miasta i gry ładują js/sezon.mjs; ulica przez zUlica', () => {
  assert.match(czytaj('js/ulica.mjs'), /function sciezkaObrazu\(nazwa\) \{ var p = KATALOG \+ nazwa \+ "\.webp"; return g\.BM_SEZON \? g\.BM_SEZON\.adres\(p\) : p; \}/);
  assert.match(czytaj('js/akcja.mjs'), /zSezonem\(function \(\) \{/);
  for (const m of ['js/miasto-bieg.mjs', 'js/miasto-druzyny.mjs', 'js/miasto-firmy.mjs']) assert.match(czytaj(m), /function adres\(src\) \{ var s = g\.BM_SEZON \? g\.BM_SEZON\.adres\(src\) : src;/, m);
  for (const h of ['miasto.html', 'miasto-bieg.html', 'miasto-druzyny.html', 'miasto-firmy.html', 'gra-cegielki.html']) assert.ok(czytaj(h).includes('<script src="js/sezon.mjs" data-strona></script>'), h);
  const gra = czytaj('js/cegielki.js');
  assert.match(gra, /i\.src = plikGry\(KAT \+ A\[n\]\.src\) \+ "\?v=" \+ WERSJA;/);
  assert.match(gra, /if \(postac === "mikolaj"\) postac = "kasia";/);
  for (const z of ['index.html', 'zawodnik.html', 'sw.js']) assert.ok(!czytaj(z).includes('sezon.mjs'), z + ' zamrożony: bez zmian');
  assert.doesNotMatch(czytaj('js/sezon.mjs'), /fetch\(|XMLHttpRequest|sendBeacon|supabase|localStorage|document\.cookie/, 'motyw niczego nie wysyła ani nie zapisuje');
});

/* 14.11: podstrony Miasta biorą grafiki przez zasob() (Cache API → blob:), a podmiana <img> nie umie przemapować adresu blob:.
   Bez motywu w zasob() zimą plakaty (obrazek → zasob), obrazki z data-src i lista gotowości pokazu zostawały jesienne. */
function kontekstMotywu(search) {
  const c = vm.createContext({ URLSearchParams, location: { search }, Promise });
  c.globalThis = c; c.window = c; vm.runInContext(czytaj('js/sezon.mjs'), c);
  return c;
}
test('Miasto zimą: zasob() i zrodlo() trzech podstron idą przez motyw (plakaty, data-src, sceny); jesienią adresy bez zmian', async () => {
  const PLIK = 'assets/ulica/domek-3.webp';
  for (const h of ['miasto-bieg.html', 'miasto-druzyny.html', 'miasto-firmy.html']) {
    const html = czytaj(h), i = html.indexOf('  function sezonu(u)'), j = html.indexOf('  function zrodlo(url)', i), k = html.indexOf('\n', j);
    assert.ok(i > 0 && j > i, h + ': sezonu(), zasob() i zrodlo() obok siebie');
    for (const [search, oczek] of [['?sezon=zima', 'assets/sezony/zima/ulica/domek-3.webp'], ['', PLIK]]) {
      const c = kontekstMotywu(search), pobrane = [];
      c.URL = { createObjectURL: (b) => 'blob:' + b.u };
      c.fetch = async (u) => { pobrane.push(u); return { ok: true, clone() { return this; }, blob: async () => ({ u }) }; };
      vm.runInContext('var adresy = {}, zapytane = {};\n' + html.slice(i, k) + '\nthis.zasob = zasob; this.zrodlo = zrodlo;', c);
      const s = search ? 'zima' : 'jesień';
      assert.equal(await c.zasob(PLIK), 'blob:' + oczek, h + ' ' + s + ': zasob');
      assert.deepEqual(pobrane, [oczek], h + ' ' + s + ': pobrany plik');
      assert.equal(c.zrodlo(PLIK), 'blob:' + oczek, h + ' ' + s + ': zrodlo() trafia w ten sam blob (sceny modułów)');
      assert.equal(await c.zasob(PLIK), 'blob:' + oczek, h + ' ' + s + ': drugi raz bez sieci');
      assert.equal(pobrane.length, 1, h + ' ' + s + ': każdy plik z sieci raz');
    }
  }
});
test('tekst na łące czytelny w obu motywach (stopka podziękowania firmy); karta „Mój wkład” rysuje ulicę w motywie', () => {
  const lum = (h) => { const k = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2]; };
  const kontrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const S = sezon('');
  assert.equal(S.paleta('jesien').tekstNaLace, '#fff7e6', 'jesień: ta sama stała co dotąd w stopce');
  for (const s of ['jesien', 'zima']) {
    const tlo = S.kolory('#86ad55', s), k = kontrast(S.paleta(s).tekstNaLace, tlo);
    assert.ok(s === 'jesien' || k >= 4.5, s + ': kontrast stopki ' + k.toFixed(2) + ' na ' + tlo);
  }
  assert.ok(kontrast('#fff7e6', S.kolory('#86ad55', 'zima')) < 1.5, 'zima: dawny jasny tekst na śniegu był nieczytelny (dlatego zmiana)');
  const firmy = czytaj('js/miasto-firmy.mjs');
  assert.match(firmy, /function TL\(\) \{ return g\.BM_SEZON \? g\.BM_SEZON\.paleta\(\)\.tekstNaLace : "#fff7e6"; \}/);
  assert.match(firmy, /c\.fillStyle = TL\(\); \["Wpłaty idą wyłącznie przez organizację prowadzącą zbiórkę\."/);
  assert.match(firmy, /c\.fillStyle = TL\(\); c\.font = "600 28px " \+ FONT_TEKST; c\.fillText\("BiegaMy"/);
  assert.match(firmy, /c\.fillStyle = K\("#86ad55"\); c\.fillRect\(0, H \* 0\.58/, 'łąka pod stopką przez motyw');
  const karta = czytaj('js/akcja-wklad-karta.mjs');
  assert.match(karta, /im\.src = g\.BM_SEZON \? g\.BM_SEZON\.adres\(src\) : src;/, 'karta: grafiki ulicy przez motyw');
  assert.match(karta, /c\.fillStyle = g\.BM_SEZON \? g\.BM_SEZON\.kolory\("#86ad55"\) : "#86ad55";/, 'karta: łąka przez motyw');
  assert.doesNotMatch(karta, /c\.fillStyle = "#86ad55"/);
});
test('Miasto zimą: lista gotowości pokazu = lista jesienna przez motyw (te same pozycje, pliki zimy w miejscu jesiennych)', async () => {
  const lista = async (search) => {
    const c = kontekstMotywu(search);
    c.fetch = async (u) => { const p = path.join(KORZEN, String(u).split('?')[0]); return fs.existsSync(p) ? { ok: true, text: async () => fs.readFileSync(p, 'utf8') } : { ok: false, text: async () => '' }; };
    vm.runInContext(czytaj('js/miasto-pokaz.mjs'), c);
    return Array.from(await c.BM_POKAZ.listaPlikow());
  };
  const jesien = await lista(''), zima = await lista('?sezon=zima'), S = sezon('?sezon=zima');
  assert.ok(jesien.length > 40 && jesien.includes('assets/ulica/domek-1.webp'), 'jesień: lista jak dotąd');
  assert.deepEqual(jesien.filter((u) => u.includes('assets/sezony/')), [], 'jesienią żadnego pliku motywu (literały assets/… w skryptach trafiają na listę)');
  assert.deepEqual(zima, jesien.map((u) => S.adres(u)));
  const zimowe = zima.filter((u) => u.startsWith('assets/sezony/zima/'));
  assert.ok(zimowe.length >= 20 && zimowe.every((u) => fs.existsSync(path.join(KORZEN, u))), 'zimą pliki motywu, każdy istnieje (' + zimowe.length + ')');
});
