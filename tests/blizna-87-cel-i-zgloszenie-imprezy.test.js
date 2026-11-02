/* BLIZNA 87 (1.11.2026, K5) — cel startowy ↔ kalendarz imprez maszyny wyników.

   Ryzyka (projekt M3 v2 pkt 7, decyzja Filipa: zgłoszenie widoczne od razu z etykietą):
   1) wybór z podpowiedzi NIE wysyła zgłoszenia (impreza już jest) i wiąże cel kluczem (race_goals[].impreza_klucz);
   2) cel bez powiązania wysyła DOKŁADNIE jedno zgłoszenie; edycja celu już zgłoszonego — zero;
   3) 6. zgłoszenie w dobie (429) → cel i tak zapisany, zdanie „zgłoszenia na dziś wyczerpane";
   4) do maszyny nie płynie imię, nazwisko, e-mail ani identyfikator — sb.js i EF budują ciało z białej listy 3 pól;
   5) dedup po stronie F6 zwraca istniejącą imprezę → cel dostaje JEJ klucz, zdanie „jest już w kalendarzu";
   6) podpowiedzi przez data-* + delegowany klik z białą listą funkcji — nazwa z zewnątrz nigdy w onclick (CLAUDE.md);
   7) etykieta „zgłoszona przez biegacza" w „W Polsce" i w kartach okienka; „Ukryj" tylko u trenera, przez event_hide. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { zaladujStrone, zaladujSb, stabilnyDom, tekstDlaOkna } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const UUID = '50bed7d3-1736-43d8-bcac-3c85b3939547';

/* zawodnik.html w vm + atrapa Supabase zapisująca update/invoke */
function zawodnik({ invoke, goals = [] } = {}) {
  const ctx = zaladujStrone('zawodnik.html');
  const dom = stabilnyDom(ctx);
  const zapisy = [], wywolania = [], toasty = [];
  const lancuch = (wynik) => { const q = { select: () => q, eq: () => q, gte: () => q, or: () => q, order: () => q, limit: () => q,
    maybeSingle: async () => ({ data: { race_goals: JSON.stringify(goals) }, error: null }), then: (res, rej) => Promise.resolve(wynik).then(res, rej) }; return q; };
  ctx.sb = {
    from: (t) => ({ ...lancuch({ data: [], error: null }), update: (p) => { zapisy.push({ t, p }); return lancuch({ error: null }); }, upsert: async () => ({ error: null }) }),
    functions: { invoke: async (nazwa, o) => { wywolania.push({ nazwa, body: JSON.parse(JSON.stringify(o.body)) }); return invoke ? invoke(o.body) : { data: null, error: { context: { status: 500 } } }; } },
    auth: { getSession: async () => ({ data: { session: null } }) },
  };
  ctx.toast = (m) => toasty.push(m);
  ctx.renderGoals = () => {};
  vm.runInContext('_athleteId = "ath-1";', ctx);
  ctx._profileGoals = goals.slice();
  return { ctx, dom, zapisy, wywolania, toasty };
}
const zapisaneCele = (z) => JSON.parse(z.zapisy.find((x) => x.t === 'athletes').p.race_goals);
function wpisz(z, nazwa, data, miasto) { z.dom.daj('goal-name-input').value = nazwa; z.dom.daj('goal-date-input').value = data; z.dom.daj('goal-city-input').value = miasto || ''; }

test('(1) wybór imprezy z podpowiedzi: zero zgłoszeń, cel z impreza_klucz i miejscowością', async () => {
  const z = zawodnik();
  z.ctx.goalPickImpreza({ klucz: 'kalendarz:' + UUID, nazwa: 'Półmaraton Testowy', data: '2027-04-11', miejscowosc: 'Poznań' });
  assert.equal(z.dom.daj('goal-name-input').value, 'Półmaraton Testowy');
  assert.equal(z.dom.daj('goal-city-input').value, 'Poznań');
  await z.ctx.saveGoal();
  assert.equal(z.wywolania.length, 0, 'wybór z kalendarza nie zgłasza');
  assert.deepEqual(zapisaneCele(z), [{ name: 'Półmaraton Testowy', date: '2027-04-11', race_id: null, impreza_klucz: 'kalendarz:' + UUID, miejscowosc: 'Poznań' }]);
  assert.deepEqual(z.toasty, ['Cel dodany ✓']);
  z.ctx.goalPickImpreza({ klucz: 'javascript:alert(1)', nazwa: 'X', data: '2027-01-01' });
  assert.equal(z.ctx._goalLinkedImpreza, null, 'klucz spoza wzorca odrzucony');
});

test('(2)(4) brak w kalendarzu: dokładnie jedno zgłoszenie, ciało = nazwa/data/miejscowość, klucz zapisany w celu', async () => {
  const z = zawodnik({ invoke: async () => ({ data: { klucz: 'zgloszenie:' + UUID, istniala: false, status: 'zgloszona' }, error: null }) });
  wpisz(z, 'Bieg o Puchar Sołtysa', '2027-05-03', 'Nysa');
  await z.ctx.saveGoal();
  assert.equal(z.wywolania.length, 1);
  assert.equal(z.wywolania[0].nazwa, 'impreza-zglos');
  assert.deepEqual(z.wywolania[0].body, { nazwa: 'Bieg o Puchar Sołtysa', data: '2027-05-03', miejscowosc: 'Nysa' });
  assert.deepEqual(zapisaneCele(z)[0], { name: 'Bieg o Puchar Sołtysa', date: '2027-05-03', race_id: null, impreza_klucz: 'zgloszenie:' + UUID, miejscowosc: 'Nysa' });
  assert.deepEqual(z.toasty, ['Cel dodany ✓ · impreza zgłoszona do kalendarza']);
  const bezDaty = zawodnik({ invoke: async () => { throw new Error('nie wolno'); } });
  wpisz(bezDaty, 'Cel bez daty', '', '');
  await bezDaty.ctx.saveGoal();
  assert.equal(bezDaty.wywolania.length, 0, 'bez daty nie ma czego zgłaszać');
});

test('(2) edycja celu już powiązanego z imprezą (ta sama nazwa) → zero zgłoszeń, klucz zostaje', async () => {
  const z = zawodnik({ goals: [{ name: 'Bieg o Puchar Sołtysa', date: '2027-05-03', race_id: null, impreza_klucz: 'zgloszenie:' + UUID }], invoke: async () => { throw new Error('nie wolno'); } });
  z.ctx._goalLinkingIdx = 0;
  wpisz(z, 'Bieg o Puchar Sołtysa', '2027-05-04', '');
  await z.ctx.saveGoal();
  assert.equal(z.wywolania.length, 0);
  assert.equal(zapisaneCele(z)[0].impreza_klucz, 'zgloszenie:' + UUID);
});

test('(3) 429 (6. zgłoszenie w dobie) → cel zapisany bez klucza; (5) dedup → klucz istniejącej imprezy', async () => {
  const z = zawodnik({ invoke: async () => ({ data: null, error: { context: { status: 429 } } }) });
  wpisz(z, 'Szósty Bieg Dnia', '2027-06-06', '');
  await z.ctx.saveGoal();
  assert.equal(z.wywolania.length, 1);
  assert.deepEqual(zapisaneCele(z), [{ name: 'Szósty Bieg Dnia', date: '2027-06-06', race_id: null }]);
  assert.deepEqual(z.toasty, ['Cel dodany ✓ · zgłoszenia imprez na dziś wyczerpane']);
  const d = zawodnik({ invoke: async () => ({ data: { klucz: 'kalendarz:' + UUID, istniala: true, status: null }, error: null }) });
  wpisz(d, '2. Maraton Testowy 2027', '2027-09-26', '');
  await d.ctx.saveGoal();
  assert.equal(zapisaneCele(d)[0].impreza_klucz, 'kalendarz:' + UUID);
  assert.deepEqual(d.toasty, ['Cel dodany ✓ · impreza jest już w kalendarzu']);
  const s = zawodnik({ invoke: async () => { throw new Error('offline'); } });
  wpisz(s, 'Bieg Bez Sieci', '2027-06-07', '');
  await s.ctx.saveGoal();
  assert.equal(zapisaneCele(s).length, 1, 'awaria sieci nie blokuje celu');
});

test('(4) sb.js zglosImpreze: biała lista 3 pól — imię, nazwisko, e-mail, athlete_id z obiektu celu nie wychodzą', async () => {
  const ctx = zaladujSb();
  const wyslane = [];
  ctx.sb = { functions: { invoke: async (n, o) => { wyslane.push({ n, body: o.body }); return { data: { klucz: 'zgloszenie:' + UUID, istniala: false, status: 'zgloszona' }, error: null }; } } };
  const r = await ctx.zglosImpreze({ nazwa: 'Bieg', data: '2027-01-02', miejscowosc: 'Ełk', imie: 'Jan', nazwisko: 'Kowalski', email: 'jan@x.pl', athlete_id: 'a1' });
  assert.equal(JSON.stringify(wyslane), JSON.stringify([{ n: 'impreza-zglos', body: { nazwa: 'Bieg', data: '2027-01-02', miejscowosc: 'Ełk' } }]));
  assert.equal(JSON.stringify(r), JSON.stringify({ klucz: 'zgloszenie:' + UUID, istniala: false, status: 'zgloszona' }));
  ctx.sb.functions.invoke = async () => ({ data: null, error: { context: { status: 429 } } });
  assert.equal((await ctx.zglosImpreze({ nazwa: 'Bieg', data: '2027-01-02' })).blad, 'limit');
  ctx.sb.functions.invoke = async () => { throw new Error('x'); };
  assert.equal((await ctx.zglosImpreze({ nazwa: 'Bieg', data: '2027-01-02' })).blad, 'siec');
});

test('(4) EF impreza-zglos: walidacja, do F6 tylko p_nazwa/p_data/p_miejscowosc z tokenem użytkownika; 429/400/401/502', async () => {
  const E = await zaladuj('supabase/functions/impreza-zglos/zglos.mjs');
  const w = E.walidujZgloszenie({ nazwa: '  Bieg\u0000 o  Puchar ', data: '2027-05-03', miejscowosc: 'Nysa', imie: 'Jan', email: 'jan@x.pl', athlete_id: 'a1' });
  assert.deepEqual(w, { ok: true, args: { p_nazwa: 'Bieg o Puchar', p_data: '2027-05-03', p_miejscowosc: 'Nysa' } });
  for (const [b, blad] of [[{ nazwa: 'ab', data: '2027-01-01' }, 'nazwa'], [{ nazwa: 'Bieg', data: '2027-02-30' }, 'data'], [{ nazwa: 'Bieg', data: '2027-01-01', miejscowosc: 'x'.repeat(81) }, 'miejscowosc'], [null, 'nazwa']])
    assert.equal(E.walidujZgloszenie(b).blad, blad);
  const zadania = [];
  const fetchFn = (status, json) => async (url, init) => { zadania.push({ url, init }); return { ok: status === 200, status, json: async () => json }; };
  const r = await E.zglos(fetchFn(200, [{ klucz: 'zgloszenie:' + UUID, nazwa: 'Bieg o Puchar', data: '2027-05-03', miejscowosc: 'Nysa', status: 'zgloszona', istniala: false }]), 'TOKEN', w.args);
  assert.equal(r.status, 200); assert.equal(r.wynik.klucz, 'zgloszenie:' + UUID); assert.equal(r.wynik.istniala, false);
  assert.equal(zadania[0].url, 'https://api.biegamy.run/rpc/event_propose');
  assert.deepEqual(Object.keys(JSON.parse(zadania[0].init.body)), ['p_nazwa', 'p_data', 'p_miejscowosc']);
  assert.equal(zadania[0].init.headers.Authorization, 'Bearer TOKEN');
  assert.ok(!/Jan|jan@x|a1/.test(zadania[0].init.body));
  for (const [st, kod] of [[429, 429], [400, 400], [401, 401], [500, 502]]) assert.equal((await E.zglos(fetchFn(st, {}), 'T', w.args)).status, kod, String(st));
  assert.equal((await E.zglos(fetchFn(200, [{ klucz: 'javascript:x' }]), 'T', w.args)).status, 502, 'klucz spoza wzorca');
  assert.equal((await E.zglos(async () => { throw new Error('x'); }, 'T', w.args)).status, 502);
  const ef = czytaj('supabase/functions/impreza-zglos/index.ts');
  assert.ok(ef.indexOf('wymagajUsera(req)') > 0 && ef.indexOf('wymagajUsera(req)') < ef.indexOf('req.json()'), 'najpierw użytkownik, potem ciało');
  const kod = (ef + czytaj('supabase/functions/impreza-zglos/zglos.mjs')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/console\.|service_role|SERVICE_ROLE|insert\(|from\(/.test(kod), 'bez logów, bez service_role, bez zapisu w BiegaMy');
  assert.match(czytaj('supabase/config.toml'), /\[functions\.impreza-zglos\]\nverify_jwt = true/);
});

test('(6) podpowiedzi: nasze starty + ≤ 5 z maszyny (bez dubli), wszystko w data-*, zero danych w onclick; delegowany klik z białą listą', async () => {
  const z = zawodnik();
  const ZLA = "x'); alert(1);//<img src=x>";
  z.ctx.sb.from = () => { const q = { select: () => q, eq: () => q, gte: () => q, or: () => q, order: () => q, limit: () => q,
    then: (res) => Promise.resolve({ data: [{ id: 'r1', name: 'Maraton Testowy', date: '2027-09-26', city: 'Poznań', distance_km: 42.195 }] }).then(res) }; return q; };
  z.ctx.IMPREZY.podpowiedz = async () => [
    { nazwa: '2. Maraton Testowy', data: '2027-09-27', miejscowosc: 'Poznań', klucz: 'kalendarz:' + UUID, status: null },   // dubel naszego startu
    { nazwa: ZLA, data: '2027-10-10', miejscowosc: 'Ełk', klucz: 'zgloszenie:' + UUID, status: 'zgloszona' }];
  const przed = z.ctx.__timery.length;
  await z.ctx.goalSuggest('maraton');
  const nowe = z.ctx.__timery.slice(przed);
  assert.equal(nowe.length, 1, 'jeden timer podpowiedzi');
  await nowe[0].fn();
  const html = z.dom.daj('goal-suggest').innerHTML;
  assert.equal((html.match(/class="gs-wiersz"/g) || []).length, 2, 'nasz start + jedna impreza (dubel odpadł)');
  assert.match(html, /data-pick="goalPickRace" data-race-id="r1" data-nazwa="Maraton Testowy" data-data="2027-09-26"/);
  assert.match(html, /data-pick="goalPickImpreza" data-klucz="zgloszenie:50bed7d3-1736-43d8-bcac-3c85b3939547" data-nazwa="x&#39;\); alert\(1\);\/\/&lt;img src=x&gt;"/);
  assert.match(html, /Ełk · zgłoszona przez biegacza/);
  assert.ok(!/onclick/i.test(html), 'żadnego onclick w podpowiedziach');
  const src = czytaj('zawodnik.html');
  assert.ok(!/onclick="' \+ pickFn/.test(src) && !/escAttrJS\(r\.name\)/.test(src), 'stary wzorzec JS-w-atrybucie usunięty');
  assert.match(src, /var _GOAL_PICK = \{ goalPickRace: 1, genPickRace: 1, goalPickImpreza: 1 \};/);
  assert.match(src, /if \(!_GOAL_PICK\[f\] \|\| typeof window\[f\] !== 'function'\) return;/);
  assert.match(src, /<script src="sb\.js"><\/script>\n<script src="js\/wyniki-api\.js"><\/script>/);
});

test('(7) „W Polsce": etykieta zgłoszenia; „Ukryj" tylko u trenera przez event_hide (data-klucz, wzorzec zgloszenie:<uuid>); start po rozpoznaniu trenera', () => {
  const r = czytaj('races.html');
  assert.match(r, /x\.status === 'zgloszona' \? '<div class="imprezy-zgloszona"[^']*>zgłoszona przez biegacza<\/div>'/);
  assert.match(r, /_isCoach && x\.status && \/\^zgloszenie:\/\.test\(x\.klucz \|\| ''\) \? '<button type="button" class="imprezy-ukryj" data-klucz="' \+ escAttr\(x\.klucz\) \+ '"/);
  assert.match(r, /window\.wynikiApi\(_sb\)\.rpc\('event_hide', \{ p_klucz: k \}\)/);
  assert.ok(r.indexOf('_isCoach = !!coachRow;') < r.indexOf('if (apiWynikow && window.IMPREZY) imprezyStart();'), 'imprezyStart po rozpoznaniu trenera');
  const ctx = zaladujSb();
  const m = ctx.IMPREZY._mapuj({ nazwa: 'Bieg', data: '2027-01-01', status: 'zgloszona', klucz: 'zgloszenie:' + UUID });
  assert.equal(m.status, 'zgloszona'); assert.equal(m.klucz, 'zgloszenie:' + UUID);
  assert.equal(ctx.IMPREZY._mapuj({ nazwa: 'B', data: '2027-01-01', status: 'ukryta', klucz: 'javascript:x' }).status, null);
  assert.equal(ctx.IMPREZY._mapuj({ nazwa: 'B', data: '2027-01-01', klucz: 'javascript:x' }).klucz, null);
  assert.equal(ctx.IMPREZY.toSamo({ name: 'Maraton Testowy', date: '2027-09-26' }, { nazwa: '2. Maraton Testowy', data: '2027-09-27' }), true);
});

test('(7) okienko: karta imprezy ze zgłoszenia ma etykietę; kalendarz/biegi przenoszą status', async () => {
  const okno = { escapeHtml: (s) => String(s), BM_TEKST: tekstDlaOkna() };
  const ctx = vm.createContext({ window: okno, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: {}, setTimeout, console });
  vm.runInContext(czytaj('js/okienko.js'), ctx);
  const html = okno.OKIENKO.htmlOdpowiedzi(200, { tryb: 'router', zdania: ['x'], karty: [{ typ: 'impreza', dane: { nazwa: 'Bieg o Puchar', data: '2027-05-03', miejscowosc: 'Nysa', status: 'zgloszona' } },
    { typ: 'impreza', dane: { nazwa: 'Maraton', data: '2027-09-26', status: 'potwierdzona' } }] });
  assert.equal((html.match(/zgłoszona przez biegacza/g) || []).length, 1, 'potwierdzona bez etykiety');
  const K = await zaladuj('supabase/functions/okienko/kalendarz.mjs');
  const m = K.mapuj({ nazwa: 'Bieg', data: '2027-05-03', status: 'zgloszona', klucz: 'zgloszenie:' + UUID });
  assert.equal(m.status, 'zgloszona'); assert.equal(m.klucz, 'zgloszenie:' + UUID);
  assert.match(czytaj('supabase/functions/okienko/biegi.mjs'), /status: b\.status === "zgloszona" \|\| b\.status === "potwierdzona" \? b\.status : null/);
});
