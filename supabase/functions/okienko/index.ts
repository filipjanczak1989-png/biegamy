// okienko — „Zapytaj" (M1). Wejście POST {tekst, ekran?, historia?} z JWT sesji. Wyjście wg M1-okienko-wykonanie.md pkt 1:
// {zdania, karty, akcja, zrodla, narzedzia, tryb, koszt_tok}. Kolejność:
//   1) wymagajUsera (JEDYNA bramka usera dla EF z frontu, LEKCJE #20) → 401;
//   2) klient Supabase z JWT użytkownika (RLS); athlete_id z sesji (athletes.user_id), NIE od klienta/modelu;
//   3) router bez modelu (0 tokenów, nie liczy się do limitu) → narzędzie / nawigacja;
//   4) brak dopasowania → limity (60/dobę, budżet miesięczny) → model (2 kroki) → strażnik cyfr → log → odpowiedź;
//   5) M2a: model bez narzędzia i pytanie nie „o mnie" (albo poza_danymi) → tryb „siec": limit 20/dobę, osobne
//      wywołanie z googleSearch BEZ danych aplikacji, strażnik na groundingSupports, źródła tylko https.
// „dzis" liczy EF w Europe/Warsaw — pole `dzis` z klienta ignorowane. Zapis WYŁĄCZNIE do okienko_log kluczem service_role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wymagajUsera } from "../_shared/wymagaj-usera.mjs";
import { waliduj, wykonaj, nawigacja, dzisWaw } from "./narzedzia.mjs";
import { dopasuj, normalizuj } from "./router.mjs";
import { zWyniku } from "./odpowiedz.mjs";
import { zapytajModel, BladModelu } from "./model.mjs";
import { sprawdz, powodPustych } from "./straznik.mjs";
import { sprawdzLimity, zapiszLog, uzyteSiecDzis, LIMIT_SIEC } from "./limity.mjs";
import { zapytajSiec, zOdpowiedziSieci, czyDoSieci, NIE_ZNALAZLEM } from "./siec.mjs";
import { zPamieci, doPamieci, znaleziskaZ, zapiszZnaleziska, wygladaNaOsobe } from "./pamiec.mjs";
import { osobaZPytania, odpowiedzOsoba, ODP_NIC } from "./osoba.mjs";
import { NIE_MAM } from "./straznik.mjs";
import { imprezaZPytania, odpowiedzImpreza } from "./impreza.mjs";

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

Deno.serve(async (req) => {
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

  const teraz = new Date();
  const dzis = dzisWaw(teraz);

  // ── router (0 tokenów, bez limitu) ──
  const traf = dopasuj(tekst, dzis);
  if (traf && "nawiguj" in traf) {
    await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "router" });
    return odp(200, { ...pusto("router"), akcja: { nawiguj: traf.nawiguj } });
  }
  if (traf) {
    const w = waliduj(traf.narzedzie, traf.args);
    if (!w.ok) return odp(400, { blad: w.blad });
    let wynik;
    try { wynik = await wykonaj(sb, ath.id, traf.narzedzie, w.args, teraz, { fetchFn: fetch, token: jwt }); } catch { return odp(503, { blad: "narzędzie" }); }
    const { zdania, karty } = zWyniku(traf.narzedzie, wynik, w.args);
    await zapiszLog(adm, { athlete_id: ath.id, tekst, narzedzia: [traf.narzedzie], tryb: "router" });
    return odp(200, { ...pusto("router"), zdania, karty, akcja: nawigacja([traf.narzedzie]), narzedzia: [traf.narzedzie] });
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
  let osobaBezTrafien = false;   // M3-0: tryb osoby nic nie znalazł → ścieżka ogólna, ale BEZ sieci i bez pamięci sieci
  if (os) {
    const o = await odpowiedzOsoba({ sb, athleteId: ath.id, fetchFn: fetch, token: jwt, q: os.q, wprost: os.wprost,
      sieciDozwolona, siec: siecZeZrodlami });
    await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "osoba", tok_we: o.tok.we, tok_wy: o.tok.wy, zapytania_sieci: o.zapytania_sieci,
      ok: o.f6 === "ok" && !o.nic, powod_odrzucenia: o.nic ? ["osoba: brak trafień → ścieżka ogólna", o.powod].filter(Boolean).join(" | ") : o.powod });
    if (!o.nic) return odp(200, { ...pusto("osoba"), zdania: o.zdania, karty: o.karty, zrodla: o.zrodla, akcja: o.akcja, koszt_tok: o.tok });
    osobaBezTrafien = true;
  }
  // ── M3a v2: tryb „impreza" — kalendarz maszyny (adapter kalendarz.mjs) + nasze starty + sieć (dozwolona dla nazwy
  //    biegu), pamięć 24 h, znaleziska ze statusem „kalendarz". null = nie impreza → dalej (pamięć sieci, model). ──
  const imp = imprezaZPytania(tekst);
  if (imp) {
    const kluczImp = normalizuj(tekst);
    const o = await odpowiedzImpreza({ sb, fetchFn: fetch, token: jwt, q: imp.q, jawne: imp.jawne, dzis, sieciDozwolona, siec: siecZeZrodlami,
      zPamieci: () => zPamieci(adm, kluczImp, teraz),
      doPamieci: (z: string[], zr: unknown[]) => doPamieci(adm, kluczImp, z, zr, "gemini-3.5-flash-lite", teraz),
      znaleziska: (w: unknown[]) => zapiszZnaleziska(adm, ath.id, w) });
    if (o) {
      await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "impreza", tok_we: o.tok.we, tok_wy: o.tok.wy, zapytania_sieci: o.zapytania_sieci,
        ok: o.f6 === "ok", powod_odrzucenia: o.powod });
      return odp(200, { ...pusto("impreza"), zdania: o.zdania, karty: o.karty, zrodla: o.zrodla, koszt_tok: o.tok });
    }
  }
  // ── M2d: pamięć odpowiedzi z sieci (≤ 24 h) — trafienie = bez modelu, bez limitu, 0 zł ──
  const klucz = normalizuj(tekst);
  const pam = osobaBezTrafien ? null : await zPamieci(adm, klucz, teraz);
  if (pam && pam.zrodla.length) {
    await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "siec-cache" });
    return odp(200, { ...pusto("siec-cache"), zdania: pam.zdania, zrodla: pam.zrodla });
  }

  // ── model ──
  if (!GEMINI) return odp(502, { blad: "model niedostępny" });
  let limit;
  try { limit = await sprawdzLimity(adm, ath.id, dzis, BUDZET); } catch { return odp(503, { blad: "limity" }); }
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
  // Strażnik sieci (M3-0): pytanie wyglądające na imię i nazwisko (stary, szeroki detektor) albo osoba bez trafień
  // NIE idzie do Google ścieżką ogólną — nazwisko wychodzi tylko wg reguły publiczności w trybie osoby.
  const blokadaSieci = osobaBezTrafien || wygladaNaOsobe(tekst);
  if (!blokadaSieci && czyDoSieci(normalizuj(tekst), m.poza_danymi, m.uzyte.length)) {
    let ileSiec;
    try { ileSiec = await uzyteSiecDzis(adm, ath.id, dzis); } catch { return odp(503, { blad: "limity" }); }
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
});
