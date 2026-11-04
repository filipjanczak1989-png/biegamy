/* BLIZNA 151 (4.11.2026, Filip: „ulica, która rośnie”, wersja 2D na bogato) — js/ulica.mjs, js/ulica-scena.mjs, punkty wpięcia, grafiki.
   Pilnuje:
   - progi odcinków z licznika: 100 km = 1 odcinek, cap 125; null i śmieci = stan bezpieczny bez liczb;
   - przed startem ani jednej liczby akcji, licznika, świętowania, dźwięku ani udostępniania, także gdy licznik przez pomyłkę coś odda;
   - moduły nie znają pól podróży z licznika (sekret celu) ani imienia, nazwiska, słów chorobowych: imię tylko z bazy (akcja_licznik.imie);
   - pora dnia z prawdziwej godziny w Polsce, także w czasie letnim; świętowanie tylko wzrostu, tysiąc przed odcinkiem;
   - domek deterministyczny, napis nigdy pod odbiciem, szyld zmniejsza, zawija, ucina; szyldy.json = stała w kodzie;
   - grafiki: dokładne nazwy i lekkie pliki, każda warstwa ze spadkiem na kształt;
   - tekst z bazy tylko przez textContent: atrapa DOM rzuca przy innerHTML;
   - wydajność jako zasada: animacje tylko transform i opacity, jeden rAF, pula cząstek, pauza, reduced-motion, touch-action: pan-y;
   - dźwięk tylko z WebAudio i po geście, stan głośnika w try/catch; bez plików dźwiękowych;
   - karty (Dziś, Okienko) dostają nieruchomą miniaturę, scena tylko na stronie akcji; zamrożone pliki nic o ulicy nie wiedzą; awaria sceny = miniatura.
   Migracje pilnuje blizna-151-ulica-migracje: idzie w jednym commicie z nimi, bo sam tekst SQL w teście zatrzymuje bramkę commita. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { CHOROBA, fold } = require('./_red-team.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const istnieje = (p) => fs.existsSync(path.join(KORZEN, p));
const bezKomentarzy = (k) => k.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

/* Atrapa DOM: tyle, ile moduły używają; innerHTML rzuca, więc każda próba wstawienia surowego tekstu kończy test. */
class Wezel {
  constructor(tag) { this.tag = tag; this.atr = {}; this.dzieci = []; this.rodzic = null; this._tekst = ''; this.isConnected = true; this.clientWidth = 390; this.offsetWidth = 390; this.style = { setProperty() {} }; this.sl = {}; this.hidden = false; }
  setAttribute(k, v) { this.atr[k] = String(v); }
  getAttribute(k) { return k in this.atr ? this.atr[k] : null; }
  appendChild(n) { n.rodzic = this; this.dzieci.push(n); return n; }
  insertBefore(n, ref) { n.rodzic = this; this.dzieci.splice(this.dzieci.indexOf(ref), 0, n); return n; }
  removeChild(n) { this.dzieci.splice(this.dzieci.indexOf(n), 1); n.rodzic = null; return n; }
  get firstChild() { return this.dzieci[0] || null; }
  get parentNode() { return this.rodzic; }
  set textContent(v) { this.dzieci = []; this._tekst = String(v); }
  get textContent() { return this._tekst + this.dzieci.map((d) => d.textContent).join(''); }
  set innerHTML(v) { throw new Error('innerHTML w module ulicy: ' + v); }
  get classList() {
    const n = this, k = () => (n.atr.class || '').split(/\s+/).filter(Boolean);
    return { add: (c) => { n.atr.class = [...new Set([...k(), c])].join(' '); }, remove: (c) => { n.atr.class = k().filter((x) => x !== c).join(' '); }, contains: (c) => k().includes(c), toggle: (c, w) => { n.atr.class = (w ? [...new Set([...k(), c])] : k().filter((x) => x !== c)).join(' '); } };
  }
  addEventListener(t, f) { (this.sl[t] = this.sl[t] || []).push(f); }
  removeEventListener() {}
  getContext() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 340 }; }
  querySelector() { return null; }
  wszystkie(acc = []) { acc.push(this); for (const d of this.dzieci) d.wszystkie(acc); return acc; }
}
function atrapaDokumentu() {
  const head = new Wezel('head');
  return { head, body: new Wezel('body'), hidden: false, createElement: (t) => new Wezel(t), createElementNS: (ns, t) => new Wezel(t), getElementById: (id) => head.wszystkie().find((n) => n.atr.id === id) || null, addEventListener() {}, removeEventListener() {} };
}
/* Świeże moduły na każdy tryb grafik: pamięć sprawdzonych plików jest per strona. */
let nrImportu = 0;
async function modul(pliki) {
  const dostepne = new Set(pliki || []);
  globalThis.document = atrapaDokumentu();
  globalThis.matchMedia = () => ({ matches: true });   // reduced-motion: w Node bez pętli i zegarów rAF
  globalThis.addEventListener = globalThis.addEventListener || (() => {});
  globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
  globalThis.Image = class { set src(u) { const n = u.replace(/^.*\//, '').replace(/\.webp$/, ''); queueMicrotask(() => { if (dostepne.has(n)) { this.naturalWidth = 64; this.onload && this.onload(); } else this.onerror && this.onerror(); }); } };
  delete globalThis.BM_ULICA_SCENA;
  await import(pathToFileURL(path.join(KORZEN, 'js/moderacja.mjs')).href);
  await import(pathToFileURL(path.join(KORZEN, 'js/ulica.mjs')).href + '?n=' + (++nrImportu));
  return globalThis.BM_ULICA;
}
async function modulSceny(pliki) {
  const U = await modul(pliki);
  await import(pathToFileURL(path.join(KORZEN, 'js/ulica-scena.mjs')).href + '?n=' + (++nrImportu));
  return { U, S: globalThis.BM_ULICA_SCENA };
}
const spij = () => new Promise((r) => setTimeout(r, 5));
const TRWA = { wystartowala: true, suma_km: 3000, cel_km: 12500, imie: 'Atrapa', nazwa: 'Nazwa z bazy' };
const zamontowane = [];
const zamontuj = (S, k, d, o) => { const c = S.zamontuj(k, d, o); if (c) zamontowane.push(c); return c; };
test.afterEach(() => { while (zamontowane.length) zamontowane.pop().zniszcz(); });

test('progi odcinków: 0, 99,9, 100, 3000, 12 500 i cap 125', async () => {
  const U = await modul();
  const n = (km) => U.stanUlicy({ wystartowala: true, suma_km: km });
  assert.deepEqual([0, 99.9, 100, 199.99, 3000, 12499.99].map((k) => n(k).odcinki), [0, 0, 1, 1, 30, 124]);
  assert.equal(n(0).faza, 'trwa', '0 km po starcie to budowa, nie plac');
  assert.deepEqual([n(12500).faza, n(12500).odcinki], ['pelna', 125]);
  assert.deepEqual([n(99999).faza, n(99999).odcinki], ['pelna', 125], 'powyżej celu cap 125');
  assert.equal(n('3000').odcinki, 30, 'liczba jako tekst z bazy');
  assert.equal(U.ODCINKOW * U.KM_NA_ODCINEK, 12500);
  assert.deepEqual([3000, 3043.4, 99.9, 0].map(U.doNastepnego), [100, 57, 1, 100], 'także 1 km zmienia coś na ekranie');
});

test('null, błąd i śmieci = stan bezpieczny bez liczb; przed startem też bez liczb', async () => {
  const U = await modul();
  for (const d of [null, undefined, 0, 'x', {}, { wystartowala: 'tak', suma_km: 500 }, { wystartowala: true }, { wystartowala: true, suma_km: null }, { wystartowala: true, suma_km: 'abc' },
    { wystartowala: true, suma_km: -5 }, { wystartowala: true, suma_km: Infinity }, { wystartowala: true, suma_km: true }, { wystartowala: true, suma_km: '' }]) {
    assert.deepEqual(U.stanUlicy(d), { faza: 'brak' }, JSON.stringify(d));
  }
  assert.deepEqual(U.stanUlicy({ wystartowala: false }), { faza: 'przed' });
  assert.deepEqual(U.stanUlicy({ wystartowala: false, suma_km: 4321, cel_km: 12500 }), { faza: 'przed' }, 'przed startem stan nie zna liczb, nawet gdy licznik je odda');
  const k = new Wezel('div');
  assert.equal(U.zamontuj(k, null), false);
  assert.equal(k.dzieci.length, 0, 'błąd = pusty kontener, bez nagłówka');
  assert.equal(U.zamontuj(null, TRWA), false, 'brak kontenera nie rzuca');
});

test('pora dnia: prawdziwa godzina w Polsce, także czas letni', async () => {
  const U = await modul();
  const p = (s) => U.poraDnia(new Date(s));
  assert.equal(p('2026-11-07T06:30:00+01:00'), 'swit', 'sobota 7.11, świt');
  assert.equal(p('2026-11-07T13:00:00+01:00'), 'dzien');
  assert.equal(p('2026-11-07T16:30:00+01:00'), 'zmierzch');
  assert.equal(p('2026-11-07T22:00:00+01:00'), 'noc');
  assert.equal(p('2026-06-21T04:00:00+02:00'), 'swit', 'czas letni');
  assert.equal(p('2026-06-21T13:00:00+02:00'), 'dzien');
  assert.equal(p('2026-06-21T21:30:00+02:00'), 'zmierzch');
  assert.equal(p('2026-06-21T23:30:00+02:00'), 'noc');
  assert.equal(p('2026-11-07T05:30:00Z'), 'swit', 'liczy po strefie Polski, nie po strefie urządzenia');
  const z = U.wschodZachod(new Date('2026-11-07T12:00:00+01:00'));
  assert.ok(z.wschod > 6.5 * 60 && z.wschod < 7.5 * 60 && z.zachod > 15.5 * 60 && z.zachod < 16.5 * 60, 'wschód i zachód 7.11 w rozsądnym przedziale');
  assert.deepEqual(Object.keys(U.KOLORY_NIEBA).sort(), ['dzien', 'noc', 'swit', 'zmierzch']);
  assert.match(czytaj('js/ulica.mjs'), /timeZone: "Europe\/Warsaw"/);
});

test('świętowanie: tylko wzrost, tysiąc ma pierwszeństwo przed odcinkiem', async () => {
  const U = await modul();
  assert.equal(U.coSwietowac(3000, 3000), 'nic');
  assert.equal(U.coSwietowac(3000, 3099), 'nic');
  assert.equal(U.coSwietowac(3099, 3100), 'odcinek');
  assert.equal(U.coSwietowac(3990, 4100), 'tysiac', 'tysiąc i odcinek naraz');
  assert.equal(U.coSwietowac(4100, 3990), 'nic', 'spadek licznika');
  assert.equal(U.coSwietowac(12500, 14100), 'nic', 'powyżej celu cap');
  const sc = czytaj('js/ulica-scena.mjs');
  assert.match(sc, /" km razem!"/);
  assert.match(sc, /function aktualizuj\(d\)/);
  assert.match(sc, /var rodzaj = U\.coSwietowac\(stare\.km, nowy\.km\);/, 'świętuje tylko aktualizacja w trakcie oglądania');
  const start = sc.slice(sc.indexOf('/* start */'));
  assert.doesNotMatch(start.slice(0, start.indexOf('function zniszcz')), /swietuj\(/, 'po wejściu na stronę bez zaległych świętowań');
});

test('domek deterministyczny 1–7 z odbiciem; deska zamienia strony, napis poza odbitym obrazem; szyldy.json = stała', async () => {
  const U = await modul();
  assert.deepEqual(U.domekDla('Auto Serwis Nowak'), U.domekDla('Auto Serwis Nowak'));
  const nazwy = new Set(), odbicia = new Set();
  for (let i = 0; i < 300; i++) { const d = U.domekDla('Firma ' + i); assert.match(d.nazwa, /^domek-[1-7]$/); nazwy.add(d.nazwa); odbicia.add(d.lustro); }
  assert.equal(nazwy.size, 7, 'wszystkie 7 w użyciu'); assert.equal(odbicia.size, 2);
  assert.deepEqual(U.szyldNaDomku([0.3, 0.36, 0.4, 0.1], false), [0.3, 0.36, 0.4, 0.1]);
  assert.deepEqual(U.szyldNaDomku([0.2, 0.36, 0.4, 0.1], true), [0.4, 0.36, 0.4, 0.1]);
  assert.deepEqual(U.SZYLDY, JSON.parse(czytaj('assets/ulica/szyldy.json')), 'stała w kodzie zgodna z narzędziem');
  const sc = bezKomentarzy(czytaj('js/ulica-scena.mjs'));
  assert.match(sc, /var oprawa = el\("div", "us-cz" \+ \(m\.wyb\.lustro \? " us-lustro" : ""\), b\);/, 'odbicie tylko na oprawie obrazu');
  assert.match(sc, /sz = el\("div", "us-szyld", b\)/, 'szyld jest dzieckiem przycisku, poza oprawą');
  assert.match(sc, /el\("span", "", sz, l\)/, 'linie szyldu przez textContent');
});

test('szyld: krótki w całości, długi mniejszy, potem dwie linie, na końcu wielokropek', async () => {
  const U = await modul();
  const mierz = (t, r) => Array.from(t).length * r * 0.55;
  const a = U.dopasujSzyld('Apteka', 64, 17, mierz);
  assert.deepEqual(a.linie, ['Apteka']); assert.ok(a.rozmiar >= 12);
  const b = U.dopasujSzyld('Piekarnia Sobieskiego', 64, 40, mierz, { maks: 13, min: 7 });
  assert.ok(b.linie.length === 2 && b.linie.join(' ') === 'Piekarnia Sobieskiego', 'dwie linie, nic nie ginie');
  const c = U.dopasujSzyld('Kawiarnia Pod Dębem i Spółka z ograniczoną odpowiedzialnością', 64, 15, mierz, { maks: 13, min: 7 });
  assert.equal(c.linie.length, 1); assert.ok(c.linie[0].endsWith('…'));
  assert.ok(mierz(c.linie[0], c.rozmiar) <= 64, 'mieści się w desce');
  const d = U.dopasujSzyld('Bardzodlugajednaslowowanazwa', 64, 15, mierz, { maks: 13, min: 7 });
  assert.ok(d.linie[0].endsWith('…') && mierz(d.linie[0], d.rozmiar) <= 64);
  const e = U.dopasujSzyld('Bieg-Sport', 64, 17, mierz, { maks: 13, min: 7 });
  assert.ok(e.rozmiar < 13 && e.linie[0] === 'Bieg-Sport', 'najpierw zmniejsza');
});

test('grafiki: dokładne nazwy, WebP, lekkie; bez starych PNG', async () => {
  const U = await modul();
  assert.deepEqual(U.WARSTWY, ['droga', 'koparka', 'walec', 'dzwig', 'budowniczy', 'domek-1', 'domek-2', 'domek-3', 'domek-4', 'domek-5', 'domek-6', 'domek-7', 'mur', 'plac-zabaw', 'latarnia', 'drzewo', 'plac-budowy']);
  let razem = 0;
  for (const n of U.WARSTWY) {
    assert.equal(U.sciezkaObrazu(n), 'assets/ulica/' + n + '.webp', 'względem strony');
    const st = fs.statSync(path.join(KORZEN, 'assets/ulica', n + '.webp'));
    assert.ok(st.size < 60 * 1024, n + ' ponad 60 KB'); razem += st.size;
    assert.equal(fs.readFileSync(path.join(KORZEN, 'assets/ulica', n + '.webp')).subarray(8, 12).toString(), 'WEBP');
  }
  assert.ok(razem < 450 * 1024, 'wszystkie razem ' + razem);
  assert.doesNotMatch(czytaj('js/ulica.mjs') + czytaj('js/ulica-scena.mjs'), /\.png\b/);
  const narzedzie = czytaj('tools/ulica-grafiki.py');
  assert.match(narzedzie, /"droga": \("h", 72\)/, 'ROZMIARY: 2 x wyświetlanie w scenie');
  const sc = czytaj('js/ulica-scena.mjs');
  assert.match(sc, /DROGA_H = 72/); assert.match(sc, /KAFEL_DROGI = 242/);
});

test('miniatura: przed startem bez cyfr i niezależna od pól licznika; po starcie maszyny, link do pełnej ulicy; każda warstwa ze spadkiem', async () => {
  const U = await modul([]);
  globalThis.BM_AKCJA = { dopelniacz: (s) => s + 'a', km: (x) => String(x) };
  const a = new Wezel('div'), b = new Wezel('div');
  assert.equal(U.zamontuj(a, { wystartowala: false, start: '2026-11-07', cel_km: 12500, suma_km: null }), true);
  assert.equal(U.zamontuj(b, { wystartowala: false, suma_km: 4321, cel_km: 999, imie: 'Atrapa', firmy: [{ nazwa: 'Firma' }], ulica: { imiona: ['Ola'], odblokowane: ['park'], bez_imienia: 3 } }), true);
  const zrzut = (w) => JSON.stringify(w.wszystkie().map((n) => [n.tag, n.atr, n._tekst]));
  assert.equal(zrzut(a), zrzut(b), 'przed startem rysunek nie zależy od tego, co odda licznik');
  const teksty = a.wszystkie().flatMap((n) => [n._tekst, n.atr['aria-label'], n.atr.title].filter(Boolean)).join(' ');
  assert.match(teksty, /Wkrótce budowa/); assert.doesNotMatch(teksty, /\d/);
  const k = new Wezel('div');
  assert.equal(U.zamontuj(k, TRWA), true);
  const wezly = k.wszystkie();
  const korzen = k.dzieci[0];
  assert.equal(korzen.tag, 'a'); assert.equal(korzen.atr.href, 'dla-fabianka.html', 'link do pełnej ulicy');
  assert.match(k.textContent, /Ulica Atrapaa/);
  assert.match(k.textContent, /30 ze 125 odcinków · do następnego 100 km · 1 odcinek = 100 km/);
  assert.match(k.textContent, /Zobacz ulicę/);
  assert.match(wezly.find((n) => n.atr.role === 'img').atr['aria-label'], /30 ze 125 odcinków.*koparka, walec i dźwig.*żółtym kasku/);
  await spij();
  assert.equal(k.wszystkie().filter((n) => n.tag === 'img').length, 0, 'bez plików ani jednego obrazka');
  assert.equal(k.wszystkie().filter((n) => n.atr.class === 'um-ksztalt').length, 3, 'walec, koparka, budowniczy jako kształty');
  const U2 = await modul(['koparka', 'droga']);
  const cz = new Wezel('div');
  U2.zamontuj(cz, TRWA); await spij();
  assert.deepEqual(cz.wszystkie().filter((n) => n.tag === 'img').map((n) => n.atr.src), ['assets/ulica/koparka.webp'], 'tylko plik, który jest');
  assert.equal(cz.wszystkie().filter((n) => n.atr.class === 'um-ksztalt').length, 2);
  const p = new Wezel('div');
  U2.zamontuj(p, { wystartowala: true, suma_km: 12500 });
  assert.ok(p.wszystkie().some((n) => n.atr.class === 'um-tablica' && n._tekst === 'Gotowa ulica'), 'karta Okienka nie zna imienia: tekst bez niego');
  assert.doesNotMatch(czytaj('js/ulica.mjs').split('/* ── STRONA AKCJI')[0], /requestAnimationFrame|setInterval|setTimeout|AudioContext|@keyframes/, 'miniatura bez pętli, zegarów, dźwięku i animacji');
  delete globalThis.BM_AKCJA;
});

test('scena przed startem: plac z tablicą; bez liczb, licznika, głośnika, udostępniania; niezależna od pól licznika', async () => {
  const { S } = await modulSceny();
  const a = new Wezel('div'), b = new Wezel('div');
  assert.ok(zamontuj(S, a, { wystartowala: false, start: '2026-11-07', cel_km: 12500, suma_km: null }));
  assert.ok(zamontuj(S, b, { wystartowala: false, suma_km: 4321, imie: 'Atrapa', firmy: [{ nazwa: 'Firma' }], ulica: { imiona: ['Ola'], bez_imienia: 2, odblokowane: ['park'] } }));
  const zrzut = (w) => JSON.stringify(w.wszystkie().map((n) => [n.tag, n.atr, n._tekst]));
  assert.equal(zrzut(a), zrzut(b));
  const wezly = a.wszystkie(), klasy = wezly.map((n) => n.atr.class || '').join(' ');
  for (const brak of ['us-licznik', 'us-udostepnij', 'us-glosnik', 'us-koparka', 'us-walec', 'us-dzwig', 'us-budowniczy', 'us-baner', 'us-opis']) assert.ok(!klasy.includes(brak), brak);
  const teksty = wezly.flatMap((n) => [n._tekst, n.atr['aria-label'], n.atr.title].filter(Boolean)).join(' ');
  assert.match(teksty, /Wkrótce/); assert.doesNotMatch(teksty, /\d/);
  assert.ok(wezly.some((n) => n.atr.src === 'assets/ulica/plac-budowy.webp'));
  assert.equal(wezly.filter((n) => n.atr.src === 'assets/ulica/latarnia.webp').length, 0);
});

test('scena po starcie: maszyny jako przyciski, tekst z bazy przez textContent, kwota z licznika nigdzie; link firmy tylko https', async () => {
  const { U, S } = await modulSceny();
  globalThis.safeExternalHref = (u, o) => (/^https:\/\//.test(u) ? u : '');
  const wroga = '<img src=x onerror="alert(1)">Piekarnia', wrogie = '<script>alert(1)</script>';
  const k = new Wezel('div');
  const kon = zamontuj(S, k, { ...TRWA, firmy: [{ nazwa: wroga, link: 'https://firma.example.pl' }, { nazwa: '   ' }, null, { nazwa: 7 }, { nazwa: 'Bez linku', link: 'javascript:alert(1)' }], ulica: { imiona: [wrogie, 5, 'Ola'], odblokowane: ['park', 'plac_zabaw', 'latarnie', 'zlosliwe'], bez_imienia: 2, kwota_zl: 987654321, progi: { park: 1 } } });
  assert.ok(kon, 'scena wstała');
  const wezly = k.wszystkie();
  for (const m of ['koparka', 'walec', 'dzwig', 'budowniczy']) {
    const b = wezly.find((n) => (n.atr.class || '').split(' ').includes('us-' + m));
    assert.equal(b.tag, 'button', m); assert.equal(b.atr['data-u'], m); assert.ok(b.atr['aria-label'], m);
  }
  assert.equal(wezly.filter((n) => n.atr.src === 'x' || n.tag === 'script').length, 0);
  assert.equal(wezly.filter((n) => (n.atr.class || '').includes('us-domek')).length, 2, 'puste i nietekstowe nazwy bez domku');
  const szyld = wezly.find((n) => n.atr.class === 'us-szyld');
  assert.ok(szyld.textContent.startsWith('<'), 'surowy tekst na desce');
  const cegly = wezly.filter((n) => (n.atr.class || '').includes('us-cegla'));
  assert.equal(cegly.length, 4, 'dwie imienne (po filtrze) + dwie bez imienia');
  assert.equal(cegly.filter((c) => c.tag === 'button').length, 2, 'przycisk tylko dla imiennej');
  assert.equal(cegly.find((c) => c.tag === 'button')._tekst, wrogie, 'imię surowym tekstem');
  const zapis = JSON.stringify(wezly.map((n) => [n.atr, n._tekst]));
  assert.doesNotMatch(zapis, /987654321|zlosliwe/, 'kwota i nieznany element nie wchodzą');
  assert.equal(U.linkFirmy('https://firma.example.pl/a'), 'https://firma.example.pl/a');
  assert.equal(U.linkFirmy('javascript:alert(1)'), '');
  assert.equal(U.linkFirmy('http://firma.example.pl'), '', 'tylko https');
  assert.equal(U.linkFirmy(''), '');
  assert.deepEqual(U.dodatkiBezpieczne({ odblokowane: ['park', 'x'], imiona: ['Ola', 3], bez_imienia: -4, kwota_zl: 5 }), { odblokowane: ['park'], imiona: ['Ola'], bez_imienia: 0 });
  assert.deepEqual(U.dodatkiBezpieczne(null), { odblokowane: [], imiona: [], bez_imienia: 0 }, 'brak migracji = sama droga');
  const teraz = new Wezel('div'), bez = zamontuj(S, teraz, TRWA);
  assert.ok(bez, 'bez firm i cegiełek scena wstaje');
  assert.equal(teraz.wszystkie().filter((n) => (n.atr.class || '').includes('us-cegla') || (n.atr.class || '').includes('us-domek')).length, 0);
  assert.match(teraz.textContent, /30 ze 125 odcinków/);
  assert.match(teraz.textContent, /Udostępnij ulicę/);
  delete globalThis.safeExternalHref;
});

test('Mur graczy: osobno od kilometrów, tylko przy włączonej grze, pusta suma bez tabliczki', async () => {
  await import(pathToFileURL(path.join(KORZEN, 'js/ulica.mjs')).href + '?mur');
  const U = globalThis.BM_ULICA;
  assert.equal(U.tekstMuru(0), ''); assert.equal(U.tekstMuru(null), ''); assert.equal(U.tekstMuru('śmieć'), ''); assert.equal(U.tekstMuru(-5), '');
  assert.equal(U.tekstMuru(1), 'Mur graczy: 1 cegła');
  assert.equal(U.tekstMuru(3), 'Mur graczy: 3 cegły');
  assert.equal(U.tekstMuru(12), 'Mur graczy: 12 cegieł');
  assert.doesNotMatch(U.tekstMuru(48210), /km/);
  assert.equal(U.tekstMuru(48210, 12500000), 'Mur graczy: ' + (48210).toLocaleString('pl-PL') + ' z ' + (12500000).toLocaleString('pl-PL') + ' cegieł');
  assert.equal(U.procentMuru(0, 100), 0); assert.equal(U.procentMuru(1, 12500000), 1, 'każda cegła widoczna'); assert.equal(U.procentMuru(50, 100), 50); assert.equal(U.procentMuru(500, 100), 100);
  globalThis.BM_AKCJA = { dopelniacz: (s) => s && s.slice(0, -2) + 'ka' };
  assert.equal(U.zdanieOZbiorce({ imie: 'Marek' }), 'Cegiełki w grze to zabawa, nie pieniądze. Wpłacić na Marka możesz tylko na zbiórce');
  delete globalThis.BM_AKCJA;
  assert.doesNotMatch(U.zdanieOZbiorce({}), /(?<!\p{L})zł(?!\p{L})|\d/u, 'bez kwot i przeliczników');
  const sc = bezKomentarzy(czytaj('js/ulica-scena.mjs'));
  assert.match(sc, /!przed && g\.SB_URL && g\.fetch/);
  assert.match(sc, /d\.aktywna !== true/);
  assert.match(sc, /d\.rowerzysta === true && ruch/, 'rowerzysta tylko po włączeniu przełącznika');
});

test('kod scen: bez surowego HTML, bez JS w atrybutach, bez bibliotek; sekret, imię, choroba; pułapka na pola podróży', async () => {
  for (const plik of ['js/ulica.mjs', 'js/ulica-scena.mjs']) {
    const kod = czytaj(plik), czysty = bezKomentarzy(kod);
    assert.doesNotMatch(czysty, /innerHTML|insertAdjacentHTML|document\.write|outerHTML/, plik);
    assert.doesNotMatch(czysty, /\bon[a-z]+="|javascript:/i, plik + ': JS w atrybutach');
    assert.doesNotMatch(kod, /wyprawa/i, plik + ': ani w kodzie, ani w komentarzach');
    assert.doesNotMatch(kod.replace(/dla-fabianka(\.html)?/g, ''), /fabian/i, plik + ': imię tylko z bazy');
    assert.doesNotMatch(fold(kod), CHOROBA, plik + ': słowa chorobowe');
    assert.doesNotMatch(kod, /jasn[aąeęy]*\s*g[oó]r|cz[eę]stochow/i, plik);
    assert.doesNotMatch(czysty, /^\s*(import|export)\s|https?:\/\/(?!www\.w3\.org)/m, plik + ': bez import/export i obcych adresów');
  }
  const { S, U } = await modulSceny();
  const pulapka = new Proxy({ ...TRWA, wyprawa_cel_nazwa: 'SEKRET', wyprawa_cel_km: 777, wyprawa_km: 12, wyprawa_trwa: true }, { get(t, k) { if (typeof k === 'string' && /^wyprawa/.test(k)) throw new Error('moduł czyta ' + k); return t[k]; }, ownKeys() { throw new Error('moduł wylicza pola licznika'); } });
  assert.equal(U.stanUlicy(pulapka).odcinki, 30);
  const a = new Wezel('div'), b = new Wezel('div');
  assert.equal(U.zamontuj(a, pulapka), true, 'pułapka w miniaturze');
  assert.ok(zamontuj(S, b, pulapka), 'pułapka w scenie');
  assert.doesNotMatch(a.textContent + b.textContent, /SEKRET|777/);
  assert.equal(istnieje('supabase/functions/akcja-ulica'), false, 'dane idą przez akcja_licznik i istniejącą EF, bez nowego publicznego wejścia');
  assert.doesNotMatch(czytaj('supabase/config.toml'), /akcja-ulica/);
});

test('wydajność jako zasada: tylko transform i opacity, jeden rAF, pula cząstek, pauza, reduced-motion, pan-y, licznik co 30 s', () => {
  const kod = czytaj('js/ulica-scena.mjs'), czysty = bezKomentarzy(kod);
  const klatki = [...czysty.matchAll(/@keyframes [\w-]+\{((?:[^{}]*\{[^{}]*\})+)\}/g)];
  assert.ok(klatki.length >= 10, 'liczba animacji ' + klatki.length);
  for (const m of klatki) {
    for (const blok of m[1].matchAll(/\{([^{}]*)\}/g)) for (const dekl of blok[1].split(';').filter(Boolean)) assert.match(dekl.trim(), /^(transform|opacity):/, 'animacja rusza coś poza transform i opacity: ' + dekl);
  }
  assert.equal((czysty.match(/requestAnimationFrame\(/g) || []).length, 2, 'jedna pętla: popchnij i jej kontynuacja');
  assert.match(czysty, /var MAX_CZASTEK = 110/);
  assert.match(czysty, /Math\.min\(1\.5, g\.devicePixelRatio \|\| 1\)/, 'canvas cząstek z limitem gęstości');
  assert.match(czysty, /new g\.IntersectionObserver/); assert.match(czysty, /"visibilitychange"/);
  assert.match(czysty, /function aktywna\(\) \{ return ruch && naEkranie && kartaWidoczna && !zniszczona; \}/);
  assert.match(czysty, /@media \(prefers-reduced-motion:reduce\)\{\.us \*\{animation:none !important;transition:none !important\}/);
  assert.match(czysty, /touch-action:pan-y/);
  assert.match(czysty, /if \(g\.document\.hidden \|\| !g\.BM_AKCJA/, 'licznik tylko przy widocznej karcie');
  assert.match(czysty, /\}, 300000 \+ Math\.random\(\) \* 60000\);/, 'licznik co 5 min z rozrzutem, nie co 30 s: ruch z mediów'); assert.match(czysty, /\}, 60000\);/, 'pora co minutę');
  assert.match(czysty, /pobierzPubliczny\("dla-fabianka", \{ wymus: true \}\)/, 'przez EF akcja-licznik i jej pamięć');
  assert.doesNotMatch(czysty, /transition:(?:left|top|width|height|margin)/);
  assert.doesNotMatch(czysty, /[{;]filter:|mix-blend-mode|backdrop-filter/, 'bez kosztownych efektów');
});

test('dźwięk: tylko WebAudio, po geście, domyślnie wyciszony; stan głośnika w try/catch; bez plików i z zapisem w docs', () => {
  const czysty = bezKomentarzy(czytaj('js/ulica-scena.mjs'));
  assert.equal((czysty.match(/new K\(\)/g) || []).length, 1, 'jeden kontekst');
  assert.match(czysty, /function czytajDzwiek\(\) \{ try \{ return g\.localStorage\.getItem\(KLUCZ_DZWIEKU\) === "1"; \} catch \(e\) \{ return false; \} \}/, 'domyślnie wyciszone');
  assert.match(czysty, /function zapiszDzwiek\(v\) \{ try \{/);
  assert.match(czysty, /function graj\(n\) \{ if \(glosno\) dzwiek\.graj\(n\); \}/);
  assert.doesNotMatch(czysty, /new (g\.)?Audio\(|\.mp3|\.ogg|\.wav/, 'żadnych plików');
  assert.match(czytaj('docs/akcja-f-ulica.md'), /generowane w kodzie/);
});

test('udostępnianie: canvas z własnych grafik, navigator.share z plikiem, zapasowo pobranie; przed startem nie ma przycisku', () => {
  const czysty = bezKomentarzy(czytaj('js/ulica-scena.mjs'));
  const f = czysty.slice(czysty.indexOf('async function obrazek()'), czysty.indexOf('async function udostepnij()'));
  assert.match(f, /wczytaj/);
  assert.match(czysty, /im\.src = U\.sciezkaObrazu\(n\);/, 'tylko grafiki z tego samego źródła');
  assert.doesNotMatch(f, /crossOrigin|logo_url|plakat|wizerunek/, 'bez obcych obrazków i wizerunku');
  assert.match(f, /dane\.nazwa \|\| "BiegaMy"/, 'nazwa akcji z bazy');
  assert.match(czysty, /nav\.canShare && nav\.canShare\(\{ files: \[plik\] \}\)/);
  assert.match(czysty, /a\.setAttribute\("download", nazwa\)/);
  assert.match(czysty, /if \(!przed\) \{\s+podpowiedz/, 'przycisk tylko po starcie');
});

test('punkty wpięcia: małe, karta dostaje licznik z tej samej drogi; scena tylko na stronie akcji; zamrożone pliki bez zmian', async () => {
  const f = czytaj('dla-fabianka.html');
  assert.match(f, /<div id="ulica-przed"><\/div>/);
  assert.match(f, /<div id="ulica-po"><\/div>/);
  assert.match(f, /function ulica\(d\) \{ try \{ A\.zUlica\(function \(U\) \{ U\.naStronie\(d, \{ przed: \$\('ulica-przed'\), po: \$\('ulica-po'\), pokaz: pokaz \}\); \}\); \} catch \(e\) \{\} \}/);
  assert.doesNotMatch(f, /<script src="js\/ulica/, 'bez <script>: brak pliku nie może nic zablokować');
  assert.match(f, /A\.pobierzPubliczny\('dla-fabianka'\)/, 'ta sama droga licznika co dotąd');
  const a = czytaj('js/akcja.mjs');
  assert.equal((a.match(/punktUlicy\(d\) \+/g) || []).length, 2, 'karta trwa i karta po zamknięciu');
  assert.match(a, /el\.src = "js\/ulica\.mjs"/);
  assert.match(a, /el\.onerror = function \(\) \{ _ulicaCzeka = null; \};/, 'brak pliku = cisza');
  assert.doesNotMatch(a, /ulica-scena/, 'karty nie ciągną pełnej sceny');
  assert.match(czytaj('js/okienko.js'), /window\.BM_AKCJA\.punktUlicy\(\{ wystartowala: true, suma_km: d\.suma_km, cel_km: d\.cel_km, imie: window\._akcjaStan && window\._akcjaStan\.imie \}, \{ kompakt: true \}\)/);
  const t = czytaj('trener.html');
  assert.match(t, /<div id="ulica-panel"><\/div>/);
  assert.match(t, /window\.BM_ULICA\.panelTrenera\(document\.getElementById\('ulica-panel'\), window\.sb\)/);
  assert.doesNotMatch(t, /ulica-scena/);
  for (const p of ['zawodnik.html', 'index.html', 'sw.js']) assert.doesNotMatch(czytaj(p), /ulica\.mjs|ulica-scena|BM_ULICA/, p + ' zamrożony do 8.11');
  /* w Node (i w EF okienko) brak dokumentu: karta bez kontenera, reszta bez zmian */
  delete globalThis.document;
  globalThis.escapeHtml = (s) => String(s);
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href + '?n=' + (++nrImportu));
  const A = globalThis.BM_AKCJA;
  assert.equal(A.punktUlicy({ wystartowala: true, suma_km: 100 }), '');
  assert.equal(A.punktUlicy(null), '');
  assert.doesNotThrow(() => A.zUlica(() => { throw new Error('nie woła'); }));
  assert.ok(A.kartaDzisHtml({ wystartowala: true, nazwa: 'N', suma_km: 100, cel_km: 12500, pct: 1 }, null).includes('akcja-karta'));
  globalThis.document = atrapaDokumentu();
  assert.equal(A.punktUlicy({ wystartowala: false }), '', 'przed startem karta nie istnieje, więc punkt też');
  delete globalThis.document;
  delete globalThis.BM_AKCJA;
});

test('naStronie: scena w kontenerze widocznej części strony; awaria sceny i brak pliku = miniatura; błąd licznika = pusto', async () => {
  const U = await modul();
  globalThis.location = { search: '' };
  const przed = new Wezel('div'), po = new Wezel('div');
  const wolania = [];
  globalThis.BM_ULICA_SCENA = { zamontuj(k, d, o) { wolania.push([k === po ? 'po' : 'przed', d.suma_km, o.proba]); return { aktualizuj(x) { wolania.push(['aktualizuj', x.suma_km]); }, zniszcz() { wolania.push(['zniszcz']); } }; } };
  await U.naStronie({ wystartowala: false }, { przed, po });
  assert.deepEqual(wolania.pop(), ['przed', undefined, false], 'zapowiedź: kontener zapowiedzi');
  await U.naStronie(TRWA, { przed, po });
  assert.deepEqual(wolania.slice(-2), [['zniszcz'], ['po', 3000, false]], 'start: scena zapowiedzi znika, wstaje nowa');
  await U.naStronie({ ...TRWA, suma_km: 3100 }, { przed, po });
  assert.deepEqual(wolania.pop(), ['aktualizuj', 3100], 'kolejny licznik idzie do aktualizuj, bez przebudowy');
  /* scena rzuca: miniatura */
  const k2 = { przed: new Wezel('div'), po: new Wezel('div') };
  globalThis.BM_ULICA_SCENA = { zamontuj() { throw new Error('awaria'); } };
  await U.naStronie(TRWA, k2);
  assert.equal(k2.po.dzieci[0].atr.class, 'um um--ramka', 'awaria sceny: miniatura bez linku do samej siebie');
  assert.equal(k2.po.style.minHeight, '', 'bez pustego miejsca');
  /* brak pliku sceny: miniatura */
  const U2 = await modul();
  const k3 = { przed: new Wezel('div'), po: new Wezel('div') };
  const wynik = U2.naStronie(TRWA, k3);
  assert.equal(k3.po.style.minHeight, '340px', 'miejsce na scenę od razu');
  const skrypt = globalThis.document.head.wszystkie().find((n) => n.tag === 'script');
  assert.equal(skrypt.src, 'js/ulica-scena.mjs');
  skrypt.onerror(new Error('404'));
  await wynik;
  assert.equal(k3.po.dzieci[0].atr.class, 'um um--ramka');
  /* ?proba=1: tylko konto testowe */
  const kod = czytaj('js/ulica.mjs');
  assert.match(kod, /new URLSearchParams\(g\.location\.search\)\.get\("proba"\) === "1"/);
  assert.match(kod, /g\.BM_AKCJA_CYTATY\.slugDla\(at\.data\.id\) === "proba";[\s\S]{0,420}else if \(!testowe\) \{ _idProby = null; return null; \}/);
  assert.match(kod, /g\.BM_AKCJA_CYTATY\.odswiezStan\(g\.sb, _idProby, \{ wymus: true \}\)/);
  globalThis.location = { search: '?proba=1' };
  globalThis.sb = { auth: { getSession: async () => ({ data: { session: null } }) } };
  const U3 = await modul();
  const k4 = { przed: new Wezel('div'), po: new Wezel('div') }, w4 = [];
  globalThis.BM_ULICA_SCENA = { zamontuj(k, d, o) { w4.push(o.proba); return { aktualizuj() {}, zniszcz() {} }; } };
  await U3.naStronie(TRWA, k4);
  assert.deepEqual(w4, [false], 'wylogowany z parametrem: prawdziwa akcja');
  delete globalThis.sb; delete globalThis.location; delete globalThis.BM_ULICA_SCENA;
});

test('panel trenera: kwota i cel bez wartości domyślnych, progi 25/50/100 % celu, cegiełka bez nazwiska, łącznik dozwolony, zgoda tylko jawna', async () => {
  const U = await modul();
  assert.deepEqual(U.kwotaICelDoZapisu({ kwota: '12 500,50', cel: '50000' }), { wiersz: { kwota_zl: 12500.5, cel_zl: 50000 } });
  assert.deepEqual(U.kwotaICelDoZapisu({}), { wiersz: { kwota_zl: null, cel_zl: null } }, 'wszystko puste: nic nie zmyślamy');
  assert.ok(U.kwotaICelDoZapisu({ kwota: 'dużo' }).blad);
  assert.ok(U.kwotaICelDoZapisu({ cel: '0' }).blad);
  assert.ok(U.kwotaICelDoZapisu({ cel: '-5' }).blad);
  assert.deepEqual(JSON.parse(JSON.stringify(U.PROCENT_PROGU)), { latarnie: 25, plac_zabaw: 50, park: 100 });
  for (const [kwota_zl, oczek] of [[2499.99, []], [2500, ['latarnie']], [4999.99, ['latarnie']], [5000, ['latarnie', 'plac_zabaw']], [9999.99, ['latarnie', 'plac_zabaw']], [10000, ['latarnie', 'plac_zabaw', 'park']], [12000, ['latarnie', 'plac_zabaw', 'park']]]) assert.deepEqual(U.odblokowane({ kwota_zl, cel_zl: 10000 }), oczek, String(kwota_zl));
  assert.deepEqual(U.odblokowane({ kwota_zl: null, cel_zl: 1 }), [], 'bez kwoty nic');
  assert.deepEqual(U.odblokowane({ kwota_zl: 5, cel_zl: null }), [], 'bez celu nic');
  assert.equal(U.odblokowane({ kwota_zl: 0.07, cel_zl: 0.28 }).length, 1, 'równy próg na groszach, bez błędu ułamków');
  assert.deepEqual(U.cegielkaDoZapisu({ imie: ' Żaneta ', potwierdzenie: true }), { wiersz: { imie: 'Żaneta', zgoda: false, potwierdzenie_widziane: true } }, 'zgoda domyślnie nie');
  assert.equal(U.cegielkaDoZapisu({ imie: 'Ola', zgoda: true, potwierdzenie: true }).wiersz.zgoda, true);
  for (const zle of ['Kurwa', 'Tusk', 'K0rwa'.replace('0', 'u'), 'Admin']) assert.match(U.cegielkaDoZapisu({ imie: zle, potwierdzenie: true }).blad, /Filtr|niedozwolone/, zle);
  const bylo = globalThis.BM_MODERACJA; delete globalThis.BM_MODERACJA;
  assert.match(U.cegielkaDoZapisu({ imie: 'Ola', potwierdzenie: true }).blad, /Filtr imion/, 'bez filtra nie zapisujemy');
  globalThis.BM_MODERACJA = bylo;
  assert.equal(U.cegielkaDoZapisu({ imie: 'Anna-Maria', potwierdzenie: true }).wiersz.imie, 'Anna-Maria', 'łącznik dozwolony (Filip 4.11)');
  for (const zle of ['Jan Kowalski', '-Anna', 'Anna-', 'Anna--Maria', 'Anna-Maria-Ola', 'A', '<b>x</b>', 'Ola1', 'Bardzodlugieimieponadlimit', 'Annamaria-Bardzodlugieimie', '']) assert.ok(U.cegielkaDoZapisu({ imie: zle, potwierdzenie: true }).blad, zle);
  assert.ok(U.cegielkaDoZapisu({ imie: 'Ola', zgoda: true }).blad, 'bez potwierdzenia wpłaty');
  globalThis.safeExternalHref = (u) => u;
  assert.equal(U.linkFirmy('https://firma.pl/x'), 'https://firma.pl/x');
  for (const zly of ['https://zly.example@a.pl/', 'https://a:b@a.pl/', 'http://firma.pl', 'javascript:alert(1)', '', null]) assert.equal(U.linkFirmy(zly), '', String(zly));
  delete globalThis.safeExternalHref;
  assert.equal(U.panelTrenera(null, {}), false);
  assert.equal(U.panelTrenera(new Wezel('div'), null), false);
});
