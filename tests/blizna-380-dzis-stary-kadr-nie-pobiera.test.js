// Blizna #380 (26.11.2026) — stary kadr dnia nie pobiera się, gdy stare Dziś jest schowane pod nowym.
//
// Stare Dziś chowa wyłącznie CSS (html.dzis-nowy.dzis-gotowy), a _heroInit robił new Image() bez sprawdzenia, czy kafel widać:
// konto z nowym Dziś pobierało przy każdym wejściu kadr, którego nie ogląda (średnio 275 kB z biegamy-assets, a w dniu startu
// okładkę biegu z Supabase). Teraz kadr czeka, dopóki stare Dziś jest schowane, i rusza przy KAŻDYM powrocie starego ekranu:
//   (1) ?dzis=stary albo konto bez przełącznika: klas nie ma od początku;
//   (2) podgląd trenera, #sponsor, #log-list: moduł ustępuje (BM_DZIS.ustepuje() coś zwraca), dzis-gotowy nie powstaje;
//   (3) konto bez wiersza zawodnika albo awaria modułu: stop() zdejmuje dzis-gotowy;
//   (4) brak modułu albo odpowiedź „stary”: blok DZIS-E0 1 zdejmuje dzis-nowy.
// Gdyby warunek był zły, stare Dziś zostałoby z pustym kaflem kadru: dlatego każdy powrót ma własny test.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ZAW = fs.readFileSync(path.join(__dirname, '..', 'zawodnik.html'), 'utf8').replace(/\r/g, '');
function wytnij(od, doK, co) {
  const a = ZAW.indexOf(od), b = ZAW.indexOf(doK, a);
  assert.ok(a > 0 && b > a, 'brak bloku: ' + co);
  return ZAW.slice(a, b);
}
const POKAZ = wytnij('let _heroAktywna = null;', '// Confetti kadru 6', '_heroShow');
const RESZTA = wytnij('function _heroZabezpiecz(bg, url) {', '/* GESTY HERO', '_heroZabezpiecz … zapasowe wywołania _heroInit');
const KADR = 'https://zasoby.test/kadr-07.jpg', OKLADKA = 'https://magazyn.test/okladka.jpg';

/** Strona w pigułce: klasy na <html>, dwa elementy kadru, licznik pobrań (Image), zegar pod kontrolą testu, obserwator klas. */
function strona(klasy, opcje) {
  opcje = opcje || {};
  const zestaw = new Set(klasy || []), pobrane = [], obserwatorzy = [], zegar = { t: 0, kolejka: [], nr: 0 };
  const el = (id) => ({ id, style: {}, offsetWidth: 0, classList: { add() {}, remove() {} } });
  const elementy = { 'today-hero-bg': el('today-hero-bg'), 'today-hero-bg2': el('today-hero-bg2') };
  const document = { readyState: 'complete', addEventListener() {}, getElementById: (id) => elementy[id] || null,
    documentElement: { classList: { contains: (k) => zestaw.has(k) } } };
  const window = { CYTAT: null };
  if (opcje.modul) window.BM_DZIS = opcje.modul;
  class Image { set src(u) { pobrane.push(u); } }
  class MutationObserver { constructor(f) { this.f = f; } observe(cel, o) { obserwatorzy.push({ f: this.f, cel, o }); } }
  const setTimeout = (f, ms) => { zegar.kolejka.push({ f, kiedy: zegar.t + (ms || 0), nr: ++zegar.nr }); return zegar.nr; };
  const clearTimeout = (nr) => { zegar.kolejka = zegar.kolejka.filter((x) => x.nr !== nr); };
  const DzisOffline = { userId: () => Promise.resolve(null), odczytaj: () => null, zapisz() {}, HERO_DOMYSLNY: 'domyslny.webp' };
  const karty = [KADR], cytaty = ['podpis'];
  const f = new Function('document', 'window', 'Image', 'MutationObserver', 'setTimeout', 'clearTimeout', 'console', 'DzisOffline', 'sb', '_heroCards', '_heroQuotes',
    'let _heroIdx = 0, _heroTimer = null; const _athleteId = null;\n' + POKAZ + '\n' + RESZTA +
    '\nreturn { init: _heroInit, pokaz: _heroShow, stan: function () { return { wystartowal: _heroWystartowal, odlozony: _heroOdlozony }; } };');
  const kod = f(document, window, Image, MutationObserver, setTimeout, clearTimeout, { warn() {}, log() {} }, DzisOffline, {}, karty, cytaty);
  return {
    kod, pobrane, karty, window, obserwatorzy,
    /** Zmiana klas na <html> tak, jak widzi ją przeglądarka: najpierw klasa, potem obserwatorzy. */
    klasy(dodaj, zdejmij) { (zdejmij || []).forEach((k) => zestaw.delete(k)); (dodaj || []).forEach((k) => zestaw.add(k)); obserwatorzy.forEach((o) => o.f([])); },
    /** Przesuwa zegar o ms i wykonuje zaplanowane wywołania w kolejności czasu (także te dopisane po drodze). */
    async czas(ms) {
      const koniec = zegar.t + ms;
      for (;;) {
        const nast = zegar.kolejka.filter((x) => x.kiedy <= koniec).sort((a, b) => a.kiedy - b.kiedy || a.nr - b.nr)[0];
        if (!nast) break;
        zegar.kolejka = zegar.kolejka.filter((x) => x !== nast); zegar.t = nast.kiedy; nast.f();
        await Promise.resolve(); await Promise.resolve();
      }
      zegar.t = koniec; await Promise.resolve(); await Promise.resolve();
    },
    ileKadru() { return pobrane.filter((u) => u === KADR).length; },
  };
}
const NOWE = ['dzis-nowy', 'dzis-gotowy', 'dzis-na-dzis'];

test('(1) konto bez przełącznika i ?dzis=stary (klas nie ma): kadr rusza od razu, jak przed zmianą', async () => {
  const s = strona([]);
  s.kod.init();
  assert.equal(s.pobrane[0], KADR, 'pierwsze wywołanie _heroInit pobiera kadr bez czekania');
  assert.equal(s.kod.stan().wystartowal, true);
  await s.czas(5000);
  assert.ok(s.ileKadru() <= 2, 'jedno pobranie kadru i jedna sonda offline, bez powtórek: ' + s.ileKadru());
  const ile = s.pobrane.length;
  s.klasy(['inna-klasa'], []); s.klasy([], ['inna-klasa']);   // np. zmiana motywu: kadr, który nie był odłożony, nie pobiera się drugi raz
  await s.czas(1000);
  assert.equal(s.pobrane.length, ile, 'zmiana klas na <html> po zwykłym starcie niczego nie pobiera');
});

test('(2) nowe Dziś na ekranie: zero pobrań, także po zapasowych wywołaniach, okładce startu i zmianie sekcji', async () => {
  const s = strona(NOWE);
  s.kod.init();
  await s.czas(600);                       // zapasowe _heroInit po 500 ms
  s.kod.pokaz(0, { url: OKLADKA, podpis: 'Dziś *startujesz*' });   // tak woła _okladkaStartu w dniu startu
  s.klasy([], ['dzis-na-dzis']);           // przejście na inną sekcję: stare Dziś dalej schowane
  s.klasy(['dzis-na-dzis'], []);
  await s.czas(20000);
  assert.deepEqual(s.pobrane, [], 'schowane stare Dziś nie pobiera niczego');
  assert.deepEqual(s.kod.stan(), { wystartowal: false, odlozony: true });
});

test('(3) powrót: moduł ustępuje (podgląd trenera, #sponsor, #log-list): kadr rusza od razu', async () => {
  for (const powod of ['trener', 'sponsor', 'historia']) {
    const s = strona(['dzis-nowy'], { modul: { ustepuje: () => powod } });
    s.kod.init();
    assert.equal(s.pobrane[0], KADR, powod + ': moduł już wie, że ustępuje, więc bez czekania');
  }
});

test('(4) powrót: moduł dochodzi po _heroInit i ustępuje: kadr rusza przy najbliższym sprawdzeniu, nie po 3 s', async () => {
  const s = strona(['dzis-nowy']);
  s.kod.init();
  assert.deepEqual(s.pobrane, [], 'przełącznik włączony, moduł jeszcze nie zdecydował: czekamy');
  await s.czas(200);
  s.window.BM_DZIS = { ustepuje: () => 'sponsor' };
  await s.czas(400);
  assert.equal(s.pobrane[0], KADR);
});

test('(5) powrót: konto bez wiersza zawodnika albo awaria modułu (stop() zdejmuje dzis-gotowy): kadr rusza natychmiast', async () => {
  const s = strona(NOWE, { modul: { ustepuje: () => '' } });
  s.kod.init();
  await s.czas(2000);
  assert.deepEqual(s.pobrane, []);
  s.klasy([], ['dzis-gotowy', 'dzis-na-dzis']);   // BM_DZIS.stop(): dzis-nowy zostaje
  assert.equal(s.pobrane[0], KADR, 'nowy ekran już raz stał, więc to nie „moduł w drodze”: bez czekania');
  await s.czas(5000);
  assert.ok(s.ileKadru() <= 2, 'bez powtórek po powrocie: ' + s.ileKadru());
  const ile = s.pobrane.length;
  s.klasy(['inna-klasa'], []); s.klasy([], ['inna-klasa']);
  await s.czas(1000);
  assert.equal(s.pobrane.length, ile, 'po powrocie kadr jest wystartowany, kolejne zmiany klas niczego nie pobierają');
  assert.deepEqual(s.kod.stan(), { wystartowal: true, odlozony: false });
});

test('(6) powrót: brak modułu albo odpowiedź „stary” (blok DZIS-E0 1 zdejmuje dzis-nowy): kadr rusza natychmiast', async () => {
  const s = strona(['dzis-nowy']);
  s.kod.init();
  await s.czas(1000);
  assert.deepEqual(s.pobrane, [], 'do decyzji bloku przełącznika nic się nie pobiera');
  s.klasy([], ['dzis-nowy']);
  assert.equal(s.pobrane[0], KADR);
  const t = strona(NOWE);                  // nowy ekran stał, baza odpowiada „stary”: wylacz() zdejmuje dzis-nowy i woła stop()
  t.kod.init();
  t.klasy([], ['dzis-nowy']); t.klasy([], ['dzis-gotowy', 'dzis-na-dzis']);
  assert.equal(t.pobrane[0], KADR);
  assert.ok(t.ileKadru() <= 2);
});

test('(7) moduł nigdy nie zdecyduje (klasa dzis-nowy wisi bez dzis-gotowy): kadr rusza po limicie modułu, nie zostaje pusty', async () => {
  const s = strona(['dzis-nowy']);
  s.kod.init();
  await s.czas(2900);
  assert.deepEqual(s.pobrane, [], 'przez 3 s modułu jeszcze czekamy');
  await s.czas(1500);
  assert.equal(s.pobrane[0], KADR, 'po limicie kadr rusza jak przed zmianą');
  await s.czas(10000);
  assert.ok(s.ileKadru() <= 2, 'czekanie się kończy, bez pętli: ' + s.ileKadru());
});

test('(8) nowy ekran pokazuje się w trakcie czekania: kadr nie rusza po czasie', async () => {
  const s = strona(['dzis-nowy'], { modul: { ustepuje: () => '' } });
  s.kod.init();
  await s.czas(400);
  s.klasy(['dzis-gotowy', 'dzis-na-dzis'], []);
  await s.czas(20000);
  assert.deepEqual(s.pobrane, []);
});

test('(9) okładka startu odłożona pod nowym ekranem pokazuje się po powrocie starego', async () => {
  const s = strona([]);
  s.kod.init();                            // wolny moduł: stary kadr zdążył ruszyć
  const przed = s.pobrane.length;
  s.klasy(NOWE, []);
  s.karty[0] = OKLADKA;                    // _okladkaStartu podmienia listę kadrów i woła _heroShow
  s.kod.pokaz(0, { url: OKLADKA, podpis: 'x' });
  assert.equal(s.pobrane.length, przed, 'okładka nie pobiera się pod nowym ekranem');
  s.klasy([], ['dzis-gotowy', 'dzis-na-dzis']);
  assert.equal(s.pobrane[s.pobrane.length - 1], OKLADKA, 'po powrocie stary ekran dostaje okładkę');
  assert.equal(s.pobrane.length, przed + 1);
  s.klasy(['inna-klasa'], []); s.klasy([], ['inna-klasa']);
  assert.equal(s.pobrane.length, przed + 1, 'okładka pobiera się raz, nie przy każdej zmianie klas');
});

test('(10) źródło: bramka stoi przed new Image, obserwator patrzy tylko na klasy <html>, limit czekania to 12 prób co 300 ms', () => {
  const bramka = POKAZ.indexOf('if (_heroStareSchowane())'), obraz = POKAZ.indexOf('new Image()');
  assert.ok(bramka > 0 && bramka < obraz, '_heroShow sprawdza schowanie przed utworzeniem obrazu');
  const s = strona([]);
  assert.equal(s.obserwatorzy.length, 1);
  assert.deepEqual(s.obserwatorzy[0].o, { attributes: true, attributeFilter: ['class'] });
  assert.match(RESZTA, /_heroProby >= 12/);
  assert.match(RESZTA, /setTimeout\(\(\) => \{ _heroCzeka = null; _heroWroc\(\); \}, 300\)/);
  assert.match(RESZTA, /c\.contains\('dzis-nowy'\) && c\.contains\('dzis-gotowy'\)/, 'ten sam warunek co CSS, który chowa stare Dziś');
  assert.match(ZAW, /html\.dzis-nowy\.dzis-gotowy body > #home-tiles-row/, 'CSS bloku DZIS-E0 2 dalej chowa kafel kadru tymi dwiema klasami');
});
