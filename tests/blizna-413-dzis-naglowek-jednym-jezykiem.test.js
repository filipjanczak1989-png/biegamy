// Blizna #413 (27.11.2026) — nowe Dziś, paczka I2: nagłówek jednym językiem ze skrótami (I1, blizna-412).
//
// Dzwonek w nagłówku był ostatnim kolorowym obrazkiem (dzwonek-64.webp, 3,4 kB, jedyne pobranie ikony na pierwszym ekranie).
// Teraz to inline SVG „bell” z Lucide 1.72.0 (ISC; nie ma go na liście ikon z Feathera), w tym samym kółku co plakietka zegarka.
// Zegarek rysuje sb.js (WATCH.render 'badge', własny CSS: 40 px, w stanie „ok” przezroczystość .55 i szara ikona), więc moduł
// nadpisuje go pod #dzis-nowy (selektor z id wygrywa z klasami sb.js), bez dotykania sb.js. Chip „← Trener” dostał ten sam język.
// Kontrast zmierzony na prawdziwej stronie (7 kadrów zimowych × 390 i 360 px, zrzuty z kółkami bez treści): ikony ≥ 14,8:1,
// napis chipu ≥ 6,8:1 przy najjaśniejszym pikselu pod chipem; stara szara ikona zegarka w stanie „ok” miała ok. 2:1.
// Pliki dzwonek-64/128.webp zostają w repo (decyzja Filipa: nie kasujemy; blizna-356 pilnuje, że są).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, czytaj, MODUL } = require('./_dzis-nowy-strona.js');

const KLIENT = czytaj('s' + 'b.js');
const KOD = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const GLOWA = '<svg class="dn-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
const BELL = '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>';   // lucide-static@1.72.0 icons/bell.svg
const WYGLAD = 'border:1px solid rgba(255,255,255,.08);background:rgba(23,22,27,.62);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#f5f3ef;';

test('(1) dzwonek = inline SVG bell z Lucide 1.72.0; licznik w tym samym przycisku; na ekranie żadnego obrazka poza zdjęciem kadru', () => {
  const s = strona(); s.B.start();
  const h = /<header[\s\S]*?<\/header>/.exec(s.korzen.innerHTML)[0];
  assert.ok(h.includes('<div class="dn-akcje"><span class="dn-zegarek" data-dn="zegarek" hidden></span><button type="button" class="dn-okr" data-dn="dzwonek" aria-label="Powiadomienia">' + GLOWA + BELL + '</svg><span class="dn-licznik" data-dn="licznik" hidden></span></button></div></header>'), 'zegarek obok dzwonka, dzwonek z SVG, licznik w prawym górnym rogu przycisku');
  assert.deepEqual([...s.korzen.innerHTML.matchAll(/<img class="([^"]*)"/g)].map((m) => m[1]), ['dn-kadr-o'], 'jedyny obrazek to zdjęcie kadru');
  for (const m of s.korzen.innerHTML.matchAll(/(?:src|srcset)="([^"]*)"/g)) assert.match(m[1], /^assets\/ui\/dzis\/kadry\//, 'pobranie spoza kadrów: ' + m[1]);
  assert.doesNotMatch(KOD, /ui\/dzis\/ikony|function ikona\(|\bIKONY\b(?!_SVG)/, 'pomocnik obrazków ikon usunięty (nie miał już wywołań), katalog ikon tylko w komentarzu');
});

test('(2) licznik nieprzeczytanych bez zmian: liczba ze starego dzwonka, schowany przy zera; mały, w kolorze akcentu, w prawym górnym rogu', async () => {
  const s = strona(); s.el['zawodnik-bell-dot'] = { textContent: ' 3 ', style: { display: 'flex' } }; s.B.start(); await s.doKonca();
  assert.equal(s.cz('licznik').textContent, '3'); assert.equal(s.cz('licznik').hidden, false);
  const t = strona(); t.B.start(); await t.doKonca();
  assert.equal(t.cz('licznik').hidden, true, 'stary dzwonek schowany = licznika nie ma');
  assert.ok(MODUL.includes("#dzis-nowy .dn-licznik{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#c44a13;color:#fff;font:700 11px/20px 'DM Sans',sans-serif;text-align:center}"));
});

test('(3) zegarek i dzwonek: JEDNA reguła (nie rozjadą się), 48 px, obwódka, tło i kolor ikony jak kółka skrótów', () => {
  assert.ok(MODUL.includes('"#dzis-nowy .dn-akcje .dn-okr,#dzis-nowy .dn-zegarek .wc-badge{width:48px;height:48px;box-sizing:border-box;border-radius:50%;' + WYGLAD + 'opacity:1;transition:border-color .15s}"'));
  assert.ok(MODUL.includes('#dzis-nowy .dn-skrot .dn-krazek{width:48px;height:48px;box-sizing:border-box;border-radius:50%;background:#17161b;border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;color:#f5f3ef;'), 'skróty: ta sama średnica, obwódka i kolor ikony (blizna-412)');
  const m = /#dzis-nowy \.dn-zegarek \.wc-icon\{width:(\d+)px;height:\1px;stroke:#f5f3ef;stroke-width:([0-9.]+)\}/.exec(MODUL);
  assert.ok(m, 'ikona zegarka: kolor dzwonka i skrótów');
  assert.ok(Math.abs(Number(m[2]) * Number(m[1]) / 24 - 1.6) < 0.02, 'ta sama grubość kreski na ekranie co dzwonek (1,6 px przy 24 px): ' + (Number(m[2]) * Number(m[1]) / 24).toFixed(3));
  assert.ok(Number(m[1]) >= 20 && Number(m[1]) <= 24, 'zegarek węższy od dzwonka, więc 22 px, żeby optycznie był tej samej wielkości');
  assert.ok(MODUL.includes('#dzis-nowy .dn-zegarek .wc-badge-warn .wc-icon{stroke:#e8b840}') && KLIENT.includes('.wc-badge-warn .wc-icon{stroke:var(--yellow,#e8b840);'), 'wygasłe połączenie zostaje żółte, jak w sb.js (to stan, nie ozdoba)');
});

test('(4) nadpisanie wygrywa z CSS plakietki w sb.js: tam same klasy, bez id i bez !important', () => {
  const reguly = [...KLIENT.matchAll(/(?:^|[}'])\s*(\.wc-(?:badge|icon|refresh)[^{}']*)\{([^}]*)\}/gm)];   // CSS plakietki leży w napisach JS: '.wc-badge{…}'
  assert.ok(reguly.length >= 10, 'reguły plakietki w sb.js');
  assert.doesNotMatch(KLIENT, /#[\w-]+[^{};'"]*\.wc-(?:badge|icon|refresh)[^{};'"]*\{/, 'żadnej reguły plakietki z id (zawodnik.html i theme.css jej nie stylują, sprawdzone 27.11)');
  for (const [, sel, cialo] of reguly) {
    assert.doesNotMatch(sel, /#/, 'id w selektorze sb.js przebije #dzis-nowy: ' + sel);
    assert.doesNotMatch(cialo, /!important/, '!important w sb.js przebije nadpisanie: ' + sel);
  }
  for (const co of ['.wc-badge-ok{opacity:.55}', '.wc-badge-ok .wc-icon{stroke:var(--muted)}', '.wc-badge:hover .wc-icon{stroke:var(--accent)}', '.wc-badge{position:relative;width:40px;height:40px;'])
    assert.ok(KLIENT.includes(co), 'to właśnie nadpisujemy: ' + co);
  assert.ok(MODUL.includes('"#dzis-nowy .dn-zegarek .wc-badge:hover{transform:none;box-shadow:none}"'), 'bez powiększenia i poświaty po dotknięciu (na telefonie :hover zostaje); dzwonek ich nie ma');
});

test('(5) czytelność na zdjęciu: przyciemnione tło z rozmyciem; bez backdrop-filter pełne tło jak kółka skrótów', () => {
  assert.equal((MODUL.match(/-webkit-backdrop-filter:blur\(10px\);backdrop-filter:blur\(10px\)/g) || []).length, 2, 'kółka i chip, z przedrostkiem dla starszego Safari');
  assert.ok(MODUL.includes('"@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){#dzis-nowy .dn-akcje .dn-okr,#dzis-nowy .dn-zegarek .wc-badge,#dzis-nowy .dn-trener{background:#17161b}}"'));
  const alfa = Number(/background:rgba\(23,22,27,([0-9.]+)\)/.exec(WYGLAD)[1]);
  assert.ok(alfa >= 0.6, 'krycie tła ≥ 0,6: przy 0,62 zmierzony kontrast to ≥ 14,8:1 (ikony) i ≥ 6,8:1 (napis chipu) na 7 kadrach; jaśniejsze tło = nowy pomiar');
});

test('(6) chip „← Trener”: wysokość kółek (48 px, pigułka), ta sama obwódka, tło, kolor i rozmycie; czcionka bez zmian; na kadrze tylko położenie', () => {
  assert.ok(MODUL.includes("\"#dzis-nowy .dn-trener{display:inline-flex;align-items:center;box-sizing:border-box;min-height:48px;margin:0 0 8px;padding:0 16px;border-radius:24px;" + WYGLAD + "font:500 11px/1 'DM Mono',monospace;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:border-color .15s}"));
  assert.ok(MODUL.includes('#dzis-nowy .dn-kadr .dn-trener{position:absolute;left:0;bottom:112px;margin:0;white-space:nowrap}'));
  assert.equal(184 - 14 - 112 - 48, 10, 'górna krawędź chipu 10 px od góry ramki, jak przed zmianą (44 px przy bottom 116)');
});

test('(7) dotknięcie: obwódka akcentu i lekkie wciśnięcie dla zegarka, dzwonka i chipu; bez ruchu przy ograniczonym ruchu', () => {
  assert.ok(MODUL.includes('#dzis-nowy .dn-akcje .dn-okr:active,#dzis-nowy .dn-akcje .dn-okr:focus-visible,#dzis-nowy .dn-zegarek .wc-badge:active,#dzis-nowy .dn-zegarek .wc-badge:focus-visible,#dzis-nowy .dn-trener:active,#dzis-nowy .dn-trener:focus-visible{border-color:#ff7a45}'));
  assert.ok(MODUL.includes('#dzis-nowy .dn-skrot:active .dn-krazek,#dzis-nowy .dn-skrot:focus-visible .dn-krazek{border-color:#ff7a45}'), 'ten sam akcent co skróty');
  assert.ok(MODUL.includes('"#dzis-nowy .dn-okr:active,#dzis-nowy .dn-zapytaj:active,#dzis-nowy .dn-zegarek .wc-badge:active,#dzis-nowy .dn-trener:active{transform:scale(.96)}"'));
  assert.match(MODUL, /@media \(prefers-reduced-motion:reduce\)\{#dzis-nowy \.dn-okr:active,#dzis-nowy \.dn-zapytaj:active,#dzis-nowy \.dn-zegarek \.wc-badge:active,#dzis-nowy \.dn-trener:active,[^{]*\{transform:none\}/);
});
