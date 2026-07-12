// ════════════════════════════════════════════════════════════════════
// food-recognize v2.1 — Supabase Edge Function
// v2.1: JSON-fallback — extractJson (toleruje prozę) + graceful 200 {ok:false,error:'parse_error'} (nie 500)
//
// Optymalizacje:
// - Claude Haiku 4.5 zamiast Sonnet (3x taniej)
// - Cache rezultatów w ai_cache (lookup przed AI call)
// - Prompt caching (system prompt × 0.1)
// - Limity dzienne per user (5 vision + 10 text dla free)
// - Logowanie usage
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy food-recognize
//   (W panelu Supabase ustaw "Verify JWT" = ON żeby auth.uid() działało)
// ════════════════════════════════════════════════════════════════════

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const MODEL = "claude-haiku-4-5-20251001";
const MODEL_FALLBACK = "claude-haiku-4-5";  // alias jeśli wersjonowany ID nie działa

// Limity dzienne — wyłączone na fazę testów
// (gdy chcesz wrócić: vision: 5, text: 10)
const FREE_LIMITS = {
  vision: Infinity,
  text: Infinity,
};
const PREMIUM_LIMITS = {
  vision: Infinity,
  text: Infinity,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ──────────────────────────────────────────────────────────────────────
// PROMPTS — z cache_control żeby Anthropic cachował (90% taniej na hit)
// ──────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_VISION = `Jesteś ekspertem od polskiej kuchni i wartości odżywczych. Otrzymasz zdjęcie posiłku i musisz:
1. Zidentyfikować WSZYSTKIE widoczne składniki/produkty (talerz może mieć kilka rzeczy)
2. Oszacować realistyczną gramaturę każdego (typowa porcja dla biegacza)
3. Podać kcal i makroskładniki na faktyczną gramaturę

Zwróć WYŁĄCZNIE poprawny JSON, bez markdown, bez komentarzy:
{
  "items": [
    {
      "name": "nazwa produktu po polsku, krótka",
      "weight_g": liczba,
      "kcal": liczba (zaokrąglona),
      "protein_g": liczba (1 miejsce po przecinku),
      "carbs_g": liczba (1 miejsce po przecinku),
      "fat_g": liczba (1 miejsce po przecinku)
    }
  ],
  "total_kcal": suma,
  "confidence": "high" | "medium" | "low",
  "note": "krótka uwaga jeśli zdjęcie niewyraźne, max 80 znaków, lub null"
}

ZASADY:
- Polskie nazwy: "Kanapka z szynką", "Owsianka z bananem", "Jabłko"
- NIE łącz wszystkiego w jeden item — rozdziel składniki gdy widoczne osobno
- Gramatura realistyczna: 1 jajko ~60g, kanapka ~80g, banan ~120g, miska ryżu ~200g
- Confidence "low" gdy zdjęcie rozmazane / talerz pełen / mocno zacieniony
- Nie podawaj sugestii dietetycznych ani komentarzy o zdrowości
- Jeśli to NIE jest jedzenie: {"items": [], "total_kcal": 0, "confidence": "low", "note": "Brak jedzenia na zdjęciu"}`;

const SYSTEM_PROMPT_TEXT = `Jesteś ekspertem od polskiej kuchni i wartości odżywczych. Otrzymasz krótki opis posiłku po polsku. Musisz:
1. Zinterpretować co user zjadł (typowa porcja jeśli nie podana)
2. Rozdzielić na składniki/produkty
3. Podać realistyczne kcal i makroskładniki

Zwróć WYŁĄCZNIE poprawny JSON, bez markdown:
{
  "items": [
    {
      "name": "nazwa po polsku",
      "weight_g": liczba,
      "kcal": liczba,
      "protein_g": liczba (1 miejsce),
      "carbs_g": liczba (1 miejsce),
      "fat_g": liczba (1 miejsce)
    }
  ],
  "total_kcal": suma,
  "confidence": "high" | "medium" | "low",
  "note": "max 80 znaków lub null"
}

ZASADY:
- Bez wagi → typowa porcja
- Rozdziel: "owsianka z bananem i miodem" → 3 items
- Confidence "low" gdy bardzo niejasne ("coś słodkiego")
- Polskie nazwy
- Bez sugestii dietetycznych

Przykłady:
"kanapka z szynką" → [Chleb 60g, Szynka 30g, Masło 5g]
"owsianka z bananem" → [Płatki owsiane 50g, Mleko 200g, Banan 120g]`;

// ──────────────────────────────────────────────────────────────────────
// HASHING — proste, bez zewnętrznych dep
// ──────────────────────────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function imageCacheKey(b64: string): Promise<string> {
  // Hash skrócony — używamy pierwszych 1000 chars + długość, wystarczy do dedupe identycznych zdjęć
  const sample = b64.slice(0, 1000) + "|" + b64.length;
  const hash = await sha256(sample);
  return "img:" + hash.slice(0, 24);
}

async function textCacheKey(text: string): Promise<string> {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
  const hash = await sha256(normalized);
  return "txt:" + hash.slice(0, 24);
}

// ──────────────────────────────────────────────────────────────────────
// JSON EXTRACTOR — toleruje prozę prefix/suffix + markdown fence (wzór: generate-recipe/ocr v7)
// ──────────────────────────────────────────────────────────────────────

function extractJson(text: string): string {
  if (!text) return "";
  let t = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1);
  return t;
}

// ──────────────────────────────────────────────────────────────────────
// ANTHROPIC CALL z prompt caching
// ──────────────────────────────────────────────────────────────────────

async function callClaude(
  systemPrompt: string,
  userContent: any[]
): Promise<{ result: any; tokens_in: number; tokens_out: number }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  // System prompt jako array z cache_control — 90% zniżki na cache hit
  const systemArr = [
    {
      type: "text",
      text: systemPrompt,
      cache_control: { type: "ephemeral" },  // cache na 5 min
    },
  ];

  let res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemArr,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Anthropic API error:", res.status, errText);
    // Spróbuj fallback model jeśli main nie istnieje
    if (res.status === 404) {
      const fallback = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL_FALLBACK,
          max_tokens: 1024,
          system: systemArr,
          messages: [{ role: "user", content: userContent }],
        }),
      });
      if (!fallback.ok) {
        throw new Error(`Anthropic ${fallback.status}: ${(await fallback.text()).slice(0, 200)}`);
      }
      res = fallback;
    } else {
      throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 200)}`);
    }
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text || "";
  const usage = data?.usage || {};
  const tokens_in = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  const tokens_out = usage.output_tokens || 0;

  // Wyciągnij JSON (extractJson — toleruje prozę prefix/suffix + fence). Błąd → result:null (serve zwróci graceful parse_error, NIE throw/500).
  let parsed: any = null;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch (e) {
    console.error("Failed to parse Claude response:", text.slice(0, 500));
  }

  return { result: parsed, tokens_in, tokens_out };
}

// ──────────────────────────────────────────────────────────────────────
// CACHE LOOKUP
// ──────────────────────────────────────────────────────────────────────

async function cacheLookup(supa: any, key: string): Promise<any | null> {
  const { data, error } = await supa
    .from("ai_cache")
    .select("result, hits")
    .eq("cache_key", key)
    .maybeSingle();
  if (error || !data) return null;
  // Bumpij hits + last_hit_at (best-effort, nie blokuj)
  supa
    .from("ai_cache")
    .update({ hits: (data.hits || 0) + 1, last_hit_at: new Date().toISOString() })
    .eq("cache_key", key)
    .then(({ error: e }: any) => { if (e) console.warn("cache hit update:", e); });
  return data.result;
}

async function cacheSave(
  supa: any,
  key: string,
  mode: string,
  result: any,
  queryText?: string
) {
  const { error } = await supa.from("ai_cache").insert({
    cache_key: key,
    mode,
    query_text: queryText || null,
    result,
  });
  if (error && error.code !== "23505") {  // 23505 = unique violation = race condition (OK)
    console.warn("cache save:", error);
  }
}

// ──────────────────────────────────────────────────────────────────────
// USAGE TRACKING + LIMITS
// ──────────────────────────────────────────────────────────────────────

async function logUsage(
  supa: any,
  athleteId: string,
  mode: string,
  cacheHit: boolean,
  tokensIn: number,
  tokensOut: number
) {
  const { error } = await supa.from("ai_usage_log").insert({
    athlete_id: athleteId,
    mode,
    cache_hit: cacheHit,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
  });
  if (error) console.warn("usage log:", error);
}

async function checkLimit(
  supa: any,
  athleteId: string,
  mode: string,
  planType: string
): Promise<{ allowed: boolean; used: number; limit: number; remaining: number }> {
  const limits = planType === "premium" ? PREMIUM_LIMITS : FREE_LIMITS;
  const limit = limits[mode as "vision" | "text"] || 0;
  if (limit === Infinity) {
    return { allowed: true, used: 0, limit: -1, remaining: -1 };
  }
  // Liczymy tylko REALNE calle (cache hit nie liczy się do limitu)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count } = await supa
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("athlete_id", athleteId)
    .eq("mode", mode)
    .eq("cache_hit", false)
    .gte("created_at", today.toISOString());
  const used = count || 0;
  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}

async function getUserPlan(supa: any, athleteId: string): Promise<string> {
  const { data } = await supa
    .from("nutrition_profiles")
    .select("plan_type")
    .eq("athlete_id", athleteId)
    .maybeSingle();
  return data?.plan_type || "free";
}

// ──────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    // Auth — wyciąganie user ID z JWT
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    // Service-role client dla bypassu RLS przy cache + log
    const supa = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

    const body = await req.json();
    const { mode, image_base64, text } = body;

    if (mode !== "vision" && mode !== "text") {
      return new Response(JSON.stringify({ error: "Invalid mode" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 1. CACHE LOOKUP
    let cacheKey: string;
    if (mode === "vision") {
      if (!image_base64) {
        return new Response(JSON.stringify({ error: "Missing image_base64" }), {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      cacheKey = await imageCacheKey(image_base64);
    } else {
      if (!text || !text.trim()) {
        return new Response(JSON.stringify({ error: "Missing text" }), {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      cacheKey = await textCacheKey(text);
    }

    const cached = await cacheLookup(supa, cacheKey);
    if (cached) {
      // Cache hit — nie liczy się do limitu, ale logujemy
      await logUsage(supa, user.id, mode, true, 0, 0);
      return new Response(
        JSON.stringify({ ...cached, _cache: true }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // 2. SPRAWDŹ LIMIT
    const planType = await getUserPlan(supa, user.id);
    const limitCheck = await checkLimit(supa, user.id, mode, planType);
    if (!limitCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: "limit_exceeded",
          message: `Dzienny limit ${mode === "vision" ? "zdjęć" : "opisów AI"} osiągnięty (${limitCheck.limit}/${limitCheck.limit}). Reset jutro o północy.`,
          used: limitCheck.used,
          limit: limitCheck.limit,
          plan: planType,
        }),
        { status: 429, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // 3. AI CALL
    let result: any;
    let tokensIn = 0;
    let tokensOut = 0;
    if (mode === "vision") {
      let mediaType = "image/jpeg";
      let pureB64 = image_base64;
      const dataUrlMatch = image_base64.match(/^data:(image\/[a-zA-Z0-9+]+);base64,(.+)$/);
      if (dataUrlMatch) {
        mediaType = dataUrlMatch[1];
        pureB64 = dataUrlMatch[2];
      }
      const out = await callClaude(SYSTEM_PROMPT_VISION, [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: pureB64 },
        },
        { type: "text", text: "Rozpoznaj ten posiłek. Zwróć JSON." },
      ]);
      result = out.result;
      tokensIn = out.tokens_in;
      tokensOut = out.tokens_out;
    } else {
      const out = await callClaude(SYSTEM_PROMPT_TEXT, [
        { type: "text", text: `Posiłek: "${text.trim()}". Zwróć JSON.` },
      ]);
      result = out.result;
      tokensIn = out.tokens_in;
      tokensOut = out.tokens_out;
    }

    // 3b. JSON-fallback: parse_error → graceful 200 {ok:false} PRZED cacheSave (NIE cache'uj null, NIE 500)
    if (!result) {
      await logUsage(supa, user.id, mode, false, tokensIn, tokensOut);
      return new Response(
        JSON.stringify({ ok: false, error: "parse_error" }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // 4. CACHE + LOG
    await cacheSave(supa, cacheKey, mode, result, mode === "text" ? text : undefined);
    await logUsage(supa, user.id, mode, false, tokensIn, tokensOut);

    return new Response(
      JSON.stringify({
        ...result,
        _cache: false,
        _remaining: limitCheck.remaining - 1,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Handler error:", err);
    return new Response(
      JSON.stringify({ error: String((err as Error).message || err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});