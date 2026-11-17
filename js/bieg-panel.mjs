// Panel trenera: bieg wirtualny (20261126_akcja_bieg_wyniki). Lista uczestników (imię, numer, stan; bez czasów, kont i e-maili) i ręczne zaliczenie biegu.
// 20261206: flaga „do sprawdzenia” z bazy (powód słownie, licznik w nagłówku, filtr) i „Usuń wynik” z powodem i potwierdzeniem (akcja_bieg_usun_wynik).
// Plik BEZ import/export, jak js/firmy-panel.mjs. Dane z funkcji akcja_bieg_panel i akcja_bieg_zalicz_recznie (bramka trenera w bazie). Bez innerHTML: imiona są niezaufane.
(function (g) {
  "use strict";
  var $ = function (id) { return g.document.getElementById(id); };
  function el(tag, styl, rodzic, tekst) { var e = g.document.createElement(tag); if (styl) e.style.cssText = styl; if (tekst != null) e.textContent = tekst; if (rodzic) rodzic.appendChild(e); return e; }
  var PRZYCISK = "font:inherit;font-size:14px;font-weight:800;padding:10px 14px;min-height:44px;border-radius:12px;cursor:pointer;";
  var POLE = "box-sizing:border-box;padding:10px;min-height:44px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--fg);font:inherit;font-size:15px;";
  var FAZA = { szkic: "szkic (niewidoczny)", zapisy: "zapisy", trwa: "trwa", wyniki: "dopisywanie wyników", zakonczony: "zakończony" };
  function km(x) { var n = Number(x) || 0; return (Math.round(n * 100) / 100).toLocaleString("pl-PL"); }
  function dzien(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? Number(m[3]) + "." + Number(m[2]) + "." + m[1] : ""; }
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
    return p === "dystans" ? "Zły dystans: dorosły z listy biegu, dziecko 0,1–100 km." : p === "czas" ? "Czas: od 1:00 do 24:00:00, u dziecka bez czasu." : p === "za_pozno" ? "Po terminie: zaliczać można do 7 dni po końcu dopisywania wyników."
      : p === "przed_biegiem" ? "Bieg jeszcze się nie zaczął." : p === "nie_ma" ? "Tego zapisu już nie ma (wycofany albo usunięty)."
      : p === "zly_powod" ? "Wpisz powód: od 3 do 200 znaków, w jednej linii." : p === "bez_wyniku" ? "Ten zapis nie ma wyniku (może usunięty albo jeszcze niezaliczony). Odśwież listę." : "Nie udało się.";
  }
  /* 20261206: flaga „do sprawdzenia” liczona w bazie (akcja_bieg_do_sprawdzenia): tylko powody słownie, bez czasu; nic nie znika samo */
  function doSprawdzenia(u) { return u && !u.wycofany && Array.isArray(u.do_sprawdzenia) ? u.do_sprawdzenia.filter(function (p) { return typeof p === "string" && p; }) : []; }
  function liczbaDoSprawdzenia(lista) { return (Array.isArray(lista) ? lista : []).filter(function (u) { return doSprawdzenia(u).length > 0; }).length; }
  function pytanieUsuniecia(u) { return "Usunąć wynik: " + u.imie + ", numer " + u.numer + "? Dyplom i miejsce na liście znikną, uczestnik dostanie powiadomienie z powodem. Przywrócisz go przyciskiem „Zalicz ręcznie”."; }
  function sprawdzPowod(t) { var s = String(t == null ? "" : t).trim(); return s.length < 3 || s.length > 200 ? "Wpisz powód: od 3 do 200 znaków." : ""; }
  /** „Usuń wynik” (§ 9 ust. 3–4 regulaminu): okienko panelu z powodem (BM_OKIENKO), bez niego prompt i confirm. Bez powodu albo po „Anuluj” nic nie wysyła. → Promise<wynik RPC | null> */
  function usunWynik(u) {
    var pytaj = g.BM_OKIENKO
      ? g.BM_OKIENKO({ tytul: "Usunąć wynik?", tekst: pytanieUsuniecia(u), tak: "Usuń wynik", nie: "Anuluj", grozne: true, pola: [{ klucz: "powod", etykieta: "Powód (zobaczy go uczestnik), np. brak potwierdzenia z zegarka", typ: "text", maks: 200 }], sprawdz: function (w) { return sprawdzPowod(w.powod); } })
      : Promise.resolve((function () { var p = g.prompt ? g.prompt("Powód usunięcia wyniku (zobaczy go uczestnik):", "") : null; if (p == null || sprawdzPowod(p) || !g.confirm || !g.confirm(pytanieUsuniecia(u))) return null; return { powod: p.trim() }; })());
    return Promise.resolve(pytaj).then(function (w) {
      if (!w || sprawdzPowod(w.powod)) return null;
      return wolaj("akcja_bieg_usun_wynik", { p_id: u.id, p_powod: String(w.powod).trim() });
    });
  }
  function wolaj(nazwa, args) {
    return Promise.resolve(g.sb.rpc(nazwa, args)).then(function (r) { if (r.error) throw r.error; return r.data; });
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
    el("div", "font-size:13px;color:var(--muted);margin-top:2px;", kont, dzien(b.dzien_od) + "–" + dzien(b.dzien_do) + " · " + (FAZA[b.faza] || b.faza) + " · wyniki do " + dzien(b.wynik_do) + " · zaliczanie ręczne do " + dzien(b.zalicz_do));
    var aktywni = u.filter(function (x) { return !x.wycofany; }), ukonczyli = aktywni.filter(function (x) { return x.ukonczony; }).length, dzieci = aktywni.filter(function (x) { return x.rodzaj === "dziecko"; }).length;
    el("div", "font-size:14px;color:var(--fg);margin:8px 0 4px;", kont, "Zapisani: " + aktywni.length + " (dzieci: " + dzieci + ") · ukończyli: " + ukonczyli + " · bez wyniku: " + (aktywni.length - ukonczyli));
    var nFlag = liczbaDoSprawdzenia(aktywni), licznikFlag = el("div", "font-size:14px;font-weight:800;margin:0 0 4px;color:" + (nFlag ? "var(--red)" : "var(--muted)") + ";", kont, "Do sprawdzenia: " + nFlag);
    licznikFlag.setAttribute("data-licznik-flag", String(nFlag));
    var ostrz = ostrzezenieMaili(b);
    el("div", "font-size:13px;color:var(--muted);", kont, "Zgody na e-mail przypominający: " + (Number(b.zgody_email) || 0));
    if (ostrz) { var o = el("div", "margin:8px 0;padding:10px 12px;border-radius:12px;border:1px solid var(--red);color:var(--fg);font-size:13px;line-height:1.45;", kont, ostrz); o.setAttribute("role", "alert"); o.setAttribute("data-ostrzezenie-maili", "1"); }
    if (b.posprzatany) { el("div", "font-size:13px;color:var(--muted);", kont, "Dane uczestników usunięte po 90 dniach; zostały liczby i odznaki."); return; }
    var filtr = el("label", "display:flex;gap:8px;align-items:center;font-size:13px;color:var(--fg);margin:6px 0;min-height:44px;cursor:pointer;", kont), cz = el("input", "width:20px;height:20px;", filtr); cz.type = "checkbox";
    el("span", "", filtr, "Tylko bez wyniku");
    var filtr2 = el("label", "display:flex;gap:8px;align-items:center;font-size:13px;color:var(--fg);margin:6px 0;min-height:44px;cursor:pointer;", kont), cz2 = el("input", "width:20px;height:20px;", filtr2); cz2.type = "checkbox"; cz2.setAttribute("data-filtr-flag", "1");
    el("span", "", filtr2, "Tylko do sprawdzenia");
    var lista = el("div", "", kont), mozna = ["trwa", "wyniki", "zakonczony"].indexOf(b.faza) >= 0 && String(b.zalicz_do) >= dzisWaw();
    function pokaz() {
      lista.textContent = "";
      var widoczni = u.filter(function (x) { return (!cz.checked || (!x.ukonczony && !x.wycofany)) && (!cz2.checked || doSprawdzenia(x).length > 0); });
      if (!widoczni.length) el("div", "font-size:13px;color:var(--muted);padding:8px 0;", lista, cz2.checked ? "Nic do sprawdzenia." : cz.checked ? "Wszyscy mają wynik." : "Nikt się jeszcze nie zapisał.");
      widoczni.forEach(function (x) {
        var w = el("div", "padding:10px 0;border-top:1px solid var(--border);" + (x.wycofany ? "opacity:.55;" : ""), lista); w.setAttribute("data-uczestnik", x.id);
        var gora = el("div", "display:flex;gap:10px;align-items:baseline;", w);
        el("div", "flex:none;width:40px;font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--muted);", gora, String(x.numer));
        var srodek = el("div", "flex:1;min-width:0;", gora);
        el("div", "font-size:15px;font-weight:800;color:var(--fg);overflow-wrap:anywhere;", srodek, x.imie + (x.rodzaj === "dziecko" ? " · dziecko" : " · " + x.dystans_km + " km"));
        el("div", "font-size:12px;color:" + (x.ukonczony ? "var(--fg)" : "var(--muted)") + ";", srodek, stanTekst(x));
        var flagi = doSprawdzenia(x);
        if (flagi.length) { var fl = el("div", "font-size:12px;font-weight:800;color:var(--red);margin-top:2px;overflow-wrap:anywhere;", srodek, "Do sprawdzenia: " + flagi.join(" · ")); fl.setAttribute("data-do-sprawdzenia", "1"); }
        if (!x.wycofany && mozna) {
          var z = el("button", PRZYCISK + "flex:none;background:none;color:var(--fg);border:1px solid var(--border);", gora, x.ukonczony ? "Popraw" : "Zalicz ręcznie"); z.type = "button";
          z.addEventListener("click", function () { formularz(w, x, b, function () { wczytaj(b.slug); }); });
        }
        if (!x.wycofany && mozna && x.ukonczony) {
          var dol = el("div", "display:flex;justify-content:flex-end;margin-top:6px;", w);
          var us = el("button", PRZYCISK + "flex:none;background:none;color:var(--red);border:1px solid var(--red);", dol, "Usuń wynik"); us.type = "button"; us.setAttribute("data-usun-wynik", x.id);
          var info = el("div", "font-size:13px;color:var(--red);", w);
          us.addEventListener("click", function () {
            us.disabled = true; info.textContent = "";
            usunWynik(x).then(function (r) { us.disabled = false; if (!r) return; if (!r.ok) { info.textContent = komunikat(null, r); return; } wczytaj(b.slug); }, function (e) { us.disabled = false; info.textContent = komunikat(e); });
          });
        }
      });
    }
    cz.addEventListener("change", pokaz); cz2.addEventListener("change", pokaz);
    pokaz();
    el("div", "font-size:11px;color:var(--muted);margin-top:8px;", kont, "Czasy są prywatne: panel ich nie pokazuje. Ręcznie zaliczony uczestnik dostaje dyplom i odznakę biegu. „Do sprawdzenia” liczy baza (tempo szybsze niż 3:00/km, trening ponad 2 razy dłuższy niż dystans, dziecko ponad 21 km); nic nie znika samo. „Usuń wynik” (§ 9 regulaminu) zabiera dyplom i miejsce, odznaka zostaje; uczestnik dostaje powiadomienie.");
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
  g.BM_BIEG_PANEL = { sekundy: sekundy, kmZPola: kmZPola, stanTekst: stanTekst, komunikat: komunikat, ostrzezenieMaili: ostrzezenieMaili, doSprawdzenia: doSprawdzenia, liczbaDoSprawdzenia: liczbaDoSprawdzenia,
    pytanieUsuniecia: pytanieUsuniecia, sprawdzPowod: sprawdzPowod, usunWynik: usunWynik, rysuj: rysuj };
  if (g.document.readyState === "loading") g.document.addEventListener("DOMContentLoaded", start); else start();
})(globalThis);
