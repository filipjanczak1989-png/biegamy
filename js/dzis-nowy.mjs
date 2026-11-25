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
//   (2) pamięć telefonu: klucz fr_skip_<id wpisu>, ten sam co stare Dziś, więc „Pomiń” na jednym ekranie działa na drugim.
//   Notatka nie nadpisuje istniejącego komentarza (wtedy pola notatki nie ma). Trzy zdania po zapisie co do słowa jak w starym (decyzja Filipa 19.08.2026).
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
//   Jedna rzecz naraz: problem z zegarkiem ma pierwszeństwo przed momentem.
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
// Zgłoszenia: client_errors, kind 'dzis-nowy', w treści sam etap, raz na stronę, adres bez parametrów (wzór radia, blizna-355).
// Plik BEZ import/export (globalThis.BM_DZIS), jak js/ulica.mjs. Zmiana tego pliku = nowa stała MODUL_V w bloku DZIS-E0 1 (blizna-336).
(function (w, d) {
  "use strict";
  var ETAP = "E1", IKONY = "assets/ui/dzis/ikony/", owiniete = false, zgloszone = {}, obserwatorzy = false;
  var ETAPY = ["modul", "start", "render", "klient", "profil", "akcja", "trening", "wpisy", "sesja", "odczucie", "wiadomosc"];
  var OKNO_WIADOMOSCI_DNI = 7, OKNO_ODCZUCIA_MS = 48 * 3600 * 1000, PODZIEKOWANIE_MS = 2600, MINY = ["great", "good", "mid", "bad"], jp = null;
  var LIMIT_MS = 10000, SWIEZE_MS = 60000, ILE_WPISOW = 6, PLAN = "kalendarz.html?role=athlete";
  var WOLNE = ["Odpoczynek", "Wolne", "Dzień wolny", "Rest"];
  var STARE_PRZYCISKI = ["today-bol-btn", "today-bol-czat", "today-bol-koniec", "today-bol-nadal", "today-nie-zrobilem"];   // jedyne stare elementy, które wolno kliknąć z kafla treningu
  var dane = { t: 0, nr: 0, profil: null, imie: "", odswieza: 0, wpisy: [], trener: null, trening: null, wiadomosc: null, pogoda: "" }, wstrzymane = false, czekaNaDom = false, owinietaSynchronizacja = false, owinietyZapis = false, owinietaPogoda = false, trenerWidziany = false, nasluchDokumentu = false;
  var PROFIL_KOLUMNY = "id,full_name,coach_id,intervals_athlete_id,intervals_connected_at,intervals_can_write,intervals_token_dead_at";
  var SKROTY = [["cialo", "Ciało", "hantla", "sekcja", "cwiczenia"], ["jedzenie", "Odżywianie", "jablko", "strona", "nutrition.html"], ["starty", "Starty", "flaga", "strona", "races.html"], ["wyzwania", "Wyzwania", "puchar", "strona", "wyzwania.html"],
    ["odznaki", "Odznaki", "medal", "strona", "odznaki.html"], ["radio", "Radio", "radio", "strona", "radio.html"], ["czat", "Czat", "dymek", "sekcja", "msgs"], ["gra", "Gra", "pad", "strona", "gra.html"]];
  var KAFLE = [["ulica", "Ulica"], ["trening", "Trening na dziś"], ["skroty", ""], ["ostatni", "Ostatni trening"], ["lista", "Twoje ostatnie treningi"]];

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

  function ikona(nazwa, px, klasa) {
    return '<img class="dn-ik' + (klasa ? " " + klasa : "") + '" src="' + IKONY + nazwa + '-64.webp" srcset="' + IKONY + nazwa + "-64.webp 64w, " + IKONY + nazwa + '-128.webp 128w" sizes="' + px +
      'px" width="' + px + '" height="' + px + '" alt="" aria-hidden="true" decoding="async" onerror="this.style.visibility=\'hidden\'">';
  }

  var CSS = "#dzis-nowy{padding:4px 16px 8px;color:#f5f3ef;font-family:'DM Sans',system-ui,sans-serif}" +
    "#dzis-nowy .dn-naglowek{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:6px 0 10px}#dzis-nowy .dn-naglowek > div:first-child{min-width:0}" +
    "#dzis-nowy .dn-rzad{display:flex;align-items:center;gap:8px;margin:0 0 12px}#dzis-nowy .dn-rzad .dn-zapytaj{flex:1;width:auto;min-width:0;margin:0}" +
    "#dzis-nowy .dn-awatar{flex:none;overflow:hidden;color:#f5f3ef;font:600 15px/1 'DM Sans',sans-serif;letter-spacing:.02em}#dzis-nowy .dn-awatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%}" +
    "#dzis-nowy .dn-trener{display:inline-flex;align-items:center;min-height:32px;margin:0 0 8px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,122,69,.4);background:rgba(196,74,19,.14);color:#ff7a45;font:500 11px/1 'DM Mono',monospace;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}" +
    "#dzis-nowy{position:relative}#dzis-nowy .dn-menu{position:absolute;right:16px;z-index:50;min-width:220px;max-width:calc(100% - 32px);margin-top:-6px;padding:8px;border-radius:16px;border:1px solid #2a2a30;background:#16161b;box-shadow:0 16px 40px rgba(0,0,0,.7)}" +
    "#dzis-nowy .dn-menu-kto{padding:8px 12px 10px;margin:0 0 6px;border-bottom:1px solid #2a2a30;color:#8f8c97;font:500 11px/1.3 'DM Mono',monospace;overflow-wrap:anywhere}" +
    "#dzis-nowy .dn-menu button,#dzis-nowy .dn-menu a{display:flex;align-items:center;width:100%;min-height:44px;padding:0 12px;border:0;border-radius:10px;background:none;color:#f5f3ef;font:500 14px/1.2 'DM Sans',sans-serif;text-align:left;text-decoration:none;cursor:pointer}" +
    "#dzis-nowy .dn-menu a.dn-menu-cichy{color:#bcb8b2}#dzis-nowy .dn-menu button.dn-menu-wyloguj{color:#ff6b5e}" +
    "#dzis-nowy .dn-zegarek{display:flex;align-items:center}#dzis-nowy .dn-zegarek .wc-badge{width:48px;height:48px;opacity:1}" +
    "#dzis-nowy .dn-zd{margin:0 0 12px}#dzis-nowy .dn-zd .wc-pasek{margin:0!important}" +
    "#dzis-nowy .dn-moment{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:8px 16px;border-radius:16px;border:1px solid rgba(255,122,69,.55);background:rgba(196,74,19,.14);color:#f5f3ef;font:600 15px/1.25 'DM Sans',sans-serif;text-align:left;cursor:pointer}" +
    "#dzis-nowy .dn-moment svg{flex:none;stroke:#ff7a45}#dzis-nowy .dn-moment span{flex:1;min-width:0}#dzis-nowy .dn-moment small{display:block;margin-top:2px;color:#bcb8b2;font:400 13px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-moment i{flex:none;font-style:normal;color:#ff7a45;font-size:20px;line-height:1}#dzis-nowy .dn-moment:active{transform:scale(.99)}" +
    "#dzis-nowy .dn-data{font:500 11px/1.4 'DM Mono',monospace;letter-spacing:.22em;text-transform:uppercase;color:#bcb8b2}" +
    "#dzis-nowy .dn-powitanie{margin:2px 0 0;font:400 34px/1 'Bebas Neue','DM Sans',sans-serif;letter-spacing:.02em;text-transform:uppercase;color:#f5f3ef;overflow-wrap:anywhere}" +
    "#dzis-nowy .dn-akcje{display:flex;align-items:center;gap:8px;flex:none}" +
    "#dzis-nowy .dn-okr{position:relative;width:48px;height:48px;border-radius:50%;border:1px solid #2a2a30;background:#0f0f13;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}" +
    "#dzis-nowy .dn-okr:active,#dzis-nowy .dn-zapytaj:active{transform:scale(.96)}" +
    "#dzis-nowy .dn-zapytaj{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;margin:0 0 12px;padding:0 16px 0 14px;border-radius:24px;text-align:left;border:1px solid #2a2a30;background:#0f0f13;color:#f5f3ef;font:600 14px/1 'DM Sans',sans-serif;cursor:pointer;white-space:nowrap}" +
    "#dzis-nowy .dn-zapytaj svg{flex:none;stroke:#bcb8b2}" +
    "#dzis-nowy .dn-licznik{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#c44a13;color:#fff;font:700 11px/20px 'DM Sans',sans-serif;text-align:center}" +
    "#dzis-nowy .dn-licznik[hidden]{display:none}" +
    "#dzis-nowy .dn-kafle{display:flex;flex-direction:column;gap:12px}" +
    "#dzis-nowy .dn-kafel{background:#0f0f13;border:1px solid #232329;border-radius:18px;padding:16px}" +
    "#dzis-nowy .dn-etykieta{font:500 11px/1.4 'DM Mono',monospace;letter-spacing:.2em;text-transform:uppercase;color:#ff7a45;margin:0 0 12px}" +
    "#dzis-nowy .dn-szkielet{display:block;height:14px;border-radius:7px;background:#1b1b21;margin:0 0 10px}" +
    "#dzis-nowy .dn-szkielet.k{width:55%}#dzis-nowy .dn-szkielet.w{height:44px;margin:14px 0 0}" +
    "#dzis-nowy .dn-skroty{display:flex;gap:6px;overflow-x:auto;padding:2px 0;scrollbar-width:none}" +
    "#dzis-nowy .dn-skroty::-webkit-scrollbar{display:none}" +
    "#dzis-nowy .dn-skrot{flex:1 0 56px;min-height:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:none;border:0;padding:4px 0;" +
    "color:#bcb8b2;font:500 11px/1.2 'DM Sans',sans-serif;text-decoration:none;cursor:pointer}" +
    "#dzis-nowy .dn-skrot .dn-krazek{width:48px;height:48px;border-radius:50%;background:#0f0f13;border:1px solid #232329;display:flex;align-items:center;justify-content:center}" +
    "#dzis-nowy .dn-stare{display:flex;align-items:center;justify-content:center;min-height:48px;margin:6px 0 0;color:#bcb8b2;font:500 13px/1 'DM Sans',sans-serif;text-decoration:none}" +
    "#dzis-nowy [hidden]{display:none!important}" +
    "#dzis-nowy .dn-gora{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:0 0 12px}#dzis-nowy .dn-gora .dn-etykieta{margin:0}" +
    "#dzis-nowy .dn-kto{margin:4px 0 0;color:#bcb8b2;font:500 13px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-link{flex:none;display:inline-flex;align-items:center;min-height:44px;margin:-14px -4px -14px 0;padding:0 4px;color:#ff7a45;font:600 13px/1 'DM Sans',sans-serif;text-decoration:none}" +
    "#dzis-nowy .dn-tytul{margin:0 0 6px;font:400 26px/1.05 'Bebas Neue','DM Sans',sans-serif;letter-spacing:.02em;text-transform:uppercase;color:#f5f3ef}" +
    "#dzis-nowy .dn-tekst{margin:0;color:#bcb8b2;font:400 14px/1.45 'DM Sans',sans-serif;overflow-wrap:anywhere}#dzis-nowy .dn-tekst b{color:#f5f3ef;font-weight:600}" +
    "#dzis-nowy .dn-ul-km{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}#dzis-nowy .dn-ul-km b{font:400 40px/1 'Bebas Neue','DM Sans',sans-serif;letter-spacing:.02em;color:#f5f3ef}" +
    "#dzis-nowy .dn-ul-km span{color:#bcb8b2;font:500 13px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-pasek{height:8px;border-radius:4px;background:#1b1b21;overflow:hidden;margin:10px 0}#dzis-nowy .dn-pasek i{display:block;height:100%;border-radius:4px;background:#c44a13}" +
    "#dzis-nowy .dn-plan{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap;margin:0 0 8px}#dzis-nowy .dn-tekst + .dn-plan,#dzis-nowy .dn-plan + .dn-plan,#dzis-nowy .dn-tekst + .dn-tytul{margin-top:14px}" +
    "#dzis-nowy .dn-typ{display:inline-block;padding:4px 10px;border-radius:999px;background:#1b1b21;color:#f5f3ef;font:600 12px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-cel{color:#f5f3ef;font:600 15px/1.3 'DM Sans',sans-serif}#dzis-nowy .dn-zrobione{color:#6fcf97;font:600 12px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-liczby{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}#dzis-nowy .dn-l{min-width:0}" +
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
    "#dzis-nowy .dn-jp-t{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:0 0 4px;color:#ff7a45;font:500 11px/1.4 'DM Mono',monospace;letter-spacing:.2em;text-transform:uppercase}" +
    "#dzis-nowy .dn-jp-t small{color:#8f8c97;font:400 12px/1.3 'DM Sans',sans-serif;letter-spacing:0;text-transform:none}" +
    "#dzis-nowy .dn-jp-kt{margin:0 0 10px;color:#f5f3ef;font:600 14px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-miny{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 0}" +
    "#dzis-nowy .dn-mina{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:64px;padding:8px 2px;border-radius:12px;border:1px solid #2a2a30;background:#16161b;color:#bcb8b2;font:500 11px/1.2 'DM Sans',sans-serif;cursor:pointer}" +
    "#dzis-nowy .dn-mina[aria-pressed=true]{border-color:#ff7a45;background:rgba(196,74,19,.18);color:#f5f3ef}" +
    "#dzis-nowy .dn-jp textarea{display:block;width:100%;box-sizing:border-box;min-height:60px;margin:10px 0 0;padding:11px 13px;border-radius:12px;border:1px solid #2a2a30;background:#0b0b0f;color:#f5f3ef;font:400 14px/1.4 'DM Sans',sans-serif;resize:vertical}" +
    "#dzis-nowy .dn-jp-akcje{display:flex;align-items:center;gap:8px;margin:10px 0 0}" +
    "#dzis-nowy .dn-jp-zapisz{flex:1;min-height:48px;border:0;border-radius:12px;background:#c44a13;color:#fff;font:700 14px/1 'DM Sans',sans-serif;cursor:pointer}#dzis-nowy .dn-jp-zapisz[disabled]{opacity:.6;cursor:default}" +
    "#dzis-nowy .dn-jp-pomin{min-height:48px;padding:0 14px;border:0;background:none;color:#bcb8b2;font:500 13px/1 'DM Sans',sans-serif;cursor:pointer}" +
    "#dzis-nowy .dn-jp-kom{margin:10px 0 0;color:#ff9a8a;font:500 13px/1.4 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-jp-ok{margin:16px 0 0;padding:14px 0 0;border-top:1px solid #232329;text-align:center}#dzis-nowy .dn-jp-ok b{display:block;color:#f5f3ef;font:700 14px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-jp-ok p{margin:4px 0 0;color:#bcb8b2;font:400 12px/1.5 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-glowny,#dzis-nowy .dn-drugi{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;margin:14px 0 0;border-radius:12px;font:700 14px/1 'DM Sans',sans-serif;cursor:pointer}" +
    "#dzis-nowy .dn-glowny{border:0;background:#c44a13;color:#fff}#dzis-nowy .dn-drugi{border:1px solid #2a2a30;background:#16161b;color:#f5f3ef;font-weight:600}" +
    "#dzis-nowy .dn-glowny:active,#dzis-nowy .dn-drugi:active{transform:scale(.99)}" +
    "#dzis-nowy .dn-dzialania:empty{display:none}#dzis-nowy .dn-ciche{display:flex;flex-wrap:wrap;justify-content:center;gap:0 4px;margin:8px 0 -6px}" +
    "#dzis-nowy .dn-cichy{min-height:44px;padding:0 12px;border:0;background:none;color:#bcb8b2;font:500 13px/1 'DM Sans',sans-serif;cursor:pointer}" +
    "#dzis-nowy .dn-bol{margin:14px 0 0;padding:12px 14px;border-radius:12px;border:1px solid rgba(232,184,64,.55);background:rgba(232,184,64,.07)}" +
    "#dzis-nowy .dn-bol b{display:block;color:#e8b840;font:600 13px/1.3 'DM Sans',sans-serif}#dzis-nowy .dn-bol p{margin:4px 0 0;color:#bcb8b2;font:400 13px/1.45 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-bol-akcje{display:flex;gap:8px;margin:10px 0 0}#dzis-nowy .dn-bol-akcje button{flex:1;min-height:44px;border-radius:10px;border:1px solid #3a3a44;background:none;color:#f5f3ef;font:600 13px/1 'DM Sans',sans-serif;cursor:pointer}" +
    "#dzis-nowy .dn-rada{display:block;width:100%;margin:12px 0 0;padding:12px 14px;border-radius:12px;border:1px solid #2a2a30;background:#16161b;color:#f5f3ef;text-align:left;cursor:pointer;font:400 14px/1.45 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-rada-kto{display:flex;justify-content:space-between;gap:10px;margin:0 0 4px;color:#8f8c97;font:500 11px/1.3 'DM Mono',monospace;letter-spacing:.06em}#dzis-nowy .dn-rada-kto b{color:#ff7a45;font-weight:500}" +
    "#dzis-nowy .dn-rada-t{display:block;overflow-wrap:anywhere}#dzis-nowy .dn-rada-w{display:block;margin:6px 0 0;color:#ff7a45;font:600 13px/1.2 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-ukryte{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}" +
    "html.dzis-gotowy.dzis-na-dzis body > .topbar,html.dzis-gotowy.dzis-na-dzis body > #okienko-pole{display:none!important}" +
    "@media (prefers-reduced-motion:reduce){#dzis-nowy .dn-okr:active,#dzis-nowy .dn-zapytaj:active,#dzis-nowy .dn-moment:active,#dzis-nowy .dn-glowny:active,#dzis-nowy .dn-drugi:active{transform:none}}";

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
            '<span class="dn-krazek">' + ikona(s[2], 28) + "</span><span>" + esc(s[1]) + "</span>" + (s[3] === "strona" ? "</a>" : "</button>");
        }).join("") + "</nav>";
      }
      return '<section class="dn-kafel" data-kafel="' + k[0] + '" aria-busy="true"><h2 class="dn-etykieta">' + esc(k[1]) + '</h2>' +
        '<span class="dn-szkielet"></span><span class="dn-szkielet k"></span>' + (k[0] === "trening" ? '<span class="dn-szkielet w"></span>' : "") +
        '<span class="dn-ukryte">Wczytuję…</span></section>';
    }).join("");
    return '<header class="dn-naglowek"><div><button type="button" class="dn-trener" data-dn="trener" hidden>← Trener</button><div class="dn-data" data-dn="data">' + esc(dataDzis()) + '</div><h1 class="dn-powitanie" data-dn="powitanie">' + esc(powitanie()) + "</h1></div>" +
      '<div class="dn-akcje"><span class="dn-zegarek" data-dn="zegarek" hidden></span>' +
      '<button type="button" class="dn-okr" data-dn="dzwonek" aria-label="Powiadomienia">' + ikona("dzwonek", 28) + '<span class="dn-licznik" data-dn="licznik" hidden></span></button></div></header>' +
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
    if (p) p.textContent = powitanie();
    if (da) da.textContent = dataDzis();
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
      else if (co === "rada") {   // jak „Napisz do trenera” w starej karcie: sekcja wiadomości, potem wątek trenera
        if (typeof w.showSection === "function") w.showSection("msgs");
        w.setTimeout(function () { try { if (typeof w.openChatThread === "function") w.openChatThread("coach", null, null); } catch (e2) {} }, 400);
      }
      else if (co === "zaloguj") { if (typeof w.openModal === "function") w.openModal(); }
      else if (co === "jp-mina") { jpWybierz(t.getAttribute("data-kod")); }
      else if (co === "jp-zapisz") { jpZapisz(false); }
      else if (co === "jp-pomin") { jpPomin(); }
      else if (co === "moment") { var stary = d.getElementById("moment-baner"); if (stary && stary.click) stary.click(); zdarzenie(); }
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
  /** Pasek zdarzenia pod nagłówkiem: jedna rzecz naraz. Pierwszy jest pasek problemu z zegarkiem (stary kod wstawia go do #watch-pasek-slot), potem moment. */
  function zdarzenie() {
    var el = czesc("zdarzenie"); if (!el) return;
    var org = d.getElementById("watch-pasek-slot"), html = org ? String(org.innerHTML || "").trim() : "";
    if (!html && momentCzeka()) html = MOMENT_HTML;
    if (el._dnHtml !== html) { el.innerHTML = html; el._dnHtml = html; }
    el.hidden = !html;
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
      z aktywnym zgłoszeniem ramka z poziomem, miejscem i „Już nie boli” (po 30 dniach także „Nadal boli”, jak w starym). */
  function bolHtml(teraz) {
    var box = d.getElementById("today-bol");
    if (!box) return { ramka: "", ciche: "" };
    var akt = w._aktywnaKontuzja;
    if (!akt || !jestStary("today-bol-koniec")) return { ramka: "", ciche: cichy("today-bol-btn", "Coś boli") + cichy("today-bol-czat", "Napisz do trenera") };
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
    var b = bolHtml(), ciche = wczorajHtml() + b.ciche;
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
  /** Cały kafel „Trening na dziś” z tego, co już wczytane: plan, wiadomość od trenera, pas działań. Woła go każda z dwóch odpowiedzi fali 2. */
  function rysujTrening() {
    if (!dane.trening) return;
    dane.pogoda = pogodaTekst();
    wpisz("trening", treningHtml(dane.trening, dane.pogoda) + radaHtml(dane.wiadomosc) + '<div class="dn-dzialania" data-dn="dzialania"></div>');
    var pas = czesc("dzialania"); if (pas) pas._dnHtml = null;
    dzialania();
  }
  /** Przerysowuje sam pas działań w kaflu treningu (stan starej karty zmienił się po zgłoszeniu, zamknięciu, wczytaniu). */
  function dzialania() {
    var el = czesc("dzialania"); if (!el) return;
    var h = dzialaniaHtml(); if (el._dnHtml !== h) { el.innerHTML = h; el._dnHtml = h; }
  }

  /* ── DANE ───────────────────────────────────────────────────────────────────────────────────────────────── */
  function liczba(n, m) { n = Number(n); if (!isFinite(n)) return "—"; var t = n.toFixed(m || 0).split("."), ul = (t[1] || "").replace(/0+$/, ""); return t[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (ul ? "," + ul : ""); }
  function km(x) { var n = Number(x); return isFinite(n) && n > 0 ? liczba(n, n < 10 ? 2 : 1) : "—"; }
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
  function gora(etykieta, kto, link) {
    return '<div class="dn-gora"><div><h2 class="dn-etykieta">' + esc(etykieta) + "</h2>" + (kto ? '<div class="dn-kto">' + esc(kto) + "</div>" : "") + "</div>" +
      (link ? '<a class="dn-link" href="' + esc(link[1]) + '">' + esc(link[0]) + " ›</a>" : "") + "</div>";
  }
  function wkladTekst(wklad) {
    if (!wklad) return "";
    var k = Number(wklad.km) || 0;
    return k > 0 ? "Twój wkład: <b>" + esc(liczba(k, k < 10 ? 1 : 0)) + " km</b>" : "Twój wkład: <b>0 km</b>. Spacer też buduje ulicę.";
  }
  /** Kafel Ulica: licznik akcji. d = akcja_licznik (po starcie), wklad = akcja_moj_wklad albo null. */
  function ulicaHtml(d, wklad, adres) {
    var suma = Number(d.suma_km) || 0, cel = Number(d.cel_km) || 0, p = Number(d.pct);
    p = Math.max(0, Math.min(100, isFinite(p) ? p : cel > 0 ? suma / cel * 100 : 0));
    return gora("Ulica", d.nazwa || "", adres ? ["Zobacz ulicę", adres] : null) +
      '<div class="dn-ul-km"><b>' + esc(liczba(suma, suma > 0 && suma < 10 ? 1 : 0)) + "</b><span>z " + esc(liczba(cel, 0)) + " km · " + esc(liczba(p, p < 10 ? 1 : 0)) + "%</span></div>" +
      '<div class="dn-pasek" role="progressbar" aria-label="Postęp ulicy" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(p) + '"><i style="width:' + p.toFixed(1) + '%"></i></div>' +
      '<p class="dn-tekst" data-dn="wklad">' + wkladTekst(wklad) + "</p>";
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
  function zPogoda(kto, pogoda) { return [kto, pogoda].filter(Boolean).join(" · "); }
  /** Kafel Trening na dziś. lista = wiersze trainings z dzisiejszą datą; pogoda = gotowa linia albo "". */
  function treningHtml(lista, pogoda) {
    lista = lista || [];
    if (!lista.length) return gora("Trening na dziś", zPogoda("bez planu", pogoda), ["Plan", PLAN]) + '<h3 class="dn-tytul">Dziś bez planu</h3><p class="dn-tekst">Każdy kilometr i tak się liczy.</p>' + zalogujHtml(false);
    var kto = lista[0].plan_source === "generator" ? "z generatora" : lista[0].coach_id ? "od trenera" : "";
    return gora("Trening na dziś", zPogoda(kto, pogoda), ["Plan", PLAN]) + lista.map(function (t) {
      if (WOLNE.indexOf(String(t.type || "").trim()) >= 0) return '<h3 class="dn-tytul">Dzień wolny</h3><p class="dn-tekst">' + esc(t.description || "Odpoczynek też buduje formę.") + "</p>";
      var cel = [], opis = String(t.description || "");
      if (Number(t.distance_km) > 0) cel.push(km(t.distance_km) + " km");
      if (Number(t.duration_min) > 0) cel.push(liczba(t.duration_min) + " min");
      if (tempo(t.pace) !== "—") cel.push(tempo(t.pace) + " /km");
      return '<div class="dn-plan">' + pigulka(t.type) + (cel.length ? '<span class="dn-cel">' + esc(cel.join(" · ")) + "</span>" : "") + (t.status === "done" ? '<span class="dn-zrobione">zrobione</span>' : "") + "</div>" +
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
  /** Kafel Ostatni trening: najnowszy wpis, z regułą 14 dni w podpisie. */
  function ostatniHtml(log, teraz) {
    if (!log) return gora("Ostatni trening", "", null) + '<h3 class="dn-tytul">Jeszcze pusto</h3><p class="dn-tekst">Tu pojawi się dystans, czas i tempo pierwszego treningu.</p>';
    var kd = kiedy(log.logged_at, teraz);
    return gora("Ostatni trening", String(log.training_type || "Trening") + (kd ? " · " + kd : ""), null) +
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
  /** Wpis, o który pytamy: najnowszy z zegarka (intervals), z ostatnich 48 h, bez odczucia, niepominięty. Warunki starej karty FEEL-REPORT. */
  function kandydatOdczucia(wpisy, teraz) {
    var t = teraz == null ? Date.now() : teraz;
    for (var i = 0; i < (wpisy || []).length; i++) {
      var l = wpisy[i], kiedyMs = l ? new Date(l.logged_at).getTime() : NaN;
      if (!l || !l.id || l.external_source !== "intervals" || l.feel != null) continue;
      if (!(t - kiedyMs <= OKNO_ODCZUCIA_MS)) continue;
      if (pominiety(l.id)) continue;
      return l;
    }
    return null;
  }
  function minaSvg(kod) { try { return typeof w.feelSvg === "function" ? String(w.feelSvg(kod, 22) || "") : ""; } catch (e) { return ""; } }
  /** Blok pod liczbami kafla. osobny = pytamy o inny wpis niż ten w kaflu, więc trzeba go nazwać. */
  function jakPoszloHtml(l, osobny, teraz) {
    var kd = kiedy(l.logged_at, teraz), opis = String(l.training_type || "Trening") + (kd ? " · " + kd : "") + (km(l.distance_km) !== "—" ? " · " + km(l.distance_km) + " km" : "");
    return '<div class="dn-jp" data-dn="jp"><div class="dn-jp-t">Jak poszło?<small>zegarek tego nie wie</small></div>' +
      (osobny ? '<div class="dn-jp-kt">' + esc(opis) + "</div>" : "") +
      '<div class="dn-miny">' + MINY.map(function (k) { return '<button type="button" class="dn-mina" data-dn="jp-mina" data-kod="' + k + '" aria-pressed="false">' + minaSvg(k) + "<span>" + esc(odczucie(k)) + "</span></button>"; }).join("") + "</div>" +
      (String(l.comment || "").trim() ? "" : '<textarea data-dn="jp-notatka" maxlength="1000" aria-label="Notatka do treningu" placeholder="Dodaj notatkę (opcjonalnie): jak nogi, co bolało, warunki…"></textarea>') +
      '<div class="dn-jp-akcje"><button type="button" class="dn-jp-zapisz" data-dn="jp-zapisz">Zapisz raport</button><button type="button" class="dn-jp-pomin" data-dn="jp-pomin">Pomiń</button></div>' +
      '<p class="dn-jp-kom" data-dn="jp-kom" role="status" hidden></p></div>';
  }
  /** Zdanie po zapisie: brzmienie ze starej karty co do słowa (decyzja Filipa 19.08.2026). zTrenerem = profil ma coach_id. */
  function podpisPoZapisie(kod, zTrenerem) {
    if (zTrenerem) return "Trener to zobaczy, a forma policzy się dokładniej.";
    return kod === "bad" ? "Zwolnij i przyjrzyj się regeneracji — a jeśli zmęczenie nie mija, to sygnał, żeby poszukać wsparcia trenera." : "Forma policzy się dokładniej.";
  }
  function jpCzesc(n) { var el = kafel("ostatni"); return el && el.querySelector ? el.querySelector('[data-dn="' + n + '"]') : null; }
  function jpKomunikat(tekst) { var el = jpCzesc("jp-kom"); if (el) { el.textContent = tekst || ""; el.hidden = !tekst; } }
  function jpBrudny() { var n = jpCzesc("jp-notatka"); return !!jp && (!!jp.kod || jp.zapisuje || !!(n && String(n.value || "").trim())); }
  /** Kafle „Ostatni trening” i lista z dane.wpisy. Gdy ktoś właśnie wybiera minę albo pisze notatkę do tego samego wpisu, kafla nie przerysowujemy. */
  function rysujWpisy(sb) {
    var l = dane.wpisy || [], kand = kandydatOdczucia(l);
    if (l.length > 1) wpisz("lista", listaHtml(l.slice(1))); else schowaj("lista");
    if (jp && kand && kand.id === jp.id && jpBrudny()) return;
    jp = kand ? { id: kand.id, kod: null, zapisuje: false, maKomentarz: !!String(kand.comment || "").trim(), sb: sb || (jp && jp.sb) || null } : null;
    wpisz("ostatni", ostatniHtml(l[0] || null) + (kand ? jakPoszloHtml(kand, kand !== l[0]) : ""));
  }
  function jpWybierz(kod) {
    if (!jp || jp.zapisuje || MINY.indexOf(kod) < 0) return;
    jp.kod = kod; jpKomunikat("");
    var el = kafel("ostatni"), miny = el && el.querySelectorAll ? el.querySelectorAll('[data-dn="jp-mina"]') : [];
    for (var i = 0; i < miny.length; i++) miny[i].setAttribute("aria-pressed", miny[i].getAttribute("data-kod") === kod ? "true" : "false");
  }
  function jpPomin() {
    if (!jp || jp.zapisuje) return;
    try { w.localStorage.setItem("fr_skip_" + jp.id, "1"); } catch (e) {}
    var sb = jp.sb; jp = null; rysujWpisy(sb);
  }
  /** Jedyny zapis do bazy w module. proba = ponowienie po odświeżeniu sesji (drugiego nie będzie). */
  function jpZapisz(proba) {
    if (!jp || (jp.zapisuje && !proba)) return;
    if (!jp.kod) { jpKomunikat("Wybierz, jak poszło."); return; }
    var stan = jp, sb = stan.sb || klient(), pole = jpCzesc("jp-notatka"), notatka = pole ? String(pole.value || "").trim() : "", guzik = jpCzesc("jp-zapisz");
    if (!sb) { jpKomunikat("Nie udało się zapisać. Spróbuj ponownie."); return; }
    var zmiana = { feel: stan.kod };
    if (notatka && !stan.maKomentarz) zmiana.comment = notatka;   // istniejącego komentarza nie nadpisujemy
    stan.zapisuje = true; jpKomunikat(""); if (guzik) guzik.disabled = true;
    pytaj(sb.from("training_logs").update(zmiana).eq("id", stan.id).select("id")).then(function (wiersze) {
      if (jp !== stan) return;
      if (!wiersze || wiersze.length !== 1) throw { autoryzacja: false };   // 200 z pustą tablicą = RLS nie przepuściło: to nie jest sukces
      for (var i = 0; i < dane.wpisy.length; i++) if (dane.wpisy[i] && dane.wpisy[i].id === stan.id) { dane.wpisy[i].feel = stan.kod; if (zmiana.comment) dane.wpisy[i].comment = zmiana.comment; }
      var blok = jpCzesc("jp");
      if (blok) { blok.className = "dn-jp-ok"; blok.innerHTML = "<b>Zapisane — dzięki!</b><p>" + esc(podpisPoZapisie(stan.kod, dane.trener === true)) + "</p>"; }
      w.setTimeout(function () { if (jp === stan) { jp = null; rysujWpisy(sb); } }, PODZIEKOWANIE_MS);
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
      var t = w.setTimeout(function () { zle(new Error("limit")); }, LIMIT_MS);
      Promise.resolve(q).then(function (r) { w.clearTimeout(t); if (r && r.error) zle({ autoryzacja: odmowaTokenu(r) }); else ok(r ? r.data : null); }, function () { w.clearTimeout(t); zle({ autoryzacja: false }); });
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
        if (!dn || !dn.wystartowala) { schowaj("ulica"); return; }
        wpisz("ulica", ulicaHtml(dn, null, adres));
        pW.then(function (wk) { if (nr !== dane.nr) return; var el = kafel("ulica"), p = el && el.querySelector ? el.querySelector('[data-dn="wklad"]') : null; if (p) p.innerHTML = wkladTekst(wk); });
      }, function (e) { if (przejete(sb, nr, e, proba)) return; schowaj("ulica"); zglosDane("akcja"); });
    } };
  }
  /** Fale danych. wymus = true pomija okno 60 s (przycisk „Spróbuj ponownie”); proba = true to ponowienie po odświeżeniu sesji (drugiego już nie będzie). */
  function wczytaj(wymus, proba) {
    var teraz = Date.now();
    if (!wymus && dane.t && teraz - dane.t < SWIEZE_MS) return;
    var sb = klient(), nr = ++dane.nr;
    dane.t = teraz;
    if (!sb) { zglosDane("klient"); schowaj("ulica"); bladKafla("trening", "Trening na dziś"); bladKafla("ostatni", "Ostatni trening"); schowaj("lista"); return; }
    dane.profil = Promise.resolve(sb.auth.getSession()).then(function (r) { return r && r.data && r.data.session && r.data.session.user ? r.data.session.user.id : null; }, function () { return null; }).then(function (uid) {
      if (nr !== dane.nr) return null;
      if (!uid) { dane.t = 0; return null; }   // bez sesji stary kod sam odsyła do logowania; okno 60 s zwolnione, żeby następny start() (initAuth) spróbował jeszcze raz
      /* FALA 1: profil, licznik akcji i mój wkład idą razem */
      var s0 = slugAkcji(null), a0 = s0 ? akcja(sb, nr, s0, s0, proba) : null;
      var pProfil = pytaj(sb.from("athletes").select(PROFIL_KOLUMNY).eq("user_id", uid).maybeSingle());
      if (!a0) schowaj("ulica");
      return pProfil.then(function (a) {
        if (nr !== dane.nr) return a;
        if (!a) { wstrzymane = true; stop(); return null; }   // konto bez wiersza zawodnika: pierwsze kroki zostają na starym ekranie
        dane.imie = String(a.full_name || ""); dane.trener = !!a.coach_id; odswiezNaglowek(); zegarek(a, nr);
        /* FALA 2: wszystko, co potrzebuje id zawodnika */
        var s1 = slugAkcji(a.id);
        if (a0 && s1 === s0) a0.pokaz(); else if (s1 && s0) akcja(sb, nr, s1, s0, proba).pokaz(); else schowaj("ulica");
        pytaj(sb.from("trainings").select("id,date,type,distance_km,duration_min,pace,description,status,plan_source,coach_id").eq("athlete_id", a.id).eq("date", kluczDnia()).order("created_at").limit(3))
          .then(function (t) { if (nr !== dane.nr) return; dane.trening = t || []; rysujTrening(); }, function (e) { if (przejete(sb, nr, e, proba)) return; dane.trening = null; bladKafla("trening", "Trening na dziś"); zglosDane("trening"); });
        if (a.coach_id) {
          pytaj(sb.from("messages").select("body,sent_at").eq("athlete_id", a.id).eq("sender", "coach").gte("sent_at", new Date(Date.now() - OKNO_WIADOMOSCI_DNI * 864e5).toISOString()).order("sent_at", { ascending: false }).limit(1))
            .then(function (m) { if (nr !== dane.nr) return; dane.wiadomosc = m && m[0] ? m[0] : null; rysujTrening(); }, function (e) { if (przejete(sb, nr, e, proba)) return; dane.wiadomosc = null; rysujTrening(); zglosDane("wiadomosc"); });
        } else dane.wiadomosc = null;
        pytaj(sb.from("training_logs").select("id,logged_at,training_type,distance_km,duration,pace,heart_rate,elevation_gain,feel,external_source,comment").eq("athlete_id", a.id).not("training_type", "like", "__badge__%").order("logged_at", { ascending: false }).limit(ILE_WPISOW))
          .then(function (l) {
            if (nr !== dane.nr) return; l = l || [];
            dane.wpisy = l;
            rysujWpisy(sb);
          }, function (e) { if (przejete(sb, nr, e, proba)) return; bladKafla("ostatni", "Ostatni trening"); schowaj("lista"); zglosDane("wpisy"); });
        return a;
      }, function (e) {
        if (przejete(sb, nr, e, proba)) return null;
        if (a0) a0.pokaz();   // licznik nie zależy od profilu: pokazujemy domyślną akcję
        bladKafla("trening", "Trening na dziś"); bladKafla("ostatni", "Ostatni trening"); schowaj("lista"); zglosDane("profil");
        return null;
      });
    });
  }

  function rysuj() {
    var k = korzen();
    try { k.innerHTML = szkieletHtml(); } catch (e) { zglos("render"); throw e; }
    k.setAttribute("data-etap", ETAP);
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
      if (k.getAttribute("data-etap") !== ETAP) {
        rysuj();
        if (k.addEventListener && !k._dnKlik) { k.addEventListener("click", klik); k._dnKlik = true; }
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
      if (!owinietaPogoda && typeof w._renderWeather === "function") {   // stary kod woła ją, gdy dojdą dane pogody (z sieci albo z pamięci karty)
        var orygPogoda = w._renderWeather;
        w._renderWeather = function () { var r = orygPogoda.apply(this, arguments); try { rysujTrening(); } catch (e) {} return r; };
        owinietaPogoda = true;
      }
      if (dane.trening && pogodaTekst() !== dane.pogoda) rysujTrening();   // dane pogody doszły, zanim dało się owinąć starą funkcję: kolejny start (initAuth) je dopisuje
      obserwuj();
      pokaz();
      zdarzenie();
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
    ulicaHtml: ulicaHtml, treningHtml: treningHtml, ostatniHtml: ostatniHtml, listaHtml: listaHtml, odczucie: odczucie, bolHtml: bolHtml, wczorajHtml: wczorajHtml, radaHtml: radaHtml, pogodaTekst: pogodaTekst, OKNO_WIADOMOSCI_DNI: OKNO_WIADOMOSCI_DNI, STARE_PRZYCISKI: STARE_PRZYCISKI, PROFIL_KOLUMNY: PROFIL_KOLUMNY, kandydatOdczucia: kandydatOdczucia, jakPoszloHtml: jakPoszloHtml, podpisPoZapisie: podpisPoZapisie, OKNO_ODCZUCIA_MS: OKNO_ODCZUCIA_MS, LIMIT_MS: LIMIT_MS, SWIEZE_MS: SWIEZE_MS, ILE_WPISOW: ILE_WPISOW };
})(window, document);
