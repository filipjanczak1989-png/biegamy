// TRASA SVG (E1a, 11.11.2026): kształt biegu z listy [lat, lon] jako <polyline> w SVG, bez kafli, bez biblioteki, bez sieci.
// Rzut równokątny (x = lon · cos(szerokości średniej), y = −lat), dopasowanie do pudełka z marginesem 8 %, miniatura 96×96 na Dziś
// i pełny widok w karcie treningu. Kropki startu i mety rysujemy TYLKO na prośbę (właściciel widzi pełną trasę; dla cudzej,
// przyciętej trasy w E6 kropek nie ma — decyzja Filipa 10.11). Plik BEZ import/export (globalThis.BM_TRASA), jak js/miasto.mjs:
// ładowany skryptem, importowalny w testach przez vm. Nic nie zapisuje, nic nie wysyła; punkty żyją tylko w pamięci strony.
(function (g) {
  "use strict";
  var R_ZIEMI_M = 6371000;
  /** Para [lat, lon] jest punktem tylko w zakresie współrzędnych; wszystko inne (null, NaN, teksty, [0,0] z zegarka bez fixu) odpada. */
  function poprawny(p) {
    if (!Array.isArray(p) || p.length < 2) return false;
    var lat = Number(p[0]), lon = Number(p[1]);
    return isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
  }
  function oczysc(punkty) { return Array.isArray(punkty) ? punkty.filter(poprawny).map(function (p) { return [Number(p[0]), Number(p[1])]; }) : []; }
  /** Odległość po kuli (haversine), metry. */
  function odlegloscM(a, b) {
    var r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_ZIEMI_M * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function dlugoscM(punkty) { var p = oczysc(punkty), s = 0; for (var i = 1; i < p.length; i++) s += odlegloscM(p[i - 1], p[i]); return s; }
  /** Rzadsze punkty: zostaw co najwyżej `maks` (pierwszy i ostatni zawsze), równomiernie po indeksie. Miniaturze wystarczy ~100. */
  function przerzedz(punkty, maks) {
    var p = oczysc(punkty); maks = Math.max(2, Math.floor(Number(maks) || 100));
    if (p.length <= maks) return p;
    var out = [], krok = (p.length - 1) / (maks - 1);
    for (var i = 0; i < maks; i++) out.push(p[Math.round(i * krok)]);
    return out;
  }
  /** Rzut równokątny: x rośnie na wschód, y rośnie na południe (jak w SVG). Skala cos(lat średniej) trzyma proporcje kształtu. */
  function rzutuj(punkty) {
    var p = oczysc(punkty); if (!p.length) return [];
    var suma = 0; p.forEach(function (q) { suma += q[0]; });
    var k = Math.cos(suma / p.length * Math.PI / 180);
    return p.map(function (q) { return { x: q[1] * k, y: -q[0] }; });
  }
  /** Dopasowanie do pudełka w×h z marginesem (ułamek krótszego boku), proporcje zachowane, kształt wyśrodkowany.
   *  Zwraca { punkty: [{x,y}], skala, szerokosc, wysokosc } albo null, gdy nie ma czego rysować. Jeden punkt (albo zerowy rozrzut) → środek pudełka. */
  function dopasuj(xy, w, h, margines) {
    if (!Array.isArray(xy) || !xy.length) return null;
    w = Number(w) || 96; h = Number(h) || w; margines = margines == null ? 0.08 : Math.max(0, Math.min(0.45, Number(margines) || 0));
    var m = Math.min(w, h) * margines, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    xy.forEach(function (q) { if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x; if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y; });
    var dx = maxX - minX, dy = maxY - minY, skala = (dx > 0 || dy > 0) ? Math.min((w - 2 * m) / (dx || 1e-12), (h - 2 * m) / (dy || 1e-12)) : 0;
    if (!isFinite(skala)) skala = 0;
    var ox = (w - dx * skala) / 2 - minX * skala, oy = (h - dy * skala) / 2 - minY * skala;
    return { punkty: xy.map(function (q) { return { x: q.x * skala + ox, y: q.y * skala + oy }; }), skala: skala, szerokosc: w, wysokosc: h, pusty: skala === 0 };
  }
  function punktyPolyline(dop) { return dop.punkty.map(function (q) { return q.x.toFixed(1) + "," + q.y.toFixed(1); }).join(" "); }
  /* kolor tylko z białej listy (szesnastkowy albo zmienna motywu): to jedyne miejsce, gdzie do SVG wchodzi tekst spoza liczb */
  function kolorOk(k) { return typeof k === "string" && /^(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\)|currentColor)$/.test(k) ? k : "var(--accent)"; }
  /**
   * SVG z trasą. opcje: { w, h, margines, kolor, grubosc, kropki (start+meta), maks (punktów), klasa, tytul }.
   * Zwraca "" gdy mniej niż 2 punkty (żadnej „przykładowej” pętli: brak trasy = brak rysunku).
   */
  function svg(punkty, o) {
    o = o || {};
    var w = Number(o.w) || 96, h = Number(o.h) || w, p = przerzedz(punkty, o.maks || (w <= 120 ? 120 : 400));
    if (p.length < 2) return "";
    var dop = dopasuj(rzutuj(p), w, h, o.margines); if (!dop) return "";
    var kolor = kolorOk(o.kolor), gr = Math.max(1, Math.min(6, Number(o.grubosc) || (w <= 120 ? 2 : 3)));
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '"' + (o.klasa && /^[\w -]+$/.test(o.klasa) ? ' class="' + o.klasa + '"' : "") + ' role="img" aria-label="' + (o.tytul && /^[\w .,:–\-ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+$/.test(o.tytul) ? o.tytul : "Kształt trasy") + '">';
    if (dop.pusty) {   // jeden punkt / zerowy rozrzut: kropka na środku, bez udawania kształtu
      s += '<circle cx="' + (w / 2) + '" cy="' + (h / 2) + '" r="' + (gr + 1) + '" fill="' + kolor + '"/>';
    } else {
      s += '<polyline points="' + punktyPolyline(dop) + '" fill="none" stroke="' + kolor + '" stroke-width="' + gr + '" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
      if (o.kropki) {
        var a = dop.punkty[0], z = dop.punkty[dop.punkty.length - 1];
        s += '<circle cx="' + a.x.toFixed(1) + '" cy="' + a.y.toFixed(1) + '" r="' + (gr + 1.5) + '" fill="#4ade80" stroke="#07070a" stroke-width="1"/>';
        s += '<circle cx="' + z.x.toFixed(1) + '" cy="' + z.y.toFixed(1) + '" r="' + (gr + 1.5) + '" fill="' + kolor + '" stroke="#07070a" stroke-width="1"/>';
      }
    }
    return s + "</svg>";
  }
  function miniatura(punkty, o) { return svg(punkty, Object.assign({ w: 96, h: 96, maks: 120, grubosc: 2 }, o || {})); }
  function pelny(punkty, o) { return svg(punkty, Object.assign({ w: 320, h: 200, maks: 400, grubosc: 3, kropki: true }, o || {})); }
  g.BM_TRASA = { poprawny: poprawny, oczysc: oczysc, odlegloscM: odlegloscM, dlugoscM: dlugoscM, przerzedz: przerzedz, rzutuj: rzutuj, dopasuj: dopasuj, punktyPolyline: punktyPolyline, kolorOk: kolorOk, svg: svg, miniatura: miniatura, pelny: pelny };
})(typeof globalThis !== "undefined" ? globalThis : this);
