// ─────────────────────────────────────────────────────────────────────────────
// ŚCIEŻKA W ODMOWIE — odmowa policzona W PRZÓD.
//
// Odmowa mówi „nie da się". Ścieżka mówi „nie da się TEGO, ale da się TO,
// a tamto za tyle". Liczby biorą się z tych samych reguł, które odmawiają.
//
// !! NAJWIĘKSZA STRATA STAREGO KOMUNIKATU NIE BYŁA BRAKIEM ŚCIEŻKI.
//    Brzmiał „zbuduj bazę do ~35 km/tydz" — prawda o maratonie, która CHOWAŁA
//    to, że przy 12 km/tydz do pierwszego planu brakuje pół kilometra
//    tygodniowo. Człowiek odchodził od ekranu z liczbą 35, mając 12.
const test = require('node:test');
const assert = require('node:assert');
const G = require('../js/generator-planu.js');

const TODAY = '2026-08-18';
const zaTyg = n => G._isoZIdx(G._dzienIdx(TODAY) + n * 7);
function odmowa(o) {
  const r = G.uloz(Object.assign({
    dystans: 'marathon', dniWTygodniu: 4, dataStartu: zaTyg(40), today: TODAY,
    poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 12 }, celCzasowy: null
  }, o));
  assert.strictEqual(r.ok, false, 'oczekiwano odmowy, dostano plan');
  return r.sciana;
}

test('REGRESJA SYLWII — baza 12, cel maraton', async (t) => {
  const s = odmowa({});

  await t.test('to jest ZA_MALA_BAZA', () => {
    assert.strictEqual(s.kod, 'ZA_MALA_BAZA');
  });

  /* ⚠️ ŚCIEŻKA PROWADZI NA 5 km, NIE NA 10 — i to jest ZMIERZONE, nie wybrane.
     Progi z 18.08.2026: 5 km od 12,5 km/tydz, 10 km od 16, HM od 20,5,
     maraton od 36,5. Przy bazie 12 dziesiątka odbiłaby się drugą odmową,
     a przycisk prowadzący do odmowy jest gorszy niż brak przycisku. */
  await t.test('⚠️ mówi, ILE BRAKUJE do pierwszego planu, nie ile do celu', () => {
    assert.match(s.komunikat, /na 5 km/);
    assert.match(s.komunikat, /brakuje Ci 0\.5 km tygodniowo/);
  });

  await t.test('…i nie obiecuje terminu co do tygodnia', () => {
    assert.match(s.komunikat, /kilka tygodni/);
    assert.doesNotMatch(s.komunikat, /\b[1-7] tygodni\b/,
      'podał dokładną liczbę poniżej 8 tygodni — to fałszywa precyzja');
  });

  await t.test('…a maraton dostaje porę roku, nie datę', () => {
    assert.match(s.komunikat, /Maraton realnie (wiosną|latem|jesienią|zimą) 20\d\d/);
  });
});

test('ŚCIEŻKA wskazuje dystans, który NAPRAWDĘ przechodzi', async (t) => {
  await t.test('baza 25 → półmaraton, i ten plan faktycznie powstaje', () => {
    const s = odmowa({ poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 25 } });
    assert.strictEqual(s.szczegoly.sciezkaDystans, 'half');
    // dowód, że przycisk nie prowadzi w drugą odmowę
    const r = G.uloz({ dystans: 'half', dniWTygodniu: 4, dataStartu: zaTyg(40), today: TODAY,
      poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 25 }, celCzasowy: null });
    assert.strictEqual(r.ok, true, 'ścieżka wskazała dystans, który się odbija');
  });

  await t.test('baza 14 → piątka, i ten plan faktycznie powstaje', () => {
    const s = odmowa({ poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 14 } });
    assert.strictEqual(s.szczegoly.sciezkaDystans, '5k');
    const r = G.uloz({ dystans: '5k', dniWTygodniu: 4, dataStartu: zaTyg(40), today: TODAY,
      poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 14 }, celCzasowy: null });
    assert.strictEqual(r.ok, true);
  });

  await t.test('⚠️ przy bazie 12 NIE wskazuje żadnego — bo żaden nie przechodzi', () => {
    const s = odmowa({});
    assert.strictEqual(s.szczegoly.sciezkaDystans, null,
      'wskazał dystans, który przy tej bazie i tak by się odbił');
  });
});

test('BRZEG — gdy do etapu brakuje niewiele', async (t) => {
  /* Zlecenie: „baza 34 przy wymaganych 35 — co pokazuje?".
     Zmierzone: przy 34 km/tydz odzywa się ZA_KROTKIE_WYBIEGANIE (nie ZA_MALA_BAZA),
     brakuje ~3 km/tydz, czyli mniej niż 8 tygodni narastania. */
  for (const baza of [34, 36]) {
    await t.test('baza ' + baza + ' → „kilka tygodni", nie liczba', () => {
      const s = odmowa({ poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: baza } });
      assert.strictEqual(s.kod, 'ZA_KROTKIE_WYBIEGANIE');
      assert.match(s.komunikat, /kilka tygodni budowania/);
      assert.doesNotMatch(s.komunikat, /\b[1-7] tygodni budowania\b/);
    });
  }

  await t.test('…i nadal proponuje dystans osiągalny od razu', () => {
    const s = odmowa({ poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 34 } });
    assert.strictEqual(s.szczegoly.sciezkaDystans, 'half');
  });
});

test('R2 — cel czasowy ma JEDNĄ ścieżkę, nie menu', async (t) => {
  const s = odmowa({ dystans: 'half', dataStartu: zaTyg(100),
    poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 40 }, celCzasowy: 90 * 60 });

  await t.test('podaje realny cel na TEN start', () => {
    assert.strictEqual(s.kod, 'CEL_ZA_AMBITNY');
    assert.match(s.komunikat, /Realny cel na ten start: \d/);
  });

  await t.test('⚠️ NIE rozbija na cel pośredni — trzy liczby to granica czytelności', () => {
    // forma + realny cel + procent poprawy = trzy. Czwarta liczba to za dużo.
    const liczby = s.komunikat.match(/\d+:\d\d(:\d\d)?/g) || [];
    assert.ok(liczby.length <= 2,
      'w komunikacie są ' + liczby.length + ' czasy — to menu, nie ścieżka: ' + liczby.join(', '));
  });

  await t.test('perspektywa mówi o PRACY, nie o dacie', () => {
    assert.match(s.komunikat, /konsekwentnej pracy/);
    assert.doesNotMatch(s.komunikat, /20\d\d/, 'obiecuje rok — tego nie wiemy');
  });
});

test('ZAOKRĄGLANIE HORYZONTU — nie precyzyjniej, niż wiemy', async (t) => {
  await t.test('poniżej 8 tygodni nigdy nie podajemy liczby', () => {
    for (const baza of [33, 34, 35, 36]) {
      const s = odmowa({ poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: baza } });
      assert.doesNotMatch(s.komunikat, /\b[1-7] tygodni\b/, 'baza ' + baza);
    }
  });

  await t.test('powyżej pół roku podajemy porę roku, nie tygodnie', () => {
    const s = odmowa({});
    assert.doesNotMatch(s.komunikat, /Maraton realnie za około/);
  });
});
