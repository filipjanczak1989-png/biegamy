/* BLIZNA 174 / PLECAK (Filip 5.11): kupiony kask i bidon idą do plecaka, użycie przyciskiem w rundzie, nie na starcie.
   - po jednej sztuce każdego rodzaju na rundę, serwer odejmuje zużyte, użycie bez posiadania = runda podejrzana;
   - przyciski poza płótnem: dotknięcie nie jest skokiem;
   - bez konta, w Małym budowniczym, w premierze i przed migracją przycisków nie ma.
   Po skutku: tools/gra-plecak-test.sql. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;
const MIG = 'supabase/migrations/20261106_gra_plecak.sql';

test('reguła użycia: tylko to, co jest, i po jednej sztuce na rundę', () => {
  assert.equal(L.mozeUzyc({ kask: 1 }, [], 'kask'), true);
  assert.equal(L.mozeUzyc({ kask: 2 }, ['kask'], 'kask'), false, 'drugi kask w tej samej rundzie');
  assert.equal(L.mozeUzyc({ kask: 2 }, ['bidon'], 'kask'), true, 'inny rodzaj nie przeszkadza');
  assert.equal(L.mozeUzyc({ kask: 0 }, [], 'kask'), false);
  assert.equal(L.mozeUzyc({}, [], 'bidon'), false);
  assert.equal(L.mozeUzyc(null, [], 'bidon'), false);
});

test('gra: użycie przyciskiem, nic na start rundy, przycisk nie jest skokiem', () => {
  const s = czytaj('js/cegielki.js');
  assert.match(s, /window\.BM_CEGIELKI_KONTO\.przedRunda\(\);\n\s+odswiezPlecak\(\);/, 'bez zakładania ulepszenia na starcie');
  assert.match(s, /G\.uzyte\.push\(typ\); K\.zuzyjZPlecaka\(typ\);\n\s+zbierz\(\{ typ: typ, x: G\.s, h: 60 \}\);/);
  assert.match(s, /if \(stan !== "gra" \|\| pauza \|\| G\.maly \|\| !K \|\| !K\.plecak \|\| !L\.mozeUzyc\(K\.plecak\(\), G\.uzyte, typ\)\) return;/);
  assert.match(s, /ev\.preventDefault\(\); ev\.stopPropagation\(\); uzyjZPlecaka\(b\.dataset\.typ\);/);
  assert.match(s, /uzyte: g\.uzyte, t: g\.t,/);
  const h = czytaj('gra-cegielki.html');
  assert.match(h, /<div id="plecak-runda" hidden>/); assert.match(h, /data-typ="kask"/); assert.match(h, /data-typ="bidon"/);
  assert.match(h, /\.pr-guzik \{ position:relative; width:72px; height:72px;/, 'duże pod kciuk');
  assert.ok(h.indexOf('<canvas id="c">') < h.indexOf('<div id="plecak-runda"'), 'nad płótnem, poza nim');
});

test('konto: serwer decyduje, sklep do plecaka, wybór na start zniknął', () => {
  const k = czytaj('js/cegielki-konto.js');
  assert.doesNotMatch(k, /stan\.ulepszenie/); assert.doesNotMatch(k, /p_ulepszenie/, 'nowy front nie płaci na starcie');
  assert.match(k, /window\.sb\.rpc\("gra_start_rundy", \{\}\)/);
  assert.match(k, /window\.sb\.rpc\("gra_kup_do_plecaka", \{ p_przedmiot: u\.id \}\)/);
  assert.match(k, /w\.uzyte && w\.uzyte\.length \? \{ uzyte: w\.uzyte \} : \{\}/, 'stary serwer dostaje to samo co dotąd, gdy nic nie użyto');
  assert.match(k, /plecak: function \(\) \{ return premiera \|\| stan\.podglad \|\| !stan\.plecakJest \? null : stan\.plecak; \}/);
  assert.match(k, /var plecakWidac = stan\.zalogowany && !!stan\.plecakJest;/, 'sekcja Magazynu tylko z kontem i po migracji');
  assert.match(k, /stan\.plecakJest = !!po\.data\.plecak;/);
  assert.match(czytaj('gra-cegielki.html'), /id="s-start-naglowek">Do plecaka</);
});

test('baza: ceny te same co w grze, sygnatura bez zmian, zużyte schodzą tylko z przyjętą rundą', { skip: !fs.existsSync(path.join(__dirname, '..', MIG)) && 'migracja plecaka jeszcze poza repo' }, () => {
  const m = czytaj(MIG);
  const ceny = m.match(/case p_przedmiot when 'kask' then (\d+) when 'bidon' then (\d+) end/);
  assert.deepEqual([Number(ceny[1]), Number(ceny[2])], L.ULEPSZENIA.map((u) => u.cena));
  assert.match(m, /'plecak_bez_posiadania'/); assert.match(m, /'plecak_ponad_limit'/);
  assert.match(m, /create or replace function public\.gra_zapisz_wynik\(p_runda uuid, p_postac text, p_cegly integer, p_czas numeric, p_st jsonb\)/);
  assert.ok(m.indexOf('insert into public.gra_wyniki') < m.indexOf('update public.gra_konto k set plecak'), 'odejmowanie po przyjęciu rundy');
  assert.match(m, /public\.gra_mnoznik_poziomu\(2\) <> 1\.17/, 'dopiero na poziomach z mnożnikiem 0,17');
  assert.doesNotMatch(m, /training_logs|akcja_typ/, 'gra nie zna treningów');
});
