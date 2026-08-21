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

  await t.test('⚠️ PRÓG 60 dzieli pule dokładnie tam, gdzie ma', () => {
    /* ⚠️ LITERAŁ, NIE `w.PROG_GOTOWOSCI_CYTATY` — porównanie ze stałą z kodu
       byłoby samozwrotne i przespałoby zmianę progu. Skąd 60: gotowość to
       clamp(TSB+50), więc 60 ⟺ TSB +10, czyli okolica formy startowej. */
    assert.strictEqual(w.PROG_GOTOWOSCI_CYTATY, 60, 'próg rozjechał się z tym, co pilnuje test');
    assert.strictEqual(w._pulaCytatow(59).length, w.QUOTES_BEZPIECZNE().length, '59 to jeszcze pula bezpieczna');
    assert.strictEqual(w._pulaCytatow(60).length, w.QUOTES_LIBRARY.length, '60 to już pula pełna');
    assert.strictEqual(w._pulaCytatow(undefined).length, w.QUOTES_BEZPIECZNE().length, 'nie wiadomo → bezpieczna');
    assert.strictEqual(w._pulaCytatow(0).length, w.QUOTES_BEZPIECZNE().length);
  });

  await t.test('⚠️ BRAMKA ŚWIEŻOŚCI: zapis starszy niż doba jest odrzucany', () => {
    /* Wczorajsza świeżość u kogoś, kto właśnie zrobił mocny akcent, to nieprawda —
       a ta nieprawda odblokowałaby cytat „dociśnij". */
    const dzien = (przesun) => w._dzienWaw(new Date(Date.now() - przesun * 864e5).toISOString());
    const magazyn = {};
    global.localStorage = w.localStorage = {
      getItem: (k) => (k in magazyn ? magazyn[k] : null),
      setItem: (k, v) => { magazyn[k] = String(v); },
    };
    const poprzedni = w._formaLast; w._formaLast = null;   // wymuś ścieżkę z pamięci

    magazyn.bm_gotowosc = JSON.stringify({ g: 75, d: dzien(0) });
    assert.strictEqual(w.gotowoscDoCytatu(), 75, 'zapis z dziś ma być uznany');
    magazyn.bm_gotowosc = JSON.stringify({ g: 75, d: dzien(1) });
    assert.strictEqual(w.gotowoscDoCytatu(), 75, 'zapis z wczoraj jeszcze uznany');
    magazyn.bm_gotowosc = JSON.stringify({ g: 75, d: dzien(2) });
    assert.strictEqual(w.gotowoscDoCytatu(), undefined, 'sprzed dwóch dni — ODRZUCONY');
    magazyn.bm_gotowosc = 'to nie jest json';
    assert.strictEqual(w.gotowoscDoCytatu(), undefined, 'śmieci w pamięci nie mogą rzucać');
    delete magazyn.bm_gotowosc;
    assert.strictEqual(w.gotowoscDoCytatu(), undefined, 'brak zapisu → nie wiadomo');

    w._formaLast = poprzedni;
  });

  await t.test('gotowość z BIEŻĄCEJ sesji ma pierwszeństwo przed pamięcią', () => {
    const magazyn = { bm_gotowosc: JSON.stringify({ g: 90, d: w._dzienWaw(new Date().toISOString()) }) };
    global.localStorage = w.localStorage = { getItem: (k) => magazyn[k] || null, setItem: () => {} };
    const poprzedni = w._formaLast;
    w._formaLast = { tsb: -20 };                       // dziś ciężko → gotowość 30
    assert.strictEqual(w.gotowoscDoCytatu(), 30, 'świeży odczyt bije zapis sprzed godzin');
    assert.strictEqual(w._pulaCytatow(w.gotowoscDoCytatu()).length, w.QUOTES_BEZPIECZNE().length);
    w._formaLast = poprzedni;
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
