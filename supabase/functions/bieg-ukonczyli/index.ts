// bieg-ukonczyli — publiczna lista „ukończyli” biegu wirtualnego dla strony bieg.html (ETAP 1, 12.11.2026). Ta sama droga co akcja-licznik:
//   * verify_jwt = false (config.toml): woła ją wylogowany człowiek;
//   * klucz serwisowy WYŁĄCZNIE do jednego RPC: akcja_bieg_ukonczyli(p_slug, p_od, p_ile, p_dystans) — funkcja oddaje imię tylko za zgodą, numer, dystans, bez kont;
//     czas i miejsce tylko za zgodą na ranking (dorośli, decyzja 13.11), liczy to SQL (akcja_bieg_czas_rankingu), nie ta funkcja;
//   * stronicowanie ?od=N (po 50), ?dystans=5|10 (ranking tego dystansu, potem reszta), cache 60 s w pamięci izolatu, CORS tylko biegamy.run i run.biegamy.app, slug z białej listy znaków.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DOZWOLONE = new Set(['https://biegamy.run', 'https://run.biegamy.app']);
const CACHE_MS = 60_000, ILE = 50;
const SLUG = /^[a-z0-9-]{3,40}$/, DYSTANS = /^[1-9][0-9]?$/;
const pamiec = new Map<string, { t: number; body: string }>();

function naglowki(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'apikey, authorization, x-client-info, content-type' };
  if (origin && DOZWOLONE.has(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

Deno.serve(async (req) => {
  const h = naglowki(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'GET') return new Response('{"error":"tylko GET"}', { status: 405, headers: h });
  const u = new URL(req.url), slug = u.searchParams.get('slug') || '', od = Math.max(0, Math.min(100000, Number(u.searchParams.get('od')) || 0));
  if (!SLUG.test(slug)) return new Response('{"error":"zły slug"}', { status: 400, headers: h });
  const dRaw = u.searchParams.get('dystans');
  if (dRaw != null && !DYSTANS.test(dRaw)) return new Response('{"error":"zły dystans"}', { status: 400, headers: h });
  const dystans = dRaw == null ? null : Number(dRaw);
  const klucz = slug + ':' + od + ':' + (dystans ?? ''), teraz = Date.now(), hit = pamiec.get(klucz);
  if (hit && teraz - hit.t < CACHE_MS) return new Response(hit.body, { status: 200, headers: { ...h, 'X-Cache': 'hit' } });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc('akcja_bieg_ukonczyli', { p_slug: slug, p_od: od, p_ile: ILE, p_dystans: dystans });
  if (error) { if (hit) return new Response(hit.body, { status: 200, headers: { ...h, 'X-Cache': 'stale' } }); return new Response('{"error":"lista niedostępna"}', { status: 503, headers: { ...h, 'Cache-Control': 'no-store' } }); }
  if (data == null) return new Response('{"error":"nie ma takiego biegu"}', { status: 404, headers: h });
  const body = JSON.stringify(data);
  pamiec.set(klucz, { t: teraz, body });
  if (pamiec.size > 50) pamiec.delete(pamiec.keys().next().value!);
  return new Response(body, { status: 200, headers: { ...h, 'X-Cache': 'miss' } });
});
