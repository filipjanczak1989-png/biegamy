// Blizna #41 (07.10.2026) — gra Bieguś SKASOWANA; pilnujemy, żeby nie wróciła po kawałku.
//
// Decyzja Filipa 7.10: nikt nie gra. Zmierzone na prod przed kasacją: biegus_most 14 wierszy
// (13 z zapisem), ostatni zapis 28.09.2026, 0 odbiorów piór w 7 dni, game_events ostatnie
// zdarzenie 21.09.2026. Faza 1 (ten commit): biegus.html → przekierowanie na zawodnik.html
// (zakładki, ikony PWA), baner na „Dziś" zdjęty, three.js z precache SW i z vendor/, assety gry
// z repo, testy gry zdjęte z komentarzem. Faza 2 (osobny commit, po fazie 1 na prod): migracja
// drop biegus_most_odbierz / biegus_ranking / biegus_most + WYCOFANIE, po eksporcie zapisów.
//
// Dwa testy osobno: „kod" zielony od razu po edycjach; „pliki" wymaga usunięcia assetów i vendora
// z drzewa (operacja masowa — wykonywana świadomie, nie przez skrypt).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8');
const istnieje = (f) => fs.existsSync(path.join(KORZEN, f));
/** Kod bez komentarzy: nagrobki MAJĄ wspominać grę, pilnujemy tylko żywego kodu. */
const bezKomentarzy = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('kod: biegus.html to samo przekierowanie, bez silnika, kluczy i kodów gry', () => {
  const pelny = czytaj('biegus.html');
  assert.ok(pelny.length < 4000, 'biegus.html ma ' + pelny.length + ' B — to nie jest przekierowanie');
  assert.match(pelny, /NAGROBEK \(07\.10\.2026\)/);
  const b = bezKomentarzy(pelny);
  assert.match(b, /<meta http-equiv="refresh" content="0; url=zawodnik\.html">/);
  assert.match(b, /location\.replace\("zawodnik\.html"\)/);
  for (const wz of [/THREE|three\.min|GLTFLoader/, /KODY_BONUS|przyznajKod/, /biegus_most_odbierz|biegus_ranking/, /sb_publishable_|supabase\.co/, /localStorage/]) {
    assert.doesNotMatch(b, wz, 'ślad gry w przekierowaniu: ' + wz);
  }
});

test('kod: żadna strona ani skrypt nie prowadzi do gry (link, baner, iframe, postMessage)', () => {
  const pliki = execSync('git ls-files "*.html" "*.js" "*.json" "sw.js"', { cwd: KORZEN }).toString()
    .split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('tests/') && x !== 'biegus.html');
  const slady = [];
  for (const f of pliki) {
    const s = bezKomentarzy(czytaj(f));   // nagrobki i komentarze MAJĄ prawo wspominać grę
    for (const m of s.matchAll(/biegus\.html|biegus-home-banner|three-r128|tryb=automat|wyzwanie-wynik/g)) {
      const linia = s.slice(0, m.index).split('\n').length;
      slady.push(f + ':~' + linia + ' ' + s.split('\n')[linia - 1].trim().slice(0, 90));
    }
  }
  assert.deepEqual(slady, [], 'wejścia do gry wróciły:\n' + slady.join('\n'));
});

test('kod: SW nie precache\'uje three.js, zawodnik.html nie przełącza baneru gry, gra.html nie woła parenta', () => {
  const sw = czytaj('sw.js');
  assert.doesNotMatch(sw, /^\s*'\/vendor\/three-r128\.min\.js',/m, 'three.js wrócił do PRECACHE_URLS — bez pliku addAll() wywraca instalację SW');
  const z = czytaj('zawodnik.html');
  assert.doesNotMatch(z, /getElementById\('biegus-home-banner'\)/);
  assert.doesNotMatch(z, /id="biegus-home-banner"/);
  assert.match(z, /NAGROBEK \(07\.10\.2026\): tu stał BIEGUS-BANNER/);
  const g = czytaj('gra.html');
  assert.doesNotMatch(g, /parent\.postMessage\(\{typ:'wyzwanie-wynik'/);
  assert.match(g, /NAGROBEK \(07\.10\.2026\): tu stał MOST-AUTOMAT/);
});

test('pliki: silnik, backupy i assety gry są poza drzewem (operacja masowa, wykonana świadomie)', () => {
  const zostaly = [
    'vendor/three-r128.min.js', 'biegus-v144-backup.html', 'biegus-v145-pre-miasto.html',
    'assets/biegus.glb', 'assets/postaci', 'assets/przedmioty', 'assets/sprites', 'assets/swiat',
    'assets/ui/atlas', 'assets/ui/ikony', 'assets/radio', 'assets/ui/og-biegus.webp', 'assets/ui/biegus-logo.webp',
    'assets/ui/mapa-swiat.webp', 'assets/ui/automat-ekran.webp', 'assets/ui/portret_pisklak.webp',
  ].filter(istnieje);
  assert.deepEqual(zostaly, [], 'pliki gry nadal w drzewie: ' + zostaly.join(', '));
  // assets/modele zostaje TYLKO z auto.glb (sb.js, zawodnik, trener, profil, js/silnik-anim.js)
  if (istnieje('assets/modele')) {
    assert.deepEqual(fs.readdirSync(path.join(KORZEN, 'assets/modele')), ['auto.glb'], 'w assets/modele zostało coś poza auto.glb');
  }
  // vendor/** w .gitattributes zostaje — supabase-js nadal tam żyje
  assert.ok(istnieje('vendor/supabase-js-2.112.4.min.js'));
  assert.match(czytaj('.gitattributes'), /^vendor\/\*\* -text/m);
});

test('pliki: to, co inne strony wciąż ładują z assets/, nie zniknęło razem z grą', () => {
  const musza = ['assets/modele/auto.glb', 'assets/ui/logo-bm-but.webp', 'assets/ui/logo-b-ring.webp',
    'assets/ui/pustki/pustka-offline.webp', 'assets/ui/pustki/pustka-404.webp', 'assets/ui/banery/baner-forma-bg.webp',
    'assets/ui/naglowki/naglowek-kalendarz.webp', 'assets/ui/onas/onas-1.webp'].filter((f) => !istnieje(f));   // assets/janusz zdjęte z listy 07.10 (Janusz Run skasowany, blizna-42)
  assert.deepEqual(musza, [], 'skasowane za dużo: ' + musza.join(', '));
});
