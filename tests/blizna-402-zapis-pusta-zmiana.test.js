// Blizna #402 (26.11.2026) — zapis wpisu: pusta zmiana to sukces bez bazy; prawdziwe „0 wierszy” ma zdanie dla zawodnika.
//
// 26.11 o 21:37 zawodnik zalogował wynik, otworzył ten dzień w kalendarzu i nacisnął „Zapisz”. Okno dnia (kalendarz.html,
// saveTraining) przy wykonanym treningu dopina do wpisu z tego dnia tylko zdjęcia, link Stravy i komentarz; nie było żadnego
// z nich, więc window.zapiszLog wysłał update({}). PostgREST pustej zmiany nie wykonuje i oddaje zero wierszy bez błędu,
// a zapiszLog uznawał to za odmowę: komunikat, okno otwarte, cztery kliknięcia w 10 s i cztery wpisy client_errors
// „update · brak-kodu · Brak uprawnień do edycji — sprawdź polityki RLS”.
// Teraz: pusta zmiana przy edycji = to samo co udany zapis, bez wołania bazy (kontrakt „undefined = nie ruszaj”).
// Zero wierszy przy NIEPUSTEJ zmianie (wpis usunięty albo cudzy) dalej jest błędem, ale zawodnik dostaje zdanie, co zrobić,
// a techniczny opis zostaje w client_errors bez zmian.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const KOMUNIKAT_ZERO = 'Nie udało się zapisać, ten wpis mógł zostać usunięty. Odśwież stronę.';
const TECHNICZNY = 'update · brak-kodu · Brak uprawnień do edycji — sprawdź polityki RLS';

/** Środowisko z prawdziwym sb.js i atrapą bazy, która zapisuje KAŻDE wywołanie i odpowiada tak, jak każe test. */
function stanowisko(odpowiedzUpdate) {
  const w = zaladujSb();
  const s = { wolania: [], bledy: [] };
  w.sb = {
    from(tabela) {
      const b = { tabela, op: null, payload: undefined, warunki: [] };
      s.wolania.push(b);
      const lancuch = {
        update(p) { b.op = 'update'; b.payload = p; return lancuch; },
        insert(p) { b.op = 'insert'; b.payload = p; if (tabela === 'client_errors') s.bledy.push(p); return lancuch; },
        eq(k, v) { b.warunki.push([k, v]); return lancuch; },
        select() { return lancuch; },
        then(res, rej) {
          const r = tabela === 'client_errors' ? { error: null }
            : b.op === 'update' ? odpowiedzUpdate
            : { data: [{ id: 'NOWY' }], error: null };
          return Promise.resolve(r).then(res, rej);
        },
      };
      return lancuch;
    },
  };
  w.navigator = { userAgent: 'test' };
  w.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  s.w = w;
  /* Rdzeń przy ładowaniu woła getSession() i po pierwszym mikrozadaniu wpisuje _authUid = null (atrapa nie ma sesji);
     dopiero po tym ustawiamy konto, inaczej zgłoszenie do client_errors nie wyjdzie (patrz tests/zglaszanie-zapisow.test.js). */
  s.zapisz = async (o) => { await new Promise((r) => setTimeout(r, 0)); w._authUid = 'u-1'; return w.zapiszLog(Object.assign({ athleteId: 'a-1', dzien: '2026-11-26', kluczZapisu: 'k', zrodlo: 'manual' }, o)); };
  s.wpisy = () => s.wolania.filter((x) => x.tabela === 'training_logs');
  return s;
}
const czekaj = () => new Promise((r) => setTimeout(r, 0));
/** Obiekty z kontekstu vm mają inny prototyp niż obiekty testu: porównujemy treść. */
const plain = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
/** Dokładnie to, co wysyła okno dnia w kalendarzu dla istniejącego wpisu bez komentarza, bez Stravy i bez nowych plików. */
const Z_KALENDARZA = { idLoguDoEdycji: 'LOG-1', typ: undefined, pola: { strava_link: undefined, comment: undefined }, pliki: [] };

test('(1) pusta zmiana przy edycji: sukces, zero wywołań bazy, zero wpisów client_errors', async () => {
  const s = stanowisko({ data: [], error: null });
  const r = await s.zapisz(Z_KALENDARZA);
  await czekaj();
  assert.deepEqual(plain(r), { ok: true, id: 'LOG-1', powtorzony: false });
  assert.equal(s.wolania.length, 0, 'ani training_logs, ani client_errors');
});

test('(2) pusta zmiana zwraca dokładnie to samo co udany zapis, więc okno dnia zamyka się tak samo', async () => {
  const pusta = await stanowisko({ data: [], error: null }).zapisz(Z_KALENDARZA);
  const udana = await stanowisko({ data: [{ id: 'LOG-1' }], error: null }).zapisz(Object.assign({}, Z_KALENDARZA, { pola: { comment: 'nogi ok' } }));
  assert.deepEqual(plain(pusta), plain(udana));
});

test('(3) inne puste kształty też: bez pól, same undefined, brak obiektu pól', async () => {
  for (const pola of [{}, { distance_km: undefined, pace: undefined, feel: undefined }, undefined]) {
    const s = stanowisko({ data: [], error: null });
    const r = await s.zapisz({ idLoguDoEdycji: 'LOG-1', typ: undefined, pola });
    assert.equal(r.ok, true, JSON.stringify(pola));
    assert.equal(s.wolania.length, 0);
  }
});

test('(4) pusta zmiana zwalnia zamek zapisu: następny zapis idzie normalnie', async () => {
  const s = stanowisko({ data: [{ id: 'LOG-1' }], error: null });
  await s.zapisz(Z_KALENDARZA);
  const r = await s.zapisz(Object.assign({}, Z_KALENDARZA, { pola: { comment: 'x' } }));
  assert.equal(r.ok, true);
  assert.equal(r.wToku, undefined, 'zamek „zapis w toku” nie został zablokowany');
  assert.equal(s.wpisy().length, 1);
});

test('(5) NIEPUSTA zmiana i zero wierszy: błąd, zdanie dla zawodnika, techniczny opis w client_errors bez zmian', async () => {
  const s = stanowisko({ data: [], error: null });
  const r = await s.zapisz(Object.assign({}, Z_KALENDARZA, { pola: { comment: 'nogi ciężkie' } }));
  await czekaj();
  assert.equal(r.ok, false);
  assert.equal(r.komunikat, KOMUNIKAT_ZERO);
  assert.ok(!/RLS|polityk/i.test(r.komunikat), 'zawodnik nie dostaje tekstu o politykach');
  assert.equal(s.wpisy().length, 1, 'update poszedł');
  assert.deepEqual(plain(s.wpisy()[0].payload), { comment: 'nogi ciężkie' });
  assert.deepEqual(s.wpisy()[0].warunki, [['id', 'LOG-1'], ['athlete_id', 'a-1']]);
  assert.equal(s.bledy.length, 1);
  assert.equal(s.bledy[0].kind, 'zapis');
  assert.equal(s.bledy[0].message, TECHNICZNY, 'client_errors dostaje ten sam techniczny opis co dotąd');
});

test('(6) prawdziwy błąd bazy dalej idzie przez komunikatBledu, nie przez zdanie o usuniętym wpisie', async () => {
  const s = stanowisko({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } });
  const r = await s.zapisz(Object.assign({}, Z_KALENDARZA, { pola: { comment: 'x' } }));
  assert.equal(r.ok, false);
  assert.equal(r.komunikat, s.w.komunikatBledu({ code: '42501', message: 'new row violates row-level security policy' }));
  assert.notEqual(r.komunikat, KOMUNIKAT_ZERO);
});

test('(7) udana edycja i nowy wpis bez zmian', async () => {
  const s = stanowisko({ data: [{ id: 'LOG-1' }], error: null });
  const r = await s.zapisz(Object.assign({}, Z_KALENDARZA, { pola: { strava_link: 'https://www.strava.com/activities/1' } }));
  assert.deepEqual(plain(r), { ok: true, id: 'LOG-1', powtorzony: false });
  const t = stanowisko({ data: [], error: null });
  const n = await t.zapisz({ typ: 'Spokojny', pola: {} });
  assert.equal(n.ok, true, 'nowy wpis z pustymi polami to INSERT, nie edycja: poprawka go nie dotyczy');
  assert.equal(t.wpisy()[0].op, 'insert');
});

test('(8) okno dnia w kalendarzu: przy ok zamyka się, przy błędzie pokazuje komunikat i zostaje', () => {
  const k = fs.readFileSync(path.join(__dirname, '..', 'kalendarz.html'), 'utf8').replace(/\r/g, '');
  const a = k.indexOf('const _w = await window.zapiszLog({'), b = k.indexOf('closeModal();', a);
  assert.ok(a > 0 && b > a, 'saveTraining woła zapiszLog, a po nim closeModal');
  const odcinek = k.slice(a, b);
  assert.match(odcinek, /pola: existingLog\s*\? \{ strava_link: logStrava \|\| undefined, comment: _kom \|\| undefined \}/, 'istniejący wpis: tylko Strava i komentarz, puste jako undefined (stąd pusta zmiana)');
  assert.match(odcinek, /if \(!_w\.ok\) \{ if \(_w\.komunikat\) notify\(_w\.komunikat\); return; \}/, 'błąd: komunikat i wyjście przed zamknięciem okna');
});
