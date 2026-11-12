// MIASTO DOBRA · TRYB POKAZU I GOTOWOŚĆ NA 18.11 (11.11.2026). Plik BEZ import/export (globalThis.BM_POKAZ), dołączany przez miasto.html, miasto-bieg.html,
// miasto-firmy.html i miasto-druzyny.html. Bez parametru ?pokaz=… nie robi NIC (strony wyglądają jak dotąd). Z ?pokaz=1: wąski pasek na dole „Pokaz 3/12 · co teraz
// pokazać · Dalej ›” prowadzi po scenariuszu przez cztery strony (stan kroku w localStorage), jedno zdanie do powiedzenia małym tekstem; wersja pełna ≈ 6 minut
// (12 kroków), skrócona ≈ 3 minuty (7 kroków). Opowieść od 12.11: jedna droga, pięć poziomów (bieg → ulica → firmy → drużyny → zbudowana), ekran „Tak będzie w aplikacji” zaraz po mapie. Z ?pokaz=gotowosc (miasto.html): ekran „Gotowość pokazu”: jeden przycisk pobiera do pamięci przeglądarki wszystkie
// strony, moduły, font i grafiki pokazu (strony i skrypty przez Service Workera aplikacji do jego cache statycznego, grafiki do cache stron bm-miasto-grafiki-v1),
// lista z zielonym znaczkiem, stan licznika prawdziwej ulicy z datą, wynik „GOTOWE DO TRYBU SAMOLOTOWEGO” albo lista braków, „Wyczyść pokaz i zacznij od nowa”.
// Nic nie idzie do produkcji poza tym, co strony i tak pobierają (licznik akcji). Imię bohatera: nigdzie w tym pliku (nazwa ulicy przychodzi z licznika).
(function (g) {
  "use strict";
  var KLUCZ = "bm_pokaz", GRAFIKI_CACHE = "bm-miasto-grafiki-v1";
  var STRONY = ["miasto.html", "miasto-bieg.html", "miasto-firmy.html", "miasto-druzyny.html"];
  /* Klucze stanu pokazu na czterech stronach (zapis po stronie klikającego, nic na serwer). */
  var KLUCZE_STANU = ["bm_pokaz", "bm_bieg_pokaz", "bm_druzyny_pokaz", "bm_firmy_miasto"];
  /* Scenariusz: strona, co teraz pokazać (nagłówek paska), jedno zdanie do powiedzenia, akcja po wejściu (hash, przewinięcie, dotknięcie); skrot = w wersji 3-minutowej. */
  /* Nowa opowieść (decyzja 12.11): jedna droga, pięć poziomów. mapa i ulica wzorcowa → „tak będzie w aplikacji” → drabinka → zacznij od biegu (kreator w minutę) → bieg → drabinka
     poziom 2 → firmy (3) → drużyny (4) → widok organizacji → koniec na mapie. 12 kroków, skrót 7 (3 minuty). `klik` może być listą selektorów (po kolei, co 250 ms). */
  var KROKI = [
    { strona: "miasto.html", co: "Mapa: jedna droga, pięć poziomów", skrot: true, zdanie: "Każda zbiórka ma swoją ulicę i każda zaczyna od biegu wirtualnego, a potem rośnie poziomami: ulica, firmy, drużyny, zbudowana. Ta jedna ulica jest prawdziwa i wzorcowa: tak może wyglądać Wasza. Reszta to podpisane przykłady." },
    { strona: "miasto.html", klik: "#md-aplikacja", co: "Tak będzie w aplikacji", zdanie: "Na pierwszej stronie aplikacji biegacz wybiera ulicę, dla której biegnie. Jedna ulica naraz, kilometry liczą się od chwili wyboru, bez wyboru nie liczą się nigdzie. Wejście z linku ulicy prosi o jedno potwierdzenie." },
    { strona: "miasto.html", klik: ["#md-apl [data-zamknij]", '.dz[data-id="prawdziwa"]'], co: "Ulica wzorcowa i drabinka", skrot: true, zdanie: "Liczby z publicznego licznika: kilometry, procent celu, cegły, firmy. Pod spodem drabinka pięciu poziomów z zaznaczonym obecnym. Poziom odblokowuje aktywność ludzi i potwierdzenie organizacji, nigdy opłata." },
    { strona: "miasto.html", klik: ["#md-zamknij", "#md-zaloz"], co: "Zacznij od biegu: kreator w minutę", zdanie: "Trzy rzeczy: link do zbiórki, termin, bohater jako rysunkowa postać ze świata. Bieg nic nie kosztuje, nie potrzebuje sponsora i rusza od ręki." },
    { strona: "miasto.html", klik: ["#md-zaloz", "[data-zatwierdz]"], co: "Po zatwierdzeniu: brama, plakat, kod QR", skrot: true, zdanie: "Od razu podgląd strony biegu z bramą, plakat i kod QR do rozdania. Bieg będzie widoczny dla wszystkich po potwierdzeniu przez opiekuna albo organizację." },
    { strona: "miasto-bieg.html", co: "Poziom 1: bieg jako ulica", skrot: true, zdanie: "Tak wygląda gotowy bieg: w jeden weekend każdy biegnie albo idzie 5 lub 10 km tam, gdzie mieszka. Udział bezpłatny; od nas numer, dyplom i odznaka. Kto chce, wspiera zbiórkę bezpośrednio u Was." },
    { strona: "miasto-bieg.html", przewin: "#bw-kroki", co: "Bieg: jak to działa", zdanie: "Cztery kroki: zapis, bieg u siebie, wynik z zegarka albo wpisany, dyplom od razu w telefonie. Zapisy i pierwsze kilometry otwierają drugi poziom: ulicę z celem." },
    { strona: "miasto.html", klik: '.dz[data-id="urodzinowa"]', co: "Poziom 2: ulica z celem i murem", zdanie: "Mała ulica urodzinowa: cel w kilometrach i mur, w którym stają cegły darczyńców. Pierwsze cegły i zgoda organizacji otwierają trzeci poziom: firmy." },
    { strona: "miasto-firmy.html", co: "Poziom 3: firmy na ulicy", skrot: true, zdanie: "Od trzeciego poziomu firma ma drogi na ulicę: sponsor kilometrów, opiekun odcinka, domek albo wieżowiec. Każda kończy się wpłatą u organizacji, nie u nas." },
    { strona: "miasto-druzyny.html", co: "Poziom 4: drużyny", skrot: true, zdanie: "Klasy i zespoły z firm zbierają kilometry jako drużyny, ranking razem i na osobę, bez rankingu dzieci. Osiągnięty cel to poziom piąty: ulica zbudowana zostaje w mieście." },
    { strona: "miasto-bieg.html", hash: "#organizacja", co: "Widok organizacji", zdanie: "To Wasz ekran: zapisani, kilometry, kliknięcia w link zbiórki, plakat, kod QR, zgody, checklista. Kliknięcia, nie wpłaty: ile wpłynęło, wiecie tylko Wy." },
    { strona: "miasto.html", co: "Zakończenie na mapie", skrot: true, zdanie: "Wasza rola: prowadzicie zbiórkę, potwierdzacie bieg i opowiadacie o ulicy. Liczenie, grafiki, aplikacja i weryfikacja są po naszej stronie. BiegaMy nic nie przyjmuje." }
  ];
  var CSS = ".pk-pasek{position:fixed;left:0;right:0;bottom:0;z-index:900;display:grid;grid-template-columns:auto 1fr;grid-template-areas:'nr co' 'zd zd' 'p p';gap:4px 8px;align-items:center;padding:6px 8px calc(env(safe-area-inset-bottom) + 6px);background:rgba(7,7,10,.94);color:#f0ede8;border-top:1px solid rgba(255,255,255,.14);font:600 12px/1.2 Inter,system-ui,sans-serif;backdrop-filter:blur(6px)}" +
    ".pk-nr{font:400 20px/1 'Bebas Neue',Impact,sans-serif;letter-spacing:.04em;color:#ffb27a;white-space:nowrap}.pk-nr small{display:block;font:600 9px/1 Inter,sans-serif;letter-spacing:.12em;color:rgba(240,237,232,.6);margin-top:2px}" +
    ".pk-nr{grid-area:nr}.pk-co{grid-area:co;min-width:0}.pk-co b{display:block;font-size:13px;line-height:1.25}.pk-przyciski{grid-area:p;justify-content:flex-end}.pk-zdanie{grid-area:zd;font:400 11px/1.35 Inter,sans-serif;color:rgba(240,237,232,.78);max-height:4.1em;overflow:hidden}" +
    ".pk-przyciski{display:flex;gap:4px;align-items:center}.pk-przyciski button{min-width:40px;min-height:40px;padding:0 10px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(255,255,255,.06);color:#f0ede8;font:700 12px/1 Inter,sans-serif;cursor:pointer}" +
    ".pk-przyciski .pk-dalej{background:#c9440f;border-color:#c9440f;color:#fff;min-width:72px}.pk-przyciski .pk-tryb[aria-pressed=true]{background:#3d5a99;border-color:#3d5a99;color:#fff}" +
    ".pk-cialo{padding-bottom:116px!important}" +
    ".pk-gotowosc{position:fixed;inset:0;z-index:950;overflow:auto;background:#07070a;color:#f0ede8;font:400 14px/1.45 Inter,system-ui,sans-serif;padding:calc(env(safe-area-inset-top) + 14px) 14px calc(env(safe-area-inset-bottom) + 24px)}" +
    ".pk-gotowosc h1{font:400 34px/1 'Bebas Neue',Impact,sans-serif;letter-spacing:.03em;margin:6px 0 8px}.pk-gotowosc p{margin:6px 0;color:rgba(240,237,232,.78)}" +
    ".pk-duzy{display:block;width:100%;margin:12px 0;padding:15px;border:0;border-radius:14px;background:#c9440f;color:#fff;font:600 15px/1 Inter,sans-serif;cursor:pointer}.pk-duzy--cichy{background:rgba(255,255,255,.08);color:#f0ede8}.pk-duzy--ziel{background:#2f6b3a}.pk-duzy[disabled]{opacity:.5}" +
    ".pk-wynik{margin:12px 0;padding:14px;border-radius:14px;font:800 16px/1.3 Inter,sans-serif;border:1px solid rgba(255,255,255,.14)}.pk-wynik--ok{background:rgba(47,107,58,.3);border-color:#2f6b3a}.pk-wynik--brak{background:rgba(201,68,15,.25);border-color:#c9440f}" +
    ".pk-lista{list-style:none;margin:10px 0;padding:0;max-height:46vh;overflow:auto;border:1px solid rgba(255,255,255,.1);border-radius:12px}.pk-lista li{display:flex;gap:10px;align-items:center;min-height:34px;padding:4px 10px;border-top:1px solid rgba(255,255,255,.08);font-size:12.5px}.pk-lista li:first-child{border-top:0}" +
    ".pk-lista i{width:20px;height:20px;border-radius:50%;display:inline-grid;place-items:center;font-style:normal;font-size:12px;background:rgba(255,255,255,.1);flex:0 0 20px}.pk-lista i.ok{background:#2f6b3a;color:#fff}.pk-lista i.zle{background:#c9440f;color:#fff}.pk-lista small{margin-left:auto;color:rgba(240,237,232,.6);white-space:nowrap}" +
    ".pk-stan{padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);font-size:13px}.pk-stan b{display:block;font:400 22px/1 'Bebas Neue',Impact,sans-serif;letter-spacing:.03em;margin-bottom:3px}";

  function wstrzyknijCss() { if (!g.document || g.document.getElementById("bm-pokaz-css")) return; var st = g.document.createElement("style"); st.id = "bm-pokaz-css"; st.textContent = CSS; g.document.head.appendChild(st); }
  function el(tag, klasa, rodzic, tekst) { var n = g.document.createElement(tag); if (klasa) n.className = klasa; if (tekst != null) n.textContent = tekst; if (rodzic) rodzic.appendChild(n); return n; }
  function strona() { try { return (g.location.pathname.split("/").pop() || "miasto.html"); } catch (e) { return "miasto.html"; } }
  function parametr() { try { var m = /[?&]pokaz=([^&#]*)/.exec(g.location.search || ""); return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; } }
  function odczytaj() { try { var z = JSON.parse(g.localStorage.getItem(KLUCZ) || "null"); return z && typeof z === "object" ? z : { krok: 0, tryb: "pelny" }; } catch (e) { return { krok: 0, tryb: "pelny" }; } }
  function zapisz(s) { try { g.localStorage.setItem(KLUCZ, JSON.stringify(s)); } catch (e) {} }
  function lista(tryb) { return tryb === "krotki" ? KROKI.filter(function (k) { return k.skrot; }) : KROKI.slice(); }
  function czasMin(tryb) { return tryb === "krotki" ? 3 : 6; }
  /** Wykonaj krok na bieżącej stronie: hash (albo jego zdjęcie), przewinięcie, dotknięcie; pasek zostaje nad treścią. */
  function wykonaj(k) {
    if (!g.document) return;
    try {
      if (k.hash) { if (g.location.hash !== k.hash) g.location.hash = k.hash; }
      else if (g.location.hash && /^#(organizacja)$/.test(g.location.hash)) { g.history.replaceState(null, "", g.location.pathname + g.location.search); g.dispatchEvent(new g.Event("hashchange")); }
    } catch (e) {}
    g.setTimeout(function () {
      try {
        if (k.przewin) { var cel = g.document.querySelector(k.przewin); if (cel) { var y = cel.getBoundingClientRect().top + (g.pageYOffset || 0) - 8; g.scrollTo({ top: y, behavior: "auto" }); } }
        else if (!k.hash) g.scrollTo(0, 0);
        /* lista selektorów (12.11): kolejne dotknięcia co 250 ms, np. zamknięcie okna i otwarcie karty albo kreator → zatwierdzenie */
        var sel = Array.isArray(k.klik) ? k.klik.slice() : (k.klik ? [k.klik] : []);
        (function nast() { if (!sel.length) return; var s = sel.shift(); try { var b = g.document.querySelector(s); if (b && b.click) b.click(); } catch (e2) {} if (sel.length) g.setTimeout(nast, 250); })();
      } catch (e) {}
    }, 350);
  }
  function idz(nr, s) {
    var L = lista(s.tryb), i = Math.max(0, Math.min(L.length - 1, nr)), k = L[i];
    s.krok = i; zapisz(s);
    if (k.strona !== strona()) { g.location.href = k.strona + "?pokaz=1" + (k.hash || ""); return; }
    rysujPasek(s); wykonaj(k);
  }
  var _pasek = null;
  function rysujPasek(s) {
    wstrzyknijCss();
    var L = lista(s.tryb), i = Math.max(0, Math.min(L.length - 1, s.krok)), k = L[i], tu = k.strona === strona();
    if (!_pasek) { _pasek = el("div", "pk-pasek", g.document.body); _pasek.setAttribute("role", "region"); _pasek.setAttribute("aria-label", "Pasek pokazu"); g.document.body.classList.add("pk-cialo"); }
    _pasek.innerHTML = "";
    var nr = el("div", "pk-nr", _pasek, (i + 1) + "/" + L.length); el("small", "", nr, "POKAZ " + czasMin(s.tryb) + " MIN");
    var co = el("div", "pk-co", _pasek); el("b", "", co, (tu ? "" : "→ ") + k.co);
    el("div", "pk-zdanie", _pasek, k.zdanie);   // zdanie w osobnym wierszu na całą szerokość, nad przyciskami (uwaga z przeglądu 11.11); tytuł kroku w całości, bez wielokropka
    var p = el("div", "pk-przyciski", _pasek);
    var tryb = el("button", "pk-tryb", p, s.tryb === "krotki" ? "3 min" : "6 min"); tryb.type = "button"; tryb.setAttribute("aria-pressed", s.tryb === "krotki" ? "true" : "false"); tryb.title = "Przełącz: pełny 6 min / skrócony 3 min";
    var wstecz = el("button", "pk-wstecz", p, "‹"); wstecz.type = "button"; wstecz.setAttribute("aria-label", "Poprzedni krok"); wstecz.disabled = i === 0;
    var dalej = el("button", "pk-dalej", p, tu ? (i === L.length - 1 ? "Koniec" : "Dalej ›") : "Przejdź ›"); dalej.type = "button";
    var x = el("button", "pk-wyjdz", p, "×"); x.type = "button"; x.setAttribute("aria-label", "Wyjdź z pokazu");
    tryb.addEventListener("click", function () { var staryKrok = lista(s.tryb)[s.krok]; s.tryb = s.tryb === "krotki" ? "pelny" : "krotki"; var L2 = lista(s.tryb), j = L2.indexOf(staryKrok); if (j < 0) { j = 0; for (var q = 0; q < L2.length; q++) if (KROKI.indexOf(L2[q]) <= KROKI.indexOf(staryKrok)) j = q; } s.krok = j; zapisz(s); rysujPasek(s); });
    wstecz.addEventListener("click", function () { idz(i - 1, s); });
    dalej.addEventListener("click", function () { if (!tu) { idz(i, s); return; } if (i === L.length - 1) { s.krok = 0; zapisz(s); g.location.href = "miasto.html?pokaz=1"; return; } idz(i + 1, s); });
    x.addEventListener("click", function () { g.location.href = g.location.pathname + (g.location.hash || ""); });
  }
  function startPaska() {
    var s = odczytaj(); if (!s.tryb) s.tryb = "pelny";
    var L = lista(s.tryb), k = L[Math.max(0, Math.min(L.length - 1, s.krok || 0))];
    rysujPasek(s);
    if (k && k.strona === strona()) g.setTimeout(function () { wykonaj(k); }, 250);
  }

  /* ── GOTOWOŚĆ POKAZU ──────────────────────────────────────────────────────── */
  var DODATKOWE = ["js/miasto-pokaz.mjs", "assets/fonty/BebasNeue-Regular.ttf", "favicon-32.png", "assets/ulica/domek-1.webp", "assets/ulica/domek-2.webp", "assets/ulica/domek-3.webp", "assets/ulica/domek-4.webp", "assets/ulica/domek-5.webp", "assets/ulica/domek-6.webp", "assets/ulica/domek-7.webp", "assets/ulica/wiezowiec.webp", "assets/ulica/mur.webp"];
  function zTekstu(t, wz) { var out = [], m; wz.lastIndex = 0; while ((m = wz.exec(t))) out.push(m[1]); return out; }
  /** Lista plików pokazu: cztery strony, ich skrypty (ze znaczników <script src>) i grafiki (literały assets/… w HTML i modułach) + dynamiczne domki. Pobierana żywcem, więc nie rozjeżdża się ze stronami. */
  function listaPlikow() {
    var pliki = [], widziane = {};
    function dodaj(u) { if (u && !widziane[u]) { widziane[u] = true; pliki.push(u); } }
    STRONY.forEach(dodaj);
    return Promise.all(STRONY.map(function (st) {
      return g.fetch(st, { cache: "no-cache" }).then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; }).then(function (html) {
        var skrypty = zTekstu(html, /<script src="([^"]+\.m?js)"/g);
        zTekstu(html, /["'(](assets\/[a-z0-9_\/-]+\.(?:webp|svg|png|ttf|woff2?))["')]/g).forEach(dodaj);
        return Promise.all(skrypty.map(function (sk) {
          dodaj(sk);
          return g.fetch(sk, { cache: "no-cache" }).then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; }).then(function (kod) { zTekstu(kod, /["'](assets\/[a-z0-9_\/-]+\.(?:webp|svg|png))["']/g).forEach(dodaj); });
        }));
      });
    })).then(function () { DODATKOWE.forEach(dodaj); return pliki; });
  }
  function nazwaStatic() { if (!g.caches) return Promise.resolve(null); return g.caches.keys().then(function (k) { var s = k.filter(function (n) { return /-static$/.test(n); }).sort(); return s.length ? s[s.length - 1] : null; }).catch(function () { return null; }); }
  /** Service Worker aplikacji: bez niego strony nie wrócą bez sieci. Rejestracja jak w sb.js; gdy strona nie jest jeszcze pod kontrolą, jedno przeładowanie. */
  function zapewnijSW() {
    if (!g.navigator || !g.navigator.serviceWorker) return Promise.resolve("brak");
    if (g.navigator.serviceWorker.controller) return Promise.resolve("jest");
    return g.navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function () { return g.navigator.serviceWorker.ready; }).then(function () {
      if (g.navigator.serviceWorker.controller) return "jest";
      var raz = false; try { raz = g.sessionStorage.getItem("bm_pokaz_sw_reload") === "1"; } catch (e) {}
      if (raz) return "bez-kontroli";
      try { g.sessionStorage.setItem("bm_pokaz_sw_reload", "1"); g.sessionStorage.setItem("bm_pokaz_auto", "1"); } catch (e) {}
      g.location.reload(); return "reload";
    }).catch(function () { return "blad"; });
  }
  /** Pobierz jeden plik: przez SW (strony, skrypty, font, svg, png → jego cache statyczny), a grafiki i font dodatkowo do cache stron. Zwraca {ok, bajty}. */
  function pobierz(url, staticCache, grafCache) {
    return g.fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r || !r.ok) return { ok: false, bajty: 0 };
      var kopia1 = r.clone(), kopia2 = r.clone();
      var p = [];
      if (grafCache && /\.(webp|svg|png|ttf|woff2?)$/i.test(url)) p.push(grafCache.put(url, kopia1).catch(function () {}));
      if (staticCache && /\.(html|m?js|ttf|woff2?|svg|png|ico)$/i.test(url)) p.push(staticCache.put(url, kopia2).catch(function () {}));
      return r.blob().then(function (b) { return Promise.all(p).then(function () { return { ok: true, bajty: b.size }; }); });
    }).catch(function () { return { ok: false, bajty: 0 }; });
  }
  function wCache(url) { if (!g.caches) return Promise.resolve(false); return g.caches.match(url, { ignoreSearch: true }).then(function (r) { return !!r; }).catch(function () { return false; }); }
  function wyczyscPokaz() { KLUCZE_STANU.forEach(function (k) { try { g.localStorage.removeItem(k); } catch (e) {} }); try { g.sessionStorage.removeItem("bm_pokaz_sw_reload"); } catch (e) {} }
  function stanLicznika() {
    var M = g.BM_MIASTO; if (!M || !M.odczytaj) return null;
    var z = M.odczytaj(); if (!z || !z.u) return null;
    return { nazwa: z.u.nazwa, km: z.u.suma_km, pct: z.u.pct, stan: M.stanZ(z.t), status: z.u.status };
  }
  function odswiezLicznik() { var M = g.BM_MIASTO; if (!M || !M.pobierzPrawdziwa) return Promise.resolve(null); return M.pobierzPrawdziwa().then(function (u) { if (u && u.status !== "brak") M.zapamietaj(u); return u; }, function () { return null; }); }
  function ekranGotowosci() {
    wstrzyknijCss();
    var e = el("div", "pk-gotowosc", g.document.body); e.setAttribute("role", "dialog"); e.setAttribute("aria-label", "Gotowość pokazu");
    el("div", "", e, "BiegaMy · Miasto Dobra").style.cssText = "font:600 11px/1 Inter,sans-serif;letter-spacing:.24em;color:rgba(240,237,232,.6);text-transform:uppercase";
    el("h1", "", e, "Gotowość pokazu");
    el("p", "", e, "Jeden przycisk pobiera do pamięci tego telefonu wszystkie strony pokazu, skrypty, font nagłówków i grafiki. Potem cały scenariusz działa w trybie samolotowym. Zrób to raz, z internetem, przed spotkaniem.");
    var stan = el("div", "pk-stan", e); var stanB = el("b", "", stan, "licznik prawdziwej ulicy: czekam…"); var stanS = el("span", "", stan, "");
    var pobierzB = el("button", "pk-duzy", e, "Pobierz wszystko do pamięci telefonu ›"); pobierzB.type = "button"; pobierzB.id = "pk-pobierz";
    var wynik = el("div", "pk-wynik", e, "Jeszcze nie sprawdzone."); wynik.id = "pk-wynik";
    var ul = el("ul", "pk-lista", e); ul.id = "pk-lista";
    var start = el("button", "pk-duzy pk-duzy--ziel", e, "Zacznij pokaz od pierwszego kroku ›"); start.type = "button"; start.id = "pk-start";
    var krotki = el("button", "pk-duzy pk-duzy--cichy", e, "Zacznij pokaz skrócony (3 min) ›"); krotki.type = "button"; krotki.id = "pk-start-krotki";
    var czysc = el("button", "pk-duzy pk-duzy--cichy", e, "Wyczyść pokaz i zacznij od nowa"); czysc.type = "button"; czysc.id = "pk-wyczysc";
    el("p", "", e, "„Wyczyść” kasuje stan pokazu na wszystkich czterech stronach (zapis na bieg, drużynę, nazwę firmy, krok pokazu). Pamięć stron zostaje.");
    var wroc = el("a", "", e, "‹ Miasto Dobra bez pokazu"); wroc.href = "miasto.html"; wroc.style.cssText = "display:inline-block;margin-top:8px;color:rgba(240,237,232,.7)";
    function pokazStan() { var s = stanLicznika(); if (s) { stanB.textContent = s.nazwa + " · " + (g.BM_MIASTO.km(s.km)) + " km · " + g.BM_MIASTO.liczba(s.pct, 1) + " %"; stanS.textContent = s.stan + " · bez sieci strona pokaże właśnie to"; } else { stanB.textContent = "licznik prawdziwej ulicy: brak zapisu"; stanS.textContent = "otwórz raz z internetem, żeby zapamiętać liczby"; } }
    pokazStan(); odswiezLicznik().then(pokazStan);
    function sprawdzWszystko(pliki) {
      return Promise.all(pliki.map(function (u) { return wCache(u).then(function (ok) { return { u: u, ok: ok }; }); })).then(function (w) {
        ul.innerHTML = ""; w.forEach(function (x) { var li = el("li", "", ul); el("i", x.ok ? "ok" : "zle", li, x.ok ? "✓" : "✗"); el("span", "", li, x.u); });
        var braki = w.filter(function (x) { return !x.ok; });
        if (!braki.length) { wynik.className = "pk-wynik pk-wynik--ok"; wynik.textContent = "GOTOWE DO TRYBU SAMOLOTOWEGO · " + w.length + " plików w pamięci"; }
        else { wynik.className = "pk-wynik pk-wynik--brak"; wynik.textContent = "BRAKUJE " + braki.length + " z " + w.length + ": " + braki.slice(0, 6).map(function (x) { return x.u; }).join(", ") + (braki.length > 6 ? "…" : ""); }
        return braki.length;
      });
    }
    function pobierzWszystko() {
      pobierzB.disabled = true; pobierzB.textContent = "Pobieram…"; wynik.className = "pk-wynik"; wynik.textContent = "Rejestruję pamięć stron…";
      return zapewnijSW().then(function (sw) {
        if (sw === "reload") return;
        wynik.textContent = sw === "jest" ? "Pobieram pliki…" : "Pobieram pliki (bez Service Workera strony mogą nie wrócić bez sieci: " + sw + ")";
        return Promise.all([listaPlikow(), nazwaStatic(), g.caches ? g.caches.open(GRAFIKI_CACHE).catch(function () { return null; }) : null]).then(function (r) {
          var pliki = r[0], staticName = r[1], graf = r[2];
          return (staticName && g.caches ? g.caches.open(staticName) : Promise.resolve(null)).then(function (sc) {
            ul.innerHTML = ""; var wiersze = {};
            pliki.forEach(function (u) { var li = el("li", "", ul); wiersze[u] = { i: el("i", "", li, "…"), s: el("small", "", li, "") }; el("span", "", li, u); li.appendChild(wiersze[u].s); });
            var i = 0, razem = 0;
            function nast() {
              if (i >= pliki.length) return sprawdzWszystko(pliki).then(function (braki) { pobierzB.disabled = false; pobierzB.textContent = braki ? "Spróbuj jeszcze raz ›" : "Pobrane. Sprawdź ponownie ›"; wynik.textContent += " · " + Math.round(razem / 1000) + " KB"; });
              var u = pliki[i++];
              return pobierz(u, sc, graf).then(function (w) { razem += w.bajty; wiersze[u].i.className = w.ok ? "ok" : "zle"; wiersze[u].i.textContent = w.ok ? "✓" : "✗"; wiersze[u].s.textContent = w.ok ? Math.round(w.bajty / 1000) + " KB" : "błąd"; return nast(); });
            }
            return nast();
          });
        });
      });
    }
    pobierzB.addEventListener("click", pobierzWszystko);
    start.addEventListener("click", function () { zapisz({ krok: 0, tryb: "pelny" }); g.location.href = "miasto.html?pokaz=1"; });
    krotki.addEventListener("click", function () { zapisz({ krok: 0, tryb: "krotki" }); g.location.href = "miasto.html?pokaz=1"; });
    czysc.addEventListener("click", function () { wyczyscPokaz(); czysc.textContent = "Wyczyszczone. Pokaz zacznie się od zera."; });
    var auto = false; try { auto = g.sessionStorage.getItem("bm_pokaz_auto") === "1"; g.sessionStorage.removeItem("bm_pokaz_auto"); } catch (e) {}
    if (auto) g.setTimeout(pobierzWszystko, 300);
    return e;
  }

  function start() {
    var p = parametr(); if (p == null || !g.document || !g.document.body) return;
    if (p === "gotowosc") { if (strona() === "miasto.html") ekranGotowosci(); else g.location.href = "miasto.html?pokaz=gotowosc"; return; }
    startPaska();
  }
  if (g.document && g.document.readyState !== "loading") g.setTimeout(start, 0); else if (g.document) g.document.addEventListener("DOMContentLoaded", start);
  g.BM_POKAZ = { KLUCZ: KLUCZ, STRONY: STRONY, KROKI: KROKI, KLUCZE_STANU: KLUCZE_STANU, DODATKOWE: DODATKOWE, lista: lista, czasMin: czasMin, odczytaj: odczytaj, zapisz: zapisz, parametr: parametr, strona: strona, wyczyscPokaz: wyczyscPokaz, zTekstu: zTekstu, listaPlikow: listaPlikow, nazwaStatic: nazwaStatic, wCache: wCache };
})(typeof globalThis !== "undefined" ? globalThis : window);
