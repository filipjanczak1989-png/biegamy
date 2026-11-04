// ULICA — ilustracja akcji (Filip 4.11). Plik BEZ import/export (globalThis.BM_ULICA), jak js/akcja.mjs: dociągany przez js/akcja.mjs (zUlica), importowalny w testach.
// Tu: czyste funkcje (stan, pora dnia, domki, szyldy, świętowanie), lekka nieruchoma miniatura na karty (Dziś, Okienko), wejście strony akcji i panel trenera.
// Pełna scena 2D (paralaksa, maszyny, dotyk, świętowanie) żyje w js/ulica-scena.mjs i ładuje się tylko na stronie akcji; jej brak albo awaria = miniatura.
// Kilometry budują drogę: 1 odcinek = 100 km, 125 odcinków = cel. Liczby WYŁĄCZNIE z pola suma_km licznika akcji. Moduł czyta z licznika tylko pola wymienione w stanUlicy
// i daneScenyZLicznika: pozostałe, w tym dane podróży, go nie obchodzą. Przed startem ani jednej liczby akcji: faza „przed” nie zna suma_km. Imię tylko z bazy, w kodzie go nie ma.
// Każda warstwa to najpierw prosty kształt; WebP z assets/ulica/ wchodzi po udanym onload. Brak pliku = zostaje kształt, bez dziury i bez błędu.
// Tekst z bazy (szyld firmy, imię w murze) zawsze przez textContent. innerHTML w tym pliku nie istnieje.
(function (g) {
  "use strict";
  var KM_NA_ODCINEK = 100, ODCINKOW = 125;
  var KATALOG = "assets/ulica/";
  var WARSTWY = ["droga", "koparka", "walec", "dzwig", "budowniczy", "domek-1", "domek-2", "domek-3", "domek-4", "domek-5", "domek-6", "domek-7", "mur", "plac-zabaw", "latarnia", "drzewo", "plac-budowy"];
  var ELEMENTY = ["plac_zabaw", "park", "latarnie"];
  var NAZWY_ELEMENTOW = { plac_zabaw: "plac zabaw", park: "park", latarnie: "latarnie" };
  var PUSTE_DODATKI = { odblokowane: [], imiona: [], bez_imienia: 0 };
  /* Deska (ułamki obrazu) i proporcja: kopia assets/ulica/szyldy.json (tools/ulica-grafiki.py). Stała zamiast pobierania: bez dodatkowego żądania i bez stanu „jeszcze nie wiem”. Zgodność pilnuje blizna-151. */
  var SZYLDY = {
    "wiezowiec": { szyld: [0.2, 0.175, 0.6, 0.08], proporcja: 0.5 },
    "domek-1": { szyld: [0.2999, 0.3604, 0.4001, 0.0995], proporcja: 1.2203 },
    "domek-2": { szyld: [0.2918, 0.346, 0.4152, 0.1142], proporcja: 1.2491 },
    "domek-3": { szyld: [0.3145, 0.2748, 0.3716, 0.1349], proporcja: 1.2987 },
    "domek-4": { szyld: [0.2813, 0.341, 0.4366, 0.106], proporcja: 1.3185 },
    "domek-5": { szyld: [0.3029, 0.3139, 0.3942, 0.1227], proporcja: 1.3158 },
    "domek-6": { szyld: [0.2929, 0.2996, 0.4121, 0.1163], proporcja: 1.289 },
    "domek-7": { szyld: [0.297, 0.3642, 0.406, 0.1036], proporcja: 1.2583 },
    "plac-budowy": { szyld: [0.3072, 0.1992, 0.3878, 0.2175], proporcja: 2.1094 }
  };

  /* ── STAN (czysta funkcja, testowana w Node) ────────────────────────────────────── */
  /** Licznik → { faza: 'brak' } (błąd: nic nie rysujemy) | { faza: 'przed' } (bez liczb) | { faza: 'trwa'|'pelna', odcinki, km }. */
  function stanUlicy(licznik) {
    if (!licznik || typeof licznik !== "object") return { faza: "brak" };
    if (licznik.wystartowala === false) return { faza: "przed" };
    if (licznik.wystartowala !== true) return { faza: "brak" };
    var surowe = licznik.suma_km;
    if (surowe === null || surowe === undefined || surowe === "" || typeof surowe === "boolean") return { faza: "brak" };
    var km = Number(surowe);
    if (!isFinite(km) || km < 0) return { faza: "brak" };
    var odcinki = Math.min(ODCINKOW, Math.floor(km / KM_NA_ODCINEK));
    return { faza: odcinki >= ODCINKOW ? "pelna" : "trwa", odcinki: odcinki, km: km };
  }
  /** Ile km do następnego odcinka (całe, w górę), żeby także 1 km zmieniał coś na ekranie. */
  function doNastepnego(km) { return Math.ceil(KM_NA_ODCINEK - (km % KM_NA_ODCINEK)); }
  /** Co świętować przy wzroście w trakcie oglądania: tysiąc ma pierwszeństwo przed odcinkiem; spadek i brak zmiany = nic. */
  function coSwietowac(stare, nowe) {
    var a = Number(stare), b = Math.min(Number(nowe), ODCINKOW * KM_NA_ODCINEK);
    if (!isFinite(a) || !isFinite(b) || b <= a) return "nic";
    if (Math.floor(b / 1000) > Math.floor(a / 1000)) return "tysiac";
    if (Math.floor(b / KM_NA_ODCINEK) > Math.floor(a / KM_NA_ODCINEK)) return "odcinek";
    return "nic";
  }
  /** Pola licznika, które scena w ogóle czyta. Reszta nie przechodzi dalej. Domki: akcja_licznik.firmy (nazwa, link); brak pola = bez domków. */
  function daneScenyZLicznika(d) {
    var po = !!(d && d.wystartowala === true), firmy = po && Array.isArray(d.firmy) ? d.firmy : [];
    return {
      imie: po && typeof d.imie === "string" ? d.imie : "",
      nazwa: po && typeof d.nazwa === "string" ? d.nazwa : "",
      cel_km: po && Number(d.cel_km) > 0 ? Number(d.cel_km) : 0,
      firmy: firmy.map(function (f) {
        var nazwa = f && typeof f.nazwa === "string" ? f.nazwa.trim() : "";
        if (!nazwa) return null;
        var A = g.BM_AKCJA;
        return { nazwa: nazwa, link: typeof f.link === "string" ? f.link : "", logo: A && A.logoFirmy ? A.logoFirmy(f) : "",
          rodzaj: f.rodzaj === "wiezowiec" || f.rodzaj === "cegielka" ? f.rodzaj : "domek", partner: f.wsparcie === "rzeczowe" };
      }).filter(Boolean).map(function (f, i) { return [f, i]; }).sort(function (a, b) { return rangaFirmy(a[0]) - rangaFirmy(b[0]) || a[1] - b[1]; }).map(function (x) { return x[0]; }),
    };
  }
  /** Kolejność na Ulicy: Partner akcji, wieżowce, domki. W każdej grupie wg daty, jak oddaje licznik. */
  function rangaFirmy(f) { return f.rodzaj === "cegielka" ? 3 : f.partner ? 0 : f.rodzaj === "wiezowiec" ? 1 : 2; }
  /** Firma poniżej progu: nazwa na cegiełce w murze, bez budynku. Firmy idą przed imionami, żeby nie wypadły poza widoczną część muru. */
  function zFirmamiNaMurze(dod, dane) {
    var nazwy = (dane && dane.firmy || []).filter(function (f) { return f.rodzaj === "cegielka"; }).map(function (f) { return f.nazwa; });
    return nazwy.length ? { odblokowane: dod.odblokowane, imiona: nazwy.concat(dod.imiona), bez_imienia: dod.bez_imienia } : dod;
  }
  /** Pole licznika „ulica” (akcja_ulica_publiczna) przepuszczone przez listę dozwolonych wartości. */
  function dodatkiBezpieczne(j) {
    if (!j || typeof j !== "object") return PUSTE_DODATKI;
    return {
      odblokowane: (Array.isArray(j.odblokowane) ? j.odblokowane : []).filter(function (x) { return ELEMENTY.indexOf(x) >= 0; }),
      imiona: (Array.isArray(j.imiona) ? j.imiona : []).filter(function (x) { return typeof x === "string" && x.trim(); }),
      bez_imienia: Math.max(0, Math.floor(Number(j.bez_imienia) || 0)),
    };
  }
  function sciezkaObrazu(nazwa) { return KATALOG + nazwa + ".webp"; }
  function formatKm(x) { var A = g.BM_AKCJA; return A && A.km ? A.km(x) : String(Math.round(Number(x) || 0)); }
  function tytulUlicy(imie) {
    var im = imie && g.BM_AKCJA && g.BM_AKCJA.dopelniacz ? g.BM_AKCJA.dopelniacz(imie) : "";
    return im ? "Ulica " + im : "";
  }
  function opisDlaCzytnika(stan, dane, dod) {
    if (stan.faza === "przed") return "Pusty plac budowy z tablicą: Wkrótce budowa.";
    var reszta = [];
    if (dane.firmy.length) reszta.push("przy drodze domki firm");
    if (dod.imiona.length || dod.bez_imienia) reszta.push("mur z wpisami osób wpłacających");
    dod.odblokowane.forEach(function (e) { reszta.push(NAZWY_ELEMENTOW[e]); });
    var dalej = reszta.length ? " Obok: " + reszta.join(", ") + "." : "";
    if (stan.faza === "pelna") return "Gotowa ulica: " + ODCINKOW + " odcinków drogi, każdy to " + KM_NA_ODCINEK + " kilometrów." + dalej;
    return "Ulica w budowie: " + stan.odcinki + " ze " + ODCINKOW + " odcinków drogi, każdy to " + KM_NA_ODCINEK + " kilometrów. Na końcu drogi pracują koparka, walec i dźwig, obok stoi budowniczy w żółtym kasku." + dalej;
  }
  /* Rysunek postaci w koparce: licznik oddaje adres tylko po starcie i przy zgodzie. Tu ostatnie sito: wyłącznie adres podpisany z prywatnego kubełka, nic innego nie trafia do src. */
  var ADRES_RYSUNKU = /^https:\/\/afqojgkaveykxbltxzwm\.supabase\.co\/storage\/v1\/object\/sign\/akcja-wizerunek\/[A-Za-z0-9._-]+\.webp\?token=[A-Za-z0-9._-]+$/;
  function rysunekKoparki(licznik) {
    var u = licznik && licznik.wystartowala && licznik.koparka_url;
    return typeof u === "string" && ADRES_RYSUNKU.test(u) ? u : "";
  }
  /** Mur graczy: suma cegiełek z gry, osobno od kilometrów. Pusta suma = bez tabliczki. */
  function tekstMuru(ile, cel) {
    var n = Math.floor(Number(ile)), c = Math.floor(Number(cel));
    if (!(n > 0)) return "";
    if (c > 0) return "Mur graczy: " + n.toLocaleString("pl-PL") + " z " + c.toLocaleString("pl-PL") + " cegieł";
    var r10 = n % 10, r100 = n % 100, slowo = n === 1 ? "cegła" : (r10 >= 2 && r10 <= 4 && !(r100 >= 12 && r100 <= 14)) ? "cegły" : "cegieł";
    return "Mur graczy: " + n.toLocaleString("pl-PL") + " " + slowo;
  }
  function procentMuru(ile, cel) {
    var i = Number(ile) || 0, c = Number(cel) || 0;
    if (!(i > 0) || !(c > 0)) return 0;
    return Math.max(1, Math.min(100, i * 100 / c));
  }
  /* Stałe zdanie przy murze (Filip 4.11): imię z licznika, w dopełniaczu. Cegły z gry to zabawa, nigdy pieniądze. */
  function zdanieOZbiorce(licznik) {
    var im = g.BM_AKCJA && g.BM_AKCJA.dopelniacz ? g.BM_AKCJA.dopelniacz(licznik && licznik.imie) : "";
    return "Cegiełki w grze to zabawa, nie pieniądze. " + (im ? "Wpłacić na " + im + " możesz tylko na zbiórce" : "Wpłacić możesz tylko na zbiórce");
  }
  function tekstPostepu(stan) {
    if (stan.faza === "pelna") return "Gotowe: " + ODCINKOW + " ze " + ODCINKOW + " odcinków.";
    return stan.odcinki + " ze " + ODCINKOW + " odcinków · do następnego " + formatKm(doNastepnego(stan.km)) + " km · 1 odcinek = " + KM_NA_ODCINEK + " km";
  }

  /* ── PORA DNIA: prawdziwa godzina w Polsce, bez sieci ───────────────────────────── */
  /** Czas w Polsce z daty: minuta doby, dzień roku i przesunięcie względem UTC (uwzględnia czas letni, bo idzie przez Intl). */
  var _format = null;   // jeden obiekt: tworzenie Intl jest drogie (zmierzone: 73 ms przy CPU x4)
  function czasWPolsce(data) {
    var t = data instanceof Date ? data : new Date(data);
    var cz = {};
    if (!_format) _format = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    _format.formatToParts(t).forEach(function (p) { cz[p.type] = Number(p.value); });
    var lokalnie = Date.UTC(cz.year, cz.month - 1, cz.day, cz.hour, cz.minute);
    return { minuta: cz.hour * 60 + cz.minute, dzienRoku: Math.round((Date.UTC(cz.year, cz.month - 1, cz.day) - Date.UTC(cz.year, 0, 0)) / 86400000),
      przesuniecie: Math.round((lokalnie - Math.floor(t.getTime() / 60000) * 60000) / 60000) };
  }
  /** Wschód i zachód w minutach doby czasu polskiego: przybliżenie dla środka Polski (52°N, 19,5°E) wg dnia roku. Wystarcza do wyboru nieba, nie do nawigacji. */
  function wschodZachod(data) {
    var c = czasWPolsce(data), n = c.dzienRoku, rad = Math.PI / 180;
    var deklinacja = 23.44 * Math.sin(2 * Math.PI * (284 + n) / 365);
    var cosH = Math.max(-1, Math.min(1, -Math.tan(52 * rad) * Math.tan(deklinacja * rad)));
    var polowaDnia = 4 * Math.acos(cosH) / rad;
    var B = 2 * Math.PI * (n - 81) / 364, rownanieCzasu = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    var poludnie = 720 - 4 * 19.5 - rownanieCzasu + c.przesuniecie;
    return { wschod: poludnie - polowaDnia, zachod: poludnie + polowaDnia, minuta: c.minuta };
  }
  /** Data → 'swit' | 'dzien' | 'zmierzch' | 'noc'. Świt: godzina przed wschodem do pół godziny po. Zmierzch: pół godziny przed zachodem do godziny po. */
  function poraDnia(data) {
    var z = wschodZachod(data);
    if (z.minuta < z.wschod - 60) return "noc";
    if (z.minuta < z.wschod + 30) return "swit";
    if (z.minuta < z.zachod - 30) return "dzien";
    if (z.minuta < z.zachod + 60) return "zmierzch";
    return "noc";
  }
  var KOLORY_NIEBA = {
    swit: ["#2f3a6b", "#c9708a", "#ffc98f"], dzien: ["#5fb0e8", "#9fd3f2", "#d9f0fa"],
    zmierzch: ["#22224f", "#7d4a86", "#f08a5d"], noc: ["#050a1f", "#0b1438", "#1a2452"],
  };

  /* ── DOMKI I SZYLDY (czyste) ────────────────────────────────────────────────────── */
  function hash(tekst) {
    var h = 2166136261, t = String(tekst);
    for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /** Ta sama firma = zawsze ten sam domek: wybór 1–7 i odbicie liczone z nazwy (licznik nie oddaje id firmy). */
  function domekDla(klucz) {
    var h = hash(klucz);
    return { nazwa: "domek-" + (1 + (h % 7)), lustro: ((h >>> 8) & 1) === 1 };
  }
  /** Domki rotują wg miejsca na ulicy, żeby obok nie stały dwa takie same. Odbicie zostaje z nazwy firmy. */
  function domekNaMiejscu(nr, klucz) { return { nazwa: "domek-" + (1 + (nr % 7)), lustro: ((hash(klucz) >>> 8) & 1) === 1 }; }
  /** Logo bardzo jasne na przezroczystym tle zginęłoby na jasnej tabliczce: wtedy tabliczka ciemna. Awaria odczytu = jasna, bez błędu. */
  function jasneLogo(im) {
    try {
      var k = g.document.createElement("canvas"); k.width = 24; k.height = 24;
      var c = k.getContext("2d"); c.drawImage(im, 0, 0, 24, 24);
      var d = c.getImageData(0, 0, 24, 24).data, n = 0, suma = 0, przezr = 0;
      for (var i = 0; i < d.length; i += 4) { if (d[i + 3] < 40) { przezr++; continue; } n++; suma += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; }
      return n > 0 && przezr > 0 && suma / n >= 225;
    } catch (e) { return false; }
  }
  /** Prostokąt deski po odbiciu domku: deska zamienia strony, a napis stoi poza odbitym obrazem, więc lustrzany nie będzie. */
  function szyldNaDomku(rect, lustro) {
    return lustro ? [Math.round((1 - rect[0] - rect[2]) * 10000) / 10000, rect[1], rect[2], rect[3]] : rect.slice();
  }
  /** Tekst w deskę: najpierw jedna linia, potem zmniejszanie, potem dwie linie, na końcu wielokropek. mierz(tekst, rozmiar) → szerokość w px. */
  function dopasujSzyld(tekst, szer, wys, mierz, opcje) {
    var o = opcje || {}, maks = o.maks || 13, min = o.min || 8, t = String(tekst).replace(/\s+/g, " ").trim(), r;
    for (r = maks; r >= min; r -= 0.5) if (r * 1.15 <= wys && mierz(t, r) <= szer) return { rozmiar: r, linie: [t] };
    var slowa = t.split(" ");
    if (slowa.length > 1) {
      var najl = null, i;
      for (i = 1; i < slowa.length; i++) {
        var a = slowa.slice(0, i).join(" "), b = slowa.slice(i).join(" "), roznica = Math.abs(a.length - b.length);
        if (!najl || roznica < najl.roznica) najl = { a: a, b: b, roznica: roznica };
      }
      for (r = maks; r >= min; r -= 0.5) if (r * 2.15 <= wys && mierz(najl.a, r) <= szer && mierz(najl.b, r) <= szer) return { rozmiar: r, linie: [najl.a, najl.b] };
    }
    r = Math.max(min, Math.min(maks, wys / 1.15));
    var znaki = Array.from(t);
    while (znaki.length > 1 && mierz(znaki.join("") + "…", r) > szer) znaki.pop();
    return { rozmiar: r, linie: [znaki.join("").trim() + "…"] };
  }
  var _miara = null;
  /** Miara tekstu przez canvas (bez układania DOM). Bez canvasa: oszacowanie, wystarczy do wyboru rozmiaru. */
  function mierzTekst(tekst, rozmiar, waga) {
    try {
      if (!_miara) { var c = g.document.createElement("canvas"); _miara = c.getContext ? c.getContext("2d") : null; if (!_miara) _miara = false; }
      if (_miara) { _miara.font = (waga || 700) + " " + rozmiar + "px Inter, system-ui, sans-serif"; return _miara.measureText(tekst).width; }
    } catch (e) { _miara = false; }
    return Array.from(String(tekst)).length * rozmiar * 0.56;
  }
  function linkFirmy(u) {
    if (typeof u !== "string" || !u || !g.safeExternalHref || !g.safeExternalHref(u, { tylkoHttps: true })) return "";
    try { var p = new URL(u.trim()); return p.protocol === "https:" && !p.username && !p.password ? p.href : ""; } catch (e) { return ""; }   // adres z danymi logowania wygląda na inną stronę (red team 2)
  }

  /* ── DOM: tylko createElement i textContent ──────────────────────────────────────── */
  var NS = "http://www.w3.org/2000/svg";
  function s(tag, atr, rodzic, tekst) {
    var n = g.document.createElementNS(NS, tag);
    for (var k in atr) if (Object.prototype.hasOwnProperty.call(atr, k)) n.setAttribute(k, String(atr[k]));
    if (tekst != null) n.textContent = String(tekst);
    if (rodzic) rodzic.appendChild(n);
    return n;
  }
  function h(tag, klasa, rodzic, tekst) {
    var n = g.document.createElement(tag);
    if (klasa) n.setAttribute("class", klasa);
    if (tekst != null) n.textContent = String(tekst);
    if (rodzic) rodzic.appendChild(n);
    return n;
  }
  function wyczysc(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function prost(r, x, y, w, wys, fill, rx) { return s("rect", { x: x, y: y, width: w, height: wys, fill: fill, rx: rx || 0 }, r); }
  function kolo(r, cx, cy, ra, fill) { return s("circle", { cx: cx, cy: cy, r: ra, fill: fill }, r); }
  function kreska(r, x1, y1, x2, y2, kolor, gr) { return s("line", { x1: x1, y1: y1, x2: x2, y2: y2, stroke: kolor, "stroke-width": gr, "stroke-linecap": "round" }, r); }

  /* ── KSZTAŁTY (spadek, gdy nie ma pliku). Te same proporcje co grafiki. ─ */
  var ZOLTY = "#ffc400", ZOLTY2 = "#ffb000", POM = "#ff8a3d", POM2 = "#e8561e", OPONA = "#23252b", STAL = "#6b6f78", SZYBA = "#bfe6ff", OBRYS = "rgba(0,0,0,.45)";
  var KSZTALTY = {
    koparka: { vb: "0 0 54 42", rys: function (r) {
      prost(r, 3, 31, 33, 10, OPONA, 5); kolo(r, 9, 36, 2.6, STAL); kolo(r, 19.5, 36, 2.6, STAL); kolo(r, 30, 36, 2.6, STAL);
      prost(r, 7, 18, 26, 14, ZOLTY, 2).setAttribute("stroke", OBRYS);
      prost(r, 9, 6, 15, 14, ZOLTY2, 2).setAttribute("stroke", OBRYS); prost(r, 11, 8, 11, 7, SZYBA, 1);
      s("path", { d: "M30 20L42 8L48 22", fill: "none", stroke: ZOLTY, "stroke-width": 4.5, "stroke-linecap": "round", "stroke-linejoin": "round" }, r);
      s("path", { d: "M44 22h9l-2 8h-6z", fill: STAL, stroke: OBRYS }, r);
    } },
    walec: { vb: "0 0 56 38", rys: function (r) {
      kolo(r, 12, 30, 7.5, OPONA); kolo(r, 12, 30, 3, "#9aa0aa");
      kolo(r, 42, 27, 10.5, STAL).setAttribute("stroke", OBRYS); kolo(r, 42, 27, 5, "#3a3d44");
      prost(r, 5, 15, 31, 11, POM, 2).setAttribute("stroke", OBRYS); prost(r, 33, 15, 10, 4, POM, 1);
      prost(r, 9, 3, 17, 13, POM2, 2).setAttribute("stroke", OBRYS); prost(r, 11, 5, 13, 7, SZYBA, 1);
    } },
    dzwig: { vb: "0 0 72 50", rys: function (r) {
      prost(r, 6, 40, 34, 7, OPONA, 3); prost(r, 8, 26, 28, 14, ZOLTY, 2).setAttribute("stroke", OBRYS); prost(r, 12, 16, 14, 11, ZOLTY2, 2); prost(r, 14, 18, 10, 6, SZYBA, 1);
      kreska(r, 26, 24, 64, 4, ZOLTY, 3.5); kreska(r, 64, 4, 64, 28, OPONA, 1.2); prost(r, 56, 28, 16, 8, POM, 1).setAttribute("stroke", OBRYS);
    } },
    budowniczy: { vb: "0 0 28 44", rys: function (r) {
      prost(r, 9, 29, 4, 12, "#2b4c7e", 1); prost(r, 15, 29, 4, 12, "#2b4c7e", 1); prost(r, 8, 39, 6, 3.5, OPONA, 1); prost(r, 14, 39, 6, 3.5, OPONA, 1);
      kreska(r, 9, 18, 5, 26, POM2, 3.2);
      prost(r, 8, 16, 12, 14, "#ff7a18", 2).setAttribute("stroke", OBRYS); prost(r, 8, 21, 12, 2.4, "#fff2a8");
      kreska(r, 19, 18, 25, 9, POM2, 3.2); kolo(r, 25.5, 7.5, 2, "#f2c9a0");
      kolo(r, 14, 10.5, 5.5, "#f2c9a0");
      s("path", { d: "M8 9.5a6 6 0 0 1 12 0z", fill: "#ffd400", stroke: OBRYS, "stroke-width": ".6" }, r); prost(r, 6.5, 8.8, 15, 2, "#ffd400", 1);
    } },
    domek: { vb: "0 0 80 64", rys: function (r) {
      prost(r, 8, 26, 64, 38, "#f5efe3", 1).setAttribute("stroke", OBRYS);
      s("path", { d: "M0 28L40 2L80 28z", fill: "#c8553d", stroke: OBRYS }, r);
      prost(r, 34, 46, 12, 18, "#7a4f2c", 1); prost(r, 14, 42, 12, 10, SZYBA, 1); prost(r, 54, 42, 12, 10, SZYBA, 1); prost(r, 58, 4, 8, 12, "#b5533c", 1);
    } },
    drzewo: { vb: "0 0 40 44", rys: function (r) {
      prost(r, 18, 24, 4, 20, "#7a4f2c", 1); kolo(r, 20, 16, 15, "#e8892b").setAttribute("stroke", OBRYS);
    } },
    latarnia: { vb: "0 0 14 48", rys: function (r) {
      kreska(r, 7, 48, 7, 12, "#3a3d44", 2.2); kolo(r, 7, 8, 5, "#fff2a8").setAttribute("stroke", OBRYS);
    } },
    "plac-zabaw": { vb: "0 0 120 58", rys: function (r) {
      kreska(r, 8, 56, 18, 14, "#e76f51", 3); kreska(r, 30, 56, 18, 14, "#e76f51", 3); kreska(r, 18, 14, 62, 14, "#2a9d8f", 3); kreska(r, 54, 56, 62, 14, "#e76f51", 3);
      kreska(r, 36, 14, 36, 44, "#555", 1.2); prost(r, 31, 44, 10, 3, "#ffc400", 1); s("path", { d: "M76 20L114 56", stroke: "#ffc400", "stroke-width": 5, "stroke-linecap": "round" }, r); kreska(r, 76, 20, 76, 56, "#2a9d8f", 3);
    } },
    "plac-budowy": { vb: "0 0 360 170", rys: function (r) {
      s("path", { d: "M6 170Q10 140 40 136H320Q352 140 354 170z", fill: "#a9824c", stroke: OBRYS }, r);
      s("path", { d: "M10 150q30 -46 64 0z", fill: "#c8553d", stroke: OBRYS }, r); s("path", { d: "M284 150q30 -34 62 0z", fill: "#c8a15e", stroke: OBRYS }, r);
      prost(r, 120, 76, 12, 72, "#c98a3c", 1); prost(r, 228, 76, 12, 72, "#c98a3c", 1);
      prost(r, 104, 28, 152, 58, "#f0b24a", 8).setAttribute("stroke", "#5a2d0c");
      [[122, 148], [238, 148]].forEach(function (p) { s("path", { d: "M" + (p[0] - 11) + " " + p[1] + "L" + p[0] + " " + (p[1] - 28) + "L" + (p[0] + 11) + " " + p[1] + "z", fill: POM, stroke: OBRYS }, r); });
    } },
  };
  /** Rysuje spadek danej warstwy jako <svg>. Domki 1–7 mają wspólny kształt. */
  function ksztalt(nazwa, klasa, rodzic) {
    var kt = KSZTALTY[/^domek-/.test(nazwa) ? "domek" : nazwa];
    if (!kt) return null;
    var svg = s("svg", { viewBox: kt.vb, class: klasa || "", "aria-hidden": "true", focusable: "false", preserveAspectRatio: "xMidYMax meet" }, rodzic);
    kt.rys(svg);
    return svg;
  }
  /** Warstwa w elemencie: najpierw kształt, po udanym onload obraz w jego miejsce. 404 zostawia kształt; onerror nic nie psuje. */
  var _obrazy = {};
  function sprawdzObraz(nazwa) {
    if (_obrazy[nazwa]) return _obrazy[nazwa];
    _obrazy[nazwa] = new Promise(function (ok) {
      try {
        var im = new g.Image();
        im.onload = function () { ok(im.naturalWidth > 0 || im.width > 0); };
        im.onerror = function () { ok(false); };
        im.src = sciezkaObrazu(nazwa);
      } catch (e) { ok(false); }
    });
    return _obrazy[nazwa];
  }
  function warstwa(nazwa, rodzic, klasaObrazu) {
    var svg = ksztalt(nazwa, "um-ksztalt", rodzic);
    return sprawdzObraz(nazwa).then(function (jest) {
      if (!jest || !rodzic.parentNode) return false;
      var im = g.document.createElement("img");
      im.setAttribute("src", sciezkaObrazu(nazwa)); im.setAttribute("alt", ""); im.setAttribute("class", klasaObrazu || "um-obraz"); im.setAttribute("decoding", "async");
      if (svg && svg.parentNode === rodzic) rodzic.removeChild(svg);
      rodzic.appendChild(im);
      return true;
    });
  }

  /* ── MINIATURA: nieruchoma, na karty. Bez pętli, bez dźwięku, bez paralaksy. ─────── */
  var CSS = ".um{display:block;margin:12px 0;color:var(--fg,#f0ede8);font-family:Inter,system-ui,sans-serif;text-decoration:none}" +
    ".um--ramka{background:var(--card,#0f0f14);border:1px solid var(--border,rgba(255,255,255,.1));border-radius:18px;padding:14px;margin:14px 0}" +
    ".um-tytul{font:400 22px/1.1 'Bebas Neue',Inter,sans-serif;letter-spacing:.04em;margin:0 0 8px}" +
    ".um-proba{display:inline-block;margin-left:8px;padding:2px 6px;border-radius:6px;background:#e8561e;color:#fff;font:600 10px/1.3 Inter,sans-serif;letter-spacing:.1em;vertical-align:middle}" +
    ".um-okno{position:relative;height:118px;border-radius:14px;overflow:hidden;background:#5f8a3a}" +
    ".um-laka{position:absolute;left:0;right:0;top:56px;bottom:0;background:linear-gradient(#86ad55,#5f8a3a)}" +
    ".um-grunt,.um-droga{position:absolute;left:0;bottom:6px;height:40px}.um-grunt{right:0;background:linear-gradient(#6d8f3f 0 14%,#8c6d3f 14% 78%,#5f8a3a 78%)}" +
    ".um-droga{background-color:#3a3d44;background-repeat:repeat-x;background-size:134px 40px}" +
    ".um-sprite{position:absolute;bottom:14px}.um-koparka{width:72px;height:50px}.um-walec{width:60px;height:48px}.um-budowniczy{width:26px;height:46px;bottom:4px}" +
    ".um-plac{left:50%;bottom:4px;width:216px;height:102px;margin-left:-108px}" +
    ".um-ksztalt,.um-obraz{display:block;width:100%;height:100%;object-fit:contain;object-position:50% 100%}" +
    ".um-tablica-przed{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;color:#5a2d0c;font:700 12px/1.1 Inter,system-ui,sans-serif}" +
    ".um-tablica{position:absolute;right:10px;top:10px;padding:4px 10px;border-radius:5px;background:#1d4e89;border:1.5px solid #fff;color:#fff;font:700 13px/1.2 Inter,system-ui,sans-serif}" +
    ".um-opis{margin:8px 0 0;font-size:12px;line-height:1.45;color:var(--fg2,rgba(240,237,232,.72))}" +
    ".um-link{display:inline-block;margin-top:6px;font-size:12px;font-weight:600;color:#ff8a3d}";
  function wstrzyknijCss() {
    if (g.document.getElementById("bm-ulica-css")) return;
    var st = g.document.createElement("style"); st.setAttribute("id", "bm-ulica-css"); st.textContent = CSS;
    g.document.head.appendChild(st);
  }
  function tloNieba(pora) { var k = KOLORY_NIEBA[pora] || KOLORY_NIEBA.dzien; return "linear-gradient(" + k[0] + "," + k[1] + " 55%," + k[2] + ")"; }
  function renderuj(kontener, licznik, o) {
    var stan = stanUlicy(licznik);
    if (stan.faza === "brak") { wyczysc(kontener); kontener._bmUlica = null; return false; }
    var przed = stan.faza === "przed", dane = przed ? { imie: "", nazwa: "", cel_km: 0, firmy: [] } : daneScenyZLicznika(licznik);
    var dod = przed ? PUSTE_DODATKI : dodatkiBezpieczne(licznik.ulica);   // cegiełki i elementy z progów: pole licznika, tylko po starcie; brak pola = sama droga
    var pora = poraDnia(new Date());
    var klucz = JSON.stringify([stan, dane, dod, pora, !!o.kompakt, !!o.ramka, !!o.proba, !!o.bezLinku]);
    if (kontener._bmUlica === klucz && kontener.firstChild) return true;
    wstrzyknijCss();
    var korzen = h(o.bezLinku || przed ? "div" : "a", "um" + (o.ramka ? " um--ramka" : ""));
    if (!(o.bezLinku || przed)) korzen.setAttribute("href", "dla-fabianka.html");
    var tytul = przed || o.kompakt ? "" : (tytulUlicy(dane.imie) || "Ulica w budowie");
    if (tytul || o.proba) {
      var nag = h("div", "um-tytul", korzen, tytul);
      if (o.proba) h("span", "um-proba", nag, "PRÓBA");
    }
    var okno = h("div", "um-okno", korzen);
    okno.setAttribute("role", "img");
    okno.setAttribute("aria-label", opisDlaCzytnika(stan, dane, dod));
    okno.style.background = tloNieba(pora);
    h("div", "um-laka", okno);
    if (przed) {
      var plac = h("div", "um-sprite um-plac", okno);
      warstwa("plac-budowy", plac);
      var r = SZYLDY["plac-budowy"].szyld, t = h("div", "um-tablica-przed", plac, "Wkrótce budowa");
      t.style.left = (r[0] * 100) + "%"; t.style.top = (r[1] * 100) + "%"; t.style.width = (r[2] * 100) + "%"; t.style.height = (r[3] * 100) + "%";
    } else {
      var proc = stan.odcinki / ODCINKOW * 100, maszyny = Math.max(30, Math.min(70, proc));
      h("div", "um-grunt", okno);
      var dr = h("div", "um-droga", okno);
      dr.style.width = proc + "%";
      dr.style.backgroundImage = "url(" + sciezkaObrazu("droga") + ")";
      if (stan.faza === "trwa") {
        var w = h("div", "um-sprite um-walec", okno), ko = h("div", "um-sprite um-koparka", okno);
        w.style.left = "calc(" + maszyny + "% - 62px)"; ko.style.left = "calc(" + maszyny + "% + 2px)";
        warstwa("walec", w); warstwa("koparka", ko);
      }
      var bu = h("div", "um-sprite um-budowniczy", okno);
      bu.style.left = stan.faza === "pelna" ? "16px" : "calc(" + maszyny + "% - 14px)";
      warstwa("budowniczy", bu);
      if (stan.faza === "pelna") h("div", "um-tablica", okno, tytulUlicy(dane.imie) || "Gotowa ulica");
      h("p", "um-opis", korzen, tekstPostepu(stan));
      if (!o.bezLinku) h("span", "um-link", korzen, "Zobacz ulicę ›");
    }
    wyczysc(kontener);
    kontener.appendChild(korzen);
    kontener._bmUlica = klucz;
    return true;
  }
  /** Miniatura w kontenerze. Nigdy nie rzuca; awaria = pusty kontener, bez nagłówka. opcje: { kompakt, ramka, proba, bezLinku }. */
  function zamontuj(kontener, licznik, opcje) {
    if (!kontener) return false;
    try {
      return renderuj(kontener, licznik, opcje || {});
    } catch (e) {
      try { wyczysc(kontener); kontener._bmUlica = null; } catch (e2) {}
      return false;
    }
  }

  /* ── STRONA AKCJI: pełna scena z osobnego pliku; brak pliku albo awaria = miniatura ─ */
  function czyParametrProby() { try { return new URLSearchParams(g.location.search).get("proba") === "1"; } catch (e) { return false; } }
  function parametrSciezki() { try { return new URLSearchParams(g.location.search).get("sciezka") === "1"; } catch (e) { return false; } }
  function zaladujSkrypt(src) {
    return new Promise(function (ok, nie) {
      var el = g.document.createElement("script");
      el.src = src; el.async = true; el.onload = ok; el.onerror = nie;
      g.document.head.appendChild(el);
    });
  }
  var _idProby;   // undefined = nie sprawdzono, null = to nie konto testowe
  /** ?proba=1 na stronie akcji: licznik próby TYLKO dla zalogowanego konta testowego (slugDla === 'proba'). Każdy inny → null, czyli prawdziwa akcja. */
  async function licznikProby() {
    try {
      if (_idProby === null || !g.sb || !g.sb.auth) return null;
      if (_idProby === undefined) {
        var ses = await g.sb.auth.getSession(), uzytk = ses && ses.data && ses.data.session && ses.data.session.user;
        if (!uzytk) { _idProby = null; return null; }
        var at = await g.sb.from("athletes").select("id").eq("user_id", uzytk.id).maybeSingle();
        if (!g.BM_AKCJA_CYTATY) await zaladujSkrypt("js/akcja-cytaty.mjs");
        if (!g.BM_AKCJA_CYTATY) { _idProby = null; return null; }
        var testowe = !at.error && at.data && g.BM_AKCJA_CYTATY.slugDla(at.data.id) === "proba";
        /* Pełna próba: trener też ogląda próbę, bo to on przesuwa suwak. Zamkiem jest baza: akcja_sciezka_stan odmawia każdemu innemu. */
        if (!testowe && parametrSciezki()) { var st = await g.sb.rpc("akcja_sciezka_stan"); if (st.error) { _idProby = null; return null; } _idProby = "trener"; }
        else if (!testowe) { _idProby = null; return null; }
        else _idProby = at.data.id;
      }
      if (_idProby === "trener") {
        var lt = await g.sb.rpc("akcja_licznik", { p_slug: "proba" });
        if (lt.error || !lt.data) return null;
        if (lt.data.wystartowala) { var wz = await g.BM_AKCJA_CYTATY.wizerunekProby(g.sb); if (wz) { lt.data.koparka_url = wz.koparka_url; lt.data.koparka_arkusz_url = wz.koparka_arkusz_url; lt.data.film_akcji_url = wz.film_akcji_url; } }
        return lt.data;
      }
      return await g.BM_AKCJA_CYTATY.odswiezStan(g.sb, _idProby, { wymus: true });
    } catch (e) { return null; }
  }
  function usun(kontener) {
    if (!kontener) return;
    try { if (kontener._bmScena) kontener._bmScena.zniszcz(); } catch (e) {}
    kontener._bmScena = null; kontener._bmUlica = null; kontener._bmCzeka = null;
    kontener.style.minHeight = "";
    wyczysc(kontener);
  }
  var _scena = null;
  function ladujScene() {
    if (g.BM_ULICA_SCENA) return Promise.resolve(g.BM_ULICA_SCENA);
    if (!_scena) _scena = zaladujSkrypt("js/ulica-scena.mjs").then(function () { if (!g.BM_ULICA_SCENA) throw new Error("brak sceny"); return g.BM_ULICA_SCENA; });
    return _scena;
  }
  function wstaw(licznik, dp, k) {
    var d = dp || licznik, tu = licznik && licznik.wystartowala === true ? k.po : k.przed, tam = tu === k.po ? k.przed : k.po;
    usun(tam);
    if (!tu) return false;
    if (stanUlicy(d).faza === "brak") { usun(tu); return false; }
    var o = { proba: !!dp, pokaz: k.pokaz };
    if (tu._bmScena) { tu._bmScena.aktualizuj(d); return true; }
    if (tu._bmCzeka) { tu._bmCzeka = d; return true; }   // scena właśnie się ładuje: wejdzie z najnowszym licznikiem
    tu._bmCzeka = d;
    tu.style.minHeight = "340px";   // miejsce na scenę od razu, żeby treść pod spodem nie skakała
    var awaryjnie = function () {
      var ost = tu._bmCzeka || d;
      tu._bmCzeka = null; tu.style.minHeight = "";
      zamontuj(tu, ost, { ramka: true, bezLinku: true, proba: o.proba });
    };
    return ladujScene().then(function (S) {
      var ost = tu._bmCzeka || d;
      tu._bmCzeka = null; tu.style.minHeight = "";
      var kontroler = S.zamontuj(tu, ost, o);
      if (!kontroler) throw new Error("scena nie wstała");
      tu._bmScena = kontroler;
      return true;
    }).catch(awaryjnie);
  }
  /** Punkt wpięcia dla strony akcji: kontener zależy od tego, co widać na stronie (zapowiedź albo pełna strona); drugi kontener czyszczony. Licznik w trakcie oglądania idzie do aktualizuj. */
  function naStronie(licznik, kontenery) {
    var k = kontenery || {};
    if (!czyParametrProby()) return wstaw(licznik, null, k);
    return licznikProby().then(function (dp) { return wstaw(licznik, dp, k); }, function () { return wstaw(licznik, null, k); });
  }

  /* ── PANEL TRENERA: czyste walidacje + formularze na DOM. Zamkiem jest baza (RLS, CHECK-i), tu są wygoda i komunikaty po polsku. ─ */
  var RE_IMIE = /^(?=.{2,20}$)[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+(?:-[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+)?$/;   // to samo co CHECK w bazie: jedno słowo, najwyżej jeden łącznik („Anna-Maria”), bez spacji i cyfr
  var SLUG_PANELU = "dla-fabianka";
  var PROCENT_PROGU = { latarnie: 25, plac_zabaw: 50, park: 100 };   // % celu zbiórki (Filip 4.11); publicznie liczy to baza, tu podgląd w panelu
  /** "1 000,50" → 1000.5; puste → null; zły zapis → NaN. */
  function kwotaZTekstu(t) {
    var s0 = String(t == null ? "" : t).replace(/[\s ]/g, "").replace(/zł$/i, "").replace(",", ".");
    if (!s0) return null;
    return /^\d{1,10}(\.\d{1,2})?$/.test(s0) ? Number(s0) : NaN;
  }
  /** Formularz kwoty i celu → { blad } | { wiersz }. Pusty cel = null = nic się nie odblokowuje; wartości domyślnych nie ma. */
  function kwotaICelDoZapisu(p) {
    var o = p || {}, kw = kwotaZTekstu(o.kwota), cel = kwotaZTekstu(o.cel);
    if (isNaN(kw)) return { blad: "Kwota: podaj liczbę w złotych, np. 12500 albo 12500,50." };
    if (cel !== null && !(cel > 0)) return { blad: "Cel: liczba w złotych większa od zera albo puste pole." };
    return { wiersz: { kwota_zl: kw, cel_zl: cel } };
  }
  /** Które elementy widać przy tej kwocie (podgląd w panelu; publicznie liczy to baza, po starcie). */
  function odblokowane(w) {
    if (!w || w.kwota_zl == null || w.cel_zl == null) return [];
    var k = Math.round(Number(w.kwota_zl) * 100), c = Math.round(Number(w.cel_zl) * 100);   // w groszach: bez błędów ułamków przy równym progu
    return Object.keys(PROCENT_PROGU).filter(function (e) { return k * 100 >= c * PROCENT_PROGU[e]; });
  }
  /** Formularz cegiełki → { blad } | { wiersz }. Zgoda tylko jawnie zaznaczona. */
  function cegielkaDoZapisu(p) {
    var o = p || {}, imie = String(o.imie == null ? "" : o.imie).trim();
    if (!RE_IMIE.test(imie)) return { blad: "Imię: jedno słowo, same litery, od 2 do 20 znaków, najwyżej jeden łącznik (Anna-Maria). Bez nazwiska." };
    /* imię stoi publicznie przy zbiórce dla dziecka; bez filtra (nie wczytał się) nie zapisujemy */
    var M = g.BM_MODERACJA;
    if (!M) return { blad: "Filtr imion się nie wczytał. Odśwież stronę." };
    var filtr = M.sprawdz(imie, { rodzaj: "imie" });
    if (!filtr.ok) return { blad: "To imię nie pójdzie na zbiórkę. Filtr widzi tu niedozwolone słowo." };
    if (o.potwierdzenie !== true) return { blad: "Zaznacz „Potwierdzenie wpłaty widziane: tak”." };
    return { wiersz: { imie: imie, zgoda: o.zgoda === true, potwierdzenie_widziane: true } };
  }
  function komunikatBledu(e) {
    var kod = e && (e.code || e.statusCode);
    if (kod === "42P01" || kod === "PGRST205" || kod === "PGRST202") return "tabel ulicy jeszcze nie ma w bazie (migracja 20261104_akcja_ulica).";
    if (kod === "42501" || kod === "403" || kod === 403) return "baza odmówiła: to konto nie ma uprawnień trenera.";
    if (kod === "23514") return "baza odrzuciła dane: imię musi być jednym słowem (najwyżej jeden łącznik), a kwoty liczbami.";
    return (e && e.message) || "błąd połączenia.";
  }
  function pole(rodzic, id, etykieta, atr) {
    var f = h("div", "field", rodzic), l = h("label", "", f, etykieta);
    l.setAttribute("for", id);
    var i = h("input", "", f);
    i.setAttribute("id", id); i.setAttribute("type", "text"); i.setAttribute("autocomplete", "off");
    for (var k in atr) if (Object.prototype.hasOwnProperty.call(atr, k)) i.setAttribute(k, atr[k]);
    return i;
  }
  function przelacznik(rodzic, id, tekst) {
    var l = h("label", "ulica-panel-zgoda", rodzic), i = h("input", "", l);
    i.setAttribute("type", "checkbox"); i.setAttribute("id", id);
    h("span", "", l, tekst);
    return i;
  }
  /** Sekcja panelu w trener.html: kwota, cel, cegiełki. Dane wczytywane przy pierwszym otwarciu. */
  function panelTrenera(kontener, sb) {
    if (!kontener || !sb || typeof sb.from !== "function") return false;
    wyczysc(kontener);
    var det = h("details", "fi ulica-panel", kontener);
    det.setAttribute("id", "ulica-sec");
    det.setAttribute("style", "margin:0 16px 16px;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px 18px;");
    h("summary", "ulica-panel-tytul", det, "Ulica akcji: kwota, cel, wpisy osób wpłacających").setAttribute("style", "cursor:pointer;font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:.04em;color:var(--fg);");

    var fk = h("form", "add-form", det);
    fk.setAttribute("novalidate", ""); fk.setAttribute("style", "margin-top:12px;");
    h("p", "", fk, "Kwotę i cel zbiórki wpisujesz ręcznie. Latarnie pojawiają się przy 25 % celu, plac zabaw przy 50 %, park przy 100 %. Bez celu nic się nie pokazuje. Publicznie wychodzi tylko to, co odblokowane, po starcie; kwota i cel nigdy.").setAttribute("style", "font-size:12px;line-height:1.45;color:var(--muted);margin:0;");
    var iKwota = pole(fk, "ulica-kwota", "Kwota ze zbiórki (zł)", { inputmode: "decimal" });
    var iCel = pole(fk, "ulica-cel", "Cel zbiórki (zł)", { inputmode: "decimal" });
    var podglad = h("div", "", fk); podglad.setAttribute("style", "font-size:12px;line-height:1.4;color:var(--fg2);");
    var blK = h("div", "", fk); blK.setAttribute("role", "alert"); blK.setAttribute("style", "font-size:13px;line-height:1.4;color:var(--red);");
    var zK = h("button", "btn btn-p", fk, "Zapisz kwotę i cel"); zK.setAttribute("type", "submit");

    var fc = h("form", "add-form", det);
    fc.setAttribute("novalidate", ""); fc.setAttribute("style", "margin-top:18px;");
    h("p", "", fc, "Wpis osoby wpłacającej: dodajesz po zobaczeniu potwierdzenia wpłaty. Imię w murze tylko przy zaznaczonej zgodzie; bez niej wpis stoi bez imienia.").setAttribute("style", "font-size:12px;line-height:1.45;color:var(--muted);margin:0;");
    var iImie = pole(fc, "ulica-imie", "Imię (jedno słowo, może być z łącznikiem)", { maxlength: "20" });
    var iZgoda = przelacznik(fc, "ulica-zgoda", "Osoba zgodziła się na imię w murze");
    var iPotw = przelacznik(fc, "ulica-potwierdzenie", "Potwierdzenie wpłaty widziane: tak");
    var blC = h("div", "", fc); blC.setAttribute("role", "alert"); blC.setAttribute("style", "font-size:13px;line-height:1.4;color:var(--red);");
    var zC = h("button", "btn btn-p", fc, "Dodaj wpis"); zC.setAttribute("type", "submit");
    var lista = h("div", "", det); lista.setAttribute("style", "margin-top:14px;");

    var wczytano = false;
    function pokazPodglad(w) {
      var odb = odblokowane(w).map(function (e) { return NAZWY_ELEMENTOW[e]; });
      podglad.textContent = "Przy tej kwocie po starcie widać: " + (odb.length ? odb.join(", ") : "nic z progów") + ".";
    }
    function wartosc(x) { return x == null ? "" : String(x); }
    async function wczytajKwote() {
      var r = await sb.from("akcja_ulica").select("kwota_zl,cel_zl").eq("akcja_slug", SLUG_PANELU).maybeSingle();
      if (r.error) { blK.textContent = "Nie udało się wczytać: " + komunikatBledu(r.error); return; }
      var w = r.data || {};
      iKwota.value = wartosc(w.kwota_zl); iCel.value = wartosc(w.cel_zl);
      pokazPodglad(w);
    }
    function wierszCegielki(c) {
      var w = h("div", "", lista); w.setAttribute("style", "display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--border);");
      var op = h("div", "", w); op.setAttribute("style", "flex:1;min-width:0;font-size:13px;line-height:1.35;overflow-wrap:anywhere;color:var(--fg);");
      h("div", "", op, c.imie);
      var dalej = h("div", "", op, (c.zgoda ? "imię w murze" : "bez zgody: wpis bez imienia") + " · dodano " + new Date(c.dodano).toLocaleDateString("pl-PL"));
      dalej.setAttribute("style", "font-size:11px;color:var(--muted);");
      var us = h("button", "", w, "Usuń"); us.setAttribute("type", "button");
      us.setAttribute("style", "flex:none;background:none;border:1px solid var(--border);border-radius:8px;color:var(--red);font-size:11px;padding:6px 10px;cursor:pointer;");
      us.addEventListener("click", async function () {
        if (!g.confirm("Usunąć wpis: " + c.imie + "?")) return;
        us.disabled = true;
        var r = await sb.from("akcja_cegielki").delete().eq("id", c.id).select("id");
        if (r.error || !r.data || !r.data.length) { us.disabled = false; blC.textContent = "Nie udało się usunąć: " + (r.error ? komunikatBledu(r.error) : "baza odmówiła."); return; }
        await wczytajCegielki();
      });
    }
    async function wczytajCegielki() {
      var r = await sb.from("akcja_cegielki").select("id,imie,zgoda,dodano").eq("akcja_slug", SLUG_PANELU).order("dodano").order("id");
      wyczysc(lista);
      if (r.error) { lista.textContent = "Nie udało się wczytać wpisów: " + komunikatBledu(r.error); return; }
      if (!r.data || !r.data.length) { h("div", "", lista, "Na razie bez wpisów: muru na rysunku nie widać.").setAttribute("style", "font-size:12px;color:var(--muted);"); return; }
      r.data.forEach(wierszCegielki);
    }
    det.addEventListener("toggle", function () {
      if (!det.open || wczytano) return;
      wczytano = true;
      wczytajKwote().catch(function (e) { blK.textContent = komunikatBledu(e); });
      wczytajCegielki().catch(function (e) { lista.textContent = komunikatBledu(e); });
    });
    fk.addEventListener("submit", async function (e) {
      e.preventDefault(); blK.textContent = "";
      var p = kwotaICelDoZapisu({ kwota: iKwota.value, cel: iCel.value });
      if (p.blad) { blK.textContent = p.blad; return; }
      zK.disabled = true;
      try {
        var r = await sb.from("akcja_ulica").upsert(Object.assign({ akcja_slug: SLUG_PANELU }, p.wiersz), { onConflict: "akcja_slug" });
        if (r.error) throw r.error;
        pokazPodglad(p.wiersz);
        if (g.showToast) g.showToast("Zapisano kwotę i cel.");
      } catch (err) { blK.textContent = "Nie udało się zapisać: " + komunikatBledu(err); } finally { zK.disabled = false; }
    });
    fc.addEventListener("submit", async function (e) {
      e.preventDefault(); blC.textContent = "";
      var p = cegielkaDoZapisu({ imie: iImie.value, zgoda: iZgoda.checked, potwierdzenie: iPotw.checked });
      if (p.blad) { blC.textContent = p.blad; return; }
      zC.disabled = true;
      try {
        var r = await sb.from("akcja_cegielki").insert(p.wiersz);
        if (r.error) throw r.error;
        fc.reset();
        await wczytajCegielki();
      } catch (err) { blC.textContent = "Nie udało się zapisać: " + komunikatBledu(err); } finally { zC.disabled = false; }
    });
    return true;
  }

  g.BM_ULICA = { licznikProby: licznikProby, czyParametrProby: czyParametrProby, stanUlicy: stanUlicy, doNastepnego: doNastepnego, coSwietowac: coSwietowac, zamontuj: zamontuj, naStronie: naStronie, panelTrenera: panelTrenera,
    poraDnia: poraDnia, wschodZachod: wschodZachod, zFirmamiNaMurze: zFirmamiNaMurze, jasneLogo: jasneLogo, domekNaMiejscu: domekNaMiejscu, domekDla: domekDla, szyldNaDomku: szyldNaDomku, dopasujSzyld: dopasujSzyld, mierzTekst: mierzTekst, linkFirmy: linkFirmy, tloNieba: tloNieba,
    sciezkaObrazu: sciezkaObrazu, ksztalt: ksztalt, formatKm: formatKm, tytulUlicy: tytulUlicy, tekstPostepu: tekstPostepu, tekstMuru: tekstMuru, procentMuru: procentMuru, zdanieOZbiorce: zdanieOZbiorce, rysunekKoparki: rysunekKoparki, opisDlaCzytnika: opisDlaCzytnika, daneScenyZLicznika: daneScenyZLicznika, dodatkiBezpieczne: dodatkiBezpieczne,
    kwotaICelDoZapisu: kwotaICelDoZapisu, PROCENT_PROGU: PROCENT_PROGU, cegielkaDoZapisu: cegielkaDoZapisu, kwotaZTekstu: kwotaZTekstu, odblokowane: odblokowane,
    WARSTWY: WARSTWY, ELEMENTY: ELEMENTY, SZYLDY: SZYLDY, KOLORY_NIEBA: KOLORY_NIEBA, NAZWY_ELEMENTOW: NAZWY_ELEMENTOW, KM_NA_ODCINEK: KM_NA_ODCINEK, ODCINKOW: ODCINKOW };
})(typeof globalThis !== "undefined" ? globalThis : this);
