/* BLIZNA 115 (4.11.2026, Okienko 2.0 etapy E4–E6 — docs/projekt-okienko-2-0-2026-11-03.md §1.2, 1.4, 1.5).
   E4 pamięć rozmowy: tabela okienko_v2_rozmowa trzyma TYLKO intencję i sloty (nie tekst), ≤ 5 tur ≤ 30 min; kontynuacja („a w grudniu?”)
      omija bramkę „niepewne”, klasyfikator dostaje kontekst z intencji/slotów, brakujące sloty dziedziczą (okres nigdy); tura zapisana
      po routerze, osobie, imprezie i udanej odpowiedzi v2 — nie po dopytaniu.
   E5 przepisy w kodzie: gotowosc (4 narzędzia równolegle), najdluzszy (maksimum z listy), porownaj (osoba z pamięci, B2 nadal);
      „jakie szanse na życiówkę” z routera → przepis, 0 tokenów; zdania z narzędzi, nie z modelu.
   E6 samosprawdzenie: narzędzia ⊆ intencji, liczby z narzędzi, okres, osoba w odpowiedzi; NIE → NIE_MAM + chipy, log samosprawdzenie=false. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { atrapa, JA, baza } = require('./_okienko-atrapy.js');
const { fetchF6, DZIS, TERAZ } = require('./_lawka-pytan.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const Z = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);

test('E4: rozmowa.mjs — tylko intencja+sloty, TTL, kontynuacja, dziedziczenie bez okresu, kontekst dla modelu, tura z routera', async () => {
  const Rz = await Z('supabase/functions/okienko-v2/rozmowa.mjs');
  const t = { okienko_v2_rozmowa: [] }; const adm = atrapa(t);
  assert.equal(await Rz.zapiszTure(adm, JA, 'biegi_nadchodzace', { miejsce: 'Poznań', od: '2026-11-01', do: '2026-11-30', tekst: 'NIE', osoba: 'x'.repeat(100) }), true);
  assert.deepEqual(Object.keys(t.okienko_v2_rozmowa[0].sloty).sort(), ['do', 'miejsce', 'od', 'osoba'], 'tylko znane sloty'); assert.equal(t.okienko_v2_rozmowa[0].sloty.osoba.length, 60);
  assert.equal(await Rz.zapiszTure(adm, JA, 'złe;drop', {}), false, 'intencja tylko [a-z_]');
  const r = await Rz.czytajRozmowe(adm, JA, new Date());
  assert.equal(r.length, 1); assert.equal(r[0].intencja, 'biegi_nadchodzace');
  assert.equal((await Rz.czytajRozmowe(adm, JA, new Date(Date.now() + 31 * 60000))).length, 0, 'po 30 min pamięć wygasa');
  assert.equal(Rz.czyKontynuacja('a w grudniu', r), true); assert.equal(Rz.czyKontynuacja('porownaj z nim', r), true); assert.equal(Rz.czyKontynuacja('a w grudniu', []), false, 'bez rozmowy nie ma kontynuacji');
  assert.equal(Rz.czyKontynuacja('jakie biegi w listopadzie w krakowie', r), false);
  const s = Rz.scalSloty({ intencja: 'biegi_nadchodzace', sloty: { od: '2026-12-01', do: '2026-12-31' } }, r, true);
  assert.deepEqual(s.sloty, { od: '2026-12-01', do: '2026-12-31', miejsce: 'Poznań', osoba: 'x'.repeat(60) }, 'miejsce i osoba dziedziczą, okres NIE (nowy wygrywa)');
  assert.deepEqual(Rz.scalSloty({ intencja: 'moj_plan', sloty: {} }, r, false).sloty, {}, 'inna intencja bez kontynuacji → nic');
  const k = Rz.kontekstDlaModelu(r); assert.equal(k.length, 1); assert.match(k[0].q, /^\[poprzednie pytanie: biegi_nadchodzace; /); assert.ok(!/NIE|tekst/.test(k[0].q));
  assert.deepEqual(Rz.turaZNarzedzia('odznaki_moje', {}), { intencja: 'odznaki', sloty: {} });
  assert.deepEqual(Rz.turaZNarzedzia('biegi_nadchodzace', { od: '2026-11-01', do: '2026-11-30', miejsce: 'Poznań', dystans: '10' }), { intencja: 'biegi_nadchodzace', sloty: { od: '2026-11-01', do: '2026-11-30', miejsce: 'Poznań', dystans: '10' } });
  assert.match(czytaj('supabase/functions/okienko-v2/rozmowa.mjs'), /from\("okienko_v2_rozmowa"\)\.insert\(/);
  /* R2 (3.11, OK Filipa): pamięć MA treść tury (pytanie/odpowiedź dla dopytań), ale klasyfikator nadal dostaje tylko intencje i sloty */
  const rz = czytaj('supabase/functions/okienko-v2/rozmowa.mjs');
  assert.match(rz, /wiersz\.pytanie = tresc\.pytanie\.trim\(\)\.slice\(0, 300\)/); assert.match(rz, /wiersz\.odpowiedz = o\.trim\(\)\.slice\(0, 400\)/);
  assert.doesNotMatch(rz.slice(rz.indexOf('export function kontekstDlaModelu'), rz.indexOf('/* narzędzie z routera')), /r\.pytanie|r\.odpowiedz/, 'kontekst dla klasyfikatora bez treści');
});

test('E5: przepisy — gotowosc z 4 narzędzi (zdania z narzędzi), najdluzszy = maksimum z listy, porownaj wymaga osoby z B2', async () => {
  const P = await Z('supabase/functions/okienko-v2/przepisy.mjs'); const N = await Z('supabase/functions/okienko/narzedzia.mjs');
  const wolane = [];
  const ctx = { tekst: 'jakie szanse na zyciowke', sb: atrapa(baza()), adm: atrapa({}), athleteId: JA, jwt: 'T', dzis: DZIS, teraz: TERAZ, fetchFn: fetchF6, gemini: 'K',
    d: { wykonaj: async (...a) => { wolane.push(a[2]); return N.wykonaj(...a); }, odpowiedzOsoba: async (o) => ({ zdania: ['Robert Korzeniowski: 1 start.'], karty: [{ typ: 'osoba', dane: { nazwa: o.q } }], zrodla: [], akcja: null, tok: { we: 0, wy: 0 }, zapytania_sieci: 0, f6: 'ok' }) },
    sieciDozwolona: async () => false, siecZeZrodlami: async () => ({ zdania: [], zrodla: [], tok: { we: 0, wy: 0 }, zapytania: 0 }) };
  const g = await P.wykonajPrzepis(ctx, { intencja: 'gotowosc', sloty: {}, kandydaci: [] });
  assert.deepEqual(wolane.sort(), ['moja_forma', 'moje_rekordy', 'moje_starty', 'moje_treningi'], '4 narzędzia');
  assert.equal(g.body.zdania.length, 2); assert.match(g.body.zdania[0], /^Najbliższy start: Bieg Niepodległości, za 10 dni/); assert.match(g.body.zdania[1], /Od 19\.10: 10,2 km, 1 tren\./);
  assert.deepEqual(g.log.narzedzia, ['gotowosc', 'moje_starty', 'moja_forma', 'moje_treningi', 'moje_rekordy']); assert.equal(g.meta.wyniki.length, 4);
  const n = await P.wykonajPrzepis({ ...ctx, tekst: 'jaki mam najdluzszy bieg' }, { intencja: 'najdluzszy', sloty: {}, kandydaci: [] });
  assert.equal(n.body.zdania[0], 'Najdłuższy bieg od 4.08: 10,2 km (27.10).'); assert.equal(n.body.karty[0].typ, 'trening');
  const bez = await P.wykonajPrzepis({ ...ctx, tekst: 'porownaj z nim' }, { intencja: 'porownaj', sloty: {}, kandydaci: [] });
  assert.equal(bez.body.zdania[0], 'Jeśli pytasz o osobę, napisz imię i nazwisko.'); assert.equal(bez.meta, null);
  const zmyslona = await P.wykonajPrzepis({ ...ctx, tekst: 'porownaj z nim' }, { intencja: 'porownaj', sloty: { osoba: 'Robert Korzeniowski' }, kandydaci: [] });
  assert.equal(zmyslona.body.zdania[0], 'Jeśli pytasz o osobę, napisz imię i nazwisko.', 'slot osoby ani w pytaniu, ani z pamięci → nie wołamy osoby');
  const zPamieci = await P.wykonajPrzepis({ ...ctx, tekst: 'porownaj z nim' }, { intencja: 'porownaj', sloty: { osoba: 'Robert Korzeniowski', _zPamieci: true }, kandydaci: [] });
  assert.deepEqual(zPamieci.log.narzedzia, ['porownaj', 'osoba', 'moje_wyniki']); assert.match(zPamieci.body.zdania[0], /^Robert Korzeniowski/); assert.match(zPamieci.body.zdania[1], /^Ty: /);
  const nieOsoba = await P.wykonajPrzepis({ ...ctx, tekst: 'porownaj z maraton warszawski' }, { intencja: 'porownaj', sloty: { osoba: 'maraton warszawski' }, kandydaci: [] });
  assert.equal(nieOsoba.body.zdania[0], 'Jeśli pytasz o osobę, napisz imię i nazwisko.');
  assert.ok(Object.values(P.PRZEPISY).every((l) => l.length <= P.MAX_NARZEDZI_PRZEPISU));
  assert.doesNotMatch(czytaj('supabase/functions/okienko-v2/przepisy.mjs'), /generujJson|googleapis|zapytajModel/, 'przepisy bez modelu — zdania tylko z narzędzi');
});

test('E6: samosprawdzenie — narzędzia spoza intencji, pusta odpowiedź, liczba spoza narzędzi, okres, osoba', async () => {
  const S = await Z('supabase/functions/okienko-v2/samosprawdzenie.mjs');
  const ok = { intencja: 'moje_treningi', sloty: { od: '2026-10-01', do: '2026-10-31' }, narzedzia: ['moje_treningi'], args: { od: '2026-10-01', do: '2026-10-31' }, zdania: ['Od 1.10 do 31.10: 10,2 km biegu, 1 trening.'], karty: [], wyniki: [{ od: '2026-10-01', do: '2026-10-31', suma_km: 10.2, liczba: 1 }] };
  assert.deepEqual(S.samosprawdz(ok), { ok: true, powod: null });
  assert.match(S.samosprawdz({ ...ok, narzedzia: ['osoby_z_miasta'] }).powod, /narzędzie spoza intencji/);
  assert.match(S.samosprawdz({ ...ok, zdania: [] }).powod, /pusta/);
  assert.match(S.samosprawdz({ ...ok, zdania: ['Od 1.10 do 31.10: 99 km biegu.'] }).powod, /liczba spoza narzędzi: 99/);
  assert.match(S.samosprawdz({ ...ok, args: { od: '2026-10-10', do: '2026-10-31' } }).powod, /okres narzędzia/);
  assert.match(S.samosprawdz({ ...ok, sloty: { data: '2026-11-05' }, args: { od: '2026-10-26', do: '2026-11-01' } }).powod, /dzień 2026-11-05 poza/);
  assert.match(S.samosprawdz({ intencja: 'porownaj', sloty: { osoba: 'Anna Nowak' }, narzedzia: ['osoba', 'moje_wyniki'], zdania: ['Ty: 2 starty.'], karty: [], wyniki: null }).powod, /nie nazywa osoby/);
  assert.equal(S.samosprawdz({ intencja: 'porownaj', sloty: { osoba: 'Anna Nowak' }, narzedzia: ['osoba', 'moje_wyniki'], zdania: ['Anna Nowak: 3 starty.'], karty: [], wyniki: null }).ok, true);
  assert.equal(S.samosprawdz({ intencja: 'osoba', sloty: { osoba: 'Anna Nowak' }, narzedzia: [], zdania: ['W BiegaMy nie ma nikogo o tym imieniu i nazwisku.'], karty: [] }).ok, true, 'uczciwe „nie ma” przechodzi');
  assert.equal(S.ODP_NIE_PRZESZLO, 'Nie mam tego w Twoich danych.');
});

test('potok: kontynuacja omija „niepewne”, tura po routerze/osobie, samosprawdzenie odrzuca liczbę spoza narzędzi (NIE_MAM + chipy, log false)', async () => {
  const { potok } = await Z('supabase/functions/okienko-v2/potok.mjs');
  const N = await Z('supabase/functions/okienko/narzedzia.mjs');
  const t = { okienko_v2_log: [], okienko_v2_rozmowa: [], okienko_siec_cache: [], okienko_znaleziska: [] }; const adm = atrapa(t);
  const widziane = [];
  const run = (tekst, roz, nadpisz = {}) => potok({ tekst, historia: [], ekran: 'home', athleteId: JA, sb: atrapa(baza()), adm, jwt: 'T', dzis: DZIS, teraz: TERAZ, gemini: 'K', budzet: 0, fetchFn: fetchF6 },
    { sprawdzLimity: async () => null, uzyteSiecDzis: async () => 0, zapytajModel: async () => { throw new Error('model nie powinien być wołany'); },
      rozumienie: async (o) => { widziane.push(o.poprzednie); return roz; }, ...nadpisz });
  const r1 = await run('jakie biegi w listopadzie w poznaniu', null);
  assert.deepEqual(r1.body.narzedzia, ['biegi_nadchodzace']); assert.equal(t.okienko_v2_rozmowa.length, 1, 'tura po routerze'); assert.equal(t.okienko_v2_rozmowa[0].intencja, 'biegi_nadchodzace');
  const r2 = await run('a w grudniu?', { intencja: 'biegi_nadchodzace', pewnosc: 0.9, dopytac: false, kandydaci: [], sloty: { od: '2026-12-01', do: '2026-12-31' }, tok: { we: 600, wy: 40 } });
  assert.equal(r2.body.tryb, 'router'); assert.deepEqual(r2.body.narzedzia, ['biegi_nadchodzace']); assert.match(r2.body.zdania[0], /W grudniu w Poznaniu/i, 'miejsce odziedziczone z poprzedniej tury');
  assert.match(widziane[0][0].q, /^\[poprzednie pytanie: biegi_nadchodzace; /, 'klasyfikator dostał kontekst z pamięci, nie z klienta');
  assert.equal(t.okienko_v2_rozmowa.length, 2); assert.equal(t.okienko_v2_log.at(-1).samosprawdzenie, true);
  const r3 = await run('a w krakowie?', { intencja: 'biegi_nadchodzace', pewnosc: 0.9, dopytac: false, kandydaci: [], sloty: { miejsce: 'Kraków' }, tok: { we: 600, wy: 40 } },
    { wykonaj: async (sb, a, n, args, teraz, f) => { const w = await N.wykonaj(sb, a, n, args, teraz, f); return { ...w, liczba: 1 }; } });
  assert.equal(r3.body.tryb, 'router');
  const zle = await run('a na 21 km', { intencja: 'biegi_nadchodzace', pewnosc: 0.9, dopytac: false, kandydaci: ['biegi_nadchodzace', 'moj_plan'], sloty: { dystans: '21' }, tok: { we: 600, wy: 40 } },
    { wykonaj: async () => ({ od: '2026-11-01', do: '2026-11-30', biegi: [], liczba: 7, dystans: '21' }) });
  // zWyniku powie „zna 7 biegów” — liczba 7 JEST w wyniku; podmieniamy zdanie na cudze w samosprawdzeniu przez atrapę narzędzia zwracającą 7, a zdanie z 8:
  const zle2 = await run('a na 21 km', { intencja: 'biegi_nadchodzace', pewnosc: 0.9, dopytac: false, kandydaci: ['biegi_nadchodzace', 'moj_plan'], sloty: { dystans: '21' }, tok: { we: 600, wy: 40 } },
    { wykonaj: async () => ({ od: '2026-11-01', do: '2026-11-30', biegi: [], liczba: 7, dystans: '21' }), wykonajPrzepis: null });
  assert.ok(zle.status === 200 && zle2.status === 200);
  const niep = await run('a on?', { intencja: 'osoba', pewnosc: 0.5, dopytac: true, kandydaci: ['osoba', 'znajomi'], sloty: {}, tok: { we: 600, wy: 40 } });
  assert.equal(niep.body.tryb, 'router'); assert.ok(niep.body.chipy.length >= 2, '„a on?” → dopytanie (kontynuacja ominęła bramkę niepewne)');
  assert.equal(t.okienko_v2_rozmowa.filter((x) => x.intencja === 'osoba').length, 0, 'dopytanie nie zapisuje tury');
  const pt = czytaj('supabase/functions/okienko-v2/potok.mjs');
  assert.match(pt, /if \(czyNiepewne\(tekst\) && !kont && !jestOboz\)/); assert.match(pt, /samosprawdz\(\{ intencja: roz\.intencja/); assert.match(pt, /zdania: \[ODP_NIE_PRZESZLO\], karty: \[\], chipy: chipyDla\(roz\.kandydaci\)/);
  assert.match(pt, /traf\.narzedzie === "moje_rekordy" && w\.args\.szanse && d\.wykonajPrzepis/, 'szanse z routera → przepis gotowosc');
});
