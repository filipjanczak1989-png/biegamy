// IMPREZA-ZGLOS (K5, 1.11.2026) — zgłoszenie imprezy do kalendarza maszyny wyników (F6 event_propose).
// Wołane z zawodnik.html (saveGoal) PO zapisie celu, gdy cel nie jest powiązany ani z naszym startem, ani z imprezą
// z kalendarza. wymagajUsera (LEKCJE #20) → 401; ciało przez walidujZgloszenie (biała lista 3 pól); do F6 idzie token
// użytkownika (F6 liczy hash konta sam). Bez service_role, bez zapisu w bazie BiegaMy, bez logowania treści.
import { wymagajUsera } from "../_shared/wymagaj-usera.mjs";
import { walidujZgloszenie, zglos } from "./zglos.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const odp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return odp(405, { blad: "metoda" });
  const user = await wymagajUsera(req);
  if (!user) return odp(401, { blad: "nieautoryzowany" });
  let body: unknown;
  try { body = await req.json(); } catch { return odp(400, { blad: "json" }); }
  const w = walidujZgloszenie(body);
  if (!w.ok) return odp(400, { blad: w.blad });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const r = await zglos(fetch, jwt, w.args);
  return odp(r.status, r.wynik);
});
