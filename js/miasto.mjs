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

  /* ── ULICE PRZYKŁADOWE (wymyślone; nazwy neutralne, bez osób) ─────────────────────────────── */
  var PRZYKLADY = [
    { id: "bieg", przyklad: true, status: "trwa", nazwa: "Bieg Wirtualny", forma: "Wirtualny bieg charytatywny",
      opis: "W jeden weekend każdy biegnie 5 albo 10 km tam, gdzie mieszka, i zapisuje trening w BiegaMy. Wpisowe to wpłata prosto na zbiórkę organizacji. Od BiegaMy: odznaka w aplikacji i e-dyplom.",
      cel_km: 5000, suma_km: 1840, osoby_n: 312, cegly_n: 180, firmy_n: 3, etykieta: "5 i 10 km w weekend" },
    { id: "szkolna", przyklad: true, status: "trwa", nazwa: "Ulica Szkolna", forma: "Wyzwanie szkół i firm",
      opis: "Klasy albo zespoły z firm zbierają kilometry jako drużyny. Na ulicy stoi ranking drużyn, a każdy kilometr buduje tę samą drogę. Firmy mogą postawić domek z logo.",
      cel_km: 8000, suma_km: 3210, osoby_n: 260, druzyny_n: 14, cegly_n: 95, firmy_n: 4, etykieta: "ranking drużyn" },
    { id: "urodzinowa", przyklad: true, status: "trwa", nazwa: "Ulica Urodzinowa", forma: "Osobista zbiórka urodzinowa",
      opis: "Zamiast prezentów: „30 km na urodziny” i link do zbiórki. Znajomi dokładają kilometry i cegły z imieniem w murze. Mała ulica na kilka dni.",
      cel_km: 30, suma_km: 19, osoby_n: 11, cegly_n: 11, firmy_n: 0, etykieta: "30 km na urodziny" },
    { id: "sloneczna", przyklad: true, status: "zakonczona", nazwa: "Ulica Słoneczna", forma: "Ulica zbudowana: cel osiągnięty",
      opis: "Cel osiągnięty, ulica otwarta. Zostaje w mieście na stałe: z murem imion, domkami firm i podsumowaniem tego, co się udało. Sukces, który widać na mapie.",
      cel_km: 10000, suma_km: 10000, osoby_n: 1240, cegly_n: 420, firmy_n: 12, dni_n: 41, etykieta: "zbudowana",
      podsumowanie: ["10 000 km w 41 dni", "1 240 osób, 420 cegieł w murze, 12 firm na ulicy", "Zbiórka organizacji zakończona sukcesem. Ulica zostaje w mieście."] }
  ];
  var WOLNA = { id: "wolna", wolna: true, nazwa: "Wolna działka", etykieta: "tu może stanąć Twoja ulica" };

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
  function chip(u) {
    if (u.wolna) return '<span class="md-chip md-chip--wolna">WOLNA DZIAŁKA</span>';
    if (u.przyklad) return '<span class="md-chip md-chip--przyklad">PRZYKŁAD</span>' + (u.status === "zakonczona" ? '<span class="md-chip md-chip--koniec">ZAKOŃCZONA</span>' : "");
    if (u.status === "zakonczona") return '<span class="md-chip md-chip--koniec">ZAKOŃCZONA</span>';
    if (u.status === "trwa") return '<span class="md-chip md-chip--trwa">TRWA</span>';
    return '<span class="md-chip md-chip--wkrotce">' + (u.status === "przed" ? "WKRÓTCE" : "LICZNIK NIEDOSTĘPNY") + '</span>';
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
      return h + '<p class="md-forma">Każda zbiórka może mieć swoją ulicę</p><p class="md-opis">Organizacja prowadząca zbiórkę zakłada ulicę, ludzie budują ją kilometrami, a pieniądze idą prosto do niej. BiegaMy nic nie przyjmuje.</p>' +
        '<button type="button" class="md-przycisk" data-kreator>Załóż ulicę ›</button></div>';
    }
    h += '<p class="md-forma">' + esc(u.forma || "") + (u.tytul && u.tytul !== u.nazwa ? ' · ' + esc(u.tytul) : "") + '</p>';
    if (u.status === "brak" || u.status === "przed") {
      h += '<p class="md-opis">' + (u.status === "przed" ? "Ulica w przygotowaniu. Liczby pojawią się po starcie akcji." : "Licznik chwilowo nie odpowiada. Liczby pojawią się, gdy wróci internet.") + '</p>';
    } else {
      h += liczbyHtml(u);
      if (u.przyklad) h += '<p class="md-uwaga">Dane wymyślone na potrzeby pokazu. Nie wchodzą do licznika miasta.</p>';
      if (u.opis) h += '<p class="md-opis">' + esc(u.opis) + '</p>';
      if (u.podsumowanie && u.podsumowanie.length) h += '<ul class="md-podsumowanie">' + u.podsumowanie.map(function (z) { return '<li>' + esc(z) + '</li>'; }).join("") + '</ul>';
    }
    if (u.prawdziwa && o.stanZ) h += '<p class="md-stan">' + esc(stanZ(o.stanZ)) + ' · licznik chwilowo niedostępny</p>';
    if (u.prawdziwa) h += '<a class="md-przycisk" href="' + esc(u.strona || STRONA_PRAWDZIWEJ) + '">Wejdź na ulicę ›</a>';
    else h += '<button type="button" class="md-przycisk md-przycisk--przyklad" data-podglad="' + esc(u.id) + '">Zobacz, jak wyglądałaby ulica ›</button>';
    return h + '</div>';
  }
  /** Etykieta na mapie: dwie linie, bez imion w kodzie; przykład dostaje znaczek w CSS. */
  function etykietaMapy(u) {
    if (u.wolna) return { tytul: u.nazwa, podpis: u.etykieta };
    if (u.status === "brak") return { tytul: u.nazwa, podpis: "licznik chwilowo niedostępny" };
    if (u.status === "przed") return { tytul: u.nazwa, podpis: "wkrótce" };
    var pct = u.pct != null ? Number(u.pct) : procent(u), cegly = odmiana(u.cegly_n, ["cegła", "cegły", "cegieł"]), firmy = odmiana(u.firmy_n, ["firma", "firmy", "firm"]);
    /* prawdziwa: km w tytule (szeroka działka), pełny podpis; przykłady: km w podpisie, bez firm (najwyżej 2 linie na 360 px, firmy są na karcie) */
    if (u.prawdziwa) return { tytul: u.nazwa + " · " + km(u.suma_km) + " km", podpis: u.status === "zakonczona" ? "zbudowana · " + cegly : liczba(pct, 1) + " % celu · " + cegly + " · " + firmy };
    return { tytul: u.nazwa, podpis: km(u.suma_km) + " km · " + (u.status === "zakonczona" ? "zbudowana · " + cegly : liczba(pct, 1) + " % celu · " + cegly) };   // twarde spacje: liczba nie rozstaje się z jednostką
  }

  /* ── KREATOR (atrapa: nic nie zapisuje, nic nie wysyła) ───────────────────────────────────── */
  var KROKI = [
    { tytul: "Organizacja i zbiórka", opis: "Ulicę zakłada organizacja prowadząca oficjalną zbiórkę. Sprawdzamy link i organizację, zanim ulica się otworzy.",
      pola: [{ etykieta: "Nazwa organizacji (fundacja, stowarzyszenie, szkoła, klub)", typ: "text", przyklad: "np. Stowarzyszenie Przykładowe" }, { etykieta: "Link do oficjalnej zbiórki", typ: "url", przyklad: "https://…" }, { etykieta: "E-mail kontaktowy", typ: "email", przyklad: "kontakt@…" }] },
    { tytul: "Forma akcji i cel", opis: "Jedna droga, wiele form. Kilometry zawsze liczy aplikacja, pieniądze zawsze idą prosto do organizacji.",
      wybor: ["Wspólne kilometry dla jednej zbiórki", "Wirtualny bieg charytatywny (5 lub 10 km)", "Wyzwanie szkół lub firm (ranking drużyn)", "Osobista zbiórka (np. urodzinowa)"],
      pola: [{ etykieta: "Cel w kilometrach", typ: "number", przyklad: "np. 5 000" }, { etykieta: "Start", typ: "date" }, { etykieta: "Koniec", typ: "date" }] },
    { tytul: "Bohater i grafiki", opis: "Imię bohatera tylko za zgodą opiekuna. Rysunek, plakat i film wgrywa organizacja, a my sprawdzamy je przed publikacją.",
      pola: [{ etykieta: "Nazwa ulicy", typ: "text", przyklad: "np. Ulica Tęczowa" }, { etykieta: "Imię bohatera (opcjonalnie, za zgodą)", typ: "text" }],
      /* Świat gry (decyzja 9.11): ten sam bieg, inny świat. Ikony: koparka z Ulicy, reszta z assets/miasto (10.11, API obrazów ze wzorcem domek-1); emoji zostaje jako zapas, gdy obrazu brak. */
      pytanieSwiata: "Co kocha bohater tej ulicy?", dopisekSwiata: "Ten sam bieg, inny świat: zmieniają się tylko grafiki na ulicy i w grze.",
      swiaty: [{ id: "budowa", nazwa: "Budowa", opis: "koparki, dźwigi, cegły", obraz: "assets/ulica/koparka.webp" }, { id: "kosmos", nazwa: "Kosmos", opis: "rakiety i planety", obraz: "assets/miasto/swiat-kosmos.webp", emoji: "🚀" },
        { id: "dinozaury", nazwa: "Dinozaury", opis: "ślady i wulkany", obraz: "assets/miasto/swiat-dinozaury.webp", emoji: "🦖" }, { id: "pilka", nazwa: "Piłka", opis: "boisko i bramki", obraz: "assets/miasto/swiat-pilka.webp", emoji: "⚽" },
        { id: "zwierzeta", nazwa: "Zwierzęta", opis: "łąka i zagroda", obraz: "assets/miasto/swiat-zwierzeta.webp", emoji: "🐾" }, { id: "bez", nazwa: "Bez bohatera", opis: "bieg przez Miasto Dobra", obraz: "assets/miasto/swiat-miasto.webp" }],
      zgody: ["Mam zgodę opiekuna na imię bohatera na ulicy", "Mam prawa do grafik, które wgram"], pliki: ["Rysunek bohatera", "Plakat akcji"] }
  ];
  function kreatorHtml(nr) {
    var i = Math.max(0, Math.min(KROKI.length - 1, Number(nr) || 0)), k = KROKI[i], h = '<div class="md-kreator-krok" data-krok="' + i + '">';
    h += '<div class="md-kroki">' + KROKI.map(function (x, j) { return '<span class="' + (j === i ? "md-krok--tu" : j < i ? "md-krok--byl" : "") + '">' + (j + 1) + '</span>'; }).join("") + '</div>';
    h += '<h3>Krok ' + (i + 1) + ' z ' + KROKI.length + ': ' + esc(k.tytul) + '</h3><p class="md-opis">' + esc(k.opis) + '</p>';
    if (k.wybor) h += '<div class="md-wybor">' + k.wybor.map(function (w, j) { return '<label><input type="radio" name="md-forma"' + (j === 0 ? " checked" : "") + '> <span>' + esc(w) + '</span></label>'; }).join("") + '</div>';
    (k.pola || []).forEach(function (p, j) { var id = "md-pole-" + i + "-" + j; h += '<label class="md-pole" for="' + id + '"><span>' + esc(p.etykieta) + '</span><input id="' + id + '" type="' + esc(p.typ) + '" autocomplete="off"' + (p.przyklad ? ' placeholder="' + esc(p.przyklad) + '"' : "") + '></label>'; });
    if (k.swiaty) {
      h += '<p class="md-pytanie">' + esc(k.pytanieSwiata) + '</p><div class="md-swiaty">' + k.swiaty.map(function (s, j) {
        var ikona = s.obraz ? '<img src="' + esc(s.obraz) + '" alt="">' : '<span class="md-emoji" aria-hidden="true">' + esc(s.emoji) + '</span>';
        return '<label class="md-swiat' + (s.id === "bez" ? " md-swiat--bez" : "") + '"><input type="radio" name="md-swiat" value="' + esc(s.id) + '"' + (j === 0 ? " checked" : "") + '>' + ikona + '<b>' + esc(s.nazwa) + '</b><small>' + esc(s.opis) + '</small></label>';
      }).join("") + '</div><p class="md-dopisek">' + esc(k.dopisekSwiata) + '</p>';
    }
    (k.zgody || []).forEach(function (z) { h += '<label class="md-zgoda"><input type="checkbox"> <span>' + esc(z) + '</span></label>'; });
    (k.pliki || []).forEach(function (p) { h += '<div class="md-plik"><span>' + esc(p) + '</span><b>Wgrasz tu później</b></div>'; });
    h += '<div class="md-kreator-stopka">' + (i > 0 ? '<button type="button" class="md-przycisk md-przycisk--cichy" data-krok-wstecz>‹ Wstecz</button>' : "");
    h += i < KROKI.length - 1 ? '<button type="button" class="md-przycisk" data-krok-dalej>Dalej ›</button>' : '<button type="button" class="md-przycisk" disabled>Wyślij do weryfikacji</button>';
    h += '</div>' + (i === KROKI.length - 1 ? '<p class="md-wkrotce"><b>Wkrótce.</b> To prototyp: niczego nie zapisuje i nie wysyła.</p>' : "") + '</div>';
    return h;
  }

  g.BM_MIASTO = { BAZA: BAZA, SLUG_PRAWDZIWEJ: SLUG_PRAWDZIWEJ, STRONA_PRAWDZIWEJ: STRONA_PRAWDZIWEJ, KLUCZ_PAMIECI: KLUCZ_PAMIECI, POLA_LICZNIKA: POLA_LICZNIKA, PRZYKLADY: PRZYKLADY, WOLNA: WOLNA, KROKI: KROKI,
    esc: esc, liczba: liczba, km: km, procent: procent, forma: forma, odmiana: odmiana, ulicaZLicznika: ulicaZLicznika, zapamietaj: zapamietaj, odczytaj: odczytaj, stanZ: stanZ, pobierzPrawdziwa: pobierzPrawdziwa,
    ulice: ulice, sumaMiasta: sumaMiasta, podpisSumy: podpisSumy, kartaHtml: kartaHtml, etykietaMapy: etykietaMapy, kreatorHtml: kreatorHtml };
})(typeof globalThis !== "undefined" ? globalThis : window);
