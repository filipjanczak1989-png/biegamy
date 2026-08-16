// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// generate-coach-brief (v3.1)
// Klaudiusz — codzienny brief dnia dla trenera w BiegaMy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v3.1 (2026-06-14):
//   + JSON-fallback — extractJson (toleruje prozę prefix/suffix) + graceful 200 {success:false,error:'parse_error'} (nie throw/500)
//
// v3 (2026-05-21 wieczór):
//   + KLAUDIUSZ BRIEF per zawodnik (athletes.klaudiusz_brief) — DNA każdego
//   + REINFORCEMENT: dosadne instrukcje "skopiuj name z input, NIE wymyślaj"
//   + POST-VALIDATOR validateBriefNames — koryguje name jeśli AI pomyliło
//
// v2 (2026-05-13):
//   + sanitizeBrief() — naprawa zepsutych UUID od Claude'a (lookup po nazwisku)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { formaSeria, monotoniaIStrain, sumaKmBiegowych } from "../_shared/reguly-treningow.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 4500; // zwiększone z 3000 — bogatszy kontekst, więcej zawodników

// Okna czasowe
const LOGS_DAYS = 7;          // szczegółowe logi
const LOGS_LONG_DAYS = 30;    // trendy długoterminowe (count, suma km)
const PLANS_DAYS = 7;
const CHAT_DAYS = 14;
const REPORTS_DAYS = 14;
const RACES_DAYS = 30;        // poszerzone bo zawody dalej w przyszłości też istotne
const STRAVA_DAYS = 14;       // synced activities
const FEEDBACK_DAYS = 30;     // długi window — feedbacki rzadko

// CORS dla web frontu
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// UUID validation regex
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string): boolean => typeof id === "string" && UUID_RE.test(id);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JSON EXTRACTOR — toleruje prozę prefix/suffix + markdown fence (wzór: generate-recipe/food-recognize/ocr)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractJson(text: string): string {
  if (!text) return "";
  let t = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1);
  return t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ━━ 1. AUTORYZACJA TRENERA ━━
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResp({ error: "Brak autoryzacji" }, 401);
    }

    // Klient z JWT trenera (sprawdza kim jest)
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return jsonResp({ error: "Niezalogowany" }, 401);
    }

    // Klient z service role (do pełnego dostępu do tabel)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Sprawdź czy user jest trenerem
    const { data: coach, error: coachErr } = await admin
      .from("coaches")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (coachErr || !coach) {
      return jsonResp({ error: "Nie jesteś trenerem" }, 403);
    }

    console.log(`[Klaudiusz] Generuję brief dla trenera: ${coach.full_name}`);

    // ━━ 2. ZBIERZ KONTEKST ━━
    const context = await collectCoachContext(admin, coach.id);
    console.log(`[Klaudiusz] Zebrałem kontekst: ${context.athletes.length} aktywnych zawodników`);

    if (context.athletes.length === 0) {
      const emptyBrief = {
        greeting: `Dzień dobry ${coach.full_name?.split(" ")[0] || ""}. Nie masz jeszcze aktywnych zawodników — jak pojawią się pierwsi, zacznę tu pisać brief dnia.`,
        urgent: [],
        warning: [],
        ok_chips: [],
        ok_count: 0,
        stats: { km_week: 0, regularity_pct: 0, pending_intakes: context.pending_intakes },
        actions: [],
      };
      await saveBrief(admin, coach.id, emptyBrief, 0, 0);
      return jsonResp({ success: true, brief: emptyBrief });
    }

    // ━━ 3. WYWOŁAJ CLAUDE API ━━
    let { brief, tokens_in, tokens_out } = await callClaude(coach, context);

    // ━━ 3b. JSON-fallback: parse_error → graceful 200 {success:false} (klient czyta json.success/json.error; nie 500, nie sanitize null) ━━
    if (!brief) {
      return jsonResp({ success: false, error: "parse_error" });
    }

    // ━━ 3c. SANITIZE — naprawa zepsutych UUID od Claude'a ━━
    brief = sanitizeBrief(brief, context.athletes);

    // ✨ v3: 3d. VALIDATE NAMES — koryguje name jeśli AI pomyliło
    // (athlete_id jest poprawny po sanitizeBrief, ale name może być pomylony)
    brief = validateBriefNames(brief, context.athletes);

    // ━━ 4. ZAPISZ BRIEF ━━
    await saveBrief(admin, coach.id, brief, tokens_in, tokens_out);

    // ━━ 5. LOG KOSZTÓW ━━
    await admin.from("ai_usage_log").insert({
      mode: "coach_brief",
      cache_hit: false,
      tokens_in,
      tokens_out,
    });

    return jsonResp({ success: true, brief });

  } catch (e) {
    console.error("[Klaudiusz] Błąd:", e);
    return jsonResp({ error: e.message || String(e) }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SANITIZER — naprawa zepsutych UUID od Claude'a
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function resolveAthleteId(brokenId: string, athleteName: string, athletes: any[]): string | null {
  // Już poprawny UUID — sprawdź czy istnieje w bazie zawodników trenera
  if (isValidUUID(brokenId)) {
    if (athletes.some(a => a.id === brokenId)) return brokenId;
    // UUID poprawny ale nie należy do trenera — spróbuj po nazwisku
  }

  // Próba 1: jeśli UUID ma 37 znaków (1 za dużo) — strip pierwszy znak
  if (typeof brokenId === "string" && brokenId.length === 37) {
    const stripped = brokenId.slice(1);
    if (isValidUUID(stripped) && athletes.some(a => a.id === stripped)) {
      console.warn(`[Klaudiusz] Naprawiono UUID (strip pierwszy znak): ${brokenId} → ${stripped}`);
      return stripped;
    }
  }

  // Próba 2: jeśli UUID ma 35 znaków (1 za mało) — sprawdź po pełnym dopasowaniu suffix
  if (typeof brokenId === "string" && brokenId.length === 35) {
    const match = athletes.find(a => a.id.endsWith(brokenId.slice(1)));
    if (match) {
      console.warn(`[Klaudiusz] Naprawiono UUID (przywrócono prefix): ${brokenId} → ${match.id}`);
      return match.id;
    }
  }

  // Próba 3: szukaj po nazwisku (najpewniejsze)
  if (athleteName && typeof athleteName === "string") {
    const normalized = athleteName.toLowerCase().trim();
    const match = athletes.find(a =>
      a.full_name && a.full_name.toLowerCase().trim() === normalized
    );
    if (match) {
      console.warn(`[Klaudiusz] Znaleziono UUID po nazwie: "${athleteName}" → ${match.id}`);
      return match.id;
    }
  }

  console.error(`[Klaudiusz] Nie udało się rozwiązać UUID: ${brokenId} (nazwa: ${athleteName})`);
  return null;
}

function sanitizeBrief(brief: any, athletes: any[]): any {
  if (!brief) return brief;

  const fixItem = (item: any): any => {
    if (!item || typeof item !== "object") return item;
    const realId = resolveAthleteId(item.athlete_id, item.name || item.to, athletes);
    if (realId) {
      return { ...item, athlete_id: realId };
    }
    // Nie udało się znaleźć — zwracaj null żeby filter usunął
    return null;
  };

  return {
    ...brief,
    urgent: Array.isArray(brief.urgent) ? brief.urgent.map(fixItem).filter(Boolean) : [],
    warning: Array.isArray(brief.warning) ? brief.warning.map(fixItem).filter(Boolean) : [],
    actions: Array.isArray(brief.actions) ? brief.actions.map(fixItem).filter(Boolean) : [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✨ v3: NAME VALIDATOR — koryguje name jeśli AI pomyliło
// (athlete_id jest już prawidłowy po sanitizeBrief, ale name może
// być z innego zawodnika — to klasyczny LLM confusion przy listach)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function validateBriefNames(brief: any, athletes: any[]): any {
  if (!brief) return brief;

  let corrections = 0;
  const fixName = (item: any): any => {
    if (!item || typeof item !== "object" || !item.athlete_id) return item;
    const truth = athletes.find(a => a.id === item.athlete_id);
    if (!truth || !truth.full_name) return item;
    
    const expectedName = truth.full_name;
    const actualName = item.name || item.to || '';
    
    if (actualName && actualName.toLowerCase().trim() !== expectedName.toLowerCase().trim()) {
      console.warn(`[Klaudiusz] NAME MISMATCH: id ${item.athlete_id.slice(0,8)} — AI napisało "${actualName}", powinno być "${expectedName}". Koryguję.`);
      corrections++;
      // Korekta: name w urgent/warning, to w actions
      const fixed = { ...item };
      if ('name' in fixed) fixed.name = expectedName;
      if ('to' in fixed) fixed.to = expectedName.split(' ')[0]; // imię w actions
      return fixed;
    }
    return item;
  };

  const result = {
    ...brief,
    urgent: Array.isArray(brief.urgent) ? brief.urgent.map(fixName) : [],
    warning: Array.isArray(brief.warning) ? brief.warning.map(fixName) : [],
    actions: Array.isArray(brief.actions) ? brief.actions.map(fixName) : [],
  };

  if (corrections > 0) {
    console.warn(`[Klaudiusz] ✅ Skorygowano ${corrections} pomylonych imion`);
  } else {
    console.log(`[Klaudiusz] ✅ Wszystkie imiona poprawne`);
  }

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function jsonResp(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function collectCoachContext(admin: any, coachId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const logsFrom = daysAgo(LOGS_DAYS);
  const logsLongFrom = daysAgo(LOGS_LONG_DAYS);
  const chatFrom = daysAgo(CHAT_DAYS);
  const reportsFrom = daysAgo(REPORTS_DAYS);
  const racesTo = daysFromNow(RACES_DAYS);
  const stravaFrom = daysAgo(STRAVA_DAYS);
  const feedbackFrom = daysAgo(FEEDBACK_DAYS);

  // ━━ TRENER — pełna info ━━
  const { data: coachInfo } = await admin
    .from("coaches")
    .select("id, full_name, created_at")
    .eq("id", coachId)
    .maybeSingle();

  // ━━ ZAWODNICY trenera — pełne kolumny ━━
  // ✨ v3: dorzucamy klaudiusz_brief (DNA każdego zawodnika)
  const { data: athletes } = await admin
    .from("athletes")
    .select(`
      id, full_name, goal, target_race, target_date,
      pb_5k, pb_10k, pb_half, pb_marathon,
      race_goals, created_at,
      onboarding_done, terms_accepted_at, avatar_url,
      klaudiusz_brief
    `)
    .eq("coach_id", coachId)
    .eq("active", true);

  const athleteIds = (athletes || []).map((a: any) => a.id);

  if (athleteIds.length === 0) {
    return {
      coach: coachInfo,
      athletes: [],
      logs: [], logs_long: [], plans: [], plan_workouts: [], log_comments: [],
      messages: [], notes: [], intakes: [], intakes_pending: [], reports: [],
      races: [], race_signups: [], strava_activities: [], feedbacks: [],
      trainingPlans: [],
      pending_intakes: 0,
    };
  }

  // ━━ PLANY (trainings) — ostatnie 7 dni ━━
  const { data: plans } = await admin
    .from("trainings")
    .select("id, athlete_id, date, type, distance_km, duration_min, pace, description, status")
    .in("athlete_id", athleteIds)
    .gte("date", logsFrom)
    .lte("date", today)
    .order("date", { ascending: false });

  // ━━ LOGI 7 dni — szczegóły ━━
  const { data: logs } = await admin
    .from("training_logs")
    .select("id, athlete_id, training_id, distance_km, duration, pace, heart_rate, feel, comment, coach_comment, logged_at, training_type, strava_link, elevation_gain")
    .in("athlete_id", athleteIds)
    .gte("logged_at", logsFrom)
    .not("training_type", "like", "__badge__%")
    .order("logged_at", { ascending: false });

  // ━━ LOGI 30 dni — minimum dla trendów (count + sumy) ━━
  const { data: logsLong } = await admin
    .from("training_logs")
    .select("athlete_id, distance_km, duration, pace, heart_rate, feel, logged_at, training_type")
    .in("athlete_id", athleteIds)
    .gte("logged_at", logsLongFrom)
    .lt("logged_at", logsFrom)
    .not("training_type", "like", "__badge__%");

  // ━━ KOMENTARZE pod logami ━━
  const logIds = (logs || []).map((l: any) => l.id);
  let logComments: any[] = [];
  if (logIds.length > 0) {
    const { data: comments } = await admin
      .from("log_comments")
      .select("log_id, athlete_id, body, created_at")
      .in("log_id", logIds)
      .order("created_at", { ascending: false });
    logComments = comments || [];
  }

  // ━━ CZAT (messages) ━━
  const { data: messages } = await admin
    .from("messages")
    .select("athlete_id, sender, body, attachments, sent_at, read")
    .in("athlete_id", athleteIds)
    .gte("sent_at", chatFrom)
    .order("sent_at", { ascending: false })
    .limit(200);

  // ━━ NOTATKI TRENERA (aktywne) ━━
  const { data: notes } = await admin
    .from("coach_athlete_notes")
    .select("athlete_id, tag, note, event_date, is_resolved, created_at")
    .eq("coach_id", coachId)
    .eq("is_resolved", false);

  // ━━ ANKIETY (intake) — ZAAKCEPTOWANE ━━
  const { data: intakes } = await admin
    .from("athlete_intake_forms")
    .select(`
      created_athlete_id, status,
      current_injuries, chronic_conditions, medications, sleep_avg_hours, stress_level,
      main_goal, target_race_name, target_race_date, target_race_time, target_race_pb_attempt,
      strong_points, weak_points, main_blocker, motivation, prior_injuries_history,
      topics_to_avoid, preferred_chat_style,
      training_days_per_week, weekly_km_estimate, longest_recent_run_km, last_5k_time, last_10k_time
    `)
    .in("created_athlete_id", athleteIds)
    .eq("status", "accepted");

  // ━━ ANKIETY oczekujące (submitted) — kontekst kto czeka ━━
  const { data: intakesPending } = await admin
    .from("athlete_intake_forms")
    .select("full_name, main_goal, target_race_name, target_race_date, current_injuries, weekly_km_estimate, submitted_at")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(5);

  // ━━ RAPORTY AI ━━
  const { data: reports } = await admin
    .from("ai_reports")
    .select(`
      athlete_id, report_type, priority, summary, generated_at, sent_at,
      read_by_athlete, athlete_reaction,
      athlete_feedback, athlete_feedback_at
    `)
    .in("athlete_id", athleteIds)
    .gte("generated_at", reportsFrom)
    .order("generated_at", { ascending: false });

  // ━━ FEEDBACKS na raporty AI (ostatnie 30 dni) — co zawodnicy mówią o raportach ━━
  const { data: feedbacks } = await admin
    .from("ai_reports")
    .select("athlete_id, report_type, summary, athlete_feedback, athlete_reaction, athlete_feedback_at")
    .in("athlete_id", athleteIds)
    .not("athlete_feedback", "is", null)
    .gte("athlete_feedback_at", feedbackFrom)
    .order("athlete_feedback_at", { ascending: false })
    .limit(20);

  // ━━ PLANY DŁUGOTERMINOWE ━━
  const { data: trainingPlans } = await admin
    .from("training_plans")
    .select("id, athlete_id, plan_type, start_date, weeks_count, target_race_type, target_race_date, target_time, approved_at")
    .in("athlete_id", athleteIds)
    .not("approved_at", "is", null);

  const planIds = (trainingPlans || []).map((p: any) => p.id);
  let planWorkouts: any[] = [];
  if (planIds.length > 0) {
    const { data: pw } = await admin
      .from("training_plan_workouts")
      .select("plan_id, date, workout_type, title, target_distance_km, target_pace, target_hr_zone, description")
      .in("plan_id", planIds)
      .gte("date", logsFrom)
      .lte("date", daysFromNow(7));
    planWorkouts = pw || [];
  }

  // ━━ ZAWODY — 30 dni do przodu ━━
  const { data: raceSignups } = await admin
    .from("race_signups")
    .select("athlete_id, race_id, signed_up_at")
    .in("athlete_id", athleteIds);

  const raceIds = [...new Set((raceSignups || []).map((rs: any) => rs.race_id))];
  let races: any[] = [];
  if (raceIds.length > 0) {
    const { data: r } = await admin
      .from("races")
      .select("id, name, date, distance_km, city")
      .in("id", raceIds)
      .gte("date", today)
      .lte("date", racesTo);
    races = r || [];
  }

  // ━━ STRAVA — ostatnie aktywności (14 dni) + status połączenia ━━
  const { data: stravaActivities } = await admin
    .from("strava_activities")
    .select("athlete_id, name, distance, moving_time, average_speed, average_heartrate, max_heartrate, start_date, type, total_elevation_gain")
    .in("athlete_id", athleteIds)
    .gte("start_date", stravaFrom)
    .order("start_date", { ascending: false })
    .limit(150);

  // ━━ ANKIETY czekające — count ━━
  const { count: pendingCount } = await admin
    .from("athlete_intake_forms")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted");

    /* ═══ BRIEF+ : analityka rosteru dla modelu — TSB/monotonia (Foster) + gotowosc wellness.
     16.08.2026: wagi i wzory przeniesione do ../_shared/reguly-treningow.mjs.
     Panel trenera pokazywal inna forme niz wykres tego samego zawodnika. ═══ */
  let analityka: Record<string, any> = {};
  try {
    const od90 = new Date(Date.now() - 90*864e5).toISOString();
    const { data: l90 } = await admin.from("training_logs")
      .select("athlete_id,logged_at,training_type,duration,feel,distance_km")
      .in("athlete_id", athleteIds).gte("logged_at", od90)
      .not("training_type","like","__badge__%");
    const odW=new Date(Date.now()-8*864e5).toISOString().slice(0,10);
    const { data: wel } = await admin.from("wellness")
      .select("athlete_id,date,resting_hr,hrv,sleep_secs")
      .in("athlete_id", athleteIds).gte("date", odW).order("date",{ascending:false});
    /* `dni`/`_EFF`/`_FEEL`/`_dMin` zdjete 16.08.2026 — dzienny TRIMP liczy teraz
       formaSeria() z ../_shared, razem z seedem, ktorego ta kopia nigdy nie miala. */
    const perW: Record<string, any[]> = {};
    (wel||[]).forEach((w: any)=>{ (perW[w.athlete_id]=perW[w.athlete_id]||[]).push(w); });
    for (const aid of athleteIds) {
      /* 16.08.2026: wlasna EMA bez seeda zastapiona modulem ../_shared —
         panel trenera pokazywal inna forme niz wykres tego samego zawodnika. */
      const _f = formaSeria((l90||[]).filter((x:any)=>x.athlete_id===aid), { koniec: new Date(), dni: 90 });
      const _m = monotoniaIStrain(_f.seria.map((d:any)=>d.trimp));
      let got: any=null; const wl=perW[aid];
      if (wl&&wl.length>=3){ const o=wl[0], baza=wl.slice(1);
        const m=(arr:any[])=>{const v=arr.filter((x:any)=>x!=null);return v.length?v.reduce((x:number,y:number)=>x+y,0)/v.length:null;};
        const bR=m(baza.map((x:any)=>x.resting_hr)), bH=m(baza.map((x:any)=>x.hrv));
        const sig:string[]=[];
        if(o.resting_hr!=null&&bR!=null&&o.resting_hr-bR>5) sig.push('RHR +'+Math.round(o.resting_hr-bR));
        if(o.hrv!=null&&bH!=null&&bH>0&&(bH-o.hrv)/bH>0.15) sig.push('HRV -'+Math.round((bH-o.hrv)/bH*100)+'%');
        if(o.sleep_secs!=null&&o.sleep_secs<6*3600) sig.push('sen <6h');
        got = sig.length ? { sygnaly: sig } : { sygnaly: [], ok: true }; }
      /* BRIEF+ KROK4: km ostatnie 30d vs poprzednie 30d — trener widzi kto rosnie/spada */
      let km30=0, km60_30=0;
      const _now=Date.now();
      for (const l of (l90||[])) {
        if (l.athlete_id!==aid) continue;
        const wiek=(_now-new Date(l.logged_at).getTime())/864e5;
        if (wiek<30) km30+=(+l.distance_km||0);
        else if (wiek<60) km60_30+=(+l.distance_km||0);
      }
      const trendKm = Math.round(km30)-Math.round(km60_30);
      analityka[aid]={ tsb: _f.tsb, ctl: _f.ctl, atl: _f.atl, forma: _f.forma,
        km_30d: Math.round(km30), zmiana_km_msc: trendKm,
        monotonia_7d: _m.monotonia_7d, strain_7d: _m.strain_7d, gotowosc: got };
    }
  } catch(_) { /* analityka opcjonalna */ }

  return {
    coach: coachInfo,
    athletes: athletes || [],
    plans: plans || [],
    logs: logs || [],
    logs_long: logsLong || [],
    analityka,   /* BRIEF+ */
    plan_workouts: planWorkouts,
    log_comments: logComments,
    messages: messages || [],
    notes: notes || [],
    intakes: intakes || [],
    intakes_pending: intakesPending || [],
    reports: reports || [],
    feedbacks: feedbacks || [],
    races,
    race_signups: raceSignups || [],
    strava_activities: stravaActivities || [],
    trainingPlans: trainingPlans || [],
    pending_intakes: pendingCount || 0,
  };
}

async function callClaude(coach: any, ctx: any) {
  const coachFirstName = coach.full_name?.split(" ")[0] || "Trenerze";

  // Helper: bezpieczne parsowanie race_goals JSON
  const parseRaceGoals = (raw: any): any[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p : [];
      } catch { return []; }
    }
    return [];
  };

  // Helper: agregaty z logów (count, sumy, średnie)
  const aggregateLogs = (logs: any[]) => {
    if (!logs || logs.length === 0) {
      return { count: 0, total_km: 0, avg_pace: null, avg_hr: null, feel_distribution: {} };
    }
    /* ⚠️ TYLKO BIEGOWE — `Zastepczy`/rower/marsz poza suma, jak w aplikacji. */
    const km = sumaKmBiegowych(logs);
    const hrs = logs.filter(l => l.heart_rate).map(l => Number(l.heart_rate));
    const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
    // pace pomijam w średniej (string "5:30/km") — zostawiam użytkownikowi do interpretacji
    const feelDist: Record<string, number> = {};
    for (const l of logs) {
      if (l.feel) feelDist[l.feel] = (feelDist[l.feel] || 0) + 1;
    }
    return {
      count: logs.length,
      total_km: Math.round(km * 10) / 10,
      avg_hr: avgHr,
      feel_distribution: feelDist,
    };
  };

  // Buduj wzbogacony kontekst per zawodnik
  const athleteSummaries = ctx.athletes.map((a: any) => {
    const aLogs = ctx.logs.filter((l: any) => l.athlete_id === a.id);
    const aLogsLong = (ctx.logs_long || []).filter((l: any) => l.athlete_id === a.id);
    const aPlans = ctx.plans.filter((p: any) => p.athlete_id === a.id);
    const aPlanWorkouts = ctx.plan_workouts.filter((pw: any) => {
      const plan = (ctx.trainingPlans || []).find((tp: any) => tp.id === pw.plan_id);
      return plan?.athlete_id === a.id;
    });
    const aTrainingPlans = (ctx.trainingPlans || []).filter((tp: any) => tp.athlete_id === a.id);
    const aMessages = ctx.messages.filter((m: any) => m.athlete_id === a.id);
    const aNotes = ctx.notes.filter((n: any) => n.athlete_id === a.id);
    const aIntake = ctx.intakes.find((i: any) => i.created_athlete_id === a.id);
    const aReports = ctx.reports.filter((r: any) => r.athlete_id === a.id);
    const aFeedbacks = (ctx.feedbacks || []).filter((f: any) => f.athlete_id === a.id);
    const aLogComments = ctx.log_comments.filter((lc: any) =>
      aLogs.some((l: any) => l.id === lc.log_id)
    );
    const aRaceSignups = ctx.race_signups.filter((rs: any) => rs.athlete_id === a.id);
    const aRaces = aRaceSignups
      .map((rs: any) => ctx.races.find((r: any) => r.id === rs.race_id))
      .filter(Boolean);
    const aStrava = (ctx.strava_activities || []).filter((s: any) => s.athlete_id === a.id);
    const stravaConnected = aStrava.length > 0;

    // Agregaty
    const stats_7d = aggregateLogs(aLogs);
    const analityka_formy = (ctx.analityka && ctx.analityka[a.id]) || null;   /* BRIEF+ */
    const stats_30d = aggregateLogs([...aLogs, ...aLogsLong]); // pełne 30 dni
    // Plan tygodniowy realizacja
    const plans7Total = aPlans.length;
    const plans7Done = aPlans.filter((p: any) => p.status === "done").length;
    const realization_pct = plans7Total > 0 ? Math.round((plans7Done / plans7Total) * 100) : null;

    // Ile dni od ostatniego logu
    const lastLog = aLogs[0] || aLogsLong[0];
    const daysSinceLastLog = lastLog
      ? Math.floor((Date.now() - new Date(lastLog.logged_at).getTime()) / 86400000)
      : null;

    // Ile dni od ostatniego komentarza trenera
    const lastCoachComment = aLogs.find((l: any) => l.coach_comment);
    const daysSinceCoachComment = lastCoachComment
      ? Math.floor((Date.now() - new Date(lastCoachComment.logged_at).getTime()) / 86400000)
      : null;

    // Najbliższy zawód
    const nextRace = aRaces.length > 0
      ? aRaces.sort((x: any, y: any) => new Date(x.date).getTime() - new Date(y.date).getTime())[0]
      : null;
    const daysToNextRace = nextRace
      ? Math.ceil((new Date(nextRace.date).getTime() - Date.now()) / 86400000)
      : null;

    // Strava ostatnia synchronizacja
    const lastStravaSync = aStrava[0]?.start_date || null;
    const daysSinceStravaSync = lastStravaSync
      ? Math.floor((Date.now() - new Date(lastStravaSync).getTime()) / 86400000)
      : null;

    // Ile lat/miesięcy zawodnik w aplikacji
    const memberSinceDays = a.created_at
      ? Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86400000)
      : null;

    return {
      id: a.id,
      name: a.full_name,
      avatar: !!a.avatar_url,
      goal: a.goal,
      target_race: a.target_race,
      target_date: a.target_date,
      member_since: a.created_at?.slice(0, 10),
      days_in_app: memberSinceDays,
      onboarding_done: a.onboarding_done,
      pbs: { "5k": a.pb_5k, "10k": a.pb_10k, half: a.pb_half, marathon: a.pb_marathon },
      race_goals: parseRaceGoals(a.race_goals).slice(0, 6).map((g: any) => ({
        distance: g.distance,
        target_time: g.target_time,
        date: g.date,
        race_name: g.race_name,
      })),

      // ✨ v3: KLAUDIUSZ BRIEF — DNA zawodnika (trwały kontekst od trenera)
      klaudiusz_brief: a.klaudiusz_brief || null,

      // ━━ STATS — kluczowe dla trendu ━━
      stats_7d,
      analityka_formy,   /* BRIEF+: tsb/ctl/monotonia/strain/gotowosc(sygnaly wellness) */
      stats_30d_excl_7d: aggregateLogs(aLogsLong), // tylko 8-30 dni (kontekst poprzedniego okresu)
      realization_pct_7d: realization_pct,
      days_since_last_log: daysSinceLastLog,
      days_since_coach_comment: daysSinceCoachComment,

      logs_7d: aLogs.slice(0, 15).map((l: any) => ({
        date: l.logged_at?.slice(0, 10),
        dist: l.distance_km,
        pace: l.pace,
        hr: l.heart_rate,
        feel: l.feel,
        elevation: l.elevation_gain,
        comment: l.comment?.slice(0, 220),
        coach_replied: !!l.coach_comment,
        coach_comment: l.coach_comment?.slice(0, 150),
        type: l.training_type,
        strava: !!l.strava_link,
      })),
      plans_7d: aPlans.map((p: any) => ({
        date: p.date,
        type: p.type,
        dist: p.distance_km,
        duration: p.duration_min,
        desc: p.description?.slice(0, 150),
        status: p.status,
      })),
      training_plans_active: aTrainingPlans.slice(0, 3).map((tp: any) => ({
        type: tp.plan_type,
        start: tp.start_date,
        weeks: tp.weeks_count,
        target_race: tp.target_race_type,
        target_date: tp.target_race_date,
        target_time: tp.target_time,
        approved: tp.approved_at?.slice(0, 10),
      })),
      plan_workouts_upcoming: aPlanWorkouts.slice(0, 7).map((pw: any) => ({
        date: pw.date,
        type: pw.workout_type,
        title: pw.title,
        target_dist: pw.target_distance_km,
        target_pace: pw.target_pace,
        hr_zone: pw.target_hr_zone,
        desc: pw.description?.slice(0, 120),
      })),
      log_comments_recent: aLogComments.slice(0, 6).map((lc: any) => ({
        body: lc.body?.slice(0, 200),
        from_athlete: lc.athlete_id === a.id,
        date: lc.created_at?.slice(0, 10),
      })),

      // ━━ KOMUNIKACJA ━━
      messages_recent: aMessages.slice(0, 15).map((m: any) => ({
        sender: m.sender,
        body: m.body?.slice(0, 280),
        has_attachments: m.attachments && m.attachments.length > 0,
        date: m.sent_at?.slice(0, 10),
        read: m.read,
      })),
      unanswered_athlete_msgs: aMessages
        .filter((m: any) => m.sender === "athlete")
        .slice(0, 5)
        .reduce((acc: any[], m: any, idx: number, arr: any[]) => {
          // znajdź najnowszą wiadomość od zawodnika BEZ odpowiedzi trenera po niej
          const coachReplyAfter = aMessages.find((x: any) =>
            x.sender === "coach" && new Date(x.sent_at) > new Date(m.sent_at)
          );
          if (!coachReplyAfter && idx === 0) acc.push({
            body: m.body?.slice(0, 200),
            date: m.sent_at?.slice(0, 10),
            hours_ago: Math.floor((Date.now() - new Date(m.sent_at).getTime()) / 3600000),
          });
          return acc;
        }, []),

      coach_notes: aNotes.map((n: any) => ({
        tag: n.tag,
        note: n.note?.slice(0, 280),
        date: n.event_date,
      })),

      // ━━ INTAKE — pełna ankieta ━━
      intake_context: aIntake ? {
        injuries: aIntake.current_injuries?.slice(0, 250),
        chronic: aIntake.chronic_conditions?.slice(0, 180),
        medications: aIntake.medications?.slice(0, 150),
        sleep_hours: aIntake.sleep_avg_hours,
        stress_level: aIntake.stress_level,
        goal: Array.isArray(aIntake.main_goal) ? aIntake.main_goal.join(", ") : aIntake.main_goal,
        race: aIntake.target_race_name,
        race_date: aIntake.target_race_date,
        race_goal_time: aIntake.target_race_time,
        race_is_pb_attempt: aIntake.target_race_pb_attempt,
        strong_points: aIntake.strong_points?.slice(0, 200),
        weak_points: aIntake.weak_points?.slice(0, 200),
        blocker: aIntake.main_blocker?.slice(0, 200),
        motivation: aIntake.motivation?.slice(0, 200),
        prior_injuries: aIntake.prior_injuries_history?.slice(0, 200),
        avoid_topics: aIntake.topics_to_avoid?.slice(0, 150),
        chat_style: aIntake.preferred_chat_style,
        weekly_km_declared: aIntake.weekly_km_estimate,
        longest_run_declared: aIntake.longest_recent_run_km,
        last_5k_declared: aIntake.last_5k_time,
        last_10k_declared: aIntake.last_10k_time,
      } : null,

      // ━━ AI RAPORTY ━━
      recent_ai_reports: aReports.slice(0, 5).map((r: any) => ({
        type: r.report_type,
        priority: r.priority,
        summary: r.summary?.slice(0, 250),
        date: r.generated_at?.slice(0, 10),
        sent: !!r.sent_at,
        athlete_read: !!r.read_by_athlete,
        athlete_reaction: r.athlete_reaction,
        athlete_feedback: r.athlete_feedback?.slice(0, 200),
      })),

      // ━━ FEEDBACK od zawodnika (golden) ━━
      athlete_feedback_recent: aFeedbacks.slice(0, 5).map((f: any) => ({
        about: f.summary?.slice(0, 100),
        reaction: f.athlete_reaction,
        feedback: f.athlete_feedback?.slice(0, 250),
        date: f.athlete_feedback_at?.slice(0, 10),
      })),

      // ━━ ZAWODY ━━
      upcoming_races: aRaces.map((r: any) => ({
        name: r.name, date: r.date, dist: r.distance_km, city: r.city,
        days_to: Math.ceil((new Date(r.date).getTime() - Date.now()) / 86400000),
      })),
      next_race_days: daysToNextRace,

      // ━━ STRAVA ━━
      strava_connected: stravaConnected,
      strava_last_sync: lastStravaSync?.slice(0, 10),
      strava_days_since_sync: daysSinceStravaSync,
      strava_activities_14d: aStrava.slice(0, 14).map((s: any) => ({
        name: s.name?.slice(0, 60),
        date: s.start_date?.slice(0, 10),
        km: s.distance ? Math.round(s.distance / 100) / 10 : null,
        pace: s.average_speed > 0 ? (() => {
          const t = Math.round(1000 / s.average_speed);
          return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
        })() : null,
        avg_hr: s.average_heartrate ? Math.round(s.average_heartrate) : null,
        max_hr: s.max_heartrate ? Math.round(s.max_heartrate) : null,
        elevation: s.total_elevation_gain,
        type: s.type,
      })),
    };
  });

  // ✨ v3: Tabela ID → NAME — Klaudiusz musi się trzymać tej mapy
  const athleteLookupTable = ctx.athletes.map((a: any) => 
    `  ${a.id}  →  ${a.full_name || '?'}`
  ).join("\n");

  const systemPrompt = `Jesteś Klaudiuszem — asystentem trenera biegowego w aplikacji BiegaMy.run. Twoim zadaniem jest codziennie rano przygotować krótki, zwięzły, ludzki brief dnia dla trenera ${coachFirstName}.

🚨🚨🚨 NAJWAŻNIEJSZE — IMIONA I UUID:

To jest brief o WIELU zawodnikach naraz. NAJCZĘSTSZY BŁĄD który popełniasz: mylisz imiona i przypisujesz fakty z jednego zawodnika do drugiego. PRZYKŁADY ŻYWYCH WPADEK:
- Marek napisał o kolanie → brief mówi że "Anka skarży się na kolano" (KATASTROFA dla trenera)
- Damian biegnie w niedzielę start → brief mówi że "Tatiana ma start"
- Iwona spadek wolumenu → brief łączy to z Aliną która biega regularnie

⚠️ JAK TEMU ZAPOBIEC:

KAŻDA POZYCJA w urgent/warning/actions MA ŻELAZNE ZASADY:
1. Wybierz CO chcesz powiedzieć (problem, akcja).
2. SPRAWDŹ w danych input \`athleteSummaries[]\` z którego zawodnika pochodzi ten fakt — patrz na "id" i "name" tego konkretnego obiektu.
3. Skopiuj DOKŁADNIE \`id\` z tego obiektu → wpisz jako \`athlete_id\`.
4. Skopiuj DOKŁADNIE \`name\` z TEGO SAMEGO obiektu → wpisz jako \`name\` (lub \`to\` w actions).
5. NIE MIESZAJ DANYCH MIĘDZY ZAWODNIKAMI. Każdy zawodnik to osobny obiekt z osobnym ID i osobnym imieniem.

⛔ ZAKAZANE:
- Wymyślanie imion z pamięci ("brzmi mi że to było Anka...")
- Przesuwanie imienia z jednego zawodnika do innego bo "fact pasuje też do niej"
- Kombinowanie imienia z jednego obiektu z faktami z drugiego

✅ PRAWIDŁOWO:
Jeśli widzisz w danych obiekt: {"id": "abc123...", "name": "Marek Kowalski", "logs_7d": [..."bolało kolano"...]}
Twoja pozycja w urgent: {"athlete_id": "abc123...", "name": "Marek Kowalski", "desc": "Marek skarży się na kolano"}

🔑 TABELA POPRAWNYCH PRZYPISAŃ ID → IMIĘ (twoja ŹRÓDŁOWA prawda):

${athleteLookupTable}

⛔ JEŚLI w outputie pojawi się imię NIEZ tej tabeli — to BŁĄD. Skoryguj zanim zwrócisz JSON.
⛔ JEŚLI ID i imię w outputie nie zgadzają się z tabelą wyżej — to BŁĄD. Skoryguj.

═══════════════════════════════════════════════════════

POZOSTAŁE ZASADY:

1. Mów po polsku, bezpośrednio, bez korporacyjnego tonu. Bez "drogi trenerze", bez "pozwól, że". Jak dobry znajomy który pomaga.
2. NIE pisz że jesteś AI. Mów "Zaglądam", "Widzę", "Sugeruję" — od pierwszej osoby.
3. ⚠️ POLSKA ORTOGRAFIA — przed zwróceniem JSON przejrzyj każde słowo. Częste literówki do uniknięcia: "ogarniemy" (NIE "ogarnięmy"), "trenujesz" (NIE "traenujesz"), "się dzieje" (rozdzielnie), "z perspektywy", "narzeczona", "biegasz". Końcówki -my w 1. os. liczby mnogiej (zrobimy, ogarniemy, sprawdzimy) bez ogonka. Sprawdź literka po literce.
4. ⚠️ WAŻNE — PERSPEKTYWA W "desc": pisz z perspektywy TRENERA który CZYTA o zawodniku. NIE z perspektywy zawodnika. Trener czyta brief i widzi co się dzieje z jego podopiecznymi.
   ✅ DOBRZE: "Marek nie zalogował się od 3 dni" / "Anka skarży się na kolano" / "Bartek ma jutro start, taper jakby anemiczny"
   ❌ ŹLE: "Nie biegałeś od 3 dni" / "Boli Cię kolano" / "Masz słaby taper"
5. ⚠️ WAŻNE — PERSPEKTYWA W "suggested_msg": pisz tak jakby TRENER wysyłał wiadomość DO zawodnika. Z drugiej osoby, ciepło, jak SMS od dobrego znajomego.
   ✅ DOBRZE: "Hej Marek, widzę że jeszcze nie biegałeś w tym tygodniu — wszystko ok?" / "Aniu, dzwoniłaś? Masz coś z kolanem?"
   ❌ ŹLE: "Marek nie biegał w tym tygodniu" / "Skontaktować się z Anką w sprawie kolana"
6. Sugerowane wiadomości: ciepło, ludzko, polski język, bez korpomowy. Forma "Hej Marek", "Aniu", "Mistrzu". Krótkie, max 2-3 zdania. Jeśli zawodnik miał wcześniej kontuzje/słabe punkty z intake — używaj tej wiedzy, ale subtelnie.
7. Jeśli w notatkach trenera albo ankiecie jest informacja o kontuzji, problemach życiowych, "avoid_topics" — uwzględnij to z wyczuciem. Nigdy NIE pisz o tematach z "avoid_topics".
8. Jeśli plan był interwałami (R, V, próg) — pamiętaj że "ciężko" to normalna reakcja, nie alarm.
9. Jeśli AI report został wysłany niedawno (<7 dni) i zawodnik NIE przeczytał — sugeruj delikatne sprawdzenie "czy doszło". Jeśli przeczytał ale nie reaguje na sugestie — sugeruj rozmowę.
10. Jeśli zawodnik dał feedback do raportu AI (athlete_feedback_recent) — to złoto. Użyj tego do "suggested_msg" jako kontekstu. Np. zawodnik napisał "kolano nadal boli" → "Aniu, jak tam kolano? Dalej ciągnie?"
11. UWZGLĘDNIJ TRENDY: porównuj stats_7d vs stats_30d_excl_7d. Spadek liczby treningów, spadek km, gorsze feel = alarm. Wzrost = pochwała w greetingu albo OK chip.

✨ v3: KLAUDIUSZ BRIEF (DNA ZAWODNIKA):
Każdy zawodnik MOŻE mieć pole "klaudiusz_brief" — to trwały, długoterminowy opis ustawiony przez trenera. Jeśli istnieje:
- Traktuj jako PIERWSZE TŁO o tym zawodniku — przed wszystkimi innymi danymi.
- Używaj ksywek, stylu komunikacji który tam jest opisany.
- Uwzględniaj stałe ograniczenia (np. "źle znosi >60km/tydz", "kontuzja przewlekła Achillesa", "biega tylko rano").
- NIE cytuj briefu wprost. Pisz jakbyś znał zawodnika osobiście.
- Jeśli brief jest pusty/null — działaj normalnie, na podstawie pozostałych danych.

JAK KORZYSTAĆ Z DANYCH (KLUCZOWE — dane są bogate, używaj wszystkich):
- "klaudiusz_brief" — ✨ v3 — DNA zawodnika, fundament dostosowania tonu i akcentów.
- "stats_7d" / "stats_30d_excl_7d" — agregaty z logów. Porównuj. "Marek robił 50km/tydzień, teraz tylko 20" = warning.
- "days_since_last_log" — najszybszy sygnał alarmowy.
- "days_since_coach_comment" — jak długo trener milczy. >7 dni dla nowego zawodnika = warning.
- "realization_pct_7d" — % zrealizowanych planów.
- "race_goals" — cele czasowe zawodnika na konkretne dystanse. Używaj w kontekście planu.
- "training_plans_active" — czy ma aktywny plan? Ile tygodni? Cel?
- "plan_workouts_upcoming" — co ma na dziś/jutro. Wzmianka w briefie jeśli ważny trening.
- "athlete_feedback_recent" — co zawodnik napisał w odpowiedzi na raporty AI. Złoto.
- "log_comments_recent" — dialog pod logami między trenerem a zawodnikiem.
- "unanswered_athlete_msgs" — wiadomość od zawodnika BEZ odpowiedzi. >24h = pilne.
- "strava_connected" + "strava_days_since_sync" — czy Strava działa. Jeśli >7 dni bez sync mimo aktywnych logów → może rozłączyła się, warto powiadomić.
- "strava_activities_14d" — surowe dane z Stravy: pace, HR, elevation. Porównuj z logami w "logs_7d" — jeśli się różnią, zawodnik może edytować ręcznie.
- "intake_context.avoid_topics" — NIGDY nie poruszaj tych tematów w suggested_msg.
- "intake_context.chat_style" — preferowany styl rozmowy zawodnika ("friendly", "formal", etc.). Dostosuj ton suggested_msg.
- "intake_context.injuries" / "chronic" / "prior_injuries" — pełna historia medyczna. Filtruj sugestie.
- "intake_context.motivation" — czemu zawodnik trenuje. Używaj w motywacji.
- "next_race_days" — dni do najbliższego zawodu. 0-7 = taper alert, >30 = długoterminowy plan.

⚠️ KRYTYCZNE: athlete_id w odpowiedzi MUSI być DOKŁADNIE skopiowany z pola "id" z danych wejściowych zawodnika. ZERO zmian, żadne dodawanie znaków, żadne skracanie. Jeśli zawodnik ma id "72e76d23-c19c-4f77-912a-4a238e3a6982" — w odpowiedzi MA być DOKŁADNIE "72e76d23-c19c-4f77-912a-4a238e3a6982". Powtórz po sobie znak po znaku przed zwróceniem JSON.

KRYTERIA PRIORYTETÓW:
🚨 PILNE (red):
- Brak logu 3+ dni przy aktywnym planie (days_since_last_log >= 3 AND ma training_plans_active)
- Realizacja <50% planu tygodniowego (realization_pct_7d < 50)
- Ból/kontuzja w komentarzu (sygnały: "bolało", "ciągnęło", "ciężko z X", liczba 5+/10 w bólu)
- Wiadomość zawodnika do trenera bez odpowiedzi >48h (unanswered_athlete_msgs[].hours_ago > 48)
- Athlete_feedback z reaction "thumbs_down" lub negatywny feedback na raporcie AI
- Spadek volumenu >50% (stats_7d.total_km vs stats_30d_excl_7d.total_km/3.3)

⚠️ UWAGA (yellow):
- Trener nie komentował pod logami >7 dni (days_since_coach_comment > 7)
- Spadek tempa o >15 s/km przy podobnych biegach
- Zawody w ciągu 7-14 dni (next_race_days 1-14)
- Nowy zawodnik (<14 dni w app) bez komentarza trenera pod żadnym logiem
- Trening wykonany ale komentarz lakoniczny ("ok", "meh") — może warto dopytać
- Skok wolumenu >30% tydzień do tygodnia (przeciążenie!)
- Strava odłączona / brak sync >7 dni
- Średnie HR znacznie wyższe w stats_7d vs stats_30d_excl_7d (zmęczenie kumulujące)
- Athlete_feedback z "neutral" reaction ale negatywnym tekstem

✅ OK: wszyscy pozostali — krótka lista imion (max 12 chipów + "+X" jeśli więcej). Zawodnicy z dobrymi trendami i regularnością.

FORMAT ODPOWIEDZI: zwracaj WYŁĄCZNIE valid JSON, bez markdownu, bez komentarzy, bez \`\`\`. Schema:
{
  "greeting": "1-2 zdania wstępu, naturalne — do trenera. Możesz wspomnieć ogólny trend dnia (np. 'Dzień dobry — większość Twoich biega regularnie, ale Adam i Iwona wymagają uwagi'). Sprawdź ortografię.",
  "urgent": [
    {
      "athlete_id": "uuid SKOPIOWANE DOKŁADNIE z input \`id\`",
      "name": "DOKŁADNIE \`full_name\` z TEGO SAMEGO obiektu input — sprawdź tabelę ID→IMIĘ wyżej",
      "meta": "KRÓTKA ETYKIETA CAPS (max 25 znaków)",
      "desc": "1-2 zdania konkretnych faktów z PERSPEKTYWY TRENERA (3 os.) — używaj cyfr z stats_7d/stats_30d, dat z days_since_*",
      "suggested_msg": "Gotowa wiadomość DO zawodnika (2 os., 2-3 zdania). Sprawdź ortografię."
    }
  ],
  "warning": [...identyczna struktura jak urgent],
  "ok_chips": ["Imię1", "Imię2", ...max 12 imion — wszystkie z tabeli ID→IMIĘ],
  "ok_count": liczba_wszystkich_OK,
  "stats": { "km_week": suma_total_km_w_stats_7d_wszystkich, "regularity_pct": średnia_realization_pct_7d, "pending_intakes": liczba_oczekujących_ankiet },
  "actions": [
    { "athlete_id": "uuid", "to": "Imię (pierwsze imię z full_name z tabeli)", "icon": "pierwsza_litera", "text": "Sugerowana wiadomość (2 os.) — może być inna niż w urgent/warning, np. szybka pochwala dla OK zawodnika" }
  ]
}

LIMITY: PILNYCH max 4, UWAGA max 4, AKCJI max 5 (priorytetyzuj najważniejsze). KAŻDA pozycja urgent/warning MUSI mieć suggested_msg (wiadomość do zawodnika, 2 os., gotowa do wysłania). KAŻDA suggested_msg sprawdzona ortograficznie.

🚨 FINALNY CHECKLIST PRZED ZWRÓCENIEM JSON:
1. KAŻDY athlete_id zweryfikowany literka-po-literce z polem "id" w danych input.
2. KAŻDE name (i to w actions) PRZECZYTANE z TEGO SAMEGO obiektu co athlete_id — sprawdź tabelę ID→IMIĘ wyżej.
3. Żaden fakt z jednego zawodnika NIE jest przypisany do imienia drugiego.
4. Każda pozycja w "urgent" i "warning" MA "suggested_msg" (gotowa wiadomość 2 os.).
5. Polska ortografia sprawdzona — szczególnie "ogarniemy" (nie "ogarnięmy"), "trenujesz" (nie "traenujesz"), "się dzieje" rozdzielnie.
6. "desc" w 3. osobie ("Marek nie biegał"), "suggested_msg" w 2. osobie ("Hej Marek, widzę że nie biegałeś").
7. JSON valid, żadnego markdown, żadnych komentarzy.`;

  // Kontekst trenera (kim jest, ile zawodników, czekające ankiety)
  const pendingIntakesSummary = (ctx.intakes_pending || []).length > 0
    ? ctx.intakes_pending.map((p: any) =>
        `- ${p.full_name || "Anonim"} (cel: ${Array.isArray(p.main_goal) ? p.main_goal.join(", ") : p.main_goal || "—"}, ${p.target_race_name || "bez startu"})`
      ).join("\n")
    : "(brak)";

  const userMessage = `KONTEKST DLA KLAUDIUSZA

TRENER: ${coach.full_name} (od ${coach.created_at?.slice(0, 10) || "—"})
LICZBA AKTYWNYCH ZAWODNIKÓW: ${ctx.athletes.length}

🔑 TABELA POPRAWNYCH PRZYPISAŃ ID → IMIĘ (źródłowa prawda — używaj jej):

${athleteLookupTable}

⛔ KAŻDY athlete_id i name w outputie MUSI być z tej tabeli. ŻADNYCH WYJĄTKÓW.

CZEKAJĄCE ANKIETY DO AKCEPTACJI: ${ctx.pending_intakes}
${ctx.pending_intakes > 0 ? `Lista (do informacji w briefie):\n${pendingIntakesSummary}` : ""}

DANE ZAWODNIKÓW — pole analityka_formy: tsb (+5..+15 optimum startowe, <-25 przeciążenie), monotonia_7d (>=2.0 = brak zróżnicowania = ryzyko), km_30d + zmiana_km_msc (o ile km wiecej/mniej vs poprzednie 30 dni \u2014 wspomnij gdy istotna zmiana, np. duzy wzrost = ryzyko, spadek = mniej pracy); gotowosc.sygnaly (RHR/HRV/sen z zegarka; niepuste = organizm pracuje, delikatnie zasugeruj lżejszy dzień). null = brak danych, nie zgaduj.
(każdy zawodnik ma: id, name, klaudiusz_brief, pbs, race_goals, stats_7d, stats_30d_excl_7d, logs_7d, plan_workouts_upcoming, training_plans_active, messages_recent, unanswered_athlete_msgs, log_comments_recent, coach_notes, intake_context, recent_ai_reports, athlete_feedback_recent, upcoming_races, strava_*):

${JSON.stringify(athleteSummaries, null, 2)}

ZADANIE: Wygeneruj brief dnia dla ${coachFirstName} zgodnie z instrukcjami z systemPromptu.

⚠️ CHECKLIST PRZED ZWRÓCENIEM JSON:
1. Każdy athlete_id zweryfikowany literka-po-literce z polem "id" w danych powyżej.
2. KAŻDE name (i to w actions) skopiowane Z TEGO SAMEGO OBIEKTU co athlete_id — sprawdź tabelę ID→IMIĘ wyżej.
3. Żaden fakt z jednego zawodnika NIE jest przypisany do imienia drugiego.
4. Każda pozycja w "urgent" i "warning" MA "suggested_msg" (gotowa wiadomość 2 os.).
5. Polska ortografia sprawdzona — szczególnie "ogarniemy" (nie "ogarnięmy"), "trenujesz" (nie "traenujesz"), "się dzieje" rozdzielnie.
6. "desc" w 3. osobie ("Marek nie biegał"), "suggested_msg" w 2. osobie ("Hej Marek, widzę że nie biegałeś").
7. Każdy klaudiusz_brief uwzględniony (jeśli niepusty) — fundament tonu dla danego zawodnika.
8. JSON valid, żadnego markdown, żadnych komentarzy.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.content[0].text.trim();

  // Wyciągnij JSON (extractJson — toleruje prozę prefix/suffix + fence). Błąd → brief:null (serve zwróci graceful, NIE throw/500).
  let brief: any = null;
  try {
    brief = JSON.parse(extractJson(text));
  } catch (e) {
    console.error("[Klaudiusz] JSON parse error. Raw:", text.slice(0, 500));
  }

  return {
    brief,
    tokens_in: data.usage?.input_tokens || 0,
    tokens_out: data.usage?.output_tokens || 0,
  };
}

async function saveBrief(admin: any, coachId: string, brief: any, tokens_in: number, tokens_out: number) {
  const today = new Date().toISOString().slice(0, 10);

  // Upsert — jeśli już jest brief na dziś, nadpisz
  const { error } = await admin
    .from("daily_briefs")
    .upsert({
      coach_id: coachId,
      brief_date: today,
      content_json: brief,
      generated_at: new Date().toISOString(),
      model_used: MODEL,
      tokens_in,
      tokens_out,
    }, { onConflict: "coach_id,brief_date" });

  if (error) throw new Error(`Zapis briefa nieudany: ${error.message}`);
}