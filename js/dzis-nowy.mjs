// NOWE DZIŚ (plan 13.11, plan E1 z 25.11) — etap E1: szkielet, zasady (commit 1) i dane w falach (commit 2). Ładowany przez blok DZIS-E0 1 w zawodnik.html
// WYŁĄCZNIE dla konta, któremu dzis_wersja() odpowiada „nowy”. Przełącznik służy widoczności, nie jest zabezpieczeniem.
// Co robi ten commit: nowy ekran ZASTĘPUJE stare Dziś (klasa dzis-gotowy uruchamia chowanie z bloku DZIS-E0 2): nagłówek z datą,
// Okienkiem i dzwonkiem, kafle w kolejności z makiety r5 jako szkielet (dane dojdą w commicie 2), skróty, link „stare Dziś ›”,
// Menu na dole zostaje STARE (Filip 25.11 po zrzutach): ikony z makiety są tylko w rzędzie skrótów i na dzwonku. Okienko otwiera
// pigułka „Zapytaj” w nagłówku (wygląd starego pola Zapytaj). Licznik dzwonka bierze z tego, co stary kod już wpisał w stronę.
// DANE (commit 2): moduł nie czeka na stary kod. Dwie fale, razem 5 zapytań, a u konta z trenerem 6 (blizna-357 pilnuje liczby):
//   fala 1 (od razu po sesji, równolegle): profil zawodnika RAZ (BM_DZIS.profil() oddaje tę samą obietnicę), akcja_licznik, akcja_moj_wklad;
//   fala 2 (po id zawodnika, równolegle): trening na dziś, sześć ostatnich wpisów (pierwszy = „Ostatni trening”, reszta = lista od przedostatniego)
//     oraz, TYLKO gdy profil ma trenera, najnowsza wiadomość od trenera z ostatnich 7 dni (E4a, blizna-367; decyzja Filipa 25.11: starsza się nie pokazuje,
//     bo wiadomość sprzed miesiąca jako „rada na dziś” myli). Wiersz w kaflu treningu otwiera rozmowę z trenerem; treść jako sam tekst.
//   Konto próby akcji (inny slug niż domyślny) dokłada w fali 2 dwa zapytania o swoją akcję.
// „JAK POSZŁO?” (E1b, blizna-363), jak karta FEEL-REPORT starego Dziś: wpis Z ZEGARKA z ostatnich 48 h bez odczucia → cztery miny, notatka, „Zapisz raport”, „Pomiń”.
//   Kandydat wybierany z sześciu wpisów fali 2 (zero nowych zapytań). To JEDYNE miejsca, gdzie moduł zapisuje:
//   (1) baza: update training_logs jednego wiersza po id, pola feel i comment, dopiero po „Zapisz raport”, z odesłaniem id (0 wierszy = odmowa RLS = błąd);
//   (2) pamięć telefonu: klucz fr_skip_<id wpisu>, ten sam co stare Dziś, więc „Pomiń” na jednym ekranie działa na drugim. Po „Pomiń” cisza:
//       jak w starej karcie pytanie nie przechodzi na kolejny, starszy wpis;
//   (3) pamięć telefonu: szkic dn_jp_szkic_<id wpisu> (mina i tekst), żeby odpowiedź bez sieci nie ginęła (E3 commit 5, blizna-404).
//   ODCZUCIA (E3 commit 5, 26.11, decyzja Filipa; zastępuje zasadę z 19.08 „przy komentarzu pola nie ma”): pole pod minami pojawia się po wyborze miny,
//   500 znaków, licznik od 400. Komentarz wpisu z zegarka (synchronizacja wpisuje tam nazwę aktywności, np. „Morning Run”) NIE stoi w polu: szary podpis
//   „Z zegarka: …” nad pustym polem, nowy tekst doklejany po \n, limit liczy tylko nowy tekst. Wpis ręczny: komentarz stoi w polu do edycji (dziś
//   „Jak poszło?” pyta tylko o wpisy z zegarka, więc to zabezpieczenie). Pusty tekst = pola comment nie wysyłamy („nie podane = nie ruszaj”). To samo pole
//   comment co w kalendarzu, w tym samym update co mina. Trzy zdania po zapisie co do słowa jak w starym (decyzja Filipa 19.08.2026).
//   Ponowne start() (initAuth, powrót do aplikacji) nie pyta drugi raz przez 60 s. Zapytanie bez odpowiedzi w 10 s = błąd kafla.
// PIERWSZE WCZYTANIE (poprawka 25.11, blizna-358): moduł dochodzi, zanim strona wczyta skrypt klienta bazy (sb.js stoi niżej niż #dzis-nowy),
//   więc szkielet rysuje od razu, a z danymi czeka na DOMContentLoaded. Wcześniej pytał bez klienta i pokazywał „Nie udało się wczytać”.
// ZEGAREK (E1b, blizna-360): górny pasek starego ekranu jest na Dziś schowany, a z nim plakietka zegarka. Nowy nagłówek rysuje ją tą samą
//   WATCH.render('badge') co stary, ale stan bierze z profilu z fali 1 (cztery kolumny intervals_* w tym samym zapytaniu, opts.stan),
//   więc budżet zostaje 5 zapytań. Pasek „problem z zegarkiem” jest odbiciem starego slotu (#watch-pasek-slot): jego dane kosztują osobne
//   zapytanie, które stary kod i tak robi. Po ↺ (synchronizacja) dane Dziś wczytują się od nowa.
// MOMENT (E1b, blizna-361): Silnik Momentu (animacja kamienia milowego) dopina się do body i od starego ekranu nie zależy, ale jedyne wejście do niego,
//   przycisk „Nowy moment!” (#moment-baner), siedzi w schowanym górnym pasku. Pasek zdarzenia pokazuje go pod nagłówkiem, gdy stary przycisk jest
//   odsłonięty, a dotknięcie woła kliknięcie starego przycisku: kolejka, animacja albo karta i zapis shown_at zostają w jednym miejscu (loadMomenty).
//   Jedna rzecz naraz, w kolejności: problem z zegarkiem → moment → „Jak poszło?” (decyzja Filipa 25.11, blizna-371).
//   „Jak poszło?” w pasku to tylko ZACHĘTA: blok w kaflu „Ostatni trening” leży poza pierwszym ekranem, więc pasek go zapowiada, a dotknięcie przewija
//   do bloku, podświetla go i ustawia fokus na pierwszej minie. Formularz jest jeden (w kaflu). Pasek istnieje wtedy i tylko wtedy, gdy jest blok:
//   „Pomiń” i udany zapis zdejmują oba; pasek nie ma własnego „×”.
//   Pasek nie może szarpać układem: gdy pojawia się nad miejscem, które ktoś właśnie czyta (przewinięty ekran), pozycja przewinięcia jest wyrównywana;
//   gdy pojawia się na widoku po szkielecie (dane dochodzą falami, więc „Jak poszło?” przychodzi po kaflu „Ulica”), wsuwa się płynnie zamiast
//   przeskakiwać (bez animacji przy ograniczonym ruchu). Miejsca z góry nie rezerwujemy: większość wejść paska nie ma, więc to rezerwa dawałaby skok.
// KONTO I TRENER (E1b, blizna-362): w schowanym górnym pasku zostały też menu konta (avatar) i chip „← Trener”. Nowe Dziś ma własny avatar obok pola
//   „Zapytaj” i własne menu, ale pozycje wołają TE SAME funkcje starego ekranu (goToMyProfile, toggleSoundSetting, logout), a inicjały, zdjęcie, adres
//   konta i napis o dźwiękach są odbiciem starych elementów. Stare menu siedzi wewnątrz schowanego paska, więc nie da się go po prostu pokazać.
//   Chip „← Trener” pokazuje się, gdy stary kod odsłonił swój (konto trenera) i zostaje, choć stary chowa go na czas banera momentu.
// DZIAŁANIA PRZY TRENINGU (E4a, blizna-364…): przyciski w kaflu „Trening na dziś” wołają funkcje starego ekranu, moduł sam niczego nie zapisuje.
//   „Zaloguj wynik” = openModal() (ten sam formularz co krążek Log; zapis robi saveLog). Po udanym zapisie (formularz zamknięty) dane Dziś
//   wczytują się od nowa: nowy „Ostatni trening”, „zrobione” przy planie.
//   „Coś boli” (jedyne wejście do zgłoszenia bólu w aplikacji): stary kod dalej wypełnia schowane pudełko #today-bol i wiesza na jego przyciskach
//   swoje działania (okno zgłoszenia, „Już nie boli”, „Nadal boli”, „Napisz do trenera”). Nowy kafel pokazuje ten sam stan (window._aktywnaKontuzja)
//   i KLIKA STARE PRZYCISKI po id z krótkiej listy: zapis do injuries, pamięć odroczenia i komunikaty zostają w starych funkcjach, co do słowa.
//   Pogoda (decyzja Filipa 25.11: jedna linia przy treningu zamiast kafla na 3 dni): podtytuł kafla dostaje „dziś 3–8 °C, deszcz” z danych, które stary
//   kod i tak pobiera dla swojego kafla (window._weatherCache po _renderWeather). Moduł NIE woła funkcji get-weather; bez miasta albo bez danych linii nie ma.
//   „Wczoraj nie zrobiłem” (rozliczenie WCZORAJSZEGO planu, z cofnięciem): stary kod sam decyduje, czy przycisk #today-nie-zrobilem pokazać
//   (dokładnie jeden wczorajszy plan, nie odpoczynek, nie zrobiony) i jaki ma napis; nowy kafel przepisuje napis i klika stary przycisk
//   (oznaczNieZrobione → update trainings.status). „Nie dziś” dla DZISIEJSZEGO treningu to osobna funkcja na później (decyzja Filipa 25.11).
//   Odrzucony token (401, JWT) przy pierwszej próbie: bez komunikatu, odświeżenie sesji i JEDNO ponowne wczytanie; dopiero druga odmowa to błąd kafla.
// Kiedy nowy ekran USTĘPUJE staremu (decyzje 13.11 i 25.11): podgląd trenera (?from=trener, do E8), #sponsor (formularz
// sponsora otwiera stary ekran), #log-list (historia Okienka). ?dzis=stary obsługuje blok DZIS-E0 1.
// TYDZIEŃ (E6a, blizna-376): dane. Tydzień pn–nd w dobie WARSZAWSKIEJ, gotowymi funkcjami sb.js (_tydzienWaw, _dzienWaw); typy biegowe przez
//   isRunType (lista pod bramką reguł), moduł niczego z tego nie przepisuje. Liczenie regułami starego „Postępu tygodnia” (updateWeekProgress):
//   zaplanowane = plany tygodnia poza „Odpoczynkiem”; zrobione = większa z liczb: plany „done” albo wpisy (nie więcej niż zaplanowanych);
//   kilometry tylko z wpisów biegowych, inne aktywności osobno; plan kilometrów = dystanse planów biegowych.
//   Budżet: 6 zapytań bez trenera, 7 z trenerem, dalej 2 fale (decyzja Filipa 26.11). Zapytanie o plany TYGODNIA zastępuje zapytanie
//   o trening na dziś (dzisiejszy wybierany po dacie); dochodzi jedno o wpisy z dwóch tygodni (ten i poprzedni, do „km tydzień temu”).
//   Para plany + wpisy trafia do migawki (pole „tydzien”, z poniedziałkiem, którego dotyczy) i bez sieci wraca tylko dla tego samego tygodnia.
//   LINIA TYGODNIA (blizna-377) pod powitaniem: „Ten tydzień: 24,6 z 38 km · 3 z 5 treningów”; bez planu „21,7 km · 3 treningi”.
//   Miejsce na linię jest w szkielecie od początku (stała wysokość), więc dociągnięcie danych niczego nie przesuwa. Gdy tygodnia nie da się
//   policzyć (błąd, brak funkcji tygodnia), linia zostaje pusta: żadnego „0 km”, którego nie wiemy.
//   KAFEL „TEN TYDZIEŃ” (blizna-378) po „Ostatnim treningu”: zakres dat, „Kalendarz ›”, trzy liczby (czas w ruchu, kilometry do planu, średnie tempo;
//   bez planu kilometrów zamiast „do planu” stoi „tydzień temu”), siedem słupków pn–nd zwykłym HTML i CSS (plan obrysem, zrobione wypełnieniem,
//   dziś wyróżnione, kilometry dnia podpisane pod słupkiem), legenda i mała linia aktywności niebiegowych. Słupki mają jeden opis dla czytnika
//   ekranu (role="img"). Gdy tygodnia nie da się policzyć, kafel jest schowany. Odczyt pod palcem: później, razem z Formą.
//   STANY KAFLA (blizna-379). Linia o dzisiejszym dniu pod słupkami: „Dziś: 6,2 km z 9 w planie”, „Dziś jeszcze nic · 9 km w planie”,
//   „Dziś jeszcze nic · trening w planie” (plan bez kilometrów), „Dziś wolne” (Odpoczynek); bez planu na dziś i bez biegu linii nie ma.
//   Pusty tydzień bez planu kilometrów: zamiast pustych słupków same nazwy dni i zdanie „W tym tygodniu jeszcze bez treningu.”.
//   Pierwszy tydzień konta (konto nie ma ŻADNEGO wpisu, co wiemy z zapytania o ostatnie wpisy): bez liczb, zdanie z makiety
//   „Słupki pojawią się po pierwszym treningu.”. Gdy nie wiemy, czy konto ma wpisy (tamto zapytanie nie doszło), nie udajemy pierwszego tygodnia.
//   Tydzień z planem, ale bez wpisów: zostają obrysy planu, bo mówią, co jest przed zawodnikiem.
// PAMIĘĆ BEZ SIECI (blizna-374): po każdym udanym odczycie dane kafli trafiają do migawki starego Dziś (js/dzis-offline.js), jako jej część „dzisNowe”.
//   Moduł NIE dotyka pamięci telefonu sam: zapis idzie przez DzisOffline.zapisz, które pilnuje limitu rozmiaru, kasuje migawki innych kont,
//   czyści wszystko przy wylogowaniu i nic nie zapisuje w podglądzie trenera. W migawce nie ma identyfikatora trenera, tylko „czy jest trener”.
//   Każde pole to ostatnia UDANA odpowiedź; nieudane zapytanie zostawia poprzednią wartość. Trening niesie dzień, którego dotyczy,
//   a każde pole własną godzinę (czas.<pole>): pasek „Offline” podaje godzinę najstarszego pola, które właśnie widać.
//   ODCZYT (blizna-375) tylko przy błędzie SIECI: brak połączenia, „Failed to fetch” albo brak odpowiedzi w 10 s. Odmowa i błąd serwera to prawdziwe
//   odpowiedzi: przy nich kafel dalej mówi „Nie udało się wczytać”, bo stare dane ukryłyby usterkę. Kafle rysują się wtedy z migawki, a na dole
//   staje pasek starego Dziś „Offline · dane z HH:MM”. Trening na dziś TYLKO z migawki z dzisiaj (wczorajszy plan podany jako dzisiejszy byłby
//   nieprawdą). „Jak poszło?” bez sieci się nie pokazuje, bo nie dałoby się zapisać. Powrót sieci (zdarzenie „online”) wczytuje dane od nowa.
//   Wygasła sesja bez sieci: identyfikator konta tą samą drogą co stare Dziś (DzisOffline.userId), a gdy go nie ma, komunikat zamiast szkieletu.
//   Nie w podglądzie trenera.
//   Stan mieszany (sieć padła albo wróciła w połowie): kafle, które doszły, są świeże, reszta z telefonu, a pasek „Offline” zostaje z godziną
//   danych z telefonu. Ekran z telefonu nie czeka 60 s na następną próbę, ale nowa próba nie startuje, dopóki poprzednia ma otwarte zapytania
//   (inaczej każde wejście na Dziś zaczynałoby wczytywanie od nowa i gubiło odpowiedzi w drodze; wykryte próbą w przeglądarce 26.11).
// Zgłoszenia: client_errors, kind 'dzis-nowy', w treści sam etap, raz na stronę, adres bez parametrów (wzór radia, blizna-355).
// Plik BEZ import/export (globalThis.BM_DZIS), jak js/ulica.mjs. Zmiana tego pliku = nowa stała MODUL_V w bloku DZIS-E0 1 (blizna-336).
(function (w, d) {
  "use strict";
  var ETAP = "E1", owiniete = false, zgloszone = {}, obserwatorzy = false;
  var ETAPY = ["modul", "start", "render", "klient", "profil", "akcja", "trening", "wpisy", "sesja", "odczucie", "wiadomosc", "tydzien", "spolecznosc", "karta-dnia"];
  var OKNO_WIADOMOSCI_DNI = 7, OKNO_ODCZUCIA_MS = 48 * 3600 * 1000, PODZIEKOWANIE_MS = 2600, MINY = ["great", "good", "mid", "bad"], jp = null, LIMIT_NOTATKI = 500, PROG_LICZNIKA = 400;
  var LIMIT_MS = 10000, SWIEZE_MS = 60000, ILE_WPISOW = 6, PLAN = "kalendarz.html?role=athlete";
  var WOLNE = ["Odpoczynek", "Wolne", "Dzień wolny", "Rest"];
  var STARE_PRZYCISKI = ["today-bol-btn", "today-bol-czat", "today-bol-koniec", "today-bol-nadal", "today-nie-zrobilem"];   // jedyne stare elementy, które wolno kliknąć z kafla treningu
  var dane = { t: 0, nr: 0, profil: null, imie: "", odswieza: 0, wpisy: [], trener: null, trening: null, wiadomosc: null, pogoda: "", kafleStoja: false, uid: null, bezSieci: false, tsTelefonu: 0, wpisyZTelefonu: false, wpisyZnane: false, wToku: 0, zakres: null, plany: null, wpisyTyg: null, tydzien: null }, wstrzymane = false, czekaNaDom = false, owinietaSynchronizacja = false, owinietyZapis = false, owinietaPogoda = false, trenerWidziany = false, nasluchDokumentu = false, nasluchSieci = false;
  var PROFIL_KOLUMNY = "id,full_name,coach_id,intervals_athlete_id,intervals_connected_at,intervals_can_write,intervals_token_dead_at";
  var SKROTY = [["cialo", "Ciało", "biceps", "sekcja", "cwiczenia"], ["jedzenie", "Odżywianie", "sztucce", "strona", "nutrition.html"], ["starty", "Starty", "flaga", "strona", "races.html"], ["wyzwania", "Wyzwania", "puchar", "strona", "wyzwania.html"],
    ["odznaki", "Odznaki", "medal", "strona", "odznaki.html"], ["radio", "Radio", "radio", "strona", "radio.html"], ["czat", "Czat", "dymek", "sekcja", "msgs"], ["gra", "Gra", "pad", "strona", "gra.html"]];
  /* Skróty stoją w siatce 4 × 2 BEZ przewijania (blizna-369): przewijany rząd ucinał ikony i na laptopie nie było jak go przesunąć.
     Siatka jest pełna przy ośmiu skrótach; dziewiąty wymaga decyzji, co wypada, a test tego pilnuje. */
  /* Trening na dziś stoi NAD Ulicą (decyzja Filipa 25.11, blizna-381): to pierwsza rzecz dnia, a z kadrem w nagłówku przycisk wyniku wypadałby pod dolne menu. */
  var KAFLE = [["trening", "Trening na dziś"], ["ulica", "Ulica"], ["skroty", ""], ["ostatni", "Ostatni trening"], ["tydzien", "Ten tydzień"], ["spol", "Społeczność"], ["lista", "Twoje ostatnie treningi"]];

  function korzen() { return d.getElementById("dzis-nowy"); }
  function html() { return d.documentElement; }
  function wlaczone() { return html().classList.contains("dzis-nowy"); }
  function naDzis() { var s = w._currentSection; return !s || s === "home"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /** client_errors, kind 'dzis-nowy': sam etap, każdy raz na załadowanie strony, adres bez parametrów. Nigdy nie rzuca. */
  function zglos(etap) {
    try {
      if (ETAPY.indexOf(etap) < 0 || zgloszone[etap]) return false;
      if (typeof w._logKlienta !== "function") return false;   // logger jeszcze nie doszedł: nie zużywamy jedynego wpisu tego etapu
      zgloszone[etap] = true;
      w._logKlienta({ kind: "dzis-nowy", message: etap, url: w.location.pathname });
      return true;
    } catch (e) { return false; }
  }

  /** Powód, dla którego ta sesja zostaje na starym ekranie, albo "" (nowy ekran). */
  function ustepuje() {
    try {
      var p = new URLSearchParams(w.location.search || "");
      if (p.get("from") === "trener") return "trener";
      var h = String(w.location.hash || "");
      if (h === "#sponsor") return "sponsor";
      if (h === "#log-list") return "historia";
    } catch (e) {}
    return "";
  }

  /* IKONY SKRÓTÓW (paczka I1, 27.11.2026, blizna-412): Lucide 1.72.0 (lucide.dev), licencja ISC; „radio” Lucide wywodzi z Feather (MIT).
     Tekst obu licencji: LICENSES/lucide.txt. Dolne menu (window.NAV w kliencie, styl w theme.css: 22 px, kreska 1,7) rysuje ścieżkami Feather na siatce 24
     z zaokrąglonymi końcami i łączeniami; Lucide to jego kontynuacja, więc skróty i menu mówią jednym językiem. Kreska 1,6 przy 24 px daje na
     ekranie tę samą grubość co menu (1,7 przy 22 px ≈ 1,56 px). Inline: zero plików i zapytań. Dobór: Ciało = biceps (biceps-flexed; „osoba”, person-standing,
     wyglądała na mniejszą: rysunek 12×16 przy 18–20 pozostałych, zrzut 27.11),
     Odżywianie = sztućce (utensils; jabłko ma już menu), Starty = flaga, Wyzwania = puchar (trophy), Odznaki = medal, Radio = radio, Czat = dymek
     (message-circle; menu ma kwadratowy), Gra = pad (gamepad-2). Paczka I2 (blizna-413): dzwonek w nagłówku = bell; dzwonek, zegarek
     i chip „← Trener” w tym samym kółku co skróty, z przyciemnionym tłem z rozmyciem nad zdjęciem kadru (bez backdrop-filter: pełne #17161b). Od I2 moduł nie pobiera
     żadnego obrazka ikony; pliki webp w assets/ui/dzis/ikony/ zostają (decyzja Filipa: nie kasujemy). Ścieżki skopiowane z paczki lucide-static@1.72.0 skryptem, bez zmian. */
  var IKONY_SVG = {
    biceps: '<path d="M12.409 13.017A5 5 0 0 1 22 15c0 3.866-4 7-9 7-4.077 0-8.153-.82-10.371-2.462-.426-.316-.631-.832-.62-1.362C2.118 12.723 2.627 2 10 2a3 3 0 0 1 3 3 2 2 0 0 1-2 2c-1.105 0-1.64-.444-2-1"/><path d="M15 14a5 5 0 0 0-7.584 2"/><path d="M9.964 6.825C8.019 7.977 9.5 13 8 15"/>',
    sztucce: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    flaga: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>',
    puchar: '<path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"/><path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"/><path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"/><path d="M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"/>',
    medal: '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/>',
    radio: '<path d="M16.247 7.761a6 6 0 0 1 0 8.478"/><path d="M19.075 4.933a10 10 0 0 1 0 14.134"/><path d="M4.925 19.067a10 10 0 0 1 0-14.134"/><path d="M7.753 16.239a6 6 0 0 1 0-8.478"/><circle cx="12" cy="12" r="2"/>',
    dymek: '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',
    dzwonek: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    pad: '<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>'
  };
  function ikonaSvg(nazwa) {
    return Object.prototype.hasOwnProperty.call(IKONY_SVG, nazwa) ? '<svg class="dn-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + IKONY_SVG[nazwa] + "</svg>" : "";
  }

  var CSS = "#dzis-nowy{padding:4px 16px 8px;color:#f5f3ef;font-family:'DM Sans',system-ui,sans-serif}" +
    "#dzis-nowy .dn-naglowek{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:6px 0 10px}#dzis-nowy .dn-naglowek > div:first-child{min-width:0}" +
    "#dzis-nowy .dn-rzad{display:flex;align-items:center;gap:8px;margin:0 0 12px}#dzis-nowy .dn-rzad .dn-zapytaj{flex:1;width:auto;min-width:0;margin:0}" +
    "#dzis-nowy .dn-awatar{flex:none;overflow:hidden;color:#f5f3ef;font:600 15px/1 'DM Sans',sans-serif;letter-spacing:.02em}#dzis-nowy .dn-awatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%}" +
    "#dzis-nowy .dn-trener{display:inline-flex;align-items:center;box-sizing:border-box;min-height:48px;margin:0 0 8px;padding:0 16px;border-radius:24px;border:1px solid rgba(255,255,255,.08);background:rgba(23,22,27,.62);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#f5f3ef;font:500 11px/1 'DM Mono',monospace;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:border-color .15s}" +
    "#dzis-nowy{position:relative}#dzis-nowy .dn-menu{position:absolute;right:16px;z-index:50;min-width:220px;max-width:calc(100% - 32px);margin-top:-6px;padding:8px;border-radius:16px;border:1px solid #2a2a30;background:#16161b;box-shadow:0 16px 40px rgba(0,0,0,.7)}" +
    "#dzis-nowy .dn-menu-kto{padding:8px 12px 10px;margin:0 0 6px;border-bottom:1px solid #2a2a30;color:#8f8c97;font:500 11px/1.3 'DM Mono',monospace;overflow-wrap:anywhere}" +
    "#dzis-nowy .dn-menu button,#dzis-nowy .dn-menu a{display:flex;align-items:center;width:100%;min-height:44px;padding:0 12px;border:0;border-radius:10px;background:none;color:#f5f3ef;font:500 14px/1.2 'DM Sans',sans-serif;text-align:left;text-decoration:none;cursor:pointer}" +
    "#dzis-nowy .dn-menu a.dn-menu-cichy{color:#bcb8b2}#dzis-nowy .dn-menu button.dn-menu-wyloguj{color:#ff6b5e}" +
    "#dzis-nowy .dn-zegarek{display:flex;align-items:center}" +
    "#dzis-nowy .dn-akcje .dn-okr,#dzis-nowy .dn-zegarek .wc-badge{width:48px;height:48px;box-sizing:border-box;border-radius:50%;border:1px solid rgba(255,255,255,.08);background:rgba(23,22,27,.62);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#f5f3ef;opacity:1;transition:border-color .15s}" +
    "#dzis-nowy .dn-zegarek .wc-icon{width:22px;height:22px;stroke:#f5f3ef;stroke-width:1.75}#dzis-nowy .dn-zegarek .wc-badge-warn .wc-icon{stroke:#e8b840}#dzis-nowy .dn-zegarek .wc-refresh{color:#f5f3ef;opacity:.8}" +
    "#dzis-nowy .dn-akcje .dn-okr:active,#dzis-nowy .dn-akcje .dn-okr:focus-visible,#dzis-nowy .dn-zegarek .wc-badge:active,#dzis-nowy .dn-zegarek .wc-badge:focus-visible,#dzis-nowy .dn-trener:active,#dzis-nowy .dn-trener:focus-visible{border-color:#ff7a45}" +
    "@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){#dzis-nowy .dn-akcje .dn-okr,#dzis-nowy .dn-zegarek .wc-badge,#dzis-nowy .dn-trener{background:#17161b}}" +
    "#dzis-nowy .dn-zd{margin:0 0 12px;overflow:hidden}#dzis-nowy .dn-zd .wc-pasek{margin:0!important}" +
    "#dzis-nowy .dn-zd.dn-zd-wjazd{animation:dn-zd-wjazd .24s ease-out}@keyframes dn-zd-wjazd{from{max-height:0;margin-bottom:0;opacity:0}to{max-height:140px;margin-bottom:12px;opacity:1}}" +
    "#dzis-nowy .dn-jp.dn-jp-swiatlo{animation:dn-jp-swiatlo 1.6s ease-out}@keyframes dn-jp-swiatlo{0%,60%{box-shadow:0 0 0 2px #ff7a45;border-radius:12px}100%{box-shadow:0 0 0 2px rgba(255,122,69,0)}}" +
    "#dzis-nowy .dn-moment{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:8px 16px;border-radius:16px;border:1px solid rgba(255,122,69,.55);background:rgba(196,74,19,.14);color:#f5f3ef;font:600 15px/1.25 'DM Sans',sans-serif;text-align:left;cursor:pointer}" +
    "#dzis-nowy .dn-moment svg{flex:none;stroke:#ff7a45}#dzis-nowy .dn-moment span{flex:1;min-width:0}#dzis-nowy .dn-moment small{display:block;margin-top:2px;color:#bcb8b2;font:400 13px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-moment i{flex:none;font-style:normal;color:#ff7a45;font-size:20px;line-height:1}#dzis-nowy .dn-moment:active{transform:scale(.99)}" +
    "#dzis-nowy .dn-naglowek.dn-kadr{position:relative;box-sizing:border-box;height:184px;margin:0 -16px 12px;padding:0 16px 14px;align-items:flex-end;overflow:hidden;border-radius:0 0 20px 20px;background-color:#1a1d22}" +
    "#dzis-nowy .dn-kadr > div{position:relative;z-index:1;min-width:0}#dzis-nowy .dn-kadr .dn-data{color:#f5f3ef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#dzis-nowy .dn-kadr .dn-data-m{letter-spacing:.1em}#dzis-nowy .dn-kadr .dn-data-s{letter-spacing:.02em}" +
    "@media (max-width:359px){#dzis-nowy .dn-kadr .dn-data{font-size:10px;letter-spacing:.02em}}" +
    "#dzis-nowy .dn-kadr .dn-powitanie{line-height:34px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#dzis-nowy .dn-kadr .dn-pow-m{font-size:28px}#dzis-nowy .dn-kadr .dn-pow-s{font-size:24px}" +
    "#dzis-nowy .dn-kadr .dn-trener{position:absolute;left:0;bottom:112px;margin:0;white-space:nowrap}" +
    "#dzis-nowy .dn-kadr-o{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:50% 30%;opacity:0;transition:opacity .2s ease-out}#dzis-nowy .dn-kadr-o.jest{opacity:1}" +
    "#dzis-nowy .dn-kadr-g{position:absolute;top:0;right:0;bottom:0;left:0;background:linear-gradient(180deg,rgba(6,6,8,.06) 0%,rgba(6,6,8,.2) 42%,rgba(6,6,8,.76) 64%,rgba(6,6,8,.9) 100%)}" +
    "@media (min-width:900px){html.dzis-gotowy.dzis-na-dzis #dn-tlo.jest{display:block;position:fixed;top:-80px;right:-80px;bottom:-80px;left:-80px;z-index:-1;background-color:#000;background-position:center;background-size:cover;background-repeat:no-repeat;filter:blur(40px) brightness(.35);pointer-events:none;animation:dn-tlo-wejscie .6s ease-out}" +
    "html.dzis-gotowy.dzis-na-dzis #dn-tlo.jest::after{content:'';position:absolute;top:80px;right:80px;bottom:80px;left:80px;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 42%,rgba(0,0,0,.85) 100%)}" +
    "html.dzis-gotowy.dzis-na-dzis body{box-shadow:0 0 0 1px rgba(255,255,255,.04),0 0 64px rgba(0,0,0,.65)}}@keyframes dn-tlo-wejscie{from{opacity:0}to{opacity:1}}" +
    "@media (prefers-reduced-motion:reduce){html.dzis-gotowy.dzis-na-dzis #dn-tlo.jest{animation:none}}@media (prefers-reduced-transparency:reduce){html.dzis-gotowy.dzis-na-dzis #dn-tlo.jest{display:none!important}}" +
    "#dzis-nowy .dn-data{font:500 11px/1.4 'DM Mono',monospace;letter-spacing:.22em;text-transform:uppercase;color:#bcb8b2}" +
    "#dzis-nowy .dn-tydz{margin:-6px 0 12px;min-height:18px;font:500 13px/18px 'DM Sans',sans-serif;color:#bcb8b2}#dzis-nowy .dn-tydz b{font-weight:600;color:#f5f3ef}" +
    "#dzis-nowy .dn-powitanie{margin:2px 0 0;font:400 34px/1 'Bebas Neue','DM Sans',sans-serif;letter-spacing:.02em;text-transform:uppercase;color:#f5f3ef;overflow-wrap:anywhere}" +
    "#dzis-nowy .dn-akcje{display:flex;align-items:center;gap:8px;flex:none}" +
    "#dzis-nowy .dn-okr{position:relative;width:48px;height:48px;border-radius:50%;border:1px solid #2a2a30;background:#0f0f13;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}" +
    "#dzis-nowy .dn-zegarek .wc-badge:hover{transform:none;box-shadow:none}" +
    "#dzis-nowy .dn-okr:active,#dzis-nowy .dn-zapytaj:active,#dzis-nowy .dn-zegarek .wc-badge:active,#dzis-nowy .dn-trener:active{transform:scale(.96)}" +
    "#dzis-nowy .dn-zapytaj{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;margin:0 0 12px;padding:0 16px 0 14px;border-radius:24px;text-align:left;border:1px solid #2a2a30;background:#0f0f13;color:#f5f3ef;font:600 14px/1 'DM Sans',sans-serif;cursor:pointer;white-space:nowrap}" +
    "#dzis-nowy .dn-zapytaj svg{flex:none;stroke:#bcb8b2}" +
    "#dzis-nowy .dn-licznik{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#c44a13;color:#fff;font:700 11px/20px 'DM Sans',sans-serif;text-align:center}" +
    "#dzis-nowy .dn-licznik[hidden]{display:none}" +
    "#dzis-nowy .dn-kafle{display:flex;flex-direction:column;gap:12px}" +
    "#dzis-nowy .dn-kafel{background:#0f0f13;border:1px solid #232329;border-radius:18px;padding:16px}" +
    "#dzis-nowy .dn-etykieta{font:500 11px/1.4 'DM Mono',monospace;letter-spacing:.2em;text-transform:uppercase;color:#8f8c97;margin:0 0 12px}" +
    "#dzis-nowy .dn-szkielet{display:block;height:14px;border-radius:7px;background:#1b1b21;margin:0 0 10px}" +
    "#dzis-nowy .dn-szkielet.k{width:55%}#dzis-nowy .dn-szkielet.w{height:44px;margin:14px 0 0}" +
    "#dzis-nowy .dn-skroty{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 6px;padding:2px 0}" +
    "#dzis-nowy .dn-skrot{min-width:0;min-height:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:none;border:0;padding:4px 0;" +
    "color:#bcb8b2;font:500 11px/1.2 'DM Sans',sans-serif;text-decoration:none;cursor:pointer}" +
    "#dzis-nowy .dn-skrot .dn-krazek{width:48px;height:48px;box-sizing:border-box;border-radius:50%;background:#17161b;border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;color:#f5f3ef;transition:border-color .15s}" +
    "#dzis-nowy .dn-skrot:active .dn-krazek,#dzis-nowy .dn-skrot:focus-visible .dn-krazek{border-color:#ff7a45}#dzis-nowy .dn-svg{display:block;width:24px;height:24px;flex:none}" +
    "#dzis-nowy .dn-stare{display:flex;align-items:center;justify-content:center;min-height:48px;margin:6px 0 0;color:#bcb8b2;font:500 13px/1 'DM Sans',sans-serif;text-decoration:none}" +
    "#dzis-nowy [hidden]{display:none!important}" +
    "#dzis-nowy .dn-gora{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:0 0 12px}#dzis-nowy .dn-gora .dn-etykieta{margin:0}" +
    "#dzis-nowy .dn-kto{margin:4px 0 0;color:#bcb8b2;font:500 13px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-pog{margin:-8px 0 12px;color:#bcb8b2;font:500 13px/1.3 'DM Sans',sans-serif}#dzis-nowy .dn-pog span{display:inline-block}#dzis-nowy .dn-pog span:first-child{white-space:nowrap}" +
    "#dzis-nowy .dn-link{flex:none;display:inline-flex;align-items:center;min-height:44px;margin:-14px -4px -14px 0;padding:0 4px;color:#ff7a45;font:600 13px/1 'DM Sans',sans-serif;text-decoration:none}" +
    "#dzis-nowy .dn-tytul{margin:0 0 6px;font:400 26px/1.05 'Bebas Neue','DM Sans',sans-serif;letter-spacing:.02em;text-transform:uppercase;color:#f5f3ef}" +
    "#dzis-nowy .dn-tekst{margin:0;color:#bcb8b2;font:400 14px/1.45 'DM Sans',sans-serif;overflow-wrap:anywhere}#dzis-nowy .dn-tekst b{color:#f5f3ef;font-weight:600}" +
    "#dzis-nowy .dn-ul-km{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}#dzis-nowy .dn-ul-km b{font:400 32px/1 'Bebas Neue','DM Sans',sans-serif;letter-spacing:.02em;color:#f5f3ef}" +
    "#dzis-nowy .dn-ul-km span{color:#bcb8b2;font:500 13px/1.3 'DM Sans',sans-serif}#dzis-nowy .dn-ul-km--koniec{margin-bottom:8px}" +
    "#dzis-nowy .dn-ul-scena{position:relative;height:200px;margin:-16px -16px 14px;overflow:hidden;border-radius:17px 17px 0 0;background:#1b2130}" +
    "#dzis-nowy .dn-ul-tlo{position:absolute;left:0;right:0;top:-140px}#dzis-nowy .dn-ul-tlo .us{margin:0}#dzis-nowy .dn-ul-tlo .um{margin:140px 12px 0}" +
    "#dzis-nowy .dn-ul-link{position:absolute;inset:0;z-index:2;-webkit-tap-highlight-color:transparent}" +
    "#dzis-nowy .dn-ul-mur{margin:-14px -16px 14px}#dzis-nowy .dn-ul-mur:empty{display:none}" +
    "#dzis-nowy .dn-ul-prog{display:flex;flex-direction:column;align-items:flex-start;gap:2px;margin:12px 0;padding:12px 14px 0;border:1px solid #3a2a20;border-radius:12px;background:#17120f}" +
    "#dzis-nowy .dn-ul-prog b{font:400 22px/1.1 'Bebas Neue','DM Sans',sans-serif;letter-spacing:.02em;color:#f5f3ef}#dzis-nowy .dn-ul-prog span{color:#bcb8b2;font:400 13px/1.4 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-ul-prog .dn-link{margin:0 0 0 -4px;border:0;background:none;cursor:pointer}" +
    "#dzis-nowy .dn-ul-dyplom{display:flex;margin:-4px 0 -10px}#dzis-nowy .dn-ul-dyplom .dn-link{margin:0 0 0 -4px}html.dzis-gotowy #bieg-pasek[data-wariant=dyplom]{display:none!important}" +
    "#dzis-nowy .dn-ul-przyciski{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}#dzis-nowy .dn-ul-przyciski .dn-drugi{margin:0;text-decoration:none}#dzis-nowy .dn-ul-przyciski .dn-drugi:only-child{grid-column:1/-1}" +
    "#dzis-nowy .dn-ul-mur .us-mur-przelacz{overflow:visible;z-index:3}#dzis-nowy .dn-ul-mur .us-mur-przelacz::after{content:'';position:absolute;inset:-12px -4px -4px}" +
    "#dzis-nowy .dn-pasek{height:8px;border-radius:4px;background:#1b1b21;overflow:hidden;margin:10px 0}#dzis-nowy .dn-pasek i{display:block;height:100%;border-radius:4px;background:#c44a13}" +
    "#dzis-nowy .dn-plan{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:0 0 8px}#dzis-nowy .dn-plan-g{display:flex;align-items:center;gap:10px;flex-wrap:wrap}#dzis-nowy .dn-tekst + .dn-plan,#dzis-nowy .dn-plan + .dn-plan,#dzis-nowy .dn-tekst + .dn-tytul{margin-top:14px}" +
    "#dzis-nowy .dn-typ{display:inline-block;padding:4px 10px;border-radius:999px;background:#1b1b21;color:#f5f3ef;font:600 12px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-cel{color:#f5f3ef;font:400 28px/1.1 'Bebas Neue','DM Sans',sans-serif;letter-spacing:.02em}#dzis-nowy .dn-cel span{display:inline-block;white-space:nowrap}#dzis-nowy .dn-zrobione{color:#6fcf97;font:600 12px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-liczby{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}#dzis-nowy .dn-l{min-width:0}#dzis-nowy .dn-liczby.dn-trzy{grid-template-columns:repeat(3,1fr)}" +
    "#dzis-nowy .dn-slupki{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin:16px 0 2px}#dzis-nowy .dn-sl{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}" +
    "#dzis-nowy .dn-sl-p{position:relative;width:100%;max-width:30px;height:64px}#dzis-nowy .dn-sl-p i{position:absolute;left:0;right:0;bottom:0;box-sizing:border-box;border-radius:6px 6px 2px 2px}" +
    "#dzis-nowy .dn-sl-p i.plan{border:1.5px dashed #77726b}#dzis-nowy .dn-sl-p i.zrob{background:#ff7a45}" +
    "#dzis-nowy .dn-sl b{min-height:13px;font:500 11px/13px 'DM Mono',monospace;color:#f5f3ef;white-space:nowrap}#dzis-nowy .dn-sl span{font:500 10px/1.2 'DM Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#a09b95}" +
    "#dzis-nowy .dn-sl.dzis span{color:#ff7a45}#dzis-nowy .dn-sl.dzis .dn-sl-p{box-shadow:0 1px 0 #ff7a45}" +
    "#dzis-nowy .dn-legenda{display:flex;gap:14px;margin:10px 0 0;font:500 11px/1.4 'DM Sans',sans-serif;color:#bcb8b2}#dzis-nowy .dn-legenda span{display:inline-flex;align-items:center;gap:6px}" +
    "#dzis-nowy .dn-legenda i{width:10px;height:10px;box-sizing:border-box;border-radius:3px}#dzis-nowy .dn-legenda i.plan{border:1.5px dashed #77726b}#dzis-nowy .dn-legenda i.zrob{background:#ff7a45}" +
    "#dzis-nowy .dn-tl{margin-top:10px}#dzis-nowy .dn-slupki.dn-puste{margin-bottom:0}" +
    "#dzis-nowy .dn-wlink{display:inline-flex;align-items:center;min-height:44px;margin:2px 0 -10px;padding:0;border:0;background:none;color:#ff7a45;font:600 13px/1 'DM Sans',sans-serif;cursor:pointer}" +
    "#dzis-nowy .dn-inne{margin:8px 0 0;font:400 12px/1.4 'DM Sans',sans-serif;color:#bcb8b2}" +
    "#dzis-nowy .dn-l b{display:block;font:400 26px/1 'Bebas Neue','DM Sans',sans-serif;letter-spacing:.02em;color:#f5f3ef;white-space:nowrap}" +
    "#dzis-nowy .dn-l b small{margin-left:3px;font:500 10px/1 'DM Mono',monospace;color:#bcb8b2;letter-spacing:.04em}#dzis-nowy .dn-l b.dn-slowo{font:600 13px/2 'DM Sans',sans-serif;letter-spacing:0}" +
    "#dzis-nowy .dn-l span{display:block;margin-top:5px;font:500 10px/1 'DM Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#8f8c97}" +
    "#dzis-nowy .dn-wiersze{list-style:none;margin:0;padding:0}#dzis-nowy .dn-wiersz{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid #232329}" +
    "#dzis-nowy .dn-wiersz:first-child{border-top:0;padding-top:0}#dzis-nowy .dn-wiersz:last-child{padding-bottom:0}" +
    "#dzis-nowy .dn-w-co{min-width:0;color:#f5f3ef;font:600 14px/1.3 'DM Sans',sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    "#dzis-nowy .dn-w-co small{display:block;margin-top:3px;color:#8f8c97;font:500 11px/1.2 'DM Mono',monospace;letter-spacing:.06em}" +
    "#dzis-nowy .dn-w-ile{flex:none;color:#bcb8b2;font:500 13px/1.3 'DM Sans',sans-serif;text-align:right;white-space:nowrap}#dzis-nowy .dn-w-ile b{color:#f5f3ef;font-weight:600}" +
    "#dzis-nowy .dn-ponow{min-height:44px;margin:10px 0 0;padding:0 16px;border-radius:12px;border:1px solid #2a2a30;background:#16161b;color:#f5f3ef;font:600 14px/1 'DM Sans',sans-serif;cursor:pointer}" +
    "@media (max-width:359px){#dzis-nowy .dn-liczby{grid-template-columns:1fr 1fr;gap:12px 8px}}" +
    "#dzis-nowy .dn-jp{margin:16px 0 0;padding:14px 0 0;border-top:1px solid #232329}" +
    "#dzis-nowy .dn-jp-t{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:0 0 4px;color:#8f8c97;font:500 11px/1.4 'DM Mono',monospace;letter-spacing:.2em;text-transform:uppercase}" +
    "#dzis-nowy .dn-jp-t small{color:#8f8c97;font:400 12px/1.3 'DM Sans',sans-serif;letter-spacing:0;text-transform:none}" +
    "#dzis-nowy .dn-jp-kt{margin:0 0 10px;color:#f5f3ef;font:600 14px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-miny{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 0}" +
    "#dzis-nowy .dn-mina{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:64px;padding:8px 2px;border-radius:12px;border:1px solid #2a2a30;background:#16161b;color:#bcb8b2;font:500 11px/1.2 'DM Sans',sans-serif;cursor:pointer}" +
    "#dzis-nowy .dn-mina[aria-pressed=true]{border-color:#ff7a45;background:rgba(196,74,19,.18);color:#f5f3ef}" +
    "#dzis-nowy .dn-jp textarea{display:block;width:100%;box-sizing:border-box;margin:10px 0 0;padding:11px 13px;border-radius:12px;border:1px solid #2a2a30;background:#0f0f13;color:#f5f3ef;font:400 16px/1.4 'DM Sans',sans-serif;resize:vertical}#dzis-nowy .dn-jp textarea::placeholder{color:#8f8c97}" +
    "#dzis-nowy .dn-jp-zeg{margin:10px 0 0;color:#8f8c97;font:400 13px/1.4 'DM Sans',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#dzis-nowy .dn-jp-zeg+textarea{margin-top:6px}" +
    "#dzis-nowy .dn-jp-licznik{display:block;margin:4px 2px 0;text-align:right;color:#8f8c97;font:500 12px/1.3 'DM Mono',monospace}#dzis-nowy .dn-jp-licznik.dn-za-duzo{color:#ff9a8a}#dzis-nowy .dn-jp-licznik[hidden]{display:none}" +
    "#dzis-nowy .dn-jp-akcje{display:flex;align-items:center;gap:8px;margin:10px 0 0}" +
    "#dzis-nowy .dn-jp-zapisz{flex:1;min-height:48px;box-sizing:border-box;border:1.5px solid #c44a13;border-radius:12px;background:transparent;color:#ff7a45;font:700 14px/1 'DM Sans',sans-serif;cursor:pointer}#dzis-nowy .dn-jp-zapisz.dn-pelny{background:#c44a13;color:#fff}#dzis-nowy .dn-jp-zapisz[disabled]{opacity:.6;cursor:default}" +
    "#dzis-nowy .dn-jp-pomin{min-height:48px;padding:0 14px;border:0;background:none;color:#bcb8b2;font:500 13px/1 'DM Sans',sans-serif;cursor:pointer}" +
    "#dzis-nowy .dn-jp-kom{margin:10px 0 0;color:#ff9a8a;font:500 13px/1.4 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-jp-ok{margin:16px 0 0;padding:14px 0 0;border-top:1px solid #232329;text-align:center}#dzis-nowy .dn-jp-ok b{display:block;color:#f5f3ef;font:700 14px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-jp-ok p{margin:4px 0 0;color:#bcb8b2;font:400 12px/1.5 'DM Sans',sans-serif}" +
    "#dzis-nowy button.dn-link{border:0;background:none;cursor:pointer}#dzis-nowy .dn-jp-ok p.dn-jp-karta{display:flex;justify-content:center;margin:2px 0 -8px}#dzis-nowy .dn-jp-karta .dn-link{margin:0}" +
    "#dzis-nowy .dn-glowny,#dzis-nowy .dn-drugi{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;margin:14px 0 0;border-radius:12px;font:700 14px/1 'DM Sans',sans-serif;cursor:pointer}" +
    "#dzis-nowy .dn-glowny{border:0;background:#c44a13;color:#fff}#dzis-nowy .dn-drugi{border:1px solid #2a2a30;background:#16161b;color:#f5f3ef;font-weight:600}" +
    "#dzis-nowy .dn-glowny:active,#dzis-nowy .dn-drugi:active{transform:scale(.99)}" +
    "#dzis-nowy .dn-dzialania:empty{display:none}#dzis-nowy .dn-ciche{display:flex;flex-wrap:wrap;justify-content:center;gap:0 4px;margin:8px 0 -6px}" +
    "#dzis-nowy .dn-cichy.dn-pod{display:block;width:100%;margin:6px 0 0}" +
    "#dzis-nowy .dn-cichy{min-height:44px;padding:0 12px;border:0;background:none;color:#bcb8b2;font:500 13px/1 'DM Sans',sans-serif;cursor:pointer}" +
    "#dzis-nowy .dn-bol{margin:14px 0 0;padding:12px 14px;border-radius:12px;border:1px solid rgba(232,184,64,.55);background:rgba(232,184,64,.07)}" +
    "#dzis-nowy .dn-bol b{display:block;color:#e8b840;font:600 13px/1.3 'DM Sans',sans-serif}#dzis-nowy .dn-bol p{margin:4px 0 0;color:#bcb8b2;font:400 13px/1.45 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-bol-akcje{display:flex;gap:8px;margin:10px 0 0}#dzis-nowy .dn-bol-akcje button{flex:1;min-height:44px;border-radius:10px;border:1px solid #3a3a44;background:none;color:#f5f3ef;font:600 13px/1 'DM Sans',sans-serif;cursor:pointer}" +
    "#dzis-nowy .dn-rada{display:block;width:100%;margin:12px 0 0;padding:12px 14px;border-radius:12px;border:1px solid #2a2a30;background:#16161b;color:#f5f3ef;text-align:left;cursor:pointer;font:400 14px/1.45 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-rada-kto{display:flex;justify-content:space-between;gap:10px;margin:0 0 4px;color:#8f8c97;font:500 11px/1.3 'DM Mono',monospace;letter-spacing:.06em}#dzis-nowy .dn-rada-kto b{color:#f5f3ef;font-weight:700}" +
    "#dzis-nowy .dn-rada-t{display:block;overflow-wrap:anywhere}#dzis-nowy .dn-rada-w{display:block;margin:6px 0 0;color:#ff7a45;font:600 13px/1.2 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-sp{list-style:none;margin:12px 0 0;padding:0}#dzis-nowy .dn-sp li{border-top:1px solid #232329}#dzis-nowy .dn-sp li:first-child{border-top:0}" +
    "#dzis-nowy .dn-sp-w{display:flex;align-items:center;gap:12px;box-sizing:border-box;width:100%;min-height:56px;padding:8px 0;border:0;background:none;color:inherit;text-align:left;font:inherit}#dzis-nowy button.dn-sp-w{cursor:pointer}#dzis-nowy .dn-sp li:first-child .dn-sp-w{padding-top:0}" +
    "#dzis-nowy .dn-sp-av{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;color:#fff;font:700 15px/1 'DM Sans',sans-serif}#dzis-nowy .dn-sp-licz{background:#1b1b21;color:#f5f3ef;font:400 22px/1 'Bebas Neue','DM Sans',sans-serif}#dzis-nowy .dn-sp-medal{background:#1b1b21}" +
    "#dzis-nowy .dn-sp-t{flex:1;min-width:0;color:#bcb8b2;font:400 14px/1.35 'DM Sans',sans-serif;overflow-wrap:anywhere}#dzis-nowy .dn-sp-t b{color:#f5f3ef;font-weight:600}" +
    "#dzis-nowy .dn-sp-t small{display:block;margin-top:2px;color:#8f8c97;font:400 12px/1.35 'DM Sans',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "#dzis-nowy button.dn-link{border:0;background:none;cursor:pointer}#dzis-nowy .dn-sp-pusto{margin:12px 0 0}#dzis-nowy .dn-sp-pusto .dn-link{margin:0 -4px 0 0;min-height:44px}" +
    "#dzis-nowy .dn-ukryte{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}" +
    "html.dzis-gotowy.dzis-na-dzis body > .topbar,html.dzis-gotowy.dzis-na-dzis body > #okienko-pole{display:none!important}" +
    "@media (prefers-reduced-motion:reduce){#dzis-nowy .dn-okr:active,#dzis-nowy .dn-zapytaj:active,#dzis-nowy .dn-zegarek .wc-badge:active,#dzis-nowy .dn-trener:active,#dzis-nowy .dn-moment:active,#dzis-nowy .dn-glowny:active,#dzis-nowy .dn-drugi:active{transform:none}#dzis-nowy .dn-zd.dn-zd-wjazd,#dzis-nowy .dn-jp.dn-jp-swiatlo{animation:none}#dzis-nowy .dn-kadr-o{transition:none}}";

  function wstawCss() {
    if (d.getElementById("dzis-nowy-css")) return;
    var s = d.createElement("style"); s.id = "dzis-nowy-css"; s.textContent = CSS;
    d.head.appendChild(s);
  }

  var DNI = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
  var MIESIACE = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  /** „środa · 25 listopada” z LOKALNEJ daty telefonu (nie UTC). */
  function dataDzis(teraz) { var t = teraz || new Date(); return DNI[t.getDay()] + " · " + t.getDate() + " " + MIESIACE[t.getMonth()]; }

  /** Imię z profilu (fala 1), a zanim dojdzie: z paska starego ekranu; „—” i pusty = samo „Cześć”. */
  function imie() {
    var el = d.getElementById("topbar-name"), t = String(dane.imie || "").trim() || (el ? String(el.textContent || "").trim() : "");
    return t && t !== "—" ? t.split(/\s+/)[0] : "";
  }
  function powitanie() { var i = imie(); return i ? "Cześć, " + i : "Cześć"; }
  /** Klasa powitania wg długości: na kadrze powitanie nie może się złamać (blizna-385), więc długie imię dostaje mniejszą czcionkę. Poza kadrem klasy nic nie zmieniają. */
  /** Klasa daty wg długości: na kadrze data nie może się złamać, więc długa dostaje ciaśniejsze odstępy liter. Poza kadrem klasy nic nie zmieniają. */
  function klasaDaty(t) { var n = String(t || "").length; return "dn-data" + (n > 27 ? " dn-data-s" : n > 23 ? " dn-data-m" : ""); }
  function klasaPowitania(t) { var n = String(t || "").length; return "dn-powitanie" + (n > 19 ? " dn-pow-s" : n > 15 ? " dn-pow-m" : ""); }
  /** Licznik dzwonka: lustro kropki starego dzwonka (liczbę liczy stary kod). */
  function licznikDzwonka() {
    var el = d.getElementById("zawodnik-bell-dot");
    if (!el || (el.style && el.style.display === "none")) return "";
    return String(el.textContent || "").trim();
  }

  function szkieletHtml() {
    var kafle = KAFLE.map(function (k) {
      if (k[0] === "skroty") {
        return '<nav class="dn-skroty" data-kafel="skroty" aria-label="Skróty">' + SKROTY.map(function (s) {
          return (s[3] === "strona" ? '<a class="dn-skrot" href="' + s[4] + '"' : '<button type="button" class="dn-skrot" data-sekcja="' + s[4] + '"') + ' data-skrot="' + s[0] + '">' +
            '<span class="dn-krazek">' + ikonaSvg(s[2]) + "</span><span>" + esc(s[1]) + "</span>" + (s[3] === "strona" ? "</a>" : "</button>");
        }).join("") + "</nav>";
      }
      return '<section class="dn-kafel" data-kafel="' + k[0] + '" aria-busy="true"><h2 class="dn-etykieta">' + esc(k[1]) + '</h2>' +
        '<span class="dn-szkielet"></span><span class="dn-szkielet k"></span>' + (k[0] === "trening" ? '<span class="dn-szkielet w"></span>' : "") +
        '<span class="dn-ukryte">Wczytuję…</span></section>';
    }).join("");
    var kadr = null; try { kadr = kadrNaTeraz(); } catch (e) { kadr = null; }
    kadrTeraz = kadr;
    return '<header class="dn-naglowek' + (kadr ? ' dn-kadr" data-kadr="' + esc(kadr.id) + '" style="background-color:' + esc(kadr.tlo) + '">' + kadrHtml(kadr) : '">') + '<div><button type="button" class="dn-trener" data-dn="trener" hidden>← Trener</button><div class="' + klasaDaty(dataDzis()) + '" data-dn="data">' + esc(dataDzis()) + '</div><h1 class="' + klasaPowitania(powitanie()) + '" data-dn="powitanie">' + esc(powitanie()) + "</h1></div>" +
      '<div class="dn-akcje"><span class="dn-zegarek" data-dn="zegarek" hidden></span>' +
      '<button type="button" class="dn-okr" data-dn="dzwonek" aria-label="Powiadomienia">' + ikonaSvg("dzwonek") + '<span class="dn-licznik" data-dn="licznik" hidden></span></button></div></header>' +
      '<p class="dn-tydz" data-dn="tydzien-linia"></p>' +
      '<div class="dn-rzad"><button type="button" class="dn-zapytaj" data-dn="okienko" aria-haspopup="dialog"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Zapytaj</span></button>' +
      '<button type="button" class="dn-okr dn-awatar" data-dn="konto" aria-haspopup="menu" aria-expanded="false" aria-label="Konto"><span data-dn="inicjaly"></span><img data-dn="foto" alt="" hidden></button></div>' +
      '<div class="dn-menu" data-dn="menu" role="menu" hidden><div class="dn-menu-kto" data-dn="email"></div>' +
      '<button type="button" role="menuitem" data-dn="m-profil">Mój profil</button><button type="button" role="menuitem" data-dn="m-dzwieki">Dźwięki</button>' +
      '<a role="menuitem" href="gra.html">BiegaMy: Wyzwanie</a><a role="menuitem" class="dn-menu-cichy" href="o-nas.html">O nas</a><a role="menuitem" class="dn-menu-cichy" href="terms.html">Regulamin</a><a role="menuitem" class="dn-menu-cichy" href="privacy.html">Polityka prywatności</a>' +
      '<button type="button" role="menuitem" class="dn-menu-wyloguj" data-dn="m-wyloguj">Wyloguj się</button></div>' +
      '<div class="dn-zd" data-dn="zdarzenie" hidden></div>' +
      '<div class="dn-kafle">' + kafle + "</div>" +
      '<a class="dn-stare" href="zawodnik.html?dzis=stary">stare Dziś ›</a>';
  }

  function odswiezNaglowek() {
    var k = korzen(); if (!k || !k.querySelector) return;
    var p = k.querySelector('[data-dn="powitanie"]'), da = k.querySelector('[data-dn="data"]'), l = k.querySelector('[data-dn="licznik"]');
    if (p) { p.textContent = powitanie(); p.className = klasaPowitania(p.textContent); }
    if (da) { da.textContent = dataDzis(); da.className = klasaDaty(da.textContent); }
    if (l) { var n = licznikDzwonka(); l.textContent = n; l.hidden = !n; }
    konto();
  }
  function tekstStarego(id) { var el = d.getElementById(id); return el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : ""; }
  /** Avatar, adres konta, napis o dźwiękach i chip trenera: odbicie tego, co stary kod wpisał w schowany górny pasek. */
  function konto() {
    var k = korzen(); if (!k || !k.querySelector) return;
    var ini = k.querySelector('[data-dn="inicjaly"]'), foto = k.querySelector('[data-dn="foto"]'), em = k.querySelector('[data-dn="email"]'), dz = k.querySelector('[data-dn="m-dzwieki"]'), tr = k.querySelector('[data-dn="trener"]');
    if (ini) ini.textContent = tekstStarego("av-initials").slice(0, 2);
    if (foto) {
      var stare = d.getElementById("av-photo"), adres = stare && stare.style && stare.style.display !== "none" ? String(stare.getAttribute ? stare.getAttribute("src") || "" : stare.src || "") : "";
      adres = adres && typeof w.safeUrlAttr === "function" ? String(w.safeUrlAttr(adres) || "") : "";   // tylko adresy, które przepuszcza wspólny filtr aplikacji
      if (foto._dnAdres !== adres) { foto._dnAdres = adres; if (adres) foto.src = adres; else if (foto.removeAttribute) foto.removeAttribute("src"); }
      foto.hidden = !adres; if (ini) ini.hidden = !!adres;
    }
    if (em) { var e1 = tekstStarego("menu-email"); em.textContent = e1 === "..." ? "" : e1; em.hidden = !em.textContent; }
    if (dz) { var t = tekstStarego("sound-menu-item").replace(/^[^A-Za-zĄ-ż]+/, ""); dz.textContent = t || "Dźwięki"; }
    if (tr) {
      var chip = d.getElementById("back-to-trener"), ds = chip && chip.style ? String(chip.style.display || "") : "";
      if (chip && ds !== "" && ds !== "none") trenerWidziany = true;   // stary kod odsłania chip tylko trenerom; na czas banera momentu chowa go z braku miejsca, tu miejsce jest
      tr.hidden = !(chip && trenerWidziany);
    }
  }
  function menuKonta(otworz) {
    var k = korzen(); if (!k || !k.querySelector) return;
    var m = k.querySelector('[data-dn="menu"]'), b = k.querySelector('[data-dn="konto"]'); if (!m) return;
    var ma = otworz == null ? !!m.hidden : !!otworz;
    if (ma) konto();
    m.hidden = !ma; if (b && b.setAttribute) b.setAttribute("aria-expanded", ma ? "true" : "false");
  }

  /** Jedno delegowane kliknięcie na korzeniu: Okienko i dzwonek wołają to, co stary ekran; skróty-sekcje wołają showSection. */
  function klik(e) {
    var t = e && e.target && e.target.closest ? e.target.closest("[data-dn],[data-sekcja]") : null;
    if (!t) {   // „✕” odbitego paska zegarka: jego własny onclick już go usunął z drzewa (stąd brak przodka z data-dn); zamykamy też oryginał, żeby nie wrócił na innych sekcjach
      try { if (e && e.target && e.target.closest && e.target.closest(".wc-pasek button")) { var org = d.getElementById("watch-pasek-slot"); if (org) org.innerHTML = ""; zdarzenie(); } } catch (err) {}
      return;
    }
    try {
      var co = t.getAttribute("data-dn"), sekcja = t.getAttribute("data-sekcja");
      if (co === "konto") { menuKonta(null); return; }
      if (co === "menu" || co === "email") return;   // tło menu i odnośniki w nim: nic nie zamykamy, przeglądarka robi swoje
      menuKonta(false);
      if (co === "m-profil") { if (typeof w.goToMyProfile === "function") w.goToMyProfile(); }
      else if (co === "m-dzwieki") { if (typeof w.toggleSoundSetting === "function") Promise.resolve(w.toggleSoundSetting()).then(function () { menuKonta(true); }, function () {}); }
      else if (co === "m-wyloguj") { if (typeof w.logout === "function") w.logout(); }
      else if (co === "trener") { var chip = d.getElementById("back-to-trener"); if (chip && chip.click) chip.click(); }   // stary odnośnik: ten sam adres i to samo sprzątanie po podglądzie
      else if (co === "okienko") { var pole = d.getElementById("okienko-pole"); if (pole && pole.click) pole.click(); }
      else if (co === "dzwonek") { if (typeof w.openNotifications === "function") w.openNotifications(); }
      else if (co === "ponow") { rysuj(); odswiezNaglowek(); wczytaj(true); }
      else if (co === "stary") { var sid = t.getAttribute("data-stary"), stp = STARE_PRZYCISKI.indexOf(sid) >= 0 ? d.getElementById(sid) : null; if (stp && stp.click) stp.click(); }
      else if (co === "generator") { if (typeof w.openGenModal === "function") w.openGenModal(); }   // stare okno „Ułóż plan”, ta sama droga co w starym Dziś
      else if (co === "rada" || co === "napisz") {   // jak „Napisz do trenera” w starej karcie: sekcja wiadomości, potem wątek trenera
        if (typeof w.showSection === "function") w.showSection("msgs");
        w.setTimeout(function () { try { if (typeof w.openChatThread === "function") w.openChatThread("coach", null, null); } catch (e2) {} }, 400);
      }
      else if (co === "zaloguj") { if (typeof w.openModal === "function") w.openModal(); }
      else if (co === "jp-pokaz") { jpPokaz(); }
      else if (co === "jp-mina") { jpWybierz(t.getAttribute("data-kod")); }
      else if (co === "jp-zapisz") { jpZapisz(false); }
      else if (co === "jp-pomin") { jpPomin(); }
      else if (co === "karta") { kartaKlik(t.getAttribute("data-log")); }
      else if (co === "moment") { var stary = d.getElementById("moment-baner"); if (stary && stary.click) stary.click(); zdarzenie(); }
      else if (co === "sp-profil") { var pid = String(t.getAttribute("data-id") || ""); if (RE_UUID.test(pid) && typeof w.openAthleteProfile === "function") w.openAthleteProfile(pid); }
      else if (sekcja && typeof w.showSection === "function") w.showSection(sekcja);
    } catch (err) { zglos("render"); }
  }

  /** Korzeń i chowanie starego Dziś tylko przy włączonym przełączniku, na sekcji Dziś i gdy nowy ekran nie ustępuje. */
  function pokaz() {
    var k = korzen(), aktywny = wlaczone() && !ustepuje() && !wstrzymane, widac = aktywny && naDzis();
    html().classList[aktywny ? "add" : "remove"]("dzis-gotowy");
    html().classList[widac ? "add" : "remove"]("dzis-na-dzis");
    if (k) k.hidden = !widac;
    if (!widac) menuKonta(false);
    if (widac) odswiezNaglowek();
  }

  function obserwuj() {
    if (obserwatorzy || typeof w.MutationObserver !== "function") return;
    obserwatorzy = true;
    ["topbar-name", "zawodnik-bell-dot", "av-initials", "av-photo", "menu-email", "sound-menu-item", "back-to-trener"].forEach(function (id) {
      var el = d.getElementById(id);
      if (el) new w.MutationObserver(function () { try { odswiezNaglowek(); } catch (e) {} }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
    });
    var pz = d.getElementById("watch-pasek-slot");
    if (pz) new w.MutationObserver(function () { try { zdarzenie(); } catch (e) {} }).observe(pz, { childList: true });
    var bp = d.getElementById("today-bol");   // stary kod przerysowuje pudełko po każdym zgłoszeniu i zamknięciu
    if (bp) new w.MutationObserver(function () { try { dzialania(); } catch (e) {} }).observe(bp, { childList: true, subtree: true });
    var nz = d.getElementById("today-nie-zrobilem");   // stary kod pokazuje go przez style.display i zmienia napis po zapisie
    if (nz) new w.MutationObserver(function () { try { dzialania(); } catch (e) {} }).observe(nz, { attributes: true, childList: true, characterData: true, subtree: true });
    var cn = d.getElementById("coach-nm");   // imię trenera stary kod dopisuje po swoim zapytaniu, zwykle później niż przyjdzie wiadomość
    if (cn) new w.MutationObserver(function () { try { if (dane.wiadomosc) rysujTrening(); } catch (e) {} }).observe(cn, { childList: true, characterData: true, subtree: true });
    var mb = d.getElementById("moment-baner");   // stary kod odsłania i chowa przycisk przez style.display
    if (mb) new w.MutationObserver(function () { try { zdarzenie(); } catch (e) {} }).observe(mb, { attributes: true, attributeFilter: ["style"] });
  }

  function czesc(n) { var k = korzen(); return k && k.querySelector ? k.querySelector('[data-dn="' + n + '"]') : null; }
  var MOMENT_HTML = '<button type="button" class="dn-moment" data-dn="moment"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 3l2.2 5.6L20 9.3l-4.4 3.9L17 19l-5-3-5 3 1.4-5.8L4 9.3l5.8-.7z"/></svg><span>Nowy moment!<small>Dotknij, żeby zobaczyć</small></span><i aria-hidden="true">›</i></button>';
  /** Czy stary kod (loadMomenty) odsłonił przycisk „Nowy moment!”: jest zatwierdzony, niepokazany moment. */
  function momentCzeka() { var b = d.getElementById("moment-baner"), ds = b && b.style ? String(b.style.display || "") : ""; return !!b && ds !== "" && ds !== "none"; }
  /** Zachęta „Jak poszło?” w pasku: tylko gdy w kaflu „Ostatni trening” jest blok do wypełnienia (ten sam stan jp), nie po udanym zapisie. */
  function jpPasekHtml() {
    if (!jp || jp.zapisane) return "";
    return '<button type="button" class="dn-moment" data-dn="jp-pokaz">' + minaSvg("good") + "<span>Jak poszło?<small>" + esc(jp.opis || "") + '</small></span><i aria-hidden="true">›</i></button>';
  }
  function wysokoscPaska(el) { try { var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null; return el.hidden || !r ? 0 : r.height + 12; } catch (e) { return 0; } }
  /** Pasek zdarzenia pod nagłówkiem: jedna rzecz naraz. Kolejność: problem z zegarkiem (stary kod wstawia go do #watch-pasek-slot) → moment → „Jak poszło?”.
      Zmiana wysokości paska nie może szarpać ekranem: patrz komentarz na górze pliku. */
  function zdarzenie() {
    var el = czesc("zdarzenie"); if (!el) return;
    var org = d.getElementById("watch-pasek-slot"), html = org ? String(org.innerHTML || "").trim() : "";
    if (!html && momentCzeka()) html = MOMENT_HTML;
    if (!html) html = jpPasekHtml();
    if (el._dnHtml === html && el.hidden === !html) return;
    var przed = wysokoscPaska(el), dol = null, bylUkryty = !!el.hidden;
    try { if (el.getBoundingClientRect) dol = el.getBoundingClientRect().top; } catch (e) {}
    if (el._dnHtml !== html) { el.innerHTML = html; el._dnHtml = html; }
    el.hidden = !html;
    var nadEkranem = dol != null && dol < 0, cl = el.classList;
    if (cl && cl.remove) cl.remove("dn-zd-wjazd");
    if (nadEkranem) {   // ktoś czyta niżej: treść pod palcem ma zostać w miejscu (przeglądarki bez kotwiczenia przewijania, np. Safari na iOS)
      var roznica = wysokoscPaska(el) - przed, kotwiczy = false;
      try { kotwiczy = !!(w.CSS && w.CSS.supports && w.CSS.supports("overflow-anchor", "auto")); } catch (e) {}
      if (roznica && !kotwiczy && typeof w.scrollBy === "function") w.scrollBy(0, roznica);
    } else if (html && bylUkryty && dane.kafleStoja && cl && cl.add) cl.add("dn-zd-wjazd");   // pojawia się na widoku po szkielecie: wsuwa się, nie przeskakuje
  }
  /** Dotknięcie zachęty: do bloku w kaflu. Bez animacji przewijania, gdy telefon prosi o ograniczenie ruchu. */
  function jpPokaz() {
    if (!jp || jp.zapisane) return;
    var blok = jpCzesc("jp"); if (!blok) return;
    var spokojnie = false; try { spokojnie = !!(w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
    try { if (blok.scrollIntoView) blok.scrollIntoView({ behavior: spokojnie ? "auto" : "smooth", block: "center" }); } catch (e) {}
    try { if (blok.classList) { blok.classList.remove("dn-jp-swiatlo"); void blok.offsetWidth; blok.classList.add("dn-jp-swiatlo"); } } catch (e) {}
    try { var mina = jpCzesc("jp-mina"); if (mina && mina.focus) mina.focus({ preventScroll: true }); } catch (e) {}
  }
  /** Plakietka zegarka: ta sama WATCH.render co w starym pasku, stan z profilu (opts.stan), więc bez zapytania. Starszy sb.js bez stanZProfilu
      (telefon trzyma go jeszcze w pamięci): plakietki nie ma, ale też nie ma szóstego zapytania. */
  function zegarek(a, nr) {
    var el = czesc("zegarek"), W = w.WATCH; if (!el) return;
    if (!W || typeof W.render !== "function" || typeof W.stanZProfilu !== "function") { el.hidden = true; return; }
    try {
      Promise.resolve(W.render("badge", { athleteId: a.id, returnTo: "zawodnik.html", stan: W.stanZProfilu(a) })).then(function (h) {
        if (nr !== dane.nr) return;
        h = String(h || ""); el.innerHTML = h; el.hidden = !h;
      }, function () { el.hidden = true; });
    } catch (e) { el.hidden = true; }
  }

  /* ── DZIAŁANIA PRZY TRENINGU: odbicie stanu starej karty, kliknięcia idą do jej przycisków ── */
  function jestStary(id) { return !!d.getElementById(id); }
  function cichy(id, napis) { return jestStary(id) ? '<button type="button" class="dn-cichy" data-dn="stary" data-stary="' + id + '">' + esc(napis) + "</button>" : ""; }
  /** Ból: nic, dopóki stary kod nie ustalił stanu; bez zgłoszenia ciche „Coś boli” (i „Napisz do trenera”, gdy stara karta je ma);
      z aktywnym zgłoszeniem ramka z poziomem, miejscem i „Już nie boli” (po 30 dniach także „Nadal boli”, jak w starym).
      bezCzatu: kafel ma już duży „Napisz do trenera” (dziś bez planu, konto z trenerem), więc cichy drugi raz go nie powtarza (P1a, blizna-408). */
  function bolHtml(teraz, bezCzatu) {
    var box = d.getElementById("today-bol");
    if (!box) return { ramka: "", ciche: "" };
    var akt = w._aktywnaKontuzja;
    if (!akt || !jestStary("today-bol-koniec")) return { ramka: "", ciche: cichy("today-bol-btn", "Coś boli") + (bezCzatu ? "" : cichy("today-bol-czat", "Napisz do trenera")) };
    var B = w.BOL, dni = Math.max(0, Math.round(((teraz == null ? Date.now() : teraz) - new Date(akt.created_at).getTime()) / 864e5));
    var odKiedy = !isFinite(dni) ? "" : dni === 0 ? "dziś" : dni === 1 ? "od wczoraj" : "od " + dni + " dni", nadal = jestStary("today-bol-nadal");
    var tytul = B && typeof B.nazwaPoziomu === "function" && typeof B.nazwaMiejsca === "function" ? String(B.nazwaPoziomu(akt.poziom)) + " · " + String(B.nazwaMiejsca(akt.miejsce)) : "Zgłoszony ból";
    var coDalej = ""; try { coDalej = nadal ? "Nadal boli?" : typeof w._bolCoDalej === "function" ? String(w._bolCoDalej(Number(akt.poziom) === 3) || "") : ""; } catch (e) {}
    return { ciche: "", ramka: '<div class="dn-bol" data-dn="bol"><b>' + esc(tytul) + "</b><p>" + esc("Zgłoszone" + (odKiedy ? " " + odKiedy : "") + "." + (coDalej ? " " + coDalej : "")) + "</p>" +
      '<div class="dn-bol-akcje"><button type="button" data-dn="stary" data-stary="today-bol-koniec">Już nie boli</button>' + (nadal ? '<button type="button" data-dn="stary" data-stary="today-bol-nadal">Nadal boli</button>' : "") + "</div></div>" };
  }
  /** „Wczoraj nie zrobiłem” / „Wczoraj: nie zrobione ✓ · cofnij”: tylko gdy stary kod odsłonił swój przycisk; napis jego. */
  function wczorajHtml() {
    var st = d.getElementById("today-nie-zrobilem"), ds = st && st.style ? String(st.style.display || "") : "";
    if (!st || ds === "" || ds === "none") return "";
    var napis = String(st.textContent || "").replace(/\s+/g, " ").trim();
    return napis ? '<button type="button" class="dn-cichy" data-dn="stary" data-stary="today-nie-zrobilem">' + esc(napis) + "</button>" : "";
  }
  function dzialaniaHtml() {
    var b = bolHtml(undefined, !!dane.trening && !dane.trening.length && stanBezPlanu() === "trener"), ciche = wczorajHtml() + b.ciche;
    return b.ramka + (ciche ? '<div class="dn-ciche">' + ciche + "</div>" : "");
  }
  /** Wiadomość od trenera: tylko z ostatnich 7 dni (po kalendarzu telefonu), sam tekst (znaczniki zdjęć i GIF-ów wycięte, wynik escapowany), najwyżej 140 znaków. */
  function radaHtml(m, teraz) {
    if (!m) return "";
    var n = dniTemu(m.sent_at, teraz); if (n == null || n > OKNO_WIADOMOSCI_DNI) return "";
    var surowe = String(m.body || ""), tekst = surowe.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!tekst && /<(img|video)\b/i.test(surowe)) tekst = "zdjęcie albo GIF";
    if (!tekst) return "";
    if (tekst.length > 140) tekst = tekst.slice(0, 137) + "…";
    return '<button type="button" class="dn-rada" data-dn="rada"><span class="dn-rada-kto"><b>' + esc(tekstStarego("coach-nm") || "Trener") + "</b><span>" + esc(kiedy(m.sent_at, teraz)) + '</span></span><span class="dn-rada-t">' + esc(tekst) + '</span><span class="dn-rada-w">Czytaj ›</span></button>';
  }
  /* ── DZIŚ BEZ PLANU: generator albo trener (blizna-388) ──
     Konto BEZ trenera ma generator planów, konto Z trenerem nie (decyzja Filipa 26.11). O tym, co pokazać, gdy na dziś nie ma treningu, decyduje
     TA SAMA reguła co w starym Dziś i w Okienku: stanPlanu z js/plan-pusty.mjs (stary kod wystawia ją jako window._planPusty). Moduł jej nie przepisuje.
       „generator” → „Ułóż plan” (stare openGenModal, ta sama droga co w starym Dziś), „Dodaj trening” jako drugi, cichy przycisk;
       „trener”    → „Trener jeszcze nie wysłał planu na dziś.” i „Napisz do trenera” (sekcja wiadomości, wątek trenera); NIGDY generator;
       „wolne”     → konto bez trenera z planem z generatora, w którym dziś nie ma treningu: „Dziś wolne”;
       null        → jeszcze nie wiadomo (reguła się nie wczytała, profil nie doszedł): neutralne „Dziś bez planu”, bez obietnic.
     Ta sama reguła daje link „Ułóż plan ›” w kaflu „Ten tydzień”, gdy tydzień jest pusty albo to pierwszy tydzień konta (blizna-393): tylko konto
     bez trenera i bez planu z generatora, i tylko gdy w tygodniu nie ma żadnego planu. Konto z trenerem nigdy go nie widzi.
     Reguła wczytuje się w starym kodzie własnym importem; gdy kafel rysuje się wcześniej, moduł zagląda ponownie co pół sekundy (najwyżej 10 s). */
  var czekaNaRegule = 0;
  /** Wynik reguły dla podanego „czy brakuje planu”; null = nie wiadomo (reguła albo profil się nie wczytały). */
  function stanPlanuDla(brakPlanu) {
    try {
      var R = w._planPusty; if (!R || typeof R.stanPlanu !== "function" || dane.trener == null) return null;
      var dzis = kluczDnia(), gen = w._maPlanGeneratora === true || (dane.plany || []).some(function (t) { return t && t.plan_source === "generator" && t.date >= dzis; });
      return R.stanPlanu({ maTrenera: dane.trener === true, maPlanGeneratora: gen, brakPlanu: brakPlanu }) || null;
    } catch (e) { return null; }
  }
  function stanBezPlanu() { return dane.trening ? stanPlanuDla(!dane.trening.length) : null; }
  /** Czy w kaflu tygodnia wolno zaproponować generator: reguła mówi „generator” i strona ma czym go otworzyć. */
  function generatorWTygodniu() { return stanPlanuDla(true) === "generator" && typeof w.openGenModal === "function"; }
  function czekajNaRegule() {
    if (w._planPusty || czekaNaRegule) return;
    var proby = 0; czekaNaRegule = 1;
    (function sprawdz() {
      if (w._planPusty) { czekaNaRegule = 0; try { if (wlaczone() && dane.trening && !dane.trening.length) { rysujTrening(); rysujTydzien(); } } catch (e) {} return; }
      if (++proby > 20) { czekaNaRegule = 0; return; }
      w.setTimeout(sprawdz, 500);
    })();
  }
  /** Treść kafla, gdy na dziś nie ma treningu. stan z stanBezPlanu(); generator tylko, gdy stary kod ma czym go otworzyć. */
  function bezPlanuHtml(stan) {
    var cichy = '<button type="button" class="dn-cichy dn-pod" data-dn="zaloguj">Dodaj trening</button>';
    if (stan === "generator" && typeof w.openGenModal === "function") return '<h3 class="dn-tytul">Dziś bez planu</h3><p class="dn-tekst">Nie masz planu? Ułóż go w minutę.</p><button type="button" class="dn-glowny" data-dn="generator">Ułóż plan</button>' + cichy;
    if (stan === "trener") return '<h3 class="dn-tytul">Dziś bez planu</h3><p class="dn-tekst">Trener jeszcze nie wysłał planu na dziś.</p><button type="button" class="dn-glowny" data-dn="napisz">Napisz do trenera</button>' + cichy;
    if (stan === "wolne") return '<h3 class="dn-tytul">Dziś wolne</h3><p class="dn-tekst">W Twoim planie nie ma dziś treningu.</p>' + zalogujHtml(false);
    return '<h3 class="dn-tytul">Dziś bez planu</h3><p class="dn-tekst">Każdy kilometr i tak się liczy.</p>' + zalogujHtml(false);
  }
  /** Cały kafel „Trening na dziś” z tego, co już wczytane: plan, wiadomość od trenera, pas działań. Woła go każda z dwóch odpowiedzi fali 2. */
  function rysujTrening() {
    if (!dane.trening) return;
    dane.pogoda = pogodaTekst();
    if (!dane.trening.length) czekajNaRegule();
    wpisz("trening", treningHtml(dane.trening, dane.pogoda, stanBezPlanu()) + radaHtml(dane.wiadomosc) + '<div class="dn-dzialania" data-dn="dzialania"></div>');
    var pas = czesc("dzialania"); if (pas) pas._dnHtml = null;
    dzialania();
  }
  /** Przerysowuje sam pas działań w kaflu treningu (stan starej karty zmienił się po zgłoszeniu, zamknięciu, wczytaniu). */
  function dzialania() {
    var el = czesc("dzialania"); if (!el) return;
    var h = dzialaniaHtml(); if (el._dnHtml !== h) { el.innerHTML = h; el._dnHtml = h; }
  }

  /* ── DANE ───────────────────────────────────────────────────────────────────────────────────────────────── */
  function liczba(n, m, zera) { n = Number(n); if (!isFinite(n)) return "—"; var t = n.toFixed(m || 0).split("."), ul = zera ? t[1] || "" : (t[1] || "").replace(/0+$/, ""); return t[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (ul ? "," + ul : ""); }
  function km(x) { var n = Number(x); return isFinite(n) && n > 0 ? liczba(n, n < 10 ? 2 : 1) : "—"; }
  /** Kilometry w kaflu Społeczność (S1, blizna-414): zawsze jedno miejsce po przecinku, także zero (4,0 · 10,2); brak albo 0 = "". */
  function kmSpol(x) { var n = Number(x); return isFinite(n) && n > 0 ? liczba(n, 1, true) : ""; }
  /** Czas z bazy ("h:mm:ss" albo "mm:ss") → "1:02:15" / "48:10"; inny zapis = „—”. */
  function czas(t) {
    if (!/^\d{1,3}:\d{2}(:\d{2})?$/.test(String(t || ""))) return "—";
    var s = String(t).split(":").reduce(function (a, b) { return a * 60 + Number(b); }, 0); if (!(s > 0)) return "—";
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sek = s % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (sek < 10 ? "0" : "") + sek;
  }
  /** Tempo z bazy ("5:12", ręcznie bywa "5:12/km") → "5:12". */
  function tempo(p) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(p || "")); if (!m) return "—";
    var s = Number(m[1]) * 60 + Number(m[2]); return s > 0 ? Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60) : "—";
  }
  /** Klucz dnia z LOKALNEGO zegara telefonu (kolumna trainings.date). */
  function kluczDnia(t) { t = t || new Date(); return t.getFullYear() + "-" + (t.getMonth() < 9 ? "0" : "") + (t.getMonth() + 1) + "-" + (t.getDate() < 10 ? "0" : "") + t.getDate(); }
  /** Ile dni kalendarzowych temu (lokalnie) był wpis; null przy złej dacie. */
  function dniTemu(iso, teraz) {
    var a = new Date(iso), t = teraz || new Date(); if (isNaN(a.getTime())) return null;
    return Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
  }
  /** Reguła 14 dni (Filip 25.11): do 14 dni „dziś / wczoraj / N dni temu”, starszy „X tygodni temu”, od 52 tygodni „ponad rok temu”. */
  function kiedy(iso, teraz) {
    var n = dniTemu(iso, teraz); if (n == null) return "";
    if (n <= 0) return "dziś"; if (n === 1) return "wczoraj"; if (n <= 14) return n + " dni temu";
    var t = Math.floor(n / 7); if (t >= 52) return "ponad rok temu";
    return t + (t % 10 >= 2 && t % 10 <= 4 && (t % 100 < 12 || t % 100 > 14) ? " tygodnie temu" : " tygodni temu");
  }
  var DNI_KR = ["nd", "pn", "wt", "śr", "cz", "pt", "sb"];
  function dzienKrotko(iso) { var a = new Date(iso); return isNaN(a.getTime()) ? "" : DNI_KR[a.getDay()] + " " + a.getDate() + "." + (a.getMonth() < 9 ? "0" : "") + (a.getMonth() + 1); }
  function pigulka(typ) { var t = String(typ || "Trening"); return typeof w.renderTypePill === "function" ? w.renderTypePill(t) : '<span class="dn-typ">' + esc(t) + "</span>"; }
  /** Nagłówek kafla. link = [napis, adres] albo null; przycisk = gotowy przycisk w miejscu linku (karta dnia), ma pierwszeństwo. */
  function gora(etykieta, kto, link, przycisk) {
    return '<div class="dn-gora"><div><h2 class="dn-etykieta">' + esc(etykieta) + "</h2>" + (kto ? '<div class="dn-kto">' + esc(kto) + "</div>" : "") + "</div>" +
      (przycisk || (link ? '<a class="dn-link" href="' + esc(link[1]) + '">' + esc(link[0]) + " ›</a>" : "")) + "</div>";
  }
  function wkladTekst(wklad, koniec) {
    if (!wklad) return "";
    var k = Number(wklad.km) || 0;
    return k > 0 ? "Twój wkład: <b>" + esc(liczba(k, k < 10 ? 1 : 0)) + " km</b>" : "Twój wkład: <b>0 km</b>" + (koniec ? "" : ". Spacer też buduje ulicę.");
  }
  /** Kafel Ulica: licznik akcji. d = akcja_licznik (po starcie), wklad = akcja_moj_wklad albo null. zeScena: okno sceny na górze kafla (E3).
      koniec: akcja zamknięta (stanAkcji): suma „razem” bez celu i paska, wkład bez zachęty (E3 commit 4). dyplom: adres z paska biegu albo null (P1b). */
  function ulicaHtml(d, wklad, adres, zeScena, koniec, dyplom) {
    var suma = Number(d.suma_km) || 0, cel = Number(d.cel_km) || 0, p = Number(d.pct);
    p = Math.max(0, Math.min(100, isFinite(p) ? p : cel > 0 ? suma / cel * 100 : 0));
    return (zeScena ? scenaHtml(adres) : "") + gora("Ulica", d.nazwa || "", adres ? ["Zobacz ulicę", adres] : null) + progUlicyHtml(d) +
      '<div class="dn-ul-km' + (koniec ? ' dn-ul-km--koniec' : '') + '"><b>' + esc(liczba(suma, suma > 0 && suma < 10 ? 1 : 0)) + "</b><span>" + (koniec ? "km razem · akcja zakończona" : "z " + esc(liczba(cel, 0)) + " km · " + esc(liczba(p, p < 10 ? 1 : 0)) + "%") + "</span></div>" +
      (koniec ? "" : '<div class="dn-pasek" role="progressbar" aria-label="Postęp ulicy" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(p) + '"><i style="width:' + p.toFixed(1) + '%"></i></div>') +
      '<p class="dn-tekst" data-dn="wklad">' + wkladTekst(wklad, koniec) + "</p>" +
      (dyplom ? '<div class="dn-ul-dyplom"><a class="dn-link" href="' + esc(dyplom) + '">Twój dyplom ›</a></div>' : "") + przyciskiUlicyHtml(d);
  }
  /* DYPLOM Z PASKA BIEGU (P1b, 27.11.2026, blizna-409). Pasek „🏅 Ukończone · Twój dyplom ›” (element bieg-pasek, js/akcja.mjs rysujPasekBiegu) stał pod
     nowym Dziś osobno, przyklejony na dole ekranu. Pod nowym Dziś wariant z dyplomem jest schowany (reguła CSS modułu), a kafel Ulica ma pod wkładem
     link „Twój dyplom ›”. Dane: to, co stary kod już narysował w pasku (licznik akcji z polem bieg i akcja_bieg_moi, o które pyta i tak, także pod
     nowym Dziś), więc zero nowych zapytań. Krzyżyk paska chowa ten wariant do końca dnia (czas polski, klucz bm_bieg_pasek_ukryty_<bieg>_dyplom):
     stary kod wtedy chowa pasek, więc link też znika do końca dnia. To samo znaczenie, ten sam klucz, moduł go nie czyta ani nie pisze.
     Pozostałe warianty paska (zapis, numer, dzieci) zostają paskiem jak dotąd. Adres tylko z listy paska (bieg.html, bieg.html?proba=1). */
  var DYPLOM_ADRESY = ["bieg.html", "bieg.html?proba=1"], pasekObs = null;
  function dyplomZPaska() {
    try {
      var el = d.getElementById("bieg-pasek");
      if (!el || el.hidden || el.getAttribute("data-wariant") !== "dyplom") return null;
      var a = el.querySelector ? el.querySelector("a") : null, h = a ? String(a.getAttribute("href") || "") : "";
      return DYPLOM_ADRESY.indexOf(h) >= 0 ? h : null;
    } catch (e) { return null; }
  }
  /** Pasek zmienił stan (z pamięci telefonu, z bazy, krzyżyk, 30 s bez potwierdzenia): widoczny kafel Ulicy rysuje się jeszcze raz, gdy zmienił się link. */
  function zmianaPaska() {
    try {
      var o = ulicaOst, el = kafel("ulica");
      if (!o || !el || el.hidden || !wlaczone() || ustepuje() || wstrzymane || dyplomZPaska() === o.dyplom) return;
      wpiszUlice(o.dn, o.wklad, o.adres, o.slug, o.zTel);
    } catch (e) {}
  }
  /** Obserwator paska: raz, gdy pasek już jest w stronie (przy starcie albo przy rysunku kafla Ulicy). Bez własnego czekania na wczytanie strony:
      start ma jedno takie czekanie (blizna-358), a kafel Ulicy rysuje się dopiero po odpowiedzi bazy, gdy pasek dawno stoi w stronie. */
  function pilnujPaska() {
    if (pasekObs || !w.MutationObserver) return;
    var el = d.getElementById("bieg-pasek"); if (!el) return;
    try { pasekObs = new w.MutationObserver(zmianaPaska); pasekObs.observe(el, { attributes: true, attributeFilter: ["hidden", "data-wariant"], childList: true }); } catch (e) { pasekObs = null; }
  }
  /* PLAKAT, ZBIÓRKA, PRÓG (E3 commit 3, 26.11.2026, blizna-401). Reguły ze starego kodu akcji (js/akcja.mjs), nie kopie: plakat tylko z białej listy
     hostów (plakatUrl → safeUrlAttr), zbiórka tylko https (linkZbiorki → safeExternalHref), próg tylko z pola prog licznika (baza oddaje je przez 48 h
     od przekroczenia kamienia). Plakat na pełnym ekranie i grafikę „Udostępnij” progu obsługuje stary kod (kliknięcia na document: data-plakat,
     data-prog-udostepnij); te elementy nie mają data-dn, więc moduł ich nie przejmuje. Konfetti progu raz na konto i telefon, kluczem starego kafla,
     tylko z danych z bazy (nie z pamięci telefonu). Bez starego kodu: kafel bez przycisków i bez progu. Zero zapytań. */
  function akcjaF(n) { var A = w.BM_AKCJA; return A && typeof A[n] === "function" ? A[n] : null; }
  function progUlicy(d) { var f = akcjaF("progPrzekroczony"); try { return f && akcjaF("tekstProgu") ? f(d) : null; } catch (e) { return null; } }
  function progUlicyHtml(d) {
    var p = progUlicy(d); if (!p) return "";
    return '<div class="dn-ul-prog" role="status"><b>' + esc(akcjaF("tekstProgu")(p, d)) + "</b><span>Razem, krok po kroku. Dziękujemy.</span>" +
      '<button type="button" class="dn-link" data-prog-udostepnij="' + esc(String(p)) + '">Udostępnij ›</button></div>';
  }
  function przyciskiUlicyHtml(d) {
    var fp = akcjaF("plakatUrl"), fz = akcjaF("linkZbiorki"), pl = "", zb = "";
    try { pl = fp ? fp(d) || "" : ""; zb = fz ? fz(d) || "" : ""; } catch (e) { return ""; }
    if (!pl && !zb) return "";
    return '<div class="dn-ul-przyciski">' +
      (pl ? '<a class="dn-drugi" href="' + esc(pl) + '" data-plakat="' + esc(pl) + '"' + (zb ? ' data-zbiorka="' + esc(zb) + '"' : "") + ' target="_blank" rel="noopener noreferrer">Plakat</a>' : "") +
      (zb ? '<a class="dn-drugi" href="' + esc(zb) + '" target="_blank" rel="noopener noreferrer">Zbiórka</a>' : "") + "</div>";
  }
  /* SCENA ULICY (E3 commit 1, 26.11.2026, blizna-397). Ta sama scena co w starym kaflu i na stronie akcji: BM_ULICA.naKaflu z js/ulica.mjs,
     który ładuje stary kod (BM_AKCJA.zUlica: najpierw sezon, potem ulica i scena). Dane: licznik, o który moduł już pyta; scena w trybie kafla
     sama o nic nie pyta (ranking gry i dźwięk tylko poza kaflem), więc budżet zostaje 6 / 7. Okno ma stałą wysokość od pierwszego rysunku (bez skoku).
     Ładowanie dopiero, gdy kafel jest blisko ekranu: sekcja Dziś schowana albo kafel daleko = nic się nie pobiera. Element sceny przeżywa ponowne
     rysowanie kafla (przenoszony do nowego okna), więc odświeżenie danych tylko przesuwa licznik. Okno pojawia się tylko, gdy stary kod może je
     wypełnić (albo strona jeszcze się czyta); stary kod nie doszedł albo scena nie wstała w 10 s = okno znika i kafel jest taki jak przed E3.
     MUR (E3 commit 2, blizna-400): cegły, które nie mieszczą się w rzędzie na scenie, scena stawia w kontenerze pod oknem (opcja murDol, ten sam
     mechanizm co stary kafel): pasek „Cały mur (N)”, po rozwinięciu kolejne rzędy i „Zwiń”; stan zwinięcia pamięta scena (bm_akcja_mur_dzis).
     Kontener bez data-dn (kliknięcia w mur nie są sprawami modułu), pusty = schowany; przy odświeżeniu przechodzi razem ze sceną. */
  var scenaUl = null, scenaMur = null, scenaDane = null, scenaStan = 0, scenaObs = null, scenaNiema = false;   // stan: 0 nic, 1 czeka na ekran, 2 ładowana albo stoi
  function scenaMozliwa() {
    if (scenaNiema) return false;
    try { return !!(w.BM_ULICA && w.BM_ULICA.naKaflu) || !!(w.BM_AKCJA && w.BM_AKCJA.zUlica) || d.readyState === "loading"; } catch (e) { return false; }
  }
  function scenaHtml(adres) {
    return '<div class="dn-ul-scena"><div class="dn-ul-tlo" data-dn="scena"></div>' + (adres ? '<a class="dn-ul-link" href="' + esc(adres) + '" tabindex="-1" aria-hidden="true"></a>' : "") + '</div><div class="dn-ul-mur"></div>';
  }
  /** Ulica z modułu sceny: gotowy, ładowany przez stary kod, albo po DOMContentLoaded (stary skrypt akcji stoi niżej w stronie). Brak = bez sceny. */
  function zUlicy(cb) {
    if (w.BM_ULICA && w.BM_ULICA.naKaflu) { cb(w.BM_ULICA); return; }
    if (w.BM_AKCJA && w.BM_AKCJA.zUlica) { w.BM_AKCJA.zUlica(cb); return; }
    if (d.readyState === "loading") { d.addEventListener("DOMContentLoaded", function () { zUlicy(cb); }); return; }
    bezSceny();
  }
  function usunScene() {
    if (scenaObs) { try { scenaObs.disconnect(); } catch (e) {} scenaObs = null; }
    if (scenaUl && w.BM_ULICA && w.BM_ULICA.usun) { try { w.BM_ULICA.usun(scenaUl); } catch (e) {} }
    scenaUl = null; scenaMur = null; scenaDane = null; scenaStan = 0;
  }
  function bezSceny() {
    scenaNiema = true; usunScene();
    var el = kafel("ulica"), o = el && el.querySelector ? el.querySelector(".dn-ul-scena") : null;
    if (o) o.hidden = true;
  }
  function montujScene() {
    var tu = scenaUl;
    if (!tu || !scenaDane) return;
    var pierwszy = !tu._bmScena && !tu._bmCzeka;
    zUlicy(function (U) { if (tu === scenaUl && scenaDane && U && U.naKaflu) U.naKaflu(tu, scenaDane, { murDol: scenaMur }); });
    if (pierwszy) w.setTimeout(function () { if (tu === scenaUl && !tu.firstChild) bezSceny(); }, 10000);
  }
  function czekajNaEkran(el) {
    if (scenaStan) return;
    scenaStan = 1;
    var start = function () { if (scenaObs) { try { scenaObs.disconnect(); } catch (e) {} scenaObs = null; } scenaStan = 2; montujScene(); };
    if (!w.IntersectionObserver || !el) { start(); return; }
    try {
      scenaObs = new w.IntersectionObserver(function (wpisy) { for (var i = 0; i < wpisy.length; i++) if (wpisy[i].isIntersecting) { start(); return; } }, { rootMargin: "300px 0px" });
      scenaObs.observe(el);
    } catch (e) { start(); }
  }
  /* STANY BRZEGOWE I BEZ SIECI (E3 commit 4, 26.11.2026, blizna-403). Zero zapytań.
     - Stan akcji z reguły starego kodu (BM_AKCJA.stanKarty, ta sama co dla starej karty): „trwa”; „zamknieta” przez 7 dni po końcu (suma razem,
       „akcja zakończona”, bez celu i paska); „brak” przed startem i później = kafel schowany. Bez starego kodu: po starcie „trwa”, jak dotąd.
     - Bez sieci kafel z pamięci telefonu (DzisOffline, część dzisNowe) dostaje scenę z zapamiętanego licznika, jeśli da się ją postawić bez sieci:
       moduł sceny już jest w stronie (sieć padła w trakcie: stojąca scena zostaje, nie jest rozbierana) albo jego skrypty leżą w pamięci Service
       Workera (sprawdzane raz na starcie, caches.match). Inaczej kafel bez okna, żeby puste okno nie zjechało po 10 s. Konfetti tylko z bazy.
     - Konto próby: stary kod (akcja-cytaty odswiezStan) scala licznik próby z danymi z osobnej funkcji (nazwa, imię, zbiórka, plakat, rysunek koparki)
       i zostawia go w window._akcjaStan. Kafel bierze go zamiast samego licznika próby; gdy stary kod skończy później, kafel rysuje się jeszcze raz.
       Do pamięci telefonu idzie licznik z bazy (bez podpisanych adresów z funkcji próby). */
  var scenaWPamieci = null, ulicaOst = null, owinietaAkcja = false;
  function stanAkcji(dn) {
    if (!dn || !dn.wystartowala) return "brak";
    var f = akcjaF("stanKarty");
    try { var s = f ? f(dn, Date.now()) : "trwa"; return s === "zamknieta" || s === "brak" ? s : "trwa"; } catch (e) { return "trwa"; }
  }
  function sprawdzScenePamiec() {
    if (scenaWPamieci !== null) return;
    scenaWPamieci = false;
    try { if (w.caches && typeof w.caches.match === "function") Promise.all([w.caches.match("js/ulica.mjs"), w.caches.match("js/ulica-scena.mjs")]).then(function (r) { scenaWPamieci = !!(r[0] && r[1]); }, function () {}); } catch (e) {}
  }
  function scenaBezSieci() { return !!(w.BM_ULICA && w.BM_ULICA.naKaflu) || scenaWPamieci === true; }
  function licznikProby(dn) { var s = w._akcjaStan; return s && typeof s === "object" && s.wystartowala ? s : dn; }
  function odswiezProbe() {
    var o = ulicaOst, s = w._akcjaStan;
    if (!o || o.slug !== "proba" || o.zTel || !s || typeof s !== "object" || !s.wystartowala || s === o.dn || !wlaczone() || ustepuje() || wstrzymane) return;
    if (stanAkcji(s) === "brak") return;
    wpiszUlice(s, o.wklad, o.adres, o.slug, false);
  }
  /** Kafel Ulicy: liczby, nad nimi scena (nowa albo ta sama, przeniesiona). zTel = z pamięci telefonu (bez konfetti, scena tylko bez sieci). */
  function wpiszUlice(dn, wklad, adres, slug, zTel) {
    var koniec = stanAkcji(dn) === "zamknieta", zeScena = scenaMozliwa() && (!zTel || scenaBezSieci()), dyplom = dyplomZPaska();
    pilnujPaska();
    ulicaOst = { dn: dn, wklad: wklad, adres: adres, slug: slug, zTel: !!zTel, koniec: koniec, dyplom: dyplom };
    wpisz("ulica", ulicaHtml(dn, wklad, adres, zeScena, koniec, dyplom));
    var prog = progUlicy(dn), konfetti = akcjaF("konfettiProgu");
    if (!zTel && prog && konfetti && slug) w.setTimeout(function () { try { konfetti(slug, prog); } catch (e) {} }, 0);
    if (!zeScena) { usunScene(); return; }
    var el = kafel("ulica"), miejsce = el && el.querySelector ? el.querySelector('[data-dn="scena"]') : null, mur = el && el.querySelector ? el.querySelector(".dn-ul-mur") : null;
    if (!miejsce) return;
    if (scenaUl && scenaUl !== miejsce) {
      try { miejsce.parentNode.replaceChild(scenaUl, miejsce); if (scenaMur && mur && scenaMur !== mur) mur.parentNode.replaceChild(scenaMur, mur); }
      catch (e) { usunScene(); scenaUl = miejsce; scenaMur = mur; }
    } else { scenaUl = miejsce; scenaMur = mur; }
    scenaDane = dn;
    if (scenaStan === 2) montujScene(); else czekajNaEkran(el);
  }
  /* SPOŁECZNOŚĆ (K2+K3, 27.11.2026, blizna-406 i blizna-407; plan dzis\spolecznosc\plan-spolecznosc.md, decyzje Filipa 27.11).
     Jedno zapytanie, rpc spolecznosc_dzis (migracja 20261228), i to dopiero wtedy, gdy kafel jest 400 px od ekranu: IntersectionObserver,
     a bez niego przewijanie. Obserwator podpina się dopiero, gdy skończą się wszystkie zapytania pierwszego ekranu (pytaj → koniec): na szkielecie
     kafle są niskie i Społeczność mieściła się w zasięgu, więc pytała od razu (pomiar na prawdziwej stronie 27.11). Pierwszy ekran zostaje 6/7. Odświeża się tylko z całym Dziś (każde wczytaj = dane nieaktualne, znowu jedno
     zapytanie, gdy kafel jest w zasięgu), bez własnego zegara. Funkcja oddaje same profile publiczne: pierwsze imię, miasto, rodzaj, km,
     czas, id profilu; wszystko przez esc, id tylko w kształcie UUID. Cudzych danych nie zapisujemy w pamięci telefonu: bez sieci kafla nie ma.
     Brak funkcji na bazie, błąd albo zły kształt odpowiedzi = kafel schowany i jeden wpis client_errors (etap „spolecznosc”), więc moduł
     i migrację można wdrożyć w dowolnej kolejności. Bez czasowników z rodzajem („Kasia · odznaka …”), bo płci w danych nie ma.
     S1 (blizna-414, decyzje Filipa 27.11): bez podpisu „profile publiczne” pod etykietą; kilometry jednym formatem: w wierszach biegów zawsze jedno
     miejsce po przecinku (4,0 · 10,2), suma w podsumowaniu bez miejsc (36 km); bez ikonki rodzaju przed imieniem (na telefonie wyglądała jak buźka),
     rodzaj zostaje słowem. */
  var spol = { nr: 0, chce: 0, sb: null, obs: null, przewijanie: false, czeka: 0, czekaSb: null }, AWATARY = ["#b0452f", "#3d5a99", "#2f6b3a", "#8a4fbf", "#9a6a00", "#1e7f8a"],
    RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function spolSzkielet() { return '<h2 class="dn-etykieta">Społeczność</h2><span class="dn-szkielet"></span><span class="dn-szkielet k"></span><span class="dn-ukryte">Wczytuję…</span>'; }
  /** Nowe dane Dziś: kafel czeka na ekran. Schowany po błędzie wraca jako szkielet, żeby następne wczytanie mogło spróbować jeszcze raz. */
  function spolUzbroj(sb, nr) {
    spol.sb = sb; spol.chce = nr;
    var el = kafel("spol"); if (!el) return;
    if (el.hidden) { el.innerHTML = spolSzkielet(); el.hidden = false; if (el.setAttribute) el.setAttribute("aria-busy", "true"); }
    if (w.IntersectionObserver) {
      try {
        if (!spol.obs) spol.obs = new w.IntersectionObserver(function (wpisy) { for (var i = 0; i < wpisy.length; i++) if (wpisy[i].isIntersecting) { spolLaduj(); return; } }, { rootMargin: "400px 0px" });
        if (spol.obs.unobserve) spol.obs.unobserve(el); spol.obs.observe(el);   // ponowne obserwowanie = świeże sprawdzenie, także gdy kafel już jest w zasięgu
        return;
      } catch (e) {}
    }
    if (!spol.przewijanie && w.addEventListener) {
      spol.przewijanie = true;
      w.addEventListener("scroll", function () { try { var k = kafel("spol"), r = k && k.getBoundingClientRect ? k.getBoundingClientRect() : null; if (r && r.top < (w.innerHeight || 800) + 400) spolLaduj(); } catch (e) {} }, { passive: true });
    }
  }
  function spolLaduj() {
    var nr = spol.chce, sb = spol.sb;
    if (!nr || spol.nr === nr || !sb || nr !== dane.nr) return;   // już wysłane dla tych danych albo dane się zmieniły
    if (dane.bezSieci || (w.navigator && w.navigator.onLine === false)) { schowaj("spol"); return; }
    spol.nr = nr;
    pytaj(sb.rpc("spolecznosc_dzis")).then(function (d) {
      if (nr !== dane.nr) return;
      if (!spolPoprawne(d)) { zglos("spolecznosc"); schowaj("spol"); return; }
      wpisz("spol", spolHtml(d));
    }, function (e) {
      if (nr !== dane.nr) return;
      if (przejete(sb, nr, e, false)) return;
      zglosDane("spolecznosc"); schowaj("spol");
    });
  }
  function spolPoprawne(d) { return !!d && typeof d === "object" && isFinite(Number(d.osob)) && Array.isArray(d.biegi) && (d.miasta == null || Array.isArray(d.miasta)); }
  function temu(iso, teraz) {
    var t = new Date(iso).getTime(), r = (teraz == null ? Date.now() : teraz) - t;
    if (!isFinite(t)) return "";
    if (r < 60000) return "przed chwilą";
    if (r < 3600000) return Math.floor(r / 60000) + " min temu";
    if (r < 86400000) return Math.floor(r / 3600000) + " h temu";
    var dni = Math.floor(r / 86400000); return dni === 1 ? "wczoraj" : dni + " dni temu";
  }
  /** Kolor kółka z id profilu (ten sam człowiek = ten sam kolor), inicjał z imienia. */
  function spolAwatar(id, imie) {
    var s = String(id || ""), h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    var znak = Array.from ? (Array.from(String(imie || "").trim())[0] || "?") : (String(imie || "?").charAt(0) || "?");
    return '<span class="dn-sp-av" style="background:' + AWATARY[h % AWATARY.length] + '" aria-hidden="true">' + esc(znak.toUpperCase()) + "</span>";
  }
  /** Nazwa odznaki z katalogów (K3): bieg wirtualny i akcja z js/odznaki-akcji.mjs, osobiste z BADGES w zawodnik.html. Nieznana = "" (nigdy surowy kod). */
  function nazwaOdznaki(id) {
    var s = String(id || ""), A = w.BM_ODZNAKI_AKCJI;
    try {
      if (A && /^bieg-/.test(s) && typeof A.biegDef === "function") { var b = A.biegDef(s); if (b && b.name) return String(b.name); }
      if (A && /^akcja-/.test(s) && typeof A.nazwa === "function") { var n = A.nazwa(s); if (n) return String(n); }
      var K = w.BADGES || (typeof BADGES !== "undefined" ? BADGES : null);
      if (K && K.length) for (var i = 0; i < K.length; i++) if (K[i] && K[i].id === s && K[i].name) return String(K[i].name);
    } catch (e) {}
    return "";
  }
  function spolHtml(d, teraz) {
    var osob = Math.max(0, Math.floor(Number(d.osob) || 0)), suma = Math.max(0, Number(d.km) || 0), wiersze = [];
    var miasta = (Array.isArray(d.miasta) ? d.miasta : []).filter(function (m) { return typeof m === "string" && m.trim(); }).slice(0, 3);
    var biegi = (Array.isArray(d.biegi) ? d.biegi : []).filter(function (b) { return b && RE_UUID.test(String(b.id)); }).slice(0, 2);
    var z = d.odznaka && RE_UUID.test(String(d.odznaka.id)) ? d.odznaka : null;
    if (osob > 0) wiersze.push('<li><div class="dn-sp-w"><span class="dn-sp-av dn-sp-licz" aria-hidden="true">' + osob + '</span><span class="dn-sp-t"><b>' + osob + " " +
      odmiana(osob, "osoba biegała", "osoby biegały", "osób biegało") + (d.od_polnocy === true ? " dziś" : " w ostatniej dobie") + "</b>, razem " + esc(liczba(Math.round(suma), 0)) + " km" +
      (miasta.length ? "<small>" + esc(miasta.join(", ")) + "</small>" : "") + "</span></div></li>");
    biegi.forEach(function (b) {
      var rodzaj = String(b.rodzaj || "Bieg"), ile = kmSpol(b.km), gdzie = [typeof b.miasto === "string" ? b.miasto : "", temu(b.kiedy, teraz)].filter(Boolean).join(" · ");
      wiersze.push('<li><button type="button" class="dn-sp-w" data-dn="sp-profil" data-id="' + esc(b.id) + '">' + spolAwatar(b.id, b.imie) + '<span class="dn-sp-t">' +
        "<b>" + esc(b.imie || "Zawodnik") + "</b> · " + esc(rodzaj.toLowerCase()) + (ile ? " " + esc(ile) + " km" : "") + (gdzie ? "<small>" + esc(gdzie) + "</small>" : "") + "</span></button></li>");
    });
    if (z) {
      var nazwa = nazwaOdznaki(z.odznaka);
      wiersze.push('<li><button type="button" class="dn-sp-w" data-dn="sp-profil" data-id="' + esc(z.id) + '"><span class="dn-sp-av dn-sp-medal" aria-hidden="true">' + ikonaSvg("medal") + '</span><span class="dn-sp-t"><b>' +
        esc(z.imie || "Zawodnik") + "</b> · " + (nazwa ? "odznaka „" + esc(nazwa) + "”" : "nowa odznaka") + "<small>" + esc(temu(z.kiedy, teraz)) + "</small></span></button></li>");
    }
    return '<div class="dn-gora"><div><h2 class="dn-etykieta">Społeczność</h2></div><button type="button" class="dn-link" data-sekcja="social">Wszystko ›</button></div>' +
      (osob > 0 || biegi.length ? "" : '<p class="dn-tekst dn-sp-pusto">Jeszcze nikt publiczny nie biegał w tej dobie. <button type="button" class="dn-link" data-sekcja="social">Zobacz Społeczność ›</button></p>') +
      (wiersze.length ? '<ul class="dn-sp">' + wiersze.join("") + "</ul>" : "");
  }
  /** Przycisk wyniku: główny „Zaloguj wynik”, gdy na dziś jest niezrobiony plan; w dzień wolny, bez planu i po zrobionym planie mniejszy „Dodaj trening”.
      Stare Dziś pokazuje „Zaloguj wynik” zawsze; oba otwierają ten sam formularz. */
  function zalogujHtml(czekaPlan) {
    return czekaPlan ? '<button type="button" class="dn-glowny" data-dn="zaloguj">Zaloguj wynik</button>' : '<button type="button" class="dn-drugi" data-dn="zaloguj">Dodaj trening</button>';
  }
  /** „dziś 3–8 °C, deszcz” z dnia o DZISIEJSZEJ dacie (lokalnej) w danych starego kafla pogody; inaczej "". Opis słowny przychodzi z funkcji pogody (label). */
  function pogodaTekst(teraz) {
    try {
      var c = w._weatherCache, dni = c && Array.isArray(c.days) ? c.days : [], klucz = kluczDnia(teraz), dz = null;
      for (var i = 0; i < dni.length; i++) if (dni[i] && dni[i].date === klucz) { dz = dni[i]; break; }
      if (!dz || typeof dz.temp_min !== "number" || typeof dz.temp_max !== "number" || !isFinite(dz.temp_min) || !isFinite(dz.temp_max)) return "";
      var lo = Math.min(dz.temp_min, dz.temp_max), hi = Math.max(dz.temp_min, dz.temp_max), st = function (x) { return (x < 0 ? "−" : "") + Math.abs(Math.round(x)); };
      var temp = lo === hi ? st(lo) + " °C" : lo < 0 ? "od " + st(lo) + " do " + st(hi) + " °C" : st(lo) + "–" + st(hi) + " °C";
      var opis = typeof dz.label === "string" ? dz.label.trim().toLowerCase() : "";
      return "dziś " + temp + (opis && opis !== "pogoda" && opis.length <= 40 ? ", " + opis : "");
    } catch (e) { return ""; }
  }
  /** Pogoda w OSOBNYM wierszu pod nagłówkiem kafla, na całą jego szerokość (audyt A2, blizna-382). W jednej linii ze źródłem planu („od trenera · dziś 3–8 °C,
      częściowe zachmurzenie”) łamała się w pół zdania, bo obok stoi link „Plan ›”. Tekst bez zmian. Gdy mimo to brakuje miejsca, łamie się po przecinku:
      temperatura w pierwszym wierszu, opis w drugim (decyzja Filipa 26.11), bez wielokropka. */
  function pogodaHtml(pogoda) {
    pogoda = String(pogoda || ""); if (!pogoda) return "";
    var i = pogoda.indexOf(", ");
    return '<p class="dn-pog">' + (i < 0 ? "<span>" + esc(pogoda) + "</span>" : "<span>" + esc(pogoda.slice(0, i + 1)) + "</span> <span>" + esc(pogoda.slice(i + 2)) + "</span>") + "</p>";
  }
  /* Typografia kafla treningu (audyt A1, blizna-389): cel treningu („8 km · 4:30 /km”) to najważniejsza liczba dnia, a stał zwykłym tekstem 15 px
     obok licznika Ulicy 40 px. Teraz cel fontem liczb 28 px, pigułka rodzaju NAD nim; licznik Ulicy 32 px. Długi cel łamie się tylko MIĘDZY członami
     („16,4 km ·” / „95 min ·” / „5:37 /km”): każdy człon to osobny, niełamliwy kawałek, a kropka zostaje przy członie przed nią. */
  function celHtml(cel) { return '<span class="dn-cel">' + cel.map(function (c, i) { return "<span>" + esc(c) + (i < cel.length - 1 ? " ·" : "") + "</span>"; }).join(" ") + "</span>"; }
  /** Kafel Trening na dziś. lista = wiersze trainings z dzisiejszą datą; pogoda = gotowa linia albo ""; stan = wynik stanBezPlanu() (liczy się tylko przy pustej liście). */
  function treningHtml(lista, pogoda, stan) {
    lista = lista || [];
    if (!lista.length) return gora("Trening na dziś", stan === "wolne" ? "z generatora" : "", ["Plan", PLAN]) + pogodaHtml(pogoda) + bezPlanuHtml(stan);   // „bez planu” pod etykietą powtarzało nagłówek „Dziś bez planu” (P1a, blizna-408)
    var kto = lista[0].plan_source === "generator" ? "z generatora" : lista[0].coach_id ? "od trenera" : "";
    return gora("Trening na dziś", kto, ["Plan", PLAN]) + pogodaHtml(pogoda) + lista.map(function (t) {
      if (WOLNE.indexOf(String(t.type || "").trim()) >= 0) return '<h3 class="dn-tytul">Dzień wolny</h3><p class="dn-tekst">' + esc(t.description || "Odpoczynek też buduje formę.") + "</p>";
      var cel = [], opis = String(t.description || "");
      if (Number(t.distance_km) > 0) cel.push(km(t.distance_km) + " km");
      if (Number(t.duration_min) > 0) cel.push(liczba(t.duration_min) + " min");
      if (tempo(t.pace) !== "—") cel.push(tempo(t.pace) + " /km");
      return '<div class="dn-plan"><div class="dn-plan-g">' + pigulka(t.type) + (t.status === "done" ? '<span class="dn-zrobione">zrobione</span>' : "") + "</div>" + (cel.length ? celHtml(cel) : "") + "</div>" +
        (opis ? '<p class="dn-tekst">' + esc(opis.length > 160 ? opis.slice(0, 157) + "…" : opis) + "</p>" : "");
    }).join("") + zalogujHtml(lista.some(function (t) { return WOLNE.indexOf(String(t.type || "").trim()) < 0 && t.status !== "done"; }));
  }
  /* Odczucie w bazie to KOD (training_logs_feel_dozwolone: bad, mid, good, great), nie słowo. Słownik ten sam co w reszcie aplikacji
     (FEEL_ETYKIETY z sb.js); własna kopia na wypadek, gdyby tamtego jeszcze nie było. Nieznany kod = „—”, nigdy surowy tekst z bazy. */
  var ODCZUCIA = { bad: "Ciężko", mid: "Przeciętnie", good: "Dobrze", great: "Świetnie" };
  function odczucie(kod) {
    var k = String(kod || ""), s = w.FEEL_ETYKIETY;
    if (!Object.prototype.hasOwnProperty.call(ODCZUCIA, k)) return "";
    return s && typeof s[k] === "string" && s[k] ? s[k] : ODCZUCIA[k];
  }
  function liczbyWpisu(l) {
    var slowo = odczucie(l.feel);
    var czwarta = Number(l.heart_rate) > 0 ? [liczba(l.heart_rate), "bpm", "tętno śr."] : Number(l.elevation_gain) > 0 ? [liczba(l.elevation_gain), "m", "w górę"] : [slowo || "—", "", "odczucie", !!slowo];
    return [[km(l.distance_km), "km", "dystans"], [czas(l.duration), "", "czas"], [tempo(l.pace), "/km", "tempo"], czwarta];
  }
  /* KARTA DNIA (P1d, 27.11.2026, blizna-411). Karta treningu do udostępnienia już istnieje: SHARECARD w sb.js (przycisk „Zobacz kartę” w oknie
     edycji wpisu i w kalendarzu). Render robi funkcja share-card w bazie (obraz w Storage, ten sam dla tego samego wpisu i tła); na karcie: imię,
     zdjęcie profilu, data (godzina tylko z zegarka), dystans, rodzaj treningu, czas i tempo, przewyższenie, kalorie, tętno TYLKO gdy zawodnik
     wybrał „tętno publiczne” (hr_public). Bez komentarza i bez odczucia. Dwa wejścia z nowego Dziś, oba otwierają tę samą kartę przez
     SHARECARD.otworz (bez kopii jej kodu): „Karta dnia ›” w kaflu „Ostatni trening” (tylko trening z dziś albo z wczoraj) i „Zrób kartę dnia ›”
     pod zdaniem po zapisie „Jak poszło?”. Pierwszy ekran: zero zapytań; karta pobiera dopiero po dotknięciu (funkcja share-card, potem obraz).
     Bez sieci linku nie ma (karty nie da się zrobić). Brak SHARECARD na wczytanej stronie albo błąd przy otwarciu = wpis client_errors „karta-dnia”. */
  function przyciskKarty(id, napis) { return '<button type="button" class="dn-link" data-dn="karta" data-log="' + esc(id) + '">' + esc(napis) + " ›</button>"; }
  function kartaJest() {
    var S = w.SHARECARD;
    if (S && typeof S.otworz === "function") return true;
    if (d.readyState !== "loading") zglosDane("karta-dnia");   // strona wczytana, a karty nie ma: błąd aplikacji (przed końcem wczytywania sb.js może jeszcze iść)
    return false;
  }
  /** Czy przy tym wpisie pokazać link do karty. zDniem: tylko trening z dziś albo z wczoraj (kafel „Ostatni trening”). */
  function kartaWpisu(l, zDniem) {
    if (!l || !l.id || l.distance_km == null || dane.wpisyZTelefonu || brakSieci()) return false;
    if (zDniem) { var n = dniTemu(l.logged_at); if (n !== 0 && n !== 1) return false; }
    return kartaJest();
  }
  function kartaKlik(id) {
    var l = null, S = w.SHARECARD;
    for (var i = 0; i < (dane.wpisy || []).length; i++) if (dane.wpisy[i] && dane.wpisy[i].id === id) { l = dane.wpisy[i]; break; }
    if (!l) return;
    if (!S || typeof S.otworz !== "function") { zglosDane("karta-dnia"); return; }
    try { Promise.resolve(S.otworz(l, { mozeEdytowac: true })).then(function (ok) { if (ok === false) zglosDane("karta-dnia"); }, function () { zglosDane("karta-dnia"); }); }
    catch (e) { zglosDane("karta-dnia"); }
  }
  /** Kafel Ostatni trening: najnowszy wpis, z regułą 14 dni w podpisie. zKarta: link „Karta dnia ›” w prawym górnym rogu (kartaWpisu). */
  function ostatniHtml(log, teraz, zKarta) {
    if (!log) return gora("Ostatni trening", "", null) + '<h3 class="dn-tytul">Jeszcze pusto</h3><p class="dn-tekst">Tu pojawi się dystans, czas i tempo pierwszego treningu.</p>';
    var kd = kiedy(log.logged_at, teraz);
    return gora("Ostatni trening", String(log.training_type || "Trening") + (kd ? " · " + kd : ""), null, zKarta ? przyciskKarty(log.id, "Karta dnia") : "") +
      '<div class="dn-liczby">' + liczbyWpisu(log).map(function (x) { return '<div class="dn-l"><b' + (x[3] ? ' class="dn-slowo"' : "") + ">" + esc(x[0]) + (x[1] && x[0] !== "—" ? "<small>" + esc(x[1]) + "</small>" : "") + "</b><span>" + esc(x[2]) + "</span></div>"; }).join("") + "</div>";
  }
  /** Kafel Twoje ostatnie treningi: wpisy od przedostatniego (najnowszy stoi w kaflu wyżej). */
  function listaHtml(wpisy) {
    return gora("Twoje ostatnie treningi", "", null) + '<ul class="dn-wiersze">' + (wpisy || []).map(function (l) {
      var ile = [km(l.distance_km) !== "—" ? "<b>" + esc(km(l.distance_km)) + " km</b>" : "", czas(l.duration) !== "—" ? esc(czas(l.duration)) : "", tempo(l.pace) !== "—" ? esc(tempo(l.pace)) + " /km" : ""].filter(Boolean);
      return '<li class="dn-wiersz"><span class="dn-w-co">' + esc(l.training_type || "Trening") + "<small>" + esc(dzienKrotko(l.logged_at)) + '</small></span><span class="dn-w-ile">' + (ile.join(" · ") || "—") + "</span></li>";
    }).join("") + "</ul>";
  }

  /* ── „JAK POSZŁO?” ──────────────────────────────────────────────────────────────────────────────────────── */
  function pominiety(id) { try { return !!w.localStorage.getItem("fr_skip_" + id); } catch (e) { return false; } }
  /** Wpis, o który pytamy: najnowszy z zegarka (intervals), z ostatnich 48 h, bez odczucia. Warunki starej karty FEEL-REPORT, łącznie z „Pomiń”:
      stara karta bierze JEDEN najnowszy taki wpis i gdy jest pominięty, milczy; nie przechodzi na starszy (decyzja Filipa 25.11, blizna-370). */
  function kandydatOdczucia(wpisy, teraz) {
    var t = teraz == null ? Date.now() : teraz;
    for (var i = 0; i < (wpisy || []).length; i++) {
      var l = wpisy[i], kiedyMs = l ? new Date(l.logged_at).getTime() : NaN;
      if (!l || !l.id || l.external_source !== "intervals" || l.feel != null) continue;
      if (!(t - kiedyMs <= OKNO_ODCZUCIA_MS)) continue;
      return pominiety(l.id) ? null : l;
    }
    return null;
  }
  function minaSvg(kod) { try { return typeof w.feelSvg === "function" ? String(w.feelSvg(kod, 22) || "") : ""; } catch (e) { return ""; } }
  /** „Spokojny · wczoraj · 10,01 km”: nazwa wpisu, o który pytamy; ta sama w bloku i w pasku na górze. */
  function jpOpis(l, teraz) { var kd = kiedy(l.logged_at, teraz); return String(l.training_type || "Trening") + (kd ? " · " + kd : "") + (km(l.distance_km) !== "—" ? " · " + km(l.distance_km) + " km" : ""); }
  /** Blok pod liczbami kafla. osobny = pytamy o inny wpis niż ten w kaflu, więc trzeba go nazwać. */
  function jakPoszloHtml(l, osobny, teraz, wybrana, tekst) {
    var opis = jpOpis(l, teraz), kom = String(l.comment || ""), doklej = dokleja(l), t = typeof tekst === "string" ? tekst : doklej ? "" : kom;
    return '<div class="dn-jp" data-dn="jp"><div class="dn-jp-t">Jak poszło?<small>zegarek tego nie wie</small></div>' +
      (osobny ? '<div class="dn-jp-kt">' + esc(opis) + "</div>" : "") +
      '<div class="dn-miny">' + MINY.map(function (k) { return '<button type="button" class="dn-mina" data-dn="jp-mina" data-kod="' + k + '" aria-pressed="' + (k === wybrana ? "true" : "false") + '">' + minaSvg(k) + "<span>" + esc(odczucie(k)) + "</span></button>"; }).join("") + "</div>" +
      '<div class="dn-jp-pole" data-dn="jp-pole"' + (wybrana ? "" : " hidden") + ">" + (doklej ? '<p class="dn-jp-zeg">Z zegarka: ' + esc(kom) + "</p>" : "") + '<textarea data-dn="jp-notatka" rows="3" maxlength="' + LIMIT_NOTATKI + '" aria-label="Jak się czułeś? Notatka do treningu, opcjonalnie" placeholder="Jak się czułeś? Co cieszyło, co bolało… (opcjonalnie)">' + esc(t) + "</textarea>" +
      licznikHtml(t.length) + "</div>" +
      '<div class="dn-jp-akcje"><button type="button" class="' + (wybrana ? "dn-jp-zapisz dn-pelny" : "dn-jp-zapisz") + '" data-dn="jp-zapisz">Zapisz raport</button><button type="button" class="dn-jp-pomin" data-dn="jp-pomin">Pomiń</button></div>' +
      '<p class="dn-jp-kom" data-dn="jp-kom" role="status" hidden></p></div>';
  }
  /** Zdanie po zapisie: brzmienie ze starej karty co do słowa (decyzja Filipa 19.08.2026). zTrenerem = profil ma coach_id. */
  function podpisPoZapisie(kod, zTrenerem) {
    if (zTrenerem) return "Trener to zobaczy, a forma policzy się dokładniej.";
    return kod === "bad" ? "Zwolnij i przyjrzyj się regeneracji — a jeśli zmęczenie nie mija, to sygnał, żeby poszukać wsparcia trenera." : "Forma policzy się dokładniej.";
  }
  /** Wpis z zegarka z komentarzem: komentarz zostaje (podpis nad polem), nowy tekst się dokleja. */
  function dokleja(l) { return !!l && !!String(l.external_source || "").trim() && !!String(l.comment || "").trim(); }
  /** Pole comment do zapisu: null = nie wysyłamy (pusty albo bez zmian), false = nowy tekst ponad limit, napis = nowa wartość. */
  function komentarzDoZapisu(stary, tekst, doklej) {
    var t = String(tekst == null ? "" : tekst).trim(), s = String(stary == null ? "" : stary);
    if (!t) return null;
    if (!doklej && t === s.trim()) return null;
    if (t.length > LIMIT_NOTATKI) return false;   // przy doklejaniu limit liczy tylko nowy tekst
    return doklej ? s + "\n" + t : t;
  }
  function licznikHtml(n) { return '<span class="dn-jp-licznik' + (n > LIMIT_NOTATKI ? " dn-za-duzo" : "") + '" data-dn="jp-licznik" aria-live="polite"' + (n >= PROG_LICZNIKA ? "" : " hidden") + ">" + n + "/" + LIMIT_NOTATKI + "</span>"; }
  function jpLicznik(n) { var el = jpCzesc("jp-licznik"); if (!el) return; el.textContent = n + "/" + LIMIT_NOTATKI; el.hidden = n < PROG_LICZNIKA; el.className = "dn-jp-licznik" + (n > LIMIT_NOTATKI ? " dn-za-duzo" : ""); }
  /** Szkic odpowiedzi (mina i tekst) w pamięci telefonu: bez sieci zapis się nie uda, a przerysowanie albo zamknięcie aplikacji nie może go zgubić. */
  function czytajSzkic(id) { try { var o = JSON.parse(w.localStorage.getItem("dn_jp_szkic_" + id) || "null"); return o && typeof o === "object" ? { k: MINY.indexOf(o.k) >= 0 ? o.k : null, t: typeof o.t === "string" ? o.t.slice(0, 5000) : null } : null; } catch (e) { return null; } }
  function zapiszSzkic() { if (!jp || jp.zapisane) return; var pole = jpCzesc("jp-notatka"); try { w.localStorage.setItem("dn_jp_szkic_" + jp.id, JSON.stringify({ k: jp.kod, t: pole ? String(pole.value || "") : null })); } catch (e) {} }
  function usunSzkic(id) { try { w.localStorage.removeItem("dn_jp_szkic_" + id); } catch (e) {} }
  /** Wpisywanie w pole odczuć: licznik od 400 znaków i szkic. */
  function wpisywanie(e) {
    var t = e && e.target && e.target.closest ? e.target.closest("[data-dn]") : null;
    if (!t || t.getAttribute("data-dn") !== "jp-notatka" || !jp) return;
    jpLicznik(String(t.value || "").length); zapiszSzkic();
  }
  function jpCzesc(n) { var el = kafel("ostatni"); return el && el.querySelector ? el.querySelector('[data-dn="' + n + '"]') : null; }
  function jpKomunikat(tekst) { var el = jpCzesc("jp-kom"); if (el) { el.textContent = tekst || ""; el.hidden = !tekst; } }
  function jpBrudny() { return !!jp && (!!jp.kod || jp.zapisuje); }   // pole odczuć jest dopiero po wyborze miny, więc mina wystarcza
  /** Kafle „Ostatni trening” i lista z dane.wpisy. Gdy ktoś właśnie wybiera minę albo pisze notatkę do tego samego wpisu, kafla nie przerysowujemy. */
  function rysujWpisy(sb) {
    var l = dane.wpisy || [], kand = dane.wpisyZTelefonu ? null : kandydatOdczucia(l);   // wpisy z telefonu = bez sieci: nie pytamy, bo odczucia nie dałoby się zapisać
    if (l.length > 1) wpisz("lista", listaHtml(l.slice(1))); else schowaj("lista");
    /* rozpoczęta odpowiedź zostaje także, gdy dane przyszły z pamięci telefonu (wtedy kandydata nie ma, bo bez sieci nie pytamy): do 26.11 mina i notatka
       ginęły przy pierwszym przerysowaniu bez sieci (powrót do aplikacji, ↺ zegarka) */
    if (jp && jpBrudny() && (kand ? kand.id === jp.id : dane.wpisyZTelefonu)) return;
    var szkic = kand ? czytajSzkic(kand.id) : null;
    jp = kand ? { id: kand.id, kod: szkic ? szkic.k : null, zapisuje: false, zapisane: false, opis: jpOpis(kand), komentarz: String(kand.comment || ""), doklej: dokleja(kand), sb: sb || (jp && jp.sb) || null } : null;
    wpisz("ostatni", ostatniHtml(l[0] || null, undefined, kartaWpisu(l[0], true)) + (kand ? jakPoszloHtml(kand, kand !== l[0], undefined, jp.kod, szkic && szkic.t !== null ? szkic.t : undefined) : ""));
    zdarzenie();   // zachęta w pasku pojawia się i znika razem z blokiem, w tym samym kroku co kafel
  }
  /* Kolor (audyt A3, blizna-392): pomarańczowy był wszędzie, więc niczego nie wyróżniał. Etykiety kafli („Trening na dziś”, „Ulica”, „Jak poszło?”)
     są szare (#8f8c97); pomarańcz zostaje dla linków i przycisków. „Zapisz raport” jest pełny dopiero po wyborze miny: wcześniej to przycisk
     w obrysie (dalej wygląda na przycisk i dalej reaguje: dotknięty bez miny mówi, czego brakuje), bo pełny pomarańczowy przycisk, którego
     jeszcze nie da się użyć, był najgłośniejszą rzeczą w kaflu. */
  function jpWybierz(kod) {
    if (!jp || jp.zapisuje || MINY.indexOf(kod) < 0) return;
    jp.kod = kod; jpKomunikat("");
    var el = kafel("ostatni"), miny = el && el.querySelectorAll ? el.querySelectorAll('[data-dn="jp-mina"]') : [];
    for (var i = 0; i < miny.length; i++) miny[i].setAttribute("aria-pressed", miny[i].getAttribute("data-kod") === kod ? "true" : "false");
    var guzik = jpCzesc("jp-zapisz"); if (guzik) guzik.className = "dn-jp-zapisz dn-pelny";
    var pole = jpCzesc("jp-pole"); if (pole) pole.hidden = false;
    zapiszSzkic();
  }
  function jpPomin() {
    if (!jp || jp.zapisuje) return;
    try { w.localStorage.setItem("fr_skip_" + jp.id, "1"); } catch (e) {}
    usunSzkic(jp.id);
    var sb = jp.sb; jp = null; rysujWpisy(sb);
  }
  /** Jedyny zapis do bazy w module. proba = ponowienie po odświeżeniu sesji (drugiego nie będzie). */
  function jpZapisz(proba) {
    if (!jp || (jp.zapisuje && !proba)) return;
    if (!jp.kod) { jpKomunikat("Wybierz, jak poszło."); return; }
    var stan = jp, sb = stan.sb || klient(), pole = jpCzesc("jp-notatka"), notatka = pole ? String(pole.value || "").trim() : "", guzik = jpCzesc("jp-zapisz");
    if (!sb) { jpKomunikat("Nie udało się zapisać. Spróbuj ponownie."); return; }
    var zmiana = { feel: stan.kod }, kom = komentarzDoZapisu(stan.komentarz, notatka, stan.doklej);   // null = pola comment nie wysyłamy (nie kasujemy, nie ruszamy)
    if (kom === false) { jpKomunikat("Notatka może mieć najwyżej " + LIMIT_NOTATKI + " znaków. Skróć ją."); return; }
    if (kom) zmiana.comment = kom;
    stan.zapisuje = true; jpKomunikat(""); if (guzik) guzik.disabled = true;
    pytaj(sb.from("training_logs").update(zmiana).eq("id", stan.id).select("id")).then(function (wiersze) {
      if (jp !== stan) return;
      if (!wiersze || wiersze.length !== 1) throw { autoryzacja: false };   // 200 z pustą tablicą = RLS nie przepuściło: to nie jest sukces
      for (var i = 0; i < dane.wpisy.length; i++) if (dane.wpisy[i] && dane.wpisy[i].id === stan.id) { dane.wpisy[i].feel = stan.kod; if (zmiana.comment) dane.wpisy[i].comment = zmiana.comment; }
      var blok = jpCzesc("jp");
      stan.zapisane = true; usunSzkic(stan.id); zdarzenie();
      var wpis = null; for (var j = 0; j < dane.wpisy.length; j++) if (dane.wpisy[j] && dane.wpisy[j].id === stan.id) wpis = dane.wpisy[j];
      var zKarta = kartaWpisu(wpis, false);   // „Zrób kartę dnia ›” do tego samego treningu (P1d)
      if (blok) { blok.className = "dn-jp-ok"; blok.innerHTML = "<b>Zapisane — dzięki!</b><p>" + esc(podpisPoZapisie(stan.kod, dane.trener === true)) + "</p>" + (zKarta ? '<p class="dn-jp-karta">' + przyciskKarty(stan.id, "Zrób kartę dnia") + "</p>" : ""); }
      if (!zKarta) w.setTimeout(function () { if (jp === stan) { jp = null; rysujWpisy(sb); } }, PODZIEKOWANIE_MS);   // z linkiem podziękowanie zostaje do następnego odświeżenia: 2,6 s nie wystarczy, żeby go dotknąć
    }).then(null, function (e) {
      if (jp !== stan) return;
      if (e && e.autoryzacja && !proba) { odswiezSesje(sb).then(function () { if (jp === stan) jpZapisz(true); }); return; }
      stan.zapisuje = false; if (guzik) guzik.disabled = false;
      jpKomunikat("Nie udało się zapisać. Spróbuj ponownie."); zglosDane("odczucie");
    });
  }

  function kafel(n) { var k = korzen(); return k && k.querySelector ? k.querySelector('[data-kafel="' + n + '"]') : null; }
  function wpisz(n, html) { var el = kafel(n); if (!el) return; el.innerHTML = html; el.hidden = false; if (el.removeAttribute) el.removeAttribute("aria-busy"); }
  function schowaj(n) { var el = kafel(n); if (el) { el.hidden = true; if (el.removeAttribute) el.removeAttribute("aria-busy"); } }
  function bladKafla(n, etykieta) { wpisz(n, gora(etykieta, "", null) + '<p class="dn-tekst">Nie udało się wczytać.</p><button type="button" class="dn-ponow" data-dn="ponow">Spróbuj ponownie</button>'); }
  /** Błąd danych: przy braku sieci telefon o tym wie i wpis do client_errors nic by nie dał. */
  function zglosDane(etap) { if (w.navigator && w.navigator.onLine === false) return; zglos(etap); }
  /* ── PAMIĘĆ BEZ SIECI: zapis części „dzisNowe” w migawce starego Dziś ── */
  var mig = null, migCzeka = false;
  function pamiec() { var o = w.DzisOffline; return o && typeof o.zapisz === "function" && typeof o.odczytaj === "function" ? o : null; }
  /** Jedno pole migawki (profil, ulica, trening, wiadomosc, wpisy). Kilka pól z jednej fali idzie jednym zapisem. Nigdy nie rzuca. */
  function zapamietaj(nr, pole, wartosc) {
    if (nr !== dane.nr || !dane.uid) return;
    try {
      if (!mig || mig.uid !== dane.uid) {   // pierwsze pole po wejściu: zaczynamy od tego, co już jest w telefonie, żeby nie zgubić pól, których ta próba nie doczyta
        mig = { uid: dane.uid, pola: { czas: {} } };
        var o = pamiec(), m = o ? o.odczytaj(dane.uid) : null, st = m && m.czesci ? m.czesci.dzisNowe : null;
        if (st && typeof st === "object") ["profil", "ulica", "trening", "wiadomosc", "wpisy", "tydzien"].forEach(function (k) { if (k in st) { mig.pola[k] = st[k]; mig.pola.czas[k] = (st.czas && st.czas[k]) || st.ts || 0; } });
      }
      mig.pola[pole] = wartosc; mig.pola.czas[pole] = Date.now();
    } catch (e) { return; }
    if (migCzeka) return;
    migCzeka = true;
    Promise.resolve().then(function () {
      migCzeka = false;
      try { var o = pamiec(); if (!o || !mig) return; mig.pola.ts = Date.now(); o.zapisz(mig.uid, "dzisNowe", mig.pola); pasekOffline(); } catch (e) {}
    });
  }
  /* ── KADR DNIA: wybór (blizna-384) ──
     Lista kadrów jest wpisana tutaj, bo moduł rysuje szkielet, zanim strona wczyta cokolwiek innego, a adres kadru musi być znany już wtedy.
     Ta sama lista leży w assets/ui/dzis/kadry/kadry.json (źródło dla ludzi i dla testu zgodności): [id, pora roku, pogoda albo null, pora dnia, kolor tła],
     opcjonalnie szósty element: nazwa szerokiej panoramy do tła na komputerze (pole „szeroki”, P1c, blizna-410).
     Reguły, w tej kolejności (decyzje Filipa 25.11; bez rodzaju treningu):
       1. pora roku z daty, twardo; dopóki pora roku nie ma własnych kadrów, bierze zimowe (z zimową granicą zmroku);
       2. pora dnia: po zmroku tylko kadry „zmrok”, w dzień tylko dzienne; granica stała dla pory roku, bez liczenia wschodów;
       3. pogoda: śnieg albo deszcz wybiera kadr z tą cechą; bez danych pogody (albo bez takiego kadru) tylko kadry bez cechy pogodowej;
       4. anty-powtórka: nie ten sam co wczoraj i przedwczoraj; gdy nic nie zostaje, odpada anty-powtórka, nigdy pogoda ani pora roku;
       5. wynik stały w ciągu dnia dla danej pory dnia (pamięć telefonu, klucz dn_kadr); bez pamięci (tryb prywatny) wybór i tak zależy tylko od daty.
     Pogoda: z pamięci karty, te same wpisy „weather:” co stare Dziś (tylko odczyt), i te same kody śniegu i deszczu co stary dobór kadru. */
  var KADRY = [["zima-sciezka", "zima", null, "dzien", "#4c443c"], ["zima-stadion", "zima", null, "dzien", "#423a3a"], ["zima-bulwar", "zima", null, "dzien", "#343a3f"], ["zima-park", "zima", "snieg", "dzien", "#37404a"],
    ["zima-dwoje", "zima", "snieg", "zmrok", "#323a43"], ["zima-deszcz", "zima", "deszcz", "dzien", "#373c42"], ["zima-latarnie", "zima", null, "zmrok", "#2d2a25"]];
  var KADR_PAMIEC = 8, ZMROK = { zima: [16, 7], wiosna: [19, 6], lato: [21, 5], jesien: [18, 6] };
  function poraRoku(t) { var m = t.getMonth(); return m === 11 || m <= 1 ? "zima" : m <= 4 ? "wiosna" : m <= 7 ? "lato" : "jesien"; }
  /** Pamięć kadrów: lista [dzień, pora dnia, id], najnowsze na końcu. Brak pamięci telefonu (tryb prywatny) = pusta lista, nigdy wyjątek. */
  function pamiecKadrow() { try { var p = JSON.parse(w.localStorage.getItem("dn_kadr") || "[]"); return Array.isArray(p) ? p.filter(function (x) { return Array.isArray(x) && x.length === 3; }) : []; } catch (e) { return []; } }
  function zapamietajKadr(k) {
    try {
      var stare = pamiecKadrow(), p = stare.filter(function (x) { return !(x[0] === k.dzien && x[1] === k.pora); });
      if (p.length < stare.length && stare.some(function (x) { return x[0] === k.dzien && x[1] === k.pora && x[2] === k.id; })) return;   // ten sam kadr już zapamiętany: bez zapisu
      p.push([k.dzien, k.pora, k.id]);
      w.localStorage.setItem("dn_kadr", JSON.stringify(p.slice(-KADR_PAMIEC)));
    } catch (e) {}
  }
  /** „snieg”, „deszcz” albo null: dzisiejszy dzień z pamięci pogody (najpierw stan strony, potem pamięć karty). Tylko odczyt. */
  function pogodaKadru(teraz) {
    var klucz = kluczDnia(teraz), dzien = function (dane) { var dd = dane && Array.isArray(dane.days) ? dane.days : [], i; for (i = 0; i < dd.length; i++) if (dd[i] && dd[i].date === klucz) return dd[i]; return null; };
    var d0 = null;
    try { d0 = dzien(w._weatherCache); } catch (e) {}
    try { var ss = w.sessionStorage; for (var i = 0; !d0 && ss && i < ss.length; i++) { var k = ss.key(i); if (k && k.indexOf("weather:") === 0) { var c = JSON.parse(ss.getItem(k) || "null"); d0 = dzien(c && c.data); } } } catch (e) {}
    if (!d0) return null;
    var wc = +d0.weather_code || 0;
    if ((wc >= 71 && wc <= 77) || wc === 85 || wc === 86) return "snieg";
    if ((wc >= 51 && wc <= 67) || (wc >= 80 && wc <= 82) || wc >= 95 || (+d0.precip_pct || 0) >= 60) return "deszcz";
    return null;
  }
  /** Czysty wybór. o = { teraz: Date, pogoda: "snieg" | "deszcz" | null, pamiec: lista [dzień, pora, id], kadry: lista (do testów) }.
      → { id, tlo, pora, sezon, dzien } albo null, gdy lista kadrów jest pusta. Niczego nie czyta i niczego nie zapisuje. */
  function wybierzKadr(o) {
    o = o || {};
    var teraz = o.teraz || new Date(), lista = o.kadry || KADRY, pam = o.pamiec || [], dzien = kluczDnia(teraz), sezon = poraRoku(teraz);
    if (!lista.some(function (k) { return k[1] === sezon; })) sezon = "zima";
    var z = ZMROK[sezon], h = teraz.getHours(), pora = h >= z[0] || h < z[1] ? "zmrok" : "dzien";
    var wSezonie = lista.filter(function (k) { return k[1] === sezon; }); if (!wSezonie.length) return null;
    var pula = wSezonie.filter(function (k) { return k[3] === pora; }); if (!pula.length) pula = wSezonie;
    var wynik = function (k) { var r = { id: k[0], tlo: k[4], pora: pora, sezon: sezon, dzien: dzien }; if (k[5]) r.szeroki = k[5]; return r; }, i;
    for (i = pam.length - 1; i >= 0; i--) if (pam[i][0] === dzien && pam[i][1] === pora) { var juz = pula.filter(function (k) { return k[0] === pam[i][2]; })[0]; if (juz) return wynik(juz); break; }
    var zPogoda = o.pogoda ? pula.filter(function (k) { return k[2] === o.pogoda; }) : [], bez = pula.filter(function (k) { return k[2] === null; });
    var kandydaci = zPogoda.length ? zPogoda : bez.length ? bez : pula;
    var dni = function (n) { return kluczDnia(new Date(teraz.getFullYear(), teraz.getMonth(), teraz.getDate() - n)); }, wcz = dni(1), przed = dni(2);
    var niedawne = pam.filter(function (x) { return x[0] === wcz || x[0] === przed; }).map(function (x) { return x[2]; });
    var wolne = kandydaci.filter(function (k) { return niedawne.indexOf(k[0]) < 0; }); if (!wolne.length) wolne = kandydaci;
    var nrDnia = Math.round(Date.UTC(teraz.getFullYear(), teraz.getMonth(), teraz.getDate()) / 864e5);
    return wynik(wolne[nrDnia % wolne.length]);
  }
  /* ── KADR DNIA: w nagłówku (blizna-385) ──
     Nagłówek dostaje ramkę o STAŁEJ wysokości 184 px na całą szerokość ekranu. Decyzja o kadrze zapada przed narysowaniem szkieletu i już się nie
     zmienia, więc wysokość jest ta sama od pierwszej klatki w każdym z przypadków:
       zdjęcie się wczyta      → ramka w kolorze tła kadru, zdjęcie wchodzi przenikaniem (bez animacji przy ograniczonym ruchu);
       zdjęcie się nie wczyta  → ramka zostaje w kolorze tła (znacznik obrazu znika), bez zgłoszenia do client_errors: brak sieci to nie błąd aplikacji;
       brak sieci na starcie albo tryb oszczędzania danych → ramka w kolorze tła, obrazu w ogóle nie pobieramy.
     Data i powitanie stoją na dole po lewej, przyciski zegarka i dzwonka na dole po prawej (decyzja Filipa 26.11: w prawym górnym rogu zasłaniały
     głowę biegacza na 4 z 7 kadrów). Gradient 6% → 20% (42%) → 76% (64%) → 90%: zmierzony kontrast daty na siedmiu kadrach co najmniej 9,47:1.
     Powitanie na kadrze stoi ZAWSZE w jednym wierszu: długie imię dostaje mniejszą czcionkę (ta sama wysokość wiersza), w ostateczności wielokropek.
     Powód zmierzony 26.11: „Cześć, Aleksandra” przy 360 px łamało się na dwa wiersze i wypychało datę w jasną część zdjęcia (kontrast 1,97:1).
     Z tego samego powodu data też stoi zawsze w jednym wierszu: dłuższa („poniedziałek · 30 października”) dostaje ciaśniejsze odstępy liter.
     Chip „← Trener” (podgląd z panelu trenera) na zdjęciu stoi w LEWYM GÓRNYM rogu ramki, w ciemnej pigułce jak przyciski (blizna-387): nad datą
     wisiał na środku zdjęcia. Położenie liczone od dołu kolumny tekstu, której dolna krawędź jest stała (ramka 184 px, odstęp 14 px), więc nie zależy
     od długości imienia ani daty. W ramce bez zdjęcia (brak sieci, tryb oszczędzania) chip stoi w tym samym rogu (decyzja Filipa 26.11: zawsze
     jedno miejsce). Tylko nagłówek bez ramki (kadr się nie wybrał) zostawia chip nad datą, jak przed kadrem.
     Jedno żądanie obrazu na wejście; przeglądarka sama wybiera 960 albo 1280 px. Kadr zmienia się dopiero przy następnym wejściu, nie pod palcem. */
  var KADR_KATALOG = "assets/ui/dzis/kadry/";
  function bezObrazu() { try { var n = w.navigator || {}; return n.onLine === false || !!(n.connection && n.connection.saveData === true); } catch (e) { return false; } }
  /** Wnętrze ramki: zdjęcie (albo nic, gdy bez sieci lub w trybie oszczędzania) i gradient. k = wynik kadrNaTeraz. */
  function kadrHtml(k) {
    var p = KADR_KATALOG + k.id;
    return (bezObrazu() ? "" : '<img class="dn-kadr-o" src="' + p + '-960.webp" srcset="' + p + "-960.webp 960w, " + p + '-1280.webp 1280w" sizes="100vw" width="960" height="411" alt="" aria-hidden="true" decoding="async"' +
      " onload=\"this.className='dn-kadr-o jest'\" onerror=\"this.remove()\">") + '<span class="dn-kadr-g" aria-hidden="true"></span>';
  }
  /** Kadr na teraz: czyta pogodę i pamięć, wybiera, zapamiętuje. */
  function kadrNaTeraz(teraz) {
    teraz = teraz || new Date();
    var k = wybierzKadr({ teraz: teraz, pogoda: pogodaKadru(teraz), pamiec: pamiecKadrow() });
    if (k) zapamietajKadr(k);
    return k;
  }
  /* ── KADR DNIA: tło na komputerze (P1c, 27.11.2026, blizna-410) ──
     Na szerokim ekranie kolumna aplikacji (420 px) stała na jednolitym ciemnym tle. Od 900 px za kolumną leży kadr dnia z nagłówka: ten sam
     plik, który przeglądarka już pobrała dla nagłówka (jego currentSrc, więc żadnego nowego pobrania), na całą szerokość, cover, rozmycie 40 px,
     jasność 0,35, winieta do czerni przy brzegach; kolumna dostaje lekki cień. Poniżej 900 px bez zmian (reguły tylko w @media).
     Element #dn-tlo stoi w body ze stałą pozycją i z-index −1: strona ma własne tło na <html>, więc tło body (kolumna) maluje się NAD nim i kolumna
     zostaje nieprzezroczysta. Widać go tylko na sekcji Dziś nowego ekranu (html.dzis-gotowy.dzis-na-dzis). Ograniczona przezroczystość: bez zdjęcia;
     ograniczony ruch: bez przenikania. Bez zdjęcia w nagłówku (bez sieci, oszczędzanie danych, błąd pliku) tła nie ma.
     Panorama na później: kadr z polem „szeroki” (kadry.json, szósty element KADRY) bierze na komputerze plik <szeroki>.webp, osobny i pobierany
     tylko tam; gdy się nie wczyta, tło wraca do pliku nagłówka. Adres tylko z katalogu kadrów, znaki ' " ( ) \ < > i odstępy kodowane. */
  var kadrTeraz = null, tloEl = null;
  function adresTla(u) {
    try {
      var x = new w.URL(String(u || ""), w.location.href);
      if ((x.protocol !== "https:" && x.protocol !== "http:") || x.pathname.indexOf("/" + KADR_KATALOG) < 0) return "";
      return x.href.replace(/['"()\\<>\s]/g, function (c) { return "%" + (c.charCodeAt(0) < 16 ? "0" : "") + c.charCodeAt(0).toString(16).toUpperCase(); });
    } catch (e) { return ""; }
  }
  function ustawTlo(u) {
    var a = u ? adresTla(u) : "";
    if (!a) { if (tloEl) tloEl.className = ""; return; }
    if (!tloEl) { tloEl = d.getElementById("dn-tlo") || d.createElement("div"); tloEl.id = "dn-tlo"; tloEl.hidden = true; tloEl.setAttribute("aria-hidden", "true"); if (!tloEl.parentNode) d.body.appendChild(tloEl); }
    tloEl.style.backgroundImage = 'url("' + a + '")';
    tloEl.className = "jest";
  }
  function tloZNaglowka() {
    var k = korzen(), img = k && k.querySelector ? k.querySelector("header .dn-kadr-o") : null;
    if (!img) { ustawTlo(""); return; }
    var z = function () { ustawTlo(img.currentSrc || img.src || ""); };
    if (img.complete && img.naturalWidth > 0) z(); else if (img.addEventListener) img.addEventListener("load", z);
  }
  function tloKadru() {
    try {
      var k = kadrTeraz;
      if (!k || !d.body || bezObrazu()) { ustawTlo(""); return; }
      if (k.szeroki && w.matchMedia && w.matchMedia("(min-width:900px)").matches && w.Image) {
        var im = new w.Image(); im.onload = function () { ustawTlo(im.currentSrc || im.src); }; im.onerror = tloZNaglowka; im.src = KADR_KATALOG + k.szeroki + ".webp";
        return;
      }
      tloZNaglowka();
    } catch (e) {}
  }
  /* ── TYDZIEŃ: dane ── */
  /** Tydzień pn–nd zawierający chwilę `teraz`, w dobie warszawskiej. null, gdy strona nie ma funkcji z sb.js: wtedy moduł pyta tylko o dzisiejszy trening.
      wpisyOd = chwila, od której pytamy o wpisy: poniedziałek POPRZEDNIEGO tygodnia z zapasem 3 h (północ w Warszawie to 22:00 albo 23:00 UTC dnia wcześniej);
      o tym, do którego dnia i tygodnia wpis należy, decyduje dopiero _dzienWaw. */
  function zakresTygodnia(teraz) {
    try {
      if (typeof w._tydzienWaw !== "function" || typeof w._dzienWaw !== "function" || typeof w.isRunType !== "function") return null;
      var ts = teraz == null ? Date.now() : teraz, t = w._tydzienWaw(ts);
      if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(String(t.od)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(t.do))) return null;
      var p = t.od.split("-").map(Number), dz = function (n) { return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }, dni = [];
      for (var i = 0; i < 7; i++) dni.push(dz(i));
      return { od: t.od, do: t.do, poprzOd: dz(-7), dzis: w._dzienWaw(new Date(ts).toISOString()), dni: dni, wpisyOd: new Date(Date.UTC(p[0], p[1] - 1, p[2] - 7) - 3 * 3600e3).toISOString() };
    } catch (e) { return null; }
  }
  function sekundy(t) { var s = typeof w._parseTimeToSecs === "function" ? w._parseTimeToSecs(t) : null; return isFinite(s) && s > 0 ? s : 0; }
  /** Liczby tygodnia z planów (trainings) i wpisów (training_logs; mogą obejmować też poprzedni tydzień). z = zakresTygodnia().
      zaplanowane, zrobione, km, kmInne, planKm: dokładnie reguły starej updateWeekProgress (test porównuje ze źródłem tamtej funkcji).
      Nowe: sek (czas w ruchu, wszystkie aktywności), tempoSek (średnie tempo biegów, które mają dystans i czas), kmPoprz (biegowe km tydzień temu),
      dniZRuchem, inne (liczba aktywności niebiegowych) i siedem dni pn–nd: km biegowe, km z planu, czy jest plan, czy dzień wolny. */
  function policzTydzien(plany, wpisy, z) {
    var bieg = w.isRunType, n = function (x) { return parseFloat(x) || 0; }, nr = {}, dni = z.dni.map(function (d, i) { nr[d] = i; return { dzien: d, km: 0, planKm: 0, plan: false, wolne: false, wpisow: 0 }; });
    var P = (plany || []).filter(function (t) { return t && t.date >= z.od && t.date <= z.do; }), W = 0, o = { od: z.od, do: z.do, km: 0, kmInne: 0, planKm: 0, kmPoprz: 0, sek: 0, inne: 0 }, sekBieg = 0, kmZCzasem = 0;
    (wpisy || []).forEach(function (l) {
      if (!l) return;
      var d = w._dzienWaw(l.logged_at), k = n(l.distance_km), b = bieg(l.training_type);
      if (d >= z.poprzOd && d < z.od) { if (b) o.kmPoprz += k; return; }
      if (!(d >= z.od && d <= z.do)) return;
      var s = sekundy(l.duration); W++; o.sek += s; dni[nr[d]].wpisow++;
      if (b) { o.km += k; dni[nr[d]].km += k; if (k > 0 && s > 0) { sekBieg += s; kmZCzasem += k; } } else { o.kmInne += k; o.inne++; }
    });
    P.forEach(function (t) {
      var x = dni[nr[t.date]], b = bieg(t.type);
      if (b) o.planKm += n(t.distance_km);
      if (t.type === "Odpoczynek") { x.wolne = true; return; }
      x.plan = true; if (b) x.planKm += n(t.distance_km);
    });
    o.zaplanowane = P.filter(function (t) { return t.type !== "Odpoczynek"; }).length;
    o.zrobione = Math.max(P.filter(function (t) { return t.status === "done"; }).length, Math.min(W, o.zaplanowane));
    o.wpisow = W; o.tempoSek = kmZCzasem > 0 ? Math.round(sekBieg / kmZCzasem) : 0;
    o.dniZRuchem = dni.filter(function (x) { return x.wpisow > 0; }).length; o.dni = dni;
    return o;
  }
  function odmiana(n, jeden, kilka, wiele) { n = Math.abs(n); var j = n % 10, d = n % 100; return n === 1 ? jeden : j >= 2 && j <= 4 && !(d >= 12 && d <= 14) ? kilka : wiele; }
  function kmTygodnia(x) { return liczba(x, x > 0 && x < 100 && Math.round(x * 10) % 10 ? 1 : 0); }
  /** Linia pod powitaniem. t = wynik policzTydzien albo null (wtedy pusta). Z planem: kilometry do planu i „N z M treningów”; bez planu: kilometry i dni z ruchem. */
  function tydzienLinia(t) {
    if (!t) return "";
    var km = "<b>" + esc(kmTygodnia(t.km)) + "</b>";
    if (t.zaplanowane > 0) return "Ten tydzień: " + km + (t.planKm > 0 ? " z " + esc(kmTygodnia(t.planKm)) : "") + " km · <b>" + t.zrobione + "</b> z " + t.zaplanowane + " " + odmiana(t.zaplanowane, "treningu", "treningów", "treningów");
    if (!t.wpisow) return "Ten tydzień: jeszcze bez treningu";
    return "Ten tydzień: " + km + " km · <b>" + t.wpisow + "</b> " + odmiana(t.wpisow, "trening", "treningi", "treningów");   // jak stary Postęp tygodnia bez planu: liczba treningów (decyzja Filipa 26.11, blizna-386)
  }
  var DNI_TYG = ["pn", "wt", "śr", "cz", "pt", "sb", "nd"];
  /** „23–29 listopada”, na przełomie miesięcy „30 listopada – 6 grudnia”. */
  function zakresDat(z) { var a = z.od.split("-").map(Number), b = z.do.split("-").map(Number); return a[1] === b[1] ? a[2] + "–" + b[2] + " " + MIESIACE[b[1] - 1] : a[2] + " " + MIESIACE[a[1] - 1] + " – " + b[2] + " " + MIESIACE[b[1] - 1]; }
  function czasRuchu(sek) { var m = Math.round(sek / 60); return !(m > 0) ? ["—", ""] : m < 60 ? [String(m), "min"] : [Math.floor(m / 60) + ":" + (m % 60 < 10 ? "0" : "") + m % 60, "h"]; }
  function tempoZSek(s) { return s > 0 ? Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + s % 60 : "—"; }
  /** Zdanie o dzisiejszym dniu albo "". x = dzisiejszy dzień z policzTydzien. */
  function dzisWTygodniu(x) {
    if (!x) return "";
    if (x.km > 0) return "Dziś: <b>" + esc(kmTygodnia(x.km)) + " km</b>" + (x.planKm > 0 ? " z " + esc(kmTygodnia(x.planKm)) + " w planie" : "");
    if (x.planKm > 0) return "Dziś jeszcze nic · <b>" + esc(kmTygodnia(x.planKm)) + " km</b> w planie";
    if (x.plan) return "Dziś jeszcze nic · trening w planie";
    return x.wolne ? "Dziś wolne" : "";
  }
  /** Kafel „Ten tydzień”. t = wynik policzTydzien, z = zakresTygodnia (z.dzis wyróżnia dzisiejszy słupek), pierwszy = konto nie ma jeszcze żadnego wpisu,
      generator = wolno zaproponować „Ułóż plan ›” (generatorWTygodniu); link pojawia się tylko w pustym tygodniu bez żadnego planu. */
  function tydzienHtml(t, z, pierwszy, generator) {
    var cr = czasRuchu(t.sek), zPlanem = t.planKm > 0, czyta = [], pusto = !t.wpisow && !zPlanem, nowe = pusto && !!pierwszy && !t.zaplanowane;
    var dzis = dzisWTygodniu(t.dni.filter(function (x) { return x.dzien === z.dzis; })[0]);
    var L = [[cr[0], cr[1], "czas w ruchu"], zPlanem ? [kmTygodnia(Math.max(0, t.planKm - t.km)), "km", "do planu"] : [kmTygodnia(t.kmPoprz), "km", "tydzień temu"], [tempoZSek(t.tempoSek), "/km", "śr. tempo"]];
    var maks = t.dni.reduce(function (m, x) { return Math.max(m, x.km, x.planKm); }, 0) || 1;
    var slupki = t.dni.map(function (x, i) {
      var pl = x.planKm > 0 ? Math.max(6, Math.round(x.planKm / maks * 100)) : 0, zr = x.km > 0 ? Math.max(6, Math.round(x.km / maks * 100)) : 0;
      czyta.push(DNI_TYG[i] + " " + (x.km > 0 ? kmTygodnia(x.km) + " km" : x.wolne && !x.plan ? "wolne" : "bez biegu") + (x.planKm > 0 ? ", plan " + kmTygodnia(x.planKm) + " km" : ""));
      if (pusto) return '<div class="dn-sl' + (x.dzien === z.dzis ? " dzis" : "") + '"><span>' + DNI_TYG[i] + "</span></div>";
      return '<div class="dn-sl' + (x.dzien === z.dzis ? " dzis" : "") + '"><div class="dn-sl-p">' + (pl ? '<i class="plan" style="height:' + pl + '%"></i>' : "") + (zr ? '<i class="zrob" style="height:' + zr + '%"></i>' : "") +
        "</div><b>" + (x.km > 0 ? esc(kmTygodnia(x.km)) : "") + "</b><span>" + DNI_TYG[i] + "</span></div>";
    }).join("");
    return gora("Ten tydzień", zakresDat(z), ["Kalendarz", PLAN]) +
      (nowe ? "" : '<div class="dn-liczby dn-trzy">' + L.map(function (x) { return '<div class="dn-l"><b>' + esc(x[0]) + (x[1] && x[0] !== "—" ? "<small>" + esc(x[1]) + "</small>" : "") + "</b><span>" + esc(x[2]) + "</span></div>"; }).join("") + "</div>") +
      (pusto ? '<div class="dn-slupki dn-puste" aria-hidden="true">' + slupki + '</div><p class="dn-tekst dn-tl">' + (nowe ? "Słupki pojawią się po pierwszym treningu." : "W tym tygodniu jeszcze bez treningu.") + "</p>" +
          (generator && !t.zaplanowane ? '<button type="button" class="dn-wlink" data-dn="generator">Ułóż plan ›</button>' : "")
        : '<div class="dn-slupki" role="img" aria-label="' + esc("Kilometry dzień po dniu: " + czyta.join("; ")) + '">' + slupki + "</div>") +
      (dzis ? '<p class="dn-tekst dn-tl">' + dzis + "</p>" : "") +
      (zPlanem ? '<p class="dn-legenda"><span><i class="plan"></i>plan</span><span><i class="zrob"></i>zrobione</span></p>' : "") +
      (t.inne > 0 ? '<p class="dn-inne">+ ' + t.inne + " " + odmiana(t.inne, "inna aktywność", "inne aktywności", "innych aktywności") + (t.kmInne > 0 ? " · " + esc(kmTygodnia(t.kmInne)) + " km" : "") + "</p>" : "");
  }
  /** Linia pod powitaniem i kafel „Ten tydzień” z tego samego wyniku. Bez wyniku: linia pusta, kafel schowany. */
  function rysujTydzien() {
    var el = czesc("tydzien-linia"), h = tydzienLinia(dane.tydzien); if (el && el._dnHtml !== h) { el.innerHTML = h; el._dnHtml = h; }
    if (dane.tydzien && dane.zakres) wpisz("tydzien", tydzienHtml(dane.tydzien, dane.zakres, dane.wpisyZnane && !(dane.wpisy || []).length, generatorWTygodniu())); else schowaj("tydzien");
  }
  /** Obie połowy (plany i wpisy tygodnia) są: liczymy i zapisujemy parę do migawki. */
  function przeliczTydzien(nr, zTel) {
    if (nr !== dane.nr || !dane.zakres || !dane.plany || !dane.wpisyTyg) return;
    try { dane.tydzien = policzTydzien(dane.plany, dane.wpisyTyg, dane.zakres); } catch (e) { dane.tydzien = null; rysujTydzien(); zglos("tydzien"); return; }
    rysujTydzien();
    if (!zTel) zapamietaj(nr, "tydzien", { od: dane.zakres.od, plany: dane.plany, wpisy: dane.wpisyTyg });
  }
  /* ── PAMIĘĆ BEZ SIECI: odczyt ── */
  function brakSieci() { return !!(w.navigator && w.navigator.onLine === false); }
  /** Błąd sieci, nie odpowiedź serwera: ta sama definicja co w starym Dziś (DzisOffline.czyBladSieci). */
  function bladSieci(e) { try { var o = pamiec(); if (o && typeof o.czyBladSieci === "function") return !!o.czyBladSieci(e); } catch (x) {} return brakSieci(); }
  /** Część „dzisNowe” z telefonu albo null. Nie w podglądzie trenera. */
  function zPamieci() {
    try {
      var o = pamiec(); if (!o || !dane.uid || (typeof o.widokTrenera === "function" && o.widokTrenera())) return null;
      var m = o.odczytaj(dane.uid), n = m && m.czesci ? m.czesci.dzisNowe : null;
      return n && typeof n === "object" && typeof n.ts === "number" ? n : null;
    } catch (e) { return null; }
  }
  function pasekOffline() { try { var o = pamiec(); if (o && dane.bezSieci && dane.tsTelefonu && typeof o.pokazPasek === "function") o.pokazPasek(dane.tsTelefonu); } catch (e) {} }
  /** Co najmniej jeden kafel stoi na danych z telefonu: pasek „Offline · dane z HH:MM” z godziną najstarszego pola, które w tej próbie poszło z telefonu. */
  function zTelefonu(n, pole) { var ts = (n.czas && n.czas[pole]) || n.ts; dane.bezSieci = true; if (!dane.tsTelefonu || ts < dane.tsTelefonu) dane.tsTelefonu = ts; pasekOffline(); return true; }
  function swiezaWiadomosc(m) { var t = m && m.sent_at ? new Date(m.sent_at).getTime() : NaN; return isFinite(t) && Date.now() - t <= OKNO_WIADOMOSCI_DNI * 864e5 ? m : null; }
  /** Każda z czterech funkcji rysuje swój kafel z telefonu i oddaje true; false = w telefonie tego nie ma (wtedy zwykły komunikat o błędzie). */
  function awaryjnieUlica(nr) {
    var n = zPamieci(); if (nr !== dane.nr || !n || !("ulica" in n)) return false;
    var u = n.ulica;
    if (u && u.licznik && stanAkcji(u.licznik) !== "brak") wpiszUlice(u.licznik, u.wklad || null, String(u.adres || ""), "", true); else { usunScene(); schowaj("ulica"); }
    return zTelefonu(n, "ulica");
  }
  function awaryjnieTrening(nr) {
    var n = zPamieci(); if (nr !== dane.nr || !n || !n.trening) return false;
    if (n.trening.dzien === kluczDnia() && n.trening.lista && typeof n.trening.lista.length === "number") { dane.trening = n.trening.lista; dane.wiadomosc = swiezaWiadomosc(n.wiadomosc); rysujTrening(); }
    else { dane.trening = null; wpisz("trening", gora("Trening na dziś", "", ["Plan", PLAN]) + '<p class="dn-tekst">Bez sieci nie wiem, co jest dziś w planie.</p><button type="button" class="dn-ponow" data-dn="ponow">Spróbuj ponownie</button>'); }
    return zTelefonu(n, "trening");
  }
  function awaryjnieWiadomosc(nr) {
    var n = zPamieci(); if (nr !== dane.nr || !n || !("wiadomosc" in n)) return false;
    dane.wiadomosc = swiezaWiadomosc(n.wiadomosc); rysujTrening();
    return zTelefonu(n, "wiadomosc");
  }
  function awaryjnieWpisy(nr, sb) {
    var n = zPamieci(); if (nr !== dane.nr || !n || !n.wpisy || typeof n.wpisy.length !== "number") return false;
    zTelefonu(n, "wpisy"); dane.wpisy = n.wpisy; dane.wpisyZTelefonu = true; dane.wpisyZnane = true; rysujWpisy(sb); rysujTydzien();
    return true;
  }
  /** Tydzień z telefonu tylko wtedy, gdy to ten sam tydzień (ten sam poniedziałek): zeszłotygodniowe liczby podane jako bieżące byłyby nieprawdą. */
  function awaryjnieTydzien(nr) {
    var n = zPamieci(); if (nr !== dane.nr) return false;
    if (!dane.zakres) dane.zakres = zakresTygodnia();
    var t = n && n.tydzien; if (!dane.zakres || !t || t.od !== dane.zakres.od || !t.plany || !t.wpisy) { dane.tydzien = null; rysujTydzien(); return false; }
    dane.plany = t.plany; dane.wpisyTyg = t.wpisy; przeliczTydzien(nr, true);
    return zTelefonu(n, "tydzien");
  }
  /** Nie doszedł nawet profil: nagłówek, plakietka zegarka i wszystkie kafle z telefonu. Ulicę rysuje osobno obsługa błędu licznika. */
  function awaryjnieWszystko(nr, sb) {
    var n = zPamieci(); if (nr !== dane.nr || !n || !n.profil) return false;
    dane.imie = String(n.profil.full_name || ""); dane.trener = !!n.profil.trener; odswiezNaglowek(); zegarek(n.profil, nr);
    if (!awaryjnieTrening(nr)) bladKafla("trening", "Trening na dziś");
    if (!awaryjnieWpisy(nr, sb)) { bladKafla("ostatni", "Ostatni trening"); schowaj("lista"); }
    awaryjnieTydzien(nr);
    return zTelefonu(n, "profil");
  }
  function klient() { return w.sb && typeof w.sb.rpc === "function" && typeof w.sb.from === "function" && w.sb.auth ? w.sb : null; }
  function slugAkcji(id) { var c = w.BM_AKCJA_CYTATY; try { return c && typeof c.slugDla === "function" ? String(c.slugDla(id || null) || "") : ""; } catch (e) { return ""; } }
  /** Czy baza odrzuciła token (wygasł albo zegar telefonu się spóźnia i supabase-js uważa go za ważny). */
  function odmowaTokenu(r) { var e = r && r.error; return !!e && (r.status === 401 || e.code === "PGRST301" || e.code === "PGRST303" || /jwt/i.test(String(e.message || ""))); }
  /** Wymusza odświeżenie sesji i czeka na TOKEN_REFRESHED (albo wynik refreshSession), najwyżej LIMIT_MS. → obietnica true/false, nigdy nie odrzuca. */
  function odswiezSesje(sb) {
    return new Promise(function (ok) {
      var gotowe = false, sub = null, t = w.setTimeout(function () { koniec(false); }, LIMIT_MS);
      function koniec(v) { if (gotowe) return; gotowe = true; w.clearTimeout(t); try { if (sub && sub.unsubscribe) sub.unsubscribe(); } catch (e) {} ok(v); }
      try { if (typeof sb.auth.onAuthStateChange === "function") { var r = sb.auth.onAuthStateChange(function (zd) { if (zd === "TOKEN_REFRESHED") koniec(true); }); sub = r && r.data && r.data.subscription; } } catch (e) {}
      try {
        if (typeof sb.auth.refreshSession !== "function") { koniec(false); return; }
        Promise.resolve(sb.auth.refreshSession()).then(function (x) { koniec(!!x && !x.error); }, function () { koniec(false); });
      } catch (e) { koniec(false); }
    });
  }
  /** Obsługa odrzuconego zapytania. → true, gdy nic więcej nie robić: odpowiedź jest spóźniona albo trwa odświeżanie sesji i całe wczytanie pójdzie od nowa.
      proba = true znaczy, że to już ponowienie: druga odmowa jest zwykłym błędem kafla. */
  function przejete(sb, nr, e, proba) {
    if (nr !== dane.nr) return true;
    if (proba || !e || !e.autoryzacja) return false;
    if (dane.odswieza === nr) return true;   // inne zapytanie tej samej próby już uruchomiło odświeżanie
    dane.odswieza = nr;
    odswiezSesje(sb).then(function (udane) { if (nr !== dane.nr) return; if (udane) zglos("sesja"); wczytaj(true, true); });
    return true;
  }
  /** Zapytanie supabase-js → obietnica samych danych; { error } i brak odpowiedzi w LIMIT_MS to odrzucenie. */
  function pytaj(q) {
    return new Promise(function (ok, zle) {
      var otwarte = true; dane.wToku++;
      function koniec() { if (otwarte) { otwarte = false; dane.wToku--; if (!dane.wToku && spol.czeka && spol.czeka === dane.nr) { var n0 = spol.czeka; spol.czeka = 0; spolUzbroj(spol.czekaSb, n0); } } }
      var t = w.setTimeout(function () { koniec(); var e = new Error("limit"); e.siec = true; zle(e); }, LIMIT_MS);   // brak odpowiedzi w 10 s liczymy jak brak sieci
      Promise.resolve(q).then(function (r) { w.clearTimeout(t); koniec(); if (r && r.error) zle({ autoryzacja: odmowaTokenu(r), siec: bladSieci(r.error) }); else ok(r ? r.data : null); }, function (x) { w.clearTimeout(t); koniec(); zle({ autoryzacja: false, siec: bladSieci(x) }); });
    });
  }
  /** Dwa zapytania o akcję (licznik, mój wkład) wysłane od razu; pokaz() rysuje kafel, gdy wiadomo, że to akcja tego konta. */
  function akcja(sb, nr, slug, domyslny, proba) {
    var adres = domyslny + ".html" + (slug !== domyslny ? "?" + encodeURIComponent(slug) + "=1" : "") + "#ulica-po";
    var pL = pytaj(sb.rpc("akcja_licznik", { p_slug: slug })), pW = pytaj(sb.rpc("akcja_moj_wklad", { p_slug: slug })).then(null, function () { return null; });
    pL.then(null, function () {});
    return { pokaz: function () {
      pL.then(function (dn) {
        if (nr !== dane.nr) return;
        if (stanAkcji(dn) === "brak") { usunScene(); schowaj("ulica"); zapamietaj(nr, "ulica", null); return; }
        var dnK = slug === "proba" ? licznikProby(dn) : dn;
        wpiszUlice(dnK, null, adres, slug);
        pW.then(function (wk) { if (nr !== dane.nr) return; zapamietaj(nr, "ulica", { licznik: dn, wklad: wk || null, adres: adres }); if (ulicaOst && !ulicaOst.zTel) ulicaOst.wklad = wk || null; var el = kafel("ulica"), p = el && el.querySelector ? el.querySelector('[data-dn="wklad"]') : null; if (p) p.innerHTML = wkladTekst(wk, stanAkcji(dnK) === "zamknieta"); });
      }, function (e) { if (przejete(sb, nr, e, proba)) return; zglosDane("akcja"); if (e && e.siec && awaryjnieUlica(nr)) return; schowaj("ulica"); });
    } };
  }
  /** Fale danych. wymus = true pomija okno 60 s (przycisk „Spróbuj ponownie”); proba = true to ponowienie po odświeżeniu sesji (drugiego już nie będzie). */
  function wczytaj(wymus, proba) {
    var teraz = Date.now();
    if (!wymus && dane.t && teraz - dane.t < SWIEZE_MS && !(dane.bezSieci && !dane.wToku)) return;   // ekran z telefonu próbuje od razu, ale dopiero gdy poprzednia próba nie ma otwartych zapytań
    var sb = klient(), nr = ++dane.nr;
    dane.t = teraz; dane.bezSieci = false; dane.tsTelefonu = 0; dane.wpisyZTelefonu = false; dane.wpisyZnane = false; dane.zakres = null; dane.plany = null; dane.wpisyTyg = null; dane.tydzien = null;
    if (!sb) { zglosDane("klient"); schowaj("ulica"); schowaj("spol"); bladKafla("trening", "Trening na dziś"); bladKafla("ostatni", "Ostatni trening"); schowaj("lista"); rysujTydzien(); return; }
    spol.czeka = 0;   // kafel Społeczność czeka na koniec fal pierwszego ekranu (niżej: FALA 2 i pytaj)
    dane.profil = Promise.resolve(sb.auth.getSession()).then(function (r) { return r && r.data && r.data.session && r.data.session.user ? r.data.session.user.id : null; }, function () { return null; }).then(function (uid) {
      if (uid || !brakSieci()) return uid;   // wygasła sesja bez sieci: supabase-js nie odda sesji, bo nie może jej odświeżyć; identyfikator konta jak w starym Dziś
      var o = pamiec(); return o && typeof o.userId === "function" ? Promise.resolve(o.userId(sb)).then(null, function () { return null; }) : null;
    }).then(function (uid) {
      if (nr !== dane.nr) return null;
      dane.uid = uid;
      if (!uid && brakSieci()) { dane.t = 0; schowaj("ulica"); bladKafla("trening", "Trening na dziś"); bladKafla("ostatni", "Ostatni trening"); schowaj("lista"); rysujTydzien(); return null; }   // bez sieci nikt nie odeśle do logowania: komunikat zamiast wiecznego szkieletu
      if (!uid) { dane.t = 0; return null; }   // bez sesji stary kod sam odsyła do logowania; okno 60 s zwolnione, żeby następny start() (initAuth) spróbował jeszcze raz
      /* FALA 1: profil, licznik akcji i mój wkład idą razem */
      var s0 = slugAkcji(null), a0 = s0 ? akcja(sb, nr, s0, s0, proba) : null;
      var pProfil = pytaj(sb.from("athletes").select(PROFIL_KOLUMNY).eq("user_id", uid).maybeSingle());
      if (!a0) schowaj("ulica");
      return pProfil.then(function (a) {
        if (nr !== dane.nr) return a;
        if (!a) { wstrzymane = true; stop(); return null; }   // konto bez wiersza zawodnika: pierwsze kroki zostają na starym ekranie
        dane.imie = String(a.full_name || ""); dane.trener = !!a.coach_id; odswiezNaglowek(); zegarek(a, nr);
        zapamietaj(nr, "profil", { id: a.id, full_name: a.full_name || null, trener: !!a.coach_id, intervals_athlete_id: a.intervals_athlete_id || null, intervals_connected_at: a.intervals_connected_at || null,
          intervals_can_write: a.intervals_can_write == null ? null : a.intervals_can_write, intervals_token_dead_at: a.intervals_token_dead_at || null });
        /* FALA 2: wszystko, co potrzebuje id zawodnika */
        var s1 = slugAkcji(a.id);
        if (a0 && s1 === s0) a0.pokaz(); else if (s1 && s0) akcja(sb, nr, s1, s0, proba).pokaz(); else schowaj("ulica");
        /* Plany: jedno zapytanie o cały tydzień, dzisiejszy trening wybierany z niego po dacie (zegar telefonu, jak dotąd). Zakres obejmuje też „dziś” telefonu,
           gdyby za granicą wypadało poza tygodniem warszawskim. Bez funkcji tygodnia: samo dziś, jak przed E6a. */
        var z = dane.zakres = zakresTygodnia(), dzis = kluczDnia(), qT = sb.from("trainings").select("id,date,type,distance_km,duration_min,pace,description,status,plan_source,coach_id").eq("athlete_id", a.id);
        qT = z ? qT.gte("date", z.od < dzis ? z.od : dzis).lte("date", z.do > dzis ? z.do : dzis).order("date").order("created_at").limit(60) : qT.eq("date", dzis).order("created_at").limit(3);
        pytaj(qT).then(function (t) {
          if (nr !== dane.nr) return; t = t || [];
          dane.trening = z ? t.filter(function (x) { return x && x.date === dzis; }).slice(0, 3) : t;
          if (z) dane.plany = t;
          zapamietaj(nr, "trening", { dzien: dzis, lista: dane.trening }); przeliczTydzien(nr); rysujTrening();
        }, function (e) { if (przejete(sb, nr, e, proba)) return; zglosDane("trening"); if (!(e && e.siec && awaryjnieTydzien(nr))) { dane.tydzien = null; rysujTydzien(); } if (e && e.siec && awaryjnieTrening(nr)) return; dane.trening = null; bladKafla("trening", "Trening na dziś"); });
        if (!z) rysujTydzien();   // strona bez funkcji tygodnia: kafel nie zostaje na szkielecie
        if (z) {
          pytaj(sb.from("training_logs").select("logged_at,training_type,distance_km,duration").eq("athlete_id", a.id).not("training_type", "like", "__badge__%").gte("logged_at", z.wpisyOd).order("logged_at", { ascending: false }).limit(200))
            .then(function (l) { if (nr !== dane.nr) return; dane.wpisyTyg = l || []; przeliczTydzien(nr); }, function (e) { if (przejete(sb, nr, e, proba)) return; zglosDane("tydzien"); if (e && e.siec && awaryjnieTydzien(nr)) return; dane.tydzien = null; rysujTydzien(); });
        }
        if (a.coach_id) {
          pytaj(sb.from("messages").select("body,sent_at").eq("athlete_id", a.id).eq("sender", "coach").gte("sent_at", new Date(Date.now() - OKNO_WIADOMOSCI_DNI * 864e5).toISOString()).order("sent_at", { ascending: false }).limit(1))
            .then(function (m) { if (nr !== dane.nr) return; dane.wiadomosc = m && m[0] ? m[0] : null; zapamietaj(nr, "wiadomosc", dane.wiadomosc); rysujTrening(); }, function (e) { if (przejete(sb, nr, e, proba)) return; zglosDane("wiadomosc"); if (e && e.siec && awaryjnieWiadomosc(nr)) return; dane.wiadomosc = null; rysujTrening(); });
        } else { dane.wiadomosc = null; zapamietaj(nr, "wiadomosc", null); }
        pytaj(sb.from("training_logs").select("id,logged_at,training_type,distance_km,duration,pace,heart_rate,elevation_gain,feel,external_source,comment,card_bg_url").eq("athlete_id", a.id).not("training_type", "like", "__badge__%").order("logged_at", { ascending: false }).limit(ILE_WPISOW))
          .then(function (l) {
            if (nr !== dane.nr) return; l = l || [];
            dane.wpisy = l; dane.wpisyZTelefonu = false; dane.wpisyZnane = true; zapamietaj(nr, "wpisy", l);
            rysujWpisy(sb); if (dane.tydzien) rysujTydzien();
          }, function (e) { if (przejete(sb, nr, e, proba)) return; zglosDane("wpisy"); if (e && e.siec && awaryjnieWpisy(nr, sb)) return; bladKafla("ostatni", "Ostatni trening"); schowaj("lista"); });
        spol.czeka = nr; spol.czekaSb = sb;   // fala 2 wysłana: kafel Społeczność podepnie się, gdy wszystkie zapytania pierwszego ekranu się skończą
        return a;
      }, function (e) {
        if (przejete(sb, nr, e, proba)) return null;
        if (a0) a0.pokaz();   // licznik nie zależy od profilu: pokazujemy domyślną akcję (bez sieci: z telefonu)
        zglosDane("profil");
        if (e && e.siec && awaryjnieWszystko(nr, sb)) return null;
        bladKafla("trening", "Trening na dziś"); bladKafla("ostatni", "Ostatni trening"); schowaj("lista"); rysujTydzien();
        return null;
      });
    });
  }

  function rysuj() {
    var k = korzen();
    try { k.innerHTML = szkieletHtml(); } catch (e) { zglos("render"); throw e; }
    k.setAttribute("data-etap", ETAP);
    tloKadru();
  }
  /** Jedno ponowne start() po wczytaniu całej strony (wczesny start z bloku DZIS-E0 1). */
  function poWczytaniuStrony() {
    if (czekaNaDom || !d.addEventListener) return;
    czekaNaDom = true;
    d.addEventListener("DOMContentLoaded", function () { czekaNaDom = false; if (wlaczone()) { try { start(); } catch (e) {} } });
  }
  function start() {
    try {
      var k = korzen();
      if (!k && d.readyState === "loading") {   // wczesny start z bloku DZIS-E0 1 (kopia „nowy”): strona jeszcze się czyta
        poWczytaniuStrony();
        return;
      }
      if (!k) { zglos("start"); return; }
      if (ustepuje() || wstrzymane) { pokaz(); return; }
      wstawCss();
      pilnujPaska();
      if (k.getAttribute("data-etap") !== ETAP) {
        rysuj();
        if (k.addEventListener && !k._dnKlik) { k.addEventListener("click", klik); k.addEventListener("input", wpisywanie); k.addEventListener("touchstart", function () {}, { passive: true }); /* iOS: bez nasłuchu dotyku nie ma :active (krótki stan skrótu) */ k._dnKlik = true; }
      }
      if (!owiniete && typeof w.showSection === "function") {
        var oryg = w.showSection;
        w.showSection = function () { var r = oryg.apply(this, arguments); try { pokaz(); } catch (e) {} return r; };
        owiniete = true;
      }
      if (!owinietaSynchronizacja && typeof w._onWatchSynced === "function") {
        var orygSync = w._onWatchSynced;
        w._onWatchSynced = function () { var r = orygSync.apply(this, arguments); try { if (wlaczone() && !ustepuje() && !wstrzymane) wczytaj(true); } catch (e) {} return r; };
        owinietaSynchronizacja = true;
      }
      if (!nasluchSieci && typeof w.addEventListener === "function") {   // powrót sieci: ekran z telefonu wczytuje się od nowa sam
        nasluchSieci = true;
        w.addEventListener("online", function () { try { if (dane.bezSieci && wlaczone() && !ustepuje() && !wstrzymane) wczytaj(true); } catch (e) {} });
      }
      if (!nasluchDokumentu && d.addEventListener) {   // dotknięcie poza nowym Dziś (menu dolne, pasek biegu) zamyka menu konta
        nasluchDokumentu = true;
        d.addEventListener("click", function (e) { try { var kk = korzen(); if (kk && e && e.target && !(kk.contains && kk.contains(e.target))) menuKonta(false); } catch (err) {} });
      }
      if (!owinietyZapis && typeof w.saveLog === "function") {   // „Zapisz log” w formularzu woła globalną saveLog; udany zapis zamyka formularz
        var orygZapis = w.saveLog;
        w.saveLog = function () {
          var r = orygZapis.apply(this, arguments);
          try { Promise.resolve(r).then(function () { var m = d.getElementById("modal-bg"), otwarty = !!(m && m.classList && m.classList.contains("open")); if (!otwarty && wlaczone() && !ustepuje() && !wstrzymane) wczytaj(true); }, function () {}); } catch (e) {}
          return r;
        };
        owinietyZapis = true;
      }
      sprawdzScenePamiec();
      if (!owinietaAkcja && typeof w._odswiezStanAkcji === "function") {   // E3 4: konto próby dostaje scalony licznik starego kodu, także gdy ten skończy po module
        var orygAkcja = w._odswiezStanAkcji;
        w._odswiezStanAkcji = function () { var r = orygAkcja.apply(this, arguments); try { Promise.resolve(r).then(function () { try { odswiezProbe(); } catch (e) {} }, function () {}); } catch (e) {} return r; };
        owinietaAkcja = true;
      }
      if (!owinietaPogoda && typeof w._renderWeather === "function") {   // stary kod woła ją, gdy dojdą dane pogody (z sieci albo z pamięci karty)
        var orygPogoda = w._renderWeather;
        w._renderWeather = function () { var r = orygPogoda.apply(this, arguments); try { rysujTrening(); } catch (e) {} return r; };
        owinietaPogoda = true;
      }
      if (dane.trening && pogodaTekst() !== dane.pogoda) rysujTrening();   // dane pogody doszły, zanim dało się owinąć starą funkcję: kolejny start (initAuth) je dopisuje
      obserwuj();
      pokaz();
      zdarzenie(); dane.kafleStoja = true;   // od teraz pasek, który dojdzie później, wsuwa się zamiast przeskakiwać
      if (!klient() && d.readyState === "loading") { poWczytaniuStrony(); return; }   // skrypt klienta bazy stoi niżej w stronie: szkielet już jest, dane po DOMContentLoaded
      wczytaj(false);
    } catch (e) { zglos("start"); stop(); throw e; }   // blok DZIS-E0 1 łapie wyjątek i wraca do starego ekranu
  }
  /** Powrót do starego ekranu: korzeń ukryty, stare Dziś odsłonięte. */
  function stop() {
    var k = korzen(); if (k) k.hidden = true;
    html().classList.remove("dzis-gotowy"); html().classList.remove("dzis-na-dzis");
  }
  w.BM_DZIS = { etap: ETAP, start: start, stop: stop, zglos: zglos, ustepuje: ustepuje, dataDzis: dataDzis, ETAPY: ETAPY, SKROTY: SKROTY, KAFLE: KAFLE,
    profil: function () { return dane.profil || Promise.resolve(null); }, wczytaj: wczytaj, kiedy: kiedy, kluczDnia: kluczDnia, czas: czas, tempo: tempo, km: km,
    ulicaHtml: ulicaHtml, treningHtml: treningHtml, ostatniHtml: ostatniHtml, listaHtml: listaHtml, odczucie: odczucie, bolHtml: bolHtml, wczorajHtml: wczorajHtml, radaHtml: radaHtml, pogodaTekst: pogodaTekst, celHtml: celHtml, jpPasekHtml: jpPasekHtml, zakresTygodnia: zakresTygodnia, bezPlanuHtml: bezPlanuHtml, stanBezPlanu: stanBezPlanu, generatorWTygodniu: generatorWTygodniu, policzTydzien: policzTydzien, tydzienLinia: tydzienLinia, tydzienHtml: tydzienHtml, KADRY: KADRY, wybierzKadr: wybierzKadr, adresTla: adresTla, tloKadru: tloKadru, kadrNaTeraz: kadrNaTeraz, kadrHtml: kadrHtml, pogodaKadru: pogodaKadru, pamiecKadrow: pamiecKadrow, tydzien: function () { return dane.tydzien; }, OKNO_WIADOMOSCI_DNI: OKNO_WIADOMOSCI_DNI, STARE_PRZYCISKI: STARE_PRZYCISKI, PROFIL_KOLUMNY: PROFIL_KOLUMNY, kandydatOdczucia: kandydatOdczucia, jakPoszloHtml: jakPoszloHtml, komentarzDoZapisu: komentarzDoZapisu, spolHtml: spolHtml, nazwaOdznaki: nazwaOdznaki, temu: temu, podpisPoZapisie: podpisPoZapisie, OKNO_ODCZUCIA_MS: OKNO_ODCZUCIA_MS, LIMIT_MS: LIMIT_MS, SWIEZE_MS: SWIEZE_MS, ILE_WPISOW: ILE_WPISOW };
})(window, document);
