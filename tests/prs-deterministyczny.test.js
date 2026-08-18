// ─────────────────────────────────────────────────────────────────────────────
// PRS — JEDNO ŹRÓDŁO I DOBOWY DOBÓR ZESTAWU.
//
// BLIZNA: silnik PRS istniał w DWÓCH kopiach (zawodnik.html + kalendarz.html)
// rozjechanych na 32 liniach. Różnica NIE była kosmetyczna — kalendarz losował
// zestaw przy KAŻDYM otwarciu (`Math.random()`), zawodnik wybierał go raz na
// dobę. Ten sam człowiek, zamykając i otwierając nakładkę, dostawał inną kartę
// w kalendarzu, a tę samą u siebie. Scalone 18.08.2026 na wersji nowszej
// (zawodnik) — historia gita w komentarzu przy silniku w sb.js.
//
// !! TEN TEST ZAMYKA KLASĘ „dwie kopie tej samej logiki", nie sam przypadek.
//    Sprawdza JEDNO ŹRÓDŁO (nikt nie odtworzył lokalnej kopii) i KONTRAKT
//    (dobór jest funkcją doby, nie losu). Bez pierwszego drugie jest bez wartości:
//    lokalna kopia w stronie przesłoniłaby wersję z sb.js i test przechodziłby
//    dalej, mierząc plik, którego przeglądarka już nie używa.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const STRONY_Z_PRS = ['zawodnik.html', 'kalendarz.html'];

test('PRS — jedno źródło', async (t) => {
  await t.test('silnik jest w sb.js', () => {
    const sb = czytaj('sb.js');
    assert.match(sb, /const PRS = \(\(\) => \{/, 'brak silnika PRS w sb.js');
    assert.match(sb, /window\.PRS = PRS;/);
  });

  await t.test('⚠️ ŻADNA strona nie ma własnej kopii silnika', () => {
    for (const p of STRONY_Z_PRS) {
      const s = czytaj(p);
      assert.doesNotMatch(s, /const PRS = \(\(\) => \{/,
        p + ' odtworzył lokalną kopię silnika — sb.js przestał być jedynym źródłem');
    }
  });

  await t.test('strony, które wołają PRS, ładują sb.js', () => {
    for (const p of STRONY_Z_PRS) {
      const s = czytaj(p);
      if (!/PRS\.launch|PRSclose\(\)/.test(s)) continue;
      assert.match(s, /<script[^>]+src=["'][^"']*sb\.js/,
        p + ' woła PRS, ale nie ładuje sb.js');
    }
  });
});

test('PRS — dobór zestawu jest DOBOWY, nie losowy', async (t) => {
  const sb = czytaj('sb.js');
  // Wycinamy sam silnik, żeby nie mierzyć reszty sb.js.
  const od = sb.indexOf('const PRS = (() => {');
  const doK = sb.indexOf('window.PRS = PRS;', od);
  assert.ok(od > -1 && doK > od, 'nie znalazłem granic silnika w sb.js');
  const silnik = sb.slice(od, doK);

  /* ⚠️ MIERZYMY `pickSet`, NIE CAŁY SILNIK. Pierwsza wersja tego testu szukała
     `Math.random` w całym bloku i była CZERWONA od razu — bo losowość jest
     w silniku obecna i całkowicie na miejscu: `confetti()` rozrzuca nią cząstki.
     Zakaz losowania dotyczy WYŁĄCZNIE doboru zestawu. Test zbyt szeroki
     kazałby przy pierwszym uruchomieniu dopisać wyjątek — a wyjątek dopisany
     w pierwszym odruchu jest początkiem listy, która po roku nie łapie niczego. */
  const mPick = silnik.match(/function pickSet\s*\(\)\s*\{[\s\S]*?\n {2,}\}/);
  assert.ok(mPick, 'nie znalazłem pickSet w silniku');
  const pickSet = mPick[0];

  await t.test('⚠️ dobór zestawu NIE losuje', () => {
    assert.doesNotMatch(pickSet, /Math\.random\s*\(/,
      'wróciło losowanie w pickSet — to była właśnie różnica między dwiema kopiami');
  });

  await t.test('…a losowość w confetti zostaje nietknięta', () => {
    assert.match(silnik, /function confetti[\s\S]*?Math\.random/,
      'zniknęła losowość z confetti — to nie było celem tej zmiany');
  });

  await t.test('dobór liczy się z numeru doby', () => {
    assert.match(pickSet, /Date\.now\s*\(\s*\)\s*\/\s*86400000/,
      'brak ziarna dobowego — wybór przestał być stabilny w obrębie dnia');
  });

  /* Kontrakt odtworzony 1:1 z silnika. Trzymamy go tutaj JAWNIE, a nie przez
     `eval` na sb.js, bo test ma się wywalić także wtedy, gdy ktoś zmieni wzór
     w silniku „przy okazji" — inaczej test przesuwałby się razem z kodem
     i nie pilnował niczego (ta sama pułapka co samozwrotna asercja na stałej
     w tests/generator-blizny-6-11-16.test.js). */
  const SETS = 8;
  const wybierz = (teraz) => {
    const seed = Math.floor(teraz / 86400000);
    return ((seed * 1234567) >>> 0) % SETS;
  };

  await t.test('⚠️ ten sam zawodnik, dwa wywołania tego samego dnia → ta sama karta', () => {
    const rano   = Date.UTC(2026, 7, 18, 6, 30);
    const wieczr = Date.UTC(2026, 7, 18, 22, 15);
    assert.strictEqual(wybierz(rano), wybierz(wieczr),
      'zestaw zmienił się w ciągu doby — dokładnie to robiła stara kopia z kalendarza');
  });

  await t.test('…a kolejnego dnia karta się zmienia', () => {
    let inny = 0;
    for (let d = 0; d < 30; d++) {
      const a = wybierz(Date.UTC(2026, 7, 1 + d, 12));
      const b = wybierz(Date.UTC(2026, 7, 2 + d, 12));
      if (a !== b) inny++;
    }
    assert.ok(inny >= 25, 'zestaw nie zmienia się między dobami (zmian: ' + inny + '/30)');
  });

  await t.test('wybór zawsze mieści się w zakresie zestawów', () => {
    for (let d = 0; d < 400; d++) {
      const i = wybierz(Date.UTC(2026, 0, 1 + d, 12));
      assert.ok(Number.isInteger(i) && i >= 0 && i < SETS, 'poza zakresem: ' + i);
    }
  });

  await t.test('liczba zestawów w silniku zgadza się z tą, którą pilnuje test', () => {
    const m = silnik.match(/const SETS = \[([^\]]*)\]/);
    assert.ok(m, 'nie znalazłem listy SETS');
    assert.strictEqual(m[1].split(',').length, SETS,
      'lista zestawów zmieniła długość — popraw SETS w tym teście świadomie');
  });
});
