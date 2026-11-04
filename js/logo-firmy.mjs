// Logo firmy z panelu trenera: PNG, JPG, WebP albo PDF → obraz najwyżej 400 px, gotowy do bucketu akcja-firmy-logo. Plik BEZ import/export (globalThis.BM_LOGO_FIRMY).
// PDF rysuje pdf.js w przeglądarce trenera, tylko gdy ktoś wybierze PDF (vendor/pdfjs-4.10.38). Przezroczyste tło: strona bez koloru tła, a białe tło namalowane w pliku jest wycinane od krawędzi. Margines strony jest przycinany, żeby logo wypełniło szyld.
(function (g) {
  "use strict";
  var BOK = 400, WEJSCIE_MAKS = 10 * 1024 * 1024, PDF_BOK = 1600, KAT_PDF = "vendor/pdfjs-4.10.38/", JAKOSC = 0.92, PROG_BIELI = 245, PROG_ALFA = 8;

  function rodzajPoBajtach(b) {
    if (b.length < 12) return "";
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "pdf";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "obraz";
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "obraz";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "obraz";
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

  function obrazNaCanvas(plik) {
    return new Promise(function (ok, zle) {
      var u = URL.createObjectURL(plik), im = new Image();
      im.onerror = function () { URL.revokeObjectURL(u); zle(new Error("Logo: nie udało się odczytać obrazu.")); };
      im.onload = function () {
        var k = nowyCanvas(im.naturalWidth, im.naturalHeight);
        k.getContext("2d").drawImage(im, 0, 0);
        URL.revokeObjectURL(u); ok(k);
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

  /** Plik z formularza → { blob, szer, wys, zPdf }. Typ wyniku: WebP, a Safari, które WebP nie zapisze, oddaje PNG. Błędy po polsku w Error.message. */
  async function przygotuj(plik) {
    if (!plik || !(plik.size > 0)) throw new Error("Logo: wybierz plik.");
    if (plik.size > WEJSCIE_MAKS) throw new Error("Logo: plik do 10 MB.");
    var bajty = new Uint8Array(await plik.arrayBuffer()), rodzaj = rodzajPoBajtach(bajty), k;
    if (!rodzaj) throw new Error("Logo: tylko PNG, JPG, WebP albo PDF.");
    if (rodzaj === "pdf") {
      try { k = await pdfNaCanvas(bajty); } catch (e) { throw new Error("Logo: nie udało się odczytać PDF. Wyślij PNG."); }
      bezBialegoTla(k);
      k = przytnij(k);
    } else k = await obrazNaCanvas(plik);
    k = przeskaluj(k);
    var blob = await new Promise(function (ok) { k.toBlob(ok, "image/webp", JAKOSC); });
    if (!blob) throw new Error("Logo: nie udało się przygotować obrazu.");
    return { blob: blob, szer: k.width, wys: k.height, zPdf: rodzaj === "pdf" };
  }
  g.BM_LOGO_FIRMY = { przygotuj: przygotuj, rodzajPoBajtach: rodzajPoBajtach };
})(globalThis);
