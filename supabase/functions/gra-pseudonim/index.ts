// gra-pseudonim — zapis pseudonimu do rankingu Cegiełek po moderacji (Filip 4.11). Baza nie uruchomi JS, a filtr jest w JS, więc zapis idzie tędy.
//   * użytkownik WYŁĄCZNIE z tokena (getUser), nie z formularza;
//   * ten sam filtr co w przeglądarce: _shared/moderacja.mjs to kopia js/moderacja.mjs, identyczność pilnuje blizna-154;
//   * klucz serwisowy WYŁĄCZNIE do jednego RPC: gra_ustaw_pseudonim. Klient nie ma do niego EXECUTE ani grantu na kolumnę.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import '../_shared/moderacja.mjs';

const DOZWOLONE = new Set(['https://biegamy.run', 'https://run.biegamy.app']);
// deno-lint-ignore no-explicit-any
const MODERACJA = (globalThis as any).BM_MODERACJA;
const ANON = 'sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY';   // publiczny, jak w sb.js

function odpowiedz(status: number, tresc: unknown, origin: string | null) {
  const h: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, x-client-info, content-type',
  };
  if (origin && DOZWOLONE.has(origin)) h['Access-Control-Allow-Origin'] = origin;
  return new Response(status === 204 ? null : JSON.stringify(tresc), { status, headers: h });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return odpowiedz(204, null, origin);
  if (req.method !== 'POST') return odpowiedz(405, { ok: false, blad: 'Tylko POST' }, origin);

  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const SB_URL = Deno.env.get('SUPABASE_URL')!;
  const { data: { user }, error: blad } = await createClient(SB_URL, ANON).auth.getUser(jwt);
  if (blad || !user) return odpowiedz(401, { ok: false, blad: 'Sesja wygasła. Zaloguj się ponownie.' }, origin);

  let wpis: unknown = null;
  try { wpis = (await req.json())?.pseudonim; } catch { /* niżej odmowa jak przy pustym polu */ }
  const w = MODERACJA.pseudonim(typeof wpis === 'string' ? wpis : '');
  if (!w.ok) return odpowiedz(422, { ok: false, blad: w.blad }, origin);

  const admin = createClient(SB_URL, Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc('gra_ustaw_pseudonim', { p_user: user.id, p_pseudonim: w.pseudonim });
  if (error) {
    console.error('[gra-pseudonim] RPC', error.message);
    return odpowiedz(503, { ok: false, blad: 'Nie udało się zapisać. Spróbuj za chwilę.' }, origin);
  }
  if (!data?.ok) {
    const zdania: Record<string, string> = { zajety: 'Ten pseudonim jest już zajęty.', brak_profilu: 'To konto nie ma profilu zawodnika.', zly_format: 'Tylko litery, najwyżej jeden łącznik.' };
    return odpowiedz(422, { ok: false, blad: zdania[data?.powod] || 'Nie udało się zapisać.' }, origin);
  }
  return odpowiedz(200, { ok: true, pseudonim: data.pseudonim }, origin);
});
