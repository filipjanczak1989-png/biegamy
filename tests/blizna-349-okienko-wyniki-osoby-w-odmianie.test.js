/* BLIZNA 349 (Filip 24.11, decyzja do raportu z 24.11): „wyniki Anny Nowak z maratonu” — imię w ODMIANIE + nazwisko — router puszczał regułą wyników imprezy
   (maPareOsoby zna tylko mianownik). Pytanie o osobę szło do kalendarza imprez, a małymi literami („wyniki anny nowak z maratonu”) mijało też strażnik nazwiska
   w kartaGoogleWynikow i pod „Otwórz Wyniki ›” stawał „Szukaj wyników w Google ›” z imieniem i nazwiskiem (v56/v26). Teraz:
   (1) imieZOdmiany: „Anny” → „Anna”, „Pawła” → „Paweł”, „Jerzego” → „Jerzy”, „Marka” → „Marek” (nie „Mark”), „Michała” → „Michał” (nie „Michael”),
       „Marii” → „Maria” (nie „Mariia”); mianownik i zwykłe słowa („inny”, „ani”, „idę”, „maratonu”, „Poznaniu”) → null;
   (2) paraOsobyOdmienionej: tylko pytania o wyniki, także z literówką; nie po słowie imprezy/patrona („półmaratonu Marii Skłodowskiej”), nie o własne wyniki;
   (3) router oddaje takie pytanie trybowi osoby (dopasuj → null, wynikiImprezyZPytania → null); druga linia: kartaGoogleWynikow → null bez względu na litery;
   (4) tryb osoby szuka po imieniu w MIANOWNIKU („Anna Nowak”), z miejscem („w Dębnie”); zawsze osoba, także gdy nazwisko jest zwykłym słowem („Listopad”);
   (5) prawdziwy potok v2: tryb osoby, search_runners z „Anna Nowak”, bez sieci, modelu i Google; impreza z patronem i zwykłe pytania o wyniki bez zmian;
   (6) korpus ławek: para łapie tylko dwa znane pytania o osoby (już dotąd tryb osoby, teraz q w mianowniku). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { moduly, przebiegV2, KORZEN } = require('./_okienko-potok-atrapa.js');

const DZIS = '2026-11-24';
const imiona = () => moduly().then(({ zaladuj }) => zaladuj('supabase/functions/_shared/imiona.mjs'));
const OSOBY = ['wyniki Anny Nowak z maratonu', 'wyniki anny nowak z maratonu', 'wniki anny nowak z maratonu', 'Wyniki Pawła Nowaka z półmaratonu w Dębnie',
  'jakie są wyniki Kasi Zawadzkiej z parkrunu?', 'wyniki Jerzego Kowalskiego z maratonu', 'wyniki Anny Listopad z maratonu'];

test('imieZOdmiany: przypadki → mianownik z polskimi znakami; mianownik, zwykłe słowa i miejsca → null', async () => {
  const { imieZOdmiany } = await imiona();
  const tak = { Anny: 'Anna', anny: 'anna', ANNY: 'Anna', Annie: 'Anna', Annę: 'Anna', Ewy: 'Ewa', Kasi: 'Kasia', Basi: 'Basia', Marii: 'Maria', Agnieszki: 'Agnieszka',
    Agnieszce: 'Agnieszka', Małgorzaty: 'Małgorzata', Dorocie: 'Dorota', Barbarze: 'Barbara', Oldze: 'Olga', Jerzego: 'Jerzy', Antoniego: 'Antoni', Pawła: 'Paweł',
    Pawle: 'Paweł', Pawłem: 'Paweł', Marka: 'Marek', Marku: 'Marek', Markiem: 'Marek', Michała: 'Michał', Michale: 'Michał', Michałowi: 'Michał', Łukasza: 'Łukasz',
    Piotra: 'Piotr', Piotrze: 'Piotr', Robercie: 'Robert', Tomaszu: 'Tomasz', Janowi: 'Jan', Janem: 'Jan', Janie: 'Jan', Dawidzie: 'Dawid', Kacpra: 'Kacper',
    Bartka: 'Bartek', Jacka: 'Jacek', Andrzeja: 'Andrzej', Zofii: 'Zofia' };
  for (const [w, m] of Object.entries(tak)) assert.equal(imieZOdmiany(w), m, w);
  for (const w of ['Anna', 'Jan', 'Jana', 'Krzysztofa', 'inny', 'inni', 'INNY', 'ani', 'Ani', 'idę', 'danie', 'linie', 'lubi', 'maratonu', 'Maratonu', 'biegu', 'wyników',
    'Poznaniu', 'Warszawy', 'Gdyni', 'Krakowie', 'Sopocie', 'Dębnie', 'Nowak', 'Nowaka', 'Kowalskiego', 'lipca', 'listopada', 'lutego', 'Rzeźnika', 'Wąsem',
    'Kopernika', 'butów', 'ab', '', null, 'Anny2', 'Anny-Nowak']) assert.equal(imieZOdmiany(w), null, String(w));
});

test('paraOsobyOdmienionej: tylko pytania o wyniki, nie po słowie imprezy, nie o własne wyniki; druga linia w kartaGoogleWynikow', async () => {
  const { R, zaladuj } = await moduly();
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  const para = (q) => { const p = R.paraOsobyOdmienionej(q); return p && p.imie + ' ' + p.nazwisko; };
  assert.equal(para('wyniki Anny Nowak z maratonu'), 'Anna Nowak');
  assert.equal(para('wyniki anny nowak z maratonu'), 'anna nowak', 'małe litery');
  assert.equal(para('wniki anny nowak z maratonu'), 'anna nowak', 'literówka w „wyniki” (osoba.mjs woła z oryginałem)');
  assert.equal(para('Wyniki Pawła Nowaka z półmaratonu w Dębnie'), 'Paweł Nowaka');
  assert.equal(para('wyniki Anny Listopad z maratonu'), 'Anna Listopad');
  for (const q of ['wyniki półmaratonu Marii Skłodowskiej', 'wyniki Memoriału Janusza Kusocińskiego', 'wyniki biegu pamięci Jerzego Popiełuszki', 'wyniki Cross Jana Nowaka',
    'kiedy bieg Anny Nowak', 'Anny Nowak maraton', 'moje wyniki i wyniki Anny Nowak', 'jakie mam wyniki od Anny Nowak', 'wyniki Anny z maratonu', 'wyniki Anny jest',
    'nie mam ani jednego wyniku z maratonu', 'inny czas niż wynik z zawodów', 'wyniki maraton debno', 'Maraton Cytadela by Night wyniki'])
    assert.equal(R.paraOsobyOdmienionej(q), null, q);
  assert.equal(I.kartaGoogleWynikow([], 'anny nowak maratonu', DZIS), null, 'małe litery: strażnik nazwiska tego nie widział');
  assert.equal(I.kartaGoogleWynikow([], 'pawła nowaka półmaratonu', DZIS), null);
  assert.deepEqual(I.kartaGoogleWynikow([{ nazwa: 'Półmaraton Marii Skłodowskiej', data: '2026-05-10', przeszla: true, miejscowosc: 'Lublin' }], 'x', DZIS),
    { typ: 'szukaj_google', dane: { q: 'Półmaraton Marii Skłodowskiej Lublin 2026 wyniki' } }, 'patron w nazwie imprezy z kalendarza: przycisk zostaje');
});

test('router: osoba w odmianie → null (tryb osoby), także dla reguły wyników; imprezy i własne wyniki bez zmian', async () => {
  const { R } = await moduly();
  for (const q of OSOBY) {
    assert.equal(R.dopasuj(q, DZIS), null, q);
    assert.equal(R.wynikiImprezyZPytania(q), null, q);
  }
  const trasa = (q) => { const d = R.dopasuj(q, DZIS); return d && (d.log || d.narzedzie); };
  assert.equal(trasa('wyniki półmaratonu Marii Skłodowskiej'), 'wyniki-imprezy', 'patron po słowie imprezy');
  assert.deepEqual(R.wynikiImprezyZPytania('wyniki półmaratonu Marii Skłodowskiej'), { q: 'półmaratonu Marii Skłodowskiej' });
  for (const q of ['wyniki maraton debno', 'Maraton Cytadela by Night wyniki', 'wyniki bieg z wąsem szczecin', 'poznan maraton wniki']) assert.equal(trasa(q), 'wyniki-imprezy', q);
  assert.equal(trasa('moje wyniki z maratonu'), 'moje_wyniki');
});

test('osobaZPytania: imię w mianowniku, miejsce zostaje; zawsze osoba (nazwisko „Listopad”); bez pary — jak dotąd', async () => {
  const { zaladuj } = await moduly();
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const os = (q) => { const o = O.osobaZPytania(q); return o && [o.q, o.gdzie || null, !!o.wprost]; };
  assert.deepEqual(os('wyniki Anny Nowak z maratonu'), ['Anna Nowak', null, false]);
  assert.deepEqual(os('wyniki anny nowak z maratonu'), ['anna nowak', null, false]);
  assert.deepEqual(os('wniki anny nowak z maratonu'), ['anna nowak', null, false]);
  assert.deepEqual(os('Wyniki Pawła Nowaka z półmaratonu w Dębnie'), ['Paweł Nowaka', 'Dębnie', false], 'nazwisko w odmianie łapie szukanie po rdzeniach (wynikiSzukaj)');
  assert.deepEqual(os('jakie są wyniki Kasi Zawadzkiej z parkrunu?'), ['Kasia Zawadzkiej', null, false]);
  assert.deepEqual(os('wyniki Anny Listopad z maratonu'), ['Anna Listopad', null, false], 'detektor zdania pomija miesiąc — para i tak jest osobą');
  assert.deepEqual(os('wyniki Katarzyny Chojnackiej'), ['Katarzyna Chojnackiej', null, false], 'dotąd q „Katarzyny …”');
  assert.deepEqual(os('Anna Nowak maraton'), ['Anna Nowak', null, false], 'mianownik bez zmian');
  assert.equal(O.osobaZPytania('wyniki maraton debno'), null);   // „półmaratonu Marii Skłodowskiej” rozstrzyga wcześniej router (test potoku niżej)
});

test('v2 naprawdę: tryb osoby, maszyna pytana o imię w mianowniku; bez sieci, modelu i Google; impreza z patronem dalej regułą wyników', async () => {
  const { zaladuj } = await moduly();
  const f6 = await zaladuj('supabase/functions/okienko/f6.mjs');
  const pytania = [];
  const maszyna = async (url, init) => { const a = JSON.parse(init.body); pytania.push(String(url).split('/rpc/')[1] + ':' + (a.q || a.p_q || '')); return { ok: true, status: 200, json: async () => [] }; };
  const oczekiwane = { 'wyniki Anny Nowak z maratonu': 'Anna Nowak', 'wyniki anny nowak z maratonu': 'anna nowak', 'wniki anny nowak z maratonu': 'anna nowak',
    'Wyniki Pawła Nowaka z półmaratonu w Dębnie': 'Paweł Nowaka', 'wyniki Anny Listopad z maratonu': 'Anna Listopad' };
  for (const [q, szukane] of Object.entries(oczekiwane)) {
    f6._wyczyscPamiecF6(); pytania.length = 0;
    const r = await przebiegV2(q, { fetchF6: maszyna });
    assert.equal(r.slad, 'osoba', q);
    assert.equal(pytania[0], 'search_runners:' + szukane, q + ': ' + pytania.join(', '));
    assert.ok(!pytania.some((p) => p.startsWith('events_search')), q + ': bez kalendarza imprez');
    assert.equal(r.sieci + r.modele, 0, q);
    assert.ok(!JSON.stringify(r.body).includes('google'), q + ': bez Google');
  }
  f6._wyczyscPamiecF6(); pytania.length = 0;
  const p = await przebiegV2('wyniki półmaratonu Marii Skłodowskiej', { fetchF6: maszyna });
  assert.equal(p.slad, 'router:wyniki-imprezy'); assert.deepEqual(pytania, ['events_search:półmaratonu Marii Skłodowskiej']);
});

test('korpus ławek: para w odmianie łapie tylko dwa znane pytania o osoby (już dotąd tryb osoby); kod w routerze, osobie i karcie Google', async () => {
  const { R } = await moduly();
  const zbior = new Set();
  const dodaj = (x) => { if (typeof x === 'string' && x.trim().length >= 2 && x.length < 200) zbior.add(x.trim()); };
  const zbierz = (v) => { if (Array.isArray(v)) { if (typeof v[0] === 'string') dodaj(v[0]); else v.forEach(zbierz); } else if (v && typeof v === 'object') { for (const k of ['p', 'q', 'pytanie', 'tekst', 'pyt']) dodaj(v[k]); } };
  for (const f of ['_lawka-pytan.js', '_lawka-v2-pytania.js', '_lawka-wiedzy.js', '_lawka-akcji.js']) { const m = require('./' + f); for (const k of Object.keys(m)) zbierz(m[k]); }
  zbierz(JSON.parse(fs.readFileSync(path.join(KORZEN, 'tools/okienko-ab-pytania.json'), 'utf8')));
  Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, '_nagrania-v2.json'), 'utf8'))).forEach(dodaj);
  for (const d of Object.values(JSON.parse(fs.readFileSync(path.join(__dirname, '_lawka-v2-kandydaci.json'), 'utf8')))) zbierz(d);
  const pytania = [...zbior];
  assert.ok(pytania.length > 2600, 'korpus ' + pytania.length);
  assert.deepEqual(pytania.filter((q) => R.paraOsobyOdmienionej(q)).sort(), ['wyniki Katarzyny Chojnackiej', 'wyniki Roberta Korzeniowskiego'],
    'nowe pytanie w ławce łapie parę w odmianie? sprawdź trasę i dopisz je tu');
  const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
  const router = czytaj('supabase/functions/okienko/router.mjs');
  assert.match(router, /\n  if \(paraOsobyOdmienionej\(tekst\)\) return null;/, 'dopasuj oddaje trybowi osoby');
  assert.match(czytaj('supabase/functions/okienko/osoba.mjs'), /const odm = paraOsobyOdmienionej\(t\);\n  if \(odm\) \{/);
  assert.match(czytaj('supabase/functions/okienko/impreza.mjs'), /maPareOsoby\(tekst\) \|\| paraOsobyOdmienionej\(tekst\)\) return null;/);
});
