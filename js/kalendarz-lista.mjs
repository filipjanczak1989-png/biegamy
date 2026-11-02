// KALENDARZ — JEDNA LISTA (L1, 2.11.2026; docs/kalendarz-jedna-lista-projekt.md + docs/przeglad-fable-2026-11-02-B-kalendarz.md).
// Wspólny model dla naszych zawodów (`races`) i imprez z maszyny wyników (window.IMPREZY), scalanie duplikatów, sortowanie,
// typ imprezy (do zaślepek/okładek), województwo po mieście i filtry — JEDNO miejsce zamiast trzech kopii reguł
// (sb.js IMPREZY.toSamo, okienko impreza.mjs, races.html). Plik BEZ import/export (globalThis.BM_KALENDARZ), jak js/akcja.mjs:
// <script src> po js/tekst.mjs w races.html, import w testach (blizna-108) i w EF (okienko może importować przez ../../../js/).
//
// Klucz nazwy (kluczNazwy): bezZnakow → bez liczebników rzymskich i liczb na początku/końcu („XII Bieg Niepodległości 2026"
// → „biegniepodleglosci") → tylko litery. Przegląd B: `bezZnakow` zostawiał cyfry, więc „12." ≠ „13."; `tylkoLitery` nie znało
// liczebników rzymskich — polskie imprezy numerują edycje rzymsko równie często. Dedup (toSamo): data ±1 dzień, równy klucz
// nazwy, a gdy OBA mają miasto — jedno zaczyna się od drugiego (dzielnice: „Warszawa" ~ „Warszawa-Bemowo"). Bez „zawierania
// ≥ 10 liter" (11.11 = dziesiątki Biegów Niepodległości) — do czasu pomiaru fałszywych scaleń.
(function (g) {
  "use strict";
  var T = g.BM_TEKST;
  var RZYMSKI = /^(?:m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3}))$/;
  var NUMERACJA = /^(?:\d+|edycja|edycji|jubileuszowy|jubileuszowa)$/;

  function kluczNazwy(nazwa) {
    var s = T.bezZnakow(nazwa).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    var zbedne = function (w) { return (w.length > 1 && RZYMSKI.test(w)) || w === "i" || w === "x" || w === "v" || NUMERACJA.test(w); };
    while (s.length > 1 && zbedne(s[0])) s.shift();
    while (s.length > 1 && zbedne(s[s.length - 1])) s.pop();
    return s.join("").replace(/[^a-z]/g, "");
  }
  function kluczMiasta(m) { return T.tylkoLitery(m); }
  /** Klucz imprezy bez roku (okładka wspólna dla kolejnych edycji): nazwa | miasto. */
  function kluczBezRoku(nazwa, miasto) { return kluczNazwy(nazwa) + "|" + kluczMiasta(miasto); }
  function dni(a, b) { return Math.abs(Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000)); }
  function toSamoMiasto(a, b) {
    var x = kluczMiasta(a), y = kluczMiasta(b);
    if (!x || !y) return true;
    return x.indexOf(y) === 0 || y.indexOf(x) === 0;
  }
  /** Ten sam bieg? nasz start {name,date,city} vs impreza {nazwa,data,miejscowosc} (albo dwa elementy modelu). */
  function toSamo(a, b) {
    var na = a.nazwa != null ? a.nazwa : a.name, nb = b.nazwa != null ? b.nazwa : b.name;
    var da = a.data || a.date, db = b.data || b.date;
    var ma = a.miasto != null ? a.miasto : (a.miejscowosc != null ? a.miejscowosc : a.city);
    var mb = b.miasto != null ? b.miasto : (b.miejscowosc != null ? b.miejscowosc : b.city);
    if (!da || !db || !na || !nb) return false;
    if (dni(da, db) > 1) return false;
    var ka = kluczNazwy(na), kb = kluczNazwy(nb);
    return !!ka && ka === kb && toSamoMiasto(ma, mb);
  }

  /* TYP IMPREZY po nazwie i dystansach — tylko do grafik (zaślepka wg typu, okładka). Kolejność: nordic → wyjątki serii
     (City Trail to biegi parkowe) → ultra → trail/góry → przełaj/las/park → noc → ulica. Decyzja Filipa 2.11: nordic pokazujemy. */
  var TYPY = ["ulica", "ulica-noc", "trail", "ultra", "przelaj", "nordic"];
  function typImprezy(nazwa, dystanse) {
    var n = " " + T.bezZnakow(nazwa).replace(/[^a-z0-9]+/g, " ") + " ";
    var maks = Math.max.apply(null, [0].concat((dystanse || []).map(Number).filter(function (x) { return x > 0; })));
    if (/ nordic | walking | marsz\w* | nw /.test(n)) return "nordic";
    if (/ city trail | citytrail /.test(n)) return "ulica";
    if (/ultra/.test(n) || maks > 42.5) return "ultra";
    if (/ trail| gorsk| szlak| beskid| tatr| sudec| karkonos| bieszczad| gor | gory | wierch| szczyt| przelecz| dolin/.test(n)) return "trail";
    if (/ przelaj| lesn| las | lasu | park| cross/.test(n)) return "przelaj";
    if (/ nocn| night| noc | nocy /.test(n)) return "ulica-noc";
    return "ulica";
  }

  /* WOJEWÓDZTWO po mieście (decyzja Filipa 2.11: mapa, nie dopasowanie samym miastem). Mapa dla miast z kalendarza maszyny
     (okno 12 mies., 2.11) + miasta powiatowe; nieznane → null i linia „N bez województwa" (ten sam wzorzec co dystans).
     Jedno miejsce prawdy docelowo w kolektorze (jeśli F6 odda `wojewodztwo`, mapa staje się zapasem). */
  var WOJ = {
    dolnoslaskie: "Wrocław|Legnica|Wałbrzych|Jelenia Góra|Lubin|Głogów|Świdnica|Bolesławiec|Oleśnica|Dzierżoniów|Oława|Zgorzelec|Bielawa|Kłodzko|Jawor|Nowa|Ruda|Jelcz-Laskowice|Polkowice|Lubań|Kamienna Góra|Strzelin|Ząbkowice Śląskie|Trzebnica|Milicz|Góra|Wołów|Środa Śląska|Złotoryja|Lwówek Śląski|Kudowa-Zdrój|Lądek-Zdrój|Jedlina-Zdrój|Gryfów Śląski|Oborniki Śląskie|Prusice|Świerzawa|Sobótka|Szczawno-Zdrój|Polanica-Zdrój|Duszniki-Zdrój|Karpacz|Szklarska Poręba|Radwanice|Siechnice|Kąty Wrocławskie|Brzeg Dolny|Wilkowo",
    "kujawsko-pomorskie": "Bydgoszcz|Toruń|Włocławek|Grudziądz|Inowrocław|Brodnica|Świecie|Chełmno|Nakło nad Notecią|Rypin|Żnin|Lipno|Tuchola|Wąbrzeźno|Golub-Dobrzyń|Aleksandrów Kujawski|Ciechocinek|Solec Kujawski|Koronowo|Mogilno|Sępólno Krajeńskie|Radziejów|Janowiec Wielkopolski",
    lubelskie: "Lublin|Chełm|Zamość|Biała Podlaska|Puławy|Świdnik|Kraśnik|Łuków|Biłgoraj|Lubartów|Tomaszów Lubelski|Łęczna|Hrubieszów|Krasnystaw|Radzyń Podlaski|Międzyrzec Podlaski|Dęblin|Włodawa|Ryki|Parczew|Janów Lubelski|Kazimierz Dolny|Nałęczów",
    lubuskie: "Zielona Góra|Gorzów Wielkopolski|Nowa Sól|Żary|Żagań|Świebodzin|Międzyrzecz|Sulechów|Kostrzyn nad Odrą|Słubice|Gubin|Krosno Odrzańskie|Strzelce Krajeńskie|Drezdenko|Lubsko|Szprotawa|Wschowa|Sulęcin",
    lodzkie: "Łódź|Piotrków Trybunalski|Pabianice|Tomaszów Mazowiecki|Bełchatów|Zgierz|Skierniewice|Radomsko|Kutno|Sieradz|Zduńska Wola|Wieluń|Łowicz|Aleksandrów Łódzki|Opoczno|Ozorków|Konstantynów Łódzki|Łask|Głowno|Rawa Mazowiecka|Koluszki|Brzeziny|Łęczyca|Wieruszów|Pajęczno|Uniejów|Poddębice|Żychlin|Zelów",
    malopolskie: "Kraków|Tarnów|Nowy Sącz|Oświęcim|Chrzanów|Olkusz|Nowy Targ|Bochnia|Gorlice|Zakopane|Skawina|Wieliczka|Andrychów|Trzebinia|Wadowice|Myślenice|Kęty|Limanowa|Brzesko|Libiąż|Dąbrowa Tarnowska|Niepołomice|Rabka-Zdrój|Krynica-Zdrój|Sucha Beskidzka|Miechów|Bukowno|Proszowice|Szczawnica|Grybów|Rytro|Zembrzyce|Klucze|Gorenice|Rabsztyn|Ochotnica Dolna|Sękowa|Niedary|Zarzecze|Mogilany|Muszyna|Piwniczna-Zdrój|Stary Sącz|Krzeszowice|Słomniki",
    mazowieckie: "Warszawa|Radom|Płock|Siedlce|Pruszków|Legionowo|Ostrołęka|Otwock|Ciechanów|Mińsk Mazowiecki|Wołomin|Piaseczno|Żyrardów|Sochaczew|Grodzisk Mazowiecki|Mława|Nowy Dwór Mazowiecki|Marki|Ząbki|Płońsk|Wyszków|Piastów|Józefów|Sierpc|Garwolin|Kobyłka|Pułtusk|Łomianki|Konstancin-Jeziorna|Sulejówek|Podkowa Leśna|Maków Mazowiecki|Staroźreby|Przasnysz|Ostrów Mazowiecka|Gostynin|Grójec|Pionki|Szydłowiec|Zwoleń|Lipsko|Przysucha|Białobrzegi|Kozienice|Węgrów|Sokołów Podlaski|Łosice|Milanówek|Brwinów|Raszyn|Ożarów Mazowiecki|Błonie|Serock|Radzymin|Zielonka|Halinów|Góra Kalwaria|Wilanów",
    opolskie: "Opole|Kędzierzyn-Koźle|Nysa|Brzeg|Kluczbork|Prudnik|Strzelce Opolskie|Krapkowice|Namysłów|Głubczyce|Olesno|Zdzieszowice|Ozimek|Głuchołazy|Grodków|Gogolin|Praszka|Niemodlin|Komprachcice|Tarnów Opolski|Leśnica|Rudniki|Kamiennik|Gracze|Paczków|Byczyna|Wołczyn|Otmuchów",
    podkarpackie: "Rzeszów|Przemyśl|Stalowa Wola|Mielec|Tarnobrzeg|Krosno|Dębica|Jarosław|Sanok|Jasło|Łańcut|Przeworsk|Ropczyce|Nisko|Leżajsk|Lubaczów|Ustrzyki Dolne|Nowa Sarzyna|Kolbuszowa|Strzyżów|Sędziszów Małopolski|Brzozów|Rudnik nad Sanem|Dynów|Boguchwała|Ustrzyki|Solina|Cisna",
    podlaskie: "Białystok|Suwałki|Łomża|Augustów|Bielsk Podlaski|Zambrów|Grajewo|Hajnówka|Sokółka|Siemiatycze|Wysokie Mazowieckie|Łapy|Mońki|Kolno|Sejny|Czarna Białostocka|Supraśl|Wasilków|Choroszcz",
    pomorskie: "Gdańsk|Gdynia|Słupsk|Tczew|Starogard Gdański|Wejherowo|Rumia|Sopot|Chojnice|Malbork|Kwidzyn|Lębork|Pruszcz Gdański|Reda|Kościerzyna|Bytów|Ustka|Kartuzy|Puck|Człuchów|Władysławowo|Jastrzębia Góra|Rozewie|Hel|Jastarnia|Krynica Morska|Sztum|Nowy Dwór Gdański|Pelplin|Skarszewy|Żukowo|Bolszewo|Mikoszewo|Warcino|Łeba|Grzybowski Młyn|Studzienice|Stegna|Sierakowice|Luzino|Szemud",
    slaskie: "Katowice|Częstochowa|Sosnowiec|Gliwice|Zabrze|Bielsko-Biała|Bytom|Rybnik|Ruda Śląska|Tychy|Dąbrowa Górnicza|Chorzów|Jaworzno|Jastrzębie-Zdrój|Mysłowice|Siemianowice Śląskie|Żory|Tarnowskie Góry|Będzin|Piekary Śląskie|Racibórz|Zawiercie|Świętochłowice|Wodzisław Śląski|Mikołów|Knurów|Cieszyn|Czeladź|Czechowice-Dziedzice|Myszków|Żywiec|Lubliniec|Łaziska Górne|Bieruń|Pszczyna|Ustroń|Wisła|Radzionków|Orzesze|Pszów|Rydułtowy|Lędziny|Kłobuck|Koszęcin|Boronów|Chwałowice|Szarlejka|Niegowonice|Bobrowniki|Stanowice|Poręba|Łazy|Imielin|Kalety|Wojkowice|Szczyrk|Koniaków|Istebna|Skoczów|Strumień|Blachownia|Ogrodzieniec|Pilica|Sławków|Szczekociny",
    swietokrzyskie: "Kielce|Ostrowiec Świętokrzyski|Starachowice|Skarżysko-Kamienna|Sandomierz|Końskie|Busko-Zdrój|Jędrzejów|Staszów|Pińczów|Włoszczowa|Kazimierza Wielka|Opatów|Chęciny|Suchedniów|Sędziszów|Połaniec|Stąporków|Daleszyce|Morawica|Nowa Słupia|Bodzentyn|Łagów",
    "warminsko-mazurskie": "Olsztyn|Elbląg|Ełk|Ostróda|Iława|Giżycko|Kętrzyn|Szczytno|Bartoszyce|Mrągowo|Działdowo|Pisz|Lidzbark Warmiński|Braniewo|Olecko|Nidzica|Węgorzewo|Gołdap|Orzysz|Mikołajki|Dobre Miasto|Dywity|Rybno|Wydminy|Biskupiec|Morąg|Pasłęk|Nowe Miasto Lubawskie|Lubawa|Reszel|Ruciane-Nida|Barczewo|Olsztynek|Lidzbark",
    wielkopolskie: "Poznań|Kalisz|Konin|Piła|Ostrów Wielkopolski|Gniezno|Leszno|Swarzędz|Luboń|Śrem|Września|Krotoszyn|Turek|Jarocin|Kościan|Środa Wielkopolska|Rawicz|Wągrowiec|Złotów|Chodzież|Szamotuły|Oborniki|Koło|Pleszew|Grodzisk Wielkopolski|Wolsztyn|Nowy Tomyśl|Słupca|Gostyń|Kępno|Międzychód|Trzcianka|Czarnków|Ostrzeszów|Mosina|Puszczykowo|Czerwonak|Pobiedziska|Murowana Goślina|Kórnik|Przyłęk|Porażyn Tartak|Sątopy|Jastrzębsko Stare|Grudna|Buczyna|Janików|Radzyny|Dąbrowa|Baranowo|Komorniki|Tarnowo Podgórne|Dopiewo|Suchy Las|Rokietnica|Skoki|Opalenica|Buk|Stęszew|Kostrzyn|Śmigiel|Zbąszyń|Sieraków|Pniewy|Wronki|Krzyż Wielkopolski|Gołańcz|Żerków|Koźmin Wielkopolski|Zduny|Odolanów|Kleczew|Ślesin",
    zachodniopomorskie: "Szczecin|Koszalin|Stargard|Kołobrzeg|Świnoujście|Szczecinek|Police|Wałcz|Białogard|Goleniów|Gryfino|Nowogard|Gryfice|Świdwin|Choszczno|Barlinek|Dębno|Myślibórz|Złocieniec|Darłowo|Sławno|Drawsko Pomorskie|Łobez|Pyrzyce|Międzyzdroje|Kamień Pomorski|Trzebiatów|Połczyn-Zdrój|Karlino|Sianów|Mielno|Ustronie Morskie|Dziwnów|Rewal|Pobierowo|Niechorze|Mrzeżyno|Resko|Płoty|Wolin|Bobolice|Polanów|Borne Sulinowo|Kalisz Pomorski|Czaplinek|Recz|Ińsko|Chociwel|Dobra|Golczewo",
  };
  var MIASTO_WOJ = null;
  function mapaMiast() {
    if (MIASTO_WOJ) return MIASTO_WOJ;
    MIASTO_WOJ = {};
    Object.keys(WOJ).forEach(function (w) { WOJ[w].split("|").forEach(function (m) { var k = kluczMiasta(m); if (k) MIASTO_WOJ[k] = w; }); });
    return MIASTO_WOJ;
  }
  function wojewodztwo(miasto) {
    var k = kluczMiasta(miasto);
    if (!k) return null;
    var m = mapaMiast();
    if (m[k]) return m[k];
    // „Skawina - Mogilany", „Władysławowo - Rozewie - Jastrzębia Góra", „Warszawa-Bemowo": człony rozdzielone myślnikiem/przecinkiem —
    // pierwszy znany wygrywa; pojedyncze słowa NIE (unikamy „Nowe Miasto" ~ „Miasto")
    var czesci = String(miasto).split(/\s*[-–,/]\s*/).filter(Boolean);
    if (czesci.length > 1) for (var i = 0; i < czesci.length; i++) { var kk = kluczMiasta(czesci[i]); if (kk && m[kk]) return m[kk]; }
    return null;
  }

  /* MODEL WSPÓLNY. nasze: wiersz `races`; maszyna: element IMPREZY.szukaj().lista */
  function zNaszego(r) {
    return { zrodlo: "nasze", id: r.id, race: r, nazwa: String(r.name || ""), data: r.date, dokladnosc: "dzien", miasto: r.city || null,
      wojewodztwo: r.voivodeship || r.region || wojewodztwo(r.city) || null, dystanse: Number(r.distance_km) > 0 ? [Number(r.distance_km)] : [],
      okladka: r.cover_url || null, typ: typImprezy(r.name, [Number(r.distance_km)]), klucz: r.impreza_klucz || null, status: r.status, url: r.organizer_url || null };
  }
  function zMaszyny(i) {
    return { zrodlo: "maszyna", id: i.klucz || ("m:" + kluczBezRoku(i.nazwa, i.miejscowosc) + "|" + i.data), nazwa: String(i.nazwa || ""), data: i.data,
      dokladnosc: i.dokladnosc === "miesiac" ? "miesiac" : "dzien", miasto: i.miejscowosc || null, wojewodztwo: wojewodztwo(i.miejscowosc),
      dystanse: (i.dystanse || []).map(Number).filter(function (x) { return x > 0; }), okladka: null, typ: typImprezy(i.nazwa, i.dystanse),
      klucz: i.klucz || null, status: i.status || null, url: i.url || null };
  }
  /** Scalanie: nasze wygrywa; z pary maszyna oddaje klucz, link i brakujące dystanse (suma zbiorów). */
  function scal(nasze, maszyna) {
    var out = (nasze || []).map(zNaszego), uzyte = [];
    (maszyna || []).forEach(function (i, idx) {
      var m = zMaszyny(i);
      for (var k = 0; k < out.length; k++) {
        var n = out[k];
        if (n.zrodlo !== "nasze" || !toSamo(n, m)) continue;
        if (!n.klucz) n.klucz = m.klucz;
        if (!n.url) n.url = m.url;
        m.dystanse.forEach(function (d) { if (!n.dystanse.some(function (x) { return Math.abs(x - d) < 0.3; })) n.dystanse.push(d); });
        uzyte.push(idx); return;
      }
    });
    (maszyna || []).forEach(function (i, idx) { if (uzyte.indexOf(idx) < 0) out.push(zMaszyny(i)); });
    return sortuj(out);
  }
  function kluczSortu(x) { return x.dokladnosc === "miesiac" ? String(x.data).slice(0, 7) + "-31" : String(x.data); }
  function sortuj(lista) {
    return lista.slice().sort(function (a, b) {
      var ka = kluczSortu(a), kb = kluczSortu(b);
      if (ka !== kb) return ka < kb ? -1 : 1;
      if (a.zrodlo !== b.zrodlo) return a.zrodlo === "nasze" ? -1 : 1;
      var na = kluczNazwy(a.nazwa), nb = kluczNazwy(b.nazwa);
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
  }

  /* FILTRY na scalonej liście. f = {voi, month 'YYYY-MM', od, do, dist 'all'|'5'|'10'|'21.097'|'42.195'|'ultra'|'other', q, pokazBezDystansu, pokazBezWojewodztwa}
     → {lista, bezDystansu, bezWojewodztwa}. Dystans: „którykolwiek z listy"; impreza bez dystansu przy aktywnym chipie — ukryta i policzona. */
  function pasujeDystans(dystanse, f) {
    if (!f || f === "all") return true;
    if (!dystanse.length) return false;
    if (f === "ultra") return dystanse.some(function (k) { return k > 42.195; });
    if (f === "other") return dystanse.some(function (k) { return ![5, 10, 21.097, 42.195].some(function (d) { return Math.abs(k - d) < 0.2; }) && k <= 42.195; });
    var cel = parseFloat(f);
    return dystanse.some(function (k) { return Math.abs(k - cel) < 0.2; });
  }
  function filtruj(lista, f) {
    f = f || {};
    var q = T.normalizuj(f.q || ""), voi = T.bezZnakow(f.voi || "").trim(), bezD = 0, bezW = 0;
    var out = lista.filter(function (x) {
      if (f.month && String(x.data).slice(0, 7) !== f.month) return false;
      if (f.od && x.data < f.od) return false;
      if (f.do && x.data > f.do) return false;
      if (voi) {
        var w = x.wojewodztwo ? T.bezZnakow(x.wojewodztwo) : "";
        var tekst = x.zrodlo === "nasze" ? T.bezZnakow([x.race.voivodeship, x.race.region, x.race.city].filter(Boolean).join(" ")) : w;
        if (!w && !tekst) { bezW++; if (!f.pokazBezWojewodztwa) return false; }
        else if (w !== voi && tekst.indexOf(voi) < 0) return false;
      }
      if (f.dist && f.dist !== "all") {
        if (!x.dystanse.length) { bezD++; if (!f.pokazBezDystansu) return false; }
        else if (!pasujeDystans(x.dystanse, f.dist)) return false;
      }
      if (q && T.normalizuj(x.nazwa + " " + (x.miasto || "")).indexOf(q) < 0) return false;
      return true;
    });
    return { lista: out, bezDystansu: bezD, bezWojewodztwa: bezW };
  }
  /** Okres dla IMPREZY.szukaj (30/90/365) z filtra dat: najmniejszy, który obejmuje `do`/miesiąc; domyślnie 90 (limit 300 wierszy maszyny). */
  function okresZFiltra(f, dzis) {
    f = f || {};
    var koniec = f.do || (f.month ? f.month + "-31" : null);
    if (!koniec) return "90";
    var d = Math.ceil((Date.parse(koniec + "T12:00:00Z") - Date.parse(dzis + "T12:00:00Z")) / 86400000);
    return d <= 30 ? "30" : d <= 91 ? "90" : "365";
  }
  function dzien(d) { d = d || new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

  g.BM_KALENDARZ = { kluczNazwy: kluczNazwy, kluczMiasta: kluczMiasta, kluczBezRoku: kluczBezRoku, toSamo: toSamo, typImprezy: typImprezy, TYPY: TYPY,
    wojewodztwo: wojewodztwo, zNaszego: zNaszego, zMaszyny: zMaszyny, scal: scal, sortuj: sortuj, filtruj: filtruj, pasujeDystans: pasujeDystans,
    okresZFiltra: okresZFiltra, dzien: dzien, _mapaMiast: mapaMiast };
})(typeof globalThis !== "undefined" ? globalThis : this);
