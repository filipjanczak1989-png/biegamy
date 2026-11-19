/* BLIZNA 306 / 19.11: kolejność listy „Ukończyli” (decyzja Filipa). Lista „Wszyscy” (jedyna przy biegu z jednym dystansem) szła od najnowszego ukończenia,
   a ranking z miejscami był rozsiany po liście („3.” nad „1.”). Migracja 20261216 (dwie jednoliniowe kotwice w akcja_bieg_ukonczyli): najpierw ranking w każdym
   dystansie od 1. miejsca, potem reszta jak dotąd (ukonczony_at desc, numer). Zakładka dystansu bez zmian. Front rysuje wiersze w kolejności z serwera.
   Test po skutku: tools/akcja-bieg-ukonczyli-kolejnosc-test.sh (AKCJA_BIEG_KOLEJNOSC_Z_MIGRACJA=1 przed wdrożeniem). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const MIG = 'supabase/migrations/20261216_akcja_bieg_ukonczyli_kolejnosc.sql', WYC = 'supabase/migrations/20261216_WYCOFANIE_akcja_bieg_ukonczyli_kolejnosc.sql';
const pary = (s) => [...s.matchAll(/\(\d, 'public\.akcja_bieg_ukonczyli\(text, integer, integer, integer\)',\n\s+\$k\$([^\n]*?)\$k\$,\n\s+\$k\$([^\n]*?)\$k\$\)/g)].map((m) => [m[1], m[2]]);

test('migracja: dwie jednoliniowe kotwice w porządku listy, wycofanie = te same pary odwrotnie; bez danych i bez zmiany wersji', () => {
  const m = czytaj(MIG), w = czytaj(WYC), pm = pary(m), pw = pary(w);
  assert.deepEqual(pm, [
    ['row_number() over (order by case when p_dystans is not null and m.czas is not null then 0 else 1 end,', 'row_number() over (order by case when m.czas is not null then 0 else 1 end,'],
    ['case when p_dystans is not null then m.czas end nulls last, m.ukonczony_at desc, m.numer) as poz from m', 'case when m.czas is not null then m.wynik_dystans_km end, m.czas nulls last, m.ukonczony_at desc, m.numer) as poz from m']]);
  assert.deepEqual(pw, pm.map(([a, b]) => [b, a]).reverse(), 'wycofanie: pary odwrócone, w odwrotnej kolejności');
  for (const s of [m, w]) {
    assert.match(s, /if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy \(oczekiwano 1\), nic nie zmieniam'/);
    assert.match(s, /or not has_function_privilege\('service_role', 'public\.akcja_bieg_ukonczyli\(text, integer, integer, integer\)', 'execute'\) then/);
    assert.doesNotMatch(s, /update public\.|insert into|regulamin_wersja =|akcja_bieg_przelicz/, 'bez danych');
    assert.match(s, /^begin;$/m); assert.match(s, /^commit;\nnotify pgrst, 'reload schema';\n$/m);
  }
});

test('test po skutku: flaga AKCJA_BIEG_KOLEJNOSC_Z_MIGRACJA, transakcja wycofana, strażnik licznika, oczekiwana kolejność i prawdziwy bieg bez danych osób', () => {
  const sh = czytaj('tools/akcja-bieg-ukonczyli-kolejnosc-test.sh'), sq = czytaj('tools/akcja-bieg-ukonczyli-kolejnosc-test.sql');
  assert.match(sh, /if \[ "\$\{AKCJA_BIEG_KOLEJNOSC_Z_MIGRACJA:-0\}" = 1 \]; then tr -d '\\r' < supabase\/migrations\/20261216_akcja_bieg_ukonczyli_kolejnosc\.sql \| sed -e '\/\^begin;\$\/d' -e '\/\^commit;\$\/d' -e '\/\^notify pgrst\/d'; fi/);
  assert.match(sh, /echo 'rollback;'/); assert.doesNotMatch(sh, /echo 'commit;'/);
  assert.match(sq, /if kol is distinct from array\[2, 5, 1, 4, 6, 3\] then/);
  assert.match(sq, /if kol is distinct from array\[2, 5, 1, 3\] then/, 'zakładka dystansu jak przed migracją');
  assert.match(sq, /raise notice 'bieg-mikolajki: % na liście, % w rankingu', j->>'razem', j->>'w_rankingu';/, 'z prawdziwego biegu same liczby');
  assert.doesNotMatch(sq.slice(sq.indexOf('-- 6.')), /imie/, 'krok 6 nie czyta imion');
});

test('front: lista rysuje wiersze w kolejności z serwera (bez własnego sortowania), miejsca przy rankingu', async () => {
  globalThis.escapeHtml = (x) => String(x);
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href);
  const B = globalThis.BM_BIEG_REAL;
  const lista = [{ numer: 2, imie: 'Bogna', dystans_km: 5, czas_s: 1320, miejsce: 1 }, { numer: 1, imie: 'Anna', dystans_km: 5, czas_s: 1500, miejsce: 2 },
    { numer: 6, imie: 'Zosia', dystans_km: 1.5, dziecko: true }, { numer: 3, imie: null, dystans_km: 5 }];
  const h = B.ukonczyliHtml({ razem: 4, lista, w_rankingu: 2 }, []);
  const numery = [...h.matchAll(/<span class="bw-nr">(\d+)<\/span>/g)].map((m) => Number(m[1]));
  assert.deepEqual(numery, [2, 1, 6, 3], h.slice(0, 400));
  assert.match(h, /aria-label="miejsce 1">1\.<\/span>[\s\S]*aria-label="miejsce 2">2\.<\/span>/);
  assert.doesNotMatch(czytaj('js/bieg.mjs').slice(czytaj('js/bieg.mjs').indexOf('function ukonczyliHtml'), czytaj('js/bieg.mjs').indexOf('function zakladkiListyHtml')), /\.sort\(/);
});
