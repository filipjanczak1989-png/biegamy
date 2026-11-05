/* BLIZNA 167 / MAGAZYN SZEFA (Filip 5.11): przy każdym przedmiocie kropka koloru i obok postać w tym stroju, z istniejących arkuszy i przypięć, bez nowych grafik; dodatki też z ikoną.
   - strój osobno na postać, kupione wspólne: zmiana stroju Kasi nie rusza Filipa;
   - przymierzalnia: pierwsze dotknięcie przebiera wybraną postać, nic nie wymienia i nic nie zapisuje;
   - miniatura liczy jedną klatkę, nie cały arkusz: telefon nie może liczyć kilkunastu arkuszy naraz;
   - podpis firmy z bazy, domyślnie wyłączony, jako tekst; nazwy firmy nie ma w repo.
   Po skutku: przeglądarka (narzędzie poza repo) i tools/gra-poziomy-test.sql. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;

test('nazwa: Magazyn Szefa w menu, na końcu rundy i w nagłówku', () => {
  const h = czytaj('gra-cegielki.html');
  assert.match(h, /id="m-sklep">Magazyn Szefa <span id="m-saldo">/); assert.match(h, /id="k-sklep">Magazyn Szefa</); assert.match(h, /<h2>Magazyn Szefa<\/h2>/);
  assert.doesNotMatch(h, /Sklepik/);
});

test('stroje osobno: zapis na postać, kupione wspólne, stary zapis raz, koparka bez dodatków', () => {
  const pusty = { kasia: {}, filip: {}, rowerzysta: {} };
  assert.deepEqual(L.stroje(null, null), pusty);
  assert.deepEqual(L.stroje('smiec', 'smiec'), pusty);
  assert.deepEqual(L.stroje([], []), pusty);
  const stary = { tulow: 'kamizelka' };
  assert.deepEqual(L.stroje(null, stary), { kasia: stary, filip: stary, rowerzysta: stary }, 'stary wspólny zapis');
  assert.deepEqual(L.stroje({ kasia: { glowa: 'opaska' } }, stary), { kasia: { glowa: 'opaska' }, filip: {}, rowerzysta: {} }, 'nowy zapis wygrywa ze starym');
  assert.ok(!('koparka' in L.stroje({ koparka: { glowa: 'opaska' } })), 'rysunek bez dodatków');
  assert.equal(L.maStroj({ tulow: null, glowa: 'opaska' }), true); assert.equal(L.maStroj({ tulow: null }), false); assert.equal(L.maStroj(null), false);
  const k = czytaj('js/cegielki-konto.js'), s = czytaj('js/cegielki.js');
  assert.match(k, /function wybor\(po\) \{ return L\.poprawnyStroj\(stan\.stroje\[po \|\| postacMagazynu\(\)\], stan\.kupione, czyKorona\(\)\); \}/, 'kupione wspólne, strój osobny');
  assert.match(k, /stan\.stroje\[kto\] = teraz; zapiszStroje\(\);/); assert.match(k, /stan\.stroje\[komu\] = po; zapiszStroje\(\);/);
  assert.match(k, /window\.sb\.rpc\("gra_zapisz_stroje", \{ p_stroje: stan\.stroje \}\)/);
  assert.match(k, /\.from\("gra_konto"\)\.select\("stroje"\)\.maybeSingle\(\)/, 'osobne zapytanie: baza bez kolumny nie zabiera salda');
  assert.match(s, /ubior = KONTO \? L\.strojPostaci\(KONTO\.wybor\(postac\), postac\) : null;/, 'runda w stroju tej postaci');
  assert.match(k, /function kartyWStrojach\(\)/, 'karty wyboru w strojach');
});

test('wiersz: kropka koloru i obok miniatura postaci, ikona przy dodatku, kolejka po klatce', () => {
  const k = czytaj('js/cegielki-konto.js');
  assert.match(k, /if \(p\.kolor\) \{ var pr = el\("span", "s-probka"\);/, 'kropka zostaje');
  assert.match(k, /b\.appendChild\(ob\); if \(pasuje\) zamowMiniature\(kan, p\);/);
  assert.match(k, /if \(!p\.kolor\) \{ var ik = document\.createElement\("img"\); ik\.className = "s-ikona"; ik\.src = "assets\/gra\/dodatek_" \+ p\.id \+ "\.webp";/);
  assert.match(k, /if \(!pasuje\) \{ b\.disabled = true; b\.appendChild\(el\("span", "s-cena", "Nie na tę postać"\)\); return b; \}/);
  assert.match(k, /requestAnimationFrame\(rysujKolejkeMiniatur\)/, 'po jednej na klatkę');
  assert.match(k, /if \(z\.kan\.isConnected\)/, 'stare zamówienia po przerysowaniu listy nic nie liczą');
  assert.match(k, /kolejkaMiniatur\.length = 0; rysujPodpisMagazynu\(\);/);
  assert.deepEqual(L.strojZPrzedmiotem({ tulow: 'kamizelka', glowa: 'opaska' }, { id: 'korona', slot: 'glowa' }), { tulow: 'kamizelka', glowa: 'korona' }, 'reszta stroju zostaje');
  assert.deepEqual(L.strojZPrzedmiotem(null, { id: 'medal', slot: 'szyja' }), { szyja: 'medal' });
  const wejscie = { glowa: 'opaska' }; L.strojZPrzedmiotem(wejscie, { id: 'korona', slot: 'glowa' }); assert.equal(wejscie.glowa, 'opaska', 'wybór gracza nietknięty');
});

test('miniatura: jedna klatka, ta sama przeróbka co w grze', () => {
  const s = czytaj('js/cegielki-stroj.js');
  assert.match(s, /JEDNA\[postac\] = \{ kan: kan, at: \{ cw: at\.cw, ch: at\.ch, n: 1 \} \};/, 'przeróbka widzi arkusz jednoklatkowy');
  assert.match(s, /przerob\(j\.kan, j\.at, postac \+ "_bieg", postac, wybor\)/);
  assert.match(s, /zrodlo = ORYGINALY\[n\] \|\| OBR\[n\];\n\s+if \(!at \|\| !zrodlo\) return null;/, 'z oryginału: założony strój nie miesza się z miniaturą');
  assert.doesNotMatch(s.slice(s.indexOf('function miniatura')), /zastosuj\(OBR/, 'miniatura nie podmienia arkuszy gry');
});

test('przymierzalnia: dotknięcie przebiera wybraną postać, podgląd przyklejony i w ruchu, wymiana dopiero drugim dotknięciem, przymiarki się nie zapisuje', () => {
  const k = czytaj('js/cegielki-konto.js'), h = czytaj('gra-cegielki.html');
  assert.match(k, /if \(po === postacMagazynu\(\) && stan\.potwierdz\)/, 'przymiarka tylko na wybranej postaci');
  assert.match(k, /function zamknijSklep\(\) \{ stan\.potwierdz = null;/, 'wyjście wraca do poprzedniego stroju');
  assert.match(k, /S\.klatkaBiegu\(kan, GR\.OBR, GR\.A, podgladGotowy\.po, podgladGotowy\.w, klatkaStroju\)/, 'pętla biegu');
  assert.match(h, /<canvas id="s-duza"/); assert.match(h, /class="s-mala" data-postac="filip"/); assert.match(h, /class="s-mala" data-postac="koparka" hidden/);
  assert.match(k, /if \(stan\.potwierdz !== p\.id\) \{ stan\.potwierdz = p\.id; rysujSklep\(true\); przymierzalnia\(\);/);
  assert.match(k, /window\.sb\.rpc\("gra_kup", \{ p_przedmiot: p\.id \}\)/);
  assert.match(h, /\.s-podglad \{[^}]*position:sticky/);
});

test('podpis firmy: z bazy, jako tekst, domyślnie schowany, bez nazwy w repo', () => {
  const k = czytaj('js/cegielki-konto.js'), h = czytaj('gra-cegielki.html');
  assert.match(h, /<div id="s-partner" class="s-partner" hidden><\/div>/);
  assert.match(k, /t = stan\.ranking && stan\.ranking\.magazyn_podpis; if \(!e\) return;\n\s+e\.hidden = !t; e\.textContent = "";\n\s+if \(!t\) return;/, 'bez podpisu ani śladu firmy'); assert.match(k, /e\.appendChild\(el\("span", "", t\)\)/, 'podpis jako tekst'); assert.match(k, /L\.firmyZLicznika\(d\)\.filter\(function \(f\) \{ return f\.partner && f\.logo; \}\)\[0\]/, 'logo tylko z kubełka firm');
  for (const p of ['js/cegielki-konto.js', 'js/cegielki-logika.mjs', 'js/cegielki.js', 'gra-cegielki.html']) assert.doesNotMatch(czytaj(p), /\bMMG\b/, p);
});
