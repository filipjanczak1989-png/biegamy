// Bramka tożsamości dla EF wołanych z frontu: JWT z nagłówka → getUser() → null, gdy nie ma usera.
//
// Ten sam wzorzec, który od lipca 2026 stoi w intervals-oauth (index.ts:17-20). Wyniesiony tu
// 06.10.2026, bo wchodził naraz do SZEŚCIU EF-ów (ocr-training-screen, food-micronutrients,
// generate-recipe, food-image-fetch, food-search-off, food-search-usda),
// które do tego dnia NIE sprawdzały, kto je woła — a chodziły po service_role i na nasz
// rachunek Anthropic/Unsplash/USDA. Sześć kopii pięciu linii to ta sama choroba co RUN_TYPES.
//
// ⚠️ REGUŁA (LEKCJE #20): to jest JEDYNA bramka usera dla EF wołanych z frontu. Nowy EF
// wołany z przeglądarki bez `wymagajUsera` na wejściu to błąd, nie wybór.
//
// ⚠️ Dlaczego getUser(), a nie dekodowanie payloadu JWT: payload da się sfałszować bez klucza
// (generate-recipe robił tak do 06.10 — `decodeJwtSub`). getUser() pyta GoTrue, więc podpis
// jest sprawdzony po stronie Supabase. Koszt: jeden round-trip na wywołanie.
//
// ⚠️ Klucz publikowalny jako literał, nie z env: SUPABASE_ANON_KEY wstrzykiwane do EF to
// legacy JWT, który zniknie przy „Disable legacy anon" — literał przetrwa (ten sam powód
// i ten sam klucz co w intervals-oauth i sb.js:36).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL");
const PUBLISHABLE = "sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY";

/** Zwraca usera z sesji albo null. Nie rzuca — brak nagłówka, zły token i awaria GoTrue
 *  wyglądają dla wołającego tak samo: 401. */
export async function wymagajUsera(req) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt || !SB_URL) return null;
  try {
    const u = createClient(SB_URL, PUBLISHABLE, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: { user } } = await u.auth.getUser();
    return user || null;
  } catch (_) {
    return null;
  }
}
