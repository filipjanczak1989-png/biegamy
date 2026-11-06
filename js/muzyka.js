// MUZYKA (Filip 6.11): pliki grane przez WebAudio na guziku i w grze. Plik BEZ import/export (globalThis.BM_MUZYKA), jak js/akcja.mjs: <script src> na stronach, import w testach.
// Nic nie pobiera się przed włączeniem głośnika, poza guzikiem. Brak pliku, brak sieci albo odmowa dekodowania = cisza: gra działa dalej na dźwiękach z kodu.
// Muzyka ze słowami jest tajna do startu, więc jej adresów tu nie ma: przychodzą z licznika po starcie, a na próbie z funkcji akcja-proba-wizerunek.
(function (g) {
  "use strict";
  var KATALOG = "assets/gra/dzwieki/";
  var PLIKI = { tlo: KATALOG + "tlo_menu.mp3", puls: KATALOG + "puls.mp3", fanfara: KATALOG + "fanfara.mp3", koniec: KATALOG + "koniec.mp3", awans: KATALOG + "awans.mp3" };
  var ADRES = /^https:\/\/afqojgkaveykxbltxzwm\.supabase\.co\/storage\/v1\/object\/sign\/akcja-wizerunek\/[A-Za-z0-9._-]+\.mp3\?token=[A-Za-z0-9._-]+$/;
  var POZYCJE = ["premiera", "menu1", "menu2", "rower", "noc", "mur", "final", "magazyn"];
  var ROZDZIALY = { r10: "rower", r11: "noc" };
  var GLOS = { tlo: 0.4, magazyn: 0.5, pozycja: 0.8, gorka: 0.5, dzingiel: 0.9 };
  var NAZWA_CACHE = "bm-muzyka-1", PRZERWA_AWANSU_S = 1.4;

  /** Tylko znane pozycje i tylko podpisane adresy MP3 z prywatnego kubełka. Obcy adres po prostu nie gra. */
  function adresyZLicznika(m) {
    var w = {};
    if (!m || typeof m !== "object") return w;
    POZYCJE.forEach(function (k) { if (typeof m[k] === "string" && ADRES.test(m[k])) w[k] = m[k]; });
    return w;
  }
  /** Tło menu: dwa utwory na zmianę po starcie, a przed startem albo bez adresów pętla bez słów. */
  function listaMenu(a) { var l = [a && a.menu1, a && a.menu2].filter(Boolean); return l.length ? l : [PLIKI.tlo]; }

  var ctx = null, wyjscie = null, kanal = null, nrGrania = 0, gest = false, bajty = {}, dekodowanie = {}, gotowe = {};
  function kontekst() {
    if (ctx) return ctx;
    var K = g.AudioContext || g.webkitAudioContext;
    if (!K) return null;
    try { ctx = new K(); wyjscie = ctx.createGain(); wyjscie.connect(ctx.destination); } catch (e) { ctx = null; return null; }
    /* Telefon odblokowuje dźwięk dopiero po puszczeniu palca, nie przy dotknięciu. */
    if (!gest && g.addEventListener) { gest = true; ["pointerup", "touchend", "click", "keydown"].forEach(function (n) { g.addEventListener(n, odblokuj, true); }); }
    return ctx;
  }
  function odblokuj() {
    var c = kontekst();
    try { if (c && c.state !== "running" && c.resume) { var p = c.resume(); if (p && p.catch) p.catch(function () {}); } } catch (e) {}
    return c;
  }
  /** Bajty pliku. doCache: guzik, który ma grać od razu, także przy słabym łączu. Serwis worker celowo nie rusza plików audio, więc pamięć własna. */
  function pobierz(adres, doCache) {
    if (bajty[adres]) return bajty[adres];
    var zSieci = function () { return g.fetch(adres).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r; }); };
    var p;
    if (doCache && g.caches) {
      p = g.caches.open(NAZWA_CACHE).then(function (c) {
        return c.match(adres).then(function (z) { return z || zSieci().then(function (r) { return c.put(adres, r.clone()).then(function () { return r; }, function () { return r; }); }); });
      }).catch(zSieci);
    } else p = zSieci();
    bajty[adres] = p.then(function (r) { return r.arrayBuffer(); }).catch(function () { delete bajty[adres]; return null; });
    return bajty[adres];
  }
  function przygotuj(adresy, doCache) { return Promise.all((adresy || []).map(function (a) { return pobierz(a, doCache); })); }
  function bufor(adres) {
    if (gotowe[adres]) return Promise.resolve(gotowe[adres]);
    if (dekodowanie[adres]) return dekodowanie[adres];
    var c = kontekst();
    if (!c) return Promise.resolve(null);
    dekodowanie[adres] = pobierz(adres).then(function (b) {
      if (!b) return null;
      return new Promise(function (ok) { c.decodeAudioData(b, ok, function () { ok(null); }); });
    }).then(function (x) { delete dekodowanie[adres]; delete bajty[adres]; if (x) gotowe[adres] = x; return x; }, function () { delete dekodowanie[adres]; return null; });
    return dekodowanie[adres];
  }
  function zgas(sek) {
    if (!kanal) return;
    var k = kanal, t = ctx.currentTime;
    kanal = null; k.s.onended = null;
    try { k.v.gain.cancelScheduledValues(t); k.v.gain.setValueAtTime(k.v.gain.value, t); k.v.gain.linearRampToValueAtTime(0.0001, t + sek); k.s.stop(t + sek + 0.02); } catch (e) {}
  }
  /** Jeden kanał: nowe granie gasi poprzednie. Późno zdekodowany plik nie wchodzi, gdy gra już co innego. → czy zagrało. */
  function graj(adres, o) {
    var op = o || {}, moj = ++nrGrania;
    zgas(op.przenikanie == null ? 0.25 : op.przenikanie);
    if (!adres || !kontekst()) return Promise.resolve(false);
    return bufor(adres).then(function (b) {
      if (!b || moj !== nrGrania) return false;
      try {
        var s = ctx.createBufferSource(), v = ctx.createGain(), t = ctx.currentTime, glos = op.glos == null ? 1 : op.glos;
        s.buffer = b; s.loop = !!op.petla;
        v.gain.setValueAtTime(op.wejscie ? 0.0001 : glos, t);
        if (op.wejscie) v.gain.linearRampToValueAtTime(glos, t + op.wejscie);
        s.connect(v); v.connect(wyjscie);
        var k = { s: s, v: v, adres: adres };
        s.onended = function () { if (kanal === k) { kanal = null; if (op.koniec) op.koniec(); } };
        s.start(); kanal = k;
        return true;
      } catch (e) { return false; }
    });
  }
  function zatrzymaj(sek) { nrGrania++; zgas(sek == null ? 0.25 : sek); }
  /** Puls przyspiesza przy trzymaniu guzika. */
  function tempo(x, sek) {
    if (!kanal) return;
    try { var p = kanal.s.playbackRate, t = ctx.currentTime; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(x, t + (sek || 0.01)); } catch (e) {}
  }

  /* ── GRA: co gra na którym ekranie. Dopóki głośnik wyłączony, nic się nie pobiera. ── */
  var wlaczony = false, adresy = {}, scenaTeraz = null, nrMenu = 0, tKonca = -99;
  function menu() {
    var lista = listaMenu(adresy), ile = lista.length;
    if (kanal && lista.indexOf(kanal.adres) >= 0) return;
    var petla = ile === 1;
    graj(lista[nrMenu % ile], { petla: petla, glos: GLOS.tlo, wejscie: 1, koniec: petla ? null : function () { nrMenu++; if (scenaTeraz === "menu" && wlaczony) menu(); } });
  }
  function odswiez() {
    if (!wlaczony) return;
    if (scenaTeraz === "menu") menu();
    else if (scenaTeraz === "magazyn") {
      if (!adresy.magazyn) menu();
      else if (!(kanal && kanal.adres === adresy.magazyn)) graj(adresy.magazyn, { petla: true, glos: GLOS.magazyn, wejscie: 0.5 });
    } else if (scenaTeraz === "runda") zatrzymaj(0.4);
  }
  function scena(n) { if (scenaTeraz === n) return; scenaTeraz = n; odswiez(); }
  function wlacz(tak) {
    wlaczony = !!tak;
    if (!wlaczony) { zatrzymaj(0.15); return; }
    odblokuj(); bufor(PLIKI.koniec); bufor(PLIKI.awans);
    odswiez();
  }
  function ustawAdresy(m) { adresy = adresyZLicznika(m); if (scenaTeraz === "menu" || scenaTeraz === "magazyn") odswiez(); }
  /** Raz, nad ekranem: rozdział, finał, „Mur stoi!”. Bez adresu gra dalej to, co grało. */
  function jednorazowo(poz) {
    if (!wlaczony || !adresy[poz]) return false;
    scenaTeraz = "pozycja";
    graj(adresy[poz], { glos: GLOS.pozycja, wejscie: 0.1 });
    return true;
  }
  function rozdzial(id) { var poz = ROZDZIALY[id]; return poz ? jednorazowo(poz) : false; }
  function gorka() { if (wlaczony && adresy.rower) graj(adresy.rower, { glos: GLOS.gorka, wejscie: 0.4 }); }
  /** Krótki dźwięk obok tła. false: plik jeszcze niegotowy albo go nie ma, gra zagra dźwięk z kodu. Awans czeka, aż wybrzmi koniec rundy. */
  function dzingiel(nazwa) {
    var b = gotowe[PLIKI[nazwa]];
    if (!wlaczony || !b || !ctx) return false;
    try {
      var s = ctx.createBufferSource(), v = ctx.createGain(), t = ctx.currentTime, po = nazwa === "awans" ? Math.max(0, PRZERWA_AWANSU_S - (t - tKonca)) : 0;
      s.buffer = b; v.gain.value = GLOS.dzingiel; s.connect(v); v.connect(wyjscie); s.start(t + po);
      if (nazwa === "koniec") tKonca = t;
      return true;
    } catch (e) { return false; }
  }
  function stan() { return { wlaczony: wlaczony, scena: scenaTeraz, adres: kanal ? kanal.adres : null, petla: kanal ? kanal.s.loop : null, tempo: kanal ? kanal.s.playbackRate.value : null, kontekst: ctx ? ctx.state : null }; }

  g.BM_MUZYKA = { PLIKI: PLIKI, adresyZLicznika: adresyZLicznika, listaMenu: listaMenu, przygotuj: przygotuj, bufor: bufor, odblokuj: odblokuj, graj: graj, zatrzymaj: zatrzymaj, tempo: tempo,
    wlacz: wlacz, scena: scena, ustawAdresy: ustawAdresy, jednorazowo: jednorazowo, rozdzial: rozdzial, gorka: gorka, dzingiel: dzingiel, stan: stan };
})(typeof globalThis !== "undefined" ? globalThis : this);
