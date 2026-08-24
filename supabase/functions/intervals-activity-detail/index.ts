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
const TARGET = 200;
const PAYLOAD_V = 4;   // 4: doszla `trasa` (polyline). Podbicie ODSWIEZA 347 rekordow cache — patrz komentarz przy pobraniu mapy.
const Z7 = ['Z1','Z2','Z3','Z4','Z5a','Z5b','Z5c'];

const paceFromV = (v:number)=> (v && v > 0.3) ? Math.round(1000/v) : null;   // m/s -> s/km

/* ═ TRASA (24.08.2026) ══════════════════════════════════════════════════════
   ⚠️ ZAPIS, NIE STRUMIEN. Surowe latlngs z intervals to ~2700 punktow na bieg
   (1 Hz). Zmierzone: jako jsonb to 40 B/punkt, czyli 164 MB na 4,3 mln punktow
   w bazie — a `raw_data` CACHUJE SIE, wiec „na zadanie" nie znaczy „za darmo".
   Probkujemy do 200 punktow i kodujemy polyline Google: 730 B na aktywnosc,
   ~1,1 MB gdyby kiedykolwiek otwarto wszystkie 1573 aktywnosci z GPS. To nie
   jest zero, ale miesci sie w 39 MB bazy przy limicie 500 MB.
   ⚠️ 200 punktow to nie oszczednosc kosztem obrazu: przy szerokosci ~320 px
   sasiednie probki i tak trafiaja w ten sam piksel. */
const TRASA_PKT = 200;

function probkujTrase(pts:number[][]):number[][]{
  if(!Array.isArray(pts) || pts.length<=TRASA_PKT) return (pts||[]);
  const krok=(pts.length-1)/(TRASA_PKT-1), out:number[][]=[];
  for(let i=0;i<TRASA_PKT;i++) out.push(pts[Math.round(i*krok)]);
  out[out.length-1]=pts[pts.length-1];   // koniec trasy MUSI zostac koncem
  return out;
}

/* Polyline Google, precyzja 5 (≈1,1 m — ponizej bledu samego GPS). */
function kodujTrase(pts:number[][]):string{
  let plat=0, plon=0, out='';
  for(const p of pts){
    if(!p || p.length<2 || !isFinite(p[0]) || !isFinite(p[1])) continue;
    const la=Math.round(p[0]*1e5), lo=Math.round(p[1]*1e5);
    for(const d of [la-plat, lo-plon]){
      let v = d<0 ? ~(d<<1) : (d<<1);
      while(v>=0x20){ out+=String.fromCharCode((0x20|(v&0x1f))+63); v>>=5; }
      out+=String.fromCharCode(v+63);
    }
    plat=la; plon=lo;
  }
  return out;
}

/* ⚠️ TRASA WSKAZUJE, GDZIE KTOS MIESZKA. Poczatek i koniec biegu to zwykle
   drzwi wejsciowe. 32 z 61 profili jest publicznych, wiec bez tej bramki
   otwarcie cudzego treningu oddawaloby adres domowy 32 osob obcemu czlowiekowi.
   HR ma juz wlasna flage `hr_public` — trasa NIE MA takiej flagi i celowo jej
   nie wymyslamy: widzi ja WYLACZNIE wlasciciel albo jego trener. */
function stripTrasa(p:any){
  if(!p) return p;
  const c = structuredClone(p);
  c.trasa = null; c.trasa_n = 0;
  return c;
}

function computeSplits(time:number[], dist:number[], hr:number[]|null, alt:number[]|null){
  const out:any[] = []; if (!dist.length) return out;
  let k=1, prevT=0, hrW=0, hrDt=0, elev=0, lastAlt = alt? alt[0] : null;
  for (let i=1;i<dist.length;i++){
    const dt = time[i]-time[i-1];
    if (hr && hr[i]!=null && dt>0){ hrW += hr[i]*dt; hrDt += dt; }
    if (alt && alt[i]!=null && lastAlt!=null){ const d=alt[i]-lastAlt; if (d>0) elev+=d; lastAlt=alt[i]; }
    while (dist[i] >= k*1000){
      const d0=dist[i-1], d1=dist[i], t0=time[i-1], t1=time[i];
      const tB = t0 + ((k*1000-d0)/((d1-d0)||1))*(t1-t0);
      out.push({ km:k, pace_s:Math.round(tB-prevT), hr_avg: hrDt?Math.round(hrW/hrDt):null, elev_gain_m:Math.round(elev) });
      prevT=tB; k++; hrW=0; hrDt=0; elev=0;
    }
  }
  const lastD=dist[dist.length-1], lastT=time[time.length-1];
  if (lastD > (k-1)*1000 + 50){
    const partKm=(lastD-(k-1)*1000)/1000;
    out.push({ km:Math.round(lastD/1000*100)/100, pace_s: partKm>0?Math.round((lastT-prevT)/partKm):null,
               hr_avg: hrDt?Math.round(hrW/hrDt):null, elev_gain_m:Math.round(elev), partial:true });
  }
  return out;
}

function sampleSeries(dist:number[], vel:number[], hr:number[]|null, alt:number[]|null, cad:number[]|null, resp:number[]|null, temp:number[]|null){
  const n=dist.length, total=dist[n-1]||0, bucketM=Math.max(50, Math.ceil(total/TARGET));
  const S:any={ dist_km:[], pace_s:[], hr: hr?[]:null, alt_m: alt?[]:null, cad: cad?[]:null, resp: resp?[]:null, temp: temp?[]:null };
  let a={v:0,vc:0,h:0,hc:0,al:0,alc:0,c:0,cc:0,r:0,rc:0,tm:0,tc:0}, boundary=bucketM;
  const flush=(dm:number)=>{ S.dist_km.push(Math.round(dm/10)/100);
    S.pace_s.push(a.vc?paceFromV(a.v/a.vc):null);
    if(S.hr)   S.hr.push(a.hc?Math.round(a.h/a.hc):null);
    if(S.alt_m)S.alt_m.push(a.alc?Math.round(a.al/a.alc):null);
    if(S.cad)  S.cad.push(a.cc?Math.round(a.c/a.cc):null);
    if(S.resp) S.resp.push(a.rc?Math.round(a.r/a.rc):null);
    if(S.temp) S.temp.push(a.tc?Math.round(a.tm/a.tc):null);
    a={v:0,vc:0,h:0,hc:0,al:0,alc:0,c:0,cc:0,r:0,rc:0,tm:0,tc:0}; };
  for(let i=0;i<n;i++){
    if(vel[i]!=null){a.v+=vel[i];a.vc++;} if(hr&&hr[i]!=null){a.h+=hr[i];a.hc++;}
    if(alt&&alt[i]!=null){a.al+=alt[i];a.alc++;} if(cad&&cad[i]!=null){a.c+=cad[i];a.cc++;}
    if(resp&&resp[i]!=null){a.r+=resp[i];a.rc++;} if(temp&&temp[i]!=null){a.tm+=temp[i];a.tc++;}
    if(dist[i]>=boundary){ flush(dist[i]); boundary+=bucketM; }
  }
  if(a.vc||a.hc||a.alc||a.cc||a.rc||a.tc) flush(dist[n-1]);
  return S;
}

// Strip HR z payloadu dla widza bez uprawnień (publiczny profil bez hr_public).
// Wycina WSZYSTKIE 5 miejsc HR; NIE rusza tempa/elevation/cadence/distance/splitów-poza-hr.
function stripHr(p:any){
  if(!p) return p;
  const c = structuredClone(p);   // izolowana kopia — zero ryzyka mutacji cache/cross-request
  c.has_hr = false;
  if(c.series) c.series.hr = null;
  if(Array.isArray(c.splits)) for(const s of c.splits){ if(s) s.hr_avg = null; }   // ⚠️ HR per-km w splitach
  c.hr_zones = null;
  if(c.stats){ c.stats.max_hr = null; c.stats.load = null; c.stats.intensity = null; }
  return c;
}

Deno.serve(async (req)=>{
  if (req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  try {
    const url=new URL(req.url); const body=await req.json().catch(()=>({}));
    const athlete_id=body.athlete_id, activity_id=body.activity_id;
    const refresh = body.refresh===true || url.searchParams.get('refresh')==='1';
    if(!athlete_id||!activity_id) return J(400,{ok:false,error:'missing athlete_id/activity_id'});

    const jwt=(req.headers.get('Authorization')||'').replace('Bearer ','');
    const u=createClient(SB_URL,ANON,{global:{headers:{Authorization:`Bearer ${jwt}`}}});
    const { data:{ user } }=await u.auth.getUser();
    if(!user) return J(401,{ok:false,error:'unauthorized'});
    const svc=createClient(SB_URL,SVCKEY);   // default OK dla legacy i sb_secret; NIE dodawać Authorization:'' — łamie legacy (42501)
    const { data: ath }=await svc.from('athletes').select('id,user_id,coach_id,is_public,hr_public').eq('id',athlete_id).maybeSingle();
    const isOwner = !!ath && ath.user_id===user.id;
    const isCoach = !!ath && ath.coach_id===user.id;
    if(!ath || (!isOwner && !isCoach && !ath.is_public)) return J(403,{ok:false,error:'forbidden'});   // owner ∨ trener-TEGO-zawodnika ∨ publiczny profil (is_public)
    const canSeeTrasa = isOwner || isCoach;   // ⚠️ BEZ furtki `is_public` — trasa to adres domowy, nie statystyka
    const canSeeHr = isOwner || isCoach || !!ath.hr_public;   // HR domyślnie PRYWATNY (hr_public=false) — publiczny widz bez hr_public → stripHr na WYJŚCIU

    const { data: cached }=await svc.from('intervals_activities')
      .select('id,raw_data').eq('athlete_id',athlete_id).eq('intervals_activity_id',activity_id).maybeSingle();
    if(cached?.raw_data && cached.raw_data.v===PAYLOAD_V && !refresh){
      let out={ ...cached.raw_data, cached:true };
      if(!canSeeHr) out=stripHr(out);
      if(!canSeeTrasa) out=stripTrasa(out);   // ⚠️ trasa NIE ma flagi publicznej — patrz stripTrasa
      return J(200, out);   // cache w bazie NIETKNIĘTY (pełny); strip TYLKO na wyjściu
    }

    const { data: cred }=await svc.from('intervals_credentials').select('api_key,access_token').eq('athlete_id',athlete_id).maybeSingle();
    if(!cred) return J(200,{ok:false,error:'not_connected'});
    const authH = cred.access_token ? ('Bearer '+cred.access_token) : ('Basic '+btoa('API_KEY:'+cred.api_key));   // OAuth wygrywa

    /* ⚠️ TRASA IDZIE TRZECIM WYWOLANIEM, NIE W `types=`. Endpoint `/streams`
       przyjmuje dowolna liste typow, ale specyfikacja intervals.icu NIGDZIE nie
       wymienia nazwy strumienia GPS — jedyne udokumentowane zrodlo latlngs to
       `/activity/{id}/map` (schemat `MapData`: bounds + latlngs). Zgadywanie
       nazwy typu byloby zalozeniem klasy `signed_at`, wiec bierzemy droge pewna.
       ⚠️ To OSOBNE WYWOLANIE API, ale NIE osobna runda dla przegladarki ani
       dodatkowy czas: leci w tym samym `Promise.all` co dwa pozostale.
       Blad mapy NIE psuje szczegolow — trening bez trasy ma nadal wykres,
       splity i strefy. */
    const [sr,ar,mr]=await Promise.all([
      fetch(`https://intervals.icu/api/v1/activity/${activity_id}/streams?types=time,distance,heartrate,velocity_smooth,altitude,cadence,temp,respiration`,{headers:{Authorization:authH}}),
      fetch(`https://intervals.icu/api/v1/activity/${activity_id}`,{headers:{Authorization:authH}}),
      fetch(`https://intervals.icu/api/v1/activity/${activity_id}/map`,{headers:{Authorization:authH}}).catch(()=>null),
    ]);
    if(sr.status===401 || ar.status===401) await markIntervalsDead(svc, athlete_id);
    if(!sr.ok) return J(200,{ok:false,error:'intervals_streams_'+sr.status});
    if(!ar.ok) return J(200,{ok:false,error:'intervals_activity_'+ar.status});
    const streams=await sr.json(), act=await ar.json();

    /* Bieznia i VirtualRun nie maja GPS-a w ogole — `trasa:null` to poprawna
       odpowiedz, nie awaria. Renderer po stronie klienta chowa wtedy karte. */
    let trasa:string|null = null, trasa_n = 0;
    try {
      if(mr && mr.ok){
        const md = await mr.json();
        const pts = probkujTrase(Array.isArray(md?.latlngs) ? md.latlngs : []);
        if(pts.length >= 2){ trasa = kodujTrase(pts); trasa_n = pts.length; }
      }
    } catch(_) { /* brak mapy nie moze zabrac wykresu */ }

    const byType:Record<string,any[]>={};
    for(const s of (Array.isArray(streams)?streams:[])) byType[s.type]=s.data||[];
    const time=byType['time']||[], dist=byType['distance']||[], vel=byType['velocity_smooth']||[];
    const hrS=byType['heartrate']||null, altS=byType['altitude']||null, cadS=byType['cadence']||null;
    const respS=byType['respiration']||null, tempS=byType['temp']||null;
    const has_hr=!!(hrS && hrS.some((x:any)=>x!=null));
    const has_resp=!!(respS && respS.some((x:any)=>x!=null));
    const has_temp=!!(tempS && tempS.some((x:any)=>x!=null));
    if(!time.length||!dist.length) return J(200,{ok:false,error:'no_stream_data'});

    const series=sampleSeries(dist, vel, has_hr?hrS:null, altS, cadS, has_resp?respS:null, has_temp?tempS:null);
    const splits=computeSplits(time, dist, has_hr?hrS:null, altS);
    const zt=act.icu_hr_zone_times, zb=act.icu_hr_zones;
    const hr_zones=(has_hr && Array.isArray(zt) && Array.isArray(zb)) ?
      { bounds:zb, time_s:zt, labels: zt.length===7?Z7:zt.map((_:any,i:number)=>'Z'+(i+1)) } : null;

    const stats={
      gap_pace_s:  paceFromV(act.gap),
      avg_cadence: act.average_cadence ?? null,
      avg_stride_m:act.average_stride ?? null,
      elev_gain_m: act.total_elevation_gain ?? null,
      elev_loss_m: act.total_elevation_loss ?? null,
      min_alt_m:   act.min_altitude ?? null, max_alt_m: act.max_altitude ?? null,
      avg_temp_c:  act.average_temp ?? null, max_temp_c: act.max_temp ?? null,
      max_hr:    has_hr ? (act.max_heartrate ?? null) : null,
      load:      has_hr ? (act.icu_training_load ?? null) : null,
      intensity: has_hr ? (act.icu_intensity ?? null) : null,
    };

    const payload={ ok:true, v:PAYLOAD_V, activity_id, cached:false,
      trasa, trasa_n,
      distance_km: Math.round((dist[dist.length-1]/1000)*100)/100,
      moving_time_s: act.moving_time ?? time[time.length-1],
      has_hr, series, splits, hr_zones, stats };

    const { data: log }=await svc.from('training_logs').select('id')
      .eq('athlete_id',athlete_id).eq('external_source','intervals').eq('external_id',activity_id).maybeSingle();
    const rowc={ athlete_id, intervals_activity_id:activity_id, linked_training_log_id: log?.id ?? null,
      start_date_local: act.start_date_local ?? act.start_date ?? new Date().toISOString(),
      type: act.type ?? null, name: act.name ?? null,
      raw_data:payload,
      average_heartrate:act.average_heartrate??null, max_heartrate:act.max_heartrate??null,
      distance:act.distance??null, moving_time:act.moving_time??null,
      total_elevation_gain:act.total_elevation_gain??null, average_speed:act.average_speed??null,
      synced_at:new Date().toISOString() };
    const { error: cacheErr } = cached?.id
      ? await svc.from('intervals_activities').update(rowc).eq('id',cached.id)
      : await svc.from('intervals_activities').insert(rowc);
    if (cacheErr){
      const outw={ ...payload, cache_warning: cacheErr.message };
      return J(200, canSeeHr ? outw : stripHr(outw));   // payload już zapisany do DB (pełny) PRZED tym returnem
    }

    return J(200, canSeeHr ? payload : stripHr(payload));   // DB write @insert/update był PRZED — cache pełny, strip tylko output
  } catch(e){ return J(500,{ok:false,error:(e as Error).message}); }
});