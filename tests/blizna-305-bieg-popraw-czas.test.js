/* BLIZNA 305 / 19.11: karta biegu przy wyniku z treningu bez ważnego czasu (pusty, sama liczba „1”, uszkodzony).
   Zamiast „Czas nie wszedł z treningu, więc dyplom pokazuje kilometry.” — „Popraw czas w treningu, żeby mieć wynik w biegu.” z linkiem
   do dnia tego treningu w kalendarzu (kalendarz.html?openDay=RRRR-MM-DD; datę strona bierze z akcja_bieg_treningi_z_okna). Po poprawie czasu
   wyzwalacz z 20261212 przelicza wynik z tego samego treningu — test po skutku tools/akcja-bieg-czas-poprawa-test.sh (bez migracji).
   Zaliczenie ręczne przez organizatora (bez treningu): zdanie jak dotąd. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
let B;
test.before(async () => { globalThis.escapeHtml = (x) => String(x); await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href); B = globalThis.BM_BIEG_REAL; });
const BIEG = { slug: 'bieg-mikolajki', nazwa: 'Bieg', dzien_od: '2026-11-18', dzien_do: '2026-12-06', wynik_do: '2026-12-06', koniec_at: '2026-12-06T19:00:00+00:00', dystanse_km: [5], faza: 'trwa', regulamin_wersja: '2026-11-v6', regulamin_od: '2026-11-19' };
const JA = (x) => Object.assign({ id: 'u10', rodzaj: 'ja', imie: 'Anna', numer: 10, dystans_km: 5, wynik_dystans_km: 5, ukonczony_at: '2026-11-19T17:00:00Z', odznaka: 'zwykla', wynik_s: null, czas_biegu_s: null, z_tempa: false }, x || {});

test('karta: wynik z treningu bez czasu → prośba o poprawę z linkiem do treningu; zaliczenie organizatora i wynik z czasem bez zmian', () => {
  const h = B.wynikHtml(JA({ wynik_trening_km: 14 }), BIEG);
  assert.match(h, /<p class="bw-drobne" data-czas-popraw>Popraw czas w treningu, żeby mieć wynik w biegu\. <a class="bw-link-maly" href="kalendarz\.html\?role=athlete" data-czas-link="u10" data-czas-km="14">Otwórz trening w kalendarzu ›<\/a><\/p>/);
  assert.doesNotMatch(h, /Czas nie wszedł z treningu/);
  assert.match(B.wynikHtml(JA({ wynik_trening_km: null }), BIEG), /Czas nie wszedł z treningu, więc dyplom pokazuje kilometry\./, 'zaliczenie przez organizatora: jak dotąd');
  assert.doesNotMatch(B.wynikHtml(JA({ wynik_trening_km: 6, wynik_s: 1998, czas_biegu_s: 1665, z_tempa: true }), BIEG), /data-czas-popraw|Czas nie wszedł/, 'z czasem: nic');
  assert.doesNotMatch(B.wynikHtml({ id: 'd1', rodzaj: 'dziecko', imie: 'Zosia', numer: 11, dystans_wlasny_km: 1.5, ukonczony_at: '2026-11-19T17:00:00Z', odznaka: 'zwykla' }, BIEG), /data-czas-popraw/, 'dziecko: bez czasu z definicji');
});

test('link: dzień treningu o tym dystansie bez ważnego czasu (60 s – 24 h jak w bazie); kilka — najpóźniejszy; brak — sam kalendarz', () => {
  const L = B.linkTreninguBezCzasu;
  const tr = [{ id: 'a', dzien: '2026-11-19', km: 14, czas_s: 1 }, { id: 'b', dzien: '2026-11-20', km: 6, czas_s: 1998 }];
  assert.equal(L(tr, 14), 'kalendarz.html?role=athlete&openDay=2026-11-19');
  assert.equal(L(tr, '14.00'), 'kalendarz.html?role=athlete&openDay=2026-11-19', 'km z data-czas-km jako tekst');
  assert.equal(L(tr, 6), 'kalendarz.html?role=athlete', 'trening z ważnym czasem nie jest celem linku');
  assert.equal(L([{ dzien: '2026-11-19', km: 14, czas_s: null }, { dzien: '2026-11-21', km: 14, czas_s: 0 }], 14), 'kalendarz.html?role=athlete&openDay=2026-11-21');
  assert.equal(L([{ dzien: '2026-11-19', km: 14, czas_s: 90000 }], 14), 'kalendarz.html?role=athlete&openDay=2026-11-19', 'ponad 24 h = bez ważnego czasu');
  assert.equal(L(null, 14), 'kalendarz.html?role=athlete'); assert.equal(L([{ dzien: 'zła data', km: 14, czas_s: 1 }], 14), 'kalendarz.html?role=athlete');   // 23.11: role=athlete (blizna-340)
});

test('bieg.html: link uzupełniany po narysowaniu karty z akcja_bieg_treningi_z_okna (raz na odświeżenie), kalendarz otwiera dzień z ?openDay=', () => {
  const h = czytaj('bieg.html');
  assert.match(h, /B\.odtworzPola\(t, pola\);\n\s*kanwyDyplomu = \{\};[^\n]*\n\s*uzupelnijLinkiCzasu\(t\);/, 'po każdym narysowaniu karty');
  assert.match(h, /window\.sb\.rpc\('akcja_bieg_treningi_z_okna', \{ p_slug: bieg\.slug \}\)/);
  assert.match(h, /a\.href = B\.linkTreninguBezCzasu\(l, a\.getAttribute\('data-czas-km'\)\);/);
  assert.match(h, /function odswiez\(\) \{\n\s*var nr = \+\+nrOdswiezenia[^\n]*\n\s*treningiOkna = null;/, 'po powrocie z kalendarza czytamy od nowa');
  assert.match(czytaj('kalendarz.html'), /const _urlOpenDay = new URLSearchParams\(window\.location\.search\)\.get\('openDay'\)/, 'kalendarz obsługuje ?openDay=');
  const sh = czytaj('tools/akcja-bieg-czas-poprawa-test.sh'), sq = czytaj('tools/akcja-bieg-czas-poprawa-test.sql');
  assert.doesNotMatch(sh, /supabase\/migrations/, 'test po skutku bez migracji'); assert.match(sq, /raise exception 'TESTY POPRAWY CZASU ZIELONE: % sprawdzeń', n;/);
  assert.match(sq, /update public\.training_logs set duration = '2:50:00' where id = lA;/);
  assert.match(czytaj('supabase/migrations/20261212_akcja_bieg_wynik_bez_treningu.sql'), /create trigger trg_akcja_bieg_trening_zmieniony after update of distance_km, duration,/, 'wyzwalacz reaguje na zmianę czasu');
});
