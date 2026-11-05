/* BLIZNA 169 / PARTNERZY POPRZEDNICH WYZWAŃ (Filip 5.11): osiedle, galeria i fabryka z tablicą, osobno od firm akcji.
   - logo, plakat i tekst plakatu tylko po zgodzie firmy, przełącznik na wpisie; bez zgody budynek z samą nazwą;
   - nazwy ani logo firm nie ma w repo, repo jest publiczne: wpisy i pliki powstają w panelu;
   - partner nie wchodzi pod tytuł i tekst o wpłatach na tę zbiórkę.
   Po skutku: tools/partnerzy-test.sql. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;
const LOGO = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/11111111-1111-4111-8111-111111111111.png';
const PLAKAT = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/22222222-2222-4222-8222-222222222222.webp';

test('budynki: w atlasie, poza ładowaniem na starcie, szyldy zgodne między grą a Ulicą', () => {
  const atlas = JSON.parse(czytaj('assets/gra/atlas.json')), szyldy = JSON.parse(czytaj('assets/ulica/szyldy.json'));
  for (const n of ['osiedle', 'galeria', 'fabryka']) {
    assert.ok(atlas[n] && atlas[n].w && atlas[n].h, n); assert.ok(L.BUDYNKI_POPRZEDNICH[n] > 0, n);
    assert.deepEqual(L.SZYLDY[n], szyldy[n].szyld, n);
    for (const kat of ['assets/gra', 'assets/ulica']) assert.ok(fs.statSync(path.join(__dirname, '..', kat, n + '.webp')).size < 90 * 1024, kat + '/' + n + ' lekki');
  }
  assert.deepEqual(L.PLAKATY.fabryka, szyldy.fabryka.plakat);
  assert.match(czytaj('js/cegielki.js'), /k !== "wiezowiec" && !L\.BUDYNKI_POPRZEDNICH\[k\] &&/, 'bez wpisu partnera gra nie pobiera budynków');
});

test('gra: wpis z licznika, adres plakatu tylko z kubełka, tekst sam przy mijaniu', () => {
  const [z] = L.firmyZLicznika({ firmy: [{ nazwa: 'Fabryka Testowa', rodzaj: 'fabryka', wsparcie: 'poprzednie', logo_url: LOGO, plakat_url: PLAKAT, plakat_tekst: 'Tekst' }] });
  assert.deepEqual([z.rodzaj, z.logo, z.plakat, z.plakatTekst, z.partner], ['fabryka', LOGO, PLAKAT, 'Tekst', false]);
  const [bez] = L.firmyZLicznika({ firmy: [{ nazwa: 'Fabryka Testowa', rodzaj: 'fabryka', wsparcie: 'poprzednie', logo_url: null, plakat_url: null, plakat_tekst: null }] });
  assert.deepEqual([bez.rodzaj, bez.nazwa, bez.logo, bez.plakat, bez.plakatTekst], ['fabryka', 'Fabryka Testowa', '', '', ''], 'bez zgody sama nazwa');
  const [obcy] = L.firmyZLicznika({ firmy: [{ nazwa: 'X X', rodzaj: 'fabryka', plakat_url: 'https://zly.example/x.png' }] });
  assert.equal(obcy.plakat, '', 'plakat spoza kubełka');
  const [zly] = L.firmyZLicznika({ firmy: [{ nazwa: 'X X', rodzaj: 'zamek' }] });
  assert.equal(zly.rodzaj, 'domek');
  const s = czytaj('js/cegielki.js');
  assert.match(s, /if \(poprzedni\.length && \+\+G\.ileDoPoprzedniego >= L\.POPRZEDNI_CO\)/);
  assert.match(s, /d\.powiedziany = true; dodajNapis\(f\.plakatTekst/);
});

test('strona akcji i panel: partnerzy osobno, zgoda na wpisie', async () => {
  const k = czytaj('js/akcja.mjs'), t = czytaj('trener.html');
  assert.match(k, /Partnerzy poprzednich wyzwań<\/h3>/);
  assert.match(k, /d\.firmy\.filter\(function \(f\) \{ return !poprz\(f\); \}\)/);
  assert.match(k, /wiersz\.logo_zgoda = o\.logoZgoda === true;/, 'domyślnie bez zgody');
  assert.match(t, /<optgroup label="Partnerzy poprzednich wyzwań">/);
  assert.match(t, /id="firma-logo-zgoda"/); assert.match(t, /id="firma-plakat"/); assert.match(t, /data-firma-logo=/);
  assert.match(t, /update\(\{ logo_zgoda: !f\.logo_zgoda \}\)/);
  const s = czytaj('js/ulica-scena.mjs');
  assert.match(s, /if \(def\.plakat && f\.plakat\)/); assert.match(s, /karta\.poprzedni\) el\("i", "", b, "Partner poprzednich wyzwań"\)/);
  assert.ok(pathToFileURL);
});

test('baza: zgoda w liczniku, bez wpisów firm w migracji', { skip: !fs.existsSync(path.join(__dirname, '..', 'supabase/migrations/20261106_partnerzy.sql')) && 'migracja poza commitem' }, () => {
  const m = czytaj('supabase/migrations/20261106_partnerzy.sql');
  assert.match(m, /'logo_url', case when f\.logo_zgoda then f\.logo_url end/);
  assert.match(m, /'plakat_url', case when f\.logo_zgoda then f\.plakat_url end, 'plakat_tekst', case when f\.logo_zgoda then f\.plakat_tekst end/);
  assert.doesNotMatch(m, /insert into public\.akcja_firmy/i, 'wpisy powstają w panelu');
});

test('migracja podmienia licznik tylko na wersji, z której powstała: inny odcisk = odmowa przed pierwszą zmianą', () => {
  const m = czytaj('supabase/migrations/20261106_partnerzy.sql');
  assert.match(m, /if v_odcisk <> '[0-9a-f]{32}' then\s+raise exception 'partnerzy: licznik na bazie zmienił się/);
  assert.ok(m.indexOf('declare v_odcisk') < m.indexOf('alter table public.akcja_firmy'), 'strażnik przed pierwszą zmianą');
  assert.doesNotMatch(m.match(/declare v_odcisk[^\n]*/)[0], /lower\(/, 'lower() zależy od ustawień bazy, a w definicji jest wielkie Ź');
});

test('uprawnień licznika migracja nie rusza: anon go nie woła, tylko EF z kluczem serwisowym (decyzja 2.11)', () => {
  for (const p of ['supabase/migrations/20261106_partnerzy.sql', 'supabase/migrations/20261106_WYCOFANIE_partnerzy.sql']) {
    const m = czytaj(p);
    assert.doesNotMatch(m, /on function public\.akcja_licznik\(text\)/, p + ': create or replace zachowuje uprawnienia');
    assert.match(m, /if has_function_privilege\('anon', 'public\.akcja_licznik\(text\)', 'EXECUTE'\) then raise exception/, p);
    assert.match(m, /if not has_function_privilege\('service_role', 'public\.akcja_licznik\(text\)', 'EXECUTE'\) then raise exception/, p);
  }
});

