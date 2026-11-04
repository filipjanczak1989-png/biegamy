// gra-ranking — publiczne rankingi Cegiełek dla niezalogowanych (Filip 4.11), wzorzec akcja-licznik.
//   * verify_jwt = false (config.toml): gracz z Facebooka nie ma konta, a anon nie dostaje EXECUTE na gra_ranking;
//   * klucz serwisowy WYŁĄCZNIE do gra_ranking() i gra_token_ok(). Żadnego .from(), żadnego innego .rpc() (blizna-154);
//   * funkcja oddaje tylko pseudonim, wynik, postać, sumę Muru i stan przełącznika, bez identyfikatorów kont;
//   * prywatny link (?t=): odpowiedź z polem prywatny, bez cache w przeglądarce. Sam token nie jest logowany;
//   * cache 60 s w pamięci izolatu + Cache-Control public, max-age=60; CORS tylko biegamy.run i run.biegamy.app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DOZWOLONE = new Set(['https://biegamy.run', 'https://run.biegamy.app']);
const CACHE_MS = 60_000;
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
let pamiec: { t: number; body: string } | null = null;
// deno-lint-ignore no-explicit-any
let wTrakcie: Promise<{ data: any; error: any }> | null = null;

function naglowki(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, x-client-info, content-type',
  };
  if (origin && DOZWOLONE.has(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

Deno.serve(async (req) => {
  const h = naglowki(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'GET') return new Response('{"error":"tylko GET"}', { status: 405, headers: h });

  const token = new URL(req.url).searchParams.get('t') || '';
  const teraz = Date.now();
  if (!token && pamiec && teraz - pamiec.t < CACHE_MS) return new Response(pamiec.body, { status: 200, headers: { ...h, 'X-Cache': 'hit' } });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Gdy pamięć wygasła, równoległe wejścia czekają na jedno zapytanie do bazy.
  if (!wTrakcie) wTrakcie = Promise.resolve(sb.rpc('gra_ranking')).finally(() => { wTrakcie = null; });
  const { data, error } = await wTrakcie;
  if (error) {
    console.error('[gra-ranking] RPC', error.message);
    if (pamiec) return new Response(pamiec.body, { status: 200, headers: { ...h, 'X-Cache': 'stale' } });   // baza padła: ostatni znany ranking zamiast pustki
    return new Response('{"error":"chwilowo niedostępny"}', { status: 503, headers: { ...h, 'Cache-Control': 'no-store' } });
  }
  const body = JSON.stringify(data);
  pamiec = { t: teraz, body };
  if (!token) return new Response(body, { status: 200, headers: h });
  const { data: pasuje } = TOKEN.test(token) ? await sb.rpc('gra_token_ok', { p_token: token }) : { data: false };
  return new Response(JSON.stringify({ ...data, prywatny: pasuje === true }), { status: 200, headers: { ...h, 'Cache-Control': 'no-store' } });
});
