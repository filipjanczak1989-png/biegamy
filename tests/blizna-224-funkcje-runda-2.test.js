/* BLIZNA 224 (12.11.2026, audyt 11.2026 poz. 2, 5, 7, 8): funkcje Edge po rundzie 2 — testy na źródle (Deno nie uruchamiamy w Node).
   - delete-account: adresy wpisywane przez użytkownika (avatar_url, attachment_url, image_url) kasują wyłącznie ścieżki należące do konta;
   - send-push: notification_id tylko z nagłówkiem systemowym (hook);
   - intervals-webhook: pusty albo krótki sekret = odrzucenie, nie „otwarte”;
   - intervals-activity-detail: activity_id w kształcie identyfikatora, odświeżenie z intervals tylko dla właściciela i trenera;
   - firma-zgloszenie: IP do limitu z OSTATNIEGO elementu x-forwarded-for (pierwszy dopisuje klient). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('delete-account: filtr własności ścieżek z adresów użytkownika; ankiety (blood) bez filtra', () => {
  const s = czytaj('supabase/functions/delete-account/index.ts');
  assert.match(s, /const nalezyDoKonta = \(path: string\) =>/);
  assert.match(s, /refs\.push\(\{ raw: ath\.avatar_url, hint: 'biegamy-assets', wlasne: true \}\)/);
  assert.match(s, /refs\.push\(\{ raw: l\.attachment_url, hint: 'training-screenshots', wlasne: true \}\)/);
  assert.match(s, /refs\.push\(\{ raw: p\.image_url, hint: 'profile-posts', wlasne: true \}\)/);
  assert.match(s, /refs\.push\(\{ raw: p, hint: 'training-screenshots' \}\)/, 'blood: bez flagi wlasne');
  assert.match(s, /return o && \(!r\.wlasne \|\| nalezyDoKonta\(o\.path\)\) \? o : null;/);
  /* sama funkcja uruchomiona w Node: */
  const kod = s.slice(s.indexOf('const nalezyDoKonta = (path: string) =>'), s.indexOf('const objects = refs')).replace(': string', '');   // TS → JS: tylko adnotacja typu
  const ctx = { athleteId: 'A1', uid: 'U1' }; vm.runInNewContext(kod + '\nthis.f = nalezyDoKonta;', ctx);
  assert.equal(ctx.f('avatars/A1.webp'), true);
  assert.equal(ctx.f('A1/voice_1.webm'), true);
  assert.equal(ctx.f('U1/1700.jpg'), true);
  assert.equal(ctx.f('avatars/B2.webp'), false, 'cudzy avatar');
  assert.equal(ctx.f('B2/zrzut.png'), false, 'cudzy folder');
  assert.equal(ctx.f('avatars/A1x.webp'), false, 'prefiks to nie id');
  assert.equal(ctx.f('B2/A1/x.png'), false, 'id w środku ścieżki NIE wystarcza (prefiks, decyzja 11.11)');
  assert.equal(ctx.f('B2/avatars/A1.webp'), false, 'avatar pod cudzym folderem');
  assert.equal(ctx.f('avatars/A1.webp/x'), false, 'avatar to plik, nie folder');
  assert.equal(ctx.f('/A1/voice_1.webm'), true, 'wiodący ukośnik obcięty');
  assert.equal(ctx.f(''), false);
});

test('send-push: notification_id honorowane tylko z nagłówkiem systemowym', () => {
  const s = czytaj('supabase/functions/send-push/index.ts');
  assert.match(s, /if \(!_isSystem\) return await _reject\("notification_id_requires_hook"\);/);
});

test('intervals-webhook: brak / krótki sekret w env = 401, porównanie dopiero przy ustawionym', () => {
  const s = czytaj('supabase/functions/intervals-webhook/index.ts');
  assert.match(s, /!HOOK_SECRET \|\| HOOK_SECRET\.length < 16 \|\| !body \|\| typeof body\.secret !== 'string' \|\| !body\.secret \|\| body\.secret !== HOOK_SECRET/);
});

test('intervals-activity-detail: activity_id tylko w kształcie identyfikatora; refresh tylko właściciel/trener', () => {
  const s = czytaj('supabase/functions/intervals-activity-detail/index.ts');
  const m = /if\(typeof activity_id!=='string' \|\| !(\/[^/]+\/)\.test\(activity_id\)\) return J\(400,\{ok:false,error:'bad activity_id'\}\);/.exec(s);
  assert.ok(m, 'walidacja activity_id');
  const re = new Function('return ' + m[1])();
  for (const ok of ['i12345678', '12345678', 'I1']) assert.ok(re.test(ok), ok);
  for (const zle of ['../athlete', 'i123/streams', '1?x=1', 'i1 ', '', 'ab12', 'i123456789012345']) assert.ok(!re.test(zle), zle);
  assert.match(s, /const refreshOk = refresh && \(isOwner \|\| isCoach\);/);
  assert.match(s, /cached\.raw_data\.v===PAYLOAD_V && !refreshOk\)/);
  assert.ok(s.indexOf('const refreshOk') > s.indexOf('const isCoach'), 'refreshOk liczony po ustaleniu ról');
  assert.doesNotMatch(s, /PAYLOAD_V && !refresh\)/, 'stary warunek bez roli zniknął');
});

test('firma-zgloszenie: IP z ostatniego elementu x-forwarded-for', () => {
  const s = czytaj('supabase/functions/firma-zgloszenie/index.ts');
  assert.match(s, /const xff = \(req\.headers\.get\("x-forwarded-for"\) \|\| ""\)\.split\(","\)\.map\(\(s\) => s\.trim\(\)\)\.filter\(Boolean\);/);
  assert.match(s, /const ip = xff\[xff\.length - 1\] \|\| req\.headers\.get\("x-real-ip"\) \|\| "brak";/);
  assert.doesNotMatch(s, /split\(","\)\[0\]/);
});
