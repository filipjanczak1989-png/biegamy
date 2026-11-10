// Sekcja „Twoja firma lub cegiełka na Ulicy” na stronie akcji. Plik BEZ import/export (globalThis.BM_FIRMA_FORMULARZ), bez innerHTML: tekst z bazy tylko przez textContent.
// Przełącznik akcje.firmy_zgloszenia z licznika: włączony = formularz (osoba prywatna: cegiełka w murze albo firma: budynek), wyłączony = kroki z adresem z bazy (akcje.kontakt_firmy), bez adresu sekcji nie ma.
(function (g) {
  "use strict";
  var EF = "/functions/v1/firma-zgloszenie", PLIK_MAKS = 2 * 1024 * 1024, PROSBA = "Wyślij logo jako PNG lub JPG.";
  /* Imię do muru: to samo co RE_IMIE w js/ulica.mjs (panel trenera), w funkcji firma-zgloszenie i CHECK w bazie (blizna-192 pilnuje trzech kopii). */
  var RE_IMIE = /^(?=.{2,20}$)[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+(?:-[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+)?$/;
  var TEKST_IMIE = "Imię do muru: jedno słowo, same litery, od 2 do 20 znaków, najwyżej jeden łącznik (Anna-Maria). Bez nazwiska.";
  function el(tag, klasa, rodzic, tekst) { var e = g.document.createElement(tag); if (klasa) e.className = klasa; if (tekst != null) e.textContent = tekst; if (rodzic) rodzic.appendChild(e); return e; }
  function zl(n) { return Number(n || 0).toLocaleString("pl-PL") + " zł"; }
  var CSS = ".ff{max-width:560px;margin:18px auto;padding:18px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);text-align:left;color:inherit}.ff h2{margin:0 0 8px;font-size:22px;letter-spacing:0;text-transform:none;color:inherit}.ff p{margin:6px 0;font-size:14px;line-height:1.45}.ff ol{margin:8px 0;padding-left:20px;font-size:14px;line-height:1.5}.ff-pole{display:block;margin:10px 0;font-size:13px;font-weight:700}.ff-pole input,.ff-pole select{display:block;box-sizing:border-box;width:100%;margin-top:4px;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.25);color:inherit;font:inherit;font-weight:400}.ff-pole select option{color:#111}.ff-zgoda{display:flex;gap:8px;align-items:flex-start;font-size:13px;font-weight:400;line-height:1.4;margin:10px 0}.ff-zgoda input{width:20px;height:20px;flex:none;margin:0}.ff-rodo{font-size:12px;opacity:.8}.ff-rodo a{color:inherit;text-decoration:underline}.ff-pulapka{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.ff-wyslij{width:100%;padding:12px;border:0;border-radius:12px;font:inherit;font-weight:800;cursor:pointer;background:#ff8a3c;color:#1b1420}.ff-wyslij:disabled{opacity:.6}.ff-info{margin-top:10px;font-size:14px;font-weight:700}.ff-podglad-nazwa{margin:2px 0 0;text-align:center;font-size:14px;font-weight:700}.ff-rada{margin:4px 0 10px;font-size:13px;line-height:1.4;color:#ffd9a0}.ff-podglad-nazwa:empty,.ff-rada:empty{display:none}.ff-cegielka{margin-top:20px;padding-top:14px;border-top:1px solid rgba(255,255,255,.14)}.ff-cegielka h3{margin:0 0 6px;font-size:17px}" +
    ".ff-kto{border:0;margin:8px 0 4px;padding:0;min-width:0}.ff-kto legend{font-size:13px;font-weight:700;margin:0 0 4px;padding:0}.ff-kto-opcja{display:flex;gap:10px;align-items:center;padding:11px 12px;margin:6px 0;border:1px solid rgba(255,255,255,.25);border-radius:12px;font-size:14px;font-weight:700;cursor:pointer}.ff-kto-opcja input{width:20px;height:20px;margin:0;flex:none}.ff-kto-opcja:has(input:checked){border-color:#ff8a3c;background:rgba(255,138,60,.14)}";
  function css() { if (g.document.getElementById("ff-css")) return; var s = el("style", "", g.document.head, CSS); s.id = "ff-css"; }

  /** PNG, JPG albo WebP po pierwszych bajtach (te przyjmuje funkcja firma-zgloszenie). → typ albo "". */
  function typSurowy(plik) {
    return plik.slice(0, 12).arrayBuffer().then(function (a) {
      var b = new Uint8Array(a);
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
      if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
      if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
      return "";
    }, function () { return ""; });
  }
  /** Logo do wysyłki: to samo przygotowanie co w panelu trenera (js/logo-firmy.mjs, bez PDF): PNG, JPG, WebP, SVG, zdjęcie z telefonu → WebP najwyżej 400 px.
      Gdy przygotowanie w przeglądarce padnie, a plik i tak jest PNG, JPG albo WebP do 2 MB, idzie oryginał: funkcja na serwerze sama go sprawdzi i zmniejszy, a trener zobaczy plik. */
  function logoDoWyslania(plik) {
    var L = g.BM_LOGO_FIRMY;
    var przygotowane = L ? L.przygotuj(plik, { pdf: false }).then(function (w) { return w.blob; }) : Promise.reject(new Error("Logo: nie udało się przygotować pliku. " + PROSBA));
    return przygotowane.catch(function (e) {
      return typSurowy(plik).then(function (typ) { if (typ && plik.size <= PLIK_MAKS) return plik; throw e; });
    });
  }
  /** Zrzut wpłaty (firma i osoba): zdjęcie z aparatu albo duży zrzut → WebP do 1600 px w przeglądarce (js/logo-firmy.mjs przygotujZrzut), żeby limit 2 MB funkcji
      nie odrzucał zdjęć. Gdy przygotowanie padnie, PNG/JPG/WebP do 2 MB idzie jako oryginał. */
  function zrzutDoWyslania(plik) {
    var L = g.BM_LOGO_FIRMY;
    var przygotowany = L && L.przygotujZrzut ? L.przygotujZrzut(plik) : Promise.reject(new Error("Zrzut wpłaty: nie udało się przygotować pliku. Zrób zrzut ekranu potwierdzenia (PNG albo JPG)."));
    return przygotowany.catch(function (e) {
      return typSurowy(plik).then(function (typ) { if (typ && plik.size <= PLIK_MAKS) return plik; throw e; });
    });
  }
  function poprawneImie(t) { return RE_IMIE.test(String(t || "").trim()); }

  function formularz(s, d) {
    var f = el("form", "", s); f.noValidate = true;
    function pole(id, etykieta, typ, atr, rodzic) {
      var l = el("label", "ff-pole", rodzic || f, etykieta), i = el("input", "", l); i.id = id; i.name = id; i.type = typ;
      Object.keys(atr || {}).forEach(function (k) { i.setAttribute(k, atr[k]); });
      return i;
    }
    /* KTO ZGŁASZA (Filip 6.11 wieczór): osoba prywatna dostaje cegłę z imieniem w murze, firma budynek z logo. Domyślnie osoba: tak wpłaca większość. */
    var kto = el("fieldset", "ff-kto", f); el("legend", "", kto, "Kto zgłasza?");
    function opcja(wartosc, tekst) { var l = el("label", "ff-kto-opcja", kto), r = el("input", "", l); r.type = "radio"; r.name = "ff-kto"; r.value = wartosc; r.id = "ff-kto-" + wartosc; el("span", "", l, tekst); return r; }
    var kOsoba = opcja("osoba", "Osoba prywatna: cegiełka w murze"), kFirma = opcja("firma", "Firma: budynek na Ulicy");
    kOsoba.checked = true;
    var osoba = el("div", "ff-osoba", f), firma = el("div", "ff-firma", f);

    /* OSOBA: imię (te same reguły co w panelu), zgoda na imię (bez niej cegła bez imienia), podgląd cegły tą samą funkcją co mur, e-mail nieobowiązkowy. Bez logo, linku i progu. */
    var imie = pole("ff-imie", "Imię do muru (jedno słowo, może być z łącznikiem)", "text", { maxlength: "20", autocomplete: "given-name" }, osoba);
    var lzi = el("label", "ff-zgoda", osoba), zgodaImie = el("input", "", lzi); zgodaImie.type = "checkbox"; zgodaImie.id = "ff-zgoda-imie"; el("span", "", lzi, "Zgadzam się na moje imię w murze. Bez zaznaczenia cegła stanie bez imienia.");
    var podCegly = el("div", "ff-podglad-cegly", osoba), radaImie = el("p", "ff-rada", osoba), zegarC = 0;
    var emailOsoby = pole("ff-email-osoby", "E-mail (nieobowiązkowy, tylko do podziękowania, nie jest publiczny)", "email", { maxlength: "120", autocomplete: "email" }, osoba);
    /* Kwota (9.11): nieobowiązkowa, nigdy publicznie. Od 100 zł cegła w murze jest złota; decyduje i tak trener przy zatwierdzaniu. */
    var kwotaOsoby = pole("ff-kwota-osoby", "Kwota wpłaty, zł (nieobowiązkowa, nie jest publiczna; od 100 zł złota cegła)", "text", { maxlength: "12", inputmode: "decimal" }, osoba);
    function rysujCegle() {
      var A = g.BM_AKCJA, im = imie.value.trim(), ok = !im || poprawneImie(im);
      radaImie.textContent = ok ? "" : TEKST_IMIE;
      if (!A || !A.zUlica) return;
      A.zUlica(function (U) { if (U.podgladCegly) U.podgladCegly(podCegly, ok ? im : "", zgodaImie.checked).catch(function () {}); });
    }
    imie.addEventListener("input", function () { clearTimeout(zegarC); zegarC = setTimeout(rysujCegle, 150); });
    zgodaImie.addEventListener("change", rysujCegle);

    /* FIRMA: budynek z logo, jak dotąd. */
    var lr = el("label", "ff-pole", firma, "Budynek"), rodzaj = el("select", "", lr); rodzaj.id = "ff-rodzaj"; rodzaj.name = "rodzaj";
    var o1 = el("option", "", rodzaj, "Domek z logo, od " + zl(d.prog_domku_zl)); o1.value = "domek";
    var o2 = el("option", "", rodzaj, "Wieżowiec z logo, od " + zl(d.prog_wiezowca_zl)); o2.value = "wiezowiec";
    /* PODGLĄD ZARAZ POD WYBOREM BUDYNKU (9.11): widać go od razu po „Firma” i po zmianie budynku, bez nazwy i bez logo (szyld „Twoja firma”, pusta tablica).
       Wcześniej stał na dole formularza, pod zgodami, i pojawiał się dopiero po nazwie albo logo: na telefonie wyglądało to, jakby go nie było. */
    var podglad = el("div", "ff-podglad", firma), podPodpis = el("p", "ff-podglad-nazwa", firma), podRada = el("p", "ff-rada", firma), adresLogo = "", nrPodgladu = 0, zegarP = 0;
    var nazwa = pole("ff-nazwa", "Nazwa firmy", "text", { maxlength: "120", autocomplete: "organization" }, firma);
    var link = pole("ff-link", "Strona firmy", "url", { maxlength: "500", placeholder: "https://firma.pl", autocomplete: "url" }, firma);
    var email = pole("ff-email", "E-mail kontaktowy (nie jest publiczny)", "email", { maxlength: "120", autocomplete: "email" }, firma);
    var kwota = pole("ff-kwota", "Kwota wpłaty, zł", "text", { maxlength: "12", inputmode: "decimal", placeholder: String(d.prog_domku_zl || 100) }, firma);
    var logo = pole("ff-logo", "Logo: PNG, JPG, WebP, SVG albo zdjęcie z telefonu", "file", { accept: "image/*" }, firma);
    var lk = el("label", "ff-zgoda", firma), zk = el("input", "", lk); zk.type = "checkbox"; zk.id = "ff-zgoda-kwota"; el("span", "", lk, "Można pokazać kwotę przy firmie. Bez zaznaczenia kwotę widzi tylko organizator.");
    var lz = el("label", "ff-zgoda", firma), z = el("input", "", lz); z.type = "checkbox"; z.id = "ff-zgoda"; el("span", "", lz, "Zgadzam się na wymienienie firmy, jej logo i linku na stronach akcji. Mam prawo używać tego logo.");
    /* PODGLĄD NA ULICY (zgłoszenie 6.11; od 9.11 pod wyborem budynku): budynek z logo i nazwą z tej samej funkcji, która rysuje Ulicę (js/ulica-scena.mjs budynekFirmy),
       a logo przygotowane tak samo jak do wysyłki. Wszystko w przeglądarce: nic nie idzie na serwer przed „Wyślij”. Podpowiedź do logo nie blokuje wysyłki.
       Komunikat mówi, co zrobić (np. „Wyślij logo jako PNG lub JPG”), a gdy nie wyświetli się sam podgląd na budynku, zgłoszenie i tak przejdzie (zgłoszenie 6.11 wieczór). */
    podglad.hidden = true;
    function rysujPodglad(opcje) {
      var A = g.BM_AKCJA, n = nazwa.value.trim(), plikLogo = logo.files && logo.files[0], moj = ++nrPodgladu, pokaz = opcje && opcje.pokaz;
      if (firma.hidden) return;
      var bladLogo = "";
      (plikLogo ? przygotowany("logo", plikLogo, logoDoWyslania).then(function (b) { return g.URL.createObjectURL(b); }, function (e) { bladLogo = e && /^Logo/.test(e.message || "") ? e.message : "Logo: " + PROSBA; return ""; }) : Promise.resolve("")).then(function (u) {
        if (moj !== nrPodgladu) { if (u) g.URL.revokeObjectURL(u); return; }
        if (adresLogo) g.URL.revokeObjectURL(adresLogo);
        adresLogo = u;
        podRada.textContent = bladLogo;
        if (!A || !A.zUlica) return;
        A.zUlica(function (U) {
          if (!U.podgladFirmy || moj !== nrPodgladu) return;
          podglad.hidden = false; podRada.textContent = bladLogo;
          podPodpis.textContent = (n || "Twoja firma") + (rodzaj.value === "wiezowiec" ? " · wieżowiec" : " · domek");
          U.podgladFirmy(podglad, { nazwa: n || "Twoja firma", logo: u || null, rodzaj: rodzaj.value }, function (im, ciemny) {
            if (moj !== nrPodgladu) return;
            podRada.textContent = im ? U.ocenaLogo(im, ciemny).join(" ") : bladLogo || (plikLogo ? "Podgląd logo się nie wyświetlił, ale zgłoszenie możesz wysłać: organizator zobaczy plik." : "");
          }).then(function () {
            /* Po wyborze logo podgląd stoi wyżej niż pole logo: przewiń do niego, żeby było widać tablicę z logo. */
            if (pokaz && moj === nrPodgladu && podglad.scrollIntoView) { try { podglad.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {} }
          }, function () { podglad.hidden = true; });
        });
      });
    }
    nazwa.addEventListener("input", function () { clearTimeout(zegarP); zegarP = setTimeout(rysujPodglad, 200); });
    rodzaj.addEventListener("change", function () { rysujPodglad(); });
    logo.addEventListener("change", function () { if (!logo.files[0]) { bledyPlikow.logo = ""; odblokuj(); } rysujPodglad({ pokaz: true }); });

    /* WSPÓLNE: zrzut wpłaty (zostaje prywatny, kasowany po decyzji), pułapka na boty, informacja o danych. */
    var zrzut = pole("ff-zrzut", "Zrzut albo zdjęcie potwierdzenia wpłaty. Zamaż numer konta.", "file", { accept: "image/*" });
    var pulapka = el("label", "ff-pulapka", f, "Nie wypełniaj tego pola"); pulapka.setAttribute("aria-hidden", "true");
    var pp = el("input", "", pulapka); pp.name = "strona_www"; pp.type = "text"; pp.tabIndex = -1; pp.autocomplete = "off";
    el("p", "ff-rodo", f, "Administrator: BiegaMy. Dane służą do sprawdzenia zgłoszenia i kontaktu w jego sprawie. Zrzut wpłaty kasujemy po decyzji, najpóźniej po 14 dniach, a e-mail 30 dni po zakończeniu akcji.");
    var a = s.querySelector(".ff-rodo"); if (a) { var pr = el("a", "", a, " Polityka prywatności ›"); pr.href = "privacy.html#firmy"; }
    var wyslij = el("button", "ff-wyslij", f, "Wyślij zgłoszenie"); wyslij.type = "submit";
    var info = el("p", "ff-info", f); info.setAttribute("role", "status");

    /* PLIKI PRZYGOTOWANE PRZY WYBORZE (Filip 10.11, A2): logo i zrzut przechodzą przez logoDoWyslania/zrzutDoWyslania zaraz po wybraniu, a wynik czeka na „Wyślij”
       (podgląd i wysyłka używają tego samego bloba). Gdy przygotowanie padnie, przycisk jest zablokowany z komunikatem, aż ktoś wybierze inny plik: do sieci nigdy nie idzie
       plik, który nie przeszedł przez tę bramkę (oryginał tylko wtedy, gdy bramka go przepuści: PNG/JPG/WebP po bajtach do 2 MB). Awaria idzie do diagnostyki, bez pliku. */
    var gotowe = { logo: null, zrzut: null }, bledyPlikow = { logo: "", zrzut: "" };
    function przygotowany(pole, plik, fn) {
      var w = gotowe[pole];
      if (w && w.plik === plik) return w.obietnica;
      var obietnica = fn(plik).then(function (b) {
        if (gotowe[pole] && gotowe[pole].plik === plik) { bledyPlikow[pole] = ""; odblokuj(); }
        return b;
      }, function (e) {
        if (gotowe[pole] && gotowe[pole].plik === plik) { bledyPlikow[pole] = (e && e.message) || (pole === "logo" ? "Logo: " + PROSBA : "Zrzut wpłaty: nie udało się przygotować pliku."); diagnostyka(pole, plik, e); odblokuj(); }
        throw e;
      });
      gotowe[pole] = { plik: plik, obietnica: obietnica };
      return obietnica;
    }
    /** Przycisk „Wyślij” zablokowany, póki wybrany plik nie przeszedł bramki; komunikat o pliku stoi w info, dopóki ktoś nie wybierze innego. */
    function odblokuj() {
      var blad = (kOsoba.checked ? "" : bledyPlikow.logo) || bledyPlikow.zrzut;
      wyslij.disabled = !!blad;
      if (blad) info.textContent = blad; else if (/^(Logo|Zrzut wpłaty)/.test(info.textContent)) info.textContent = "";
    }
    /* Diagnostyka awarii przygotowania (bez pliku, bez danych osoby): nazwa i treść błędu, przyczyna, rozmiar, typ, rozszerzenie, wymiary z nagłówka. Funkcja firma-zgloszenie
       zapisuje to do client_errors (kind firma-plik); nadawca jest anonimowy, więc nie idzie przez _logKlienta (tylko zalogowani). Raz na plik, najwyżej 5 na stronę. */
    var zgloszone = {};
    function diagnostyka(pole, plik, e) {
      try {
        var klucz = pole + ":" + (plik.name || "") + ":" + plik.size;
        if (zgloszone[klucz] || Object.keys(zgloszone).length >= 5 || !g.fetch) return;
        zgloszone[klucz] = true;
        var d = (e && e.diag) || {}, dane = new g.FormData();
        dane.append("rodzaj", "diagnostyka"); dane.append("pole", pole); dane.append("blad", ((e && e.name) || "Error") + ": " + ((e && e.message) || ""));
        dane.append("przyczyna", String(d.przyczyna || "")); dane.append("rozmiar", String(plik.size || 0)); dane.append("typ", String(plik.type || ""));
        dane.append("rozszerzenie", String(d.rozszerzenie || "")); dane.append("rodzaj_pliku", String(d.rodzaj || "")); dane.append("wymiary", d.wymiary ? d.wymiary.w + "x" + d.wymiary.h : "");
        dane.append("strona_www", "");
        g.fetch((g.SB_URL || "") + EF, { method: "POST", body: dane, headers: g.SB_KEY ? { apikey: g.SB_KEY } : {}, keepalive: true }).catch(function () {});
      } catch (e2) {}
    }
    zrzut.addEventListener("change", function () { if (zrzut.files[0]) przygotowany("zrzut", zrzut.files[0], zrzutDoWyslania).catch(function () {}); else { bledyPlikow.zrzut = ""; odblokuj(); } });

    function ustawKto() { var o = kOsoba.checked; osoba.hidden = !o; firma.hidden = o; info.textContent = ""; if (o) rysujCegle(); else rysujPodglad(); odblokuj(); }
    kOsoba.addEventListener("change", ustawKto); kFirma.addEventListener("change", ustawKto);
    ustawKto();

    f.addEventListener("submit", function (e) {
      e.preventDefault();
      if (wyslij.disabled) return;   // plik nie przeszedł bramki (albo wysyłka trwa): Enter w polu też nic nie wysyła
      info.textContent = "";
      var M = g.BM_MODERACJA, slug = d.testowa === true ? "proba" : "dla-fabianka", zadanie;
      if (kOsoba.checked) {
        var im = imie.value.trim(), em = emailOsoby.value.trim();
        if (!poprawneImie(im)) { info.textContent = TEKST_IMIE; return; }
        if (!M) { info.textContent = "Filtr imion się nie wczytał. Odśwież stronę."; return; }
        if (!M.sprawdz(im, { rodzaj: "imie" }).ok) { info.textContent = "Tego imienia nie możemy przyjąć."; return; }
        if (em && !/^\S+@\S+\.\S+$/.test(em)) { info.textContent = "Podaj poprawny adres e-mail albo zostaw pole puste."; return; }
        var kw = kwotaOsoby.value.replace(/[\s\u00a0]/g, "").replace(/zł$/i, "");
        if (kw && !/^\d{1,7}([.,]\d{1,2})?$/.test(kw)) { info.textContent = "Kwota: podaj liczbę złotych (np. 100) albo zostaw pole puste."; return; }
        if (!zrzut.files[0]) { info.textContent = "Dodaj zrzut potwierdzenia wpłaty."; return; }
        wyslij.disabled = true; info.textContent = "Wysyłam…";
        zadanie = przygotowany("zrzut", zrzut.files[0], zrzutDoWyslania).then(function (zb) {
          var dane = new g.FormData();
          dane.append("slug", slug); dane.append("rodzaj", "cegielka"); dane.append("imie", im); if (zgodaImie.checked) dane.append("zgoda_imie", "tak"); if (em) dane.append("email", em); if (kw) dane.append("kwota", kw);
          dane.append("strona_www", pp.value); dane.append("zrzut", zb, "zrzut");
          return dane;
        });
      } else {
        var n = nazwa.value.trim();
        if (n.length < 2) { info.textContent = "Podaj nazwę firmy."; return; }
        if (M) { var fl = M.sprawdz(n, { rodzaj: "firma" }); if (!fl.ok && !fl.mozna_potwierdzic) { info.textContent = M.komunikat(fl); return; } }
        if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) { info.textContent = "Podaj poprawny adres e-mail."; return; }
        var kw = Number(String(kwota.value).replace(/[\s ]/g, "").replace(/zł$/i, "").replace(",", ".")), prog = Number(rodzaj.value === "wiezowiec" ? d.prog_wiezowca_zl : d.prog_domku_zl);
        if (!(kw > 0)) { info.textContent = "Podaj kwotę wpłaty w złotych."; return; }
        if (prog > 0 && kw < prog) { info.textContent = (rodzaj.value === "wiezowiec" ? "Wieżowiec" : "Domek") + " od " + zl(prog) + "."; return; }
        if (!logo.files[0]) { info.textContent = "Dodaj logo."; return; }
        if (!zrzut.files[0]) { info.textContent = "Dodaj zrzut potwierdzenia wpłaty."; return; }
        if (!z.checked) { info.textContent = "Zaznacz zgodę na wymienienie firmy."; return; }
        wyslij.disabled = true; info.textContent = "Wysyłam…";
        zadanie = Promise.all([przygotowany("logo", logo.files[0], logoDoWyslania), przygotowany("zrzut", zrzut.files[0], zrzutDoWyslania)]).then(function (w) {
          var dane = new g.FormData();
          dane.append("slug", slug); dane.append("rodzaj", rodzaj.value); dane.append("nazwa", n); dane.append("link", link.value.trim()); dane.append("email", email.value.trim()); dane.append("zgoda", "tak"); dane.append("kwota", kwota.value.trim()); if (zk.checked) dane.append("zgoda_kwota", "tak");
          dane.append("strona_www", pp.value); dane.append("logo", w[0], "logo"); dane.append("zrzut", w[1], "zrzut");
          return dane;
        });
      }
      /* Błędy rozdzielone (Filip 6.11): odpowiedź funkcji (jej komunikat albo kod HTTP), brak połączenia przy samym wysyłaniu i awaria przygotowania pliku.
         Przy dwóch ostatnich widać nazwę błędu, żeby zgłoszenie testera mówiło, co się stało. */
      var etap = "przygotowanie";
      zadanie.then(function (dane) {
        etap = "wysylka";
        return g.fetch((g.SB_URL || "") + EF, { method: "POST", body: dane, headers: g.SB_KEY ? { apikey: g.SB_KEY } : {} });
      }).then(function (r) {
        etap = "odpowiedz";
        return r.text().then(function (t) { var j = {}; try { j = JSON.parse(t) || {}; } catch (e) { j = {}; } return { ok: r.ok && j.ok === true, status: r.status, blad: j.blad }; });
      }).then(function (w) {
        wyslij.disabled = false;
        if (w.ok) {
          var bylaOsoba = kOsoba.checked;
          f.reset(); kOsoba.checked = bylaOsoba; kFirma.checked = !bylaOsoba; ustawKto();
          info.textContent = bylaOsoba ? "Dziękujemy! Sprawdzimy wpłatę i cegła stanie w murze po zatwierdzeniu." : "Dziękujemy! Sprawdzimy wpłatę i logo pojawi się na budynku po zatwierdzeniu.";
          return;
        }
        info.textContent = w.blad || ("Serwer nie przyjął zgłoszenia (kod " + w.status + "). Spróbuj za chwilę, a gdy się powtórzy, napisz do organizatora.");
      }).catch(function (e2) {
        wyslij.disabled = false;
        var tresc = (e2 && e2.message) || "", opis = ((e2 && e2.name) || "Error") + (tresc ? ": " + tresc : "");
        if (/^(Logo|Zrzut)/.test(tresc)) { info.textContent = tresc; odblokuj(); return; }   // plik nie przeszedł bramki: przycisk zostaje zablokowany do zmiany pliku
        info.textContent = etap === "wysylka" ? "Nie udało się wysłać: brak połączenia z serwerem (" + opis + "). Sprawdź internet i spróbuj jeszcze raz."
          : etap === "odpowiedz" ? "Nie udało się odczytać odpowiedzi serwera (" + opis + "). Spróbuj jeszcze raz."
          : "Nie udało się przygotować plików (" + opis + "). Wybierz pliki jeszcze raz albo zrób zrzut ekranu potwierdzenia.";
      });
    });
  }

  /* CEGIEŁKA W MURZE (zgłoszenie 6.11): osoba wpisuje imię i od razu widzi cegłę tak, jak stanie w murze (ta sama funkcja co Ulica).
     Tylko wtedy, gdy formularza nie ma (adres zamiast zgłoszeń): wpis dodaje trener po potwierdzeniu wpłaty, więc tu nic nie idzie na serwer. */
  function cegielka(s, adres) {
    var k = el("div", "ff-cegielka", s);
    el("h3", "", k, "Cegiełka z imieniem w murze");
    el("p", "", k, adres ? "Wpłać dowolną kwotę na zbiórkę i wyślij potwierdzenie wpłaty z imieniem na adres " + adres + ". Imię stanie w murze po sprawdzeniu i tylko za Twoją zgodą." : "Wpłać dowolną kwotę na zbiórkę i przekaż organizatorowi potwierdzenie wpłaty z imieniem. Imię stanie w murze po sprawdzeniu i tylko za Twoją zgodą.");
    var l = el("label", "ff-pole", k, "Imię do muru (podgląd, nic nie wysyłamy)"), i = el("input", "", l); i.id = "ff-imie"; i.type = "text"; i.maxLength = 20; i.autocomplete = "given-name";
    var pod = el("div", "ff-podglad-cegly", k), op = el("p", "ff-rada", k), zegar = 0;
    function rysuj() {
      var A = g.BM_AKCJA, im = i.value.trim();
      if (!A || !A.zUlica) return;
      A.zUlica(function (U) {
        if (!U.podgladCegly) return;
        var ok = !im || (U.poprawneImie && U.poprawneImie(im));
        U.podgladCegly(pod, ok ? im : "", true).catch(function () {});
        op.textContent = ok ? "" : "Imię do muru: jedno słowo, same litery, od 2 do 20 znaków, najwyżej jeden łącznik. Bez nazwiska.";
      });
    }
    i.addEventListener("input", function () { clearTimeout(zegar); zegar = setTimeout(rysuj, 150); });
    rysuj();
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
    el("h2", "", s, im ? "Twoja firma lub cegiełka na Ulicy " + im : "Twoja firma lub cegiełka na Ulicy");
    el("p", "", s, "Cegiełka z imieniem w murze za dowolną wpłatę. Firma: od " + zl(d.prog_domku_zl) + " domek z Twoim logo, od " + zl(d.prog_wiezowca_zl) + " wieżowiec.");
    var ol = el("ol", "", s);
    el("li", "", ol, "Wpłać na oficjalną zbiórkę.");
    el("li", "", ol, wlaczone ? "Wyślij zgłoszenie: zrzut potwierdzenia wpłaty i imię albo, dla firmy, logo, nazwę i link." : "Wyślij potwierdzenie wpłaty, logo PNG, nazwę, link i zgodę na adres " + adres + ".");
    el("li", "", ol, wlaczone ? "Po sprawdzeniu cegła stanie w murze, a logo na budynku." : "Logo pojawi się na budynku po sprawdzeniu.");
    el("p", "", s, "To podziękowanie, nie reklama. BiegaMy nie pośredniczy w pieniądzach.");
    if (wlaczone) formularz(s, d); else cegielka(s, adres);
    return true;
  }
  g.BM_FIRMA_FORMULARZ = { zamontuj: zamontuj, logoDoWyslania: logoDoWyslania, zrzutDoWyslania: zrzutDoWyslania, poprawneImie: poprawneImie };
})(globalThis);
