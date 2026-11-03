// race-image — okładka zawodów z Gemini (Interactions API) do bucketa race-covers, w dwóch wariantach:
//   21x9 → races.cover_url,      obiekt race-<id>        (lista startów, #race-modal)
//   9x16 → races.cover_9x16_url, obiekt race-<id>-9x16   (hero „Dziś” w dniu startu; kafel ma aspect-ratio 9/16)
//
// Wejście: POST { race_id, force?, wariant? = "21x9" } z JWT trenera.
//   - bez force: gdy kolumna WARIANTU już ma URL, zwraca go bez generowania (approveRace i insert trenera
//     wołają fire-and-forget — drugie wywołanie nie może kosztować drugiego obrazu); idempotencja per wariant;
//   - force:true: przycisk „Nowa okładka” w #race-modal — ten sam prompt, nowe losowanie; LIMIT 20/dobę trenera (okladki_log,
//     wspólny z okladki-imprez trener-gemini — KALENDARZ etap 3, 3.11).
// Wyjście: { wariant, url, wygenerowano } + cover_url przy 21x9 (front sprzed wariantów czyta tylko cover_url).
//
// ⚠️ cover_url ZAWSZE z ?v=: sw.js trzyma /storage/v1/object/public/ cache-first po pełnym URL-u,
//    więc nadpisany plik pod tą samą ścieżką bez nowego ?v= nie dotarłby do nikogo.
// ⚠️ Wejście NIE niesie niczego do promptu: sceneria wynika z distance_km i słów w name (typ trail/park/miasto).
//    Pola zawodów (nazwa, miasto) idą do promptu przycięte — wpisał je trener albo zawodnik w propozycji.
// ⚠️ Jeden obiekt na bieg i wariant: race-<id>[-9x16] BEZ rozszerzenia, contentType z odpowiedzi Gemini. Zmiana formatu
//    (png→jpg) nadpisuje ten sam obiekt zamiast zostawiać sierotę.
// 3.11 (KALENDARZ etap 2–3): prompt, model, skalowanie i upload w _shared/okladka-gemini.mjs — jedno miejsce z okladki-imprez;
//    każde wygenerowanie → okladki_log (rodzaj 'race-gemini', koszt) — raport kosztu i limit dzienny.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { wymagajUsera } from "../_shared/wymagaj-usera.mjs";
import { generujGemini, promptOkladki, przeskaluj, wgrajOkladke, DOZWOLONE_MIME, KOSZT_USD } from "../_shared/okladka-gemini.mjs";

type Wymiar = [number, number];
const WARIANTY: Record<string, {
  aspect: string; rozmiar: string; forma: string; kolumna: "cover_url" | "cover_9x16_url"; plik: (id: string) => string;
  kompozycja: string; docelowe: (w: number, h: number) => Wymiar | null;
}> = {
  "21x9": {
    aspect: "21:9", rozmiar: "1K", forma: "Szeroka", kolumna: "cover_url", plik: (id) => `race-${id}`, kompozycja: "",
    docelowe: (w, h) => w > 1200 ? [1200, Math.round(h * 1200 / w)] : null,
  },
  // 9x16 w 2K, nie 1K: 1K w 9:16 ma 768 px szerokości (zmierzone 31.10: 768×1376), a kafel hero przy
  // ekranie 430 px ma 300 CSS px, czyli ~900 px przy DPR 3 — 1K byłby powiększany. 2K skalujemy do 1600.
  "9x16": {
    aspect: "9:16", rozmiar: "2K", forma: "Pionowa", kolumna: "cover_9x16_url", plik: (id) => `race-${id}-9x16`,
    kompozycja: "Kompozycja pionowa: biegacz w górnej lub środkowej części kadru, dolna jedna trzecia spokojna — pusta nawierzchnia, cień, bez ważnych szczegółów.",
    docelowe: (w, h) => {
      const bok = Math.max(w, h);
      return bok > 1600 ? [Math.round(w * 1600 / bok), Math.round(h * 1600 / bok)] : null;
    },
  },
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const LIMIT_TRENER = 20;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function odpowiedz(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// „las” jako SŁOWO, nie podciąg („klasyczny”, „wlasny”). Granica przez \p{L}, nie \b: w JS \b zna tylko
// [A-Za-z0-9_], więc ł/ś/ą przed „las” liczyłoby się jako granica słowa.
const LAS = /(?<!\p{L})las(u|ek|ku|ie)?(?!\p{L})/u;

function typSceny(race: { name: string; distance_km: number | null }) {
  const n = String(race.name || "").toLowerCase();
  if (/trail|ultra|górsk|gorsk|le[sś]n/.test(n) || LAS.test(n) || (race.distance_km ?? 0) > 42.5) return "trail";
  if (/park/.test(n)) return "park";
  return "miasto";
}

function poczatekDniaWaw() {
  const dzis = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const w = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Warsaw", hour: "numeric", hour12: false }).format(new Date(dzis + "T12:00:00Z")));
  return new Date(Date.parse(dzis + "T00:00:00Z") - (w - 12) * 3600000).toISOString();
}
async function log(w: { race_id: string; kto: string; ok?: boolean; blad?: string | null }) {
  try { await sb.from("okladki_log").insert({ rodzaj: "race-gemini", race_id: w.race_id, koszt_usd: w.ok === false ? 0 : KOSZT_USD, kto: w.kto, ok: w.ok !== false, blad: w.blad ? String(w.blad).slice(0, 300) : null }); }
  catch (e) { console.error("race-image okladki_log:", String(e)); }   // log to kontrola, nie warunek
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return odpowiedz(405, { error: "tylko POST" });

  const user = await wymagajUsera(req);
  if (!user) return odpowiedz(401, { error: "brak sesji" });

  const { data: trener } = await sb.from("coaches").select("id").eq("id", user.id).maybeSingle();
  if (!trener) return odpowiedz(403, { error: "tylko trener" });

  let wejscie: { race_id?: unknown; force?: unknown; wariant?: unknown };
  try { wejscie = await req.json(); } catch { return odpowiedz(400, { error: "zły JSON" }); }
  const raceId = typeof wejscie.race_id === "string" ? wejscie.race_id : "";
  if (!/^[A-Za-z0-9-]{1,64}$/.test(raceId)) return odpowiedz(400, { error: "race_id" });
  const force = wejscie.force === true;
  const wariant = wejscie.wariant == null ? "21x9" : String(wejscie.wariant);
  if (!Object.hasOwn(WARIANTY, wariant)) return odpowiedz(400, { error: "wariant", dozwolone: Object.keys(WARIANTY) });
  const wd = WARIANTY[wariant];
  const wynik = (url: string, wygenerowano: boolean) =>
    odpowiedz(200, { wariant, url, wygenerowano, ...(wariant === "21x9" ? { cover_url: url } : {}) });

  const { data: race, error: raceErr } = await sb
    .from("races")
    .select("id, name, city, distance_km, date, status, cover_url, cover_9x16_url")
    .eq("id", raceId)
    .maybeSingle();
  if (raceErr) return odpowiedz(500, { error: "odczyt races" });
  if (!race) return odpowiedz(404, { error: "brak zawodów" });
  if (race.status !== "approved") return odpowiedz(409, { error: "zawody niezatwierdzone" });
  if (race[wd.kolumna] && !force) return wynik(race[wd.kolumna], false);
  if (!GEMINI_API_KEY) return odpowiedz(503, { error: "brak klucza Gemini" });
  if (force) {   // „Nowa okładka” trenera: limit dzienny wspólny z okladki-imprez (trener-gemini)
    const { count } = await sb.from("okladki_log").select("id", { count: "exact", head: true }).in("rodzaj", ["trener-gemini", "race-gemini"]).eq("ok", true).gte("kiedy", poczatekDniaWaw());
    if ((count || 0) >= LIMIT_TRENER) return odpowiedz(429, { error: "limit", limit: LIMIT_TRENER });
  }

  let obraz;
  try {
    obraz = await generujGemini({ klucz: GEMINI_API_KEY, prompt: promptOkladki({ nazwa: race.name, miasto: race.city, dystanse: race.distance_km, data: race.date, typ: typSceny(race), forma: wd.forma, kompozycja: wd.kompozycja }), aspect: wd.aspect, rozmiar: wd.rozmiar });
  } catch (e) {
    console.error("race-image gemini:", raceId, String(e));
    await log({ race_id: raceId, kto: user.id, ok: false, blad: String(e) });
    return odpowiedz(502, { error: "generowanie nieudane" });
  }
  if (!obraz) { await log({ race_id: raceId, kto: user.id, ok: false, blad: "odpowiedź bez obrazu" }); return odpowiedz(502, { error: "odpowiedź bez obrazu" }); }
  try {
    obraz = przeskaluj(obraz, wd.docelowe);
  } catch (e) {
    console.error("race-image skalowanie (zapisuję oryginał):", raceId, String(e));
  }
  if (!DOZWOLONE_MIME.has(obraz.mime)) return odpowiedz(502, { error: "nieobsługiwany typ obrazu" });

  let coverUrl: string;
  try { coverUrl = await wgrajOkladke(sb, wd.plik(raceId), obraz); }
  catch (e) { console.error("race-image upload:", raceId, String(e)); return odpowiedz(500, { error: "zapis pliku" }); }
  const { error: updErr } = await sb.from("races").update({ [wd.kolumna]: coverUrl }).eq("id", raceId);
  if (updErr) {
    console.error("race-image update:", raceId, updErr);
    return odpowiedz(500, { error: `zapis ${wd.kolumna}` });
  }
  await log({ race_id: raceId, kto: user.id });
  return wynik(coverUrl, true);
});
