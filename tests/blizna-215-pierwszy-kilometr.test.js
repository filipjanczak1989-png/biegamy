/* BLIZNA 215 (11.11.2026, noc bez nadzoru, część 3) — „Pierwszy kilometr”: kafel akcji przy wkładzie 0 km.
   Stan 10.11 (zbiorczy SELECT): 75 kont od 7.11, 62 bez żadnej aktywności, 0 z push. Ludzie zakładają konto z Facebooka i nie wiedzą, co dalej.
   Pilnuje:
   - wkład 0 km (odpowiedź z bazy) → zdanie „Spacer też buduje ulicę.” i przycisk „Dodaj pierwszy kilometr ›” zamiast „Twój wkład: 0 km”;
   - brak odpowiedzi (wkład null, bez sieci) → NIE pokazujemy wezwania (nie wiemy, czy ktoś nie ma kilometrów);
   - po pierwszym kilometrze: „Twój wkład: X km”, przycisk „Pokaż mój wkład” i podziękowanie RAZ (10 minut od pierwszego pokazania);
   - przycisk prowadzi przez openModal + selType('Spacer') + kursor w dystansie (zamrożony zawodnik.html bez zmian), zapasowo zawodnik.html#log;
   - zero nowych zapytań do bazy (wkład jak dotąd z akcja_moj_wklad), żadnych wysyłek; karta „Mój wkład” (część 4) dociągana po dotknięciu. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

function pamiec() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; }
async function modul() {
  globalThis.escapeHtml = (s) => String(s);
  globalThis.localStorage = pamiec();
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  return globalThis.BM_AKCJA;
}
const D = { nazwa: 'Ulica', imie: 'Imię', suma_km: 912.4, cel_km: 1000, wystartowala: true };

test('wkład 0 km → zdanie i przycisk; brak odpowiedzi → bez wezwania; po kilometrze zwykły wkład i „Pokaż mój wkład”', async () => {
  const A = await modul();
  const zero = A.wkladHtml(D, { km: 0 }, 'akcja-dzis-wklad');
  assert.match(zero, /Spacer też buduje ulicę\. <button type="button" class="akcja-pierwszy" data-pierwszy-km>Dodaj pierwszy kilometr ›<\/button>/);
  assert.doesNotMatch(zero, /Twój wkład/);
  assert.equal(globalThis.localStorage.getItem('bm_akcja_pierwszy_km_dla-fabianka'), '0', 'flaga: wezwanie pokazane');
  const brak = A.wkladHtml(D, null, 'akcja-dzis-wklad');
  assert.match(brak, /Twój wkład: <b>0 km<\/b>/); assert.doesNotMatch(brak, /data-pierwszy-km|data-moj-wklad/, 'bez odpowiedzi z bazy ani wezwania, ani karty');
  const t0 = 1_700_000_000_000;
  const po = A.wkladHtml(D, { km: 1.2 }, 'akcja-ja', t0);
  assert.match(po, /class="akcja-ja">Twój wkład: <b>1,2 km<\/b> <button type="button" class="akcja-link akcja-moj-wklad" data-moj-wklad>Pokaż mój wkład<\/button><\/div>/);
  assert.match(po, /<div class="akcja-dzieki">Pierwszy kilometr na ulicy\. Dziękujemy\.<\/div>/);
  assert.match(globalThis.localStorage.getItem('bm_akcja_pierwszy_km_dla-fabianka'), /^1:1700000000000$/);
  assert.match(A.wkladHtml(D, { km: 1.2 }, 'akcja-ja', t0 + 9 * 60 * 1000), /Dziękujemy/, 'w 10 minutach nadal');
  assert.doesNotMatch(A.wkladHtml(D, { km: 1.2 }, 'akcja-ja', t0 + 11 * 60 * 1000), /Dziękujemy/, 'po 10 minutach koniec, na zawsze');
  assert.doesNotMatch(A.wkladHtml(D, { km: 1.2 }, 'akcja-ja', t0 + 1000), /Dziękujemy/, 'raz: po wygaśnięciu nie wraca');
});

test('konto z kilometrami od początku (nigdy nie widziało wezwania) nie dostaje podziękowania; próba ma własną flagę', async () => {
  const A = await modul();
  const h = A.wkladHtml(D, { km: 34 }, 'akcja-ja', 5);
  assert.doesNotMatch(h, /Dziękujemy/); assert.match(h, /34 km/);
  assert.equal(globalThis.localStorage.getItem('bm_akcja_pierwszy_km_dla-fabianka'), null);
  A.wkladHtml({ ...D, testowa: true }, { km: 0 }, 'akcja-ja');
  assert.equal(globalThis.localStorage.getItem('bm_akcja_pierwszy_km_proba'), '0');
  assert.equal(globalThis.localStorage.getItem('bm_akcja_pierwszy_km_dla-fabianka'), null, 'flaga próby nie dotyka żywej akcji');
});

test('najkrótsza droga: openModal → selType(pigułka Spacer) → kursor w dystansie; bez formularza link #log', async () => {
  const A = await modul();
  const z = czytaj('zawodnik.html');
  assert.match(z, /<button class="type-pill" onclick="selType\(this,'Spacer'\)">/, 'pigułka Spacer w zamrożonym zawodnik.html');
  assert.match(z, /id="log-form"/); assert.match(z, /id="l-dist"/); assert.match(z, /function openModal\(/); assert.match(z, /function selType\(/);
  const zdarzenia = [];
  const pill = { getAttribute: () => "selType(this,'Spacer')", textContent: '🚶 Spacer' };
  const obca = { getAttribute: () => "genSelDystans(this,'5k')", textContent: '5 km' };
  globalThis.document = { querySelectorAll: () => [obca, pill], getElementById: (id) => (id === 'l-dist' ? dystans : null) };
  const dystans = { value: '8', focus: () => zdarzenia.push('focus') };   // prefill z planu: po otwarciu ze spacerem pole ma być puste
  globalThis.openModal = () => zdarzenia.push('openModal');
  globalThis.selType = (el, t) => zdarzenia.push('selType:' + t + ':' + (el === pill));
  const timery = []; const st = globalThis.setTimeout; globalThis.setTimeout = (f) => timery.push(f);
  try {
    assert.equal(A.otworzPierwszyKm(), true);
    await new Promise((r) => setImmediate(r));   // openModal może być asynchroniczny: wybór Spaceru dopiero po jego zakończeniu
    timery.forEach((f) => f());
    assert.deepEqual(zdarzenia, ['openModal', 'selType:Spacer:true', 'focus']);
    assert.equal(dystans.value, '', 'dystans z planu wyczyszczony przed kursorem');
    delete globalThis.openModal;
    const loc = { href: '' }; globalThis.location = loc;
    assert.equal(A.otworzPierwszyKm(), false);
    assert.equal(loc.href, 'zawodnik.html#log');
  } finally { globalThis.setTimeout = st; delete globalThis.document; delete globalThis.selType; delete globalThis.location; }
});

test('żadnych nowych zapytań ani wysyłek; kafel i karta używają wkladHtml; zamrożone pliki bez zmian w tej części', () => {
  const kod = czytaj('js/akcja.mjs');
  const rpc = [...kod.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(rpc)].sort(), ['akcja_firmy_do_sprawdzenia', 'akcja_kafel_ukryj', 'akcja_kafel_ukryty'], 'te same trzy rpc co przed 11.11: pierwszy kilometr nie dodaje zapytań');
  const nowe = kod.slice(kod.indexOf('PIERWSZY KILOMETR (11.11'), kod.indexOf('function liczbyKaflaHtml')) + kod.slice(kod.indexOf('Pierwszy kilometr: najkrótsza droga'), kod.indexOf('Film akcji z kafla'));
  assert.ok(nowe.length > 1500, 'oba nowe bloki znalezione');
  assert.doesNotMatch(nowe, /fetch\(|sendBeacon|\.insert\(|\.update\(|\.from\(/, 'nowe bloki: nic nie idzie na serwer, żadnych nowych odczytów');
  assert.match(kod, /return '<div class="akcja-dzis-km"><b>' \+ km\(d\.suma_km\) \+ "<\/b>z " \+ km\(d\.cel_km\) \+ ' km<\/div>' \+ wkladHtml\(d, wklad, "akcja-dzis-wklad"\);/);
  assert.match(kod, /wkladHtml\(d, wklad, "akcja-ja"\) \+/);
  assert.match(kod, /closest\("\[data-pierwszy-km\]"\)/); assert.match(kod, /closest\("\[data-moj-wklad\]"\)/);
  assert.doesNotMatch(kod, /data-akcja="(pierwszy|wklad)/, 'zawodnik.html obsługuje [data-akcja] sam (sponsor/udostepnij/zapisz/wycofaj): nowe przyciski mają inne atrybuty');
  assert.match(kod, /el\.src = "js\/akcja-wklad-karta\.mjs"/, 'karta dociągana dopiero po dotknięciu');
  assert.doesNotMatch(kod.replace(/dla-fabianka(\.html)?/g, ''), /fabian/i);
});
