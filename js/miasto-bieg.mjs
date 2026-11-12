// BIEG WIRTUALNY: pokaz od A do Z na spotkanie 18.11 (Miasto Dobra). Plik BEZ import/export (globalThis.BM_BIEG), jak js/miasto.mjs: ładowany skryptem w miasto-bieg.html, importowalny w testach.
// Atrapa: nic nie zapisuje w bazie i nic nie wysyła. Wszystko, co da się zrobić uczciwie w przeglądarce, działa naprawdę: numer startowy, dyplom, plakat, grafika, kod QR (własny koder, bez CDN),
// udostępnianie przez Web Share z zapasowym pobraniem. Dane uczestników wymyślone (imiona bez nazwisk, numery), oznaczone PRZYKŁAD przy każdej liczbie; nie wchodzą do żadnej sumy.
// Jedyny zapis w przeglądarce: stan pokazu (localStorage), żeby po odświeżeniu numer i dyplom zostały. Pieniądze idą wyłącznie przez organizację prowadzącą zbiórkę; BiegaMy nic nie przyjmuje.
(function (g) {
  "use strict";
  var KLUCZ_PAMIECI = "bm_bieg_pokaz";
  var BIEG = { id: "bieg", przyklad: true, nazwa: "Bieg Wirtualny", podtytul: "bieg i spacer dla jednej zbiórki", forma: "Wirtualny bieg charytatywny",
    okno: { od: "2026-11-21", do: "2026-11-22", opis: "sobota–niedziela, 21–22 listopada" }, cel_km: 5000, suma_km: 1840, osoby_n: 312, cegly_n: 180, firmy_n: 3, limit_n: 500,
    lista_publiczna: true, wesprzyj_n: 97 };
  var DYSTANSE = [
    { id: "5", nazwa: "5 km", km: 5, opis: "dla każdego, kto biega od niedawna", ikona: "assets/miasto/bieg-dystans-5.svg" },
    { id: "10", nazwa: "10 km", km: 10, opis: "dla tych, którzy lubią dłużej", ikona: "assets/miasto/bieg-dystans-10.svg" },
    { id: "twoj", nazwa: "Twój dystans", km: 0, opis: "spacer, marsz, nordic walking, wózek, dziecko 1 km", ikona: "assets/miasto/bieg-dystans-twoj.svg" }
  ];
  var JAK = [
    { tytul: "Zapisz się", opis: "Udział jest bezpłatny. Podajesz dystans i imię na dyplom.", ikona: "assets/miasto/bieg-krok-1.svg" },
    { tytul: "Jeśli chcesz, wesprzyj zbiórkę", opis: "Bezpośrednio u organizacji prowadzącej zbiórkę. Link wychodzi poza BiegaMy: nie widzimy wpłat i niczego nie pobieramy.", ikona: "assets/miasto/bieg-krok-2.svg" },
    { tytul: "Pobiegnij albo przejdź swój dystans", opis: "Gdziekolwiek, w oknie biegu. Z zegarkiem albo bez.", ikona: "assets/miasto/bieg-krok-3.svg" },
    { tytul: "Odbierz numer, dyplom i odznakę", opis: "Twoje kilometry budują ulicę biegu w Mieście Dobra.", ikona: "assets/miasto/bieg-krok-4.svg" }
  ];
  var IMIONA = ["Ania", "Bartek", "Celina", "Darek", "Ewa", "Franek", "Gosia", "Hania", "Igor", "Jagoda", "Kuba", "Lena", "Marek", "Natalia", "Olek", "Paulina", "Radek", "Sylwia", "Tomek", "Ula", "Wojtek", "Zosia",
    "Agata", "Błażej", "Dorota", "Emil", "Grzesiek", "Iza", "Janek", "Karolina", "Łukasz", "Magda", "Norbert", "Ola", "Piotrek", "Renata", "Staszek", "Tosia", "Wiktor", "Zuza", "Basia", "Czarek", "Dominika", "Ewelina", "Hubert", "Julka", "Krzysiek", "Marta"];
  var FIRMY_PRZYKLADOWE = [{ nazwa: "Piekarnia na Rogu", rodzaj: "domek" }, { nazwa: "Warsztat Rowerowy", rodzaj: "domek" }, { nazwa: "Studio Ruchu", rodzaj: "wiezowiec" }];
  var CHECKLISTA = ["Nazwa biegu i dystanse", "Okno biegu (od–do) i limit miejsc", "Grafiki: plakat, grafika do mediów społecznościowych, numer startowy, dyplom", "Zgoda opiekuna na imię bohatera, jeśli bohater ma być na stronie biegu",
    "Link do oficjalnej zbiórki (jedyne miejsce wpłat)", "Treść zgody na kontakt od organizacji", "Kto odpowiada na pytania uczestników w weekend biegu"];

  /* ── POMOCNICZE ───────────────────────────────────────────────────────────────────────────── */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function liczba(n, miejsc) {
    n = Number(n); if (!isFinite(n)) n = 0;
    var m = miejsc == null ? 0 : miejsc, t = (Math.round(Math.abs(n) * Math.pow(10, m)) / Math.pow(10, m)).toFixed(m), cz = t.split("."), ul = (cz[1] || "").replace(/0+$/, "");
    return (n < 0 ? "-" : "") + cz[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (ul ? "," + ul : "");
  }
  function km(x) { var n = Number(x) || 0; return liczba(n, n > 0 && n < 10 ? 1 : 0); }
  function forma(n, f) { n = Math.abs(Math.round(Number(n) || 0)); var r = n % 10, s = n % 100; return n === 1 ? f[0] : r >= 2 && r <= 4 && (s < 12 || s > 14) ? f[1] : f[2]; }
  function odmiana(n, f) { return liczba(n) + " " + forma(n, f); }
  function procent(suma, cel) { return !(Number(cel) > 0) ? 0 : Math.min(100, Math.floor(Number(suma || 0) / Number(cel) * 1000) / 10); }
  function p2(x) { return String(x).padStart(2, "0"); }
  /** Sekundy → „24:31” albo „1:02:05”. */
  function czas(s) { s = Math.max(0, Math.round(Number(s) || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sek = s % 60; return h ? h + ":" + p2(m) + ":" + p2(sek) : m + ":" + p2(sek); }
  /** Tempo min/km jako „4:54 /km”; bez dystansu pusto. */
  function tempo(s, kmDyst) { if (!(kmDyst > 0) || !(s > 0)) return ""; var t = Math.round(s / kmDyst), m = Math.floor(t / 60); return m + ":" + p2(t % 60) + " /km"; }
  /** „12:34” lub „1:02:34” → sekundy; nic sensownego → null. */
  function sekundyZTekstu(t) {
    var m = /^\s*(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\s*$/.exec(String(t || ""));
    if (!m) return null;
    var s = (Number(m[1]) || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    return m[3] < 60 && s > 0 ? s : null;
  }
  var MIESIACE = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  function dataPolska(d) { d = d instanceof Date ? d : new Date(d); return isFinite(d.getTime()) ? d.getDate() + " " + MIESIACE[d.getMonth()] + " " + d.getFullYear() : ""; }
  function dystans(id) { for (var i = 0; i < DYSTANSE.length; i++) if (DYSTANSE[i].id === id) return DYSTANSE[i]; return DYSTANSE[0]; }
  /** Imię na dyplom: litery, spacja, łącznik, do 24 znaków; pierwsza wielka. Zostaje tylko w przeglądarce. */
  function ladneImie(t) {
    var s = String(t == null ? "" : t).trim().replace(/\s+/g, " ").slice(0, 24);
    if (!/^[\p{L}][\p{L} \-]*$/u.test(s)) return "";
    return s.split(" ").map(function (cz) { return cz.charAt(0).toLocaleUpperCase("pl-PL") + cz.slice(1); }).join(" ");
  }
  function bezRuchu() { try { return !!(g.matchMedia && g.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } }

  /* ── UCZESTNICY (wymyśleni, ten sam zestaw przy każdym otwarciu) ─────────────────────────── */
  function losowy(ziarno) { var a = ziarno >>> 0; return function () { a = (a + 0x6d2b79f5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  var _uczestnicy = null;
  /** 312 osób: numer 1–312, imię z puli (bez nazwisk), dystans, czas (5 km 20–45 min, 10 km 40–95 min, „Twój dystans” bez czasu), część jeszcze bez wyniku. */
  function uczestnicy() {
    if (_uczestnicy) return _uczestnicy;
    var r = losowy(20261121), lista = [];
    for (var i = 1; i <= BIEG.osoby_n; i++) {
      var los = r(), d = los < 0.46 ? "5" : los < 0.82 ? "10" : "twoj", ma = r() < 0.72, s = null;
      if (ma && d === "5") s = 1200 + Math.round(r() * 1500);
      if (ma && d === "10") s = 2400 + Math.round(r() * 3300);
      lista.push({ nr: i, imie: IMIONA[Math.floor(r() * IMIONA.length)], dystans: d, czas_s: s, ukonczyl: ma, zgoda_kontakt: r() < 0.6 });
    }
    _uczestnicy = lista;
    return lista;
  }
  /** Lista do pokazania: filtr dystansu („wszyscy” albo id), kolejność „czas” (domyślna: najpierw z czasem rosnąco, potem ukończeni bez czasu, potem zapisani; w grupach alfabetycznie) albo „imie”. */
  function listaWynikow(filtr, kolejnosc, wlasny) {
    var l = uczestnicy().slice();
    if (filtr && filtr !== "wszyscy") l = l.filter(function (u) { return u.dystans === filtr; });
    var imie = function (a, b) { return a.imie.localeCompare(b.imie, "pl") || a.nr - b.nr; };
    if (kolejnosc === "imie") l.sort(imie);
    else l.sort(function (a, b) {
      var ga = a.czas_s ? 0 : a.ukonczyl ? 1 : 2, gb = b.czas_s ? 0 : b.ukonczyl ? 1 : 2;
      return ga - gb || (ga === 0 ? a.czas_s - b.czas_s : 0) || imie(a, b);
    });
    /* własny wiersz przypięty na górze (zawsze widoczny bez „Pokaż więcej”), gdy pasuje do filtra */
    if (wlasny && (!filtr || filtr === "wszyscy" || wlasny.dystans === filtr)) l.unshift(wlasny);
    return l;
  }
  function wierszWyniku(u, pokaz) {
    var d = dystans(u.dystans), st = u.czas_s ? czas(u.czas_s) : u.ukonczyl ? "ukończył(a)" : "zapisany(a)";
    return '<li class="bw-wiersz' + (u.pokaz ? " bw-wiersz--ty" : "") + '"><span class="bw-nr">' + esc(u.nr) + '</span><span class="bw-imie">' + esc(u.imie) + (u.pokaz ? ' <i>Twój wynik (pokaz)</i>' : "") + '</span><span class="bw-dyst">' + esc(d.nazwa) + '</span><span class="bw-czas">' + esc(st) + (u.czas_s && d.km ? '<small>' + esc(tempo(u.czas_s, d.km)) + '</small>' : "") + '</span></li>';
  }

  /* ── STAN POKAZU (localStorage, jedyny zapis) ──────────────────────────────────────────── */
  function odczytaj() { try { var s = JSON.parse(g.localStorage.getItem(KLUCZ_PAMIECI) || "null"); return s && typeof s === "object" ? s : {}; } catch (e) { return {}; } }
  function zapisz(stan) { try { g.localStorage.setItem(KLUCZ_PAMIECI, JSON.stringify(stan || {})); return true; } catch (e) { return false; } }
  function wyczysc() { try { g.localStorage.removeItem(KLUCZ_PAMIECI); } catch (e) {} }
  /** Zapis na bieg: numer startowy = kolejny po przykładowych (313 przy 312 zapisanych). */
  function nowyZapis(imie, dyst, zgody) {
    var im = ladneImie(imie); if (!im) return null;
    return { imie: im, dystans: dystans(dyst).id, nr: BIEG.osoby_n + 1, zgody: zgody || {}, data: Date.now() };
  }
  /** Wynik: zegarek daje czas z udawanego treningu; wpis ręczny z pola. „Twój dystans” nigdy nie ma czasu, tylko „ukończył(a)”. */
  function nowyWynik(zapis, zrodlo, tekstCzasu) {
    if (!zapis) return null;
    var d = dystans(zapis.dystans);
    if (d.id === "twoj") return { zrodlo: zrodlo, czas_s: null, km: 3.2, ukonczyl: true, data: Date.now() };
    var s = zrodlo === "zegarek" ? (d.id === "5" ? 1771 : 3482) : sekundyZTekstu(tekstCzasu);
    if (!s) return null;
    return { zrodlo: zrodlo, czas_s: s, km: d.km, ukonczyl: true, data: Date.now() };
  }
  function wlasnyWiersz(stan) {
    if (!stan || !stan.zapis) return null;
    var w = stan.wynik || null;
    return { nr: stan.zapis.nr, imie: stan.zapis.imie, dystans: stan.zapis.dystans, czas_s: w ? w.czas_s : null, ukonczyl: !!(w && w.ukonczyl), pokaz: true };
  }

  /* ── KOD QR (własny koder: bajty, poziom M, wersje 1–10, bez CDN) ─────────────────────────── */
  var QR = (function () {
    var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
    (function () { var x = 1; for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255]; })();
    function mul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }
    function generator(n) { var p = [1]; for (var i = 0; i < n; i++) { var q = new Array(p.length + 1).fill(0); for (var j = 0; j < p.length; j++) { q[j] ^= p[j]; q[j + 1] ^= mul(p[j], EXP[i]); } p = q; } return p; }
    function rs(dane, n) { var gen = generator(n), w = new Array(n).fill(0); dane.forEach(function (b) { var f = b ^ w.shift(); w.push(0); for (var i = 0; i < n; i++) w[i] ^= mul(gen[i + 1], f); }); return w; }
    var EC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26], BLOKI = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
    function surowe(v) { var r = (16 * v + 128) * v + 64; if (v >= 2) { var a = Math.floor(v / 7) + 2; r -= (25 * a - 10) * a - 55; if (v >= 7) r -= 36; } return Math.floor(r / 8); }
    function pojemnosc(v) { return surowe(v) - EC[v] * BLOKI[v]; }
    function bity(tekst) {
      var b = typeof TextEncoder !== "undefined" ? Array.from(new TextEncoder().encode(tekst)) : Array.from(unescape(encodeURIComponent(tekst))).map(function (c) { return c.charCodeAt(0); });
      var v = 1; while (v <= 10 && pojemnosc(v) * 8 < 4 + (v >= 10 ? 16 : 8) + b.length * 8) v++;
      if (v > 10) return null;
      var out = [], push = function (val, n) { for (var i = n - 1; i >= 0; i--) out.push((val >>> i) & 1); };
      push(4, 4); push(b.length, v >= 10 ? 16 : 8); b.forEach(function (x) { push(x, 8); });
      var maks = pojemnosc(v) * 8; push(0, Math.min(4, maks - out.length)); while (out.length % 8) out.push(0);
      for (var pad = 0xec; out.length < maks; pad ^= 0xec ^ 0x11) push(pad, 8);
      var cw = []; for (var i = 0; i < out.length; i += 8) cw.push(parseInt(out.slice(i, i + 8).join(""), 2));
      return { v: v, cw: cw };
    }
    function zBlokami(v, cw) {
      var nb = BLOKI[v], ec = EC[v], raw = surowe(v), krotkich = nb - raw % nb, dl = Math.floor(raw / nb), bloki = [], k = 0;
      for (var i = 0; i < nb; i++) { var n = dl - ec + (i < krotkich ? 0 : 1), d = cw.slice(k, k + n); k += n; var e = rs(d, ec); if (i < krotkich) d.push(0); bloki.push(d.concat(e)); }
      var wynik = [];
      for (var j = 0; j < bloki[0].length; j++) for (var b = 0; b < nb; b++) if (j !== dl - ec || b >= krotkich) wynik.push(bloki[b][j]);
      return wynik;
    }
    function koduj(tekst) {
      var d = bity(tekst); if (!d) return null;
      var v = d.v, n = v * 4 + 17, mod = [], fn = [], dane = zBlokami(v, d.cw);
      for (var y = 0; y < n; y++) { mod.push(new Array(n).fill(false)); fn.push(new Array(n).fill(false)); }
      function set(x, y2, c) { mod[y2][x] = !!c; fn[y2][x] = true; }
      for (var i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
      function wzor(x, y2) { for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) { var dist = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y2 + dy; if (xx >= 0 && yy >= 0 && xx < n && yy < n) set(xx, yy, dist !== 2 && dist !== 4); } }
      wzor(3, 3); wzor(n - 4, 3); wzor(3, n - 4);
      var poz = [];
      if (v >= 2) { var ile = Math.floor(v / 7) + 2, krok = Math.ceil((v * 4 + 4) / (ile * 2 - 2)) * 2; poz = [6]; for (var p = n - 7; poz.length < ile; p -= krok) poz.splice(1, 0, p); }
      for (var a = 0; a < poz.length; a++) for (var b = 0; b < poz.length; b++) {
        if ((a === 0 && b === 0) || (a === 0 && b === poz.length - 1) || (a === poz.length - 1 && b === 0)) continue;
        for (var dy2 = -2; dy2 <= 2; dy2++) for (var dx2 = -2; dx2 <= 2; dx2++) set(poz[a] + dx2, poz[b] + dy2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1);
      }
      function format(maska) {
        var dat = (0 << 3) | maska, rem = dat; for (var i2 = 0; i2 < 10; i2++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        var bits = ((dat << 10) | rem) ^ 0x5412, bit = function (i3) { return ((bits >>> i3) & 1) === 1; };
        for (var i4 = 0; i4 <= 5; i4++) set(8, i4, bit(i4));
        set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
        for (var i5 = 9; i5 < 15; i5++) set(14 - i5, 8, bit(i5));
        for (var i6 = 0; i6 < 8; i6++) set(n - 1 - i6, 8, bit(i6));
        for (var i7 = 8; i7 < 15; i7++) set(8, n - 15 + i7, bit(i7));
        set(8, n - 8, true);
      }
      format(0);
      if (v >= 7) { var rem2 = v; for (var i8 = 0; i8 < 12; i8++) rem2 = (rem2 << 1) ^ ((rem2 >>> 11) * 0x1f25); var vb = (v << 12) | rem2; for (var i9 = 0; i9 < 18; i9++) { var c = ((vb >>> i9) & 1) === 1, aa = n - 11 + i9 % 3, bb = Math.floor(i9 / 3); set(aa, bb, c); set(bb, aa, c); } }
      var idx = 0;
      for (var prawo = n - 1; prawo >= 1; prawo -= 2) {
        if (prawo === 6) prawo = 5;
        for (var pion = 0; pion < n; pion++) for (var j = 0; j < 2; j++) {
          var x = prawo - j, gora = ((prawo + 1) & 2) === 0, y3 = gora ? n - 1 - pion : pion;
          if (!fn[y3][x] && idx < dane.length * 8) { mod[y3][x] = ((dane[idx >>> 3] >>> (7 - (idx & 7))) & 1) === 1; idx++; }
        }
      }
      var MASKI = [function (x, y4) { return (x + y4) % 2 === 0; }, function (x, y4) { return y4 % 2 === 0; }, function (x) { return x % 3 === 0; }, function (x, y4) { return (x + y4) % 3 === 0; },
        function (x, y4) { return (Math.floor(x / 3) + Math.floor(y4 / 2)) % 2 === 0; }, function (x, y4) { return x * y4 % 2 + x * y4 % 3 === 0; }, function (x, y4) { return (x * y4 % 2 + x * y4 % 3) % 2 === 0; }, function (x, y4) { return ((x + y4) % 2 + x * y4 % 3) % 2 === 0; }];
      function maskuj(m) { for (var y5 = 0; y5 < n; y5++) for (var x5 = 0; x5 < n; x5++) if (!fn[y5][x5] && MASKI[m](x5, y5)) mod[y5][x5] = !mod[y5][x5]; }
      function kara() {
        var k = 0, ciemne = 0, y6, x6;
        var linia = function (we) { var run = 0, poprz = null; for (var i10 = 0; i10 < n; i10++) { var c2 = we(i10); if (c2 === poprz) { run++; if (run === 5) k += 3; else if (run > 5) k++; } else { poprz = c2; run = 1; } } };
        var wzorzec = function (we) { for (var i11 = 0; i11 + 7 <= n; i11++) { var ok = true; for (var t = 0; t < 7; t++) if (we(i11 + t) !== [1, 0, 1, 1, 1, 0, 1][t]) { ok = false; break; } if (!ok) continue; var przed = i11 >= 4 && [0, 1, 2, 3].every(function (t2) { return we(i11 - 1 - t2) === 0; }), po = i11 + 11 <= n && [0, 1, 2, 3].every(function (t3) { return we(i11 + 7 + t3) === 0; }); if (przed || po) k += 40; } };
        for (y6 = 0; y6 < n; y6++) { (function (yy2) { linia(function (i12) { return mod[yy2][i12]; }); wzorzec(function (i13) { return mod[yy2][i13] ? 1 : 0; }); })(y6); }
        for (x6 = 0; x6 < n; x6++) { (function (xx2) { linia(function (i14) { return mod[i14][xx2]; }); wzorzec(function (i15) { return mod[i15][xx2] ? 1 : 0; }); })(x6); }
        for (y6 = 0; y6 < n - 1; y6++) for (x6 = 0; x6 < n - 1; x6++) { var c3 = mod[y6][x6]; if (c3 === mod[y6][x6 + 1] && c3 === mod[y6 + 1][x6] && c3 === mod[y6 + 1][x6 + 1]) k += 3; }
        for (y6 = 0; y6 < n; y6++) for (x6 = 0; x6 < n; x6++) if (mod[y6][x6]) ciemne++;
        k += 10 * Math.floor(Math.abs(ciemne * 20 - n * n * 10) / (n * n));
        return k;
      }
      var najlepsza = 0, min = Infinity;
      for (var m = 0; m < 8; m++) { format(m); maskuj(m); var kk = kara(); if (kk < min) { min = kk; najlepsza = m; } maskuj(m); }
      format(najlepsza); maskuj(najlepsza);
      return { n: n, wersja: v, maska: najlepsza, modul: function (x, y7) { return x >= 0 && y7 >= 0 && x < n && y7 < n && mod[y7][x]; } };
    }
    return { koduj: koduj, pojemnosc: pojemnosc };
  })();
  /** Kod QR jako SVG (ciemne moduły, jasny margines 4). */
  function qrSvg(tekst, kolor, tlo) {
    var q = QR.koduj(tekst); if (!q) return "";
    var n = q.n, m = 4, cz = "";
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (q.modul(x, y)) cz += "M" + (x + m) + " " + (y + m) + "h1v1h-1z";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * m) + ' ' + (n + 2 * m) + '" shape-rendering="crispEdges" role="img" aria-label="Kod QR do strony biegu"><rect width="100%" height="100%" fill="' + (tlo || "#fff") + '"/><path d="' + cz + '" fill="' + (kolor || "#07070a") + '"/></svg>';
  }
  /** Kod QR na canvasie: x, y, bok w px. */
  function qrNaCanvas(ctx, tekst, x, y, bok, kolor, tlo) {
    var q = QR.koduj(tekst); if (!q) return false;
    var n = q.n + 8, s = bok / n; ctx.fillStyle = tlo || "#fff"; ctx.fillRect(x, y, bok, bok); ctx.fillStyle = kolor || "#07070a";
    for (var yy = 0; yy < q.n; yy++) for (var xx = 0; xx < q.n; xx++) if (q.modul(xx, yy)) ctx.fillRect(x + (xx + 4) * s, y + (yy + 4) * s, s + 0.5, s + 0.5);
    return true;
  }

  /* ── CANVAS: numer, dyplom, plakat, grafika do mediów ─────────────────────────────────────── */
  var FONT_NAGL = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif", FONT_TEKST = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
  function nowyCanvas(w, h) { var k = g.document.createElement("canvas"); k.width = w; k.height = h; return k; }
  function prost(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  /** Tekst zmieszczony w szerokości: zmniejsza font do 60 % wyjściowego, potem przycina z „…”. */
  function tekstWSzer(c, t, x, y, maks, font, rozmiar, waga) {
    var pelny = String(t || ""), r = rozmiar, min = Math.ceil(rozmiar * 0.6), ustaw = function (px) { c.font = (waga || 400) + " " + px + "px " + font; };
    t = pelny;
    for (; r >= min; r -= 2) { ustaw(r); if (c.measureText(t).width <= maks) break; }
    if (r < min) ustaw(min);
    /* przycinanie z „…” tylko wtedy, gdy cały tekst i tak się nie mieści (wcześniej mierzono od razu z „…”, więc tytuł plakatu tracił ostatnią literę) */
    if (c.measureText(t).width > maks) while (t.length > 2 && c.measureText(t + "…").width > maks) t = t.slice(0, -1);
    c.fillText(t === pelny ? t : t + "…", x, y);
  }
  /** Konfetti tylko na marginesach i w pustych polach: punkt w którymkolwiek z prostokątów wykluczeń [x, y, w, h] (z zapasem 14 px) jest odrzucany i losowany ponownie
      (do 12 prób), więc nic nie ląduje na tytule, imieniu, ramkach z liczbami, podpisach, polu znaku organizacji ani wstędze. Czysta funkcja, testowana w Node. */
  function konfettiPunkty(w, h, ile, los, wykluczenia) {
    var kolory = ["#e8561e", "#f2b32a", "#6f9e3e", "#d9482b", "#ff8a3d", "#3d5a99"], ZAPAS = 14, out = [], wyk = wykluczenia || [];
    var wPolu = function (x, y) { for (var i = 0; i < wyk.length; i++) { var r = wyk[i]; if (x >= r[0] - ZAPAS && x <= r[0] + r[2] + ZAPAS && y >= r[1] - ZAPAS && y <= r[1] + r[3] + ZAPAS) return true; } return false; };
    for (var i = 0; i < ile; i++) {
      var x = 0, y = 0, ok = false;
      for (var p = 0; p < 12 && !ok; p++) { x = los() * w; y = los() * h; ok = !wPolu(x, y); }
      if (!ok) continue;
      out.push({ x: x, y: y, kat: los() * Math.PI, dl: 12 + los() * 10, kolor: kolory[Math.floor(los() * kolory.length)], alfa: 0.5 + los() * 0.4 });
    }
    return out;
  }
  function konfettiTlo(c, w, h, ile, los, wykluczenia) {
    konfettiPunkty(w, h, ile, los, wykluczenia).forEach(function (k) { c.save(); c.translate(k.x, k.y); c.rotate(k.kat); c.fillStyle = k.kolor; c.globalAlpha = k.alfa; c.fillRect(-6, -3, k.dl, 6); c.restore(); });
  }
  function laur(c, cx, cy, r, kolor, obrys) {
    c.save(); c.translate(cx, cy); c.strokeStyle = obrys || "#35561f"; c.lineWidth = Math.max(1, r / 60); c.fillStyle = kolor || "#6f9e3e";
    [-1, 1].forEach(function (strona) {
      for (var i = 0; i < 9; i++) {
        var kat = Math.PI / 2 + strona * (0.25 + i * 0.17), px = Math.cos(kat) * r, py = Math.sin(kat) * r * 0.95, sk = r * (0.11 + (i % 3) * 0.012);
        c.save(); c.translate(px, py); c.rotate(kat + strona * 1.1);
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(sk * 0.9, -sk * 0.5, sk * 2.2, 0); c.quadraticCurveTo(sk * 0.9, sk * 0.5, 0, 0); c.closePath(); c.fill(); c.stroke(); c.restore();
      }
    });
    c.restore();
  }
  function wstega(c, x, y, w, h, kolor, tekst, font) {
    c.save(); c.fillStyle = kolor; c.strokeStyle = "#3a1d0a"; c.lineWidth = h * 0.06;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#b8440f";
    c.beginPath(); c.moveTo(x, y + h * 0.15); c.lineTo(x - h * 0.9, y + h * 0.15); c.lineTo(x - h * 0.55, y + h * 0.6); c.lineTo(x - h * 0.9, y + h * 1.05); c.lineTo(x, y + h * 1.05); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x + w, y + h * 0.15); c.lineTo(x + w + h * 0.9, y + h * 0.15); c.lineTo(x + w + h * 0.55, y + h * 0.6); c.lineTo(x + w + h * 0.9, y + h * 1.05); c.lineTo(x + w, y + h * 1.05); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = kolor; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); c.fill(); c.stroke();
    if (tekst) { c.fillStyle = "#fff7e6"; c.textAlign = "center"; c.textBaseline = "middle"; c.font = font || (h * 0.52 + "px " + FONT_NAGL); c.fillText(tekst, x + w / 2, y + h / 2 + h * 0.03); }
    c.restore();
  }
  function znakBiegamy(c, x, y, rozmiar, kolor) { c.save(); c.fillStyle = kolor || "#f0ede8"; c.textBaseline = "alphabetic"; c.font = "600 " + rozmiar + "px " + FONT_TEKST; c.fillText("BiegaMy", x, y); c.restore(); }
  function znaczekPrzyklad(c, x, y, rozmiar) {
    c.save(); c.translate(x, y); c.rotate(-0.12); c.font = "800 " + rozmiar + "px " + FONT_TEKST; var w = c.measureText("PRZYKŁAD").width + rozmiar * 1.2;
    prost(c, -w / 2, -rozmiar * 0.8, w, rozmiar * 1.6, rozmiar * 0.3); c.fillStyle = "#b8520f"; c.fill(); c.strokeStyle = "#fff7e6"; c.lineWidth = rozmiar * 0.12; c.stroke();
    c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("PRZYKŁAD", 0, rozmiar * 0.06); c.restore();
  }
  function rysujObraz(c, im, x, y, w, h) { try { if (im && (im.naturalWidth > 0 || im.width > 0)) { c.drawImage(im, x, y, w, h); return true; } } catch (e) {} return false; }

  /** NUMER STARTOWY 1200×900: pasek z nazwą biegu, numer, imię, dystans, okno, mata z chorągiewkami; dziurki jak w prawdziwym numerze. obrazy: { brama, medal }. */
  function numerStartowy(zapis, obrazy) {
    var W = 1200, H = 900, k = nowyCanvas(W, H), c = k.getContext("2d"), d = dystans(zapis.dystans), los = losowy(zapis.nr);
    c.fillStyle = "#fff7e6"; prost(c, 0, 0, W, H, 40); c.fill();
    c.fillStyle = "#f6e9cc"; for (var i = 0; i < 60; i++) { c.globalAlpha = 0.5; c.fillRect(los() * W, los() * H, 3, 3); } c.globalAlpha = 1;
    c.fillStyle = "#e8561e"; prost(c, 0, 0, W, 150, 40); c.fill(); c.fillRect(0, 110, W, 40);
    c.fillStyle = "#fff7e6"; c.textAlign = "left"; c.textBaseline = "alphabetic"; c.font = "64px " + FONT_NAGL; c.fillText(BIEG.nazwa.toUpperCase(), 120, 98);
    c.font = "600 26px " + FONT_TEKST; c.textAlign = "right"; c.fillText(BIEG.okno.opis, W - 120, 92);
    c.fillStyle = "#3a1d0a"; c.globalAlpha = 0.9;
    [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], 16, 0, Math.PI * 2); c.fill(); c.fillStyle = "#fff7e6"; c.beginPath(); c.arc(p[0], p[1], 10, 0, Math.PI * 2); c.fill(); c.fillStyle = "#3a1d0a"; });
    c.globalAlpha = 1;
    c.fillStyle = "#07070a"; c.textAlign = "center"; c.font = "380px " + FONT_NAGL; c.fillText(String(zapis.nr), W / 2, 560);
    c.fillStyle = "#e8561e"; c.font = "72px " + FONT_NAGL; tekstWSzer(c, zapis.imie.toUpperCase(), W / 2, 660, 900, FONT_NAGL, 72);
    c.fillStyle = "#3a1d0a"; c.font = "600 30px " + FONT_TEKST; c.fillText(d.nazwa.toUpperCase() + (d.km ? "" : " · BIEG I SPACER"), W / 2, 712);
    prost(c, 60, 750, W - 120, 90, 18); c.fillStyle = "#3b3b47"; c.fill();
    c.fillStyle = "#fff7e6"; for (var x = 90; x < W - 90; x += 52) c.fillRect(x, 772, 26, 46);
    c.fillStyle = "#e8561e"; for (var x2 = 116; x2 < W - 90; x2 += 52) c.fillRect(x2, 772, 26, 46);
    if (!rysujObraz(c, obrazy && obrazy.brama, 870, 165, 280, 173)) { c.fillStyle = "#ff8a3d"; c.font = "40px " + FONT_NAGL; c.textAlign = "right"; c.fillText("START · META", W - 70, 230); }
    c.textAlign = "left"; c.fillStyle = "#3a1d0a"; c.font = "600 22px " + FONT_TEKST; c.fillText("bieg i spacer dla jednej zbiórki · udział bezpłatny", 100, 200);
    c.font = "500 22px " + FONT_TEKST; c.fillText("wpłaty wyłącznie przez organizację prowadzącą zbiórkę", 100, 236);
    znakBiegamy(c, 100, 880, 28, "#3a1d0a"); c.fillStyle = "#7a4a1e"; c.font = "500 20px " + FONT_TEKST; c.textAlign = "right"; c.fillText("numer wygenerowany w przeglądarce · " + dataPolska(new Date(zapis.data || Date.now())), W - 100, 880);
    znaczekPrzyklad(c, 180, 440, 34);
    return k;
  }
  /** DYPLOM: format 'telefon' 1080×1350 albo 'a4' 1754×1240 (poziomo). Imię, dystans, czas, tempo, nazwa biegu, data, podpis BiegaMy, puste pole na znak organizacji. */
  function dyplom(dane, format, obrazy) {
    var a4 = format === "a4", W = a4 ? 1754 : 1080, H = a4 ? 1240 : 1350, k = nowyCanvas(W, H), c = k.getContext("2d"), d = dystans(dane.zapis.dystans), w = dane.wynik || {}, los = losowy(7);
    var tlo = c.createLinearGradient(0, 0, 0, H); tlo.addColorStop(0, "#fffaf0"); tlo.addColorStop(1, "#f7e9cf"); c.fillStyle = tlo; c.fillRect(0, 0, W, H);
    var sx = a4 ? 0.82 : 1, cx = W / 2, y = a4 ? 150 : 200;
    /* pola, na które konfetti nie wchodzi: linia tytułowa, DYPLOM, „za ukończenie”, imię, nazwa biegu, trzy ramki, medal z laurem, teksty po lewej, pole znaku organizacji, wstęga, znaczek PRZYKŁAD */
    var WYK = a4
      ? [[cx - 460, 80, 920, 40], [cx - 250, 128, 500, 125], [cx - 170, 272, 340, 38], [cx - 440, 316, 880, 104], [cx - 270, 440, 540, 40], [cx - 610, 490, 1220, 150], [cx - 180, 720, 360, 320], [150, H - 470, 330, 230], [W - 470, H - 480, 320, 180], [cx - 340, H - 150, 680, 80], [W - 310, 80, 240, 80]]
      : [[cx - 460, 110, 920, 40], [cx - 300, 178, 600, 142], [cx - 210, 350, 420, 40], [cx - 440, 400, 880, 122], [cx - 320, 550, 640, 42], [cx - 450, 608, 900, 164], [cx - 170, 790, 340, 320], [100, H - 445, 320, 200], [W - 390, H - 530, 300, 180], [cx - 300, H - 160, 600, 90], [W - 310, 170, 240, 80]];
    konfettiTlo(c, W, H, 90, los, WYK);
    c.strokeStyle = "#e8561e"; c.lineWidth = 10; prost(c, 36, 36, W - 72, H - 72, 28); c.stroke();
    c.strokeStyle = "#f2b32a"; c.lineWidth = 3; prost(c, 56, 56, W - 112, H - 112, 20); c.stroke();
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillStyle = "#3a1d0a"; c.font = "600 " + Math.round(26 * sx) + "px " + FONT_TEKST; c.fillText("MIASTO DOBRA · BIEG I SPACER DLA JEDNEJ ZBIÓRKI", cx, a4 ? 110 : 140);
    c.fillStyle = "#e8561e"; c.font = Math.round(150 * sx) + "px " + FONT_NAGL; c.fillText("DYPLOM", cx, y + (a4 ? 90 : 110));
    c.fillStyle = "#3a1d0a"; c.font = "500 " + Math.round(30 * sx) + "px " + FONT_TEKST; c.fillText(a4 ? "za ukończenie" : "za ukończenie biegu", cx, y + (a4 ? 150 : 180));
    c.fillStyle = "#07070a"; tekstWSzer(c, dane.zapis.imie, cx, y + (a4 ? 260 : 310), W - 240, FONT_NAGL, Math.round(130 * sx));
    c.fillStyle = "#3a1d0a"; c.font = "500 " + Math.round(34 * sx) + "px " + FONT_TEKST; c.fillText(BIEG.nazwa + " · " + d.nazwa + (d.km ? "" : " (" + km(w.km || 0) + " km)"), cx, y + (a4 ? 320 : 380));
    var yy = y + (a4 ? 420 : 500), kol = a4 ? [cx - 420, cx, cx + 420] : [cx - 300, cx, cx + 300], wart = [w.czas_s ? czas(w.czas_s) : "ukończono", w.czas_s && d.km ? tempo(w.czas_s, d.km).replace(" /km", "") : d.km ? km(d.km) : km(w.km || 0), BIEG.okno.opis.split(", ")[1] || BIEG.okno.opis], pod = [w.czas_s ? "czas" : "wynik", w.czas_s && d.km ? "tempo min/km" : "kilometry", "okno biegu"];
    kol.forEach(function (x, i) {
      prost(c, x - (a4 ? 190 : 140), yy - (a4 ? 80 : 90), a4 ? 380 : 280, a4 ? 150 : 160, 22); c.fillStyle = "rgba(232,86,30,.08)"; c.fill(); c.strokeStyle = "#e8b48a"; c.lineWidth = 3; c.stroke();
      c.fillStyle = "#07070a"; tekstWSzer(c, wart[i], x, yy + (i === 2 ? 4 : 14), (a4 ? 380 : 280) - 36, FONT_NAGL, Math.round((i === 2 ? 44 : 78) * sx));   // tekst dopasowany do szerokości ramki (data „21–22 listopada” wychodziła poza nią)
      c.fillStyle = "#7a4a1e"; c.font = "600 " + Math.round(22 * sx) + "px " + FONT_TEKST; c.fillText(pod[i], x, yy + (a4 ? 50 : 54));
    });
    /* medal w wieńcu laurowym; po lewej data, numer i podpis BiegaMy; po prawej puste pole na znak organizacji; na dole wstęga */
    var med = a4 ? [cx - 100, H - 500, 200, 260] : [cx - 100, H - 540, 200, 260];
    laur(c, med[0] + med[2] / 2, med[1] + med[3] * 0.62, a4 ? 160 : 150);
    if (!rysujObraz(c, obrazy && obrazy.medal, med[0], med[1], med[2], med[3])) { c.fillStyle = "#f2b32a"; c.beginPath(); c.arc(med[0] + med[2] / 2, med[1] + med[3] * 0.65, 78, 0, Math.PI * 2); c.fill(); }
    wstega(c, cx - (a4 ? 260 : 220), H - (a4 ? 140 : 150), a4 ? 520 : 440, a4 ? 60 : 66, "#e8561e", "KILOMETRY BUDUJĄ ULICĘ");
    c.textAlign = "left"; c.fillStyle = "#3a1d0a"; c.font = "500 " + Math.round(22 * sx) + "px " + FONT_TEKST;
    c.fillText("Data: " + dataPolska(new Date(w.data || dane.zapis.data || Date.now())), a4 ? 160 : 110, H - (a4 ? 440 : 420));
    c.fillText("Numer startowy: " + dane.zapis.nr, a4 ? 160 : 110, H - (a4 ? 404 : 384));
    znakBiegamy(c, a4 ? 160 : 110, H - (a4 ? 330 : 300), Math.round(34 * sx), "#07070a"); c.fillStyle = "#7a4a1e"; c.font = "500 " + Math.round(20 * sx) + "px " + FONT_TEKST; c.fillText("aplikacja, która liczy kilometry", a4 ? 160 : 110, H - (a4 ? 302 : 270));
    var pole = a4 ? [W - 160 - 290, H - 470, 290, 160] : [W - 110 - 270, H - 520, 270, 160];
    c.setLineDash([12, 10]); c.strokeStyle = "#b08a52"; c.lineWidth = 3; prost(c, pole[0], pole[1], pole[2], pole[3], 16); c.stroke(); c.setLineDash([]);
    c.fillStyle = "#7a4a1e"; c.textAlign = "center"; c.font = "500 " + Math.round(20 * sx) + "px " + FONT_TEKST; c.fillText("tu znak organizacji", pole[0] + pole[2] / 2, pole[1] + pole[3] / 2 + 8);
    znaczekPrzyklad(c, W - 190, a4 ? 120 : 210, a4 ? 30 : 34);
    return k;
  }
  /** PLAKAT 1080×1350 dla organizacji: nazwa, okno, dystanse, QR do strony biegu, zdanie o pieniądzach. */
  function plakat(adres, obrazy) {
    var W = 1080, H = 1350, k = nowyCanvas(W, H), c = k.getContext("2d"), los = losowy(3);
    var tlo = c.createLinearGradient(0, 0, 0, H); tlo.addColorStop(0, "#9fd0ee"); tlo.addColorStop(0.5, "#dceefb"); tlo.addColorStop(0.5, "#86ad55"); tlo.addColorStop(1, "#4f7a33"); c.fillStyle = tlo; c.fillRect(0, 0, W, H);
    c.fillStyle = "#3b3b47"; c.fillRect(0, 700, W, 150); c.strokeStyle = "#fff7e6"; c.lineWidth = 6; c.setLineDash([40, 30]); c.beginPath(); c.moveTo(0, 775); c.lineTo(W, 775); c.stroke(); c.setLineDash([]);
    if (!rysujObraz(c, obrazy && obrazy.kibice, 40, 560, 420, 140)) { c.fillStyle = "#d9482b"; c.fillRect(60, 620, 300, 80); }
    rysujObraz(c, obrazy && obrazy.kibice, 620, 560, 420, 140);
    if (!rysujObraz(c, obrazy && obrazy.brama, 320, 430, 440, 272)) { c.fillStyle = "#e8561e"; c.fillRect(340, 500, 400, 60); }
    konfettiTlo(c, W, 420, 40, los, [[40, 120, 1000, 150], [60, 280, 960, 110], [W - 320, 50, 260, 90]]);   // nie na tytule, dacie, dystansach ani znaczku
    c.textAlign = "center"; c.fillStyle = "#07070a"; c.font = "600 30px " + FONT_TEKST; c.fillText("MIASTO DOBRA ZAPRASZA", W / 2, 110);
    c.fillStyle = "#e8561e"; tekstWSzer(c, BIEG.nazwa.toUpperCase(), W / 2, 250, W - 160, FONT_NAGL, 132);
    c.fillStyle = "#07070a"; c.font = "600 40px " + FONT_TEKST; c.fillText(BIEG.okno.opis, W / 2, 320);
    c.font = "500 32px " + FONT_TEKST; c.fillText("5 km · 10 km · Twój dystans (spacer, marsz, nordic walking, wózek)", W / 2, 375);
    prost(c, 60, 880, W - 120, 360, 30); c.fillStyle = "#fff7e6"; c.fill();
    qrNaCanvas(c, adres, 90, 900, 320, "#07070a", "#fff7e6");
    c.textAlign = "left"; c.fillStyle = "#07070a"; c.font = "60px " + FONT_NAGL; c.fillText("ZAPISZ SIĘ", 450, 965); c.font = "500 30px " + FONT_TEKST; c.fillText("Udział jest bezpłatny.", 450, 1012);
    c.font = "500 26px " + FONT_TEKST; c.fillStyle = "#3a1d0a"; ["Wpłaty na zbiórkę wyłącznie przez", "organizację, która ją prowadzi.", "BiegaMy tylko liczy kilometry."].forEach(function (t, i) { c.fillText(t, 450, 1068 + i * 36); });
    c.font = "500 22px " + FONT_TEKST; c.fillStyle = "#7a4a1e"; tekstWSzer(c, adres, 450, 1212, 540, FONT_TEKST, 22, 500);
    znakBiegamy(c, 90, 1318, 28, "#3a1d0a"); c.textAlign = "right"; c.fillStyle = "#fff7e6"; c.font = "500 20px " + FONT_TEKST; c.fillText("tu znak organizacji →", W - 260, 1298);
    c.setLineDash([10, 8]); c.strokeStyle = "#fff7e6"; c.lineWidth = 3; prost(c, W - 70 - 170, 1262, 170, 64, 12); c.stroke(); c.setLineDash([]);
    znaczekPrzyklad(c, W - 160, 90, 32);
    return k;
  }
  /** GRAFIKA DO MEDIÓW SPOŁECZNOŚCIOWYCH 1080×1080. */
  function grafikaSocial(obrazy) {
    var W = 1080, k = nowyCanvas(W, W), c = k.getContext("2d"), los = losowy(11);
    var tlo = c.createLinearGradient(0, 0, W, W); tlo.addColorStop(0, "#e8561e"); tlo.addColorStop(1, "#b8440f"); c.fillStyle = tlo; c.fillRect(0, 0, W, W);
    konfettiTlo(c, W, W, 90, los);
    c.fillStyle = "#fff7e6"; prost(c, 60, 60, W - 120, W - 120, 40); c.fill();
    c.textAlign = "center"; c.fillStyle = "#3a1d0a"; c.font = "600 28px " + FONT_TEKST; c.fillText("MIASTO DOBRA · BIEG I SPACER", W / 2, 150);
    c.fillStyle = "#e8561e"; c.font = "170px " + FONT_NAGL; c.fillText("BIEG", W / 2, 320); c.fillText("WIRTUALNY", W / 2, 470);
    c.fillStyle = "#07070a"; c.font = "600 44px " + FONT_TEKST; c.fillText(BIEG.okno.opis, W / 2, 545);
    if (!rysujObraz(c, obrazy && obrazy.medal, W / 2 - 90, 580, 180, 234)) { c.fillStyle = "#f2b32a"; c.beginPath(); c.arc(W / 2, 700, 80, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = "#3a1d0a"; c.font = "500 34px " + FONT_TEKST; c.fillText("5 km · 10 km · Twój dystans", W / 2, 870); c.fillText("udział bezpłatny · numer, dyplom i odznaka", W / 2, 920);
    c.font = "600 26px " + FONT_TEKST; c.fillStyle = "#7a4a1e"; c.fillText("Twoje kilometry budują ulicę. Wpłaty tylko przez organizację.", W / 2, 975);
    znakBiegamy(c, 100, 990, 26, "#3a1d0a"); znaczekPrzyklad(c, W - 170, 110, 30);
    return k;
  }
  /** Eksport zgód (przykład): bez adresów; w prawdziwym biegu kolumna z adresem powstaje po stronie organizacji jako administratora. */
  function csvZgod() {
    var w = ["numer;imie;dystans;zgoda_na_kontakt_od_organizacji;imie_na_liscie_wynikow;adres_kontaktowy"];
    uczestnicy().slice(0, 25).forEach(function (u) { w.push([u.nr, u.imie, dystans(u.dystans).nazwa, u.zgoda_kontakt ? "tak" : "nie", "tak", "ukryty w pokazie"].join(";")); });
    return w.join("\r\n");
  }

  /* ── SCENA BIEGU: ta sama rodzina co Ulica (niebo wg pory, wzgórza, droga, pierwszy plan z assets/ulica), tu z bramą, trasą i kibicami ───────── */
  var CSS_SCENY = ".bs{position:relative;overflow:hidden;background:linear-gradient(#9fd0ee,#dceefb 58%,#86ad55 58%,#5f8a3a);user-select:none;-webkit-user-select:none}" +
    ".bs-swiat{position:absolute;inset:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch}.bs-swiat::-webkit-scrollbar{display:none}" +
    ".bs-tresc{position:relative;height:100%}.bs-w{position:absolute;left:0;top:0;height:100%;pointer-events:none}" +
    ".bs-slonce{position:absolute;top:6%;width:64px;height:64px;background:center/contain no-repeat}" +
    ".bs-chmura{position:absolute;width:120px;height:46px;background:center/contain no-repeat;opacity:.9}" +
    ".bs-wzgorza{position:absolute;left:0;right:0;bottom:36%;height:34%;background:0 100%/700px 100% repeat-x}" +
    ".bs-laka{position:absolute;left:0;right:0;top:64%;bottom:0;background:linear-gradient(#86ad55,#5f8a3a)}" +
    ".bs-droga{position:absolute;left:0;bottom:11%;height:24%;background:#3a3d44 0 100%/auto 100% repeat-x;border-top:2px solid #2a2c31}" +
    ".bs-droga--szutr{background:repeating-linear-gradient(90deg,#9a7b4a 0 18px,#8c6d3f 18px 36px);border-top:2px dashed #fff7e6;opacity:.85}" +
    ".bs-przod{position:absolute;left:0;right:0;bottom:0;height:16%;background:0 100%/380px 100% repeat-x}" +
    ".bs-el{position:absolute;bottom:0;display:block;filter:drop-shadow(0 3px 2px rgba(60,30,0,.35))}" +
    ".bs-brama{bottom:12%}.bs-kibice{bottom:34%}.bs-drzewo{bottom:30%}.bs-latarnia{bottom:34%}" +
    ".bs-domek{position:absolute;bottom:34%;text-align:center}.bs-domek img{display:block;width:100%;height:auto;filter:drop-shadow(0 3px 2px rgba(60,30,0,.35))}" +
    ".bs-szyld{position:absolute;left:50%;transform:translateX(-50%);top:-14px;background:#fff7e6;color:#4a2408;border:2px solid #5a2e0e;border-radius:8px;padding:3px 7px;font:800 10px/1.1 Inter,sans-serif;white-space:nowrap;box-shadow:0 2px 0 #5a2e0e}" +
    ".bs-mur{position:absolute;bottom:34%;display:flex;flex-wrap:wrap;align-content:flex-end;gap:3px;padding:4px;background:#8c4a2a;border:2px solid #3a1d0a;border-radius:6px 6px 0 0}" +
    ".bs-cegla{background:#c8553d;color:#fff7e6;border:1px solid #3a1d0a;border-radius:3px;font:800 9px/1 Inter,sans-serif;padding:4px 6px;white-space:nowrap}.bs-cegla--zlota{background:#f2b32a;color:#3a1d0a}.bs-cegla--pusta{min-width:26px}" +
    ".bs-biegacz{position:absolute;bottom:21%;width:40px;height:54px;background-repeat:no-repeat;background-size:contain;filter:drop-shadow(0 2px 1px rgba(60,30,0,.35))}" +
    ".bs--ruch .bs-biegacz{animation:bs-bieg linear infinite}@keyframes bs-bieg{from{transform:translate3d(-60px,0,0)}to{transform:translate3d(var(--bs-dl,1200px),0,0)}}" +
    ".bs--ruch .bs-chmura{animation:bs-chmura linear infinite}@keyframes bs-chmura{from{transform:translate3d(-140px,0,0)}to{transform:translate3d(var(--bs-dl,1200px),0,0)}}" +
    ".bs--ruch .bs-brama{animation:bs-brama 2.6s ease-in-out infinite alternate}@keyframes bs-brama{from{transform:rotate(-.4deg)}to{transform:rotate(.4deg)}}" +
    ".bs-hud{position:absolute;left:10px;top:10px;display:flex;gap:6px;flex-wrap:wrap;pointer-events:none}" +
    ".bs-chip{background:rgba(7,7,10,.78);color:#fff7e6;border-radius:10px;padding:6px 9px;font:600 12px/1.15 Inter,sans-serif;backdrop-filter:blur(4px)}.bs-chip b{font:400 20px/1 'Bebas Neue',Impact,sans-serif;letter-spacing:.03em;display:block;color:#ffb27a}" +
    ".bs-chip--przyklad{background:#b8520f;color:#fff;font:800 9px/1 Inter,sans-serif;letter-spacing:.14em;padding:7px 8px;align-self:flex-start}" +
    ".bs-meta{position:absolute;right:10px;top:10px;background:#2f6b3a;color:#fff;font:800 10px/1 Inter,sans-serif;letter-spacing:.14em;padding:7px 8px;border-radius:7px;box-shadow:0 2px 0 #1e4626}" +
    ".bs-wskaz{position:absolute;right:10px;bottom:10px;color:#fff7e6;font:600 11px/1 Inter,sans-serif;background:rgba(7,7,10,.6);padding:7px 9px;border-radius:8px;pointer-events:none}";
  /* Biegacz z profilu, w kroku (11.11): głowa z czapką, tułów pochylony, ręce zgięte, noga zakroczna wyprostowana, wykroczna z kolanem w górze, pomarańczowe buty; obrys jak na grafikach Ulicy. */
  var SVG_BIEGACZ = function (kolor) {
    return "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 58'>" +
      "<g stroke='#3a1d0a' stroke-width='5.5' stroke-linecap='round' stroke-linejoin='round' fill='none'><path d='M20 38 11 46 5 54'/><path d='M30 37 37 43 35 53'/><path d='M19 20 11 25 14 31'/><path d='M28 19 36 23 34 14'/></g>" +
      "<g stroke='#f3c89a' stroke-width='3' stroke-linecap='round' stroke-linejoin='round' fill='none'><path d='M20 38 11 46 5 54'/><path d='M30 37 37 43 35 53'/><path d='M19 20 11 25 14 31'/><path d='M28 19 36 23 34 14'/></g>" +
      "<g stroke='#3a1d0a' stroke-width='2' stroke-linejoin='round'><path d='M16 18 28 15 31 31 18 34z' fill='" + kolor + "'/><path d='M18 29 31 26' stroke='#fff7e6' stroke-width='2.5'/><path d='M18 33 31 30 32 39 19 41z' fill='#2a2c31'/>" +
      "<circle cx='24' cy='9' r='6.5' fill='#f3c89a'/><path d='M17.5 8.5q6-9 13-3l2 1.5-10 .5-3 2.5z' fill='#e8561e'/>" +
      "<ellipse cx='4' cy='55' rx='4.5' ry='2.5' fill='#e8561e'/><ellipse cx='36' cy='55' rx='4.5' ry='2.5' fill='#e8561e'/></g></svg>");
  };
  function wstrzyknijCssSceny() { if (g.document.getElementById("bm-bieg-scena-css")) return; var st = g.document.createElement("style"); st.id = "bm-bieg-scena-css"; st.textContent = CSS_SCENY; g.document.head.appendChild(st); }
  function el(tag, klasa, rodzic, tekst) { var n = g.document.createElement(tag); if (klasa) n.className = klasa; if (tekst != null) n.textContent = tekst; if (rodzic) rodzic.appendChild(n); return n; }
  /** Adres grafiki: strona może podać zrodlo(url) → adres z Cache API (blob:), żeby każdy plik szedł z sieci dokładnie raz i działał bez sieci. */
  var _zrodlo = null;
  function adres(src) { return _zrodlo ? (_zrodlo(src) || src) : src; }
  function obraz(src, klasa, rodzic, lewo, szer) { var im = el("img", klasa, rodzic); im.alt = ""; im.decoding = "async"; im.draggable = false; im.setAttribute("data-plik", src); im.src = adres(src); im.style.left = lewo + "px"; im.style.width = szer + "px"; return im; }
  function tlo(n, src, rozmiar) { n.style.backgroundImage = "url(\"" + adres(src) + "\")"; if (rozmiar) n.style.backgroundSize = rozmiar; return n; }
  /** Cegły muru: imiona z puli (bez nazwisk), co piąta złota, co czwarta bez imienia (bez zgody). */
  function ceglyPrzykladu(ile, start) { var r = losowy(start || 5), w = []; for (var i = 0; i < ile; i++) w.push({ tekst: i % 4 === 3 ? "" : IMIONA[Math.floor(r() * IMIONA.length)], zlota: i % 5 === 2 }); return w; }
  /**
   * Scena w kontenerze. opcje: { tryb: 'hero' | 'ulica', faza: 'trakcie' | 'po', suma_km, cel_km, firmy, cegly_n, wysokosc }.
   * hero: brama START·META z przodu, kibice, biegacze na trasie. ulica: droga rośnie z kilometrami (szutr dalej), domki firm, mur z cegłami, META na końcu gdy 'po'.
   */
  function scena(kontener, opcje) {
    if (!kontener) return null;
    var o = opcje || {}, ulica = o.tryb === "ulica", po = o.faza === "po", ruch = !bezRuchu();
    _zrodlo = typeof o.zrodlo === "function" ? o.zrodlo : null;
    wstrzyknijCssSceny();
    while (kontener.firstChild) kontener.removeChild(kontener.firstChild);
    var scenaEl = el("div", "bs" + (ruch ? " bs--ruch" : ""), kontener);
    scenaEl.style.height = (o.wysokosc || 250) + "px";
    var swiat = el("div", "bs-swiat", scenaEl), tresc = el("div", "bs-tresc", swiat);
    var proc = ulica ? (po ? 100 : procent(o.suma_km, o.cel_km)) : 100, dl = ulica ? 1500 : 1240;
    tresc.style.width = dl + "px"; tresc.style.setProperty("--bs-dl", dl + 60 + "px");
    tlo(el("div", "bs-slonce", tresc), "assets/gra/slonce.webp").style.left = (dl * 0.72) + "px";
    [[0, 18, 46], [1, 44, 70]].forEach(function (ch) { var c = tlo(el("div", "bs-chmura", tresc), "assets/gra/chmura1.webp"); c.style.top = ch[1] + "px"; c.style.left = (ch[0] ? dl * 0.5 : dl * 0.1) + "px"; c.style.animationDuration = ch[2] + "s"; c.style.animationDelay = (-ch[2] * ch[0] * 0.5) + "s"; });
    tlo(el("div", "bs-wzgorza", tresc), "assets/ulica/wzgorza.webp"); el("div", "bs-laka", tresc);
    var kibicePoz = ulica ? [40, 620, 1120] : [150, 560, 930];
    kibicePoz.forEach(function (x) { obraz("assets/miasto/bieg-kibice.svg", "bs-el bs-kibice", tresc, x, 170); });
    (ulica ? [[480, 60], [940, 70], [1340, 56]] : [[380, 60], [800, 70], [1180, 56]]).forEach(function (d) { obraz("assets/ulica/drzewo.webp", "bs-el bs-drzewo", tresc, d[0], d[1]); });
    (ulica ? [[440, 16], [900, 16], [1300, 16]] : [[300, 16], [720, 16], [1120, 16]]).forEach(function (d) { obraz("assets/ulica/latarnia.webp", "bs-el bs-latarnia", tresc, d[0], d[1]); });
    if (ulica) {
      var szer = Math.max(120, Math.round(dl * proc / 100)), droga = tlo(el("div", "bs-droga", tresc), "assets/ulica/droga.webp"); droga.style.width = szer + "px";
      if (proc < 100) { var szutr = el("div", "bs-droga bs-droga--szutr", tresc); szutr.style.left = szer + "px"; szutr.style.width = (dl - szer) + "px"; }
      /* kolejność od bramy: mur darczyńców, potem domki firm co 230 px; wieżowiec węższy, żeby zmieścił się w kadrze */
      var firmy = (o.firmy || FIRMY_PRZYKLADOWE).slice(0, 6);
      firmy.forEach(function (f, i) {
        var dom = el("div", "bs-domek", tresc), nr = 1 + (i % 3), wysoki = f.rodzaj === "wiezowiec", w = wysoki ? 62 : 96;
        dom.style.left = (540 + i * 230) + "px"; dom.style.width = w + "px";
        var im = el("img", "", dom); im.alt = ""; im.decoding = "async"; var src = wysoki ? "assets/ulica/wiezowiec.webp" : "assets/ulica/domek-" + nr + ".webp"; im.setAttribute("data-plik", src); im.src = adres(src);
        el("span", "bs-szyld", dom, f.nazwa);
      });
      /* mur mieści się w pierwszym kadrze telefonu (≤ 400 px od lewej): 8 cegieł z imionami + cegła z resztą */
      var mur = el("div", "bs-mur", tresc); mur.style.left = "180px"; mur.style.width = "216px";
      ceglyPrzykladu(Math.min(8, o.cegly_n || 8)).forEach(function (c) { el("span", "bs-cegla" + (c.zlota ? " bs-cegla--zlota" : "") + (c.tekst ? "" : " bs-cegla--pusta"), mur, c.tekst); });
      var reszta = (o.cegly_n || 0) - 8; if (reszta > 0) el("span", "bs-cegla", mur, "+" + reszta);
      obraz("assets/miasto/bieg-brama.svg", "bs-el bs-brama", tresc, 14, 150);
      if (po) obraz("assets/miasto/bieg-brama.svg", "bs-el bs-brama", tresc, dl - 170, 150);
    } else {
      tlo(el("div", "bs-droga", tresc), "assets/ulica/droga.webp").style.width = dl + "px";
      obraz("assets/miasto/bieg-brama.svg", "bs-el bs-brama", tresc, 40, 240);
      obraz("assets/miasto/bieg-brama.svg", "bs-el bs-brama", tresc, dl - 300, 240).style.opacity = ".92";
    }
    tlo(el("div", "bs-przod", tresc), "assets/ulica/pierwszy-plan.webp");
    [["#e8561e", 0, 23], ["#6f9e3e", 0.33, 29], ["#3d5a99", 0.61, 26], ["#d9482b", 0.8, 31]].forEach(function (b) {
      var bg = el("div", "bs-biegacz", tresc); bg.style.backgroundImage = "url(\"" + SVG_BIEGACZ(b[0]) + "\")"; bg.style.left = (ruch ? 0 : 120 + b[1] * 700) + "px"; bg.style.animationDuration = b[2] + "s"; bg.style.animationDelay = (-b[2] * b[1]) + "s";
    });
    var hud = el("div", "bs-hud", scenaEl);
    if (o.hud !== false) {
      var c1 = el("div", "bs-chip", hud); el("b", "", c1, liczba(o.osoby_n != null ? o.osoby_n : BIEG.osoby_n)); c1.appendChild(g.document.createTextNode("uczestników"));
      var c2 = el("div", "bs-chip", hud); el("b", "", c2, km(o.suma_km != null ? o.suma_km : BIEG.suma_km) + " km"); c2.appendChild(g.document.createTextNode("razem"));
      var c3 = el("div", "bs-chip", hud); el("b", "", c3, liczba(ulica && po ? 100 : procent(o.suma_km != null ? o.suma_km : BIEG.suma_km, o.cel_km || BIEG.cel_km), 1) + " %"); c3.appendChild(g.document.createTextNode("ulicy biegu"));
    }
    el("div", "bs-chip bs-chip--przyklad", hud, "PRZYKŁAD");
    if (ulica && po) el("div", "bs-meta", scenaEl, "ZBUDOWANA");
    el("div", "bs-wskaz", scenaEl, "przesuń ›");
    if (ulica) swiat.scrollLeft = 0;
    return scenaEl;
  }

  g.BM_BIEG = { KLUCZ_PAMIECI: KLUCZ_PAMIECI, BIEG: BIEG, DYSTANSE: DYSTANSE, JAK: JAK, IMIONA: IMIONA, FIRMY_PRZYKLADOWE: FIRMY_PRZYKLADOWE, CHECKLISTA: CHECKLISTA,
    esc: esc, liczba: liczba, km: km, forma: forma, odmiana: odmiana, procent: procent, czas: czas, tempo: tempo, sekundyZTekstu: sekundyZTekstu, dataPolska: dataPolska, dystans: dystans, ladneImie: ladneImie, bezRuchu: bezRuchu,
    uczestnicy: uczestnicy, listaWynikow: listaWynikow, wierszWyniku: wierszWyniku, odczytaj: odczytaj, zapisz: zapisz, wyczysc: wyczysc, nowyZapis: nowyZapis, nowyWynik: nowyWynik, wlasnyWiersz: wlasnyWiersz,
    QR: QR, qrSvg: qrSvg, qrNaCanvas: qrNaCanvas, tekstWSzer: tekstWSzer, konfettiPunkty: konfettiPunkty, numerStartowy: numerStartowy, dyplom: dyplom, plakat: plakat, grafikaSocial: grafikaSocial, csvZgod: csvZgod, scena: scena, ceglyPrzykladu: ceglyPrzykladu };
})(typeof globalThis !== "undefined" ? globalThis : window);
