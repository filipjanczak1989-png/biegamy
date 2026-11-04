// BAZA WIEDZY — panel trenera (Filip 3.11): kolejka kandydatów z liczbą zapytań, Zatwierdź / Popraw (tekst i ważność) / Odrzuć. Jedyne miejsce zatwierdzania;
// sędzia nocny i potok czytają status z bazy. Plik BEZ import/export (globalThis.BM_WIEDZA_PANEL), jak js/akcja.mjs: <script src> w trener.html, import w testach.
// Bezpieczeństwo: dostęp daje RLS (auth_is_coach) i kolumnowe uprawnienia; tutaj tekst przez escapeHtml, linki przez safeExternalHref {tylkoHttps}, id w data-*, jeden delegowany klik.
(function (g) {
  "use strict";
  var KOL = "id,pytanie,warianty,odpowiedz,zrodla,temat,intencja,waznosc,wazna_do,nietrwala,przepisana,skad,status,zapytan,utworzono";
  var STATUSY = [["kandydat", "Kandydaci"], ["zatwierdzona", "Zatwierdzone"], ["odrzucona", "Odrzucone"]];
  var MIN = 20, MAX = 1500, RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
  var INTENCJE = { porada: "porada", zywienie: "żywienie", sprzet: "sprzęt", fakt: "fakt" };

  /** błąd edycji albo null: te same granice co CHECK w bazie, żeby trener zobaczył zdanie, a nie kod błędu */
  function walidujEdycje(e, dzis) {
    var t = String(e.odpowiedz || "").trim();
    if (t.length < MIN) return "Odpowiedź jest za krótka (min. " + MIN + " znaków).";
    if (t.length > MAX) return "Odpowiedź jest za długa (max " + MAX + " znaków).";
    if (/https?:|www\./i.test(t)) return "Linki trzymamy w źródłach, nie w treści.";
    if (e.waznosc !== "wieczna" && e.waznosc !== "do_daty") return "Wybierz ważność.";
    if (e.waznosc === "wieczna" && e.nietrwala) return "Pytanie o cenę albo termin musi mieć datę ważności.";
    if (e.waznosc === "do_daty") {
      if (!RE_DATA.test(String(e.wazna_do || ""))) return "Podaj datę ważności.";
      if (e.wazna_do < dzis) return "Data ważności już minęła.";
    }
    return null;
  }
  /** przeterminowanego nie zatwierdzamy: i tak nie poszedłby do ludzi */
  function walidujZatwierdzenie(w, dzis) {
    return walidujEdycje({ odpowiedz: w.odpowiedz, waznosc: w.waznosc, wazna_do: w.wazna_do, nietrwala: w.nietrwala }, dzis);
  }

  function metaKarty(w) {
    var n = Number(w.zapytan) || 0;
    return [INTENCJE[w.intencja] || w.intencja, w.temat || "", n + " " + (n === 1 ? "zapytanie" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "zapytania" : "zapytań"),
      w.waznosc === "wieczna" ? "ważna bez daty" : "ważna do " + w.wazna_do, w.skad === "wzorzec" ? "wzorzec" : w.przepisana ? "" : "bez przepisania"].filter(Boolean).join(" · ");
  }
  function htmlKarty(w, o) {
    var id = o.esc(String(w.id));
    var zrodla = (Array.isArray(w.zrodla) ? w.zrodla : []).map(function (z) {
      var h = z && o.href ? o.href(z.url, { tylkoHttps: true }) : "";
      return h ? '<li><a href="' + h + '" target="_blank" rel="noopener noreferrer">' + o.esc(z.tytul || "źródło") + "</a></li>" : "";
    }).join("");
    var warianty = Array.isArray(w.warianty) && w.warianty.length ? '<details class="wz-warianty"><summary>Inaczej zadane: ' + w.warianty.length + "</summary><ul>" + w.warianty.map(function (x) { return "<li>" + o.esc(x) + "</li>"; }).join("") + "</ul></details>" : "";
    var przyciski = w.status === "kandydat"
      ? '<button type="button" class="wz-btn wz-glowny" data-akcja="zatwierdz" data-id="' + id + '">Zatwierdź</button><button type="button" class="wz-btn" data-akcja="popraw" data-id="' + id + '">Popraw</button><button type="button" class="wz-btn" data-akcja="odrzuc" data-id="' + id + '">Odrzuć</button>'
      : w.status === "zatwierdzona"
        ? '<button type="button" class="wz-btn" data-akcja="popraw" data-id="' + id + '">Popraw</button><button type="button" class="wz-btn" data-akcja="odrzuc" data-id="' + id + '">Odrzuć</button>'
        : '<button type="button" class="wz-btn" data-akcja="przywroc" data-id="' + id + '">Przywróć do kolejki</button>';
    return '<article class="wz-karta" data-karta="' + id + '"><h3 class="wz-pytanie">' + o.esc(w.pytanie) + '</h3><div class="wz-meta">' + o.esc(metaKarty(w)) + "</div>" +
      '<p class="wz-odpowiedz">' + o.esc(w.odpowiedz) + "</p>" + warianty + (zrodla ? '<ul class="wz-zrodla">' + zrodla + "</ul>" : "") + '<div class="wz-przyciski">' + przyciski + "</div></article>";
  }
  function htmlEdycji(w, o) {
    var id = o.esc(String(w.id));
    return '<article class="wz-karta" data-karta="' + id + '"><h3 class="wz-pytanie">' + o.esc(w.pytanie) + "</h3>" +
      '<label class="wz-pole">Odpowiedź<textarea rows="7" maxlength="' + MAX + '" data-pole="odpowiedz">' + o.esc(w.odpowiedz) + "</textarea></label>" +
      '<label class="wz-pole">Ważność<select data-pole="waznosc"><option value="wieczna"' + (w.waznosc === "wieczna" ? " selected" : "") + (w.nietrwala ? " disabled" : "") + '>bez daty</option><option value="do_daty"' + (w.waznosc === "do_daty" ? " selected" : "") + ">do daty</option></select></label>" +
      '<label class="wz-pole">Ważna do<input type="date" data-pole="wazna_do" value="' + o.esc(w.wazna_do || "") + '"></label>' +
      (w.nietrwala ? '<div class="wz-meta">Pytanie o cenę albo termin: zawsze z datą ważności.</div>' : "") + '<div class="wz-blad" role="alert" hidden></div>' +
      '<div class="wz-przyciski"><button type="button" class="wz-btn wz-glowny" data-akcja="zapisz" data-id="' + id + '">Zapisz</button><button type="button" class="wz-btn" data-akcja="anuluj" data-id="' + id + '">Anuluj</button></div></article>';
  }

  var STYL = ".wz-naglowek{font-size:10px;letter-spacing:.25em;text-transform:uppercase;color:var(--muted);font-family:'DM Mono',monospace;margin-bottom:10px}" +
    ".wz-filtry{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.wz-filtr{min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--fg);font:inherit;font-size:13px;cursor:pointer}.wz-filtr[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}" +
    ".wz-karta{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;margin-bottom:12px}.wz-pytanie{font-size:15px;font-weight:600;color:var(--fg);margin:0 0 4px;overflow-wrap:anywhere}" +
    ".wz-meta{color:var(--muted);font-family:'DM Mono',monospace;font-size:11px;margin-bottom:8px;overflow-wrap:anywhere}.wz-odpowiedz{color:var(--fg);font-size:14px;line-height:1.5;margin:0 0 10px;white-space:pre-wrap;overflow-wrap:anywhere}" +
    ".wz-warianty{color:var(--muted);font-size:12px;margin-bottom:8px}.wz-warianty ul,.wz-zrodla{margin:6px 0 10px;padding-left:18px;font-size:12px}.wz-zrodla a{color:var(--accent3,var(--accent));overflow-wrap:anywhere}" +
    ".wz-przyciski{display:flex;gap:8px;flex-wrap:wrap}.wz-btn{flex:1 1 auto;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--fg);font:inherit;font-size:14px;font-weight:600;cursor:pointer}.wz-btn:disabled{opacity:.5}.wz-glowny{background:var(--accent);border-color:var(--accent);color:#fff}" +
    ".wz-pole{display:block;color:var(--muted);font-size:12px;margin-bottom:10px}.wz-pole textarea,.wz-pole select,.wz-pole input{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--fg);font:inherit;font-size:14px}.wz-blad{color:#e5534b;font-size:13px;margin-bottom:10px}";

  /** opcje: {sb, root, esc, href, toast?, offline?, dzis?} → {zaladuj()} */
  function panel(o) {
    var root = o.root, stan = { status: "kandydat", lista: [], edytowany: null };
    var dzis = function () { return o.dzis || new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Warsaw" }); };
    var info = function (t) { if (o.toast) o.toast(t); };
    function rysuj(komunikat) {
      var liczba = stan.lista.length;
      root.innerHTML = '<div class="wz-naglowek">Baza wiedzy Okienka</div><div class="wz-filtry">' + STATUSY.map(function (s) {
        return '<button type="button" class="wz-filtr" data-status="' + s[0] + '" aria-pressed="' + (s[0] === stan.status) + '">' + o.esc(s[1]) + "</button>";
      }).join("") + "</div>" + (komunikat ? '<div class="wz-meta">' + o.esc(komunikat) + "</div>" : !liczba ? '<div class="wz-meta">' + (stan.status === "kandydat" ? "Kolejka jest pusta." : "Na razie nic tu nie ma.") + "</div>" : "") +
        stan.lista.map(function (w) { return stan.edytowany === w.id ? htmlEdycji(w, o) : htmlKarty(w, o); }).join("");
    }
    async function zaladuj() {
      stan.edytowany = null;
      var r = await o.sb.from("okienko_wiedza").select(KOL).eq("status", stan.status).order("zapytan", { ascending: false }).order("utworzono", { ascending: false }).limit(200);
      if (o.offline && o.offline(r.error)) return;
      if (r.error) { stan.lista = []; rysuj("Nie udało się wczytać bazy wiedzy."); return; }
      stan.lista = r.data || [];
      rysuj();
    }
    async function zmien(id, zmiana) {
      var r = await o.sb.from("okienko_wiedza").update(zmiana).eq("id", id).select("id");
      if (r.error || !r.data || !r.data.length) { info("Nie udało się zapisać."); return false; }
      return true;
    }
    function wpis(id) { return stan.lista.filter(function (w) { return w.id === id; })[0] || null; }
    root.addEventListener("click", async function (e) {
      var filtr = e.target.closest ? e.target.closest("[data-status]") : null;
      if (filtr) { stan.status = filtr.getAttribute("data-status"); await zaladuj(); return; }
      var b = e.target.closest ? e.target.closest("[data-akcja]") : null;
      if (!b) return;
      var id = Number(b.getAttribute("data-id")), a = b.getAttribute("data-akcja"), w = wpis(id);
      if (!Number.isInteger(id) || !w) return;
      if (a === "popraw") { stan.edytowany = id; rysuj(); return; }
      if (a === "anuluj") { stan.edytowany = null; rysuj(); return; }
      b.disabled = true;
      if (a === "zatwierdz") {
        var bl = walidujZatwierdzenie(w, dzis());
        if (bl) { info(bl + " Użyj „Popraw”."); b.disabled = false; return; }
        if (await zmien(id, { status: "zatwierdzona" })) { info("Zatwierdzone."); await zaladuj(); return; }
      } else if (a === "odrzuc") {
        if (await zmien(id, { status: "odrzucona" })) { info("Odrzucone: nie wróci do kolejki."); await zaladuj(); return; }
      } else if (a === "przywroc") {
        if (await zmien(id, { status: "kandydat" })) { info("Wróciło do kolejki."); await zaladuj(); return; }
      } else if (a === "zapisz") {
        var k = root.querySelector('[data-karta="' + id + '"]'), p = function (n) { return k.querySelector('[data-pole="' + n + '"]').value; };
        var ed = { odpowiedz: p("odpowiedz").trim(), waznosc: p("waznosc"), wazna_do: p("wazna_do") || null };
        var blad = walidujEdycje({ odpowiedz: ed.odpowiedz, waznosc: ed.waznosc, wazna_do: ed.wazna_do, nietrwala: w.nietrwala }, dzis()), el = k.querySelector(".wz-blad");
        if (blad) { el.textContent = blad; el.hidden = false; b.disabled = false; return; }
        if (ed.waznosc === "wieczna") ed.wazna_do = null;
        if (await zmien(id, ed)) { info("Zapisane."); await zaladuj(); return; }
      }
      b.disabled = false;
    });
    if (!g.document.getElementById("wz-styl")) { var st = g.document.createElement("style"); st.id = "wz-styl"; st.textContent = STYL; g.document.head.appendChild(st); }
    return { zaladuj: zaladuj };
  }

  g.BM_WIEDZA_PANEL = { panel: panel, walidujEdycje: walidujEdycje, walidujZatwierdzenie: walidujZatwierdzenie, htmlKarty: htmlKarty, htmlEdycji: htmlEdycji, metaKarty: metaKarty, KOL: KOL };
})(typeof globalThis !== "undefined" ? globalThis : this);
