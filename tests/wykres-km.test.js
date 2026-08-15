// ─────────────────────────────────────────────────────────────────────────────
// WYKRES KILOMETRÓW — _renderKmLongterm, oś X i przerzedzanie etykiet.
//
// BLIZNA (feedback Maćka, 14.08.2026): podpisy pod słupkami zlewały się
// w jeden ciąg — „27.0703.0810.08". Etykieta DD.MM ma 24 px w DM Mono 8 px,
// a kolumna przy 12 kubełkach 19,5 px na ekranie 360 px i 16,2 px na 320 px.
// `white-space:nowrap` nie pozwala jej się zawinąć, więc nachodziły na siebie.
//
// !! TRZY DECYZJE, KTÓRE ŁATWO „UPROŚCIĆ" I ZEPSUĆ — każda ma tu swój test:
//    1. KOTWICA OD KOŃCA, nie `i % 2`. Przy parzystej liczbie kubełków naiwne
//       modulo zostawia bez podpisu OSTATNI słupek, czyli bieżący tydzień —
//       jedyny, który człowiek naprawdę czyta.
//    2. PRÓG 8. Poniżej dziewięciu kubełków etykieta się mieści, więc
//       przerzedzanie tylko odbierałoby informację (przy 2 kubełkach został
//       by JEDEN podpis).
//    3. `&nbsp;` ZAMIAST PUSTKI. Div bez treści nie tworzy line boxa i ma
//       wysokość 0, więc kolumna bez podpisu byłaby niższa, a przy
//       align-items:flex-end jej słupek zjechałby w dół.
//
// !! MIESIĄCE SIĘ NIE PRZERZEDZAJĄ — i to też jest decyzja, nie przeoczenie.
//    Tam nie mieściły się WYŁĄCZNIE dwie etykiety z sufiksem roku (" '26" =
//    7 znaków = 33,6 px). Zamiast przerzedzać całą oś, sufiks zdjęto i rok
//    poszedł do podpisu sumy: informacja zostaje, oś zostaje kompletna.
'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { zaladujStrone, stabilnyDom } = require('./_srodowisko.js');

const ctx = zaladujStrone('zawodnik.html');
const dom = stabilnyDom(ctx);
const DATA_ORYG = ctx.Date;

/** Zamraża zegar kontekstu. Wykres liczy okna względem „teraz", więc bez tego
 *  test mówiłby co miesiąc co innego — a najciekawszy przypadek (oba końce
 *  w tym samym roku) zdarza się wyłącznie w grudniu. */
function zamrozZegar(iso) {
  const T = new DATA_ORYG(iso).getTime();
  class Zamrozony extends DATA_ORYG {
    constructor(...a) { super(...(a.length ? a : [T])); }
    static now() { return T; }
  }
  ctx.Date = Zamrozony;
}
afterEach(() => { ctx.Date = DATA_ORYG; });

function atrapaSb(logi) {
  const b = { then: (r, j) => Promise.resolve({ data: logi, error: null }).then(r, j) };
  for (const m of ['select', 'eq', 'gte', 'not', 'order', 'limit']) b[m] = () => b;
  return { from: () => b };
}

/** Rozkłada innerHTML na kolumny. Render nie ma innego wyjścia niż HTML. */
function kolumny(html) {
  return html.split('<div style="flex:1;').slice(1).map((kawalek) => {
    const teksty = [...kawalek.matchAll(/>([^<]*)<\/div>/g)].map((m) => m[1]);
    const h = /height:(\d+)px/.exec(kawalek);
    return { km: teksty[0], lbl: teksty[2], h: h ? +h[1] : null };
  });
}

async function renderuj(tryb, logi, kiedy) {
  zamrozZegar(kiedy);
  ctx.sb = atrapaSb(logi);
  const box = dom.daj('forma-km-longterm');
  const suma = dom.daj('forma-km-longterm-sum');
  const karta = dom.daj('forma-km-longterm-card');
  box.innerHTML = ''; suma.textContent = ''; karta.style.display = 'NIETKNIETE';
  await vm.runInContext(`(async () => {
    _athleteId = 'ATLETA-TEST';
    _kmLtLogs = null; _kmLtFor = null;             // bez tego drugi test czyta cache pierwszego
    await window._renderKmLongterm(${JSON.stringify(tryb)});
  })()`, ctx);
  return { kol: kolumny(box.innerHTML), suma: suma.textContent, karta, html: box.innerHTML };
}

const log = (iso, km, typ) => ({ logged_at: iso, distance_km: km, training_type: typ || 'Spokojny' });

// Sobota. Poniedziałek bieżącego tygodnia = 10.08.2026, okno 12 tygodni sięga 25.05.
const SOBOTA = '2026-08-15T12:00:00.000Z';
const GRUDZIEN = '2026-12-15T12:00:00.000Z';

describe('przerzedzanie osi — blizna „27.0703.0810.08"', () => {
  test('12 tygodni: podpisana co DRUGA kolumna, reszta ma &nbsp;', async () => {
    const { kol } = await renderuj('week', [log(SOBOTA, 10)], SOBOTA);
    assert.equal(kol.length, 12);
    const zPodpisem = kol.filter((k) => k.lbl !== '&nbsp;');
    assert.equal(zPodpisem.length, 6, 'co druga z dwunastu');
    for (const k of zPodpisem) assert.match(k.lbl, /^\d{2}\.\d{2}$/, 'format DD.MM');
  });

  test('KOTWICA OD KOŃCA — bieżący tydzień MA podpis', async () => {
    const { kol } = await renderuj('week', [log(SOBOTA, 10)], SOBOTA);
    assert.notEqual(kol[11].lbl, '&nbsp;', 'ostatni słupek to bieżący tydzień — musi być opisany');
    assert.equal(kol[11].lbl, '10.08', 'poniedziałek bieżącego tygodnia');
  });

  test('naiwne `i % 2` zgubiłoby właśnie ten słupek — dowód, nie przekonanie', () => {
    const n = 12;
    const naiwne = [...Array(n).keys()].filter((i) => i % 2 === 0);
    const kotwica = [...Array(n).keys()].filter((i) => (n - 1 - i) % 2 === 0);
    assert.equal(naiwne.includes(n - 1), false, 'i % 2 pomija ostatni przy parzystej liczbie');
    assert.equal(kotwica.includes(n - 1), true, 'kotwica od końca zawsze łapie ostatni');
    assert.equal(naiwne.length, kotwica.length, 'obie dają tyle samo podpisów — różnica jest w TYM, KTÓRE');
  });

  /* PRÓG 8 NIE MA TU TESTU I TO JEST DECYZJA, NIE PRZEOCZENIE.
     Warunek brzmi `tryb === 'week' && buckets.length > 8`. Człon `tryb === 'week'`
     jest sprawdzony — robi to zestaw „Miesiące i Lata" niżej. Członu `> 8` NIE DA
     SIĘ wywołać z zewnątrz: tryb week zawsze buduje dokładnie 12 kubełków, stała
     jest zaszyta w pętli. Jedyny test, jaki mógłbym tu napisać, to przepisanie
     wyrażenia do pliku testowego i sprawdzenie własnej kopii — a to nie mówi nic
     o kodzie produkcyjnym i przechodziłoby także wtedy, gdyby ktoś usunął próg
     z zawodnik.html. Zielony test, który nie dotyka badanego kodu, jest gorszy
     niż jego brak: następna osoba przeczyta go jako dowód pokrycia.
     Próg zostaje w kodzie jako zabezpieczenie na wypadek zmiany stałej 12
     i wtedy — razem z tą zmianą — trzeba mu dopisać test. */

  test('KAŻDA kolumna ma niepusty div podpisu — inaczej słupek zjeżdża w dół', async () => {
    const { kol, html } = await renderuj('week', [log(SOBOTA, 10)], SOBOTA);
    for (const [i, k] of kol.entries()) {
      assert.notEqual(k.lbl, '', `kolumna ${i} ma pusty podpis — line box znika, wysokość 0`);
    }
    assert.equal(html.includes('&nbsp;'), true, 'placeholder to twarda spacja, nie pustka');
  });
});

describe('Miesiące i Lata — oś zostaje KOMPLETNA', () => {
  test('12 miesięcy: wszystkie dwanaście podpisów, zero przerzedzania', async () => {
    const { kol } = await renderuj('month', [log(SOBOTA, 10)], SOBOTA);
    assert.equal(kol.length, 12);
    assert.equal(kol.filter((k) => k.lbl === '&nbsp;').length, 0, 'żadna etykieta nie znika');
    for (const k of kol) assert.match(k.lbl, /^(sty|lut|mar|kwi|maj|cze|lip|sie|wrz|paź|lis|gru)$/);
  });

  test('rok zdjęty z osi trafia do podpisu sumy, a nie ginie', async () => {
    const { suma } = await renderuj('month', [log(SOBOTA, 10)], SOBOTA);
    assert.match(suma, /^Suma 12 miesięcy \(wrz '25 – sie '26\): /, suma);
  });

  test('oba końce w tym samym roku: rok pada RAZ', async () => {
    // Zdarza się wyłącznie w grudniu — bez zamrożonego zegara nie do sprawdzenia.
    const { suma } = await renderuj('month', [log(GRUDZIEN, 10)], GRUDZIEN);
    assert.match(suma, /\(sty – gru '26\)/, suma);
    assert.doesNotMatch(suma, /sty '26/, 'nie „sty \'26 – gru \'26"');
  });

  test('Lata: etykieta to pełny rok, bez przerzedzania', async () => {
    const { kol } = await renderuj('year', [log('2024-03-01T10:00:00Z', 10), log(SOBOTA, 20)], SOBOTA);
    assert.equal(kol.filter((k) => k.lbl === '&nbsp;').length, 0);
    for (const k of kol) assert.match(k.lbl, /^\d{4}$/);
  });
});

describe('kilometry w kubełkach', () => {
  test('trening nie-biegowy NIE dolicza się do sumy', async () => {
    // window.isRunType, ten sam SSOT co reguły odznak i sumy tygodniowe.
    const zBiegiem = await renderuj('week', [log(SOBOTA, 10, 'Spokojny')], SOBOTA);
    const zRowerem = await renderuj('week', [log(SOBOTA, 10, 'Zastępczy')], SOBOTA);
    assert.match(zBiegiem.suma, /: 10 km$/);
    assert.match(zRowerem.suma, /: 0 km$/, 'zastępczy liczy się jako trening, ale nie jako kilometry');
  });

  test('kolumna bez kilometrów ma pusty licznik, ale zachowuje słupek', async () => {
    const { kol } = await renderuj('week', [log(SOBOTA, 10)], SOBOTA);
    const puste = kol.filter((k) => k.km === '');
    assert.ok(puste.length > 0, 'w 12 tygodniach z jednym biegiem większość jest pusta');
    for (const k of puste) assert.equal(k.h, 3, 'minimalna wysokość 3 px — słupek zostaje widoczny');
  });

  test('najwyższy słupek dostaje 110 px i wyróżnienie', async () => {
    const { kol, html } = await renderuj('week', [log(SOBOTA, 42)], SOBOTA);
    assert.equal(Math.max(...kol.map((k) => k.h)), 110);
    assert.equal(html.includes('linear-gradient(180deg,#e8561e,#fb923c)'), true);
  });

  test('brak logów chowa całą kartę', async () => {
    const { karta, html } = await renderuj('week', [], SOBOTA);
    assert.equal(karta.style.display, 'none');
    assert.equal(html, '');
  });
});
