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

/* ── RÓŻNORODNOŚĆ Z PROMPTU (31.10.2026, po siatce pejzaży) ──────────────────────────────────────────────────
   LEKCJA: oś „(n·k) % 4" z nieparzystym k to n % 4 w przebraniu. Pejzaż bez tagów ma porę roku n % 4, więc pogoda,
   pora dnia i kompozycja były STAŁE w obrębie pory (lato = zawsze „po deszczu", jesień = zawsze mgła), a test
   sprawdzający LISTĘ wartości był zielony. Dlatego te testy czytają WARTOŚCI Z PROMPTU — wyjście generatora
   (--pokaz-prompty), z tagami, nocami, wyjątkami i regułami — nie tablice w osie.mjs. */
const { execFileSync } = require('node:child_process');
const KORZEN = path.join(__dirname, '..');
function zPromptu(argi) {
  const out = execFileSync(process.execPath, ['tools/kadry/generuj-kadry.mjs', '--out', 'x', ...argi, '--pokaz-prompty'], { cwd: KORZEN, encoding: 'utf8' });
  const rek = []; let biezacy = null;
  for (const l of out.split(/\r?\n/)) {
    const h = l.match(/^--- \w+ (\d+) .*pora roku: (\w+)/);
    if (h) { biezacy = { n: +h[1], sezon: h[2] }; continue; }
    const o = l.match(/^\s+osie: kompozycja \d+ „([^"]+)" · .* · pora dnia „([^"]+)" · pogoda „([^"]+)"/);
    if (o && biezacy) { rek.push({ ...biezacy, komp: o[1], pora: o[2], pogoda: o[3] }); biezacy = null; }
  }
  return rek;
}
const OSI = ['pogoda', 'pora', 'komp'];
const SLONCE = /słońc|czyste/;
/** Zwraca listę naruszeń (a)–(e) dla rekordów { n, sezon, komp, pora, pogoda }. */
function naruszenia(rek, { coCztery = false, kategoria = (r) => r.pogoda } = {}) {
  const zle = [], poN = new Map(rek.map((r) => [r.n, r])), rozne = (lista, k) => new Set(lista.map((r) => r[k])).size;
  const okna = [];
  for (let i = 0; i + 6 <= rek.length; i++) okna.push(['(a) kolejne', rek.slice(i, i + 6)]);
  if (coCztery) for (const r of rek) { const c = [0, 4, 8, 12, 16, 20].map((d) => poN.get(r.n + d)); if (c.every(Boolean)) okna.push(['(b) co 4', c]); }
  for (const [rodzaj, okno] of okna) {
    for (const k of OSI) if (rozne(okno, k) < 3) zle.push(`${rodzaj} od ${okno[0].n}: ${k} ma ${rozne(okno, k)} wartości`);
    for (const [x, y] of [['pogoda', 'pora'], ['pogoda', 'komp'], ['pora', 'komp']]) {
      const wart = (r, k) => (k === 'pogoda' ? kategoria(r) : r[k]);
      const pary = new Set(okno.map((r) => wart(r, x) + '|' + wart(r, y))).size;
      if (pary < 3) zle.push(`(e) ${rodzaj} od ${okno[0].n}: para ${x}×${y} ma ${pary} kombinacji`);
    }
  }
  const pory = {};
  for (const r of rek) (pory[r.sezon] ||= []).push(r);
  for (const [s, lista] of Object.entries(pory)) {
    /* (e) w obrębie pory roku, na kategoriach: oś nie może być przesuniętą kopią innej (pora = pogoda + stała daje
       tyle par, ile wartości, i w oknach przechodziło „≥ 3 pary"). Liczone na całej porze, nie w oknie 6 — przy 5–6
       różnych wartościach w oknie przyporządkowanie wygląda na funkcję przypadkiem. */
    if (lista.length >= 12) for (const [x, y] of [['pogoda', 'pora'], ['pogoda', 'komp'], ['pora', 'komp']]) {
      const w = (r, k) => (k === 'pogoda' ? kategoria(r) : r[k]);
      const pary = new Set(lista.map((r) => w(r, x) + '|' + w(r, y))).size;
      const ix = new Set(lista.map((r) => w(r, x))).size, iy = new Set(lista.map((r) => w(r, y))).size;
      if (pary <= Math.max(ix, iy)) zle.push(`(e) ${s}: ${y} to przesunięta kopia ${x} (${pary} par przy ${ix}/${iy} wartościach)`);
    }
    for (const k of OSI) if (rozne(lista, k) < 3) zle.push(`(c) ${s}: ${k} ma ${rozne(lista, k)} wartości (${[...new Set(lista.map((r) => r[k]))].join(' / ')})`);
    if (s === 'wiosna' || s === 'lato') {
      const z = lista.filter((r) => !r.pogoda.startsWith('('));
      const jasne = z.filter((r) => SLONCE.test(r.pogoda)).length;
      if (z.length && jasne / z.length < 0.6) zle.push(`(d) ${s}: słońce/czyste niebo w ${jasne}/${z.length} pogód`);
    }
    if (s === 'lato') for (const r of lista) if (/mgł/.test(r.pogoda)) zle.push(`(d) lato ${r.n}: mgła z osi`);
  }
  return zle;
}

test('różnorodność z PROMPTU: pejzaż 1–120 — okna 6 kolejnych, ciągi co 4, pory roku, słońce wiosną i latem, pary osi', async () => {
  const { POGODA_PORY } = await wczytaj();
  const rek = zPromptu(['--pula', 'pejzaz', '--od', '1', '--do', '120']);
  assert.equal(rek.length, 120);
  /* (e) na KATEGORII pogody: tekst z promptu → pozycja na liście swojej pory („czyste niebo" wiosną i „czyste mroźne
     niebo" zimą to ta sama kategoria); noc / tag zostają osobnymi wartościami. */
  const kategoria = (r) => { const i = (POGODA_PORY[r.sezon] || []).indexOf(r.pogoda); return i >= 0 ? 'k' + i : r.pogoda; };
  const zle = naruszenia(rek, { coCztery: true, kategoria });
  assert.deepEqual(zle, [], zle.slice(0, 12).join('\n'));
  const pejzaz40 = naruszenia(rek.filter((r) => r.n <= 40));
  assert.deepEqual(pejzaz40.filter((z) => z.startsWith('(c)') || z.startsWith('(d)')), [], 'pejzaż 1–40 per pora roku');
});

test('różnorodność z PROMPTU: „Dziś" 66–89 per pora roku (tagi, noce i wyjątki sceny włącznie)', () => {
  const rek = zPromptu(['--od', '66', '--do', '89']);
  assert.equal(rek.length, 24);
  const zle = naruszenia(rek).filter((z) => z.startsWith('(c)') || z.startsWith('(d)'));
  assert.deepEqual(zle, [], zle.join('\n'));
});

test('MUTACJA: stary wzór (n·11)%4, (n·5)%4, (n·7)%4 musi oblać (a) albo (c) — inaczej test niczego nie odróżnia', () => {
  const POG = ['czyste niebo', 'zachmurzenie', 'mgła', 'po deszczu'], PORY = ['świt', 'rano', 'południe', 'zmierzch'], SEZ = ['wiosna', 'lato', 'jesien', 'zima'];
  const rek = [];
  for (let n = 1; n <= 40; n++) rek.push({ n, sezon: SEZ[n % 4], pogoda: POG[(n * 11) % 4], pora: PORY[(n * 5) % 4], komp: String((n * 7) % 4) });
  const zle = naruszenia(rek, { coCztery: true });
  assert.ok(zle.some((z) => z.startsWith('(a)') || z.startsWith('(c)')), 'stary wzór przeszedł test różnorodności');
});

test('MUTACJA 2: pora dnia jako przesunięta kopia pogody — (m + 2) % 4 — musi oblać (e) w obrębie pory roku', () => {
  const POG = ['czyste niebo', 'zachmurzenie', 'mgła', 'po deszczu'], PORY = ['świt', 'rano', 'południe', 'zmierzch'], SEZ = ['wiosna', 'lato', 'jesien', 'zima'];
  const rek = [];
  for (let n = 1; n <= 120; n++) { const m = n + Math.floor(n / 4); rek.push({ n, sezon: SEZ[n % 4], pogoda: POG[m % 4], pora: PORY[(m + 2) % 4], komp: String((2 * m + Math.floor(m / 4)) % 4) }); }
  assert.ok(naruszenia(rek, { coCztery: true }).some((z) => z.startsWith('(e)') && z.includes('przesunięta kopia')), 'kopia pogody przeszła (e)');
});

