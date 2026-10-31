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

// Przeskalowanie do SZEROKOSC_DOCELOWA px i JPEG q80 — ten sam wąski import co share-card (tylko
// jpeg.wasm 90 KB, nie mod.ts z 1,7 MB wasm-ów); jeden moduł dekoduje i koduje.
// Pomiar 31.10.2026 na okładce z Gemini 1584×672: 1186 KB → 230 KB (−81%), dekod ~140 ms +
// bilinear ~75 ms + enkod ~90 ms ≈ 0,3 s przy generowaniu trwającym kilkanaście sekund.
// Skalowanie dekodera (DCT 1/2, 1/4, 1/8) NIE wystarcza: połowa z 1584 to 792 < 1200 — stąd bilinear w JS.
// PNG/WebP i JPEG inny niż 1 lub 3 kanały (CMYK) → oryginał bez skalowania: obsługa wymagałaby drugiego wasm-a.
import * as jpegWasm from "https://deno.land/x/imagescript@1.2.15/utils/wasm/jpeg.js";
const jpeg = jpegWasm as unknown as {
  encode(rgba: Uint8Array, w: number, h: number, q: number): Uint8Array;
  decode(buf: Uint8Array, w: number, h: number): { width: number; height: number; buffer: Uint8Array };
};
const SZEROKOSC_DOCELOWA = 1200;
const JPEG_Q = 80;

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

// „las” jako SŁOWO, nie podciąg („klasyczny”, „wlasny”). Granica przez \p{L}, nie \b: w JS \b zna tylko
// [A-Za-z0-9_], więc ł/ś/ą przed „las” liczyłoby się jako granica słowa.
const LAS = /(?<!\p{L})las(u|ek|ku|ie)?(?!\p{L})/u;

function sceneria(race: { name: string; distance_km: number | null }) {
  const n = String(race.name || "").toLowerCase();
  if (/trail|ultra|górsk|gorsk|le[sś]n/.test(n) || LAS.test(n) || (race.distance_km ?? 0) > 42.5) return "trail";
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
    /nocn|night/.test(String(race.name || "").toLowerCase())
      ? "Realistyczna fotografia reportażowa nocą: ciemne niebo, światło latarni i czołówek biegaczy."
      : "Realistyczna fotografia reportażowa, naturalne światło dzienne.",
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

function przeskaluj(obraz: { bajty: Uint8Array; mime: string }) {
  if (obraz.mime !== "image/jpeg") return obraz;
  const { width: W, height: H, buffer: piks } = jpeg.decode(obraz.bajty, 0, 0);
  const kan = piks.length / (W * H);
  if (W <= SZEROKOSC_DOCELOWA || (kan !== 1 && kan !== 3)) return obraz;
  const DW = SZEROKOSC_DOCELOWA, DH = Math.round(H * DW / W);
  const sx = W / DW, sy = H / DH;
  const rgba = new Uint8Array(DW * DH * 4);
  for (let y = 0; y < DH; y++) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), H - 1);
    const y0 = Math.floor(fy), y1 = Math.min(H - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < DW; x++) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), W - 1);
      const x0 = Math.floor(fx), x1 = Math.min(W - 1, x0 + 1), wx = fx - x0;
      const o = (y * DW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const cc = kan === 1 ? 0 : c;
        const a = piks[(y0 * W + x0) * kan + cc], b = piks[(y0 * W + x1) * kan + cc];
        const d = piks[(y1 * W + x0) * kan + cc], e = piks[(y1 * W + x1) * kan + cc];
        rgba[o + c] = Math.round((a * (1 - wx) + b * wx) * (1 - wy) + (d * (1 - wx) + e * wx) * wy);
      }
      rgba[o + 3] = 255;
    }
  }
  return { bajty: jpeg.encode(rgba, DW, DH, JPEG_Q), mime: "image/jpeg" };
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
  try {
    obraz = przeskaluj(obraz);
  } catch (e) {
    console.error("race-image skalowanie (zapisuję oryginał):", raceId, String(e));
  }
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
