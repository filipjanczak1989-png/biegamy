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
     maxDlugieKm    — SUFIT wybiegania. minDlugieProc pilnuje dołu i NIC nie pilnowało góry:
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
    '5k':       { km: 5.0,     etykieta: '5 km',        minTygodni: 4,  peakKm: 30, taper: 1, minSzczyt: 20, udzialDlugiego: 0.30, minDlugieProc: 0.60, maxDlugieKm: 14, minCzas: 720,  maxCzas: 3600 },
    '10k':      { km: 10.0,    etykieta: '10 km',       minTygodni: 6,  peakKm: 40, taper: 1, minSzczyt: 25, udzialDlugiego: 0.33, minDlugieProc: 0.60, maxDlugieKm: 18, minCzas: 1500, maxCzas: 7200 },
    'half':     { km: 21.0975, etykieta: 'Półmaraton',  minTygodni: 10, peakKm: 55, taper: 2, minSzczyt: 30, udzialDlugiego: 0.36, minDlugieProc: 0.55, maxDlugieKm: 22, minCzas: 3240, maxCzas: 15190 },
    'marathon': { km: 42.195,  etykieta: 'Maraton',     minTygodni: 16, peakKm: 70, taper: 3, minSzczyt: 45, udzialDlugiego: 0.40, minDlugieProc: 0.55, maxDlugieKm: 34, minCzas: 6780, maxCzas: 30380 }
  };

  var MAX_POPRAWA = 0.08;        // cel czasowy: max 8% szybciej niż prognoza z obecnej formy
  var MAX_PRZYROST_TYG = 0.08;   // objętość: max 8% tydzień do tygodnia
  var ZRZUT = 0.70;              // co czwarty tydzień: 70% trendu (cykl 3:1)
  var ZRZUT_CO = 4;
  var MIN_DNI = 3, MAX_DNI = 6;
  var MARATON_MIN_DNI = 4;       // maratonu nie da się unieść na trzech jednostkach
  var OBJETOSC_DOMYSLNA = 20;    // km/tydz przy braku danych — FLOOR, świadomie w dół
  var RIEGEL = 1.06;

  /* Szczyt objętości = sufit bezpieczeństwa, nie cel do osiągnięcia.
     peakKm dystansu jest bezwzględnym sufitem, ale przy zawodniku na 30 km/tydz
     szczyt 70 to fikcja — stąd drugi sufit, względny.
     ⚠️ MNOZNIK_SZCZYTU to OSĄD, nie pomiar.
     Podłoga na obecnej objętości jest dodatkiem do formuły min(): bez niej
     zawodnik biegający 90 km/tydz dostałby na maratonie szczyt 70, czyli
     COFNIĘCIE — a to dokładnie ten przypadek, dla którego sufit względny
     powstał. Plan nigdy nie proponuje mniej, niż ktoś już biega. */
  var MNOZNIK_SZCZYTU = 1.6;

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
  var MAX_TEMPO_KM = 10;                 // sufit ciągłego akcentu progowego…
  var MAX_TEMPO_MIN = 40;                // …albo 40 min, co wypadnie krócej

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
    'Ten plan się nie dostosuje. Jeśli złapiesz kontuzję, tydzień Ci wypadnie ' +
    'albo coś przestanie działać — plan tego nie zauważy. Filip i Kasia zauważą.';

  // ── DATY ───────────────────────────────────────────────────────────────────
  // Liczone wyłącznie w UTC na stringach 'YYYY-MM-DD'. Nigdy toISOString() na
  // lokalnej dacie — to cofa o dzień w strefach dodatnich (Europe/Warsaw).
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
  function poprawnaData(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(dzienIdx(s)); }

  // ── TEMPO ──────────────────────────────────────────────────────────────────
  function fmtTempo(sekNaKm) {
    var t = Math.round(sekNaKm);
    return Math.floor(t / 60) + ':' + pad2(t % 60);
  }
  function riegel(czas_s, zKm, naKm) { return czas_s * Math.pow(naKm / zKm, RIEGEL); }
  function p10ZWyniku(dystans_km, czas_s) { return riegel(czas_s, dystans_km, 10) / 10; }
  function prognozaCzasu(p10sec, km) { return riegel(p10sec * 10, 10, km); }
  function tempoStrefy(p10sec, strefa) { return p10sec + STREFY[strefa]; }

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
      return odmowa('ZA_MALO_TYGODNI',
        'Do startu zostało ' + tygodnie + ' tyg., a na ' + d.etykieta.toLowerCase() + ' potrzeba minimum ' + d.minTygodni + '.',
        { tygodnieDostepne: tygodnie, tygodnieWymagane: d.minTygodni, dystans: we.dystans });
    }

    // Poziom wyjściowy — bez kotwicy NIE zgadujemy tempa.
    var poziom = we.poziom || {};
    var p10 = poziom.p10sec;
    if (p10 == null && poziom.wynik && poziom.wynik.dystans_km > 0 && poziom.wynik.czas_s > 0) {
      p10 = p10ZWyniku(poziom.wynik.dystans_km, poziom.wynik.czas_s);
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
      if (we.celCzasowy < d.minCzas) {
        return odmowa('CZAS_POZA_SKALA',
          'Ten czas jest szybszy niż rekord świata. Sprawdź, czy dobrze wpisałeś.',
          { podany_s: we.celCzasowy, prog_s: d.minCzas, dystans: we.dystans, kierunek: 'za_szybko' });
      }
      if (we.celCzasowy > d.maxCzas) {
        return odmowa('CZAS_POZA_SKALA',
          'Ten czas to ' + fmtTempo(we.celCzasowy / d.km) + '/km — wolniej niż marsz. Sprawdź, czy dobrze wpisałeś.',
          { podany_s: we.celCzasowy, prog_s: d.maxCzas, dystans: we.dystans, kierunek: 'za_wolno' });
      }
      var p10Celu = p10ZWyniku(d.km, we.celCzasowy);

      var prognoza = prognozaCzasu(p10Formy, d.km);
      var poprawa = (prognoza - we.celCzasowy) / prognoza;
      if (poprawa > MAX_POPRAWA) {
        var celRealny = prognoza * (1 - MAX_POPRAWA);
        /* ⚠️ Najważniejszy komunikat w całym generatorze. Człowiek przychodzi
           z marzeniem i ma wyjść z LICZBĄ, nie z odmową. Trzy zdania: co jest
           nie tak, co jest realne, i że cel nie umarł — tylko nie na ten start. */
        return odmowa('CEL_ZA_AMBITNY',
          'Przy Twojej obecnej formie ' + fmtCzas(we.celCzasowy) + ' to za duży skok. ' +
          'Realny cel na ten start: ' + fmtCzas(celRealny) + '. ' +
          fmtCzas(we.celCzasowy) + ' jest w zasięgu, ale potrzebujesz kilku sezonów, nie ' +
          tygodnie + ' tygodni.',
          { poprawaProc: Math.round(poprawa * 1000) / 10, limitProc: MAX_POPRAWA * 100,
            prognoza_s: Math.round(prognoza), celRealny_s: Math.round(celRealny) });
      }

      /* Cel WOLNIEJSZY od formy przechodzi tędy bez progu i bez komentarza:
         poprawa wychodzi ujemna, więc ściana nie odpala. Świadomie — powody
         bywają niewidoczne (powrót po kontuzji, pacerowanie, maraton jako
         jednostka przed ultra), a wolniejsze tempa dadzą spokojniejszy plan.
         O to właśnie chodzi. */
      p10 = p10Celu;
    }

    // Objętość — ile trzeba dołożyć i czy da się to zrobić w tempie ≤8%/tydz.
    var obecna = poziom.objetoscTygodniowa;
    var zalozonaObjetosc = false;
    if (!(obecna > 0)) { obecna = OBJETOSC_DOMYSLNA; zalozonaObjetosc = true; }

    // Niepełny tydzień startowy (start inny niż niedziela) NIE liczy się jako tydzień
    // taperu — inaczej przy starcie w poniedziałek ostatni PEŁNY tydzień przed
    // zawodami dostawał najlżejszy schodek i taper de facto trwał tydzień zamiast dwóch.
    var startWNiedziele = dzienTygodnia(idxStart) === 0;
    var taperTyg = d.taper + (startWNiedziele ? 0 : 1);
    var budowa = Math.max(1, tygodnie - taperTyg);

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
      peak = Math.min(d.peakKm, obecna * MNOZNIK_SZCZYTU);
      startTyg = obecna;
    }

    // ZA_MALA_BAZA — jedyna odmowa, którą człowiek może sam naprawić, więc niesie
    // konkretną liczbę do osiągnięcia. Sufit obecna×MNOZNIK obniża szczyt, a niższy
    // szczyt jest łatwiej osiągalny — bez tej bramki ściana narastania przestawała
    // się odzywać dokładnie dla maratonu i półmaratonu.
    if (obecna * MNOZNIK_SZCZYTU < d.minSzczyt) {
      var wymBaza = Math.ceil(d.minSzczyt / MNOZNIK_SZCZYTU);
      return odmowa('ZA_MALA_BAZA',
        'Przy ' + Math.round(obecna) + ' km/tydz ' + d.etykieta.toLowerCase() + ' wymagałby dojścia do ' + d.minSzczyt +
        ' km/tydz, czyli ' + (Math.round(d.minSzczyt / obecna * 10) / 10) + '× więcej niż biegasz teraz. Zbuduj bazę do ~' +
        wymBaza + ' km/tydz albo wybierz bliższy cel.',
        { obecna_km: Math.round(obecna), minSzczyt_km: d.minSzczyt, wymaganaBaza_km: wymBaza,
          objetoscZalozona: zalozonaObjetosc, dystans: we.dystans });
    }

    // Baza porównania to OBECNA objętość, nie obniżony start pierwszego tygodnia.
    // W trybie kształtu plan schodzi do 90% i wraca do 110% tego, co zawodnik już
    // biega — to fala wokół istniejącej formy, a nie wzrost obciążenia, więc liczenie
    // przyrostu od 90% sztucznie zawyżałoby tempo narastania i odbijało zdrowe plany.
    if (peak > obecna) {
      var przyrost = Math.pow(peak / obecna, 1 / budowa) - 1;
      if (przyrost > MAX_PRZYROST_TYG) {
        return odmowa('SKOK_OBJETOSCI',
          'Biegasz ' + Math.round(obecna) + ' km/tydz, a ' + d.etykieta.toLowerCase() + ' wymaga dojścia do ok. ' + Math.round(peak) +
          ' km/tydz. W ' + tygodnie + ' tyg. znaczyłoby to +' + Math.round(przyrost * 100) + '% tygodniowo — powyżej bezpiecznych ' +
          Math.round(MAX_PRZYROST_TYG * 100) + '%.',
          { obecna_km: Math.round(obecna), peak_km: Math.round(peak), tygodnie: tygodnie,
            przyrostProc: Math.round(przyrost * 1000) / 10, limitProc: MAX_PRZYROST_TYG * 100,
            objetoscZalozona: zalozonaObjetosc });
      }
    }

    return { ok: true, kontekst: { d: d, p10: p10, p10Formy: p10Formy, tygodnie: tygodnie, idxPn: idxPn, idxStart: idxStart,
                                   obecna: obecna, peak: peak, startTyg: startTyg, budowa: budowa, rezim: rezim,
                                   taperTyg: taperTyg, startWNiedziele: startWNiedziele,
                                   zalozonaObjetosc: zalozonaObjetosc } };
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
  function objetosciTygodni(k) {
    var out = [], biezaca = k.startTyg, i;
    for (i = 1; i <= k.budowa; i++) {
      if (i > 1) biezaca = Math.min(k.peak, biezaca * (1 + MAX_PRZYROST_TYG));
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

  function jednostkaJakosci(typ, kmZUdzialu, p10) {
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
    // Sufit akcentu progowego: 10 km ALBO 40 min, co wypadnie krócej. Bez tego
    // zawodnik na 129 km/tydz dostawał 23 km ciągłego biegu (90 min) jako „tempo".
    var tempoPace = tempoStrefy(p10, 'T');
    kmPracy = Math.min(kmPracy, MAX_TEMPO_KM, Math.round(MAX_TEMPO_MIN * 60 / tempoPace));
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
    for (i = 0; i < typy.length; i++) {
      if (typy[i] === 'Wybieganie')        { km[i] = Math.min(k.d.udzialDlugiego * kmTyg, k.d.maxDlugieKm); zajete += km[i]; }
      else if (typy[i] === 'Regeneracja')  { km[i] = Math.min(0.10 * kmTyg, k.d.maxDlugieKm); zajete += km[i]; }
      else if (typy[i] === 'Tempo' || typy[i] === 'Interwały') {
        var j = jednostkaJakosci(typy[i], 0.20 * kmTyg, k.p10);
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
    var przySuficie = idxDlugie >= 0 && km[idxDlugie] >= k.d.maxDlugieKm - 0.001;
    if (spokojne.length && idxDlugie >= 0 && !przySuficie && naSpokojny > 0.9 * km[idxDlugie]) {
      var pula = km[idxDlugie] + reszta;
      var jedenSpokojny = pula / (spokojne.length + DLUGIE_NAD_SPOKOJNYM);
      km[idxDlugie] = Math.min(jedenSpokojny * DLUGIE_NAD_SPOKOJNYM, k.d.maxDlugieKm);
      naSpokojny = (pula - km[idxDlugie]) / spokojne.length;
    }
    // Spokojny nigdy dłuższy od wybiegania. Gdy sufity się zamykają, tydzień NIE
    // dobija do zaplanowanej objętości — i tak ma być: lepiej oddać mniej kilometrów
    // niż wypchnąć je w jedną jednostkę, która przestaje być spokojna.
    if (idxDlugie >= 0) naSpokojny = Math.min(naSpokojny, km[idxDlugie]);
    spokojne.forEach(function (idx) { km[idx] = Math.max(2, naSpokojny); });

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
    if (najdluzsze < progDlugiego - 0.05) {
      var potrzebnyPeak = progDlugiego / k.d.udzialDlugiego;
      var bazaDlaDlugiego = Math.ceil(potrzebnyPeak / MNOZNIK_SZCZYTU);
      return odmowa('ZA_KROTKIE_WYBIEGANIE',
        'Najdłuższe wybieganie w takim planie to ' + (Math.round(najdluzsze * 10) / 10) + ' km, a przed startem na ' +
        k.d.etykieta.toLowerCase() + ' trzeba dobiec co najmniej ' + (Math.round(progDlugiego * 10) / 10) + ' km (' +
        Math.round(k.d.minDlugieProc * 100) + '% dystansu). Zbuduj bazę do ~' + bazaDlaDlugiego +
        ' km/tydz albo wybierz bliższy cel.',
        { najdluzsze_km: Math.round(najdluzsze * 10) / 10, wymagane_km: Math.round(progDlugiego * 10) / 10,
          procDystansu: Math.round(k.d.minDlugieProc * 100), obecna_km: Math.round(k.obecna),
          wymaganaBaza_km: bazaDlaDlugiego, dystans: wejscie.dystans });
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
    var prognoza = prognozaCzasu(k.p10, k.d.km);

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

    return {
      ok: true,
      plan: plan,
      treningi: treningi,
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
            ? ['Sufity jednostek (wybieganie do ' + k.d.maxDlugieKm + ' km, akcent do ' + MAX_TEMPO_KM +
               ' km) nie pozwalają rozłożyć pełnej objętości na ' + dni + ' dni — plan zadaje ' +
               Math.round(szczytTyg) + ' km/tydz w szczycie zamiast ' + Math.round(Math.max.apply(null, objetosci)) + '.']
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
      target_distance_km: km != null ? Math.round(km * 10) / 10 : null,
      target_pace: tempo || null
    };
  }

  function typPlanu(tyg) {
    if (tyg <= 1) return 'weekly';
    if (tyg === 2) return 'micro';
    if (tyg <= 4) return 'meso';
    return 'macro';
  }

  function podsumowanie(k, dni, szczyt, prognoza, we) {
    var s = k.d.etykieta + ' za ' + k.tygodnie + ' tyg., ' + dni + ' dni biegania w tygodniu. ' +
      'Objętość rośnie z ' + Math.round(k.obecna) + ' do ' + Math.round(szczyt) + ' km/tydz, co czwarty tydzień lżejszy. ' +
      'Tempa liczone od Twojej dziesiątki (' + fmtTempo(k.p10) + '/km).';
    if (we.celCzasowy != null) s += ' Cel ' + fmtCzas(we.celCzasowy) + ' przy prognozie ' + fmtCzas(prognoza) + '.';
    else s += ' Prognoza na dziś: ' + fmtCzas(prognoza) + '.';
    return s;
  }

  // ── EKSPORT ────────────────────────────────────────────────────────────────
  var API = {
    uloz: uloz,
    STREFY: STREFY,
    DYSTANSE: DYSTANSE,
    LIMITY: { MAX_POPRAWA: MAX_POPRAWA, MAX_PRZYROST_TYG: MAX_PRZYROST_TYG,
              MIN_DNI: MIN_DNI, MAX_DNI: MAX_DNI, MARATON_MIN_DNI: MARATON_MIN_DNI,
              OBJETOSC_DOMYSLNA: OBJETOSC_DOMYSLNA, ZRZUT: ZRZUT, ZRZUT_CO: ZRZUT_CO,
              MNOZNIK_SZCZYTU: MNOZNIK_SZCZYTU, ROZGRZEWKA: ROZGRZEWKA, SCHLODZENIE: SCHLODZENIE, ODCINEK_M: ODCINEK_M,
              DLUGIE_NAD_SPOKOJNYM: DLUGIE_NAD_SPOKOJNYM, MAX_ODCINKOW: MAX_ODCINKOW, MAX_JAKOSC_W_TYG: MAX_JAKOSC_W_TYG,
              MAX_TEMPO_KM: MAX_TEMPO_KM, MAX_TEMPO_MIN: MAX_TEMPO_MIN,
              START_POD_BAZA: START_POD_BAZA, SZCZYT_NAD_BAZA: SZCZYT_NAD_BAZA },
    ZAMKNIECIE: ZAMKNIECIE,
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
      var g = uloz(we({ dystans: c[0], dataStartu: zaTygodni(c[1]), dniWTygodniu: 5,
                        poziom: poziom({ objetoscTygodniowa: 60 }) }));
      check(c[0] + ': dokładnie ' + c[1] + ' tyg. PRZECHODZI (granica)',
        g.ok === true && g.meta.tygodnie === c[1], g.ok ? g.meta.tygodnie : g.sciana);
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
    var skok5 = uloz(we({ dystans: '5k', dniWTygodniu: 4, dataStartu: zaTygodni(4),
                          poziom: poziom({ objetoscTygodniowa: 20 }) }));
    check('20 km/tydz + 5 km w 4 tyg. odbite', skok5.ok === false && skok5.sciana.kod === 'SKOK_OBJETOSCI', skok5.ok ? 'PRZESZLO' : skok5.sciana);
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
    check('odmowa niesie drogę wyjścia: ile trzeba biegać',
      mar20.sciana.szczegoly.wymaganaBaza_km === 29 && mar20.sciana.szczegoly.minSzczyt_km === 45,
      mar20.sciana.szczegoly);
    check('komunikat zawiera liczby, nie samo „nie da się"',
      /20 km\/tydz/.test(mar20.sciana.komunikat) && /45 km\/tydz/.test(mar20.sciana.komunikat)
      && /Zbuduj bazę do ~29/.test(mar20.sciana.komunikat), mar20.sciana.komunikat);
    var half15 = uloz(we({ dystans: 'half', dniWTygodniu: 4, dataStartu: zaTygodni(10),
                           poziom: poziom({ objetoscTygodniowa: 15 }) }));
    check('półmaraton z 15 km/tydz → odbite', half15.ok === false && half15.sciana.kod === 'ZA_MALA_BAZA',
      half15.ok ? 'PRZESZLO' : half15.sciana);
    check('próg ZA_MALA_BAZA liczony z minSzczyt / MNOZNIK_SZCZYTU dla każdego dystansu',
      ['5k', '10k', 'half', 'marathon'].every(function (dy) {
        var d = DYSTANSE[dy], graniczna = d.minSzczyt / MNOZNIK_SZCZYTU;
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
      && mar29.sciana.szczegoly.wymaganaBaza_km === 37, mar29.sciana.szczegoly);
    var mar36 = uloz(we({ dystans: 'marathon', dniWTygodniu: 5, dataStartu: zaTygodni(18),
                          poziom: poziom({ objetoscTygodniowa: 36 }) }));
    check('maraton z 36 km/tydz nadal odbity (tuż pod progiem)',
      mar36.ok === false && mar36.sciana.kod === 'ZA_KROTKIE_WYBIEGANIE', mar36.ok ? 'PRZESZLO' : mar36.sciana);
    var mar37 = uloz(we({ dystans: 'marathon', dniWTygodniu: 5, dataStartu: zaTygodni(18),
                          poziom: poziom({ objetoscTygodniowa: 37 }) }));
    check('maraton z 37 km/tydz PRZECHODZI (pierwsza wartość, która przechodzi)', mar37.ok === true,
      mar37.ok ? null : mar37.sciana);
    check('…i jego najdłuższe wybieganie sięga ≥ 23 km', najdluzszeW(mar37) >= 23, najdluzszeW(mar37));
    check('KAŻDY wygenerowany plan spełnia próg wybiegania',
      [['5k', 6, 4, 25], ['10k', 8, 4, 30], ['half', 12, 4, 40], ['marathon', 18, 5, 45],
       ['marathon', 20, 6, 90], ['half', 16, 3, 30]].every(function (c) {
        var rr = uloz(we({ dystans: c[0], dataStartu: zaTygodni(c[1]), dniWTygodniu: c[2],
                           poziom: poziom({ objetoscTygodniowa: c[3] }) }));
        return rr.ok && najdluzszeW(rr) >= DYSTANSE[c[0]].minDlugieProc * DYSTANSE[c[0]].km - 0.05;
      }), null);
    sekcja('CEL CZASOWY — ściana, tempa i przypadki brzegowe');
    /* Forma 3:40 w maratonie → prognoza 13200 s. Limit 8% daje 12144 s = 3:22:24.
       Ta liczba jest w specu i test pilnuje, że komunikat ją poda. */
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
    check('…i podaje realny cel ≈ 3:22',
      c300.ok === false && Math.abs(c300.sciana.szczegoly.celRealny_s - 12144) < 60,
      c300.ok ? null : c300.sciana.szczegoly.celRealny_s);
    check('…a komunikat NIESIE tę liczbę, nie tylko odmowę',
      c300.ok === false && /3:2\d:\d\d/.test(c300.sciana.komunikat), c300.ok ? null : c300.sciana.komunikat);
    var c330 = celMar(3 * 3600 + 30 * 60);
    check('maraton 3:30 przy formie 3:40 → przechodzi', c330.ok === true, c330.ok ? null : c330.sciana);

    /* Cel WOLNIEJSZY — bez progu i bez komentarza, w każdym przypadku. */
    var cWolny = celMar(4 * 3600);
    check('cel wolniejszy od formy → przechodzi', cWolny.ok === true, cWolny.ok ? null : cWolny.sciana);
    check('cel wolniejszy → tempa SĄ z celu (plan spokojniejszy)',
      cWolny.ok && cWolny.meta.tempaZCelu === true && cWolny.meta.p10sec > cWolny.meta.p10sec_forma,
      cWolny.ok ? [cWolny.meta.p10sec, cWolny.meta.p10sec_forma] : null);

    /* Granica 8%: dokładnie 8% przechodzi (warunek to >, nie >=). */
    var progn = prognozaCzasu(p10_340, DYSTANSE.marathon.km);
    // ceil, nie round — zaokrąglenie w dół zepchnęłoby cel o ułamek ZA próg
    check('dokładnie 8% poprawy → przechodzi', celMar(Math.ceil(progn * 0.92)).ok === true, null);
    check('8,5% poprawy → odbite', (function () {
      var r = celMar(Math.round(progn * 0.915));
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
    check('cel fizycznie niemożliwy (1:30 maraton) → CZAS_POZA_SKALA',
      cNiemozliwy.ok === false && cNiemozliwy.sciana.kod === 'CZAS_POZA_SKALA', cNiemozliwy.ok ? null : cNiemozliwy.sciana.kod);
    check('…i odmowa mówi o rekordzie świata, nie o ambicji',
      cNiemozliwy.ok === false && /rekord świata/.test(cNiemozliwy.sciana.komunikat), cNiemozliwy.ok ? null : cNiemozliwy.sciana.komunikat);

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
    check('maraton z celem 180 s ("3:00" źle sparsowane) → ODMOWA, nie absurdalny plan',
      celMar180.ok === false && celMar180.sciana.kod === 'CZAS_POZA_SKALA',
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
    var c2400 = cel10(24 * 60);
    check('10 km w 24:00 (szybciej niż próg 25:00) → CZAS_POZA_SKALA',
      c2400.ok === false && c2400.sciana.kod === 'CZAS_POZA_SKALA', c2400.ok ? 'PRZESZLO' : c2400.sciana.kod);
    check('…komunikat mówi wprost o rekordzie świata',
      c2400.ok === false && /szybszy niż rekord świata/.test(c2400.sciana.komunikat), null);
    var c2800 = cel10(28 * 60);
    check('10 km w 28:00 → ODRZUCONE ścianą (18% poprawy), plan NIE powstaje',
      c2800.ok === false && c2800.sciana.kod === 'CEL_ZA_AMBITNY' && !c2800.plan && !c2800.treningi,
      c2800.ok ? 'PLAN POWSTAL' : c2800.sciana.kod);
    check('10 km w 34:12 (= jego prognoza) → przechodzi', cel10(2052).ok === true, null);
    var cMar150 = uloz(we({ dystans: 'marathon', dniWTygodniu: 5, dataStartu: zaTygodni(20),
                            poziom: poziom({ p10sec: 250, objetoscTygodniowa: 70 }), celCzasowy: 110 * 60 }));
    check('maraton w 1:50 (szybciej niż próg 1:53) → CZAS_POZA_SKALA',
      cMar150.ok === false && cMar150.sciana.kod === 'CZAS_POZA_SKALA', cMar150.ok ? 'PRZESZLO' : cMar150.sciana.kod);

    /* Progi MUSZĄ leżeć poniżej rekordu — inaczej odcięłyby realny wynik. */
    check('każdy próg minCzas jest szybszy niż rekord świata tego dystansu', (function () {
      var REKORDY = { '5k': 755, '10k': 1571, 'half': 3440, 'marathon': 7170 };   // zweryfikowane 11/8/2026
      return Object.keys(REKORDY).every(function (k) { return DYSTANSE[k].minCzas < REKORDY[k]; });
    })(), null);
    check('próg górny to ok. 12:00/km na każdym dystansie', (function () {
      return ['5k', '10k', 'half', 'marathon'].every(function (k) {
        var tempo = DYSTANSE[k].maxCzas / DYSTANSE[k].km;
        return tempo > 700 && tempo < 740;
      });
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
    [25, 60, 129].forEach(function (obj) {
      [3, 4, 5, 6].forEach(function (dni) {
        var r = uloz(we({ dystans: 'half', dataStartu: zaTygodni(10), dniWTygodniu: dni,
                          poziom: poziom({ objetoscTygodniowa: obj }) }));
        check('half ' + obj + ' km/tydz, ' + dni + ' dni — plan powstaje', r.ok === true, r.ok ? null : r.sciana);
        check('half ' + obj + ' km/tydz, ' + dni + ' dni — najdłuższe ≤ 22 km',
          r.ok && najdluzszeW(r) <= 22.001, r.ok ? najdluzszeW(r) : r.sciana);
        check('half ' + obj + ' km/tydz, ' + dni + ' dni — najdłuższe nadal ≥ progu 11,6 km',
          r.ok && najdluzszeW(r) >= DYSTANSE.half.minDlugieProc * DYSTANSE.half.km - 0.05,
          r.ok ? najdluzszeW(r) : r.sciana);
      });
    });
    check('sufit half leży z zapasem NAD progiem minDlugieProc (nie powtarzamy pułapki maratońskiej)',
      DYSTANSE.half.maxDlugieKm - DYSTANSE.half.minDlugieProc * DYSTANSE.half.km > 5,
      Math.round((DYSTANSE.half.maxDlugieKm - DYSTANSE.half.minDlugieProc * DYSTANSE.half.km) * 10) / 10);
    check('sufit half jest powyżej 100% dystansu docelowego',
      DYSTANSE.half.maxDlugieKm > DYSTANSE.half.km,
      Math.round(DYSTANSE.half.maxDlugieKm / DYSTANSE.half.km * 100) + '%');
    check('sufity pozostałych dystansów nietknięte (5k 14 / 10k 18 / marathon 34)',
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

    sekcja('ŚCIANA — cel czasowy ponad 8%');
    var pgn10 = prognozaCzasu(300, 10);             // p10=5:00/km => 50:00
    var celZa = uloz(we({ celCzasowy: Math.round(pgn10 * 0.85) }));
    check('cel 15% szybszy odbity', celZa.ok === false && celZa.sciana.kod === 'CEL_ZA_AMBITNY', celZa.ok ? 'PRZESZLO' : celZa.sciana);
    check('odmowa podaje realny cel', celZa.ok === false && celZa.sciana.szczegoly.celRealny_s > 0, celZa.sciana && celZa.sciana.szczegoly);
    var celGranica = uloz(we({ celCzasowy: Math.round(pgn10 * (1 - MAX_POPRAWA)) }));
    check('cel dokładnie 8% przechodzi (granica)', celGranica.ok === true, celGranica.ok ? null : celGranica.sciana);
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
    check('E = 6:35/km (300+95)', r.meta.tempa.E === '6:35', r.meta.tempa.E);
    check('Reg = 7:00/km (300+120)', r.meta.tempa.Reg === '7:00', r.meta.tempa.Reg);
    check('T = 5:30/km (300+30)', r.meta.tempa.T === '5:30', r.meta.tempa.T);
    check('I = 5:05/km (300+5)', r.meta.tempa.I === '5:05', r.meta.tempa.I);
    check('M = 5:25/km (300+25)', r.meta.tempa.M === '5:25', r.meta.tempa.M);
    check('R = 4:30/km (300-30)', r.meta.tempa.R === '4:30', r.meta.tempa.R);
    check('spokojne w planie mają tempo E',
      r.treningi.filter(function (w) { return w.workout_type === 'Bieg spokojny' && !jestDniemStartu(w); }).every(function (w) { return w.target_pace === '6:35/km'; }), null);
    check('interwały w planie mają tempo I',
      r.treningi.filter(function (w) { return w.workout_type === 'Interwały'; }).every(function (w) { return w.target_pace === '5:05/km'; }), null);
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
    check('trend budowy (zrzuty odtworzone) rośnie ≤8% tydzień do tygodnia',
      trend.every(function (v, i) { return i === 0 || v <= trend[i - 1] * (1 + MAX_PRZYROST_TYG) + 0.06; }), trend);
    check('trend budowy nigdy nie maleje',
      trend.every(function (v, i) { return i === 0 || v >= trend[i - 1] - 0.05; }), trend);
    check('co 4. tydzień lżejszy od poprzedniego', obj[3] < obj[2] && obj[7] < obj[6], [obj[2], obj[3], obj[6], obj[7]]);
    check('zrzut to ~70% trendu, nie przypadkowa liczba',
      Math.abs(obj[3] / (obj[2] * (1 + MAX_PRZYROST_TYG)) - ZRZUT) < 0.01, [obj[2], obj[3]]);
    check('wyjście ze zrzutu nie przeskakuje ponad nieprzerwany trend 8%/tydz',
      obj[4] <= obj[2] * Math.pow(1 + MAX_PRZYROST_TYG, 2) + 0.05, [obj[2], obj[3], obj[4]]);
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
      check(c[0] + ' @' + c[3] + ' km/tydz: szczyt ≤ obecna × ' + MNOZNIK_SZCZYTU + ' (' + szczyt + ' ≤ ' + (c[3] * MNOZNIK_SZCZYTU) + ')',
        szczyt <= c[3] * MNOZNIK_SZCZYTU + 0.05, szczyt);
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
      iw.every(function (w) { return w.description.indexOf('5:05/km') >= 0 && /przerwa 2 min trucht/.test(w.description); }), iw[0] && iw[0].description);
    check('opis tempa mówi ile MINUT ciągłego biegu',
      tp.every(function (w) { return /\d+ min ciągłego biegu/.test(w.description); }), tp[0] && tp[0].description);
    check('opis tempa niesie tempo strefy T',
      tp.every(function (w) { return w.description.indexOf('5:30/km') >= 0; }), tp[0] && tp[0].description);
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
    // Proporcja obowiązuje tylko dopóki wybieganie nie stoi na suficie maxDlugieKm —
    // przy suficie nadmiar świadomie zostaje w spokojnych, a nie w wybieganiu.
    check('3 dni: długie/spokojny ≈ ' + DLUGIE_NAD_SPOKOJNYM + ' (gdy długie poniżej sufitu)',
      dl6.target_distance_km >= DYSTANSE.half.maxDlugieKm - 0.05
        ? dl6.target_distance_km >= sp6.target_distance_km
        : Math.abs(dl6.target_distance_km / sp6.target_distance_km - DLUGIE_NAD_SPOKOJNYM) < 0.05,
      [dl6.target_distance_km, sp6.target_distance_km, DYSTANSE.half.maxDlugieKm]);
    check('3 dni: suma tygodnia nadal trzyma objętość',
      Math.abs(w6.reduce(function (a, w) { return a + w.target_distance_km; }, 0) - r3.meta.objetosciTygodni[5]) < 0.6,
      w6.reduce(function (a, w) { return a + w.target_distance_km; }, 0));
    check('4 dni: ratunek NIE odpala się (kształt był poprawny)',
      Math.abs(rj.treningi.filter(function (w) { return w.week_number === 6 && w.workout_type === 'Wybieganie'; })[0].target_distance_km
        - DYSTANSE.half.udzialDlugiego * rj.meta.objetosciTygodni[5]) < 0.1, null);

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
    check('progresja: szczyt nie przekracza sufitu dystansu ani obecna×1.6',
      szczytP(R25) <= Math.min(DYSTANSE.half.peakKm, 25 * MNOZNIK_SZCZYTU) + 0.06, szczytP(R25));

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
    check('przy 6 dniach i 129 km/tydz nadmiar poszedł w spokojne, nie w trzecią jakość',
      (function () {
        var wk = R129.treningi.filter(function (w) { return w.week_number === 6 && w.workout_type !== 'Odpoczynek'; });
        var jak = wk.filter(function (w) { return w.workout_type === 'Tempo' || w.workout_type === 'Interwały'; });
        var sp = wk.filter(function (w) { return w.workout_type === 'Bieg spokojny'; });
        return jak.length <= MAX_JAKOSC_W_TYG && sp.length >= 3;
      })(), null);

    // ── SUFIT WYBIEGANIA po korekcie na 14/18/26/34
    sekcja('SUFIT WYBIEGANIA — 14 / 18 / 22 / 34');
    check('półmaraton: sufit 22 km to ok. 104% dystansu (świadomie powyżej 100%)',
      Math.abs(DYSTANSE.half.maxDlugieKm / DYSTANSE.half.km - 1.04) < 0.02,
      Math.round(DYSTANSE.half.maxDlugieKm / DYSTANSE.half.km * 100) + '%');
    check('sufit jest powyżej progu minDlugieProc dla każdego dystansu',
      ['5k', '10k', 'half', 'marathon'].every(function (dy) {
        var d = DYSTANSE[dy];
        return d.maxDlugieKm > d.minDlugieProc * d.km;
      }), null);
    check('żaden plan w żadnym reżimie nie przekracza sufitu wybiegania',
      [R25, R45, R60m, R60h, R129].every(function (r) {
        var d = DYSTANSE[r.plan.target_race_type];
        return r.treningi.filter(function (w) { return w.workout_type === 'Wybieganie'; })
          .every(function (w) { return w.target_distance_km <= d.maxDlugieKm + 0.05; });
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
    check('1) żadne wybieganie nie przekracza maxDlugieKm (' + DYSTANSE.half.maxDlugieKm + ' km)',
      Fdl.every(function (w) { return w.target_distance_km <= DYSTANSE.half.maxDlugieKm + 0.05; }),
      Fdl.map(function (w) { return w.target_distance_km; }));
    check('1) najdłuższe wybieganie NIE wraca do 46 km',
      Math.max.apply(null, Fdl.map(function (w) { return w.target_distance_km; })) < 30, null);
    check('1) reżim rozpoznany jako „fala"', F.meta.rezim === 'fala', F.meta.rezim);

    // 2. JAKOŚĆ BEZ SUFITU — było 23 km ciągłego biegu (90 min)
    var Ftempo = F.treningi.filter(function (w) { return w.workout_type === 'Tempo'; });
    var Fintw  = F.treningi.filter(function (w) { return w.workout_type === 'Interwały'; });
    check('2) akcent progowy ≤ ' + MAX_TEMPO_KM + ' km ciągłego biegu',
      Ftempo.every(function (w) { return +/\((\d+(?:\.\d+)?) km\)/.exec(w.description)[1] <= MAX_TEMPO_KM + 0.05; }),
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
    check('sufity odnotowane w meta.zalozenia, nie przemilczane',
      F.meta.zalozenia.some(function (z) { return /Sufity jednostek/.test(z); }), F.meta.zalozenia);

    sekcja('RIEGEL');
    check('5 km 20:00 → 10 km ok. 41:41', Math.abs(riegel(1200, 5, 10) - 2501) < 5, Math.round(riegel(1200, 5, 10)));
    check('10 km 50:00 → maraton 3:50:01', fmtCzas(prognozaCzasu(300, 42.195)) === '3:50:01', fmtCzas(prognozaCzasu(300, 42.195)));
    check('konwersja tam i z powrotem jest spójna', Math.abs(p10ZWyniku(21.0975, prognozaCzasu(300, 21.0975)) - 300) < 0.01, null);

    console.log('\n  zaliczone: ' + pass + '   niezaliczone: ' + fail + '\n');
    if (typeof process !== 'undefined' && process.exit) process.exit(fail === 0 ? 0 : 1);
  }

})(typeof window !== 'undefined' ? window : null);
