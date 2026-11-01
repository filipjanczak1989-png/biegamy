/* BLIZNA 85 (1.11.2026) — HASŁO: link „Zapomniałem hasła" prowadzi do formularza „Ustaw nowe hasło", a Profil ma „Zmień hasło".

   Zwiad 1.11: resetPasswordForEmail bez redirectTo → link z maila wracał na Site URL, supabase-js robił z hasha sesję,
   index.html od razu przekierowywał na zawodnik.html — człowiek lądował zalogowany, a hasło zostawało stare i nieznane
   (11 resetów od maja, 8 logowań z linku, 0 zmian hasła; w repo zero updateUser / PASSWORD_RECOVERY).

   Ryzyka:
   1) checkSession NIE przekierowuje przy ?reset=1 ani po PASSWORD_RECOVERY — najpierw nowe hasło, redirectUser dopiero po
      udanym updateUser (przebieg na prawdziwym kodzie index.html w vm).
   2) Reguła hasła w JEDNYM miejscu (sb.js): min. 8 znaków jak rejestracja, dwa pola równe, komunikaty po polsku;
      błąd reautoryzacji / brak sesji → „Zaloguj się ponownie i spróbuj jeszcze raz.".
   3) Hasło nigdy w URL, console, client_errors, insert — żadna linia z console/insert/location/replaceState nie dotyka pól hasła.
   4) redirectTo z origin (biegamy.run i run.biegamy.app), ten sam w index.html i login.html; Profil: ?open=haslo, tylko własny profil. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { zaladujSb, atrapaPrzegladarki, blokiSkryptow, zamrozTimery, stabilnyDom } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

/* index.html w vm: kod strony siedzi w DOMContentLoaded — łapiemy handler i odpalamy ręcznie; Supabase = atrapa z zapisem wywołań. */
function indexWVm({ search, session, updateUser }) {
  const ctx = atrapaPrzegladarki();
  const wywolania = { updateUser: [], reset: [] };
  const nasluchy = [];
  ctx.supabase.createClient = () => ({
    auth: {
      getSession: async () => ({ data: { session } }),
      getUser: async () => ({ data: { user: session && session.user } }),
      onAuthStateChange: (fn) => { nasluchy.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
      updateUser: async (a) => { wywolania.updateUser.push(a); return updateUser ? updateUser(a) : { data: { user: session.user }, error: null }; },
      resetPasswordForEmail: async (email, opts) => { wywolania.reset.push({ email, opts }); return { error: null }; },
      signOut: async () => ({}),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    channel: () => ({ on() { return this; }, subscribe() {} }), removeChannel() {},
  });
  ctx.location = { href: 'https://biegamy.run/index.html' + search, search, pathname: '/index.html', hostname: 'biegamy.run', origin: 'https://biegamy.run', assign() {}, replace() {}, reload() {} };
  ctx.history = { zapisy: [], replaceState(_s, _t, url) { this.zapisy.push(url); }, pushState() {} };
  const handlery = [];
  ctx.document.addEventListener = (ev, fn) => { if (ev === 'DOMContentLoaded') handlery.push(fn); };
  vm.createContext(ctx);
  zamrozTimery(ctx);
  const dom = stabilnyDom(ctx);
  const cicho = (kod, nazwa) => { const c = ctx.console; ctx.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} }; try { vm.runInContext(kod, ctx, { filename: nazwa }); } finally { ctx.console = c; } };
  cicho(czytaj('js/tekst.mjs'), 'js/tekst.mjs');
  cicho(czytaj('sb.js'), 'sb.js');
  blokiSkryptow('index.html').forEach((kod, i) => cicho(kod, `index.html#${i}`));
  const uruchom = async () => { for (const h of handlery) h(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); };
  const timery = async () => { const t = ctx.__timery.splice(0); for (const x of t) x.fn(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); };
  return { ctx, dom, wywolania, uruchom, timery, zdarzenie: (ev) => nasluchy.forEach((fn) => fn(ev, session)), nasluchy };
}
const SESJA = { user: { id: 'u1', email: 'x@y.z', user_metadata: {} }, access_token: 't' };

test('(2) sb.js: jedna reguła hasła — min. 8, równe pola, komunikaty po polsku; błąd reautoryzacji → „Zaloguj się ponownie…"', () => {
  const w = zaladujSb();
  assert.equal(w.walidujNoweHaslo('', ''), 'Wpisz nowe hasło w oba pola');
  assert.equal(w.walidujNoweHaslo('krotkie', 'krotkie'), 'Hasło musi mieć co najmniej 8 znaków');
  assert.equal(w.walidujNoweHaslo('dlugie-haslo-1', 'dlugie-haslo-2'), 'Hasła się różnią — wpisz to samo w oba pola');
  assert.equal(w.walidujNoweHaslo('dlugie-haslo-1', 'dlugie-haslo-1'), null);
  for (const e of [{ status: 401, message: 'x' }, { status: 403, message: 'x' }, { message: 'Auth session missing!' }, { message: 'Reauthentication needed' }, { message: 'JWT expired' }])
    assert.equal(w.komunikatBleduHasla(e), 'Zaloguj się ponownie i spróbuj jeszcze raz.', JSON.stringify(e));
  assert.equal(w.komunikatBleduHasla({ message: 'New password should be different from the old password.' }), 'Nowe hasło musi różnić się od starego.');
  assert.equal(w.komunikatBleduHasla({ message: 'Password should be at least 6 characters.' }), 'Hasło musi mieć co najmniej 8 znaków.');
  assert.equal(w.komunikatBleduHasla({ message: 'cokolwiek' }), 'Nie udało się zmienić hasła. Spróbuj jeszcze raz.');
  assert.equal(w.komunikatBleduHasla(null), 'Nie udało się zmienić hasła. Spróbuj jeszcze raz.');
  assert.match(czytaj('index.html'), /if \(password\.length < 8\)/, 'rejestracja: ten sam próg 8');
});

test('(1) index.html ?reset=1 z sesją: BEZ przekierowania, formularz widoczny; updateUser({password}) → dopiero redirectUser', async () => {
  const s = indexWVm({ search: '?reset=1', session: SESJA });
  await s.uruchom();
  assert.equal(s.ctx.location.href, 'https://biegamy.run/index.html?reset=1', 'checkSession nie przekierował');
  assert.equal(s.dom.daj('form-reset').style.display, 'block');
  assert.equal(s.dom.daj('form-login').style.display, 'none');
  s.dom.daj('reset-pass1').value = 'krotkie'; s.dom.daj('reset-pass2').value = 'krotkie';
  await s.ctx.setNewPassword();
  assert.equal(s.dom.daj('alert-box').textContent, 'Hasło musi mieć co najmniej 8 znaków');
  assert.equal(s.wywolania.updateUser.length, 0, 'walidacja przed wysyłką');
  s.dom.daj('reset-pass1').value = 'nowe-haslo-12'; s.dom.daj('reset-pass2').value = 'nowe-haslo-12';
  await s.ctx.setNewPassword();
  assert.equal(JSON.stringify(s.wywolania.updateUser), JSON.stringify([{ password: 'nowe-haslo-12' }]));
  assert.equal(s.dom.daj('reset-pass1').value, '', 'pola wyczyszczone');
  assert.ok(s.ctx.history.zapisy.includes('index.html'), '?reset=1 zdjęte z adresu');
  assert.equal(s.ctx.location.href, 'https://biegamy.run/index.html?reset=1', 'redirect dopiero po timerze');
  await s.timery();
  assert.equal(s.ctx.location.href, 'zawodnik.html', 'po udanym updateUser → redirectUser');
});

test('(1) PASSWORD_RECOVERY bez ?reset=1 (Supabase wróciło na goły Site URL) też zatrzymuje redirect; błąd 401 → „Zaloguj się ponownie…"; bez sesji → link wygasł', async () => {
  const s = indexWVm({ search: '', session: SESJA, updateUser: async () => ({ data: null, error: { status: 401, message: 'x' } }) });
  assert.ok(s.nasluchy.length >= 1, 'sb.js nasłuchuje od razu po createClient — zanim strona się zapisze');
  s.zdarzenie('PASSWORD_RECOVERY');   // zdarzenie PRZED DOMContentLoaded: łapie je tylko nasłuch z sb.js (flaga)
  assert.equal(s.ctx._bmPasswordRecovery, true);
  await s.uruchom();
  assert.equal(s.ctx.location.href, 'https://biegamy.run/index.html', 'zdarzenie przed checkSession → bez redirectu');
  assert.equal(s.dom.daj('form-reset').style.display, 'block');
  s.dom.daj('reset-pass1').value = 'nowe-haslo-12'; s.dom.daj('reset-pass2').value = 'nowe-haslo-12';
  await s.ctx.setNewPassword();
  assert.equal(s.dom.daj('alert-box').textContent, 'Zaloguj się ponownie i spróbuj jeszcze raz.');
  await s.timery();
  assert.equal(s.ctx.location.href, 'https://biegamy.run/index.html', 'po błędzie żadnego redirectu');
  const zwykly = indexWVm({ search: '', session: SESJA });
  await zwykly.uruchom();
  assert.equal(zwykly.ctx.location.href, 'zawodnik.html', 'zwykła sesja bez resetu → jak dotąd');
  const bez = indexWVm({ search: '?reset=1', session: null });
  await bez.uruchom();
  assert.equal(bez.dom.daj('form-reset').style.display, 'none');
  assert.match(bez.dom.daj('alert-box').textContent, /Link do resetu wygasł/);
  await bez.uruchom();
  assert.equal(bez.wywolania.updateUser.length, 0);
});

test('(4) forgotPassword: redirectTo z origin + /index.html?reset=1 — index.html (przebieg) i login.html (tekst)', async () => {
  const s = indexWVm({ search: '', session: null });
  await s.uruchom();
  s.dom.daj('login-email').value = 'test@biegamy.run';
  s.dom.daj('login-email').focus = () => {};
  await s.ctx.forgotPassword();
  assert.equal(JSON.stringify(s.wywolania.reset), JSON.stringify([{ email: 'test@biegamy.run', opts: { redirectTo: 'https://biegamy.run/index.html?reset=1' } }]));
  for (const p of ['index.html', 'login.html']) assert.match(czytaj(p), /resetPasswordForEmail\(email, \{ redirectTo: window\.location\.origin \+ '\/index\.html\?reset=1' \}\)/, p);
  assert.ok(!/resetPasswordForEmail\(email\)/.test(czytaj('login.html') + czytaj('index.html')), 'żadnego resetu bez redirectTo');
});

test('(4) profil.html: „Zmień hasło" przez updateUser z regułą z sb.js, tylko własny profil, ?open=haslo, Pokaż/Ukryj', () => {
  const p = czytaj('profil.html');
  assert.match(p, /id="haslo-section"[^>]*style="display:none/);
  assert.match(p, /_hs\.style\.display = _isOwnProfile \? 'block' : 'none'/);
  assert.match(p, /_open==='haslo' && _isOwnProfile/);
  assert.match(p, /const blad = window\.walidujNoweHaslo\(p1, p2\);\s*\n\s*if \(blad\) \{ pokazBlad\(blad\); return; \}/);
  assert.match(p, /const \{ error \} = await sb\.auth\.updateUser\(\{ password: p1 \}\);/);
  assert.match(p, /pokazBlad\(window\.komunikatBleduHasla\(error\)\)/);
  assert.match(p, /showToast\('Hasło zmienione\.'\)/);
  assert.match(p, /autocomplete="new-password" placeholder="Nowe hasło \(min\. 8 znaków\)"/);
  assert.equal((p.match(/togglePass\('haslo-(nowe|powtorz)', this\)/g) || []).length, 2, 'pokaż/ukryj przy obu polach');
  const i = czytaj('index.html');
  assert.equal((i.match(/togglePass\('reset-pass[12]', this\)/g) || []).length, 2);
  assert.ok(/<input type="password" id="reset-pass1"[^>]*autocomplete="new-password"/.test(i) && /<input type="password" id="reset-pass2"[^>]*autocomplete="new-password"/.test(i));
});

test('(3) hasło nigdy w URL, console, client_errors ani insert — linie z tymi wywołaniami nie dotykają pól hasła', () => {
  const POLA = /\b(p1|p2|password|haslo-nowe|haslo-powtorz|reset-pass1|reset-pass2|walidujNoweHaslo)\b/;
  for (const plik of ['index.html', 'login.html', 'profil.html', 'sb.js']) {
    const linie = czytaj(plik).split('\n');
    linie.forEach((l, n) => {
      const kanal = /console\.\w+\(|client_errors|\.insert\(|location\.href\s*=|location\.assign|replaceState\(|pushState\(|URLSearchParams\(|\?reset=1|fetch\(/.test(l);
      if (kanal && POLA.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l)) assert.fail(`${plik}:${n + 1} — pole hasła obok kanału wyjścia: ${l.trim().slice(0, 120)}`);
    });
  }
});
