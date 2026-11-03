// okienko — „Zapytaj" (M1). Wejście POST {tekst, ekran?, historia?} z JWT sesji. Wyjście wg M1-okienko-wykonanie.md pkt 1:
// {zdania, karty, akcja, zrodla, narzedzia, tryb, koszt_tok}. Kolejność:
//   1) wymagajUsera (JEDYNA bramka usera dla EF z frontu, LEKCJE #20) → 401;
//   2) klient Supabase z JWT użytkownika (RLS); athlete_id z sesji (athletes.user_id), NIE od klienta/modelu;
//   3) router bez modelu (0 tokenów, nie liczy się do limitu) → narzędzie / nawigacja;
//   4) brak dopasowania → limity (60/dobę, budżet miesięczny) → model (2 kroki) → strażnik cyfr → log → odpowiedź;
//   5) M2a: model bez narzędzia i pytanie nie „o mnie" (albo poza_danymi) → tryb „siec": limit 20/dobę, osobne
//      wywołanie z googleSearch BEZ danych aplikacji, strażnik na groundingSupports, źródła tylko https.
// Pełna kolejność od M3 (1.11.2026): router → osoba (M2b/M3-0) → impreza (M3a v2) → katalog (M3c) → pamięć sieci (M2d)
// → limity → model → sieć (strażnik: imię i nazwisko / osoba bez trafień nie idą do Google). Spec: docs/okienko-spec.md.
// „dzis" liczy EF w Europe/Warsaw — pole `dzis` z klienta ignorowane. Zapis kluczem service_role WYŁĄCZNIE do okienko_log,
// okienko_siec_cache i okienko_znaleziska (blizna-69); jedyny zapis użytkownika w okienku (f6_runner_key) robi przeglądarka RPC.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wymagajUsera } from "../_shared/wymagaj-usera.mjs";
import { waliduj, wykonaj, nawigacja, dzisWaw } from "./narzedzia.mjs";
import { dopasuj, normalizuj, zagadkaKandydat, czyNiepewne, ODP_NIEPEWNE, CHIPY_WYBORU } from "./router.mjs";
import "../../../js/akcja.mjs";   // BM_AKCJA.kartaOkienka — karta akcji po starcie (projekt F dzień 3)
import { zWyniku } from "./odpowiedz.mjs";
import { zapytajModel, BladModelu } from "./model.mjs";
import { sprawdz, powodPustych } from "./straznik.mjs";
import { sprawdzLimity, zapiszLog, uzyteSiecDzis, LIMIT_SIEC } from "./limity.mjs";
import { zapytajSiec, zOdpowiedziSieci, czyDoSieci, NIE_ZNALAZLEM } from "./siec.mjs";
import { zPamieci, doPamieci, znaleziskaZ, zapiszZnaleziska, wygladaNaOsobe, wygladaNaNazwisko } from "./pamiec.mjs";
import { osobaZPytania, odpowiedzOsoba, osobaWZdaniu, ODP_NIC } from "./osoba.mjs";
import { NIE_MAM } from "./straznik.mjs";
import { imprezaZPytania, odpowiedzImpreza } from "./impreza.mjs";
import { szukajWKatalogu } from "./katalog.mjs";
import { zTerminem, PrzekroczonyTermin, opisBledu, TERMIN_MS } from "./straz-http.mjs";   // AWARIA 3.11 (blizna-136)

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI = Deno.env.get("GEMINI_API_KEY") || "";
const BUDZET = Number(Deno.env.get("OKIENKO_BUDZET_USD") || "0");
const PUBLISHABLE = "sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY";   // ten sam literał co wymagaj-usera.mjs (patrz tam)
const MAX_TEKST = 300;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const odp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const pusto = (tryb: string, extra: Record<string, unknown> = {}) => ({ zdania: [], karty: [], akcja: null, zrodla: [], narzedzia: [], tryb, koszt_tok: { we: 0, wy: 0 }, ...extra });

/* Filip 3.11: przy reakcji („co odwaliłeś”) log dostaje ostatnie pytanie z historii klienta (bez treści odpowiedzi) — paliwo nocnego raportu złych odpowiedzi. */
function poprzedniePytanie(traf: unknown, historia: unknown): string {
  if (!(traf as { feedback?: boolean })?.feedback || !Array.isArray(historia) || !historia.length) return "";
  return String((historia[historia.length - 1] as { q?: unknown })?.q || "").slice(0, 120);
}

/* AWARIA 3.11 (blizna-136): cała obsługa w zTerminem + catch — wyjątek albo zawieszenie dają wpis 'blad' (gdy znamy zawodnika),
   console.error do logów EF i odpowiedź Z CORS (bez CORS przeglądarka widziała tylko „błąd sieci”, a log był pusty). */
type Stan = { athleteId: string | null; tekst: string; adm: any };
Deno.serve(async (req) => {
  const stan: Stan = { athleteId: null, tekst: "", adm: null };
  try { return await zTerminem(obsluz(req, stan), TERMIN_MS); }
  catch (e) {
    const czas = e instanceof PrzekroczonyTermin;
    const powod = (czas ? "termin EF: " : "wyjątek EF: ") + opisBledu(e);
    console.error("okienko:", powod);
    if (stan.athleteId && stan.adm) { try { await zapiszLog(stan.adm, { athlete_id: stan.athleteId, tekst: stan.tekst, tryb: "blad", ok: false, powod_odrzucenia: powod }); } catch { /* best-effort */ } }
    return odp(czas ? 504 : 500, { blad: czas ? "czas" : "wyjątek" });
  }
});

async function obsluz(req: Request, stan: Stan): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return odp(405, { blad: "tylko POST" });
  const user = await wymagajUsera(req);
  if (!user) return odp(401, { blad: "brak sesji" });

  let body: { tekst?: unknown; ekran?: unknown; historia?: unknown } = {};
  try { body = await req.json(); } catch { return odp(400, { blad: "zły JSON" }); }
  const tekst = String(body.tekst ?? "").slice(0, MAX_TEKST).trim();
  if (!tekst) return odp(400, { blad: "pusty tekst" });

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const sb = createClient(SB_URL, PUBLISHABLE, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const adm = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });   // WYŁĄCZNIE okienko_log (limity.mjs)
  const { data: ath } = await sb.from("athletes").select("id").eq("user_id", user.id).maybeSingle();
  if (!ath) return odp(200, { ...pusto("router"), zdania: ["Nie mam tego w Twoich danych."] });
  stan.athleteId = ath.id; stan.tekst = tekst; stan.adm = adm;
  const blad = async (status: number, body: unknown, powod: string) => {
    try { await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "blad", ok: false, powod_odrzucenia: powod.slice(0, 500) }); } catch { /* best-effort */ }
    return odp(status, body);
  };

  const teraz = new Date();
  const dzis = dzisWaw(teraz);

  /* ── AKCJA (projekt F dzień 3): stan z bazy TYLKO dla pytań o akcję (inne pytania bez dodatkowego RPC). RPC akcja_licznik
     z JWT pytającego (konto testowe czyta 'proba'). ⚠️ Stan modułu jest WSPÓLNY dla wszystkich zapytań w izolacie —
     ustawStan synchronicznie tuż przed dopasuj(), bez await pomiędzy, inaczej równoległe zapytanie przestawiłoby stan. ── */
  const AK = (globalThis as any).BM_AKCJA_CYTATY, AKK = (globalThis as any).BM_AKCJA;
  let akcjaDane: any = null;
  if (AK && zagadkaKandydat(tekst)) { try { akcjaDane = await AK.odswiezStan(sb, ath.id); } catch { akcjaDane = null; } }
  if (AK) AK.ustawStan({ ruszyla: !!(akcjaDane && akcjaDane.wystartowala), proba: AK.slugDla(ath.id) === "proba" });

  // ── router (0 tokenów, bez limitu) ──
  const traf = dopasuj(tekst, dzis);
  if (traf && "nawiguj" in traf) {
    await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "router" });
    return odp(200, { ...pusto("router"), akcja: { nawiguj: traf.nawiguj } });
  }
  if (traf && "zdanie" in traf) {   // M3-1 (3): powitanie; M3-2: kalkulator tempa, biegi za granicą — jedno zdanie, 0 tokenów
    const poprz = poprzedniePytanie(traf, body.historia);   // Filip 3.11: reakcja → feedback z poprzednim pytaniem
    await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "router", narzedzia: [traf.log], powod_odrzucenia: poprz ? "feedback: " + poprz : null });
    // etap 5 (c): przy bólu/kontuzji przycisk „Napisz do trenera" (ta sama karta co pusty plan) — tylko gdy jest trener
    let kartyZd: unknown[] = [];
    if ((traf as { trener?: boolean }).trener) {
      const { data: a } = await sb.from("athletes").select("coach_id").eq("id", ath.id).maybeSingle();
      if (a && a.coach_id) kartyZd = [{ typ: "plan_pusty", dane: { stan: "trener" } }];
    }
    // po starcie akcji: zagadka → zdanie + karta akcji (nazwa, licznik, oficjalna zbiórka) — dane jak w publicznym liczniku
    if (traf.log === "zagadka" && AKK) { const k = AKK.kartaOkienka(akcjaDane); if (k) kartyZd = [k]; }
    if (Array.isArray((traf as { karty?: unknown[] }).karty)) kartyZd = (traf as { karty: unknown[] }).karty;   // „jak dołączyć" przed startem → karta rejestracji
    return odp(200, { ...pusto("router"), zdania: [traf.zdanie], karty: kartyZd, chipy: (traf as { chipy?: unknown[] }).chipy || [] });
  }
  if (traf) {
    const w = waliduj(traf.narzedzie, traf.args);
    if (!w.ok) return await blad(400, { blad: w.blad }, "router: argumenty " + String(w.blad).slice(0, 80));
    let wynik;
    try { wynik = await wykonaj(sb, ath.id, traf.narzedzie, w.args, teraz, { fetchFn: fetch, token: jwt }); }
    catch (e) { return await blad(503, { blad: "narzędzie" }, "narzędzie " + traf.narzedzie + ": " + opisBledu(e)); }
    const zw = zWyniku(traf.narzedzie, wynik, w.args) as { zdania: string[]; karty: unknown[]; akcja?: unknown };
    await zapiszLog(adm, { athlete_id: ath.id, tekst, narzedzia: [traf.narzedzie], tryb: "router" });
    return odp(200, { ...pusto("router"), zdania: zw.zdania, karty: zw.karty, akcja: zw.akcja !== undefined ? zw.akcja : nawigacja([traf.narzedzie]), narzedzia: [traf.narzedzie] });
  }

  // ── M2b: pytanie o OSOBĘ — trzy fronty równolegle (osoba.mjs): profile publiczne, wyniki F6, sieć tylko dla osoby
  //    publicznej sportowo albo pytania wprost. Bez modelu z narzędziami; nie do pamięci sieci ani do znalezisk. ──
  // Sieć ze źródłami — JEDNA funkcja dla trybów osoby i imprezy (limit 20/dobę wspólny, uzyteSiecDzis).
  const httpsOk = (u: string) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };
  const sieciDozwolona = async () => { if (!GEMINI) return false; try { return (await uzyteSiecDzis(adm, ath.id, dzis)) < LIMIT_SIEC; } catch { return false; } };
  const siecZeZrodlami = async (t: string) => {
    const w = await zapytajSiec({ fetchFn: fetch, klucz: GEMINI, tekst: t, dzis });
    const z = zOdpowiedziSieci(w.tekst, w.gm, httpsOk);
    const jest = z.zrodla.length > 0 && z.zdania[0] !== NIE_ZNALAZLEM;
    return { zdania: jest ? z.zdania : [], zrodla: jest ? z.zrodla : [], tok: w.tok, zapytania: w.zapytania };
  };
  const os = osobaZPytania(tekst);
  if (os) {
    const o = await odpowiedzOsoba({ sb, athleteId: ath.id, fetchFn: fetch, token: jwt, q: os.q, wprost: os.wprost, gdzie: (os as { gdzie?: string | null }).gdzie || null,
      sieciDozwolona, siec: siecZeZrodlami });
    // M3-0b: brak trafień = odpowiedź informacyjna z osoba.mjs (0 tokenów, bez modelu i bez sieci) — koniec pytania
    await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "osoba", tok_we: o.tok.we, tok_wy: o.tok.wy, zapytania_sieci: o.zapytania_sieci,
      ok: o.f6 === "ok", powod_odrzucenia: o.nic ? ["brak trafień: odpowiedź informacyjna", o.powod].filter(Boolean).join(" | ") : o.powod });
    return odp(200, { ...pusto("osoba"), zdania: o.zdania, karty: o.karty, zrodla: o.zrodla, akcja: o.akcja, koszt_tok: o.tok });
  }
  // ── M3a v2: tryb „impreza" — kalendarz maszyny (adapter kalendarz.mjs) + nasze starty + sieć (dozwolona dla nazwy
  //    biegu), pamięć 24 h, znaleziska ze statusem „kalendarz". null = nie impreza → dalej (pamięć sieci, model). ──
  const imp = imprezaZPytania(tekst);
  if (imp) {
    const kluczImp = normalizuj(tekst);
    const o = await odpowiedzImpreza({ sb, fetchFn: fetch, token: jwt, q: imp.q, jawne: imp.jawne, cena: !!(imp as { cena?: boolean }).cena, dzis, sieciDozwolona, siec: siecZeZrodlami,
      zPamieci: () => zPamieci(adm, kluczImp, teraz),
      doPamieci: (z: string[], zr: unknown[]) => doPamieci(adm, kluczImp, z, zr, "gemini-3.5-flash-lite", teraz),
      znaleziska: (w: unknown[]) => zapiszZnaleziska(adm, ath.id, w) });
    if (o) {
      await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "impreza", tok_we: o.tok.we, tok_wy: o.tok.wy, zapytania_sieci: o.zapytania_sieci,
        ok: o.f6 === "ok", powod_odrzucenia: o.powod });
      return odp(200, { ...pusto("impreza"), zdania: o.zdania, karty: o.karty, zrodla: o.zrodla, koszt_tok: o.tok });
    }
  }
  // ── M3c: katalog treści aplikacji (radio, przepisy, ćwiczenia, ekrany, wyzwania, odznaki) — mocne trafienie = 0
  //    tokenów, model nie startuje; log jak router (tryb „router", narzędzie „katalog"), bez nowej migracji. ──
  let kat = null;
  try { kat = await szukajWKatalogu(sb, tekst); } catch { kat = null; }
  if (kat) {
    await zapiszLog(adm, { athlete_id: ath.id, tekst, narzedzia: ["katalog"], tryb: "router" });
    return odp(200, { ...pusto("router"), zdania: kat.zdania, karty: kat.karty, narzedzia: ["katalog"] });
  }
  // ── NISKA PEWNOŚĆ (Filip 3.11): bez liter / 1–2 słowa bez trafienia w router, osobę, imprezę i katalog → chipy, 0 tokenów ──
  if (czyNiepewne(tekst)) {
    await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "router", narzedzia: ["niepewne"] });
    return odp(200, { ...pusto("router"), zdania: [ODP_NIEPEWNE], karty: [], chipy: CHIPY_WYBORU });
  }
  // ── M2d: pamięć odpowiedzi z sieci (≤ 24 h) — trafienie = bez modelu, bez limitu, 0 zł ──
  const klucz = normalizuj(tekst);
  const pam = await zPamieci(adm, klucz, teraz);
  if (pam && pam.zrodla.length) {
    await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "siec-cache" });
    return odp(200, { ...pusto("siec-cache"), zdania: pam.zdania, zrodla: pam.zrodla });
  }

  // ── model ──
  if (!GEMINI) return await blad(502, { blad: "model niedostępny" }, "brak GEMINI_API_KEY");
  let limit;
  try { limit = await sprawdzLimity(adm, ath.id, dzis, BUDZET); } catch (e) { return await blad(503, { blad: "limity" }, "limity: " + opisBledu(e)); }
  if (limit) {
    await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "limit", ok: false, powod_odrzucenia: "limit " + limit });
    return odp(429, { limit });
  }
  let m;
  try {
    m = await zapytajModel({ fetchFn: fetch, klucz: GEMINI, sb, athleteId: ath.id, tekst, historia: body.historia as never, ekran: body.ekran, dzis, teraz,
      f6ctx: { fetchFn: fetch, token: jwt } });
  } catch (e) {
    const modelu = e instanceof BladModelu;
    await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "blad", ok: false, powod_odrzucenia: (modelu ? "model: " : "narzędzie: ") + String((e as Error).message).slice(0, 120) });
    return odp(modelu ? 502 : 503, { blad: modelu ? "model" : "narzędzie" });
  }
  // ── M2a: sieć (osobne wywołanie z googleSearch — tylko tekst pytania i data, NIC z aplikacji) ──
  // Strażnik sieci (M3-0): pytanie wyglądające na imię i nazwisko (stary, szeroki detektor — także dwa małe słowa,
  // które nie przeszły detektora słownikowego) NIE idzie do Google ścieżką ogólną.
  const blokadaSieci = wygladaNaOsobe(tekst) || !!osobaWZdaniu(tekst) || wygladaNaNazwisko(tekst);   // M3-1: nazwisko wewnątrz zdania; przed 8.11 (4): także SAMO nazwisko w kontekście wyników
  if (!blokadaSieci && czyDoSieci(normalizuj(tekst), m.poza_danymi, m.uzyte.length)) {
    let ileSiec;
    try { ileSiec = await uzyteSiecDzis(adm, ath.id, dzis); } catch (e) { return await blad(503, { blad: "limity" }, "limity sieci: " + opisBledu(e)); }
    if (ileSiec >= LIMIT_SIEC) {
      await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "limit", ok: false, powod_odrzucenia: "limit siec", tok_we: m.tok.we, tok_wy: m.tok.wy });
      return odp(429, { limit: "siec" });
    }
    let w;
    try { w = await zapytajSiec({ fetchFn: fetch, klucz: GEMINI, tekst, dzis }); }
    catch (e) {
      await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "blad", ok: false, powod_odrzucenia: "siec: " + String((e as Error).message).slice(0, 120), tok_we: m.tok.we, tok_wy: m.tok.wy });
      return odp(502, { blad: "model" });
    }
    const o = zOdpowiedziSieci(w.tekst, w.gm, (u: string) => { try { return new URL(u).protocol === "https:"; } catch { return false; } });
    const tok = { we: m.tok.we + w.tok.we, wy: m.tok.wy + w.tok.wy };
    if (o.zrodla.length && o.zdania[0] !== NIE_ZNALAZLEM) {   // pamięć i znaleziska tylko z odpowiedzią ze źródłami
      await doPamieci(adm, klucz, o.zdania, o.zrodla, "gemini-3.5-flash-lite", teraz);
      await zapiszZnaleziska(adm, ath.id, znaleziskaZ(tekst, o.zrodla));
    }
    await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "siec", tok_we: tok.we, tok_wy: tok.wy, zapytania_sieci: w.zapytania,
      ok: o.odrzucone.length === 0, powod_odrzucenia: o.odrzucone.length ? o.odrzucone.map((x: { powod: string; zdanie: string }) => `${x.powod}: ${x.zdanie}`).join(" | ").slice(0, 500) : null });
    return odp(200, { zdania: o.zdania, karty: [], akcja: null, zrodla: o.zrodla, narzedzia: [], tryb: "siec", koszt_tok: tok });
  }

  const zKartami = m.karty_z.filter((n: string) => { const u = m.uzyte.find((x: { nazwa: string }) => x.nazwa === n); return u && zWyniku(n, u.wynik, u.args).karty.length > 0; });
  const karty = zKartami.flatMap((n: string) => { const u = m.uzyte.find((x: { nazwa: string }) => x.nazwa === n); return u ? zWyniku(n, u.wynik, u.args).karty : []; });
  const s = sprawdz(m.zdania, karty.length, m.uzyte.map((u: { wynik: unknown }) => u.wynik), zKartami);
  const nazwy: string[] = m.uzyte.map((u: { nazwa: string }) => u.nazwa);
  await zapiszLog(adm, { athlete_id: ath.id, tekst, narzedzia: nazwy, tryb: "flash", tok_we: m.tok.we, tok_wy: m.tok.wy,
    ok: !s.puste && s.odrzucone.length === 0, powod_odrzucenia: powodPustych(s, m) });
  const zdania = (blokadaSieci && !karty.length && (s.puste || s.zdania[0] === NIE_MAM || m.poza_danymi)) ? [ODP_NIC] : s.zdania;
  return odp(200, { zdania, karty, akcja: nawigacja(nazwy), zrodla: [], narzedzia: nazwy, tryb: "flash", koszt_tok: m.tok });
}
