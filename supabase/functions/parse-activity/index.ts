// supabase/functions/parse-activity/index.ts
//
// Edge Function do parsowania publicznych aktywności Strava i Garmin
// Nie wymaga OAuth — pobiera publicznie dostępne dane z HTML strony
//
// DEPLOY:
//   1. Zainstaluj Supabase CLI: npm install -g supabase
//   2. Zaloguj się: supabase login
//   3. Link projekt: supabase link --project-ref afqojgkaveykxbltxzwm
//   4. Deploy: supabase functions deploy parse-activity --no-verify-jwt
//
// USAGE (z frontendu):
//   const r = await fetch('https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/parse-activity', {
//     method: 'POST',
//     headers: {'Content-Type':'application/json', 'Authorization': 'Bearer ' + ANON_KEY},
//     body: JSON.stringify({url: 'https://www.strava.com/activities/123'})
//   });
//   const data = await r.json();
//   // {distance_km: 10.5, duration: '52:30', pace: '5:00', elevation: 150, ...}

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ActivityData {
  distance_km?: number;
  duration?: string;
  pace?: string;
  elevation?: number;
  heart_rate?: number;
  training_type?: string;
  source: 'strava' | 'garmin' | 'unknown';
}

function parseStravaHtml(html: string): ActivityData {
  const out: ActivityData = { source: 'strava' };

  // Strava embed metadata (z meta tagów Open Graph + JSON-LD)
  // Distance: szukamy w <meta property="og:description">
  const ogDesc = html.match(/<meta property="og:description" content="([^"]+)"/);
  if (ogDesc) {
    const txt = ogDesc[1];
    // Format typu "10.5 km Run · 52:30 · 5:00 /km"
    const distMatch = txt.match(/(\d+(?:[.,]\d+)?)\s*km/i);
    if (distMatch) out.distance_km = parseFloat(distMatch[1].replace(',', '.'));

    const timeMatch = txt.match(/(\d+):(\d{2})(?::(\d{2}))?/);
    if (timeMatch) {
      out.duration = timeMatch[3]
        ? `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`
        : `${timeMatch[1]}:${timeMatch[2]}`;
    }

    const paceMatch = txt.match(/(\d+):(\d{2})\s*\/km/);
    if (paceMatch) out.pace = `${paceMatch[1]}:${paceMatch[2]}`;
  }

  // Title — typ treningu
  const title = html.match(/<title>([^<]+)<\/title>/);
  if (title) {
    const t = title[1].toLowerCase();
    if (t.includes('run') || t.includes('bieg')) out.training_type = 'Spokojny';
    if (t.includes('long')) out.training_type = 'Długi';
    if (t.includes('tempo')) out.training_type = 'Tempo';
    if (t.includes('interval')) out.training_type = 'Interwały';
  }

  // Strava ma też data-react-class="ActivityDetails" z propsami JSON
  const reactProps = html.match(/data-react-props="([^"]+)"/);
  if (reactProps) {
    try {
      const decoded = reactProps[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      const data = JSON.parse(decoded);
      if (data.activity?.distance) {
        out.distance_km = parseFloat((data.activity.distance / 1000).toFixed(2));
      }
      if (data.activity?.elapsed_time) {
        const s = data.activity.elapsed_time;
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        out.duration = h > 0
          ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
          : `${m}:${String(sec).padStart(2,'0')}`;
      }
      if (data.activity?.total_elevation_gain) {
        out.elevation = Math.round(data.activity.total_elevation_gain);
      }
    } catch (e) {
      // ignoruj — fallback na og:description
    }
  }

  return out;
}

function parseGarminHtml(html: string): ActivityData {
  const out: ActivityData = { source: 'garmin' };

  // Garmin Connect używa również og:description + Schema.org JSON-LD
  const ogDesc = html.match(/<meta property="og:description" content="([^"]+)"/);
  if (ogDesc) {
    const txt = ogDesc[1];
    const distMatch = txt.match(/(\d+(?:[.,]\d+)?)\s*km/i);
    if (distMatch) out.distance_km = parseFloat(distMatch[1].replace(',', '.'));
    const timeMatch = txt.match(/(\d+):(\d{2})(?::(\d{2}))?/);
    if (timeMatch) {
      out.duration = timeMatch[3]
        ? `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`
        : `${timeMatch[1]}:${timeMatch[2]}`;
    }
  }

  // Garmin JSON-LD
  const jsonLd = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd[1]);
      if (data.distance?.value) {
        out.distance_km = parseFloat((data.distance.value / 1000).toFixed(2));
      }
    } catch (e) {}
  }

  return out;
}

// Oblicz tempo jeśli mamy dystans i czas
function computePace(distance_km?: number, duration?: string): string | undefined {
  if (!distance_km || !duration) return undefined;
  const parts = duration.split(':').map(Number);
  let totalSec = 0;
  if (parts.length === 3) totalSec = parts[0]*3600 + parts[1]*60 + parts[2];
  else if (parts.length === 2) totalSec = parts[0]*60 + parts[1];
  else return undefined;

  const paceSecPerKm = totalSec / distance_km;
  const min = Math.floor(paceSecPerKm / 60);
  const sec = Math.round(paceSecPerKm % 60);
  return `${min}:${String(sec).padStart(2,'0')}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'Brak URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Walidacja: tylko Strava i Garmin
    const isStrava = /strava\.com\/activities\/\d+/.test(url);
    const isGarmin = /connect\.garmin\.com\/(modern\/)?activity\/\d+/.test(url);

    if (!isStrava && !isGarmin) {
      return new Response(JSON.stringify({
        error: 'Tylko linki Strava (/activities/123) lub Garmin Connect (/activity/123)'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pobierz HTML
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BiegaMy/1.0; +https://biegamy.run)',
      },
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({
        error: `Nie można pobrać strony (${resp.status}). Aktywność może być prywatna.`
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = await resp.text();
    const data = isStrava ? parseStravaHtml(html) : parseGarminHtml(html);

    // Oblicz tempo jeśli brakuje
    if (!data.pace) {
      const pace = computePace(data.distance_km, data.duration);
      if (pace) data.pace = pace;
    }

    // Sprawdź czy cokolwiek udało się sparsować
    if (!data.distance_km && !data.duration) {
      return new Response(JSON.stringify({
        error: 'Nie udało się sparsować danych. Aktywność prywatna lub format strony się zmienił.',
        source: data.source,
      }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
