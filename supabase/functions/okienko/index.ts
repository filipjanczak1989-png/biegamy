// okienko — „Zapytaj" (M1). Krok 2: router bez modelu. Wejście POST {tekst, ekran?, tz?, dzis?} z JWT sesji.
// Wyjście wg M1-okienko-wykonanie.md pkt 1: {zdania, karty, akcja, zrodla, narzedzia, tryb, koszt_tok}.
// - wymagajUsera (JEDYNA bramka usera dla EF z frontu, LEKCJE #20) → 401;
// - klient Supabase z JWT użytkownika: RLS jak w aplikacji; athlete_id z sesji (athletes.user_id), NIE od klienta/modelu;
// - narzędzia tylko do odczytu (narzedzia.mjs); „dzis" liczy EF w Europe/Warsaw — pole `dzis` z klienta ignorowane;
// - brak dopasowania routera → 200 {tryb:"router", dopasowanie:false} (krok 3: model). Router NIE liczy się do limitu.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wymagajUsera } from "../_shared/wymagaj-usera.mjs";
import { waliduj, wykonaj, nawigacja, dzisWaw } from "./narzedzia.mjs";
import { dopasuj } from "./router.mjs";
import { zWyniku } from "./odpowiedz.mjs";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const PUBLISHABLE = "sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY";   // ten sam literał co wymagaj-usera.mjs (patrz tam)
const MAX_TEKST = 300;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const odp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return odp(405, { blad: "tylko POST" });
  const user = await wymagajUsera(req);
  if (!user) return odp(401, { blad: "brak sesji" });

  let body: { tekst?: unknown } = {};
  try { body = await req.json(); } catch { return odp(400, { blad: "zły JSON" }); }
  const tekst = String(body.tekst ?? "").slice(0, MAX_TEKST).trim();
  if (!tekst) return odp(400, { blad: "pusty tekst" });

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const sb = createClient(SB_URL, PUBLISHABLE, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data: ath } = await sb.from("athletes").select("id").eq("user_id", user.id).maybeSingle();
  if (!ath) return odp(200, { zdania: ["Nie mam tego w Twoich danych."], karty: [], akcja: null, zrodla: [], narzedzia: [], tryb: "router", koszt_tok: { we: 0, wy: 0 } });

  const teraz = new Date();
  const dzis = dzisWaw(teraz);
  const traf = dopasuj(tekst, dzis);
  if (!traf) return odp(200, { zdania: [], karty: [], akcja: null, zrodla: [], narzedzia: [], tryb: "router", dopasowanie: false, koszt_tok: { we: 0, wy: 0 } });
  if ("nawiguj" in traf) return odp(200, { zdania: [], karty: [], akcja: { nawiguj: traf.nawiguj }, zrodla: [], narzedzia: [], tryb: "router", koszt_tok: { we: 0, wy: 0 } });

  const w = waliduj(traf.narzedzie, traf.args);
  if (!w.ok) return odp(400, { blad: w.blad });
  let wynik;
  try { wynik = await wykonaj(sb, ath.id, traf.narzedzie, w.args, teraz); }
  catch { return odp(503, { blad: "narzędzie" }); }
  const { zdania, karty } = zWyniku(traf.narzedzie, wynik, w.args);
  return odp(200, { zdania, karty, akcja: nawigacja([traf.narzedzie]), zrodla: [], narzedzia: [traf.narzedzie], tryb: "router", koszt_tok: { we: 0, wy: 0 } });
});
