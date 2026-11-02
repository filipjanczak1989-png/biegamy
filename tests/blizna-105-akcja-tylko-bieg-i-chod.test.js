/* BLIZNA 105 (2.11.2026, Filip 18:35) — do akcji liczą się TYLKO bieg i chód.
   Do 2.11 akcja liczyła „wszystkie typy" (rower 50 km = 50 km akcji). Teraz jedna lista w jednym miejscu: funkcja SQL
   public.akcja_typ_liczy (migracja 20261102_akcja_typy.sql), używana przez akcja_km_okna (licznik, wkład, push niedzielny,
   zamknięcie doby, share-card, odznaki km), wyprawę w akcja_licznik i akcja_moje_dni („7 dni z rzędu").
   Ten test czyta migawkę funkcji z PRODUKCJI (supabase/schema/funkcje, tools/funkcje-bazy.js --zrzut) i odtwarza regułę,
   żeby sprawdzić przypadki z polecenia bez bazy; na danych pilnuje tego tools/akcje-test-transakcji.sql (część 10). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const tablice = (sql) => [...sql.matchAll(/array\[([^\]]*)\]/gi)].map((m) => [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));

function regula() {
  const fn = czytaj('supabase/schema/funkcje/akcja_typ_liczy.sql'), bieg = tablice(czytaj('supabase/schema/funkcje/is_run_type.sql'))[0];
  const [chod, ext] = tablice(fn);
  assert.match(fn, /public\.is_run_type\(p_typ\)/, 'biegi z is_run_type — jedna lista biegów w bazie');
  return (typ, e) => {
    const t = typ == null ? null : String(typ).trim().toLowerCase();
    const ok = t != null && (bieg.includes(t) || chod.includes(t));
    return ok && (e == null || String(e).trim() === '' || ext.includes(e));
  };
}

test('przypadki z polecenia: rower 50 km = 0, spacer 5 km = 5, nieznany typ = 0', () => {
  const liczy = regula();
  const km = (wpisy) => wpisy.reduce((s, [typ, e, k]) => s + (liczy(typ, e) ? k : 0), 0);
  assert.equal(km([['Rower', null, 50]]), 0);
  assert.equal(km([['Rower', 'Ride', 50], ['Rower', 'EBikeRide', 30], ['Rower', 'VirtualRide', 20], ['Rower', 'MountainBikeRide', 9]]), 0);
  assert.equal(km([['Spacer', null, 5]]), 5);
  assert.equal(km([['Spacer', 'Walk', 5]]), 5);
  assert.equal(km([['Kajak', null, 7], ['inny', null, 3], ['Zastępczy', null, 4], ['Odpoczynek', null, 6], [null, null, 2]]), 0);
  for (const t of ['Pływanie', 'Siłownia', 'Joga', 'Narty', 'Ergometr', 'Orbitrek']) assert.equal(liczy(t, null), false, t);
  assert.equal(liczy('Spokojny', 'Ride'), false, 'rower przemianowany ręcznie na bieg nadal nie liczy');
  assert.equal(liczy('Spokojny', 'CośNowegoZZegarka'), false, 'nieznany typ z zegarka = nie liczy');
  for (const t of ['Nordic walking', 'Wędrówka', 'Marsz', 'Wzmacniający']) assert.equal(liczy(t, null), true, t);
});

test('każdy typ biegu z aplikacji liczy; mapa intervals: biegi i Walk/Hike liczą, rowery/pływanie/siła nie', async () => {
  const liczy = regula();
  const { RUN_TYPES } = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/_shared/reguly-treningow.mjs')).href);
  for (const t of RUN_TYPES) assert.equal(liczy(t, null), true, 'typ biegu ' + t);
  const M = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/_shared/typ-aktywnosci.mjs')).href);
  for (const raw of M.RUN_ACT) assert.equal(liczy(M.typeForActivity({ type: raw }, null), raw), true, 'bieg z zegarka ' + raw);
  for (const [raw, pl] of Object.entries(M.ACT_MAP)) {
    const chod = raw === 'Walk' || raw === 'Hike';
    assert.equal(liczy(pl, raw), chod, raw + ' → ' + pl + (chod ? ' liczy' : ' NIE liczy'));
  }
  assert.equal(liczy(M.typeForActivity({ type: 'Kitesurf' }, null), 'Kitesurf'), false, 'typ spoza mapy → Zastępczy → nie liczy');
});

test('jedna lista: licznik, wyprawa i dni odznaki idą przez akcja_typ_liczy; front nie liczy typów sam', () => {
  const km = czytaj('supabase/schema/funkcje/akcja_km_okna.sql'), lic = czytaj('supabase/schema/funkcje/akcja_licznik.sql');
  assert.match(km, /public\.akcja_typ_liczy\(l\.training_type, l\.external_type\)/);
  const wyprawa = lic.slice(lic.indexOf('wyprawa_athlete_ids is not null'), lic.indexOf('akcja_sponsorzy'));
  assert.match(wyprawa, /public\.akcja_typ_liczy\(l\.training_type, l\.external_type\)/, 'wyprawa też tylko bieg i chód');
  assert.match(czytaj('supabase/schema/funkcje/akcja_moje_dni.sql'), /public\.akcja_typ_liczy\(l\.training_type, l\.external_type\)/);
  for (const f of ['akcja_moj_wklad', 'akcja_tydzien', 'akcja_zamknij_dobe']) assert.match(czytaj(`supabase/schema/funkcje/${f}.sql`), /public\.akcja_km_okna\(/, f + ' liczy przez akcja_km_okna');
  const z = czytaj('zawodnik.html'), i = z.indexOf('window._sprawdzOdznakiAkcji = async function'), f = z.slice(i, z.indexOf('\n};\n', i));
  assert.match(f, /sb\.rpc\('akcja_moje_dni'/, '„7 dni z rzędu" z bazy');
  assert.doesNotMatch(f, /training_logs/, 'przeglądarka nie liczy dni z surowych logów (każdy typ)');
  const sc = czytaj('supabase/functions/share-card/index.ts'), k = sc.slice(sc.indexOf('async function kartaAkcji'), sc.indexOf('Deno.serve'));
  assert.match(k, /rpc\("akcja_km_okna"/); assert.doesNotMatch(k, /from\("training_logs"\)/, 'karta akcji bez własnego liczenia');
  const push = czytaj('supabase/functions/akcja-push/index.ts');
  assert.doesNotMatch(push, /from\("training_logs"\)/, 'push niedzielny bez własnego liczenia');
  const mig = czytaj('supabase/migrations/20261102_akcja_typy.sql');
  assert.match(mig, /public\.akcja_typ_liczy\('Rower', null\)/, 'asercja migracji: rower');
  assert.ok(fs.existsSync(path.join(KORZEN, 'supabase/migrations/20261102_WYCOFANIE_akcja_typy.sql')));
});

test('teksty: „Liczy się bieg i spacer. Rower nie." na dla-fabianka i karcie Dziś; Spacer zaraz po Spokojny', async () => {
  assert.match(czytaj('dla-fabianka.html'), /Liczy się bieg i spacer\. Rower nie\./);
  assert.doesNotMatch(czytaj('dla-fabianka.html'), /jedziesz/);
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  const A = globalThis.BM_AKCJA;
  const d = { wystartowala: true, nazwa: 'Test', cel_km: 100, suma_km: 1, pct: 1, start: '2026-11-07', stawka_filip_gr: 10, filip_gr: 10, filip_max_gr: 1000 };
  assert.match(A.kartaDzisHtml(d, { km: 1 }, new Date('2026-11-08T12:00:00Z')), /Liczy się bieg i spacer\. Rower nie\./);
  const pills = [...czytaj('zawodnik.html').matchAll(/selType\(this,'([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(pills.slice(0, 2), ['Spokojny', 'Spacer'], 'Spacer łatwo dostępny w ręcznym wpisie');
  assert.match(globalThis.BM_AKCJA_CYTATY ? globalThis.BM_AKCJA_CYTATY.PO_STARCIE : czytaj('js/akcja-cytaty.mjs'), /biegu i spaceru/);
});
