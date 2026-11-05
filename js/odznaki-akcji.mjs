// ODZNAKI AKCJI (projekt F, dzień 4) — definicje, okno przyznawania i reguły. Plik BEZ import/export (globalThis.BM_ODZNAKI_AKCJI),
// jak js/akcja.mjs: <script src> w zawodnik.html i odznaki.html, import w testach i w EF (nazwy dla okienka).
// ⚠️ Repo jest publiczne, a przed startem (7.11) nic nie może zdradzać akcji: w nazwach plików, slugach i tekstach NIE MA imienia dziecka.
//    Nazwa akcji w UI przychodzi z bazy (akcja_licznik.nazwa) i tylko po starcie. Katalog odznak akcji widać dopiero po starcie.
// FINAŁ ZASAD (Filip 2.11 15:16): 6 odznak w tej kolejności — progi 1 · 100 · 200 · 500 km akcji (km jak w liczniku:
// akcja_moj_wklad, cap/doba, doba warszawska), „7 dni z rzędu" (akcja-co-tydzien: 7 KOLEJNYCH dni kalendarzowych Europe/Warsaw
// z >= 1 biegiem albo chodem — RPC akcja_moje_dni, lista typów akcja_typ_liczy (Filip 2.11 18:35; było: każdy typ), wszystkie dni w oknie akcji; przyznawana raz, od razu po 7. dniu; przerwa
// zeruje serię, nowa seria może dać odznakę później), „Sponsor kilometrów" (przy zapisie deklaracji w oknie akcji; zostaje
// także po wycofaniu deklaracji). Usunięte: akcja-1000, akcja-razem, akcja-dzien-startu.
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
    { id: "akcja-co-tydzien", name: "7 dni z rzędu",      desc: "Aktywność przez 7 kolejnych dni w czasie akcji",                 rarity: "epic",      znak: "7" },
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
  /** Seria 7 dni: czy w dniAktywne jest 7 KOLEJNYCH dni, wszystkie w oknie [start, min(koniec, dziś)].
   *  Dzień sprzed startu nie należy do serii (6.11–12.11 → 7.11 jest dopiero 2. dniem → za mało). */
  function seria7(d, dniAktywne, teraz) {
    if (!d || !d.start) return false;
    var od = String(d.start), dzis = dzienWaw(teraz), doDnia = d.koniec && String(d.koniec) < dzis ? String(d.koniec) : dzis;
    var dni = Array.from(dniAktywne || []).filter(function (x) { return x >= od && x <= doDnia; }).sort();
    var ciag = 0, poprz = null;
    for (var i = 0; i < dni.length; i++) {
      ciag = poprz && dodajDni(poprz, 1) === dni[i] ? ciag + 1 : (poprz === dni[i] ? ciag : 1);
      poprz = dni[i];
      if (ciag >= 7) return true;
    }
    return false;
  }
  /** → lista slugów do przyznania DZIŚ. d = akcja_licznik, wklad = akcja_moj_wklad, dniAktywne = Set('YYYY-MM-DD' Warszawa)
   *  dni z biegiem albo chodem (RPC akcja_moje_dni) od startu. Poza oknem — pusta lista, zawsze (wpis wsteczny po zamknięciu nic nie daje). */
  function doPrzyznania(d, wklad, dniAktywne, teraz) {
    if (!oknoOtwarte(d, teraz)) return [];
    var out = [], km = Number(wklad && wklad.km) || 0;
    LISTA.forEach(function (b) { if (b.km && km >= b.km) out.push(b.id); });
    if (seria7(d, dniAktywne, teraz)) out.push("akcja-co-tydzien");
    if (wklad && wklad.stawka_gr != null && Number(wklad.stawka_gr) > 0) out.push("akcja-sponsor");
    return out;
  }

  /* POP-UP poza Dziś: kalendarz nie ma #badge-popup z zawodnik.html. Ten sam wygląd i czas, kolejka, gdy odznak jest kilka. */
  var KOLOR = { common: "#e8a040", rare: "#aac8ff", epic: "#c87ef0" }, _kolejka = [], _pokazuje = false;
  function nastepnyPopup() {
    if (_pokazuje || !_kolejka.length || !g.document || !g.document.body) return;
    _pokazuje = true;
    var b = _kolejka.shift(), n = g.document.createElement("div");
    n.id = "bm-odznaka-popup"; n.setAttribute("role", "status");
    n.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%) translateY(-160%);z-index:9999;width:90%;min-width:280px;max-width:340px;box-sizing:border-box;display:flex;gap:14px;align-items:center;padding:20px 24px 18px;border:1px solid #e8561e;border-radius:20px;background:linear-gradient(160deg,rgba(20,16,28,.97),rgba(12,10,20,.99));box-shadow:0 0 40px rgba(232,86,30,.5),0 8px 40px rgba(0,0,0,.8);color:#f0ede8;font-family:Inter,system-ui,sans-serif;transition:transform .45s cubic-bezier(.34,1.56,.64,1)";
    var im = g.document.createElement("img"); im.alt = ""; im.style.cssText = "width:64px;height:64px;border-radius:12px;flex-shrink:0"; ustawObraz(im, b.id, true); n.appendChild(im);
    var t = g.document.createElement("div"), wiersz = function (tekst, css) { var w = g.document.createElement("div"); w.textContent = tekst; w.style.cssText = css; t.appendChild(w); };
    wiersz("Nowa odznaka!", "font:400 18px/1 'Bebas Neue',Inter,sans-serif;letter-spacing:.06em");
    wiersz(b.name, "margin:4px 0 2px;font-size:12px;font-weight:700;letter-spacing:.08em;color:#ff8a3d");
    wiersz(b.desc, "font-size:11px;line-height:1.4;opacity:.8");
    wiersz((g.RARITY_LABEL && g.RARITY_LABEL[b.rarity]) || b.rarity, "margin-top:6px;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:" + (KOLOR[b.rarity] || "#fff"));
    n.appendChild(t); g.document.body.appendChild(n);
    g.setTimeout(function () { n.style.transform = "translateX(-50%) translateY(0)"; }, 30);
    g.setTimeout(function () { n.style.transform = "translateX(-50%) translateY(-160%)"; }, 3800);
    g.setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); _pokazuje = false; nastepnyPopup(); }, 4300);
  }
  /** Po zapisie logu poza Dziś (kalendarz): to samo przyznanie co na Dziś, od razu, z tym samym wierszem w dzwonku. Poza oknem akcji, bez sieci albo przy odmowie: nic, log i tak jest zapisany. → lista przyznanych. */
  async function przyznajPoLogu(sb, athleteId, teraz) {
    var C = g.BM_AKCJA_CYTATY, nowe = [];
    if (!sb || !athleteId || !C) return nowe;
    try {
      var slug = C.slugDla(athleteId), d = await C.odswiezStan(sb, athleteId, { wymus: true });
      if (!oknoOtwarte(d, teraz)) return nowe;
      var w = await sb.rpc("akcja_moj_wklad", { p_slug: slug }), r = await sb.rpc("akcja_moje_dni", { p_slug: slug }), dni = new Set();
      if (w.error) return nowe;
      ((r && r.data) || []).forEach(function (x) { dni.add(String(x).slice(0, 10)); });
      var ids = doPrzyznania(d, w.data, dni, teraz);
      if (!ids.length) return nowe;
      var ma = await sb.from("achievements").select("badge_id").eq("athlete_id", athleteId).in("badge_id", ids);
      if (ma.error) return nowe;
      var juz = (ma.data || []).map(function (x) { return x.badge_id; });
      for (var i = 0; i < ids.length; i++) {
        if (juz.indexOf(ids[i]) >= 0) continue;
        var dop = await sb.from("achievements").insert({ athlete_id: athleteId, badge_id: ids[i] });
        if (dop.error) continue;
        nowe.push(ids[i]);
        _kolejka.push(znajdz(ids[i]));
        try { await sb.from("notifications").insert({ athlete_id: athleteId, type: "badge", from_athlete_id: null, message: "Zdobyłeś odznakę: " + nazwa(ids[i]) + " 🏅", read: false, created_at: new Date().toISOString() }); } catch (e) {}
      }
      nastepnyPopup();
    } catch (e) {}
    return nowe;
  }

  g.BM_ODZNAKI_AKCJI = { przyznajPoLogu: przyznajPoLogu, LISTA: LISTA, czyAkcyjna: czyAkcyjna, znajdz: znajdz, nazwa: nazwa, src: src, zaslepka: zaslepka, onerrorAttr: onerrorAttr,
    ustawObraz: ustawObraz, oknoOtwarte: oknoOtwarte, katalogWidoczny: katalogWidoczny, seria7: seria7,
    doPrzyznania: doPrzyznania, dzienWaw: dzienWaw, KATALOG_PLIKOW: KATALOG_PLIKOW };
})(typeof globalThis !== "undefined" ? globalThis : this);
