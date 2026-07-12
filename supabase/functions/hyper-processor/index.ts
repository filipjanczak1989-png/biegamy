// ── KONWERTER (verbatim z icu-workout-SEALED.mjs — zweryfikowany na Fenixie w E1) ──
function pad(n){ return n < 10 ? '0' + n : '' + n; }
function fmtPace(s){ return Math.floor(s/60) + ':' + pad(s%60); }
function fmtDur(d){
  if (!d) return '';
  if (d.type === 'time'){
    if (d.s % 60 === 0) return (d.s/60) + 'm';
    if (d.s > 60)       return Math.floor(d.s/60) + 'm' + pad(d.s%60) + 's';
    return d.s + 's';
  }
  if (d.type === 'distance'){
    if (d.m % 1000 === 0) return (d.m/1000) + 'km';
    if (d.m >= 1000)      return +(d.m/1000).toFixed(2) + 'km';
    return d.m + 'mtr';
  }
  return '';
}
function fmtTarget(t){
  if (!t || t.type === 'none') return '';
  if (t.type === 'pace'){
    var body = (t.min_s_per_km === t.max_s_per_km)
      ? fmtPace(t.min_s_per_km)
      : fmtPace(t.min_s_per_km) + '-' + fmtPace(t.max_s_per_km);
    return body + '/km Pace';
  }
  if (t.type === 'hr_zone') return 'Z' + t.zone + ' HR';
  if (t.type === 'hr')      return t.min_bpm + '-' + t.max_bpm + ' HR';
  return '';
}
var KIND_PL = { warmup:'Rozgrzewka', run:'Bieg', recovery:'Trucht', rest:'Przerwa', cooldown:'Schłodzenie' };
function sanitizeCue(cue){
  if (!cue) return '';
  return String(cue)
    .replace(/\b\d+m\d+s\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:h|min|mtr|km|mi|m|s)\b/gi, ' ')
    .replace(/\b\d+\s*k\b/gi, ' ')
    .replace(/\d+:\d+(?:\/km)?/g, ' ')
    .replace(/\bZ\d\b/gi, ' ')
    .replace(/\b\d+\s*(?:%|w|bpm|rpm)\b/gi, ' ')
    .replace(/[''"]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function stepLine(s){
  var cue = sanitizeCue(s.note) || (KIND_PL[s.kind] || s.kind);
  var tgt = fmtTarget(s.target);
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
    return { secs:Math.round(s.duration.m/1000 * 300), estimated:true };
  }
  return { secs:0, estimated:false };
}
function stepsToIcuWorkout(steps, opts){
  opts = opts || {};
  var lines = [], total = 0, warnings = [];
  function acct(s){
    var r = stepSecs(s); total += r.secs;
    if (r.estimated) warnings.push('moving_time szacowany: ' + (s.note || s.kind));
    if (s.duration && s.duration.type === 'open') warnings.push('open=1s Press lap: ' + (s.note || s.kind));
  }
  (steps || []).forEach(function(el){
    if (el && el.kind === 'repeat'){
      if (lines.length) lines.push('');
      lines.push(el.count + 'x');
      var subT = total; total = 0;
      (el.steps || []).forEach(function(cs){ lines.push(stepLine(cs)); acct(cs); });
      total = subT + (el.count || 0) * total;
      lines.push('');
    } else { lines.push(stepLine(el)); acct(el); }
  });
  var description = lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  return { description: description, moving_time: total, target: 'PACE', warnings: warnings };
}

// ── HANDLER ──
// (w scaffoldzie: user = getUser() z JWT; svc = service-role; J(status,obj); CORS jak activity-detail)
async function handle(req, user, svc){
  const { training_id } = await req.json().catch(()=> ({}));
  if (!training_id) return J(400, { ok:false, error:'no_training_id' });

  // 1) trening
  const { data: tr } = await svc.from('trainings')
    .select('id, athlete_id, coach_id, date, type, steps')
    .eq('id', training_id).maybeSingle();
  if (!tr) return J(404, { ok:false, error:'training_not_found' });
  if (!tr.steps || (Array.isArray(tr.steps) && tr.steps.length === 0))
    return J(200, { ok:false, error:'no_steps' });

  // 2) auth owner∨coach
  const { data: ath } = await svc.from('athletes')
    .select('id, user_id, intervals_athlete_id, intervals_can_write')
    .eq('id', tr.athlete_id).maybeSingle();
  if (!ath) return J(404, { ok:false, error:'athlete_not_found' });
  const isOwner = ath.user_id === user.id;
  const isCoach = tr.coach_id === user.id;
  if (!isOwner && !isCoach) return J(403, { ok:false, error:'forbidden' });

  // 3) połączenie + bit write (bramka)
  if (!ath.intervals_athlete_id) return J(200, { ok:false, error:'not_connected' });
  if (!ath.intervals_can_write)  return J(200, { ok:false, error:'no_write_scope' });

  // 4) token (auth-mode verbatim z intervals-sync)
  const { data: cred } = await svc.from('intervals_credentials')
    .select('api_key, access_token').eq('athlete_id', tr.athlete_id).maybeSingle();
  if (!cred) return J(200, { ok:false, error:'not_connected' });
  const useOAuth = !!cred.access_token;
  const authH = useOAuth ? ('Bearer ' + cred.access_token)
                         : ('Basic ' + btoa('API_KEY:' + cred.api_key));

  // 5) konwersja + event
  const w = stepsToIcuWorkout(tr.steps, {});
  const name = tr.type ? (tr.type + ' · BiegaMy') : 'BiegaMy';
  const ev = {
    category:'WORKOUT', type:'Run', target:'PACE',
    start_date_local: tr.date + 'T00:00:00',
    name, external_id: tr.id, moving_time: w.moving_time, description: w.description
  };

  // 6) push (athlete '0' = właściciel tokena, jak read-path)
  const r = await fetch('https://intervals.icu/api/v1/athlete/0/events/bulk?upsert=true', {
    method:'POST', headers:{ 'Authorization':authH, 'Content-Type':'application/json' },
    body: JSON.stringify([ev])
  });
  if (r.status === 401 || r.status === 403) return J(200, { ok:false, error:'icu_denied' }); // token stracił write/wygasł
  if (!r.ok){
    const detail = await r.text().catch(()=> '');
    return J(200, { ok:false, error:'icu_' + r.status, detail: detail.slice(0,200) });
  }
  return J(200, { ok:true, date: tr.date, name, warnings: w.warnings });
}