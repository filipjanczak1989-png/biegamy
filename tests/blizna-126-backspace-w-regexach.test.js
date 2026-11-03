/* BLIZNA 126 (3.11.2026): w zawodnik.html dwa regexy interwałów miały LITERALNY znak backspace (U+0008) zamiast `\b` — skrypt, który je
   kiedyś zapisał, zinterpretował „\b”. Skutek: „400 m” / „400m” w polu dystansu interwału NIE dawały tempa ani kilometrów w sumie (regex
   wymagał znaku, którego nikt nie wpisze); działały tylko gołe liczby i „km”. Poprawka: `\s*m\b`. Blizna: (1) w repo nie ma znaku U+0008
   w żadnym pliku tekstowym; (2) regex dystansu łapie „400 m”, „400m”, „1000M”, a nie „1 km”, „1km”, „5 min”. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');

test('żaden plik tekstowy repo nie zawiera znaku backspace (U+0008)', () => {
  const zle = [];
  const idz = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', 'vendor', '.git'].includes(f.name)) continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) idz(p); else if (/\.(js|mjs|ts|html|css|sql|md|json|yml|sh|py)$/.test(f.name) && !/\.min\./.test(f.name) && fs.readFileSync(p, 'utf8').includes('\u0008')) zle.push(path.relative(KORZEN, p));
  } };
  idz(KORZEN);
  assert.deepEqual(zle, [], 'backspace w: ' + zle.join(', '));
});

test('regex dystansu interwału: „400 m”/„400m” = metry, „1 km” = kilometry, „5 min” nic', () => {
  const src = fs.readFileSync(path.join(KORZEN, 'zawodnik.html'), 'utf8');
  const m = [...src.matchAll(/match\(\/\(\\d\+\(\?:\\\.\\d\+\)\?\)\\s\*m\\b\/i\)/g)];
  assert.equal(m.length, 2, 'dwa miejsca (tempo wiersza i suma) z `\\s*m\\b`');
  const re = /(\d+(?:\.\d+)?)\s*m\b/i;
  for (const [t, oczek] of [['400 m', '400'], ['400m', '400'], ['1000M', '1000'], ['1 km', null], ['1km', null], ['1.2km', null], ['5 min', null], ['400', null]]) {
    const w = t.match(re); assert.equal(w ? w[1] : null, oczek, t);
  }
});
