import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const ANON   = 'sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY';   // publiczny (== sb.js:32) — literal przetrwa Disable legacy anon
const SVCKEY = Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;   // rotacja: nowy sb_secret ma priorytet, legacy fallback do czasu dezaktywacji
const CLIENT_ID     = '533';                                   // publiczny — stała OK
const CLIENT_SECRET = Deno.env.get('INTERVALS_CLIENT_SECRET')!; // SECRET tylko z env — NIGDY w kodzie
const CORS = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, content-type', 'Content-Type':'application/json' };
const J = (s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:CORS});

Deno.serve(async (req)=>{
  if (req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  try {
    const { code } = await req.json().catch(()=>({}));
    if (!code) return J(400,{ok:false,error:'no_code'});

    // BRAMKA: token wiązany z ZALOGOWANYM userem (nie ufamy clientowi/callbackowi)
    const jwt=(req.headers.get('Authorization')||'').replace('Bearer ','');
    const u=createClient(SB_URL,ANON,{global:{headers:{Authorization:`Bearer ${jwt}`}}});
    const { data:{ user } }=await u.auth.getUser();
    if(!user) return J(401,{ok:false,error:'unauthorized'});
    const svc=createClient(SB_URL,SVCKEY);   // default OK dla legacy i sb_secret; NIE dodawać Authorization:'' — łamie legacy (42501)
    const { data: ath }=await svc.from('athletes').select('id').eq('user_id',user.id).maybeSingle();
    if(!ath) return J(404,{ok:false,error:'athlete_not_found'});

    // exchange code → access_token (form-encoded; TYLKO client_id/client_secret/code — potwierdzone realnym kodem prod, bez redirect_uri/grant_type)
    const form = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: String(code) });
    const tr = await fetch('https://intervals.icu/api/oauth/token', {
      method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body: form.toString() });
    if(!tr.ok) return J(200,{ok:false,error:'exchange_'+tr.status});
    const tok = await tr.json();
    const access_token = tok?.access_token;
    if(!access_token) return J(200,{ok:false,error:'no_access_token'});
    // E2: czy przyznano CALENDAR:WRITE — źródło prawdy = scope z odpowiedzi tokenowej (potwierdzone: intervals zwraca scope); brak pola → ufamy żądaniu
    const granted = String(tok?.scope || '').toUpperCase();
    const canWrite = granted ? granted.includes('CALENDAR:WRITE') : true;
    // status/display (wywołania API i tak przez athlete '0' = athleta tokenu); niech gate „połączono" ma wartość
    // ⚠️ intervals zwraca athlete.id JUŻ z prefiksem "i" (np. "i583138") → NIE doklejaj drugiego 'i' (bug "ii583138")
    const raw = tok?.athlete?.id;
    const icuAthId = (raw != null && String(raw) !== '')
      ? (String(raw).startsWith('i') ? String(raw) : ('i' + raw))
      : '0';

    // GUARD (anty-krzyżówka): to konto intervals już podłączone do INNEGO zawodnika → odrzuć, NIE zapisuj tokena
    if (icuAthId !== '0') {
      const { data: existing } = await svc.from('athletes')
        .select('id, full_name').eq('intervals_athlete_id', icuAthId).neq('id', ath.id).maybeSingle();
      if (existing) return J(200, { ok:false, error:'already_linked', owner: existing.full_name ?? null });
    }

    // zapis server-role: token do intervals_credentials (api_key:null → auth-mode wybierze Bearer), status do athletes
    // ⚠️ po OAuth: intervals_athlete_id = OAuth 'i'+numeryczne (spójne z paste-key "i"+cyfry); dla OAuth icuAth='0' i tak to ignoruje
    const { error: cErr } = await svc.from('intervals_credentials')
      .upsert({ athlete_id: ath.id, access_token, api_key: null, updated_at: new Date().toISOString() },
              { onConflict: 'athlete_id' });                                    // jawny PK-conflict → nadpisz row (nie duplikuj)
    if (cErr) return J(200,{ok:false,error:'store_'+cErr.message});
    await svc.from('athletes')
      .update({ intervals_athlete_id: icuAthId, intervals_connected_at: new Date().toISOString(), intervals_can_write: canWrite, intervals_token_dead_at: null })   // E3: świeży token = żywy → skasuj flagę martwego (fold w connect-update, 1 zapytanie)
      .eq('id', ath.id);

    // Ekran 2: best-effort licznik aktywności — czy intervals JUŻ ma treningi (podłączony Garmin?).
    // null gdy call padnie/zwlecze (timeout 3.5s) → NIE psuje połączenia (ok:true zostaje). OAuth → athlete '0'.
    let activities_count: number | null = null;
    try {
      const oldest = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
      const newest = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      const ar = await fetch(`https://intervals.icu/api/v1/athlete/0/activities?oldest=${oldest}&newest=${newest}`,
        { headers: { Authorization: 'Bearer ' + access_token }, signal: ctrl.signal });
      clearTimeout(timer);
      if (ar.ok) { const a = await ar.json(); activities_count = Array.isArray(a) ? a.length : null; }
    } catch (_) { activities_count = null; }

    return J(200,{ ok:true, athlete_name: tok?.athlete?.name ?? null, activities_count });
  } catch(e){ return J(500,{ok:false,error:(e as Error).message}); }
});