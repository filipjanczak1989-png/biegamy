// EF: intervals-webhook  (NOWY — Verify JWT OFF)
// PROJEKT do przeglądu — NIE wdrożone. Deploy: supabase functions deploy intervals-webhook
//   --project-ref afqojgkaveykxbltxzwm --use-api --no-verify-jwt   (JWT OFF: intervals nie ma naszego JWT)
// Wołający = serwer intervals.icu (nie przeglądarka) → CORS zbędny; auth CAŁKOWICIE na guardzie sekretu.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL      = Deno.env.get('SUPABASE_URL')!;
const SVCKEY      = Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;   // rotacja: nowy sb_secret priorytet, legacy fallback (deploy --no-verify-jwt!)
const HOOK_SECRET = Deno.env.get('INTERVALS_WEBHOOK_SECRET')!;   // secret WYGENEROWANY przez intervals → skopiowany do Supabase Secrets. NIGDY w repo.

const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// ── mapowanie aktywność intervals → wiersz training_logs ──
// ⚠️ B1: ŚWIADOMY DUPLIKAT logiki z intervals-sync (secToClock/paceStr/RUN_ACT+RUN_PLAN+typeForActivity/kształt wiersza).
//    Nowy biegowy typ planu → aktualizuj RUN_PLAN TU **oraz** w intervals-sync.
//    B2 (shared _shared/intervals-map.ts) = follow-up gdy oba EF stabilne (patrz nota w planie).
function secToClock(sec: number): string {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
function paceStr(distM: number, sec: number): string | null {
  if (!distM || distM <= 0 || !sec) return null;
  const p = sec / (distM / 1000);
  const t = Math.round(p);   // round TOTAL sekund najpierw → koniec „4:60"
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
// B1: patrz nota w intervals-sync — bieg -> typ z PLANU (trainings.type na dzień aktywności), nie-bieg -> 'Zastępczy'.
const RUN_ACT = new Set(['Run', 'TrailRun', 'Treadmill', 'VirtualRun']);
// RUN_PLAN = mirror RUN_TYPES (sb.js), lowercase — match case-insensitive (km liczą się dalej, isRunType case-fold).
const RUN_PLAN = new Set(['spokojny', 'bieg spokojny', 'wybieganie', 'długi', 'tempo', 'progresja', 'interwały', 'start', 'wyścig', 'regeneracja']);
function typeFromPlan(planType: string | null): string {
  const t = String(planType || '').trim(); const lt = t.toLowerCase();
  if (!t || lt === 'odpoczynek') return 'Spokojny';
  if (lt === 'bieg spokojny') return 'Spokojny';           // jedyny alias (Decyzja A)
  return RUN_PLAN.has(lt) ? t : 'Spokojny';
}
function typeForActivity(a: any, planType: string | null): string {
  return RUN_ACT.has(a.type) ? typeFromPlan(planType) : 'Zastępczy';   // #7: nie-bieg -> Zastępczy
}
function mapActivity(a: any, athlete_id: string, planType: string | null) {
  const distM = a.distance || 0;
  const sec   = a.moving_time || a.elapsed_time || 0;
  const isRun = RUN_ACT.has(String(a.type || ''));
  return {
    athlete_id,
    training_type: typeForActivity(a, planType),
    distance_km: distM ? Math.round(distM / 10) / 100 : null,       // metry → km, 2 miejsca
    duration: sec ? secToClock(sec) : null,                         // STRING "H:MM:SS" (NIE sekundy)
    pace: isRun ? paceStr(distM, sec) : null,                       // "M:SS"/km, tylko bieg
    heart_rate: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    elevation_gain: a.total_elevation_gain ? Math.round(a.total_elevation_gain) : null,
    calories: a.calories ? Math.round(a.calories) : null,
    comment: a.name || null,
    logged_at: a.start_date_local || a.start_date,
    source: 'intervals', external_source: 'intervals',             // dziedziczy pominięcie Silnika Momentu + cooldown
    external_id: String(a.id),                                     // klucz idempotencji
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return J(405, { ok: false, error: 'method' });

  let body: any = null;
  try { body = await req.json(); } catch { body = null; }

  // ── 1) GUARD SEKRETU — PIERWSZA rzecz, PRZED parsowaniem events / jakimkolwiek zapisem (F4-na-odwrót) ──
  //    Verify JWT jest OFF → to jedyna bramka autoryzacji.
  //    ⚠️ secret = plaintext w body (nie HMAC-nad-treścią): chroni przed losowym ruchem, NIE przed kimś
  //    kto zna sekret. To model webhooków intervals.icu, nie nasz wybór. HTTPS + secret server-side.
  if (!body || typeof body.secret !== 'string' || body.secret !== HOOK_SECRET) {
    return J(401, { ok: false, error: 'bad_secret' });            // 401 TYLKO tutaj
  }

  const svc = createClient(SB_URL, SVCKEY);   // default OK dla legacy i sb_secret; NIE dodawać Authorization:'' — łamie legacy (42501)
  const events = Array.isArray(body.events) ? body.events : [];
  let imported = 0, dup = 0, skipped = 0, unmatched = 0;

  for (const ev of events) {
    // ── 2) FILTR TYPU — tylko ACTIVITY_UPLOADED. Reszta (ACTIVITY_ANALYZED/CALENDAR_*/SPORT_SETTINGS…) pomijana ──
    if (ev?.type !== 'ACTIVITY_UPLOADED') { skipped++; continue; }

    // ── 3) DEMUX athlete_id (ich → nasz), odporny na prefiks ──
    // ⚠️ DO POTWIERDZENIA 1. WEBHOOKIEM: API zwraca 'i583138'; intervals-oauth zapisuje znormalizowane
    //    (startsWith('i')?raw:'i'+raw). NIE wiemy czy webhook przyśle z 'i' czy gołe cyfry → sprawdzamy OBA.
    const rawId = String(ev.athlete_id ?? '');
    if (!rawId) { unmatched++; continue; }
    const withI = rawId.startsWith('i') ? rawId : ('i' + rawId);
    const noI   = rawId.startsWith('i') ? rawId.slice(1) : rawId;
    const cands = [...new Set([rawId, withI, noI])];
    const { data: ath } = await svc.from('athletes')
      .select('id').in('intervals_athlete_id', cands).limit(1).maybeSingle();
    if (!ath) { unmatched++; continue; }                          // niepodłączony/nieznany → GRACEFUL, nie błąd

    // ── 4) MAPOWANIE — A1: wprost z embedded event.activity (bez calla do API intervals) ──
    let a = ev.activity;
    // A2 (FALLBACK — odkomentuj gdy realny payload pokaże że activity jest za chudy, np. brak moving_time):
    //   const { data: cred } = await svc.from('intervals_credentials')
    //     .select('access_token,api_key').eq('athlete_id', ath.id).maybeSingle();
    //   const authH = cred?.access_token
    //     ? ('Bearer ' + cred.access_token)
    //     : ('Basic ' + btoa('API_KEY:' + cred?.api_key));
    //   const icuAct = a?.id;
    //   const r = await fetch(`https://intervals.icu/api/v1/activity/${icuAct}`, { headers: { Authorization: authH } });
    //   if (r.ok) a = await r.json();
    if (!a || a.id == null) { skipped++; continue; }              // brak aktywności/id → nie ma co zapisać

    // filtr ogryzków (spójny z sync): pomiń mikro-aktywności start/stop — < 60s LUB < 300m
    const _sec = Number(a.moving_time || a.elapsed_time || 0);
    const _m   = Number(a.distance || 0);
    if (_sec < 60 && _m < 300) { skipped++; continue; }

    // #6: typ biegu z PLANU tego dnia (pojedynczy select — webhook to jedna aktywność/event).
    const dateKey = String(a.start_date_local || a.start_date || '').slice(0, 10);   // lokalny klucz = trainings.date
    const { data: plan } = await svc.from('trainings')
      .select('type').eq('athlete_id', ath.id).eq('date', dateKey).maybeSingle();
    const row = mapActivity(a, ath.id, plan?.type ?? null);

    // ── 5) IDEMPOTENCJA — insert + catch 23505 (unique training_logs_external_uniq) ──
    // ⚠️ NIE upsert onConflict: indeks jest PARTIAL (WHERE external_source/external_id NOT NULL),
    //    supabase-js nie dopisze predykatu → ON CONFLICT nie znajdzie arbitra. Catch 23505 jest odporny.
    //    Chroni przed: retry po nie-2xx, redelivery ORAZ UPLOADED+ANALYZED dla tego samego activity.
    const { error } = await svc.from('training_logs').insert(row);
    if (error) {
      if (error.code === '23505') { dup++; continue; }           // już zaimportowany → idempotentny sukces
      console.error('intervals-webhook insert fail', rawId, error.message);   // błąd JEDNEGO eventu nie wywala batcha
      skipped++; continue;
    }
    imported++;
  }

  // ── 6) ZAWSZE 200 przy poprawnym secret (miss/skip/dup też) — inaczej intervals retry-uje w kółko ──
  return J(200, { ok: true, imported, dup, skipped, unmatched });
});
