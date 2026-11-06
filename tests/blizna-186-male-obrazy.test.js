/* BLIZNA 186 / WYDAJNOŚĆ STARTU (6.11, zgłoszenie testera „wolniej niż przed akcją”).
   - Dziś: zdjęcia planu tygodnia, banery typów, logo menu i ikony kafli z biegamy-assets/m/ w rozmiarze wyświetlania;
     lista w sb.js = pliki, które mają kopię w m/. Nowe zdjęcie w puli bez kopii zostaje przy oryginale, więc nic nie znika;
   - strona akcji: skrypty z defer, fonty Google bez blokowania pierwszego obrazu, kod strony po DOMContentLoaded;
   - gra: menu po samych kartach postaci, reszta grafik rundy w tle, runda na nie czeka; obrazki ukrytych ekranów leniwie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const SB = czytaj('sb.js');
const BAZA = 'https://filipjanczak1989-png.github.io/biegamy-assets/';

function assetUrl() {
  const i = SB.indexOf('window.MALE_OBRAZY'), j = SB.indexOf('};', SB.indexOf('window.assetUrl = function', i)) + 2;
  const w = {}; vm.runInNewContext(SB.slice(i, j), { window: w });
  w.MALE_OBRAZY_TAK = true;   // sonda potwierdziła m/ (blizna-190); bez niej oryginały
  return { u: (p) => w.assetUrl(p).replace(BAZA, ''), re: w.MALE_OBRAZY };
}

test('assetUrl: małe kopie tylko dla plików z listy, parametr zostaje, reszta bez zmian', () => {
  const { u } = assetUrl();
  assert.equal(u('run1.webp'), 'm/run1.webp'); assert.equal(u('run77.webp'), 'm/run77.webp'); assert.equal(u('/run5.webp'), 'm/run5.webp');
  assert.equal(u('typ-spokojny.jpg'), 'm/typ-spokojny.webp'); assert.equal(u('bm-nav.webp'), 'bm-nav.webp', 'logo LOG zawsze z oryginału (blizna-190)');
  assert.equal(u('ikona-odznaki.png?v=3'), 'm/ikona-odznaki.webp?v=3');
  for (const x of ['run0.webp', 'run78.webp', 'run7.jpg', 'typ-nowy.jpg', 'ikona-nowa.png', 'icon-nav-medal.webp', 'kalendarz/typ-tempo.webp', 'kadr-36.jpg', 'filmy/film-06-poster.jpg', 'm/run1.webp', 'xrun1.webp'])
    assert.equal(u(x), x.replace(/^\/+/, ''), x);
  assert.equal(u(''), '');
});

test('lista małych kopii pokrywa to, co Dziś faktycznie pobiera', () => {
  const { re } = assetUrl(), Z = czytaj('zawodnik.html'), P = czytaj('profil.html');
  const pula = /for \(let i = 1; i <= (\d+); i\+\+\) \{\s+imgs\.push\(assetUrl\('run' \+ i \+ '\.webp'\)\);/.exec(Z);
  assert.ok(pula, 'pula zdjęć planu w zawodnik.html');
  for (let i = 1; i <= Number(pula[1]); i++) assert.ok(re.test('run' + i + '.webp'), 'run' + i + ': pula urosła, dorób kopię w biegamy-assets/m/ i dopisz do listy');
  const bannery = /window\.TRAINING_TYPE_BANNERS = \{([^}]+)\}/.exec(SB)[1];
  for (const s of new Set([...bannery.matchAll(/:'([a-z]+)'/g)].map((m) => m[1]))) assert.ok(re.test('typ-' + s + '.jpg'), 'typ-' + s);
  for (const m of (Z + P).matchAll(/data-ic="(ikona-[a-z]+\.png)(\?v=\d+)?"/g)) assert.ok(re.test(m[1]), m[1]);
});

test('strona akcji: nic nie blokuje pierwszego obrazu', () => {
  const h = czytaj('dla-fabianka.html'), glowa = h.slice(0, h.indexOf('</head>'));
  const skrypty = [...glowa.matchAll(/<script([^>]*)src="[^"]+"><\/script>/g)];
  assert.equal(skrypty.length, 5);
  for (const s of skrypty) assert.match(s[1], /\bdefer\b/, s[0]);
  assert.doesNotMatch(glowa.replace(/<noscript>[\s\S]*?<\/noscript>/g, ''), /<link[^>]+rel="stylesheet"/, 'arkusz fontów nie blokuje');
  assert.match(glowa, /<link rel="preload" href="https:\/\/afqojgkaveykxbltxzwm\.supabase\.co\/functions\/v1\/akcja-licznik\?slug=dla-fabianka" as="fetch" crossorigin>/, 'licznik od razu, nie po skryptach');
  assert.match(h, /odswiez\(\);\n  try \{ var fonty = document\.createElement\('link'\); fonty\.rel = 'stylesheet'; fonty\.href = 'https:\/\/fonts\.googleapis\.com\/css2\?[^']+display=swap'; document\.head\.appendChild\(fonty\); \} catch/, 'fonty po skryptach strony i po pytaniu o licznik');
  assert.match(glowa, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/);
  const kod = h.slice(h.lastIndexOf('<script>'));
  assert.match(kod, /^<script>\ndocument\.addEventListener\('DOMContentLoaded', function \(\) \{\n  'use strict';\n  var A = window\.BM_AKCJA/, 'kod strony po skryptach z defer');
});

test('gra: menu nie czeka na grafiki rundy, runda czeka', () => {
  const G = czytaj('js/cegielki.js'), h = czytaj('gra-cegielki.html');
  assert.match(G, /var GRAFIKI_MENU = \["kasia_bieg", "filip_bieg"\], grafikiRundy = Promise\.resolve\(\);/);
  const init = G.slice(G.indexOf('Object.assign(A, await r.json());'), G.indexOf('pokazMenu(); gotowaOk();'));
  assert.match(init, /await wczytajObrazy\(GRAFIKI_MENU\);\n\s+grafikiRundy = wczytajObrazy\(wspolne\);/);
  assert.doesNotMatch(init, /await wczytajObrazy\(wspolne\)/, 'menu nie czeka na całą rundę');
  const start = G.slice(G.indexOf('function start(postac)'), G.indexOf('function start(postac)') + 3000);
  assert.match(start, /grafikiRundy\.then\(function \(\) \{ return wczytajObrazy\(naz\); \}\)/, 'runda rusza dopiero z kompletem');
  assert.match(G, /if \(wTrakcie\[n\]\) return wTrakcie\[n\];/, 'ten sam plik nie pobiera się dwa razy');
  for (const id of ['obroc', 'premiera', 'koniec']) {
    const od = h.indexOf('<div id="' + id + '"'), blok = h.slice(od, h.indexOf('\n</div>', od));
    for (const img of blok.match(/<img [^>]*src="[^"]+"[^>]*>/g) || []) assert.match(img, /loading="lazy"/, id + ': ' + img);
  }
  for (const t of ['kask', 'bidon', 'rakieta']) assert.match(h, new RegExp('data-typ="' + t + '"[^>]*hidden><img src="assets/gra/' + t + '\\.webp" alt="" loading="lazy">'));
  const menu = h.slice(h.indexOf('<div id="menu"'), h.indexOf('<div id="obroc"'));
  assert.doesNotMatch(menu, /loading="lazy"/, 'menu ładuje się od razu');
});
