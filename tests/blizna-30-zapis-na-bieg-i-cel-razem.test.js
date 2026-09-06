// ─────────────────────────────────────────────────────────────────────────────
// BLIZNA 30 — ZAPIS NA BIEG I CEL TO DWA ZAPISY, A JEDEN SKUTEK.
//
// `doSignup()` pisze do DWÓCH tabel: `race_signups` (zapis na bieg) i
// `athletes.race_goals` (cel zawodnika). PostgREST nie da transakcji między
// tabelami z klienta, a do 6.09.2026 druga z nich szła bez sprawdzania błędu —
// `addToGoals` nie patrzyła na `error` w ogóle. Gdy padła, zostawał zapis bez
// celu, a człowiek i tak czytał „Zapisano! Cel dodany do Twojego profilu ✓".
//
// !! TO NIE BYŁA HIPOTEZA. Zmierzone na produkcji 6.09.2026: 12 ze 126 zapisów
//    (9,5%) nie miało odpowiednika w `race_goals`, u 6 osób, z datami od
//    kwietnia do sierpnia — czyli trwający dryf, nie ślad po wdrożeniu funkcji.
//
// !! DLACZEGO COFAMY ZAPIS, A NIE PONAWIAMY CELU. Ponowienie wymagałoby kolejki
//    i stanu „do dosłania", czyli mechanizmu, którego nie ma i którego nikt
//    nie pilnuje. Cofnięcie zostawia stan, który człowiek rozumie: nie jest
//    zapisany i widzi dlaczego. Jedna z dwóch rzeczy ma się nie udać w sposób
//    WIDOCZNY — cicha połowa jest gorsza od jawnej porażki.
//
// !! ASYMETRIA JEST ŚWIADOMA: `doUnsignup` NIE cofa wypisania, gdy nie uda się
//    zdjąć celu. Zostaje wtedy „chcę biec, ale nie jestem zapisany" — stan
//    prawdziwy i naprawialny ręcznie. Przywrócenie zapisu cofałoby decyzję
//    człowieka, a to gorsze niż zostawiony cel.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { zaladujSb, zamrozTimery, blokiSkryptow } = require('./_srodowisko');

/* !! DLACZEGO NIE `ctx._sb = atrapa` — I DLACZEGO TO WAŻNE DLA KAŻDEGO
      PRZYSZŁEGO TESTU TEJ STRONY. `races.html` deklaruje stan przez
      `const _sb = window.sb` i `let _athleteId, _athleteGoals, _mySignups`.
      Deklaracje `let`/`const` na szczycie skryptu NIE lądują na obiekcie
      globalnym — siedzą w leksykalnym zakresie kontekstu. Przypisanie
      `ctx._athleteId = …` tworzy więc NOWĄ własność globalną, której kod
      strony nigdy nie zobaczy, a test przechodzi obok tego, co miał sprawdzić
      (zmierzone: `addToGoals` zwracało `false` na pustym dzienniku, bo
      widziało `_athleteId === null`).
      Dwie drogi, obie użyte niżej:
        • `const _sb = window.sb` → podstawiamy `window.sb` PRZED załadowaniem
          bloków strony, więc `const` łapie już atrapę,
        • `let` → przypisujemy przez `vm.runInContext`, bo to trafia w TO SAMO
          wiązanie leksykalne, którego używa kod strony.
      Funkcje (`showToast`, `renderRaces`) są deklaracjami `function`, więc
      idą na obiekt globalny i podmieniają się zwykłym `ctx.nazwa = …`. */

/** Atrapa Supabase. `sterownik.padnij` jest czytany PRZY KAŻDYM WYWOŁANIU,
    nie zamrożony przy tworzeniu — bo `_sb` w races.html to `const` i nie da
    się go podmienić po załadowaniu strony. Test przełącza zachowanie w locie. */
function atrapaSb(dziennik, sterownik) {
  const budowniczy = (tabela, op) => {
    dziennik.push(tabela + ':' + op);
    const err = (sterownik.padnij === tabela && op === 'update')
      ? { message: 'symulowany pad zapisu' } : null;
    const p = Promise.resolve({ data: [], error: err });
    const chain = {
      eq: () => chain, in: () => chain, select: () => chain, limit: () => chain,
      order: () => chain, maybeSingle: () => p, single: () => p,
      then: (a, b) => p.then(a, b), catch: (f) => p.catch(f),
    };
    return chain;
  };
  return {
    /* Strona przy ładowaniu woła `sb.auth.getSession()`. Bez tej atrapy
       inicjalizacja odrzuca obietnicę JUŻ PO zakończeniu testu i cały plik
       leci na czerwono mimo zielonych asercji — ta sama pułapka, którą
       `_srodowisko.js` opisuje przy zamrażaniu timerów. */
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    from(tabela) {
      return {
        upsert: () => budowniczy(tabela, 'upsert'),
        update: () => budowniczy(tabela, 'update'),
        delete: () => budowniczy(tabela, 'delete'),
        insert: () => budowniczy(tabela, 'insert'),
        select: () => budowniczy(tabela, 'select'),
      };
    },
  };
}

/** Kontekst races.html z atrapą podstawioną PRZED wykonaniem kodu strony. */
function przygotuj(padnij) {
  const dziennik = [];
  const sterownik = { padnij: padnij };
  const ctx = zamrozTimery(zaladujSb());
  const sb = atrapaSb(dziennik, sterownik);
  ctx.sb = sb;
  if (ctx.window) ctx.window.sb = sb;
  const cisza = console.log;
  console.log = () => {};
  try {
    blokiSkryptow('races.html').forEach((kod) => {
      try { vm.runInContext(kod, ctx); } catch (e) { /* strona ma skutki uboczne przy ładowaniu */ }
    });
  } finally { console.log = cisza; }

  vm.runInContext(
    '_athleteId = "zawodnik-1";'
    + '_athleteGoals = [];'
    + '_mySignups = new Set();'
    + '_allRaces = [{ id: "bieg-1", name: "Bieg Testowy", date: "2027-05-01", signup_count: 3 }];',
    ctx);

  ctx.showToast = (m) => { dziennik.push('toast:' + m); };
  ctx.updateModalSignupBtn = () => {};
  ctx.renderRaces = () => {};

  const stan = {
    get cele() { return vm.runInContext('_athleteGoals', ctx); },
    get zapisy() { return vm.runInContext('_mySignups', ctx); },
    get licznik() { return vm.runInContext('_allRaces[0].signup_count', ctx); },
    ustawPad(tabela) { sterownik.padnij = tabela; },
  };
  return { ctx, dziennik, stan };
}

describe('zapis na bieg i cel — albo oba, albo żaden', () => {
  test('ŚCIEŻKA ZDROWA: zapis przechodzi, cel dopisany, komunikat o sukcesie', async () => {
    const { ctx, dziennik, stan } = przygotuj(null);
    await ctx.doSignup('bieg-1');

    assert.equal(stan.zapisy.has('bieg-1'), true, 'zapis nie został zapamiętany');
    assert.equal(stan.cele.length, 1, 'cel nie został dopisany');
    assert.equal(stan.cele[0].race_id, 'bieg-1');
    assert.ok(dziennik.some((x) => x.startsWith('toast:Zapisano!')),
      'brak potwierdzenia sukcesu: ' + JSON.stringify(dziennik));
    assert.equal(dziennik.includes('race_signups:delete'), false,
      'zdrowa ścieżka nie ma prawa niczego cofać');
  });

  test('⚠️ PAD DRUGIEGO ZAPISU: cel nie wchodzi → zapis na bieg jest COFNIĘTY', async () => {
    const { ctx, dziennik, stan } = przygotuj('athletes');
    await ctx.doSignup('bieg-1');

    assert.equal(dziennik.includes('race_signups:delete'), true,
      'zapis na bieg NIE został cofnięty — zostaje rozjazd: signup bez celu. Dziennik: '
      + JSON.stringify(dziennik));
    assert.equal(stan.zapisy.has('bieg-1'), false, 'stan lokalny nadal twierdzi, że zapisany');
    assert.equal(stan.cele.length, 0, 'cel został w pamięci mimo nieudanego zapisu');
  });

  test('…i człowiek DOWIADUJE SIĘ o tym — nie widzi komunikatu o sukcesie', async () => {
    const { ctx, dziennik, stan } = przygotuj('athletes');
    await ctx.doSignup('bieg-1');

    assert.equal(dziennik.some((x) => x.startsWith('toast:Zapisano!')), false,
      'ekran pokazał sukces mimo nieudanego zapisu celu');
    assert.ok(dziennik.some((x) => x.indexOf('zapis cofnięty') > -1),
      'brak komunikatu o cofnięciu: ' + JSON.stringify(dziennik));
  });

  test('licznik wraca do stanu sprzed próby, gdy zapis cofnięty', async () => {
    const { ctx, stan } = przygotuj('athletes');
    const przed = stan.licznik;
    await ctx.doSignup('bieg-1');
    assert.equal(stan.licznik, przed,
      'licznik został podbity mimo cofnięcia zapisu');
  });

  test('⚠️ WYPISANIE: pad zdjęcia celu NIE cofa wypisania, ale MÓWI o tym', async () => {
    const { ctx, dziennik, stan } = przygotuj(null);
    await ctx.doSignup('bieg-1');           // najpierw zapisz, żeby było co zdejmować
    stan.ustawPad('athletes');              // dopiero teraz psujemy zapis celu
    dziennik.length = 0;
    await ctx.doUnsignup('bieg-1');

    assert.equal(stan.zapisy.has('bieg-1'), false, 'wypisanie ma zostać wykonane');
    assert.equal(dziennik.includes('race_signups:upsert'), false,
      'wypisanie zostało cofnięte — to odwraca decyzję człowieka');
    assert.ok(dziennik.some((x) => x.indexOf('cel został w profilu') > -1),
      'milczenie o celu, który został: ' + JSON.stringify(dziennik));
  });

  test('addToGoals zwraca WYNIK, nie undefined — inaczej wołający nie ma czego sprawdzić', async () => {
    const { ctx, stan } = przygotuj(null);
    const ok = await ctx.addToGoals({ id: 'bieg-2', name: 'Drugi', date: '2027-06-01' });
    assert.equal(ok, true);
    stan.ustawPad('athletes');
    const zle = await ctx.addToGoals({ id: 'bieg-3', name: 'Trzeci', date: '2027-07-01' });
    assert.equal(zle, false, 'nieudany zapis zgłoszony jako sukces');
  });
});
