// ════════════════════════════════════════════════════════════════════
// food-image-fetch — Edge Function dla BiegaMy Nutrition
//
// Zwraca URL obrazka dla nazwy jedzenia, z cache i fallback do kategorii.
//
// Flow:
//   1. Normalizuj nazwę (lowercase, trim)
//   2. Sprawdź food_images cache w DB
//   3. Jeśli MISS → spróbuj match category → fallback URL
//   4. Jeśli mamy klucz UNSPLASH_ACCESS_KEY → spróbuj Unsplash search
//   5. Zapisz wynik w food_images cache
//   6. Zwróć { url, source, cached }
//
// Wymagane secrets w Supabase:
//   - SUPABASE_URL (auto)
//   - SUPABASE_SERVICE_ROLE_KEY (auto)
//   - UNSPLASH_ACCESS_KEY (manual: https://unsplash.com/oauth/applications)
//
// Deploy:
//   supabase functions deploy food-image-fetch --no-verify-jwt
// ════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const UNSPLASH_ACCESS_KEY = Deno.env.get('UNSPLASH_ACCESS_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// CORS dla wszystkich
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Normalizacja nazwy
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .substring(0, 100);
}

// Wyciąga "rdzeń" produktu — pierwsze 1-2 słowa, smart-handling nawiasów
function extractCore(name: string): string {
  let s = name.toLowerCase().trim();

  // Smart parens: jeśli prefix to generic word (produkt/produkty/item/food) → weź zawartość nawiasów
  // np. "Produkt (Coca-Cola)" → "coca-cola", "produkty (Mleko 2%)" → "mleko"
  const parenMatch = s.match(/^(produkt|produkty|item|food|napój|napoj|jedzenie|posiłek|posilek)\s*\(([^)]+)\)/i);
  if (parenMatch) {
    s = parenMatch[2].toLowerCase().trim();
  } else {
    // W innych przypadkach: nawiasy = metadata, usuń ("Banan (100g)" → "banan")
    s = s.replace(/\([^)]*\)/g, '');
  }

  const cleaned = s
    .replace(/\d+\s*(g|kg|ml|l|szt)\.?/gi, '')  // usuń jednostki
    .replace(/[^\w\sąćęłńóśźż]/gi, ' ')          // znaki specjalne
    .trim()
    .replace(/\s+/g, ' ');
  // Pierwsze 2 słowa, ale akceptuj też 2-literowe (np. "ser")
  const words = cleaned.split(' ').filter(w => w.length >= 2);
  return words.slice(0, 2).join(' ').trim();
}

// Tłumaczenie polskich nazw na angielskie dla Unsplash
const PL_TO_EN: Record<string, string> = {
  'banan': 'banana',
  'jabłko': 'apple',
  'gruszka': 'pear',
  'truskawka': 'strawberry',
  'malina': 'raspberry',
  'jagoda': 'blueberry',
  'pomidor': 'tomato',
  'ogórek': 'cucumber',
  'marchew': 'carrot',
  'sałata': 'salad',
  'kurczak': 'chicken',
  'wołowina': 'beef',
  'wieprzowina': 'pork',
  'schab': 'pork',
  'kotlet': 'cutlet',
  'stek': 'steak',
  'łosoś': 'salmon',
  'tuńczyk': 'tuna',
  'dorsz': 'cod',
  'chleb': 'bread',
  'bułka': 'bread roll',
  'kanapka': 'sandwich',
  'tost': 'toast',
  'płatki': 'cereal',
  'owsianka': 'oatmeal',
  'ryż': 'rice',
  'kasza': 'grain',
  'makaron': 'pasta',
  'spaghetti': 'spaghetti',
  'mleko': 'milk',
  'jogurt': 'yogurt',
  'kefir': 'kefir',
  'twaróg': 'cottage cheese',
  'ser': 'cheese',
  'masło': 'butter',
  'jajko': 'egg',
  'jajka': 'eggs',
  'fasola': 'beans',
  'soczewica': 'lentils',
  'ciecierzyca': 'chickpeas',
  'orzechy': 'nuts',
  'migdały': 'almonds',
  'woda': 'water',
  'sok': 'juice',
  'herbata': 'tea',
  'kawa': 'coffee',
  'czekolada': 'chocolate',
  'ciastko': 'cookie',
  'ciasto': 'cake',
  'lody': 'ice cream',
  'zupa': 'soup',
  'rosół': 'broth',
  'barszcz': 'borscht',
  'żurek': 'sour soup',
  'awokado': 'avocado',
  'cytryna': 'lemon',
  'pomarańcza': 'orange',
  'arbuz': 'watermelon',
  'ananas': 'pineapple',
  'truskawki': 'strawberries',
  'pizza': 'pizza',
  'burger': 'burger',
  'frytki': 'fries',
  'sushi': 'sushi',
  'cola': 'cola',
  'coca-cola': 'coca cola',
  'pepsi': 'pepsi',
  'sprite': 'sprite',
  'fanta': 'fanta',
};

function translateToEnglish(plName: string): string {
  const words = plName.toLowerCase().split(/\s+/);
  const translated = words.map(w => PL_TO_EN[w] || w).join(' ');
  return translated.trim() || plName;
}

// Wyszukiwanie w Unsplash
async function searchUnsplash(query: string): Promise<{ url: string; thumb: string; attribution: string } | null> {
  if (!UNSPLASH_ACCESS_KEY) return null;
  try {
    const englishQuery = translateToEnglish(query);
    const searchQuery = `${englishQuery} food`;
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=1&orientation=landscape&content_filter=high`;

    const r = await fetch(url, {
      headers: {
        'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`,
        'Accept-Version': 'v1'
      }
    });

    if (!r.ok) {
      console.warn('Unsplash error:', r.status, await r.text());
      return null;
    }

    const data = await r.json();
    if (!data.results || data.results.length === 0) return null;

    const photo = data.results[0];
    return {
      url: photo.urls.regular,    // ~1080px
      thumb: photo.urls.small,    // ~400px
      attribution: `Photo by ${photo.user.name} on Unsplash`
    };
  } catch (e) {
    console.error('Unsplash fetch failed:', e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { name } = await req.json();
    if (!name || typeof name !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const normalized = normalizeName(name);
    const core = extractCore(normalized);
    const lookupKey = core || normalized;

    // 1. Sprawdź cache
    const { data: cached } = await supabase
      .from('food_images')
      .select('image_url, thumb_url, source, attribution')
      .eq('name_normalized', lookupKey)
      .maybeSingle();

    if (cached?.image_url) {
      // Bump hit_count w tle (best effort, nie blokujemy odpowiedzi)
      try {
        const { data: hc } = await supabase
          .from('food_images')
          .select('hit_count')
          .eq('name_normalized', lookupKey)
          .maybeSingle();
        const newCount = (hc?.hit_count || 0) + 1;
        await supabase
          .from('food_images')
          .update({ hit_count: newCount })
          .eq('name_normalized', lookupKey);
      } catch (e) {
        // ignore — to tylko statystyka
      }

      return new Response(JSON.stringify({
        url: cached.image_url,
        thumb: cached.thumb_url || cached.image_url,
        source: cached.source,
        cached: true,
        attribution: cached.attribution
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. MISS — spróbuj Unsplash
    let result: { url: string; thumb: string; source: string; attribution: string } | null = null;

    if (UNSPLASH_ACCESS_KEY) {
      const unsplash = await searchUnsplash(lookupKey);
      if (unsplash) {
        result = {
          url: unsplash.url,
          thumb: unsplash.thumb,
          source: 'unsplash',
          attribution: unsplash.attribution
        };
      }
    }

    // 3. Jeśli Unsplash nie znalazł — spróbuj kategorii
    if (!result) {
      const { data: categoryMatch } = await supabase
        .rpc('match_food_category', { food_name: lookupKey });
      if (categoryMatch && categoryMatch.length > 0) {
        result = {
          url: categoryMatch[0].image_url,
          thumb: categoryMatch[0].image_url,
          source: 'category_fallback',
          attribution: ''
        };
      }
    }

    // 4. Jeśli nadal nic — losowa nasza grafika (deterministyczna z nazwy)
    if (!result) {
      let hash = 0;
      for (let i = 0; i < lookupKey.length; i++) {
        hash = ((hash << 5) - hash) + lookupKey.charCodeAt(i);
        hash = hash & hash;
      }
      const idx = Math.abs(hash) % 55 + 1;
      const fallbackUrl = `https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/biegamy-assets/j${idx}.webp`;
      result = {
        url: fallbackUrl,
        thumb: fallbackUrl,
        source: 'fallback_seed',
        attribution: ''
      };
    }

    // 5. Zapisz w cache (tylko unsplash + category — fallback_seed nie ma sensu cachować)
    if (result.source === 'unsplash' || result.source === 'category_fallback') {
      await supabase
        .from('food_images')
        .upsert({
          name_normalized: lookupKey,
          display_name: normalized,
          image_url: result.url,
          thumb_url: result.thumb,
          source: result.source,
          attribution: result.attribution,
          hit_count: 1
        }, { onConflict: 'name_normalized' });
    }

    return new Response(JSON.stringify({
      ...result,
      cached: false
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('food-image-fetch error:', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
