// Blizna #40 (07.10.2026) — katalog odznak (odznaki.html) vs silnik (zawodnik.html): jedna prawda.
//
// Zmierzone 7.10: katalog 110, silnik 122, wspólnych 89. 21 pozycji tylko w katalogu (obietnice bez
// definicji), 33 tylko w silniku (przyznawane od miesięcy, NIEWIDOCZNE w katalogu), 31 pozycji
// katalogu bez żadnej reguły, 2 id z polskimi znakami (= brak ikony .webp na zawsze).
// Decyzja Filipa 7.10: 31 bez reguły → flaga `bez_reguly:true` i NIE są renderowane (definicje
// zostają); 33 tylko-silnik → do katalogu 1:1; maratończyk/gaduła → ASCII; pary duplikatów
// NIETKNIĘTE do wyniku SQL.
// Pomiar achievements 7.10 (Filip, tools/pomiar-odznaki-pary-i-bez-reguly.sql): 3_z_rzedu 31 / 3_dni_pod_rzad 27
// i bez_dnia_przerwy 1 / 30_dni_challenge 1 — obie strony przyznawane, OBIE zostają; 31 bez reguły (w tym
// maratończyk/gaduła) = 0 przyznań → migracja przepinająca id w achievements NIEPOTRZEBNA (usunięta);
// 33 tylko-silnik: 26 przyznawanych, 7 nigdy — wszystkie widoczne. Decyzja: nic ponad flagę bez_reguly.
//
// Test porównuje OBA pliki (dotąd tests/odznaki.test.js czytał tylko zawodnik.html).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8');

function badges(plik) {
  const src = czytaj(plik);
  const m = src.match(/const BADGES\s*=\s*\[[\s\S]*?\n\];/);
  assert.ok(m, plik + ': brak const BADGES');
  const lista = new Function(m[0] + ' return BADGES;')();   // literał obiektów, bez zależności
  const mapa = new Map();
  for (const b of lista) { assert.ok(!mapa.has(b.id), plik + ': duplikat id ' + b.id); mapa.set(b.id, b); }
  return { src, mapa, lista };
}

const SILNIK = badges('zawodnik.html');
const KATALOG = badges('odznaki.html');
const reguly = new Set([...SILNIK.src.matchAll(/awardBadge\(\s*'([^']+)'/g)].map((x) => x[1]));
const WYZWANIA = new Set([...SILNIK.src.matchAll(/WYZWANIA\s*=\s*\[[\s\S]*?\];/g)].flatMap((x) => [...x[0].matchAll(/id\s*:\s*'([^']+)'/g)].map((y) => y[1])));

test('każda definicja SILNIKA jest w katalogu (zdobyta odznaka nie może być niewidoczna)', () => {
  const brak = [...SILNIK.mapa.keys()].filter((id) => !KATALOG.mapa.has(id));
  assert.deepEqual(brak, [], 'silnik przyznaje, katalog nie pokazuje: ' + brak.join(', '));
});

test('każda WIDOCZNA pozycja katalogu ma regułę w silniku (literalną albo pętlę WYZWANIA)', () => {
  const widoczne = KATALOG.lista.filter((b) => !b.bez_reguly);
  const bezReguly = widoczne.filter((b) => !reguly.has(b.id) && !WYZWANIA.has(b.id)).map((b) => b.id);
  assert.deepEqual(bezReguly, [], 'katalog obiecuje, silnik nie przyznaje: ' + bezReguly.join(', '));
});

test('pozycje z bez_reguly NAPRAWDĘ nie mają reguły (flaga nie ukrywa działających odznak)', () => {
  const zle = KATALOG.lista.filter((b) => b.bez_reguly && (reguly.has(b.id) || WYZWANIA.has(b.id))).map((b) => b.id);
  assert.deepEqual(zle, [], 'oznaczone bez_reguly, a silnik je przyznaje — zdjąć flagę: ' + zle.join(', '));
  assert.equal(KATALOG.lista.filter((b) => b.bez_reguly).length, 31, 'liczba bez_reguly zmieniła się — świadomie?');
});

test('wspólne id mają identyczną nazwę, opis, rzadkość, kategorię i hidden', () => {
  const rozne = [];
  for (const [id, s] of SILNIK.mapa) {
    const k = KATALOG.mapa.get(id); if (!k) continue;
    for (const pole of ['name', 'desc', 'rarity', 'cat']) if (s[pole] !== k[pole]) rozne.push(id + '.' + pole);
    if (!!s.hidden !== !!k.hidden) rozne.push(id + '.hidden');
  }
  assert.deepEqual(rozne, [], 'definicje rozjechały się: ' + rozne.join(', '));
});

test('id = nazwa pliku .webp: tylko ASCII [a-z0-9_]', () => {
  const zle = [...KATALOG.mapa.keys(), ...SILNIK.mapa.keys()].filter((id) => !/^[a-z0-9_]+$/.test(id));
  assert.deepEqual([...new Set(zle)], [], 'id z nie-ASCII: ' + zle.join(', '));
  assert.ok(KATALOG.mapa.has('maratonczyk') && KATALOG.mapa.has('gadula'), 'ASCII-owe id maratonczyk/gadula zniknęły z katalogu');
  // migracja przepinająca achievements NIE istnieje świadomie: stare id miały 0 przyznań (pomiar 7.10)
  assert.ok(!fs.existsSync(path.join(KORZEN, 'supabase/migrations/20261007_achievements_id_ascii.sql')), 'migracja ASCII wróciła — przy 0 przyznań jest zbędna');
});

test('render katalogu idzie przez KATALOG() (bez bez_reguly), a detail nadal przez BADGES.find', () => {
  const src = KATALOG.src;
  assert.match(src, /const KATALOG = \(\) => BADGES\.filter\(b => !b\.bez_reguly\);/);
  assert.equal((src.match(/KATALOG\(\)/g) || []).length, 4, 'render ma 4 użycia KATALOG() (cats, licznik, kategorie, zablokowane)');
  assert.match(src, /const badge = BADGES\.find\(b => b\.id === badgeId\);/, 'szczegół ma czytać pełną listę (zdobyta odznaka bez_reguly nadal ma nazwę)');
});

test('pary duplikatów: po pomiarze 7.10 obie strony zdefiniowane, strona bez reguły ukryta flagą, strony z regułą widoczne', () => {
  // 3_z_rzedu/3_dni_pod_rzad i bez_dnia_przerwy/30_dni_challenge — obie strony przyznawane → obie widoczne
  for (const id of ['3_z_rzedu', '3_dni_pod_rzad', 'bez_dnia_przerwy', '30_dni_challenge']) {
    assert.ok(KATALOG.mapa.has(id) && !KATALOG.mapa.get(id).bez_reguly, id + ' ma być widoczna (przyznawana)');
  }
  for (const [a, b] of [['dystans_2000', '2000km_total'], ['nocny_wojownik', 'sowa'], ['early_bird', 'wczesny_ptak'],
                        ['nie_ma_wymowek', 'deszcz'], ['nowy_rekord', 'pb_run'], ['negative_split', 'tempo_negatyw'],
                        ['3_z_rzedu', '3_dni_pod_rzad'], ['bez_dnia_przerwy', '30_dni_challenge']]) {
    assert.ok(KATALOG.mapa.has(a) && KATALOG.mapa.has(b), 'para ' + a + '/' + b + ' ruszona przed decyzją');
  }
});

test('pomiar-odznaki: lista katalogu w SQL (pkt 4) = BADGES z odznaki.html, a 31 bez_reguly i 33 tylko-silnik w pkt 2/3', () => {
  const sql = czytaj('tools/pomiar-odznaki-pary-i-bez-reguly.sql');
  const idsZ = (fragment) => new Set([...fragment.matchAll(/'([^']+)'/g)].map((x) => x[1]));
  const pkt4 = idsZ(sql.split('-- 4. KONTROLA')[1].split('group by 1')[0].split('not in (')[1]);
  const brak = KATALOG.lista.map((b) => b.id).filter((id) => !pkt4.has(id));
  const nadmiar = [...pkt4].filter((id) => !KATALOG.mapa.has(id));
  assert.deepEqual(brak, [], 'SQL pkt 4 nie zna id z katalogu: ' + brak.join(', '));
  assert.deepEqual(nadmiar, [], 'SQL pkt 4 ma id spoza katalogu: ' + nadmiar.join(', '));
  const pkt3 = idsZ(sql.split('-- 3. BEZ REGU')[1].split('group by 1')[0]);
  const bezReguly = KATALOG.lista.filter((b) => b.bez_reguly).map((b) => b.id).filter((id) => !pkt3.has(id));
  assert.deepEqual(bezReguly, [], 'SQL pkt 3 nie liczy bez_reguly: ' + bezReguly.join(', '));
  const pkt2 = idsZ(sql.split('-- 2. TYLKO SILNIK')[1].split('group by 1')[0]);
  const tylkoSilnik = KATALOG.lista.filter((b) => b.cat === 'Tempo' || b.cat === 'Specjalne' || b.cat === 'Sekretne' ||
    ['pierwszy_fan','stary_druh','coach_whisperer','spam_friend','pliszka','pierwszy_pojedynek','zwyciezca_pojedynku','mistrz_pojedynkow'].includes(b.id));
  assert.equal(tylkoSilnik.length, 33, 'grupa tylko-silnik w katalogu ma 33 pozycje');
  const brak2 = tylkoSilnik.map((b) => b.id).filter((id) => !pkt2.has(id));
  assert.deepEqual(brak2, [], 'SQL pkt 2 nie liczy tylko-silnik: ' + brak2.join(', '));
});
