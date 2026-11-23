/* BLIZNA 331 (Filip 22.11, krok 1): „Chcę zmienić plan treningowy” — jedyna wpadka prawdziwego użytkownika w logach Okienka 1–21.11 — szło do modelu
   i dostawało pustą odpowiedź, a „ułóż plan” w v1 wyglądało na imię i nazwisko (sieć zablokowana, dalej model). Teraz router: stałe zdanie + karta,
   z trenerem „Napisz do trenera”, bez trenera „Ułóż plan” (generator), zero modelu i sieci. „Plan na jutro”, „pokaż plan”, „plan startowy” itd. jak dotąd. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { moduly, przebiegV2, trasaRoutera, KORZEN } = require('./_okienko-potok-atrapa.js');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

const TAK = ['Chcę zmienić plan treningowy', 'Chce zmienic plan treningowy', 'zmień mi plan', 'ułóż plan', 'uloz plan', 'Ołóż mi plan treningowy', 'ułóż mi nowy plan',
  'zrób mi plan treningowy', 'potrzebuję planu', 'nowy plan', 'inny plan treningowy', 'czy mogę zmienić plan?', 'plan jest za ciężki'];
const NIE = [['Plan na jutro', 'moj_plan'], ['pokaż plan', 'nawiguj'], ['jaki mam plan na tydzień', 'moj_plan'], ['ułóż mi plan startowy', null], ['plan żywieniowy', null],
  ['zmień plan na jutro', 'moj_plan'], ['ile km mam w planie na jutro', 'moj_plan'], ['plan Jana Kowalskiego', null]];

test('router: zmiana i ułożenie planu → stałe zdanie + karta „Ułóż plan”; pytania o plan na dzień, nawigacja i plan startowy jak dotąd', async () => {
  const { R } = await moduly();
  for (const q of TAK) {
    const d = R.dopasuj(q, '2026-11-22');
    assert.equal(d && d.log, 'plan-zmiana', q);
    assert.equal(d.zdanie, R.ODP_PLAN_GENERATOR, q);
    assert.deepEqual(d.karty, [R.KARTA_PLAN_GENERATOR], q);
    assert.equal(d.planKarta, true, q);
  }
  for (const [q, oczek] of NIE) assert.equal(await trasaRoutera(q), oczek, q);
  assert.equal(R.ODP_PLAN_TRENER, 'Plan układa Twój trener. Napisz mu, co chcesz zmienić.');
  assert.equal(R.ODP_PLAN_GENERATOR, 'Nowy plan ułożysz w generatorze — trzy pytania.');
});

test('v2: bez trenera „Ułóż plan”, z trenerem „Napisz do trenera”; zero sieci i modelu', async () => {
  const { R } = await moduly();
  for (const q of ['Chcę zmienić plan treningowy', 'ułóż plan', 'Ołóż mi plan treningowy']) {
    const bez = await przebiegV2(q);
    assert.equal(bez.slad, 'router:plan-zmiana', q);
    assert.deepEqual(bez.body.zdania, [R.ODP_PLAN_GENERATOR], q);
    assert.deepEqual(bez.body.karty, [{ typ: 'plan_pusty', dane: { stan: 'generator' } }], q);
    const z = await przebiegV2(q, { coach: true });
    assert.deepEqual(z.body.zdania, [R.ODP_PLAN_TRENER], q);
    assert.deepEqual(z.body.karty, [{ typ: 'plan_pusty', dane: { stan: 'trener' } }], q);
    assert.equal(bez.sieci + bez.modele + z.sieci + z.modele, 0, 'bez sieci i modelu: ' + q);
  }
  const s = await przebiegV2('ułóż mi plan startowy');
  assert.notEqual(s.slad, 'router:plan-zmiana', 'plan startowy zostaje przepisem v2');
});

test('v1 i v2: wariant z trenerem po coach_id w funkcji; front ma obie karty', () => {
  const v1 = czytaj('supabase/functions/okienko/index.ts'), v2 = czytaj('supabase/functions/okienko-v2/potok.mjs'), front = czytaj('js/okienko.js');
  assert.match(v1, /if \(\(traf as \{ planKarta\?: boolean \}\)\.planKarta\) \{ const \{ data: a \} = await sb\.from\("athletes"\)\.select\("coach_id"\)\.eq\("id", ath\.id\)\.maybeSingle\(\); if \(a && a\.coach_id\) return odp\(200, \{ \.\.\.pusto\("router"\), zdania: \[ODP_PLAN_TRENER\], karty: \[KARTA_PLAN_TRENER\] \}\); \}/);
  assert.match(v2, /if \(traf\.planKarta\) \{ const \{ data: a \} = await sb\.from\("athletes"\)\.select\("coach_id"\)\.eq\("id", athleteId\)\.maybeSingle\(\);/);
  assert.match(front, /d\.stan === 'generator'\) return '<div class="okn-karta"><button type="button" class="okn-otworz" data-plan="generator">Ułóż plan<\/button>/);
  assert.match(front, /d\.stan === 'trener'\) return '<div class="okn-karta"><button type="button" class="okn-otworz" data-plan="trener">Napisz do trenera<\/button>/);
});
