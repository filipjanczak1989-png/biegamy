// ════════════════════════════════════════════════════════════════════
// food-search-usda — USDA FoodData Central lookup
//
// USDA = składniki podstawowe (banan, jajko, mięso) + witaminy/minerały
// Open Food Facts = przetworzone produkty z barcode'ami
//
// Wymaga: USDA_API_KEY (darmowy, https://fdc.nal.usda.gov/api-key-signup.html)
// Limit: 1000 req/h
//
// Tryby:
//   { mode: 'search', query: 'banana', limit: 10 }
//   { mode: 'detail', fdc_id: 1102702 }
//
// Tłumaczenie PL → EN robione w edge function (uproszczona lista 80 słów)
//
// Deploy: supabase functions deploy food-search-usda --no-verify-jwt
// ════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const USDA_API_KEY = Deno.env.get('USDA_API_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Tłumaczenie PL→EN dla USDA (głównie składniki surowe)
const PL_TO_EN: Record<string, string> = {
  'banan': 'banana', 'jabłko': 'apple', 'gruszka': 'pear',
  'truskawka': 'strawberry', 'truskawki': 'strawberries',
  'malina': 'raspberry', 'maliny': 'raspberries',
  'jagoda': 'blueberry', 'jagody': 'blueberries',
  'pomidor': 'tomato', 'pomidory': 'tomatoes',
  'ogórek': 'cucumber', 'marchew': 'carrot', 'marchewka': 'carrot',
  'sałata': 'lettuce', 'kapusta': 'cabbage',
  'cebula': 'onion', 'czosnek': 'garlic',
  'ziemniak': 'potato', 'ziemniaki': 'potatoes',
  'kurczak': 'chicken', 'pierś': 'chicken breast', 'udko': 'chicken thigh',
  'wołowina': 'beef', 'wieprzowina': 'pork',
  'schab': 'pork loin', 'kotlet': 'cutlet', 'stek': 'steak',
  'łosoś': 'salmon', 'tuńczyk': 'tuna', 'dorsz': 'cod',
  'śledź': 'herring', 'makrela': 'mackerel',
  'chleb': 'bread', 'bułka': 'bread roll', 'kanapka': 'sandwich',
  'tost': 'toast', 'płatki': 'cereal', 'owsianka': 'oatmeal',
  'ryż': 'rice', 'kasza': 'groats', 'makaron': 'pasta',
  'spaghetti': 'spaghetti', 'kasza gryczana': 'buckwheat',
  'mleko': 'milk', 'jogurt': 'yogurt', 'kefir': 'kefir',
  'twaróg': 'cottage cheese', 'ser': 'cheese',
  'masło': 'butter', 'jajko': 'egg', 'jajka': 'eggs',
  'fasola': 'beans', 'soczewica': 'lentils',
  'ciecierzyca': 'chickpeas', 'groch': 'peas',
  'orzechy': 'nuts', 'migdały': 'almonds',
  'orzechy włoskie': 'walnuts', 'orzechy laskowe': 'hazelnuts',
  'pestki słonecznika': 'sunflower seeds',
  'pestki dyni': 'pumpkin seeds',
  'woda': 'water', 'sok': 'juice', 'herbata': 'tea',
  'kawa': 'coffee', 'mleko sojowe': 'soy milk',
  'czekolada': 'chocolate', 'ciastko': 'cookie', 'ciasto': 'cake',
  'lody': 'ice cream', 'miód': 'honey', 'cukier': 'sugar',
  'oliwa': 'olive oil', 'olej': 'oil',
  'awokado': 'avocado', 'cytryna': 'lemon', 'pomarańcza': 'orange',
  'arbuz': 'watermelon', 'ananas': 'pineapple', 'mango': 'mango',
};

function translateToEnglish(plName: string): string {
  const normalized = plName.toLowerCase().trim();
  // Bezpośrednie dopasowanie
  if (PL_TO_EN[normalized]) return PL_TO_EN[normalized];
  
  // Spróbuj słowo po słowie
  const words = normalized.split(/\s+/);
  const translated = words.map(w => PL_TO_EN[w] || w).join(' ');
  return translated.trim() || plName;
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ').substring(0, 100);
}

// ════════════════════════════════════════════════════════════════════
// CLAUDE TRANSLATION — batch tłumaczenie nazw USDA na polski
// 1 wywołanie API tłumaczy wszystkie nazwy naraz (oszczędność tokenów)
// ════════════════════════════════════════════════════════════════════
async function translateBatchClaude(enNames: string[]): Promise<Record<string, string>> {
  if (!ANTHROPIC_API_KEY || enNames.length === 0) {
    return {};  // fallback do słownika
  }
  
  // Deduplikuj — gdyby ta sama nazwa była kilka razy
  const unique = [...new Set(enNames.filter(n => n && n.trim()))];
  if (unique.length === 0) return {};

  const prompt = `Przetłumacz na polski poniższe nazwy produktów spożywczych z bazy USDA. 
Zachowaj format: jedna nazwa na linijkę, w tym samym porządku co dostałeś.
Tłumacz krótko i naturalnie po polsku — używaj polskich nazw potraw zamiast dosłownych tłumaczeń.

PRZYKŁADY:
"Apples, raw, with skin" → "Jabłka surowe ze skórką"
"Bananas, ripe" → "Banany dojrzałe"
"Chicken, broilers or fryers, breast, meat only, raw" → "Pierś z kurczaka surowa"
"Tomato products, canned, paste, with salt added" → "Koncentrat pomidorowy z solą"
"Cheese, cheddar" → "Ser cheddar"

Zwróć WYŁĄCZNIE listę polskich nazw, jedna na linijkę. Bez numerowania, bez dodatkowych komentarzy.

Nazwy do tłumaczenia:
${unique.map((n, i) => `${i+1}. ${n}`).join('\n')}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',  // Haiku — szybki i tani
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      console.warn('Claude translate error:', r.status, await r.text());
      return {};
    }

    const json = await r.json();
    const text = json.content?.[0]?.text || '';
    
    // Parsuj odpowiedź: każda linia to jedno tłumaczenie (w tym samym porządku co input)
    const lines = text.split('\n')
      .map((l: string) => l.trim())
      .map((l: string) => l.replace(/^\d+\.\s*/, ''))  // usuń numeracje typu "1. "
      .filter((l: string) => l.length > 0);

    const map: Record<string, string> = {};
    for (let i = 0; i < unique.length && i < lines.length; i++) {
      map[unique[i]] = lines[i];
    }
    return map;
  } catch (e) {
    console.error('Claude translate exception:', e);
    return {};
  }
}

// Tłumaczy angielską nazwę USDA na polską (fallback przez słownik)
// USDA zwraca np. "Apples, raw" → "Jabłko surowe"
function translateUsdaName(enName: string): string {
  if (!enName) return enName;
  
  // Mapa popularnych słów EN→PL
  const EN_TO_PL: Record<string, string> = {
    'apple': 'Jabłko', 'apples': 'Jabłka',
    'banana': 'Banan', 'bananas': 'Banany',
    'pear': 'Gruszka', 'pears': 'Gruszki',
    'strawberry': 'Truskawka', 'strawberries': 'Truskawki',
    'raspberry': 'Malina', 'raspberries': 'Maliny',
    'blueberry': 'Jagoda', 'blueberries': 'Jagody',
    'tomato': 'Pomidor', 'tomatoes': 'Pomidory',
    'cucumber': 'Ogórek', 'cucumbers': 'Ogórki',
    'carrot': 'Marchew', 'carrots': 'Marchewki',
    'lettuce': 'Sałata', 'cabbage': 'Kapusta',
    'onion': 'Cebula', 'onions': 'Cebule',
    'garlic': 'Czosnek',
    'potato': 'Ziemniak', 'potatoes': 'Ziemniaki',
    'chicken': 'Kurczak',
    'beef': 'Wołowina', 'pork': 'Wieprzowina',
    'salmon': 'Łosoś', 'tuna': 'Tuńczyk', 'cod': 'Dorsz',
    'bread': 'Chleb', 'rice': 'Ryż',
    'pasta': 'Makaron', 'spaghetti': 'Spaghetti',
    'milk': 'Mleko', 'yogurt': 'Jogurt',
    'cheese': 'Ser', 'butter': 'Masło',
    'egg': 'Jajko', 'eggs': 'Jajka',
    'beans': 'Fasola', 'lentils': 'Soczewica',
    'almonds': 'Migdały', 'walnuts': 'Orzechy włoskie',
    'water': 'Woda', 'juice': 'Sok',
    'tea': 'Herbata', 'coffee': 'Kawa',
    'chocolate': 'Czekolada', 'cookie': 'Ciastko',
    'cake': 'Ciasto', 'honey': 'Miód', 'sugar': 'Cukier',
    'oil': 'Olej', 'avocado': 'Awokado',
    'lemon': 'Cytryna', 'orange': 'Pomarańcza',
    'watermelon': 'Arbuz', 'pineapple': 'Ananas', 'mango': 'Mango',
    
    // Modyfikatory
    'raw': 'surowy', 'cooked': 'gotowany', 'baked': 'pieczony',
    'fried': 'smażony', 'boiled': 'gotowany',
    'roasted': 'pieczony', 'grilled': 'grillowany',
    'fresh': 'świeży', 'dried': 'suszony', 'frozen': 'mrożony',
    'with skin': 'ze skórką', 'without skin': 'bez skórki',
    'whole': 'cały', 'sliced': 'krojony', 'chopped': 'siekany',
    'red': 'czerwony', 'green': 'zielony', 'white': 'biały',
    'sweet': 'słodki', 'sour': 'kwaśny',
    'with salt': 'z solą', 'unsalted': 'bez soli',
    'low fat': 'niskotłuszczowy', 'fat free': 'beztłuszczowy', 
    'whole milk': 'pełnotłuste', 'skim': 'odtłuszczone',
    'organic': 'bio', 'natural': 'naturalny',
    'liquid': 'płynny', 'powder': 'w proszku',
  };
  
  // Spróbuj tłumaczyć — pierwsze słowo szczególnie ważne
  let translated = enName;
  
  // Pierwsze słowo (główny rzeczownik): użyj capitalize
  const parts = enName.split(/,\s*/);  // "Apples, raw" → ["Apples", "raw"]
  const firstPart = parts[0]?.toLowerCase().trim();
  
  if (firstPart && EN_TO_PL[firstPart]) {
    parts[0] = EN_TO_PL[firstPart];
    
    // Tłumacz pozostałe modyfikatory
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i].toLowerCase().trim();
      if (EN_TO_PL[p]) parts[i] = EN_TO_PL[p];
    }
    translated = parts.join(', ');
  }
  
  return translated;
}

// Mapuje produkt z USDA na nasz format
function mapUsdaProduct(p: any) {
  // USDA zwraca foodNutrients z różnymi nazwami w zależności od typu
  const nMap: Record<string, number> = {};
  for (const fn of (p.foodNutrients || [])) {
    const name = (fn.nutrientName || fn.name || '').toLowerCase();
    const value = parseFloat(fn.value || fn.amount) || 0;
    if (!name) continue;
    
    if (name.includes('energy') && (name.includes('kcal') || !nMap.kcal)) nMap.kcal = value;
    else if (name === 'protein' || name.includes('protein')) nMap.protein = value;
    else if (name.includes('carbohydrate, by difference') || name === 'carbohydrate') nMap.carbs = value;
    else if (name === 'total lipid (fat)' || name === 'fat' || name === 'total fat') nMap.fat = value;
    else if (name.includes('fiber, total dietary') || name === 'fiber') nMap.fiber = value;
    else if (name.includes('sugars, total') || name === 'sugars') nMap.sugar = value;
    else if (name === 'sodium, na' || name === 'sodium') nMap.sodium = value;
    else if (name.includes('saturated') && name.includes('fatty acids')) nMap.saturated = value;
  }
  
  // Konwersja sodium (mg) → salt (g): 1g salt = 393mg sodium
  const sodium_mg = nMap.sodium || 0;
  const salt_g = sodium_mg > 0 ? sodium_mg / 393 : 0;
  
  // Polska nazwa wyświetlana (best effort)
  const enName = p.description || p.lowercaseDescription || 'USDA Item';
  const plName = translateUsdaName(enName);
  
  return {
    barcode: null,
    display_name: plName,
    display_name_en: enName,  // zachowane też dla debug
    brand: p.brandOwner || p.brandName || null,
    serving_unit: 'g',
    kcal_per_100: nMap.kcal || 0,
    protein_g_per_100: nMap.protein || 0,
    carbs_g_per_100: nMap.carbs || 0,
    fat_g_per_100: nMap.fat || 0,
    fiber_g_per_100: nMap.fiber || 0,
    sugar_g_per_100: nMap.sugar || 0,
    salt_g_per_100: salt_g,
    saturated_fat_g_per_100: nMap.saturated || 0,
    sodium_mg_per_100: sodium_mg,
    image_url: null,
    ingredients_text: null,
    source: 'usda',
    source_id: String(p.fdcId || ''),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const mode = body.mode || 'search';

    if (!USDA_API_KEY) {
      return new Response(JSON.stringify({ 
        error: 'USDA_API_KEY not configured',
        results: []
      }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (mode === 'search') {
      const query = String(body.query || '').trim();
      if (!query) {
        return new Response(JSON.stringify({ error: 'Missing query' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const limit = Math.min(parseInt(body.limit) || 10, 25);
      const englishQuery = translateToEnglish(query);

      // Smart query expansion — dla pojedynczego rzeczownika dodaj 'raw' żeby USDA dawał surowe składniki
      // np. 'apple' → 'apple raw' → priorytet "Apples, raw" zamiast "Apple, baked"
      const wordCount = englishQuery.split(/\s+/).length;
      const searchQuery = wordCount === 1 ? `${englishQuery} raw` : englishQuery;

      // Pobierz z USDA — Foundation + SR Legacy (oba mają najlepsze raw foods)
      // FNDDS pominięte bo ma głównie przetworzone danie (apple baked, etc.)
      const usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(searchQuery)}&pageSize=${limit}&dataType=Foundation,SR%20Legacy`;
      
      try {
        const r = await fetch(usdaUrl);
        if (!r.ok) {
          return new Response(JSON.stringify({ 
            results: [], 
            error: `USDA HTTP ${r.status}`,
            translated_query: searchQuery
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const json = await r.json();
        const foods = json.foods || [];
        
        const mappedAll: any[] = [];
        for (const f of foods.slice(0, limit)) {
          const mapped = mapUsdaProduct(f);
          if (mapped.kcal_per_100 > 0) {  // skip without kcal
            mapped.name_normalized = normalize(query);  // klucz wyszukiwania (po polsku!)
            mappedAll.push(mapped);
          }
        }

        // ── BATCH TRANSLATION przez Claude API ───────────────────────
        // Tłumacz wszystkie nazwy na raz (1 call zamiast N)
        // Cache: jeśli ktoś już szukał tej angielskiej nazwy, mamy polskie tłumaczenie
        const enNames = mappedAll.map(m => m.display_name_en).filter(Boolean);
        if (enNames.length > 0 && ANTHROPIC_API_KEY) {
          // Sprawdź cache w DB — czy już mamy polską nazwę dla tej angielskiej?
          const { data: cachedTranslations } = await supabase
            .from('food_database')
            .select('source_id, display_name')
            .eq('source', 'usda')
            .in('source_id', mappedAll.map(m => m.source_id));
          
          const cachedMap: Record<string, string> = {};
          if (cachedTranslations) {
            for (const c of cachedTranslations) {
              cachedMap[c.source_id] = c.display_name;
            }
          }

          // Filtruj tylko nieprzetłumaczone (nie ma w cache)
          const toTranslate = mappedAll
            .filter(m => !cachedMap[m.source_id])
            .map(m => m.display_name_en);

          let translations: Record<string, string> = {};
          if (toTranslate.length > 0) {
            translations = await translateBatchClaude(toTranslate);
          }

          // Zastosuj tłumaczenia: najpierw cache, potem Claude, potem fallback słownik
          for (const m of mappedAll) {
            if (cachedMap[m.source_id]) {
              m.display_name = cachedMap[m.source_id];  // cache hit
            } else if (translations[m.display_name_en]) {
              m.display_name = translations[m.display_name_en];  // Claude
            } else {
              m.display_name = translateUsdaName(m.display_name_en);  // fallback słownik
            }
          }
        } else {
          // Brak API key — fallback do słownika
          for (const m of mappedAll) {
            m.display_name = translateUsdaName(m.display_name_en);
          }
        }

        // Zapisz w cache (po source_id żeby nie duplikować)
        // USDA nie ma barcode, więc używamy unikalnego klucza source_id
        for (const m of mappedAll) {
          const { data: existing } = await supabase
            .from('food_database')
            .select('id')
            .eq('source', 'usda')
            .eq('source_id', m.source_id)
            .maybeSingle();
          
          if (!existing) {
            // Strip display_name_en (debug field, nie ma kolumny w DB)
            const { display_name_en, ...toInsert } = m;
            await supabase.from('food_database').insert(toInsert);
          }
        }

        // Strip display_name_en przed wysłaniem do frontendu (debug field)
        const cleanResults = mappedAll.map(m => {
          const { display_name_en, ...rest } = m;
          return rest;
        });

        return new Response(JSON.stringify({ 
          results: cleanResults, 
          cached: false,
          translated_query: searchQuery,
          count: cleanResults.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        console.error('USDA search error:', e);
        return new Response(JSON.stringify({ 
          results: [], 
          error: String(e?.message || e)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Invalid mode' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('food-search-usda error:', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
