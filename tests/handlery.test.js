// ─────────────────────────────────────────────────────────────────────────────
// HANDLERY W ATRYBUTACH — czy każda funkcja wołana z `onclick=` w ogóle istnieje.
//
// BLIZNA: `kalendarz.html:5855` miał `onclick="PRSclose()"`, a funkcja była
// zdefiniowana wyłącznie w `zawodnik.html`. Krzyżyk zamykający PRS nie działał
// w kalendarzu W OGÓLE. Zmierzone: 9 wystąpień u 4 osób, na czterech różnych
// silnikach, przez trzy tygodnie — zanim ktokolwiek to zgłosił.
//
// !! TEN TEST ZAMYKA KLASĘ, NIE PRZYPADEK. Skaner znalazł `PRSclose` w sekundę;
//    gdyby istniał wcześniej, znalazłby go ZANIM ktokolwiek kliknął. To jest
//    dokładnie to, o czym mówi .ai/LEKCJE.md #6: napisanie lekcji nie chroni
//    przed jej powtórzeniem — chroni test.
//
// !! DLACZEGO NIE LISTA WYJĄTKÓW Z NAZWAMI CSS. Naiwny skaner łapie `rgba(`,
//    `translateY(`, `var(` z atrybutów w rodzaju
//    `onmouseover="this.style.borderColor='rgba(...)'"`. Kuszące jest dopisanie
//    ich do listy wyjątków — i to jest maskownica: za rok lista ma dwadzieścia
//    pozycji i nikt nie zauważa, że skaner przestał cokolwiek łapać.
//    Zamiast tego rozróżniamy KONTEKST: te nazwy nie stoją w pozycji wywołania,
//    tylko WEWNĄTRZ literału przypisywanego do `this.style.*`. Wycinamy literały,
//    zostaje sam kod. Zmierzone: 19 trafień → 1, bez ani jednej nazwy z CSS.
//    Lista wyjątków zawiera WYŁĄCZNIE konstrukcje języka i globalne wbudowane,
//    a jej rozmiar jest pilnowany progiem (patrz niżej).
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');

/* WYJĄTKI: tylko to, czego stroną NIGDY nie da się zdefiniować sensownie —
   konstrukcje języka i globalne wbudowane. Zero nazw z CSS, zero nazw
   „bo akurat wpadło". */
const JEZYK = ['if', 'for', 'while', 'switch', 'return', 'typeof', 'instanceof', 'new', 'delete',
  'void', 'function', 'catch', 'do', 'else', 'try', 'throw', 'await', 'yield', 'this', 'super'];
const WBUDOWANE = ['alert', 'confirm', 'prompt', 'parseInt', 'parseFloat', 'isNaN', 'setTimeout',
  'setInterval', 'clearTimeout', 'clearInterval', 'encodeURIComponent', 'decodeURIComponent',
  'String', 'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'RegExp', 'Error',
  'Promise', 'Set', 'Map', 'fetch', 'requestAnimationFrame'];
const WYJATKI = new Set([...JEZYK, ...WBUDOWANE]);

/* !! TWARDY PRÓG. Lista wyjątków to jedyne miejsce, w którym ten test może
   przestać sprawdzać cokolwiek — i zrobi to po cichu, jedną linijką na raz.
   Próg wymusza rozmowę, zanim to się stanie: po przekroczeniu test PADA
   z komunikatem o sobie samym, a nie o kodzie strony.
   Ta sama zasada co MIN_ZRODEL w bramce RUN_TYPES. */
const PROG_WYJATKOW = 50;

const strony = () => fs.readdirSync(KORZEN).filter((f) => f.endsWith('.html'));

function definicje(tekst) {
  const s = new Set();
  for (const m of tekst.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) s.add(m[1]);
  for (const m of tekst.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) s.add(m[1]);
  for (const m of tekst.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) s.add(m[1]);
  return s;
}

/** Ciało handlera to KOD. Wycinamy literały tekstowe — z nich biorą się
 *  wszystkie fałszywe trafienia (wartości CSS). Ukośniki normalizujemy
 *  najpierw, bo handlery generowane w JS mają `\'` zamiast `'`. */
function bezLiteralow(kod) {
  return String(kod)
    /* PODSTAWIENIA SZABLONU LECĄ PIERWSZE — i to nie jest kosmetyka.
       W zawodnik.html:9870 stoi
           this.style.borderColor='${n.read?'transparent':'rgba(...)'}'
       czyli apostrofy ZAGNIEŻDŻONE w `${…}` wewnątrz apostrofów. Tego nie da
       się sparować regexpem: parowanie od lewej zostawia goły `rgba(`.
       To realna granica narzędzia, nie fałszywka do dopisania na listę.
       ⚠️ Cena: handler o nazwie branej ze zmiennej (`onclick="${fn}"`) staje się
       dla skanera niewidoczny. I tak byłby — nazwy nie ma w pliku. */
    .replace(/\$\{[^{}]*\}/g, '')
    .replace(/\\(['"])/g, '$1')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/&quot;(?:(?!&quot;)[\s\S])*&quot;/g, '');
}

/** Wszystkie identyfikatory wołane z atrybutów on* danej strony. */
function wolane(tekst) {
  const zn = new Map();
  const wzory = [/\son[a-z]+\s*=\s*"([^"]*)"/g, /\son[a-z]+\s*=\s*'([^']*)'/g];
  for (const re of wzory) {
    for (const m of tekst.matchAll(re)) {
      const kod = bezLiteralow(m[1]);
      for (const c of kod.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
        const n = c[1];
        if (WYJATKI.has(n)) continue;
        if (/[.\w$]$/.test(kod.slice(0, c.index))) continue;   // metoda po kropce
        if (!zn.has(n)) zn.set(n, m[1].replace(/\s+/g, ' ').slice(0, 70));
      }
    }
  }
  return zn;
}

function brakujace() {
  const wSb = definicje(fs.readFileSync(path.join(KORZEN, 'sb.js'), 'utf8'));
  const braki = [];
  for (const plik of strony()) {
    const t = fs.readFileSync(path.join(KORZEN, plik), 'utf8');
    const wlasne = definicje(t);
    for (const [fn, ctx] of wolane(t)) {
      if (wlasne.has(fn) || wSb.has(fn)) continue;
      braki.push({ plik, fn, ctx });
    }
  }
  return braki;
}

describe('skaner pilnuje SAM SIEBIE', () => {
  test('lista wyjątków nie urosła ponad próg', () => {
    // Gdy ten test padnie, NIE dopisuj kolejnego wyjątku. Popraw rozpoznawanie
    // kontekstu albo nazwij funkcję inaczej.
    assert.ok(WYJATKI.size <= PROG_WYJATKOW,
      `wyjątków jest za dużo (${WYJATKI.size} > ${PROG_WYJATKOW}) — skaner przestał sprawdzać`);
  });

  test('wyjątki to WYŁĄCZNIE język i wbudowane — zero nazw z CSS', () => {
    for (const zakazana of ['rgba', 'translateY', 'translateX', 'var', 'gradient', 'linear-gradient', 'calc', 'scale', 'blur', 'url']) {
      assert.equal(WYJATKI.has(zakazana), false,
        `„${zakazana}" to nazwa z CSS — jej miejsce jest w rozpoznawaniu kontekstu, nie na liście wyjątków`);
    }
  });

  test('skaner UMIE znaleźć brak — inaczej jego zieleń nic nie znaczy', () => {
    // Podstawiamy stronę, która woła funkcję nieistniejącą nigdzie.
    const udawana = '<button onclick="tegoNieMaNigdzie()">x</button>';
    const zn = wolane(udawana);
    assert.ok(zn.has('tegoNieMaNigdzie'), 'skaner nie widzi wywołania w atrybucie');
  });

  test('a jednocześnie NIE zgłasza wartości CSS', () => {
    const css = `<div onmouseover="this.style.borderColor='rgba(var(--accent-rgb),0.4)';`
      + `this.style.transform='translateY(-2px)'" onmouseout="this.style.background='linear-gradient(135deg,#000)'"></div>`;
    const zn = wolane(css);
    assert.deepEqual([...zn.keys()], [], 'wartości CSS przeciekły jako wywołania: ' + [...zn.keys()]);
  });

  test('rozpoznaje też handlery generowane w JS (ukośnik przed apostrofem)', () => {
    const gen = `el.innerHTML = "<button onclick=\\"zrobCos()\\" onmouseover=\\"this.style.color=\\'rgba(0,0,0,1)\\'\\">x</button>";`;
    const zn = wolane(gen.replace(/\\"/g, '"'));
    assert.ok(zn.has('zrobCos'));
    assert.equal(zn.has('rgba'), false);
  });
});

describe('każdy handler ma swoją funkcję', () => {
  test('zero wywołań bez definicji — w stronie albo w sb.js', () => {
    const braki = brakujace();
    const opis = braki.map((b) => `\n  ${b.plik}: ${b.fn}()  ←  ${b.ctx}`).join('');
    assert.equal(braki.length, 0,
      `${braki.length} wywołań z atrybutu on* nie ma definicji:${opis}\n`);
  });
});
