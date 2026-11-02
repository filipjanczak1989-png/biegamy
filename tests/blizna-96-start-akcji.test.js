/* BLIZNA 96 (3.11.2026) — PROJEKT F dzień 2: guzik startu (start-akcji.html) i podpięcie czyAkcjaRuszyla.
   Spec v3 pkt 1, 2, 4, 7. Serwerowa strona guzika (okno, czas klienta, idempotencja, 42501) jest w
   tools/akcje-test-transakcji.sh — tu klient: stan z bazy w js/akcja-cytaty.mjs i ekran guzika.

   Pilnuje:
   - odswiezStan: jedno źródło (RPC akcja_licznik), cache 60 s, brak sieci → stan z tej sesji albo „nie ruszyła";
   - konto testowe czyta 'proba' (PROBA_KONTA = konta_testowe z migracji) i po starcie próby widzi cytat dnia startu
     niezależnie od daty — nikt inny nie;
   - guzik: okno = okno z migracji, przytrzymanie 1 s, bez „Czy na pewno?", czas naciśnięcia w localStorage + IndexedDB,
     ponawianie co 5 s i przy `online`, reset tylko w trybie próby, nic innego do tapnięcia;
   - skrót na ekran główny przez osobny manifest strony (główny manifest bez skrótu — widziałby go każdy). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const PERSONA = '56092926-2cf1-44b6-952f-38614497fdc2';
let A;
test.before(async () => {
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja-cytaty.mjs')).href);
  A = globalThis.BM_AKCJA_CYTATY;
});
const sbFake = (odp) => { const s = { wolania: [], rpc: async (fn, a) => { s.wolania.push([fn, a]); if (odp instanceof Error) throw odp; return odp; } }; return s; };
const pamiec = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

test('slugDla: persona testowa → proba, reszta → dla-fabianka; PROBA_KONTA = konta_testowe z migracji', () => {
  assert.equal(A.slugDla(PERSONA), 'proba');
  assert.equal(A.slugDla('9c2df65c-6a46-410e-ad5f-474e5d973ec9'), 'dla-fabianka');
  assert.equal(A.slugDla(null), 'dla-fabianka');
  const m = czytaj('supabase/migrations/20261102_akcje.sql').match(/values \('proba',[^;]*array\[([^\]]*)\]/);
  assert.ok(m, 'brak konta_testowe w migracji');
  const zMigracji = [...m[1].matchAll(/'([0-9a-f-]{36})'/g)].map((x) => x[1]);
  assert.deepEqual(A.PROBA_KONTA, zMigracji);
});

test('odswiezStan: RPC akcja_licznik, cache 60 s, wymus, brak sieci → stan sesji albo false', async () => {
  globalThis.sessionStorage = pamiec();
  try {
    const sb = sbFake({ data: { wystartowala: true, koniec: null, suma_km: 3 }, error: null });
    const d = await A.odswiezStan(sb, 'ktos', { teraz: 1_000_000 });
    assert.equal(d.wystartowala, true);
    assert.deepEqual(sb.wolania, [['akcja_licznik', { p_slug: 'dla-fabianka' }]]);
    assert.equal(A.czyAkcjaRuszyla(), true);
    await A.odswiezStan(sb, 'ktos', { teraz: 1_000_000 + 59_000 });
    assert.equal(sb.wolania.length, 1, 'w 60 s drugi raz do bazy');
    await A.odswiezStan(sb, 'ktos', { teraz: 1_000_000 + 61_000 });
    assert.equal(sb.wolania.length, 2, 'po 60 s bez odświeżenia');
    await A.odswiezStan(sb, 'ktos', { teraz: 1_000_000 + 61_500, wymus: true });
    assert.equal(sb.wolania.length, 3);
    // brak sieci przy przeterminowanym cache → stan z sesji (nie cofa startu)
    await A.odswiezStan(sbFake(new Error('offline')), 'ktos', { teraz: 1_000_000 + 999_000 });
    assert.equal(A.czyAkcjaRuszyla(), true);
    // brak sieci bez żadnego stanu → nie ruszyła
    globalThis.sessionStorage = pamiec();
    await A.odswiezStan(sbFake(new Error('offline')), 'ktos', { teraz: 5 });
    assert.equal(A.czyAkcjaRuszyla(), false);
    // błąd RPC (np. 42501) traktowany jak brak danych
    await A.odswiezStan(sbFake({ data: null, error: { code: '42501' } }), 'ktos', { teraz: 6 });
    assert.equal(A.czyAkcjaRuszyla(), false);
    // bez sessionStorage (Deno w okienku) — działa, bez cache
    delete globalThis.sessionStorage;
    const sb2 = sbFake({ data: { wystartowala: false }, error: null });
    await A.odswiezStan(sb2, 'ktos', { teraz: 7 }); await A.odswiezStan(sb2, 'ktos', { teraz: 8 });
    assert.equal(sb2.wolania.length, 2);
  } finally { delete globalThis.sessionStorage; A.ustawStan({ ruszyla: false, zamknieta: false, proba: false }); }
});

test('próba: konto testowe po starcie próby widzi cytat dnia startu w dowolny dzień; inni nadal teaser', async () => {
  const d3 = new Date('2026-11-03T10:00:00Z');
  try {
    await A.odswiezStan(sbFake({ data: { wystartowala: true, koniec: null }, error: null }), PERSONA, { teraz: 1 });
    assert.equal(A.cytat(d3).tekst, A.W_DNIU_STARTU);
    A.ustawStan({ ruszyla: false, proba: true });
    assert.equal(A.cytat(d3).tekst, A.TEASER['2026-11-03'], 'próba przed naciśnięciem = teaser');
    await A.odswiezStan(sbFake({ data: { wystartowala: true, koniec: null }, error: null }), 'zwykly', { teraz: 1 });
    assert.equal(A.cytat(d3).tekst, A.TEASER['2026-11-03'], 'zwykłe konto przed 8.11 = teaser mimo startu');
    assert.equal(A.cytat(new Date('2026-11-08T12:00:00Z')).tekst, A.W_DNIU_STARTU);
  } finally { A.ustawStan({ ruszyla: false, zamknieta: false, proba: false }); }
});

test('zawodnik.html: stan z bazy po initAuth (obie ścieżki) i przy powrocie karty, bez pollingu', () => {
  const z = czytaj('zawodnik.html');
  assert.equal((z.match(/initAuth\(\)\.then\(\(\) => \{[^\n]*window\._odswiezStanAkcji\(\);/g) || []).length, 2);
  const i = z.indexOf('window._odswiezStanAkcji = function'), f = z.slice(i, z.indexOf('\n};\n', i));
  assert.match(f, /BM_AKCJA_CYTATY\.odswiezStan\(window\.sb, _athleteId\)/);
  assert.doesNotMatch(f, /setInterval|setTimeout/);
});

test('start-akcji.html: okno z migracji, przytrzymanie 1 s, offline, ponawianie, próba, nic innego do tapnięcia', () => {
  const h = czytaj('start-akcji.html');
  const s = h.slice(h.indexOf('<script>\n(function'));
  // okno: 8.11 06:00 i 23:59:59 Europe/Warsaw (UTC+1) = akcje.okno_startu_od/do
  assert.ok(czytaj('supabase/migrations/20261102_akcje.sql').includes("timestamp '2026-11-08 06:00:00' at time zone 'Europe/Warsaw'"));
  assert.match(s, /OKNO_OD = Date\.parse\('2026-11-08T05:00:00Z'\)/);
  assert.match(s, /OKNO_DO = Date\.parse\('2026-11-08T22:59:59Z'\)/);
  assert.match(s, /PRZYTRZYMAJ_MS = 1000, PONOW_MS = 5000/);
  assert.match(s, /rpc\('akcja_start', \{ p_slug: SLUG, p_nacisnieto_at: t \}\)/);
  assert.match(s, /localStorage\.setItem\(KLUCZ, w\)/);
  assert.match(s, /indexedDB\.open\('bm-akcja', 1\)/);
  assert.match(s, /window\.addEventListener\('online', wyslij\)/);
  assert.match(s, /ponowTimer = setTimeout\(wyslij, PONOW_MS\)/);
  assert.match(s, /var SLUG = PROBA \? 'proba' : 'dla-fabianka';/);
  assert.match(s, /rpc\('akcja_proba_reset'\)/);
  assert.match(s, /\$\('reset'\)\.hidden = !\(PROBA && nowy === 'zapisane'\)/);
  assert.match(s, /if \(stan !== 'uzbrojony'\) return;/);
  assert.doesNotMatch(s, /confirm\(|alert\(/, 'pytanie „Czy na pewno?" psuje moment');
  assert.doesNotMatch(h, /<a\s/i, 'link na ekranie guzika');
  assert.equal((h.match(/<button/g) || []).length, 1, 'jedyny przycisk to reset próby');
  // błąd uprawnień i okna kończą ponawianie (bez pętli wysyłek bez końca)
  assert.match(s, /kod === '42501'\) \{ await wyczyscLokalnie\(\);/);
  assert.match(s, /kod === '22023'\) \{ await wyczyscLokalnie\(\);/);
});

test('instalacja: strona i logo w precache SW; osobny manifest strony; główny manifest bez skrótu „Start akcji"', () => {
  const sw = czytaj('sw.js');
  for (const u of ['/start-akcji.html', '/manifest-start-akcji.json', '/assets/ui/logo-b-ring.webp']) {
    assert.ok(sw.includes(`'${u}',`), 'precache bez ' + u);
    assert.ok(fs.existsSync(path.join(KORZEN, u.slice(1))), 'brak pliku ' + u + ' (addAll wywróci instalację SW)');
  }
  const m = JSON.parse(czytaj('manifest-start-akcji.json'));
  assert.equal(m.start_url, '/start-akcji.html');
  assert.notEqual(m.scope, '/', 'zakres „/" zlałby się z główną aplikacją');
  assert.ok(m.start_url.startsWith(m.scope));
  assert.doesNotMatch(czytaj('manifest.json'), /start-akcji/);
  assert.match(czytaj('start-akcji.html'), /<link rel="manifest" href="manifest-start-akcji\.json">/);
});
