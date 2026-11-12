// MIASTO DOBRA: prototyp do pokazania (9.11.2026). Plik BEZ import/export (globalThis.BM_MIASTO), jak js/akcja.mjs: ładowany skryptem w miasto.html, importowalny w testach.
// Miasto = ulice. Dziś jedna prawdziwa (publiczny licznik akcji przez js/akcja.mjs pobierzPubliczny: tylko pola z POLA_LICZNIKA) i cztery przykładowe, wymyślone,
// z flagą przyklad: true. Suma miasta liczy WYŁĄCZNIE ulice prawdziwe; przykłady mają oznaczenie przy nazwie i przy każdej liczbie. Imię bohatera prawdziwej ulicy
// przychodzi z licznika (po starcie), w kodzie go nie ma. Przykłady: bez imion dzieci, nazwisk, opisów zdrowia, prawdziwych firm i organizacji. Kreator niczego nie zapisuje
// i nie wysyła: to atrapa. Jedyny zapis w przeglądarce: ostatni znany stan prawdziwej ulicy (localStorage), żeby strona wyglądała dobrze bez sieci, z dopiskiem „stan z …”.
(function (g) {
  "use strict";
  var BAZA = "https://afqojgkaveykxbltxzwm.supabase.co";   // adres projektu jest publiczny (ten sam w sb.js); strona nie ładuje sb.js, żeby otwierała się szybko
  var SLUG_PRAWDZIWEJ = "dla-fabianka", STRONA_PRAWDZIWEJ = "dla-fabianka.html";
  var KLUCZ_PAMIECI = "bm_miasto_ulica";
  /** Jedyne pola licznika, które miasto czyta. Nic z wizerunku, plików, pieniędzy ani wyprawy. */
  var POLA_LICZNIKA = ["wystartowala", "nazwa", "imie", "cel_km", "suma_km", "pct", "koniec", "zamknieta", "firmy", "ulica"];

  /* ── JEDNA DROGA, PIĘĆ POZIOMÓW (decyzja 12.11): każda ulica zaczyna od biegu wirtualnego i rośnie. Poziom odblokowuje aktywność ludzi i potwierdzenie
     organizacji, NIGDY opłata. „odblokowuje” = co otwiera NASTĘPNY poziom (zdanie przy następnym szczeblu na drabince). ── */
  var POZIOMY = [
    { nr: 1, nazwa: "Bieg", krotko: "bieg wirtualny", opis: "Jeden weekend, każdy biegnie albo idzie 5 lub 10 km u siebie. Nic nie kosztuje, bez sponsora, od ręki.",
      odblokowuje: "zapisy i pierwsze kilometry na biegu oraz potwierdzenie organizacji, że chce ulicy z celem kilometrowym" },
    { nr: 2, nazwa: "Ulica", krotko: "cel km, mur cegieł", opis: "Ulica z celem w kilometrach i murem, w którym stają cegły darczyńców. Droga rośnie z każdym treningiem.",
      odblokowuje: "pierwsze cegły darczyńców w murze i zgoda organizacji na firmy na ulicy" },
    { nr: 3, nazwa: "Firmy", krotko: "domki i sponsorzy", opis: "Firmy stawiają domki, sponsorują kilometry albo opiekują się odcinkiem drogi. Każda droga kończy się wpłatą u organizacji.",
      odblokowuje: "kilka firm na ulicy i potwierdzenie organizacji, że chce wyzwania klas i zespołów" },
    { nr: 4, nazwa: "Drużyny", krotko: "klasy i firmy", opis: "Klasy i zespoły z firm zbierają kilometry jako drużyny. Ranking razem i na osobę, bez rankingu dzieci.",
      odblokowuje: "osiągnięcie celu kilometrowego; ulicę zamyka organizacja" },
    { nr: 5, nazwa: "Zbudowana", krotko: "cel osiągnięty", opis: "Cel osiągnięty, ulica otwarta. Zostaje w mieście na stałe z murem imion i domkami firm.", odblokowuje: "" }
  ];
  var ZASADA_POZIOMOW = "Poziom odblokowuje aktywność ludzi i potwierdzenie organizacji, nigdy opłata.";
  var ZASADA_WYBORU = "Jedna ulica naraz, kilometry liczą się od chwili wyboru, bez wyboru nie liczą się nigdzie.";
  /* Świat gry = avatar bohatera (rysunkowa postać ze świata, bez zdjęć i podobizn). Ikony: koparka z Ulicy, reszta z assets/miasto (10.11); emoji jako zapas, gdy obrazu brak. */
  /* postac = rysunkowy bohater świata (bez imienia dziecka), dopelniacz do tytułu biegu („Bieg Małego Kosmonauty”, decyzja 12.11) */
  var SWIATY = [{ id: "budowa", nazwa: "Budowa", opis: "koparki, dźwigi, cegły", obraz: "assets/ulica/koparka.webp", postac: "Mały Budowniczy", dopelniacz: "Małego Budowniczego" }, { id: "kosmos", nazwa: "Kosmos", opis: "rakiety i planety", obraz: "assets/miasto/swiat-kosmos.webp", emoji: "🚀", postac: "Mały Kosmonauta", dopelniacz: "Małego Kosmonauty" },
    { id: "dinozaury", nazwa: "Dinozaury", opis: "ślady i wulkany", obraz: "assets/miasto/swiat-dinozaury.webp", emoji: "🦖", postac: "Mały Odkrywca", dopelniacz: "Małego Odkrywcy" }, { id: "pilka", nazwa: "Piłka", opis: "boisko i bramki", obraz: "assets/miasto/swiat-pilka.webp", emoji: "⚽", postac: "Mały Piłkarz", dopelniacz: "Małego Piłkarza" },
    { id: "zwierzeta", nazwa: "Zwierzęta", opis: "łąka i zagroda", obraz: "assets/miasto/swiat-zwierzeta.webp", emoji: "🐾", postac: "Mały Przyjaciel Zwierząt", dopelniacz: "Małego Przyjaciela Zwierząt" }, { id: "bez", nazwa: "Bez bohatera", opis: "bieg przez Miasto Dobra", obraz: "assets/miasto/swiat-miasto.webp" }];
  function swiat(id) { for (var i = 0; i < SWIATY.length; i++) if (SWIATY[i].id === id) return SWIATY[i]; return SWIATY[0]; }
  /* Jedno neutralne zdanie o celu we wszystkich przykładach (decyzja 12.11): bez nazw chorób, oznaczone „od organizacji”. Na prawdziwej ulicy zdania nie ma, bo nie ma go w liczniku. */
  var CEL_PRZYKLADU = "Zbieramy na leczenie i rehabilitację.";

  /* ── ULICE PRZYKŁADOWE (wymyślone; nazwy neutralne, bez osób; bohaterowie jako postacie ze świata, nie dzieci) ─────────────────────────────── */
  var PRZYKLADY = [
    /* poziom 1: pokaz od A do Z na miasto-bieg.html (wejście tylko z tej karty); udział bezpłatny, wpłata dobrowolna i tylko u organizacji (decyzja 10.11) */
    { id: "bieg", przyklad: true, status: "trwa", poziom: 1, nazwa: "Bieg Wirtualny", forma: "Wirtualny bieg charytatywny", strona: "miasto-bieg.html",
      bohater: { swiat: "kosmos", postac: "Mały Kosmonauta" },
      opis: "W jeden weekend każdy biegnie albo idzie 5 lub 10 km tam, gdzie mieszka, i zapisuje trening w BiegaMy. Udział jest bezpłatny; kto chce, wspiera zbiórkę bezpośrednio u organizacji. Od BiegaMy: numer startowy, dyplom i odznaka.",
      cel_km: 5000, suma_km: 1840, osoby_n: 312, cegly_n: 180, firmy_n: 3, etykieta: "5 i 10 km w weekend" },
    /* poziom 4: pokaz od A do Z na miasto-druzyny.html (11.11): klasy bez kont i bez danych dzieci, firmy z kontami, ranking razem i na osobę */
    { id: "szkolna", przyklad: true, status: "trwa", poziom: 4, nazwa: "Ulica Szkolna", forma: "Wyzwanie szkół i firm", strona: "miasto-druzyny.html", przycisk: "Zobacz wyzwanie ›",
      bohater: { swiat: "pilka", postac: "Mały Piłkarz" },
      opis: "Klasy albo zespoły z firm zbierają kilometry jako drużyny. Na ulicy stoi ranking drużyn, a każdy kilometr buduje tę samą drogę. Firmy mogą postawić domek z logo.",
      cel_km: 8000, suma_km: 3210, osoby_n: 260, druzyny_n: 14, cegly_n: 95, firmy_n: 4, etykieta: "ranking klas" },
    { id: "urodzinowa", przyklad: true, status: "trwa", poziom: 2, nazwa: "Ulica Urodzinowa", forma: "Osobista zbiórka urodzinowa",
      bohater: { swiat: "zwierzeta", postac: "Mały Przyjaciel Zwierząt" },
      opis: "Zamiast prezentów: „30 km na urodziny” i link do zbiórki. Znajomi dokładają kilometry i cegły z imieniem w murze. Mała ulica na kilka dni.",
      cel_km: 30, suma_km: 19, osoby_n: 11, cegly_n: 11, firmy_n: 0, etykieta: "30 km na urodziny" },
    { id: "sloneczna", przyklad: true, status: "zakonczona", poziom: 5, nazwa: "Ulica Słoneczna", forma: "Ulica zbudowana: cel osiągnięty",
      bohater: { swiat: "dinozaury", postac: "Mały Odkrywca" },
      opis: "Cel osiągnięty, ulica otwarta. Zostaje w mieście na stałe: z murem imion, domkami firm i podsumowaniem tego, co się udało. Sukces, który widać na mapie.",
      cel_km: 10000, suma_km: 10000, osoby_n: 1240, cegly_n: 420, firmy_n: 12, dni_n: 41, etykieta: "cel osiągnięty",
      podsumowanie: ["10 000 km w 41 dni", "1 240 osób, 420 cegieł w murze, 12 firm na ulicy", "Zbiórka organizacji zakończona sukcesem. Ulica zostaje w mieście."] }
  ];
  var WOLNA = { id: "wolna", wolna: true, nazwa: "Wolna działka", etykieta: "zacznij od biegu" };
  /** Poziom ulicy: przykład ma wpisany; prawdziwa (wzorcowa) wyliczony z licznika: zbudowana → 5, firmy na ulicy → 3, cel i mur → 2. Bez licznika → null. */
  function poziomUlicy(u) {
    if (!u || u.wolna) return null;
    if (u.przyklad) return u.poziom || 1;
    if (u.status === "zakonczona") return 5;
    if (u.status !== "trwa") return null;
    if (Number(u.firmy_n) > 0) return 3;
    return Number(u.cel_km) > 0 ? 2 : 1;
  }
  function poziom(nr) { return POZIOMY[Math.max(1, Math.min(5, Number(nr) || 1)) - 1]; }

  /* ── POMOCNICZE ───────────────────────────────────────────────────────────────────────────── */
  function esc(s) { return g.escapeHtml ? g.escapeHtml(String(s == null ? "" : s)) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function liczba(n, miejsc) {
    n = Number(n); if (!isFinite(n)) n = 0;
    var m = miejsc == null ? 0 : miejsc, t = (Math.round(Math.abs(n) * Math.pow(10, m)) / Math.pow(10, m)).toFixed(m), cz = t.split("."), ul = (cz[1] || "").replace(/0+$/, "");
    return (n < 0 ? "-" : "") + cz[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (ul ? "," + ul : "");
  }
  function km(x) { var n = Number(x) || 0; return liczba(n, n > 0 && n < 10 ? 1 : 0); }
  /** Procent celu z jednym miejscem, w dół, najwyżej 100 (jak licznik akcji: floor). */
  function procent(u) { if (!u || !(Number(u.cel_km) > 0)) return 0; return Math.min(100, Math.floor(Number(u.suma_km || 0) / Number(u.cel_km) * 1000) / 10); }
  /** Forma słowa do liczby: „cegła”, „cegły”, „cegieł” = formy [1, 2–4, 5+]. */
  function forma(n, f) { n = Math.abs(Math.round(Number(n) || 0)); var r = n % 10, s = n % 100; return n === 1 ? f[0] : r >= 2 && r <= 4 && (s < 12 || s > 14) ? f[1] : f[2]; }
  function odmiana(n, f) { return liczba(n) + " " + forma(n, f); }
  function dopelniacz(imie) { return g.BM_AKCJA && g.BM_AKCJA.dopelniacz ? g.BM_AKCJA.dopelniacz(imie) : String(imie || ""); }

  /* ── PRAWDZIWA ULICA Z LICZNIKA ───────────────────────────────────────────────────────────── */
  /** Licznik → ulica. Czyta tylko POLA_LICZNIKA; brak licznika → ulica bez liczb (status 'brak'), przed startem → 'przed'. */
  function ulicaZLicznika(d) {
    var u = { id: "prawdziwa", prawdziwa: true, slug: SLUG_PRAWDZIWEJ, strona: STRONA_PRAWDZIWEJ, nazwa: "Ulica akcji BiegaMy", forma: "Wspólne kilometry dla jednej zbiórki", etykieta: "", status: "brak" };
    if (!d || typeof d !== "object") return u;
    if (d.wystartowala !== true) { u.status = "przed"; u.etykieta = "wkrótce"; return u; }
    var im = dopelniacz(d.imie);
    u.nazwa = im ? "Ulica " + im : (d.nazwa ? String(d.nazwa) : u.nazwa);
    u.tytul = d.nazwa ? String(d.nazwa) : "";
    u.cel_km = Number(d.cel_km) || 0; u.suma_km = Number(d.suma_km) || 0;
    u.pct = d.pct == null ? procent(u) : Number(d.pct) || 0;
    u.cegly_n = d.ulica && typeof d.ulica === "object" ? Number(d.ulica.cegly_n) || 0 : 0;
    u.firmy_n = Array.isArray(d.firmy) ? d.firmy.length : 0;
    u.status = d.koniec || d.zamknieta === true ? "zakonczona" : "trwa";
    u.etykieta = u.status === "zakonczona" ? "zakończona" : "trwa";
    return u;
  }
  /** Ostatni znany stan prawdziwej ulicy w localStorage (try/catch: tryb prywatny, brak zgody). Zapisujemy ulicę, nie surowy licznik. */
  function zapamietaj(u, teraz) {
    if (!u || u.status === "brak") return false;
    try { g.localStorage.setItem(KLUCZ_PAMIECI, JSON.stringify({ t: teraz || Date.now(), u: u })); return true; } catch (e) { return false; }
  }
  function odczytaj() {
    try { var z = JSON.parse(g.localStorage.getItem(KLUCZ_PAMIECI) || "null"); return z && z.u && typeof z.u === "object" && z.t ? { t: Number(z.t), u: z.u } : null; } catch (e) { return null; }
  }
  function stanZ(t) {
    var d = new Date(Number(t)); if (!isFinite(d.getTime())) return "";
    var p = function (x) { return String(x).padStart(2, "0"); };
    return "stan z " + d.getDate() + "." + p(d.getMonth() + 1) + ", " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  /** Publiczny licznik przez js/akcja.mjs (EF akcja-licznik, sesja 60 s). Bez BM_AKCJA → null (strona rysuje się z zapisanego stanu). */
  function pobierzPrawdziwa() {
    var A = g.BM_AKCJA;
    if (!A || !A.pobierzPubliczny) return Promise.resolve(null);
    return A.pobierzPubliczny(SLUG_PRAWDZIWEJ, { baza: BAZA }).then(function (d) { return d ? ulicaZLicznika(d) : null; }, function () { return null; });
  }

  /* ── MIASTO ───────────────────────────────────────────────────────────────────────────────── */
  function ulice(prawdziwa) { return [prawdziwa || ulicaZLicznika(null)].concat(PRZYKLADY); }
  /** Suma miasta: tylko ulice prawdziwe z liczbami. Przykłady nigdy. */
  function sumaMiasta(lista) {
    var km = 0, prawdziwe = 0, przyklady = 0;
    (lista || []).forEach(function (u) {
      if (u.przyklad) { przyklady++; return; }
      if (u.prawdziwa && (u.status === "trwa" || u.status === "zakonczona")) { km += Number(u.suma_km) || 0; prawdziwe++; }
    });
    return { km: km, prawdziwe_n: prawdziwe, przyklady_n: przyklady };
  }
  function podpisSumy(s) {
    return (s.prawdziwe_n ? odmiana(s.prawdziwe_n, ["ulica prawdziwa", "ulice prawdziwe", "ulic prawdziwych"]) : "prawdziwa ulica czeka na licznik") + ", " + odmiana(s.przyklady_n, ["przykładowa", "przykładowe", "przykładowych"]);
  }

  /* ── KARTA ULICY ──────────────────────────────────────────────────────────────────────────── */
  function chipPoziomu(u) { var p = poziomUlicy(u); return p ? '<span class="md-chip md-chip--poziom">POZIOM ' + p + ' Z 5</span>' : ""; }
  function chip(u) {
    if (u.wolna) return '<span class="md-chip md-chip--wolna">WOLNA DZIAŁKA</span>';
    /* jedno słowo wszędzie (decyzja 10.11): ZBUDOWANA na mapie, na karcie i w narzędziu, nie „zakończona” */
    if (u.przyklad) return '<span class="md-chip md-chip--przyklad">PRZYKŁAD</span>' + (u.status === "zakonczona" ? '<span class="md-chip md-chip--koniec">ZBUDOWANA</span>' : "") + chipPoziomu(u);
    /* prawdziwa = ULICA WZORCOWA (decyzja 12.11): „tak może wyglądać Twoja” */
    if (u.status === "zakonczona") return '<span class="md-chip md-chip--koniec">ZBUDOWANA</span><span class="md-chip md-chip--wzor">WZORCOWA</span>' + chipPoziomu(u);
    if (u.status === "trwa") return '<span class="md-chip md-chip--trwa">TRWA</span><span class="md-chip md-chip--wzor">WZORCOWA</span>' + chipPoziomu(u);
    return '<span class="md-chip md-chip--wkrotce">' + (u.status === "przed" ? "WKRÓTCE" : "LICZNIK NIEDOSTĘPNY") + '</span>';
  }
  /** Drabinka ulicy: pięć szczebli, obecny zaznaczony, przy następnym jedno zdanie, co go odblokowuje; pod spodem zasada bez opłat. */
  function drabinkaHtml(u) {
    var tu = poziomUlicy(u); if (!tu) return "";
    var h = '<ol class="md-drabinka" aria-label="Drabinka ulicy: poziom ' + tu + ' z 5">';
    POZIOMY.forEach(function (p) {
      var kl = p.nr < tu ? "md-szczebel--byl" : p.nr === tu ? "md-szczebel--tu" : "md-szczebel--dalej";
      h += '<li class="md-szczebel ' + kl + '"' + (p.nr === tu ? ' aria-current="step"' : "") + '><b>' + p.nr + '</b><span>' + esc(p.nazwa) + '</span><small>' + esc(p.krotko) + '</small></li>';
    });
    h += '</ol>';
    if (tu < 5) h += '<p class="md-odblokuj">Następny poziom, <b>' + esc(poziom(tu + 1).nazwa) + '</b>, odblokowuje: ' + esc(poziom(tu).odblokowuje) + '.</p>';
    else h += '<p class="md-odblokuj">Najwyższy poziom: ulica zbudowana zostaje w mieście na stałe.</p>';
    return h + '<p class="md-zasada">' + esc(ZASADA_POZIOMOW) + '</p>';
  }
  /** Bohater ulicy (tylko przykłady): avatar ze świata, postać bez imienia, jedno zdanie o celu oznaczone „od organizacji”, przycisk do historii u organizacji (atrapa).
   *  Na prawdziwej ulicy nic: w publicznym liczniku nie ma ani zdania o celu, ani świata; niczego nie dopisujemy od siebie. */
  function bohaterHtml(u) {
    if (!u || !u.przyklad || !u.bohater) return "";
    var s = swiat(u.bohater.swiat), ikona = s.obraz ? '<img src="' + esc(s.obraz) + '" alt="">' : '<span class="md-emoji" aria-hidden="true">' + esc(s.emoji || "") + '</span>';
    return '<div class="md-bohater">' + ikona + '<div><b>' + esc(u.bohater.postac) + '</b><p class="md-cel"><span class="md-od-org">od organizacji</span> ' + esc(CEL_PRZYKLADU) + '</p></div></div>' +
      '<button type="button" class="md-przycisk md-przycisk--cichy md-historia" data-historia>Poznaj historię u organizacji ›</button>';
  }
  function liczbaHtml(duze, male, przyklad) { return '<div class="md-liczba"><b>' + esc(duze) + '</b><span>' + esc(male) + '</span>' + (przyklad ? '<i class="md-przyklad">przykład</i>' : "") + '</div>'; }
  function liczbyHtml(u) {
    var p = !!u.przyklad, pct = u.pct != null ? Number(u.pct) : procent(u);
    return '<div class="md-liczby">' +
      liczbaHtml(km(u.suma_km) + " km", "z " + km(u.cel_km) + " km celu", p) +
      liczbaHtml(liczba(pct, 1) + " %", "celu", p) +
      liczbaHtml(liczba(u.cegly_n), forma(u.cegly_n, ["cegła", "cegły", "cegieł"]) + " w murze", p) +
      liczbaHtml(liczba(u.firmy_n), forma(u.firmy_n, ["firma", "firmy", "firm"]) + " na ulicy", p) +
      (u.osoby_n != null ? liczbaHtml(liczba(u.osoby_n), forma(u.osoby_n, ["osoba", "osoby", "osób"]), p) : "") +
      (u.druzyny_n != null ? liczbaHtml(liczba(u.druzyny_n), forma(u.druzyny_n, ["drużyna", "drużyny", "drużyn"]), p) : "") +
      '</div><div class="md-pasek" role="img" aria-label="' + esc(liczba(pct, 1)) + ' % celu"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
  }
  /** Karta ulicy: tytuł, znaczki, liczby (przykład przy każdej), opis, podsumowanie, stan, przycisk. opcje.stanZ: czas zapisu (ms) przy braku sieci. */
  function kartaHtml(u, opcje) {
    var o = opcje || {}, h = '<div class="md-karta" data-ulica="' + esc(u.id) + '">' + '<div class="md-chipy">' + chip(u) + '</div>' + '<h2>' + esc(u.nazwa) + '</h2>';
    if (u.wolna) {
      return h + '<p class="md-forma">Każda ulica zaczyna od biegu wirtualnego</p><p class="md-opis">Bieg nic nie kosztuje, nie potrzebuje sponsora i rusza od ręki. Potem ulica rośnie poziomami: cel i mur cegieł, firmy, drużyny, aż do zbudowania. Pieniądze idą prosto do organizacji prowadzącej zbiórkę. BiegaMy nic nie przyjmuje.</p>' +
        '<button type="button" class="md-przycisk" data-kreator>Załóż bieg w minutę ›</button></div>';
    }
    h += '<p class="md-forma">' + esc(u.forma || "") + (u.tytul && u.tytul !== u.nazwa ? ' · ' + esc(u.tytul) : "") + '</p>';
    h += bohaterHtml(u);
    if (u.status === "brak" || u.status === "przed") {
      h += '<p class="md-opis">' + (u.status === "przed" ? "Ulica w przygotowaniu. Liczby pojawią się po starcie akcji." : "Licznik chwilowo nie odpowiada. Liczby pojawią się, gdy wróci internet.") + '</p>';
    } else {
      h += liczbyHtml(u);
      if (u.przyklad) h += '<p class="md-uwaga">Dane wymyślone na potrzeby pokazu. Nie wchodzą do licznika miasta.</p>';
      if (u.prawdziwa) h += '<p class="md-wzor">Ulica wzorcowa: prawdziwa zbiórka, prawdziwe kilometry. Tak może wyglądać Twoja.</p>';
      if (u.opis) h += '<p class="md-opis">' + esc(u.opis) + '</p>';
      if (u.podsumowanie && u.podsumowanie.length) h += '<ul class="md-podsumowanie">' + u.podsumowanie.map(function (z) { return '<li>' + esc(z) + '</li>'; }).join("") + '</ul>';
      h += drabinkaHtml(u);
    }
    if (u.prawdziwa && o.stanZ) h += '<p class="md-stan">' + esc(stanZ(o.stanZ)) + ' · licznik chwilowo niedostępny</p>';
    if (u.prawdziwa) h += '<a class="md-przycisk" href="' + esc(u.strona || STRONA_PRAWDZIWEJ) + '">Wejdź na ulicę ›</a>';
    else if (u.strona) h += '<a class="md-przycisk" href="' + esc(u.strona) + '">' + esc(u.przycisk || "Zobacz bieg ›") + '</a>';   // pełny pokaz przykładu (bieg, drużyny): osobna strona, też oznaczona PRZYKŁAD
    else h += '<button type="button" class="md-przycisk md-przycisk--przyklad" data-podglad="' + esc(u.id) + '">Zobacz, jak wyglądałaby ulica ›</button>';
    return h + '</div>';
  }
  /** Etykieta na mapie: dwie linie, bez imion w kodzie; przykład dostaje znaczek w CSS; `poziom` = tekst znaczka poziomu („poziom 1 z 5”, prawdziwa: „wzorcowa · poziom 2 z 5”). */
  function etykietaMapy(u) {
    var p = poziomUlicy(u), zn = p ? (u.prawdziwa ? "wzorcowa · " : "") + "poziom " + p + " z 5" : "";
    if (u.wolna) return { tytul: u.nazwa, podpis: u.etykieta, poziom: "" };
    if (u.status === "brak") return { tytul: u.nazwa, podpis: "licznik chwilowo niedostępny", poziom: "" };
    if (u.status === "przed") return { tytul: u.nazwa, podpis: "wkrótce", poziom: "" };
    /* Przykłady (decyzja 10.11): nazwa + jedna krótka linia o formie akcji, bez liczb; liczby przykładów tylko na karcie. */
    if (u.przyklad) return { tytul: u.nazwa, podpis: u.etykieta || "", poziom: zn };
    /* Prawdziwa: km w tytule (szeroka działka); w podpisie wartości zerowe pomijane („5,8 % celu · 1 cegła”, bez „0 firm”); na karcie zero zostaje. */
    var pct = u.pct != null ? Number(u.pct) : procent(u), czesci = [u.status === "zakonczona" ? "zbudowana" : liczba(pct, 1) + " % celu"];
    if (Number(u.cegly_n) > 0) czesci.push(odmiana(u.cegly_n, ["cegła", "cegły", "cegieł"]));
    if (Number(u.firmy_n) > 0) czesci.push(odmiana(u.firmy_n, ["firma", "firmy", "firm"]));
    return { tytul: u.nazwa + " · " + km(u.suma_km) + " km", podpis: czesci.join(" · "), poziom: zn };
  }

  /* ── KREATOR „ZAŁÓŻ BIEG W MINUTĘ” (decyzja 12.11; atrapa: nic nie zapisuje, nic nie wysyła). Jeden ekran: link do zbiórki, termin (domyślnie najbliższy weekend),
     bohater (świat i avatar albo „bez bohatera”). Stary kreator z listą form zniknął: formy to poziomy na drabince. ── */
  var KREATOR = { tytul: "Załóż bieg w minutę", opis: "Pierwszy poziom każdej ulicy: nic nie kosztuje, nie potrzebuje sponsora i rusza od ręki. Udział bezpłatny; wpłaty tylko u organizacji prowadzącej zbiórkę.",
    pytanieSwiata: "Kto jest bohaterem tego biegu?", dopisekSwiata: "Ten sam bieg, inny świat: zmieniają się tylko grafiki na ulicy i w grze. Rysunkowa postać, bez zdjęć.",
    zgoda: "Organizacja prowadząca zbiórkę wie o tym biegu i go potwierdzi.", potwierdzenie: "Bieg będzie widoczny dla wszystkich po potwierdzeniu przez opiekuna albo organizację." };
  /** Najbliższy weekend: sobota ≥ jutro (ISO YYYY-MM-DD w czasie lokalnym, jak kalendarz telefonu). */
  function najblizszyWeekend(teraz) {
    var d = new Date(teraz || Date.now()); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + 1);
    while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
    var p = function (x) { return String(x).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function kreatorHtml(opcje) {
    var o = opcje || {}, termin = o.termin || najblizszyWeekend(o.teraz), h = '<div class="md-kreator-krok" data-kreator-ekran>';
    h += '<h3>' + esc(KREATOR.tytul) + '</h3><p class="md-opis">' + esc(KREATOR.opis) + '</p>';
    h += '<label class="md-pole" for="md-pole-link"><span>Link do oficjalnej zbiórki</span><input id="md-pole-link" type="url" autocomplete="off" inputmode="url" placeholder="https://…"></label>';
    h += '<label class="md-pole" for="md-pole-termin"><span>Termin (weekend biegu)</span><input id="md-pole-termin" type="date" value="' + esc(termin) + '"></label>';
    h += '<p class="md-pytanie">' + esc(KREATOR.pytanieSwiata) + '</p><div class="md-swiaty">' + SWIATY.map(function (s, j) {
      var ikona = s.obraz ? '<img src="' + esc(s.obraz) + '" alt="">' : '<span class="md-emoji" aria-hidden="true">' + esc(s.emoji) + '</span>';
      return '<label class="md-swiat' + (s.id === "bez" ? " md-swiat--bez" : "") + '"><input type="radio" name="md-swiat" value="' + esc(s.id) + '"' + (j === 0 ? " checked" : "") + '>' + ikona + '<b>' + esc(s.nazwa) + '</b><small>' + esc(s.opis) + '</small></label>';
    }).join("") + '</div><p class="md-dopisek">' + esc(KREATOR.dopisekSwiata) + '</p>';
    h += '<label class="md-zgoda"><input type="checkbox" id="md-zgoda-org"> <span>' + esc(KREATOR.zgoda) + '</span></label>';
    h += '<div class="md-kreator-stopka"><button type="button" class="md-przycisk" data-zatwierdz>Załóż bieg ›</button></div>';
    h += '<p class="md-wkrotce">To prototyp: niczego nie zapisuje i nie wysyła.</p></div>';
    return h;
  }
  /** Podgląd po zatwierdzeniu: strona biegu z bramą (ta sama grafika co na mapie), plakat i kod QR (koder z js/miasto-bieg.mjs, gdy wczytany), komunikat o potwierdzeniu. */
  /** Weekend biegu z soboty: „14–15.11.2026”; na przełomie miesiąca „30.11–1.12.2026”, roku „31.12.2026–1.01.2027”. Zły termin → "". */
  function zakresWeekendu(termin) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(termin || "")); if (!m) return "";
    var a = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12), b = new Date(a.getTime() + 86400000);
    if (isNaN(a.getTime())) return "";
    var mies = function (x) { return (x.getMonth() + 1) + "." + x.getFullYear(); };
    if (a.getFullYear() !== b.getFullYear()) return a.getDate() + "." + mies(a) + "–" + b.getDate() + "." + mies(b);
    if (a.getMonth() !== b.getMonth()) return a.getDate() + "." + (a.getMonth() + 1) + "–" + b.getDate() + "." + mies(b);
    return a.getDate() + "–" + b.getDate() + "." + mies(a);
  }
  function podgladBieguHtml(dane, qrSvg) {
    var d = dane || {}, s = swiat(d.swiat), tytul = s.dopelniacz ? "Bieg " + s.dopelniacz : "Bieg przez Miasto Dobra";   // tytuł z nazwy postaci (decyzja 12.11)
    var termin = zakresWeekendu(d.termin), link = d.link && /^https:\/\//.test(String(d.link)) ? String(d.link) : "";
    var h = '<div class="md-podglad-biegu" data-podglad-biegu><div class="md-chipy"><span class="md-chip md-chip--przyklad">PODGLĄD</span><span class="md-chip md-chip--poziom">POZIOM 1 Z 5</span></div><h3>' + esc(tytul) + '</h3>';
    h += '<div class="md-brama"><img class="md-brama-tlo" src="assets/ulica/wzgorza.webp" alt=""><img class="md-brama-znak" src="assets/miasto/brama-start-meta.webp" alt=""><div class="md-brama-droga"></div>' + (s.obraz ? '<img class="md-brama-bohater" src="' + esc(s.obraz) + '" alt="">' : "") + '</div>';
    h += '<div class="md-plakat"><div class="md-plakat-karta"><small>BiegaMy · Miasto Dobra</small><b>' + esc(tytul) + '</b><span>5 i 10 km, u siebie' + (termin ? ' · ' + esc(termin) : "") + '</span><span>Udział bezpłatny. Wpłata tylko u organizacji.</span>' + (link ? '<em>' + esc(link.replace(/^https:\/\//, "")) + '</em>' : "") + '</div>' +
      '<div class="md-qr">' + (qrSvg || '<span class="md-qr-puste">kod QR</span>') + '<small>plakat i kod QR do strony biegu</small></div></div>';
    h += '<p class="md-potwierdzenie">' + esc(KREATOR.potwierdzenie) + '</p><p class="md-wkrotce">To prototyp: niczego nie zapisuje i nie wysyła.</p>';
    h += '<a class="md-przycisk md-przycisk--przyklad" href="miasto-bieg.html">Zobacz przykład gotowego biegu ›</a></div>';
    return h;
  }

  /* ── EKRAN „TAK BĘDZIE W APLIKACJI” (decyzja 12.11): atrapa pierwszej strony aplikacji z kaflem Miasta Dobra w trzech stanach. a) bez ulicy: „Wybierz ulicę, dla której biegasz”
     (lista trwających: avatar bohatera, nazwa, poziom, postęp; jedno dotknięcie = dołączenie); b) z wybraną: kafel ze sceną, licznikiem, „Twój wkład” i „Zmień ulicę”; c) wejście z linku:
     ta ulica zaznaczona, „Biegam dla tej ulicy” do potwierdzenia. Zasada pod spodem: ZASADA_WYBORU. Dane przykładowe, własny wkład wymyślony (oznaczony). ── */
  var WKLAD_PRZYKLADU = { km: 12.4, dni: 4 };
  function trwajace(lista) { return (lista || []).filter(function (u) { return !u.wolna && (u.status === "trwa"); }); }
  function avatarHtml(u) {
    if (u.przyklad && u.bohater) { var s = swiat(u.bohater.swiat); return s.obraz ? '<img class="md-apl-avatar" src="' + esc(s.obraz) + '" alt="">' : '<span class="md-apl-avatar md-emoji">' + esc(s.emoji || "") + '</span>'; }
    return '<img class="md-apl-avatar" src="assets/ulica/koparka.webp" alt="">';   // prawdziwa: ikona świata Ulicy (budowa), bez wizerunku
  }
  function wierszUlicyHtml(u, zaznaczona) {
    var p = poziomUlicy(u), pct = u.pct != null ? Number(u.pct) : procent(u);
    return '<button type="button" class="md-apl-ulica' + (zaznaczona ? " md-apl-ulica--tu" : "") + '" data-apl-dolacz="' + esc(u.id) + '">' + avatarHtml(u) +
      '<span class="md-apl-tekst"><b>' + esc(u.nazwa) + (u.przyklad ? ' <i class="md-przyklad">przykład</i>' : "") + '</b><small>' + (p ? "poziom " + p + " z 5 · " : "") + esc(liczba(pct, 1)) + ' % celu</small><span class="md-pasek md-pasek--maly"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></span></span>' +
      '<span class="md-apl-dolacz">' + (zaznaczona ? "✓" : "Dołącz") + '</span></button>';
  }
  function aplikacjaHtml(stan, lista, wybranaId) {
    var L = trwajace(lista), w = null; L.forEach(function (u) { if (u.id === wybranaId) w = u; });
    if (!w) { L.forEach(function (u) { if (!w && u.prawdziwa) w = u; }); }   // bez wyboru: ulica wzorcowa (prawdziwa), nie przykład (decyzja 12.11)
    if (!w) w = L[0];
    var h = '<div class="md-apl" data-apl-stan="' + esc(stan) + '">';
    h += '<div class="md-apl-naglowek"><div class="md-marka">BiegaMy · Dziś</div><div class="md-apl-przelacznik" role="tablist" aria-label="Stan kafla">' +
      [["a", "bez ulicy"], ["b", "z ulicą"], ["c", "z linku"]].map(function (x) { return '<button type="button" role="tab" data-apl="' + x[0] + '" aria-selected="' + (x[0] === stan ? "true" : "false") + '">' + x[1] + '</button>'; }).join("") + '</div></div>';
    h += '<div class="md-apl-telefon"><div class="md-apl-pasek"><span>Dziś</span><span>Treningi</span><span>Społeczność</span></div>';
    if (stan === "a") {
      h += '<div class="md-apl-kafel"><div class="md-apl-tytul">Miasto Dobra</div><p class="md-apl-pyt">Wybierz ulicę, dla której biegasz</p>' + L.map(function (u) { return wierszUlicyHtml(u, false); }).join("") + '</div>';
    } else if (stan === "b" && w) {
      var p = poziomUlicy(w), pct = w.pct != null ? Number(w.pct) : procent(w);
      h += '<div class="md-apl-kafel md-apl-kafel--ulica"><div class="md-apl-scena"><img src="assets/ulica/wzgorza.webp" alt="" class="md-apl-scena-tlo"><img src="assets/ulica/domek-3.webp" alt="" class="md-apl-scena-domek"><img src="assets/miasto/brama-start-meta.webp" alt="" class="md-apl-scena-brama"></div>' +
        '<div class="md-apl-tytul">' + esc(w.nazwa) + (w.przyklad ? ' <i class="md-przyklad">przykład</i>' : "") + '</div><small class="md-apl-poziom">' + (p ? "poziom " + p + " z 5" : "") + '</small>' +
        '<div class="md-apl-liczby"><div><b>' + esc(km(w.suma_km)) + ' km</b><span>razem · ' + esc(liczba(pct, 1)) + ' % celu</span></div><div><b>' + esc(km(WKLAD_PRZYKLADU.km)) + ' km</b><span>Twój wkład · ' + WKLAD_PRZYKLADU.dni + ' dni <i class="md-przyklad">przykład</i></span></div></div>' +
        '<div class="md-pasek"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div><button type="button" class="md-apl-zmien" data-apl="a">Zmień ulicę ›</button></div>';
    } else if (w) {
      h += '<div class="md-apl-kafel"><div class="md-apl-tytul">Miasto Dobra</div><p class="md-apl-pyt">Wejście z linku ulicy</p>' + wierszUlicyHtml(w, true) +
        '<button type="button" class="md-przycisk md-apl-potwierdz" data-apl-potwierdz="' + esc(w.id) + '">Biegam dla tej ulicy ›</button><p class="md-dopisek">Do potwierdzenia: bez dotknięcia nic się nie zmienia.</p></div>';
    }
    h += '</div><p class="md-zasada md-zasada--apl">' + esc(ZASADA_WYBORU) + '</p><p class="md-uwaga">Atrapa ekranu aplikacji. Ulice i wkład wymyślone, oznaczone „przykład”.</p></div>';
    return h;
  }

  g.BM_MIASTO = { BAZA: BAZA, SLUG_PRAWDZIWEJ: SLUG_PRAWDZIWEJ, STRONA_PRAWDZIWEJ: STRONA_PRAWDZIWEJ, KLUCZ_PAMIECI: KLUCZ_PAMIECI, POLA_LICZNIKA: POLA_LICZNIKA, PRZYKLADY: PRZYKLADY, WOLNA: WOLNA,
    POZIOMY: POZIOMY, ZASADA_POZIOMOW: ZASADA_POZIOMOW, ZASADA_WYBORU: ZASADA_WYBORU, SWIATY: SWIATY, CEL_PRZYKLADU: CEL_PRZYKLADU, KREATOR: KREATOR, WKLAD_PRZYKLADU: WKLAD_PRZYKLADU,
    esc: esc, liczba: liczba, km: km, procent: procent, forma: forma, odmiana: odmiana, ulicaZLicznika: ulicaZLicznika, zapamietaj: zapamietaj, odczytaj: odczytaj, stanZ: stanZ, pobierzPrawdziwa: pobierzPrawdziwa,
    ulice: ulice, sumaMiasta: sumaMiasta, podpisSumy: podpisSumy, kartaHtml: kartaHtml, etykietaMapy: etykietaMapy, poziomUlicy: poziomUlicy, poziom: poziom, swiat: swiat, drabinkaHtml: drabinkaHtml, bohaterHtml: bohaterHtml,
    kreatorHtml: kreatorHtml, najblizszyWeekend: najblizszyWeekend, zakresWeekendu: zakresWeekendu, podgladBieguHtml: podgladBieguHtml, aplikacjaHtml: aplikacjaHtml, trwajace: trwajace };
})(typeof globalThis !== "undefined" ? globalThis : window);
