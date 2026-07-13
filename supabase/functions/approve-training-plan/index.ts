// ════════════════════════════════════════════════════════════════════
// BIEGAMY — Edge Function: approve-training-plan (v1)
// ════════════════════════════════════════════════════════════════════
// Akceptuje plan AI i wstawia treningi do public.trainings (kalendarz).
// Plan C — wykrywa konflikty z istniejącymi treningami.
//
// 2 tryby (na podstawie param `action`):
//
//   action = 'check_conflicts':
//     Tylko sprawdza i zwraca listę konfliktów (które dni mają już treningi).
//     NIC NIE WSTAWIA. Frontend pokazuje confirm dialog z opcjami.
//
//   action = 'approve':
//     Insertuje treningi do `trainings`, oznacza plan jako approved.
//     Param `conflict_resolution`:
//       - 'overwrite' — nadpisz istniejące (delete + insert)
//       - 'skip' — pomiń dni z konfliktem
//       - 'keep_both' — wstaw obok (zawodnik może mieć 2 treningi/dzień)
// ════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    // ─── Auth check ─────
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing auth token" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const coachId = user.id;

    // ─── Parse body ─────
    const body = await req.json();
    const {
      plan_id,
      action = "check_conflicts", // 'check_conflicts' | 'approve'
      conflict_resolution = "skip", // 'overwrite' | 'skip' | 'keep_both'
    } = body;

    if (!plan_id) {
      return new Response(JSON.stringify({ error: "Missing plan_id" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ─── Service role client ─────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ─── Pobierz plan + sprawdź ownership ─────
    const { data: plan, error: planErr } = await supabase
      .from("training_plans")
      .select("id, athlete_id, coach_id, status, start_date, end_date, plan_type")
      .eq("id", plan_id)
      .maybeSingle();

    if (planErr || !plan) {
      return new Response(JSON.stringify({ error: "Plan nie istnieje" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (plan.coach_id !== coachId) {
      return new Response(JSON.stringify({ error: "Nie jesteś trenerem tego planu" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (plan.status === "approved") {
      return new Response(JSON.stringify({ error: "Plan już został zaakceptowany" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ─── Pobierz workouts z planu ─────
    const { data: planWorkouts, error: workoutsErr } = await supabase
      .from("training_plan_workouts")
      .select("*")
      .eq("plan_id", plan_id)
      .order("date");

    if (workoutsErr || !planWorkouts || planWorkouts.length === 0) {
      return new Response(JSON.stringify({ error: "Plan nie ma treningów" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ─── Sprawdź konflikty: czy w danym zakresie dat są już treningi w trainings ─────
    const { data: existingTrainings } = await supabase
      .from("trainings")
      .select("id, date, type, distance_km, status")
      .eq("athlete_id", plan.athlete_id)
      .gte("date", plan.start_date)
      .lte("date", plan.end_date);

    const conflictsByDate: Record<string, any[]> = {};
    for (const t of existingTrainings || []) {
      if (!conflictsByDate[t.date]) conflictsByDate[t.date] = [];
      conflictsByDate[t.date].push(t);
    }

    const conflictDates = Object.keys(conflictsByDate);
    const hasConflicts = conflictDates.length > 0;

    // ─── TRYB 1: check_conflicts — tylko zwróć konflikty ─────
    if (action === "check_conflicts") {
      return new Response(JSON.stringify({
        ok: true,
        has_conflicts: hasConflicts,
        conflict_count: conflictDates.length,
        total_days: planWorkouts.length,
        conflicts: conflictDates.map(date => ({
          date,
          existing: conflictsByDate[date].map(t => ({
            id: t.id,
            type: t.type,
            distance_km: t.distance_km,
            status: t.status,
          })),
        })),
      }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ─── TRYB 2: approve — wstaw treningi z respektowaniem conflict_resolution ─────
    if (action !== "approve") {
      return new Response(JSON.stringify({ error: "Invalid action. Use 'check_conflicts' or 'approve'" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let inserted = 0;
    let skipped = 0;
    let overwritten = 0;
    const insertErrors: string[] = [];

    // ─── Conflict resolution ─────
    if (conflict_resolution === "overwrite" && hasConflicts) {
      // Skasuj istniejące treningi w datach planu
      const { error: delErr } = await supabase
        .from("trainings")
        .delete()
        .eq("athlete_id", plan.athlete_id)
        .gte("date", plan.start_date)
        .lte("date", plan.end_date);
      if (delErr) {
        throw new Error(`Delete existing trainings failed: ${delErr.message}`);
      }
      overwritten = existingTrainings?.length || 0;
    }

    // ─── Insert workouts do trainings ─────
    for (const w of planWorkouts) {
      // Skip dla 'skip' resolution
      if (conflict_resolution === "skip" && conflictsByDate[w.date]) {
        skipped++;
        continue;
      }

      // Pomiń Odpoczynek (puste dni nie potrzebują wpisu)
      if (w.workout_type === "Odpoczynek") {
        // Można skipować, ale dla pełnej widoczności w kalendarzu wstawmy
        // Ostatecznie: wstawiamy żeby zawodnik wiedział "tu ma być odpoczynek"
      }

      const trainingInsert: any = {
        coach_id: plan.coach_id,
        athlete_id: plan.athlete_id,
        date: w.date,
        type: w.workout_type,
        distance_km: w.target_distance_km,
        duration_min: w.target_duration_min,
        pace: w.target_pace,
        heart_rate: w.target_hr_min && w.target_hr_max
          ? `${w.target_hr_min}-${w.target_hr_max}`
          : null,
        description: w.description || w.title || null,
        steps: w.steps || null,                 // ✨ steps: zachowaj structured workout (Interwały/Tempo) przy zatwierdzeniu
        steps_version: w.steps ? 1 : null,      // ✨ steps
        status: "planned",
      };

      const { data: insertedRow, error: insErr } = await supabase
        .from("trainings")
        .insert(trainingInsert)
        .select("id")
        .single();

      if (insErr) {
        insertErrors.push(`${w.date}: ${insErr.message}`);
        continue;
      }

      // Update workout — link do calendar_training_id
      await supabase
        .from("training_plan_workouts")
        .update({
          calendar_training_id: insertedRow.id,
          inserted_into_calendar_at: new Date().toISOString(),
        })
        .eq("id", w.id);

      inserted++;
    }

    // ─── Update plan status = approved ─────
    await supabase
      .from("training_plans")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: coachId,
      })
      .eq("id", plan_id);

    // ─── Wyślij powiadomienie do zawodnika ─────
    try {
      await supabase.from("notifications").insert({
        athlete_id: plan.athlete_id,
        type: "training_change", // używamy istniejącego typu (ikona już jest)
        title: "Nowy plan treningowy",
        message: `Otrzymałeś nowy plan treningowy ${plan.plan_type === "micro" ? "tygodniowy" : plan.plan_type === "meso" ? "4-tygodniowy" : "długoterminowy"} (${inserted} treningów)`,
        url: "/kalendarz.html?role=athlete",
        from_coach_id: coachId,
      });

      // Push notification (opcjonalnie - jeśli send-push istnieje)
      const pushUrl = `${SUPABASE_URL}/functions/v1/send-push`;
      fetch(pushUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          athlete_id: plan.athlete_id,
          type: "training_change",
        }),
      }).catch(e => console.error("[approve-training-plan] push notification failed:", e));
    } catch (notifErr) {
      console.error("[approve-training-plan] notification insert failed:", notifErr);
    }

    console.log(`[approve-training-plan] ✅ Plan ${plan_id} approved — inserted:${inserted} skipped:${skipped} overwritten:${overwritten}`);

    return new Response(JSON.stringify({
      ok: true,
      plan_id,
      status: "approved",
      inserted,
      skipped,
      overwritten,
      total_planned: planWorkouts.length,
      errors: insertErrors,
    }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[approve-training-plan] ERROR:", err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});