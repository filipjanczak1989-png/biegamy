// ════════════════════════════════════════════════════════════════════
// food-micronutrients — Claude estymuje witaminy/minerały produktu
// v1.1: JSON-fallback — extractJson (toleruje prozę) przed parse; 502 zostaje (klient if(r.ok) nie cache'uje błędu)
//
// Fakty (nie porady): zwraca per 100g szacunki witamin i minerałów.
// Cache w food_database.full_nutrients żeby nie pytać Claude wielokrotnie.
// ════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// JSON extractor — toleruje prozę prefix/suffix + markdown fence (wzór: generate-recipe/ocr v7)
function extractJson(text: string): string {
  if (!text) return "";
  let t = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1);
  return t;
}

const SYSTEM_PROMPT = `You are a nutrition data estimator. You receive product info (name, brand, macros per 100g) and return estimated micronutrient content per 100g based on typical food composition databases.

CRITICAL RULES:
- Return ONLY a JSON object, no preamble, no explanation
- Use null for unknown values, not 0
- All values are PER 100g of product
- This is informational data only — never give dietary advice

Format:
{
  "vitamins": {
    "A": <µg or null>,
    "B1": <mg>, "B2": <mg>, "B3": <mg>, "B5": <mg>, "B6": <mg>,
    "B7": <µg>, "B9": <µg>, "B12": <µg>,
    "C": <mg>, "D": <µg>, "E": <mg>, "K": <µg>
  },
  "minerals": {
    "Ca": <mg>, "Fe": <mg>, "Mg": <mg>, "P": <mg>,
    "K_min": <mg>, "Zn": <mg>, "Cu": <mg>, "Mn": <mg>,
    "Se": <µg>, "I": <µg>
  },
  "confidence": "high" | "medium" | "low",
  "note": "<short fact about the product, max 80 chars>"
}

Examples:
Banana raw → vitamins.B6: 0.4, C: 9, B9: 20; minerals.K_min: 358, Mg: 27
Apple raw → vitamins.C: 5, K: 2.2; minerals.K_min: 107
Egg whole → vitamins.B12: 1.1, D: 2.0, A: 160; minerals.Se: 30, P: 198
Salmon raw → vitamins.D: 11, B12: 3.2, B3: 8; minerals.Se: 36, P: 240`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { name, brand, kcal_per_100, protein_per_100, carbs_per_100, fat_per_100, source_id, barcode } = await req.json();

    if (!name) {
      return new Response(JSON.stringify({ error: 'name required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 1. Cache check w food_database
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const cacheKey = source_id || barcode || (name + (brand || ''));

    if (source_id || barcode) {
      const filter = source_id
        ? sb.from('food_database').select('source_data').eq('source_id', source_id).maybeSingle()
        : sb.from('food_database').select('source_data').eq('barcode', barcode).maybeSingle();
      const { data } = await filter;
      if (data?.source_data?.micronutrients) {
        return new Response(JSON.stringify({
          ...data.source_data.micronutrients,
          source: data.source_data.micronutrients.source || 'cache'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ── 2. Wywołanie Claude
    const userPrompt = `Product: ${name}${brand ? ' (' + brand + ')' : ''}
Macros per 100g: ${kcal_per_100 || '?'} kcal, ${protein_per_100 || '?'}g protein, ${carbs_per_100 || '?'}g carbs, ${fat_per_100 || '?'}g fat

Return JSON with estimated micronutrients.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!claudeRes.ok) {
      const txt = await claudeRes.text();
      console.error('Claude error:', claudeRes.status, txt);
      return new Response(JSON.stringify({ error: 'AI failed', detail: txt }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '';

    // Parsuj JSON (extractJson — toleruje prozę prefix/suffix + fence). Błąd → 502 (klient if(r.ok) pomija, nie cache'uje).
    let micros;
    try {
      micros = JSON.parse(extractJson(text));
    } catch (e) {
      console.error('JSON parse failed:', text.slice(0, 500));
      return new Response(JSON.stringify({ error: 'AI returned invalid JSON' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    micros.source = 'ai_estimate';

    // ── 3. Cache w food_database (jeśli mamy source_id/barcode)
    if (source_id || barcode) {
      try {
        const lookup = source_id
          ? sb.from('food_database').select('id, source_data').eq('source_id', source_id).maybeSingle()
          : sb.from('food_database').select('id, source_data').eq('barcode', barcode).maybeSingle();
        const { data: existing } = await lookup;
        if (existing?.id) {
          const newSourceData = { ...(existing.source_data || {}), micronutrients: micros };
          await sb.from('food_database').update({ source_data: newSourceData }).eq('id', existing.id);
        }
      } catch (e) {
        console.error('Cache write failed (non-fatal):', e);
      }
    }

    return new Response(JSON.stringify(micros), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Handler error:', e);
    return new Response(JSON.stringify({ error: e.message || 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});