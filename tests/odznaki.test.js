// ─────────────────────────────────────────────────────────────────────────────
// ODZNAKI — cisza backfillu, filtr wyzwania, doba warszawska w oknie wyzwania.
//
// BLIZNA GŁÓWNA (15.08.2026, dzień otwarcia wyzwania): Tomasz Kopeć dostał
// 11 odznak w cichej paczce, w tym `razem_wrzesien_2026` — zero powiadomień,
// zero pusha, mimo subskrypcji i spełnionego warunku. Cisza backfillu wyciszała
// też odznakę zdobytą DZIŚ, czyli jedyną, o której człowiek chciał wiedzieć.
//
// !! ATRAPA JEST LICZĄCA, NIE POŁYKAJĄCA. Atrapa, która tylko przyjmuje
//    wywołanie i oddaje `{data:[],error:null}`, przepuściłaby ten test na
//    zielono także wtedy, gdyby filtr wysyłał 21 wierszy zamiast 1 — albo zero.
//    Dlatego zapisuje KAŻDY wiersz idący do achievements i do notifications,
//    a testy sprawdzają LICZBY, nie sam fakt wywołania. Pilnuje tego
//    `describe('atrapa mierzy…')` niżej: przyrząd pomiarowy też ma test.
//
// !! ROZRÓŻNIENIE, KTÓREGO PILNUJE CAŁY TEN PLIK:
//        cisza filtruje POWIADOMIENIA, nie ZAPIS.
//    W każdym z trzech przypadków do `achievements` idzie KOMPLET (41 odznak).
//    Gdyby ktoś kiedyś pomylił jedno z drugim i przefiltrował upsert, ludzie
//    traciliby odznaki, nie tylko pushe — a strata byłaby cicha, bo backfill
//    z definicji nic nie wyświetla.
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { zaladujStrone } = require('./_srodowisko.js');

// Strona ładuje się raz (605 kB, 9 bloków). Stan resetuje KAŻDY przebieg
// przez `przygotuj()` — _earnedBadges, _badgeKolejka, _athleteId, sb i setTimeout
// są nadpisywane przed każdym wywołaniem, więc testy się nie zarażają.
const ctx = zaladujStrone('zawodnik.html');
const ID_WYZWAN = vm.runInContext('WYZWANIA.map(w => w.id)', ctx);
const ID_ZWYKLE = vm.runInContext('BADGES.map(b => b.id)', ctx)
  .filter((id) => !ID_WYZWAN.includes(id));

const ATLETA = 'ATLETA-TEST';

/** Atrapa Supabase, która ZAPISUJE każdy wiersz. Zwraca też własny dziennik. */
function atrapaSb() {
  const zapisy = { achievements: [], notifications: [], wywolania: [] };

  function budowniczy(tabela) {
    let odpowiedz = { data: null, error: null, count: 0 };
    const b = {
      upsert(wiersze) {
        zapisy.wywolania.push(tabela + '.upsert');
        const t = [].concat(wiersze);
        zapisy[tabela] ? zapisy[tabela].push(...t) : (zapisy[tabela] = t);
        // .select('badge_id') oddaje to, co FAKTYCZNIE weszło — atrapa udaje
        // świeży zapis, czyli wszystko. Konflikt UNIQUE ma osobny test niżej.
        odpowiedz = { data: t.map((r) => ({ badge_id: r.badge_id })), error: null };
        return b;
      },
      insert(wiersze) {
        zapisy.wywolania.push(tabela + '.insert');
        const t = [].concat(wiersze);
        zapisy[tabela] ? zapisy[tabela].push(...t) : (zapisy[tabela] = t);
        odpowiedz = { data: t, error: null };
        return b;
      },
      then(res, rej) { return Promise.resolve(odpowiedz).then(res, rej); },
      catch(f) { return Promise.resolve(odpowiedz).catch(f); },
      finally(f) { return Promise.resolve(odpowiedz).finally(f); },
    };
    // Reszta łańcucha PostgREST nic nie zmienia w pomiarze — oddaje ten sam budowniczy.
    for (const m of ['select', 'eq', 'neq', 'not', 'in', 'gt', 'gte', 'lt', 'lte',
                     'like', 'ilike', 'is', 'or', 'order', 'limit', 'range',
                     'maybeSingle', 'single', 'contains']) b[m] = () => b;
    return b;
  }

  return { sb: { from: (t) => budowniczy(t) }, zapisy };
}

/** Czysty stan przed każdym przebiegiem + podpięta atrapa. */
function przygotuj() {
  const { sb, zapisy } = atrapaSb();
  ctx.sb = sb;
  // Pop-upy: przechwytujemy zamiast wykonywać. Dwa powody — showBadgePopup
  // rusza DOM, a odstęp 4200 ms trzymałby proces testowy przy życiu.
  // Przy okazji daje drugi, niezależny licznik „ile rzeczy poszło głośno".
  const popupy = [];
  ctx.setTimeout = (fn, ms) => { popupy.push(ms); return 0; };
  return { zapisy, popupy };
}

/** Uruchamia _wyslijOdznaki WEWNĄTRZ kontekstu — _badgeKolejka i _athleteId to `let`
 *  w bloku <script>, więc nie widać ich jako właściwości kontekstu. */
async function wyslij(idki, cicho) {
  return vm.runInContext(`(async () => {
    window._earnedBadges = new Set();
    _athleteId = ${JSON.stringify(ATLETA)};
    _badgeKolejka = new Set(${JSON.stringify(idki)});
    return await _wyslijOdznaki(${cicho === true});
  })()`, ctx);
}

/** Uruchamia reguły na podanych logach i oddaje zawartość kolejki. */
async function reguly(logi) {
  return vm.runInContext(`(async () => {
    window._earnedBadges = new Set();
    _athleteId = ${JSON.stringify(ATLETA)};
    _badgeKolejka = new Set();
    await _checkBadgeRules(JSON.parse(${JSON.stringify(JSON.stringify(logi))}), { follows: null, signups: null });
    return [..._badgeKolejka];
  })()`, ctx);
}

// Paczka 41 odznak = liczba zmierzona u Kasi 15.08.2026 przy usuwaniu guardu
// _obcyProfil (41 zaległych). 40 historycznych + 1 wyzwaniowa.
const PACZKA_Z_WYZWANIEM = [...ID_ZWYKLE.slice(0, 40), 'razem_wrzesien_2026'];
const PACZKA_BEZ_WYZWANIA = ID_ZWYKLE.slice(0, 41);

describe('atrapa mierzy, a nie połyka (przyrząd pomiarowy też ma test)', () => {
  // Bez tego cały plik mógłby świecić na zielono przy DOWOLNEJ liczbie wierszy.
  test('upsert zapisuje wiersze i oddaje je w .select()', async () => {
    const { sb, zapisy } = atrapaSb();
    const r = await sb.from('achievements')
      .upsert([{ badge_id: 'a' }, { badge_id: 'b' }, { badge_id: 'c' }], {})
      .select('badge_id');
    assert.equal(zapisy.achievements.length, 3, 'atrapa ma ZAPISAĆ, nie połknąć');
    assert.deepEqual(r.data.map((x) => x.badge_id), ['a', 'b', 'c']);
    assert.equal(r.error, null);
  });

  test('insert zapisuje wiersze i odnotowuje wywołanie', async () => {
    const { sb, zapisy } = atrapaSb();
    await sb.from('notifications').insert([{ m: 1 }, { m: 2 }]);
    assert.equal(zapisy.notifications.length, 2);
    assert.deepEqual(zapisy.wywolania, ['notifications.insert']);
  });

  test('nietkniętа tabela ma ZERO wierszy i ZERO wywołań', async () => {
    const { zapisy } = atrapaSb();
    assert.equal(zapisy.notifications.length, 0);
    assert.equal(zapisy.wywolania.length, 0);
  });
});

describe('filtr WYZW — trzy liczby, każda osobno', () => {
  test('cicho=true + odznaka wyzwania w paczce -> DOKŁADNIE 1 powiadomienie', async () => {
    const { zapisy, popupy } = przygotuj();
    const ile = await wyslij(PACZKA_Z_WYZWANIEM, true);

    assert.equal(zapisy.notifications.length, 1, 'ma przejść wyłącznie odznaka wyzwania');
    assert.match(zapisy.notifications[0].message, /Razem/, 'i to ta właściwa');
    assert.equal(zapisy.notifications[0].athlete_id, ATLETA);
    assert.equal(popupy.length, 1, 'pop-up też dokładnie jeden');
    assert.equal(ile, 41, 'zwraca liczbę ZAPISANYCH, nie zgłoszonych');
  });

  test('cicho=true bez odznaki wyzwania -> DOKŁADNIE 0 powiadomień', async () => {
    const { zapisy, popupy } = przygotuj();
    const ile = await wyslij(PACZKA_BEZ_WYZWANIA, true);

    assert.equal(zapisy.notifications.length, 0);
    // Mocniej niż zero wierszy: insert na notifications nie ma prawa się ODBYĆ.
    // Trigger notifications_send_push siedzi na AFTER INSERT, więc każdy wiersz
    // to push na telefon — 41 pushy za treningi sprzed miesięcy.
    assert.equal(zapisy.wywolania.includes('notifications.insert'), false);
    assert.equal(popupy.length, 0, 'zero pop-upów = 0 s zamiast 172 s');
    assert.equal(ile, 41);
  });

  test('cicho=false -> tyle powiadomień, ile odznak', async () => {
    const { zapisy, popupy } = przygotuj();
    const ile = await wyslij(PACZKA_Z_WYZWANIEM, false);

    assert.equal(zapisy.notifications.length, 41);
    assert.equal(popupy.length, 41);
    assert.equal(ile, 41);
  });
});

describe('cisza filtruje POWIADOMIENIA, nie ZAPIS', () => {
  // !! To jest sedno. Gdyby filtr trafił do upsertu, ludzie traciliby ODZNAKI.
  //    Strata byłaby cicha z definicji — backfill nic nie wyświetla.
  const przypadki = [
    ['cicho=true, z wyzwaniem', PACZKA_Z_WYZWANIEM, true, 1],
    ['cicho=true, bez wyzwania', PACZKA_BEZ_WYZWANIA, true, 0],
    ['cicho=false', PACZKA_Z_WYZWANIEM, false, 41],
  ];
  for (const [opis, paczka, cicho, oczekPowiadomien] of przypadki) {
    test(`${opis}: achievements = KOMPLET 41, notifications = ${oczekPowiadomien}`, async () => {
      const { zapisy } = przygotuj();
      await wyslij(paczka, cicho);

      assert.equal(zapisy.achievements.length, 41, 'do achievements ma iść komplet');
      assert.equal(new Set(zapisy.achievements.map((r) => r.badge_id)).size, 41,
        'komplet RÓŻNYCH odznak, nie 41 kopii jednej');
      assert.equal(zapisy.achievements.every((r) => r.athlete_id === ATLETA), true);
      assert.equal(zapisy.notifications.length, oczekPowiadomien);
    });
  }

  test('liczba w achievements NIE zależy od cicho — porównanie wprost', async () => {
    const a = przygotuj(); await wyslij(PACZKA_Z_WYZWANIEM, true);
    const b = przygotuj(); await wyslij(PACZKA_Z_WYZWANIEM, false);
    assert.equal(a.zapisy.achievements.length, b.zapisy.achievements.length);
    assert.notEqual(a.zapisy.notifications.length, b.zapisy.notifications.length);
  });
});

describe('pusta kolejka — zero wszystkiego, bez pustego zapytania', () => {
  test('brak nowych odznak nie dotyka ŻADNEJ tabeli', async () => {
    const { zapisy } = przygotuj();
    const ile = await wyslij([], true);
    assert.equal(ile, 0);
    assert.equal(zapisy.wywolania.length, 0, 'zero round-tripów przy pustym przebiegu');
  });
});

describe('okno wyzwania liczy DOBĘ WARSZAWSKĄ, nie UTC', () => {
  // BLIZNA: reguła porównywała `String(logged_at).slice(0,10)`, czyli dobę UTC.
  // Okno wyzwania otwiera się 2026-08-15. Bieg o 00:51 czasu polskiego 15.08 to
  // 22:51 UTC dnia POPRZEDNIEGO — dla starej wersji '2026-08-14', czyli PRZED
  // otwarciem. Człowiek pobiegł w pierwszym dniu wyzwania i nie został policzony.
  const log = (kiedy, km) => ({ logged_at: kiedy, distance_km: km, training_type: 'Spokojny', pace: null, feel: null });

  test('stary slice(0,10) FAKTYCZNIE wykluczał ten log — założenie testu', () => {
    assert.equal('2026-08-14T22:51:05+00:00'.slice(0, 10), '2026-08-14');
    assert.ok('2026-08-14' < '2026-08-15', 'czyli wypadał przed otwarciem okna');
    assert.equal(ctx.window._dzienWaw('2026-08-14T22:51:05+00:00'), '2026-08-15');
  });

  test('bieg o 22:51 UTC 14.08 WPADA do okna (00:51 czasu polskiego 15.08)', async () => {
    const kolejka = await reguly([log('2026-08-14T22:51:05+00:00', 5)]);
    assert.ok(kolejka.includes('razem_wrzesien_2026'),
      'log z pierwszej godziny wyzwania musi się liczyć');
  });

  test('bieg o 20:00 UTC 14.08 NIE wpada (22:00 czasu polskiego, wciąż 14.08)', async () => {
    const kolejka = await reguly([log('2026-08-14T20:00:00+00:00', 5)]);
    assert.equal(kolejka.includes('razem_wrzesien_2026'), false,
      'okno ma granicę, nie ma być rozciągnięte w drugą stronę');
  });

  test('ostatnia godzina okna po stronie warszawskiej też się liczy', async () => {
    // 2026-09-20 23:30 czasu polskiego = 21:30 UTC tego samego dnia.
    const kolejka = await reguly([log('2026-09-20T21:30:00+00:00', 5)]);
    assert.ok(kolejka.includes('razem_wrzesien_2026'));
  });

  test('dzień po zamknięciu okna nie liczy się mimo bliskiej godziny UTC', async () => {
    // 2026-09-20 22:30 UTC = 2026-09-21 00:30 w Warszawie — okno już zamknięte.
    const kolejka = await reguly([log('2026-09-20T22:30:00+00:00', 5)]);
    assert.equal(kolejka.includes('razem_wrzesien_2026'), false);
  });

  test('próg 100 km liczy tylko biegi Z OKNA', async () => {
    const kolejka = await reguly([
      log('2026-07-01T09:00:00+00:00', 200),          // przed oknem — nie liczy się
      log('2026-08-20T09:00:00+00:00', 60),
      log('2026-08-21T09:00:00+00:00', 45),           // 105 km w oknie
    ]);
    assert.ok(kolejka.includes('100km_wrzesien_2026'));
  });

  test('200 km sprzed okna NIE daje odznaki wyzwania', async () => {
    const kolejka = await reguly([log('2026-07-01T09:00:00+00:00', 200)]);
    assert.equal(kolejka.includes('100km_wrzesien_2026'), false);
    assert.ok(kolejka.includes('dystans_100'), 'ale odznaki historyczne — owszem');
  });

  test('trening nie-biegowy w oknie nie dolicza kilometrów', async () => {
    const kolejka = await reguly([
      { logged_at: '2026-08-20T09:00:00+00:00', distance_km: 150, training_type: 'Zastępczy', pace: null, feel: null },
    ]);
    assert.equal(kolejka.includes('100km_wrzesien_2026'), false);
  });
});
