// OKIENKO 2.0 — EF okienko-v2 (docs/projekt-okienko-2-0-2026-11-03.md, OK Filipa 3.11). Wejście/wyjście IDENTYCZNE jak okienko
// (POST {tekst, ekran?, historia?} → {zdania, karty, akcja, zrodla, narzedzia, tryb, koszt_tok, chipy?}) + `wersja: "v2"` i nagłówek
// X-Okienko-Wersja. Front kieruje tu tylko konta z okienko_v2_konta (RPC okienko_wersja, js/okienko.js).
//
// Tu jest TYLKO HTTP: CORS, wymagajUsera (jedyna bramka usera, LEKCJE #20), klienci Supabase (JWT usera → RLS; service → log),
// athlete_id z sesji. Cała orkiestracja = potok.mjs (ta sama funkcja chodzi na ławce v2 z atrapami, 0 $).
// ZASADA „v2 NIE KOPIUJE” (blizna-113): router, osoba, impreza, katalog, model, sieć, strażnik — wyłącznie importy z ../okienko/.
// Zapis kluczem service WYŁĄCZNIE: okienko_v2_log (log-v2.mjs), okienko_wiedza przez RPC (baza-wiedzy.mjs) + przez moduły v1: okienko_siec_cache, okienko_znaleziska.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wymagajUsera } from "../_shared/wymagaj-usera.mjs";
import { dzisWaw } from "../okienko/narzedzia.mjs";
import { NIE_MAM } from "../okienko/straznik.mjs";
import "../../../js/akcja.mjs";
import { potok } from "./potok.mjs";
import { zapiszOdpowiedzV2, zapiszLogV2 } from "./log-v2.mjs";   // kciuki/raport (3.11): skrót odpowiedzi do wpisu logu
import { zTerminem, PrzekroczonyTermin, opisBledu, TERMIN_MS } from "../okienko/straz-http.mjs";   // AWARIA 3.11 (blizna-136)

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

/* AWARIA 3.11 (blizna-136): 19:36–19:45 każde pytanie → „Nie dam rady”, w okienko_v2_log ZERO wierszy. Cała obsługa w zTerminem + catch:
   wyjątek albo zawieszenie → wpis 'blad' (gdy znamy zawodnika), console.error do logów EF i odpowiedź Z CORS (bez CORS przeglądarka
   widzi tylko „błąd sieci”). Termin krótszy niż klient (20 s) — odpowiedź dochodzi, zanim klient się podda. */
type Stan = { athleteId: string | null; tekst: string; adm: any; T0: number };
Deno.serve(async (req) => {
  const stan: Stan = { athleteId: null, tekst: "", adm: null, T0: Date.now() };
  try { return await zTerminem(obsluz(req, stan), TERMIN_MS); }
  catch (e) {
    const czas = e instanceof PrzekroczonyTermin;
    const powod = (czas ? "termin EF: " : "wyjątek EF: ") + opisBledu(e);
    console.error("okienko-v2:", powod);
    if (stan.athleteId && stan.adm) {
      try { await zapiszLogV2(stan.adm, { athlete_id: stan.athleteId, tekst: stan.tekst, tryb: "blad", ok: false, powod_odrzucenia: powod, ms: Date.now() - stan.T0 }); } catch { /* best-effort */ }
    }
    return odp(czas ? 504 : 500, { blad: czas ? "czas" : "wyjątek" });
  }
});

async function obsluz(req: Request, stan: Stan): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return odp(405, { blad: "tylko POST" });
  const T0 = stan.T0;
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
  if (!ath) return odp(200, { zdania: [NIE_MAM], karty: [], akcja: null, zrodla: [], narzedzia: [], tryb: "router", koszt_tok: { we: 0, wy: 0 } });
  stan.athleteId = ath.id; stan.tekst = tekst; stan.adm = adm;

  const teraz = new Date();
  /* Praca po wysłaniu odpowiedzi (kandydat do bazy wiedzy, przepisanie): tylko gdy środowisko to obsługuje; bez EdgeRuntime kandydat zapisuje się surowy i szybko, odpowiedź nigdy nie czeka na przepisanie */
  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  const wTle = er && typeof er.waitUntil === "function" ? (p: Promise<unknown>) => er.waitUntil!(p) : null;
  const w = await potok({ tekst, historia: Array.isArray(body.historia) ? body.historia : [], ekran: body.ekran, athleteId: ath.id, sb, adm, jwt,
    dzis: dzisWaw(teraz), teraz, gemini: GEMINI, budzet: BUDZET, fetchFn: fetch, T0, wTle });
  const b = w.body as { log_id?: number; zdania?: string[] };
  if (w.status === 200 && b && b.log_id && Array.isArray(b.zdania) && b.zdania.length) { try { await zapiszOdpowiedzV2(adm, b.log_id, b.zdania); } catch { /* best-effort */ } }
  return odp(w.status, w.body);
}
