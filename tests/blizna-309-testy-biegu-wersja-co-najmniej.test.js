/* BLIZNA 309 / 19.11: test po skutku v6 (tools/akcja-bieg-czas-z-tempa-v6-test.sql, krok 8a) sprawdzał „bieg-mikolajki na v6” równością,
   więc po migracji 20261217 (v7) padał FAIL 8a, choć v7 zachowuje wszystkie reguły v6. Testy po skutku sprawdzają wersję prawdziwego biegu
   „co najmniej vN” (akcja_bieg_wersja_od, jak odWersji na froncie), nigdy równością — kolejna wersja nie może wywracać starszych testów.
   Ten sam wzorzec poprawiony w kroku 9a testu v7. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('testy po skutku biegu: wersja prawdziwego biegu „co najmniej”, nie równością', () => {
  const testy = fs.readdirSync(path.join(KORZEN, 'tools')).filter((f) => /^akcja-bieg-.*-test\.sql$/.test(f));
  assert.ok(testy.length >= 15, 'testy biegu znalezione: ' + testy.length);
  for (const f of testy) {
    const s = czytaj('tools/' + f);
    assert.doesNotMatch(s, /\(select regulamin_wersja from public\.akcja_biegi where slug = 'bieg-mikolajki'\) is distinct from/, f + ': wersja prawdziwego biegu równością');
    assert.doesNotMatch(s, /regulamin_wersja\s*(=|<>|!=)\s*'2026-11-v\d+'[^;\n]*slug = 'bieg-mikolajki'|slug = 'bieg-mikolajki'[^;\n]*regulamin_wersja\s*(=|<>|!=)\s*'2026-11-v\d+'/, f + ': wersja prawdziwego biegu równością');
  }
  assert.match(czytaj('tools/akcja-bieg-czas-z-tempa-v6-test.sql'), /if not public\.akcja_bieg_wersja_od\(\(select regulamin_wersja from public\.akcja_biegi where slug = 'bieg-mikolajki'\), 6\) then raise exception 'FAIL 8a: bieg-mikolajki poniżej v6'; end if;/);
  assert.match(czytaj('tools/akcja-bieg-v7-test.sql'), /if not public\.akcja_bieg_wersja_od\(\(select regulamin_wersja from public\.akcja_biegi where slug = 'bieg-mikolajki'\), 7\) then raise exception 'FAIL 9a: bieg-mikolajki poniżej v7'; end if;/);
});
