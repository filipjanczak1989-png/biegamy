// WYSZUKIWANIE PRZEPISÓW + dopasowanie tytułów katalogu (M3c, 1.11.2026) — JEDNO źródło dla Jedzenia (pole „Szukaj
// przepisu" nad biblioteką, nutrition.html) i EF okienko (katalog). Ten sam plik, ta sama funkcja: „ciasto" w okienku
// i w Jedzeniu daje ten sam zbiór (blizna-76). Plik BEZ import/export — działa jako <script src> i jako moduł
// (`import "…/js/przepisy-szukaj.mjs"` → globalThis.BM_SZUKAJ).
//
// Dopasowanie: słowa bez polskich znaków; słowo zapytania (≥ 3 znaki, bez „przepis", „na", „z"…) → RDZEŃ (dłuższe niż
// 4 znaki tracą 3 ostatnie: „ciasto" i „ciasta" → „cias", „omletu" → „omle"); rdzeń trafia, gdy jest
// POCZĄTKIEM któregoś słowa. Przepis pasuje, gdy KAŻDY rdzeń trafia w tytuł, składniki albo tagi.
(function (g) {
  "use strict";
  // normalizacja i rdzeń: js/tekst.mjs (BM_TEKST) — wołane w chwili użycia, plik ładuje się przed tym
  function bezZnakow(s) { return g.BM_TEKST.bezZnakow(s); }
  function slowa(s) { return bezZnakow(s).split(/[^a-z0-9]+/).filter(Boolean); }
  function rdzen(w) { return g.BM_TEKST.rdzen(w); }
  var POMIN = { przepis: 1, przepisy: 1, przepisu: 1, przepisow: 1, na: 1, z: 1, ze: 1, i: 1, w: 1, do: 1, dla: 1, bez: 1, jak: 1, cos: 1 };
  /** Rdzenie zapytania (unikalne). Dodatkowe słowa do pominięcia (np. katalog: „zagraj", „utwór") w `dodatkowePomin`. */
  function rdzenieZapytania(q, dodatkowePomin) {
    var p = dodatkowePomin || {}, wynik = [];
    slowa(q).forEach(function (w) {
      if ((w.length < 3 && !/^\d+$/.test(w)) || POMIN[w] || p[w]) return;   // cyfra = słowo („4-7-8"), M3-1 (2)
      var r = rdzen(w);
      if (wynik.indexOf(r) < 0) wynik.push(r);
    });
    return wynik;
  }
  function trafia(r, slowaTekstu) { for (var i = 0; i < slowaTekstu.length; i++) if (slowaTekstu[i].indexOf(r) === 0) return true; return false; }
  /** Odsetek rdzeni trafionych w tytule (0–1). */
  function wynikTytulu(tytul, rdzenie) {
    if (!rdzenie.length) return 0;
    var st = slowa(tytul), n = 0;
    rdzenie.forEach(function (r) { if (trafia(r, st)) n++; });
    return n / rdzenie.length;
  }
  function tekstPrzepisu(p) {
    var skl = Array.isArray(p.ingredients) ? p.ingredients.map(function (x) { return x && typeof x === "object" ? x.item : x; }) : [];
    var tagi = Array.isArray(p.tags) ? p.tags : [];
    return slowa([p.title || ""].concat(skl, tagi).join(" "));
  }
  /** Przepisy pasujące do zapytania: [{p, wynik}] — wynik = odsetek trafień w tytule (do kolejności), przepis
      pasuje, gdy każdy rdzeń trafia w tytuł/składniki/tagi. Kolejność: wynik malejąco, potem tytuł. */
  function szukajPrzepisow(przepisy, q) {
    var rd = rdzenieZapytania(q);
    if (!rd.length) return [];
    var out = [];
    (przepisy || []).forEach(function (p) {
      if (!p) return;
      var t = tekstPrzepisu(p);
      if (rd.every(function (r) { return trafia(r, t); })) out.push({ p: p, wynik: wynikTytulu(p.title, rd) });
    });
    out.sort(function (a, b) { return (b.wynik - a.wynik) || String(a.p.title || "").localeCompare(String(b.p.title || ""), "pl"); });
    return out;
  }
  g.BM_SZUKAJ = { bezZnakow: bezZnakow, slowa: slowa, rdzen: rdzen, rdzenieZapytania: rdzenieZapytania, wynikTytulu: wynikTytulu, szukajPrzepisow: szukajPrzepisow };
})(globalThis);
