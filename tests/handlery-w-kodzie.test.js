// ─────────────────────────────────────────────────────────────────────────────
// DRUGA DROGA DO MARTWEGO WYWOŁANIA — wywołanie Z KODU, nie z atrybutu.
//
// BLIZNA: `kalendarz.html` wołał `showKalToast()` w dwóch miejscach
// (potwierdzenie „Screenshot przeniesiony ✓" ORAZ jego obsługa błędu), a funkcja
// nie istniała NIGDZIE w repo. Oba wywołania rzucały ReferenceError — czyli
// i sukces, i komunikat o błędzie wywalały się po cichu.
// Drugi przypadek: `trener.html` miał `function addAthlete() { addAthlete_db(); }`,
// a `addAthlete_db` nie istniał. Jego siostry `saveTr_db` i `saveSend_db`
// istnieją, więc jedna z trzech nie dojechała przy refaktorze „_db".
//
// !! SKANER ATRYBUTÓW NIE MÓGŁ ICH ZOBACZYĆ I TO JEST CAŁA TREŚĆ TEJ BLIZNY.
//    `handlery.test.js` pilnuje wyłącznie `on*="…"`. To JEDNA z dwóch dróg,
//    którymi dochodzi się do wywołania nieistniejącej funkcji. Cztery przypadki
//    tej klasy w projekcie — logAsTraining, autoLog, PRSclose, showKalToast —
//    pierwsze trzy szły przez atrybut i strażnik je łapał, czwarty przez kod
//    i przeszedł. Zieleń tamtego skanera znaczyła „w atrybutach czysto",
//    a czytana była jak „wywołania są zdrowe". To jest ta sama klasa co
//    LEKCJE #17: nazwa sugerująca gwarancję szerszą niż mechanizm.
//
// !! CZEGO TEN SKANER ŚWIADOMIE NIE SPRAWDZA — granice stoją tutaj, a nie
//    na liście wyjątków, bo lista wyjątków ukrywa granice zamiast je nazywać:
//      • wywołań konstruktorem (`new Chart(…)`) — biblioteki z CDN nie leżą
//        w repo, więc KAŻDA byłaby fałszywką. Odsiewa je reguła pozycji.
//      • nazw branych ze zmiennej (`obj[nazwa]()`) — nazwy nie ma w pliku.
//      • wywołań pod `typeof X === 'function'` — kod SAM pyta, czy funkcja
//        istnieje, więc jej brak jest obsłużony, a nie przeoczony.
//
// !! ZAMIAST LISTY WYJĄTKÓW — REGUŁA POZYCJI. Po wycięciu literałów zostaje
//    tekst, który wygląda jak wywołanie: „ŚREDNIA 7 DNI (", „Prognoza formy (",
//    „rgba(". W prawdziwym JS przed nazwą wołanej funkcji NIGDY nie stoi inne
//    słowo ani cyfra — stoi operator albo początek wyrażenia. Ta jedna reguła
//    zdjęła 7 fałszywek z 21, bez dopisywania ani jednej nazwy z CSS.
//    Zmierzone przy wprowadzeniu: 234 kandydatów → 21 → 3, z czego 2 to realne
//    braki, a 1 to `addEventListener` (globalna okna wołana bez `window.`).
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const KORZEN = path.join(__dirname, '..');
const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);
const NAZWA = '[A-Za-z_$][A-Za-z0-9_$]*';
const re = (s, f) => new RegExp(s, f === undefined ? 'g' : f);

/* Konstrukcje języka i globalne wbudowane — to samo, co w handlery.test.js,
   bo pilnują tego samego: żeby `if(`, `return (` czy `JSON.parse(` nie udawały
   wywołań naszych funkcji. */
const JEZYK = ['if', 'for', 'while', 'switch', 'return', 'typeof', 'instanceof', 'new', 'delete',
  'void', 'function', 'catch', 'do', 'else', 'try', 'throw', 'await', 'yield', 'this', 'super',
  'in', 'of', 'case', 'default', 'break', 'continue', 'const', 'let', 'var', 'class', 'finally',
  // `async () => {}` wyglada jak wywolanie funkcji o nazwie `async`. W skanerze
  // atrybutow tej konstrukcji nie ma, wiec tamta lista jej nie potrzebuje.
  'async'];
const WBUDOWANE = ['alert', 'confirm', 'prompt', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'String', 'Number', 'Boolean', 'Array',
  'Object', 'JSON', 'Math', 'Date', 'RegExp', 'Error', 'Promise', 'Set', 'Map', 'Symbol',
  'fetch', 'requestAnimationFrame', 'cancelAnimationFrame', 'structuredClone', 'atob', 'btoa',
  'getComputedStyle', 'matchMedia', 'queueMicrotask', 'eval', 'require'];

/* Globalne OKNA wołane bez `window.` — jedyna lista dla tego skanera.
   !! Osobna od WBUDOWANE i z własnym progiem, bo pilnuje czego innego:
      tamta chroni przed konstrukcjami języka, ta przed API przeglądarki.
      Zlanie ich w jedną zabrałoby obu progom sens. */
const GLOBALNE_OKNA = ['addEventListener', 'removeEventListener', 'dispatchEvent',
  'requestIdleCallback', 'scrollBy', 'scrollTo', 'getSelection', 'postMessage'];
const PROG_GLOBALNYCH = 12;

const DOZWOLONE = new Set([...JEZYK, ...WBUDOWANE, ...GLOBALNE_OKNA]);

/** Wszystko, co dany tekst DEFINIUJE. Szerzej niż skaner atrybutów, bo w ciele
 *  `<script>` żyją konstrukcje, których w atrybucie nie ma: skróty metod
 *  w obiektach i wielodeklaratorowe `const a=…, b=…` (przez nie `easeOut`
 *  i `clamp` z biegus.html wyglądały na nieistniejące). */
function definicjeKodu(t, zbior) {
  const s = zbior || new Set();
  const d = (r) => { for (const m of t.matchAll(r)) if (m[1]) s.add(m[1]); };
  d(re('function[ ]*[*]?[ ]*(' + NAZWA + ')'));
  d(re('window[.](' + NAZWA + ')[ ]*='));
  d(re('root[.](' + NAZWA + ')[ ]*='));
  d(re('class[ ]+(' + NAZWA + ')'));
  d(re('(' + NAZWA + ')[ ]*=>'));
  d(re('catch[ ]*[(][ ]*(' + NAZWA + ')'));
  d(re('(' + NAZWA + ')[ ]*:[ ]*(?:async[ ]+)?(?:function|[(])'));
  // skrót metody w obiekcie albo klasie: `nazwa(a, b) {`
  d(re('(?:^|[,{;]|async[ ]|get[ ]|set[ ]|[*])[ ]*(' + NAZWA + ')[ ]*[(][^()]{0,200}[)][ ]*[{]', 'gm'));
  const rozbij = (txt) => txt.split(',').forEach((x) => {
    const n = x.trim().split('=')[0].split(':')[0].split('...').pop().trim();
    if (re('^' + NAZWA + '$', '').test(n)) s.add(n);
  });
  for (const m of t.matchAll(re('(?:const|let|var)[ ]+([^;' + NL + ']{0,400})'))) rozbij(m[1]);
  for (const m of t.matchAll(re('[(]([^()]{0,300})[)][ ]*(?:=>|[{])'))) rozbij(m[1]);
  for (const m of t.matchAll(re('(?:const|let|var)[ ]*[{]([^}]*)[}]'))) rozbij(m[1]);
  return s;
}

/** Kod bez literałów. SZABLONY PIERWSZE — inaczej ich treść (HTML pełen
 *  nawiasów) zostaje i udaje wywołania. */
function bezLiteralowKodu(kod) {
  let s = String(kod).replace(re('/[*][^]*?[*]/'), ' ');
  s = s.split(NL).map((l) => {
    const i = l.indexOf('//');
    if (i < 0) return l;
    if (i > 0 && (l[i - 1] === ':' || l[i - 1] === BS)) return l;   // http:// i ucieczka
    const przed = l.slice(0, i);
    // `//` wewnątrz literału to nie komentarz — nieparzysta liczba cudzysłowów
    // przed nim znaczy, że jesteśmy w środku napisu.
    if (przed.split("'").length % 2 === 0) return l;
    if (przed.split('"').length % 2 === 0) return l;
    return przed;
  }).join(NL);
  s = s.replace(re('`[^`]*`'), '``');
  s = s.replace(re('[$][{][^{}]*[}]'), '');
  s = s.replace(re(BS + BS + '(.)'), '$1');
  s = s.replace(re("'[^'" + NL + "]*'"), "''");
  s = s.replace(re('"[^"' + NL + ']*"'), '""');
  return s;
}

/** Identyfikatory wołane W CIELE `<script>` danej strony. */
function wolaneWKodzie(tekst) {
  const zn = new Map();
  for (const b of tekst.matchAll(re('<script(?![^>]*[ ]src=)[^>]*>([^]*?)</script>'))) {
    const kod = bezLiteralowKodu(b[1]);
    for (const c of kod.matchAll(re('(' + NAZWA + ')[ ]*[(]'))) {
      const n = c[1];
      if (DOZWOLONE.has(n)) continue;
      if (tekst.includes('typeof ' + n)) continue;          // jawna obsługa nieobecności
      const przed = kod.slice(0, c.index).replace(re('[ ]+$'), '');
      // REGUŁA POZYCJI — patrz nagłówek pliku. Odsiewa też `new Foo(`.
      if (przed && re('[A-Za-z0-9_$.' + "'" + '"`]$', '').test(przed.slice(-1))) continue;
      if (!zn.has(n)) {
        zn.set(n, kod.slice(Math.max(0, c.index - 60), c.index + 20).split(NL).join(' ').trim());
      }
    }
  }
  return zn;
}

/** Strony ŚLEDZONE przez gita. Backupy (`biegus-v144-backup.html`) leżą obok
 *  w katalogu i nie są kodem projektu — bez tego filtra skaner zgłasza 200
 *  fałszywek z pliku, którego nikt nie wdraża. */
function stronySledzone() {
  return execSync('git ls-files "*.html"', { cwd: KORZEN }).toString()
    .split(NL).map((x) => x.trim()).filter((x) => x && !x.includes('/'));
}

function brakujaceWKodzie() {
  const globalne = new Set();
  definicjeKodu(fs.readFileSync(path.join(KORZEN, 'sb.js'), 'utf8'), globalne);
  for (const f of fs.readdirSync(path.join(KORZEN, 'js')).filter((x) => x.endsWith('.js'))) {
    definicjeKodu(fs.readFileSync(path.join(KORZEN, 'js', f), 'utf8'), globalne);
  }
  const braki = [];
  for (const plik of stronySledzone()) {
    const t = fs.readFileSync(path.join(KORZEN, plik), 'utf8');
    const wlasne = definicjeKodu(t);
    for (const [fn, ctx] of wolaneWKodzie(t)) {
      if (wlasne.has(fn) || globalne.has(fn)) continue;
      braki.push({ plik, fn, ctx });
    }
  }
  return braki;
}

describe('skaner KODU pilnuje SAM SIEBIE', () => {
  test('lista globalnych okna nie urosła ponad próg', () => {
    // Gdy ten test padnie, NIE dopisuj kolejnej nazwy. Popraw rozpoznawanie
    // kontekstu — tak jak zrobiła to reguła pozycji.
    assert.ok(GLOBALNE_OKNA.length <= PROG_GLOBALNYCH,
      'globalnych jest za duzo (' + GLOBALNE_OKNA.length + ' > ' + PROG_GLOBALNYCH
      + ') — skaner przestal sprawdzac');
  });

  test('lista zawiera WYŁĄCZNIE API przeglądarki — zero nazw z projektu', () => {
    for (const n of GLOBALNE_OKNA) {
      assert.ok(re('^(?:add|remove|dispatch|request|scroll|get|post)', '').test(n),
        '„' + n + '" nie wyglada na API przegladarki — jego miejsce jest w kodzie, nie na liscie');
    }
  });

  test('skaner UMIE znaleźć brak w KODZIE — inaczej jego zieleń nic nie znaczy', () => {
    const udawana = '<script>function a(){ tegoNieMaWKodzie(); }</script>';
    assert.ok(wolaneWKodzie(udawana).has('tegoNieMaWKodzie'),
      'skaner nie widzi wywolania w ciele <script>');
  });

  test('…i łapie DOKŁADNIE ten kształt, który go ominął (showKalToast)', () => {
    const jakBylo = '<script>document.getElementById("x")?.remove();'
      + ' showKalToast("Screenshot przeniesiony");</script>';
    assert.ok(wolaneWKodzie(jakBylo).has('showKalToast'),
      'blizna nie jest przypieta — ten sam ksztalt znowu by przeszedl');
  });

  test('…a NIE zgłasza tekstu, który przetrwał wycinanie literałów', () => {
    const szum = '<script>el.innerHTML = `<div>ŚREDNIA 7 DNI (x)</div>'
      + '<div>Prognoza formy (TSB)</div>`;</script>';
    assert.deepEqual([...wolaneWKodzie(szum).keys()], [],
      'tekst przeciekl jako wywolanie: ' + [...wolaneWKodzie(szum).keys()]);
  });

  test('…ani metody zapisanej skrótem, ani drugiej nazwy z `const a=…, b=…`', () => {
    const s = definicjeKodu('const lerp=(a,b)=>a, easeOut=k=>k, clamp=(v)=>v;'
      + NL + 'const O={ graj(i){ return i; } };');
    for (const n of ['lerp', 'easeOut', 'clamp', 'graj']) {
      assert.ok(s.has(n), 'definicja „' + n + '" nierozpoznana — skaner zglosilby ja jako brak');
    }
  });
});

describe('każde wywołanie w kodzie ma swoją funkcję', () => {
  test('zero wywołań bez definicji — w stronie, w sb.js albo w js/', () => {
    const braki = brakujaceWKodzie();
    const opis = braki.map((b) => NL + '  ' + b.plik + ': ' + b.fn + '()  ←  ' + b.ctx).join('');
    assert.equal(braki.length, 0,
      braki.length + ' wywolan z kodu nie ma definicji:' + opis + NL);
  });
});
