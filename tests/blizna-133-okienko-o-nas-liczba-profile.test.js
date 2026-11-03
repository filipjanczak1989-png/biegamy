/* BLIZNA 133 (3.11.2026, decyzje Filipa przed przepięciem): „ile osób korzysta z BiegaMy” → liczba z bazy (konta z logowaniem bez usuniętych),
   w dół do dziesiątek: „Z BiegaMy korzysta ponad X biegaczy.”; „pokaż profil Kasi/Filipa” → „o nas” + karta profilu bez przycisku znajomości,
   wygrywa z nawigacją do WŁASNEGO Profilu. Nazwisko Kasi: decyzja nie podana → zostaje odmowa (router). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');
const { baza, fetchF6, DZIS, TERAZ } = require('./_lawka-pytan.js');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);

test('zdanieLiczby: w dół do dziesiątek, „ponad” tylko gdy więcej; < 10 → null (zdanie zapasowe)', async () => {
  const A = await zaladuj('supabase/functions/okienko-v2/akcja-v2.mjs');
  assert.equal(A.zdanieLiczby(91), 'Z BiegaMy korzysta ponad 90 biegaczy.'); assert.equal(A.zdanieLiczby(90), 'Z BiegaMy korzysta 90 biegaczy.');
  assert.equal(A.zdanieLiczby(129), 'Z BiegaMy korzysta ponad 120 biegaczy.'); assert.equal(A.zdanieLiczby(7), null); assert.equal(A.zdanieLiczby('x'), null);
  let filtry = []; const adm = { from: (t) => { const q = { select: () => q, not: (k, op, v) => { filtry.push(['not', k, op, v]); return q; }, neq: (k, v) => { filtry.push(['neq', k, v]); return q; },
    then: (res) => res({ count: 91, error: null }) }; filtry.push(['from', t]); return q; } };
  assert.equal(await A.liczbaBiegaczy(adm), 'Z BiegaMy korzysta ponad 90 biegaczy.');
  assert.deepEqual(filtry, [['from', 'athletes'], ['not', 'user_id', 'is', null], ['neq', 'full_name', 'Usunięty użytkownik']]);
});

test('o-nas: liczba i profile — wzorce, karty z id profili publicznych, bez przycisku znajomości', async () => {
  const O = await zaladuj('supabase/functions/_shared/o-nas.mjs');
  for (const q of ['Ile osob korzysta z biegamy', 'ilu macie użytkowników', 'ile osób ma konto w BiegaMy']) assert.equal(O.oNas(q).temat, 'liczba', q);
  for (const q of ['pokaz profik kasi', 'pokaż profil Kasi', 'profil Kasi']) { const r = O.oNas(q); assert.equal(r.temat, 'profil_kasi', q); assert.deepEqual(r.karty, [{ typ: 'osoba', dane: { id: '2dd9206b-d2f0-4bdc-a1ef-4d7765e446b8', nazwa: 'Kasia — współtrenerka', prywatny: false, bez_znajomosci: true } }]); }
  assert.equal(O.oNas('otwórz profil Filipa').karty[0].dane.id, '56092926-2cf1-44b6-952f-38614497fdc2');
  for (const q of ['pokaż mój profil', 'ile osób biegnie w akcji', 'kim jest Kasia Nowak']) assert.ok(!O.oNas(q) || !/^(liczba|profil_)/.test(O.oNas(q).temat), q);
  assert.equal(O.oNas('kim jest Filip').karty.length, 0, 'zwykłe tematy bez kart');
  assert.doesNotMatch(fs.readFileSync(path.join(KORZEN, 'supabase/functions/_shared/o-nas.mjs'), 'utf8'), /\u0008/, 'bez znaków backspace w wzorcach');
});

test('potok: liczba z bazy w odpowiedzi; „pokaż profil Kasi” = o nas (nie nawigacja do mojego Profilu); „pokaż mój profil” bez zmian; nazwisko Kasi → odmowa', async () => {
  const { potok } = await zaladuj('supabase/functions/okienko-v2/potok.mjs');
  const pyt = async (q, licz = 91) => {
    const adm = atrapa({ okienko_v2_log: [], okienko_v2_rozmowa: [], okienko_siec_cache: [], okienko_znaleziska: [] });
    const fromOrg = adm.from.bind(adm);
    adm.from = (t) => (t === 'athletes' ? (() => { const q2 = { select: () => q2, not: () => q2, neq: () => q2, then: (res) => res({ count: licz, error: null }) }; return q2; })() : fromOrg(t));
    return potok({ tekst: q, historia: [], ekran: 'home', athleteId: JA, sb: atrapa(baza()), adm, jwt: 'T', dzis: DZIS, teraz: TERAZ, gemini: 'K', budzet: 0, fetchFn: fetchF6 },
      { sprawdzLimity: async () => null, uzyteSiecDzis: async () => 0, rozumienie: async () => ({ intencja: 'nie_wiem', pewnosc: 0, dopytac: true, kandydaci: [], sloty: {}, tok: { we: 0, wy: 0 } }) });
  };
  let r = await pyt('Ile osób korzysta z BiegaMy?');
  assert.deepEqual(r.body.zdania, ['Z BiegaMy korzysta ponad 90 biegaczy.']); assert.deepEqual(r.slad, ['router:o-nas']);
  r = await pyt('ile osób korzysta z biegamy', 3); assert.match(r.body.zdania[0], /^Z BiegaMy korzysta kilkadziesiąt osób/, 'błąd/za mało → zdanie zapasowe bez liczby');
  r = await pyt('pokaż profil Kasi');
  assert.deepEqual(r.slad, ['router:o-nas']); assert.equal(r.body.karty[0].dane.id, '2dd9206b-d2f0-4bdc-a1ef-4d7765e446b8'); assert.equal(r.body.akcja, null, 'nie nawigacja do mojego Profilu');
  r = await pyt('pokaż mój profil'); assert.ok(r.body.akcja && r.body.akcja.nawiguj === 'profil.html', 'własny Profil bez zmian');
  r = await pyt('jak ma nazwisko kasia'); assert.ok(!/^(router:o-nas|siec)/.test(r.slad.join('>')), 'nazwisko Kasi: nie z „o nas” (decyzja nie podana — na żywo klasyfikator odmawia), nigdy sieć: ' + r.slad.join('>'));
});

test('UI: karta osoby z bez_znajomosci — „Zobacz profil” i „Napisz”, bez „Dodaj do znajomych”', () => {
  const ctx = zaladujSb(); ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  vm.runInContext(fs.readFileSync(path.join(KORZEN, 'js/okienko.js'), 'utf8'), ctx, { filename: 'js/okienko.js' });
  const h = ctx.OKIENKO.htmlOdpowiedzi(200, { zdania: ['Kasia — współtrenerka w BiegaMy. Jej profil:'], karty: [{ typ: 'osoba', dane: { id: '2dd9206b-d2f0-4bdc-a1ef-4d7765e446b8', nazwa: 'Kasia — współtrenerka', prywatny: false, bez_znajomosci: true } }], tryb: 'router' });
  assert.match(h, /data-osoba="profil" data-id="2dd9206b-d2f0-4bdc-a1ef-4d7765e446b8"/); assert.match(h, /data-osoba="napisz"/); assert.doesNotMatch(h, /Dodaj do znajomych/);
});
