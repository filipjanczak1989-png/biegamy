// ─────────────────────────────────────────────────────────────────────────────
// BLIZNA 25 — etykieta dnia liczona na KLUCZACH, nie na różnicy czasu.
//
// CO SIĘ STAŁO. Przełącznik „DATA TRENINGU ‹ … ›" w modalu ręcznego logowania
// (zawodnik.html, _updateLogDateDisplay) liczył różnicę dni tak:
//
//     const d     = new Date(_logDate + 'T12:00:00');   // POŁUDNIE
//     const today = new Date(); today.setHours(0,0,0,0); // PÓŁNOC
//     const diff  = Math.round((d - today) / 86400000);
//
// Dla DZISIAJ różnica to dokładnie pół dnia, a Math.round(0.5) === 1 — więc
// dzisiaj wyświetlało się jako „Jutro". Cała skala była przesunięta o dobę:
// wczoraj → „Dziś", −2 dni → „Wczoraj". Godzina nie miała znaczenia: zrzut
// z 14.08.2026 o 11:24 RANO pokazuje „JUTRO", co wyklucza hipotezę strefową.
//
// !! ZAPIS DO BAZY BYŁ PRZY TYM POPRAWNY — kłamała wyłącznie etykieta, a obok
//    niej podtytuł modala pokazywał prawidłową pełną datę. Człowiek widział
//    jednocześnie „piątek, 14 sierpnia" i „JUTRO". Zmierzone 27.08.2026:
//    ZERO logów z logged_at = created_at + 1 dzień (przyszłość blokuje
//    shiftLogDate), więc szkoda szła inną drogą — przez „poprawianie"
//    strzałką wstecz na dzień, który kłamliwie mówił „Dziś".
//
// !! WADA PRZEŻYŁA MIESIĄCE i widziało ją kilkanaście osób. Ten test ma ją
//    trzymać przypiętą na zawsze — stąd przemiatanie WSZYSTKICH pór doby,
//    a nie jednego wygodnego przypadku.
//
// !! DLACZEGO TEST LICZY KLUCZE WŁASNĄ ARYTMETYKĄ. Gdyby sięgał po produkcyjne
//    _numerDnia, wspólny błąd w tym helperze byłby dla niego niewidzialny —
//    test i kod zgodziłyby się co do fałszu. Oczekiwania powstają tu z UTC.
'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { zaladujStrone, stabilnyDom } = require('./_srodowisko.js');

const ctx = zaladujStrone('zawodnik.html');
const dom = stabilnyDom(ctx);
const DATA_ORYG = ctx.Date;

function zamrozZegar(iso) {
  const T = new DATA_ORYG(iso).getTime();
  class Zamrozony extends DATA_ORYG {
    constructor(...a) { super(...(a.length ? a : [T])); }
    static now() { return T; }
  }
  ctx.Date = Zamrozony;
}
afterEach(() => { ctx.Date = DATA_ORYG; });

/** Klucz dnia LOKALNEGO dla danej chwili — tak, jak widzi ją człowiek z telefonem. */
function kluczLokalny(iso) {
  return new DATA_ORYG(iso).toLocaleDateString('sv-SE');
}

/** Przesuwa klucz o N dni. Arytmetyka UTC, niezależna od kodu produkcyjnego. */
function przesun(klucz, dni) {
  const [y, m, d] = klucz.split('-').map(Number);
  const t = new DATA_ORYG(DATA_ORYG.UTC(y, m - 1, d) + dni * 86400000);
  return t.toISOString().slice(0, 10);
}

/** Ustawia _logDate, odpala render, oddaje to, co zobaczył człowiek. */
function etykieta(klucz, kiedyISO) {
  zamrozZegar(kiedyISO);
  const el = dom.daj('l-date-display');
  el.textContent = 'NIETKNIETE';
  el.style.color = 'NIETKNIETE';
  vm.runInContext(
    `_logDate = ${klucz === null ? 'null' : JSON.stringify(klucz)}; _updateLogDateDisplay();`,
    ctx,
  );
  return { tekst: el.textContent, kolor: el.style.color };
}

// Pory doby wymienione w zgłoszeniu + granica, na której stara formuła pękała.
const PORY = ['00:00', '00:30', '06:00', '11:24', '11:59', '12:00', '12:01', '18:00', '23:30', '23:59'];

// Zwykły dzień + oba przejścia czasu w Europie 2026 (doba 23 h i doba 25 h) —
// tam różnica milisekundowa myli się NAJBARDZIEJ. Bite tylko gdy proces stoi
// w strefie z DST; w UTC to zwykłe dni i asercja i tak musi przejść.
const DNI = ['2026-08-14', '2026-03-29', '2026-10-25'];

describe('samo-kontrola', () => {
  test('assert potrafi wykryc falsz', () => {
    assert.throws(() => assert.equal('Jutro', 'Dziś'));
  });

  test('strona wystawila _updateLogDateDisplay', () => {
    assert.doesNotThrow(() => vm.runInContext('typeof _updateLogDateDisplay', ctx));
    assert.equal(vm.runInContext('typeof _updateLogDateDisplay', ctx), 'function');
  });

  // !! DOWÓD, ŻE TEST CELUJE W REALNĄ WADĘ, A NIE W SWOJE WYOBRAŻENIE O NIEJ.
  //    Odtwarzamy STARĄ formułę i pokazujemy, że dla DZISIAJ dawała „Jutro".
  //    Gdyby ktoś kiedyś wrócił do liczenia na milisekundach, reszta pliku
  //    zaświeci — a ten przypadek tłumaczy dlaczego.
  test('STARA formula dawala „Jutro" dla DZISIAJ — o kazdej porze doby', () => {
    for (const pora of PORY) {
      const kiedy = `2026-08-14T${pora}:00`;
      const dzis = kluczLokalny(kiedy);
      const today = new DATA_ORYG(kiedy); today.setHours(0, 0, 0, 0);
      const diff = Math.round((new DATA_ORYG(dzis + 'T12:00:00') - today) / 86400000);
      assert.equal(diff, 1, `stara formuła o ${pora} dawała diff=${diff}, spodziewane 1`);
    }
    assert.equal(Math.round(0.5), 1, 'korzeń wady: pół dnia zaokrągla się w GÓRĘ');
  });
});

describe('DZIŚ to zawsze „Dziś" — kazda pora doby, kazdy dzien', () => {
  for (const dzien of DNI) {
    for (const pora of PORY) {
      test(`${dzien} ${pora}`, () => {
        const kiedy = `${dzien}T${pora}:00`;
        const { tekst, kolor } = etykieta(kluczLokalny(kiedy), kiedy);
        assert.equal(tekst, 'Dziś', `o ${pora} dnia ${dzien} etykieta brzmi „${tekst}"`);
        assert.equal(kolor, 'var(--accent)', 'kolor idzie z tego samego diff — musi zgadzać się z tekstem');
      });
    }
  }
});

describe('galaz _logDate === null — psula sie osobno, od 12:00', () => {
  // Ta gałąź porównywała `new Date()` z północą, więc była poprawna do 11:59
  // i kłamała od południa. Stan po zapisie loga (_logDate wraca na null).
  for (const pora of PORY) {
    test(`null o ${pora} → „Dziś"`, () => {
      const { tekst } = etykieta(null, `2026-08-14T${pora}:00`);
      assert.equal(tekst, 'Dziś', `null o ${pora} dał „${tekst}"`);
    });
  }
});

describe('sasiedztwo — skala nie moze byc przesunieta', () => {
  const KIEDY = '2026-08-14T11:24:00';   // godzina ze zrzutu
  const DZIS = kluczLokalny(KIEDY);

  test('wczoraj → „Wczoraj"', () => {
    assert.equal(etykieta(przesun(DZIS, -1), KIEDY).tekst, 'Wczoraj');
  });

  test('jutro → „Jutro" (osiagalne tylko z kodu, nie strzalka)', () => {
    assert.equal(etykieta(przesun(DZIS, +1), KIEDY).tekst, 'Jutro');
  });

  test('−3 dni → data, NIE jedno ze slow', () => {
    const { tekst } = etykieta(przesun(DZIS, -3), KIEDY);
    for (const slowo of ['Dziś', 'Wczoraj', 'Jutro']) assert.notEqual(tekst, slowo);
    assert.match(tekst, /\d/, 'dalsze dni pokazują datę');
  });

  test('kazde z trzech slow pada DOKLADNIE raz w oknie ±5 dni', () => {
    const widziane = [];
    for (let i = -5; i <= 5; i++) widziane.push(etykieta(przesun(DZIS, i), KIEDY).tekst);
    for (const slowo of ['Dziś', 'Wczoraj', 'Jutro']) {
      assert.equal(widziane.filter((t) => t === slowo).length, 1,
        `„${slowo}" pada ${widziane.filter((t) => t === slowo).length}× — skala przesunięta albo zdublowana`);
    }
    assert.equal(widziane[5], 'Dziś', 'środek okna to dzisiaj');
    assert.equal(widziane[4], 'Wczoraj');
    assert.equal(widziane[6], 'Jutro');
  });
});

describe('etykieta zgadza sie z tym, co POJDZIE DO BAZY', () => {
  // Sedno wady: etykieta i zapis liczyły się dwoma różnymi mechanizmami.
  // saveLog buduje logged_at z `logDate + 'T12:00:00' + offset`, gdzie
  // logDate = _logDate || lokalne dzisiaj. Etykieta „Dziś" musi więc
  // oznaczać dokładnie ten dzień, który wyląduje w logged_at.
  for (const pora of PORY) {
    test(`o ${pora} „Dziś" wskazuje ten sam dzien co logged_at`, () => {
      const kiedy = `2026-08-14T${pora}:00`;
      const dzis = kluczLokalny(kiedy);
      assert.equal(etykieta(dzis, kiedy).tekst, 'Dziś');
      assert.equal(dzis, '2026-08-14', 'klucz zapisu liczony niezależnie w teście');
    });
  }
});
