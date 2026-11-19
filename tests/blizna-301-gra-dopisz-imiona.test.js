/* BLIZNA 301 / 19.11 (produkcja): rankingi w gra.html („BiegaMy: Wyzwanie”) nie działały od 12.11 u wszystkich graczy.
   Commit 8e491d0b (12.11, cudze profile przez public_athletes) wstawił pomocnika `async function _dopiszImiona` DO ŚRODKA initUser,
   a wołają go loadGlobalLeaderboard i loadFriendsLeaderboard — obie na poziomie skryptu, więc nazwy nie widziały:
   ranking globalny pokazywał „Nie udało się załadować rankingu globalnego”, ranking znajomych zostawał na „Ładowanie...”.
   client_errors 13–19.11: 6 wpisów, 4 konta. Ten sam błąd co races.html (blizna-300); znalazł go skaner zasięgu (blizna-302).
   Poprawka: pomocnik na poziomie skryptu, treść bez zmian. Test ładuje PRAWDZIWE skrypty gra.html i woła oba rankingi. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { zaladujSb, zamrozTimery, blokiSkryptow, stabilnyDom } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');

/* Atrapa Supabase: from(tabela) z łańcuchem jak w supabase-js; wynik z `dane[tabela](filtry)`. Bez sesji initUser od razu wraca (przekierowanie). */
function strona(dane) {
  const ctx = zamrozTimery(zaladujSb()), zapytania = [];
  const sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }), getUser: () => Promise.resolve({ data: { user: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {},
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: (t) => {
      const q = { t, in: {}, eq: {} }; zapytania.push(q);
      const wynik = () => Promise.resolve({ data: dane[t] ? dane[t](q) : [], error: null });
      const c = { select: () => c, eq: (k, v) => { q.eq[k] = v; return c; }, in: (k, v) => { q.in[k] = v; return c; }, gte: () => c, lte: () => c, or: () => c, order: () => c, limit: () => c,
        insert: () => c, update: () => c, upsert: () => c,
        maybeSingle: () => wynik().then((r) => ({ data: (r.data || [])[0] || null, error: null })), single: () => wynik().then((r) => ({ data: (r.data || [])[0] || null, error: null })),
        then: (a, b) => wynik().then(a, b) };
      return c;
    },
  };
  ctx.sb = sb; ctx.window.sb = sb; ctx.supabase = ctx.supabase || { createClient: () => sb };
  const dom = stabilnyDom(ctx);
  const cisza = ctx.console; ctx.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
  try { blokiSkryptow('gra.html').forEach((k, i) => { try { vm.runInContext(k, ctx, { filename: 'gra.html#' + i }); } catch (e) { /* atrapa nie ma canvas/audio: start gry może się wywrócić, funkcje rankingu są już zadeklarowane */ } }); }
  finally { ctx.console = cisza; }
  return { ctx, dom, zapytania, wartosc: (w) => vm.runInContext(w, ctx) };
}
const wgId = (wiersze, pole) => (q) => wiersze.filter((w) => (!q.in[pole] || q.in[pole].includes(w[pole])) && (!q.eq[pole] || q.eq[pole] === w[pole]));
const DANE = {
  game_scores: wgId([{ athlete_id: 'a7', score: 900, distance: 3 }, { athlete_id: 'a1', score: 800, distance: 2 }, { athlete_id: 'a8', score: 700, distance: 1 }, { athlete_id: 'a7', score: 500, distance: 1 }], 'athlete_id'),
  public_athletes: wgId([{ id: 'a7', full_name: 'Ola' }], 'id'),
  athletes: wgId([{ id: 'a1', full_name: 'Ja Sam' }], 'id'),
  friendships: () => [{ requester_id: 'a1', addressee_id: 'a7' }],
};
const tekst = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('ranking globalny: imiona z widoku publicznego, własne z tabeli, profil prywatny „Biegacz”; bez „Nie udało się”', async () => {
  const s = strona(DANE);
  s.wartosc('_athleteId = "a1";');
  await s.ctx.loadGlobalLeaderboard();   // przed poprawką: ReferenceError w środku, złapany → „Nie udało się załadować rankingu globalnego.”
  const t = tekst(s.dom.daj('lb-card-global').innerHTML);
  assert.doesNotMatch(t, /Nie udało się/, t);
  assert.equal(t, '1 Ola 900 2 Ja Sam (Ty) 800 3 Biegacz 700', 'kolejność i imiona, każdy raz (najlepszy wynik)');
});

test('ranking znajomych: nie rzuca, nie wisi na „Ładowanie...”, imiona jak w globalnym', async () => {
  const s = strona(DANE);
  s.wartosc('_athleteId = "a1";');
  await s.ctx.loadFriendsLeaderboard();   // przed poprawką: ReferenceError (nieobsłużone odrzucenie), karta zostawała na „Ładowanie...”
  const t = tekst(s.dom.daj('lb-card').innerHTML);
  assert.equal(t, '1 Ola 900 2 Ja Sam (Ty) 800');
  const imiona = s.zapytania.map((q) => q.t).filter((n) => n === 'public_athletes' || n === 'athletes');
  assert.deepEqual(imiona, ['public_athletes', 'athletes'], 'najpierw widok publiczny, własne imię z tabeli');
});

test('gra.html: _dopiszImiona na poziomie skryptu (nie w initUser), jedna deklaracja', () => {
  const h = fs.readFileSync(path.join(KORZEN, 'gra.html'), 'utf8').replace(/\r/g, '');
  assert.equal((h.match(/function _dopiszImiona\(/g) || []).length, 1);
  assert.match(h, /\nasync function _dopiszImiona\(lista\) \{/, 'deklaracja bez wcięcia = poziom skryptu');
  const od = h.indexOf('async function initUser()'), koniec = h.indexOf('\n}\n', od), dekl = h.indexOf('async function _dopiszImiona(');
  assert.ok(od > 0 && koniec > od && !(dekl > od && dekl < koniec), 'nie w initUser');
});
