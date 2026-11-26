// Blizna #383 (26.11.2026) — kadry dnia do nagłówka nowego Dziś: pliki w repo i ich lista.
//
// Kadr w nagłówku to największy obraz pierwszego ekranu. Trzy rzeczy psują go po cichu i żadnej nie widać w kodzie:
//   (1) plik cięższy niż limit (1280 px do 80 kB, 960 px do 50 kB): Dziś ma być lżejsze niż ze starym kadrem (275 kB), nie cięższe;
//   (2) lista wskazuje plik, którego nie ma, albo w innym rozmiarze: ramka nagłówka zostaje pusta, a błędu nikt nie zobaczy;
//   (3) plik bez wpisu na liście: leży w repo, waży, a nikt go nie pokazuje.
// Lista (assets/ui/dzis/kadry/kadry.json) jest jedynym źródłem cech kadru: pora roku, pogoda, pora dnia, kolor tła.
// Pliki leżą w repo aplikacji (GitHub Pages), nie w Supabase Storage: transfer z magazynu jest na limicie.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KAT = path.join(__dirname, '..', 'assets', 'ui', 'dzis', 'kadry');
const LISTA = JSON.parse(fs.readFileSync(path.join(KAT, 'kadry.json'), 'utf8'));
const PORY_ROKU = ['wiosna', 'lato', 'jesien', 'zima'], POGODA = [null, 'snieg', 'deszcz', 'mgla', 'upal'], PORY_DNIA = ['dzien', 'zmrok'];
const LIMITY = { 960: [411, 50000], 1280: [549, 80000] };

/** Wymiary z nagłówka WebP (trzy odmiany kontenera). Zły plik = null. */
function wymiaryWebp(b) {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const rodzaj = b.toString('ascii', 12, 16);
  if (rodzaj === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (rodzaj === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (rodzaj === 'VP8L') { const n = b.readUInt32LE(21); return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)]; }
  return null;
}
const plik = (id, szer) => path.join(KAT, id + '-' + szer + '.webp');

test('(1) lista: dwa rozmiary z limitami 50 kB i 80 kB, proporcje 21:9', () => {
  assert.equal(LISTA.proporcje, '21:9');
  assert.deepEqual(LISTA.rozmiary.map((r) => [r.szerokosc, r.wysokosc, r.limit_bajtow]), [[960, 411, 50000], [1280, 549, 80000]],
    'rozmiary i limity są częścią umowy: zmiana wymaga decyzji, nie przestawienia liczby');
  for (const r of LISTA.rozmiary) assert.ok(Math.abs(r.szerokosc / r.wysokosc - 21 / 9) < 0.01, r.szerokosc + ' px nie jest 21:9');
});

test('(2) lista: każdy kadr ma poprawne cechy, nazwę bez numeru źródła i jest wpisany raz', () => {
  assert.ok(Array.isArray(LISTA.kadry) && LISTA.kadry.length >= 1);
  const widziane = new Set();
  for (const k of LISTA.kadry) {
    assert.match(k.id, /^[a-z]+(-[a-z]+)+$/, 'nazwa krótka, małe litery i myślniki, bez cyfr: ' + k.id);
    assert.ok(!widziane.has(k.id), 'kadr wpisany dwa razy: ' + k.id); widziane.add(k.id);
    assert.ok(PORY_ROKU.includes(k.pora_roku), k.id + ': pora_roku ' + k.pora_roku);
    assert.ok(k.id.startsWith(k.pora_roku + '-'), k.id + ': nazwa zaczyna się od pory roku');
    assert.ok(POGODA.includes(k.pogoda), k.id + ': pogoda ' + k.pogoda);
    assert.ok(PORY_DNIA.includes(k.pora_dnia), k.id + ': pora_dnia ' + k.pora_dnia);
    assert.match(k.tlo, /^#[0-9a-f]{6}$/, k.id + ': tlo ma być kolorem #rrggbb');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(k.tlo.slice(i, i + 2), 16));
    assert.ok(Math.max(r, g, b) <= 96, k.id + ': tło ramki ma być ciemne (na nim stoi jasny napis, zanim wczyta się zdjęcie)');
    assert.equal(typeof k.opis, 'string');
  }
});

test('(3) każdy kadr z listy istnieje w obu rozmiarach, jest plikiem WebP o podanych wymiarach i mieści się w limicie wagi', () => {
  for (const k of LISTA.kadry) for (const szer of Object.keys(LIMITY)) {
    const p = plik(k.id, szer), [wys, limit] = LIMITY[szer];
    assert.ok(fs.existsSync(p), 'brak pliku ' + path.basename(p));
    const b = fs.readFileSync(p);
    assert.deepEqual(wymiaryWebp(b), [Number(szer), wys], path.basename(p) + ': to nie WebP ' + szer + '×' + wys);
    assert.ok(b.length <= limit, path.basename(p) + ' waży ' + b.length + ' B, limit ' + limit + ' B');
    assert.ok(b.length >= 5000, path.basename(p) + ' jest podejrzanie mały (' + b.length + ' B): pusty albo urwany');
  }
});

test('(4) w katalogu nie ma niczego spoza listy', () => {
  const oczekiwane = new Set(['kadry.json']);
  for (const k of LISTA.kadry) for (const szer of Object.keys(LIMITY)) oczekiwane.add(k.id + '-' + szer + '.webp');
  const sa = fs.readdirSync(KAT).sort();
  assert.deepEqual(sa.filter((n) => !oczekiwane.has(n)), [], 'plik bez wpisu na liście');
  assert.equal(sa.length, oczekiwane.size);
});

test('(5) zima da się pokazać o każdej porze: jest kadr dzienny i kadr na zmrok bez warunku pogody', () => {
  const zima = LISTA.kadry.filter((k) => k.pora_roku === 'zima');
  for (const pora of PORY_DNIA) assert.ok(zima.some((k) => k.pora_dnia === pora && k.pogoda === null), 'zima, ' + pora + ': brak kadru bez warunku pogody (w zwykły dzień nagłówek byłby pusty)');
});

test('(6) kadry nie idą do Supabase ani do listy wstępnego pobierania Service Workera', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.ok(!sw.includes('assets/ui/dzis/kadry'), 'kadry w liście SW pobierałoby każde konto przy instalacji, także bez nowego Dziś');
  assert.ok(!JSON.stringify(LISTA).includes('supabase'), 'adresy kadrów są względne, w repo aplikacji');
});
