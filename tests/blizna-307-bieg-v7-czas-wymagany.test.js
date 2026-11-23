/* BLIZNA 307 / 19.11: regulamin v7 (decyzja Filipa) — bieg zalicza tylko trening z czasem; „Usuń wynik” blokuje tylko usunięty trening w tej postaci.
   Front idzie PRZED migracją 20261217 (ona sama przestawia bieg-mikolajki na v7): strona przyjmuje v2–v7, teksty v7 tylko przy v7.
   § 5 ust. 1 v7 słowo w słowo (zatwierdzone), komunikat zmiany słowo w słowo od Filipa. „Wskaż trening”: trening bez ważnego czasu wyszarzony z „bez czasu”.
   Bez ukończenia (szukamy treningu albo wynik usunięty): „Popraw czas w treningu…” z linkiem, gdy jest trening na dystans bez czasu (punkt B).
   Test po skutku migracji: tools/akcja-bieg-v7-test.sh (AKCJA_BIEG_V7_Z_MIGRACJA=1 przed wdrożeniem). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
let B, P;
test.before(async () => {
  globalThis.escapeHtml = (x) => String(x);
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href); B = globalThis.BM_BIEG_REAL;
  globalThis.document = globalThis.document || { readyState: 'loading', addEventListener() {}, getElementById() { return null; } };
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg-panel.mjs')).href); P = globalThis.BM_BIEG_PANEL;
});
const BIEG = (w) => ({ slug: 'bieg-mikolajki', nazwa: 'Bieg', dzien_od: '2026-11-18', dzien_do: '2026-12-06', wynik_do: '2026-12-06', koniec_at: '2026-12-06T19:00:00+00:00', dystanse_km: [5], faza: 'trwa', regulamin_wersja: w, regulamin_od: '2026-11-19' });
const LICZNIK = { imie: 'Fabianek' }, LINK = 'https://example.org/zbiorka';
const P51 = '1. Bieg ukończył uczestnik, który w terminie z § 2 ma w aplikacji trening biegowy albo marszowy na dystansie co najmniej 5 km, z czasem (np. 45:00 albo 1:05:00). Trening może pochodzić z zegarka albo być wpisany ręcznie; trening bez czasu nie zalicza biegu.';
const KOMUNIKAT = 'Zmiana regulaminu: bieg zalicza trening z czasem (np. 45:00 albo 1:05:00).';
const paragraf5 = (w) => { const b = B.regulaminBloki(B.wartosciTekstow(BIEG(w), LICZNIK, LINK)), i = b.findIndex((x) => x.tekst === '§ 5. Wynik i ukończenie'); return b.slice(i + 1, i + 6).map((x) => x.tekst); };

test('v7 obowiązuje, strona przyjmuje v2–v7; § 5 ust. 1 słowo w słowo; v7 różni się od v6 tylko § 5 ust. 1 i linią wersji', () => {
  assert.equal(B.WERSJA_TEKSTOW, '2026-11-v8');
  assert.deepEqual([...B.WERSJE_TEKSTOW], ['2026-11-v2', '2026-11-v3', '2026-11-v4', '2026-11-v5', '2026-11-v6', '2026-11-v7', '2026-11-v8']);
  const v7 = paragraf5('2026-11-v7'), v6 = paragraf5('2026-11-v6');
  assert.equal(v7[0], P51); assert.notEqual(v6[0], P51);
  assert.deepEqual(v7.slice(1), v6.slice(1), '§ 5 ust. 2–5 jak w v6');
  const t7 = B.regulaminTekst(B.wartosciTekstow(BIEG('2026-11-v7'), LICZNIK, LINK)).split('\n'), t6 = B.regulaminTekst(B.wartosciTekstow(BIEG('2026-11-v6'), LICZNIK, LINK)).split('\n');
  const rozne = t7.filter((l, i) => l !== t6[i]);
  assert.deepEqual(rozne, [P51, '3. Wersja regulaminu: 2026-11-v7, obowiązuje od 19 listopada 2026.'].map((x) => rozne.find((r) => r === x) || x));
  assert.equal(rozne.length, 2, rozne.join(' | '));
});

test('komunikat zmiany: zapisani na v6 — zdanie Filipa słowo w słowo; na v7 nic; starsi dostają też wcześniejsze zmiany; przy v6 w bazie bez zdania o czasie', () => {
  assert.equal(B.komunikatZmiany(BIEG('2026-11-v7'), [{ regulamin_wersja: '2026-11-v6' }]), KOMUNIKAT);
  assert.equal(B.komunikatZmiany(BIEG('2026-11-v7'), [{ regulamin_wersja: '2026-11-v7' }]), '');
  const v5 = B.komunikatZmiany(BIEG('2026-11-v7'), [{ regulamin_wersja: '2026-11-v5' }]);
  assert.match(v5, /^Zmiana regulaminu: czas z tempa liczymy z każdego treningu .*; bieg zalicza trening z czasem \(np\. 45:00 albo 1:05:00\)\.$/);
  assert.doesNotMatch(B.komunikatZmiany(BIEG('2026-11-v6'), [{ regulamin_wersja: '2026-11-v5' }]), /z czasem \(np\./);
});

test('„Wskaż trening”: przy v7 trening bez ważnego czasu wyszarzony, bez guzika, z „bez czasu”; przy v6 jak dotąd', () => {
  const tr = [{ id: 't1', dzien: '2026-11-19', km: 14, czas_s: 1, typ: 'Spacer', zalicza_km: 5, z_zegarka: false }, { id: 't2', dzien: '2026-11-20', km: 6, czas_s: 1980, typ: 'Bieg', zalicza_km: 5, z_zegarka: true },
    { id: 't3', dzien: '2026-11-21', km: 5, czas_s: null, zalicza_km: 5 }, { id: 't4', dzien: '2026-11-21', km: 5, czas_s: 90000, zalicza_km: 5 }];
  const u = { id: 'u1', dystans_km: 5 }, h7 = B.treningiHtml(tr, u, BIEG('2026-11-v7')), h6 = B.treningiHtml(tr, u, BIEG('2026-11-v6'));
  for (const id of ['t1', 't3', 't4']) {
    assert.match(h7, new RegExp('<li class="bw-trening bw-trening--bez-czasu" data-bez-czasu="' + id + '">'), id);
    assert.doesNotMatch(h7, new RegExp('data-wybierz-trening="' + id + '"'), id + ': bez guzika');
  }
  assert.equal((h7.match(/<em>bez czasu<\/em>/g) || []).length, 3);
  assert.match(h7, /data-wybierz-trening="t2">Zalicz 5 km/); assert.doesNotMatch(h7, /0:01/, 'czasu „1” nie pokazujemy jako czasu');
  assert.doesNotMatch(h6, /bez-czasu|bez czasu/); assert.match(h6, /data-wybierz-trening="t1"/);
  assert.match(czytaj('bieg.html'), /B\.treningiHtml\(r\.data, wskazywany, bieg\)/);
  assert.match(czytaj('bieg.html'), /\.bw-trening--bez-czasu \{ opacity: \.55; \}/);
  assert.equal(B.komunikatWyniku({ ok: false, powod: 'bez_czasu' }), 'Ten trening nie ma czasu. Popraw czas w treningu (np. 45:00 albo 1:05:00), żeby mieć wynik w biegu.');
});

test('karta bez ukończenia (v7): schowane „Popraw czas…”, odsłaniane przy treningu na dystans bez czasu; po usunięciu też; dziecko i v6 bez tego', () => {
  const ja = { id: 'u1', rodzaj: 'ja', imie: 'Anna', numer: 1, dystans_km: 5 };
  const brak7 = B.wynikHtml(ja, BIEG('2026-11-v7'), { brakTreningu: true }), brak6 = B.wynikHtml(ja, BIEG('2026-11-v6'), { brakTreningu: true });
  assert.match(brak7, /<p class="bw-drobne" data-czas-brak="u1" data-czas-dystans="5" hidden>Popraw czas w treningu, żeby mieć wynik w biegu\. <a class="bw-link-maly" href="kalendarz\.html\?role=athlete" data-czas-brak-link>Otwórz trening w kalendarzu ›<\/a><\/p>/);
  assert.match(brak7, /z datą z czasu biegu \([^)]*\) i z czasem \(np\. 45:00\), i wróć tutaj\./);
  assert.match(brak7, /Nie widzimy jeszcze treningu z [^<]* na co najmniej 5 km z czasem\.<\/p>/);
  assert.doesNotMatch(brak6, /data-czas-brak|i z czasem|km z czasem/);
  const usun7 = B.wynikHtml(Object.assign({ wynik_usuniety: true, wynik_usuniety_powod: 'trening bez czasu' }, ja), BIEG('2026-11-v7'));
  assert.match(usun7, /data-wynik-usuniety[\s\S]*data-czas-brak="u1"/);
  assert.doesNotMatch(B.wynikHtml({ id: 'd1', rodzaj: 'dziecko', imie: 'Zosia', numer: 2, wynik_usuniety: true }, BIEG('2026-11-v7')), /data-czas-brak/);
  const tr = [{ dzien: '2026-11-19', km: 14, czas_s: 1, zalicza_km: 5 }, { dzien: '2026-11-21', km: 3, czas_s: null, zalicza_km: 0 }, { dzien: '2026-11-20', km: 6, czas_s: 1980, zalicza_km: 5 }];
  assert.equal(B.treningBezCzasu(tr, 5).dzien, '2026-11-19', 'za krótki i ważny czas pomijane');
  assert.equal(B.treningBezCzasu([{ dzien: '2026-11-20', km: 6, czas_s: 1980, zalicza_km: 5 }], 5), null);
  const h = czytaj('bieg.html');
  assert.match(h, /brak\.forEach\(function \(p\) \{ var t = B\.treningBezCzasu\(l, p\.getAttribute\('data-czas-dystans'\)\), a = p\.querySelector\('\[data-czas-brak-link\]'\); if \(t && a\) a\.href = 'kalendarz\.html\?openDay=' \+ t\.dzien; p\.hidden = !t; \}\);/);
  assert.match(h, /sw === 'usuniety' && B\.odWersji\(bieg\.regulamin_wersja, 7\)/, 'v7: po „Usuń wynik” próba przywrócenia przy wejściu');
  for (const [s, ok] of [[59, false], [60, true], [86400, true], [86401, false], [null, false], ['', false], [1980, true]]) assert.equal(B.czasWazny(s), ok, String(s));
});

test('karta po przywróceniu: „Wynik wrócił…” zamiast powodów sprawdzenia tempa', () => {
  const u = { id: 'u3', rodzaj: 'ja', imie: 'Celina', numer: 3, dystans_km: 5, wynik_dystans_km: 5, wynik_trening_km: 5.5, wynik_s: 1680, czas_biegu_s: 1527, z_tempa: true, ukonczony_at: '2026-11-19T18:00:00Z', odznaka: 'zwykla', do_weryfikacji: true, weryfikacja: null, po_usunieciu: true };
  assert.match(B.wynikHtml(u, BIEG('2026-11-v7')), /data-wynik-weryfikacja>Wynik wrócił z poprawionego albo nowego treningu\. Ukończenie i dyplom już masz; do rankingu wynik trafi po sprawdzeniu przez organizatora\.<\/p>/);
  assert.match(B.wynikHtml(Object.assign({}, u, { po_usunieciu: undefined }), BIEG('2026-11-v7')), /tempo spoza 3:00–36:00\/km albo trening dłuższy niż maraton/);
});

test('panel: potwierdzenie „Usuń wynik” przy v7 mówi o powrocie poprawionego treningu; przed migracją (bez wersji w panelu) jak dotąd', () => {
  const u = { imie: 'Celina', numer: 3 };
  assert.equal(P.pytanieUsuniecia(u), 'Usunąć wynik: Celina, numer 3? Dyplom i miejsce na liście znikną, uczestnik dostanie powiadomienie z powodem. Przywrócisz go przyciskiem „Zalicz ręcznie”.');
  assert.equal(P.pytanieUsuniecia(u, { regulamin_wersja: '2026-11-v6' }), P.pytanieUsuniecia(u));
  assert.equal(P.pytanieUsuniecia(u, { regulamin_wersja: '2026-11-v7' }), 'Usunąć wynik: Celina, numer 3? Dyplom i miejsce na liście znikną, uczestnik dostanie powiadomienie z powodem. Ten trening w obecnej postaci nie zaliczy już biegu. Gdy uczestnik poprawi w nim czas albo doda nowy trening, wynik wróci z flagą „Do sprawdzenia: wynik po usunięciu” i trafi do rankingu dopiero po „Zatwierdź”. Przywrócisz go też przyciskiem „Zalicz ręcznie”.');
  assert.match(czytaj('js/bieg-panel.mjs'), /usunWynik\(x, b\)\.then\(/);
});

