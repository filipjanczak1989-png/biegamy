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
  var NAZWY_TRIKOW = ["Nożyce", "Gwiazda", "Lot", "Strzała", "Machnięcie"];
  /* Premia za combo salt rośnie do ×5. Bez sufitu jedna sztuczka dawała 5 razy więcej niż dobra gra, a pułap wyniku na serwerze przestawał cokolwiek odsiewać. */
  var COMBO_MAKS = 5;

  /* MAGAZYN SZEFA: płaci się WYŁĄCZNIE złotymi cegłami zebranymi w grze, nigdy pieniędzmi. Zwykłe cegły idą do wspólnego muru i nie są walutą. Ceny muszą się zgadzać z gra_kup w migracji (blizna-154).
     Koszulki i spodenki to przemalowanie arkuszy w kodzie, dodatki i buty to obrazki przypinane na żywo w każdej klatce. Korony nie ma w gra_kup: nosi ją tylko czołówka rankingu dnia. */
  var SKLEP = [
    { id: "koszulka-czerwona", slot: "tulow", rodzaj: "koszulka", nazwa: "Czerwona koszulka", cena: 10, kolor: [224, 50, 58] },
    { id: "koszulka-niebieska", slot: "tulow", rodzaj: "koszulka", nazwa: "Niebieska koszulka", cena: 10, kolor: [38, 112, 226] },
    { id: "koszulka-zielona", slot: "tulow", rodzaj: "koszulka", nazwa: "Zielona koszulka", cena: 10, kolor: [32, 168, 88] },
    { id: "koszulka-fioletowa", slot: "tulow", rodzaj: "koszulka", nazwa: "Fioletowa koszulka", cena: 15, kolor: [136, 70, 222] },
    { id: "koszulka-zlota", slot: "tulow", rodzaj: "koszulka", nazwa: "Złota koszulka", cena: 50, kolor: [240, 182, 40] },
    { id: "kamizelka", slot: "tulow", rodzaj: "kamizelka", nazwa: "Kamizelka odblaskowa", cena: 25, kolor: [255, 138, 26], pasy: [246, 246, 226] },
    { id: "kamizelka-wytrwalych", slot: "tulow", rodzaj: "kamizelka", nazwa: "Kamizelka Wytrwałych", cena: null, tylkoSeria: true, kolor: [0, 168, 160], pasy: [246, 246, 226] },
    { id: "spodenki-czerwone", slot: "spodenki", rodzaj: "spodenki", nazwa: "Czerwone spodenki", cena: 8, kolor: [204, 44, 52] },
    { id: "spodenki-niebieskie", slot: "spodenki", rodzaj: "spodenki", nazwa: "Niebieskie spodenki", cena: 8, kolor: [34, 96, 200] },
    { id: "spodenki-zielone", slot: "spodenki", rodzaj: "spodenki", nazwa: "Zielone spodenki", cena: 8, kolor: [30, 148, 80] },
    { id: "spodenki-biale", slot: "spodenki", rodzaj: "spodenki", nazwa: "Białe spodenki", cena: 12, kolor: [226, 228, 232] },
    { id: "buty-czerwone", slot: "stopy", rodzaj: "buty", nazwa: "Czerwone biegowe", cena: 12 },
    { id: "buty-niebieskie", slot: "stopy", rodzaj: "buty", nazwa: "Niebieskie biegowe", cena: 12 },
    { id: "buty-zielone", slot: "stopy", rodzaj: "buty", nazwa: "Zielone biegowe", cena: 12 },
    { id: "buty-fioletowe", slot: "stopy", rodzaj: "buty", nazwa: "Fioletowe biegowe", cena: 15 },
    { id: "buty-robocze", slot: "stopy", rodzaj: "buty", nazwa: "Robocze budowlane", cena: 20 },
    { id: "opaska", slot: "glowa", rodzaj: "dodatek", nazwa: "Opaska", cena: 10 },
    { id: "czapka-pompon", slot: "glowa", rodzaj: "dodatek", nazwa: "Czapka z pomponem", cena: 15 },
    { id: "kask-rowerowy", slot: "glowa", rodzaj: "dodatek", nazwa: "Kask rowerowy", cena: 25 },
    { id: "czapka-zlota", slot: "glowa", rodzaj: "dodatek", nazwa: "Złota czapka z daszkiem", cena: 40 },
    { id: "korona", slot: "glowa", rodzaj: "dodatek", nazwa: "Korona", cena: null, tylkoCzolowka: true },
    { id: "okulary", slot: "oczy", rodzaj: "dodatek", nazwa: "Okulary", cena: 20 },
    { id: "medal", slot: "szyja", rodzaj: "dodatek", nazwa: "Medal", cena: 30 },
    { id: "peleryna", slot: "plecy", rodzaj: "dodatek", nazwa: "Peleryna", cena: 60 },
  ];
  var SLOTY = ["tulow", "spodenki", "stopy", "glowa", "oczy", "szyja", "plecy"];
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
  /* Buty: ten sam rysunek na obu stopach, przypięty w każdej klatce (js/cegielki-przypiecia.js). szer w promieniach głowy, (kx, ky) punkt rysunku trafiający w środek buta, obrot poprawia pochylenie rysunku względem wzorca. */
  SKLEP.forEach(function (p) { if (p.rodzaj === "buty") DODATKI[p.id] = { punkt: "stopy", szer: 3.3, kx: 0.5, ky: p.id === "buty-robocze" ? 0.6 : 0.5, dx: 0, dy: 0, obrot: 0 }; });
  /* Koniec akcji i poziomy. Sumę zebranych cegieł liczy serwer z gra_wyniki, próg musi się zgadzać z gra_poziom w migracji (blizna-154). Filip 5.11: 3 awanse w pierwszych 5 rundach nowego gracza, poziom 10 po ok. 40 rundach dobrego, poziom 20 po ok. 300. */
  var POZIOMY = [0, 100, 300, 700, 1800, 3100, 4600, 6400, 8300, 10400, 12900, 15700, 18900, 22500, 26400, 30600, 35300, 40400, 45900, 52200];
  /* Cel muru (Filip 5.11): 100 cegieł na każdy km akcji. Ta sama liczba w gra_ranking i gra_postac_odblokowana. */
  var MUR_CEL = 1250000;
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
  /* POZIOM TO TRUDNOŚĆ I WARTOŚĆ CEGŁY (Filip 4.11 i 5.11). Tempo rośnie z poziomem do sufitu, w rundzie co 15 s. Ranking i „kto dołożył” liczą PUNKTY = cegły × mnożnik poziomu; mur i koparka za mur liczą zebrane CEGŁY. Punkty w bazie liczy serwer, mnożnik musi się zgadzać z gra_mnoznik_poziomu w migracji (blizna-164).
     Mnożnik z pomiaru: dobry gracz zbiera na poziomie 20 około 3,5 razy mniej cegieł niż na poziomie 1, a ma mieć o 10–20% więcej punktów, więc weteran nie przegrywa z nowym. Poziom 0 to Mały budowniczy: bez przyspieszania, bez mnożnika, zawsze łatwo. */
  var TEMPO_KROK = 0.04, TEMPO_SUFIT = 1.7, RUNDA_CO_S = 15, RUNDA_TEMPO = 1.08, MNOZNIK_KROK = 0.17, MNOZNIK_SUFIT = 4.23, GRA_MAKS_NA_S = 45;
  /* Seria: dobry gracz buduje ją po kilku przeszkodach, a ×3 z combo salt dawało mu ponad trzy razy więcej niż reszta gry (pomiar 4.11). Progi wysoko, żeby wynik zależał od cegieł, i rosną z poziomem, bo gęstsze przeszkody budują serię szybciej. Mały budowniczy zostaje przy starych. */
  var SERIA = { x2: 20, x3: 40 }, SERIA_MALY = { x2: 5, x3: 12 };
  function progiSerii(n, maly) {
    if (maly) return SERIA_MALY;
    var k = 1 + (Math.min(Math.max(n, 1), 20) - 1) / 19;
    return { x2: Math.round(SERIA.x2 * k), x3: Math.round(SERIA.x3 * k) };
  }
  function mnoznikSerii(seria, maly, n) { var p = progiSerii(n, maly); return seria >= p.x3 ? 3 : seria >= p.x2 ? 2 : 1; }
  function tempoPoziomu(n) { return n >= 1 ? Math.min(TEMPO_SUFIT, 1 + TEMPO_KROK * (n - 1)) : 1; }
  function krokiTempa(t, maly) { return maly ? 0 : Math.floor((Number(t) || 0) / RUNDA_CO_S); }
  function tempoRundy(t, maly) { return Math.pow(RUNDA_TEMPO, krokiTempa(t, maly)); }
  function mnoznikPoziomu(n) { return n >= 1 ? Math.min(MNOZNIK_SUFIT, Math.round((1 + MNOZNIK_KROK * (n - 1)) * 100) / 100) : 1; }
  /* Na całkowitych setnych, żeby ułamek binarny nie rozjechał się z serwerem. */
  function punktyRundy(cegly, n) { return Math.round((Number(cegly) || 0) * Math.round(mnoznikPoziomu(n) * 100) / 100); }
  /* Limit serwera: cegły na sekundę, w punktach to samo razy mnożnik. */
  function limitCegiel(czas) { return GRA_MAKS_NA_S * czas; }
  function limitPunktow(n, czas) { return punktyRundy(limitCegiel(czas), n); }
  /* Co gra stawia na trasie na danym poziomie. Same liczby, bez losowania: silnik losuje, testy sprawdzają, że trudniej znaczy trudniej. */
  function planPoziomu(n) {
    var t = n >= 1 ? (Math.min(n, 20) - 1) / 19 : 0, l = function (a, b) { return a + (b - a) * t; };
    return {
      poziom: n, tempo: tempoPoziomu(n), mnoznik: mnoznikPoziomu(n),
      odstep: l(1, 0.8),                                   // odstępy między przeszkodami względem poziomu 1
      para: n >= 3 ? l(0.06, 0.42) : 0,                    // szansa na parę przeszkód
      luk: l(0.5, 0.25),                                   // łuk cegieł nad przeszkodą
      lukWysoko: n >= 4 ? l(0.2, 0.45) : 0,                // łuk tylko dla skaczących
      lukSalto: n >= 10 ? l(0, 0.4) : 0,                   // łuk na drugi ruch
      rzad: l(0.62, 0.2),                                 // rząd cegieł między przeszkodami
      rzadWysoko: n >= 4 ? l(0.2, 0.5) : 0,                // rząd na wysokość skoku
      rzadSalto: n >= 10 ? l(0, 0.35) : 0,                 // rząd na drugi ruch
      zlota: l(0.24, 0.1),                                 // złota nad przeszkodą
      zlotaNaZiemi: n <= 4 ? 0.12 : 0,                     // złota w rzędzie przy ziemi tylko na początek
      zlotaPara: n >= 8 ? l(0, 0.3) : 0,                   // złota za parą, z ryzykiem lądowania przed następną
      kaski: n >= 8 ? 1 : 2, pierwszyKask: n < 5, odstepBonusu: l(1, 1.6),
    };
  }
  /* Koparka zbiera łyżką wszystko, co przy drodze, i nie ryzykuje skoku: z poziomem dostaje mniej cegieł niż biegacz. */
  function ceglyKoparki(n) { return n >= 1 ? 1 - 0.5 * (Math.min(n, 20) - 1) / 19 : 1; }
  function kolejkaBonusow(plan) { return plan.kaski >= 2 ? ["kask", "bidon", "but", "zel", "bidon", "kask"] : ["kask", "bidon", "but", "zel", "bidon", "but"]; }
  function wysokoscRzedu(postac, plan, los) {
    var z = zasiegPostaci(postac), wysoko = (POSTACIE[postac] || {}).skacze === false ? z.maks * 0.88 : z.zwykly * 0.9;   // koparka: wysoko znaczy łyżką
    if (los < plan.rzadSalto) return z.maks * 0.88;
    return los < plan.rzadSalto + plan.rzadWysoko ? wysoko : 44;
  }
  function wysokoscLuku(postac, i, plan, los) {
    var z = zasiegPostaci(postac), h = lukCegiel(postac, i), szczyt = lukCegiel(postac, 0);
    if (los < plan.lukSalto) return Math.min(h + Math.max(0, z.maks * 0.9 - szczyt), z.maks * 0.92);
    if (los >= plan.lukSalto + plan.lukWysoko) return h;
    return (POSTACIE[postac] || {}).skacze === false ? z.maks * 0.85 : Math.min(h + Math.max(0, z.zwykly * 0.95 - szczyt), z.maks * 0.92);
  }
  /* Pary (Filip 4.11): pachołek + barierka, kałuża za kamieniem. Zawsze do przejścia: kałuża tuż za kamieniem tylko wtedy, gdy zwykły skok nad oboma się mieści, inaczej druga przeszkoda dopiero po lądowaniu. */
  var PARY = [["pacholek", "barierka"], ["kamien", "kaluza"]];
  function czasNadWysokoscia(v0, h) { var d = v0 * v0 - 2 * FIZYKA.GRAW * h; return d > 0 ? { od: (v0 - Math.sqrt(d)) / FIZYKA.GRAW, do: (v0 + Math.sqrt(d)) / FIZYKA.GRAW } : null; }
  function odstepPary(para, postac, v) {
    var p = POSTACIE[postac] || {};
    if (para && para[1] === "kaluza" && p.skacze !== false) {
      var v0 = FIZYKA.SKOK * (p.skok || 1), a = czasNadWysokoscia(v0, 50), b = czasNadWysokoscia(v0, 8);
      if (a && b && (b.do - a.od) * v >= 272) return 104;
    }
    return v * 0.95 + 22;
  }
  /* SEKWENCJE (Filip 5.11). Od poziomu 5 trasa idzie falami: sekwencja gęstych przeszkód 8–12 s, potem luz 3–5 s bez przeszkód. Wyższy poziom: dłuższa i gęstsza. Poziomy 1–4, koparka i Mały bez sekwencji. */
  var SEKWENCJE = { poziom_od: 5, dlugosc_s: [8, 12], luz_s: [3, 5], odstep_s: [1.15, 0.9], zapas_s: 0.12, min_px: 280, czysto: 5, rzad_co_s: 1.5, zlota_w_luzie: 0.6, rzad_w_sekwencji: 0.5 };
  function sekwencjeWRundzie(poziom, maly, postac) { return !maly && poziom >= SEKWENCJE.poziom_od && (POSTACIE[postac] || {}).skacze !== false; }
  function postepSekwencji(n) { return Math.min(1, Math.max(0, (n - SEKWENCJE.poziom_od) / (20 - SEKWENCJE.poziom_od))); }
  function dlugoscSekwencji(n, los) { var d = SEKWENCJE.dlugosc_s, s = d[0] + (d[1] - d[0]) * postepSekwencji(n) + ((los == null ? 0.5 : los) - 0.5); return Math.min(d[1], Math.max(d[0], s)); }
  /* Odstęp z poziomu, ale nigdy krótszy niż lot i chwila na następne wybicie. Dowód, że da się przejść: bot idealny bez upadku. */
  function odstepSekwencji(n, v, postac, los) {
    var o = SEKWENCJE.odstep_s, lot = 2 * FIZYKA.SKOK * ((POSTACIE[postac] || {}).skok || 1) / FIZYKA.GRAW;
    var s = o[0] + (o[1] - o[0]) * postepSekwencji(n) + ((los == null ? 0.5 : los) - 0.5) * 0.08;
    return Math.max(SEKWENCJE.min_px, v * Math.max(s, lot + SEKWENCJE.zapas_s));
  }
  function nastepnaFala(f, n, v, x, los) {
    var sek = !(f && f.sek), l = SEKWENCJE.luz_s, t = sek ? dlugoscSekwencji(n, los) : l[0] + (l[1] - l[0]) * (los == null ? 0.5 : los);
    return { sek: sek, nr: (f ? f.nr : 0) + (sek ? 1 : 0), doX: x + t * v };
  }
  /* Rozdziały (Filip 4.11, pkt 9). Imion dziecka i rowerzysty nie ma w kodzie: przychodzą z bazy. Bez nich neutralna nazwa. */
  var ROZDZIALY = [{ od: 1, nazwa: "Pod domem" }, { od: 4, nazwa: "Pierwsze kilometry" }, { od: 7, nazwa: "Budowa" }, { od: 10, nazwa: "Ktoś dołącza", rower: true }, { od: 11, nazwa: "Noc" }, { od: 15, nazwa: "Wszyscy razem" }, { od: 20, nazwa: "Wszyscy razem", meta: true }];
  function rozdzial(n, o) {
    var r = ROZDZIALY[0], x = o || {};
    ROZDZIALY.forEach(function (w) { if (n >= w.od) r = w; });
    if (r.rower && x.rower) return x.rower + " dołącza";
    if (r.meta && x.meta && x.imie) return "Meta: " + x.imie + " w koparce";
    return r.nazwa;
  }
  /* PLANSZE ROZDZIAŁÓW, KARTKI, BONUSY ZA MUR (Filip 4.11, pkt 9). Teksty do zatwierdzenia przez Filipa przed wdrożeniem. Bez choroby, nazwiska, trasy i pieniędzy. Imiona wyłącznie z bazy: {imie}, {imie_d} (dopełniacz), {rower}.
     scena: n = obraz z atlasu, x = środek w ułamku szerokości, h = wysokość w ułamku wysokości planszy, kl = klatka arkusza. */
  var PLANSZE = [
    { od: 1, tekst: "Szef {imie} wydał pierwsze polecenie: droga ma powstać. Kasia i Filip wiążą buty i zbierają cegły.", bezImienia: "Szef wydał pierwsze polecenie: droga ma powstać. Kasia i Filip wiążą buty i zbierają cegły.", scena: [{ n: "domek2", x: 0.2, h: 0.62 }, { n: "kasia_bieg", x: 0.52, h: 0.5 }, { n: "filip_bieg", x: 0.72, h: 0.5, kl: 2 }] },
    { od: 4, tekst: "Dom został za zakrętem, a cegieł przybywa. Szef pyta przez krótkofalówkę, czemu tak wolno.", scena: [{ n: "drzewo", x: 0.14, h: 0.7 }, { n: "kasia_bieg", x: 0.46, h: 0.5, kl: 1 }, { n: "filip_bieg", x: 0.66, h: 0.5, kl: 3 }, { n: "cegla", x: 0.88, h: 0.1 }] },
    { od: 7, tekst: "Cegły nie mieszczą się już w rękach, więc Szef przysłał wywrotkę. Załóż kask, tu robi się głośno.", scena: [{ n: "wywrotka", x: 0.2, h: 0.5 }, { n: "barierka", x: 0.47, h: 0.2 }, { n: "kasia_bud", x: 0.62, h: 0.5 }, { n: "filip_bud", x: 0.78, h: 0.5, kl: 2 }, { n: "pacholek", x: 0.93, h: 0.16 }] },
    { od: 10, rower: true, tekst: "Na drodze słychać dzwonek. To {rower}, nasz elektryk. Dołącza {rower_na}, a Ty możesz wsiąść na rower.", bezImienia: "Na drodze robi się tłoczniej. Nikt tu nie biegnie sam.", scena: [{ n: "kasia_bieg", x: 0.2, h: 0.5 }, { n: "filip_bieg", x: 0.4, h: 0.5, kl: 2 }, { n: "rowerzysta_bieg", x: 0.7, h: 0.56, tylkoRower: true }] },
    { od: 11, noc: true, rower: true, tekst: "Słońce zaszło, a droga nie. {rower} zapala latarnie, jedną po drugiej. Biegnij od światła do światła.", bezImienia: "Słońce zaszło, a droga nie. Biegnij od latarni do latarni.", scena: [{ n: "latarnia", x: 0.14, h: 0.74 }, { n: "kasia_bieg", x: 0.42, h: 0.5, kl: 1 }, { n: "filip_bieg", x: 0.6, h: 0.5, kl: 3 }, { n: "latarnia", x: 0.86, h: 0.74 }] },
    { od: 15, tekst: "Na poboczu stoją już kibice z tabliczkami, a Szef macha im z daleka. Tę drogę buduje się razem.", scena: [{ n: "wiezowiec", x: 0.13, h: 0.74 }, { n: "k1", x: 0.34, h: 0.42 }, { n: "k2", x: 0.5, h: 0.42 }, { n: "k3", x: 0.66, h: 0.42 }, { n: "k4", x: 0.82, h: 0.42 }] },
    { od: 20, meta: true, tekst: "Na mecie czeka koparka, a w niej Szef {imie}. Dalej drogę budujecie razem.", scena: [{ n: "k1", x: 0.14, h: 0.42 }, { n: "wywrotka", x: 0.5, h: 0.62, koparka: true }, { n: "k3", x: 0.86, h: 0.42 }] },
  ];
  /* Kartki z dziennika: fikcja gry. Bez imion, kilometrów, miejsc i dat, żeby nikt nie wziął ich za relację z trasy. Kartka 1 przy pierwszej rundzie, reszta za awans. */
  var KARTKI = [
    "Buty zawiązane, plecak lekki. Szef kazał zacząć od jednej cegły.", "Druga cegła waży tyle samo co pierwsza. Dziwne, ale niesie się lżej.", "Sąsiad pyta, dokąd biegniemy. Filip mówi: tam, gdzie Szef pokaże łyżką.", "Pierwszy zakręt za nami. Dom zniknął, a droga dopiero się zaczyna.",
    "Kasia mówi, że bolą nogi. Filip mówi, że to nie nogi, tylko ambicja.", "Kałuża wygrała. Skarpety schną na plecaku, humor nie ucierpiał.", "Zaczyna się budowa. Pachołek stoi pośrodku drogi i nie ustępuje. Zupełnie jak Szef.", "Dostaliśmy kaski. Kasia twierdzi, że jej pasuje lepiej.",
    "Wywrotka pomachała nam światłami. Szef mówi, że sam ją tego nauczył.", "Słychać dzwonek. To nasz elektryk, znamy ten dzwonek od lat.", "Robi się ciemno. Elektryk wyciąga drabinę i zapala latarnie, jedną po drugiej.", "W nocy każda cegła świeci trochę jaśniej. Albo to my jesteśmy zmęczeni.",
    "Nikt nie gada. Słychać tylko kroki, oddech i koparkę Szefa gdzieś z przodu.", "Pierwsze światło. Elektryk gasi latarnie i udaje, że wcale nie ziewa.", "Na poboczu pierwsza tabliczka. Nie znamy tej osoby, a krzyczy, jakbyśmy się znali.", "Kibiców coraz więcej. Ktoś podaje bidon i nawet nie pyta, kim jesteśmy.",
    "Mur rośnie szybciej, niż biegniemy. Nie budujemy go już sami.", "Dzieciaki biegną z nami kawałek, a potem mówią, że za wolno. Mają rację.", "Widać już koniec drogi. Szef stoi w koparce i sprawdza każdą cegłę.", "Meta. Droga stoi, cegła przy cegle, a w niej są też Twoje. Szef kiwa głową.",
  ];
  /* Dziennik: kartka 1 przychodzi po pierwszej rundzie, każda następna z awansem. Zebrane = do poziomu gracza. */
  function zebraneKartki(n, pierwszaRunda) {
    var wynik = [], ile = Math.min(KARTKI.length, Math.max(1, n || 1));
    for (var i = 1; i <= ile; i++) if (i > 1 || n > 1 || pierwszaRunda) wynik.push({ nr: i, tekst: KARTKI[i - 1] });
    return wynik;
  }
  function kartka(n) { var t = KARTKI[n - 1]; return t ? "Kartka " + n + " z dziennika. " + t : ""; }
  /* Rozdziały bonusowe za wspólny mur: przy 100% gra ma już ekran końcowy. */
  var BONUSY_MURU = [
    { id: "mur25", prog: 312500, tytul: "Mur do pasa", tekst: "Wspólny mur sięga już do pasa. Nikt nie wie, kto położył którą cegłę, i dobrze.", scena: [{ n: "cegla", x: 0.3, h: 0.14 }, { n: "cegla", x: 0.5, h: 0.14 }, { n: "cegla", x: 0.7, h: 0.14 }, { n: "k1", x: 0.12, h: 0.42 }, { n: "k3", x: 0.88, h: 0.42 }] },
    { id: "mur50", prog: 625000, tytul: "Połowa muru", tekst: "Pół muru stoi. Widać go już z daleka.", scena: [{ n: "wywrotka", x: 0.22, h: 0.5 }, { n: "cegla", x: 0.5, h: 0.16 }, { n: "cegla", x: 0.62, h: 0.16 }, { n: "cegla", x: 0.74, h: 0.16 }, { n: "k2", x: 0.9, h: 0.42 }] },
  ];
  /* SCENA MURU (Filip 5.11): mur rośnie rzędami od dołu, flagi na progach. Jedna cegła na scenie to ok. 2 200 prawdziwych. Bez czasu i losu, żeby dało się testować. */
  var MUR_SCENA = { rzedy: 28, kolumny: 20 };
  function ceglyNaScenie(mur, cel) {
    var wsz = MUR_SCENA.rzedy * MUR_SCENA.kolumny, m = Number(mur) || 0, c = Number(cel) || 0;
    if (!(c > 0) || m <= 0) return 0;
    return Math.min(wsz, Math.max(1, Math.floor(m / c * wsz)));
  }
  /* Animacja przy wejściu: od tego, co gracz widział ostatnio, a przynajmniej ostatnie 12 cegieł. */
  function odKtorejCegly(n, widziane) { var w = Number(widziane); return Math.max(0, Math.min(n - 12, w >= 0 ? w : 0)); }
  function flagiMuru(mur, cel) {
    var m = Number(mur) || 0, c = Number(cel) || 0;
    return BONUSY_MURU.concat([{ id: "mur100", prog: c, tytul: "Mur stoi!" }]).map(function (b) { return { id: b.id, tytul: b.tytul, ulamek: c > 0 ? b.prog / c : 0, zdobyta: c > 0 && m >= b.prog }; });
  }
  /* Nagroda za ukończony rozdział: dodatek za darmo, przy wejściu na poziom `po`. Musi się zgadzać z gra_nagrody_do_poziomu w migracji (blizna-165). */
  var NAGRODY = [{ po: 4, przedmiot: "opaska" }, { po: 7, przedmiot: "spodenki-czerwone" }, { po: 10, przedmiot: "kamizelka" }, { po: 11, przedmiot: "kask-rowerowy" }, { po: 15, przedmiot: "czapka-pompon" }, { po: 20, przedmiot: "medal" }, { po: 20, przedmiot: "czapka-zlota" }];
  function nagrodyDoPoziomu(n) { return NAGRODY.filter(function (w) { return n >= w.po; }).map(function (w) { return w.przedmiot; }); }
  function nazwaPrzedmiotu(id) { var p = SKLEP.filter(function (x) { return x.id === id; })[0]; return p ? p.nazwa : ""; }
  function wstawImiona(t, o) { return t.replace("{imie_d}", dopelniacz(o.imie)).replace("{imie}", o.imie || "").replace("{rower_na}", o.rowerNa || "na rowerze").replace("{rower}", o.rower || ""); }
  /* Finał: ulica gotowa, koparka na jej końcu, cała ekipa obok. Tytuł stały, reszta to scena z grafik, które gra ma. */
  function planszaFinalu(o) {
    var x = o || {}, scena = [{ n: "domek1", x: 0.06, h: 0.56 }, { n: "domek3", x: 0.2, h: 0.56 }, { n: "kasia_I", x: 0.33, h: 0.5 }, { n: "filip_I", x: 0.46, h: 0.5 }];
    if (x.rower) scena.push({ n: "rowerzysta_bieg", x: 0.58, h: 0.5 });
    scena.push({ n: "wywrotka", x: 0.79, h: 0.6, koparka: true });
    return { id: "final", tytul: "Ulica gotowa. Szef zadowolony.", tekst: "", noc: false, scena: scena };
  }
  /* Latarnie (Filip 5.11): zapala je elektryk, więc świecą od chwili, gdy dołączył w fabule, albo gdy gra się nim. Bez przełącznika rowerzysty fabuły nie ma i świecą jak dotąd. */
  function latarnieZapalone(postac, poziomGracza, rowerWlaczony) { return !rowerWlaczony || postac === "rowerzysta" || poziomGracza >= 10; }
  function planszaRozdzialu(n, o) {
    var x = o || {}, p = PLANSZE[0];
    PLANSZE.forEach(function (w) { if (n >= w.od) p = w; });
    if (p.meta && !(x.meta && x.imie)) return null;
    var bezImienia = (p.rower && !x.rower) || (p.od === 1 && !x.imie);
    return { id: "r" + p.od, tytul: rozdzial(n, x), tekst: bezImienia ? p.bezImienia : wstawImiona(p.tekst, x), noc: !!p.noc, scena: p.scena.filter(function (e) { return !e.tylkoRower || x.rower; }) };
  }
  function bonusyMuru(mur) { var m = Number(mur) || 0; return BONUSY_MURU.filter(function (b) { return m >= b.prog; }); }
  function tekstMnoznika(n) { return "×" + String(mnoznikPoziomu(n)).replace(".", ","); }
  /* Po rundzie: awans, odblokowania, nowy rozdział. Pusty tekst = bez awansu. */
  function tekstAwansu(przed, teraz, o) {
    if (!(teraz > przed)) return "";
    var x = o || {}, s = "Awans na poziom " + teraz + "!";
    if (przed < 10 && teraz >= 10 && x.rower) s += " Odblokowano: " + x.rower + ".";
    if (przed < 20 && teraz >= 20 && x.koparka) s += " Odblokowano: koparka.";
    var nowy = rozdzial(teraz, x);
    if (nowy !== rozdzial(przed, x)) s += " Nowy rozdział: " + nowy + ".";
    var nagrody = nagrodyDoPoziomu(teraz).filter(function (id) { return nagrodyDoPoziomu(przed).indexOf(id) < 0; }).map(nazwaPrzedmiotu);
    if (nagrody.length) s += " Nagroda: " + nagrody.join(", ") + ".";
    return s + " Cegła warta " + tekstMnoznika(teraz) + ".";
  }
  /* Postacie do odblokowania. tempo i skok względem zwykłego biegacza; sloty = co wolno założyć. Rower i koparka mają własne arkusze, bez przemalowania. Żadna nie ma związku z licznikiem akcji ani statystykami treningów. */
  /* FIGURY W POWIETRZU (Filip 5.11). Kolejność jak NAZWY_TRIKOW i klatki arkusza C. Nożyce, Gwiazda, Lot i Strzała tylko w górnej części łuku, nisko zwykła klatka skoku albo krok w machnięciu. lot: opadanie wolniej przez czas figury. przod (ułamek szerokości postaci), kat, wir: samo rysowanie, zasięg zbierania i kolizje się nie ruszają. Gwiazda wyłączona decyzją Filipa 5.11 (waga 0), klatka zostaje w arkuszu. */
  var FIGURY = [
    { czas: 0.2, lot: true, waga: 3, przod: 0.06, kat: 0 },
    { czas: 0.2, lot: false, waga: 0, przod: 0, kat: 0, wir: 0.28, iskra: true, tylkoSzczyt: true },
    { czas: 0.25, lot: true, waga: 3, przod: 0.14, kat: 0.14 },
    { czas: 0.2, lot: false, waga: 2, przod: 0, kat: 0 },
    { czas: 0.34, lot: false, waga: 2, przod: 0.09, kat: 0.14 },
  ];
  var MACHNIECIE = 4, FIGURA_WYSOKO = 0.6, GWIAZDA_WYSOKO = 0.85, GWIAZDA_LUK = 190, MACHNIECIE_NISKO = 0.4, LOT_OPAD = 200;
  function szczytLuku(y, vy) { var v = Math.max(0, vy); return y + v * v / (2 * FIZYKA.GRAW); }
  /* 60% pełnego łuku: skok i salto ze szczytu. Salto zawsze podnosi, więc licznikiem jest wysokość nad ziemią, nie ułamek własnego łuku. */
  function progFigury() { return FIGURA_WYSOKO * (FIZYKA.SKOK * FIZYKA.SKOK + FIZYKA.SALTO_V * FIZYKA.SALTO_V) / (2 * FIZYKA.GRAW); }
  /* Lot wydłuża skok, a figura jest losowa: gracz nie może przez nią wpaść na przeszkodę, której by uniknął. Pomiar 5.11: bez tego upadki na poziomie 20 rosły o połowę. */
  var ZAPAS_PO_LADOWANIU = 0.3, ZAPAS_PRZED_LADOWANIEM = 0.08;
  function czasDoZiemi(y, vy, czasLotu) {
    var krok = 1 / 60, t = 0;
    while (y > 0 && t < 3) { vy -= FIZYKA.GRAW * krok; if (t < czasLotu && vy < -LOT_OPAD) vy = -LOT_OPAD; y += vy * krok; t += krok; }
    return t;
  }
  /** Czy lot się mieści: żadnej przeszkody tam, gdzie wypadnie lądowanie i krótka chwila po nim. odleglosci: px przed graczem, v: px/s. */
  function miejsceNaLot(y, vy, czasLotu, odleglosci, v) {
    var t = czasDoZiemi(y, vy, czasLotu), od = v * (t - ZAPAS_PRZED_LADOWANIEM), doo = v * (t + ZAPAS_PO_LADOWANIU);
    return !odleglosci.some(function (d) { return d >= od && d <= doo; });
  }
  /** Figura po salcie: y wysokość teraz, szczyt to szczyt tego łuku, los z [0,1), bezLotu: figury z lotem odpadają. -1 = zwykła klatka skoku. */
  function figuraPoSalcie(y, szczyt, los, bezLotu) {
    if (y < progFigury()) return los < MACHNIECIE_NISKO ? MACHNIECIE : -1;
    var gwiazda = szczyt >= GWIAZDA_LUK && y >= szczyt * GWIAZDA_WYSOKO, suma = 0, i;
    var dozwolona = function (f) { return (!f.tylkoSzczyt || gwiazda) && !(bezLotu && f.lot); };
    for (i = 0; i < FIGURY.length; i++) if (dozwolona(FIGURY[i])) suma += FIGURY[i].waga;
    var r = los * suma;
    for (i = 0; i < FIGURY.length; i++) { if (!dozwolona(FIGURY[i])) continue; r -= FIGURY[i].waga; if (r < 0) return i; }
    return MACHNIECIE;
  }
  /* BONUS ZA TRENING (Filip 5.11): odpowiedź serwera na ekran. Gra nie liczy tu niczego sama. Bez km i bez nazwy treningu. */
  function tekstBonusu(o) {
    if (!o || !o.ok) return "Nie udało się odebrać bonusu. Spróbuj jeszcze raz.";
    if (!o.dni) return "Nie ma nowego treningu z zegarka. Liczy się bieg albo spacer z ostatnich 3 dni, jeden bonus na dzień.";
    var t = "Odebrane: " + o.zlote + " " + odmianaZlotych(o.zlote) + ", kask do plecaka" + (o.kask > 1 ? " ×" + o.kask : "");
    if (o.bidon) t += ", bidon" + (o.bidon > 1 ? " ×" + o.bidon : "");
    if (o.kamizelka) t += ", Kamizelka Wytrwałych";
    return t + ". Seria: " + o.seria + " " + (o.seria === 1 ? "dzień" : "dni") + ".";
  }
  /* DRUŻYNA ZA GRACZEM (Filip 5.11): rozdział „Wszyscy razem”, poziomy 15–19. Tłum rośnie ze wspólnym murem: 1 grupa do 25%, 2 od 25%, 3 od 75%. Tylko obraz: nie jest przeszkodą, niczego nie zbiera. */
  var DRUZYNA = { od: 15, doo: 19, sk: 130 / 240 };
  function druzynaWRundzie(poziom, maly) { return !maly && poziom >= DRUZYNA.od && poziom <= DRUZYNA.doo; }
  function grupyDruzyny(mur, cel) { var p = Number(cel) > 0 ? (Number(mur) || 0) / Number(cel) : 0; return p >= 0.75 ? 3 : p >= 0.25 ? 2 : 1; }
  /* GÓRKA WOJTASZAKA (Filip 5.11): odcinek w rundzie. Podjazd: tempo −25%, cegły wyżej. Zjazd: +30% i łuk cegieł przy każdej przeszkodzie. Droga się przechyla, kolizje liczą dalej po ziemi. Mały budowniczy i pierwsze poziomy bez górki. */
  var GORKA = { poziom_od: 5, start_s: 20, podjazd_s: 6, zjazd_s: 4, tempo_podjazd: 0.75, tempo_zjazd: 1.3, wyzej: 34, kat: 0.07 };
  function gorkaWRundzie(poziom, maly) { return !maly && poziom >= GORKA.poziom_od; }
  function nowaGorka(od, predBaza) {
    var szczyt = od + predBaza * GORKA.tempo_podjazd * GORKA.podjazd_s;
    return { od: od, szczyt: szczyt, doo: szczyt + predBaza * GORKA.tempo_zjazd * GORKA.zjazd_s };
  }
  /** Gdzie na górce: faza i postęp w fazie. Poza odcinkiem null. */
  function fazaGorki(s, g) {
    if (!g || s < g.od || s >= g.doo) return null;
    return s < g.szczyt ? { faza: "podjazd", p: (s - g.od) / (g.szczyt - g.od) } : { faza: "zjazd", p: (s - g.szczyt) / (g.doo - g.szczyt) };
  }
  function tempoGorki(f) { return !f ? 1 : f.faza === "podjazd" ? GORKA.tempo_podjazd : GORKA.tempo_zjazd; }
  /** Przechył drogi: w górę na podjeździe, w dół na zjeździe, płasko na szczycie i poza odcinkiem. */
  function katGorki(f) { if (!f) return 0; return f.faza === "podjazd" ? -GORKA.kat * Math.min(1, (1 - f.p) * 6, f.p * 6) : GORKA.kat * Math.min(1, (1 - f.p) * 6, f.p * 6); }
  /* Arkusz pchania składaka: klatki 1–3 podjazd, 4 szczyt, 5–6 zjazd. Bez pliku w atlasie zwykłe klatki roweru. */
  function klatkaGorki(f, anim) {
    if (f.faza === "podjazd") return f.p > 0.92 ? 3 : Math.floor(anim / 2) % 3;
    return 4 + Math.floor(anim / 2) % 2;
  }
  var TEKST_GORKI = "3 godziny tu biegaliśmy!";
  function tekstPrzerzutek(rowerNa) { var w = typeof rowerNa === "string" ? rowerNa.trim() : ""; return /^na /.test(w) ? "Na " + w.slice(3) + " nie ma przerzutek!" : "Tu przydałyby się przerzutki!"; }
  /* FIZYKA SKOKU: jedno źródło dla silnika i dla wysokości przedmiotów (Filip 4.11: przedmioty liczone z zasięgu WYBRANEJ postaci). GLOWA + MARGINES to sięgnięcie ponad stopy przy zbieraniu. */
  var FIZYKA = { GRAW: 2300, SKOK: 780, SALTO_V: 640, GLOWA: 130, MARGINES: 16 };
  function wysokoscZPredkosci(v) { return v * v / (2 * FIZYKA.GRAW); }
  var SKOK_ROWERU = Math.sqrt(0.8);
  /* Podbicie: skok roweru + podbicie sięga tyle, co skok + salto biegacza. Skok jest niższy, więc drugi ruch daje więcej. */
  var PODBICIE_ROWERU = Math.sqrt(2 * FIZYKA.GRAW * (wysokoscZPredkosci(FIZYKA.SKOK) + wysokoscZPredkosci(FIZYKA.SALTO_V) - wysokoscZPredkosci(FIZYKA.SKOK * SKOK_ROWERU)));
  var POSTACIE = {
    kasia: { sloty: SLOTY },
    filip: { sloty: SLOTY },
    rowerzysta: { tempo: 1.1, skok: SKOK_ROWERU, podbicie: PODBICIE_ROWERU, sloty: ["oczy", "szyja", "plecy", "stopy"], poziom: 10, wlasne: true, marginesKolizji: 12 },   // niższy skok to krótsze okno nad przeszkodą: mniejsza kolizja wyrównuje rower do biegaczy
    koparka: { tempo: 0.85, skacze: false, sloty: [], poziom: 20, zaMur: true, wlasne: true },
  };
  /** Czy postać otwarta: poziom z sumy cegieł albo (koparka) ukończony wspólny mur lub zamknięta akcja. */
  function odblokowana(id, cegly, mur, zamknieta) {
    var p = POSTACIE[id];
    if (!p) return false;
    if (!p.poziom) return true;
    return poziom(cegly) >= p.poziom || !!(p.zaMur && (Number(mur) >= MUR_CEL || zamknieta === true));
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
  /* STROJE OSOBNO NA POSTAĆ (Filip 5.11): zapis { kasia, filip, rowerzysta }. Koparki tu nie ma: rysunek zostaje bez dodatków. Kupione są wspólne, strój osobny. Stary zapis, jeden na wszystkich, trafia raz do każdej postaci. */
  /* Liczby diagnostyczne na końcu rundy: dokładnie ?diag=1 i nigdy na stronie publicznej (Filip 5.11). */
  function diagWlaczony(adres, host) { return new URLSearchParams(adres || "").get("diag") === "1" && !/(^|\.)biegamy\.(run|app)$/.test(host || ""); }
  /* Napis po przyjętej rundzie. Imię z licznika akcji, tylko po starcie: bez imienia nie ma napisu. */
  function napisMuruUlicy(imie) { return imie ? "Twoje cegły lecą na mur przy Ulicy " + dopelniacz(imie) : ""; }
  var POSTACIE_ZE_STROJEM = ["kasia", "filip", "rowerzysta"];
  function stroje(zapis, stary) {
    var w = {}, z = zapis && typeof zapis === "object" && !Array.isArray(zapis) ? zapis : null;
    POSTACIE_ZE_STROJEM.forEach(function (p) {
      var s = z ? z[p] : stary;
      w[p] = s && typeof s === "object" && !Array.isArray(s) ? s : {};
    });
    return w;
  }
  function maStroj(w) { return !!w && SLOTY.some(function (s) { return !!w[s]; }); }
  /* Magazyn: co założyć na miniaturze przedmiotu. Sam przedmiot, reszta jak na postaci, żeby było widać, jak będzie w nim wyglądać. */
  function strojZPrzedmiotem(wybor, p) { var w = {}; Object.keys(wybor || {}).forEach(function (k) { w[k] = wybor[k]; }); if (p) w[p.slot] = p.id; return w; }
  /* „Na czym jedzie” z podpisu w bazie: człon od ostatniego „ na ”. Bez nazwiska. */
  function rowerZPodpisu(opis) {
    var s = typeof opis === "string" ? opis.trim() : "", i = s.lastIndexOf(" na "), w = i >= 0 ? s.slice(i + 1) : "";
    return w && w.length <= 24 ? w : "";
  }
  function imieZPodpisu(opis) {
    var s = typeof opis === "string" ? opis.trim().split(/\s+/)[0] : "";
    return s && s.length <= 14 ? s : "";
  }
  /* Start rundy z ulepszeniem: jednorazowo, za każdą rundę osobno, nic się nie odnawia samo. */
  var ULEPSZENIA = [{ id: "kask", nazwa: "Kask", cena: 5 }, { id: "bidon", nazwa: "Bidon", cena: 4 }, { id: "rakieta", nazwa: "Przyczepka-rakieta", cena: 25, tylko: "rowerzysta" }];
  /* Rakieta (Filip 5.11): tylko rowerzysta, 4 s lotu na wysokości łuku cegieł, bez kolizji, zbiera wszystko, nad czym leci. Potem jazda bez przyczepki i chwila nietykalności na lądowanie. Ile cegieł daje, liczy pomiar bota w migracji 20261107_gra_rakieta.sql. */
  var RAKIETA = { czas_s: 4, wznos_s: 0.4, opad_s: 0.35, po_s: 0.6 };
  function ulepszenieDla(typ, postac) { var u = ULEPSZENIA.filter(function (x) { return x.id === typ; })[0]; return !!u && (!u.tylko || u.tylko === postac); }
  function wysokoscRakiety(t, postac) {
    var R = RAKIETA, h = lukCegiel(postac, 0) * 0.85;
    if (t <= 0 || t >= R.czas_s) return 0;
    if (t < R.wznos_s) { var a = t / R.wznos_s; return h * a * (2 - a); }
    if (t > R.czas_s - R.opad_s) { var b = (R.czas_s - t) / R.opad_s; return h * b * (2 - b); }
    return h + Math.sin(t * 5) * 6;
  }
  /* Klatki arkusza: 0 odpalenie, 1-3 lot, 4 lądowanie. */
  function klatkaRakiety(t, anim) { return t < 0.15 ? 0 : t > RAKIETA.czas_s - 0.3 ? 4 : 1 + Math.floor(anim * 0.5) % 3; }
  /* Plecak: po jednej sztuce każdego rodzaju na rundę i tylko to, co jest. Tę samą regułę sprawdza serwer przy zapisie wyniku. */
  function mozeUzyc(plecak, uzyte, typ) { return (Number(plecak && plecak[typ]) || 0) > 0 && (uzyte || []).indexOf(typ) < 0; }
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
  var KLATKI_KOPARKI = { jazda: [0, 1], zamach: 2, uderzenie: 3, zgarnianie: 4, radosc: 5, ile: 6, zamach_s: 0.14, uderzenie_s: 0.16, zgarnianie_s: 0.32, okno: 175, bonus: 1, stop_s: 0.6, przerwa_s: 0.45, wysokosc: 150, zlota_przed: 90 };
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
  /* Partnerzy poprzednich wyzwań: wysokość budynku na ekranie, co ile budynków na trasie. Plakat stoi na tablicy przy fabryce. Logo i plakat z licznika, tylko po zgodzie firmy. */
  var BUDYNKI_POPRZEDNICH = { osiedle: 270, galeria: 210, fabryka: 210 }, POPRZEDNI_CO = 7, PLAKATY = { fabryka: [0.7905, 0.4576, 0.1665, 0.3435] };
  function firmyZLicznika(d) {
    return (Array.isArray(d && d.firmy) ? d.firmy : []).map(function (z) {
      var nazwa = z && typeof z.nazwa === "string" ? z.nazwa.trim() : "";
      if (!nazwa || z.rodzaj === "cegielka") return null;
      return { nazwa: nazwa, logo: typeof z.logo_url === "string" && RE_LOGO_FIRMY.test(z.logo_url) ? z.logo_url : "", rodzaj: z.rodzaj === "wiezowiec" || BUDYNKI_POPRZEDNICH[z.rodzaj] ? z.rodzaj : "domek", partner: z.wsparcie === "rzeczowe",
        plakat: typeof z.plakat_url === "string" && RE_LOGO_FIRMY.test(z.plakat_url) ? z.plakat_url : "", plakatTekst: typeof z.plakat_tekst === "string" ? z.plakat_tekst : "" };
    }).filter(Boolean);
  }
  var SZYLDY = { wiezowiec: [0.2, 0.175, 0.6, 0.08], domek1: [0.2999, 0.3604, 0.4001, 0.0995], domek2: [0.2918, 0.346, 0.4152, 0.1142], domek3: [0.3145, 0.2748, 0.3716, 0.1349], domek4: [0.2813, 0.341, 0.4366, 0.106], domek5: [0.3029, 0.3139, 0.3942, 0.1227], domek6: [0.2929, 0.2996, 0.4121, 0.1163], domek7: [0.297, 0.3642, 0.406, 0.1036], osiedle: [0.3305, 0.0804, 0.3483, 0.119], galeria: [0.3131, 0.1368, 0.376, 0.2149], fabryka: [0.2378, 0.4482, 0.3103, 0.1412] };

  /* Wyzwanie dnia: odznaka tylko w grze. warunek dostaje statystyki rundy; `naKoniec` = da się ocenić dopiero po rundzie. */
  var WYZWANIA = [
    { id: "cegly-bez-upadku-50", opis: "50 cegieł bez upadku", cel: 50, stan: function (s) { return s.cegly_bez_upadku; } },
    { id: "salta-pod-rzad-3", opis: "3 salta pod rząd", cel: 3, stan: function (s) { return s.salta_pod_rzad; } },
    { id: "zlote-3", opis: "3 złote cegły", cel: 3, stan: function (s) { return s.zlote; } },
    { id: "slizgi-3", opis: "3 ślizgi pod barierką", cel: 3, stan: function (s) { return s.slizgi; } },
    { id: "seria-15", opis: "Seria 15 bez potknięcia", cel: 15, stan: function (s) { return s.seria; } },
    { id: "cegly-200", opis: "200 punktów w rundzie", cel: 200, stan: function (s) { return s.cegly; } },
    { id: "bez-upadku", opis: "Cała runda bez upadku", cel: 1, naKoniec: true, stan: function (s) { return s.koniec && s.upadki === 0 ? 1 : 0; } },
    { id: "salta-5", opis: "5 salt w rundzie", cel: 5, stan: function (s) { return s.salta; } },
    { id: "kaski-2", opis: "2 kaski w rundzie", cel: 2, stan: function (s) { return s.kaski; } },
    { id: "triki-5", opis: "5 trików", cel: 5, stan: function (s) { return s.triki; } },
    { id: "cegly-bez-upadku-100", opis: "100 cegieł bez upadku", cel: 100, stan: function (s) { return s.cegly_bez_upadku; } },
    { id: "bidony-2", opis: "2 bidony w rundzie", cel: 2, stan: function (s) { return s.bidony; } },
    { id: "seria-25", opis: "Seria 25 bez potknięcia", cel: 25, stan: function (s) { return s.seria; } },
    { id: "cegly-400", opis: "400 punktów w rundzie", cel: 400, stan: function (s) { return s.cegly; } },
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
  function pusteStaty() { return { cegly: 0, zlote: 0, salta: 0, salta_pod_rzad: 0, slizgi: 0, czyste: 0, seria: 0, upadki: 0, kaski: 0, bidony: 0, buty: 0, zele: 0, triki: 0, cegly_bez_upadku: 0, koniec: false }; }

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
  function odmianaPunktow(n) {
    var r10 = n % 10, r100 = n % 100;
    return n === 1 ? "punkt" : (r10 >= 2 && r10 <= 4 && !(r100 >= 12 && r100 <= 14)) ? "punkty" : "punktów";
  }
  function odmianaCegiel(n) {
    var r10 = n % 10, r100 = n % 100;
    return n === 1 ? "cegła" : (r10 >= 2 && r10 <= 4 && !(r100 >= 12 && r100 <= 14)) ? "cegły" : "cegieł";
  }

  g.BM_CEGIELKI = { RAKIETA: RAKIETA, ulepszenieDla: ulepszenieDla, wysokoscRakiety: wysokoscRakiety, klatkaRakiety: klatkaRakiety, napisMuruUlicy: napisMuruUlicy, diagWlaczony: diagWlaczony, MUR_SCENA: MUR_SCENA, ceglyNaScenie: ceglyNaScenie, odKtorejCegly: odKtorejCegly, flagiMuru: flagiMuru, SEKWENCJE: SEKWENCJE, sekwencjeWRundzie: sekwencjeWRundzie, dlugoscSekwencji: dlugoscSekwencji, odstepSekwencji: odstepSekwencji, nastepnaFala: nastepnaFala, mozeUzyc: mozeUzyc, tekstBonusu: tekstBonusu, DRUZYNA: DRUZYNA, druzynaWRundzie: druzynaWRundzie, grupyDruzyny: grupyDruzyny, GORKA: GORKA, gorkaWRundzie: gorkaWRundzie, nowaGorka: nowaGorka, fazaGorki: fazaGorki, tempoGorki: tempoGorki, katGorki: katGorki, klatkaGorki: klatkaGorki, TEKST_GORKI: TEKST_GORKI, tekstPrzerzutek: tekstPrzerzutek, zebraneKartki: zebraneKartki, BUDYNKI_POPRZEDNICH: BUDYNKI_POPRZEDNICH, POPRZEDNI_CO: POPRZEDNI_CO, PLAKATY: PLAKATY, planszaFinalu: planszaFinalu, latarnieZapalone: latarnieZapalone, rowerZPodpisu: rowerZPodpisu, miejsceNaLot: miejsceNaLot, czasDoZiemi: czasDoZiemi, stroje: stroje, maStroj: maStroj, POSTACIE_ZE_STROJEM: POSTACIE_ZE_STROJEM, progFigury: progFigury, FIGURY: FIGURY, LOT_OPAD: LOT_OPAD, szczytLuku: szczytLuku, figuraPoSalcie: figuraPoSalcie, strojZPrzedmiotem: strojZPrzedmiotem, punktyRundy: punktyRundy, limitCegiel: limitCegiel, limitPunktow: limitPunktow, odmianaPunktow: odmianaPunktow, PLANSZE: PLANSZE, KARTKI: KARTKI, kartka: kartka, BONUSY_MURU: BONUSY_MURU, bonusyMuru: bonusyMuru, NAGRODY: NAGRODY, nagrodyDoPoziomu: nagrodyDoPoziomu, planszaRozdzialu: planszaRozdzialu, mnoznikSerii: mnoznikSerii, progiSerii: progiSerii, ceglyKoparki: ceglyKoparki, tempoPoziomu: tempoPoziomu, krokiTempa: krokiTempa, tempoRundy: tempoRundy, mnoznikPoziomu: mnoznikPoziomu, planPoziomu: planPoziomu, kolejkaBonusow: kolejkaBonusow, wysokoscRzedu: wysokoscRzedu, wysokoscLuku: wysokoscLuku, PARY: PARY, odstepPary: odstepPary, ROZDZIALY: ROZDZIALY, rozdzial: rozdzial, tekstMnoznika: tekstMnoznika, tekstAwansu: tekstAwansu, GRA_MAKS_NA_S: GRA_MAKS_NA_S, SZEROKOSC_PIONU: 560, zaWaskoNaGre: function (cw, ch) { return cw < 320 || cw / ch < 0.4; }, ROZBIEG_ZLOTEJ: 1.25, FIZYKA: FIZYKA, zasiegPostaci: zasiegPostaci, skalaSkoku: skalaSkoku, lukCegiel: lukCegiel, wysokoscZlotej: wysokoscZlotej, firmyZLicznika: firmyZLicznika, WIEZOWIEC_CO: WIEZOWIEC_CO, SLOTY: SLOTY, DODATKI: DODATKI, KORONA_MIEJSCA: KORONA_MIEJSCA, POZIOMY: POZIOMY, MUR_CEL: MUR_CEL, poziom: poziom, postepPoziomu: postepPoziomu, POSTACIE: POSTACIE, odblokowana: odblokowana, wysokoscKasku: wysokoscKasku, imieZPodpisu: imieZPodpisu, arkuszKoparki: arkuszKoparki, KLATKI_KOPARKI: KLATKI_KOPARKI, maKorone: maKorone, strojPostaci: strojPostaci, dopelniacz: dopelniacz, zdanieOZbiorce: zdanieOZbiorce, linkZbiorki: linkZbiorki, tekstMuru: tekstMuru, procentMuru: procentMuru, odmianaZlotych: odmianaZlotych, ROWER: ROWER, rysunekKoparki: rysunekKoparki, MALY_TEMPO: MALY_TEMPO, MALY_CEGIEL_W_RZEDZIE: MALY_CEGIEL_W_RZEDZIE, poprawnyStroj: poprawnyStroj, SKLEP: SKLEP, ULEPSZENIA: ULEPSZENIA, COMBO_MAKS: COMBO_MAKS, KLATKI_H: KLATKI_H, REAKCJE: REAKCJE, NAZWY_TRIKOW: NAZWY_TRIKOW, SZYLDY: SZYLDY, WYZWANIA: WYZWANIA, dzienWaw: dzienWaw, wyzwanieDnia: wyzwanieDnia, postepWyzwania: postepWyzwania, pusteStaty: pusteStaty, parsujWyzwanieZnajomego: parsujWyzwanieZnajomego, linkWyzwania: linkWyzwania, odmianaCegiel: odmianaCegiel };
})(typeof globalThis !== "undefined" ? globalThis : this);
