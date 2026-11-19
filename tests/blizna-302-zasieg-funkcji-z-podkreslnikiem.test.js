/* BLIZNA 302 / 19.11: skaner zasięgu funkcji `_nazwa`. Dwa razy z jednego commitu (8e491d0b, 12.11) pomocnik trafił DO ŚRODKA innej funkcji
   (races.html: `_osobyPoId` w funkcji startowej, blizna-300; gra.html: `_dopiszImiona` w initUser, blizna-301), a wołały go funkcje na poziomie
   skryptu. Kod wyglądał poprawnie (nazwa jest w pliku), testy tekstowe przechodziły, w przeglądarce był ReferenceError.
   Test przechodzi po wszystkich stronach (*.html w korzeniu) i skryptach (js/*.mjs, js/*.js, sb.js) i dla każdego wywołania `_nazwa(` sprawdza,
   czy jakaś deklaracja tej nazwy obejmuje je zasięgiem (klamry liczone po wycięciu komentarzy, napisów i wyrażeń regularnych) albo czy nazwa jest
   globalna: na poziomie skryptów strony, w skryptach, które strona ładuje (<script src>), albo przypisana do window/self/globalThis.
   Osobno: `_nazwa(` wołane z atrybutu on…="" musi być globalne. Samokontrola (pierwsze testy) pilnuje, że skaner łapie oba błędy i nie krzyczy
   na parametry, metody, wywołania na obiekcie ani `_x(` w napisach, komentarzach i wyrażeniach regularnych. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const BS = 92;   // „\” jako kod znaku
const SLOWA_PRZED_REGEX = /(?:^|[^\w$])(return|typeof|case|in|of|new|delete|void|throw|instanceof|else|do)$/;

/** Kod z komentarzami, napisami (także tekstem szablonów, bez ${…}) i wyrażeniami regularnymi zamienionymi na spacje; pozycje i nowe linie zostają. */
function maskuj(t) {
  const o = t.split(''), n = t.length; let i = 0;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (o[k] !== '\n') o[k] = ' '; };
  function kod(stopNaKlamre) {
    let gl = 0;
    while (i < n) {
      const c = t[i], d = t[i + 1];
      if (c === '/' && d === '/') { const a = i; while (i < n && t[i] !== '\n') i++; blank(a, i); continue; }
      if (c === '/' && d === '*') { const a = i; i = t.indexOf('*/', i + 2); i = i < 0 ? n : i + 2; blank(a, i); continue; }
      if (c === '"' || c === "'") { const a = i; i++; while (i < n && t[i] !== c && t[i] !== '\n') { if (t.charCodeAt(i) === BS) i++; i++; } i++; blank(a + 1, i - 1); continue; }
      if (c === '`') { i++; let s = i; while (i < n && t[i] !== '`') { if (t.charCodeAt(i) === BS) { i += 2; continue; } if (t[i] === '$' && t[i + 1] === '{') { blank(s, i); i += 2; kod(true); s = i; continue; } i++; } blank(s, i); i++; continue; }
      if (c === '/') {
        let k = i - 1; while (k >= 0 && /\s/.test(o[k])) k--;
        const p = k >= 0 ? o[k] : '', przed = o.slice(Math.max(0, k - 12), k + 1).join('');
        if (!p || /[(,=:[!&|?{};+\-*%<>~^]/.test(p) || SLOWA_PRZED_REGEX.test(przed)) {
          const a = i; i++; let kl = false;
          while (i < n && t[i] !== '\n') { if (t.charCodeAt(i) === BS) { i += 2; continue; } if (t[i] === '[') kl = true; else if (t[i] === ']') kl = false; else if (t[i] === '/' && !kl) break; i++; }
          i++; while (i < n && /[a-z]/i.test(t[i])) i++; blank(a + 1, i - 1); continue;
        }
      }
      if (c === '{') gl++;
      if (c === '}') { if (stopNaKlamre && gl === 0) { i++; return; } gl--; }
      i++;
    }
  }
  kod(false);
  return o.join('');
}
function bloki(m) { const st = [], wy = []; for (let i = 0; i < m.length; i++) { if (m[i] === '{') st.push(i); else if (m[i] === '}' && st.length) wy.push([st.pop(), i]); } return wy; }
const RE_DEKL = /\b(?:async\s+)?function\s*\*?\s*(_[A-Za-z]\w*)\s*\(|\b(?:const|let|var)\s+(_[A-Za-z]\w*)\b|\b(?:const|let|var)\s*[{[]([^}\]=]*)[}\]]/g;
function analiza(kod) {
  const m = maskuj(kod), bl = bloki(m), dekl = [], wyw = [];
  const zasieg = (p) => { let best = null; for (const b of bl) if (b[0] < p && p < b[1] && (!best || b[0] > best[0])) best = b; return best; };
  for (const x of m.matchAll(RE_DEKL)) { const nazwy = x[1] ? [x[1]] : x[2] ? [x[2]] : (x[3] || '').match(/_[A-Za-z]\w*/g) || []; for (const nm of nazwy) dekl.push({ nm, p: x.index, z: zasieg(x.index) }); }
  for (const x of m.matchAll(/(?<![\w$.])(_[A-Za-z]\w*)\s*\(/g)) {
    const pocz = x.index;
    if (/function\s*\*?\s*$/.test(m.slice(Math.max(0, pocz - 20), pocz))) continue;                       // sama deklaracja
    let g = 0, k = pocz + x[0].length - 1; for (; k < m.length; k++) { if (m[k] === '(') g++; else if (m[k] === ')') { g--; if (g === 0) break; } }
    let j = k + 1; while (j < m.length && /\s/.test(m[j])) j++; if (m[j] === '{') continue;                   // metoda: _x(a) { … }
    const reNazwa = new RegExp(String.raw`(?:^|[^\w$])` + x[1] + String.raw`(?![\w$])`);
    const parametr = bl.filter((b) => b[0] < pocz && pocz < b[1]).some((b) => {
      let q = b[0] - 1; while (q >= 0 && /\s/.test(m[q])) q--;
      if (m.slice(q - 1, q + 1) === '=>') { q -= 2; while (q >= 0 && /\s/.test(m[q])) q--; }
      if (m[q] !== ')') return reNazwa.test(m.slice(Math.max(0, q - 60), q + 1).split(/[\s=(,]/).pop() || '');
      let g2 = 0, r = q; for (; r >= 0; r--) { if (m[r] === ')') g2++; else if (m[r] === '(') { g2--; if (g2 === 0) break; } }
      return reNazwa.test(m.slice(r, q + 1));
    });
    /* parametr strzałki bez klamer w tym samym wyrażeniu: `(_fn) => _fn()`, `l.map(_x => _x(1))` */
    const przed = m.slice(Math.max(0, pocz - 300), pocz), s = przed.lastIndexOf('=>');
    const strzalka = s >= 0 && !/[;{}]/.test(przed.slice(s)) && (() => {
      let q = s - 1; while (q >= 0 && /\s/.test(przed[q])) q--;
      if (przed[q] !== ')') return reNazwa.test(przed.slice(Math.max(0, q - 60), q + 1).split(/[^\w$]/).pop() || '');
      let g2 = 0, r = q; for (; r >= 0; r--) { if (przed[r] === ')') g2++; else if (przed[r] === '(') { g2--; if (g2 === 0) break; } }
      return reNazwa.test(przed.slice(r, q + 1));
    })();
    if (!parametr && !strzalka) wyw.push({ nm: x[1], p: pocz });
  }
  return { dekl, wyw };
}
function jednostka(nazwa, t) {
  if (!/\.html$/.test(nazwa)) return { t, kawalki: [{ od: 0, kod: t }], src: [] };
  const kawalki = [], src = [];
  for (const m of t.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const s = /\bsrc="([^"?#]+)/.exec(m[1]);
    if (s) { src.push(s[1].replace(/^\.?\//, '')); continue; }
    if (/ld\+json|importmap|text\/template/.test(m[1])) continue;
    kawalki.push({ od: m.index + m[0].indexOf('>') + 1, kod: m[2] });
  }
  return { t, kawalki, src };
}
const linia = (t, p) => t.slice(0, p).split('\n').length;

/** pliki: Map nazwa → tekst. Zwraca listę znalezisk „plik:linia  _nazwa()  RODZAJ…”. */
function skanuj(pliki) {
  const J = {}, globalne = new Set();
  for (const [n, t] of pliki) {
    const u = J[n] = jednostka(n, t.replace(/\r/g, '')); u.top = new Set();
    for (const k of u.kawalki) { k.A = analiza(k.kod); k.A.dekl.filter((d) => !d.z).forEach((d) => u.top.add(d.nm)); }
    for (const x of u.t.matchAll(/\b(?:window|self|globalThis)\s*(?:\.\s*(_[A-Za-z]\w*)|\[\s*['"](_[A-Za-z]\w*)['"]\s*\])\s*=(?!=)/g)) globalne.add(x[1] || x[2]);
  }
  const wyniki = [];
  for (const [n] of pliki) {
    const u = J[n], widoczne = new Set([...u.top, ...globalne]);
    for (const s of u.src) if (J[s]) J[s].top.forEach((nm) => widoczne.add(nm));
    for (const k of u.kawalki) for (const w of k.A.wyw) {
      if (widoczne.has(w.nm)) continue;
      if (k.A.dekl.some((d) => d.nm === w.nm && d.z && d.z[0] < w.p && w.p < d.z[1])) continue;
      const inne = u.kawalki.flatMap((kk) => kk.A.dekl.filter((d) => d.nm === w.nm).map((d) => linia(u.t, kk.od + d.p)));
      wyniki.push(n + ':' + linia(u.t, k.od + w.p) + '  ' + w.nm + '()  ' + (inne.length ? 'ZASIĘG: zadeklarowane tylko w innym zasięgu, linia ' + inne.join(', ') : 'BRAK deklaracji w pliku i w skryptach strony'));
    }
    if (/\.html$/.test(n)) for (const x of u.t.matchAll(/\bon[a-z]+=[\x5c]?["'][^"'<>]*?(?<![\w$.])(_[A-Za-z]\w*)\s*\(/g)) {
      if (!widoczne.has(x[1])) wyniki.push(n + ':' + linia(u.t, x.index) + '  ' + x[1] + '()  ON*: wołane z atrybutu, a na poziomie strony go nie ma');
    }
  }
  return [...new Set(wyniki)];
}

/* ── samokontrola: skaner łapie błąd i nie krzyczy na poprawny kod ── */
const strona = (kod, html) => new Map([['p.html', '<html><body>' + (html || '') + '<script>\n' + kod + '\n</script></body></html>']]);

test('samokontrola: deklaracja w środku funkcji startowej, wywołanie z funkcji na poziomie skryptu = ZASIĘG (wzór races.html)', () => {
  const w = skanuj(strona('(async () => {\n  async function _osoby(ids) { return ids; }\n  await _osoby([]);\n})();\nasync function laduj() {\n  return await _osoby([1]);\n}'));
  assert.equal(w.length, 1, w.join('\n')); assert.match(w[0], /^p\.html:7 {2}_osoby\(\) {2}ZASIĘG: zadeklarowane tylko w innym zasięgu, linia 3$/);
});

test('samokontrola: deklaracja w initUser, wywołanie z innej funkcji i z atrybutu onclick = ZASIĘG i ON* (wzór gra.html)', () => {
  const w = skanuj(strona('async function initUser() {\n  function _imiona(l) {}\n}\nasync function ranking() { _imiona([]); }', '<button onclick="_imiona([])">x</button>'));
  assert.equal(w.filter((x) => /ZASIĘG/.test(x)).length, 1, w.join('\n')); assert.equal(w.filter((x) => /ON\*/.test(x)).length, 1, w.join('\n'));
});

test('samokontrola: poprawny kod bez znalezisk (poziom skryptu, ten sam zasięg, parametr, metoda, obiekt, napis, komentarz, wyrażenie regularne, window._x)', () => {
  const kod = [
    'async function _osoby(ids) { return ids; }',
    'async function laduj() { return await _osoby([1]); }',
    'function f() { const _lok = () => 1; return _lok(); }',
    'function g(_cb) { return _cb(1); }',
    'const h = (_fn) => _fn(); const h2 = [1].map(_x => _x(1));',
    'const obj = { _metoda(a) { return a; } }; obj._metoda(1);',
    'const s = "nie wołaj _zNapisu(1)"; const t = `tekst _zSzablonu(1) ${_osoby([2])}`;',
    '// _zKomentarza(1)',
    '/* _zBloku(1) */',
    'const re = /_zRegexu\\(x\\)/g; const re2 = x.replace(/[(]_y(/g, "");',
    'window._globalna = function () {}; function k() { _globalna(); }',
    'function m() { if (1) { var _wBloku = 1; } }',
  ].join('\n');
  assert.deepEqual(skanuj(strona(kod, '<a onclick="_osoby([])">ok</a>')), []);
});

test('samokontrola: funkcja ze skryptu ładowanego przez stronę (<script src>) jest widoczna; z innej strony nie', () => {
  const pliki = new Map([['js/wspolne.js', 'function _wspolna() {}'], ['a.html', '<script src="js/wspolne.js"></script><script>_wspolna();</script>'],
    ['b.html', '<script>_wspolna();</script>']]);
  assert.deepEqual(skanuj(pliki), ['b.html:1  _wspolna()  BRAK deklaracji w pliku i w skryptach strony']);
});

/* ── repo ── */
test('repo: każde wywołanie `_nazwa(` w stronach i skryptach trafia w deklarację w zasięgu albo w nazwę globalną', () => {
  const nazwy = [...fs.readdirSync(KORZEN).filter((f) => /\.html$/.test(f)), ...fs.readdirSync(path.join(KORZEN, 'js')).filter((f) => /\.m?js$/.test(f)).map((f) => 'js/' + f), 'sb.js'];
  const pliki = new Map(nazwy.map((n) => [n, fs.readFileSync(path.join(KORZEN, n), 'utf8')]));
  assert.ok(pliki.size > 50 && pliki.has('races.html') && pliki.has('gra.html') && pliki.has('zawodnik.html'), 'skaner widzi strony');
  const w = skanuj(pliki);
  assert.deepEqual(w, [], 'funkcja z „_” wołana poza zasięgiem deklaracji (ReferenceError w przeglądarce, wzór blizna-300/301):\n' + w.join('\n'));
});
