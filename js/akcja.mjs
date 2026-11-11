// AKCJA — wspólne liczby i teksty karty akcji (projekt F, dzień 3). Plik BEZ import/export (globalThis.BM_AKCJA),
// jak js/akcja-cytaty.mjs: <script src> w zawodnik.html / index.html / dla-fabianka.html, import w testach i w EF okienko.
// Jedno źródło liczb = akcja_licznik (spec v2 pkt 5). Nazwa, imię i link przychodzą z bazy — w kodzie ich nie ma.
// Rozliczenie jednorazowe po akcji (decyzja Filipa 2.11): „BiegaMy, czyli Filip i Kasia, dokłada 10 gr za każdy kilometr biegu i spaceru · dotąd X zł z 1 250 zł",
// bez kwot tygodniowych w UI. Przed startem licznik nie zwraca nazwy ani imienia — teaser nie zna dziecka.
(function (g) {
  "use strict";
  var EF = "/functions/v1/akcja-licznik";
  var CACHE_MS = 60000, CACHE_PRZED_STARTEM_MS = 5000;   // przed guzikiem krótko: widz przed telewizorem nie może czekać minuty na akcję
  var DNI_KARTY_PO_ZAMKNIECIU = 7;   // v2 pkt 3.3: „Zrobiliśmy to" na Dziś przez 7 dni, potem znika
  /* Formularz sponsora kilometrów (RPC akcja_deklaruj / akcja_wycofaj_deklaracje, migracja 20261102_akcja_deklaracje).
     Włączany RAZEM z migracją na prod — bez niej „Zapisz" dostałby błąd. */
  var DEKLARACJE_GOTOWE = true;   // 2.11: migracja 20261102_akcja_deklaracje NA PROD (OK Filipa)
  /* Filip 2.11 19:00: imię z bazy (akcja_licznik.imie, tylko po starcie) w dopełniaczu — „zbiórkę <imienia>". Imienia nie ma w kodzie (blizna-101). */
  var TEKST_DEKLARACJI = "Wpłacasz sam na oficjalną zbiórkę po zakończeniu akcji. Aplikacja tylko liczy.";   // bez imienia (brak d)
  function dopelniacz(imie) {
    var s = String(imie || "").trim();
    if (!s) return "";
    if (/ek$/i.test(s)) return s.slice(0, -2) + "ka";   // Marek → Marka, Tomek → Tomka
    if (/a$/i.test(s)) return s.slice(0, -1) + "y";     // Kuba → Kuby
    return s + "a";                                     // Jan → Jana
  }
  function tekstDeklaracji(d) {
    var im = dopelniacz(d && d.imie);
    return "Po zakończeniu akcji wpłacasz sam na zbiórkę" + (im ? " " + im : "") + " — aktualny link będzie zawsze tutaj. Aplikacja tylko liczy.";
  }
  /** Plakat akcji (Filip 2.11 19:00): tylko z białej listy hostów (safeUrlAttr: Supabase Storage), tylko po starcie. */
  function plakatUrl(d) {
    var u = d && d.wystartowala && d.plakat_url;
    return u && g.safeUrlAttr ? g.safeUrlAttr(u) : "";
  }
  /* Zbiórka: href tylko z linkZbiorki (https). Dotknięcie otwiera zbiórkę, nakładka zostaje pod spodem. */
  function przyciskZbiorki(href, klasa) {
    var z = g.document.createElement("a"); z.className = klasa; z.href = href; z.target = "_blank"; z.rel = "noopener noreferrer"; z.textContent = "Zbiórka";
    z.addEventListener("click", function (e) { e.stopPropagation(); });
    return z;
  }
  /** Pełny ekran plakatu — jedna nakładka na stronę, zamykana dotknięciem/Esc. Klik w [data-plakat] (delegacja). */
  function pokazPlakat(url, zbiorka) {
    if (!g.document || !url) return;
    var stara = g.document.getElementById("bm-plakat-pelny"); if (stara) stara.remove();
    var n = g.document.createElement("div"); n.id = "bm-plakat-pelny"; n.className = "akcja-plakat-pelny"; n.setAttribute("role", "dialog"); n.setAttribute("aria-label", "Plakat akcji");
    var img = g.document.createElement("img"); img.src = url; img.alt = "Plakat akcji"; n.appendChild(img);
    if (zbiorka) n.appendChild(przyciskZbiorki(zbiorka, "akcja-plakat-zbiorka"));
    var zamknij = function () { n.remove(); g.document.removeEventListener("keydown", naKlawisz); };
    var naKlawisz = function (e) { if (e.key === "Escape") zamknij(); };
    n.addEventListener("click", zamknij); g.document.addEventListener("keydown", naKlawisz);
    g.document.body.appendChild(n);
  }
  try {
    g.document.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-plakat]") : null;
      if (!el) return;
      e.preventDefault(); pokazPlakat(el.getAttribute("data-plakat"), el.getAttribute("data-zbiorka") || "");
    });
  } catch (e) {}
  /** Blok plakatu (miniatura → pełny ekran) + „Wpłać na zbiórkę" (url_zbiorki, tylko https). Bez plakatu — pusty napis, bez dziury. */
  function plakatHtml(d, klasa) {
    var u = plakatUrl(d), link = linkZbiorki(d);
    if (!u) return "";
    return '<div class="akcja-plakat ' + (klasa || "") + '"><a href="' + u + '" data-plakat="' + u + '"' + (link ? ' data-zbiorka="' + link + '"' : "") + ' target="_blank" rel="noopener noreferrer">' +
      '<img src="' + u + '" alt="Plakat akcji" loading="lazy" decoding="async"></a>' +
      (link ? '<a class="akcja-wiecej akcja-wplac" href="' + link + '" target="_blank" rel="noopener noreferrer">Zbiórka</a>' : "") + "</div>";
  }

  /* Własne formatowanie zamiast toLocaleString: polski format w przeglądarce NIE grupuje liczb 4-cyfrowych („1250"),
     a teksty akcji mówią „1 250 zł". Grupowanie zawsze, twarda spacja (liczba się nie łamie), przecinek dziesiętny. */
  function liczba(x, miejsc, stale) {
    var n = Number(x);
    if (!isFinite(n)) n = 0;
    var m = miejsc == null ? 0 : miejsc, t = (Math.round(Math.abs(n) * Math.pow(10, m)) / Math.pow(10, m)).toFixed(m);
    var cz = t.split("."), cal = cz[0].replace(/\B(?=(\d{3})+(?!\d))/g, " "), ul = cz[1] || "";
    if (!stale) ul = ul.replace(/0+$/, "");
    return (n < 0 ? "-" : "") + cal + (ul ? "," + ul : "");
  }
  /** km do paska i tekstów: całe km (12 500), poniżej 10 km z jednym miejscem (3,4). */
  function km(x) { var n = Number(x) || 0; return liczba(n, n > 0 && n < 10 ? 1 : 0); }
  /** grosze → „41,20 zł" / „1 250 zł". */
  function zl(gr) {
    var z = (Number(gr) || 0) / 100;
    return (Math.round(z) === z ? liczba(z, 0) : liczba(z, 2, true)) + " zł";
  }
  function pct(d) { var p = Number(d && d.pct); return isFinite(p) ? Math.max(0, Math.min(100, p)) : 0; }
  function tekstFilipa(d) {
    if (!d || !d.wystartowala) return "";
    return "BiegaMy, czyli Filip i Kasia, dokłada " + (Number(d.stawka_filip_gr) || 10) + " gr za każdy kilometr biegu i spaceru · dotąd " + zl(d.filip_gr) + " z " + zl(d.filip_max_gr);
  }
  function tekstSponsorow(d) {
    var n = Number(d && d.sponsorzy_n) || 0;
    if (!n) return "";
    var os = n === 1 ? "osoba dokłada" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? "osoby dokładają" : "osób dokłada";
    return n + " " + os + " razem " + liczba(d.stawka_sponsorow_gr) + " gr za każdy kilometr";
  }
  function dzienWaw(t) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(t || new Date());
  }
  /** Stan karty na Dziś: 'brak' (przed startem albo > 7 dni po zamknięciu) | 'trwa' | 'zamknieta'. */
  function stanKarty(d, teraz) {
    if (!d || !d.wystartowala) return "brak";
    if (!d.koniec) return "trwa";
    var po = Math.round((Date.parse(dzienWaw(teraz) + "T12:00:00Z") - Date.parse(String(d.koniec) + "T12:00:00Z")) / 86400000);
    return po >= 0 && po < DNI_KARTY_PO_ZAMKNIECIU ? "zamknieta" : "brak";
  }
  /** Link zbiórki: tylko https przez safeExternalHref z sb.js (CLAUDE.md). Bez helpera — nic. */
  function linkZbiorki(d) {
    var u = d && d.url_zbiorki;
    return u && g.safeExternalHref ? g.safeExternalHref(u, { tylkoHttps: true }) : "";
  }
  function esc(s) { return g.escapeHtml ? g.escapeHtml(String(s == null ? "" : s)) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }

  /** Publiczny odczyt (niezalogowani): EF akcja-licznik, cache 60 s w sessionStorage (try/catch). → licznik | null. */
  async function pobierzPubliczny(slug, opcje) {
    var o = opcje || {}, klucz = "bm_akcja_pub_" + slug, teraz = Date.now(), ss = null, stary = null;
    try { ss = g.sessionStorage; stary = JSON.parse(ss.getItem(klucz) || "null"); } catch (e) { stary = null; }
    if (stary && !o.wymus && teraz - stary.t < (stary.d && stary.d.wystartowala ? CACHE_MS : CACHE_PRZED_STARTEM_MS)) return stary.d;
    try {
      var baza = o.baza || g.SB_URL || "";
      var r = await fetch(baza + EF + "?slug=" + encodeURIComponent(slug), { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("http " + r.status);
      var d = await r.json();
      try { if (ss) ss.setItem(klucz, JSON.stringify({ t: teraz, d: d })); } catch (e) {}
      return d;
    } catch (e) { return stary ? stary.d : null; }
  }

  /* LINK DO GRY: pokazany dopiero, gdy gra-ranking potwierdzi włączony przełącznik. Karta rysuje się od razu, link odkrywa się po odpowiedzi; gra nie opóźnia licznika i go nie dotyka. */
  var graWlaczona = false, pytanieOGre = null;
  function sprawdzGre() {
    if (!g.document || !g.fetch || !g.SB_URL) return null;   // karta z pamięci rysuje się przed sb.js: bez adresu bazy nie pytamy
    if (!pytanieOGre) {
      pytanieOGre = g.fetch((g.SB_URL || "") + "/functions/v1/gra-ranking", { headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          graWlaczona = !!(d && d.aktywna === true);
          if (graWlaczona) g.document.querySelectorAll("[data-gra-link]").forEach(function (e) { e.hidden = false; });
          else pytanieOGre = null;   // start przełącza grę: kolejne odświeżenie karty pyta jeszcze raz, bez przeładowania strony
        })
        .catch(function () { graWlaczona = false; pytanieOGre = null; });
    }
    return pytanieOGre;
  }
  /* Konto testowe zostaje na próbie także na kolejnych stronach. Przełącznik gry dotyczy prawdziwej akcji, więc próba wchodzi przez ?sciezka=1 (zamkiem jest funkcja akcja-proba-wizerunek). */
  function czyProba(d) { return !!(d && d.testowa === true); }
  /* Sekcja firm i cegiełek na stronie akcji: po starcie, przy włączonym formularzu albo adresie kontaktu (js/firma-formularz.mjs zamontuj). */
  function formularzFirm(d) { return !!(d && d.wystartowala && (d.firmy_zgloszenia === true || (typeof d.kontakt_firmy === "string" && d.kontakt_firmy))); }
  function adresStrony(d, kotwica) { return "dla-fabianka.html" + (czyProba(d) ? "?proba=1" : "") + (kotwica || ""); }
  function linkGry(d) { return czyProba(d) ? "gra-cegielki.html?sciezka=1&podglad=1&proba=1" : "gra-cegielki.html"; }   // proba=1: gra zapamiętuje konto testowe (js/cegielki-konto.js)
  function graWidoczna(d) { sprawdzGre(); return czyProba(d) || graWlaczona; }
  function linkGryHtml() {
    sprawdzGre();
    return '<a class="akcja-link" data-gra-link href="gra-cegielki.html"' + (graWlaczona ? "" : " hidden") + ">Zagraj w Cegiełki ›</a>";
  }

  /* Style kart — wstrzykiwane raz (jak WATCH._injectCss w sb.js), żeby trzy strony nie trzymały kopii. Kolory z tokenów theme.css
     z wartościami awaryjnymi (index.html i dla-fabianka.html mogą nie ładować theme.css). */
  var CSS = ".akcja-kafle{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.akcja-kafel{display:flex;align-items:center;justify-content:center;min-height:52px;padding:10px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.14));background:rgba(255,255,255,.05);color:var(--fg,#f0ede8);font:inherit;font-size:14px;font-weight:700;line-height:1.2;text-align:center;text-decoration:none;cursor:pointer}.akcja-kafel[hidden]{display:none}.akcja-kafel--wplata{background:var(--accent,#ff8a3c);border-color:transparent;color:#17120e}.akcja-wiecej-blok{margin-top:10px;font-size:13px}.akcja-wklad--zero{line-height:1.5}.akcja-pierwszy{display:inline-block;margin:6px 0 0;padding:10px 14px;min-height:40px;border:0;border-radius:10px;background:var(--accent,#ff8a3c);color:#17120e;font:inherit;font-size:13px;font-weight:800;cursor:pointer}.akcja-dzieki{margin-top:6px;padding:8px 10px;border-radius:10px;background:rgba(47,107,58,.25);border:1px solid rgba(47,107,58,.6);font-size:13px;font-weight:700}.akcja-moj-wklad{margin-left:8px;font-size:12px;background:transparent;cursor:pointer;font-family:inherit}.akcja-prog{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:0 0 10px;padding:10px 12px;border-radius:12px;background:linear-gradient(90deg,rgba(232,86,30,.28),rgba(242,179,42,.22));border:1px solid rgba(255,178,122,.6);color:#fff}.akcja-prog b{font:400 22px/1 'Bebas Neue',Inter,sans-serif;letter-spacing:.03em;color:#ffd3b0}.akcja-prog span{flex:1 1 120px;font-size:12px;color:rgba(255,255,255,.85)}.akcja-prog .akcja-prog-udostepnij{margin:0;padding:7px 10px;font-size:12px;background:transparent;cursor:pointer;font-family:inherit;pointer-events:auto}.akcja-dzis-liczby .akcja-pierwszy,.akcja-dzis-liczby .akcja-moj-wklad{pointer-events:auto;position:relative;z-index:4}.akcja-dzis-liczby .akcja-moj-wklad{display:block;margin:6px 0 0;padding:6px 10px}.akcja-wiecej-blok summary{cursor:pointer;font-weight:700}.akcja-film-nakladka{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;background:rgba(0,0,0,.92)}.akcja-film-nakladka video{max-width:100%;max-height:80vh;border-radius:12px}.akcja-film-nakladka button{padding:10px 20px;border:0;border-radius:10px;background:#fff;color:#111;font:inherit;font-weight:700;cursor:pointer}" +
    ".akcja-karta{background:var(--card,#0f0f14);border:1px solid var(--border,rgba(255,255,255,.1));border-radius:16px;padding:14px;color:var(--fg,#f0ede8);font-family:Inter,system-ui,sans-serif}" +
    ".akcja-nazwa{font:400 22px/1.1 'Bebas Neue',Inter,sans-serif;letter-spacing:.04em;margin-bottom:10px}" +
    ".akcja-pasek{height:10px;border-radius:6px;background:rgba(255,255,255,.08);overflow:hidden}" +
    ".akcja-pasek-wypelnienie{height:100%;border-radius:6px;background:linear-gradient(90deg,#e8561e,#ff8a3d);transition:width .9s ease}" +
    ".akcja-liczby{margin-top:8px;font-size:13px;color:var(--fg2,rgba(240,237,232,.75))}.akcja-liczby b{color:var(--fg,#f0ede8);font-size:15px}" +
    ".akcja-ja{margin-top:10px;font-size:13px}.akcja-filip,.akcja-sponsorzy,.akcja-typy{margin-top:6px;font-size:12px;color:var(--fg2,rgba(240,237,232,.7));line-height:1.45}" +
    ".akcja-zrobione{font-size:15px;margin:4px 0 10px}" +
    ".akcja-przyciski{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}" +
    ".akcja-wiecej,.akcja-link{display:inline-block;padding:9px 14px;border-radius:12px;font-size:12px;font-weight:600;letter-spacing:.04em;text-decoration:none}" +
    ".akcja-wiecej{background:#e8561e;color:#fff}.akcja-link{border:1px solid rgba(232,86,30,.5);color:#ff8a3d}" +
    ".akcja-wiecej,.akcja-link{cursor:pointer;font-family:inherit}button.akcja-link{background:transparent}" +
    ".akcja-sponsor{margin-top:10px;font-size:13px}.akcja-tekstowy{background:none;border:0;color:#ff8a3d;font:inherit;text-decoration:underline;cursor:pointer;padding:0}" +
    ".akcja-form{margin-top:10px}.akcja-form label{font-size:13px}.akcja-stawka{width:72px;margin:0 6px;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit}" +
    ".akcja-wyprawa{margin-top:8px;font-size:12px;color:var(--fg,#f0ede8)}" +
    ".akcja-uwaga{font-size:12px;color:var(--fg2,rgba(240,237,232,.7));margin:8px 0 10px;line-height:1.45}" +
    ".akcja-plakat{margin:10px 0}.akcja-plakat a[data-plakat]{display:block}.akcja-plakat img{display:block;width:100%;height:auto;border-radius:12px;cursor:zoom-in}" +
    ".akcja-plakat--mini img{max-height:220px;object-fit:cover}.akcja-plakat--dzis img{max-height:340px;object-fit:contain}.akcja-wplac{display:block;text-align:center;margin-top:8px}" +
    ".akcja-plakat-zbiorka{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);padding:14px 34px;border-radius:14px;background:#e8561e;color:#fff;font-weight:800;text-decoration:none;z-index:1}" +
    ".akcja-film-plansza{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;background:#000;cursor:zoom-in}.akcja-film-plansza img{max-width:100%;min-height:0;flex:1 1 auto;object-fit:contain}.akcja-film-plansza .akcja-plakat-zbiorka{position:static;transform:none}" +
    ".akcja-plakat-pelny{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.95);display:flex;align-items:center;justify-content:center;cursor:zoom-out}" +
    ".akcja-plakat-pelny img{max-width:100vw;max-height:100vh;object-fit:contain}" +
    ".akcja-firmy{flex-basis:100%;min-width:0;margin-top:14px}.akcja-firmy--strona{margin:14px 0}" +
    ".akcja-firmy--strona .akcja-firmy-blok{background:var(--card,#0f0f14);border:1px solid var(--border,rgba(255,255,255,.1));border-radius:18px;padding:16px}" +
    ".akcja-firmy-tytul{font:600 12px/1.3 Inter,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--fg2,rgba(240,237,232,.72));margin:0 0 12px}" +
    ".akcja-firmy-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}" +
    ".akcja-firma{display:flex;align-items:center;gap:10px;min-width:0;margin:0;font-size:14px;line-height:1.35}.akcja-firma+.akcja-firma{margin-top:0}" +
    ".akcja-firma-logo{flex:none;width:40px;height:40px;object-fit:contain;border-radius:8px;background:#fff;padding:3px;box-sizing:border-box}" +
    ".akcja-firma-tekst{min-width:0}.akcja-firma-nazwa{font-weight:600;color:var(--fg,#f0ede8);overflow-wrap:anywhere}a.akcja-firma-nazwa{color:#ff8a3d;text-decoration:underline}" +
    ".akcja-firma-kwota{margin-top:2px;font-size:12px;color:var(--fg2,rgba(240,237,232,.72))}" +
    ".akcja-firmy-uwaga{margin:10px 0 0;font-size:12px;line-height:1.5;color:var(--fg2,rgba(240,237,232,.72))}" +
    "#daily-motivation.akcja-baner{padding:0!important;overflow:hidden}#daily-motivation.akcja-baner>div:first-child,#daily-motivation.akcja-baner>#motiv-content{display:none!important}" +
    "#daily-motivation.akcja-baner>.film-powtorz{position:absolute!important;z-index:4!important;top:6px;right:50px;bottom:auto}" +
    "#daily-motivation.akcja-baner--zwiniety{min-height:0!important;height:auto!important}#daily-motivation.akcja-baner--zwiniety>.film-powtorz{display:none!important}" +
    ".akcja-dzis-zwiniety{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;margin:0;padding:10px 14px;box-sizing:border-box;border:0;border-radius:inherit;background:linear-gradient(90deg,rgba(166,73,44,.95),rgba(39,64,95,.95));color:#fff;font:700 14px/1.2 Inter,system-ui,sans-serif;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}" +
    ".akcja-dzis-zwiniety-tekst{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.akcja-dzis-zwiniety-pokaz{flex:none;color:#ffd3b0;white-space:nowrap}" +
    ".akcja-dzis{color:#fff;font-family:Inter,system-ui,sans-serif}" +
    ".akcja-dzis-scena{position:relative;height:284px;overflow:hidden;background:#27405f}.akcja-dzis-tlo{position:absolute;left:0;right:0;top:-56px}.akcja-dzis-tlo .us{margin:0}.akcja-dzis-tlo .um{margin:56px 12px 0}" +
    ".akcja-dzis-link{position:absolute;inset:0;z-index:2;-webkit-tap-highlight-color:transparent}" +
    ".akcja-dzis-liczby{position:absolute;left:10px;top:10px;z-index:3;padding:8px 13px 9px;border-radius:14px;background:rgba(10,12,22,.74);pointer-events:none}" +
    ".akcja-dzis-km{font-size:13px;line-height:1;white-space:nowrap}.akcja-dzis-km b{font:400 50px/.95 'Bebas Neue',Inter,sans-serif;letter-spacing:.02em;margin-right:6px}" +
    ".akcja-dzis-wklad{margin-top:5px;font-size:14px;font-weight:600}.akcja-dzis-wklad b{color:#ffb27d;font-weight:800}" +
    ".akcja-dzis-zobacz{position:absolute;right:10px;bottom:10px;z-index:3;padding:5px 10px;border-radius:10px;background:rgba(10,12,22,.68);font-size:12px;font-weight:700;pointer-events:none}" +
    ".akcja-dzis-scena--murek .akcja-dzis-zobacz{bottom:44px}" +
    ".akcja-dzis-film{display:block;width:100%;margin-top:8px;min-height:44px;padding:8px;border-radius:12px;border:1px dashed rgba(255,255,255,.3);background:transparent;color:#ffd3b0;font:700 14px Inter,system-ui,sans-serif;cursor:pointer}" +
    ".akcja-dzis-ukryj{position:absolute;top:8px;right:8px;z-index:5;width:34px;height:34px;padding:0;border:0;border-radius:50%;background:rgba(10,12,22,.72);color:#fff;font:600 22px/34px Inter,system-ui,sans-serif;text-align:center;cursor:pointer;-webkit-tap-highlight-color:transparent}.akcja-dzis-ukryj::after{content:'';position:absolute;inset:-6px}" +
    ".akcja-dzis-dane{padding:12px}.akcja-dzis-dane .akcja-liczby{margin-top:6px;color:#fff;font-size:13px;font-weight:700}" +
    ".akcja-dzis-filip{margin-top:6px;font-size:12px;line-height:1.45;color:rgba(255,255,255,.82)}" +
    ".akcja-dzis-przyciski{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}" +
    ".akcja-dzis-przycisk{display:flex;align-items:center;justify-content:center;min-height:56px;padding:8px;box-sizing:border-box;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:#fff;font-size:16px;font-weight:800;line-height:1.15;text-align:center;text-decoration:none;cursor:pointer}" +
    ".akcja-dzis-przycisk[hidden]{display:none}.akcja-dzis-przycisk--zbiorka{background:#e8561e;border-color:transparent}.akcja-dzis-przycisk--ulica{grid-column:1/-1;border-color:rgba(255,138,61,.75);color:#ffd3b0}";
  function wstrzyknijCss() {
    try {
      if (!g.document || g.document.getElementById("bm-akcja-css")) return;
      var st = g.document.createElement("style"); st.id = "bm-akcja-css"; st.textContent = CSS; g.document.head.appendChild(st);
    } catch (e) {}
  }

  /* FIRMY WSPIERAJĄCE AKCJĘ (Filip 4.11, migracja 20261104_akcja_firmy). Lista = akcja_licznik.firmy, tylko po starcie: niezalogowani dostają ją
     przez EF akcja-licznik, zalogowani przez RPC, bez nowych uprawnień dla anona. kwota_gr przychodzi z bazy WYŁĄCZNIE przy zgodzie firmy, a potwierdzenie
     wpłaty nie wychodzi z bazy wcale. Brak listy, pusta lista albo błąd → pusty napis, bez samego nagłówka. Imię w tytule z bazy (w kodzie go nie ma). */
  var TEKST_FIRM = "Firmy wpłacają bezpośrednio na zbiórkę. BiegaMy nie pośredniczy w pieniądzach. Wymienienie firmy to podziękowanie, nie reklama. Firmy nie używają imienia ani wizerunku dziecka bez zgody rodzica.";
  var BUCKET_LOGO = "akcja-firmy-logo";
  var LOGO_TYPY = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };   // bez SVG: to wektor XSS
  var LOGO_MAX_B = 1048576;   // ten sam limit co file_size_limit bucketu (zamkiem jest bucket)
  var RE_PLIK_LOGO = /^[0-9a-f-]{36}\.(png|jpg|webp)$/;   // nazwa z formularza: UUID + rozszerzenie z typu
  var RE_LINK_FIRMY = /^https:\/\/[^\s\/?#<>"'@\\]+\.[^\s\/?#<>"'@\\]+([\/?#][^\s<>"']*)?$/;   // ten sam wzorzec co CHECK w bazie
  function celownik(imie) {
    var s = String(imie || "").trim();
    if (!s) return "";
    if (/ek$/i.test(s)) return s.slice(0, -2) + "kowi";   // Marek → Markowi
    if (/[aeiouyąęó]$/i.test(s)) return "";               // Kuba → Kubie, Ania → Ani: bez słownika nie zgadujemy, tytuł bez imienia
    return s + "owi";                                     // Jan → Janowi
  }
  function tytulFirm(d) { var im = celownik(d && d.imie); return "Firmy, które pomogły" + (im ? " " + im : ""); }
  /** Link firmy: tylko https, przez safeExternalHref (wynik zaescapowany). Zły link → "" i sama nazwa bez odnośnika. */
  function linkFirmy(f) {
    var u = f && f.link;
    /* red team 2 (4.11): https://zly.example@a.pl przechodził na ekran, bo safeExternalHref widzi tylko schemat; CHECK w bazie go nie wpuści, a tu ten sam wzorzec na wypadek danych sprzed CHECK-a */
    if (typeof u !== "string" || !RE_LINK_FIRMY.test(u.trim()) || !g.safeExternalHref) return "";
    return g.safeExternalHref(u, { tylkoHttps: true });
  }
  /** Logo: wyłącznie plik z naszego bucketu, potem safeUrlAttr (jego lista hostów jest szersza niż ten bucket: Tenor, Giphy, GH Pages). */
  function logoFirmy(f) {
    var u = f && f.logo_url, pref = (g.SB_URL || "") + "/storage/v1/object/public/" + BUCKET_LOGO + "/";
    if (typeof u !== "string" || !g.SB_URL || u.indexOf(pref) !== 0 || !RE_PLIK_LOGO.test(u.slice(pref.length))) return "";
    return g.safeUrlAttr ? g.safeUrlAttr(u) : "";
  }
  function wierszFirmy(f) {
    var nazwa = f && typeof f.nazwa === "string" ? f.nazwa.trim() : "";
    if (!nazwa) return "";
    var link = linkFirmy(f), logo = logoFirmy(f), gr = Number(f.kwota_gr);
    return '<li class="akcja-firma">' + (logo ? '<img class="akcja-firma-logo" src="' + logo + '" alt="" loading="lazy">' : "") + '<div class="akcja-firma-tekst">' +
      (link ? '<a class="akcja-firma-nazwa" href="' + link + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(nazwa) + "</a>" : '<span class="akcja-firma-nazwa">' + esc(nazwa) + "</span>") +
      (f.wsparcie === "rzeczowe" ? '<div class="akcja-firma-kwota">Partner akcji</div>' : "") +
      (gr > 0 ? '<div class="akcja-firma-kwota">Wpłata: ' + esc(zl(gr)) + "</div>" : "") + "</div></li>";
  }
  /** Sekcja firm (dla-fabianka.html, karta na Dziś, karta w Okienku). Nigdy nie rzuca: awaria listy nie może zepsuć strony akcji. */
  function firmyHtml(d, klasa) {
    try {
      if (!d || !d.wystartowala || !Array.isArray(d.firmy)) return "";
      /* Partnerzy poprzednich wyzwań osobno: nie wpłacali na tę zbiórkę, więc nie stoją pod tytułem i tekstem o wpłatach. */
      var poprz = function (f) { return f && f.wsparcie === "poprzednie"; };
      var wiersze = d.firmy.filter(function (f) { return !poprz(f); }).map(wierszFirmy).join(""), wierszePoprz = d.firmy.filter(poprz).map(wierszFirmy).join("");
      if (!wiersze && !wierszePoprz) return "";
      wstrzyknijCss();
      return '<div class="akcja-firmy' + (klasa ? " " + klasa : "") + '">' +
        (wiersze ? '<div class="akcja-firmy-blok"><h3 class="akcja-firmy-tytul">' + esc(tytulFirm(d)) + "</h3>" + '<ul class="akcja-firmy-lista">' + wiersze + '</ul></div><p class="akcja-firmy-uwaga">' + esc(TEKST_FIRM) + "</p>" : "") +
        (wierszePoprz ? '<div class="akcja-firmy-blok"><h3 class="akcja-firmy-tytul">Partnerzy poprzednich wyzwań</h3><ul class="akcja-firmy-lista">' + wierszePoprz + "</ul></div>" : "") + "</div>";
    } catch (e) { return ""; }
  }
  /** Formularz w panelu trenera: te same reguły co CHECK-i w bazie, żeby błąd był po polsku (zamkiem jest baza). → { blad } | { wiersz }. */
  var BUDYNKI_POPRZEDNICH = ["osiedle", "galeria", "fabryka"];
  function firmaDoZapisu(p) {
    var o = p || {}, nazwa = String(o.nazwa == null ? "" : o.nazwa).trim(), link = String(o.link == null ? "" : o.link).trim();
    if (nazwa.length < 2 || nazwa.length > 120) return { blad: "Nazwa firmy: od 2 do 120 znaków." };
    /* nazwa stoi publicznie przy zbiórce dla dziecka; bez filtra (nie wczytał się) nie zapisujemy */
    var M = g.BM_MODERACJA;
    if (!M) return { blad: "Filtr nazw się nie wczytał. Odśwież stronę." };
    var filtr = M.sprawdz(nazwa, { rodzaj: "firma" });
    if (!filtr.ok && !(filtr.mozna_potwierdzic && o.nazwaSprawdzona === true)) return { blad: M.komunikat(filtr), mozna_potwierdzic: !!filtr.mozna_potwierdzic };
    if (link && !/^[a-z][a-z0-9+.-]*:/i.test(link)) link = "https://" + link;
    try { link = new URL(link).href; } catch (e) { return { blad: "Link: podaj adres strony firmy." }; }
    if (link.length > 500 || !RE_LINK_FIRMY.test(link)) return { blad: "Link: tylko adres zaczynający się od https://." };
    var kw = String(o.kwotaZl == null ? "" : o.kwotaZl).replace(/[\s ]/g, "").replace(/zł$/i, "").replace(",", "."), gr = null;
    if (kw) {
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(kw)) return { blad: "Kwota: podaj liczbę w złotych, np. 1000 albo 1000,50." };
      gr = Math.round(Number(kw) * 100);
      if (gr < 1) return { blad: "Kwota musi być większa od zera." };
    }
    if (o.zgoda === true && gr == null) return { blad: "Zgoda na podanie kwoty bez kwoty: wpisz kwotę albo odznacz zgodę." };
    if (o.zgodaWymienienie !== true) return { blad: "Zaznacz „Firma zgodziła się na wymienienie”." };
    var poprzedni = BUDYNKI_POPRZEDNICH.indexOf(o.rodzaj) >= 0, wsparcie = poprzedni ? "poprzednie" : o.wsparcie === "rzeczowe" ? "rzeczowe" : "wplata";   // próg i potwierdzenie dotyczą tylko wpłat na zbiórkę
    var tekstPlakatu = String(o.plakatTekst == null ? "" : o.plakatTekst).trim();
    if (poprzedni && gr != null) return { blad: "Partner poprzedniego wyzwania jest bez kwoty." };
    if (tekstPlakatu && (tekstPlakatu.length < 2 || tekstPlakatu.length > 120)) return { blad: "Tekst plakatu: od 2 do 120 znaków." };
    if (wsparcie === "wplata" && o.potwierdzenie !== true) return { blad: "Zaznacz potwierdzenie wpłaty." };
    var wiersz = { nazwa: nazwa, link: link, rodzaj: poprzedni || o.rodzaj === "wiezowiec" || o.rodzaj === "cegielka" ? o.rodzaj : "domek", wsparcie: wsparcie, kwota_gr: gr, zgoda_na_kwote: o.zgoda === true, potwierdzenie_widziane: wsparcie === "wplata", zgoda_na_wymienienie: true };
    /* Partner: logo i plakat tylko po zgodzie, przełącznik na wpisie. Firmy akcji zostają przy domyślnej zgodzie z bazy. */
    if (poprzedni) { wiersz.logo_zgoda = o.logoZgoda === true; wiersz.plakat_tekst = tekstPlakatu || null; }
    return { wiersz: wiersz };
  }
  /** Edycja firmy z listy: tylko kolumny, które baza pozwala zmieniać. Kwota i zgoda na nią zostają z dodania. */
  function firmaDoEdycji(w) {
    var o = { nazwa: w.nazwa, link: w.link, rodzaj: w.rodzaj, wsparcie: w.wsparcie, potwierdzenie_widziane: w.potwierdzenie_widziane };
    if (w.logo_url) o.logo_url = w.logo_url;
    if (w.wsparcie === "poprzednie") { o.logo_zgoda = w.logo_zgoda === true; o.plakat_tekst = w.plakat_tekst || null; if (w.plakat_url) o.plakat_url = w.plakat_url; }
    return o;
  }
  /** Plik logo przed wysłaniem: typ i rozmiar jak w buckecie (zamkiem jest bucket). → { rozszerzenie } | { blad }; bez pliku { rozszerzenie: null }. */
  function logoDoWgrania(plik) {
    if (!plik) return { rozszerzenie: null };
    if (!Object.prototype.hasOwnProperty.call(LOGO_TYPY, plik.type)) return { blad: "Logo: tylko PNG, JPEG albo WebP." };
    if (!(plik.size > 0) || plik.size > LOGO_MAX_B) return { blad: "Logo: plik do 1 MB." };
    return { rozszerzenie: LOGO_TYPY[plik.type] };
  }

  /** Pasek celu (HTML) — wspólny dla Dziś, index i dla-fabianka. */
  /* PRÓG KILOMETRÓW RAZEM (11.11, część 9): licznik minął 1 000 km bez żadnego znaku (filmy progów prawdziwej akcji: 0; odznaki 1000 km zdjęte 2.11; push tylko start, niedziela,
     zamknięcie). Dla każdego progu z PROGI_KM (i dla celu) jednorazowe świętowanie bez filmu: baner „X km razem” w kaflu akcji i na stronie akcji przez 48 h od pierwszego
     zobaczenia na tym urządzeniu (licznik nie oddaje chwili przekroczenia), konfetti RAZ na konto/urządzenie (prefers-reduced-motion: bez ruchu), „Udostępnij” z gotową grafiką
     (js/akcja-wklad-karta.mjs, po dotknięciu). Film progu, gdy się pojawi, ma pierwszeństwo: konfetti ustępuje czekającemu filmowi, baner zostaje jako dodatek. Zero zapytań. */
  var PROGI_KM = [1000, 2500, 5000, 7500, 10000], BANER_PROGU_MS = 48 * 3600 * 1000, KLUCZ_PROGU = "bm_akcja_prog_";
  function progiAkcji(d) { var cel = Number(d && d.cel_km) || 0; return PROGI_KM.filter(function (p) { return !cel || p < cel; }).concat(cel ? [cel] : []); }
  /** Najwyższy próg nieprzekraczający sumy kilometrów (null poniżej pierwszego). */
  function progPrzekroczony(d) { var s = Number(d && d.suma_km) || 0, w = null; progiAkcji(d).forEach(function (p) { if (s >= p) w = p; }); return w; }
  function klucz(slug, p, co) { return KLUCZ_PROGU + slug + "_" + p + (co ? "_" + co : ""); }
  function pamiec(k, v) { try { if (v === undefined) return g.localStorage.getItem(k); g.localStorage.setItem(k, v); } catch (e) {} return null; }
  function tekstProgu(p, d) { var cel = Number(d && d.cel_km) || 0; return p === cel && cel ? km(p) + " km. Cel osiągnięty razem." : km(p) + " km razem"; }
  /** Baner progu (albo ""): zapamiętuje pierwsze pokazanie i pokazuje przez 48 h. teraz = czas (test). */
  function banerProguHtml(d, teraz) {
    if (!d || !d.wystartowala) return "";
    var p = progPrzekroczony(d); if (!p) return "";
    var slug = slugKafla(d), t = teraz || Date.now(), k = klucz(slug, p), od = Number(pamiec(k));
    if (!od) { od = t; pamiec(k, String(t)); }
    if (t - od >= BANER_PROGU_MS) return "";
    g.setTimeout(function () { konfettiProgu(slug, p); }, 0);
    return '<div class="akcja-prog" role="status"><b>' + esc(tekstProgu(p, d)) + '</b><span>Razem, krok po kroku. Dziękujemy.</span><button type="button" class="akcja-link akcja-prog-udostepnij" data-prog-udostepnij="' + p + '">Udostępnij</button></div>';
  }
  function bezRuchu() { try { return !!(g.matchMedia && g.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } }
  function filmCzeka() { try { return !!(g.FILM_DZIS && g.FILM_DZIS.czekaFilmAkcji && g.FILM_DZIS.czekaFilmAkcji()); } catch (e) { return false; } }
  /** Konfetti raz na konto i urządzenie; bez ruchu przy reduced-motion; ustępuje czekającemu filmowi akcji (film ma pierwszeństwo, baner zostaje). */
  function konfettiProgu(slug, p) {
    if (!g.document || !g.document.body) return false;
    var k = klucz(slug, p, "konfetti"); if (pamiec(k)) return false;
    if (filmCzeka()) return false;
    pamiec(k, String(Date.now()));
    if (bezRuchu() || !g.requestAnimationFrame) return false;
    var c = g.document.createElement("canvas"); c.id = "bm-akcja-konfetti"; c.setAttribute("aria-hidden", "true"); c.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1200";
    c.width = g.innerWidth || 360; c.height = g.innerHeight || 640; g.document.body.appendChild(c);
    var x = c.getContext && c.getContext("2d"); if (!x) { c.remove(); return false; }
    var kolory = ["#e8561e", "#f2b32a", "#6f9e3e", "#d9482b", "#ff8a3d", "#3d5a99", "#fff7e6"], cz = [], start = null;
    for (var i = 0; i < 120; i++) cz.push({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5, vx: (Math.random() - 0.5) * 1.6, vy: 2 + Math.random() * 3, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.2, w: 6 + Math.random() * 8, h: 4 + Math.random() * 4, kol: kolory[i % kolory.length] });
    g.requestAnimationFrame(function klatka(t) {
      if (start == null) start = t; var dt = t - start; x.clearRect(0, 0, c.width, c.height);
      cz.forEach(function (q) { q.x += q.vx; q.y += q.vy; q.r += q.vr; x.save(); x.translate(q.x, q.y); x.rotate(q.r); x.fillStyle = q.kol; x.globalAlpha = Math.max(0, 1 - Math.max(0, dt - 1800) / 900); x.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); x.restore(); });
      if (dt < 2700) g.requestAnimationFrame(klatka); else c.remove();
    });
    return true;
  }
  if (g.document) g.document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-prog-udostepnij]") : null; if (!b) return;
    e.preventDefault();
    var d = (_kafelDane && _kafelDane[0]) || _ostatniLicznikProgu, p = Number(b.getAttribute("data-prog-udostepnij")) || progPrzekroczony(d), pokaz = function () { if (g.BM_WKLAD_KARTA && g.BM_WKLAD_KARTA.pokazProg) g.BM_WKLAD_KARTA.pokazProg(d, p, adresStrony(d)); };
    if (g.BM_WKLAD_KARTA) return pokaz();
    var el = g.document.createElement("script"); el.src = "js/akcja-wklad-karta.mjs"; el.async = true; el.onload = pokaz;
    g.document.head.appendChild(el);
  });
  var _ostatniLicznikProgu = null;
  function pasekHtml(d) {
    wstrzyknijCss();
    var p = pct(d); _ostatniLicznikProgu = d;
    return banerProguHtml(d) + '<div class="akcja-pasek" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '">' +
      '<div class="akcja-pasek-wypelnienie" style="width:' + p + '%"></div></div>' +
      '<div class="akcja-liczby"><b>' + km(d.suma_km) + '</b> z ' + km(d.cel_km) + ' km · ' + liczba(p, p < 10 ? 1 : 0) + '%</div>';
  }

  /** Karta na Dziś (zalogowani). wklad = akcja_moj_wklad. */
  /* Filip 2.11 18:35: do akcji liczą się TYLKO bieg i chód — lista typów w bazie (public.akcja_typ_liczy), tu tylko zdanie. */
  var TEKST_TYPOW = "Liczy się bieg i spacer. Rower nie.";
  var _filmKarty = null, _firmyCzekaja = null, _firmyT = 0;
  /* „Firmy do sprawdzenia: N” na Dziś trenera. Baza oddaje liczbę tylko trenerowi, inni dostają null i nic nie świeci. Raz na minutę, bez wpływu na kartę. */
  function sprawdzFirmyDoSprawdzenia() {
    if (!g.sb || !g.document || typeof g.sb.rpc !== "function") return;
    var teraz = Date.now(), pokaz = function () { g.document.querySelectorAll("[data-firmy-czekaja]").forEach(function (e) { e.hidden = !(_firmyCzekaja > 0); e.textContent = "Firmy do sprawdzenia: " + (_firmyCzekaja || 0); }); };
    if (teraz - _firmyT < 60000) { g.setTimeout(pokaz, 0); return; }
    _firmyT = teraz;
    Promise.resolve(g.sb.rpc("akcja_firmy_do_sprawdzenia")).then(function (r) { _firmyCzekaja = r && !r.error ? r.data : null; pokaz(); }, function () {});
  }
  /* KAFEL AKCJI NA DZIŚ (Filip 5.11): gdy akcja trwa, duży kafel z cytatem ustępuje żywej Ulicy z licznikiem i czterema przyciskami. zawodnik.html jest zamrożony, więc podmiana idzie stąd, w tym samym banerze: film akcji gra nad kaflem jak dotąd, a cytat czeka pod klasą i wraca po zdjęciu kafla. Licznik i wkład z tych samych danych co karta, bez nowego odpytywania. */
  function banerDzis() { return g.document && g.document.getElementById ? g.document.getElementById("daily-motivation") : null; }
  /* PIERWSZY KILOMETR (11.11; stan 10.11: 75 kont od 7.11, 62 bez żadnej aktywności): gdy własny wkład to 0 km, zamiast „Twój wkład: 0 km” jedno zdanie i przycisk,
     który prowadzi najkrótszą drogą do dodania aktywności (formularz treningu na Dziś z ustawionym typem „Spacer”). Po pierwszym kilometrze wraca zwykły wkład
     i jednorazowe podziękowanie (10 minut od pierwszego pokazania, potem nigdy). Flaga w localStorage, żadnych nowych zapytań: wkład przychodzi jak dotąd z akcja_moj_wklad. */
  var KLUCZ_PIERWSZY = "bm_akcja_pierwszy_km_", DZIEKI_MS = 10 * 60 * 1000;
  function flagaPierwszego(slug, wartosc) { try { if (wartosc === undefined) return g.localStorage.getItem(KLUCZ_PIERWSZY + slug); if (wartosc === null) g.localStorage.removeItem(KLUCZ_PIERWSZY + slug); else g.localStorage.setItem(KLUCZ_PIERWSZY + slug, wartosc); } catch (e) {} return null; }
  /** Wiersz wkładu na kaflu i w karcie: zero → zdanie i przycisk; więcej → „Twój wkład: X km”, przycisk „Pokaż mój wkład” i (raz) podziękowanie. teraz = czas (test). */
  function wkladHtml(d, wklad, klasa, teraz) {
    var slug = slugKafla(d), kmW = Number(wklad && wklad.km) || 0, t = teraz || Date.now();
    if (wklad && !(kmW > 0)) {
      if (flagaPierwszego(slug) == null) flagaPierwszego(slug, "0");
      return '<div class="' + klasa + ' akcja-wklad--zero">Spacer też buduje ulicę. <button type="button" class="akcja-pierwszy" data-pierwszy-km>Dodaj pierwszy kilometr ›</button></div>';
    }
    var dzieki = "", f = flagaPierwszego(slug);
    if (kmW > 0 && f === "0") { flagaPierwszego(slug, "1:" + t); f = "1:" + t; }
    if (kmW > 0 && f && f.indexOf("1:") === 0) { if (t - Number(f.slice(2)) < DZIEKI_MS) dzieki = '<div class="akcja-dzieki">Pierwszy kilometr na ulicy. Dziękujemy.</div>'; else flagaPierwszego(slug, "2"); }
    return '<div class="' + klasa + '">Twój wkład: <b>' + km(kmW) + ' km</b>' + (wklad && kmW > 0 ? ' <button type="button" class="akcja-link akcja-moj-wklad" data-moj-wklad>Pokaż mój wkład</button>' : "") + '</div>' + dzieki;
  }
  function liczbyKaflaHtml(d, wklad) {
    return '<div class="akcja-dzis-km"><b>' + km(d.suma_km) + "</b>z " + km(d.cel_km) + ' km</div>' + wkladHtml(d, wklad, "akcja-dzis-wklad");
  }
  function daneKaflaHtml(d) {
    var p = pct(d), pl = plakatUrl(d), zb = linkZbiorki(d);
    return banerProguHtml(d) + '<div class="akcja-pasek" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '"><div class="akcja-pasek-wypelnienie" style="width:' + p + '%"></div></div>' +
      '<div class="akcja-liczby">' + liczba(p, p < 10 ? 1 : 0) + "% celu</div>" +
      '<div class="akcja-dzis-filip">' + esc(tekstFilipa(d)) + "</div>" +
      '<div class="akcja-dzis-przyciski">' +
      (pl ? '<a class="akcja-dzis-przycisk" href="' + pl + '" data-plakat="' + pl + '"' + (zb ? ' data-zbiorka="' + zb + '"' : "") + ' target="_blank" rel="noopener noreferrer">Plakat</a>' : "") +
      '<a class="akcja-dzis-przycisk" data-gra-link href="' + linkGry(d) + '"' + (graWidoczna(d) ? "" : " hidden") + ">Gra</a>" +
      (zb ? '<a class="akcja-dzis-przycisk akcja-dzis-przycisk--zbiorka" href="' + zb + '" target="_blank" rel="noopener noreferrer">Zbiórka</a>' : "") +
      (formularzFirm(d) ? '<a class="akcja-dzis-przycisk akcja-dzis-przycisk--ulica" href="' + adresStrony(d, "#firma") + '">Twoja firma lub cegiełka na Ulicy</a>' : "") + "</div>" +
      /* Film startu raz na konto (9.11): po nim baner już go nie gra sam, więc tu można wrócić. Odtwarza ta sama nakładka co „Zobacz film” w karcie. */
      (g.BM_AKCJA_CYTATY && g.BM_AKCJA_CYTATY.filmAkcjiZLicznika && g.BM_AKCJA_CYTATY.filmAkcjiZLicznika(d) ? '<button type="button" class="akcja-dzis-film" data-film-akcji="1">▶ Zobacz film startu</button>' : "");
  }
  /* ZWIŃ KAFEL (Filip 9.11, po wdrożeniu 73d95ab1): krzyżyk nie usuwa akcji z Dziś, tylko ZWIJA kafel do jednego niskiego paska (ok. 44 px) w tym samym miejscu:
     „🧱 Ulica <imię z bazy> · <km z licznika> km · Pokaż ›”. Dotknięcie paska rozwija kafel i zapisuje to w profilu (akcja_kafel_ukryj(slug, false), jak „Pokaż”
     w Ustawieniach profilu, które zostają drugą drogą). Pasek nie ma krzyżyka: bardziej schować się nie da. Zwinięcie w profilu (akcja_ukryte), w telefonie kopia,
     żeby nic nie mignęło przed odpowiedzią bazy: "1" zwinięty, "czeka" zwinięty bez sieci, "pokaz-czeka" rozwinięty bez sieci. Mała karta przy zwiniętym kaflu nie stoi. */
  var KLUCZ_UKRYCIA = "bm_akcja_ukryta_", _ukrycieSprawdzone = {};
  function slugKafla(d) { return czyProba(d) ? "proba" : "dla-fabianka"; }
  function kluczUkrycia(slug) { var uid = kontoSesji(); return uid ? KLUCZ_UKRYCIA + slug + "_" + uid : ""; }
  function czytajUkrycie(slug) { try { var k = kluczUkrycia(slug); return k ? g.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function zapiszUkrycie(slug, v) { try { var k = kluczUkrycia(slug); if (!k) return; if (v) g.localStorage.setItem(k, v); else g.localStorage.removeItem(k); } catch (e) {} }
  function zwiniety(slug) { var v = czytajUkrycie(slug); return v === "1" || v === "czeka"; }
  function rpcUkryj(slug) {
    return Promise.resolve(g.sb.rpc("akcja_kafel_ukryj", { p_slug: slug, p_ukryj: true })).then(function (r) { if (r && !r.error) zapiszUkrycie(slug, "1"); }, function () {});
  }
  function rpcPokaz(slug) {
    return Promise.resolve(g.sb.rpc("akcja_kafel_ukryj", { p_slug: slug, p_ukryj: false })).then(function (r) { if (r && !r.error) zapiszUkrycie(slug, ""); }, function () {});
  }
  function sprawdzUkrycie(slug, d, wklad) {
    if (_ukrycieSprawdzone[slug] || !g.sb || typeof g.sb.rpc !== "function" || !kontoSesji()) return;
    _ukrycieSprawdzone[slug] = true;
    var lok = czytajUkrycie(slug);
    if (lok === "czeka") { rpcUkryj(slug); return; }   // zwinięty bez sieci: dopisz do profilu
    if (lok === "pokaz-czeka") { rpcPokaz(slug); return; }   // rozwinięty bez sieci: dopisz do profilu
    Promise.resolve(g.sb.rpc("akcja_kafel_ukryty", { p_slug: slug })).then(function (r) {
      if (!r || r.error || typeof r.data !== "boolean") return;   // baza bez migracji albo błąd: zostaje kopia z telefonu
      if (r.data && !lok) { zapiszUkrycie(slug, "1"); wstawKafel(d, wklad); }   // zwinięty na innym telefonie: tu pasek
      else if (!r.data && lok) { zapiszUkrycie(slug, ""); wstawKafel(d, wklad); }   // rozwinięty w Ustawieniach albo na innym telefonie
    }, function () {});
  }
  /* Napis przycisku w Ustawieniach z imieniem z bazy (w kodzie imienia nie ma, blizna-150): zapisany, gdy kafel był widoczny. */
  var KLUCZ_ETYKIETY = "bm_akcja_etykieta_pokaz";
  function etykietaPokaz(d) { var im = dopelniacz(d && d.imie); return im ? "Pokaż akcję " + im : "Pokaż kafel akcji"; }
  function ukryjKafel(slug) {
    zapiszUkrycie(slug, "czeka");
    if (_kafelDane) wstawKafel(_kafelDane[0], _kafelDane[1]); else zdejmijKafel();   // ten sam licznik: od razu pasek
    if (g.showToast) g.showToast("Kafel akcji zwinięty. Dotknij paska, żeby go rozwinąć.");
    if (g.sb && typeof g.sb.rpc === "function") rpcUkryj(slug);
  }
  function rozwinKafel(slug) {
    zapiszUkrycie(slug, "pokaz-czeka");
    if (_kafelDane) wstawKafel(_kafelDane[0], _kafelDane[1]);
    if (g.sb && typeof g.sb.rpc === "function") rpcPokaz(slug);
  }
  /** Napis paska: imię w dopełniaczu z bazy (licznik), km z licznika. Bez imienia: „Ulica akcji”. */
  function tekstPaska(d) { var im = dopelniacz(d && d.imie); return "🧱 " + (im ? "Ulica " + im : "Ulica akcji") + " · " + km(d && d.suma_km) + " km"; }
  function wstawPasek(b, d) {
    var p = null;
    for (var i = 0; b.children && i < b.children.length; i++) if (b.children[i].className === "akcja-dzis-zwiniety") p = b.children[i];
    if (!p) {
      p = g.document.createElement("button"); p.className = "akcja-dzis-zwiniety"; p.setAttribute("type", "button"); p.setAttribute("aria-expanded", "false");
      p.addEventListener("click", function (e) { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); rozwinKafel(p.getAttribute("data-slug") || "dla-fabianka"); });
      b.appendChild(p);
    }
    p.setAttribute("data-slug", slugKafla(d));
    p.setAttribute("aria-label", tekstPaska(d).replace(/^🧱 /, "") + ". Pokaż kafel akcji");
    p.innerHTML = '<span class="akcja-dzis-zwiniety-tekst">' + esc(tekstPaska(d)) + '</span><span class="akcja-dzis-zwiniety-pokaz">Pokaż ›</span>';
    b.classList.add("akcja-baner"); b.classList.add("akcja-baner--zwiniety");
  }
  function zdejmijPasek(b) {
    for (var i = (b.children ? b.children.length : 0) - 1; i >= 0; i--) if (b.children[i].className === "akcja-dzis-zwiniety") b.removeChild(b.children[i]);
    b.classList.remove("akcja-baner--zwiniety");
  }
  /** Kafel ma murek darczyńców (pas na dole sceny): napis „Zobacz ulicę” idzie nad niego. */
  function maMurek(d) {
    var u = d && d.ulica;
    if (!u || typeof u !== "object") return false;
    return Number(u.cegly_n) > 0 || (Array.isArray(u.imiona) && u.imiona.length > 0) || Number(u.bez_imienia) > 0 || (Array.isArray(d.firmy) && d.firmy.some(function (f) { return f && f.rodzaj === "cegielka"; }));
  }
  var _ostatniWklad = null, _kafelDane = null;   // zapytanie o wkład nie przeszło (tłok, brak sieci): ostatnia znana liczba, nie „0 km”
  function wstawKafel(d, wklad) {
    var b = banerDzis();
    if (!b) return;
    var slug = slugKafla(d);
    _kafelDane = [d, wklad];
    sprawdzUkrycie(slug, d, wklad);
    wstrzyknijCss();
    if (zwiniety(slug)) { zdejmijSamKafel(b); wstawPasek(b, d); return; }
    zdejmijPasek(b);
    if (wklad) _ostatniWklad = wklad;
    var k = b.querySelector(".akcja-dzis");
    if (!k) {
      k = g.document.createElement("div"); k.className = "akcja-dzis";
      k.innerHTML = '<div class="akcja-dzis-scena"><div class="akcja-dzis-tlo"></div><a class="akcja-dzis-link" aria-label="Zobacz całą Ulicę"></a><div class="akcja-dzis-liczby"></div><span class="akcja-dzis-zobacz" aria-hidden="true">Zobacz ulicę ›</span><button type="button" class="akcja-dzis-ukryj" aria-label="Ukryj kafel akcji" title="Ukryj">×</button></div><div class="akcja-dzis-dane"></div>';
      k.querySelector(".akcja-dzis-ukryj").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); ukryjKafel(k.getAttribute("data-slug") || "dla-fabianka"); });
      b.appendChild(k); b.classList.add("akcja-baner");
    }
    k.setAttribute("data-slug", slug);
    try { g.localStorage.setItem(KLUCZ_ETYKIETY, etykietaPokaz(d)); } catch (e) {}
    k.querySelector(".akcja-dzis-scena").setAttribute("class", "akcja-dzis-scena" + (maMurek(d) ? " akcja-dzis-scena--murek" : ""));
    k.querySelector(".akcja-dzis-link").setAttribute("href", adresStrony(d, "#ulica-po"));
    k.querySelector(".akcja-dzis-liczby").innerHTML = liczbyKaflaHtml(d, wklad || _ostatniWklad);
    k.querySelector(".akcja-dzis-dane").innerHTML = daneKaflaHtml(d);
    zUlica(function (U) { U.naKaflu(k.querySelector(".akcja-dzis-tlo"), d); });
  }
  function zdejmijSamKafel(b) {
    var k = b.querySelector(".akcja-dzis");
    if (!k) return;
    if (g.BM_ULICA && g.BM_ULICA.usun) g.BM_ULICA.usun(k.querySelector(".akcja-dzis-tlo"));
    k.parentNode.removeChild(k);
  }
  /** Koniec akcji, „od zera” na próbie: kafel i pasek znikają, wraca cytat. */
  function zdejmijKafel() {
    var b = banerDzis();
    if (!b) return;
    zdejmijSamKafel(b); zdejmijPasek(b);
    b.classList.remove("akcja-baner");
  }
  /* KARTA Z PAMIĘCI (zgłoszenie testera 6.11): Dziś pokazuje kafel i kartę akcji od pierwszego obrazu, z ostatniego stanu tego konta, a dane z bazy
     podmieniają je w tym samym miejscu. Bez adresów plików na 15 minut (rysunek, arkusz, film, muzyka; na próbie także plakat). Plakat prawdziwej akcji
     ma adres roczny, więc zostaje. Do tego ostatnia wysokość karty jako szkielet: nic nie doskakuje, zanim dojdą obrazki. Stan inny niż „trwa” kasuje pamięć. */
  var KLUCZ_KARTY = "bm_akcja_ostatnia_karta", BEZ_ADRESOW = ["koparka_url", "koparka_arkusz_url", "film_akcji_url", "wizerunek", "muzyka"], WAZNOSC_KARTY_MS = 24 * 3600 * 1000;
  function kontoSesji() {
    try { var s = JSON.parse(g.localStorage.getItem("sb-afqojgkaveykxbltxzwm-auth-token") || "null"); return (s && s.user && s.user.id) || null; } catch (e) { return null; }
  }
  function zapamietajKarte(d, wklad, s) {
    var uid = kontoSesji(); if (!uid || !g.localStorage) return;
    try {
      if (s !== "trwa") { g.localStorage.removeItem(KLUCZ_KARTY); return; }
      var bez = {}; Object.keys(d).forEach(function (k) { if (BEZ_ADRESOW.indexOf(k) < 0 && !(k === "plakat_url" && d.testowa === true)) bez[k] = d[k]; });
      var el = g.document && g.document.getElementById && g.document.getElementById("akcja-karta"), stara = null;
      try { stara = JSON.parse(g.localStorage.getItem(KLUCZ_KARTY) || "null"); } catch (e) { stara = null; }
      var zapis = { uid: uid, t: Date.now(), d: bez, wklad: wklad || null, wys: stara && stara.uid === uid ? stara.wys : 0 };
      g.localStorage.setItem(KLUCZ_KARTY, JSON.stringify(zapis));
      if (el) {
        el.style.minHeight = "";   // dane z bazy: szkielet niepotrzebny
        /* Wysokość po wstawieniu karty i dojściu obrazków: szkielet na następne wejście. */
        if (g.setTimeout) g.setTimeout(function () { try { var h = el.offsetHeight; if (h > 0) { zapis.wys = h; g.localStorage.setItem(KLUCZ_KARTY, JSON.stringify(zapis)); } } catch (e) {} }, 4000);
      }
    } catch (e) {}
  }
  function kartaZPamieci() {
    var el = g.document && g.document.getElementById && g.document.getElementById("akcja-karta");
    if (!el || el.innerHTML || !banerDzis()) return false;
    var o = null; try { o = JSON.parse(g.localStorage.getItem(KLUCZ_KARTY) || "null"); } catch (e) { o = null; }
    if (!o || !o.d || o.uid !== kontoSesji() || !(Date.now() - o.t < WAZNOSC_KARTY_MS) || stanKarty(o.d) !== "trwa") return false;
    el.innerHTML = kartaDzisHtml(o.d, o.wklad, undefined, true);
    el.style.display = el.innerHTML ? "" : "none";
    if (o.wys > 0) el.style.minHeight = o.wys + "px";
    return true;
  }
  /* JEDNA WERSJA NA DZIŚ (Filip 9.11): kafel u góry i karta „Centrum Akcji” niżej pokazywały to samo (Ulica, licznik, pasek, wkład, Gra, Zbiórka, Firma, plakat, film).
     Gdy stoi kafel, karta zostaje tylko z tym, czego kafel nie ma: nazwa, „Zostań sponsorem kilometrów” (formularz musi być w #akcja-karta, obsługa w zawodnik.html)
     i „Więcej o akcji”. Kafel ukryty krzyżykiem = akcja znika z Dziś także z karty. Bez banera (inne strony) karta pełna jak dotąd. */
  function kafelNaDzis(d) { var b = banerDzis(); return !!(b && b.querySelector && b.querySelector(".akcja-dzis")); }
  /* Karta poza Dziś (8a, zgłoszenie 9.11): zawodnik.html chowa .fade-in przy zmianie zakładki, ale render karty przychodzi później (po RPC) i odsłania ją
     na Społeczności. Po każdym renderze: gdy bieżąca sekcja to nie Dziś (window._currentSection z showSection), karta wraca do ukrycia. */
  function pilnujSekcji() {
    if (!g.setTimeout || !g.document || !g.document.getElementById) return;
    g.setTimeout(function () { try { var el = g.document.getElementById("akcja-karta"); if (el && g._currentSection && g._currentSection !== "home") el.style.display = "none"; } catch (e) {} }, 0);
  }
  function kartaDzisHtml(d, wklad, teraz, zPamieci) {
    var s = stanKarty(d, teraz);
    if (!zPamieci && d) zapamietajKarte(d, wklad, s);
    if (s === "trwa") wstawKafel(d, wklad); else zdejmijKafel();
    if (s === "brak") return "";
    wstrzyknijCss();
    pilnujSekcji();
    var link = linkZbiorki(d), mojeKm = wklad && wklad.km != null ? km(wklad.km) : "0";
    if (s === "trwa" && banerDzis()) {
      if (!kafelNaDzis(d)) return "";   // kafel ukryty przez konto: bez karty
      var film0 = g.BM_AKCJA_CYTATY && g.BM_AKCJA_CYTATY.filmAkcjiZLicznika ? g.BM_AKCJA_CYTATY.filmAkcjiZLicznika(d) : null;
      _filmKarty = film0;
      sprawdzFirmyDoSprawdzenia();
      return '<div class="akcja-karta akcja-centrum akcja-centrum--waska"><a class="akcja-kafel akcja-kafel--wplata" data-firmy-czekaja href="trener.html#firmy-sec" hidden></a><div class="akcja-nazwa">' + esc(d.nazwa) + '</div>' +
        sponsorHtml(wklad, d) +
        '<details class="akcja-wiecej-blok"><summary>Więcej o akcji</summary>' +
        '<div class="akcja-typy">' + TEKST_TYPOW + '</div>' +
        (tekstSponsorow(d) ? '<div class="akcja-sponsorzy">' + esc(tekstSponsorow(d)) + '</div>' : "") +
        (tekstWyprawy(d) ? '<div class="akcja-wyprawa">' + esc(tekstWyprawy(d)) + '</div>' : "") +
        '<div class="akcja-przyciski"><a class="akcja-wiecej" href="' + adresStrony(d) + '">Szczegóły ›</a>' +
        (wklad && Number(wklad.km) > 0 ? '<button type="button" class="akcja-link" data-akcja="udostepnij">Udostępnij</button>' : "") + "</div>" + firmyHtml(d) + "</details></div>";
    }
    if (s === "zamknieta") {
      return '<div class="akcja-karta akcja-karta--koniec"><div class="akcja-nazwa">' + esc(d.nazwa) + '</div>' +
        punktUlicy(d) +
        '<div class="akcja-zrobione">Zrobiliśmy to: ' + km(d.suma_km) + ' km · Ty: ' + mojeKm + ' km</div>' +
        (link ? '<a class="akcja-link" href="' + link + '" target="_blank" rel="noopener noreferrer">Oficjalna zbiórka ›</a>' : "") + firmyHtml(d) + "</div>";
    }
    /* CENTRUM AKCJI (Filip 4.11): lekki podgląd Ulicy z licznikiem (dotknięcie prowadzi do pełnej sceny), licznik, własny wkład i kafle. Pełna scena nie ładuje się tutaj. */
    var film = g.BM_AKCJA_CYTATY && g.BM_AKCJA_CYTATY.filmAkcjiZLicznika ? g.BM_AKCJA_CYTATY.filmAkcjiZLicznika(d) : null;
    _filmKarty = film;
    var kafel = function (html, tytul) { return html.replace("{T}", esc(tytul)); };
    var kafle = '<a class="akcja-kafel" data-gra-link href="' + linkGry(d) + '"' + (graWidoczna(d) ? "" : " hidden") + ">Zagraj w Cegiełki</a>" +
      (link ? kafel('<a class="akcja-kafel akcja-kafel--wplata" href="' + link + '" target="_blank" rel="noopener noreferrer">{T}</a>', "Wpłać na zbiórkę") : "") +
      (d.firmy_zgloszenia === true || d.kontakt_firmy ? kafel('<a class="akcja-kafel" href="' + adresStrony(d, "#firma") + '">{T}</a>', "Twoja firma na ulicy") : "") +
      (film ? '<button type="button" class="akcja-kafel" data-film-akcji="1">Zobacz film</button>' : "");
    sprawdzFirmyDoSprawdzenia();
    return '<div class="akcja-karta akcja-centrum"><a class="akcja-kafel akcja-kafel--wplata" data-firmy-czekaja href="trener.html#firmy-sec" hidden></a><div class="akcja-nazwa">' + esc(d.nazwa) + '</div>' + punktUlicy(d) + plakatHtml(d, "akcja-plakat--dzis") + pasekHtml(d) +
      wkladHtml(d, wklad, "akcja-ja") +
      '<div class="akcja-typy">' + TEKST_TYPOW + '</div>' +
      '<div class="akcja-kafle">' + kafle + '</div>' +
      sponsorHtml(wklad, d) +
      '<details class="akcja-wiecej-blok"><summary>Więcej o akcji</summary>' +
      '<div class="akcja-filip">' + esc(tekstFilipa(d)) + '</div>' +
      (tekstSponsorow(d) ? '<div class="akcja-sponsorzy">' + esc(tekstSponsorow(d)) + '</div>' : "") +
      (tekstWyprawy(d) ? '<div class="akcja-wyprawa">' + esc(tekstWyprawy(d)) + '</div>' : "") +
      '<div class="akcja-przyciski"><a class="akcja-wiecej" href="' + adresStrony(d) + '">Szczegóły ›</a>' +
      (wklad && Number(wklad.km) > 0 ? '<button type="button" class="akcja-link" data-akcja="udostepnij">Udostępnij</button>' : "") + "</div>" + firmyHtml(d) + "</details></div>";
  }
  /* Pierwszy kilometr: najkrótsza droga do dodania spaceru. Na Dziś formularz treningu jest na stronie (openModal + selType z zamrożonego zawodnik.html, wołane
     przez window): otwieramy go, zaznaczamy „Spacer” i stawiamy kursor w dystansie. Gdzie formularza nie ma, link na Dziś z #log. */
  function otworzPierwszyKm() {
    if (typeof g.openModal === "function") {
      /* openModal jest asynchroniczny i po otwarciu dopisuje typ z dzisiejszego planu: Spacer wybieramy dopiero, gdy skończy (sprawdzone na prawdziwym zawodnik.html 11.11) */
      var otwarcie = null; try { otwarcie = g.openModal(); } catch (e) {}
      Promise.resolve(otwarcie).catch(function () {}).then(function () {
        g.setTimeout(function () {
          try {
            var pill = null; (g.document.querySelectorAll(".type-pill[onclick]") || []).forEach(function (p) { if (!pill && /selType\(this,\s*'Spacer'\)/.test(p.getAttribute("onclick") || "")) pill = p; });
            if (pill && typeof g.selType === "function") g.selType(pill, "Spacer");
            var dist = g.document.getElementById("l-dist"); if (dist && dist.focus) dist.focus();
          } catch (e) {}
        }, 80);
      });
      return true;
    }
    if (g.location) g.location.href = "zawodnik.html#log";
    return false;
  }
  if (g.document) g.document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-pierwszy-km]") : null; if (!b) return;
    e.preventDefault(); otworzPierwszyKm();
  });
  /* Karta „Mój wkład” (11.11, część 4): moduł js/akcja-wklad-karta.mjs dociągany dopiero po dotknięciu; dostaje tylko dane klikającego (licznik, wkład, adres strony). */
  if (g.document) g.document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-moj-wklad]") : null; if (!b) return;
    e.preventDefault();
    var d = _kafelDane && _kafelDane[0], wklad = (_kafelDane && _kafelDane[1]) || _ostatniWklad, pokaz = function () { if (g.BM_WKLAD_KARTA) g.BM_WKLAD_KARTA.zKafla(d, wklad, adresStrony(d)); };
    if (g.BM_WKLAD_KARTA) return pokaz();
    var el = g.document.createElement("script"); el.src = "js/akcja-wklad-karta.mjs"; el.async = true; el.onload = pokaz;
    g.document.head.appendChild(el);
  });
  /* Film akcji z kafla: w nakładce, adres z licznika, plik dopiero po dotknięciu. */
  if (g.document) g.document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-film-akcji]") : null; if (!b) return;
    var f = _filmKarty; if (!f || !f.mp4) return;
    var n = g.document.createElement("div"); n.className = "akcja-film-nakladka"; n.setAttribute("role", "dialog"); n.setAttribute("aria-label", "Film akcji");
    var v = g.document.createElement("video"); v.src = f.mp4; v.controls = true; v.autoplay = true; v.setAttribute("playsinline", "");
    var x = g.document.createElement("button"); x.type = "button"; x.textContent = "Zamknij";
    var zamknij = function () { try { v.pause(); } catch (e2) {} n.remove(); };
    /* Od chwili plakatu w filmie pełny plakat z pliku, dźwięk gra dalej. Bez plakatu albo gdy się nie wczyta: film jak dotąd i koniec zamyka nakładkę. */
    var plansza = null, pokazPlansze = function () {
      if (plansza || !f.plakat) return;
      plansza = g.document.createElement("div"); plansza.className = "akcja-film-plansza";
      var im = g.document.createElement("img"); im.src = f.plakat; im.alt = "Plakat akcji";
      im.addEventListener("error", function () { if (plansza) plansza.remove(); plansza = null; f = Object.assign({}, f, { plakat: "" }); });
      plansza.appendChild(im);
      if (f.zbiorka) plansza.appendChild(przyciskZbiorki(f.zbiorka, "akcja-plakat-zbiorka"));
      var zamknijP = g.document.createElement("button"); zamknijP.type = "button"; zamknijP.textContent = "Zamknij"; zamknijP.addEventListener("click", function (e3) { e3.stopPropagation(); zamknij(); });
      plansza.appendChild(zamknijP);
      plansza.addEventListener("click", function () { pokazPlakat(f.plakat, f.zbiorka); });
      n.appendChild(plansza);
    };
    x.addEventListener("click", zamknij);
    v.addEventListener("timeupdate", function () { if (f.plakat && f.plakat_od != null && v.currentTime >= f.plakat_od) pokazPlansze(); });
    v.addEventListener("ended", function () { if (f.plakat) pokazPlansze(); else zamknij(); });
    n.appendChild(v); n.appendChild(x); g.document.body.appendChild(n);
  });

  /** Wyprawa (komenda Filipa 4.11, SEKRET CELU): cel wyprawy żyje TYLKO w bazie — licznik oddaje wyprawa_cel_nazwa/wyprawa_cel_km
   *  dopiero po „Dotarliśmy”; przed tym tylko wyprawa_km + wyprawa_trwa. W kodzie nie ma nazwy celu (blizna-116).
   *  9.11 (wyprawa etapami, bez mapy): km wyprawy są już w liczniku akcji (biegi Filipa i Kasi liczą się jak każde), linia tylko je pokazuje, więc „już w liczniku”. */
  function tekstWyprawy(d) {
    if (!d || !d.wystartowala || !(d.wyprawa_trwa || d.wyprawa_dotarla_at)) return "";
    if (d.wyprawa_dotarla_at) return "Wyprawa · dotarli: " + (d.wyprawa_cel_nazwa || "na miejsce") + " ✓ · " + km(d.wyprawa_km) + " km (już w liczniku)";
    return "Wyprawa etapami · Filip i Kasia: " + km(d.wyprawa_km) + " km (już w liczniku) · cel: tajemnica";
  }

  /** Blok sponsora na karcie Dziś (tylko gdy DEKLARACJE_GOTOWE): moja stawka + „Wycofaj" albo „Zostań sponsorem" z formularzem.
   *  Przyciski przez data-akcja (handler w zawodnik.html), bez danych użytkownika w atrybutach JS. */
  function sponsorHtml(wklad, d) {
    if (!DEKLARACJE_GOTOWE) return "";
    var link = linkZbiorki(d);
    var st = wklad && wklad.stawka_gr != null ? Number(wklad.stawka_gr) : null;
    if (st) {
      return '<div class="akcja-sponsor">Twoja stawka: <b>' + liczba(st) + ' gr</b> za każdy kilometr · ' +
        '<button type="button" class="akcja-tekstowy" data-akcja="wycofaj">Wycofaj</button></div>';
    }
    return '<div class="akcja-sponsor"><button type="button" class="akcja-link" data-akcja="sponsor">Zostań sponsorem kilometrów</button>' +
      '<div class="akcja-form" hidden><label>Twoja stawka: <input type="number" inputmode="numeric" min="1" max="10000" step="1" value="10" class="akcja-stawka"> gr za każdy kilometr</label>' +
      '<p class="akcja-uwaga">' + esc(tekstDeklaracji(d)) + (link ? ' <a class="akcja-tekstowy" href="' + link + '" target="_blank" rel="noopener noreferrer">Oficjalna zbiórka ›</a>' : "") + '</p>' +
      '<button type="button" class="akcja-wiecej" data-akcja="zapisz">Zapisz</button></div></div>';
  }

  /* ULICA (js/ulica.mjs): moduł dociągany przy pierwszym użyciu. zawodnik.html i sw.js są zamrożone do 8.11, więc plik nie ma <script> ani miejsca w precache;
     SW i tak bierze go do cache przy pierwszym pobraniu. Brak pliku albo błąd = sekcji nie ma, karta i strona żyją dalej. */
  var _ulicaCzeka = null, _nrUlicy = 0;
  function zUlica(cb) {
    if (!g.document) return;
    if (g.BM_ULICA) { try { cb(g.BM_ULICA); } catch (e) {} return; }
    if (_ulicaCzeka) { _ulicaCzeka.push(cb); return; }
    _ulicaCzeka = [cb];
    var el = g.document.createElement("script");
    el.src = "js/ulica.mjs"; el.async = true;
    el.onload = function () { var q = _ulicaCzeka || []; _ulicaCzeka = null; q.forEach(function (f) { try { if (g.BM_ULICA) f(g.BM_ULICA); } catch (e) {} }); };
    el.onerror = function () { _ulicaCzeka = null; };
    g.document.head.appendChild(el);
  }
  /** Kontener ulicy w karcie (Dziś, Okienko): licznik to ten sam obiekt, z którego karta bierze pasek. Pusty div nie zajmuje miejsca. */
  function punktUlicy(d, opcje) {
    if (!g.document || !d || !d.wystartowala) return "";
    var id = "bm-ulica-" + (++_nrUlicy);
    g.setTimeout(function () { var el = g.document.getElementById(id); if (el) zUlica(function (U) { U.zamontuj(el, d, opcje); }); }, 0);
    return '<div id="' + id + '" style="flex-basis:100%;min-width:0"></div>';
  }

  /** Dane karty okienka (EF): tylko to, co licznik i tak oddaje publicznie po starcie. */
  function kartaOkienka(d) {
    if (!d || !d.wystartowala) return null;
    return { typ: "akcja", dane: { nazwa: d.nazwa || null, suma_km: Number(d.suma_km) || 0, cel_km: Number(d.cel_km) || 0, pct: pct(d),
      zamknieta: !!d.zamknieta, url_zbiorki: d.url_zbiorki || null } };
  }

  g.BM_AKCJA = { PROGI_KM: PROGI_KM, progiAkcji: progiAkcji, progPrzekroczony: progPrzekroczony, banerProguHtml: banerProguHtml, konfettiProgu: konfettiProgu, tekstProgu: tekstProgu, wkladHtml: wkladHtml, flagaPierwszego: flagaPierwszego, otworzPierwszyKm: otworzPierwszyKm, km: km, zl: zl, pct: pct, tekstFilipa: tekstFilipa, tekstSponsorow: tekstSponsorow, stanKarty: stanKarty, linkZbiorki: linkZbiorki,
    tekstWyprawy: tekstWyprawy, pobierzPubliczny: pobierzPubliczny, sprawdzGre: sprawdzGre, pasekHtml: pasekHtml, kartaDzisHtml: kartaDzisHtml, kartaOkienka: kartaOkienka, sponsorHtml: sponsorHtml,
    DEKLARACJE_GOTOWE: DEKLARACJE_GOTOWE, TEKST_DEKLARACJI: TEKST_DEKLARACJI, tekstDeklaracji: tekstDeklaracji, dopelniacz: dopelniacz,
    plakatUrl: plakatUrl, plakatHtml: plakatHtml, pokazPlakat: pokazPlakat,
    firmyHtml: firmyHtml, tytulFirm: tytulFirm, celownik: celownik, linkFirmy: linkFirmy, logoFirmy: logoFirmy, firmaDoZapisu: firmaDoZapisu, firmaDoEdycji: firmaDoEdycji, logoDoWgrania: logoDoWgrania,
    TEKST_FIRM: TEKST_FIRM, BUCKET_LOGO: BUCKET_LOGO,
    CACHE_MS: CACHE_MS, DNI_KARTY_PO_ZAMKNIECIU: DNI_KARTY_PO_ZAMKNIECIU, EF: EF };
  g.BM_AKCJA.formularzFirm = formularzFirm; g.BM_AKCJA.zUlica = zUlica; g.BM_AKCJA.punktUlicy = punktUlicy; g.BM_AKCJA.kartaZPamieci = kartaZPamieci; g.BM_AKCJA.KLUCZ_KARTY = KLUCZ_KARTY;
  /* Skrypt stoi pod znacznikami Dziś, więc karta z pamięci wchodzi przed pierwszym obrazem. Gdzie indziej (index, trener, strona akcji) nie ma #akcja-karta i nic się nie dzieje. */
  try { if (g.document && g.document.getElementById) { if (!kartaZPamieci() && g.document.readyState === "loading") g.document.addEventListener("DOMContentLoaded", kartaZPamieci); } } catch (e) {}
  g.BM_AKCJA.rozwinKafel = rozwinKafel; g.BM_AKCJA.tekstPaska = tekstPaska;
  g.BM_AKCJA.ukryjKafel = ukryjKafel; g.BM_AKCJA.maMurek = maMurek; g.BM_AKCJA.KLUCZ_UKRYCIA = KLUCZ_UKRYCIA; g.BM_AKCJA.etykietaPokaz = etykietaPokaz;
  g.BM_AKCJA.zdejmijKafel = zdejmijKafel; g.BM_AKCJA.daneKaflaHtml = daneKaflaHtml; g.BM_AKCJA.liczbyKaflaHtml = liczbyKaflaHtml; g.BM_AKCJA.adresStrony = adresStrony; g.BM_AKCJA.linkGry = linkGry;
})(typeof globalThis !== "undefined" ? globalThis : this);
