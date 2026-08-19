/* BLIZNA 18: import masowy padał w CAŁOŚCI przy jednym złym wierszu.
   Zgłoszone 14.08.2026 przy dokładaniu CHECK-a `training_logs_distance_sane`,
   naprawione 19.08.2026 w `intervals-sync`.

   ⚠️ KLASA BŁĘDU, KTÓRA WRÓCI: „batch albo nic". Kod brzmiał
       const { error } = await svc.from('training_logs').insert(rows);
       if (error) return J(200, { ok:false, error: error.message });
   czyli jedna aktywność łamiąca constraint kasowała synchronizację WSZYSTKICH
   pozostałych, a człowiek dostawał `ok:false` bez wskazania winnej. Dokładnie
   ten kształt pojawi się przy każdym następnym imporcie masowym — dlatego
   logika siedzi w `_shared/wstaw-z-odzyskiem.mjs`, a nie w ciele jednej funkcji.

   ⚠️ Test jest o KONTRAKCIE, nie o intervals: co się dzieje z wierszami, które
   PRZESZŁY, gdy jeden padnie, i czy da się powiedzieć KTÓRY odpadł. */
const test = require('node:test');
const assert = require('node:assert');

let W;
test.before(async () => { W = await import('../supabase/functions/_shared/wstaw-z-odzyskiem.mjs'); });

/* Atrapa klienta. `zle` = zbiór external_id, które mają odbić.
   ⚠️ Atrapa NIE waliduje kolumn — sprawdza tylko to, co sama zadeklaruje.
   Dlatego testy niżej mówią o PRZEPŁYWIE (ile weszło, co odpadło, co zwrócono),
   a nie o zgodności wierszy ze schematem; tego pilnuje CHECK w bazie. */
function atrapa({ zle = new Set(), rzucaj = new Set(), batchPada = true } = {}) {
  const wstawione = [];
  let batchow = 0, pojedynczych = 0;
  return {
    stan: () => ({ wstawione, batchow, pojedynczych }),
    from() {
      return {
        insert(x) {
          if (Array.isArray(x)) {
            batchow++;
            const maZle = x.some((w) => zle.has(w.external_id) || rzucaj.has(w.external_id));
            if (maZle && batchPada) return Promise.resolve({ error: { message: 'violates check constraint' } });
            wstawione.push(...x);
            return Promise.resolve({ error: null });
          }
          pojedynczych++;
          if (rzucaj.has(x.external_id)) return Promise.reject(new Error('sieć padła'));
          if (zle.has(x.external_id)) return Promise.resolve({ error: { message: 'distance_km poza zakresem' } });
          wstawione.push(x);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}
const wiersze = (n, od = 1) => Array.from({ length: n }, (_, i) => ({
  external_id: String(od + i), logged_at: '2026-08-0' + ((i % 9) + 1) + 'T10:00:00Z', distance_km: 10,
}));

test('18 — jeden zły wiersz nie zabija importu', async (t) => {

  await t.test('⚠️ ŚCIEŻKA NORMALNA KOSZTUJE JEDNO ZAPYTANIE, tyle co przed naprawą', async () => {
    /* To jest powód, dla którego NIE wybrano „zawsze wiersz po wierszu".
       Rutynowy sync wstawia 0–3 wiersze, ale pierwsze połączenie do 452 —
       pojedyncze inserty mnożyłyby round-tripy ~450x przy każdym pierwszym
       połączeniu, dla awarii, która dotąd nie zaszła. */
    const a = atrapa();
    const r = await W.wstawZOdzyskiem(a, 'training_logs', wiersze(452));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.wstawione, 452);
    assert.strictEqual(a.stan().batchow, 1, 'batch miał pójść dokładnie raz');
    assert.strictEqual(a.stan().pojedynczych, 0, 'bez błędu NIE wolno schodzić do wierszy');
  });

  await t.test('⚠️ 438 z 440 WCHODZI — reszta nie ginie przez dwa złe wiersze', async () => {
    const a = atrapa({ zle: new Set(['7', '199']) });
    const r = await W.wstawZOdzyskiem(a, 'training_logs', wiersze(440));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.wstawione, 438, 'przed naprawą wchodziło 0 z 440');
    assert.strictEqual(r.pominiete.length, 2);
    assert.deepStrictEqual(r.pominiete.map((p) => p.external_id).sort(), ['199', '7']);
  });

  await t.test('⚠️ POMINIĘTY NIESIE POWÓD I DATĘ, nie tylko liczbę', () => {
    /* Bez tego człowiek wie, że coś odpadło, i nie ma jak się dowiedzieć co —
       czyli dokładnie ten stan, na który była skarga („ok:false bez wskazania"). */
    return W.wstawZOdzyskiem(atrapa({ zle: new Set(['3']) }), 'training_logs', wiersze(10))
      .then((r) => {
        assert.strictEqual(r.pominiete.length, 1);
        const p = r.pominiete[0];
        assert.strictEqual(p.external_id, '3');
        assert.match(p.data, /^\d{4}-\d{2}-\d{2}$/, 'data ma być kluczem dnia, nie całym znacznikiem');
        assert.match(p.powod, /distance_km/, 'powód ma pochodzić z bazy, nie być wymyślony');
      });
  });

  await t.test('⚠️ GDY NIE PRZESZŁO NIC → ok:false z PIERWOTNYM błędem batcha', async () => {
    /* Awaria systemowa (zerwane połączenie, zły klucz) NIE jest „importem
       z pominięciami". Odpowiedź „zsynchronizowano 0 z 452" wyglądałaby na
       spokojny wynik — dlatego wołający ma dostać sygnał błędu. */
    const wsz = wiersze(25);
    const a = atrapa({ zle: new Set(wsz.map((w) => w.external_id)) });
    const r = await W.wstawZOdzyskiem(a, 'training_logs', wsz);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.wstawione, 0);
    assert.match(r.bladBatcha, /check constraint/, 'ma wrócić błąd BATCHA, nie ostatniego wiersza');
  });

  await t.test('⚠️ RZUCONY WYJĄTEK w odzysku nie wywala odzysku', async () => {
    /* Bez try/catch w środku Promise.all jeden rzut ubiłby całą fazę odzysku —
       czyli ten sam błąd, który naprawiamy, piętro wyżej. */
    const a = atrapa({ zle: new Set(['2']), rzucaj: new Set(['5']) });
    const r = await W.wstawZOdzyskiem(a, 'training_logs', wiersze(10));
    assert.strictEqual(r.wstawione, 8);
    assert.deepStrictEqual(r.pominiete.map((p) => p.external_id).sort(), ['2', '5']);
    assert.match(r.pominiete.find((p) => p.external_id === '5').powod, /sieć/);
  });

  await t.test('pusta lista nie woła bazy ani nie jest błędem', async () => {
    const a = atrapa();
    const r = await W.wstawZOdzyskiem(a, 'training_logs', []);
    assert.deepStrictEqual([r.ok, r.wstawione, r.bladBatcha], [true, 0, null]);
    assert.strictEqual(a.stan().batchow, 0);
  });

  /* ══ TEST NEGATYWNY ══════════════════════════════════════════════════════
     Odtwarzamy STARE zachowanie i sprawdzamy, że asercje wyżej BY JE ZŁAPAŁY.
     Bramka, która zielenieje, bo się wywaliła, jest gorsza niż jej brak. */
  await t.test('⚠️ REGRESJA NA „batch albo nic": stare zachowanie musi czerwienić', async () => {
    async function stareZachowanie(klient, tabela, w) {
      const { error } = await klient.from(tabela).insert(w);
      if (error) return { ok: false, wstawione: 0, pominiete: [], bladBatcha: error.message };
      return { ok: true, wstawione: w.length, pominiete: [], bladBatcha: null };
    }
    const stare = await stareZachowanie(atrapa({ zle: new Set(['7']) }), 'training_logs', wiersze(440));
    assert.strictEqual(stare.wstawione, 0, 'stara ścieżka gubiła WSZYSTKO — na tym polegała usterka');
    assert.strictEqual(stare.pominiete.length, 0, 'stara ścieżka nie umiała wskazać winnego wiersza');

    const nowe = await W.wstawZOdzyskiem(atrapa({ zle: new Set(['7']) }), 'training_logs', wiersze(440));
    assert.notStrictEqual(nowe.wstawione, stare.wstawione, 'nowa i stara ścieżka muszą się różnić');
    assert.ok(nowe.wstawione > 400 && stare.wstawione === 0);
  });
});

/* ══ KOMUNIKAT DLA CZŁOWIEKA ═══════════════════════════════════════════════
   Naprawa w bazie jest bezużyteczna, jeśli człowiek nadal widzi samo „✓".
   `WATCH._komunikatSync` to SSOT zdania — wołają go WATCH.sync i profil.html. */
test('18b — częściowy import jest WIDOCZNY, nie cichy', async (t) => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'sb.js'), 'utf8');
  const m = /_komunikatSync: function\(data, prefiks\) \{([\s\S]*?)\n {4}\},/.exec(src);
  assert.ok(m, 'nie znaleziono _komunikatSync w sb.js — SSOT komunikatu zniknął');
  const komunikat = new Function('data', 'prefiks', m[1]);

  await t.test('bez pominięć zdanie zostaje krótkie', () => {
    assert.strictEqual(komunikat({ synced: 440, pominietych: 0 }), 'Zsynchronizowano 440 treningów ✓');
  });

  await t.test('⚠️ z pominięciami MUSI paść liczba obu stron', () => {
    const t1 = komunikat({ synced: 438, pominietych: 2 });
    assert.match(t1, /438/); assert.match(t1, /440/); assert.match(t1, /2/);
    assert.ok(!/✓$/.test(t1), 'zdanie o stracie nie może kończyć się ptaszkiem sukcesu');
  });

  await t.test('liczba pojedyncza po polsku', () => {
    assert.match(komunikat({ synced: 439, pominietych: 1 }), /1 pominięty/);
    assert.match(komunikat({ synced: 438, pominietych: 2 }), /2 pominięte/);
  });
});
