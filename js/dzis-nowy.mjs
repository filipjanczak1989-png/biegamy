// NOWE DZIŚ (plan 13.11, plan E1 z 25.11) — etap E1: szkielet, zasady (commit 1) i dane w falach (commit 2). Ładowany przez blok DZIS-E0 1 w zawodnik.html
// WYŁĄCZNIE dla konta, któremu dzis_wersja() odpowiada „nowy”. Przełącznik służy widoczności, nie jest zabezpieczeniem.
// Co robi ten commit: nowy ekran ZASTĘPUJE stare Dziś (klasa dzis-gotowy uruchamia chowanie z bloku DZIS-E0 2): nagłówek z datą,
// Okienkiem i dzwonkiem, kafle w kolejności z makiety r5 jako szkielet (dane dojdą w commicie 2), skróty, link „stare Dziś ›”,
// menu z ikonami r5 i krążkiem Log. Licznik dzwonka bierze z tego, co stary kod już wpisał w stronę.
// DANE (commit 2): moduł nie czeka na stary kod. Dwie fale, razem 5 zapytań (blizna-357 pilnuje liczby):
//   fala 1 (od razu po sesji, równolegle): profil zawodnika RAZ (BM_DZIS.profil() oddaje tę samą obietnicę), akcja_licznik, akcja_moj_wklad;
//   fala 2 (po id zawodnika, równolegle): trening na dziś, sześć ostatnich wpisów (pierwszy = „Ostatni trening”, reszta = lista od przedostatniego).
//   Konto próby akcji (inny slug niż domyślny) dokłada w fali 2 dwa zapytania o swoją akcję. Bez pamięci telefonu: nic nie zapisuje.
//   Ponowne start() (initAuth, powrót do aplikacji) nie pyta drugi raz przez 60 s. Zapytanie bez odpowiedzi w 10 s = błąd kafla.
// Kiedy nowy ekran USTĘPUJE staremu (decyzje 13.11 i 25.11): podgląd trenera (?from=trener, do E8), #sponsor (formularz
// sponsora otwiera stary ekran), #log-list (historia Okienka). ?dzis=stary obsługuje blok DZIS-E0 1.
// Zgłoszenia: client_errors, kind 'dzis-nowy', w treści sam etap, raz na stronę, adres bez parametrów (wzór radia, blizna-355).
// Plik BEZ import/export (globalThis.BM_DZIS), jak js/ulica.mjs. Zmiana tego pliku = nowa stała MODUL_V w bloku DZIS-E0 1 (blizna-336).
(function (w, d) {
  "use strict";
  var ETAP = "E1", IKONY = "assets/ui/dzis/ikony/", owiniete = false, zgloszone = {}, obserwatorzy = false;
  var ETAPY = ["modul", "start", "render", "menu", "klient", "profil", "akcja", "trening", "wpisy"];
  var LIMIT_MS = 10000, SWIEZE_MS = 60000, ILE_WPISOW = 6, PLAN = "kalendarz.html?role=athlete";
  var WOLNE = ["Odpoczynek", "Wolne", "Dzień wolny", "Rest"];
  var dane = { t: 0, nr: 0, profil: null, imie: "" }, wstrzymane = false, czekaNaDom = false;
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
    "#dzis-nowy [hidden]{display:none!important}" +
    "#dzis-nowy .dn-gora{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:0 0 12px}#dzis-nowy .dn-gora .dn-etykieta{margin:0}" +
    "#dzis-nowy .dn-kto{margin:4px 0 0;color:#bcb8b2;font:500 13px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-link{flex:none;display:inline-flex;align-items:center;min-height:44px;margin:-14px -4px -14px 0;padding:0 4px;color:#ff7a45;font:600 13px/1 'DM Sans',sans-serif;text-decoration:none}" +
    "#dzis-nowy .dn-tytul{margin:0 0 6px;font:400 26px/1.05 'Bebas Neue','DM Sans',sans-serif;letter-spacing:.02em;text-transform:uppercase;color:#f5f3ef}" +
    "#dzis-nowy .dn-tekst{margin:0;color:#bcb8b2;font:400 14px/1.45 'DM Sans',sans-serif;overflow-wrap:anywhere}#dzis-nowy .dn-tekst b{color:#f5f3ef;font-weight:600}" +
    "#dzis-nowy .dn-ul-km{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}#dzis-nowy .dn-ul-km b{font:400 40px/1 'Bebas Neue','DM Sans',sans-serif;letter-spacing:.02em;color:#f5f3ef}" +
    "#dzis-nowy .dn-ul-km span{color:#bcb8b2;font:500 13px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-pasek{height:8px;border-radius:4px;background:#1b1b21;overflow:hidden;margin:10px 0}#dzis-nowy .dn-pasek i{display:block;height:100%;border-radius:4px;background:#c44a13}" +
    "#dzis-nowy .dn-plan{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap;margin:0 0 8px}#dzis-nowy .dn-tekst + .dn-plan,#dzis-nowy .dn-plan + .dn-plan,#dzis-nowy .dn-tekst + .dn-tytul{margin-top:14px}" +
    "#dzis-nowy .dn-typ{display:inline-block;padding:4px 10px;border-radius:999px;background:#1b1b21;color:#f5f3ef;font:600 12px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-cel{color:#f5f3ef;font:600 15px/1.3 'DM Sans',sans-serif}#dzis-nowy .dn-zrobione{color:#6fcf97;font:600 12px/1.3 'DM Sans',sans-serif}" +
    "#dzis-nowy .dn-liczby{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}#dzis-nowy .dn-l{min-width:0}" +
    "#dzis-nowy .dn-l b{display:block;font:400 26px/1 'Bebas Neue','DM Sans',sans-serif;letter-spacing:.02em;color:#f5f3ef;white-space:nowrap}" +
    "#dzis-nowy .dn-l b small{margin-left:3px;font:500 10px/1 'DM Mono',monospace;color:#bcb8b2;letter-spacing:.04em}#dzis-nowy .dn-l b.dn-slowo{font:600 14px/1.85 'DM Sans',sans-serif;letter-spacing:0}" +
    "#dzis-nowy .dn-l span{display:block;margin-top:5px;font:500 10px/1 'DM Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#8f8c97}" +
    "#dzis-nowy .dn-wiersze{list-style:none;margin:0;padding:0}#dzis-nowy .dn-wiersz{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid #232329}" +
    "#dzis-nowy .dn-wiersz:first-child{border-top:0;padding-top:0}#dzis-nowy .dn-wiersz:last-child{padding-bottom:0}" +
    "#dzis-nowy .dn-w-co{min-width:0;color:#f5f3ef;font:600 14px/1.3 'DM Sans',sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    "#dzis-nowy .dn-w-co small{display:block;margin-top:3px;color:#8f8c97;font:500 11px/1.2 'DM Mono',monospace;letter-spacing:.06em}" +
    "#dzis-nowy .dn-w-ile{flex:none;color:#bcb8b2;font:500 13px/1.3 'DM Sans',sans-serif;text-align:right;white-space:nowrap}#dzis-nowy .dn-w-ile b{color:#f5f3ef;font-weight:600}" +
    "#dzis-nowy .dn-ponow{min-height:44px;margin:10px 0 0;padding:0 16px;border-radius:12px;border:1px solid #2a2a30;background:#16161b;color:#f5f3ef;font:600 14px/1 'DM Sans',sans-serif;cursor:pointer}" +
    "@media (max-width:359px){#dzis-nowy .dn-liczby{grid-template-columns:1fr 1fr;gap:12px 8px}}" +
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

  /** Imię z profilu (fala 1), a zanim dojdzie: z paska starego ekranu; „—” i pusty = samo „Cześć”. */
  function imie() {
    var el = d.getElementById("topbar-name"), t = String(dane.imie || "").trim() || (el ? String(el.textContent || "").trim() : "");
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
      else if (co === "ponow") { rysuj(); odswiezNaglowek(); wczytaj(true); }
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
    var k = korzen(), aktywny = wlaczone() && !ustepuje() && !wstrzymane, widac = aktywny && naDzis();
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

  /* ── DANE ───────────────────────────────────────────────────────────────────────────────────────────────── */
  function liczba(n, m) { n = Number(n); if (!isFinite(n)) return "—"; var t = n.toFixed(m || 0).split("."), ul = (t[1] || "").replace(/0+$/, ""); return t[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (ul ? "," + ul : ""); }
  function km(x) { var n = Number(x); return isFinite(n) && n > 0 ? liczba(n, n < 10 ? 2 : 1) : "—"; }
  /** Czas z bazy ("h:mm:ss" albo "mm:ss") → "1:02:15" / "48:10"; inny zapis = „—”. */
  function czas(t) {
    if (!/^\d{1,3}:\d{2}(:\d{2})?$/.test(String(t || ""))) return "—";
    var s = String(t).split(":").reduce(function (a, b) { return a * 60 + Number(b); }, 0); if (!(s > 0)) return "—";
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sek = s % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (sek < 10 ? "0" : "") + sek;
  }
  /** Tempo z bazy ("5:12", ręcznie bywa "5:12/km") → "5:12". */
  function tempo(p) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(p || "")); if (!m) return "—";
    var s = Number(m[1]) * 60 + Number(m[2]); return s > 0 ? Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60) : "—";
  }
  /** Klucz dnia z LOKALNEGO zegara telefonu (kolumna trainings.date). */
  function kluczDnia(t) { t = t || new Date(); return t.getFullYear() + "-" + (t.getMonth() < 9 ? "0" : "") + (t.getMonth() + 1) + "-" + (t.getDate() < 10 ? "0" : "") + t.getDate(); }
  /** Ile dni kalendarzowych temu (lokalnie) był wpis; null przy złej dacie. */
  function dniTemu(iso, teraz) {
    var a = new Date(iso), t = teraz || new Date(); if (isNaN(a.getTime())) return null;
    return Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
  }
  /** Reguła 14 dni (Filip 25.11): do 14 dni „dziś / wczoraj / N dni temu”, starszy „X tygodni temu”, od 52 tygodni „ponad rok temu”. */
  function kiedy(iso, teraz) {
    var n = dniTemu(iso, teraz); if (n == null) return "";
    if (n <= 0) return "dziś"; if (n === 1) return "wczoraj"; if (n <= 14) return n + " dni temu";
    var t = Math.floor(n / 7); if (t >= 52) return "ponad rok temu";
    return t + (t % 10 >= 2 && t % 10 <= 4 && (t % 100 < 12 || t % 100 > 14) ? " tygodnie temu" : " tygodni temu");
  }
  var DNI_KR = ["nd", "pn", "wt", "śr", "cz", "pt", "sb"];
  function dzienKrotko(iso) { var a = new Date(iso); return isNaN(a.getTime()) ? "" : DNI_KR[a.getDay()] + " " + a.getDate() + "." + (a.getMonth() < 9 ? "0" : "") + (a.getMonth() + 1); }
  function pigulka(typ) { var t = String(typ || "Trening"); return typeof w.renderTypePill === "function" ? w.renderTypePill(t) : '<span class="dn-typ">' + esc(t) + "</span>"; }
  function gora(etykieta, kto, link) {
    return '<div class="dn-gora"><div><h2 class="dn-etykieta">' + esc(etykieta) + "</h2>" + (kto ? '<div class="dn-kto">' + esc(kto) + "</div>" : "") + "</div>" +
      (link ? '<a class="dn-link" href="' + esc(link[1]) + '">' + esc(link[0]) + " ›</a>" : "") + "</div>";
  }
  function wkladTekst(wklad) {
    if (!wklad) return "";
    var k = Number(wklad.km) || 0;
    return k > 0 ? "Twój wkład: <b>" + esc(liczba(k, k < 10 ? 1 : 0)) + " km</b>" : "Twój wkład: <b>0 km</b>. Spacer też buduje ulicę.";
  }
  /** Kafel Ulica: licznik akcji. d = akcja_licznik (po starcie), wklad = akcja_moj_wklad albo null. */
  function ulicaHtml(d, wklad, adres) {
    var suma = Number(d.suma_km) || 0, cel = Number(d.cel_km) || 0, p = Number(d.pct);
    p = Math.max(0, Math.min(100, isFinite(p) ? p : cel > 0 ? suma / cel * 100 : 0));
    return gora("Ulica", d.nazwa || "", adres ? ["Zobacz ulicę", adres] : null) +
      '<div class="dn-ul-km"><b>' + esc(liczba(suma, suma > 0 && suma < 10 ? 1 : 0)) + "</b><span>z " + esc(liczba(cel, 0)) + " km · " + esc(liczba(p, p < 10 ? 1 : 0)) + "%</span></div>" +
      '<div class="dn-pasek" role="progressbar" aria-label="Postęp ulicy" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(p) + '"><i style="width:' + p.toFixed(1) + '%"></i></div>' +
      '<p class="dn-tekst" data-dn="wklad">' + wkladTekst(wklad) + "</p>";
  }
  /** Kafel Trening na dziś, tylko do odczytu (działania wejdą w E4–E5). lista = wiersze trainings z dzisiejszą datą. */
  function treningHtml(lista) {
    lista = lista || [];
    if (!lista.length) return gora("Trening na dziś", "bez planu", ["Plan", PLAN]) + '<h3 class="dn-tytul">Dziś bez planu</h3><p class="dn-tekst">Każdy kilometr i tak się liczy.</p>';
    var kto = lista[0].plan_source === "generator" ? "z generatora" : lista[0].coach_id ? "od trenera" : "";
    return gora("Trening na dziś", kto, ["Plan", PLAN]) + lista.map(function (t) {
      if (WOLNE.indexOf(String(t.type || "").trim()) >= 0) return '<h3 class="dn-tytul">Dzień wolny</h3><p class="dn-tekst">' + esc(t.description || "Odpoczynek też buduje formę.") + "</p>";
      var cel = [], opis = String(t.description || "");
      if (Number(t.distance_km) > 0) cel.push(km(t.distance_km) + " km");
      if (Number(t.duration_min) > 0) cel.push(liczba(t.duration_min) + " min");
      if (tempo(t.pace) !== "—") cel.push(tempo(t.pace) + " /km");
      return '<div class="dn-plan">' + pigulka(t.type) + (cel.length ? '<span class="dn-cel">' + esc(cel.join(" · ")) + "</span>" : "") + (t.status === "done" ? '<span class="dn-zrobione">zrobione</span>' : "") + "</div>" +
        (opis ? '<p class="dn-tekst">' + esc(opis.length > 160 ? opis.slice(0, 157) + "…" : opis) + "</p>" : "");
    }).join("");
  }
  function liczbyWpisu(l) {
    var czwarta = Number(l.heart_rate) > 0 ? [liczba(l.heart_rate), "bpm", "tętno śr."] : Number(l.elevation_gain) > 0 ? [liczba(l.elevation_gain), "m", "w górę"] : [l.feel ? String(l.feel) : "—", "", "odczucie", !!l.feel];
    return [[km(l.distance_km), "km", "dystans"], [czas(l.duration), "", "czas"], [tempo(l.pace), "/km", "tempo"], czwarta];
  }
  /** Kafel Ostatni trening: najnowszy wpis, z regułą 14 dni w podpisie. */
  function ostatniHtml(log, teraz) {
    if (!log) return gora("Ostatni trening", "", null) + '<h3 class="dn-tytul">Jeszcze pusto</h3><p class="dn-tekst">Tu pojawi się dystans, czas i tempo pierwszego treningu.</p>';
    var kd = kiedy(log.logged_at, teraz);
    return gora("Ostatni trening", String(log.training_type || "Trening") + (kd ? " · " + kd : ""), null) +
      '<div class="dn-liczby">' + liczbyWpisu(log).map(function (x) { return '<div class="dn-l"><b' + (x[3] ? ' class="dn-slowo"' : "") + ">" + esc(x[0]) + (x[1] && x[0] !== "—" ? "<small>" + esc(x[1]) + "</small>" : "") + "</b><span>" + esc(x[2]) + "</span></div>"; }).join("") + "</div>";
  }
  /** Kafel Twoje ostatnie treningi: wpisy od przedostatniego (najnowszy stoi w kaflu wyżej). */
  function listaHtml(wpisy) {
    return gora("Twoje ostatnie treningi", "", null) + '<ul class="dn-wiersze">' + (wpisy || []).map(function (l) {
      var ile = [km(l.distance_km) !== "—" ? "<b>" + esc(km(l.distance_km)) + " km</b>" : "", czas(l.duration) !== "—" ? esc(czas(l.duration)) : "", tempo(l.pace) !== "—" ? esc(tempo(l.pace)) + " /km" : ""].filter(Boolean);
      return '<li class="dn-wiersz"><span class="dn-w-co">' + esc(l.training_type || "Trening") + "<small>" + esc(dzienKrotko(l.logged_at)) + '</small></span><span class="dn-w-ile">' + (ile.join(" · ") || "—") + "</span></li>";
    }).join("") + "</ul>";
  }

  function kafel(n) { var k = korzen(); return k && k.querySelector ? k.querySelector('[data-kafel="' + n + '"]') : null; }
  function wpisz(n, html) { var el = kafel(n); if (!el) return; el.innerHTML = html; el.hidden = false; if (el.removeAttribute) el.removeAttribute("aria-busy"); }
  function schowaj(n) { var el = kafel(n); if (el) { el.hidden = true; if (el.removeAttribute) el.removeAttribute("aria-busy"); } }
  function bladKafla(n, etykieta) { wpisz(n, gora(etykieta, "", null) + '<p class="dn-tekst">Nie udało się wczytać.</p><button type="button" class="dn-ponow" data-dn="ponow">Spróbuj ponownie</button>'); }
  /** Błąd danych: przy braku sieci telefon o tym wie i wpis do client_errors nic by nie dał. */
  function zglosDane(etap) { if (w.navigator && w.navigator.onLine === false) return; zglos(etap); }
  function klient() { return w.sb && typeof w.sb.rpc === "function" && typeof w.sb.from === "function" && w.sb.auth ? w.sb : null; }
  function slugAkcji(id) { var c = w.BM_AKCJA_CYTATY; try { return c && typeof c.slugDla === "function" ? String(c.slugDla(id || null) || "") : ""; } catch (e) { return ""; } }
  /** Zapytanie supabase-js → obietnica samych danych; { error } i brak odpowiedzi w LIMIT_MS to odrzucenie. */
  function pytaj(q) {
    return new Promise(function (ok, zle) {
      var t = w.setTimeout(function () { zle(new Error("limit")); }, LIMIT_MS);
      Promise.resolve(q).then(function (r) { w.clearTimeout(t); if (r && r.error) zle(r.error); else ok(r ? r.data : null); }, function (e) { w.clearTimeout(t); zle(e); });
    });
  }
  /** Dwa zapytania o akcję (licznik, mój wkład) wysłane od razu; pokaz() rysuje kafel, gdy wiadomo, że to akcja tego konta. */
  function akcja(sb, nr, slug, domyslny) {
    var adres = domyslny + ".html" + (slug !== domyslny ? "?" + encodeURIComponent(slug) + "=1" : "") + "#ulica-po";
    var pL = pytaj(sb.rpc("akcja_licznik", { p_slug: slug })), pW = pytaj(sb.rpc("akcja_moj_wklad", { p_slug: slug })).then(null, function () { return null; });
    pL.then(null, function () {});
    return { pokaz: function () {
      pL.then(function (dn) {
        if (nr !== dane.nr) return;
        if (!dn || !dn.wystartowala) { schowaj("ulica"); return; }
        wpisz("ulica", ulicaHtml(dn, null, adres));
        pW.then(function (wk) { if (nr !== dane.nr) return; var el = kafel("ulica"), p = el && el.querySelector ? el.querySelector('[data-dn="wklad"]') : null; if (p) p.innerHTML = wkladTekst(wk); });
      }, function () { if (nr !== dane.nr) return; schowaj("ulica"); zglosDane("akcja"); });
    } };
  }
  /** Fale danych. wymus = true pomija okno 60 s (przycisk „Spróbuj ponownie”). */
  function wczytaj(wymus) {
    var teraz = Date.now();
    if (!wymus && dane.t && teraz - dane.t < SWIEZE_MS) return;
    var sb = klient(), nr = ++dane.nr;
    dane.t = teraz;
    if (!sb) { zglosDane("klient"); schowaj("ulica"); bladKafla("trening", "Trening na dziś"); bladKafla("ostatni", "Ostatni trening"); schowaj("lista"); return; }
    dane.profil = Promise.resolve(sb.auth.getSession()).then(function (r) { return r && r.data && r.data.session && r.data.session.user ? r.data.session.user.id : null; }, function () { return null; }).then(function (uid) {
      if (nr !== dane.nr || !uid) return null;   // bez sesji stary kod sam odsyła do logowania
      /* FALA 1: profil, licznik akcji i mój wkład idą razem */
      var s0 = slugAkcji(null), a0 = s0 ? akcja(sb, nr, s0, s0) : null;
      var pProfil = pytaj(sb.from("athletes").select("id,full_name,coach_id").eq("user_id", uid).maybeSingle());
      if (!a0) schowaj("ulica");
      return pProfil.then(function (a) {
        if (nr !== dane.nr) return a;
        if (!a) { wstrzymane = true; stop(); return null; }   // konto bez wiersza zawodnika: pierwsze kroki zostają na starym ekranie
        dane.imie = String(a.full_name || ""); odswiezNaglowek();
        /* FALA 2: wszystko, co potrzebuje id zawodnika */
        var s1 = slugAkcji(a.id);
        if (a0 && s1 === s0) a0.pokaz(); else if (s1 && s0) akcja(sb, nr, s1, s0).pokaz(); else schowaj("ulica");
        pytaj(sb.from("trainings").select("id,date,type,distance_km,duration_min,pace,description,status,plan_source,coach_id").eq("athlete_id", a.id).eq("date", kluczDnia()).order("created_at").limit(3))
          .then(function (t) { if (nr === dane.nr) wpisz("trening", treningHtml(t)); }, function () { if (nr !== dane.nr) return; bladKafla("trening", "Trening na dziś"); zglosDane("trening"); });
        pytaj(sb.from("training_logs").select("id,logged_at,training_type,distance_km,duration,pace,heart_rate,elevation_gain,feel").eq("athlete_id", a.id).not("training_type", "like", "__badge__%").order("logged_at", { ascending: false }).limit(ILE_WPISOW))
          .then(function (l) {
            if (nr !== dane.nr) return; l = l || [];
            wpisz("ostatni", ostatniHtml(l[0] || null));
            if (l.length > 1) wpisz("lista", listaHtml(l.slice(1))); else schowaj("lista");
          }, function () { if (nr !== dane.nr) return; bladKafla("ostatni", "Ostatni trening"); schowaj("lista"); zglosDane("wpisy"); });
        return a;
      }, function () {
        if (nr !== dane.nr) return null;
        if (a0) a0.pokaz();   // licznik nie zależy od profilu: pokazujemy domyślną akcję
        bladKafla("trening", "Trening na dziś"); bladKafla("ostatni", "Ostatni trening"); schowaj("lista"); zglosDane("profil");
        return null;
      });
    });
  }

  function rysuj() {
    var k = korzen();
    try { k.innerHTML = szkieletHtml(); } catch (e) { zglos("render"); throw e; }
    k.setAttribute("data-etap", ETAP);
  }
  function start() {
    try {
      var k = korzen();
      if (!k && d.readyState === "loading") {   // wczesny start z bloku DZIS-E0 1 (kopia „nowy”): strona jeszcze się czyta
        if (!czekaNaDom && d.addEventListener) { czekaNaDom = true; d.addEventListener("DOMContentLoaded", function () { czekaNaDom = false; if (wlaczone()) { try { start(); } catch (e) {} } }); }
        return;
      }
      if (!k) { zglos("start"); return; }
      if (ustepuje() || wstrzymane) { pokaz(); return; }
      wstawCss();
      if (k.getAttribute("data-etap") !== ETAP) {
        rysuj();
        if (k.addEventListener && !k._dnKlik) { k.addEventListener("click", klik); k._dnKlik = true; }
      }
      if (!owiniete && typeof w.showSection === "function") {
        var oryg = w.showSection;
        w.showSection = function () { var r = oryg.apply(this, arguments); try { pokaz(); } catch (e) {} return r; };
        owiniete = true;
      }
      obserwuj();
      pokaz();
      wczytaj(false);
    } catch (e) { zglos("start"); stop(); throw e; }   // blok DZIS-E0 1 łapie wyjątek i wraca do starego ekranu
  }
  /** Powrót do starego ekranu: korzeń ukryty, stare Dziś i stare menu odsłonięte. */
  function stop() {
    var k = korzen(); if (k) k.hidden = true;
    html().classList.remove("dzis-gotowy"); html().classList.remove("dzis-na-dzis");
    menu(false);
  }
  w.BM_DZIS = { etap: ETAP, start: start, stop: stop, zglos: zglos, ustepuje: ustepuje, dataDzis: dataDzis, ETAPY: ETAPY, SKROTY: SKROTY, KAFLE: KAFLE, MENU: MENU,
    profil: function () { return dane.profil || Promise.resolve(null); }, wczytaj: wczytaj, kiedy: kiedy, kluczDnia: kluczDnia, czas: czas, tempo: tempo, km: km,
    ulicaHtml: ulicaHtml, treningHtml: treningHtml, ostatniHtml: ostatniHtml, listaHtml: listaHtml, LIMIT_MS: LIMIT_MS, SWIEZE_MS: SWIEZE_MS, ILE_WPISOW: ILE_WPISOW };
})(window, document);
