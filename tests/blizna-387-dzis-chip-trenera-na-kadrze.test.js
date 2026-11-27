// Blizna #387 (26.11.2026) — nowe Dziś: chip „← Trener” wisiał na środku zdjęcia w nagłówku.
//
// Chip (powrót do panelu trenera w podglądzie konta zawodnika) stoi w kolumnie tekstu nad datą. Bez zdjęcia to
// dobre miejsce. Po wejściu kadru (blizna-385) kolumna tekstu leży na dole ramki, więc chip wypadł w połowie
// wysokości zdjęcia, pomarańczowy i półprzezroczysty, na twarzy albo niebie. Filip zobaczył to na swoim koncie.
// Decyzja 26.11: na zdjęciu chip stoi w LEWYM GÓRNYM rogu ramki, w ciemnej pigułce jak przyciski, i nie zasłania
// daty. Druga decyzja tego samego dnia: ZAWSZE w tym rogu, także w ramce bez zdjęcia (tryb oszczędzania danych,
// brak sieci), żeby chip nie zmieniał miejsca zależnie od sieci. Nad datą zostaje tylko w nagłówku bez ramki.
// Położenie zmierzone w przeglądarce (360 i 390 px): chip 10–54 px od góry ramki, data od 119 px.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, MODUL } = require('./_dzis-nowy-strona.js');

const naglowek = (s) => (s.korzen.innerHTML.match(/<header[\s\S]*?<\/header>/) || [''])[0];
// od blizna-413 (paczka I2): wygląd chipu (48 px, obwódka i tło jak kółka zegarka i dzwonka) w regule ogólnej, na kadrze samo położenie
const REGULA = '#dzis-nowy .dn-kadr .dn-trener{position:absolute;left:0;bottom:112px;margin:0;white-space:nowrap}';

test('(1) w ramce kadru: lewy górny róg, ciemna pigułka jak przyciski, cel dotyku 44 px; położenie nie zależy od długości imienia ani daty', () => {
  assert.ok(MODUL.includes(REGULA), 'reguła chipu na kadrze');
  // ramka 184 px, odstęp dolny 14 px, dół kolumny tekstu na 170 px: bottom 112 px + wysokość 48 px = góra chipu 10 px od góry ramki (jak przed blizna-413)
  assert.equal(184 - 14 - 112 - 48, 10);
  assert.ok(MODUL.includes('#dzis-nowy .dn-trener{display:inline-flex;align-items:center;box-sizing:border-box;min-height:48px;'), 'chip 48 px, jak kółka');
  assert.ok(MODUL.includes('height:184px;margin:0 -16px 12px;padding:0 16px 14px;align-items:flex-end;'), 'liczby, z których wynika położenie chipu');
  const wyglad = 'border:1px solid rgba(255,255,255,.08);background:rgba(23,22,27,.62);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#f5f3ef;';
  assert.ok(MODUL.includes('#dzis-nowy .dn-akcje .dn-okr,#dzis-nowy .dn-zegarek .wc-badge{width:48px;height:48px;box-sizing:border-box;border-radius:50%;' + wyglad), 'kółka zegarka i dzwonka');
  assert.ok(MODUL.includes('border-radius:24px;' + wyglad), 'chip: ta sama obwódka, tło i kolor co kółka (od blizna-413)');
  assert.ok(MODUL.includes('#dzis-nowy .dn-kadr .dn-powitanie{line-height:34px;white-space:nowrap;'), 'kolumna tekstu ma stałą wysokość (blizna-385), więc chip liczony od jej dołu stoi zawsze w tym samym miejscu');
});

test('(2) kolejność w dokumencie bez zmian: chip jest pierwszy w kolumnie tekstu (czytnik ekranu i klawiatura: Trener, data, powitanie, przyciski)', () => {
  const s = strona(); s.B.start();
  assert.match(naglowek(s), /<span class="dn-kadr-g" aria-hidden="true"><\/span><div><button type="button" class="dn-trener" data-dn="trener" hidden>← Trener<\/button><div class="dn-data/);
  assert.ok(MODUL.includes('#dzis-nowy .dn-kadr > div{position:relative;z-index:1;min-width:0}'), 'chip pozycjonowany względem kolumny tekstu, nad zdjęciem i gradientem');
});

test('(3) ramka bez zdjęcia: ten sam róg co ze zdjęciem (jedno miejsce zawsze); nad datą chip zostaje tylko w nagłówku bez ramki', () => {
  const zwykly = strona(); zwykly.B.start();
  const poczatek = naglowek(zwykly).slice(0, naglowek(zwykly).indexOf('>') + 1);
  assert.match(poczatek, /^<header class="dn-naglowek dn-kadr" data-kadr=/);
  const oszcz = strona(); oszcz.w.navigator.connection = { saveData: true }; oszcz.B.start();
  const bezSieci = strona({ online: false }); bezSieci.B.start();
  for (const [opis, s] of [['tryb oszczędzania danych', oszcz], ['brak sieci na starcie', bezSieci]]) {
    assert.ok(naglowek(s).startsWith(poczatek), opis + ': ta sama ramka i te same klasy co ze zdjęciem, więc ta sama reguła chipu');
    assert.doesNotMatch(naglowek(s), /<img class="dn-kadr-o"/, opis);
  }
  const bezKadru = strona(); bezKadru.B.KADRY.length = 0; bezKadru.B.start();
  assert.match(naglowek(bezKadru), /^<header class="dn-naglowek"><div><button type="button" class="dn-trener"/);
  assert.equal((MODUL.match(/\.dn-trener\{/g) || []).length, 3, 'trzy reguły chipu: zwykła, położenie w ramce kadru i pełne tło bez backdrop-filter (od blizna-413)');
  assert.doesNotMatch(MODUL, /dn-kadr-pusty|\.dn-kadr:not\(/, 'żadnego wyjątku dla ramki bez zdjęcia');
  assert.match(MODUL, /#dzis-nowy \.dn-trener\{display:inline-flex;align-items:center;box-sizing:border-box;min-height:48px;margin:0 0 8px;/, 'zwykły chip: odstęp nad datą jak dotąd, wygląd kółek od blizna-413 (wcześniej 32 px w pomarańczowej ramce)');
});

test('(4) chip dalej działa po staremu: widać go tylko, gdy stary kod odsłonił swój; dotknięcie klika stary odnośnik', async () => {
  const s = strona(); let klik = 0;
  s.el['back-to-trener'] = { style: { display: 'inline-flex' }, click() { klik++; } };
  s.B.start(); await s.doKonca();
  assert.equal(s.cz('trener').hidden, false);
  s.dotknij('trener'); assert.equal(klik, 1);
  const bez = strona(); bez.B.start(); await bez.doKonca();
  assert.equal(bez.cz('trener').hidden !== false, true, 'zwykłe wejście zawodnika: chipu nie ma');
});
