// MIASTO DOBRA · WYZWANIE FIRM I SZKÓŁ: POKAZ DRUŻYN (11.11.2026, na spotkanie 18.11). Plik BEZ import/export (globalThis.BM_DRUZYNY), jak js/miasto-bieg.mjs.
// Druga forma akcji pokazana od A do Z: klasy (nauczyciel zakłada, uczniowie bez kont, nauczyciel wpisuje sumę kilometrów klasy; żadnych danych dzieci) i firmy (pracownicy
// z własnymi kontami; firma może dołożyć stawkę za kilometry swoich ludzi prosto na zbiórkę organizacji). Ranking tylko drużyn, w dwóch widokach: „kilometry razem”
// i „kilometry na osobę” (żeby mała klasa mogła wygrać z dużą firmą). Bez rankingu osób. Dane wymyślone, oznaczone PRZYKŁAD; liczby ulicy te same co karta „Ulica Szkolna”
// na mapie miasta (js/miasto.mjs). Atrapa: nic nie zapisuje w bazie i nic nie wysyła; jedyny zapis to stan pokazu w localStorage. Koder QR, tekstWSzer i konfetti z js/miasto-bieg.mjs
// (BM_BIEG), żeby dyplom drużyny miał te same reguły co dyplom biegu. Pieniądze idą wyłącznie przez organizację prowadzącą zbiórkę; BiegaMy nic nie przyjmuje.
(function (g) {
  "use strict";
  var KLUCZ_PAMIECI = "bm_druzyny_pokaz";
  var WYZWANIE = { id: "szkolna", przyklad: true, nazwa: "Ulica Szkolna", forma: "Wyzwanie szkół i firm", okres: { od: "3.11", do: "30.11", opis: "3–30 listopada, cztery tygodnie" },
    cel_km: 8000, suma_km: 3210, osoby_n: 260, druzyny_n: 14, cegly_n: 95, firmy_n: 4, klikniecia_n: 87 };
  /* 14 drużyn: 8 klas i 6 firm; sumy = 260 osób i 3 210 km jak na karcie miasta. Nazwy neutralne: klasy bez nazwy szkoły, firmy wymyślone. Stawka firmy = grosze za kilometr jej ludzi, na zbiórkę organizacji. */
  var DRUZYNY = [
    { id: "k4b", nazwa: "Klasa 4b", rodzaj: "klasa", osoby_n: 26, km: 410 }, { id: "k6a", nazwa: "Klasa 6a", rodzaj: "klasa", osoby_n: 24, km: 362 },
    { id: "k3c", nazwa: "Klasa 3c", rodzaj: "klasa", osoby_n: 19, km: 288 }, { id: "k7a", nazwa: "Klasa 7a", rodzaj: "klasa", osoby_n: 22, km: 395 },
    { id: "k5b", nazwa: "Klasa 5b", rodzaj: "klasa", osoby_n: 21, km: 301 }, { id: "k2a", nazwa: "Klasa 2a", rodzaj: "klasa", osoby_n: 18, km: 300 },
    { id: "k8b", nazwa: "Klasa 8b", rodzaj: "klasa", osoby_n: 25, km: 352 }, { id: "k1b", nazwa: "Klasa 1b", rodzaj: "klasa", osoby_n: 23, km: 258 },
    { id: "f1", nazwa: "Piekarnia na Rogu", rodzaj: "firma", osoby_n: 12, km: 96, stawka_gr: 20 }, { id: "f2", nazwa: "Biuro Zielone", rodzaj: "firma", osoby_n: 9, km: 71, stawka_gr: 10 },
    { id: "f3", nazwa: "Warsztat Dwa Koła", rodzaj: "firma", osoby_n: 15, km: 120, stawka_gr: 0 }, { id: "f4", nazwa: "Hurtownia Północ", rodzaj: "firma", osoby_n: 20, km: 150, stawka_gr: 50 },
    { id: "f5", nazwa: "Studio Kreska", rodzaj: "firma", osoby_n: 11, km: 61, stawka_gr: 0 }, { id: "f6", nazwa: "Apteka Pod Lipą", rodzaj: "firma", osoby_n: 15, km: 46, stawka_gr: 10 }
  ];
  var JAK = [
    { tytul: "Załóż drużynę", opis: "Nauczyciel zakłada klasę, pracownik albo szef zakłada firmę. Nazwa, rodzaj, liczba osób. Minuta.", obraz: "assets/ulica/domek-1.webp" },
    { tytul: "Zaproś ludzi linkiem", opis: "Link albo kod QR na tablicę w klasie lub w firmowej kuchni. Uczniowie nie zakładają kont; pracownicy mają własne.", obraz: "assets/ulica/tablica-start.webp" },
    { tytul: "Każdy biega albo chodzi u siebie", opis: "Bieg, spacer, marsz, nordic walking. Każdy tam, gdzie mieszka, kiedy ma czas. Liczą się kilometry, nie tempo.", obraz: "assets/ulica/budowniczy.webp" },
    { tytul: "Kilometry drużyny budują ulicę", opis: "Suma drużyn to droga na Ulicy Szkolnej. Ranking drużyn stoi na ulicy; wpłaty idą wyłącznie przez organizację prowadzącą zbiórkę.", obraz: "assets/ulica/droga.webp" }
  ];
  var RODZAJE = {
    klasa: { nazwa: "Klasa", kto: "zakłada nauczyciel", jak: "Uczniowie nie mają kont. Nauczyciel wpisuje sumę kilometrów klasy raz w tygodniu (z dzienniczków, zegarków, spacerów z rodzicami). BiegaMy nie zbiera żadnych danych dzieci: tylko nazwa klasy, liczba osób i suma kilometrów.", przycisk: "Dopisz kilometry klasy" },
    firma: { nazwa: "Firma", kto: "zakłada pracownik albo szef", jak: "Pracownicy mają własne konta i zapisują treningi jak zwykle; kilometry sumują się do drużyny. Firma może dołożyć stawkę za każdy kilometr swoich ludzi, prosto na zbiórkę organizacji. BiegaMy tych pieniędzy nie widzi.", przycisk: "Dodaj swój trening (pokaz)" }
  };
  var MATERIALY = [
    { id: "plakat", tytul: "Plakat wyzwania A4", opis: "Na tablicę w szkole i w firmie: nazwa, okres, kod QR do strony, cztery kroki.", przycisk: "Pobierz plakat" },
    { id: "nauczyciel", tytul: "Kartka dla nauczyciela", opis: "Jak założyć klasę, jak liczyć kilometry bez danych dzieci, co powiedzieć rodzicom.", przycisk: "Pokaż do druku" },
    { id: "firma", tytul: "Kartka dla firmy", opis: "Jak założyć drużynę, jak działa stawka za kilometr i dlaczego wpłata idzie prosto do organizacji.", przycisk: "Pokaż do druku" },
    { id: "csv", tytul: "Eksport drużyn (przykład)", opis: "Nazwa, rodzaj, liczba osób, kilometry. Bez osób.", przycisk: "Pobierz CSV" }
  ];
  var CHECKLISTA = ["Link do oficjalnej zbiórki organizacji działa", "Regulamin wyzwania zatwierdzony (bez danych dzieci w BiegaMy)", "Plakat i kartki sprawdzone przez organizację", "Osoba do kontaktu dla szkół i firm wskazana", "Ustalone, czy ranking „na osobę” jest widokiem głównym w szkołach"];

  /* ── POMOCNICZE ─────────────────────────────────────────────────────────── */
  function esc(s) { return g.escapeHtml ? g.escapeHtml(String(s == null ? "" : s)) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function liczba(n, miejsc) {
    n = Number(n); if (!isFinite(n)) n = 0;
    var m = miejsc == null ? 0 : miejsc, t = (Math.round(Math.abs(n) * Math.pow(10, m)) / Math.pow(10, m)).toFixed(m), cz = t.split("."), ul = (cz[1] || "").replace(/0+$/, "");
    return (n < 0 ? "-" : "") + cz[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (ul ? "," + ul : "");
  }
  function km(x) { var n = Number(x) || 0; return liczba(n, n > 0 && n < 10 ? 1 : 0); }
  function zl(gr) { return liczba((Number(gr) || 0) / 100, 2).replace(/,00$/, "") + " zł"; }
  function forma(n, f) { n = Math.abs(Math.round(Number(n) || 0)); var r = n % 10, s = n % 100; return n === 1 ? f[0] : r >= 2 && r <= 4 && (s < 12 || s > 14) ? f[1] : f[2]; }
  function odmiana(n, f) { return liczba(n) + " " + forma(n, f); }
  function procent(suma, cel) { return Number(cel) > 0 ? Math.min(100, Math.floor(Number(suma || 0) / Number(cel) * 1000) / 10) : 0; }
  function naOsobe(d) { return d && Number(d.osoby_n) > 0 ? Number(d.km || 0) / Number(d.osoby_n) : 0; }
  function bezRuchu() { try { return !!(g.matchMedia && g.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } }
  function dataPolska(d) { var M = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"]; return d.getDate() + " " + M[d.getMonth()] + " " + d.getFullYear(); }
  function losowy(ziarno) { var s = (Number(ziarno) || 1) >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  /** Nazwa drużyny z pola: bez znaczników, do 32 znaków, bez e-maili i adresów; pusta → „Moja drużyna”. */
  function ladnaNazwa(t) { var s = String(t == null ? "" : t).replace(/<[^>]*>/g, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 32); if (/@|https?:|www\./i.test(s)) s = ""; return s || "Moja drużyna"; }
  /** Kod zaproszenia: 6 znaków z nazwy i rodzaju (deterministyczny, bez 0/O/1/I). */
  function kod(nazwa, rodzaj) { var h = 7; String(rodzaj + ":" + nazwa).split("").forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); var A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = ""; for (var i = 0; i < 6; i++) { s += A[h % A.length]; h = Math.floor(h / A.length) + 17 * i; } return s; }

  /* ── RANKING ────────────────────────────────────────────────────────────── */
  /** Ranking drużyn. widok: 'razem' (km) | 'osoba' (km na osobę). wlasna: drużyna z pokazu (dołączana, gdy ma km > 0). Zwraca kopie z polami miejsce, wartosc, moja. */
  function ranking(widok, wlasna) {
    var lista = DRUZYNY.map(function (d) { return Object.assign({}, d); });
    if (wlasna && Number(wlasna.km) > 0) lista.push(Object.assign({}, wlasna, { moja: true }));
    var w = function (d) { return widok === "osoba" ? naOsobe(d) : Number(d.km || 0); };
    lista.sort(function (a, b) { return w(b) - w(a) || String(a.nazwa).localeCompare(String(b.nazwa), "pl"); });
    lista.forEach(function (d, i) { d.miejsce = i + 1; d.wartosc = w(d); });
    return lista;
  }
  /** Karta drużyny: miejsce w obu widokach, ile km brakuje do drużyny wyżej (widok razem), procent własnego udziału w ulicy. */
  function kartaDruzyny(d) {
    var r = ranking("razem", d), o = ranking("osoba", d), ja = r.find(function (x) { return x.moja; }) || null, jo = o.find(function (x) { return x.moja; }) || null;
    var wyzej = ja && ja.miejsce > 1 ? r[ja.miejsce - 2] : null, nizej = ja && ja.miejsce < r.length ? r[ja.miejsce] : null;
    return { miejsce_razem: ja ? ja.miejsce : null, miejsce_osoba: jo ? jo.miejsce : null, druzyn_n: r.length, do_nastepnej_km: wyzej ? Math.max(0, wyzej.km - d.km) : 0, nastepna: wyzej ? wyzej.nazwa : null,
      przewaga_km: nizej ? Math.max(0, d.km - nizej.km) : 0, pct_do_nastepnej: wyzej ? Math.min(100, Math.floor(d.km / wyzej.km * 100)) : 100, na_osobe: naOsobe(d) };
  }
  function wierszRankingu(d, widok) {
    var wart = widok === "osoba" ? liczba(d.wartosc, 1) + " km/os." : km(d.km) + " km";
    return '<li class="dr-wiersz' + (d.moja ? " dr-wiersz--ty" : "") + '"><span class="dr-nr">' + d.miejsce + '</span><span class="dr-nazwa">' + esc(d.nazwa) + (d.moja ? ' <i>Twoja drużyna (pokaz)</i>' : "") + '<small>' + esc(RODZAJE[d.rodzaj].nazwa) + ' · ' + odmiana(d.osoby_n, ["osoba", "osoby", "osób"]) + '</small></span><span class="dr-wart">' + esc(wart) + (widok === "osoba" ? '<small>' + km(d.km) + ' km razem</small>' : '<small>' + liczba(naOsobe(d), 1) + ' km/os.</small>') + '</span></li>';
  }

  /* ── STAN POKAZU (localStorage) ─────────────────────────────────────────── */
  function odczytaj() { try { var z = JSON.parse(g.localStorage.getItem(KLUCZ_PAMIECI) || "null"); return z && typeof z === "object" && z.druzyna ? z : null; } catch (e) { return null; } }
  function zapisz(stan) { try { g.localStorage.setItem(KLUCZ_PAMIECI, JSON.stringify(stan)); return true; } catch (e) { return false; } }
  function wyczysc() { try { g.localStorage.removeItem(KLUCZ_PAMIECI); } catch (e) {} }
  /** Założenie drużyny (atrapa): nazwa, rodzaj, liczba osób → drużyna z kodem i linkiem zaproszenia; stawka tylko dla firmy. */
  function zalozDruzyne(nazwa, rodzaj, osoby_n, stawka_gr) {
    var r = rodzaj === "firma" ? "firma" : "klasa", n = Math.max(1, Math.min(500, Math.round(Number(osoby_n) || 0) || (r === "klasa" ? 20 : 10))), nz = ladnaNazwa(nazwa), k = kod(nz, r);
    var d = { id: "moja", nazwa: nz, rodzaj: r, osoby_n: n, km: 0, kod: k, link: "miasto-druzyny.html#d=" + k, data: Date.now(), wpisy: [] };
    if (r === "firma") d.stawka_gr = Math.max(0, Math.min(500, Math.round(Number(stawka_gr) || 0)));
    return d;
  }
  /** Dopisanie kilometrów: klasa = suma od nauczyciela, firma = jeden trening (pokaz). Zwraca nową drużynę (bez mutacji). */
  function dopiszKm(d, ile, opis) {
    var x = Math.max(0, Math.min(5000, Math.round(Number(ile) * 10) / 10 || 0)); if (!d || !(x > 0)) return d;
    var n = Object.assign({}, d, { km: Math.round((Number(d.km || 0) + x) * 10) / 10, wpisy: (d.wpisy || []).concat([{ km: x, opis: String(opis || "").slice(0, 40), t: Date.now() }]).slice(-20) });
    return n;
  }
  /** Ile firma dokłada przy stawce (grosze) i kilometrach: tylko informacja, pieniądze idą do organizacji. */
  function doplataFirmy(d) { return d && d.rodzaj === "firma" && Number(d.stawka_gr) > 0 ? Math.round(Number(d.km || 0) * Number(d.stawka_gr)) : 0; }

  /* ── CANVAS: plakat drużyny (A4 pion), dyplom drużyny (telefon i A4 pion), plakat wyzwania ─────── */
  var FONT_NAGL = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif", FONT_TEKST = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
  function B() { return g.BM_BIEG || null; }
  function nowyCanvas(w, h) { var k = g.document.createElement("canvas"); k.width = w; k.height = h; return k; }
  function prost(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function tekstWSzer(c, t, x, y, maks, font, rozmiar, waga) { var b = B(); if (b && b.tekstWSzer) return b.tekstWSzer(c, t, x, y, maks, font, rozmiar, waga); c.font = (waga || 400) + " " + rozmiar + "px " + font; c.fillText(String(t || ""), x, y); }
  /** Konfetti na marginesach: te same punkty co dyplom biegu (BM_BIEG.konfettiPunkty z wykluczeniami); bez modułu biegu nic nie rysujemy. */
  function konfetti(c, w, h, ile, los, wyk) { var b = B(); if (!b || !b.konfettiPunkty) return 0; var p = b.konfettiPunkty(w, h, ile, los, wyk); p.forEach(function (k) { c.save(); c.translate(k.x, k.y); c.rotate(k.kat); c.fillStyle = k.kolor; c.globalAlpha = k.alfa; c.fillRect(-6, -3, k.dl, 6); c.restore(); }); return p.length; }
  function qr(c, tekst, x, y, bok, kolor, tlo) { var b = B(); if (b && b.qrNaCanvas) return b.qrNaCanvas(c, tekst, x, y, bok, kolor, tlo); c.fillStyle = tlo || "#fff"; c.fillRect(x, y, bok, bok); return false; }
  function znaczekPrzyklad(c, x, y, rozmiar) {
    c.save(); c.translate(x, y); c.rotate(-0.12); c.font = "800 " + rozmiar + "px " + FONT_TEKST; var w = c.measureText("PRZYKŁAD").width + rozmiar * 1.2;
    prost(c, -w / 2, -rozmiar * 0.8, w, rozmiar * 1.6, rozmiar * 0.3); c.fillStyle = "#b8520f"; c.fill(); c.strokeStyle = "#fff7e6"; c.lineWidth = rozmiar * 0.12; c.stroke();
    c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("PRZYKŁAD", 0, rozmiar * 0.06); c.restore();
  }
  function znakBiegamy(c, x, y, rozmiar, kolor) { c.save(); c.fillStyle = kolor || "#f0ede8"; c.textBaseline = "alphabetic"; c.textAlign = "left"; c.font = "600 " + rozmiar + "px " + FONT_TEKST; c.fillText("BiegaMy", x, y); c.restore(); }
  function rysujObraz(c, im, x, y, w, h) { try { if (im && (im.naturalWidth > 0 || im.width > 0)) { c.drawImage(im, x, y, w, h); return true; } } catch (e) {} return false; }
  function poleZnaku(c, x, y, w, h, kolor) { c.save(); c.setLineDash([12, 10]); c.strokeStyle = kolor || "#b08a52"; c.lineWidth = 3; prost(c, x, y, w, h, 16); c.stroke(); c.setLineDash([]); c.fillStyle = kolor || "#7a4a1e"; c.textAlign = "center"; c.font = "500 20px " + FONT_TEKST; c.fillText("tu znak organizacji", x + w / 2, y + h / 2 + 7); c.restore(); }
  /** PLAKAT DRUŻYNY A4 pion 1240×1754: nazwa drużyny, „dołącz”, kod QR z linkiem zaproszenia, kod, trzy zdania, PRZYKŁAD. Dla klasy na drzwi klasy, dla firmy do kuchni. */
  function plakatDruzyny(d, adres, obrazy) {
    var W = 1240, H = 1754, k = nowyCanvas(W, H), c = k.getContext("2d"), los = losowy(21), klasa = d.rodzaj === "klasa";
    c.fillStyle = "#fff7e6"; c.fillRect(0, 0, W, H);
    c.fillStyle = klasa ? "#3d5a99" : "#e8561e"; c.fillRect(0, 0, W, 300);
    konfetti(c, W, H, 70, los, [[0, 0, W, 300], [80, 330, 1080, 260], [80, 620, 1080, 520], [80, 1180, 1080, 420], [W - 300, 520, 240, 80]]);
    c.textAlign = "center"; c.textBaseline = "alphabetic"; c.fillStyle = "#fff7e6"; c.font = "600 30px " + FONT_TEKST; c.fillText("MIASTO DOBRA · " + WYZWANIE.nazwa.toUpperCase() + " · " + WYZWANIE.okres.opis.toUpperCase(), W / 2, 90);
    c.font = "92px " + FONT_NAGL; c.fillText(klasa ? "NASZA KLASA BUDUJE ULICĘ" : "NASZA FIRMA BUDUJE ULICĘ", W / 2, 200);
    c.font = "500 30px " + FONT_TEKST; c.fillText("kilometry z biegu i spaceru dla jednej zbiórki", W / 2, 256);
    c.fillStyle = "#07070a"; tekstWSzer(c, d.nazwa, W / 2, 500, W - 200, FONT_NAGL, 150);
    c.fillStyle = "#3a1d0a"; c.font = "500 34px " + FONT_TEKST; c.fillText(klasa ? "drużyna klasowa · " + odmiana(d.osoby_n, ["osoba", "osoby", "osób"]) : "drużyna firmowa · " + odmiana(d.osoby_n, ["osoba", "osoby", "osób"]), W / 2, 560);
    prost(c, 80, 620, W - 160, 520, 30); c.fillStyle = "#fff"; c.fill(); c.strokeStyle = "#e8b48a"; c.lineWidth = 4; c.stroke();
    qr(c, adres, 120, 660, 440, "#07070a", "#fff");
    c.textAlign = "left"; c.fillStyle = "#07070a"; c.font = "68px " + FONT_NAGL; c.fillText(klasa ? "DOŁĄCZ KILOMETRAMI" : "DOŁĄCZ DO DRUŻYNY", 600, 740);
    c.font = "500 28px " + FONT_TEKST; c.fillStyle = "#3a1d0a";
    (klasa ? ["Każdy spacer i bieg liczy się do sumy klasy.", "Kilometry zbiera i wpisuje nauczyciel.", "Bez kont i bez danych uczniów w aplikacji."] : ["Zeskanuj kod, zaloguj się w BiegaMy", "i dołącz do drużyny jednym dotknięciem.", "Każdy Twój trening dolicza się do firmy."]).forEach(function (t, i) { tekstWSzer(c, t, 600, 800 + i * 44, 530, FONT_TEKST, 28, 500); });
    c.font = "600 30px " + FONT_TEKST; c.fillText("Kod drużyny:", 600, 980); c.font = "88px " + FONT_NAGL; c.fillStyle = "#e8561e"; c.fillText(d.kod, 600, 1070);
    c.fillStyle = "#3a1d0a"; c.font = "500 22px " + FONT_TEKST; tekstWSzer(c, adres, 600, 1118, 520, FONT_TEKST, 22, 500);
    prost(c, 80, 1180, W - 160, 420, 30); c.fillStyle = "rgba(61,90,153,.08)"; c.fill();
    c.textAlign = "left"; c.fillStyle = "#07070a"; c.font = "48px " + FONT_NAGL; c.fillText("PO CO TO ROBIMY", 120, 1250);
    c.font = "500 28px " + FONT_TEKST; c.fillStyle = "#3a1d0a";
    ["Suma kilometrów wszystkich drużyn buduje Ulicę Szkolną w Mieście Dobra.", "Ulica stoi obok prawdziwej zbiórki organizacji, która ją prowadzi.", "Wpłaty idą wyłącznie przez tę organizację. BiegaMy nic nie przyjmuje", "i tylko liczy kilometry. Ranking drużyn: razem i na osobę."].forEach(function (t, i) { c.fillText(t, 120, 1310 + i * 44); });
    if (!klasa && Number(d.stawka_gr) > 0) { c.font = "600 28px " + FONT_TEKST; c.fillStyle = "#e8561e"; c.fillText("Firma dokłada " + d.stawka_gr + " gr za każdy kilometr drużyny, prosto na zbiórkę.", 120, 1530); }
    poleZnaku(c, W - 80 - 300, 1620, 300, 100); znakBiegamy(c, 80, 1690, 30, "#3a1d0a");
    c.fillStyle = "#7a4a1e"; c.font = "500 20px " + FONT_TEKST; c.textAlign = "left"; c.fillText("plakat wygenerowany w przeglądarce · " + dataPolska(new Date(d.data || Date.now())), 80, 1725);
    znaczekPrzyklad(c, W - 180, 560, 32);   /* pod domkiem, obok podpisu drużyny: nie na nagłówku */
    rysujObraz(c, obrazy && obrazy.domek, 1010, 330, 150, 150);
    return k;
  }
  /** DYPLOM DRUŻYNY: 'telefon' 1080×1350 | 'a4' 1240×1754 (pion, jeden rozmiar strony z plakatem). Konfetti omija tytuł, nazwę, trzy ramki, pola i wstęgę jak dyplom biegu. */
  function dyplomDruzyny(d, wynik, format, obrazy) {
    var a4 = format === "a4", W = a4 ? 1240 : 1080, H = a4 ? 1754 : 1350, k = nowyCanvas(W, H), c = k.getContext("2d"), los = losowy(9), w = wynik || {}, cx = W / 2, s = a4 ? 1.1 : 1;
    var tlo = c.createLinearGradient(0, 0, 0, H); tlo.addColorStop(0, "#fffaf0"); tlo.addColorStop(1, "#f7e9cf"); c.fillStyle = tlo; c.fillRect(0, 0, W, H);
    var y = a4 ? 230 : 190, yy = y + 440 * s, ramki = [cx - 300 * s, cx, cx + 300 * s];
    var WYK = [[cx - 460 * s, y - 100, 920 * s, 44], [cx - 320 * s, y - 40, 640 * s, 150 * s], [cx - 240 * s, y + 130 * s, 480 * s, 40], [cx - 460 * s, y + 170 * s, 920 * s, 130 * s], [cx - 340 * s, y + 300 * s, 680 * s, 50],
      [ramki[0] - 150 * s, yy - 90 * s, 900 * s, 170 * s], [cx - 180 * s, yy + 110 * s, 360 * s, 300 * s], [100, H - 440 * s, 340 * s, 220 * s], [W - 110 - 280 * s, H - 520 * s, 280 * s, 170 * s], [cx - 300 * s, H - 160 * s, 600 * s, 90 * s], [W - 320, 160, 250, 80]];
    konfetti(c, W, H, 90, los, WYK);
    c.strokeStyle = "#3d5a99"; c.lineWidth = 10; prost(c, 36, 36, W - 72, H - 72, 28); c.stroke(); c.strokeStyle = "#f2b32a"; c.lineWidth = 3; prost(c, 56, 56, W - 112, H - 112, 20); c.stroke();
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillStyle = "#3a1d0a"; c.font = "600 " + Math.round(26 * s) + "px " + FONT_TEKST; c.fillText("MIASTO DOBRA · " + WYZWANIE.nazwa.toUpperCase() + " · " + WYZWANIE.forma.toUpperCase(), cx, y - 70);
    c.fillStyle = "#3d5a99"; c.font = Math.round(150 * s) + "px " + FONT_NAGL; c.fillText("DYPLOM", cx, y + 80 * s);
    c.fillStyle = "#3a1d0a"; c.font = "500 " + Math.round(30 * s) + "px " + FONT_TEKST; c.fillText("dla drużyny", cx, y + 160 * s);
    c.fillStyle = "#07070a"; tekstWSzer(c, d.nazwa, cx, y + 280 * s, W - 220, FONT_NAGL, Math.round(120 * s));
    /* wiersz pod nazwą: mieści się w szerokości ramek z zapasem (zmniejszany przez tekstWSzer) i nie dotyka ramek z liczbami (uwaga z przeglądu 11.11) */
    c.fillStyle = "#3a1d0a"; tekstWSzer(c, (d.rodzaj === "klasa" ? "drużyna klasowa" : "drużyna firmowa") + " · " + odmiana(d.osoby_n, ["osoba", "osoby", "osób"]) + " · " + WYZWANIE.okres.opis, cx, y + 326 * s, W - 300, FONT_TEKST, Math.round(30 * s), 500);
    var wart = [km(d.km) + " km", liczba(naOsobe(d), 1), w.miejsce_razem ? w.miejsce_razem + ". / " + w.druzyn_n : "—"], pod = ["razem", "km na osobę", "miejsce w rankingu"];
    ramki.forEach(function (x, i) {
      prost(c, x - 140 * s, yy - 90 * s, 280 * s, 160 * s, 22); c.fillStyle = "rgba(61,90,153,.08)"; c.fill(); c.strokeStyle = "#b9c3dd"; c.lineWidth = 3; c.stroke();
      c.fillStyle = "#07070a"; tekstWSzer(c, wart[i], x, yy + 14 * s, 280 * s - 36, FONT_NAGL, Math.round(78 * s));
      c.fillStyle = "#4a5a85"; c.font = "600 " + Math.round(22 * s) + "px " + FONT_TEKST; c.fillText(pod[i], x, yy + 54 * s);
    });
    /* domek drużyny z Ulicy zamiast medalu; po lewej data i kod drużyny; po prawej pole na znak organizacji; na dole wstęga */
    var dom = [cx - 130 * s, yy + 120 * s, 260 * s, 260 * s];
    if (!rysujObraz(c, obrazy && obrazy.domek, dom[0], dom[1], dom[2], dom[3])) { c.fillStyle = "#e8b48a"; prost(c, dom[0] + 40, dom[1] + 80, dom[2] - 80, dom[3] - 100, 12); c.fill(); }
    c.fillStyle = "#3d5a99"; prost(c, cx - 220 * s, H - 150 * s, 440 * s, 66 * s, 12); c.fill(); c.fillStyle = "#fff7e6"; c.font = Math.round(34 * s) + "px " + FONT_NAGL; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("KILOMETRY BUDUJĄ ULICĘ", cx, H - 117 * s); c.textBaseline = "alphabetic";
    c.textAlign = "left"; c.fillStyle = "#3a1d0a"; c.font = "500 " + Math.round(22 * s) + "px " + FONT_TEKST;
    c.fillText("Data: " + dataPolska(new Date(w.data || Date.now())), 110, H - 410 * s); c.fillText("Kod drużyny: " + (d.kod || "—"), 110, H - 374 * s);
    znakBiegamy(c, 110, H - 300 * s, Math.round(34 * s), "#07070a"); c.fillStyle = "#7a4a1e"; c.font = "500 " + Math.round(20 * s) + "px " + FONT_TEKST; c.fillText("aplikacja, która liczy kilometry", 110, H - 270 * s);
    poleZnaku(c, W - 110 - 280 * s, H - 520 * s, 280 * s, 170 * s);
    znaczekPrzyklad(c, W - 190, 200, 34);
    return k;
  }
  /** PLAKAT WYZWANIA A4 pion (dla organizacji, do pobrania): nazwa, okres, cztery kroki, QR do strony. */
  function plakatWyzwania(adres, obrazy) {
    var W = 1240, H = 1754, k = nowyCanvas(W, H), c = k.getContext("2d"), los = losowy(5);
    var tlo = c.createLinearGradient(0, 0, 0, H); tlo.addColorStop(0, "#9fd0ee"); tlo.addColorStop(0.42, "#dceefb"); tlo.addColorStop(0.42, "#86ad55"); tlo.addColorStop(1, "#4f7a33"); c.fillStyle = tlo; c.fillRect(0, 0, W, H);
    c.fillStyle = "#3b3b47"; c.fillRect(0, 700, W, 130); c.strokeStyle = "#fff7e6"; c.lineWidth = 6; c.setLineDash([40, 30]); c.beginPath(); c.moveTo(0, 765); c.lineTo(W, 765); c.stroke(); c.setLineDash([]);
    rysujObraz(c, obrazy && obrazy.szkola, 80, 420, 420, 280); rysujObraz(c, obrazy && obrazy.domek, 600, 520, 180, 180); rysujObraz(c, obrazy && obrazy.domek, 820, 500, 200, 200); rysujObraz(c, obrazy && obrazy.plac, 1030, 560, 150, 140);
    konfetti(c, W, 420, 40, los, [[60, 90, 1120, 160], [80, 280, 1080, 120], [W - 300, 400, 260, 80]]);
    c.textAlign = "center"; c.fillStyle = "#07070a"; c.font = "600 30px " + FONT_TEKST; c.fillText("MIASTO DOBRA ZAPRASZA SZKOŁY I FIRMY", W / 2, 120);
    c.fillStyle = "#e8561e"; tekstWSzer(c, WYZWANIE.nazwa.toUpperCase(), W / 2, 260, W - 160, FONT_NAGL, 150);
    c.fillStyle = "#07070a"; c.font = "600 40px " + FONT_TEKST; c.fillText(WYZWANIE.forma + " · " + WYZWANIE.okres.opis, W / 2, 330);
    tekstWSzer(c, "klasy i zespoły z firm zbierają kilometry jako drużyny · ranking razem i na osobę", W / 2, 385, W - 140, FONT_TEKST, 30, 500);
    prost(c, 70, 880, W - 140, 760, 30); c.fillStyle = "#fff7e6"; c.fill();
    qr(c, adres, 110, 920, 380, "#07070a", "#fff7e6");
    c.textAlign = "left"; c.fillStyle = "#07070a"; c.font = "64px " + FONT_NAGL; c.fillText("ZAŁÓŻ DRUŻYNĘ", 530, 985);
    c.font = "500 27px " + FONT_TEKST; c.fillStyle = "#3a1d0a";
    JAK.forEach(function (j, i) { c.font = "600 27px " + FONT_TEKST; c.fillText((i + 1) + ". " + j.tytul, 530, 1050 + i * 64); });
    c.font = "500 24px " + FONT_TEKST; ["Udział jest bezpłatny. Klasy bez kont i bez danych dzieci.", "Wpłaty na zbiórkę wyłącznie przez organizację, która ją prowadzi.", "BiegaMy tylko liczy kilometry."].forEach(function (t, i) { c.fillText(t, 110, 1380 + i * 40); });
    c.font = "500 22px " + FONT_TEKST; c.fillStyle = "#7a4a1e"; tekstWSzer(c, adres, 110, 1540, 1000, FONT_TEKST, 22, 500);
    poleZnaku(c, W - 110 - 300, 1420, 300, 110, "#7a4a1e"); znakBiegamy(c, 110, 1600, 28, "#3a1d0a");
    znaczekPrzyklad(c, W - 170, 440, 32);   /* na niebie nad domkami, nie na nagłówku */
    return k;
  }
  /** Eksport drużyn (przykład): nazwa, rodzaj, osoby, kilometry, km na osobę. Bez osób, bez e-maili. */
  function csvDruzyn(wlasna) {
    var w = ["drużyna;rodzaj;osoby;km_razem;km_na_osobe"];
    ranking("razem", wlasna).forEach(function (d) { w.push([d.nazwa, d.rodzaj, d.osoby_n, km(d.km), liczba(naOsobe(d), 1)].join(";")); });
    return w.join("\r\n");
  }

  /* ── SCENA: szkoła, plac zabaw, droga z kilometrów, domki drużyn z szyldami (klasy niebieskie, firmy pomarańczowe) ───────── */
  var CSS_SCENY = ".ds{position:relative;overflow:hidden;background:linear-gradient(#9fd0ee,#dceefb 58%,#86ad55 58%,#5f8a3a);user-select:none;-webkit-user-select:none}" +
    ".ds-swiat{position:absolute;inset:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch}.ds-swiat::-webkit-scrollbar{display:none}.ds-tresc{position:relative;height:100%}" +
    ".ds-slonce{position:absolute;top:6%;width:64px;height:64px;background:center/contain no-repeat}.ds-chmura{position:absolute;width:120px;height:46px;background:center/contain no-repeat;opacity:.9}" +
    ".ds--ruch .ds-chmura{animation:ds-chmura linear infinite}@keyframes ds-chmura{from{transform:translate3d(-140px,0,0)}to{transform:translate3d(var(--ds-dl,1500px),0,0)}}" +
    ".ds-wzgorza{position:absolute;left:0;right:0;bottom:36%;height:34%;background:0 100%/700px 100% repeat-x}.ds-laka{position:absolute;left:0;right:0;top:64%;bottom:0;background:linear-gradient(#86ad55,#5f8a3a)}" +
    ".ds-droga{position:absolute;left:0;bottom:11%;height:24%;background:#3a3d44 0 100%/auto 100% repeat-x;border-top:2px solid #2a2c31}.ds-droga--szutr{background:repeating-linear-gradient(90deg,#9a7b4a 0 18px,#8c6d3f 18px 36px);border-top:2px dashed #fff7e6;opacity:.85}" +
    ".ds-przod{position:absolute;left:0;right:0;bottom:0;height:16%;background:0 100%/380px 100% repeat-x}.ds-el{position:absolute;bottom:34%;display:block;filter:drop-shadow(0 3px 2px rgba(60,30,0,.35))}" +
    ".ds-domek{position:absolute;bottom:34%;text-align:center}.ds-domek img{display:block;width:100%;height:auto;filter:drop-shadow(0 3px 2px rgba(60,30,0,.35))}" +
    ".ds-szyld{position:absolute;left:50%;transform:translateX(-50%);top:-16px;background:#fff7e6;color:#4a2408;border:2px solid #5a2e0e;border-radius:8px;padding:3px 7px;font:800 10px/1.1 Inter,sans-serif;white-space:nowrap;box-shadow:0 2px 0 #5a2e0e}" +
    ".ds-szyld--klasa{background:#e4ebfb;border-color:#3d5a99;box-shadow:0 2px 0 #3d5a99;color:#1f2f5a}.ds-szyld--moja{background:#f2b32a;border-color:#3a1d0a;box-shadow:0 2px 0 #3a1d0a;color:#3a1d0a}" +
    ".ds-hud{position:absolute;left:10px;top:10px;display:flex;gap:6px;flex-wrap:wrap;pointer-events:none}.ds-chip{background:rgba(7,7,10,.78);color:#fff7e6;border-radius:10px;padding:6px 9px;font:600 12px/1.15 Inter,sans-serif;backdrop-filter:blur(4px)}" +
    ".ds-chip b{font:400 20px/1 'Bebas Neue',Impact,sans-serif;letter-spacing:.03em;display:block;color:#ffb27a}.ds-chip--przyklad{background:#b8520f;color:#fff;font:800 9px/1 Inter,sans-serif;letter-spacing:.14em;padding:7px 8px;align-self:flex-start}" +
    ".ds-wskaz{position:absolute;right:10px;bottom:10px;color:#fff7e6;font:600 11px/1 Inter,sans-serif;background:rgba(7,7,10,.6);padding:7px 9px;border-radius:8px;pointer-events:none}";
  function wstrzyknijCssSceny() { if (g.document.getElementById("bm-druzyny-scena-css")) return; var st = g.document.createElement("style"); st.id = "bm-druzyny-scena-css"; st.textContent = CSS_SCENY; g.document.head.appendChild(st); }
  function el(tag, klasa, rodzic, tekst) { var n = g.document.createElement(tag); if (klasa) n.className = klasa; if (tekst != null) n.textContent = tekst; if (rodzic) rodzic.appendChild(n); return n; }
  var _zrodlo = null;
  function adres(src) { return _zrodlo ? (_zrodlo(src) || src) : src; }
  function obraz(src, klasa, rodzic, lewo, szer) { var im = el("img", klasa, rodzic); im.alt = ""; im.decoding = "async"; im.draggable = false; im.setAttribute("data-plik", src); im.src = adres(src); im.style.left = lewo + "px"; im.style.width = szer + "px"; return im; }
  function tlo(n, src) { n.style.backgroundImage = "url(\"" + adres(src) + "\")"; return n; }
  /** Scena w kontenerze. opcje: { wysokosc, wlasna (drużyna pokazu), zrodlo, hud }. Szkoła na początku, plac zabaw, droga z % celu, domki pierwszych 8 drużyn rankingu (własna zawsze, złoty szyld). */
  function scena(kontener, opcje) {
    if (!kontener) return null;
    var o = opcje || {}, ruch = !bezRuchu(); _zrodlo = typeof o.zrodlo === "function" ? o.zrodlo : null;
    wstrzyknijCssSceny();
    while (kontener.firstChild) kontener.removeChild(kontener.firstChild);
    var scenaEl = el("div", "ds" + (ruch ? " ds--ruch" : ""), kontener); scenaEl.style.height = (o.wysokosc || 250) + "px";
    var swiat = el("div", "ds-swiat", scenaEl), tresc = el("div", "ds-tresc", swiat), dl = 1600, suma = WYZWANIE.suma_km + (o.wlasna ? Number(o.wlasna.km) || 0 : 0), proc = procent(suma, WYZWANIE.cel_km);
    tresc.style.width = dl + "px"; tresc.style.setProperty("--ds-dl", dl + 60 + "px");
    tlo(el("div", "ds-slonce", tresc), "assets/gra/slonce.webp").style.left = (dl * 0.7) + "px";
    [[0, 18, 46], [1, 44, 70]].forEach(function (ch) { var c = tlo(el("div", "ds-chmura", tresc), "assets/gra/chmura1.webp"); c.style.top = ch[1] + "px"; c.style.left = (ch[0] ? dl * 0.5 : dl * 0.1) + "px"; c.style.animationDuration = ch[2] + "s"; c.style.animationDelay = (-ch[2] * ch[0] * 0.5) + "s"; });
    tlo(el("div", "ds-wzgorza", tresc), "assets/ulica/wzgorza.webp"); el("div", "ds-laka", tresc);
    var szer = Math.max(140, Math.round(dl * proc / 100)), droga = tlo(el("div", "ds-droga", tresc), "assets/ulica/droga.webp"); droga.style.width = szer + "px";
    if (proc < 100) { var szutr = el("div", "ds-droga ds-droga--szutr", tresc); szutr.style.left = szer + "px"; szutr.style.width = (dl - szer) + "px"; }
    obraz("assets/miasto/szkola.webp", "ds-el", tresc, 16, 190); obraz("assets/ulica/plac-zabaw.webp", "ds-el", tresc, 215, 110);
    [[700, 60], [1180, 66], [1540, 54]].forEach(function (d) { obraz("assets/ulica/drzewo.webp", "ds-el", tresc, d[0], d[1]); });
    [[640, 16], [1120, 16]].forEach(function (d) { obraz("assets/ulica/latarnia.webp", "ds-el", tresc, d[0], d[1]); });
    var lista = ranking("razem", o.wlasna).slice(0, 8); if (o.wlasna && Number(o.wlasna.km) > 0 && !lista.some(function (x) { return x.moja; })) lista[7] = Object.assign({}, o.wlasna, { moja: true });
    lista.forEach(function (d, i) {
      var dom = el("div", "ds-domek", tresc), w = 96 - Math.min(26, i * 4), nr = 1 + (i % 7); dom.style.left = (350 + i * 150) + "px"; dom.style.width = w + "px";
      var im = el("img", "", dom); im.alt = ""; im.decoding = "async"; var src = "assets/ulica/domek-" + nr + ".webp"; im.setAttribute("data-plik", src); im.src = adres(src);
      el("span", "ds-szyld" + (d.moja ? " ds-szyld--moja" : d.rodzaj === "klasa" ? " ds-szyld--klasa" : ""), dom, d.nazwa);
    });
    tlo(el("div", "ds-przod", tresc), "assets/ulica/pierwszy-plan.webp");
    var hud = el("div", "ds-hud", scenaEl);
    if (o.hud !== false) {
      var c1 = el("div", "ds-chip", hud); el("b", "", c1, liczba(WYZWANIE.druzyny_n + (o.wlasna && Number(o.wlasna.km) > 0 ? 1 : 0))); c1.appendChild(g.document.createTextNode("drużyn"));
      var c2 = el("div", "ds-chip", hud); el("b", "", c2, km(suma) + " km"); c2.appendChild(g.document.createTextNode("razem"));
      var c3 = el("div", "ds-chip", hud); el("b", "", c3, liczba(proc, 1) + " %"); c3.appendChild(g.document.createTextNode("ulicy"));
    }
    el("div", "ds-chip ds-chip--przyklad", hud, "PRZYKŁAD");
    el("div", "ds-wskaz", scenaEl, "przesuń ›");
    swiat.scrollLeft = 0;
    return scenaEl;
  }

  g.BM_DRUZYNY = { KLUCZ_PAMIECI: KLUCZ_PAMIECI, WYZWANIE: WYZWANIE, DRUZYNY: DRUZYNY, JAK: JAK, RODZAJE: RODZAJE, MATERIALY: MATERIALY, CHECKLISTA: CHECKLISTA,
    esc: esc, liczba: liczba, km: km, zl: zl, forma: forma, odmiana: odmiana, procent: procent, naOsobe: naOsobe, bezRuchu: bezRuchu, dataPolska: dataPolska, ladnaNazwa: ladnaNazwa, kod: kod,
    ranking: ranking, kartaDruzyny: kartaDruzyny, wierszRankingu: wierszRankingu, odczytaj: odczytaj, zapisz: zapisz, wyczysc: wyczysc, zalozDruzyne: zalozDruzyne, dopiszKm: dopiszKm, doplataFirmy: doplataFirmy,
    plakatDruzyny: plakatDruzyny, dyplomDruzyny: dyplomDruzyny, plakatWyzwania: plakatWyzwania, csvDruzyn: csvDruzyn, scena: scena };
})(typeof globalThis !== "undefined" ? globalThis : window);
