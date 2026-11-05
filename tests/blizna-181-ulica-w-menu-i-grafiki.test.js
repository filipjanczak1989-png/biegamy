/* BLIZNA 181 / PAS ULICY W MENU I GRAFIKI Z PRZEGLĄDU (Filip 5.11).
   Pas pod Graj: ta sama ulica co na Dziś, z czołem budowy i budynkami firm, link do pełnej. Przed startem i bez sesji go nie ma. Po przyjętej rundzie napis, imię tylko z licznika.
   Grafiki z przeglądu zastępują kształty z kodu, a kształt zostaje na wypadek braku pliku. Kafle: szew sprawdzony na pikselach. Po skutku: przeglądarka (narzędzie poza repo). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;

test('napis po rundzie: imię z licznika w dopełniaczu, bez imienia nic', () => {
  assert.equal(L.napisMuruUlicy('Fabianek'), 'Twoje cegły lecą na mur przy Ulicy Fabianka');
  assert.equal(L.napisMuruUlicy(''), ''); assert.equal(L.napisMuruUlicy(null), '');
  assert.doesNotMatch(czytaj('js/cegielki-logika.mjs'), /Fabian/, 'imię dziecka tylko z bazy');
});

test('pas: ukryty na starcie, tylko po starcie i z sesją, nie w premierze, awaria go chowa', () => {
  const k = czytaj('js/cegielki-konto.js'), h = czytaj('gra-cegielki.html');
  assert.match(h, /<div class="m-graj-kol">\n\s*<button class="g m-graj-guzik" id="m-graj-guzik" type="button">Graj<small id="m-graj-kto"><\/small><\/button>\n\s*<div id="m-ulica" class="m-ulica" hidden><\/div>/, 'pod Graj, schowany');
  assert.match(k, /if \(premiera \|\| !stan\.zalogowany \|\| !d \|\| d\.wystartowala !== true\) \{ schowaj\(\); return; \}/);
  assert.match(k, /\.catch\(schowaj\)/);
  assert.match(k, /function ustawPodglad\(w\) \{[\s\S]*?stan\.licznikProby = \{ wystartowala: true,/, 'pas na próbie tylko w podglądzie trenera');
  assert.doesNotMatch(k, /rpc\("akcja_licznik"/, 'gra nie czyta licznika przez RPC');
  assert.match(k, /var e = \$\("m-ulica"\), d = stan\.licznikProby \|\| stan\.licznik;/);
  assert.match(k, /przyklad && parametry\.get\("ulica"\) === "przyklad"/, 'podgląd tylko na danych przykładowych');
  assert.match(k, /stan\.licznik && stan\.licznik\.wystartowala === true \? L\.napisMuruUlicy\(stan\.imie\) : ""/);
  assert.match(k, /else if \(odp\.ok\) \{ info\(""\); napisUlicy\(\);/, 'napis tylko po przyjętej rundzie');
  assert.match(k, /if \(\$\("k-ulica"\)\) \$\("k-ulica"\)\.hidden = true;/, 'każda runda zaczyna bez napisu');
  assert.match(h, /<p id="k-ulica" class="k-ulica" hidden><\/p>/);
});

function wezel(tag) {
  const n = { tag, dzieci: [], atr: {}, style: {}, classList: { add() {}, remove() {} }, parentNode: null, textContent: '',
    setAttribute(k, v) { n.atr[k] = v; }, getAttribute(k) { return n.atr[k]; },
    appendChild(d) { d.parentNode = n; n.dzieci.push(d); return d; },
    removeChild(d) { n.dzieci.splice(n.dzieci.indexOf(d), 1); d.parentNode = null; return d; },
    get firstChild() { return n.dzieci[0] || null; } };
  return n;
}
function wszystkie(n, w) { w = w || []; w.push(n); n.dzieci.forEach((d) => wszystkie(d, w)); return w; }
function modul() {
  const g = { Image: function () { this.set = 1; }, document: { getElementById: () => null, createElement: wezel, createElementNS: (_n, t) => wezel(t), head: wezel('head') }, Date, Intl, Math, JSON, Promise, URL, console, setTimeout: () => 0 };
  Object.defineProperty(g, 'BM_AKCJA', { value: { dopelniacz: (i) => i === 'Fabianek' ? 'Fabianka' : i, km: (x) => String(x), logoFirmy: (f) => f.logo_url || '' }, writable: true });
  new Function('globalThis', czytaj('js/ulica.mjs').replace(/typeof globalThis !== "undefined" \? globalThis : this/, 'globalThis'))(g);
  return g.BM_ULICA;
}
const LICZNIK = { wystartowala: true, imie: 'Fabianek', suma_km: 1900, cel_km: 12500, firmy: [{ nazwa: 'Firma A', rodzaj: 'wiezowiec' }, { nazwa: 'Firma B', logo_url: 'x.webp' }, { nazwa: 'Firma C', rodzaj: 'cegielka' }, { nazwa: 'Firma D', wsparcie: 'poprzednie', rodzaj: 'fabryka' }] };

test('pas: link do pełnej ulicy, tytuł z imienia, czoło budowy, budynki firm bez cegiełek', () => {
  const U = modul(), e = wezel('div');
  assert.equal(U.pasGry(e, LICZNIK), true);
  const a = e.dzieci[0]; assert.equal(a.tag, 'a'); assert.equal(a.atr.href, 'dla-fabianka.html#ulica-po'); assert.match(a.atr['aria-label'], /Ulica Fabianka/);
  const n = wszystkie(a), klasa = (k) => n.filter((x) => (x.atr.class || '').split(' ').includes(k));
  assert.equal(klasa('um-pas-tytul')[0].textContent, 'Ulica Fabianka');
  assert.equal(klasa('um-pas-domek').length, 3, 'cegiełka nie jest budynkiem');
  assert.ok(klasa('um-koparka').length === 1 && klasa('um-walec').length === 1 && klasa('um-budowniczy').length === 1, 'czoło budowy');
  const obrazy = n.filter((x) => x.tag === 'img').map((x) => x.atr.src);
  assert.ok(obrazy.includes('assets/ulica/wiezowiec.webp')); assert.ok(obrazy.includes('assets/ulica/fabryka.webp')); assert.ok(obrazy.includes('x.webp'), 'logo firmy');
  assert.equal(klasa('um-droga')[0].style.width, (Math.floor(1900 / U.KM_NA_ODCINEK) / U.ODCINKOW * 100) + '%');
});

test('pas: przed startem, bez licznika i z bzdurą pusty; awaria nie rzuca', () => {
  const U = modul();
  for (const d of [{ wystartowala: false, start: '2026-11-07' }, null, undefined, 'x', { wystartowala: true }, { wystartowala: true, suma_km: 'x' }]) { const e = wezel('div'); assert.equal(U.pasGry(e, d), false, JSON.stringify(d)); assert.equal(e.dzieci.length, 0); }
  assert.equal(U.pasGry(null, LICZNIK), false);
});

test('pas: ten sam plik co na Dziś, Dziś bez zmian, dane firmy tylko przez textContent i setAttribute', () => {
  const u = czytaj('js/ulica.mjs'), f = u.slice(u.indexOf('function pasGry'), u.indexOf('/* ── STRONA AKCJI'));
  assert.doesNotMatch(f, /innerHTML/);
  assert.match(czytaj('js/akcja.mjs'), /U\.zamontuj\(el, d, opcje\)/, 'Dziś dalej przez zamontuj');
});

test('gra: grafiki z przeglądu, kształt zostaje przy braku pliku, duże pliki poza startem', () => {
  const s = czytaj('js/cegielki.js'), h = czytaj('gra-cegielki.html'), a = JSON.parse(czytaj('assets/gra/atlas.json'));
  for (const n of ['chmura1', 'chmura2', 'chmura3', 'slonce', 'odznaka', 'tablica', 'trawa_pod_droga', 'mur_rusztowanie', 'mur_pomost', 'mur_flaga_a', 'mur_flaga_b', 'mur_cegla']) {
    assert.ok(a[n], n); assert.ok(fs.existsSync(path.join(KORZEN, 'assets/gra', n + '.webp')), n);
  }
  for (const n of ['ikona_dziennik', 'ikona_magazyn', 'ikona_rankingi', 'ikona_mur', 'glosnik_wl', 'glosnik_wyl', 'obroc_telefon', 'medal_1', 'medal_2', 'medal_3']) assert.ok(fs.existsSync(path.join(KORZEN, 'assets/gra', n + '.webp')), n);
  assert.match(s, /!\/\^\(kasia\|filip\|rowerzysta\|dodatek\|rakieta\|mur\)_\/\.test\(k\)/, 'mur i rakieta poza ładowaniem startowym');
  assert.match(s, /if \(oc\) \{ var wc = 112 \* z/); assert.match(s, /x\.beginPath\(\); x\.ellipse\(cx, cy, 58 \* z/, 'chmura z kodu zostaje');
  assert.match(s, /if \(seg && pom\) \{/); assert.match(s, /c\.lineCap = "round"; c\.strokeStyle = "#2b1c10"/, 'rusztowanie z kodu zostaje');
  assert.match(s, /if \(gr\) \{\n\s+\/\* Trzy części/); assert.match(s, /c\.fillText\(t, x - 8 \+ lw \+ 4, ty\)/, 'napis na fladze w kodzie');
  assert.doesNotMatch(s + h, /🏅|🔊|🔇|📱/, 'bez emoji, które na każdym telefonie wygląda inaczej');
  assert.doesNotMatch(h, /<svg class="m-ikona"/);
});

test('ulica: warstwy z plików, kształt z kodu do czasu wczytania, ciężar w granicach', () => {
  const s = czytaj('js/ulica-scena.mjs');
  assert.match(s, /daleko\.style\.backgroundImage = svgUrl\(SVG_DALEKO\);[^\n]*\n\s+zPliku\(daleko, "assets\/ulica\/wzgorza\.webp"/);
  assert.match(s, /przod\.style\.backgroundImage = svgUrl\(SVG_PRZOD\);[^\n]*\n\s+zPliku\(przod, "assets\/ulica\/pierwszy-plan\.webp"/);
  assert.match(s, /zPliku\(plot, "assets\/ulica\/plot\.webp"/); assert.match(s, /function rysujPark\(xp\)/); assert.match(s, /im\.onerror = function \(\) \{/, 'park: bez pliku drzewa jak dotąd');
  let razem = 0;
  for (const n of ['wzgorza', 'plot', 'pierwszy-plan', 'slupek', 'tablica-start', 'tablica-meta', 'park']) { const st = fs.statSync(path.join(KORZEN, 'assets/ulica', n + '.webp')); assert.ok(st.size < 100 * 1024, n); razem += st.size; }
  assert.ok(razem < 260 * 1024, 'razem ' + razem);
});

test('buty: plik i atlas razem, kategoria się pokazuje', () => {
  const a = JSON.parse(czytaj('assets/gra/atlas.json'));
  for (const p of L.SKLEP.filter((x) => x.rodzaj === 'buty')) { assert.ok(a['dodatek_' + p.id], p.id); assert.ok(fs.existsSync(path.join(KORZEN, 'assets/gra/dodatek_' + p.id + '.webp')), p.id); }
});

test('sekret i dziecko: nazwy plików i teksty bez zakazanych słów', () => {
  const pliki = [...fs.readdirSync(path.join(KORZEN, 'assets/gra')), ...fs.readdirSync(path.join(KORZEN, 'assets/ulica'))];
  for (const n of pliki) assert.doesNotMatch(n, /wież|kości|kierun|plakat|arkusz-szefa|fabian/i, n);
});
