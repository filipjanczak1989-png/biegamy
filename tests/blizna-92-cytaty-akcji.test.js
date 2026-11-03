/* BLIZNA 92 (2.11.2026) — CYTATY AKCJI w banerze cytatu na Dziś (js/akcja-cytaty.mjs, decyzja Filipa + poprawka tego dnia).
   (Numer 92, nie 90 z komendy: blizna-90 to km miesiąca z 1.11.)

   Ryzyka:
   1) dzień liczony po UTC albo strefie urządzenia → o 23:30 w Polsce zły cytat (granica północy w Warszawie);
   2) dzień startu (sobota 7.11 — zmiana Filipa 2.11 16:22, wcześniej 8.11) przed naciśnięciem pokazuje puentę („12 500 km… Fabianek") — zdradza akcję przed kliknięciem guzika;
      start = czyAkcjaRuszyla() (stan z RPC, projekt F), NIGDY zgadywanie po godzinie; opóźniony start → dalej teaser;
   3) cytat akcji przegrywa z „Twój plan" albo zwykłym cytatem; poza datami akcji podmienia zwykłe cytaty;
   4) po starcie cytat nie zmienia się bez przeładowania (odśwież przy wejściu na Dziś i powrocie do karty, bez pollingu). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
function modul() { const c = vm.createContext({ Intl, Date, Math, String, Number }); c.globalThis = c; vm.runInContext(czytaj('js/akcja-cytaty.mjs'), c); return c.BM_AKCJA_CYTATY; }
const W = (iso) => new Date(iso);   // instanty UTC; Warszawa = UTC+1 w listopadzie
const T = (a, d, o) => { const c = a.cytat(W(d), o); return c && c.tekst; };

test('teaser dzień po dniu, granica północy w Warszawie (nie UTC)', () => {
  const A = modul();
  assert.equal(T(A, '2026-11-01T22:59:59Z'), null, '1.11 23:59:59 w Warszawie — przed akcją');
  assert.equal(T(A, '2026-11-01T23:00:00Z'), 'Może lepiej było nie zaczynać. Za późno.', '2.11 00:00 w Warszawie');
  assert.equal(T(A, '2026-11-02T22:59:00Z'), 'Może lepiej było nie zaczynać. Za późno.', '2.11 23:59');
  assert.equal(T(A, '2026-11-02T23:00:00Z'), 'Ktoś już zawiązał buty. Jeszcze nie wiesz po co.', '3.11 00:00');
  assert.equal(T(A, '2026-11-04T12:00:00Z'), 'Na mapie pojawiła się linia. Daleka. Bardzo daleka.');
  assert.equal(T(A, '2026-11-05T12:00:00Z'), 'Liczba jest gotowa. Brakuje tylko ludzi.');
  assert.equal(T(A, '2026-11-06T12:00:00Z'), 'Jutro wszystko stanie się jasne.', '6.11 — ostatni dzień teasera (start 7.11)');
  assert.equal(A.TEASER['2026-11-07'], undefined, '7.11 to dzień startu, nie teaser');
  assert.ok(!Object.values(A.TEASER).some((t) => /dwa dni|8\.11/.test(t)), 'teaser bez odliczania do starego terminu');
  assert.equal(A.cytat(W('2026-11-03T12:00:00Z')).zrodlo, 'BiegaMy · akcja');
  assert.equal(T(A, '2025-11-02T12:00:00Z'), null, 'rok wcześniej — nic');
});

test('7.11 (dzień startu): przed naciśnięciem „Dziś. Jedno kliknięcie…", po starcie puenta; opóźniony start → „Jedno kliknięcie…"; od 8.11 rotacja', () => {
  const A = modul();
  assert.equal(A.czyAkcjaRuszyla(), false, 'do podłączenia guzika Fabianka (projekt F) — false');
  assert.equal(T(A, '2026-11-06T23:00:00Z'), 'Dziś. Jedno kliknięcie zmieni wszystko.', '7.11 00:00, przed startem');
  assert.equal(T(A, '2026-11-07T19:00:00Z'), 'Dziś. Jedno kliknięcie zmieni wszystko.', '7.11 20:00 — godzina NIE uruchamia akcji');
  assert.equal(T(A, '2026-11-07T19:00:00Z', { ruszyla: true }), '12 500 kilometrów. Jeden powód. Fabianek.', '7.11 po starcie');
  assert.equal(T(A, '2026-11-07T23:00:00Z'), 'Jedno kliknięcie zmieni wszystko.', '8.11 bez startu — opóźnienie');
  assert.equal(T(A, '2026-11-07T23:00:00Z', { ruszyla: true }), 'Twój kilometr to jego krok.', '8.11 00:00 po starcie — pierwsza z rotacji');
  assert.equal(T(A, '2026-11-08T23:00:00Z', { ruszyla: true }), 'Nie musisz biec szybko. Wystarczy, że biegniesz z nami.');
  assert.equal(T(A, '2026-11-18T12:00:00Z', { ruszyla: true }), 'Dziś biegniesz dla kogoś. To lekki bieg.', '11. dzień');
  assert.equal(T(A, '2026-11-19T12:00:00Z', { ruszyla: true }), 'Twój kilometr to jego krok.', 'rotacja wraca do początku');
  // DATA W JEDNYM MIEJSCU: DZIEN_STARTU = akcje.start z migracji 7.11; rotacja i okno guzika liczone, nie wpisane
  assert.equal(A.DZIEN_STARTU, '2026-11-07');
  assert.ok(czytaj('supabase/migrations/20261102_akcja_start_7_11.sql').includes("set start = date '2026-11-07'"));
  assert.equal(A.START_ROTACJI, '2026-11-08');
  assert.equal(new Date(A.OKNO_STARTU.od).toISOString(), '2026-11-07T05:00:00.000Z', '7.11 06:00 Warszawa');
  assert.equal(new Date(A.OKNO_STARTU.do).toISOString(), '2026-11-07T22:59:59.000Z', '7.11 23:59:59 Warszawa');
  assert.match(czytaj('js/akcja-cytaty.mjs'), /var START_ROTACJI = dodajDni\(DZIEN_STARTU, 1\);/);
  assert.ok(!A.ZAGADKI.some((z) => /\d{1,2}\.\d{2}/.test(z)), 'zagadki BEZ dnia (3.11, blizna-118: data na zapowiedzi 8.11 ≠ start 7.11 — żadna zagadka nie zdradza żadnej)');
  // jedno miejsce podłączenia: ustawStan (stan z RPC) przełącza czyAkcjaRuszyla bez zgadywania
  A.ustawStan({ ruszyla: true });
  assert.equal(A.czyAkcjaRuszyla(), true);
  assert.equal(T(A, '2026-11-07T19:00:00Z'), '12 500 kilometrów. Jeden powód. Fabianek.');
  const src = czytaj('js/akcja-cytaty.mjs');
  assert.ok(!/getHours|getUTCHours|hour:/.test(src), 'start akcji nie zależy od godziny');
  assert.match(src, /function czyAkcjaRuszyla\(\) \{ return STAN\.ruszyla === true; \}/);
});

test('zamknięcie: jeden cytat przez 7 dni od dnia zamknięcia, potem zwykłe; bez daty zamknięcia — zwykłe', () => {
  const A = modul();
  const o = { ruszyla: true, zamknieta: true, zamknietaOd: '2026-12-10' };
  assert.equal(T(A, '2026-12-10T12:00:00Z', o), 'Daliśmy radę. Razem. Dla Fabianka.');
  assert.equal(T(A, '2026-12-16T22:59:00Z', o), 'Daliśmy radę. Razem. Dla Fabianka.', '7. dzień, 23:59');
  assert.equal(T(A, '2026-12-16T23:00:00Z', o), null, '8. dzień 00:00 → zwykłe cytaty');
  assert.equal(T(A, '2026-12-10T12:00:00Z', { ruszyla: true, zamknieta: true }), null);
  assert.equal(modul().ZAMKNIETA, false, 'AKCJA_ZAMKNIETA=false do czasu akcja_licznik');
});

test('zawodnik.html: cytat akcji przed „Twój plan" i zwykłym; skrypt w precache; odświeżenie przy wejściu na Dziś i powrocie do karty, bez pollingu', () => {
  const z = czytaj('zawodnik.html');
  assert.match(z, /<script src="js\/akcja-cytaty\.mjs"><\/script>/);
  assert.match(czytaj('sw.js'), /'\/js\/akcja-cytaty\.mjs',/);
  assert.match(z, /textContent = _akcja \? _akcja\.zrodlo : socialText \? 'Twój plan' : q\.source;/);
  assert.match(z, /const _mTresc = _akcja \? '"' \+ _akcja\.tekst \+ '"' : socialText \? socialText\.replace\(\/\\\*\/g, ''\) : q\.text;/);
  assert.match(z, /if \(name === 'home' && typeof window\.odswiezCytatAkcji === 'function'\) window\.odswiezCytatAkcji\(\);/);
  // projekt F dzień 2: powrót karty → najpierw stan z bazy (cache 60 s), potem cytat (tylko na Dziś) — blizna-96
  assert.match(z, /document\.addEventListener\('visibilitychange', function \(\) \{\n\s*if \(document\.visibilityState === 'visible'\) window\._odswiezStanAkcji\(\);/);
  assert.match(z, /if \(\(window\._currentSection \|\| 'home'\) === 'home'\) \{\n\s*window\.odswiezCytatAkcji\(\);/);
  const i = z.indexOf('window.odswiezCytatAkcji = function'), f = z.slice(i, z.indexOf('\n};\n', i));
  assert.ok(!/setInterval|setTimeout/.test(f), 'bez pollingu');
});

test('odswiezCytatAkcji: po starcie podmienia tekst raz (bez przeładowania), drugi raz nic; null → bez zmian', () => {
  const z = czytaj('zawodnik.html');
  const i = z.indexOf('window.odswiezCytatAkcji = function'), kod = z.slice(i, z.indexOf('\n};\n', i) + 3);
  const A = modul();
  const txt = { dataset: { akcja: 'Dziś. Jedno kliknięcie zmieni wszystko.' }, textContent: '"Dziś. Jedno kliknięcie zmieni wszystko."' }, src = { textContent: 'BiegaMy · akcja' };
  const ctx = vm.createContext({ window: { BM_AKCJA_CYTATY: A }, document: { getElementById: (id) => (id === 'motiv-text' ? txt : id === 'motiv-source' ? src : null) },
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : ['2026-11-07T19:00:00Z'])); } } });
  vm.runInContext(kod, ctx);
  assert.equal(ctx.window.odswiezCytatAkcji(), false, 'przed startem — ten sam cytat, nic');
  A.ustawStan({ ruszyla: true });
  assert.equal(ctx.window.odswiezCytatAkcji(), true);
  assert.equal(txt.textContent, '"12 500 kilometrów. Jeden powód. Fabianek."'); assert.equal(src.textContent, 'BiegaMy · akcja');
  assert.equal(ctx.window.odswiezCytatAkcji(), false, 'drugi raz bez zmian');
});
