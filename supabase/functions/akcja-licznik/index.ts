// akcja-licznik — publiczny licznik akcji dla niezalogowanych (landing, dla-fabianka.html). Projekt F, 2.11.2026.
//
// Wariant (b), decyzja Filipa 2.11: rola anonimowa NIE dostaje EXECUTE na akcja_licznik (bramka commitów traktuje
// uprawnienia dla anon jako blokadę twardą i zostaje bez wyjątku). Zamiast tego ta EF:
//   * verify_jwt = false (config.toml) — woła ją wylogowany człowiek z Facebooka;
//   * klucz serwisowy WYŁĄCZNIE do jednego RPC: akcja_licznik(p_slug). Żadnego .from(), żadnego innego .rpc() —
//     pilnuje blizna-94. Licznik i tak zwraca same agregaty, a przed startem nic, co zdradza akcję;
//   * cache 60 s w pamięci izolatu (napór po poście w grupach biegowych nie trafia w bazę przy każdym wejściu)
//     + wspólne zapytanie: gdy pamięć wygasła, równoległe wejścia czekają na JEDNO zapytanie do bazy, zamiast słać każde swoje (zmierzone 4.11: 2000 wejść naraz = 2000 zapytań bez tego, 1 z tym);
//     + Cache-Control public, max-age=60 dla przeglądarki;
//   * CORS tylko biegamy.run i run.biegamy.app; slug z białej listy znaków.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DOZWOLONE = new Set(['https://biegamy.run', 'https://run.biegamy.app']);
const CACHE_MS = 60_000, CACHE_PRZED_STARTEM_MS = 5_000;   // przed guzikiem krótko: strona otwarta przed telewizorem ma przejść na akcję od razu
const KROTKO = { 'Cache-Control': 'public, max-age=5' };
const SLUG = /^[a-z0-9-]{2,40}$/;
const pamiec = new Map<string, { t: number; body: string; po: boolean }>();
const wTrakcie = new Map<string, Promise<{ data: any; error: any }>>();

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
  const origin = req.headers.get('origin');
  const h = naglowki(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'GET') return new Response('{"error":"tylko GET"}', { status: 405, headers: h });

  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (!SLUG.test(slug)) return new Response('{"error":"zły slug"}', { status: 400, headers: h });

  const teraz = Date.now();
  const hit = pamiec.get(slug);
  if (hit && teraz - hit.t < (hit.po ? CACHE_MS : CACHE_PRZED_STARTEM_MS)) return new Response(hit.body, { status: 200, headers: { ...h, ...(hit.po ? {} : KROTKO), 'X-Cache': 'hit' } });

  let zadanie = wTrakcie.get(slug);
  if (!zadanie) {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    zadanie = Promise.resolve(sb.rpc('akcja_licznik', { p_slug: slug })).finally(() => wTrakcie.delete(slug)) as Promise<{ data: any; error: any }>;
    wTrakcie.set(slug, zadanie);
  }
  const { data, error } = await zadanie;
  if (error) {
    // Przy błędzie bazy oddaj ostatni znany stan (nawet starszy niż 60 s) zamiast pustego paska.
    if (hit) return new Response(hit.body, { status: 200, headers: { ...h, 'X-Cache': 'stale' } });
    return new Response('{"error":"licznik niedostępny"}', { status: 503, headers: { ...h, 'Cache-Control': 'no-store' } });
  }
  if (data == null) return new Response('{"error":"nie ma takiej akcji"}', { status: 404, headers: h });
  if (data.testowa === true) return new Response('{"error":"nie ma takiej akcji"}', { status: 404, headers: h });   // audyt 2.11: próba nie jest publiczna

  const body = JSON.stringify(data);
  pamiec.set(slug, { t: teraz, body, po: data.wystartowala === true });
  if (pamiec.size > 20) pamiec.delete(pamiec.keys().next().value!);
  return new Response(body, { status: 200, headers: { ...h, ...(data.wystartowala === true ? {} : KROTKO), 'X-Cache': 'miss' } });
});
