// Atrapy dla testów okienka (blizna-64*): Supabase w pamięci (filtry jak w PostgREST, tylko używane przez okienko),
// baza z danymi DWÓCH osób, okienko_log z insertem, Gemini generateContent z kolejką odpowiedzi.
'use strict';

function atrapa(tabele) {
  const zapytania = [];
  function from(nazwa) {
    const f = [], st = { nazwa, filtry: f, zapis: false };
    zapytania.push(st);
    let porz = null, lim = null, licz = false;
    const q = {
      select(_k, o) { licz = !!(o && o.count); return q; },
      eq(k, v) { f.push((r) => r[k] === v); st[k] = v; return q; },
      gte(k, v) { f.push((r) => String(r[k]) >= String(v)); return q; },
      lte(k, v) { f.push((r) => String(r[k]) <= String(v)); return q; },
      lt(k, v) { f.push((r) => String(r[k]) < String(v)); return q; },
      in(k, v) { f.push((r) => v.includes(r[k])); return q; },
      not(k, op, v) { const re = new RegExp('^' + v.replace(/%/g, '.*') + '$'); f.push((r) => !re.test(String(r[k]))); return q; },
      order(k, o) { porz = [k, o && o.ascending === false ? -1 : 1]; return q; },
      limit(n) { lim = n; return q; },
      insert(w) { st.zapis = true; (tabele[nazwa] = tabele[nazwa] || []).push(Object.assign({ kiedy: new Date().toISOString() }, w)); return Promise.resolve({ error: null }); },
      upsert(w, o) {   // jak PostgREST: onConflict = kolumna unikalna; ignoreDuplicates → istniejący zostaje
        st.zapis = true;
        const t = (tabele[nazwa] = tabele[nazwa] || []), k = o && o.onConflict;
        for (const r of Array.isArray(w) ? w : [w]) {
          const i = k ? t.findIndex((x) => x[k] === r[k]) : -1;
          if (i < 0) t.push(Object.assign({}, r)); else if (!(o && o.ignoreDuplicates)) t[i] = Object.assign({}, r);
        }
        return Promise.resolve({ error: null });
      },
      maybeSingle() { const w = wynik(); return Promise.resolve({ data: w.data[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve(wynik()).then(res, rej); },
    };
    function wynik() {
      let d = (tabele[nazwa] || []).filter((r) => f.every((p) => p(r)));
      const count = d.length;
      if (porz) d = d.slice().sort((a, b) => (String(a[porz[0]]) < String(b[porz[0]]) ? -1 : 1) * porz[1]);
      if (lim != null) d = d.slice(0, lim);
      return { data: d, error: null, count: licz ? count : null };
    }
    return q;
  }
  return { from, zapytania, tabele };
}

const JA = 'ath-ja', OBCY = 'ath-obcy';
const TERAZ = new Date('2026-11-01T10:00:00Z');   // niedziela
function baza() {
  return {
    trainings: [
      { athlete_id: JA, date: '2026-11-01', type: 'Spokojny', description: 'luźno', distance_km: 8, duration_min: 50, pace: '6:15', status: 'planned' },
      { athlete_id: OBCY, date: '2026-11-01', type: 'Wybieganie', description: 'OBCY', distance_km: 25, status: 'planned' },
    ],
    training_logs: [
      { athlete_id: JA, logged_at: '2026-10-27T07:00:00Z', training_type: 'Spokojny', distance_km: '10.2', duration: '1:00:00', pace: '5:53' },
      { athlete_id: OBCY, logged_at: '2026-10-28T07:00:00Z', training_type: 'Spokojny', distance_km: '500' },
    ],
    athletes: [
      { id: JA, race_goals: JSON.stringify([{ name: 'Bieg Niepodległości', date: '2026-11-11', race_id: 'r1' }]) },
      { id: OBCY, race_goals: JSON.stringify([{ name: 'OBCY START', date: '2026-11-05' }]) },
    ],
    races: [{ id: 'r1', city: 'Warszawa' }],
    achievements: [{ athlete_id: JA, badge_id: 'pierwszy_bieg', earned_at: '2026-10-01T10:00:00Z' }],
  };
}

function atrapaGemini(odpowiedzi) {
  const zadania = [];
  const fetchFn = async (url, init) => {
    zadania.push({ url, cialo: JSON.parse(init.body) });
    const o = odpowiedzi.shift();
    if (o && o.status) return { ok: false, status: o.status, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => o };
  };
  return { fetchFn, zadania };
}
const fc = (name, args = {}) => ({ candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 12 } });
const txt = (o) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }], usageMetadata: { promptTokenCount: 1100, candidatesTokenCount: 60 } });

module.exports = { atrapa, baza, JA, OBCY, TERAZ, atrapaGemini, fc, txt };
