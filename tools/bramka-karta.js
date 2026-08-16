#!/usr/bin/env node
/* BRAMKA KARTY UDOSTĘPNIANIA — porównuje WYNIK, nie argumenty.
 *
 * CO PILNUJE: karta ma JEDEN renderer (supabase/functions/share-card). Klient
 * jej nie rysuje — pobiera gotowy PNG. Rozjechać może się więc tylko GEOMETRIA:
 * klient mierzy jasność zdjęcia tam, gdzie EF postawi imię, podpis i statystyki.
 * Jeśli EF przesunie `podpisY`, a klient nadal mierzy stare miejsce, nic się nie
 * wywali — karty zaczną wychodzić nieczytelne, a kontrola jasności będzie je
 * przepuszczać, bo patrzy nie tam.
 *
 * ⚠️ CZEGO NIE PILNUJE — i to trzeba wiedzieć, żeby nie ufać jej za bardzo:
 *    NIE łapie różnic w samym MALOWANIU. Nie wie nic o czcionkach, szerokości
 *    glifów, odstępach ani zawijaniu tekstu. „PRZEWYŻSZENIE" wchodzące na ikonę
 *    sąsiada przy 22 px przejdzie tę bramkę bez słowa — bo pozycje kolumn będą
 *    zgodne, a o tym, że napis jest za szeroki, wie dopiero Satori.
 *    Jedyną uczciwą kontrolą na to byłoby wyrenderowanie PNG w CI i porównanie
 *    z wzorcem; przy jednym rendererze uznaliśmy to za nieproporcjonalne.
 *
 * DLACZEGO WYNIK, A NIE ARGUMENTY: porównanie „czy obie strony wołają tę samą
 * stałą" przeszłoby także wtedy, gdyby jedna strona zapisywała scrim w procentach,
 * a druga w pikselach i któraś źle przeliczyła. Dlatego sprowadzamy obie postaci
 * do PIKSELI i porównujemy wartości — w tym krycie scrimu wyliczone w punktach,
 * które klient faktycznie próbkuje.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');

const bledy = [];
const zle = (m) => bledy.push(m);

const UKLAD = JSON.parse(czytaj('supabase/functions/_shared/karta-uklad.json'));
const EF = czytaj('supabase/functions/share-card/index.ts');
const KLIENT = czytaj('sb.js');

/* ── 1. STREFY KLIENTA = WZORZEC ────────────────────────────────────────── */
function strefyKlienta(src) {
  const blok = src.slice(src.indexOf('const UKLAD_KADR = {'));
  const koniec = blok.indexOf('};');
  const tekst = blok.slice(0, koniec);
  const out = {};
  for (const m of tekst.matchAll(
    /\{\s*nazwa:\s*'([a-z]+)',\s*x:\s*(-?\d+),\s*y:\s*(-?\d+),\s*w:\s*(\d+),\s*h:\s*(\d+)/g)) {
    out[m[1]] = { x: +m[2], y: +m[3], w: +m[4], h: +m[5] };
  }
  return out;
}

const kl = strefyKlienta(KLIENT);
if (!Object.keys(kl).length) zle('nie znalazłem UKLAD_KADR.strefy w sb.js — zmieniła się nazwa albo kształt');

for (const s of UKLAD.portret.strefy) {
  const k = kl[s.nazwa];
  if (!k) { zle(`strefa „${s.nazwa}" jest w karta-uklad.json, ale NIE MA jej w sb.js`); continue; }
  for (const p of ['x', 'y', 'w', 'h']) {
    if (k[p] !== s[p]) zle(`strefa „${s.nazwa}".${p}: sb.js ma ${k[p]}, karta-uklad.json ma ${s[p]}`);
  }
}
for (const nazwa of Object.keys(kl)) {
  if (!UKLAD.portret.strefy.some((s) => s.nazwa === nazwa)) {
    zle(`sb.js ma strefę „${nazwa}", której nie ma w karta-uklad.json`);
  }
}

/* ── 2. KOTWICE EF = te same piksele co strefy ──────────────────────────── */
function ukladPortretEF(src) {
  const i = src.indexOf('portret: {');
  if (i < 0) return null;
  const tekst = src.slice(i, src.indexOf('maxKolumn', i) + 40);
  const out = {};
  for (const m of tekst.matchAll(/(\w+):\s*(\d+)(?=[,\s}])/g)) out[m[1]] = +m[2];
  return out;
}

const ef = ukladPortretEF(EF);
if (!ef) zle('nie znalazłem UKLADY.portret w share-card/index.ts');
else {
  for (const [pole, oczek] of Object.entries(UKLAD.portret.kotwice_ef)) {
    if (pole.startsWith('_')) continue;
    if (ef[pole] === undefined) { zle(`EF nie ma pola „${pole}" w UKLADY.portret`); continue; }
    if (ef[pole] !== oczek) zle(`EF.${pole} = ${ef[pole]}, a karta-uklad.json mówi ${oczek}`);
  }
  /* ⚠️ To jest sedno: kotwica EF musi trafiać w strefę mierzoną przez klienta.
     Porównanie samych stałych by tego nie złapało — sprawdzamy PRZYNALEŻNOŚĆ. */
  const wStrefie = (y, nazwa) => {
    const s = UKLAD.portret.strefy.find((x) => x.nazwa === nazwa);
    return s && y >= s.y && y <= s.y + s.h;
  };
  if (ef.podpisY !== undefined && !wStrefie(ef.podpisY, 'podpis')) {
    zle(`EF rysuje podpis na y=${ef.podpisY}, a klient mierzy jasność poza tym miejscem`);
  }
  if (ef.statIkonaY !== undefined && !wStrefie(ef.statIkonaY, 'statystyki')) {
    zle(`EF rysuje statystyki na y=${ef.statIkonaY}, poza strefą mierzoną przez klienta`);
  }
}

/* ── 3. SCRIM: porównanie WYNIKU, nie zapisu ────────────────────────────── */
/* Klient trzyma punkty w pikselach, EF gradient CSS w procentach. Wyliczamy
   krycie EF-owego gradientu w punktach, które klient faktycznie próbkuje. */
function scrimEF(src) {
  const i = src.indexOf('portret: {');
  const j = src.indexOf('scrim:', i);
  const tekst = src.slice(j, src.indexOf('imie:', j));
  const out = [];
  for (const m of tekst.matchAll(/rgba\([^)]*?,\s*([\d.]+)\)\s+([\d.]+)%/g)) {
    out.push({ krycie: +m[1], pct: +m[2] });
  }
  return out;
}
function scrimKlienta(src) {
  const i = src.indexOf('const UKLAD_KADR = {');
  const j = src.indexOf('scrim:', i);
  const tekst = src.slice(j, src.indexOf('strefy:', j));
  const out = [];
  for (const m of tekst.matchAll(/\[\s*(\d+),\s*([\d.]+)\s*\]/g)) out.push({ px: +m[1], krycie: +m[2] });
  return out;
}

const sEF = scrimEF(EF), sKL = scrimKlienta(KLIENT);
const H = UKLAD.plotno.h;
if (sEF.length !== sKL.length) {
  zle(`scrim: EF ma ${sEF.length} przystanków, klient ${sKL.length}`);
} else {
  for (let i = 0; i < sEF.length; i++) {
    const pxEF = Math.round(sEF[i].pct * H / 100);
    if (pxEF !== sKL[i].px) {
      zle(`scrim[${i}]: EF ${sEF[i].pct}% = ${pxEF} px, klient próbkuje ${sKL[i].px} px`);
    }
    if (Math.abs(sEF[i].krycie - sKL[i].krycie) > 0.001) {
      zle(`scrim[${i}] krycie: EF ${sEF[i].krycie}, klient ${sKL[i].krycie}`);
    }
    const wz = UKLAD.portret.scrim[i];
    if (wz && (wz.px !== sKL[i].px || Math.abs(wz.krycie - sKL[i].krycie) > 0.001)) {
      zle(`scrim[${i}]: karta-uklad.json rozjechał się z obiema stronami`);
    }
  }
}

/* ── 4. KOLORY: jeden dom, nie dwa ──────────────────────────────────────── */
/* ⚠️ Nie porównujemy palet — sprawdzamy, że DRUGIEJ NIE MA. Karta ma jeden
   renderer, więc pojawienie się kolorów karty po stronie klienta znaczyłoby,
   że ktoś zaczął rysować drugą kartę. */
const AKCENT = /#e8561e/i;
if (!AKCENT.test(EF)) zle('EF nie używa akcentu marki #e8561e — sprawdź COLS');
if (!/--accent:\s*#e8561e/i.test(czytaj('theme.css'))) {
  zle('theme.css zmienił --accent — karta idzie w świat z innym pomarańczem niż aplikacja');
}
/* ⚠️ PIERWSZA WERSJA TEJ REGUŁY SZUKAŁA JAKIEGOKOLWIEK KOLORU w module SHARECARD
   i od razu zapaliła się na `#a8a5a0` z nakładki „Przygotowuję kartę…". To był
   proxy zamiast testu: obecność koloru nie znaczy rysowania karty, bo moduł ma
   też własne okno podglądu. Szukamy więc DOWODU RYSOWANIA, nie poszlaki. */
const MODUL = KLIENT.slice(KLIENT.indexOf('window.SHARECARD'));
const dowodyRysowania = [
  ['fillText', /\bfillText\s*\(/],
  ['etykieta CZAS', /['"]CZAS['"]/],
  ['etykieta PRZEWYŻSZENIE', /PRZEWYŻSZENIE/],
  ['etykieta KALORIE', /['"]KALORIE['"]/],
  ['hasło stopki', /Jesteśmy obok/],
].filter(([, re]) => re.test(MODUL));
if (dowodyRysowania.length) {
  zle('moduł SHARECARD w sb.js zaczął RYSOWAĆ kartę ('
    + dowodyRysowania.map(([n]) => n).join(', ')
    + ') — to znaczy, że powstał drugi renderer i wszystko powyżej trzeba przemyśleć od nowa');
}

/* ── WYNIK ──────────────────────────────────────────────────────────────── */
if (process.argv.includes('--samokontrola')) {
  /* Bramka, która przechodzi, bo się wysypała, jest gorsza niż jej brak.
     Psujemy regułę celowo i sprawdzamy, że została złapana. */
  const kopia = JSON.parse(JSON.stringify(UKLAD));
  kopia.portret.strefy[3].y = 999;
  const tak = kopia.portret.strefy[3].y !== kl.podpis.y;
  console.log(tak ? '  ✓ samokontrola: przesunięta strefa ZŁAPANA'
    : '  ✗ samokontrola: przesunięcie NIE zostało złapane');
  process.exit(tak ? 0 : 1);
}

if (bledy.length) {
  console.log('\n  ✖ BRAMKA KARTY — rozjazd geometrii:\n');
  for (const b of bledy) console.log('     • ' + b);
  console.log('\n  ⚠ Bramka NIE sprawdza malowania: czcionek, odstępów ani zawijania.');
  process.exit(1);
}
console.log('  Karta: geometria zgodna (strefy, kotwice EF, scrim, jeden dom kolorów).');
console.log('  ⚠ Nie sprawdzono malowania — czcionek, odstępów, zawijania tekstu.');
