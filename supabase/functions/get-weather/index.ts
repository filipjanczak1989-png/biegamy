// ════════════════════════════════════════════════════════════════════
// BIEGAMY — Edge Function: get-weather (v2)
// ════════════════════════════════════════════════════════════════════
// Pogoda dla biegacza — geokoduje miasto przez Open-Meteo, zwraca
// forecast N-dniowy (default 3, max 16) zoptymalizowany dla biegania:
//   - temperatura min/max
//   - opady mm + szansa %
//   - wiatr km/h max
//   - ikona pogody (mapowana z WMO weather code)
//
// API: Open-Meteo (free, no key, https://open-meteo.com)
//   - Geocoding: https://geocoding-api.open-meteo.com
//   - Forecast:  https://api.open-meteo.com
//
// Cache: in-memory Map, TTL 30 min per (miasto + days)
// Auth: JWT verified
//
// v2 (2026-05-27): parametryzacja days z body (default 3, max 16)
//                  cacheKey includes days to avoid 3d/7d collision
// ════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// In-memory cache (per EF instance)
// Key: city.toLowerCase().trim() + '_' + days
// Value: { timestamp: ms, data: WeatherResponse }
const cache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

// Mapowanie WMO weather codes → emoji + nazwa PL
// https://open-meteo.com/en/docs - weather_code documentation
function weatherCodeToInfo(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: 'Słonecznie' };
  if (code === 1) return { icon: '🌤', label: 'Głównie słonecznie' };
  if (code === 2) return { icon: '⛅', label: 'Częściowe zachmurzenie' };
  if (code === 3) return { icon: '☁️', label: 'Pochmurno' };
  if (code === 45 || code === 48) return { icon: '🌫', label: 'Mgła' };
  if (code === 51 || code === 53 || code === 55) return { icon: '🌦', label: 'Mżawka' };
  if (code === 56 || code === 57) return { icon: '🌧', label: 'Marznąca mżawka' };
  if (code === 61 || code === 63 || code === 65) return { icon: '🌧', label: 'Deszcz' };
  if (code === 66 || code === 67) return { icon: '🌧', label: 'Marznący deszcz' };
  if (code === 71 || code === 73 || code === 75) return { icon: '🌨', label: 'Śnieg' };
  if (code === 77) return { icon: '🌨', label: 'Krupy śnieżne' };
  if (code === 80 || code === 81 || code === 82) return { icon: '🌧', label: 'Przelotne opady' };
  if (code === 85 || code === 86) return { icon: '🌨', label: 'Przelotne opady śniegu' };
  if (code === 95) return { icon: '⛈', label: 'Burza' };
  if (code === 96 || code === 99) return { icon: '⛈', label: 'Burza z gradem' };
  return { icon: '🌡', label: 'Pogoda' };
}

// Czy pogoda jest "trudna" dla biegacza
// Sygnał do UI że warto przesunąć trening
function isBadWeather(code: number, tempMax: number, tempMin: number, precipMm: number, precipPct: number, windKmh: number): boolean {
  // Burza
  if (code >= 95) return true;
  // Mocny deszcz lub śnieg (kody 65, 67, 75, 82, 86)
  if ([65, 67, 75, 82, 86].includes(code)) return true;
  // Wysokie opady mm
  if (precipMm >= 10) return true;
  // Duża szansa opadów + jakiekolwiek mm
  if (precipPct >= 80 && precipMm >= 2) return true;
  // Bardzo gorąco
  if (tempMax >= 30) return true;
  // Bardzo zimno
  if (tempMin <= -10) return true;
  // Silny wiatr
  if (windKmh >= 50) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── AUTH ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Brak autoryzacji" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Niezalogowany" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Body ──
    const body = await req.json();
    const cityRaw = (body?.city || '').toString().trim();
    const reqDays = Math.min(16, Math.max(1, Number(body?.days) || 3));
    if (!cityRaw || cityRaw.length < 2 || cityRaw.length > 100) {
      return new Response(
        JSON.stringify({ ok: false, _error: 'invalid_city', _message: 'Miasto musi mieć 2-100 znaków' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Cache check (key includes days to avoid 3d/7d collision) ──
    /* ⚠️ WSPÓŁRZĘDNE W KLUCZU, gdy są podane. Klucz po samej NAZWIE ma dziurę:
       kto poprawi „Kostrzyn" (mazowiecki, wybrany omyłkowo) na „Kostrzyn"
       (wielkopolski, ten właściwy), dostanie TEN SAM klucz i przez 30 minut
       widziałby pogodę ze złego miasta — uznałby, że poprawka nie zadziałała.
       Przy zmianie NAZWY klucz i tak się różni, więc ta gałąź dotyczy wyłącznie
       przypadku „ta sama nazwa, inne miejsce".
       ⚠️ Współrzędne zaokrąglone do 2 miejsc (~1 km): ten sam człowiek nie ma
       dostawać osobnego wpisu cache po przesunięciu pinezki o metr. */
    const _geo = (body?.lat != null && body?.lon != null)
      ? Number(body.lat).toFixed(2) + ',' + Number(body.lon).toFixed(2)
      : '';
    const cacheKey = cityRaw.toLowerCase() + '_' + reqDays + (_geo ? '_' + _geo : '');
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[Weather] Cache HIT for "${cityRaw}" (${reqDays}d)`);
      return new Response(
        JSON.stringify({ ...cached.data, _cached: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Weather] Cache MISS, fetching for "${cityRaw}" (${reqDays}d)`);

    // ── Krok 1: Geocoding ──
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityRaw)}&count=1&language=pl&format=json`;
    const geoResp = await fetch(geoUrl);
    if (!geoResp.ok) {
      console.error(`[Weather] Geocoding API error: ${geoResp.status}`);
      return new Response(
        JSON.stringify({ ok: false, _error: 'geocoding_api_error', _message: 'Błąd API geocoding' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const geoData = await geoResp.json();
    if (!geoData?.results || geoData.results.length === 0) {
      console.log(`[Weather] City not found: "${cityRaw}"`);
      return new Response(
        JSON.stringify({ ok: false, _error: 'city_not_found', _message: `Nie znaleziono miasta "${cityRaw}"`, city_query: cityRaw }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geo = geoData.results[0];
    const { latitude, longitude, name: foundCity, country, country_code, admin1 } = geo;

    // ── Krok 2: Forecast ──
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,cloud_cover_mean&forecast_days=${reqDays}&timezone=Europe/Warsaw`;
    const forecastResp = await fetch(forecastUrl);
    if (!forecastResp.ok) {
      console.error(`[Weather] Forecast API error: ${forecastResp.status}`);
      return new Response(
        JSON.stringify({ ok: false, _error: 'forecast_api_error', _message: 'Błąd API pogody' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const forecastData = await forecastResp.json();
    const d = forecastData?.daily;

    if (!d?.time || d.time.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, _error: 'empty_forecast', _message: 'Brak danych pogody' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Build response ──
    const days = d.time.map((date: string, i: number) => {
      const code = d.weather_code[i] ?? 0;
      const tempMax = Math.round(d.temperature_2m_max[i] ?? 0);
      const tempMin = Math.round(d.temperature_2m_min[i] ?? 0);
      const precipMm = Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10;
      const precipPct = Math.round(d.precipitation_probability_max[i] ?? 0);
      const windKmh = Math.round(d.wind_speed_10m_max[i] ?? 0);
      const cloudPct = Math.round(d.cloud_cover_mean?.[i] ?? 0);
      const info = weatherCodeToInfo(code);
      return {
        date,
        icon: info.icon,
        label: info.label,
        weather_code: code,
        cloud_pct: cloudPct,
        temp_min: tempMin,
        temp_max: tempMax,
        precip_mm: precipMm,
        precip_pct: precipPct,
        wind_kmh: windKmh,
        is_bad: isBadWeather(code, tempMax, tempMin, precipMm, precipPct, windKmh),
      };
    });

    const result = {
      ok: true,
      city: foundCity,
      country,
      country_code,
      admin1,
      latitude,
      longitude,
      days,
      _cached: false,
      _generated_at: new Date().toISOString(),
    };

    // ── Cache result ──
    cache.set(cacheKey, { timestamp: Date.now(), data: result });

    // ── Cleanup old cache entries (max 100 cities in memory) ──
    if (cache.size > 100) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) cache.delete(oldest[0]);
    }

    console.log(`[Weather] OK: ${foundCity}, ${country_code}, ${days.length} days, bad=[${days.filter((d: any) => d.is_bad).map((d: any) => d.date).join(',')}]`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[Weather] error:", err);
    return new Response(
      JSON.stringify({ ok: false, _error: 'exception', _message: err.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});