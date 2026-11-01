// OKIENKO — klient maszyny wyników F6 (api.biegamy.run), wspólny dla trybu „osoba" (M2b) i biegów (M3a).
// Token użytkownika tylko w nagłówku Authorization (F6 przyjmuje wyłącznie tokeny Supabase PROD — zmierzone 1.11 z EF).
// Pamięć WSPÓLNA (dane publiczne, decyzja Filipa): klucz = RPC + argumenty, 10 min, ≤ 500 wpisów, w izolacie.
// 429 → BladF6('limit') („Maszyna wyników jest teraz zajęta"); 401/403 → 'auth'; sieć/timeout → 'siec'.
export const F6_URL = "https://api.biegamy.run";
export const F6_TTL_MS = 10 * 60 * 1000, F6_MAX_WPISOW = 500, F6_TIMEOUT_MS = 8000;
export const ODP_F6_ZAJETA = "Maszyna wyników jest teraz zajęta — spróbuj za chwilę.";

export class BladF6 extends Error { constructor(kod) { super(kod); this.kod = kod; } }

const PAMIEC = new Map();
export function _wyczyscPamiecF6() { PAMIEC.clear(); }
export function _rozmiarPamieciF6() { return PAMIEC.size; }

/** Jedno RPC F6 z pamięcią. */
export async function f6(fetchFn, token, rpc, args, teraz = Date.now()) {
  const klucz = rpc + " " + JSON.stringify(args);
  const traf = PAMIEC.get(klucz);
  if (traf && teraz - traf.t < F6_TTL_MS) return traf.dane;
  if (traf) PAMIEC.delete(klucz);
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const tm = ctrl ? setTimeout(() => ctrl.abort(), F6_TIMEOUT_MS) : null;
  let r;
  try {
    r = await fetchFn(`${F6_URL}/rpc/${rpc}`, { method: "POST", redirect: "error", signal: ctrl ? ctrl.signal : undefined,
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(args) });
  } catch { throw new BladF6("siec"); } finally { if (tm) clearTimeout(tm); }
  if (r.status === 429) throw new BladF6("limit");
  if (r.status === 401 || r.status === 403) throw new BladF6("auth");
  if (!r.ok) throw new BladF6("http " + r.status);
  const dane = await r.json().catch(() => null);
  if (!Array.isArray(dane)) throw new BladF6("ksztalt");
  PAMIEC.set(klucz, { t: teraz, dane });
  while (PAMIEC.size > F6_MAX_WPISOW) PAMIEC.delete(PAMIEC.keys().next().value);
  return dane;
}
