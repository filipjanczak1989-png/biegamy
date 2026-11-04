// firma-zgloszenie: formularz „Twoja firma na Ulicy” ze strony akcji, bez logowania. Logika w _shared/firma-obsluga.mjs (testy bez sieci, blizna-159).
//   * przełącznik akcje.firmy_zgloszenia i limit 3/h na IP sprawdza baza, zanim cokolwiek zostanie wgrane; pole-pułapka dla botów;
//   * pliki sprawdzane po bajtach, tylko PNG, JPG, WebP do 2 MB, SVG odpada; wyłącznie do PRYWATNEGO kubełka firmy-zgloszenia;
//   * logo ≤ 400 px skaluje przeglądarka. Większe PNG i JPG skaluje tu biblioteka ładowana dopiero wtedy, żeby zwykłe zgłoszenie od niej nie zależało. Zapis wtedy w PNG, bo biblioteka nie zapisuje WebP;
//   * nic publicznie: decyzję podejmuje trener w panelu (EF firma-panel); push tylko do konta Filipa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "../_shared/moderacja.mjs";
import { KOMPLET_MAKS, przyjmijZgloszenie } from "../_shared/firma-obsluga.mjs";
import { LOGO_BOK } from "../_shared/firma-zgloszenie.mjs";

const SB_URL = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, SEKRET = Deno.env.get("PUSH_HOOK_SECRET") || "";
const KONTO_FILIPA = "56092926-2cf1-44b6-952f-38614497fdc2";
const DOZWOLONE = new Set(["https://biegamy.run", "https://run.biegamy.app"]);
const MODERACJA = (globalThis as any).BM_MODERACJA;

function cors(req: Request) {
  const o = req.headers.get("origin") || "", h: Record<string, string> = { "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (DOZWOLONE.has(o)) h["Access-Control-Allow-Origin"] = o;
  return h;
}
async function skrotIp(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "brak";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "|" + SERVICE.slice(0, 16)));
  return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function przeskalujLogo(b: Uint8Array) {
  const { decode } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
  const im: any = await decode(b);
  const sk = Math.min(1, LOGO_BOK / Math.max(im.width, im.height));
  im.resize(Math.max(1, Math.round(im.width * sk)), Math.max(1, Math.round(im.height * sk)));
  return new Uint8Array(await im.encode(2));
}

Deno.serve(async (req) => {
  const h = cors(req);
  const J = (s: number, d: unknown) => new Response(JSON.stringify(d), { status: s, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return J(405, { ok: false });
  if (Number(req.headers.get("content-length") || 0) > KOMPLET_MAKS) return J(413, { ok: false, blad: "Pliki są za duże: razem do 5 MB." });
  let f: FormData;
  try { f = await req.formData(); } catch { return J(400, { ok: false, blad: "Nie udało się odczytać formularza." }); }
  const sb = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
  const w = await przyjmijZgloszenie({
    dane: f, ipSkrot: await skrotIp(req), sb, moderacja: MODERACJA, przeskaluj: przeskalujLogo,
    // Brak subskrypcji albo wygasła: send-push kończy bez wysyłki, zgłoszenie czeka w panelu i w liczniku „Firmy do sprawdzenia”.
    powiadom: (p: Record<string, string>) => fetch(`${SB_URL}/functions/v1/send-push`, { method: "POST", headers: { "Content-Type": "application/json", "x-push-secret": SEKRET }, body: JSON.stringify({ athlete_id: KONTO_FILIPA, ...p }) }),
  });
  return J(w.status, w.body);
});
