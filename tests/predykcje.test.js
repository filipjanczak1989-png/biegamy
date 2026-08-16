// ─────────────────────────────────────────────────────────────────────────────
// PREDYKCJE CZASÓW — _renderPredykcje, Riegel T2 = T1 · (D2/D1)^1.06.
//
// !! BLIZNA NIE POLEGA NA TYM, ŻE LICZBY BYŁY ZŁE. Polegała na tym, że
//    POŁOWA Z NICH WYGLĄDAŁA DOBRZE. Kolumna `athletes.pb_*` jest typu `text`,
//    a render robił `+s`. Maciek miał w pb_10k gołe `56`, czyli — po `+s` —
//    56 SEKUND. Riegel to prawo skalowania, więc przepuścił błąd jednostki
//    czysto: wszystkie cztery wiersze wyszły z tej jednej bazy, przemnożone
//    przez czysty współczynnik. Karta pokazała
//
//        5 km 0:27 · 10 km 0:56 · półmaraton 2:04 · maraton 4:19
//
//    Dwa pierwsze są absurdem i człowiek to widzi. Dwa ostatnie to
//    2 minuty 4 sekundy i 4 minuty 19 sekund — ale `_secsToTime` poniżej
//    godziny formatuje M:SS, co jest NIEODRÓŻNIALNE od H:MM. Półmaraton
//    „2:04" i maraton „4:19" czyta się jak zupełnie sensowne wyniki.
//    Dlatego zgłoszenie brzmiało „pierwsze dwa wiersze mi się popsuły",
//    a nie „karta liczy w złych jednostkach".
//
// !! DRUGI SKUTEK TEGO SAMEGO `+s`: dla POPRAWNEGO „25:20" dawał NaN, więc PB
//    wypadało po cichu i przy samych poprawnych życiówkach karta w ogóle się
//    nie pokazywała. Zmierzone 15.08.2026: 30 z 53 osób nie widziało karty,
//    a widziały ją 4 osoby — te z danymi w złym formacie.
//    Funkcja działała wyłącznie dla ludzi, którzy wpisali dane błędnie.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { zaladujStrone, stabilnyDom } = require('./_srodowisko.js');

const ctx = zaladujStrone('zawodnik.html');
const dom = stabilnyDom(ctx);
const fmt = ctx.window._secsToTime;

/** Atrapa Supabase oddająca JEDEN wiersz athletes z podanymi życiówkami. */
function atrapaSb(pb) {
  const b = { then: (r, j) => Promise.resolve({ data: pb, error: null }).then(r, j) };
  for (const m of ['select', 'eq', 'maybeSingle', 'single', 'limit', 'order']) b[m] = () => b;
  return { from: () => b };
}

/** Renderuje kartę i oddaje to, co realnie wylądowało w DOM. */
async function renderuj(pb, tsb) {
  ctx.sb = atrapaSb(pb);
  const box = dom.daj('forma-predykcje');
  const tab = dom.daj('forma-predykcje-tabela');
  box.style.display = 'NIETKNIETE';
  tab.innerHTML = '';
  await vm.runInContext(`(async () => {
    _athleteId = 'ATLETA-TEST';
    window._formaLast = ${tsb === undefined ? 'null' : `{ tsb: ${tsb} }`};
    await _renderPredykcje();
  })()`, ctx);
  return { box, html: tab.innerHTML, widoczna: box.style.display === 'block' };
}

/** Wyciąga z HTML trójki [nazwa, etykieta, wartość] — render nie ma innego
 *  wyjścia niż innerHTML.
 *  ⚠️ OD 16.08.2026 KARTA MA DWA RODZAJE WIERSZY. Wcześniej każdy pokazywał
 *     „PB X" i obok prognozę; po zdjęciu modyfikatora TSB obie liczby na
 *     dystansie z rekordem były IDENTYCZNE, więc wiersz mówił „Twoja życiówka
 *     to Twoja życiówka" i sugerował, że to prognoza na dziś.
 *     Teraz: `etykieta` to „Twój rekord" albo „szacunek", `wartość` to jedna
 *     liczba. Pole `prognoza` zachowane jako alias, żeby starsze asercje
 *     o LICZBACH nadal opisywały to samo zjawisko — zmienił się kształt karty,
 *     nie matematyka Riegela. */
function wiersze(html) {
  return [...html.matchAll(/>([^<>]+)<\/span><span style="font-family:DM Mono[^"]*"><span[^>]*>([^<]*)<\/span>\s*<strong[^>]*>([^<]+)<\/strong>/g)]
    .map((m) => {
      const etykieta = m[2].trim(), wartosc = m[3].trim();
      /* `pb` jako alias ZACHOWUJE ZNACZENIE starszych asercji: „PB odrzucone
         przez walidator ma się pokazać jako brak". W nowej karcie odrzucone PB
         nie daje etykiety „Twój rekord", tylko „szacunek" — więc `pb` = '—'
         dokładnie wtedy, kiedy dawniej. Blizna zostaje ta sama, zmienił się
         tylko sposób, w jaki karta to mówi. */
      return { nazwa: m[1].trim(), etykieta, wartosc, prognoza: wartosc,
               pb: etykieta === 'Twój rekord' ? wartosc : '—' };
    });
}

const MACIEK = { pb_5k: '25:20', pb_10k: '56:00', pb_half: '2:14:00', pb_marathon: null };

describe('REGRESJA — zgłoszenie Maćka, 14.08.2026', () => {
  // !! JEDYNY TEST W CAŁYM ZESTAWIE ODPOWIADAJĄCY KONKRETNEMU CZŁOWIEKOWI
  //    I KONKRETNEMU ZGŁOSZENIU. Maciek napisał, że karta predykcji pokazuje
  //    mu bzdury. Miał życiówki 25:20 / 56:00 / 2:14:00 i pusty maraton.
  //    Poniższe cztery wartości to wynik PO naprawie.
  //    Jeżeli ten test kiedyś zapali się na czerwono, znaczy to, że zmieniła
  //    się albo formuła, albo korekta TSB, albo formatowanie — i trzeba do
  //    Maćka napisać, a nie poprawić oczekiwanie w teście.
  //
  //    ⚠️ 16.08.2026 TEN TEST SIĘ ZAPALIŁ I OCZEKIWANIE ZOSTAŁO ZMIENIONE —
  //    świadomie, bo zmieniła się KOREKTA TSB: została zdjęta w całości.
  //    Stare wartości niosły mnożnik 1,005 (TSB „neutralne"). Nowe to czysty
  //    Riegel z PB. Maraton spadł o 84 s, trzy pozostałe wiersze pokazują teraz
  //    DOKŁADNIE życiówki Maćka — bo Riegel przy D2=D1 mnoży przez 1.
  //    ⚠️ ZOBOWIĄZANIE Z TEGO KOMENTARZA POZOSTAJE W MOCY: Maciek ma zobaczyć
  //       inne liczby niż wczoraj i należy mu to powiedzieć, nie licząc na to,
  //       że nie zauważy.
  test('25:20 / 56:00 / 2:14:00 / (brak) -> 25:20 / 56:00 / 2:14:00 / 4:39:23', async () => {
    const { html, widoczna } = await renderuj(MACIEK, 0);
    const w = wiersze(html);
    assert.equal(w.length, 4, 'karta ma ZAWSZE cztery wiersze, także bez PB');
    assert.deepEqual(w.map((x) => x.wartosc), ['25:20', '56:00', '2:14:00', '4:39:23']);
    assert.deepEqual(w.map((x) => x.pb), ['25:20', '56:00', '2:14:00', '—']);
    assert.equal(widoczna, true);
  });

  test('brakujący maraton pokazuje PB „—", ale prognozę liczy', async () => {
    const { html } = await renderuj(MACIEK, 0);
    const maraton = wiersze(html).find((x) => x.nazwa === 'Maraton');
    assert.equal(maraton.pb, '—');
    assert.notEqual(maraton.prognoza, '—', 'brak PB nie znaczy brak prognozy');
  });
});

describe('dlaczego DWA z czterech wierszy wyglądały poprawnie', () => {
  // Riegel jest prawem skalowania: T2 = T1 · (D2/D1)^1.06. Błąd JEDNOSTKI w T1
  // przechodzi przez niego jako czysty mnożnik — nie deformuje kształtu, tylko
  // skaluje całość. Dlatego zła baza nie produkuje czterech różnych bzdur,
  // tylko cztery spójne liczby, z których część trafia w prawdopodobny zakres.
  const bazaSekundy = 56;                        // +('56') === 56, czyli 56 SEKUND na 10 km

  test('jedna zła baza produkuje DOKŁADNIE to, co zobaczył Maciek', () => {
    const oczekiwane = { '5 km': '0:27', '10 km': '0:56', 'Półmaraton': '2:04', 'Maraton': '4:19' };
    for (const [nazwa, d] of [['5 km', 5], ['10 km', 10], ['Półmaraton', 21.0975], ['Maraton', 42.195]]) {
      const dzis = bazaSekundy * Math.pow(d / 10, 1.06) * 1.005;
      assert.equal(fmt(dzis), oczekiwane[nazwa], nazwa);
    }
  });

  test('_secsToTime poniżej godziny daje M:SS — czytane jak H:MM', () => {
    // TU JEST CAŁE NIEPOROZUMIENIE, i jest ono po stronie CZŁOWIEKA, nie formatu.
    // Format był jednoznaczny: prawdziwe 2 godz. 4 min wyszłoby jako '2:04:00'.
    // Ale nikt nie ogląda dwóch wariantów obok siebie — widzi jeden napis „2:04"
    // w wierszu opisanym „Półmaraton" i czyta go tak, jak pasuje do kontekstu.
    assert.equal(fmt(124), '2:04');                    // 2 min 4 s
    assert.equal(fmt(2 * 3600 + 4 * 60), '2:04:00');   // 2 godz. 4 min — inny zapis
    assert.equal(fmt(259), '4:19');
    assert.match(fmt(124), /^\d:\d\d$/, 'kształt, który da się przeczytać jako godziny:minuty');
  });

  test('wszystkie cztery wiersze idą z JEDNEGO źródła — zmiana bazy rusza wszystkimi', async () => {
    const a = wiersze((await renderuj({ pb_5k: '25:20', pb_10k: null, pb_half: null, pb_marathon: null }, 0)).html);
    const b = wiersze((await renderuj({ pb_5k: '25:40', pb_10k: null, pb_half: null, pb_marathon: null }, 0)).html);
    assert.equal(a.length, 4);
    for (let i = 0; i < 4; i++) {
      assert.notEqual(a[i].prognoza, b[i].prognoza,
        `wiersz ${a[i].nazwa} nie zareagował na zmianę jedynej bazy — to znaczy, że ma własne źródło`);
    }
  });

  test('gołe „56" NIE dociera już do formuły — karta znika zamiast kłamać', async () => {
    const { widoczna, html } = await renderuj({ pb_5k: null, pb_10k: '56', pb_half: null, pb_marathon: null }, 0);
    assert.equal(widoczna, false, 'brak sensownej bazy = brak karty, nie karta z 0:56');
    assert.equal(html, '');
  });
});

describe('guard `> 0` — miejsce, w którym łatwo „uprościć" i wpuścić zera', () => {
  // walidujPB oddaje { ok: true, sekundy: null } dla „0", „0:00", „0:00:00" —
  // to POPRAWNE wejście o pustym znaczeniu, nie błąd. W renderze przeżywa jako
  // `w.ok && w.sekundy > 0`, bo `null > 0` to false. Jedno wyrażenie łapie zera,
  // braki i wartości nieparsowalne. Kto zamieni to na `w.ok` albo na
  // `w.sekundy != null`, wpuści zero do bazy Riegela — a zero jako T1 daje
  // zerowe prognozy we WSZYSTKICH czterech wierszach.
  test('null > 0 === false — założenie, na którym stoi guard', () => {
    assert.equal(null > 0, false);
    assert.equal(ctx.window.walidujPB('0', 5).ok, true, 'zero jest POPRAWNE...');
    assert.equal(ctx.window.walidujPB('0', 5).sekundy, null, '...ale puste');
  });

  for (const zero of ['0', '0:00', '00:00', '0:00:00']) {
    test(`PB „${zero}" nie staje się bazą prognozy`, async () => {
      const { widoczna } = await renderuj({ pb_5k: zero, pb_10k: null, pb_half: null, pb_marathon: null }, 0);
      assert.equal(widoczna, false, 'jedyne PB to zero — nie ma z czego liczyć');
    });
  }

  test('zero OBOK prawdziwego PB nie zaniża prognoz', async () => {
    const zZerem = await renderuj({ pb_5k: '0:00', pb_10k: '56:00', pb_half: null, pb_marathon: null }, 0);
    const bezZera = await renderuj({ pb_5k: null, pb_10k: '56:00', pb_half: null, pb_marathon: null }, 0);
    assert.deepEqual(wiersze(zZerem.html).map((x) => x.prognoza),
                     wiersze(bezZera.html).map((x) => x.prognoza),
                     'zero ma być nieodróżnialne od braku');
    assert.equal(wiersze(zZerem.html)[0].pb, '—', 'i ma się pokazać jako brak, nie jako 0:00');
  });

  test('żadna prognoza nie jest zerem ani NaN przy komplecie PB', async () => {
    const { html } = await renderuj(MACIEK, 0);
    for (const w of wiersze(html)) {
      assert.doesNotMatch(w.prognoza, /NaN/, w.nazwa);
      assert.notEqual(w.prognoza, '0:00', w.nazwa);
    }
  });

  test('wartość nieparsowalna nie przechodzi jako baza', async () => {
    const { widoczna } = await renderuj({ pb_5k: 'abc', pb_10k: null, pb_half: null, pb_marathon: null }, 0);
    assert.equal(widoczna, false);
  });

  test('h:mm na maratonie jest ODRZUCANE, nie ratowane w renderze', async () => {
    // Ratunek (dopelnijPB) siedzi na onblur przy polu. Render nie zgaduje.
    const { html } = await renderuj({ pb_5k: '25:20', pb_10k: null, pb_half: null, pb_marathon: '3:46' }, 0);
    assert.equal(wiersze(html).find((x) => x.nazwa === 'Maraton').pb, '—');
  });

  test('ostrzeżenie o wolnym tempie NIE odrzuca życiówki', async () => {
    // `w.ok`, a nie `!w.ostrzezenie` — 11:00/km to nadal życiówka.
    const { widoczna, html } = await renderuj({ pb_5k: '55:00', pb_10k: null, pb_half: null, pb_marathon: null }, 0);
    assert.equal(widoczna, true);
    assert.equal(wiersze(html)[0].pb, '55:00');
  });
});

describe('⚠️ MODYFIKATOR TSB ZDJĘTY — predykcja nie zależy od formy dnia', () => {
  /* BLIZNA: modyfikator mnożył wynik Riegela przez 1,000–1,025 zależnie od TSB.
     Zmierzone 16.08.2026 na 40 czystych startach: korelacja TSB z rozjazdem
     r = 0,26 — i to w ZŁYM KIERUNKU. Ludzie ze „świeżością" biegli NAJDALEJ
     od predykcji (+8,5%), z „obciążeniem" najbliżej (+2,8%). Modyfikator
     działał odwrotnie do rzeczywistości.
     ⚠️ Nie zastąpiono go łagodniejszym zakresem: nie ma podstawy dla ŻADNEGO
        mnożnika, a zamiana jednej wymyślonej liczby na drugą różni się tylko
        tym, że myli się mniej. */

  test('TSB nie zmienia ANI JEDNEJ liczby na karcie', async () => {
    const warianty = [undefined, -40, -25, -15, 0, 10, 15, 30, 60];
    const bazowy = wiersze((await renderuj(MACIEK, warianty[0])).html).map((x) => x.wartosc);
    for (const t of warianty.slice(1)) {
      const teraz = wiersze((await renderuj(MACIEK, t)).html).map((x) => x.wartosc);
      assert.deepEqual(teraz, bazowy, 'TSB ' + t + ' zmieniło wynik — modyfikator wrócił');
    }
  });

  test('⚠️ na dystansie z PB karta pokazuje REKORD, nie prognozę równą rekordowi', async () => {
    /* To cała różnica między „tyle wynika z Twojej życiówki" a „tyle zrobisz
       dziś". Riegel przy D2=D1 mnoży przez 1, więc obie liczby były identyczne,
       a podpis sugerował prognozę na dzisiaj. */
    const w = wiersze((await renderuj(MACIEK, 0)).html);
    const piatka = w.find((x) => x.nazwa === '5 km');
    assert.equal(piatka.etykieta, 'Twój rekord');
    assert.equal(piatka.wartosc, '25:20', 'ma pokazywać PB, nie przeliczenie');
    const maraton = w.find((x) => x.nazwa === 'Maraton');
    assert.equal(maraton.etykieta, 'szacunek', 'bez PB ma być szacunek');
  });

  test('kontrola negatywna: wykrywacz odróżnia wynik z modyfikatorem od bez', () => {
    /* Bez tego test wyżej przechodziłby także z przywróconym modyfikatorem,
       gdyby renderer przestał w ogóle reagować na TSB z innego powodu. */
    const zMod = (t) => Math.round(1520 * (1 + (t < -20 ? 0.025 : 0)));
    assert.notEqual(zMod(-25), zMod(0));
  });
});

/** Wyciąga podwiersze (drugą linię wiersza) — od 16.08.2026 niosą niepewność. */
function podwiersze(html) {
  return [...html.matchAll(/margin-top:1px;">([^<]*)</g)].map((m) => m[1].trim());
}

describe('⚠️ WYKŁADNIK INDYWIDUALNY ODRZUCONY — karta stoi na 1,06 dla wszystkich', () => {
  /* BLIZNA ODWROTNA NIŻ ZWYKLE: tu zmierzona poprawa NIE weszła.
     Mediana wykładnika z par PB u nas to 1,091 przy literaturowym 1,06,
     94 ze 123 par leży wyżej, a na startach w górę poprawiłoby to rozjazd
     z +7,8% na +3,9%. Odrzucone, bo wykładnik z dwóch PB opisuje krzywą
     człowieka tylko wtedy, gdy oba PB są z tego samego momentu formy —
     a tego nie da się sprawdzić u 32 z 34 osób (94%), bo `pb_*` nie mają dat.
     ⚠️ Ten test pilnuje, żeby indywidualny wykładnik nie wrócił bocznymi
        drzwiami: JEDYNYM wykładnikiem w karcie ma być 1,06. */

  test('maraton Maćka liczy się z 1,06, nie z jego własnego 1,157', async () => {
    const { html } = await renderuj(MACIEK, 0);
    const maraton = wiersze(html).find((x) => x.nazwa === 'Maraton');
    /* baza = półmaraton 2:14:00 (najbliższy logarytmicznie), stosunek x2,0 */
    const z106 = fmt(8040 * Math.pow(42.195 / 21.0975, 1.06));
    const zWlasnym = fmt(8040 * Math.pow(42.195 / 21.0975, 1.157));
    assert.equal(maraton.wartosc, z106);
    assert.notEqual(maraton.wartosc, zWlasnym, 'wrócił wykładnik indywidualny');
  });

  test('kontrola negatywna: 1,06 i 1,157 dają na maratonie RÓŻNE liczby', () => {
    /* Bez tego test wyżej przechodziłby także wtedy, gdyby oba warianty
       zbiegały się do tej samej wartości i nie sprawdzał niczego. */
    assert.notEqual(Math.round(8040 * Math.pow(2, 1.06)), Math.round(8040 * Math.pow(2, 1.157)));
  });
});

describe('⚠️ SANITY (wariant B) — szacunek sprzeczny z PB znika, nie jest korygowany', () => {
  /* Riegel z k > 1 jest monotoniczny, więc szacunek szybszy od życiówki na
     KRÓTSZYM dystansie może powstać tylko przy PB, które się wzajemnie nie
     składają. Dziś takich przypadków jest 0 z 41 — reguła istnieje ZANIM
     będzie potrzebna, bo powstanie przy pierwszej aktualizacji jednego PB
     bez drugiego, a wtedy nikt jej nie będzie szukał. */

  /* Piątka 40:00 przy dysze 41:00: z dychy Riegel liczy półmaraton na
     ~1:30, ale sama piątka mówi, że ten człowiek biega 8:00/km. */
  const NIESPOJNY = { pb_5k: '20:00', pb_10k: '60:00', pb_half: null, pb_marathon: null };

  /* ⚠️ PRZYPADEK ZNALEZIONY PRZEGLĄDEM ZUPEŁNYM, NIE WYMYŚLONY.
     Moja pierwsza wersja tego testu zakładała inny mechanizm i przechodziła
     z powodu niezwiązanego z regułą — baza wychodziła na 5 km, więc nie było
     czego naruszać. Przejrzałem więc 56 056 kombinacji życiówek: naruszenie
     powstaje 1172 razy i ZAWSZE tak samo — cel półmaraton, baza dziesiątka,
     a w polu 5 km siedzi czas z dłuższego dystansu.
     To ta sama klasa błędu, co blizna `+s` opisana na górze pliku: kolumna
     jest typu `text` i przyjmuje wszystko. */
  const POMYLONE_POLE = { pb_5k: '1:46:00', pb_10k: '41:00', pb_half: null, pb_marathon: null };

  test('⚠️ czas z innego dystansu w polu 5 km kasuje szacunek półmaratonu', async () => {
    const { html } = await renderuj(POMYLONE_POLE, 0);
    const hm = wiersze(html).find((x) => x.nazwa === 'Półmaraton');
    /* baza = 10 km 41:00 (x2,11) -> ~1:30:28, a „PB 5 km” to 1:46:00.
       Dane są sprzeczne i NIE WIADOMO, które pole jest błędne — więc nie
       pokazujemy nic, zamiast wybierać za człowieka. */
    assert.equal(hm.wartosc, '—', 'sprzeczny szacunek ma zniknąć, nie zostać obcięty');
    assert.equal(hm.etykieta, 'PB się nie zgadzają');
  });

  test('kontrola negatywna: ta sama dziesiątka z sensowną piątką daje normalny szacunek', async () => {
    /* Bez tego test wyżej przechodziłby także wtedy, gdyby karta kasowała
       półmaraton z jakiegokolwiek innego powodu. */
    const { html } = await renderuj(
      { pb_5k: '19:30', pb_10k: '41:00', pb_half: null, pb_marathon: null }, 0);
    const hm = wiersze(html).find((x) => x.nazwa === 'Półmaraton');
    assert.equal(hm.etykieta, 'szacunek');
    assert.notEqual(hm.wartosc, '—');
  });

  test('komplet spójnych PB nie wywołuje ani jednego „—"', async () => {
    const { html } = await renderuj(MACIEK, 0);
    assert.equal(wiersze(html).filter((x) => x.wartosc === '—').length, 0);
  });
});

describe('⚠️ ZAKRES przy ekstrapolacji dalekiej — próg 3×, pasmo 1,06–1,15 z literatury', () => {
  /* Pasmo pochodzi z ROZRZUTU W LITERATURZE, nie z naszych danych — ta sama
     zasada, co przy zdjęciu modyfikatora TSB: nie podstawiamy liczby
     skalibrowanej na próbce, której nie umiemy opisać. */

  test('Maciek NIE dostaje zakresu — jego maraton to x2,0, poniżej progu', async () => {
    const { html } = await renderuj(MACIEK, 0);
    assert.deepEqual(podwiersze(html), [], 'x2,0 ma zostać punktem');
  });

  test('jedno PB na 5 km → maraton (x8,4) dostaje podwiersz z górną krawędzią', async () => {
    const { html } = await renderuj(
      { pb_5k: '25:00', pb_10k: null, pb_half: null, pb_marathon: null }, 0);
    const pod = podwiersze(html);
    const gorny = fmt(1500 * Math.pow(42.195 / 5, 1.15));
    assert.ok(pod.some((x) => x === 'realnie do ' + gorny),
      'brak podwiersza z krawędzią 1,15; są: ' + JSON.stringify(pod));
  });

  test('próg działa w OBIE strony: x2,11 bez zakresu, x4,22 z zakresem', async () => {
    const { html } = await renderuj(
      { pb_5k: null, pb_10k: '50:00', pb_half: null, pb_marathon: null }, 0);
    const w = wiersze(html), pod = podwiersze(html);
    assert.ok(w.find((x) => x.nazwa === 'Półmaraton'), 'półmaraton ma być liczony');
    assert.equal(pod.length, 1, 'tylko maraton (x4,22) ma podwiersz, półmaraton (x2,11) nie');
  });

  test('⚠️ ekstrapolacja W DÓŁ nigdy nie dostaje zakresu', async () => {
    /* Wyższy wykładnik daje w dół czasy SZYBSZE, więc pasmo 1,06–1,15
       produkowałoby tam liczby fizycznie niemożliwe — piątka w 12:39
       z maratonu 2:27. `stosunek` < 1 odcina ten kierunek sam. */
    const { html } = await renderuj(
      { pb_5k: null, pb_10k: null, pb_half: null, pb_marathon: '2:27:00' }, 0);
    assert.deepEqual(podwiersze(html), [], 'w dół nie ma zakresu, choć x8,4');
  });

  test('górna krawędź jest ZAWSZE wolniejsza od wartości głównej', async () => {
    /* ⚠️ Pierwsza wersja brała PIERWSZY podwiersz z brzegu i porównywała go
       z maratonem — a przy samej piątce podwiersz mają DWA wiersze
       (półmaraton x4,22 i maraton x8,44). Test przechodził lub padał
       zależnie od kolejności, nie od reguły. Teraz para (wartość, krawędź)
       jest wiązana przez wspólny blok HTML. */
    const { html } = await renderuj(
      { pb_5k: '25:00', pb_10k: null, pb_half: null, pb_marathon: null }, 0);
    const naSek = (t) => t.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
    const WZ = new RegExp('<strong[^>]*>([^<]+)</strong></span></div>'
      + '<div[^>]*margin-top:1px;">realnie do ([^<]+)<', 'g');
    const bloki = [...html.matchAll(WZ)];
    assert.ok(bloki.length >= 2, 'przy samej piątce podwiersz mają dwa wiersze, jest: ' + bloki.length);
    for (const [, wartosc, krawedz] of bloki) {
      assert.ok(naSek(krawedz.trim()) > naSek(wartosc.trim()),
        'krawędź 1,15 musi być wolniejsza niż 1,06: ' + wartosc + ' vs ' + krawedz);
    }
  });
});

describe('⚠️ SANITY I DOLNA KRAWĘDŹ PASMA TO JEDNA REGUŁA, NIE DWIE', () => {
  /* Pytanie z 16.08.2026: czy „odcięcie dolnej granicy pasma" jest nową regułą,
     czy tą samą, co sanity. Odpowiedź: TĄ SAMĄ, i to bez żadnej zmiany w kodzie.
     `riegel` (wykładnik 1,06) jest JEDNOCZEŚNIE wartością główną wiersza
     i dolną krawędzią pasma — pasmo rozciąga się od niego W GÓRĘ, do 1,15.
     Sanity porównuje życiówki z krótszych dystansów właśnie z `riegel`,
     więc chroni dokładnie tę krawędź.
     ⚠️ Ten test istnieje po to, żeby ktoś nie dopisał drugiej, równoległej
        kontroli na `gorny` albo na osobno liczoną krawędź. Gdyby pasmo
        kiedyś przestało zaczynać się na 1,06 (np. środek pasma jako wartość
        główna), ten test PADNIE — i o to chodzi. */

  test('gdy pasmo jest pokazane, jego dolna krawędź JEST wartością główną', async () => {
    const { html } = await renderuj(
      { pb_5k: '25:00', pb_10k: null, pb_half: null, pb_marathon: null }, 0);
    const WZ = new RegExp('<strong[^>]*>([^<]+)</strong></span></div>'
      + '<div[^>]*margin-top:1px;">realnie do ([^<]+)<', 'g');
    const bloki = [...html.matchAll(WZ)];
    assert.ok(bloki.length >= 1, 'oczekiwano wiersza z pasmem');
    for (const [, glowna] of bloki) {
      /* wartość główna = Riegel z 1,06 = dolna krawędź; podwiersz niesie górną */
      const w = wiersze(html).find((x) => x.wartosc === glowna.trim());
      assert.ok(w, 'wartość główna ma być zwykłym wierszem karty, nie osobnym bytem');
      assert.equal(w.etykieta, 'szacunek');
    }
  });

  test('⚠️ sprzeczność kasuje CAŁY wiersz razem z pasmem, nie samą liczbę', async () => {
    /* Gdyby to były dwie reguły, dałoby się dostać wiersz bez wartości głównej,
       ale z podwierszem „realnie do…" — czyli pasmo bez dolnej krawędzi. */
    const { html } = await renderuj(
      { pb_5k: '1:46:00', pb_10k: '41:00', pb_half: null, pb_marathon: null }, 0);
    const hm = wiersze(html).find((x) => x.nazwa === 'Półmaraton');
    assert.equal(hm.wartosc, '—');
    /* ⚠️ Pierwsza wersja dzieliła HTML po nazwie wiersza i łapała TAKŻE maraton,
       który pasmo dostaje najzupełniej prawidłowo (baza 10 km, x4,2, i żadna
       życiówka nie jest od niego wolniejsza). Blok trzeba wyciąć po jego
       własnych granicach, nie po nazwie. */
    const bloki = html.split('<div style="padding:5px 0;');
    const blokHM = bloki.find((b) => b.includes('Półmaraton'));
    assert.ok(blokHM, 'blok półmaratonu ma istnieć');
    assert.ok(!/realnie do/.test(blokHM),
      'skasowany wiersz nie może zostawić po sobie podwiersza z górną krawędzią');
    assert.ok(/sprawdź życiówki/.test(blokHM), 'ma powiedzieć, co jest nie tak');
    /* kontrola dodatnia: maraton TEGO SAMEGO człowieka pasmo dostaje */
    const blokM = bloki.find((b) => b.includes('Maraton') && !b.includes('Półmaraton'));
    assert.ok(/realnie do/.test(blokM), 'maraton nie jest sprzeczny, więc pasmo ma zostać');
  });

  test('kontrola negatywna: jedna funkcja, nie dwie — brak drugiego porównania', () => {
    /* Czytamy źródło: `sprzecznosc` ma wystąpić DOKŁADNIE raz jako definicja
       i nie wolno porównywać `gorny` z życiówkami osobno. */
    const fs = require('node:fs');
    const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'zawodnik.html'), 'utf8');
    const ciało = src.slice(src.indexOf('const sprzecznosc'), src.indexOf('const podwiersz'));
    assert.equal((ciało.match(/majace\.some/g) || []).length, 1,
      'druga kontrola na życiówkach = duplikat reguły');
    assert.ok(!/q\.s\s*>=\s*gorny/.test(src), 'górna krawędź nie ma własnego sanity');
  });
});
