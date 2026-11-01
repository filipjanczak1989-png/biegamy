/* BLIZNA 65 (1.11.2026, M1 krok 4): UI „Zapytaj" na Dziś (js/okienko.js + zawodnik.html).

   Ryzyka:
   1) XSS Z MODELU. Zdania pisze model — `<img onerror>` w zdaniu ma być tekstem (escapeHtml), nie elementem (M1 8.7).
   2) LINK OD MODELU. „Otwórz ›" tylko dla adresu z listy ekranów (ta sama lista co EF narzedzia.mjs); obcy = brak przycisku.
   3) STANY. 429 dzień/miesiąc, 502, offline mają swoje zdania i wyszukiwarkę ekranów; pusto ≠ „0"; brak pola karty = brak
      elementu (nie „undefined"/„null").
   4) RUCH. prefers-reduced-motion: arkusz bez animacji wjazdu, szkielet bez animacji.
   5) SŁOWO. Nazwa w UI „Zapytaj", bez „AI" (v1). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8');
const OKN = czytaj('js', 'okienko.js');
const ZAW = czytaj('zawodnik.html');

function swiat(opts = {}) {
  const ctx = zaladujSb();
  const m = new Map();
  ctx.sessionStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  ctx.navigator = Object.assign({}, ctx.navigator, { onLine: opts.offline ? false : true });
  ctx.__fetch = [];
  ctx.fetch = (...a) => { ctx.__fetch.push(a); return Promise.reject(new Error('test: brak sieci')); };
  vm.runInContext(OKN, ctx, { filename: 'js/okienko.js' });
  return { ctx, O: ctx.OKIENKO, m };
}

test('XSS (8.7): zdanie modelu z <img onerror> jest tekstem; karty też przez escapeHtml', () => {
  const { O } = swiat();
  const html = O.htmlOdpowiedzi(200, { zdania: ['<img src=x onerror=alert(1)>'], karty: [{ typ: 'start', dane: { nazwa: '<script>x</script>', data: '2026-11-11', dni_do: 10 } }], akcja: null });
  assert.ok(!/<img|<script/i.test(html), html);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
});

test('link: „Otwórz ›" tylko dla adresu z listy ekranów; javascript:/obcy host → brak przycisku', () => {
  const { O } = swiat();
  for (const zly of ['javascript:alert(1)', 'https://zly.example', '//zly.example', 'races.html?x=1', null]) {
    const html = O.htmlOdpowiedzi(200, { zdania: ['Oto.'], karty: [], akcja: { nawiguj: zly } });
    assert.ok(!/okn-otworz/.test(html), `${zly}: przycisk mimo spoza listy`);
  }
  assert.match(O.htmlOdpowiedzi(200, { zdania: ['Oto.'], karty: [], akcja: { nawiguj: 'races.html' } }), /class="okn-otworz" data-cel="races\.html"/);
});

test('lista ekranów w UI = lista w EF (narzedzia.mjs) — jeden słownik, dwie kopie pilnowane', async () => {
  const { O } = swiat();
  const N = await import(pathToFileURL(path.join(KORZEN, 'supabase', 'functions', 'okienko', 'narzedzia.mjs')).href);
  assert.equal(JSON.stringify(O.EKRANY), JSON.stringify(N.EKRANY));
});

test('stany: 429 dzień / miesiąc, 502, 503, offline, pusto (gałąź „nie pasuje" usunięta 1.11 — EF nie wysyła `dopasowanie`)', () => {
  const { O } = swiat();
  const T = O.TEKSTY;
  const h429 = O.htmlOdpowiedzi(429, { limit: 'dzien' }, 'starty');
  assert.ok(h429.includes(T.dzien.replace(/—/g, '—')) && /okn-ekrany/.test(h429) && /data-cel="races\.html"/.test(h429), 'dzień + wyszukiwarka ekranów');
  assert.ok(O.htmlOdpowiedzi(429, { limit: 'miesiac' }, '').includes(T.miesiac));
  for (const s of [502, 503, 500]) assert.ok(O.htmlOdpowiedzi(s, null).includes(T.blad), String(s));
  const off = O.htmlOdpowiedzi('offline', null, '');
  assert.ok(off.includes(T.offline) && /okn-ekrany/.test(off));
  assert.ok(O.htmlOdpowiedzi(200, { zdania: [], karty: [], akcja: null }).includes(T.pusto));
  assert.ok(O.htmlOdpowiedzi(200, { zdania: [], karty: [], akcja: null, dopasowanie: false }).includes(T.pusto), 'pole `dopasowanie` nic nie zmienia');
  const kat = path.join(__dirname, '..', 'supabase', 'functions', 'okienko');
  for (const f of fs.readdirSync(kat)) assert.ok(!/\bdopasowanie\s*:/.test(fs.readFileSync(path.join(kat, f), 'utf8')), `${f}: EF wysyła pole dopasowanie`);
  assert.ok(!('niePasuje' in T) && !/dopasowanie/.test(OKN), 'martwa gałąź w js/okienko.js');
  assert.ok(!/okn-otworz/.test(O.htmlOdpowiedzi(200, { zdania: [], karty: [], akcja: { nawiguj: 'radio.html' } })) === false, 'sama nawigacja → przycisk');
});

test('karty: brak pola = brak elementu (nie „undefined"/„null"/„NaN")', () => {
  const { O } = swiat();
  const html = O.htmlOdpowiedzi(200, { zdania: ['Oto.'], karty: [
    { typ: 'trening', dane: { typ: 'Spokojny' } }, { typ: 'start', dane: { nazwa: 'X' } },
    { typ: 'wyzwanie', dane: { nazwa: 'Y' } }, { typ: 'odznaka', dane: { id: 'z' } }, { typ: 'nieznany', dane: {} }] });
  assert.ok(!/undefined|null|NaN/.test(html), html);
});

test('offline: zapytanie nie idzie do sieci; token nigdzie nie zapisywany', async () => {
  const { ctx, O } = swiat({ offline: true });
  const r = await O.zapytaj('ile km w tym miesiącu');
  assert.equal(r.status, 'offline');
  assert.equal(ctx.__fetch.length, 0);
  const zapisy = [...OKN.matchAll(/sessionStorage\.setItem\(([^,]+),/g)].map((m) => m[1].trim());
  assert.ok(zapisy.every((k) => k === 'k'), 'setItem tylko przez zapisz(k, v)');
  assert.ok(!/localStorage|okienko_podglad|zapytaj=/.test(OKN), 'okienko bez localStorage i bez bramki podglądu (od 1.11 13:33 dla wszystkich)');
  assert.ok(!/(setItem|zapisz)\([^)]*(access_token|sesja)/.test(OKN), 'token w pamięci przeglądarki');
});

test('podpowiedź rotuje przy każdym otwarciu strony, nie w czasie', () => {
  const { O } = swiat();
  const a = O.podpowiedz(), b = O.podpowiedz(), c = O.podpowiedz();
  assert.ok(a !== b && b !== c, `${a} / ${b} / ${c}`);
  assert.ok(!/setInterval/.test(OKN), 'rotacja w czasie');
});

test('zawodnik.html: pole „Zapytaj" (44 px), arkusz .add-overlay/.add-sheet, skrypt po sb.js, reduced-motion, bez „AI"', () => {
  assert.match(ZAW, /<button type="button" id="okienko-pole"/);
  assert.match(ZAW, /#okienko-pole\{[^}]*min-height:44px/);
  assert.match(ZAW, /<div class="add-overlay" id="okienko-arkusz" role="dialog"[^>]*>\s*<div class="add-sheet">/);
  assert.ok(ZAW.indexOf('<script src="sb.js"></script>') < ZAW.indexOf('<script src="js/okienko.js"></script>'));
  const rm = ZAW.slice(ZAW.indexOf('#okienko-pole{'), ZAW.indexOf('</style>', ZAW.indexOf('#okienko-pole{')));
  assert.match(rm, /@media \(prefers-reduced-motion: reduce\)\{[\s\S]*#okienko-arkusz \.add-sheet\{transition:none;\}[\s\S]*\.okn-szkielet\{animation:none;\}/);
  const ui = ZAW.slice(ZAW.indexOf('<button type="button" id="okienko-pole"'), ZAW.indexOf('</div>\n</div>', ZAW.indexOf('id="okienko-arkusz"')) + 20)
    + JSON.stringify(Object.values(swiat().O.TEKSTY));
  assert.ok(!/\bAI\b/.test(ui), 'słowo „AI" w interfejsie');
  assert.match(ZAW, /const _okp=document\.getElementById\('okienko-pole'\);if\(_okp\)_okp\.style\.display='none';/);
  assert.match(ZAW, /id="okienko-pole"[^>]*style="display:none;"/, 'pole domyślnie ukryte (bez mignięcia)');
  assert.match(ZAW, /if\(_okp2&&_okp2\.dataset\.wlaczone==='1'\)_okp2\.style\.display='';/, 'powrót na Dziś odsłania tylko pole podpięte');
  assert.ok(!/okienko_podglad|\?zapytaj=/.test(ZAW), 'zawodnik.html bez śladu bramki podglądu');
});

/* Od 1.11 13:33 (decyzja Filipa): pole dla każdego zalogowanego, bez parametru i bez localStorage. Od 1.11 16:2x także
   z ?from=trener — parametr mówi, skąd przyszedłeś, nie czyje dane widzisz (zawodnik.html zawsze = zalogowany; LEKCJE #31). */
function stronaZPolem(search, ls) {
  const ctx = zaladujSb();
  const pole = { style: { display: 'none' }, dataset: {}, addEventListener() {}, setAttribute() {} };
  ctx.document.getElementById = (id) => (id === 'okienko-pole' ? pole : { style: {}, dataset: {}, addEventListener() {}, setAttribute() {}, textContent: '' });
  ctx.location = Object.assign({}, ctx.location, { search });
  ctx.localStorage = ls;
  ctx.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  vm.runInContext(OKN, ctx, { filename: 'js/okienko.js' });
  return pole;
}
function magazyn() { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }

test('pole widoczne bez parametru i bez localStorage; stare ?zapytaj=0/1 nic nie zmienia; ?from=trener też widoczne', () => {
  const ls = magazyn();
  const p = stronaZPolem('', ls);
  assert.equal(p.style.display, ''); assert.equal(p.dataset.wlaczone, '1');
  assert.equal(stronaZPolem('?zapytaj=0', ls).style.display, '', 'stary wyłącznik nie działa');
  assert.equal(stronaZPolem('?zapytaj=1', ls).style.display, '');
  assert.equal(ls.m.size, 0, 'nic nie zapisane w localStorage');
  const zly = { getItem() { throw new Error('zablokowane'); }, setItem() { throw new Error('zablokowane'); }, removeItem() {} };
  assert.equal(stronaZPolem('', zly).style.display, '', 'zablokowany localStorage nie ukrywa pola');
  const tr = stronaZPolem('?from=trener', ls);
  assert.equal(tr.style.display, '', 'wejście z panelu trenera (Widok zawodnika) — pole widoczne');
  assert.equal(tr.dataset.wlaczone, '1', 'podpięte, więc powrót na Dziś też je odsłania');
  assert.ok(!/get\('from'\)/.test(OKN), 'okienko nie wnioskuje o kontekście z parametru nawigacji');
});

test('limity w UI: 429 dzień / miesiąc / sieć mają własne teksty; podpowiedzi z sieci i wyników', () => {
  const { O } = swiat();
  assert.match(O.htmlOdpowiedzi(429, { limit: 'dzien' }, ''), /Na dziś koniec pytań/);
  assert.match(O.htmlOdpowiedzi(429, { limit: 'miesiac' }, ''), /Na ten miesiąc koniec pytań/);
  assert.match(O.htmlOdpowiedzi(429, { limit: 'siec' }, ''), /Na dziś koniec szukania w sieci/);
  assert.ok(OKN.includes("'Kto wygrał maraton w Berlinie?', 'Wyniki: imię i nazwisko'"));
});
