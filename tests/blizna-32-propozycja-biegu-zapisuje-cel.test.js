// ─────────────────────────────────────────────────────────────────────────────
// BLIZNA 32 — „WYŚLIJ PROPOZYCJĘ TRENEROWI" ZOSTAWIAŁO CZŁOWIEKA BEZ CELU.
//
// `proposeGoalAsRace()` w profil.html wstawiało propozycję do `races`, pokazywało
// „Propozycja wysłana do trenera ✓" i zamykało modal. `athletes.race_goals`
// zostawało nietknięte. Człowiek wpisał nazwę i datę, dostał potwierdzenie
// i nie miał celu — toast twierdził, że coś się wydarzyło.
// Zmierzone 13.09.2026: 1 osoba przeszła tą ścieżką (5.07) i dopisała sobie
// cel ręcznie, osobno.
//
// DRUGA WADA W TEJ SAMEJ FUNKCJI: `distance_km: 10` i `city: '—'` jako
// PLACEHOLDERY. Górski „3xŚnieżka" wisiał w kalendarzu jako zatwierdzona
// dziesiątka, a rekord był niewykrywalny dla klucza data+miasto+dystans.
// „Nie wiem" udające pomiar. Człowiek zgłasza konkretny bieg — zna dystans
// i miasto — więc oba są teraz WYMAGANE, jak w races.html.
//
// !! KOLEJNOŚĆ JEST TREŚCIĄ TEJ BLIZNY: CEL PIERWSZY, PROPOZYCJA DRUGA.
//    Pad propozycji zostawia stan prawdziwy (cel jest, biegu w kalendarzu nie
//    ma — i toast to mówi). Odwrotna kolejność odtworzyłaby wadę w innej
//    postaci: propozycja jest, celu nie ma.
// !! `proposed_race_id` — id biegu losowane po stronie klienta ZANIM propozycja
//    istnieje, żeby `addToGoals` w races.html powiązało cel po zatwierdzeniu
//    także wtedy, gdy trener zmieni nazwę („Pko" → „PKO Poznań Maraton").
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { zaladujSb, zamrozTimery, blokiSkryptow } = require('./_srodowisko');

/** Atrapa Supabase z dziennikiem zapisów i sterowanym padem jednej tabeli. */
function atrapaSb(dziennik, sterownik) {
  const budowniczy = (tabela, op, payload) => {
    dziennik.push({ tabela, op, payload });
    const err = (sterownik.padnij === tabela) ? { message: 'symulowany pad ' + tabela } : null;
    const p = Promise.resolve({ data: [], error: err });
    const chain = {
      eq: () => chain, in: () => chain, gte: () => chain, or: () => chain, select: () => chain,
      limit: () => chain, order: () => chain, maybeSingle: () => p, single: () => p,
      then: (a, b) => p.then(a, b), catch: (f) => p.catch(f),
    };
    return chain;
  };
  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    from(tabela) {
      return {
        upsert: (x) => budowniczy(tabela, 'upsert', x),
        update: (x) => budowniczy(tabela, 'update', x),
        delete: () => budowniczy(tabela, 'delete'),
        insert: (x) => budowniczy(tabela, 'insert', x),
        select: () => budowniczy(tabela, 'select'),
      };
    },
  };
}

function elementCzytelny() {
  return {
    style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {}, value: '', textContent: '', innerHTML: '', className: '',
    addEventListener() {}, removeAttribute() {}, setAttribute() {},
    querySelector: () => elementCzytelny(), querySelectorAll: () => [],
  };
}

/** Kontekst profil.html. `sb` to globalna z sb.js — podstawiamy atrapę PRZED
 *  wykonaniem bloków strony; `let`-y strony ustawiamy przez `vm.runInContext`
 *  (patrz blizna 30: `ctx.x = …` tworzy własność, której kod strony nie widzi). */
function przygotuj(padnij, pola) {
  const dziennik = [];
  const sterownik = { padnij: padnij };
  const ctx = zamrozTimery(zaladujSb());
  const sb = atrapaSb(dziennik, sterownik);
  ctx.sb = sb;
  if (ctx.window) ctx.window.sb = sb;
  const elementy = {};
  ctx.document.getElementById = (id) => (elementy[id] = elementy[id] || elementCzytelny());
  ctx.crypto = { randomUUID: () => 'losowy-id-propozycji' };
  const cisza = console.log;
  console.log = () => {};
  try {
    blokiSkryptow('profil.html').forEach((kod) => {
      try { vm.runInContext(kod, ctx); } catch (e) { /* skutki uboczne ładowania */ }
    });
  } finally { console.log = cisza; }
  vm.runInContext('_myId = "zawodnik-1"; _profileData = { race_goals: "[]" };', ctx);
  const toasty = [];
  ctx.showToast = (m) => toasty.push(m);
  ctx.renderGoals = () => { dziennik.push({ tabela: '(render)', op: 'renderGoals' }); };
  const domyslne = { 'goal-name-inp': 'Bieg Testowy', 'goal-date-inp': '2027-05-01',
                     'goal-propose-city': 'Lipka', 'goal-propose-dist': '10' };
  for (const [id, v] of Object.entries(Object.assign({}, domyslne, pola || {}))) ctx.document.getElementById(id).value = v;
  return {
    ctx, dziennik, toasty,
    get cele() { return JSON.parse(vm.runInContext('_profileData.race_goals', ctx)); },
    zapisy: (tabela, op) => dziennik.filter((z) => z.tabela === tabela && (!op || z.op === op)),
  };
}

describe('propozycja biegu z profilu: cel PIERWSZY, propozycja DRUGA', () => {
  test('ŚCIEŻKA ZDROWA: cel w race_goals, propozycja w races, oba fakty w toaście', async () => {
    const t = przygotuj(null);
    await t.ctx.proposeGoalAsRace();
    assert.equal(t.cele.length, 1, 'cel nie został zapisany');
    assert.equal(t.cele[0].name, 'Bieg Testowy');
    assert.equal(t.cele[0].proposed_race_id, 'losowy-id-propozycji', 'cel nie niesie proposed_race_id');
    assert.equal(t.zapisy('races', 'insert').length, 1, 'propozycja nie poszła');
    assert.ok(t.toasty.some((m) => /Cel zapisany/.test(m) && /propozycja wysłana/.test(m)),
      'toast ma nieść DWA fakty: ' + JSON.stringify(t.toasty));
    assert.ok(t.dziennik.some((z) => z.op === 'renderGoals'), 'lista celów nie została odświeżona');
  });

  test('KOLEJNOŚĆ: zapis celu (athletes) idzie PRZED wstawieniem propozycji (races)', async () => {
    const t = przygotuj(null);
    await t.ctx.proposeGoalAsRace();
    const kolejnosc = t.dziennik.filter((z) => z.op === 'update' || z.op === 'insert').map((z) => z.tabela);
    assert.deepEqual(kolejnosc, ['athletes', 'races']);
  });

  test('⚠️ PAD PROPOZYCJI: cel ZOSTAJE, a toast mówi, że propozycja NIE poszła', async () => {
    const t = przygotuj('races');
    await t.ctx.proposeGoalAsRace();
    assert.equal(t.cele.length, 1, 'cel zniknął razem z padem propozycji');
    assert.ok(t.toasty.some((m) => /Cel zapisany/.test(m) && /NIE udało/.test(m)),
      'człowiek nie dowiedział się, że propozycja padła: ' + JSON.stringify(t.toasty));
    assert.equal(t.toasty.some((m) => /wysłana do trenera ✓/.test(m)), false, 'toast kłamie o sukcesie');
  });

  test('⚠️ PAD CELU: propozycja NIE jest wysyłana (odwrotność dzisiejszej wady)', async () => {
    const t = przygotuj('athletes');
    await t.ctx.proposeGoalAsRace();
    assert.equal(t.zapisy('races', 'insert').length, 0, 'propozycja poszła mimo braku celu — to jest wada z 13.09 w innej postaci');
    assert.ok(t.toasty.some((m) => /Nie udało się zapisać celu/.test(m)));
  });

  test('propozycja niesie PRAWDZIWY dystans i miasto — koniec placeholderów 10 / „—"', async () => {
    const t = przygotuj(null, { 'goal-propose-dist': '21.097', 'goal-propose-city': 'Poznań' });
    await t.ctx.proposeGoalAsRace();
    const p = t.zapisy('races', 'insert')[0].payload;
    assert.equal(p.distance_km, 21.097);
    assert.equal(p.city, 'Poznań');
    assert.equal(p.id, 'losowy-id-propozycji', 'id biegu ma być tym samym, które niesie cel');
    assert.equal(p.status, 'pending');
  });

  test('„Inny dystans" bierze liczbę z pola — nie ma opcji „Ultra" = 100 km', async () => {
    const t = przygotuj(null, { 'goal-propose-dist': 'other', 'goal-propose-dist-custom': '61.5' });
    await t.ctx.proposeGoalAsRace();
    assert.equal(t.zapisy('races', 'insert')[0].payload.distance_km, 61.5);
  });

  for (const [pole, wartosc, opis] of [
    ['goal-propose-city', '', 'bez miasta'],
    ['goal-propose-city', '   ', 'z samymi spacjami w mieście'],
    ['goal-name-inp', '', 'bez nazwy'],
    ['goal-date-inp', '', 'bez daty'],
  ]) {
    test(`WYMAGANE: ${opis} → zero zapisów (druga droga nie łagodniejsza niż races.html)`, async () => {
      const t = przygotuj(null, { [pole]: wartosc });
      await t.ctx.proposeGoalAsRace();
      assert.equal(t.zapisy('athletes').length + t.zapisy('races').length, 0,
        'coś zostało zapisane mimo braku pola: ' + JSON.stringify(t.dziennik));
    });
  }

  test('WYMAGANE: „Inny dystans" bez liczby → zero zapisów', async () => {
    const t = przygotuj(null, { 'goal-propose-dist': 'other', 'goal-propose-dist-custom': '' });
    await t.ctx.proposeGoalAsRace();
    assert.equal(t.zapisy('athletes').length + t.zapisy('races').length, 0);
  });

  test('istniejący cel o tej nazwie i dacie → nic nie dubluje', async () => {
    const t = przygotuj(null);
    vm.runInContext('_profileData = { race_goals: JSON.stringify([{ name: "bieg testowy", date: "2027-05-01" }]) };', t.ctx);
    await t.ctx.proposeGoalAsRace();
    assert.equal(t.zapisy('athletes').length + t.zapisy('races').length, 0);
    assert.ok(t.toasty.some((m) => /już istnieje/.test(m)));
  });
});

describe('po zatwierdzeniu: addToGoals (races.html) wiąże cel po proposed_race_id', () => {
  function racesCtx() {
    const dziennik = [];
    const ctx = zamrozTimery(zaladujSb());
    const sb = atrapaSb(dziennik, { padnij: null });
    ctx.sb = sb; if (ctx.window) ctx.window.sb = sb;
    const cisza = console.log; console.log = () => {};
    try { blokiSkryptow('races.html').forEach((k) => { try { vm.runInContext(k, ctx); } catch (e) {} }); }
    finally { console.log = cisza; }
    return { ctx, dziennik };
  }

  test('trener ZMIENIŁ nazwę propozycji → cel dostaje race_id, bez duplikatu', async () => {
    const { ctx, dziennik } = racesCtx();
    vm.runInContext('_athleteId = "zawodnik-1"; _athleteGoals = [{ name: "Pko", date: "2026-09-12", proposed_race_id: "bieg-7" }];', ctx);
    const ok = await ctx.addToGoals({ id: 'bieg-7', name: 'PKO Poznań Maraton', date: '2026-09-12' });
    assert.equal(ok, true);
    const cele = vm.runInContext('_athleteGoals', ctx);
    assert.equal(cele.length, 1, 'powstał drugi cel zamiast powiązania');
    assert.equal(cele[0].race_id, 'bieg-7');
    assert.equal(dziennik.filter((z) => z.tabela === 'athletes' && z.op === 'update').length, 1);
  });

  test('bez proposed_race_id i z inną nazwą → jak dotąd: nowy cel (stare zachowanie nietknięte)', async () => {
    const { ctx } = racesCtx();
    vm.runInContext('_athleteId = "zawodnik-1"; _athleteGoals = [{ name: "Pko", date: "2026-09-12" }];', ctx);
    await ctx.addToGoals({ id: 'bieg-7', name: 'PKO Poznań Maraton', date: '2026-09-12' });
    assert.equal(vm.runInContext('_athleteGoals', ctx).length, 2);
  });
});
