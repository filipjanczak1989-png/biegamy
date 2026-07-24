// ═══════════════════════════════════════════════════════════════════
// morning-brief-cron — Supabase Edge Function
// Poranny push "odprawy" do zawodnika — TYLKO gdy jest realny sygnal
// (zmeczenie / swiezosc / trening dzis / start w 3 dni) I gdy morning_push_enabled != false.
// Wysyla przez insert do notifications (typ 'nowosc' -> klik do Formy; trigger push zyje).
// Wagi TRIMP = swiadomy duplikat sb.js (jak RAPORT-AI+/BRIEF+/PLANER-2).
// verify_jwt: ustawic OFF przy deployu (cron woła sam siebie bez JWT) -> --no-verify-jwt
// ═══════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const EFF: Record<string, number> = { 'odpoczynek':0,'regeneracja':1.0,'spokojny':1.5,'bieg spokojny':1.5,'wybieganie':2.0,'długi':2.5,'wzmacniający':1.5,'zastępczy':1.5,'tempo':3.5,'progresja':3.0,'interwały':4.5,'start':5.0,'wyścig':5.0 };
const FEEL: Record<string, number> = { good:1.0, mid:1.1, bad:1.3 };
const dMin = (d: any) => { const t=String(d||'').trim(); if(!t) return 0; const p=t.split(':').map(Number); if(p.some(isNaN)) return 0; return p.length===3?p[0]*60+p[1]+p[2]/60:p.length===2?p[0]+p[1]/60:(+t||0); };

serve(async (req) => {
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const dzisStr = new Date().toISOString().slice(0, 10);
    const za3 = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);

    // zawodnicy z wlaczonym porannym pushem (default true — tylko jawne false pomijamy)
    const { data: aths } = await sb.from("athletes")
      .select("id, full_name, morning_push_enabled")
      .or("morning_push_enabled.is.null,morning_push_enabled.eq.true");
    if (!aths || !aths.length) return json({ ok: true, sent: 0, reason: "no athletes" });

    const ids = aths.map((a: any) => a.id);
    const od90 = new Date(Date.now() - 90 * 864e5).toISOString();
    const { data: l90 } = await sb.from("training_logs")
      .select("athlete_id,logged_at,training_type,duration,feel")
      .in("athlete_id", ids).gte("logged_at", od90)
      .not("training_type", "like", "__badge__%");

    // wellness 8 dni (gotowosc)
    const odW = new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10);
    const { data: wel } = await sb.from("wellness")
      .select("athlete_id,date,resting_hr,hrv").in("athlete_id", ids).gte("date", odW)
      .order("date", { ascending: false });
    const perW: Record<string, any[]> = {};
    (wel || []).forEach((w: any) => { (perW[w.athlete_id] = perW[w.athlete_id] || []).push(w); });

    // treningi zaplanowane na dzis
    const { data: planToday } = await sb.from("trainings")
      .select("athlete_id").in("athlete_id", ids).eq("date", dzisStr);
    const maTreningDzis = new Set((planToday || []).map((t: any) => t.athlete_id));

    // starty w 3 dni (race_signups + races)
    const { data: rc } = await sb.from("races").select("id,date").gte("date", dzisStr).lte("date", za3);
    let maStart = new Set<string>();
    if (rc && rc.length) {
      const { data: sg } = await sb.from("race_signups")
        .select("athlete_id").in("race_id", rc.map((r: any) => r.id)).in("athlete_id", ids);
      maStart = new Set((sg || []).map((x: any) => x.athlete_id));
    }

    // TRIMP per dzien per zawodnik
    const dni: Record<string, Record<string, number>> = {};
    for (const l of (l90 || [])) {
      const typ = String(l.training_type||'').toLowerCase().trim();
      const tr = dMin(l.duration) * (EFF[typ] !== undefined ? EFF[typ] : 1.5) * (FEEL[String(l.feel)] || 1.0);
      const dk = String(l.logged_at).slice(0, 10);
      (dni[l.athlete_id] = dni[l.athlete_id] || {})[dk] = ((dni[l.athlete_id] || {})[dk] || 0) + tr;
    }

    let sent = 0;
    for (const a of aths) {
      const d = dni[a.id] || {};
      let ctl = 0, atl = 0;
      for (let k = 89; k >= 0; k--) { const ds = new Date(Date.now() - k * 864e5).toISOString().slice(0, 10); const t = d[ds] || 0; ctl += (t - ctl) * (1/42); atl += (t - atl) * (1/7); }
      const tsb = Math.round(ctl - atl);

      // gotowosc z wellness
      let zmeczonyWell = false;
      const wl = perW[a.id];
      if (wl && wl.length >= 3) {
        const o = wl[0], baza = wl.slice(1);
        const sr = (arr: any[]) => { const v = arr.filter((x: any) => x != null); return v.length ? v.reduce((x: number, y: number) => x + y, 0) / v.length : null; };
        const bR = sr(baza.map((x: any) => x.resting_hr)), bH = sr(baza.map((x: any) => x.hrv));
        zmeczonyWell = (o.resting_hr != null && bR != null && (o.resting_hr - bR) > 5)
          || (o.hrv != null && bH != null && bH > 0 && (bH - o.hrv) / bH > 0.15);
      }

      // ── SYGNAL: czy w ogole wysylac? (cisza gdy nic sie nie dzieje) ──
      let msg = null;
      if (zmeczonyWell) {
        msg = "☀️ Twój organizm jeszcze pracuje — dziś lepiej spokojnie. Zobacz poranną odprawę.";
      } else if (tsb <= -25) {
        msg = "☀️ Zmęczenie siedzi w nogach — dziś nic mocnego. Sprawdź poranną odprawę.";
      } else if (maStart.has(a.id)) {
        msg = "🏁 Start coraz bliżej! Zobacz gotowość i plan na dziś w porannej odprawie.";
      } else if (tsb >= 15 && maTreningDzis.has(a.id)) {
        msg = "🚀 Jesteś świeży, a dziś masz trening — dobry dzień na mocny akcent. Zobacz odprawę.";
      } else if (maTreningDzis.has(a.id)) {
        msg = "☀️ Masz dziś trening w planie. Zajrzyj do porannej odprawy przed wyjściem.";
      }
      // brak sygnalu -> CISZA (szacunek do uwagi)
      if (!msg) continue;

      // anty-dubel: max 1 poranny push dziennie
      const { data: existing } = await sb.from("notifications")
        .select("id").eq("athlete_id", a.id).eq("type", "nowosc")
        .gte("created_at", dzisStr + "T00:00:00").limit(1);
      if (existing && existing.length) continue;

      await sb.from("notifications").insert({
        athlete_id: a.id, type: "nowosc", message: msg, read: false,
        created_at: new Date().toISOString()
      });
      sent++;
    }

    return json({ ok: true, sent, total: aths.length });
  } catch (e) {
    console.error("[morning-brief-cron]", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
