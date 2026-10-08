#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// DANE SYNTETYCZNE DLA PROJEKTU TESTOWEGO (08.10.2026, docs/srodowisko-testowe.md)
//
// Trener + 2 zawodników + plan bieżącego tygodnia + logi + wiadomość + start z zapisem — tyle, żeby
// „Dziś", Plan, panel trenera i offline miały co pokazać. ZERO danych prawdziwych osób: imiona wymyślone,
// e-maile w domenie .invalid (RFC 2606 — z definicji nie przyjmuje poczty).
//
// Działa na PROJEKCIE TESTOWYM kluczem service (omija RLS) — klucz tylko w zmiennej środowiska sesji:
//   TEST_SB_URL=https://<TEST_REF>.supabase.co  TEST_SERVICE_KEY=…  [TEST_HASLO=…]  node tools/test-env/seed.js
// Odmawia pracy na adresie PROD. Powtarzalny: konta istniejące są używane ponownie, plan/logi/wiadomości
// kont testowych są kasowane i wstawiane od nowa.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const PROD_REF = 'afqojgkaveykxbltxzwm';
const URL_ = process.env.TEST_SB_URL || '';
const KEY = process.env.TEST_SERVICE_KEY || '';
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(URL_) || !KEY) { console.error('Ustaw TEST_SB_URL (https://<ref>.supabase.co) i TEST_SERVICE_KEY.'); process.exit(2); }
if (URL_.includes(PROD_REF)) { console.error('STOP: TEST_SB_URL wskazuje PRODUKCJĘ.'); process.exit(1); }
const HASLO = process.env.TEST_HASLO || ('Test-' + require('crypto').randomBytes(6).toString('hex'));

const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
async function api(metoda, sciezka, cialo, extra) {
  const r = await fetch(URL_ + sciezka, { method: metoda, headers: Object.assign({}, H, extra || {}), body: cialo ? JSON.stringify(cialo) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(metoda + ' ' + sciezka + ' → ' + r.status + ' ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}
const rest = (m, tabela, cialo, q) => api(m, '/rest/v1/' + tabela + (q || ''), cialo, { Prefer: 'return=representation' });

async function konto(email, imie, rola) {
  try {
    const u = await api('POST', '/auth/v1/admin/users', { email, password: HASLO, email_confirm: true, user_metadata: { full_name: imie, role: rola } });
    return u.id;
  } catch (e) {
    if (!/already|exists|registered|422/.test(e.message)) throw e;
    const lista = await api('GET', '/auth/v1/admin/users?per_page=200');
    const u = (lista.users || []).find((x) => x.email === email);
    if (!u) throw e;
    await api('PUT', '/auth/v1/admin/users/' + u.id, { password: HASLO });
    return u.id;
  }
}
const dzien = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv', { timeZone: 'Europe/Warsaw' }); };
const poniedzialek = () => { const d = new Date(); return -((d.getDay() + 6) % 7); };

(async () => {
  const trenerUid = await konto('trener@biegamy-test.invalid', 'Trener Testowy', 'coach');
  const z1Uid = await konto('ala@biegamy-test.invalid', 'Ala Testowa', 'athlete');
  const z2Uid = await konto('bartek@biegamy-test.invalid', 'Bartek Testowy', 'athlete');

  await rest('POST', 'coaches', { id: trenerUid, full_name: 'Trener Testowy', specialization: 'Dane syntetyczne' }, '?on_conflict=id');
  const teraz = new Date().toISOString();
  const athletes = [];
  for (const [uid, imie, email] of [[z1Uid, 'Ala Testowa', 'ala@biegamy-test.invalid'], [z2Uid, 'Bartek Testowy', 'bartek@biegamy-test.invalid']]) {
    const ist = await rest('GET', 'athletes', null, '?user_id=eq.' + uid + '&select=id');
    const wiersz = { user_id: uid, full_name: imie, email, coach_id: trenerUid, active: true, onboarding_done: true, terms_accepted_at: teraz, city: 'Testowo' };
    const a = ist.length ? (await rest('PATCH', 'athletes', wiersz, '?id=eq.' + ist[0].id))[0] : (await rest('POST', 'athletes', wiersz))[0];
    athletes.push(a.id);
  }
  const [a1, a2] = athletes;
  for (const a of athletes) {
    for (const t of ['training_logs', 'trainings', 'messages']) await rest('DELETE', t, null, '?athlete_id=eq.' + a);
  }
  // plan bieżącego tygodnia pn–nd + 13 dni naprzód (Plan offline: tydzień z „postep" + dziś..+13)
  const p = poniedzialek();
  const PLAN = [[0, 'Spokojny', 8], [1, 'Interwały', 7], [3, 'Tempo', 9], [5, 'Wybieganie', 16], [7, 'Spokojny', 8], [9, 'Tempo', 10], [12, 'Wybieganie', 18]];
  await rest('POST', 'trainings', PLAN.map(([n, typ, km]) => ({ athlete_id: a1, coach_id: trenerUid, date: dzien(p + n), type: typ, distance_km: km,
    pace: typ === 'Tempo' ? '4:50' : typ === 'Interwały' ? '4:20' : '5:40', description: 'Plan syntetyczny — ' + typ, status: dzien(p + n) < dzien(0) ? 'done' : 'planned', plan_source: 'coach' })));
  await rest('POST', 'trainings', [[p + 2, 'Spokojny', 6], [p + 4, 'Tempo', 7]].map(([n, typ, km]) => ({ athlete_id: a2, coach_id: trenerUid, date: dzien(n), type: typ, distance_km: km,
    pace: '5:30', description: 'Plan syntetyczny', status: 'planned', plan_source: 'coach' })));
  // logi z ostatnich dni (lista „Dziś", pierścień tygodnia)
  const LOGI = [[1, 'Spokojny', 8.2, '0:46:30', '5:40'], [2, 'Interwały', 7.1, '0:36:10', '5:05'], [4, 'Tempo', 9.0, '0:43:30', '4:50'], [6, 'Wybieganie', 15.4, '1:31:00', '5:54'], [8, 'Spokojny', 6.0, '0:34:00', '5:40']];
  await rest('POST', 'training_logs', LOGI.map(([n, typ, km, czas, tempo]) => ({ athlete_id: a1, training_type: typ, distance_km: km, duration: czas, pace: tempo,
    feel: 'dobrze', comment: 'Log syntetyczny', source: 'manual', logged_at: new Date(Date.now() - n * 86400000).toISOString() })));
  await rest('POST', 'messages', { athlete_id: a1, sender: 'coach', body: 'Wiadomość testowa od trenera — środowisko testowe.' });
  // start z zapisem (zakładka Starty, races.html)
  const bieg = await rest('POST', 'races', { name: 'Bieg Testowy 10 km', date: dzien(30), distance_km: 10, city: 'Testowo', status: 'approved', added_by: a1 });
  await rest('POST', 'race_signups', { race_id: bieg[0].id, athlete_id: a1 }, '?on_conflict=race_id,athlete_id');

  console.log('✓ dane syntetyczne w ' + URL_);
  console.log('  konta (hasło wspólne, NIE zapisuj w repo): ' + HASLO);
  console.log('    trener@biegamy-test.invalid  · ala@biegamy-test.invalid (plan + logi)  · bartek@biegamy-test.invalid');
})().catch((e) => { console.error('BŁĄD: ' + e.message); process.exit(1); });
