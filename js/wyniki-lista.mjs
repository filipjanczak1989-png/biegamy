// WYNIKI „JAK MANAGER" — etap 1 (2.11.2026, docs/projekt-wyniki-jak-manager-2026-11-02.md §2): router po hashu, pamięć w dokumencie,
// rekordy na dystansach, trend formy, porównanie dwóch zawodników. Plik BEZ import/export (globalThis.BM_WYNIKI), jak js/akcja.mjs:
// <script src> w wyniki.html po js/tekst.mjs i js/kalendarz-lista.mjs (kluczNazwy do wspólnych startów), import w testach (blizna-110).
// Zasady: dane osób NIGDY w sessionStorage/localStorage (pamięć tylko w dokumencie, TTL 10 min jak f6.mjs); klucze F6 w hashu przez
// encodeURIComponent i walidację wzorcem przy odczycie; liczby trendu z wyników zawodów, bez prognoz (zasada okienka, blizna-78).
(function (g) {
  "use strict";
  var T = g.BM_TEKST, K = g.BM_KALENDARZ;
  /* Klucz F6: „<źródło>:<id>" (datasport:368751) ALBO „k:<imię nazwisko>|<rocznik>" (wiersze bez id ze źródła — decyzja Filipa 2.11:
     dopuszczone w URL, wyniki są publiczne). Szerszy niż RE_KLUCZ zapisu w okienku (tam do 9.11 bez k:). */
  var RE_KLUCZ = /^(?:[a-z0-9_-]{2,30}:[A-Za-z0-9._-]{1,80}|k:[\p{L}][\p{L} .'-]{0,59}\|\d{4})$/u;
  function kluczOk(k) { return typeof k === "string" && RE_KLUCZ.test(k) && !/^(javascript|data|vbscript|file|blob):/i.test(k); }   // obrona w głąb: schematy URL nie są źródłami wyników

  /* ROUTER: #/ | #/zawodnik/<klucz> | #/porownaj/<a>/<b> | #/impreza/<klucz>/<rok> (etap 3 — dziś tylko rozpoznanie) */
  function parsuj(hash) {
    var h = String(hash || "").replace(/^#/, "");
    if (!h || h === "/") return { ekran: "szukaj" };
    var cz = h.split("/").slice(1).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return null; } });
    if (cz[0] === "zawodnik" && kluczOk(cz[1])) return { ekran: "zawodnik", klucz: cz[1] };
    if (cz[0] === "porownaj" && kluczOk(cz[1]) && kluczOk(cz[2]) && cz[1] !== cz[2]) return { ekran: "porownaj", a: cz[1], b: cz[2] };
    if (cz[0] === "impreza" && cz[1] && /^[A-Za-z0-9:._|-]{1,120}$/.test(cz[1])) return { ekran: "impreza", klucz: cz[1], rok: /^\d{4}$/.test(cz[2] || "") ? Number(cz[2]) : null };
    return { ekran: "szukaj", zly: true };
  }
  function hashDla(s) {
    if (!s || s.ekran === "szukaj") return "#/";
    if (s.ekran === "zawodnik") return "#/zawodnik/" + encodeURIComponent(s.klucz);
    if (s.ekran === "porownaj") return "#/porownaj/" + encodeURIComponent(s.a) + "/" + encodeURIComponent(s.b);
    if (s.ekran === "impreza") return "#/impreza/" + encodeURIComponent(s.klucz) + (s.rok ? "/" + s.rok : "");
    return "#/";
  }

  /* PAMIĘĆ w dokumencie: klucz = RPC + argumenty, TTL 10 min, ≤ 200 wpisów (najstarszy wypada). Powrót „wstecz" = zero RPC. */
  var TTL_MS = 10 * 60 * 1000, MAX_WPISOW = 200;
  function pamiec() {
    var m = new Map();
    return {
      klucz: function (rpc, args) { return rpc + " " + JSON.stringify(args || {}); },
      czytaj: function (k, teraz) { var w = m.get(k); if (!w) return null; if ((teraz || Date.now()) - w.t > TTL_MS) { m.delete(k); return null; } return w.d; },
      zapisz: function (k, d, teraz) { if (m.size >= MAX_WPISOW) m.delete(m.keys().next().value); m.set(k, { t: teraz || Date.now(), d: d }); },
      rozmiar: function () { return m.size; },
      wyczysc: function () { m.clear(); },
    };
  }

  /* WYŁĄCZNIK po 429: do `do` nie prefetchujemy (zwykłe wywołania na żądanie człowieka idą dalej — on widzi komunikat). */
  function wylacznik() {
    var doKiedy = 0;
    return { zglos429: function (retryAfterS, teraz) { doKiedy = (teraz || Date.now()) + Math.max(10, Number(retryAfterS) || 60) * 1000; },
      wolno: function (teraz) { return (teraz || Date.now()) >= doKiedy; }, doKiedy: function () { return doKiedy; } };
  }

  /* NORMALIZACJA wiersza runner_results → {bieg, data, miasto, km, czas, miejsce, miejsceKat, kat, url, prywatny, klucz_imprezy?} */
  function wiersz(r) {
    return { bieg: String(r.event_name || ""), data: r.event_date || null, miasto: r.event_city || null, km: Number(r.distance_km) || null,
      czas: Number(r.time_seconds) || null, miejsce: r.position_total || null, miejsceKat: r.position_category || null, kat: r.category || null,
      url: r.result_url || null, prywatny: r.scope === "private", klucz_imprezy: r.event_key || null, edycja: r.edition_id || null };
  }

  /* REKORDY na dystansach klasycznych ±3 % (ta sama reguła co rekordyZWynikow w EF okienko moje.mjs) + „inne dystanse" (najlepszy na każdym). */
  var DYSTANSE_PB = [["5 km", 5], ["10 km", 10], ["półmaraton", 21.0975], ["maraton", 42.195]];
  function fmt(s) { s = Math.round(s); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(x).padStart(2, "0"); }
  function tempo(s, km) { if (!s || !km) return ""; var spk = Math.round(s / km); return Math.floor(spk / 60) + ":" + String(spk % 60).padStart(2, "0") + "/km"; }
  function klasyczny(km) { for (var i = 0; i < DYSTANSE_PB.length; i++) if (km != null && Math.abs(km - DYSTANSE_PB[i][1]) <= DYSTANSE_PB[i][1] * 0.03) return DYSTANSE_PB[i]; return null; }
  function rekordy(wiersze) {
    var w = (wiersze || []).filter(function (r) { return r.czas > 0 && r.km > 0; });
    var klas = DYSTANSE_PB.map(function (d) {
      var na = w.filter(function (r) { return Math.abs(r.km - d[1]) <= d[1] * 0.03; });
      if (!na.length) return null;
      var best = na.reduce(function (a, b) { return b.czas < a.czas ? b : a; });
      return { dystans: d[0], km: d[1], czas: fmt(best.czas), czas_s: best.czas, rok: best.data ? Number(String(best.data).slice(0, 4)) || null : null, bieg: best.bieg, data: best.data };
    }).filter(Boolean);
    var inne = {};
    w.forEach(function (r) { if (klasyczny(r.km)) return; var k = String(Math.round(r.km * 10) / 10); if (!inne[k] || r.czas < inne[k].czas) inne[k] = r; });
    return { klasyczne: klas, inne: Object.keys(inne).sort(function (a, b) { return Number(a) - Number(b); }).map(function (k) { var r = inne[k]; return { km: Number(k), czas: fmt(r.czas), czas_s: r.czas, bieg: r.bieg, data: r.data }; }) };
  }

  /* TREND FORMY: każdy start na dystansie klasycznym → ekwiwalent 10 km przez Riegela (stała z js/riegel.js — ta sama co generator/zawodnik;
     bez prognoz, bez ocen słownych). ≥ 3 punkty, inaczej null. Punkt: {data, km, czas, ekw10} rosnąco po dacie. */
  var RIEGEL = g.BM_RIEGEL.WYKLADNIK;   // jedno źródło: js/riegel.js, ładowany przed tym plikiem (blizna-123)
  function ekwiwalent10(czas, km) { return czas * Math.pow(10 / km, RIEGEL); }
  function trend(wiersze) {
    var p = (wiersze || []).filter(function (r) { return r.czas > 0 && r.km > 0 && r.data && klasyczny(r.km); })
      .map(function (r) { return { data: r.data, km: r.km, czas: r.czas, ekw10: Math.round(ekwiwalent10(r.czas, r.km)), bieg: r.bieg }; })
      .sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
    return p.length >= 3 ? p : null;
  }
  /** Prosty wykres SVG (bez biblioteki): oś czasu = data, oś pionowa = ekwiwalent 10 km (niżej = szybciej → rysujemy odwrotnie, lepszy wyżej). */
  function wykresSvg(punkty, szer, wys) {
    szer = szer || 320; wys = wys || 120;
    if (!punkty || punkty.length < 3) return "";
    var t0 = Date.parse(punkty[0].data), t1 = Date.parse(punkty[punkty.length - 1].data) || t0 + 1;
    var ys = punkty.map(function (p) { return p.ekw10; }), ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys), span = Math.max(60, ymax - ymin);
    var pad = 14, X = function (p) { return pad + (szer - 2 * pad) * ((Date.parse(p.data) - t0) / Math.max(1, t1 - t0)); }, Y = function (p) { return pad + (wys - 2 * pad) * ((p.ekw10 - ymin) / span); };
    var pts = punkty.map(function (p) { return X(p).toFixed(1) + "," + Y(p).toFixed(1); }).join(" ");
    var kolka = punkty.map(function (p) { return '<circle cx="' + X(p).toFixed(1) + '" cy="' + Y(p).toFixed(1) + '" r="3.5" fill="currentColor"><title>' + esc(p.data + " · " + p.km + " km · " + fmt(p.czas) + " (≈" + fmt(p.ekw10) + " na 10 km)") + "</title></circle>"; }).join("");
    return '<svg viewBox="0 0 ' + szer + " " + wys + '" width="100%" height="' + wys + '" role="img" aria-label="Trend formy z wyników zawodów" style="color:var(--accent);overflow:visible">' +
      '<polyline fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" points="' + pts + '"/>' + kolka +
      '<text x="' + pad + '" y="' + (wys - 2) + '" font-size="9" fill="var(--muted)">' + esc(String(punkty[0].data).slice(0, 7)) + "</text>" +
      '<text x="' + (szer - pad) + '" y="' + (wys - 2) + '" font-size="9" text-anchor="end" fill="var(--muted)">' + esc(String(punkty[punkty.length - 1].data).slice(0, 7)) + "</text></svg>";
  }

  /* PORÓWNANIE: wspólne starty = ta sama impreza (klucz nazwy z BM_KALENDARZ, bez edycji/roku) i data ±1 dzień i dystans ±3 %
     (edycja_id z F6, gdy będzie — etap 3, wtedy równość edycji wygrywa). */
  function dni(a, b) { return Math.abs(Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000)); }
  function wspolneStarty(wa, wb) {
    var out = [];
    (wa || []).forEach(function (a) {
      if (!a.czas || !a.km || !a.data) return;
      var kand = (wb || []).filter(function (b) {
        if (!b.czas || !b.km || !b.data) return false;
        if (a.edycja && b.edycja) return a.edycja === b.edycja;
        return dni(a.data, b.data) <= 1 && Math.abs(a.km - b.km) <= a.km * 0.03 && K.kluczNazwy(a.bieg) === K.kluczNazwy(b.bieg);
      });
      if (kand.length !== 1) return;   // dwa kandydaty → nie zgadujemy
      var b = kand[0], roz = b.czas - a.czas;
      out.push({ bieg: a.bieg, data: a.data, km: a.km, czasA: a.czas, czasB: b.czas, roznica_s: roz, roznica_pct: Math.round(Math.abs(roz) / Math.max(a.czas, b.czas) * 1000) / 10, szybszy: roz > 0 ? "a" : roz < 0 ? "b" : "remis" });
    });
    out.sort(function (x, y) { return x.data < y.data ? 1 : -1; });
    var bilans = { a: out.filter(function (x) { return x.szybszy === "a"; }).length, b: out.filter(function (x) { return x.szybszy === "b"; }).length, remis: out.filter(function (x) { return x.szybszy === "remis"; }).length };
    return { starty: out, bilans: bilans };
  }

  function esc(s) { return g.escapeHtml ? g.escapeHtml(String(s == null ? "" : s)) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }

  g.BM_WYNIKI = { RE_KLUCZ: RE_KLUCZ, kluczOk: kluczOk, parsuj: parsuj, hashDla: hashDla, pamiec: pamiec, wylacznik: wylacznik, TTL_MS: TTL_MS, MAX_WPISOW: MAX_WPISOW,
    wiersz: wiersz, rekordy: rekordy, trend: trend, wykresSvg: wykresSvg, wspolneStarty: wspolneStarty, klasyczny: klasyczny, fmt: fmt, tempo: tempo, RIEGEL: RIEGEL, DYSTANSE_PB: DYSTANSE_PB };
})(typeof globalThis !== "undefined" ? globalThis : this);
