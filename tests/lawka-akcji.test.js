/* BLIZNA 132 / ŁAWKA AKCJI w CI (Filip 3.11, warunek przepięcia Okienka dla wszystkich): 192 przypadki — 22 pytania o akcję, wyprawę, zbiórkę
   i dziecko × 3 stany akcja_licznik × 3 konteksty rozmowy — przez prawdziwy potok v2 na atrapach. 100 % albo czerwono:
   cel wyprawy nigdy (także po dotarciu), zero słów chorobowych, licznik = suma_km z akcja_licznik, zero sieci i modelu (router).
   Plus reguły routera i potoku, które to dają (zmiana w nich = ta ławka musi dalej przechodzić). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { przebiegAkcji, PYTANIA_AKCJI } = require('./_lawka-akcji.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('ławka akcji: 100 % (cel wyprawy nigdy, zero choroby, licznik z akcja_licznik, zero sieci i modelu)', async () => {
  const w = await przebiegAkcji();
  const zle = w.filter((r) => !r.ok).map((r) => `[${r.stan} / ${r.kontekst}] ${r.q} → ${r.slad}: ${r.bledy.join('; ')}`);
  assert.deepEqual(zle, [], 'NIE PRZEPINAMY:\n' + zle.join('\n'));
  assert.ok(w.length >= 190, 'ławka ma pokrywać wszystkie stany i konteksty (' + w.length + ')');
  for (const q of ['dokąd biegniecie', 'gdzie kończy się wyprawa', 'czy biegniecie do Częstochowy', 'na kogo zbiórka', 'ile km już jest', 'co to za akcja', 'kim jest Fabianek', 'gdzie mieszka Fabianek', 'co mu jest'])
    assert.ok(PYTANIA_AKCJI.some(([p]) => p === q), 'pytanie Filipa w ławce: ' + q);
  const km = w.find((r) => r.stan === 'trwa' && r.kontekst === 'samo' && r.q === 'ile km już jest');
  assert.match(km.zdanie, /^Razem już 4\s322 km z 12\s500\.$/u);
  const wyp = w.find((r) => r.stan === 'trwa' && r.kontekst === 'samo' && r.q === 'czy biegniecie do Częstochowy');
  assert.equal(wyp.zdanie, 'Dokąd biegną Filip i Kasia — zdradzimy na mecie. Postęp wyprawy widać na Dziś.');
});

test('router: wyprawa/cel, licznik i zdrowie innych osób łapane przed modelem i siecią; własne dane nieprzechwycone', async () => {
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja-cytaty.mjs')).href);
  const R = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/okienko/router.mjs')).href);
  globalThis.BM_AKCJA_CYTATY.ustawStan({ ruszyla: true });
  for (const q of ['dokąd biegniecie', 'gdzie kończy się wyprawa', 'czy biegniecie do Częstochowy', 'czy to Jasna Góra?', 'na Jasną Górę?', 'jaki jest cel wyprawy', 'gdzie jest meta', 'czy wyprawa kończy się w Krakowie'])
    assert.deepEqual(R.dopasuj(q, '2026-11-08').rodzaj, 'wyprawa', q);
  for (const q of ['ile km już jest', 'ile na liczniku', 'ile już zebraliście']) assert.equal(R.dopasuj(q, '2026-11-08').rodzaj, 'km', q);
  for (const q of ['co mu jest', 'co jej dolega', 'na co choruje', 'jak się on czuje']) assert.equal(R.dopasuj(q, '2026-11-08').log, 'zdrowie-innych', q);
  assert.equal(R.dopasuj('co mi jest', '2026-11-08'), null, '„co mi jest” to zdrowie pytającego (klasyfikator), nie innych');
  assert.equal(R.dopasuj('ile km przebiegłem w tym tygodniu', '2026-11-08').narzedzie, 'moje_treningi'); assert.equal(R.dopasuj('plan na jutro', '2026-11-08').narzedzie, 'moj_plan');
  assert.deepEqual(R.dopasuj('na kogo zbiórka', '2026-11-08'), { zdanie: globalThis.BM_AKCJA_CYTATY.PO_STARCIE, log: 'zagadka' }, 'zwykła zagadka bez pola rodzaj (stary kształt)');
  assert.match(R.ODP_ZDROWIE_INNYCH, /^O zdrowiu innych osób nie rozmawiam/);
});

test('potok + akcja-v2: licznik i wyprawa tylko po starcie, cel nigdy (także po dotarciu); dopytanie po akcji bez modelu; tura „akcja” w pamięci', async () => {
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  const A = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/okienko-v2/akcja-v2.mjs')).href);
  const AKK = globalThis.BM_AKCJA;
  assert.equal(A.zdanieAkcji('km', { wystartowala: false, suma_km: 10 }, AKK), null, 'przed startem: zagadka');
  assert.equal(A.zdanieAkcji('km', { wystartowala: true, suma_km: 4321.7, cel_km: 12500 }, AKK), `Razem już ${AKK.km(4321.7)} km z ${AKK.km(12500)}.`);
  assert.equal(A.zdanieAkcji('km', { wystartowala: true, suma_km: null }, AKK), null);
  assert.equal(A.zdanieAkcji('wyprawa', { wystartowala: true, wyprawa_trwa: true }, AKK), A.ZDANIE_WYPRAWA_TRWA);
  assert.equal(A.zdanieAkcji('wyprawa', { wystartowala: true, wyprawa_dotarla_at: '2026-11-08T15:00:00Z', wyprawa_cel_nazwa: 'Testowo' }, AKK), A.ZDANIE_WYPRAWA_DOTARLI);
  assert.doesNotMatch(czytaj('supabase/functions/okienko-v2/akcja-v2.mjs').replace(/\/\/[^\n]*/g, ''), /wyprawa_cel_nazwa|wyprawa_cel_km/, 'moduł nie czyta pól celu');
  const p = czytaj('supabase/functions/okienko-v2/potok.mjs');
  assert.match(p, /const zd = traf\.log === "zagadka" \? \(zdanieAkcji\(traf\.rodzaj, akcjaDane, AKK\) \|\| traf\.zdanie\) : traf\.zdanie;/);
  assert.match(p, /if \(traf\.log === "zagadka"\) await zapiszTure\(adm, athleteId, "akcja", \{\}, \{ pytanie: tekst, odpowiedz: \[zd\] \}\);/);
  assert.match(p, /if \(rozmowa\[0\] && rozmowa\[0\]\.intencja === "akcja" && \(kont \|\| pytOMiejsce \|\| czyDopytanie\(normalizuj\(tekst\), rozmowa\)\) && AK\) \{/);   // blizna-137: + pytanie o miejsce
  assert.ok(p.indexOf('rozmowa[0].intencja === "akcja"') < p.indexOf('czyDopytanie(normalizuj(tekst), rozmowa)) {'), 'dopytanie po akcji PRZED trybem rozmowy (model)');
});
