// AKCJA-WYPRAWA-SLAD (projekt F, komenda Filipa 4.11 — WYPRAWA B/C): ślad GPS wyprawy z intervals.icu kont wyprawy
// (akcje.wyprawa_athlete_ids) od naciśnięcia guzika do „Dotarliśmy”, zapis do akcja_wyprawa_slad (RLS: zero dostępu bezpośredniego).
// Ze śladu akcja_licznik liczy km wyprawy (sama suma, bez punktów).
// MAPA WYŁĄCZONA (Filip 9.11, wyprawa etapami, bez mapy): śladu NIE oddajemy nikomu. Każdy odczyt (GET, POST {rodzaj:'slad'}) = 410.
//   POST {rodzaj:'odswiez', slug?, athlete_id?, od?}  + x-push-secret — cron co 15 min (pg_net) i intervals-webhook po imporcie;
//                                                       `od` (YYYY-MM-DD) tylko dla akcji testowej — próba na starych aktywnościach.
// Poświadczenia intervals z intervals_credentials (service, jak intervals-activity-detail) — nigdy w odpowiedzi, nigdy w logu.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { paryLatLng, uprosc, TYPY_SLADU } from "./slad.mjs";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEKRET = Deno.env.get("PUSH_HOOK_SECRET");
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const J = (s: number, b: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", ...extra } });
const RE_SLUG = /^[a-z0-9-]{1,40}$/, RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AKTYWNOSCI = 40;

type Akcja = { id: string; slug: string; testowa: boolean; wystartowala_at: string | null; wyprawa_dotarla_at: string | null; wyprawa_athlete_ids: string[] | null; wyprawa_cel_nazwa: string | null; wyprawa_cel_km: number | null };

function naglowekIntervals(c: { access_token?: string | null; api_key?: string | null } | null) {
  if (!c) return null;
  if (c.access_token) return { auth: "Bearer " + c.access_token, icu: "0" };
  if (c.api_key) return { auth: "Basic " + btoa("API_KEY:" + c.api_key), icu: null };
  return null;
}

async function odswiez(sb: any, a: Akcja, od: string | null, tylkoAthlete: string | null) {
  const raport = { slug: a.slug, aktywnosci: 0, nowe: 0, bez_trasy: 0, bledy: [] as string[] };
  if (!a.wystartowala_at || !a.wyprawa_athlete_ids?.length) return raport;
  const odIso = od && a.testowa ? od + "T00:00:00Z" : a.wystartowala_at;
  const doIso = a.wyprawa_dotarla_at || new Date(Date.now() + 86400000).toISOString();
  const { data: istniejace } = await sb.from("akcja_wyprawa_slad").select("intervals_activity_id").eq("akcja_id", a.id);
  const jest = new Set((istniejace || []).map((r: { intervals_activity_id: string }) => r.intervals_activity_id));
  for (const athleteId of a.wyprawa_athlete_ids) {
    if (tylkoAthlete && athleteId !== tylkoAthlete) continue;
    const { data: ath } = await sb.from("athletes").select("intervals_athlete_id").eq("id", athleteId).maybeSingle();
    const { data: cred } = await sb.from("intervals_credentials").select("api_key,access_token").eq("athlete_id", athleteId).maybeSingle();
    const n = naglowekIntervals(cred);
    if (!n) { raport.bledy.push("brak poświadczeń intervals"); continue; }
    const icu = n.icu || (ath?.intervals_athlete_id ? String(ath.intervals_athlete_id) : null);
    if (!icu) { raport.bledy.push("brak id intervals"); continue; }
    let lista: Array<Record<string, unknown>> = [];
    try {
      const r = await fetch(`https://intervals.icu/api/v1/athlete/${icu}/activities?oldest=${odIso.slice(0, 10)}&newest=${doIso.slice(0, 10)}`, { headers: { Authorization: n.auth } });
      if (!r.ok) { raport.bledy.push("intervals lista " + r.status); continue; }
      lista = await r.json();
    } catch { raport.bledy.push("intervals sieć"); continue; }
    const w = (Array.isArray(lista) ? lista : []).filter((x) => TYPY_SLADU.has(String(x.type)) && x.id != null)
      .map((x) => ({ id: String(x.id), start: String(x.start_date || x.start_date_local || ""), sek: Number(x.elapsed_time || x.moving_time || 0), m: Number(x.distance || 0) }))
      .filter((x) => x.start && Date.parse(x.start) >= Date.parse(odIso) && Date.parse(x.start) <= Date.parse(doIso)).slice(0, MAX_AKTYWNOSCI);
    raport.aktywnosci += w.length;
    for (const x of w) {
      if (jest.has(x.id)) continue;
      let strumienie: Array<{ type: string; data: unknown[]; data2?: unknown[] }> = [];
      try {
        const r = await fetch(`https://intervals.icu/api/v1/activity/${x.id}/streams?types=latlng`, { headers: { Authorization: n.auth } });
        if (!r.ok) { raport.bledy.push("intervals strumień " + r.status); continue; }
        strumienie = await r.json();
      } catch { raport.bledy.push("intervals sieć (strumień)"); continue; }
      const latlng = (Array.isArray(strumienie) ? strumienie : []).find((s) => s && s.type === "latlng");
      const punkty = uprosc(paryLatLng(latlng));
      /* Świeża aktywność bez trasy może jeszcze się przeliczać: bez zapisu pustego wiersza, cron spróbuje za 15 min. Pusty wiersz byłby na stałe. */
      if (punkty.length < 2 && x.m > 0 && Date.now() - Date.parse(x.start) < 86400000) { raport.bez_trasy++; continue; }
      if (punkty.length < 2) { raport.bez_trasy++; jest.add(x.id); await sb.from("akcja_wyprawa_slad").insert({ akcja_id: a.id, athlete_id: athleteId, intervals_activity_id: x.id, start_at: new Date(x.start).toISOString(), koniec_at: new Date(Date.parse(x.start) + x.sek * 1000).toISOString(), dystans_m: Math.round(x.m), punkty: [] }); continue; }
      const { error } = await sb.from("akcja_wyprawa_slad").insert({ akcja_id: a.id, athlete_id: athleteId, intervals_activity_id: x.id, start_at: new Date(x.start).toISOString(),
        koniec_at: new Date(Date.parse(x.start) + x.sek * 1000).toISOString(), dystans_m: Math.round(punkty[punkty.length - 1][2]), punkty });
      if (error) { if (error.code !== "23505") raport.bledy.push("zapis " + error.code); continue; }
      jest.add(x.id); raport.nowe++;
    }
  }
  if (raport.bledy.length) console.error("akcja-wyprawa-slad:", a.slug, raport.bledy.join("; "));
  return raport;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: { rodzaj?: string; slug?: string; od?: string; athlete_id?: string } = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { return J(400, { blad: "zły JSON" }); } }
  /* Mapa wyłączona (9.11): ślad GPS nie wychodzi do nikogo, także bez sesji i z sesją. Zostaje tylko pobieranie do km wyprawy. */
  if (req.method !== "POST" || body.rodzaj !== "odswiez") return J(410, { blad: "mapa wyprawy wyłączona" }, { "Cache-Control": "no-store" });
  if (!SEKRET || (req.headers.get("x-push-secret") || "") !== SEKRET) return J(401, { ok: false, error: "unauthorized" });
  const slug = String(body.slug || "dla-fabianka");
  if (!RE_SLUG.test(slug)) return J(400, { blad: "slug" });
  const sb = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
  const od = typeof body.od === "string" && RE_DATA.test(body.od) ? body.od : null;
  const tylko = typeof body.athlete_id === "string" && /^[0-9a-f-]{36}$/.test(body.athlete_id) ? body.athlete_id : null;
  let q = sb.from("akcje").select("id,slug,testowa,wystartowala_at,wyprawa_dotarla_at,wyprawa_athlete_ids,wyprawa_cel_nazwa,wyprawa_cel_km").not("wystartowala_at", "is", null);
  if (body.slug) q = q.eq("slug", slug);
  const { data: akcje } = await q;
  const raporty = [];
  for (const a of (akcje || []) as Akcja[]) {
    if (tylko && !(a.wyprawa_athlete_ids || []).includes(tylko)) continue;
    raporty.push(await odswiez(sb, a, od, tylko));
  }
  return J(200, { ok: true, raporty });
});
