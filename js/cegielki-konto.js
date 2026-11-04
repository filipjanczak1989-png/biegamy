// CEGIEŁKI: konto gracza i ranking światowy. Gra działa bez tego pliku, bez sieci i bez logowania; tu nic nie może jej zatrzymać.
// sb.js waży pół megabajta: ładujemy go dopiero, gdy w przeglądarce jest sesja. Gracz z Facebooka czyta ranking przez EF i nie płaci za resztę aplikacji.
// Dane z rankingu są niezaufane: wyłącznie textContent, żadnego innerHTML (blizna-154).
(function () {
  "use strict";
  var BAZA = "https://afqojgkaveykxbltxzwm.supabase.co";
  var KLUCZ_SESJI = "sb-afqojgkaveykxbltxzwm-auth-token";
  /* Dwa rankingi: najlepsza runda i suma dołożona do wspólnego muru. Klucze to pola odpowiedzi gra_ranking. */
  var WIDOKI = {
    runda: { nazwa: "Najlepsza runda", okresy: { dzien: "Dziś", tydzien: "Ten tydzień", wszech: "Wszech czasów" }, domyslny: "dzien" },
    dolozyli: { nazwa: "Kto najwięcej dołożył", okresy: { dolozyli_akcja: "W czasie akcji", dolozyli_wszech: "Wszech czasów" }, domyslny: "dolozyli_akcja" },
  };
  var OPOZNIENIE_STARTU_MS = 6000;   // serwer liczy czas rundy od numeru; później numer zrobiłby z dobrej rundy podejrzaną
  var parametry = new URLSearchParams(location.search);
  var przyklad = parametry.get("ranking") === "przyklad" && location.hostname !== "biegamy.run" && location.hostname !== "run.biegamy.app";
  var $ = function (id) { return document.getElementById(id); };

  var L = window.BM_CEGIELKI;
  var stan = { zalogowany: false, pseudonim: null, widok: "runda", okres: "dzien", imie: "", urlZbiorki: "", ranking: undefined, miejsca: null, runda: null, saldo: null, kupione: czytajJson("cegielki_kupione", []), wybor: czytajJson("cegielki_stroj", {}), ulepszenie: null, potwierdz: null,
    cegly: Number(czytajJson("cegielki_suma", 0)) || 0, rower: false, podpisRoweru: "", koparkaWlaczona: false, arkuszKoparki: "", koparka: false, podglad: false };
  function czytajJson(k, zapas) { try { var w = JSON.parse(localStorage.getItem(k)); return w == null ? zapas : w; } catch (e) { return zapas; } }
  function zapiszJson(k, w) { try { localStorage.setItem(k, JSON.stringify(w)); } catch (e) {} }
  function ustawKonto(saldo, kupione) {
    if (typeof saldo === "number") stan.saldo = saldo;
    if (Array.isArray(kupione)) { stan.kupione = kupione; zapiszJson("cegielki_kupione", kupione); }
    var e = $("m-saldo"); if (e) e.textContent = stan.saldo == null ? "" : "(" + stan.saldo + ")";
  }
  var gotowe = Promise.resolve();

  function czyJestSesja() { try { return !!localStorage.getItem(KLUCZ_SESJI); } catch (e) { return false; } }
  function skrypt(src) {
    return new Promise(function (ok, zle) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = zle; document.head.appendChild(s); });
  }
  async function polacz() {
    if (przyklad) { stan.zalogowany = true; stan.pseudonim = parametry.get("pseudonim") || null; ustawKonto(40, ["koszulka-czerwona"]); var pp = Number(parametry.get("poziom")); stan.cegly = pp >= 1 && pp <= L.POZIOMY.length ? L.POZIOMY[pp - 1] : 6000; rysujPostacie(); return; }
    if (!czyJestSesja()) return;
    await skrypt("vendor/supabase-js-2.112.4.min.js");
    await skrypt("sb.js");
    if (!window.sb) return;
    var sesja = (await window.sb.auth.getSession()).data.session;
    if (!sesja) return;
    stan.zalogowany = true;
    var r = await window.sb.from("gra_konto").select("pseudonim,saldo,kupione").maybeSingle();
    if (r && r.data && r.data.pseudonim) stan.pseudonim = r.data.pseudonim;
    ustawKonto(r && r.data ? r.data.saldo : 0, r && r.data ? r.data.kupione : []);
    var po = await window.sb.rpc("gra_moj_postep");
    if (po && !po.error && po.data && typeof po.data.cegly === "number") stan.cegly = po.data.cegly;
    podpowiedzImie(); rysujPostacie();
    if (parametry.get("sciezka") === "1") await sciezkaGry();
  }
  /* ŚCIEŻKA FABIANKA: przełącznik „Podgląd postaci” tylko dla trenera i konta testowego (zamkiem jest funkcja, odmowa = nie ma przełącznika). Tylko to urządzenie, bez zapisu do gra_konto i bez rankingu. */
  async function sciezkaGry() {
    var r = await window.sb.functions.invoke("akcja-proba-wizerunek", { body: {} });
    var w = r && r.data && r.data.ok ? r.data : null;
    if (!w) return;
    document.body.classList.remove("gra-zamknieta");
    var etyk = $("m-podglad"), pole = $("m-podglad-pole"); if (!etyk || !pole) return;
    etyk.hidden = false; pole.checked = czytajJson("cegielki_podglad", false) === true;
    pole.addEventListener("change", function () { zapiszJson("cegielki_podglad", pole.checked); location.reload(); });
    if (pole.checked) ustawPodglad(w);
  }
  function ustawPodglad(w) {
    var GR = window.BM_CEGIELKI_GRA;
    stan.podglad = true;
    if (GR) { GR.wlaczRowerzyste(); if (w.koparka_url) GR.ustawKoparke(w.koparka_url); }
    wlaczPostacRoweru("");
    stan.koparkaWlaczona = true; stan.arkuszKoparki = L.arkuszKoparki({ wystartowala: true, koparka_arkusz_url: w.koparka_arkusz_url }) || stan.arkuszKoparki;
    rysujPostacie();
    if (GR && Array.isArray(w.firmy)) GR.ustawFirmy(L.firmyZLicznika({ firmy: w.firmy }));
  }
  function podpowiedzImie() {
    var pole = $("imie");
    if (pole && !pole.value && stan.pseudonim) pole.value = stan.pseudonim;
  }

  function czyKorona() { return przyklad || L.maKorone(stan.ranking, stan.pseudonim); }
  function wybor() { return L.poprawnyStroj(stan.wybor, stan.kupione, czyKorona()); }
  /* daj(typ) zakłada ulepszenie dopiero po odpowiedzi serwera. Wybór jest jednorazowy: kolejna runda nie zapłaci sama. */
  function przedRunda(daj) {
    stan.runda = null;
    if (stan.podglad) { stan.ulepszenie = null; return; }
    var runda = { numer: null, gotowa: null }, ulepszenie = stan.ulepszenie;
    stan.ulepszenie = null;
    var t0 = performance.now();
    runda.gotowa = gotowe.then(function () {
      if (przyklad) { if (ulepszenie && daj) { var cena = L.ULEPSZENIA.filter(function (u) { return u.id === ulepszenie; })[0].cena; if (stan.saldo >= cena) { ustawKonto(stan.saldo - cena); daj(ulepszenie); } } return; }
      if (!stan.zalogowany) return;
      return window.sb.rpc("gra_start_rundy", ulepszenie ? { p_ulepszenie: ulepszenie } : {}).then(function (r) {
        if (r.error || !r.data || !r.data.ok) { runda.powod = r.data && r.data.powod; return; }
        ustawKonto(r.data.saldo);
        if (r.data.ulepszenie && daj) daj(r.data.ulepszenie);
        if (performance.now() - t0 > OPOZNIENIE_STARTU_MS) { runda.powod = "wolno"; return; }
        runda.numer = r.data.runda;
      });
    }).catch(function () { runda.powod = "siec"; });
    stan.runda = runda;
  }

  function info(tekst) { var e = $("r-info"); if (e) { e.textContent = tekst || ""; e.hidden = !tekst; } }
  async function poRundzie(w) {
    if (!$("k-ranking")) return;
    stan.miejsca = null;
    budujRanking(); info(""); rysuj();
    if (w.maly) { await odswiezRanking(); return; }   // Mały budowniczy: lista do obejrzenia, zapisu nie ma
    if (stan.podglad) { info("Podgląd postaci: bez zapisu i bez rankingu."); await odswiezRanking(); info("Podgląd postaci: bez zapisu i bez rankingu."); return; }
    /* Bez konta suma żyje tylko na tym urządzeniu. Z kontem liczy ją serwer z przyjętych rund. */
    var przedRunda2 = L.poziom(stan.cegly);
    if (!stan.zalogowany || przyklad) { stan.cegly += w.cegly; if (!przyklad) zapiszJson("cegielki_suma", stan.cegly); rysujPostacie(przedRunda2); }
    var runda = stan.runda; stan.runda = null;
    if (przyklad) { stan.miejsca = { dzien: { miejsce: 4, cegly: w.cegly }, tydzien: { miejsce: 12, cegly: w.cegly }, wszech: { miejsce: 87, cegly: w.cegly }, dolozyli_akcja: { miejsce: 31, cegly: w.cegly }, dolozyli_wszech: { miejsce: 31, cegly: w.cegly } }; ustawKonto((stan.saldo || 0) + w.st.zlote); await odswiezRanking(); return; }
    await gotowe;
    if (!stan.zalogowany || !runda) { await odswiezRanking(); return; }
    info("Zapisuję wynik…");
    await runda.gotowa;
    if (!runda.numer) {
      info(runda.powod === "wylaczona" ? "" : runda.powod === "za_czesto" ? "Za dużo rund w minucie: ta runda bez rankingu." : runda.powod === "brak_profilu" ? "To konto nie ma profilu zawodnika, więc nie ma go w rankingu." : "Ta runda bez rankingu: słabe łącze na starcie.");
      await odswiezRanking(); return;
    }
    var odp = null;
    for (var proba = 0; proba < 2 && !odp; proba++) {
      var r = await window.sb.rpc("gra_zapisz_wynik", { p_runda: runda.numer, p_postac: w.postac, p_cegly: w.cegly, p_czas: Number(w.t.toFixed(2)),
        p_st: { zlote: w.st.zlote, salta: w.st.salta, seria: w.st.seria, upadki: w.st.upadki, bidony: w.st.bidony } });
      if (!r.error) odp = r.data;
    }
    if (!odp) info("Nie udało się zapisać wyniku: brak łącza.");
    else if (odp.ok) { info(""); stan.miejsca = odp.miejsca || null; ustawKonto(odp.saldo); if (typeof odp.cegly_lacznie === "number") stan.cegly = odp.cegly_lacznie; rysujPostacie(przedRunda2); }
    else info(odp.powod === "podejrzany" ? "Ten wynik nie przeszedł kontroli i czeka na przegląd." : odp.powod === "postac_zablokowana" ? "Ta postać nie jest jeszcze odblokowana na Twoim koncie, runda bez rankingu." : "Ta runda bez rankingu.");
    await odswiezRanking();
  }

  async function pobierzRanking() {
    if (przyklad) {
      return { dzien: [["Biegaczka", 1840, "kasia"], ["Szybki-Janek", 1610, "filip"], ["Ania", 1422, "kasia"], ["Marek", 1200, "filip"], ["Zosia", 960, "kasia"], ["Tomek", 655, "filip"]].map(function (w, i) { return { miejsce: i + 1, pseudonim: w[0], cegly: w[1], postac: w[2] }; }),
        tydzien: [{ miejsce: 1, pseudonim: "Rekordzista", cegly: 2210, postac: "filip" }], wszech: [],
        dolozyli_akcja: [{ miejsce: 1, pseudonim: "Biegaczka", cegly: 18420 }, { miejsce: 2, pseudonim: "Marek", cegly: 9310 }], dolozyli_wszech: [{ miejsce: 1, pseudonim: "Biegaczka", cegly: 18420 }],
        mur: 48210, mur_cel: 12500000 };
    }
    if (stan.zalogowany && window.sb) {
      var r = await window.sb.rpc("gra_ranking");
      if (!r.error && r.data) return r.data;
    }
    var f = await fetch(BAZA + "/functions/v1/gra-ranking", { headers: { Accept: "application/json" } });
    if (!f.ok) throw new Error("ranking " + f.status);
    return f.json();
  }
  async function odswiezRanking() {
    await gotowe;
    try { stan.ranking = await pobierzRanking(); } catch (e) { stan.ranking = null; }
    rysuj(); rysujMur(); rysujPostacie();
  }

  /* ── poziom i postacie do odblokowania ── */
  function liczba(n) { return Number(n || 0).toLocaleString("pl-PL"); }
  function rysujPoziom(id) {
    var k = $(id); if (!k) return;
    var pp = L.postepPoziomu(stan.cegly); k.textContent = "";
    k.appendChild(el("span", "pz-nazwa", "Poziom " + pp.poziom));
    var pas = el("span", "pz-pasek"), wn = el("span"); wn.style.width = pp.procent + "%"; pas.appendChild(wn); k.appendChild(pas);
    k.appendChild(el("span", "pz-reszta", pp.nastepny ? "do poziomu " + pp.nastepny + ": " + liczba(pp.brakuje) : "najwyższy poziom"));
  }
  /* Zablokowanych postaci nie pokazujemy wcale (Filip 4.11): karta pojawia się dopiero po odblokowaniu, raz z krótką animacją. */
  function rysujKarte(id, widoczna, nazwa, gotowa) {
    var b = document.querySelector('.postac[data-postac="' + id + '"]'); if (!b) return;
    b.hidden = !(widoczna && gotowa);
    if (!b.hidden) { b.querySelector(".p-nazwa").textContent = nazwa; ogloszNowa(id, nazwa); }
  }
  function otwarta(id) { return stan.podglad || L.odblokowana(id, stan.cegly, stan.ranking && stan.ranking.mur); }
  function rysujPostacie(poziomPrzed) {
    rysujPoziom("m-poziom"); rysujPoziom("k-poziom");
    if (stan.rower && otwarta("rowerzysta")) zaladujRower();
    if (stan.koparkaWlaczona && stan.arkuszKoparki && otwarta("koparka")) sprobujKoparke();
    rysujKarte("rowerzysta", stan.rower, L.imieZPodpisu(stan.podpisRoweru) || "Rowerzysta", stan.rowerGotowy);
    rysujKarte("koparka", stan.koparka, stan.imie || "Koparka", stan.koparka);
    var e = $("k-awans");
    if (e && poziomPrzed) { var teraz = L.poziom(stan.cegly); e.hidden = teraz <= poziomPrzed; e.textContent = teraz > poziomPrzed ? "Nowy poziom: " + teraz + "!" : ""; }
    pokazFinal();
  }
  /* Animacja raz na urządzenie, po pierwszym pojawieniu się karty. */
  function ogloszNowa(id, nazwa) {
    if (stan.podglad) return;
    var znane = czytajJson("cegielki_nowe", []);
    if (!Array.isArray(znane) || znane.indexOf(id) >= 0) return;
    if (id === "koparka" && stan.ranking && Number(stan.ranking.mur) >= Number(stan.ranking.mur_cel)) { zapiszJson("cegielki_nowe", znane.concat([id])); return; }   // finał muru pokazuje to sam
    zapiszJson("cegielki_nowe", znane.concat([id]));
    var e = $("nowa"), GR = window.BM_CEGIELKI_GRA, a = GR && GR.A[id === "koparka" ? "koparka_ark" : "rowerzysta_bieg"], o = GR && GR.OBR[id === "koparka" ? "koparka_ark" : "rowerzysta_bieg"], kan = $("n-obraz");
    if (!e) return;
    if (a && o && kan) { var nr = id === "koparka" ? L.KLATKI_KOPARKI.radosc : 0; kan.width = a.cw; kan.height = a.ch; kan.getContext("2d").drawImage(o, a.cw * nr, 0, a.cw, a.ch, 0, 0, a.cw, a.ch); }
    $("n-nazwa").textContent = nazwa;
    e.hidden = false;
    clearTimeout(ogloszNowa.zegar);
    ogloszNowa.zegar = setTimeout(function () { e.hidden = true; }, 2800);
  }
  /* Plik roweru dopiero przy włączonym przełączniku. Arkusze do grania dopiero po odblokowaniu; bok menu to mała animacja. */
  function wlaczPostacRoweru(opis) {
    stan.rower = true; stan.podpisRoweru = typeof opis === "string" ? opis : "";
    var bok = $("m-bok-rower"); if (bok) { bok.src = "assets/akcja/rowerzysta.webp"; bok.hidden = false; }
    rysujPostacie();
  }
  function zaladujRower() {
    var GR = window.BM_CEGIELKI_GRA;
    if (!GR || stan.rowerGotowy || stan.rowerLaduje) return;
    stan.rowerLaduje = true;
    GR.wczytajObrazy(["rowerzysta_bieg", "rowerzysta_skok"]).then(function () { stan.rowerGotowy = true; GR.kartaPostaci("rowerzysta"); rysujPostacie(); });
  }
  /* Koparka: dwa warunki z dwóch źródeł. Przełącznik z rankingu, adres arkusza z licznika po starcie. Dopóki nie ma obu i odblokowania, nie ma karty ani prośby o plik. */
  function sprobujKoparke() {
    var GR = window.BM_CEGIELKI_GRA;
    if (!GR || !stan.koparkaWlaczona || !stan.arkuszKoparki || stan.koparka || stan.koparkaLaduje || !otwarta("koparka")) return;
    stan.koparkaLaduje = true;
    GR.wczytajArkuszKoparki(stan.arkuszKoparki).then(function (ok) {
      stan.koparkaLaduje = false;
      if (!ok) return;
      stan.koparka = true; GR.kartaPostaci("koparka", stan.arkuszKoparki); rysujPostacie();
    });
  }
  /* Finał: wspólny mur gotowy, koparka dla wszystkich. Animacja raz na urządzenie. */
  function pokazFinal() {
    var f = $("final"); if (!f || !stan.koparka) return;
    var d = stan.ranking, cel = d && Number(d.mur_cel);
    if (!(cel > 0) || !(Number(d.mur) >= cel) || czytajJson("cegielki_final", false)) return;
    zapiszJson("cegielki_final", true);
    var GR = window.BM_CEGIELKI_GRA, a = GR.A.koparka_ark, o = GR.OBR.koparka_ark, kan = $("f-kop");
    if (a && o && kan) { kan.width = a.cw; kan.height = a.ch; kan.getContext("2d").drawImage(o, a.cw * L.KLATKI_KOPARKI.radosc, 0, a.cw, a.ch, 0, 0, a.cw, a.ch); }
    $("f-tekst").textContent = "Wspólny mur gotowy: " + liczba(d.mur) + " cegieł! " + (stan.imie ? "Koparka " + L.dopelniacz(stan.imie) + " jest teraz dla wszystkich." : "Koparka jest teraz dla wszystkich.");
    f.hidden = false;
  }

  /* ── rysowanie: same węzły i textContent ── */
  function el(tag, klasa, tekst) { var e = document.createElement(tag); if (klasa) e.className = klasa; if (tekst != null) e.textContent = tekst; return e; }
  function budujRanking() {
    var k = $("k-ranking");
    if (k.dataset.gotowy) return;
    k.dataset.gotowy = "1";
    var wid = el("div", "r-widoki"); wid.setAttribute("role", "tablist"); wid.setAttribute("aria-label", "Rodzaj rankingu");
    Object.keys(WIDOKI).forEach(function (w) {
      var b = el("button", "r-widok", WIDOKI[w].nazwa); b.type = "button"; b.setAttribute("role", "tab"); b.dataset.widok = w;
      b.addEventListener("click", function () { stan.widok = w; stan.okres = WIDOKI[w].domyslny; rysuj(); });
      wid.appendChild(b);
    });
    k.appendChild(wid);
    var zak = el("div", "r-zakladki"); zak.id = "r-zakladki"; zak.setAttribute("role", "tablist"); zak.setAttribute("aria-label", "Okres"); k.appendChild(zak);
    var lista = el("ol", "r-lista"); lista.id = "r-lista"; k.appendChild(lista);
    var moje = el("p", "r-moje"); moje.id = "r-moje"; k.appendChild(moje);
    var zglos = el("p", "r-uwaga", "Ranking jest publiczny, pod pseudonimem. Obraźliwy pseudonim? Napisz na "); var adresZgl = el("a", "", "biegamy.run@gmail.com"); adresZgl.href = "mailto:biegamy.run@gmail.com"; adresZgl.style.color = "inherit"; zglos.appendChild(adresZgl); zglos.style.cssText = "margin:8px auto 0;font-size:12px;opacity:.75;"; k.appendChild(zglos);
    var inf = el("p", "r-info"); inf.id = "r-info"; inf.setAttribute("role", "status"); inf.hidden = true; k.appendChild(inf);
    var form = el("form", "r-pseudonim"); form.id = "r-pseudonim"; form.hidden = true;
    var pole = document.createElement("input"); pole.id = "r-pole"; pole.type = "text"; pole.maxLength = 14; pole.autocomplete = "off"; pole.placeholder = "Twój pseudonim"; pole.setAttribute("aria-label", "Pseudonim w rankingu");
    var zapisz = el("button", "g", "Do rankingu"); zapisz.type = "submit";
    form.appendChild(pole); form.appendChild(zapisz);
    var wiek = el("p", "r-uwaga", "Masz mniej niż 16 lat? Poproś rodzica, zanim wpiszesz pseudonim. Nie podawaj nazwiska."); wiek.style.cssText = "flex:0 0 100%;margin:2px 0 0;font-size:12px;opacity:.85;"; form.appendChild(wiek);
    form.addEventListener("submit", function (e) { e.preventDefault(); zapiszPseudonim(pole.value); });
    k.appendChild(form);
    var zaloguj = el("a", "r-zaloguj", "Zaloguj się, żeby trafić do rankingu"); zaloguj.id = "r-zaloguj"; zaloguj.href = "index.html"; zaloguj.hidden = true; k.appendChild(zaloguj);
  }
  function rysuj() {
    var k = $("k-ranking"); if (!k || !k.dataset.gotowy) return;
    k.querySelectorAll(".r-widok").forEach(function (b) { var w = b.dataset.widok === stan.widok; b.classList.toggle("wybrana", w); b.setAttribute("aria-selected", w ? "true" : "false"); });
    var zak = $("r-zakladki"), okresy = WIDOKI[stan.widok].okresy; zak.textContent = "";
    Object.keys(okresy).forEach(function (o) {
      var w = o === stan.okres, b = el("button", "r-zakladka" + (w ? " wybrana" : ""), okresy[o]); b.type = "button"; b.setAttribute("role", "tab"); b.dataset.okres = o; b.setAttribute("aria-selected", w ? "true" : "false");
      b.addEventListener("click", function () { stan.okres = o; rysuj(); });
      zak.appendChild(b);
    });
    var lista = $("r-lista"); lista.textContent = "";
    if (stan.ranking === undefined) { lista.appendChild(el("li", "r-pusto", "Ładuję ranking…")); }
    else if (!stan.ranking) { lista.appendChild(el("li", "r-pusto", "Ranking chwilowo niedostępny.")); }
    else {
      var wiersze = Array.isArray(stan.ranking[stan.okres]) ? stan.ranking[stan.okres] : [];
      if (!wiersze.length) lista.appendChild(el("li", "r-pusto", "Jeszcze nikogo tu nie ma."));
      wiersze.slice(0, 10).forEach(function (w) {
        var li = el("li", stan.pseudonim && String(w.pseudonim).toLowerCase() === stan.pseudonim.toLowerCase() ? "ja" : "");
        li.appendChild(el("span", "r-m", String(Number(w.miejsce) || "")));
        li.appendChild(el("span", "r-n", String(w.pseudonim == null ? "" : w.pseudonim)));
        li.appendChild(el("span", "r-c", String(Number(w.cegly) || 0)));
        lista.appendChild(li);
      });
    }
    var moje = stan.miejsca && stan.miejsca[stan.okres];
    $("r-moje").textContent = moje && moje.miejsce ? "Twoje miejsce: " + moje.miejsce + " (" + moje.cegly + ")" : "";
    $("r-pseudonim").hidden = !(stan.zalogowany && !stan.pseudonim) || stan.podglad;
    $("r-zaloguj").hidden = stan.zalogowany;
  }
  async function zapiszPseudonim(tekst) {
    var M = window.BM_MODERACJA, w = M && M.pseudonim ? M.pseudonim(tekst) : { ok: false, blad: "Filtr się nie wczytał. Odśwież stronę." };
    if (!w.ok) { info(w.blad); return; }
    if (przyklad) { stan.pseudonim = w.pseudonim; info(""); rysuj(); return; }
    info("Zapisuję…");
    try {
      var r = await window.sb.functions.invoke("gra-pseudonim", { body: { pseudonim: w.pseudonim } });
      var d = r.data;
      if (r.error && r.error.context && r.error.context.json) { try { d = await r.error.context.json(); } catch (e) { d = null; } }
      if (!d || !d.ok) { info((d && d.blad) || "Nie udało się zapisać. Spróbuj za chwilę."); return; }
      stan.pseudonim = d.pseudonim; info(""); podpowiedzImie();
      await odswiezRanking();
    } catch (e) { info("Nie udało się zapisać. Spróbuj za chwilę."); }
  }

  /* ── mur i zdanie: te same bloki na starcie, na końcu rundy i (samo zdanie) w sklepiku ── */
  function zdanie(kontener) {
    var p = el("p", "zdanie", L.zdanieOZbiorce(stan.imie));
    var link = L.linkZbiorki(stan.urlZbiorki);
    if (link) { var a = el("a", "", "Zbiórka ›"); a.href = link; a.target = "_blank"; a.rel = "noopener noreferrer"; p.appendChild(a); }
    kontener.appendChild(p);
  }
  function rysujMur() {
    ["m-mur", "k-mur"].forEach(function (id) {
      var k = $(id); if (!k) return;
      k.textContent = "";
      var d = stan.ranking, cel = d && Number(d.mur_cel);
      if (cel > 0) {
        k.appendChild(el("div", "mur-tytul", L.tekstMuru(d.mur, cel)));
        var pasek = el("div", "mur-pasek"), pr = L.procentMuru(d.mur, cel), i = document.createElement("i");
        pasek.setAttribute("role", "progressbar"); pasek.setAttribute("aria-valuemin", "0"); pasek.setAttribute("aria-valuemax", String(cel)); pasek.setAttribute("aria-valuenow", String(Number(d.mur) || 0));
        i.style.width = pr + "%"; pasek.appendChild(i); k.appendChild(pasek);
      }
      zdanie(k);
    });
    var s = $("s-zdanie"); if (s) { s.textContent = ""; zdanie(s); }
  }
  function rysujZbiorke() {
    var a = $("m-zbiorka"); if (!a) return;
    a.hidden = !stan.urlZbiorki;
    if (stan.urlZbiorki) a.href = stan.urlZbiorki;
  }
  /* Licznik akcji daje imię i adres zbiórki, tylko po starcie. Gra czyta go i tak, po szyldy firm. */
  function ustawAkcje(d) {
    if (!d) return;
    stan.imie = typeof d.imie === "string" ? d.imie : "";
    stan.urlZbiorki = L.linkZbiorki(d.url_zbiorki);
    stan.arkuszKoparki = L.arkuszKoparki(d) || stan.arkuszKoparki;
    rysujMur(); rysujZbiorke(); rysujPostacie();
  }

  /* ── sklepik: złote cegły z gry na wygląd i start z ulepszeniem. Zero pieniędzy. Pierwsze dotknięcie przymierza, drugie wymienia. ── */
  function cena(n, przedrostek) {
    var s = el("span", "s-cena", (przedrostek || "") + n);
    s.setAttribute("aria-label", (przedrostek || "") + n + " " + L.odmianaZlotych(n));
    var a = window.BM_CEGIELKI_GRA && window.BM_CEGIELKI_GRA.A.cegla_zlota;
    if (a) { var im = document.createElement("img"); im.src = "assets/gra/" + a.src; im.alt = ""; s.appendChild(im); }
    return s;
  }
  function brakuje(n) { return "Masz za mało złotych cegieł. Brakuje: " + n + "."; }
  function sinfo(t) { var e = $("s-info"); if (e) e.textContent = t || ""; }
  function odswiezPodglad() {
    var S = window.BM_CEGIELKI_STROJ, GR = window.BM_CEGIELKI_GRA; if (!S || !GR) return;
    var w = wybor();
    if (stan.potwierdz) { var p = L.SKLEP.filter(function (x) { return x.id === stan.potwierdz; })[0]; if (p) w[p.slot] = p.id; }
    var rysujPodglad = function () { ["kasia", "filip"].forEach(function (po) { try { S.podglad($("s-" + po), GR.OBR, GR.A, po, w); } catch (e) {} }); };
    GR.wczytajObrazy(S.nazwyObrazow(S.noszone(w))).then(rysujPodglad, rysujPodglad);
  }
  function wierszPrzedmiotu(p) {
    var ma = stan.kupione.indexOf(p.id) >= 0, zalozone = wybor()[p.slot] === p.id, czeka = stan.potwierdz === p.id;
    var b = el("button", "s-wiersz"); b.type = "button"; b.setAttribute("aria-pressed", zalozone || czeka ? "true" : "false");
    if (p.kolor) { var pr = el("span", "s-probka"); pr.style.background = "rgb(" + p.kolor.join(",") + ")"; pr.setAttribute("aria-hidden", "true"); b.appendChild(pr); }
    else { var ik = document.createElement("img"); ik.className = "s-ikona"; ik.src = "assets/gra/dodatek_" + p.id + ".webp"; ik.alt = ""; b.appendChild(ik); }
    b.appendChild(el("span", "s-nazwa", p.nazwa));
    if (p.tylkoCzolowka) { var moze = czyKorona(); b.disabled = !moze; b.appendChild(el("span", "s-cena", zalozone ? "Zdejmij" : moze ? "Załóż" : "Tylko TOP " + L.KORONA_MIEJSCA + " dnia")); }
    else b.appendChild(zalozone ? el("span", "s-cena", "Zdejmij") : ma ? el("span", "s-cena", "Załóż") : cena(p.cena, czeka ? "Wymień za " : ""));
    b.addEventListener("click", function () { klikPrzedmiotu(p); });
    return b;
  }
  async function klikPrzedmiotu(p) {
    sinfo("");
    if (stan.kupione.indexOf(p.id) >= 0 || (p.tylkoCzolowka && czyKorona())) {
      stan.potwierdz = null;
      stan.wybor = wybor(); stan.wybor[p.slot] = stan.wybor[p.slot] === p.id ? null : p.id; zapiszJson("cegielki_stroj", stan.wybor);
      rysujSklep(); return;
    }
    if (stan.potwierdz !== p.id) { stan.potwierdz = p.id; rysujSklep(); if (!stan.zalogowany) sinfo("To przymiarka. Wymiana złotych cegieł wymaga logowania."); else if ((stan.saldo || 0) < p.cena) sinfo(brakuje(p.cena - (stan.saldo || 0))); return; }
    if (!stan.zalogowany || stan.podglad) { sinfo(stan.podglad ? "Podgląd postaci: bez wymiany." : "To przymiarka. Wymiana złotych cegieł wymaga logowania."); return; }
    if (przyklad) {
      if (stan.saldo < p.cena) { sinfo(brakuje(p.cena - stan.saldo)); return; }
      ustawKonto(stan.saldo - p.cena, stan.kupione.concat([p.id]));
    } else {
      sinfo("Wymieniam…");
      var r = await window.sb.rpc("gra_kup", { p_przedmiot: p.id });
      if (r.error || !r.data) { sinfo("Nie udało się. Sprawdź łącze i spróbuj jeszcze raz."); return; }
      ustawKonto(r.data.saldo, r.data.kupione);
      if (!r.data.ok && r.data.powod !== "juz_masz") { sinfo(r.data.powod === "za_malo" ? brakuje(p.cena - r.data.saldo) : "Nie udało się."); return; }
      sinfo("");
    }
    stan.potwierdz = null;
    stan.wybor = wybor(); stan.wybor[p.slot] = p.id; zapiszJson("cegielki_stroj", stan.wybor);
    rysujSklep();
  }
  function wierszUlepszenia(u) {
    var wybrane = stan.ulepszenie === u.id, b = el("button", "s-wiersz"); b.type = "button"; b.setAttribute("aria-pressed", wybrane ? "true" : "false"); b.disabled = !stan.zalogowany || stan.podglad;
    b.appendChild(el("span", "s-nazwa", u.nazwa));
    b.appendChild(wybrane ? el("span", "s-cena", "Wybrane") : cena(u.cena));
    b.addEventListener("click", function () {
      if (!wybrane && (stan.saldo || 0) < u.cena) { sinfo(brakuje(u.cena - (stan.saldo || 0))); return; }
      stan.ulepszenie = wybrane ? null : u.id; sinfo(stan.ulepszenie ? "Złote cegły zejdą dopiero na starcie następnej rundy." : ""); rysujSklep(true);
    });
    return b;
  }
  function rysujSklep(zostawInfo) {
    if (!zostawInfo) sinfo($("s-info") ? $("s-info").textContent : "");
    $("s-saldo").textContent = stan.zalogowany ? "Masz " + (stan.saldo || 0) + " " + L.odmianaZlotych(stan.saldo || 0) : "";
    $("s-saldo").hidden = !stan.zalogowany;
    $("s-zaloguj").hidden = stan.zalogowany;
    [["s-tulow", ["tulow"]], ["s-spodenki", ["spodenki"]], ["s-glowa", ["glowa", "oczy", "szyja", "plecy"]]].forEach(function (w) {
      var kont = $(w[0]); kont.textContent = "";
      L.SKLEP.filter(function (p) { return w[1].indexOf(p.slot) >= 0; }).forEach(function (p) { kont.appendChild(wierszPrzedmiotu(p)); });
    });
    var nk = $("s-rower"); if (nk) nk.hidden = !stan.rower;
    var st = $("s-start"); st.textContent = "";
    L.ULEPSZENIA.forEach(function (u) { st.appendChild(wierszUlepszenia(u)); });
    odswiezPodglad();
  }
  var sklepSkad = "menu";
  function otworzSklep(skad) {
    sklepSkad = skad; stan.potwierdz = null;
    sinfo("");
    $(skad).hidden = true; $("sklep").hidden = false; $("sklep").scrollTop = 0;
    document.body.classList.add("w-sklepie");
    gotowe.then(function () { if (!$("sklep").hidden) rysujSklep(); });
    rysujSklep();
  }
  function zamknijSklep() { stan.potwierdz = null; $("sklep").hidden = true; $(sklepSkad).hidden = false; document.body.classList.remove("w-sklepie"); }
  function podepnijSklep() {
    $("m-sklep").addEventListener("click", function () { otworzSklep("menu"); });
    $("k-sklep").addEventListener("click", function () { otworzSklep("koniec"); });
    $("s-wroc").addEventListener("click", zamknijSklep);
  }
  podepnijSklep();

  /* Przełącznik: zamyka tylko jawne „wyłączone”. Awaria sieci albo funkcji nie może zabrać gry w trakcie akcji; bez rankingu i tak nic się nie zapisze. */
  async function sprawdzDostep() {
    if (przyklad) {
      stan.imie = "Fabianek"; stan.urlZbiorki = "https://www.siepomaga.pl/"; rysujZbiorke(); odswiezRanking();
      if (parametry.get("rowerzysta") === "przyklad") wlaczPostacRoweru("");
      /* Arkusz koparki nie ma pliku w repo: na podgląd idzie adres podpisany z kubełka, po wgraniu. */
      var ark = L.arkuszKoparki({ wystartowala: true, koparka_arkusz_url: parametry.get("koparka_arkusz") });
      if (ark) { stan.koparkaWlaczona = true; stan.arkuszKoparki = ark; rysujPostacie(); }
      return;
    }
    rysujMur();
    try {
      var t = parametry.get("t");
      var f = await fetch(BAZA + "/functions/v1/gra-ranking" + (t ? "?t=" + encodeURIComponent(t) : ""), { headers: { Accept: "application/json" } });
      if (!f.ok) return;
      var d = await f.json();
      if (stan.ranking === undefined) { stan.ranking = d; rysujMur(); }
      if (d.aktywna === false && !d.prywatny && parametry.get("sciezka") !== "1") document.body.classList.add("gra-zamknieta");
      if (d.rowerzysta === true && window.BM_CEGIELKI_GRA) { window.BM_CEGIELKI_GRA.wlaczRowerzyste(); wlaczPostacRoweru(d.rowerzysta_opis); }
      if (d.postac_koparki === true) { stan.koparkaWlaczona = true; rysujPostacie(); }
    } catch (e) {}
  }
  sprawdzDostep();

  /* Po pierwszym obrazie: parsowanie sb.js nie może opóźnić menu gry. */
  function poZaladowaniu() {
    return new Promise(function (ok) { if (document.readyState === "complete") ok(); else addEventListener("load", function () { ok(); }, { once: true }); })
      .then(function () { return new Promise(function (ok) { setTimeout(ok, 200); }); });
  }
  gotowe = poZaladowaniu().then(polacz).catch(function () { stan.zalogowany = false; });
  $("f-dalej").addEventListener("click", function () { $("final").hidden = true; });
  $("nowa").addEventListener("click", function () { $("nowa").hidden = true; });
  rysujPostacie();
  window.BM_CEGIELKI_KONTO = { przedRunda: przedRunda, poRundzie: poRundzie, wybor: wybor, ustawAkcje: ustawAkcje };
})();
