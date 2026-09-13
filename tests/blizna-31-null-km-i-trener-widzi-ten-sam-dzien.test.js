// ─────────────────────────────────────────────────────────────────────────────
// BLIZNA 31 — DWIE RZECZY Z KALENDARZA STARTÓW, OBIE Z 13.09.2026.
//
// (a) NULL W DYSTANSIE POKAZYWAŁ „null km". Cztery helpery w races.html
//     (`distanceLabel`, `formatDistNum`, `formatDistUnit`, `formatDistFull`)
//     dostawały `distance_km` prosto z bazy i renderowały `${km} km` dosłownie.
//     Nikt tego nie widział, bo dwie ścieżki zapisu wstawiały PLACEHOLDERY
//     (10 km z profilu, 100 km dla ultra) — liczbę, która kłamie, w miejsce
//     znaku „nie wiem". Gdy placeholdery znikają, NULL staje się legalny.
//
// (b) TRENER ZATWIERDZAŁ NA ŚLEPO. Pendingi w osobnej sekcji na górze, zatwierdzone
//     pogrupowane miesiącami niżej — porównanie „czy to już jest" szło w głowie.
//     12.09.2026 wszedł „Pko" obok istniejącego biegu tego samego dnia w Poznaniu.
//     Modal propozycji ma teraz sekcję „Tego dnia w kalendarzu są już" —
//     INFORMACJĘ, nie blokadę. Decyzja zostaje u człowieka, który zna kontekst.
//
// !! CZEGO TEN TEST PILNUJE W (b): tylko ten sam dzień (±1 daje fałszywe
//    trafienia w weekend biegowy), inne PENDINGI też (dwie propozycje tego
//    samego biegu to najbardziej prawdopodobny duplikat), odrzucone NIE,
//    sam siebie NIE, a przy zerze trafień sekcja jest UKRYTA — nie „brak
//    kolizji", żeby nie uczyć oka ignorowania ramki.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { zaladujSb, zamrozTimery, blokiSkryptow } = require('./_srodowisko');

/** Atrapa Supabase — strona przy ładowaniu woła `sb.auth.getSession()`;
    bez tego inicjalizacja odrzuca obietnicę po zakończeniu testu. */
function atrapaSb() {
  const p = Promise.resolve({ data: [], error: null });
  const chain = {
    eq: () => chain, in: () => chain, gte: () => chain, gt: () => chain, or: () => chain,
    select: () => chain, limit: () => chain, order: () => chain,
    maybeSingle: () => p, single: () => p,
    then: (a, b) => p.then(a, b), catch: (f) => p.catch(f),
  };
  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    from: () => ({ upsert: () => chain, update: () => chain, delete: () => chain,
                   insert: () => chain, select: () => chain }),
  };
}

/** Element, którego `style` i `innerHTML` da się ODCZYTAĆ — atrapa ze
    środowiska ma `style` jako Proxy zwracający zawsze '', więc asercja
    „sekcja ukryta" nie miałaby na czym stanąć. */
function elementCzytelny() {
  return {
    style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {}, value: '', textContent: '', innerHTML: '', className: '',
    addEventListener() {}, removeAttribute() {}, setAttribute() {},
    querySelector: () => elementCzytelny(), querySelectorAll: () => [],
  };
}

/** Kontekst races.html: `const _sb = window.sb` łapie atrapę podstawioną PRZED
    wykonaniem bloków; `let`-y strony ustawiamy przez `vm.runInContext`, bo
    `ctx.x = …` tworzy NOWĄ własność globalną, której kod strony nie widzi
    (patrz blizna 30). */
function przygotuj() {
  const ctx = zamrozTimery(zaladujSb());
  const sb = atrapaSb();
  ctx.sb = sb;
  if (ctx.window) ctx.window.sb = sb;
  const elementy = {};
  ctx.document.getElementById = (id) => (elementy[id] = elementy[id] || elementCzytelny());
  const cisza = console.log;
  console.log = () => {};
  try {
    blokiSkryptow('races.html').forEach((kod) => {
      try { vm.runInContext(kod, ctx); } catch (e) { /* skutki uboczne ładowania */ }
    });
  } finally { console.log = cisza; }
  ctx.updateModalSignupBtn = () => {};
  return { ctx, elementy };
}

const KALENDARZ = [
  { id: 'pko',    name: 'Pko',                date: '2026-09-12', city: 'Poznań', distance_km: 42.195, status: 'pending' },
  { id: 'pko2',   name: 'PKO Poznań Maraton', date: '2026-09-12', city: 'Poznań', distance_km: 42.195, status: 'approved' },
  { id: 'dukty',  name: 'XIV Leśne Dukty',    date: '2026-09-12', city: 'Lipka',  distance_km: 5,      status: 'approved' },
  { id: 'inny',   name: 'Bieg Niepodległości', date: '2026-11-11', city: 'Poznań', distance_km: 10,    status: 'approved' },
  { id: 'odrz',   name: 'Odrzucony',          date: '2026-09-12', city: 'Poznań', distance_km: 42.195, status: 'rejected' },
  { id: 'sasiad', name: 'Sąsiedni Dzień',     date: '2026-09-13', city: 'Poznań', distance_km: 42.195, status: 'approved' },
  { id: 'nowy',   name: 'Bez dystansu',       date: '2026-09-12', city: 'Poznań', distance_km: null,   status: 'pending' },
];

describe('(a) NULL w dystansie to „—", nie „null km"', () => {
  const { ctx } = przygotuj();
  for (const pusty of [null, undefined, '']) {
    test(`distanceLabel / formatDistNum / formatDistFull(${String(pusty)}) → „—"`, () => {
      assert.equal(ctx.distanceLabel(pusty), '—');
      assert.equal(ctx.formatDistNum(pusty), '—');
      assert.equal(ctx.formatDistFull(pusty), '—');
    });
  }
  test('formatDistUnit(null) → pusta jednostka (karta składa „21" nad „1 km", więc „—" nad „—" byłoby usterką)', () => {
    assert.equal(ctx.formatDistUnit(null), '');
  });
  test('żaden helper nie zawiera „null" w wyniku dla NULL', () => {
    for (const f of ['distanceLabel', 'formatDistNum', 'formatDistUnit', 'formatDistFull']) {
      assert.equal(String(ctx[f](null)).includes('null'), false, f);
    }
  });
  test('kontrola: prawdziwe dystanse renderują się jak dotąd', () => {
    assert.equal(ctx.distanceLabel(10), '10 km');
    assert.equal(ctx.distanceLabel(21.097), 'Półmaraton');
    assert.equal(ctx.formatDistNum(21.097), '21');
    assert.equal(ctx.formatDistUnit(42.195), '2 km');
    assert.equal(ctx.formatDistFull(42.195), '42,195 km');
  });
});

describe('(b) trener widzi, co JUŻ jest tego dnia', () => {
  test('propozycja z kolizją: lista zawiera zatwierdzone I inne pendingi tego dnia, bez siebie, bez odrzuconych, bez sąsiedniego dnia', () => {
    const { ctx } = przygotuj();
    const ids = ctx.kolizjeTegoDnia(KALENDARZ[0], KALENDARZ).map((r) => r.id).sort();
    assert.deepEqual(ids, ['dukty', 'nowy', 'pko2']);
  });

  test('render: nazwa · miasto · dystans, pending oznaczony „(do zatwierdzenia)", zatwierdzony NIE', () => {
    const { ctx } = przygotuj();
    const html = ctx.renderTegoDnia(KALENDARZ[0], KALENDARZ);
    assert.ok(html.includes('Tego dnia w kalendarzu są już'));
    assert.ok(html.includes('PKO Poznań Maraton · Poznań · Maraton'), html);
    assert.ok(html.includes('XIV Leśne Dukty · Lipka · 5 km'), html);
    assert.ok(html.includes('Bez dystansu · Poznań · —'), 'NULL w dystansie kolizji też ma być „—"');
    const wiersze = html.split('<div>').slice(1);
    const zPending = wiersze.filter((w) => w.includes('(do zatwierdzenia)'));
    assert.equal(zPending.length, 1, 'dokładnie jeden wiersz to pending');
    assert.ok(zPending[0].includes('Bez dystansu'));
  });

  test('propozycja bez kolizji: render pusty — sekcja ma być UKRYTA, nie „brak kolizji"', () => {
    const { ctx } = przygotuj();
    assert.equal(ctx.renderTegoDnia(KALENDARZ[3], KALENDARZ), '');
  });

  test('nazwy przechodzą przez escape — bieg o nazwie z tagiem nie wstrzykuje HTML', () => {
    const { ctx } = przygotuj();
    const zly = [{ id: 'x', name: '<img src=x onerror=alert(1)>', date: '2026-09-12', status: 'approved' }];
    const html = ctx.renderTegoDnia(KALENDARZ[0], zly);
    assert.equal(html.includes('<img'), false);
    assert.ok(html.includes('&lt;img'));
  });

  test('MODAL trenera: openRace(pending z kolizją) → #m-same-day widoczny z listą', () => {
    const { ctx, elementy } = przygotuj();
    vm.runInContext('_isCoach = true; _allRaces = ' + JSON.stringify(KALENDARZ) + '; _mySignups = new Set();', ctx);
    ctx.openRace('pko');
    const el = elementy['m-same-day'];
    assert.ok(el, 'modal nie sięgnął po #m-same-day');
    assert.equal(el.style.display, 'block');
    assert.ok(el.innerHTML.includes('XIV Leśne Dukty'));
  });

  test('MODAL trenera: openRace(pending BEZ kolizji) → #m-same-day ukryty i pusty', () => {
    const { ctx, elementy } = przygotuj();
    const sam = [{ id: 'solo', name: 'Solo', date: '2027-01-01', city: 'Lipka', distance_km: 5, status: 'pending' }];
    vm.runInContext('_isCoach = true; _allRaces = ' + JSON.stringify(sam) + '; _mySignups = new Set();', ctx);
    ctx.openRace('solo');
    const el = elementy['m-same-day'];
    assert.equal(el.style.display, 'none');
    assert.equal(el.innerHTML, '');
  });

  test('MODAL zawodnika: ta sama kolizja, ale sekcja ukryta — to informacja dla zatwierdzającego', () => {
    const { ctx, elementy } = przygotuj();
    vm.runInContext('_isCoach = false; _allRaces = ' + JSON.stringify(KALENDARZ) + '; _mySignups = new Set();', ctx);
    ctx.openRace('pko2');
    assert.equal(elementy['m-same-day'].style.display, 'none');
  });

  test('MODAL trenera na ZATWIERDZONYM biegu: sekcja ukryta — kolizje pokazujemy przy decyzji, nie przy oglądaniu', () => {
    const { ctx, elementy } = przygotuj();
    vm.runInContext('_isCoach = true; _allRaces = ' + JSON.stringify(KALENDARZ) + '; _mySignups = new Set();', ctx);
    ctx.openRace('pko2');
    assert.equal(elementy['m-same-day'].style.display, 'none');
  });
});
