// OKIENKO-RAPORT-DANE (Filip 3.11, „nocny automat BEZ service_role w GitHubie”): oddaje WYŁĄCZNIE dane do raportu nocy z jednej doby —
// zanonimizowane PO STRONIE SERWERA (../_shared/anonimizuj.mjs), bez athlete_id (pseudonim „osoba #n” na jedno wywołanie), tylko odczyt,
// limit wierszy. verify_jwt OFF; nagłówek x-raport-secret musi być równy sekretowi RAPORT_SECRET (Supabase secrets); bez sekretu → 401.
// Klucz service ŻYJE TYLKO TU (env EF) — GitHub Actions dostaje sekret raportu, nie klucz do bazy (blizna-125: w .github/ nie ma service_role).
// Zapis: ŻADEN (same SELECT) — blizna-125 skanuje ten plik po insert/update/upsert/delete.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { anonimizuj } from "../_shared/anonimizuj.mjs";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVCKEY = Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEKRET = Deno.env.get("RAPORT_SECRET") || "";
const MAX_WIERSZY = 500;
const J = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const KOL_V2 = "id,kiedy,tekst,narzedzia,tryb,intencja,pewnosc,ok,powod_odrzucenia,ms,samosprawdzenie,ocena,komentarz,odpowiedz,tok_we,tok_wy,zapytania_sieci,athlete_id";
const KOL_V1 = "id,kiedy,tekst,narzedzia,tryb,ok,powod_odrzucenia,tok_we,tok_wy,athlete_id";

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") return J(405, { ok: false, error: "tylko POST/GET" });
  if (!SEKRET || (req.headers.get("x-raport-secret") || "") !== SEKRET) return J(401, { ok: false, error: "unauthorized" });
  let dzien = "";
  try { const b = req.method === "POST" ? await req.json() : {}; dzien = typeof b.dzien === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.dzien) ? b.dzien : ""; } catch { /* brak ciała = dziś */ }
  if (!dzien) dzien = new Date().toISOString().slice(0, 10);
  const od = new Date(Date.parse(dzien + "T00:00:00Z") - 86400000).toISOString(), doD = dzien + "T00:00:00Z";   // wczorajsza doba (UTC)

  const svc = createClient(SB_URL, SVCKEY, { auth: { persistSession: false } });
  const [v2, v1] = await Promise.all([
    svc.from("okienko_v2_log").select(KOL_V2).gte("kiedy", od).lt("kiedy", doD).order("kiedy", { ascending: true }).limit(MAX_WIERSZY),
    svc.from("okienko_log").select(KOL_V1).gte("kiedy", od).lt("kiedy", doD).order("kiedy", { ascending: true }).limit(MAX_WIERSZY),
  ]);
  if (v2.error || v1.error) return J(500, { ok: false, error: "odczyt" });

  const osoby = new Map<string, string>();   // athlete_id → „osoba #n” — mapa żyje tylko w tym wywołaniu, nie wychodzi z EF
  const ps = (id: string) => { if (!osoby.has(id)) osoby.set(id, "osoba #" + (osoby.size + 1)); return osoby.get(id)!; };
  // deno-lint-ignore no-explicit-any
  const n = (w: any, wersja: string) => ({ wersja, id: w.id, kiedy: w.kiedy, osoba: ps(w.athlete_id), pytanie: anonimizuj(w.tekst), narzedzia: w.narzedzia || [], tryb: w.tryb,
    intencja: w.intencja ?? null, pewnosc: w.pewnosc ?? null, ok: w.ok, powod: w.powod_odrzucenia ? anonimizuj(w.powod_odrzucenia) : null, ms: w.ms ?? null,
    samosprawdzenie: w.samosprawdzenie ?? null, ocena: w.ocena ?? null, komentarz: w.komentarz ? anonimizuj(w.komentarz) : null, odpowiedz: w.odpowiedz ? anonimizuj(w.odpowiedz) : null,
    tok_we: w.tok_we || 0, tok_wy: w.tok_wy || 0, zapytania_sieci: w.zapytania_sieci || 0 });
  const wpisy = [...(v2.data || []).map((w) => n(w, "v2")), ...(v1.data || []).map((w) => n(w, "v1"))].sort((a, b) => (a.kiedy < b.kiedy ? -1 : 1));
  return J(200, { ok: true, od, do: doD, liczby: { v2: (v2.data || []).length, v1: (v1.data || []).length, osoby: osoby.size, uciete: (v2.data || []).length >= MAX_WIERSZY || (v1.data || []).length >= MAX_WIERSZY }, wpisy });
});
