// @ts-nocheck
// EF detect-moment — server-side detekcja momentów (KM6 bramka). Generowany przez tools/build-ef.js (NIE edytuj build/; edytuj ten template + js/silnik-momentu.js).
// Deploy: Dashboard. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto). Wołany przez DB trigger (pg_net) z Authorization: Bearer <service_role> (mirror trigger_send_push).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* __ENGINE_SRC__ */

const SM = globalThis.SilnikMomentu;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

function toSec(s) {
  if (!s) return null;
  const p = String(s).trim().split(':').map(Number);
  if (p.some(isNaN)) return null;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  if (p.length === 1) return p[0] * 60;
  return null;
}
const J = (obj, status = 200) => Response.json(obj, { status });

Deno.serve(async (req) => {
  // auth: tylko wywołujący z service_role (trigger przez vault) — klient nigdy nie ma service_role
  if (!SERVICE_ROLE || req.headers.get('authorization') !== 'Bearer ' + SERVICE_ROLE) return new Response('forbidden', { status: 401 });
  // silnik wbudowany — guard na zepsuty build (deploy-time, nie runtime)
  if (!SM || typeof SM.detect !== 'function') { console.error('[detect] SilnikMomentu missing — zły build-ef?'); return J({ detected: false, error: 'engine_missing' }); }

  let body; try { body = await req.json(); } catch { return J({ error: 'bad_body' }, 400); }
  const athlete_id = body && body.athlete_id;
  if (!athlete_id) return J({ error: 'no_athlete_id' }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: a } = await sb.from('athletes')
    .select('pb_5k,pb_10k,pb_half,pb_marathon,gender,date_of_birth,city,strongest_pb_dist')
    .eq('id', athlete_id).single();
  if (!a) return J({ error: 'athlete_not_found' }, 404);

  const { data: rows } = await sb.from('training_logs')
    .select('logged_at,distance_km,duration,training_type')
    .eq('athlete_id', athlete_id).not('training_type', 'like', '__badge__%')
    .order('logged_at', { ascending: true });

  const { data: hist } = await sb.from('delivered_moments')
    .select('type,evidence').eq('athlete_id', athlete_id).eq('status', 'approved');

  // ── snapshot-builder (LUSTRO browser buildSnapshot; is_run = SM.isRunType) ──
  const all = (rows || []).map((r) => ({
    logged_at: r.logged_at,
    distance_km: parseFloat(r.distance_km) || 0,
    duration_s: toSec(r.duration),
    training_type: r.training_type,
    is_run: SM.isRunType(r.training_type),
  }));
  if (!all.length) return J({ detected: false, reason: 'no_logs' });

  const since90 = new Date(); since90.setDate(since90.getDate() - 90);
  const logs = all.filter((l) => new Date(l.logged_at) >= since90);
  const rok = new Date().getFullYear();
  const yearStartMs = new Date(rok, 0, 1).getTime();
  const suma_roczna_km = Math.round(all.reduce((s, l) => s + (new Date(l.logged_at).getTime() >= yearStartMs && l.is_run ? l.distance_km : 0), 0) * 10) / 10;
  const pbs = { '5k': toSec(a.pb_5k), '10k': toSec(a.pb_10k), 'half': toSec(a.pb_half), 'marathon': toSec(a.pb_marathon) };
  const newLog = all[all.length - 1];
  const today = String(newLog.logged_at).slice(0, 10);
  let wiek = null;
  if (a.date_of_birth) wiek = Math.floor((Date.now() - new Date(a.date_of_birth).getTime()) / (365.25 * 86400000));
  const historia = (hist || []).map((h) => ({ type: h.type, evidence: h.evidence }));

  const snap = {
    newLog, logs, logs_all: all, pbs, today, historia,
    gender: a.gender || null, wiek, suma_roczna_km, rok,
    start_miasto: a.city || null, ostatni_lider: a.strongest_pb_dist || null,
  };

  // detect (najmocniejsza czyta snap.ostatni_lider = stary lider, zamrożony)
  const moment = SM.detect(snap);

  // ZAWSZE: persyst lidera (ożywia najmocniejszą) — tylko gdy zmiana, mniej zapisów
  const lider = SM._najmocniejszaLider(snap);
  if (lider && lider !== a.strongest_pb_dist) {
    await sb.from('athletes').update({ strongest_pb_dist: lider }).eq('id', athlete_id);
  }

  if (!moment) return J({ detected: false });

  // dedup double-guard: identyczny pending tego typu już czeka? (np. 2 logi tego samego dnia)
  const { data: pend } = await sb.from('delivered_moments')
    .select('id,evidence').eq('athlete_id', athlete_id).eq('status', 'pending').eq('type', moment.type);
  const dup = (pend || []).some((p) => JSON.stringify(p.evidence) === JSON.stringify(moment.evidence));
  if (dup) return J({ detected: false, reason: 'dup_pending' });

  // payload = moment − {type, evidence}; browser rekonstruuje {type, evidence, ...payload}
  const payload = Object.assign({}, moment); delete payload.type; delete payload.evidence;
  const { error: insErr } = await sb.from('delivered_moments')
    .insert({ athlete_id, type: moment.type, evidence: moment.evidence, payload, status: 'pending' });
  if (insErr) { console.error('[detect] insert err', insErr.message); return J({ detected: false, error: 'insert_failed' }); }

  return J({ detected: true, type: moment.type });
});
