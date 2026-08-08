// EF miesiac-cron — podsumowanie miesiąca dla każdego, kto w nim biegał.
// Wołany przez pg_cron 1. dnia miesiąca (job `miesiac-karta`). verify_jwt=OFF,
// autoryzacja przez x-push-secret — ten sam handshake co detect-moment i morning-brief-cron.
//
// RENDER LENIWY: ten EF NIE robi kart. Wstawia moment i powiadomienie; PNG powstaje dopiero
// przy pierwszym kliknięciu w baner (share-card, tryb {moment_id}). Dwadzieścia osiem renderów
// po ~3 s w jednym wywołaniu to prosta droga do WORKER_LIMIT — znane z backfillu miniatur,
// gdzie limit wymusił batch po 6.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUSH_HOOK_SECRET = Deno.env.get("PUSH_HOOK_SECRET");

const MIESIACE_MIANOWNIK = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec",
                            "Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];

Deno.serve(async (req) => {
  // GUARD: cron musi nieść x-push-secret. EF ma verify_jwt=OFF, więc to jedyna bramka.
  const gotSecret = req.headers.get("x-push-secret") || "";
  if (!PUSH_HOOK_SECRET || gotSecret !== PUSH_HOOK_SECRET) {
    return new Response("forbidden", { status: 401 });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Podsumowujemy miesiąc POPRZEDNI względem dnia uruchomienia — cron chodzi 1. dnia,
  // więc zamykamy to, co właśnie się skończyło. Okres jest domknięty z definicji,
  // więc bramka „czy już po", potrzebna przy karcie tygodniowej, tutaj nie ma sensu.
  const teraz = new Date();
  const pierwszyBiez = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), 1));
  const pierwszyPoprz = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth() - 1, 1));
  const klucz = pierwszyPoprz.toISOString().slice(0, 7); // 'RRRR-MM'

  // KTO DOSTAJE KARTĘ: zawodnik z ≥1 BIEGIEM w tym miesiącu. Zero biegów → brak momentu,
  // nie pusta karta. Rower i siłownia nie kwalifikują — spójnie z resztą silnika.
  //
  // Decyzję podejmuje funkcja SQL `suma_biegowa`, TA SAMA, której używa share-card przy
  // renderze. Dzięki temu ten EF nie potrzebuje własnej kopii listy typów biegowych
  // (czwarta kopia byłaby o jedną za dużo) i nie może uznać kogoś za biegacza inaczej,
  // niż uzna go karta — powiadomienie i treść zawsze mówią to samo.
  const { data: aths, error: errAth } = await sb.from("athletes").select("id");
  if (errAth) {
    console.error("[miesiac-cron] athletes:", errAth.message);
    return Response.json({ ok: false, error: "athletes" }, { status: 500 });
  }

  let wstawionych = 0, pominietych = 0;
  for (const a of (aths || [])) {
    const athleteId = a.id;
    const { data: agg } = await sb.rpc("suma_biegowa", {
      p_athlete_id: athleteId, p_od: pierwszyPoprz.toISOString(), p_do: pierwszyBiez.toISOString(),
    });
    const ile = Number((Array.isArray(agg) ? agg[0] : agg)?.ile ?? 0);
    if (ile < 1) continue;                                        // zero biegów → brak momentu

    // Idempotencja warstwa 1: sprawdzenie przed wstawką. Warstwa 2 to indeks
    // delivered_moments_miesiac_uniq — ten z sierpnia obejmuje tylko `pending`,
    // a te wstawiamy jako `approved`, więc sam by nie wystarczył.
    const { data: juz } = await sb.from("delivered_moments")
      .select("id").eq("athlete_id", athleteId).eq("type", "miesiac")
      .eq("evidence->>miesiac", klucz).maybeSingle();
    if (juz) { pominietych++; continue; }

    // status 'approved' od razu: to podsumowanie WŁASNYCH danych, nie osiągnięcie
    // do oceny. Żelazna zasada dotyczy momentów, które trener waży — tutaj nie ma
    // czego ważyć, jest rachunek. Ścieżka dostarczenia zostaje wspólna.
    const { error } = await sb.from("delivered_moments").insert({
      athlete_id: athleteId, type: "miesiac",
      evidence: { miesiac: klucz }, payload: {}, status: "approved",
    });
    if (error) { console.error("[miesiac-cron] insert", athleteId, error.message); continue; }

    await sb.from("notifications").insert({
      athlete_id: athleteId, type: "moment", from_athlete_id: null,
      message: MIESIACE_MIANOWNIK[+klucz.slice(5) - 1] + " w liczbach. Zobacz kartę.",
      read: false, created_at: new Date().toISOString(),
    });
    wstawionych++;

    // ROZŁOŻENIE W CZASIE: 100 ms między wstawkami do notifications. Nie chodzi
    // o obciążenie (28 wierszy to nic), tylko o to, że jednoczesny dzwonek u wszystkich
    // o szóstej rano wygląda jak awaria, a nie jak funkcja. Całość i tak zamyka się
    // w ~3 s, więc limit czasu EF nie jest zagrożony.
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`[miesiac-cron] ${klucz}: wstawiono ${wstawionych}, pominięto ${pominietych}`);
  return Response.json({ ok: true, miesiac: klucz, wstawionych, pominietych });
});
