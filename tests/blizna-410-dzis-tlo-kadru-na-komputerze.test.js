// Blizna #410 (27.11.2026, P1c) — nowe Dziś na komputerze: kolumna 420 px na jednolitym ciemnym tle.
//
// Od 900 px za kolumną leży kadr dnia z nagłówka: TEN SAM plik (currentSrc obrazka w nagłówku, więc bez nowego pobrania; pomiar na prawdziwej
// stronie 1366×768: jeden plik kadru przed i po), cała szerokość, cover, blur(40px) brightness(0.35), winieta do czerni przy brzegach, kolumna
// z lekkim cieniem. Poniżej 900 px bez zmian. Ograniczona przezroczystość: bez zdjęcia; ograniczony ruch: bez przenikania. Tylko na sekcji Dziś.
// Element #dn-tlo stoi w body: position fixed, z-index −1. <html> ma własne tło (zawodnik.html), więc tło body (kolumna) maluje się nad nim.
// Panorama na później: pole „szeroki” w kadry.json (szósty element KADRY) = osobny plik tylko do tła na komputerze; gdy się nie wczyta, tło z nagłówka.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { strona, MODUL, czytaj } = require('./_dzis-nowy-strona.js');

const HTML = czytaj('zawodnik.html');
const KADRY_JSON = JSON.parse(czytaj('assets/ui/dzis/kadry/kadry.json'));
const ADRES = 'https://biegamy.run/assets/ui/dzis/kadry/';
/** Strona z obrazkiem nagłówka w podanym stanie i prawdziwym URL; elementy tworzone przez moduł mają hidden, setAttribute i style. */
function zKadrem({ wczytany = true, src = ADRES + 'zima-sciezka-1280.webp', online = true, szeroko = false } = {}) {
  const s = strona({ online }), sluch = {};
  s.w.URL = URL; s.w.location.href = 'https://biegamy.run/zawodnik.html';
  s.w.matchMedia = (q) => ({ matches: szeroko && q === '(min-width:900px)' });
  s.d.createElement = () => ({ id: '', hidden: false, className: '', style: {}, _a: {}, parentNode: null, setAttribute(k, v) { this._a[k] = String(v); } });
  const img = s.korzen.querySelector('header .dn-kadr-o');
  Object.assign(img, { complete: wczytany, naturalWidth: wczytany ? 1280 : 0, currentSrc: wczytany ? src : '', src: ADRES + 'zima-sciezka-960.webp', addEventListener(n, f) { (sluch[n] = sluch[n] || []).push(f); } });
  s.img = img; s.sluch = sluch; s.tlo = () => s.el['dn-tlo'] || null;
  return s;
}
const css = () => { const s = strona(); let t = ''; s.d.head.appendChild = (x) => { t += x.textContent; }; s.d.createElement = () => ({}); s.B.start(); return t; };

test('(1) zdjęcie nagłówka wczytane: #dn-tlo w body z TYM SAMYM adresem (currentSrc), schowane atrybutem, klasa „jest”', () => {
  const s = zKadrem(); s.B.start();
  const t = s.tlo();
  assert.ok(t, 'element tła w body');
  assert.equal(t.className, 'jest');
  assert.equal(t.hidden, true, 'poniżej 900 px schowany atrybutem; od 900 px odsłania go reguła CSS');
  assert.equal(t._a['aria-hidden'], 'true');
  assert.equal(t.style.backgroundImage, 'url("' + ADRES + 'zima-sciezka-1280.webp")', 'ten sam plik co w nagłówku: żadnego drugiego pobrania');
});

test('(2) zdjęcie jeszcze się wczytuje: tło dopiero po zdarzeniu load, z adresu, który przeglądarka wybrała', () => {
  const s = zKadrem({ wczytany: false }); s.B.start();
  assert.equal(s.tlo(), null, 'przed wczytaniem nic');
  assert.equal((s.sluch.load || []).length, 1);
  Object.assign(s.img, { complete: true, naturalWidth: 960, currentSrc: ADRES + 'zima-sciezka-960.webp' });
  s.sluch.load[0]();
  assert.equal(s.tlo().style.backgroundImage, 'url("' + ADRES + 'zima-sciezka-960.webp")');
});

test('(3) bez zdjęcia w nagłówku (bez sieci) tła nie ma; adres spoza katalogu kadrów albo nie-http = bez tła', () => {
  const s = zKadrem({ online: false }); s.B.start();
  assert.equal(s.tlo(), null);
  for (const zly of ['javascript:alert(1)', 'data:image/webp;base64,AAAA', 'https://example.test/inny/plik.webp']) {
    const z = zKadrem({ src: zly }); z.B.start();
    assert.equal(z.tlo(), null, String(zly));
  }
});

test('(4) adresTla: tylko http(s) z katalogu kadrów; znaki, które łamią url() w CSS, zakodowane', () => {
  const s = zKadrem(); const A = s.B.adresTla;
  assert.equal(A(ADRES + 'zima-sciezka-1280.webp'), ADRES + 'zima-sciezka-1280.webp');
  assert.equal(A('assets/ui/dzis/kadry/zima-x-960.webp'), ADRES + 'zima-x-960.webp', 'ścieżka względna od strony');
  assert.equal(A(ADRES + "a'b\"c(d)e\\f.webp"), ADRES + 'a%27b%22c(d)e/f.webp'.replace('(', '%28').replace(')', '%29'));
  assert.doesNotMatch(A(ADRES + "a'b\"c(d).webp"), /['"()]/);
  for (const zly of ['javascript:alert(1)', 'data:image/webp;base64,AAAA', 'https://example.test/x.webp', 'ftp://biegamy.run/assets/ui/dzis/kadry/a.webp']) assert.equal(A(zly), '', zly);
});

test('(5) panorama „szeroki”: na komputerze osobny plik, po wczytaniu; błąd pliku = tło z nagłówka; na telefonie panoramy nie pobieramy', () => {
  const obrazy = [];
  const zPanorama = (o, wynik) => {
    const s = zKadrem(o), K = s.B.KADRY, stare = K.map((k) => k.slice());
    K.forEach((k) => { k[5] = 'zima-panorama'; });
    s.w.Image = function () { obrazy.push(this); const ja = this; setImmediate(() => { if (wynik === 'ok') { ja.currentSrc = ADRES + 'zima-panorama.webp'; ja.onload(); } else ja.onerror(); }); };
    try { s.B.start(); } finally { K.forEach((k, i) => { k.length = 0; stare[i].forEach((x) => k.push(x)); }); }
    return s;
  };
  const tel = zPanorama({ szeroko: false }, 'ok');
  assert.equal(obrazy.length, 0, 'telefon: bez panoramy');
  assert.match(tel.tlo().style.backgroundImage, /zima-sciezka-1280\.webp/);
  const ok = zPanorama({ szeroko: true }, 'ok');
  assert.equal(obrazy.length, 1); assert.equal(obrazy[0].src, 'assets/ui/dzis/kadry/zima-panorama.webp');
  assert.equal(ok.tlo(), null, 'przed wczytaniem panoramy nic');
  const blad = zPanorama({ szeroko: true }, 'blad');
  return new Promise((gotowe) => setImmediate(() => {
    assert.equal(ok.tlo().style.backgroundImage, 'url("' + ADRES + 'zima-panorama.webp")');
    assert.equal(blad.tlo().style.backgroundImage, 'url("' + ADRES + 'zima-sciezka-1280.webp")', 'błąd panoramy: plik nagłówka');
    gotowe();
  }));
});

test('(6) CSS: wszystko od 900 px i tylko na sekcji Dziś nowego ekranu; rozmycie, jasność, cover, winieta, cień kolumny; preferencje ruchu i przezroczystości', () => {
  const t = css();
  const m = /@media \(min-width:900px\)\{(html\.dzis-gotowy\.dzis-na-dzis #dn-tlo\.jest\{[^}]*\})(html\.dzis-gotowy\.dzis-na-dzis #dn-tlo\.jest::after\{[^}]*\})(html\.dzis-gotowy\.dzis-na-dzis body\{[^}]*\})\}/.exec(t);
  assert.ok(m, 'trzy reguły w jednym @media (min-width:900px)');
  for (const x of ['display:block', 'position:fixed', 'z-index:-1', 'background-size:cover', 'background-position:center', 'filter:blur(40px) brightness(.35)', 'pointer-events:none', 'animation:dn-tlo-wejscie']) assert.ok(m[1].includes(x), x);
  assert.match(m[2], /radial-gradient\(ellipse at center,rgba\(0,0,0,0\) 42%,rgba\(0,0,0,\.85\) 100%\)/, 'winieta do czerni przy brzegach');
  assert.match(m[3], /box-shadow:/, 'cień kolumny');
  assert.match(t, /@media \(prefers-reduced-motion:reduce\)\{html\.dzis-gotowy\.dzis-na-dzis #dn-tlo\.jest\{animation:none\}\}/);
  assert.match(t, /@media \(prefers-reduced-transparency:reduce\)\{html\.dzis-gotowy\.dzis-na-dzis #dn-tlo\.jest\{display:none!important\}\}/);
  assert.equal((t.match(/dn-tlo/g) || []).length, 6, 'poza tymi regułami (i nazwą animacji) arkusz nie dotyka tła');
  assert.equal((t.match(/ body\{/g) || []).length, 1, 'body tylko w regule cienia (od 900 px)');
  assert.ok(t.indexOf('@media (prefers-reduced-motion:reduce){html.dzis-gotowy.dzis-na-dzis #dn-tlo.jest') > t.indexOf('@media (min-width:900px)'), 'reguła ruchu stoi po regule 900 px (ta sama specyficzność, wygrywa późniejsza)');
});

test('(7) kontrakt ze stroną: <html> ma własne tło (inaczej tło body rozlałoby się na cały ekran i przykryło #dn-tlo), body bez kontekstu warstw', () => {
  assert.match(HTML, /\nhtml\{background:var\(--bg\);\}\n/);
  const body = /\nbody\{\n([\s\S]*?)\n\}/.exec(HTML)[1];
  assert.match(body, /max-width:420px;/);
  assert.doesNotMatch(body, /position:|z-index|transform|filter|opacity|isolation|contain/, 'body nie może tworzyć kontekstu warstw, bo z-index −1 wszedłby nad tło kolumny');
});

test('(8) dziś żaden kadr nie ma panoramy: jedno pobranie obrazu jak dotąd; pole opisane w kadry.json', () => {
  assert.ok(Array.from(strona().B.KADRY).every((k) => k.length === 5));
  assert.ok(KADRY_JSON.kadry.every((k) => !('szeroki' in k)));
  assert.match(KADRY_JSON.opis, /szeroki \(pole opcjonalne\)/);
  assert.match(MODUL, /function rysuj\(\) \{[\s\S]*?k\.setAttribute\("data-etap", ETAP\);\n    tloKadru\(\);\n  \}/, 'tło po narysowaniu nagłówka');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets/ui/dzis/kadry/kadry.json')));
});
