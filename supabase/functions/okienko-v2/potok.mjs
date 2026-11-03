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
import { zapiszLogV2, sprawdzLimityV2, uzyteSiecDzisV2, LIMIT_SIEC } from "./log-v2.mjs";

export const MODEL_SIECI = "gemini-3.5-flash-lite";   // etykieta pamięci sieci (jak v1)
export const DOMYSLNE = { wykonaj, zapytajModel, zapytajSiec, odpowiedzOsoba, odpowiedzImpreza, szukajWKatalogu, zPamieci, doPamieci, zapiszZnaleziska,
  uzyteSiecDzis: uzyteSiecDzisV2, sprawdzLimity: sprawdzLimityV2, zapiszLog: zapiszLogV2, LIMIT_SIEC };

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
  const log = async (w) => { slad.push(w.tryb + (w.narzedzia?.length ? ":" + w.narzedzia.join("+") : "")); return d.zapiszLog(adm, { athlete_id: athleteId, tekst, ...w, ms: Date.now() - T0 }); };
  const odp = (status, body) => ({ status, body, slad });

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
  if (traf) {
    const w = waliduj(traf.narzedzie, traf.args);
    if (!w.ok) return odp(400, { blad: w.blad });
    let wynik;
    try { wynik = await d.wykonaj(sb, athleteId, traf.narzedzie, w.args, teraz, { fetchFn, token: jwt }); } catch { return odp(503, { blad: "narzędzie" }); }
    const zw = zWyniku(traf.narzedzie, wynik, w.args);
    await log({ narzedzia: [traf.narzedzie], tryb: "router", plan: [traf.narzedzie] });
    return odp(200, { ...pusto("router"), zdania: zw.zdania, karty: zw.karty, akcja: zw.akcja !== undefined ? zw.akcja : nawigacja([traf.narzedzie]), narzedzia: [traf.narzedzie] });
  }

  // ── B2: osoba / impreza — moduły v1; sieć wyłącznie przez ich strażniki i wspólny limit ──
  const sieciDozwolona = async () => { if (!gemini) return false; try { return (await d.uzyteSiecDzis(adm, athleteId, dzis)) < d.LIMIT_SIEC; } catch { return false; } };
  const siecZeZrodlami = async (t) => {
    const w = await d.zapytajSiec({ fetchFn, klucz: gemini, tekst: t, dzis });
    const z = zOdpowiedziSieci(w.tekst, w.gm, httpsOk);
    const jest = z.zrodla.length > 0 && z.zdania[0] !== NIE_ZNALAZLEM;
    return { zdania: jest ? z.zdania : [], zrodla: jest ? z.zrodla : [], tok: w.tok, zapytania: w.zapytania };
  };
  const os = osobaZPytania(tekst);
  if (os) {
    const o = await d.odpowiedzOsoba({ sb, athleteId, fetchFn, token: jwt, q: os.q, wprost: os.wprost, gdzie: os.gdzie || null, sieciDozwolona, siec: siecZeZrodlami });
    await log({ tryb: "osoba", tok_we: o.tok.we, tok_wy: o.tok.wy, zapytania_sieci: o.zapytania_sieci,
      ok: o.f6 === "ok", powod_odrzucenia: o.nic ? ["brak trafień: odpowiedź informacyjna", o.powod].filter(Boolean).join(" | ") : o.powod });
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
      return odp(200, { ...pusto("impreza"), zdania: o.zdania, karty: o.karty, zrodla: o.zrodla, koszt_tok: o.tok });
    }
  }
  let kat = null;
  try { kat = await d.szukajWKatalogu(sb, tekst); } catch { kat = null; }
  if (kat) {
    await log({ narzedzia: ["katalog"], tryb: "router" });
    return odp(200, { ...pusto("router"), zdania: kat.zdania, karty: kat.karty, narzedzia: ["katalog"] });
  }
  if (czyNiepewne(tekst)) {
    await log({ tryb: "v2-niepewne", narzedzia: ["niepewne"] });
    return odp(200, { ...pusto("router"), zdania: [ODP_NIEPEWNE], karty: [], chipy: CHIPY_WYBORU });
  }
  const klucz = normalizuj(tekst);
  const pam = await d.zPamieci(adm, klucz, teraz);
  if (pam && pam.zrodla.length) {
    await log({ tryb: "siec-cache" });
    return odp(200, { ...pusto("siec-cache"), zdania: pam.zdania, zrodla: pam.zrodla });
  }

  // ── model (E0: jak v1) ──
  if (!gemini) return odp(502, { blad: "model niedostępny" });
  let limit;
  try { limit = await d.sprawdzLimity(adm, athleteId, dzis, budzet); } catch { return odp(503, { blad: "limity" }); }
  if (limit) {
    await log({ tryb: "limit", ok: false, powod_odrzucenia: "limit " + limit });
    return odp(429, { limit });
  }
  let m;
  try {
    m = await d.zapytajModel({ fetchFn, klucz: gemini, sb, athleteId, tekst, historia, ekran, dzis, teraz, f6ctx: { fetchFn, token: jwt } });
  } catch (e) {
    const modelu = e instanceof BladModelu;
    await log({ tryb: "blad", ok: false, powod_odrzucenia: (modelu ? "model: " : "narzędzie: ") + String(e && e.message).slice(0, 120) });
    return odp(modelu ? 502 : 503, { blad: modelu ? "model" : "narzędzie" });
  }
  const blokadaSieci = wygladaNaOsobe(tekst) || !!osobaWZdaniu(tekst) || wygladaNaNazwisko(tekst);
  if (!blokadaSieci && czyDoSieci(normalizuj(tekst), m.poza_danymi, m.uzyte.length)) {
    let ileSiec;
    try { ileSiec = await d.uzyteSiecDzis(adm, athleteId, dzis); } catch { return odp(503, { blad: "limity" }); }
    if (ileSiec >= d.LIMIT_SIEC) {
      await log({ tryb: "limit", ok: false, powod_odrzucenia: "limit siec", tok_we: m.tok.we, tok_wy: m.tok.wy });
      return odp(429, { limit: "siec" });
    }
    let w;
    try { w = await d.zapytajSiec({ fetchFn, klucz: gemini, tekst, dzis }); }
    catch (e) {
      await log({ tryb: "blad", ok: false, powod_odrzucenia: "siec: " + String(e && e.message).slice(0, 120), tok_we: m.tok.we, tok_wy: m.tok.wy });
      return odp(502, { blad: "model" });
    }
    const o = zOdpowiedziSieci(w.tekst, w.gm, httpsOk);
    const tok = { we: m.tok.we + w.tok.we, wy: m.tok.wy + w.tok.wy };
    if (o.zrodla.length && o.zdania[0] !== NIE_ZNALAZLEM) {
      await d.doPamieci(adm, klucz, o.zdania, o.zrodla, MODEL_SIECI, teraz);
      await d.zapiszZnaleziska(adm, athleteId, znaleziskaZ(tekst, o.zrodla));
    }
    await log({ tryb: "siec", tok_we: tok.we, tok_wy: tok.wy, zapytania_sieci: w.zapytania,
      ok: o.odrzucone.length === 0, powod_odrzucenia: o.odrzucone.length ? o.odrzucone.map((x) => `${x.powod}: ${x.zdanie}`).join(" | ") : null });
    return odp(200, { zdania: o.zdania, karty: [], akcja: null, zrodla: o.zrodla, narzedzia: [], tryb: "siec", koszt_tok: tok });
  }

  const zKartami = m.karty_z.filter((n) => { const u = m.uzyte.find((x) => x.nazwa === n); return u && zWyniku(n, u.wynik, u.args).karty.length > 0; });
  const karty = zKartami.flatMap((n) => { const u = m.uzyte.find((x) => x.nazwa === n); return u ? zWyniku(n, u.wynik, u.args).karty : []; });
  const s = sprawdz(m.zdania, karty.length, m.uzyte.map((u) => u.wynik), zKartami);
  const nazwy = m.uzyte.map((u) => u.nazwa);
  await log({ narzedzia: nazwy, tryb: "flash", tok_we: m.tok.we, tok_wy: m.tok.wy, plan: nazwy, samosprawdzenie: !s.puste && s.odrzucone.length === 0,
    ok: !s.puste && s.odrzucone.length === 0, powod_odrzucenia: powodPustych(s, m) });
  const zdania = (blokadaSieci && !karty.length && (s.puste || s.zdania[0] === NIE_MAM || m.poza_danymi)) ? [ODP_NIC] : s.zdania;
  return odp(200, { zdania, karty, akcja: nawigacja(nazwy), zrodla: [], narzedzia: nazwy, tryb: "flash", koszt_tok: m.tok });
}
