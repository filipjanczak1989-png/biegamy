// ════════════════════════════════════════════════════════════════════
// food-search-off — Open Food Facts lookup
//
// Bez API key, bez limitów! Open Food Facts jest darmowe.
//
// Tryby:
//   { mode: 'barcode', barcode: '5900334011398' } 
//   { mode: 'search', query: 'coca cola' }
//
// Flow:
//   1. Sprawdź food_database cache (po barcode lub name_normalized)
//   2. MISS → Open Food Facts API
//   3. Zapisz w cache + zwróć
//
// Deploy: supabase functions deploy food-search-off --no-verify-jwt
// ════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OFF_BASE = 'https://world.openfoodfacts.org';
const USER_AGENT = 'BiegaMy-Nutrition/1.0 (https://biegamy.run)';

// Normalizacja nazwy
function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ').substring(0, 100);
}

// Mapuje produkt z OFF na nasz format
function mapOffProduct(p: any) {
  const n = p.nutriments || {};
  return {
    barcode: p.code || p._id || null,
    display_name: p.product_name_pl || p.product_name || p.product_name_en || 'Bez nazwy',
    brand: p.brands || null,
    serving_unit: 'g',
    kcal_per_100: parseFloat(n['energy-kcal_100g']) || (parseFloat(n.energy_100g) || 0) / 4.184 || 0,
    protein_g_per_100: parseFloat(n.proteins_100g) || 0,
    carbs_g_per_100: parseFloat(n.carbohydrates_100g) || 0,
    fat_g_per_100: parseFloat(n.fat_100g) || 0,
    fiber_g_per_100: parseFloat(n.fiber_100g) || 0,
    sugar_g_per_100: parseFloat(n.sugars_100g) || 0,
    salt_g_per_100: parseFloat(n.salt_100g) || 0,
    saturated_fat_g_per_100: parseFloat(n['saturated-fat_100g']) || 0,
    sodium_mg_per_100: parseFloat(n.sodium_100g) ? parseFloat(n.sodium_100g) * 1000 : 0,
    image_url: p.image_front_url || p.image_url || null,
    ingredients_text: p.ingredients_text_pl || p.ingredients_text || null,
    source: 'open_food_facts',
    source_id: p.code || p._id || null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const mode = body.mode;

    // ── BARCODE LOOKUP ────────────────────────────────────────────
    if (mode === 'barcode') {
      const barcode = String(body.barcode || '').trim();
      if (!barcode) {
        return new Response(JSON.stringify({ error: 'Missing barcode' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 1. Sprawdź cache
      const { data: cached } = await supabase
        .from('food_database')
        .select('*')
        .eq('barcode', barcode)
        .maybeSingle();

      if (cached) {
        // Bump hit count
        await supabase.rpc('bump_food_hit', { p_id: cached.id });
        return new Response(JSON.stringify({ product: cached, cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2. Pobierz z OFF
      const url = `${OFF_BASE}/api/v2/product/${barcode}.json?fields=product_name,product_name_pl,product_name_en,brands,code,nutriments,image_front_url,image_url,ingredients_text,ingredients_text_pl`;
      const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      
      if (!r.ok) {
        return new Response(JSON.stringify({ error: 'OFF API error', status: r.status }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const json = await r.json();
      if (json.status !== 1 || !json.product) {
        return new Response(JSON.stringify({ product: null, found: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const mapped = mapOffProduct(json.product);
      mapped.barcode = barcode;
      mapped.name_normalized = normalize(mapped.display_name);

      // 3. Zapisz w cache
      const { data: saved } = await supabase
        .from('food_database')
        .upsert(mapped, { onConflict: 'barcode' })
        .select()
        .single();

      return new Response(JSON.stringify({ product: saved || mapped, cached: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── SEARCH BY NAME ─────────────────────────────────────────────
    if (mode === 'search') {
      const query = String(body.query || '').trim();
      if (!query) {
        return new Response(JSON.stringify({ error: 'Missing query' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const limit = Math.min(parseInt(body.limit) || 10, 20);
      
      // 1. Sprawdź lokalny cache (przez RPC)
      const { data: localResults } = await supabase
        .rpc('search_food_by_name', { p_query: query, p_limit: limit });

      // Jeśli mamy >= 5 wyników z cache — wystarczy
      if (localResults && localResults.length >= 5) {
        return new Response(JSON.stringify({ 
          results: localResults, 
          cached: true 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2. Pobierz z OFF (CGI search v1, prosty endpoint, bez tokenu)
      // Filtrujemy do polskich produktów żeby były lepsze nazwy
      const offUrl = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${limit}&fields=product_name,product_name_pl,brands,code,nutriments,image_front_url,image_url`;
      
      try {
        const r = await fetch(offUrl, { headers: { 'User-Agent': USER_AGENT } });
        if (!r.ok) {
          // Jeśli OFF nie odpowiada — wróć tylko z lokalnym cache
          return new Response(JSON.stringify({ 
            results: localResults || [], 
            cached: true,
            warning: 'OFF unreachable, returning local cache'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const json = await r.json();
        const products = (json.products || []).filter((p: any) => 
          p.nutriments && p.nutriments['energy-kcal_100g'] && p.product_name
        );

        // Mapuj i zapisz w cache
        const mappedAll = [];
        for (const p of products.slice(0, limit)) {
          const mapped = mapOffProduct(p);
          mapped.name_normalized = normalize(mapped.display_name);
          mappedAll.push(mapped);
        }

        // Upsert wszystkich do cache (po barcode jeśli jest, w innym razie z name_normalized)
        if (mappedAll.length > 0) {
          // Tylko produkty z barcode (unique key) — reszta byłaby duplikatem
          const withBarcode = mappedAll.filter(m => m.barcode);
          if (withBarcode.length > 0) {
            await supabase
              .from('food_database')
              .upsert(withBarcode, { onConflict: 'barcode', ignoreDuplicates: false });
          }
        }

        // Połącz z lokalnym cache (deduplikacja po display_name)
        const seen = new Set((localResults || []).map((r: any) => r.display_name));
        const combined = [...(localResults || [])];
        for (const m of mappedAll) {
          if (!seen.has(m.display_name)) {
            combined.push(m);
            seen.add(m.display_name);
          }
        }

        return new Response(JSON.stringify({ 
          results: combined.slice(0, limit), 
          cached: false 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        console.error('OFF search error:', e);
        return new Response(JSON.stringify({ 
          results: localResults || [], 
          cached: true 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Invalid mode (use barcode or search)' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('food-search-off error:', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});