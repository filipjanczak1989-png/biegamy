// OKIENKO 2.0 — potok (orkiestracja) bez HTTP: tę samą funkcję woła index.ts (prod) i ławka v2 (tests/_lawka-v2.js, atrapy, 0 $).
// Zależności zewnętrzne (narzędzia, model, sieć, osoba, impreza, katalog, pamięć, limity, log) wchodzą przez `deps` — DOMYSLNE to
// moduły v1 z ../okienko/ (zero kopii — blizna-113); ławka podmienia model/sieć/limity/log na atrapy, a sb i F6 na pamięć.
// E0: kolejność jak v1. Każdy etap v2 (E2 rozumienie, E3 dopytywanie, E4 pamięć rozmowy, E5 przepisy, E6 samosprawdzenie) wchodzi TU,
// między routerem a modelem, i jest mierzony ławką przed wdrożeniem.
// Wynik: { status, body } — body w kształcie v1 (zdania, karty, akcja, zrodla, narzedzia, tryb, koszt_tok, chipy?); index.ts dokłada wersję.
import { waliduj, wykonaj, nawigacja } from "../okienko/narzedzia.mjs";
import { dopasuj, normalizuj, zagadkaKandydat, czyNiepewne, ODP_NIEPEWNE, CHIPY_WYBORU } from "../okienko/router.mjs";
import { zWyniku } from "../okienko/odpowiedz.mjs";
import { zapytajModel, BladModelu } from "../okienko/model.mjs";
import { sprawdz, powodPustych, NIE_MAM } from "../okienko/straznik.mjs";
import { zapytajSiec, zOdpowiedziSieci, czyDoSieci, NIE_ZNALAZLEM } from "../okienko/siec.mjs";
import { zPamieci, doPamieci, znaleziskaZ, zapiszZnaleziska, wygladaNaOsobe, wygladaNaNazwisko } from "../okienko/pamiec.mjs";
import { osobaZPytania, odpowiedzOsoba, osobaWZdaniu, ODP_NIC } from "../okienko/osoba.mjs";
import { imprezaZPytania, odpowiedzImpreza } from "../okienko/impreza.mjs";
import { szukajWKatalogu } from "../okienko/katalog.mjs";
import { zapiszLogV2, sprawdzLimityV2, uzyteSiecDzisV2, LIMIT_SIEC, uzyteRozmowDzisV2, LIMIT_ROZMOW } from "./log-v2.mjs";
import { rozumienie, PROG_PEWNOSCI } from "./rozumienie.mjs";
import { wykonajIntencje, chipyDla } from "./intencje.mjs";
import { generujJson } from "./gemini.mjs";
import { czytajRozmowe, zapiszTure, czyKontynuacja, scalSloty, kontekstDlaModelu, turaZNarzedzia } from "./rozmowa.mjs";
import { PRZEPISY, wykonajPrzepis } from "./przepisy.mjs";
import { samosprawdz, ODP_NIE_PRZESZLO } from "./samosprawdzenie.mjs";
import { INTENCJE_SIECI, szukajWiedzy } from "./wiedza.mjs";
import { produktZPytania } from "./produkt.mjs";
import { oNas } from "../_shared/o-nas.mjs";
import { czyDopytanie, odpowiedzRozmowy } from "./rozmowa-model.mjs";

export const MODEL_SIECI = "gemini-3.5-flash-lite";   // etykieta pamięci sieci (jak v1)
export const DOMYSLNE = { wykonaj, zapytajModel, zapytajSiec, odpowiedzOsoba, odpowiedzImpreza, szukajWKatalogu, zPamieci, doPamieci, zapiszZnaleziska,
  uzyteSiecDzis: uzyteSiecDzisV2, sprawdzLimity: sprawdzLimityV2, zapiszLog: zapiszLogV2, LIMIT_SIEC, rozumienie, generujJson, wykonajPrzepis,
  rozmowaModel: odpowiedzRozmowy, uzyteRozmowDzis: uzyteRozmowDzisV2, LIMIT_ROZMOW, faktyPamieci: async () => [] };   // R2 rozmowa; R3 podmieni faktyPamieci

const pusto = (tryb, extra = {}) => ({ zdania: [], karty: [], akcja: null, zrodla: [], narzedzia: [], tryb, koszt_tok: { we: 0, wy: 0 }, ...extra });
const httpsOk = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };

function poprzedniePytanie(traf, historia) {
  if (!traf?.feedback || !Array.isArray(historia) || !historia.length) return "";
  return String(historia[historia.length - 1]?.q || "").slice(0, 120);
}

/** @param {{tekst:string, historia?:any[], ekran?:any, athleteId:string, sb:any, adm:any, jwt:string, dzis:string, teraz:Date, gemini:string, budzet:number, fetchFn:Function, T0?:number}} we */
export async function potok(we, nadpisz = {}) {
  const d = { ...DOMYSLNE, ...nadpisz };
  const { tekst, historia, ekran, athleteId, sb, adm, jwt, dzis, teraz, gemini, budzet, fetchFn } = we;
  const T0 = we.T0 || Date.now();
  const slad = [];   // ścieżka decyzji (ławka: oczekiwana ścieżka vs przebyta)
  const dodTok = { we: 0, wy: 0 };   // tokeny rozumienia (E2) doliczane do wpisu końcowego
  /* KCIUKI (3.11): zapis logu oddaje id wpisu → `log_id` w odpowiedzi 200 (tylko v2) → klient ocenia przez RPC okienko_ocena; skrót odpowiedzi dopisuje index.ts */
  const ostatni = { id: null };
  const zapiszOryg = d.zapiszLog;
  d.zapiszLog = async (a, w) => { const r = await zapiszOryg(a, w); if (Number.isFinite(Number(r)) && typeof r === "number") ostatni.id = r; return r; };
  const log = async (w) => { slad.push(w.tryb + (w.narzedzia?.length ? ":" + w.narzedzia.join("+") : ""));
    return d.zapiszLog(adm, { athlete_id: athleteId, tekst, ...w, tok_we: (w.tok_we || 0) + dodTok.we, tok_wy: (w.tok_wy || 0) + dodTok.wy, ms: Date.now() - T0 }); };
  const odp = (status, body) => ({ status, body: status === 200 && ostatni.id && body && typeof body === "object" && !body.log_id ? { ...body, log_id: ostatni.id } : body, slad });

  const AK = globalThis.BM_AKCJA_CYTATY, AKK = globalThis.BM_AKCJA;
  let akcjaDane = null;
  if (AK && zagadkaKandydat(tekst)) { try { akcjaDane = await AK.odswiezStan(sb, athleteId); } catch { akcjaDane = null; } }
  if (AK) AK.ustawStan({ ruszyla: !!(akcjaDane && akcjaDane.wystartowala), proba: AK.slugDla(athleteId) === "proba" });

  // ── B1: router v1 (0 tokenów) — zagadka/akcja, fabian*, zbiórka, reakcje, zdrowie, tanie narzędzia ──
  const traf = dopasuj(tekst, dzis);
  if (traf && "nawiguj" in traf) {
    await log({ tryb: "router", narzedzia: ["nawigacja"] });
    return odp(200, { ...pusto("router"), akcja: { nawiguj: traf.nawiguj } });
  }
  if (traf && "zdanie" in traf) {
    const poprz = poprzedniePytanie(traf, historia);
    await log({ tryb: "router", narzedzia: [traf.log], powod_odrzucenia: poprz ? "feedback: " + poprz : null });
    let kartyZd = [];
    if (traf.trener) {
      const { data: a } = await sb.from("athletes").select("coach_id").eq("id", athleteId).maybeSingle();
      if (a && a.coach_id) kartyZd = [{ typ: "plan_pusty", dane: { stan: "trener" } }];
    }
    if (traf.log === "zagadka" && AKK) { const k = AKK.kartaOkienka(akcjaDane); if (k) kartyZd = [k]; }
    if (Array.isArray(traf.karty)) kartyZd = traf.karty;
    return odp(200, { ...pusto("router"), zdania: [traf.zdanie], karty: kartyZd, chipy: traf.chipy || [] });
  }
  // ── O NAS (Filip 3.11 15:25): plik wiedzy o BiegaMy (_shared/o-nas.mjs) — PRZED bramką osób i przed siecią, 0 tokenów:
  //    „kim jest Filip”, „co to BiegaMy”, „kto stoi za aplikacją”, „jak zostać podopiecznym” nie są trybem osoby ani pytaniem do Google ──
  const on = oNas(tekst);
  if (on) {
    await log({ tryb: "router", narzedzia: ["o-nas"] });
    return odp(200, { ...pusto("router"), zdania: on.zdania, akcja: on.akcja || null });
  }
  // sieć ze źródłami (wspólna dla osoby, imprezy, przepisów) — deklarowana PRZED routerem, bo przepis gotowosc rusza już z routera
  const sieciDozwolona = async () => { if (!gemini) return false; try { return (await d.uzyteSiecDzis(adm, athleteId, dzis)) < d.LIMIT_SIEC; } catch { return false; } };
  const siecZeZrodlami = async (t) => {
    const w = await d.zapytajSiec({ fetchFn, klucz: gemini, tekst: t, dzis });
    const z = zOdpowiedziSieci(w.tekst, w.gm, httpsOk);
    const jest = z.zrodla.length > 0 && z.zdania[0] !== NIE_ZNALAZLEM;
    return { zdania: jest ? z.zdania : [], zrodla: jest ? z.zrodla : [], tok: w.tok, zapytania: w.zapytania };
  };
  const ctxV2 = () => ({ tekst, sb, adm, athleteId, jwt, dzis, teraz, fetchFn, gemini, d, sieciDozwolona, siecZeZrodlami, AK, AKK, akcjaDane });
  let roz = null, awaria = null;   // rozumienie (E2) i powód awarii — deklarowane tu, bo przepis gotowosc (E5) rusza już z routera
  if (traf) {
    const w = waliduj(traf.narzedzie, traf.args);
    if (!w.ok) return odp(400, { blad: w.blad });
    // E5: „jakie szanse na życiówkę” (router: moje_rekordy + szanse) → przepis gotowosc (starty + forma + 14 dni + rekord), 0 tokenów
    if (traf.narzedzie === "moje_rekordy" && w.args.szanse && d.wykonajPrzepis) {
      const p = await wykonajZPrzepisu({ intencja: "gotowosc", sloty: {}, kandydaci: [] }, null);
      if (p) return p;
    }
    let wynik;
    try { wynik = await d.wykonaj(sb, athleteId, traf.narzedzie, w.args, teraz, { fetchFn, token: jwt }); } catch { return odp(503, { blad: "narzędzie" }); }
    const zw = zWyniku(traf.narzedzie, wynik, w.args);
    await log({ narzedzia: [traf.narzedzie], tryb: "router", plan: [traf.narzedzie] });
    const tura = turaZNarzedzia(traf.narzedzie, w.args);
    await zapiszTure(adm, athleteId, tura.intencja, tura.sloty, { pytanie: tekst, odpowiedz: zw.zdania });   // E4: pamięć rozmowy także po routerze („a w grudniu?”); R2: z treścią
    return odp(200, { ...pusto("router"), zdania: zw.zdania, karty: zw.karty, akcja: zw.akcja !== undefined ? zw.akcja : nawigacja([traf.narzedzie]), narzedzia: [traf.narzedzie] });
  }
  // E4: pamięć rozmowy (intencje + sloty ≤ 5 tur, ≤ 30 min) — czyta i pisze tylko EF
  const rozmowa = await czytajRozmowe(adm, athleteId, teraz);
  const kont = czyKontynuacja(normalizuj(tekst), rozmowa);
  // ── R2: TRYB ROZMOWA — dopytanie w świeżej rozmowie („a dlaczego?”, „wyjaśnij prościej”, „a dla mnie?”) → jedno wywołanie modelu
  //    z poprzednimi wymianami; liczby tylko z rozmowy, strażnik ogólników; limit 20 tur/dobę; PRZED bramką osób (dopytanie nigdy nie idzie do sieci) ──
  if (gemini && d.rozmowaModel && czyDopytanie(normalizuj(tekst), rozmowa)) {
    let limit = null;
    try { limit = await d.sprawdzLimity(adm, athleteId, dzis, budzet); } catch { limit = null; }
    if (!limit && (await d.uzyteRozmowDzis(adm, athleteId, dzis)) >= d.LIMIT_ROZMOW) limit = "rozmowa";
    if (limit) { await log({ tryb: "limit", ok: false, powod_odrzucenia: "limit " + limit }); return odp(429, { limit }); }
    let fakty = [];
    try { fakty = await d.faktyPamieci(adm, athleteId, tekst, rozmowa); } catch { fakty = []; }
    const w = await d.rozmowaModel({ fetchFn, klucz: gemini, tekst, dzis, rozmowa, fakty });
    if (w && w.zdania.length) {
      await log({ tryb: "v2", narzedzia: ["rozmowa"], tok_we: w.tok.we, tok_wy: w.tok.wy, intencja: "rozmowa", ok: !w.ogolnik && !w.odrzucone.length,
        powod_odrzucenia: [w.ogolnik ? "ogólnik mimo ponowienia: skrócono" : (w.ponowiono ? "ogólnik: ponowiono" : null), ...w.odrzucone.map((x) => `liczba spoza rozmowy ${x.liczba}: ${x.zdanie}`)].filter(Boolean).join(" | ") || null });
      await zapiszTure(adm, athleteId, "rozmowa", {}, { pytanie: tekst, odpowiedz: w.zdania });
      return odp(200, { ...pusto("v2"), zdania: w.zdania, narzedzia: ["rozmowa"], koszt_tok: w.tok, intencja: "rozmowa" });
    }
    await log({ tryb: "v2-niepewne", narzedzia: ["rozmowa"], intencja: "rozmowa", ok: false, powod_odrzucenia: "rozmowa: model bez zdań po strażnikach" });
    return odp(200, { ...pusto("router"), zdania: [ODP_NIE_PRZESZLO], karty: [], chipy: CHIPY_WYBORU, intencja: "rozmowa" });
  }

  // ── B2: osoba / impreza — moduły v1; sieć wyłącznie przez ich strażniki i wspólny limit ──
  const os = osobaZPytania(tekst);
  if (os) {
    const o = await d.odpowiedzOsoba({ sb, athleteId, fetchFn, token: jwt, q: os.q, wprost: os.wprost, gdzie: os.gdzie || null, sieciDozwolona, siec: siecZeZrodlami });
    await log({ tryb: "osoba", tok_we: o.tok.we, tok_wy: o.tok.wy, zapytania_sieci: o.zapytania_sieci,
      ok: o.f6 === "ok", powod_odrzucenia: o.nic ? ["brak trafień: odpowiedź informacyjna", o.powod].filter(Boolean).join(" | ") : o.powod });
    if (!o.nic) await zapiszTure(adm, athleteId, "osoba", { osoba: os.q, miejsce: os.gdzie || undefined }, { pytanie: tekst, odpowiedz: o.zdania });   // E4: „porównaj z nim”
    return odp(200, { ...pusto("osoba"), zdania: o.zdania, karty: o.karty, zrodla: o.zrodla, akcja: o.akcja, koszt_tok: o.tok });
  }
  const imp = imprezaZPytania(tekst);
  if (imp) {
    const kluczImp = normalizuj(tekst);
    const o = await d.odpowiedzImpreza({ sb, fetchFn, token: jwt, q: imp.q, jawne: imp.jawne, cena: !!imp.cena, dzis, sieciDozwolona, siec: siecZeZrodlami,
      zPamieci: () => d.zPamieci(adm, kluczImp, teraz),
      doPamieci: (z, zr) => d.doPamieci(adm, kluczImp, z, zr, MODEL_SIECI, teraz),
      znaleziska: (w) => d.zapiszZnaleziska(adm, athleteId, w) });
    if (o) {
      await log({ tryb: "impreza", tok_we: o.tok.we, tok_wy: o.tok.wy, zapytania_sieci: o.zapytania_sieci, ok: o.f6 === "ok", powod_odrzucenia: o.powod });
      await zapiszTure(adm, athleteId, "impreza", { impreza: imp.q }, { pytanie: tekst, odpowiedz: o.zdania });
      return odp(200, { ...pusto("impreza"), zdania: o.zdania, karty: o.karty, zrodla: o.zrodla, koszt_tok: o.tok });
    }
  }
  let kat = null;
  try { kat = await d.szukajWKatalogu(sb, tekst); } catch { kat = null; }
  if (kat) {
    await log({ narzedzia: ["katalog"], tryb: "router" });
    return odp(200, { ...pusto("router"), zdania: kat.zdania, karty: kat.karty, narzedzia: ["katalog"] });
  }
  if (czyNiepewne(tekst) && !kont) {   // E4: „a jutro?” w świeżej rozmowie idzie do rozumienia z kontekstem, nie do chipów
    await log({ tryb: "v2-niepewne", narzedzia: ["niepewne"] });
    return odp(200, { ...pusto("router"), zdania: [ODP_NIEPEWNE], karty: [], chipy: CHIPY_WYBORU });
  }
  const klucz = normalizuj(tekst);
  const pam = await d.zPamieci(adm, klucz, teraz);
  if (pam && pam.zrodla.length) {
    await log({ tryb: "siec-cache" });
    return odp(200, { ...pusto("siec-cache"), zdania: pam.zdania, zrodla: pam.zrodla });
  }

  if (!gemini) return odp(502, { blad: "model niedostępny" });
  let limit;
  try { limit = await d.sprawdzLimity(adm, athleteId, dzis, budzet); } catch { return odp(503, { blad: "limity" }); }
  if (limit) {
    await log({ tryb: "limit", ok: false, powod_odrzucenia: "limit " + limit });
    return odp(429, { limit });
  }
  const blokadaSieci = wygladaNaOsobe(tekst) || !!osobaWZdaniu(tekst) || wygladaNaNazwisko(tekst);

  // ── E2: ROZUMIENIE PRZED NARZĘDZIEM — model widzi tylko tekst + 3 poprzednie pytania; decyzja należy do kodu (intencje.mjs).
  //    Błąd/timeout → ścieżka v1 niżej (powód 'v2-awaria' w logu). Niska pewność → chipy, 0 narzędzi. ──
  if (d.rozumienie) {
    const poprzednie = rozmowa.length ? kontekstDlaModelu(rozmowa) : (Array.isArray(historia) ? historia : []).slice(-3).map((h) => ({ q: h && h.q, intencja: h && h.intencja }));
    try { roz = await d.rozumienie({ fetchFn, klucz: gemini, tekst, dzis, poprzednie }); }
    catch (e) { awaria = "v2-awaria: rozumienie " + String(e && e.message).slice(0, 60); }
  }
  if (roz) {
    dodTok.we += roz.tok.we; dodTok.wy += roz.tok.wy;
    const bezPamieci = roz.sloty;
    roz = scalSloty(roz, rozmowa, kont);
    if (!bezPamieci.osoba && roz.sloty.osoba) roz.sloty = { ...roz.sloty, _zPamieci: true };
    if (roz.dopytac || roz.pewnosc < PROG_PEWNOSCI || roz.intencja === "nie_wiem") {
      await log({ tryb: "v2-niepewne", narzedzia: ["dopytanie"], intencja: roz.intencja, pewnosc: roz.pewnosc });
      return odp(200, { ...pusto("router"), zdania: [ODP_NIEPEWNE], karty: [], chipy: chipyDla(roz.kandydaci), intencja: roz.intencja });
    }
    if (INTENCJE_SIECI.includes(roz.intencja)) {
      /* WIEDZA OGÓLNA Z SIECI (Filip 3.11 15:25): porada / fakt / zywienie / sprzet → Gemini z googleSearch ze źródłami i konkretem
         (wiedza.mjs). Produkt z bazy Jedzenia PRZED siecią (także gdy klasyfikator powiedział „fakt”, a pytanie brzmi „ile kcal ma X”).
         Bramka prywatności (blokadaSieci) BEZ ZMIAN: nazwisko w pytaniu → ścieżka v1 niżej, nigdy Google. */
      if (roz.intencja === "zywienie" || produktZPytania(tekst)) {
        const rz = { ...roz, intencja: "zywienie" };
        let w = null;
        try { w = await wykonajIntencje(ctxV2(), rz); } catch (e) { awaria = "v2-awaria: produkt " + String(e && e.message).slice(0, 60); w = null; }
        if (w) return await odpowiedzV2(w, rz);
      }
      if (!blokadaSieci) {
        const w = await przezSiec({ tok: { we: 0, wy: 0 } }, roz);
        if (w) return w;
      }
    } else {
      if (PRZEPISY[roz.intencja] && d.wykonajPrzepis) {   // E5: przepisy ≤ 4 narzędzi równolegle, zdania z kodu
        const p = await wykonajZPrzepisu(roz, roz);
        if (p) return p;
      }
      let w = null;
      try { w = await wykonajIntencje(ctxV2(), roz); } catch (e) { awaria = "v2-awaria: intencja " + String(e && e.message).slice(0, 60); w = null; }
      if (w) return await odpowiedzV2(w, roz);
    }
  }

  // ── model v1 z narzędziami (bez rozumienia, awaria albo intencja bez obsługi w tym etapie) ──
  let m;
  try {
    m = await d.zapytajModel({ fetchFn, klucz: gemini, sb, athleteId, tekst, historia, ekran, dzis, teraz, f6ctx: { fetchFn, token: jwt } });
  } catch (e) {
    const modelu = e instanceof BladModelu;
    await log({ tryb: "blad", ok: false, powod_odrzucenia: (modelu ? "model: " : "narzędzie: ") + String(e && e.message).slice(0, 120) });
    return odp(modelu ? 502 : 503, { blad: modelu ? "model" : "narzędzie" });
  }
  if (!blokadaSieci && czyDoSieci(normalizuj(tekst), m.poza_danymi, m.uzyte.length)) {
    const w = await przezSiec(m, roz);
    if (w) return w;
  }

  const zKartami = m.karty_z.filter((n) => { const u = m.uzyte.find((x) => x.nazwa === n); return u && zWyniku(n, u.wynik, u.args).karty.length > 0; });
  const karty = zKartami.flatMap((n) => { const u = m.uzyte.find((x) => x.nazwa === n); return u ? zWyniku(n, u.wynik, u.args).karty : []; });
  const s = sprawdz(m.zdania, karty.length, m.uzyte.map((u) => u.wynik), zKartami);
  const nazwy = m.uzyte.map((u) => u.nazwa);
  await log({ narzedzia: nazwy, tryb: "flash", tok_we: m.tok.we, tok_wy: m.tok.wy, plan: nazwy, samosprawdzenie: !s.puste && s.odrzucone.length === 0,
    intencja: roz ? roz.intencja : null, pewnosc: roz ? roz.pewnosc : undefined,
    ok: !s.puste && s.odrzucone.length === 0, powod_odrzucenia: [awaria, powodPustych(s, m)].filter(Boolean).join(" | ") || null });
  const zdania = (blokadaSieci && !karty.length && (s.puste || s.zdania[0] === NIE_MAM || m.poza_danymi)) ? [ODP_NIC] : s.zdania;
  if (!s.puste) await zapiszTure(adm, athleteId, nazwy[0] || "flash", {}, { pytanie: tekst, odpowiedz: zdania });   // R2
  return odp(200, { zdania, karty, akcja: nawigacja(nazwy), zrodla: [], narzedzia: nazwy, tryb: "flash", koszt_tok: m.tok });

  /* E5: przepis → E6: samosprawdzenie → odpowiedź; null = przepis nic nie dał (ścieżka v1 niżej) */
  async function wykonajZPrzepisu(r, rozLog) {
    let p = null;
    try { p = await d.wykonajPrzepis(ctxV2(), r); } catch (e) { awaria = "v2-awaria: przepis " + String(e && e.message).slice(0, 60); p = null; }
    if (!p) return null;
    return await odpowiedzV2(p, rozLog || r);
  }
  /* E6: samosprawdzenie każdej odpowiedzi v2 (intencja → narzędzia, liczby z narzędzi, okres, osoba); NIE → „Nie mam tego w Twoich danych.” + chipy.
     E4: udana tura trafia do pamięci rozmowy. */
  async function odpowiedzV2(w, roz) {
    const meta = w.meta || null;
    const sp = w.status && w.status !== 200 ? { ok: true, powod: null }
      : samosprawdz({ intencja: roz.intencja, sloty: roz.sloty, narzedzia: meta ? meta.narzedzia : [], args: meta ? meta.args : {}, zdania: w.body.zdania, karty: w.body.karty, wyniki: meta ? meta.wyniki : null });
    if (!sp.ok) {
      await log({ tryb: "v2", narzedzia: (w.log && w.log.narzedzia) || [], plan: (w.log && w.log.plan) || [], intencja: roz.intencja, pewnosc: roz.pewnosc, samosprawdzenie: false, ok: false, powod_odrzucenia: "samosprawdzenie: " + sp.powod });
      return odp(200, { ...pusto("router"), zdania: [ODP_NIE_PRZESZLO], karty: [], chipy: chipyDla(roz.kandydaci), intencja: roz.intencja });
    }
    const { tryb: trybLog, ...resztaLog } = w.log || {};
    await log({ tryb: trybLog || "v2", ...resztaLog, intencja: roz.intencja, pewnosc: roz.pewnosc, samosprawdzenie: meta ? true : undefined });
    if (w.status == null || w.status === 200) { const { _zPamieci, ...sloty } = roz.sloty || {}; await zapiszTure(adm, athleteId, roz.intencja, sloty, { pytanie: tekst, odpowiedz: w.body && w.body.zdania }); }
    return odp(w.status || 200, { ...w.body, intencja: roz.intencja });
  }
  /* sieć ze źródłami (M2a): limit 20/dobę, pamięć 24 h, znaleziska; `m` = koszt poprzedzającego modelu (0 przy skoku z intencji „fakt”).
     null = limit (odpowiedź 429 już zwrócona przez wyjątek niżej) — zwracamy gotową odpowiedź potoku. */
  async function przezSiec(m, roz) {
    let ileSiec;
    try { ileSiec = await d.uzyteSiecDzis(adm, athleteId, dzis); } catch { return odp(503, { blad: "limity" }); }
    if (ileSiec >= d.LIMIT_SIEC) {
      await log({ tryb: "limit", ok: false, powod_odrzucenia: "limit siec", tok_we: m.tok.we, tok_wy: m.tok.wy });
      return odp(429, { limit: "siec" });
    }
    /* intencja z listy INTENCJE_SIECI → wiedza.mjs (prompt na konkret + strażnik ogólników: jedno ponowienie, potem krócej); inaczej sieć v1 */
    const wiedza = roz && INTENCJE_SIECI.includes(roz.intencja);
    let w;
    try { w = wiedza ? await szukajWiedzy({ d, fetchFn, klucz: gemini, tekst, dzis, intencja: roz.intencja }) : await d.zapytajSiec({ fetchFn, klucz: gemini, tekst, dzis }); }
    catch (e) {
      await log({ tryb: "blad", ok: false, powod_odrzucenia: "siec: " + String(e && e.message).slice(0, 120), tok_we: m.tok.we, tok_wy: m.tok.wy });
      return odp(502, { blad: "model" });
    }
    const o = wiedza ? w : zOdpowiedziSieci(w.tekst, w.gm, httpsOk);
    const tok = { we: m.tok.we + w.tok.we, wy: m.tok.wy + w.tok.wy };
    if (o.zrodla.length && o.zdania[0] !== NIE_ZNALAZLEM) {
      await d.doPamieci(adm, klucz, o.zdania, o.zrodla, MODEL_SIECI, teraz);
      await d.zapiszZnaleziska(adm, athleteId, znaleziskaZ(tekst, o.zrodla));
    }
    await log({ tryb: "siec", tok_we: tok.we, tok_wy: tok.wy, zapytania_sieci: w.zapytania, intencja: roz ? roz.intencja : null, pewnosc: roz ? roz.pewnosc : undefined,
      ok: o.odrzucone.length === 0 && !o.ogolnik,
      powod_odrzucenia: [o.ogolnik ? "ogólnik mimo ponowienia: skrócono" : (o.ponowiono ? "ogólnik: ponowiono z instrukcją „liczby/kroki”" : null), ...o.odrzucone.map((x) => `${x.powod}: ${x.zdanie}`)].filter(Boolean).join(" | ") || null });
    await zapiszTure(adm, athleteId, roz && roz.intencja ? roz.intencja : "siec", {}, { pytanie: tekst, odpowiedz: o.zdania });   // R2: dopytanie po odpowiedzi z sieci
    return odp(200, { zdania: o.zdania, karty: [], akcja: null, zrodla: o.zrodla, narzedzia: [], tryb: "siec", koszt_tok: tok });
  }
}
