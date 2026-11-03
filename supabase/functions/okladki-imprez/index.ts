// OKLADKI-IMPREZ — KALENDARZ etapy 2–3 (Filip 3.11 02:31): okładki imprez z maszyny wyników.
//   POST {rodzaj:'noc', ile?}                     + x-push-secret — cron 02:40 UTC: do 30 okładek/dobę dla imprez bez okładki, najbliższe
//                                                   terminy najpierw; lista imprez z F6 przez KONTO SERWISOWE (sekrety F6_KONTO_EMAIL /
//                                                   F6_KONTO_HASLO; hasło nigdy w logu); prompt WYŁĄCZNIE z danych serwera (typ/miejsce/pora roku).
//   POST {rodzaj:'trener-gemini', klucz}          + JWT trenera — nowa wersja Gemini dla imprezy (klucz bez roku); dane do promptu z bazy
//                                                   (imprezy_okladki) albo z F6 po kluczu, NIGDY z żądania; limit 20/dobę (razem z race-image).
//   POST {rodzaj:'wlasne', klucz|race_id, dane_b64} + JWT trenera — własne zdjęcie (JPEG/PNG/WebP po bajtach, ≤ 3 MB); impreza → imprezy_okladki
//                                                   (nadpisuje automat), nasze zawody → races.cover_url. Bez Gemini, koszt 0.
// Każda operacja → okladki_log (rodzaj, klucz/race_id, koszt_usd, kto, ok/błąd) = limity dzienne + raport kosztu. Zapis kluczem service
// WYŁĄCZNIE: okladki_log, imprezy_okladki, races.cover_url, bucket race-covers. verify_jwt = false (cron bez sesji) — trybom trenera bramkę
// robi wymagajUsera + coaches, trybowi nocnemu sekret (brak sekretu w env = odmowa, nie furtka).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wymagajUsera } from "../_shared/wymagaj-usera.mjs";
import "../../../js/tekst.mjs";
import "../../../js/kalendarz-lista.mjs";
import { generujGemini, promptOkladki, przeskaluj, SZEROKA_1200, DOZWOLONE_MIME, sprawdzWlasneZdjecie, obiektImprezy, zBase64, wgrajOkladke, KOSZT_USD, przytnij } from "../_shared/okladka-gemini.mjs";

const K = (globalThis as any).BM_KALENDARZ;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI = Deno.env.get("GEMINI_API_KEY") || "";
const SEKRET = Deno.env.get("PUSH_HOOK_SECRET");
const F6_EMAIL = Deno.env.get("F6_KONTO_EMAIL") || "", F6_HASLO = Deno.env.get("F6_KONTO_HASLO") || "";
const PUBLISHABLE = "sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY";   // ten sam literał co wymagaj-usera.mjs
const F6_URL = "https://api.biegamy.run";
const LIMIT_AUTOMAT = 30, LIMIT_TRENER = 20, DNI_OKNA = 365, LIMIT_F6 = 300;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const J = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const RE_KLUCZ = /^[a-z]{1,120}\|[a-z]{0,60}$/;   // klucz bez roku: kluczNazwy|kluczMiasta (same litery)

type Impreza = { klucz: string; nazwa: string; miasto: string | null; data: string; dystanse: number[]; typ: string };

function dzisWaw() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function poczatekDniaWaw(dzis: string) {
  const w = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Warsaw", hour: "numeric", hour12: false }).format(new Date(dzis + "T12:00:00Z")));
  return new Date(Date.parse(dzis + "T00:00:00Z") - (w - 12) * 3600000).toISOString();
}
async function dzisWLogu(sb: any, rodzaje: string[]) {
  const { count } = await sb.from("okladki_log").select("id", { count: "exact", head: true }).in("rodzaj", rodzaje).eq("ok", true).gte("kiedy", poczatekDniaWaw(dzisWaw()));
  return count || 0;
}
async function log(sb: any, w: { rodzaj: string; klucz?: string | null; race_id?: string | null; koszt_usd?: number; kto?: string | null; ok?: boolean; blad?: string | null }) {
  await sb.from("okladki_log").insert({ rodzaj: w.rodzaj, klucz: w.klucz || null, race_id: w.race_id || null, koszt_usd: w.koszt_usd || 0, kto: w.kto || null, ok: w.ok !== false, blad: w.blad ? String(w.blad).slice(0, 300) : null });
}
async function zapiszOkladkeImprezy(sb: any, e: { klucz: string; url: string; typ: string; nazwa: string; miasto: string | null; zrodlo: string }) {
  const { error } = await sb.from("imprezy_okladki").upsert({ klucz: e.klucz, url: e.url, typ: e.typ, nazwa: przytnij(e.nazwa, 140), miasto: e.miasto ? przytnij(e.miasto, 60) : null, wygenerowano_at: new Date().toISOString(), zrodlo: e.zrodlo }, { onConflict: "klucz" });
  if (error) throw new Error("imprezy_okladki: " + error.message);
}

/* F6 przez konto serwisowe: logowanie kluczem publicznym (hasło tylko w pamięci), upcoming_races od dziś na rok, ≤ 300 */
async function imprezyZF6(): Promise<Impreza[]> {
  if (!F6_EMAIL || !F6_HASLO) throw new Error("brak konta F6 (F6_KONTO_EMAIL/F6_KONTO_HASLO)");
  const anon = createClient(SB_URL, PUBLISHABLE, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: F6_EMAIL, password: F6_HASLO });
  if (error || !data.session) throw new Error("logowanie konta F6 nieudane");
  const od = dzisWaw(), doD = new Date(Date.parse(od + "T12:00:00Z") + DNI_OKNA * 86400000).toISOString().slice(0, 10);
  const r = await fetch(`${F6_URL}/rpc/upcoming_races`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ p_from: od, p_to: doD, lim: LIMIT_F6 }) });
  try { await anon.auth.signOut(); } catch { /* sesja i tak nietrwała */ }
  if (!r.ok) throw new Error("F6 upcoming_races " + r.status);
  const rows = await r.json();
  const dyst = (v: unknown) => (Array.isArray(v) ? v : String(v || "").split(/[;,|]/)).map((x) => Number(String(x).replace(",", ".").replace(/[^\d.]/g, ""))).filter((x) => x > 0).slice(0, 6);
  const out: Impreza[] = [];
  for (const x of Array.isArray(rows) ? rows : []) {
    const nazwa = przytnij(x.nazwa || x.name, 140), data = String(x.data || x.event_date || "").slice(0, 10), miasto = x.miejscowosc || x.city || null;
    if (!nazwa || !/^\d{4}-\d{2}-\d{2}$/.test(data) || x.odwolane === true || x.dokladnosc_daty === "miesiac") continue;
    const d = dyst(x.dystanse != null ? x.dystanse : x.distances);
    const klucz = K.kluczBezRoku(nazwa, miasto);
    if (!RE_KLUCZ.test(klucz) || klucz.startsWith("|")) continue;
    out.push({ klucz, nazwa, miasto: miasto && miasto !== "Polska" ? przytnij(miasto, 60) : null, data, dystanse: d, typ: K.typImprezy(nazwa, d) });
  }
  out.sort((a, b) => (a.data < b.data ? -1 : 1));
  const widziane = new Set<string>();
  return out.filter((e) => (widziane.has(e.klucz) ? false : (widziane.add(e.klucz), true)));   // jedna (najbliższa) edycja na klucz
}

async function wygenerujIZapisz(sb: any, e: Impreza, rodzaj: "automat" | "trener-gemini", kto: string | null) {
  if (!GEMINI) throw new Error("brak klucza Gemini");
  const surowy = await generujGemini({ klucz: GEMINI, prompt: promptOkladki(e) });
  if (!surowy) throw new Error("odpowiedź bez obrazu");
  let obraz: { bajty: Uint8Array; mime: string } = surowy;
  try { obraz = przeskaluj(obraz, SZEROKA_1200); } catch { /* oryginał */ }
  if (!DOZWOLONE_MIME.has(obraz.mime)) throw new Error("nieobsługiwany typ obrazu");
  const url = await wgrajOkladke(sb, await obiektImprezy(e.klucz), obraz);
  await zapiszOkladkeImprezy(sb, { klucz: e.klucz, url, typ: e.typ, nazwa: e.nazwa, miasto: e.miasto, zrodlo: rodzaj === "automat" ? "gemini-nano-banana-2.1" : "trener-gemini" });
  await log(sb, { rodzaj, klucz: e.klucz, koszt_usd: KOSZT_USD, kto });
  return url;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return J(405, { blad: "tylko POST" });
  let body: { rodzaj?: string; klucz?: string; race_id?: string; dane_b64?: string; ile?: number } = {};
  try { body = await req.json(); } catch { return J(400, { blad: "zły JSON" }); }
  const sb = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
  const rodzaj = String(body.rodzaj || "");

  // ── NOC: cron z sekretem ──
  if (rodzaj === "noc") {
    if (!SEKRET || (req.headers.get("x-push-secret") || "") !== SEKRET) return J(401, { ok: false, error: "unauthorized" });
    const raport = { zrobione: 0, pominiete: 0, koszt_usd: 0, bledy: [] as string[] };
    let lista: Impreza[];
    try { lista = await imprezyZF6(); } catch (e) { await log(sb, { rodzaj: "automat", ok: false, blad: "lista: " + (e as Error).message }); return J(502, { ok: false, blad: (e as Error).message }); }
    const { data: sa } = await sb.from("imprezy_okladki").select("klucz");
    const jest = new Set((sa || []).map((x: { klucz: string }) => x.klucz));
    const budzet = Math.max(0, Math.min(Number(body.ile) || LIMIT_AUTOMAT, LIMIT_AUTOMAT - (await dzisWLogu(sb, ["automat"]))));
    for (const e of lista) {
      if (raport.zrobione >= budzet) { raport.pominiete++; continue; }
      if (jest.has(e.klucz)) continue;
      try { await wygenerujIZapisz(sb, e, "automat", null); raport.zrobione++; raport.koszt_usd += KOSZT_USD; }
      catch (err) { raport.bledy.push(`${e.klucz}: ${String((err as Error).message).slice(0, 120)}`); await log(sb, { rodzaj: "automat", klucz: e.klucz, ok: false, blad: (err as Error).message }); }
    }
    raport.koszt_usd = Math.round(raport.koszt_usd * 1000) / 1000;
    return J(200, { ok: true, ...raport, imprez: lista.length, w_bazie: jest.size, budzet });
  }

  // ── TRENER: JWT + coaches ──
  const user = await wymagajUsera(req);
  if (!user) return J(401, { blad: "brak sesji" });
  const { data: trener } = await sb.from("coaches").select("id").eq("id", user.id).maybeSingle();
  if (!trener) return J(403, { blad: "tylko trener" });

  if (rodzaj === "trener-gemini") {
    const klucz = String(body.klucz || "");
    if (!RE_KLUCZ.test(klucz)) return J(400, { blad: "klucz" });
    if ((await dzisWLogu(sb, ["trener-gemini", "race-gemini"])) >= LIMIT_TRENER) return J(429, { blad: "limit", limit: LIMIT_TRENER });
    // dane do promptu: z bazy (okładka automatu) albo z F6 po kluczu — nigdy z żądania
    const { data: w } = await sb.from("imprezy_okladki").select("klucz,nazwa,miasto,typ").eq("klucz", klucz).maybeSingle();
    let e: Impreza | null = w ? { klucz, nazwa: w.nazwa, miasto: w.miasto, data: dzisWaw(), dystanse: [], typ: w.typ } : null;
    if (!e) { try { e = (await imprezyZF6()).find((x) => x.klucz === klucz) || null; } catch (err) { return J(502, { blad: (err as Error).message }); } }
    if (!e) return J(404, { blad: "nie znam tej imprezy" });
    try { const url = await wygenerujIZapisz(sb, e, "trener-gemini", user.id); return J(200, { url, klucz }); }
    catch (err) { await log(sb, { rodzaj: "trener-gemini", klucz, kto: user.id, ok: false, blad: (err as Error).message }); return J(502, { blad: "generowanie nieudane" }); }
  }

  if (rodzaj === "wlasne") {
    const bajty = zBase64(body.dane_b64);
    const spr = bajty ? sprawdzWlasneZdjecie(bajty) : { blad: "zły plik" };
    if ("blad" in spr) return J(400, { blad: spr.blad });
    let obraz = { bajty: spr.bajty, mime: spr.mime };
    try { obraz = przeskaluj(obraz, SZEROKA_1200); } catch { /* oryginał */ }
    const raceId = typeof body.race_id === "string" ? body.race_id : "";
    if (raceId) {
      if (!/^[A-Za-z0-9-]{1,64}$/.test(raceId)) return J(400, { blad: "race_id" });
      const { data: race } = await sb.from("races").select("id,status").eq("id", raceId).maybeSingle();
      if (!race) return J(404, { blad: "brak zawodów" });
      try {
        const url = await wgrajOkladke(sb, `race-${raceId}`, obraz);
        const { error } = await sb.from("races").update({ cover_url: url }).eq("id", raceId);
        if (error) throw new Error("zapis cover_url");
        await log(sb, { rodzaj: "race-wlasne", race_id: raceId, kto: user.id });
        return J(200, { url, race_id: raceId, cover_url: url });
      } catch (err) { await log(sb, { rodzaj: "race-wlasne", race_id: raceId, kto: user.id, ok: false, blad: (err as Error).message }); return J(500, { blad: "zapis" }); }
    }
    const klucz = String(body.klucz || "");
    if (!RE_KLUCZ.test(klucz)) return J(400, { blad: "klucz" });
    const { data: w } = await sb.from("imprezy_okladki").select("klucz,nazwa,miasto,typ").eq("klucz", klucz).maybeSingle();
    try {
      const url = await wgrajOkladke(sb, await obiektImprezy(klucz), obraz);
      await zapiszOkladkeImprezy(sb, { klucz, url, typ: w?.typ || "ulica", nazwa: w?.nazwa || klucz.split("|")[0], miasto: w?.miasto || null, zrodlo: "trener-wlasne" });
      await log(sb, { rodzaj: "trener-wlasne", klucz, kto: user.id });
      return J(200, { url, klucz });
    } catch (err) { await log(sb, { rodzaj: "trener-wlasne", klucz, kto: user.id, ok: false, blad: (err as Error).message }); return J(500, { blad: "zapis" }); }
  }
  return J(400, { blad: "rodzaj" });
});
