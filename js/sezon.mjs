// SEZON — jedno ustawienie wyglądu ulicy, Miasta, gry i plakatu (Filip 13.11). Plik BEZ import/export (globalThis.BM_SEZON), jak js/akcja.mjs.
// Ładują go: js/akcja.mjs przed js/ulica.mjs (Dziś, landing, strona akcji: bez zmian w zamrożonych zawodnik.html i index.html), <script> na stronach Miasta i gry.
// Kolejność wyboru: ?sezon=jesien|zima (podgląd tylko w tej karcie) → WYMUSZONY → data lokalna w ZAKRESY → "jesien". Brak pliku albo błąd = jesień, bo każde użycie idzie przez g.BM_SEZON ? … : ścieżka.
// Grafiki sezonu leżą w assets/sezony/<sezon>/<katalog>/<ta sama nazwa>. adres() podmienia ścieżkę WYŁĄCZNIE dla plików z manifestu PLIKI (test porównuje go z katalogiem), więc brak pliku zimowego = plik jesienny.
(function (g) {
  "use strict";
  /* RĘCZNE NADPISANIE: "jesien" do przełączenia przez Filipa. null = według dat z ZAKRESY, "zima" = zima od razu. */
  var WYMUSZONY = "jesien";
  /* Zakresy dat MM-DD (lokalna data telefonu, nie UTC). Zakres może przejść przez Nowy Rok. Jesień to wszystko poza nimi. */
  var ZAKRESY = { zima: ["12-01", "01-06"] };
  var SEZONY = { jesien: true, zima: true };
  /* Manifest plików zimowych: katalog/nazwa względem assets/. */
  var PLIKI = {
    zima: [
      "gra/bidon.webp", "gra/domek1.webp", "gra/domek2.webp", "gra/domek3.webp", "gra/domek4.webp", "gra/domek5.webp", "gra/domek6.webp", "gra/domek7.webp",
      "gra/droga.webp", "gra/drzewo.webp", "gra/fabryka.webp", "gra/galeria.webp", "gra/gorka.webp", "gra/kask.webp", "gra/krajobraz.webp", "gra/krajobraz_daleki.webp",
      "gra/latarnia.webp", "gra/mikolaj.webp", "gra/mikolaj_karta.webp", "gra/osiedle.webp", "gra/trawa_pod_droga.webp", "gra/but.webp", "gra/wiezowiec.webp", "gra/zel.webp",
      "miasto/domek-urodzinowy.webp", "miasto/staw.webp", "miasto/szkola.webp", "miasto/tlo-mapy.webp", "miasto/ulica-zbudowana.webp",
      "ulica/budowniczy.webp", "ulica/domek-1.webp", "ulica/domek-2.webp", "ulica/domek-3.webp", "ulica/domek-4.webp", "ulica/domek-5.webp", "ulica/domek-6.webp", "ulica/domek-7.webp",
      "ulica/droga.webp", "ulica/drzewo.webp", "ulica/fabryka.webp", "ulica/galeria.webp", "ulica/latarnia.webp", "ulica/mur.webp", "ulica/osiedle.webp", "ulica/park.webp",
      "ulica/pierwszy-plan.webp", "ulica/plac-budowy.webp", "ulica/plac-zabaw.webp", "ulica/plot.webp", "ulica/slupek.webp", "ulica/wiezowiec.webp", "ulica/wzgorza.webp"
    ]
  };
  /* Kolory rysowane w kodzie (łąka, grunt, liście, niebo i trawa plakatu). Jesień = dokładnie dzisiejsze wartości. */
  var PALETY = {
    jesien: {
      laka: "linear-gradient(#86ad55,#6d9a47 28%,#5f8a3a 62%,#4f7a33)", grunt: "linear-gradient(#6d8f3f 0 12%,#8c6d3f 12% 72%,#7a5d33 76%,#5f8a3a 78%)",
      liscie: ["#e8892b", "#f2b32a", "#d9482b", "#b5651d"], platki: false,
      konfetti: ["#e9772b", "#f2b233", "#c9472b", "#d98a23", "#8fae3c"],
      trawaGry: "#7f9150", ziemiaGry: "#2b3a20", pasPodDroga: ["#26380f", "#16220a"], trawaPasa: "rgba(92,134,48,.55)", ziemiaPasa: ["#6b4524", "#33200f"],
      mapaTlo: "#9fb050"
    },
    zima: {
      laka: "linear-gradient(#f4f8fc,#e3edf6 28%,#d3e2ef 62%,#c3d5e6)", grunt: "linear-gradient(#e9f1f8 0 12%,#8c6d3f 12% 72%,#7a5d33 76%,#dfe9f3 78%)",
      liscie: ["#ffffff", "#f2f7fc", "#e3eef8", "#d6e6f5"], platki: true,
      konfetti: ["#ffffff", "#e3eef8", "#d8343a", "#2f9e5a", "#f2b632"],
      trawaGry: "#dfe9f3", ziemiaGry: "#9fb3c8", pasPodDroga: ["#dbe7f2", "#b9cde2"], trawaPasa: "rgba(255,255,255,.55)", ziemiaPasa: ["#c3d5e6", "#9fb3c8"],
      mapaTlo: "#e3edf6"
    }
  };
  var _zestaw = null;
  function zestaw(s) { if (!_zestaw) { _zestaw = {}; Object.keys(PLIKI).forEach(function (k) { var m = {}; PLIKI[k].forEach(function (p) { m[p] = true; }); _zestaw[k] = m; }); } return _zestaw[s] || {}; }
  function zParametru() { try { var s = new URLSearchParams(g.location && g.location.search || "").get("sezon"); return s && SEZONY[s] ? s : null; } catch (e) { return null; } }
  function mmdd(d) { var m = d.getMonth() + 1, dz = d.getDate(); return (m < 10 ? "0" : "") + m + "-" + (dz < 10 ? "0" : "") + dz; }
  function zDaty(d) {
    var t = mmdd(d), wynik = null;
    Object.keys(ZAKRESY).forEach(function (s) { var z = ZAKRESY[s]; if (z[0] <= z[1] ? t >= z[0] && t <= z[1] : t >= z[0] || t <= z[1]) wynik = s; });
    return wynik;
  }
  /** Aktywny sezon. d tylko w testach. */
  function aktywny(d) { return zParametru() || WYMUSZONY || zDaty(d || new Date()) || "jesien"; }
  /** 'assets/ulica/drzewo.webp' → 'assets/sezony/zima/ulica/drzewo.webp', gdy sezon ma ten plik; inaczej ścieżka bez zmian (także z ?v= na końcu). */
  function adres(p, s) {
    var sz = s || aktywny();
    if (sz === "jesien" || typeof p !== "string") return p;
    var m = /^(\.?\/?)assets\/([^?#]+)(.*)$/.exec(p);
    if (!m || !zestaw(sz)[m[2]]) return p;
    return m[1] + "assets/sezony/" + sz + "/" + m[2] + m[3];
  }
  function paleta(s) { return PALETY[s || aktywny()] || PALETY.jesien; }
  /* Kolory łąki i trawy wpisane w CSS i na płótnach (Miasto, plakaty, gra): ta sama tabela dla napisów (#rrggbb) i dla CSSOM (rgb(r, g, b)). */
  var MAPA_KOLOROW = { zima: { "#86ad55": "#e3edf6", "#6d9a47": "#d3e2ef", "#5f8a3a": "#c3d5e6", "#4f7a33": "#b9cde2", "#9fb050": "#e3edf6", "#7f9150": "#dfe9f3", "#2b3a20": "#9fb3c8", "#26380f": "#dbe7f2", "#16220a": "#b9cde2", "#6b4524": "#c3d5e6", "#33200f": "#9fb3c8" } };
  function kolory(t, s) {
    var m = MAPA_KOLOROW[s || aktywny()]; if (!m || typeof t !== "string") return t;
    return t.replace(/#[0-9a-fA-F]{6}\b/g, function (k) { return m[k.toLowerCase()] || k; });
  }
  function rgb(h) { return "rgb(" + parseInt(h.slice(1, 3), 16) + ", " + parseInt(h.slice(3, 5), 16) + ", " + parseInt(h.slice(5, 7), 16) + ")"; }
  function koloryCssom(t, s) {
    var m = MAPA_KOLOROW[s || aktywny()]; if (!m) return t;
    Object.keys(m).forEach(function (k) { t = t.split(rgb(k)).join(rgb(m[k])); });
    return t;
  }
  /* STRONY (Miasto, gra): <script src="js/sezon.mjs" data-strona> podmienia statyczne i dynamiczne <img src="assets/…"> oraz url() i kolory łąki w arkuszach strony.
     Tylko poza jesienią; jesień nie dotyka niczego. Dziś i landing tego nie włączają: ulicę prowadzi tam kod (js/ulica.mjs). */
  function podmienImg(im) { var s = im && im.getAttribute && im.getAttribute("src"); if (!s) return; var z = adres(s); if (z !== s) im.setAttribute("src", z); }
  function podmienReguly(reguly, s) {
    for (var i = 0; reguly && i < reguly.length; i++) {
      var r = reguly[i];
      if (r.cssRules) podmienReguly(r.cssRules, s);
      if (!r.style) continue;
      ["background-image", "background-color", "background"].forEach(function (w) {
        var v = r.style.getPropertyValue(w); if (!v) return;
        var n = koloryCssom(v.replace(/url\("?([^")]+)"?\)/g, function (m, u) { return 'url("' + adres(u, s) + '")'; }), s);
        if (n !== v) r.style.setProperty(w, n, r.style.getPropertyPriority(w));
      });
    }
  }
  function podmienStrone(doc) {
    var s = aktywny(), d = doc || g.document; if (s === "jesien" || !d) return;
    Array.prototype.forEach.call(d.querySelectorAll('img[src^="assets/"]'), podmienImg);
    Array.prototype.forEach.call(d.styleSheets || [], function (ss) { var r; try { r = ss.cssRules; } catch (e) { return; } podmienReguly(r, s); });
  }
  function naStronie() {
    var d = g.document; if (!d || aktywny() === "jesien") return;
    if (g.MutationObserver) new g.MutationObserver(function (lista) {
      lista.forEach(function (m) {
        if (m.type === "attributes") { if (m.target.tagName === "IMG") podmienImg(m.target); return; }
        Array.prototype.forEach.call(m.addedNodes, function (n) {
          if (n.nodeType !== 1) return;
          if (n.tagName === "IMG") podmienImg(n); else if (n.querySelectorAll) Array.prototype.forEach.call(n.querySelectorAll("img"), podmienImg);
          if (n.tagName === "STYLE" && n.sheet) { try { podmienReguly(n.sheet.cssRules, aktywny()); } catch (e) {} }
        });
      });
    }).observe(d.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", function () { podmienStrone(d); }); else podmienStrone(d);
  }
  g.BM_SEZON = { aktywny: aktywny, adres: adres, paleta: paleta, kolory: kolory, podmienStrone: podmienStrone, zima: function () { return aktywny() === "zima"; }, PLIKI: PLIKI, ZAKRESY: ZAKRESY, WYMUSZONY: WYMUSZONY, zDaty: zDaty };
  try { var ten = g.document && g.document.currentScript; if (ten && ten.hasAttribute("data-strona")) naStronie(); } catch (e) {}
})(typeof globalThis !== "undefined" ? globalThis : this);
