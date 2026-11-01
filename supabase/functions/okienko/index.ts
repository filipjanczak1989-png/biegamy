// okienko — „Zapytaj" (M1). Wejście POST {tekst, ekran?, historia?} z JWT sesji. Wyjście wg M1-okienko-wykonanie.md pkt 1:
// {zdania, karty, akcja, zrodla, narzedzia, tryb, koszt_tok}. Kolejność:
//   1) wymagajUsera (JEDYNA bramka usera dla EF z frontu, LEKCJE #20) → 401;
//   2) klient Supabase z JWT użytkownika (RLS); athlete_id z sesji (athletes.user_id), NIE od klienta/modelu;
//   3) router bez modelu (0 tokenów, nie liczy się do limitu) → narzędzie / nawigacja;
//   4) brak dopasowania → limity (60/dobę, budżet miesięczny) → model (2 kroki) → strażnik cyfr → log → odpowiedź.
// „dzis" liczy EF w Europe/Warsaw — pole `dzis` z klienta ignorowane. Zapis WYŁĄCZNIE do okienko_log kluczem service_role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wymagajUsera } from "../_shared/wymagaj-usera.mjs";
import { waliduj, wykonaj, nawigacja, dzisWaw } from "./narzedzia.mjs";
import { dopasuj } from "./router.mjs";
import { zWyniku } from "./odpowiedz.mjs";
import { zapytajModel, BladModelu } from "./model.mjs";
import { sprawdz } from "./straznik.mjs";
import { sprawdzLimity, zapiszLog } from "./limity.mjs";

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
    try { wynik = await wykonaj(sb, ath.id, traf.narzedzie, w.args, teraz); } catch { return odp(503, { blad: "narzędzie" }); }
    const { zdania, karty } = zWyniku(traf.narzedzie, wynik, w.args);
    await zapiszLog(adm, { athlete_id: ath.id, tekst, narzedzia: [traf.narzedzie], tryb: "router" });
    return odp(200, { ...pusto("router"), zdania, karty, akcja: nawigacja([traf.narzedzie]), narzedzia: [traf.narzedzie] });
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
    m = await zapytajModel({ fetchFn: fetch, klucz: GEMINI, sb, athleteId: ath.id, tekst, historia: body.historia as never, ekran: body.ekran, dzis, teraz });
  } catch (e) {
    const modelu = e instanceof BladModelu;
    await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "blad", ok: false, powod_odrzucenia: (modelu ? "model: " : "narzędzie: ") + String((e as Error).message).slice(0, 120) });
    return odp(modelu ? 502 : 503, { blad: modelu ? "model" : "narzędzie" });
  }
  const karty = m.karty_z.flatMap((n: string) => { const u = m.uzyte.find((x: { nazwa: string }) => x.nazwa === n); return u ? zWyniku(n, u.wynik, u.args).karty : []; });
  const s = sprawdz(m.zdania, karty.length, m.uzyte.map((u: { wynik: unknown }) => u.wynik));
  const nazwy: string[] = m.uzyte.map((u: { nazwa: string }) => u.nazwa);
  await zapiszLog(adm, { athlete_id: ath.id, tekst, narzedzia: nazwy, tryb: "flash", tok_we: m.tok.we, tok_wy: m.tok.wy,
    ok: s.odrzucone.length === 0, powod_odrzucenia: s.odrzucone.length ? s.odrzucone.map((o: { liczba: string; zdanie: string }) => `liczba ${o.liczba}: ${o.zdanie}`).join(" | ").slice(0, 500) : null });
  return odp(200, { zdania: s.zdania, karty, akcja: nawigacja(nazwy), zrodla: [], narzedzia: nazwy, tryb: "flash", koszt_tok: m.tok });
});
