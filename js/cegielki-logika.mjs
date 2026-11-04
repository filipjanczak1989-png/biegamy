// CEGIEŁKI: czysta logika gry bez ekranu (wyzwanie dnia, wyzwanie znajomego, odmiana, szyldy). Plik BEZ import/export (globalThis.BM_CEGIELKI), <script src> w grze, import w testach.
(function (g) {
  "use strict";

  /* Klatki arkusza H różnią się między postaciami: Kasia ma na początku dwie klatki sprintu, Filip nie. Sprint obu to cykl biegu + smugi w kodzie. */
  var KLATKI_H = { kasia: { zel: 2, aura: 3, magnes: 4, tarcza: 5 }, filip: { zel: 0, aura: 1, magnes: 2, tarcza: 3 } };
  /* Reakcje na przeszkody: [arkusz, klatka]. D = wywrotka, E = wpadki. */
  var REAKCJE = {
    kaluza: { kl: [["E", 0], ["E", 0], ["E", 1]], czas: 1.05 },
    pacholek: { kl: [["E", 2]], czas: 1.0 },
    worki: { kl: [["E", 3], ["E", 3], ["D", 5]], czas: 1.2 },
    inne: { kl: [["D", 0], ["D", 1], ["D", 2], ["D", 3], ["D", 4], ["D", 5]], czas: 1.35 },
    liscie: { kl: [["E", 4], ["E", 4], ["D", 5]], czas: 1.2 },
    rower: { kl: [["skok", 3], ["skok", 3], ["skok", 4], ["skok", 4], ["skok", 5]], czas: 1.35 },   // każda przeszkoda to wywrotka przez kierownicę
  };
  var NAZWY_TRIKOW = ["Nożyce", "Gwiazda", "Superman", "Strzała", "Machnięcie"];
  /* Premia za combo salt rośnie do ×5. Bez sufitu jedna sztuczka dawała 5 razy więcej niż dobra gra, a pułap wyniku na serwerze przestawał cokolwiek odsiewać. */
  var COMBO_MAKS = 5;

  /* SKLEPIK: płaci się WYŁĄCZNIE złotymi cegłami zebranymi w grze, nigdy pieniędzmi. Zwykłe cegły idą do wspólnego muru i nie są walutą. Ceny muszą się zgadzać z gra_kup w migracji (blizna-154).
     Koszulki i spodenki to przemalowanie arkuszy w kodzie, dodatki to obrazki przypinane na żywo w każdej klatce. Korony nie ma w gra_kup: nosi ją tylko czołówka rankingu dnia. */
  var SKLEP = [
    { id: "koszulka-czerwona", slot: "tulow", rodzaj: "koszulka", nazwa: "Czerwona koszulka", cena: 10, kolor: [224, 50, 58] },
    { id: "koszulka-niebieska", slot: "tulow", rodzaj: "koszulka", nazwa: "Niebieska koszulka", cena: 10, kolor: [38, 112, 226] },
    { id: "koszulka-zielona", slot: "tulow", rodzaj: "koszulka", nazwa: "Zielona koszulka", cena: 10, kolor: [32, 168, 88] },
    { id: "koszulka-fioletowa", slot: "tulow", rodzaj: "koszulka", nazwa: "Fioletowa koszulka", cena: 15, kolor: [136, 70, 222] },
    { id: "koszulka-zlota", slot: "tulow", rodzaj: "koszulka", nazwa: "Złota koszulka", cena: 50, kolor: [240, 182, 40] },
    { id: "kamizelka", slot: "tulow", rodzaj: "kamizelka", nazwa: "Kamizelka odblaskowa", cena: 25, kolor: [255, 138, 26], pasy: [246, 246, 226] },
    { id: "spodenki-czerwone", slot: "spodenki", rodzaj: "spodenki", nazwa: "Czerwone spodenki", cena: 8, kolor: [204, 44, 52] },
    { id: "spodenki-niebieskie", slot: "spodenki", rodzaj: "spodenki", nazwa: "Niebieskie spodenki", cena: 8, kolor: [34, 96, 200] },
    { id: "spodenki-zielone", slot: "spodenki", rodzaj: "spodenki", nazwa: "Zielone spodenki", cena: 8, kolor: [30, 148, 80] },
    { id: "spodenki-biale", slot: "spodenki", rodzaj: "spodenki", nazwa: "Białe spodenki", cena: 12, kolor: [226, 228, 232] },
    { id: "opaska", slot: "glowa", rodzaj: "dodatek", nazwa: "Opaska", cena: 10 },
    { id: "czapka-pompon", slot: "glowa", rodzaj: "dodatek", nazwa: "Czapka z pomponem", cena: 15 },
    { id: "kask-rowerowy", slot: "glowa", rodzaj: "dodatek", nazwa: "Kask rowerowy", cena: 25 },
    { id: "czapka-zlota", slot: "glowa", rodzaj: "dodatek", nazwa: "Złota czapka z daszkiem", cena: 40 },
    { id: "korona", slot: "glowa", rodzaj: "dodatek", nazwa: "Korona", cena: null, tylkoCzolowka: true },
    { id: "okulary", slot: "oczy", rodzaj: "dodatek", nazwa: "Okulary", cena: 20 },
    { id: "medal", slot: "szyja", rodzaj: "dodatek", nazwa: "Medal", cena: 30 },
    { id: "peleryna", slot: "plecy", rodzaj: "dodatek", nazwa: "Peleryna", cena: 60 },
  ];
  var SLOTY = ["tulow", "spodenki", "glowa", "oczy", "szyja", "plecy"];
  var KORONA_MIEJSCA = 10;
  /* Ułożenie dodatku względem przypięcia: szer w promieniach głowy, (kx, ky) punkt obrazka trafiający w przypięcie, (dx, dy) przesunięcie w promieniach, dx do przodu twarzy, dy w górę. */
  var DODATKI = {
    /* Biała czapka Filipa jest większa od głowy, więc na niej dodatek musi być szerszy i wyżej, żeby ją zakryć. */
    "kask-rowerowy": { punkt: "glowa", szer: 3.25, kx: 0.5, ky: 0.82, dx: -0.1, dy: 1.02, filip: { szer: 4.3, kx: 0.5, ky: 0.82, dx: -0.3, dy: 0.72 } },
    "czapka-pompon": { punkt: "glowa", szer: 3.0, kx: 0.5, ky: 0.92, dx: -0.1, dy: 0.98, filip: { szer: 3.9, kx: 0.5, ky: 0.92, dx: -0.3, dy: 0.62 } },
    "opaska": { punkt: "glowa", szer: 2.6, kx: 0.5, ky: 0.5, dx: -0.05, dy: 0.72, filip: { szer: 3.2, kx: 0.5, ky: 0.5, dx: -0.1, dy: 1.15 } },
    "czapka-zlota": { punkt: "glowa", szer: 3.3, kx: 0.4, ky: 0.86, dx: 0.1, dy: 1.02, filip: { szer: 4.4, kx: 0.4, ky: 0.86, dx: -0.1, dy: 0.72 } },
    "korona": { punkt: "glowa", szer: 2.9, kx: 0.5, ky: 0.92, dx: -0.05, dy: 1.35, filip: { szer: 3.3, kx: 0.5, ky: 0.92, dx: -0.1, dy: 2.1 } },
    "okulary": { punkt: "glowa", szer: 2.3, kx: 0.62, ky: 0.42, dx: 0.28, dy: 0.2 },
    "medal": { punkt: "szyja", szer: 1.45, kx: 0.5, ky: 0.08, dx: 0.3, dy: -0.25 },
    "peleryna": { punkt: "szyja", szer: 5.2, kx: 0.93, ky: 0.1, dx: -0.2, dy: 0, wTyl: true },
  };
  /* Koniec akcji i poziomy. Sumę liczy serwer z gra_wyniki, próg musi się zgadzać z gra_poziom w migracji (blizna-154). 20 to kilkaset rund. */
  var POZIOMY = [0, 100, 300, 800, 1600, 3200, 5600, 9000, 14000, 20000, 28000, 38000, 52000, 70000, 92000, 120000, 156000, 200000, 260000, 400000];
  var MUR_CEL = 12500000;
  function poziom(cegly) {
    var c = Number(cegly) || 0, n = 1;
    for (var i = 0; i < POZIOMY.length; i++) if (c >= POZIOMY[i]) n = i + 1;
    return n;
  }
  function postepPoziomu(cegly) {
    var c = Math.max(0, Number(cegly) || 0), n = poziom(c);
    if (n >= POZIOMY.length) return { poziom: n, procent: 100, brakuje: 0, nastepny: null };
    var od = POZIOMY[n - 1], ku = POZIOMY[n];
    return { poziom: n, procent: Math.floor((c - od) * 100 / (ku - od)), brakuje: ku - c, nastepny: n + 1 };
  }
  /* Postacie do odblokowania. tempo i skok względem zwykłego biegacza; sloty = co wolno założyć. Rower i koparka mają własne arkusze, bez przemalowania. Żadna nie ma związku z licznikiem akcji ani statystykami treningów. */
  /* FIZYKA SKOKU: jedno źródło dla silnika i dla wysokości przedmiotów (Filip 4.11: przedmioty liczone z zasięgu WYBRANEJ postaci). GLOWA + MARGINES to sięgnięcie ponad stopy przy zbieraniu. */
  var FIZYKA = { GRAW: 2300, SKOK: 780, SALTO_V: 640, GLOWA: 130, MARGINES: 16 };
  function wysokoscZPredkosci(v) { return v * v / (2 * FIZYKA.GRAW); }
  var SKOK_ROWERU = Math.sqrt(0.8);
  /* Podbicie: skok roweru + podbicie sięga tyle, co skok + salto biegacza. Skok jest niższy, więc drugi ruch daje więcej. */
  var PODBICIE_ROWERU = Math.sqrt(2 * FIZYKA.GRAW * (wysokoscZPredkosci(FIZYKA.SKOK) + wysokoscZPredkosci(FIZYKA.SALTO_V) - wysokoscZPredkosci(FIZYKA.SKOK * SKOK_ROWERU)));
  var POSTACIE = {
    kasia: { sloty: SLOTY },
    filip: { sloty: SLOTY },
    rowerzysta: { tempo: 1.1, skok: SKOK_ROWERU, podbicie: PODBICIE_ROWERU, sloty: ["oczy", "szyja", "plecy"], poziom: 10, wlasne: true },
    koparka: { tempo: 0.85, skacze: false, sloty: [], poziom: 20, zaMur: true, wlasne: true },
  };
  /** Czy postać otwarta: poziom z sumy cegieł albo (koparka) ukończony wspólny mur. */
  function odblokowana(id, cegly, mur) {
    var p = POSTACIE[id];
    if (!p) return false;
    if (!p.poziom) return true;
    return poziom(cegly) >= p.poziom || !!(p.zaMur && Number(mur) >= MUR_CEL);
  }
  /** Co postać sięga: skok = sam skok, ruch = skok + drugi ruch (salto albo podbicie), zwykly i maks = wysokość przedmiotu, którą jeszcze zbierze. Koparka nie skacze: zwykly bez łyżki, maks łyżką. */
  function zasiegPostaci(postac) {
    var p = POSTACIE[postac] || {}, F = FIZYKA, sieg = F.GLOWA + F.MARGINES;
    if (p.skacze === false) return { skok: 0, ruch: 0, zwykly: sieg, maks: KLATKI_KOPARKI.wysokosc + 40 + F.MARGINES };
    var skok = wysokoscZPredkosci(F.SKOK * (p.skok || 1)), ruch = skok + wysokoscZPredkosci(p.podbicie || F.SALTO_V * (p.skok || 1));
    return { skok: skok, ruch: ruch, zwykly: skok + sieg, maks: ruch + sieg };
  }
  /** Skala zwykłych łuków cegieł: tyle, ile skok tej postaci względem skoku biegacza. Koparka zbiera je łyżką, więc bez skali. */
  function skalaSkoku(postac) { var p = POSTACIE[postac] || {}; return p.skacze === false ? 1 : (p.skok || 1) * (p.skok || 1); }
  function lukCegiel(postac, i) { return skalaSkoku(postac) * (70 + 88 * (1 - (i * i) / 5.5)); }
  /** Złota cegła: 90% zasięgu najmocniejszego ruchu. Koparka: przy ziemi, do zgarnięcia łyżką. Mały budowniczy: wystarczy zwykły skok. */
  function wysokoscZlotej(postac, maly) {
    var z = zasiegPostaci(postac);
    if ((POSTACIE[postac] || {}).skacze === false) return 60;
    return maly ? z.zwykly * 0.85 : z.maks * 0.9;
  }
  /* Kask wysoko: wymaga najmocniejszego ruchu, sam skok nie sięgnie (Filip 4.11). Koparka sięga łyżką, Mały budowniczy ma być łatwy. */
  function wysokoscKasku(postac, maly) {
    if (maly) return 150;
    if ((POSTACIE[postac] || {}).skacze === false) return 170;
    var z = zasiegPostaci(postac);
    return Math.max(z.zwykly + FIZYKA.MARGINES, z.maks * 0.8);
  }
  /** Nazwa z podpisu w bazie: pierwsze słowo. Imienia nie ma w publicznym repo. */
  function imieZPodpisu(opis) {
    var s = typeof opis === "string" ? opis.trim().split(/\s+/)[0] : "";
    return s && s.length <= 14 ? s : "";
  }
  /* Start rundy z ulepszeniem: jednorazowo, za każdą rundę osobno, nic się nie odnawia samo. */
  var ULEPSZENIA = [{ id: "kask", nazwa: "Start z kaskiem", cena: 5 }, { id: "bidon", nazwa: "Start z bidonem", cena: 4 }];
  /* Rysunek postaci w koparce: licznik oddaje adres tylko po starcie i przy zgodzie. Tu ostatnie sito: wyłącznie adres podpisany z prywatnego kubełka, to samo co na guziku i ulicy. */
  var ADRES_RYSUNKU = /^https:\/\/afqojgkaveykxbltxzwm\.supabase\.co\/storage\/v1\/object\/sign\/akcja-wizerunek\/[A-Za-z0-9._-]+\.webp\?token=[A-Za-z0-9._-]+$/;
  function rysunekKoparki(licznik) {
    var u = licznik && licznik.wystartowala && licznik.koparka_url;
    return typeof u === "string" && ADRES_RYSUNKU.test(u) ? u : "";
  }
  /* Arkusz postaci w koparce: ten sam kubełek i ta sama reguła co rysunek. Klatki: jazda 1, jazda 2, zamach, uderzenie, zgarnianie, radość.
     Dotknięcie to zamach łyżką (Filip 4.11). Trafienie: przeszkoda w oknie przed koparką w chwili uderzenia, bonus cegieł. Spóźnienie: koparka staje, seria od zera. Pudło: przerwa, żeby stukanie bez przerwy się nie opłacało. */
  function arkuszKoparki(licznik) {
    var u = licznik && licznik.wystartowala && licznik.koparka_arkusz_url;
    return typeof u === "string" && ADRES_RYSUNKU.test(u) ? u : "";
  }
  var KLATKI_KOPARKI = { jazda: [0, 1], zamach: 2, uderzenie: 3, zgarnianie: 4, radosc: 5, ile: 6, zamach_s: 0.14, uderzenie_s: 0.16, zgarnianie_s: 0.32, okno: 175, bonus: 2, stop_s: 0.6, przerwa_s: 0.45, wysokosc: 150, zlota_przed: 90 };
  /* Tryb Mały budowniczy: wolniej, bez upadków, wywrotka zrzuca rzędy cegieł. Bez rankingu, rekordu i wyzwania dnia, bo to łatwiejsza gra. */
  var MALY_TEMPO = 0.72, MALY_CEGIEL_W_RZEDZIE = 8;
  /* Rowerzysta mija gracza co jakiś czas. Tylko wygląd: nie ma kolizji, nie daje cegieł, nie liczy się do niczego. Plik po zgodzie na piśmie, za przełącznikiem. */
  var ROWER = { plik: "assets/akcja/rowerzysta.webp", predkosc: 250, pierwszy: [7, 13], kolejny: [17, 27], wysokosc: 106 };

  /* Stałe zdanie przy murze, na końcu rundy i w sklepiku (Filip 4.11). Imię z licznika, po starcie; przed startem bez imienia, bo gra nie zdradza akcji. Żadnych kwot i przeliczników. */
  function dopelniacz(imie) {
    var s = String(imie || "").trim();
    if (!s) return "";
    if (/ek$/i.test(s)) return s.slice(0, -2) + "ka";
    if (/a$/i.test(s)) return s.slice(0, -1) + "y";
    return s + "a";
  }
  function zdanieOZbiorce(imie) {
    var im = dopelniacz(imie);
    return "Cegiełki w grze to zabawa, nie pieniądze. " + (im ? "Wpłacić na " + im + " możesz tylko na zbiórce" : "Wpłacić możesz tylko na zbiórce");
  }
  /* Serwer przyjmuje tylko ten adres (akcja_url_zbiorki). Gracz bez konta nie ma sb.js, więc sito jest tutaj. */
  function linkZbiorki(url) {
    return typeof url === "string" && /^https:\/\/www\.siepomaga\.pl\/[^\s"'<>\\]*$/.test(url) ? url : "";
  }
  function liczba(n) { return Number(n || 0).toLocaleString("pl-PL"); }
  function tekstMuru(ile, cel) { return "Wspólny mur: " + liczba(ile) + " z " + liczba(cel) + " cegieł"; }
  /** Pasek muru: procent z góry ograniczony; każda dołożona cegła ma być widoczna, więc najmniej 1 %. */
  function procentMuru(ile, cel) {
    var i = Number(ile) || 0, c = Number(cel) || 0;
    if (!(i > 0) || !(c > 0)) return 0;
    return Math.max(1, Math.min(100, i * 100 / c));
  }
  function odmianaZlotych(n) {
    var r10 = n % 10, r100 = n % 100;
    return n === 1 ? "złota cegła" : (r10 >= 2 && r10 <= 4 && !(r100 >= 12 && r100 <= 14)) ? "złote cegły" : "złotych cegieł";
  }

  /** Strój z zapisu: tylko przedmioty, które gracz ma, i każdy na właściwym miejscu. Korona nie jest kupowana: decyduje miejsce w rankingu dnia. */
  function poprawnyStroj(wybor, kupione, korona) {
    var ma = Array.isArray(kupione) ? kupione : [], w = wybor || {}, wynik = {};
    SLOTY.forEach(function (s) { wynik[s] = null; });
    SKLEP.forEach(function (p) { if (w[p.slot] === p.id && (p.tylkoCzolowka ? korona === true : ma.indexOf(p.id) >= 0)) wynik[p.slot] = p.id; });
    return wynik;
  }
  /** Czy gracz ma dziś koronę: jego pseudonim w pierwszej dziesiątce rankingu dnia. */
  function maKorone(ranking, pseudonim) {
    if (!pseudonim || !ranking || !Array.isArray(ranking.dzien)) return false;
    var ja = String(pseudonim).toLowerCase();
    return ranking.dzien.some(function (w) { return Number(w.miejsce) <= KORONA_MIEJSCA && String(w.pseudonim).toLowerCase() === ja; });
  }
  /** Co postać nosi naprawdę: rower tylko to, co pasuje na kask, koparka nic. */
  function strojPostaci(stroj, postac) {
    var p = POSTACIE[postac], wynik = {};
    SLOTY.forEach(function (s) { wynik[s] = p && p.sloty.indexOf(s) >= 0 && stroj ? stroj[s] || null : null; });
    return wynik;
  }

  /* Deska szyldu na domku (ułamki obrazu): to samo źródło co ulica. */
  /* Firmy z licznika do gry: tylko budynki (cegiełki firm są w murze), logo wyłącznie z bucketu akcji. */
  var RE_LOGO_FIRMY = /^https:\/\/afqojgkaveykxbltxzwm\.supabase\.co\/storage\/v1\/object\/public\/akcja-firmy-logo\/[0-9a-f-]{36}\.(png|jpg|webp)$/;
  var WIEZOWIEC_CO = 5;   // co który domek przy trasie staje się wysokim budynkiem: rzadziej niż domki, ale widać
  function firmyZLicznika(d) {
    return (Array.isArray(d && d.firmy) ? d.firmy : []).map(function (z) {
      var nazwa = z && typeof z.nazwa === "string" ? z.nazwa.trim() : "";
      if (!nazwa || z.rodzaj === "cegielka") return null;
      return { nazwa: nazwa, logo: typeof z.logo_url === "string" && RE_LOGO_FIRMY.test(z.logo_url) ? z.logo_url : "", rodzaj: z.rodzaj === "wiezowiec" ? "wiezowiec" : "domek", partner: z.wsparcie === "rzeczowe" };
    }).filter(Boolean);
  }
  var SZYLDY = { wiezowiec: [0.2, 0.175, 0.6, 0.08], domek1: [0.2999, 0.3604, 0.4001, 0.0995], domek2: [0.2918, 0.346, 0.4152, 0.1142], domek3: [0.3145, 0.2748, 0.3716, 0.1349], domek4: [0.2813, 0.341, 0.4366, 0.106], domek5: [0.3029, 0.3139, 0.3942, 0.1227], domek6: [0.2929, 0.2996, 0.4121, 0.1163], domek7: [0.297, 0.3642, 0.406, 0.1036] };

  /* Wyzwanie dnia: odznaka tylko w grze. warunek dostaje statystyki rundy; `naKoniec` = da się ocenić dopiero po rundzie. */
  var WYZWANIA = [
    { id: "cegly-bez-upadku-50", opis: "50 cegieł bez upadku", cel: 50, stan: function (s) { return s.cegly_bez_upadku; } },
    { id: "salta-pod-rzad-3", opis: "3 salta pod rząd", cel: 3, stan: function (s) { return s.salta_pod_rzad; } },
    { id: "zlote-3", opis: "3 złote cegły", cel: 3, stan: function (s) { return s.zlote; } },
    { id: "slizgi-3", opis: "3 ślizgi pod barierką", cel: 3, stan: function (s) { return s.slizgi; } },
    { id: "seria-15", opis: "Seria 15 bez potknięcia", cel: 15, stan: function (s) { return s.seria; } },
    { id: "cegly-200", opis: "200 cegieł w rundzie", cel: 200, stan: function (s) { return s.cegly; } },
    { id: "bez-upadku", opis: "Cała runda bez upadku", cel: 1, naKoniec: true, stan: function (s) { return s.koniec && s.upadki === 0 ? 1 : 0; } },
    { id: "salta-5", opis: "5 salt w rundzie", cel: 5, stan: function (s) { return s.salta; } },
    { id: "kaski-2", opis: "2 kaski w rundzie", cel: 2, stan: function (s) { return s.kaski; } },
    { id: "triki-5", opis: "5 trików", cel: 5, stan: function (s) { return s.triki; } },
    { id: "cegly-bez-upadku-100", opis: "100 cegieł bez upadku", cel: 100, stan: function (s) { return s.cegly_bez_upadku; } },
    { id: "bidony-2", opis: "2 bidony w rundzie", cel: 2, stan: function (s) { return s.bidony; } },
    { id: "seria-25", opis: "Seria 25 bez potknięcia", cel: 25, stan: function (s) { return s.seria; } },
    { id: "cegly-400", opis: "400 cegieł w rundzie", cel: 400, stan: function (s) { return s.cegly; } },
  ];
  function dzienWaw(data) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(data || new Date());
  }
  /** Ten sam dzień = to samo wyzwanie u wszystkich, kolejne dni przechodzą przez całą listę. */
  function wyzwanieDnia(dzien) {
    var d = String(dzien || dzienWaw()), dni = Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);
    return WYZWANIA[((dni % WYZWANIA.length) + WYZWANIA.length) % WYZWANIA.length];
  }
  function postepWyzwania(w, s) {
    var wartosc = Math.max(0, Number(w.stan(s)) || 0);
    return { wartosc: Math.min(wartosc, w.cel), cel: w.cel, gotowe: wartosc >= w.cel };
  }
  function pusteStaty() { return { cegly: 0, zlote: 0, salta: 0, salta_pod_rzad: 0, slizgi: 0, seria: 0, upadki: 0, kaski: 0, bidony: 0, buty: 0, zele: 0, triki: 0, cegly_bez_upadku: 0, koniec: false }; }

  /* Wyzwanie znajomego: dane z adresu są niezaufane. Imię tylko litery i łącznik; wynik liczbą. Nazwisko i każde inne słowo odpada. */
  function parsujWyzwanieZnajomego(szukanie) {
    var q;
    try { q = new URLSearchParams(szukanie || ""); } catch (e) { return null; }
    var w = q.get("wynik");
    if (!w || !/^\d{1,6}$/.test(w) || +w < 1) return null;
    var od = String(q.get("od") || "").trim().split(/\s+/)[0] || "";
    od = od.length <= 14 && /^\p{L}+(?:-\p{L}+)?$/u.test(od) ? od : "";
    if (od && g.BM_MODERACJA && !g.BM_MODERACJA.sprawdz(od, { rodzaj: "imie" }).ok) od = "";
    return { wynik: +w, od: od };
  }
  function linkWyzwania(adres, wynik, imie) {
    var u = String(adres || "").split(/[?#]/)[0], od = String(imie || "").trim().split(/\s+/)[0] || "";
    var param = new URLSearchParams({ wynik: String(Math.max(0, Math.floor(Number(wynik) || 0))) });
    if (od) param.set("od", od);
    return u + "?" + param.toString();
  }
  function odmianaCegiel(n) {
    var r10 = n % 10, r100 = n % 100;
    return n === 1 ? "cegła" : (r10 >= 2 && r10 <= 4 && !(r100 >= 12 && r100 <= 14)) ? "cegły" : "cegieł";
  }

  g.BM_CEGIELKI = { SZEROKOSC_PIONU: 560, zaWaskoNaGre: function (cw, ch) { return cw < 320 || cw / ch < 0.4; }, ROZBIEG_ZLOTEJ: 1.25, FIZYKA: FIZYKA, zasiegPostaci: zasiegPostaci, skalaSkoku: skalaSkoku, lukCegiel: lukCegiel, wysokoscZlotej: wysokoscZlotej, firmyZLicznika: firmyZLicznika, WIEZOWIEC_CO: WIEZOWIEC_CO, SLOTY: SLOTY, DODATKI: DODATKI, KORONA_MIEJSCA: KORONA_MIEJSCA, POZIOMY: POZIOMY, MUR_CEL: MUR_CEL, poziom: poziom, postepPoziomu: postepPoziomu, POSTACIE: POSTACIE, odblokowana: odblokowana, wysokoscKasku: wysokoscKasku, imieZPodpisu: imieZPodpisu, arkuszKoparki: arkuszKoparki, KLATKI_KOPARKI: KLATKI_KOPARKI, maKorone: maKorone, strojPostaci: strojPostaci, dopelniacz: dopelniacz, zdanieOZbiorce: zdanieOZbiorce, linkZbiorki: linkZbiorki, tekstMuru: tekstMuru, procentMuru: procentMuru, odmianaZlotych: odmianaZlotych, ROWER: ROWER, rysunekKoparki: rysunekKoparki, MALY_TEMPO: MALY_TEMPO, MALY_CEGIEL_W_RZEDZIE: MALY_CEGIEL_W_RZEDZIE, poprawnyStroj: poprawnyStroj, SKLEP: SKLEP, ULEPSZENIA: ULEPSZENIA, COMBO_MAKS: COMBO_MAKS, KLATKI_H: KLATKI_H, REAKCJE: REAKCJE, NAZWY_TRIKOW: NAZWY_TRIKOW, SZYLDY: SZYLDY, WYZWANIA: WYZWANIA, dzienWaw: dzienWaw, wyzwanieDnia: wyzwanieDnia, postepWyzwania: postepWyzwania, pusteStaty: pusteStaty, parsujWyzwanieZnajomego: parsujWyzwanieZnajomego, linkWyzwania: linkWyzwania, odmianaCegiel: odmianaCegiel };
})(typeof globalThis !== "undefined" ? globalThis : this);
