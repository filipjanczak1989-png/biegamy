// Sekcja „Twoja firma na Ulicy” na stronie akcji. Plik BEZ import/export (globalThis.BM_FIRMA_FORMULARZ), bez innerHTML: tekst z bazy tylko przez textContent.
// Przełącznik akcje.firmy_zgloszenia z licznika: włączony = formularz, wyłączony = kroki z adresem z bazy (akcje.kontakt_firmy), bez adresu sekcji nie ma.
(function (g) {
  "use strict";
  var EF = "/functions/v1/firma-zgloszenie", PLIK_MAKS = 2 * 1024 * 1024, LOGO_BOK = 400;
  function el(tag, klasa, rodzic, tekst) { var e = g.document.createElement(tag); if (klasa) e.className = klasa; if (tekst != null) e.textContent = tekst; if (rodzic) rodzic.appendChild(e); return e; }
  function zl(n) { return Number(n || 0).toLocaleString("pl-PL") + " zł"; }
  var CSS = ".ff{max-width:560px;margin:18px auto;padding:18px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);text-align:left;color:inherit}.ff h2{margin:0 0 8px;font-size:22px;letter-spacing:0;text-transform:none;color:inherit}.ff p{margin:6px 0;font-size:14px;line-height:1.45}.ff ol{margin:8px 0;padding-left:20px;font-size:14px;line-height:1.5}.ff-pole{display:block;margin:10px 0;font-size:13px;font-weight:700}.ff-pole input,.ff-pole select{display:block;box-sizing:border-box;width:100%;margin-top:4px;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.25);color:inherit;font:inherit;font-weight:400}.ff-pole select option{color:#111}.ff-zgoda{display:flex;gap:8px;align-items:flex-start;font-size:13px;font-weight:400;line-height:1.4;margin:10px 0}.ff-zgoda input{width:20px;height:20px;flex:none;margin:0}.ff-rodo{font-size:12px;opacity:.8}.ff-rodo a{color:inherit;text-decoration:underline}.ff-pulapka{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.ff-wyslij{width:100%;padding:12px;border:0;border-radius:12px;font:inherit;font-weight:800;cursor:pointer;background:#ff8a3c;color:#1b1420}.ff-wyslij:disabled{opacity:.6}.ff-info{margin-top:10px;font-size:14px;font-weight:700}.ff-podglad-nazwa{margin:2px 0 0;text-align:center;font-size:14px;font-weight:700}.ff-rada{margin:4px 0 10px;font-size:13px;line-height:1.4;color:#ffd9a0}.ff-podglad-nazwa:empty,.ff-rada:empty{display:none}";
  function css() { if (g.document.getElementById("ff-css")) return; var s = el("style", "", g.document.head, CSS); s.id = "ff-css"; }

  /** Logo w przeglądarce: najdłuższy bok ≤ 400 px. Canvas przekodowuje plik, więc znikają też metadane. Safari nie zapisuje WebP i oddaje PNG. */
  function logoDoWyslania(plik) {
    return new Promise(function (ok, zle) {
      if (!/^image\/(png|jpeg|webp)$/.test(plik.type)) return zle(new Error("Logo: tylko PNG, JPG albo WebP."));
      if (plik.size > PLIK_MAKS) return zle(new Error("Logo: plik do 2 MB."));
      var u = URL.createObjectURL(plik), im = new Image();
      im.onerror = function () { URL.revokeObjectURL(u); zle(new Error("Logo: nie udało się odczytać obrazu.")); };
      im.onload = function () {
        var sk = Math.min(1, LOGO_BOK / Math.max(im.naturalWidth, im.naturalHeight)), k = g.document.createElement("canvas");
        k.width = Math.max(1, Math.round(im.naturalWidth * sk)); k.height = Math.max(1, Math.round(im.naturalHeight * sk));
        k.getContext("2d").drawImage(im, 0, 0, k.width, k.height);
        URL.revokeObjectURL(u);
        k.toBlob(function (b) { if (b) ok(b); else zle(new Error("Logo: nie udało się przygotować obrazu.")); }, "image/webp", 0.9);
      };
      im.src = u;
    });
  }

  function formularz(s, d) {
    var f = el("form", "", s); f.noValidate = true;
    function pole(id, etykieta, typ, atr) {
      var l = el("label", "ff-pole", f, etykieta), i = el("input", "", l); i.id = id; i.name = id; i.type = typ;
      Object.keys(atr || {}).forEach(function (k) { i.setAttribute(k, atr[k]); });
      return i;
    }
    var lr = el("label", "ff-pole", f, "Budynek"), rodzaj = el("select", "", lr); rodzaj.id = "ff-rodzaj"; rodzaj.name = "rodzaj";
    var o1 = el("option", "", rodzaj, "Domek z logo, od " + zl(d.prog_domku_zl)); o1.value = "domek";
    var o2 = el("option", "", rodzaj, "Wieżowiec z logo, od " + zl(d.prog_wiezowca_zl)); o2.value = "wiezowiec";
    var nazwa = pole("ff-nazwa", "Nazwa firmy", "text", { maxlength: "120", autocomplete: "organization" });
    var link = pole("ff-link", "Strona firmy", "url", { maxlength: "500", placeholder: "https://firma.pl", autocomplete: "url" });
    var email = pole("ff-email", "E-mail kontaktowy (nie jest publiczny)", "email", { maxlength: "120", autocomplete: "email" });
    var kwota = pole("ff-kwota", "Kwota wpłaty, zł", "text", { maxlength: "12", inputmode: "decimal", placeholder: String(d.prog_domku_zl || 100) });
    var logo = pole("ff-logo", "Logo: PNG, JPG albo WebP, do 2 MB", "file", { accept: "image/png,image/jpeg,image/webp" });
    var zrzut = pole("ff-zrzut", "Zrzut potwierdzenia wpłaty: PNG, JPG albo WebP, do 2 MB. Zamaż numer konta.", "file", { accept: "image/png,image/jpeg,image/webp" });
    var pulapka = el("label", "ff-pulapka", f, "Nie wypełniaj tego pola"); pulapka.setAttribute("aria-hidden", "true");
    var pp = el("input", "", pulapka); pp.name = "strona_www"; pp.type = "text"; pp.tabIndex = -1; pp.autocomplete = "off";
    var lk = el("label", "ff-zgoda", f), zk = el("input", "", lk); zk.type = "checkbox"; zk.id = "ff-zgoda-kwota"; el("span", "", lk, "Można pokazać kwotę przy firmie. Bez zaznaczenia kwotę widzi tylko organizator.");
    var lz = el("label", "ff-zgoda", f), z = el("input", "", lz); z.type = "checkbox"; z.id = "ff-zgoda"; el("span", "", lz, "Zgadzam się na wymienienie firmy, jej logo i linku na stronach akcji. Mam prawo używać tego logo.");
    el("p", "ff-rodo", f, "Administrator: BiegaMy. Dane służą do sprawdzenia zgłoszenia i kontaktu w jego sprawie. Zrzut wpłaty kasujemy po decyzji, najpóźniej po 14 dniach, a e-mail 30 dni po zakończeniu akcji.");
    var a = s.querySelector(".ff-rodo"); if (a) { var pr = el("a", "", a, " Polityka prywatności ›"); pr.href = "privacy.html#firmy"; }
    /* PODGLĄD NA ULICY (zgłoszenie 6.11): nad „Wyślij” budynek z logo i nazwą z tej samej funkcji, która rysuje Ulicę (js/ulica-scena.mjs budynekFirmy),
       a logo przygotowane tak samo jak do wysyłki. Wszystko w przeglądarce: nic nie idzie na serwer przed „Wyślij”. Podpowiedź do logo nie blokuje wysyłki. */
    var podglad = el("div", "ff-podglad", f), podPodpis = el("p", "ff-podglad-nazwa", f), podRada = el("p", "ff-rada", f), adresLogo = "", nrPodgladu = 0, zegarP = 0;
    podglad.hidden = true;
    function rysujPodglad() {
      var A = g.BM_AKCJA, n = nazwa.value.trim(), plikLogo = logo.files && logo.files[0], moj = ++nrPodgladu;
      if (!plikLogo && !n) { podglad.hidden = true; podPodpis.textContent = ""; podRada.textContent = ""; return; }
      (plikLogo ? logoDoWyslania(plikLogo).then(function (b) { return g.URL.createObjectURL(b); }, function () { return ""; }) : Promise.resolve("")).then(function (u) {
        if (moj !== nrPodgladu) { if (u) g.URL.revokeObjectURL(u); return; }
        if (adresLogo) g.URL.revokeObjectURL(adresLogo);
        adresLogo = u;
        if (!A || !A.zUlica) return;
        A.zUlica(function (U) {
          if (!U.podgladFirmy || moj !== nrPodgladu) return;
          podglad.hidden = false; podRada.textContent = "";
          podPodpis.textContent = (n || "Twoja firma") + (rodzaj.value === "wiezowiec" ? " · wieżowiec" : " · domek");
          U.podgladFirmy(podglad, { nazwa: n || "Twoja firma", logo: u || null, rodzaj: rodzaj.value }, function (im, ciemny) {
            if (moj !== nrPodgladu) return;
            podRada.textContent = im ? U.ocenaLogo(im, ciemny).join(" ") : (plikLogo ? "Tego logo nie da się odczytać: na szyldzie stanie nazwa." : "");
          }).catch(function () { podglad.hidden = true; });
          if (plikLogo && !u) podRada.textContent = "Tego logo nie da się odczytać: na szyldzie stanie nazwa.";
        });
      });
    }
    nazwa.addEventListener("input", function () { clearTimeout(zegarP); zegarP = setTimeout(rysujPodglad, 200); });
    rodzaj.addEventListener("change", rysujPodglad); logo.addEventListener("change", rysujPodglad);
    var wyslij = el("button", "ff-wyslij", f, "Wyślij zgłoszenie"); wyslij.type = "submit";
    var info = el("p", "ff-info", f); info.setAttribute("role", "status");
    f.addEventListener("submit", function (e) {
      e.preventDefault(); info.textContent = "";
      var M = g.BM_MODERACJA, n = nazwa.value.trim();
      if (n.length < 2) { info.textContent = "Podaj nazwę firmy."; return; }
      if (M) { var fl = M.sprawdz(n, { rodzaj: "firma" }); if (!fl.ok && !fl.mozna_potwierdzic) { info.textContent = M.komunikat(fl); return; } }
      if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) { info.textContent = "Podaj poprawny adres e-mail."; return; }
      var kw = Number(String(kwota.value).replace(/[\s\u00a0]/g, "").replace(/zł$/i, "").replace(",", ".")), prog = Number(rodzaj.value === "wiezowiec" ? d.prog_wiezowca_zl : d.prog_domku_zl);
      if (!(kw > 0)) { info.textContent = "Podaj kwotę wpłaty w złotych."; return; }
      if (prog > 0 && kw < prog) { info.textContent = (rodzaj.value === "wiezowiec" ? "Wieżowiec" : "Domek") + " od " + zl(prog) + "."; return; }
      if (!logo.files[0]) { info.textContent = "Dodaj logo."; return; }
      if (!zrzut.files[0]) { info.textContent = "Dodaj zrzut potwierdzenia wpłaty."; return; }
      if (zrzut.files[0].size > PLIK_MAKS) { info.textContent = "Zrzut wpłaty: plik do 2 MB."; return; }
      if (!/^image\/(png|jpeg|webp)$/.test(zrzut.files[0].type)) { info.textContent = "Zrzut wpłaty: tylko PNG, JPG albo WebP."; return; }
      if (!z.checked) { info.textContent = "Zaznacz zgodę na wymienienie firmy."; return; }
      wyslij.disabled = true; info.textContent = "Wysyłam…";
      logoDoWyslania(logo.files[0]).then(function (b) {
        var dane = new g.FormData();
        dane.append("slug", d.testowa === true ? "proba" : "dla-fabianka"); dane.append("rodzaj", rodzaj.value); dane.append("nazwa", n); dane.append("link", link.value.trim()); dane.append("email", email.value.trim()); dane.append("zgoda", "tak"); dane.append("kwota", kwota.value.trim()); if (zk.checked) dane.append("zgoda_kwota", "tak");
        dane.append("strona_www", pp.value); dane.append("logo", b, "logo"); dane.append("zrzut", zrzut.files[0], "zrzut");
        return g.fetch((g.SB_URL || "") + EF, { method: "POST", body: dane, headers: g.SB_KEY ? { apikey: g.SB_KEY } : {} });
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.ok, blad: j.blad }; }); }).then(function (w) {
        wyslij.disabled = false;
        if (w.ok) { f.reset(); rysujPodglad(); info.textContent = "Dziękujemy! Sprawdzimy wpłatę i logo pojawi się na budynku po zatwierdzeniu."; return; }
        info.textContent = w.blad || "Nie udało się wysłać. Spróbuj za chwilę.";
      }).catch(function (e2) { wyslij.disabled = false; info.textContent = e2 && e2.message && /^Logo/.test(e2.message) ? e2.message : "Nie udało się wysłać. Sprawdź połączenie."; });
    });
  }

  /** Rysuje sekcję w kontenerze. Przed startem, bez przełącznika i bez adresu nie ma nic. */
  function zamontuj(s, d) {
    if (!s) return false;
    var wlaczone = !!(d && d.wystartowala && d.firmy_zgloszenia === true), adres = d && d.wystartowala && typeof d.kontakt_firmy === "string" ? d.kontakt_firmy : "";
    /* Licznik odświeża się co chwilę: bez tej blokady znikałoby to, co ktoś już wpisał. */
    var klucz = JSON.stringify([wlaczone, adres, d && d.prog_domku_zl, d && d.prog_wiezowca_zl, d && d.imie]);
    if (s._klucz === klucz) return !s.hidden;
    s._klucz = klucz;
    while (s.firstChild) s.removeChild(s.firstChild);
    s.hidden = !(wlaczone || adres);
    if (s.hidden) return false;
    css();
    s.className = "ff";
    var A = g.BM_AKCJA, im = A && A.dopelniacz ? A.dopelniacz(d.imie) : "";
    el("h2", "", s, im ? "Twoja firma na Ulicy " + im : "Twoja firma na Ulicy");
    el("p", "", s, "Od " + zl(d.prog_domku_zl) + " domek z Twoim logo, od " + zl(d.prog_wiezowca_zl) + " wieżowiec.");
    var ol = el("ol", "", s);
    el("li", "", ol, "Wpłać na oficjalną zbiórkę.");
    el("li", "", ol, wlaczone ? "Wyślij zgłoszenie: potwierdzenie wpłaty, logo, nazwę, link i zgodę." : "Wyślij potwierdzenie wpłaty, logo PNG, nazwę, link i zgodę na adres " + adres + ".");
    el("li", "", ol, "Logo pojawi się na budynku po sprawdzeniu.");
    el("p", "", s, "To podziękowanie, nie reklama. BiegaMy nie pośredniczy w pieniądzach.");
    if (wlaczone) formularz(s, d);
    return true;
  }
  g.BM_FIRMA_FORMULARZ = { zamontuj: zamontuj, logoDoWyslania: logoDoWyslania };
})(globalThis);
