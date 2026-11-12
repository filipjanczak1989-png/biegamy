// MIASTO DOBRA · DLA FIRM (11.11.2026): strona pokazowa miasto-firmy.html. Plik BEZ import/export (globalThis.BM_FIRMY_MIASTO), jak js/miasto.mjs: ładowany skryptem, importowalny w testach.
// Cztery sposoby wejścia firmy na ulicę (sponsor kilometrów, opiekun odcinka, domek/wieżowiec/partner rzeczowy, firma biegnie sama), blok „jak płyną pieniądze”,
// kogo nie przyjmujemy, oferta do druku, generator podziękowania (canvas), deklaracja sponsora kilometrów do druku (WZÓR). Nic nie zapisuje i nic nie wysyła; liczby ulicy
// z publicznego licznika akcji przez js/akcja.mjs (te same pola co miasto.html); przykłady (ranking drużyn, kwoty) wymyślone i oznaczone PRZYKŁAD.
// Pieniądze idą wyłącznie od firmy do organizacji prowadzącej zbiórkę; BiegaMy ich nie dotyka. Dozwolone zwroty: „partner rzeczowy” (firma) i „Partner Miasta Dobra” (sama platforma, w przygotowaniu); nigdy wobec organizacji.
(function (g) {
  "use strict";
  var BAZA = "https://afqojgkaveykxbltxzwm.supabase.co", SLUG = "dla-fabianka", STRONA_AKCJI = "dla-fabianka.html", KLUCZ_PAMIECI = "bm_firmy_miasto";
  /** Jedyne pola licznika, które strona czyta. Progi kwot tylko jako przykład „na tej ulicy było tak”, bez obiecywania cen na przyszłość. */
  var POLA_LICZNIKA = ["wystartowala", "nazwa", "imie", "cel_km", "suma_km", "pct", "koniec", "zamknieta", "firmy", "prog_domku_zl", "prog_wiezowca_zl"];
  var KM_NA_ODCINEK = 100;
  var STAWKI_GR = [5, 10, 20];
  var PROGI_TRANSZ = [25, 50, 100];   // % celu ulicy (decyzja 4.11: progi 25/50/100)
  var ODMOWA = ["hazard i zakłady", "alkohol", "tytoń i e-papierosy", "pożyczki krótkoterminowe („chwilówki”)"];
  var NIE_KUPUJE = ["wpływu na wybór zbiórek i organizacji", "danych uczestników ani darczyńców", "prawa do wizerunku dziecka ani znaku organizacji", "miejsca w aplikacji poza ulicą zbiórki (reklam nie ma)"];
  var DRUZYNY_PRZYKLAD = [{ nazwa: "Piekarnia na Rogu", osob: 6, km: 212, gr_za_km: 20 }, { nazwa: "Studio Ruchu", osob: 9, km: 188, gr_za_km: 10 }, { nazwa: "Warsztat Rowerowy", osob: 4, km: 97, gr_za_km: 10 }, { nazwa: "Biuro na Zielonej", osob: 11, km: 86, gr_za_km: 5 }];
  var SPOSOBY = [
    { id: "sponsor", tytul: "Sponsor kilometrów", krotko: "Firma deklaruje stawkę za każdy kilometr ulicy, z limitem. Wpłaca sama, prosto na zbiórkę organizacji, w transzach po progach celu.", ulica: "na liczniku ulicy: „każdy kilometr dokłada …”" },
    { id: "odcinek", tytul: "Opiekun odcinka", krotko: "Ulica ma odcinki po 100 km. Firma bierze jeden albo kilka; przy odcinku stoi tabliczka z jej nazwą.", ulica: "tabliczka z nazwą firmy przy odcinku drogi" },
    { id: "budynek", tytul: "Domek, wieżowiec, partner rzeczowy", krotko: "To, co już działa: formularz na stronie akcji, tablica z logo na budynku, wizytówka po dotknięciu.", ulica: "domek albo wieżowiec z logo na tablicy" },
    { id: "druzyna", tytul: "Firma biegnie sama", krotko: "Drużyna pracowników na ulicy; firma dokłada za kilometry własnych ludzi. Ranking drużyn na ulicy.", ulica: "drużyna w rankingu, kilometry pracowników w liczniku" }
  ];

  /* ── POMOCNICZE ───────────────────────────────────────────────────────────────────────────── */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function liczba(n, miejsc) {
    n = Number(n); if (!isFinite(n)) n = 0;
    var m = miejsc == null ? 0 : miejsc, t = (Math.round(Math.abs(n) * Math.pow(10, m)) / Math.pow(10, m)).toFixed(m), cz = t.split("."), ul = (cz[1] || "").replace(/0+$/, "");
    return (n < 0 ? "-" : "") + cz[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (ul ? "," + ul : "");
  }
  function km(x) { var n = Number(x) || 0; return liczba(n, n > 0 && n < 10 ? 1 : 0); }
  function zl(gr) { return liczba(Math.round(Number(gr) || 0) / 100, 2).replace(/,00$/, "") + " zł"; }
  function forma(n, f) { n = Math.abs(Math.round(Number(n) || 0)); var r = n % 10, s = n % 100; return n === 1 ? f[0] : r >= 2 && r <= 4 && (s < 12 || s > 14) ? f[1] : f[2]; }
  function odmiana(n, f) { return liczba(n) + " " + forma(n, f); }
  function procent(suma, cel) { return !(Number(cel) > 0) ? 0 : Math.min(100, Math.floor(Number(suma || 0) / Number(cel) * 1000) / 10); }
  function dopelniacz(imie) { return g.BM_AKCJA && g.BM_AKCJA.dopelniacz ? g.BM_AKCJA.dopelniacz(imie) : String(imie || ""); }
  var MIESIACE = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  function dataPolska(d) { d = d instanceof Date ? d : new Date(d); return isFinite(d.getTime()) ? d.getDate() + " " + MIESIACE[d.getMonth()] + " " + d.getFullYear() : ""; }
  /** Nazwa firmy z pola: litery, cyfry, spacje i kilka znaków, do 40 znaków; pusto → „Twoja firma”. Tylko do rysowania w przeglądarce. */
  function nazwaFirmy(t) { var s = String(t == null ? "" : t).replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40); return s || "Twoja firma"; }

  /* ── ULICA Z LICZNIKA (te same pola co miasto.html) ───────────────────────────────────────── */
  function ulicaZLicznika(d) {
    var u = { status: "brak", nazwa: "Ulica akcji BiegaMy", cel_km: 0, suma_km: 0, pct: 0, firmy_n: 0, prog_domku_zl: null, prog_wiezowca_zl: null, strona: STRONA_AKCJI };
    if (!d || typeof d !== "object") return u;
    if (d.wystartowala !== true) { u.status = "przed"; return u; }
    var im = dopelniacz(d.imie);
    u.nazwa = im ? "Ulica " + im : (d.nazwa ? String(d.nazwa) : u.nazwa);
    u.tytul = d.nazwa ? String(d.nazwa) : "";
    u.cel_km = Number(d.cel_km) || 0; u.suma_km = Number(d.suma_km) || 0;
    u.pct = d.pct == null ? procent(u.suma_km, u.cel_km) : Number(d.pct) || 0;
    u.firmy_n = Array.isArray(d.firmy) ? d.firmy.length : 0;
    u.prog_domku_zl = Number(d.prog_domku_zl) > 0 ? Number(d.prog_domku_zl) : null;
    u.prog_wiezowca_zl = Number(d.prog_wiezowca_zl) > 0 ? Number(d.prog_wiezowca_zl) : null;
    u.status = d.koniec || d.zamknieta === true ? "zakonczona" : "trwa";
    return u;
  }
  function zapamietaj(u, teraz) { if (!u || u.status === "brak") return false; try { g.localStorage.setItem(KLUCZ_PAMIECI, JSON.stringify({ t: teraz || Date.now(), u: u })); return true; } catch (e) { return false; } }
  function odczytaj() { try { var z = JSON.parse(g.localStorage.getItem(KLUCZ_PAMIECI) || "null"); return z && z.u && typeof z.u === "object" && z.t ? { t: Number(z.t), u: z.u } : null; } catch (e) { return null; } }
  function pobierzUlice() { var A = g.BM_AKCJA; if (!A || !A.pobierzPubliczny) return Promise.resolve(null); return A.pobierzPubliczny(SLUG, { baza: BAZA }).then(function (d) { return d ? ulicaZLicznika(d) : null; }, function () { return null; }); }
  /** Ulica do pokazu, gdy licznika nie ma (bez sieci przy pierwszym wejściu): wymyślona, oznaczona PRZYKŁAD. */
  var ULICA_PRZYKLAD = { status: "trwa", przyklad: true, nazwa: "Ulica przykładowa", cel_km: 10000, suma_km: 3640, pct: 36.4, firmy_n: 4, prog_domku_zl: 100, prog_wiezowca_zl: 1000, strona: STRONA_AKCJI };

  /* ── SPONSOR KILOMETRÓW: kalkulator ───────────────────────────────────────────────────────── */
  /** stawka w groszach × cel ulicy = górny limit; transze po progach % celu; „dziś” = ile by już przypadło przy obecnych km (ograniczone limitem). */
  function kalkulatorSponsora(stawkaGr, u) {
    var st = STAWKI_GR.indexOf(Number(stawkaGr)) >= 0 ? Number(stawkaGr) : 10, cel = Number(u && u.cel_km) || 0, suma = Number(u && u.suma_km) || 0;
    var limitGr = Math.round(st * cel), dzisGr = Math.min(limitGr, Math.round(st * suma));
    return { stawka_gr: st, cel_km: cel, limit_gr: limitGr, dzis_gr: dzisGr,
      transze: PROGI_TRANSZ.map(function (p) { return { prog_pct: p, km: Math.round(cel * p / 100), kwota_gr: Math.round(limitGr * p / 100), osiagnieta: suma >= cel * p / 100 }; }),
      zdanie: "Każdy kilometr ulicy dokłada " + st + " gr, najwyżej " + zl(limitGr) + " przy " + km(cel) + " km celu." };
  }
  /* ── OPIEKUN ODCINKA ──────────────────────────────────────────────────────────────────────── */
  function odcinki(u) {
    var cel = Number(u && u.cel_km) || 0, suma = Number(u && u.suma_km) || 0, n = Math.max(1, Math.ceil(cel / KM_NA_ODCINEK)), zbudowane = Math.min(n, Math.floor(suma / KM_NA_ODCINEK));
    return { n: n, km_na_odcinek: KM_NA_ODCINEK, zbudowane: zbudowane, wolne: n - zbudowane, biezacy: Math.min(n, zbudowane + 1) };
  }
  /* ── RANKING DRUŻYN (PRZYKŁAD) ────────────────────────────────────────────────────────────── */
  function rankingDruzyn() {
    return DRUZYNY_PRZYKLAD.slice().sort(function (a, b) { return b.km - a.km; }).map(function (d, i) { return { miejsce: i + 1, nazwa: d.nazwa, osob: d.osob, km: d.km, gr_za_km: d.gr_za_km, kwota_gr: d.km * d.gr_za_km, przyklad: true }; });
  }

  /* ── OFERTA I DEKLARACJA (teksty do druku) ────────────────────────────────────────────────── */
  function deklaracja(stawkaGr, u, nazwa) {
    var k = kalkulatorSponsora(stawkaGr, u);
    return { naglowek: "WZÓR, do przejrzenia przez prawnika", tytul: "Deklaracja sponsora kilometrów", firma: nazwaFirmy(nazwa), ulica: u && u.nazwa || "", stawka: k.stawka_gr + " gr za kilometr", limit: zl(k.limit_gr) + " (" + km(k.cel_km) + " km celu)",
      transze: k.transze.map(function (t) { return t.prog_pct + " % celu (" + km(t.km) + " km): " + zl(t.kwota_gr); }),
      termin: "do 14 dni od osiągnięcia progu, wpłata bezpośrednio na oficjalną zbiórkę organizacji prowadzącej zbiórkę",
      zgody: ["nazwa firmy na ulicy i w podziękowaniach", "logo firmy na tablicy budynku i w podziękowaniach (plik przekazuje firma)"],
      zastrzezenia: ["BiegaMy nie przyjmuje pieniędzy i nie pośredniczy w wpłacie.", "Deklaracja nie daje wpływu na wybór zbiórek, dostępu do danych uczestników ani prawa do wizerunku dziecka i znaku organizacji.", "Firmy z branż: " + ODMOWA.join(", ") + " nie są przyjmowane."] };
  }

  /* ── PODZIĘKOWANIE (canvas 1080×1350 albo 1080×1080) ─────────────────────────────────────── */
  var FONT_NAGL = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif", FONT_TEKST = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
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
   * Podziękowanie dla firmy. format 'pion' 1080×1350 | 'kwadrat' 1080×1080. dane: { firma, ulica (z licznika), sposob ('sponsor'|'odcinek'|'budynek'|'druzyna'), stawka_gr }, obrazy: { domek, wiezowiec }.
   * Tylko nazwa firmy z pola i liczby ulicy; bez kwot wpłat, bez nazwisk, bez znaku organizacji. Gdy ulica to przykład, znaczek PRZYKŁAD.
   */
  function podziekowanie(dane, format, obrazy) {
    var kw = format === "kwadrat", W = 1080, H = kw ? 1080 : 1350, k = nowyCanvas(W, H), c = k.getContext("2d"), u = dane.ulica || ULICA_PRZYKLAD, firma = nazwaFirmy(dane.firma);
    var niebo = c.createLinearGradient(0, 0, 0, H * 0.58); niebo.addColorStop(0, "#9fd0ee"); niebo.addColorStop(1, "#dceefb"); c.fillStyle = niebo; c.fillRect(0, 0, W, H * 0.58);
    c.fillStyle = "#86ad55"; c.fillRect(0, H * 0.58, W, H * 0.42);
    /* droga niżej (0,78–0,87 H), budynki większe: dolna część grafiki nie jest pustą zielenią (uwaga z przeglądu 11.11); pod drogą zostaje miejsce na dwa wiersze zdania i podpis */
    var yDroga = H * 0.78, wysDrogi = H * 0.09;
    c.fillStyle = "#3b3b47"; c.fillRect(0, yDroga, W, wysDrogi); c.strokeStyle = "#fff7e6"; c.lineWidth = 6; c.setLineDash([40, 30]); c.beginPath(); c.moveTo(0, yDroga + wysDrogi / 2); c.lineTo(W, yDroga + wysDrogi / 2); c.stroke(); c.setLineDash([]);
    /* budynki pod ramkami z liczbami i paskiem sponsora: wieżowiec po lewej (x 120–373), domek po prawej (od x 432); nic nie nachodzi na tekst (pion: dół paska sponsora 580 < góra wieżowca 593; kwadrat: 536 < 552) */
    var wysDom = kw ? 260 : 400, yDom = yDroga - wysDom, wysW = kw ? 290 : 460;
    if (!rysujObraz(c, obrazy && obrazy.wiezowiec, 120, yDroga - wysW, wysW * 0.55, wysW)) { c.fillStyle = "#9aa7c8"; c.fillRect(120, yDroga - wysW, 200, wysW); }
    /* tablica wieżowca (jak na Ulicy: logo na tablicy; w pokazie nazwa firmy) */
    var bw = wysW * 0.55, bx = 120 + bw * 0.19, by = yDroga - wysW + wysW * 0.145, bW = bw * 0.62, bH = wysW * 0.075;   // tablica na grafice wieżowca (pod flagą, nad oknami)
    prost(c, bx, by, bW, bH, 6); c.fillStyle = "#1e2230"; c.fill(); c.strokeStyle = "#fff7e6"; c.lineWidth = 3; c.stroke();
    c.fillStyle = "#fff7e6"; c.textAlign = "center"; c.textBaseline = "middle"; tekstWSzer(c, firma, bx + bW / 2, by + bH / 2, bW - 12, FONT_TEKST, Math.round(bH * 0.42), 800); c.textBaseline = "alphabetic";
    if (!rysujObraz(c, obrazy && obrazy.domek, W - 160 - wysDom * 1.22, yDom, wysDom * 1.22, wysDom)) { c.fillStyle = "#c8553d"; c.fillRect(W - 500, yDom + 80, 380, wysDom - 80); }
    /* tablica z nazwą firmy nad domkiem, jak szyld na Ulicy */
    var tx = W - 160 - wysDom * 1.22 + wysDom * 0.2, ty = yDom + wysDom * 0.33, tw = wysDom * 0.82, th = wysDom * 0.14;
    prost(c, tx, ty, tw, th, 10); c.fillStyle = "#fff7e6"; c.fill(); c.strokeStyle = "#5a2e0e"; c.lineWidth = 4; c.stroke();
    c.fillStyle = "#4a2408"; c.textAlign = "center"; c.textBaseline = "middle"; tekstWSzer(c, firma, tx + tw / 2, ty + th / 2, tw - 24, FONT_TEKST, Math.round(th * 0.5), 800);
    c.textBaseline = "alphabetic";
    /* góra: dziękujemy + nazwa firmy */
    c.fillStyle = "#07070a"; c.textAlign = "center"; c.font = "600 " + (kw ? 26 : 30) + "px " + FONT_TEKST; c.fillText("MIASTO DOBRA · " + String(u.nazwa || "").toUpperCase(), W / 2, kw ? 70 : 90);
    c.fillStyle = "#e8561e"; c.font = (kw ? 110 : 130) + "px " + FONT_NAGL; c.fillText("DZIĘKUJEMY", W / 2, kw ? 170 : 210);
    c.fillStyle = "#07070a"; tekstWSzer(c, firma, W / 2, kw ? 250 : 310, W - 160, FONT_NAGL, kw ? 80 : 96);
    var co = { sponsor: "sponsor kilometrów tej ulicy", odcinek: "opiekun odcinka drogi", budynek: "firma na ulicy", druzyna: "drużyna, która biegnie z nami" }[dane.sposob] || "firma na ulicy";
    c.fillStyle = "#3a1d0a"; c.font = "500 " + (kw ? 28 : 32) + "px " + FONT_TEKST; c.fillText(co, W / 2, kw ? 300 : 365);
    /* liczby ulicy z publicznego licznika */
    var yl = kw ? 412 : 456, kol = [W / 2 - 320, W / 2, W / 2 + 320], wart = [km(u.suma_km) + " km", liczba(u.pct, 1) + " %", odmiana(u.firmy_n, ["firma", "firmy", "firm"]).split(" ")[0]], pod = ["zbudowane", "celu " + km(u.cel_km) + " km", forma(u.firmy_n, ["firma", "firmy", "firm"]) + " na ulicy"];
    kol.forEach(function (x, i) { prost(c, x - 140, yl - 70, 280, 130, 20); c.fillStyle = "rgba(255,247,230,.92)"; c.fill(); c.strokeStyle = "#5a2e0e"; c.lineWidth = 3; c.stroke(); c.fillStyle = "#07070a"; c.font = "64px " + FONT_NAGL; c.fillText(wart[i], x, yl + 2); c.fillStyle = "#7a4a1e"; c.font = "600 20px " + FONT_TEKST; c.fillText(pod[i], x, yl + 40); });
    if (dane.sposob === "sponsor" && dane.stawka_gr) { c.fillStyle = "#fff7e6"; prost(c, 380, yl + 70, 560, 54, 14); c.fill(); c.strokeStyle = "#5a2e0e"; c.lineWidth = 3; c.stroke(); c.fillStyle = "#3a1d0a"; c.font = "600 22px " + FONT_TEKST; c.fillText("każdy km ulicy dokłada " + dane.stawka_gr + " gr na zbiórkę", 660, yl + 105); }
    /* dół: zdanie o pieniądzach i podpis */
    c.fillStyle = "#fff7e6"; ["Wpłaty idą wyłącznie przez organizację prowadzącą zbiórkę.", "BiegaMy liczy kilometry."].forEach(function (t, i) { tekstWSzer(c, t, W / 2, H - (kw ? 108 : 128) + i * (kw ? 30 : 36), W - 100, FONT_TEKST, kw ? 22 : 26, 600); });   // dwa wiersze: jeden wychodził poza grafikę z obu stron
    c.textAlign = "left"; c.fillStyle = "#fff7e6"; c.font = "600 28px " + FONT_TEKST; c.fillText("BiegaMy", 70, H - 28); c.textAlign = "right"; c.font = "500 22px " + FONT_TEKST; c.fillText(dataPolska(new Date()), W - 70, H - 28);
    if (u.przyklad) { c.save(); c.translate(W - 150, kw ? 60 : 80); c.rotate(-0.12); c.font = "800 32px " + FONT_TEKST; var sw = c.measureText("PRZYKŁAD").width + 40; prost(c, -sw / 2, -26, sw, 52, 10); c.fillStyle = "#b8520f"; c.fill(); c.strokeStyle = "#fff7e6"; c.lineWidth = 4; c.stroke(); c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("PRZYKŁAD", 0, 2); c.restore(); }
    return k;
  }

  /* ── SCENA „KAWAŁEK ULICY” (kolor najpierw): domek, wieżowiec, mur, tabliczka odcinka, licznik w nakładce ─────────────────────────── */
  var CSS = ".fs{position:relative;overflow:hidden;background:linear-gradient(#9fd0ee,#dceefb 58%,#86ad55 58%,#5f8a3a);user-select:none;-webkit-user-select:none}" +
    ".fs-swiat{position:absolute;inset:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}.fs-swiat::-webkit-scrollbar{display:none}.fs-tresc{position:relative;height:100%}" +
    ".fs-wzgorza{position:absolute;left:0;right:0;bottom:36%;height:34%;background:0 100%/700px 100% repeat-x}.fs-laka{position:absolute;left:0;right:0;top:64%;bottom:0;background:linear-gradient(#86ad55,#5f8a3a)}" +
    ".fs-droga{position:absolute;left:0;bottom:11%;height:24%;background:#3a3d44 0 100%/auto 100% repeat-x;border-top:2px solid #2a2c31}.fs-droga--szutr{background:repeating-linear-gradient(90deg,#9a7b4a 0 18px,#8c6d3f 18px 36px);border-top:2px dashed #fff7e6;opacity:.85}" +
    ".fs-przod{position:absolute;left:0;right:0;bottom:0;height:16%;background:0 100%/380px 100% repeat-x}.fs-el{position:absolute;bottom:34%;display:block;filter:drop-shadow(0 3px 2px rgba(60,30,0,.35))}" +
    ".fs-dom{position:absolute;bottom:34%;text-align:center}.fs-dom img{display:block;width:100%;height:auto;filter:drop-shadow(0 3px 2px rgba(60,30,0,.35))}" +
    ".fs-szyld{position:absolute;left:50%;transform:translateX(-50%);background:#fff7e6;color:#4a2408;border:2px solid #5a2e0e;border-radius:8px;padding:4px 8px;font:800 11px/1.1 Inter,sans-serif;white-space:nowrap;box-shadow:0 2px 0 #5a2e0e;max-width:150px;overflow:hidden;text-overflow:ellipsis}" +
    ".fs-tablica{position:absolute;left:50%;transform:translateX(-50%);width:62%;aspect-ratio:1;background:#1e2230;border:3px solid #fff7e6;border-radius:6px;display:grid;place-items:center;color:#fff7e6;font:800 12px/1.1 Inter,sans-serif;text-align:center;padding:4px;box-shadow:0 3px 0 #5a2e0e}" +
    ".fs-tabliczka{position:absolute;bottom:35%;width:118px;text-align:center}.fs-tabliczka i{display:block;width:6px;height:46px;margin:0 auto;background:#7a5230;border:2px solid #3a1d0a;border-radius:3px}" +
    ".fs-tabliczka b{position:absolute;left:0;right:0;top:-34px;background:#2f6b3a;color:#fff7e6;border:2px solid #3a1d0a;border-radius:8px;padding:5px 6px;font:800 10px/1.15 Inter,sans-serif;box-shadow:0 2px 0 #1e4626}.fs-tabliczka b small{display:block;font-weight:600;color:#c8ebc9;font-size:9px}" +
    ".fs-mur{position:absolute;bottom:34%;display:flex;flex-wrap:wrap;align-content:flex-end;gap:3px;padding:4px;background:#8c4a2a;border:2px solid #3a1d0a;border-radius:6px 6px 0 0}.fs-cegla{background:#c8553d;color:#fff7e6;border:1px solid #3a1d0a;border-radius:3px;font:800 9px/1 Inter,sans-serif;padding:4px 6px;white-space:nowrap}.fs-cegla--zlota{background:#f2b32a;color:#3a1d0a}.fs-cegla--pusta{min-width:24px}" +
    ".fs-hud{position:absolute;left:10px;top:10px;display:flex;gap:6px;flex-wrap:wrap;pointer-events:none}.fs-chip{background:rgba(7,7,10,.78);color:#fff7e6;border-radius:10px;padding:6px 9px;font:600 12px/1.15 Inter,sans-serif;backdrop-filter:blur(4px)}.fs-chip b{font:400 20px/1 'Bebas Neue',Impact,sans-serif;letter-spacing:.03em;display:block;color:#ffb27a}" +
    ".fs-chip--sponsor{background:#2f6b3a;color:#fff;font:700 12px/1.15 Inter,sans-serif;align-self:flex-start}.fs-chip--przyklad{background:#b8520f;color:#fff;font:800 9px/1 Inter,sans-serif;letter-spacing:.14em;padding:7px 8px;align-self:flex-start}" +
    ".fs-wskaz{position:absolute;right:10px;bottom:10px;color:#fff7e6;font:600 11px/1 Inter,sans-serif;background:rgba(7,7,10,.6);padding:7px 9px;border-radius:8px;pointer-events:none}";
  function wstrzyknijCss() { if (g.document.getElementById("bm-firmy-scena-css")) return; var st = g.document.createElement("style"); st.id = "bm-firmy-scena-css"; st.textContent = CSS; g.document.head.appendChild(st); }
  function el(tag, klasa, rodzic, tekst) { var n = g.document.createElement(tag); if (klasa) n.className = klasa; if (tekst != null) n.textContent = tekst; if (rodzic) rodzic.appendChild(n); return n; }
  var _zrodlo = null;
  function adres(src) { return _zrodlo ? (_zrodlo(src) || src) : src; }
  function obraz(src, klasa, rodzic, lewo, szer) { var im = el("img", klasa, rodzic); im.alt = ""; im.decoding = "async"; im.draggable = false; im.setAttribute("data-plik", src); im.src = adres(src); im.style.left = lewo + "px"; im.style.width = szer + "px"; return im; }
  function tlo(n, src) { n.style.backgroundImage = "url(\"" + adres(src) + "\")"; return n; }
  var IMIONA = ["Ania", "Bartek", "Ewa", "Franek", "Gosia", "Igor", "Kuba", "Lena", "Olek", "Tosia", "Wojtek", "Zosia"];
  /**
   * opcje: { ulica (z licznika), firma (nazwa z pola), sposob, stawka_gr, wysokosc, zrodlo }. Droga rośnie z km ulicy; domek i wieżowiec z szyldem/tablicą firmy; tabliczka odcinka; mur; licznik w nakładce.
   */
  function scena(kontener, opcje) {
    if (!kontener) return null;
    var o = opcje || {}, u = o.ulica || ULICA_PRZYKLAD, firma = nazwaFirmy(o.firma), sp = o.sposob || "sponsor";
    _zrodlo = typeof o.zrodlo === "function" ? o.zrodlo : null;
    wstrzyknijCss();
    while (kontener.firstChild) kontener.removeChild(kontener.firstChild);
    var sc = el("div", "fs", kontener); sc.style.height = (o.wysokosc || 250) + "px";
    var swiat = el("div", "fs-swiat", sc), tresc = el("div", "fs-tresc", swiat), dl = 1300, proc = procent(u.suma_km, u.cel_km);
    tresc.style.width = dl + "px";
    tlo(el("div", "fs-wzgorza", tresc), "assets/ulica/wzgorza.webp"); el("div", "fs-laka", tresc);
    var szer = Math.max(300, Math.round(dl * Math.max(proc, 12) / 100)), droga = tlo(el("div", "fs-droga", tresc), "assets/ulica/droga.webp"); droga.style.width = szer + "px";
    if (proc < 100) { var szutr = el("div", "fs-droga fs-droga--szutr", tresc); szutr.style.left = szer + "px"; szutr.style.width = (dl - szer) + "px"; }
    [[20, 60], [780, 70], [1180, 56]].forEach(function (d) { obraz("assets/ulica/drzewo.webp", "fs-el", tresc, d[0], d[1]).style.bottom = "30%"; });
    [[350, 16], [980, 16]].forEach(function (d) { obraz("assets/ulica/latarnia.webp", "fs-el", tresc, d[0], d[1]); });
    /* domek firmy z szyldem */
    var dom = el("div", "fs-dom", tresc); dom.style.left = "110px"; dom.style.width = "120px";
    var imD = el("img", "", dom); imD.alt = ""; imD.decoding = "async"; imD.setAttribute("data-plik", "assets/ulica/domek-1.webp"); imD.src = adres("assets/ulica/domek-1.webp");
    var sz = el("span", "fs-szyld", dom, firma); sz.style.top = "36%";
    /* wieżowiec z tablicą (logo = nazwa firmy w kolorze, bo w pokazie nie ma pliku) */
    var wie = el("div", "fs-dom", tresc); wie.style.left = "262px"; wie.style.width = "74px";
    var imW = el("img", "", wie); imW.alt = ""; imW.decoding = "async"; imW.setAttribute("data-plik", "assets/ulica/wiezowiec.webp"); imW.src = adres("assets/ulica/wiezowiec.webp");
    var tb = el("div", "fs-tablica", wie, firma); tb.style.top = "17%";
    /* tabliczka opiekuna odcinka przy drodze */
    var od = odcinki(u), tab = el("div", "fs-tabliczka", tresc); tab.style.left = Math.max(380, Math.min(dl - 130, szer + 10)) + "px";   // za budynkami, nie na domku
    var tabB = el("b", "", tab, "Odcinek " + od.biezacy + " · " + firma); el("small", "", tabB, KM_NA_ODCINEK + " km · opiekun"); el("i", "", tab);
    /* mur */
    var mur = el("div", "fs-mur", tresc); mur.style.left = "540px"; mur.style.width = "200px";
    for (var i = 0; i < 7; i++) el("span", "fs-cegla" + (i % 5 === 2 ? " fs-cegla--zlota" : "") + (i % 4 === 3 ? " fs-cegla--pusta" : ""), mur, i % 4 === 3 ? "" : IMIONA[i]);
    el("span", "fs-cegla", mur, "+" + 60);
    tlo(el("div", "fs-przod", tresc), "assets/ulica/pierwszy-plan.webp");
    var hud = el("div", "fs-hud", sc);
    var c1 = el("div", "fs-chip", hud); el("b", "", c1, km(u.suma_km) + " km"); c1.appendChild(g.document.createTextNode("z " + km(u.cel_km) + " km"));
    var c2 = el("div", "fs-chip", hud); el("b", "", c2, liczba(u.pct, 1) + " %"); c2.appendChild(g.document.createTextNode("celu ulicy"));
    if (sp === "sponsor" && o.stawka_gr) el("div", "fs-chip fs-chip--sponsor", hud, "każdy km dokłada " + o.stawka_gr + " gr · " + firma);
    if (u.przyklad) el("div", "fs-chip fs-chip--przyklad", hud, "PRZYKŁAD");
    el("div", "fs-wskaz", sc, "przesuń ›");
    return sc;
  }

  g.BM_FIRMY_MIASTO = { BAZA: BAZA, SLUG: SLUG, STRONA_AKCJI: STRONA_AKCJI, KLUCZ_PAMIECI: KLUCZ_PAMIECI, POLA_LICZNIKA: POLA_LICZNIKA, KM_NA_ODCINEK: KM_NA_ODCINEK, STAWKI_GR: STAWKI_GR, PROGI_TRANSZ: PROGI_TRANSZ, ODMOWA: ODMOWA, NIE_KUPUJE: NIE_KUPUJE, SPOSOBY: SPOSOBY, DRUZYNY_PRZYKLAD: DRUZYNY_PRZYKLAD, ULICA_PRZYKLAD: ULICA_PRZYKLAD,
    esc: esc, liczba: liczba, km: km, zl: zl, forma: forma, odmiana: odmiana, procent: procent, dataPolska: dataPolska, nazwaFirmy: nazwaFirmy, ulicaZLicznika: ulicaZLicznika, zapamietaj: zapamietaj, odczytaj: odczytaj, pobierzUlice: pobierzUlice,
    kalkulatorSponsora: kalkulatorSponsora, odcinki: odcinki, rankingDruzyn: rankingDruzyn, deklaracja: deklaracja, podziekowanie: podziekowanie, tekstWSzer: tekstWSzer, scena: scena };
})(typeof globalThis !== "undefined" ? globalThis : window);
