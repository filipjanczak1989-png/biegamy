// INTERVALS-STATUS — status synchronizacji zegarka i wskazanie OGNIWA (Filip 3.11 11:53). POST z JWT:
//   { athlete_id }   — własny status (zawodnik) albo status podopiecznego (trener, athletes.coach_id = user);
//   { wszyscy: true } — trener: wszyscy podopieczni z intervals (≤ 60, po kolei), lista „kto ma problem i w którym ogniwie”.
// Dla każdego: poświadczenia (service, nigdy w odpowiedzi) → intervals activities z 30 dni (jedno zapytanie) → ogniwo.mjs → upsert
// intervals_status. 401 ustawia athletes.intervals_token_dead_at (jak intervals-sync), udany odczyt ją czyści. Zapis service WYŁĄCZNIE:
// intervals_status, athletes.intervals_token_dead_at. Teksty dla ludzi buduje klient (sb.js WATCH.kreatorHtml), EF oddaje tylko fakty.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ustalOgniwo, czyBlokadaGarmina, OKNO_DNI } from "./ogniwo.mjs";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = "sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY";   // publiczny (== sb.js) — literał przetrwa Disable legacy anon
const SVCKEY = Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_WSZYSCY = 60;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const J = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: CORS });
const dzisWaw = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function sprawdz(svc: any, athleteId: string) {
  const dzis = dzisWaw();
  const { data: ath } = await svc.from("athletes").select("id,intervals_athlete_id,intervals_token_dead_at").eq("id", athleteId).maybeSingle();
  const { data: cred } = await svc.from("intervals_credentials").select("api_key,access_token").eq("athlete_id", athleteId).maybeSingle();
  const polaczony = !!(ath && ath.intervals_athlete_id && cred && (cred.access_token || cred.api_key));
  let http: number | null = null, aktywnosci: unknown[] = [];
  if (polaczony) {
    const auth = cred.access_token ? "Bearer " + cred.access_token : "Basic " + btoa("API_KEY:" + cred.api_key);
    const icu = cred.access_token ? "0" : String(ath.intervals_athlete_id);
    const oldest = new Date(Date.parse(dzis + "T12:00:00Z") - OKNO_DNI * 86400000).toISOString().slice(0, 10);
    const newest = new Date(Date.parse(dzis + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
    try {
      const r = await fetch(`https://intervals.icu/api/v1/athlete/${icu}/activities?oldest=${oldest}&newest=${newest}`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(8000) });
      http = r.status;
      if (r.ok) { const j = await r.json(); aktywnosci = Array.isArray(j) ? j.map((a: Record<string, unknown>) => ({ start_date_local: a.start_date_local, start_date: a.start_date, source: a.source, device_name: a.device_name })) : []; }
    } catch { http = 0; }
  }
  const { data: ostLog } = await svc.from("training_logs").select("logged_at").eq("athlete_id", athleteId).eq("external_source", "intervals").order("logged_at", { ascending: false }).limit(1).maybeSingle();
  const ostBiegamy = ostLog?.logged_at ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ostLog.logged_at)) : null;
  let w = ustalOgniwo({ polaczony, http, aktywnosci: aktywnosci as never[], ostBiegamy, dzis });
  /* BLOKADA GARMINA (3.11): cisza Garmina u tej osoby → sprawdź, czy to cisza ZBIOROWA (inne wiersze intervals_status) albo wymuszona
     sekretem GARMIN_BLOKADA=1 (Filip, gdy intervals ogłosi odcięcie). Wtedy 'garmin' zamiast 'zegarek'. Zdjęcie sekretu + kolejne
     sprawdzenie → wiersze wracają same. */
  if (w.ogniwo === "zegarek" && w.zrodlo === "Garmin Connect") {
    let blokada = Deno.env.get("GARMIN_BLOKADA") === "1";
    if (!blokada) { const { data: inni } = await svc.from("intervals_status").select("zrodlo,ogniwo").neq("athlete_id", athleteId).limit(500); blokada = czyBlokadaGarmina([...(inni || []), { zrodlo: w.zrodlo, ogniwo: w.ogniwo }]); }
    if (blokada) w = ustalOgniwo({ polaczony, http, aktywnosci: aktywnosci as never[], ostBiegamy, dzis, blokadaGarmina: true });
  }
  const wiersz = { athlete_id: athleteId, sprawdzono_at: new Date().toISOString(), ...w };
  await svc.from("intervals_status").upsert(wiersz, { onConflict: "athlete_id" });
  if (w.ogniwo === "token" && ath && !ath.intervals_token_dead_at) await svc.from("athletes").update({ intervals_token_dead_at: new Date().toISOString() }).eq("id", athleteId);
  if (w.ogniwo !== "token" && w.ogniwo !== "brak" && w.ogniwo !== "siec" && ath && ath.intervals_token_dead_at) await svc.from("athletes").update({ intervals_token_dead_at: null }).eq("id", athleteId);
  return wiersz;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return J(405, { ok: false, error: "tylko POST" });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const u = createClient(SB_URL, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data: { user } } = await u.auth.getUser();
  if (!user) return J(401, { ok: false, error: "unauthorized" });
  let body: { athlete_id?: unknown; wszyscy?: unknown } = {};
  try { body = await req.json(); } catch { /* pusty = własny */ }
  const svc = createClient(SB_URL, SVCKEY, { auth: { persistSession: false } });
  const { data: mojAth } = await svc.from("athletes").select("id").eq("user_id", user.id).maybeSingle();

  if (body.wszyscy === true) {
    const { data: podopieczni } = await svc.from("athletes").select("id,full_name").eq("coach_id", user.id).not("intervals_athlete_id", "is", null).limit(MAX_WSZYSCY);
    if (!podopieczni) return J(403, { ok: false, error: "tylko trener" });
    const wyniki = [];
    for (const a of podopieczni) { try { wyniki.push(await sprawdz(svc, a.id)); } catch (e) { wyniki.push({ athlete_id: a.id, ogniwo: "siec", blad: String((e as Error).message).slice(0, 80) }); } }
    return J(200, { ok: true, sprawdzono: wyniki.length, wyniki });
  }

  const athleteId = typeof body.athlete_id === "string" && /^[0-9a-f-]{36}$/.test(body.athlete_id) ? body.athlete_id : (mojAth?.id || null);
  if (!athleteId) return J(404, { ok: false, error: "athlete_not_found" });
  if (!(mojAth && mojAth.id === athleteId)) {
    const { data: pod } = await svc.from("athletes").select("id").eq("id", athleteId).eq("coach_id", user.id).maybeSingle();
    if (!pod) return J(403, { ok: false, error: "forbidden" });   // tylko własny albo podopieczny
  }
  try { return J(200, { ok: true, status: await sprawdz(svc, athleteId) }); }
  catch (e) { return J(500, { ok: false, error: String((e as Error).message).slice(0, 120) }); }
});
