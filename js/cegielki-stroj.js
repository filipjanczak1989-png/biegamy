// CEGIEŁKI: strój ze sklepiku. Koszulka i spodenki to przemalowanie arkuszy w przeglądarce, bez dodatkowych grafik. Dodatki (czapki, okulary, medal, peleryna) to obrazki przypinane na żywo w każdej klatce.
// Forma budowniczego zostaje bez przemalowania: to sygnał działającej tarczy i nie może wyglądać jak ozdoba ze sklepiku. Na kasku nie ma czapek, reszta dodatków zostaje.
// Punkty przypięcia liczy tools/przypiecia-postaci.py (js/cegielki-przypiecia.js).
(function () {
  "use strict";
  var L = window.BM_CEGIELKI;
  var PRZEDMIOTY = {}; L.SKLEP.forEach(function (p) { PRZEDMIOTY[p.id] = p; });
  var ORYGINALY = {}, ZASTOSOWANE = {};

  function hsv(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return { v: mx / 255, s: mx ? (mx - mn) / mx : 0 };
  }
  /* Tkanina: ciemny, mało nasycony piksel, jaśniejszy od czarnego konturu. Otwarcie maski kasuje pierścień wygładzenia między konturem a białym obrysem. */
  function maskaTkaniny(d, szer, wys, x0, cw) {
    var m = new Uint8Array(cw * wys), y, x, i, o;
    for (y = 0; y < wys; y++) for (x = 0; x < cw; x++) {
      i = (y * szer + x0 + x) * 4;
      if (d[i + 3] < 200) continue;
      o = hsv(d[i], d[i + 1], d[i + 2]);
      if (o.s < 0.45 && o.v >= 0.085 && o.v <= 0.33) m[y * cw + x] = 1;
    }
    var er = new Uint8Array(m.length);
    for (y = 1; y < wys - 1; y++) for (x = 1; x < cw - 1; x++) {
      i = y * cw + x;
      if (m[i] && m[i - 1] && m[i + 1] && m[i - cw] && m[i + cw]) er[i] = 1;
    }
    var wy = new Uint8Array(m.length);
    for (y = 1; y < wys - 1; y++) for (x = 1; x < cw - 1; x++) {
      i = y * cw + x;
      if (m[i] && (er[i] || er[i - 1] || er[i + 1] || er[i - cw] || er[i + cw])) wy[i] = 1;
    }
    return wy;
  }
  function skladowe(m, cw, wys) {
    var nr = new Int32Array(m.length), wynik = [], stos = [];
    for (var s = 0; s < m.length; s++) {
      if (!m[s] || nr[s]) continue;
      var id = wynik.length + 1, sx = 0, sy = 0, ile = 0, piks = [];
      stos.length = 0; stos.push(s); nr[s] = id;
      while (stos.length) {
        var p = stos.pop(), py = Math.floor(p / cw), px = p - py * cw;
        piks.push(p); sx += px; sy += py; ile++;
        if (px > 0 && m[p - 1] && !nr[p - 1]) { nr[p - 1] = id; stos.push(p - 1); }
        if (px < cw - 1 && m[p + 1] && !nr[p + 1]) { nr[p + 1] = id; stos.push(p + 1); }
        if (py > 0 && m[p - cw] && !nr[p - cw]) { nr[p - cw] = id; stos.push(p - cw); }
        if (py < wys - 1 && m[p + cw] && !nr[p + cw]) { nr[p + cw] = id; stos.push(p + cw); }
      }
      wynik.push({ piks: piks, ile: ile, x: sx / ile, y: sy / ile });
    }
    return wynik;
  }
  /* Koszulka: fragmenty tkaniny bliżej głowy niż spodenki, spodenki: reszta. Obie odległości od twarzy z punktów przypięcia. */
  function podzialTkaniny(sk, glowa) {
    var duze = sk.filter(function (c) { return c.ile >= 40; });
    if (duze.length < 2) return { koszulka: duze, spodenki: [] };
    var odl = function (c) { return glowa ? Math.hypot(c.x - glowa[0], c.y - glowa[1]) : c.y; };
    var mn = Infinity, mx = -Infinity;
    duze.forEach(function (c) { var o = odl(c); if (o < mn) mn = o; if (o > mx) mx = o; });
    var prog = (mn + mx) / 2;
    return { koszulka: duze.filter(function (c) { return odl(c) <= prog; }), spodenki: duze.filter(function (c) { return odl(c) > prog; }) };
  }
  function pomaluj(d, szer, x0, cw, p, kolor) {
    var y = Math.floor(p / cw), x = p - y * cw, i = (y * szer + x0 + x) * 4;
    var v = Math.max(d[i], d[i + 1], d[i + 2]) / 255, t = Math.min(1.25, 0.55 + (v - 0.085) / 0.245 * 0.8);
    d[i] = Math.min(255, kolor[0] * t); d[i + 1] = Math.min(255, kolor[1] * t); d[i + 2] = Math.min(255, kolor[2] * t);
  }

  /* Jeden arkusz → canvas w kolorach stroju. Liczymy na kopii do odczytu; do rysowania idzie zwykły canvas, bo ten z częstym odczytem przeglądarka trzyma poza kartą i rysuje wolniej. */
  function przerob(img, at, nazwa, postac, wybor) {
    var kan = document.createElement("canvas"); kan.width = img.naturalWidth || img.width; kan.height = img.naturalHeight || img.height;
    var k = kan.getContext("2d", { willReadFrequently: true });
    k.drawImage(img, 0, 0);
    var tulow = wybor.tulow && PRZEDMIOTY[wybor.tulow], spodenki = wybor.spodenki && PRZEDMIOTY[wybor.spodenki];
    if (!tulow && !spodenki) return img;
    var arkusz = nazwa.slice(postac.length + 1), punkty = (window.BM_CEGIELKI_PRZYPIECIA && window.BM_CEGIELKI_PRZYPIECIA[postac] || {})[arkusz] || [];
    var obraz = k.getImageData(0, 0, kan.width, kan.height), d = obraz.data, szer = kan.width, wys = kan.height;
    for (var i = 0; i < at.n; i++) {
      var x0 = i * at.cw, podzial = podzialTkaniny(skladowe(maskaTkaniny(d, szer, wys, x0, at.cw), at.cw, wys), punkty[i] || null);
      if (tulow) podzial.koszulka.forEach(function (c) {
        var ys = c.piks.map(function (p) { return Math.floor(p / at.cw); }), gora = Math.min.apply(null, ys), dol = Math.max.apply(null, ys), wysok = Math.max(1, dol - gora);
        c.piks.forEach(function (p, nr) {
          var kol = tulow.kolor;
          if (tulow.pasy) { var w = (ys[nr] - gora) / wysok; if ((w > 0.36 && w < 0.47) || (w > 0.66 && w < 0.77)) kol = tulow.pasy; }
          pomaluj(d, szer, x0, at.cw, p, kol);
        });
      });
      if (spodenki) podzial.spodenki.forEach(function (c) { c.piks.forEach(function (p) { pomaluj(d, szer, x0, at.cw, p, spodenki.kolor); }); });
    }
    k.putImageData(obraz, 0, 0);
    var rys = document.createElement("canvas"); rys.width = kan.width; rys.height = kan.height;
    rys.getContext("2d").drawImage(kan, 0, 0);
    return rys;
  }

  /* Podmienia arkusze postaci w OBR. Wynik pamiętany per strój, żeby druga runda nie liczyła od nowa. */
  function zastosuj(OBR, A, postac, wybor) {
    if (L.POSTACIE[postac] && L.POSTACIE[postac].wlasne) return;
    var klucz = (wybor && wybor.tulow || "") + "|" + (wybor && wybor.spodenki || "");
    Object.keys(A).forEach(function (n) {
      if (n.indexOf(postac + "_") !== 0 || /_bud$/.test(n) || !OBR[n]) return;
      if (!ORYGINALY[n]) ORYGINALY[n] = OBR[n];
      if (ZASTOSOWANE[n] && ZASTOSOWANE[n].klucz === klucz) { OBR[n] = ZASTOSOWANE[n].obraz; return; }
      var obraz = klucz === "|" ? ORYGINALY[n] : przerob(ORYGINALY[n], A[n], n, postac, wybor);
      ZASTOSOWANE[n] = { klucz: klucz, obraz: obraz };
      OBR[n] = obraz;
    });
  }

  /** Lista dodatków do rysowania z założonego stroju. */
  function noszone(stroj) {
    var lista = [];
    ["plecy", "szyja", "oczy", "glowa"].forEach(function (s) { if (stroj && stroj[s] && L.DODATKI[stroj[s]]) lista.push({ id: stroj[s], slot: s, u: L.DODATKI[stroj[s]] }); });
    return lista;
  }
  function nazwyObrazow(lista) { return lista.map(function (d) { return "dodatek_" + d.id; }); }

  /* warstwa "tyl": przed postacią (peleryna), "przod": po postaci. (x0, y0) to lewy górny róg klatki w kontekście k, sk to skala klatki. W obrocie salta kontekst jest już obrócony, więc dodatek obraca się razem z postacią. */
  function dodatki(k, warstwa, OBR, A, postac, arkusz, nr, x0, y0, sk, lista, czas) {
    var P = window.BM_CEGIELKI_PRZYPIECIA, pk = P && P[postac] && P[postac][arkusz] && P[postac][arkusz][nr];
    if (!pk) return;
    for (var i = 0; i < lista.length; i++) {
      var d = lista[i], u = d.u, wTyl = !!u.wTyl;
      if (wTyl !== (warstwa === "tyl")) continue;
      if (d.slot === "glowa" && pk[8]) continue;   // kask na głowie: czapki nie
      var n = "dodatek_" + d.id, im = OBR[n], at = A[n]; if (!im || !at) continue;
      var nagl = u.punkt === "glowa", px = nagl ? pk[0] : pk[5], py = nagl ? pk[1] : pk[6], kat = nagl ? pk[3] : pk[7], r = pk[2] * sk, strona = pk[4] || 1;
      var w = u[postac] || u, szer = w.szer * r, wys = szer * at.h / at.w;
      k.save();
      k.translate(x0 + px * sk, y0 + py * sk);
      k.rotate(kat + (wTyl && czas ? Math.sin(czas * 9) * 0.05 : 0));
      if (strona < 0) k.scale(-1, 1);
      k.drawImage(im, w.dx * r - w.kx * szer, -w.dy * r - w.ky * wys, szer, wys);
      k.restore();
    }
  }

  /* Podgląd w sklepiku: pierwsza klatka biegu w wybranym stroju, z marginesem na czapkę i pelerynę. */
  function podglad(kan, OBR, A, postac, wybor) {
    var n = postac + "_bieg", at = A[n], zrodlo = ORYGINALY[n] || OBR[n];
    if (!at || !zrodlo) return;
    var obraz = wybor && (wybor.tulow || wybor.spodenki) ? przerob(zrodlo, at, n, postac, wybor) : zrodlo;
    var ML = 50, MG = 34;
    kan.width = at.cw + ML; kan.height = at.ch + MG;
    var k = kan.getContext("2d"), lista = noszone(wybor);
    dodatki(k, "tyl", OBR, A, postac, "bieg", 0, ML, MG, 1, lista);
    k.drawImage(obraz, 0, 0, at.cw, at.ch, ML, MG, at.cw, at.ch);
    dodatki(k, "przod", OBR, A, postac, "bieg", 0, ML, MG, 1, lista);
  }
  window.BM_CEGIELKI_STROJ = { zastosuj: zastosuj, przerob: przerob, podglad: podglad, noszone: noszone, nazwyObrazow: nazwyObrazow, dodatki: dodatki };
})();
