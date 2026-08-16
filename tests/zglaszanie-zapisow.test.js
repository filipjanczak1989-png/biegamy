// ─────────────────────────────────────────────────────────────────────────────
// ZGŁASZANIE ODRZUCONYCH ZAPISÓW — window.zglosNieudanyZapis.
//
// BLIZNA: do 16.08.2026 nie mieliśmy ŻADNEJ widoczności, jak często komuś nie
// udaje się czegoś zapisać. PostgREST oddaje błąd jako WARTOŚĆ, nie wyjątek,
// więc listener 'error' go nie widzi. O Adamie (2.08, ~49 nieudanych prób
// zapisu treningu) dowiedzieliśmy się WYŁĄCZNIE po śladzie w storage — czyli
// przez usterkę, którą tego samego dnia naprawiliśmy. Ten ślad już nie powstanie.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { zaladujSb } = require('./_srodowisko.js');

/** Kontekst z podstawioną atrapą sb, która ZAPISUJE wiersze zamiast je połykać. */
function stanowisko(opcje) {
  opcje = opcje || {};
  const w = zaladujSb();
  const wiersze = [];
  let wywolan = 0;
  w.sb = {
    from(tabela) {
      return {
        insert(row) {
          wywolan++;
          wiersze.push({ tabela, row });
          return {
            then(res, rej) {
              return opcje.zapisPada
                ? Promise.resolve().then(() => rej({ message: 'client_errors odrzucone' }))
                : Promise.resolve().then(() => res({ error: null }));
            },
          };
        },
      };
    },
  };
  w.navigator = { userAgent: 'test' };

  /* !! _authUid TRZEBA USTAWIAĆ PRZED KAŻDYM WYWOŁANIEM, nie raz na starcie.
     sb.js przy ładowaniu woła sb.auth.getSession() i w handlerze ustawia
     window._authUid — atrapa środowiska nie ma sesji, więc po pierwszym
     mikrozadaniu wpisuje tam null. Pierwsze wywołanie zdąży przed tym, drugie
     już nie, i test „druga próba nie doszła" wskazywał na zaciętą flagę,
     podczas gdy flaga działała poprawnie. Zdiagnozowane przez tymczasowe
     wystawienie flagi z domknięcia — 16.08.2026. */
  const zglos = (op, tab, err) => { w._authUid = 'UID-TEST'; return w.zglosNieudanyZapis(op, tab, err); };
  return { w, wiersze, ile: () => wywolan, zglos };
}

/** Realny kształt błędu PostgREST — z detail niosącym CAŁY odrzucony wiersz. */
const BLAD_CHECK = {
  code: '23514',
  message: 'new row for relation "training_logs" violates check constraint "training_logs_distance_sane"',
  details: 'Failing row contains (8c713bc0-bfeb-4e56-8d71-5b6d9d48fb8a, null, 767aa4e6-85db-441f-8c0e-46046e8005e7, 99999, …).',
  hint: 'jakas podpowiedz',
};

describe('⚠️ dane osobowe NIE trafiają do logu', () => {
  test('details NIE jest przekazywane — niesie CAŁY odrzucony wiersz', async () => {
    /* !! TEN TEST ISTNIEJE, ŻEBY ZA PÓŁ ROKU KTOŚ NIE „POPRAWIŁ" LOGOWANIA
       O PEŁNY KONTEKST BŁĘDU. Zmierzone na żywej bazie 16.08.2026:
       `message` niesie wyłącznie nazwę ograniczenia i tabeli, ale `details`
       niesie „Failing row contains (…)" razem z athlete_id i wszystkimi
       wartościami. Przy FK jest tam klucz: „Key (athlete_id)=(…)". */
    const st = stanowisko();
    st.zglos('insert', 'training_logs', BLAD_CHECK);
    await new Promise((r) => setTimeout(r, 10));
    const zapis = JSON.stringify(st.wiersze[0]);
    assert.doesNotMatch(zapis, /Failing row contains/, 'CAŁY WIERSZ trafił do logu');
    assert.doesNotMatch(zapis, /8c713bc0|767aa4e6/, 'identyfikatory z wiersza trafiły do logu');
    assert.doesNotMatch(zapis, /jakas podpowiedz/, 'hint trafił do logu');
  });

  test('a to, co POTRZEBNE, trafia: operacja, tabela, KOD, komunikat', async () => {
    const st = stanowisko();
    st.zglos('insert', 'training_logs', BLAD_CHECK);
    await new Promise((r) => setTimeout(r, 10));
    const r = st.wiersze[0].row;
    assert.equal(r.kind, 'zapis');
    assert.equal(r.source, 'training_logs');
    assert.match(r.message, /^insert/, 'brak operacji');
    assert.match(r.message, /23514/, 'brak KODU — bez niego wiemy, że padło, ale nie co');
    assert.match(r.message, /distance_sane/, 'brak nazwy ograniczenia');
  });
});

describe('⚠️ pętla — błąd w logowaniu błędów nie może zapętlić aplikacji', () => {
  test('gdy zapis do client_errors PADNIE, nie ma rekurencji', async () => {
    const st = stanowisko({ zapisPada: true });
    st.zglos('insert', 'training_logs', BLAD_CHECK);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(st.ile(), 1, 'porażka logowania wywołała kolejne logowanie: ' + st.ile() + ' wywołań');
  });

  test('po nieudanym zgłoszeniu NASTĘPNE nadal działa (flaga nie zostaje wciśnięta)', async () => {
    const st = stanowisko({ zapisPada: true });
    st.zglos('insert', 'training_logs', BLAD_CHECK);
    await new Promise((r) => setTimeout(r, 20));
    st.zglos('update', 'athletes', BLAD_CHECK);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(st.ile(), 2, 'druga próba nie doszła — _wZglaszaniu zostało wciśnięte');
  });

  test('zgłoszenie o samym client_errors jest odrzucane u źródła', async () => {
    const st = stanowisko();
    st.zglos('insert', 'client_errors', BLAD_CHECK);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(st.ile(), 0);
  });

  test('bez sesji nie zgłaszamy — RLS i tak by odrzucił', async () => {
    const st = stanowisko();
    st.w._authUid = null;
    // ⚠️ CELOWO z pominięciem helpera `zglos` — on ustawia sesję, a ten test
    //    sprawdza właśnie jej brak.
    st.w.zglosNieudanyZapis('insert', 'training_logs', BLAD_CHECK);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(st.ile(), 0);
  });
});

describe('komunikat dla człowieka mówi, CO ZROBIĆ', () => {
  const w = zaladujSb();
  const P = [
    [{ code: '42501', message: 'new row violates row-level security policy' }, /uprawnień.*Wyloguj/],
    [{ code: '23503', message: 'violates foreign key constraint' }, /sesja wygasła/],
    [{ code: '23514', message: 'violates check constraint "training_logs_distance_sane"' }, /Dystans/],
    [{ code: 'PGRST116', message: 'no rows' }, /Odśwież stronę/],
    [{ message: 'TypeError: Failed to fetch' }, /Brak połączenia/],
  ];
  for (const [blad, wzor] of P) {
    test((blad.code || 'sieć') + ' → zdanie z instrukcją', () => {
      assert.match(w.komunikatBledu(blad), wzor);
    });
  }

  test('⚠️ NIEZNANY kod: zdanie ogólne, ale KOD MUSI zostać', () => {
    /* Najważniejszy przypadek. Kodów, których nie widzieliśmy, nie tłumaczymy —
       ale bez kodu w komunikacie wiedzielibyśmy, że coś padło, i nic więcej. */
    const t = w.komunikatBledu({ code: '99999', message: 'cos zupelnie nowego' });
    assert.match(t, /Nie udało się zapisać/);
    assert.match(t, /99999/, 'kod zniknął z komunikatu — nie da się dopisać tłumaczenia');
  });

  test('żaden komunikat nie zawiera angielskiego tekstu bazy', () => {
    for (const [blad] of P) {
      assert.doesNotMatch(w.komunikatBledu(blad), /violates|constraint|row-level|fetch/i);
    }
  });
});
