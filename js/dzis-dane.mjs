// DZIŚ NAJPIERW DANE (E2 szkielet, 11.11.2026): dwie karty nad resztą Dziś — kompaktowy PLAN na dziś i WYKONANIE
// (cztery liczby + miejsce na miniaturę trasy z js/trasa-svg.mjs). Stany: brak planu, dzień wolny, plan + wykonanie,
// wykonanie bez planu, bieżnia i wpis ręczny/OCR bez trasy (bez udawania: zamiast miniatury ikona i napis).
// Czyste funkcje → HTML (tekst zawsze przez esc; adresy nie wchodzą tu wcale), bez zapytań, bez zapisu, bez dotykania
// zamrożonego zawodnik.html: wpięcie dopiero po odmrożeniu (E7). Plik BEZ import/export (globalThis.BM_DZIS_DANE).
(function (g) {
  "use strict";
  function esc(s) { return g.escapeHtml ? g.escapeHtml(String(s == null ? "" : s)) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function liczba(n, m) { n = Number(n); if (!isFinite(n)) return "—"; var t = n.toFixed(m || 0).split("."), ul = (t[1] || "").replace(/0+$/, ""); return t[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (ul ? "," + ul : ""); }
  function km(x) { var n = Number(x); return isFinite(n) && n > 0 ? liczba(n, n < 10 ? 2 : 1) : "—"; }
  /** Czas: sekundy albo "h:mm:ss"/"mm:ss" → "1:02:15" / "48:10". */
  function czas(d) {
    var s = typeof d === "number" ? d : /^\d{1,2}:\d{2}(:\d{2})?$/.test(String(d || "")) ? String(d).split(":").reduce(function (a, b) { return a * 60 + Number(b); }, 0) : NaN;
    if (!isFinite(s) || s <= 0) return "—";
    s = Math.round(s); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sek = s % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (sek < 10 ? "0" : "") + sek;
  }
  /** Tempo: sekundy na km albo "m:ss" → "5:12". Zapis ręczny bywa "5:12/km". */
  function tempo(p) {
    var s = typeof p === "number" ? p : /^\d{1,2}:\d{2}/.test(String(p || "")) ? String(p).split("/")[0].split(":").reduce(function (a, b) { return a * 60 + Number(b); }, 0) : NaN;
    if (!isFinite(s) || s <= 0) return "—";
    s = Math.round(s); return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }
  var WOLNE = ["Odpoczynek", "Wolne", "Dzień wolny", "Rest"];
  var BEZ_TRASY_TYPY = ["VirtualRun", "VirtualRide", "Bieżnia"];
  /** Skąd wpis i czy może mieć trasę: tylko zegarek z `icu_stream_types` zawierającym latlng i typem poza bieżnią. */
  function zrodloWpisu(log) {
    if (!log) return "brak";
    var typy = Array.isArray(log.icu_stream_types) ? log.icu_stream_types : String(log.icu_stream_types || "").split(",").map(function (s) { return s.trim(); });
    var zegarek = log.source === "intervals" || log.source === "strava" || log.source === "garmin";
    if (log.icu_trainer === true || BEZ_TRASY_TYPY.indexOf(String(log.icu_type || log.external_type || "")) >= 0) return "bieznia";
    if (zegarek && typy.indexOf("latlng") >= 0) return "zegarek-trasa";
    if (zegarek) return "zegarek";
    if (log.source === "ocr" || log.attachment_url) return "ocr";
    return "reczny";
  }
  /** Stan Dziś z planu i wpisu. */
  function stan(plan, log) {
    var jestPlan = !!(plan && (plan.type || plan.distance_km || plan.description));
    var wolne = jestPlan && WOLNE.indexOf(String(plan.type || "").trim()) >= 0;
    if (log && jestPlan && !wolne) return "plan-wykonanie";
    if (log) return "wykonanie-bez-planu";
    if (wolne) return "wolne";
    return jestPlan ? "plan" : "brak-planu";
  }
  /** Cztery liczby wykonania: dystans, czas, tempo i czwarta = tętno śr., a gdy go nie ma: przewyższenie, a gdy i tego nie ma: odczucie. */
  function liczbyWykonania(log) {
    var l = log || {}, czwarta;
    if (Number(l.heart_rate) > 0) czwarta = { w: liczba(l.heart_rate), j: "bpm", p: "tętno" };
    else if (Number(l.elevation) > 0 || Number(l.elevation_gain) > 0) czwarta = { w: liczba(l.elevation || l.elevation_gain), j: "m", p: "w górę" };
    else czwarta = { w: l.feel ? String(l.feel) : "—", j: "", p: "odczucie", slowo: !!l.feel };
    return [
      { w: km(l.distance_km), j: "km", p: "dystans" },
      { w: czas(l.duration_s != null ? l.duration_s : l.duration), j: "", p: "czas" },
      { w: tempo(l.pace_s != null ? l.pace_s : l.pace), j: "/km", p: "tempo" },
      czwarta
    ];
  }
  function liczbaHtml(x) { return '<div class="dd-liczba"><b' + (x.slowo ? ' class="dd-slowo"' : "") + '>' + esc(x.w) + (x.j ? '<small>' + esc(x.j) + '</small>' : "") + '</b><span>' + esc(x.p) + '</span></div>'; }
  /** Miejsce na miniaturę: SVG z trasy (opcje.miniatura = gotowy SVG z BM_TRASA), bieżnia = ikona, reszta = „bez trasy”. */
  function miniaturaHtml(log, o) {
    var z = zrodloWpisu(log);
    if (z === "zegarek-trasa" && o && o.miniatura) return '<div class="dd-mini dd-mini--trasa" aria-hidden="true">' + o.miniatura + '</div>';
    if (z === "zegarek-trasa") return '<div class="dd-mini dd-mini--czeka"><span>trasa…</span></div>';
    if (z === "bieznia") return '<div class="dd-mini dd-mini--bieznia" title="Bieżnia"><svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"><rect x="4" y="30" width="40" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M8 30 L8 18 M40 30 L40 14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="24" cy="12" r="3.5" fill="currentColor"/><path d="M20 30 L24 20 L29 24 L27 30" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span>bieżnia</span></div>';
    return '<div class="dd-mini dd-mini--brak"><span>bez trasy</span></div>';   // źródło (ze zdjęcia / wpis ręczny) jest już w nagłówku karty
  }
  function pigulkaTypu(typ) {
    var t = String(typ || "Trening"); return g.renderTypePill ? g.renderTypePill(t) : '<span class="dd-typ">' + esc(t) + '</span>';
  }
  /** KARTA PLANU (kompaktowa): typ, dystans/czas celu, tempo celu, jedno zdanie opisu. opcje: { ktoUlozyl: 'trener'|'generator'|null } */
  function kartaPlanuHtml(plan, o) {
    o = o || {}; var s = stan(plan, null);
    if (s === "brak-planu") return '<section class="dd-karta dd-plan dd-plan--brak" data-stan="brak-planu"><div class="dd-naglowek"><span class="dd-etykieta">Plan na dziś</span></div><p class="dd-tekst">Dziś bez planu. Każdy kilometr i tak się liczy.</p>' + (o.bezTrenera ? '<a class="dd-link" href="#plan" data-dzis-plan>Ułóż plan ›</a>' : "") + '</section>';
    if (s === "wolne") return '<section class="dd-karta dd-plan dd-plan--wolne" data-stan="wolne"><div class="dd-naglowek"><span class="dd-etykieta">Plan na dziś</span><span class="dd-kto">' + esc(o.ktoUlozyl === "generator" ? "z generatora" : o.ktoUlozyl === "trener" ? "od trenera" : "") + '</span></div><p class="dd-tekst"><b>Dzień wolny.</b> ' + esc(plan.description || "Regeneracja też jest treningiem.") + '</p></section>';
    var cel = [];
    if (Number(plan.distance_km) > 0) cel.push(km(plan.distance_km) + " km");
    if (plan.duration_min > 0) cel.push(liczba(plan.duration_min) + " min");
    if (plan.pace || plan.target_pace) cel.push(tempo(plan.pace || plan.target_pace) + " /km");
    return '<section class="dd-karta dd-plan" data-stan="plan"><div class="dd-naglowek"><span class="dd-etykieta">Plan na dziś</span><span class="dd-kto">' + esc(o.ktoUlozyl === "generator" ? "z generatora" : o.ktoUlozyl === "trener" ? "od trenera" : "") + '</span></div>'
      + '<div class="dd-plan-wiersz">' + pigulkaTypu(plan.type) + (cel.length ? '<span class="dd-cel">' + esc(cel.join(" · ")) + '</span>' : "") + '</div>'
      + (plan.description ? '<p class="dd-tekst">' + esc(String(plan.description).length > 140 ? String(plan.description).slice(0, 137) + "…" : plan.description) + '</p>' : "") + '</section>';
  }
  /** KARTA WYKONANIA: miniatura + cztery liczby + zdanie o planie (zrobione / inaczej niż plan / bez planu). opcje: { miniatura: svg } */
  function kartaWykonaniaHtml(log, plan, o) {
    if (!log) return "";
    var s = stan(plan, log), l = liczbyWykonania(log), z = zrodloWpisu(log);
    var zdanie = s === "plan-wykonanie" ? (Number(plan.distance_km) > 0 && Number(log.distance_km) > 0 ? (Math.abs(log.distance_km - plan.distance_km) / plan.distance_km <= 0.15 ? "Plan zrobiony." : log.distance_km > plan.distance_km ? "Więcej niż w planie." : "Krócej niż w planie.") : "Zrobione.") : "Bez planu, ale zrobione.";
    var zrodlo = { "zegarek-trasa": "z zegarka", zegarek: "z zegarka", bieznia: "bieżnia", ocr: "ze zdjęcia", reczny: "wpis ręczny" }[z] || "";
    return '<section class="dd-karta dd-wykonanie" data-stan="' + s + '" data-zrodlo="' + z + '"><div class="dd-naglowek"><span class="dd-etykieta">Dziś zrobione</span><span class="dd-kto">' + esc(zrodlo) + '</span></div>'
      + '<div class="dd-wykonanie-wiersz">' + miniaturaHtml(log, o) + '<div class="dd-liczby">' + l.map(liczbaHtml).join("") + '</div></div>'
      + '<p class="dd-tekst dd-tekst--plan">' + pigulkaTypu(log.training_type) + ' <span>' + esc(zdanie) + '</span>' + (log.comment ? ' <i class="dd-komentarz">' + esc(String(log.comment).length > 90 ? String(log.comment).slice(0, 87) + "…" : log.comment) + '</i>' : "") + '</p></section>';
  }
  /** Obie karty w jednym kontenerze (kolejność: wykonanie nad planem, gdy już jest). */
  function dzisHtml(plan, log, o) {
    var s = stan(plan, log);
    return '<div class="dd" data-stan="' + s + '">' + (log ? kartaWykonaniaHtml(log, plan, o) : "") + (s === "wykonanie-bez-planu" ? "" : kartaPlanuHtml(plan, o)) + '</div>';
  }
  /* Styl: tokeny motywu zawodnik.html (--card, --border, --fg, --fg2, --accent); 360 px: liczby 2×2, miniatura 96 px; od 400 px: miniatura obok czterech liczb w rzędzie. */
  var CSS = ".dd{display:flex;flex-direction:column;gap:8px;margin:8px 16px 6px}" +
    ".dd-karta{background:var(--card,#15151a);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:16px;padding:12px 14px;color:var(--fg,#f0ede8)}" +
    ".dd-naglowek{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px}" +
    ".dd-etykieta{font:600 10px/1 'DM Mono',monospace;letter-spacing:.15em;text-transform:uppercase;color:var(--accent,#ff6a1f)}" +
    ".dd-kto{font:500 10px/1 'DM Mono',monospace;letter-spacing:.08em;color:var(--fg2,rgba(240,237,232,.6))}" +
    ".dd-plan-wiersz{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.dd-cel{font:600 14px/1.3 Inter,sans-serif}" +
    ".dd-typ{display:inline-block;padding:4px 10px;border-radius:999px;border:1px solid var(--border,rgba(255,255,255,.14));font:600 11px/1 Inter,sans-serif;letter-spacing:.04em}" +
    ".dd-tekst{margin:8px 0 0;font:400 13px/1.5 Inter,sans-serif;color:var(--fg2,rgba(240,237,232,.75))}.dd-tekst b{color:var(--fg,#f0ede8)}.dd-tekst--plan span{color:var(--fg,#f0ede8)}.dd-komentarz{display:block;margin-top:2px;font-style:normal;color:var(--fg2,rgba(240,237,232,.6))}" +
    ".dd-link{display:inline-block;margin-top:8px;color:var(--accent,#ff6a1f);font:600 13px/1 Inter,sans-serif;text-decoration:none;padding:8px 0}" +
    ".dd-wykonanie-wiersz{display:flex;gap:12px;align-items:center}" +
    ".dd-mini{flex:0 0 96px;width:96px;height:96px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--border,rgba(255,255,255,.08));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--fg2,rgba(240,237,232,.6));font:500 10px/1.2 'DM Mono',monospace;letter-spacing:.06em;text-align:center;overflow:hidden}" +
    ".dd-mini svg{display:block}.dd-mini--trasa{background:rgba(255,255,255,.03)}.dd-mini--bieznia svg{color:var(--fg2,rgba(240,237,232,.6))}" +
    ".dd-liczby{flex:1;min-width:0;display:grid;grid-template-columns:1fr 1fr;gap:8px 10px}" +
    ".dd-liczba b{display:block;font:400 22px/1 'Bebas Neue',Impact,sans-serif;letter-spacing:.02em;color:var(--fg,#f0ede8)}.dd-liczba b small{font:600 10px/1 'DM Mono',monospace;margin-left:3px;color:var(--fg2,rgba(240,237,232,.6));letter-spacing:.04em}" +
    ".dd-liczba b.dd-slowo{font:600 15px/1.4 Inter,sans-serif;letter-spacing:0;text-transform:none}.dd-liczba span{display:block;margin-top:3px;font:500 9px/1 'DM Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--fg2,rgba(240,237,232,.55))}" +
    "@media(min-width:400px){.dd-liczby{grid-template-columns:repeat(4,1fr)}.dd-liczba b{font-size:24px}}";
  g.BM_DZIS_DANE = { esc: esc, liczba: liczba, km: km, czas: czas, tempo: tempo, zrodloWpisu: zrodloWpisu, stan: stan, liczbyWykonania: liczbyWykonania, miniaturaHtml: miniaturaHtml, kartaPlanuHtml: kartaPlanuHtml, kartaWykonaniaHtml: kartaWykonaniaHtml, dzisHtml: dzisHtml, CSS: CSS, WOLNE: WOLNE };
})(typeof globalThis !== "undefined" ? globalThis : this);
