/* BLIZNA 129 (3.11.2026, pierwszy raport nocy — ławka na żywo 92,7 %, 5 regresji; gałąź okienko/poprawki-2026-11-03):
   1) klasyfikator na żywo oddaje „od” bez „do” (+ zbędny zakres) → waliduj „zła data” → pytanie spadało na model v1 → sieć
      („a w grudniu?”, „a w Krakowie?”, „a na 21 km”). Teraz: dopelnijOkres (od → koniec miesiąca / tydzień +6; do → od dziś; okres wygrywa z zakresem).
   2) „porównaj z nim”: klasyfikator przepisuje osobę z kontekstu do slotu → brak znacznika pamięci → „podaj imię i nazwisko”. Teraz: slot równy
      osobie z poprzedniej tury = osoba z pamięci. 3) zaimek w slocie osoba → pusty. 4) „sugerowane starty” → biegi_nadchodzace (zasada w prompcie).
   5) nagrania CI odświeżone żywymi (zywienie/sprzet/konteksty) — plik _nagrania-v2.json mówi prawdę o modelu. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);

test('dopelnijOkres: od bez do → koniec miesiąca (tydzień → +6), do bez od → od dziś, odwrotna kolejność naprawiona, okres wygrywa z zakresem; złe daty wycięte', async () => {
  const I = await zaladuj('supabase/functions/okienko-v2/intencje.mjs');
  assert.deepEqual(I.dopelnijOkres({ zakres: 'tydzien', od: '2026-10-19' }, '2026-11-03'), { od: '2026-10-19', do: '2026-10-25' }, 'tydzień od poniedziałku (a w zeszłym tygodniu)');
  assert.deepEqual(I.dopelnijOkres({ zakres: 'tydzien', od: '2026-12-01' }, '2026-11-03'), { od: '2026-12-01', do: '2026-12-31' }, '„w grudniu” z doklejonym zakresem = cały miesiąc');
  assert.deepEqual(I.dopelnijOkres({ od: '2026-12-01' }, '2026-11-03'), { od: '2026-12-01', do: '2026-12-31' });
  assert.deepEqual(I.dopelnijOkres({ od: '2026-02-10' }, '2026-11-03'), { od: '2026-02-10', do: '2026-02-28' });
  assert.deepEqual(I.dopelnijOkres({ do: '2026-12-31' }, '2026-11-03'), { od: '2026-11-03', do: '2026-12-31' });
  assert.deepEqual(I.dopelnijOkres({ od: '2026-12-31', do: '2026-12-01' }, '2026-11-03'), { od: '2026-12-01', do: '2026-12-31' });
  assert.deepEqual(I.dopelnijOkres({ od: 'grudzień', dystans: '21' }, '2026-11-03'), { dystans: '21' }, 'zła data → wycięta, reszta zostaje');
  assert.deepEqual(I.dopelnijOkres({ zakres: 'jutro' }, '2026-11-03'), { zakres: 'jutro' }, 'bez dat nic się nie zmienia');
  const { waliduj } = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const ctx = { tekst: 'a na 21 km', sb: null, adm: null, athleteId: 'a', jwt: 'j', dzis: '2026-11-03', teraz: new Date('2026-11-03T12:00:00Z'), fetchFn: null, gemini: 'k', d: { wykonaj: async (sb, id, n, args) => ({ od: args.od, do: args.do, biegi: [], liczba: 0 }) } };
  const w = await I.wykonajIntencje(ctx, { intencja: 'biegi_nadchodzace', sloty: { zakres: 'tydzien', dystans: '21', od: '2026-12-01' }, kandydaci: [] });
  assert.ok(w && w.meta, 'z żywymi slotami narzędzie się wykonuje (dotąd: null → model → sieć)'); assert.deepEqual(w.meta.args, { od: '2026-12-01', do: '2026-12-31', dystans: '21' });
  assert.equal(waliduj('biegi_nadchodzace', I.dopelnijOkres({ od: '2026-12-01', dystans: '21' }, '2026-11-03')).ok, true);
});

test('slotyZTekstu: miejsce po „w/we” (bez miesięcy, dni, słów pospolitych) i dystans z tekstu wygrywają z klasyfikatorem i pamięcią', async () => {
  const I = await zaladuj('supabase/functions/okienko-v2/intencje.mjs');
  assert.deepEqual(I.slotyZTekstu('a w Krakowie?'), { miejsce: 'krakowie', przy: 'w' }); assert.deepEqual(I.slotyZTekstu('a we Wrocławiu'), { miejsce: 'wroclawiu', przy: 'we' });
  assert.deepEqual(I.slotyZTekstu('a w grudniu?'), {}); assert.deepEqual(I.slotyZTekstu('ile km w tym tygodniu'), {}); assert.deepEqual(I.slotyZTekstu('plan w zeszłym tygodniu'), {}); assert.deepEqual(I.slotyZTekstu('biegi w lesie w sobotę'), {});
  assert.deepEqual(I.slotyZTekstu('a na 21 km'), { dystans: '21' }); assert.deepEqual(I.slotyZTekstu('gdzie pobiec dyche w grudniu'), { dystans: '10' }); assert.deepEqual(I.slotyZTekstu('polmaraton w Poznaniu'), { dystans: '21', miejsce: 'poznaniu', przy: 'w' }); assert.deepEqual(I.slotyZTekstu('jaki czas na 10 km w tempie 5:00'), { dystans: '10' });
  assert.match(czytaj('supabase/functions/okienko-v2/potok.mjs'), /const zt = slotyZTekstu\(tekst\);/);
});

test('rozumienie: zaimek w slocie osoba → pusty; prompt ma zasady o okresie od+do, miejscu z pytania i „sugerowane starty”', async () => {
  const R = await zaladuj('supabase/functions/okienko-v2/rozumienie.mjs');
  const p = R.promptRozumienia('2026-11-03');
  assert.match(p, /Okres ZAWSZE jako para od i do/); assert.match(p, /Miejsce z pytania \(„a w Krakowie\?”\) zawsze w slocie miejsce/); assert.match(p, /„sugerowane \/ polecane starty”, „gdzie pobiec”, „jakie biegi” → biegi_nadchodzace/); assert.match(p, /Zaimek \(on, ona, nim, niej\) to NIE slot osoba/);
  const src = czytaj('supabase/functions/okienko-v2/rozumienie.mjs');
  assert.match(src, /if \(o\.osoba && \/\^\(on\|ona\|oni\|one\|nim\|nia\|nią\|niej\|niego\|jego\|jej\|ich\|nich\|ten\|ta\|tamten\|tamta\)\$\/i\.test\(o\.osoba\)\) delete o\.osoba;/);
  // czysteSloty nie jest eksportowana — sprawdzamy przez rozumienie z atrapą modelu
  const fetchFn = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ intencja: 'porownaj', pewnosc: 0.9, dopytac: false, kandydaci: [], sloty: { osoba: 'nim' } }) }] } }], usageMetadata: {} }) });
  const r = await R.rozumienie({ fetchFn, klucz: 'k', tekst: 'porownaj z nim', dzis: '2026-11-03' });
  assert.equal(r.intencja, 'porownaj'); assert.equal(r.sloty.osoba, undefined, 'zaimek wycięty');
});

test('potok: osoba ze slotu równa osobie z pamięci (a nie w pytaniu) = osoba z pamięci; nagrania CI odświeżone żywymi; ławka bez regresji', async () => {
  const p = czytaj('supabase/functions/okienko-v2/potok.mjs');
  assert.match(p, /const osobaPam = rozmowa\[0\] && rozmowa\[0\]\.sloty && rozmowa\[0\]\.sloty\.osoba;/);
  assert.match(p, /normalizuj\(osobaPam\) === normalizuj\(roz\.sloty\.osoba\) && !normalizuj\(tekst\)\.includes\(normalizuj\(roz\.sloty\.osoba\)\)\) roz\.sloty = \{ \.\.\.roz\.sloty, _zPamieci: true \};/);
  const N = JSON.parse(czytaj('tests/_nagrania-v2.json'));
  assert.equal(N['ile kalorii ma banan'].intencja, 'zywienie'); assert.equal(N['jak dobrac buty do biegania'].intencja, 'sprzet'); assert.equal(N['a na 21 km <<biegi_nadchodzace'].sloty.od, '2026-12-01', 'żywy kształt slotów (od bez do) w CI');
  assert.deepEqual(N['porownaj z nim <<osoba'].sloty, { osoba: 'Robert Korzeniowski' }, 'żywe: osoba przepisana z kontekstu');
  const { przebieg, PYTANIA } = require('./_lawka-v2.js');
  const sel = PYTANIA.filter((w) => ['a w grudniu?', 'a w krakowie?', 'a na 21 km', 'porownaj z nim', 'sugerowane starty', 'ile kalorii ma omlet'].includes(w.p));
  const w = await przebieg(sel);
  for (const r of w) assert.equal(r.pasuje, true, `${r.p} → ${r.slad} (oczekiwane ${r.oczekiwane})`);
});
