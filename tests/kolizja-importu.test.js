// ─────────────────────────────────────────────────────────────────────────────
// KOLIZJA IMPORTU Z WPISEM RĘCZNYM — trzy ścieżki decyzji.
//
// BLIZNA: 18.08.2026 Damian podłączył zegarek mając wpisany ręcznie dzienniczek.
// `intervals-sync` deduplikował WYŁĄCZNIE wobec wcześniejszych importów (po
// `external_id`) i o pracy człowieka nie wiedział nic — zaimportował te same
// biegi drugi raz. 18,5 km wpadło do licznika wyzwania podwójnie.
//
// !! TO NIE BYŁ INCYDENT JEDNEGO KONTA. Zmierzone tego samego dnia: pięć osób
//    ma dni z obydwoma źródłami, a Damian Bolewski ma ich 62 — od kwietnia,
//    i nikt tego nie zauważył przez cztery miesiące.
//
// !! ZASADA, KTÓREJ PILNUJE TEN ZESTAW: przy wątpliwości importuj osobno.
//    Duplikat jest WIDOCZNY (wyjdzie w liczniku, u trenera, w oczy zawodnikowi).
//    Błędne scalenie jest NIEWIDOCZNE — dwa różne treningi zlewają się w jeden
//    i nie ma czego porównać. Dlatego testy „import obok" są tu równie ważne
//    jak test scalenia; gałąź, która scala za chętnie, przechodzi ten plik tylko
//    wtedy, gdy scala WYŁĄCZNIE przy jednym pasującym kandydacie.
const test = require('node:test');
const assert = require('node:assert');

let M;
test.before(async () => {
  M = await import('../supabase/functions/_shared/kolizja-importu.mjs');
});

const bieg = (km) => ({ distance_km: km, isRun: true });
const reczny = (id, km, typ) => ({
  id, distance_km: km, training_type: typ || 'Spokojny',
  external_id: null, source: 'ocr'
});

test('ŚCIEŻKA 1 — kolizja jednoznaczna → wzbogacenie', async (t) => {
  await t.test('ten sam dystans co do metra (przypadek Damiana 16.08)', () => {
    // ręcznie 18,48 km, z zegarka 18,49 km — różnica 0,05%
    const d = M.rozstrzygnijKolizje(bieg(18.49), [reczny('A', 18.48)]);
    assert.strictEqual(d.akcja, 'wzbogac');
    assert.strictEqual(d.cel, 'A');
  });

  await t.test('różnica na granicy tolerancji (5%) nadal scala', () => {
    const d = M.rozstrzygnijKolizje(bieg(10.0), [reczny('A', 9.5)]);
    assert.strictEqual(d.akcja, 'wzbogac');
  });

  await t.test('wzbogacenie NIE dotyka wkładu człowieka', () => {
    const dane = M.zbudujWzbogacenie({
      heart_rate: 120, pace: '5:24', cadence: 176, external_id: 'i176363815',
      feel: 'good', comment: 'Było oki', training_type: 'Wybieganie',
      distance_km: 18.49, duration: '1:39:58', attachment_url: 'https://x/y.jpg'
    });
    for (const zakazane of ['feel', 'comment', 'training_type', 'distance_km',
                            'duration', 'attachment_url']) {
      assert.ok(!(zakazane in dane), 'wzbogacenie nadpisuje ' + zakazane);
    }
    assert.strictEqual(dane.heart_rate, 120);
    assert.strictEqual(dane.external_source, 'intervals',
      'brak śladu wzbogacenia — external_source jest JEDYNYM znacznikiem');
  });
});

test('ŚCIEŻKA 2 — dwa wpisy ręczne tego samego dnia → import obok', async (t) => {
  await t.test('⚠️ dwa pasujące → NIE zgadujemy, który', () => {
    const d = M.rozstrzygnijKolizje(bieg(10.0), [reczny('A', 10.0), reczny('B', 9.9)]);
    assert.strictEqual(d.akcja, 'wstaw');
    assert.strictEqual(d.powod, 'wielu_kandydatow');
  });

  await t.test('…nawet gdy jeden jest „bliższy" — najbliższy to zgadywanie', () => {
    const d = M.rozstrzygnijKolizje(bieg(10.0), [reczny('A', 10.0), reczny('B', 10.2)]);
    assert.strictEqual(d.akcja, 'wstaw');
  });

  /* ⚠️ ROZSTRZYGNIĘCIE, KTÓRE TRZEBA ZNAĆ: „dwa wpisy tego samego dnia" nie
     blokuje scalenia SAMO Z SIEBIE. Blokuje je dopiero DWÓCH PASUJĄCYCH.
     Ktoś, kto biega dwa razy dziennie o wyraźnie różnych dystansach, nadal
     dostaje wzbogacenie — inaczej reguła nigdy by się nie odezwała u nikogo
     trenującego dwa razy dziennie. */
  await t.test('dwa ręczne, ale tylko jeden w tolerancji → wzbogacenie', () => {
    const d = M.rozstrzygnijKolizje(bieg(10.0), [reczny('A', 10.0), reczny('B', 4.0)]);
    assert.strictEqual(d.akcja, 'wzbogac');
    assert.strictEqual(d.cel, 'A');
  });
});

test('ŚCIEŻKA 3 — dystans różny o 15% → import obok', async (t) => {
  await t.test('15% poza tolerancją', () => {
    const d = M.rozstrzygnijKolizje(bieg(10.0), [reczny('A', 8.5)]);
    assert.strictEqual(d.akcja, 'wstaw');
    assert.strictEqual(d.powod, 'brak_dopasowania');
  });

  await t.test('przypadek Damiana 18.08 (9,8%) — świadomie NIE scalamy', () => {
    // ręcznie 10,27 km, z zegarka 11,28 km — nie wiemy, czy to jeden trening
    const d = M.rozstrzygnijKolizje(bieg(11.28), [reczny('A', 10.27)]);
    assert.strictEqual(d.akcja, 'wstaw');
  });
});

test('BARIERY, bez których reguła szkodzi', async (t) => {
  await t.test('⚠️ rower NIE scala się z biegiem mimo identycznego dystansu', () => {
    // przypadek Damiana 15.08: ręcznie „Regeneracja 24,89", z zegarka „Rower 24,89"
    const d = M.rozstrzygnijKolizje({ distance_km: 24.89, isRun: false },
                                    [reczny('A', 24.89, 'Regeneracja')]);
    assert.strictEqual(d.akcja, 'wstaw', 'sam dystans zlałby rower z biegiem');
  });

  await t.test('brak dystansu (siłownia) → zawsze osobno', () => {
    const d = M.rozstrzygnijKolizje({ distance_km: null, isRun: false },
                                    [reczny('A', 1, 'Wzmacniający')]);
    assert.strictEqual(d.akcja, 'wstaw');
    assert.strictEqual(d.powod, 'brak_dystansu');
  });

  await t.test('wpis już wzbogacony nie jest ruszany drugi raz', () => {
    const k = reczny('A', 10.0); k.external_id = 'i123';
    assert.strictEqual(M.rozstrzygnijKolizje(bieg(10.0), [k]).akcja, 'wstaw');
  });

  await t.test('wiersz z importu nie jest kandydatem (dedup robi to piętro wyżej)', () => {
    const k = reczny('A', 10.0); k.source = 'intervals';
    assert.strictEqual(M.rozstrzygnijKolizje(bieg(10.0), [k]).akcja, 'wstaw');
  });

  await t.test('brak kandydatów → zwykły import', () => {
    assert.strictEqual(M.rozstrzygnijKolizje(bieg(10.0), []).akcja, 'wstaw');
    assert.strictEqual(M.rozstrzygnijKolizje(bieg(10.0), null).akcja, 'wstaw');
  });
});

test('lista typów biegowych zgadza się z sb.js', async () => {
  const fs = require('fs');
  const sb = fs.readFileSync(require('path').join(__dirname, '..', 'sb.js'), 'utf8');
  const m = sb.match(/window\.RUN_TYPES = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(m, 'nie znalazłem RUN_TYPES w sb.js');
  const zSb = new Set((m[1].match(/'([^']+)'/g) || []).map(x => x.slice(1, -1)));
  assert.deepStrictEqual([...M.RUN_TYPES].sort(), [...zSb].sort(),
    'kopia RUN_TYPES w kolizja-importu.mjs rozjechała się z sb.js');
});
