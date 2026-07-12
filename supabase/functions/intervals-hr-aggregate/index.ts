import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const ANON   = 'sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY';   // publiczny (== sb.js:32) — literal przetrwa Disable legacy anon
const SVCKEY = Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;   // rotacja: nowy sb_secret ma priorytet, legacy fallback do czasu dezaktywacji
const CORS = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, content-type', 'Content-Type':'application/json' };
const J = (s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:CORS});
// E2 (#15): 401 z intervals = token martwy. Flaga TYLKO przy pierwszym wykryciu (NULL→now) +
// dwutorowa notyfikacja (zawodnik + trener). Best-effort: blad tu NIE psuje odpowiedzi EF.
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
const L7 = ['Z1','Z2','Z3','Z4','Z5a','Z5b','Z5c'];
const isRunLike = (t:string|null)=>{ const s=(t||'').toLowerCase(); return s.includes('run') || s==='treadmill'; };   // Run/TrailRun/VirtualRun/Treadmill — nie ucinaj wariantów

Deno.serve(async (req)=>{
  if (req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  try {
    const body = await req.json().catch(()=>({}));
    const athlete_id = body.athlete_id;
    const days = Math.min(365, Math.max(7, body.days || 90));
    if (!athlete_id) return J(400,{ok:false,error:'missing athlete_id'});

    const jwt=(req.headers.get('Authorization')||'').replace('Bearer ','');
    const u=createClient(SB_URL,ANON,{global:{headers:{Authorization:`Bearer ${jwt}`}}});
    const { data:{ user } }=await u.auth.getUser();
    if(!user) return J(401,{ok:false,error:'unauthorized'});

    const svc=createClient(SB_URL,SVCKEY);   // default OK dla legacy i sb_secret; NIE dodawać Authorization:'' — łamie legacy (42501)
    // ── AUTHZ: właściciel LUB trener-TEGO-zawodnika ──
    // coaches.id = auth.uid() (auth_is_coach); athletes.coach_id → coaches.id → coach_id === user.id znaczy "jestem trenerem tego zawodnika"
    const { data: ath }=await svc.from('athletes')
      .select('id,user_id,coach_id,intervals_athlete_id').eq('id',athlete_id).maybeSingle();
    if(!ath) return J(404,{ok:false,error:'athlete_not_found'});
    if(ath.user_id!==user.id && ath.coach_id!==user.id) return J(403,{ok:false,error:'forbidden'});   // scoped: trener widzi TYLKO swoich
    if(!ath.intervals_athlete_id) return J(200,{ok:false,error:'not_connected'});

    const { data: cred }=await svc.from('intervals_credentials').select('api_key,access_token').eq('athlete_id',athlete_id).maybeSingle();
    if(!cred) return J(200,{ok:false,error:'not_connected'});
    const useOAuth = !!cred.access_token;                                                          // jeden flag
    const authH  = useOAuth ? ('Bearer '+cred.access_token) : ('Basic '+btoa('API_KEY:'+cred.api_key));
    const icuAth = useOAuth ? '0' : ath.intervals_athlete_id;                                      // spójny tryb (Bearer→'0', Basic→numeryczny)

    const now=Date.now();
    const oldest=new Date(now-days*86400000).toISOString().slice(0,10);
    const newest=new Date(now+86400000).toISOString().slice(0,10);
    const r=await fetch(`https://intervals.icu/api/v1/athlete/${icuAth}/activities?oldest=${oldest}&newest=${newest}`,{headers:{Authorization:authH}});
    if(r.status===401){ await markIntervalsDead(svc, athlete_id); return J(200,{ok:false,error:'intervals_401'}); }
    if(!r.ok) return J(200,{ok:false,error:'intervals_'+r.status});
    const list=await r.json();
    const acts=Array.isArray(list)?list:[];

    const runs=acts.filter((a:any)=>isRunLike(a.type));
    const withHr=runs.filter((a:any)=>Array.isArray(a.icu_hr_zone_times) && a.icu_hr_zone_times.some((x:any)=>x>0));

    // suma per LABEL (odporne na zmianę bounds); labels/bounds z NAJNOWSZEGO treningu (po dacie, bez zakładania kolejności listy)
    const sums:Record<string,number>={}; const sigs=new Set<string>();
    let newestKey=''; let labels:string[]=[]; let bounds:number[]=[];
    for(const a of withHr){
      const zt=a.icu_hr_zone_times as number[];
      const labs=(zt.length===7)?L7:zt.map((_,i)=>'Z'+(i+1));
      labs.forEach((L,i)=>{ sums[L]=(sums[L]||0)+(zt[i]||0); });
      const zb=Array.isArray(a.icu_hr_zones)?a.icu_hr_zones as number[]:[];
      if(zb.length) sigs.add(zb.join(','));
      const key=String(a.start_date_local||a.start_date||a.id||'');
      if(key>=newestKey){ newestKey=key; labels=labs; bounds=zb; }
    }

    if(!withHr.length){
      return J(200,{ ok:true, days, n_hr:0, n_runs:runs.length, labels:[], bounds:[], time_s:[], total_s:0, bounds_varied:false });
    }
    const time_s=labels.map(L=>sums[L]||0);
    const total_s=time_s.reduce((s,x)=>s+x,0);
    return J(200,{ ok:true, days, n_hr:withHr.length, n_runs:runs.length,
      labels, bounds, time_s, total_s, bounds_varied: sigs.size>1 });
  } catch(e){ return J(500,{ok:false,error:(e as Error).message}); }
});