// OKIENKO 2.0 — EF okienko-v2 (docs/projekt-okienko-2-0-2026-11-03.md, OK Filipa 3.11). Wejście/wyjście IDENTYCZNE jak okienko
// (POST {tekst, ekran?, historia?} → {zdania, karty, akcja, zrodla, narzedzia, tryb, koszt_tok, chipy?}) + `wersja: "v2"` i nagłówek
// X-Okienko-Wersja. Front kieruje tu tylko konta z okienko_v2_konta (RPC okienko_wersja, js/okienko.js).
//
// ZASADA „v2 NIE KOPIUJE” (blizna-113): router, osoba, impreza, katalog, pamięć sieci, model, sieć, strażnik — WYŁĄCZNIE importy
// z ../okienko/. Tu jest tylko orkiestracja + to, czego v1 nie ma (log z ms; od E2: rozumienie, dopytywanie, pamięć rozmowy,
// przepisy narzędzi, samosprawdzenie). Poprawka w v1 obowiązuje v2 bez pracy; v2 w zamrożeniu 6.11 18:00–8.11 nie rusza ../okienko/.
//
// E0 (5.11): ta sama kolejność co v1 — wymagajUsera → stan akcji → router → osoba → impreza → katalog → niska pewność → pamięć sieci
// → limity (dzienny z okienko_v2_log, budżet v1+v2) → model → sieć. Log do okienko_v2_log z `ms` (opóźnienie od wejścia do odpowiedzi).
// Zapis kluczem service WYŁĄCZNIE: okienko_v2_log (log-v2.mjs) + przez moduły v1: okienko_siec_cache, okienko_znaleziska.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wymagajUsera } from "../_shared/wymagaj-usera.mjs";
import { waliduj, wykonaj, nawigacja, dzisWaw } from "../okienko/narzedzia.mjs";
import { dopasuj, normalizuj, zagadkaKandydat, czyNiepewne, ODP_NIEPEWNE, CHIPY_WYBORU } from "../okienko/router.mjs";
import "../../../js/akcja.mjs";
import { zWyniku } from "../okienko/odpowiedz.mjs";
import { zapytajModel, BladModelu } from "../okienko/model.mjs";
import { sprawdz, powodPustych, NIE_MAM } from "../okienko/straznik.mjs";
import { zapytajSiec, zOdpowiedziSieci, czyDoSieci, NIE_ZNALAZLEM } from "../okienko/siec.mjs";
import { zPamieci, doPamieci, znaleziskaZ, zapiszZnaleziska, wygladaNaOsobe, wygladaNaNazwisko } from "../okienko/pamiec.mjs";
import { osobaZPytania, odpowiedzOsoba, osobaWZdaniu, ODP_NIC } from "../okienko/osoba.mjs";
import { imprezaZPytania, odpowiedzImpreza } from "../okienko/impreza.mjs";
import { szukajWKatalogu } from "../okienko/katalog.mjs";
import { zapiszLogV2, sprawdzLimityV2, uzyteSiecDzisV2, LIMIT_SIEC } from "./log-v2.mjs";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI = Deno.env.get("GEMINI_API_KEY") || "";
const BUDZET = Number(Deno.env.get("OKIENKO_BUDZET_USD") || "0");
const PUBLISHABLE = "sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY";   // ten sam literał co wymagaj-usera.mjs
const MAX_TEKST = 300;
export const WERSJA = "v2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Okienko-Wersja",   // klient czyta nagłówek (awaria → do końca sesji v1)
};
const odp = (status: number, body: unknown, wersja = WERSJA) =>
  new Response(JSON.stringify(typeof body === "object" && body ? { ...(body as object), wersja } : body),
    { status, headers: { ...cors, "Content-Type": "application/json", "X-Okienko-Wersja": wersja } });
const pusto = (tryb: string, extra: Record<string, unknown> = {}) => ({ zdania: [], karty: [], akcja: null, zrodla: [], narzedzia: [], tryb, koszt_tok: { we: 0, wy: 0 }, ...extra });

function poprzedniePytanie(traf: unknown, historia: unknown): string {
  if (!(traf as { feedback?: boolean })?.feedback || !Array.isArray(historia) || !historia.length) return "";
  return String((historia[historia.length - 1] as { q?: unknown })?.q || "").slice(0, 120);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return odp(405, { blad: "tylko POST" });
  const T0 = Date.now();
  const user = await wymagajUsera(req);
  if (!user) return odp(401, { blad: "brak sesji" });

  let body: { tekst?: unknown; ekran?: unknown; historia?: unknown } = {};
  try { body = await req.json(); } catch { return odp(400, { blad: "zły JSON" }); }
  const tekst = String(body.tekst ?? "").slice(0, MAX_TEKST).trim();
  if (!tekst) return odp(400, { blad: "pusty tekst" });

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const sb = createClient(SB_URL, PUBLISHABLE, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const adm = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
  const { data: ath } = await sb.from("athletes").select("id").eq("user_id", user.id).maybeSingle();
  if (!ath) return odp(200, { ...pusto("router"), zdania: [NIE_MAM] });

  const teraz = new Date();
  const dzis = dzisWaw(teraz);
  // każdy wpis logu v2 niesie ms = czas od wejścia żądania (cel: p90 < 2 s, projekt §3)
  const log = (w: Record<string, unknown>) => zapiszLogV2(adm, { athlete_id: ath.id, tekst, ...w, ms: Date.now() - T0 });

  const AK = (globalThis as any).BM_AKCJA_CYTATY, AKK = (globalThis as any).BM_AKCJA;
  let akcjaDane: any = null;
  if (AK && zagadkaKandydat(tekst)) { try { akcjaDane = await AK.odswiezStan(sb, ath.id); } catch { akcjaDane = null; } }
  if (AK) AK.ustawStan({ ruszyla: !!(akcjaDane && akcjaDane.wystartowala), proba: AK.slugDla(ath.id) === "proba" });

  // ── B1: router v1 (0 tokenów) — zagadka/akcja, fabian*, zbiórka, reakcje, zdrowie i wszystkie tanie narzędzia ──
  const traf = dopasuj(tekst, dzis);
  if (traf && "nawiguj" in traf) {
    await log({ tryb: "router" });
    return odp(200, { ...pusto("router"), akcja: { nawiguj: traf.nawiguj } });
  }
  if (traf && "zdanie" in traf) {
    const poprz = poprzedniePytanie(traf, body.historia);
    await log({ tryb: "router", narzedzia: [traf.log], powod_odrzucenia: poprz ? "feedback: " + poprz : null });
    let kartyZd: unknown[] = [];
    if ((traf as { trener?: boolean }).trener) {
      const { data: a } = await sb.from("athletes").select("coach_id").eq("id", ath.id).maybeSingle();
      if (a && a.coach_id) kartyZd = [{ typ: "plan_pusty", dane: { stan: "trener" } }];
    }
    if (traf.log === "zagadka" && AKK) { const k = AKK.kartaOkienka(akcjaDane); if (k) kartyZd = [k]; }
    if (Array.isArray((traf as { karty?: unknown[] }).karty)) kartyZd = (traf as { karty: unknown[] }).karty;
    return odp(200, { ...pusto("router"), zdania: [traf.zdanie], karty: kartyZd, chipy: (traf as { chipy?: unknown[] }).chipy || [] });
  }
  if (traf) {
    const w = waliduj(traf.narzedzie, traf.args);
    if (!w.ok) return odp(400, { blad: w.blad });
    let wynik;
    try { wynik = await wykonaj(sb, ath.id, traf.narzedzie, w.args, teraz, { fetchFn: fetch, token: jwt }); } catch { return odp(503, { blad: "narzędzie" }); }
    const zw = zWyniku(traf.narzedzie, wynik, w.args) as { zdania: string[]; karty: unknown[]; akcja?: unknown };
    await log({ narzedzia: [traf.narzedzie], tryb: "router", plan: [traf.narzedzie] });
    return odp(200, { ...pusto("router"), zdania: zw.zdania, karty: zw.karty, akcja: zw.akcja !== undefined ? zw.akcja : nawigacja([traf.narzedzie]), narzedzia: [traf.narzedzie] });
  }

  // ── B2: osoba / impreza — moduły v1 (sieć tylko przez ich własne strażniki) ──
  const httpsOk = (u: string) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };
  const sieciDozwolona = async () => { if (!GEMINI) return false; try { return (await uzyteSiecDzisV2(adm, ath.id, dzis)) < LIMIT_SIEC; } catch { return false; } };
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
    await log({ tryb: "osoba", tok_we: o.tok.we, tok_wy: o.tok.wy, zapytania_sieci: o.zapytania_sieci,
      ok: o.f6 === "ok", powod_odrzucenia: o.nic ? ["brak trafień: odpowiedź informacyjna", o.powod].filter(Boolean).join(" | ") : o.powod });
    return odp(200, { ...pusto("osoba"), zdania: o.zdania, karty: o.karty, zrodla: o.zrodla, akcja: o.akcja, koszt_tok: o.tok });
  }
  const imp = imprezaZPytania(tekst);
  if (imp) {
    const kluczImp = normalizuj(tekst);
    const o = await odpowiedzImpreza({ sb, fetchFn: fetch, token: jwt, q: imp.q, jawne: imp.jawne, cena: !!(imp as { cena?: boolean }).cena, dzis, sieciDozwolona, siec: siecZeZrodlami,
      zPamieci: () => zPamieci(adm, kluczImp, teraz),
      doPamieci: (z: string[], zr: unknown[]) => doPamieci(adm, kluczImp, z, zr, "gemini-3.5-flash-lite", teraz),
      znaleziska: (w: unknown[]) => zapiszZnaleziska(adm, ath.id, w) });
    if (o) {
      await log({ tryb: "impreza", tok_we: o.tok.we, tok_wy: o.tok.wy, zapytania_sieci: o.zapytania_sieci, ok: o.f6 === "ok", powod_odrzucenia: o.powod });
      return odp(200, { ...pusto("impreza"), zdania: o.zdania, karty: o.karty, zrodla: o.zrodla, koszt_tok: o.tok });
    }
  }
  let kat = null;
  try { kat = await szukajWKatalogu(sb, tekst); } catch { kat = null; }
  if (kat) {
    await log({ narzedzia: ["katalog"], tryb: "router" });
    return odp(200, { ...pusto("router"), zdania: kat.zdania, karty: kat.karty, narzedzia: ["katalog"] });
  }
  if (czyNiepewne(tekst)) {
    await log({ tryb: "v2-niepewne", narzedzia: ["niepewne"] });
    return odp(200, { ...pusto("router"), zdania: [ODP_NIEPEWNE], karty: [], chipy: CHIPY_WYBORU });
  }
  const klucz = normalizuj(tekst);
  const pam = await zPamieci(adm, klucz, teraz);
  if (pam && pam.zrodla.length) {
    await log({ tryb: "siec-cache" });
    return odp(200, { ...pusto("siec-cache"), zdania: pam.zdania, zrodla: pam.zrodla });
  }

  // ── model (E0: jak v1; od E2 tu wchodzi rozumienie → przepisy → składanie → samosprawdzenie) ──
  if (!GEMINI) return odp(502, { blad: "model niedostępny" });
  let limit;
  try { limit = await sprawdzLimityV2(adm, ath.id, dzis, BUDZET); } catch { return odp(503, { blad: "limity" }); }
  if (limit) {
    await log({ tryb: "limit", ok: false, powod_odrzucenia: "limit " + limit });
    return odp(429, { limit });
  }
  let m;
  try {
    m = await zapytajModel({ fetchFn: fetch, klucz: GEMINI, sb, athleteId: ath.id, tekst, historia: body.historia as never, ekran: body.ekran, dzis, teraz,
      f6ctx: { fetchFn: fetch, token: jwt } });
  } catch (e) {
    const modelu = e instanceof BladModelu;
    await log({ tryb: "blad", ok: false, powod_odrzucenia: (modelu ? "model: " : "narzędzie: ") + String((e as Error).message).slice(0, 120) });
    return odp(modelu ? 502 : 503, { blad: modelu ? "model" : "narzędzie" });
  }
  const blokadaSieci = wygladaNaOsobe(tekst) || !!osobaWZdaniu(tekst) || wygladaNaNazwisko(tekst);
  if (!blokadaSieci && czyDoSieci(normalizuj(tekst), m.poza_danymi, m.uzyte.length)) {
    let ileSiec;
    try { ileSiec = await uzyteSiecDzisV2(adm, ath.id, dzis); } catch { return odp(503, { blad: "limity" }); }
    if (ileSiec >= LIMIT_SIEC) {
      await log({ tryb: "limit", ok: false, powod_odrzucenia: "limit siec", tok_we: m.tok.we, tok_wy: m.tok.wy });
      return odp(429, { limit: "siec" });
    }
    let w;
    try { w = await zapytajSiec({ fetchFn: fetch, klucz: GEMINI, tekst, dzis }); }
    catch (e) {
      await log({ tryb: "blad", ok: false, powod_odrzucenia: "siec: " + String((e as Error).message).slice(0, 120), tok_we: m.tok.we, tok_wy: m.tok.wy });
      return odp(502, { blad: "model" });
    }
    const o = zOdpowiedziSieci(w.tekst, w.gm, httpsOk);
    const tok = { we: m.tok.we + w.tok.we, wy: m.tok.wy + w.tok.wy };
    if (o.zrodla.length && o.zdania[0] !== NIE_ZNALAZLEM) {
      await doPamieci(adm, klucz, o.zdania, o.zrodla, "gemini-3.5-flash-lite", teraz);
      await zapiszZnaleziska(adm, ath.id, znaleziskaZ(tekst, o.zrodla));
    }
    await log({ tryb: "siec", tok_we: tok.we, tok_wy: tok.wy, zapytania_sieci: w.zapytania,
      ok: o.odrzucone.length === 0, powod_odrzucenia: o.odrzucone.length ? o.odrzucone.map((x: { powod: string; zdanie: string }) => `${x.powod}: ${x.zdanie}`).join(" | ") : null });
    return odp(200, { zdania: o.zdania, karty: [], akcja: null, zrodla: o.zrodla, narzedzia: [], tryb: "siec", koszt_tok: tok });
  }

  const zKartami = m.karty_z.filter((n: string) => { const u = m.uzyte.find((x: { nazwa: string }) => x.nazwa === n); return u && zWyniku(n, u.wynik, u.args).karty.length > 0; });
  const karty = zKartami.flatMap((n: string) => { const u = m.uzyte.find((x: { nazwa: string }) => x.nazwa === n); return u ? zWyniku(n, u.wynik, u.args).karty : []; });
  const s = sprawdz(m.zdania, karty.length, m.uzyte.map((u: { wynik: unknown }) => u.wynik), zKartami);
  const nazwy: string[] = m.uzyte.map((u: { nazwa: string }) => u.nazwa);
  await log({ narzedzia: nazwy, tryb: "flash", tok_we: m.tok.we, tok_wy: m.tok.wy, plan: nazwy, samosprawdzenie: !s.puste && s.odrzucone.length === 0,
    ok: !s.puste && s.odrzucone.length === 0, powod_odrzucenia: powodPustych(s, m) });
  const zdania = (blokadaSieci && !karty.length && (s.puste || s.zdania[0] === NIE_MAM || m.poza_danymi)) ? [ODP_NIC] : s.zdania;
  return odp(200, { zdania, karty, akcja: nawigacja(nazwy), zrodla: [], narzedzia: nazwy, tryb: "flash", koszt_tok: m.tok });
});
