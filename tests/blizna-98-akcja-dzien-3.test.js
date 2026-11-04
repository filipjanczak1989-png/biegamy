/* BLIZNA 98 (2.11.2026) — PROJEKT F dzień 3: karta akcji (Dziś), dla-fabianka.html, index teaser→pełna, okienko po starcie.
   Spec v3 pkt 2 + zmiany Filipa 2.11 (docs/akcja-f-spec.md pkt 10).

   Pilnuje:
   - rozliczenie JEDNORAZOWE: „Filip dokłada 10 gr za każdy kilometr · dotąd X zł z 1 250 zł", bez kwot tygodnia w UI;
   - karta na Dziś: przed startem nic, po starcie licznik + wkład, po zamknięciu „Zrobiliśmy to" przez 7 dni, potem nic;
   - nazwa/link z bazy: nazwa escapowana, link zbiórki tylko https przez safeExternalHref (CLAUDE.md);
   - przed startem nic nie zdradza dziecka: statyczny kod index.html i dla-fabianka.html bez imienia (poza nazwą pliku),
     NAZWISKO nigdzie we froncie ani w EF (tylko w linku zbiórki w bazie);
   - okienko: stan akcji tylko dla pytań o akcję, ustawStan synchronicznie tuż przed dopasuj (stan modułu wspólny dla
     zapytań w izolacie), karta akcji wyłącznie z danych publicznego licznika. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
let A;
test.before(async () => {
  globalThis.escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  globalThis.safeExternalHref = (u, o) => (/^https:\/\//.test(u) ? u : (o && o.tylkoHttps ? '' : u));
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  const S = globalThis.BM_AKCJA, sp = (f) => (...a) => String(f(...a)).replace(/ /g, ' ');
  A = { ...S, km: sp(S.km), zl: sp(S.zl), tekstFilipa: sp(S.tekstFilipa), kartaDzisHtml: sp(S.kartaDzisHtml) };
});
const PO = { wystartowala: true, wystartowala_at: '2026-11-08T10:07:00Z', nazwa: 'Kilometry dla Fabianka', cel_km: 12500, suma_km: 4120.4,
  pct: 32.96, filip_gr: 41204, filip_max_gr: 125000, stawka_filip_gr: 10, sponsorzy_n: 3, stawka_sponsorow_gr: 15,
  url_zbiorki: 'https://www.siepomaga.pl/x', koniec: null, zamknieta: false };

test('teksty: Filip jednorazowo (dotąd X zł z 1 250 zł), złote i km po polsku, sponsorzy bez nazwisk', () => {
  assert.equal(A.tekstFilipa(PO), 'Filip dokłada 10 gr za każdy kilometr · dotąd 412,04 zł z 1 250 zł');
  assert.equal(A.tekstFilipa({ ...PO, filip_gr: 125000 }), 'Filip dokłada 10 gr za każdy kilometr · dotąd 1 250 zł z 1 250 zł');
  assert.equal(A.tekstFilipa({ wystartowala: false }), '');
  assert.equal(A.km(12500), '12 500');
  assert.equal(A.km(3.42), '3,4');
  assert.equal(A.zl(4120), '41,20 zł');
  assert.equal(A.zl(125000), '1 250 zł');
  assert.equal(globalThis.BM_AKCJA.zl(125000), '1 250 zł', 'twarda spacja — liczba się nie łamie');
  assert.equal(A.tekstSponsorow(PO), '3 osoby dokładają razem 15 gr za każdy kilometr');
  assert.equal(A.tekstSponsorow({ sponsorzy_n: 1, stawka_sponsorow_gr: 5 }), '1 osoba dokłada razem 5 gr za każdy kilometr');
  assert.equal(A.tekstSponsorow({ sponsorzy_n: 12, stawka_sponsorow_gr: 60 }), '12 osób dokłada razem 60 gr za każdy kilometr');
  assert.equal(A.tekstSponsorow({ sponsorzy_n: 0 }), '');
});

test('karta na Dziś: przed startem nic, trwa, „Zrobiliśmy to" 7 dni po zamknięciu, potem nic', () => {
  assert.equal(A.kartaDzisHtml({ wystartowala: false }, null), '');
  const k = A.kartaDzisHtml(PO, { km: 84.2 });
  assert.match(k, /Kilometry dla Fabianka/);
  assert.match(k, /Twój wkład: <b>84 km<\/b>/);
  assert.match(k, /dotąd 412,04 zł z 1 250 zł/);
  assert.match(k, /href="dla-fabianka\.html"/);
  assert.match(k, /href="https:\/\/www\.siepomaga\.pl\/x" target="_blank" rel="noopener noreferrer"/);
  const zam = { ...PO, koniec: '2026-12-01', zamknieta: true, suma_km: 12731 };
  assert.match(A.kartaDzisHtml(zam, { km: 84 }, new Date('2026-12-07T12:00:00Z')), /Zrobiliśmy to: 12 731 km · Ty: 84 km/);
  assert.equal(A.kartaDzisHtml(zam, { km: 84 }, new Date('2026-12-08T12:00:00Z')), '', '8. dzień po zamknięciu — karta znika');
  assert.equal(A.stanKarty({ ...PO, zamknieta: true, koniec: null }), 'trwa', 'cel dobity, dzień trwa — karta zostaje do nocnego zamknięcia');
});

test('XSS: nazwa z bazy escapowana, link zbiórki tylko https', () => {
  const k = A.kartaDzisHtml({ ...PO, nazwa: '<img src=x onerror=alert(1)>', url_zbiorki: 'javascript:alert(1)' }, null);
  assert.doesNotMatch(k, /<img/);
  assert.match(k, /&lt;img/);
  assert.doesNotMatch(k, /javascript:/);
  assert.equal(A.linkZbiorki({ url_zbiorki: 'http://x' }), '');
});

test('karta okienka: null przed startem, po starcie tylko pola publicznego licznika', () => {
  assert.equal(A.kartaOkienka({ wystartowala: false }), null);
  const k = A.kartaOkienka(PO);
  assert.equal(k.typ, 'akcja');
  assert.deepEqual(Object.keys(k.dane).sort(), ['cel_km', 'nazwa', 'pct', 'suma_km', 'url_zbiorki', 'zamknieta']);
});

test('przed startem nic nie zdradza: statyczny kod stron bez imienia; nazwisko nigdzie we froncie i w EF', () => {
  for (const p of ['dla-fabianka.html', 'index.html']) {
    const bezNazwyPliku = czytaj(p).replace(/dla-fabianka(\.html)?/g, '');
    assert.doesNotMatch(bezNazwyPliku, /fabian/i, p + ' zawiera imię w kodzie statycznym');
  }
  const pliki = execFileSync('git', ['ls-files'], { cwd: KORZEN, encoding: 'utf8' }).split('\n')
    .filter((f) => /\.(html|js|mjs|ts)$/.test(f) && !f.startsWith('tests/') && !f.startsWith('supabase/migrations/'));
  const zNazwiskiem = pliki.filter((f) => fs.existsSync(path.join(KORZEN, f)) && require('./_nazwisko.js').maNazwisko(fs.readFileSync(path.join(KORZEN, f), 'utf8')));
  assert.deepEqual(zNazwiskiem, [], 'nazwisko dziecka poza linkiem w bazie');
  for (const p of ['js/akcja.mjs', 'dla-fabianka.html', 'zawodnik.html', 'index.html']) {
    assert.doesNotMatch(czytaj(p), /wpłat\w* tygodni|rozliczeni\w* tygodni|do przelewu/i, p + ': kwoty tygodniowe w UI');
  }
});

test('Dziś i index: miejsce, źródło danych, bez zakazanych nazw #100kmDlaKasi', () => {
  const z = czytaj('zawodnik.html');
  const i = z.indexOf('tu stał pasek #100kmDlaKasi');
  assert.ok(i > 0 && z.indexOf('<div id="akcja-karta"', i) > i, 'karta akcji w miejscu po pasku');
  assert.match(z, /rpc\('akcja_moj_wklad', \{ p_slug: window\.BM_AKCJA_CYTATY\.slugDla\(_athleteId\) \}\)/);
  assert.match(z, /window\._renderKartyAkcji\(d\);/);
  const ix = czytaj('index.html');
  assert.match(ix, /<div id="akcja-licznik" hidden/);
  assert.match(ix, /BM_AKCJA\.pobierzPubliczny\('dla-fabianka'\)/);
  assert.match(ix, /window\.escapeHtml\(d\.nazwa \|\| ''\)/);
  assert.doesNotMatch(ix + z + czytaj('dla-fabianka.html'), /hero-licznik"|spol-pasek"|community_km\(/);
  const dfx = czytaj('dla-fabianka.html');
  assert.match(dfx, /A\.pobierzPubliczny\('dla-fabianka'\)/);
  assert.doesNotMatch(dfx, /\.rpc\(|createClient\(/, 'strona publiczna nie woła bazy wprost (wariant b)');
  assert.match(czytaj('js/akcja.mjs'), /var EF = "\/functions\/v1\/akcja-licznik";/);
  const sw = czytaj('sw.js');
  for (const u of ['/js/akcja.mjs', '/dla-fabianka.html']) { assert.ok(sw.includes(`'${u}',`), 'precache bez ' + u); assert.ok(fs.existsSync(path.join(KORZEN, u.slice(1)))); }
});

test('okienko: stan tylko dla pytań o akcję, ustawStan synchronicznie tuż przed dopasuj, karta z kartaOkienka', () => {
  const ef = czytaj('supabase/functions/okienko/index.ts');
  assert.match(ef, /import \{ dopasuj, normalizuj, zagadkaKandydat, czyNiepewne, ODP_NIEPEWNE, CHIPY_WYBORU, przeciekAkcji, ODP_CEL_TAJNY, ODP_ZDROWIE_INNYCH \} from "\.\/router\.mjs";/);   // 3.11: + niska pewność (blizna-112), + strażnik wyjścia akcji (blizna-137)
  assert.match(ef, /import "\.\.\/\.\.\/\.\.\/js\/akcja\.mjs";/);
  assert.match(ef, /if \(AK && zagadkaKandydat\(tekst\)\) \{ try \{ akcjaDane = await AK\.odswiezStan\(sb, ath\.id\); \}/);
  const u = ef.indexOf('AK.ustawStan('), d = ef.indexOf('const traf = dopasuj(tekst, dzis);');
  assert.ok(u > 0 && d > u, 'ustawStan przed dopasuj');
  assert.doesNotMatch(ef.slice(u, d), /await/, 'await między ustawStan a dopasuj — wyścig zapytań w izolacie');
  assert.match(ef, /if \(traf\.log === "zagadka" && AKK\) \{ const k = AKK\.kartaOkienka\(akcjaDane\); if \(k\) kartyZd = \[k\]; \}/);
  const kl = czytaj('js/okienko.js');
  assert.match(kl, /if \(k\.typ === 'akcja'\)/);
  assert.match(kl, /window\.safeExternalHref\(d\.url_zbiorki, \{ tylkoHttps: true \}\)/);
  assert.match(kl, /esc\(d\.nazwa \|\| 'Akcja'\)/);
});
