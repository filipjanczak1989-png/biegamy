// bieg-rezygnacja — BIEG WIRTUALNY, ETAP 2: rezygnacja z e-maila o biegu jednym kliknięciem, bez logowania (link z e-maila → bieg.html?rezygnacja=<token> → POST tutaj,
// albo nagłówek List-Unsubscribe-Post klienta poczty → POST ?token=). verify_jwt = false (config.toml): woła wylogowany człowiek albo serwer poczty.
// Klucz serwisowy WYŁĄCZNIE do jednego RPC: akcja_bieg_rezygnacja(p_token) — gasi zgodę konta w tym jednym biegu i oddaje tylko nazwę biegu. Token = losowy UUID z tabeli zgód.
// CORS tylko biegamy.run i run.biegamy.app; bez ciasteczek; odpowiedź bez danych osoby.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DOZWOLONE = new Set(['https://biegamy.run', 'https://run.biegamy.app']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function naglowki(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'apikey, authorization, x-client-info, content-type' };
  if (origin && DOZWOLONE.has(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

Deno.serve(async (req) => {
  const h = naglowki(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'POST') return new Response('{"error":"tylko POST"}', { status: 405, headers: h });
  let token = new URL(req.url).searchParams.get('token') || '';
  if (!token && (req.headers.get('content-type') || '').includes('application/json')) { try { const b = await req.json(); token = typeof b?.token === 'string' ? b.token : ''; } catch { token = ''; } }
  if (!UUID.test(token)) return new Response('{"ok":false,"powod":"zly_link"}', { status: 400, headers: h });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc('akcja_bieg_rezygnacja', { p_token: token });
  if (error) { console.error('bieg-rezygnacja:', error.message); return new Response('{"ok":false,"powod":"blad"}', { status: 503, headers: h }); }
  const ok = !!(data && data.ok);
  return new Response(JSON.stringify(ok ? { ok: true, nazwa: String(data.nazwa || '') } : { ok: false, powod: 'nie_ma' }), { status: ok ? 200 : 404, headers: h });
});
