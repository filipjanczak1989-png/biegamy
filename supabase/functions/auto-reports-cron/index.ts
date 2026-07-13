// ═══════════════════════════════════════════════════════════════
// auto-reports-cron — Supabase Edge Function
// Schedule: leci CO GODZINĘ przez Supabase Scheduled Functions
// Cron: '0 * * * *' (co godzinę o pełnej godzinie)
//
// Logika:
// 1. Pobierz obecną datę/godzinę (UTC, ale liczę dla Europe/Warsaw +1/+2)
// 2. Dla każdego zawodnika z auto_report_enabled=true 
//    AND day_of_week=current_day AND hour=current_hour 
//    → trigger generate-athlete-report (weekly)
// 3. Jeśli dziś jest 1. dzień miesiąca i auto_monthly_enabled=true
//    AND hour=auto_monthly_hour → trigger generate-athlete-report (monthly)
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseServiceKey);

    // Czas w strefie Europe/Warsaw
    // Hack: bierzemy UTC i przesuwamy o offset Polski (+1 zima, +2 lato)
    const now = new Date();
    const polandOffset = isDST(now) ? 2 : 1;  // CEST=UTC+2, CET=UTC+1
    const polandTime = new Date(now.getTime() + polandOffset * 3600 * 1000);
    
    const currentDayOfWeek = polandTime.getUTCDay();   // 0=niedziela, 6=sobota
    const currentHour = polandTime.getUTCHours();
    const currentDayOfMonth = polandTime.getUTCDate(); // 1-31
    const isFirstDayOfMonth = currentDayOfMonth === 1;
    
    console.log(`[auto-reports-cron] Polska: ${polandTime.toISOString()}, dzień=${currentDayOfWeek}, godz=${currentHour}, dzień miesiąca=${currentDayOfMonth}`);

    const stats = { weekly_triggered: 0, monthly_triggered: 0, errors: [] as string[] };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1) WEEKLY — dla zawodników z auto_report_enabled
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const { data: weeklyAthletes, error: weeklyErr } = await sb
      .from("athletes")
      .select("id, full_name, coach_id, auto_report_day_of_week, auto_report_hour, last_auto_weekly_at")
      .eq("auto_report_enabled", true)
      .eq("auto_report_day_of_week", currentDayOfWeek)
      .eq("auto_report_hour", currentHour);

    if (weeklyErr) {
      console.error("[weekly] query error:", weeklyErr);
      stats.errors.push("weekly query: " + weeklyErr.message);
    } else if (weeklyAthletes && weeklyAthletes.length > 0) {
      console.log(`[weekly] Znaleziono ${weeklyAthletes.length} zawodnika/ów do wysyłki`);
      
      for (const a of weeklyAthletes) {
        // Anti-duplicate: nie generuj jeśli ostatni weekly był < 6 dni temu
        if (a.last_auto_weekly_at) {
          const lastTime = new Date(a.last_auto_weekly_at).getTime();
          const sixDaysMs = 6 * 24 * 3600 * 1000;
          if (now.getTime() - lastTime < sixDaysMs) {
            console.log(`[weekly] SKIP ${a.id} — ostatni był ${a.last_auto_weekly_at}`);
            continue;
          }
        }
        
        try {
          // Trigger generate-athlete-report
          const genResp = await fetch(`${supabaseUrl}/functions/v1/generate-athlete-report`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              athlete_id: a.id,
              report_type: "weekly",
              auto_send: true,  // automatycznie wyśle do zawodnika (visible_to_athlete=true)
            }),
          });
          
          if (genResp.ok) {
            // Zapisz timestamp ostatniego sukcesu
            await sb.from("athletes").update({ 
              last_auto_weekly_at: now.toISOString() 
            }).eq("id", a.id);
            stats.weekly_triggered++;
            console.log(`[weekly] ✅ ${a.full_name} (${a.id})`);
          } else {
            const errText = await genResp.text();
            stats.errors.push(`weekly ${a.id}: HTTP ${genResp.status} - ${errText.substring(0, 100)}`);
            console.error(`[weekly] ❌ ${a.id}: ${errText}`);
          }
        } catch (e: any) {
          stats.errors.push(`weekly ${a.id}: ${e.message}`);
          console.error(`[weekly] ❌ ${a.id}:`, e);
        }
      }
    } else {
      console.log("[weekly] Brak zawodników do wysyłki o tej godzinie");
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2) MONTHLY — tylko jeśli dziś jest 1. dzień miesiąca
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (isFirstDayOfMonth) {
      const { data: monthlyAthletes, error: monthlyErr } = await sb
        .from("athletes")
        .select("id, full_name, coach_id, auto_monthly_hour, last_auto_monthly_at")
        .eq("auto_monthly_enabled", true)
        .eq("auto_monthly_hour", currentHour);

      if (monthlyErr) {
        console.error("[monthly] query error:", monthlyErr);
        stats.errors.push("monthly query: " + monthlyErr.message);
      } else if (monthlyAthletes && monthlyAthletes.length > 0) {
        console.log(`[monthly] Znaleziono ${monthlyAthletes.length} zawodnika/ów`);
        
        for (const a of monthlyAthletes) {
          // Anti-duplicate: nie generuj jeśli ostatni monthly był < 25 dni temu
          if (a.last_auto_monthly_at) {
            const lastTime = new Date(a.last_auto_monthly_at).getTime();
            const twentyFiveDaysMs = 25 * 24 * 3600 * 1000;
            if (now.getTime() - lastTime < twentyFiveDaysMs) {
              console.log(`[monthly] SKIP ${a.id} — ostatni był ${a.last_auto_monthly_at}`);
              continue;
            }
          }
          
          try {
            const genResp = await fetch(`${supabaseUrl}/functions/v1/generate-athlete-report`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                athlete_id: a.id,
                report_type: "monthly",
                auto_send: true,
              }),
            });
            
            if (genResp.ok) {
              await sb.from("athletes").update({ 
                last_auto_monthly_at: now.toISOString() 
              }).eq("id", a.id);
              stats.monthly_triggered++;
              console.log(`[monthly] ✅ ${a.full_name} (${a.id})`);
            } else {
              const errText = await genResp.text();
              stats.errors.push(`monthly ${a.id}: HTTP ${genResp.status}`);
              console.error(`[monthly] ❌ ${a.id}: ${errText}`);
            }
          } catch (e: any) {
            stats.errors.push(`monthly ${a.id}: ${e.message}`);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      time_poland: polandTime.toISOString(),
      day_of_week: currentDayOfWeek,
      hour: currentHour,
      is_first_of_month: isFirstDayOfMonth,
      stats,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[auto-reports-cron] Fatal error:", e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Helper: czy obecnie obowiązuje czas letni w Polsce (CEST = UTC+2)
function isDST(date: Date): boolean {
  // Ostatnia niedziela marca → ostatnia niedziela października: czas letni (UTC+2)
  const year = date.getUTCFullYear();
  
  // Ostatnia niedziela marca o 1:00 UTC (2:00 CET → 3:00 CEST)
  const marchLastSunday = new Date(Date.UTC(year, 2, 31));
  marchLastSunday.setUTCDate(31 - marchLastSunday.getUTCDay());
  marchLastSunday.setUTCHours(1, 0, 0, 0);
  
  // Ostatnia niedziela października o 1:00 UTC (3:00 CEST → 2:00 CET)
  const octoberLastSunday = new Date(Date.UTC(year, 9, 31));
  octoberLastSunday.setUTCDate(31 - octoberLastSunday.getUTCDay());
  octoberLastSunday.setUTCHours(1, 0, 0, 0);
  
  return date >= marchLastSunday && date < octoberLastSunday;
}
