// AKCJA-WYPRAWA-SLAD (projekt F, komenda Filipa 4.11 — WYPRAWA B/C): ślad GPS wyprawy z intervals.icu kont wyprawy
// (akcje.wyprawa_athlete_ids) od naciśnięcia guzika do „Dotarliśmy”, zapis do akcja_wyprawa_slad (RLS: zero dostępu bezpośredniego),
// odczyt WYŁĄCZNIE przez tę EF i WYŁĄCZNIE po starcie, zawsze po strefach prywatności (slad.mjs: 2 000 m od startu na zawsze,
// 2 000 m przed/po przerwie > 3 h, 500 m końcówek dopóki trwa). Nazwa celu tylko po dotarciu (jak akcja_licznik).
//   POST {rodzaj:'odswiez', slug?, athlete_id?, od?}  + x-push-secret — cron co 15 min (pg_net) i intervals-webhook po imporcie;
//                                                       `od` (YYYY-MM-DD) tylko dla akcji testowej — próba na starych aktywnościach;
//   GET ?slug=dla-fabianka  albo POST {rodzaj:'slad', slug} — publiczne (mapa-wyprawy.html, bez sesji); przed startem {start:false}.
// Poświadczenia intervals z intervals_credentials (service, jak intervals-activity-detail) — nigdy w odpowiedzi, nigdy w logu.
// Surowych punktów NIE oddajemy nikomu: klient dostaje tylko segmenty po ukryciu stref.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { uprosc, ukryj, TYPY_SLADU } from "./slad.mjs";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEKRET = Deno.env.get("PUSH_HOOK_SECRET");
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-secret", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const J = (s: number, b: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", ...extra } });
const RE_SLUG = /^[a-z0-9-]{1,40}$/, RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AKTYWNOSCI = 40;

type Akcja = { id: string; slug: string; testowa: boolean; wystartowala_at: string | null; wyprawa_dotarla_at: string | null; wyprawa_athlete_ids: string[] | null; wyprawa_cel_nazwa: string | null; wyprawa_cel_km: number | null };
type Wiersz = { intervals_activity_id: string; start_at: string; koniec_at: string; punkty: number[][]; pobrano_at: string };

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
      let strumienie: Array<{ type: string; data: unknown[] }> = [];
      try {
        const r = await fetch(`https://intervals.icu/api/v1/activity/${x.id}/streams?types=latlng`, { headers: { Authorization: n.auth } });
        if (!r.ok) { raport.bledy.push("intervals strumień " + r.status); continue; }
        strumienie = await r.json();
      } catch { raport.bledy.push("intervals sieć (strumień)"); continue; }
      const latlng = (Array.isArray(strumienie) ? strumienie : []).find((s) => s && s.type === "latlng");
      const punkty = uprosc((latlng?.data as number[][]) || []);
      if (punkty.length < 2) { raport.bez_trasy++; jest.add(x.id); await sb.from("akcja_wyprawa_slad").insert({ akcja_id: a.id, athlete_id: athleteId, intervals_activity_id: x.id, start_at: new Date(x.start).toISOString(), koniec_at: new Date(Date.parse(x.start) + x.sek * 1000).toISOString(), dystans_m: Math.round(x.m), punkty: [] }); continue; }
      const { error } = await sb.from("akcja_wyprawa_slad").insert({ akcja_id: a.id, athlete_id: athleteId, intervals_activity_id: x.id, start_at: new Date(x.start).toISOString(),
        koniec_at: new Date(Date.parse(x.start) + x.sek * 1000).toISOString(), dystans_m: Math.round(punkty[punkty.length - 1][2]), punkty });
      if (error) { if (error.code !== "23505") raport.bledy.push("zapis " + error.code); continue; }
      jest.add(x.id); raport.nowe++;
    }
  }
  return raport;
}

async function slad(sb: any, a: Akcja) {
  if (!a.wystartowala_at || !a.wyprawa_athlete_ids?.length) return { start: false, trwa: false, segmenty: [] };
  const { data } = await sb.from("akcja_wyprawa_slad").select("intervals_activity_id,start_at,koniec_at,punkty,pobrano_at").eq("akcja_id", a.id).order("start_at", { ascending: true });
  const wiersze = ((data || []) as Wiersz[]).filter((r) => Array.isArray(r.punkty) && r.punkty.length > 1);
  const dotarla = !!a.wyprawa_dotarla_at;
  const u = ukryj(wiersze.map((r) => ({ start_at: r.start_at, koniec_at: r.koniec_at, punkty: r.punkty })), { dotarla });
  const ost = (data || []).reduce((m: string | null, r: Wiersz) => (!m || r.pobrano_at > m ? r.pobrano_at : m), null);
  return { start: true, trwa: !dotarla, dotarla_at: a.wyprawa_dotarla_at, ostatnia_aktualizacja: ost, km: Math.round(u.dlugosc_m / 100) / 10,
    segmenty: u.segmenty, cel: dotarla ? { nazwa: a.wyprawa_cel_nazwa, pozycja: u.ostatni, km: a.wyprawa_cel_km } : null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
  const url = new URL(req.url);
  let body: { rodzaj?: string; slug?: string; od?: string; athlete_id?: string } = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { return J(400, { blad: "zły JSON" }); } }
  const rodzaj = req.method === "GET" ? "slad" : String(body.rodzaj || "slad");
  const slug = String(req.method === "GET" ? url.searchParams.get("slug") || "dla-fabianka" : body.slug || "dla-fabianka");
  if (!RE_SLUG.test(slug)) return J(400, { blad: "slug" });

  if (rodzaj === "odswiez") {
    if (!SEKRET || (req.headers.get("x-push-secret") || "") !== SEKRET) return J(401, { ok: false, error: "unauthorized" });
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
  }
  if (rodzaj !== "slad") return J(400, { blad: "rodzaj" });
  const { data: a } = await sb.from("akcje").select("id,slug,testowa,wystartowala_at,wyprawa_dotarla_at,wyprawa_athlete_ids,wyprawa_cel_nazwa,wyprawa_cel_km").eq("slug", slug).maybeSingle();
  if (!a) return J(404, { blad: "brak akcji" });
  return J(200, await slad(sb, a as Akcja), { "Cache-Control": "public, max-age=60" });
});
