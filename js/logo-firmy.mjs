// Logo firmy z panelu trenera i z formularza na stronie akcji: PNG, JPG, WebP, GIF, AVIF, SVG, zdjęcie z telefonu (duże, z obrotem EXIF; HEIC tam, gdzie przeglądarka je otwiera, czyli w Safari),
// w panelu także PDF → obraz najwyżej 400 px, gotowy do bucketu akcja-firmy-logo i do funkcji firma-zgloszenie. Plik BEZ import/export (globalThis.BM_LOGO_FIRMY).
// 400 px: granica funkcji firma-zgloszenie (większy WebP odrzuca), a szyld na Ulicy ma najwyżej 160 px szerokości. Wynik zawsze z canvasu (WebP, Safari bez zapisu WebP oddaje PNG), więc SVG nie trafia do bucketu jako SVG.
// PDF rysuje pdf.js w przeglądarce trenera, tylko gdy ktoś wybierze PDF (vendor/pdfjs-4.10.38). Przezroczyste tło: strona bez koloru tła, a białe tło namalowane w pliku jest wycinane od krawędzi. Margines strony jest przycinany, żeby logo wypełniło szyld.
(function (g) {
  "use strict";
  var BOK = 400, WEJSCIE_MAKS = 25 * 1024 * 1024, ETAP_BOK = 1600, ZRZUT_BOK = 1600, ZRZUT_MAKS = 2 * 1024 * 1024 - 64 * 1024, SVG_BOK = 800, PDF_BOK = 1600, KAT_PDF = "vendor/pdfjs-4.10.38/", JAKOSC = 0.92, PROG_BIELI = 245, PROG_ALFA = 8;
  var PROSBA = "Wyślij logo jako PNG lub JPG.";
  var HEIF = /^(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)$/;

  function ascii(b, od, ile) { var s = ""; for (var i = od; i < od + ile && i < b.length; i++) s += String.fromCharCode(b[i]); return s; }
  /** Po pierwszych bajtach: "pdf" | "obraz" (PNG, JPG, WebP, GIF, AVIF) | "heic" | "svg" | "" (nieznany: i tak próbujemy go otworzyć). */
  function rodzajPoBajtach(b) {
    if (b.length < 12) return "";
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "pdf";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "obraz";
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "obraz";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "obraz";
    if (ascii(b, 0, 4) === "GIF8") return "obraz";
    if (ascii(b, 4, 4) === "ftyp") { var marka = ascii(b, 8, 4); if (marka === "avif" || marka === "avis") return "obraz"; if (HEIF.test(marka)) return "heic"; }
    var poczatek = ascii(b, b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0, 1024);
    if (/^\s*(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(poczatek)) return "svg";
    return "";
  }
  /** Gdy bajty nic nie mówią (długi komentarz na początku SVG, HEIC bez znanej marki): typ i nazwa pliku z telefonu. */
  function rodzajPoNazwie(plik) {
    var t = String(plik.type || "").toLowerCase(), n = String(plik.name || "").toLowerCase();
    if (t === "image/svg+xml" || /\.svgz?$/.test(n)) return "svg";
    if (/^image\/hei[cf]/.test(t) || /\.hei[cf]$/.test(n)) return "heic";
    if (t === "application/pdf" || /\.pdf$/.test(n)) return "pdf";
    return "";
  }
  function nowyCanvas(s, w) { var k = g.document.createElement("canvas"); k.width = Math.max(1, Math.round(s)); k.height = Math.max(1, Math.round(w)); return k; }

  async function pdfNaCanvas(bajty) {
    var pdfjs = await import(new URL(KAT_PDF + "pdf.min.mjs", g.location.href).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(KAT_PDF + "pdf.worker.min.mjs", g.location.href).href;
    var dok = await pdfjs.getDocument({ data: bajty, isEvalSupported: false, disableFontFace: true }).promise;
    try {
      var strona = await dok.getPage(1), v1 = strona.getViewport({ scale: 1 }), v = strona.getViewport({ scale: PDF_BOK / Math.max(v1.width, v1.height) });
      var k = nowyCanvas(v.width, v.height);
      await strona.render({ canvasContext: k.getContext("2d"), viewport: v, background: "rgba(0,0,0,0)" }).promise;
      return k;
    } finally { dok.destroy(); }
  }

  /** Białe tło namalowane w PDF: wycięcie od krawędzi, więc biel w środku znaku zostaje. Bez bieli na krawędzi nic się nie dzieje. */
  function bezBialegoTla(k) {
    var c = k.getContext("2d"), s = k.width, w = k.height, im = c.getImageData(0, 0, s, w), d = im.data, stos = [], odw = new Uint8Array(s * w), i;
    function bialy(p) { var a = p * 4; return d[a + 3] > PROG_ALFA && d[a] >= PROG_BIELI && d[a + 1] >= PROG_BIELI && d[a + 2] >= PROG_BIELI; }
    function dodaj(p) { if (!odw[p] && bialy(p)) { odw[p] = 1; stos.push(p); } }
    for (i = 0; i < s; i++) { dodaj(i); dodaj((w - 1) * s + i); }
    for (i = 0; i < w; i++) { dodaj(i * s); dodaj(i * s + s - 1); }
    if (!stos.length) return;
    while (stos.length) {
      var p = stos.pop(), kol = p % s;
      d[p * 4 + 3] = 0;
      if (kol > 0) dodaj(p - 1);
      if (kol < s - 1) dodaj(p + 1);
      if (p >= s) dodaj(p - s);
      if (p < s * (w - 1)) dodaj(p + s);
    }
    c.putImageData(im, 0, 0);
  }

  /** Margines strony: przycięcie do widocznej części. Pusta strona to błąd, nie puste logo. */
  function przytnij(k) {
    var c = k.getContext("2d"), s = k.width, w = k.height, d = c.getImageData(0, 0, s, w).data, x0 = s, y0 = w, x1 = -1, y1 = -1;
    for (var y = 0; y < w; y++) for (var x = 0; x < s; x++) {
      if (d[(y * s + x) * 4 + 3] > PROG_ALFA) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) throw new Error("Logo: pierwsza strona PDF jest pusta.");
    var n = nowyCanvas(x1 - x0 + 1, y1 - y0 + 1);
    n.getContext("2d").drawImage(k, x0, y0, n.width, n.height, 0, 0, n.width, n.height);
    return n;
  }

  /* Puste tło wokół logo (białe albo przezroczyste) tylko zmniejsza znak na szyldzie. Biel w środku logo zostaje. */
  function bezPustegoMarginesu(k) {
    var c = k.getContext("2d"), s = k.width, w = k.height, d = c.getImageData(0, 0, s, w).data, x0 = s, y0 = w, x1 = -1, y1 = -1;
    for (var y = 0; y < w; y++) for (var x = 0; x < s; x++) {
      var i = (y * s + x) * 4;
      if (d[i + 3] > PROG_ALFA && Math.min(d[i], d[i + 1], d[i + 2]) < 245) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return k;
    var m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(s - 1, x1 + m); y1 = Math.min(w - 1, y1 + m);
    var n = nowyCanvas(x1 - x0 + 1, y1 - y0 + 1);
    n.getContext("2d").drawImage(k, x0, y0, n.width, n.height, 0, 0, n.width, n.height);
    return n;
  }

  /** Wymiary z <svg width height> albo viewBox; logo bez nich (tylko CSS) dostaje kwadrat. */
  function proporcjeSvg(tekst) {
    var tag = (/<svg\b[^>]*>/i.exec(tekst) || [""])[0];
    function atr(n) { var m = new RegExp("\\s" + n + "\\s*=\\s*[\"']\\s*([0-9.]+)\\s*(px)?\\s*[\"']", "i").exec(tag); return m ? Number(m[1]) : 0; }
    var s = atr("width"), w = atr("height");
    if (s > 0 && w > 0) return [s, w];
    var vb = /\sviewBox\s*=\s*["']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*["']/i.exec(tag);
    if (vb && Number(vb[1]) > 0 && Number(vb[2]) > 0) return [Number(vb[1]), Number(vb[2])];
    return [1, 1];
  }

  /* Obraz rysuje przeglądarka (z obrotem EXIF, jak w <img>) od razu w mniejszym canvasie: zdjęcie 48 Mpx nie robi canvasu, którego telefon nie uniesie.
     SVG rysowany w docelowej wielkości, więc ostry. Błąd = przeglądarka nie zna formatu. */
  function obrazNaCanvas(plik, bajty, rodzaj, bok) {
    return new Promise(function (ok, zle) {
      var svg = rodzaj === "svg", zrodlo = svg ? new Blob([bajty], { type: "image/svg+xml" }) : plik, u = URL.createObjectURL(zrodlo), im = new Image();
      im.onerror = function () { URL.revokeObjectURL(u); zle(new Error("dekodowanie")); };
      im.onload = function () {
        try {
          var sw = im.naturalWidth, sh = im.naturalHeight, sk;
          if (svg) { var p = proporcjeSvg(new TextDecoder().decode(bajty.subarray(0, 65536))); sw = p[0]; sh = p[1]; sk = SVG_BOK / Math.max(sw, sh); }
          else sk = Math.min(1, (bok || ETAP_BOK) / Math.max(sw, sh));
          if (!(sw > 0 && sh > 0)) throw new Error("dekodowanie");
          var k = nowyCanvas(sw * sk, sh * sk), c = k.getContext("2d");
          if (!c) throw new Error("pamięć");
          c.imageSmoothingQuality = "high";
          c.drawImage(im, 0, 0, k.width, k.height);
          ok(k);
        } catch (e) { zle(e); } finally { URL.revokeObjectURL(u); }
      };
      im.src = u;
    });
  }

  /** Stopniowo po połowie, żeby cienkie napisy w logo nie zniknęły przy dużym zmniejszeniu. */
  function przeskaluj(k) {
    var bok = Math.max(k.width, k.height);
    while (bok > BOK * 2) {
      var pol = nowyCanvas(k.width / 2, k.height / 2);
      var c = pol.getContext("2d"); c.imageSmoothingQuality = "high"; c.drawImage(k, 0, 0, pol.width, pol.height);
      k = pol; bok = Math.max(k.width, k.height);
    }
    if (bok <= BOK) return k;
    var sk = BOK / bok, n = nowyCanvas(k.width * sk, k.height * sk), c2 = n.getContext("2d");
    c2.imageSmoothingQuality = "high"; c2.drawImage(k, 0, 0, n.width, n.height);
    return n;
  }

  /** Plik → { blob, szer, wys, zPdf }. opcje.pdf === false: PDF odrzucany (formularz na stronie akcji, bez pdf.js). Błędy po polsku w Error.message, zawsze z tym, co zrobić. */
  async function przygotuj(plik, opcje) {
    var o = opcje || {};
    if (!plik || !(plik.size > 0)) throw new Error("Logo: wybierz plik.");
    if (plik.size > WEJSCIE_MAKS) throw new Error("Logo: plik ma ponad 25 MB. " + PROSBA);
    var bajty = new Uint8Array(await plik.arrayBuffer()), rodzaj = rodzajPoBajtach(bajty) || rodzajPoNazwie(plik), k;
    if (rodzaj === "pdf") {
      if (o.pdf === false) throw new Error("Logo: to plik PDF. " + PROSBA);
      try { k = await pdfNaCanvas(bajty); } catch (e) { throw new Error("Logo: nie udało się odczytać PDF. " + PROSBA); }
      bezBialegoTla(k);
      k = przytnij(k);
    } else {
      try { k = await obrazNaCanvas(plik, bajty, rodzaj); } catch (e) {
        throw new Error(rodzaj === "heic" ? "Logo: zdjęcia HEIC ta przeglądarka nie otworzy. " + PROSBA + " Wystarczy zrzut ekranu z logo." : "Logo: tego pliku nie da się otworzyć jako obrazu. " + PROSBA);
      }
      try { k = bezPustegoMarginesu(k); } catch (e) {}   // canvas, którego nie wolno czytać (stare Safari i SVG): logo bez przycięcia
    }
    k = przeskaluj(k);
    var blob = null;
    try { blob = await new Promise(function (ok) { k.toBlob(ok, "image/webp", JAKOSC); }); } catch (e) { blob = null; }
    if (!blob) throw new Error("Logo: nie udało się przygotować obrazu. " + PROSBA);
    return { blob: blob, szer: k.width, wys: k.height, zPdf: rodzaj === "pdf" };
  }
  /* Zrzut albo zdjęcie potwierdzenia wpłaty (formularz na stronie akcji, firma i osoba): do 1600 px na białym tle, bez przycinania (to dokument, nie logo),
     WebP poniżej 2 MB, czyli limitu funkcji firma-zgloszenie. Kolejne próby jakości, na końcu JPG (Safari bez zapisu WebP oddaje PNG, który bywa za duży). */
  var PROSBA_ZRZUT = "Zrób zrzut ekranu potwierdzenia (PNG albo JPG).";
  function doBloba(k, typ, jakosc) { return new Promise(function (ok) { try { k.toBlob(ok, typ, jakosc); } catch (e) { ok(null); } }); }
  async function przygotujZrzut(plik) {
    if (!plik || !(plik.size > 0)) throw new Error("Zrzut wpłaty: wybierz plik.");
    if (plik.size > WEJSCIE_MAKS) throw new Error("Zrzut wpłaty: plik ma ponad 25 MB. " + PROSBA_ZRZUT);
    var bajty = new Uint8Array(await plik.arrayBuffer()), rodzaj = rodzajPoBajtach(bajty) || rodzajPoNazwie(plik), k;
    if (rodzaj === "pdf") throw new Error("Zrzut wpłaty: to plik PDF. " + PROSBA_ZRZUT);
    try { k = await obrazNaCanvas(plik, bajty, rodzaj, ZRZUT_BOK); } catch (e) {
      throw new Error(rodzaj === "heic" ? "Zrzut wpłaty: zdjęcia HEIC ta przeglądarka nie otworzy. " + PROSBA_ZRZUT : "Zrzut wpłaty: tego pliku nie da się otworzyć jako obrazu. " + PROSBA_ZRZUT);
    }
    var b = nowyCanvas(k.width, k.height), c = b.getContext("2d");
    c.fillStyle = "#fff"; c.fillRect(0, 0, b.width, b.height); c.drawImage(k, 0, 0);
    var proby = [["image/webp", 0.85], ["image/webp", 0.7], ["image/webp", 0.55], ["image/jpeg", 0.8], ["image/jpeg", 0.6]];
    for (var i = 0; i < proby.length; i++) {
      var w = await doBloba(b, proby[i][0], proby[i][1]);
      if (w && w.size <= ZRZUT_MAKS && /^image\/(webp|jpeg|png)$/.test(w.type)) return w;
    }
    throw new Error("Zrzut wpłaty: nie udało się zmniejszyć pliku. " + PROSBA_ZRZUT);
  }
  g.BM_LOGO_FIRMY = { przygotuj: przygotuj, przygotujZrzut: przygotujZrzut, rodzajPoBajtach: rodzajPoBajtach, PROSBA: PROSBA };
})(globalThis);
