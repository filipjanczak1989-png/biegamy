// MODERACJA IMION I NAZW (Filip 4.11): cegiełki, firmy i imię na kartonie w grze są publiczne przy zbiórce dla dziecka. Działa w kodzie, bez API.
// Plik BEZ import/export (globalThis.BM_MODERACJA), jak js/akcja.mjs: <script src> na stronach, import w testach.
// Zasada: dopasowanie do CAŁEGO słowa albo znanego rdzenia na POCZĄTKU słowa, nigdy zwykłe „zawiera”, bo inaczej Cyprian, Kutno i Dupont poszłyby pod nóż.
(function (g) {
  "use strict";

  /* Cyrylica i greka: raz jako litery udające łacinkę (kurwа z cyrylickim а), raz czytane wprost (курва). Sprawdzamy oba odczyty. */
  var WYGLAD = { "а": "a", "е": "e", "ё": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "к": "k", "м": "m", "т": "t", "в": "b", "н": "h", "і": "i", "ј": "j", "ѕ": "s", "ο": "o", "α": "a", "ε": "e", "ρ": "p", "τ": "t", "κ": "k", "ν": "v", "ι": "i" };
  var ODCZYT = { "ј": "j", "а": "a", "б": "b", "в": "w", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "z", "з": "z", "и": "i", "й": "j", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "cz", "ш": "sz", "щ": "sz", "ы": "y", "ь": "", "э": "e", "ю": "ju", "я": "ja", "і": "i", "ї": "i", "є": "e", "ґ": "g" };
  var LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "@": "a", "$": "s", "€": "e", "!": "i", "|": "i", "¡": "i" };
  var ZNAK_MASKI = /[*#%]/, MASKI = /[*#%]/g;

  /* ó czytamy jak u (kórwa, dópek); szerokie litery i kreski składane przez NFKD */
  function zdejmij(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[​-‏‪-‮⁠﻿­]/g, "").replace(/ó/g, "u").replace(/й/g, "ј").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
  }
  function mapuj(s, m) { return s.replace(/[\s\S]/g, function (z) { return Object.prototype.hasOwnProperty.call(m, z) ? m[z] : z; }); }
  /* v jak w, q jak ku (qrwa, qtas), ch jak h, rz jak z, y jak i; powtórzone litery zwinięte. Tą samą funkcją przechodzą słowa z list. */
  function fonetycznie(s) {
    return s.replace(/ch/g, "h").replace(/rz/g, "z").replace(/v/g, "w").replace(/q/g, "ku").replace(/x/g, "ks").replace(/y/g, "i").replace(/([a-z])\1+/g, "$1");
  }
  var postac = function (s) { return fonetycznie(mapuj(mapuj(zdejmij(s), WYGLAD), LEET)); };

  /* KAT: wulgarne (bez wyjątków), obrazliwe, polityczne, wrazliwe (przy zbiórce dla chorego dziecka), reklamowe. Reszta da się potwierdzić w panelu firm: prawdziwa firma bywa Dudą. */
  var LISTY = {
    wulgarne: {
      calyWyraz: "kurwa kurwy kurwie kurwo kurwe kurew huj huja huje hujem huju hujek hujnia hujni hujeks hoj pizda pizdy pizde pizdzie pizdo cipa cipy cipe cipka cipko cipki cipsko dupa dupy dupe dupie dupo dupek dupka dupsko dupczyc sra sram srasz srac sraka kutas kutasa kutasy fiut fiuta fiutek pierdol cwel cwele dick cock cunt shit shitty bullshit piss prick twat bitch bitches slut whore asshole arsehole anal anus blyat blyad suka suki suko suke scheisse scheiss arschloch wichser fotze hurensohn jbc jbac szczyny szczyn szczac",
      rdzen: "kurw kwrw kurewsk skurw skurczyb sukins wkurw nakurw hujow nahuj pohuj dohuj wihuj jeba jebi jebn jebu jebc zjeb zajeb wjeb wijeb najeb pojeb przijeb pzejeb dojeb ujeb rozjeb odjeb podjeb ozjeb pierdol pierdal pierdz wipierd spierd zapierd napierd opierd upierd popierd rozpierd pzepierd pizd gown gówn zasra wisra posra sraj lahoc obciag ruhac ruhan wiruh zaruh poruh fuck motherf wank blad kutasi zdzir",
    },
    obrazliwe: {
      calyWyraz: "idiota idioci idiotka matol matole dzban kurtyzana pedal pedaly pedala pedzio ciota cioty cioto ciote zid zidzi cigan cigani kacap moskal ruski ruskie lewak lewaki pisior pisiori pisowiec platfus tuskoid mongol downa down kaleka kaleki nigger fag faggot retard nazi nazista heil murzin murzini murzina lesba lesbi zboczeniec brudas brudasi grubas grubasi bialas bialasi holota spastik totenkopf zidek parh tuman wiesniak lamus lamusie loser dummkopf glupia glupi glupek smiec spasiony wieprz",
      rdzen: "frajer ciotowat debil kretin idiot imbecil dziwk dzifk szmat czarnuh ciapa bander naziol nazist faszist hitler nigger nigga fagg uposledz zidk lewack scierw spastik",
      fraza: "white power|śmieć ludzki|baby do garów",
      surowe: "14/88",
    },
    polityczne: {
      calyWyraz: "pis psl duda dudy biedroń biedronia biedroniowi kosiniak bosak mentzen braun kaczor putin trump biden zelenski orban ziobro obajtek sasin glapinski lewica lewice lewicy lewicowi konfederacja konfa antifa acab hwdp jp jp2 jp100 platforma ukri polexit antipis partia precz glosuj glosujcie",
      rdzen: "lewact tusk kaczinsk morawieck nawrock trzaskowsk holown zandberg konfederac macierewic zelensk migrant prawic konstitucj",
      fraza: "platforma obiwatelska|koalicja obiwatelska|prawo i sprawiedliwosc|trzecia droga|polska 2050|sieg heil|jebac pis|won z|gora polska|wielka polska|bialy dom|wolne sądy|komitet wyborczy|ruch narodowy|make america|make poland|great again|slawa ukrainie|dobra zmiana|polske zbaw|stop uni",
      surowe: "1312|1488",
    },
    wrazliwe: {
      calyWyraz: "przeziwa przezije rak raka rakiem nowotwór nowotworu smierc umzij umze umzec umieraj umierasz trup trupa zbiorki diagnoza dozije padnie",
      rdzen: "pogzeb trumn trumien hospicj fejk hemio inwalid oszust zlodziej pzekret scam sciem",
    },
    reklamowe: {
      rdzen: "promocj rabat znizk gratis wipzedaz tanio najtans najleps najwisz kupuj zamow zamów zadzwon sprawdz wejdz zapraszam okazj bukmah kasin pozick pozicz hwilowk bitcoin kripto foreks zarabiaj ruletk poker bonus gotowk whatsapp telegram suplement wiagr odhudz promo taniej",
      calyWyraz: "insta kup tani tania tanie oferta darmo graj skup kropka",
    },
  };
  /* Słowa z list przechodzą tę samą normalizację co wpis, więc listy można pisać zwyczajnie. */
  var WYRAZY = {}, RDZENIE = [], FRAZY = [], SUROWE = [];
  Object.keys(LISTY).forEach(function (kat) {
    var l = LISTY[kat];
    String(l.calyWyraz || "").split(/\s+/).filter(Boolean).forEach(function (w) { var p = postac(w); if (p.length >= 2 && !WYRAZY[p]) WYRAZY[p] = kat; });
    String(l.rdzen || "").split(/\s+/).filter(Boolean).forEach(function (w) { RDZENIE.push([postac(w), kat]); });
    String(l.fraza || "").split("|").filter(Boolean).forEach(function (w) { FRAZY.push([postac(w), kat]); });
    String(l.surowe || "").split("|").filter(Boolean).forEach(function (w) { SUROWE.push([w, kat]); });
  });
  /* Prawdziwe nazwiska i firmy, które zaczynają się jak wulgaryzm. */
  var WYJATKI = /^(kurwinsk|skurczinsk|jebsen)/;
  /* Mocne rdzenie łapiemy także w środku słowa. */
  var W_SRODKU = ["kurw", "pierdol", "pierdal", "fuck", "pizd", "jeban", "jebac"].map(postac);
  /* Słowo rozbite spacją: pełna forma po sklejeniu sąsiadów. */
  var PELNE = ["kurwa", "kurwy", "huj", "chuj", "jebac", "jebana", "pizda", "pierdol", "fuck", "shit", "dupa", "cipa"].map(postac);
  var REKLAMA_SUROWA = [
    [/https?:|www\.|\b[a-z0-9-]{2,}\.(pl|com|eu|net|org|shop|store|io|info|biz)\b/, "adres strony"],
    [/\s(pl|com|eu|net|org)$/, "adres strony"],
    [/[a-z0-9._-]+@[a-z0-9-]+\.[a-z]/, "adres e-mail"],
    [/(?:\+?\d[\s-]?){8,}/, "numer telefonu"],
    [/\d+\s*%|%\s*\d/, "procent"],
    [/\d\s*(zl|pln)\b/, "kwota"],
    [/(^|\s)[#@][a-z0-9_]{2,}/, "hasztag albo oznaczenie"],
    [/\bkod\b.{0,12}\d/, "kod"],
  ];

  function tokeny(s) { return s.split(/[^a-z0-9*#%$@!|€¡]+/).filter(Boolean); }
  /* Maska (k*rwa, ku**a, sk*rwiel): znak maski pasuje do dowolnej litery; wzór może być początkiem słowa. */
  function maskaNaPoczatku(t, w) {
    if (t.length < w.length) return false;
    for (var i = 0; i < w.length; i++) if (t[i] !== "." && t[i] !== w[i]) return false;
    return true;
  }
  function sprawdzSlowo(w, surowe) {
    if (ZNAK_MASKI.test(surowe)) {
      if (/^[*#%]+$/.test(surowe) || (surowe.match(MASKI) || []).length >= 2) return ["wulgarne", "gwiazdki"];
      var t = w.replace(MASKI, ".");
      for (var k in WYRAZY) if (WYRAZY[k] === "wulgarne" && k.length === t.length && maskaNaPoczatku(t, k)) return ["wulgarne", k];
      for (var m = 0; m < RDZENIE.length; m++) if (RDZENIE[m][1] === "wulgarne" && RDZENIE[m][0].length >= 3 && maskaNaPoczatku(t, RDZENIE[m][0])) return ["wulgarne", RDZENIE[m][0]];
      return null;
    }
    if (WYJATKI.test(w)) return null;
    if (Object.prototype.hasOwnProperty.call(WYRAZY, w)) return [WYRAZY[w], w];
    for (var a = 0; a < RDZENIE.length; a++) if (w.indexOf(RDZENIE[a][0]) === 0) return [RDZENIE[a][1], RDZENIE[a][0], true];
    for (var b = 0; b < W_SRODKU.length; b++) if (w.indexOf(W_SRODKU[b]) >= 0) return ["wulgarne", W_SRODKU[b], true];
    return null;
  }
  function sprawdzOdczyt(surowy) {
    var tok = tokeny(surowy), slowa = tok.map(function (t) { return fonetycznie(mapuj(t, LEET)); });
    var i, wynik;
    for (i = 0; i < tok.length; i++) { wynik = sprawdzSlowo(slowa[i], tok[i]); if (wynik) return wynik; }
    var chunki = surowy.split(/\s+/);
    for (i = 0; i < chunki.length; i++) {
      if (!/[.\-_'’–—]/.test(chunki[i])) continue;
      var zlane = chunki[i].replace(/[.\-_'’–—,;:]+/g, "");
      if (zlane && !ZNAK_MASKI.test(zlane)) { wynik = sprawdzSlowo(fonetycznie(mapuj(zlane, LEET)), zlane); if (wynik) return wynik; }
    }
    /* k u r w a, j.e.b.a.n.y, P.i.S.: co najmniej 3 pojedyncze litery pod rząd czytamy jako jedno słowo */
    for (i = 0; i < slowa.length; i++) {
      var run = "", n = 0, j = i;
      while (j < slowa.length && slowa[j].length === 1) { run += slowa[j]; n++; j++; }
      if (n >= 3) { wynik = sprawdzSlowo(fonetycznie(run), run); if (wynik) return wynik; i = j; }
    }
    /* ku rwa, ku-rwa: pełna forma ze zlepionych sąsiadów */
    for (var p = 0; p < slowa.length; p++) {
      var zlepek = "";
      for (var q = p; q < Math.min(slowa.length, p + 3); q++) {
        zlepek += slowa[q];
        if (q > p && PELNE.indexOf(fonetycznie(zlepek)) >= 0) return ["wulgarne", fonetycznie(zlepek)];
      }
    }
    var ciag = " " + slowa.join(" ") + " ";
    for (var f = 0; f < FRAZY.length; f++) if (ciag.indexOf(" " + FRAZY[f][0] + " ") >= 0) return [FRAZY[f][1], FRAZY[f][0]];
    return null;
  }

  /** → { ok: true } | { ok: false, kategoria, slowo, mozna_potwierdzic }. rodzaj: 'imie' (cegiełka, karton) | 'firma' */
  function sprawdz(tekst, opcje) {
    var o = opcje || {}, rodzaj = o.rodzaj === "firma" ? "firma" : "imie";
    var surowy = zdejmij(tekst);
    if (!surowy.trim()) return { ok: true };
    function zle(kat, slowo, zRdzenia) { return { ok: false, kategoria: kat, slowo: slowo, mozna_potwierdzic: kat !== "wulgarne" || (rodzaj === "firma" && !!zRdzenia) }; }
    for (var s = 0; s < SUROWE.length; s++) if (surowy.indexOf(SUROWE[s][0]) >= 0) return zle(SUROWE[s][1], SUROWE[s][0]);
    var czytelny = mapuj(surowy, ODCZYT);
    for (var r = 0; r < REKLAMA_SUROWA.length; r++) if (REKLAMA_SUROWA[r][0].test(czytelny)) return zle("reklamowe", REKLAMA_SUROWA[r][1]);
    var wynik = sprawdzOdczyt(mapuj(surowy, WYGLAD)) || (czytelny !== surowy ? sprawdzOdczyt(czytelny) : null);
    if (wynik) return zle(wynik[0], wynik[1], wynik[2]);
    if (rodzaj === "imie" && /^(admin|administrator|moderator|root|null|undefined|test|sponsor|reklama|anonim|nikt|brak)$/.test(surowy.trim())) return zle("reklamowe", surowy.trim());
    return { ok: true };
  }

  var NAZWY_KATEGORII = { wulgarne: "wulgaryzm", obrazliwe: "obraźliwe słowo", polityczne: "polityka", wrazliwe: "słowo nie na tę zbiórkę", reklamowe: "reklama" };
  /** Zdanie dla trenera. Bez powtarzania słowa, bo panel widzi je w polu obok. */
  function komunikat(w) {
    var n = NAZWY_KATEGORII[w && w.kategoria] || "niedozwolona treść";
    return "Ta nazwa pójdzie publicznie przy zbiórce dla dziecka, a filtr widzi tu: " + n + "." + (w && w.mozna_potwierdzic ? " Jeśli to prawdziwa nazwa, zaznacz „Sprawdziłem tę nazwę”." : "");
  }
  /** Karton w grze: imię gracza albo zapasowe hasło. Tylko pierwsze słowo, żeby nazwisko z profilu nie stało przy trasie. */
  function imieNaKarton(imie, zapas) {
    var slowo = String(imie == null ? "" : imie).trim().split(/\s+/)[0] || "", z = zapas || "Dawaj!";
    if (!slowo || slowo.length > 14 || !/^\p{L}+(?:-\p{L}+)?$/u.test(slowo)) return z;
    return sprawdz(slowo, { rodzaj: "imie" }).ok ? slowo + "!" : z;
  }

  /* Pseudonim w rankingu: publiczny na stałe, więc ostrzej niż karton. Łacinka albo cyrylica, bo innych alfabetów filtr nie umie przeczytać. Bez cyfr. Ten sam kod w przeglądarce i w EF gra-pseudonim. */
  var LITERY = "[\\p{Script=Latin}\\p{Script=Cyrillic}]+", WZOR_PSEUDONIMU = new RegExp("^" + LITERY + "(?:-" + LITERY + ")?$", "u");
  var PSEUDONIM_ZAJETY = ["biegamy", "fabian", "fabianek", "trener", "organizator"].map(postac);
  function pseudonim(tekst) {
    var s = String(tekst == null ? "" : tekst).normalize("NFKC").trim();
    if (s.length < 2 || s.length > 14) return { ok: false, blad: "Pseudonim ma od 2 do 14 liter." };
    if (!WZOR_PSEUDONIMU.test(s)) return { ok: false, blad: "Tylko litery, najwyżej jeden łącznik." };
    if (!sprawdz(s, { rodzaj: "imie" }).ok || PSEUDONIM_ZAJETY.indexOf(postac(s).replace(/-/g, "")) >= 0) return { ok: false, blad: "Ten pseudonim nie przejdzie: ranking jest publiczny, przy zbiórce dla dziecka. Wybierz inny." };
    return { ok: true, pseudonim: s };
  }

  g.BM_MODERACJA = { sprawdz: sprawdz, komunikat: komunikat, imieNaKarton: imieNaKarton, postac: postac, pseudonim: pseudonim };
})(typeof globalThis !== "undefined" ? globalThis : this);
