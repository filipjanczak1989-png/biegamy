import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rozstrzygnijKolizje, zbudujWzbogacenie } from '../_shared/kolizja-importu.mjs';
import { wstawZOdzyskiem } from '../_shared/wstaw-z-odzyskiem.mjs';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const ANON   = 'sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY';   // publiczny (== sb.js:32) — literal przetrwa Disable legacy anon
const SVCKEY = Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;   // rotacja: nowy sb_secret ma priorytet, legacy fallback do czasu dezaktywacji

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
};
const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

// sekundy -> "H:MM:SS" / "MM:SS" (training_logs.duration to STRING-zegar, nie sekundy!)
function secToClock(sec: number): string {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
// pace "M:SS"/km (tylko bieg)
function paceStr(distM: number, sec: number): string | null {
  if (!distM || distM <= 0 || !sec) return null;
  const p = sec / (distM / 1000);
  const t = Math.round(p);   // round TOTAL sekund najpierw → koniec „4:60"
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
// E2 GŁĘBIA: gap (m/s) → "M:SS"/km. Carry-first (round total s najpierw) + guard v>0.3 jak paceFromV
// (activity-detail:35). ŚWIADOMY DUPLIKAT — kształt identyczny w intervals-webhook.
function gapToPace(v: number): string | null {
  if (!v || v <= 0.3) return null;
  const t = Math.round(1000 / v);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
// B1: ŚWIADOMY DUPLIKAT w intervals-sync i intervals-webhook (jak dawny TYPE_MAP).
//   Bieg -> typ z PLANU (trainings.type na dzień aktywności); nie-bieg -> 'Zastępczy'.
//   Nowy biegowy typ planu -> aktualizuj RUN_PLAN TU **oraz** w intervals-webhook.
const RUN_ACT = new Set(['Run', 'TrailRun', 'Treadmill', 'VirtualRun']);
// RUN_PLAN = mirror RUN_TYPES (sb.js), lowercase — match case-insensitive (km liczą się dalej, isRunType case-fold).
const RUN_PLAN = new Set(['spokojny', 'bieg spokojny', 'wybieganie', 'długi', 'tempo', 'progresja', 'interwały', 'start', 'wyścig', 'regeneracja']);
function typeFromPlan(planType: string | null): string {
  const t = String(planType || '').trim(); const lt = t.toLowerCase();
  if (!t || lt === 'odpoczynek') return 'Spokojny';        // brak planu / dzień wolny
  if (lt === 'bieg spokojny') return 'Spokojny';           // jedyny alias (Decyzja A) -> kanon ikon UI
  return RUN_PLAN.has(lt) ? t : 'Spokojny';                // biegowy plan -> ORYGINAŁ; nie-biegowy plan -> Spokojny
}
// TYPY-CROSS: pelna mapa aktywnosci intervals/Strava -> polskie typy (kazda aktywnosc = wlasny typ + effort)
// (bylo: wszystko nie-bieg -> 'Zastępczy' 1.5 — spacery Kasi pompowaly ATL do 153)
const ACT_MAP: Record<string, string> = {
  'Walk': 'Spacer', 'Hike': 'Spacer',
  'Ride': 'Rower', 'VirtualRide': 'Rower', 'MountainBikeRide': 'Rower', 'GravelRide': 'Rower', 'EBikeRide': 'Rower',
  'Swim': 'Pływanie', 'OpenWaterSwim': 'Pływanie',
  'WeightTraining': 'Siłownia', 'Workout': 'Siłownia', 'Crossfit': 'Siłownia',
  'Yoga': 'Joga', 'Pilates': 'Joga',
  'NordicSki': 'Narty', 'AlpineSki': 'Narty', 'BackcountrySki': 'Narty', 'RollerSki': 'Narty',
  'Rowing': 'Ergometr', 'VirtualRow': 'Ergometr',
  'Elliptical': 'Orbitrek', 'StairStepper': 'Orbitrek',
};
function typeForActivity(a: any, planType: string | null): string {
  if (RUN_ACT.has(a.type)) return typeFromPlan(planType);
  return ACT_MAP[String(a.type || '')] || 'Zastępczy';   // znany typ -> wlasna kategoria; nieznany -> Zastępczy
}

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
// E3 (#15): po UDANYM pullu token żyje → wyczyść flagę martwego tokena (jeśli wisiała,
// np. po re-connect / fałszywym alarmie). WHERE NOT NULL = zero-op w normalnym przypadku.
async function clearIntervalsDead(svc: any, athleteId: string) {
  try { await svc.from('athletes').update({ intervals_token_dead_at: null }).eq('id', athleteId).not('intervals_token_dead_at', 'is', null); } catch (_) { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { athlete_id, api_key, icu_athlete_id, full } = await req.json();
    if (!athlete_id) return J(400, { ok: false, error: 'no_athlete_id' });

    // --- auth: tylko właściciel tego athlete_id ---
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const u = createClient(SB_URL, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: { user } } = await u.auth.getUser();
    if (!user) return J(401, { ok: false, error: 'unauthorized' });

    const svc = createClient(SB_URL, SVCKEY);   // default OK dla legacy i sb_secret; NIE dodawać Authorization:'' — łamie legacy (42501)
    const { data: ath } = await svc.from('athletes')
      .select('id, user_id, intervals_athlete_id').eq('id', athlete_id).maybeSingle();
    if (!ath || ath.user_id !== user.id) return J(403, { ok: false, error: 'forbidden' });

    let icuId: string | null = ath.intervals_athlete_id;

    // --- CONNECT: waliduj klucz w intervals.icu PRZED zapisem (klucz nigdy nie wraca do klienta) ---
    // paste-key = tryb Basic; zerujemy access_token by auth-mode był jednoznaczny (Basic, nie OAuth)
    if (api_key && icu_athlete_id) {
      const auth = 'Basic ' + btoa('API_KEY:' + api_key);
      const r = await fetch(`https://intervals.icu/api/v1/athlete/${icu_athlete_id}`, { headers: { Authorization: auth } });
      if (!r.ok) return J(200, { ok: false, error: 'Niepoprawny Athlete ID lub klucz API' });
      await svc.from('intervals_credentials').upsert(
        { athlete_id, api_key, access_token: null, updated_at: new Date().toISOString() },
        { onConflict: 'athlete_id' },
      );
      await svc.from('athletes').update({
        intervals_athlete_id: String(icu_athlete_id),
        intervals_connected_at: new Date().toISOString(),
      }).eq('id', athlete_id);
      icuId = String(icu_athlete_id);
    }

    // --- AUTH-MODE (jeden flag, identyczny wzorzec jak intervals-hr-aggregate / activity-detail) ---
    // OAuth → Bearer access_token + athlete '0' (athleta tokenu); paste-key → Basic api_key + numeryczny icuId
    const { data: cred } = await svc.from('intervals_credentials')
      .select('api_key,access_token').eq('athlete_id', athlete_id).maybeSingle();
    if (!cred) return J(200, { ok: false, error: 'not_connected' });
    const useOAuth = !!cred.access_token;
    if (!useOAuth && !cred.api_key) return J(200, { ok: false, error: 'no_key' });
    if (!useOAuth && !icuId) return J(200, { ok: false, error: 'not_connected' });
    const authH  = useOAuth ? ('Bearer ' + cred.access_token) : ('Basic ' + btoa('API_KEY:' + cred.api_key));
    const icuAth = useOAuth ? '0' : icuId;

    // --- SYNC: 90 dni (zwykly) lub CALA HISTORIA (full=true, np. przy pierwszym polaczeniu/onboardingu) ---
    const _syncDays = full ? 365 * 8 : 90;   /* full = do 8 lat wstecz (praktyczny limit historii biegowej) */
    const oldest = new Date(Date.now() - _syncDays * 864e5).toISOString().slice(0, 10);
    const newest = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const ar = await fetch(
      `https://intervals.icu/api/v1/athlete/${icuAth}/activities?oldest=${oldest}&newest=${newest}`,
      { headers: { Authorization: authH } },
    );
    if (ar.status === 401) { await markIntervalsDead(svc, athlete_id); return J(200, { ok: false, error: 'intervals_api_401' }); }
    if (!ar.ok) return J(200, { ok: false, error: 'intervals_api_' + ar.status });
    await clearIntervalsDead(svc, athlete_id);   // E3: pull się udał → token żyje → skasuj flagę jeśli wisiała
    const acts = await ar.json();

    // --- dedup: pomiń już zaimportowane ---
    const { data: have } = await svc.from('training_logs')
      .select('external_id').eq('athlete_id', athlete_id).eq('external_source', 'intervals');
    const seen = new Set((have || []).map((r: { external_id: string }) => r.external_id));

    // #6: plany na okno 90 dni — JEDNO zapytanie, mapa po dacie (typ biegu z planu, nie z aktywności).
    const { data: plans } = await svc.from('trainings')
      .select('date, type').eq('athlete_id', athlete_id).gte('date', oldest).lte('date', newest);
    const planByDate = new Map((plans || []).map((p: { date: string; type: string }) => [p.date, p.type]));

    /* KOLIZJA Z WPISEM RECZNYM — regula w ../_shared/kolizja-importu.mjs.
       Do 18.08.2026 dedup patrzyl WYLACZNIE na wczesniejsze importy (external_id)
       i o pracy czlowieka nie wiedzial nic: kto prowadzil dzienniczek recznie,
       dostawal po podlaczeniu zegarka komplet duplikatow. Zmierzone: piec osob
       ma dni z obydwoma zrodlami, jedna z nich 62 dni od kwietnia. */
    const { data: reczne } = await svc.from('training_logs')
      .select('id, logged_at, distance_km, training_type, external_id, source')
      .eq('athlete_id', athlete_id)
      .gte('logged_at', oldest).lte('logged_at', newest + 'T23:59:59');
    const recznePoDacie = new Map<string, any[]>();
    for (const r of (reczne || [])) {
      const k = String(r.logged_at || '').slice(0, 10);
      if (!recznePoDacie.has(k)) recznePoDacie.set(k, []);
      recznePoDacie.get(k)!.push(r);
    }

    // ⚠️⚠️ NAZWY PÓL = ZAŁOŻENIA — potwierdzić realnym curlem (klasa signed_at) ⚠️⚠️
    const rows = (Array.isArray(acts) ? acts : [])
      .filter((a: any) => !seen.has(String(a.id)))
      .filter((a: any) => {                                    // filtr ogryzków start/stop: odrzuć < 60s LUB < 300m
        const sec = Number(a.moving_time || a.elapsed_time || 0);
        const m   = Number(a.distance || 0);
        return !(sec < 60 && m < 300);
      })
      .map((a: any) => {
        const distM = a.distance || 0;
        const sec = a.moving_time || a.elapsed_time || 0;
        const isRun = RUN_ACT.has(String(a.type || ''));
        const dateKey = String(a.start_date_local || a.start_date || '').slice(0, 10);   // lokalny klucz daty = trainings.date
        return {
          athlete_id,
          training_type: typeForActivity(a, planByDate.get(dateKey) ?? null),
          distance_km: distM ? Math.round(distM / 10) / 100 : null,
          duration: sec ? secToClock(sec) : null,
          pace: isRun ? paceStr(distM, sec) : null,
          heart_rate: a.average_heartrate ? Math.round(a.average_heartrate) : null,
          elevation_gain: a.total_elevation_gain ? Math.round(a.total_elevation_gain) : null,
          calories: a.calories ? Math.round(a.calories) : null,
          comment: a.name || null,
          logged_at: a.start_date_local || a.start_date,
          source: 'intervals',
          external_source: 'intervals',
          external_id: String(a.id),
          // E2 GŁĘBIA (nazwy potwierdzone dumpem 23.07): brak pola = null (bez wydmuszek).
          icu_load: a.icu_training_load != null ? Math.round(a.icu_training_load) : null,
          cadence: a.average_cadence != null ? Math.round(a.average_cadence) : null,
          gap_pace: gapToPace(a.gap),
          icu_intensity: a.icu_intensity != null ? Math.round(a.icu_intensity) : null,
        };
      });

    /* ROZDZIAL SCIEZEK: co jest nowe -> INSERT, co koliduje jednoznacznie
       z wpisem recznym -> UPDATE tamtego wiersza. Przy watpliwosci INSERT,
       bo duplikat jest widoczny, a bledne scalenie nie jest. */
    const doWstawienia: any[] = [];
    const doWzbogacenia: { cel: string; dane: any }[] = [];
    const zajeteCele = new Set<string>();
    for (const r of rows) {
      const dateKey = String(r.logged_at || '').slice(0, 10);
      const kandydaci = (recznePoDacie.get(dateKey) || [])
        .filter((k: any) => !zajeteCele.has(k.id));
      const d = rozstrzygnijKolizje(
        { distance_km: r.distance_km, isRun: r.pace != null },
        kandydaci);
      const cel = d && d.akcja === 'wzbogac' ? String(d.cel || '') : '';
      if (cel) {
        zajeteCele.add(cel);                      // jeden wpis reczny wchlania JEDNA aktywnosc
        doWzbogacenia.push({ cel, dane: zbudujWzbogacenie(r) });
      } else {
        doWstawienia.push(r);
      }
    }

    let synced = 0, wzbogacone = 0;
    let pominiete: { external_id: string; data: string; powod: string; powodCzytelny: string }[] = [];
    if (doWstawienia.length) {
      /* ⚠️ JEDEN ZLY WIERSZ ZABIJAL CALY IMPORT. Do 19.08.2026 bylo tu
         `if (error) return J(200,{ok:false})` — pojedyncza aktywnosc lamiaca
         constraint kasowala synchronizacje WSZYSTKICH pozostalych, a czlowiek
         dostawal `ok:false` bez wskazania winnej. Wzorzec byl niespojny z petla
         wzbogacania NIZEJ, ktora swiadomie nie przerywa.
         Strategia i pomiary — patrz `_shared/wstaw-z-odzyskiem.mjs`.
         ⚠️ RATE LIMIT INTERVALS NIE JEST TU CZYNNIKIEM: API intervals.icu wolamy
         RAZ, po liste aktywnosci (ok. linii 150). Odzysk dotyka wylacznie Supabase. */
      const w = await wstawZOdzyskiem(svc, 'training_logs', doWstawienia);
      synced = w.wstawione;
      pominiete = w.pominiete;
      /* Nie przeszlo NIC = awaria systemowa, nie „import z pominieciami".
         Oddajemy PIERWOTNY blad batcha — inaczej „zsynchronizowano 0 z 452"
         wygladaloby na spokojny wynik. */
      if (!w.ok) return J(200, { ok: false, error: w.bladBatcha, pominietych: pominiete.length });
    }
    for (const w of doWzbogacenia) {
      /* Blad wzbogacenia NIE przerywa syncu — gorszy skutek to brak telemetrii
         na jednym wpisie, a nie utrata calego importu. */
      const { error } = await svc.from('training_logs').update(w.dane).eq('id', w.cel);
      if (!error) wzbogacone++;
    }
    /* ═ E3-K3 WELLNESS: rura HRV/RHR/sen/waga (nazwy potwierdzone dumpem 23.07).
       Gate: intervals_can_wellness (flaga z probe'a K1b). 403 mimo flagi = cofnieta
       zgoda -> samonaprawa flagi. Bledy wellness NIGDY nie psuja syncu aktywnosci. ═ */
    let wellnessSynced = 0;
    try {
      const { data: athW } = await svc.from('athletes')
        .select('intervals_can_wellness').eq('id', athlete_id).maybeSingle();
      if (athW?.intervals_can_wellness === true) {
        const wOld = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
        const wNew = new Date().toISOString().slice(0, 10);
        const wr = await fetch(`https://intervals.icu/api/v1/athlete/${icuAth}/wellness?oldest=${wOld}&newest=${wNew}`,
          { headers: { Authorization: authH } });
        if (wr.status === 403) {
          await svc.from('athletes').update({ intervals_can_wellness: false }).eq('id', athlete_id);
        } else if (wr.ok) {
          const wdays = await wr.json();
          const wrows = (Array.isArray(wdays) ? wdays : [])
            .filter((d: any) => d && d.id)
            .map((d: any) => ({
              athlete_id,
              date: String(d.id).slice(0, 10),   /* wellness.id = data YYYY-MM-DD (dump) */
              resting_hr: d.restingHR != null ? Math.round(d.restingHR) : null,
              hrv: d.hrv != null ? Math.round(d.hrv) : null,
              sleep_secs: d.sleepSecs != null ? Math.round(d.sleepSecs) : null,
              weight: d.weight != null ? Math.round(d.weight * 100) / 100 : null,
              readiness: d.readiness != null ? Math.round(d.readiness) : null,        /* WELLNESS-2 */
              sleep_score: d.sleepScore != null ? Math.round(d.sleepScore) : null,
              vo2max: d.vo2max != null ? Math.round(d.vo2max * 10) / 10 : null,
              spo2: d.spO2 != null ? Math.round(d.spO2) : null,
              updated_at: new Date().toISOString(),
            }))
            .filter((r: any) => r.resting_hr != null || r.hrv != null || r.sleep_secs != null || r.weight != null
              || r.readiness != null || r.sleep_score != null || r.vo2max != null || r.spo2 != null);   /* WELLNESS-2 */
          if (wrows.length) {
            const { error: wErr } = await svc.from('wellness')
              .upsert(wrows, { onConflict: 'athlete_id,date' });
            if (!wErr) wellnessSynced = wrows.length;
          }
        }
      }
    } catch (_) { /* wellness best-effort */ }
    /* `pominiete` NIESIE POWOD, nie tylko liczbe — bez tego czlowiek wie, ze cos
       odpadlo, i nie ma jak sie dowiedziec co. Klient sklada z tego zdanie
       „zaimportowano 438 z 440, 2 pominiete". */
    return J(200, {
      ok: true, synced, wzbogacone, wellness: wellnessSynced,
      pominietych: pominiete.length,
      pominiete: pominiete.slice(0, 20),   // cap na odpowiedz; licznik zostaje pelny
    });
  } catch (e) {
    return J(500, { ok: false, error: (e as Error).message });
  }
});