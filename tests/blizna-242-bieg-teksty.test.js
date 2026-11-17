/* BLIZNA 242 / TEKSTY BIEGU (Filip 14.11, „teksty-biegu-do-zaslepek.md”): regulamin, oświadczenie, zgody i zdanie o polityce wstawione do js/bieg.mjs.
   Znaczniki {nazwa} {imie} {od} {do} {wynik_do} {link} {wersja} {od_kiedy} wypełnia strona z bazy; brak którejkolwiek wartości albo inna wersja w bazie = null (= „WKRÓTCE”).
   Dane administratora w § 1 ust. 3 = dokładnie privacy.html. privacy.html: punkt 14 „Bieg wirtualny”, Resend z przypomnieniem o biegu, wersja 1.3.
   Imię dziecka nigdy na sztywno w plikach biegu (tylko z bazy). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
function modul() { const c = {}; c.globalThis = c; vm.createContext(c); vm.runInContext(czytaj('js/bieg.mjs'), c, { filename: 'js/bieg.mjs' }); return c.BM_BIEG_REAL; }
const BIEG = (x) => Object.assign({ slug: 'mikolajki', nazwa: 'Bieg na Mikołajki', dzien_od: '2026-12-05', dzien_do: '2026-12-06', wynik_do: '2026-12-08', regulamin_wersja: '2026-11-v2', regulamin_od: '2026-11-18', dystanse_km: [5, 10] }, x || {});
const LINK = 'https://example.org/zbiorka';

test('wartości z bazy: komplet = obiekt; każde brakujące pole, zła data, link bez https albo inna wersja = null (WKRÓTCE)', () => {
  const B = modul(), w = B.wartosciTekstow(BIEG(), { imie: 'Janek' }, LINK);
  assert.deepEqual(JSON.parse(JSON.stringify(w)), { nazwa: 'Bieg na Mikołajki', imie: 'Janek', od: 'soboty, 5 grudnia 2026', do: 'niedzieli, 6 grudnia 2026', wynik_do: 'wtorku, 8 grudnia 2026', link: LINK, wersja: '2026-11-v2', od_kiedy: '18 listopada 2026',
    dystanse: '5 km albo 10 km', ranking_dystanse: 'na 5 i 10 km (osobno dla każdego dystansu)', ranking_zakres: 'od 5 km do 5,49 km albo od 10 km do 10,49 km' });
  for (const [opis, b, l, link] of [
    ['bez nazwy', BIEG({ nazwa: '' }), { imie: 'Janek' }, LINK], ['bez imienia', BIEG(), {}, LINK], ['imię ze spacji', BIEG(), { imie: '  ' }, LINK],
    ['bez dzien_od', BIEG({ dzien_od: null }), { imie: 'Janek' }, LINK], ['bez dzien_do', BIEG({ dzien_do: undefined }), { imie: 'Janek' }, LINK],
    ['bez wynik_do', BIEG({ wynik_do: 'zła' }), { imie: 'Janek' }, LINK], ['bez linku', BIEG(), { imie: 'Janek' }, ''], ['link http', BIEG(), { imie: 'Janek' }, 'http://example.org'],
    ['bez wersji', BIEG({ regulamin_wersja: null }), { imie: 'Janek' }, LINK], ['stara wersja v1', BIEG({ regulamin_wersja: '2026-11-v1' }), { imie: 'Janek' }, LINK],
    ['bez dystansów', BIEG({ dystanse_km: null }), { imie: 'Janek' }, LINK], ['pusta lista dystansów', BIEG({ dystanse_km: [] }), { imie: 'Janek' }, LINK], ['dystanse spoza 1–100', BIEG({ dystanse_km: [0, 101] }), { imie: 'Janek' }, LINK],
    ['bez regulamin_od', BIEG({ regulamin_od: null }), { imie: 'Janek' }, LINK], ['bez biegu', null, { imie: 'Janek' }, LINK], ['bez licznika', BIEG(), null, LINK],
  ]) assert.equal(B.wartosciTekstow(b, l, link), null, opis);
  assert.deepEqual(Array.from(B.brakiTekstow(BIEG({ regulamin_od: null, regulamin_wersja: 'x' }), {}, '')), ['imie', 'link', 'wersja', 'od_kiedy']);
  assert.deepEqual(Array.from(B.brakiTekstow(BIEG({ dystanse_km: [] }), { imie: 'Janek' }, LINK)), ['dystanse']);
  assert.equal(B.dataZDniem('2026-12-07'), 'poniedziałku, 7 grudnia 2026'); assert.equal(B.dataZDniem('2026-12-09'), 'środy, 9 grudnia 2026'); assert.equal(B.dataZDniem('zła'), '');
});

test('regulamin: 13 paragrafów z nagłówkami, punkty numerowane, oświadczenie i zgody (z rankingiem); po wypełnieniu bez znaczników; plik .txt', () => {
  const B = modul(), w = B.wartosciTekstow(BIEG(), { imie: 'Janek' }, LINK), bl = Array.from(B.regulaminBloki(w));
  const nagl = bl.filter((b) => b.typ === 'naglowek').map((b) => b.tekst);
  assert.deepEqual(nagl.slice(0, 13).map((t) => t.replace(/\..*$/, '')), Array.from({ length: 13 }, (_, i) => '§ ' + (i + 1)));
  assert.deepEqual(nagl.slice(13), ['Oświadczenie rodzica lub opiekuna (pełne brzmienie)', 'Zgody dobrowolne (pełne brzmienie)']);
  assert.deepEqual(bl.filter((b) => b.typ === 'zgoda').map((b) => b.tekst.split(':')[0]), ['Imię na liście', 'Imię dziecka na liście', 'Ranking', 'E-mail']);
  assert.ok(bl.filter((b) => b.typ === 'punkt').every((b) => /^\d+\. /.test(b.tekst)), 'punkty z numerami');
  assert.deepEqual(bl.filter((b) => b.typ === 'akapit').length, 3, '§ 10, § 11 i oświadczenie bez numerów');
  const tekst = B.regulaminTekst(w);
  assert.doesNotMatch(tekst, /\{[a-z_]+\}/); assert.match(tekst, /\n$/); assert.match(tekst, /\n§ 13\. Postanowienia końcowe\n1\. Regulamin jest dostępny na stronie biegu przed zapisem i można go pobrać\./);
  assert.match(tekst, /\n- Ranking: Pokaż mnie w rankingu z czasem i miejscem\. Mam ukończone 18 lat\./);
  /* wszystkie znaczniki z tekstów Filipa są wypełniane */
  const zr = JSON.stringify(B.REGULAMIN); assert.deepEqual([...new Set(zr.match(/\{[a-z_]+\}/g))].sort(), ['{do}', '{dystanse}', '{imie}', '{link}', '{nazwa}', '{od_kiedy}', '{od}', '{ranking_dystanse}', '{ranking_zakres}', '{wersja}', '{wynik_do}']);
  for (const [k, v] of Object.entries(B.TEKSTY_KROTKIE)) { assert.ok(v.length <= 200, k + ': ' + v.length + ' znaków'); assert.doesNotMatch(v, /\{/, k); }
});

test('§ 1 ust. 3: dane administratora skopiowane dokładnie z privacy.html; kontakt i brak partnerstwa jak w tekstach Filipa', () => {
  const B = modul(), priv = czytaj('privacy.html');
  const m = /Administratorem Twoich danych osobowych jest (.+?)\.<\/p>/.exec(priv); assert.ok(m, 'zdanie o administratorze w privacy.html');
  const dane = m[1].replace(/<[^>]+>/g, '');
  assert.equal(B.DANE_ADMINISTRATORA, dane, 'stała = privacy.html');
  const p13 = B.REGULAMIN.paragrafy[0].punkty[2];
  assert.equal(p13, 'Organizatorem biegu jest BiegaMy, ' + dane + ' („Organizator”). Organizator prowadzi też aplikację, zapisy i wyniki. Kontakt: biegamy.run@gmail.com.');
  assert.match(B.REGULAMIN.paragrafy[0].punkty[1], /BiegaMy nie jest partnerem tej organizacji i nie działa w jej imieniu\.$/);
});

test('privacy.html: punkt 14 „Bieg wirtualny” (spis treści, 5 akapitów), Resend z przypomnieniem o biegu, wersja 1.3; zdanie pod zgodami odsyła do polityki', () => {
  const p = czytaj('privacy.html'), B = modul();
  assert.match(p, /<a href="#bieg">14\. Bieg wirtualny<\/a>/);
  const s14 = /<div class="section" id="bieg">([\s\S]*?)<\/div>\s*\n\s*\n?\s*<div class="contact-card">/.exec(p); assert.ok(s14, 'sekcja 14 przed kartą kontaktu');
  assert.match(s14[1], /<div class="section-num">14<\/div>\s*<div class="section-title">Bieg wirtualny<\/div>/);
  assert.equal((s14[1].match(/<p>/g) || []).length, 5);
  assert.match(s14[1], /art\. 6 ust\. 1 lit\. b RODO/); assert.match(s14[1], /Usuwamy je po sprawdzeniu, najpóźniej po 14 dniach\./); assert.match(s14[1], /Dane zapisów usuwamy po 90 dniach od zakończenia biegu\./);
  assert.match(p, /Resend<\/a> — wysyłka e-maili[\s\S]{0,400}za Twoją zgodą także przypomnienie o biegu wirtualnym/);
  assert.match(p, /Wersja 1\.3/); assert.match(p, /Obowiązuje od: 16 listopada 2026/);
  assert.match(B.TEKSTY_KROTKIE.polityka, /^Administratorem danych jest BiegaMy\. .*Szczegóły: Polityka prywatności\.$/);
});

test('przycisk „Regulamin biegu” w Zasadach otwiera okno regulaminu (ten sam klik co „czytaj”)', () => {
  const h = czytaj('bieg.html');
  assert.match(h, /<button[^>]*id="bw-pokaz-regulamin"[^>]*data-regulamin[^>]*>/);
  assert.match(h, /closest\('\[data-regulamin\]'\)[^\n]*pokazOkno\(\$\('bw-okno-regulamin'\)\)/);
});

test('imię dziecka tylko z bazy: pliki biegu nie mają go na sztywno', () => {
  for (const f of ['bieg.html', 'js/bieg.mjs', 'js/bieg-panel.mjs']) assert.doesNotMatch(czytaj(f).replace(/dla-fabianka(\.html)?/g, ''), /Fabian/i, f);
});
