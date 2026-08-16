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
