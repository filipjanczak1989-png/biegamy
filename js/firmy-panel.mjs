// Panel trenera: zgłoszenia firm, progi i przełącznik formularza. Plik BEZ import/export. Wszystko przez EF firma-panel, bez innerHTML: dane ze zgłoszenia są niezaufane.
// Dotknięcie pushu otwiera nakładkę z tym jednym zgłoszeniem. Licznik „Firmy do sprawdzenia” na górze świeci, także gdy push nie dotarł. Kilka zgłoszeń: kolejka w nakładce i w sekcji.
(function (g) {
  "use strict";
  var $ = function (id) { return g.document.getElementById(id); };
  function el(tag, styl, rodzic, tekst) { var e = g.document.createElement(tag); if (styl) e.style.cssText = styl; if (tekst != null) e.textContent = tekst; if (rodzic) rodzic.appendChild(e); return e; }
  function wolaj(body) {
    return g.sb.functions.invoke("firma-panel", { body: body }).then(async function (r) {
      var d = r.data;
      if (r.error && r.error.context && r.error.context.json) { try { d = await r.error.context.json(); } catch (e) { d = null; } }
      if (!d || !d.ok) throw new Error((d && d.blad) || "Nie udało się. Sprawdź łącze.");
      return d;
    });
  }
  var PRZYCISK = "font:inherit;font-size:15px;font-weight:800;padding:12px 18px;border-radius:12px;cursor:pointer;";
  function bezpiecznyLink(u) { return /^https:\/\//.test(String(u || "")) ? u : ""; }
  function zl(gr) { return gr == null ? "" : Math.round(Number(gr) / 100).toLocaleString("pl-PL") + " zł"; }
  function wierszZgloszenia(kont, z, poDecyzji) {
    var ramka = el("div", "padding:12px 0;border-top:1px solid var(--border);", kont);
    ramka.id = "zgl-" + z.id;
    /* Cegiełka od osoby prywatnej (20261107_akcja_cegielka_zgloszenia): imię zamiast nazwy firmy, zgoda na imię w murze, tylko zrzut wpłaty. „Zatwierdź” = wpis w murze tej akcji. */
    var cegla = z.rodzaj === "cegielka";
    if (z.proba) el("div", "display:inline-block;font-size:11px;font-weight:800;letter-spacing:.08em;color:#17120e;border-radius:6px;padding:2px 8px;margin:0 6px 6px 0;background:#ff8a3c;", ramka, "PRÓBA");
    if (cegla) el("div", "display:inline-block;font-size:11px;font-weight:800;letter-spacing:.08em;color:#17120e;border-radius:6px;padding:2px 8px;margin:0 6px 6px 0;background:#e8c39e;", ramka, "CEGIEŁKA");
    el("div", "font-size:16px;font-weight:800;color:var(--fg);overflow-wrap:anywhere;", ramka, z.nazwa + " · " + (cegla ? "cegiełka w murze" : z.rodzaj === "wiezowiec" ? "wieżowiec" : "domek"));
    if (cegla) el("div", "font-size:14px;font-weight:700;color:var(--fg);", ramka, z.zgoda_na_wymienienie ? "Imię w murze: tak, osoba się zgodziła" : "Bez zgody na imię: cegła stanie bez imienia");
    if (z.kwota_gr != null) el("div", "font-size:14px;font-weight:700;color:var(--fg);", ramka, "Wpłata: " + zl(z.kwota_gr) + (z.zgoda_na_kwote ? " · można pokazać" : " · bez pokazywania"));
    var link = bezpiecznyLink(z.link);
    if (link) { var a = el("a", "font-size:13px;display:block;overflow-wrap:anywhere;", ramka, link); a.href = link; a.target = "_blank"; a.rel = "noopener noreferrer nofollow"; }
    if (z.email) el("div", "font-size:13px;color:var(--muted);overflow-wrap:anywhere;", ramka, z.email);
    el("div", "font-size:11px;color:var(--muted);", ramka, new Date(z.utworzono).toLocaleString("pl-PL") + " · " + ({ nowe: "czeka na decyzję", zatwierdzone: "zatwierdzone", odrzucone: "odrzucone" }[z.status] || z.status) + (z.powod ? ": " + z.powod : ""));
    /* Zatwierdzona firma, z próby też (6.11): „Edytuj” otwiera edytor firm w trener.html, „Usuń z Ulicy” pyta we własnym okienku i kasuje firmę z Ulicy (zgłoszenie zostaje w historii). */
    if (z.status === "zatwierdzone" && cegla) {
      var doMuru = el("button", PRZYCISK + "margin-top:8px;background:none;color:var(--fg);border:1px solid var(--border);", ramka, "W murze: pokaż wpisy"); doMuru.type = "button";
      el("div", "font-size:12px;color:var(--muted);", ramka, "Zmiana imienia i usunięcie: sekcja „Ulica akcji”, przy wpisie.");
      doMuru.addEventListener("click", function () {
        var n = g.document.getElementById("firma-nakladka"); if (n) n.remove();
        var u = g.document.getElementById("ulica-sec"); if (!u) return;
        u.open = true; u.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    }
    if (z.status === "zatwierdzone" && !cegla) {
      /* Usunięta miękko (20261113_akcja_firmy_usuniecie): lista zna firma_usunieta, nazwa w zgłoszeniu to już „[usunięta]”; bez guzików, bo nie ma czego edytować ani usuwać. */
      if (z.firma_usunieta) { el("div", "font-size:12px;color:var(--muted);margin-top:8px;", ramka, "Usunięta z Ulicy."); return; }
      var rzad = el("div", "display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;", ramka), edInfo = el("div", "font-size:12px;color:var(--muted);", ramka);
      var ed = el("button", PRZYCISK + "flex:1 1 130px;background:none;color:var(--fg);border:1px solid var(--border);", rzad, "Edytuj"); ed.type = "button";
      var us = el("button", PRZYCISK + "flex:1 1 130px;background:none;color:var(--red);border:1px solid var(--border);", rzad, "Usuń z Ulicy"); us.type = "button";
      ed.addEventListener("click", function () {
        if (!g.BM_EDYTUJ_FIRME) { edInfo.textContent = "Edytor firm się nie wczytał. Odśwież stronę."; return; }
        var n = g.document.getElementById("firma-nakladka"); if (n) n.remove();
        g.BM_EDYTUJ_FIRME(z.nazwa, !!z.proba).then(function (ok) { edInfo.textContent = ok ? "" : "Tej firmy nie ma już na Ulicy (usunięta albo zmieniona nazwa)."; });
      });
      us.addEventListener("click", function () {
        if (!g.BM_USUN_FIRME) { edInfo.textContent = "Edytor firm się nie wczytał. Odśwież stronę."; return; }
        us.disabled = true; edInfo.textContent = "";
        g.BM_USUN_FIRME(z.nazwa, !!z.proba, z.firma_id || null).then(function (w) {
          if (w === "usunieta" || w === "brak") { ed.disabled = true; edInfo.textContent = w === "usunieta" ? "Usunięta z Ulicy." : "Tej firmy nie ma już na Ulicy."; return; }
          us.disabled = false;
        }, function () { us.disabled = false; edInfo.textContent = "Nie udało się. Sprawdź łącze."; });
      });
    }
    if (z.status !== "nowe") return;
    var obrazy = el("div", "display:flex;gap:10px;flex-wrap:wrap;margin:10px 0;", ramka);
    (cegla ? [] : [["Logo", z.logo_adres, "background:#fbf3df;padding:6px;box-sizing:border-box;"]]).concat([["Zrzut wpłaty (adres ważny 10 min)", z.zrzut_adres, ""]]).forEach(function (w) {
      var b = el("div", "flex:1 1 140px;min-width:0;", obrazy);
      el("div", "font-size:11px;color:var(--muted);margin-bottom:4px;", b, w[0]);
      if (!w[1]) { el("div", "font-size:12px;color:var(--muted);", b, "Plik usunięty."); return; }
      var im = el("img", "max-width:100%;max-height:260px;border-radius:8px;" + w[2], b); im.src = w[1]; im.alt = w[0];
    });
    /* Złota cegła (9.11): przy cegiełce przełącznik, domyślnie zaznaczony od 100 zł wpłaty. Kwota zostaje tutaj, publicznie wychodzi tylko złota cegła. */
    var zlota = null;
    if (cegla) {
      var lz = el("label", "display:flex;gap:8px;align-items:center;margin:4px 0 2px;font-size:14px;font-weight:700;color:var(--fg);cursor:pointer;", ramka);
      zlota = el("input", "width:20px;height:20px;accent-color:#e3a514;", lz); zlota.type = "checkbox"; zlota.checked = z.kwota_gr != null && z.kwota_gr >= 10000;
      el("span", "", lz, "Złota cegła" + (z.kwota_gr == null ? " (bez kwoty w zgłoszeniu: sprawdź zrzut)" : z.kwota_gr >= 10000 ? " (wpłata od 100 zł)" : " (wpłata poniżej 100 zł)"));
    }
    var info = el("div", "font-size:13px;color:var(--red);", ramka);
    var guziki = el("div", "display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;", ramka);
    var tak = el("button", PRZYCISK + "flex:1 1 130px;background:var(--accent,#ff8a3c);color:#111;border:0;", guziki, "Zatwierdź"); tak.type = "button";
    var nie = el("button", PRZYCISK + "flex:1 1 130px;background:none;color:var(--red);border:1px solid var(--border);", guziki, "Odrzuć"); nie.type = "button";
    var powod = el("input", "display:none;width:100%;box-sizing:border-box;margin-top:8px;padding:10px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--fg);font:inherit;font-size:14px;", ramka);
    powod.placeholder = "Powód odrzucenia"; powod.maxLength = 300;
    function dzialaj(body) {
      tak.disabled = nie.disabled = true; info.textContent = "";
      wolaj(body).then(poDecyzji).catch(function (e) { tak.disabled = nie.disabled = false; info.textContent = e.message; });
    }
    tak.addEventListener("click", function () { dzialaj(zlota ? { akcja: "zatwierdz", id: z.id, zlota: zlota.checked } : { akcja: "zatwierdz", id: z.id }); });
    nie.addEventListener("click", function () {
      if (powod.style.display === "none") { powod.style.display = "block"; powod.focus(); nie.textContent = "Odrzuć z tym powodem"; return; }
      if (!powod.value.trim()) { info.textContent = "Wpisz powód."; return; }
      dzialaj({ akcja: "odrzuc", id: z.id, powod: powod.value.trim() });
    });
  }
  function start() {
    var sekcja = $("firmy-sec"), kont = $("firmy-zgloszenia"); if (!sekcja || !kont || !g.sb) return;
    var m = /#firma-zgloszenie=([0-9a-f-]{36})/.exec(g.location.hash || ""), nakladka = null;

    /* Licznik na górze panelu: niezależny od pushu, więc nic nie ginie, gdy subskrypcja wygasła. Bez działającej funkcji po prostu go nie ma. */
    var licznikEl = null;
    function pokazLicznik(n) {
      if (!licznikEl) {
        var pierwszy = g.document.querySelector(".fi");
        if (!pierwszy) return;
        licznikEl = el("button", "display:block;width:calc(100% - 32px);margin:0 16px 12px;" + PRZYCISK + "text-align:left;background:var(--accent,#ff8a3c);color:#111;border:0;");
        licznikEl.type = "button"; licznikEl.id = "firmy-do-sprawdzenia";
        pierwszy.parentNode.insertBefore(licznikEl, pierwszy);
        licznikEl.addEventListener("click", function () { otworzNakladke(null); });
      }
      licznikEl.textContent = "Zgłoszenia do sprawdzenia (firmy i cegiełki): " + n;
      licznikEl.style.display = n > 0 ? "block" : "none";
    }
    function odswiezLicznik() { return wolaj({ akcja: "licznik" }).then(function (d) { pokazLicznik(d.nowe || 0); }).catch(function () {}); }

    /* Nakładka: jedno zgłoszenie z pushu albo cała kolejka. Po decyzji następne czekające. */
    function zamknijNakladke() { if (nakladka) nakladka.remove(); nakladka = null; if (/#firma-zgloszenie=/.test(g.location.hash)) { try { g.history.replaceState(null, "", g.location.pathname + g.location.search); } catch (e) {} } }
    function otworzNakladke(idZgl) {
      zamknijNakladke();
      nakladka = el("div", "position:fixed;inset:0;z-index:400;overflow-y:auto;background:var(--card,#14141c);padding:16px;box-sizing:border-box;", g.document.body);
      nakladka.id = "firma-nakladka"; nakladka.setAttribute("role", "dialog"); nakladka.setAttribute("aria-label", "Zgłoszenie");
      var gora = el("div", "display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;", nakladka);
      var tyt = el("div", "font-size:18px;font-weight:800;color:var(--fg);", gora, "Zgłoszenia firm i cegiełek");
      var x = el("button", "font:inherit;font-size:14px;padding:8px 14px;border-radius:10px;background:none;color:var(--fg);border:1px solid var(--border);cursor:pointer;", gora, "Zamknij"); x.type = "button";
      x.addEventListener("click", zamknijNakladke);
      var tresc = el("div", "", nakladka, "Wczytuję…");
      wolaj({ akcja: "lista" }).then(function (d) {
        tresc.textContent = "";
        var nowe = d.zgloszenia.filter(function (z) { return z.status === "nowe"; });
        var jedno = idZgl ? d.zgloszenia.filter(function (z) { return z.id === idZgl; }) : [];
        var lista = jedno.length ? jedno : nowe;
        tyt.textContent = jedno.length ? (jedno[0].rodzaj === "cegielka" ? "Zgłoszenie cegiełki" : "Zgłoszenie firmy") : "Kolejka: " + nowe.length;
        if (!lista.length) { el("div", "font-size:14px;color:var(--muted);padding:12px 0;", tresc, "Nie ma zgłoszeń do sprawdzenia."); }
        lista.forEach(function (z) { wierszZgloszenia(tresc, z, function () { odswiezLicznik(); if (wczytane) odswiez(); otworzNakladke(null); }); });
        var reszta = nowe.filter(function (z) { return z.id !== idZgl; }).length;
        if (jedno.length && reszta) { var k = el("button", PRZYCISK + "width:100%;margin-top:12px;background:none;color:var(--fg);border:1px solid var(--border);", tresc, "Pozostałe w kolejce: " + reszta); k.type = "button"; k.addEventListener("click", function () { otworzNakladke(null); }); }
      }).catch(function (e) { tresc.textContent = e.message; });
    }

    function odswiez() {
      kont.textContent = "Wczytuję zgłoszenia…";
      return wolaj({ akcja: "lista" }).then(function (d) {
        kont.textContent = "";
        var infoProgow = $("firma-progi"); if (infoProgow) infoProgow.textContent = "Próg wpłaty: domek " + d.prog_domku_zl + " zł, wieżowiec " + d.prog_wiezowca_zl + " zł.";
        var pr = el("div", "display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;padding:10px 0;", kont);
        function liczba(et, w) { var l = el("label", "font-size:12px;color:var(--muted);flex:1 1 110px;", pr, et), i = el("input", "display:block;box-sizing:border-box;width:100%;margin-top:4px;padding:8px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--fg);font:inherit;", l); i.type = "number"; i.min = "1"; i.value = String(w); return i; }
        var dom = liczba("Próg domku, zł", d.prog_domku_zl), wie = liczba("Próg wieżowca, zł", d.prog_wiezowca_zl);
        var lz = el("label", "font-size:13px;color:var(--fg);display:flex;gap:8px;align-items:center;flex:1 1 100%;", pr), cz = el("input", "", lz); cz.type = "checkbox"; cz.checked = d.firmy_zgloszenia === true; el("span", "", lz, "Formularz zgłoszeń włączony");
        var zap = el("button", "font:inherit;font-size:13px;font-weight:700;padding:9px 14px;border-radius:10px;cursor:pointer;background:none;color:var(--fg);border:1px solid var(--border);", pr, "Zapisz"); zap.type = "button";
        var inf = el("div", "font-size:12px;color:var(--muted);flex:1 1 100%;", pr);
        zap.addEventListener("click", function () { inf.textContent = "Zapisuję…"; wolaj({ akcja: "progi", domek: dom.value, wiezowiec: wie.value, zgloszenia: cz.checked }).then(function () { inf.textContent = "Zapisane."; }).catch(function (e) { inf.textContent = e.message; }); });
        el("div", "font-size:13px;font-weight:800;color:var(--fg);margin-top:8px;", kont, "Zgłoszenia");
        if (!d.zgloszenia.length) el("div", "font-size:12px;color:var(--muted);", kont, "Na razie nie ma zgłoszeń.");
        d.zgloszenia.forEach(function (z) { wierszZgloszenia(kont, z, function () { odswiezLicznik(); odswiez(); }); });
      }).catch(function (e) { kont.textContent = e.message; });
    }
    var wczytane = false;
    function raz() { if (wczytane) return; wczytane = true; odswiez(); }
    sekcja.addEventListener("toggle", function () { if (sekcja.open) raz(); });
    odswiezLicznik();
    if (m) otworzNakladke(m[1]);
    g.addEventListener("hashchange", function () { var h = /#firma-zgloszenie=([0-9a-f-]{36})/.exec(g.location.hash || ""); if (h) otworzNakladke(h[1]); });
  }
  if (g.document.readyState === "loading") g.document.addEventListener("DOMContentLoaded", start); else start();
})(globalThis);
