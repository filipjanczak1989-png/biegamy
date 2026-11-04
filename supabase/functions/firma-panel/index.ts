// firma-panel: zgłoszenia firm dla trenera (js/firmy-panel.mjs) i nocne sprzątanie (cron z x-push-secret). Logika w _shared/firma-obsluga.mjs (testy bez sieci, blizna-159).
//   * każda akcja poza sprzątaniem wymaga sesji konta z tabeli coaches; decyzja zapisuje, kto ją podjęła;
//   * lista oddaje logo i zrzut wpłaty tylko krótko ważnym adresem podpisanym (10 min), bo kubełek jest prywatny;
//   * zatwierdzenie: logo do publicznego akcja-firmy-logo, firma w akcja_firmy, zrzut i prywatne logo kasowane, podziękowanie mailem, jeśli mail działa; odrzucenie: oba pliki kasowane;
//   * sprzątanie: zrzuty po 14 dniach, e-maile 30 dni po końcu akcji (akcja_firmy_sprzatanie), pliki przez Storage API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wymagajUsera } from "../_shared/wymagaj-usera.mjs";
import { akcjaPanelu, KUBELEK } from "../_shared/firma-obsluga.mjs";

const SB_URL = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, SEKRET = Deno.env.get("PUSH_HOOK_SECRET") || "";
const RESEND = Deno.env.get("RESEND_API_KEY") || "", NADAWCA = Deno.env.get("RESEND_FROM_EMAIL") || "BiegaMy <noreply@biegamy.run>";
const DOZWOLONE = new Set(["https://biegamy.run", "https://run.biegamy.app"]);

function cors(req: Request) {
  const o = req.headers.get("origin") || "", h: Record<string, string> = { "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (DOZWOLONE.has(o)) h["Access-Control-Allow-Origin"] = o;
  return h;
}
/** Bez klucza albo przy awarii: bez błędu, zatwierdzenie jest ważniejsze. */
async function wyslijMaila(do_: string, temat: string, tresc: string) {
  if (!RESEND) return;
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND}` }, body: JSON.stringify({ from: NADAWCA, to: [do_], subject: temat, text: tresc }) });
  if (!r.ok) console.error("firma-panel mail:", r.status);
}

Deno.serve(async (req) => {
  const h = cors(req);
  const J = (s: number, d: unknown) => new Response(JSON.stringify(d), { status: s, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return J(405, { ok: false });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return J(400, { ok: false, blad: "zły JSON" }); }
  const sb = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

  if (body.rodzaj === "sprzatanie") {
    if (!SEKRET || (req.headers.get("x-push-secret") || "") !== SEKRET) return J(401, { ok: false });
    const { data, error } = await sb.rpc("akcja_firmy_sprzatanie");
    if (error) { console.error("firma-panel sprzatanie:", error.message); return J(500, { ok: false }); }
    const pliki: string[] = data?.pliki || [];
    if (pliki.length) { const r = await sb.storage.from(KUBELEK).remove(pliki); if (r.error) console.error("firma-panel kasowanie:", r.error.message); }
    return J(200, { ok: true, plikow: pliki.length, maili: data?.maile || 0 });
  }

  const user = await wymagajUsera(req);
  if (!user) return J(401, { ok: false, blad: "Zaloguj się." });
  const { data: trener } = await sb.from("coaches").select("id").eq("id", user.id).maybeSingle();
  if (!trener) return J(403, { ok: false, blad: "To konto nie jest kontem trenera." });
  const w = await akcjaPanelu({ sb, user, body, wyslijMaila });
  return J(w.status, w.body);
});
