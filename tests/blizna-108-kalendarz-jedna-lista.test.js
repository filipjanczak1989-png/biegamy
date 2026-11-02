/* BLIZNA 108 (2.11.2026, L1+L2 kalendarza — docs/kalendarz-jedna-lista-projekt.md, przegląd B) — JEDNA lista z obu źródeł.
   1) kluczNazwy: bez liczebników rzymskich i liczb na końcach („XII Bieg Niepodległości 2026" = „Bieg Niepodległości"), tylko litery;
   2) toSamo: data ±1, równy klucz, miasto zgodne gdy oba są (dzielnica = to samo miasto; inne miasto 11.11 ≠ to samo);
   3) scal: nasza wygrywa, przejmuje klucz/link/dystanse (suma zbiorów); sortowanie: data, przy remisie nasze, miesiąc na koniec;
   4) typImprezy: nordic → City Trail = ulica → ultra → trail → przełaj → noc → ulica;
   5) województwo z mapy miast (dzielnice i „A - B" po członach), nieznane → null;
   6) filtruj: dystans „którykolwiek", bez dystansu ukryte i policzone; województwo z mapy; szukajka po nazwie+mieście bez znaków;
   7) races.html: moduł załadowany po tekst.mjs, jedna lista w #races-list, bez osobnej sekcji, imprezyLaduj PO loadRaces (wyścig),
      karta maszyny bez onclick w modal, link tylko https, escapeHtml. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
async function K() { await import(pathToFileURL(path.join(KORZEN, 'js/tekst.mjs')).href); await import(pathToFileURL(path.join(KORZEN, 'js/kalendarz-lista.mjs')).href); return globalThis.BM_KALENDARZ; }

test('1) kluczNazwy — edycje rzymskie/arabskie/rok nie rozdzielają tej samej imprezy', async () => {
  const k = (await K()).kluczNazwy;
  for (const n of ['XII Bieg Niepodległości 2026', '12. Bieg Niepodległości', 'Bieg Niepodległości', '13 Bieg Niepodległości', 'Bieg Niepodległości – XIII edycja', 'I Bieg Niepodległości']) assert.equal(k(n), 'biegniepodleglosci', n);
  assert.equal(k('VI Nocny Bieg Nyski'), 'nocnybiegnyski'); assert.equal(k('Bieg i Marsz Pamięci'), 'biegimarszpamieci', '„i" w środku zostaje');
  assert.equal(k('X'), 'x', 'sama litera nie znika'); assert.equal(k('Bieg 10 km'), 'biegkm');
});

test('2) toSamo — data ±1, klucz, miasto', async () => {
  const { toSamo } = await K();
  assert.equal(toSamo({ name: '12. Bieg Niepodległości', date: '2026-11-11', city: 'Warszawa' }, { nazwa: 'XIII Bieg Niepodległości', data: '2026-11-11', miejscowosc: 'Warszawa-Bemowo' }), true, 'dzielnica');
  assert.equal(toSamo({ name: 'Bieg Niepodległości', date: '2026-11-11', city: 'Poznań' }, { nazwa: 'Bieg Niepodległości', data: '2026-11-11', miejscowosc: 'Gdynia' }), false, 'inne miasto 11.11');
  assert.equal(toSamo({ name: 'Bieg Niepodległości', date: '2026-11-11', city: null }, { nazwa: 'Bieg Niepodległości', data: '2026-11-12', miejscowosc: 'Gdynia' }), true, 'bez miasta: ±1 dzień');
  assert.equal(toSamo({ name: 'Bieg Niepodległości', date: '2026-11-11', city: 'Gdynia' }, { nazwa: 'Bieg Niepodległości', data: '2026-11-13', miejscowosc: 'Gdynia' }), false, '2 dni = inna impreza');
});

test('3) scal + sortuj — nasza wygrywa i przejmuje klucz/link/dystanse; data, remis nasze pierwsze, miesiąc na koniec', async () => {
  const Kal = await K();
  const nasze = [{ id: 'r1', name: 'Bieg Niepodległości', date: '2026-11-11', city: 'Poznań', distance_km: 10, status: 'approved', cover_url: null }];
  const maszyna = [
    { nazwa: 'XII Bieg Niepodległości', data: '2026-11-11', miejscowosc: 'Poznań', dystanse: [5, 10], url: 'https://org.pl', klucz: 'kalendarz:abc', dokladnosc: 'dzien' },
    { nazwa: 'Bieg Niepodległości', data: '2026-11-11', miejscowosc: 'Gdynia', dystanse: [], url: null, klucz: 'kalendarz:gdy', dokladnosc: 'dzien' },
    { nazwa: 'Cross Listopadowy', data: '2026-11-01', miejscowosc: 'Luboń', dystanse: [], url: null, klucz: 'kalendarz:cl', dokladnosc: 'miesiac' },
    { nazwa: 'Bieg Andrzejkowy', data: '2026-11-28', miejscowosc: 'Kraków', dystanse: [10], url: null, klucz: 'kalendarz:ba', dokladnosc: 'dzien' },
  ];
  const l = Kal.scal(nasze, maszyna);
  assert.deepEqual(l.map((x) => x.zrodlo + ':' + x.nazwa), ['nasze:Bieg Niepodległości', 'maszyna:Bieg Niepodległości', 'maszyna:Bieg Andrzejkowy', 'maszyna:Cross Listopadowy']);
  const n = l[0]; assert.equal(n.klucz, 'kalendarz:abc'); assert.equal(n.url, 'https://org.pl'); assert.deepEqual(n.dystanse, [10, 5]);
  assert.equal(l[3].dokladnosc, 'miesiac', 'miesiąc na koniec listopada');
  assert.equal(Kal.scal([], []).length, 0);
});

test('4) typImprezy', async () => {
  const t = (await K()).typImprezy;
  for (const [n, d, oczek] of [['Grand Prix City Trail Poznań', [], 'ulica'], ['Ultramaraton Bieszczadzki', [], 'ultra'], ['Bieg Rzeźnika', [78], 'ultra'], ['Bieg Górski na Śnieżkę', [], 'trail'],
    ['Nocny Bieg Nyski', [10], 'ulica-noc'], ['Nordic Walking Mikołajki', [], 'nordic'], ['Cross Leśny', [], 'przelaj'], ['Bieg Parkowy', [5], 'przelaj'], ['Półmaraton Warszawski', [21.0975], 'ulica']]) assert.equal(t(n, d), oczek, n);
  assert.deepEqual((await K()).TYPY, ['ulica', 'ulica-noc', 'trail', 'ultra', 'przelaj', 'nordic']);
});

test('5) województwo z mapy miast', async () => {
  const w = (await K()).wojewodztwo;
  for (const [m, oczek] of [['Warszawa', 'mazowieckie'], ['Poznań', 'wielkopolskie'], ['Nowy Sącz', 'malopolskie'], ['Gorzów Wielkopolski', 'lubuskie'], ['Kostrzyn nad Odrą', 'lubuskie'], ['Warszawa-Bemowo', 'mazowieckie'],
    ['Władysławowo - Rozewie - Jastrzębia Góra', 'pomorskie'], ['Jelcz-Laskowice', 'dolnoslaskie'], ['Dobre Miasto', 'warminsko-mazurskie'], ['Nieznane Miasto', null], ['', null], [null, null]]) assert.equal(w(m), oczek, String(m));
  assert.ok(Object.keys((await K())._mapaMiast()).length >= 550, 'mapa ≥ 550 miejscowości');
});

test('6) filtruj — dystans „którykolwiek", bez dystansu ukryte i policzone, województwo, szukajka', async () => {
  const Kal = await K();
  const l = Kal.scal([{ id: 'r1', name: 'Nasz Półmaraton', date: '2026-12-05', city: 'Wrocław', voivodeship: 'dolnośląskie', distance_km: 21.097, status: 'approved' }],
    [{ nazwa: 'Bieg Mikołajkowy', data: '2026-12-06', miejscowosc: 'Poznań', dystanse: [5, 10], klucz: 'kalendarz:a' }, { nazwa: 'Bieg Zimowy', data: '2026-12-13', miejscowosc: 'Żory', dystanse: [], klucz: 'kalendarz:b' },
     { nazwa: 'Bieg Nieznany', data: '2026-12-20', miejscowosc: 'Centawa', dystanse: [10], klucz: 'kalendarz:c' }]);
  let w = Kal.filtruj(l, { dist: '10' }); assert.deepEqual(w.lista.map((x) => x.nazwa), ['Bieg Mikołajkowy', 'Bieg Nieznany']); assert.equal(w.bezDystansu, 1);
  w = Kal.filtruj(l, { dist: '10', pokazBezDystansu: true }); assert.equal(w.lista.length, 3);
  w = Kal.filtruj(l, { dist: '21.097' }); assert.deepEqual(w.lista.map((x) => x.nazwa), ['Nasz Półmaraton']);
  w = Kal.filtruj(l, { voi: 'wielkopolskie' }); assert.deepEqual(w.lista.map((x) => x.nazwa), ['Bieg Mikołajkowy']); assert.equal(w.bezWojewodztwa, 1, 'Centawa bez województwa');
  w = Kal.filtruj(l, { voi: 'dolnośląskie' }); assert.deepEqual(w.lista.map((x) => x.nazwa), ['Nasz Półmaraton']);
  w = Kal.filtruj(l, { q: 'mikolaj' }); assert.deepEqual(w.lista.map((x) => x.nazwa), ['Bieg Mikołajkowy']);
  w = Kal.filtruj(l, { q: 'zory' }); assert.deepEqual(w.lista.map((x) => x.nazwa), ['Bieg Zimowy'], 'miasto bez znaków');
  w = Kal.filtruj(l, { month: '2026-12', od: '2026-12-10' }); assert.deepEqual(w.lista.map((x) => x.nazwa), ['Bieg Zimowy', 'Bieg Nieznany']);
  assert.equal(Kal.okresZFiltra({}, '2026-11-02'), '90'); assert.equal(Kal.okresZFiltra({ do: '2026-11-20' }, '2026-11-02'), '30'); assert.equal(Kal.okresZFiltra({ month: '2027-05' }, '2026-11-02'), '365');
});

test('7) races.html — jedna lista, moduł, wyścig, karta maszyny', () => {
  const r = czytaj('races.html');
  assert.ok(r.indexOf('<script src="js/tekst.mjs"></script>') < r.indexOf('<script src="js/kalendarz-lista.mjs"></script>'), 'moduł po tekst.mjs');
  assert.doesNotMatch(r, /id="imprezy-sekcja"|id="imprezy-lista"|id="imprezy-q"/, 'bez osobnej sekcji „W Polsce"');
  assert.match(r, /await loadRaces\(\);\n\s*await loadMySignups\(\);\n\s*await okladkiLaduj\(\);[^\n]*\n\s*imprezyLaduj\(\);/, 'imprezy po naszych (i po mapie okładek)');
  assert.match(r, /const scalone = K\.scal\(nasze, _imprezyDostepne \? _imprezy : \[\]\);\n\s*const wynik = K\.filtruj\(scalone, filtryZPanelu\(\)\);/);
  assert.match(r, /html \+= x\.zrodlo === 'nasze' \? renderRaceCard\(x\.race\) : renderImprezaCard\(x\);/);
  const k = r.slice(r.indexOf('function renderImprezaCard'), r.indexOf('function imprezyStopka'));
  assert.doesNotMatch(k, /onclick="openRace/, 'karta maszyny nie otwiera modalu naszego startu');
  assert.match(k, /safeExternalHref\(x\.url, \{ tylkoHttps: true \}\)/); assert.match(k, /rel="noopener noreferrer"/); assert.match(k, /escHtml\(x\.nazwa\)/);
  assert.match(k, /kalendarz biegów w Polsce/, 'dyskretna etykieta źródła');
  // L3: zaślepka wg typu z biegamy-assets przez assetUrl + safeUrlAttr (nie z własnego originu — safeUrlAttr i SW .webp)
  assert.match(k, /safeUrlAttr\(window\.assetUrl\('kalendarz\/typ-' \+ x\.typ \+ '\.webp'\)\)/);
  assert.doesNotMatch(k, /assets\/kalendarz/, 'nie z własnego originu');
  assert.match(r, /naszeStarty: \[\] \}\)/, 'dedup w module, nie w IMPREZY');
  assert.doesNotMatch(r, /function getFiltered\(\)/);
});
