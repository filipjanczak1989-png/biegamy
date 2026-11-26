// Blizna #385 (26.11.2026) — nowe Dziś: kadr dnia w nagłówku (plan dzis\grafiki\plan-kadr.md, commit 6).
//
// Nagłówek dostaje ramkę 184 px ze zdjęciem wybranym przez wybierzKadr (blizna-384). Trzy rzeczy pilnowane osobno:
//  (a) BEZ SKOKU UKŁADU: wysokość ramki jest stała i znana od pierwszej klatki, niezależnie od tego, czy zdjęcie
//      się wczyta, nie wczyta, czy w ogóle go nie pobieramy (brak sieci na starcie, tryb oszczędzania danych);
//  (b) DATA I POWITANIE ZAWSZE W JEDNYM WIERSZU. Zmierzone w przeglądarce 26.11: „Cześć, Aleksandra” przy 360 px
//      łamało się na dwa wiersze i wypychało datę w jasną część zdjęcia, kontrast daty spadał z 9,3:1 do 1,97:1.
//      To samo robiła długa data („poniedziałek · 30 listopada”). Dłuższy tekst dostaje mniejszą czcionkę albo
//      ciaśniejsze odstępy, w ostateczności wielokropek; wiersza drugiego nie ma nigdy;
//  (c) decyzje Filipa 26.11: przyciski zegarka i dzwonka w prawym DOLNYM rogu (w górnym zasłaniały głowę biegacza
//      na 4 z 7 kadrów), gradient 6% → 20% (42%) → 76% (64%) → 90% (kontrast daty na siedmiu kadrach min. 9,47:1).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, TERAZ, MODUL } = require('./_dzis-nowy-strona.js');

const CSS = MODUL;
const naglowek = (s) => (s.korzen.innerHTML.match(/<header[\s\S]*?<\/header>/) || [''])[0];

test('(1) ramka: stała wysokość 184 px, kolor tła kadru od pierwszej klatki, zdjęcie w dwóch rozmiarach, gradient z decyzji', () => {
  const s = strona(); s.B.start();   // czwartek 26.11.2026 12:00, bez danych pogody: jeden z trzech dziennych kadrów bez cechy pogodowej
  const h = naglowek(s), k = s.B.wybierzKadr({ teraz: new Date(TERAZ), pamiec: s.B.pamiecKadrow() });
  assert.ok(['zima-sciezka', 'zima-stadion', 'zima-bulwar'].includes(k.id));
  assert.ok(h.startsWith('<header class="dn-naglowek dn-kadr" data-kadr="' + k.id + '" style="background-color:' + k.tlo + '">'), h.slice(0, 120));
  const p = 'assets/ui/dzis/kadry/' + k.id;
  assert.ok(h.includes('<img class="dn-kadr-o" src="' + p + '-960.webp" srcset="' + p + '-960.webp 960w, ' + p + '-1280.webp 1280w" sizes="100vw" width="960" height="411" alt="" aria-hidden="true" decoding="async"'), 'jedno zdjęcie, przeglądarka wybiera 960 albo 1280 px; ozdobne (puste alt)');
  assert.equal((s.korzen.innerHTML.match(/<img class="dn-kadr-o"/g) || []).length, 1, 'jedno żądanie obrazu na wejście');
  assert.match(h, /<span class="dn-kadr-g" aria-hidden="true"><\/span><div><button type="button" class="dn-trener"/, 'kolejność: zdjęcie, gradient, potem treść');
  assert.ok(CSS.includes('#dzis-nowy .dn-naglowek.dn-kadr{position:relative;box-sizing:border-box;height:184px;margin:0 -16px 12px;padding:0 16px 14px;align-items:flex-end;overflow:hidden;border-radius:0 0 20px 20px;background-color:#1a1d22}'),
    'wysokość stała w CSS, nie z wymiarów zdjęcia; pełna szerokość ekranu; treść i przyciski przy dolnej krawędzi');
  assert.ok(CSS.includes('background:linear-gradient(180deg,rgba(6,6,8,.06) 0%,rgba(6,6,8,.2) 42%,rgba(6,6,8,.76) 64%,rgba(6,6,8,.9) 100%)'), 'gradient 6 → 20 (42%) → 76 (64%) → 90');
  assert.ok(CSS.includes('#dzis-nowy .dn-kadr-o{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:50% 30%;opacity:0;transition:opacity .2s ease-out}#dzis-nowy .dn-kadr-o.jest{opacity:1}'), 'zdjęcie nie zajmuje miejsca w układzie i wchodzi przenikaniem');
  assert.match(CSS, /prefers-reduced-motion:reduce\)\{[^@]*#dzis-nowy \.dn-kadr-o\{transition:none\}/);
  assert.match(h, /<div class="dn-akcje">/); assert.ok(h.indexOf('data-dn="powitanie"') < h.indexOf('class="dn-akcje"'), 'dla czytnika ekranu: data, powitanie, potem przyciski');
});

test('(2) trzy przypadki bez skoku: zdjęcie wczytane, niewczytane, w ogóle niepobierane; ramka i jej kolor zawsze takie same', () => {
  const zwykly = strona(); zwykly.B.start();
  const h0 = naglowek(zwykly), poczatek = h0.slice(0, h0.indexOf('>') + 1);
  assert.match(h0, / onload="this\.className='dn-kadr-o jest'" onerror="this\.remove\(\)">/, 'wczytane: pojawia się; niewczytane: znacznik znika, ramka zostaje w kolorze tła');
  assert.equal(zwykly.zgloszenia.length, 0);
  assert.doesNotMatch(MODUL, /onerror="[^"]*(zglos|_logKlienta)/, 'nieudane wczytanie kadru nie idzie do client_errors: brak sieci to nie błąd aplikacji');
  const bezSieci = strona({ online: false }); bezSieci.B.start();
  const oszcz = strona(); oszcz.w.navigator.connection = { saveData: true }; oszcz.B.start();
  for (const [opis, s] of [['brak sieci na starcie', bezSieci], ['tryb oszczędzania danych', oszcz]]) {
    const h = naglowek(s);
    assert.ok(h.startsWith(poczatek), opis + ': ta sama ramka i ten sam kolor tła');
    assert.doesNotMatch(h, /<img class="dn-kadr-o"/, opis + ': obrazu nie pobieramy');
    assert.match(h, /<span class="dn-kadr-g" aria-hidden="true"><\/span>/, opis + ': gradient zostaje, napisy mają to samo tło');
  }
  const wylaczone = strona(); wylaczone.w.navigator.connection = { saveData: false }; wylaczone.B.start(); assert.match(naglowek(wylaczone), /<img class="dn-kadr-o"/);
  // decyzja zapada raz, przed narysowaniem szkieletu: powrót sieci i dociągnięcie danych nie dokładają zdjęcia pod palcem
  bezSieci.st.online = true; bezSieci.B.start(); assert.doesNotMatch(naglowek(bezSieci), /<img class="dn-kadr-o"/);
});

test('(3) ten sam kadr przez cały pobyt na stronie i po „Spróbuj ponownie”; pamięć kadrów zapisana raz', async () => {
  const s = strona({ awaria: { athletes: 'odmowa' } }); s.B.start(); await s.doKonca();
  const przed = naglowek(s).match(/data-kadr="([a-z-]+)"/)[1];
  assert.equal(s.tel.zapisy.filter((k) => k === 'dn_kadr').length, 1);
  s.st.awaria = {}; s.dotknij('ponow'); await s.doKonca();
  assert.equal(naglowek(s).match(/data-kadr="([a-z-]+)"/)[1], przed);
  assert.equal(s.tel.zapisy.filter((k) => k === 'dn_kadr').length, 1, 'ponowne narysowanie szkieletu nie zapisuje drugi raz tego samego');
  assert.match(naglowek(s), /data-dn="powitanie">Cześć, Ola</, 'dane dochodzą do tej samej ramki');
});

test('(4) powitanie i data na kadrze zawsze w jednym wierszu: długie imię i długa data dostają mniejszą czcionkę albo ciaśniejsze odstępy', async () => {
  assert.ok(CSS.includes('#dzis-nowy .dn-kadr .dn-powitanie{line-height:34px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#dzis-nowy .dn-kadr .dn-pow-m{font-size:28px}#dzis-nowy .dn-kadr .dn-pow-s{font-size:24px}'),
    'jeden wiersz o stałej wysokości 34 px: data nad nim nigdy nie wędruje w jasną część zdjęcia');
  assert.ok(CSS.includes('#dzis-nowy .dn-kadr .dn-data{color:#f5f3ef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#dzis-nowy .dn-kadr .dn-data-m{letter-spacing:.1em}#dzis-nowy .dn-kadr .dn-data-s{letter-spacing:.02em}'));
  assert.ok(CSS.includes('#dzis-nowy .dn-kadr > div{position:relative;z-index:1;min-width:0}'), 'kolumna z tekstem może się zwęzić: przyciski nie wyjeżdżają poza ramkę');
  const klasa = (h, co) => (h.match(new RegExp('class="([^"]*)" data-dn="' + co + '"')) || [])[1];
  const imie = async (pelne) => { const s = strona({ profil: Object.assign({}, require('./_dzis-nowy-strona.js').PROFIL, { full_name: pelne }) }); s.el['topbar-name'].textContent = '—'; s.B.start(); await s.doKonca(); return s; };
  for (const [pelne, oczekiwana] of [['Ola Nowak', 'dn-powitanie'], ['Krzysztof Nowak', 'dn-powitanie dn-pow-m'], ['Aleksandra Nowak', 'dn-powitanie dn-pow-m'], ['Maksymilian Nowak', 'dn-powitanie dn-pow-m'], ['Konstantynopolitanka Nowak', 'dn-powitanie dn-pow-s']]) {
    const s = await imie(pelne);
    assert.equal(klasa(naglowek(s), 'powitanie'), 'dn-powitanie', pelne + ': w szkielecie jeszcze samo „Cześć”');
    assert.equal(s.cz('powitanie').className, oczekiwana, pelne + ' → ' + s.cz('powitanie').textContent);
  }
  // data: czwartek · 26 listopada (23 znaki) mieści się z pełnymi odstępami; dłuższe dostają ciaśniejsze
  for (const [d, oczekiwana] of [[[2026, 10, 26], 'dn-data'], [[2026, 11, 2], 'dn-data'], [[2026, 10, 30], 'dn-data dn-data-m'], [[2026, 9, 26], 'dn-data dn-data-s'], [[2026, 8, 7], 'dn-data dn-data-m']]) {
    const s = strona({ teraz: new Date(d[0], d[1], d[2], 12).getTime() }); s.B.start();
    assert.equal(klasa(naglowek(s), 'data'), oczekiwana, (naglowek(s).match(/data-dn="data">([^<]*)</) || [])[1]);
  }
  const s = strona({ teraz: new Date(2026, 10, 29, 23, 59).getTime() }); s.B.start(); await s.doKonca();
  assert.equal(s.cz('data').className, 'dn-data dn-data-m', 'odświeżenie nagłówka ustawia klasę daty od nowa (niedziela · 29 listopada: 24 znaki)');
});

test('(5) bez kadru (pusta lista albo błąd wyboru) nagłówek zostaje po staremu: bez ramki, bez zdjęcia, bez błędu', () => {
  const s = strona(); s.w.localStorage = null;
  s.B.start(); assert.match(naglowek(s), /class="dn-naglowek dn-kadr"/, 'brak pamięci telefonu nie zabiera kadru');
  const zepsuty = strona(); zepsuty.B.KADRY.length = 0; zepsuty.B.start();
  assert.ok(naglowek(zepsuty).startsWith('<header class="dn-naglowek"><div><button type="button" class="dn-trener"'), 'pusta lista kadrów: zwykły nagłówek');
  assert.equal(zepsuty.zgloszenia.length, 0);
  const smiec = strona(); smiec.B.KADRY[0] = null;   // lista uszkodzona tak, że sam wybór rzuca wyjątek
  assert.doesNotThrow(() => smiec.B.start()); assert.ok(naglowek(smiec).startsWith('<header class="dn-naglowek"><div>'), 'wyjątek w wyborze kadru nie zabiera ekranu: zwykły nagłówek');
  assert.match(smiec.korzen.innerHTML, /data-kafel="trening"/);
});
