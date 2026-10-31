// race-image — okładka zawodów 21:9 z Gemini (Interactions API) do bucketa race-covers.
//
// Wejście: POST { race_id, force? } z JWT trenera.
//   - bez force: gdy races.cover_url już jest, zwraca go bez generowania (approveRace i insert trenera
//     wołają fire-and-forget — drugie wywołanie nie może kosztować drugiego obrazu);
//   - force:true: przycisk „Nowa okładka” w #race-modal — ten sam prompt, nowe losowanie.
// Wyjście: { cover_url, wygenerowano }.
//
// ⚠️ cover_url ZAWSZE z ?v=: sw.js trzyma /storage/v1/object/public/ cache-first po pełnym URL-u,
//    więc nadpisany plik pod tą samą ścieżką bez nowego ?v= nie dotarłby do nikogo.
// ⚠️ Wejście NIE niesie niczego do promptu: sceneria wynika z distance_km i słów w name (SCENERIE).
//    Pola zawodów (nazwa, miasto) idą do promptu przycięte — wpisał je trener albo zawodnik w propozycji.
// ⚠️ Jeden obiekt na bieg: race-<id> BEZ rozszerzenia, contentType z odpowiedzi Gemini. Zmiana formatu
//    (png→jpg) nadpisuje ten sam obiekt zamiast zostawiać sierotę.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { wymagajUsera } from "../_shared/wymagaj-usera.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const MODEL = "gemini-nano-banana-2.1";
const BUCKET = "race-covers";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCENERIE: Record<string, string> = {
  trail: "leśna lub górska ścieżka, naturalny teren",
  park: "alejki parku miejskiego, drzewa",
  miasto: "ulice miasta, zabudowa w tle",
};

const DOZWOLONE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

function odpowiedz(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function przytnij(s: unknown, max: number) {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function dystansOpis(km: number | null) {
  if (!km) return "bieg";
  if (Math.abs(km - 42.195) < 0.3) return "maraton";
  if (Math.abs(km - 21.0975) < 0.3) return "półmaraton";
  if (km >= 50) return "bieg ultra";
  return `bieg na ${Math.round(km * 10) / 10} km`;
}

function sceneria(race: { name: string; distance_km: number | null }) {
  const n = String(race.name || "").toLowerCase();
  if (/trail|ultra|górsk|gorsk/.test(n) || (race.distance_km ?? 0) > 42.5) return "trail";
  if (/park/.test(n)) return "park";
  return "miasto";
}

function zbudujPrompt(race: { name: string; city: string | null; distance_km: number | null; date: string }) {
  const miesiac = Number(String(race.date).slice(5, 7));
  const pora = miesiac <= 2 || miesiac === 12 ? "zima" : miesiac <= 5 ? "wiosna" : miesiac <= 8 ? "lato" : "jesień";
  return [
    `Szeroka okładka wydarzenia biegowego: ${dystansOpis(race.distance_km)}`,
    race.city ? `w miejscowości ${przytnij(race.city, 60)}` : "",
    `(${przytnij(race.name, 80)}), pora roku: ${pora}.`,
    `Sceneria: ${SCENERIE[sceneria(race)]}.`,
    "Realistyczna fotografia reportażowa, naturalne światło.",
    "Biegacze w ruchu, bez rozpoznawalnych twarzy. Bez żadnego tekstu, liter, numerów startowych i logotypów.",
  ].filter(Boolean).join(" ");
}

// Kształt zmierzony 31.10.2026 (zwiad pkt 6, HTTP 200, 5,3 MB):
//   steps: [ { type: "thought", signature: "<3,7 MB>" },                       ← bez content
//            { type: "model_output", content: [ { type: "image", mime_type: "image/jpeg", data: "<base64>" } ] } ]
// Obraz 1584×672 JPEG, 1,2 MB. Kolejności kroków i pozycji obrazu w content[] NIE zakładamy:
// przechodzimy wszystkie kroki i wszystkie elementy, bierzemy pierwszy z type "image" i niepustym data.
function wyciagnijObraz(json: unknown): { bajty: Uint8Array; mime: string } | null {
  const steps = (json as { steps?: unknown })?.steps;
  if (!Array.isArray(steps)) return null;
  for (const krok of steps) {
    const content = (krok as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;
    for (const el of content) {
      const e = el as { type?: unknown; mime_type?: unknown; data?: unknown };
      if (e?.type !== "image" || typeof e.data !== "string" || !e.data) continue;
      const bin = atob(e.data);
      const bajty = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bajty[i] = bin.charCodeAt(i);
      return { bajty, mime: String(e.mime_type || "") };
    }
  }
  return null;
}

async function generuj(prompt: string) {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
      response_modalities: ["image"],
      generation_config: { image_config: { aspect_ratio: "21:9", image_size: "1K" } },
    }),
  });
  const tekst = await r.text();
  if (!r.ok) throw new Error(`gemini ${r.status}: ${tekst.slice(0, 300)}`);
  return wyciagnijObraz(JSON.parse(tekst));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return odpowiedz(405, { error: "tylko POST" });

  const user = await wymagajUsera(req);
  if (!user) return odpowiedz(401, { error: "brak sesji" });

  const { data: trener } = await sb.from("coaches").select("id").eq("id", user.id).maybeSingle();
  if (!trener) return odpowiedz(403, { error: "tylko trener" });

  let wejscie: { race_id?: unknown; force?: unknown };
  try { wejscie = await req.json(); } catch { return odpowiedz(400, { error: "zły JSON" }); }
  const raceId = typeof wejscie.race_id === "string" ? wejscie.race_id : "";
  if (!/^[A-Za-z0-9-]{1,64}$/.test(raceId)) return odpowiedz(400, { error: "race_id" });
  const force = wejscie.force === true;

  const { data: race, error: raceErr } = await sb
    .from("races")
    .select("id, name, city, distance_km, date, status, cover_url")
    .eq("id", raceId)
    .maybeSingle();
  if (raceErr) return odpowiedz(500, { error: "odczyt races" });
  if (!race) return odpowiedz(404, { error: "brak zawodów" });
  if (race.status !== "approved") return odpowiedz(409, { error: "zawody niezatwierdzone" });
  if (race.cover_url && !force) return odpowiedz(200, { cover_url: race.cover_url, wygenerowano: false });
  if (!GEMINI_API_KEY) return odpowiedz(503, { error: "brak klucza Gemini" });

  let obraz;
  try {
    obraz = await generuj(zbudujPrompt(race));
  } catch (e) {
    console.error("race-image gemini:", raceId, String(e));
    return odpowiedz(502, { error: "generowanie nieudane" });
  }
  if (!obraz) return odpowiedz(502, { error: "odpowiedź bez obrazu" });
  if (!DOZWOLONE_MIME.has(obraz.mime)) return odpowiedz(502, { error: "nieobsługiwany typ obrazu" });

  const plik = `race-${raceId}`;
  const { error: upErr } = await sb.storage.from(BUCKET)
    .upload(plik, obraz.bajty, { contentType: obraz.mime, cacheControl: "31536000", upsert: true });
  if (upErr) {
    console.error("race-image upload:", plik, upErr);
    return odpowiedz(500, { error: "zapis pliku" });
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(plik);
  const coverUrl = `${pub.publicUrl}?v=${Date.now()}`;
  const { error: updErr } = await sb.from("races").update({ cover_url: coverUrl }).eq("id", raceId);
  if (updErr) {
    console.error("race-image update:", raceId, updErr);
    return odpowiedz(500, { error: "zapis cover_url" });
  }
  return odpowiedz(200, { cover_url: coverUrl, wygenerowano: true });
});
