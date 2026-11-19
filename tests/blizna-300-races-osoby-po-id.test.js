/* BLIZNA 300 / 19.11 (produkcja): races.html (Kalendarz startów) nie wczytywał się trenerowi:
   „Uncaught (in promise) ReferenceError: _osobyPoId is not defined at loadRaces (races.html:794) at async races.html:762”.
   Commit 8e491d0b (12.11, cudze profile przez public_athletes) wstawił pomocnika `async function _osobyPoId` DO ŚRODKA funkcji startowej
   `(async () => { … })()`, a oba wywołania stoją w funkcjach na poziomie skryptu: loadRaces (zgłaszający propozycje, tylko trener) i
   loadRaceParticipantsAvatars (awatary zapisanych, tylko trener). Deklaracja w środku funkcji jest widoczna tylko w niej, więc obie ścieżki rzucały.
   client_errors 13–19.11: 9 wpisów, jedno konto, trenerskie; zawodników ta ścieżka nie dotyczy (`_isCoach`).
   Poprawka: pomocnik na poziomie skryptu, przed loadRaces. Test ładuje PRAWDZIWE skrypty races.html (atrapa przeglądarki z tests/_srodowisko.js)
   i woła loadRaces jako trener z propozycją do akceptacji i zapisanymi. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { zaladujSb, zamrozTimery, blokiSkryptow, stabilnyDom } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');

/* Atrapa Supabase: from(tabela) z łańcuchem jak w supabase-js; wynik z `dane[tabela](filtry)`. Bez sesji: funkcja startowa strony od razu wraca (przekierowanie). */
function strona(dane) {
  const ctx = zamrozTimery(zaladujSb()), zapytania = [];
  const sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }), getUser: () => Promise.resolve({ data: { user: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {},
    from: (t) => {
      const q = { t, in: {}, eq: {} }; zapytania.push(q);
      const wynik = () => Promise.resolve({ data: dane[t] ? dane[t](q) : [], error: null });
      const c = { select: () => c, eq: (k, v) => { q.eq[k] = v; return c; }, in: (k, v) => { q.in[k] = v; return c; }, gte: () => c, lte: () => c, or: () => c, order: () => c, limit: () => c,
        maybeSingle: () => wynik().then((r) => ({ data: (r.data || [])[0] || null, error: null })), single: () => wynik().then((r) => ({ data: (r.data || [])[0] || null, error: null })),
        then: (a, b) => wynik().then(a, b) };
      return c;
    },
  };
  ctx.sb = sb; ctx.window.sb = sb;
  const cisza = ctx.console; ctx.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
  try { blokiSkryptow('races.html').forEach((k, i) => vm.runInContext(k, ctx, { filename: 'races.html#' + i })); } finally { ctx.console = cisza; }
  stabilnyDom(ctx);
  return { ctx, zapytania, wartosc: (w) => vm.runInContext(w, ctx) };
}
const tylko = (wiersze) => (q) => wiersze.filter((w) => !q.in.id || q.in.id.includes(w.id));
const DANE = {
  races: () => [{ id: 'r1', name: 'Bieg A', city: 'Lipka', date: '2099-05-01', status: 'pending', added_by: 'a9', signup_count: 0, distances: '10' },
                { id: 'r2', name: 'Bieg B', city: 'Lipka', date: '2099-06-01', status: 'approved', added_by: 'a1', signup_count: 2, distances: '5' }],
  race_signups: () => [{ race_id: 'r2', athlete_id: 'a7', created_at: '2026-11-18T10:00:00Z' }, { race_id: 'r2', athlete_id: 'a8', created_at: '2026-11-17T10:00:00Z' }],
  public_athletes: tylko([{ id: 'a7', full_name: 'Ola', avatar_url: null }]),
  athletes: tylko([{ id: 'a8', full_name: 'Prywatny', avatar_url: null }, { id: 'a9', full_name: 'Zgłaszająca', avatar_url: null }]),
  friendships: () => [],
};

test('trener: loadRaces nie rzuca; zgłaszający propozycję i awatary zapisanych przez _osobyPoId (widok, a prywatni z tabeli)', async () => {
  const s = strona(DANE);
  s.wartosc('_isCoach = true; _athleteId = "a1";');
  await s.ctx.loadRaces();   // przed poprawką: ReferenceError: _osobyPoId is not defined
  assert.deepEqual(JSON.parse(JSON.stringify(s.ctx.window._raceSubmitters)), { a9: 'Zgłaszająca' }, 'zgłaszający propozycję (spoza widoku, z tabeli)');
  assert.deepEqual(s.wartosc('JSON.stringify(_raceParticipants)'), JSON.stringify({ r2: [{ id: 'a7', full_name: 'Ola', avatar_url: null }, { id: 'a8', full_name: 'Prywatny', avatar_url: null }] }));
  const kolejnosc = s.zapytania.map((q) => q.t).filter((t) => t === 'public_athletes' || t === 'athletes');
  assert.deepEqual(kolejnosc, ['public_athletes', 'athletes', 'public_athletes', 'athletes'], 'najpierw widok publiczny, brakujący z tabeli (po RLS)');
});

test('zawodnik: loadRaces bez zapytań o cudze profile (ścieżka trenera tylko dla trenera)', async () => {
  const s = strona(DANE);
  s.wartosc('_isCoach = false; _athleteId = "a1";');
  await s.ctx.loadRaces();
  assert.equal(s.zapytania.filter((q) => q.t === 'public_athletes' || q.t === 'athletes').length, 0);
});

test('races.html: _osobyPoId zadeklarowane na poziomie skryptu (nie w środku funkcji startowej), jedna deklaracja', () => {
  const h = fs.readFileSync(path.join(KORZEN, 'races.html'), 'utf8').replace(/\r/g, '');
  assert.equal((h.match(/function _osobyPoId\(/g) || []).length, 1);
  assert.match(h, /\nasync function _osobyPoId\(ids, kolumny\) \{/, 'deklaracja bez wcięcia = poziom skryptu');
  const start = h.indexOf('// ── INIT'), koniecStartu = h.indexOf('\n})();', start), dekl = h.indexOf('async function _osobyPoId(');
  assert.ok(start > 0 && koniecStartu > start && !(dekl > start && dekl < koniecStartu), 'nie w funkcji startowej');
});
