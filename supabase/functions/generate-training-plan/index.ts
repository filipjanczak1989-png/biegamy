// ════════════════════════════════════════════════════════════════════
// BIEGAMY — Edge Function: generate-training-plan (v3 — structured steps)
// ════════════════════════════════════════════════════════════════════
// ⚠️ WYMAGANA MIGRACJA PRZED DEPLOYEM (Dashboard → SQL):
//   ALTER TABLE training_plan_workouts
//     ADD COLUMN IF NOT EXISTS steps jsonb,
//     ADD COLUMN IF NOT EXISTS steps_version smallint;
//   (training_plan_workouts NIE ma wzorca REVOKE-ALL → granty SELECT/INSERT
//    dla authenticated nadają się automatycznie, manualny GRANT nie jest potrzebny.)
//   Jeśli migracja nie zostanie zrobiona — EF i tak zadziała: insert workouts
//   robi fallback bez kolumn steps (patrz handler), plan się wygeneruje płasko.
//
// v3 zmiany (vs v2):
//   - STRUCTURED STEPS: dla treningów strukturalnych (Interwały/Tempo/fartlek/
//     progresja) model emituje pole "steps" — maszynową reprezentację treningu
//     pod przyszły Garmin push. Proste biegi → "steps": null.
//   - Port validateWorkoutSteps (wg BiegaMy_workout_steps_schema.md) — walidacja
//     server-side PRZED insertem. Anti-fabrication: złe steps → null (zero crasha).
//   - Insert workouts: dodane steps + steps_version, z fallbackiem gdy kolumny
//     nie istnieją (mirror wzorca input_coach_note).
//   - max_tokens 12000 → 16000 (steps zwiększają objętość outputu).
//
// v2 zmiany (vs v1):
//   - COACH NOTE: opcjonalny komentarz trenera (max 2000 znaków) przed
//     generowaniem planu — daje Klaudiuszowi szerszy kontekst o zawodniku
//     (kontuzje, sytuacja życiowa, samopoczucie, ksywki, ostatnie starty etc.)
//   - Komentarz wstrzykiwany do prompta jako sekcja "KONTEKST OD TRENERA"
//   - Klaudiusz traktuje go jako BACKGROUND (nie cytuje wprost)
//   - Zapisany do training_plans.input_coach_note (jeśli kolumna istnieje)
//     lub do JSONB raw_input snapshot
//
// v1 zachowane:
//   - Pełen prompt builder (styl trenera, polskie nazewnictwo, ludzki touch)
//   - Few-shot z poprzednich planów + raportów AI
//   - Kontekst: 60 dni logów, Strava, plan vs wykonanie
//   - JSON response parser, validacja, insert do training_plans + workouts
// ════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;   // rotacja: nowy sb_secret priorytet, legacy fallback
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CLAUDE_MODEL = "claude-sonnet-4-6"; // ✨ v2.8: Sonnet 4.6 - ta sama cena, lepsza jakość, 1M kontekstu
// Prompt caching planowany w przyszłości gdy skala >10 zawodników - wymaga restrukturyzacji prompta.
// Aktualnie koszt 1 planu ~$0.07-0.10, nie warto ryzykować regresji jakości dla minimalnych oszczędności.



const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ✨ v2: Maksymalna długość komentarza trenera
const MAX_COACH_NOTE_LENGTH = 2000;

// ─── Mapping plan_type → ile tygodni ────────────────────────────────────
const PLAN_WEEKS: Record<string, { min: number; max: number; default: number }> = {
  weekly: { min: 1, max: 1, default: 1 },
  micro: { min: 1, max: 2, default: 2 },
  meso: { min: 3, max: 6, default: 4 },
  macro: { min: 8, max: 16, default: 12 },
};

// ─── Polskie dni tygodnia (0=niedziela ISO standard pg) ─────────────────
function getDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekNumberFromStart(startDate: string, currentDate: string): number {
  const start = new Date(startDate + "T00:00:00Z");
  const cur = new Date(currentDate + "T00:00:00Z");
  const diffDays = Math.floor((cur.getTime() - start.getTime()) / 86400000);
  return Math.floor(diffDays / 7) + 1;
}

// ✨ v2.3: Helper — normalizacja race_goals do tablicy
function normalizeRaceGoals(rawRaceGoals: any): any[] {
  if (Array.isArray(rawRaceGoals)) return rawRaceGoals;
  if (rawRaceGoals && typeof rawRaceGoals === 'object') return [rawRaceGoals];
  if (typeof rawRaceGoals === 'string' && rawRaceGoals.trim()) {
    try {
      const parsed = JSON.parse(rawRaceGoals);
      return Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
    } catch {
      return [];
    }
  }
  return [];
}

// ✨ v2.3: Helper — wyłapuje race_goals które wpadają w okres planu
function detectUpcomingRaces(raceGoals: any[], planStartDate: string, planEndDate: string): any[] {
  return raceGoals
    .filter((g: any) => {
      const raceDate = g.date || g.race_date || g.target_date || g.pb_date || null;
      if (!raceDate) return false;
      return raceDate >= planStartDate && raceDate <= planEndDate;
    })
    .map((g: any) => ({
      name: g.name || g.race_type || g.type || "Start",
      date: g.date || g.race_date || g.target_date || g.pb_date,
      distance: g.distance_km || g.distance || null,
      target_time: g.target_time || g.pb_time || null,
      location: g.location || g.city || null,
      raw: g,
    }))
    .sort((a: any, b: any) => a.date.localeCompare(b.date));
}

// ═══════════════════════════════════════════════════════════════════
// ✨ v3 (steps): Port validateWorkoutSteps wg BiegaMy_workout_steps_schema.md
// Walidacja structured workouts PRZED insertem. Pure (bez DOM/sieci).
// Zwraca { ok, errors, stepCount }. stepCount = kroki po rozwinięciu repeatów.
// Anti-fabrication: jeśli model zwróci niepoprawne steps → odrzucamy (null),
// trening działa płasko. Egzekwuje limit Garmina (≤50 kroków).
// ═══════════════════════════════════════════════════════════════════
function validateWorkoutSteps(steps: any): { ok: boolean; errors: string[]; stepCount: number } {
  const STEP_KINDS = ['warmup', 'run', 'recovery', 'rest', 'cooldown'];
  const DUR_TYPES = ['distance', 'time', 'open'];
  const TGT_TYPES = ['none', 'pace', 'hr', 'hr_zone'];
  const MAX_STEPS = 50;
  const isInt = (n: any) => typeof n === 'number' && isFinite(n) && Math.floor(n) === n;
  const isPosInt = (n: any) => isInt(n) && n > 0;
  const errs: string[] = [];

  function validateDuration(d: any, path: string) {
    if (!d || typeof d !== 'object') { errs.push(path + '.duration: brak/zły typ'); return; }
    if (DUR_TYPES.indexOf(d.type) === -1) { errs.push(path + '.duration.type nieprawidłowy: ' + d.type); return; }
    if (d.type === 'distance') { if (!isPosInt(d.m)) errs.push(path + '.duration.m musi być dodatnią liczbą całkowitą (metry)'); }
    else if (d.type === 'time') { if (!isPosInt(d.s)) errs.push(path + '.duration.s musi być dodatnią liczbą całkowitą (sekundy)'); }
  }
  function validateTarget(t: any, path: string) {
    if (!t || typeof t !== 'object') { errs.push(path + '.target: brak/zły typ'); return; }
    if (TGT_TYPES.indexOf(t.type) === -1) { errs.push(path + '.target.type nieprawidłowy: ' + t.type); return; }
    if (t.type === 'pace') {
      if (!isPosInt(t.min_s_per_km) || !isPosInt(t.max_s_per_km)) { errs.push(path + '.target pace: min/max_s_per_km muszą być dodatnimi int'); return; }
      if (t.min_s_per_km > t.max_s_per_km) errs.push(path + '.target pace: min_s_per_km (szybsza) musi być ≤ max_s_per_km (wolniejsza)');
    } else if (t.type === 'hr') {
      if (!isPosInt(t.min_bpm) || !isPosInt(t.max_bpm)) { errs.push(path + '.target hr: min/max_bpm muszą być dodatnimi int'); return; }
      if (t.min_bpm > t.max_bpm) errs.push(path + '.target hr: min_bpm ≤ max_bpm');
    } else if (t.type === 'hr_zone') {
      if (!isInt(t.zone) || t.zone < 1 || t.zone > 5) errs.push(path + '.target hr_zone: zone musi być 1–5');
    }
  }
  function validateStep(s: any, path: string) {
    if (!s || typeof s !== 'object') { errs.push(path + ': nie jest obiektem'); return; }
    if (STEP_KINDS.indexOf(s.kind) === -1) { errs.push(path + '.kind nieprawidłowy: ' + s.kind); return; }
    validateDuration(s.duration, path);
    validateTarget(s.target, path);
    if (s.note != null && typeof s.note !== 'string') errs.push(path + '.note musi być stringiem');
  }

  if (!Array.isArray(steps)) return { ok: false, errors: ['steps musi być tablicą'], stepCount: 0 };
  if (steps.length === 0) return { ok: false, errors: ['steps nie może być pusta'], stepCount: 0 };
  let count = 0;
  steps.forEach((el: any, i: number) => {
    const path = 'steps[' + i + ']';
    if (el && el.kind === 'repeat') {
      if (!isPosInt(el.count)) errs.push(path + '.count musi być dodatnią liczbą całkowitą');
      if (!Array.isArray(el.steps) || el.steps.length === 0) { errs.push(path + '.steps (repeat) musi być niepustą tablicą'); return; }
      el.steps.forEach((cs: any, j: number) => {
        const cpath = path + '.steps[' + j + ']';
        if (cs && cs.kind === 'repeat') { errs.push(cpath + ': zagnieżdżony repeat niedozwolony (v1)'); return; }
        validateStep(cs, cpath);
      });
      count += (isPosInt(el.count) ? el.count : 0) * el.steps.length;
    } else { validateStep(el, path); count += 1; }
  });
  if (count > MAX_STEPS) errs.push('Za dużo kroków po rozwinięciu repeatów: ' + count + ' > ' + MAX_STEPS + ' (limit Garmina)');
  return { ok: errs.length === 0, errors: errs, stepCount: count };
}

// ═══════════════════════════════════════════════════════════════════
// ✨ v2 NOWE: Formatowanie komentarza trenera do prompta
// ═══════════════════════════════════════════════════════════════════
function formatCoachNoteSection(coachNote: string): string {
  if (!coachNote || !coachNote.trim()) return '';
  
  return `

═══════════════════════════════════════════════════════
KONTEKST OD TRENERA — DODATKOWE TŁO PRZED PLANOWANIEM
═══════════════════════════════════════════════════════

Trener przekazuje Ci następujący kontekst o zawodniku, który NIE WYNIKA bezpośrednio z danych treningowych. Wykorzystaj te informacje, by lepiej zrozumieć sytuację i odpowiednio dostosować plan.

⚠️ JAK TO WYKORZYSTAĆ:
— Traktuj jako BACKGROUND dla swojego rozumowania (nie cytuj notatki w samym planie).
— Jeśli notatka mówi o kontuzji / przeciążeniu / przerwie — DOSTOSUJ INTENSYWNOŚĆ planu (mniej tempa, więcej regeneracji, łagodniejsza progresja).
— Jeśli notatka opisuje sytuację życiową (praca, mało snu, dzieci) — UWZGLĘDNIJ to w objętości i wymaganiach.
— Jeśli notatka zawiera ksywkę / żart trenera (np. "Łysy", "Kenijczyk") — możesz to delikatnie podchwycić w summary lub rationale (raz, nie nadużywaj).
— Jeśli notatka mówi o ostatnim starcie / ultra / maratonie — uwzględnij regenerację po wysiłku.
— W warnings możesz wprost odwołać się do troski (np. "Pamiętam o Twojej kawalerce w weekend, w pierwszych 2 dniach lekko").

⛔ NIE PISZ "TRENER MI POWIEDZIAŁ ŻE..." — pisz tak, jakbyś sam wiedział o tej sytuacji.

NOTATKA OD TRENERA:
"""
${coachNote.trim()}
"""

═══════════════════════════════════════════════════════
KONIEC NOTATKI TRENERA
═══════════════════════════════════════════════════════
`;
}

// ─── Build kontekstu zawodnika dla prompt ───────────────────────────────
async function buildAthleteContext(supabase: any, athleteId: string, coachId?: string) {   /* PLANER-2 P2: +coachId dla stylu cross-athlete */
  // 1. Profil zawodnika
  const { data: athlete } = await supabase
    .from("athletes")
    .select("full_name, profile_data, race_goals, tdee, goal, target_date")
    .eq("id", athleteId)
    .maybeSingle();

  // 2. Ostatnie 60 logów (więcej kontekstu - z odczuciami i screenshotami)
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const cutoff60 = sixtyDaysAgo.toISOString().slice(0, 10);

  const { data: logs } = await supabase
    .from("training_logs")
    .select("id, logged_at, distance_km, pace, heart_rate, duration, training_type, feel, comment, attachment_url, elevation_gain, source")
    .eq("athlete_id", athleteId)
    .gte("logged_at", cutoff60)
    .not("training_type", "like", "__badge__%")
    .order("logged_at", { ascending: false })
    .limit(80);

  /* ═══ PLANER-2 P1: ANALITYKA — TSB/CTL/monotonia/trend EF/wellness dla modelu.
     CZWARTY swiadomy duplikat wag sb.js (obok RAPORT-AI+/BRIEF+) — zmiana tam => tu. ═══ */
  let analityka: any = null;
  try {
    const _EFF: Record<string, number> = { 'odpoczynek':0,'regeneracja':1.0,'spokojny':1.5,'bieg spokojny':1.5,'wybieganie':2.0,'d\u0142ugi':2.5,'wzmacniaj\u0105cy':1.5,'zast\u0119pczy':1.5,'tempo':3.5,'progresja':3.0,'interwa\u0142y':4.5,'start':5.0,'wy\u015bcig':5.0 };
    const _FEEL: Record<string, number> = { good:1.0, mid:1.1, bad:1.3 };
    const _dMin = (d: any) => { const t=String(d||'').trim(); if(!t) return 0;
      const q=t.split(':').map(Number); if(q.some(isNaN)) return 0;
      return q.length===3?q[0]*60+q[1]+q[2]/60:q.length===2?q[0]+q[1]/60:(+t||0); };
    const od90p = new Date(Date.now()-90*864e5).toISOString();
    const { data: l90p } = await supabase.from("training_logs")
      .select("logged_at,training_type,duration,feel,heart_rate,gap_pace,pace")
      .eq("athlete_id", athleteId).gte("logged_at", od90p)
      .not("training_type","like","__badge__%");
    const dniP: Record<string, number> = {};
    const efP: {x:number,y:number}[] = [];
    const TLENp=/spokoj|wybieg|d\u0142ug|dlug|regener/, WYKLp=/interwa|tempo|progres|start|wy\u015bcig|zawod|si\u0142|sil/;
    for (const l of (l90p||[])) {
      const typ=String(l.training_type||'').toLowerCase().trim();
      const tr=_dMin(l.duration)*(_EFF[typ]!==undefined?_EFF[typ]:1.5)*(_FEEL[String(l.feel)]||1.0);
      const dk=String(l.logged_at).slice(0,10); dniP[dk]=(dniP[dk]||0)+tr;
      if (TLENp.test(typ)&&!WYKLp.test(typ)&&l.heart_rate>=80&&l.heart_rate<=200) {
        const m=String(l.gap_pace||l.pace||'').match(/^(\d{1,2}):(\d{2})/);
        if (m){ const sek=+m[1]*60+ +m[2];
          if(sek>=150&&sek<=720) efP.push({x:new Date(l.logged_at).getTime()/864e5,y:(1000/sek)/l.heart_rate*1000}); } }
    }
    let ctlP=0, atlP=0; const dTRp: number[]=[];
    for (let k=89;k>=0;k--){ const ds=new Date(Date.now()-k*864e5).toISOString().slice(0,10);
      const t=dniP[ds]||0; dTRp.push(t); ctlP+=(t-ctlP)*(1/42); atlP+=(t-atlP)*(1/7); }
    const w7p=dTRp.slice(-7), s7p=w7p.reduce((a,b)=>a+b,0), sr7p=s7p/7;
    const sd7p=Math.sqrt(w7p.reduce((a,b)=>a+(b-sr7p)*(b-sr7p),0)/7);
    const monoP=sr7p<=0?0:(sd7p>0?Math.min(sr7p/sd7p,4):4);
    let efPct: number|null=null;
    if (efP.length>=5){ const n=efP.length; let sx=0,sy=0,sxy=0,sxx=0;
      for(const q of efP){sx+=q.x;sy+=q.y;sxy+=q.x*q.y;sxx+=q.x*q.x;}
      const sl=(n*sxy-sx*sy)/(n*sxx-sx*sx||1); efPct=Math.round(sl*90/((sy/n)||1)*1000)/10; }
    let wellP: any=null;
    try {
      const odWp=new Date(Date.now()-7*864e5).toISOString().slice(0,10);
      const { data: welp } = await supabase.from("wellness")
        .select("date,resting_hr,hrv,sleep_secs,readiness").eq("athlete_id",athleteId)
        .gte("date",odWp).order("date",{ascending:false});
      if (welp&&welp.length){ const o=welp[0];
        wellP={ ostatni_dzien:o.date, resting_hr:o.resting_hr, hrv:o.hrv, readiness:o.readiness,
          sen_h:o.sleep_secs!=null?Math.round(o.sleep_secs/360)/10:null, dni_z_danymi:welp.length }; }
    } catch(_){}
    analityka = { ctl: Math.round(ctlP), atl: Math.round(atlP), tsb: Math.round(ctlP-atlP),
      monotonia_7d: Math.round(monoP*10)/10, strain_7d: Math.round(s7p*monoP),
      trend_ef_90d_pct: efPct, biegi_tlenowe_z_hr: efP.length, wellness: wellP };
  } catch(_) { /* analityka opcjonalna */ }

  // 3. Strava 60 dni
  const { data: strava } = await supabase
    .from("strava_activities")
    .select("start_date, distance, moving_time, average_heartrate, max_heartrate, type, total_elevation_gain")
    .eq("athlete_id", athleteId)
    .gte("start_date", cutoff60)
    .order("start_date", { ascending: false })
    .limit(80);

  // ✨ v4 (watch): 3b. Szczegóły aktywności z zegarka (cache intervals-activity-detail; best-effort — tylko oglądane)
  const { data: watchDetails } = await supabase
    .from("intervals_activities")
    .select("intervals_activity_id, start_date_local, type, raw_data")
    .eq("athlete_id", athleteId)
    .gte("start_date_local", cutoff60)
    .order("start_date_local", { ascending: false })
    .limit(20);

  // 4. Zaplanowane treningi (kontekst objętości tygodniowej + plan vs wykonanie)
  const { data: recentTrainings } = await supabase
    .from("trainings")
    .select("date, type, distance_km, duration_min, status")
    .eq("athlete_id", athleteId)
    .gte("date", cutoff60)
    .order("date", { ascending: false })
    .limit(80);

  // 5. POPRZEDNIE PLANY AI — wszystkie statusy oprócz odrzuconych
  // Bierzemy także draft, bo edycje w draft też są sygnałem stylu trenera
  const { data: prevPlans } = await supabase
    .from("training_plans")
    .select("id, plan_type, start_date, end_date, target_race_type, target_time, ai_summary, total_workouts, total_distance_km, status, approved_at")
    .eq("athlete_id", athleteId)
    .in("status", ["approved", "completed", "draft"])
    .order("created_at", { ascending: false })
    .limit(5); // zwiększyłem z 3 do 5 dla lepszej próbki

  // 6. Treningi z poprzedniego planu (1 ostatni approved) — żeby widzieć co dokładnie był schemat
  let prevPlanWorkouts: any[] = [];
  if (prevPlans && prevPlans.length > 0) {
    const lastPlan = prevPlans[0];
    const { data: ws } = await supabase
      .from("training_plan_workouts")
      .select("date, day_of_week, week_number, workout_type, target_distance_km, target_pace, target_hr_zone, edited_by_coach")
      .eq("plan_id", lastPlan.id)
      .order("date")
      .limit(30); // max 30 sample workouts dla referenicji
    prevPlanWorkouts = ws || [];
  }

  // ✨ 6b. WSZYSTKIE EDYTOWANE PRZEZ TRENERA workouts ze wszystkich planów
  // To jest KLUCZOWE dla nauki stylu — gdy trener edytuje target_pace,
  // jest to WYRAŹNY sygnał czego AI ma się nauczyć
  let coachEditedWorkouts: any[] = [];
  if (prevPlans && prevPlans.length > 0) {
    const planIds = prevPlans.map((p: any) => p.id);
    const { data: edited } = await supabase
      .from("training_plan_workouts")
      .select("workout_type, target_distance_km, target_pace, target_hr_zone, target_hr_min, target_hr_max, target_duration_min, title, description")
      .in("plan_id", planIds)
      .eq("edited_by_coach", true)
      .order("date", { ascending: false })
      .limit(40); // max 40 edytowanych workout-ów jako próbka
    coachEditedWorkouts = edited || [];
  }

  /* ═══ PLANER-2 P2: OGOLNY STYL TRENERA (cross-athlete) — dla nowych zawodnikow bez historii.
     Edycje trenera u INNYCH jego zawodnikow = slabszy sygnal (priorytet nizej niz per-athlete). ═══ */
  let coachStyleWorkouts: any[] = [];
  try {
    if (coachId) {
      const { data: coachAthletes } = await supabase.from("athletes")
        .select("id").eq("coach_id", coachId).neq("id", athleteId).limit(50);
      const otherIds = (coachAthletes || []).map((a: any) => a.id);
      if (otherIds.length) {
        const { data: coachPlans } = await supabase.from("training_plans")
          .select("id").in("athlete_id", otherIds)
          .in("status", ["approved", "completed"])
          .order("created_at", { ascending: false }).limit(15);
        const cpIds = (coachPlans || []).map((p: any) => p.id);
        if (cpIds.length) {
          const { data: cw } = await supabase.from("training_plan_workouts")
            .select("workout_type, target_distance_km, target_pace, target_hr_zone, description")
            .in("plan_id", cpIds).eq("edited_by_coach", true)
            .order("date", { ascending: false }).limit(30);
          coachStyleWorkouts = cw || [];
        }
      }
    }
  } catch (_) { /* styl cross-athlete opcjonalny */ }

  // 7. RAPORTY AI o zawodniku — ostatnie 5 wysłanych (visible_to_athlete=true)
  // Daje AI pełen obraz: jak zawodnik wygląda, co było analizowane, co Ty edytowałeś,
  // jakie były ostrzeżenia, co zawodnik o tym sądzi (athlete_feedback)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoff90 = ninetyDaysAgo.toISOString();

  const { data: aiReports } = await supabase
    .from("ai_reports")
    .select("id, generated_at, report_type, period_start, period_end, summary, content_markdown, content_markdown_edited, athlete_feedback, athlete_reaction, coach_edit_count")
    .eq("athlete_id", athleteId)
    .eq("visible_to_athlete", true)
    .gte("generated_at", cutoff90)
    .order("generated_at", { ascending: false })
    .limit(5);

  // ✨ v2.4: Coach athlete notes — prywatne notatki trenera o zawodniku
  // Tylko nieresolved z ostatnich 90 dni. Notatki "start" z datą wpadające 
  // w okres planu są też auto-dodawane do race_goals.
  const { data: coachNotes } = await supabase
    .from("coach_athlete_notes")
    .select("id, tag, note, event_date, created_at, is_resolved")
    .eq("athlete_id", athleteId)
    .eq("is_resolved", false)
    .gte("created_at", cutoff90)
    .order("created_at", { ascending: false })
    .limit(30);

  // ✨ v2.7: WIADOMOŚCI CZATU trener-zawodnik z ostatnich 60 dni
  // To jest złoto kontekstu - zawodnik często mimochodem rzuca tu informacje
  // ("biegnę w niedzielę", "bolało kolano po wczoraj", "w weekend mam wyjazd").
  // Klaudiusz musi to czytać i wyciągać sygnały.
  const { data: chatMessages } = await supabase
    .from("messages")
    .select("sender, body, sent_at")
    .eq("athlete_id", athleteId)
    .gte("sent_at", cutoff60 + "T00:00:00Z")
    .order("sent_at", { ascending: false })
    .limit(80);

  // ─── Stats ─────
  const allKm = [
    ...(logs || []).map((l: any) => Number(l.distance_km) || 0),
    ...(strava || []).map((a: any) => (Number(a.distance) || 0) / 1000),
  ];
  const totalKm60 = allKm.reduce((s, x) => s + x, 0);
  const avgWeeklyKm = Math.round((totalKm60 / 60) * 7);

  // FIX-OBJETOSC: objetosc per ostatnie 4 tygodnie (nie tylko srednia 60d — mylaca przy zmiennej objetosci)
  const _tygKm = [0, 0, 0, 0];   // [ten tydzien, -1, -2, -3]
  const _teraz = Date.now();
  for (const l of (logs || [])) {
    const dni = Math.floor((_teraz - new Date(l.logged_at).getTime()) / 86400000);
    const wk = Math.floor(dni / 7);
    if (wk >= 0 && wk < 4) _tygKm[wk] += (Number(l.distance_km) || 0);
  }
  const tygKmStr = _tygKm.map((k) => Math.round(k)).join(', ');   // "45, 65, 98, 82"
  const ostatniPelnyTydzien = Math.round(_tygKm[1]);   // -1 tydzien (ostatni zamkniety)

  // Ile logów ma odczucia (feel)
  const logsWithFeel = (logs || []).filter((l: any) => l.feel && l.feel.trim());
  // ✨ v4 (watch): logi zmierzone zegarkiem (intervals.icu) — HR/pace obiektywne
  const watchLogs = (logs || []).filter((l: any) => l.source === 'intervals');
  // Ile logów ma screenshoty
  const logsWithAttachment = (logs || []).filter((l: any) => l.attachment_url);
  // Ile raportów ma feedback od zawodnika
  const reportsWithFeedback = (aiReports || []).filter((r: any) => r.athlete_feedback || r.athlete_reaction);

  // ═══════════════════════════════════════════════════════════════════
  // ✨ v2.5: PATTERN ANALYSIS — preprocessuje logi i daje Klaudiuszowi
  // gotowe insighty zamiast surowych danych.
  // To rozwiązuje problem "powtarzających się gafów":
  //   - jeśli zawodnik 3× pisał "ciężko" w środę → środa za ciężka
  //   - jeśli HR przy spokojnym tempie rośnie → przeciążenie
  //   - jeśli % wykonania spadł → plan zbyt ambitny
  // ═══════════════════════════════════════════════════════════════════
  const patterns: any = {};

  // 1. ANALIZA ODCZUĆ PER DZIEŃ TYGODNIA
  // Wyłapuje wzorce typu "środa zawsze ciężka" lub "weekend ok"
  const dayNames = ['Nd','Pn','Wt','Śr','Cz','Pt','Sb'];
  const feelByDow: Record<string, { good: number; mid: number; bad: number; total: number; comments: string[] }> = {};
  for (const dn of dayNames) feelByDow[dn] = { good: 0, mid: 0, bad: 0, total: 0, comments: [] };
  
  for (const l of (logs || [])) {
    if (!l.logged_at) continue;
    const d = new Date(l.logged_at);
    if (isNaN(d.getTime())) continue;
    const dow = dayNames[d.getDay()];
    feelByDow[dow].total++;
    if (l.feel === 'good' || l.feel === 'great') feelByDow[dow].good++;
    else if (l.feel === 'bad') feelByDow[dow].bad++;
    else if (l.feel === 'mid') feelByDow[dow].mid++;
    if (l.feel === 'bad' && l.comment) feelByDow[dow].comments.push(l.comment.substring(0, 60));
  }
  
  // Identyfikuj problematyczne dni (>30% bad lub ≥3 negatywnych)
  patterns.problematicDays = [];
  for (const dn of dayNames) {
    const f = feelByDow[dn];
    if (f.total >= 3 && (f.bad >= 3 || (f.bad / f.total) > 0.3)) {
      patterns.problematicDays.push({
        day: dn,
        badCount: f.bad,
        totalCount: f.total,
        ratio: Math.round((f.bad / f.total) * 100),
        sampleComments: f.comments.slice(0, 3),
      });
    }
  }

  // 2. ANALIZA ODCZUĆ PER TYP TRENINGU
  // Wyłapuje "interwały zawsze ciężkie" lub "tempo idzie OK"
  const feelByType: Record<string, { good: number; mid: number; bad: number; total: number; comments: string[] }> = {};
  for (const l of (logs || [])) {
    const t = l.training_type || 'Inne';
    if (!feelByType[t]) feelByType[t] = { good: 0, mid: 0, bad: 0, total: 0, comments: [] };
    feelByType[t].total++;
    if (l.feel === 'good' || l.feel === 'great') feelByType[t].good++;
    else if (l.feel === 'bad') feelByType[t].bad++;
    else if (l.feel === 'mid') feelByType[t].mid++;
    if (l.feel === 'bad' && l.comment) feelByType[t].comments.push(l.comment.substring(0, 60));
  }
  patterns.feelByType = Object.entries(feelByType)
    .filter(([_, v]: any) => v.total >= 2)
    .map(([type, v]: any) => ({
      type,
      total: v.total,
      goodPct: Math.round((v.good / v.total) * 100),
      badPct: Math.round((v.bad / v.total) * 100),
      sampleBadComments: v.comments.slice(0, 2),
    }));

  // 3. PLAN VS WYKONANIE — % wykonania w ostatnich 4 tygodniach
  const last28d = new Date(); last28d.setDate(last28d.getDate() - 28);
  const last28dStr = last28d.toISOString().slice(0, 10);
  const trainings28 = (recentTrainings || []).filter((t: any) => t.date >= last28dStr);
  const completed28 = trainings28.filter((t: any) => t.status === 'done');
  const missed28 = trainings28.filter((t: any) => t.status === 'missed');
  patterns.last28dPlanned = trainings28.length;
  patterns.last28dCompleted = completed28.length;
  patterns.last28dMissed = missed28.length;
  patterns.completionRate28 = trainings28.length > 0 
    ? Math.round((completed28.length / trainings28.length) * 100) 
    : null;

  // 4. NAJCZĘŚCIEJ OMIJANE TYPY TRENINGÓW
  const missedByType: Record<string, number> = {};
  for (const t of missed28) {
    const tt = t.type || 'Inne';
    missedByType[tt] = (missedByType[tt] || 0) + 1;
  }
  patterns.mostMissedTypes = Object.entries(missedByType)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => ({ type, count }));

  // 5. STREAK MISSED — ile dni z rzędu zawodnik nie zrobił logu
  const sortedTrainings = [...(recentTrainings || [])]
    .filter((t: any) => t.date <= new Date().toISOString().slice(0, 10))
    .sort((a: any, b: any) => b.date.localeCompare(a.date));
  let streakMissed = 0;
  const logsByDate: Record<string, boolean> = {};
  for (const l of (logs || [])) {
    if (l.logged_at) logsByDate[l.logged_at.slice(0, 10)] = true;
  }
  for (const t of sortedTrainings) {
    if (t.type === 'Odpoczynek') break;
    if (!logsByDate[t.date]) streakMissed++;
    else break;
  }
  patterns.currentStreakMissed = streakMissed;

  // 6. TREND HR vs PACE (oznaki przeciążenia)
  // Liczymy średnie HR i pace dla biegów spokojnych z ostatnich 30 dni vs poprzednich 30 dni
  const last30d = new Date(); last30d.setDate(last30d.getDate() - 30);
  const last30dStr = last30d.toISOString().slice(0, 10);
  const easyLogs = (logs || []).filter((l: any) => 
    (l.training_type === 'Bieg spokojny' || l.training_type === 'Spokojny' || l.training_type === 'Wybieganie')
    && l.heart_rate && l.pace
  );
  const recent30 = easyLogs.filter((l: any) => l.logged_at >= last30dStr);
  const prev30 = easyLogs.filter((l: any) => l.logged_at < last30dStr);
  
  function avgHr(arr: any[]) { 
    if (!arr.length) return null;
    return Math.round(arr.reduce((s, l) => s + (Number(l.heart_rate) || 0), 0) / arr.length);
  }
  patterns.recentEasyHrAvg = avgHr(recent30);
  patterns.prevEasyHrAvg = avgHr(prev30);
  patterns.hrDriftWarning = (patterns.recentEasyHrAvg && patterns.prevEasyHrAvg && 
    patterns.recentEasyHrAvg - patterns.prevEasyHrAvg >= 5);

  // 7. WYKORZYSTANE ODCZUCIA — zbierz wszystkie komentarze z 'bad' feel + screenami
  // To jest kluczowe — nie tylko statystyka ale konkretne sygnały
  patterns.recentBadComments = (logs || [])
    .filter((l: any) => l.feel === 'bad' && l.comment)
    .slice(0, 8)
    .map((l: any) => ({
      date: l.logged_at?.slice(0, 10),
      type: l.training_type,
      distance: l.distance_km,
      comment: l.comment.substring(0, 120),
    }));

  // 8. OSTATNIE OSTRZEŻENIA Z RAPORTÓW AI — co już sygnalizowałem
  patterns.recentWarningsFromReports = (aiReports || [])
    .slice(0, 3)
    .map((r: any) => ({
      date: r.generated_at?.slice(0, 10),
      type: r.report_type,
      // Wyciągnij linie zaczynające się od ⚠ lub zawierające "ostrzeżenie", "uważaj"
      warningHints: r.summary && typeof r.summary === 'string' 
        ? r.summary.substring(0, 200) 
        : '',
    }))
    .filter((r: any) => r.warningHints);

  // ✨ v4 (watch): watchInsights — przeliczone wnioski z wykresów (splity/strefy/kadencja; NIE surowe serie)
  const watchInsights = (watchDetails || []).map((w: any) => {
    const rd = w.raw_data || {};
    const wdate = String(w.start_date_local || "").slice(0, 10);
    const wtype = w.type || "?";
    const sp = Array.isArray(rd.splits) ? rd.splits.filter((s: any) => typeof s.pace_s === "number") : [];
    let evenness: string | null = null, splitRange: string | null = null;
    if (sp.length >= 3) {
      const mid = sp.slice(1, -1).map((s: any) => s.pace_s);
      const spread = Math.max(...mid) - Math.min(...mid);
      evenness = spread <= 15 ? "równo" : spread <= 30 ? "nierówno" : "rozsypane";
      const fmt = (x: number) => { const t = Math.round(x); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
      splitRange = `${fmt(Math.min(...mid))}–${fmt(Math.max(...mid))}`;
    }
    let zonesStr: string | null = null;
    const z = rd.hr_zones;
    if (z && Array.isArray(z.time_s) && z.time_s.length) {
      const tot = z.time_s.reduce((a: number, b: number) => a + (b || 0), 0) || 1;
      zonesStr = z.time_s.map((t: number, i: number) => `${(z.labels && z.labels[i]) || "Z" + (i + 1)}:${Math.round((100 * t) / tot)}%`).join(" ");
    }
    const cad = rd.stats && typeof rd.stats.avg_cadence === "number" ? Math.round(rd.stats.avg_cadence) : null;
    return { wdate, wtype, evenness, splitRange, zonesStr, cad };
  });

  return {
    athlete,
    logs: logs || [],
    strava: strava || [],
    watchInsights, // ✨ v4 (watch)
    recentTrainings: recentTrainings || [],
    prevPlans: prevPlans || [],
    prevPlanWorkouts,
    coachEditedWorkouts, // ✨ v2.2: edytowane przez trenera workouts (sygnał stylu)
    coachStyleWorkouts,   /* PLANER-2 P2: styl cross-athlete */
    aiReports: aiReports || [],
    coachNotes: coachNotes || [], // ✨ v2.4: notatki trenera nieresolved
    chatMessages: chatMessages || [], // ✨ v2.7: wiadomości czatu
    patterns, // ✨ v2.5: gotowe insighty
    analityka,   /* PLANER-2 P1 */
    stats: {
      totalKm60d: Math.round(totalKm60),
      avgWeeklyKm,
      tygKmStr,
      ostatniPelnyTydzien,
      logsCount: (logs || []).length,
      watchLogsCount: watchLogs.length, // ✨ v4 (watch)
      logsWithFeel: logsWithFeel.length,
      logsWithAttachment: logsWithAttachment.length,
      stravaCount: (strava || []).length,
      watchDetailsCount: watchInsights.length, // ✨ v4 (watch)
      prevPlansCount: (prevPlans || []).length,
      coachEditedCount: coachEditedWorkouts.length, // ✨ v2.2
      aiReportsCount: (aiReports || []).length,
      reportsWithFeedbackCount: reportsWithFeedback.length,
      coachNotesCount: (coachNotes || []).length, // ✨ v2.4
      chatMessagesCount: (chatMessages || []).length, // ✨ v2.7
    },
  };
}

// ─── Build prompt dla Claude ────────────────────────────────────────────
function buildPrompt(
  context: any,
  planType: string,
  weeks: number,
  startDate: string,
  endDate: string,
  targetRaceType: string | null,
  targetRaceDate: string | null,
  targetTime: string | null,
  targetVolumeKm: number | null,
  coachNote: string,  // ✨ v2: nowy parametr
): string {
  const ath = context.athlete || {};
  const profileData = ath.profile_data || {};
  // ✨ v2.3: race_goals normalizacja przez helper
  const raceGoals = normalizeRaceGoals(ath.race_goals);
  
  // ✨ v2.4: Augmentacja raceGoals — dorzuć notatki trenera z tagiem "start" i datą
  // Powód: zawodnik często NIE wpisuje celów ale powie trenerowi mimochodem.
  // Trener zapisuje to jako notatkę → tutaj dodajemy do listy startów.
  const coachNotesAsRaces = (context.coachNotes || [])
    .filter((n: any) => n.tag === 'start' && n.event_date)
    .map((n: any) => ({
      name: 'Start (z notatki trenera)',
      date: n.event_date,
      note: n.note,
      source: 'coach_note',
      coach_note_id: n.id,
    }));
  const raceGoalsAugmented = [...raceGoals, ...coachNotesAsRaces];
  
  const stats = context.stats;

  // ─── Recent logs jako tekst (z odczuciami i komentarzami!) ─────
  // ✨ v2.5: 50 logów (było 30), priorytet dla logów z odczuciami i komentarzami
  // Sortowanie: najpierw te z bad feel + komentarz (najwartościowsze), potem reszta chronologicznie
  const allLogsArr = [...context.logs];
  // Score per log: 3 = bad+comment, 2 = comment, 1 = feel, 0 = nic
  const scoreLog = (l: any) => {
    let s = 0;
    if (l.feel === 'bad') s += 3;
    else if (l.feel === 'good' || l.feel === 'great') s += 1;
    else if (l.feel === 'mid') s += 1;
    if (l.comment && l.comment.trim().length > 0) s += 2;
    if (l.attachment_url) s += 1;
    return s;
  };
  // Najpierw 25 najwartościowszych (z odczuciami/komentarzami), potem 25 najnowszych
  const topByValue = [...allLogsArr]
    .sort((a, b) => scoreLog(b) - scoreLog(a))
    .slice(0, 25);
  const topByValueIds = new Set(topByValue.map((l: any) => l.id || l.logged_at));
  const restRecent = allLogsArr
    .filter((l: any) => !topByValueIds.has(l.id || l.logged_at))
    .slice(0, 25);
  const logsToShow = [...topByValue, ...restRecent]
    .sort((a, b) => (b.logged_at || '').localeCompare(a.logged_at || ''));
  
  const feelEmoji: Record<string, string> = { good: '🙂', great: '😄', mid: '😐', bad: '😣' };
  const logsText = logsToShow.map((l: any) => {
    const date = l.logged_at?.slice(0, 10) || '?';
    const type = l.training_type || "?";
    const km = l.distance_km || 0;
    const pace = l.pace || "-";
    const hr = l.heart_rate || "-";
    const feelStr = l.feel ? ` ${feelEmoji[l.feel] || ''}${l.feel}` : "";
    const commentStr = l.comment && l.comment.trim() 
      ? ` | KOMENTARZ: "${l.comment.substring(0, 200)}"` 
      : "";
    const screen = l.attachment_url ? " | 📷screen" : "";
    const watch = l.source === 'intervals' ? " | ⌚zegarek" : "";
    return `${date} | ${type} | ${km}km | ${pace} | HR ${hr}${feelStr}${commentStr}${screen}${watch}`;
  }).join("\n") || "(brak logów)";

  // ─── Strava jako tekst ─────
  const stravaText = context.strava.slice(0, 20).map((a: any) =>
    `${a.start_date?.slice(0, 10)} | ${a.type || "?"} | ${((a.distance || 0) / 1000).toFixed(1)}km | ${Math.round((a.moving_time || 0) / 60)}min | HR avg ${a.average_heartrate || "-"} | elev ${Math.round(a.total_elevation_gain || 0)}m`
  ).join("\n") || "(brak Strava)";

  // ─── ✨ v4 (watch): WYKRESY Z ZEGARKA — INSIGHTY (tylko przeliczone wnioski, bez surowych serii) ─────
  const watchInsightsText = (context.watchInsights || []).map((w: any) => {
    const parts = [];
    if (w.evenness) parts.push(`splity ${w.splitRange} (${w.evenness})`);
    if (w.zonesStr) parts.push(`strefy HR ${w.zonesStr}`);
    if (w.cad != null) parts.push(`kadencja ${w.cad}${w.cad < 160 ? " ⚠️<160" : ""}`);
    return parts.length ? `${w.wdate} | ${w.wtype} | ${parts.join(" | ")}` : null;
  }).filter(Boolean).join("\n");

  // ─── PLAN vs WYKONANIE — porównanie ─────
  // Match logs to recent trainings — czy wykonują plan?
  const trainingsByDate: Record<string, any> = {};
  for (const t of context.recentTrainings) {
    trainingsByDate[t.date] = t;
  }
  const logsByDate: Record<string, any> = {};
  for (const l of context.logs) {
    const d = l.logged_at?.slice(0, 10);
    if (d) logsByDate[d] = l;
  }
  
  let planVsExec = "";
  const sortedTrainingDates = Object.keys(trainingsByDate).sort().slice(-15);
  for (const d of sortedTrainingDates) {
    const t = trainingsByDate[d];
    const l = logsByDate[d];
    const status = t.status === "done" ? "✅" : t.status === "missed" ? "❌" : "⚪";
    const exec = l ? `wykonał ${l.distance_km || 0}km @ ${l.pace || "?"}` : "(brak logu)";
    planVsExec += `${d} ${status} plan: ${t.type} ${t.distance_km || 0}km → ${exec}\n`;
  }
  if (!planVsExec) planVsExec = "(brak planu vs wykonanie)";

  // ─── PB z race_goals ─────
  const pbText = raceGoals.length > 0
    ? raceGoals.map((g: any) => `${g.race_type || g.type || "?"}: ${g.pb_time || g.target_time || "-"}${g.pb_date ? " (" + g.pb_date + ")" : ""}`).join(", ")
    : "(brak danych PB)";

  // ✨ v2.3: KLUCZOWY FIX — wyłapujemy race_goals które wpadają W OBRĘBIE planu
  // ✨ v2.4: Używamy raceGoalsAugmented (race_goals + notatki trenera "start" z datą)
  const planStartDate = startDate;
  const planEndDate = endDate;
  const upcomingRaces = detectUpcomingRaces(raceGoalsAugmented, planStartDate, planEndDate);

  // Również race goals POZA planem ale nadchodzące (do 90 dni od końca planu) — kontekst do długoterminowego budowania formy
  const futureRaces = raceGoalsAugmented
    .filter((g: any) => {
      const raceDate = g.date || g.race_date || g.target_date || g.pb_date || null;
      if (!raceDate) return false;
      // Po końcu planu, ale w ciągu 90 dni
      const endPlusNinety = new Date(planEndDate + "T00:00:00Z");
      endPlusNinety.setUTCDate(endPlusNinety.getUTCDate() + 90);
      const endPlusNinetyStr = endPlusNinety.toISOString().slice(0, 10);
      return raceDate > planEndDate && raceDate <= endPlusNinetyStr;
    })
    .map((g: any) => ({
      name: g.name || g.race_type || g.type || "Start",
      date: g.date || g.race_date || g.target_date || g.pb_date,
      distance: g.distance_km || g.distance || null,
      target_time: g.target_time || g.pb_time || null,
    }))
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  // ─── HISTORIA POPRZEDNICH PLANÓW ─────
  let prevPlansText = "(brak poprzednich planów AI)";
  if (context.prevPlans && context.prevPlans.length > 0) {
    prevPlansText = context.prevPlans.map((p: any) => 
      `• ${p.plan_type.toUpperCase()} | ${p.start_date} → ${p.end_date} | cel: ${p.target_race_type || "ogólny"}${p.target_time ? " (" + p.target_time + ")" : ""} | ${p.total_workouts || 0} treningów / ${p.total_distance_km || 0}km | ${p.ai_summary || ""}`
    ).join("\n");
  }

  // ─── SCHEMAT POPRZEDNIEGO PLANU (próbka tygodnia) ─────
  let prevPatternText = "";
  if (context.prevPlanWorkouts && context.prevPlanWorkouts.length > 0) {
    // Pierwszy tydzień jako wzór
    const week1 = context.prevPlanWorkouts.filter((w: any) => w.week_number === 1).slice(0, 7);
    if (week1.length > 0) {
      const dayN = ["Nd","Pn","Wt","Śr","Cz","Pt","Sb"];
      prevPatternText = "Schemat tygodnia z ostatniego planu (referencja Twojego stylu):\n" +
        week1.map((w: any) => {
          const editFlag = w.edited_by_coach ? " 🖋️[EDYTOWANY]" : "";
          return `${dayN[w.day_of_week]}: ${w.workout_type} ${w.target_distance_km || ""}km @ ${w.target_pace || "-"}${editFlag}`;
        }).join("\n");
    }
  }

  // ✨ v2.3: Sekcja STARTY W OBRĘBIE PLANU — KLUCZOWY KONTEKST
  // Pokazuje AI dokładnie kiedy zawodnik biegnie zawody (race_goals z bazy)
  // i wymusza tapering + start day + post-race recovery
  // ✨ v2.5: PATTERN INSIGHTS — gotowe wnioski z preprocessing
  // Klaudiusz dostaje ANALIZĘ a nie tylko surowe dane.
  // Tu są sygnały które AI MOŻE PRZEOCZYĆ czytając tylko logi.
  let patternInsightsText = "";
  const p = context.patterns || {};
  const insights: string[] = [];

  // 1. Problematyczne dni tygodnia
  if (p.problematicDays && p.problematicDays.length > 0) {
    for (const pd of p.problematicDays) {
      const samples = pd.sampleComments.length > 0 
        ? ` Komentarze: "${pd.sampleComments.join('"; "')}"` 
        : '';
      insights.push(`🔴 **${pd.day}** — zawodnik ${pd.badCount}/${pd.totalCount} razy (${pd.ratio}%) źle się czuł. Może środa interwałów to za dużo, może wtorek tempo plus środa interwały to ciąg jakościowy do rozbicia.${samples}`);
    }
  }

  // 2. Typy treningów które zawodnik znosi źle
  if (p.feelByType && p.feelByType.length > 0) {
    const badTypes = p.feelByType.filter((t: any) => t.badPct >= 30 && t.total >= 3);
    for (const bt of badTypes) {
      const samples = bt.sampleBadComments.length > 0 
        ? ` Komentarze: "${bt.sampleBadComments.join('"; "')}"` 
        : '';
      insights.push(`🔴 **${bt.type}** — zawodnik ${bt.badPct}% razy źle się czuje. Możliwe że tempo jest za szybkie lub objętość za duża.${samples}`);
    }
    const goodTypes = p.feelByType.filter((t: any) => t.goodPct >= 70 && t.total >= 3);
    for (const gt of goodTypes) {
      insights.push(`🟢 **${gt.type}** — ${gt.goodPct}% pozytywnych odczuć. Tutaj zawodnik czuje się komfortowo.`);
    }
  }

  // 3. Plan vs wykonanie
  if (p.completionRate28 !== null) {
    const rate = p.completionRate28;
    if (rate < 60) {
      insights.push(`⚠️ **Wykonanie ${rate}%** ostatnich 4 tygodni (${p.last28dCompleted}/${p.last28dPlanned}). Plan był za ambitny lub zawodnik miał trudny okres. NIE dokładaj objętości — utrzymaj lub zmniejsz, dopóki wykonanie nie wzrośnie.`);
    } else if (rate >= 85) {
      insights.push(`✅ **Wykonanie ${rate}%** — zawodnik solidnie trzyma rytm (${p.last28dCompleted}/${p.last28dPlanned}). Można rozważyć lekką progresję.`);
    } else {
      insights.push(`📊 **Wykonanie ${rate}%** — przeciętne (${p.last28dCompleted}/${p.last28dPlanned}). Utrzymaj poziom, nie szarżuj.`);
    }
  }

  // 4. Najczęściej omijane typy
  if (p.mostMissedTypes && p.mostMissedTypes.length > 0) {
    const tops = p.mostMissedTypes.slice(0, 2).map((m: any) => `${m.type} (${m.count}x)`).join(', ');
    insights.push(`🚫 **Najczęściej omijane**: ${tops}. To są typy które zawodnikowi nie pasują w aktualnym kontekście — może być pora dnia, intensywność lub problem życiowy. Rozważ alternatywy lub porozmawiaj z zawodnikiem.`);
  }

  // 5. Streak missed
  if (p.currentStreakMissed && p.currentStreakMissed >= 3) {
    insights.push(`⚠️ **${p.currentStreakMissed} dni z rzędu BEZ LOGU** — zawodnik wypadł z rytmu. Pierwszy tydzień planu MUSI być łagodniejszy (objętość -30%, brak interwałów, dużo regeneracji). Powrót do planu, nie kara za przerwę.`);
  }

  // 6. HR drift (oznaki przeciążenia)
  if (p.hrDriftWarning) {
    insights.push(`⚠️ **HR DRIFT WYKRYTY** — średnie HR przy spokojnym biegu wzrosło z ${p.prevEasyHrAvg} do ${p.recentEasyHrAvg} bpm. To oznaki przeciążenia lub niewystarczającej regeneracji. Zostaw więcej dni regeneracji, OBNIŻ intensywność interwałów.`);
  }

  // 7. Komentarze "bad" z ostatnich logów
  if (p.recentBadComments && p.recentBadComments.length > 0) {
    const commentsText = p.recentBadComments.slice(0, 5).map((c: any) => 
      `   • [${c.date}] ${c.type} ${c.distance || '?'}km: "${c.comment}"`
    ).join("\n");
    insights.push(`💬 **NEGATYWNE KOMENTARZE Z LOGÓW** — przeczytaj UWAŻNIE, każdy komentarz to sygnał:\n${commentsText}`);
  }

  if (insights.length > 0) {
    patternInsightsText = `

═══════════════════════════════════════════════════════
🔬 PATTERN INSIGHTS — ANALIZA WZORCÓW PRZED PLANOWANIEM
═══════════════════════════════════════════════════════

To są INSIGHTY wynikające z analizy logów ostatnich 60 dni. NIE są to surowe dane — to gotowe wnioski które MUSISZ uwzględnić.

⚠️ KAŻDY INSIGHT TUTAJ TO SYGNAŁ. Jeśli ignorujesz, popełnisz błąd:

${insights.join("\n\n")}

KLUCZOWE ZASADY:
1. **Problematyczne dni** → zmień strukturę tygodnia (np. nie rób Wt-tempo + Śr-interwały jeśli środa zawsze "ciężko")
2. **Niewykonanie** → MNIEJ ambicji, NIE WIĘCEJ
3. **Streak missed** → RESTART, pierwszy tydzień łagodniej
4. **HR drift** → REGENERACJA, nie szarża
5. **Negatywne komentarze** → CYTUJ je w warnings i rationale ("widzę że ${ath.full_name?.split(' ')[0] || 'Marcin'} pisał że...")

⛔ Ignorowanie któregokolwiek z tych insightów = TYDZIEŃ W TYDZIEŃ TE SAME GAFY. Zawodnik straci zaufanie.

═══════════════════════════════════════════════════════
KONIEC PATTERN INSIGHTS
═══════════════════════════════════════════════════════
`;
  }

  // ✨ v2.6: CYKL UCZENIA — co zawodnik mówi/czuje, co już Filip wie o nim
  // Łączymy: reakcje na raporty, odczucia z logów, komentarze, notatki trenera
  let learningLoopText = "";
  const learningSignals: string[] = [];

  // 1. Reakcje zawodnika na ostatnie raporty AI (👍/👎 + feedback)
  const reactedReports = (context.aiReports || []).filter((r: any) => r.athlete_reaction || r.athlete_feedback);
  if (reactedReports.length > 0) {
    const reactSignals = reactedReports.slice(0, 5).map((r: any) => {
      const reactEmoji = r.athlete_reaction === 'thumbs_up' ? '👍'
        : r.athlete_reaction === 'thumbs_down' ? '👎'
        : r.athlete_reaction === 'love' ? '❤️' : '';
      const fbStr = r.athlete_feedback ? `\n     💬 "${r.athlete_feedback.substring(0, 200)}"` : '';
      const dateStr = r.generated_at?.slice(0, 10) || '?';
      return `   • [${dateStr}] raport ${r.report_type}: ${reactEmoji} ${r.athlete_reaction || 'brak reakcji'}${fbStr}`;
    }).join("\n");
    learningSignals.push(`🎯 **REAKCJE ZAWODNIKA NA POPRZEDNIE RAPORTY** (UCZ SIĘ Z TEGO):
${reactSignals}

⚠️ Jeśli zawodnik dał 👎 — zinterpretuj dlaczego (przeczytaj feedback). Jeśli pisał "za ambitnie" → mniej objętości. Jeśli "za nudno" → więcej zróżnicowania. Jeśli "ok" → trzymaj poziom.`);
  }

  // 2. Spójność komentarzy z logów — co zawodnik najczęściej pisze
  const allComments = (context.logs || [])
    .filter((l: any) => l.comment && l.comment.trim().length > 5)
    .slice(0, 20)
    .map((l: any) => ({
      date: l.logged_at?.slice(0, 10),
      type: l.training_type,
      feel: l.feel,
      comment: l.comment.substring(0, 150),
    }));
  
  if (allComments.length > 0) {
    const commentText = allComments.slice(0, 10).map((c: any) => {
      const feelEmoji = c.feel === 'good' ? '🙂' : c.feel === 'great' ? '😄' : c.feel === 'bad' ? '😣' : c.feel === 'mid' ? '😐' : '';
      return `   • [${c.date}] ${c.type} ${feelEmoji}: "${c.comment}"`;
    }).join("\n");
    learningSignals.push(`💬 **KOMENTARZE ZAWODNIKA Z LOGÓW** (cytuj je w rationale!):
${commentText}

⚠️ Te komentarze są ZŁOTEM. Cytuj je w rationale jeśli rezonują z bieżącym planem ("widziałem że pisałeś 4 maja...").`);
  }

  // 3. Wzorzec samopoczucia - rolling average
  const last14 = (context.logs || []).filter((l: any) => {
    const cutoff14 = new Date(); cutoff14.setDate(cutoff14.getDate() - 14);
    return l.logged_at >= cutoff14.toISOString().slice(0, 10);
  });
  const last14WithFeel = last14.filter((l: any) => l.feel);
  if (last14WithFeel.length >= 3) {
    const feelScore = (f: string) => f === 'great' ? 4 : f === 'good' ? 3 : f === 'mid' ? 2 : f === 'bad' ? 1 : 2;
    const avg = last14WithFeel.reduce((s: number, l: any) => s + feelScore(l.feel), 0) / last14WithFeel.length;
    let trendNote = '';
    if (avg >= 3.5) trendNote = '🟢 ZAWODNIK CZUJE SIĘ ŚWIETNIE w ostatnich 14 dniach — można delikatnie progresować';
    else if (avg <= 1.8) trendNote = '🔴 ZAWODNIK CZUJE SIĘ ŹLE w ostatnich 14 dniach — DELOAD/REGENERACJA priorytet';
    else if (avg >= 2.5) trendNote = '🟡 Zawodnik czuje się przeciętnie — utrzymaj poziom, nie szarżuj';
    else trendNote = '🟠 Zawodnik czuje się słabo — zmniejsz intensywność, więcej regeneracji';
    learningSignals.push(`📊 **TRENDLINE SAMOPOCZUCIA (ostatnie 14 dni)**: ${trendNote} (avg ${avg.toFixed(1)}/4, ${last14WithFeel.length} próbek)`);
  }

  // 4. Profil zawodnika z notatek — co Filip o nim wie
  const profileNotes = (context.coachNotes || []).filter((n: any) => 
    !n.is_resolved && (n.tag === 'strategia' || n.tag === 'cel' || n.tag === 'kontuzja')
  );
  if (profileNotes.length > 0) {
    const profile = profileNotes.slice(0, 5).map((n: any) => `   • [${n.tag}] ${n.note}`).join("\n");
    learningSignals.push(`👤 **PROFIL ZAWODNIKA Z NOTATEK TRENERA** (długofalowy kontekst):
${profile}`);
  }

  // ✨ v2.7: 5. WIADOMOŚCI CZATU trener-zawodnik
  // Wyciągamy ostatnie wiadomości (zwłaszcza od zawodnika - tam są mimochodem rzucone informacje)
  // i pokazujemy je AI z mocną instrukcją żeby wyłapywała sygnały
  const recentChatMessages = (context.chatMessages || []).slice(0, 30);
  if (recentChatMessages.length > 0) {
    const chatText = recentChatMessages.map((m: any) => {
      const date = m.sent_at?.slice(0, 10) || '?';
      const time = m.sent_at?.slice(11, 16) || '';
      const who = m.sender === 'athlete' ? '🏃 ZAWODNIK' : '👤 TRENER';
      const body = (m.body || '').substring(0, 250);
      return `   [${date} ${time}] ${who}: "${body}"`;
    }).reverse().join("\n"); // chronologicznie - najstarsze na górze, najnowsze na dole
    
    learningSignals.push(`💬 **CZAT TRENER-ZAWODNIK (ostatnie ${recentChatMessages.length} wiadomości, 60 dni)** — WYŁAPUJ SYGNAŁY:
${chatText}

⚠️ KRYTYCZNE: Zawodnik często mimochodem rzuca tu informacje których NIE wpisuje w logach:
- "biegnę w niedzielę" / "mam start" → 🏁 zaplanowany wyścig, dodaj do raceGoals i przygotuj tapering
- "boli kolano" / "ciężko" / "rozbity" → 🩹 kontuzja/przeciążenie, zmniejsz intensywność  
- "w weekend wyjazd" / "praca" / "rodzinne" → 🏠 sytuacja życiowa, dostosuj objętość
- "chcę pobiec sub X" / "wezmę się za to" → 🎯 ambicja, uwzględnij w rationale
- "uwielbiam interwały" / "wybieganie nudzi" → 🎨 preferencje stylu treningu

JAK MASZ WYKORZYSTAĆ:
✅ Cytuj w rationale: "widzę że 5 maja napisałeś że bolało kolano - dlatego w tym tygodniu..."
✅ Reaguj proaktywnie na sygnały: jeśli zawodnik mówił że ma start w sobotę, MUSI być w planie
✅ Pamiętaj o kontekście życiowym: jeśli zawodnik mówił że jest po nocce w pracy, NIE rób interwałów we wtorek
⛔ NIE cytuj WSZYSTKIEGO - wybierz 1-2 najważniejsze sygnały które tłumaczą decyzje w planie`);
  }

  if (learningSignals.length > 0) {
    learningLoopText = `

═══════════════════════════════════════════════════════
🔄 CYKL UCZENIA — JAK ZAWODNIK REAGUJE I CO MÓWI
═══════════════════════════════════════════════════════

Klaudiusz, masz uczyć się z każdej interakcji z zawodnikiem. Te sygnały są krytyczne:

${learningSignals.join("\n\n")}

⛔ JEŚLI ZIGNORUJESZ TE SYGNAŁY:
- Zawodnik powie znowu to samo
- Plan nie będzie dopasowany
- Trener (Filip) musi ręcznie edytować = jego frustracja
- Cykl uczenia się nie zamknie

✅ JEŚLI WYKORZYSTASZ:
- Plan rezonuje z tym co zawodnik mówi i czuje
- Trener mniej edytuje, bardziej zatwierdza
- Zawodnik dostaje "wow, trener mnie rozumie"
- Filip i Ty rośniecie razem jako asystencki tandem

═══════════════════════════════════════════════════════
KONIEC CYKLU UCZENIA
═══════════════════════════════════════════════════════
`;
  }
  
  let racesInPlanText = "";
  if (upcomingRaces.length > 0) {
    const raceList = upcomingRaces.map((r: any) => {
      const distStr = r.distance ? ` ${r.distance}km` : '';
      const timeStr = r.target_time ? ` (cel ${r.target_time})` : '';
      const locStr = r.location ? ` [${r.location}]` : '';
      return `   • ${r.date} — ${r.name}${distStr}${timeStr}${locStr}`;
    }).join("\n");
    
    racesInPlanText = `

═══════════════════════════════════════════════════════
🏁 STARTY W OBRĘBIE TEGO PLANU — KRYTYCZNY KONTEKST
═══════════════════════════════════════════════════════

Zawodnik ma w okresie planu (${planStartDate} → ${planEndDate}) zaplanowane następujące starty:

${raceList}

⚠️ MUSISZ to uwzględnić — to NIEPODLEGAJĄCE NEGOCJACJI:

1. **Dzień startu** — workout_type MUSI być "Start" (NIE "Bieg spokojny" ani "Tempo"). 
   - title: "${upcomingRaces[0].name}${upcomingRaces[0].location ? ' — ' + upcomingRaces[0].location : ''}"
   - description: konkretne wskazówki przedstartowe (rozgrzewka, strategia tempa, picie, jedzenie)
   - target_distance_km: dystans wyścigu
   - target_pace: tempo startowe (jeśli zawodnik podał cel czasowy → wylicz; inaczej spokojnie pisz "tempo startowe")
   
2. **Tydzień przed startem (3-7 dni przed)** — TAPERING:
   - Redukcja objętości o 30-40% w stosunku do peak-u
   - Brak ciężkich interwałów w ostatnich 5 dniach przed startem
   - Krótkie aktywizujące akcenty są OK (np. 4-6×100m przebieżki w środę)
   - Dzień przed startem: lekki rozruch 3-4km LUB pełen odpoczynek
   
3. **Dzień po starcie** — workout_type MUSI być "Regeneracja" lub "Odpoczynek"
   - Krótki spokojny bieg 4-6km LUB pełen wolny dzień
   - **NIGDY** interwały / tempo / długie wybieganie dzień po starcie
   
4. **2-3 dni po starcie** — bardzo lekko (regeneracja / spokojny ~30min)
   
5. **Tydzień po starcie** — odbudowa, normalna intensywność wracać dopiero pod koniec tygodnia

6. **W summary i rationale** — KONIECZNIE wspomnij start po imieniu i z datą:
   ✅ "${upcomingRaces[0].name} w ${upcomingRaces[0].date.split('-').reverse().slice(0,2).join('.')} jest priorytetem tego planu — szlifujemy formę..."
   ❌ "Plan uwzględnia wybrany start" — zbyt ogólnie

7. **W warnings** — jeśli np. start jest mniej niż 5 dni od początku planu, daj uwagę:
   "Mało czasu na rozkręcenie, ale i tak zostawiam Wt-Sr lekko żeby noga była świeża na niedzielę."

═══════════════════════════════════════════════════════
KONIEC STARTÓW W PLANIE
═══════════════════════════════════════════════════════
`;
  }

  // Sekcja o nadchodzących startach POZA planem (do 90 dni) — kontekst długoterminowy
  let futureRacesText = "";
  if (futureRaces.length > 0) {
    futureRacesText = `

📅 NADCHODZĄCE STARTY (po końcu tego planu, do 90 dni):
${futureRaces.map((r: any) => {
  const distStr = r.distance ? ` ${r.distance}km` : '';
  const timeStr = r.target_time ? ` (cel ${r.target_time})` : '';
  return `   • ${r.date} — ${r.name}${distStr}${timeStr}`;
}).join("\n")}

⚠️ Te starty NIE są w okresie planu, ale uwzględnij je w długoterminowej strategii. Jeśli najbliższy start jest za 4-6 tygodni — buduj formę. Jeśli za 8-12 tygodni — okres bazowy.
`;
  }

  // ✨ v2.2 — EDYCJE TRENERA: workouts gdzie trener konsekwentnie zmieniał target_pace
  // To jest WYRAŹNY sygnał czego AI ma się nauczyć — Filip dodaje 10-15s do interwałów,
  // tempo szybsze niż domyślne, regeneracja inna niż AI proponuje
  let coachEditedText = "";
  if (context.coachEditedWorkouts && context.coachEditedWorkouts.length > 0) {
    // Grupuj po typie workout
    const byType: Record<string, any[]> = {};
    for (const w of context.coachEditedWorkouts) {
      const t = w.workout_type || 'Inne';
      if (!byType[t]) byType[t] = [];
      byType[t].push(w);
    }
    
    let groupedText = "";
    for (const [type, workouts] of Object.entries(byType)) {
      const sample = workouts.slice(0, 5); // max 5 per typ
      groupedText += `\n### ${type} — ${workouts.length} edytowanych workoutów (próbka ${sample.length}):\n`;
      groupedText += sample.map((w: any) => {
        const dist = w.target_distance_km ? `${w.target_distance_km}km` : '';
        const pace = w.target_pace ? `tempo ${w.target_pace}` : '';
        const dur = w.target_duration_min ? `${w.target_duration_min}min` : '';
        const hr = w.target_hr_min && w.target_hr_max ? `HR ${w.target_hr_min}-${w.target_hr_max}` : (w.target_hr_zone ? `strefa ${w.target_hr_zone}` : '');
        const parts = [dist, pace, dur, hr].filter(Boolean).join(' | ');
        const titleStr = w.title ? ` "${w.title}"` : '';
        return `  • ${parts}${titleStr}`;
      }).join("\n");
    }
    
    coachEditedText = `

═══════════════════════════════════════════════════════
🎓 EDYCJE TRENERA — UCZ SIĘ Z KONKRETNYCH PRZYKŁADÓW
═══════════════════════════════════════════════════════

Trener edytował ${context.coachEditedWorkouts.length} workoutów w poprzednich planach AI dla TEGO konkretnego zawodnika. Te edycje są ŚWIĘTE — pokazują dokładnie jak trener chce żeby plan wyglądał dla tego zawodnika.

⚠️ KLUCZOWE INSTRUKCJE:
1. **Tempo (target_pace)**: jeśli widzisz że trener konsekwentnie ustawiał szybsze/wolniejsze tempo niż domyślne dla tego typu treningu — DOSTOSUJ. Nie kontynuuj poprzedniego błędu AI, użyj tych liczb jako wzorca.
2. **Interwały**: zwróć szczególną uwagę na tempo interwałów — jeśli trener ustawia np. 3:50/km zamiast 4:00/km, to znaczy że ten zawodnik biegnie ten typ szybciej niż średnia. KOPIUJ TEN STYL.
3. **Regeneracja / Spokojny**: jeśli trener wpisuje konkretne tempo ~5:30 zamiast szerokiego przedziału ~5:50-6:10, użyj jego dokładności.
4. **Dystans**: zwróć uwagę czy trener zwiększa/zmniejsza dystanse — to wskazówka jak ten zawodnik znosi objętość.
5. **HR strefy**: jeśli trener zmienia strefy, też kopiuj.

KONKRETNE EDYCJE Z PLANÓW DLA TEGO ZAWODNIKA:
${groupedText}

═══════════════════════════════════════════════════════
KONIEC EDYCJI TRENERA — STOSUJ TEN PATTERN W NOWYM PLANIE
═══════════════════════════════════════════════════════
`;
  }

  // ─── RAPORTY AI o zawodniku (analiza + Twoje edycje + opinie zawodnika) ─────
  let reportsText = "(brak raportów AI dla tego zawodnika)";
  if (context.aiReports && context.aiReports.length > 0) {
    const reactionLabels: Record<string, string> = {
      thumbs_up: "👍 zawodnik zatwierdził",
      thumbs_down: "👎 zawodnik nie zgadza się",
      love: "❤️ zawodnik bardzo zadowolony"
    };

    reportsText = context.aiReports.map((r: any, idx: number) => {
      // Użyj edytowanej wersji jeśli istnieje (Twoja edycja = lepszy sygnał stylu trenera)
      const useEdited = !!r.content_markdown_edited;
      const content = useEdited 
        ? r.content_markdown_edited 
        : (r.content_markdown || r.summary || "");
      
      // Truncate do max 1500 znaków per raport żeby nie zaspamiować promptu
      const contentTrimmed = content.length > 1500 
        ? content.substring(0, 1500) + "...[skrócone]" 
        : content;
      
      const editFlag = useEdited ? ` 🖋️ EDYTOWANY PRZEZ TRENERA (${r.coach_edit_count}x)` : "";
      const reactionFlag = r.athlete_reaction 
        ? ` | ${reactionLabels[r.athlete_reaction] || r.athlete_reaction}` 
        : "";
      const feedbackFlag = r.athlete_feedback 
        ? `\n  💬 OPINIA ZAWODNIKA: "${r.athlete_feedback.substring(0, 200)}"` 
        : "";

      return `### Raport ${idx + 1}: ${r.report_type} | ${r.period_start || "-"} → ${r.period_end || "-"}${editFlag}${reactionFlag}${feedbackFlag}
${contentTrimmed}`;
    }).join("\n\n---\n\n");
  }

  // ✨ v2.4: TRWAŁE NOTATKI TRENERA o zawodniku (coach_athlete_notes z bazy)
  // To są szybkie wpisy trenera typu "Damian rzucił że biegnie półmaraton",
  // pogrupowane po tagach żeby Klaudiusz wiedział o czym mówi.
  let persistentNotesSection = "";
  if (context.coachNotes && context.coachNotes.length > 0) {
    const tagLabels: Record<string, string> = {
      'start': '🏁 STARTY',
      'cel': '🎯 CELE',
      'kontuzja': '🩹 KONTUZJE / OGRANICZENIA',
      'samopoczucie': '😴 SAMOPOCZUCIE / ENERGIA',
      'zycie': '🏠 SYTUACJA ŻYCIOWA',
      'strategia': '♟️ STRATEGIA DŁUGOFALOWA',
      'inne': '📌 INNE',
    };
    
    const byTag: Record<string, any[]> = {};
    for (const n of context.coachNotes) {
      const tag = n.tag || 'inne';
      if (!byTag[tag]) byTag[tag] = [];
      byTag[tag].push(n);
    }
    
    let groupedText = '';
    // Kolejność tagów wg priorytetu
    const tagOrder = ['start', 'kontuzja', 'cel', 'samopoczucie', 'zycie', 'strategia', 'inne'];
    for (const tag of tagOrder) {
      if (!byTag[tag] || byTag[tag].length === 0) continue;
      groupedText += `\n${tagLabels[tag] || tag.toUpperCase()}:\n`;
      groupedText += byTag[tag].map((n: any) => {
        const created = new Date(n.created_at).toISOString().slice(0, 10);
        const eventStr = n.event_date ? ` (event: ${n.event_date})` : '';
        return `  • [${created}${eventStr}] ${n.note}`;
      }).join('\n');
    }
    
    persistentNotesSection = `

═══════════════════════════════════════════════════════
📝 NOTATKI TRENERA O TYM ZAWODNIKU — TRWAŁY KONTEKST
═══════════════════════════════════════════════════════

Trener prowadzi prywatny notatnik o tym zawodniku. Te notatki nie są widoczne dla zawodnika — to tylko dla trenera i dla Ciebie. Zawierają informacje, które zawodnik rzucił mimochodem albo trener zauważył: planowane starty, kontuzje, ważne sytuacje życiowe.

⚠️ JAK WYKORZYSTAĆ:
- **Tag "start"** — ZAWODY które zawodnik chce pobiec. Jeśli wpadają w okres planu, JUŻ są w sekcji "🏁 STARTY W OBRĘBIE TEGO PLANU" wyżej. Jeśli są poza planem, weź pod uwagę długoterminowo.
- **Tag "kontuzja"** — DOSTOSUJ plan: zmniejsz intensywność, omijaj typy treningów które obciążają kontuzjowane miejsce.
- **Tag "cel"** — co zawodnik chce osiągnąć (PB, dystans, miejsce). Wbuduj w rationale.
- **Tag "samopoczucie"** — jeśli świeże wpisy mówią o zmęczeniu/przeciążeniu → łagodniejszy tydzień.
- **Tag "zycie"** — sytuacja życiowa (praca, podróż, dziecko). Uwzględnij w objętości.
- **Tag "strategia"** — długoterminowe ustalenia z trenerem.

⛔ NIE pisz "trener mi powiedział że..." — pisz tak, jakbyś sam wiedział. Wpleć kontekst naturalnie.
${groupedText}

═══════════════════════════════════════════════════════
KONIEC NOTATEK
═══════════════════════════════════════════════════════
`;
  }

  // ✨ v2: Sekcja komentarza trenera (ad-hoc — przed CEL NOWEGO PLANU)
  const coachNoteSection = formatCoachNoteSection(coachNote);

  // ✨ v3 (steps): Sekcja STRUCTURED STEPS — instrukcja emisji maszynowej struktury.
  // Trzymana w osobnej zmiennej, wstawiana przed ## OUTPUT (bez backticków w środku).
  const stepsSection = `

## ✨ STRUCTURED STEPS — MASZYNOWA STRUKTURA TRENINGU (pole "steps")

Dla treningów STRUKTURALNYCH (Interwały, Tempo, fartlek, progresja, podbiegi) DODAJ do workoutu pole "steps" — maszynową reprezentację treningu, dzięki której w przyszłości wyślemy trening prosto na zegarek Garmin. Dla prostych biegów (Bieg spokojny, Wybieganie, Regeneracja, Wzmacniający, Odpoczynek, Start) ustaw "steps": null — wystarczą pola płaskie.

### Format "steps" (tablica kroków):
- Pojedynczy krok: {"kind": <typ>, "duration": <czas/dystans>, "target": <cel>, "note": <KRÓTKA polska nazwa kroku — OBOWIĄZKOWA>}
- Blok powtórzeń: {"kind": "repeat", "count": <ile>, "steps": [<kroki>]}  (BEZ zagnieżdżonych repeat w repeat)

kind: "warmup" (rozgrzewka) | "run" (wysiłek/odcinek) | "recovery" (przerwa truchtem) | "rest" (przerwa w miejscu) | "cooldown" (schłodzenie)

duration — dokładnie jedno z:
- {"type": "distance", "m": <metry>}      np. 800 m → {"type":"distance","m":800}
- {"type": "time", "s": <sekundy>}         np. 90 s → {"type":"time","s":90}
- {"type": "open"}                          do wciśnięcia lap (bez zadanego końca)

target — dokładnie jedno z:
- {"type": "none"}                          bez celu (np. luźna przerwa truchtem)
- {"type": "pace", "min_s_per_km": <int>, "max_s_per_km": <int>}   tempo w SEKUNDACH/km; mniejsza liczba = szybciej, więc min_s_per_km ≤ max_s_per_km
- {"type": "hr", "min_bpm": <int>, "max_bpm": <int>}
- {"type": "hr_zone", "zone": <1-5>}

### Nazwy kroków ("note") — OBOWIĄZKOWE, KRÓTKIE, PO POLSKU:
- KAŻDY krok MUSI mieć "note" — zawodnik zobaczy ją jako nazwę kroku na zegarku i w apce.
- Maks ~24 znaki, bez pełnych zdań. Wzorce: "Rozgrzewka", "800 m mocno", "Trucht 400 m", "Tempo równo", "Schłodzenie", "1 min mocno", "2 min luźno", "Podbieg mocno", "Zbieg truchtem", "4 km spokojnie".
- W bloku repeat: note na krokach WEWNĄTRZ (np. "800 m mocno" / "Trucht 400 m").

### Jednostki KANONICZNE (zawsze, bez wyjątków):
- dystans w METRACH (800, nie 0.8 km)
- czas w SEKUNDACH (90, nie 1.5 min)
- tempo w SEKUNDACH na km (225 = 3:45/km, 230 = 3:50/km)

### Twarde zasady:
- Maksymalnie 50 kroków po rozwinięciu repeatów (limit Garmina). Repeat liczony jako count × liczba kroków w środku.
- Luźna przerwa truchtem bez celu tempa = "target": {"type": "none"}. NIGDY {"type": "open"} jako target — "open" dotyczy WYŁĄCZNIE duration.
- "steps" MUSI być spójne z polami płaskimi (target_pace, target_distance_km) oraz z description. To ta sama jednostka treningowa, tylko zapisana strukturalnie.
- ⚠️ DESCRIPTION przy treningu ze steps: ZAWSZE napisz PO LUDZKU po co ten trening i jak ma się czuć
  (2-3 zdania, jak trener na grupie) — to trafia do zawodnika NAD techniczną rozpiską i do zegarka.
  NIE zostawiaj samej surowej rozpiski liczb jako opisu. Przykład dobrego description dla interwałów:
  "Dziś ostry akcent — 5 razy po 800 m w tempie startowym. Rozgrzej się bez pośpiechu, na powtórzeniach
  trzymaj równo, przerwa ma być truchtem, nie spacerem. Ostatnie dwa mają boleć — o to chodzi."
- Jeśli nie potrafisz wiarygodnie zbudować struktury — ustaw "steps": null. Lepiej null niż zmyślona struktura.

### Przykład — Interwały "rozgrzewka 2 km, 5×800 m @ 3:45-3:50 z 400 m truchtu, schłodzenie 2 km":
"steps": [
  {"kind":"warmup","duration":{"type":"distance","m":2000},"target":{"type":"hr_zone","zone":2}},
  {"kind":"repeat","count":5,"steps":[
    {"kind":"run","duration":{"type":"distance","m":800},"target":{"type":"pace","min_s_per_km":225,"max_s_per_km":230}},
    {"kind":"recovery","duration":{"type":"distance","m":400},"target":{"type":"none"}}
  ]},
  {"kind":"cooldown","duration":{"type":"distance","m":2000},"target":{"type":"hr_zone","zone":2}}
]

### Przykład — Tempo "rozgrzewka 2 km, 5 km @ 4:10-4:15, schłodzenie 2 km":
"steps": [
  {"kind":"warmup","duration":{"type":"distance","m":2000},"target":{"type":"none"},"note":"Rozgrzewka"},
  {"kind":"run","duration":{"type":"distance","m":5000},"target":{"type":"pace","min_s_per_km":250,"max_s_per_km":255},"note":"Tempo równo"},
  {"kind":"cooldown","duration":{"type":"distance","m":2000},"target":{"type":"none"},"note":"Schłodzenie"}
]

### Przykład — Fartlek "10 min rozgrzewki, 8× (1 min mocno / 2 min luźno), 10 min schłodzenia":
"steps": [
  {"kind":"warmup","duration":{"type":"time","s":600},"target":{"type":"hr_zone","zone":2},"note":"Rozgrzewka"},
  {"kind":"repeat","count":8,"steps":[
    {"kind":"run","duration":{"type":"time","s":60},"target":{"type":"none"},"note":"1 min mocno"},
    {"kind":"recovery","duration":{"type":"time","s":120},"target":{"type":"none"},"note":"2 min luźno"}
  ]},
  {"kind":"cooldown","duration":{"type":"time","s":600},"target":{"type":"hr_zone","zone":2},"note":"Schłodzenie"}
]

### Przykład — Progresja "12 km: 4 km spokojnie, 4 km średnio, 4 km mocno":
"steps": [
  {"kind":"run","duration":{"type":"distance","m":4000},"target":{"type":"pace","min_s_per_km":330,"max_s_per_km":345},"note":"4 km spokojnie"},
  {"kind":"run","duration":{"type":"distance","m":4000},"target":{"type":"pace","min_s_per_km":310,"max_s_per_km":320},"note":"4 km średnio"},
  {"kind":"run","duration":{"type":"distance","m":4000},"target":{"type":"pace","min_s_per_km":290,"max_s_per_km":300},"note":"4 km mocno"}
]

### Przykład — Podbiegi "rozgrzewka 3 km, 8× podbieg ~60 s / zbieg truchtem, schłodzenie 2 km":
"steps": [
  {"kind":"warmup","duration":{"type":"distance","m":3000},"target":{"type":"none"},"note":"Rozgrzewka"},
  {"kind":"repeat","count":8,"steps":[
    {"kind":"run","duration":{"type":"time","s":60},"target":{"type":"none"},"note":"Podbieg mocno"},
    {"kind":"recovery","duration":{"type":"open"},"target":{"type":"none"},"note":"Zbieg truchtem"}
  ]},
  {"kind":"cooldown","duration":{"type":"distance","m":2000},"target":{"type":"none"},"note":"Schłodzenie"}
]
`;

  return `Jesteś trenerem biegania, który tworzy plan dla swojego zawodnika. Piszesz po imieniu, ciepło, jak człowiek do człowieka. Twoja klientela ufa Ci, więc nie używasz korporacyjnego żargonu ani sztywnego AI-tonu.

## STYL PISANIA — NAJWAŻNIEJSZE
Wyobraź sobie że siadasz z zawodnikiem przy kawie i tłumaczysz mu plan. Tak masz pisać.

### ZASADY TONU
1. **Po imieniu, do ${ath.full_name?.split(" ")[0] || "zawodnika"}** — używaj imienia w summary i rationale, nie "zawodnika", nie "klienta"
2. **Pierwsza osoba "ja-Ty"** — "widzę że...", "myślę że...", "spróbujmy...", "daj znać jak..."
3. **Konkretnie, krótko** — bez "niniejszego planu", "uwzględniono", "zaplanowano w celu"
4. **Z empatią** — jeśli zawodnik napisał że było ciężko, zacznij od tego ("Widzę z odczuć że tydzień był trudny...")
5. **Bez rzucania liczb bez kontekstu** — zamiast "objętość +15%" powiedz "lekko zwiększymy kilometraż, bo widzę że ostatnie tygodnie szły lekko"
6. **Bez listy bullet pointów w rationale** — pisz prozą, jak normalny człowiek

### PRZYKŁADY — DOBRY summary
✅ "Tydzień powrotu do tempa po krótkiej przerwie. Wtorek i piątek lekko, w środę porządnie z interwałami. Niedziela długi spokojny — pobiegamy 18 km bez bicia rekordu."
✅ "Pierwszy tydzień po starcie, regeneracja jest priorytetem. Nie spieszymy się z powrotem do interwałów — od następnego tygodnia wrócimy do normalnej pracy."
❌ "Tygodniowa jednostka treningowa zawiera akcent jakościowy w postaci interwałów" — zbyt formalne
❌ "Plan zakłada progresywny wzrost objętości o 12%" — brzmi jak raport medyczny

### PRZYKŁADY — DOBRY rationale (proza, nie bullets)
✅ "${ath.full_name?.split(" ")[0] || "Marcin"}, popatrzyłem na ostatnie tygodnie i widzę że ciało się ładnie adaptuje — wpisałeś przy 3 majowej dycha że 'było luźno'. To dobry sygnał, możemy lekko podkręcić. W tym tygodniu nie szarżuję jeszcze z objętością bo widzę że na razie wszystko gra, zachowuję rytm który działa.

Środa jest kluczowa — interwały 6×800m, mocno ale nie do upadku. Zostawiam Ci 2 minuty przerwy żeby było jakościowo. Jeśli pierwsze 3 powtórzenia będą z trudem, odpuść ostatnie 2 — lepiej pojawić się następnym razem niż się zajechać.

Niedziela to długi 18 km, bardzo wolno (~5:50/km). To bieganie 'na bazę' — nie martw się jeśli będziesz bieg jeszcze wolniej, to dobre. Jak coś nie pójdzie w nogach, daj znać w odczuciach."

### PRZYKŁADY — DOBRE description per trening
✅ "Spokojny bieg, ~5:50/km. Skupisz się na rytmie i kadencji. Jeśli ostatni km będzie szedł z górki — możesz dodać."
✅ "6×800m z 2 min przerwy. Mocno ale nie do upadku — masz utrzymać tempo wszystkich powtórzeń. Lepiej zacząć ostrożnie."
✅ "18 km, bardzo wolno (5:55-6:10/km). Nie patrz na zegarek po pierwszych 5 km — zaufaj nogom. Jeśli zacznie boleć, skróć."
✅ "Dzień wolny. Nogi mówią 'dzięki'. Spaceruj, rozciągaj, ale nie biegaj. Jutro wracamy do roboty."
❌ "Trening konwersacyjny w strefie aerobowej z możliwością progresji końcowej" — sztywne
❌ "Sesja interwałowa o intensywności VO2max" — żargon

### PRZYKŁADY — DOBRE warnings (jak troska, nie ostrzeżenie systemu)
✅ "Skok objętości +20% w stosunku do ostatniego tygodnia. Bądź wyczulony — jak coś zaboli, daj znać. Lepiej odpuścić jeden trening niż wypaść na 2 tygodnie."
✅ "${ath.full_name?.split(" ")[0] || "Marcin"} pisałeś przy ostatnim wybieganie że bolał ITB. Zostawiłem niedzielę krócej (15 zamiast 20 km). Jeśli ból wraca w tym tygodniu, odpuść środę — interwały są ostatnią rzeczą której teraz potrzebujesz."
❌ "Wzrost objętości 20% — obserwuj sygnały przeciążenia" — brzmi jak ostrzeżenie z aplikacji medycznej

### PRZYKŁADY — DOBRE title (krótkie, ludzkie)
✅ "Spokojny rozruch", "Interwały 6×800", "Długie wybieganie", "Tempo 4 km", "Dzień wolny"
❌ "Spokojny bieg adaptacyjny", "Sesja jakościowa interwałowa" — papierowe

### POLSKIE NAZEWNICTWO — KLUCZOWE!
Piszesz po polsku, do polskiego biegacza. **NIE używasz angielskich kalk** typu "easy", "long run", "tempo run", "speed work", "recovery". To brzmi jak coach z Instagrama, nie jak trener. Zawsze szukaj polskiego odpowiednika.

**Tabela tłumaczeń (zawsze używaj prawej kolumny):**
- "easy run" / "easy" → **"spokojny"** lub **"spokojny bieg"**
- "long run" / "long" → **"wybieganie"** lub **"długie wybieganie"**
- "tempo run" / "tempo" → **"tempo"** (akurat to słowo OK)
- "interval(s)" / "intervały" → **"interwały"**
- "speed work" / "speed" → **"szybkościowy"** lub **"praca nad szybkością"**
- "recovery run" / "recovery" → **"regeneracja"** lub **"regeneracyjny"**
- "fartlek" → **"fartlek"** (OK, słowo zaadaptowane)
- "warm-up" → **"rozgrzewka"**
- "cool-down" → **"schłodzenie"** lub **"wyklepanie"**
- "stride(s)" → **"przebieżki"**
- "hill repeats" → **"podbiegi"**
- "pace" (jako rzeczownik) → **"tempo"**
- "split(s)" → **"odcinek/odcinki"**
- "deload week" → **"tydzień rozładowania"** lub **"lżejszy tydzień"**
- "tapering" → **"szlifowanie formy"** lub po prostu **"luźniej przed startem"**
- "PR/PB" → **"życiówka"**
- "race pace" → **"tempo startowe"**
- "threshold" → **"próg"** lub **"tempo progowe"**
- "VO2 max" → zostaw jako "VO2 max" (techniczny termin) ale tłumacz kontekst: zamiast "trening VO2max" → "intensywne interwały rozwijające pułap tlenowy"
- "drill(s)" → **"ćwiczenia techniczne"** lub **"abc biegowe"**
- "session" → **"trening"** lub **"jednostka"** (jednostka brzmi formalnie, używaj "trening")
- "workout" → **"trening"**
- "training load" → **"obciążenie"**
- "core" → **"core"** lub **"brzuch / mięśnie głębokie"** (core jest OK potocznie)

**Konkretne przykłady:**
✅ "Niedziela: spokojne wybieganie 18 km, tempo ~5:55/km."
❌ "Niedziela: long run 18 km, easy pace ~5:55/km."

✅ "W środę interwały 6×800 z 2 minutami przerwy."
❌ "W środę interval session: 6×800 z 2 min recovery."

✅ "Po niedzielnym wybieganiu zostaw poniedziałek na regenerację."
❌ "Po niedzielnym long runie zostaw poniedziałek na recovery."

✅ "Tydzień rozładowania — ścinamy kilometry o 25%, żeby ciało nadrobiło."
❌ "Deload week — cutting volume 25% for recovery."

✅ "W piątek przebieżki na rozgrzewkę przed sobotnim tempem."
❌ "W piątek strides na warm-up przed sobotnim tempo run."

**Wyjątki — angielskie słowa które ZOSTAJĄ** (bo nie mają dobrego tłumaczenia lub są zaadaptowane):
- "fartlek" (norweski, zaadaptowany)
- "cross-training" (potocznie używane, ale wol "trening uzupełniający" lub "zastępczy")
- "tempo" (już polskie)
- "VO2 max" (termin techniczny, ale nie nadużywaj)

### Słowa do UNIKANIA:
"niniejszy", "uwzględniono", "zaplanowano w celu", "obejmuje progresję", "tygodniowa jednostka", "akcent jakościowy", "trening konwersacyjny", "strefa aerobowa", "wzrost obciążenia treningowego"

### Słowa OK / preferowane:
"widzę", "popatrzyłem", "myślę", "spróbuj", "daj znać", "lekko", "mocno", "bądź wyczulony", "zaufaj nogom", "luźno", "porządnie", "odpuść", "jak coś — pisz"

### LUDZKI TOUCH — DROBNE NIEDOSKONAŁOŚCI (KLUCZOWE!)
Trener piszący na żywo robi czasem drobne, ludzkie błędy. Zawodnik ma uwierzyć że **trener naprawdę napisał ten plan** — nie AI. Dlatego co jakiś czas (NIE w każdym zdaniu, NIE rażąco) wprowadź delikatne ślady ludzkiej ręki.

**Co to znaczy "delikatnie":**
- W całym planie maksymalnie **2-3 takie drobiazgi** (nie więcej)
- **Wyłącznie** w polach prozatorskich: \`summary\`, \`rationale\`, \`warnings\`, \`description\`
- **NIGDY** w \`workout_type\` (musi być case-sensitive z listy)
- **NIGDY** w liczbach (km, tempo, HR, daty)
- **NIGDY** w nazwach miejsc/zawodów/imion zawodnika (szanujemy zawodnika)
- **NIGDY** w polskich znakach diakrytycznych (zostają poprawne ą, ę, ż, ó itd.)

**Typowe ludzkie drobiazgi (możesz wybrać 2-3 na cały plan):**
- "ze" zamiast "z" przed niektórymi spółgłoskami ("ze środy", potocznie OK)
- pominięty przecinek przed "że" / "bo" / "ale" w jednym miejscu
- "potem" zamiast "później", "trochę" zamiast "nieco"
- bardzo rzadko: literówka w długim słowie typu "interwałay" zamiast "interwały" (tylko raz, jeśli w ogóle)
- nieformalne skróty: "jak masz okazje" zamiast "jeśli masz okazję"
- "i" rozpoczynające zdanie ("I jeszcze jedno...")
- emoji co jakiś czas (ale nie w każdym zdaniu): 🙂 💪 🏃
- czasem zaczęcie zdania z małej litery po myślniku: "— a niedzielę zostawiamy luźno"
- skrót "tyg" zamiast "tygodni"

**ABSOLUTNIE NIE:**
- Nie używaj "n3a" "k0lano" "biEgam" — to nie wygląda jak człowiek, to wygląda jak rage typo
- Nie myl ą/a, ę/e, ó/u, ż/z — to wygląda jak ktoś bez polskiej klawiatury (nieprofesjonalnie)
- Nie zostawiaj słów połączonych ("bardzo wolno" → NIE "bardzowolno")
- Nie rób błędów w pierwszych 2 zdaniach \`summary\` (pierwsze wrażenie musi być czyste)

**Przykłady jak ten "ludzki touch" wygląda w praktyce:**
✅ "Marcin, popatrzyłem na ostatnie tygodnie — fajnie że wracasz do rytmu po pauzie 💪. Wtorek lekko, w środę porządnie."
✅ "Po niedzieli 18 km masz prawo czuć zmęczenie, więc poniedziałek odpuść. Może spacer, rozciąganie i tyle."
✅ "Środa to klucz tygodnia — interwały 6x800m. Mocno, ale nie do upadku. Lepiej zacząć ostrożnie i skończyć z głową niż się zajechać w 4 powtórzeniu"  ← brak kropki na końcu, tak człowiek czasem pisze
✅ "Jak coś — pisz, lepiej żebyśmy pogadali wcześniej niż po fakcie."

**Pamiętaj:** Filip (trener) i tak będzie redagował plany przed wysłaniem do zawodnika. Twoja robota to dać mu ludzko brzmiący szkic — żeby Filip nie musiał przepisywać AI-bełkotu od zera.

### Konkretne reguły języka:
- Mów do zawodnika **TY** ("masz", "Twoje", "biegnij", "odpuść")
- Używaj **krótkich zdań** (5-15 słów). Lepiej dwa proste niż jedno zawiłe.
- **Konkrety zamiast ogólników**: "tempo 5:10" zamiast "umiarkowane tempo"
- Wplataj **dlaczego** ale krótko: "5 km bo nogi po niedzieli", nie "ze względu na zmęczenie"
- W rationale i summary możesz **przywoływać konkretne dni z logów**: "po wtorkowej środzie kiedy pisałeś że ciężko"
- Przy odczuciach z logów **odwołuj się wprost**: "widziałem że pisałeś o bólu kolana — w tym tygodniu mniej tempa"
- Unikaj słów typu: "niniejszy", "celem jest", "uwzględniono", "zaplanowano", "jednostka treningowa", "akcent", "parametr"
- W warnings: pisz jak człowiek martwiący się o zawodnika ("uważaj na ten skok objętości — jakby coś bolało, daj znać"), nie jak ostrzeżenie z systemu

${patternInsightsText}
${learningLoopText}
${racesInPlanText}

## TWOJE ZADANIE
Wygeneruj plan treningowy w formacie JSON.

## ⚠️ ANALIZA SCREENÓW Z GARMIN/STRAVA — TO NIE TŁO, TO KLUCZ DO PLANOWANIA

Pod tym promptem dołączone są screeny z aplikacji biegowych zawodnika (jeśli zawodnik je załączył do logów). NIE OPISUJ MAPKI. CZYTAJ LICZBY.

📊 CO MUSISZ ZNALEŹĆ NA KAŻDYM SCREENIE:
1. **Splity per km** — czy tempo było równe czy się rozsypywało?
2. **Avg HR + max HR** — czy odpowiada deklarowanemu typowi treningu?
3. **HR vs pace** — czy HR drift (HR rośnie przy tym samym tempie = przemęczenie)?
4. **Czas w strefach** (jeśli widoczne) — ile w 1/2/3/4/5?
5. **Kadencja** — >170 dobre, <160 ryzyko kontuzji
6. **Elevation gain** — czy podbiegi tłumaczą HR?
7. **Power** (jeśli dostępna) — czy stabilna?

🎯 STREFY DOCELOWE per typ treningu (DLA ZAWODNIKA NA POZIOMIE ${stats.avgWeeklyKm} KM/TYDZ):

| Typ | HR cel | Pace cel | Werdykt jeśli odbieg |
|---|---|---|---|
| Bieg spokojny / Wybieganie | str.2 (130-150) | +60-90s wolniej niż marathon | HR>155 → ZA MOCNO, HR<125 → ZA LEKKO |
| Tempo | str.4 (160-170) | -10 do +15s vs marathon | HR<155 → ZA LEKKO, HR>175 → ZA MOCNO |
| Interwały | str.5 (170-185) | szybciej niż 5K pace | HR<165 → ZA LEKKO |
| Regeneracja | str.1-2 (110-135) | bardzo wolno | HR>145 → ZA MOCNO |

🎯 WERDYKT — KLUCZOWY dla PLANOWANIA KOLEJNYCH treningów:

Dla KAŻDEGO screenu wystaw werdykt w głowie:
- **"ZA LEKKO"** → w nowym planie ten typ MOCNIEJSZY (szybsze pace o 10-15s, krótsze przerwy)
- **"ODPOWIEDNIO"** → kontynuuj poziom, lekko progresuj (~5% objętości)
- **"ZA MOCNO"** → w nowym planie ten typ LŻEJSZY + dodaj regenerację po
- **"ROZSYPANE"** → zawodnik nie utrzymał tempa → krótsze odcinki, dłuższe przerwy

📝 W RATIONALE PLANU MUSISZ ODWOŁAĆ SIĘ do screenów (jeśli są):
✅ "Widziałem na screenie z 8 maja że interwały robiłeś w 3:48 z HR 178 — wzorcowo, więc w tym tygodniu mocno trzymamy ten poziom."
✅ "Patrząc na niedzielę z 5 maja, HR drift na ostatnich 5km — daję Ci środowe interwały tylko 4×800 zamiast 5, żeby noga miała czas na odbudowanie."
✅ "Pace 4:35→4:50 na tempie z piątku — krótsze odcinki w tym tygodniu, 3×2km zamiast 4×2km."
❌ "Trening wyglądał ok" — nie pisz tego, to nieprofesjonalne

🔮 PROGRES — ZAWSZE OCEŃ KIERUNEK:
- ✅ JEST PROGRES: ten sam pace przy NIŻSZYM HR → możesz delikatnie podkręcić objętość/intensywność
- ⚠️ BRAK PROGRESU: pace i HR stoją >3 tyg → zmień typ akcentu (np. zamiast tempa progresywne fartleki)
- 🔴 REGRES: pace stoi a HR rośnie LUB wykonanie spada → DELOAD, mniej objętości, więcej regeneracji

W summary lub rationale ZAWSZE wspomnij kierunek progresu zawodnika na bazie ostatnich screenów.

## KONTEKST ZAWODNIKA
- Imię: ${ath.full_name || "Zawodnik"}
- Cel ogólny: ${ath.goal || "-"}
- Data startu (cel długoterminowy): ${ath.target_date || "-"}
- Personal Bests: ${pbText}
- Race goals (planowane starty): ${JSON.stringify(raceGoals).substring(0, 500)}
${futureRacesText}

## ANALITYKA FORMY (PLANER-2 — licz sie z tym przy ukladaniu tygodni!)
${context.analityka ? `- Forma dzis: CTL ${context.analityka.ctl} / TSB ${context.analityka.tsb} (TSB +5..+15 = okno startowe; <-25 = przeciazenie, zacznij plan lzej)
- Monotonia 7d: ${context.analityka.monotonia_7d} (>=2.0 = zroznicuj bodzce od pierwszego tygodnia)
- Strain 7d: ${context.analityka.strain_7d}
- Trend bazy tlenowej (EF 90d): ${context.analityka.trend_ef_90d_pct != null ? context.analityka.trend_ef_90d_pct + '%' : 'brak danych (malo biegow z HR)'}
- Wellness: ${context.analityka.wellness ? `RHR ${context.analityka.wellness.resting_hr ?? '-'} / HRV ${context.analityka.wellness.hrv ?? '-'} / sen ${context.analityka.wellness.sen_h ?? '-'}h / readiness ${context.analityka.wellness.readiness ?? '-'} (${context.analityka.wellness.dni_z_danymi} dni danych)` : 'zawodnik nie trackuje — nie zgaduj'}
- ZASADA: plan prowadz tak, by TSB na dzien startu wyladowal w oknie +5..+15; taper licz od formy DZISIEJSZEJ, nie z szablonu.` : '(analityka niedostepna — planuj konserwatywnie z logow)'}

## STATYSTYKI OSTATNICH 60 DNI
- Łącznie km: ${stats.totalKm60d}
- Średnia objętość/tydzień: ${stats.avgWeeklyKm} km
- Liczba zalogowanych treningów: ${stats.logsCount}
- Treningów zmierzonych zegarkiem (intervals.icu, ⌚): ${stats.watchLogsCount}
- Liczba aktywności Strava: ${stats.stravaCount}
- Logów z odczuciami zawodnika: ${stats.logsWithFeel}
- Logów ze screenshotami Garmin/Strava: ${stats.logsWithAttachment}
- Raportów AI o tym zawodniku: ${stats.aiReportsCount} (z opiniami: ${stats.reportsWithFeedbackCount})

## ⌚ DANE Z ZEGARKA — JAK JE TRAKTOWAĆ
Wpisy oznaczone ⌚zegarek pochodzą z automatycznego importu intervals.icu (zegarek zawodnika):
- **HR i tempo z tych wpisów są ZMIERZONE, nie deklarowane** — przy rozbieżności między odczuciem a danymi ⌚ ufaj liczbom, ale odczucie komentuj (np. "tempo było OK, ale skoro czułeś się ciężko...").
- Typ treningu ⌚ pochodzi z planu na ten dzień (auto-dopasowanie) — jest wiarygodny.
- "Zastępczy" z ⌚ = aktywność niebiegowa (rower/spacer) — NIE licz jej do objętości biegowej, ale uwzględnij jako obciążenie ogólne.
- Kalibruj strefy tempa/HR nowego planu na danych ⌚ (są dokładniejsze niż wpisy ręczne).

## OSTATNIE LOGI TRENINGOWE Z ODCZUCIAMI ZAWODNIKA (max 30):
Format: data | typ | km | tempo | HR | ODCZUCIE: "..." | 📷 screen | ⌚ zegarek
${logsText}

## OSTATNIE AKTYWNOŚCI STRAVA (max 20):
${stravaText}

${watchInsightsText ? `## ⌚ WYKRESY Z ZEGARKA — INSIGHTY (przeliczone z detali intervals.icu — splity per km, strefy HR, kadencja):
Odwołuj się do KONKRETÓW w rationale (np. "interwały z 2.07: splity 3:47–3:52, równo — trzymamy poziom"; "spokojny z 4.07: 40% w str.3 — biegasz za mocno na luźnych").
${watchInsightsText}
` : ""}
## PLAN VS WYKONANIE (ostatnie 15 dni — czy zawodnik trzyma się planu?):
${planVsExec}

## HISTORIA POPRZEDNICH PLANÓW AI (zaakceptowanych przez Ciebie jako trenera):
${prevPlansText}

${prevPatternText}
${coachEditedText}
${context.coachStyleWorkouts && context.coachStyleWorkouts.length >= 5 ? `
── OGOLNY STYL TEGO TRENERA (edycje u INNYCH zawodnikow — sygnal SLABSZY niz sekcja wyzej) ──
Ten trener u innych podopiecznych poprawial workouty tak (wyciagnij OGOLNE preferencje:
nazewnictwo, zakresy temp, typy trescia; NIE kopiuj temp 1:1 — inny zawodnik = inne tempo!):
${context.coachStyleWorkouts.slice(0, 20).map((w: any) => `- ${w.workout_type}: ${w.target_distance_km ?? '-'}km @ ${w.target_pace ?? '-'} ${w.target_hr_zone ? '(HR ' + w.target_hr_zone + ')' : ''}${w.description ? ' — ' + String(w.description).slice(0, 90) : ''}`).join('\n')}
KOLEJNOSC PRIORYTETOW STYLU: 1) edycje dla TEGO zawodnika 2) komentarz trenera 3) ogolny styl (ta sekcja).` : ''}

## RAPORTY AI O TYM ZAWODNIKU (ostatnie 5 wysłanych — Twoja diagnoza + ew. edycje + opinia zawodnika)
**To jest "biografia trenerska" zawodnika — wykorzystaj te raporty żeby zrozumieć jego mocne i słabe strony, ryzyka, charakter.**
- Raporty z 🖋️ EDYTOWANY oznaczają że Ty (trener) edytowałeś treść — Twoja edycja = lepszy sygnał Twojej diagnozy niż surowe AI
- 💬 OPINIA ZAWODNIKA = co zawodnik sam uważa o swoim treningu / sugestiach trenera
- 👍/👎 reakcje = stosunek zawodnika do diagnozy

${reportsText}
${persistentNotesSection}
${coachNoteSection}

## CEL NOWEGO PLANU
- Typ planu: ${planType.toUpperCase()} (${weeks} tygodni)
- Data startu planu: ${startDate}
- Data końca planu: ${endDate}
${targetRaceType ? `- Docelowy start: ${targetRaceType.toUpperCase()}` : "- Plan ogólny (brak konkretnego celu)"}
${targetRaceDate ? `- Data wyścigu: ${targetRaceDate}` : ""}
${targetTime ? `- Cel czasowy: ${targetTime}` : ""}
${targetVolumeKm ? `- Docelowa objętość peak: ${targetVolumeKm} km/tydz` : ""}

## ZASADY GENEROWANIA PLANU

### Struktura tygodnia (klasyczna):
- **Poniedziałek**: spokojny / regeneracja / odpoczynek
- **Wtorek**: tempo lub progressive
- **Środa**: interwały (jakościowy trening)
- **Czwartek**: spokojny lub regeneracja
- **Piątek**: spokojny / odpoczynek (dzień przed weekend long)
- **Sobota**: lekki + dynamika lub krótki tempo
- **Niedziela**: długi wybieg

### Zasady objętości:
- Srednia 60d: ${stats.avgWeeklyKm} km/tydz
- Objetosc ostatnich 4 tygodni (od biezacego wstecz): ${stats.tygKmStr} km
- Ostatni zamkniety tydzien: ${stats.ostatniPelnyTydzien} km
- WAZNE: gdy objetosc byla zmienna (np. spadek po chorobie/przerwie), NIE opisuj powrotu do wczesniejszego poziomu jako "skok" — to POWROT. Porownuj plan do ostatniego zamknietego tygodnia, nie do sredniej. Jesli plan jest nizszy niz szczytowe tygodnie, nie pisz o "wzroscie 10-15%".
- Buduj progresywnie (max +10% obj/tydz, NIE więcej żeby uniknąć kontuzji)
- Co 4. tydzień to "deload" — redukcja 25-30% objętości
- Tydzień przed startem (jeśli jest target_race_date): tapering -40%

### WAŻNE — wykorzystaj kontekst:
1. **Odczucia zawodnika** — jeśli pisze "ciężko", "zmęczony", "boli kolano" — DOSTOSUJ plan (zmniejsz intensywność, zaproponuj regenerację)
2. **Plan vs wykonanie** — jeśli zawodnik nie wykonuje X% planu, DOSTOSUJ ambicję (mniej km, prostszy schemat)
3. **🎓 EDYCJE TRENERA (NAJWAŻNIEJSZE!)** — sekcja "EDYCJE TRENERA" pokazuje workouts gdzie trener konkretnie ZMIENIAŁ Twoje propozycje. Tempo, dystans, HR — to są ŚWIĘTE liczby. Nie wracaj do swoich domyślnych. Jeśli trener konsekwentnie szybsze tempo o 10-15s/km — KOPIUJ TĘ POPRAWKĘ.
4. **Poprzednie plany** — jeśli istnieją zatwierdzone plany, ucz się ze stylu trenera (jakie schematy preferował, jakie objętości itd.)
5. **Strava elevation** — jeśli zawodnik biega w terenie z duża sumą podbiegów, uwzględnij to w planowaniu
6. **Raporty AI o zawodniku** — czytaj poprzednie raporty jak dossier:
   - Jeśli raport mówi "tendencja do przesilania w środku tygodnia" — UNIKAJ ciężkich Wt+Śr
   - Jeśli raport ostrzegał o kontuzji — daj więcej regeneracji
   - Jeśli zawodnik w opinii pisał "zbyt łatwo" — śmielej z intensywnością
   - Jeśli trener edytował raport (🖋️) — Twoja edycja jest WAŻNIEJSZA niż surowy AI tekst, to definiuje Twój styl
7. **✨ KOMENTARZ TRENERA (jeśli istnieje)** — to jest ŚWIEŻY kontekst od trenera, ważniejszy niż starsze raporty. Wykorzystaj go priorytetowo do dostosowania planu.

### JEZYK OPISOW (PLANER-2 — opis ma brzmiec jak trener na grupie, nie jak PDF):
- ZERO zargonu w opisach treningow: nie pisz "TSB", "CTL", "monotonia" — tlumacz na skutek
  ("po ciezkim bloku dajemy nogom odetchnac", "forma ma szczyt za 3 tygodnie, dzis budujemy").
- Kazdy opis: PO CO ten trening + JAK ma sie czuc + 1 zdanie z dusza. Przyklady tonu:
  "po tym rozbieganiu nogi powiedza dziekuje" · "ten akcent ma zabrzmiec, nie zabic" ·
  "dzis biegniesz na rozmowe, nie na zegarek" · "ostatni dlugi przed startem — celebruj go".
- Liczba w opisie tylko gdy niesie decyzje (tempo/strefa TAK, wskazniki NIE).

### Tempo i strefy HR:
- **Bieg spokojny**: HR strefa 2 (130-145 bpm), tempo +60-90s/km wolniej niż pace docelowy
- **Wybieganie**: HR strefa 2 (135-150 bpm), długi dystans, niskie tempo
- **Tempo**: HR strefa 4 (160-170 bpm), tempo blisko progowego
- **Interwały**: HR strefa 5 (170-180 bpm), tempo szybsze niż target race
- **Regeneracja**: HR strefa 1-2 (120-135 bpm), bardzo wolno
- **Wzmacniający**: nie bieg — siłówka/core
- **Odpoczynek**: dzień bez aktywności
- **Start**: dzień wyścigu/sprawdzianu

### Typy treningów (DOKŁADNIE jak w bazie):
"Bieg spokojny" | "Interwały" | "Tempo" | "Wybieganie" | "Regeneracja" | "Wzmacniający" | "Odpoczynek" | "Start" | "Zastępczy"

## ⛔ KRYTYCZNE: SPÓJNOŚĆ NARRACYJNA MIĘDZY DNIAMI

To jest **najważniejsza zasada** której do tej pory nie przestrzegałeś. Trener przekazuje plan zawodnikowi i jeśli treningi są wewnętrznie **sprzeczne**, traci wiarygodność. Te błędy są niedopuszczalne:

### ❌ ZAKAZANE konstrukcje w description (przykłady prawdziwych wpadek):

🔴 **WPADKA 1 — fałszywe odniesienie do jutra:**
- Dzień 1 (poniedziałek): *"Luźne rozbieganie **przed jutrzejszym wybieganiem**"*
- Dzień 2 (wtorek): *"Dzień wolny"*
→ **WTOREK MIAŁ BYĆ WYBIEGANIE, A JEST WOLNE. Sprzeczność.**

🔴 **WPADKA 2 — fałszywe odniesienie do wczoraj:**
- Dzień 1 (środa): *"Spokojny bieg, nie szarżuj"*
- Dzień 2 (czwartek): *"**Regeneracja po wczorajszych interwałach**"*
→ **WCZORAJ NIE BYŁO INTERWAŁÓW. Kompromitacja.**

🔴 **WPADKA 3 — sprzeczne tempo z opisem:**
- Description: *"Tempo szybsze niż wybieganie"*
- target_pace: identyczne jak wczoraj (wybieganie)
→ **Dane nie zgadzają się z opisem.**

🔴 **WPADKA 4 — fałszywe zapowiedzi w summary/rationale:**
- Summary: *"W środę interwały 6×800m"*
- workout[środa].workout_type: "Spokojny"
→ **Summary obiecuje coś czego w workoutach nie ma.**

### ✅ WYMAGANE — ZASADY DYSCYPLINY NARRACYJNEJ:

**Zasada #1: Sprawdź sąsiednie dni PRZED napisaniem description**
Zanim napiszesz description dnia X:
- Co jest w workout_type dnia X-1 (wczoraj)?
- Co jest w workout_type dnia X+1 (jutro)?
- Czy moje słowa "**przed jutrzejszym...**" / "**po wczorajszych...**" pasują do faktów?

**Zasada #2: Jeśli odwołujesz się do innego dnia — MUSI to być prawda**
- *"po wczorajszych interwałach"* → wczoraj NAPRAWDĘ jest "Interwały"
- *"przed jutrzejszym długim"* → jutro NAPRAWDĘ jest "Wybieganie"
- *"przed niedzielnym startem"* → w niedzielę NAPRAWDĘ jest "Start"

**Zasada #3: Lepiej NIE odnosić się, niż odnosić błędnie**
Jeśli nie jesteś pewien co jest jutro — **NIE pisz o jutrze**. Lepiej napisać *"Spokojny bieg, ~5:50/km, skup się na rytmie"* niż *"Spokojny przed jutrzejszym wybieganiem"* jeśli jutro nie jest pewne.

**Zasada #4: Summary i rationale MUSZĄ zgadzać się z workouts**
Jeśli w summary piszesz *"W środę porządne interwały"* → workout[środa].workout_type **MUSI BYĆ** "Interwały". Sprawdź to przed wysłaniem JSON.

**Zasada #5: Sekwencje muszą mieć logikę**
- Po **Interwałach** → następny dzień nie powinien być znowu **Interwały** (chyba że jest cel specjalny)
- Po **Wybieganiu** (long run) → kolejny dzień powinien być lekki/regeneracja
- **Odpoczynek** nie pojawia się **dwóch dni** z rzędu (chyba że deload tydzień)
- **Tempo + Interwały** w 2 sąsiednich dniach to RZADKO (tylko zaawansowani, z wyraźną intencją)

### 🎯 PROCEDURA — JAK GENEROWAĆ PLAN POPRAWNIE:

1. **Najpierw zaplanuj workout_type per dzień** (cały tydzień / cały okres) — patrz na strukturę
2. **Sprawdź spójność dni** — czy sekwencje mają sens (po jakościowym → lżejszy)
3. **DOPIERO POTEM pisz description** dla każdego dnia — z pełną wiedzą o sąsiednich dniach
4. **Pisz description bez odniesień do innych dni** jeśli nie jesteś 100% pewien co tam będzie
5. **Sprawdź summary** — czy każda konkretna obietnica ("w piątek tempo", "weekend długi") jest w workouts
6. **Zwróć JSON** dopiero po przejściu tych kroków w głowie

⛔ Trener (Filip) NIE redaguje wszystkich planów — wielu zawodników widzi Twój plan bezpośrednio. **Każda sprzeczność = utrata zaufania zawodnika** = problem dla trenera = problem dla naszego produktu.
${stepsSection}
## OUTPUT — DOKŁADNIE TEN FORMAT JSON (i tylko JSON, bez backticków, bez wyjaśnień):

\`\`\`json
{
  "summary": "1-2 zdania opisujące plan",
  "rationale": "uzasadnienie struktury (3-5 paragrafów - dlaczego tak, jak progresja, czego unikać, co uwzględniono z odczuć zawodnika i historii)",
  "warnings": "ostrzeżenia (np. 'wzrost objętości 25% - obserwuj sygnały przeciążenia', 'zawodnik raportował ból kolana - lżejsza środa') lub pusty string",
  "target_volume_km": 60,
  "workouts": [
    {
      "date": "2026-05-12",
      "workout_type": "Bieg spokojny",
      "title": "Spokojny bieg adaptacyjny",
      "description": "Tempo konwersacyjne, HR w strefie 2. Skup się na rytmie oddechu i swobodnej kadencji ~180/min.",
      "target_distance_km": 8,
      "target_duration_min": 50,
      "target_pace": "5:50-6:10/km",
      "target_hr_zone": 2,
      "target_hr_min": 130,
      "target_hr_max": 145,
      "steps": null
    }
  ]
}
\`\`\`

WAŻNE:
- Wszystkie ${weeks} tygodni muszą mieć kompletne treningi (każdy dzień, w tym Odpoczynek)
- ${weeks * 7} workout entries łącznie (po jednym na dzień)
- Daty od ${startDate} do ${endDate}
- workout_type MUSI być z listy powyżej (case-sensitive)
- **description**: pisz jak do zawodnika, nie jak do systemu. Krótko, po imieniu, konkretnie. Przykład: "Spokojny bieg, ~5:50/km. Skupisz się na rytmie. Jeśli pójdą nogi — możesz przyspieszyć ostatni km." — NIE: "Trening konwersacyjny w strefie aerobowej z możliwością progresji końcowej"
- **summary**: 1-2 zdania jak do zawodnika. "Dwa tygodnie spokojnego budowania, w drugim tygodniu wracamy do tempa. Cel: czujesz się gotowy na półmaraton." — NIE: "Plan dwutygodniowy obejmujący progresję objętości"
- **rationale**: 3-5 paragrafów jak Twoja notatka z konsultacji. Odwołuj się do konkretów ("W zeszłym tygodniu wpisałeś że ciężko poszło...", "Po Strava widzę że biegasz dużo w terenie..."). Bez słów "niniejszy", "uwzględniono", "zaplanowano".
- **warnings**: jak troska, nie ostrzeżenie systemu. "Skok objętości +20%, bądź wyczulony — jak coś zaboli, daj znać. Lepiej odpuścić jeden trening niż wypaść na 2 tyg." Pusty string jeśli nic nie martwi.
- **steps**: dla treningów STRUKTURALNYCH (Interwały, Tempo, fartlek, progresja, podbiegi) wypełnij maszynową strukturę wg sekcji "STRUCTURED STEPS" powyżej — KAŻDY krok z krótkim polskim "note" (nazwa kroku na zegarku). Dla prostych biegów (Bieg spokojny, Wybieganie, Regeneracja) oraz Wzmacniający/Odpoczynek/Start → "steps": null. Steps MUSI być spójne z target_pace, target_distance_km i description.
- target_distance_km i target_duration_min mogą być null dla Odpoczynek/Wzmacniający
- target_pace może być null dla Odpoczynek/Wzmacniający
- W rationale ODWOŁAJ SIĘ do konkretnych odczuć / wykonania / historii (np. "zwiększyłem rozkład Wt-Śr bo zawodnik raportował lekkie wykonanie...", "deload w tyg 3 bo poprzedni plan kończył tak samo")
`;
}

// ✨ v2.6: Pobierz obrazek z URL i konwertuj na base64 (do vision API Claude)
// ✨ v2.9.1 FIX: Anthropic limit 5 MB jest na BASE64 string po enkodowaniu, NIE raw buffer.
// Base64 zwiększa size o ~33%, więc raw > 4.5 MB = base64 > 5 MB → Claude API 400 → EF 500.
async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    
    const buffer = await resp.arrayBuffer();
    // Early bail — raw > 4.5 MB na pewno > 5 MB w base64
    if (buffer.byteLength > 4.5 * 1024 * 1024) {
      console.warn(`[fetchImageAsBase64] Skip — raw ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB > 4.5 MB threshold. URL: ${url.substring(0, 80)}...`);
      return null;
    }
    
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    
    // KLUCZOWY FIX: real base64.length check (Anthropic limit 5 MB)
    if (base64.length > 5 * 1024 * 1024) {
      console.warn(`[fetchImageAsBase64] Skip — base64 ${(base64.length / 1024 / 1024).toFixed(2)} MB > 5 MB Anthropic limit (raw ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB). URL: ${url.substring(0, 80)}...`);
      return null;
    }
    
    return { data: base64, mediaType: contentType };
  } catch (e) {
    console.error("fetchImageAsBase64 error:", e);
    return null;
  }
}

// ─── Wywołanie Claude API ───────────────────────────────────────────────
// ✨ v2.6: Druga sygnatura — dla user message z obrazkami (vision)
async function callClaude(prompt: string, imageMessages: any[] = []): Promise<any> {
  // Jeśli są obrazki — zbuduj content jako multimodal array
  const userContent: any[] = imageMessages.length > 0
    ? [{ type: "text", text: prompt }, ...imageMessages]
    : prompt;
  
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 16000, // ✨ v3 (steps): 12000→16000 — steps zwiększają objętość outputu; MESO/MACRO blisko limitu, zapobiega ucięciu JSON
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || "";

  // Parse JSON — usuń ewentualne ```json ... ``` lub inne backticki
  const cleaned = text
    .replace(/^```json\s*/m, "")
    .replace(/^```\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    // ✨ v2.9.1: bracket matching — Claude czasem wrzuca analizę screenów
    // PROZĄ przed JSON-em ("Analizuję screeny z MP 6h... { summary...").
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace === -1) {
      console.error("Failed to parse (no { found):", cleaned.substring(0, 800));
      throw new Error("Claude zwrócił nieprawidłowy JSON (brak otwierającego nawiasu)");
    }
    let depth = 0, inString = false, escaped = false, lastBrace = -1;
    for (let i = firstBrace; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { lastBrace = i; break; } }
    }
    if (lastBrace === -1) {
      console.error("Failed to parse (unbalanced braces):", cleaned.substring(0, 800));
      console.error("Full length:", cleaned.length, "firstBrace:", firstBrace);
      throw new Error("Claude zwrócił nieprawidłowy JSON (niezamknięte nawiasy — odpowiedź obcięta na max_tokens?)");
    }
    const extracted = cleaned.substring(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(extracted);
      console.log(`[callClaude] ⚠️ JSON wyciągnięty z body (preambuła ${firstBrace} znaków, postambuła ${cleaned.length - lastBrace - 1} znaków)`);
      return parsed;
    } catch (e2) {
      console.error("Failed extracted JSON:", extracted.substring(0, 500));
      console.error("Full text first 300:", cleaned.substring(0, 300));
      console.error("Full text last 300:", cleaned.substring(Math.max(0, cleaned.length - 300)));
      throw new Error("Claude zwrócił nieprawidłowy JSON (parse failed nawet po bracket matching)");
    }
  }
}

// ─── HANDLER ────────────────────────────────────────────────────────────
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

    // Klient z usera (sprawdza auth)
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
      athlete_id,
      plan_type,
      start_date,
      target_race_type = null,
      target_race_date = null,
      target_time = null,
      target_volume_km = null,
      weeks_override = null, // opcjonalnie nadpisz domyślne weeks
      coach_note,            // ✨ v2: opcjonalny komentarz trenera
      coach_attachments = [], // ✨ v3: opcjonalne screeny od trenera (max 3)
    } = body;

    if (!athlete_id || !plan_type || !start_date) {
      return new Response(JSON.stringify({ error: "Missing required: athlete_id, plan_type, start_date" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!PLAN_WEEKS[plan_type]) {
      return new Response(JSON.stringify({ error: `Invalid plan_type: ${plan_type}. Use: weekly, micro, meso, macro` }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ✨ v2: Sanitize coach_note
    const sanitizedCoachNote = (coach_note || '').toString().trim().slice(0, MAX_COACH_NOTE_LENGTH);

    const weeks = weeks_override || PLAN_WEEKS[plan_type].default;
    const endDate = addDays(start_date, weeks * 7 - 1);

    // ─── Service role client (omija RLS dla insertu) ─────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);   // default OK dla legacy i sb_secret; NIE dodawać Authorization:'' — łamie legacy (42501)

    // ─── Sprawdź czy trener jest faktycznie coachem zawodnika ─────
    const { data: athleteCheck } = await supabase
      .from("athletes")
      .select("id, coach_id, race_goals")
      .eq("id", athlete_id)
      .maybeSingle();

    if (!athleteCheck || athleteCheck.coach_id !== coachId) {
      return new Response(JSON.stringify({ error: "Nie jesteś trenerem tego zawodnika" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ─── Build kontekstu ─────
    const context = await buildAthleteContext(supabase, athlete_id, coachId);   /* PLANER-2 P2 */

    // ─── Build prompt + call Claude ─────
    const prompt = buildPrompt(
      context,
      plan_type,
      weeks,
      start_date,
      endDate,
      target_race_type,
      target_race_date,
      target_time,
      target_volume_km,
      sanitizedCoachNote, // ✨ v2
    );

    if (sanitizedCoachNote) {
      console.log(`[generate-training-plan] Coach note included (${sanitizedCoachNote.length} chars)`);
    }
    if (context.stats.coachEditedCount > 0) {
      console.log(`[generate-training-plan] 🎓 Learning from ${context.stats.coachEditedCount} coach-edited workouts`);
    }
    if (context.stats.coachNotesCount > 0) {
      console.log(`[generate-training-plan] 📝 Loaded ${context.stats.coachNotesCount} coach notes`);
    }
    if (context.stats.chatMessagesCount > 0) {
      console.log(`[generate-training-plan] 💬 Loaded ${context.stats.chatMessagesCount} chat messages from last 60 days`);
    }
    
    // ✨ v2.8: Zbierz screeny z logów (max 6, SMART SELECTION)
    // Klaudiusz czyta liczby z Garmin/Strava — kluczowe dla diagnozy stanu zawodnika
    // OPTYMALIZACJA: 6 najlepszych screenów dla AI > 10 chronologicznych (oszczędność ~$0.02 per plan)
    // Smart score: priorytet logom z odczuciami (good/bad), komentarzami, interwałami i tempo
    const MAX_PLAN_SCREENS = 6;
    
    // Score per log: które screeny dają najwięcej informacji
    const screenScore = (l: any) => {
      let s = 0;
      // Logi z bad feel + komentarz = najwartościowsze (problem do diagnozy)
      if (l.feel === 'bad' && l.comment) s += 10;
      else if (l.feel === 'bad') s += 7;
      else if (l.feel === 'great' || l.feel === 'good') s += 5;
      else if (l.feel === 'mid') s += 3;
      // Interwały, tempo - typy z najważniejszym sygnałem HR/pace
      const t = (l.training_type || '').toLowerCase();
      if (t.includes('interwa') || t.includes('tempo')) s += 4;
      else if (t.includes('wybieganie') || t.includes('start')) s += 3;
      else if (t.includes('regener')) s -= 2; // regeneracja mniej ważna
      // Komentarz - dodatkowy kontekst
      if (l.comment && l.comment.trim().length > 10) s += 2;
      // Najnowsze ważniejsze
      if (l.logged_at) {
        const daysAgo = (Date.now() - new Date(l.logged_at).getTime()) / 86400000;
        if (daysAgo < 7) s += 4;
        else if (daysAgo < 14) s += 2;
        else if (daysAgo > 30) s -= 2;
      }
      return s;
    };
    
    // Posortuj logi z attachment_url po score
    const logsWithScreens = context.logs.filter((l: any) => l.attachment_url);
    logsWithScreens.sort((a: any, b: any) => screenScore(b) - screenScore(a));
    
    const screenUrls: { url: string; logDate: string; logType: string; logComment: string; feel: string }[] = [];
    for (const log of logsWithScreens) {
      if (screenUrls.length >= MAX_PLAN_SCREENS) break;
      const urls = String(log.attachment_url).split(",").map((u: string) => u.trim()).filter(Boolean);
      for (const url of urls) {
        if (screenUrls.length >= MAX_PLAN_SCREENS) break;
        if (/\.(jpg|jpeg|png|gif|webp|heic)(\?|$)/i.test(url)) {
          screenUrls.push({
            url,
            logDate: (log.logged_at || '').slice(0, 10),
            logType: log.training_type || '?',
            logComment: log.comment || '',
            feel: log.feel || '',
          });
        }
      }
    }
    
    // Pobierz obrazki i zbuduj imageMessages
    const imageMessages: any[] = [];
    let screensIncluded = 0;
    for (const screen of screenUrls) {
      const img = await fetchImageAsBase64(screen.url);
      if (img) {
        imageMessages.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mediaType,
            data: img.data,
          },
        });
        imageMessages.push({
          type: "text",
          text: `^ Screen z dnia ${screen.logDate} (typ: ${screen.logType}${screen.feel ? `, odczucie zawodnika: ${screen.feel}` : ''}${screen.logComment ? `, komentarz: "${screen.logComment}"` : ''}).

CO MUSISZ Z TEGO WYCIĄGNĄĆ (CZYTAJ LICZBY, NIE MAPKĘ):
1. **Splity per km** — czy tempo było równe czy się rozsypywało?
2. **Avg HR + max HR** — w jakiej strefie był ten trening?
3. **HR vs pace** — czy HR drift występuje (HR rośnie przy tym samym tempie = przemęczenie)?
4. **Czas w strefach** (jeśli widać wykres stref) — gdzie spędził najwięcej czasu?
5. **Kadencja** — >170 to dobre, <160 to ryzyko
6. **Elevation gain** — czy podbiegi tłumaczą HR drift?

🎯 WERDYKT — KLUCZOWY dla planowania kolejnych treningów:
- "ZA LEKKO" → następny trening tego typu może być MOCNIEJSZY
- "ODPOWIEDNIO" → kontynuuj poziom, lekko progresuj
- "ZA MOCNO" → następny trening tego typu LŻEJSZY + dodaj regenerację
- "ROZSYPANE" → zawodnik nie utrzymał tempa = za ambitnie, ZMNIEJSZ intensywność

📊 STREFY DOCELOWE per typ treningu:
- Bieg spokojny / Wybieganie: HR 130-150 (str.2), pace +60-90s wolniej niż marathon pace
- Tempo: HR 160-170 (str.4), pace -10 do +15s vs marathon
- Interwały: HR 170-185 (str.5), pace szybciej niż 5K pace
- Regeneracja: HR 110-135 (str.1-2), bardzo wolno

⚠️ Te informacje WPŁYWAJĄ NA PLAN który teraz tworzysz:
- Jeśli ostatnie interwały były ZA LEKKO → w nowym planie dodaj agresywniejsze pace
- Jeśli ostatnie wybieganie miało HR drift → w nowym planie więcej regeneracji
- Jeśli ostatnie tempo rozsypywało się → w nowym planie krótsze odcinki tempo, dłuższe przerwy
- Jeśli kadencja niska → wspomnij w rationale "popracujmy nad kadencją w tym tygodniu"`,
        });
        screensIncluded++;
      }
    }
    if (screensIncluded > 0) {
      console.log(`[generate-training-plan] 📸 Wstrzyknięto ${screensIncluded} screenów z logów zawodnika`);
    }
    
    // ✨ v3: Screeny od TRENERA (wrzucone w modal "coach_note") — max 3
    let coachScreensIncluded = 0;
    if (Array.isArray(coach_attachments) && coach_attachments.length > 0) {
      const coachAttachmentsTrimmed = coach_attachments.slice(0, 3);
      for (let idx = 0; idx < coachAttachmentsTrimmed.length; idx++) {
        const url = coachAttachmentsTrimmed[idx];
        if (typeof url !== 'string' || !url.startsWith('http')) continue;
        const img = await fetchImageAsBase64(url);
        if (img) {
          imageMessages.push({
            type: "image",
            source: {
              type: "base64",
              media_type: img.mediaType,
              data: img.data,
            },
          });
          imageMessages.push({
            type: "text",
            text: `^ Screen #${idx + 1} OD TRENERA (Filip wrzucił go specjalnie do tego planu).

KRYTYCZNE: To NIE jest screen zawodnika z aplikacji — to coś co TRENER chce żebyś zobaczył jako kontekst planu. Może być:
- Wiadomość z Messengera od zawodnika
- Screen z Stravy/Garmin którego zawodnik nie wgrał do BiegaMy
- Wyniki badań krwi / test laktatu / VO2max
- Plan z innego treningu który trener chce uwzględnić
- Screen z reakcjami/komentarzami społeczności
- Cokolwiek innego co trener uznał za ważne

DZIAŁANIE:
1. Przeczytaj UWAŻNIE co jest na screenie
2. Jeśli to dane treningowe — wyciągnij liczby (pace, HR, dystans, splits)
3. Jeśli to wiadomość/komunikacja — wyciągnij sentyment i konkrety (kontuzje, zmęczenie, plany życiowe)
4. W RATIONALE PLANU obowiązkowo odwołaj się do tego screenu — pokaż trenerowi że widziałeś co mu zależało żebyś zobaczył
5. Dopasuj plan do informacji ze screenu

To MA PRIORYTET nad innymi screenami — trener wybrał to celowo.`,
          });
          coachScreensIncluded++;
        }
      }
    }
    if (coachScreensIncluded > 0) {
      console.log(`[generate-training-plan] 📸 Wstrzyknięto ${coachScreensIncluded} screenów OD TRENERA`);
    }
    
    console.log(`[generate-training-plan] Calling Claude — athlete:${athlete_id} plan_type:${plan_type} weeks:${weeks}`);
    const aiResponse = await callClaude(prompt, imageMessages);

    // ─── Validate response ─────
    if (!aiResponse.workouts || !Array.isArray(aiResponse.workouts) || aiResponse.workouts.length === 0) {
      throw new Error("Claude nie zwrócił treningów");
    }

    // ✨ v2.3: SAFETY NET — walidacja że workouts w datach startów mają workout_type="Start"
    // Jeśli AI z jakiegoś powodu pominął race goal, nadpisujemy.
    // ✨ v2.4: detectedRaces = race_goals + coach notes z tagiem "start" + datą w okresie planu
    const validationRaceGoals = normalizeRaceGoals(athleteCheck.race_goals);
    const validationCoachNoteRaces = (context.coachNotes || [])
      .filter((n: any) => n.tag === 'start' && n.event_date)
      .map((n: any) => ({
        name: 'Start (z notatki trenera)',
        date: n.event_date,
        note: n.note,
      }));
    const validationAugmented = [...validationRaceGoals, ...validationCoachNoteRaces];
    
    const detectedRaces = detectUpcomingRaces(
      validationAugmented,
      start_date,
      endDate
    );
    
    if (detectedRaces.length > 0) {
      const workoutsByDate: Record<string, any> = {};
      for (const w of aiResponse.workouts) {
        if (w.date) workoutsByDate[w.date] = w;
      }
      
      let overrideCount = 0;
      for (const race of detectedRaces) {
        const w = workoutsByDate[race.date];
        if (w && w.workout_type !== "Start") {
          console.warn(`[generate-training-plan] ⚠️ AI nie ustawił "Start" dla ${race.date} (${race.name}). Nadpisuję workout_type="Start"`);
          w.workout_type = "Start";
          w.title = race.name + (race.location ? ` — ${race.location}` : '');
          w.description = w.description || `${race.name} — start zawodów. Standardowa rozgrzewka 15-20min, dobre nawodnienie, śniadanie 2-3h przed.`;
          if (race.distance && !w.target_distance_km) w.target_distance_km = race.distance;
          overrideCount++;
        } else if (!w) {
          console.warn(`[generate-training-plan] ⚠️ Brak workout dla daty startu ${race.date} (${race.name})`);
        }
      }
      if (overrideCount > 0) {
        console.log(`[generate-training-plan] 🏁 Override: ${overrideCount} race day(s) zamienione na "Start"`);
      }
      console.log(`[generate-training-plan] 🏁 Wykryto ${detectedRaces.length} startów w okresie planu`);
    }

    // ✨ v2.8: NARRATIVE CONSISTENCY VALIDATOR
    // Wykrywa sprzeczności typu "przed jutrzejszym wybieganiem" gdy jutro nie ma wybiegania
    // Loguje warning + dopisuje do aiResponse.warnings jeśli coś znajdzie
    // Patterny RESTRYKTYWNE: wymagamy słowa "przed/po" + nazwa dnia + nazwa treningu,
    // żeby nie dać false positive na "jutro będziesz miał ciężko" (to nie konkretne odniesienie)
    const narrativeIssues: string[] = [];
    const sortedWorkouts = [...aiResponse.workouts].sort((a: any, b: any) => 
      (a.date || '').localeCompare(b.date || '')
    );
    
    // Konkretne odniesienia do TYPU treningu w sąsiednim dniu - tu chcemy wymusić zgodność
    const futurePatterns = [
      { regex: /przed\s+(jutrzejszym|jutrzejszą|jutrzejszymi|niedzielnym|niedzielną|sobotnim|sobotnią|piątkowym|piątkową|środowymi|środowym|wtorkowymi|wtorkowym|poniedziałkowymi|poniedziałkowym|czwartkowymi|czwartkowym)\s+(wybieganiem|wybieganie|interwałami|tempo|tempem|startem|treningiem|akcent|akcentem)/i },
    ];
    const pastPatterns = [
      { regex: /po\s+(wczorajszych|wczorajszym|wczorajszej|niedzielnych|niedzielnym|sobotnich|sobotnim|piątkowych|piątkowym|środowych|środowym|wtorkowych|wtorkowym|poniedziałkowych|poniedziałkowym|czwartkowych|czwartkowym)\s+(interwałach|interwała|tempo|tempie|wybieganiu|wybieganie|treningu|akcencie|starcie)/i },
    ];
    
    // Mapowanie nazwy dnia tygodnia → typ docelowy (jeśli w description jest "przed niedzielnym wybieganiem" 
    // to faktyczna niedziela powinna być "Wybieganie")
    const expectedTypeFromText = (text: string): string | null => {
      const lower = text.toLowerCase();
      if (lower.includes('interwał')) return 'Interwały';
      if (lower.includes('tempo')) return 'Tempo';
      if (lower.includes('wybiega') || lower.includes('długi')) return 'Wybieganie';
      if (lower.includes('start')) return 'Start';
      if (lower.includes('regener')) return 'Regeneracja';
      return null;
    };
    
    for (let i = 0; i < sortedWorkouts.length; i++) {
      const w = sortedWorkouts[i];
      const desc = (w.description || '').toString();
      if (!desc) continue;
      
      // Check future references
      for (const pat of futurePatterns) {
        const match = desc.match(pat.regex);
        if (!match) continue;
        const expected = expectedTypeFromText(match[0]);
        const nextWorkout = sortedWorkouts[i + 1];
        if (!nextWorkout) {
          narrativeIssues.push(`[${w.date}] "${match[0]}" odnosi się do JUTRA, ale to ostatni dzień planu`);
          continue;
        }
        if (expected && nextWorkout.workout_type !== expected) {
          narrativeIssues.push(`[${w.date}] "${match[0]}" — jutro (${nextWorkout.date}) jest "${nextWorkout.workout_type}", nie "${expected}"`);
        } else if (!expected && (nextWorkout.workout_type === 'Odpoczynek' || nextWorkout.workout_type === 'Regeneracja')) {
          // Odniesienie do jutra ale jutro = wolne
          narrativeIssues.push(`[${w.date}] odnosisz się do jutra ("${match[0]}"), ale jutro (${nextWorkout.date}) jest "${nextWorkout.workout_type}"`);
        }
      }
      
      // Check past references
      for (const pat of pastPatterns) {
        const match = desc.match(pat.regex);
        if (!match) continue;
        const expected = expectedTypeFromText(match[0]);
        const prevWorkout = sortedWorkouts[i - 1];
        if (!prevWorkout) {
          narrativeIssues.push(`[${w.date}] "${match[0]}" odnosi się do WCZORAJ, ale to pierwszy dzień planu`);
          continue;
        }
        if (expected && prevWorkout.workout_type !== expected) {
          narrativeIssues.push(`[${w.date}] "${match[0]}" — wczoraj (${prevWorkout.date}) było "${prevWorkout.workout_type}", nie "${expected}"`);
        }
      }
    }
    
    // Sprawdź sekwencje: 2 dni z rzędu Odpoczynek (poza deload)
    for (let i = 0; i < sortedWorkouts.length - 1; i++) {
      if (sortedWorkouts[i].workout_type === 'Odpoczynek' && 
          sortedWorkouts[i + 1].workout_type === 'Odpoczynek') {
        narrativeIssues.push(`[${sortedWorkouts[i].date}+${sortedWorkouts[i+1].date}] dwa dni Odpoczynku z rzędu — czy to celowe?`);
      }
    }
    
    if (narrativeIssues.length > 0) {
      console.warn(`[generate-training-plan] ⚠️ NARRATIVE INCONSISTENCIES (${narrativeIssues.length}):`);
      narrativeIssues.forEach(i => console.warn(`  - ${i}`));
      
      // Dodaj do warnings (żeby trener widział w panelu)
      const existingWarnings = aiResponse.warnings || '';
      const issueText = `[AUTO-WYKRYTE SPRZECZNOŚCI W OPISACH]\n${narrativeIssues.map(i => '  ⚠ ' + i).join('\n')}`;
      aiResponse.warnings = existingWarnings 
        ? `${existingWarnings}\n\n${issueText}` 
        : issueText;
    } else {
      console.log(`[generate-training-plan] ✅ Narrative consistency OK`);
    }

    // ✨ v3 (steps): WALIDACJA STRUCTURED STEPS — anti-fabrication.
    // Model bywa kreatywny; steps muszą przejść validateWorkoutSteps PRZED zapisem,
    // inaczej śmieci trafiłyby do bazy i (w przyszłości) na zegarek Garmin.
    // Reguła: brak steps (null) = OK (trening płaski). Złe steps = odrzucamy → null
    // (trening i tak działa z pól płaskich, zero crasha).
    let stepsOkCount = 0, stepsRejectedCount = 0;
    for (const w of aiResponse.workouts) {
      if (w.steps == null) continue; // brak struktury = OK, lecimy płasko
      const v = validateWorkoutSteps(w.steps);
      if (v.ok) {
        stepsOkCount++;
      } else {
        console.warn(`[generate-training-plan] ⚠️ Odrzucone steps [${w.date} ${w.workout_type}]: ${v.errors.join('; ')}`);
        w.steps = null; // anti-fabrication — nie ufamy modelowi w ciemno
        stepsRejectedCount++;
      }
    }
    if (stepsOkCount > 0 || stepsRejectedCount > 0) {
      console.log(`[generate-training-plan] 🏗️ Steps: ${stepsOkCount} OK, ${stepsRejectedCount} odrzucone (→ null)`);
    }

    // ─── Insert plan (parent) ─────
    const totalDistance = aiResponse.workouts.reduce(
      (sum: number, w: any) => sum + (Number(w.target_distance_km) || 0),
      0,
    );

    // ✨ v2: Próbujemy zapisać coach_note w dedykowanej kolumnie input_coach_note,
    // jeśli kolumna istnieje w tabeli. Jeśli nie istnieje (i Filip nie zrobił migracji),
    // robimy fallback — zapisujemy tylko input_logs_count etc.
    const planInsertPayload: any = {
      athlete_id,
      coach_id: coachId,
      generated_at: new Date().toISOString(),
      status: "draft",
      plan_type,
      start_date,
      end_date: endDate,
      target_race_type,
      target_race_date,
      target_time,
      target_pb_attempt: !!target_time,
      input_current_pb: context.athlete?.race_goals || null,
      input_current_volume_km: context.stats.avgWeeklyKm,
      input_target_volume_km: aiResponse.target_volume_km || target_volume_km,
      input_logs_count: context.stats.logsCount,
      input_strava_activities_count: context.stats.stravaCount,
      ai_summary: aiResponse.summary || null,
      ai_rationale: aiResponse.rationale || null,
      ai_warnings: aiResponse.warnings || null,
      generated_by_model: CLAUDE_MODEL,
      total_workouts: aiResponse.workouts.length,
      total_distance_km: Math.round(totalDistance * 100) / 100,
    };

    // Jeśli istnieje kolumna input_coach_note i mamy notatkę — dorzuć
    if (sanitizedCoachNote) {
      planInsertPayload.input_coach_note = sanitizedCoachNote;
    }

    let { data: planRow, error: planErr } = await supabase
      .from("training_plans")
      .insert(planInsertPayload)
      .select("id")
      .single();

    // Fallback jeśli kolumna input_coach_note nie istnieje — błąd "column does not exist"
    if (planErr && planErr.message && planErr.message.includes('input_coach_note')) {
      console.warn('[generate-training-plan] Kolumna input_coach_note nie istnieje, retry bez niej');
      delete planInsertPayload.input_coach_note;
      const retry = await supabase
        .from("training_plans")
        .insert(planInsertPayload)
        .select("id")
        .single();
      planRow = retry.data;
      planErr = retry.error;
    }

    if (planErr || !planRow) {
      throw new Error(`Insert plan failed: ${planErr?.message}`);
    }

    const planId = planRow.id;

    // ─── Insert workouts ─────
    const workoutsToInsert = aiResponse.workouts.map((w: any) => {
      const date = w.date;
      return {
        plan_id: planId,
        date,
        day_of_week: getDayOfWeek(date),
        week_number: weekNumberFromStart(start_date, date),
        workout_type: w.workout_type,
        title: w.title || null,
        description: w.description || null,
        target_distance_km: w.target_distance_km != null ? Number(w.target_distance_km) : null,
        target_duration_min: w.target_duration_min != null ? Number(w.target_duration_min) : null,
        target_pace: w.target_pace || null,
        target_hr_zone: w.target_hr_zone != null ? Number(w.target_hr_zone) : null,
        target_hr_min: w.target_hr_min != null ? Number(w.target_hr_min) : null,
        target_hr_max: w.target_hr_max != null ? Number(w.target_hr_max) : null,
        steps: w.steps != null ? w.steps : null,            // ✨ v3 (steps)
        steps_version: w.steps != null ? 1 : null,          // ✨ v3 (steps)
      };
    });

    let { error: workoutsErr } = await supabase
      .from("training_plan_workouts")
      .insert(workoutsToInsert);

    // ✨ v3 (steps): Fallback gdy kolumny steps/steps_version nie istnieją (migracja
    // niezrobiona) → ponów insert bez nich. Plan generuje się płasko, zero crasha.
    if (workoutsErr && workoutsErr.message) {
      const m = workoutsErr.message.toLowerCase();
      if (m.includes('steps') && (m.includes('column') || m.includes('schema') || m.includes('find') || m.includes('does not exist'))) {
        console.warn('[generate-training-plan] Kolumny steps/steps_version nie istnieją na training_plan_workouts — retry bez nich (uruchom migrację ALTER TABLE)');
        const workoutsNoSteps = workoutsToInsert.map((w: any) => {
          const { steps, steps_version, ...rest } = w;
          return rest;
        });
        const retry = await supabase
          .from("training_plan_workouts")
          .insert(workoutsNoSteps);
        workoutsErr = retry.error;
      }
    }

    if (workoutsErr) {
      // Cofnij plan jeśli workouts się nie udały
      await supabase.from("training_plans").delete().eq("id", planId);
      throw new Error(`Insert workouts failed: ${workoutsErr.message}`);
    }

    console.log(`[generate-training-plan] ✅ Plan ${planId} — ${workoutsToInsert.length} workouts`);

    return new Response(JSON.stringify({
      ok: true,
      plan_id: planId,
      workouts_count: workoutsToInsert.length,
      total_distance_km: Math.round(totalDistance * 100) / 100,
      summary: aiResponse.summary,
      warnings: aiResponse.warnings,
      status: "draft",
      coach_note_included: !!sanitizedCoachNote, // ✨ v2
    }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[generate-training-plan] ERROR:", err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});