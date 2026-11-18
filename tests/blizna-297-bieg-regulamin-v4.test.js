/* BLIZNA 297 / 18.11 noc: regulamin 2026-11-v4 (zgoda Filipa na teksty z 18.11). Zmiana tylko w § 5 ust. 5 i § 8 ust. 1 (w odpowiedzi do Filipa omyłkowo „§ 9 ust. 1”;
   zdanie o liście stoi w § 8 ust. 1): ze zgodą na ranking dłuższy trening jest na liście z prawdziwym dystansem i czasem, bez miejsca (migracja 20261213).
   Tryb § 12 ust. 2 jak v3: zapisani na starszej wersji widzą „Zmiana regulaminu: …”, bez ponownej zgody. Strona przyjmuje v2 (bieg próbny), v3 i v4.
   Dane: noc-1311\prawdziwy\34f-regulamin-v4.sql (bieg-mikolajki v3 → v4). Czas bez miejsca w bazie tylko przy v4 (20261213, akcja_bieg_czas_bez_miejsca). */
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
const BIEG = (w, x) => Object.assign({ slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka', dzien_od: '2026-11-18', dzien_do: '2026-12-06', wynik_do: '2026-12-06',
  koniec_at: '2026-12-06T19:00:00+00:00', dystanse_km: [5], faza: 'trwa', regulamin_wersja: w, regulamin_od: '2026-11-18' }, x || {});
const LICZNIK = { imie: 'Fabianek' }, LINK = 'https://example.org/zbiorka';

test('wersje: strona przyjmuje v2, v3, v4 (i v5, blizna-298); obca wersja = WKRÓTCE', () => {
  assert.equal(B.WERSJA_TEKSTOW, '2026-11-v5'); assert.deepEqual([...B.WERSJE_TEKSTOW], ['2026-11-v2', '2026-11-v3', '2026-11-v4', '2026-11-v5']);
  for (const w of ['2026-11-v3', '2026-11-v4']) { const t = B.wartosciTekstow(BIEG(w), LICZNIK, LINK); assert.ok(t, w); assert.equal(t.koniec, 'niedzieli, 6 grudnia 2026, godz. 20:00', w + ': § 2 z godziną'); }
  assert.ok(B.wartosciTekstow(BIEG('2026-11-v2', { koniec_at: null, wynik_do: '2026-12-08' }), LICZNIK, LINK), 'v2 (bieg próbny)');
  assert.equal(B.wartosciTekstow(BIEG('2026-11-v6'), LICZNIK, LINK), null, 'nieznana wersja: WKRÓTCE');
  assert.equal(B.wartosciTekstow(BIEG('2026-11-v4', { koniec_at: null }), LICZNIK, LINK), null, 'v4 bez godziny końca w bazie: brak wartości');
  assert.deepEqual(B.brakiTekstow(BIEG('2026-11-v4', { koniec_at: null }), LICZNIK, LINK), ['koniec']);
  assert.equal(B.odWersji('2026-11-v4', 4), true); assert.equal(B.odWersji('2026-11-v3', 4), false); assert.equal(B.odWersji('x', 3), false);
});

test('v4 różni się od v3 tylko § 5 ust. 5 i § 8 ust. 1 (i linią wersji); dokładne brzmienie zatwierdzonych zdań', () => {
  const t3 = B.regulaminBloki(B.wartosciTekstow(BIEG('2026-11-v3'), LICZNIK, LINK)).map((b) => b.tekst);
  const t4 = B.regulaminBloki(B.wartosciTekstow(BIEG('2026-11-v4'), LICZNIK, LINK)).map((b) => b.tekst);
  assert.equal(t3.length, t4.length);
  const rozne = t3.map((x, i) => (x === t4[i] ? null : i)).filter((i) => i !== null);
  assert.equal(rozne.length, 3, 'trzy bloki: § 5 ust. 5, § 8 ust. 1, wersja');
  const [p5, p8, wer] = rozne.map((i) => [t3[i], t4[i]]);
  assert.equal(p5[1], p5[0].replace('; dłuższy trening daje ukończenie i dyplom z prawdziwym dystansem i czasem, bez miejsca w rankingu. Czas pozostałych uczestników nie jest publikowany.',
    '. Uczestnik, który zgodził się na ranking i przebiegł dłuższy dystans, jest na liście z prawdziwym dystansem i czasem, bez miejsca w rankingu; dyplom pokazuje prawdziwy dystans i czas. Czas uczestników bez zgody na ranking nie jest publikowany.'));
  assert.match(p5[1], /^5\. Bieg nie ma nagród\..* W rankingu liczy się trening od 5 km do 5,49 km\. Uczestnik, który zgodził się na ranking .* Dzieci nigdy nie są w rankingu\.$/);
  assert.equal(p8[1], p8[0].replace('lista pokazuje także czas i miejsce na zasadach z § 5 ust. 5.', 'lista pokazuje także czas, a przy treningu od 5 km do 5,49 km również miejsce (§ 5 ust. 5).'));
  assert.match(p8[1], /^1\. Na stronie biegu widoczne są liczby zbiorcze/);
  assert.equal(wer[1], wer[0].replace('2026-11-v3', '2026-11-v4'));
  assert.ok(t4.includes('§ 5. Wynik i ukończenie') && t4.includes('§ 8. Lista osób, które ukończyły, i dane osobowe'));
  assert.ok(B.regulaminTekst(B.wartosciTekstow(BIEG('2026-11-v4'), LICZNIK, LINK)).includes('Czas uczestników bez zgody na ranking nie jest publikowany.'), 'plik .txt z tymi samymi tekstami');
  const t2 = B.regulaminBloki(B.wartosciTekstow(BIEG('2026-11-v2', { koniec_at: null, wynik_do: '2026-12-08' }), LICZNIK, LINK)).map((b) => b.tekst).join('\n');
  assert.match(t2, /Czas pozostałych uczestników nie jest publikowany\./, 'v2 bez zmian');
});

test('komunikat zmiany (§ 12 ust. 2): v4 w bazie — „Zmiana regulaminu: …” od najstarszej wersji zapisu; v3 w bazie jak dotąd', () => {
  const K = (w, moi) => B.komunikatZmiany(BIEG(w), moi);
  assert.equal(K('2026-11-v4', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v3' }]), 'Zmiana regulaminu: przy dłuższym treningu osoby ze zgodą na ranking są na liście z prawdziwym dystansem i czasem, bez miejsca.');
  assert.equal(K('2026-11-v4', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v2' }]), 'Zmiana regulaminu: bieg i wyniki kończą się 6.12 o 20:00; przy dłuższym treningu osoby ze zgodą na ranking są na liście z prawdziwym dystansem i czasem, bez miejsca.');
  assert.equal(K('2026-11-v4', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v4' }]), '', 'zapis na v4: nic');
  assert.equal(K('2026-11-v4', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v3', wycofany_at: '2026-11-18T10:00:00Z' }]), '', 'wycofany: nic');
  assert.equal(K('2026-11-v4', []), ''); assert.equal(B.komunikatZmiany(null, []), '');
  assert.equal(K('2026-11-v3', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v2' }]), 'Zmiana: bieg i wyniki kończą się 6.12 o 20:00.', 'v3 w bazie (przed 34f): jak dotąd');
});

test('baza: czas bez miejsca tylko przy regulaminie v4 lub nowszym (20261213); plik danych 34f poza repo', () => {
  const m = czytaj('supabase/migrations/20261213_akcja_bieg_czas_bez_miejsca.sql');
  assert.ok(m.includes("and b.regulamin_wersja is not null and b.regulamin_wersja not in ('2026-11-v1', '2026-11-v2', '2026-11-v3')"));
  assert.match(m, /34f-regulamin-v4\.sql/);
  assert.doesNotMatch(czytaj('bieg.html'), /2026-11-v[234]/, 'bieg.html bez wersji na sztywno');
});
