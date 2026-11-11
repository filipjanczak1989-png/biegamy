// KARTA „MÓJ WKŁAD” (11.11.2026): obraz do udostępnienia, rysowany w przeglądarce (canvas 1080×1350 albo 1080×1920). Plik BEZ import/export (globalThis.BM_WKLAD_KARTA),
// dociągany przez js/akcja.mjs dopiero po dotknięciu „Pokaż mój wkład”. Tylko dane osoby, która klika: imię (bez nazwiska), jej kilometry w akcji, liczba dni z aktywnością,
// postęp całej ulicy (km i % celu), nazwa ulicy z bazy, adres strony akcji, grafika z assets/ulica. Bez kwot, bez innych uczestników, bez znaku organizacji. Nic nie idzie na serwer:
// udostępnianie przez Web Share z plikiem, zapasowo pobranie PNG. Te same narzędzia co dyplom biegu (tekstWSzer, Web Share z zapasem).
(function (g) {
  "use strict";
  var FONT_NAGL = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif", FONT_TEKST = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
  var GRAFIKI = ["assets/ulica/wzgorza.webp", "assets/ulica/droga.webp", "assets/ulica/pierwszy-plan.webp", "assets/ulica/domek-1.webp", "assets/ulica/domek-3.webp", "assets/ulica/drzewo.webp", "assets/ulica/latarnia.webp", "assets/ulica/budowniczy.webp"];
  function liczba(n, miejsc) {
    n = Number(n); if (!isFinite(n)) n = 0;
    var m = miejsc == null ? 0 : miejsc, t = (Math.round(Math.abs(n) * Math.pow(10, m)) / Math.pow(10, m)).toFixed(m), cz = t.split("."), ul = (cz[1] || "").replace(/0+$/, "");
    return (n < 0 ? "-" : "") + cz[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (ul ? "," + ul : "");
  }
  function km(x) { var n = Number(x) || 0; return liczba(n, n > 0 && n < 100 ? 1 : 0); }
  function forma(n, f) { n = Math.abs(Math.round(Number(n) || 0)); var r = n % 10, s = n % 100; return n === 1 ? f[0] : r >= 2 && r <= 4 && (s < 12 || s > 14) ? f[1] : f[2]; }
  function imieZ(t) { var s = String(t == null ? "" : t).trim().split(/\s+/)[0].replace(/[^\p{L}\-]/gu, "").slice(0, 20); return s ? s.charAt(0).toLocaleUpperCase("pl-PL") + s.slice(1) : ""; }
  function dopelniacz(imie) { return g.BM_AKCJA && g.BM_AKCJA.dopelniacz ? g.BM_AKCJA.dopelniacz(imie) : String(imie || ""); }
  /** Dane do rysunku z licznika: tylko nazwa ulicy (imię bohatera z bazy), suma, cel, procent. */
  function daneUlicy(d) {
    var im = d && typeof d.imie === "string" ? dopelniacz(d.imie) : "", suma = Number(d && d.suma_km) || 0, cel = Number(d && d.cel_km) || 0;
    var pct = d && typeof d.pct === "number" && isFinite(d.pct) ? d.pct : (cel > 0 ? Math.floor(suma / cel * 1000) / 10 : 0);
    return { ulica: im ? "Ulica " + im : (d && d.nazwa ? String(d.nazwa) : "Ulica akcji"), suma_km: suma, cel_km: cel, pct: Math.max(0, Math.min(100, pct)) };
  }
  function nowyCanvas(w, h) { var k = g.document.createElement("canvas"); k.width = w; k.height = h; return k; }
  function prost(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function tekstWSzer(c, t, x, y, maks, font, rozmiar, waga) {
    var pelny = String(t || ""), r = rozmiar, min = Math.ceil(rozmiar * 0.6), ustaw = function (px) { c.font = (waga || 400) + " " + px + "px " + font; };
    t = pelny;
    for (; r >= min; r -= 2) { ustaw(r); if (c.measureText(t).width <= maks) break; }
    if (r < min) ustaw(min);
    if (c.measureText(t).width > maks) while (t.length > 2 && c.measureText(t + "…").width > maks) t = t.slice(0, -1);
    c.fillText(t === pelny ? t : t + "…", x, y);
  }
  function rysujObraz(c, im, x, y, w, h) { try { if (im && (im.naturalWidth > 0 || im.width > 0)) { c.drawImage(im, x, y, w, h); return true; } } catch (e) {} return false; }
  /**
   * Obraz. dane: { imie, km, dni (liczba albo null), ulica: daneUlicy(d), adres }, format 'pion' 1080×1350 | 'story' 1080×1920, obrazy: { nazwa → Image }.
   * Góra: nazwa ulicy, MÓJ WKŁAD, imię, wielkie km, dni; środek: pasek ulicy z liczbami; dół: pas Ulicy z grafik; stopka: adres i BiegaMy.
   */
  function obraz(dane, format, obrazy) {
    var story = format === "story", W = 1080, H = story ? 1920 : 1350, k = nowyCanvas(W, H), c = k.getContext("2d"), u = dane.ulica, o = obrazy || {};
    var tlo = c.createLinearGradient(0, 0, 0, H); tlo.addColorStop(0, "#07070a"); tlo.addColorStop(1, "#1a1016"); c.fillStyle = tlo; c.fillRect(0, 0, W, H);
    var y0 = story ? 230 : 90;
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillStyle = "rgba(240,237,232,.72)"; c.font = "600 28px " + FONT_TEKST; c.fillText(("BIEGAMY · " + u.ulica).toUpperCase(), W / 2, y0);
    c.fillStyle = "#ff8a3d"; c.font = "132px " + FONT_NAGL; c.fillText("MÓJ WKŁAD", W / 2, y0 + 150);
    c.fillStyle = "#f0ede8"; tekstWSzer(c, dane.imie || "Ja", W / 2, y0 + 250, W - 200, FONT_NAGL, 96);
    c.fillStyle = "#f0ede8"; c.font = "260px " + FONT_NAGL; c.fillText(km(dane.km), W / 2, y0 + 520);
    c.fillStyle = "#ff8a3d"; c.font = "600 40px " + FONT_TEKST; c.fillText("km na ulicy", W / 2, y0 + 598);
    if (dane.dni != null) { c.fillStyle = "rgba(240,237,232,.72)"; c.font = "500 30px " + FONT_TEKST; c.fillText(liczba(dane.dni) + " " + forma(dane.dni, ["dzień", "dni", "dni"]) + " z biegiem albo spacerem", W / 2, y0 + 650); }
    /* pasek całej ulicy (nad sceną: w pionie scena zaczyna się 930 px, pasek z podpisem kończy się 880 px) */
    var yp = y0 + 720, px = 90, pw = W - 180;
    prost(c, px, yp, pw, 26, 13); c.fillStyle = "rgba(255,255,255,.1)"; c.fill();
    prost(c, px, yp, Math.max(26, pw * Math.min(100, u.pct) / 100), 26, 13); var gr = c.createLinearGradient(px, 0, px + pw, 0); gr.addColorStop(0, "#e8561e"); gr.addColorStop(1, "#ff8a3d"); c.fillStyle = gr; c.fill();
    c.fillStyle = "#f0ede8"; c.font = "600 30px " + FONT_TEKST; c.fillText("cała ulica: " + km(u.suma_km) + " z " + km(u.cel_km) + " km · " + liczba(u.pct, 1) + " %", W / 2, yp + 72);
    /* pas Ulicy z grafik: niebo, wzgórza, łąka, droga, domki, drzewa, budowniczy, pierwszy plan */
    var sh = story ? 600 : 320, sy = H - sh - 100;
    var niebo = c.createLinearGradient(0, sy, 0, sy + sh * 0.6); niebo.addColorStop(0, "#9fd0ee"); niebo.addColorStop(1, "#dceefb"); c.fillStyle = niebo; c.fillRect(0, sy, W, sh * 0.6);
    c.fillStyle = "#86ad55"; c.fillRect(0, sy + sh * 0.6, W, sh * 0.4);
    if (o.wzgorza && o.wzgorza.naturalWidth) { var wh = sh * 0.34, ww = wh * (o.wzgorza.naturalWidth / o.wzgorza.naturalHeight); for (var xx = 0; xx < W; xx += ww) c.drawImage(o.wzgorza, xx, sy + sh * 0.6 - wh, ww, wh); }
    c.fillStyle = "#3b3b47"; c.fillRect(0, sy + sh * 0.76, W, sh * 0.16);
    if (o.droga && o.droga.naturalWidth) { var dh = sh * 0.16, dw = dh * (o.droga.naturalWidth / o.droga.naturalHeight); for (var x2 = 0; x2 < W; x2 += dw) c.drawImage(o.droga, x2, sy + sh * 0.76, dw, dh); }
    var pod = sy + sh * 0.76;
    rysujObraz(c, o.drzewo, 40, pod - sh * 0.42, sh * 0.36, sh * 0.42);
    rysujObraz(c, o["domek-1"], 150, pod - sh * 0.46, sh * 0.56, sh * 0.46);
    rysujObraz(c, o.latarnia, 440, pod - sh * 0.38, sh * 0.09, sh * 0.38);
    rysujObraz(c, o["domek-3"], 520, pod - sh * 0.46, sh * 0.6, sh * 0.46);
    rysujObraz(c, o.budowniczy, 880, pod - sh * 0.3, sh * 0.16, sh * 0.3);
    rysujObraz(c, o.drzewo, 960, pod - sh * 0.36, sh * 0.3, sh * 0.36);
    if (o["pierwszy-plan"] && o["pierwszy-plan"].naturalWidth) { var ph = sh * 0.12, pw2 = ph * (o["pierwszy-plan"].naturalWidth / o["pierwszy-plan"].naturalHeight); for (var x3 = 0; x3 < W; x3 += pw2) c.drawImage(o["pierwszy-plan"], x3, sy + sh - ph, pw2, ph); }
    /* stopka */
    c.textAlign = "left"; c.fillStyle = "#f0ede8"; c.font = "600 30px " + FONT_TEKST; c.fillText("BiegaMy", 70, H - 40);
    c.textAlign = "right"; c.fillStyle = "rgba(240,237,232,.72)"; c.font = "500 26px " + FONT_TEKST; tekstWSzer(c, String(dane.adres || ""), W - 70, H - 40, 700, FONT_TEKST, 26, 500);
    return k;
  }
  function wczytaj(src) { return new Promise(function (ok) { try { var im = new g.Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = src; } catch (e) { ok(null); } }); }
  function fonty() { try { return g.document.fonts && g.document.fonts.load ? Promise.race([Promise.all([g.document.fonts.load("40px 'Bebas Neue'"), g.document.fonts.load("600 20px Inter")]), new Promise(function (ok) { g.setTimeout(ok, 1500); })]) : Promise.resolve(); } catch (e) { return Promise.resolve(); } }
  function doBloba(k) { return new Promise(function (ok) { k.toBlob(function (b) { ok(b); }, "image/png"); }); }
  function pobierz(blob, nazwa) { var u = URL.createObjectURL(blob), a = g.document.createElement("a"); a.href = u; a.download = nazwa; g.document.body.appendChild(a); a.click(); g.setTimeout(function () { a.remove(); URL.revokeObjectURL(u); }, 2000); }
  function udostepnij(k, nazwa) {
    return doBloba(k).then(function (blob) {
      var plik = null; try { plik = new File([blob], nazwa, { type: "image/png" }); } catch (e) {}
      if (plik && g.navigator && g.navigator.share && g.navigator.canShare && g.navigator.canShare({ files: [plik] })) return g.navigator.share({ files: [plik], title: "Mój wkład", text: "Moje kilometry na ulicy" }).then(function () { return "udostępnione"; }, function (e) { if (e && e.name === "AbortError") return "anulowane"; pobierz(blob, nazwa); return "pobrane"; });
      pobierz(blob, nazwa); return "pobrane";
    });
  }
  var CSS = ".wk-nakladka{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:14px;background:rgba(7,7,10,.94);font-family:Inter,system-ui,sans-serif;color:#f0ede8}" +
    ".wk-nakladka img{max-width:min(92vw,420px);max-height:62vh;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.6);background:#07070a}" +
    ".wk-formaty{display:flex;gap:6px}.wk-formaty button{min-height:40px;padding:0 12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#f0ede8;font:600 12px/1 Inter,sans-serif;cursor:pointer}.wk-formaty button[aria-pressed=true]{background:#c9440f;border-color:#c9440f;color:#fff}" +
    ".wk-przyciski{display:flex;gap:8px;width:min(92vw,420px)}.wk-przyciski button{flex:1;min-height:46px;border:0;border-radius:12px;background:#c9440f;color:#fff;font:600 14px/1 Inter,sans-serif;cursor:pointer}.wk-przyciski button.wk-cichy{background:rgba(255,255,255,.1)}" +
    ".wk-info{font-size:12px;color:rgba(240,237,232,.72);text-align:center;max-width:420px}";
  function wstrzyknijCss() { if (g.document.getElementById("bm-wklad-karta-css")) return; var st = g.document.createElement("style"); st.id = "bm-wklad-karta-css"; st.textContent = CSS; g.document.head.appendChild(st); }
  /** Nakładka z podglądem, przełącznikiem formatu, Udostępnij/Pobierz/Zamknij. opcje: { imie, km, licznik, adres, dni: () => Promise<number|null> }. */
  function pokaz(opcje) {
    var o = opcje || {}, dane = { imie: imieZ(o.imie), km: Number(o.km) || 0, dni: null, ulica: daneUlicy(o.licznik), adres: String(o.adres || "") }, format = "pion", kanwa = null, obrazy = {};
    wstrzyknijCss();
    var n = g.document.createElement("div"); n.className = "wk-nakladka"; n.setAttribute("role", "dialog"); n.setAttribute("aria-label", "Mój wkład");
    var im = g.document.createElement("img"); im.alt = "Mój wkład"; n.appendChild(im);
    var f = g.document.createElement("div"); f.className = "wk-formaty"; f.innerHTML = '<button type="button" data-format="pion" aria-pressed="true">1080×1350</button><button type="button" data-format="story" aria-pressed="false">1080×1920</button>'; n.appendChild(f);
    var p = g.document.createElement("div"); p.className = "wk-przyciski"; p.innerHTML = '<button type="button" data-udostepnij>Udostępnij</button><button type="button" class="wk-cichy" data-pobierz>Pobierz PNG</button><button type="button" class="wk-cichy" data-zamknij>Zamknij</button>'; n.appendChild(p);
    var info = g.document.createElement("div"); info.className = "wk-info"; info.textContent = "Obraz powstaje w Twojej przeglądarce: tylko Twoje imię i kilometry, bez kwot i bez innych osób. Nic nie idzie na serwer."; n.appendChild(info);
    function rysuj() { kanwa = obraz(dane, format, obrazy); im.src = kanwa.toDataURL("image/png"); }
    n.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button") : null; if (!b) return;
      if (b.hasAttribute("data-zamknij")) { n.remove(); return; }
      if (b.hasAttribute("data-format")) { format = b.getAttribute("data-format"); f.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); rysuj(); return; }
      if (!kanwa) return;
      if (b.hasAttribute("data-udostepnij")) udostepnij(kanwa, "moj-wklad.png");
      if (b.hasAttribute("data-pobierz")) doBloba(kanwa).then(function (bl) { pobierz(bl, "moj-wklad-" + format + ".png"); });
    });
    g.document.body.appendChild(n);
    Promise.all(GRAFIKI.map(function (s) { return wczytaj(s).then(function (x) { obrazy[s.split("/").pop().replace(".webp", "")] = x; }); }).concat([fonty()])).then(rysuj);
    if (typeof o.dni === "function") Promise.resolve(o.dni()).then(function (d) { if (d != null) { dane.dni = d; if (kanwa) rysuj(); } }, function () {});
    return n;
  }
  /** Imię z migawki Dziś (DzisOffline, część „zawodnik”): tylko pierwsze słowo, bez nazwiska; bez migawki pusto (karta pokaże „Ja”). */
  function imieZMigawki() {
    try { var O = g.DzisOffline, m = O && O._userIdCache ? O.odczytaj(O._userIdCache) : null, z = m && m.czesci && m.czesci.zawodnik; return z && z.full_name ? String(z.full_name).trim().split(/\s+/)[0] : ""; } catch (e) { return ""; }
  }
  /** Liczba dni z aktywnością w akcji: istniejące RPC akcja_moje_dni (to samo, co woła zawodnik.html), tylko po dotknięciu; bez sesji albo błąd → bez wiersza. */
  function policzMojeDni() {
    if (!g.sb || typeof g.sb.rpc !== "function" || !g.BM_AKCJA_CYTATY) return Promise.resolve(null);
    try {
      return Promise.resolve(g.sb.rpc("akcja_moje_dni", { p_slug: g.BM_AKCJA_CYTATY.slugDla(g._athleteId) })).then(function (r) { return r && !r.error && Array.isArray(r.data) ? r.data.length : null; }, function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  /** Zaczep z kafla (js/akcja.mjs): licznik, wkład klikającego i adres strony akcji; reszta (imię, dni) z pamięci strony i z istniejącego RPC. */
  function zKafla(d, wklad, adres) { return pokaz({ imie: imieZMigawki(), km: Number(wklad && wklad.km) || 0, licznik: d, adres: "biegamy.run/" + String(adres || "dla-fabianka.html"), dni: policzMojeDni }); }
  g.BM_WKLAD_KARTA = { obraz: obraz, pokaz: pokaz, zKafla: zKafla, daneUlicy: daneUlicy, imieZ: imieZ, imieZMigawki: imieZMigawki, km: km, tekstWSzer: tekstWSzer, GRAFIKI: GRAFIKI };
})(typeof globalThis !== "undefined" ? globalThis : window);
