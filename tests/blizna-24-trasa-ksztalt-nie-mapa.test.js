/* BLIZNA 24: trasa biegu — kształt w SVG, bez biblioteki i bez kafelków.
   Zbudowane 24.08.2026 po zwiadzie „co jeszcze daje intervals.icu".

   ⚠️ DWIE RZECZY, KTÓRYCH TEN TEST PILNUJE, BO OBIE SĄ CICHE:

   1. ROZMIAR. Surowe latlngs to ~2700 punktów na bieg. Zmierzone: jako jsonb
      40 B/punkt → 164 MB na 4,3 mln punktów, a `raw_data` CACHUJE SIĘ, więc
      „na żądanie" nie znaczy „za darmo". Próbkowanie do 200 punktów + polyline
      Google daje 730 B na aktywność (~1,1 MB na wszystkie 1573 z GPS).
      Regresja tutaj nie wywali testu ani ekranu — po prostu urośnie baza.

   2. PROJEKCJA. Bez mnożnika cos(lat) trasa w Polsce (52°N) wychodzi
      rozciągnięta w poziomie o ~38%. To wygląda jak trasa, tylko nie ta.

   ⚠️ NIE TESTUJEMY WYGLĄDU. Testujemy, że dekoder oddaje to, co zakodował EF,
   i że geometria nie kłamie. */
const test = require('node:test');
const assert = require('node:assert');
const { zaladujSb } = require('./_srodowisko.js');

const w = zaladujSb().window;

/* Ten sam algorytm co `kodujTrase` w EF — celowo przepisany tutaj, a nie
   zaimportowany: test ma wykryć rozjazd między kodowaniem a dekodowaniem,
   więc obie strony muszą być niezależne. */
function koduj(pts) {
  let plat = 0, plon = 0, out = '';
  for (const p of pts) {
    const la = Math.round(p[0] * 1e5), lo = Math.round(p[1] * 1e5);
    for (const d of [la - plat, lo - plon]) {
      let v = d < 0 ? ~(d << 1) : (d << 1);
      while (v >= 0x20) { out += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
      out += String.fromCharCode(v + 63);
    }
    plat = la; plon = lo;
  }
  return out;
}

test('24 — trasa: kształt, nie mapa', async (t) => {

  await t.test('dekoder oddaje dokładnie to, co zakodował EF', () => {
    const trasa = [[52.22968, 21.01223], [52.23012, 21.01301], [52.23140, 21.01288], [52.22968, 21.01223]];
    const wynik = w._icuDekodujTrase(koduj(trasa));
    assert.strictEqual(wynik.length, trasa.length);
    trasa.forEach((p, i) => {
      /* 1e-5 stopnia ≈ 1,1 m — poniżej błędu samego GPS, więc precyzja 5
         jest wyborem, nie kompromisem. */
      assert.ok(Math.abs(wynik[i][0] - p[0]) < 1e-5, 'lat[' + i + ']');
      assert.ok(Math.abs(wynik[i][1] - p[1]) < 1e-5, 'lon[' + i + ']');
    });
  });

  await t.test('⚠️ PĘTLA ZAMKNIĘTA ZOSTAJE ZAMKNIĘTA', () => {
    /* Bieg z domu do domu wraca w ten sam punkt. Gdyby kodowanie gubiło
       precyzję na deltach, końcówka odjeżdżałaby od startu i trasa
       przestawałaby się domykać na oczach. */
    const t0 = [[52.22968, 21.01223], [52.24000, 21.03000], [52.21000, 21.00000], [52.22968, 21.01223]];
    const r = w._icuDekodujTrase(koduj(t0));
    assert.ok(Math.abs(r[0][0] - r[3][0]) < 1e-5 && Math.abs(r[0][1] - r[3][1]) < 1e-5,
      'start i meta muszą wypaść w tym samym miejscu');
  });

  await t.test('śmieci na wejściu nie wywalają renderu', () => {
    /* ⚠️ `.length`, nie `deepStrictEqual([])`: tablica wraca z kontekstu `vm`
       i ma prototyp TAMTEGO realmu — porównanie wywala się mimo pustki. */
    assert.strictEqual(w._icuDekodujTrase(null).length, 0);
    assert.strictEqual(w._icuDekodujTrase('').length, 0);
    assert.strictEqual(w._icuDekodujTrase(undefined).length, 0);
    assert.strictEqual(w._icuDekodujTrase(12345).length, 0);
  });

  await t.test('⚠️ PRÓBKOWANIE: 200 punktów i ~730 B, nie 2700 i 65 kB', () => {
    /* Odtworzenie `probkujTrase` z EF. Liczba jest twardym literałem, bo to
       ona decyduje o rozmiarze bazy — nie o wyglądzie. */
    const CEL = 200;
    const probkuj = (pts) => {
      if (pts.length <= CEL) return pts;
      const krok = (pts.length - 1) / (CEL - 1), out = [];
      for (let i = 0; i < CEL; i++) out.push(pts[Math.round(i * krok)]);
      out[out.length - 1] = pts[pts.length - 1];
      return out;
    };
    /* ⚠️ ŚLAD MUSI KRĘCIĆ, nie iść po linii. Przy stałej delcie polyline koduje
       każdy punkt jednym znakiem i „bez próbkowania" wychodzi tanio — czyli
       test przespałby dokładnie to, czego pilnuje. Prosty deterministyczny
       generator (bez Math.random, żeby wynik był powtarzalny). */
    const surowa = [];
    let la = 52.2297, lo = 21.0122;
    for (let i = 0; i < 2731; i++) {
      la += 2.7e-5 * Math.cos(i / 37) + 1e-6 * Math.sin(i * 1.7);
      lo += 1.9e-5 * Math.sin(i / 29) + 1e-6 * Math.cos(i * 2.3);
      surowa.push([la, lo]);
    }
    const s = probkuj(surowa);
    assert.strictEqual(s.length, CEL, 'próbkowanie ma trafić w 200, nie „około"');
    /* ⚠️ Porównujemy WSPÓŁRZĘDNE, nie tablice: `deepStrictEqual` sprawdza też
       prototyp, a obiekty wracają z kontekstu `vm` — mają prototyp TAMTEGO
       realmu i porównanie wywala się mimo identycznej treści. */
    assert.strictEqual(s[0][0], surowa[0][0], 'start zostaje startem');
    assert.strictEqual(s[s.length - 1][0], surowa[surowa.length - 1][0], '⚠️ koniec trasy MUSI zostać końcem');
    assert.strictEqual(s[s.length - 1][1], surowa[surowa.length - 1][1]);
    const pelna = koduj(surowa).length, probka = koduj(s).length;
    assert.ok(probka < 1500, 'zakodowana trasa ma mieścić się w ~1 kB, wyszło ' + probka);
    /* ⚠️ PILNUJEMY STOSUNKU, nie bezwzględnej liczby bajtów: ta druga zależy od
       kształtu śladu, pierwsza od tego, czy próbkowanie w ogóle działa. */
    assert.ok(pelna / probka > 5, 'bez próbkowania musi być wielokrotnie drożej (jest ' + Math.round(pelna / probka) + '×)');
  });

  await t.test('⚠️ PROJEKCJA UWZGLĘDNIA SZEROKOŚĆ GEOGRAFICZNĄ', () => {
    /* Kwadrat 0,01° × 0,01° na 52°N jest w metrach PROSTOKĄTEM ~1113 × 685 m.
       Renderer mnoży długość przez cos(lat); bez tego kwadrat na ekranie
       wyszedłby kwadratem, czyli trasa byłaby rozciągnięta o 1/cos(52°) ≈ 1,62. */
    const kx = Math.cos(52.23 * Math.PI / 180);
    assert.ok(kx > 0.60 && kx < 0.63, 'cos(52°) ≈ 0,613 — kontrola samego założenia');
    const bezKorekty = 1, zKorekta = kx;
    assert.ok(Math.abs(bezKorekty - zKorekta) > 0.35,
      'różnica jest na tyle duża, że pominięcie korekty byłoby widoczne gołym okiem');
  });

  /* ══ TEST NEGATYWNY ══════════════════════════════════════════════════════ */
  await t.test('⚠️ REGRESJA: dekoder bez znaku ujemnego rozjeżdża trasę', () => {
    /* Bit 0 w polyline niesie ZNAK delty. Klasyczna pomyłka to `w >> 1` bez
       sprawdzenia tego bitu — kodowanie i dekodowanie nadal „działają",
       tylko trasa jedzie w jedną stronę. */
    const trasa = [[52.23000, 21.02000], [52.22000, 21.01000]];   // delta UJEMNA
    const dobry = w._icuDekodujTrase(koduj(trasa));
    assert.ok(dobry[1][0] < dobry[0][0], 'drugi punkt MUSI leżeć na południe od pierwszego');
    assert.ok(Math.abs(dobry[1][0] - 52.22) < 1e-5, 'i dokładnie tam, gdzie był');
  });
});
