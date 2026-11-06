// Okienko potwierdzenia i krótkiej edycji w panelu trenera, zamiast window.confirm i window.prompt (zainstalowana PWA potrafi je zablokować albo pokazać pod klawiaturą).
// Plik BEZ import/export: window.BM_OKIENKO(opcje) → Promise: null po „Anuluj”, Esc albo dotknięciu tła; obiekt z wartościami pól po potwierdzeniu ({} bez pól).
// opcje: { tytul, tekst, tak, nie, grozne, pola: [{ klucz, etykieta, typ: "text" | "checkbox", wartosc, maks }], sprawdz(wartosci) → "" albo komunikat }. Tekst tylko przez textContent.
(function (g) {
  "use strict";
  var otwarte = null;
  function el(tag, styl, rodzic, tekst) { var e = g.document.createElement(tag); if (styl) e.style.cssText = styl; if (tekst != null) e.textContent = tekst; if (rodzic) rodzic.appendChild(e); return e; }
  var GUZIK = "flex:1 1 120px;font:inherit;font-size:15px;padding:12px;border-radius:12px;cursor:pointer;";
  function okienko(opcje) {
    var o = opcje || {};
    if (otwarte) otwarte(null);
    return new Promise(function (ok) {
      var d = g.document, poprzedni = d.activeElement, pola = {};
      var tlo = el("div", "position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;", d.body);
      tlo.id = "bm-okienko";
      var k = el("div", "width:100%;max-width:420px;max-height:100%;overflow-y:auto;background:var(--card,#1b1b24);color:var(--fg,#fff);border:1px solid var(--border,rgba(255,255,255,.18));border-radius:16px;padding:18px;box-sizing:border-box;", tlo);
      k.setAttribute("role", "dialog"); k.setAttribute("aria-modal", "true");
      var t = el("div", "font-size:18px;font-weight:800;line-height:1.3;margin-bottom:8px;overflow-wrap:anywhere;", k, o.tytul || "Na pewno?");
      t.id = "bm-okienko-tytul"; k.setAttribute("aria-labelledby", t.id);
      if (o.tekst) el("p", "font-size:14px;line-height:1.45;margin:0 0 6px;overflow-wrap:anywhere;", k, o.tekst);
      (o.pola || []).forEach(function (p) {
        if (p.typ === "checkbox") {
          var l = el("label", "display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.4;margin:12px 0;", k), c = el("input", "width:20px;height:20px;flex:none;margin:0;", l);
          c.type = "checkbox"; c.checked = !!p.wartosc; el("span", "", l, p.etykieta); pola[p.klucz] = c; return;
        }
        var l2 = el("label", "display:block;font-size:13px;font-weight:700;margin:12px 0;", k, p.etykieta);
        var i = el("input", "display:block;box-sizing:border-box;width:100%;margin-top:4px;padding:10px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.25));background:transparent;color:inherit;font:inherit;font-size:16px;font-weight:400;", l2);
        i.type = "text"; i.autocomplete = "off"; i.value = p.wartosc == null ? "" : String(p.wartosc); if (p.maks) i.maxLength = p.maks;
        pola[p.klucz] = i;
      });
      var blad = el("div", "font-size:13px;line-height:1.4;color:var(--red,#ff6b6b);", k); blad.setAttribute("role", "alert");
      var rz = el("div", "display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;", k);
      var nie = el("button", GUZIK + "font-weight:700;background:none;color:inherit;border:1px solid var(--border,rgba(255,255,255,.25));", rz, o.nie || "Anuluj"); nie.type = "button";
      var tak = el("button", GUZIK + "font-weight:800;border:0;" + (o.grozne ? "background:var(--red,#e5484d);color:#fff;" : "background:var(--accent,#ff8a3c);color:#111;"), rz, o.tak || "OK"); tak.type = "button";
      function wartosci() { var w = {}; Object.keys(pola).forEach(function (kl) { var p = pola[kl]; w[kl] = p.type === "checkbox" ? p.checked : p.value.trim(); }); return w; }
      function zamknij(wynik) {
        if (otwarte !== zamknij) return;
        otwarte = null;
        d.removeEventListener("keydown", klawisz, true);
        if (tlo.parentNode) tlo.parentNode.removeChild(tlo);
        try { if (poprzedni && poprzedni.focus) poprzedni.focus(); } catch (e) {}
        ok(wynik);
      }
      function potwierdz() { var w = wartosci(), b = o.sprawdz ? o.sprawdz(w) : ""; if (b) { blad.textContent = b; return; } zamknij(w); }
      function klawisz(e) {
        if (e.key === "Escape") { e.preventDefault(); zamknij(null); }
        else if (e.key === "Enter" && e.target && e.target.tagName === "INPUT" && e.target.type === "text") { e.preventDefault(); potwierdz(); }
      }
      otwarte = zamknij;
      nie.addEventListener("click", function () { zamknij(null); });
      tak.addEventListener("click", potwierdz);
      tlo.addEventListener("click", function (e) { if (e.target === tlo) zamknij(null); });
      d.addEventListener("keydown", klawisz, true);
      (k.querySelector("input[type=text]") || nie).focus();
    });
  }
  g.BM_OKIENKO = okienko;
})(globalThis);
