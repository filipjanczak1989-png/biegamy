/* BLIZNA 288 / 18.11: zimowy baner nagłówka bieg.html (ilustracja W2 z Gemini, wybór Filipa): ośnieżona uliczka, biegacze w czapkach Mikołaja, bez napisów i bramy START·META.
   - plik assets/bieg/bieg-baner-zima.webp: WebP 1600×500, < 150 KB;
   - tło .bw-hero (dekoracja, bez <img> i alt): cover, środek w poziomie; telefon 150 px wysokości, od 900 px proporcja 16:5;
   - przycisk „‹ Ulica akcji” zostaje jedynym elementem nagłówka; jesienna scena nie wraca (blizna-283). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const h = fs.readFileSync(path.join(KORZEN, 'bieg.html'), 'utf8').replace(/\r/g, '');

test('plik banera: WebP 1600×500, poniżej 150 KB', () => {
  const b = fs.readFileSync(path.join(KORZEN, 'assets/bieg/bieg-baner-zima.webp'));
  assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.toString('ascii', 8, 12), 'WEBP');
  assert.ok(b.length < 150 * 1000, 'rozmiar ' + b.length + ' B');
  const typ = b.toString('ascii', 12, 16);
  let w, wys;
  if (typ === 'VP8X') { w = 1 + b.readUIntLE(24, 3); wys = 1 + b.readUIntLE(27, 3); }
  else if (typ === 'VP8 ') { w = b.readUInt16LE(26) & 0x3fff; wys = b.readUInt16LE(28) & 0x3fff; }
  else if (typ === 'VP8L') { const x = b.readUInt32LE(21); w = (x & 0x3fff) + 1; wys = ((x >> 14) & 0x3fff) + 1; }
  assert.deepEqual([w, wys], [1600, 500]);
});

test('CSS nagłówka: tło z banera, cover, telefon 150 px, szeroki ekran 16:5', () => {
  assert.match(h, /\.bw-hero \{ position: relative; margin: 0 -12px; height: 150px; background: var\(--karta\) url\(assets\/bieg\/bieg-baner-zima\.webp\) 50% 60% \/ cover no-repeat;/);
  assert.match(h, /@media \(min-width: 900px\) \{[^\n]*\.bw-hero \{ height: auto; aspect-ratio: 16 \/ 5; border-radius: 0 0 22px 22px; \}/);
  const hero = (/<div class="bw-hero">([\s\S]*?)<\/div>/.exec(h) || [])[1];
  assert.equal(hero, '<a class="bw-wroc" id="bw-wroc" href="dla-fabianka.html">‹ Ulica akcji</a>', 'baner jako tło, w nagłówku tylko powrót');
});
