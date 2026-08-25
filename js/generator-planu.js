/* generator-planu.js — silnik generatora planów (P2)
 *
 * window.GeneratorPlanu.uloz(wejscie) -> { ok:true, plan, treningi, meta }
 *                                      | { ok:false, sciana: { kod, komunikat, szczegoly } }
 *
 * CZYSTA FUNKCJA. Zero DOM, zero Supabase, zero Date.now() — wszystko, łącznie
 * z „dzisiaj", wchodzi wejściem. Testowalna w izolacji (Node).
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ ŚCIANA JEST FUNKCJĄ, NIE WYJĄTKIEM.                                      ║
 * ║ Odmowa to prawidłowy, częsty wynik działania tego silnika — nie błąd.     ║
 * ║ Najczęstsza skarga na konkurencję (Kiprun) to przeszacowane tempa:        ║
 * ║ doświadczony ale wolny biegacz dostał pierwszą sesję 30% szybszą niż jego ║
 * ║ życiówka i już nie wrócił.                                               ║
 * ║   PRZY BRAKU DANYCH ODMAWIAMY. NIGDY NIE ZGADUJEMY W GÓRĘ.                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * KONTRAKT wejscie = {
 *   dystans:       '5k' | '10k' | 'half' | 'marathon',
 *   dataStartu:    'YYYY-MM-DD',      // data zawodów
 *   dniWTygodniu:  3..6,
 *   today:         'YYYY-MM-DD',      // punkt odniesienia (wstrzykiwany, nie Date.now())
 *   poziom: {
 *     p10sec:      number | null,     // tempo na 10 km w s/km — KOTWICA wszystkich stref
 *     wynik:       { dystans_km, czas_s } | null,   // gdy brak p10sec: przeliczamy Rieglem
 *     objetoscTygodniowa: number | null              // km/tydz; null => założenie 20 (patrz meta.zalozenia)
 *   },
 *   celCzasowy:    number | null      // sekundy; null = bez celu czasowego
 * }
 *
 * Wyjście mapuje się 1:1 na kolumny training_plans / training_plan_workouts,
 * żeby P4 był zwykłym insertem bez tłumaczenia pól.
 *
 * STREFY — skalibrowane na 489 treningach z biblioteki planów, sierpień 2026.
 * Źródło i zastrzeżenia: docs/generator-planow-spec.md.
 */
(function (root) {
  'use strict';

  // ── STREFY (s/km ponad P10) — docs/generator-planow-spec.md ────────────────
  var STREFY = {
    E:   95,    // spokojne — mediana praktyki 97
    Reg: 120,   // regeneracja — mediana 122
    M:   25,    // maratońskie — BRAK DANYCH, wzór wyjściowy
    T:   30,    // próg — mediana 30
    I:   5,     // interwały — mediana 5, zatwierdzone przez Filipa
    R:  -30     // rytmy — BRAK DANYCH, wzór wyjściowy
  };

  /* ⚠️ OSĄD, NIE POMIAR — w odróżnieniu od stref, które są skalibrowane na 489
     treningach. Poniższe liczby (minTygodni, peakKm, taper) to moja i Filipa
     ocena, bez pokrycia w danych z biblioteki. Jeśli kiedyś będą dane — zmierzyć
     i podmienić. Maraton ma 16 tygodni zamiast rozważanych 12 świadomie:
     ostrożniej znaczy tu lepiej. */
  /* minSzczyt      — poniżej tej objętości plan na dany dystans jest fikcją (ZA_MALA_BAZA)
     udzialDlugiego — jaki ułamek tygodnia bierze wybieganie. NIE jest płaski: przy
                      stałych 33% próg minDlugieProc dla maratonu byłby nieosiągalny
                      dla nikogo (0,33 × 70 = 23,1 km przy wymaganych 23,2) i silnik
                      odrzucałby KAŻDY maraton. Długie rośnie z dystansem, jak w realnych planach.
     minDlugieProc  — ile procent dystansu docelowego musi sięgnąć najdłuższe wybieganie
                      (ZA_KROTKIE_WYBIEGANIE). Bramka na szczyt tygodniowy tego nie łapie.
     maxDlugieKm    — ⚠️ OD 19.08.2026 TO PODŁOGA SUFITU, NIE SUFIT. Sufit liczy
                      `sufitWybiegania(d, baza)` = max(maxDlugieKm, min(0,30 × baza, 32)).
                      Ta liczba jest wartością dla kogoś, kto NIE ma dużej bazy —
                      i tylko dla niego jest wiążąca. Historycznie była sufitem;
                      poniższy akapit opisuje, po co powstała, i nadal obowiązuje
                      jako uzasadnienie CAPU 32 km:
                      minDlugieProc pilnuje dołu i NIC nie pilnowało góry:
                      zawodnik na 129 km/tydz dostawał na półmaraton wybieganie 46,4 km.
                      Nadmiar objętości idzie do biegów spokojnych, nie w jedną jednostkę.
                      22 km przy półmaratonie to 104% dystansu — tyle wystarczy, żeby
                      zawodnik był pewny, że dobiegnie, bez kosztu jednostki maratońskiej.
                      Powyżej 22 przy półmaratonie rośnie zmęczenie, a nie forma.
                      ⚠️ Sufit NIE może kolidować z minDlugieProc: dla half próg to
                      0,55 × 21,0975 = 11,6 km, więc sufit 22 leży 10,4 km NAD nim.
                      Bramka odpala się wyłącznie gdy udzialDlugiego × peak < 11,6,
                      czyli przy peak < 32 km/tydz — to zależy od objętości, nie od sufitu. */
  var DYSTANSE = {
    '5k':       { km: 5.0,     etykieta: '5 km',        minTygodni: 4,  peakKm: 30, taper: 1, minSzczyt: 20, udzialDlugiego: 0.30, minDlugieProc: 0.60, maxDlugieKm: 14, rekord: 755 },
    '10k':      { km: 10.0,    etykieta: '10 km',       minTygodni: 6,  peakKm: 40, taper: 1, minSzczyt: 25, udzialDlugiego: 0.33, minDlugieProc: 0.60, maxDlugieKm: 18, rekord: 1571 },
    'half':     { km: 21.0975, etykieta: 'Półmaraton',  minTygodni: 10, peakKm: 55, taper: 2, minSzczyt: 30, udzialDlugiego: 0.36, minDlugieProc: 0.55, maxDlugieKm: 22, rekord: 3440 },
    'marathon': { km: 42.195,  etykieta: 'Maraton',     minTygodni: 16, peakKm: 70, taper: 3, minSzczyt: 45, udzialDlugiego: 0.40, minDlugieProc: 0.55, maxDlugieKm: 34, rekord: 7170 }
  };

  /* ── SANITY CZASU: JEDNO ŹRÓDŁO ────────────────────────────────────────────
     `rekord` w DYSTANSE to MĘSKI rekord świata w sekundach. Męski, bo szybszy —
     granica z niego obejmuje wszystkich. Zweryfikowany w sieci 11.08.2026,
     NIE przepisany z pamięci (dwa okazały się nieaktualne):

       5 km    755 s = 12:35,36  Joshua Cheptegei (UGA), 5000 m tor, 14.08.2020
                                 worldathletics.org/records
       10 km  1571 s = 26:11,00  Joshua Cheptegei (UGA), 10 000 m tor,
                                 Valencia, 07.10.2020
       półm.  3440 s = 57:20     Jacob Kiplimo (UGA), Lisbon Half Marathon,
                                 08.03.2026 — worldathletics.org/news/report/
                                 jacob-kiplimo-half-marathon-world-record-lisbon
       maraton 7170 s = 1:59:30  Sabastian Sawe (KEN), London Marathon,
                                 26.04.2026 — pierwsze sub-2 w biegu z rywalizacją;
                                 en.wikipedia.org/wiki/2026_London_Marathon

     Dla 5 i 10 km biorę rekordy TOROWE — są szybsze od szosowych (12:51 / 26:24),
     więc próg z nich nie odetnie nikogo prawdziwego.

     ⚠️ Progi LICZĄ SIĘ z rekordu, nie są wpisane osobno. Komunikat odmowy cytuje
     ten sam `rekord`, więc aktualizacja przesuwa próg i treść jednocześnie.
     ⚠️ Rekordy się poprawiają — przy aktualizacji zmienić TYLKO `rekord`.

     GÓRNA granica liczy się od TEMPA MARSZU (12:00/km), nie od rekordu. Gdyby
     szła od rekordu, maraton × 1,25 dałby 2:29:23 i odrzucałby każdego amatora.
     Margines jest RÓŻNY dla wyniku i celu, bo to różne rzeczy:
       WYNIK to FAKT — ktoś to przebiegł, więc liczba ma oparcie w rzeczywistości.
       CEL to ZAMIAR — ktoś może chcieć spokojnie ukończyć, więc luźniej.
     ⚠️ Przy wątpliwości POLUZOWAĆ, nie zacieśniać: fałszywa odmowa kosztuje
     więcej niż przepuszczenie dziwnej liczby, bo człowiek odchodzi zamiast
     poprawić. Kontrola: maraton w 6 godzin (normalny pierwszy start) przechodzi
     w obu trybach z ogromnym zapasem — 6:00 wobec limitów 10:32 i 11:48.

     ⚠️ ROLA SANITY ZALEŻY OD TEGO, CZY JEST PUNKT ODNIESIENIA:
       WYNIK (krok 4) — historii NIE MA, sanity jest JEDYNĄ bramką → ciasno.
       CEL             — historia ZAWSZE jest (BRAK_POZIOMU odrzuca wcześniej),
                         więc rozstrzyga ściana CEL_ZA_AMBITNY, a sanity stoi
                         za nią jako backstop → luźno w obie strony. */
  var MARGINES_WYNIK = 0.95;     // wynik: rekord × 0,95 — jedyna bramka, ciasno
  var MARGINES_CEL   = 0.80;     // cel: rekord × 0,80 — backstop, ściana jest przed nim
  var TEMPO_MARSZU = 720;        // 12:00/km — baza górnej granicy
  var LUZ_WYNIK = 1.25;          // wynik: fakt, więc ciaśniej
  var LUZ_CEL   = 1.40;          // cel: zamiar, więc luźniej

  Object.keys(DYSTANSE).forEach(function (k) {
    var d = DYSTANSE[k];
    d.minCzasWynik  = Math.round(d.rekord * MARGINES_WYNIK / 60) * 60;
    d.minCzasCel    = Math.round(d.rekord * MARGINES_CEL / 60) * 60;
    d.maxCzasWynik  = Math.round(d.km * TEMPO_MARSZU * LUZ_WYNIK);
    d.maxCzasCel    = Math.round(d.km * TEMPO_MARSZU * LUZ_CEL);
  });

  /* Wspólny sanity dla CELU (silnik woła wprost) i WYNIKU w kroku 4 (klient woła
     przez API). Jedna implementacja, jeden komunikat, jedna tabela rekordów —
     inaczej dwa miejsca rozjadą się przy pierwszej zmianie.
     `tryb` domyślnie 'cel', bo luźniejszy: przy braku informacji przepuszczamy.
     Zwraca null, gdy czas jest w skali. */
  function sanityCzasu(dystansKey, sek, tryb) {
    var d = DYSTANSE[dystansKey];
    if (!d || !(sek > 0)) return null;
    var gora = tryb === 'wynik' ? d.maxCzasWynik : d.maxCzasCel;
    var dol  = tryb === 'wynik' ? d.minCzasWynik : d.minCzasCel;
    if (sek < dol) {
      return { kod: 'CZAS_POZA_SKALA',
        komunikat: d.etykieta + ' w ' + fmtCzas(sek) + ' to szybciej niż rekord świata (' +
                   fmtCzas(d.rekord) + '). Sprawdź, czy dobrze wpisałeś czas.',
        szczegoly: { podany_s: sek, prog_s: dol, rekord_s: d.rekord,
                     dystans: dystansKey, tryb: tryb || 'cel', kierunek: 'za_szybko' } };
    }
    if (sek > gora) {
      return { kod: 'CZAS_POZA_SKALA',
        komunikat: d.etykieta + ' w ' + fmtCzas(sek) + ' to ' + fmtTempo(sek / d.km) +
                   '/km — wolniej niż marsz. Sprawdź, czy dobrze wpisałeś czas.',
        szczegoly: { podany_s: sek, prog_s: gora, dystans: dystansKey,
                     tryb: tryb || 'cel', kierunek: 'za_wolno' } };
    }
    return null;
  }

  /* ── ILE POPRAWY WOLNO ZAŁOŻYĆ — ZALEŻY OD LICZBY TYGODNI ──────────────────
     Do 18.08.2026 stało tu stałe 8% i to była ta sama pomyłka co przy suficie
     objętości: `tygodnie` pojawiało się WYŁĄCZNIE w treści komunikatu, nigdy
     w decyzji. Zdanie „potrzebujesz kilku sezonów, nie 113 tygodni" generował
     kod, który nigdy nie spojrzał na 113 — a 113 tygodni TO SĄ dwa sezony.
     Zmierzone przed poprawką: odpowiedź identyczna przy 11 i przy 300 tygodniach
     (15,2% potrzebne, 8% limit, cel realny 2:10:15 w każdym przypadku).

     ⚠️ 0,75%/tydz to INTERPRETACJA, NIE POMIAR. Literatura mówi o 8–15% poprawy
     w pierwszym roku ustrukturyzowanego treningu u początkującego (RunnersConnect,
     zebrane 18.08.2026) — czyli ok. 0,15–0,29%/tydz w skali roku. Nasze 0,75%/tydz
     jest hojniejsze, bo dotyczy KRÓTKIEGO horyzontu, gdzie postęp jest najszybszy;
     w skali roku sufit i tak go przycina. Jeśli kiedyś będą własne dane o parach
     PB z datami — zmierzyć i podmienić.

     ⚠️ SUFIT 15% JEST NIEZALEŻNY OD CZASU I TO JEST CELOWE. Poprawa nie skaluje
     się liniowo w latach: pierwszy rok daje najwięcej, kolejne coraz mniej.
     Bez sufitu reguła przy pięciu latach dopuszczałaby 195%, czyli wszystko. */
  var POPRAWA_NA_TYDZIEN = 0.0075;   // ⚠️ OSĄD — interpretacja zakresu 0,5–1%
  var MAX_POPRAWA_SUFIT  = 0.15;     // twardy sufit, niezależny od horyzontu
  function maxPoprawaDla(tygodnie) {
    return Math.min(Math.max(tygodnie, 0) * POPRAWA_NA_TYDZIEN, MAX_POPRAWA_SUFIT);
  }
  var MAX_POPRAWA = MAX_POPRAWA_SUFIT;   // zostaje w LIMITY dla zgodności odczytu
  /* Poniżej tylu punktów procentowych od sufitu odmowa mówi „ile brakuje",
     a nie „za duży skok". Wyprowadzenie przy użyciu (przypadek Maćka). */
  var PROG_BRZEGU_CELU = 0.01;
  /* Od ilu procent WOLNIEJSZY cel zasługuje na zdanie w podsumowaniu. 5% na
     półmaratonie to ok. 5 minut — poniżej tego różnica tonie w błędzie Riegla
     (wykładnik 1,06 jest przybliżeniem), więc zdanie byłoby szumem. ⚠️ OSĄD. */
  var PROG_CELU_PONIZEJ_FORMY = 0.05;
  /* ── SUFIT PRZYROSTU OBJĘTOŚCI, STOPNIOWANY PO BAZIE ───────────────────────
     ⚠️ TO JEST INTERPRETACJA REGUŁY 10%, NIE POMIAR NA NASZYCH DANYCH.
     Powód, dla którego stopniowanie w ogóle wprowadzamy: +8% od 100 km/tydz to
     +8 km, czyli tyle, ile cała tygodniowa objętość początkującego. Ta sama
     liczba procentowa znaczy co innego na obu końcach skali.

     ⚠️ SPRAWDZONE NA WŁASNYCH DANYCH I NIEPOTWIERDZONE. Policzone na 2671 logach
     (bloki 4-tygodniowe bez ani jednego tygodnia zerowego, czyli realne budowanie):
         baza <20 km   mediana 6,5%/tydz   p90 11,1%   — 3 zawodników
         baza 20–40    mediana 3,7%        p90  9,3%   — 13 zawodników
         baza 40–70    mediana 4,8%        p90 11,1%   — 6 zawodników
         baza >70      mediana 3,2%        p90 10,8%   — 3 zawodników
     Dane NIE pokazują spadku z bazą: pasmo 40–70 rośnie SZYBCIEJ niż 20–40,
     a p90 jest płaskie (~11%) na całym zakresie. Przy trzech zawodnikach
     w skrajnych pasmach nie da się z tego zbudować reguły — więc poniższe
     8/6/4/3 pochodzi z interpretacji reguły 10%, a dane służą wyłącznie jako
     kontrola rzędu wielkości (mediany 3–6,5% mieszczą się pod każdym z progów).
     Jeśli kiedyś przybędzie zawodników — zmierzyć ponownie i podmienić. */
  /* ── OD 25.08.2026 KRZYWA, NIE SCHODY ──────────────────────────────────────
     Wartości 8/6/4/3 NIE ZMIENIŁY SIĘ. Zmieniło się to, że między nimi jest
     teraz prosta, a nie uskok.

     ⚠️ POWÓD JEST MIERZALNY, NIE ESTETYCZNY. Schodek na granicy pasma sprawiał,
     że zawodnik z WIĘKSZĄ bazą dostawał NIŻSZY szczyt: maraton na 16 tygodni,
     baza 39 → szczyt 68,6 km/tydz, baza 40 → 59,2. Dziewięć i pół kilometra
     kary za jeden kilometr bazy więcej, bo limit spadał skokowo z 6% na 4%,
     a `osiagalnyPeak` liczy się z niego wykładniczo przez 12 tygodni.
     Zmierzone na pełnym zakresie: 16 spadków szczytu, największy 9,40 km.

     ⚠️ KOTWICE STOJĄ W ŚRODKACH DAWNYCH PASM i to jest jedyna nowa liczba
     w tej zmianie — same wartości procentowe są nietknięte. Konstrukcja:
     pasmo bez dolnego końca traktujemy jak [0,20], bez górnego jak [70,100],
     i bierzemy środek każdego. Stąd 10 / 30 / 55 / 85.
     Skutek, który warto znać: baza reprezentatywna dla każdego pasma zachowuje
     DOKŁADNIE swój dawny limit (10→8%, 30→6%, 55→4%, 85→3%), a zmieniają się
     bazy przy dawnych granicach — 20 dostaje 7% zamiast 6%, 40 dostaje 5,2%
     zamiast 4%, ale 19 dostaje 7,1% zamiast 8%. To NIE JEST poluzowanie
     reguły — w jedną stronę daje więcej, w drugą mniej, a znika uskok.

     ⚠️ POZA SKRAJNYMI KOTWICAMI JEST PŁASKO I TO JEST KONIECZNE, nie kosmetyka.
     Ekstrapolacja liniowa w dół dałaby przy bazie 5 przyrost 8,5%, a w górę
     przy bazie 200 wartość UJEMNĄ (−0,6%), czyli plan malejący albo dzielenie
     przez zero w `tygodniDoBazy`. Poniżej 10 zwracamy 8%, powyżej 85 — 3%. */
  var PRZYROST_WG_BAZY = [
    { bazaKm: 10, proc: 0.08 },
    { bazaKm: 30, proc: 0.06 },
    { bazaKm: 55, proc: 0.04 },
    { bazaKm: 85, proc: 0.03 }
  ];
  function maxPrzyrostDla(bazaKm) {
    var n = PRZYROST_WG_BAZY.length;
    if (!(bazaKm > PRZYROST_WG_BAZY[0].bazaKm)) return PRZYROST_WG_BAZY[0].proc;
    for (var i = 1; i < n; i++) {
      var a = PRZYROST_WG_BAZY[i - 1], b = PRZYROST_WG_BAZY[i];
      if (bazaKm <= b.bazaKm) {
        var t = (bazaKm - a.bazaKm) / (b.bazaKm - a.bazaKm);
        return a.proc + t * (b.proc - a.proc);
      }
    }
    return PRZYROST_WG_BAZY[n - 1].proc;
  }
  var MAX_PRZYROST_TYG = 0.08;   // najwyższy z progów — zostaje dla zgodności odczytu
  var ZRZUT = 0.70;              // co czwarty tydzień: 70% trendu (cykl 3:1)
  var ZRZUT_CO = 4;
  var MIN_DNI = 3, MAX_DNI = 6;
  /* Minimum tygodni BUDOWANIA (po odjęciu taperu). Trzy, bo cykl zrzutowy ma
     cztery tygodnie — przy dwóch nie zdąży się nic zbudować ani raz zregenerować.
     ⚠️ OSĄD, nie pomiar. Wchodzi w parze z minTygodni każdego dystansu, nie
     zamiast: pilnuje tego, czego minTygodni nie widzi, czyli taperu. */
  var MIN_TYG_BUDOWY = 3;
  /* ── NAJDŁUŻSZY PLAN, JAKI UKŁADAMY ────────────────────────────────────────
     Do 24.08.2026 sufitu NIE BYŁO — `tygodnie` szło wprost z daty startu i nikt
     go nie przycinał. ZMIERZONE, co z tego wychodziło: przy starcie za 113 tyg.
     silnik oddawał 785 wierszy, przy 520 tyg. — 3634 wiersze i 816 kB JSON-a.
     Bez błędu, bez ostrzeżenia. Plan na dziesięć lat wyglądał jak plan.

     ⚠️ POWÓD SUFITU NIE JEST TECHNICZNY. Krzywa objętości planu 113-tygodniowego
     (baza 30) osiąga szczyt w TYGODNIU 9, a potem 26 razy powtarza ten sam
     cykl 49/49/49/34. To nie jest plan dwuletni — to plan 9-tygodniowy
     z dwuletnią tapetą. Sufit nie odbiera niczego, co istniało; nazywa granicę,
     za którą silnik i tak nic nowego nie mówi.

     52, bo rok jest granicą naturalną: dłuższy horyzont to inny problem
     (budowa bazy), a nie dłuższy ten sam plan. ⚠️ OSĄD, nie pomiar. */
  var MAX_TYGODNI = 52;
  /* Najkrótsze wybieganie, jakie plan ma prawo nazwać wybieganiem.
     ⚠️ DOTYCZY WYŁĄCZNIE WYBIEGANIA. Biegi spokojne i regeneracja świadomie NIE
     mają podłogi — przy bazie 19 km/tydz bieg spokojny 3,7 km jest poprawny,
     a podłoga na nim odbierałaby dni komuś, dla kogo generator powstał.
     Pełne uzasadnienie przy jego użyciu w ulozTydzien. ⚠️ OSĄD, nie pomiar. */
  var MIN_WYBIEGANIA_KM = 6;
  /* Najkrótsza jednostka, którą warto wpisać do planu. Poniżej tego przebranie
     się, dojście i rozgrzewka trwają dłużej niż sam bieg — to nie jest trening,
     tylko pozycja w kalendarzu.
     ⚠️ OSĄD, NIE POMIAR — nie mam danych mówiących, gdzie leży ta granica.
     Zmierzony jest ZASIĘG: przed wprowadzeniem podłogi 663 jednostki na 5644
     tygodni schodziły poniżej 3 km, najkrótsza 1,5 km (Regeneracja przy bazie
     15 km/tydz, gdzie liczy się ją jako 10% tygodnia). */
  var MIN_JEDNOSTKI_KM = 3;
  /* Próg drugiej jednostki jakościowej w tygodniu. 45, nie 30 — mimo że przy 30
     dwie jakości też „się mieszczą" w 40% tygodnia, robią to na styk i tydzień
     zrzutowy nie ma z czego zejść. Wyprowadzenie przy funkcji drugaJakosc.
     ⚠️ OSĄD oparty na rachunku, nie pomiar na bibliotece planów. */
  var PROG_DRUGIEJ_JAKOSCI = 45;
  var MIN_DNI_DRUGIEJ_JAKOSCI = 5;
  /* Sufit udziału wybiegania w objętości tygodnia. Równy najwyższemu
     `udzialDlugiego` (maraton, 0,40) — czyli nie wprowadza nowej liczby, tylko
     nie pozwala ratunkowi DLUGIE_NAD_SPOKOJNYM wyjść ponad to, co i tak jest
     maksimum projektowym. Ustępuje, gdy kolidowałby z „wybieganie najdłuższe";
     wyprowadzenie przy użyciu w ulozTydzien. ⚠️ OSĄD, nie pomiar. */
  var MAX_UDZIAL_DLUGIEGO = 0.40;
  /* Minimum taperu dla półmaratonu i maratonu. Dwa tygodnie to metodyczne
     minimum wyciszenia na dystansach, gdzie zmęczenie kumuluje się tygodniami.
     ⚠️ To PODŁOGA, nie wartość — maraton ma 3 i tak zostaje. */
  var MIN_TAPER_DLUGIE = 2;
  var MARATON_MIN_DNI = 4;       // maratonu nie da się unieść na trzech jednostkach
  var OBJETOSC_DOMYSLNA = 20;    // km/tydz przy braku danych — FLOOR, świadomie w dół
  var RIEGEL = 1.06;

  /* Szczyt objętości = sufit bezpieczeństwa, nie cel do osiągnięcia.
     peakKm dystansu jest bezwzględnym sufitem, ale przy zawodniku na 30 km/tydz
     szczyt 70 to fikcja — stąd drugi sufit, względny.
     Podłoga na obecnej objętości jest dodatkiem do formuły min(): bez niej
     zawodnik biegający 90 km/tydz dostałby na maratonie szczyt 70, czyli
     COFNIĘCIE — a to dokładnie ten przypadek, dla którego sufit względny
     powstał. Plan nigdy nie proponuje mniej, niż ktoś już biega. */
  /* ── MNOŻNIK ZALEŻY OD HORYZONTU (24.08.2026) ──────────────────────────────
     Do 24.08.2026 była to stała 1,6 — ta sama liczba przy 10 i przy 52
     tygodniach. Ta sama pomyłka, którą naprawiliśmy 18.08 przy MAX_POPRAWA:
     `tygodnie` występowało w treści komunikatu, nigdy w decyzji.

     ⚠️ REGUŁA BEZPIECZEŃSTWA JUŻ ISTNIAŁA I JUŻ ZNAŁA HORYZONT — to jest
     powód, dla którego ta zmiana jest bezpieczna, a nie poluzowaniem.
     `SKOK_OBJETOSCI` liczy (peak/obecna)^(1/budowa) i odrzuca to, czego nie da
     się dojść w tempie ≤ maxPrzyrostDla(baza). ZMIERZONE przy MNOZNIK=99
     (czyli praktycznie zdjętym), baza 19,6, półmaraton:
         10 tyg → SKOK_OBJETOSCI (+15,9% vs 8%)
         12 tyg → SKOK_OBJETOSCI (+12,1% vs 8%)
         16 tyg → SKOK_OBJETOSCI (+8,3%  vs 8%)
         20 tyg → plan przechodzi
     Mnożnik stał PRZED tą bramką i sprawiał, że przy dłuższych horyzontach
     nigdy nie dochodziła do głosu.

     ⚠️ ALE ZDJĄĆ GO CAŁKIEM NIE WOLNO i to też jest zmierzone: bez niego przy
     ≥20 tygodniach szczyt skacze od razu do peakKm. Bramka mówi „bezpieczne",
     bo 8%/tydz przez 50 tygodni matematycznie się spina — tylko nikt nie
     utrzymuje 8%/tydz przez rok bez choroby, wyjazdu i słabszego miesiąca.
     Tego `SKOK_OBJETOSCI` nie sprawdza, bo nie ma jak. To jest cała praca,
     którą wykonuje ten mnożnik.

     ── SKĄD 2,2 ──────────────────────────────────────────────────────────────
     ⚠️ NIE DA SIĘ GO WYPROWADZIĆ Z REGUŁY PRZYROSTU i sprawdziłem to rachunkiem,
     zamiast założyć. Przy 50 tygodniach budowania sama reguła dopuszcza:
         baza <20  (8%/tydz): 1,08^50 = 46,9×
         baza 20–40 (6%):     1,06^50 = 18,4×
         baza 40–70 (4%):     1,04^50 =  7,1×
         baza >70   (3%):     1,03^50 =  4,4×
     Najniższa z tych liczb jest dwa razy wyższa od 2,2. Reguła przyrostu NIE
     JEST więc źródłem tego sufitu — jest znacznie luźniejsza.

     ⚠️ NASZE DANE TEŻ GO NIE UZASADNIAJĄ. Zmierzone 24.08.2026: pełny rok
     historii w obu oknach ma DWÓCH zawodników (krotność 4,94 i 3,22); przy
     oknie półrocznym czterech (mediana 1,15, p90 4,48, max 5,90). Mediana
     i maksimum leżą po przeciwnych stronach 2,2, a n=2 to nie jest pomiar.

     ⚠️ WIĘC 2,2 TO LICZBA Z SUFITU — dokładnie w tym samym sensie co
     POPRAWA_NA_TYDZIEN. Mówię to wprost, żeby nikt nie szukał wyprowadzenia,
     którego nie ma. Jej rola jest wyłącznie zaporowa: ma nie pozwolić, żeby
     przy bardzo długim horyzoncie plan obiecał komuś potrojenie objętości.

     ⚠️ DZIŚ TEN SUFIT JEST NIEOSIĄGALNY I TO NIE JEST PRZEOCZENIE. `tygodnie`
     jest już przycięte przez MAX_TYGODNI = 52, więc mnożnik dochodzi najwyżej
     do 1,6 + 0,52 = 2,12. Sufit 2,2 zacząłby wiązać dopiero przy planach
     od 60 tygodni. Zostaje jako zapora na wypadek podniesienia MAX_TYGODNI —
     jeśli ktoś je podniesie, ma znaleźć tę linię, a nie odkryć jej brak. */
  var MNOZNIK_SZCZYTU = 1.6;                 // punkt wyjścia (krótki horyzont)
  var MNOZNIK_NA_TYDZIEN = 0.01;             // +0,01 za każdy tydzień planu
  var MNOZNIK_SZCZYTU_CAP = 2.2;             // ⚠️ liczba z sufitu, patrz wyżej
  function mnoznikSzczytu(tygodnie) {
    return Math.min(MNOZNIK_SZCZYTU + Math.max(tygodnie, 0) * MNOZNIK_NA_TYDZIEN,
                    MNOZNIK_SZCZYTU_CAP);
  }

  /* Jednostka jakościowa = rozgrzewka + praca + schłodzenie. Bez tego podziału
     suma km w planie nie zgadza się z tym, co człowiek faktycznie przebiegnie.
     ⚠️ OSĄD, nie pomiar. */
  var ROZGRZEWKA = 2, SCHLODZENIE = 1;   // km
  var ODCINEK_M = 1000;                  // mediana odcinka w bibliotece (n=28)
  var MAX_ODCINKOW = 8;                  // sufit serii
  /* Sufit jednostek jakościowych w tygodniu. Trzecia to już inny reżim treningowy
     i generator nie ma go proponować — nadmiar objętości idzie w biegi spokojne,
     nigdy w kolejny akcent. Dziś układamy JEDNĄ jakość na tydzień, więc ten sufit
     jest zabezpieczeniem na przyszłość, nie ograniczeniem bieżącego zachowania. */
  var MAX_JAKOSC_W_TYG = 2;
  var MAX_TEMPO_KM = 10;                 // PODŁOGA sufitu ciągłego akcentu (patrz sufitAkcentu)…
  var MAX_TEMPO_MIN = 40;                // …albo 40 min, co wypadnie krócej

  /* ── SUFITY JEDNOSTEK SĄ FUNKCJĄ BAZY, NIE STAŁYMI ─────────────────────────
     Do 19.08.2026 `maxDlugieKm` (14/18/22/34) i `MAX_TEMPO_KM` (10) były
     stałymi. ZMIERZONE, dlaczego to źle: przy bazie 25 km/tydz sufit nie
     gryzł ANI RAZU (30% z 25 to 7,5 km, daleko pod 14), a przy bazie 80 na
     piątce zjadał 24 km z 88 — czyli był bezczynny dla tych, których miał
     chronić, i wiążący dla tych, dla których go nie pisano. Zgłoszenie Filipa:
     plan zadawał 63 km/tydz zamiast 88.

     ⚠️ NIE JEST TO „% TYGODNIA". Zmierzone: sam procent przywraca bug, dla
     którego sufit powstał — przy bazie 129 wybieganie wracało do 51 km na
     półmaratonie i 57 na maratonie. Dlatego rośnie z bazą, ale ma TWARDY CAP.

     ⚠️ PODŁOGA TO DZISIEJSZA WARTOŚĆ, WIĘC NIKT NIE TRACI. Dla wybiegania jest
     to `maxDlugieKm` DANEGO DYSTANSU (14/18/22/34), a nie globalne 14 — inaczej
     maratończyk przy bazie 80 zszedłby z 34 km na 24, czyli zmiana pomyślana
     jako podniesienie sufitu obniżyłaby go temu, kogo dotyczy najbardziej.
     Dla akcentu podłogą jest MAX_TEMPO_KM = 10.

     ⚠️ LICZONE Z BAZY (`k.obecna`), NIE Z TYGODNIA. Baza jest stała przez cały
     plan, więc sufit też — nie kurczy się w taperze ani w tygodniu zrzutowym.
     Kurczy się tam natomiast MAX_UDZIAL_DLUGIEGO (40% TYGODNIA) i to on jest
     w tych tygodniach regułą wiążącą. Obie działają szeregowo, patrz układ
     tygodnia niżej. */
  var SUFIT_DLUGIE_UDZIAL_BAZY = 0.30, SUFIT_DLUGIE_CAP = 32;
  var SUFIT_TEMPO_UDZIAL_BAZY  = 0.18, SUFIT_TEMPO_CAP  = 16;

  function sufitWybiegania(d, baza) {
    return Math.max(d.maxDlugieKm, Math.min((baza > 0 ? baza : 0) * SUFIT_DLUGIE_UDZIAL_BAZY, SUFIT_DLUGIE_CAP));
  }
  function sufitAkcentu(baza) {
    return Math.max(MAX_TEMPO_KM, Math.min((baza > 0 ? baza : 0) * SUFIT_TEMPO_UDZIAL_BAZY, SUFIT_TEMPO_CAP));
  }

  /* Kształt tygodnia przy bazie POWYŻEJ sufitu dystansu. Zawodnik na 129 km/tydz
     nie ma rosnąć, ale ma mieć falę — inaczej plan jest płaski przez cały okres.
     ⚠️ OSĄD, nie pomiar. */
  var START_POD_BAZA = 0.90;             // pierwszy tydzień = 90% obecnej objętości
  var SZCZYT_NAD_BAZA = 1.10;            // szczyt = 110% obecnej objętości
  var DLUGIE_NAD_SPOKOJNYM = 1.25;       // ⚠️ OSĄD — o ile długie ma przewyższać spokojny, gdy trzeba je ratować

  // Układ dni w tygodniu (0=Nd … 6=Sb). Długie zawsze w niedzielę.
  var UKLAD_DNI = {
    3: [2, 4, 0],
    4: [1, 3, 5, 0],
    5: [1, 2, 4, 5, 0],
    6: [1, 2, 3, 4, 5, 0]
  };

  var ZAMKNIECIE =
    /* ⚠️ TEKST ZMIENIONY DWA RAZY I OBIE ZMIANY MAJĄ TEN SAM POWÓD: zdanie
       przestawało być prawdą, bo silnik się zmieniał pod nim.

       17.08.2026 — pierwsze zdanie brzmiało `Ten plan się nie dostosuje`.
       Po wdrożeniu oceniAdaptacje() plan reaguje na przerwy i na systematyczne
       niedowykonanie, więc było to kłamstwo na swoją niekorzyść.

       19.08.2026 — końcówka brzmiała `Filip i Kasia zauważą.` i stał przy niej
       komentarz „KOŃCÓWKA ZOSTAJE CO DO SŁOWA". Był słuszny WTEDY: plan się nie
       dostosowywał, więc zdanie niosło całą prawdę o tym, kto tu pilnuje
       człowieka. Po 17.08 wisiało bez kontekstu, a przede wszystkim NIGDY NIE
       TRAFIAŁO DO WŁAŚCIWEGO ADRESATA.
       ⚠️ TO NIE JEST ROZGAŁĘZIENIE, TYLKO PODMIANA — i to jest cała różnica
       wobec pozostałych tekstów o trenerze w aplikacji. Generator jest dostępny
       wyłącznie przy `coach_id IS NULL` (CTA + polityka training_plans_insert_self),
       a `ai_warnings` zamraża się w wierszu W CHWILI GENEROWANIA. Każdy plan
       niosący to zdanie powstał więc u kogoś, kto Filipa i Kasi nie ma. Gałąź
       „z trenerem" nie miałaby żywej ścieżki, byłaby martwym kodem udającym
       zabezpieczenie. Decyzja Filipa z 19.08.2026.

       ⚠️ NOWA KOŃCÓWKA ZOSTAJE CO DO SŁOWA: „Słuchaj ciała bardziej niż planu."
       Stara obiecywała cudzą uwagę, której czytelnik nie dostanie. Nowa daje mu
       radę wykonalną bez nikogo — jedyną rzecz, jaką generator uczciwie może
       powiedzieć komuś, kto trenuje sam. Jeśli kiedyś generator otworzy się dla
       zawodników Z trenerem, TO JEST MOMENT na rozgałęzienie, nie wcześniej.

       ⚠️ STARE PLANY ZOSTAJĄ ZE STARYM ZDANIEM — `ai_warnings` jest zamrożone
       w `training_plans`, ta zmiana dotyczy wyłącznie planów generowanych od
       teraz. Świadomie bez backfillu: przepisywanie ostrzeżenia pod planem,
       który ktoś już przeczytał, to zmiana warunków po fakcie. */
    'Plan reaguje na to, ile biegasz — cofnie się po przerwie i zejdzie niżej, ' +
    'jeśli nie wyrabiasz. Nie widzi za to kontuzji, snu ani życia. ' +
    'Słuchaj ciała bardziej niż planu.';

  // ── DATY ───────────────────────────────────────────────────────────────────
  // Liczone wyłącznie w UTC na stringach 'YYYY-MM-DD'. Nigdy toISOString() na
  // lokalnej dacie — to cofa o dzień w strefach dodatnich (Europe/Warsaw).
  /* ── SIATKA DYSTANSÓW ──────────────────────────────────────────────────────
     Plan zadawał 4,6 / 5,1 / 6,1 km, bo dystanse jednostek to reszta z dzielenia
     objętości tygodnia przez liczbę biegów — liczba z arytmetyki, nie decyzja.
     Nikt nie biega 6,1 km; ta dziesiąta część udaje precyzję, której w planie
     nie ma (objętości same są osądem ±8%). Siatka 0,5 km mówi tyle, ile plan
     naprawdę wie.

     ⚠️ ZAOKRĄGLAMY W JEDNYM MIEJSCU — w trening(), na wyjściu. Sumy tygodni
     (meta.objetosciFaktyczne), suma planu (total_distance_km) i „km" tygodnia
     w PLANVIEW są WSZYSTKIE liczone z target_distance_km, więc zgadzają się
     same, bez korygowania którejkolwiek jednostki. Gdyby zaokrąglać wcześniej,
     w ulozTydzien, sufity i podziały liczyłyby się na już zaokrąglonych
     liczbach i błąd by się kumulował.

     Dodatnia odległość NIGDY nie schodzi do zera — 0,4 km to nadal bieg. */
  var KROK_KM = 0.5;
  function doKroku(km) {
    var r = Math.round(km / KROK_KM) * KROK_KM;
    if (km > 0 && r <= 0) r = KROK_KM;
    return Math.round(r * 10) / 10;         // ucina błąd zmiennoprzecinkowy
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dzienIdx(iso) {
    var p = String(iso).split('-');
    return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }
  function isoZIdx(i) {
    var d = new Date(i * 86400000);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  function dzienTygodnia(i) {   // 0=Nd … 6=Sb
    return new Date(i * 86400000).getUTCDay();
  }
  /* Data do CZYTANIA, nie do parsowania — „26 października 2026".
     Rok zawsze, bo jedyny konsument mówi o dniu odległym o rok albo dwa,
     a „26 października" bez roku jest tam zdaniem dwuznacznym. */
  var MIESIACE_DOPELNIACZ = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
                             'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  /* Odstęp czasu DO CZYTANIA, nie do liczenia: „20 s", „1:05". Sekundy bez
     zera wiodącego, bo „0:20" przy różnicy dwudziestu sekund czyta się jak czas
     wyniku, a nie jak różnica. */
  function fmtOdstep(sek) {
    sek = Math.round(sek);
    if (sek < 60) return sek + ' s';
    return Math.floor(sek / 60) + ':' + pad2(sek % 60);
  }
  function fmtDataPl(idx) {
    var d = new Date(idx * 86400000);
    return d.getUTCDate() + ' ' + MIESIACE_DOPELNIACZ[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  function poprawnaData(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(dzienIdx(s)); }

  // ── TEMPO ──────────────────────────────────────────────────────────────────
  function fmtTempo(sekNaKm) {
    var t = Math.round(sekNaKm);
    return Math.floor(t / 60) + ':' + pad2(t % 60);
  }
  function riegel(czas_s, zKm, naKm) { return czas_s * Math.pow(naKm / zKm, RIEGEL); }
  /* ── KOTWICA: NAJBLIŻSZE PB, PRZELICZONE PRZEZ VDOT (nie Rieglem) ──────────
     Było: każdy wynik szedł Rieglem na dziesiątkę, a dopiero z niej liczyły się
     tempa. Dwie konwersje zamiast jednej, i pierwsza z nich potęgowa.
     Teraz wynik idzie WPROST na VDOT (równanie Danielsa uwzględnia czas trwania
     wysiłku, więc nie jest ekstrapolacją potęgową), a dziesiątka jest tylko
     wewnętrzną jednostką, w której reszta silnika trzyma formę.

     ⚠️ SPRAWDZONE, ŻE RIEGEL DZIAŁA W OBIE STRONY TAK SAMO — pytanie brzmiało,
     czy ekstrapolacja W DÓŁ (maraton → 12 km, 3,5×) jest równie dobra jak w górę.
     Zmierzone na spójnym zestawie PB (22:30 / 46:50 / 1:45:00 / 3:39:00):
         z 5 km  → maraton  -1,5%      z maratonu → 5 km  +1,5%
         z 10 km → maraton  -1,6%      z HM       → 5 km  +1,4%
     Błąd jest symetryczny co do wielkości; kierunek nie pogarsza sprawy.
     Wybór najbliższego PB zmniejsza go niezależnie od strony. */
  function vdotZWyniku(dystans_km, czas_s) {
    var v = dystans_km * 1000 / (czas_s / 60);            // m/min
    return danielsVO2(v) / danielsPctVO2(czas_s / 60);
  }
  function p10ZVdot(vdot) {                               // bisekcja: VDOT maleje z tempem
    var lo = 100, hi = 1500, mid = 300;
    for (var i = 0; i < 60; i++) {
      mid = (lo + hi) / 2;
      if (vdotZWyniku(10, mid * 10) > vdot) lo = mid; else hi = mid;
    }
    return mid;
  }
  function p10ZWyniku(dystans_km, czas_s) { return p10ZVdot(vdotZWyniku(dystans_km, czas_s)); }

  /* Który wynik jest „najbliższy" celowi. Odległość liczona LOGARYTMICZNIE, bo
     przeskok 5→10 km jest tym samym co 10→20 km, a nie o połowę mniejszym.
     ⚠️ REMIS ROZSTRZYGA SIĘ DETERMINISTYCZNIE — wygrywa KRÓTSZY dystans.
     Remis jest osiągalny: przy celu 10 km i PB na 5 oraz 20 km obie odległości
     wynoszą ln 2. Krótszy, bo krótsze PB są zwykle świeższe (biega się je
     częściej), a przy równym błędzie Riegla świeższość rozstrzyga. */
  function najblizszyWynik(wyniki, celKm) {
    var naj = null, najOdl = Infinity, i;
    for (i = 0; i < wyniki.length; i++) {
      var w = wyniki[i];
      if (!(w && w.dystans_km > 0 && w.czas_s > 0)) continue;
      var odl = Math.abs(Math.log(w.dystans_km / celKm));
      if (odl < najOdl - 1e-9 || (Math.abs(odl - najOdl) <= 1e-9 && naj && w.dystans_km < naj.dystans_km)) {
        naj = w; najOdl = odl;
      }
    }
    return naj;
  }
  function prognozaCzasu(p10sec, km) { return riegel(p10sec * 10, 10, km); }
  /* ── STREFY SKALUJĄ SIĘ PROPORCJONALNIE, NIE PRZEZ DODAWANIE ───────────────
     Było `p10 + STREFY[strefa]`. Stałe przesunięcie zastosowane do czterokrotnego
     rozstępu wydolności rozjeżdża rozdzielczość stref — zmierzone:

         P10 3:00/km  →  T−I = 13,9% tempa
         P10 5:00/km  →  T−I =  8,3%
         P10 8:20/km  →  T−I =  5,0%     ← interwały i tempo nierozróżnialne

     Fizjologicznie próg i VO2max są STAŁYMI UŁAMKAMI prędkości maksymalnej,
     więc różnica między nimi ma być stałym procentem, nie stałą liczbą sekund.
     Po zmianie wynosi 8,3% na całym zakresie.

     ⚠️ KALIBRACJA JEST ZACHOWANA CO DO SEKUNDY. STREFY (95/120/30/5) pochodzą
     z pomiaru na 489 treningach z biblioteki i NIE ZOSTAŁY ruszone — zmienia się
     tylko to, jak się ekstrapolują. P10_KALIBRACJI to tempo, przy którym ten
     pomiar wykonano; dla p10 = 300 wzór zwraca dokładnie p10 + STREFY, czyli
     wartości sprzed zmiany. Rozjeżdża się dopiero przy formie odległej od środka
     biblioteki — i o to chodzi.

     ⚠️ SPRAWDZONE I ODRZUCONE: kotwica „tempo progowe = ~1 h wysiłku, interwały =
     tempo 3–5 km" liczona z Riegla NIE naprawia tej wady — rozdzielczość spada
     wtedy 9,0% → 3,6%, czyli tak samo jak przy dodawaniu. Riegel daje też próg
     ok. 27 s/km SZYBSZY niż zmierzony w bibliotece (5:03 vs 5:30 przy P10 5:00),
     więc przyjęcie go przyspieszyłoby każdą jednostkę progową wbrew pomiarowi. */
  /* ŹRÓDŁO WSPÓŁCZYNNIKÓW — świadomie NIE tabela Danielsa.
     STREFY (E +95, Reg +120, T +30, I +5) pochodzą z pomiaru na 489 treningach
     z biblioteki planów Filipa i Kasi, sierpień 2026 (docs/generator-planow-spec.md).
     Struktura jest ta sama co u Danielsa — strefy jako STAŁE UŁAMKI prędkości,
     nie stałe przesunięcia — ale współczynniki są WŁASNE, bo pochodzą z populacji,
     dla której ten generator działa, a nie z tabeli kalibrowanej na innej.
     Przejście na Danielsa jest możliwe i byłoby uczciwe, ale ZASTĄPIŁOBY pomiar
     tabelą; to decyzja produktowa, nie techniczna.

     ⚠️ ZMIERZONA ROZBIEŻNOŚĆ, KTÓREJ NIE NAPRAWIAMY BEZ DECYZJI: strefa T nie
     odpowiada „godzinie wysiłku" i rozjeżdża się z nią tym mocniej, im wolniejszy
     zawodnik (prawdziwy próg 1 h liczony z Riegla vs tempo, które zadaje silnik):
         5 km 15:24 → 3:20 vs 3:32   (+12 s/km)
         5 km 25:20 → 5:19 vs 5:49   (+29 s/km)
         5 km 35:00 → 7:13 vs 8:02   (+49 s/km)
         5 km 45:00 → 9:09 vs 10:19  (+70 s/km)
     Silnik zadaje próg WOLNIEJSZY niż godzinny — zgodnie z biblioteką, w której
     jednostki tempowe są prowadzone zachowawczo. Przyjęcie definicji godzinnej
     przyspieszyłoby każdy trening progowy o 12–70 s/km wbrew temu pomiarowi. */
  /* ⚠️ OKNO BEZ KOSZTU — 17.08.2026. Ta zmiana modelu stref (addytywny → Daniels)
     przesuwa KAŻDE tempo o 22–28 s/km. Zmierzone tego dnia na produkcji:
         training_plans source='self'          →  0
         z tego aktywnych dziś                 →  0
         training_plan_workouts z generatora   →  0
         trainings bez trenera, zaplanowane    →  0
     ZERO AKTYWNYCH PLANÓW Z GENERATORA, więc zmiana temp nie dotknęła nikogo
     i można ją było wprowadzić bez migracji ani ostrzeżenia w interfejsie.

     ⚠️ TO SIĘ ZMIENI. Tempa są MATERIALIZOWANE przy zapisie (trainings.pace
     i training_plan_workouts.target_pace jako tekst), więc istniejące plany
     pokazują wartości z dnia wygenerowania — nie przeliczają się. Przy kolejnej
     zmianie stref, gdy plany już będą istniały, trzeba postąpić inaczej:
     albo przeliczyć zapisane wiersze migracją, albo zostawić stare plany
     nietknięte i powiedzieć wprost w podglądzie, że tempa pochodzą sprzed zmiany.
     Milczące rozjechanie się kalendarza z silnikiem byłoby najgorszym wyjściem. */
  /* ── STREFY WG DANIELSA (VDOT) ─────────────────────────────────────────────
     ŹRÓDŁO: Jack Daniels & Jimmy Gilbert, „Oxygen Power" (1979) i kolejne wydania
     „Daniels' Running Formula". Dwa opublikowane równania:

       koszt tlenowy biegu:   VO2 = -4,60 + 0,182258·v + 0,000104·v²   (v w m/min)
       ułamek VO2max przy
       wysiłku t minut:       %VO2max = 0,8 + 0,1894393·e^(-0,012778·t)
                                            + 0,2989558·e^(-0,1932605·t)

     VDOT = VO2(tempo startowe) / %VO2max(czas startu). Tempo strefy wyznacza się
     odwrotnie: z VDOT × udział strefy liczymy VO2, a z niego prędkość (pierwiastek
     równania kwadratowego).

     ⚠️ PRÓG TO Z DEFINICJI WYSIŁEK GODZINNY — nie osobna liczba, tylko
     %VO2max(60 min) = 88,8%. Dwa polecenia („próg jako czas 60 min" i „tabela
     Danielsa") to w tym modelu jedno i to samo, i dlatego UDZIALY.T liczy się
     wzorem, a nie jest wpisany.

     ⚠️ WERYFIKACJA — NIE Z PAMIĘCI. Udziały sprawdzone wobec opublikowanej tabeli
     dla VDOT 60 (fellrnr.com/wiki/VDOT_Results?Vdot=60&Metric=true), odtworzenie
     co do sekundy:
         M 3:52 = 3:52 · T 3:39 = 3:39 · I 3:22 = 3:22 · R 3:07 = 3:07
         E 4:25 mieści się w podanym zakresie 4:14–4:48
     Kontrola odwrotna: dziesiątka 35:18 → VDOT 60,13 (tabela: 60).

     ⚠️ CO TO ZASTĄPIŁO: dotychczasowe STREFY (E +95, Reg +120, T +30, I +5) były
     zmierzone na 489 treningach z biblioteki Filipa i Kasi. Tabela Danielsa jest
     standardem publikowanym, ale KALIBROWANYM NA INNEJ POPULACJI — to była
     świadoma decyzja produktowa, nie poprawka techniczna. STREFY zostają w pliku,
     bo nadal opisują, jak te treningi były realnie prowadzone. */
  var DANIELS_A = 0.000104, DANIELS_B = 0.182258, DANIELS_C = -4.60;
  function danielsVO2(v) { return DANIELS_C + DANIELS_B * v + DANIELS_A * v * v; }
  function danielsPctVO2(minuty) {
    return 0.8 + 0.1894393 * Math.exp(-0.012778 * minuty)
               + 0.2989558 * Math.exp(-0.1932605 * minuty);
  }
  function danielsPredkosc(vo2) {   // odwrócenie kosztu tlenowego, dodatni pierwiastek
    return (-DANIELS_B + Math.sqrt(DANIELS_B * DANIELS_B - 4 * DANIELS_A * (DANIELS_C - vo2))) / (2 * DANIELS_A);
  }
  var MINUT_PROGU = 60;             // definicja progu: wysiłek godzinny
  var UDZIALY = {
    Reg: 0.630,                     // dolny kraniec strefy E Danielsa (59–74%)
    E:   0.700,                     // środek strefy E
    M:   0.825,                     // tempo maratońskie
    T:   danielsPctVO2(MINUT_PROGU),// 88,8% — próg = godzina wysiłku
    I:   0.978,                     // interwały ~VO2max
    R:   1.077                      // rytmy
  };
  function vdotZP10(p10sec) {
    var v = 60000 / p10sec;                 // m/min na dziesiątce
    return danielsVO2(v) / danielsPctVO2(p10sec * 10 / 60);
  }
  function tempoStrefy(p10sec, strefa) {
    var t = 60000 / danielsPredkosc(vdotZP10(p10sec) * UDZIALY[strefa]);
    /* Podłoga marszu — żadna jednostka nie może być wolniejsza od chodu.
       Dotyczy wyłącznie stref wolnych; T i I nigdy się o nią nie ocierają. */
    return t > TEMPO_MARSZU ? TEMPO_MARSZU : t;
  }

  // ── ŚCIANA ─────────────────────────────────────────────────────────────────
  function odmowa(kod, komunikat, szczegoly) {
    return { ok: false, sciana: { kod: kod, komunikat: komunikat, szczegoly: szczegoly || {} } };
  }

  function sprawdzSciane(we) {
    var d = DYSTANSE[we && we.dystans];
    if (!d) return odmowa('NIEZNANY_DYSTANS', 'Nie znam tego dystansu.', { podano: we && we.dystans });

    if (!poprawnaData(we.today)) return odmowa('ZLA_DATA', 'Brak poprawnej daty odniesienia.', { today: we.today });
    if (!poprawnaData(we.dataStartu)) return odmowa('ZLA_DATA', 'Brak poprawnej daty startu.', { dataStartu: we.dataStartu });

    var dni = we.dniWTygodniu;
    if (!(dni >= MIN_DNI && dni <= MAX_DNI) || dni !== Math.floor(dni)) {
      return odmowa('ZLE_DNI', 'Plan układamy na 3 do 6 dni w tygodniu.', { podano: dni });
    }

    var idxToday = dzienIdx(we.today), idxStart = dzienIdx(we.dataStartu);
    if (idxStart <= idxToday) {
      return odmowa('START_W_PRZESZLOSCI', 'Data startu już minęła.', { today: we.today, dataStartu: we.dataStartu });
    }

    // Maraton na trzech jednostkach — nie ma jak rozłożyć długiego i jakości.
    if (we.dystans === 'marathon' && dni < MARATON_MIN_DNI) {
      return odmowa('MARATON_PRZY_3_DNIACH',
        'Na maraton potrzebujesz co najmniej 4 dni biegania w tygodniu. Przy trzech nie ma gdzie zmieścić długiego wybiegania i jednostki jakościowej naraz.',
        { dniPodane: dni, dniWymagane: MARATON_MIN_DNI });
    }

    // Ile pełnych tygodni zostało (plan startuje w najbliższy poniedziałek)
    var idxPn = najblizszyPoniedzialek(idxToday);
    var tygodnie = Math.floor((idxStart - idxPn) / 7) + 1;
    if (tygodnie < d.minTygodni) {
      var zamiast = najdluzszyMieszczacySie(tygodnie, idxStart);
      return odmowa('ZA_MALO_TYGODNI',
        'Do startu zostało ' + tygodnie + ' ' + (tygodnie === 1 ? 'tydzień' : 'tyg.') + ', a na ' +
        d.etykieta.toLowerCase() + ' potrzeba minimum ' + d.minTygodni + '. ' + wyjscie(d, zamiast, tygodnie),
        { tygodnieDostepne: tygodnie, tygodnieWymagane: d.minTygodni, dystans: we.dystans,
          alternatywnyDystans: zamiast });
    }

    /* ── COFNIĘCIE DO ZAWODÓW ──────────────────────────────────────────────
       Powyżej MAX_TYGODNI plan nie jest krótszy „od końca", tylko ZACZYNA SIĘ
       PÓŹNIEJ. Kotwicą jest data startu, nie dzisiejszy poniedziałek — plan ma
       kończyć się na zawodach, bo to jedyny punkt, względem którego taper,
       szczyt i wybieganie cokolwiek znaczą.

       ⚠️ PRZESUWAMY O WIELOKROTNOŚĆ 7 DNI, więc `idxPn` zostaje poniedziałkiem.
       Cała reszta silnika liczy tygodnie od `idxPn` (`uloz` → `idxStartuPlanu`),
       więc to jest JEDYNE miejsce, które musi o tym wiedzieć.

       ⚠️ `budowa` i `taperTyg` liczą się NIŻEJ, z już przyciętego `tygodnie` —
       gdyby ta linia trafiła za nie, plan miałby taper policzony dla horyzontu,
       którego nie obejmuje. */
    var przesunieteTyg = 0;
    if (tygodnie > MAX_TYGODNI) {
      przesunieteTyg = tygodnie - MAX_TYGODNI;
      idxPn += przesunieteTyg * 7;
      tygodnie = MAX_TYGODNI;
    }

    // Poziom wyjściowy — bez kotwicy NIE zgadujemy tempa.
    var poziom = we.poziom || {};
    var p10 = poziom.p10sec;
    /* Kotwicą jest PB NAJBLIŻSZE CELOWI, nie zawsze piątka i nie zawsze pierwsze
       z brzegu. `poziom.wyniki` (tablica) ma pierwszeństwo; `poziom.wynik`
       (pojedynczy) zostaje dla zgodności ze starymi wywołaniami. */
    var kandydaci = (poziom.wyniki && poziom.wyniki.length) ? poziom.wyniki
                  : (poziom.wynik ? [poziom.wynik] : []);
    var kotwica = kandydaci.length ? najblizszyWynik(kandydaci, d.km) : null;
    if (p10 == null && kotwica) {
      p10 = p10ZWyniku(kotwica.dystans_km, kotwica.czas_s);
    }
    if (!(p10 > 0)) {
      return odmowa('BRAK_POZIOMU',
        'Nie mam z czego policzyć Twoich temp. Podaj jeden wynik z zawodów albo z treningu — dystans i czas.',
        {});
    }
    if (p10 < 150 || p10 > 600) {
      return odmowa('POZIOM_POZA_SKALA',
        'Policzone tempo (' + fmtTempo(p10) + '/km na 10 km) wygląda na błąd w danych.',
        { p10sec: Math.round(p10) });
    }

    /* ── CEL CZASOWY ──────────────────────────────────────────────────────────
       Kolejność trzech kroków jest istotna i nie wolno jej zamienić:

       1. SANITY — czy ta liczba w ogóle jest czasem biegu. Musi być PRZED ścianą,
          bo dwa komunikaty niosą co innego: sanity mówi „pomyliłeś się", ściana
          mówi „cel jest za ambitny". Przy 2:00 w maratonie trafniejsze jest
          pierwsze — inaczej człowiek dostaje wykład o ambicji zamiast informacji
          o literówce.
       2. ŚCIANA — porównanie z prognozą z HISTORII, nie z celem. Odwrotnie cel
          weryfikowałby sam siebie.
       3. PODMIANA — dopiero po przejściu obu tempa liczą się z celu. Bez tego
          plan miał cel w nagłówku i tempa z przeszłości. */
    var p10Formy = p10;
    if (we.celCzasowy != null) {
      if (!(we.celCzasowy > 0)) return odmowa('ZLY_CEL', 'Cel czasowy musi być liczbą sekund.', { celCzasowy: we.celCzasowy });

      /* Sanity PER DYSTANS. Wcześniej był jeden uniwersalny zakres 2:30–12:00/km
         liczony po P10 — i przez to bezużyteczny: cel 10 km w 28:00 dawał P10
         2:48/km, mieścił się w zakresie i przechodził, mimo że to 4 minuty od
         rekordu świata. 2:30/km jest jednocześnie absurdem na 5 km i wolniejsze
         od rekordu maratonu, więc jedna liczba nie może obsłużyć obu końców.

         minCzas = rekord świata (męski) × 0,95, zaokrąglony w dół. Rekordy
         zweryfikowane 11/8/2026, NIE przepisane z pamięci:
           5 km    12:35,36  Cheptegei 2020 (5000 m tor)   → próg 12:00
           10 km   26:11,00  Cheptegei 2020 (10 000 m tor) → próg 25:00
           półm.      57:20  Kiplimo, Lizbona 2026         → próg 54:00
           maraton  1:59:30  Sawe, Londyn 26.04.2026       → próg 1:53:00
         Rekordy TOROWE dla 5 i 10 km są szybsze od szosowych (12:51 / 26:24),
         więc próg z nich nie odetnie nikogo prawdziwego.
         ⚠️ Rekordy się poprawiają — przy aktualizacji przeliczyć progi. */
      /* ⚠️ KOLEJNOŚĆ: ŚCIANA PRZED SANITY. Do tego bloku wchodzi się wyłącznie
         z istniejącym P10 — BRAK_POZIOMU stoi wyżej i wcześniej odrzuca każdego
         bez historii. Skoro historia ZAWSZE jest, to ściana ma lepszy punkt
         odniesienia: mówi „realny cel na ten start: 31:28" z JEGO danych,
         zamiast „szybciej niż rekord świata (26:11)" z tabeli, która o nim
         nic nie wie. Sanity zostaje ZA ścianą, jako backstop na to, co ściana
         przepuściła. Odwrócenie tej kolejności psuje komunikat. */

      var prognoza = prognozaCzasu(p10Formy, d.km);
      var poprawa = (prognoza - we.celCzasowy) / prognoza;
      var limitPoprawy = maxPoprawaDla(tygodnie);
      if (poprawa > limitPoprawy) {
        var celRealny = prognoza * (1 - limitPoprawy);
        var przySuficie = limitPoprawy >= MAX_POPRAWA_SUFIT - 1e-9;
        /* ⚠️ Najważniejszy komunikat w całym generatorze. Człowiek przychodzi
           z marzeniem i ma wyjść z LICZBĄ, nie z odmową.
           ⚠️ ZDANIE O SEZONACH USUNIĘTE. Brzmiało „potrzebujesz kilku sezonów,
           nie N tygodni" i przy N = 113 samo sobie przeczyło — 113 tygodni TO SĄ
           dwa sezony. Teraz komunikat rozróżnia DWA różne powody odmowy:
             • za mało tygodni  → mówi, ile czasu by wystarczyło,
             • sufit 15%        → mówi, że sam czas już nie wystarczy.
           To są inne sytuacje i człowiek ma z nich wyjść z inną decyzją. */
        /* ── PRZYPADEK BRZEGOWY: „za duży skok" o dwadzieścia sekund ────────
           ⚠️ ZGŁOSZENIE MAĆKA, 23.08.2026. Prognoza 2:21:35, cel 2:00:00,
           realny cel 2:00:20 — a pierwsze zdanie mówiło „2:00:00 to za duży
           skok". Dwadzieścia sekund nie jest za dużym skokiem i człowiek, który
           to czyta, ma prawo uznać komunikat za bzdurę. Kod WIEDZIAŁ, że jest
           na brzegu (`przySuficie`, poprawa 15,2% przy limicie 15%) i nie
           używał tej wiedzy w zdaniu, które człowiek czyta pierwsze.

           ⚠️ PRÓG 1 PKT PROC. NIE JEST Z SUFITU — jest mniejszy od niepewności
           samej prognozy. Zmierzone: nasz wykładnik Riegela to 1,06, a na
           własnych danych wychodzi 1,091 (zaległość „indywidualny wykładnik").
           Dla dziesiątki Maćka daje to prognozę półmaratonu 2:21:35 albo
           2:24:54 — różnica 199 s, czyli 2,3% prognozy. Skoro sama prognoza ma
           2,3% luzu, to spór o 1% jest sporem o szum, a nie o formę.

           ⚠️ NIE RUSZAM SUFITU — odmowa zostaje, zmienia się tylko pierwsze
           zdanie. Cel dalej jest poza regułą; człowiek ma tylko wiedzieć, że
           chodzi o dwadzieścia sekund, a nie o przepaść. */
        var brakujeCzasu = Math.round(celRealny) - we.celCzasowy;
        var naBrzegu = (poprawa - limitPoprawy) <= PROG_BRZEGU_CELU && brakujeCzasu > 0;
        var tyle = naBrzegu
          ? 'Do ' + fmtCzas(we.celCzasowy) + ' brakuje ' + fmtOdstep(brakujeCzasu) +
            '. Najszybszy cel, jaki ułożę na ten start, to ' + fmtCzas(celRealny) + '.'
          : 'Przy Twojej obecnej formie ' + fmtCzas(we.celCzasowy) + ' to za duży skok. ' +
            'Realny cel na ten start: ' + fmtCzas(celRealny) + '.';
        if (przySuficie) {
          /* ⚠️ JEDNA ŚCIEŻKA, NIE MENU — decyzja Filipa z 18.08.2026 i jest słuszna.
             Pierwsza wersja rozbijała to na cel pośredni („1:48 za 40 tygodni")
             plus cel odległy, przez co człowiek po odmowie musiał WYBIERAĆ
             zamiast zrobić jedną rzecz. Trzy liczby to granica czytelności na
             telefonie: obecna forma, realny cel teraz, perspektywa. Tyle.
             ⚠️ Perspektywa mówi „konsekwentnej pracy", nie podaje daty — bo
             tego nie wiemy. Etapów pośrednich świadomie NIE liczymy. */
          var cykli = Math.ceil(Math.log(we.celCzasowy / prognoza) / Math.log(1 - MAX_POPRAWA_SUFIT));
          var lataOpis = cykli <= 1 ? 'roku' : (cykli < 5 ? cykli + ' lat' : 'kilku lat');
          /* Cel podajemy RAZ. Pierwsza wersja powtarzała go w drugim zdaniu
             („1:30:00 wymaga 26%…") i wychodziły trzy czasy w czterech zdaniach
             — złapał to test liczący czasy w komunikacie. */
          tyle += ' To wymaga ' + Math.round(poprawa * 100) +
                  '% poprawy — realnie ' + lataOpis + ' konsekwentnej pracy, bo postęp ' +
                  'nie przyspiesza liniowo z czasem.';
        } else {
          var potrzebaTyg = Math.ceil(poprawa / POPRAWA_NA_TYDZIEN);
          tyle += ' Na ' + fmtCzas(we.celCzasowy) + ' potrzeba ok. ' + potrzebaTyg +
                  ' tygodni przygotowania, a masz ' + tygodnie + '.';
        }
        return odmowa('CEL_ZA_AMBITNY', tyle,
          { poprawaProc: Math.round(poprawa * 1000) / 10,
            limitProc: Math.round(limitPoprawy * 1000) / 10,
            przySuficie: przySuficie, tygodnie: tygodnie, naBrzegu: naBrzegu,
            brakuje_s: brakujeCzasu > 0 ? brakujeCzasu : null,
            prognoza_s: Math.round(prognoza), celRealny_s: Math.round(celRealny) });
      }

      /* Cel WOLNIEJSZY od formy przechodzi tędy bez progu i bez komentarza:
         poprawa wychodzi ujemna, więc ściana nie odpala. Świadomie — powody
         bywają niewidoczne (powrót po kontuzji, pacerowanie, maraton jako
         jednostka przed ultra), a wolniejsze tempa dadzą spokojniejszy plan.
         O to właśnie chodzi. */

      /* SANITY jako BACKSTOP, już za ścianą. Łapie wyłącznie to, co ściana
         przepuściła — czyli cele mieszczące się w 8% od prognozy zawodnika.
         Skoro prognoza jest sensowna (POZIOM_POZA_SKALA pilnuje P10 z formy),
         to i cel jest sensowny, więc ten próg prawie nigdy nie odpala. Dlatego
         jest LUŹNY: przy istniejącej historii to ściana rozstrzyga. */
      var zleCel = sanityCzasu(we.dystans, we.celCzasowy, 'cel');
      if (zleCel) return odmowa(zleCel.kod, zleCel.komunikat, zleCel.szczegoly);

      p10 = p10ZWyniku(d.km, we.celCzasowy);

      /* ⚠️ GRANICA, PRZY KTÓREJ PLAN PRZESTAJE BYĆ PLANEM BIEGOWYM.
         Sanity wyżej pyta, czy CEL jest sensownym czasem. To pyta o co innego:
         czy z tego celu da się policzyć tempa, którymi da się BIEC.

         Zmierzone: cel 5 km w 60:00 przechodzi sanity (720 s/km to dokładnie
         tempo marszu, więc mieści się w progu), ale wyprowadzone strefy to
         I 12:36, T 13:01, E 14:06, Reg 14:31 — NAJSZYBSZA jednostka planu jest
         wolniejsza od marszu. Taki plan każe człowiekowi „biec interwały"
         w tempie, w którym się idzie. Dla porównania 5 km w 50:00 daje E równe
         marszowi i jeszcze przechodzi, a maraton w 7:00:00 (I 9:13) jest zupełnie
         w porządku — próg dotyczy absurdu, nie wolnego biegania.

         Mierzymy strefę I, bo jest najszybsza: jeśli ONA jest wolniejsza od
         marszu, to wszystkie pozostałe też. Odmowa niesie wyjście: pole celu
         jest opcjonalne, więc zawsze można je zostawić puste. */
      if (tempoStrefy(p10, 'I') > TEMPO_MARSZU) {
        return odmowa('CEL_WOLNIEJSZY_NIZ_MARSZ',
          fmtCzas(we.celCzasowy) + ' na ' + d.etykieta.toLowerCase() + ' daje tempa wolniejsze niż marsz — ' +
          'nawet najszybsza jednostka wychodzi ' + fmtTempo(tempoStrefy(p10, 'I')) + '/km przy tempie marszu ' +
          fmtTempo(TEMPO_MARSZU) + '/km. Tego nie da się przebiec, bo to nie jest bieganie. ' +
          'Podaj czas, który zamierzasz przebiec, albo zostaw cel pusty — policzę tempa z Twoich treningów.',
          { cel_s: we.celCzasowy, tempoI_s: Math.round(tempoStrefy(p10, 'I')),
            tempoMarszu_s: TEMPO_MARSZU, dystans: we.dystans });
      }
    }

    // Objętość — ile trzeba dołożyć i czy da się to zrobić w tempie ≤8%/tydz.
    var obecna = poziom.objetoscTygodniowa;
    var zalozonaObjetosc = false;
    if (!(obecna > 0)) { obecna = OBJETOSC_DOMYSLNA; zalozonaObjetosc = true; }

    // Niepełny tydzień startowy (start inny niż niedziela) NIE liczy się jako tydzień
    // taperu — inaczej przy starcie w poniedziałek ostatni PEŁNY tydzień przed
    // zawodami dostawał najlżejszy schodek i taper de facto trwał tydzień zamiast dwóch.
    var startWNiedziele = dzienTygodnia(idxStart) === 0;
    /* Podłoga taperu dla długich dystansów. Dziś NIC NIE ZMIENIA (half ma 2,
       maraton 3 — sprawdzone przemiotem 200 dat startu), ale zapisuje regułę
       wprost zamiast zostawiać ją jako emergentną własność tabeli DYSTANSE.
       Gdyby ktoś kiedyś zmienił `taper` w tabeli, ta linia nie da zejść poniżej
       dwóch tygodni tam, gdzie dwa tygodnie to metodyczne minimum. */
    var taperTyg = d.taper + (startWNiedziele ? 0 : 1);
    if (d.km >= DYSTANSE.half.km) taperTyg = Math.max(taperTyg, MIN_TAPER_DLUGIE);
    var budowa = Math.max(1, tygodnie - taperTyg);

    /* ⚠️ TAPER ZJADAŁ PLAN — ale winna była DŁUGOŚĆ PLANU, nie długość taperu.
       Zmierzone: piątka na 4 tygodnie ze startem w poniedziałek dostawała
       taper 2/4 = 50% planu, czyli DWA tygodnie budowania. Przy 5 tygodniach 40%.
       (Wbrew zgłoszeniu plany 8-tygodniowe są zdrowe: 1–2 tyg taperu = 13–25%.)

       Kuszące jest przyciąć taper, ale to błąd: te dwa tygodnie są policzone
       poprawnie. `+1` przy starcie poza niedzielą istnieje dlatego, że tydzień
       z zawodami w poniedziałek to JEDEN DZIEŃ — bez niego ostatni PEŁNY tydzień
       przed startem zostawał na szczycie objętości. Skrócenie taperu przywróciłoby
       dokładnie ten błąd.

       Więc bramka idzie na to, co naprawdę jest za małe: liczbę tygodni BUDOWANIA.
       Plan, w którym buduje się krócej niż MIN_TYG_BUDOWY, nie jest planem —
       jest taperem z rozbiegiem. Odmowa niesie konkretną datę do cofnięcia. */
    if (budowa < MIN_TYG_BUDOWY) {
      return odmowa('ZA_MALO_TYGODNI',
        'Do startu zostało ' + tygodnie + ' ' + (tygodnie === 1 ? 'tydzień' : 'tyg.') + ', z czego ' + taperTyg +
        ' na wyciszenie przed zawodami — zostają ' + budowa + ' na budowanie. Potrzebuję co najmniej ' +
        MIN_TYG_BUDOWY + ', czyli w sumie ' + (MIN_TYG_BUDOWY + taperTyg) + ' tyg. ' +
        wyjscie(d, najdluzszyMieszczacySie(tygodnie, idxStart), tygodnie),
        { tygodnieDostepne: tygodnie, tygodnieWymagane: MIN_TYG_BUDOWY + taperTyg,
          taperTygodni: taperTyg, budowaTygodni: budowa, dystans: we.dystans,
          alternatywnyDystans: najdluzszyMieszczacySie(tygodnie, idxStart) });
    }

    /* TRZY REŻIMY OBJĘTOŚCI — o tym, czy plan ma rosnąć czy falować, decyduje to,
       gdzie baza zawodnika leży wobec progów dystansu:
         obecna <  minSzczyt  → 'progresja'  — jest po co rosnąć, cel to sufit dystansu
         minSzczyt ≤ obecna < peakKm → 'mieszany' — rośnie do peakKm, potem cykl 3:1
         obecna ≥  peakKm     → 'fala'       — nie ma dokąd rosnąć, więc kształt
                                               wokół istniejącej formy (90% → 110%)
       Bez tego podziału fala ZASTĘPOWAŁABY progresję: zawodnik na 25 km/tydz przed
       półmaratonem ma rosnąć, a nie falować wokół 25. */
    var peak, startTyg, rezim;
    if (obecna >= d.peakKm) {
      rezim = 'fala';
      peak = obecna * SZCZYT_NAD_BAZA;
      startTyg = obecna * START_POD_BAZA;
    } else {
      rezim = (obecna < d.minSzczyt) ? 'progresja' : 'mieszany';
      /* ⚠️ TRZECI SKŁADNIK min() DOSZEDŁ 24.08.2026 I BEZ NIEGO ZMIANA MNOŻNIKA
         JEST REGRESJĄ. Zmierzone: maraton, 16 tygodni, baza 40 — stary mnożnik
         dawał szczyt 64 (przyrost 3,68%/tydz, przechodzi), nowy dawał 70
         (4,40%/tydz) i wpadał w SKOK_OBJETOSCI, czyli człowiek, który wczoraj
         dostawał plan, dziś dostawałby odmowę.

         Powód jest w PRZYROST_WG_BAZY, nie w mnożniku: pasma to [20,40) → 6%
         i [40,70) → 4%, więc baza 39 ma limit 6%, a baza 40 już 4%. Ta
         nieciągłość istniała przed zmianą — podniesienie szczytu tylko ją
         odsłoniło. Przy 1,6 nikt o nią nie zahaczał, bo szczyt był niżej.

         Reguła: NIE PROPONUJEMY SZCZYTU, KTÓREGO WŁASNA REGUŁA PRZYROSTU
         ZABRANIA DOJŚĆ. `maxPrzyrostDla(obecna)^budowa` to dokładnie ta sama
         liczba, którą chwilę niżej sprawdza SKOK_OBJETOSCI — więc obie strony
         liczą z jednego wzoru i bramka nie może odrzucić szczytu, który sama
         wyznaczyła. SKOK_OBJETOSCI zostaje i nadal łapie to, po co powstał:
         przypadki, w których nawet obniżony szczyt nie mieści się w czasie
         (bo `peak` ma jeszcze podłogę minSzczyt po stronie ZA_MALA_BAZA). */
      var osiagalnyPeak = obecna * Math.pow(1 + maxPrzyrostDla(obecna), budowa);
      /* ⚠️ `Math.max(..., obecna * MNOZNIK_SZCZYTU)` NIE JEST OZDOBNIKIEM —
         bez niego ta linia KASUJE CAŁĄ ŚCIANĘ SKOK_OBJETOSCI. Miałem tę wersję
         napisaną i złapał ją test blizny 11. Rachunek: jeśli peak ≤ obecna ×
         (1+limit)^budowa, to (peak/obecna)^(1/budowa) − 1 ≤ limit ZAWSZE, więc
         warunek `przyrost > limit` nie może być nigdy prawdziwy. Ściana
         wyglądałaby na żywą, miała testy i komunikat z wyjściem, a nie dałoby
         się jej wywołać żadnym wejściem.

         Dlatego tłumimy WYŁĄCZNIE BONUS ZA HORYZONT, nigdy bazowe 1,6. Dzięki
         temu zachowanie sprzed 24.08.2026 zostaje bit w bit — z odmowami
         włącznie — a nowy mnożnik nie może nikomu odebrać planu, który
         wcześniej dostawał. Zmierzone na obu przypadkach:
           baza 40, maraton, 16 tyg. → osiągalny 66,6 > stary 64,0 → peak 66,6,
                                        przyrost 4,00% = limit → PLAN (była regresja)
           baza 25, half,   10 tyg. → osiągalny 37,6 < stary 40,0 → peak 40,0,
                                        przyrost 6,94% > 6% → SKOK_OBJETOSCI (blizna 11 żyje) */
      peak = Math.min(d.peakKm, obecna * mnoznikSzczytu(tygodnie),
                      Math.max(osiagalnyPeak, obecna * MNOZNIK_SZCZYTU));
      /* ── SZCZYT MUSI ROSNĄĆ Z BAZĄ, ZAWSZE ──────────────────────────────
         ⚠️ TO NIE JEST KALIBRACJA, TYLKO CIĄGŁOŚĆ. `peakKm` jest stałą, więc
         powyżej pewnej bazy `min()` przestaje zależeć od zawodnika i szczyt
         zamiera na sufit dystansu — a tuż obok, po przekroczeniu `peakKm`,
         reżim „fala" daje 1,10 × baza, czyli WIĘCEJ. Zmierzone 25.08.2026:
             maraton    baza 69 → 70,0 (1,014×) mieszany
                        baza 70 → 77,0 (1,100×) fala
             półmaraton baza 54 → 55,0 (1,019×) mieszany
                        baza 55 → 60,5 (1,100×) fala
         Jeden kilometr bazy więcej dawał siedem kilometrów szczytu więcej,
         a człowiek tuż POD progiem dostawał gorszy plan niż ten tuż NAD nim —
         mimo że `fala` jest z założenia planem podtrzymania. Dwie realne osoby
         siedziały w tej dziurze (bazy 54 i 67,3).

         Podłoga jest DOKŁADNIE tym, co dałaby fala przy tej samej bazie, więc
         w punkcie `obecna === peakKm` obie gałęzie dają tę samą liczbę i funkcja
         jest ciągła. Zero nowych stałych — SZCZYT_NAD_BAZA już tu jest.

         ⚠️ ŚWIADOMIE PRZEBIJA `d.peakKm`. Sufit dystansu i tak nie obowiązuje
         powyżej progu (fala go przekracza od zawsze — patrz „podłoga na obecnej
         objętości"), więc trzymanie go pod progiem tworzyło wyłącznie urwisko.
         Sam `peakKm` zostaje osądem do przeliczenia — to osobna zaległość. */
      peak = Math.max(peak, obecna * SZCZYT_NAD_BAZA);
      startTyg = obecna;
    }

    /* ZA_MALA_BAZA — jedyna odmowa, którą człowiek może sam naprawić, więc niesie
       konkretną liczbę do osiągnięcia. Sufit obecna×mnożnik obniża szczyt, a niższy
       szczyt jest łatwiej osiągalny — bez tej bramki ściana narastania przestawała
       się odzywać dokładnie dla maratonu i półmaratonu.

       ⚠️ MNOŻNIK MUSI BYĆ TU TEN SAM, CO PRZY LICZENIU `peak` — z tym samym
       `tygodnie`. Gdyby bramka została na stałym 1,6, odrzucałaby bazy, dla
       których szczyt policzony linijkę wyżej jest już osiągalny; komunikat
       podawałby wtedy próg, którego silnik sam od siebie nie wymaga. */
    if (obecna * mnoznikSzczytu(tygodnie) < d.minSzczyt) {
      var wymBaza = Math.ceil(d.minSzczyt / mnoznikSzczytu(tygodnie));
      /* ⚠️ NAJWIĘKSZA STRATA STAREGO KOMUNIKATU NIE BYŁA BRAKIEM ŚCIEŻKI.
         Brzmiał „zbuduj bazę do ~35 km/tydz" — prawda o maratonie, która CHOWA
         to, że przy 12 km/tydz do pierwszego planu (piątka) brakuje pół
         kilometra tygodniowo. Zmierzone progi 18.08.2026: 5 km od 12,5 km/tydz,
         10 km od 16, półmaraton od 20,5, maraton od 36,5. Człowiek odchodził
         od ekranu z liczbą 35, mając 12 — zamiast z jednym dodatkowym biegiem. */
      var blizej = najblizszyOsiagalny(we, d);
      var doCelu = tygodniDoBazy(obecna, wymBaza);
      var kiedyCel = mgliscieTygodnie(doCelu + d.minTygodni, idxToday);
      var sciezka = blizej
        ? ' Najbliżej masz ' + DYSTANSE[blizej].etykieta.toLowerCase() +
          ' — plan na ten dystans powstanie od razu. ' + d.etykieta +
          ' realnie ' + kiedyCel + '.'
        : (function () {
            /* Nic nie przechodzi DZIŚ — więc mówimy, ile brakuje do pierwszego
               planu w ogóle. To jedna liczba i jest mała; „35 km/tydz" było
               prawdziwe, ale odbierało nadzieję na rok. */
            var prog = bazaDlaDystansu(we, '5k');
            if (!(prog > obecna)) return ' ' + d.etykieta + ' realnie ' + kiedyCel + '.';
            var brak = Math.round((prog - obecna) * 10) / 10;
            return ' Do pierwszego planu — na 5 km — brakuje Ci ' + brak +
                   ' km tygodniowo, czyli ' + mgliscieTygodnie(tygodniDoBazy(obecna, prog), idxToday) +
                   ' spokojnego biegania. ' + d.etykieta + ' realnie ' + kiedyCel + '.';
          })();
      return odmowa('ZA_MALA_BAZA',
        'Przy ' + Math.round(obecna) + ' km/tydz ' + d.etykieta.toLowerCase() + ' wymagałby dojścia do ' + d.minSzczyt +
        ' km/tydz, czyli ' + (Math.round(d.minSzczyt / obecna * 10) / 10) + '× więcej niż biegasz teraz.' + sciezka,
        { obecna_km: Math.round(obecna), minSzczyt_km: d.minSzczyt, wymaganaBaza_km: wymBaza,
          objetoscZalozona: zalozonaObjetosc, dystans: we.dystans,
          sciezkaDystans: blizej, sciezkaTygodni: doCelu + d.minTygodni });
    }

    // Baza porównania to OBECNA objętość, nie obniżony start pierwszego tygodnia.
    // W trybie kształtu plan schodzi do 90% i wraca do 110% tego, co zawodnik już
    // biega — to fala wokół istniejącej formy, a nie wzrost obciążenia, więc liczenie
    // przyrostu od 90% sztucznie zawyżałoby tempo narastania i odbijało zdrowe plany.
    /* ⚠️ SUFIT STOPNIOWANY PO BAZIE — DECYZJA FILIPA Z 17.08, PODJĘTA ZE ZNAJOMOŚCIĄ KOSZTU.
       Koszt jest realny i zmierzony: próg 6% dla pasma 20–40 km odrzuca plany,
       które wcześniej powstawały, m.in. NAJCZĘSTSZY przypadek w bazie —
       półmaraton przy 25 km/tydz na 10 tygodni wymaga 6,9%/tydz.
       ⚠️ Przeczy to naszym własnym danym: p90 w tym paśmie to 9,3%, czyli ludzie
       realnie utrzymują więcej, niż ten próg przepuszcza. Liczby 8/6/4/3 są
       interpretacją reguły 10%, nie pomiarem — patrz PRZYROST_WG_BAZY.
       Skutek dla użytkownika: więcej odmów SKOK_OBJETOSCI, za to każda niesie
       konkretną liczbę tygodni do dołożenia. */
    var limitPrzyrostu = maxPrzyrostDla(obecna);
    if (peak > obecna) {
      var przyrost = Math.pow(peak / obecna, 1 / budowa) - 1;
      /* ⚠️ TOLERANCJA JEST TU KONIECZNA, NIE KOSMETYCZNA — i pilnuje jej test.
         Od 24.08.2026 `peak` bywa USTAWIONY DOKŁADNIE na tym limicie (patrz
         `osiagalnyPeak` wyżej), a wtedy odwrotność potęgi nie wraca do tej samej
         liczby: dla bazy 21, 9 tygodni budowy i limitu 6% wychodzi
         0,06000000000000005 — większe od 0,06 o 5,6e-17. Bez tolerancji bramka
         odrzucała szczyt, który sama przed chwilą wyznaczyła jako osiągalny;
         zmierzone na 16 przypadkach (m.in. półmaraton, baza 21–26, 12 tygodni).
         „Równo na limicie" ma przechodzić — o tym decyduje reguła, nie błąd
         zaokrąglenia liczby zmiennoprzecinkowej. */
      if (przyrost > limitPrzyrostu + 1e-9) {
        /* ⚠️ TA ŚCIANA BYŁA JEDYNĄ Z PIĘCIU BEZ WYJŚCIA — mówiła „za duży skok"
           i kończyła. Komentarz wyżej twierdził nawet, że „każda niesie konkretną
           liczbę tygodni do dołożenia", a komunikat jej nie zawierał; kod
           i komentarz rozjeżdżały się od 17.08.2026.
           Człowiek, który to czyta, ma opłacony start i datę. Musi wyjść z tego
           ekranu z liczbą: ile tygodni by wystarczyło ALBO jaki dystans mieści
           się w jego dzisiejszej objętości. */
        var budowaPotrzebna = Math.ceil(Math.log(peak / obecna) / Math.log(1 + limitPrzyrostu));
        var tygPotrzebne = budowaPotrzebna + taperTyg;
        // Szczyt, do którego DA SIĘ dojść w dostępnym czasie — i najdłuższy
        // dystans, którego minimum się pod nim mieści.
        var osiagalnySzczyt = obecna * Math.pow(1 + limitPrzyrostu, budowa);
        var lzejszy = null, kol = ['marathon', 'half', '10k', '5k'];
        for (var q = 0; q < kol.length; q++) {
          if (kol[q] === we.dystans) continue;
          if (DYSTANSE[kol[q]].km >= d.km) continue;              // tylko KRÓTSZY niż cel
          if (DYSTANSE[kol[q]].minSzczyt <= osiagalnySzczyt) { lzejszy = kol[q]; break; }
        }
        var drogaWyjscia = lzejszy
          ? ' Przy Twojej objętości w tym czasie mieści się ' + DYSTANSE[lzejszy].etykieta.toLowerCase() +
            ' — albo ten sam dystans przy ' + tygPotrzebne + ' tyg. przygotowania.'
          : ' Na ten dystans potrzeba ok. ' + tygPotrzebne + ' tyg. przygotowania zamiast ' + tygodnie +
            '. Krótszy dystans też nie zmieści się w Twojej dzisiejszej objętości.';
        /* ⚠️ OBIE LICZBY MUSZĄ SIĘ RÓŻNIĆ, INACZEJ ZDANIE JEST BZDURĄ.
           Zaokrąglone do pełnych procentów potrafiły wyjść identyczne:
           „+8% tygodniowo — powyżej bezpiecznych 8%". Zmierzone 25.08.2026:
           22 takie komunikaty przy pasmach schodkowych, 12 po interpolacji —
           czyli to wada STARSZA od interpolacji, tylko przez nią rzadsza.
           Dokładamy miejsce po przecinku dopiero wtedy, gdy jest potrzebne;
           inaczej „+9,0% powyżej 6,0%" byłoby szumem tam, gdzie „+9% powyżej
           6%" czyta się lepiej. To ta sama zasada co przy „brakuje 20 s". */
        var proc = (function () {
          var a = przyrost * 100, b = limitPrzyrostu * 100;
          if (Math.round(a) !== Math.round(b)) return [Math.round(a), Math.round(b)];
          var a1 = Math.round(a * 10) / 10, b1 = Math.round(b * 10) / 10;
          if (a1 !== b1) return [a1, b1];
          return null;                       // różnica poniżej 0,05 pkt proc. — patrz niżej
        })();
        /* ⚠️ TRZECI PRZYPADEK: RÓŻNICA PONIŻEJ 0,05 PKT PROC. Drugie miejsce po
           przecinku byłoby fałszywą precyzją („+6,94% powyżej 6,90%"), a dwie
           identyczne liczby — bzdurą. Zmierzone: 2 przypadki na ~5000
           (półmaraton, bazy 21 i 38, 10 tygodni). Człowiek stoi wtedy DOKŁADNIE
           na granicy i tak mu to mówimy — ta sama zasada co „brakuje 20 s". */
        var zdanieProc = proc
          ? 'W ' + tygodnie + ' tyg. znaczyłoby to +' + proc[0] + '% tygodniowo — powyżej bezpiecznych ' +
            proc[1] + '% przy Twojej objętości.'
          : 'W ' + tygodnie + ' tyg. znaczyłoby to ' + (Math.round(przyrost * 1000) / 10) +
            '% tygodniowo, czyli dokładnie na granicy bezpiecznego przyrostu przy Twojej objętości.';
        return odmowa('SKOK_OBJETOSCI',
          'Biegasz ' + Math.round(obecna) + ' km/tydz, a ' + d.etykieta.toLowerCase() + ' wymaga dojścia do ok. ' + Math.round(peak) +
          ' km/tydz. ' + zdanieProc + drogaWyjscia + ' ' +
          'Jeśli data jest nie do ruszenia, napisz do Filipa albo Kasi — człowiek ułoży to, czego automat nie potrafi.',
          { obecna_km: Math.round(obecna), peak_km: Math.round(peak), tygodnie: tygodnie,
            przyrostProc: Math.round(przyrost * 1000) / 10, limitProc: Math.round(limitPrzyrostu * 1000) / 10,
            tygodniePotrzebne: tygPotrzebne, osiagalnySzczyt_km: Math.round(osiagalnySzczyt),
            alternatywnyDystans: lzejszy, objetoscZalozona: zalozonaObjetosc });
      }
    }

    return { ok: true, kontekst: { d: d, p10: p10, p10Formy: p10Formy, tygodnie: tygodnie, idxPn: idxPn, idxStart: idxStart,
                                   obecna: obecna, peak: peak, startTyg: startTyg, budowa: budowa, rezim: rezim,
                                   taperTyg: taperTyg, startWNiedziele: startWNiedziele,
                                   przesunieteTyg: przesunieteTyg, idxToday: idxToday,
                                   zalozonaObjetosc: zalozonaObjetosc } };
  }

  /* ── ODMOWA MUSI NIEŚĆ WYJŚCIE ─────────────────────────────────────────────
     „Do startu zostało 8 tyg., a na maraton potrzeba 16." — i co dalej?
     Człowiek, który to czyta, NAJPEWNIEJ JEST JUŻ ZAPISANY NA ZAWODY. Nie może
     zmienić celu; opłacił start i ma datę. Rada „wybierz bliższy cel" jest
     wtedy pusta, a odmowa bez wyjścia znaczy, że człowiek nie wraca.

     Dlatego zamiast rady ogólnej podajemy dystans, który NAPRAWDĘ mieści się
     w pozostałym czasie (policzony, nie zgadnięty), i mówimy wprost, że sam
     maraton nadal można przebiec — tylko jako bieg do ukończenia, nie na wynik.
     Trzecia droga to człowiek: są rzeczy, których automat nie ułoży. */
  /* ── ŚCIEŻKA: ODMOWA POLICZONA W PRZÓD ─────────────────────────────────────
     Odmowa mówi „nie da się". Ścieżka mówi „nie da się TEGO, ale da się TO,
     a tamto za tyle". Liczby biorą się z TYCH SAMYCH reguł, które odmawiają —
     `maxPrzyrostDla` (pasma 8/6/4/3%) i sam silnik.

     ⚠️ NAJBLIŻSZY DYSTANS PYTAMY SILNIKA, NIE WZORU. Kuszące było policzyć próg
     z warunku `obecna × MNOZNIK_SZCZYTU < minSzczyt` — i byłoby ŹLE. Zmierzone
     18.08.2026: dla półmaratonu wzór daje 18,75 km/tydz, a realny próg to 20,5,
     bo wyżej odbija ZA_KROTKIE_WYBIEGANIE. Ścieżka policzona ze wzoru wysłałaby
     człowieka prosto w drugą odmowę — a przycisk prowadzący do odmowy jest
     gorszy niż brak przycisku. */
  var _wSciezce = false;
  function najblizszyOsiagalny(we, d) {
    if (_wSciezce) return null;                 // strażnik rekurencji: ścieżka woła uloz()
    _wSciezce = true;
    try {
      var kol = ['marathon', 'half', '10k', '5k'];
      for (var i = 0; i < kol.length; i++) {
        if (DYSTANSE[kol[i]].km >= d.km) continue;          // tylko KRÓTSZE od celu
        var proba = {};
        for (var k in we) if (Object.prototype.hasOwnProperty.call(we, k)) proba[k] = we[k];
        proba.dystans = kol[i];
        proba.celCzasowy = null;                            // cel czasowy nie przenosi się na inny dystans
        var r = uloz(proba);
        if (r && r.ok) return kol[i];
      }
      return null;
    } finally { _wSciezce = false; }
  }

  /* ── UBYTEK FAZY BUDOWY — JEDEN WZÓR DLA PLANU I DLA PRÓBY ────────────────
     ⚠️ MUSI BYĆ WSPÓLNY. Nota mówi „plan zadaje X zamiast Y", a zdanie obok
     mówi „przy N dniach dowiezie pełne Y". Gdyby plan i próba liczyły ubytek
     dwoma wzorami, drugie zdanie obiecywałoby coś, czego pierwsze nie mierzy —
     to ta sama klasa błędu co bramka licząca inaczej niż krzywa (25.08). */
  function ubytekBudowyZ(objetosci, faktyczne, treningi, budowa) {
    var dekl = 0, fakt = 0, jedn = 0, i;
    for (i = 0; i < budowa && i < objetosci.length; i++) {
      if (!(objetosci[i] > 0)) continue;
      dekl += objetosci[i];
      fakt += faktyczne[i];
    }
    for (i = 0; i < treningi.length; i++) {
      if (treningi[i].week_number <= budowa && (treningi[i].target_distance_km || 0) > 0) jedn++;
    }
    return { dekl: dekl, fakt: fakt, ubytek: dekl - fakt, luz: jedn * KROK_KM / 2 };
  }
  function ubytekZWyniku(r) {
    if (!r || !r.ok) return null;
    return ubytekBudowyZ(r.meta.objetosciTygodni, r.meta.objetosciFaktyczne, r.treningi,
                         r.meta.tygodnie - r.meta.taperTygodni);
  }

  /* ── ILE DNI DOMYKA OBJĘTOŚĆ ───────────────────────────────────────────────
     ⚠️ PRZEMIATAMY WSZYSTKIE DNI, NIE INKREMENTUJEMY — i to nie jest ostrożność,
     tylko konieczność. Zmierzone 25.08.2026: funkcja NIE jest monotoniczna.
     Przy bazie 80 (5 km) plan oddaje 3,2% objętości przy 4 dniach, 5,7% przy
     5 dniach i 0,2% przy 6. Rada „dodaj jeden dzień" wysłałaby człowieka
     z czwórki na piątkę i POGORSZYŁA mu plan. Przyczyna: przy `dni >= 5`
     wchodzi druga jednostka jakościowa i dzień regeneracyjny, a slot, który
     przy 4 dniach absorbował resztę, przestaje istnieć.
     Wada jest świadoma i przypięta testem blizny (109 inwersji, do 125 km) —
     patrz zaległość „za mało dni przy wysokiej bazie". Ten komunikat jej NIE
     naprawia; prowadzi wokół niej do faktycznego optimum.

     ⚠️ STRAŻNIK REKURENCJI JEST OSOBNY OD `_wSciezce`, bo obie ścieżki mogą się
     spotkać: próba dni woła `uloz()`, które samo woła `najblizszyOsiagalny`.
     Ustawiamy oba — ścieżki dystansowe w próbie i tak są nam niepotrzebne,
     a ich liczenie kosztowałoby kolejne wywołania silnika. */
  var _wProbieDni = false;
  function dniKtoreDomykaja(we, dniObecne) {
    if (_wProbieDni || _wSciezce) return [];
    _wProbieDni = true; _wSciezce = true;
    try {
      var out = [], d;
      for (d = MIN_DNI; d <= MAX_DNI; d++) {
        if (d === dniObecne) continue;
        var proba = {};
        for (var kk in we) if (Object.prototype.hasOwnProperty.call(we, kk)) proba[kk] = we[kk];
        proba.dniWTygodniu = d;
        var u = ubytekZWyniku(uloz(proba));
        if (u && u.ubytek <= u.luz) out.push(d);
      }
      return out;
    } finally { _wProbieDni = false; _wSciezce = false; }
  }
  /* „4" · „4 albo 6" · „3, 4 albo 6" — ostatni spójnik słowem, nie przecinkiem. */
  function listaDni(dni) {
    if (dni.length === 1) return String(dni[0]);
    return dni.slice(0, -1).join(', ') + ' albo ' + dni[dni.length - 1];
  }

  /* ── DYSTANS, KTÓRY DA SIĘ TRENOWAĆ OD ZARAZ ───────────────────────────────
     Bliźniak `najblizszyOsiagalny`, ale odpowiada na INNE pytanie i dlatego
     nie da się ich scalić.

     `najblizszyOsiagalny` pyta: „co przejdzie w TEJ dacie?". Przy starcie za
     150 tygodni odpowiedź jest bezużyteczna — krótszy dystans w tej samej
     dacie też zostanie cofnięty o 98 tygodni, więc przycisk prowadziłby do
     drugiego odroczenia. To ta sama pułapka co przycisk prowadzący do drugiej
     odmowy, tylko cichsza: człowiek dostaje plan, który znowu zaczyna się za
     dwa lata.

     Ta funkcja pyta: „co przejdzie, gdyby start był NAJBLIŻSZY MOŻLIWY?" —
     czyli probuje każdy krótszy dystans na jego własnym `minTygodni` od
     dzisiejszego poniedziałku. Zwraca dystans, dla którego plan MOŻNA ułożyć
     dziś — a datę wybierze człowiek, bo tylko on wie, na jaki bieg się zapisze.
     ⚠️ Dlatego przycisk NIE układa planu od razu (tak działa `genSciezka`),
     tylko wraca do formularza z pustą datą. Data zmyślona przez silnik
     wpisałaby do kalendarza zawody, których nie ma. */
  var HORYZONTY_PROBY = [8, 12, 16, 20, 26];   // „bliższy bieg" = do pół roku
  function najblizszyTeraz(we, d, idxPnDzis) {
    if (_wSciezce) return null;
    _wSciezce = true;
    try {
      var kol = ['marathon', 'half', '10k', '5k'];
      for (var i = 0; i < kol.length; i++) {
        var kd = DYSTANSE[kol[i]];
        if (kd.km >= d.km) continue;                        // tylko KRÓTSZE od celu
        var proba = {};
        for (var k in we) if (Object.prototype.hasOwnProperty.call(we, k)) proba[k] = we[k];
        proba.dystans = kol[i];
        proba.celCzasowy = null;
        /* ⚠️ `minTygodni` NIE WYSTARCZY JAKO HORYZONT PRÓBY — zmierzone 24.08.2026.
           To minimum METODYCZNE (ile trwa cykl), a nie objętościowe. Przy bazie 21
           dziesiątka na swoim minimum odbija się o SKOK_OBJETOSCI: dojście do
           szczytu 33,6 km/tydz w 5 tygodniach budowania to +9,9%/tydz przy limicie
           6%. Próba na jednym horyzoncie odpowiadałaby więc „żaden dystans", choć
           ten sam plan na 12 tygodni powstaje bez problemu.

           Skanujemy do pół roku, bo tyle znaczy „bliższy bieg". Dalej to już nie
           jest odpowiedź na pytanie „co mogę robić teraz". */
        for (var h = 0; h < HORYZONTY_PROBY.length; h++) {
          var tyg = HORYZONTY_PROBY[h];
          if (tyg < kd.minTygodni + 1) continue;
          proba.dataStartu = isoZIdx(idxPnDzis + tyg * 7);
          var r = uloz(proba);
          if (r && r.ok) return kol[i];
        }
      }
      return null;
    } finally { _wSciezce = false; }
  }

  /* Od jakiej bazy dany dystans w ogóle przechodzi — szukane POŁOWIENIEM po
     silniku, nie wzorem (powód w komentarzu przy najblizszyOsiagalny).
     ⚠️ To jest liczba, po którą człowiek naprawdę przychodzi. Przy bazie 12
     do pierwszego planu brakuje pół kilometra tygodniowo, a stary komunikat
     pokazywał 35 — liczbę prawdziwą, lecz odbierającą nadzieję na rok. */
  function bazaDlaDystansu(we, dyst) {
    if (_wSciezce) return null;
    _wSciezce = true;
    try {
      var lo = 5, hi = 120, i;
      var probuj = function (b) {
        var p = {};
        for (var k in we) if (Object.prototype.hasOwnProperty.call(we, k)) p[k] = we[k];
        p.dystans = dyst; p.celCzasowy = null;
        p.poziom = {};
        for (var q in (we.poziom || {})) p.poziom[q] = we.poziom[q];
        p.poziom.objetoscTygodniowa = b;
        var r = uloz(p);
        return !!(r && r.ok);
      };
      if (!probuj(hi)) return null;                 // nie przechodzi nawet przy 120
      for (i = 0; i < 12; i++) {                    // 12 połowień => dokładność ~0,03 km
        var mid = (lo + hi) / 2;
        if (probuj(mid)) hi = mid; else lo = mid;
      }
      return Math.round(hi * 10) / 10;
    } finally { _wSciezce = false; }
  }

  /* Ile tygodni narastania dzieli bazę `od` od bazy `cel`. Ten sam sufit
     przyrostu, który odrzuca zbyt szybkie plany — więc ścieżka nie obiecuje
     tempa, którego generator by nie pozwolił zrealizować. */
  function tygodniDoBazy(od, cel) {
    var t = 0, b = od;
    if (!(od > 0) || !(cel > od)) return 0;
    while (b < cel && t < 520) { b *= (1 + maxPrzyrostDla(b)); t++; }
    return t;
  }

  /* ⚠️ NIE PRECYZYJNIEJ, NIŻ WIEMY — to jest cała treść tej funkcji.
     „~3 tygodnie" w obietnicy na przyszłość brzmi jak termin, a jest wynikiem
     modelu, który zakłada, że człowiek będzie rósł co tydzień o maksimum
     bez choroby, wyjazdu i gorszego tygodnia. Poniżej 8 tygodni mówimy więc
     „kilka tygodni"; do pół roku zaokrąglamy do dwóch tygodni; dalej podajemy
     porę roku, bo miesiąc i tak się rozjedzie. */
  var PORY = ['zimą', 'zimą', 'wiosną', 'wiosną', 'wiosną', 'latem',
              'latem', 'latem', 'jesienią', 'jesienią', 'jesienią', 'zimą'];
  function mgliscieTygodnie(tyg, idxOd) {
    if (!(tyg > 0)) return 'już teraz';
    if (tyg < 8) return 'kilka tygodni';
    if (tyg <= 26) return 'za około ' + (Math.round(tyg / 2) * 2) + ' tygodni';
    var iso = isoZIdx((idxOd || 0) + tyg * 7);
    var mies = Number(iso.slice(5, 7)) - 1;
    var rok = Number(iso.slice(0, 4));
    var terazRok = Number(isoZIdx(idxOd || 0).slice(0, 4));
    return PORY[mies] + (rok !== terazRok ? ' ' + rok : '');
  }

  function najdluzszyMieszczacySie(tygodnie, idxStart) {
    var kolejnosc = ['marathon', 'half', '10k', '5k'], i;
    for (i = 0; i < kolejnosc.length; i++) {
      var kd = DYSTANSE[kolejnosc[i]];
      var tp = kd.taper + (dzienTygodnia(idxStart) === 0 ? 0 : 1);
      if (kd.km >= DYSTANSE.half.km) tp = Math.max(tp, MIN_TAPER_DLUGIE);
      if (tygodnie >= Math.max(kd.minTygodni, MIN_TYG_BUDOWY + tp)) return kolejnosc[i];
    }
    return null;
  }

  /* Gdy do startu zostało tyle, że nie ma czego budować, jedyna użyteczna wiedza
     dotyczy OSTATNICH DNI — a silnik ją ma, bo rozpisuje je w każdym planie
     (nadpiszOstatnieDni). Zamiast budować osobny „plan wyciszający" z własnym
     typem, zapisem i obejściem pięciu ścian, oddajemy te trzy zdania w treści
     odmowy. Liczby idą z tych samych stałych co w planach, więc nie rozjadą się
     z resztą silnika. */
  function ostatnieDniPorada(tygodnie) {
    if (tygodnie > 3) return '';
    return ' Na te ostatnie dni i tak wiadomo, co robić: ostatni bieg przed startem to ' +
      ROZRUSZANIE_KM + ' km spokojnie + 4 × 100 m przebieżki, trzy dni przed — ' + AKCENTY_KM +
      ' km z 3 × 1 min w tempie startowym, dzień przed wolne. Nic więcej już nie zdążysz zbudować, ' +
      'a każdy dodatkowy trening tylko zabierze świeżość.';
  }

  function wyjscie(d, zamiast, tygodnie) {
    var samStart = 'Sam start i tak możesz przebiec — jako bieg do ukończenia, nie na wynik.';
    var trener = 'Jeśli data jest nie do ruszenia, napisz do Filipa albo Kasi — człowiek ułoży to, czego automat nie potrafi.';
    if (zamiast) {
      /* Dopełniacz, nie mianownik: „przygotować do półmaratonU", nie „do półmaraton".
         Etykiety 5/10 km są nieodmienne, więc mapa obejmuje tylko dwie pozycje. */
      var wDopelniaczu = { half: 'półmaratonu', marathon: 'maratonu' };
      return 'W tym czasie da się natomiast przygotować do ' +
             (wDopelniaczu[zamiast] || DYSTANSE[zamiast].etykieta.toLowerCase()) +
             ' — ułóż plan na ten dystans i trzymaj się go. ' + samStart + ' ' + trener;
    }
    return 'Na żaden dystans nie starczy już czasu na przygotowanie.' + ostatnieDniPorada(tygodnie) +
           ' ' + samStart + ' ' + trener;
  }

  function najblizszyPoniedzialek(idx) {
    // pierwszy poniedziałek ostro po dniu odniesienia
    var i = idx + 1;
    while (dzienTygodnia(i) !== 1) i++;
    return i;
  }

  function fmtCzas(sek) {
    var s = Math.round(sek), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h > 0 ? (h + ':' + pad2(m) + ':' + pad2(r)) : (m + ':' + pad2(r));
  }

  // ── OBJĘTOŚĆ TYDZIEŃ PO TYGODNIU ───────────────────────────────────────────
  // Budowa: narastanie ≤8%/tydz do peaku, co czwarty tydzień zrzut do 70%.
  // Taper: schodek w dół, tydzień startowy najlżejszy.
  /* ── KRZYWA IDZIE ZA BRAMKĄ, NIE OBOK NIEJ (25.08.2026) ────────────────────
     Do 25.08 stało tu płaskie `MAX_PRZYROST_TYG` (8%), a bramka SKOK_OBJETOSCI
     sprawdzała plan po stopniowanym `maxPrzyrostDla(baza)` (8/6/4/3%). Były to
     DWIE RÓŻNE REGUŁY na tę samą rzecz: zatwierdzany był inny plan niż
     wykonywany. Bramka liczy `(peak/obecna)^(1/budowa)`, czyli zakłada rampę
     rozłożoną na wszystkie tygodnie budowania — a rampa szła 8%/tydz do szczytu
     i potem stała.

     ZMIERZONE PRZED ZMIANĄ (maraton, baza 60, 30 tyg.): limit bramki 4%/tydz,
     realny przyrost krzywej 8%/tydz, szczyt osiągany w TYGODNIU 3 z 30, potem
     23 tygodnie `70 70 70 [49]` z niezmiennym wybieganiem 28 km.
     Dotyczyło 45 z 62 zawodników — każdego z bazą ≥ 20 km/tydz.

     ⚠️ ZMIANA NIE DOTYKA ŻADNEGO ISTNIEJĄCEGO PLANU i to jest sprawdzone
     w bazie, nie założone: `training_plans` ma 329 wierszy, wszystkie
     `source='coach_ai'` (Edge Function), ZERO z `source='self'`; `trainings`
     z `plan_source='generator'` — zero. Ten silnik nie zapisał jeszcze ani
     jednego planu (3 udane generacje w `generator_proby`, żadna nie zapisana).
     Krzywa i tak materializuje się przy GENEROWANIU — `uloz()` ma jedno
     wywołanie (zawodnik.html), a ekran planu czyta wiersze
     `training_plan_workouts`. Zapisany plan jest zamrożony. */
  function objetosciTygodni(k) {
    var out = [], biezaca = k.startTyg, i;
    /* ⚠️ REŻIM „FALA" ZOSTAJE NA 8% I TO NIE JEST WYJĄTEK OD REGUŁY, TYLKO JEJ
       ZAKRES. `maxPrzyrostDla` pilnuje BUDOWANIA NOWEJ formy. Fala nie buduje
       niczego — oscyluje wokół objętości, którą zawodnik ma DZIŚ (90% → 110%),
       więc dojście do 110% jest powrotem do znanego poziomu, nie przyrostem.
       Ten sam podział jest już zapisany w silniku przy PRZYROST_ODBUDOWY (15%):
       powrót do formy, którą ciało znało, idzie szybciej niż budowa.

       ZMIERZONE, dlaczego to ma znaczenie: baza 129, półmaraton, 10 tygodni.
       Przy 3%/tydz (pasmo >70) fala dochodzi tylko do 138,6 zamiast 141,9 —
       czyli zawodnik na 129 km/tydz nie zdąża wrócić do własnych 110% w planie,
       który z założenia nie ma go rozbudowywać. Złapane self-testem „fala:
       szczyt = 110% bazy". */
    var przyrostTyg = k.rezim === 'fala' ? MAX_PRZYROST_TYG : maxPrzyrostDla(k.obecna);
    for (i = 1; i <= k.budowa; i++) {
      if (i > 1) biezaca = Math.min(k.peak, biezaca * (1 + przyrostTyg));
      out.push(i % ZRZUT_CO === 0 ? biezaca * ZRZUT : biezaca);   // co 4. tydzień zrzut
    }
    var szczyt = Math.max.apply(null, out);
    var TAPER = { 1: [0.60], 2: [0.75, 0.55], 3: [0.80, 0.60, 0.45], 4: [0.85, 0.70, 0.55, 0.40] };
    var t = TAPER[k.taperTyg] || TAPER[3];
    for (i = 0; i < t.length; i++) out.push(szczyt * t[i]);
    return out.slice(0, k.tygodnie).map(function (x) { return Math.round(x * 10) / 10; });
  }

  // ── FAZA I JEDNOSTKA JAKOŚCIOWA ────────────────────────────────────────────
  // Baza → tempo ciągłe; szczyt → interwały. Tydzień zrzutowy bez jakości.
  function jakoscTygodnia(nrTyg, budowa, tygodnie) {
    // Zrzut i taper mają być LŻEJSZE, nie PUSTE. Objętość tygodnia jest już obniżona,
    // więc jednostka jakościowa kurczy się sama — dokładanie do tego zera jakości
    // dawało cztery tygodnie z rzędu bez akcentu tuż przed startem.
    // Bez jakości zostaje WYŁĄCZNIE tydzień startowy.
    if (nrTyg >= tygodnie) return null;
    var faza = nrTyg / Math.max(1, budowa);
    if (faza <= 0.34) return 'Tempo';                              // baza: tempo ciągłe
    // Szczyt to „interwały ORAZ tempo w tempie docelowym" (spec), nie same interwały —
    // przy dłuższej fazie szczytowej sam warunek faza>=0.67 dawał pięć tygodni z rzędu
    // wyłącznie interwałów. Co trzeci tydzień zostaje tempowy.
    if (faza >= 0.67) return nrTyg % 3 === 0 ? 'Tempo' : 'Interwały';
    return nrTyg % 2 === 0 ? 'Interwały' : 'Tempo';                // przejście: na przemian
  }

  /* ── DRUGA JEDNOSTKA JAKOŚCIOWA ────────────────────────────────────────────
     Filip: „zazwyczaj tempo i interwały, ale nie każdemu". Czyli dwie SĄ
     poprawne — tylko nie od pierwszego tygodnia i nie przy małej objętości.
     Cztery warunki naraz, każdy z powodem:

       dni >= 5           — przy czterech nie ma gdzie ich rozstawić bez
                            postawienia dwóch akcentów obok siebie
       kmTyg >= PROG_...  — POLICZONE, nie zgadnięte: jednostka jakościowa to
                            rozgrzewka 2 + praca + schłodzenie 1, więc dwie
                            kosztują 11–21 km. Przy 25 km/tydz to 44% tygodnia,
                            przy 30 km — 40% na styk, bez marginesu na tydzień
                            zrzutowy. Przy 45 km/tydz dwie jakości to 40%
                            z zapasem i dopiero od tej objętości mają sens.
       faza > 0.34        — „nie od razu": ta sama granica, którą jakoscTygodnia
                            już traktuje jako koniec fazy bazowej
       nie zrzut, nie taper — te tygodnie mają być lżejsze z definicji

     Zmierzone: obejmuje 166 z 948 tygodni (18%) — mniejszość, zgodnie z „nie
     każdemu". Sufit MAX_JAKOSC_W_TYG = 2 istniał wcześniej i był nieużywany;
     od teraz jest realnym ograniczeniem, a nie zabezpieczeniem na przyszłość. */
  function drugaJakosc(nrTyg, kmTyg, dni, k) {
    if (dni < MIN_DNI_DRUGIEJ_JAKOSCI) return null;
    if (!(kmTyg >= PROG_DRUGIEJ_JAKOSCI)) return null;
    if (nrTyg > k.budowa) return null;                       // taper
    if (nrTyg % ZRZUT_CO === 0) return null;                 // tydzień zrzutowy
    if (nrTyg / Math.max(1, k.budowa) <= 0.34) return null;  // faza bazowa
    // Druga jakość jest DOPEŁNIENIEM pierwszej: gdy tydzień ma interwały,
    // dokładamy tempo i odwrotnie. Nigdy dwa razy tego samego bodźca.
    return jakoscTygodnia(nrTyg, k.budowa, k.tygodnie) === 'Interwały' ? 'Tempo' : 'Interwały';
  }

  // ── JEDNOSTKA JAKOŚCIOWA: rozgrzewka + praca + schłodzenie ─────────────────
  // Km jednostki NIE są udziałem procentowym, tylko sumą rozbicia — inaczej opis
  // mówiłby co innego niż target_distance_km. Udział procentowy służy wyłącznie
  // do wybrania liczby odcinków / długości akcentu.
  function liczbaOdcinkow(kmPracy) {
    if (kmPracy < 4) return 3;      // ⚠️ próg poniżej widełek Filipa — mój dodatek
    if (kmPracy < 6) return 4;
    if (kmPracy <= 8) return 6;
    return MAX_ODCINKOW;
  }

  function jednostkaJakosci(typ, kmZUdzialu, p10, baza) {
    var kmPracy = Math.max(1, Math.round(kmZUdzialu - ROZGRZEWKA - SCHLODZENIE));
    if (typ === 'Interwały') {
      var n = liczbaOdcinkow(kmPracy);          // liczbaOdcinkow tnie do MAX_ODCINKOW
      var tempo = fmtTempo(tempoStrefy(p10, 'I'));
      return {
        km: ROZGRZEWKA + n * (ODCINEK_M / 1000) + SCHLODZENIE,
        opis: 'Rozgrzewka ' + ROZGRZEWKA + ' km spokojnie, ' + n + ' × ' + ODCINEK_M + ' m @ ' + tempo +
              '/km, przerwa 2 min trucht, schłodzenie ' + SCHLODZENIE + ' km.'
      };
    }
    /* Sufit akcentu progowego: sufitAkcentu(baza) ALBO 40 min, co wypadnie
       krócej. Bez tego zawodnik na 129 km/tydz dostawał 23 km ciągłego biegu
       (90 min) jako „tempo".
       ⚠️ REGUŁA 40 MINUT ZOSTAJE STAŁA I NIE SKALUJE SIĘ Z BAZĄ — to granica
       fizjologiczna ciągłego biegu progowego, nie granica objętościowa.
       Zmierzone: przy bazie 88 i p10 3:25 to ona, a nie 15,8 km z bazy, ustala
       pracę na ~12 km. Sufit z bazy zdejmuje blokadę, minuty pilnują sensu. */
    var tempoPace = tempoStrefy(p10, 'T');
    kmPracy = Math.min(kmPracy, sufitAkcentu(baza), Math.round(MAX_TEMPO_MIN * 60 / tempoPace));
    kmPracy = Math.max(1, kmPracy);
    var minuty = Math.round(kmPracy * tempoPace / 60);
    return {
      km: ROZGRZEWKA + kmPracy + SCHLODZENIE,
      opis: 'Rozgrzewka ' + ROZGRZEWKA + ' km spokojnie, ' + minuty + ' min ciągłego biegu @ ' +
            fmtTempo(tempoPace) + '/km (' + kmPracy + ' km), schłodzenie ' + SCHLODZENIE + ' km.'
    };
  }

  // ── SKŁADANIE TYGODNIA ─────────────────────────────────────────────────────
  function ulozTydzien(nrTyg, kmTyg, k, dni) {
    var jakosc = jakoscTygodnia(nrTyg, k.budowa, k.tygodnie);
    var sloty = UKLAD_DNI[dni].slice();            // ostatni = niedziela = długie
    var typy = new Array(sloty.length), i;

    typy[sloty.length - 1] = 'Wybieganie';
    var srodek = Math.floor((sloty.length - 1) / 2);
    if (jakosc) typy[srodek] = jakosc;

    /* Druga jakość — SZUKAMY DNIA, NIE BIERZEMY PIERWSZEGO WOLNEGO.
       Warunek „żadne dwie jakościowe pod rząd" jest dziś spełniony w całym
       planie (zmierzone: 0 naruszeń na 38 planach) i dokładanie akcentu nie może
       tego zepsuć. Wybieramy slot, który leży NAJDALEJ od pierwszej jakości
       i od wybiegania naraz; dzień regeneracyjny jest wyłączony z puli, bo
       zamiana regeneracji na akcent kasowałaby jedyny dzień odbudowy.
       Wychodzi z tego układ, który trener rozpisałby ręcznie:
         5 dni → Wt i Cz (jakości), Nd długie
         6 dni → Śr i Pt (jakości), Nd długie */
    var jakosc2 = jakosc ? drugaJakosc(nrTyg, kmTyg, dni, k) : null;
    if (jakosc2) {
      var ord = function (idx) { return (sloty[idx] + 6) % 7; };   // Pn=0 … Nd=6
      var najlepszy = -1, najlepszyOdstep = -1;
      for (i = 0; i < sloty.length - 1; i++) {
        if (i === srodek) continue;
        if (dni >= MIN_DNI_DRUGIEJ_JAKOSCI && i === 0) continue;   // dzień regeneracyjny
        var odstep = Math.min(Math.abs(ord(i) - ord(srodek)),
                              Math.abs(ord(i) - ord(sloty.length - 1)));
        if (odstep > najlepszyOdstep) { najlepszyOdstep = odstep; najlepszy = i; }
      }
      if (najlepszy >= 0 && najlepszyOdstep >= 2) typy[najlepszy] = jakosc2;
    }

    for (i = 0; i < sloty.length; i++) {
      if (!typy[i]) typy[i] = (dni >= 5 && i === 0) ? 'Regeneracja' : 'Bieg spokojny';
    }
    // Twardy sufit jakości: nadmiar zamienia się w bieg spokojny, nie w kolejny akcent.
    var ileJakosci = 0;
    for (i = 0; i < typy.length; i++) {
      if (typy[i] === 'Tempo' || typy[i] === 'Interwały') {
        ileJakosci++;
        if (ileJakosci > MAX_JAKOSC_W_TYG) typy[i] = 'Bieg spokojny';
      }
    }

    // Kotwice: długie 33% tygodnia, regeneracja 10%, jakość = suma swojego rozbicia.
    // Spokojne absorbują resztę, żeby suma tygodnia trzymała się objętości.
    var km = new Array(sloty.length), opisy = new Array(sloty.length);
    var zajete = 0, spokojne = [];
    /* Sufit wybiegania — funkcja BAZY, więc jedna liczba na cały plan, nie na
       tydzień. Liczony raz, bo używają go cztery miejsca niżej (kotwica,
       Regeneracja, wykrycie `przySuficie`, ratunek DLUGIE_NAD_SPOKOJNYM)
       i rozjazd między nimi byłby niewidoczny. */
    var _sufitDlugie = sufitWybiegania(k.d, k.obecna);
    for (i = 0; i < typy.length; i++) {
      /* ⚠️ PODŁOGA DOTYCZY WYBIEGANIA, NIE KAŻDEJ JEDNOSTKI — i to rozróżnienie
         jest sednem zarzutu, nie szczegółem.

         Bieg spokojny 3,7 km w tygodniu 1 przy bazie 19 km/tydz jest POPRAWNY:
         to jedna piąta tygodnia kogoś, kto biega 19 km. Podłoga na biegach
         spokojnych kosztowałaby go dni — zmierzone: przy 6 dniach i bazie 25
         plan oddawał DWA dni z sześciu. Tego nie chcemy, bo generator powstał
         właśnie dla zawodnika z małą bazą.

         Wybieganie to inna sprawa. Ono ma jedno zadanie — być najdłuższym biegiem
         tygodnia i przygotować do dystansu. Wybieganie krótsze niż MIN_WYBIEGANIA_KM
         nie robi ani jednego, ani drugiego; jest zwykłym biegiem z inną etykietą.
         Dlatego podłogę dostaje wyłącznie ono.

         ⚠️ TA PODŁOGA NIE DZIAŁA I NIGDY NIE DZIAŁAŁA — sprostowane 25.08.2026.
         Stało tu zdanie: „schodziło poniżej 6 km TYLKO przy bazie 19 km/tydz
         i tylko na 5 i 10 km (tydzień 1: 5,5; zrzutowy: 5,0). Przy półmaratonie
         i maratonie nie schodzi nigdy". PRZEMIERZONE na pełnym zakresie
         (4 dystanse × 3–6 dni × bazy 12–140): 268 jednostek poniżej 6 km,
         najkrótsza 3,0 km, bazy 12–29 km/tydz, dystanse 5 km, 10 km ORAZ
         PÓŁMARATON, we wszystkich tygodniach planu — nie tylko zrzutowych.
         Sprawdzone też na wersji sprzed zmiany krzywej: 256 przypadków, ta sama
         najkrótsza 3,0 km i ten sam zakres baz. Czyli opis był nieprawdziwy
         zanim krzywa się zmieniła; zmiana dołożyła 12 przypadków, nie zjawisko.

         Mechanizm: podłoga jest nakładana TUTAJ, ale niżej stoją jeszcze
         MAX_UDZIAL_DLUGIEGO i domykanie sumy tygodnia do `kmTyg`. Przy małej
         objętości tygodnia i wielu dniach suma podłóg MIN_JEDNOSTKI_KM
         przekracza budżet i różnicę oddaje wybieganie — czyli jedyna jednostka,
         która miała podłogę, jest tą, z której się schodzi.

         ⚠️ NIE NAPRAWIAM TEGO PRZY OKAZJI: kolejność „podłoga → sufit udziału →
         domknięcie sumy" jest opisana niżej jako świadoma, więc zmiana wymaga
         decyzji, która z trzech reguł ustępuje. Zapisane jako zaległość. */
      if (typy[i] === 'Wybieganie')        { km[i] = Math.min(Math.max(k.d.udzialDlugiego * kmTyg, MIN_WYBIEGANIA_KM), _sufitDlugie); zajete += km[i]; }
      else if (typy[i] === 'Regeneracja')  { km[i] = Math.min(0.10 * kmTyg, _sufitDlugie); zajete += km[i]; }
      else if (typy[i] === 'Tempo' || typy[i] === 'Interwały') {
        var j = jednostkaJakosci(typy[i], 0.20 * kmTyg, k.p10, k.obecna);
        km[i] = j.km; opisy[i] = j.opis; zajete += j.km;
      } else spokojne.push(i);
    }
    var reszta = kmTyg - zajete;
    var naSpokojny = spokojne.length ? reszta / spokojne.length : 0;

    // Długie musi zostać najdłuższą jednostką tygodnia — inaczej jego opis kłamie.
    // Przy 3 dniach jeden spokojny absorbował całą resztę i wychodził dłuższy od
    // wybiegania (55 km/tydz: spokojny 27,9 przy długim 18,2). Gdy do tego dojdzie,
    // dzielimy pulę spokojne+długie tak, żeby długie było DLUGIE_NAD_SPOKOJNYM razy
    // dłuższe od spokojnego. Przy 4+ dniach warunek nie zachodzi i nic się nie zmienia.
    var idxDlugie = typy.indexOf('Wybieganie');
    var przySuficie = idxDlugie >= 0 && km[idxDlugie] >= _sufitDlugie - 0.001;
    if (spokojne.length && idxDlugie >= 0 && !przySuficie && naSpokojny > 0.9 * km[idxDlugie]) {
      var pula = km[idxDlugie] + reszta;
      var jedenSpokojny = pula / (spokojne.length + DLUGIE_NAD_SPOKOJNYM);
      km[idxDlugie] = Math.min(jedenSpokojny * DLUGIE_NAD_SPOKOJNYM, _sufitDlugie);
      naSpokojny = (pula - km[idxDlugie]) / spokojne.length;
    }
    /* ── SUFIT UDZIAŁU WYBIEGANIA W TYGODNIU ───────────────────────────────
       `udzialDlugiego` (0,30–0,40) sam z siebie nigdy nie przekracza 40%, więc
       nadwyżka NIE bierze się z rozdania kilometrów — bierze się z ratunku
       DLUGIE_NAD_SPOKOJNYM tuż wyżej, który przy 3 dniach podnosi wybieganie,
       żeby nie było krótsze od jedynego biegu spokojnego. Sufit musi więc stać
       ZA ratunkiem, inaczej nie miałby czego przycinać.

       ⚠️ SUFIT OBOWIĄZUJE BEZ WYJĄTKU — także przy 3 dniach, i to jest ŚWIADOMY
       KOSZT, nie przeoczenie. Przy 3 dniach tydzień to trzy jednostki, z czego
       jakość bierze sztywne ~20%; na dwie pozostałe zostaje 80%. Przycięcie
       wybiegania do 40% oznacza, że bieg spokojny dobija do tej samej długości
       (linia niżej i tak nie pozwala mu przerosnąć wybiegania), więc zamiast
       „18,5 + 14,5" wychodzi „16,0 + 16,0" — REMIS, a tydzień oddaje ok. 1 km,
       którego nie ma gdzie położyć. Decyzja Filipa z 17.08: 40% jest ważniejsze
       niż to, że wybieganie jest ściśle najdłuższe. Opis jednostki mówi
       „Najdłuższa jednostka tygodnia" i przy 3 dniach bywa teraz remisem —
       jeśli to ma wrócić, wraca razem z opisem, nie samo. */
    if (idxDlugie >= 0 && spokojne.length) {
      var sufitUdzialu = MAX_UDZIAL_DLUGIEGO * kmTyg;
      if (km[idxDlugie] > sufitUdzialu + 0.001) {
        naSpokojny = (reszta + km[idxDlugie] - sufitUdzialu) / spokojne.length;
        km[idxDlugie] = sufitUdzialu;
      }
    }

    // Spokojny nigdy dłuższy od wybiegania. Gdy sufity się zamykają, tydzień NIE
    // dobija do zaplanowanej objętości — i tak ma być: lepiej oddać mniej kilometrów
    // niż wypchnąć je w jedną jednostkę, która przestaje być spokojna.
    if (idxDlugie >= 0) naSpokojny = Math.min(naSpokojny, km[idxDlugie]);
    spokojne.forEach(function (idx) { km[idx] = naSpokojny; });

    /* ── PODŁOGA JEDNOSTKI Z REDYSTRYBUCJĄ ─────────────────────────────────
       ⚠️ TO ODWRACA WCZEŚNIEJSZĄ DECYZJĘ I TRZEBA WIEDZIEĆ, DLACZEGO.
       Stało tu `Math.max(2, naSpokojny)` i komentarz, że podłoga NIE należy się
       biegom spokojnym, bo „kosztowałaby dni" — przy 6 dniach i bazie 25 plan
       oddawał dwa dni z sześciu. Tamten zarzut był słuszny wobec podłogi BEZ
       REDYSTRYBUCJI: stara podłoga po prostu DOKŁADAŁA kilometry, których nikt
       nie odjął, więc tydzień po cichu przekraczał swoją objętość.
       Podłoga z redystrybucją znosi ten zarzut — brakujące kilometry bierzemy
       z NAJDŁUŻSZEJ jednostki, więc suma tygodnia zostaje ta sama i żaden dzień
       nie znika. Dopiero gdy dawca nie ma z czego oddać, dzień odpada — i to
       jest uczciwe, bo znaczy, że na tylu dniach nie da się zrobić sensownych
       jednostek z tej objętości.

       Kolejność jest nośna: podłoga stoi ZA sufitem udziału i za „spokojny nie
       dłuższy od wybiegania", bo obie te reguły ustalają, ile kto ma; podłoga
       tylko przesuwa kilometry MIĘDZY jednostkami, nie tworzy ich. */
    var biegowe = [];
    for (i = 0; i < typy.length; i++) if (typy[i] !== 'Odpoczynek' && km[i] > 0) biegowe.push(i);

    var brak = 0;
    for (i = 0; i < biegowe.length; i++) {
      var bi = biegowe[i];
      if (km[bi] < MIN_JEDNOSTKI_KM) { brak += MIN_JEDNOSTKI_KM - km[bi]; km[bi] = MIN_JEDNOSTKI_KM; }
    }
    if (brak > 0) {
      /* ⚠️ DAWCĄ JEST CAŁY ZAPAS PONAD PODŁOGĄ, NIE SAMA NAJDŁUŻSZA JEDNOSTKA.
         Pierwsza wersja brała wyłącznie z najdłuższej, schodząc najwyżej do
         drugiej co do długości — i przez to CICHO ZAWYŻAŁA tydzień: gdy
         wszystkie jednostki się zrównały, nie było już od kogo brać, pętla
         wychodziła, a podniesione kilometry zostawały. Zmierzone na 5644
         tygodniach: suma rosła w 117 z nich, do +2,0 km. Pula proporcjonalna
         domyka bilans z definicji — każdy oddaje w proporcji do swojego zapasu,
         więc dopóki zapas w ogóle istnieje, niedobór da się pokryć. */
      var straz = 0;
      while (brak > 0.001 && straz++ < 30) {
        var zapas = 0;
        for (i = 0; i < biegowe.length; i++) zapas += Math.max(0, km[biegowe[i]] - MIN_JEDNOSTKI_KM);
        if (zapas <= 0.001) break;
        var bierz = Math.min(brak, zapas);
        for (i = 0; i < biegowe.length; i++) {
          var z = Math.max(0, km[biegowe[i]] - MIN_JEDNOSTKI_KM);
          if (z > 0) km[biegowe[i]] -= bierz * (z / zapas);
        }
        brak -= bierz;
      }
      /* ⚠️ ZAPAS SIĘ SKOŃCZYŁ → ODDAJEMY DZIEŃ, NIE ZAWYŻAMY TYGODNIA.
         Dzieje się to, gdy dni × MIN_JEDNOSTKI_KM przekracza objętość tygodnia
         — np. 5 dni przy 13,5 km. Nie istnieje wtedy układ, w którym każda
         jednostka ma sens; zamiana najkrótszej na Odpoczynek jest jedyną
         uczciwą odpowiedzią, a jej kilometry wracają do pozostałych.
         Zmierzone: dotyczy 123 tygodni z 5644 (2,2%), wyłącznie przy bazie
         15–30 km/tydz i 4–6 dniach — czyli tam, gdzie arytmetyka nie zostawia
         wyboru, a nie tam, gdzie ktoś normalnie biega. */
      var obrona = 0;
      while (brak > 0.001 && biegowe.length > 1 && obrona++ < 6) {
        var najkr = -1;
        for (i = 0; i < biegowe.length; i++) {
          if (biegowe[i] === idxDlugie) continue;     // wybiegania nie kasujemy nigdy
          if (najkr < 0 || km[biegowe[i]] < km[najkr]) najkr = biegowe[i];
        }
        if (najkr < 0) break;
        var oddane = km[najkr];
        typy[najkr] = 'Odpoczynek'; km[najkr] = 0; opisy[najkr] = null;
        biegowe = biegowe.filter(function (x) { return x !== najkr; });
        brak -= oddane;
        if (brak < 0) {                               // nadwyżka wraca do najdłuższej
          var najD = biegowe[0];
          for (i = 1; i < biegowe.length; i++) if (km[biegowe[i]] > km[najD]) najD = biegowe[i];
          km[najD] += -brak; brak = 0;
        }
      }
    }

    return sloty.map(function (dow, idx) {
      return { dow: dow, typ: typy[idx], km: Math.round(km[idx] * 10) / 10, opis: opisy[idx] || null };
    });
  }

  var OPISY = {
    'Bieg spokojny': 'Konwersacyjnie. Jeśli nie dasz rady mówić pełnym zdaniem — za szybko.',
    'Wybieganie':    'Najdłuższa jednostka tygodnia. Równo, bez przyspieszania na końcu.',
    'Regeneracja':   'Bardzo wolno, świadomie. To nie jest trening — to sprzątanie po treningu.',
    'Tempo':         'Ciągły bieg w tempie progowym po rozgrzewce. Ciężko, ale kontrolowanie.',
    'Interwały':     'Odcinki w tempie zbliżonym do dziesiątki, przerwy w truchcie.',
    'Odpoczynek':    'Wolne. Odpoczynek jest częścią planu, nie przerwą w nim.'
  };
  var STREFA_TYPU = { 'Bieg spokojny': 'E', 'Wybieganie': 'E', 'Regeneracja': 'Reg', 'Tempo': 'T', 'Interwały': 'I' };

  /* ── OSTATNIE DNI PRZED STARTEM ────────────────────────────────────────────
     Szablon tygodnia nie wie, że za chwilę są zawody. Zmierzone PRZED poprawką
     (półmaraton, 129 km/tydz, 6 dni) — dzień przed startem wg dnia tygodnia:
       Nd  Odpoczynek        ← jedyny poprawny, i to przypadkiem
       Pn  Wybieganie 22 km  ← najdłuższa jednostka planu dzień przed zawodami
       Wt  Regeneracja 6,4 km
       Śr–Sb  Bieg spokojny 8,9 km
     Sześć z siedmiu dni było zepsutych; niedziela działała tylko dlatego, że
     tam wypada dzień wolny szablonu.

     ⚠️ Kotwicą jest OSTATNI DZIEŃ BIEGOWY, nie sztywne T-1. Jeśli ostatni bieg
     wypada trzy dni przed startem, nadal ma być rozruszaniem — nie wybieganiem.
     ⚠️ Liczby są WSPÓLNE dla wszystkich dystansów: dzień przed piątką wygląda
     tak samo jak dzień przed maratonem. To OSĄD, zero pokrycia w danych. */
  var ROZRUSZANIE_KM = 4;
  var AKCENTY_KM     = 7;

  /* Dzień zawodów udaje 'Bieg spokojny' (patrz komentarz przy jego tworzeniu),
     więc łamie niezmienniki, które słusznie obowiązują biegi: ma pusty dystans
     i puste tempo. Zamiast rozsiewać dopasowanie do stringu po testach i
     konsumentach — jeden marker i jeden predykat. */
  var MARKER_STARTU = '🏁 START: ';
  function jestDniemStartu(w) {
    return !!w && typeof w.description === 'string' && w.description.indexOf(MARKER_STARTU) === 0;
  }

  function nadpiszOstatnieDni(treningi, idxStart, tempoE) {
    var bieg = function (t) { return (t.target_distance_km || 0) > 0; };

    // 1) Ostatni dzień biegowy przed startem → ROZRUSZANIE, zawsze.
    var ost = -1;
    for (var i = 0; i < treningi.length; i++) {
      var idx = dzienIdx(treningi[i].date);
      if (idx >= idxStart || !bieg(treningi[i])) continue;
      if (ost < 0 || idx > dzienIdx(treningi[ost].date)) ost = i;
    }
    if (ost >= 0) {
      treningi[ost].workout_type       = 'Bieg spokojny';
      treningi[ost].target_distance_km = ROZRUSZANIE_KM;
      treningi[ost].target_pace        = tempoE;
      treningi[ost].description        =
        ROZRUSZANIE_KM + ' km spokojnie + 4 × 100 m przebieżki. Rozruszanie, nie trening.';
    }

    // 2) Trzy dni przed — akcenty w tempie startowym, ale TYLKO gdy to nie jest
    //    ostatni bieg i gdy dzień już jest biegowy. Wolne wygrywa: nie dokładamy
    //    objętości tam, gdzie plan mówi odpocznij.
    for (var j = 0; j < treningi.length; j++) {
      if (dzienIdx(treningi[j].date) !== idxStart - 3) continue;
      if (j === ost || !bieg(treningi[j])) break;
      if ((treningi[j].target_distance_km || 0) <= AKCENTY_KM) break;
      treningi[j].workout_type       = 'Bieg spokojny';
      treningi[j].target_distance_km = AKCENTY_KM;
      treningi[j].target_pace        = tempoE;
      treningi[j].description        =
        AKCENTY_KM + ' km, w środku 3 × 1 min w tempie startowym. Przypomnienie rytmu, nie trening.';
      break;
    }
  }

  // ── GŁÓWNE WEJŚCIE ─────────────────────────────────────────────────────────
  function uloz(wejscie) {
    var brama = sprawdzSciane(wejscie);
    if (!brama.ok) return brama;

    var k = brama.kontekst, dni = wejscie.dniWTygodniu;
    var objetosci = objetosciTygodni(k);
    var treningi = [];
    var idxStartuPlanu = k.idxPn;

    for (var t = 1; t <= k.tygodnie; t++) {
      var tydzienIdx0 = idxStartuPlanu + (t - 1) * 7;         // poniedziałek tego tygodnia
      var jednostki = ulozTydzien(t, objetosci[t - 1], k, dni);
      var poDniu = {};
      jednostki.forEach(function (j) { poDniu[j.dow] = j; });

      for (var off = 0; off < 7; off++) {
        var idx = tydzienIdx0 + off;
        if (idx > k.idxStart) break;                          // po dniu startu nic nie planujemy
        var dow = dzienTygodnia(idx);
        var jest = poDniu[dow];

        if (idx === k.idxStart) {
          /* ⚠️ DZIEŃ ZAWODÓW MA target_distance_km = null, NIE dystans startu.
             To NIE jest błąd i nie "brakuje tu 21,1 km".

             Powód: zawody to nie jednostka treningowa w sensie planowania.
             Gdyby dzień startu niósł swój dystans, wliczyłby się do sumy tygodnia
             w planie — a zawodnik po biegu i tak zaloguje realny wynik do
             training_logs. Ten sam bieg policzyłby się DWA RAZY: raz jako plan,
             raz jako wykonanie. Dystans zawodów jest w opisie, gdzie go widać,
             ale gdzie nikt go nie sumuje.

             ⚠️ Świadomie NIE używamy workout_type 'Start', mimo że taka wartość
             ISTNIEJE i działa (103 wiersze w trainings.type, własna ikona
             w kalendarzu, mapowanie tempa). Właśnie dlatego, że 'start' jest
             w RUN_TYPES (sb.js) — isRunType('Start') zwraca true, więc dystans
             wszedłby do objętości biegowej mimo wszystko. Osobny typ „zawody"
             wymagałby synchronizacji trzech miejsc przy zysku kosmetycznym —
             patrz zaległość „brak typu zawody". */
          var nazwaBiegu = (wejscie.nazwaBiegu && String(wejscie.nazwaBiegu).trim()) || k.d.etykieta;
          treningi.push(trening(idx, dow, t, 'Bieg spokojny', null, null, nazwaBiegu,
            MARKER_STARTU + nazwaBiegu + ' — ' + (Math.round(k.d.km * 10) / 10) + ' km'));
          continue;
        }
        if (!jest) { treningi.push(trening(idx, dow, t, 'Odpoczynek', null, null, null)); continue; }
        var strefa = STREFA_TYPU[jest.typ];
        treningi.push(trening(idx, dow, t, jest.typ, jest.km, fmtTempo(tempoStrefy(k.p10, strefa)) + '/km', null, jest.opis));
      }
    }

    /* Korekta ostatnich dni MUSI stać przed bramką wybiegania i przed liczeniem
       objetosciFaktyczne — inaczej bramka mierzyłaby plan sprzed korekty, a meta
       podawałaby kilometry, których w planie już nie ma. */
    nadpiszOstatnieDni(treningi, k.idxStart, fmtTempo(tempoStrefy(k.p10, 'E')) + '/km');

    /* DRUGA BRAMKA — mierzona na GOTOWYM planie, nie na prognozie.
       Poprawna arytmetyka objętości nie gwarantuje sensownego wybiegania: długie to
       ułamek tygodnia, więc maraton potrafił przejść z najdłuższym 10,6 km. To jest
       liczba, którą zawodnik odczuje bezpośrednio — ważniejsza niż suma tygodnia.
       Liczona z realnego wyjścia, żeby nie dublować wzoru układania tygodnia. */
    var najdluzsze = treningi.reduce(function (m, w) {
      return w.workout_type === 'Wybieganie' ? Math.max(m, w.target_distance_km || 0) : m;
    }, 0);
    var progDlugiego = k.d.minDlugieProc * k.d.km;
    /* ⚠️ PORÓWNANIE IDZIE PO SIATCE, W GÓRĘ — nie przez poluzowanie progu.
       Wybieganie jest już zaokrąglone do 0,5 km, a próg (0,55 × 42,195 = 23,207)
       na siatce nie istnieje. Pierwsza WYRAŻALNA długość, która go osiąga, to
       23,5 — i tego wymagamy.

       Nie wolno tu zamiast tego rozluźnić progu o pół kroku: zmierzone na
       maratonie przy 36 km/tydz najdłuższe wybieganie ma 23,15 km przed
       zaokrągleniem, czyli JEST za krótkie i przed zaokrąglaniem leciało
       na ZA_KROTKIE_WYBIEGANIE. Tolerancja ±0,25 przepuściłaby je jako 23,0 —
       zaokrąglenie kosmetyczne przestawiłoby bramkę bezpieczeństwa.
       W komunikacie zostaje 23,2, bo to jest reguła (55% dystansu);
       23,5 to tylko najbliższa liczba, którą plan potrafi zapisać. */
    if (najdluzsze < Math.ceil(progDlugiego / KROK_KM) * KROK_KM - 0.001) {
      var potrzebnyPeak = progDlugiego / k.d.udzialDlugiego;
      /* ⚠️ TEN SAM MNOŻNIK I TEN SAM `tygodnie`, CO PRZY LICZENIU SZCZYTU —
         inaczej komunikat podałby bazę wyższą, niż silnik naprawdę wymaga przy
         tym horyzoncie, i wysłał człowieka budować kilometry, których nie
         potrzebuje. Liczba w odmowie musi pochodzić z reguły, która odmówiła. */
      var bazaDlaDlugiego = Math.ceil(potrzebnyPeak / mnoznikSzczytu(k.tygodnie));
      /* Ta sama ścieżka co przy ZA_MALA_BAZA — wybieganie rośnie razem
         z objętością, więc „ile brakuje" jest tu równie policzalne.
         ⚠️ TEN BRZEG BYWA WĄSKI: przy 34 km/tydz do maratonu brakuje ~3 km/tydz,
         czyli mniej niż 8 tygodni. Właśnie dlatego mgliscieTygodnie() mówi wtedy
         „kilka tygodni", a nie „3 tygodnie" — model zakłada wzrost co tydzień
         o maksimum, bez choroby, wyjazdu i gorszego tygodnia. Podanie liczby
         byłoby precyzją, której nie mamy. */
      var blizejW = najblizszyOsiagalny(wejscie, k.d);
      var doBazyW = tygodniDoBazy(k.obecna, bazaDlaDlugiego);
      var sciezkaWybiegania = (blizejW
          ? 'Najbliżej masz ' + DYSTANSE[blizejW].etykieta.toLowerCase() +
            ' — plan na ten dystans powstanie od razu. ' : '') +
        'Wybieganie rośnie razem z objętością: przy ~' + bazaDlaDlugiego +
        ' km/tydz zmieści się samo, czyli ' +
        mgliscieTygodnie(doBazyW, dzienIdx(wejscie.today)) + ' budowania.';
      return odmowa('ZA_KROTKIE_WYBIEGANIE',
        'Najdłuższe wybieganie w takim planie to ' + (Math.round(najdluzsze * 10) / 10) + ' km, a przed startem na ' +
        k.d.etykieta.toLowerCase() + ' trzeba dobiec co najmniej ' + (Math.round(progDlugiego * 10) / 10) + ' km (' +
        Math.round(k.d.minDlugieProc * 100) + '% dystansu). ' + sciezkaWybiegania,
        { najdluzsze_km: Math.round(najdluzsze * 10) / 10, wymagane_km: Math.round(progDlugiego * 10) / 10,
          procDystansu: Math.round(k.d.minDlugieProc * 100), obecna_km: Math.round(k.obecna),
          wymaganaBaza_km: bazaDlaDlugiego, dystans: wejscie.dystans,
          sciezkaDystans: blizejW, sciezkaTygodni: doBazyW });
    }

    var sumaKm = treningi.reduce(function (s, w) { return s + (w.target_distance_km || 0); }, 0);

    // Objętość PLANOWANA (objetosci) nadaje kształt, ale sufity jednostek mogą jej
    // nie dopuścić. Na zewnątrz podajemy to, co plan NAPRAWDĘ zadaje.
    var faktyczne = [];
    for (var ti = 1; ti <= k.tygodnie; ti++) {
      var suma = 0;
      for (var wi = 0; wi < treningi.length; wi++) {
        if (treningi[wi].week_number === ti) suma += treningi[wi].target_distance_km || 0;
      }
      faktyczne.push(Math.round(suma * 10) / 10);
    }
    var szczytTyg = Math.max.apply(null, faktyczne);

    /* ── UBYTEK OBJĘTOŚCI W FAZIE BUDOWY ──────────────────────────────────────
       ⚠️ WARUNEK NA SZCZYCIE (0,95) NIE WYSTARCZA I TO JEST ZMIERZONE. Porównuje
       SZCZYT ze SZCZYTEM, więc plan, którego szczyt się zgadza, a środkowe
       tygodnie nie — milczy. Przemiot 290 planów, 25.08.2026:
           ubytek 0,5–2%  : 22 plany, ŻADEN nie dostawał noty (mediana 3,3 km)
           ubytek 2–5%    : 17 planów, 7 bez noty (mediana 23,3 km)
           ubytek 5–10%   : 13 planów, 4 bez noty (mediana 60,3 km)
           ubytek >10%    : 50 planów, 3 bez noty (mediana 179,3 km)
       Plan potrafił stracić 60–180 km w fazie budowy i nie powiedzieć nic.

       ⚠️ PRÓG LICZY SIĘ Z SIATKI, NIE JEST WPISANY. Każda jednostka jest
       zaokrąglona do KROK_KM, więc suma n jednostek może odjechać od deklaracji
       o n × KROK_KM/2 BEZ ŻADNEJ WADY. Dopiero powyżej tego mówimy o ubytku.
       Zmierzone: warunek łapie 81 planów zamiast 66, a dokładka to przypadki
       realne (5 km, 5 dni, baza 90: −74 km przy luzie siatki 15 km), nie
       zaokrąglenia. Dosłowne „gdy niezerowy" zapaliłoby się na 176 z 290 —
       w większości na 0,2 km, czyli na szumie.

       ⚠️ FAZA BUDOWY, NIE CAŁY PLAN. W taperze `nadpiszOstatnieDni` ŚWIADOMIE
       zastępuje ostatni bieg rozruszaniem, a dzień startu ma pusty dystans —
       tam deklaracja jest nadpisana celowo i porównywanie jej z realem
       zapalałoby notę na KAŻDYM planie. */
    var _ub = ubytekBudowyZ(objetosci, faktyczne, treningi, Math.max(0, k.tygodnie - k.taperTyg));
    var deklBudowa = _ub.dekl, faktBudowa = _ub.fakt;
    var ubytekBudowy = _ub.ubytek, luzSiatkiBudowy = _ub.luz;

    /* ⚠️ PROGNOZA LICZY SIĘ Z FORMY (p10Formy), NIGDY Z CELU (p10).
       Przy podanym celu `k.p10` jest już PODMIENIONY na tempo wyliczone z celu
       (patrz sprawdzSciane), więc `prognozaCzasu(k.p10, …)` zwracało dokładnie
       cel — i podsumowanie mówiło „Cel 3:45:00 przy prognozie 3:45:00".
       Zdanie ma zestawiać zamiar z obecną formą, a porównywało cel sam ze sobą.
       Bez celu p10Formy === p10, więc dla planów bez celu nic się nie zmienia. */
    var prognoza = prognozaCzasu(k.p10Formy, k.d.km);

    var plan = {
      source: 'self',
      plan_type: typPlanu(k.tygodnie),
      status: 'draft',
      start_date: isoZIdx(idxStartuPlanu),
      end_date: isoZIdx(k.idxStart),
      target_race_type: wejscie.dystans,
      target_race_date: isoZIdx(k.idxStart),
      target_time: wejscie.celCzasowy != null ? fmtCzas(wejscie.celCzasowy) : null,
      input_current_volume_km: Math.round(k.obecna),
      input_target_volume_km: Math.round(szczytTyg),
      total_workouts: treningi.filter(function (w) { return w.workout_type !== 'Odpoczynek'; }).length,
      total_distance_km: Math.round(sumaKm * 10) / 10,
      ai_summary: podsumowanie(k, dni, szczytTyg, prognoza, wejscie),
      ai_warnings: ZAMKNIECIE,
      generated_by_model: null
    };

    /* ── PLAN, KTÓRY ZACZYNA SIĘ PÓŹNIEJ, MUSI TO POWIEDZIEĆ ───────────────
       ⚠️ TO NIE JEST ODMOWA, ale niesie ten sam obowiązek co odmowa: człowiek
       ma wyjść z tego ekranu z czymś do zrobienia. „Plan zaczyna się za 61
       tygodni" bez dalszego ciągu jest gorsze od odmowy — wygląda jak sukces,
       a zostawia rok pustki.

       Dlatego zdanie mówi trzy rzeczy w tej kolejności: DLACZEGO plan jest
       krótszy niż horyzont, KIEDY rusza, i CO robić do tego czasu. Dopiero
       potem ścieżka na krótszy dystans. */
    var startOdroczony = null;
    if (k.przesunieteTyg > 0) {
      var doStartu = k.tygodnie + k.przesunieteTyg;
      var bliskoTeraz = najblizszyTeraz(wejscie, k.d, k.idxPn - k.przesunieteTyg * 7);
      /* Powyżej pół roku `mgliscieTygodnie` oddaje porę roku z rokiem („latem
         2028"), a data obok już to mówi. Doklejamy ją tylko wtedy, gdy naprawdę
         dokłada informację — czyli gdy jest liczbą tygodni. */
      var kiedy = k.przesunieteTyg <= 26
        ? ', czyli ' + mgliscieTygodnie(k.przesunieteTyg, k.idxToday) : '';
      startOdroczony = {
        tygodni: k.przesunieteTyg,
        tygodnieDoStartu: doStartu,
        data: isoZIdx(k.idxPn),
        sciezkaDystans: bliskoTeraz,
        komunikat:
          'Do startu jest ' + doStartu + ' tyg., a najdłuższy plan, jaki układam, to ' + MAX_TYGODNI +
          ' — dłuższy powtarzałby ten sam cykl w kółko, zamiast cokolwiek dokładać. ' +
          'Ten kończy się w dniu zawodów, więc rusza ' + fmtDataPl(k.idxPn) + kiedy + '. ' +
          'Do tego czasu masz jedno zadanie: nie stracić tego, co już biegasz — plan jest policzony ' +
          'z dzisiejszych ' + Math.round(k.obecna) + ' km/tydz i tyle zakłada w dniu, w którym ruszy.' +
          (bliskoTeraz
            ? ' Jeśli masz po drodze bliższy bieg, ułóż plan na ' +
              DYSTANSE[bliskoTeraz].etykieta.toLowerCase() + ' i wróć tutaj, kiedy ten ruszy.'
            : '')
      };
    }

    return {
      ok: true,
      plan: plan,
      treningi: treningi,
      startOdroczony: startOdroczony,
      meta: {
        p10sec: Math.round(k.p10),                  // z czego liczone są STREFY (cel, gdy podany)
        p10sec_forma: Math.round(k.p10Formy),       // co wynika z historii — zostaje dla porównania
        tempaZCelu: wejscie.celCzasowy != null,
        tempa: {
          E:   fmtTempo(tempoStrefy(k.p10, 'E')),
          Reg: fmtTempo(tempoStrefy(k.p10, 'Reg')),
          M:   fmtTempo(tempoStrefy(k.p10, 'M')),
          T:   fmtTempo(tempoStrefy(k.p10, 'T')),
          I:   fmtTempo(tempoStrefy(k.p10, 'I')),
          R:   fmtTempo(tempoStrefy(k.p10, 'R'))
        },
        rezim: k.rezim,                       // 'progresja' | 'mieszany' | 'fala'
        tygodnie: k.tygodnie,
        objetosciTygodni: objetosci,          // planowane — nadają kształt
        objetosciFaktyczne: faktyczne,        // zadane w planie, po sufitach jednostek
        taperTygodni: k.taperTyg,
        najdluzsze_km: Math.round(najdluzsze * 10) / 10,
        prognoza_s: Math.round(prognoza),
        zalozenia: (k.zalozonaObjetosc
          ? ['Objętość wyjściowa nieznana — przyjęto ' + OBJETOSC_DOMYSLNA + ' km/tydz (świadomie w dół).']
          : []).concat(
          szczytTyg < Math.max.apply(null, objetosci) * 0.95
            ? ['Sufity jednostek (wybieganie do ' + doKroku(sufitWybiegania(k.d, k.obecna)) + ' km, akcent do ' + doKroku(sufitAkcentu(k.obecna)) +
               ' km) nie pozwalają rozłożyć pełnej objętości na ' + dni + ' dni — plan zadaje ' +
               Math.round(szczytTyg) + ' km/tydz w szczycie zamiast ' + Math.round(Math.max.apply(null, objetosci)) + '.']
            : []).concat(
          /* ⚠️ DRUGI WARUNEK, NIE ZAMIAST PIERWSZEGO — łapią różne rzeczy.
             Szczyt mówi „plan nie sięga tam, gdzie miał"; suma mówi „plan po
             drodze oddaje kilometry". Plan może mieć poprawny szczyt i tracić
             60 km w środku, albo obniżony szczyt bez ubytku gdzie indziej. */
          ubytekBudowy > luzSiatkiBudowy
            ? ['W fazie budowy plan zadaje ' + Math.round(faktBudowa) + ' km zamiast ' +
               Math.round(deklBudowa) + ' — o ' + Math.round(ubytekBudowy) + ' km mniej, niż wynika z jego własnej krzywej. ' +
               'Sufity jednostek nie pozwalają rozłożyć tej objętości na ' + dni + ' dni. ' +
               /* ⚠️ DRUGIE ZDANIE MA NIEŚĆ LICZBĘ, NIE WSPÓŁCZUCIE. Pierwsze mówi,
                  ILE plan traci; bez drugiego człowiek wie o stracie i nie wie,
                  co z nią zrobić — a to jest ta sama zasada, co przy ścieżkach
                  w odmowach. Gdy żadna liczba dni nie domyka, mówimy to WPROST,
                  zamiast milczeć: milczenie czyta się jak „da się, tylko ci nie
                  powiem". */
               (function () {
                 var ok = dniKtoreDomykaja(wejscie, dni);
                 return ok.length
                   ? 'Przy ' + listaDni(ok) + ' dniach plan dowiezie pełne ' + Math.round(deklBudowa) + ' km.'
                   : 'Żadna liczba dni od ' + MIN_DNI + ' do ' + MAX_DNI +
                     ' nie rozłoży tej objętości — plan zawsze odda część kilometrów.';
               })()]
            : []).concat(
          /* ⚠️ ZAŁOŻENIE, KTÓRE ROBI SIĘ FAŁSZYWE SAMO Z SIEBIE. Plan cofnięty
             do zawodów liczy się z objętości Z DZIŚ, a rusza za wiele tygodni.
             Silnik nie ma jak wiedzieć, co człowiek będzie biegał wtedy, więc
             ma o tym POWIEDZIEĆ, a nie udawać, że pytanie nie istnieje. */
          startOdroczony
            ? ['Plan rusza dopiero ' + fmtDataPl(k.idxPn) + ', a policzony jest z dzisiejszej objętości (' +
               Math.round(k.obecna) + ' km/tydz). Jeśli do tego czasu Twoja forma się zmieni — ułóż go wtedy jeszcze raz.']
            : [])
      }
    };
  }

  function trening(idx, dow, tydz, typ, km, tempo, tytul, opis) {
    return {
      date: isoZIdx(idx),
      day_of_week: dow,
      week_number: tydz,
      workout_type: typ,
      title: tytul || null,
      description: opis || OPISY[typ] || null,
      target_distance_km: km != null ? doKroku(km) : null,
      target_pace: tempo || null
    };
  }

  function typPlanu(tyg) {
    if (tyg <= 1) return 'weekly';
    if (tyg === 2) return 'micro';
    if (tyg <= 4) return 'meso';
    return 'macro';
  }

  /* ⚠️ TO ZDANIE OPISUJE PLAN, WIĘC MUSI SIĘ Z NIM ZGADZAĆ — trzy miejsca, w których
     się nie zgadzało, każde zmierzone na działającym silniku:

     1. „Objętość rośnie z 100 do 80 km/tydz" (5 km, 6 dni, baza 100). Słowo
        „rośnie" było wpisane na sztywno, a szczyt bywa NIŻSZY od bazy: sufity
        jednostek (sufitWybiegania, sufitAkcentu, spokojny ≤ wybieganie) nie pozwalają
        rozłożyć objętości mocnego zawodnika na krótkim dystansie. Przy bazie 60
        i piątce wychodziło „rośnie z 60 do 60".
     2. „Tempa liczone od Twojej dziesiątki (4:53/km)" przy podanym celu — 4:53
        pochodzi Z CELU, a jego dziesiątka to 5:00. Zdanie przypisywało historii
        liczbę wyprowadzoną z marzenia. Tak samo po kroku 4: człowiek podawał
        wynik na piątce, a zdanie mówiło o dziesiątce, której nigdy nie biegł.
     3. „Cel 30:00 przy prognozie 30:00" — patrz komentarz przy `prognoza`.

     Reguła: każda liczba w tym zdaniu ma mieć źródło w planie, nie w szablonie. */
  function podsumowanie(k, dni, szczyt, prognoza, we) {
    var od = Math.round(k.obecna), doKm = Math.round(szczyt);
    var objetosc = doKm > od
      ? 'Objętość rośnie z ' + od + ' do ' + doKm + ' km/tydz, co czwarty tydzień lżejszy.'
      : doKm < od
        ? 'Objętość schodzi z ' + od + ' do ' + doKm + ' km/tydz — sufity jednostek nie pozwalają rozłożyć więcej na ' + dni + ' dni.'
        : 'Objętość trzyma się ' + od + ' km/tydz, co czwarty tydzień lżejszy.';

    // Skąd NAPRAWDĘ wzięło się tempo, od którego liczą się wszystkie strefy.
    var wynik = we.poziom && we.poziom.wynik;
    var zrodlo = we.celCzasowy != null
      ? 'Tempa liczone z Twojego celu (' + fmtTempo(k.p10) + '/km na dziesiątce).'
      : (wynik && !(we.poziom.p10sec > 0)
          ? 'Tempa liczone z Twojego wyniku na ' + (Math.round(wynik.dystans_km * 10) / 10) +
            ' km (' + fmtTempo(k.p10) + '/km na dziesiątce).'
          : 'Tempa liczone od Twojej dziesiątki (' + fmtTempo(k.p10) + '/km).');

    var s = k.d.etykieta + ' za ' + k.tygodnie + ' tyg., ' + dni + ' dni biegania w tygodniu. ' +
      objetosc + ' ' + zrodlo;
    if (we.celCzasowy != null) {
      s += ' Cel ' + fmtCzas(we.celCzasowy) + ', a z obecnej formy wychodzi ' + fmtCzas(prognoza) + '.';
      /* ⚠️ CEL PONIŻEJ FORMY — JEDNO ZDANIE, NIE OSTRZEŻENIE.
         Silnik świadomie przepuszcza cel wolniejszy od prognozy (powrót po
         kontuzji, pacerowanie, bieg dla frajdy) i liczy z niego WSZYSTKIE tempa.
         Skutek: człowiek trenuje kilkanaście tygodni poniżej swoich możliwości.
         To bywa wybór — ale musi być wyborem widzianym, nie przeoczonym.
         Próg PROG_CELU_PONIZEJ_FORMY, nie „cokolwiek wolniej": różnica rzędu
         kilkunastu sekund mieści się w błędzie Riegla i zdanie byłoby szumem. */
      if (we.celCzasowy > prognoza * (1 + PROG_CELU_PONIZEJ_FORMY)) {
        s += ' Ten plan celuje niżej, niż wskazuje Twoja forma — świadomie, bo taki podałeś cel.';
      }
    }
    else s += ' Prognoza na dziś: ' + fmtCzas(prognoza) + '.';
    return s;
  }

  /* ═══ ADAPTACJA PLANU ════════════════════════════
     CZYSTA FUNKCJA, jak `uloz`. Nie zapisuje, nie czyta bazy, nie zna DOM-u —
     zwraca DECYZJĘ, co zrobić z planem. Zastosowanie (przepisanie przyszłych
     tygodni) należy do klienta, bo tylko on ma prawo pisać do bazy.

     ⚠️ HISTORIA JEST NIETYKALNA. Ta funkcja mówi wyłącznie, od jakiej objętości
     ma ruszyć PRZYSZŁOŚĆ. Klient musi to wymusić warunkiem `date > today` —
     deklaracja w komentarzu niczego nie broni. */

  /* PRÓG REAKCJI NA PRZERWĘ — z literatury, nie z osadu.
     Do 10 dni ubytek VO2max u wytrenowanych jest znikomy; ok. 15 dni to 4–7%,
     21 dni ~7%, i do 4 tygodni mechanizmem jest objętość osocza, która wraca
     szybko. Powyżej 4 tygodni wchodzą zmiany strukturalne, a Daniels mówi wprost:
     nie zakładaj starej formy, zmierz ją.
     Poziom powrotu 50% objętości sprzed przerwy jest zgodnie podawany przez
     źródła trenerskie dla przerw rzędu trzech tygodni (RunnersConnect,
     Laura Norris Running, Marathon Handbook — zebrane 17.08.2026). */
  var PRZERWA_BEZ_REAKCJI = 10;      // dni — poniżej nie ma czego cofać
  var PRZERWA_ZA_DLUGA    = 28;      // dni — powyżej ściana, nie przeliczanie
  /* ⚠️ 0,75 dla 10–13 dni to OSĄD — interpolacja między `nic` (literatura: do
     10 dni znikomy ubytek) a 50% (literatura: ok. trzech tygodni). Jedyna liczba
     w tej regule, której nie ma w źródłach. */
  var POWROT_KROTKA_PRZERWA = 0.75;
  var POWROT_DLUGA_PRZERWA  = 0.50;  // literatura
  /* ⚠️ ODBUDOWA IDZIE SZYBCIEJ NIŻ BUDOWA — i to nie jest niekonsekwencja.
     MAX_PRZYROST_TYG (8%) pilnuje BUDOWANIA nowej formy. Powrót do poziomu,
     który ciało już znało, źródła prowadzą po 10–20%/tydz. Dlatego dopóki
     objętość jest PONIŻEJ tej sprzed przerwy, wolno rosnąć szybciej — ale
     ani kroku powyżej starego poziomu tym tempem. */
  var PRZYROST_ODBUDOWY = 0.15;

  /* Progi wykonania 0,75 i 1,25. ZMIERZONE 17.08.2026 na 556 jednoznacznych
     parach plan↔log z biblioteki: mediana 1,001, w paśmie ±25% mieści się 80%
     wykonań, poniżej 75% jest 7%, powyżej 125% — 13%. */
  var DOLNY_PROG_WYKONANIA = 0.75;
  var GORNY_PROG_WYKONANIA = 1.25;
  /* ZMIERZONE 18.08.2026 — 242 zamknięte tygodnie planowe, 22 zawodników,
     11.05–17.08.2026. Wcześniej stał tu osąd („jeden słaby tydzień to nie
     sygnał"); dwójka się obroniła, ale NIE z tego powodu, który zakładałem.

     1) DRUGI TYDZIEŃ NIE POPRAWIA TRAFNOŚCI. Prawdopodobieństwo, że kolejny
        tydzień też będzie słaby (<75% planu):
              baza          0,388   (n=242)
              po 1 słabym   0,575   (n=73)
              po 2 słabych  0,588   (n=34)
              po 3 słabych  0,588   (n=17)
        Sygnał nasyca się PO PIERWSZYM tygodniu. Przyrost 1→2 to 1,3 pkt proc.
        przy n=34, czyli głęboko w szumie — tych wartości nie da się rozróżnić.
        ⚠️ Nie wolno więc mówić „czekamy 2 tygodnie, bo wtedy wiemy lepiej".
        Wiemy tyle samo. Reguła myli się w ~4 przypadkach na 10 niezależnie
        od N i to jest właściwość progu 0,75 na tygodniowym stosunku, nie
        długości okna.

     2) DWÓJKA BRONI SIĘ STABILNOŚCIĄ, NIE TRAFNOŚCIĄ. Symulacja tego automatu
        na tej samej serii (wejście po N słabych, wyjście po N czystych,
        cel skalowany w obniżce) — liczba zmian stanu:
              N=1  92 zmiany   32,2% tygodni w obniżce   → stan co ~2,6 tyg
              N=2  28 zmian    24,8%                     → stan co ~8,6 tyg
              N=3  11 zmian    18,2%                     → stan co ~22 tyg
              N=4   4 wejścia, ZERO wyjść                 8,3%
        N=1 daje plan, który skacze w górę i w dół co dwa–trzy tygodnie —
        to przestaje być plan. N=2 jest NAJMNIEJSZYM oknem, które tego nie robi.
        ⚠️ ZERA WYJŚĆ PRZY N=4 NIE WOLNO CZYTAĆ JAKO „N=4 NIE WYPUSZCZA".
        Wyjście wymaga N czystych tygodni z rzędu, a przy bazowym p=0,388 daje
        to (1−p)^4 ≈ 14% szansy na jedno wejście. Przy zaobserwowanych czterech
        wejściach prawdopodobieństwo, że ŻADNE się nie zakończy, wynosi ~55% —
        czyli zero wyjść jest tu zwyczajnie spodziewane i nie dowodzi niczego.
        Ten rachunek robi za nas `tools/pomiar-tygodni-reakcji.js`.

     ⚠️ CZYM TO NAPRAWDĘ ZMIERZONO — czytać, zanim ktoś podniesie te liczby do
     rangi dowodu. To są plany TRENERSKIE i AI, bo planów z generatora jest
     ZERO (nikt go jeszcze nie użył). Zakładamy więc, że trzymanie się planu
     trenera zachowuje się jak trzymanie się planu generatora. To wskaźnik
     zastępczy, nie ten sam pomiar (LEKCJE #11). Przeliczyć, gdy pojawi się
     kilkanaście planów z generatora — skrypt: tools/pomiar-tygodni-reakcji.js. */
  var TYGODNI_DO_REAKCJI   = 2;
  var OBNIZKA_PRZY_NIEDOWYKONANIU = 0.80;

  function fmtKm(x) { return Math.round(x * 10) / 10; }

  /* ── CZYJ JEST TEN TYDZIEŃ ─────────────────────────────────────────────────
     Adaptacja wolno przeliczać WYŁĄCZNIE własne treningi. `plan_source` mówi,
     kto zaplanował wpis: 'generator' to nasz, 'coach' to trenerski, NULL to
     trenerski sprzed wprowadzenia kolumny ALBO nasz PO EDYCJI przez trenera
     (edycja zeruje znacznik — celowo). Wszystko poza 'generator' jest cudze.

     ⚠️ TYDZIEŃ Z CUDZYM WPISEM ODPADA W CAŁOŚCI, nie częściowo. Rozważane było
     przeliczanie proporcjonalne tylko swoich jednostek i zostało odrzucone:
     przy 3 jednostkach generatora i 1 trenerskiej obniżka o 20% zdejmuje
     kilometry wyłącznie z naszej trójki, a trenerska zostaje pełna — wychodzi
     tydzień, którego nikt nie zaprojektował, ani my, ani trener. Trener WIDZIAŁ
     ten tydzień, więc jego decyzja jest świeższa niż nasza reguła.

     ⚠️ KLASA BŁĘDU: „dwa systemy piszą do tej samej tabeli". Wróci przy każdej
     przyszłej zmianie adaptacji, dlatego reguła stoi TUTAJ, jako czysta funkcja
     z testami, a nie jako warunek wpleciony w zapytanie w zawodnik.html. */
  function tydzienNalezyDoNas(wpisy) {
    if (!wpisy || !wpisy.length) return true;      // pusty tydzień nie jest cudzy
    for (var i = 0; i < wpisy.length; i++) {
      var zr = wpisy[i] && wpisy[i].plan_source;
      if (zr !== 'generator') return false;
    }
    return true;
  }

  function oceniAdaptacje(we) {
    var dzis = we.today, ostatni = we.ostatniLog;
    var bazaPlanu = we.bazaPlanu > 0 ? we.bazaPlanu : 0;
    var tyg = we.tygodnie || [];

    var dniPrzerwy = (ostatni && poprawnaData(ostatni) && poprawnaData(dzis))
      ? (dzienIdx(dzis) - dzienIdx(ostatni)) : 0;

    if (dniPrzerwy >= PRZERWA_ZA_DLUGA) {
      return { akcja: 'sciana', powod: 'przerwa_za_dluga', dniPrzerwy: dniPrzerwy,
        komunikat: 'Nie biegałeś od ' + dniPrzerwy + ' dni. Po takiej przerwie nie zgaduję ' +
          'Twojej formy — przebiegnij coś na czas i ułóż plan od nowa.' };
    }
    if (dniPrzerwy >= PRZERWA_BEZ_REAKCJI) {
      var udzial = dniPrzerwy < 14 ? POWROT_KROTKA_PRZERWA : POWROT_DLUGA_PRZERWA;
      var od = fmtKm(bazaPlanu * udzial);
      return { akcja: 'cofnij', powod: 'przerwa', dniPrzerwy: dniPrzerwy,
        odKm: od, zamiastKm: fmtKm(bazaPlanu), przyrostOdbudowy: PRZYROST_ODBUDOWY,
        komunikat: 'Po ' + dniPrzerwy + ' dniach przerwy objętość wraca od ' + od +
          ' km/tydz zamiast ' + fmtKm(bazaPlanu) + '. Do poprzedniego poziomu wróci stopniowo.' };
    }

    var ostatnieTyg = tyg.slice(-TYGODNI_DO_REAKCJI);
    if (ostatnieTyg.length < TYGODNI_DO_REAKCJI) return { akcja: 'brak', powod: 'za_malo_danych' };

    var ponizej = 0, powyzej = 0, opuszczoneRazem = 0;
    for (var i = 0; i < ostatnieTyg.length; i++) {
      var t = ostatnieTyg[i];
      var st = t.planKm > 0 ? (t.wykonaneKm / t.planKm) : 1;
      if (st < DOLNY_PROG_WYKONANIA) ponizej++;
      if (st > GORNY_PROG_WYKONANIA) powyzej++;
      opuszczoneRazem += Math.max(0, (t.jednostekPlan || 0) - (t.jednostekZrobionych || 0));
    }

    /* ⚠️ WYJŚCIE Z OBNIŻKI STOI PRZED WEJŚCIEM W NIĄ — inaczej jedno słabsze
       okno obniżałoby plan na zawsze. Kto przez TYGODNI_DO_REAKCJI wykonuje
       obniżony plan W CAŁOŚCI, wraca do normalnego tempa progresji. */
    if (we.wObnizce && ponizej === 0) {
      return { akcja: 'przywroc', powod: 'wykonuje_obnizony',
        komunikat: 'Od dwóch tygodni wyrabiasz plan w całości — progresja wraca do normalnego tempa.' };
    }

    if (ponizej >= TYGODNI_DO_REAKCJI) {
      var srednioOpuszczonych = opuszczoneRazem / ostatnieTyg.length;
      if (srednioOpuszczonych >= 2) {
        return { akcja: 'mniej_dni', powod: 'opuszcza_jednostki',
          opuszczoneNaTydzien: Math.round(srednioOpuszczonych * 10) / 10,
          komunikat: 'Od dwóch tygodni odpadają średnio ' + (Math.round(srednioOpuszczonych * 10) / 10) +
            ' treningi w tygodniu. Plan zejdzie o jeden dzień biegania — lepiej zrobić mniej w całości niż więcej w połowie.' };
      }
      var noweKm = fmtKm(bazaPlanu * OBNIZKA_PRZY_NIEDOWYKONANIU);
      return { akcja: 'obniz', powod: 'niedowykonanie', doKm: noweKm, zKm: fmtKm(bazaPlanu),
        komunikat: 'Od dwóch tygodni biegasz mniej, niż zakłada plan. Objętość schodzi z ' +
          fmtKm(bazaPlanu) + ' na ' + noweKm + ' km/tydz — wróci, gdy zaczniesz wyrabiać.' };
    }

    if (powyzej >= TYGODNI_DO_REAKCJI) {
      /* ⚠️ ŚWIADOMIE NIE PODNOSIMY PLANU. Zmierzone: przebieganie planu (13%
         wykonań) jest prawie DWA RAZY częstsze niż niedobieganie (7%) — reguła
         reagująca na nadwykonanie odzywałaby się nieustannie. Groźniejsze:
         automatyczne podnoszenie dałoby obejście MAX_PRZYROST_TYG — wystarczy
         biegać więcej, żeby plan pozwolił biegać jeszcze więcej. */
      return { akcja: 'tylko_powiedz', powod: 'nadwykonanie',
        komunikat: 'Od dwóch tygodni biegasz wyraźnie więcej, niż zakłada plan. ' +
          'Plan sam tego nie podniesie — jeśli chcesz wyżej, ułóż go od nowa, ' +
          'weźmie Twoją obecną objętość.' };
    }

    return { akcja: 'brak', powod: 'plan_wykonywany' };
  }

  // ── EKSPORT ────────────────────────────────────────────────────────────────
  var API = {
    uloz: uloz,
    oceniAdaptacje: oceniAdaptacje,
    STREFY: STREFY,
    DYSTANSE: DYSTANSE,
    LIMITY: { MAX_POPRAWA: MAX_POPRAWA, MAX_PRZYROST_TYG: MAX_PRZYROST_TYG,
              MIN_DNI: MIN_DNI, MAX_DNI: MAX_DNI, MARATON_MIN_DNI: MARATON_MIN_DNI,
              OBJETOSC_DOMYSLNA: OBJETOSC_DOMYSLNA, ZRZUT: ZRZUT, ZRZUT_CO: ZRZUT_CO,
              MNOZNIK_SZCZYTU: MNOZNIK_SZCZYTU, MNOZNIK_NA_TYDZIEN: MNOZNIK_NA_TYDZIEN,
              MNOZNIK_SZCZYTU_CAP: MNOZNIK_SZCZYTU_CAP, ROZGRZEWKA: ROZGRZEWKA, SCHLODZENIE: SCHLODZENIE, ODCINEK_M: ODCINEK_M,
              DLUGIE_NAD_SPOKOJNYM: DLUGIE_NAD_SPOKOJNYM, MAX_ODCINKOW: MAX_ODCINKOW, MAX_JAKOSC_W_TYG: MAX_JAKOSC_W_TYG,
              MAX_TEMPO_KM: MAX_TEMPO_KM, MAX_TEMPO_MIN: MAX_TEMPO_MIN,
              START_POD_BAZA: START_POD_BAZA, SZCZYT_NAD_BAZA: SZCZYT_NAD_BAZA,
              MIN_TYG_BUDOWY: MIN_TYG_BUDOWY, MAX_TYGODNI: MAX_TYGODNI },
    /* Wystawione, bo klient MUSI wiedzieć, ile tygodni pobrać z bazy, żeby
       `oceniAdaptacje` miało z czego liczyć. Bez tego eksportu liczba 2 wylądowałaby
       przepisana w zawodnik.html i rozjechałaby się przy pierwszej zmianie tutaj. */
    LIMITY_ADAPTACJI: { TYGODNI_DO_REAKCJI: TYGODNI_DO_REAKCJI,
              PRZERWA_BEZ_REAKCJI: PRZERWA_BEZ_REAKCJI, PRZERWA_ZA_DLUGA: PRZERWA_ZA_DLUGA,
              DOLNY_PROG_WYKONANIA: DOLNY_PROG_WYKONANIA, GORNY_PROG_WYKONANIA: GORNY_PROG_WYKONANIA,
              OBNIZKA_PRZY_NIEDOWYKONANIU: OBNIZKA_PRZY_NIEDOWYKONANIU },
    ZAMKNIECIE: ZAMKNIECIE,
    tydzienNalezyDoNas: tydzienNalezyDoNas,
    MIN_JEDNOSTKI_KM: MIN_JEDNOSTKI_KM,
    mnoznikSzczytu: mnoznikSzczytu,
    maxPrzyrostDla: maxPrzyrostDla,
    sufitWybiegania: sufitWybiegania, sufitAkcentu: sufitAkcentu,
    SUFIT_DLUGIE_UDZIAL_BAZY: SUFIT_DLUGIE_UDZIAL_BAZY, SUFIT_DLUGIE_CAP: SUFIT_DLUGIE_CAP,
    SUFIT_TEMPO_UDZIAL_BAZY: SUFIT_TEMPO_UDZIAL_BAZY, SUFIT_TEMPO_CAP: SUFIT_TEMPO_CAP,
    sanityCzasu: sanityCzasu,
    _sprawdzSciane: sprawdzSciane,
    _riegel: riegel,
    _p10ZWyniku: p10ZWyniku,
    _prognozaCzasu: prognozaCzasu,
    _tempoStrefy: tempoStrefy,
    _fmtTempo: fmtTempo,
    _fmtCzas: fmtCzas,
    _objetosciTygodni: objetosciTygodni,
    _jednostkaJakosci: jednostkaJakosci,
    _liczbaOdcinkow: liczbaOdcinkow,
    _ulozTydzien: ulozTydzien,
    _najblizszyPoniedzialek: najblizszyPoniedzialek,
    _dzienIdx: dzienIdx,
    _isoZIdx: isoZIdx
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.GeneratorPlanu = API;

  // ── SELF-TEST (Node: `node js/generator-planu.js`) ──────────────────────────
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    runSelfTest();
  }

  function runSelfTest() {
    var pass = 0, fail = 0;
    function check(nazwa, cond, got) {
      if (cond) { pass++; console.log('  ✓ ' + nazwa); }
      else { fail++; console.log('  ✗ ' + nazwa + '  → got: ' + JSON.stringify(got)); }
    }
    function sekcja(t) { console.log('\n' + t); }

    var TODAY = '2026-08-10';                       // poniedziałek
    function zaTygodni(n) { return isoZIdx(dzienIdx(TODAY) + n * 7); }

    function we(o) {
      return Object.assign({
        dystans: '10k', dataStartu: zaTygodni(10), dniWTygodniu: 4, today: TODAY,
        poziom: { p10sec: 300, wynik: null, objetoscTygodniowa: 30 }, celCzasowy: null
      }, o);
    }
    function poziom(o) { return Object.assign({ p10sec: 300, wynik: null, objetoscTygodniowa: 30 }, o); }

    console.log('Generator planu — self-test');

    /* ══════════ ŚCIANA — odmowy. To jest właściwy przedmiot testów. ══════════ */
    // zaTygodni(n) daje DOKŁADNIE n tygodni planu: start liczy się od najbliższego
    // poniedziałku PO dniu odniesienia, więc (n*7 - 7)/7 + 1 = n.
    sekcja('ŚCIANA — za mało tygodni');
    check('kontrola samego helpera: zaTygodni(10) to 10 tygodni',
      uloz(we({ dataStartu: zaTygodni(10) })).meta.tygodnie === 10, null);
    [['5k', 4], ['10k', 6], ['half', 10], ['marathon', 16]].forEach(function (c) {
      var r = uloz(we({ dystans: c[0], dataStartu: zaTygodni(c[1] - 1), dniWTygodniu: 5,
                        poziom: poziom({ objetoscTygodniowa: 60 }) }));
      check(c[0] + ': ' + (c[1] - 1) + ' tyg. odbite (min ' + c[1] + ')',
        r.ok === false && r.sciana.kod === 'ZA_MALO_TYGODNI' && r.sciana.szczegoly.tygodnieDostepne === c[1] - 1,
        r.ok ? 'PRZESZLO' : r.sciana);
      /* ⚠️ GRANICA ZALEŻY OD DNIA TYGODNIA, W KTÓRYM SĄ ZAWODY — i to nie jest
         niedoróbka testu, tylko realna reguła, którą wcześniej ten test ukrywał.
         `zaTygodni(n)` daje start w PONIEDZIAŁEK, więc taperTyg = taper + 1
         (tydzień z zawodami w poniedziałek to jeden dzień, nie tydzień taperu).
         Po dołożeniu bramki MIN_TYG_BUDOWY prawdziwe minimum to:
             max(minTygodni, MIN_TYG_BUDOWY + taperTyg)
         Dla piątki przy starcie w poniedziałek wychodzi 5, nie 4 — bo przy 4
         zostawały DWA tygodnie budowania i połowa planu była wyciszaniem.
         Dla pozostałych dystansów minTygodni i tak jest wyższe, więc nic
         się nie zmienia. Test sprawdza teraz OBA warianty dnia startu. */
      var taperTu = DYSTANSE[c[0]].taper + 1;                    // start w poniedziałek
      var minTu = Math.max(c[1], MIN_TYG_BUDOWY + taperTu);
      var g = uloz(we({ dystans: c[0], dataStartu: zaTygodni(minTu), dniWTygodniu: 5,
                        poziom: poziom({ objetoscTygodniowa: 60 }) }));
      check(c[0] + ': ' + minTu + ' tyg. przy starcie w PONIEDZIAŁEK przechodzi (granica)',
        g.ok === true && g.meta.tygodnie === minTu, g.ok ? g.meta.tygodnie : g.sciana);
      check(c[0] + ': ' + minTu + ' tyg. zostawia >= ' + MIN_TYG_BUDOWY + ' tyg. budowania',
        g.ok === true && (g.meta.tygodnie - g.meta.taperTygodni) >= MIN_TYG_BUDOWY,
        g.ok ? [g.meta.tygodnie, g.meta.taperTygodni] : g.sciana);
      if (minTu > c[1]) {
        var kr = uloz(we({ dystans: c[0], dataStartu: zaTygodni(minTu - 1), dniWTygodniu: 5,
                           poziom: poziom({ objetoscTygodniowa: 60 }) }));
        check(c[0] + ': ' + (minTu - 1) + ' tyg. odbite, bo zostałyby < ' + MIN_TYG_BUDOWY + ' tyg. budowania',
          kr.ok === false && kr.sciana.kod === 'ZA_MALO_TYGODNI' && kr.sciana.szczegoly.budowaTygodni < MIN_TYG_BUDOWY,
          kr.ok ? 'PRZESZLO' : kr.sciana);
      }
    });

    sekcja('ŚCIANA — maraton przy 3 dniach');
    var mar3 = uloz(we({ dystans: 'marathon', dniWTygodniu: 3, dataStartu: zaTygodni(20),
                         poziom: poziom({ objetoscTygodniowa: 60 }) }));
    check('maraton + 3 dni odbite', mar3.ok === false && mar3.sciana.kod === 'MARATON_PRZY_3_DNIACH', mar3.ok ? 'PRZESZLO' : mar3.sciana);
    var mar4 = uloz(we({ dystans: 'marathon', dniWTygodniu: 4, dataStartu: zaTygodni(20),
                         poziom: poziom({ objetoscTygodniowa: 60 }) }));
    check('maraton + 4 dni przechodzi (granica)', mar4.ok === true, mar4.ok ? null : mar4.sciana);
    var half3 = uloz(we({ dystans: 'half', dniWTygodniu: 3, dataStartu: zaTygodni(14),
                          poziom: poziom({ objetoscTygodniowa: 45 }) }));
    check('półmaraton + 3 dni PRZECHODZI (reguła dotyczy tylko maratonu)', half3.ok === true, half3.ok ? null : half3.sciana);

    sekcja('ŚCIANA — skok objętości');
    // Ściana mierzy TEMPO narastania, nie próg jednorazowy: (szczyt/obecna)^(1/tyg budowy)-1.
    // Krótkie plany nie mają jak dojść do szczytu i dlatego się odbijają.
    var skok = uloz(we({ dystans: '10k', dniWTygodniu: 4, dataStartu: zaTygodni(6),
                         poziom: poziom({ objetoscTygodniowa: 20 }) }));
    check('20 km/tydz + 10 km w 6 tyg. odbite', skok.ok === false && skok.sciana.kod === 'SKOK_OBJETOSCI', skok.ok ? 'PRZESZLO' : skok.sciana);
    check('odmowa niesie liczby (obecna/peak/przyrost)',
      skok.ok === false && skok.sciana.szczegoly.obecna_km === 20 && skok.sciana.szczegoly.peak_km === 32
      && skok.sciana.szczegoly.przyrostProc > 8, skok.sciana && skok.sciana.szczegoly);
    /* Było `zaTygodni(4)` — od czasu bramki MIN_TYG_BUDOWY piątka na 4 tygodnie
       ze startem w poniedziałek pada WCZEŚNIEJ, na ZA_MALO_TYGODNI, i ten test
       przestawał sprawdzać to, po co powstał (skok objętości). Pięć tygodni to
       najkrótszy plan, który przechodzi bramkę tygodni, więc dopiero na nim widać,
       czy ściana narastania nadal się odzywa. */
    var skok5 = uloz(we({ dystans: '5k', dniWTygodniu: 4, dataStartu: zaTygodni(5),
                          poziom: poziom({ objetoscTygodniowa: 20 }) }));
    check('20 km/tydz + 5 km w 5 tyg. odbite (skok objętości, nie brak tygodni)',
      skok5.ok === false && skok5.sciana.kod === 'SKOK_OBJETOSCI', skok5.ok ? 'PRZESZLO' : skok5.sciana);
    var ok40 = uloz(we({ dystans: 'marathon', dniWTygodniu: 5, dataStartu: zaTygodni(18),
                         poziom: poziom({ objetoscTygodniowa: 45 }) }));
    check('45 km/tydz + maraton w 18 tyg. przechodzi', ok40.ok === true, ok40.ok ? null : ok40.sciana);
    var brakObj = uloz(we({ dystans: '10k', dniWTygodniu: 4, dataStartu: zaTygodni(6),
                            poziom: poziom({ objetoscTygodniowa: null }) }));
    check('brak objętości NIE jest zgadywany w górę — floor 20 km odbija 10 km w 6 tyg.',
      brakObj.ok === false && brakObj.sciana.kod === 'SKOK_OBJETOSCI' && brakObj.sciana.szczegoly.objetoscZalozona === true,
      brakObj.ok ? 'PRZESZLO' : brakObj.sciana);

    // Skrót do najdłuższego wybiegania w planie
    function najdluzszeW(r) {
      return r.ok ? Math.max.apply(null, r.treningi
        .filter(function (w) { return w.workout_type === 'Wybieganie'; })
        .map(function (w) { return w.target_distance_km; })) : null;
    }

    sekcja('ŚCIANA — za mała baza (dziura po suficie obecna×1.6, ZAMKNIĘTA)');
    var mar20 = uloz(we({ dystans: 'marathon', dniWTygodniu: 5, dataStartu: zaTygodni(16),
                          poziom: poziom({ objetoscTygodniowa: 20 }) }));
    check('maraton z 20 km/tydz → ZA_MALA_BAZA (wcześniej PRZECHODZIŁ)',
      mar20.ok === false && mar20.sciana.kod === 'ZA_MALA_BAZA', mar20.ok ? 'PRZESZLO' : mar20.sciana);
    /* ⚠️ 26, NIE 29 — od 24.08.2026 wymagana baza liczy się z mnożnika zależnego
       od horyzontu (przy 16 tygodniach 1,76), więc TA liczba nie może być wpisana
       na sztywno. Wyprowadzamy ją z tego samego wzoru, którego użył silnik:
       gdyby ktoś zmienił mnożnik, test ma iść za nim, a nie zgasnąć na 29. */
    check('odmowa niesie drogę wyjścia: ile trzeba biegać',
      mar20.sciana.szczegoly.wymaganaBaza_km === Math.ceil(45 / mnoznikSzczytu(16))
      && mar20.sciana.szczegoly.minSzczyt_km === 45,
      mar20.sciana.szczegoly);
    /* ⚠️ ZDANIE „Zbuduj bazę do ~29 km/tydz" ZNIKŁO Z KOMUNIKATU 18.08.2026
       i to było celowe. Podawało liczbę odległą (baza pod maraton), a chowało
       tę bliską — że przy 20 km/tydz dziesiątka jest gotowa OD RAZU. Liczba
       nie zginęła: `wymaganaBaza_km` nadal jedzie w `szczegoly` i asercja
       linijkę wyżej jej pilnuje. Zmieniła się treść, nie zawartość. */
    check('komunikat zawiera liczby, nie samo „nie da się"',
      /20 km\/tydz/.test(mar20.sciana.komunikat) && /45 km\/tydz/.test(mar20.sciana.komunikat)
      && /Najbliżej masz półmaraton/.test(mar20.sciana.komunikat), mar20.sciana.komunikat);
    var half15 = uloz(we({ dystans: 'half', dniWTygodniu: 4, dataStartu: zaTygodni(10),
                           poziom: poziom({ objetoscTygodniowa: 15 }) }));
    check('półmaraton z 15 km/tydz → odbite', half15.ok === false && half15.sciana.kod === 'ZA_MALA_BAZA',
      half15.ok ? 'PRZESZLO' : half15.sciana);
    /* ⚠️ MNOŻNIK ZALEŻY OD HORYZONTU (24.08.2026), więc próg TEŻ. `TODAY` jest
       poniedziałkiem, więc zaTygodni(n) daje dokładnie n tygodni planu i ten sam
       n można podać mnoznikSzczytu(). Gdyby stało tu stałe 1,6, test liczyłby
       próg z reguły, której silnik już nie stosuje. */
    check('próg ZA_MALA_BAZA liczony z minSzczyt / mnoznikSzczytu(tygodnie) dla każdego dystansu',
      ['5k', '10k', 'half', 'marathon'].every(function (dy) {
        var d = DYSTANSE[dy], graniczna = d.minSzczyt / mnoznikSzczytu(d.minTygodni + 6);
        var pod = uloz(we({ dystans: dy, dniWTygodniu: 5, dataStartu: zaTygodni(d.minTygodni + 6),
                            poziom: poziom({ objetoscTygodniowa: graniczna - 0.5 }) }));
        var nad = uloz(we({ dystans: dy, dniWTygodniu: 5, dataStartu: zaTygodni(d.minTygodni + 6),
                            poziom: poziom({ objetoscTygodniowa: graniczna + 0.5 }) }));
        return pod.ok === false && pod.sciana.kod === 'ZA_MALA_BAZA'
            && !(nad.ok === false && nad.sciana.kod === 'ZA_MALA_BAZA');
      }), null);

    sekcja('ŚCIANA — za krótkie wybieganie (bramka niezależna od objętości)');
    var mar29 = uloz(we({ dystans: 'marathon', dniWTygodniu: 5, dataStartu: zaTygodni(16),
                          poziom: poziom({ objetoscTygodniowa: 29 }) }));
    check('maraton z 29 km/tydz przechodzi ZA_MALA_BAZA, ale ginie na wybieganiu',
      mar29.ok === false && mar29.sciana.kod === 'ZA_KROTKIE_WYBIEGANIE', mar29.ok ? 'PRZESZLO' : mar29.sciana);
    check('odmowa podaje ile km trzeba dobiec i ile to % dystansu',
      mar29.sciana.szczegoly.wymagane_km === 23.2 && mar29.sciana.szczegoly.procDystansu === 55
      && mar29.sciana.szczegoly.wymaganaBaza_km === 33, mar29.sciana.szczegoly);
    /* ⚠️ BRZEG PRZESUNĄŁ SIĘ Z 36/37 NA 32/33 (24.08.2026) — mnożnik przy
       18 tygodniach to 1,78 zamiast 1,6, więc te same bazy sięgają wyżej.
       Sprawdzamy PARĘ sąsiednich wartości, bo testem jest tu istnienie ostrego
       progu, nie konkretna liczba: ostatnia odbita i pierwsza przechodząca. */
    var mar32 = uloz(we({ dystans: 'marathon', dniWTygodniu: 5, dataStartu: zaTygodni(18),
                          poziom: poziom({ objetoscTygodniowa: 32 }) }));
    check('maraton z 32 km/tydz nadal odbity (tuż pod progiem)',
      mar32.ok === false && mar32.sciana.kod === 'ZA_KROTKIE_WYBIEGANIE', mar32.ok ? 'PRZESZLO' : mar32.sciana);
    var mar33 = uloz(we({ dystans: 'marathon', dniWTygodniu: 5, dataStartu: zaTygodni(18),
                          poziom: poziom({ objetoscTygodniowa: 33 }) }));
    check('maraton z 33 km/tydz PRZECHODZI (pierwsza wartość, która przechodzi)', mar33.ok === true,
      mar33.ok ? null : mar33.sciana);
    check('…i jego najdłuższe wybieganie sięga ≥ 23 km', najdluzszeW(mar33) >= 23, najdluzszeW(mar33));
    check('KAŻDY wygenerowany plan spełnia próg wybiegania',
      [['5k', 6, 4, 25], ['10k', 8, 4, 30], ['half', 12, 4, 40], ['marathon', 18, 5, 45],
       ['marathon', 20, 6, 90], ['half', 16, 3, 30]].every(function (c) {
        var rr = uloz(we({ dystans: c[0], dataStartu: zaTygodni(c[1]), dniWTygodniu: c[2],
                           poziom: poziom({ objetoscTygodniowa: c[3] }) }));
        return rr.ok && najdluzszeW(rr) >= DYSTANSE[c[0]].minDlugieProc * DYSTANSE[c[0]].km - 0.05;
      }), null);
    sekcja('CEL CZASOWY — ściana, tempa i przypadki brzegowe');
    /* Forma 3:40 w maratonie → prognoza 13200 s. Przy 18 tygodniach limit wynosi
       18 × 0,75% = 13,5%, więc realny cel to 13200 × 0,865 = 11418 s = 3:10:18.
       ⚠️ DO 18.08.2026 STAŁO TU 12144 s (3:22:24) I TO BYŁ ŚLAD PO USTERCE:
       limit był stały (8%), więc ta sama odpowiedź wychodziła przy 11 i przy 300
       tygodniach. Test przepisany świadomie — zmieniła się reguła, nie pomiar. */
    var p10_340 = (function () {
      // szukamy p10, dla którego prognoza maratonu ≈ 3:40:00
      var lo = 150, hi = 600;
      for (var it = 0; it < 40; it++) {
        var mid = (lo + hi) / 2;
        if (prognozaCzasu(mid, DYSTANSE.marathon.km) < 13200) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    })();
    var celMar = function (celSek) {
      return uloz(we({ dystans: 'marathon', dniWTygodniu: 5, dataStartu: zaTygodni(18),
                       poziom: poziom({ p10sec: p10_340, objetoscTygodniowa: 70 }),
                       celCzasowy: celSek }));
    };
    var c300 = celMar(3 * 3600);
    check('maraton 3:00 przy formie 3:40 → CEL_ZA_AMBITNY',
      c300.ok === false && c300.sciana.kod === 'CEL_ZA_AMBITNY', c300.ok ? 'PRZESZLO' : c300.sciana.kod);
    check('…i podaje realny cel ≈ 3:10 (18 tyg × 0,75% = 13,5%)',
      c300.ok === false && Math.abs(c300.sciana.szczegoly.celRealny_s - 11418) < 60,
      c300.ok ? null : c300.sciana.szczegoly.celRealny_s);
    check('…a komunikat NIESIE tę liczbę, nie tylko odmowę',
      c300.ok === false && /3:1\d:\d\d/.test(c300.sciana.komunikat), c300.ok ? null : c300.sciana.komunikat);

    /* ⚠️ BLIZNA: TEN SAM CEL, DWA HORYZONTY → DWIE RÓŻNE ODPOWIEDZI.
       Zgłoszenie Maćka 17.08.2026: przy 113 tygodniach generator odmawiał celu
       zdaniem „potrzebujesz kilku sezonów, nie 113 tygodni" — a 113 tygodni TO SĄ
       dwa sezony. Powód: `tygodnie` trafiało wyłącznie do treści komunikatu,
       nigdy do decyzji. Ten test odpada, jeśli ktoś kiedyś znów odetnie limit
       od horyzontu — bo wtedy obie odpowiedzi znów będą identyczne. */
    var celMarTyg = function (celSek, tyg) {
      return uloz(we({ dystans: 'marathon', dniWTygodniu: 5, dataStartu: zaTygodni(tyg),
                       poziom: poziom({ p10sec: p10_340, objetoscTygodniowa: 70 }),
                       celCzasowy: celSek }));
    };
    /* 16, nie 12 — przy 12 tygodniach maraton pada wcześniej na ZA_MALO_TYGODNI
       i test mierzyłby wtedy zupełnie inną ścianę. */
    check('limit poprawy ZALEŻY od liczby tygodni (16 vs 30 → inny realny cel)',
      (function () {
        var a = celMarTyg(3 * 3600, 16), b = celMarTyg(3 * 3600, 30);
        return a.ok === false && b.ok === false &&
               a.sciana.szczegoly.celRealny_s > b.sciana.szczegoly.celRealny_s + 300;
      })(), null);
    check('…a komunikat przy KRÓTKIM horyzoncie mówi, ILE tygodni potrzeba',
      (function () {
        var a = celMarTyg(3 * 3600, 16);
        return a.ok === false && a.sciana.szczegoly.przySuficie === false &&
               /potrzeba ok\. \d+ tygodni/.test(a.sciana.komunikat);
      })(), null);
    check('…a przy suficie 15% NIE obiecuje, że wystarczy poczekać',
      (function () {
        var a = celMarTyg(Math.round(13200 * 0.75), 100);   // 25% poprawy, 100 tyg
        return a.ok === false && a.sciana.szczegoly.przySuficie === true &&
               /nie/.test(a.sciana.komunikat) && !/potrzeba ok\./.test(a.sciana.komunikat);
      })(), null);
    check('sufit 15% jest TWARDY — 300 tygodni nie podnosi limitu',
      Math.abs(maxPoprawaDla(300) - 0.15) < 1e-9 && Math.abs(maxPoprawaDla(20) - 0.15) < 1e-9,
      [maxPoprawaDla(300), maxPoprawaDla(20)]);
    var c330 = celMar(3 * 3600 + 30 * 60);
    check('maraton 3:30 przy formie 3:40 → przechodzi', c330.ok === true, c330.ok ? null : c330.sciana);

    /* Cel WOLNIEJSZY — bez progu i bez komentarza, w każdym przypadku. */
    var cWolny = celMar(4 * 3600);
    check('cel wolniejszy od formy → przechodzi', cWolny.ok === true, cWolny.ok ? null : cWolny.sciana);
    check('cel wolniejszy → tempa SĄ z celu (plan spokojniejszy)',
      cWolny.ok && cWolny.meta.tempaZCelu === true && cWolny.meta.p10sec > cWolny.meta.p10sec_forma,
      cWolny.ok ? [cWolny.meta.p10sec, cWolny.meta.p10sec_forma] : null);

    /* Granica: dokładnie limit przechodzi (warunek to >, nie >=).
       Przy 18 tygodniach limit = 13,5%; liczymy go z funkcji, nie z liczby
       przepisanej ręcznie — inaczej test przestaje pilnować reguły. */
    var progn = prognozaCzasu(p10_340, DYSTANSE.marathon.km);
    var lim18 = maxPoprawaDla(18);
    // ceil, nie round — zaokrąglenie w dół zepchnęłoby cel o ułamek ZA próg
    check('dokładnie limit poprawy → przechodzi', celMar(Math.ceil(progn * (1 - lim18))).ok === true, null);
    check('limit + 0,5 pp → odbite', (function () {
      var r = celMar(Math.round(progn * (1 - lim18 - 0.005)));
      return r.ok === false && r.sciana.kod === 'CEL_ZA_AMBITNY';
    })(), null);

    /* Sanity stoi PRZED ścianą, ale ZMIERZONA granica leży niżej, niż mogłoby się
       wydawać: cel 2:00 w maratonie daje p10 = 2:37/km, a próg sanity to 2:30/km —
       przechodzi o 6,5 s/km i ląduje na ścianie CEL_ZA_AMBITNY. To NIE jest błąd:
       2:37/km na 10 km to tempo rekordu świata, a próg jest celowo nisko, żeby nie
       odrzucać elity. Sanity łapie dopiero cele fizycznie niemożliwe (1:30 → 1:57/km). */
    var cRWS = celMar(2 * 3600);
    check('cel 2:00 w maratonie → ściana ambicji (p10 2:37/km mieści się w sanity)',
      cRWS.ok === false && cRWS.sciana.kod === 'CEL_ZA_AMBITNY', cRWS.ok ? null : cRWS.sciana.kod);
    var cNiemozliwy = celMar(90 * 60);
    check('cel 1:30 w maratonie u kogoś Z HISTORIĄ → ŚCIANA, nie sanity',
      cNiemozliwy.ok === false && cNiemozliwy.sciana.kod === 'CEL_ZA_AMBITNY', cNiemozliwy.ok ? null : cNiemozliwy.sciana.kod);
    check('…bo komunikat ze ŚCIANY podaje liczbę Z JEGO DANYCH, nie z tabeli rekordów',
      cNiemozliwy.ok === false && /Realny cel na ten start/.test(cNiemozliwy.sciana.komunikat), cNiemozliwy.ok ? null : cNiemozliwy.sciana.komunikat);
    /* Cel bez żadnego poziomu — ściana nie ma z czym porównać, więc wymagamy kroku 4. */
    var cBezPoziomu = uloz(we({ dystans: 'marathon', dniWTygodniu: 5, dataStartu: zaTygodni(18),
                                poziom: { p10sec: null, wynik: null, objetoscTygodniowa: 70 },
                                celCzasowy: 3 * 3600 }));
    check('cel bez wyniku i bez logów → BRAK_POZIOMU, nie CEL_ZA_AMBITNY',
      cBezPoziomu.ok === false && cBezPoziomu.sciana.kod === 'BRAK_POZIOMU',
      cBezPoziomu.ok ? null : cBezPoziomu.sciana.kod);

    /* Sedno funkcji: plan z celem MUSI mieć inne tempa niż bez celu. */
    var bezCelu = celMar(null);
    check('tempa z celu RÓŻNIĄ SIĘ od temp z historii',
      bezCelu.ok && c330.ok && JSON.stringify(bezCelu.meta.tempa) !== JSON.stringify(c330.meta.tempa),
      [bezCelu.ok && bezCelu.meta.tempa, c330.ok && c330.meta.tempa]);
    check('bez celu: tempaZCelu=false i p10sec == p10sec_forma',
      bezCelu.ok && bezCelu.meta.tempaZCelu === false && bezCelu.meta.p10sec === bezCelu.meta.p10sec_forma, null);
    check('z celem: p10sec_forma ZACHOWUJE wartość z historii',
      c330.ok && Math.abs(c330.meta.p10sec_forma - Math.round(p10_340)) <= 1,
      c330.ok ? [c330.meta.p10sec_forma, Math.round(p10_340)] : null);
    check('plan.target_time wypełnione, gdy cel podany (ślad intencji dla trenera)',
      c330.ok && c330.plan.target_time === '3:30:00', c330.ok ? c330.plan.target_time : null);

    /* Regresja zgłoszona przez Filipa: wpisał "3:00" jako cel maratoński,
       a jednopolowy parser odczytał to jako 3 MINUTY. Klient ma teraz trzy pola
       (godz/min/sek), ale silnik musi bronić się sam — gdyby kiedyś przyszło
       tu 180 s, ma to być odmowa, a nie plan z tempem 0:04/km. */
    var celMar3h = uloz(we({ dystans: 'marathon', dniWTygodniu: 5, dataStartu: zaTygodni(20),
                             poziom: poziom({ p10sec: 250, objetoscTygodniowa: 70 }), celCzasowy: 10800 }));
    check('maraton z celem 3:00:00 → plan powstaje', celMar3h.ok === true, celMar3h.ok ? null : celMar3h.sciana);
    check('…a tempo maratońskie jest ~4:16-4:25/km, nie ~0:04/km', (function () {
      if (!celMar3h.ok) return false;
      var m = celMar3h.meta.tempa.M.split(':');
      var sek = (+m[0]) * 60 + (+m[1]);
      return sek > 240 && sek < 280;
    })(), celMar3h.ok ? celMar3h.meta.tempa.M : null);
    var celMar180 = uloz(we({ dystans: 'marathon', dniWTygodniu: 5, dataStartu: zaTygodni(20),
                              poziom: poziom({ p10sec: 250, objetoscTygodniowa: 70 }), celCzasowy: 180 }));
    check('maraton z celem 180 s ("3:00" źle sparsowane) → ODMOWA ze ściany, nie absurdalny plan',
      celMar180.ok === false && celMar180.sciana.kod === 'CEL_ZA_AMBITNY',
      celMar180.ok ? 'PRZESZLO' : celMar180.sciana.kod);

    sekcja('SANITY CZASU — progi PER DYSTANS, z rekordów świata');
    /* Zgłoszenie Filipa: „cel 10 km w 28:00 przeszedł walidację". Zmierzone —
       NIE przeszedł: ściana CEL_ZA_AMBITNY go odbija (18,1% poprawy wobec jego
       prognozy 34:12). Objawem był CICHY ZANIK celu w kliencie przy niepełnym
       czasie, nie dziura w silniku.

       Ale sanity faktycznie było bezużyteczne: jeden zakres 2:30–12:00/km po P10
       obsługiwał wszystkie dystanse, więc 28:00 na dziesiątce mieściło się w nim
       bez problemu. Teraz progi są per dystans, z rekordów zweryfikowanych 11/8. */
    var p10Filip = 205.2;   // 3:25/km — zmierzone z realnych logów
    var cel10 = function (sek) {
      return uloz(we({ dystans: '10k', dniWTygodniu: 5, dataStartu: zaTygodni(13),
                       poziom: poziom({ p10sec: p10Filip, objetoscTygodniowa: 129 }), celCzasowy: sek }));
    };
    /* ⚠️ ROLA SANITY ZALEŻY OD PUNKTU ODNIESIENIA — to sedno tej sekcji.
       Przy CELU historia ZAWSZE istnieje (BRAK_POZIOMU odrzuca wcześniej każdego
       bez niej), więc rozstrzyga ŚCIANA: jej komunikat podaje liczbę z danych
       zawodnika, a nie z tabeli rekordów, która o nim nic nie wie.
       Sanity jest jedyną bramką dopiero w kroku 4 — tryb 'wynik'. */
    var c2400 = cel10(24 * 60);
    check('10 km w 24:00 u kogoś Z HISTORIĄ → ŚCIANA rozstrzyga, nie sanity',
      c2400.ok === false && c2400.sciana.kod === 'CEL_ZA_AMBITNY', c2400.ok ? 'PRZESZLO' : c2400.sciana.kod);
    check('…a komunikat cytuje JEGO prognozę, nie rekord świata',
      // 13 tygodni → limit 9,75%; prognoza 34:12 → realny cel 30:52.
      // (Do 18.08.2026 przy stałym limicie 8% wychodziło 31:28.)
      c2400.ok === false && /Realny cel na ten start: 30:52/.test(c2400.sciana.komunikat),
      c2400.ok ? null : c2400.sciana.komunikat);
    check('sanity w trybie WYNIK (brak historii) NADAL cytuje rekord — jedyna bramka',
      /szybciej niż rekord świata \(26:11\)/.test(sanityCzasu('10k', 24 * 60, 'wynik').komunikat),
      sanityCzasu('10k', 24 * 60, 'wynik').komunikat);
    check('…a rekord w komunikacie pochodzi z DYSTANSE — JEDNO ŹRÓDŁO',
      sanityCzasu('10k', 24 * 60, 'wynik').szczegoly.rekord_s === DYSTANSE['10k'].rekord, null);
    check('próg WYNIKU jest WYLICZONY z rekordu, nie wpisany osobno',
      DYSTANSE['10k'].minCzasWynik === Math.round(DYSTANSE['10k'].rekord * 0.95 / 60) * 60,
      [DYSTANSE['10k'].minCzasWynik, DYSTANSE['10k'].rekord]);
    check('próg CELU jest LUŹNIEJSZY od progu WYNIKU (ściana stoi przed nim)',
      DYSTANSE['10k'].minCzasCel < DYSTANSE['10k'].minCzasWynik,
      [DYSTANSE['10k'].minCzasCel, DYSTANSE['10k'].minCzasWynik]);
    var c2800 = cel10(28 * 60);
    check('10 km w 28:00 → ODRZUCONE ścianą (18% poprawy), plan NIE powstaje',
      c2800.ok === false && c2800.sciana.kod === 'CEL_ZA_AMBITNY' && !c2800.plan && !c2800.treningi,
      c2800.ok ? 'PLAN POWSTAL' : c2800.sciana.kod);
    check('10 km w 34:12 (= jego prognoza) → przechodzi', cel10(2052).ok === true, null);

    /* Krok 4: BEZ historii sanity jest jedyną bramką i musi łapać sama. */
    check('WYNIK 10 km w 24:00 → CZAS_POZA_SKALA (jedyna bramka)',
      sanityCzasu('10k', 24 * 60, 'wynik') !== null, null);
    check('WYNIK maraton 1:50 → CZAS_POZA_SKALA', sanityCzasu('marathon', 110 * 60, 'wynik') !== null, null);
    check('WYNIK 10 km w 38:00 (realny) → przechodzi', sanityCzasu('10k', 38 * 60, 'wynik') === null, null);

    /* Progi MUSZĄ leżeć poniżej rekordu — inaczej odcięłyby realny wynik. */
    check('oba progi dolne są szybsze niż rekord świata tego dystansu', (function () {
      var REKORDY = { '5k': 755, '10k': 1571, 'half': 3440, 'marathon': 7170 };   // zweryfikowane 11/8/2026
      return Object.keys(REKORDY).every(function (k) {
        return DYSTANSE[k].minCzasWynik < REKORDY[k] && DYSTANSE[k].minCzasCel < REKORDY[k];
      });
    })(), null);
    check('górna granica: CEL luźniejszy niż WYNIK na każdym dystansie', (function () {
      return ['5k', '10k', 'half', 'marathon'].every(function (k) {
        return DYSTANSE[k].maxCzasCel > DYSTANSE[k].maxCzasWynik;
      });
    })(), null);
    /* ⚠️ Kontrola z decyzji: maraton w 6 godzin to NORMALNY pierwszy start
       i nie może być traktowany jak błąd. Limity to 10:32:56 (wynik) i
       11:48:53 (cel), więc zapas jest ogromny — tak ma zostać. */
    check('maraton w 6 GODZIN przechodzi jako WYNIK (normalny pierwszy start)',
      sanityCzasu('marathon', 6 * 3600, 'wynik') === null, null);
    check('maraton w 6 GODZIN przechodzi jako CEL',
      sanityCzasu('marathon', 6 * 3600, 'cel') === null, null);
    check('maraton w 7 godzin nadal przechodzi w obu trybach',
      sanityCzasu('marathon', 7 * 3600, 'wynik') === null &&
      sanityCzasu('marathon', 7 * 3600, 'cel') === null, null);
    check('maraton w 11 godzin: odbity jako WYNIK, przepuszczony jako CEL', (function () {
      return sanityCzasu('marathon', 11 * 3600, 'wynik') !== null
          && sanityCzasu('marathon', 11 * 3600, 'cel') === null;
    })(), null);
    check('domyślny tryb (bez argumentu) jest LUŹNIEJSZY — przy braku informacji przepuszczamy',
      sanityCzasu('marathon', 11 * 3600) === null, null);
    check('górne granice liczone od TEMPA MARSZU, nie od rekordu', (function () {
      // od rekordu maraton x1,25 dalby 2:29:23 i odrzucal kazdego amatora
      return DYSTANSE.marathon.maxCzasWynik > DYSTANSE.marathon.rekord * 3;
    })(), null);
    check('5 km w 1:30:00 (18:00/km) → CZAS_POZA_SKALA, kierunek za_wolno', (function () {
      var r = uloz(we({ dystans: '5k', dniWTygodniu: 4, dataStartu: zaTygodni(6),
                        poziom: poziom({ objetoscTygodniowa: 25 }), celCzasowy: 90 * 60 }));
      return r.ok === false && r.sciana.kod === 'CZAS_POZA_SKALA' && r.sciana.szczegoly.kierunek === 'za_wolno';
    })(), null);
    check('5 km w 1:00:00 (marsz) NADAL przechodzi — nie odcinamy chodziarzy', (function () {
      var r = uloz(we({ dystans: '5k', dniWTygodniu: 4, dataStartu: zaTygodni(6),
                        poziom: poziom({ objetoscTygodniowa: 25 }), celCzasowy: 3600 }));
      return r.ok === true || r.sciana.kod !== 'CZAS_POZA_SKALA';
    })(), null);

    sekcja('OSTATNIE DNI PRZED STARTEM');
    /* Regresja zgłoszona przez Filipa: „dzień przed startem pokazuje rozbieganie
       7 km". Zmierzone: zepsute było 6 z 7 dni tygodnia startu (Pn dawał
       wybieganie 22 km). Testujemy WSZYSTKIE dni tygodnia, nie tylko niedzielę,
       bo to ona jako jedyna działała przed poprawką — i to przypadkiem. */
    var ostatniBieg = function (r, dataStartu) {
      var b = r.treningi.filter(function (w) {
        return w.date < dataStartu && (w.target_distance_km || 0) > 0;
      });
      return b.length ? b[b.length - 1] : null;
    };
    [['5k', 6], ['10k', 8], ['half', 12], ['marathon', 18]].forEach(function (c) {
      [3, 4, 5, 6].forEach(function (dni) {
        for (var przesun = 0; przesun < 7; przesun++) {
          var ds = isoZIdx(dzienIdx(zaTygodni(c[1])) + przesun);
          var r = uloz(we({ dystans: c[0], dataStartu: ds, dniWTygodniu: dni,
                            poziom: poziom({ objetoscTygodniowa: 129 }) }));
          if (!r.ok) continue;
          var ob = ostatniBieg(r, ds);
          check(c[0] + ', ' + dni + ' dni, +' + przesun + ' — ostatni bieg ≤ ' + ROZRUSZANIE_KM + ' km',
            !!ob && ob.target_distance_km <= ROZRUSZANIE_KM + 0.001,
            ob ? [ob.date, ob.workout_type, ob.target_distance_km] : 'brak biegu');
          check(c[0] + ', ' + dni + ' dni, +' + przesun + ' — ostatni bieg ma przebieżki w opisie',
            !!ob && /przebie/i.test(ob.description || ''), ob ? ob.description : null);
        }
      });
    });

    /* Wariant poniedziałkowy: przed poprawką T-1 było wybieganiem 22 km.
       Po korekcie ta jednostka znika z planu — bramka minDlugieProc mierzy
       maksimum po Wybieganiu, więc musi to przetrwać. Test w obie strony. */
    var pn = null;
    for (var s = 0; s < 7; s++) {
      var d0 = isoZIdx(dzienIdx(zaTygodni(12)) + s);
      if (dzienTygodnia(dzienIdx(d0)) === 1) { pn = d0; break; }
    }
    var rPn = uloz(we({ dystans: 'half', dataStartu: pn, dniWTygodniu: 6,
                        poziom: poziom({ objetoscTygodniowa: 129 }) }));
    check('start w poniedziałek: plan nadal powstaje', rPn.ok === true, rPn.ok ? null : rPn.sciana);
    check('start w poniedziałek: ostatni bieg to rozruszanie, nie wybieganie 22 km',
      rPn.ok && ostatniBieg(rPn, pn).target_distance_km <= ROZRUSZANIE_KM + 0.001,
      rPn.ok ? ostatniBieg(rPn, pn).target_distance_km : null);
    check('start w poniedziałek: wybieganie NADAL spełnia minDlugieProc po korekcie',
      rPn.ok && najdluzszeW(rPn) >= DYSTANSE.half.minDlugieProc * DYSTANSE.half.km - 0.05,
      rPn.ok ? najdluzszeW(rPn) : null);

    /* Decyzja: wolne wygrywa. Dwa dni przed startem nie dokładamy objętości
       tam, gdzie plan już mówi odpocznij. */
    var rWolne = uloz(we({ dystans: 'half', dataStartu: zaTygodni(12), dniWTygodniu: 4,
                           poziom: poziom({ objetoscTygodniowa: 60 }) }));
    check('dwa dni przed: Odpoczynek zostaje Odpoczynkiem', (function () {
      if (!rWolne.ok) return false;
      var iS = dzienIdx(rWolne.treningi[rWolne.treningi.length - 1].date);
      var t2 = rWolne.treningi.filter(function (w) { return dzienIdx(w.date) === iS - 2; })[0];
      return !t2 || t2.workout_type === 'Odpoczynek' || (t2.target_distance_km || 0) > 0;
    })(), null);

    sekcja('SUFIT WYBIEGANIA — półmaraton 22 km w trzech reżimach objętości');
    /* 22 km = 104% dystansu. Reżimy dobrane tak, żeby trafić w trzy różne ścieżki
       układania tygodnia: 25 = sufit NIE wiąże, 60 = wiąże, 129 = wiąże z zapasem. */
    /* ⚠️ HORYZONT PODNIESIONY Z 10 NA 11 TYGODNI — nie kosmetyka, tylko skutek
       stopniowanego sufitu przyrostu (8/6/4/3, decyzja z 17.08). Zawodnik na
       25 km/tydz musi dojść do ok. 40, a to wymaga więcej niż 6%/tydz przy
       krótkim horyzoncie. ⚠️ GRANICA ZALEŻY OD DNIA STARTU, bo start poza
       niedzielą dokłada tydzień taperu i skraca budowę:
           start w NIEDZIELĘ    → 10 tyg odbite (6,1%), od 11 przechodzi
           start w PONIEDZIAŁEK → 11 tyg odbite (6,1%), od 12 przechodzi
       `zaTygodni` daje poniedziałek, stąd 12. Szczyt jest ten sam (40,5 km).
       Test stoi TUŻ NAD granicą, żeby jej przesunięcie było widoczne;
       samą granicę pilnuje osobna asercja niżej. */
    [25, 60, 129].forEach(function (obj) {
      [3, 4, 5, 6].forEach(function (dni) {
        var r = uloz(we({ dystans: 'half', dataStartu: zaTygodni(12), dniWTygodniu: dni,
                          poziom: poziom({ objetoscTygodniowa: obj }) }));
        check('half ' + obj + ' km/tydz, ' + dni + ' dni — plan powstaje', r.ok === true, r.ok ? null : r.sciana);
        /* ⚠️ OCZEKIWANIA WPISANE LITERAŁAMI, NIE WZIĘTE Z sufitWybiegania() — inaczej
           test byłby samozwrotny i przespałby każdą zmianę współczynnika. Skąd te
           liczby: sufit = max(22, min(0,30 × baza, 32)), więc 25 i 60 km/tydz stoją
           na PODŁODZE 22, a 129 dopiero sięga CAPU 32 (0,30 × 129 = 38,7 > 32). */
        var oczek = { 25: 22, 60: 22, 129: 32 }[obj];
        check('half ' + obj + ' km/tydz, ' + dni + ' dni — najdłuższe ≤ ' + oczek + ' km (sufit z bazy)',
          r.ok && najdluzszeW(r) <= oczek + 0.001, r.ok ? najdluzszeW(r) : r.sciana);
        check('half ' + obj + ' km/tydz, ' + dni + ' dni — najdłuższe nadal ≥ progu 11,6 km',
          r.ok && najdluzszeW(r) >= DYSTANSE.half.minDlugieProc * DYSTANSE.half.km - 0.05,
          r.ok ? najdluzszeW(r) : r.sciana);
      });
    });
    check('PODŁOGA sufitu half leży z zapasem NAD progiem minDlugieProc (nie powtarzamy pułapki maratońskiej)',
      DYSTANSE.half.maxDlugieKm - DYSTANSE.half.minDlugieProc * DYSTANSE.half.km > 5,
      Math.round((DYSTANSE.half.maxDlugieKm - DYSTANSE.half.minDlugieProc * DYSTANSE.half.km) * 10) / 10);
    check('PODŁOGA sufitu half jest powyżej 100% dystansu docelowego',
      DYSTANSE.half.maxDlugieKm > DYSTANSE.half.km,
      Math.round(DYSTANSE.half.maxDlugieKm / DYSTANSE.half.km * 100) + '%');
    check('PODŁOGI pozostałych dystansów nietknięte (5k 14 / 10k 18 / marathon 34)',
      DYSTANSE['5k'].maxDlugieKm === 14 && DYSTANSE['10k'].maxDlugieKm === 18
      && DYSTANSE.marathon.maxDlugieKm === 34,
      [DYSTANSE['5k'].maxDlugieKm, DYSTANSE['10k'].maxDlugieKm, DYSTANSE.marathon.maxDlugieKm]);

    check('próg wybiegania jest OSIĄGALNY dla każdego dystansu przy peakKm',
      ['5k', '10k', 'half', 'marathon'].every(function (dy) {
        var d = DYSTANSE[dy];
        return d.udzialDlugiego * d.peakKm >= d.minDlugieProc * d.km;
      }), ['5k', '10k', 'half', 'marathon'].map(function (dy) {
        var d = DYSTANSE[dy];
        return dy + ': ' + Math.round(d.udzialDlugiego * d.peakKm * 10) / 10 + ' vs ' + Math.round(d.minDlugieProc * d.km * 10) / 10;
      }));

    sekcja('ŚCIANA — cel czasowy ponad limit poprawy');
    var pgn10 = prognozaCzasu(300, 10);             // p10=5:00/km => 50:00
    var celZa = uloz(we({ celCzasowy: Math.round(pgn10 * 0.85) }));
    check('cel 15% szybszy odbity', celZa.ok === false && celZa.sciana.kod === 'CEL_ZA_AMBITNY', celZa.ok ? 'PRZESZLO' : celZa.sciana);
    check('odmowa podaje realny cel', celZa.ok === false && celZa.sciana.szczegoly.celRealny_s > 0, celZa.sciana && celZa.sciana.szczegoly);
    // domyślne `we()` to 10 tygodni → limit 7,5%; liczony z funkcji, nie wpisany
    var celGranica = uloz(we({ celCzasowy: Math.round(pgn10 * (1 - maxPoprawaDla(10))) }));
    check('cel dokładnie na limicie przechodzi (granica)', celGranica.ok === true, celGranica.ok ? null : celGranica.sciana);
    var celWolny = uloz(we({ celCzasowy: Math.round(pgn10 * 1.10) }));
    check('cel wolniejszy niż prognoza przechodzi', celWolny.ok === true, celWolny.ok ? null : celWolny.sciana);

    sekcja('ŚCIANA — brak danych i śmieci na wejściu');
    var brakP = uloz(we({ poziom: { p10sec: null, wynik: null, objetoscTygodniowa: 30 } }));
    check('brak p10 i brak wyniku → BRAK_POZIOMU (nie zgadujemy)', brakP.ok === false && brakP.sciana.kod === 'BRAK_POZIOMU', brakP.ok ? 'PRZESZLO' : brakP.sciana);
    var zWyniku = uloz(we({ poziom: { p10sec: null, wynik: { dystans_km: 5, czas_s: 1440 }, objetoscTygodniowa: 30 } }));
    check('sam wynik na 5 km wystarcza (Riegel)', zWyniku.ok === true, zWyniku.ok ? null : zWyniku.sciana);
    check('nieznany dystans odbity', uloz(we({ dystans: '30k' })).sciana.kod === 'NIEZNANY_DYSTANS', null);
    check('7 dni w tygodniu odbite', uloz(we({ dniWTygodniu: 7 })).sciana.kod === 'ZLE_DNI', null);
    check('2 dni w tygodniu odbite', uloz(we({ dniWTygodniu: 2 })).sciana.kod === 'ZLE_DNI', null);
    check('3.5 dnia odbite', uloz(we({ dniWTygodniu: 3.5 })).sciana.kod === 'ZLE_DNI', null);
    check('start w przeszłości odbity', uloz(we({ dataStartu: '2026-01-01' })).sciana.kod === 'START_W_PRZESZLOSCI', null);
    check('start dzisiaj odbity', uloz(we({ dataStartu: TODAY })).sciana.kod === 'START_W_PRZESZLOSCI', null);
    check('zła data startu odbita', uloz(we({ dataStartu: '10.08.2026' })).sciana.kod === 'ZLA_DATA', null);
    check('brak wejścia w ogóle nie wybucha', uloz(undefined).ok === false, uloz(undefined));
    check('pusty obiekt nie wybucha', uloz({}).ok === false, uloz({}));
    var absurd = uloz(we({ poziom: poziom({ p10sec: 90 }) }));
    check('tempo 1:30/km odbite jako błąd danych', absurd.ok === false && absurd.sciana.kod === 'POZIOM_POZA_SKALA', absurd.ok ? 'PRZESZLO' : absurd.sciana);
    var wolno = uloz(we({ poziom: poziom({ p10sec: 700 }) }));
    check('tempo 11:40/km odbite jako błąd danych', wolno.ok === false && wolno.sciana.kod === 'POZIOM_POZA_SKALA', wolno.ok ? 'PRZESZLO' : wolno.sciana);
    check('każda odmowa ma kod, komunikat i szczegóły',
      [brakP, skok, celZa, mar3].every(function (r) {
        return r.sciana && typeof r.sciana.kod === 'string' && r.sciana.komunikat.length > 10 && typeof r.sciana.szczegoly === 'object';
      }), null);

    /* ══════════ PLAN — kiedy JUŻ powstaje ══════════ */
    sekcja('PLAN — struktura');
    var r = uloz(we({ dystans: 'half', dataStartu: zaTygodni(12), dniWTygodniu: 4,
                      poziom: poziom({ p10sec: 300, objetoscTygodniowa: 40 }) }));
    check('plan powstaje', r.ok === true, r.ok ? null : r.sciana);
    check('12 tygodni', r.meta.tygodnie === 12, r.meta.tygodnie);
    check('plan_type = macro', r.plan.plan_type === 'macro', r.plan.plan_type);
    check('start_date to poniedziałek', dzienTygodnia(dzienIdx(r.plan.start_date)) === 1, r.plan.start_date);
    check('end_date = dzień startu', r.plan.end_date === zaTygodni(12), r.plan.end_date);
    check('ostatnim wpisem planu jest dzień zawodów', jestDniemStartu(r.treningi[r.treningi.length - 1]), r.treningi[r.treningi.length - 1]);
    check('dzień zawodów jest dokładnie jeden', r.treningi.filter(jestDniemStartu).length === 1, null);
    // ⚠️ Dzień zawodów CELOWO nie ma dystansu — inaczej policzyłby się dwa razy
    //    (raz jako plan, raz jako zalogowany bieg). Dystans jest w opisie.
    check('dzień zawodów NIE ma dystansu (anty-dublowanie)', r.treningi[r.treningi.length - 1].target_distance_km === null, r.treningi[r.treningi.length - 1].target_distance_km);
    check('dystans zawodów jest w opisie, zaokrąglony', /21,1 km|21.1 km/.test(r.treningi[r.treningi.length - 1].description), r.treningi[r.treningi.length - 1].description);
    check('nic po dniu startu', r.treningi.every(function (w) { return w.date <= r.plan.end_date; }), null);
    check('daty ściśle rosnące', r.treningi.every(function (w, i) { return i === 0 || w.date > r.treningi[i - 1].date; }), null);
    check('day_of_week zgadza się z datą',
      r.treningi.every(function (w) { return w.day_of_week === dzienTygodnia(dzienIdx(w.date)); }), null);
    check('week_number rośnie 1..12 bez dziur',
      JSON.stringify(r.treningi.map(function (w) { return w.week_number; }).filter(function (v, i, a) { return a.indexOf(v) === i; }))
        === JSON.stringify(Array.from({ length: 12 }, function (_, i) { return i + 1; })), null);
    check('4 dni biegania w każdym pełnym tygodniu',
      Array.from({ length: 11 }, function (_, i) { return i + 1; }).every(function (t) {
        return r.treningi.filter(function (w) { return w.week_number === t && w.workout_type !== 'Odpoczynek'; }).length === 4;
      }), null);
    check('pełny tydzień ma 7 dni (odpoczynki wypełnione)',
      r.treningi.filter(function (w) { return w.week_number === 3; }).length === 7, null);
    check('total_workouts nie liczy odpoczynków',
      r.plan.total_workouts === r.treningi.filter(function (w) { return w.workout_type !== 'Odpoczynek'; }).length, r.plan.total_workouts);
    check('total_distance_km = suma treningów',
      Math.abs(r.plan.total_distance_km - r.treningi.reduce(function (s, w) { return s + (w.target_distance_km || 0); }, 0)) < 0.05,
      r.plan.total_distance_km);
    check('zero NaN w treningach',
      r.treningi.every(function (w) { return w.target_distance_km === null || isFinite(w.target_distance_km); }), null);
    check('Odpoczynek nie ma dystansu ani tempa',
      r.treningi.filter(function (w) { return w.workout_type === 'Odpoczynek'; })
        .every(function (w) { return w.target_distance_km === null && w.target_pace === null; }), null);
    check('każdy typ jest z listy używanej w bibliotece',
      r.treningi.every(function (w) {
        return ['Bieg spokojny', 'Wybieganie', 'Regeneracja', 'Tempo', 'Interwały', 'Odpoczynek', 'Start'].indexOf(w.workout_type) >= 0;
      }), null);
    check('długie zawsze w niedzielę',
      r.treningi.filter(function (w) { return w.workout_type === 'Wybieganie'; }).every(function (w) { return w.day_of_week === 0; }), null);

    sekcja('PLAN — tempa ze stref');
    check('p10 przeniesione do meta', r.meta.p10sec === 300, r.meta.p10sec);
    /* ⚠️ ZMIANA MODELU STREF — DANIELS ZAMIAST BIBLIOTEKI. Zmierzony skutek przy
       P10 = 5:00/km (dziesiątka 50:00), czyli w środku dotychczasowej kalibracji:

           strefa   biblioteka (489 treningów)   Daniels    różnica
           E              6:35                    6:07      -28 s/km
           Reg            7:00                    6:38      -22 s/km
           T              5:30                    5:03      -27 s/km
           I              5:05                    4:41      -24 s/km
           M              5:25                    5:22       -3 s/km
           R              4:30                    4:20      -10 s/km

       DANIELS PRZYSPIESZA KAŻDĄ STREFĘ o 22–28 s/km wobec tego, co Filip i Kasia
       faktycznie zadają swoim zawodnikom. To NIE jest błąd zaokrąglenia ani skutek
       uboczny — to różnica między tabelą kalibrowaną na innej populacji a pomiarem
       na własnej. Decyzja produktowa Filipa, 17.08. Stare wartości zostają tutaj
       zapisane, żeby ta różnica była widoczna, a nie odtwarzana od zera przy
       następnej dyskusji. */
    check('E = 6:07/km wg Danielsa (biblioteka dawała 6:35)', r.meta.tempa.E === '6:07', r.meta.tempa.E);
    check('Reg = 6:38/km wg Danielsa (biblioteka 7:00)', r.meta.tempa.Reg === '6:38', r.meta.tempa.Reg);
    check('T = 5:03/km wg Danielsa = wysiłek godzinny (biblioteka 5:30)', r.meta.tempa.T === '5:03', r.meta.tempa.T);
    check('I = 4:41/km wg Danielsa (biblioteka 5:05)', r.meta.tempa.I === '4:41', r.meta.tempa.I);
    check('M = 5:22/km wg Danielsa (biblioteka 5:25)', r.meta.tempa.M === '5:22', r.meta.tempa.M);
    check('R = 4:20/km wg Danielsa (biblioteka 4:30)', r.meta.tempa.R === '4:20', r.meta.tempa.R);
    check('spokojne w planie mają tempo E',
      r.treningi.filter(function (w) { return w.workout_type === 'Bieg spokojny' && !jestDniemStartu(w); }).every(function (w) { return w.target_pace === '6:07/km'; }), null);
    check('interwały w planie mają tempo I',
      r.treningi.filter(function (w) { return w.workout_type === 'Interwały'; }).every(function (w) { return w.target_pace === '4:41/km'; }), null);
    check('każdy bieg ma tempo',
      r.treningi.filter(function (w) { return w.workout_type !== 'Odpoczynek' && !jestDniemStartu(w); })
        .every(function (w) { return /^\d{1,2}:\d{2}\/km$/.test(w.target_pace); }), null);

    sekcja('PLAN — progresja i ściana objętości od środka');
    var obj = r.meta.objetosciTygodni;
    check('tygodni objętości = tygodni planu', obj.length === 12, obj);
    check('start od obecnej objętości', Math.abs(obj[0] - 40) < 0.1, obj[0]);

    // Niezmiennik dotyczy TRENDU, nie sąsiednich liczb. Tydzień po zrzucie jest
    // z definicji wyraźnie wyższy od zrzutowego — tak działa cykl 3:1 i tak ma być.
    // Właściwe pytanie brzmi: czy trend rośnie szybciej niż 8%/tydz. Nie rośnie.
    // Tygodnie zrzutowe trzeba ODTWORZYĆ do trendu (podzielić przez ZRZUT), a nie
    // wyciąć — wycięcie gubi wartość trendu z tego tygodnia i robi sztuczny przeskok.
    var budowaTyg = r.meta.tygodnie - r.meta.taperTygodni;
    var trend = obj.slice(0, budowaTyg).map(function (v, i) {
      return (i + 1) % ZRZUT_CO === 0 ? v / ZRZUT : v;
    });
    // +0.06 to tolerancja zaokrąglenia: objętości raportujemy z dokładnością do
    // 0,1 km, więc 43,2 × 1,08 = 46,656 wychodzi na zewnątrz jako 46,7.
    /* ⚠️ OD 25.08.2026 KRZYWA IDZIE ZA BRAMKĄ — przyrost jest stopniowany po bazie
       (`maxPrzyrostDla`), nie płaski 8%. Baza tego planu to 40 km/tydz, czyli
       pasmo [40,70) → 4%/tydz. Gdyby stało tu MAX_PRZYROST_TYG, test byłby
       spełniony trywialnie (4% ≤ 8%) i przestałby cokolwiek pilnować. */
    var przyrost40 = maxPrzyrostDla(40);
    check('trend budowy rośnie ≤' + Math.round(przyrost40 * 100) + '% tydzień do tygodnia (pasmo bazy 40)',
      trend.every(function (v, i) { return i === 0 || v <= trend[i - 1] * (1 + przyrost40) + 0.06; }), trend);
    check('trend budowy nigdy nie maleje',
      trend.every(function (v, i) { return i === 0 || v >= trend[i - 1] - 0.05; }), trend);
    check('co 4. tydzień lżejszy od poprzedniego', obj[3] < obj[2] && obj[7] < obj[6], [obj[2], obj[3], obj[6], obj[7]]);
    check('zrzut to ~70% trendu, nie przypadkowa liczba',
      Math.abs(obj[3] / (obj[2] * (1 + przyrost40)) - ZRZUT) < 0.01, [obj[2], obj[3]]);
    check('wyjście ze zrzutu nie przeskakuje ponad nieprzerwany trend',
      obj[4] <= obj[2] * Math.pow(1 + przyrost40, 2) + 0.05, [obj[2], obj[3], obj[4]]);
    check('tydzień startowy najlżejszy z całego planu',
      obj[11] === Math.min.apply(null, obj), obj);
    check('szczyt nie przekracza peaku dystansu', Math.max.apply(null, obj) <= DYSTANSE.half.peakKm + 0.05, Math.max.apply(null, obj));

    sekcja('SUFIT SZCZYTU — dwa ograniczenia naraz');
    [['5k', 6, 4, 25], ['10k', 8, 4, 30], ['half', 12, 4, 40], ['marathon', 20, 5, 50],
     ['marathon', 20, 6, 90], ['half', 16, 3, 30]].forEach(function (c) {
      var rr = uloz(we({ dystans: c[0], dataStartu: zaTygodni(c[1]), dniWTygodniu: c[2],
                         poziom: poziom({ objetoscTygodniowa: c[3] }) }));
      if (!rr.ok) { check(c[0] + ' @' + c[3] + ' km/tydz: plan powstaje', false, rr.sciana); return; }
      var szczyt = Math.max.apply(null, rr.meta.objetosciTygodni);
      /* ⚠️ MNOŻNIK LICZY SIĘ Z HORYZONTU TEGO PLANU (c[1]), nie ze stałej.
         zaTygodni(n) daje dokładnie n tygodni, więc c[1] jest tym samym n,
         które zobaczył silnik. */
      var mnoz = mnoznikSzczytu(c[1]);
      check(c[0] + ' @' + c[3] + ' km/tydz: szczyt ≤ obecna × ' + mnoz.toFixed(2) + ' (' + szczyt + ' ≤ ' + (c[3] * mnoz).toFixed(1) + ')',
        szczyt <= c[3] * mnoz + 0.05, szczyt);
      var sufitDlaTego = Math.max(DYSTANSE[c[0]].peakKm, c[3] * SZCZYT_NAD_BAZA);
      check(c[0] + ' @' + c[3] + ' km/tydz: szczyt ≤ sufitu (' + szczyt + ' ≤ ' + Math.round(sufitDlaTego) + ')',
        szczyt <= sufitDlaTego + 0.05, szczyt);
      check(c[0] + ' @' + c[3] + ' km/tydz: szczyt ≥ obecna (plan nie cofa)', szczyt >= c[3] - 0.05, szczyt);
    });
    var duzo = uloz(we({ dystans: 'marathon', dataStartu: zaTygodni(20), dniWTygodniu: 6,
                         poziom: poziom({ objetoscTygodniowa: 90 }) }));
    check('90 km/tydz + maraton: peakKm 70 NIE cofa planu do 70',
      Math.max.apply(null, duzo.meta.objetosciTygodni) >= 90, duzo.ok ? Math.max.apply(null, duzo.meta.objetosciTygodni) : duzo.sciana);

    sekcja('JEDNOSTKI JAKOŚCIOWE — rozbicie w opisie');
    var rj = uloz(we({ dystans: 'half', dataStartu: zaTygodni(12), dniWTygodniu: 4,
                       poziom: poziom({ p10sec: 300, objetoscTygodniowa: 40 }) }));
    var iw = rj.treningi.filter(function (w) { return w.workout_type === 'Interwały'; });
    var tp = rj.treningi.filter(function (w) { return w.workout_type === 'Tempo'; });
    check('plan zawiera interwały i tempo', iw.length > 0 && tp.length > 0, [iw.length, tp.length]);
    check('każdy interwał ma w opisie liczbę odcinków „N × 1000 m"',
      iw.every(function (w) { return /\d+ × 1000 m/.test(w.description); }), iw[0] && iw[0].description);
    check('liczba odcinków jest z widełek {3,4,6,8}',
      iw.every(function (w) { return [3, 4, 6, 8].indexOf(+/(\d+) × 1000 m/.exec(w.description)[1]) >= 0; }),
      iw.map(function (w) { return /(\d+) × 1000 m/.exec(w.description)[1]; }));
    check('opis interwałów niesie tempo strefy I i przerwę',
      iw.every(function (w) { return w.description.indexOf('4:41/km') >= 0 && /przerwa 2 min trucht/.test(w.description); }), iw[0] && iw[0].description);
    check('opis tempa mówi ile MINUT ciągłego biegu',
      tp.every(function (w) { return /\d+ min ciągłego biegu/.test(w.description); }), tp[0] && tp[0].description);
    check('opis tempa niesie tempo strefy T',
      tp.every(function (w) { return w.description.indexOf('5:03/km') >= 0; }), tp[0] && tp[0].description);
    check('każda jednostka jakościowa ma rozgrzewkę i schłodzenie w opisie',
      iw.concat(tp).every(function (w) { return /Rozgrzewka \d+ km/.test(w.description) && /schłodzenie \d+ km/.test(w.description); }), null);

    check('SUMA KM INTERWAŁÓW = rozgrzewka + odcinki + schłodzenie',
      iw.every(function (w) {
        var n = +/(\d+) × 1000 m/.exec(w.description)[1];
        return Math.abs(w.target_distance_km - (ROZGRZEWKA + n * (ODCINEK_M / 1000) + SCHLODZENIE)) < 0.05;
      }), iw.map(function (w) { return w.target_distance_km + ' vs opis: ' + w.description; }));
    check('SUMA KM TEMPA = rozgrzewka + akcent + schłodzenie',
      tp.every(function (w) {
        var km = +/\((\d+(?:\.\d+)?) km\)/.exec(w.description)[1];
        return Math.abs(w.target_distance_km - (ROZGRZEWKA + km + SCHLODZENIE)) < 0.05;
      }), tp.map(function (w) { return w.target_distance_km + ' vs opis: ' + w.description; }));
    check('minuty tempa zgadzają się z km × tempo progowe',
      tp.every(function (w) {
        var m = +/(\d+) min ciągłego biegu/.exec(w.description)[1];
        var km = +/\((\d+(?:\.\d+)?) km\)/.exec(w.description)[1];
        return Math.abs(m - km * tempoStrefy(300, 'T') / 60) < 1;
      }), tp[0] && tp[0].description);
    check('jednostki nieakcentowe zachowują opis ogólny',
      rj.treningi.filter(function (w) { return w.workout_type === 'Bieg spokojny' && !jestDniemStartu(w) && (w.description || '').indexOf('Rozruszanie') < 0 && (w.description || '').indexOf('tempie startowym') < 0; })
        .every(function (w) { return w.description === OPISY['Bieg spokojny']; }), null);
    check('suma tygodnia trzyma się objętości mimo sztywnych km jakości',
      [2, 3, 5, 6].every(function (t) {
        var s = rj.treningi.filter(function (w) { return w.week_number === t; })
          .reduce(function (a, w) { return a + (w.target_distance_km || 0); }, 0);
        return Math.abs(s - rj.meta.objetosciTygodni[t - 1]) < 0.6;
      }), [2, 3, 5, 6].map(function (t) {
        return rj.treningi.filter(function (w) { return w.week_number === t; })
          .reduce(function (a, w) { return a + (w.target_distance_km || 0); }, 0);
      }));
    sekcja('KSZTAŁT TYGODNIA — długie musi być najdłuższe');
    [3, 4, 5, 6].forEach(function (dni) {
      var rk = uloz(we({ dystans: 'half', dataStartu: zaTygodni(12), dniWTygodniu: dni,
                         poziom: poziom({ p10sec: 300, objetoscTygodniowa: 40 }) }));
      var zle = [];
      for (var t = 1; t <= 10; t++) {
        var wk = rk.treningi.filter(function (w) { return w.week_number === t && w.workout_type !== 'Odpoczynek'; });
        var dl = wk.filter(function (w) { return w.workout_type === 'Wybieganie'; })[0];
        if (!dl) continue;
        wk.forEach(function (w) {
          if (w.workout_type !== 'Wybieganie' && w.target_distance_km > dl.target_distance_km + 0.05) {
            zle.push('tydz ' + t + ': ' + w.workout_type + ' ' + w.target_distance_km + ' >= długie ' + dl.target_distance_km);
          }
        });
      }
      check(dni + ' dni: żadna jednostka nie jest dłuższa od wybiegania', zle.length === 0, zle.slice(0, 3));
    });
    var r3 = uloz(we({ dystans: 'half', dataStartu: zaTygodni(12), dniWTygodniu: 3,
                       poziom: poziom({ p10sec: 300, objetoscTygodniowa: 40 }) }));
    var w6 = r3.treningi.filter(function (w) { return w.week_number === 6 && w.workout_type !== 'Odpoczynek'; });
    var dl6 = w6.filter(function (w) { return w.workout_type === 'Wybieganie'; })[0];
    var sp6 = w6.filter(function (w) { return w.workout_type === 'Bieg spokojny'; })[0];
    /* Proporcja obowiązuje tylko dopóki wybieganie nie stoi NA SUFICIE — a sufity
       są DWA i test znał tylko jeden.
       ⚠️ Drugi to MAX_UDZIAL_DLUGIEGO (40% tygodnia) i to on wiąże tutaj:
       tydzień 6 ma 48,7 km, 40% = 19,5 — dokładnie tyle dostaje wybieganie,
       a spokojny dobija do tej samej liczby, bo linia „spokojny ≤ wybieganie"
       nie pozwala mu przerosnąć. Wychodzi REMIS i to jest zachowanie ŚWIADOME,
       opisane przy MAX_UDZIAL_DLUGIEGO („przy 3 dniach bywa teraz remisem").
       Do 25.08.2026 test tego nie łapał, bo przy płaskich 8% tydzień 6 miał inną
       objętość i wiązał sufit `maxDlugieKm`, który wyjątek już obejmował. */
    /* ⚠️ TOLERANCJA MUSI BYĆ CO NAJMNIEJ POŁOWĄ SIATKI, NIE 0,05. Wybieganie
       jest zaokrąglone do KROK_KM, więc stojąc NA suficie potrafi wypaść pod
       nim o pół kroku: 40% z 51,5 to 20,60, a jednostka dostaje 20,5. Przy
       tolerancji 0,05 test uznawał to za „poniżej sufitu" i wymagał proporcji
       1,25, choć sufit właśnie ją uniemożliwił. Złapane 25.08.2026. */
    var sufit6 = Math.min(sufitWybiegania(DYSTANSE.half, 40), MAX_UDZIAL_DLUGIEGO * r3.meta.objetosciTygodni[5]);
    check('3 dni: długie/spokojny ≈ ' + DLUGIE_NAD_SPOKOJNYM + ' (gdy długie poniżej OBU sufitów)',
      dl6.target_distance_km >= sufit6 - KROK_KM / 2
        ? dl6.target_distance_km >= sp6.target_distance_km
        : Math.abs(dl6.target_distance_km / sp6.target_distance_km - DLUGIE_NAD_SPOKOJNYM) < 0.05,
      [dl6.target_distance_km, sp6.target_distance_km, DYSTANSE.half.maxDlugieKm]);
    /* ── CZY PLAN DOMYKA OBJĘTOŚĆ, KTÓRĄ SAM DEKLARUJE ────────────────────
       ⚠️ PRZEPISANE 25.08.2026: mierzy RELACJĘ, nie jedną liczbę. Poprzednia
       wersja porównywała tydzień 6 jednego planu (53 wobec 55, potem 50 wobec
       51,5) i przez to ZMIENIAŁA KOLOR przy każdej zmianie krzywej — zzieleniała
       i zaczerwieniła się w ciągu jednego dnia, nie mówiąc nic o tym, czy wada
       istnieje. Teraz przemiata 290 planów i pyta o `zadane / deklarowane`.

       ZMIERZONE (4 dystanse × 3–6 dni × 9 baz × 3 horyzonty, 3754 tygodnie):
           faza budowy, 6 dni: mediana 1,0000  p10 0,9903  min 0,9726
           faza budowy, 5 dni: mediana 1,0000  p10 0,8687  min 0,7500
           faza budowy, 4 dni: mediana 1,0000  p10 0,9293  min 0,8106
           faza budowy, 3 dni: mediana 0,9670  p10 0,6566  min 0,5682
       Przy 4+ dniach plan domyka deklarację w MEDIANIE dokładnie; przy 3 dniach
       nie domyka jej systematycznie i to jest ta wada.

       ⚠️ TAPER JEST WYŁĄCZONY Z POMIARU I TO NIE JEST CHOWANIE WYNIKU.
       `nadpiszOstatnieDni` ŚWIADOMIE zastępuje ostatni bieg rozruszaniem (4 km),
       więc ostatni pełny tydzień z definicji nie trzyma deklaracji — zmierzone
       0,773 przy 5 dniach, i tak ma być. Dzień startu ma `target_distance_km`
       null, więc tydzień zawodów daje 0. Porównywanie tam deklaracji z realem
       to porównywanie z liczbą, którą silnik celowo nadpisał. */
    var relacje = (function () {
      var out = { '3': [], '4': [], '5': [], '6': [] }, lista = ['5k', '10k', 'half', 'marathon'];
      for (var a = 0; a < lista.length; a++) for (var dni = 3; dni <= 6; dni++) {
        if (lista[a] === 'marathon' && dni < MARATON_MIN_DNI) continue;
        var bazy = [15, 20, 25, 30, 40, 55, 70, 90, 120];
        for (var q = 0; q < bazy.length; q++) for (var kh = 0; kh < 3; kh++) {
          var h = DYSTANSE[lista[a]].minTygodni + [0, 4, 10][kh];
          var rr = uloz(we({ dystans: lista[a], dataStartu: zaTygodni(h), dniWTygodniu: dni,
                             poziom: poziom({ objetoscTygodniowa: bazy[q] }) }));
          if (!rr.ok) continue;
          var dk = rr.meta.objetosciTygodni, fk = rr.meta.objetosciFaktyczne;
          var budowa = rr.meta.tygodnie - rr.meta.taperTygodni;
          for (var t = 0; t < budowa && t < dk.length; t++) {
            if (dk[t] > 0) out[String(dni)].push(fk[t] / dk[t]);
          }
        }
      }
      return out;
    })();
    function mediana(a) { var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; }

    check('faza budowy przy 4+ dniach domyka deklarację (mediana = 1,000)',
      ['4', '5', '6'].every(function (dni) { return Math.abs(mediana(relacje[dni]) - 1) < 0.005; }),
      ['4', '5', '6'].map(function (d) { return d + 'dni:' + mediana(relacje[d]).toFixed(4); }));

    /* ⚠️ TU JEST WADA I TEST MA JĄ TRZYMAĆ ZA GARDŁO, A NIE ZMIENIAĆ KOLOR.
       Przy 3 dniach tydzień ma trzy jednostki: jakość bierze sztywne ~20%,
       a wybieganie nie może przekroczyć 40% tygodnia ani przerosnąć spokojnego.
       Trzy sufity naraz nie dopuszczają reszty kilometrów i plan oddaje mniej,
       niż zadeklarował. Udokumentowane w ulozTydzien („lepiej oddać mniej
       kilometrów niż wypchnąć je w jedną jednostkę") — więc test NIE żąda 1,000,
       tylko pilnuje, żeby nie było GORZEJ niż dziś. */
    check('⚠️ ZNANA WADA: przy 3 dniach plan NIE domyka deklaracji (mediana ' +
          mediana(relacje['3']).toFixed(4) + ') — nie pogarsza się',
      mediana(relacje['3']) >= 0.96 && Math.min.apply(null, relacje['3']) >= 0.56,
      [mediana(relacje['3']), Math.min.apply(null, relacje['3'])]);

    check('⚠️ …i przy 3 dniach jest WYRAŹNIE gorzej niż przy 6 — to nie szum siatki',
      mediana(relacje['6']) - mediana(relacje['3']) > 0.01,
      [mediana(relacje['3']), mediana(relacje['6'])]);

    check('4 dni: ratunek NIE odpala się (kształt był poprawny)',
      Math.abs(rj.treningi.filter(function (w) { return w.week_number === 6 && w.workout_type === 'Wybieganie'; })[0].target_distance_km
        - DYSTANSE.half.udzialDlugiego * rj.meta.objetosciTygodni[5]) < KROK_KM / 2 + 0.001, null);

    check('liczbaOdcinkow: widełki Filipa 4-5→4, 6-8→6, powyżej→8',
      liczbaOdcinkow(4) === 4 && liczbaOdcinkow(5) === 4 && liczbaOdcinkow(6) === 6 &&
      liczbaOdcinkow(8) === 6 && liczbaOdcinkow(9) === 8 && liczbaOdcinkow(3) === 3,
      [3, 4, 5, 6, 8, 9].map(liczbaOdcinkow));
    check('input_target_volume_km = szczyt', r.plan.input_target_volume_km === Math.round(Math.max.apply(null, obj)), r.plan.input_target_volume_km);
    check('input_current_volume_km = obecna', r.plan.input_current_volume_km === 40, r.plan.input_current_volume_km);

    sekcja('PLAN — komunikat produktowy i pola pod zapis');
    check('ai_warnings niesie zdanie o nieadaptacyjności', r.plan.ai_warnings === ZAMKNIECIE, r.plan.ai_warnings);
    check('ai_summary wspomina tempo dziesiątki', /5:00\/km/.test(r.plan.ai_summary), r.plan.ai_summary);
    check('source = self', r.plan.source === 'self', r.plan.source);
    check('status = draft', r.plan.status === 'draft', r.plan.status);
    check('target_race_type z listy CHECK bazy',
      ['marathon', 'half', '10k', '5k', 'custom'].indexOf(r.plan.target_race_type) >= 0, r.plan.target_race_type);
    check('plan_type z listy CHECK bazy',
      ['weekly', 'micro', 'meso', 'macro'].indexOf(r.plan.plan_type) >= 0, r.plan.plan_type);
    check('target_time null gdy brak celu', r.plan.target_time === null, r.plan.target_time);
    var zCelem = uloz(we({ celCzasowy: 3000 }));
    check('target_time sformatowane gdy cel podany', zCelem.plan.target_time === '50:00', zCelem.plan.target_time);
    check('day_of_week w zakresie CHECK 0..6', r.treningi.every(function (w) { return w.day_of_week >= 0 && w.day_of_week <= 6; }), null);
    check('week_number > 0 (CHECK bazy)', r.treningi.every(function (w) { return w.week_number > 0; }), null);

    sekcja('PLAN — determinizm i niezależność od strefy czasowej');
    var a = uloz(we({ dystans: 'half', dataStartu: zaTygodni(12), poziom: poziom({ objetoscTygodniowa: 40 }) }));
    var b = uloz(we({ dystans: 'half', dataStartu: zaTygodni(12), poziom: poziom({ objetoscTygodniowa: 40 }) }));
    check('dwa wywołania = identyczny wynik', JSON.stringify(a) === JSON.stringify(b), null);
    check('brak Date.now w źródle — wynik zależy tylko od wejścia',
      /Date\.now\(|new Date\(\s*\)/.test(String(uloz)) === false, null);

    /* ══════════ TRZY REZIMY OBJETOSCI ══════════
       O tym, czy plan rosnie czy faluje, decyduje polozenie bazy wobec progow
       dystansu. Fala NIE MOZE zastapic progresji u kogos z mala baza. */
    sekcja('REŻIMY OBJĘTOŚCI — progresja / mieszany / fala');

    function rezimTest(obj, dyst, tyg, dni) {
      return uloz(we({ dystans: dyst, dataStartu: zaTygodni(tyg), dniWTygodniu: dni || 6,
                       poziom: poziom({ p10sec: 240, objetoscTygodniowa: obj }) }));
    }
    function szczytP(r) { return Math.max.apply(null, r.meta.objetosciTygodni); }

    // ── 1. PROGRESJA: baza ponizej minSzczyt — ma ROSNAC, nie falowac
    var R25 = rezimTest(25, 'half', 16);
    check('25 km/tydz + półmaraton → reżim „progresja"', R25.ok && R25.meta.rezim === 'progresja',
      R25.ok ? R25.meta.rezim : R25.sciana);
    check('progresja: start = obecna objętość, plan NIE schodzi do 90%',
      Math.abs(R25.meta.objetosciTygodni[0] - 25) < 0.6, R25.meta.objetosciTygodni[0]);
    check('progresja: szczyt WYRAŹNIE powyżej bazy (nie fala wokół 25)',
      szczytP(R25) >= 25 * 1.4, szczytP(R25));
    check('progresja: szczyt nie przekracza sufitu dystansu ani obecna×mnożnik horyzontu',
      szczytP(R25) <= Math.min(DYSTANSE.half.peakKm, 25 * mnoznikSzczytu(R25.meta.tygodnie)) + 0.06,
      szczytP(R25));

    // ── 2. MIESZANY: miedzy minSzczyt a peakKm — rosnie DO peakKm, potem cykl 3:1
    var R45 = rezimTest(45, 'half', 16);
    check('45 km/tydz + półmaraton → reżim „mieszany"', R45.ok && R45.meta.rezim === 'mieszany',
      R45.ok ? R45.meta.rezim : R45.sciana);
    check('mieszany: start = obecna', Math.abs(R45.meta.objetosciTygodni[0] - 45) < 0.6, R45.meta.objetosciTygodni[0]);
    check('mieszany: dochodzi DOKŁADNIE do peakKm dystansu',
      Math.abs(szczytP(R45) - DYSTANSE.half.peakKm) < 0.6, szczytP(R45));
    check('mieszany: po dojściu do szczytu jest fala (tygodnie zrzutowe niżej)',
      (function () {
        var o = R45.meta.objetosciTygodni, przySzczycie = 0, ponizej = 0;
        for (var i = 0; i < R45.meta.tygodnie - R45.meta.taperTygodni; i++) {
          if (Math.abs(o[i] - szczytP(R45)) < 0.6) przySzczycie++;
          else if (o[i] < szczytP(R45) * 0.85) ponizej++;
        }
        return przySzczycie >= 2 && ponizej >= 1;
      })(), R45.meta.objetosciTygodni);
    // Filipa przypadek „60 km/tydz = mieszany" wypada tak dla MARATONU (peakKm 70).
    // Dla polmaratonu 60 > peakKm 55, wiec to juz fala — granica zalezy od dystansu.
    var R60m = rezimTest(60, 'marathon', 20);
    check('60 km/tydz + maraton → reżim „mieszany" (peakKm 70)', R60m.ok && R60m.meta.rezim === 'mieszany',
      R60m.ok ? R60m.meta.rezim : R60m.sciana);
    var R60h = rezimTest(60, 'half', 16);
    check('60 km/tydz + półmaraton → już „fala" (baza powyżej peakKm 55)',
      R60h.ok && R60h.meta.rezim === 'fala', R60h.ok ? R60h.meta.rezim : R60h.sciana);

    // ── 3. FALA: baza na poziomie peakKm lub wyzej — ksztalt, nie wzrost
    var R129 = rezimTest(129, 'half', 10);
    check('129 km/tydz + półmaraton → reżim „fala"', R129.ok && R129.meta.rezim === 'fala',
      R129.ok ? R129.meta.rezim : R129.sciana);
    check('fala: start = ' + Math.round(START_POD_BAZA * 100) + '% bazy',
      Math.abs(R129.meta.objetosciTygodni[0] - 129 * START_POD_BAZA) < 0.6, R129.meta.objetosciTygodni[0]);
    check('fala: szczyt = ' + Math.round(SZCZYT_NAD_BAZA * 100) + '% bazy',
      Math.abs(szczytP(R129) - 129 * SZCZYT_NAD_BAZA) < 0.6, szczytP(R129));

    // ── granice reżimów, w obie strony
    check('granica progresja/mieszany leży na minSzczyt',
      rezimTest(DYSTANSE.half.minSzczyt - 1, 'half', 16).meta.rezim === 'progresja' &&
      rezimTest(DYSTANSE.half.minSzczyt, 'half', 16).meta.rezim === 'mieszany',
      [rezimTest(DYSTANSE.half.minSzczyt - 1, 'half', 16).meta.rezim,
       rezimTest(DYSTANSE.half.minSzczyt, 'half', 16).meta.rezim]);
    check('granica mieszany/fala leży na peakKm',
      rezimTest(DYSTANSE.half.peakKm - 1, 'half', 16).meta.rezim === 'mieszany' &&
      rezimTest(DYSTANSE.half.peakKm, 'half', 16).meta.rezim === 'fala',
      [rezimTest(DYSTANSE.half.peakKm - 1, 'half', 16).meta.rezim,
       rezimTest(DYSTANSE.half.peakKm, 'half', 16).meta.rezim]);
    check('każdy reżim daje plan, żaden nie odbija się o własną ścianę',
      [R25, R45, R60m, R60h, R129].every(function (r) { return r.ok === true; }), null);

    // ── SUFIT DWOCH JEDNOSTEK JAKOSCIOWYCH, niezaleznie od objetosci
    sekcja('SUFIT JAKOŚCI — dwie na tydzień, nigdy trzecia');
    check('żaden tydzień nigdzie nie ma więcej niż ' + MAX_JAKOSC_W_TYG + ' jednostek jakościowych',
      [R25, R45, R60m, R60h, R129].every(function (r) {
        for (var t = 1; t <= r.meta.tygodnie; t++) {
          var n = r.treningi.filter(function (w) {
            return w.week_number === t && (w.workout_type === 'Tempo' || w.workout_type === 'Interwały');
          }).length;
          if (n > MAX_JAKOSC_W_TYG) return false;
        }
        return true;
      }), null);
    /* ⚠️ BYŁO `sp.length >= 3` — i to była NAMIASTKA, nie niezmiennik. Przy jednej
       jakości na tydzień tydzień sześciodniowy miał Reg + 3 spokojne + jakość +
       długie, więc „3 spokojne" znaczyło tyle co „nie ma trzeciej jakości".
       Od czasu drugiej jednostki jakościowej (drugaJakosc, próg 45 km/tydz) ten
       sam zdrowy tydzień ma Reg + 2 spokojne + 2 jakości + długie i liczba 3
       przestała cokolwiek znaczyć. Test sprawdza teraz to, o co naprawdę chodziło:
       że jakości nie ma WIĘCEJ niż sufit i że nadmiar objętości ma gdzie pójść.
       Sufitu MAX_JAKOSC_W_TYG pilnuje osobna asercja tuż wyżej, dla pięciu planów. */
    check('przy 6 dniach i 129 km/tydz nadmiar poszedł w spokojne, nie w trzecią jakość',
      (function () {
        var wk = R129.treningi.filter(function (w) { return w.week_number === 6 && w.workout_type !== 'Odpoczynek'; });
        var jak = wk.filter(function (w) { return w.workout_type === 'Tempo' || w.workout_type === 'Interwały'; });
        var sp = wk.filter(function (w) { return w.workout_type === 'Bieg spokojny'; });
        return jak.length <= MAX_JAKOSC_W_TYG && sp.length >= 1;
      })(), null);

    // ── SUFIT WYBIEGANIA po korekcie na 14/18/26/34
    sekcja('SUFIT PRZYROSTU STOPNIOWANY PO BAZIE');
    /* ⚠️ OD 25.08.2026 TO KRZYWA, NIE SCHODY. Kotwice trzymają dawne wartości
       DOKŁADNIE (10→8%, 30→6%, 55→4%, 85→3%), a między nimi jest prosta.
       Stary test sprawdzał 15/25/50/90 i po interpolacji dawał 7,5/6,5/4,4/3,0. */
    check('kotwice przyrostu trzymają dawne wartości: 10→8%, 30→6%, 55→4%, 85→3%',
      Math.abs(maxPrzyrostDla(10) - 0.08) < 1e-12 && Math.abs(maxPrzyrostDla(30) - 0.06) < 1e-12 &&
      Math.abs(maxPrzyrostDla(55) - 0.04) < 1e-12 && Math.abs(maxPrzyrostDla(85) - 0.03) < 1e-12,
      [maxPrzyrostDla(10), maxPrzyrostDla(30), maxPrzyrostDla(55), maxPrzyrostDla(85)]);
    check('poza skrajnymi kotwicami PŁASKO — bez ekstrapolacji w absurd',
      maxPrzyrostDla(1) === 0.08 && maxPrzyrostDla(5) === 0.08 &&
      maxPrzyrostDla(200) === 0.03 && maxPrzyrostDla(1000) === 0.03,
      [maxPrzyrostDla(1), maxPrzyrostDla(200)]);
    check('między kotwicami maleje monotonicznie i nigdy nie schodzi do zera',
      (function () {
        var poprz = null;
        for (var b = 1; b <= 200; b++) {
          var v = maxPrzyrostDla(b);
          if (!(v > 0)) return false;
          if (poprz !== null && v > poprz + 1e-12) return false;
          poprz = v;
        }
        return true;
      })(), null);
    /* Granica przesunęła się o tydzień w dół po interpolacji: baza 25 ma teraz
       limit 6,5% zamiast 6%, więc mieści się już w 11 tygodniach. */
    check('GRANICA (start w pn): half 25 km/tydz odbite przy 10 tyg., przechodzi przy 11',
      (function () {
        var a = uloz(we({ dystans: 'half', dataStartu: zaTygodni(10), dniWTygodniu: 5,
                          poziom: poziom({ objetoscTygodniowa: 25 }) }));
        var b = uloz(we({ dystans: 'half', dataStartu: zaTygodni(11), dniWTygodniu: 5,
                          poziom: poziom({ objetoscTygodniowa: 25 }) }));
        return a.ok === false && a.sciana.kod === 'SKOK_OBJETOSCI' && b.ok === true;
      })(), null);
    check('odmowa SKOK_OBJETOSCI podaje limit WŁAŚCIWY DLA BAZY, nie stałe 8%',
      (function () {
        var r = uloz(we({ dystans: 'half', dataStartu: zaTygodni(10), dniWTygodniu: 5,
                          poziom: poziom({ objetoscTygodniowa: 25 }) }));
        return r.ok === false &&
               r.sciana.szczegoly.limitProc === Math.round(maxPrzyrostDla(25) * 1000) / 10;
      })(), null);
    /* ⚠️ ZDANIE NIE MOŻE PODAĆ DWA RAZY TEJ SAMEJ LICZBY. Zmierzone 25.08.2026:
       przy pasmach schodkowych 22 komunikaty brzmiały „+8% tygodniowo — powyżej
       bezpiecznych 8%". Interpolacja zbiła to do 12, a rozróżnianie precyzji
       do zera. */
    check('komunikat SKOK_OBJETOSCI nigdy nie podaje dwóch identycznych procentów',
      (function () {
        var kol = 0, lista = ['5k', '10k', 'half', 'marathon'];
        for (var a = 0; a < lista.length; a++) for (var h = 8; h <= 20; h += 2) for (var bz = 5; bz <= 120; bz++) {
          var r = uloz(we({ dystans: lista[a], dataStartu: zaTygodni(h), dniWTygodniu: 4,
                            poziom: poziom({ objetoscTygodniowa: bz }) }));
          if (r.ok || r.sciana.kod !== 'SKOK_OBJETOSCI') continue;
          var m = r.sciana.komunikat.match(/\+([\d.]+)% tygodniowo — powyżej bezpiecznych ([\d.]+)%/);
          if (m && m[1] === m[2]) kol++;
        }
        return kol === 0;
      })(), null);

    sekcja('SUFIT WYBIEGANIA — 14 / 18 / 22 / 34');
    check('półmaraton: sufit 22 km to ok. 104% dystansu (świadomie powyżej 100%)',
      Math.abs(DYSTANSE.half.maxDlugieKm / DYSTANSE.half.km - 1.04) < 0.02,
      Math.round(DYSTANSE.half.maxDlugieKm / DYSTANSE.half.km * 100) + '%');
    check('PODŁOGA sufitu jest powyżej progu minDlugieProc dla każdego dystansu',
      ['5k', '10k', 'half', 'marathon'].every(function (dy) {
        var d = DYSTANSE[dy];
        return d.maxDlugieKm > d.minDlugieProc * d.km;
      }), null);
    check('żaden plan w żadnym reżimie nie przekracza sufitu wybiegania LICZONEGO Z JEGO BAZY',
      [R25, R45, R60m, R60h, R129].every(function (r) {
        var d = DYSTANSE[r.plan.target_race_type];
        var sufit = sufitWybiegania(d, r.plan.input_current_volume_km);
        return r.treningi.filter(function (w) { return w.workout_type === 'Wybieganie'; })
          .every(function (w) { return w.target_distance_km <= sufit + 0.05; });
      }), null);
    /* ⚠️ Powyższa asercja JEST samozwrotna (liczy sufit tą samą funkcją, którą
       sprawdza) — pilnuje tylko spójności silnika z samym sobą. Twardą liczbę
       pilnuje asercja capu niżej i test blizny „sufit-funkcja-bazy". */
    check('CAP 32 km jest nieprzekraczalny dla każdego dystansu i każdej bazy',
      ['5k', '10k', 'half', 'marathon'].every(function (dy) {
        return [0, 20, 80, 129, 300, 10000].every(function (b) {
          return sufitWybiegania(DYSTANSE[dy], b) <= Math.max(32, DYSTANSE[dy].maxDlugieKm) + 1e-9;
        });
      }), null);

    /* ══════════ REGRESJA: przypadek Filipa z testu na zywca ══════════
       129 km/tydz, P10 205 s/km, polmaraton, 10 tygodni, 6 dni.
       Szesc objawow zglosozonych z produkcji. Zaden nie moze wrocic. */
    sekcja('REGRESJA — Filip: 129 km/tydz, P10 3:25, half, 10 tyg, 6 dni');
    var F = uloz({ dystans: 'half', dataStartu: zaTygodni(10), dniWTygodniu: 6, today: TODAY,
                   poziom: { p10sec: 205, wynik: null, objetoscTygodniowa: 129 }, celCzasowy: null });
    check('plan w ogóle powstaje', F.ok === true, F.ok ? null : F.sciana);

    var Fdl = F.treningi.filter(function (w) { return w.workout_type === 'Wybieganie'; });
    var Fjak = F.treningi.filter(function (w) { return w.workout_type === 'Tempo' || w.workout_type === 'Interwały'; });

    // 1. BRAK SUFITU DŁUGIEGO — było 46,4 km na półmaratonie
    /* ⚠️ LICZBA PODNIESIONA Z 22 NA 32 ŚWIADOMIE, 19.08.2026. Przy bazie 129
       sufit to max(22, min(38,7, 32)) = CAP 32. To NIE jest rozluźnienie bramki
       na powrót buga: bug wynosił 46,4 km, a bez capu sam procent dawał tu 51 km
       (zmierzone). Cap 32 stoi między jednym a drugim i jest twardy. */
    check('1) żadne wybieganie nie przekracza 32 km (CAP przy bazie 129)',
      Fdl.every(function (w) { return w.target_distance_km <= 32.05; }),
      Fdl.map(function (w) { return w.target_distance_km; }));
    check('1) najdłuższe wybieganie NIE wraca do 46 km ANI do 51 km z samego procentu',
      Math.max.apply(null, Fdl.map(function (w) { return w.target_distance_km; })) < 36, null);
    check('1) reżim rozpoznany jako „fala"', F.meta.rezim === 'fala', F.meta.rezim);

    // 2. JAKOŚĆ BEZ SUFITU — było 23 km ciągłego biegu (90 min)
    var Ftempo = F.treningi.filter(function (w) { return w.workout_type === 'Tempo'; });
    var Fintw  = F.treningi.filter(function (w) { return w.workout_type === 'Interwały'; });
    /* ⚠️ 16 km to CAP sufitu akcentu, nie realna wartość — przy bazie 129 wiąże
       reguła 40 MINUT, nie kilometry, i praca wychodzi 11 km. Obie asercje muszą
       zostać: gdyby ktoś zdjął minuty, kilometry złapią to na 16. */
    check('2) akcent progowy ≤ 16 km ciągłego biegu (CAP sufitu akcentu)',
      Ftempo.every(function (w) { return +/\((\d+(?:\.\d+)?) km\)/.exec(w.description)[1] <= 16.05; }),
      Ftempo.map(function (w) { return w.description; }));
    check('2) akcent progowy ≤ ' + MAX_TEMPO_MIN + ' min',
      Ftempo.every(function (w) { return +/(\d+) min ciągłego biegu/.exec(w.description)[1] <= MAX_TEMPO_MIN; }),
      Ftempo.map(function (w) { return /(\d+) min/.exec(w.description)[1]; }));
    check('2) interwały ≤ ' + MAX_ODCINKOW + ' × 1000 m',
      Fintw.every(function (w) { return +/(\d+) × 1000 m/.exec(w.description)[1] <= MAX_ODCINKOW; }),
      Fintw.map(function (w) { return /(\d+) ×/.exec(w.description)[1]; }));
    check('2) nadmiar objętości poszedł w spokojne, nie w jakość',
      Fjak.every(function (w) { return w.target_distance_km <= 15; }),
      Fjak.map(function (w) { return w.workout_type + ' ' + w.target_distance_km; }));

    // 3. PŁASKI PLAN — było 129/129/129 przez cały okres
    var Fobj = F.meta.objetosciTygodni;
    var Fbud = Fobj.slice(0, F.meta.tygodnie - F.meta.taperTygodni);
    check('3) plan NIE jest płaski — objętości się różnią',
      new Set(Fbud.map(function (v) { return Math.round(v); })).size > 1, Fbud);
    check('3) start ≈ ' + Math.round(START_POD_BAZA * 100) + '% obecnej objętości',
      Math.abs(Fobj[0] - 129 * START_POD_BAZA) < 0.6, Fobj[0]);
    check('3) szczyt ≈ ' + Math.round(SZCZYT_NAD_BAZA * 100) + '% obecnej objętości',
      Math.abs(Math.max.apply(null, Fobj) - 129 * SZCZYT_NAD_BAZA) < 0.6, Math.max.apply(null, Fobj));
    check('3) plan nie cofa zawodnika poniżej jego bazy w szczycie',
      Math.max.apply(null, Fobj) >= 129, Math.max.apply(null, Fobj));

    // 4. plan_type kontra dlugosc — etykieta liczona z dat musi dać 10 tyg
    var Fdni = dzienIdx(F.plan.end_date) - dzienIdx(F.plan.start_date);
    check('4) daty planu obejmują dokładnie ' + F.meta.tygodnie + ' tygodni (PLANVIEW liczy etykietę z dat)',
      Math.floor(Fdni / 7) + 1 === F.meta.tygodnie, [Fdni, F.meta.tygodnie]);

    // 5. TAPER — start w poniedzialek nie moze zjadac tygodnia taperu
    check('5) niepełny tydzień startowy doliczony do taperu (' + F.meta.taperTygodni + ' zamiast ' + DYSTANSE.half.taper + ')',
      F.meta.taperTygodni === DYSTANSE.half.taper + 1, F.meta.taperTygodni);
    var ostatniPelny = F.meta.objetosciFaktyczne[F.meta.tygodnie - 2];
    check('5) ostatni PEŁNY tydzień przed startem jest realnym taperem (≤70% szczytu)',
      ostatniPelny <= Math.max.apply(null, F.meta.objetosciFaktyczne) * 0.70,
      [ostatniPelny, Math.max.apply(null, F.meta.objetosciFaktyczne)]);

    // 6. BRAK JAKOSCI w zrzutach i taperze — bylo 4, 8, 9, 10 bez akcentu
    var bezJakosci = [];
    for (var ft = 1; ft <= F.meta.tygodnie; ft++) {
      var maJakosc = F.treningi.some(function (w) {
        return w.week_number === ft && (w.workout_type === 'Tempo' || w.workout_type === 'Interwały');
      });
      if (!maJakosc) bezJakosci.push(ft);
    }
    check('6) jedynym tygodniem bez jakości jest tydzień startowy',
      bezJakosci.length === 1 && bezJakosci[0] === F.meta.tygodnie, bezJakosci);
    check('6) tydzień zrzutowy ma jakość (lżejszy, nie pusty)',
      F.treningi.some(function (w) { return w.week_number === 4 && (w.workout_type === 'Tempo' || w.workout_type === 'Interwały'); }), null);
    check('6) tygodnie taperu mają jakość',
      [F.meta.tygodnie - 2, F.meta.tygodnie - 1].every(function (t) {
        return F.treningi.some(function (w) { return w.week_number === t && (w.workout_type === 'Tempo' || w.workout_type === 'Interwały'); });
      }), null);

    // 7. Faza szczytowa ma OBA rodzaje jakosci, nie same interwaly
    check('7) w planie występują i Tempo, i Interwały', Ftempo.length > 0 && Fintw.length > 0,
      [Ftempo.length, Fintw.length]);
    check('7) w fazie szczytowej nie ma 5 interwałów z rzędu bez tempa',
      (function () {
        var seria = 0, max = 0;
        for (var t = 1; t <= F.meta.tygodnie; t++) {
          var w = F.treningi.filter(function (x) { return x.week_number === t && (x.workout_type === 'Tempo' || x.workout_type === 'Interwały'); })[0];
          if (!w) continue;
          if (w.workout_type === 'Interwały') { seria++; max = Math.max(max, seria); } else seria = 0;
        }
        return max <= 3;
      })(), null);

    // Spójność: żadna jednostka nie dłuższa od wybiegania, suma się zgadza
    check('spokojne nie przekraczają wybiegania nawet przy suficie',
      (function () {
        for (var t = 1; t < F.meta.tygodnie; t++) {
          var wk = F.treningi.filter(function (w) { return w.week_number === t && w.workout_type !== 'Odpoczynek'; });
          var dl = wk.filter(function (w) { return w.workout_type === 'Wybieganie'; })[0];
          if (!dl) continue;
          for (var i = 0; i < wk.length; i++) {
            if (wk[i].workout_type !== 'Wybieganie' && wk[i].target_distance_km > dl.target_distance_km + 0.05) return false;
          }
        }
        return true;
      })(), null);
    check('meta.objetosciFaktyczne zgadza się z sumą treningów tygodnia',
      F.meta.objetosciFaktyczne.every(function (v, i) {
        var suma = F.treningi.filter(function (w) { return w.week_number === i + 1; })
          .reduce(function (a, w) { return a + (w.target_distance_km || 0); }, 0);
        return Math.abs(v - suma) < 0.06;
      }), F.meta.objetosciFaktyczne);
    check('input_target_volume_km = faktyczny szczyt, nie planowany',
      F.plan.input_target_volume_km === Math.round(Math.max.apply(null, F.meta.objetosciFaktyczne)),
      [F.plan.input_target_volume_km, Math.max.apply(null, F.meta.objetosciFaktyczne)]);
    /* ⚠️ PRZYPADEK PODMIENIONY 19.08.2026. Do tej pory notę sprawdzano na F
       (half, 129 km/tydz, 6 dni) — po podniesieniu sufitów ten plan MIEŚCI pełną
       objętość, więc nota słusznie nie powstaje i asercja na nim testowałaby
       nieprawdę. Bierzemy przypadek, w którym sufity nadal gryzą: te same 129
       km/tydz na TRZECH dniach (78 zamiast 142 — trzy jednostki nie udźwigną
       142 km bez jednej monstrualnej). Nota ma być tam, gdzie jest strata. */
    var Fnota = uloz({ dystans: 'half', dataStartu: zaTygodni(10), dniWTygodniu: 3, today: TODAY,
                       poziom: { p10sec: 205, wynik: null, objetoscTygodniowa: 129 }, celCzasowy: null });
    check('sufity odnotowane w meta.zalozenia, nie przemilczane (3 dni, 129 km/tydz)',
      Fnota.ok && Fnota.meta.zalozenia.some(function (z) { return /Sufity jednostek/.test(z); }),
      Fnota.ok ? Fnota.meta.zalozenia : Fnota.sciana);
    /* ⚠️ SPROSTOWANE 25.08.2026: TEN PLAN NIE MIEŚCI OBJĘTOŚCI I NIGDY NIE
       MIEŚCIŁ. Asercja brzmiała „plan, który MIEŚCI objętość, noty NIE dostaje"
       i przechodziła tylko dlatego, że jedyna wtedy istniejąca nota patrzyła na
       SZCZYT: 135 z 141,9 to 95,1%, czyli o włos nad progiem 0,95.
       ZMIERZONE: tygodnie 5-7 dowożą po 135 km zamiast 141,9 — łącznie 20,9 km
       ubytku w fazie budowy przy luzie siatki 10,5 km. To nie jest zaokrąglenie.
       Nota sumaryczna słusznie się teraz odzywa; nota szczytowa słusznie nie.
       Test pilnuje OBU stron, zamiast twierdzić, że ubytku nie ma. */
    check('nota SZCZYTOWA nie odzywa się przy 95,1% szczytu (próg 0,95 działa)',
      !F.meta.zalozenia.some(function (z) { return /w szczycie zamiast/.test(z); }), F.meta.zalozenia);
    check('⚠️ …ale nota SUMARYCZNA łapie te 21 km, które szczyt przepuścił',
      F.meta.zalozenia.some(function (z) { return /W fazie budowy/.test(z); }), F.meta.zalozenia);

    /* ── PORZĄDEK STREF ─────────────────────────────────────────────────────
       Zgłoszenie brzmiało „interwały wolniejsze od tempa przy niektórych celach".
       Zmierzone na 108 planach (P10 od 150 do 600 s/km, cztery dystanse, bez celu
       / cel wolniejszy / cel szybszy): ZERO naruszeń, a różnica T−I wynosi ZAWSZE
       dokładnie 25 s/km. Odwrócenie porządku jest arytmetycznie niemożliwe, bo
       strefy to ADDYTYWNE przesunięcia od tego samego P10 (I = +5, T = +30).
       Ten test zamyka sprawę i nie pozwoli jej wrócić po cichu.

       ⚠️ ALE JEST TU PRAWDZIWA WADA, TYLKO INNA — i zostaje jako zaległość,
       bo jej naprawa to zmiana modelu stref, nie poprawka. Stałe przesunięcie
       zastosowane do czterokrotnego rozstępu wydolności ROZJEŻDŻA SIĘ względnie:
           P10  2:30/km → I 2:35, T 3:00 — różnica 16,7% tempa
           P10  5:00/km → I 5:05, T 5:30 — różnica  8,3%
           P10 10:00/km → I 10:05, T 10:30 — różnica  4,2%
       Dla wolnego biegacza interwały i tempo stają się nierozróżnialne. Model
       procentowy zamiast addytywnego to decyzja metodyczna — do Filipa. */
    /* ── TAPER ZALEŻY OD DYSTANSU ───────────────────────────────────────────
       Zgłoszenie brzmiało „plan 8-tygodniowy na maraton dostaje ten sam taper co
       na piątkę". Zmierzone: taki plan NIE ISTNIEJE (maraton wymaga 16 tygodni,
       półmaraton 10), a taper jest deklarowany per dystans — 1/1/2/3 — i nigdy
       nie jest skracany przez długość planu. Przemiot 200 dat startu × 4 warianty
       dni × 3 bazy: HM nigdy poniżej 2 tygodni taperu, maraton nigdy poniżej 3.
       Testy poniżej pilnują, żeby to zostało prawdą po kolejnych zmianach. */
    sekcja('TAPER — zależny od dystansu, nigdy skracany przez długość planu');
    check('deklaracja taperu rośnie z dystansem: 1 / 1 / 2 / 3',
      DYSTANSE['5k'].taper === 1 && DYSTANSE['10k'].taper === 1 &&
      DYSTANSE.half.taper === 2 && DYSTANSE.marathon.taper === 3, null);
    check('w ŻADNYM planie HM taper nie schodzi poniżej 2 tyg., a w maratonie poniżej 3',
      (function () {
        for (var dy in { half: 1, marathon: 1 }) {
          for (var t = 8; t <= 40; t++) {
            for (var dd = 4; dd <= 6; dd++) {
              var r = uloz(we({ dystans: dy, dataStartu: zaTygodni(t), dniWTygodniu: dd,
                                poziom: poziom({ objetoscTygodniowa: 70 }) }));
              if (r.ok && r.meta.taperTygodni < DYSTANSE[dy].taper) return false;
            }
          }
        }
        return true;
      })(), null);
    check('plan krótszy niż minTygodni nie powstaje dla żadnego dystansu (8 tyg: tylko 5k i 10k)',
      uloz(we({ dystans: 'marathon', dataStartu: zaTygodni(8), dniWTygodniu: 5, poziom: poziom({ objetoscTygodniowa: 70 }) })).ok === false &&
      uloz(we({ dystans: 'half', dataStartu: zaTygodni(8), dniWTygodniu: 5, poziom: poziom({ objetoscTygodniowa: 70 }) })).ok === false &&
      uloz(we({ dystans: '10k', dataStartu: zaTygodni(8), dniWTygodniu: 5, poziom: poziom({ objetoscTygodniowa: 70 }) })).ok === true, null);

    sekcja('SUFIT UDZIAŁU WYBIEGANIA');
    check('przy 4, 5 i 6 dniach wybieganie nigdy nie przekracza ' + Math.round(MAX_UDZIAL_DLUGIEGO * 100) + '% tygodnia',
      (function () {
        var lista = ['5k', '10k', 'half', 'marathon'], najw = 0;
        for (var a = 0; a < lista.length; a++) for (var dd = 4; dd <= 6; dd++) for (var bz = 21; bz <= 90; bz += 23) {
          var r = uloz(we({ dystans: lista[a], dataStartu: zaTygodni(lista[a] === 'marathon' ? 20 : 16),
                            dniWTygodniu: dd, poziom: poziom({ objetoscTygodniowa: bz }) }));
          if (!r.ok) continue;
          for (var t = 1; t < r.meta.tygodnie; t++) {
            var wk = r.treningi.filter(function (w) { return w.week_number === t && (w.target_distance_km || 0) > 0; });
            var dl = wk.filter(function (w) { return w.workout_type === 'Wybieganie'; })[0];
            if (!dl) continue;
            var s = 0; for (var q = 0; q < wk.length; q++) s += wk[q].target_distance_km;
            najw = Math.max(najw, dl.target_distance_km / s);
          }
        }
        return najw <= MAX_UDZIAL_DLUGIEGO + 0.015;      // 1,5 pkt proc. luzu na siatkę 0,5 km
      })(), null);
    /* ⚠️ TEN TEST BYŁ ZIELONY Z PRZYPADKU, NIE Z PRAWDY — sprostowane 25.08.2026.
       Chodził po bazach 21, 44, 67, 90 (krok 23) i akurat te nie łapały wady.
       PRZEMIERZONE co 1 km/tydz na zakresie 12–140: wybieganie NIE jest
       najdłuższą jednostką w 29 tygodniach (przed zmianą krzywej: 26 — czyli
       wada jest starsza od niej). Dzieje się to wyłącznie tam, gdzie wybieganie
       zeszło pod MIN_WYBIEGANIA_KM, czyli przy bazach 12–29 km/tydz.

       Test asertuje więc to, co NAPRAWDĘ obowiązuje — niezmiennik trzyma się
       wszędzie tam, gdzie podłoga wybiegania nie została złamana — i osobno
       PILNUJE LICZBY wyjątków, żeby cicho nie urosła. Gdyby zostawić samo
       `return true`, test dalej twierdziłby, że niezmiennik jest bezwarunkowy. */
    check('wybieganie jest najdłuższą jednostką ZAWSZE, gdy nie złamano jego podłogi',
      (function () {
        var lista = ['5k', '10k', 'half', 'marathon'];
        for (var a = 0; a < lista.length; a++) for (var dd = 3; dd <= 6; dd++) for (var bz = 12; bz <= 140; bz++) {
          if (lista[a] === 'marathon' && dd === 3) continue;
          var r = uloz(we({ dystans: lista[a], dataStartu: zaTygodni(lista[a] === 'marathon' ? 20 : 16),
                            dniWTygodniu: dd, poziom: poziom({ objetoscTygodniowa: bz }) }));
          if (!r.ok) continue;
          for (var t = 1; t < r.meta.tygodnie; t++) {
            var wk = r.treningi.filter(function (w) { return w.week_number === t && (w.target_distance_km || 0) > 0; });
            var dl = wk.filter(function (w) { return w.workout_type === 'Wybieganie'; })[0];
            if (!dl) continue;
            if (dl.target_distance_km < MIN_WYBIEGANIA_KM - 1e-9) continue;   // znany wyjątek, liczony niżej
            for (var q = 0; q < wk.length; q++) {
              if (wk[q].workout_type !== 'Wybieganie' && wk[q].target_distance_km > dl.target_distance_km + 0.001) return false;
            }
          }
        }
        return true;
      })(), null);
    check('⚠️ ZNANA WADA (starsza niż krzywa): wybieganie schodzi pod podłogę — liczba wyjątków nie rośnie',
      (function () {
        var lista = ['5k', '10k', 'half', 'marathon'], ile = 0;
        for (var a = 0; a < lista.length; a++) for (var dd = 3; dd <= 6; dd++) for (var bz = 12; bz <= 140; bz++) {
          if (lista[a] === 'marathon' && dd < 4) continue;
          var r = uloz(we({ dystans: lista[a], dataStartu: zaTygodni(lista[a] === 'marathon' ? 20 : 16),
                            dniWTygodniu: dd, poziom: poziom({ objetoscTygodniowa: bz }) }));
          if (!r.ok) continue;
          for (var q = 0; q < r.treningi.length; q++) {
            var w = r.treningi[q];
            if (w.workout_type === 'Wybieganie' && w.target_distance_km < MIN_WYBIEGANIA_KM - 1e-9) ile++;
          }
        }
        return ile <= 268;      // zmierzone 25.08.2026; przed zmianą krzywej 256
      })(), null);

    sekcja('PORZĄDEK STREF — I < T < E < Reg niezależnie od formy i celu');
    /* ⚠️ PORZĄDEK JEST OSTRY TAM, GDZIE NIESIE TREŚĆ, i nieostry przy podłodze marszu.
       I < T < E musi być zawsze — to są trzy różne bodźce i ich pomylenie psuje
       trening. E ≤ Reg, bo powyżej P10 = 9:20/km obie strefy dobijają do sufitu
       12:00/km i zrównują się: dla kogoś, kto biegnie dziesiątkę w 1:33, spokojne
       i regeneracyjne NAPRAWDĘ są tym samym wysiłkiem. Wymuszanie tam ostrej
       nierówności znaczyłoby kazać mu „regenerować się" szybciej niż idzie. */
    check('strefy zachowują porządek I < T < E ≤ Reg na całym rozstępie (150–600 s/km)',
      [150, 205, 240, 300, 360, 420, 500, 520, 560, 600].every(function (p) {
        return tempoStrefy(p, 'I') < tempoStrefy(p, 'T')
            && tempoStrefy(p, 'T') < tempoStrefy(p, 'E')
            && tempoStrefy(p, 'E') <= tempoStrefy(p, 'Reg');
      }), null);
    check('żadna strefa nie jest wolniejsza od marszu (' + fmtTempo(TEMPO_MARSZU) + '/km)',
      [150, 300, 500, 600].every(function (p) {
        return ['E', 'Reg', 'T', 'I'].every(function (s) { return tempoStrefy(p, s) <= TEMPO_MARSZU; });
      }), null);
    /* ⚠️ TE DWA TESTY PILNOWAŁY STAREGO MODELU (stałe przesunięcia od P10,
       skalibrowane na 489 treningach). Po przejściu na Danielsa punkt kalibracji
       nie istnieje — kotwicą jest opublikowana tabela, więc testy sprawdzają
       teraz ZGODNOŚĆ Z NIĄ, a nie z biblioteką. Wartości wobec VDOT 60
       (fellrnr.com/wiki/VDOT_Results?Vdot=60&Metric=true): M 3:52, T 3:39,
       I 3:22, R 3:07, E w zakresie 4:14–4:48. */
    check('próg to wysiłek GODZINNY, nie osobna liczba (%VO2max(60 min) = udział T)',
      Math.abs(UDZIALY.T - danielsPctVO2(60)) < 1e-12 && Math.abs(UDZIALY.T - 0.888) < 0.001,
      Math.round(UDZIALY.T * 10000) / 100);
    check('odtwarza opublikowaną tabelę Danielsa dla VDOT 60 co do sekundy',
      (function () {
        var p10 = 211.8;                       // dziesiątka 35:18 = VDOT 60
        var oczek = { M: 232, T: 219, I: 202, R: 187 };
        for (var s in oczek) {
          if (Math.abs(tempoStrefy(p10, s) - oczek[s]) > 1.5) return false;
        }
        var e = tempoStrefy(p10, 'E');
        return e > 254 && e < 288;             // 4:14–4:48
      })(), null);
    check('VDOT policzony z dziesiątki 35:18 wynosi ok. 60',
      Math.abs(vdotZP10(211.8) - 60) < 0.5, Math.round(vdotZP10(211.8) * 100) / 100);
    check('rozdzielczość stref NIE zależy od formy (T−I jako % tempa, rozstęp 150–600 s/km)',
      (function () {
        var proc = [150, 205, 300, 420, 600].map(function (p) {
          return (tempoStrefy(p, 'T') - tempoStrefy(p, 'I')) / tempoStrefy(p, 'I');
        });
        return Math.max.apply(null, proc) - Math.min.apply(null, proc) < 0.01;
      })(), null);
    sekcja('RIEGEL');
    check('5 km 20:00 → 10 km ok. 41:41', Math.abs(riegel(1200, 5, 10) - 2501) < 5, Math.round(riegel(1200, 5, 10)));
    check('10 km 50:00 → maraton 3:50:01', fmtCzas(prognozaCzasu(300, 42.195)) === '3:50:01', fmtCzas(prognozaCzasu(300, 42.195)));
    /* ⚠️ BYŁO: „p10ZWyniku(Riegel(300)) === 300". Ta tożsamość trzymała się tylko
       dlatego, że OBA kierunki szły tym samym wzorem Riegla. Od czasu kotwiczenia
       przez VDOT konwersja w drugą stronę idzie równaniem Danielsa, więc dokładna
       tożsamość nie zachodzi i nie ma zachodzić — to dwa różne modele.
       Zmierzona rozbieżność: ok. 2%, czyli tyle, ile wynosi znany błąd Riegla
       (patrz komentarz przy najblizszyWynik). Test pilnuje teraz, że modele
       nie rozjeżdżają się BARDZIEJ niż o ten błąd. */
    check('Riegel i VDOT zgadzają się co do formy w granicach błędu Riegla (2,5%)',
      (function () {
        return [5, 10, 21.0975, 42.195].every(function (km) {
          var p = p10ZWyniku(km, prognozaCzasu(300, km));
          return Math.abs(p / 300 - 1) < 0.025;
        });
      })(), [5, 10, 21.0975, 42.195].map(function (km) {
        return Math.round(p10ZWyniku(km, prognozaCzasu(300, km)) * 10) / 10;
      }));

    sekcja('ADAPTACJA PLANU');
    /* ⚠️ DO 18.08.2026 CAŁA ADAPTACJA BYŁA BEZ TESTÓW, a `przywroc` był gałęzią,
       która nie mogła odpalić: klient podstawiał `wObnizce: false` na sztywno,
       bo nie było gdzie tego stanu trzymać. Gałąź istniała i wyglądała na
       działającą — dokładnie ten kształt, co inne martwe gałęzie z sierpnia. */
    function tydz(planKm, wykonaneKm, jP, jZ) {
      return { planKm: planKm, wykonaneKm: wykonaneKm,
               jednostekPlan: jP == null ? 4 : jP, jednostekZrobionych: jZ == null ? 4 : jZ };
    }
    function ad(o) {
      return oceniAdaptacje(Object.assign({
        today: '2026-08-17', ostatniLog: '2026-08-16', bazaPlanu: 40,
        tygodnie: [tydz(40, 40), tydz(40, 40)], wObnizce: false
      }, o));
    }

    check('plan wykonywany → nic nie mówimy', ad({}).akcja === 'brak', ad({}).akcja);
    check('dwa tygodnie poniżej 75% → obniżka',
      ad({ tygodnie: [tydz(40, 25), tydz(40, 26)] }).akcja === 'obniz',
      ad({ tygodnie: [tydz(40, 25), tydz(40, 26)] }).akcja);
    check('…i obniżka schodzi do 80% bazy',
      ad({ tygodnie: [tydz(40, 25), tydz(40, 26)] }).doKm === 32,
      ad({ tygodnie: [tydz(40, 25), tydz(40, 26)] }).doKm);
    check('jeden słaby tydzień z dwóch → jeszcze nie reagujemy',
      ad({ tygodnie: [tydz(40, 25), tydz(40, 40)] }).akcja === 'brak', null);
    check('odpadają jednostki, nie kilometry → mniej dni zamiast obniżki',
      ad({ tygodnie: [tydz(40, 20, 5, 2), tydz(40, 20, 5, 3)] }).akcja === 'mniej_dni', null);

    /* Wyjście z obniżki — gałąź, dla której powstały kolumny
       training_plans.baza_obnizona_km / obnizona_od. */
    check('WYJŚCIE: w obniżce + wyrabia w całości → przywroc',
      ad({ wObnizce: true }).akcja === 'przywroc', ad({ wObnizce: true }).akcja);
    check('⚠️ ta sama sytuacja BEZ flagi obniżki → milczenie (dowód, że flaga jest nośna)',
      ad({ wObnizce: false }).akcja === 'brak', null);
    check('WYJŚCIE stoi PRZED wejściem — w obniżce i nadal nie wyrabia → nie przywracamy',
      ad({ wObnizce: true, tygodnie: [tydz(40, 25), tydz(40, 26)] }).akcja === 'obniz', null);

    /* ⚠️ TO JEST TEST NA POWÓD ISTNIENIA MNOŻNIKA W KLIENCIE.
       Człowiek po obniżce z 40 na 32 km/tydz biega dokładnie te 32 km.
       • mierzony OBNIŻONYM celem: 32/32 = 1,00 → wyrabia plan → wychodzi,
       • mierzony PIERWOTNYM celem: 29/40 = 0,73 → poniżej progu 0,75 → obniżka
         się utrwala i wyjście nie odpala NIGDY.
       Drugi wariant to stan sprzed 18.08.2026. Skalowanie celu sprawia, że
       zdanie silnika „wykonuje obniżony plan w całości" znaczy to, co mówi.
       Mnożnik liczy klient w `_zbierzDaneAdaptacji`. */
    check('po obniżce mierzymy OBNIŻONYM celem — 32/32 wychodzi z obniżki',
      ad({ wObnizce: true, bazaPlanu: 32, tygodnie: [tydz(32, 32), tydz(32, 32)] }).akcja === 'przywroc', null);
    check('…a ten sam bieg mierzony PIERWOTNYM celem obniżkę utrwala',
      ad({ wObnizce: true, bazaPlanu: 32, tygodnie: [tydz(40, 29), tydz(40, 29)] }).akcja === 'obniz', null);

    check('przerwa 10–27 dni → cofnięcie objętości, nie ściana',
      ad({ ostatniLog: '2026-08-02' }).akcja === 'cofnij', ad({ ostatniLog: '2026-08-02' }).akcja);
    check('przerwa 28+ dni → ściana, plan od nowa',
      ad({ ostatniLog: '2026-07-01' }).akcja === 'sciana', ad({ ostatniLog: '2026-07-01' }).akcja);
    check('nadwykonanie → tylko mówimy, NIE podnosimy planu',
      ad({ tygodnie: [tydz(40, 60), tydz(40, 58)] }).akcja === 'tylko_powiedz', null);
    check('za mało tygodni danych → milczenie, nie zgadywanie',
      ad({ tygodnie: [tydz(40, 10)] }).akcja === 'brak', null);

    console.log('\n  zaliczone: ' + pass + '   niezaliczone: ' + fail + '\n');
    if (typeof process !== 'undefined' && process.exit) process.exit(fail === 0 ? 0 : 1);
  }

})(typeof window !== 'undefined' ? window : null);
