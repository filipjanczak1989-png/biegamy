// supabase/functions/ocr-training-screen/index.ts
// EF v7 — multi-screenshot extraction (1-5 img) + rozpoznanie sportu (nie-bieg → Zastępczy).
// Model: Haiku 4.5. v6: prose-tolerant JSON parse + graceful 200. v7: cross-training auto-tag.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-haiku-4-5-20251001";
const MAX_IMAGES = 5;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
};

function extractJson(text: string): string {
  if (!text) return "";
  let t = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1);
  return t;
}

const SYSTEM_PROMPT = `Jesteś ekspertem ekstrakcji danych treningowych z zrzutów ekranu aplikacji sportowych (Garmin Connect, Strava, Polar Flow, Suunto, Coros, Apple Fitness, Adidas Running, Nike Run Club, intervals.icu). Głównie biegowe, ale obsługujesz też treningi NIE-BIEGOWE (rower, pływanie, inne sporty) — patrz reguła rozpoznania sportu w polu training_type.

Otrzymujesz JEDEN LUB WIĘCEJ zrzutów ekranu reprezentujących TEN SAM trening (różne widoki/karty/screeny). Agregujesz dane ze wszystkich obrazów w jeden zestaw metryk.

ZASADY AGREGACJI:
1. To samo pole na wielu zdjęciach → wybierz NAJBARDZIEJ wiarygodną wartość (dokładniejsza precyzja, nie zaokrąglona)
2. Wartości ROZJEŻDŻAJĄ się (10.5 vs 10.6) → wybierz medianę lub wartość z głównego summary
3. Pole TYLKO na jednym screenie → użyj go
4. Pole nie pojawia się nigdzie → null (NIE zgaduj)
5. Tylko zdjęcia NIE-TRENINGOWE (brak jakiejkolwiek aktywności sportowej: menu, czat, losowe foto) → {"ok":false, "error":"no_training_data"}. WAŻNE: screen INNEGO SPORTU (rower/pływanie/itp.) to NADAL trening — NIE odrzucaj, wyciągnij metryki i oznacz training_type="Zastępczy".
6. RÓŻNE TRENINGI na zdjęciach (wczoraj vs przedwczoraj) → wybierz najnowszy + warning

EKSTRAKTUJ pola:

1. distance_km (number) — dystans w km
   - "10.5 km", "10,5 km" → 10.5
   - "6.2 mi" → ×1.609 → km
   - "10500 m" → 10.5

2. duration (string "MM:SS" lub "H:MM:SS") — czas trwania
   - "50:30" → "50:30"
   - "1:45:23" → "1:45:23"
   - "00:50:30" → "50:30"
   - Preferuj Moving Time vs Elapsed

3. pace (string "M:SS") — tempo średnie /km
   - "5:03 /km" → "5:03"
   - "8:08 /mi" → ÷1.609 → /km
   - "12.5 km/h" → 60/12.5 = "4:48"

4. heart_rate (integer) — średnie tętno
   - "145 bpm", "Avg HR: 152" → 145/152
   - Range "138-165" → średnia (151)
   - NIE max, tylko avg

5. elevation_gain (integer) — przewyższenie w metrach
   - "120 m", "Total Ascent: 120m" → 120
   - "+450 ft" → ×0.3048 → m
   - NIE max elevation, tylko zysk (gain/ascent)

6. calories (integer) — kalorie spalone
   - "642 kcal", "Calories: 850", "Kalorie spalone: 437" → integer
   - Pozycje: Garmin "Activity Summary", Strava "Calories", Polar/Suunto "summary stats"
   - Apple Fitness: Active Calories (preferuj zamiast Total)
   - Typowo biegania: 300-1500 kcal

7. activity_date (string "YYYY-MM-DD") — data treningu
   - "22 maj 2026", "May 22, 2026", "22.05.2026" → "2026-05-22"
   - "Dzisiaj"/"Today" → today_iso
   - "Wczoraj"/"Yesterday" → today_iso - 1 day
   - "2 dni temu" → today_iso - 2 days

8. training_type (string) — MUSI być jednym z:
   "Spokojny", "Wybieganie", "Tempo", "Interwały", "Długi", "Progresja", "Regeneracja", "Start", "Wyścig", "Wzmacniający", "Zastępczy", "Trening"
   ROZPOZNAJ SPORT NAJPIERW:
   - Screen sportu NIE-BIEGOWEGO (nagłówek/ikona: Cycling, Ride, Rower, Bike, Kolarstwo, Swim, Pływanie, Walk, Marsz, Hike, Strength, Siłownia lub inny nie-bieg) → training_type="Zastępczy". POMIŃ heurystyki biegowe (rowerowe tempo/HR są inne — nie zgaduj typu biegowego).
   - Bieg (Run/Running/Bieg, albo brak jawnego sportu a metryki biegowe) → heurystyki poniżej:
   - Pace <4:30/km na 5-15km → Tempo
   - Varying pace z fast intervals → Interwały
   - Dystans >18km easy pace → Długi
   - Pace 6:00+/km → Spokojny lub Wybieganie

ZWRÓĆ wyłącznie JSON (NIE markdown):
{
  "ok": true,
  "distance_km": 10.5,
  "duration": "50:30",
  "pace": "4:48",
  "heart_rate": 152,
  "elevation_gain": 45,
  "calories": 642,
  "activity_date": "2026-05-22",
  "training_type": "Tempo",
  "sources_used": 3
}

LUB: { "ok": false, "error": "no_training_data" }`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const today_iso = body.today_iso || new Date().toISOString().slice(0, 10);

    let images: Array<{ image_base64: string; media_type: string }> = [];

    if (Array.isArray(body.images)) {
      images = body.images.slice(0, MAX_IMAGES).map((img: any) => ({
        image_base64: img.image_base64,
        media_type: img.media_type || "image/jpeg",
      }));
    } else if (body.image_base64) {
      images = [{ image_base64: body.image_base64, media_type: body.media_type || "image/jpeg" }];
    }

    if (images.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "no_images" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const content: any[] = images.map((img) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: img.media_type,
        data: img.image_base64,
      },
    }));

    content.push({
      type: "text",
      text: `Today's date is ${today_iso}. Number of screenshots: ${images.length}. Extract and aggregate training data from all screenshots into one training log.`,
    });

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("[ocr] Anthropic API error:", anthropicRes.status, errText);
      return new Response(
        JSON.stringify({ ok: false, error: "api_error", detail: anthropicRes.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData.content?.[0]?.text || "";

    let parsed;
    try {
      parsed = JSON.parse(extractJson(rawText));
    } catch (e) {
      console.error("[ocr] JSON parse error:", e.message, "raw(500):", rawText.slice(0, 500));
      return new Response(
        JSON.stringify({ ok: false, error: "parse_error" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!parsed.ok) {
      return new Response(
        JSON.stringify(parsed),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validTypes = ["Spokojny","Wybieganie","Tempo","Interwały","Długi","Progresja","Regeneracja","Start","Wyścig","Wzmacniający","Zastępczy","Trening"];
    const result = {
      ok: true,
      distance_km: typeof parsed.distance_km === "number" && parsed.distance_km > 0 ? parsed.distance_km : null,
      duration: typeof parsed.duration === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(parsed.duration) ? parsed.duration : null,
      pace: typeof parsed.pace === "string" && /^\d{1,2}:\d{2}$/.test(parsed.pace) ? parsed.pace : null,
      heart_rate: Number.isInteger(parsed.heart_rate) && parsed.heart_rate > 30 && parsed.heart_rate < 250 ? parsed.heart_rate : null,
      elevation_gain: Number.isInteger(parsed.elevation_gain) && parsed.elevation_gain >= 0 && parsed.elevation_gain < 10000 ? parsed.elevation_gain : null,
      calories: Number.isInteger(parsed.calories) && parsed.calories > 0 && parsed.calories < 10000 ? parsed.calories : null,
      activity_date: typeof parsed.activity_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.activity_date) ? parsed.activity_date : null,
      training_type: validTypes.includes(parsed.training_type) ? parsed.training_type : null,
      sources_used: images.length,
      warning: parsed.warning || null,
    };

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("[ocr] handler error:", e.message);
    return new Response(
      JSON.stringify({ ok: false, error: "server_error", message: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});