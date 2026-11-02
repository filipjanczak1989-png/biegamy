// ODZNAKI AKCJI (projekt F, dzień 4) — definicje, okno przyznawania i reguły. Plik BEZ import/export (globalThis.BM_ODZNAKI_AKCJI),
// jak js/akcja.mjs: <script src> w zawodnik.html i odznaki.html, import w testach i w EF (nazwy dla okienka).
// ⚠️ Repo jest publiczne, a przed 8.11 nic nie może zdradzać akcji: w nazwach plików, slugach i tekstach NIE MA imienia dziecka.
//    Nazwa akcji w UI przychodzi z bazy (akcja_licznik.nazwa) i tylko po starcie. Katalog odznak akcji widać dopiero po starcie.
// Spec v2 pkt 4: progi 1 · 100 · 200 · 500 · 1000 km akcji (km jak w liczniku: akcja_moj_wklad, cap/doba, doba warszawska),
// „Co tydzień" (aktywność w każdym pełnym tygodniu pn–nd od startu do zamknięcia, bez przerwy), „Razem" (aktywność w dniu,
// w którym społeczność domknęła cel), „Sponsor kilometrów" (deklaracja stawki w oknie akcji).
// OKNO: od dnia startu do dnia zamknięcia WŁĄCZNIE; przed startem i po zamknięciu nigdy. Przyznane zostają na zawsze.
// Grafiki: assets/odznaki/<slug>.webp (256 px) i <slug>-512.webp — od Filipa (GPT). Do czasu plików zaślepka SVG w tym samym
// <img> (ten sam rozmiar): podmiana pliku nie rusza kodu ani układu. „Nie mam" = ta sama grafika z filtrem, bez osobnych plików.
(function (g) {
  "use strict";
  var LISTA = [
    { id: "akcja-1km",        name: "Pierwszy kilometr",  desc: "Pierwszy kilometr w akcji",                                      rarity: "common",    km: 1,    znak: "1" },
    { id: "akcja-100",        name: "100 km akcji",       desc: "100 km w akcji",                                                 rarity: "common",    km: 100,  znak: "100" },
    { id: "akcja-200",        name: "200 km akcji",       desc: "200 km w akcji",                                                 rarity: "rare",      km: 200,  znak: "200" },
    { id: "akcja-500",        name: "500 km akcji",       desc: "500 km w akcji",                                                 rarity: "epic",      km: 500,  znak: "500" },
    { id: "akcja-1000",       name: "1000 km akcji",      desc: "1000 km w akcji",                                                rarity: "legendary", km: 1000, znak: "1000" },
    { id: "akcja-co-tydzien", name: "Co tydzień",         desc: "Aktywność w każdym pełnym tygodniu akcji, bez przerwy",          rarity: "epic",      znak: "7/7" },
    { id: "akcja-razem",      name: "Razem do celu",      desc: "Aktywność w dniu, w którym razem dobiliśmy do celu",            rarity: "rare",      znak: "✓" },
    { id: "akcja-sponsor",    name: "Sponsor kilometrów", desc: "Deklaracja stawki za kilometr w czasie akcji",                   rarity: "rare",      znak: "gr" },
  ].map(function (b) { b.cat = "Akcja"; return b; });
  var KATALOG_PLIKOW = "assets/odznaki/";

  function czyAkcyjna(id) { return typeof id === "string" && id.indexOf("akcja-") === 0; }
  function znajdz(id) { for (var i = 0; i < LISTA.length; i++) if (LISTA[i].id === id) return LISTA[i]; return null; }
  function nazwa(id) { var b = znajdz(id); return b ? b.name : null; }
  function src(id, duzy) { return KATALOG_PLIKOW + id + (duzy ? "-512" : "") + ".webp"; }
  /** Zaślepka do czasu grafiki od Filipa: pomarańczowe koło + znak, kwadratowy SVG (skaluje się do rozmiaru <img>). */
  function zaslepka(id) {
    var b = znajdz(id), z = b ? b.znak : "?", fs = z.length >= 4 ? 30 : z.length === 3 ? 36 : 44;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx="50%" cy="40%" r="60%">' +
      '<stop offset="0" stop-color="#ff8a3d"/><stop offset="1" stop-color="#e8561e"/></radialGradient></defs>' +
      '<circle cx="50" cy="50" r="46" fill="url(#g)"/><circle cx="50" cy="50" r="40" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>' +
      '<text x="50" y="50" dy=".35em" text-anchor="middle" font-family="Bebas Neue,Arial Narrow,Arial,sans-serif" font-weight="700" font-size="' + fs +
      '" fill="#fff">' + z.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</text></svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  /** Atrybut onerror dla <img> odznaki akcji: brak pliku → zaślepka (raz, bez pętli). */
  function onerrorAttr(id) { return czyAkcyjna(id) ? "if(!this.dataset.z){this.dataset.z=1;this.src=window.BM_ODZNAKI_AKCJI.zaslepka(this.dataset.odz)}" : ""; }
  /** Ustawienie obrazu w istniejącym <img> (pop-up, szczegóły) — z zaślepką. */
  function ustawObraz(img, id, duzy) {
    if (!img) return;
    img.dataset.odz = id; delete img.dataset.z;
    img.onerror = function () { if (!img.dataset.z) { img.dataset.z = "1"; img.src = zaslepka(id); } };
    img.src = src(id, duzy);
  }

  function dzienWaw(t) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(t || new Date());
  }
  function dodajDni(d, n) { var x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  /** Okno przyznawania: akcja wystartowała, dziś ∈ [start, koniec] (koniec null = trwa). Przed startem i po zamknięciu: false. */
  function oknoOtwarte(d, teraz) {
    if (!d || !d.wystartowala || !d.start) return false;
    var dzis = dzienWaw(teraz);
    return dzis >= String(d.start) && (!d.koniec || dzis <= String(d.koniec));
  }
  /** Katalog odznak akcji widoczny dopiero po starcie (i zostaje po zamknięciu — przyznane są na zawsze). */
  function katalogWidoczny(d) { return !!(d && d.wystartowala); }
  /** Dzień zamknięcia: koniec wpisany = dziś, albo (przed nocnym cronem) suma dobiła do celu dziś. */
  function dzienZamkniecia(d, teraz) {
    if (!oknoOtwarte(d, teraz)) return false;
    var dzis = dzienWaw(teraz);
    return d.koniec ? String(d.koniec) === dzis : Number(d.suma_km) >= Number(d.cel_km);
  }
  /** Czy w każdym PEŁNYM tygodniu pn–nd między startem a dziś jest dzień aktywny. Brak pełnego tygodnia → true. */
  function coTydzien(start, dzis, dniAktywne) {
    var x = String(start);
    var dow = new Date(x + "T12:00:00Z").getUTCDay();          // 0 = nd
    var pon = dow === 1 ? x : dodajDni(x, dow === 0 ? 1 : 8 - dow);
    for (; dodajDni(pon, 6) <= dzis; pon = dodajDni(pon, 7)) {
      var jest = false;
      for (var i = 0; i < 7 && !jest; i++) jest = dniAktywne.has(dodajDni(pon, i));
      if (!jest) return false;
    }
    return true;
  }
  /** → lista slugów do przyznania DZIŚ. d = akcja_licznik, wklad = akcja_moj_wklad, dniAktywne = Set('YYYY-MM-DD' Warszawa)
   *  z dniami z aktywnością od startu (potrzebne tylko w dniu zamknięcia). Poza oknem — pusta lista, zawsze. */
  function doPrzyznania(d, wklad, dniAktywne, teraz) {
    if (!oknoOtwarte(d, teraz)) return [];
    var out = [], km = Number(wklad && wklad.km) || 0;
    LISTA.forEach(function (b) { if (b.km && km >= b.km) out.push(b.id); });
    if (wklad && wklad.stawka_gr != null && Number(wklad.stawka_gr) > 0) out.push("akcja-sponsor");
    if (dzienZamkniecia(d, teraz)) {
      var dzis = dzienWaw(teraz), dni = dniAktywne || new Set();
      if (dni.has(dzis)) out.push("akcja-razem");
      if (km > 0 && coTydzien(d.start, dzis, dni)) out.push("akcja-co-tydzien");
    }
    return out;
  }

  g.BM_ODZNAKI_AKCJI = { LISTA: LISTA, czyAkcyjna: czyAkcyjna, znajdz: znajdz, nazwa: nazwa, src: src, zaslepka: zaslepka, onerrorAttr: onerrorAttr,
    ustawObraz: ustawObraz, oknoOtwarte: oknoOtwarte, katalogWidoczny: katalogWidoczny, dzienZamkniecia: dzienZamkniecia, coTydzien: coTydzien,
    doPrzyznania: doPrzyznania, dzienWaw: dzienWaw, KATALOG_PLIKOW: KATALOG_PLIKOW };
})(typeof globalThis !== "undefined" ? globalThis : this);
