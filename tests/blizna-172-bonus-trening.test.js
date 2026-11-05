/* BLIZNA 172 / BONUS ZA TRENING (Filip 5.11): kierunek tylko trening -> gra.
   - tylko import z zegarka, sam fakt treningu, nie km: dopisywanie kilometrów nic nie daje, a każdy km akcji kosztuje BiegaMy 10 gr;
   - klient nic nie deklaruje, serwer sam czyta treningi;
   - nikt nie widzi, czy i ile ktoś biegał: w rankingu nic o treningach;
   - gra dalej nie pisze do treningów ani akcji.
   Po skutku: tools/gra-trening-test.sql. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;
const MIG = 'supabase/migrations/20261107_gra_bonus_trening.sql';

test('klient nic nie deklaruje: wywołanie bez parametrów, ekran z odpowiedzi serwera', () => {
  const k = czytaj('js/cegielki-konto.js');
  assert.match(k, /window\.sb\.rpc\("bonus_treningu_odbierz"\)/, 'bez argumentów');
  assert.equal((k.match(/bonus_treningu_odbierz/g) || []).length, 1, 'jedno wywołanie');
  assert.doesNotMatch(k, /training_logs/, 'front gry nie czyta treningów');
  assert.doesNotMatch(k, /select\("plecak"\)/, 'kolumna plecaka wchodzi przed bonusem, nie może odsłonić przycisku');
  assert.match(k, /if \(!premiera && po\.data\.bonus_trening === true\) \$\("m-bonus"\)\.hidden = false;/, 'przycisk tylko, gdy serwer powie, że bonus jest');
  assert.match(czytaj('gra-cegielki.html'), /<button class="g" id="m-bonus" hidden>Odbierz bonus za trening<\/button>/);
});

test('teksty: bez km, z odpowiedzi serwera', () => {
  assert.match(L.tekstBonusu(null), /Nie udało się/);
  assert.match(L.tekstBonusu({ ok: true, dni: 0 }), /Nie ma nowego treningu z zegarka/);
  assert.equal(L.tekstBonusu({ ok: true, dni: 1, zlote: 1, kask: 1, bidon: 0, kamizelka: false, seria: 1 }), 'Odebrane: 1 złota cegła, kask do plecaka. Seria: 1 dzień.');
  assert.equal(L.tekstBonusu({ ok: true, dni: 2, zlote: 2, kask: 2, bidon: 1, kamizelka: true, seria: 7 }), 'Odebrane: 2 złote cegły, kask do plecaka ×2, bidon, Kamizelka Wytrwałych. Seria: 7 dni.');
  assert.doesNotMatch(L.tekstBonusu({ ok: true, dni: 1, zlote: 1, kask: 1, seria: 1 }), /km/);
});

test('Kamizelka Wytrwałych: strój tylko za serię, nie do kupienia, nie do przymierzenia przed serią', () => {
  const p = L.SKLEP.find((x) => x.id === 'kamizelka-wytrwalych');
  assert.ok(p && p.cena === null && p.tylkoSeria && p.slot === 'tulow');
  assert.deepEqual(L.poprawnyStroj({ tulow: 'kamizelka-wytrwalych' }, []).tulow, null, 'bez serii nie założysz');
  assert.equal(L.poprawnyStroj({ tulow: 'kamizelka-wytrwalych' }, ['kamizelka-wytrwalych']).tulow, 'kamizelka-wytrwalych');
  assert.match(czytaj('js/cegielki-konto.js'), /if \(p\.tylkoSeria && !ma\) \{ b\.disabled = true;/);
  assert.doesNotMatch(czytaj('supabase/migrations/20261105_gra_cegielki.sql'), /kamizelka-wytrwalych/, 'nie ma ceny w gra_kup');
});

test('baza: sam fakt z zegarka, jeden bonus na dzień, tylko tabele gry, nic w rankingu', { skip: !fs.existsSync(path.join(__dirname, '..', MIG)) && 'migracja poza commitem' }, () => {
  const m = czytaj(MIG);
  assert.match(m, /l\.external_source = 'intervals' and l\.external_id is not null/, 'nigdy wpis ręczny');
  assert.match(m, /public\.akcja_typ_liczy\(l\.training_type, l\.external_type\)/, 'typy jak w akcji');
  const od = m.indexOf('create function public.bonus_treningu_odbierz'), f = m.slice(od, m.indexOf('end $$;', od));
  assert.doesNotMatch(f, /distance_km|duration|pace/, 'bez warunku na km');
  assert.doesNotMatch(f, /(insert into|update|delete from) +public\.(training_logs|akcje)/i, 'gra nie pisze do treningów ani akcji');
  assert.match(m, /primary key \(athlete_id, dzien\)/);
  assert.doesNotMatch(m, /add column plecak|function public\.gra_start_rundy/, 'plecak ma własną migrację, nagroda idzie do użycia przyciskiem');
  assert.match(m, /'bonus_trening', true/, 'bez tego pola przycisku nie ma');
  assert.doesNotMatch(m, /gra_ranking/, 'ranking nietknięty');
  assert.doesNotMatch(m, /create (or replace )?function public\.gra_[a-z_]+\([^)]*\)[\s\S]{0,4000}?training_logs[\s\S]{0,200}?end \$\$;\n\ncreate function public\.bonus/, 'funkcje gra_ nie znają treningów');
});
