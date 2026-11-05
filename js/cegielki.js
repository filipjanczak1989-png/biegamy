// CEGIEŁKI: silnik gry. Gra NIGDY nie dotyka licznika akcji ani statystyk treningowych (blizna-154): żadnego zapisu do training_logs, akcje, akcja_*.
(function () {
  "use strict";
  var KAT = "assets/gra/", WERSJA = "4", BAZA = "https://afqojgkaveykxbltxzwm.supabase.co", LINK_AKCJI = "https://biegamy.run/dla-fabianka.html";
  var L = window.BM_CEGIELKI, parametry = new URLSearchParams(location.search);
  var c = document.getElementById("c"), x = c.getContext("2d", { alpha: false }), $ = function (id) { return document.getElementById(id); };
  var A = {}, OBR = {};

  var SK = 130 / 211, WYS_DROGI = 150, CZAS_RUNDY = 60, GRAW = L.FIZYKA.GRAW, SKOK = L.FIZYKA.SKOK, SALTO_V = L.FIZYKA.SALTO_V, CZAS_SALTA = 0.4, CZAS_SLIZGU = 0.6, SZER_POSTACI = 95, PRZENIK_S = 0.07, CZAS_PRZYSIADU = 0.16;
  var PRED_START = 300, CZAS_KASKU = 10, CZAS_BUTA = 3, CZAS_ZELU = 8, BIDON_S = 5, CZAS_PRZEMIANY = 0.8, CZAS_NIETYKALNY_PRZEMIANA = 1, MAKS_CZASTEK = 80, MAKS_KONFETTI = 20;
  var PRZESZKODY = { pacholek: { sk: 0.42, hh: 50, hw: 22 }, barierka: { sk: 0.5, hh: 50, hw: 44 }, kaluza: { sk: 0.55, hh: 8, hw: 52 }, worki: { sk: 0.5, hh: 50, hw: 42 }, kamien: { sk: 0.45, hh: 50, hw: 42 } };
  var SK_PRZEDMIOTU = { cegla: 0.5, cegla_zlota: 0.58, kask: 0.6, bidon: 0.6, but: 0.6, zel: 0.6 };
  var PODPIS_BONUSU = { kask: "Kask! Cegły ×2", bidon: "+5 sekund", but: "Sprint z magnesem", zel: "Żel: ×2" };
  var LISCIE = ["#e9772b", "#f2b233", "#c9472b", "#d98a23", "#8fae3c"];

  var W = 960, H = 540, skala = 1, dpr = 1, gradNieba = null, pion = false, pasPodDroga = 0;
  var trybMaly = false;
  var startuje = false, noszone = [], stan = "ladowanie", pauza = false, czasGlobalny = 0, G = null, ostatniaPostac = "kasia", wzywa = L.parsujWyzwanieZnajomego(location.search), firmy = [], wskazowkaSlizgu = false, imieGracza = "";
  var ZASADA_WYZWANIA = L.wyzwanieDnia();

  var losowa = function (a, b) { return a + Math.random() * (b - a); }, wybierz = function (t) { return t[Math.floor(Math.random() * t.length)]; }, lerp = function (a, b, t) { return a + (b - a) * t; };
  var schowek = {
    czytaj: function (k, z) { try { var v = localStorage.getItem(k); return v == null ? z : v; } catch (e) { return z; } },
    zapisz: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* prywatne okno */ } },
  };
  imieGracza = schowek.czytaj("cegielki_imie", "");

  function godzinaWPolsce() {
    try { return parseInt(new Date().toLocaleString("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", hourCycle: "h23" }), 10); } catch (e) { return new Date().getHours(); }
  }
  function poraDnia() {
    var z = parametry.get("pora"); if (z) return z;
    var h = godzinaWPolsce();
    return h >= 6 && h < 8 ? "swit" : h >= 8 && h < 16 ? "dzien" : h >= 16 && h < 19 ? "zmierzch" : "noc";
  }
  var PORY = {
    dzien: { g: ["#6db4ec", "#a8d6f2", "#efe6d2"], tint: null, drogaTint: null, slonce: "#fff2bf", chmury: 0.9 },
    swit: { g: ["#46619f", "#f09a7c", "#ffd8a0"], tint: "rgba(240,120,110,.12)", drogaTint: "rgba(60,30,60,.10)", slonce: "#ffd9a0", chmury: 0.7 },
    zmierzch: { g: ["#2c2a63", "#8a4a86", "#f49a5c"], tint: "rgba(70,30,90,.24)", drogaTint: "rgba(40,20,60,.20)", slonce: "#ffc38a", chmury: 0.5 },
    noc: { g: ["#070b24", "#141c47", "#2c3566"], tint: "rgba(10,16,56,.48)", drogaTint: "rgba(8,12,44,.32)", gwiazdy: true, ksiezyc: true, chmury: 0.25 },
  };
  var pora = PORY[poraDnia()] || PORY.dzien;
  var gwiazdy = Array.from({ length: 70 }, function () { return { x: Math.random(), y: Math.random() * 0.62, r: losowa(0.5, 1.6), f: Math.random() * 6 }; });
  var chmury = Array.from({ length: 6 }, function () { return { x: Math.random(), y: losowa(0.06, 0.34), s: losowa(0.7, 1.4) }; });

  function promienista(r, kolory) {
    var p = document.createElement("canvas"); p.width = p.height = r * 2;
    var k = p.getContext("2d"), g = k.createRadialGradient(r, r, 2, r, r, r);
    kolory.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    k.fillStyle = g; k.fillRect(0, 0, r * 2, r * 2);
    return p;
  }
  var poswiataLampy = promienista(110, [[0, "rgba(255,226,140,.85)"], [0.35, "rgba(255,205,110,.28)"], [1, "rgba(255,190,90,0)"]]);
  var poswiataZlota = promienista(60, [[0, "rgba(255,226,90,.95)"], [0.45, "rgba(255,200,60,.42)"], [1, "rgba(255,190,40,0)"]]);
  var poswiataBiala = promienista(50, [[0, "rgba(255,255,255,.75)"], [0.55, "rgba(255,255,255,.28)"], [1, "rgba(255,255,255,0)"]]);

  /* ── dźwięki z WebAudio, bez plików; domyślnie wyciszone, kontekst dopiero po geście ── */
  var D = {
    wlaczony: schowek.czytaj("cegielki_dzwiek", "0") === "1", ctx: null, ostatniaCegla: 0,
    start: function () { if (this.ctx) return; var K = window.AudioContext || window.webkitAudioContext; if (!K) return; try { this.ctx = new K(); } catch (e) { this.ctx = null; } },
    ton: function (hz, od, trwa, typ, glos, doHz) {
      var a = this.ctx, o = a.createOscillator(), v = a.createGain(), t = a.currentTime + od;
      o.type = typ || "sine"; o.frequency.setValueAtTime(hz, t); if (doHz) o.frequency.exponentialRampToValueAtTime(doHz, t + trwa);
      v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(glos || 0.12, t + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, t + trwa);
      o.connect(v); v.connect(a.destination); o.start(t); o.stop(t + trwa + 0.02);
    },
    /* Szum liczony raz na długość: pętla po dziesiątkach tysięcy próbek na głównym wątku to była cała klatka na telefonie. */
    szumy: {},
    buforSzumu: function (trwa) {
      var a = this.ctx, klucz = String(trwa), b = this.szumy[klucz];
      if (b) return b;
      var n = Math.floor(a.sampleRate * trwa); b = a.createBuffer(1, n, a.sampleRate);
      var d = b.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return (this.szumy[klucz] = b);
    },
    /* Dźwięk przemiany gotowy przed rundą: w chwili kasku jeden węzeł zamiast ośmiu oscylatorów i wzmacniaczy. */
    gotowe: {},
    przygotuj: function () {
      if (!this.wlaczony || !this.ctx) return Promise.resolve();
      var D2 = this; [0.22, 0.7, 0.05].forEach(function (t) { D2.buforSzumu(t); });
      if (this.gotowe.przemiana || !(window.OfflineAudioContext || window.webkitOfflineAudioContext)) return Promise.resolve();
      try {
        var K = window.OfflineAudioContext || window.webkitOfflineAudioContext, a = new K(1, Math.ceil(this.ctx.sampleRate * 0.95), this.ctx.sampleRate);
        var ton = function (hz, od, trwa, typ, glos, doHz) {
          var o = a.createOscillator(), v = a.createGain(); o.type = typ; o.frequency.setValueAtTime(hz, od); if (doHz) o.frequency.exponentialRampToValueAtTime(doHz, od + trwa);
          v.gain.setValueAtTime(0.0001, od); v.gain.exponentialRampToValueAtTime(glos, od + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, od + trwa);
          o.connect(v); v.connect(a.destination); o.start(od); o.stop(od + trwa + 0.02);
        };
        ton(300, 0, 0.5, "sawtooth", 0.05, 1400); [1047, 1319, 1568].forEach(function (h, i) { ton(h, 0.35 + i * 0.08, 0.2, "sine", 0.08); });
        return a.startRendering().then(function (b) { D2.gotowe.przemiana = b; }, function () {});
      } catch (e) { return Promise.resolve(); }
    },
    szum: function (od, trwa, glos, filtr) {
      var a = this.ctx, b = this.buforSzumu(trwa);
      var s = a.createBufferSource(), v = a.createGain(), f = a.createBiquadFilter(), t = a.currentTime + od;
      s.buffer = b; f.type = "bandpass"; f.frequency.value = filtr || 1200; f.Q.value = 0.7;
      v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(glos || 0.12, t + trwa * 0.3); v.gain.exponentialRampToValueAtTime(0.0001, t + trwa);
      s.connect(f); f.connect(v); v.connect(a.destination); s.start(t);
    },
    graj: function (co) {
      if (!this.wlaczony || !this.ctx) return;
      try {
        if (this.ctx.state === "suspended") this.ctx.resume();
        if (co === "skok") this.ton(320, 0, 0.16, "triangle", 0.1, 620);
        else if (co === "cegla") { var t = performance.now(); if (t - this.ostatniaCegla < 60) return; this.ostatniaCegla = t; this.ton(880, 0, 0.07, "square", 0.04); this.ton(1320, 0.05, 0.08, "square", 0.04); }
        else if (co === "zlota") [988, 1319, 1760].forEach(function (h, i) { D.ton(h, i * 0.07, 0.16, "triangle", 0.09); });
        else if (co === "przemiana" && this.gotowe.przemiana) { var sp = this.ctx.createBufferSource(); sp.buffer = this.gotowe.przemiana; sp.connect(this.ctx.destination); sp.start(); }
        else if (co === "przemiana") { this.ton(300, 0, 0.5, "sawtooth", 0.05, 1400); [1047, 1319, 1568].forEach(function (h, i) { D.ton(h, 0.35 + i * 0.08, 0.2, "sine", 0.08); }); }
        else if (co === "uderzenie") { this.szum(0, 0.22, 0.22, 400); this.ton(150, 0, 0.2, "sine", 0.18, 60); }
        else if (co === "kibice") { this.szum(0, 0.7, 0.05, 1800); for (var i = 0; i < 5; i++) this.szum(0.05 + i * 0.11, 0.05, 0.05, 3000); }
        else if (co === "meta") [523, 659, 784, 1047].forEach(function (h, i) { D.ton(h, i * 0.13, 0.3, "triangle", 0.11); });
        else if (co === "trik") this.ton(660, 0, 0.14, "sine", 0.08, 990);
        else if (co === "szybciej") this.ton(520, 0, 0.12, "square", 0.05, 1040);
      } catch (e) { /* dźwięk nigdy nie psuje gry */ }
    },
  };
  function odswiezGlosnik() { var b = $("glosnik"); b.textContent = D.wlaczony ? "🔊" : "🔇"; b.setAttribute("aria-label", D.wlaczony ? "Wycisz dźwięki" : "Włącz dźwięki"); b.setAttribute("aria-pressed", String(D.wlaczony)); }

  function rozmiar() {
    var cw = innerWidth, ch = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    /* Pion: węższy świat niż w poziomie, droga w dolnej jednej trzeciej, tło skalowane do góry ekranu. Bardzo wąsko: komunikat zamiast gry. */
    pion = ch > cw;
    skala = pion ? cw / L.SZEROKOSC_PIONU : Math.min(ch / 520, cw / 640);
    W = cw / skala; H = ch / skala;
    pasPodDroga = pion ? Math.max(0, H / 3 - WYS_DROGI) : 0;
    var zaWasko = pion && L.zaWaskoNaGre(cw, ch), ob = $("obroc");
    if (ob) ob.hidden = !zaWasko;
    if (zaWasko && stan === "gra") pauza = true;
    c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr);
    c.style.width = cw + "px"; c.style.height = ch + "px";
    x.setTransform(skala * dpr, 0, 0, skala * dpr, 0, 0);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "low";   // medium budował mipmapy przy pierwszym rysunku każdego arkusza
    gradNieba = x.createLinearGradient(0, 0, 0, H - WYS_DROGI - pasPodDroga);
    pora.g.forEach(function (k, i) { gradNieba.addColorStop(i / (pora.g.length - 1), k); });
  }
  var goraDrogi = function () { return H - WYS_DROGI - pasPodDroga; }, stopy = function () { return goraDrogi() + WYS_DROGI * 0.5; }, graczX = function () { return pion ? 100 : Math.max(120, W * 0.24); };
  var nz = function (k) { return G.postac + "_" + k; };

  /* Pod ekranem ładowania rysujemy raz każdy arkusz W SKALI POSTACI i wszystkie napisy: pierwsze narysowanie w trakcie rundy kosztowało do 67 ms przy CPU x4, a następne ani jednej klatki ponad 24 ms. */
  function rozgrzejObrazy() {
    Object.keys(OBR).forEach(function (n) {
      var o = OBR[n]; if (!o || !A[n]) return;
      var sz = o.naturalWidth || o.width, wy = o.naturalHeight || o.height;
      if (sz && wy) { x.drawImage(o, 0, 0, sz, wy, 0, 0, sz, wy); x.drawImage(o, 0, 0, sz, wy, 0, 0, sz * SK, wy * SK); }
    });
    Object.keys(PODPIS_BONUSU).map(function (k) { return PODPIS_BONUSU[k]; }).concat(["Kask uratował!", "Oj!", "Ślizg!", "+1 złota", "Wyzwanie dnia!", "Szybciej!"]).forEach(function (s) { tekst(s, 20, 60, 24, "#fff"); tekst(s, 20, 60, 26, "#fff"); });
    return new Promise(function (ok) { requestAnimationFrame(function () { requestAnimationFrame(ok); }); });
  }
  /* Przemalowany arkusz to canvas, a pierwszy rysunek canvasu na canvas kosztuje na telefonie kopię do pamięci karty. Bitmapa ma to zrobione przed rundą. */
  var BITMAPY = typeof WeakMap === "function" ? new WeakMap() : null;
  function bitmapyPostaci(nazwy) {
    if (!BITMAPY || !window.createImageBitmap) return Promise.resolve();
    return Promise.all(nazwy.map(function (n) {
      var o = OBR[n];
      if (!o || !o.getContext) return null;
      if (BITMAPY.has(o)) { OBR[n] = BITMAPY.get(o); return null; }
      return createImageBitmap(o).then(function (b) { BITMAPY.set(o, b); OBR[n] = b; }, function () {});
    }));
  }
  /* Próbna przemiana pod ekranem ładowania, bez dźwięku i zapisu: kod bonusów kompiluje się teraz, a nie w chwili pierwszego kasku (26 ms JS przy CPU x4, potem nigdy). Stan próby wyrzucamy. */
  function probaPrzemiany(postac) {
    var dzwiek = D.wlaczony, stanPrzed = stan;
    function posprzataj() { D.wlaczony = dzwiek; stan = stanPrzed; }
    D.wlaczony = false;
    /* Próba tylko przyspiesza pierwszy kask. Gdy się wywróci, runda i tak ma ruszyć. */
    try {
      G = nowyStan(postac); G.maly = true;   // maly: bez wyzwania dnia i bez upadków
      stan = "gra"; pauza = false;
      planujDekor();
      ["kask", "cegla_zlota", "cegla", "zel", "but", "bidon"].forEach(function (t) { zbierz({ typ: t, x: G.s, h: 60 }); });
      G.przeszkody.push({ typ: "pacholek", x: G.s + 400 });
    } catch (e) { posprzataj(); return Promise.resolve(); }
    return new Promise(function (ok) {
      var n = 0;
      (function kolejna() {
        if (n === 3) G.przemiana = 0;   // druga połowa próby: forma budowniczego
        if (++n <= 6) return requestAnimationFrame(kolejna);
        posprzataj();
        ok();
      })();
    });
  }
  function wczytajObrazy(nazwy) {
    return Promise.all(nazwy.map(function (n) {
      return new Promise(function (ok) {
        if (OBR[n] || !A[n]) return ok();
        var i = new Image();
        /* ImageBitmap trzyma obraz zdekodowany: przeglądarka nie zdekoduje arkusza od nowa przy pierwszym rysunku w trakcie rundy. Stąd brała się klatka 633 ms przy przemianie. */
        i.onload = function () {
          var gotowe = function (b) { OBR[n] = b || i; ok(); };
          if (window.createImageBitmap) createImageBitmap(i).then(gotowe, function () { gotowe(null); });
          else (i.decode ? i.decode().catch(function () {}) : Promise.resolve()).then(function () { gotowe(null); });
        };
        i.onerror = function () { ok(); };
        i.src = KAT + A[n].src + "?v=" + WERSJA;
      });
    }));
  }

  /* Poziom rundy z konta (bez konta: z tego urządzenia). Mały budowniczy nie ma poziomów. poziom_gry: tylko pomiar balansu poza produkcją. */
  function poziomRundy() {
    if (trybMaly) return 0;
    var z = Number(parametry.get("poziom_gry"));
    if (z >= 1 && parametry.has("test") && location.hostname !== "biegamy.run" && location.hostname !== "run.biegamy.app") return z;
    var K = window.BM_CEGIELKI_KONTO;
    return K && K.poziom ? K.poziom() : 1;
  }
  function nowyStan(postac) {
    var pz = poziomRundy(), plan = L.planPoziomu(pz);
    return {
      postac: postac, t: 0, czas: CZAS_RUNDY, s: 0, v: PRED_START, predBaza: PRED_START, poziom: pz, plan: plan, krokTempa: 0, drganie: 0,
      y: 0, vy: 0, naZiemi: true, bufor: 0, saltoT: -1, saltoUzyte: false, trik: -1, trikCzas: 0, trikPokazany: -1, szczyt: 0, gorka: null, gorkaFaza: null, katDrogi: 0, gorkaPowiedziana: false, efDx: 0, efKat: 0, przysiad: 0, klN: null, klI: 0, przenikN: null, przenikI: 0, przenikOd: 0, anim: 0, slizg: 0, slizgPoLadowaniu: false,
      reakcja: 0, reakcjaTyp: null, nietykalny: 0, poza: null, przemiana: 0,
      bud: 0, kaskX2: 0, sprint: 0, zel: 0, blysk: 0, seria: 0, comboSalt: 0, cegly: 0,
      st: L.pusteStaty(), bezUpadku: 0, wyzwanieGotowe: false, dzisZrobione: schowek.czytaj("cegielki_wyzwanie_" + L.dzienWaw(), "") === "1",
      przeszkody: [], przedmioty: [], kibice: [], dekor: [], czastki: [], napisy: [],
      nastPrzeszkoda: 900, nastBonus: 1900, kolejkaBonusow: [plan.pierwszyKask ? "kask" : "but"], nastKibic: 1100, nastDekor: 0, nrFirmy: 0, ileDomkow: 0, ileDoPoprzedniego: 0, nrPoprzedniego: 0, ileDoWiezowca: 0, nrWiezowca: 0, ostPrzerwa: Infinity, ostKaskX: -Infinity,
      maly: trybMaly, nastWywrotka: 1400, lopata: null, zgarnia: 0, stoi: 0, przerwaLyzki: 0, latajace: [], rowerX: null, nastRower: losowa(L.ROWER.pierwszy[0], L.ROWER.pierwszy[1]),
    };
  }
  var postepRundy = function () { return Math.min(1, G.t / CZAS_RUNDY); };
  var mnoznikSerii = function () { return L.mnoznikSerii(G.seria, G.maly, G.poziom); };
  var mnoznik = function () { return mnoznikSerii() * (G.kaskX2 > 0 ? 2 : 1) * (G.zel > 0 ? 2 : 1); };

  /* Logo i wysoki budynek dopiero, gdy są firmy. Brak pliku = szyld z nazwą, gra działa dalej. crossOrigin: obrazek do udostępnienia nie może się skazić. */
  var LOGOTYPY = {}, firmyZProby = false;
  function jasneLogoGry(im) {
    try {
      var k = document.createElement("canvas"); k.width = 24; k.height = 24;
      var c2 = k.getContext("2d"); c2.drawImage(im, 0, 0, 24, 24);
      var d = c2.getImageData(0, 0, 24, 24).data, n = 0, suma = 0, przezr = 0;
      for (var i = 0; i < d.length; i += 4) { if (d[i + 3] < 40) { przezr++; continue; } n++; suma += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; }
      return n > 0 && przezr > 0 && suma / n >= 225;
    } catch (e) { return false; }
  }
  function wczytajLogotypy() {
    if (firmy.some(function (f) { return f.rodzaj === "wiezowiec"; })) wczytajObrazy(["wiezowiec"]);
    var budynki = firmy.filter(function (f) { return L.BUDYNKI_POPRZEDNICH[f.rodzaj]; }).map(function (f) { return f.rodzaj; });
    if (budynki.length) wczytajObrazy(budynki);
    firmy.forEach(function (f) {
      [f.logo, f.plakat].forEach(function (adres) {
        if (!adres || LOGOTYPY[adres]) return;
        var im = new Image(); im.crossOrigin = "anonymous"; im.src = adres;
        im.decode().then(function () { im.jasne = !!(window.BM_ULICA && window.BM_ULICA.jasneLogo ? window.BM_ULICA.jasneLogo(im) : jasneLogoGry(im)); LOGOTYPY[adres] = im; }, function () {});
      });
    });
  }
  /* Tabliczka kibica: co drugi raz pseudonim z rankingu (już po moderacji na serwerze), inaczej imię z kartonu. Moderacja jeszcze raz tutaj: to ostatnie sito przed ekranem. */
  function napisKibica() {
    var M = window.BM_MODERACJA, K = window.BM_CEGIELKI_KONTO;
    if (!M) return "Dawaj!";
    var p = !G.maly && K && K.pseudonimKibica && Math.random() < 0.5 ? K.pseudonimKibica() : "";
    return M.imieNaKarton(p || imieGracza, "Dawaj!");
  }
  function planujDekor() {
    var wid = G.s * 0.8;
    while (G.nastDekor < wid + W + 300) {
      var r = Math.random();
      var typ = r < 0.28 ? "latarnia" : r < 0.56 ? "drzewo" : r < 0.95 ? "domek" + (1 + Math.floor(Math.random() * 7)) : "wywrotka";
      var sk = typ === "latarnia" ? 0.56 : typ === "drzewo" ? losowa(0.5, 0.62) : typ === "wywrotka" ? 0.5 : 0.56;
      var o = A[typ]; if (!o) { G.nastDekor += 200; continue; }
      var szer = o.w * sk, firma = null;
      if (/^domek/.test(typ) && firmy.length) {
        var wiezowce = firmy.filter(function (f) { return f.rodzaj === "wiezowiec"; }), poprzedni = firmy.filter(function (f) { return L.BUDYNKI_POPRZEDNICH[f.rodzaj] && OBR[f.rodzaj]; }), male = firmy.filter(function (f) { return f.rodzaj !== "wiezowiec" && !L.BUDYNKI_POPRZEDNICH[f.rodzaj]; });
        if (poprzedni.length && ++G.ileDoPoprzedniego >= L.POPRZEDNI_CO) {
          G.ileDoPoprzedniego = 0; firma = poprzedni[G.nrPoprzedniego++ % poprzedni.length]; typ = firma.rodzaj; o = A[typ];
          sk = Math.min(L.BUDYNKI_POPRZEDNICH[typ], goraDrogi() * 0.92) / o.h; szer = o.w * sk;
        } else if (wiezowce.length && OBR.wiezowiec && ++G.ileDoWiezowca >= L.WIEZOWIEC_CO) {
          G.ileDoWiezowca = 0; typ = "wiezowiec"; o = A.wiezowiec;
          sk = Math.min(0.5, Math.max(0.3, (goraDrogi() + 10 - 44) / 0.825 / o.h));   // szyld z logo musi się zmieścić na ekranie także w poziomie
          szer = o.w * sk; firma = wiezowce[G.nrWiezowca++ % wiezowce.length];
        } else if (male.length && G.ileDomkow++ % 2 === 0) firma = male[G.nrFirmy++ % male.length];
      }
      G.dekor.push({ typ: typ, x: G.nastDekor + szer / 2, sk: sk, lustro: !firma && Math.random() < 0.5 && typ !== "wywrotka", firma: firma });
      G.nastDekor += szer + losowa(typ === "latarnia" ? 40 : 70, 260);
    }
  }
  function planujTrase() {
    while (G.nastPrzeszkoda < G.s + W + 300) {
      var przedmiotyOd = G.przedmioty.length, fazaXp = L.fazaGorki(G.nastPrzeszkoda, G.gorka);
      var P = G.plan, xp = G.nastPrzeszkoda, post = G.maly ? 0 : postepRundy(), para = Math.random() < P.para ? wybierz(L.PARY) : null, typ = para ? para[0] : wybierz(Object.keys(PRZESZKODY));
      G.przeszkody.push({ typ: typ, x: xp, zuzyta: false, zaliczona: false });
      /* Mały budowniczy: wywrotka jedzie w tle i zrzuca rząd cegieł na drogę */
      if (G.maly && xp >= G.nastWywrotka) {
        for (var c = 0; c < L.MALY_CEGIEL_W_RZEDZIE; c++) G.przedmioty.push({ typ: "cegla", x: xp + 90 + c * 44, h: 44 });
        if (A.wywrotka) G.dekor.push({ typ: "wywrotka", x: (xp + 60) * 0.8, sk: 0.5, lustro: false, firma: null });
        G.nastWywrotka = xp + G.predBaza * losowa(5, 8);
      }
      var r = Math.random();
      /* Złota w powietrzu wymaga wcześniejszego wybicia: po ciasnym odstępie albo tuż po kasku (przemiana blokuje sterowanie) nikt by jej nie dosięgnął, więc wtedy zwykły łuk. */
      var zRozbiegu = cechy().skacze === false || G.maly || (G.ostPrzerwa >= G.predBaza * L.ROZBIEG_ZLOTEJ && xp - G.ostKaskX > G.predBaza * (CZAS_PRZEMIANY + 0.7));
      var kopG = cechy().skacze === false, ileCegiel = kopG ? L.ceglyKoparki(G.poziom) : 1, pLuk = P.luk * ileCegiel, gZlota = pLuk + P.zlota * (kopG ? 0.6 : 1);   // koparka zgarnia złotą bez ryzyka skoku, więc rzadziej
      if ((fazaXp && fazaXp.faza === "zjazd") || r < pLuk || (r < gZlota && !zRozbiegu)) dodajLuk(xp);
      else if (r < gZlota) {
        var skB = L.skalaSkoku(G.postac) * 150, xz = cechy().skacze === false ? xp - L.KLATKI_KOPARKI.zlota_przed : xp;   // koparka zgarnia złotą łyżką w tym samym zamachu, który rozbija przeszkodę
        G.przedmioty.push({ typ: "cegla_zlota", x: xz, h: L.wysokoscZlotej(G.postac, G.maly) }, { typ: "cegla", x: xp - 44, h: skB }, { typ: "cegla", x: xp + 44, h: skB });
      }
      var T = (lerp(1.25, 0.98, post) + Math.random() * lerp(0.85, 0.55, post)) * P.odstep, przerwa = Math.max(280, G.predBaza * T);
      /* Para: druga przeszkoda za pierwszą, reszta trasy liczona od niej. Złota za parą wymaga skoku z drugim ruchem nad drugą przeszkodą, więc za nią musi być miejsce na lądowanie. */
      if (para) {
        var odl = L.odstepPary(para, G.postac, G.predBaza);
        G.przeszkody.push({ typ: para[1], x: xp + odl, zuzyta: false, zaliczona: false });
        xp += odl;
        if (odl > 200 && Math.random() < pLuk) dodajLuk(xp);
        else if (odl > 200 && zRozbiegu && Math.random() < P.zlotaPara) {
          var kop = cechy().skacze === false;
          G.przedmioty.push({ typ: "cegla_zlota", x: kop ? xp - L.KLATKI_KOPARKI.zlota_przed : xp + G.predBaza * 0.55, h: L.wysokoscZlotej(G.postac, G.maly) });
          przerwa = Math.max(przerwa, G.predBaza * 1.3);
        }
      }
      if (przerwa > 420 && Math.random() < P.rzad * ileCegiel) {
        var sr = xp + przerwa / 2, hRzedu = L.wysokoscRzedu(G.postac, P, Math.random()), zloty = hRzedu === 44 && Math.random() < P.zlotaNaZiemi;
        for (var k = 0; k < 4; k++) G.przedmioty.push({ typ: zloty && k === 1 ? "cegla_zlota" : "cegla", x: sr + (k - 1.5) * 44, h: hRzedu });
      } else if (xp + przerwa / 2 > G.nastBonus) {
        if (!G.kolejkaBonusow.length) G.kolejkaBonusow = L.kolejkaBonusow(P).sort(function () { return Math.random() - 0.5; });
        var typB = G.kolejkaBonusow.pop();
        if (typB === "kask") G.ostKaskX = xp + przerwa / 2;
        G.przedmioty.push({ typ: typB, x: xp + przerwa / 2, h: typB === "kask" ? L.wysokoscKasku(G.postac, G.maly) : Math.random() < 0.6 ? 62 : 150 });
        G.nastBonus = xp + przerwa / 2 + G.predBaza * losowa(6.5, 10) * P.odstepBonusu;
      }
      /* Podjazd: cegły wyżej, ale zawsze w zasięgu postaci. */
      if (G.gorka) { var zasieg = L.zasiegPostaci(G.postac).maks; for (var pg = przedmiotyOd; pg < G.przedmioty.length; pg++) { var ep = G.przedmioty[pg], fp = L.fazaGorki(ep.x, G.gorka); if (fp && fp.faza === "podjazd") ep.h = Math.min(zasieg, ep.h + L.GORKA.wyzej); } }
      G.nastPrzeszkoda += przerwa; G.ostPrzerwa = przerwa;
    }
    while (G.nastKibic < G.s + W + 300) {
      var ile = 1 + Math.floor(Math.random() * 3), pula = ["k1", "k2", "k3", "k4"].sort(function () { return Math.random() - 0.5; }).slice(0, ile), px = G.nastKibic;
      for (var m = 0; m < pula.length; m++) {
        var n = pula[m]; if (!A[n]) continue;
        G.kibice.push({ n: n, x: px, f: Math.random() * 6, napis: n === "k2" ? napisKibica() : null, slyszany: false });
        px += A[n].w * 0.6 + 12;
      }
      G.nastKibic += G.predBaza * losowa(6, 10);
    }
  }

  function dodajLuk(xs) {
    var P = G.plan, los = Math.random();
    for (var i = -2; i <= 2; i++) G.przedmioty.push({ typ: "cegla", x: xs + i * 44, h: L.wysokoscLuku(G.postac, i, P, los) });
  }
  /* Próba przemiany zostawiła napisy i przeszkody: pod ekranem przed rundą ma być czysta droga. */
  function czystaDroga() { G.napisy.length = 0; G.czastki.length = 0; G.przeszkody.length = 0; G.przedmioty.length = 0; G.kibice.length = 0; }
  /* Plansza komiksowa z grafik, które gra już ma. Brak obrazka = plansza bez niego, gra działa dalej. */
  function rysujPlansze(kan, pl) {
    var scena = pl.scena.map(function (e) { return e.koparka && OBR.koparka_ark && A.koparka_ark ? Object.assign({}, e, { n: "koparka_ark", kl: L.KLATKI_KOPARKI.radosc }) : e; });
    return wczytajObrazy(scena.map(function (e) { return e.n; }).concat(["krajobraz", "droga"])).then(function () {
      var k = kan.getContext("2d"), sz = kan.width, wy = kan.height, ziemia = wy * 0.76, nieboK = pl.noc ? ["#070b24", "#2c3566"] : ["#6db4ec", "#efe6d2"];
      var nb = k.createLinearGradient(0, 0, 0, ziemia); nb.addColorStop(0, nieboK[0]); nb.addColorStop(1, nieboK[1]);
      k.fillStyle = nb; k.fillRect(0, 0, sz, wy);
      if (OBR.krajobraz && A.krajobraz) { var hk = A.krajobraz.h * sz / A.krajobraz.w; k.drawImage(OBR.krajobraz, 0, ziemia - hk * 0.92, sz, hk); }
      if (OBR.droga) k.drawImage(OBR.droga, 0, ziemia, sz, wy - ziemia);
      scena.forEach(function (e) {
        var a = A[e.n], o = OBR[e.n]; if (!a || !o) return;
        var ww = a.cw || a.w, hh = a.ch || a.h, sk3 = e.h * wy / hh, w3 = ww * sk3, h3 = hh * sk3, xe = e.x * sz - w3 / 2, ye = ziemia + wy * 0.1 - h3;
        if (a.cw) k.drawImage(o, a.cw * (e.kl || 0), 0, a.cw, a.ch, xe, ye, w3, h3); else k.drawImage(o, xe, ye, w3, h3);
      });
      if (pl.noc) { k.fillStyle = "rgba(10,16,56,.32)"; k.fillRect(0, 0, sz, wy); }
    });
  }
  function pokazPlansze(pl) {
    var e = $("plansza");
    if (!e) return Promise.resolve();
    $("pl-tytul").textContent = pl.tytul; $("pl-tekst").textContent = pl.tekst;
    return rysujPlansze($("pl-obraz"), pl).catch(function () {}).then(function () {
      $("menu").hidden = true; $("koniec").hidden = true; e.hidden = false;
      return new Promise(function (ok) { var b = $("pl-dalej"), dalej = function () { b.removeEventListener("click", dalej); e.hidden = true; ok(); }; b.addEventListener("click", dalej); });
    });
  }
  /* Plansze przed rundą, po kolei: nowy rozdział i bonusy za mur, każda raz na urządzenie. */
  function planszeRundy() {
    var K = window.BM_CEGIELKI_KONTO, n = poziomRundy();
    if (!n || parametry.has("test") || !K || !K.planszeDoPokazania || K.premiera()) return Promise.resolve();
    return K.planszeDoPokazania(n).reduce(function (d, pl) { return d.then(function () { return pokazPlansze(pl); }); }, Promise.resolve());
  }
  /* Ekran przed rundą: poziom, rozdział, wartość cegły. Dotknięcie skraca. Mały budowniczy nie ma poziomów, pomiary startują od razu. */
  function ekranPrzedRunda(rusz) {
    var K = window.BM_CEGIELKI_KONTO, n = poziomRundy(), e = $("przed");
    if (!e || !n || parametry.has("test") || !K || K.premiera()) return rusz();
    $("p-poziom").textContent = "Poziom " + n;
    $("p-rozdzial").textContent = K.rozdzial ? K.rozdzial(n) : L.rozdzial(n);
    $("p-info").textContent = "Cegła warta " + L.tekstMnoznika(n);
    $("menu").hidden = true; $("koniec").hidden = true; e.hidden = false;
    var poszlo = false, dalej = function () { if (poszlo) return; poszlo = true; clearTimeout(zegar); e.removeEventListener("pointerdown", dalej); e.hidden = true; rusz(); }, zegar = setTimeout(dalej, 1300);
    e.addEventListener("pointerdown", dalej);
  }
  function start(postac) {
    /* Ładowanie z próbą trwa kilka klatek, a menu jeszcze stoi: drugie stuknięcie zaczęłoby drugą rundę i drugi raz pobrało ulepszenie. */
    if (startuje) return;
    startuje = true;
    ostatniaPostac = postac;
    var pole = $("imie"); if (pole) { imieGracza = pole.value.trim(); schowek.zapisz("cegielki_imie", imieGracza); }
    trybMaly = !!($("m-maly") && $("m-maly").checked);
    var STROJ = window.BM_CEGIELKI_STROJ, KONTO = window.BM_CEGIELKI_KONTO, ubior = KONTO ? L.strojPostaci(KONTO.wybor(postac), postac) : null;
    noszone = STROJ && ubior ? STROJ.noszone(ubior) : [];
    var naz = Object.keys(A).filter(function (k) { return k.indexOf(postac + "_") === 0; }).concat(STROJ ? STROJ.nazwyObrazow(noszone) : []);
    $("ladowanie").hidden = false; $("ladowanie").textContent = "Ładuję…";
    var t0Startu = performance.now();
    wczytajObrazy(naz).then(function () {
      /* Strój to tylko wygląd: gdy przeróbka się nie uda, gra rusza w oryginale. */
      try { if (STROJ) STROJ.zastosuj(OBR, A, postac, ubior); } catch (e) {}
      return bitmapyPostaci(naz).then(function () { return D.przygotuj(); }).then(rozgrzejObrazy).then(function () { return probaPrzemiany(postac); });
    }).then(function () {
      $("ladowanie").hidden = true;
      czystaDroga();
      return planszeRundy();
    }).then(function () {
      return new Promise(ekranPrzedRunda);
    }).then(function () {
      startuje = false;
      if (DIAG) { DIAG.start = performance.now() - t0Startu; DIAG.przem = DIAG.reszta = 0; DIAG.przemN = DIAG.resztaN = 0; DIAG.zbierz = 0; }
      $("ladowanie").hidden = true;
      G = nowyStan(postac);
      if (L.gorkaWRundzie(G.poziom, G.maly) && !OBR.gorka) wczytajObrazy(["gorka"]);
      if (L.druzynaWRundzie(G.poziom, G.maly) && !OBR.druzyna) wczytajObrazy(["druzyna"]);
      $("menu").hidden = true; $("koniec").hidden = true;
      stan = "gra"; pauza = false;
      planujDekor();
      /* Ulepszenie startowe dopiero po potwierdzeniu z serwera: najpierw zapłacone, potem założone. */
      var tejRundy = G;
      if (!trybMaly && window.BM_CEGIELKI_KONTO && window.BM_CEGIELKI_KONTO.przedRunda) window.BM_CEGIELKI_KONTO.przedRunda(function (typ) { if (G === tejRundy && stan === "gra") zbierz({ typ: typ, x: G.s, h: 60 }); });
    });
  }

  /* ── sterowanie: tap = skok, drugi tap w powietrzu = salto, przesunięcie w dół = ślizg; w powietrzu przesunięcie w dół to szybkie lądowanie w ślizg ── */
  function dotyk() {
    if (pauza) { pauza = false; return; }
    if (stan !== "gra") return;
    var g = G;
    if (cechy().skacze === false) { zamachLyzka(); return; }
    if (g.reakcja > 0 || g.przemiana > 0) return;
    if (g.naZiemi) { g.slizg = 0; skocz(); return; }
    if (g.y < 22 && g.vy < 0) { g.bufor = 0.14; return; }
    if (!g.saltoUzyte) { g.saltoUzyte = true; g.saltoT = 0; g.vy = cechy().podbicie || SALTO_V * (cechy().skok || 1); g.szczyt = L.szczytLuku(g.y, g.vy); g.trik = -1; g.trikCzas = 0; g.trikPokazany = -1; D.graj("skok"); }
  }
  function ruchWDol() {
    if (pauza || stan !== "gra") return;
    var g = G;
    if (cechy().skacze === false) return;
    if (g.reakcja > 0 || g.przemiana > 0) return;
    if (g.naZiemi) { if (g.slizg <= 0) { g.slizg = CZAS_SLIZGU; pyl(); } return; }
    g.vy = Math.min(g.vy, -1300); g.slizgPoLadowaniu = true; g.saltoT = -1; g.trik = -1; g.trikCzas = 0;
  }
  function skocz() { var g = G; g.naZiemi = false; g.vy = SKOK * (cechy().skok || 1); g.y = 0.01; g.saltoUzyte = false; g.saltoT = -1; g.bufor = 0; g.trik = -1; g.trikCzas = 0; g.trikPokazany = -1; D.graj("skok"); }
  /* Figura zaczyna się po salcie: wysoko pełna, nisko zwykła klatka skoku. Kask i własne arkusze (rower) figur nie mają. */
  function zacznijFigure(g) {
    if (g.bud > 0 || cechy().wlasne) return;
    var przed = g.przeszkody.filter(function (p) { return !p.zuzyta && !p.ukryta; }).map(function (p) { return p.x - g.s; });
    var nr = L.figuraPoSalcie(g.y, g.szczyt, Math.random(), !L.miejsceNaLot(g.y, g.vy, 0.25, przed, g.v));
    if (nr < 0) return;
    g.trik = nr; g.trikPokazany = nr; g.trikCzas = L.FIGURY[nr].czas;
    if (L.FIGURY[nr].iskra) {
      for (var i = 0; i < 9 && g.czastki.length < MAKS_CZASTEK; i++) { var a = i * 0.7; g.czastki.push({ x: graczX(), y: stopy() - g.y - 70, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: losowa(2, 4), kat: 0, vk: 3, kol: "#ffe07a", t: 0.25 }); }
      D.graj("trik");
    }
  }
  function pyl() { for (var i = 0; i < 6 && G.czastki.length < MAKS_CZASTEK; i++) G.czastki.push({ x: graczX() - 10, y: stopy(), vx: losowa(-180, -60), vy: losowa(-90, -20), r: losowa(3, 6), kat: 0, vk: 3, kol: "#d9cdb8", t: 0.45 }); }
  /* Rower i koparka mają własne arkusze: poza z arkusza, którego nie mają, po prostu się nie włącza. Bez tego postać znikałaby na czas pozy. */
  function ustawPoze(ark, klatka, t) { if (A[nz(ark)]) G.poza = { n: nz(ark), i: klatka, t: t }; }
  function pozaBonusu(rodzaj, t) { var kl = L.KLATKI_H[G.postac]; if (kl) ustawPoze("H", kl[rodzaj], t); }
  var cechy = function () { return L.POSTACIE[G.postac] || {}; };

  function dodajNapis(txt, xe, ye, kol, roz) { G.napisy.push({ txt: txt, x: xe, y: ye, t: 1.1, kol: kol || "#fff", roz: roz || 24 }); }
  function konfetti(xe, ye, ile) {
    for (var i = 0; i < Math.min(ile, MAKS_KONFETTI) && G.czastki.length < MAKS_CZASTEK; i++) {
      var a = Math.random() * Math.PI * 2, s = losowa(120, 480);
      G.czastki.push({ x: xe, y: ye, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 180, r: losowa(4, 9), kat: Math.random() * 6, vk: losowa(-9, 9), kol: wybierz(LISCIE), t: losowa(0.8, 1.4) });
    }
  }

  function uderzenie(p) {
    var g = G, xs = graczX();
    p.zuzyta = true;
    if (g.maly) return;   // Mały budowniczy się nie przewraca
    if (g.bud > 0) {
      g.bud = 0; g.blysk = 0.3; g.nietykalny = 0.9; p.rozbita = true;
      pozaBonusu("tarcza", 0.4);
      konfetti(xs, stopy() - g.y - 70, 34);
      dodajNapis("Kask uratował!", xs + 20, stopy() - g.y - 150, "#ffe07a", 26);
      D.graj("uderzenie");
      return;
    }
    g.st.upadki++; g.seria = 0; g.comboSalt = 0; g.bezUpadku = 0; g.slizg = 0; g.poza = null;
    var r = g.postac === "rowerzysta" ? "rower" : L.REAKCJE[p.typ] ? p.typ : "inne";
    if (r === "inne" && Math.random() < 0.25) r = "liscie";
    g.reakcjaTyp = r; g.reakcja = L.REAKCJE[r].czas;
    g.saltoT = -1; g.trik = -1; g.trikCzas = 0; g.vy = Math.min(g.vy, 0); g.sprint = 0;
    if (p.typ === "pacholek") p.ukryta = true;
    if (r === "liscie") konfetti(xs, stopy() - 30, 26);
    dodajNapis("Oj!", xs + 30, stopy() - g.y - 150, "#ffb0a0", 26);
    D.graj("uderzenie");
  }
  /* Przemiana blokuje sterowanie, więc tuż po niej nie może czekać przeszkoda: droga na czas przemiany i pół sekundy na reakcję zostaje pusta. */
  function oczyscPrzedGraczem() {
    var g = G, zasieg = g.predBaza * (CZAS_PRZEMIANY + 0.55);
    g.przeszkody.forEach(function (p) { var d = p.x - g.s; if (!p.zuzyta && d > -30 && d < zasieg) { p.zuzyta = true; p.ukryta = true; } });
    if (g.nastPrzeszkoda < g.s + zasieg) g.nastPrzeszkoda = g.s + zasieg;
  }
  function zbierz(e) {
    var g = G, xs = e.x - g.s + graczX(), ys = stopy() - e.h, m;
    if (e.typ === "cegla") { m = mnoznik(); g.cegly += m; g.bezUpadku += m; if (m > 1) dodajNapis("+" + m, xs, ys - 16, "#ffd9a0", 18); D.graj("cegla"); return; }
    /* Złota cegła to waluta sklepiku: liczy się sztuka, bez punktów i bez mnożników. Do muru idą tylko zwykłe. */
    if (e.typ === "cegla_zlota") { g.st.zlote++; g.zgarnia = L.KLATKI_KOPARKI.zgarnianie_s; dodajNapis("+1 złota", xs, ys - 18, "#ffe07a", 24); konfetti(xs, ys, 8); D.graj("zlota"); return; }
    if (e.typ === "kask" && DIAG) DIAG.t0 = performance.now();
    if (e.typ === "kask") { g.bud = CZAS_KASKU; g.kaskX2 = CZAS_KASKU; g.blysk = 0.3; if (A[nz("G")]) { g.przemiana = CZAS_PRZEMIANY; g.nietykalny = Math.max(g.nietykalny, CZAS_NIETYKALNY_PRZEMIANA); oczyscPrzedGraczem(); } g.st.kaski++; konfetti(graczX(), stopy() - g.y - 70, 20); D.graj("przemiana"); }
    if (e.typ === "kask" && DIAG) DIAG.zbierz = Math.max(DIAG.zbierz, performance.now() - DIAG.t0);
    if (e.typ === "bidon") { g.czas += BIDON_S; g.st.bidony++; if (g.naZiemi) ustawPoze("F", 5, 0.5); D.graj("cegla"); }
    if (e.typ === "but") { g.sprint = CZAS_BUTA; g.st.buty++; if (g.naZiemi) pozaBonusu("magnes", 0.45); D.graj("zlota"); }
    if (e.typ === "zel") { g.zel = CZAS_ZELU; g.st.zele++; if (g.naZiemi) pozaBonusu("zel", 0.45); D.graj("zlota"); }
    dodajNapis(PODPIS_BONUSU[e.typ], graczX() + 30, stopy() - g.y - 170, "#fff", 24);
  }

  /* Koparka nie skacze: dotknięcie to zamach. W chwili uderzenia łyżka rozbija przeszkody w oknie przed koparką i daje bonus. Spóźnienie nie przewraca, ale koparka staje i seria spada do zera. */
  function zamachLyzka() {
    var g = G;
    if (g.lopata || g.stoi > 0 || g.przerwaLyzki > 0) return;
    g.lopata = { t: 0 };
    D.graj("skok");
  }
  function uderzenieLyzki() {
    var g = G, K = L.KLATKI_KOPARKI, trafila = false;
    g.przeszkody.forEach(function (p) {
      var r = p.x - g.s;
      if (!p.zuzyta && p.typ !== "kaluza" && r > 0 && r < K.okno) { rozwal(p); trafila = true; }
    });
    if (!trafila) g.przerwaLyzki = K.przerwa_s;
  }
  function krokLyzki(p, roznica, d) {
    if (p.zuzyta) return;
    /* Kałuża nie zatrzyma koparki i nie ma czego rozbijać: rozbryzg, bez kary i bez bonusu. */
    if (p.typ === "kaluza") { if (roznica < 10) { p.zuzyta = true; p.zaliczona = true; konfetti(graczX(), stopy() - 6, 8); } return; }
    if (roznica < d.hw + 30) spoznienie(p);
  }
  function krokKoparki(dt) {
    var g = G, K = L.KLATKI_KOPARKI, l = g.lopata;
    if (l) {
      var przed = l.t;
      l.t += dt;
      if (przed < K.zamach_s && l.t >= K.zamach_s) uderzenieLyzki();
      if (l.t >= K.zamach_s + K.uderzenie_s) g.lopata = null;
    }
    for (var i = g.latajace.length - 1; i >= 0; i--) {
      var o = g.latajace[i]; o.vy += 1500 * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.kat += o.vk * dt;
      if (o.y > H + 120) g.latajace.splice(i, 1);
    }
  }
  function wyrzucPrzeszkode(p, xs) {
    var g = G, st = stopy();
    p.zuzyta = true; p.ukryta = true; p.zaliczona = true;
    if (p.typ === "worki") { konfetti(xs, st - 26, 20); for (var i = 0; i < 6 && g.czastki.length < MAKS_CZASTEK; i++) g.czastki.push({ x: xs, y: st - 20, vx: losowa(-260, 260), vy: losowa(-320, -60), r: losowa(5, 10), kat: 0, vk: 3, kol: "#d9cdb8", t: 0.6 }); }
    else g.latajace.push({ typ: p.typ, x: xs, y: st, vx: losowa(240, 460), vy: losowa(-820, -560), kat: 0, vk: losowa(5, 11) });
  }
  /* Trafienie: pachołki, kamienie i barierki fruwają, worki pękają, a do tego bonus i seria. */
  function rozwal(p) {
    var g = G, xs = p.x - g.s + graczX(), K = L.KLATKI_KOPARKI;
    wyrzucPrzeszkode(p, xs);
    g.seria++;
    var m = mnoznik() * K.bonus; g.cegly += m; g.bezUpadku += m;
    dodajNapis((p.typ === "worki" ? "Trach! +" : "Bum! +") + m, xs, stopy() - 110, "#ffe07a", 24);
    D.graj("uderzenie");
  }
  /* Spóźnienie: przeszkoda i tak odpada, ale bez bonusu, koparka staje, seria od zera. */
  function spoznienie(p) {
    var g = G, K = L.KLATKI_KOPARKI;
    wyrzucPrzeszkode(p, p.x - g.s + graczX());
    g.stoi = K.stop_s; g.v = 0; g.seria = 0; g.bezUpadku = 0; g.lopata = null; g.st.upadki++;
    dodajNapis("Za późno!", graczX() + 30, stopy() - 160, "#ffb0a0", 26);
    D.graj("uderzenie");
  }
  var ZEGARY = ["przysiad", "drganie", "bud", "kaskX2", "sprint", "zel", "blysk", "nietykalny", "bufor", "slizg", "przemiana", "zgarnia", "stoi", "przerwaLyzki"];
  function krok(dt) {
    var g = G;
    g.t += dt; g.czas -= dt;
    if (g.czas <= 0) { g.czas = 0; koniecRundy(); return; }
    g.predBaza = PRED_START * g.plan.tempo * L.tempoRundy(g.t, g.maly) * (g.maly ? L.MALY_TEMPO : 1) * (cechy().tempo || 1);
    var kt = L.krokiTempa(g.t, g.maly);
    if (kt > g.krokTempa) {
      g.krokTempa = kt; g.drganie = 0.22;
      dodajNapis("Szybciej!", W / 2, goraDrogi() - 170, "#ffe07a", 34); D.graj("szybciej");
      try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}
    }
    if (!g.gorka && g.t >= L.GORKA.start_s && L.gorkaWRundzie(g.poziom, g.maly)) g.gorka = L.nowaGorka(Math.max(g.nastPrzeszkoda, g.s + W + 320), g.predBaza);
    g.gorkaFaza = L.fazaGorki(g.s, g.gorka);
    g.katDrogi += (L.katGorki(g.gorkaFaza) - g.katDrogi) * Math.min(1, dt * 4);
    if (g.gorkaFaza && !g.gorkaPowiedziana && g.gorkaFaza.faza === "podjazd" && g.gorkaFaza.p > 0.1) {
      g.gorkaPowiedziana = true;
      var KG = window.BM_CEGIELKI_KONTO, naRowerze = KG && KG.rowerNa ? KG.rowerNa() : null;
      if (g.postac === "kasia" || g.postac === "filip") dodajNapis(L.TEKST_GORKI, graczX() + 30, stopy() - 170, "#fff", 22);
      /* Rowerzysta mija gracza w połowie podjazdu, tylko gdy jest włączony. */
      if (naRowerze !== null && g.postac !== "rowerzysta") { if (rowerObraz && g.rowerX === null) g.rowerX = -90; dodajNapis(L.tekstPrzerzutek(naRowerze), W / 2, goraDrogi() - 120, "#ffe07a", Math.min(22, W / 24)); }
    }
    var cel = g.predBaza * L.tempoGorki(g.gorkaFaza) * (g.sprint > 0 ? 1.35 : 1) * (g.reakcja > 0 ? 0.28 : 1) * (g.stoi > 0 ? 0 : 1);
    g.v += (cel - g.v) * Math.min(1, dt * 6);
    g.s += g.v * dt;
    g.anim += dt * (9 + g.v / 34);
    for (var iz = 0; iz < ZEGARY.length; iz++) { var kz = ZEGARY[iz]; if (g[kz] > 0) g[kz] = Math.max(0, g[kz] - dt); }
    if (g.poza) { g.poza.t -= dt; if (g.poza.t <= 0) g.poza = null; }
    if (g.reakcja > 0) { g.reakcja -= dt; if (g.reakcja <= 0) { g.reakcja = 0; g.reakcjaTyp = null; g.nietykalny = 1.0; ustawPoze("F", 1, 0.35); } }
    if (!g.naZiemi) {
      g.vy -= GRAW * dt;
      if (g.trik >= 0 && L.FIGURY[g.trik].lot && g.vy < -L.LOT_OPAD) g.vy = -L.LOT_OPAD;
      g.y += g.vy * dt;
      if (g.saltoT >= 0 && g.saltoT < 1) { g.saltoT = Math.min(1, g.saltoT + dt / CZAS_SALTA); if (g.saltoT >= 1) zacznijFigure(g); }
      else if (g.trik >= 0) { g.trikCzas -= dt; if (g.trikCzas <= 0) { g.trik = -1; g.trikCzas = 0; } }
      if (g.y <= 0) {
        g.y = 0; g.vy = 0; g.naZiemi = true;
        if (g.saltoUzyte && g.reakcja <= 0 && !g.slizgPoLadowaniu) {
          var nrTriku = g.trikPokazany;
          g.st.salta++; g.st.triki++; g.comboSalt++; g.seria += 2; g.st.salta_pod_rzad = Math.max(g.st.salta_pod_rzad, g.comboSalt);
          var combo = Math.min(g.comboSalt, L.COMBO_MAKS), m = mnoznik(); g.cegly += m * combo; g.bezUpadku += m * combo;
          ustawPoze("A", 5, 0.12);
          dodajNapis((combo > 1 ? "Combo ×" + combo + ": " : "") + (g.postac === "rowerzysta" ? "Podbicie" : nrTriku >= 0 ? L.NAZWY_TRIKOW[nrTriku] : "Salto") + "!", graczX() + 20, stopy() - 150, "#9df0a8", 26);
          D.graj("trik");
        } else if (g.reakcja <= 0) { ustawPoze("A", 5, 0.09); if (!g.saltoUzyte) g.comboSalt = 0; }
        if (g.postac === "rowerzysta" && g.reakcja <= 0) ustawPoze("skok", 2, 0.14);
        if (!cechy().wlasne) g.przysiad = CZAS_PRZYSIADU;
        g.saltoUzyte = false; g.saltoT = -1; g.trik = -1; g.trikCzas = 0; g.trikPokazany = -1;
        if (g.slizgPoLadowaniu) { g.slizgPoLadowaniu = false; g.slizg = CZAS_SLIZGU * 0.7; pyl(); }
        else if (g.bufor > 0 && g.reakcja <= 0) skocz();
      }
    }
    /* Figura idzie do przodu i się pochyla, potem płynnie wraca na swoje miejsce. Samo rysowanie: kolizje liczą dalej od graczX. */
    var fg = g.trik >= 0 ? L.FIGURY[g.trik] : null;
    g.efDx += ((fg ? fg.przod * SZER_POSTACI : 0) - g.efDx) * Math.min(1, dt * (fg ? 18 : 9));
    g.efKat += ((fg ? fg.kat : 0) - g.efKat) * Math.min(1, dt * (fg ? 18 : 10));
    var ps = L.progiSerii(g.poziom, g.maly); if (g.seria === ps.x2 || g.seria === ps.x3) { if (!g.progSerii || g.progSerii !== g.seria) { g.progSerii = g.seria; if (g.naZiemi && !g.poza) ustawPoze("F", 3, 0.4); } }
    planujDekor(); planujTrase();
    /* Rowerzysta tylko jedzie: żadnej kolizji, żadnych cegieł */
    if (rowerObraz && g.postac !== "rowerzysta") {
      if (g.rowerX === null) { g.nastRower -= dt; if (g.nastRower <= 0) { g.rowerX = -90; D.graj("kibice"); } }
      else { g.rowerX += L.ROWER.predkosc * dt; if (g.rowerX > W + 90) { g.rowerX = null; g.nastRower = losowa(L.ROWER.kolejny[0], L.ROWER.kolejny[1]); } }
    }

    var gx = g.s, zasiegL = gx - graczX() - 300, koparka = g.postac === "koparka";
    if (koparka) krokKoparki(dt);
    for (var a = 0; a < g.przeszkody.length; a++) {
      var p = g.przeszkody[a], d = PRZESZKODY[p.typ], roznica = p.x - gx;
      var slizgPod = p.typ === "barierka" && g.slizg > 0;
      if (p.typ === "barierka" && !wskazowkaSlizgu && roznica < 420 && roznica > 0) { wskazowkaSlizgu = true; g.podpowiedz = 2.2; }
      if (koparka) { krokLyzki(p, roznica, d); continue; }
      if (!p.zuzyta && !slizgPod && g.reakcja <= 0 && g.nietykalny <= 0 && Math.abs(roznica) < d.hw + (cechy().marginesKolizji || 22) && g.y < d.hh) uderzenie(p);
      if (slizgPod && Math.abs(roznica) < d.hw) p.podSlizgiem = true;
      if (!p.zuzyta && !p.zaliczona && roznica < -d.hw - 22) { p.zaliczona = true; g.seria++; if (p.podSlizgiem) { g.st.slizgi++; g.seria++; g.cegly += mnoznik(); dodajNapis("Ślizg!", graczX() + 10, stopy() - 110, "#9df0a8", 24); D.graj("trik"); } }
    }
    if (g.przeszkody.length && g.przeszkody[0].x < zasiegL) g.przeszkody.shift();
    /* Koparka sięga wysoko tylko łyżką w górze: wysokie cegły też wymagają dotknięcia. */
    var glowaH = koparka && g.lopata ? L.KLATKI_KOPARKI.wysokosc + 40 : g.slizg > 0 ? 60 : g.y + 130;
    for (var i = g.przedmioty.length - 1; i >= 0; i--) {
      var e = g.przedmioty[i], dx = e.x - gx;
      if (g.sprint > 0 && dx > -40 && dx < 340) { var cy = g.y + 65, ciag = dt * 7; e.x -= dx * ciag; e.h += (cy - e.h) * ciag; dx = e.x - gx; }
      if (Math.abs(dx) < 44 && e.h > g.y - 16 && e.h < glowaH + 16 && !(koparka && e.typ === "cegla_zlota" && !g.lopata)) { zbierz(e); g.przedmioty.splice(i, 1); continue; }
      if (e.x < zasiegL) g.przedmioty.splice(i, 1);
    }
    for (var k = 0; k < g.kibice.length; k++) {
      var kb = g.kibice[k], kx = kb.x - gx;
      if (!kb.slyszany && kx < 240 && kx > 0) { kb.slyszany = true; D.graj("kibice"); if (g.naZiemi && !g.poza && Math.random() < 0.3) ustawPoze("F", 4, 0.45); }
    }
    while (g.kibice.length && g.kibice[0].x < zasiegL - 200) g.kibice.shift();
    while (g.dekor.length && g.dekor[0].x < g.s * 0.8 - graczX() - 400) g.dekor.shift();
    g.st.cegly = L.punktyRundy(g.cegly, g.poziom); g.st.seria = Math.max(g.st.seria, g.seria); g.st.cegly_bez_upadku = Math.max(g.st.cegly_bez_upadku, g.bezUpadku);
    if (g.podpowiedz > 0) g.podpowiedz -= dt;
    sprawdzWyzwanie(false);
    krokCzastek(dt);
  }
  function sprawdzWyzwanie(naKoniec) {
    var g = G; if (g.wyzwanieGotowe || g.maly) return;
    if (ZASADA_WYZWANIA.naKoniec && !naKoniec) return;
    if (L.postepWyzwania(ZASADA_WYZWANIA, g.st).gotowe) {
      g.wyzwanieGotowe = true;
      if (!g.dzisZrobione) { g.dzisZrobione = true; schowek.zapisz("cegielki_wyzwanie_" + L.dzienWaw(), "1"); schowek.zapisz("cegielki_odznaki", String((Number(schowek.czytaj("cegielki_odznaki", "0")) || 0) + 1)); }
      if (!naKoniec) { dodajNapis("Wyzwanie dnia!", W / 2, goraDrogi() - 150, "#ffe07a", 34); konfetti(graczX(), stopy() - 70, 30); if (g.naZiemi) ustawPoze("F", 3, 0.5); D.graj("zlota"); }
    }
  }
  function krokCzastek(dt) {
    var g = G;
    for (var i = g.czastki.length - 1; i >= 0; i--) { var p = g.czastki[i]; p.t -= dt; if (p.t <= 0) { g.czastki.splice(i, 1); continue; } p.vy += 620 * dt; p.vx *= 1 - dt * 1.4; p.x += p.vx * dt; p.y += p.vy * dt; p.kat += p.vk * dt; }
    for (var k = g.napisy.length - 1; k >= 0; k--) { var n = g.napisy[k]; n.t -= dt; n.y -= 46 * dt; if (n.t <= 0) g.napisy.splice(k, 1); }
    if (g.czastki.length < 8 && Math.random() < dt * 2) g.czastki.push({ x: losowa(W * 0.3, W + 40), y: losowa(goraDrogi() - 260, goraDrogi() - 80), vx: losowa(-150, -60), vy: 0, r: losowa(3, 6), kat: Math.random() * 6, vk: losowa(-4, 4), kol: wybierz(LISCIE), t: 2.2 });
  }

  /* ── koniec rundy: poza z I, wynik, wyzwania, udostępnianie ── */
  var ostatniWynik = 0, pozaKonca = 0;
  /* Rower stoi przy rowerze, koparka się cieszy, pozostali mają arkusz I. */
  function pozaKoncowa(nr) {
    if (G.postac === "rowerzysta") return { n: nz("skok"), ark: "skok", i: 5 };
    if (G.postac === "koparka") return { n: "koparka_ark", ark: null, i: L.KLATKI_KOPARKI.radosc };
    return { n: nz("I"), ark: "I", i: nr };
  }
  function rysujPozeKonca(kan, nr) {
    var pz = pozaKoncowa(nr), a = A[pz.n], o = OBR[pz.n]; if (!a || !o) return;
    var h = kan.height, sk2 = h / a.ch, w = a.cw * sk2, ML = 50;
    kan.width = Math.ceil(w) + ML; kan.height = h;
    var k = kan.getContext("2d"), S = window.BM_CEGIELKI_STROJ;
    if (S && pz.ark) S.dodatki(k, "tyl", OBR, A, G.postac, pz.ark, pz.i, ML, 0, sk2, noszone);
    k.drawImage(o, a.cw * pz.i, 0, a.cw, a.ch, ML, 0, w, h);
    if (S && pz.ark) S.dodatki(k, "przod", OBR, A, G.postac, pz.ark, pz.i, ML, 0, sk2, noszone);
  }
  function koniecRundy() {
    stan = "koniec";
    var g = G; g.st.koniec = true; sprawdzWyzwanie(true); D.graj("meta");
    /* W rankingu liczą się punkty: cegły razy mnożnik poziomu. Mur i poziom rosną od zebranych cegieł. */
    g.punkty = L.punktyRundy(g.cegly, g.poziom);
    ostatniWynik = g.punkty; pozaKonca = Math.floor(Math.random() * (A[nz("I")] ? A[nz("I")].n : 1));
    var rekord = Number(schowek.czytaj("cegielki_rekord", "0")) || 0, nowy = !g.maly && g.punkty > rekord;
    if (nowy && !(window.BM_CEGIELKI_KONTO && window.BM_CEGIELKI_KONTO.premiera())) schowek.zapisz("cegielki_rekord", String(g.punkty));
    $("k-punkty").textContent = g.punkty; $("k-podpis").textContent = g.maly ? L.odmianaCegiel(g.cegly) : L.odmianaPunktow(g.punkty); $("k-cegly").textContent = g.cegly;
    $("k-zlote").textContent = g.st.zlote; $("k-salta").textContent = g.st.salta; $("k-seria").textContent = g.st.seria; $("k-upadki").textContent = g.st.upadki;
    $("k-rekord").textContent = g.maly ? "Mały budowniczy: runda bez rankingu i rekordu." : nowy && rekord > 0 ? "Nowy rekord na tym urządzeniu!" : "Rekord na tym urządzeniu: " + Math.max(rekord, g.punkty);
    $("k-wyzwanie").hidden = g.maly; $("k-wyzwij").hidden = g.maly;
    var pw = L.postepWyzwania(ZASADA_WYZWANIA, g.st);
    $("k-wyzwanie").textContent = g.wyzwanieGotowe ? "🏅 Wyzwanie dnia zrobione: " + ZASADA_WYZWANIA.opis : "Wyzwanie dnia: " + ZASADA_WYZWANIA.opis + " (" + pw.wartosc + "/" + pw.cel + ")";
    if (wzywa && !g.maly) { var ok = g.punkty > wzywa.wynik; $("k-znajomy").hidden = false; $("k-znajomy").textContent = ok ? "Pobite! " + (wzywa.od || "Znajomy") + " miał(a) " + wzywa.wynik + "." : "Do pobicia zostało: " + (wzywa.wynik - g.punkty + 1) + ". " + (wzywa.od || "Znajomy") + " ma " + wzywa.wynik + "."; }
    else $("k-znajomy").hidden = true;
    rysujPozeKonca($("k-poza"), pozaKonca);
    pokazKoparke(); if (g.postac === "koparka") $("k-koparka").hidden = true;
    G.napisy.length = 0; $("k-link").hidden = true;
    $("k-info").textContent = DIAG ? diagTekst() : ""; $("koniec").hidden = false;
    if (window.BM_CEGIELKI_KONTO && window.BM_CEGIELKI_KONTO.poRundzie) window.BM_CEGIELKI_KONTO.poRundzie({ postac: g.postac, cegly: g.cegly, punkty: g.punkty, st: g.st, t: g.t, maly: g.maly, poziom: g.poziom });
  }
  function obrazekWyniku() {
    var k = document.createElement("canvas"); k.width = k.height = 1080;
    var v = k.getContext("2d"), gr = v.createLinearGradient(0, 0, 0, 1080);
    gr.addColorStop(0, "#232a52"); gr.addColorStop(0.65, "#7a4a86"); gr.addColorStop(1, "#f49a5c");
    v.fillStyle = gr; v.fillRect(0, 0, 1080, 1080);
    v.fillStyle = "rgba(255,255,255,.1)"; v.beginPath(); v.ellipse(540, 860, 430, 60, 0, 0, Math.PI * 2); v.fill();
    /* Rysunku postaci w koparce na obrazku nie ma: to decyzja co do wizerunku, a poza tym obcy plik zablokowałby zapis obrazka. Strój ze sklepiku jest. */
    var pz = pozaKoncowa(pozaKonca), a = pz.ark ? A[pz.n] : null, o = pz.ark ? OBR[pz.n] : null, S = window.BM_CEGIELKI_STROJ;
    if (a && o) {
      var h = 620, sk3 = h / a.ch, w = a.cw * sk3, xk = 540 - w / 2;
      if (S) S.dodatki(v, "tyl", OBR, A, G.postac, pz.ark, pz.i, xk, 260, sk3, noszone);
      v.drawImage(o, a.cw * pz.i, 0, a.cw, a.ch, xk, 260, w, h);
      if (S) S.dodatki(v, "przod", OBR, A, G.postac, pz.ark, pz.i, xk, 260, sk3, noszone);
    } else if (A.wywrotka && OBR.wywrotka) { var aw = A.wywrotka, sw = 560 / aw.w; v.drawImage(OBR.wywrotka, 540 - 280, 880 - aw.h * sw, 560, aw.h * sw); }
    v.textAlign = "center"; v.fillStyle = "#fff7ea"; v.font = "900 150px system-ui,'Segoe UI',sans-serif"; v.fillText(String(ostatniWynik), 540, 180);
    v.font = "800 50px system-ui,'Segoe UI',sans-serif"; v.fillText(L.odmianaPunktow(ostatniWynik) + " w grze Cegiełki", 540, 245);
    v.font = "700 40px system-ui,'Segoe UI',sans-serif"; v.fillText("biegamy.run/dla-fabianka.html", 540, 1010);
    return new Promise(function (ok) { k.toBlob(ok, "image/png"); });
  }
  function info(t) { $("k-info").textContent = t; }
  async function kopiuj(tekst) { try { await navigator.clipboard.writeText(tekst); return true; } catch (e) { return false; } }
  async function udostepnijWynik() {
    var tekst = "Zdobyłem " + ostatniWynik + " " + L.odmianaPunktow(ostatniWynik) + " w grze Cegiełki. Dołącz do akcji: " + LINK_AKCJI;
    var blob = await obrazekWyniku(), plik = blob ? new File([blob], "cegielki.png", { type: "image/png" }) : null;
    try {
      if (plik && navigator.canShare && navigator.canShare({ files: [plik] })) { await navigator.share({ files: [plik], text: tekst }); return; }
      if (navigator.share) { await navigator.share({ text: tekst }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    if (blob) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "cegielki.png"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); info("Obrazek zapisany. Wyślij go znajomym."); }
  }
  async function wyzwijZnajomego() {
    var link = L.linkWyzwania(location.href, ostatniWynik, imieGracza), tekst = "Pobij mój wynik w Cegiełkach: " + ostatniWynik + " " + L.odmianaPunktow(ostatniWynik);
    try { if (navigator.share) { await navigator.share({ text: tekst, url: link }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    if (await kopiuj(link)) info("Link skopiowany."); else { var p = $("k-link"); p.hidden = false; p.value = link; p.select(); info("Skopiuj ten link."); }
  }

  /* ── rysowanie ── */
  function obraz(n, xs, stopaY, sk, lustro) {
    var o = OBR[n]; if (!o) return;
    var a = A[n], w = o.width * sk, h = o.height * sk, y = stopaY - h + ((a && a.dol) || 0) * sk;
    if (lustro) { x.save(); x.translate(xs, 0); x.scale(-1, 1); x.drawImage(o, -w / 2, y, w, h); x.restore(); } else x.drawImage(o, xs - w / 2, y, w, h);
  }
  function klatka(n, i, xs, stopaY, obrot) {
    var o = OBR[n], a = A[n]; if (!o) return;
    var sk = SK * (a.sk || 1), w = a.cw * sk, h = a.ch * sk, y = stopaY - h + (a.dol || 0) * sk, x0 = xs - w / 2, y0 = y;
    var S = noszone.length ? window.BM_CEGIELKI_STROJ : null, ark = S ? n.slice(G.postac.length + 1) : null;
    if (obrot) { x.save(); x.translate(xs, stopaY - 65); x.rotate(obrot); x0 = -w / 2; y0 = 65 - h; }
    if (S) S.dodatki(x, "tyl", OBR, A, G.postac, ark, i, x0, y0, sk, noszone, czasGlobalny);
    x.drawImage(o, a.cw * i, 0, a.cw, a.ch, x0, y0, w, h);
    if (S) S.dodatki(x, "przod", OBR, A, G.postac, ark, i, x0, y0, sk, noszone, czasGlobalny);
    if (obrot) x.restore();
  }
  function pasek(n, przes, y, wys) {
    var o = OBR[n]; if (!o) return;
    var sz = o.width * wys / o.height, xx = -(przes % sz);
    for (; xx < W; xx += sz) x.drawImage(o, xx, y, sz + 0.6, wys);
  }
  function tekst(t, xs, ys, roz, kol, wyr) {
    x.font = "800 " + roz + 'px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    x.textAlign = wyr || "left"; x.textBaseline = "middle"; x.lineJoin = "round"; x.lineWidth = Math.max(3, roz / 5); x.strokeStyle = "rgba(18,20,40,.88)";
    x.strokeText(t, xs, ys); x.fillStyle = kol; x.fillText(t, xs, ys);
  }
  /* Pion: pas pod drogą, trawa z tym samym ruchem co droga. Tu nic się nie dzieje, palec gracza nie zasłania akcji. */
  function rysujPasPodDroga() {
    var y0 = goraDrogi() + WYS_DROGI, gr = x.createLinearGradient(0, y0, 0, H);
    gr.addColorStop(0, "#26380f"); gr.addColorStop(1, "#16220a");
    x.fillStyle = gr; x.fillRect(0, y0 - 1, W, H - y0 + 1);
    x.fillStyle = "rgba(92,134,48,.55)";
    var okres = 92, prz = G.s % okres;
    for (var r = 0; r < 4; r++) for (var xx = -prz + r * 31; xx < W + okres; xx += okres) { var yy = y0 + 22 + r * (H - y0 - 34) / 4; x.beginPath(); x.moveTo(xx - 7, yy + 9); x.lineTo(xx - 2, yy - 6); x.lineTo(xx + 1, yy + 2); x.lineTo(xx + 5, yy - 9); x.lineTo(xx + 8, yy + 9); x.fill(); }
  }
  function rysujNiebo() {
    x.fillStyle = gradNieba; x.fillRect(0, 0, W, H);
    var gy = goraDrogi(), i;
    if (pora.gwiazdy) { x.fillStyle = "#fff"; for (i = 0; i < gwiazdy.length; i++) { var s = gwiazdy[i]; x.globalAlpha = 0.45 + 0.45 * Math.sin(czasGlobalny * 1.5 + s.f); x.fillRect(s.x * W, s.y * gy, s.r, s.r); } x.globalAlpha = 1; }
    if (pora.ksiezyc) { var mx = W * 0.8, my = gy * 0.2; x.fillStyle = "#f5ecc7"; x.beginPath(); x.arc(mx, my, 30, 0, Math.PI * 2); x.fill(); x.fillStyle = pora.g[0]; x.beginPath(); x.arc(mx + 13, my - 7, 26, 0, Math.PI * 2); x.fill(); }
    else if (pora.slonce) { x.fillStyle = pora.slonce; x.beginPath(); x.arc(W * 0.78, gy * 0.32, 38, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = "rgba(255,255,255," + pora.chmury + ")";
    for (i = 0; i < chmury.length; i++) {
      var k = chmury[i], cx = ((k.x * (W + 320) - G.s * 0.03 - czasGlobalny * 5) % (W + 320) + W + 320) % (W + 320) - 160, cy = k.y * gy, z = k.s;
      x.beginPath(); x.ellipse(cx, cy, 58 * z, 15 * z, 0, 0, Math.PI * 2); x.ellipse(cx - 24 * z, cy - 10 * z, 26 * z, 15 * z, 0, 0, Math.PI * 2); x.ellipse(cx + 18 * z, cy - 13 * z, 32 * z, 19 * z, 0, 0, Math.PI * 2); x.fill();
    }
  }
  /* Plakat na tablicy przy fabryce. Tekst sam, gdy tablica mija gracza: dotknięcie w grze to skok. */
  function plakatNaTablicy(d, xs, stopaD) {
    var r = L.PLAKATY[d.typ], o = A[d.typ], f = d.firma, im = r && f.plakat && LOGOTYPY[f.plakat]; if (!r || !o) return;
    var w = o.w * d.sk, h = o.h * d.sk, px = xs - w / 2 + r[0] * w, py = stopaD - h + r[1] * h, pw = r[2] * w, ph = r[3] * h;
    if (im) { var s = Math.min(pw / im.naturalWidth, ph / im.naturalHeight), lw = im.naturalWidth * s, lh = im.naturalHeight * s; x.drawImage(im, px + (pw - lw) / 2, py + (ph - lh) / 2, lw, lh); }
    if (stan === "gra" && f.plakatTekst && !d.powiedziany && px + pw / 2 < graczX() + 220 && px > graczX() - 60) { d.powiedziany = true; dodajNapis(f.plakatTekst, W / 2, goraDrogi() - 170, "#ffe07a", Math.min(20, W / 26)); }
  }
  function szyld(d, xs, stopaD) {
    var r = L.SZYLDY[d.typ], o = A[d.typ]; if (!r || !o) return;
    plakatNaTablicy(d, xs, stopaD);
    var w = o.w * d.sk, h = o.h * d.sk, sx = xs - w / 2 + r[0] * w, sy = stopaD - h + r[1] * h, sw = r[2] * w, sh = r[3] * h, f = d.firma, t = f.nazwa, roz = Math.min(sh * 0.72, 14), lg = f.logo && LOGOTYPY[f.logo], dol = sy + sh;
    if (lg) {
      /* Deska większa niż namalowana: logo ma być czytelne na telefonie. */
      var pw = L.BUDYNKI_POPRZEDNICH[d.typ] ? sw : Math.max(sw, w * 0.8), ph = Math.max(sh, 34), px = sx + sw / 2 - pw / 2, py = sy + sh / 2 - ph / 2, sk = Math.min((pw - 6) / lg.naturalWidth, (ph - 6) / lg.naturalHeight), lw = lg.naturalWidth * sk, lh = lg.naturalHeight * sk;
      x.fillStyle = "#7a4a1c"; x.fillRect(px - 2, py - 2, pw + 4, ph + 4);
      x.fillStyle = lg.jasne ? "#2b2230" : "#fbf3df"; x.fillRect(px, py, pw, ph);
      x.drawImage(lg, px + (pw - lw) / 2, py + (ph - lh) / 2, lw, lh);
      dol = py + ph + 2;
    } else {
      x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#3a2410";
      x.font = "700 " + roz + 'px system-ui,"Segoe UI",sans-serif';
      while (roz > 6 && x.measureText(t).width > sw - 4) { roz -= 0.5; x.font = "700 " + roz + 'px system-ui,"Segoe UI",sans-serif'; }
      if (x.measureText(t).width > sw - 2) { while (t.length > 3 && x.measureText(t + "…").width > sw - 2) t = t.slice(0, -1); t += "…"; }
      x.fillText(t, sx + sw / 2, sy + sh / 2);
    }
    if (f.partner) {
      x.font = '800 9px system-ui,"Segoe UI",sans-serif'; x.textAlign = "center"; x.textBaseline = "middle";
      var pod = x.measureText("Partner akcji").width + 10;
      x.fillStyle = "#3a2410"; x.fillRect(sx + sw / 2 - pod / 2, dol + 1, pod, 13);
      x.fillStyle = "#fff"; x.fillText("Partner akcji", sx + sw / 2, dol + 8);
    }
  }
  function rysujTlo() {
    var gy = goraDrogi() + 6, hD = pion ? gy * 0.74 : Math.max(208, H * 0.36), hB = pion ? gy * 0.44 : Math.max(150, H * 0.22);
    pasek("krajobraz_daleki", G.s * 0.08, gy - hD, hD);
    pasek("krajobraz", G.s * 0.2, gy - hB, hB);
    if (pora.tint) { x.fillStyle = pora.tint; x.fillRect(0, 0, W, gy + 2); }
    var wid = G.s * 0.8, stopaD = goraDrogi() + 10, i, d, xs;
    for (i = 0; i < G.dekor.length; i++) { d = G.dekor[i]; xs = d.x - wid + graczX(); if (xs < -240 || xs > W + 240) continue; obraz(d.typ, xs, stopaD, d.sk, d.lustro); }
    if (pora.drogaTint) { x.fillStyle = pora.drogaTint; x.fillRect(0, 0, W, gy + 2); }
    for (i = 0; i < G.dekor.length; i++) { d = G.dekor[i]; if (!d.firma) continue; xs = d.x - wid + graczX(); if (xs < -240 || xs > W + 240) continue; szyld(d, xs, stopaD); }
    if (pora.gwiazdy) {
      x.globalCompositeOperation = "lighter";
      var KL = window.BM_CEGIELKI_KONTO, swieca = !KL || !KL.latarnie || KL.latarnie(G.postac);
      for (i = 0; swieca && i < G.dekor.length; i++) { d = G.dekor[i]; if (d.typ !== "latarnia") continue; xs = d.x - wid + graczX(); if (xs < -140 || xs > W + 140) continue; x.drawImage(poswiataLampy, xs - 90, stopaD - 168 * 0.98 - 66, 180, 180); }
      x.globalCompositeOperation = "source-over";
    }
  }
  function rysujKibicow() {
    var st = goraDrogi() + WYS_DROGI * 0.15;
    for (var i = 0; i < G.kibice.length; i++) {
      var k = G.kibice[i], xs = k.x - G.s + graczX(); if (xs < -120 || xs > W + 120) continue;
      var sk = 0.6, pod = Math.max(0, Math.sin(czasGlobalny * 7 + k.f)) * 8;
      obraz(k.n, xs, st - pod, sk);
      if (k.napis && A[k.n]) {
        var w = A[k.n].w * sk, h = A[k.n].h * sk;
        x.save(); x.translate(xs + w * 0.01, st - pod - h + h * 0.115); x.rotate(-0.045);
        var roz = Math.round(w * 0.2); x.font = "800 " + roz + 'px system-ui,"Segoe UI",sans-serif';
        while (roz > 8 && x.measureText(k.napis).width > w * 0.82) { roz--; x.font = "800 " + roz + 'px system-ui,"Segoe UI",sans-serif'; }
        x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#3a2a16"; x.fillText(k.napis, 0, 0); x.restore();
      }
    }
  }
  function iskra(xs, ys, r, a) {
    x.globalAlpha = a; x.fillStyle = "#fff"; x.beginPath();
    x.moveTo(xs, ys - r); x.quadraticCurveTo(xs, ys, xs + r, ys); x.quadraticCurveTo(xs, ys, xs, ys + r); x.quadraticCurveTo(xs, ys, xs - r, ys); x.quadraticCurveTo(xs, ys, xs, ys - r); x.fill();
    x.globalAlpha = 1;
  }
  function rysujPrzedmioty() {
    var st = stopy(), gx = G.s, gr = graczX();
    for (var i = 0; i < G.przedmioty.length; i++) {
      var e = G.przedmioty[i], xs = e.x - gx + gr; if (xs < -70 || xs > W + 70) continue;
      var o = A[e.typ]; if (!o) continue;
      var sk = SK_PRZEDMIOTU[e.typ], faza = czasGlobalny * 4 + e.x * 0.02, bob = Math.sin(faza) * 4, sr = st - e.h + bob, h = o.h * sk;
      /* cień na ziemi: mówi, gdzie przedmiot jest, także wysoko nad drogą */
      x.fillStyle = "rgba(8,10,30,.26)"; x.beginPath(); x.ellipse(xs, st + 6, 20 * sk * 2, 5, 0, 0, Math.PI * 2); x.fill();
      if (e.typ === "cegla_zlota") { var pu = 1 + 0.18 * Math.sin(czasGlobalny * 6 + e.x); x.drawImage(poswiataZlota, xs - 52 * pu, sr - 52 * pu, 104 * pu, 104 * pu); }
      else if (e.typ !== "cegla") x.drawImage(poswiataBiala, xs - 42, sr - 42, 84, 84);
      obraz(e.typ, xs, sr + h / 2, sk);
      var bl = (czasGlobalny * 0.9 + e.x * 0.013) % 1;
      if (bl < 0.22) iskra(xs + o.w * sk * 0.28, sr - h * 0.26, 8 * Math.sin(bl / 0.22 * Math.PI), 0.95);
    }
  }
  function rysujPrzeszkody(tylkoNadSlizgiem) {
    var st = stopy(), gx = G.s, gr = graczX();
    for (var i = 0; i < G.przeszkody.length; i++) {
      var p = G.przeszkody[i]; if (p.ukryta) continue;
      if (tylkoNadSlizgiem && (p.typ !== "barierka" || G.slizg <= 0)) continue;
      var xs = p.x - gx + gr; if (xs < -140 || xs > W + 140) continue;
      var d = PRZESZKODY[p.typ], o = A[p.typ]; if (!o) continue;
      if (!tylkoNadSlizgiem && p.typ !== "kaluza") { x.fillStyle = "rgba(6,8,26,.42)"; x.beginPath(); x.ellipse(xs + 4, st + 6, o.w * d.sk * 0.46, 8, 0, 0, Math.PI * 2); x.fill(); }
      if (p.rozbita) x.globalAlpha = 0.35;
      obraz(p.typ, xs, st + (p.typ === "kaluza" ? 10 : 4), d.sk);
      x.globalAlpha = 1;
    }
  }
  /* Rower: jazda z arkusza jazdy, reszta z arkusza skoku. Podbicie to przednie koło w górze (klatka 1), kask działa bez przemiany, bo rowerzysta już go ma. */
  function klatkaRoweru(g) {
    var s = nz("skok");
    if (g.reakcja > 0) { var R = L.REAKCJE[g.reakcjaTyp], pr = 1 - g.reakcja / R.czas, kl = R.kl[Math.min(R.kl.length - 1, Math.floor(pr * R.kl.length))]; return [nz(kl[0]), kl[1]]; }
    if (g.gorkaFaza && A[nz("gorka")] && g.naZiemi && !g.poza) return [nz("gorka"), L.klatkaGorki(g.gorkaFaza, g.anim)];
    if (!g.naZiemi) return [s, g.saltoT >= 0 && g.saltoT < 1 ? 0 : 1];
    if (g.slizg > 0) return [s, 2];
    if (g.poza) return [g.poza.n, g.poza.i];
    return [nz("bieg"), Math.floor(g.anim) % 6];
  }
  function klatkaKoparki(g) {
    var K = L.KLATKI_KOPARKI, l = g.lopata;
    if (l) return l.t < K.zamach_s ? K.zamach : K.uderzenie;
    if (g.zgarnia > 0) return K.zgarnianie;
    return K.jazda[Math.floor(g.anim / 2) % 2];
  }
  function rysujKoparke() {
    var g = G, xs = graczX(), stopaY = stopy() + 2;
    x.fillStyle = "rgba(10,10,30,.3)"; x.beginPath(); x.ellipse(xs, stopy() + 3, 62, 8, 0, 0, Math.PI * 2); x.fill();
    if (A.koparka_ark && OBR.koparka_ark) klatka("koparka_ark", klatkaKoparki(g), xs + (g.stoi > 0 ? Math.sin(czasGlobalny * 60) * 3 : 0), stopaY, 0);
    /* Znak nad przeszkodą w oknie łyżki: dziecko ma widzieć, kiedy dotknąć. */
    for (var z = 0; z < g.przeszkody.length; z++) {
      var pz = g.przeszkody[z], rz = pz.x - g.s - g.v * L.KLATKI_KOPARKI.zamach_s;
      if (!pz.zuzyta && pz.typ !== "kaluza" && rz > 0 && rz < L.KLATKI_KOPARKI.okno) tekst("!", pz.x - g.s + xs, stopy() - 92, 34, "#ffe07a", "center");
    }
    for (var i = 0; i < g.latajace.length; i++) {
      var o = g.latajace[i], a = A[o.typ], d = PRZESZKODY[o.typ]; if (!a || !OBR[o.typ]) continue;
      x.save(); x.translate(o.x, o.y - 30); x.rotate(o.kat); x.drawImage(OBR[o.typ], -a.w * d.sk / 2, -a.h * d.sk / 2, a.w * d.sk, a.h * d.sk); x.restore();
    }
  }
  function rysujGracza() {
    if (G.postac === "koparka") return rysujKoparke();
    var g = G, xs = graczX(), bud = g.bud > 0, wlasne = g.postac === "rowerzysta", bieg = nz(bud && !wlasne ? "bud" : "bieg"), stopaY = stopy() - g.y + 2, n = bieg, i = Math.floor(g.anim) % 6, obrot = 0;
    var cien = 1 - Math.min(0.7, g.y / 300);
    x.fillStyle = "rgba(10,10,30,.3)"; x.beginPath(); x.ellipse(xs, stopy() + 3, 34 * cien, 7 * cien, 0, 0, Math.PI * 2); x.fill();
    if (g.nietykalny > 0 && g.przemiana <= 0 && Math.floor(czasGlobalny * 14) % 2) x.globalAlpha = 0.5;
    if (wlasne) {
      var kr = klatkaRoweru(g); n = kr[0]; i = kr[1];
      if (bud) { x.save(); x.globalCompositeOperation = "lighter"; x.globalAlpha = 0.3; x.drawImage(poswiataBiala, xs - 70, stopaY - 150, 140, 150); x.restore(); }
    } else if (g.reakcja > 0) {
      var R = L.REAKCJE[g.reakcjaTyp], pr = 1 - g.reakcja / R.czas, kl = R.kl[Math.min(R.kl.length - 1, Math.floor(pr * R.kl.length))];
      n = nz(kl[0]); i = kl[1];
    } else if (g.przemiana > 0) {
      n = nz("G"); i = Math.min(5, Math.floor((1 - g.przemiana / CZAS_PRZEMIANY) * 6));
    } else if (g.slizg > 0) {
      n = nz("C"); i = 5;
    } else if (!g.naZiemi && g.saltoT >= 0 && g.saltoT < 1) {
      if (bud) { obrot = g.saltoT * Math.PI * 2; i = 2; } else { n = nz("B"); i = [1, 2, 3, 4, 5][Math.min(4, Math.floor(g.saltoT * 5))]; }
    } else if (!g.naZiemi && g.trik >= 0 && !bud) {
      n = nz("C"); i = g.trik;
    } else if (!g.naZiemi) {
      if (bud) i = 2; else { n = nz("A"); i = g.vy > 260 ? 1 : g.vy > -40 ? 2 : g.vy > -360 ? 3 : 4; }
    } else if (g.poza && !(bud && /_[AF]$/.test(g.poza.n))) {
      n = g.poza.n; i = g.poza.i;
    } else if (!bud && g.zel > 0 && L.KLATKI_H[g.postac] && Math.floor(czasGlobalny * 3) % 6 === 0) {
      n = nz("H"); i = L.KLATKI_H[g.postac].aura;
    }
    if (g.zel > 0) { x.save(); x.globalCompositeOperation = "lighter"; x.globalAlpha = 0.35 + 0.15 * Math.sin(czasGlobalny * 9); x.drawImage(poswiataBiala, xs - 60, stopaY - 130, 120, 130); x.restore(); }
    /* Przejścia bez przeskoków: poprzednia klatka gaśnie w 0,07 s pod nową. Bieg za biegiem i salto za saltem to ruch, nie przejście. Przysiad przy lądowaniu: lekkie ściśnięcie od stóp. */
    if (n !== g.klN || i !== g.klI) {
      if (g.klN && !wlasne && !(n === bieg && g.klN === bieg) && !(/_B$/.test(n) && /_B$/.test(g.klN))) { g.przenikN = g.klN; g.przenikI = g.klI; g.przenikOd = czasGlobalny; }
      g.klN = n; g.klI = i;
    }
    var fr = g.trik >= 0 ? L.FIGURY[g.trik] : null, kat = obrot + g.efKat + (fr && fr.wir ? fr.wir * (0.5 - g.trikCzas / fr.czas) : 0), xr = xs + g.efDx;
    var pr = g.przysiad > 0 ? Math.sin(Math.PI * (1 - g.przysiad / CZAS_PRZYSIADU)) : 0, a0 = x.globalAlpha;
    if (pr) { x.save(); x.translate(xs, stopaY); x.scale(1 + 0.05 * pr, 1 - 0.1 * pr); x.translate(-xs, -stopaY); }
    var po = g.przenikN ? (czasGlobalny - g.przenikOd) / PRZENIK_S : 1;
    if (po < 1) {
      x.globalAlpha = a0 * Math.min(1, (1 - po) * 2); klatka(g.przenikN, g.przenikI, xr, stopaY, kat);
      x.globalAlpha = a0 * Math.min(1, po * 2);
    } else g.przenikN = null;
    klatka(n, i, xr, stopaY, kat);
    if (pr) x.restore();
    x.globalAlpha = 1;
    if (g.sprint > 0) {
      x.strokeStyle = "rgba(255,255,255,.7)"; x.lineWidth = 3;
      for (var k = 0; k < 5; k++) { var yy = stopaY - 22 - k * 22, dl = 26 + ((czasGlobalny * 200 + k * 37) % 40); x.beginPath(); x.moveTo(xs - 44 - k * 3, yy); x.lineTo(xs - 44 - k * 3 - dl, yy); x.stroke(); }
    }
  }
  /* Rysunek postaci w koparce: adres z licznika, po starcie i przy zgodzie. Wyłącznie do rysowania na ekranie: nie trafia na obrazek do udostępnienia. */
  var koparkaObraz = null;
  function ustawKoparke(url) {
    if (!url || koparkaObraz) return;
    var im = new Image();
    im.onload = function () { koparkaObraz = im; $("k-kop-img").src = url; $("m-bok-koparka").src = url; pokazKoparke(); };
    im.src = url;
  }
  function pokazKoparke() { $("k-koparka").hidden = !koparkaObraz; }
  /* Arkusz grywalnej koparki: tylko po starcie, adres z licznika. Nie ma go w atlasie ani w repo; bez przełącznika konto gracza nawet o niego nie prosi. */
  function wczytajArkuszKoparki(url) {
    if (!url) return Promise.resolve(false);
    if (OBR.koparka_ark) return Promise.resolve(true);
    return new Promise(function (ok) {
      var im = new Image();
      im.onload = function () { var K = L.KLATKI_KOPARKI, ch = im.naturalHeight; A.koparka_ark = { cw: im.naturalWidth / K.ile, ch: ch, n: K.ile, dol: 3, sk: 270 / ch }; OBR.koparka_ark = im; ok(true); };
      im.onerror = function () { ok(false); };
      im.src = url;
    });
  }
  /* Rowerzysta: za przełącznikiem, plik po zgodzie na piśmie. Bez pliku nic się nie dzieje. Canvas rysuje pierwszą klatkę animacji, więc dłoń jest uniesiona bez ruchu. */
  var rowerObraz = null;
  function wlaczRowerzyste() {
    if (rowerObraz) return;
    var im = new Image();
    im.onload = function () { rowerObraz = im; };
    im.src = L.ROWER.plik;
  }
  function rysujRowerzyste() {
    if (!rowerObraz || !G || G.rowerX === null || G.rowerX === undefined || stan !== "gra") return;
    var h = L.ROWER.wysokosc, w = h * rowerObraz.naturalWidth / Math.max(1, rowerObraz.naturalHeight), bob = Math.sin(czasGlobalny * 9) * 1.5;
    x.drawImage(rowerObraz, G.rowerX - w / 2, goraDrogi() + 22 + bob - h, w, h);
  }
  /* Mały budowniczy: postać w koparce albo wywrotka jedzie obok gracza przy górnej krawędzi drogi. */
  /* Drużyna za graczem: kolejne grupy dalej w lewo i nieco wyżej, każda w innym rytmie. Sam obraz, poza kolizjami i zbieraniem. */
  function rysujDruzyne() {
    var g = G, a = A.druzyna, o = OBR.druzyna; if (stan !== "gra" || !a || !o || !L.druzynaWRundzie(g.poziom, g.maly)) return;
    var K = window.BM_CEGIELKI_KONTO, ile = K && K.grupyDruzyny ? K.grupyDruzyny() : 1, sk = L.DRUZYNA.sk, w = a.cw * sk, h = a.ch * sk;
    for (var i = ile - 1; i >= 0; i--) {
      var xx = graczX() - w * (0.62 + i * 0.86) - 14 + Math.sin(czasGlobalny * 1.3 + i) * 7, yy = stopy() - h - 6 - i * 7 + Math.abs(Math.sin(czasGlobalny * 8 + i * 1.7)) * -3, kl = Math.floor(g.anim / 2 + i) % a.n;
      if (xx + w < 0) continue;
      x.drawImage(o, kl * a.cw, 0, a.cw, a.ch, xx, yy, w, h);
    }
  }
  function rysujTowarzysza() {
    if (!G.maly || stan !== "gra") return;
    var bob = Math.sin(czasGlobalny * 5) * 2, dol = goraDrogi() + 26 + bob;
    if (koparkaObraz) { var h = 112, w = h * koparkaObraz.naturalWidth / Math.max(1, koparkaObraz.naturalHeight); x.drawImage(koparkaObraz, W * 0.68 - w / 2, dol - h, w, h); return; }
    if (A.wywrotka && OBR.wywrotka) obraz("wywrotka", W * 0.68, dol, 0.5);
  }
  function rysujCzastki() {
    for (var i = 0; i < G.czastki.length; i++) {
      var p = G.czastki[i]; x.save(); x.translate(p.x, p.y); x.rotate(p.kat); x.globalAlpha = Math.min(1, p.t * 2); x.fillStyle = p.kol;
      x.beginPath(); x.moveTo(-p.r, 0); x.quadraticCurveTo(0, -p.r * 0.8, p.r, 0); x.quadraticCurveTo(0, p.r * 0.8, -p.r, 0); x.fill(); x.restore();
    }
    x.globalAlpha = 1;
    for (var k = 0; k < G.napisy.length; k++) { var n = G.napisy[k]; x.globalAlpha = Math.min(1, n.t * 2.4); tekst(n.txt, n.x, n.y, n.roz, n.kol, "center"); }
    x.globalAlpha = 1;
  }
  function rysujHud() {
    var g = G, m = 14, ik = A.cegla;
    if (OBR.cegla) x.drawImage(OBR.cegla, m, m, 46, 46 * ik.h / ik.w);
    var wynikTeraz = L.punktyRundy(g.cegly, g.poziom);
    tekst(String(g.cegly), m + 54, m + 19, 34, "#fff");
    var oz = A.cegla_zlota; if (OBR.cegla_zlota && oz) { x.drawImage(OBR.cegla_zlota, m + 8, m + 40, 30, 30 * oz.h / oz.w); tekst(String(g.st.zlote), m + 46, m + 55, 20, "#ffe07a"); }
    if (!g.maly) tekst(wynikTeraz + " pkt", m + 96, m + 55, 20, "#9df0a8");
    var szer = Math.min(W * 0.36, 300), bx = (W - szer) / 2, by = m + 6;
    x.fillStyle = "rgba(18,20,40,.6)"; x.beginPath(); x.roundRect(bx, by, szer, 14, 7); x.fill();
    x.fillStyle = g.czas < 10 ? "#ff6a5c" : "#ffc34d"; x.beginPath(); x.roundRect(bx + 2, by + 2, Math.max(0, (szer - 4) * Math.min(1, g.czas / CZAS_RUNDY)), 10, 5); x.fill();
    tekst(Math.ceil(g.czas) + " s", W / 2, by + 32, 22, g.czas < 10 ? "#ffb0a0" : "#fff", "center");
    var mn = mnoznik();
    if (mn > 1) tekst("×" + mn, W - m, m + 22, 40, "#ffe07a", "right");
    if (g.seria > 0) tekst("seria " + g.seria, W - m, m + 56, 17, "#d9f5dd", "right");
    var py = m + 74;
    [["kask", g.bud, CZAS_KASKU], ["but", g.sprint, CZAS_BUTA], ["zel", g.zel, CZAS_ZELU]].forEach(function (w) {
      if (w[1] <= 0 || !A[w[0]]) return;
      var o = A[w[0]]; x.drawImage(OBR[w[0]], m, py, 30, 30 * o.h / o.w);
      x.fillStyle = "rgba(18,20,40,.6)"; x.fillRect(m + 36, py + 9, 70, 8); x.fillStyle = "#9df0a8"; x.fillRect(m + 36, py + 9, 70 * w[1] / w[2], 8); py += 34;
    });
    var pw = L.postepWyzwania(ZASADA_WYZWANIA, g.st);
    if (!g.maly) tekst((g.wyzwanieGotowe ? "🏅 " : "") + ZASADA_WYZWANIA.opis + (ZASADA_WYZWANIA.naKoniec ? "" : " " + pw.wartosc + "/" + pw.cel), W / 2, by + 56, Math.min(16, W / 46), g.wyzwanieGotowe ? "#ffe07a" : "#e8e4f2", "center");
    if (wzywa) tekst((wzywa.od || "Znajomy") + ": " + wzywa.wynik, W - m, m + (g.seria > 0 ? 80 : 56), 15, wynikTeraz > wzywa.wynik ? "#9df0a8" : "#ffd9a0", "right");
    if (g.t < 5) { x.globalAlpha = Math.min(1, 5 - g.t); tekst(cechy().skacze === false ? "Dotknij przed przeszkodą: łyżka ją rozbije" : cechy().podbicie ? "Dotknij: skok. Drugi raz w powietrzu: podbicie" : "Dotknij: skok. Drugi raz w powietrzu: salto", W / 2, goraDrogi() - 215, Math.min(26, W / 26), "#fff", "center"); x.globalAlpha = 1; }
    if (g.podpowiedz > 0) { x.globalAlpha = Math.min(1, g.podpowiedz); tekst("Przesuń w dół: ślizg pod barierką", W / 2, goraDrogi() - 180, Math.min(26, W / 26), "#ffe07a", "center"); x.globalAlpha = 1; }
    /* Błysk przy postaci, gotowa grafika: pełnoekranowe wypełnienie z alfą co klatkę było drogie na telefonie. */
    if (g.blysk > 0) { x.globalAlpha = Math.min(1, g.blysk * 3.4); x.drawImage(poswiataBiala, graczX() - 130, stopy() - g.y - 200, 260, 260); x.globalAlpha = 1; }
    if (pauza) { x.fillStyle = "rgba(12,14,30,.6)"; x.fillRect(0, 0, W, H); tekst("Pauza. Dotknij, żeby grać dalej", W / 2, H / 2, Math.min(30, W / 22), "#fff", "center"); }
  }
  var bezDrgan = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* Tło Górki Wojtaszaka: szczyt na rysunku mija gracza razem ze szczytem odcinka, wolniej niż droga. Plik wczytany dopiero od poziomu z górką. */
  function rysujGorkeTlo() {
    var g = G, h = stan === "gra" && g.gorka, o = OBR.gorka, a = A.gorka; if (!h || !o || !a) return;
    var wys = goraDrogi() + 14, sz = a.w * wys / a.h, xx = graczX() - 0.635 * sz - (g.s - h.szczyt) * 0.5;
    if (xx < W && xx + sz > 0) x.drawImage(o, xx, wys - wys, sz, wys);
  }
  function rysuj() {
    /* „Szybciej!”: krótkie drgnięcie świata. Przywrócone na końcu klatki, bez save/restore na całej scenie. */
    var drg = stan === "gra" && G.drganie > 0 && !bezDrgan ? Math.sin(czasGlobalny * 90) * 22 * G.drganie : 0;
    if (drg) x.translate(drg, 0);
    rysujNiebo(); rysujTlo(); rysujGorkeTlo();
    var przechyl = stan === "gra" && G.katDrogi ? G.katDrogi : 0;
    if (przechyl) {
      x.fillStyle = "#7f9150"; x.fillRect(0, goraDrogi() - 3, W, 90);   // nad opuszczoną drogą pas trawy zamiast nieba
      x.save(); x.translate(graczX(), stopy()); x.rotate(przechyl); x.scale(1.06, 1.06); x.translate(-graczX(), -stopy());
      x.fillStyle = "#2b3a20"; x.fillRect(-200, goraDrogi() + WYS_DROGI - 2, W + 400, H);   // pod przechyloną drogą nie może prześwitywać niebo
    }
    pasek("droga", G.s, goraDrogi(), WYS_DROGI);
    if (pasPodDroga > 0) rysujPasPodDroga();
    if (pora.drogaTint) { x.fillStyle = pora.drogaTint; x.fillRect(0, goraDrogi(), W, WYS_DROGI); }
    rysujKibicow(); rysujTowarzysza(); rysujRowerzyste(); rysujDruzyne(); rysujPrzeszkody(false); rysujPrzedmioty();
    if (stan === "gra") { rysujGracza(); rysujPrzeszkody(true); }
    rysujCzastki();
    if (przechyl) x.restore();
    if (drg) x.translate(-drg, 0);
    if (stan === "gra") rysujHud();
  }
  /* ?diag=1 na prawdziwym telefonie: emulacja nie pokazuje karty graficznej ani dźwięku. Na końcu rundy liczby do przepisania: najdłuższe klatki przy przemianie i poza nią. */
  var DIAG = parametry.has("diag") ? { przem: 0, przemN: 0, reszta: 0, resztaN: 0, zbierz: 0, start: 0, po: 0 } : null;
  function diagKlatka(ms) {
    if (G.przemiana > 0 || DIAG.po > 0) { DIAG.przem = Math.max(DIAG.przem, ms); if (ms > 25) DIAG.przemN++; if (G.przemiana <= 0) DIAG.po--; else DIAG.po = 6; }
    else { DIAG.reszta = Math.max(DIAG.reszta, ms); if (ms > 25) DIAG.resztaN++; }
  }
  function diagTekst() {
    return "Diag: przemiana maks " + Math.round(DIAG.przem) + " ms (" + DIAG.przemN + " klatek > 25 ms), reszta maks " + Math.round(DIAG.reszta) + " ms (" + DIAG.resztaN + "), kask w kodzie " + DIAG.zbierz.toFixed(1) + " ms, start rundy " + Math.round(DIAG.start) + " ms, ekran " + c.width + "x" + c.height + ", dźwięk " + (D.wlaczony ? "tak" : "nie") + ". Balans: poziom " + G.poziom + ", tempo ×" + (G.plan.tempo * L.tempoRundy(G.t, G.maly)).toFixed(2) + ", cegła " + L.tekstMnoznika(G.poziom) + ", cegły " + G.cegly + ", punkty " + L.punktyRundy(G.cegly, G.poziom) + ", upadki " + G.st.upadki + ", złote " + G.st.zlote + ", kaski " + G.st.kaski + ", salta " + G.st.salta + ", czas " + G.t.toFixed(1) + " s";
  }
  var poprz = 0;
  function petla(t) {
    requestAnimationFrame(petla);
    if (DIAG && stan === "gra" && !pauza && poprz) diagKlatka(t - poprz);
    var dt = Math.min(0.05, (t - poprz) / 1000 || 0); poprz = t;
    if (stan === "ladowanie") return;
    czasGlobalny += dt;
    if (stan === "gra" && !pauza) krok(dt);
    else if (stan === "menu" || stan === "koniec") { G.s += 130 * dt; planujDekor(); krokCzastek(dt); while (G.dekor.length && G.dekor[0].x < G.s * 0.8 - graczX() - 400) G.dekor.shift(); }
    rysuj();
  }

  /* ── wejście ── */
  addEventListener("resize", function () { rozmiar(); if (!$("menu").hidden) ["kasia", "filip", "rowerzysta"].forEach(function (id) { if (OBR[id + "_bieg"]) kartaPostaci(id); }); });
  var palec = null;
  c.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    palec = { y: e.clientY, t: performance.now(), uzyty: false, wDol: false };
    /* krótka chwila na rozpoznanie gestu; tap puszczony wcześniej skacze od razu */
    palec.zegar = setTimeout(function () { if (palec && !palec.uzyty) { palec.uzyty = true; dotyk(); } }, 70);
  });
  addEventListener("pointermove", function (e) {
    if (!palec || palec.wDol) return;
    if (e.clientY - palec.y > 26 && performance.now() - palec.t < 350) { clearTimeout(palec.zegar); palec.uzyty = true; palec.wDol = true; ruchWDol(); }
  });
  function koniecPalca() { if (palec && !palec.uzyty) { clearTimeout(palec.zegar); palec.uzyty = true; dotyk(); } palec = null; }
  addEventListener("pointerup", koniecPalca); addEventListener("pointercancel", function () { if (palec) clearTimeout(palec.zegar); palec = null; });
  addEventListener("keydown", function (e) {
    if (e.repeat || (e.target && e.target.tagName === "INPUT")) return;
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") { e.preventDefault(); dotyk(); }
    if (e.code === "ArrowDown" || e.code === "KeyS") { e.preventDefault(); ruchWDol(); }
  });
  document.addEventListener("visibilitychange", function () { if (document.hidden && stan === "gra") pauza = true; });
  addEventListener("contextmenu", function (e) { e.preventDefault(); });
  document.querySelectorAll(".postac").forEach(function (b) { b.addEventListener("click", function () { start(b.dataset.postac); }); });
  $("k-znow").addEventListener("click", function () { start(ostatniaPostac); });
  $("k-zmien").addEventListener("click", function () { $("koniec").hidden = true; $("menu").hidden = false; G = nowyStan(ostatniaPostac); stan = "menu"; planujDekor(); });
  var gotowaOk, gotowa = new Promise(function (ok) { gotowaOk = ok; });
  window.BM_CEGIELKI_GRA = { start: start, gotowa: gotowa, rysujPlansze: rysujPlansze, pokazPlansze: pokazPlansze, ustawKoparke: ustawKoparke, ustawFirmy: function (l) { firmyZProby = true; firmy = l; wczytajLogotypy(); }, OBR: OBR, A: A, wlaczRowerzyste: wlaczRowerzyste, wczytajObrazy: wczytajObrazy, wczytajArkuszKoparki: wczytajArkuszKoparki, kartaPostaci: kartaPostaci };
  $("k-udostepnij").addEventListener("click", udostepnijWynik);
  $("k-wyzwij").addEventListener("click", wyzwijZnajomego);
  $("glosnik").addEventListener("click", function () { D.wlaczony = !D.wlaczony; schowek.zapisz("cegielki_dzwiek", D.wlaczony ? "1" : "0"); if (D.wlaczony) { D.start(); D.graj("cegla"); } odswiezGlosnik(); });
  /* AudioContext dopiero po geście (iOS): zapisany stan „włączony” budzi się przy pierwszym dotknięciu */
  addEventListener("pointerdown", function () { if (D.wlaczony && !D.ctx) D.start(); });

  function kartaPostaci(id, adres) {
    var a = id === "koparka" ? A.koparka_ark : A[id + "_bieg"], el = document.querySelector('.postac[data-postac="' + id + '"] i'); if (!a || !el) return;
    /* Styl w elemencie wygrywa z @media, więc wielkość karty w poziomie liczymy tutaj. Inaczej karty zajmują cały ekran i reszta menu wypada pod spód. */
    var sz = (id === "koparka" ? 132 : 99) * (innerHeight <= 460 ? 0.62 : 1), wys = Math.round(a.ch * sz / a.cw);
    el.style.backgroundImage = "url(" + (adres || KAT + a.src + "?v=" + WERSJA) + ")";
    el.style.setProperty("--w", sz + "px"); el.style.setProperty("--h", wys + "px");
  }
  function pokazMenu() {
    $("m-wyzwanie").textContent = "Wyzwanie dnia: " + ZASADA_WYZWANIA.opis;
    var odz = Number(schowek.czytaj("cegielki_odznaki", "0")) || 0; $("m-odznaki").textContent = odz ? "🏅 × " + odz : ""; $("m-odznaki").hidden = !odz;
    if (wzywa) { $("m-znajomy").hidden = false; $("m-znajomy").textContent = (wzywa.od ? wzywa.od + " rzuca" : "Znajomy rzuca") + " Ci wyzwanie: pobij " + wzywa.wynik + " " + L.odmianaPunktow(wzywa.wynik) + "!"; }
    if ($("imie")) $("imie").value = imieGracza;
    /* biegacze na kartach: rozmiar klatki z atlasu, różne tempo i faza */
    ["kasia", "filip"].forEach(function (id) { kartaPostaci(id); });
    $("menu").hidden = false;
  }
  (async function () {
    rozmiar();
    try {
      var r = await fetch(KAT + "atlas.json?v=" + WERSJA);
      Object.assign(A, await r.json());
      var wspolne = Object.keys(A).filter(function (k) { return k !== "wiezowiec" && !L.BUDYNKI_POPRZEDNICH[k] && !/^(kasia|filip|rowerzysta|dodatek)_/.test(k) && k !== "druzyna" && k !== "gorka"; }).concat(["kasia_bieg", "filip_bieg"]);
      await wczytajObrazy(wspolne);
    } catch (e) { $("ladowanie").textContent = "Nie udało się wczytać grafik. Odśwież stronę."; return; }
    G = nowyStan("kasia"); planujDekor();
    stan = "menu";
    $("ladowanie").hidden = true;
    odswiezGlosnik(); pokazMenu(); gotowaOk();
    if (parametry.has("test")) { window.__gra = function () { return G; }; window.__krok = krok; }
    /* Podgląd ułożenia bez rysunku, poza produkcją: wywrotka na miejscu koparki. */
    if (parametry.get("koparka") === "przyklad" && location.hostname !== "biegamy.run" && location.hostname !== "run.biegamy.app") ustawKoparke(KAT + "wywrotka.webp");
    /* Podgląd rowerzysty poza produkcją: lokalnie nie ma funkcji z przełącznikiem. */
    if (parametry.get("rowerzysta") === "przyklad" && location.hostname !== "biegamy.run" && location.hostname !== "run.biegamy.app") wlaczRowerzyste();
    requestAnimationFrame(petla);
    /* firmy: bez tego szyldy zostają puste, gra działa dalej */
    try {
      var zTestu = parametry.get("firmy");
      if (zTestu) firmy = L.firmyZLicznika({ firmy: zTestu.split("|").filter(Boolean).map(function (n) { var c = n.split("~"); return { nazwa: c[0], logo_url: c[1] || "", rodzaj: c[2] || "domek", wsparcie: c[3] || "wplata" }; }) });
      else { var f = await fetch(BAZA + "/functions/v1/akcja-licznik?slug=dla-fabianka", { headers: { Accept: "application/json" } }); if (f.ok) { var d = await f.json(); if (!firmyZProby) firmy = L.firmyZLicznika(d); ustawKoparke(L.rysunekKoparki(d)); if (window.BM_CEGIELKI_KONTO && window.BM_CEGIELKI_KONTO.ustawAkcje) window.BM_CEGIELKI_KONTO.ustawAkcje(d); } }
    } catch (e) { firmy = []; }
    wczytajLogotypy();
  })();
})();
