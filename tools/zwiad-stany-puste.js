#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ZWIAD: STANY PUSTE PRZY BRAKU SIECI (PAKA 5, 08.10.2026)
//
// Szuka w stronach zdań pustego stanu („Brak …", „Nie masz …", „Jeszcze nie…", „Dodaj pierwsz…") w
// literałach i przypisuje każde do funkcji, w której stoi. Dla funkcji sprawdza: czy czyta z Supabase
// (sb.from / .rpc / supabase.from) i czy rozpoznaje błąd SIECI (DzisOffline.czyBladSieci / bmStanOffline).
// Wiersz „loader bez obsługi sieci" = funkcja czyta z bazy, renderuje pusty stan i nie odróżnia „nie ma"
// od „nie wiem" — kandydat do poprawki. Komunikaty walidacji (alert/notify/toast/confirm) są pomijane.
//
// To heurystyka tekstowa: granice funkcji wyznacza ostatni nagłówek funkcji nad linią. Wynik
// potwierdza dynamicznie tools/smoke-offline.js SMOKE_PUSTE=1 (co człowiek WIDZI offline).
//
// Użycie: node tools/zwiad-stany-puste.js [--json] [strona.html …]
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const fs = require('fs');
const path = require('path');

const KORZEN = path.join(__dirname, '..');
const STRONY = ['nutrition.html', 'races.html', 'radio.html', 'profil.html', 'wyzwania.html', 'odznaki.html', 'compare.html', 'raporty.html', 'trener.html', 'ankieta.html'];
const L = 'A-Za-z0-9_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ';
const ZDANIE = new RegExp('(?:^|[^' + L + '])(Brak (?!połączenia)|brak (?!połączenia)|Nie masz|nie masz|Nie ma |Jeszcze nie|jeszcze nie|Jeszcze brak|Dodaj pierwsz|dodaj pierwsz|Żadn|żadn|Pusto|Nikt |nikt |Nie znaleziono|Bądź pierwsz|Nic tu|PUSTKA\\.dekoruj\\()');
const WALIDACJA = /\b(alert|confirm|prompt|notify|showToast|toast|bmToast|zglosNieudanyZapis|komunikatBledu|console\.(log|warn|error))\s*\(/;
const NAGLOWEK = /^\s*(?:async\s+)?function\s+([\w$]+)\s*\(|^\s*(?:window\.)?([\w$]+)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>)|^\s*(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>)/;
const CZYTA = /(?:^|[^\w$.])(?:_sbN|_sb|sb|supabase|window\.sb)\s*\.\s*(?:from|rpc)\s*\(|\.rpc\s*\(/;   // aliasy klienta zmierzone: sb 252, _sb 39, window.sb 7, _sbN 1
// lokalne pomocniki stron (trener/profil/nutrition) same wołają bmBladSieci — liczą się jako obsługa sieci
const SIEC = /czyBladSieci|bmStanOffline|bmOfflineGdy|bmBladSieci|_trOffline|_trenerOffline|_profilOffline|_nutWidokOffline|_nutProfilOffline|Brak połączenia/;

function zwiadStrony(plik) {
  const linie = fs.readFileSync(path.join(KORZEN, plik), 'utf8').replace(/\r/g, '').split('\n');
  const funkcje = [];                       // { nazwa, od, do }
  linie.forEach((l, i) => { const m = l.match(NAGLOWEK); if (m) funkcje.push({ nazwa: m[1] || m[2] || m[3], od: i }); });
  funkcje.forEach((f, k) => { f.do = k + 1 < funkcje.length ? funkcje[k + 1].od - 1 : linie.length - 1; });
  const wFunkcji = (i) => { let w = null; for (const f of funkcje) { if (f.od <= i) w = f; else break; } return w; };
  const wyniki = [];
  // tylko kod w blokach <script> (bez src) — znacznik HTML strony (np. opcje ankiety „Brak czasu") to nie stan pusty
  const wSkrypcie = []; let skrypt = false;
  linie.forEach((l, i) => {
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(l)) skrypt = true;
    wSkrypcie[i] = skrypt;
    if (/<\/script>/i.test(l)) skrypt = false;
  });
  linie.forEach((l, i) => {
    if (!wSkrypcie[i]) return;
    const m = l.match(ZDANIE);
    if (!m) return;
    if (WALIDACJA.test(l)) return;
    if (/^\s*(\/\/|\/\*|\*)/.test(l)) return;
    const f = wFunkcji(i);
    const cialo = f ? linie.slice(f.od, f.do + 1).join('\n') : '';
    const zdanie = (l.match(new RegExp('[>\'"`]([^<>\'"`]*' + m[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^<>\'"`]*)')) || [null, m[1]])[1].trim().slice(0, 90);
    wyniki.push({ strona: plik, funkcja: f ? f.nazwa : '(poziom pliku)', linia: i + 1, zdanie,
      czytaZBazy: CZYTA.test(cialo), obslugaSieci: SIEC.test(cialo) });
  });
  // Funkcja renderująca bez zapytania (np. renderRaces), ale WOŁANA przez loader czytający z bazy:
  // pusty stan dostaje wtedy null z błędu sieci przez loader — też kandydat. Jeden poziom wywołań.
  const ciala = new Map(funkcje.map((f) => [f.nazwa, linie.slice(f.od, f.do + 1).join('\n')]));
  for (const w of wyniki) {
    if (w.czytaZBazy) continue;
    const re = new RegExp('(^|[^\\w$.])' + w.funkcja.replace(/[$]/g, '\\$') + '\\s*\\(');
    const loadery = funkcje.filter((f) => f.nazwa !== w.funkcja && CZYTA.test(ciala.get(f.nazwa)) && re.test(ciala.get(f.nazwa)));
    if (loadery.length) {
      w.wolanyPrzez = loadery.map((f) => f.nazwa);
      w.obslugaSieci = w.obslugaSieci || loadery.some((f) => SIEC.test(ciala.get(f.nazwa)));
    }
  }
  return wyniki;
}

function zwiad(strony) {
  return (strony && strony.length ? strony : STRONY).flatMap(zwiadStrony);
}

module.exports = { zwiad, zwiadStrony, STRONY, ZDANIE };

if (require.main === module) {
  const arg = process.argv.slice(2);
  const json = arg.includes('--json');
  const w = zwiad(arg.filter((a) => a.endsWith('.html')));
  if (json) { console.log(JSON.stringify(w, null, 1)); process.exit(0); }
  const kandydaci = w.filter((x) => (x.czytaZBazy || x.wolanyPrzez) && !x.obslugaSieci);
  console.log('Zdania pustego stanu: ' + w.length + ', w funkcjach czytających z bazy lub wołanych przez loader: ' + w.filter((x) => x.czytaZBazy || x.wolanyPrzez).length + ', z tego BEZ obsługi sieci: ' + kandydaci.length);
  const perStrona = {};
  for (const x of kandydaci) (perStrona[x.strona] = perStrona[x.strona] || []).push(x);
  for (const [s, xs] of Object.entries(perStrona)) {
    console.log('\n' + s + ' (' + xs.length + ')');
    for (const x of xs) console.log('  ' + (x.funkcja + ':' + x.linia).padEnd(40) + x.zdanie + (x.wolanyPrzez ? '   ← ' + x.wolanyPrzez.join(', ') : ''));
  }
}
