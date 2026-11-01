/* BLIZNA 81 (1.11.2026, M3-1 (1) PRYWATNOŚĆ): imię i nazwisko WEWNĄTRZ zdania nie wychodzi do Google.

   Ławka 1.11: „jak pobiegl Jan Kowalski w Poznaniu" i „czy Anna Kowalska jest w aplikacji" mijały detektor osoby
   (2–3 słowa) i strażnik sieci (ten sam zakres) → ścieżka ogólna → model → sieć z nazwiskiem prywatnej osoby.

   Ryzyka:
   1) 15 zdań z nazwiskiem w środku → tryb osoby (0 wyjść do sieci poza regułą publiczności) — także gdy imię nie jest
      w słowniku, ale oba słowa są wielką literą nie na początku zdania.
   2) Fałszywe trafienia: „Kto wygrał maraton w Berlinie", „jakie biegi w Warszawie Mokotów", „maraton warszawski",
      „Bieg Niepodległości w Poznaniu" → nie osoba (słowa imprez, przyimek przed parą, początek zdania).
   3) Kontekst: „w Poznaniu" → gdzie → filtr wyników; „w sieci" to NIE miejsce; „kim jest …" → wprost.
   4) Strażnik ścieżki ogólnej zna osobaWZdaniu (pas bezpieczeństwa), choć tryb osoby i tak kończy wcześniej. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8');

const Z_NAZWISKIEM = [
  ['jak pobiegl Jan Kowalski w Poznaniu', 'Jan Kowalski', 'Poznaniu'],
  ['czy Anna Kowalska jest w aplikacji', 'Anna Kowalska', null],
  ['dodaj Jana Kowalskiego do znajomych', 'Jana Kowalskiego', null],
  ['czy kasia nowak biega w weekend', 'kasia nowak', null],
  ['kim jest Robert Korzeniowski w sieci', 'Robert Korzeniowski', null],
  ['ile km zrobil Filip Janczak w pazdzierniku', 'Filip Janczak', null],
  ['pokaz mi wyniki Marka Nowaka z Krakowa', 'Marka Nowaka', null],
  ['czy Zdzislaw Kraszewski biegal maraton', 'Zdzislaw Kraszewski', null],
  ['co slychac u Basi Kowalczyk', 'Basi Kowalczyk', null],
  ['jaki czas ma Tomek Wisniewski na dyche', 'Tomek Wisniewski', null],
  ['szukam osoby Ewelina Zajac z Lodzi', 'Ewelina Zajac', null],
  ['czy w BiegaMy jest Krzysztof Nowicki', 'Krzysztof Nowicki', null],
  ['kiedy startuje Agnieszka Lis w Gdyni', 'Agnieszka Lis', 'Gdyni'],
  ['pokaz profil Piotr Zielinski', 'Piotr Zielinski', null],
  ['wyniki ma Marcin Lewandowski we Wroclawiu', 'Marcin Lewandowski', 'Wroclawiu'],
];
const BEZ = ['Kto wygrał maraton w Berlinie?', 'jakie biegi w Warszawie Mokotow w maju', 'maraton warszawski', 'pokaz mi Bieg Niepodleglosci w Poznaniu',
  'trasa polmaratonu poznanskiego', 'jakie biegi w weekend w Poznaniu', 'plan na jutro', 'co mam dzis', 'ile km w pazdzierniku',
  'ile kosztuje wpisowe na maraton w debnie', 'Maraton Warszawski kiedy jest', 'Ultra Kotlina w Szklarskiej Porebie'];

test('15 zdań z nazwiskiem w środku → tryb osoby z właściwym q; kontekst miejsca; „w sieci" nie jest miejscem', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  for (const [z, q, gdzie] of Z_NAZWISKIEM) {
    const r = O.osobaZPytania(z);
    assert.ok(r, z); assert.equal(r.q, q, z); assert.equal(r.gdzie || null, gdzie, z + ' (gdzie)');
  }
  assert.equal(O.osobaZPytania('kim jest Robert Korzeniowski w sieci').wprost, true);
  assert.equal(O.osobaZPytania('jak pobiegl Jan Kowalski w Poznaniu').wprost, false);
});

test('bez fałszywych trafień: imprezy, miasta po przyimku, pytania o własne dane → nie osoba', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  for (const z of BEZ) assert.equal(O.osobaZPytania(z), null, z);
});

test('0 wyjść do sieci: nazwisko bez publiczności nigdy w zapytajSiec; publiczne (MP/podium/30+) tak — reguła bez zmian; kontekst filtruje wyniki', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const F = await zaladuj('supabase/functions/okienko/f6.mjs');
  const f6 = (runners, wyniki) => ({ fetchFn: async (url, init) => { const rpc = url.split('/rpc/')[1]; return { ok: true, status: 200, json: async () => (rpc === 'search_runners' ? runners : wyniki) }; } });
  const prywatne = f6([{ runner_key: 'datasport:1', display_name: 'KOWALSKI JAN', yob: 1990, results_count: 3 }],
    [{ event_name: 'Bieg Poznański', event_date: '2026-10-01', event_city: 'Poznań', distance_km: 10, time_seconds: 3000, position_total: 50 },
     { event_name: 'Bieg Gdyński', event_date: '2026-09-01', event_city: 'Gdynia', distance_km: 10, time_seconds: 3100, position_total: 60 }]);
  let siec = 0;
  for (const [z] of Z_NAZWISKIEM) {
    F._wyczyscPamiecF6();
    const r = O.osobaZPytania(z);
    const o = await O.odpowiedzOsoba({ sb: atrapa({ athletes: [], friendships: [] }), athleteId: JA, fetchFn: prywatne.fetchFn, token: 'T', q: r.q, wprost: r.wprost, gdzie: r.gdzie,
      sieciDozwolona: async () => true, siec: async () => { siec++; return { zdania: ['x'], zrodla: [{ tytul: 'a', url: 'https://a' }], tok: { we: 1, wy: 1 }, zapytania: 1 }; } });
    assert.ok(o);
  }
  assert.equal(siec, 1, 'tylko „kim jest … w sieci" (wprost) — reszta prywatnych nazwisk 0 wyjść');
  F._wyczyscPamiecF6();
  const r = O.osobaZPytania('jak pobiegl Jan Kowalski w Poznaniu');
  const o = await O.odpowiedzOsoba({ sb: atrapa({ athletes: [], friendships: [] }), athleteId: JA, fetchFn: prywatne.fetchFn, token: 'T', q: r.q, wprost: false, gdzie: r.gdzie,
    sieciDozwolona: async () => true, siec: async () => { throw new Error('nie wolno'); } });
  const w = o.karty.find((k) => k.typ === 'wyniki').dane;
  assert.equal(w.starty, 1); assert.equal(w.ostatnie[0].miasto, 'Poznań'); assert.equal(w.gdzie, 'Poznaniu');
  F._wyczyscPamiecF6();
  const r2 = O.osobaZPytania('kiedy startuje Jan Kowalski w Gdansku');
  const o2 = await O.odpowiedzOsoba({ sb: atrapa({ athletes: [], friendships: [] }), athleteId: JA, fetchFn: prywatne.fetchFn, token: 'T', q: r2.q, wprost: false, gdzie: r2.gdzie,
    sieciDozwolona: async () => true, siec: async () => { throw new Error('nie wolno'); } });
  assert.ok(o2.zdania.includes('Maszyna wyników nie zna startu tej osoby: Gdansku.'));
  assert.equal(o2.karty.find((k) => k.typ === 'wyniki').dane.starty, 3, 'bez trafienia miejsca — pełna karta');
});

test('EF: tryb osoby przed modelem przekazuje gdzie; strażnik ścieżki ogólnej zna osobaWZdaniu', () => {
  const ef = czytaj('supabase', 'functions', 'okienko', 'index.ts');
  assert.match(ef, /gdzie: \(os as \{ gdzie\?: string \| null \}\)\.gdzie \|\| null/);
  assert.match(ef, /const blokadaSieci = wygladaNaOsobe\(tekst\) \|\| !!osobaWZdaniu\(tekst\);/);
  assert.ok(ef.indexOf('const os = osobaZPytania(tekst);') < ef.indexOf('zapytajModel({'));
});
