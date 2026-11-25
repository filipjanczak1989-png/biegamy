// NOWE DZIŚ (plan 13.11, plan E1 z 25.11) — etap E1, commit 1: szkielet i zasady. Ładowany przez blok DZIS-E0 1 w zawodnik.html
// WYŁĄCZNIE dla konta, któremu dzis_wersja() odpowiada „nowy”. Przełącznik służy widoczności, nie jest zabezpieczeniem.
// Co robi ten commit: nowy ekran ZASTĘPUJE stare Dziś (klasa dzis-gotowy uruchamia chowanie z bloku DZIS-E0 2): nagłówek z datą,
// Okienkiem i dzwonkiem, kafle w kolejności z makiety r5 jako szkielet (dane dojdą w commicie 2), skróty, link „stare Dziś ›”,
// menu z ikonami r5 i krążkiem Log. Jeszcze BEZ zapytań do bazy i bez pamięci telefonu: imię i licznik dzwonka bierze z tego,
// co stary kod już wpisał w stronę.
// Kiedy nowy ekran USTĘPUJE staremu (decyzje 13.11 i 25.11): podgląd trenera (?from=trener, do E8), #sponsor (formularz
// sponsora otwiera stary ekran), #log-list (historia Okienka). ?dzis=stary obsługuje blok DZIS-E0 1.
// Zgłoszenia: client_errors, kind 'dzis-nowy', w treści sam etap, raz na stronę, adres bez parametrów (wzór radia, blizna-355).
// Plik BEZ import/export (globalThis.BM_DZIS), jak js/ulica.mjs. Zmiana tego pliku = nowa stała MODUL_V w bloku DZIS-E0 1 (blizna-336).
(function (w, d) {
  "use strict";
  var ETAP = "E1", IKONY = "assets/ui/dzis/ikony/", owiniete = false, zgloszone = {}, obserwatorzy = false;
  var ETAPY = ["modul", "start", "render", "menu"];
  var MENU = { home: "dom", plan: "kalendarz", food: "jablko", forma: "wykres", social: "spolecznosc", profil: "profil" };
  var SKROTY = [["cialo", "Ciało", "hantla", "sekcja", "cwiczenia"], ["starty", "Starty", "flaga", "strona", "races.html"], ["wyzwania", "Wyzwania", "puchar", "strona", "wyzwania.html"],
    ["odznaki", "Odznaki", "medal", "strona", "odznaki.html"], ["radio", "Radio", "radio", "strona", "radio.html"], ["czat", "Czat", "dymek", "sekcja", "msgs"], ["gra", "Gra", "pad", "strona", "gra.html"]];
  var KAFLE = [["ulica", "Ulica"], ["trening", "Trening na dziś"], ["skroty", ""], ["ostatni", "Ostatni trening"], ["lista", "Twoje ostatnie treningi"]];

  function korzen() { return d.getElementById("dzis-nowy"); }
  function html() { return d.documentElement; }
  function wlaczone() { return html().classList.contains("dzis-nowy"); }
  function naDzis() { var s = w._currentSection; return !s || s === "home"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /** client_errors, kind 'dzis-nowy': sam etap, każdy raz na załadowanie strony, adres bez parametrów. Nigdy nie rzuca. */
  function zglos(etap) {
    try {
      if (ETAPY.indexOf(etap) < 0 || zgloszone[etap]) return false;
      zgloszone[etap] = true;
      if (typeof w._logKlienta === "function") w._logKlienta({ kind: "dzis-nowy", message: etap, url: w.location.pathname });
      return true;
    } catch (e) { return false; }
  }

  /** Powód, dla którego ta sesja zostaje na starym ekranie, albo "" (nowy ekran). */
  function ustepuje() {
    try {
      var p = new URLSearchParams(w.location.search || "");
      if (p.get("from") === "trener") return "trener";
      var h = String(w.location.hash || "");
      if (h === "#sponsor") return "sponsor";
      if (h === "#log-list") return "historia";
    } catch (e) {}
    return "";
  }

  function ikona(nazwa, px, klasa) {
    return '<img class="dn-ik' + (klasa ? " " + klasa : "") + '" src="' + IKONY + nazwa + '-64.webp" srcset="' + IKONY + nazwa + "-64.webp 64w, " + IKONY + nazwa + '-128.webp 128w" sizes="' + px +
      'px" width="' + px + '" height="' + px + '" alt="" aria-hidden="true" decoding="async" onerror="this.style.visibility=\'hidden\'">';
  }

  var CSS = "#dzis-nowy{padding:4px 16px 8px;color:#f5f3ef;font-family:'DM Sans',system-ui,sans-serif}" +
    "#dzis-nowy .dn-naglowek{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:6px 0 14px}" +
    "#dzis-nowy .dn-data{font:500 11px/1.4 'DM Mono',monospace;letter-spacing:.22em;text-transform:uppercase;color:#bcb8b2}" +
    "#dzis-nowy .dn-powitanie{margin:2px 0 0;font:400 34px/1 'Bebas Neue','DM Sans',sans-serif;letter-spacing:.02em;text-transform:uppercase;color:#f5f3ef;overflow-wrap:anywhere}" +
    "#dzis-nowy .dn-akcje{display:flex;gap:8px;flex:none}" +
    "#dzis-nowy .dn-okr{position:relative;width:48px;height:48px;border-radius:50%;border:1px solid #2a2a30;background:#0f0f13;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}" +
    "#dzis-nowy .dn-okr:active{transform:scale(.96)}" +
    "#dzis-nowy .dn-licznik{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#c44a13;color:#fff;font:700 11px/20px 'DM Sans',sans-serif;text-align:center}" +
    "#dzis-nowy .dn-licznik[hidden]{display:none}" +
    "#dzis-nowy .dn-kafle{display:flex;flex-direction:column;gap:12px}" +
    "#dzis-nowy .dn-kafel{background:#0f0f13;border:1px solid #232329;border-radius:18px;padding:16px}" +
    "#dzis-nowy .dn-etykieta{font:500 11px/1.4 'DM Mono',monospace;letter-spacing:.2em;text-transform:uppercase;color:#ff7a45;margin:0 0 12px}" +
    "#dzis-nowy .dn-szkielet{display:block;height:14px;border-radius:7px;background:#1b1b21;margin:0 0 10px}" +
    "#dzis-nowy .dn-szkielet.k{width:55%}#dzis-nowy .dn-szkielet.w{height:44px;margin:14px 0 0}" +
    "#dzis-nowy .dn-skroty{display:flex;gap:6px;overflow-x:auto;padding:2px 0;scrollbar-width:none}" +
    "#dzis-nowy .dn-skroty::-webkit-scrollbar{display:none}" +
    "#dzis-nowy .dn-skrot{flex:1 0 56px;min-height:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:none;border:0;padding:4px 0;" +
    "color:#bcb8b2;font:500 11px/1.2 'DM Sans',sans-serif;text-decoration:none;cursor:pointer}" +
    "#dzis-nowy .dn-skrot .dn-krazek{width:48px;height:48px;border-radius:50%;background:#0f0f13;border:1px solid #232329;display:flex;align-items:center;justify-content:center}" +
    "#dzis-nowy .dn-stare{display:flex;align-items:center;justify-content:center;min-height:48px;margin:6px 0 0;color:#bcb8b2;font:500 13px/1 'DM Sans',sans-serif;text-decoration:none}" +
    "#dzis-nowy .dn-ukryte{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}" +
    "html.dzis-gotowy.dzis-na-dzis body > .topbar,html.dzis-gotowy.dzis-na-dzis body > #okienko-pole{display:none!important}" +
    "html.dzis-gotowy #nav-mount .dn-ik{display:block;margin:0 auto}" +
    "html.dzis-gotowy #nav-mount .dn-log{width:52px;height:52px;margin:-20px auto 0;border-radius:50%;background:#c44a13;border:2px solid #3a1d0a;box-shadow:0 3px 0 #3a1d0a;display:flex;align-items:center;justify-content:center}" +
    "html.dzis-gotowy #nav-mount .dn-log img{width:26px;height:26px;display:block}" +
    "@media (prefers-reduced-motion:reduce){#dzis-nowy .dn-okr:active{transform:none}}";

  function wstawCss() {
    if (d.getElementById("dzis-nowy-css")) return;
    var s = d.createElement("style"); s.id = "dzis-nowy-css"; s.textContent = CSS;
    d.head.appendChild(s);
  }

  var DNI = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
  var MIESIACE = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  /** „środa · 25 listopada” z LOKALNEJ daty telefonu (nie UTC). */
  function dataDzis(teraz) { var t = teraz || new Date(); return DNI[t.getDay()] + " · " + t.getDate() + " " + MIESIACE[t.getMonth()]; }

  /** Imię z paska starego ekranu (stary kod wpisuje je po wczytaniu konta); „—” i pusty = samo „Cześć”. */
  function imie() {
    var el = d.getElementById("topbar-name"), t = el ? String(el.textContent || "").trim() : "";
    return t && t !== "—" ? t.split(/\s+/)[0] : "";
  }
  function powitanie() { var i = imie(); return i ? "Cześć, " + i : "Cześć"; }
  /** Licznik dzwonka: lustro kropki starego dzwonka (liczbę liczy stary kod). */
  function licznikDzwonka() {
    var el = d.getElementById("zawodnik-bell-dot");
    if (!el || (el.style && el.style.display === "none")) return "";
    return String(el.textContent || "").trim();
  }

  function szkieletHtml() {
    var kafle = KAFLE.map(function (k) {
      if (k[0] === "skroty") {
        return '<nav class="dn-skroty" data-kafel="skroty" aria-label="Skróty">' + SKROTY.map(function (s) {
          return (s[3] === "strona" ? '<a class="dn-skrot" href="' + s[4] + '"' : '<button type="button" class="dn-skrot" data-sekcja="' + s[4] + '"') + ' data-skrot="' + s[0] + '">' +
            '<span class="dn-krazek">' + ikona(s[2], 28) + "</span><span>" + esc(s[1]) + "</span>" + (s[3] === "strona" ? "</a>" : "</button>");
        }).join("") + "</nav>";
      }
      return '<section class="dn-kafel" data-kafel="' + k[0] + '" aria-busy="true"><h2 class="dn-etykieta">' + esc(k[1]) + '</h2>' +
        '<span class="dn-szkielet"></span><span class="dn-szkielet k"></span>' + (k[0] === "trening" ? '<span class="dn-szkielet w"></span>' : "") +
        '<span class="dn-ukryte">Wczytuję…</span></section>';
    }).join("");
    return '<header class="dn-naglowek"><div><div class="dn-data" data-dn="data">' + esc(dataDzis()) + '</div><h1 class="dn-powitanie" data-dn="powitanie">' + esc(powitanie()) + "</h1></div>" +
      '<div class="dn-akcje"><button type="button" class="dn-okr" data-dn="okienko" aria-label="Zapytaj">' + ikona("okienko", 28) + "</button>" +
      '<button type="button" class="dn-okr" data-dn="dzwonek" aria-label="Powiadomienia">' + ikona("dzwonek", 28) + '<span class="dn-licznik" data-dn="licznik" hidden></span></button></div></header>' +
      '<div class="dn-kafle">' + kafle + "</div>" +
      '<a class="dn-stare" href="zawodnik.html?dzis=stary">stare Dziś ›</a>';
  }

  function odswiezNaglowek() {
    var k = korzen(); if (!k || !k.querySelector) return;
    var p = k.querySelector('[data-dn="powitanie"]'), da = k.querySelector('[data-dn="data"]'), l = k.querySelector('[data-dn="licznik"]');
    if (p) p.textContent = powitanie();
    if (da) da.textContent = dataDzis();
    if (l) { var n = licznikDzwonka(); l.textContent = n; l.hidden = !n; }
  }

  /** Jedno delegowane kliknięcie na korzeniu: Okienko i dzwonek wołają to, co stary ekran; skróty-sekcje wołają showSection. */
  function klik(e) {
    var t = e && e.target && e.target.closest ? e.target.closest("[data-dn],[data-sekcja]") : null;
    if (!t) return;
    try {
      var co = t.getAttribute("data-dn"), sekcja = t.getAttribute("data-sekcja");
      if (co === "okienko") { var pole = d.getElementById("okienko-pole"); if (pole && pole.click) pole.click(); }
      else if (co === "dzwonek") { if (typeof w.openNotifications === "function") w.openNotifications(); }
      else if (sekcja && typeof w.showSection === "function") w.showSection(sekcja);
    } catch (err) { zglos("render"); }
  }

  /** Menu r5: ikony z kompletu w miejscu konturowych, Log jako pomarańczowy krążek ze znakiem B. Odwracalne (menu(false)). */
  function menu(wl) {
    try {
      var nav = d.getElementById("nav-mount");
      if (!nav || !nav.querySelectorAll) return;
      var poz = nav.querySelectorAll("a.nav-it[data-navid]");
      for (var i = 0; i < poz.length; i++) {
        var a = poz[i], id = a.getAttribute("data-navid"), ik = a.firstElementChild;
        if (!ik) continue;
        if (wl && !a.hasAttribute("data-dn-menu")) {
          var nowa = id === "log" ? '<span class="dn-log"><img src="assets/ui/logo-b-biale-alfa.webp" alt=""></span>' : (MENU[id] ? ikona(MENU[id], 26) : "");
          if (!nowa) continue;
          a._dnOryg = ik.outerHTML;
          ik.outerHTML = nowa;
          a.setAttribute("data-dn-menu", "1");
        } else if (!wl && a.hasAttribute("data-dn-menu")) {
          if (a._dnOryg) ik.outerHTML = a._dnOryg;
          a.removeAttribute("data-dn-menu");
        }
      }
    } catch (e) { zglos("menu"); }
  }

  /** Korzeń i chowanie starego Dziś tylko przy włączonym przełączniku, na sekcji Dziś i gdy nowy ekran nie ustępuje. */
  function pokaz() {
    var k = korzen(), aktywny = wlaczone() && !ustepuje(), widac = aktywny && naDzis();
    html().classList[aktywny ? "add" : "remove"]("dzis-gotowy");
    html().classList[widac ? "add" : "remove"]("dzis-na-dzis");
    if (k) k.hidden = !widac;
    menu(aktywny);
    if (widac) odswiezNaglowek();
  }

  function obserwuj() {
    if (obserwatorzy || typeof w.MutationObserver !== "function") return;
    obserwatorzy = true;
    ["topbar-name", "zawodnik-bell-dot"].forEach(function (id) {
      var el = d.getElementById(id);
      if (el) new w.MutationObserver(function () { try { odswiezNaglowek(); } catch (e) {} }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
    });
    var nav = d.getElementById("nav-mount");   // stary kod rysuje menu od nowa (NAV.render) → ikony r5 wracają same
    if (nav) new w.MutationObserver(function () { try { if (html().classList.contains("dzis-gotowy")) menu(true); } catch (e) {} }).observe(nav, { childList: true });
  }

  function start() {
    try {
      var k = korzen();
      if (!k) { zglos("start"); return; }
      if (ustepuje()) { pokaz(); return; }
      wstawCss();
      if (k.getAttribute("data-etap") !== ETAP) {
        try { k.innerHTML = szkieletHtml(); } catch (e) { zglos("render"); throw e; }
        k.setAttribute("data-etap", ETAP);
        if (k.addEventListener && !k._dnKlik) { k.addEventListener("click", klik); k._dnKlik = true; }
      }
      if (!owiniete && typeof w.showSection === "function") {
        var oryg = w.showSection;
        w.showSection = function () { var r = oryg.apply(this, arguments); try { pokaz(); } catch (e) {} return r; };
        owiniete = true;
      }
      obserwuj();
      pokaz();
    } catch (e) { zglos("start"); stop(); throw e; }   // blok DZIS-E0 1 łapie wyjątek i wraca do starego ekranu
  }
  /** Powrót do starego ekranu: korzeń ukryty, stare Dziś i stare menu odsłonięte. */
  function stop() {
    var k = korzen(); if (k) k.hidden = true;
    html().classList.remove("dzis-gotowy"); html().classList.remove("dzis-na-dzis");
    menu(false);
  }
  w.BM_DZIS = { etap: ETAP, start: start, stop: stop, zglos: zglos, ustepuje: ustepuje, dataDzis: dataDzis, ETAPY: ETAPY, SKROTY: SKROTY, KAFLE: KAFLE, MENU: MENU };
})(window, document);
