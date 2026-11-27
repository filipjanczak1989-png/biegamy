// Panel trenera: bieg wirtualny (20261126_akcja_bieg_wyniki). Lista uczestników (imię, numer, stan; bez kont i e-maili) i ręczne zaliczenie biegu.
// 20261213 (decyzja 18.11): przy wyniku dystans treningu, czas, tempo i źródło (zegarek / wpis ręczny / organizator) — tylko w panelu, publicznie nie.
// 20261206: flaga „do sprawdzenia” z bazy (powód słownie, filtr), „Usuń wynik” z powodem i potwierdzeniem (akcja_bieg_usun_wynik) i weryfikacja wyników do rankingu
// (tempo spoza 3:00–36:00/km, od v6 też trening dłuższy niż maraton — 20261215: „Zatwierdź” albo „Odrzuć” z prośbą o dowód, akcja_bieg_weryfikuj); licznik w nagłówku.
// Plik BEZ import/export, jak js/firmy-panel.mjs. Dane z funkcji akcja_bieg_panel i akcja_bieg_zalicz_recznie (bramka trenera w bazie). Bez innerHTML: imiona są niezaufane.
(function (g) {
  "use strict";
  var $ = function (id) { return g.document.getElementById(id); };
  function el(tag, styl, rodzic, tekst) { var e = g.document.createElement(tag); if (styl) e.style.cssText = styl; if (tekst != null) e.textContent = tekst; if (rodzic) rodzic.appendChild(e); return e; }
  var PRZYCISK = "font:inherit;font-size:14px;font-weight:800;padding:10px 14px;min-height:44px;border-radius:12px;cursor:pointer;";
  var POLE = "box-sizing:border-box;padding:10px;min-height:44px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--fg);font:inherit;font-size:15px;";
  var FAZA = { szkic: "szkic (niewidoczny)", zapisy: "zapisy", trwa: "trwa", wyniki: "dopisywanie wyników", zakonczony: "zakończony" };
  function km(x) { var n = Number(x) || 0; return (Math.round(n * 100) / 100).toLocaleString("pl-PL"); }
  function czasPl(x) { var s = Math.round(Number(x) || 0), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sek = s % 60, p2 = function (v) { return (v < 10 ? "0" : "") + v; }; return h ? h + ":" + p2(m) + ":" + p2(sek) : m + ":" + p2(sek); }
  var ZRODLA = { zegarek: "zegarek", "wpis ręczny": "wpis ręczny", organizator: "zaliczone przez organizatora" };
  /** 20261213: szczegóły wyniku TYLKO dla organizatora (akcja_bieg_panel, bramka trenera w bazie): „10,01 km · 49:05 · 4:54/km · zegarek”; dziecko albo bez wyniku "". */
  function szczegolyWyniku(u) {
    if (!u || u.rodzaj === "dziecko" || !u.ukonczony || u.wycofany) return "";
    var cz = [], k = Number(u.trening_km), s = Number(u.wynik_s);
    if (k > 0) cz.push(km(k) + " km");
    if (s > 0) cz.push(czasPl(s));
    if (k > 0 && s > 0) cz.push(czasPl(s / k) + "/km");
    if (Object.prototype.hasOwnProperty.call(ZRODLA, u.zrodlo)) cz.push(ZRODLA[u.zrodlo]);
    return cz.join(" · ");
  }
  function dzien(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? Number(m[3]) + "." + Number(m[2]) + "." + m[1] : ""; }
  /** 18.11: koniec biegu i wyników z godziną (koniec_at z bazy, czas polski): „6.12.2026, godz. 20:00”; bez koniec_at "". */
  function koniecPl(iso) {
    var t = iso ? new Date(iso) : null, c = {};
    if (!t || !isFinite(t.getTime())) return "";
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(t).forEach(function (p) { c[p.type] = p.value; });
    return dzien(c.year + "-" + c.month + "-" + c.day) + ", godz. " + c.hour + ":" + c.minute;
  }
  /** „58:00” / „1:02:05” → sekundy; puste → null; zły zapis → NaN. Czas jest prywatny: tylko na dyplomie uczestnika. */
  function sekundy(t) {
    var s = String(t == null ? "" : t).trim(); if (!s) return null;
    var m = /^(?:(\d{1,2}):([0-5]\d)|(\d{1,3})):([0-5]\d)$/.exec(s); if (!m) return NaN;   // jak akcja_bieg_sekundy w bazie: H:MM:SS albo M:SS
    var w = m[1] != null ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[4]) : Number(m[3]) * 60 + Number(m[4]);
    return w >= 60 && w <= 86400 ? w : NaN;
  }
  function kmZPola(t) { var s = String(t == null ? "" : t).trim().replace(",", "."); if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null; var n = Number(s); return n >= 0.1 && n <= 100 ? n : null; }
  /** Stan uczestnika po polsku, bez czasu. */
  function stanTekst(u) {
    if (u.wycofany) return "wycofany" + (u.wynik_usuniety ? " (wynik usunięty)" : "");
    if (!u.ukonczony) return u.wynik_usuniety ? "wynik usunięty" + (u.wynik_usuniety_powod ? ": " + u.wynik_usuniety_powod : "") : "bez wyniku";
    var d = u.rodzaj === "dziecko" ? km(u.dystans_wlasny_km) + " km (swój dystans)" : km(u.wynik_dystans_km) + " km";
    return "ukończył(a): " + d + (u.zaliczony_recznie ? " · zaliczone ręcznie" : u.z_treningu ? " · z treningu" : u.rodzaj === "dziecko" ? " · wpis rodzica" : "");
  }
  /** Ponad 180 zgód (90 e-maili na dobę × 2 doby: dwa dni przed biegiem wieczorem i dzień przed rano) część osób nie dostanie przypomnienia. → tekst ostrzeżenia albo "". */
  function ostrzezenieMaili(b) {
    var n = Number(b && b.zgody_email) || 0, naDobe = Number(b && b.maile_na_dobe) || 90, dob = Number(b && b.maile_dob) || 2, max = naDobe * dob;
    if (n <= max) return "";
    return "Zgód na e-mail jest " + n + ", a wyślemy najwyżej " + max + " (" + naDobe + " na dobę przez " + dob + " doby). " + (n - max) + " os. nie dostanie przypomnienia. Żeby wysłać wszystkim, potrzebny jest wyższy plan Resend.";
  }
  function komunikat(e, d) {
    var p = d && d.powod;
    if (e) return /tylko trener|42501/.test(String(e.message || e.code || "")) ? "To konto nie jest kontem trenera." : "Nie udało się. Sprawdź łącze.";
    return p === "dystans" ? "Zły dystans: dorosły z listy biegu, dziecko 0,1–100 km." : p === "czas" ? "Czas: od 1:00 do 24:00:00, u dziecka bez czasu." : p === "za_pozno" ? "Po terminie zaliczania ręcznego (data w nagłówku panelu)."
      : p === "przed_biegiem" ? "Bieg jeszcze się nie zaczął." : p === "nie_ma" ? "Tego zapisu już nie ma (wycofany albo usunięty)."
      : p === "zly_powod" ? "Wpisz powód: od 3 do 200 znaków, w jednej linii." : p === "bez_wyniku" ? "Ten zapis nie ma wyniku (może usunięty albo jeszcze niezaliczony). Odśwież listę."
      : p === "dziecko" ? "Dzieci nie są w rankingu." : p === "decyzja" ? "Nieznana decyzja. Odśwież panel."
      : p === "zgoda" ? "Zaznacz oba pola: osoba pełnoletnia i zgoda na imię i czas w wynikach." : p === "imie" ? "Imię: samo imię albo imię i inicjał (Anna, Anna K.), bez nazwiska, 2–24 znaki."
      : p === "limit" ? "Ten bieg ma już 1000 wyników wpisanych przez organizatora." : p === "nie_ma_biegu" ? "Nie ma takiego biegu. Odśwież panel." : "Nie udało się.";
  }
  /* 20261206: flaga „do sprawdzenia” liczona w bazie (akcja_bieg_do_sprawdzenia): tylko powody słownie, bez czasu; nic nie znika samo */
  function doSprawdzenia(u) { return u && !u.wycofany && Array.isArray(u.do_sprawdzenia) ? u.do_sprawdzenia.filter(function (p) { return typeof p === "string" && p; }) : []; }
  function liczbaDoSprawdzenia(lista) { return (Array.isArray(lista) ? lista : []).filter(function (u) { return doSprawdzenia(u).length > 0; }).length; }
  /** Wynik do weryfikacji (20261206): czeka = bez decyzji; stan słownie bez czasu. */
  function czekaNaWeryfikacje(u) { return !!u && !u.wycofany && u.do_weryfikacji === true && u.weryfikacja == null; }
  function liczbaDoWeryfikacji(lista) { return (Array.isArray(lista) ? lista : []).filter(czekaNaWeryfikacje).length; }
  function stanWeryfikacji(u) { return !u || !u.do_weryfikacji ? "" : u.weryfikacja === "zatwierdzony" ? "Ranking: zatwierdzony" : u.weryfikacja === "odrzucony" ? "Ranking: odrzucony, prośba o dowód" : "Ranking: czeka na weryfikację"; }
  function pytanieOdrzucenia(u) { return "Odrzucić wynik do rankingu: " + u.imie + ", numer " + u.numer + "? Uczestnik dostanie prośbę o dowód (zapis z zegarka, zrzut z aplikacji). Ukończenie i dyplom zostają; zatwierdzić możesz później."; }
  /** „Zatwierdź” od razu; „Odrzuć” po potwierdzeniu (BM_OKIENKO, bez niego confirm). → Promise<wynik RPC | null> */
  function weryfikuj(u, decyzja) {
    var pytaj = decyzja !== "odrzuc" ? Promise.resolve({}) : g.BM_OKIENKO ? g.BM_OKIENKO({ tytul: "Odrzucić wynik do rankingu?", tekst: pytanieOdrzucenia(u), tak: "Odrzuć i poproś o dowód", nie: "Anuluj", grozne: true })
      : Promise.resolve(g.confirm && g.confirm(pytanieOdrzucenia(u)) ? {} : null);
    return Promise.resolve(pytaj).then(function (w) { if (!w) return null; return wolaj("akcja_bieg_weryfikuj", { p_id: u.id, p_decyzja: decyzja }); });
  }
  /* 20261217 (v7, blizna-307): usunięty trening w tej postaci nie wraca; poprawiony albo nowy trening przywraca wynik z flagą, ranking po „Zatwierdź”. b = bieg z panelu (regulamin_wersja od 20261217). */
  function pytanieUsuniecia(u, b) {
    var m = /^2026-11-v(\d+)$/.exec(String(b && b.regulamin_wersja || "")), v7 = !!m && Number(m[1]) >= 7;
    return "Usunąć wynik: " + u.imie + ", numer " + u.numer + "? Dyplom i miejsce na liście znikną, uczestnik dostanie powiadomienie z powodem. " +
      (v7 ? "Ten trening w obecnej postaci nie zaliczy już biegu. Gdy uczestnik poprawi w nim czas albo doda nowy trening, wynik wróci z flagą „Do sprawdzenia: wynik po usunięciu” i trafi do rankingu dopiero po „Zatwierdź”. Przywrócisz go też przyciskiem „Zalicz ręcznie”." : "Przywrócisz go przyciskiem „Zalicz ręcznie”.");
  }
  function sprawdzPowod(t) { var s = String(t == null ? "" : t).trim(); return s.length < 3 || s.length > 200 ? "Wpisz powód: od 3 do 200 znaków." : ""; }
  /** „Usuń wynik” (§ 9 ust. 3–4 regulaminu): okienko panelu z powodem (BM_OKIENKO), bez niego prompt i confirm. Bez powodu albo po „Anuluj” nic nie wysyła. → Promise<wynik RPC | null> */
  function usunWynik(u, b) {
    var pytaj = g.BM_OKIENKO
      ? g.BM_OKIENKO({ tytul: "Usunąć wynik?", tekst: pytanieUsuniecia(u, b), tak: "Usuń wynik", nie: "Anuluj", grozne: true, pola: [{ klucz: "powod", etykieta: "Powód (zobaczy go uczestnik), np. brak potwierdzenia z zegarka", typ: "text", maks: 200 }], sprawdz: function (w) { return sprawdzPowod(w.powod); } })
      : Promise.resolve((function () { var p = g.prompt ? g.prompt("Powód usunięcia wyniku (zobaczy go uczestnik):", "") : null; if (p == null || sprawdzPowod(p) || !g.confirm || !g.confirm(pytanieUsuniecia(u, b))) return null; return { powod: p.trim() }; })());
    return Promise.resolve(pytaj).then(function (w) {
      if (!w || sprawdzPowod(w.powod)) return null;
      return wolaj("akcja_bieg_usun_wynik", { p_id: u.id, p_powod: String(w.powod).trim() });
    });
  }
  function wolaj(nazwa, args) {
    return new Promise(function (ok) { ok(g.sb.rpc(nazwa, args)); }).then(function (r) { if (r.error) throw r.error; return r.data; });   // brak klienta = odrzucenie, nie wyjątek w rysowaniu
  }

  /* WYNIKI OSÓB BEZ APLIKACJI (bieg stacjonarny, 20261233, blizna-418). Organizator (trener, bramka w bazie) wpisuje imię (samo albo z inicjałem), dystans
     z listy biegu i czas, z dwoma wymaganymi polami: osoba pełnoletnia i zgoda na imię i czas w wynikach. Zapis tylko funkcją akcja_bieg_org_wpisz
     (SECURITY DEFINER); w rankingu z dopiskiem „wpisane przez organizatora”, bez numeru, dyplomu i odznaki; kilometry nie idą do licznika ulicy.
     Poprawić i usunąć można tylko własny wpis (baza sprawdza autora). Tylko textContent: imiona są niezaufane.
     Sekcja jest zwinięta: formularz i lista (jedno zapytanie) dopiero po rozwinięciu, więc zwykłe otwarcie panelu nie pyta bazy więcej niż dotąd. */
  var LIT = "A-Za-zÀ-ÖØ-öø-ÿĀ-ſ", RE_IMIE_ORG = new RegExp("^[" + LIT + "]{2,}(-[" + LIT + "]+)?( [" + LIT + "]\\.)?$"), RE_INICJAL = new RegExp(" [" + LIT + "]\\.?$");
  /** Imię do wyników jak w bazie: spacje ściśnięte, inicjał wielką literą z kropką („anna k” → „anna K.”); poza wzorem → null. */
  function imieOrg(t) {
    var s = String(t == null ? "" : t).trim().replace(/\s+/g, " ");
    if (RE_INICJAL.test(s)) { s = s.replace(/\.$/, ""); s = s.slice(0, -1) + s.slice(-1).toUpperCase() + "."; }
    return s.length >= 2 && s.length <= 24 && RE_IMIE_ORG.test(s) ? s : null;
  }
  /** Formularz wpisu (wpis = null) albo poprawki (wpis z listy). poZapisie odświeża listę. */
  function formularzOrg(kont, b, wpis, poZapisie) {
    kont.textContent = "";
    var f = el("div", "display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;", kont); f.setAttribute("data-org-form", wpis ? "popraw" : "nowy");
    var l1 = el("label", "font-size:12px;color:var(--muted);flex:1 1 100%;", f, "Imię (albo imię i inicjał)");
    var imie = el("input", "display:block;width:100%;margin-top:4px;" + POLE, l1); imie.placeholder = "Anna albo Anna K."; imie.maxLength = 24; imie.autocomplete = "off"; imie.setAttribute("data-org", "imie");
    var l2 = el("label", "font-size:12px;color:var(--muted);flex:1 1 90px;", f, "Dystans");
    var dyst = el("select", "display:block;width:100%;margin-top:4px;" + POLE, l2); dyst.setAttribute("data-org", "dystans");
    (b.dystanse_km || []).forEach(function (d) { var o = el("option", "", dyst, d + " km"); o.value = String(d); if (wpis && Number(d) === Number(wpis.dystans_km)) o.selected = true; });
    var l3 = el("label", "font-size:12px;color:var(--muted);flex:1 1 110px;", f, "Czas");
    var czas = el("input", "display:block;width:100%;margin-top:4px;" + POLE, l3); czas.placeholder = "25:30"; czas.maxLength = 8; czas.inputMode = "numeric"; czas.setAttribute("data-org", "czas");
    var zgody = [["pelnoletnia", "Osoba jest pełnoletnia"], ["zgoda", "Osoba zgodziła się na imię i czas w wynikach"]].map(function (z) {
      var l = el("label", "display:flex;gap:8px;align-items:center;flex:1 1 100%;font-size:13px;color:var(--fg);min-height:44px;cursor:pointer;", f), c = el("input", "width:20px;height:20px;flex:none;", l); c.type = "checkbox"; c.setAttribute("data-org", z[0]);
      el("span", "", l, z[1]); return c;
    });
    if (wpis) { imie.value = String(wpis.imie || ""); czas.value = czasPl(wpis.wynik_s); zgody[0].checked = true; zgody[1].checked = true; }
    var ok = el("button", PRZYCISK + "flex:1 1 140px;background:var(--accent,#ff8a3c);color:#111;border:0;", f, wpis ? "Zapisz poprawkę" : "Dodaj wynik"); ok.type = "button"; ok.setAttribute("data-org", "zapisz");
    if (wpis) { var an = el("button", PRZYCISK + "flex:none;background:none;color:var(--fg);border:1px solid var(--border);", f, "Anuluj"); an.type = "button"; an.addEventListener("click", function () { formularzOrg(kont, b, null, poZapisie); }); }
    var info = el("div", "font-size:13px;color:var(--red);flex:1 1 100%;min-height:18px;", f); info.setAttribute("role", "status"); info.setAttribute("data-org", "info");
    ok.addEventListener("click", function () {
      var i = imieOrg(imie.value), s = sekundy(czas.value), d = Number(dyst.value);
      if (!i) { info.textContent = komunikat(null, { powod: "imie" }); return; }
      if (s == null || isNaN(s)) { info.textContent = "Czas wpisz jak 25:30 albo 1:02:05 (od minuty do doby)."; return; }
      if (!(d > 0)) { info.textContent = komunikat(null, { powod: "dystans" }); return; }
      if (!zgody[0].checked || !zgody[1].checked) { info.textContent = komunikat(null, { powod: "zgoda" }); return; }
      ok.disabled = true; info.textContent = "";
      wolaj("akcja_bieg_org_wpisz", { p_slug: b.slug, p_imie: i, p_dystans_km: d, p_wynik_s: s, p_pelnoletnia: true, p_zgoda_imie: true, p_id: wpis ? wpis.id : null }).then(function (w) {
        ok.disabled = false;
        if (!w || !w.ok) { info.textContent = komunikat(null, w); return; }
        formularzOrg(kont, b, null, poZapisie);
        var po = kont.querySelector("[data-org-form]"); if (po) { var m = el("div", "font-size:13px;color:var(--fg);flex:1 1 100%;", po, (wpis ? "Poprawione: " : "Dodane: ") + w.imie + (/\.$/.test(String(w.imie)) ? "" : ".")); m.setAttribute("data-org", "zapisane"); }
        poZapisie();
      }, function (e) { ok.disabled = false; info.textContent = komunikat(e); });
    });
  }
  function pytanieUsunieciaOrg(w) { return "Usunąć wynik: " + w.imie + ", " + w.dystans_km + " km, " + czasPl(w.wynik_s) + "? Zniknie z rankingu."; }
  /** Lista wpisów organizatorów: „Anna K. · 5 km · 25:30”; przy własnych „Popraw” i „Usuń”, przy cudzych (drugi trener) tylko napis. */
  function rysujListeOrg(lista, wpisy, edytuj, odswiez) {
    lista.textContent = "";
    if (!wpisy.length) { el("div", "font-size:13px;color:var(--muted);padding:8px 0;", lista, "Jeszcze nikt nie wpisał wyniku osoby bez aplikacji."); return; }
    el("div", "font-size:13px;color:var(--fg);margin:10px 0 2px;", lista, "Wpisane: " + wpisy.length);
    wpisy.forEach(function (w) {
      var r = el("div", "display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--border);", lista); r.setAttribute("data-org-wpis", String(w.id));
      el("div", "flex:1 1 160px;min-width:0;font-size:14px;color:var(--fg);overflow-wrap:anywhere;", r, w.imie + " · " + w.dystans_km + " km · " + czasPl(w.wynik_s) + (w.moj ? "" : " · wpis innego trenera"));
      if (!w.moj) return;
      var p = el("button", PRZYCISK + "flex:none;background:none;color:var(--fg);border:1px solid var(--border);", r, "Popraw"); p.type = "button";
      p.addEventListener("click", function () { edytuj(w); });
      var u = el("button", PRZYCISK + "flex:none;background:none;color:var(--red);border:1px solid var(--red);", r, "Usuń"); u.type = "button"; u.setAttribute("data-org-usun", String(w.id));
      var info = el("div", "font-size:13px;color:var(--red);flex:1 1 100%;", r);
      u.addEventListener("click", function () {
        var pytaj = g.BM_OKIENKO ? g.BM_OKIENKO({ tytul: "Usunąć wynik?", tekst: pytanieUsunieciaOrg(w), tak: "Usuń", nie: "Anuluj", grozne: true }) : Promise.resolve(g.confirm && g.confirm(pytanieUsunieciaOrg(w)) ? {} : null);
        u.disabled = true; info.textContent = "";
        Promise.resolve(pytaj).then(function (t) {
          if (!t) { u.disabled = false; return null; }
          return wolaj("akcja_bieg_org_usun", { p_id: w.id }).then(function (x) { u.disabled = false; if (!x || !x.ok) { info.textContent = komunikat(null, x); return; } odswiez(); });
        }).then(null, function (e) { u.disabled = false; info.textContent = komunikat(e); });
      });
    });
  }
  /** Sekcja w panelu: formularz i lista; tylko gdy wolno wpisywać (te same warunki co „Zalicz ręcznie”, ostatecznie sprawdza baza). */
  function wynikiOrg(kont, b) {
    var sek = el("div", "margin-top:16px;padding-top:12px;border-top:2px solid var(--border);", kont); sek.setAttribute("data-wyniki-org", "1");
    var nag = el("button", PRZYCISK + "width:100%;display:flex;justify-content:space-between;align-items:center;background:none;color:var(--fg);border:1px solid var(--border);text-align:left;", sek); nag.type = "button";
    nag.setAttribute("aria-expanded", "false"); nag.setAttribute("data-org", "rozwin");
    el("span", "", nag, "Wyniki osób bez aplikacji"); var strz = el("span", "flex:none;color:var(--muted);", nag, "›");
    var cialo = el("div", "", sek); cialo.hidden = true;
    var zbudowane = false, forma = null, lista = null;
    function odswiez() {
      lista.textContent = "Wczytuję wpisy…";
      wolaj("akcja_bieg_org_lista", { p_slug: b.slug }).then(function (w) { rysujListeOrg(lista, Array.isArray(w) ? w : [], edytuj, odswiez); }, function (e) { lista.textContent = komunikat(e); });
    }
    function edytuj(w) { formularzOrg(forma, b, w, odswiez); }
    nag.addEventListener("click", function () {
      var otwarte = cialo.hidden; cialo.hidden = !otwarte; nag.setAttribute("aria-expanded", String(otwarte)); strz.textContent = otwarte ? "⌄" : "›";
      if (!otwarte || zbudowane) return;
      zbudowane = true;
      el("div", "font-size:12px;color:var(--muted);margin:10px 0;line-height:1.45;", cialo, "Bieg stacjonarny: wynik osoby, która biegła bez aplikacji. W rankingu z dopiskiem „wpisane przez organizatora”, bez numeru, dyplomu i odznaki; kilometry nie wchodzą do licznika ulicy. Tylko imię albo imię i inicjał, bez nazwiska, e-maila i telefonu.");
      forma = el("div", "", cialo); lista = el("div", "", cialo);
      formularzOrg(forma, b, null, odswiez);
      odswiez();
    });
  }

  function formularz(wiersz, u, bieg, poZapisie) {
    var stary = wiersz.querySelector("[data-zalicz-form]"); if (stary) { stary.remove(); return; }
    var f = el("div", "display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:8px;", wiersz); f.setAttribute("data-zalicz-form", "1");
    var dyst = null, czas = null;
    if (u.rodzaj === "dziecko") {
      var l = el("label", "font-size:12px;color:var(--muted);flex:1 1 120px;", f, "Dystans dziecka, km");
      dyst = el("input", "display:block;width:100%;margin-top:4px;" + POLE, l); dyst.inputMode = "decimal"; dyst.placeholder = "1,5"; dyst.maxLength = 6;
    } else {
      var l2 = el("label", "font-size:12px;color:var(--muted);flex:1 1 110px;", f, "Dystans");
      dyst = el("select", "display:block;width:100%;margin-top:4px;" + POLE, l2);
      (bieg.dystanse_km || []).forEach(function (d) { var o = el("option", "", dyst, d + " km"); o.value = String(d); if (Number(d) === Number(u.wynik_dystans_km || u.dystans_km)) o.selected = true; });
      var l3 = el("label", "font-size:12px;color:var(--muted);flex:1 1 120px;", f, "Czas (opcjonalnie, prywatny)");
      czas = el("input", "display:block;width:100%;margin-top:4px;" + POLE, l3); czas.placeholder = "58:00"; czas.maxLength = 8;
    }
    var ok = el("button", PRZYCISK + "flex:1 1 120px;background:var(--accent,#ff8a3c);color:#111;border:0;", f, "Zalicz"); ok.type = "button";
    var info = el("div", "font-size:13px;color:var(--red);flex:1 1 100%;", f);
    ok.addEventListener("click", function () {
      var d = u.rodzaj === "dziecko" ? kmZPola(dyst.value) : Number(dyst.value), s = czas ? sekundy(czas.value) : null;
      if (d == null || !(d > 0)) { info.textContent = "Wpisz dystans od 0,1 do 100 km."; return; }
      if (s !== null && isNaN(s)) { info.textContent = "Czas wpisz jak 58:00 albo 1:02:05 (od minuty do doby) albo zostaw puste."; return; }
      ok.disabled = true; info.textContent = "";
      wolaj("akcja_bieg_zalicz_recznie", { p_id: u.id, p_dystans_km: d, p_wynik_s: s }).then(function (w) {
        if (!w || !w.ok) { ok.disabled = false; info.textContent = komunikat(null, w); return; }
        poZapisie();
      }, function (e) { ok.disabled = false; info.textContent = komunikat(e); });
    });
  }

  function rysuj(kont, d, wczytaj) {
    kont.textContent = "";
    if (!d || !d.bieg) { el("div", "font-size:14px;color:var(--muted);padding:6px 0;", kont, "Nie ma jeszcze żadnego biegu. Bieg zakłada się wpisem w akcja_biegi (status „otwarty”)."); return; }
    var b = d.bieg, u = Array.isArray(d.uczestnicy) ? d.uczestnicy : [];
    if (Array.isArray(d.biegi) && d.biegi.length > 1) {
      var wyb = el("select", "width:100%;margin-bottom:10px;" + POLE, kont);
      d.biegi.forEach(function (x) { var o = el("option", "", wyb, x.nazwa + " · " + dzien(x.dzien_od) + " · " + (FAZA[x.faza] || x.faza)); o.value = x.slug; if (x.slug === b.slug) o.selected = true; });
      wyb.addEventListener("change", function () { wczytaj(wyb.value); });
    }
    el("div", "font-size:16px;font-weight:800;color:var(--fg);overflow-wrap:anywhere;", kont, b.nazwa);
    el("div", "font-size:13px;color:var(--muted);margin-top:2px;", kont, dzien(b.dzien_od) + "–" + dzien(b.dzien_do) + " · " + (FAZA[b.faza] || b.faza) + (koniecPl(b.koniec_at) ? " · koniec biegu i wyników " + koniecPl(b.koniec_at) : " · wyniki do " + dzien(b.wynik_do)) + " · zaliczanie ręczne do " + dzien(b.zalicz_do));
    var aktywni = u.filter(function (x) { return !x.wycofany; }), ukonczyli = aktywni.filter(function (x) { return x.ukonczony; }).length, dzieci = aktywni.filter(function (x) { return x.rodzaj === "dziecko"; }).length;
    el("div", "font-size:14px;color:var(--fg);margin:8px 0 4px;", kont, "Zapisani: " + aktywni.length + " (dzieci: " + dzieci + ") · ukończyli: " + ukonczyli + " · bez wyniku: " + (aktywni.length - ukonczyli));
    var nWer = liczbaDoWeryfikacji(aktywni), nFlag = liczbaDoSprawdzenia(aktywni);
    var licznikFlag = el("div", "font-size:14px;font-weight:800;margin:0 0 4px;color:" + (nWer || nFlag ? "var(--red)" : "var(--muted)") + ";", kont, "Do weryfikacji (ranking): " + nWer + " · do sprawdzenia: " + nFlag);
    licznikFlag.setAttribute("data-licznik-weryfikacji", String(nWer)); licznikFlag.setAttribute("data-licznik-flag", String(nFlag));
    var ostrz = ostrzezenieMaili(b);
    el("div", "font-size:13px;color:var(--muted);", kont, "Zgody na e-mail przypominający: " + (Number(b.zgody_email) || 0));
    if (ostrz) { var o = el("div", "margin:8px 0;padding:10px 12px;border-radius:12px;border:1px solid var(--red);color:var(--fg);font-size:13px;line-height:1.45;", kont, ostrz); o.setAttribute("role", "alert"); o.setAttribute("data-ostrzezenie-maili", "1"); }
    if (b.posprzatany) { el("div", "font-size:13px;color:var(--muted);", kont, "Dane uczestników usunięte po 90 dniach; zostały liczby i odznaki."); return; }
    var filtr = el("label", "display:flex;gap:8px;align-items:center;font-size:13px;color:var(--fg);margin:6px 0;min-height:44px;cursor:pointer;", kont), cz = el("input", "width:20px;height:20px;", filtr); cz.type = "checkbox";
    el("span", "", filtr, "Tylko bez wyniku");
    var filtr2 = el("label", "display:flex;gap:8px;align-items:center;font-size:13px;color:var(--fg);margin:6px 0;min-height:44px;cursor:pointer;", kont), cz2 = el("input", "width:20px;height:20px;", filtr2); cz2.type = "checkbox"; cz2.setAttribute("data-filtr-flag", "1");
    el("span", "", filtr2, "Tylko do weryfikacji i do sprawdzenia");
    var lista = el("div", "", kont), mozna = ["trwa", "wyniki", "zakonczony"].indexOf(b.faza) >= 0 && String(b.zalicz_do) >= dzisWaw();
    function pokaz() {
      lista.textContent = "";
      var widoczni = u.filter(function (x) { return (!cz.checked || (!x.ukonczony && !x.wycofany)) && (!cz2.checked || doSprawdzenia(x).length > 0 || (!x.wycofany && x.do_weryfikacji === true)); });
      if (!widoczni.length) el("div", "font-size:13px;color:var(--muted);padding:8px 0;", lista, cz2.checked ? "Nic do sprawdzenia." : cz.checked ? "Wszyscy mają wynik." : "Nikt się jeszcze nie zapisał.");
      widoczni.forEach(function (x) {
        var w = el("div", "padding:10px 0;border-top:1px solid var(--border);" + (x.wycofany ? "opacity:.55;" : ""), lista); w.setAttribute("data-uczestnik", x.id);
        var gora = el("div", "display:flex;gap:10px;align-items:baseline;", w);
        el("div", "flex:none;width:40px;font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--muted);", gora, String(x.numer));
        var srodek = el("div", "flex:1;min-width:0;", gora);
        el("div", "font-size:15px;font-weight:800;color:var(--fg);overflow-wrap:anywhere;", srodek, x.imie + (x.rodzaj === "dziecko" ? " · dziecko" : " · " + x.dystans_km + " km"));
        el("div", "font-size:12px;color:" + (x.ukonczony ? "var(--fg)" : "var(--muted)") + ";", srodek, stanTekst(x));
        var sz = szczegolyWyniku(x);
        if (sz) { var sze = el("div", "font-size:12px;color:var(--fg2);overflow-wrap:anywhere;", srodek, sz); sze.setAttribute("data-wynik-szczegoly", "1"); }
        var flagi = doSprawdzenia(x);
        if (flagi.length) { var fl = el("div", "font-size:12px;font-weight:800;color:var(--red);margin-top:2px;overflow-wrap:anywhere;", srodek, "Do sprawdzenia: " + flagi.join(" · ")); fl.setAttribute("data-do-sprawdzenia", "1"); }
        var sw = stanWeryfikacji(x);
        if (sw && !x.wycofany) { var swe = el("div", "font-size:12px;font-weight:800;margin-top:2px;color:" + (czekaNaWeryfikacje(x) || x.weryfikacja === "odrzucony" ? "var(--red)" : "var(--fg)") + ";", srodek, sw); swe.setAttribute("data-weryfikacja", x.weryfikacja || "czeka"); }
        if (!x.wycofany && mozna) {
          var z = el("button", PRZYCISK + "flex:none;background:none;color:var(--fg);border:1px solid var(--border);", gora, x.ukonczony ? "Popraw" : "Zalicz ręcznie"); z.type = "button";
          z.addEventListener("click", function () { formularz(w, x, b, function () { wczytaj(b.slug); }); });
        }
        var dol = null, info = null;
        if (!x.wycofany && mozna && x.ukonczony) { dol = el("div", "display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:6px;", w); info = el("div", "font-size:13px;color:var(--red);", w); }
        if (dol && x.do_weryfikacji === true) {
          [["zatwierdz", "Zatwierdź do rankingu", "zatwierdzony"], ["odrzuc", "Odrzuć (poproś o dowód)", "odrzucony"]].forEach(function (d) {
            if (x.weryfikacja === d[2]) return;
            var bw = el("button", PRZYCISK + "flex:none;background:none;color:var(--fg);border:1px solid var(--border);", dol, d[1]); bw.type = "button"; bw.setAttribute("data-weryfikuj", d[0]);
            bw.addEventListener("click", function () {
              bw.disabled = true; info.textContent = "";
              weryfikuj(x, d[0]).then(function (r) { bw.disabled = false; if (!r) return; if (!r.ok) { info.textContent = komunikat(null, r); return; } wczytaj(b.slug); }, function (e) { bw.disabled = false; info.textContent = komunikat(e); });
            });
          });
        }
        if (dol) {
          var us = el("button", PRZYCISK + "flex:none;background:none;color:var(--red);border:1px solid var(--red);", dol, "Usuń wynik"); us.type = "button"; us.setAttribute("data-usun-wynik", x.id);
          us.addEventListener("click", function () {
            us.disabled = true; info.textContent = "";
            usunWynik(x, b).then(function (r) { us.disabled = false; if (!r) return; if (!r.ok) { info.textContent = komunikat(null, r); return; } wczytaj(b.slug); }, function (e) { us.disabled = false; info.textContent = komunikat(e); });
          });
        }
      });
    }
    cz.addEventListener("change", pokaz); cz2.addEventListener("change", pokaz);
    pokaz();
    if (mozna) wynikiOrg(kont, b);   // 20261233: wyniki osób bez aplikacji (bieg stacjonarny)
    el("div", "font-size:11px;color:var(--muted);margin-top:8px;", kont, "Panel pokazuje prawdziwy wynik (dystans treningu, czas, tempo, źródło); publicznie czas jest tylko w rankingu, za zgodą uczestnika. Ręcznie zaliczony uczestnik dostaje dyplom i odznakę biegu. Wynik z tempem szybszym niż 3:00/km albo wolniejszym niż 36:00/km, a od regulaminu v6 także z treningu dłuższego niż maraton (42,2 km), wchodzi do rankingu dopiero po „Zatwierdź”; „Odrzuć” wysyła prośbę o dowód. „Do sprawdzenia” liczy baza (tempo spoza 3:00–36:00/km, trening dłuższy niż maraton od regulaminu v6, przy starszych regulaminach dłuższy niż dystans biegu, dziecko ponad 21 km); nic nie znika samo. „Usuń wynik” (§ 9 regulaminu) zabiera dyplom i miejsce, odznaka zostaje; uczestnik dostaje powiadomienie.");
  }
  function dzisWaw() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

  function start() {
    var sekcja = $("bieg-sec"), kont = $("bieg-panel"); if (!sekcja || !kont || !g.sb) return;
    function wczytaj(slug) {
      kont.textContent = "Wczytuję uczestników…";
      return wolaj("akcja_bieg_panel", { p_slug: slug || null }).then(function (d) { rysuj(kont, d, wczytaj); }, function (e) { kont.textContent = komunikat(e); });
    }
    var wczytane = false;
    sekcja.addEventListener("toggle", function () { if (sekcja.open && !wczytane) { wczytane = true; wczytaj(null); } });
    if (sekcja.open) { wczytane = true; wczytaj(null); }
  }
  g.BM_BIEG_PANEL = { szczegolyWyniku: szczegolyWyniku, sekundy: sekundy, kmZPola: kmZPola, stanTekst: stanTekst, komunikat: komunikat, ostrzezenieMaili: ostrzezenieMaili, doSprawdzenia: doSprawdzenia, liczbaDoSprawdzenia: liczbaDoSprawdzenia,
    pytanieUsuniecia: pytanieUsuniecia, sprawdzPowod: sprawdzPowod, usunWynik: usunWynik, rysuj: rysuj, czekaNaWeryfikacje: czekaNaWeryfikacje, liczbaDoWeryfikacji: liczbaDoWeryfikacji,
    stanWeryfikacji: stanWeryfikacji, pytanieOdrzucenia: pytanieOdrzucenia, weryfikuj: weryfikuj, koniecPl: koniecPl,
    imieOrg: imieOrg, formularzOrg: formularzOrg, rysujListeOrg: rysujListeOrg, wynikiOrg: wynikiOrg, pytanieUsunieciaOrg: pytanieUsunieciaOrg };
  if (g.document.readyState === "loading") g.document.addEventListener("DOMContentLoaded", start); else start();
})(globalThis);
