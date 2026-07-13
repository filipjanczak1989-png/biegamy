import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const ANON   = 'sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY';   // publiczny (== sb.js:32) — literal przetrwa Disable legacy anon
const SVCKEY = Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;   // rotacja: nowy sb_secret ma priorytet, legacy fallback do czasu dezaktywacji
const CORS = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, content-type', 'Content-Type':'application/json' };
const J = (s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:CORS});
// E2 (#15): 401 z intervals = token martwy (403 = brak scope zapisu, NIE flaguj). Flaga TYLKO przy
// pierwszym wykryciu (NULL→now) + dwutorowa notyfikacja. Best-effort: blad tu NIE psuje odpowiedzi EF.
async function markIntervalsDead(svc: any, athleteId: string) {
  try {
    const { data: hit } = await svc.from('athletes')
      .update({ intervals_token_dead_at: new Date().toISOString() })
      .eq('id', athleteId).is('intervals_token_dead_at', null)
      .select('full_name, coach_id');
    if (!hit || !hit.length) return;
    await svc.from('notifications').insert({
      athlete_id: athleteId, from_athlete_id: null, type: 'intervals_dead', read: false,
      message: 'Połączenie z zegarkiem (intervals.icu) wygasło — połącz ponownie w profilu.',
    });
    const coachUid = hit[0].coach_id;
    if (coachUid) {
      const { data: c } = await svc.from('athletes').select('id').eq('user_id', coachUid).maybeSingle();
      if (c?.id) await svc.from('notifications').insert({
        athlete_id: c.id, from_athlete_id: athleteId, type: 'intervals_dead', read: false,
        message: (hit[0].full_name || 'Zawodnik') + ' — zegarek (intervals.icu) rozłączony, token wygasł.',
      });
    }
  } catch (_) { /* best-effort */ }
}

// ─── KONWERTER — verbatim z icu-workout-SEALED.mjs (zapieczętowany po E1, Fenix 6/6; bez 'export') ───
// UWAGA: w składni intervals 'm' = MINUTY. Dystans = km / mtr (NIGDY '400m').
function pad(n){ return n < 10 ? '0' + n : '' + n; }
function fmtPace(s){ return Math.floor(s/60) + ':' + pad(s%60); }        // 270 -> "4:30"

function fmtDur(d){
  if (!d) return '';
  if (d.type === 'time'){
    if (d.s % 60 === 0) return (d.s/60) + 'm';                            // 180 -> "3m"
    if (d.s > 60)       return Math.floor(d.s/60) + 'm' + pad(d.s%60) + 's'; // 90 -> "1m30s"
    return d.s + 's';                                                      // 45 -> "45s"
  }
  if (d.type === 'distance'){
    if (d.m % 1000 === 0) return (d.m/1000) + 'km';                        // 1000 -> "1km"
    if (d.m >= 1000)      return +(d.m/1000).toFixed(2) + 'km';            // 1500 -> "1.5km"
    return d.m + 'mtr';                                                    // 400 -> "400mtr"
  }
  return '';                                                              // open -> obsłużone w stepLine
}

function fmtTarget(t){
  if (!t || t.type === 'none') return '';
  if (t.type === 'pace'){
    var body = (t.min_s_per_km === t.max_s_per_km)
      ? fmtPace(t.min_s_per_km)
      : fmtPace(t.min_s_per_km) + '-' + fmtPace(t.max_s_per_km);          // faster-slower (zweryfikowane na tarczy)
    return body + '/km Pace';
  }
  if (t.type === 'hr_zone') return 'Z' + t.zone + ' HR';                  // renderuje się OBOK pace w 1 workoutcie (Q3 ✓)
  if (t.type === 'hr')      return t.min_bpm + '-' + t.max_bpm + ' HR';   // absolutne bpm — nie występuje w prod
  return '';
}

var KIND_PL = { warmup:'Rozgrzewka', run:'Bieg', recovery:'Trucht', rest:'Przerwa', cooldown:'Schłodzenie' };

// Bug 1 fix: intervals parsuje wolny tekst przed duration jako duration. Cue z 'Nm'/'Nkm'/'4:30'/'Z2'/'%'
// kolidowałby (np. "1000m mocno" -> 1000 MINUT). Usuwamy takie tokeny — dystans/czas jest i tak w structured duration.
function sanitizeCue(cue){
  if (!cue) return '';
  return String(cue)
    .replace(/\b\d+m\d+s\b/gi, ' ')                                 // 1m30s
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:h|min|mtr|km|mi|m|s)\b/gi, ' ') // 1000m, 400 m, 1.5km, 90s, 5min
    .replace(/\b\d+\s*k\b/gi, ' ')                                  // 5k
    .replace(/\d+:\d+(?:\/km)?/g, ' ')                              // 4:30, 4:30/km
    .replace(/\bZ\d\b/gi, ' ')                                      // Z2, Z4
    .replace(/\b\d+\s*(?:%|w|bpm|rpm)\b/gi, ' ')                    // 70% 250w 150bpm 90rpm
    .replace(/[''"]/g, ' ')                                         // 5' 30"
    .replace(/\s+/g, ' ').trim();
}

function stepLine(s){
  var cue = sanitizeCue(s.note) || (KIND_PL[s.kind] || s.kind);
  var tgt = fmtTarget(s.target);
  // Bug 2 fix: open = advance on lap press. Magiczna fraza "Press lap" + nominalne '1s' (żeby krok przeżył parser).
  if (s.duration && s.duration.type === 'open'){
    return '- ' + [cue, '1s', tgt, 'Press lap'].filter(Boolean).join(' ');
  }
  return '- ' + [cue, fmtDur(s.duration), tgt].filter(Boolean).join(' ');
}

function stepSecs(s){
  if (!s.duration) return { secs:0, estimated:false };
  if (s.duration.type === 'time') return { secs:s.duration.s, estimated:false };
  if (s.duration.type === 'distance'){
    if (s.target && s.target.type === 'pace'){
      var mid = (s.target.min_s_per_km + s.target.max_s_per_km)/2;
      return { secs:Math.round(s.duration.m/1000 * mid), estimated:false };
    }
    return { secs:Math.round(s.duration.m/1000 * 300), estimated:true };  // fallback 5:00/km
  }
  return { secs:0, estimated:false };                                     // open
}

function stepsToIcuWorkout(steps, opts){
  opts = opts || {};
  var lines = [], total = 0, warnings = [];
  function acct(s){
    var r = stepSecs(s); total += r.secs;
    if (r.estimated) warnings.push('moving_time szacowany (dystans bez tempa: ' + (s.note || s.kind) + ')');
    if (s.duration && s.duration.type === 'open') warnings.push('krok open (' + (s.note || s.kind) + ') = 1s Press lap');
  }
  (steps || []).forEach(function(el){
    if (el && el.kind === 'repeat'){
      if (lines.length) lines.push('');
      lines.push(el.count + 'x');
      var subT = total; total = 0;
      (el.steps || []).forEach(function(cs){ lines.push(stepLine(cs)); acct(cs); });
      total = subT + (el.count || 0) * total;
      lines.push('');
    } else {
      lines.push(stepLine(el)); acct(el);
    }
  });
  var description = lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  return { description: description, moving_time: total, target: 'PACE', warnings: warnings };
}

// ─── HANDLER (Część A z gotowca — verbatim) ───
async function handle(req, user, svc){
  const body = await req.json().catch(()=> ({}));
  const training_id = body.training_id;
  const action = body.action === 'delete' ? 'delete' : 'push';
  if (!training_id) return J(400, { ok:false, error:'no_training_id' });

  const { data: tr } = await svc.from('trainings')
    .select('id, athlete_id, coach_id, date, type, steps')
    .eq('id', training_id).maybeSingle();
  if (!tr) return J(404, { ok:false, error:'training_not_found' });

  const { data: ath } = await svc.from('athletes')
    .select('id, user_id, intervals_athlete_id, intervals_can_write')
    .eq('id', tr.athlete_id).maybeSingle();
  if (!ath) return J(404, { ok:false, error:'athlete_not_found' });
  const isOwner = ath.user_id === user.id;
  const isCoach = tr.coach_id === user.id;
  if (!isOwner && !isCoach) return J(403, { ok:false, error:'forbidden' });

  if (!ath.intervals_athlete_id) return J(200, { ok:false, error:'not_connected' });
  if (!ath.intervals_can_write)  return J(200, { ok:false, error:'no_write_scope' });

  const { data: cred } = await svc.from('intervals_credentials')
    .select('api_key, access_token').eq('athlete_id', tr.athlete_id).maybeSingle();
  if (!cred) return J(200, { ok:false, error:'not_connected' });
  const useOAuth = !!cred.access_token;
  const authH = useOAuth ? ('Bearer ' + cred.access_token)
                         : ('Basic ' + btoa('API_KEY:' + cred.api_key));

  // ── DELETE: skasuj event z kalendarza intervals (2 kroki — intervals nie kasuje po external_id) ──
  if (action === 'delete'){
    // 1) GET events po dacie treningu → znajdź nasz po external_id
    const g = await fetch('https://intervals.icu/api/v1/athlete/0/events'
      + '?oldest=' + tr.date + '&newest=' + tr.date, {
      headers:{ 'Authorization':authH }
    });
    if (g.status === 401) { await markIntervalsDead(svc, tr.athlete_id); return J(200, { ok:false, error:'icu_401' }); }
    if (!g.ok) return J(200, { ok:false, error:'icu_' + g.status });
    const evs = await g.json().catch(()=> []);
    const hit = Array.isArray(evs) ? evs.find(e => String(e.external_id) === String(tr.id)) : null;
    if (!hit || !hit.id) return J(200, { ok:true, noop:true });   // nigdy nie wysłany / już usunięty
    // 2) DELETE po numerycznym id
    const del = await fetch('https://intervals.icu/api/v1/athlete/0/events/' + hit.id, {
      method:'DELETE', headers:{ 'Authorization':authH }
    });
    if (del.status === 401) await markIntervalsDead(svc, tr.athlete_id);
    if (del.status === 401 || del.status === 403) return J(200, { ok:false, error:'icu_denied' });
    if (!del.ok) return J(200, { ok:false, error:'icu_' + del.status });
    return J(200, { ok:true, deleted:true });
  }

  // (push) bez steps nie ma czego wysłać
  if (!tr.steps || (Array.isArray(tr.steps) && tr.steps.length === 0))
    return J(200, { ok:false, error:'no_steps' });
  const w = stepsToIcuWorkout(tr.steps, {});
  const name = tr.type ? (tr.type + ' · BiegaMy') : 'BiegaMy';
  const ev = {
    category:'WORKOUT', type:'Run', target:'PACE',
    start_date_local: tr.date + 'T00:00:00',
    name, external_id: tr.id, moving_time: w.moving_time, description: w.description
  };

  const r = await fetch('https://intervals.icu/api/v1/athlete/0/events/bulk?upsert=true', {
    method:'POST', headers:{ 'Authorization':authH, 'Content-Type':'application/json' },
    body: JSON.stringify([ev])
  });
  if (r.status === 401) await markIntervalsDead(svc, tr.athlete_id);
  if (r.status === 401 || r.status === 403) return J(200, { ok:false, error:'icu_denied' });
  if (!r.ok){
    const detail = await r.text().catch(()=> '');
    return J(200, { ok:false, error:'icu_' + r.status, detail: detail.slice(0,200) });
  }
  return J(200, { ok:true, date: tr.date, name, warnings: w.warnings });
}

// ─── SCAFFolD Deno.serve (jak intervals-activity-detail: user-JWT → getUser, svc service-role → handle) ───
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const u = createClient(SB_URL, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: { user } } = await u.auth.getUser();
    if (!user) return J(401, { ok:false, error:'unauthorized' });
    const svc = createClient(SB_URL, SVCKEY);   // default OK dla legacy i sb_secret; NIE dodawać Authorization:'' — łamie legacy (42501)
    return await handle(req, user, svc);
  } catch (e) {
    return J(500, { ok:false, error:(e as Error).message });
  }
});
