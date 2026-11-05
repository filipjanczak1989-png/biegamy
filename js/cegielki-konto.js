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
  var stan = { zalogowany: false, pseudonim: null, widok: "runda", okres: "dzien", imie: "", urlZbiorki: "", ranking: undefined, miejsca: null, runda: null, saldo: null, kupione: czytajJson("cegielki_kupione", []), stroje: L.stroje(czytajJson("cegielki_stroje", null), czytajJson("cegielki_stroj", null)), plecak: {}, ulepszenie: null, potwierdz: null,
    cegly: Number(czytajJson("cegielki_suma", 0)) || 0, rower: false, podpisRoweru: "", koparkaWlaczona: false, arkuszKoparki: "", koparka: false, podglad: false };
  function czytajJson(k, zapas) { try { var w = JSON.parse(localStorage.getItem(k)); return w == null ? zapas : w; } catch (e) { return zapas; } }
  function zapiszJson(k, w) { try { localStorage.setItem(k, JSON.stringify(w)); } catch (e) {} }
  function ustawKonto(saldo, kupione) {
    if (typeof saldo === "number") stan.saldo = saldo;
    if (Array.isArray(kupione)) { stan.kupione = kupione; zapiszJson("cegielki_kupione", kupione); }
    var e = $("m-saldo"); if (e) e.textContent = stan.saldo == null ? "" : "(" + stan.saldo + ")";
  }
  var gotowe = Promise.resolve();
  /* PREMIERA SZEFA (Filip 5.11): pierwsza runda na świecie, zaraz po guziku. Znacznik zapisuje strona guzika przy naciśnięciu, więc tylko na tym urządzeniu; po rundzie jest zagrany, więc raz. Bez gra_konto, bez rankingu, bez plansz. Cegły do muru tylko na prawdziwej akcji: pilnuje premiera_szefa_zapisz. */
  var KLUCZ_PREMIERY = "cegielki_premiera";
  var premiera = (function () {
    if (parametry.get("premiera") !== "1") return null;
    var z = czytajJson(KLUCZ_PREMIERY, null);
    return z && (z.slug === "dla-fabianka" || z.slug === "proba") ? z : null;
  })();
  if (premiera) document.body.classList.add("w-premierze");

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
    /* Stroje osobnym zapytaniem: baza bez tej kolumny (front przed migracją, wycofanie) nie może zabrać salda. Na koncie pusto, a na urządzeniu coś jest: urządzenie idzie na konto. */
    var rs = await window.sb.from("gra_konto").select("stroje").maybeSingle();
    if (rs && !rs.error && rs.data && rs.data.stroje && Object.keys(rs.data.stroje).length) { stan.stroje = L.stroje(rs.data.stroje); zapiszJson("cegielki_stroje", stan.stroje); if (!$("sklep").hidden) rysujSklep(true); kartyWStrojach(); }
    else if (rs && !rs.error && L.POSTACIE_ZE_STROJEM.some(function (x) { return L.maStroj(stan.stroje[x]); })) zapiszStroje();
    var po = await window.sb.rpc("gra_moj_postep");
    /* Plecak i bonus za trening przychodzą z postępem, dopiero po swoich migracjach. Bez nich nie ma pola ani przycisku: front i migracja w dowolnej kolejności, bez błędu w sieci przy każdym wejściu. */
    if (po && !po.error && po.data) { stan.plecak = po.data.plecak || {}; if (!premiera && po.data.bonus_trening === true) $("m-bonus").hidden = false; }
    /* Z kontem poziom liczy serwer. Bez odpowiedzi poziom 1, nie suma z urządzenia: runda z poziomem wyższym niż na koncie to dla serwera oszustwo. */
    stan.cegly = po && !po.error && po.data && typeof po.data.cegly === "number" ? po.data.cegly : 0;
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
  /* Strój osobno na postać. Bez nazwy: postać wybrana w Magazynie. */
  function wybor(po) { return L.poprawnyStroj(stan.stroje[po || postacMagazynu()], stan.kupione, czyKorona()); }
  var zegarStrojow = 0;
  function zapiszStroje() {
    zapiszJson("cegielki_stroje", stan.stroje);
    if (!stan.zalogowany || przyklad || !window.sb) return;
    clearTimeout(zegarStrojow);
    zegarStrojow = setTimeout(function () { window.sb.rpc("gra_zapisz_stroje", { p_stroje: stan.stroje }).then(function () {}, function () {}); }, 700);
  }
  /* daj(typ) zakłada ulepszenie dopiero po odpowiedzi serwera. Wybór jest jednorazowy: kolejna runda nie zapłaci sama. */
  function przedRunda(daj) {
    stan.runda = null;
    if (stan.podglad || premiera) { stan.ulepszenie = null; return; }
    var runda = { numer: null, gotowa: null }, ulepszenie = stan.ulepszenie;
    stan.ulepszenie = null;
    var t0 = performance.now();
    runda.gotowa = gotowe.then(function () {
      if (przyklad) { if (ulepszenie && daj) { var cena = L.ULEPSZENIA.filter(function (u) { return u.id === ulepszenie; })[0].cena; if (stan.saldo >= cena) { ustawKonto(stan.saldo - cena); daj(ulepszenie); } } return; }
      if (!stan.zalogowany) return;
      return window.sb.rpc("gra_start_rundy", ulepszenie ? { p_ulepszenie: ulepszenie } : {}).then(function (r) {
        if (r.error || !r.data || !r.data.ok) { runda.powod = r.data && r.data.powod; return; }
        ustawKonto(r.data.saldo);
        if (r.data.plecak) stan.plecak = r.data.plecak;
        if (r.data.ulepszenie && daj) daj(r.data.ulepszenie);
        if (performance.now() - t0 > OPOZNIENIE_STARTU_MS) { runda.powod = "wolno"; return; }
        runda.numer = r.data.runda;
      });
    }).catch(function () { runda.powod = "siec"; });
    stan.runda = runda;
  }

  function info(tekst) { var e = $("r-info"); if (e) { e.textContent = tekst || ""; e.hidden = !tekst; } }
  async function poRundzie(w) {
    if (premiera) { koniecPremiery(w); return; }
    if (!$("k-ranking")) return;
    stan.miejsca = null;
    budujRanking(); info(""); rysuj();
    if (w.maly) { await odswiezRanking(); return; }   // Mały budowniczy: lista do obejrzenia, zapisu nie ma
    if (stan.podglad) { info("Podgląd postaci: bez zapisu i bez rankingu."); await odswiezRanking(); info("Podgląd postaci: bez zapisu i bez rankingu."); return; }
    /* Bez konta suma żyje tylko na tym urządzeniu. Z kontem liczy ją serwer z przyjętych rund. */
    var przedRunda2 = L.poziom(stan.cegly);
    if (!stan.zalogowany || przyklad) { stan.cegly += w.cegly; if (!przyklad) zapiszJson("cegielki_suma", stan.cegly); nagrodyNaUrzadzeniu(); rysujPostacie(przedRunda2); }
    var runda = stan.runda; stan.runda = null;
    if (przyklad) { stan.miejsca = { dzien: { miejsce: 4, punkty: w.punkty }, tydzien: { miejsce: 12, punkty: w.punkty }, wszech: { miejsce: 87, punkty: w.punkty }, dolozyli_akcja: { miejsce: 31, punkty: w.punkty }, dolozyli_wszech: { miejsce: 31, punkty: w.punkty } }; ustawKonto((stan.saldo || 0) + w.st.zlote); await odswiezRanking(); return; }
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
        p_st: { zlote: w.st.zlote, salta: w.st.salta, seria: w.st.seria, upadki: w.st.upadki, bidony: w.st.bidony, poziom: w.poziom } });
      if (!r.error) odp = r.data;
    }
    if (!odp) info("Nie udało się zapisać wyniku: brak łącza.");
    else if (odp.ok) { info(""); stan.miejsca = odp.miejsca || null; ustawKonto(odp.saldo, odp.kupione); if (typeof odp.cegly_lacznie === "number") stan.cegly = odp.cegly_lacznie; rysujPostacie(przedRunda2); }
    else info(odp.powod === "podejrzany" ? "Ten wynik nie przeszedł kontroli i czeka na przegląd." : odp.powod === "postac_zablokowana" ? "Ta postać nie jest jeszcze odblokowana na Twoim koncie, runda bez rankingu." : "Ta runda bez rankingu.");
    await odswiezRanking();
  }

  async function pobierzRanking() {
    if (przyklad) {
      return { dzien: [["Biegaczka", 1840, "kasia"], ["Szybki-Janek", 1610, "filip"], ["Ania", 1422, "kasia"], ["Marek", 1200, "filip"], ["Zosia", 960, "kasia"], ["Tomek", 655, "filip"]].map(function (w, i) { return { miejsce: i + 1, pseudonim: w[0], cegly: w[1], postac: w[2] }; }),
        tydzien: [{ miejsce: 1, pseudonim: "Rekordzista", cegly: 2210, postac: "filip" }], wszech: [],
        dolozyli_akcja: [{ miejsce: 1, pseudonim: "Biegaczka", cegly: 18420 }, { miejsce: 2, pseudonim: "Marek", cegly: 9310 }], dolozyli_wszech: [{ miejsce: 1, pseudonim: "Biegaczka", cegly: 18420 }],
        mur: 48210, mur_cel: 1250000 };
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
  function otwarta(id) { return stan.podglad || L.odblokowana(id, stan.cegly, stan.ranking && stan.ranking.mur, stan.ranking && stan.ranking.zamknieta); }
  function rysujPostacie(poziomPrzed) {
    rysujPoziom("m-poziom"); rysujPoziom("k-poziom");
    if (stan.rower && otwarta("rowerzysta")) zaladujRower();
    if (stan.koparkaWlaczona && stan.arkuszKoparki && otwarta("koparka")) sprobujKoparke();
    rysujKarte("rowerzysta", stan.rower, L.imieZPodpisu(stan.podpisRoweru) || "Rowerzysta", stan.rowerGotowy);
    rysujKarte("koparka", stan.koparka, stan.imie || "Koparka", stan.koparka);
    var e = $("k-awans");
    if (e && poziomPrzed) { var teraz = L.poziom(stan.cegly); e.hidden = teraz <= poziomPrzed; e.textContent = L.tekstAwansu(poziomPrzed, teraz, opcjeRozdzialu()); pokazKartke(poziomPrzed, teraz); }
    pokazFinal();
  }
  function opcjeRozdzialu() {
    return { rower: stan.rower ? L.imieZPodpisu(stan.podpisRoweru) || "Rowerzysta" : "", rowerNa: L.rowerZPodpisu(stan.podpisRoweru), imie: stan.imie, meta: !!(stan.ranking && stan.ranking.rozdzial_meta), koparka: stan.koparkaWlaczona };
  }
  function poziomGracza() { return premiera ? 1 : L.poziom(stan.cegly); }
  /* Każda plansza raz na urządzenie. Rozdział tylko bieżący: po przeskoku poziomu nie ma kolejki starych. */
  function planszeDoPokazania(n) {
    var znane = czytajJson("cegielki_plansze", []), lista = [], o = opcjeRozdzialu(), r = L.planszaRozdzialu(n, o);
    if (!Array.isArray(znane)) znane = [];
    if (r && znane.indexOf(r.id) < 0) lista.push(r);
    L.bonusyMuru(stan.ranking && stan.ranking.mur).forEach(function (b) { if (znane.indexOf(b.id) < 0) lista.push({ id: b.id, tytul: b.tytul, tekst: b.tekst, noc: false, scena: b.scena }); });
    if (lista.length) zapiszJson("cegielki_plansze", znane.concat(lista.map(function (x) { return x.id; })));
    return lista;
  }
  /* Tabliczki kibiców: własny pseudonim i pseudonimy z rankingu. Wszystkie przeszły moderację w EF gra-pseudonim. */
  function pseudonimKibica() {
    var d = stan.ranking || {}, lista = [].concat(d.dzien || [], d.dolozyli_wszech || []).map(function (w) { return w && w.pseudonim; }).filter(Boolean);
    if (stan.pseudonim) lista.push(stan.pseudonim);
    return lista.length ? lista[Math.floor(Math.random() * lista.length)] : "";
  }
  /* Kartka z dziennika po rundzie: za awans, a kartka 1 przy pierwszej rundzie na tym urządzeniu. */
  function pokazKartke(przed, teraz) {
    var e = $("k-kartka"); if (!e) return;
    var nr = teraz > przed ? teraz : !czytajJson("cegielki_kartka1", false) ? 1 : 0;
    if (nr === 1) zapiszJson("cegielki_kartka1", true);
    e.hidden = !nr; e.textContent = nr ? L.kartka(nr) : "";
  }
  /* Bez konta nagrody żyją na tym urządzeniu, z kontem przyznaje je serwer przy zapisie wyniku. */
  function nagrodyNaUrzadzeniu() {
    var nowe = L.nagrodyDoPoziomu(L.poziom(stan.cegly)).filter(function (id) { return stan.kupione.indexOf(id) < 0; });
    if (nowe.length) ustawKonto(undefined, stan.kupione.concat(nowe));
  }
  function rozdzialGracza(n) { return L.rozdzial(n, opcjeRozdzialu()); }
  /* Animacja raz na urządzenie, po pierwszym pojawieniu się karty. */
  function ogloszNowa(id, nazwa) {
    if (stan.podglad) return;
    var znane = czytajJson("cegielki_nowe", []);
    if (!Array.isArray(znane) || znane.indexOf(id) >= 0) return;
    if (id === "koparka" && stan.ranking && (stan.ranking.zamknieta === true || Number(stan.ranking.mur) >= Number(stan.ranking.mur_cel))) { zapiszJson("cegielki_nowe", znane.concat([id])); return; }   // finał muru pokazuje to sam
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
  /* Finał: mur gotowy albo akcja zamknięta, ulica stoi, Szef w koparce, ekipa obok. Raz na urządzenie. Koparka otwiera się wtedy wszystkim (gra_postac_odblokowana i L.odblokowana). */
  function pokazFinal() {
    var f = $("final"); if (!f || !stan.koparka) return;
    var d = stan.ranking, cel = d && Number(d.mur_cel), mur = cel > 0 && Number(d.mur) >= cel;
    if (!(mur || (d && d.zamknieta === true)) || czytajJson("cegielki_final", false)) return;
    zapiszJson("cegielki_final", true);
    var pl = L.planszaFinalu(opcjeRozdzialu());
    $("f-tytul").textContent = pl.tytul;
    $("f-tekst").textContent = (mur ? "Wspólny mur: " + liczba(d.mur) + " cegieł. " : "") + "Koparka jest teraz dla wszystkich.";
    f.hidden = false;
    window.BM_CEGIELKI_GRA.rysujPlansze($("f-plansza"), pl);
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
        li.appendChild(el("span", "r-c", String(Number(w.punkty != null ? w.punkty : w.cegly) || 0) + " pkt"));
        lista.appendChild(li);
      });
    }
    var moje = stan.miejsca && stan.miejsca[stan.okres];
    $("r-moje").textContent = moje && moje.miejsce ? "Twoje miejsce: " + moje.miejsce + " (" + (moje.punkty != null ? moje.punkty : moje.cegly) + " pkt)" : "";
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
        if (d.pierwsze_cegly != null) k.appendChild(el("div", "mur-pierwsze", "Pierwsze cegły: Szef"));
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
    var pa = L.firmyZLicznika(d).filter(function (f) { return f.partner && f.logo; })[0]; stan.logoPartnera = pa ? pa.logo : "";
    rysujMur(); rysujZbiorke(); rysujPostacie();
  }

  /* ── Magazyn Szefa: złote cegły z gry na wygląd i start z ulepszeniem. Zero pieniędzy. Pierwsze dotknięcie przymierza, drugie wymienia. ── */
  function cena(n, przedrostek) {
    var s = el("span", "s-cena", (przedrostek || "") + n);
    s.setAttribute("aria-label", (przedrostek || "") + n + " " + L.odmianaZlotych(n));
    var a = window.BM_CEGIELKI_GRA && window.BM_CEGIELKI_GRA.A.cegla_zlota;
    if (a) { var im = document.createElement("img"); im.src = "assets/gra/" + a.src; im.alt = ""; s.appendChild(im); }
    return s;
  }
  function brakuje(n) { return "Masz za mało złotych cegieł. Brakuje: " + n + "."; }
  function sinfo(t) { var e = $("s-info"); if (e) e.textContent = t || ""; }
  /* Podgląd: wybrana postać duża i w ruchu, w tym, co ma na sobie, plus przymierzany przedmiot. Pozostałe małe obok, w swoich strojach. Przymiarki nigdzie się nie zapisuje: wyjście z Magazynu wraca do poprzedniego stroju. */
  var KLATKA_STROJU_MS = 100, klatkaStroju = 0, podgladGotowy = null;
  function strojNaPodgladzie(po) {
    var w = wybor(po);
    if (po === postacMagazynu() && stan.potwierdz) { var p = L.SKLEP.filter(function (x) { return x.id === stan.potwierdz; })[0]; if (p) w[p.slot] = p.id; }
    return L.strojPostaci(w, po);
  }
  function nazwaPostaci(po) { return po === "rowerzysta" ? L.imieZPodpisu(stan.podpisRoweru) || "Rowerzysta" : po === "koparka" ? stan.imie || "Koparka" : po === "filip" ? "Filip" : "Kasia"; }
  function rysujKoparkeNa(kan, nr) {
    var GR = window.BM_CEGIELKI_GRA, a = GR && GR.A.koparka_ark, o = GR && GR.OBR.koparka_ark; if (!a || !o) return;
    if (kan.width !== a.cw || kan.height !== a.ch) { kan.width = a.cw; kan.height = a.ch; }
    var k = kan.getContext("2d"), J = L.KLATKI_KOPARKI.jazda; k.clearRect(0, 0, a.cw, a.ch); k.drawImage(o, a.cw * J[nr % J.length], 0, a.cw, a.ch, 0, 0, a.cw, a.ch);
  }
  function rysujDuza() {
    var S = window.BM_CEGIELKI_STROJ, GR = window.BM_CEGIELKI_GRA, kan = $("s-duza"); if (!S || !GR || !kan || !podgladGotowy) return;
    try { if (podgladGotowy.po === "koparka") rysujKoparkeNa(kan, Math.floor(klatkaStroju / 2)); else S.klatkaBiegu(kan, GR.OBR, GR.A, podgladGotowy.po, podgladGotowy.w, klatkaStroju); } catch (e) {}
  }
  function odswiezPodglad() {
    var S = window.BM_CEGIELKI_STROJ, GR = window.BM_CEGIELKI_GRA; if (!S || !GR) return;
    var po = postacMagazynu(), w = strojNaPodgladzie(po), lista = postacieMagazynu();
    $("s-kto").textContent = nazwaPostaci(po);
    $("s-duza").setAttribute("aria-label", nazwaPostaci(po) + " w wybranym stroju");
    GR.wczytajObrazy(S.nazwyObrazow(S.noszone(w))).then(function () { if (postacMagazynu() === po) { podgladGotowy = { po: po, w: w }; rysujDuza(); } }, function () {});
    document.querySelectorAll(".s-mala").forEach(function (b) {
      var id = b.dataset.postac; b.hidden = id === po || lista.indexOf(id) < 0;
      if (b.hidden) return;
      b.querySelector("span").textContent = nazwaPostaci(id);
      var ka = b.querySelector("canvas"), wm = strojNaPodgladzie(id);
      if (id === "koparka") { rysujKoparkeNa(ka, 0); return; }
      var rys = function () { try { S.klatkaBiegu(ka, GR.OBR, GR.A, id, wm, 0); } catch (e) {} };
      GR.wczytajObrazy(S.nazwyObrazow(S.noszone(wm))).then(rys, rys);
    });
  }
  /* Ekran wyboru postaci: każda w swoim stroju i w tym samym biegu co na karcie. Bez stroju zostaje zwykła karta z arkusza. Przesunięcie: płótno ma margines na czapkę i pelerynę. */
  function kartyWStrojach() {
    var S = window.BM_CEGIELKI_STROJ, GR = window.BM_CEGIELKI_GRA; if (!S || !GR) return;
    L.POSTACIE_ZE_STROJEM.forEach(function (po) {
      var i = document.querySelector('.postac[data-postac="' + po + '"] i'), at = GR.A[po + "_bieg"]; if (!i || !at || !GR.OBR[po + "_bieg"]) return;
      var w = L.strojPostaci(wybor(po), po), kan = i.querySelector("canvas");
      if (!L.maStroj(w)) { if (kan) { kan.remove(); i.classList.remove("w-stroju"); GR.kartaPostaci(po); } return; }
      if (!kan) { kan = document.createElement("canvas"); kan.setAttribute("aria-hidden", "true"); i.appendChild(kan); i.classList.add("w-stroju"); }
      var skala = i.getBoundingClientRect().width / at.cw || 0; if (!skala) return;
      kan.style.width = (at.cw + S.ML_BIEG) * skala + "px"; kan.style.left = -S.ML_BIEG * skala + "px"; kan.style.top = -S.MG_BIEG * skala + "px";
      kan._w = w;
      var rys = function () { try { S.klatkaBiegu(kan, GR.OBR, GR.A, po, w, klatkaStroju); } catch (e) {} };
      GR.wczytajObrazy(S.nazwyObrazow(S.noszone(w))).then(rys, rys);
    });
  }
  function kartyKlatka() {
    var S = window.BM_CEGIELKI_STROJ, GR = window.BM_CEGIELKI_GRA; if (!S || !GR) return;
    L.POSTACIE_ZE_STROJEM.forEach(function (po) { var kan = document.querySelector('.postac[data-postac="' + po + '"] i canvas'); if (kan && kan._w) { try { S.klatkaBiegu(kan, GR.OBR, GR.A, po, kan._w, klatkaStroju); } catch (e) {} } });
  }
  /* Jeden zegar na oba ekrany; w rundzie nic nie liczy. Bez ruchu, gdy system prosi o mniej ruchu. */
  var malyRuch = false; try { malyRuch = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  setInterval(function () {
    if (malyRuch) return;
    var m = $("menu"), s = $("sklep"), wMenu = m && !m.hidden, wSklepie = s && !s.hidden;
    if (!wMenu && !wSklepie) return;
    klatkaStroju++;
    if (wSklepie) rysujDuza();
    if (wMenu) kartyKlatka();
  }, KLATKA_STROJU_MS);
  /* Miniatury: postać wybrana dotknięciem nad listą, w tym, co ma na sobie, plus ten jeden przedmiot. Liczymy po jednej na klatkę animacji, żeby przewijanie nie stało; bez grafik zostaje ikona dodatku albo próbka koloru. Policzone zostają: dotknięcie przedmiotu nie liczy listy od nowa. */
  function postacieMagazynu() {
    var l = ["kasia", "filip"];
    if (stan.rower && stan.rowerGotowy && otwarta("rowerzysta")) l.push("rowerzysta");
    if (stan.koparka) l.push("koparka");
    return l;
  }
  function postacMagazynu() { var z = czytajJson("cegielki_magazyn_postac", "kasia"); return postacieMagazynu().indexOf(z) >= 0 ? z : "kasia"; }
  var policzoneMini = {}, kolejnoscMini = [];
  function zapamietajMini(klucz, kan) { if (policzoneMini[klucz]) return; policzoneMini[klucz] = kan; kolejnoscMini.push(klucz); if (kolejnoscMini.length > 40) delete policzoneMini[kolejnoscMini.shift()]; }
  var kolejkaMiniatur = [], miniaturyIda = false;
  function rysujKolejkeMiniatur() {
    var S = window.BM_CEGIELKI_STROJ, GR = window.BM_CEGIELKI_GRA;
    if (!kolejkaMiniatur.length || !S || !GR) { miniaturyIda = false; return; }
    var z = kolejkaMiniatur.shift();
    if (z.kan.isConnected) { try { if (S.miniatura(z.kan, GR.OBR, GR.A, z.postac, z.w)) zapamietajMini(z.klucz, z.kan); } catch (e) {} }
    requestAnimationFrame(rysujKolejkeMiniatur);
  }
  function zamowMiniature(kan, p) {
    var S = window.BM_CEGIELKI_STROJ, GR = window.BM_CEGIELKI_GRA; if (!S || !GR) return;
    var postac = postacMagazynu(), w = L.strojPostaci(L.strojZPrzedmiotem(wybor(postac), p), postac), klucz = postac + JSON.stringify(w), got = policzoneMini[klucz];
    if (got) { kan.width = got.width; kan.height = got.height; kan.getContext("2d").drawImage(got, 0, 0); return; }
    GR.wczytajObrazy(S.nazwyObrazow(S.noszone(w))).then(function () {
      kolejkaMiniatur.push({ kan: kan, postac: postac, w: w, klucz: klucz });
      if (!miniaturyIda) { miniaturyIda = true; requestAnimationFrame(rysujKolejkeMiniatur); }
    }, function () {});
  }
  function wybierzPostacMagazynu(po) { stan.potwierdz = null; sinfo(""); zapiszJson("cegielki_magazyn_postac", po); kolejkaMiniatur.length = 0; rysujSklep(true); }
  /* Podpis włącza Filip po zgodzie firmy (akcje.magazyn_podpis). Logo: Partner akcji z licznika, adres tylko z kubełka firm. Bez podpisu ani śladu firmy. */
  function rysujPodpisMagazynu() {
    var e = $("s-partner"), t = stan.ranking && stan.ranking.magazyn_podpis; if (!e) return;
    e.hidden = !t; e.textContent = "";
    if (!t) return;
    if (stan.logoPartnera) { var im = document.createElement("img"); im.className = "s-partner-logo"; im.alt = ""; im.src = stan.logoPartnera; e.appendChild(im); }
    e.appendChild(el("span", "", t));
  }
  function wierszPrzedmiotu(p) {
    var po = postacMagazynu(), pasuje = L.POSTACIE[po].sloty.indexOf(p.slot) >= 0;
    var ma = stan.kupione.indexOf(p.id) >= 0, zalozone = wybor(po)[p.slot] === p.id, czeka = stan.potwierdz === p.id;
    var b = el("button", "s-wiersz"); b.type = "button"; b.setAttribute("aria-pressed", zalozone || czeka ? "true" : "false");
    if (p.kolor) { var pr = el("span", "s-probka"); pr.style.background = "rgb(" + p.kolor.join(",") + ")"; pr.setAttribute("aria-hidden", "true"); b.appendChild(pr); }
    var ob = el("span", "s-obraz"); ob.setAttribute("aria-hidden", "true"); ob.hidden = !pasuje;
    var kan = document.createElement("canvas"); kan.className = "s-mini"; kan.width = 1; kan.height = 1; ob.appendChild(kan);
    b.appendChild(ob); if (pasuje) zamowMiniature(kan, p);
    if (!p.kolor) { var ik = document.createElement("img"); ik.className = "s-ikona"; ik.src = "assets/gra/dodatek_" + p.id + ".webp"; ik.alt = ""; b.appendChild(ik); }
    b.appendChild(el("span", "s-nazwa", p.nazwa));
    if (!pasuje) { b.disabled = true; b.appendChild(el("span", "s-cena", "Nie na tę postać")); return b; }
    if (p.tylkoSeria && !ma) { b.disabled = true; b.appendChild(el("span", "s-cena", "Za serię 7 dni")); return b; }
    if (p.tylkoCzolowka) { var moze = czyKorona(); b.disabled = !moze; b.appendChild(el("span", "s-cena", zalozone ? "Zdejmij" : moze ? "Załóż" : "Tylko TOP " + L.KORONA_MIEJSCA + " dnia")); }
    else b.appendChild(zalozone ? el("span", "s-cena", "Zdejmij") : ma ? el("span", "s-cena", "Załóż") : cena(p.cena, czeka ? "Wymień za " : ""));
    b.addEventListener("click", function () { klikPrzedmiotu(p); });
    return b;
  }
  async function klikPrzedmiotu(p) {
    sinfo("");
    if (stan.kupione.indexOf(p.id) >= 0 || (p.tylkoCzolowka && czyKorona())) {
      stan.potwierdz = null;
      var kto = postacMagazynu(), teraz = wybor(kto); teraz[p.slot] = teraz[p.slot] === p.id ? null : p.id; stan.stroje[kto] = teraz; zapiszStroje();
      rysujSklep(); return;
    }
    if (stan.potwierdz !== p.id) { stan.potwierdz = p.id; rysujSklep(true); przymierzalnia(); if (!stan.zalogowany) sinfo("To przymiarka. Wymiana złotych cegieł wymaga logowania."); else if ((stan.saldo || 0) < p.cena) sinfo(brakuje(p.cena - (stan.saldo || 0))); return; }
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
    var komu = postacMagazynu(), po = wybor(komu); po[p.slot] = p.id; stan.stroje[komu] = po; zapiszStroje();
    rysujSklep();
  }
  /* Przymierzalnia: podgląd stoi przyklejony nad listą, dotknięcie ma go pokazać, gdziekolwiek palec był na liście. */
  function przymierzalnia() { var e = document.querySelector(".s-podglad"); if (e && e.getBoundingClientRect().bottom < 0) $("sklep").scrollTop = 0; }
  function wierszUlepszenia(u) {
    var wybrane = stan.ulepszenie === u.id, b = el("button", "s-wiersz"); b.type = "button"; b.setAttribute("aria-pressed", wybrane ? "true" : "false"); b.disabled = !stan.zalogowany || stan.podglad;
    b.appendChild(el("span", "s-nazwa", u.nazwa));
    var wPlecaku = Number(stan.plecak[u.id]) || 0;
    b.appendChild(wybrane ? el("span", "s-cena", "Wybrane") : wPlecaku > 0 ? el("span", "s-cena", "Z plecaka: " + wPlecaku) : cena(u.cena));
    b.addEventListener("click", function () {
      if (!wybrane && !wPlecaku && (stan.saldo || 0) < u.cena) { sinfo(brakuje(u.cena - (stan.saldo || 0))); return; }
      stan.ulepszenie = wybrane ? null : u.id; sinfo(stan.ulepszenie ? (wPlecaku > 0 ? "Pójdzie z plecaka, bez złotych cegieł." : "Złote cegły zejdą dopiero na starcie następnej rundy.") : ""); rysujSklep(true);
    });
    return b;
  }
  function rysujSklep(zostawInfo) {
    if (!zostawInfo) sinfo($("s-info") ? $("s-info").textContent : "");
    kolejkaMiniatur.length = 0; rysujPodpisMagazynu();
    $("s-saldo").textContent = stan.zalogowany ? "Masz " + (stan.saldo || 0) + " " + L.odmianaZlotych(stan.saldo || 0) : "";
    $("s-saldo").hidden = !stan.zalogowany;
    $("s-zaloguj").hidden = stan.zalogowany;
    [["s-tulow", ["tulow"]], ["s-spodenki", ["spodenki"]], ["s-glowa", ["glowa", "oczy", "szyja", "plecy"]]].forEach(function (w) {
      var kont = $(w[0]); kont.textContent = "";
      L.SKLEP.filter(function (p) { return w[1].indexOf(p.slot) >= 0; }).forEach(function (p) { kont.appendChild(wierszPrzedmiotu(p)); });
    });
    var nk = $("s-rower"), kto = postacMagazynu();
    if (nk) { nk.hidden = kto !== "rowerzysta" && kto !== "koparka"; nk.textContent = kto === "koparka" ? "Koparka zostaje taka, jak ją narysowano: bez dodatków." : "Na rowerze pasują tylko okulary, medal i peleryna, bo czapka nie wejdzie na kask."; }
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
  function zamknijSklep() { stan.potwierdz = null; $("sklep").hidden = true; $(sklepSkad).hidden = false; document.body.classList.remove("w-sklepie"); kartyWStrojach(); }
  function podepnijSklep() {
    $("m-sklep").addEventListener("click", function () { otworzSklep("menu"); });
    $("k-sklep").addEventListener("click", function () { otworzSklep("koniec"); });
    $("s-wroc").addEventListener("click", zamknijSklep);
    document.querySelectorAll(".s-mala").forEach(function (b) { b.addEventListener("click", function () { wybierzPostacMagazynu(b.dataset.postac); }); });
  }
  podepnijSklep();

  /* ── menu główne: Rankingi, Mur i Dziennik bez rozgrywania rundy. Ranking to ten sam blok co po rundzie, przenoszony między ekranami, żeby nie było dwóch kopii tych samych identyfikatorów. ── */
  function otworzPodmenu(id) { $("menu").hidden = true; $(id).hidden = false; $(id).scrollTop = 0; document.body.classList.add("w-sklepie"); }
  function zamknijPodmenu(id) {
    $(id).hidden = true; $("menu").hidden = false; document.body.classList.remove("w-sklepie");
    if (id === "e-rankingi") $("k-ranking-miejsce").appendChild($("k-ranking"));
    kartyWStrojach();
  }
  function otworzRankingi() {
    otworzPodmenu("e-rankingi");
    budujRanking(); $("e-rankingi-miejsce").appendChild($("k-ranking"));
    info(""); stan.miejsca = stan.miejsca || null; rysuj(); odswiezRanking();
  }
  function rysujEkranMuru() {
    var t = $("e-mur-tresc"), d = stan.ranking, cel = d && Number(d.mur_cel); t.textContent = "";
    if (d === undefined) t.appendChild(el("div", "mur-tytul", "Ładuję mur…"));
    else if (!(cel > 0)) t.appendChild(el("div", "mur-tytul", "Mur chwilowo niedostępny."));
    else {
      t.appendChild(el("div", "mur-tytul", L.tekstMuru(d.mur, cel)));
      if (d.pierwsze_cegly != null) t.appendChild(el("div", "mur-pierwsze", "Pierwsze cegły: Szef"));
      var pasek = el("div", "mur-pasek"), i = document.createElement("i"), pr = L.procentMuru(d.mur, cel);
      pasek.setAttribute("role", "progressbar"); pasek.setAttribute("aria-valuemin", "0"); pasek.setAttribute("aria-valuemax", String(cel)); pasek.setAttribute("aria-valuenow", String(Number(d.mur) || 0));
      i.style.width = pr + "%"; pasek.appendChild(i); t.appendChild(pasek);
    }
    zdanie(t);
    var lista = $("e-mur-progi"); lista.textContent = "";
    if (cel > 0) L.BONUSY_MURU.map(function (b) { return { prog: b.prog, tytul: b.tytul }; }).concat([{ prog: cel, tytul: "Ulica gotowa" }]).forEach(function (w) {
      var ok = Number(d.mur) >= w.prog, li = el("li", ok ? "zrobione" : "");
      li.appendChild(el("b", "", w.tytul)); li.appendChild(document.createTextNode(": " + liczba(w.prog) + " " + L.odmianaCegiel(w.prog) + (ok ? " ✓" : ""))); lista.appendChild(li);
    });
    $("e-mur-moje").textContent = stan.cegly > 0 ? "Twoje cegły: " + liczba(stan.cegly) : "";
  }
  function otworzMur() { otworzPodmenu("e-mur"); rysujEkranMuru(); odswiezRanking().then(function () { if (!$("e-mur").hidden) rysujEkranMuru(); }); }
  function otworzDziennik() {
    otworzPodmenu("e-dziennik");
    var n = poziomGracza(), karty = L.zebraneKartki(n, czytajJson("cegielki_kartka1", false) === true), lista = $("e-dz-lista"), wszystkich = L.KARTKI.length;
    lista.textContent = "";
    $("e-dz-licznik").textContent = karty.length ? "Zebrane kartki: " + karty.length + " z " + wszystkich : "Pierwszą kartkę dostaniesz po pierwszej rundzie.";
    karty.forEach(function (k) { var li = el("li"); li.appendChild(el("b", "", "Kartka " + k.nr + ". ")); li.appendChild(document.createTextNode(k.tekst)); lista.appendChild(li); });
    if (karty.length && karty.length < wszystkich) lista.appendChild(el("li", "", "Następna kartka na poziomie " + (karty[karty.length - 1].nr + 1) + "."));
  }
  /* Bonus za trening: klient nic nie deklaruje, serwer sam patrzy w treningi. Na ekranie tylko to, co odpowiedział. */
  $("m-bonus").addEventListener("click", async function () {
    var b = this, inf = $("m-bonus-info"), odp = null;
    b.disabled = true; inf.hidden = false; inf.textContent = "Sprawdzam…";
    try { var r = await window.sb.rpc("bonus_treningu_odbierz"); if (!r.error) odp = r.data; } catch (e) {}
    if (odp && odp.ok) { ustawKonto(odp.saldo, odp.kupione); stan.plecak = odp.plecak || {}; }
    inf.textContent = L.tekstBonusu(odp);
    b.disabled = false;
  });
  $("m-rankingi").addEventListener("click", otworzRankingi);
  $("m-mur-guzik").addEventListener("click", otworzMur);
  $("m-dziennik").addEventListener("click", otworzDziennik);
  document.querySelectorAll(".e-pod").forEach(function (e) { e.querySelector("[data-wroc]").addEventListener("click", function () { zamknijPodmenu(e.id); }); });

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
      if (d.aktywna === false && !d.prywatny && parametry.get("sciezka") !== "1" && !premiera) document.body.classList.add("gra-zamknieta");
      if (d.rowerzysta === true && window.BM_CEGIELKI_GRA) { window.BM_CEGIELKI_GRA.wlaczRowerzyste(); wlaczPostacRoweru(d.rowerzysta_opis); }
      if (d.postac_koparki === true) { stan.koparkaWlaczona = true; rysujPostacie(); }
    } catch (e) {}
  }
  sprawdzDostep();

  function premieraNaProbie() { return premiera.slug === "proba"; }
  function bladPremiery() {
    $("pr-tytul").textContent = "Koparka się nie wczytała";
    $("pr-info").textContent = "Runda jest dalej do zagrania. Sprawdź łącze i spróbuj jeszcze raz.";
    $("pr-ponow").textContent = "Spróbuj jeszcze raz"; $("pr-ponow").hidden = false; $("pr-ponow").onclick = function () { location.reload(); };
    $("ladowanie").hidden = true; $("premiera").hidden = false;
  }
  async function uruchomPremiere() {
    var GR = window.BM_CEGIELKI_GRA;
    await GR.gotowa;
    if (premiera.zagrana) { pokazKoniecPremiery(); return; }
    $("ladowanie").hidden = false; $("ladowanie").textContent = "Ładuję…";
    var adres = "";
    try {
      if (premieraNaProbie()) {
        var r = window.sb ? await window.sb.functions.invoke("akcja-proba-wizerunek", { body: {} }) : null;
        adres = L.arkuszKoparki({ wystartowala: true, koparka_arkusz_url: r && r.data && r.data.ok ? r.data.koparka_arkusz_url : "" });
        stan.imie = "Fabianek";
      } else {
        var f = await fetch(BAZA + "/functions/v1/akcja-licznik?slug=dla-fabianka", { headers: { Accept: "application/json" } });
        var d = f.ok ? await f.json() : null;
        adres = L.arkuszKoparki(d);
        if (d && typeof d.imie === "string") stan.imie = d.imie;
      }
    } catch (e) { adres = ""; }
    if (!adres || !(await GR.wczytajArkuszKoparki(adres))) { bladPremiery(); return; }
    GR.start("koparka");
  }
  function koniecPremiery(w) {
    premiera.zagrana = true; premiera.cegly = w.cegly; premiera.czas = Number(w.t.toFixed(2)); premiera.zapisane = premieraNaProbie();
    zapiszJson(KLUCZ_PREMIERY, premiera);
    pokazKoniecPremiery();
  }
  function pokazKoniecPremiery() {
    var GR = window.BM_CEGIELKI_GRA, a = GR.A.koparka_ark, o = GR.OBR.koparka_ark, kan = $("pr-kop");
    if (a && o && kan) { kan.width = a.cw; kan.height = a.ch; kan.getContext("2d").drawImage(o, a.cw * L.KLATKI_KOPARKI.radosc, 0, a.cw, a.ch, 0, 0, a.cw, a.ch); }
    $("pr-tytul").textContent = "Pierwsza runda na świecie: Szef" + (stan.imie ? " " + stan.imie : "");
    $("pr-cegly").textContent = "Pierwsze cegły ulicy: " + liczba(premiera.cegly);
    $("pr-ponow").hidden = true; $("premiera").hidden = false;
    if (premieraNaProbie()) { $("pr-info").textContent = "Próba: te cegły nie trafiają do muru."; return; }
    if (premiera.zapisane) { $("pr-info").textContent = "Leżą już w murze jako pierwsze."; return; }
    zapiszPremiere();
  }
  async function zapiszPremiere() {
    $("pr-ponow").hidden = true; $("pr-info").textContent = "Kładę cegły na murze…";
    var odp = null;
    await gotowe;
    for (var proba = 0; proba < 3 && !odp && window.sb; proba++) {
      if (proba) await new Promise(function (ok) { setTimeout(ok, 2000); });
      try { var r = await window.sb.rpc("premiera_szefa_zapisz", { p_cegly: premiera.cegly, p_czas: premiera.czas }); if (!r.error) odp = r.data; } catch (e) {}
    }
    if (odp && odp.ok) { premiera.zapisane = true; zapiszJson(KLUCZ_PREMIERY, premiera); $("pr-info").textContent = "Leżą już w murze jako pierwsze."; return; }
    if (odp) { premiera.zapisane = true; zapiszJson(KLUCZ_PREMIERY, premiera); $("pr-info").textContent = "Ta runda zostaje poza murem."; return; }
    $("pr-info").textContent = "Cegły czekają na łącze.";
    $("pr-ponow").textContent = "Połóż je jeszcze raz"; $("pr-ponow").hidden = false; $("pr-ponow").onclick = zapiszPremiere;
  }
  $("pr-wroc").addEventListener("click", function () { location.href = "start-akcji.html" + (premiera && premieraNaProbie() ? "?proba=1" + (premiera.sciezka ? "&sciezka=1" : "") : ""); });

  /* Po pierwszym obrazie: parsowanie sb.js nie może opóźnić menu gry. */
  function poZaladowaniu() {
    return new Promise(function (ok) { if (document.readyState === "complete") ok(); else addEventListener("load", function () { ok(); }, { once: true }); })
      .then(function () { return new Promise(function (ok) { setTimeout(ok, 200); }); });
  }
  gotowe = poZaladowaniu().then(polacz).catch(function () { stan.zalogowany = false; });
  if (premiera) gotowe.then(uruchomPremiere);
  else window.BM_CEGIELKI_GRA.gotowa.then(kartyWStrojach);
  $("f-dalej").addEventListener("click", function () { $("final").hidden = true; });
  $("nowa").addEventListener("click", function () { $("nowa").hidden = true; });
  rysujPostacie();
  window.BM_CEGIELKI_KONTO = { grupyDruzyny: function () { var d = stan.ranking; return L.grupyDruzyny(d && d.mur, d && d.mur_cel); }, rowerNa: function () { return stan.rower ? L.rowerZPodpisu(stan.podpisRoweru) : null; }, latarnie: function (po) { return L.latarnieZapalone(po, poziomGracza(), !!stan.rower); }, premiera: function () { return !!premiera; }, przedRunda: przedRunda, poRundzie: poRundzie, wybor: wybor, ustawAkcje: ustawAkcje, poziom: poziomGracza, rozdzial: rozdzialGracza, planszeDoPokazania: planszeDoPokazania, pseudonimKibica: pseudonimKibica };
})();
