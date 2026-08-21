/* BLIZNA 21: cytat motywacyjny jako treść, która ZAPRZECZA reszcie aplikacji.
   Zgłoszone przez Filipa 21.08.2026 przy okazji zdejmowania Armstronga z puli.

   ⚠️ KLASA BŁĘDU: treść dodana jako DEKORACJA i nigdy nieprzejrzana pod kątem
   tego, co twierdzi. Aplikacja pisała na karcie gotowości „zwolnij, przyjrzyj
   się regeneracji", a nad nią wyświetlała „ból na treningu to inwestycja".
   Dwa sprzeczne komunikaty na jednym ekranie — a uwierzy się w ten bardziej
   efektowny, czyli w zły.

   ⚠️ TEST JEST O ZASADZIE, NIE O LIŚCIE SŁÓW. Nie da się wyrazić „czy ten cytat
   szkodzi przeciążonemu" regexem — pierwszy przegląd robiony filtrem po słowach
   („ból", „granice") znalazł 2 z 8, bo przegapił „Płacz w treningu, śmiej się
   na mecie" i „Ciało robi to, do czego głowa go zmusi". Dlatego test pilnuje
   RZECZY SPRAWDZALNYCH: że konkretne zdania nie wróciły, że bramka gotowości
   działa i że pula nie skurczyła się poniżej sensownej rotacji. */
const test = require('node:test');
const assert = require('node:assert');
const { zaladujSb } = require('./_srodowisko.js');

const w = zaladujSb().window;

/* Zdjęte 21.08.2026 — każde mówi przeciążonemu „dociśnij". */
const ZDJETE = [
  'Zostaw wszystko na trasie',            // opróżnij się za każdym razem
  'Ból na treningu to inwestycja',        // ból = waluta wyniku
  'Im więcej się pocisz',                 // im więcej, tym lepiej
  'Płacz w treningu',                     // cierpienie to cena
  'Ciało robi to, do czego głowa',        // wprost: zignoruj ciało
];

test('21 — cytaty są komunikatem, nie ozdobą', async (t) => {

  await t.test('⚠️ ZDJĘTE PIĘĆ NIE WRÓCIŁO', () => {
    const cala = w.QUOTES_LIBRARY.map(q => q.text).join(' | ');
    for (const frag of ZDJETE) {
      assert.ok(!cala.includes(frag), 'wrócił cytat gloryfikujący ból: „' + frag + '…"');
    }
  });

  await t.test('⚠️ DOMYŚLNIE pula jest BEZPIECZNA — nieznana gotowość nie odblokowuje', () => {
    /* Na ekranie głównym gotowości NIE ZNAMY (liczy się dopiero na FORMIE),
       więc domyślny wariant musi być ostrożny, nie odważny. */
    for (let d = 0; d < 400; d++) {
      assert.ok(!w.getDailyQuote(d).tylkoGotowy,
        'warunkowy cytat wyciekł do puli domyślnej w dniu +' + d);
    }
    assert.ok(!w.getDailyQuoteSet(5).some(q => q.tylkoGotowy));
    assert.ok(!w.getDailyQuoteSet(20).some(q => q.tylkoGotowy));
  });

  await t.test('przy wysokiej gotowości warunkowe SĄ dostępne', () => {
    assert.strictEqual(w.getDailyQuote(0, 'wysoka') !== undefined, true);
    const pelna = w.QUOTES_LIBRARY.length, bezp = w.QUOTES_BEZPIECZNE().length;
    assert.ok(pelna > bezp, 'pula przy wysokiej gotowości ma być SZERSZA, nie inna');
  });

  await t.test('⚠️ PULA ADDYTYWNA, NIE ROZŁĄCZNA — inaczej rotacja trzech zdań', () => {
    /* To jest wynik pomiaru, nie gust: warunkowych jest trzy. Osobna rotacja
       dla „wysokiej gotowości" pokazywałaby te same trzy zdania w kółko —
       gorzej niż brak podziału. Pilnujemy, żeby nikt tego nie „uprościł". */
    const warunkowe = w.QUOTES_LIBRARY.filter(q => q.tylkoGotowy);
    assert.ok(warunkowe.length < 10,
      'warunkowych jest ' + warunkowe.length + ' — przy takiej liczbie rozłączna pula NADAL nie ma sensu');
    const bezp = w.QUOTES_BEZPIECZNE();
    assert.ok(bezp.length > 40,
      'pula bezpieczna spadła do ' + bezp.length + ' — poniżej sensownej rotacji dziennej');
    // pula przy wysokiej gotowości = bezpieczna + warunkowe, bez gubienia czegokolwiek
    assert.strictEqual(w.QUOTES_LIBRARY.length, bezp.length + warunkowe.length);
  });

  await t.test('każdy cytat ma tekst i autora — brak pustych wpisów po usuwaniu', () => {
    w.QUOTES_LIBRARY.forEach((q, i) => {
      assert.ok(q && q.text && q.text.trim().length > 5, 'pusty tekst na pozycji ' + i);
      assert.ok(q.author && q.author.trim().length > 1, 'brak autora na pozycji ' + i);
    });
  });

  await t.test('⚠️ ARMSTRONG NIE WRÓCIŁ', () => {
    assert.ok(!w.QUOTES_LIBRARY.some(q => /armstrong/i.test(q.author)));
  });

  /* ══ TEST NEGATYWNY ══════════════════════════════════════════════════════
     Dowód, że bramka gotowości cokolwiek robi. */
  await t.test('⚠️ REGRESJA: bez bramki warunkowe WYSZŁYBY do wszystkich', () => {
    const bezBramki = (d) => w.QUOTES_LIBRARY[
      (2026 * 10000 + 100 + 1 + d) % w.QUOTES_LIBRARY.length];
    let trafien = 0;
    for (let d = 0; d < 400; d++) if (bezBramki(d).tylkoGotowy) trafien++;
    assert.ok(trafien > 0,
      'gdyby warunkowe nigdy nie wypadały nawet BEZ bramki, test bramki byłby pusty');
  });
});
