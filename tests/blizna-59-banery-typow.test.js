/* BLIZNA 59 (31.10.2026, Grafiki v4 / G4): banery typów treningu typ-<slug>.jpg.

   Ryzyka:
   1) SLUG BEZ PLIKU. Mapa TRAINING_TYPE_BANNERS (sb.js) i pula `typ` generatora (tools/kadry/generuj-kadry.mjs)
      to dwie listy — typ dopisany w mapie bez obrazu w puli dawałby 404 na karcie „Dzisiejszy trening".
   2) BRAK ZAPASU. Do G4 obraz był w pliku, który istniał od miesięcy; nowy typ-*.jpg może nie dojść (offline,
      cache SW, literówka) → ma wrócić stary banner-<slug>.webp, a dopiero potem gradient.
   3) DWA OBRAZY TEGO SAMEGO TYPU. Do G4 pasek planu tygodnia miał własną mapę (typeBgMap: Interwały = zdjęcie
      Tempa, Spokojny = zdjęcie Wybiegania), a miniatura — TRAINING_TYPE_BANNERS. Teraz oba idą przez obrazTypu.
   Liczy na prawdziwym sb.js (vm); zawodnik.html sprawdzany po źródle (loadWeekPlan wymaga sesji Supabase). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const gen = fs.readFileSync(path.join(KORZEN, 'tools', 'kadry', 'generuj-kadry.mjs'), 'utf8');
const zaw = fs.readFileSync(path.join(KORZEN, 'zawodnik.html'), 'utf8');
const SLUGI_PULI = [...gen.slice(gen.indexOf('const TYPY = ['), gen.indexOf('];', gen.indexOf('const TYPY = ['))).matchAll(/slug: "([a-z]+)"/g)].map((m) => m[1]);
const TYPY_PLANU = ['Spokojny', 'Bieg spokojny', 'Interwały', 'Tempo', 'Wybieganie', 'Regeneracja', 'Wzmacniający', 'Start', 'Zastępczy', 'Odpoczynek'];

function swiat(obrazyZBledem = []) {
  const ctx = zaladujSb();
  const proby = [];
  ctx.Image = function () {
    const im = {};
    Object.defineProperty(im, 'src', { set(u) { proby.push(u); if (obrazyZBledem.some((r) => r.test(u)) && im.onerror) im.onerror(); }, get() { return ''; } });
    return im;
  };
  return { ctx, proby };
}

test('każdy slug mapy ma obraz w puli generatora i odwrotnie (9 typów)', () => {
  const { ctx } = swiat();
  const slugiMapy = [...new Set(Object.values(ctx.TRAINING_TYPE_BANNERS))].sort();
  assert.equal(SLUGI_PULI.length, 9, JSON.stringify(SLUGI_PULI));
  assert.deepEqual(slugiMapy, [...SLUGI_PULI].sort());
  for (const t of TYPY_PLANU) assert.ok(ctx.TRAINING_TYPE_BANNERS[t], `typ ${t} bez banera`);
  for (const t of TYPY_PLANU) assert.match(ctx.trainingTypeBannerUrl(t), /\/biegamy-assets\/m\/typ-[a-z]+\.webp$/, t);   // mała kopia z m/ (blizna-186)
});

test('Interwały ≠ Tempo, Spokojny ≠ Wybieganie; Bieg spokojny = Spokojny', () => {
  const { ctx } = swiat();
  const u = (t) => ctx.obrazTypu(t).u;
  assert.notEqual(u('Interwały'), u('Tempo'));
  assert.notEqual(u('Spokojny'), u('Wybieganie'));
  assert.equal(u('Bieg spokojny'), u('Spokojny'));
  assert.equal(new Set(TYPY_PLANU.map(u)).size, 9);
});

test('nieznany typ → obraz Odpoczynku (jak dotąd banner-odpoczynek jako zapas karty)', () => {
  const { ctx } = swiat();
  assert.equal(ctx.obrazTypu('Coś nowego').u, ctx.obrazTypu('Odpoczynek').u);
  assert.match(ctx.obrazTypu('Coś nowego').zapas, /banner-odpoczynek\.webp$/);
});

test('zapas: błąd typ-*.jpg → banner-<slug>.webp; błąd obu → tło końcowe', () => {
  const el = () => ({ style: {} });
  { const { ctx } = swiat(); const e = el(); assert.equal(ctx.ustawTloTypu(e, 'Tempo'), true); assert.match(e.style.backgroundImage, /m\/typ-tempo\.webp/); }
  { const { ctx } = swiat([/typ-tempo\.webp/]); const e = el(); ctx.ustawTloTypu(e, 'Tempo', 'GRADIENT'); assert.match(e.style.backgroundImage, /banner-tempo\.webp/); }
  { const { ctx } = swiat([/typ-tempo\.webp/, /banner-tempo\.webp/]); const e = el(); ctx.ustawTloTypu(e, 'Tempo', 'GRADIENT'); assert.equal(e.style.backgroundImage, 'GRADIENT'); }
});

test('zawodnik.html: pasek tygodnia i miniatura biorą obraz z obrazTypu — bez własnej mapy', () => {
  assert.ok(!/typeBgMap/.test(zaw), 'wróciła osobna mapa typeBgMap paska tygodnia');
  assert.ok(!/card-tempo\.jpg|card-wybieganie\.jpg/.test(zaw), 'stare tła card-* w zawodnik.html');
  const dzien = zaw.slice(zaw.indexOf('function _dayImgFor(type,i){'), zaw.indexOf('function _dayImgFor(type,i){') + 400);
  assert.match(dzien, /window\.obrazTypu\(type\)/, '_dayImgFor nie idzie przez obrazTypu');
  assert.match(zaw, /window\.ustawTloTypu\(tBanImg, data\.type\)/, 'miniatura „Dzisiejszy trening" nie idzie przez ustawTloTypu');
  assert.match(zaw, /data-bgzapas="\$\{_dayImgFor\(t\.type,i\)\.zapas/, 'pasek tygodnia bez zapasu banner-*.webp');
  const sonda = zaw.slice(zaw.indexOf('function _tlaZabezpiecz(root)'), zaw.indexOf('function _tlaZabezpiecz(root)') + 900);
  assert.match(sonda, /data-bgzapas/, 'sonda tła nie czyta zapasu');
});
