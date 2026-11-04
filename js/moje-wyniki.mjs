// „TO MOJE WYNIKI?” (Filip 3.11, blizna-143): własny Profil pyta, czy wyniki z maszyny o tym samym imieniu, nazwisku i roczniku należą do zawodnika.
// Powiązanie zapisuje WYŁĄCZNIE sam zawodnik po „Tak” (RPC ustaw_f6_runner_key); nigdy automatycznie po nazwisku. „Nie” zapamiętane w f6_klucze_odrzucone: to pytanie nie wraca.
// Plik BEZ import/export (globalThis.BM_MOJE_WYNIKI), jak js/wyniki-lista.mjs: <script src> w profil.html, import w testach.
(function (g) {
  "use strict";
  var RE_KLUCZ = /^(?:[a-z0-9_-]{2,30}:[A-Za-z0-9._-]{1,80}|k:[^|]{2,60}\|\d{4})$/;   // ten sam kształt co CHECK athletes.f6_runner_key; „n:” (bez rocznika) nie da się zapisać
  var KLUCZ_PODPOWIEDZI = "bm_wyniki_podpowiedz_off";
  function kluczNazwy(s) { return g.BM_TEKST.bezZnakow(String(s || "")).split(/[^a-z0-9]+/).filter(Boolean).sort().join(" "); }
  /** Kandydaci do pytania: te same słowa imienia i nazwiska (≥ 2), ten sam rocznik, gdy konto go zna; bez odrzuconych; najwięcej startów pierwsze; ≤ 3. */
  function kandydaci(lista, imie, rocznik, odrzucone) {
    var k = kluczNazwy(imie), bez = odrzucone || [];
    if (k.split(" ").length < 2) return [];
    return (lista || []).filter(function (x) {
      return x && typeof x.runner_key === "string" && RE_KLUCZ.test(x.runner_key) && bez.indexOf(x.runner_key) < 0 && kluczNazwy(x.display_name) === k && (!rocznik || Number(x.yob) === Number(rocznik));
    }).sort(function (a, b) { return (Number(b.results_count) || 0) - (Number(a.results_count) || 0); }).slice(0, 3);
  }
  function esc(s) { return g.escapeHtml ? g.escapeHtml(String(s == null ? "" : s)) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function opis(x) { return [x.yob ? "rocznik " + x.yob : "", x.results_count != null ? x.results_count + " " + g.BM_TEKST.startow(Number(x.results_count)) : "", x.last_event ? "ostatni: " + x.last_event : ""].filter(Boolean).join(" · "); }
  var ST_KARTA = "background:var(--card);border:1px solid var(--border);border-radius:14px;padding:12px 14px;";
  var ST_BTN = "min-height:44px;padding:8px 18px;border-radius:10px;border:1px solid rgba(var(--accent-rgb),0.5);background:transparent;color:var(--accent);font:600 14px 'DM Sans',sans-serif;cursor:pointer;";
  function pokazKarte(root, html) { root.innerHTML = '<div style="' + ST_KARTA + '">' + html + "</div>"; root.hidden = false; }
  function wiersz(x) {
    return '<div data-wiersz style="padding:10px 0 0;"><div style="font-weight:600;color:var(--fg);">' + esc(x.display_name) + '</div><div style="font-size:12px;color:var(--muted);margin:2px 0 8px;">' + esc(opis(x)) + "</div>" +
      '<div style="display:flex;gap:8px;"><button type="button" style="' + ST_BTN + '" data-tak data-klucz="' + esc(x.runner_key) + '">Tak</button><button type="button" style="' + ST_BTN + 'color:var(--muted);border-color:var(--border);" data-nie data-klucz="' + esc(x.runner_key) + '">Nie</button></div></div>';
  }
  /** Konto z samym imieniem nie da się dopasować: podpowiedź do wyszukiwarki Wyników („To ja”), do odrzucenia na tym urządzeniu. */
  function podpowiedz(root) {
    try { if (g.localStorage && g.localStorage.getItem(KLUCZ_PODPOWIEDZI) === "1") return false; } catch (e) { /* prywatne okno */ }
    pokazKarte(root, '<div style="font-weight:600;color:var(--fg);">Masz za sobą zawody?</div><div style="font-size:13px;color:var(--muted);margin:4px 0 10px;">Znajdź się w Wynikach i dotknij „To ja”. Sami dopasujemy, gdy w Profilu będzie imię, nazwisko i data urodzenia.</div>' +
      '<div style="display:flex;gap:8px;"><a href="wyniki.html" style="' + ST_BTN + 'text-decoration:none;display:inline-flex;align-items:center;">Wyniki ›</a><button type="button" style="' + ST_BTN + 'color:var(--muted);border-color:var(--border);" data-nie-teraz>Nie teraz</button></div>');
    root.addEventListener("click", function (e) {
      if (!e.target.closest || !e.target.closest("[data-nie-teraz]")) return;
      try { g.localStorage.setItem(KLUCZ_PODPOWIEDZI, "1"); } catch (er) { /* prywatne okno */ }
      root.hidden = true; root.innerHTML = "";
    });
    return true;
  }
  /** o: {sb, athleteId, root, api?} → nic nie zapisuje, dopóki zawodnik nie dotknie Tak albo Nie. Każdy błąd = brak karty (Profil działa dalej). */
  async function pokaz(o) {
    var sb = o.sb, root = o.root, id = o.athleteId;
    if (!sb || !root || !id || !(g.wynikiApiDostepne && g.wynikiApiDostepne())) return "pominiete";
    var a = await sb.from("athletes").select("full_name,date_of_birth,f6_runner_key").eq("id", id).maybeSingle();
    if (a.error || !a.data || a.data.f6_runner_key) return "pominiete";
    var imie = String(a.data.full_name || "").trim();
    if (imie.split(/\s+/).filter(Boolean).length < 2) return podpowiedz(root) ? "podpowiedz" : "pominiete";
    var rocznik = a.data.date_of_birth ? Number(String(a.data.date_of_birth).slice(0, 4)) || null : null;
    var api = o.api || g.wynikiApi(sb);
    var odr = await sb.from("f6_klucze_odrzucone").select("klucz").eq("athlete_id", id);   // tabeli może jeszcze nie być: wtedy pusto
    var s = await api.rpc("search_runners", { q: imie.slice(0, 80), lim: 10 });
    if (s.error) return "pominiete";
    var kand = kandydaci(s.data, imie, rocznik, odr.error ? [] : (odr.data || []).map(function (x) { return x.klucz; }));
    if (!kand.length) return "pominiete";
    pokazKarte(root, '<div style="font-weight:600;color:var(--fg);font-size:15px;">To moje wyniki?</div><div style="font-size:12px;color:var(--muted);margin-top:2px;">Maszyna wyników zna osobę o Twoim imieniu i nazwisku. Potwierdzisz tylko Ty.</div>' + kand.map(wiersz).join(""));
    root.addEventListener("click", async function (e) {
      var b = e.target.closest ? e.target.closest("[data-tak],[data-nie]") : null;
      if (!b || !RE_KLUCZ.test(b.getAttribute("data-klucz") || "")) return;
      var k = b.getAttribute("data-klucz"), w = b.closest("[data-wiersz]");
      b.disabled = true;
      if (b.hasAttribute("data-tak")) {
        var t = await sb.rpc("ustaw_f6_runner_key", { p_key: k });
        if (t.error) { b.disabled = false; if (g.showToast) g.showToast("Nie udało się zapisać."); return; }
        pokazKarte(root, '<div style="font-weight:600;color:var(--fg);">Zapisane: to Twoje wyniki.</div><a href="wyniki.html#/zawodnik/' + encodeURIComponent(k) + '" style="' + ST_BTN + 'text-decoration:none;display:inline-flex;align-items:center;margin-top:10px;">Zobacz wyniki ›</a>');
        return;
      }
      var n = await sb.from("f6_klucze_odrzucone").insert({ athlete_id: id, klucz: k });
      if (n.error && n.error.code !== "23505") { b.disabled = false; if (g.showToast) g.showToast("Nie udało się zapisać."); return; }
      if (w) w.remove();
      if (!root.querySelector("[data-wiersz]")) { root.hidden = true; root.innerHTML = ""; }
    });
    return "pytanie";
  }
  g.BM_MOJE_WYNIKI = { kandydaci: kandydaci, kluczNazwy: kluczNazwy, pokaz: pokaz, RE_KLUCZ: RE_KLUCZ };
})(typeof globalThis !== "undefined" ? globalThis : this);
