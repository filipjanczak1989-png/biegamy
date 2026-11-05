// akcja-push — pushe akcji (projekt F dzień 5, spec v3 pkt 2 + decyzje Filipa 2.11 w docs/akcja-f-spec.md pkt 10).
//   {rodzaj:'start', slug}  — z wyzwalacza akcje_push_start (pierwsze ustawienie wystartowala_at). RAZ (push_start_at).
//   {rodzaj:'niedziela'}    — cron nd 18:00 UTC: trwające akcje → „Ten tydzień: X km · razem Y km · cel w Z%". BEZ KWOT
//                             (rozliczenie jednorazowe po akcji).
//   {rodzaj:'zamkniecie'}   — cron 23:15 UTC: akcja_zamknij_dobe() (koniec = wczoraj, gdy suma dobiła) → „<cel> km. Dziękujemy."
//                             RAZ (push_zamkniecie_at).
// Odbiorcy: osoby z subskrypcją push; akcja testowa ('proba') — WYŁĄCZNIE jej konta testowe.
// Nazwa akcji i liczby tylko z bazy (repo publiczne — kod nie zdradza akcji). verify_jwt OFF, sekret x-push-secret obowiązkowy
// (brak sekretu w env = odmowa, nie furtka — jak morning-brief-cron). Wysyłka przez send-push (ścieżka systemowa).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const J = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const km = (x: unknown) => Math.round(Number(x) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

Deno.serve(async (req) => {
  const want = Deno.env.get("PUSH_HOOK_SECRET");
  if (!want || (req.headers.get("x-push-secret") || "") !== want) return J(401, { ok: false, error: "unauthorized" });
  let body: { rodzaj?: string; slug?: string } = {};
  try { body = await req.json(); } catch { return J(400, { ok: false, error: "zły JSON" }); }
  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  async function odbiorcy(a: { testowa: boolean; konta_testowe: string[] | null }) {
    if (a.testowa) return (a.konta_testowe || []).slice();
    const { data } = await sb.from("push_subscriptions").select("athlete_id");
    return [...new Set((data || []).map((r: { athlete_id: string }) => r.athlete_id).filter(Boolean))];
  }
  async function wyslij(ids: string[], title: string, tekst: string, tag: string) {
    let ok = 0;
    for (const id of ids) {
      try {
        const r = await fetch(`${URL_SB}/functions/v1/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-push-secret": want! },
          body: JSON.stringify({ athlete_id: id, title, body: tekst, url: "/zawodnik.html", type: "akcja", tag }),
        });
        if (r.ok) ok++;
      } catch { /* jeden odbiorca nie wywraca reszty */ }
    }
    return ok;
  }
  const licznik = async (slug: string) => (await sb.rpc("akcja_licznik", { p_slug: slug })).data;

  if (body.rodzaj === "start") {
    if (!body.slug || !/^[a-z0-9-]{2,40}$/.test(body.slug)) return J(400, { ok: false, error: "slug" });
    const { data: a } = await sb.from("akcje").select("id, slug, nazwa, testowa, konta_testowe, wystartowala_at, push_start_at").eq("slug", body.slug).maybeSingle();
    if (!a || !a.wystartowala_at) return J(200, { ok: true, wyslano: 0, powod: "nie wystartowała" });
    // RAZ: zajmij flagę przed wysyłką (dwa równoległe wywołania nie wyślą dwóch pushy)
    const { data: zajete } = await sb.from("akcje").update({ push_start_at: new Date().toISOString() }).eq("id", a.id).is("push_start_at", null).select("id");
    if (!zajete || !zajete.length) return J(200, { ok: true, wyslano: 0, powod: "już wysłany" });
    /* Próba idzie tylko do kont testowych, z tą samą treścią co w sobotę. W wierszu próby prawdziwej nazwy nie ma: licznik próby woła każdy zalogowany. */
    let nazwa = a.nazwa;
    if (a.testowa) { const { data: p } = await sb.from("akcje").select("nazwa").eq("testowa", false).order("start", { ascending: false }).limit(1).maybeSingle(); if (p && p.nazwa) nazwa = p.nazwa; }
    const n = await wyslij(await odbiorcy(a), "BiegaMy", `Ruszyło. ${nazwa || "Akcja"}. Każdy krok się liczy.`, `akcja-start-${a.slug}`);
    return J(200, { ok: true, wyslano: n });
  }

  if (body.rodzaj === "zamkniecie") {
    const { data: zamkniete, error } = await sb.rpc("akcja_zamknij_dobe");
    if (error) return J(500, { ok: false, error: error.message });
    let n = 0;
    for (const z of (zamkniete || []) as { slug: string; cel_km: number }[]) {
      const { data: a } = await sb.from("akcje").select("id, slug, testowa, konta_testowe").eq("slug", z.slug).maybeSingle();
      if (!a) continue;
      const { data: zajete } = await sb.from("akcje").update({ push_zamkniecie_at: new Date().toISOString() }).eq("id", a.id).is("push_zamkniecie_at", null).select("id");
      if (!zajete || !zajete.length) continue;
      n += await wyslij(await odbiorcy(a), "BiegaMy", `${km(z.cel_km)} km. Dziękujemy.`, `akcja-koniec-${a.slug}`);
    }
    return J(200, { ok: true, zamkniete: (zamkniete || []).length, wyslano: n });
  }

  if (body.rodzaj === "niedziela") {
    const { data: akcje } = await sb.from("akcje").select("id, slug, start, testowa, konta_testowe, wystartowala_at, koniec").not("wystartowala_at", "is", null).is("koniec", null);
    const dzis = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const pon = new Date(dzis + "T12:00:00Z"); pon.setUTCDate(pon.getUTCDate() - ((pon.getUTCDay() + 6) % 7));
    let n = 0;
    for (const a of akcje || []) {
      const { data: tydz } = await sb.rpc("akcja_km_okna", { p_akcja_id: a.id, p_od: pon.toISOString().slice(0, 10), p_do: dzis });
      const d = await licznik(a.slug);
      if (!d || !d.wystartowala) continue;
      const pct = Math.min(100, Math.floor(Number(d.pct) || 0));
      n += await wyslij(await odbiorcy(a), "BiegaMy", `Ten tydzień: ${km(tydz)} km · razem ${km(d.suma_km)} km · cel w ${pct}%`, `akcja-tydzien-${a.slug}-${dzis}`);
    }
    return J(200, { ok: true, wyslano: n });
  }

  return J(400, { ok: false, error: "rodzaj: start | niedziela | zamkniecie" });
});
