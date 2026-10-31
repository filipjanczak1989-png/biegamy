/* BLIZNA 57 (31.10.2026, Grafiki v4 / G1): kadry „za podobne do siebie".

   Kadry v3 przeszły ocenę jakości, ale Filip po siatce: „bardzo podobne". Przyczyna była w szkielecie promptu:
   jeden podmiot (biegacz od tyłu), jedna ogniskowa (35 mm), pora dnia tylko z n % 3, pogoda tylko z tagów.
   Od v4 każdy numer dostaje deterministycznie pięć osi (tools/kadry/osie.mjs, jedno źródło dla generatora).

   Test pilnuje RELACJI, nie listy słów: sąsiednie numery nie mogą mieć tej samej czwórki osi, każdy podmiot
   musi wystąpić w każdej porze roku, a reguły nadrzędne (noc tylko z n % 12, detal bez dłoni, dwójka nie grupa,
   pejzaż bez biegacza z bliska, zima + po deszczu = mokry śnieg) muszą zachodzić na całym zakresie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');

const wczytaj = () => import(pathToFileURL(path.join(__dirname, '..', 'tools', 'kadry', 'osie.mjs')).href);
const sezonKadru = (() => { const ctx = zaladujSb(); return (ctx.window || ctx).SOLO.sezonKadru; })();

test('sąsiednie numery 1..200 nie mają identycznej czwórki (podmiot, pora dnia, pogoda, ogniskowa)', async () => {
  const { indeksy } = await wczytaj();
  const czworka = (n) => { const i = indeksy(n); return [i.podmiot, i.poraDnia, i.pogoda, i.ogniskowa].join(); };
  for (let n = 1; n < 200; n++) assert.notEqual(czworka(n), czworka(n + 1), `${n} i ${n + 1}`);
});

test('każdy podmiot występuje ≥ 2 razy w każdej porze roku (1..89, pora z SOLO.sezonKadru)', async () => {
  const { indeksy, PODMIOTY } = await wczytaj();
  const licz = {};
  for (let n = 1; n <= 89; n++) { const s = sezonKadru(n); (licz[s] ||= Array(PODMIOTY.length).fill(0))[indeksy(n).podmiot]++; }
  for (const [s, t] of Object.entries(licz)) t.forEach((c, p) => assert.ok(c >= 2, `${s}: podmiot „${PODMIOTY[p]}" tylko ${c}×`));
});

test('noc WYŁĄCZNIE z n % 12 = 0 — oś pory dnia nigdy nie daje nocy', async () => {
  const { osie } = await wczytaj();
  for (let n = 1; n <= 200; n++) {
    const o = osie(n, { sezon: 'lato' });
    assert.equal(/noc/.test(o.poraDnia), n % 12 === 0, `kadr ${n}: „${o.poraDnia}"`);
  }
});

test('detal bez człowieka: żadnej twarzy ani dłoni; dwójka = obok siebie, nie grupa', async () => {
  const { osie, zdaniaOsi } = await wczytaj();
  let detale = 0, dwojki = 0;
  for (let n = 1; n <= 200; n++) {
    const o = osie(n, { sezon: 'jesien' }), z = zdaniaOsi(o, null);
    if (o.podmiotNr === 2) { detale++; assert.match(z.kadr, /bez człowieka/); assert.match(z.kadr, /żadnej twarzy, żadnych dłoni/); }
    if (o.podmiotNr === 1) { dwojki++; assert.match(z.kadr, /obok siebie/); assert.match(z.kadr, /nie grupa/); }
  }
  assert.ok(detale >= 30 && dwojki >= 30, `za mało przypadków: detal ${detale}, dwójka ${dwojki}`);
});

test('pejzaż 21:9 nie ma biegacza z bliska (podmiot 0/1 → 3/4)', async () => {
  const { osie } = await wczytaj();
  for (let n = 1; n <= 200; n++) assert.ok([2, 3, 4].includes(osie(n, { pula: 'pejzaz', sezon: 'wiosna' }).podmiotNr), `pejzaż ${n}`);
});

test('reguły nadrzędne: tag p: i siłownia znoszą oś pogody; zima + po deszczu = mokry śnieg; wyjątek sceny ustala porę dnia', async () => {
  const { osie, indeksy } = await wczytaj();
  for (let n = 1; n <= 200; n++) {
    assert.equal(osie(n, { sezon: 'lato', tagP: 'deszcz' }).pogoda, null, `kadr ${n} z tagiem p:`);
    assert.equal(osie(n, { sezon: 'lato', tagT: 'silownia' }).pogoda, null, `kadr ${n} siłownia`);
    if (indeksy(n).pogoda === 3) assert.match(osie(n, { sezon: 'zima' }).pogoda, /mokry śnieg/, `kadr ${n} zima`);
  }
  assert.equal(osie(22, { sezon: 'jesien', wyjatek: { poraDnia: 'świt' } }).poraDnia, 'świt');
  assert.match(osie(24, { sezon: 'lato', wyjatek: { poraDnia: 'świt' } }).poraDnia, /noc/, 'noc wygrywa z wyjątkiem');
});

test('detal nie dostaje 24 mm (zbliżenie ≠ szeroki plan) — 24 mm przy detalu → 85 mm', async () => {
  const { osie } = await wczytaj();
  let detale = 0;
  for (let n = 1; n <= 200; n++) {
    const o = osie(n, { sezon: 'lato' });
    if (o.podmiotNr === 2) { detale++; assert.notEqual(o.ogniskowaNr, 0, `kadr ${n}: detal z 24 mm`); }
  }
  assert.ok(detale >= 30);
});

test('mgła tylko o świcie/rano: mgła (oś albo tag p:mgla) + południe/zmierzch → świt; noc zostaje nocą', async () => {
  const { osie, indeksy } = await wczytaj();
  let przestawione = 0;
  for (let n = 1; n <= 200; n++) {
    const i = indeksy(n);
    for (const opts of [{ sezon: 'jesien' }, { sezon: 'jesien', tagP: 'mgla' }]) {
      const mgla = opts.tagP === 'mgla' || i.pogoda === 2;
      if (!mgla) continue;
      const o = osie(n, opts);
      if (n % 12 === 0) assert.match(o.poraDnia, /noc/, `kadr ${n}: noc`);
      else { assert.ok(['świt', 'rano'].includes(o.poraDnia), `kadr ${n} (${JSON.stringify(opts)}): mgła o „${o.poraDnia}"`); if ([2, 3].includes(i.poraDnia)) przestawione++; }
    }
  }
  assert.ok(przestawione > 0, 'reguła nie miała czego przestawić — test niczego nie sprawdził');
});

test('detal wg pory roku: każdy przedmiot swojej pory występuje w 1..200; rękawiczki nigdy latem, bidon nigdy zimą; bez numeru startowego', async () => {
  const { osie, DETALE_PORY, DETALE } = await wczytaj();
  for (const [s, lista] of Object.entries(DETALE_PORY)) {
    const widziane = new Set();
    for (let n = 1; n <= 200; n++) {
      const o = osie(n, { sezon: s });
      if (!o.detal) continue;
      widziane.add(o.detal);
      assert.ok(lista.includes(o.detal), `kadr ${n} (${s}): „${o.detal}" spoza listy pory`);
      if (s === 'lato') assert.doesNotMatch(o.detal, /rękawicz/, `kadr ${n}: rękawiczki latem`);
      if (s === 'zima') assert.doesNotMatch(o.detal, /bidon/, `kadr ${n}: bidon zimą`);
    }
    assert.deepEqual([...widziane].sort(), [...lista].sort(), `${s}: tylko ${[...widziane].join(', ')}`);
  }
  // ta sama relacja na porze, którą naprawdę dostaje generator (SOLO.sezonKadru, z jawnym s: od 66)
  for (let n = 1; n <= 200; n++) {
    const s = sezonKadru(n), o = osie(n, { sezon: s });
    if (!o.detal) continue;
    assert.ok(!(s === 'lato' && /rękawicz/.test(o.detal)) && !(s === 'zima' && /bidon/.test(o.detal)), `kadr ${n} (${s}): „${o.detal}"`);
  }
  assert.ok(!DETALE.some((d) => /numer startowy/.test(d)), 'numer startowy wypadł z detali na stałe');
  assert.equal(osie(69, { sezon: 'zima' }).detal, 'czołówka');
  assert.equal(osie(74, { sezon: 'lato' }).detal, 'bidon');
  assert.throws(() => osie(69, {}), /nieznana pora roku/, 'detal bez pory roku = błąd, nie domysł');
});

test('upał (p:upal) zawsze w południe, poza nocą', async () => {
  const { osie } = await wczytaj();
  for (let n = 1; n <= 200; n++) {
    const o = osie(n, { sezon: 'lato', tagP: 'upal' });
    if (n % 12 === 0) assert.match(o.poraDnia, /noc/); else assert.equal(o.poraDnia, 'południe', `kadr ${n}`);
  }
});


test('noc w pejzażu: tylko sceny miejskie, bez człowieka i bez czołówki; „Dziś" zostaje z czołówką', async () => {
  const { osie, zdaniaOsi, NOCNE_PEJZAZ } = await wczytaj();
  const miejskie = NOCNE_PEJZAZ.map((s) => s.opis);
  for (let n = 12; n <= 200; n += 12) {
    const o = osie(n, { pula: 'pejzaz', sezon: 'jesien', nawierzchnia: 'szlak' }), z = zdaniaOsi(o, null);
    assert.ok(miejskie.includes(o.scenaNocna), `pejzaż ${n}: scena „${o.scenaNocna}"`);
    assert.equal(o.podmiotNr, 3, `pejzaż ${n}: noc z człowiekiem`);
    assert.doesNotMatch(o.poraDnia, /czołówk/, `pejzaż ${n}`);
    assert.match(o.poraDnia, /latarnie, mokra nawierzchnia odbija światło/);
    assert.match(z.kadr, /Żadnych ludzi/);
    assert.match(osie(n, { pula: 'dzis', sezon: 'jesien' }).poraDnia, /czołówka/, `dzis ${n}`);
  }
});

test('kompozycja mówi nawierzchnią sceny, nie „drogą" na sztywno; bieżnia = łuk toru i pusta trybuna', async () => {
  const { osie, zdaniaOsi } = await wczytaj();
  for (let n = 1; n <= 200; n++) {
    if (n % 12 === 0) continue;
    const tor = zdaniaOsi(osie(n, { pula: 'pejzaz', sezon: 'lato', nawierzchnia: 'tor' }), null);
    const t = tor.kadr + ' ' + tor.kompozycja;
    assert.doesNotMatch(t, /drog/, `pejzaż ${n} (tor): ${t}`);
    const o = osie(n, { pula: 'pejzaz', sezon: 'lato', nawierzchnia: 'tor' });
    if ([0, 1, 2].includes(o.indeksy.kompozycja) && o.podmiotNr !== 2) assert.match(t, /łuk toru, pusta trybuna w tle/, `pejzaż ${n}`);   // detal nie ma kompozycji trasy
    const al = zdaniaOsi(osie(n, { pula: 'dzis', sezon: 'lato', nawierzchnia: 'alejka' }), null);
    assert.doesNotMatch(al.kadr + al.kompozycja, /drog/, `dzis ${n} (alejka)`);
  }
});

test('strefa tekstu: pejzaż (.bm-hero) = lewa dolna ćwiartka; „Dziś" (9:16) = dolna część', async () => {
  const { osie, zdaniaOsi } = await wczytaj();
  for (let n = 1; n <= 60; n++) {
    assert.match(zdaniaOsi(osie(n, { pula: 'pejzaz', sezon: 'lato' }), null).kompozycja, /lewa dolna ćwiartka bez ważnych szczegółów/);
    assert.match(zdaniaOsi(osie(n, { pula: 'dzis', sezon: 'lato' }), null).kompozycja, /dolna część spokojna/);
  }
});
