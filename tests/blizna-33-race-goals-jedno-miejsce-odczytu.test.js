// ─────────────────────────────────────────────────────────────────────────────
// BLIZNA 33 — race_goals: USZKODZONA WARTOŚĆ BYŁA ZASTĘPOWANA, NIE „ZNIKAŁA".
//
// `athletes.race_goals` to kolumna tekstowa z JSON-em, czytana w 23 miejscach
// przez `try { JSON.parse } catch { [] }`. Siedem z nich robiło odczyt →
// modyfikuj → ZAPISZ: po nieudanym parse dopisywały jeden cel do pustej listy
// i nadpisywały kolumnę. W zawodnik.html bez kliknięcia, przy ładowaniu strony.
// Uszkodzenie nie zostawiało śladu — ani w client_errors, ani w danych, bo
// dane były już „naprawione" nowym zapisem. Zmierzone 13.09.2026: 0 uszkodzonych
// wartości u 34 osób — i ta liczba NICZEGO nie dowodzi, właśnie dlatego.
//
// !! JEDYNY UDOKUMENTOWANY PRZYPADEK — I DOWÓD, ŻE TAKICH NIE UMIEMY POLICZYĆ.
//    15.05.2026 funkcja `accept_intake_form` wpisała do `race_goals` jednej
//    zawodniczki ZDANIE z ankiety (206 znaków, pole „plany na rok") — wolny
//    tekst w kolumnie z JSON-em. Od tego dnia każdy `JSON.parse` tej wartości
//    padał. 13.09.2026 kolumna ma NULL. Jedyne miejsce w kodzie piszące NULL
//    to „usuń cel" w kalendarz.html po nieudanym parse — czyli ktoś (trener
//    albo ona) kliknął, dostał pustą listę i zapisał pustkę.
//    CZEGO NIE DA SIĘ DOWIEŚĆ: czy między 15.05 a 13.09 próbowała dodać własny
//    cel. Nie ma zapisów na biegi (0), propozycji (0), błędów innych niż szum
//    View Transitions (23), a otwarcie modalu celu nie zostawia śladu. Ślad po
//    nadpisaniu jest NIEODRÓŻNIALNY od „nigdy nie miała celów" — dlatego
//    „0 nieparsowalnych dziś" nie jest liczbą poszkodowanych, tylko liczbą
//    wartości, które jeszcze nikt nie zdążył nadpisać. Kanał `kind='dane'`
//    istnieje po to, żeby następny taki przypadek miał datę i miejsce.
//    Pisarz SQL zamknięty migracją 20260913_intake_bez_race_goals.sql.
//
// !! DWIE FUNKCJE ODCZYTU. `parseRaceGoals` (tablica zawsze) jest dla renderu.
//    `czytajRaceGoals` → { cele, uszkodzone } jest dla miejsc, które zapisują —
//    i te przy `uszkodzone` ODMAWIAJĄ, z toastem RACE_GOALS_ODMOWA. Helper
//    zwracający `[]` w miejsce zapisu przeniósłby cichą utratę z siedmiu
//    miejsc do jednego.
// !! LOG BEZ TREŚCI. Cele to nazwy startów i daty — dane osobowe. Do
//    client_errors idzie kolumna, miejsce, powód, typ, długość. Nigdy wartość.
// !! GOTOWE NA jsonb. Helper przyjmuje napis I tablicę, więc zmiana typu
//    kolumny nie wymaga ruszania żadnego z miejsc odczytu.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { zaladujSb } = require('./_srodowisko.js');

function stanowisko() {
  const w = zaladujSb();
  const wiersze = [];
  w.sb = { from(tabela) { return { insert(row) { wiersze.push({ tabela, row });
    return { then(res) { return Promise.resolve().then(() => res({ error: null })); } }; } }; } };
  if (w.window) w.window.sb = w.sb;
  w._authUid = 'u-test';
  w.navigator = { userAgent: 'test' };
  return { w, wiersze, tick: () => new Promise((r) => setTimeout(r, 0)) };
}

const DOBRE = '[{"name":"Maraton Poznań","date":"2026-10-11","race_id":"r1"},{"name":"Bieg","date":"2027-01-01"}]';

describe('czytajRaceGoals / parseRaceGoals — kształty wejścia', () => {
  test('poprawny napis JSON → tablica, uszkodzone=false, zero zgłoszeń', async () => {
    const { w, wiersze } = stanowisko();
    const r = w.czytajRaceGoals(DOBRE, 'test');
    assert.equal(r.uszkodzone, false);
    assert.equal(r.cele.length, 2);
    assert.equal(r.cele[0].race_id, 'r1');
    assert.equal(JSON.stringify(w.parseRaceGoals(DOBRE, 'test')), JSON.stringify(r.cele));
    assert.equal(wiersze.length, 0);
  });

  for (const [opis, pusty] of [['null', null], ['undefined', undefined], ['pusty napis', '']]) {
    test(`${opis} → [] i NIE jest uszkodzeniem (brak celów to stan legalny)`, () => {
      const { w, wiersze } = stanowisko();
      const r = w.czytajRaceGoals(pusty, 'test');
      assert.equal(r.uszkodzone, false); assert.equal(r.cele.length, 0);
      assert.equal(wiersze.length, 0);
    });
  }

  test('jsonb-ready: gotowa TABLICA (po zmianie typu kolumny) przechodzi bez parsowania', () => {
    const { w, wiersze } = stanowisko();
    const r = w.czytajRaceGoals([{ name: 'X', date: '2027-01-01' }], 'test');
    assert.equal(r.uszkodzone, false);
    assert.equal(r.cele.length, 1);
    assert.equal(wiersze.length, 0);
  });

  test('⚠️ NIEPARSOWALNY napis → uszkodzone=true, [] i zgłoszenie kind=dane', async () => {
    const { w, wiersze, tick } = stanowisko();
    const r = w.czytajRaceGoals('[{"name":"Maraton Pozn', 'profil.html:renderGoals');
    assert.equal(r.uszkodzone, true); assert.equal(r.cele.length, 0);
    await tick();
    assert.equal(wiersze.length, 1);
    assert.equal(wiersze[0].tabela, 'client_errors');
    assert.equal(wiersze[0].row.kind, 'dane');
    assert.equal(wiersze[0].row.source, 'athletes.race_goals');
    assert.match(wiersze[0].row.message, /profil\.html:renderGoals · nieparsowalne · typ=string · dl=22/);
  });

  test('⚠️ parsowalne, ale NIE tablica (obiekt) → uszkodzone=true, NIE opakowujemy', async () => {
    const { w, wiersze, tick } = stanowisko();
    const r = w.czytajRaceGoals('{"name":"Maraton","date":"2026-10-11"}', 'test');
    assert.equal(r.uszkodzone, true); assert.equal(r.cele.length, 0);
    await tick();
    assert.match(wiersze[0].row.message, /nie-tablica · typ=object/);
  });

  test('parsowalne "null" i liczba → uszkodzone (JSON.parse przeszedłby, .some() rzuciłby)', async () => {
    const { w } = stanowisko();
    assert.equal(w.czytajRaceGoals('null', 'test').uszkodzone, true);
    assert.equal(w.czytajRaceGoals('42', 'test').uszkodzone, true);
  });

  test('element nie-obiekt w tablicy wypada, reszta ZOSTAJE, całość NIE jest uszkodzona (zapis jej nie zgubi)', async () => {
    const { w, wiersze, tick } = stanowisko();
    const r = w.czytajRaceGoals('[{"name":"A","date":"2027-01-01"},null,"śmieć"]', 'test');
    assert.equal(r.uszkodzone, false);
    assert.equal(r.cele.length, 1);
    await tick();
    assert.match(wiersze[0].row.message, /element-nie-obiekt/);
  });
});

describe('⚠️ dane osobowe NIE trafiają do logu', () => {
  test('nazwa startu z uszkodzonej wartości NIE pojawia się w żadnym polu wiersza', async () => {
    const { w, wiersze, tick } = stanowisko();
    w.czytajRaceGoals('[{"name":"Maraton Poznań Jana Kowalskiego","date":"2026-10-11"', 'test');
    await tick();
    const tekst = JSON.stringify(wiersze[0].row);
    assert.equal(/Kowalski|Maraton|2026-10-11/.test(tekst), false, 'treść wyciekła do logu: ' + tekst);
  });
});

describe('serializeRaceGoals — jedyne miejsce zapisu', () => {
  test('tablica → napis JSON, który czytajRaceGoals odczyta bez straty', () => {
    const { w } = stanowisko();
    const cele = [{ name: 'A', date: '2027-01-01', proposed_race_id: 'p1' }];
    const s = w.serializeRaceGoals(cele);
    assert.equal(typeof s, 'string');
    assert.equal(JSON.stringify(w.czytajRaceGoals(s, 'test').cele), JSON.stringify(cele));
  });
  test('nie-tablica → "[]" (nigdy nie zapisujemy śmiecia)', () => {
    const { w } = stanowisko();
    assert.equal(w.serializeRaceGoals(null), '[]');
    assert.equal(w.serializeRaceGoals({ name: 'x' }), '[]');
  });
});

describe('zglosZleDane — bezpieczniki pętli, jak w zglosNieudanyZapis', () => {
  test('bez sesji nie zgłasza', async () => {
    const { w, wiersze, tick } = stanowisko();
    w._authUid = null;
    w.czytajRaceGoals('{{', 'test');
    await tick();
    assert.equal(wiersze.length, 0);
  });
  test('po jednym zgłoszeniu następne nadal działa (flaga wraca)', async () => {
    const { w, wiersze, tick } = stanowisko();
    w.czytajRaceGoals('{{', 'a'); await tick();
    w._authUid = 'u-test';   // atrapa sesji z _srodowiska zeruje uid po pierwszym ticku (artefakt, nie produkcja)
    w.czytajRaceGoals('{{', 'b'); await tick();
    assert.equal(wiersze.length, 2);
  });
  test('RACE_GOALS_ODMOWA istnieje i mówi, że NIE nadpisujemy', () => {
    const { w } = stanowisko();
    assert.match(w.RACE_GOALS_ODMOWA, /nie nadpisuj/);
  });
});

// ── ODMOWA ZAPISU W PRAWDZIWYM KODZIE STRON ──────────────────────────────────
// Helper to połowa blizny. Druga połowa: miejsca, które ZAPISUJĄ, naprawdę
// odmawiają przy uszkodzonej wartości — zamiast nadpisać ją pustą listą + 1.
const vm = require('node:vm');
const { zamrozTimery, blokiSkryptow } = require('./_srodowisko.js');

function strona(plik, ustaw) {
  const dziennik = [];
  const ctx = zamrozTimery(zaladujSb());
  const chain = () => { const p = Promise.resolve({ data: [], error: null }); const c = {
    eq: () => c, in: () => c, gte: () => c, or: () => c, select: () => c, limit: () => c, order: () => c,
    maybeSingle: () => p, single: () => p, then: (a, b) => p.then(a, b) }; return c; };
  const sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u' } } }, error: null }),
            getUser: () => Promise.resolve({ data: { user: { id: 'u' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {},
    from: (t) => ({ update: (p) => { dziennik.push({ t, op: 'update', p }); return chain(); },
                    insert: (p) => { dziennik.push({ t, op: 'insert', p }); return chain(); },
                    upsert: (p) => { dziennik.push({ t, op: 'upsert', p }); return chain(); },
                    delete: () => { dziennik.push({ t, op: 'delete' }); return chain(); }, select: () => chain() }),
  };
  ctx.sb = sb; if (ctx.window) ctx.window.sb = sb;
  ctx.confirm = () => true;
  const el = {};
  ctx.document.getElementById = (id) => (el[id] = el[id] || { style: {}, value: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {} }, dataset: {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
  const cisza = console.log; console.log = () => {};
  try { blokiSkryptow(plik).forEach((k) => { try { vm.runInContext(k, ctx); } catch (e) {} }); } finally { console.log = cisza; }
  const toasty = [];
  ctx.showToast = (m) => toasty.push(m); ctx.toast = (m) => toasty.push(m); ctx.notify = (m) => toasty.push(m);
  ctx.renderGoals = () => {}; ctx.renderPanelGoals = () => {}; ctx.closeGoalModal = () => {};
  ctx._authUid = 'u';
  vm.runInContext(ustaw, ctx);
  const pole = (id, v) => { ctx.document.getElementById(id).value = v; };
  return { ctx, dziennik, toasty, el, pole, zapisyAthletes: () => dziennik.filter((z) => z.t === 'athletes' && z.op === 'update') };
}

const USZKODZONE = '[{"name":"Maraton","date":"2026-10-11"';

describe('⚠️ miejsca ZAPISU odmawiają przy uszkodzonej wartości (nie nadpisują)', () => {
  test('profil.html saveGoalFromModal: uszkodzone race_goals → ZERO update, toast odmowy', async () => {
    const s = strona('profil.html', '_myId = "a1"; _profileData = { race_goals: ' + JSON.stringify(USZKODZONE) + ' }; _linkingGoalIdx = -1; _goalSelectedRace = null;');
    s.pole('goal-name-inp', 'Nowy'); s.pole('goal-date-inp', '2027-01-01');
    await s.ctx.saveGoalFromModal();
    assert.equal(s.zapisyAthletes().length, 0, 'nadpisało: ' + JSON.stringify(s.dziennik));
    assert.ok(s.toasty.some((m) => /nie nadpisuj/.test(m)), 'brak toastu odmowy: ' + JSON.stringify(s.toasty));
  });

  test('profil.html removeGoal: to samo', async () => {
    const s = strona('profil.html', '_myId = "a1"; _profileData = { race_goals: ' + JSON.stringify(USZKODZONE) + ' };');
    await s.ctx.removeGoal(0);
    assert.equal(s.zapisyAthletes().length, 0);
    assert.ok(s.toasty.some((m) => /nie nadpisuj/.test(m)));
  });

  test('profil.html proposeGoalAsRace: odmowa PRZED celem i PRZED propozycją', async () => {
    const s = strona('profil.html', '_myId = "a1"; _profileData = { race_goals: ' + JSON.stringify(USZKODZONE) + ' };');
    s.pole('goal-name-inp', 'Nowy'); s.pole('goal-date-inp', '2027-01-01');
    s.pole('goal-propose-city', 'Lipka'); s.pole('goal-propose-dist', '10');
    await s.ctx.proposeGoalAsRace();
    const dane = s.dziennik.filter((z) => z.t !== 'client_errors');
    assert.equal(dane.length, 0, 'zapis danych mimo odmowy: ' + JSON.stringify(dane));
    assert.equal(s.dziennik.filter((z) => z.t === 'client_errors' && z.p.kind === 'dane').length, 1,
      'odmowa ma zostawić ślad w client_errors (kind=dane)');
  });

  test('profil.html: POPRAWNA wartość → zapis idzie (odmowa nie jest ślepa)', async () => {
    const s = strona('profil.html', '_myId = "a1"; _profileData = { race_goals: "[]" }; _linkingGoalIdx = -1; _goalSelectedRace = null;');
    s.pole('goal-name-inp', 'Nowy'); s.pole('goal-date-inp', '2027-01-01');
    await s.ctx.saveGoalFromModal();
    assert.equal(s.zapisyAthletes().length, 1);
    assert.equal(typeof s.zapisyAthletes()[0].p.race_goals, 'string', 'zapis idzie przez serializeRaceGoals (napis, dopóki kolumna jest text)');
  });

  test('races.html addToGoals: kopia w pamięci uszkodzona → false, ZERO update', async () => {
    const s = strona('races.html', '_athleteId = "a1"; _athleteGoals = []; _athleteGoalsUszkodzone = true;');
    const ok = await s.ctx.addToGoals({ id: 'r1', name: 'Bieg', date: '2027-01-01' });
    assert.equal(ok, false);
    assert.equal(s.zapisyAthletes().length, 0);
    assert.ok(s.toasty.some((m) => /nie nadpisuj/.test(m)));
  });

  test('trener.html savePanelGoal / deletePanelGoal: flaga uszkodzenia blokuje oba', async () => {
    const s = strona('trener.html', 'window._selectedAthleteId = "a1"; window._panelGoals = []; window._panelGoalsUszkodzone = true;');
    s.pole('ppb-goal-name', 'Bieg'); s.pole('ppb-goal-date', '2027-01-01');
    await s.ctx.savePanelGoal();
    await s.ctx.deletePanelGoal(0);
    assert.equal(s.zapisyAthletes().length, 0, JSON.stringify(s.dziennik));
    assert.equal(s.toasty.filter((m) => /nie nadpisuj/.test(m)).length, 2);
  });
});
