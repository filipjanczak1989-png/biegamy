/* BLIZNA 231 (12.11.2026, decyzja Filipa po zwiadzie sponsora kilometrów): do czasu wersji z potwierdzeniem stawki (status, limit, zrzut wpłaty, panel trenera, po 18.11)
   nic z niepotwierdzonych deklaracji nie wychodzi publicznie i nikt nowy nie deklaruje:
   - zdanie „N osób dokłada razem X gr za każdy kilometr” zdjęte ze strony akcji i z karty na Dziś (funkcja tekstSponsorow zostaje w module, nikt jej nie rysuje);
   - wejście „Zostań sponsorem kilometrów” schowane na dla-fabianka.html i w karcie akcji dla osób bez deklaracji;
   - kto ma deklarację, widzi „Twoja stawka … Wycofaj” jak dotąd; deklaracje, RPC i odznaki bez zmian; zamrożone pliki (zawodnik.html, index.html, sw.js) i baza nietknięte. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const A_SRC = czytaj('js/akcja.mjs'), F = czytaj('dla-fabianka.html');

function modul() {
  const c = { console, Promise, JSON, Math, Number, String, Object, Array, Date, RegExp, isFinite, Intl, setTimeout, clearTimeout, escapeHtml: (s) => String(s).replace(/[&<>"']/g, (x) => '&#' + x.charCodeAt(0) + ';'), safeExternalHref: (u) => (/^https:\/\//.test(u) ? u : ''), safeUrlAttr: (u) => u };
  c.globalThis = c; c.window = c; vm.createContext(c); vm.runInContext(A_SRC, c);
  return c.BM_AKCJA;
}
const D = { wystartowala: true, imie: 'Marek', nazwa: 'Kilometry', cel_km: 12500, suma_km: 1190.61, pct: 9.5, start: '2026-11-07', koniec: null, filip_gr: 11906, filip_max_gr: 125000, stawka_filip_gr: 10, sponsorzy_n: 3, stawka_sponsorow_gr: 15, firmy: [], ulica: { cegly_n: 1 } };

test('zdanie o sponsorach nie wychodzi: strona akcji bez #sponsorzy i tekstSponsorow, karta bez .akcja-sponsorzy; tekstFilipa i wyprawa zostają', () => {
  assert.doesNotMatch(F, /id="sponsorzy"|tekstSponsorow/);
  assert.doesNotMatch(A_SRC, /class="akcja-sponsorzy"/, 'karta nie rysuje zdania');
  assert.match(A_SRC, /function tekstSponsorow\(d\)/, 'funkcja zostaje (wraca w wersji z potwierdzeniem)');
  const A = modul(), k = A.kartaDzisHtml(D, { km: 12, stawka_gr: null }, new Date('2026-11-12T10:00:00+01:00'), true);
  assert.doesNotMatch(k, /dokłada razem|dokładają razem|akcja-sponsorzy/, 'karta bez zdania o sponsorach');
  assert.match(k, /akcja-filip/, 'zdanie o dokładce BiegaMy zostaje');
});

test('wejście „Zostań sponsorem kilometrów” schowane: strona akcji bez przycisku, karta bez formularza dla osób bez deklaracji; z deklaracją „Twoja stawka … Wycofaj”', () => {
  assert.doesNotMatch(F, /id="sponsor"|Zostań sponsorem kilometrów|\$\('sponsor'\)/);
  const A = modul();
  assert.equal(A.sponsorHtml({ km: 12, stawka_gr: null }, D), '');
  assert.doesNotMatch(A.kartaDzisHtml(D, { km: 12, stawka_gr: null }, new Date('2026-11-12T10:00:00+01:00'), true), /Zostań sponsorem|data-akcja="sponsor"|data-akcja="zapisz"|akcja-stawka/);
  const z = A.sponsorHtml({ km: 12, stawka_gr: 6 }, D);
  assert.match(z, /Twoja stawka: <b>6 gr<\/b> za każdy kilometr/); assert.match(z, /data-akcja="wycofaj">Wycofaj</);
  assert.match(A.kartaDzisHtml(D, { km: 12, stawka_gr: 6 }, new Date('2026-11-12T10:00:00+01:00'), true), /Twoja stawka/, 'osoba z deklaracją widzi ją w karcie');
});

test('zakres: tylko js/akcja.mjs i dla-fabianka.html; zamrożone pliki i baza bez zmian; RPC i odznaka zostają', () => {
  assert.match(czytaj('zawodnik.html'), /sb\.rpc\('akcja_deklaruj'/, 'handler w zamrożonym zawodnik.html nietknięty (bez wejścia nic go nie woła)');
  assert.match(czytaj('index.html'), /location\.hash === '#sponsor'/, 'index.html nietknięty');
  assert.match(czytaj('js/odznaki-akcji.mjs'), /"akcja-sponsor"/, 'odznaka w katalogu zostaje');
  assert.ok(!fs.readdirSync(path.join(KORZEN, 'supabase/migrations')).some((f) => /sponsor/i.test(f) && /^20261112|^20261113/.test(f)), 'bez migracji w tym kroku');
});
