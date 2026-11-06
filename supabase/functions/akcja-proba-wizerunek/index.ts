// akcja-proba-wizerunek: Ścieżka Fabianka. Rysunek, arkusz i film akcji na próbie, wyłącznie dla trenera i kont testowych akcji proba.
//   * licznik NIGDY nie oddaje tych adresów dla akcji testowej, bo licznik może wywołać każdy; ta funkcja jest osobną drogą z osobną kontrolą;
//   * bez sesji 401, zwykłe konto 403, a konto nie dostaje ani nazwy pliku, ani adresu;
//   * adresy podpisane na 15 minut, bez pamięci po stronie przeglądarki i pośredników. Dane pozostają w prywatnym kubełku akcja-wizerunek;
//   * firmy próby dla podglądu w grze: gra nie woła licznika akcji sama (blizna-154);
//   * nazwa, imię i adres zbiórki prawdziwej akcji: próba ma wyglądać jak sobota, a w wierszu próby ich nie ma, bo licznik próby woła każdy zalogowany;
//   * muzyka: adresy na 15 minut, te same pliki co w sobotę, bo licznik nie oddaje ich dla próby;
//   * proba_od: chwila startu próby. Gra czyści nią lokalny postęp po „Od zera” także na innym telefonie.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wymagajUsera } from "../_shared/wymagaj-usera.mjs";
import { odpowiedzWizerunku } from "../_shared/proba-wizerunek.mjs";

const SB_URL = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOZWOLONE = new Set(["https://biegamy.run", "https://run.biegamy.app"]);

function cors(req: Request) {
  const o = req.headers.get("origin") || "", h: Record<string, string> = { "Vary": "Origin", "Cache-Control": "no-store", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (DOZWOLONE.has(o)) h["Access-Control-Allow-Origin"] = o;
  return h;
}

Deno.serve(async (req) => {
  const h = cors(req);
  const J = (s: number, d: unknown) => new Response(JSON.stringify(d), { status: s, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return J(405, { ok: false });
  const user = await wymagajUsera(req);
  const sb = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
  const w = await odpowiedzWizerunku(sb, user);
  return J(w.status, w.body);
});
