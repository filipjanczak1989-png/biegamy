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
  /** Pełny ekran plakatu — jedna nakładka na stronę, zamykana dotknięciem/Esc. Klik w [data-plakat] (delegacja). */
  function pokazPlakat(url) {
    if (!g.document || !url) return;
    var stara = g.document.getElementById("bm-plakat-pelny"); if (stara) stara.remove();
    var n = g.document.createElement("div"); n.id = "bm-plakat-pelny"; n.className = "akcja-plakat-pelny"; n.setAttribute("role", "dialog"); n.setAttribute("aria-label", "Plakat akcji");
    var img = g.document.createElement("img"); img.src = url; img.alt = "Plakat akcji"; n.appendChild(img);
    var zamknij = function () { n.remove(); g.document.removeEventListener("keydown", naKlawisz); };
    var naKlawisz = function (e) { if (e.key === "Escape") zamknij(); };
    n.addEventListener("click", zamknij); g.document.addEventListener("keydown", naKlawisz);
    g.document.body.appendChild(n);
  }
  try {
    g.document.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-plakat]") : null;
      if (!el) return;
      e.preventDefault(); pokazPlakat(el.getAttribute("data-plakat"));
    });
  } catch (e) {}
  /** Blok plakatu (miniatura → pełny ekran) + „Wpłać na zbiórkę" (url_zbiorki, tylko https). Bez plakatu — pusty napis, bez dziury. */
  function plakatHtml(d, klasa) {
    var u = plakatUrl(d), link = linkZbiorki(d);
    if (!u) return "";
    return '<div class="akcja-plakat ' + (klasa || "") + '"><a href="' + u + '" data-plakat="' + u + '" target="_blank" rel="noopener noreferrer">' +
      '<img src="' + u + '" alt="Plakat akcji" loading="lazy"></a>' +
      (link ? '<a class="akcja-wiecej akcja-wplac" href="' + link + '" target="_blank" rel="noopener noreferrer">Wpłać na zbiórkę</a>' : "") + "</div>";
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
    if (!g.document || !g.fetch) return null;
    if (!pytanieOGre) {
      pytanieOGre = g.fetch((g.SB_URL || "") + "/functions/v1/gra-ranking", { headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          graWlaczona = !!(d && d.aktywna === true);
          if (graWlaczona) g.document.querySelectorAll("[data-gra-link]").forEach(function (e) { e.hidden = false; });
        })
        .catch(function () { graWlaczona = false; });
    }
    return pytanieOGre;
  }
  function linkGryHtml() {
    sprawdzGre();
    return '<a class="akcja-link" data-gra-link href="gra-cegielki.html"' + (graWlaczona ? "" : " hidden") + ">Zagraj w Cegiełki ›</a>";
  }

  /* Style kart — wstrzykiwane raz (jak WATCH._injectCss w sb.js), żeby trzy strony nie trzymały kopii. Kolory z tokenów theme.css
     z wartościami awaryjnymi (index.html i dla-fabianka.html mogą nie ładować theme.css). */
  var CSS = ".akcja-kafle{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.akcja-kafel{display:flex;align-items:center;justify-content:center;min-height:52px;padding:10px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.14));background:rgba(255,255,255,.05);color:var(--fg,#f0ede8);font:inherit;font-size:14px;font-weight:700;line-height:1.2;text-align:center;text-decoration:none;cursor:pointer}.akcja-kafel[hidden]{display:none}.akcja-kafel--wplata{background:var(--accent,#ff8a3c);border-color:transparent;color:#17120e}.akcja-wiecej-blok{margin-top:10px;font-size:13px}.akcja-wiecej-blok summary{cursor:pointer;font-weight:700}.akcja-film-nakladka{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;background:rgba(0,0,0,.92)}.akcja-film-nakladka video{max-width:100%;max-height:80vh;border-radius:12px}.akcja-film-nakladka button{padding:10px 20px;border:0;border-radius:10px;background:#fff;color:#111;font:inherit;font-weight:700;cursor:pointer}" +
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
    ".akcja-plakat--mini img{max-height:220px;object-fit:cover}.akcja-wplac{display:block;text-align:center;margin-top:8px}" +
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
    ".akcja-firmy-uwaga{margin:10px 0 0;font-size:12px;line-height:1.5;color:var(--fg2,rgba(240,237,232,.72))}";
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
  function pasekHtml(d) {
    wstrzyknijCss();
    var p = pct(d);
    return '<div class="akcja-pasek" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '">' +
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
  function kartaDzisHtml(d, wklad, teraz) {
    var s = stanKarty(d, teraz);
    if (s === "brak") return "";
    wstrzyknijCss();
    var link = linkZbiorki(d), mojeKm = wklad && wklad.km != null ? km(wklad.km) : "0";
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
    var kafle = (linkTrasy(d) ? kafel('<a class="akcja-kafel" href="' + linkTrasy(d) + '">{T}</a>', "Mapa wyprawy") : "") +
      '<a class="akcja-kafel" data-gra-link href="gra-cegielki.html"' + (sprawdzGre(), graWlaczona ? "" : " hidden") + ">Zagraj w Cegiełki</a>" +
      (link ? kafel('<a class="akcja-kafel akcja-kafel--wplata" href="' + link + '" target="_blank" rel="noopener noreferrer">{T}</a>', "Wpłać na zbiórkę") : "") +
      (d.firmy_zgloszenia === true || d.kontakt_firmy ? kafel('<a class="akcja-kafel" href="dla-fabianka.html#firma">{T}</a>', "Twoja firma na ulicy") : "") +
      (film ? '<button type="button" class="akcja-kafel" data-film-akcji="1">Zobacz film</button>' : "");
    sprawdzFirmyDoSprawdzenia();
    return '<div class="akcja-karta akcja-centrum"><a class="akcja-kafel akcja-kafel--wplata" data-firmy-czekaja href="trener.html#firmy-sec" hidden></a><div class="akcja-nazwa">' + esc(d.nazwa) + '</div>' + punktUlicy(d) + pasekHtml(d) +
      '<div class="akcja-ja">Twój wkład: <b>' + mojeKm + ' km</b></div>' +
      '<div class="akcja-typy">' + TEKST_TYPOW + '</div>' +
      '<div class="akcja-kafle">' + kafle + '</div>' +
      sponsorHtml(wklad, d) +
      '<details class="akcja-wiecej-blok"><summary>Więcej o akcji</summary>' +
      '<div class="akcja-filip">' + esc(tekstFilipa(d)) + '</div>' +
      (tekstSponsorow(d) ? '<div class="akcja-sponsorzy">' + esc(tekstSponsorow(d)) + '</div>' : "") +
      (tekstWyprawy(d) ? '<div class="akcja-wyprawa">' + esc(tekstWyprawy(d)) + '</div>' : "") +
      '<div class="akcja-przyciski"><a class="akcja-wiecej" href="dla-fabianka.html">Szczegóły ›</a>' +
      (wklad && Number(wklad.km) > 0 ? '<button type="button" class="akcja-link" data-akcja="udostepnij">Udostępnij</button>' : "") + "</div>" + firmyHtml(d) + "</details></div>";
  }
  /* Film akcji z kafla: w nakładce, adres z licznika, plik dopiero po dotknięciu. */
  if (g.document) g.document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-film-akcji]") : null; if (!b) return;
    var f = _filmKarty; if (!f || !f.mp4) return;
    var n = g.document.createElement("div"); n.className = "akcja-film-nakladka"; n.setAttribute("role", "dialog"); n.setAttribute("aria-label", "Film akcji");
    var v = g.document.createElement("video"); v.src = f.mp4; v.controls = true; v.autoplay = true; v.setAttribute("playsinline", "");
    var x = g.document.createElement("button"); x.type = "button"; x.textContent = "Zamknij";
    var zamknij = function () { try { v.pause(); } catch (e2) {} n.remove(); };
    x.addEventListener("click", zamknij); v.addEventListener("ended", zamknij);
    n.appendChild(v); n.appendChild(x); g.document.body.appendChild(n);
  });

  /** Wyprawa (komenda Filipa 4.11, SEKRET CELU): cel wyprawy żyje TYLKO w bazie — licznik oddaje wyprawa_cel_nazwa/wyprawa_cel_km
   *  dopiero po „Dotarliśmy”; przed tym tylko wyprawa_km + wyprawa_trwa. W kodzie nie ma nazwy celu (blizna-116). */
  function tekstWyprawy(d) {
    if (!d || !d.wystartowala || !(d.wyprawa_trwa || d.wyprawa_dotarla_at)) return "";
    if (d.wyprawa_dotarla_at) return "Wyprawa · dotarli: " + (d.wyprawa_cel_nazwa || "na miejsce") + " ✓ · " + km(d.wyprawa_km) + " km";
    return "Wyprawa · Filip i Kasia: " + km(d.wyprawa_km) + " km · cel: tajemnica";
  }
  /** Link do mapy śladu (mapa-wyprawy.html) — tylko po starcie, gdy akcja ma wyprawę. */
  function linkTrasy(d) { return d && d.wystartowala && (d.wyprawa_trwa || d.wyprawa_dotarla_at) ? "mapa-wyprawy.html" : ""; }

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

  g.BM_AKCJA = { km: km, zl: zl, pct: pct, tekstFilipa: tekstFilipa, tekstSponsorow: tekstSponsorow, stanKarty: stanKarty, linkZbiorki: linkZbiorki,
    tekstWyprawy: tekstWyprawy, linkTrasy: linkTrasy, pobierzPubliczny: pobierzPubliczny, sprawdzGre: sprawdzGre, pasekHtml: pasekHtml, kartaDzisHtml: kartaDzisHtml, kartaOkienka: kartaOkienka, sponsorHtml: sponsorHtml,
    DEKLARACJE_GOTOWE: DEKLARACJE_GOTOWE, TEKST_DEKLARACJI: TEKST_DEKLARACJI, tekstDeklaracji: tekstDeklaracji, dopelniacz: dopelniacz,
    plakatUrl: plakatUrl, plakatHtml: plakatHtml, pokazPlakat: pokazPlakat,
    firmyHtml: firmyHtml, tytulFirm: tytulFirm, celownik: celownik, linkFirmy: linkFirmy, logoFirmy: logoFirmy, firmaDoZapisu: firmaDoZapisu, firmaDoEdycji: firmaDoEdycji, logoDoWgrania: logoDoWgrania,
    TEKST_FIRM: TEKST_FIRM, BUCKET_LOGO: BUCKET_LOGO,
    CACHE_MS: CACHE_MS, DNI_KARTY_PO_ZAMKNIECIU: DNI_KARTY_PO_ZAMKNIECIU, EF: EF };
  g.BM_AKCJA.zUlica = zUlica; g.BM_AKCJA.punktUlicy = punktUlicy;
})(typeof globalThis !== "undefined" ? globalThis : this);
