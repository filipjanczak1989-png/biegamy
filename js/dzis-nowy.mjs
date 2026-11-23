// NOWE DZIŚ (plan 13.11, Filip 23.11) — etap E0: przełącznik widoczności, korzeń i baner etapu. Ładowany przez blok DZIS-E0 1 w zawodnik.html
// WYŁĄCZNIE dla konta, któremu dzis_wersja() odpowiada „nowy” (dziś: tylko konto Filipa). Przełącznik służy widoczności, nie jest zabezpieczeniem,
// więc ten moduł nie czyta i nie zapisuje żadnych danych: bez zapytań, bez localStorage, bez sesji. W E0 rysuje w #dzis-nowy jeden stały baner,
// a stare Dziś zostaje pod nim bez zmian; chowanie starych elementów (CSS w bloku DZIS-E0 2) włącza dopiero klasa dzis-gotowy w E1.
// Plik BEZ import/export (globalThis.BM_DZIS), jak js/ulica.mjs. Zmiana tego pliku = nowa stała MODUL_V w bloku DZIS-E0 1 (blizna-336 pilnuje).
(function (w, d) {
  "use strict";
  var ETAP = "E0", owiniete = false;
  function korzen() { return d.getElementById("dzis-nowy"); }
  function wlaczone() { return d.documentElement.classList.contains("dzis-nowy"); }
  function naDzis() { var s = w._currentSection; return !s || s === "home"; }
  /** Korzeń widać tylko przy włączonym przełączniku i na sekcji Dziś (showSection chowa stare elementy, nowy korzeń chowamy sami). */
  function pokaz() { var k = korzen(); if (k) k.hidden = !(wlaczone() && naDzis()); }
  var BANER = '<div style="margin:0 16px 12px;padding:12px 14px;border-radius:12px;background:var(--card,#141418);border:1px solid var(--border,#2a2a30);' +
    'display:flex;flex-direction:column;gap:6px">' +
    '<b style="font-size:13px;letter-spacing:.04em;color:var(--accent,#ff6b1a)">Nowe Dziś · etap E0</b>' +
    '<span style="font-size:13px;line-height:1.45;color:var(--fg2,#b8b8c0)">Przełącznik działa: to konto widzi nowe Dziś. Treść dojdzie w kolejnych etapach, ' +
    'a do tego czasu stary ekran zostaje poniżej bez zmian.</span>' +
    '<a href="zawodnik.html?dzis=stary" style="font-size:13px;color:var(--accent,#ff6b1a);text-decoration:none;min-height:44px;display:inline-flex;align-items:center">Pokaż tylko stary ekran ›</a></div>';
  function start() {
    var k = korzen();
    if (!k) return;
    if (k.getAttribute("data-etap") !== ETAP) { k.innerHTML = BANER; k.setAttribute("data-etap", ETAP); }
    if (!owiniete && typeof w.showSection === "function") {
      var oryg = w.showSection;
      w.showSection = function () { var r = oryg.apply(this, arguments); try { pokaz(); } catch (e) {} return r; };
      owiniete = true;
    }
    pokaz();
  }
  function stop() { var k = korzen(); if (k) k.hidden = true; }
  w.BM_DZIS = { etap: ETAP, start: start, stop: stop };
})(window, document);
