/* BLIZNA 23: pole `cadence` niosło cztery różne wielkości pod jedną etykietą.
   Znalezione 24.08.2026 przy zwiadzie „co jeszcze daje intervals.icu".

   ⚠️ KLASA BŁĘDU: dane BYŁY zapisywane i BYŁY pokazywane — tylko znaczyły co
   innego, niż mówił podpis. To nie jest brak funkcji, tylko cicha nieprawda,
   i dlatego nikt tego nie zgłosił przez trzy miesiące.

   intervals.icu oddaje `average_cadence` w RPM JEDNEJ NOGI, tak samo dla
   każdego sportu. Zmierzone na produkcji 24.08.2026:
     Run (n=274)           58–93,  mediana 82   → biegowo 116–186 kroków/min
     Walk (n=42)           48–79
     OpenWaterSwim (n=2)   23–30   ← tempo RAMION, nie nóg
     Siłownia (n=9)         8–95   ← dolny kraniec to „16 kroków/min"
     Spacer               do 145   ← „290 kroków/min"
     Ride (n=7)             0 z 7 ma cokolwiek (brak czujnika)
   Mnożnik ×2 był rozsypany po PIĘCIU miejscach w trzech plikach i nigdzie nie
   pytał o typ treningu. Pływanie pokazywało się jako „👣 46 kroków/min".

   ⚠️ TEN TEST PILNUJE PODPISU, NIE LICZBY. Wolno nie pokazać kadencji.
   Nie wolno pokazać cudzej wielkości pod nazwą „kroków/min". */
const test = require('node:test');
const assert = require('node:assert');
const { zaladujSb } = require('./_srodowisko.js');

const w = zaladujSb().window;

test('23 — kadencja nie jest krokami', async (t) => {

  await t.test('bieg: RPM jednej nogi × 2 = kroki na minutę', () => {
    /* ⚠️ LITERAŁY z realnego zakresu produkcyjnego, nie z wyobraźni. */
    assert.strictEqual(w.kadencjaSpm(82, 'Spokojny'), 164, 'mediana biegów');
    assert.strictEqual(w.kadencjaSpm(58, 'Wybieganie'), 116, 'najniższy realny bieg');
    assert.strictEqual(w.kadencjaSpm(93, 'Interwały'), 186, 'najwyższy realny bieg');
    assert.strictEqual(w.kadencjaSpm(77.5, 'Tempo'), 155, 'ułamek zaokrągla się');
  });

  await t.test('⚠️ NIE-BIEG NIE DOSTAJE PRZELICZENIA — to inna wielkość', () => {
    /* Każda z tych wartości SIEDZI DZIŚ W BAZIE i każda była mnożona ×2. */
    assert.strictEqual(w.kadencjaSpm(23, 'Zastępczy'), null, 'pływanie: tempo ramion, nie kroki');
    assert.strictEqual(w.kadencjaSpm(30, 'Zastępczy'), null);
    assert.strictEqual(w.kadencjaSpm(8, 'Siłownia'), null, 'siłownia: „16 kroków/min" pod ikoną stopy');
    assert.strictEqual(w.kadencjaSpm(145, 'Spacer'), null, 'spacer: „290 kroków/min"');
    assert.strictEqual(w.kadencjaSpm(68, 'Zastępczy'), null, 'rower: RPM korby to nie kroki');
  });

  await t.test('⚠️ ZERO ZNACZY „NIE ZMIERZONO", NIE „ZERO KROKÓW"', () => {
    /* W całej bazie nie ma dziś wiersza z `cadence = 0` — intervals pomija pole,
       gdy zegarek nie mierzy (14 z 347 rekordów szczegółów ma tam NULL). Ta
       asercja jest zabezpieczeniem na wypadek, gdyby zaczęli wysyłać 0. */
    assert.strictEqual(w.kadencjaSpm(0, 'Spokojny'), null);
    assert.strictEqual(w.kadencjaSpm(null, 'Spokojny'), null);
    assert.strictEqual(w.kadencjaSpm(undefined, 'Spokojny'), null);
    assert.strictEqual(w.kadencjaSpm('', 'Spokojny'), null);
    assert.strictEqual(w.kadencjaSpm(-5, 'Spokojny'), null, 'ujemna też jest brakiem, nie danymi');
  });

  await t.test('brak typu = brak podstawy, żeby nazwać to krokami', () => {
    assert.strictEqual(w.kadencjaSpm(82, null), null);
    assert.strictEqual(w.kadencjaSpm(82, undefined), null);
    assert.strictEqual(w.kadencjaSpm(82, ''), null);
  });

  await t.test('druga linia obrony: wynik poza zakresem biegowym odpada', () => {
    /* Gdyby typ był wpisany błędnie („Spokojny" dla przejażdżki), sam zakres
       jeszcze łapie absurd. Zakres jest szerszy niż realne 116–186, żeby nie
       zjadł prawdy. */
    assert.strictEqual(w.kadencjaSpm(45, 'Spokojny'), null, '90 spm to marsz, nie bieg');
    assert.strictEqual(w.kadencjaSpm(130, 'Spokojny'), null, '260 spm nie istnieje');
    assert.strictEqual(w.kadencjaSpm(50, 'Spokojny'), 100, 'brzeg zakresu przechodzi');
    assert.strictEqual(w.kadencjaSpm(120, 'Spokojny'), 240, 'drugi brzeg też');
  });

  await t.test('typ jest odporny na wielkość liter i spacje', () => {
    assert.strictEqual(w.kadencjaSpm(82, 'spokojny'), 164);
    assert.strictEqual(w.kadencjaSpm(82, '  Spokojny  '), 164);
  });

  /* ══ TEST NEGATYWNY ══════════════════════════════════════════════════════
     Dowód, że bramka na typ pilnuje czegoś realnego, a nie powtarza tego,
     co i tak by wyszło. */
  await t.test('⚠️ REGRESJA: bez bramki na typ pływanie wraca jako „46 kroków/min"', () => {
    const bezBramki = (c) => Math.round(c * 2);        // kod sprzed 24.08.2026
    assert.strictEqual(bezBramki(23), 46, 'tak wyglądał stary wynik dla pływania');
    assert.strictEqual(bezBramki(8), 16, '…i dla siłowni');
    assert.notStrictEqual(w.kadencjaSpm(23, 'Zastępczy'), bezBramki(23),
      'gdyby helper nie patrzył na typ, oba wyniki byłyby identyczne i test nic by nie pilnował');
    assert.strictEqual(w.kadencjaSpm(82, 'Spokojny'), bezBramki(82),
      'dla biegu obie ścieżki MUSZĄ dawać to samo — inaczej zmieniliśmy liczbę, nie tylko podpis');
  });
});
