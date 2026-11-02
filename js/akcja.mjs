// AKCJA — wspólne liczby i teksty karty akcji (projekt F, dzień 3). Plik BEZ import/export (globalThis.BM_AKCJA),
// jak js/akcja-cytaty.mjs: <script src> w zawodnik.html / index.html / dla-fabianka.html, import w testach i w EF okienko.
// Jedno źródło liczb = akcja_licznik (spec v2 pkt 5). Nazwa, imię i link przychodzą z bazy — w kodzie ich nie ma.
// Rozliczenie jednorazowe po akcji (decyzja Filipa 2.11): „Filip dokłada 10 gr za każdy kilometr · dotąd X zł z 1 250 zł",
// bez kwot tygodniowych w UI. Przed startem licznik nie zwraca nazwy ani imienia — teaser nie zna dziecka.
(function (g) {
  "use strict";
  var EF = "/functions/v1/akcja-licznik";
  var CACHE_MS = 60000;
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
    return "Filip dokłada " + (Number(d.stawka_filip_gr) || 10) + " gr za każdy kilometr · dotąd " + zl(d.filip_gr) + " z " + zl(d.filip_max_gr);
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
    if (stary && !o.wymus && teraz - stary.t < CACHE_MS) return stary.d;
    try {
      var baza = o.baza || g.SB_URL || "";
      var r = await fetch(baza + EF + "?slug=" + encodeURIComponent(slug), { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("http " + r.status);
      var d = await r.json();
      try { if (ss) ss.setItem(klucz, JSON.stringify({ t: teraz, d: d })); } catch (e) {}
      return d;
    } catch (e) { return stary ? stary.d : null; }
  }

  /* Style kart — wstrzykiwane raz (jak WATCH._injectCss w sb.js), żeby trzy strony nie trzymały kopii. Kolory z tokenów theme.css
     z wartościami awaryjnymi (index.html i dla-fabianka.html mogą nie ładować theme.css). */
  var CSS = ".akcja-karta{background:var(--card,#0f0f14);border:1px solid var(--border,rgba(255,255,255,.1));border-radius:16px;padding:14px;color:var(--fg,#f0ede8);font-family:Inter,system-ui,sans-serif}" +
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
    ".akcja-plakat-pelny img{max-width:100vw;max-height:100vh;object-fit:contain}";
  function wstrzyknijCss() {
    try {
      if (!g.document || g.document.getElementById("bm-akcja-css")) return;
      var st = g.document.createElement("style"); st.id = "bm-akcja-css"; st.textContent = CSS; g.document.head.appendChild(st);
    } catch (e) {}
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
  function kartaDzisHtml(d, wklad, teraz) {
    var s = stanKarty(d, teraz);
    if (s === "brak") return "";
    wstrzyknijCss();
    var link = linkZbiorki(d), mojeKm = wklad && wklad.km != null ? km(wklad.km) : "0";
    if (s === "zamknieta") {
      return '<div class="akcja-karta akcja-karta--koniec"><div class="akcja-nazwa">' + esc(d.nazwa) + '</div>' +
        '<div class="akcja-zrobione">Zrobiliśmy to: ' + km(d.suma_km) + ' km · Ty: ' + mojeKm + ' km</div>' +
        (link ? '<a class="akcja-link" href="' + link + '" target="_blank" rel="noopener noreferrer">Oficjalna zbiórka ›</a>' : "") + "</div>";
    }
    return '<div class="akcja-karta"><div class="akcja-nazwa">' + esc(d.nazwa) + '</div>' + plakatHtml(d, "akcja-plakat--mini") + pasekHtml(d) +
      '<div class="akcja-ja">Twój wkład: <b>' + mojeKm + ' km</b></div>' +
      '<div class="akcja-typy">' + TEKST_TYPOW + '</div>' +
      '<div class="akcja-filip">' + esc(tekstFilipa(d)) + '</div>' +
      (tekstSponsorow(d) ? '<div class="akcja-sponsorzy">' + esc(tekstSponsorow(d)) + '</div>' : "") +
      (tekstWyprawy(d) ? '<div class="akcja-wyprawa">' + esc(tekstWyprawy(d)) + '</div>' : "") +
      sponsorHtml(wklad, d) +
      '<div class="akcja-przyciski"><a class="akcja-wiecej" href="dla-fabianka.html">Szczegóły ›</a>' +
      (wklad && Number(wklad.km) > 0 ? '<button type="button" class="akcja-link" data-akcja="udostepnij">Udostępnij</button>' : "") +
      (link ? '<a class="akcja-link" href="' + link + '" target="_blank" rel="noopener noreferrer">Oficjalna zbiórka ›</a>' : "") + "</div></div>";
  }

  /** Wyprawa na Jasną Górę (spec v3 pkt 3): tylko gdy Filip ustawi cel (akcje.wyprawa_cel_km). Km z licznika (wyprawa_km). */
  function tekstWyprawy(d) {
    if (!d || !d.wystartowala || d.wyprawa_cel_km == null) return "";
    return "Wyprawa na Jasną Górę · Filip i Kasia: " + km(d.wyprawa_km) + " z " + km(d.wyprawa_cel_km) + " km" + (d.wyprawa_dotarla_at ? " · dotarli ✓" : "");
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

  /** Dane karty okienka (EF): tylko to, co licznik i tak oddaje publicznie po starcie. */
  function kartaOkienka(d) {
    if (!d || !d.wystartowala) return null;
    return { typ: "akcja", dane: { nazwa: d.nazwa || null, suma_km: Number(d.suma_km) || 0, cel_km: Number(d.cel_km) || 0, pct: pct(d),
      zamknieta: !!d.zamknieta, url_zbiorki: d.url_zbiorki || null } };
  }

  g.BM_AKCJA = { km: km, zl: zl, pct: pct, tekstFilipa: tekstFilipa, tekstSponsorow: tekstSponsorow, stanKarty: stanKarty, linkZbiorki: linkZbiorki,
    tekstWyprawy: tekstWyprawy, pobierzPubliczny: pobierzPubliczny, pasekHtml: pasekHtml, kartaDzisHtml: kartaDzisHtml, kartaOkienka: kartaOkienka, sponsorHtml: sponsorHtml,
    DEKLARACJE_GOTOWE: DEKLARACJE_GOTOWE, TEKST_DEKLARACJI: TEKST_DEKLARACJI, tekstDeklaracji: tekstDeklaracji, dopelniacz: dopelniacz,
    plakatUrl: plakatUrl, plakatHtml: plakatHtml, pokazPlakat: pokazPlakat,
    CACHE_MS: CACHE_MS, DNI_KARTY_PO_ZAMKNIECIU: DNI_KARTY_PO_ZAMKNIECIU, EF: EF };
})(typeof globalThis !== "undefined" ? globalThis : this);
