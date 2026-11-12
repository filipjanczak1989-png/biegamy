// BIEG WIRTUALNY Z PRAWDZIWYMI ZAPISAMI (etap 1, 12.11.2026). Plik BEZ import/export (globalThis.BM_BIEG_REAL), jak js/akcja.mjs: <script src> w bieg.html, import w testach.
// Czyste funkcje strony biegu: stan strony z licznika, sesji i własnych zapisów; teksty; walidacja imienia; numer startowy i dyplom na canvasie w dwóch wersjach
// (dorosły z czasem, dziecko bez czasu i ze „swoim dystansem”); szkic odznaki zwykłej i złotej jako SVG. Dane TYLKO z licznika (pole `bieg`) i z funkcji
// akcja_bieg_* przez window.sb; imię dziecka, na które jest zbiórka, nigdy w tym pliku (nazwa biegu przychodzi z bazy). Bez wpisowego; kwot nie sprawdzamy i nie pokazujemy.
// MIEJSCA NA TEKSTY: regulamin, oświadczenie rodzica, treść zgód i dopisek do polityki prywatności przychodzą od Filipa po 18.11 (stałe MIEJSCE_* niżej); do tego czasu strona pokazuje
// oznaczone zaślepki i blokuje zapis na produkcji, dopóki `regulamin_wersja` biegu nie ma tekstu (TEKSTY_GOTOWE = false).
(function (g) {
  "use strict";
  var ROLE = { inicjator: "Inicjator", inicjator_opis: "opiekun dziecka albo organizacja w jego imieniu. Bieg odbywa się z jego inicjatywy i za jego zgodą.", operator: "Operator", operator_opis: "BiegaMy. Prowadzi zapisy, liczy kilometry, wydaje numery i dyplomy, nie przyjmuje żadnych wpłat." };
  var ZASADY = { wiek_konta: 16, limit_dzieci: 6, max_zapisow_ja: 3, dystanse: [5, 10], wynik_do_dni: 2, ukonczyli_na_strone: 50 };
  /* ── MIEJSCA NA TEKSTY (od Filipa po 18.11) ── każde zaczyna się od „[MIEJSCE NA TEKST”, test blizna-235 pilnuje, że strona je pokazuje, a nie udaje gotowych treści */
  var MIEJSCE_REGULAMIN = "[MIEJSCE NA TEKST: regulamin biegu, od Filipa po 18.11. Role: Inicjator (opiekun) i Operator (BiegaMy). Własne konto od 16 lat. Bez wpisowego. Czasy prywatne. Nic fizycznego.]";
  var MIEJSCE_OSWIADCZENIE = "[MIEJSCE NA TEKST: oświadczenie rodzica lub opiekuna przy dopisaniu dziecka, od Filipa po 18.11.]";
  var MIEJSCE_ZGODA_IMIE = "[MIEJSCE NA TEKST: zgoda na pokazanie imienia na liście „ukończyli”, od Filipa po 18.11.]";
  var MIEJSCE_ZGODA_IMIE_DZIECKA = "[MIEJSCE NA TEKST: zgoda na pokazanie imienia dziecka na liście „ukończyli”, od Filipa po 18.11.]";
  var MIEJSCE_ZGODA_EMAIL = "[MIEJSCE NA TEKST: zgoda na jeden e-mail przypominający dzień przed biegiem, od Filipa po 18.11.]";
  var MIEJSCE_POLITYKA = "[MIEJSCE NA TEKST: dopisek do polityki prywatności o biegu (dane uczestników, dzieci, e-mail, retencja 90 dni), od Filipa po 18.11.]";
  var TEKSTY_GOTOWE = false;   // po wstawieniu tekstów: true (test pilnuje spójności z MIEJSCE_*)
  var TEKSTY = {
    regulamin_pole: "Akceptuję regulamin biegu (wymagane)",
    zgoda_imie_pole: "Pokaż moje imię i numer na liście „ukończyli” (dobrowolne)",
    zgoda_email_pole: "Wyślij mi jeden e-mail przypominający dzień przed biegiem (dobrowolne)",
    oswiadczenie_pole: "Jestem rodzicem lub opiekunem tego dziecka i składam oświadczenie (wymagane)",
    zgoda_imie_dziecka_pole: "Pokaż imię dziecka na liście „ukończyli” (dobrowolne)",
    bez_wpisowego: "Udział jest bezpłatny. Nie ma wpisowego, medali ani pakietów. Kto chce, wspiera zbiórkę bezpośrednio u organizacji, która ją prowadzi; BiegaMy nic nie przyjmuje i nie widzi wpłat.",
    czasy_prywatne: "Lista pokazuje tylko tych, którzy ukończyli: imię (za zgodą), numer i dystans. Czasy są prywatne, widać je tylko na własnym dyplomie. Bez rankingu.",
    dzieci: "Dziecko dopisuje rodzic z własnego konta: samo imię, bez konta dziecka. Dziecko biegnie albo idzie swój dystans, dostaje numer i dyplom bez czasu.",
    wesprzyj_pod: "Wpłata idzie w całości do organizacji prowadzącej zbiórkę, poza BiegaMy. Kwoty nie sprawdzamy i nigdzie nie pokazujemy."
  };

  /* ── POMOCNICZE ── */
  function esc(s) { return g.escapeHtml ? g.escapeHtml(String(s == null ? "" : s)) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function liczba(n, miejsc) {
    n = Number(n); if (!isFinite(n)) n = 0;
    var m = miejsc == null ? 0 : miejsc, t = (Math.round(Math.abs(n) * Math.pow(10, m)) / Math.pow(10, m)).toFixed(m), cz = t.split("."), ul = (cz[1] || "").replace(/0+$/, "");
    return (n < 0 ? "-" : "") + cz[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (ul ? "," + ul : "");
  }
  function km(x) { var n = Number(x) || 0; return liczba(n, n > 0 && n < 10 ? 1 : 0); }
  function forma(n, f) { n = Math.abs(Math.round(Number(n) || 0)); var r = n % 10, s = n % 100; return n === 1 ? f[0] : r >= 2 && r <= 4 && (s < 12 || s > 14) ? f[1] : f[2]; }
  function odmiana(n, f) { return liczba(n) + " " + forma(n, f); }
  function p2(x) { return String(x).padStart(2, "0"); }
  function czas(s) { s = Math.max(0, Math.round(Number(s) || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sek = s % 60; return h ? h + ":" + p2(m) + ":" + p2(sek) : m + ":" + p2(sek); }
  function tempo(s, kmDyst) { if (!(kmDyst > 0) || !(s > 0)) return ""; var t = Math.round(s / kmDyst), m = Math.floor(t / 60); return m + ":" + p2(t % 60) + " /km"; }
  var MIESIACE = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  function dataPolska(d) { d = d instanceof Date ? d : new Date(d); return isFinite(d.getTime()) ? d.getDate() + " " + MIESIACE[d.getMonth()] + " " + d.getFullYear() : ""; }
  function dataZIso(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null; }
  /** „5–6.12.2026”; na przełomie miesiąca „30.11–1.12.2026”; roku „31.12.2026–1.1.2027”. */
  function zakresDni(od, doIso) {
    var a = dataZIso(od), b = dataZIso(doIso || od); if (!a || !b) return "";
    var mies = function (x) { return (x.getMonth() + 1) + "." + x.getFullYear(); };
    if (a.getTime() === b.getTime()) return a.getDate() + "." + mies(a);
    if (a.getFullYear() !== b.getFullYear()) return a.getDate() + "." + mies(a) + "–" + b.getDate() + "." + mies(b);
    if (a.getMonth() !== b.getMonth()) return a.getDate() + "." + (a.getMonth() + 1) + "–" + b.getDate() + "." + mies(b);
    return a.getDate() + "–" + b.getDate() + "." + mies(a);
  }
  function zakresSlowny(od, doIso) { var a = dataZIso(od), b = dataZIso(doIso || od); if (!a || !b) return ""; return a.getDate() + (a.getMonth() === b.getMonth() ? "" : " " + MIESIACE[a.getMonth()]) + "–" + b.getDate() + " " + MIESIACE[b.getMonth()]; }
  var RE_IMIE = /^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+(-[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+)?$/;
  /** Imię jak w bazie (CHECK akcja_bieg_jedno_imie): jedno słowo 2–20 liter, opcjonalny łącznik; pierwsza wielka. Nie przechodzi: "" */
  function ladneImie(t) {
    var s = String(t == null ? "" : t).trim().replace(/\s+/g, " ");
    if (s.length < 2 || s.length > 20 || !RE_IMIE.test(s)) return "";
    return s.split("-").map(function (cz) { return cz.charAt(0).toLocaleUpperCase("pl-PL") + cz.slice(1).toLocaleLowerCase("pl-PL"); }).join("-");
  }
  function imieZProfilu(fullName) { return ladneImie(String(fullName || "").trim().split(/\s+/)[0] || ""); }
  function bezRuchu() { try { return !!(g.matchMedia && g.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } }

  /* ── FAZA I STAN STRONY ── */
  var FAZY = {
    szkic: { chip: "WKRÓTCE", klasa: "bw-chip--wkrotce", zdanie: "Zapisy ruszą niebawem. Wróć tutaj za kilka dni." },
    zapisy: { chip: "ZAPISY OTWARTE", klasa: "bw-chip--trwa", zdanie: "Zapisy trwają. Dołącz, zanim ruszy weekend biegu." },
    trwa: { chip: "BIEG TRWA", klasa: "bw-chip--trwa", zdanie: "Weekend biegu. Możesz się jeszcze zapisać i pobiec dziś." },
    wyniki: { chip: "DOPISYWANIE WYNIKÓW", klasa: "bw-chip--wyniki", zdanie: "Weekend biegu za nami. Wyniki i spóźnione zapisy przyjmujemy jeszcze przez dwa dni." },
    zakonczony: { chip: "ZAKOŃCZONY", klasa: "bw-chip--koniec", zdanie: "Bieg zakończony. Dziękujemy wszystkim, którzy pobiegli i poszli." }
  };
  function faza(bieg) { return bieg && FAZY[bieg.faza] ? bieg.faza : "szkic"; }
  function fazaInfo(bieg) { return FAZY[faza(bieg)]; }
  /** Zapisy (siebie i dzieci) otwarte w fazach zapisy, trwa i wyniki, czyli do wynik_do (przegląd 12.11). */
  function zapisyOtwarte(bieg) { var f = faza(bieg); return f === "zapisy" || f === "trwa" || f === "wyniki"; }
  /**
   * Stan strony: 'wkrotce' (brak biegu w liczniku), 'niezalogowany', 'przed' (konto bez zapisu), 'po' (zapisany), 'dzieci' (zapisany z dziećmi albo same dzieci), 'zamkniete' (po zapisach, bez zapisu).
   * moi = odpowiedź akcja_bieg_moi (własne wiersze, bez wycofanych). Zwraca też ja i dzieci.
   */
  function stanStrony(bieg, sesja, moi) {
    var lista = Array.isArray(moi) ? moi : [], ja = null, dzieci = [];
    lista.forEach(function (u) { if (u.rodzaj === "ja" && !ja) ja = u; else if (u.rodzaj === "dziecko") dzieci.push(u); });
    if (!bieg || !bieg.slug) return { stan: "wkrotce", ja: null, dzieci: [] };
    if (!sesja) return { stan: "niezalogowany", ja: null, dzieci: [] };
    if (dzieci.length) return { stan: "dzieci", ja: ja, dzieci: dzieci };
    if (ja) return { stan: "po", ja: ja, dzieci: [] };
    return { stan: zapisyOtwarte(bieg) ? "przed" : "zamkniete", ja: null, dzieci: [] };
  }
  function mozeDopisacDziecko(bieg, dzieci) { return zapisyOtwarte(bieg) && (dzieci || []).length < Math.min(ZASADY.limit_dzieci, Number(bieg && bieg.limit_dzieci) || ZASADY.limit_dzieci); }

  /* ── HTML: liczby, ukończyli, wsparcie ── */
  function liczbaHtml(duze, male) { return '<div class="bw-liczba"><b>' + esc(duze) + '</b><span>' + esc(male) + '</span></div>'; }
  function liczbyHtml(bieg) {
    var z = Number(bieg.zapisani) || 0, d = Number(bieg.dzieci) || 0, u = Number(bieg.ukonczyli_n) || 0, na = bieg.zapisani_na || {};
    return liczbaHtml(liczba(z), forma(z, ["zapisana osoba", "zapisane osoby", "zapisanych osób"])) + liczbaHtml(liczba(d), forma(d, ["dziecko", "dzieci", "dzieci"])) +
      liczbaHtml(liczba(u), forma(u, ["ukończył(a)", "ukończyły", "ukończyło"])) + '<p class="bw-drobne bw-liczby-pod">5 km: ' + esc(liczba(na["5"] || 0)) + ' · 10 km: ' + esc(liczba(na["10"] || 0)) + ' · dzieci: swój dystans</p>';
  }
  /** Wiersz listy „ukończyli”: imię za zgodą (inaczej „bez imienia”), numer, dystans; bez czasu, bez rankingu. */
  function wierszUkonczyl(u, moj) {
    var dyst = u.dystans_km != null ? km(u.dystans_km) + " km" : "ukończył(a)";
    return '<li class="bw-wiersz' + (moj ? " bw-wiersz--ty" : "") + '"><span class="bw-nr">' + esc(u.numer) + '</span><span class="bw-imie">' + (u.imie ? esc(u.imie) : '<i class="bw-bez">bez imienia</i>') + (u.dziecko ? ' <small>dziecko</small>' : "") + (moj ? ' <i>Ty</i>' : "") + '</span><span class="bw-dyst">' + esc(dyst) + '</span></li>';
  }
  /** Lista z osobnej funkcji (EF bieg-ukonczyli, ta sama droga co licznik): dane = { razem, od, lista }, strona dokleja kolejne porcje; „Pokaż więcej” rysuje strona. */
  function ukonczyliHtml(dane, mojeNumery) {
    var l = Array.isArray(dane && dane.lista) ? dane.lista : [], moje = mojeNumery || [], razem = Number(dane && dane.razem) || l.length;
    if (!l.length) return '<p class="bw-drobne">Jeszcze nikt nie dopisał wyniku. Lista zapełni się po weekendzie biegu.</p>';
    return '<ol class="bw-lista">' + l.map(function (u) { return wierszUkonczyl(u, moje.indexOf(Number(u.numer)) >= 0); }).join("") + '</ol>' +
      (razem > l.length ? '<button type="button" class="bw-przycisk bw-przycisk--cichy" data-ukonczyli-wiecej="' + l.length + '">Pokaż więcej (' + esc(liczba(razem - l.length)) + ')</button>' : "");
  }
  /** „Wesprzyj zbiórkę”: trzy podpowiedzi (pierwsza wyróżniona), każda jest zwykłym linkiem do oficjalnej zbiórki. Link przez safeExternalHref; bez linku nic. */
  function wsparcieHtml(bieg, link) {
    var href = g.safeExternalHref ? g.safeExternalHref(link || "") : (/^https:\/\//.test(String(link || "")) ? link : "");
    if (!href) return "";
    var kwoty = Array.isArray(bieg && bieg.wsparcie_kwoty_zl) && bieg.wsparcie_kwoty_zl.length ? bieg.wsparcie_kwoty_zl : [20, 30, 50];
    return '<div class="bw-kwoty">' + kwoty.map(function (k, i) { return '<a class="bw-kwota' + (i === 0 ? " bw-kwota--glowna" : "") + '" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" data-kwota="' + esc(k) + '"><b>' + esc(liczba(k)) + ' zł</b>' + (i === 0 ? '<small>podpowiedź</small>' : "") + '</a>'; }).join("") +
      '<a class="bw-kwota bw-kwota--inna" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">inna kwota</a></div><p class="bw-drobne">' + esc(TEKSTY.wesprzyj_pod) + '</p>';
  }

  /* ── CANVAS: numer startowy i dyplom w dwóch wersjach ── */
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
  function losowy(ziarno) { var a = ziarno >>> 0; return function () { a = (a + 0x6d2b79f5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function konfettiPunkty(w, h, ile, los, wykluczenia) {
    var kolory = ["#e8561e", "#f2b32a", "#6f9e3e", "#d9482b", "#ff8a3d", "#3d5a99"], ZAPAS = 14, out = [], wyk = wykluczenia || [];
    var wPolu = function (x, y) { for (var i = 0; i < wyk.length; i++) { var r = wyk[i]; if (x >= r[0] - ZAPAS && x <= r[0] + r[2] + ZAPAS && y >= r[1] - ZAPAS && y <= r[1] + r[3] + ZAPAS) return true; } return false; };
    for (var i = 0; i < ile; i++) { var x = 0, y = 0, ok = false; for (var p = 0; p < 12 && !ok; p++) { x = los() * w; y = los() * h; ok = !wPolu(x, y); } if (!ok) continue; out.push({ x: x, y: y, kat: los() * Math.PI, dl: 12 + los() * 10, kolor: kolory[Math.floor(los() * kolory.length)], alfa: 0.5 + los() * 0.4 }); }
    return out;
  }
  function konfettiTlo(c, w, h, ile, los, wyk) { konfettiPunkty(w, h, ile, los, wyk).forEach(function (k) { c.save(); c.translate(k.x, k.y); c.rotate(k.kat); c.fillStyle = k.kolor; c.globalAlpha = k.alfa; c.fillRect(-6, -3, k.dl, 6); c.restore(); }); }
  function laur(c, cx, cy, r, kolor, obrys) {
    c.save(); c.translate(cx, cy); c.strokeStyle = obrys || "#35561f"; c.lineWidth = Math.max(1, r / 60); c.fillStyle = kolor || "#6f9e3e";
    [-1, 1].forEach(function (strona) { for (var i = 0; i < 9; i++) { var kat = Math.PI / 2 + strona * (0.25 + i * 0.17), px = Math.cos(kat) * r, py = Math.sin(kat) * r * 0.95, sk = r * (0.11 + (i % 3) * 0.012); c.save(); c.translate(px, py); c.rotate(kat + strona * 1.1); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(sk * 0.9, -sk * 0.5, sk * 2.2, 0); c.quadraticCurveTo(sk * 0.9, sk * 0.5, 0, 0); c.closePath(); c.fill(); c.stroke(); c.restore(); } });
    c.restore();
  }
  function wstega(c, x, y, w, h, kolor, tekst) {
    c.save(); c.fillStyle = kolor; c.strokeStyle = "#3a1d0a"; c.lineWidth = h * 0.06;
    c.fillStyle = "#b8440f"; c.beginPath(); c.moveTo(x, y + h * 0.15); c.lineTo(x - h * 0.9, y + h * 0.15); c.lineTo(x - h * 0.55, y + h * 0.6); c.lineTo(x - h * 0.9, y + h * 1.05); c.lineTo(x, y + h * 1.05); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x + w, y + h * 0.15); c.lineTo(x + w + h * 0.9, y + h * 0.15); c.lineTo(x + w + h * 0.55, y + h * 0.6); c.lineTo(x + w + h * 0.9, y + h * 1.05); c.lineTo(x + w, y + h * 1.05); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = kolor; c.beginPath(); c.rect(x, y, w, h); c.fill(); c.stroke();
    if (tekst) { c.fillStyle = "#fff7e6"; c.textAlign = "center"; c.textBaseline = "middle"; c.font = h * 0.52 + "px " + FONT_NAGL; c.fillText(tekst, x + w / 2, y + h / 2 + h * 0.03); }
    c.restore();
  }
  function znakBiegamy(c, x, y, rozmiar, kolor) { c.save(); c.fillStyle = kolor || "#f0ede8"; c.textAlign = "left"; c.textBaseline = "alphabetic"; c.font = "600 " + rozmiar + "px " + FONT_TEKST; c.fillText("BiegaMy", x, y); c.restore(); }
  function rysujObraz(c, im, x, y, w, h) { try { if (im && (im.naturalWidth > 0 || im.width > 0)) { c.drawImage(im, x, y, w, h); return true; } } catch (e) {} return false; }
  function medalRysowany(c, cx, cy, r, zlota) {
    c.save(); c.fillStyle = zlota ? "#f2b32a" : "#c8553d"; c.strokeStyle = "#3a1d0a"; c.lineWidth = Math.max(2, r * 0.08);
    c.beginPath(); c.moveTo(cx - r * 0.55, cy - r * 1.9); c.lineTo(cx - r * 0.2, cy - r * 0.6); c.lineTo(cx + r * 0.2, cy - r * 0.6); c.lineTo(cx + r * 0.55, cy - r * 1.9); c.closePath(); c.fillStyle = "#e8561e"; c.fill(); c.stroke();
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = zlota ? "#f2b32a" : "#c8553d"; c.fill(); c.stroke();
    c.beginPath(); c.arc(cx, cy, r * 0.72, 0, Math.PI * 2); c.strokeStyle = zlota ? "#fff2c2" : "#fff7e6"; c.lineWidth = Math.max(1, r * 0.05); c.stroke();
    c.restore();
  }
  /** NUMER STARTOWY 1200×900. u: { imie, numer, rodzaj: 'ja'|'dziecko', dystans_km }, bieg: { nazwa, dzien_od, dzien_do }. obrazy: { brama }. adres: strona biegu (u dołu). Dziecko: „SWÓJ DYSTANS”. */
  function numerStartowy(u, bieg, obrazy, adres) {
    var W = 1200, H = 900, k = nowyCanvas(W, H), c = k.getContext("2d"), los = losowy(Number(u.numer) || 1), dziecko = u.rodzaj === "dziecko";
    c.fillStyle = "#fff7e6"; prost(c, 0, 0, W, H, 40); c.fill();
    c.fillStyle = "#f6e9cc"; c.globalAlpha = 0.5; for (var i = 0; i < 60; i++) c.fillRect(los() * W, los() * H, 3, 3); c.globalAlpha = 1;
    c.fillStyle = dziecko ? "#3d5a99" : "#e8561e"; prost(c, 0, 0, W, 150, 40); c.fill(); c.fillRect(0, 110, W, 40);
    c.fillStyle = "#fff7e6"; c.textAlign = "left"; c.textBaseline = "alphabetic"; tekstWSzer(c, String(bieg.nazwa || "Bieg wirtualny").toUpperCase(), 120, 98, 640, FONT_NAGL, 64);
    c.font = "600 26px " + FONT_TEKST; c.textAlign = "right"; c.fillText(zakresSlowny(bieg.dzien_od, bieg.dzien_do), W - 120, 92);
    [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]].forEach(function (p) { c.fillStyle = "#3a1d0a"; c.beginPath(); c.arc(p[0], p[1], 16, 0, Math.PI * 2); c.fill(); c.fillStyle = "#fff7e6"; c.beginPath(); c.arc(p[0], p[1], 10, 0, Math.PI * 2); c.fill(); });
    c.fillStyle = "#07070a"; c.textAlign = "center"; c.font = "380px " + FONT_NAGL; c.fillText(String(u.numer), W / 2, 560);
    c.fillStyle = dziecko ? "#3d5a99" : "#e8561e"; tekstWSzer(c, String(u.imie || "").toUpperCase(), W / 2, 660, 900, FONT_NAGL, 72);
    c.fillStyle = "#3a1d0a"; c.font = "600 30px " + FONT_TEKST; c.fillText(dziecko ? "SWÓJ DYSTANS · BIEG ALBO MARSZ" : km(u.dystans_km) + " KM · BIEG ALBO MARSZ", W / 2, 712);
    prost(c, 60, 750, W - 120, 90, 18); c.fillStyle = "#3b3b47"; c.fill();
    c.fillStyle = "#fff7e6"; for (var x = 90; x < W - 90; x += 52) c.fillRect(x, 772, 26, 46);
    c.fillStyle = dziecko ? "#3d5a99" : "#e8561e"; for (var x2 = 116; x2 < W - 90; x2 += 52) c.fillRect(x2, 772, 26, 46);
    if (!rysujObraz(c, obrazy && obrazy.brama, 870, 165, 280, 173)) { c.fillStyle = "#ff8a3d"; c.font = "40px " + FONT_NAGL; c.textAlign = "right"; c.fillText("START · META", W - 70, 230); }
    c.textAlign = "left"; c.fillStyle = "#3a1d0a"; c.font = "600 22px " + FONT_TEKST; c.fillText("bieg i marsz dla jednej zbiórki", 100, 200);   // zdanie o braku opłat tylko w tekście strony (najwyżej dwa razy): numer powtarza się przy każdym uczestniku
    c.font = "500 22px " + FONT_TEKST; c.fillText("wpłaty wyłącznie u organizacji prowadzącej zbiórkę", 100, 236);
    znakBiegamy(c, 100, 880, 28, "#3a1d0a"); c.fillStyle = "#7a4a1e"; c.textAlign = "right"; tekstWSzer(c, String(adres || "biegamy.run").replace(/^https?:\/\//, ""), W - 100, 880, 700, FONT_TEKST, 22, 500);
    return k;
  }
  /** DYPLOM 'telefon' 1080×1350 albo 'a4' 1754×1240. u: { imie, numer, rodzaj, wynik_s, wynik_dystans_km, dystans_km, dystans_wlasny_km, ukonczony_at, odznaka }. Dziecko: bez czasu, „swój dystans”. */
  function dyplom(u, bieg, format, obrazy) {
    var a4 = format === "a4", W = a4 ? 1754 : 1080, H = a4 ? 1240 : 1350, k = nowyCanvas(W, H), c = k.getContext("2d"), los = losowy(7), dziecko = u.rodzaj === "dziecko", zlota = u.odznaka === "zlota";
    var dyst = dziecko ? Number(u.dystans_wlasny_km) || 0 : Number(u.wynik_dystans_km || u.dystans_km) || 0, s = dziecko ? 0 : Number(u.wynik_s) || 0;
    var tlo = c.createLinearGradient(0, 0, 0, H); tlo.addColorStop(0, "#fffaf0"); tlo.addColorStop(1, "#f7e9cf"); c.fillStyle = tlo; c.fillRect(0, 0, W, H);
    var sx = a4 ? 0.82 : 1, cx = W / 2, y = a4 ? 150 : 200;
    var WYK = a4
      ? [[cx - 460, 80, 920, 40], [cx - 250, 128, 500, 125], [cx - 170, 272, 340, 38], [cx - 440, 316, 880, 104], [cx - 270, 440, 540, 40], [cx - 610, 490, 1220, 150], [cx - 180, 720, 360, 320], [150, H - 470, 330, 230], [W - 470, H - 480, 320, 180], [cx - 340, H - 150, 680, 80]]
      : [[cx - 460, 110, 920, 40], [cx - 300, 178, 600, 142], [cx - 210, 350, 420, 40], [cx - 440, 400, 880, 122], [cx - 320, 550, 640, 42], [cx - 450, 608, 900, 164], [cx - 170, 790, 340, 320], [100, H - 445, 320, 200], [W - 390, H - 530, 300, 180], [cx - 300, H - 160, 600, 90]];
    konfettiTlo(c, W, H, 90, los, WYK);
    c.strokeStyle = zlota ? "#f2b32a" : "#e8561e"; c.lineWidth = 10; prost(c, 36, 36, W - 72, H - 72, 28); c.stroke();
    c.strokeStyle = zlota ? "#e8561e" : "#f2b32a"; c.lineWidth = 3; prost(c, 56, 56, W - 112, H - 112, 20); c.stroke();
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillStyle = "#3a1d0a"; c.font = "600 " + Math.round(26 * sx) + "px " + FONT_TEKST; c.fillText("BIEG I MARSZ DLA JEDNEJ ZBIÓRKI", cx, a4 ? 110 : 140);
    c.fillStyle = "#e8561e"; c.font = Math.round(150 * sx) + "px " + FONT_NAGL; c.fillText("DYPLOM", cx, y + (a4 ? 90 : 110));
    c.fillStyle = "#3a1d0a"; c.font = "500 " + Math.round(30 * sx) + "px " + FONT_TEKST; c.fillText(dziecko ? "za ukończenie swojego dystansu" : "za ukończenie biegu", cx, y + (a4 ? 150 : 180));
    c.fillStyle = "#07070a"; tekstWSzer(c, u.imie || "", cx, y + (a4 ? 260 : 310), W - 240, FONT_NAGL, Math.round(130 * sx));
    c.fillStyle = "#3a1d0a"; c.font = "500 " + Math.round(34 * sx) + "px " + FONT_TEKST; tekstWSzer(c, String(bieg.nazwa || "Bieg wirtualny") + (dziecko ? " · swój dystans" : " · " + km(dyst) + " km"), cx, y + (a4 ? 320 : 380), W - 200, FONT_TEKST, Math.round(34 * sx), 500);
    var yy = y + (a4 ? 420 : 500), kol = a4 ? [cx - 420, cx, cx + 420] : [cx - 300, cx, cx + 300];
    var wart = dziecko ? ["ukończono", km(dyst) + " km", zakresSlowny(bieg.dzien_od, bieg.dzien_do)] : [s ? czas(s) : "ukończono", s && dyst ? tempo(s, dyst).replace(" /km", "") : km(dyst), zakresSlowny(bieg.dzien_od, bieg.dzien_do)];
    var pod = dziecko ? ["wynik", "swój dystans", "weekend biegu"] : [s ? "czas" : "wynik", s && dyst ? "tempo min/km" : "kilometry", "weekend biegu"];
    kol.forEach(function (x, i) {
      prost(c, x - (a4 ? 190 : 140), yy - (a4 ? 80 : 90), a4 ? 380 : 280, a4 ? 150 : 160, 22); c.fillStyle = "rgba(232,86,30,.08)"; c.fill(); c.strokeStyle = "#e8b48a"; c.lineWidth = 3; c.stroke();
      c.fillStyle = "#07070a"; tekstWSzer(c, wart[i], x, yy + (i === 2 ? 4 : 14), (a4 ? 380 : 280) - 36, FONT_NAGL, Math.round((i === 2 ? 44 : 78) * sx));
      c.fillStyle = "#7a4a1e"; c.font = "600 " + Math.round(22 * sx) + "px " + FONT_TEKST; c.fillText(pod[i], x, yy + (a4 ? 50 : 54));
    });
    var med = a4 ? [cx - 100, H - 500, 200, 260] : [cx - 100, H - 540, 200, 260];
    laur(c, med[0] + med[2] / 2, med[1] + med[3] * 0.62, a4 ? 160 : 150, zlota ? "#c99a2e" : "#6f9e3e", zlota ? "#7a5a10" : "#35561f");
    if (!rysujObraz(c, obrazy && (zlota ? obrazy.medalZloty : obrazy.medal), med[0], med[1], med[2], med[3])) medalRysowany(c, med[0] + med[2] / 2, med[1] + med[3] * 0.65, 78, zlota);
    wstega(c, cx - (a4 ? 260 : 220), H - (a4 ? 140 : 150), a4 ? 520 : 440, a4 ? 60 : 66, zlota ? "#c99a2e" : "#e8561e", zlota ? "ZŁOTA ODZNAKA · DZIĘKUJEMY" : "KILOMETRY BUDUJĄ ULICĘ");
    c.textAlign = "left"; c.fillStyle = "#3a1d0a"; c.font = "500 " + Math.round(22 * sx) + "px " + FONT_TEKST;
    c.fillText("Data: " + dataPolska(u.ukonczony_at ? new Date(u.ukonczony_at) : new Date()), a4 ? 160 : 110, H - (a4 ? 440 : 420));
    c.fillText("Numer startowy: " + u.numer, a4 ? 160 : 110, H - (a4 ? 404 : 384));
    znakBiegamy(c, a4 ? 160 : 110, H - (a4 ? 330 : 300), Math.round(34 * sx), "#07070a"); c.fillStyle = "#7a4a1e"; c.font = "500 " + Math.round(20 * sx) + "px " + FONT_TEKST; c.fillText(ROLE.operator + ": BiegaMy", a4 ? 160 : 110, H - (a4 ? 302 : 270));   // ta sama rola co na stronie (ROLE), bez własnego opisu
    var pole = a4 ? [W - 160 - 290, H - 470, 290, 160] : [W - 110 - 270, H - 520, 270, 160];
    c.setLineDash([12, 10]); c.strokeStyle = "#b08a52"; c.lineWidth = 3; prost(c, pole[0], pole[1], pole[2], pole[3], 16); c.stroke(); c.setLineDash([]);
    c.fillStyle = "#7a4a1e"; c.textAlign = "center"; c.font = "500 " + Math.round(20 * sx) + "px " + FONT_TEKST; c.fillText("tu znak Inicjatora", pole[0] + pole[2] / 2, pole[1] + pole[3] / 2 + 8);
    return k;
  }
  /** ODZNAKA jako SVG (szkic): 'zwykla' (ceglasty medal) albo 'zlota' (złoty medal z gwiazdkami). W środku IKONA ŚWIATA ULICY (dla tej ulicy koparka, assets/ulica/koparka.webp),
   *  żeby odznaki z różnych ulic różniły się od siebie (przegląd 12.11). Ikona tylko z assets/, nazwa biegu z bazy (escapowana). */
  var IKONA_SWIATA = "assets/ulica/koparka.webp";
  function odznakaSvg(rodzaj, opcje) {
    var o = opcje || {}, zlota = rodzaj === "zlota", kolor = zlota ? "#f2b32a" : "#c8553d", kolor2 = zlota ? "#d89a12" : "#9a3b27", podpis = o.podpis || (zlota ? "ZŁOTA" : "BIEG"), rozmiar = Number(o.rozmiar) || 120;
    var ikona = typeof o.ikona === "string" && /^assets\/[a-z0-9\/_-]+\.(webp|png|svg)$/i.test(o.ikona) ? o.ikona : IKONA_SWIATA, id = "bo-" + rodzaj + "-" + Math.abs(String(o.nazwa || "").length + (zlota ? 1 : 0));
    var tytul = esc(o.nazwa || "Odznaka biegu") + (zlota ? " (złota)" : "");
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 120 156" width="' + rozmiar + '" height="' + Math.round(rozmiar * 1.3) + '" role="img" aria-label="' + tytul + '">' +
      '<defs><linearGradient id="' + id + '-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + (zlota ? "#ffe08a" : "#e07a5f") + '"/><stop offset="1" stop-color="' + kolor + '"/></linearGradient><clipPath id="' + id + '-c"><circle cx="60" cy="100" r="33"/></clipPath></defs>' +
      '<path d="M38 2h18l-6 56H44z" fill="#e8561e" stroke="#3a1d0a" stroke-width="3" stroke-linejoin="round"/><path d="M64 2h18L72 58H60z" fill="#3d5a99" stroke="#3a1d0a" stroke-width="3" stroke-linejoin="round"/>' +
      '<circle cx="60" cy="100" r="50" fill="url(#' + id + '-g)" stroke="#3a1d0a" stroke-width="4"/><circle cx="60" cy="100" r="40" fill="' + (zlota ? "#fff6d6" : "#fff7e6") + '" stroke="' + (zlota ? "#b8860b" : "#9a3b27") + '" stroke-width="2.5"/>' +
      '<image href="' + esc(ikona) + '" x="27" y="67" width="66" height="66" preserveAspectRatio="xMidYMid meet" clip-path="url(#' + id + '-c)"/>' +
      (zlota ? '<path d="M60 52l2.6 5.4 6 .8-4.3 4.1 1.1 5.9-5.4-2.9-5.4 2.9 1.1-5.9-4.3-4.1 6-.8z" fill="#fff2c2" stroke="#7a5a10" stroke-width="1.5" stroke-linejoin="round"/><path d="M22 92l1.8 3.7 4 .5-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.5z" fill="#fff2c2" stroke="#7a5a10" stroke-width="1.2"/><path d="M98 92l1.8 3.7 4 .5-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.5z" fill="#fff2c2" stroke="#7a5a10" stroke-width="1.2"/>' : "") +
      '<rect x="22" y="126" width="76" height="18" rx="5" fill="' + kolor2 + '" stroke="#3a1d0a" stroke-width="2.5"/><text x="60" y="139" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="800" font-size="10" letter-spacing="1.5" fill="#fff7e6">' + esc(podpis) + '</text></svg>';
  }

  g.BM_BIEG_REAL = { ROLE: ROLE, ZASADY: ZASADY, TEKSTY: TEKSTY, TEKSTY_GOTOWE: TEKSTY_GOTOWE, FAZY: FAZY,
    MIEJSCE_REGULAMIN: MIEJSCE_REGULAMIN, MIEJSCE_OSWIADCZENIE: MIEJSCE_OSWIADCZENIE, MIEJSCE_ZGODA_IMIE: MIEJSCE_ZGODA_IMIE, MIEJSCE_ZGODA_IMIE_DZIECKA: MIEJSCE_ZGODA_IMIE_DZIECKA, MIEJSCE_ZGODA_EMAIL: MIEJSCE_ZGODA_EMAIL, MIEJSCE_POLITYKA: MIEJSCE_POLITYKA,
    esc: esc, liczba: liczba, km: km, forma: forma, odmiana: odmiana, czas: czas, tempo: tempo, dataPolska: dataPolska, zakresDni: zakresDni, zakresSlowny: zakresSlowny, ladneImie: ladneImie, imieZProfilu: imieZProfilu, bezRuchu: bezRuchu,
    faza: faza, fazaInfo: fazaInfo, zapisyOtwarte: zapisyOtwarte, stanStrony: stanStrony, mozeDopisacDziecko: mozeDopisacDziecko,
    liczbyHtml: liczbyHtml, wierszUkonczyl: wierszUkonczyl, ukonczyliHtml: ukonczyliHtml, wsparcieHtml: wsparcieHtml,
    numerStartowy: numerStartowy, dyplom: dyplom, odznakaSvg: odznakaSvg, IKONA_SWIATA: IKONA_SWIATA, konfettiPunkty: konfettiPunkty, tekstWSzer: tekstWSzer };
})(typeof globalThis !== "undefined" ? globalThis : window);
