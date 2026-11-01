/* BLIZNA 91 (1.11.2026, zaległość „push_subscriptions 403 na współdzielonym urządzeniu").

   Przyczyna (odtworzona w bazie, transakcja cofnięta): `endpoint` = przeglądarka, UNIQUE. Druga osoba na tym samym
   urządzeniu robi upsert(onConflict endpoint) → konflikt z wierszem PIERWSZEJ → gałąź UPDATE łamie push_subs_update_own
   → 42501 „new row violates row-level security policy (USING expression)" = HTTP 403. Błąd szedł tylko do console.warn
   (client_errors: 0 wpisów), a powiadomienia pierwszej osoby dalej przychodziły na urządzenie drugiej.
   Poprawka bez migracji: 42501 → wypisz starą subskrypcję, załóż nową, zapisz jako swoją; wylogowanie usuwa własną. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const sub = (ep) => ({ endpoint: ep, wypisana: false, toJSON() { return { endpoint: ep, keys: { p256dh: 'p-' + ep, auth: 'a-' + ep } }; }, async unsubscribe() { this.wypisana = true; return true; } });

function srodowisko(bledy) {
  const ctx = zaladujSb();
  const zapisy = [];
  ctx.sb = { from: () => ({ upsert: async (w, o) => { zapisy.push({ w, o }); return { error: bledy.shift() || null }; } }) };
  ctx.VAPID_PUBLIC_KEY = 'BAAA';
  ctx.atob = (b) => Buffer.from(b, 'base64').toString('binary');   // przeglądarka ma atob; atrapa nie
  const nowe = [];
  const reg = { pushManager: { subscribe: async () => { const s = sub('https://push.example/nowy-' + (nowe.length + 1)); nowe.push(s); return s; } } };
  return { ctx, zapisy, reg, nowe };
}

test('42501 (cudzy endpoint na tym urządzeniu) → stara subskrypcja wypisana, nowa zapisana jako własna', async () => {
  const s = srodowisko([{ code: '42501', message: 'new row violates row-level security policy (USING expression)' }]);
  const stara = sub('https://push.example/stary');
  const r = await s.ctx._zapiszSubskrypcje(s.reg, stara, 'ath-B');
  assert.equal(r.error, null); assert.equal(r.przejete, true);
  assert.ok(stara.wypisana, 'stara subskrypcja wypisana z przeglądarki');
  assert.equal(s.zapisy.length, 2);
  assert.equal(s.zapisy[0].w.endpoint, 'https://push.example/stary');
  assert.equal(JSON.stringify(s.zapisy[1].w), JSON.stringify({ athlete_id: 'ath-B', endpoint: 'https://push.example/nowy-1', p256dh: 'p-https://push.example/nowy-1', auth: 'a-https://push.example/nowy-1', user_agent: 'node-test' }));
  assert.equal(s.zapisy[1].o.onConflict, 'endpoint');
});

test('inne błędy nie przejmują urządzenia; sukces od razu — jeden zapis; 403 też rozpoznane', async () => {
  const ok = srodowisko([]);
  const s1 = sub('https://push.example/moj');
  assert.equal((await ok.ctx._zapiszSubskrypcje(ok.reg, s1, 'ath-A', { last_used_at: 'T' })).przejete, false);
  assert.equal(ok.zapisy.length, 1); assert.equal(ok.zapisy[0].w.last_used_at, 'T'); assert.ok(!s1.wypisana);
  const inny = srodowisko([{ code: '23505', message: 'duplicate' }]);
  const s2 = sub('https://push.example/x');
  const r = await inny.ctx._zapiszSubskrypcje(inny.reg, s2, 'ath-A');
  assert.equal(r.error.code, '23505'); assert.ok(!s2.wypisana); assert.equal(inny.nowe.length, 0);
  const st = srodowisko([{ status: 403, message: 'Forbidden' }]);
  assert.equal((await st.ctx._zapiszSubskrypcje(st.reg, sub('https://push.example/y'), 'ath-A')).przejete, true);
});

test('subscribeToPush i reconcile używają pomocnika; reconcile zgłasza nieudany zapis do client_errors', () => {
  const sb = czytaj('sb.js');
  assert.match(sb, /const \{ error \} = await _zapiszSubskrypcje\(reg, sub, athleteId\);/);
  assert.match(sb, /const \{ error, przejete \} = await _zapiszSubskrypcje\(reg, sub, athleteId, \{ last_used_at: new Date\(\)\.toISOString\(\) \}\);/);
  assert.match(sb, /window\.zglosNieudanyZapis\('upsert', 'push_subscriptions', error\)/);
  assert.equal((sb.match(/from\('push_subscriptions'\)\.upsert\(/g) || []).length, 2, 'upsert tylko w pomocniku (pierwsza próba + po przejęciu)');
});

test('wylogowanie (zawodnik, profil, trener): najpierw unsubscribeFromPush (sesja jeszcze ważna), potem signOut', () => {
  for (const p of ['zawodnik.html', 'profil.html', 'trener.html']) {
    const h = czytaj(p);
    const i = h.indexOf('async function logout() {');
    const ciało = h.slice(i, h.indexOf('\n}\n', i));
    const u = ciało.indexOf('window.unsubscribeFromPush()'), s = ciało.indexOf('sb.auth.signOut()');
    assert.ok(u > 0 && s > u, p + ': unsubscribe przed signOut');
  }
});
