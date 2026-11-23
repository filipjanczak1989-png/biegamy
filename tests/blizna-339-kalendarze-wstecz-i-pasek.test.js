/* BLIZNA 339 (Filip 23.11, zgłoszenie „kalendarz bez dolnego paska i pętla wstecz”):
   P3: Kalendarz Startów (races.html) nigdy nie miał dolnego paska — teraz ma, jak inne ekrany (window.NAV z sb.js), bez podświetlonej pozycji
       (Startów nie ma w menu); rola: trener bez wiersza zawodnika → pasek trenera, konto trener+zawodnik → trenera tylko po wejściu z panelu trenera.
       Toast i koniec listy nad paskiem.
   P1: „← Powrót” w kalendarz.html (Mój plan) robił location.href + wpis „#” (od 9.04) → z wstecz w telefonie pętla kalendarz ↔ Dziś. Teraz jak telefon:
       przyszliśmy z naszej strony → history.back(); wejście z zewnątrz → location.replace (bez nowego wpisu); bez „#”.
   P2: trzy linki z Dziś do kalendarza niosą role=athlete — bez tego konto trener+zawodnik lądowało w kalendarzu trenera (initRole → role=coach). */
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

test('P3: races.html ma dolny pasek z window.NAV (jeden korzeń przed </body>, montowany po rozpoznaniu roli)', () => {
  const R = czytaj('races.html');
  assert.equal((R.match(/<div id="nav-mount"><\/div>/g) || []).length, 1);
  assert.match(R, /<div id="nav-mount"><\/div>\n<\/body>/, 'korzeń na końcu strony');
  assert.match(R, /  _isCoach = !!coachRow;\n  mountNav\(\);/, 'montowanie po rozpoznaniu trenera');
  assert.match(R, /\.toast\{\n  position:fixed;bottom:calc\(116px \+ env\(safe-area-inset-bottom, 0px\)\);/, 'toast nad paskiem i nad logo „Log” (blizna-346)');
  assert.match(R, /\.races-list\{padding:0 16px calc\(112px \+ env\(safe-area-inset-bottom, 0px\)\);/, 'koniec listy nad paskiem');
});

test('P3: pasek zawodnika albo trenera według konta i wejścia; bez podświetlonej pozycji; bez NAV nic się nie psuje', () => {
  const sbCtx = zaladujSb();
  sbCtx.location = { pathname: '/races.html', search: '' };   // NAV._here() czyta adres bieżącej strony (atrapa domyślnie „jest” na Dziś)
  const NAV = sbCtx.NAV;
  assert.ok(NAV && typeof NAV.render === 'function', 'NAV z sb.js');
  const zrodlo = funkcja(czytaj('races.html'), 'mountNav');
  const uruchom = ({ isCoach, athleteId, referrer = '', bezNav = false }) => {
    const m = { innerHTML: '' };
    const ctx = { window: bezNav ? {} : { NAV }, document: { referrer, getElementById: (id) => (id === 'nav-mount' ? m : null) }, URL, _isCoach: isCoach, _athleteId: athleteId };
    vm.runInNewContext(zrodlo + '\nmountNav();', ctx);
    return m.innerHTML;
  };
  const zaw = uruchom({ isCoach: false, athleteId: 'a1', referrer: 'https://biegamy.run/zawodnik.html' });
  assert.match(zaw, /^<nav class="bottom-nav">/); assert.match(zaw, /data-navid="home"[^>]*href="zawodnik\.html">/); assert.match(zaw, /href="profil\.html\?id=a1"/);
  assert.doesNotMatch(zaw, /nav-it active/, 'Startów nie ma w menu — nic podświetlone');
  const trener = uruchom({ isCoach: true, athleteId: null });
  assert.match(trener, /data-navid="home"[^>]*href="trener\.html">/); assert.match(trener, /Zawodnicy/);
  assert.match(uruchom({ isCoach: true, athleteId: 'a1', referrer: 'https://biegamy.run/trener.html' }), /Zawodnicy/, 'trener+zawodnik z panelu trenera → pasek trenera');
  for (const ref of ['https://biegamy.run/zawodnik.html', '', 'nie-adres']) assert.match(uruchom({ isCoach: true, athleteId: 'a1', referrer: ref }), /href="zawodnik\.html">/, 'trener+zawodnik z Dziś / bez referrera → pasek zawodnika: ' + ref);
  assert.equal(uruchom({ isCoach: false, athleteId: 'a1', bezNav: true }), '', 'bez NAV — pusto, bez wyjątku');
});

test('P1: „← Powrót” w kalendarz.html cofa w historii albo zastępuje adres — nigdy nie dopisuje wpisu (bez „#”, bez location.href)', () => {
  const K = czytaj('kalendarz.html');
  assert.match(K, /<a href="#" class="nav-link" id="back-link" onclick="goBack\(\);return false;">← Powrót<\/a>/);
  const zrodlo = funkcja(K, 'goBack');
  assert.doesNotMatch(zrodlo, /location\.href\s*=/);
  const uruchom = (referrer, dlugosc) => {
    const zdarzenia = [];
    const ctx = { document: { referrer }, history: { length: dlugosc, back: () => zdarzenia.push('back') }, URL, _backUrl: 'zawodnik.html',
      location: { origin: 'https://biegamy.run', replace: (u) => zdarzenia.push('replace:' + u) } };
    ctx.window = ctx;
    vm.runInNewContext(zrodlo + '\ngoBack();', ctx);
    return zdarzenia.join(',');
  };
  assert.equal(uruchom('https://biegamy.run/zawodnik.html', 3), 'back', 'z Dziś → cofnięcie');
  assert.equal(uruchom('https://biegamy.run/races.html', 4), 'back', 'z innej naszej strony → cofnięcie');
  assert.equal(uruchom('', 1), 'replace:zawodnik.html', 'start aplikacji na Planie → zastąp');
  assert.equal(uruchom('https://inna.pl/x', 3), 'replace:zawodnik.html', 'obca strona → zastąp');
  assert.equal(uruchom('https://biegamy.run/zawodnik.html', 1), 'replace:zawodnik.html', 'brak historii → zastąp');
  assert.equal(uruchom('nie-adres', 3), 'replace:zawodnik.html', 'zepsuty referrer → zastąp');
});

test('P2: trzy linki z Dziś do kalendarza z role=athlete; żadnego linku z Dziś do kalendarza bez roli', () => {
  const Z = czytaj('zawodnik.html');
  assert.match(Z, /  location\.href = 'kalendarz\.html\?role=athlete&openDay=' \+ key;/, '_openTodayInCal');
  assert.match(Z, /window\.location\.href = 'kalendarz\.html\?role=athlete&openDay=' \+ logDate;/, 'po zapisie nowego treningu');
  assert.match(Z, /notifClick = "location\.href='kalendarz\.html\?role=athlete';";/, 'powiadomienie o zmianie treningu');
  const kod = Z.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
  assert.doesNotMatch(kod, /location\.href\s*=\s*['"]kalendarz\.html(?!\?role=)/, 'location.href do kalendarza bez roli');
  assert.doesNotMatch(kod, /kalendarz\.html\?openDay=/, 'openDay bez roli');
});
