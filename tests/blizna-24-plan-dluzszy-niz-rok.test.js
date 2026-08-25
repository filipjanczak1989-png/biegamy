// ─────────────────────────────────────────────────────────────────────────────
// BLIZNA 24 — PLAN DŁUŻSZY NIŻ ROK I STRONA, KTÓREJ NIKT NIE UMIAŁ UŻYĆ.
//
// Zgłoszenie Maćka z 23-24.08.2026, dwie sprawy z jednego wieczoru:
//
// 1. Generator nie miał ŻADNEGO sufitu tygodni. `tygodnie` szło wprost z daty
//    startu, więc przy zawodach za 520 tygodni oddawał 3634 wiersze i 816 kB
//    JSON-a. Bez błędu, bez ostrzeżenia — plan na dziesięć lat wyglądał jak plan.
//    !! POWÓD SUFITU NIE JEST TECHNICZNY: krzywa objętości planu 113-tygodniowego
//       osiąga szczyt w TYGODNIU 9, a potem 26 razy powtarza cykl 49/49/49/34.
//       Sufit nie odbiera niczego, co istniało — nazywa granicę, za którą silnik
//       i tak nic nowego nie mówi.
//
// 2. narzedzia.html — cztery kalkulatory, z których trzy nie umiały odczytać
//    wpisanego czasu. `autoColonTime` nie wstawia dwukropka poniżej 3 cyfr,
//    a `_parseTimeToSecs` zwraca null bez dwukropka, więc pole wyniku zostawało
//    puste i przez placeholder „6:00" wyglądało na policzone.
//    !! Strona usunięta 24.08.2026. Ten plik pilnuje, żeby nie wróciła bokiem.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../js/generator-planu.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');

const TODAY = '2026-08-24';
const IDX = G._dzienIdx(TODAY);
const zaTyg = (n) => G._isoZIdx(IDX + n * 7);

function plan(tygodni, opcje) {
  return G.uloz(Object.assign({
    dystans: 'half', dniWTygodniu: 5, dataStartu: zaTyg(tygodni), today: TODAY,
    poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 21 }, celCzasowy: null
  }, opcje || {}));
}

test('SUFIT 52 TYGODNI', async (t) => {
  await t.test('MAX_TYGODNI jest wystawione — klient nie ma go przepisywać', () => {
    assert.strictEqual(G.LIMITY.MAX_TYGODNI, 52);
  });

  await t.test('poniżej sufitu plan zachowuje pełną długość', () => {
    for (const h of [16, 40, 51, 52]) {
      const r = plan(h);
      assert.strictEqual(r.ok, true, 'horyzont ' + h);
      assert.strictEqual(r.meta.tygodnie, h, 'horyzont ' + h + ' skrócony bez powodu');
      assert.strictEqual(r.startOdroczony, null, 'horyzont ' + h + ' odroczony bez powodu');
    }
  });

  await t.test('powyżej sufitu plan ma dokładnie 52 tygodnie', () => {
    for (const h of [53, 61, 113, 150, 520]) {
      const r = plan(h);
      assert.strictEqual(r.ok, true, 'horyzont ' + h);
      assert.strictEqual(r.meta.tygodnie, 52, 'horyzont ' + h);
    }
  });

  /* ⚠️ TO JEST CAŁA RÓŻNICA MIĘDZY „SKRÓCENIEM" A „COFNIĘCIEM".
     Plan przycięty od końca kończyłby się rok przed zawodami i taper wypadałby
     w próżni. Kotwicą jest data startu — plan ma się KOŃCZYĆ na zawodach. */
  await t.test('⚠️ plan KOŃCZY SIĘ w dniu zawodów, niezależnie od horyzontu', () => {
    for (const h of [16, 52, 53, 61, 113, 150, 520]) {
      const r = plan(h);
      assert.strictEqual(r.plan.end_date, zaTyg(h),
        'horyzont ' + h + ': plan kończy się ' + r.plan.end_date + ', a zawody są ' + zaTyg(h));
    }
  });

  await t.test('przesunięcie to dokładnie nadmiar ponad 52', () => {
    for (const h of [53, 61, 113, 150]) {
      const r = plan(h);
      assert.strictEqual(r.startOdroczony.tygodni, h - 52, 'horyzont ' + h);
      assert.strictEqual(r.startOdroczony.tygodnieDoStartu, h, 'horyzont ' + h);
    }
  });

  /* Przesunięcie idzie o wielokrotność 7 dni, więc start zostaje poniedziałkiem.
     Gdyby kiedyś ktoś przesunął o „resztę dni", cały układ tygodnia (UKLAD_DNI,
     długie w niedzielę) rozjechałby się cicho. */
  await t.test('⚠️ start planu zostaje PONIEDZIAŁKIEM po cofnięciu', () => {
    for (const h of [53, 61, 113, 150, 520]) {
      const d = new Date(G._dzienIdx(plan(h).plan.start_date) * 86400000);
      assert.strictEqual(d.getUTCDay(), 1, 'horyzont ' + h + ' zaczyna się nie w poniedziałek');
    }
  });

  await t.test('taper nie wypada w próżni — ostatni tydzień jest najlżejszy', () => {
    const r = plan(113);
    const obj = r.meta.objetosciFaktyczne;
    const szczyt = Math.max.apply(null, obj);
    assert.ok(obj[obj.length - 2] < szczyt * 0.8,
      'tydzień przed startem (' + obj[obj.length - 2] + ') nie jest taperem przy szczycie ' + szczyt);
  });

  /* Rozmiar payloadu do bazy — dwa nierozbite .insert() w zawodnik.html.
     Sufit ma go trzymać w ryzach; bez niego 113 tygodni dawało 785 wierszy. */
  await t.test('⚠️ liczba wierszy przestaje rosnąć z horyzontem', () => {
    const maly = plan(113).treningi.length;
    const wielki = plan(520).treningi.length;
    assert.strictEqual(maly, wielki, 'wiersze nadal rosną z datą startu');
    assert.ok(maly <= 366, 'plan 52-tygodniowy ma ' + maly + ' wierszy — więcej niż rok dni');
  });
});

test('ODROCZONY START MUSI NIEŚĆ WYJŚCIE', async (t) => {
  /* Ta sama zasada co przy R1/R2/R5, tylko trudniejsza: to NIE jest odmowa.
     Człowiek widzi zielone „Plan gotowy · 52 TYGODNI" i bez tego bloku wychodzi
     przekonany, że ma co robić od jutra. Ma — dopiero za 98 tygodni. */
  await t.test('komunikat mówi KIEDY plan rusza — konkretną datą', () => {
    const r = plan(150);
    assert.match(r.startOdroczony.komunikat, /rusza \d{1,2} \p{Ll}+ \d{4}/u);
    assert.strictEqual(r.startOdroczony.data, r.plan.start_date);
  });

  await t.test('komunikat mówi, CO ROBIĆ do tego czasu', () => {
    assert.match(plan(150).startOdroczony.komunikat, /nie stracić tego, co już biegasz/);
  });

  await t.test('komunikat mówi, DLACZEGO plan jest krótszy niż horyzont', () => {
    const k = plan(150).startOdroczony.komunikat;
    assert.match(k, /Do startu jest 150 tyg/);
    assert.match(k, /najdłuższy plan, jaki układam, to 52/);
  });

  /* ⚠️ ŚCIEŻKA NIE MOŻE PROWADZIĆ W TĘ SAMĄ DATĘ. Krótszy dystans przy starcie
     za 150 tygodni zostanie cofnięty dokładnie tak samo — przycisk prowadziłby
     do drugiego odroczenia. `najblizszyTeraz` pyta o dystans przy NAJBLIŻSZYM
     możliwym starcie, nie przy tym, który człowiek wpisał. */
  await t.test('⚠️ wskazany dystans NAPRAWDĘ przechodzi przy bliskim starcie', () => {
    const r = plan(150);
    const dyst = r.startOdroczony.sciezkaDystans;
    assert.ok(dyst, 'brak ścieżki przy bazie, która przechodzi');
    assert.ok(G.DYSTANSE[dyst].km < G.DYSTANSE.half.km, 'ścieżka prowadzi na dystans nie krótszy od celu');

    /* ⚠️ SPRAWDZAMY OKNO, NIE JEDEN HORYZONT — i to jest ta sama pomyłka, którą
       popełniał sam silnik do 24.08.2026. `minTygodni` to minimum METODYCZNE;
       przy bazie 21 dziesiątka na 8 tygodni odbija się o SKOK_OBJETOSCI, a na
       12 powstaje. Test na jednym horyzoncie orzekłby „ścieżka kłamie", choć
       prowadzi do planu, który naprawdę da się ułożyć. */
    const przechodzi = [8, 12, 16, 20, 26].filter((h) => {
      const p = G.uloz({
        dystans: dyst, dniWTygodniu: 5, dataStartu: zaTyg(h), today: TODAY,
        poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 21 }, celCzasowy: null
      });
      return p.ok && p.startOdroczony === null;
    });
    assert.ok(przechodzi.length > 0,
      'ścieżka prowadzi w odmowę na KAŻDYM starcie do pół roku — przycisk kłamie');
  });

  /* Plan liczy się z DZISIEJSZEJ objętości, a rusza za wiele tygodni. Silnik
     nie ma jak wiedzieć, co człowiek będzie biegał wtedy — ma o tym powiedzieć. */
  await t.test('⚠️ założenie o nieaktualnej bazie jest WYPOWIEDZIANE', () => {
    const zal = plan(150).meta.zalozenia.join(' ');
    assert.match(zal, /policzony jest z dzisiejszej objętości/);
    assert.match(zal, /ułóż go wtedy jeszcze raz/);
  });

  await t.test('plan bez odroczenia nie dokłada tego założenia', () => {
    const zal = plan(40).meta.zalozenia.join(' ');
    assert.doesNotMatch(zal, /policzony jest z dzisiejszej objętości/);
  });
});

test('KLIENT RENDERUJE ODROCZENIE I JEGO PRZYCISK', async (t) => {
  const zaw = czytaj('zawodnik.html');

  await t.test('ekran wyniku czyta startOdroczony', () => {
    assert.match(zaw, /w\.startOdroczony/);
    assert.match(zaw, /Ten plan rusza później/);
  });

  await t.test('przycisk woła ścieżkę przez dataset, nie przez wklejony string', () => {
    assert.match(zaw, /data-dyst="'\s*\+\s*esc\(w\.startOdroczony\.sciezkaDystans\)/);
    assert.match(zaw, /onclick="genSciezkaBlizszyStart\(this\.dataset\.dyst\)"/);
  });

  /* ⚠️ RÓŻNICA WOBEC genSciezka JEST CAŁYM SENSEM TEJ FUNKCJI: nie układa planu
     od razu, tylko czyści datę i wraca do formularza. Data zmyślona przez silnik
     wpisałaby do kalendarza zawody, których nie ma (dzień startu niesie MARKER_STARTU). */
  await t.test('⚠️ ścieżka CZYŚCI datę i NIE układa planu od razu', () => {
    const fn = zaw.slice(zaw.indexOf('function genSciezkaBlizszyStart'));
    const cialo = fn.slice(0, fn.indexOf('\n}'));
    assert.match(cialo, /_genRaceDate = null/);
    assert.match(cialo, /di\.value = ''/);
    assert.match(cialo, /_genWrocDoFormularza\(\)/);
    assert.doesNotMatch(cialo, /genUlozPlan\(\)/, 'układa plan w tej samej dacie — drugie odroczenie');
  });

  await t.test('telemetria odróżnia plan odroczony od zwykłego', () => {
    assert.match(zaw, /odroczony_tyg: w\.startOdroczony\.tygodni/);
  });
});

test('⚠️ narzedzia.html USUNIĘTE — nie wraca bokiem', async (t) => {
  await t.test('plików nie ma', () => {
    assert.ok(!fs.existsSync(path.join(KORZEN, 'narzedzia.html')), 'narzedzia.html wróciło');
    assert.ok(!fs.existsSync(path.join(KORZEN, 'statystyki.html')), 'statystyki.html wróciło');
  });

  /* Martwy wpis w PRECACHE_URLS nie jest kosmetyką: install() robi addAll(),
     a addAll odrzuca CAŁĄ obietnicę, jeśli choć jeden URL zwróci 404 —
     czyli jeden martwy wpis wywraca instalację Service Workera w całości. */
  await t.test('⚠️ nie ma ich w PRECACHE_URLS — addAll padłby na 404', () => {
    const sw = czytaj('sw.js');
    const lista = sw.slice(sw.indexOf('PRECACHE_URLS'), sw.indexOf('];', sw.indexOf('PRECACHE_URLS')));
    assert.doesNotMatch(lista, /'\/narzedzia\.html'/);
    assert.doesNotMatch(lista, /'\/statystyki\.html'/);
  });

  await t.test('żadna strona nie linkuje do usuniętych plików', () => {
    for (const p of ['zawodnik.html', 'profil.html', 'trener.html', 'kalendarz.html', 'index.html']) {
      const s = czytaj(p);
      assert.doesNotMatch(s, /href="[^"]*narzedzia\.html/, p + ' linkuje do narzedzia.html');
      assert.doesNotMatch(s, /href="[^"]*statystyki\.html/, p + ' linkuje do statystyki.html');
      assert.doesNotMatch(s, /location\.href\s*=\s*'narzedzia\.html/, p + ' przekierowuje na narzedzia.html');
    }
  });

  await t.test('nagrobek stoi tam, skąd prowadził kafel', () => {
    const prof = czytaj('profil.html');
    assert.match(prof, /Kafel „Narzędzia" usunięty 24\.08\.2026/);
    assert.doesNotMatch(prof, /function goToStats/, 'goToStats wróciło');
    assert.doesNotMatch(prof, /onclick="goToStats\(\)"/, 'kafel wrócił');
  });
});

/* ══ MNOŻNIK SZCZYTU ZALEŻY OD HORYZONTU (24.08.2026) ════════════════════════
   Szósta stała, która „znała" liczbę tygodni wyłącznie z treści komunikatu.
   Do 24.08 MNOZNIK_SZCZYTU = 1,6 dawał ten sam szczyt przy 10 i przy 52
   tygodniach. Maciek z bazą 19,6 odbijał się o ZA_KROTKIE_WYBIEGANIE na
   KAŻDYM horyzoncie — 10, 26, 52, 61 i 113 tygodni dawały identyczną odmowę. */
test('MNOŻNIK SZCZYTU ROŚNIE Z HORYZONTEM', async (t) => {
  await t.test('wzór: min(1,6 + tygodnie/100, 2,2)', () => {
    assert.strictEqual(G.mnoznikSzczytu(0), 1.6);
    assert.ok(Math.abs(G.mnoznikSzczytu(10) - 1.70) < 1e-9);
    assert.ok(Math.abs(G.mnoznikSzczytu(52) - 2.12) < 1e-9);
    assert.strictEqual(G.mnoznikSzczytu(200), 2.2);
  });

  /* ⚠️ SUFIT 2,2 JEST DZIŚ NIEOSIĄGALNY I TO JEST ŚWIADOME — `tygodnie` jest
     przycięte przez MAX_TYGODNI, więc mnożnik dochodzi najwyżej do 2,12.
     Test pilnuje, żeby ta zależność nie rozjechała się po cichu: gdyby ktoś
     podniósł MAX_TYGODNI powyżej 60, sufit zacznie wiązać i ma o tym wiedzieć. */
  await t.test('⚠️ przy MAX_TYGODNI = 52 sufit 2,2 nie może zadziałać', () => {
    const najwyzszy = G.mnoznikSzczytu(G.LIMITY.MAX_TYGODNI);
    assert.ok(najwyzszy < G.LIMITY.MNOZNIK_SZCZYTU_CAP,
      'sufit zaczął wiązać — zmienił się MAX_TYGODNI, sprawdź komentarz przy MNOZNIK_SZCZYTU_CAP');
    assert.ok(Math.abs(najwyzszy - 2.12) < 1e-9);
  });

  await t.test('szczyt NAPRAWDĘ rośnie z horyzontem przy tej samej bazie', () => {
    const szczyt = (h) => {
      const r = plan(h, { poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 19.6 } });
      assert.strictEqual(r.ok, true, 'horyzont ' + h);
      return Math.max.apply(null, r.meta.objetosciFaktyczne);
    };
    const s16 = szczyt(16), s26 = szczyt(26), s52 = szczyt(52);
    assert.ok(s26 > s16, '26 tyg. nie dało wyższego szczytu niż 16 (' + s26 + ' vs ' + s16 + ')');
    assert.ok(s52 > s26, '52 tyg. nie dało wyższego szczytu niż 26 (' + s52 + ' vs ' + s26 + ')');
  });

  /* ⚠️ TO JEST TA SAMA REGRESJA, KTÓRĄ ZŁAPAŁEM PODCZAS PISANIA TEJ ZMIANY.
     Pierwsza wersja guardu (`peak` przycięty do osiągalnego BEZ `Math.max`
     z bazowym 1,6) sprawiała, że przyrost nigdy nie mógł przekroczyć limitu,
     więc SKOK_OBJETOSCI stawało się martwą gałęzią — ściana z własnym
     komunikatem, testami i ścieżką wyjścia, której nie dało się wywołać. */
  await t.test('⚠️ SKOK_OBJETOSCI nadal da się wywołać — nie jest martwą gałęzią', () => {
    const r = G.uloz({ dystans: 'half', dniWTygodniu: 4, dataStartu: zaTyg(10), today: TODAY,
      poziom: { p10sec: 300, wynik: null, objetoscTygodniowa: 25 }, celCzasowy: null });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.sciana.kod, 'SKOK_OBJETOSCI');
  });

  /* ⚠️ TOLERANCJA 1e-9 W BRAMCE PRZYROSTU. `peak` bywa ustawiony DOKŁADNIE na
     limicie, a wtedy (peak/obecna)^(1/budowa) wraca o 5,6e-17 za wysoko i
     bramka odrzucała szczyt, który sama wyznaczyła jako osiągalny.
     Zmierzone na 16 przypadkach, m.in. półmaraton przy bazie 21–26 na 12 tyg. */
  await t.test('⚠️ szczyt równo na limicie przyrostu PRZECHODZI (błąd zaokrąglenia nie decyduje)', () => {
    for (const baza of [21, 23, 26]) {
      const r = G.uloz({ dystans: 'half', dniWTygodniu: 4, dataStartu: zaTyg(12), today: TODAY,
        poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: baza }, celCzasowy: null });
      assert.strictEqual(r.ok, true, 'baza ' + baza + ' odbita: ' + (r.ok ? '' : r.sciana.kod));
    }
  });

  /* MACIEK — zgłoszenie z 23.08. Bez celu czasowego przechodzi od 12 tygodni.
     ⚠️ Z CELEM 2:00:00 NIE PRZECHODZI NIGDY i to NIE jest ta reguła: blokuje
     go MAX_POPRAWA_SUFIT (15%), bo z prognozy 2:21:36 do 2:00:00 brakuje 15,3%.
     Tamta stała jest bezczasowa ŚWIADOMIE — patrz komentarz przy niej. */
  await t.test('MACIEK: bez celu przechodzi od 12 tygodni, poniżej nie', () => {
    const macIek = (h) => G.uloz({ dystans: 'half', dniWTygodniu: 5, dataStartu: zaTyg(h),
      today: TODAY, poziom: { p10sec: 385, wynik: null, objetoscTygodniowa: 19.6 }, celCzasowy: null });
    assert.strictEqual(macIek(10).ok, false, '10 tyg. powinno odmówić');
    assert.strictEqual(macIek(10).sciana.kod, 'ZA_KROTKIE_WYBIEGANIE');
    for (const h of [12, 26, 52, 61, 113]) {
      assert.strictEqual(macIek(h).ok, true, h + ' tyg. powinno przejść');
    }
  });

  await t.test('⚠️ …a cel 2:00:00 odbija się o INNĄ ścianę, na każdym horyzoncie', () => {
    for (const h of [12, 26, 52, 61, 113]) {
      const r = G.uloz({ dystans: 'half', dniWTygodniu: 5, dataStartu: zaTyg(h), today: TODAY,
        poziom: { p10sec: 385, wynik: null, objetoscTygodniowa: 19.6 }, celCzasowy: 7200 });
      assert.strictEqual(r.ok, false, h + ' tyg.');
      assert.strictEqual(r.sciana.kod, 'CEL_ZA_AMBITNY', h + ' tyg.');
    }
  });
});

test('⚠️ KALKULATORY USUNIĘTE — obie kopie, nie jedna', async (t) => {
  const zaw = czytaj('zawodnik.html');

  await t.test('funkcje nie wróciły', () => {
    for (const fn of ['calcZones', 'calcRiegel', 'calcPaceCalc', '_initCalcFromPBs', 'zapiszHrMax']) {
      assert.doesNotMatch(zaw, new RegExp('function ' + fn + '\\b'), fn + ' wróciło');
    }
  });

  await t.test('pola formularza nie wróciły', () => {
    for (const id of ['calc-age', 'calc-rhr', 'calc-hrmax', 'calc-riegel-time', 'calc-pace-time']) {
      assert.doesNotMatch(zaw, new RegExp('id="' + id + '"'), id + ' wróciło');
    }
  });

  /* ⚠️ ZAKŁADKA MUSI ZNIKNĄĆ RAZEM Z PANELEM. Sam przycisk bez panelu daje
     kafel, który nic nie otwiera — gorzej niż brak kafla. */
  await t.test('zakładka „Kalkulator" zniknęła z profilu i z przełącznika', () => {
    assert.doesNotMatch(zaw, /id="ptab-calc"/);
    assert.doesNotMatch(zaw, /id="ptab-panel-calc"/);
    assert.doesNotMatch(zaw, /'info','msgs','stats','calc','badges'/);
  });

  /* athletes.hr_max zostaje w bazie, ale straciło jedynego pisarza i czytelnika.
     Zmierzone przed usunięciem: 0 z 62 kont miało tę wartość. */
  await t.test('hr_max nie jest już czytane z bazy bez odbiorcy', () => {
    assert.doesNotMatch(zaw, /avatar_url,hr_max,date_of_birth/);
  });

  await t.test('nagrobek stoi i mówi, co było przyczyną', () => {
    assert.match(zaw, /KALKULATORY USUNIĘTE 24\.08\.2026/);
    assert.match(zaw, /autoColonTime/);
  });
});

/* ══ KRZYWA IDZIE ZA BRAMKĄ (25.08.2026) ═════════════════════════════════════
   `objetosciTygodni` budowała rampę po płaskim MAX_PRZYROST_TYG (8%), a bramka
   SKOK_OBJETOSCI sprawdzała plan po stopniowanym maxPrzyrostDla(baza) (8/6/4/3%).
   Zatwierdzany był inny plan niż wykonywany: maraton, baza 60, 30 tyg. — limit
   bramki 4%/tydz, realny przyrost krzywej 8%, szczyt w tygodniu 3 z 30.
   Dotyczyło 45 z 62 zawodników (każdego z bazą ≥ 20 km/tydz). */
test('KRZYWA NIE ROŚNIE SZYBCIEJ, NIŻ POZWALA BRAMKA', async (t) => {
  const trendy = (r, baza) => {
    const o = r.meta.objetosciTygodni, budowa = r.meta.tygodnie - r.meta.taperTygodni;
    const out = [];
    // tylko pary trend→trend: pomijamy tydzień zrzutowy i ten zaraz po nim
    for (let j = 1; j < budowa; j++) {
      if ((j + 1) % 4 === 0 || j % 4 === 0) continue;
      out.push((o[j] - 0.05) / (o[j - 1] + 0.05) - 1);   // luz na siatkę 0,1 km
    }
    return out;
  };

  await t.test('⚠️ w reżimie budowania trend nigdy nie przekracza pasma bazy', () => {
    for (const dystans of ['5k', '10k', 'half', 'marathon']) {
      for (const baza of [15, 22, 30, 45, 60]) {
        for (const h of [16, 26, 40]) {
          const r = G.uloz({ dystans, dniWTygodniu: 5, dataStartu: zaTyg(h), today: TODAY,
            poziom: { p10sec: 300, wynik: null, objetoscTygodniowa: baza }, celCzasowy: null });
          if (!r.ok || r.meta.rezim === 'fala') continue;
          const limit = baza < 20 ? 0.08 : baza < 40 ? 0.06 : baza < 70 ? 0.04 : 0.03;
          for (const t2 of trendy(r, baza)) {
            assert.ok(t2 <= limit + 1e-9,
              dystans + ' baza ' + baza + ' @' + h + 'tyg rośnie ' + (t2 * 100).toFixed(1) +
              '%/tydz przy limicie ' + (limit * 100) + '%');
          }
        }
      }
    }
  });

  /* ⚠️ FALA JEST WYJĄTKIEM ŚWIADOMYM, NIE PRZEOCZENIEM — i test ma to utrwalić,
     bo inaczej ktoś „naprawi" ją przy następnym czytaniu. Fala nie buduje nowej
     formy, tylko wraca do objętości, którą zawodnik ma dziś (90% → 110%).
     Przy 3%/tydz baza 129 nie zdążyła wrócić do własnych 110% w 10 tygodniach. */
  await t.test('⚠️ reżim „fala" NADAL sięga 110% bazy — tam limit pasma nie obowiązuje', () => {
    const r = G.uloz({ dystans: 'half', dniWTygodniu: 5, dataStartu: zaTyg(10), today: TODAY,
      poziom: { p10sec: 300, wynik: null, objetoscTygodniowa: 129 }, celCzasowy: null });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.meta.rezim, 'fala');
    const szczyt = Math.max.apply(null, r.meta.objetosciTygodni);
    assert.ok(Math.abs(szczyt - 129 * G.LIMITY.SZCZYT_NAD_BAZA) < 0.6,
      'fala nie dochodzi do 110% bazy: ' + szczyt);
  });

  /* Płaskowyż SKRÓCIŁ się, ale NIE ZNIKNĄŁ — i to jest osobny problem
     (jeden `peak` na cały plan). Test pilnuje kierunku, nie rozwiązania. */
  await t.test('szczyt wypada później niż przy płaskich 8%', () => {
    const r = G.uloz({ dystans: 'marathon', dniWTygodniu: 5, dataStartu: zaTyg(30), today: TODAY,
      poziom: { p10sec: 300, wynik: null, objetoscTygodniowa: 60 }, celCzasowy: null });
    const o = r.meta.objetosciTygodni;
    const tydzienSzczytu = o.indexOf(Math.max.apply(null, o)) + 1;
    assert.ok(tydzienSzczytu >= 5, 'szczyt w tygodniu ' + tydzienSzczytu + ' — wróciły płaskie 8%');
  });
});

/* ══ ODMOWA CELU NA BRZEGU ═══════════════════════════════════════════════════
   Maciek: prognoza 2:21:35, cel 2:00:00, realny cel 2:00:20 — a komunikat mówił
   „2:00:00 to za duży skok". Dwadzieścia sekund nie jest za dużym skokiem. */
test('CEL_ZA_AMBITNY NA BRZEGU MÓWI, ILE BRAKUJE', async (t) => {
  const maciek = (cel) => G.uloz({ dystans: 'half', dniWTygodniu: 5, dataStartu: zaTyg(61),
    today: TODAY, poziom: { p10sec: 385, wynik: null, objetoscTygodniowa: 19.6 }, celCzasowy: cel });

  await t.test('⚠️ przy różnicy 20 s nie pada „za duży skok"', () => {
    const s = maciek(7200).sciana;
    assert.strictEqual(s.kod, 'CEL_ZA_AMBITNY');
    assert.strictEqual(s.szczegoly.naBrzegu, true);
    assert.strictEqual(s.szczegoly.brakuje_s, 20);
    assert.match(s.komunikat, /Do 2:00:00 brakuje 20 s/);
    assert.doesNotMatch(s.komunikat, /za duży skok/);
  });

  /* ⚠️ ODMOWA ZOSTAJE ODMOWĄ — zmieniło się zdanie, nie reguła. Sufit 15% stoi
     nietknięty i cel dalej się o niego odbija. */
  await t.test('⚠️ to nadal jest ODMOWA, sufit nie drgnął', () => {
    const r = maciek(7200);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.sciana.szczegoly.limitProc, 15);
    assert.strictEqual(G.LIMITY.MAX_POPRAWA, 0.15);
  });

  await t.test('cel daleko od sufitu dostaje STARE zdanie', () => {
    const s = maciek(6600).sciana;      // 1:50:00 — 22% poprawy
    assert.strictEqual(s.szczegoly.naBrzegu, false);
    assert.match(s.komunikat, /to za duży skok/);
  });

  /* Próg 1 pkt proc. jest mniejszy od niepewności samej prognozy: nasz wykładnik
     Riegela to 1,06, a na własnych danych 1,091 — dla dziesiątki Maćka różnica
     w prognozie półmaratonu wynosi 199 s, czyli 2,3%. */
  await t.test('próg brzegu jest ciaśniejszy niż rozrzut samej prognozy', () => {
    const t10 = 385 * 10, iloraz = 21.0975 / 10;
    const a = t10 * Math.pow(iloraz, 1.06), b = t10 * Math.pow(iloraz, 1.091);
    assert.ok((b - a) / a > 0.01, 'rozrzut wykładnika zszedł poniżej progu — przelicz próg');
  });
});

/* ══ SZCZYT MUSI ROSNĄĆ Z BAZĄ (25.08.2026) ══════════════════════════════════
   `peakKm` jest stałą, więc powyżej pewnej bazy `min()` przestawał zależeć od
   zawodnika i szczyt zamierał na sufit dystansu — a tuż obok, po przekroczeniu
   `peakKm`, reżim „fala" dawał 1,10 × baza, czyli WIĘCEJ:
       maraton    baza 69 → 70,0 (1,014×)  |  baza 70 → 77,0 (1,100×)
       półmaraton baza 54 → 55,0 (1,019×)  |  baza 55 → 60,5 (1,100×)
   Człowiek tuż POD progiem dostawał gorszy plan niż ten tuż NAD nim, mimo że
   „fala" jest z założenia planem podtrzymania. Dwie realne osoby w tej dziurze. */
test('SZCZYT JEST MONOTONICZNY WZGLĘDEM BAZY', async (t) => {
  const szczyt = (dystans, baza, h) => {
    const r = G.uloz({ dystans, dniWTygodniu: 5, dataStartu: zaTyg(h), today: TODAY,
      poziom: { p10sec: 280, wynik: null, objetoscTygodniowa: baza }, celCzasowy: null });
    return r.ok ? Math.max.apply(null, r.meta.objetosciTygodni) : null;
  };

  /* ⚠️ PRZEMIATAMY CO 1 km — krok 5 albo 10 przeskoczyłby próg `peakKm`
     i nie zobaczyłby urwiska. Tak właśnie ta wada przetrwała dwa tygodnie.
     Horyzonty od minTygodni, bo największy spadek (9,4 km) siedzi dokładnie
     na minimum maratonu i przy h=20 był niewidoczny. */
  const wszystkieSpadki = () => {
    const out = [];
    for (const dystans of ['5k', '10k', 'half', 'marathon']) {
      for (let h = G.DYSTANSE[dystans].minTygodni; h <= 40; h++) {
        let poprz = null, poprzB = null;
        for (let b = 5; b <= 160; b++) {
          const s = szczyt(dystans, b, h);
          if (s == null) continue;
          if (poprz != null && s < poprz - 1e-9) out.push({ dystans, h, od: poprzB, doB: b, ile: poprz - s });
          poprz = s; poprzB = b;
        }
      }
    }
    return out;
  };

  /* ⚠️ URWISKO `peakKm` ZNIKNĘŁO, RESZTKA MA INNE ŹRÓDŁO I JEST PRZYPIĘTA.
     Zostało 14 spadków, wszystkie na granicach pasm PRZYROST_WG_BAZY (20/40),
     największy 9,40 km (maraton @16 tyg., baza 39→40, szczyt 68,6→59,2).
     Wymuszenie monotoniczności TAM skasowałoby samo pasmowanie: przy 12
     tygodniach budowy limit 6% daje 78,5 km, a 4% — 64,0. To osobna decyzja
     (kandydat: interpolacja maxPrzyrostDla; zmierzone — 14 spadków → 3,
     największy 0,90 km, 34 plany z 2964 zmieniają szczyt, ZERO nowych odmów).
     Test pilnuje, żeby resztka nie urosła i nie wyszła poza granice pasm. */
  await t.test('⚠️ spadki TYLKO na granicach pasm przyrostu i nie przybywa ich', () => {
    const spadki = wszystkieSpadki();
    for (const sp of spadki) {
      const pasmo = [20, 40, 70].some(g => sp.od < g && sp.doB >= g);
      /* ⚠️ DRUGIE ŹRÓDŁO, ZNALEZIONE TYM TESTEM: `startTyg`. Na progu `peakKm`
         reżim przełącza się na „falę", która startuje od 0,90 × baza zamiast
         od bazy — a przy 5-6 tygodniach nie ma czasu tego odrobić. Zmierzone:
         5 km @5 tyg., baza 29 → [29 30,7 31,9 …], baza 30 → [27 29,2 31,5 …].
         Podłoga z 25.08 wyrównała SZCZYT, ale nie START; to osobna decyzja,
         bo dołek fali jest zamierzony. Spadek 0,40 km. */
      const prog = [G.DYSTANSE[sp.dystans].peakKm].some(g => sp.od < g && sp.doB >= g);
      assert.ok(pasmo || prog,
        'spadek POZA znanymi granicami: ' + sp.dystans + ' @' + sp.h + 'tyg baza ' +
        sp.od + '→' + sp.doB + ' (−' + sp.ile.toFixed(2) + ' km)');
    }
    assert.ok(spadki.length <= 16, 'przybyło spadków: ' + spadki.length + ' (było 16)');
    const naj = spadki.length ? Math.max.apply(null, spadki.map(x => x.ile)) : 0;
    assert.ok(naj <= 9.4 + 1e-9, 'największy spadek urósł do ' + naj.toFixed(2) + ' km');
  });

  /* Punkt styku obu gałęzi: w `obecna === peakKm` mieszany i fala muszą dać
     tę samą liczbę, inaczej urwisko wraca — tylko przesunięte o kilometr. */
  await t.test('⚠️ funkcja jest CIĄGŁA w punkcie przejścia mieszany → fala', () => {
    for (const [dystans, h] of [['half', 16], ['marathon', 20], ['10k', 14], ['5k', 12]]) {
      const prog = G.DYSTANSE[dystans].peakKm;
      const pod = szczyt(dystans, prog - 1, h), nad = szczyt(dystans, prog, h);
      assert.ok(pod != null && nad != null, dystans + ': brak planu na progu');
      assert.ok(Math.abs(nad / (prog) - pod / (prog - 1)) < 0.02,
        dystans + ': stosunek szczyt/baza skacze na progu — ' +
        (pod / (prog - 1)).toFixed(3) + '× → ' + (nad / prog).toFixed(3) + '×');
    }
  });

  await t.test('nikt poniżej progu nie dostaje mniej, niż dałaby fala', () => {
    for (const dystans of ['5k', '10k', 'half', 'marathon']) {
      for (const h of [12, 16, 20, 30]) {
        if (G.DYSTANSE[dystans].minTygodni > h) continue;
        for (let b = 5; b <= 160; b++) {
          const s = szczyt(dystans, b, h);
          if (s == null) continue;
          assert.ok(s >= b * G.LIMITY.SZCZYT_NAD_BAZA - 0.06,
            dystans + ' @' + h + ' baza ' + b + ': szczyt ' + s.toFixed(1) +
            ' < fala ' + (b * G.LIMITY.SZCZYT_NAD_BAZA).toFixed(1));
        }
      }
    }
  });
});
