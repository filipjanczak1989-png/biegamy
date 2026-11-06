/* BLIZNA 189 / TRZY POPRAWKI (6.11): edycja po zatwierdzeniu, firmy i mur widoczne, koła walca.
   - przy zatwierdzonej firmie „Edytuj” otwiera edytor firm w trener.html; pokazanie kwoty zapisane osobno, żeby przed migracją reszta edycji przeszła;
   - wpisy w murze: od blizny 191 „Edytuj” i „Usuń z Ulicy” bez migracji (nowy wpis + skasowanie starego), ukrywanie z kolumną ukryta odpadło;
   - piąty przycisk na kaflu Dziś na całą szerokość i przycisk na górze strony akcji: do sekcji firm i cegiełek; cegiełka z podglądem, nic nie wysyła;
   - koła walca: owalny wycinek zmierzony na pliku i obrót z kompensacją owalu (bez „jajek”). Po skutku: Chrome (poza repo), klatki 0°, 45°, 90°. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('kafel Dziś i strona akcji: przycisk do firm i cegiełek', () => {
  const A = czytaj('js/akcja.mjs'), F = czytaj('dla-fabianka.html');
  assert.match(A, /\(formularzFirm\(d\) \? '<a class="akcja-dzis-przycisk akcja-dzis-przycisk--ulica" href="' \+ adresStrony\(d, "#firma"\) \+ '">Twoja firma lub cegiełka na Ulicy<\/a>' : ""\)/);
  assert.match(A, /\.akcja-dzis-przycisk--ulica\{grid-column:1\/-1;/, 'na całą szerokość pod czterema');
  assert.match(A, /function formularzFirm\(d\) \{ return !!\(d && d\.wystartowala && \(d\.firmy_zgloszenia === true \|\| \(typeof d\.kontakt_firmy === "string" && d\.kontakt_firmy\)\)\); \}/, 'te same warunki co sekcja na stronie akcji');
  assert.ok(F.indexOf('id="do-firmy"') > F.indexOf('<h1 id="nazwa">') && F.indexOf('id="do-firmy"') < F.indexOf('aria-label="Licznik"'), 'na górze, nad licznikiem');
  assert.match(F, /\$\('do-firmy'\)\.hidden = \$\('firma'\)\.hidden \|\| zamknieta;/);
});

test('cegiełka w sekcji firm: podgląd tą samą funkcją co mur, nic nie wysyła', () => {
  const K = czytaj('js/firma-formularz.mjs'), c = K.slice(K.indexOf('function cegielka('), K.indexOf('/** Rysuje sekcję w kontenerze.'));
  assert.match(c, /U\.podgladCegly\(pod, ok \? im : "", true\)/);
  assert.match(c, /U\.poprawneImie\(im\)/);
  assert.doesNotMatch(c, /fetch|FormData|rpc|\.from\(/);
  assert.match(K, /cegielka\(s, adres\);\n\s+return true;/);
  assert.match(czytaj('js/ulica.mjs'), /poprawneImie: function \(t\) \{ return RE_IMIE\.test\(String\(t \|\| ""\)\.trim\(\)\); \}/);
});

test('edycja po zatwierdzeniu: firma przez istniejący edytor, wpis w murze bez migracji', () => {
  const P = czytaj('js/firmy-panel.mjs'), T = czytaj('trener.html'), U = czytaj('js/ulica.mjs');
  assert.match(P, /if \(z\.status === "zatwierdzone"\) \{[\s\S]{0,1200}g\.BM_EDYTUJ_FIRME\(z\.nazwa, !!z\.proba\)/, 'z próby też (blizna-191)');
  assert.match(T, /window\.BM_EDYTUJ_FIRME = async function \(nazwa, proba\) \{[\s\S]{0,300}zacznijEdycje\(f\);/);
  assert.match(T, /const r = await sb\.from\('akcja_firmy'\)\.update\(\{ zgoda_na_kwote: pokazKwote \}\)\.eq\('id', edycja\.id\)/, 'pokazanie kwoty osobno');
  assert.doesNotMatch(czytaj('js/akcja.mjs').slice(czytaj('js/akcja.mjs').indexOf('function firmaDoEdycji')), /zgoda_na_kwote: w\./, 'główna edycja bez pola, którego baza może jeszcze nie przyjąć');
  const w = U.slice(U.indexOf('function wierszCegielki'), U.indexOf('async function wczytajCegielki'));
  assert.doesNotMatch(w, /ukryta|\.update\(/, 'baza nie daje trenerowi UPDATE na wpisach w murze ani kolumny ukryta');
  assert.match(U, /sb\.from\("akcja_cegielki"\)\.select\("id,imie,zgoda,dodano"\)/);
  assert.match(w, /cegielkaDoZapisu\(\{ imie: x\.imie, zgoda: x\.zgoda, potwierdzenie: true \}\)\.blad/, 'te same zasady i filtr imion co przy dodawaniu');
});

test('koła walca: owal zmierzony na pliku, obrót z kompensacją', () => {
  const S = czytaj('js/ulica-scena.mjs');
  assert.match(S, /var KOLA_WALCA = \{ srodki: \[\[12\.5, 67\.75\], \[35\.75, 67\.75\]\], rx: 11\.1, ry: 14\.2 \};/);
  assert.match(S, /im\.style\.clipPath = "ellipse\(" \+ KOLA_WALCA\.rx \+ "px " \+ KOLA_WALCA\.ry \+ "px at " \+ k\[0\] \+ "px " \+ k\[1\] \+ "px\)";/);
  assert.match(S, /@keyframes us-kolo\{from\{transform:scaleY\(var\(--sy,1\)\) rotate\(0deg\) scaleY\(var\(--sy1,1\)\)\}to\{transform:scaleY\(var\(--sy,1\)\) rotate\(360deg\) scaleY\(var\(--sy1,1\)\)\}\}/);
  assert.doesNotMatch(S, /circle\(" \+ promienKola/, 'bez okrągłego wycinka');
  const ROZ = JSON.parse('{' + /var ROZMIAR = \{ ([^}]+) \};/.exec(S)[1].replace(/(\w+):/g, '"$1":') + '}');
  const wym = { koparka: [248, 171], walec: [208, 167], dzwig: [260, 181], budowniczy: [78, 148] };
  for (const [n, [w, h]] of Object.entries(wym)) assert.ok(Math.abs(ROZ[n][0] / ROZ[n][1] - w / h) < 0.01, n + ': pudełko w proporcjach pliku');
});
