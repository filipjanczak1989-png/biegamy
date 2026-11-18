// BIEG WIRTUALNY Z PRAWDZIWYMI ZAPISAMI (etap 1, 12.11.2026). Plik BEZ import/export (globalThis.BM_BIEG_REAL), jak js/akcja.mjs: <script src> w bieg.html, import w testach.
// Czyste funkcje strony biegu: stan strony z licznika, sesji i własnych zapisów; teksty; walidacja imienia; numer startowy i dyplom na canvasie w dwóch wersjach
// (dorosły z czasem, dziecko bez czasu i ze „swoim dystansem”); szkic odznaki zwykłej i złotej jako SVG. Dane TYLKO z licznika (pole `bieg`) i z funkcji
// akcja_bieg_* przez window.sb; imię dziecka, na które jest zbiórka, nigdy w tym pliku (nazwa biegu przychodzi z bazy). Bez wpisowego; kwot nie sprawdzamy i nie pokazujemy.
// TEKSTY (14.11): regulamin, oświadczenie rodzica, zgody i zdanie o polityce prywatności od Filipa (REGULAMIN, TEKSTY_KROTKIE niżej). Zapisu na prawdziwy bieg nie ma,
// dopóki bieg ma status 'szkic' (akcja_bieg_zapisz i licznik go pomijają), a we froncie także dopóki brakuje którejkolwiek wartości do tekstów albo wersja
// regulaminu w bazie nie jest wersją tekstów (bramka w stanStrony; wyjątek ?proba=1).
(function (g) {
  "use strict";
  var ROLE = { organizator: "Organizator", organizator_opis: "BiegaMy. Prowadzi bieg i zapisy, liczy kilometry, wydaje numery i dyplomy, nie przyjmuje żadnych wpłat.", zgoda: "Zgoda opiekuna", zgoda_opis: "Opiekun dziecka, dla którego jest zbiórka, wyraził zgodę na bieg, na imię dziecka i na jego rysunek." };
  var ZASADY = { wiek_konta: 16, limit_dzieci: 6, max_zapisow_ja: 3, wynik_do_dni: 2, ukonczyli_na_strone: 50 };   // dystanse tylko z bazy (bieg.dystanse_km, dystanseBiegu), decyzja 16.11
  var KONTAKT = "biegamy.run@gmail.com";   // publiczny adres BiegaMy, ten sam co w stopce dla-fabianka.html
  /* ── TEKSTY BIEGU (14.11, plik „teksty-biegu-do-zaslepek.md” od organizatora, słowo w słowo) ── znaczniki {nazwa} {imie} {od} {do} {wynik_do} {link} {wersja} {od_kiedy}
     {dystanse} {ranking_dystanse} {ranking_zakres} wypełnia strona danymi z bazy (pole `bieg` licznika i akcja); brak którejkolwiek wartości = „WKRÓTCE” (wartosciTekstow → null, bramka w stanStrony).
     Dane administratora w § 1 ust. 3 skopiowane z privacy.html (test porównuje). Teksty dotyczą wersji WERSJA_TEKSTOW: inna wersja w bazie = „WKRÓTCE”.
     v2 (16.11, decyzja Filipa: prawdziwy bieg ma jeden dystans, 5 km): § 2 i § 5 bez „5 km albo 10 km” na sztywno, dystanse z bieg.dystanse_km. */
  var WERSJA_TEKSTOW = "2026-11-v3";
  /* 18.11 v3 (decyzja Filipa: bieg i wyniki kończą się 6.12 o 20:00, bez dopisywania do 8.12): jedyna zmiana to § 2 z godziną końca z bazy ({koniec} z koniec_at).
     Strona przyjmuje v2 i v3: push frontu może iść przed plikiem danych 34e (v2 w bazie = dawny § 2), bez „WKRÓTCE” w przerwie. */
  var WERSJE_TEKSTOW = ["2026-11-v2", "2026-11-v3"];
  var REGULAMIN_P2_V3 = ["Bieg trwa od {od} do {koniec}.", "Dystans: {dystanse}, biegiem albo marszem, na dowolnej trasie.", "Wynik można dodać lub poprawić w aplikacji do {koniec}."];
  var DANE_ADMINISTRATORA = "Filip Jańczak, prowadzący projekt BiegaMy (biegamy.run) jako osoba fizyczna — nie jest to działalność gospodarcza i nie posiadamy numeru NIP";   // dokładnie z privacy.html (§ 1), test porównuje
  var REGULAMIN = {
    tytul: "Regulamin biegu wirtualnego „{nazwa}”",
    paragrafy: [
      { naglowek: "§ 1. Czym jest bieg", punkty: ["Bieg wirtualny „{nazwa}” to bezpłatne wydarzenie w aplikacji BiegaMy (biegamy.run). Każdy uczestnik biegnie albo maszeruje samodzielnie, w wybranym przez siebie miejscu.", "Bieg odbywa się za zgodą opiekuna prawnego dziecka o imieniu {imie}, dla którego organizacja pożytku publicznego prowadzi zbiórkę pod adresem {link} („Zbiórka”). BiegaMy nie jest partnerem tej organizacji i nie działa w jej imieniu.", "Organizatorem biegu jest BiegaMy, " + DANE_ADMINISTRATORA + " („Organizator”). Organizator prowadzi też aplikację, zapisy i wyniki. Kontakt: biegamy.run@gmail.com.", "Organizator nie przyjmuje, nie przechowuje i nie przekazuje żadnych pieniędzy. Wpłaty na Zbiórkę są możliwe wyłącznie na stronie organizacji, która ją prowadzi, i podlegają jej zasadom."] },
      { naglowek: "§ 2. Termin i dystans", punkty: ["Bieg trwa od {od} do {do}.", "Dystans: {dystanse}, biegiem albo marszem, na dowolnej trasie.", "Wynik można dodać lub poprawić w aplikacji do {wynik_do}, godz. 23:59."] },
      { naglowek: "§ 3. Kto może wziąć udział", punkty: ["Udział jest bezpłatny. Nie ma wpisowego ani żadnej innej opłaty.", "Uczestnikiem z własnym kontem może być osoba, która ukończyła 16 lat i ma konto w BiegaMy.", "Dziecko poniżej 16 lat bierze udział wyłącznie jako dopisane przez rodzica albo opiekuna prawnego z jego konta, pod jego opieką i na jego odpowiedzialność. Jedno konto może dopisać najwyżej 6 dzieci.", "Dziecko pokonuje dystans dobrany przez rodzica („swój dystans”)."] },
      { naglowek: "§ 4. Zapis", punkty: ["Zapis odbywa się w aplikacji i wymaga akceptacji tego regulaminu.", "Po zapisie uczestnik dostaje numer startowy w aplikacji. Dopisane dziecko dostaje własny numer.", "Z zapisu można zrezygnować w każdej chwili w aplikacji, bez podawania przyczyny. Numer startowy po rezygnacji przepada i nie wraca do puli: przy ponownym zapisie uczestnik dostaje nowy numer."] },
      { naglowek: "§ 5. Wynik i ukończenie", punkty: ["Bieg ukończył uczestnik, który w terminie z § 2 ma w aplikacji trening biegowy albo marszowy na dystansie co najmniej {dystanse}. Trening może pochodzić z zegarka albo być wpisany ręcznie.", "Jeżeli uczestnik ma kilka pasujących treningów, aplikacja wybiera najlepszy. Uczestnik może wskazać inny.", "Ukończenie przez dziecko potwierdza rodzic, podając pokonany dystans.", "W sprawach spornych o ukończeniu rozstrzyga Organizator i może zaliczyć bieg ręcznie.", "Bieg nie ma nagród. Ranking czasów {ranking_dystanse} obejmuje wyłącznie pełnoletnich uczestników, którzy zgodzili się na udział w rankingu. W rankingu są wyniki z zegarka i wpisane ręcznie. Wynik budzący wątpliwości (np. tempo szybsze niż 3:00/km) trafia do rankingu po sprawdzeniu przez Organizatora, który może poprosić o dowód (np. zapis z zegarka, zrzut z aplikacji). W rankingu liczy się trening {ranking_zakres}; dłuższy trening daje ukończenie i dyplom z prawdziwym dystansem i czasem, bez miejsca w rankingu. Czas pozostałych uczestników nie jest publikowany. Dzieci nigdy nie są w rankingu."] },
      { naglowek: "§ 6. Dyplom, odznaki i wsparcie Zbiórki", punkty: ["Każdy, kto ukończy bieg, dostaje w aplikacji dyplom i odznakę. Mają one postać wyłącznie cyfrową.", "Wsparcie Zbiórki jest dobrowolne i nie jest warunkiem zapisu, udziału ani ukończenia biegu.", "Uczestnik, który wsparł Zbiórkę dowolną kwotą i przesłał Organizatorowi potwierdzenie wpłaty, dostaje złotą wersję odznaki oraz cegiełkę w murze ulicy. Odznaka pojawia się po sprawdzeniu potwierdzenia.", "Kwota wpłaty nie jest publikowana. Potwierdzenie wpłaty Organizator usuwa po sprawdzeniu, najpóźniej po 14 dniach."] },
      { naglowek: "§ 7. Bezpieczeństwo", punkty: ["Uczestnik sam wybiera trasę, porę i tempo oraz bierze udział na własną odpowiedzialność.", "Zapisując się, uczestnik potwierdza, że jego stan zdrowia pozwala na udział. Rodzic potwierdza to samo za dopisane dziecko.", "Uczestnik przestrzega przepisów ruchu drogowego i zasad bezpieczeństwa w miejscu, w którym biegnie.", "Organizator nie wyznacza ani nie zabezpiecza tras, nie zapewnia opieki medycznej ani ubezpieczenia.", "Postanowienia tego paragrafu nie ograniczają odpowiedzialności, której według prawa nie można wyłączyć."] },
      { naglowek: "§ 8. Lista osób, które ukończyły, i dane osobowe", punkty: ["Na stronie biegu widoczne są liczby zbiorcze oraz lista osób, które ukończyły: imię, numer startowy i dystans. Imię pojawia się tylko za zgodą uczestnika, a imię dziecka tylko za zgodą rodzica. U osób, które zgodziły się na ranking, lista pokazuje także czas i miejsce na zasadach z § 5 ust. 5. Przy wyniku wpisanym ręcznie lista pokazuje dopisek „wynik ręczny”. Zgodę na ranking można wycofać w aplikacji w każdej chwili.", "Administratorem danych uczestników jest Organizator. Zasady opisuje Polityka prywatności BiegaMy.", "Opiekun dziecka i organizacja prowadząca Zbiórkę mogą otrzymać wyłącznie liczby zbiorcze. Nie otrzymują imion, adresów e-mail ani żadnych innych danych uczestników.", "Dane zapisów Organizator usuwa po 90 dniach od zakończenia biegu. Zostają liczby zbiorcze, zdobyte odznaki i imiona na liście, na które wyrażono zgodę."] },
      { naglowek: "§ 9. Uczciwość", punkty: ["Jedna osoba zapisuje się raz. Zabronione jest wpisywanie treningów, które się nie odbyły, cudzych treningów oraz treści bezprawnych lub obraźliwych, także w polu imienia.", "W rankingu są wyniki z zegarka i wpisane ręcznie.", "Wynik budzący wątpliwości (np. tempo szybsze niż 3:00/km) trafia do rankingu po sprawdzeniu przez Organizatora, który może poprosić o dowód (np. zapis z zegarka, zrzut z aplikacji).", "Organizator może usunąć zapis albo wynik sprzeczny z regulaminem. W sprawach spornych, także dotyczących uczciwości wyników, rozstrzyga Organizator."] },
      { naglowek: "§ 10. Wymagania techniczne", punkty: ["Do udziału potrzebne są: urządzenie z aktualną przeglądarką internetową, dostęp do internetu i konto w BiegaMy. Zegarek sportowy nie jest wymagany."] },
      { naglowek: "§ 11. Kontakt i reklamacje", punkty: ["Uwagi i reklamacje można wysłać na adres biegamy.run@gmail.com. Organizator odpowiada w ciągu 14 dni."] },
      { naglowek: "§ 12. Zmiany i odwołanie", punkty: ["Organizator może z ważnej przyczyny zmienić termin biegu albo go odwołać. Informacja pojawi się na stronie biegu.", "Zmiana regulaminu po otwarciu zapisów jest ogłaszana na stronie biegu. Uczestnik, który jej nie akceptuje, może zrezygnować z zapisu."] },
      { naglowek: "§ 13. Postanowienia końcowe", punkty: ["Regulamin jest dostępny na stronie biegu przed zapisem i można go pobrać.", "W sprawach nieuregulowanych stosuje się Regulamin BiegaMy i prawo polskie.", "Wersja regulaminu: {wersja}, obowiązuje od {od_kiedy}."] }
    ],
    oswiadczenie: { naglowek: "Oświadczenie rodzica lub opiekuna (pełne brzmienie)", tekst: "Oświadczam, że jestem rodzicem albo opiekunem prawnym dziecka, które dopisuję do biegu. Zgadzam się na jego udział i na zapisanie jego imienia w aplikacji na potrzeby biegu. W czasie biegu dziecko pozostaje pod moją opieką, a jego stan zdrowia pozwala na udział." },
    zgody: { naglowek: "Zgody dobrowolne (pełne brzmienie)", lista: [{ nazwa: "Imię na liście", tekst: "Zgadzam się, żeby moje imię pojawiło się na publicznej liście osób, które ukończyły bieg." }, { nazwa: "Imię dziecka na liście", tekst: "Zgadzam się, żeby imię dziecka pojawiło się na publicznej liście osób, które ukończyły bieg. Mogę wycofać tę zgodę w aplikacji w każdej chwili. Imię zawsze widzisz na numerze i dyplomie dziecka. Ta zgoda dotyczy tylko publicznej listy." }, { nazwa: "Ranking", tekst: "Pokaż mnie w rankingu z czasem i miejscem. Mam ukończone 18 lat. Bez zgody na imię będę w rankingu jako „bez imienia”." }, { nazwa: "E-mail", tekst: "Chcę dostać e-mail z przypomnieniem przed biegiem oraz informację o dyplomie i możliwości wsparcia zbiórki. Mogę zrezygnować w każdej chwili linkiem w wiadomości." }] }
  };
  /* krótkie wersje pod polami (≤ 200 znaków); pełne brzmienie w oknie regulaminu */
  var TEKSTY_KROTKIE = {
    oswiadczenie: "Jestem rodzicem lub opiekunem prawnym tego dziecka. Zgadzam się na jego udział i zapis imienia na potrzeby biegu. Dziecko biegnie pod moją opieką, a jego zdrowie pozwala na udział.",
    zgoda_imie: "Zgadzam się, żeby moje imię pojawiło się na publicznej liście osób, które ukończyły bieg.",
    zgoda_imie_dziecka: "Zgadzam się, żeby imię dziecka pojawiło się na publicznej liście osób, które ukończyły bieg. Mogę wycofać tę zgodę w każdej chwili.",
    zgoda_ranking: "Pokaż mnie w rankingu z czasem i miejscem. Mam ukończone 18 lat. Bez zgody na imię będę w rankingu jako „bez imienia”.",
    zgoda_email: "Chcę dostać e-mail z przypomnieniem przed biegiem oraz informację o dyplomie i możliwości wsparcia zbiórki. Mogę zrezygnować w każdej chwili linkiem w wiadomości.",
    polityka: "Administratorem danych jest BiegaMy. Dane służą do przeprowadzenia biegu i są usuwane po 90 dniach od jego zakończenia. Szczegóły: Polityka prywatności."
  };
  var TEKSTY_GOTOWE = true;   // 14.11: teksty od Filipa wstawione; zapis dalej tylko z kompletem wartości z bazy (wartosciTekstow)
  var TEKSTY = {
    regulamin_pole: "Akceptuję regulamin biegu (wymagane)",
    zgoda_imie_pole: "Pokaż moje imię na liście „ukończyli” (dobrowolne)",
    zgoda_ranking_pole: "Pokaż mnie w rankingu: czas i miejsce na liście „ukończyli”{osobno}. Mam ukończone 18 lat (dobrowolne)",   // {osobno} i {osobno_dla}: tekstyDystansow
    zgoda_email_pole: "Wyślij mi e-mail z przypomnieniem 3 dni przed końcem biegu (dobrowolne)",
    oswiadczenie_pole: "Jestem rodzicem lub opiekunem tego dziecka i składam oświadczenie (wymagane)",
    zgoda_imie_dziecka_pole: "Pokaż imię dziecka na liście „ukończyli” (dobrowolne)",
    zgoda_imie_dziecka_pod: "Imię zawsze widzisz na numerze i dyplomie dziecka. Ta zgoda dotyczy tylko publicznej listy.",
    wynik_reczny: "Wynik ręczny: przy zgodzie na ranking masz czas i miejsce na liście, z dopiskiem „wynik ręczny”. Masz ten trening także z zegarka? Wskaż go niżej, a dopisek zniknie.",
    wynik_weryfikacja: "Wynik czeka na sprawdzenie przez organizatora (tempo szybsze niż 3:00/km albo wolniejsze niż 36:00/km). Ukończenie i dyplom już masz; do rankingu wynik trafi po sprawdzeniu.",
    wynik_odrzucony: "Organizator prosi o dowód tego wyniku (np. zapis z zegarka, zrzut z aplikacji). Do czasu sprawdzenia wynik jest poza rankingiem; ukończenie i dyplom zostają. Napisz do organizatora:",
    wynik_usuniety: "Zgodnie z § 9 regulaminu nie ma dyplomu ani miejsca na liście. Jeśli to pomyłka, napisz do organizatora:",
    wynik_za_dlugi: "Trening dłuższy niż {gorna} km: masz ukończenie i dyplom z prawdziwym dystansem i czasem, a na liście jesteś bez czasu. Ranking liczy treningi do {gorna} km.",
    bez_wpisowego: "Udział jest bezpłatny. Nie ma wpisowego, medali ani pakietów. Kto chce, wspiera zbiórkę bezpośrednio u organizacji, która ją prowadzi; BiegaMy nic nie przyjmuje i nie widzi wpłat.",
    czasy_prywatne: "Lista pokazuje tych, którzy ukończyli: imię (za zgodą), numer i dystans. Czas i miejsce mają pełnoletni, którzy włączyli ranking{osobno_dla}, z wynikiem z zegarka albo wpisanym ręcznie (z dopiskiem „wynik ręczny”){z_treningu}. Wynik budzący wątpliwości (np. tempo szybsze niż 3:00/km) trafia do rankingu po sprawdzeniu przez organizatora. Pozostali są na liście bez czasu, a czas mają na dyplomie. Dzieci nigdy nie są w rankingu.",
    dzieci: "Dziecko dopisuje rodzic z własnego konta: samo imię, bez konta dziecka. Dziecko biegnie albo idzie swój dystans, dostaje numer i dyplom bez czasu.",
    wesprzyj_pod: "Wpłata idzie w całości do organizacji prowadzącej zbiórkę, poza BiegaMy. Kwoty nie sprawdzamy i nigdzie nie pokazujemy."
  };

  /* ── POMOCNICZE ── */
  function esc(s) { return g.escapeHtml ? g.escapeHtml(String(s == null ? "" : s)) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function liczba(n, miejsc) {
    n = Number(n); if (!isFinite(n)) n = 0;
    var m = miejsc == null ? 0 : miejsc, t = (Math.round(Math.abs(n) * Math.pow(10, m)) / Math.pow(10, m)).toFixed(m), cz = t.split("."), ul = (cz[1] || "").replace(/0+$/, "");
    return (n < 0 ? "-" : "") + cz[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (ul ? "," + ul : "");
  }
  function km(x) { var n = Number(x) || 0; return liczba(n, n > 0 && n < 10 ? 1 : 0); }
  function forma(n, f) { n = Math.abs(Math.round(Number(n) || 0)); var r = n % 10, s = n % 100; return n === 1 ? f[0] : r >= 2 && r <= 4 && (s < 12 || s > 14) ? f[1] : f[2]; }
  function odmiana(n, f) { return liczba(n) + " " + forma(n, f); }
  function p2(x) { return String(x).padStart(2, "0"); }
  function czas(s) { s = Math.max(0, Math.round(Number(s) || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sek = s % 60; return h ? h + ":" + p2(m) + ":" + p2(sek) : m + ":" + p2(sek); }
  function tempo(s, kmDyst) { if (!(kmDyst > 0) || !(s > 0)) return ""; var t = Math.round(s / kmDyst), m = Math.floor(t / 60); return m + ":" + p2(t % 60) + " /km"; }
  var MIESIACE = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  function dataPolska(d) { d = d instanceof Date ? d : new Date(d); return isFinite(d.getTime()) ? d.getDate() + " " + MIESIACE[d.getMonth()] + " " + d.getFullYear() : ""; }
  function dataZIso(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null; }
  /** „5–6.12.2026”; na przełomie miesiąca „30.11–1.12.2026”; roku „31.12.2026–1.1.2027”. */
  function zakresDni(od, doIso) {
    var a = dataZIso(od), b = dataZIso(doIso || od); if (!a || !b) return "";
    var mies = function (x) { return (x.getMonth() + 1) + "." + x.getFullYear(); };
    if (a.getTime() === b.getTime()) return a.getDate() + "." + mies(a);
    if (a.getFullYear() !== b.getFullYear()) return a.getDate() + "." + mies(a) + "–" + b.getDate() + "." + mies(b);
    if (a.getMonth() !== b.getMonth()) return a.getDate() + "." + (a.getMonth() + 1) + "–" + b.getDate() + "." + mies(b);
    return a.getDate() + "–" + b.getDate() + "." + mies(a);
  }
  function zakresSlowny(od, doIso) { var a = dataZIso(od), b = dataZIso(doIso || od); if (!a || !b) return ""; return a.getDate() + (a.getMonth() === b.getMonth() ? "" : " " + MIESIACE[a.getMonth()]) + "–" + b.getDate() + " " + MIESIACE[b.getMonth()]; }
  var RE_IMIE = /^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+(-[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+)?$/;
  /** Imię jak w bazie (CHECK akcja_bieg_jedno_imie): jedno słowo 2–20 liter, opcjonalny łącznik; pierwsza wielka. Nie przechodzi: "" */
  function ladneImie(t) {
    var s = String(t == null ? "" : t).trim().replace(/\s+/g, " ");
    if (s.length < 2 || s.length > 20 || !RE_IMIE.test(s)) return "";
    return s.split("-").map(function (cz) { return cz.charAt(0).toLocaleUpperCase("pl-PL") + cz.slice(1).toLocaleLowerCase("pl-PL"); }).join("-");
  }
  function imieZProfilu(fullName) { return ladneImie(String(fullName || "").trim().split(/\s+/)[0] || ""); }
  function bezRuchu() { try { return !!(g.matchMedia && g.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } }

  /* ── DYSTANSE Z BAZY (16.11, decyzja Filipa: prawdziwy bieg ma jeden dystans, 5 km; próba zostaje z 5 i 10 km) ──
     Wszystko, co mówi o dystansach (karty, okno zapisu, zakładki „Ukończyli”, regulamin, etykiety rankingu), bierze listę z bieg.dystanse_km.
     Przy kilku dystansach brzmienie jak przed 16.11 („5 albo 10 km”, „osobno 5 i 10 km”); przy jednym bez wyboru i bez „osobno”. Brak listy = brak wartości. */
  function dystanseBiegu(bieg) {
    var l = bieg && Array.isArray(bieg.dystanse_km) ? bieg.dystanse_km : [];
    return l.map(Number).filter(function (d, i, t) { return d >= 1 && d <= 100 && Math.floor(d) === d && t.indexOf(d) === i; }).sort(function (a, b) { return a - b; });
  }
  function zSpojnikiem(czesci, spojnik) { return czesci.length < 2 ? czesci.join("") : czesci.slice(0, -1).join(", ") + " " + spojnik + " " + czesci[czesci.length - 1]; }
  /** [5] → „5 km”, [5, 10] → „5 km albo 10 km” (regulamin). */
  function dystanseSlownie(l, spojnik) { return zSpojnikiem(l.map(function (d) { return km(d) + " km"; }), spojnik || "albo"); }
  /** [5] → „5 km”, [5, 10] → „5 albo 10 km” (teksty strony). */
  function dystanseKrotko(l, spojnik) { return l.length ? zSpojnikiem(l.map(km), spojnik || "albo") + " km" : ""; }
  /** Długość treningu, który wchodzi do rankingu: [5] → „od 5 km do 5,49 km”, [5, 10] → „od 5 km do 5,49 km albo od 10 km do 10,49 km” (górny próg = dystans + 0,49 km, jak w bazie). */
  function zakresRankingu(l) { return zSpojnikiem(l.map(function (d) { return "od " + km(d) + " km do " + liczba(d + 0.49, 2) + " km"; }), "albo"); }
  var IKONY_DYSTANSU = { 5: "assets/bieg/bieg-dystans-5.svg", 10: "assets/bieg/bieg-dystans-10.svg" };
  function ikonaDystansu(d) { return IKONY_DYSTANSU[d] || IKONY_DYSTANSU[5]; }
  /** Teksty strony zależne od dystansów biegu: pod kartami, krok „Zapisz się”, opis okna zapisu, odmowa bez wyboru, etykieta rankingu, opis listy. */
  function tekstyDystansow(bieg) {
    var l = dystanseBiegu(bieg), wiele = l.length > 1, i = wiele ? dystanseKrotko(l, "i") : "", zn = { osobno: i ? ", osobno " + i : "", osobno_dla: i ? ", osobno dla " + i : "", z_treningu: l.length ? ", z treningu " + zakresRankingu(l) : "" };
    var kk = koniecKrotko(bieg), wynik = "Wynik wchodzi z zegarka (jak każdy trening w BiegaMy) albo wpisujesz go sam, " + (kk ? "do " + kk : "do dwóch dni po końcu biegu") + ". Zapisać można się przez cały czas trwania biegu.", max = l.length ? km(l[l.length - 1]) : "";
    return {
      karty_pod: (wiele ? "Zapis na " + km(l[0]) + " km, a zrobione " + max + "? Dyplom na " + max + ". " : l.length ? "Liczy się trening co najmniej " + km(l[0]) + " km. " : "") + wynik,
      krok_zapisu: (l.length ? "Dystans " + dystanseKrotko(l, "albo") + ", imię na numer i dyplom." : "Imię na numer i dyplom.") + " Dzieci dopisujesz samym imieniem.",
      zapis_opis: (wiele ? "Wybierz dystans. " : l.length ? "Dystans: " + dystanseKrotko(l) + ", biegiem albo marszem. " : "") + "Imię trafi na numer startowy i dyplom; na listę „ukończyli” tylko za Twoją zgodą. Nic nie jest zaznaczone z góry.",
      wybierz: wiele ? "Wybierz dystans: " + dystanseKrotko(l, "albo") + "." : "Nie wczytał się dystans biegu. Odśwież stronę.",
      zgoda_ranking_pole: wypelnij(TEKSTY.zgoda_ranking_pole, zn), czasy_prywatne: wypelnij(TEKSTY.czasy_prywatne, zn)
    };
  }
  /** Karty sekcji „Dystanse”: każdy dystans biegu i „Dzieci”; bez listy dystansów "" (sekcja schowana). */
  function dystanseHtml(bieg) {
    var l = dystanseBiegu(bieg);
    if (!l.length) return "";
    return l.map(function (d, i) { return '<div class="bw-dystans"><img src="' + ikonaDystansu(d) + '" alt=""><b>' + esc(km(d)) + ' km</b><small>' + (i ? "dla tych, którzy lubią dłużej" : "bieg albo marsz") + '</small></div>'; }).join("") +
      '<div class="bw-dystans"><img src="assets/bieg/bieg-dystans-twoj.svg" alt=""><b>Dzieci</b><small>swój dystans, bez czasu</small></div>';
  }
  /** Wybór dystansu w oknie zapisu: tylko przy kilku dystansach; przy jednym "" (dystans ustawiony, podany w opisie okna). */
  function wyborDystansuHtml(bieg) {
    var l = dystanseBiegu(bieg);
    return l.length < 2 ? "" : l.map(function (d) { return '<label><input type="radio" name="bw-dystans" value="' + d + '"><img src="' + ikonaDystansu(d) + '" alt=""><span><b>' + esc(km(d)) + ' km</b><small>bieg albo marsz</small></span></label>'; }).join("");
  }
  /** Dystans zapisu: przy jednym dystansie ten dystans, przy kilku zaznaczony (wartość pola) albo null. */
  function dystansZapisu(bieg, zaznaczony) {
    var l = dystanseBiegu(bieg), d = Number(zaznaczony);
    return l.length === 1 ? l[0] : l.indexOf(d) >= 0 ? d : null;
  }

  /* ── FAZA I STAN STRONY ── */
  var FAZY = {
    szkic: { chip: "WKRÓTCE", klasa: "bw-chip--wkrotce", zdanie: "Zapisy ruszą niebawem. Wróć tutaj za kilka dni." },
    zapisy: { chip: "ZAPISY OTWARTE", klasa: "bw-chip--trwa", zdanie: "Zapisy trwają. Dołącz, zanim ruszy bieg." },
    trwa: { chip: "BIEG TRWA", klasa: "bw-chip--trwa", zdanie: "Bieg trwa. Zapisz się i pobiegnij, kiedy chcesz." },
    wyniki: { chip: "DOPISYWANIE WYNIKÓW", klasa: "bw-chip--wyniki", zdanie: "Bieg za nami. Wyniki i spóźnione zapisy przyjmujemy jeszcze przez dwa dni." },
    zakonczony: { chip: "ZAKOŃCZONY", klasa: "bw-chip--koniec", zdanie: "Bieg zakończony. Dziękujemy wszystkim, którzy pobiegli i poszli." }
  };
  function faza(bieg) { return bieg && FAZY[bieg.faza] ? bieg.faza : "szkic"; }
  /** 18.11: w fazie „trwa” zdanie z końcem biegu z bazy („Bieg trwa do 6 grudnia. …”): bieg trwa cały okres, nie weekend. Bez daty: zdanie bez daty. */
  function fazaInfo(bieg) {
    var f = FAZY[faza(bieg)], d = dataZIso(bieg && bieg.dzien_do), kk = koniecKrotko(bieg), w = dataZIso(bieg && bieg.wynik_do);
    if (f === FAZY.wyniki && (kk || w)) return { chip: f.chip, klasa: f.klasa, zdanie: "Bieg za nami. Wyniki i spóźnione zapisy przyjmujemy do " + (kk || w.getDate() + " " + MIESIACE[w.getMonth()]) + "." };   // 18.11: termin z bazy, nie „dwa dni”
    if (f !== FAZY.trwa || !d) return f;
    return { chip: f.chip, klasa: f.klasa, zdanie: "Bieg trwa do " + (kk || d.getDate() + " " + MIESIACE[d.getMonth()]) + ". Zapisz się i pobiegnij, kiedy chcesz." };   // 18.11: z godziną końca z bazy
  }
  /** Zapisy (siebie i dzieci) otwarte w fazach zapisy, trwa i wyniki, czyli do wynik_do (przegląd 12.11). */
  function zapisyOtwarte(bieg) { var f = faza(bieg); return f === "zapisy" || f === "trwa" || f === "wyniki"; }
  /** BRAMKA ZAPISU (przegląd 13.11, teksty 14.11): bez kompletu wartości do tekstów (teksty = wynik wartosciTekstow) strona nie przyjmuje zapisu,
   *  nawet gdy bieg w bazie ma już status otwarty. Wyjątek tylko ?proba=1 (próba Filipa na biegu próbnym). */
  function zapisZablokowany(proba, teksty) { return !proba && (!TEKSTY_GOTOWE || !teksty); }
  var DNI_DOPELNIACZ = ["niedzieli", "poniedziałku", "wtorku", "środy", "czwartku", "piątku", "soboty"];
  /** "2026-12-05" → "soboty, 5 grudnia 2026" (po „od”/„do” w regulaminie dzień tygodnia w dopełniaczu); zła data → "". */
  function dataZDniem(iso) { var d = dataZIso(iso); return d ? DNI_DOPELNIACZ[d.getDay()] + ", " + d.getDate() + " " + MIESIACE[d.getMonth()] + " " + d.getFullYear() : ""; }
  /** Wartości znaczników z bazy: bieg = pole `bieg` licznika, licznik = licznik akcji (imię), link = A.linkZbiorki(licznik). Brak którejkolwiek albo inna wersja = null.
   *  {dystanse}: „5 km” albo „5 km albo 10 km”; {ranking_dystanse}: „na 5 km” albo „na 5 i 10 km (osobno dla każdego dystansu)”. Pusta lista dystansów = brak wartości. */
  function wartosciTekstow(bieg, licznik, link) {
    if (!bieg || !licznik) return null;
    var tekst = function (v) { return typeof v === "string" ? v.trim() : ""; }, l = dystanseBiegu(bieg);
    var w = { nazwa: tekst(bieg.nazwa), imie: tekst(licznik.imie), od: dataZDniem(bieg.dzien_od), do: dataZDniem(bieg.dzien_do), wynik_do: dataZDniem(bieg.wynik_do),
      link: /^https:\/\//.test(tekst(link)) ? tekst(link) : "", wersja: tekst(bieg.regulamin_wersja), od_kiedy: dataZIso(bieg.regulamin_od) ? dataPolska(dataZIso(bieg.regulamin_od)) : "",
      dystanse: dystanseSlownie(l), ranking_dystanse: !l.length ? "" : l.length > 1 ? "na " + dystanseKrotko(l, "i") + " (osobno dla każdego dystansu)" : "na " + dystanseKrotko(l), ranking_zakres: zakresRankingu(l) };
    if (w.wersja === "2026-11-v3") w.koniec = koniecZDniem(bieg);   // v3: § 2 z godziną końca; bez koniec_at w bazie = brak wartości
    for (var k in w) if (!w[k]) return null;
    return WERSJE_TEKSTOW.indexOf(w.wersja) >= 0 ? w : null;
  }
  /** Czego brakuje do tekstów (dla próby Filipa: okno regulaminu mówi, którego pola nie ma w bazie). */
  function brakiTekstow(bieg, licznik, link) {
    var w = { nazwa: bieg && bieg.nazwa, imie: licznik && licznik.imie, od: bieg && dataZDniem(bieg.dzien_od), do: bieg && dataZDniem(bieg.dzien_do), wynik_do: bieg && dataZDniem(bieg.wynik_do),
      link: /^https:\/\//.test(String(link || "")) ? link : "", wersja: bieg && WERSJE_TEKSTOW.indexOf(bieg.regulamin_wersja) >= 0 ? "ok" : "", od_kiedy: bieg && dataZIso(bieg.regulamin_od) ? "ok" : "",
      dystanse: dystanseBiegu(bieg).length ? "ok" : "", koniec: bieg && bieg.regulamin_wersja === "2026-11-v3" && !koniecZDniem(bieg) ? "" : "ok" };
    return Object.keys(w).filter(function (k) { return !w[k]; });
  }
  /* ── 18.11: KONIEC BIEGU O GODZINIE (koniec_at z bazy, migracja 20261209); bez koniec_at teksty jak dotąd (dniami, wynik_do) ── */
  /** koniec_at (ISO) w czasie polskim: { iso: "2026-12-06", godz: "20:00" } albo null. */
  function koniecBiegu(bieg) {
    var t = bieg && bieg.koniec_at ? new Date(bieg.koniec_at) : null, c = {};
    if (!t || !isFinite(t.getTime())) return null;
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(t).forEach(function (p) { c[p.type] = p.value; });
    return { iso: c.year + "-" + c.month + "-" + c.day, godz: c.hour + ":" + c.minute };
  }
  /** „niedzieli, 6 grudnia 2026, godz. 20:00” (regulamin § 2 v3) albo "". */
  function koniecZDniem(bieg) { var k = koniecBiegu(bieg); return k && dataZDniem(k.iso) ? dataZDniem(k.iso) + ", godz. " + k.godz : ""; }
  /** „6 grudnia, godz. 20:00” albo "". */
  function koniecKrotko(bieg) { var k = koniecBiegu(bieg), d = k && dataZIso(k.iso); return d ? d.getDate() + " " + MIESIACE[d.getMonth()] + ", godz. " + k.godz : ""; }
  /** Linia przy datach w nagłówku: „kiedy chcesz w tym czasie · do 6.12.2026, godz. 20:00”; bez koniec_at jak dotąd „· wynik do 8.12.2026”. */
  function terminOpis(bieg) {
    var k = koniecBiegu(bieg);
    return "kiedy chcesz w tym czasie · " + (k ? "do " + zakresDni(k.iso, k.iso) + ", godz. " + k.godz : "wynik do " + zakresDni(bieg && bieg.wynik_do, bieg && bieg.wynik_do));
  }
  /** Krok 3 „Jak to działa”: do kiedy dopisuje się wynik. */
  function zdanieKoniecWyniku(bieg) { var k = koniecBiegu(bieg); return "Z zegarka albo bez: wynik dopisujesz " + (k ? "do " + zakresDni(k.iso, k.iso) + ", godz. " + k.godz : "do dwóch dni po końcu") + "."; }
  /** Komunikat dla zapisanych na starszej wersji regulaminu, gdy bieg ma godzinę końca: „Zmiana: bieg i wyniki kończą się 6.12 o 20:00.”; inaczej "". */
  function komunikatZmiany(bieg, moi) {
    var k = koniecBiegu(bieg), d = k && dataZIso(k.iso);
    if (!d || !Array.isArray(moi) || !moi.some(function (u) { return u && !u.wycofany_at && u.regulamin_wersja && u.regulamin_wersja !== bieg.regulamin_wersja; })) return "";
    return "Zmiana: bieg i wyniki kończą się " + d.getDate() + "." + (d.getMonth() + 1) + " o " + k.godz + ".";
  }
  function wypelnij(t, w) { return String(t).replace(/\{([a-z_]+)\}/g, function (m, k) { return w && Object.prototype.hasOwnProperty.call(w, k) ? w[k] : m; }); }
  /** Regulamin jako bloki do okna (strona robi z nich elementy przez textContent, bez innerHTML): tytul, naglowek, punkt, akapit, zgoda. */
  function regulaminBloki(w) {
    var b = [{ typ: "tytul", tekst: wypelnij(REGULAMIN.tytul, w) }];
    REGULAMIN.paragrafy.forEach(function (p) {
      b.push({ typ: "naglowek", tekst: p.naglowek });
      var punkty = p.naglowek === "§ 2. Termin i dystans" && w && w.wersja === "2026-11-v3" ? REGULAMIN_P2_V3 : p.punkty;   // v3: jedyna zmiana to termin w § 2
      punkty.forEach(function (t, i) { b.push({ typ: punkty.length > 1 ? "punkt" : "akapit", tekst: (punkty.length > 1 ? (i + 1) + ". " : "") + wypelnij(t, w) }); });
    });
    b.push({ typ: "naglowek", tekst: REGULAMIN.oswiadczenie.naglowek }, { typ: "akapit", tekst: REGULAMIN.oswiadczenie.tekst });
    b.push({ typ: "naglowek", tekst: REGULAMIN.zgody.naglowek });
    REGULAMIN.zgody.lista.forEach(function (z) { b.push({ typ: "zgoda", tekst: z.nazwa + ": " + z.tekst }); });
    return b;
  }
  /** Ten sam regulamin jako zwykły tekst do pobrania (.txt, § 13 ust. 1). */
  function regulaminTekst(w) {
    return regulaminBloki(w).map(function (x) { return x.typ === "naglowek" ? "\n" + x.tekst : x.typ === "zgoda" ? "- " + x.tekst : x.tekst; }).join("\n") + "\n";
  }
  /**
   * Stan strony: 'blad' (licznik się nie wczytał: sieć albo awaria), 'wkrotce' (brak biegu w liczniku albo bramka zapisu), 'niezalogowany', 'przed' (konto bez zapisu),
   * 'po' (zapisany), 'dzieci' (zapisany z dziećmi albo same dzieci), 'zamkniete' (po zapisach, bez zapisu; także wylogowany po zapisach).
   * moi = odpowiedź akcja_bieg_moi (własne wiersze, bez wycofanych). opcje = { blad: licznik === null, proba: ?proba=1, teksty: wartosciTekstow(…) }. Zwraca też ja i dzieci.
   */
  function stanStrony(bieg, sesja, moi, opcje) {
    var o = opcje || {}, lista = Array.isArray(moi) ? moi : [], ja = null, dzieci = [];
    lista.forEach(function (u) { if (u.rodzaj === "ja" && !ja) ja = u; else if (u.rodzaj === "dziecko") dzieci.push(u); });
    if (o.blad) return { stan: "blad", ja: null, dzieci: [] };
    if (!bieg || !bieg.slug) return { stan: "wkrotce", ja: null, dzieci: [] };
    if (zapisZablokowany(o.proba, o.teksty)) return { stan: "wkrotce", ja: null, dzieci: [], bramka: true };
    if (!sesja) return { stan: zapisyOtwarte(bieg) ? "niezalogowany" : "zamkniete", ja: null, dzieci: [] };
    if (dzieci.length) return { stan: "dzieci", ja: ja, dzieci: dzieci };
    if (ja) return { stan: "po", ja: ja, dzieci: [] };
    return { stan: zapisyOtwarte(bieg) ? "przed" : "zamkniete", ja: null, dzieci: [] };
  }
  /** Chip i zdanie pod nazwą: przy błędzie licznika nic (osobny komunikat w stanie 'blad'), przy bramce jak w szkicu, inaczej z fazy biegu. */
  function naglowekStanu(bieg, stan) {
    if (stan === "blad") return { chip: "", klasa: "", zdanie: "" };
    if (stan === "wkrotce") return FAZY.szkic;
    return fazaInfo(bieg);
  }
  /** E-mail idzie 3 dni przed końcem biegu (20261207), zaległe dzień później: zgodę warto zbierać w fazie zapisy i w trakcie biegu do dnia zaległych (dzien_do - 2). dzis: "RRRR-MM-DD" (lokalnie), domyślnie dziś. */
  function przedMailem(bieg, dzis) {
    var f = faza(bieg); if (f === "zapisy") return true; if (f !== "trwa") return false;
    var d = dataZIso(bieg && bieg.dzien_do); if (!d) return false; d.setDate(d.getDate() - 2);
    var t = dzis || (function () { var x = new Date(); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); })();
    return t <= d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  /** Pole zgody na e-mail (okno zapisu i okno dziecka): przed wysyłką (przedMailem); bez pola, gdy konto już ma zgodę (usterka 8). */
  function poleEmailaWidoczne(bieg, zgodaKonta, dzis) { return przedMailem(bieg, dzis) && !(zgodaKonta && zgodaKonta.zgoda_email); }
  /** Obietnica z limitem czasu: po ms (domyślnie 4 s) oddaje null; odrzucenie też null. Usterka 12: brak js/ulica.mjs nie zawiesza strony na próbie. */
  function zLimitem(obietnica, ms) {
    return new Promise(function (ok) {
      var t = g.setTimeout(function () { ok(null); }, ms == null ? 4000 : ms);
      Promise.resolve(obietnica).then(function (d) { g.clearTimeout(t); ok(d == null ? null : d); }, function () { g.clearTimeout(t); ok(null); });
    });
  }
  function mozeDopisacDziecko(bieg, dzieci) { return zapisyOtwarte(bieg) && (dzieci || []).length < Math.min(ZASADY.limit_dzieci, Number(bieg && bieg.limit_dzieci) || ZASADY.limit_dzieci); }

  /* ── HTML: liczby, ukończyli, wsparcie ── */
  function liczbaHtml(duze, male) { return '<div class="bw-liczba"><b>' + esc(duze) + '</b><span>' + esc(male) + '</span></div>'; }
  function liczbyHtml(bieg) {
    var z = Number(bieg.zapisani) || 0, d = Number(bieg.dzieci) || 0, u = Number(bieg.ukonczyli_n) || 0, na = bieg.zapisani_na || {};
    var l = dystanseBiegu(bieg), pod = l.map(function (x) { return km(x) + " km: " + liczba(na[String(x)] || 0); }).concat(["dzieci: swój dystans"]).join(" · ");   // 16.11: dystanse z bazy
    return liczbaHtml(liczba(z), forma(z, ["zapisana osoba", "zapisane osoby", "zapisanych osób"])) + liczbaHtml(liczba(d), forma(d, ["w tym dzieci", "w tym dzieci", "w tym dzieci"])) +   // usterka 16: dzieci są wśród zapisanych, nie obok
      liczbaHtml(liczba(u), forma(u, ["ukończył(a)", "ukończyły", "ukończyło"])) + '<p class="bw-drobne bw-liczby-pod">' + esc(pod) + '</p>';
  }
  /** Wiersz listy „ukończyli”: imię za zgodą (inaczej „bez imienia”), numer, dystans; czas i miejsce tylko, gdy serwer je dał (zgoda na ranking, dorosły). */
  function wierszUkonczyl(u, moj, kolumnaMiejsca) {
    var dyst = u.dystans_km != null ? km(u.dystans_km) + " km" : "ukończył(a)", reczny = u.reczny === true && !u.dziecko, rank = u.miejsce != null && u.czas_s != null && !u.dziecko, kol = rank || !!kolumnaMiejsca;
    return '<li class="bw-wiersz' + (moj ? " bw-wiersz--ty" : "") + (kol ? " bw-wiersz--ranking" : "") + '">' + (rank ? '<span class="bw-pozycja" aria-label="miejsce ' + esc(u.miejsce) + '">' + esc(u.miejsce) + '.</span>' : (kol ? '<span class="bw-pozycja"></span>' : "")) + '<span class="bw-nr">' + esc(u.numer) + '</span><span class="bw-imie">' + (u.imie ? esc(u.imie) : '<i class="bw-bez">bez imienia</i>') + (u.dziecko ? ' <small>dziecko</small>' : "") + (moj ? ' <i>Ty</i>' : "") + '</span><span class="bw-dyst">' + (rank ? '<b class="bw-czas">' + esc(czas(u.czas_s)) + '</b> · ' : '') + esc(dyst) + (reczny ? ' · <small class="bw-reczny">wynik ręczny</small>' : '') + '</span></li>';
  }
  /** Lista z osobnej funkcji (EF bieg-ukonczyli, ta sama droga co licznik): dane = { razem, od, lista }, strona dokleja kolejne porcje; „Pokaż więcej” rysuje strona. */
  function ukonczyliHtml(dane, mojeNumery) {
    var l = Array.isArray(dane && dane.lista) ? dane.lista : [], moje = mojeNumery || [], razem = Number(dane && dane.razem) || l.length, d = dane && dane.dystans, wr = Number(dane && dane.w_rankingu) || 0,
      zRankingiem = l.some(function (u) { return u.miejsce != null && u.czas_s != null && !u.dziecko; });   // jedna siatka dla całej listy: kolumna miejsca także pusta
    if (dane && dane.blad) return '<p class="bw-drobne">Lista chwilowo niedostępna. Spróbuj za chwilę.</p>';   // usterka 4: błąd listy to nie „nikt nie ukończył”
    if (!l.length) return '<p class="bw-drobne">' + (d ? "Na " + esc(d) + " km jeszcze nikt nie dopisał wyniku." : "Jeszcze nikt nie dopisał wyniku. Lista zapełni się, gdy pierwsi ukończą bieg.") + '</p>';
    return (d ? '<p class="bw-drobne bw-ranking-pod">' + (wr ? "Ranking " + esc(d) + " km: " + esc(liczba(wr)) + " " + forma(wr, ["osoba", "osoby", "osób"]) + " z czasem, za zgodą. Niżej pozostali bez czasu." : "Na " + esc(d) + " km nikt jeszcze nie włączył rankingu. Lista bez czasów.") + '</p>' : "") + '<ol class="bw-lista">' + l.map(function (u) { return wierszUkonczyl(u, moje.indexOf(Number(u.numer)) >= 0, zRankingiem); }).join("") + '</ol>' +
      (razem > l.length ? '<button type="button" class="bw-przycisk bw-przycisk--cichy" data-ukonczyli-wiecej="' + l.length + '">Pokaż więcej (' + esc(liczba(razem - l.length)) + ')</button>' : "");
  }
  /** Przełącznik listy: wszyscy albo jeden dystans (ranking tego dystansu na górze). Przyciski ≥ 44 px, aria-pressed. Bieg z jednym dystansem: bez zakładek, sama lista „Wszyscy” (16.11). */
  function zakladkiListyHtml(dystanse, akt) {
    if (!Array.isArray(dystanse) || dystanse.length < 2) return "";
    var opcje = [[null, "Wszyscy"]].concat((dystanse || []).map(function (d) { return [Number(d), km(d) + " km"]; }));
    return '<div class="bw-zakladki" role="group" aria-label="Lista ukończyli: wybór dystansu">' + opcje.map(function (o) { return '<button type="button" class="bw-zakladka" data-ukonczyli-dystans="' + (o[0] == null ? "" : esc(o[0])) + '" aria-pressed="' + (o[0] === (akt == null ? null : Number(akt))) + '">' + esc(o[1]) + '</button>'; }).join("") + '</div>';
  }
  /** „Wesprzyj zbiórkę”: trzy podpowiedzi (pierwsza wyróżniona), każda jest zwykłym linkiem do oficjalnej zbiórki; bez linku nic.
   *  href = wynik A.linkZbiorki (safeExternalHref z sb.js: tylko https i JUŻ escapowany do atrybutu). Tu bez drugiego sita i escape, inaczej „&amp;amp;” w adresie (usterka 7).
   *  Sprawdzamy tylko, że to https bez znaków, którymi dałoby się wyjść z atrybutu (wynik sita ich nie ma, surowy adres z cudzysłowem odpada). */
  var RE_HREF_GOTOWY = /^https:\/\/[^\s"'<>`]+$/i;
  function wsparcieHtml(bieg, link) {
    var href = String(link || "");
    if (!RE_HREF_GOTOWY.test(href)) return "";
    var kwoty = Array.isArray(bieg && bieg.wsparcie_kwoty_zl) && bieg.wsparcie_kwoty_zl.length ? bieg.wsparcie_kwoty_zl : [20, 30, 50];
    return '<div class="bw-kwoty">' + kwoty.map(function (k, i) { return '<a class="bw-kwota' + (i === 0 ? " bw-kwota--glowna" : "") + '" href="' + href + '" target="_blank" rel="noopener noreferrer" data-kwota="' + esc(k) + '"><b>' + esc(liczba(k)) + ' zł</b>' + (i === 0 ? '<small>podpowiedź</small>' : "") + '</a>'; }).join("") +
      '<a class="bw-kwota bw-kwota--inna" href="' + href + '" target="_blank" rel="noopener noreferrer">inna kwota</a></div><p class="bw-drobne">' + esc(TEKSTY.wesprzyj_pod) + '</p>';
  }

  /* ── CANVAS: numer startowy i dyplom w dwóch wersjach ── */
  var FONT_NAGL = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif", FONT_TEKST = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
  function nowyCanvas(w, h) { var k = g.document.createElement("canvas"); k.width = w; k.height = h; return k; }
  function prost(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function tekstWSzer(c, t, x, y, maks, font, rozmiar, waga) {
    var pelny = String(t || ""), r = rozmiar, min = Math.ceil(rozmiar * 0.6), ustaw = function (px) { c.font = (waga || 400) + " " + px + "px " + font; };
    t = pelny;
    for (; r >= min; r -= 2) { ustaw(r); if (c.measureText(t).width <= maks) break; }
    if (r < min) ustaw(min);
    if (c.measureText(t).width > maks) while (t.length > 2 && c.measureText(t + "…").width > maks) t = t.slice(0, -1);
    c.fillText(t === pelny ? t : t + "…", x, y);
  }
  function losowy(ziarno) { var a = ziarno >>> 0; return function () { a = (a + 0x6d2b79f5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function konfettiPunkty(w, h, ile, los, wykluczenia) {
    var kolory = ["#e8561e", "#f2b32a", "#6f9e3e", "#d9482b", "#ff8a3d", "#3d5a99"], ZAPAS = 14, out = [], wyk = wykluczenia || [];
    var wPolu = function (x, y) { for (var i = 0; i < wyk.length; i++) { var r = wyk[i]; if (x >= r[0] - ZAPAS && x <= r[0] + r[2] + ZAPAS && y >= r[1] - ZAPAS && y <= r[1] + r[3] + ZAPAS) return true; } return false; };
    for (var i = 0; i < ile; i++) { var x = 0, y = 0, ok = false; for (var p = 0; p < 12 && !ok; p++) { x = los() * w; y = los() * h; ok = !wPolu(x, y); } if (!ok) continue; out.push({ x: x, y: y, kat: los() * Math.PI, dl: 12 + los() * 10, kolor: kolory[Math.floor(los() * kolory.length)], alfa: 0.5 + los() * 0.4 }); }
    return out;
  }
  function konfettiTlo(c, w, h, ile, los, wyk) { konfettiPunkty(w, h, ile, los, wyk).forEach(function (k) { c.save(); c.translate(k.x, k.y); c.rotate(k.kat); c.fillStyle = k.kolor; c.globalAlpha = k.alfa; c.fillRect(-6, -3, k.dl, 6); c.restore(); }); }
  function laur(c, cx, cy, r, kolor, obrys) {
    c.save(); c.translate(cx, cy); c.strokeStyle = obrys || "#35561f"; c.lineWidth = Math.max(1, r / 60); c.fillStyle = kolor || "#6f9e3e";
    [-1, 1].forEach(function (strona) { for (var i = 0; i < 9; i++) { var kat = Math.PI / 2 + strona * (0.25 + i * 0.17), px = Math.cos(kat) * r, py = Math.sin(kat) * r * 0.95, sk = r * (0.11 + (i % 3) * 0.012); c.save(); c.translate(px, py); c.rotate(kat + strona * 1.1); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(sk * 0.9, -sk * 0.5, sk * 2.2, 0); c.quadraticCurveTo(sk * 0.9, sk * 0.5, 0, 0); c.closePath(); c.fill(); c.stroke(); c.restore(); } });
    c.restore();
  }
  function wstega(c, x, y, w, h, kolor, tekst) {
    c.save(); c.fillStyle = kolor; c.strokeStyle = "#3a1d0a"; c.lineWidth = h * 0.06;
    c.fillStyle = "#b8440f"; c.beginPath(); c.moveTo(x, y + h * 0.15); c.lineTo(x - h * 0.9, y + h * 0.15); c.lineTo(x - h * 0.55, y + h * 0.6); c.lineTo(x - h * 0.9, y + h * 1.05); c.lineTo(x, y + h * 1.05); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x + w, y + h * 0.15); c.lineTo(x + w + h * 0.9, y + h * 0.15); c.lineTo(x + w + h * 0.55, y + h * 0.6); c.lineTo(x + w + h * 0.9, y + h * 1.05); c.lineTo(x + w, y + h * 1.05); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = kolor; c.beginPath(); c.rect(x, y, w, h); c.fill(); c.stroke();
    if (tekst) { c.fillStyle = "#fff7e6"; c.textAlign = "center"; c.textBaseline = "middle"; c.font = h * 0.52 + "px " + FONT_NAGL; c.fillText(tekst, x + w / 2, y + h / 2 + h * 0.03); }
    c.restore();
  }
  function znakBiegamy(c, x, y, rozmiar, kolor) { c.save(); c.fillStyle = kolor || "#f0ede8"; c.textAlign = "left"; c.textBaseline = "alphabetic"; c.font = "600 " + rozmiar + "px " + FONT_TEKST; c.fillText("BiegaMy", x, y); c.restore(); }
  function rysujObraz(c, im, x, y, w, h) { try { if (im && (im.naturalWidth > 0 || im.width > 0)) { c.drawImage(im, x, y, w, h); return true; } } catch (e) {} return false; }
  function medalRysowany(c, cx, cy, r, zlota) {
    c.save(); c.fillStyle = zlota ? "#f2b32a" : "#c8553d"; c.strokeStyle = "#3a1d0a"; c.lineWidth = Math.max(2, r * 0.08);
    c.beginPath(); c.moveTo(cx - r * 0.55, cy - r * 1.9); c.lineTo(cx - r * 0.2, cy - r * 0.6); c.lineTo(cx + r * 0.2, cy - r * 0.6); c.lineTo(cx + r * 0.55, cy - r * 1.9); c.closePath(); c.fillStyle = "#e8561e"; c.fill(); c.stroke();
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = zlota ? "#f2b32a" : "#c8553d"; c.fill(); c.stroke();
    c.beginPath(); c.arc(cx, cy, r * 0.72, 0, Math.PI * 2); c.strokeStyle = zlota ? "#fff2c2" : "#fff7e6"; c.lineWidth = Math.max(1, r * 0.05); c.stroke();
    c.restore();
  }
  /** NUMER STARTOWY 1200×900. u: { imie, numer, rodzaj: 'ja'|'dziecko', dystans_km }, bieg: { nazwa, dzien_od, dzien_do }. obrazy: { brama }. adres: strona biegu (u dołu). Dziecko: „SWÓJ DYSTANS”. */
  function numerStartowy(u, bieg, obrazy, adres) {
    var W = 1200, H = 900, k = nowyCanvas(W, H), c = k.getContext("2d"), los = losowy(Number(u.numer) || 1), dziecko = u.rodzaj === "dziecko";
    c.fillStyle = "#fff7e6"; prost(c, 0, 0, W, H, 40); c.fill();
    c.fillStyle = "#f6e9cc"; c.globalAlpha = 0.5; for (var i = 0; i < 60; i++) c.fillRect(los() * W, los() * H, 3, 3); c.globalAlpha = 1;
    c.fillStyle = dziecko ? "#3d5a99" : "#e8561e"; prost(c, 0, 0, W, 150, 40); c.fill(); c.fillRect(0, 110, W, 40);
    c.fillStyle = "#fff7e6"; c.textAlign = "left"; c.textBaseline = "alphabetic"; tekstWSzer(c, String(bieg.nazwa || "Bieg wirtualny").toUpperCase(), 120, 98, 640, FONT_NAGL, 64);
    c.font = "600 26px " + FONT_TEKST; c.textAlign = "right"; c.fillText(zakresSlowny(bieg.dzien_od, bieg.dzien_do), W - 120, 92);
    [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]].forEach(function (p) { c.fillStyle = "#3a1d0a"; c.beginPath(); c.arc(p[0], p[1], 16, 0, Math.PI * 2); c.fill(); c.fillStyle = "#fff7e6"; c.beginPath(); c.arc(p[0], p[1], 10, 0, Math.PI * 2); c.fill(); });
    c.fillStyle = "#07070a"; c.textAlign = "center"; c.font = "380px " + FONT_NAGL; c.fillText(String(u.numer), W / 2, 560);
    c.fillStyle = dziecko ? "#3d5a99" : "#e8561e"; tekstWSzer(c, String(u.imie || "").toUpperCase(), W / 2, 660, 900, FONT_NAGL, 72);
    c.fillStyle = "#3a1d0a"; c.font = "600 30px " + FONT_TEKST; c.fillText(dziecko ? "SWÓJ DYSTANS · BIEG ALBO MARSZ" : km(u.dystans_km) + " KM · BIEG ALBO MARSZ", W / 2, 712);
    prost(c, 60, 750, W - 120, 90, 18); c.fillStyle = "#3b3b47"; c.fill();
    c.fillStyle = "#fff7e6"; for (var x = 90; x < W - 90; x += 52) c.fillRect(x, 772, 26, 46);
    c.fillStyle = dziecko ? "#3d5a99" : "#e8561e"; for (var x2 = 116; x2 < W - 90; x2 += 52) c.fillRect(x2, 772, 26, 46);
    if (!rysujObraz(c, obrazy && obrazy.brama, 870, 165, 280, 173)) { c.fillStyle = "#ff8a3d"; c.font = "40px " + FONT_NAGL; c.textAlign = "right"; c.fillText("START · META", W - 70, 230); }
    c.textAlign = "left"; c.fillStyle = "#3a1d0a"; c.font = "600 22px " + FONT_TEKST; c.fillText("bieg i marsz dla jednej zbiórki", 100, 200);   // zdanie o braku opłat tylko w tekście strony (najwyżej dwa razy): numer powtarza się przy każdym uczestniku
    c.font = "500 22px " + FONT_TEKST; c.fillText("wpłaty wyłącznie u organizacji prowadzącej zbiórkę", 100, 236);
    znakBiegamy(c, 100, 880, 28, "#3a1d0a"); c.fillStyle = "#7a4a1e"; c.textAlign = "right"; tekstWSzer(c, String(adres || "biegamy.run").replace(/^https?:\/\//, ""), W - 100, 880, 700, FONT_TEKST, 22, 500);
    return k;
  }
  /** Data na dyplomie (usterka 19): dni biegu z bazy, nie chwila zaliczenia (wynik dopisany 7.12 to nadal bieg 5–6.12). Bez dat biegu: dzień zaliczenia jak dotąd. */
  function dataNaDyplomie(u, bieg) {
    var a = dataZIso(bieg && bieg.dzien_od), b = dataZIso(bieg && (bieg.dzien_do || bieg.dzien_od));
    if (a && b && b - a > 2 * 864e5) return "Termin biegu: " + zakresDni(bieg.dzien_od, bieg.dzien_do);   /* 17.11: bieg 18.11–6.12, pełne nazwy miesięcy nachodziły na medal */
    if (a && b) return "Data biegu: " + (a.getTime() === b.getTime() ? dataPolska(a) : zakresSlowny(bieg.dzien_od, bieg.dzien_do || bieg.dzien_od) + " " + b.getFullYear());
    return "Data: " + dataPolska(u && u.ukonczony_at ? new Date(u.ukonczony_at) : new Date());
  }
  /** DYPLOM 'telefon' 1080×1350 albo 'a4' 1754×1240. u: { imie, numer, rodzaj, wynik_s, wynik_dystans_km, dystans_km, dystans_wlasny_km, ukonczony_at, odznaka }. Dziecko: bez czasu, „swój dystans”. */
  function dyplom(u, bieg, format, obrazy) {
    var a4 = format === "a4", W = a4 ? 1754 : 1080, H = a4 ? 1240 : 1350, k = nowyCanvas(W, H), c = k.getContext("2d"), los = losowy(7), dziecko = u.rodzaj === "dziecko", zlota = u.odznaka === "zlota";
    var dyst = dziecko ? Number(u.dystans_wlasny_km) || 0 : dystansWyniku(u), s = dziecko ? 0 : Number(u.wynik_s) || 0;
    var tlo = c.createLinearGradient(0, 0, 0, H); tlo.addColorStop(0, "#fffaf0"); tlo.addColorStop(1, "#f7e9cf"); c.fillStyle = tlo; c.fillRect(0, 0, W, H);
    var sx = a4 ? 0.82 : 1, cx = W / 2, y = a4 ? 150 : 200;
    var WYK = a4
      ? [[cx - 460, 80, 920, 40], [cx - 250, 128, 500, 125], [cx - 170, 272, 340, 38], [cx - 440, 316, 880, 104], [cx - 270, 440, 540, 40], [cx - 610, 490, 1220, 150], [cx - 180, 720, 360, 320], [150, H - 470, 330, 230], [cx - 340, H - 150, 680, 80]]
      : [[cx - 460, 110, 920, 40], [cx - 300, 178, 600, 142], [cx - 210, 350, 420, 40], [cx - 440, 400, 880, 122], [cx - 320, 550, 640, 42], [cx - 450, 608, 900, 164], [cx - 170, 790, 340, 320], [100, H - 445, 320, 200], [cx - 300, H - 160, 600, 90]];
    konfettiTlo(c, W, H, 90, los, WYK);
    c.strokeStyle = zlota ? "#f2b32a" : "#e8561e"; c.lineWidth = 10; prost(c, 36, 36, W - 72, H - 72, 28); c.stroke();
    c.strokeStyle = zlota ? "#e8561e" : "#f2b32a"; c.lineWidth = 3; prost(c, 56, 56, W - 112, H - 112, 20); c.stroke();
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillStyle = "#3a1d0a"; c.font = "600 " + Math.round(26 * sx) + "px " + FONT_TEKST; c.fillText("BIEG I MARSZ DLA JEDNEJ ZBIÓRKI", cx, a4 ? 110 : 140);
    c.fillStyle = "#e8561e"; c.font = Math.round(150 * sx) + "px " + FONT_NAGL; c.fillText("DYPLOM", cx, y + (a4 ? 90 : 110));
    c.fillStyle = "#3a1d0a"; c.font = "500 " + Math.round(30 * sx) + "px " + FONT_TEKST; c.fillText(dziecko ? "za ukończenie swojego dystansu" : "za ukończenie biegu", cx, y + (a4 ? 150 : 180));
    c.fillStyle = "#07070a"; tekstWSzer(c, u.imie || "", cx, y + (a4 ? 260 : 310), W - 240, FONT_NAGL, Math.round(130 * sx));
    c.fillStyle = "#3a1d0a"; c.font = "500 " + Math.round(34 * sx) + "px " + FONT_TEKST; tekstWSzer(c, String(bieg.nazwa || "Bieg wirtualny") + (dziecko ? " · swój dystans" : " · " + liczba(dyst, 2) + " km"), cx, y + (a4 ? 320 : 380), W - 200, FONT_TEKST, Math.round(34 * sx), 500);
    var yy = y + (a4 ? 420 : 500), kol = a4 ? [cx - 420, cx, cx + 420] : [cx - 300, cx, cx + 300];
    var wart = dziecko ? ["ukończono", km(dyst) + " km", zakresSlowny(bieg.dzien_od, bieg.dzien_do)] : [s ? czas(s) : "ukończono", s && dyst ? tempo(s, dyst).replace(" /km", "") : liczba(dyst, 2), zakresSlowny(bieg.dzien_od, bieg.dzien_do)];
    var pod = dziecko ? ["wynik", "swój dystans", "termin biegu"] : [s ? "czas" : "wynik", s && dyst ? "tempo min/km" : "kilometry", "termin biegu"];
    kol.forEach(function (x, i) {
      prost(c, x - (a4 ? 190 : 140), yy - (a4 ? 80 : 90), a4 ? 380 : 280, a4 ? 150 : 160, 22); c.fillStyle = "rgba(232,86,30,.08)"; c.fill(); c.strokeStyle = "#e8b48a"; c.lineWidth = 3; c.stroke();
      c.fillStyle = "#07070a"; tekstWSzer(c, wart[i], x, yy + (i === 2 ? 4 : 14), (a4 ? 380 : 280) - 36, FONT_NAGL, Math.round((i === 2 ? 44 : 78) * sx));
      c.fillStyle = "#7a4a1e"; c.font = "600 " + Math.round(22 * sx) + "px " + FONT_TEKST; c.fillText(pod[i], x, yy + (a4 ? 50 : 54));
    });
    var med = a4 ? [cx - 100, H - 500, 200, 260] : [cx - 100, H - 540, 200, 260];
    laur(c, med[0] + med[2] / 2, med[1] + med[3] * 0.62, a4 ? 160 : 150, zlota ? "#c99a2e" : "#6f9e3e", zlota ? "#7a5a10" : "#35561f");
    if (!rysujObraz(c, obrazy && (zlota ? obrazy.medalZloty : obrazy.medal), med[0], med[1], med[2], med[3])) medalRysowany(c, med[0] + med[2] / 2, med[1] + med[3] * 0.65, 78, zlota);
    wstega(c, cx - (a4 ? 260 : 220), H - (a4 ? 140 : 150), a4 ? 520 : 440, a4 ? 60 : 66, zlota ? "#c99a2e" : "#e8561e", zlota ? "ZŁOTA ODZNAKA · DZIĘKUJEMY" : "KILOMETRY BUDUJĄ ULICĘ");
    c.textAlign = "left"; c.fillStyle = "#3a1d0a"; c.font = "500 " + Math.round(22 * sx) + "px " + FONT_TEKST;
    c.fillText(dataNaDyplomie(u, bieg), a4 ? 160 : 110, H - (a4 ? 440 : 420));
    c.fillText("Numer startowy: " + u.numer, a4 ? 160 : 110, H - (a4 ? 404 : 384));
    znakBiegamy(c, a4 ? 160 : 110, H - (a4 ? 330 : 300), Math.round(34 * sx), "#07070a"); c.fillStyle = "#7a4a1e"; c.font = "500 " + Math.round(20 * sx) + "px " + FONT_TEKST; c.fillText(ROLE.organizator + ": BiegaMy", a4 ? 160 : 110, H - (a4 ? 302 : 270));   // ta sama rola co na stronie (ROLE), bez własnego opisu; bez pola na cudzy znak (organizatorem jest BiegaMy)
    return k;
  }
  /** ODZNAKA jako SVG (szkic): 'zwykla' (ceglasty medal) albo 'zlota' (złoty medal z gwiazdkami). W środku IKONA ŚWIATA ULICY (dla tej ulicy koparka, assets/ulica/koparka.webp),
   *  żeby odznaki z różnych ulic różniły się od siebie (przegląd 12.11). Ikona tylko z assets/, nazwa biegu z bazy (escapowana). */
  var IKONA_SWIATA = "assets/ulica/koparka.webp", _nrOdznaki = 0;
  /** Id gradientu i maski w SVG: z id uczestnika (o.id), więc kilka odznak na stronie ma różne id, a ta sama karta rysuje się tak samo; bez o.id kolejny numer (usterka 26). */
  function idOdznaki(rodzaj, o) {
    var z = String(o.id == null ? "" : o.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
    return "bo-" + (rodzaj === "zlota" ? "zlota" : "zwykla") + "-" + (z || "n" + (++_nrOdznaki));
  }
  function odznakaSvg(rodzaj, opcje) {
    var o = opcje || {}, zlota = rodzaj === "zlota", kolor = zlota ? "#f2b32a" : "#c8553d", kolor2 = zlota ? "#d89a12" : "#9a3b27", podpis = o.podpis || (zlota ? "ZŁOTA" : "BIEG"), rozmiar = Number(o.rozmiar) || 120;
    var ikona = typeof o.ikona === "string" && /^assets\/[a-z0-9\/_-]+\.(webp|png|svg)$/i.test(o.ikona) ? o.ikona : IKONA_SWIATA, id = idOdznaki(rodzaj, o);
    var tytul = esc(o.nazwa || "Odznaka biegu") + (zlota ? " (złota)" : "");
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 120 156" width="' + rozmiar + '" height="' + Math.round(rozmiar * 1.3) + '" role="img" aria-label="' + tytul + '">' +
      '<defs><linearGradient id="' + id + '-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + (zlota ? "#ffe08a" : "#e07a5f") + '"/><stop offset="1" stop-color="' + kolor + '"/></linearGradient><clipPath id="' + id + '-c"><circle cx="60" cy="100" r="33"/></clipPath></defs>' +
      '<path d="M38 2h18l-6 56H44z" fill="#e8561e" stroke="#3a1d0a" stroke-width="3" stroke-linejoin="round"/><path d="M64 2h18L72 58H60z" fill="#3d5a99" stroke="#3a1d0a" stroke-width="3" stroke-linejoin="round"/>' +
      '<circle cx="60" cy="100" r="50" fill="url(#' + id + '-g)" stroke="#3a1d0a" stroke-width="4"/><circle cx="60" cy="100" r="40" fill="' + (zlota ? "#fff6d6" : "#fff7e6") + '" stroke="' + (zlota ? "#b8860b" : "#9a3b27") + '" stroke-width="2.5"/>' +
      '<image href="' + esc(ikona) + '" x="27" y="67" width="66" height="66" preserveAspectRatio="xMidYMid meet" clip-path="url(#' + id + '-c)"/>' +
      (zlota ? '<path d="M60 52l2.6 5.4 6 .8-4.3 4.1 1.1 5.9-5.4-2.9-5.4 2.9 1.1-5.9-4.3-4.1 6-.8z" fill="#fff2c2" stroke="#7a5a10" stroke-width="1.5" stroke-linejoin="round"/><path d="M22 92l1.8 3.7 4 .5-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.5z" fill="#fff2c2" stroke="#7a5a10" stroke-width="1.2"/><path d="M98 92l1.8 3.7 4 .5-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.5z" fill="#fff2c2" stroke="#7a5a10" stroke-width="1.2"/>' : "") +
      '<rect x="22" y="126" width="76" height="18" rx="5" fill="' + kolor2 + '" stroke="#3a1d0a" stroke-width="2.5"/><text x="60" y="139" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="800" font-size="10" letter-spacing="1.5" fill="#fff7e6">' + esc(podpis) + '</text></svg>';
  }

  /* ── ETAP 2: WYNIK W KARCIE UCZESTNIKA (20261126_akcja_bieg_wyniki) ──
     „ja”: wynik z treningu (automat przy wejściu na stronę i z crona; „Wskaż inny trening” z listy treningów z okresu biegu; wpis ręczny = trening z formularza na Dziś).
     Dziecko: rodzic wpisuje „swój dystans”, bez czasu. Po wyniku: dyplom (telefon i A4) i odznaka. Czas widać tylko tutaj, na własnym dyplomie. */
  var ADRES_DZIS = "zawodnik.html#log";
  /** 'przed' (wynik jeszcze nie), 'brak' (można dopisać), 'gotowy' (ukończony), 'zamkniety' (po terminie, bez wyniku). */
  function stanWyniku(u, bieg) {
    if (u && u.ukonczony_at) return "gotowy";
    if (u && u.wynik_usuniety === true) return "usuniety";   /* 20261206: wynik usunięty przez organizatora (§ 9 ust. 3–4), bez dyplomu; automat go nie przywraca */
    var f = faza(bieg);
    return f === "trwa" || f === "wyniki" ? "brak" : f === "zakonczony" ? "zamkniety" : "przed";
  }
  /** „10 km · 58:00 · 5:48 /km” (dorosły z czasem), „10 km” (bez czasu), „1,5 km · swój dystans” (dziecko). */
  /** Dystans wyniku dorosłego: prawdziwy dystans treningu (wynik_trening_km z 20261203; 10 km przy biegu na 5 km), bez niego zaliczony dystans biegu. */
  function dystansWyniku(u) { return Number(u && (u.wynik_trening_km || u.wynik_dystans_km || u.dystans_km)) || 0; }
  /** Trening dłuższy niż dystans biegu + 0,49 km: ukończenie jest, w rankingu go nie ma (decyzja 17.11; od 20261206 także wpis ręczny). */
  function zaDlugiDoRankingu(u) { var t = Number(u && u.wynik_trening_km) || 0, d = Number(u && u.wynik_dystans_km) || 0; return !!u && u.rodzaj !== "dziecko" && d > 0 && t > d + 0.49; }
  function wynikOpis(u) {
    if (u.rodzaj === "dziecko") return km(u.dystans_wlasny_km) + " km · swój dystans";
    var d = dystansWyniku(u), s = Number(u.wynik_s) || 0;
    return liczba(d, 2) + " km" + (s ? " · " + czas(s) + " · " + tempo(s, d) : "");
  }
  /** Dystans dziecka z pola: „1,5” albo „1.5” → 1.5; poza 0,1–100 km albo śmieci → null. */
  function kmZPola(t) {
    var s = String(t == null ? "" : t).trim().replace(",", ".");
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
    var n = Number(s);
    return n >= 0.1 && n <= 100 ? n : null;
  }
  /** Blok wyniku pod numerem (bez obrazów: dyplom rysuje strona na canvasie). info.brakTreningu = automat nie znalazł treningu. */
  function wynikHtml(u, bieg, info) {
    var st = stanWyniku(u, bieg), dziecko = u.rodzaj === "dziecko", id = esc(u.id), o = info || {}, h = '<div class="bw-wynik" data-wynik-stan="' + st + '">';
    if (st === "gotowy") {
      h += '<p class="bw-wynik-tytul">' + (dziecko ? "Ukończone" : "Ukończony") + ': <b>' + esc(wynikOpis(u)) + '</b></p>';
      h += '<img class="bw-obraz" data-dyplom="' + id + '" alt="Dyplom ' + esc(u.imie) + '">';
      h += '<div class="bw-wiersze"><button type="button" class="bw-przycisk" data-dyplom-udostepnij="' + id + '">Udostępnij dyplom</button><button type="button" class="bw-przycisk bw-przycisk--cichy" data-dyplom-a4="' + id + '">Dyplom A4</button></div>';
      h += '<div class="bw-wynik-odznaka">' + odznakaSvg(u.odznaka === "zlota" ? "zlota" : "zwykla", { nazwa: bieg && bieg.nazwa, rozmiar: 64, id: u.id }) + '<span>Odznaka biegu jest już w ' + (dziecko ? "Twojej kolekcji (odznaka dziecka)" : "Twojej kolekcji") + '.</span></div>';
      if (faza(bieg) === "trwa" || faza(bieg) === "wyniki") h += dziecko ? '<a href="#" class="bw-link-maly" data-dziecko-popraw="' + id + '">Popraw dystans</a>' : '<a href="#" class="bw-link-maly" data-wskaz="' + id + '">Wskaż inny trening</a>';
      if (!dziecko && !u.wynik_s) h += '<p class="bw-drobne">Czas nie wszedł z treningu, więc dyplom pokazuje kilometry.</p>';
      if (!dziecko && u.wynik_reczny === true) h += '<p class="bw-drobne" data-wynik-reczny>' + esc(TEKSTY.wynik_reczny) + '</p>';   // 20261206: wynik ręczny w rankingu z dopiskiem
      if (!dziecko && u.do_weryfikacji === true && u.weryfikacja == null) h += '<p class="bw-drobne" data-wynik-weryfikacja>' + esc(TEKSTY.wynik_weryfikacja) + '</p>';
      if (!dziecko && u.weryfikacja === "odrzucony") h += '<p class="bw-drobne bw-odrzucony" data-wynik-odrzucony>' + esc(TEKSTY.wynik_odrzucony) + ' <a href="mailto:' + esc(KONTAKT) + '">' + esc(KONTAKT) + '</a>.</p>';
      if (zaDlugiDoRankingu(u)) h += '<p class="bw-drobne" data-wynik-za-dlugi>' + esc(wypelnij(TEKSTY.wynik_za_dlugi, { gorna: liczba(Number(u.wynik_dystans_km) + 0.49, 2) })) + '</p>';
      return h + '</div>';
    }
    if (st === "usuniety") {
      h += '<p class="bw-wynik-tytul" data-wynik-usuniety>' + (dziecko ? "Organizator usunął wynik dziecka" : "Organizator usunął Twój wynik") + '</p>';
      if (u.wynik_usuniety_powod) h += '<p class="bw-opis">Powód: ' + esc(u.wynik_usuniety_powod) + '</p>';
      return h + '<p class="bw-drobne">' + esc(TEKSTY.wynik_usuniety) + ' <a href="mailto:' + esc(KONTAKT) + '">' + esc(KONTAKT) + '</a>.</p></div>';
    }
    if (st === "przed") return h + '<p class="bw-opis">' + (dziecko ? "Po biegu wpiszesz tu, ile " + esc(u.imie) + " przeszło lub przebiegło." : "Po biegu wynik wejdzie tu sam z zegarka albo z treningu dopisanego na Dziś.") + '</p></div>';
    if (st === "zamkniety") return h + '<p class="bw-opis">Bieg zakończony bez wyniku. Jeśli to pomyłka, napisz do organizatora: <a href="mailto:' + esc(KONTAKT) + '">' + esc(KONTAKT) + '</a>.</p></div>';   // usterka 25: z adresem
    if (dziecko) {
      return h + '<p class="bw-wynik-tytul">Ile ' + esc(u.imie) + ' przeszło lub przebiegło?</p>' +
        '<label class="bw-pole bw-pole--km"><span>Swój dystans w km (np. 1,5)</span><input type="text" inputmode="decimal" maxlength="6" data-dziecko-km="' + id + '" placeholder="1,5"></label>' +
        '<button type="button" class="bw-przycisk" data-dziecko-zapisz="' + id + '">Zapisz dystans i odbierz dyplom ›</button><p class="bw-blad" role="alert" data-dziecko-blad="' + id + '"></p></div>';
    }
    var dni = zakresDni(bieg && bieg.dzien_od, bieg && bieg.dzien_do), mniejszy = krotszyDystans(bieg, u.dystans_km);
    h += '<p class="bw-wynik-tytul">' + (o.brakTreningu ? "Nie widzimy jeszcze treningu z " + esc(dni) + " na co najmniej " + esc(km(u.dystans_km)) + " km." : "Szukamy Twojego treningu z czasu biegu…") + '</p>';
    h += '<p class="bw-drobne">Trening z zegarka wejdzie sam. Bez zegarka dopisz bieg albo marsz na Dziś, z datą z czasu biegu (' + esc(dni) + '), i wróć tutaj.</p>';
    if (o.brakTreningu && mniejszy) h += '<p class="bw-drobne" data-rada-dystans>Masz mniej kilometrów? Wycofaj zapis i zapisz się na ' + esc(km(mniejszy)) + ' km.</p>';   // usterka 10: wynik wchodzi tylko z treningu ≥ zapisanego dystansu
    h += '<a class="bw-przycisk" href="' + ADRES_DZIS + '">Dopisz trening na Dziś ›</a>';
    h += '<div class="bw-wiersze"><button type="button" class="bw-przycisk bw-przycisk--cichy" data-wskaz="' + id + '">Wskaż trening</button><button type="button" class="bw-przycisk bw-przycisk--cichy" data-sprawdz="' + id + '">Sprawdź jeszcze raz</button></div>';
    return h + '<p class="bw-blad" role="alert" data-wynik-blad="' + id + '"></p></div>';
  }
  /** Najdłuższy dystans z listy biegu krótszy od zapisanego (zapis na 10 → 5), albo null (zapis na 5). */
  function krotszyDystans(bieg, zapisany) {
    var z = Number(zapisany) || 0, l = dystanseBiegu(bieg).filter(function (d) { return d < z; });
    return l.length ? Math.max.apply(null, l) : null;
  }
  /** Lista treningów z okresu biegu do „Wskaż trening”: data, km, czas, który dystans zalicza; za krótkie bez guzika. */
  function treningiHtml(lista, u) {
    var l = Array.isArray(lista) ? lista : [];
    if (!l.length) return '<p class="bw-opis">W czasie biegu nie ma Twoich treningów biegu ani marszu. Dopisz trening na Dziś albo poczekaj, aż wejdzie z zegarka.</p><a class="bw-przycisk" href="' + ADRES_DZIS + '">Dopisz trening na Dziś ›</a>';
    return '<ul class="bw-lista">' + l.map(function (t) {
      var zalicza = Number(t.zalicza_km) >= Number(u && u.dystans_km);
      return '<li class="bw-trening"><span><b>' + esc(liczba(t.km, 2)) + ' km</b>'   /* dokładnie (10,2), nie zaokrąglone jak w liczbach strony: obok „Zalicz 10 km” */ + (t.czas_s ? ' · ' + esc(czas(t.czas_s)) : "") + '<small>' + esc(dataPolska(dataZIso(t.dzien))) + (t.typ ? ' · ' + esc(t.typ) : "") + (t.z_zegarka === true ? ' · z zegarka' : t.z_zegarka === false ? ' · wpis ręczny' : "") + '</small></span>' +
        (zalicza ? '<button type="button" class="bw-przycisk bw-przycisk--maly" data-wybierz-trening="' + esc(t.id) + '">Zalicz ' + esc(km(t.zalicza_km)) + ' km</button>' : '<em>za krótki na ' + esc(km(u && u.dystans_km)) + ' km</em>') + '</li>';
    }).join("") + '</ul>';
  }
  /* ── KOMUNIKATY (przegląd frontu 13.11, usterki 5, 6, 27) ──
     Surowy błąd (TypeError, nazwa funkcji SQL) nigdy nie trafia na ekran: bladRpc zostawia tylko kod i znak „sieć”, treść idzie do client_errors (bieg.html).
     Każdy kod odmowy z funkcji, które woła strona, ma własny tekst (test blizna-241 wyciąga kody z migracji). */
  var TEKST_SIEC = "Brak połączenia. Sprawdź internet i spróbuj jeszcze raz.", TEKST_ZALOGUJ = "Potrzebne konto zawodnika: dokończ zakładanie konta w aplikacji albo zaloguj się na konto zawodnika.", TEKST_INNY = "Nie udało się. Spróbuj za chwilę.";
  var RE_SIEC = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network/i;
  /** Błąd z supabase-js albo wyjątek → { ok:false, powod:'blad', kod, siec } bez treści błędu. offline = navigator.onLine === false. */
  function bladRpc(e, offline) {
    var kod = e && e.code ? String(e.code) : "", tresc = String((e && (e.message || e)) || "");
    return { ok: false, powod: "blad", kod: kod, siec: !!offline || (!kod && RE_SIEC.test(tresc)) };
  }
  function komunikatBledu(r) { return r && r.siec ? TEKST_SIEC : r && r.kod === "42501" ? TEKST_ZALOGUJ : TEKST_INNY; }
  var KOMUNIKATY = {
    zamkniete: "Zapisy są już zamknięte.", regulamin: "Regulamin się zmienił. Odśwież stronę i zaznacz nową wersję.", imie: "Imię: jedno słowo, 2–20 liter.",
    oswiadczenie: "Potrzebne oświadczenie rodzica.", nie_ma: "Nie ma takiego biegu.", limit_zapisow: "Limit zapisów na to konto w tym biegu został wykorzystany.", brak_zapisu: "Najpierw zapisz się na bieg.",
    nie_twoj: "To nie jest Twój zapis.", juz_wycofany: "Ten zapis jest już wycofany.", ukonczony: "Ten zapis ma już wynik, nie można go wycofać.",
    tylko_test: "Bieg próbny jest tylko dla kont testowych."
  };
  /** Odmowy zapisu, dziecka, wycofania i zgód. miejsce 'karta' = przełącznik rankingu w karcie, który sam się odznacza (usterka 27: bez polecenia „odznacz”).
   *  bieg: odmowa 'dystans' przy kilku dystansach „Wybierz 5 albo 10 km.”, przy jednym (dystans ustawiony przez stronę) lista w bazie musiała się zmienić. */
  function komunikat(r, miejsce, bieg) {
    var p = r && r.powod;
    if (p === "dystans") return dystanseBiegu(bieg).length > 1 ? "Wybierz " + dystanseKrotko(dystanseBiegu(bieg), "albo") + "." : "Dystans biegu się zmienił. Odśwież stronę.";
    if (p === "juz_zapisany") return "Już masz zapis w tym biegu (numer " + (r.numer || "") + ").";
    if (p === "limit") return "Limit dzieci na konto: " + (r.limit || ZASADY.limit_dzieci) + ".";
    if (p === "ranking_wiek") return miejsce === "karta" ? "Ranking jest tylko dla osób pełnoletnich." : "Ranking jest tylko dla osób pełnoletnich. Odznacz zgodę na ranking.";
    if (p && Object.prototype.hasOwnProperty.call(KOMUNIKATY, p)) return KOMUNIKATY[p];
    return komunikatBledu(r);
  }
  function komunikatWyniku(r) {
    var p = r && r.powod;
    return p === "brak_treningu" ? "Ten trening nie zalicza dystansu albo nie jest z czasu biegu." : p === "poza_oknem" ? "Wyniki przyjmujemy od startu biegu do końca dopisywania wyników." :
      p === "dystans" ? "Wpisz dystans od 0,1 do 100 km." : p === "nie_twoj" ? "To nie jest Twój zapis." : p === "nie_ma" ? "Nie znaleźliśmy tego zapisu. Odśwież stronę." :
      p === "usuniety" ? "Organizator usunął wynik w tym biegu (§ 9 regulaminu). Jeśli to pomyłka, napisz do organizatora: " + KONTAKT + "." : komunikatBledu(r);
  }
  /** Wszystko, co rysuje dyplom (20261206): inny podpis = inny dyplom. Klucz karty w bieg.html i nazwa pliku idą za wynikiem, więc po zmianie wyniku nie zostaje stary obraz. */
  function podpisDyplomu(u, bieg) {
    var x = u || {}, b = bieg || {};
    return [x.id, x.imie, x.numer, x.rodzaj, x.odznaka, x.ukonczony_at, x.wynik_s, x.wynik_dystans_km, x.wynik_trening_km, x.dystans_km, x.dystans_wlasny_km, b.nazwa, b.dzien_od, b.dzien_do]
      .map(function (v) { return v == null ? "" : String(v); }).join("|");
  }
  /** „dyplom-ab12cd34-k3f9a1.png”: 8 znaków id uczestnika i skrót wyniku. Ten sam wynik = ta sama nazwa; po poprawce nowy plik nie myli się ze starym w Pobranych. */
  function nazwaPlikuDyplomu(u, format, bieg) {
    var s = podpisDyplomu(u, bieg), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return "dyplom-" + (format === "a4" ? "a4-" : "") + String((u && u.id) || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 8) + "-" + h.toString(36).slice(0, 6) + ".png";
  }
  /** „Wycofaj” (usterka 6): potwierdzenie, jedno zapytanie na raz dla zapisu (kliknięcie w trakcie nic nie wysyła), polski tekst odmowy i odświeżenie strony
   *  także po odmowie (cron co godzinę zalicza wyniki, więc zapis mógł w tym czasie zostać ukończony). z = { potwierdz(t), rpc(nazwa, args), pokaz(t), odswiez() }. */
  var _wycofywane = {};
  /** „Wycofać zapis: Alfa, numer 2? Numer startowy przepada.” (usterka z próby 16.11: bez imienia łatwo wycofać nie to dziecko). Bez danych uczestnika pytanie ogólne. */
  function pytanieWycofania(kto) { return kto && kto.imie && kto.numer != null ? "Wycofać zapis: " + kto.imie + ", numer " + kto.numer + "? Numer startowy przepada." : "Wycofać ten zapis? Numer startowy przepada."; }
  /** Link „Wycofaj” w karcie uczestnika: imię i numer w treści i w aria-label, id tego samego uczestnika. */
  function linkWycofaniaHtml(u) { var opis = "Wycofaj zapis: " + u.imie + ", numer " + u.numer; return '<a href="#" class="bw-link-maly" data-wycofaj="' + esc(u.id) + '" aria-label="' + esc(opis) + '">' + esc(opis) + '</a>'; }
  function wycofaj(id, z, kto) {
    if (!id || _wycofywane[id]) return Promise.resolve({ ok: false, powod: "w_toku" });
    if (!z.potwierdz(pytanieWycofania(kto))) return Promise.resolve({ ok: false, powod: "anulowane" });
    _wycofywane[id] = true;
    var koniec = function (r) { delete _wycofywane[id]; return r; };
    return Promise.resolve().then(function () { return z.rpc("akcja_bieg_wycofaj", { p_id: id }); }).then(null, function (e) { return bladRpc(e); }).then(function (r) {
      if (!r || !r.ok) z.pokaz(komunikat(r || bladRpc(null)));
      return Promise.resolve().then(z.odswiez).then(function () { return koniec(r); }, function () { return koniec(r); });
    });
  }
  /* ── POLA KARTY PRZY PRZERYSOWANIU (usterka 9): wpisany dystans dziecka i komunikaty pod uczestnikiem zostają po powrocie do karty ── */
  var POLA_KARTY = ["data-dziecko-km", "data-ranking-stan"];   // bez pól błędów: po zmianie stanu stary komunikat (np. „Brak połączenia”) nie może wrócić pod nowy
  function kazdePole(korzen, f) {
    if (!korzen || !korzen.querySelectorAll) return;
    POLA_KARTY.forEach(function (a) { Array.prototype.forEach.call(korzen.querySelectorAll("[" + a + "]"), function (el) { var id = el.getAttribute(a); if (id) f(a, id, el); }); });
  }
  /** Zapis pól przed innerHTML: klucz = atrybut i id uczestnika, wartość = wpisany tekst (pole) albo treść komunikatu. */
  function zapiszPola(korzen) {
    var zapis = {};
    kazdePole(korzen, function (a, id, el) { var w = a === "data-dziecko-km" ? el.value : el.textContent; if (w) zapis[a + "=" + id] = String(w); });
    return zapis;
  }
  /** Odtworzenie po innerHTML: tylko value i textContent (bez HTML), tylko u tego samego uczestnika. */
  function odtworzPola(korzen, zapis) {
    if (!zapis) return;
    kazdePole(korzen, function (a, id, el) { var k = a + "=" + id; if (!Object.prototype.hasOwnProperty.call(zapis, k)) return; if (a === "data-dziecko-km") el.value = zapis[k]; else el.textContent = zapis[k]; });
  }
  /** Imię do pola w oknie zapisu z profilu konta (usterka 22): pierwsze słowo, z wielkiej litery, tylko gdy przechodzi walidację jak w bazie; inaczej "". */
  function imieDoPola(sesja) { var m = sesja && sesja.user && sesja.user.user_metadata; return imieZProfilu(m && (m.full_name || m.name)); }
  /** Rezygnacja z e-maila (EF bieg-rezygnacja: 200 ok, 400 zly_link, 404 nie_ma, 503 blad). Usterka 21: awaria serwera to nie „link nieaktualny”; bez „już użyty”. */
  function komunikatRezygnacji(status, d) {
    if (d && d.ok) return "Gotowe. Nie wyślemy już e-maili o biegu „" + String(d.nazwa || "") + "”.";
    if (!d || d.powod === "blad" || Number(status) >= 500) return "Nie udało się teraz. Za chwilę kliknij link z e-maila jeszcze raz.";
    return "Ten link jest nieaktualny. Zgodę zmienisz też po zalogowaniu, w sekcji „Twój bieg”.";
  }
  /** Rezygnacja z e-maila z linku: ?rezygnacja=<uuid> → token albo "". */
  function tokenRezygnacji(search) { var m = /[?&]rezygnacja=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:&|$)/i.exec(String(search || "")); return m ? m[1].toLowerCase() : ""; }

  /* 18.11: plakat biegu. Pliki w publicznym kubełku bieg-plakaty (migracja 20261208, wgrywa organizator przez CLI), adres stały w kodzie, nie w bazie.
     ?v= obowiązkowe: sw.js trzyma /storage/v1/object/public/ cache-first; nowa wersja pliku = nowe ?v=. PDF z ?download= (pobranie, nie podgląd). */
  var PLAKAT_URL = "https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/bieg-plakaty/";
  var PLAKATY = { "bieg-mikolajki": { obraz: PLAKAT_URL + "bieg-mikolajki-plakat.webp?v=1", pdf: PLAKAT_URL + "bieg-mikolajki-plakat.pdf?v=1&download=plakat-wirtualny-bieg-mikolajkowy.pdf" } };
  var ADRES_BIEGU = "https://biegamy.run/bieg";
  /** 18.11: zdanie o wielu startach (krok 3 „Jak to działa”). Imię zbiórki w dopełniaczu z nazwy biegu z bazy („… dla <imię>”); bez niego zdanie bez imienia. */
  function zdanieWieleRazy(bieg) {
    var m = /\sdla\s+(\S+)\s*$/.exec(String((bieg && bieg.nazwa) || ""));
    return "Możesz biec wiele razy. Liczy się Twój najlepszy wynik z czasu biegu, a każdy kilometr " + (m ? "idzie dla " + m[1] : "liczy się do akcji") + ".";
  }
  /** Plakat biegu po slugu: { obraz, pdf } albo null (inne biegi, w tym próba, bez plakatu). */
  function plakatBiegu(slug) { var s = String(slug || ""); return Object.prototype.hasOwnProperty.call(PLAKATY, s) ? PLAKATY[s] : null; }

  g.BM_BIEG_REAL = { ROLE: ROLE, ZASADY: ZASADY, TEKSTY: TEKSTY, TEKSTY_GOTOWE: TEKSTY_GOTOWE, FAZY: FAZY, KONTAKT: KONTAKT, PLAKATY: PLAKATY, ADRES_BIEGU: ADRES_BIEGU, plakatBiegu: plakatBiegu, zdanieWieleRazy: zdanieWieleRazy,
    WERSJE_TEKSTOW: WERSJE_TEKSTOW, REGULAMIN_P2_V3: REGULAMIN_P2_V3, koniecBiegu: koniecBiegu, koniecZDniem: koniecZDniem, koniecKrotko: koniecKrotko, terminOpis: terminOpis, zdanieKoniecWyniku: zdanieKoniecWyniku, komunikatZmiany: komunikatZmiany,
    stanWyniku: stanWyniku, wynikOpis: wynikOpis, dystansWyniku: dystansWyniku, zaDlugiDoRankingu: zaDlugiDoRankingu, zakresRankingu: zakresRankingu, kmZPola: kmZPola, wynikHtml: wynikHtml, treningiHtml: treningiHtml, komunikatWyniku: komunikatWyniku, tokenRezygnacji: tokenRezygnacji, ADRES_DZIS: ADRES_DZIS,
    zapisZablokowany: zapisZablokowany, naglowekStanu: naglowekStanu, poleEmailaWidoczne: poleEmailaWidoczne, przedMailem: przedMailem, zLimitem: zLimitem, bladRpc: bladRpc, komunikat: komunikat, wycofaj: wycofaj,
    pytanieWycofania: pytanieWycofania, linkWycofaniaHtml: linkWycofaniaHtml, zapiszPola: zapiszPola, odtworzPola: odtworzPola, imieDoPola: imieDoPola, komunikatRezygnacji: komunikatRezygnacji, dataNaDyplomie: dataNaDyplomie, krotszyDystans: krotszyDystans,
    WERSJA_TEKSTOW: WERSJA_TEKSTOW, DANE_ADMINISTRATORA: DANE_ADMINISTRATORA, REGULAMIN: REGULAMIN, TEKSTY_KROTKIE: TEKSTY_KROTKIE, wartosciTekstow: wartosciTekstow, brakiTekstow: brakiTekstow, dataZDniem: dataZDniem, wypelnij: wypelnij, regulaminBloki: regulaminBloki, regulaminTekst: regulaminTekst,
    esc: esc, liczba: liczba, km: km, forma: forma, odmiana: odmiana, czas: czas, tempo: tempo, dataPolska: dataPolska, zakresDni: zakresDni, zakresSlowny: zakresSlowny, ladneImie: ladneImie, imieZProfilu: imieZProfilu, bezRuchu: bezRuchu,
    faza: faza, fazaInfo: fazaInfo, zapisyOtwarte: zapisyOtwarte, stanStrony: stanStrony, mozeDopisacDziecko: mozeDopisacDziecko,
    dystanseBiegu: dystanseBiegu, dystanseSlownie: dystanseSlownie, dystanseKrotko: dystanseKrotko, tekstyDystansow: tekstyDystansow, dystanseHtml: dystanseHtml, wyborDystansuHtml: wyborDystansuHtml, dystansZapisu: dystansZapisu,
    liczbyHtml: liczbyHtml, wierszUkonczyl: wierszUkonczyl, ukonczyliHtml: ukonczyliHtml, zakladkiListyHtml: zakladkiListyHtml, wsparcieHtml: wsparcieHtml,
    numerStartowy: numerStartowy, dyplom: dyplom, podpisDyplomu: podpisDyplomu, nazwaPlikuDyplomu: nazwaPlikuDyplomu, odznakaSvg: odznakaSvg, IKONA_SWIATA: IKONA_SWIATA, konfettiPunkty: konfettiPunkty, tekstWSzer: tekstWSzer };
})(typeof globalThis !== "undefined" ? globalThis : window);
