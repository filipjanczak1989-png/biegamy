// Blizna #384 (26.11.2026) — nowe Dziś: wybór kadru dnia do nagłówka (plan dzis\grafiki\plan-kadr.md, commit 4).
//
// Stare Dziś dobiera kadr funkcją SOLO z sb.js. Nowy moduł rysuje szkielet, zanim strona wczyta sb.js, a adres kadru
// musi być znany już wtedy, więc wybór jest własną, czystą funkcją modułu. Ten commit to sam WYBÓR: na ekranie nic.
// Decyzje Filipa 25.11: dobór bez rodzaju treningu; pora roku, pogoda, pora dnia; anty-powtórka; stały w ciągu dnia.
// Lista kadrów jest wpisana w module i MUSI zgadzać się z assets/ui/dzis/kadry/kadry.json oraz z plikami w katalogu:
// rozjazd = pusta ramka w nagłówku albo plik, którego nikt nie pokaże.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { strona, MODUL } = require('./_dzis-nowy-strona.js');

const KATALOG = path.join(__dirname, '..', 'assets', 'ui', 'dzis', 'kadry');
const B = () => strona().B;
const dzien = (m, d, h) => new Date(2026, m - 1, d, h, 0, 0);
const id = (B2, o) => { const k = B2.wybierzKadr(o); return k ? k.id : null; };
const DZIENNE_BEZ = ['zima-bulwar', 'zima-sciezka', 'zima-stadion'];

test('(1) lista w module = kadry.json = pliki w katalogu (oba rozmiary, limity wagi, nic ponad listę)', () => {
  const json = JSON.parse(fs.readFileSync(path.join(KATALOG, 'kadry.json'), 'utf8'));
  const zModulu = Array.from(B().KADRY).map((k) => Array.from(k)), zJson = json.kadry.map((k) => [k.id, k.pora_roku, k.pogoda, k.pora_dnia, k.tlo].concat(k.szeroki ? [k.szeroki] : []));   // szósty element = panorama „szeroki” (P1c, blizna-410)
  assert.deepEqual(zModulu, zJson, 'te same kadry, w tej samej kolejności, z tymi samymi cechami i kolorem tła');
  assert.equal(new Set(zModulu.map((k) => k[0])).size, zModulu.length);
  for (const k of zModulu) { assert.match(k[0], /^[a-z]+-[a-z]+$/); assert.ok(['zima', 'wiosna', 'lato', 'jesien'].includes(k[1])); assert.ok([null, 'snieg', 'deszcz'].includes(k[2])); assert.ok(['dzien', 'zmrok'].includes(k[3])); assert.match(k[4], /^#[0-9a-f]{6}$/); }
  const oczekiwane = ['kadry.json'];
  for (const k of zModulu) for (const r of json.rozmiary) {
    const plik = k[0] + '-' + r.szerokosc + '.webp'; oczekiwane.push(plik);
    const waga = fs.statSync(path.join(KATALOG, plik)).size;
    assert.ok(waga > 5000 && waga <= r.limit_bajtow, plik + ': ' + waga + ' B (limit ' + r.limit_bajtow + ')');
  }
  for (const k of zModulu) if (k[5]) oczekiwane.push(k[5] + '.webp');   // panorama do tła na komputerze: plik musi istnieć (blizna-410)
  assert.deepEqual(json.rozmiary.map((r) => r.szerokosc), [960, 1280], 'moduł składa srcset z tych dwóch szerokości');
  assert.deepEqual(fs.readdirSync(KATALOG).sort(), oczekiwane.sort(), 'w katalogu nie ma pliku spoza listy i żadnego nie brakuje');
});

test('(2) pora dnia: po zmroku tylko kadry „zmrok”, w dzień tylko dzienne; zimą granica 16:00 i 7:00', () => {
  const b = B();
  for (const h of [7, 9, 12, 15]) assert.ok(DZIENNE_BEZ.includes(id(b, { teraz: dzien(12, 10, h) })), h + ':00 dzień');
  for (const h of [16, 19, 23, 0, 6]) assert.equal(id(b, { teraz: dzien(12, 10, h) }), 'zima-latarnie', h + ':00 zmrok, bez danych pogody');
  assert.equal(b.wybierzKadr({ teraz: dzien(12, 10, 15) }).pora, 'dzien'); assert.equal(b.wybierzKadr({ teraz: dzien(12, 10, 16) }).pora, 'zmrok');
  assert.deepEqual(JSON.parse(JSON.stringify(b.wybierzKadr({ teraz: dzien(12, 10, 16) }))), { id: 'zima-latarnie', tlo: '#2d2a25', pora: 'zmrok', sezon: 'zima', dzien: '2026-12-10' });
});

test('(3) pogoda: śnieg i deszcz wybierają kadr z tą cechą; bez danych pogody nigdy kadr ze śniegiem ani deszczem', () => {
  const b = B();
  assert.equal(id(b, { teraz: dzien(12, 10, 12), pogoda: 'snieg' }), 'zima-park');
  assert.equal(id(b, { teraz: dzien(12, 10, 12), pogoda: 'deszcz' }), 'zima-deszcz');
  assert.equal(id(b, { teraz: dzien(12, 10, 19), pogoda: 'snieg' }), 'zima-dwoje');
  assert.equal(id(b, { teraz: dzien(12, 10, 19), pogoda: 'deszcz' }), 'zima-latarnie', 'po zmroku nie ma kadru z deszczem: kadr bez cechy pogodowej, nie dzienny i nie śnieżny');
  for (let d = 1; d <= 28; d++) for (const h of [10, 20]) for (const p of [null, undefined, 'mgla', 'upal']) {
    const k = id(b, { teraz: dzien(1, d, h), pogoda: p });
    assert.ok(!['zima-park', 'zima-dwoje', 'zima-deszcz'].includes(k), d + '.01 ' + h + ':00 pogoda ' + p + ' → ' + k);
  }
});

test('(4) pora roku twardo; dopóki pora roku nie ma własnych kadrów, bierze zimowe z zimową granicą zmroku', () => {
  const b = B();
  for (const [m, d] of [[11, 26], [3, 15], [7, 1], [10, 5]]) { const k = b.wybierzKadr({ teraz: dzien(m, d, 12) }); assert.equal(k.sezon, 'zima', m + ' miesiąc'); assert.ok(DZIENNE_BEZ.includes(k.id)); }
  assert.equal(b.wybierzKadr({ teraz: dzien(7, 1, 17) }).pora, 'zmrok', 'lipiec na zimowych kadrach: granica zimowa, bo kadr „dzień” o 17:00 pokazuje zimowy dzień');
  // gdy pojawią się letnie kadry, lato bierze tylko je i ma własną granicę zmroku
  const LATO = Array.from(b.KADRY).concat([['lato-las', 'lato', null, 'dzien', '#223322'], ['lato-noc', 'lato', null, 'zmrok', '#111122']]);
  assert.equal(id(b, { teraz: dzien(7, 1, 17), kadry: LATO }), 'lato-las'); assert.equal(id(b, { teraz: dzien(7, 1, 22), kadry: LATO }), 'lato-noc');
  assert.equal(id(b, { teraz: dzien(7, 1, 12), kadry: LATO, pogoda: 'snieg' }), 'lato-las', 'śnieg w danych nie przenosi lata do zimowych kadrów');
  assert.ok(DZIENNE_BEZ.includes(id(b, { teraz: dzien(1, 5, 12), kadry: LATO })));
  assert.equal(b.wybierzKadr({ teraz: dzien(1, 5, 12), kadry: [] }), null, 'pusta lista: brak kadru, nie wyjątek');
  assert.equal(id(b, { teraz: dzien(1, 5, 20), kadry: [['zima-a', 'zima', null, 'dzien', '#000000']] }), 'zima-a', 'brak kadru na zmrok: lepszy dzienny niż pusta ramka');
});

test('(5) anty-powtórka: nie ten sam co wczoraj i przedwczoraj; trzy dzienne kadry krążą; gdy nic nie zostaje, odpada tylko ona', () => {
  const b = B(); let pam = [], bylo = [];
  for (let d = 1; d <= 9; d++) { const k = b.wybierzKadr({ teraz: dzien(12, d, 12), pamiec: pam }); bylo.push(k.id); pam = pam.concat([[k.dzien, k.pora, k.id]]); }
  for (let i = 2; i < bylo.length; i++) { assert.notEqual(bylo[i], bylo[i - 1], 'dzień ' + (i + 1)); assert.notEqual(bylo[i], bylo[i - 2], 'dzień ' + (i + 1) + ' vs przedwczoraj'); }
  assert.deepEqual([...new Set(bylo)].sort(), DZIENNE_BEZ, 'wszystkie trzy są w obiegu');
  const wczoraj = [['2026-12-09', 'zmrok', 'zima-latarnie'], ['2026-12-08', 'zmrok', 'zima-latarnie']];
  assert.equal(id(b, { teraz: dzien(12, 10, 19), pamiec: wczoraj }), 'zima-latarnie', 'jedyny kadr na zmrok bez śniegu: wraca mimo powtórki, nie zamienia się w śnieżny ani dzienny');
  assert.equal(id(b, { teraz: dzien(12, 10, 12), pogoda: 'snieg', pamiec: [['2026-12-09', 'dzien', 'zima-park']] }), 'zima-park', 'śnieg drugi dzień: dalej kadr ze śniegiem');
  assert.equal(id(b, { teraz: dzien(12, 10, 12), pamiec: [['2026-12-01', 'dzien', id(b, { teraz: dzien(12, 10, 12) })]] }), id(b, { teraz: dzien(12, 10, 12) }), 'sprzed tygodnia nie blokuje');
});

test('(6) stały w ciągu dnia dla pory dnia: zapamiętany kadr zostaje mimo zmiany pogody; o zmroku osobny wybór', () => {
  const b = B(), rano = b.wybierzKadr({ teraz: dzien(12, 10, 8) });
  const pam = [[rano.dzien, rano.pora, rano.id]];
  assert.equal(id(b, { teraz: dzien(12, 10, 13), pamiec: pam, pogoda: 'snieg' }), rano.id, 'w południe zaczęło sypać: kadr się nie podmienia pod palcem');
  assert.equal(id(b, { teraz: dzien(12, 10, 17), pamiec: pam, pogoda: 'snieg' }), 'zima-dwoje', 'po 16:00 inna pora dnia, więc nowy wybór');
  assert.equal(id(b, { teraz: dzien(12, 11, 8), pamiec: pam, pogoda: 'snieg' }), 'zima-park', 'następnego dnia wybór od nowa');
  assert.equal(id(b, { teraz: dzien(12, 10, 13), pamiec: [['2026-12-10', 'dzien', 'nie-ma-takiego']] }), rano.id, 'zapamiętany kadr zniknął z listy: zwykły wybór');
  assert.equal(id(b, { teraz: dzien(12, 10, 13), pamiec: [['2026-12-10', 'dzien', 'zima-latarnie']] }), rano.id, 'zapamiętany kadr nie pasuje do pory dnia: zwykły wybór');
  assert.equal(id(b, { teraz: dzien(12, 10, 8) }), id(b, { teraz: dzien(12, 10, 15) }), 'bez pamięci (tryb prywatny) wybór zależy tylko od daty, więc też jest stały');
});

test('(7) kadr na teraz: pogoda z pamięci karty („weather:”, tylko odczyt) i ze stanu strony; pamięć telefonu pod kluczem dn_kadr; brak pamięci nie wywraca', () => {
  const pogoda = (kod, opady) => ({ ts: 1, data: { city: 'Poznań', days: [{ date: '2026-11-25', weather_code: 0 }, { date: '2026-11-26', weather_code: kod, precip_pct: opady || 0, temp_min: -2, temp_max: 1, label: 'x' }] } });
  const zKarta = (wpis) => { const s = strona(); const m = new Map(wpis ? [['inny', '{}'], ['weather:poznań', JSON.stringify(wpis)]] : []); s.w.sessionStorage = { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => m.get(k), setItem() { throw new Error('zapis do pamięci karty'); }, removeItem() { throw new Error('kasowanie z pamięci karty'); } }; return s; };
  const T = new Date(2026, 10, 26, 12, 0, 0);
  assert.equal(zKarta(pogoda(73)).B.pogodaKadru(T), 'snieg'); assert.equal(zKarta(pogoda(85)).B.pogodaKadru(T), 'snieg');
  assert.equal(zKarta(pogoda(61)).B.pogodaKadru(T), 'deszcz'); assert.equal(zKarta(pogoda(3, 70)).B.pogodaKadru(T), 'deszcz'); assert.equal(zKarta(pogoda(95)).B.pogodaKadru(T), 'deszcz');
  assert.equal(zKarta(pogoda(3, 20)).B.pogodaKadru(T), null); assert.equal(zKarta(pogoda(45)).B.pogodaKadru(T), null, 'mgła nie ma własnego kadru');
  assert.equal(zKarta(null).B.pogodaKadru(T), null); assert.equal(strona().B.pogodaKadru(T), null, 'strona bez pamięci karty');
  assert.equal(zKarta(pogoda(73)).B.pogodaKadru(new Date(2026, 10, 27, 12)), null, 'w pamięci nie ma dzisiejszego dnia: nie zgadujemy z wczorajszego');
  const zeStrony = strona(); zeStrony.w._weatherCache = pogoda(73).data; assert.equal(zeStrony.B.pogodaKadru(T), 'snieg', 'stan strony (kafel pogody już wczytany)');
  const s = zKarta(pogoda(73)), k = s.B.kadrNaTeraz(T);
  assert.equal(k.id, 'zima-park');
  assert.deepEqual(JSON.parse(s.tel.mapa.get('dn_kadr')), [['2026-11-26', 'dzien', 'zima-park']]);
  s.w.sessionStorage = { length: 0, key: () => null, getItem: () => null };
  assert.equal(s.B.kadrNaTeraz(new Date(2026, 10, 26, 14)).id, 'zima-park', 'śnieg zniknął z pamięci karty: kadr zostaje do zmroku');
  assert.equal(s.B.kadrNaTeraz(new Date(2026, 10, 26, 18)).id, 'zima-latarnie');
  assert.deepEqual(JSON.parse(s.tel.mapa.get('dn_kadr')), [['2026-11-26', 'dzien', 'zima-park'], ['2026-11-26', 'zmrok', 'zima-latarnie']], 'jeden wpis na porę dnia, bez dubli');
  for (let d = 27; d <= 30; d++) for (const h of [10, 18]) s.B.kadrNaTeraz(new Date(2026, 10, d, h));
  for (let d = 1; d <= 3; d++) s.B.kadrNaTeraz(new Date(2026, 11, d, 10));
  assert.equal(JSON.parse(s.tel.mapa.get('dn_kadr')).length, 8, 'pamięć nie rośnie bez końca');
  const prywatny = strona(); prywatny.tel.getItem = () => { throw new Error('SecurityError'); }; prywatny.tel.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.ok(DZIENNE_BEZ.includes(prywatny.B.kadrNaTeraz(T).id), 'tryb prywatny: wybór działa, nic nie rzuca');
  const smiec = strona(); smiec.tel.mapa.set('dn_kadr', '{"to":"nie lista"}'); assert.ok(DZIENNE_BEZ.includes(smiec.B.kadrNaTeraz(T).id)); smiec.tel.mapa.set('dn_kadr', 'nie json'); assert.ok(smiec.B.kadrNaTeraz(T));
  assert.doesNotMatch(MODUL.replace(/\/\*[\s\S]*?\*\//g, ''), /solo_dzien|SOLO\./, 'własny klucz i własna funkcja, nie pamięć starego doboru kadru');
});

test('(8) domknięcia po mutacjach: jesień z własnymi kadrami, anty-powtórka wbrew kolejce, dwie pory dnia w pamięci, różne kadry bez pamięci, tylko wpisy „weather:”', () => {
  const b = B();
  // listopad to jesień: gdy dojdą jesienne kadry, bierze je z jesienną granicą zmroku (18:00), nie zimową
  const JESIEN = Array.from(b.KADRY).concat([['jesien-park', 'jesien', null, 'dzien', '#332211'], ['jesien-noc', 'jesien', null, 'zmrok', '#110011']]);
  assert.equal(id(b, { teraz: dzien(11, 26, 17), kadry: JESIEN }), 'jesien-park'); assert.equal(id(b, { teraz: dzien(11, 26, 18), kadry: JESIEN }), 'jesien-noc');
  assert.equal(b.wybierzKadr({ teraz: dzien(12, 1, 17), kadry: JESIEN }).sezon, 'zima', 'grudzień to już zima');
  // anty-powtórka musi działać także wtedy, gdy kolejka z daty wskazałaby wczorajszy kadr
  for (let d = 5; d <= 12; d++) {
    const dzis = id(b, { teraz: dzien(12, d, 12) });
    assert.notEqual(id(b, { teraz: dzien(12, d, 12), pamiec: [[b.wybierzKadr({ teraz: dzien(12, d - 1, 12) }).dzien, 'dzien', dzis]] }), dzis, d + '.12: wczoraj był ten sam, który dziś wypada z daty');
    assert.notEqual(id(b, { teraz: dzien(12, d, 12), pamiec: [[b.wybierzKadr({ teraz: dzien(12, d - 2, 12) }).dzien, 'dzien', dzis]] }), dzis, d + '.12: przedwczoraj');
  }
  // w pamięci są obie pory dnia z dzisiaj (ktoś wszedł wieczorem, potem cofnął zegar albo wpisy przyszły w tej kolejności): liczy się wpis dla bieżącej pory
  const rano = id(b, { teraz: dzien(12, 10, 8) });
  assert.equal(id(b, { teraz: dzien(12, 10, 13), pogoda: 'snieg', pamiec: [['2026-12-10', 'dzien', rano], ['2026-12-10', 'zmrok', 'zima-latarnie']] }), rano);
  assert.equal(id(b, { teraz: dzien(12, 10, 19), pogoda: 'snieg', pamiec: [['2026-12-10', 'zmrok', 'zima-latarnie'], ['2026-12-10', 'dzien', rano]] }), 'zima-latarnie');
  // bez pamięci (tryb prywatny) kadry i tak się zmieniają z dnia na dzień
  assert.ok(new Set([1, 2, 3, 4, 5, 6].map((d) => id(b, { teraz: dzien(12, d, 12) }))).size >= 3, 'sześć dni bez pamięci: w obiegu wszystkie trzy dzienne kadry');
  // z pamięci karty czytamy tylko wpisy „weather:”
  const pog = (kod) => JSON.stringify({ ts: 1, data: { days: [{ date: '2026-11-26', weather_code: kod }] } });
  const s = strona(), m = new Map([['cos-innego', pog(73)], ['weather:poznań', pog(61)]]);
  s.w.sessionStorage = { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => m.get(k) };
  assert.equal(s.B.pogodaKadru(new Date(2026, 10, 26, 12)), 'deszcz', 'obcy wpis ze „śniegiem” jest pomijany');
});
