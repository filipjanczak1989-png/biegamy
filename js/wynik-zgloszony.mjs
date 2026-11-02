// WYNIK ZGŁOSZONY — etap 2 (2.11.2026, docs/projekt-wyniki-jak-manager-2026-11-02.md §3): zawodnik (albo trener) wpisuje czas
// swojego startu; etykieta „zgłoszony", bez miejsca w klasyfikacji; oficjalne wyniki żyją w F6 i ten moduł ich NIE zastępuje
// (rekordy, odznaki, pb_* — nigdy z tej tabeli). JEDEN modal (wzorzec askBikeOrRun w sb.js) + JEDNA funkcja zapisu
// (window.BM_WYNIK_ZGLOSZONY.zapisz) — bez trzech kopii. Plik BEZ import/export (globalThis.BM_WYNIK_ZGLOSZONY): <script src> po sb.js
// w wyniki.html (i po 8.11 w zawodnik.html/kalendarz.html/profil.html), import w testach (blizna-111).
// Walidacja: twarde progi tempa (z rekordów świata — liczby z rozsądku, nie z pomiaru; w bazie CHECK 2:20–20:00/km), miękkie
// ostrzeżenia wymagają potwierdzenia. Odrzucenia w kliencie nie idą do client_errors (to nie błąd systemu).
(function (g) {
  "use strict";
  var KSZTALT = /^\d{1,2}(:\d{1,2}){0,2}$/;   // jak window._PB_KSZTALT (sb.js)
  var RE_KLUCZ_IMPREZY = /^(kalendarz|biegamy|wyniki|zgloszenie):[A-Za-z0-9:._-]{1,120}$/;
  var RE_RESULT_ID = /^[A-Za-z0-9:._-]{1,120}$/;

  /* progi tempa s/km per dystans (§3.3): twardy = odrzuć; miękki = „na pewno?" */
  function progi(km) {
    if (km < 3) return { twardyMin: 150, miekkiMin: 195, miekkiMax: 600 };
    if (km < 15) return { twardyMin: 150, miekkiMin: 200, miekkiMax: 600 };
    if (km < 30) return { twardyMin: 160, miekkiMin: 210, miekkiMax: 600 };
    if (km < 50) return { twardyMin: 170, miekkiMin: 220, miekkiMax: 600 };
    return { twardyMin: 210, miekkiMin: 270, miekkiMax: 900 };
  }
  function parsujCzas(txt, km) {
    var v = String(txt || "").trim();
    if (!v || !KSZTALT.test(v)) return null;
    var cz = v.split(":").map(Number);
    if (cz.length === 1) return null;   // samo „44" nie jest czasem
    if (cz.slice(1).some(function (n) { return n >= 60; })) return null;
    if (cz.length === 2 && km > 20) return cz[0] * 3600 + cz[1] * 60;   // dopełnienie h:mm na długich (jak dopelnijPB)
    return cz.length === 3 ? cz[0] * 3600 + cz[1] * 60 + cz[2] : cz[0] * 60 + cz[1];
  }
  function fmt(s) { s = Math.round(s); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(x).padStart(2, "0"); }
  function tempoTxt(sKm) { return Math.floor(sKm / 60) + ":" + String(Math.round(sKm % 60)).padStart(2, "0") + "/km"; }
  /** → {ok:false, blad} | {ok:true, czas_s, dystans_km, ostrzezenia:[…]} ; w = {nazwa, data, dystans_km, czas, pb_s?, dzis} */
  function waliduj(w) {
    var nazwa = String(w.nazwa || "").trim(), data = String(w.data || "").trim(), km = Number(String(w.dystans_km || "").replace(",", "."));
    var dzis = w.dzis || new Date().toISOString().slice(0, 10);
    if (nazwa.length < 3 || nazwa.length > 200) return { ok: false, blad: "Podaj nazwę biegu (3–200 znaków)." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, blad: "Podaj datę startu." };
    if (data > dzis) return { ok: false, blad: "Data startu nie może być z przyszłości." };
    if (data < "1990-01-01") return { ok: false, blad: "Data sprzed 1990 — sprawdź rok." };
    if (!(km >= 0.5 && km <= 400)) return { ok: false, blad: "Dystans od 0,5 do 400 km." };
    var s = parsujCzas(w.czas, km);
    if (s == null) return { ok: false, blad: "Czas zapisz jako " + (km > 20 ? "godziny:minuty:sekundy" : "minuty:sekundy") + ", np. „" + (km > 20 ? "1:45:00" : "45:30") + "”." };
    if (s < 60 || s > 360000) return { ok: false, blad: "Czas poza zakresem (1 min – 100 h)." };
    var sKm = s / km, p = progi(km), ost = [];
    if (sKm < p.twardyMin) return { ok: false, blad: "Tempo " + tempoTxt(sKm) + " to szybciej niż rekord świata na tym dystansie. Sprawdź minuty i godziny." };
    if (sKm < 140 || sKm > 1200) return { ok: false, blad: "Tempo " + tempoTxt(sKm) + " poza zakresem 2:20–20:00/km." };
    if (sKm < p.miekkiMin) ost.push("Tempo " + tempoTxt(sKm) + " — bardzo szybko. Na pewno?");
    if (sKm > p.miekkiMax) ost.push("Tempo " + tempoTxt(sKm) + " — wolniej niż " + tempoTxt(p.miekkiMax) + ". Jeśli tak było, zostaw.");
    if (w.pb_s && s < w.pb_s * 0.85) ost.push("To byłby nowy rekord o " + Math.round((1 - s / w.pb_s) * 100) + " % — na pewno?");
    if (Date.parse(dzis) - Date.parse(data) > 365 * 86400000) ost.push("Wynik sprzed ponad roku — na pewno z tej daty?");
    return { ok: true, czas_s: s, dystans_km: Math.round(km * 1000) / 1000, ostrzezenia: ost, nazwa: nazwa, data: data };
  }

  /* DOPASOWANIE z oficjalnym (§3.4): ±1 dzień, ±3 % dystansu, klucz imprezy gdy oba mają; dwa kandydaty → żaden. w = wiersze BM_WYNIKI.wiersz */
  function dni(a, b) { return Math.abs(Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000)); }
  function dopasuj(zgl, oficjalne) {
    var kand = (oficjalne || []).filter(function (o) {
      if (!o.czas || !o.km || !o.data) return false;
      if (zgl.impreza_klucz && o.klucz_imprezy && zgl.impreza_klucz !== o.klucz_imprezy) return false;
      return dni(zgl.data, o.data) <= 1 && Math.abs(o.km - Number(zgl.dystans_km)) <= Number(zgl.dystans_km) * 0.03;
    });
    if (kand.length !== 1) return null;
    var o = kand[0], pct = Math.round(Math.abs(zgl.czas_s - o.czas) / o.czas * 10000) / 100;
    return { oficjalny: o, roznica_pct: pct, informuj: pct > 2 };
  }

  /* MODAL — jeden na stronę, pola z data-*, bez danych w atrybutach onclick. otworz({nazwa?, data?, dystans_km?, miejscowosc?, impreza_klucz?, race_id?, zrodlo, athlete_id, pb_s?}) → Promise<wiersz|null> */
  var CSS = ".wz-tlo{position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.8);display:flex;align-items:flex-end;justify-content:center}" +
    ".wz-karta{background:var(--card,#15131c);border:1px solid var(--border,rgba(255,255,255,.12));border-radius:20px 20px 0 0;padding:18px 18px 28px;width:100%;max-width:480px;color:var(--fg,#f0ede8);font-family:'DM Sans',Inter,sans-serif}" +
    ".wz-karta h3{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.06em;margin:0 0 12px}.wz-karta label{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted,#8a8798);margin:10px 0 4px;font-family:'DM Mono',monospace}" +
    ".wz-karta input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.12));background:rgba(255,255,255,.04);color:inherit;font:15px inherit}" +
    ".wz-chipy{display:flex;gap:6px;flex-wrap:wrap}.wz-chip{background:transparent;border:1px solid var(--border,rgba(255,255,255,.2));color:var(--muted,#8a8798);border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer}.wz-chip.on{border-color:var(--accent,#e8561e);color:var(--fg,#f0ede8)}" +
    ".wz-blad{color:#ff6b6b;font-size:12px;margin-top:8px;min-height:1.2em}.wz-ost{color:#ffb347;font-size:12px;margin-top:6px}.wz-uwaga{font-size:11px;color:var(--muted,#8a8798);margin-top:10px;line-height:1.45}" +
    ".wz-przyciski{display:flex;gap:8px;margin-top:14px}.wz-przyciski button{flex:1;padding:12px;border-radius:12px;border:0;font:600 14px inherit;cursor:pointer}.wz-ok{background:var(--accent,#e8561e);color:#fff}.wz-anuluj{background:rgba(255,255,255,.08);color:var(--fg,#f0ede8)}";
  function wstrzyknijCss(doc) { if (doc.getElementById("bm-wz-css")) return; var st = doc.createElement("style"); st.id = "bm-wz-css"; st.textContent = CSS; doc.head.appendChild(st); }
  var CHIPY = [["5 km", 5], ["10 km", 10], ["Półmaraton", 21.0975], ["Maraton", 42.195]];

  function otworz(d) {
    var doc = g.document; if (!doc) return Promise.resolve(null);
    wstrzyknijCss(doc);
    var stare = doc.getElementById("bm-wz-modal"); if (stare) stare.remove();
    var tlo = doc.createElement("div"); tlo.id = "bm-wz-modal"; tlo.className = "wz-tlo"; tlo.setAttribute("role", "dialog"); tlo.setAttribute("aria-modal", "true");
    var dlugi = Number(d.dystans_km) > 20;
    tlo.innerHTML = '<div class="wz-karta"><h3>' + (d.zrodlo === "trener" ? "Wpisz wynik zawodnika" : "Wpisz swój wynik") + "</h3>" +
      '<label>Bieg</label><input class="wz-nazwa" maxlength="200" placeholder="np. Bieg Niepodległości">' +
      '<label>Data</label><input class="wz-data" type="date">' +
      '<label>Dystans</label><div class="wz-chipy">' + CHIPY.map(function (c) { return '<button type="button" class="wz-chip" data-km="' + c[1] + '">' + c[0] + "</button>"; }).join("") + '<button type="button" class="wz-chip" data-km="inny">Inny</button></div>' +
      '<input class="wz-km" inputmode="decimal" placeholder="km, np. 15" style="margin-top:6px;display:none">' +
      '<label>Czas</label><input class="wz-czas" inputmode="numeric" placeholder="' + (dlugi ? "1:45:00" : "45:30") + '">' +
      '<label>Miejscowość (opcjonalnie)</label><input class="wz-miasto" maxlength="80">' +
      '<div class="wz-blad" role="alert"></div><div class="wz-ost"></div>' +
      '<div class="wz-uwaga">Wynik zgłoszony — bez miejsca w klasyfikacji. Gdy oficjalne wyniki trafią do maszyny wyników, zastąpią go (przy różnicy ponad 2 % dostaniesz informację). Rekordów życiowych ani odznak to nie zmienia.</div>' +
      '<div class="wz-przyciski"><button type="button" class="wz-anuluj">Anuluj</button><button type="button" class="wz-ok">Zapisz</button></div></div>';
    doc.body.appendChild(tlo);
    var q = function (s) { return tlo.querySelector(s); };
    q(".wz-nazwa").value = d.nazwa || ""; q(".wz-data").value = d.data || ""; q(".wz-miasto").value = d.miejscowosc || "";
    var km = d.dystans_km != null ? Number(d.dystans_km) : null;
    function ustawKm(v) {
      km = v; tlo.querySelectorAll(".wz-chip").forEach(function (c) { c.classList.toggle("on", c.getAttribute("data-km") === (v == null ? "x" : CHIPY.some(function (x) { return x[1] === v; }) ? String(v) : "inny")); });
      var inny = q(".wz-km"); var wChipach = CHIPY.some(function (x) { return x[1] === v; }); inny.style.display = v != null && !wChipach ? "" : "none"; if (v != null && !wChipach) inny.value = String(v);
      q(".wz-czas").placeholder = v > 20 ? "1:45:00" : "45:30";
    }
    if (km != null) ustawKm(CHIPY.some(function (x) { return Math.abs(x[1] - km) < 0.3; }) ? CHIPY.filter(function (x) { return Math.abs(x[1] - km) < 0.3; })[0][1] : km);
    tlo.addEventListener("click", function (e) {
      var c = e.target.closest ? e.target.closest(".wz-chip") : null;
      if (c) { var v = c.getAttribute("data-km"); if (v === "inny") { ustawKm(km != null && !CHIPY.some(function (x) { return x[1] === km; }) ? km : 0); q(".wz-km").style.display = ""; q(".wz-km").value = km && !CHIPY.some(function (x) { return x[1] === km; }) ? String(km) : ""; q(".wz-km").focus(); } else ustawKm(Number(v)); }
    });
    q(".wz-km").addEventListener("input", function () { km = Number(String(q(".wz-km").value).replace(",", ".")) || 0; q(".wz-czas").placeholder = km > 20 ? "1:45:00" : "45:30"; });
    q(".wz-czas").addEventListener("input", function () { if (g.autoColonTime) g.autoColonTime(q(".wz-czas")); });
    return new Promise(function (resolve) {
      var potwierdzone = false;
      function zamknij(w) { tlo.remove(); resolve(w); }
      q(".wz-anuluj").addEventListener("click", function () { zamknij(null); });
      tlo.addEventListener("click", function (e) { if (e.target === tlo) zamknij(null); });
      q(".wz-ok").addEventListener("click", async function () {
        var w = waliduj({ nazwa: q(".wz-nazwa").value, data: q(".wz-data").value, dystans_km: km, czas: q(".wz-czas").value, pb_s: d.pb_s || null });
        q(".wz-blad").textContent = w.ok ? "" : w.blad;
        if (!w.ok) return;
        if (w.ostrzezenia.length && !potwierdzone) { q(".wz-ost").textContent = w.ostrzezenia.join(" ") + " Dotknij „Zapisz” jeszcze raz, żeby potwierdzić."; potwierdzone = true; return; }
        this.disabled = true;
        var r = await zapisz({ athlete_id: d.athlete_id, nazwa_imprezy: w.nazwa, data: w.data, miejscowosc: String(q(".wz-miasto").value || "").trim() || null, dystans_km: w.dystans_km, czas_s: w.czas_s,
          impreza_klucz: d.impreza_klucz && RE_KLUCZ_IMPREZY.test(d.impreza_klucz) ? d.impreza_klucz : null, race_id: d.race_id || null, zrodlo: d.zrodlo === "trener" ? "trener" : "zawodnik" });
        if (r.error) { this.disabled = false; q(".wz-blad").textContent = r.blad; return; }
        zamknij(r.wiersz);
      });
    });
  }

  /** JEDYNA funkcja zapisu. → {wiersz} | {error, blad}. Kody bazy: 23505 (drugi wynik na ten start), 23514 (CHECK), 42501 (RLS/strażnik). */
  async function zapisz(w) {
    var sb = g.sb; if (!sb) return { error: "brak klienta", blad: "Brak połączenia z aplikacją." };
    var wiersz = { athlete_id: w.athlete_id, nazwa_imprezy: w.nazwa_imprezy, data: w.data, miejscowosc: w.miejscowosc || null, dystans_km: w.dystans_km, czas_s: w.czas_s,
      impreza_klucz: w.impreza_klucz || null, race_id: w.race_id || null, zrodlo: w.zrodlo };
    var r = await sb.from("wyniki_zgloszone").insert(wiersz).select("id,athlete_id,nazwa_imprezy,data,miejscowosc,dystans_km,czas_s,impreza_klucz,race_id,zrodlo,stan,created_at").maybeSingle();
    if (r.error) {
      var kod = r.error.code || "";
      var blad = kod === "23505" ? "Masz już wynik z tego dnia na tym dystansie." : kod === "23514" ? "Baza odrzuciła wynik — sprawdź tempo i datę." : kod === "42501" ? "Nie możesz zapisać wyniku tej osobie." : "Nie udało się zapisać — spróbuj za chwilę.";
      try { if (g.zglosNieudanyZapis && kod !== "23505") g.zglosNieudanyZapis("wyniki_zgloszone.insert", r.error); } catch (e) {}
      return { error: r.error, blad: blad };
    }
    return { wiersz: r.data };
  }
  /** Dopasowanie w bazie (RPC wynik_zgloszony_dopasuj): wartości oficjalne są informacyjne — rekordy liczy F6. */
  async function zapiszDopasowanie(id, resultId, czasS) {
    var sb = g.sb; if (!sb || !RE_RESULT_ID.test(String(resultId || ""))) return { error: "zle dane" };
    return sb.rpc("wynik_zgloszony_dopasuj", { p_id: id, p_result_id: String(resultId), p_czas_s: Math.round(czasS) });
  }

  g.BM_WYNIK_ZGLOSZONY = { waliduj: waliduj, parsujCzas: parsujCzas, progi: progi, dopasuj: dopasuj, otworz: otworz, zapisz: zapisz, zapiszDopasowanie: zapiszDopasowanie, fmt: fmt, RE_KLUCZ_IMPREZY: RE_KLUCZ_IMPREZY };
})(typeof globalThis !== "undefined" ? globalThis : this);
