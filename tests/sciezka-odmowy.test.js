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
//
// !! PROGI PRZESUNĘŁY SIĘ 24.08.2026 i liczby w tym pliku poszły za nimi.
//    MNOZNIK_SZCZYTU przestał być stałą 1,6 i zależy od horyzontu
//    (min(1,6 + tygodnie/100, 2,2)), więc przy 40-tygodniowym starcie mnożnik
//    wynosi 2,0 i te same bazy sięgają wyżej. ZMIERZONE progi dla maratonu
//    na 40 tygodni: baza <=9 -> żaden dystans nie przechodzi, 10-12 -> piątka,
//    14 -> dziesiątka, 20 -> półmaraton, >=30 -> maraton.
//    Sylwia (baza 12) NIE jest już przypadkiem „nic nie przechodzi" — dostaje
//    ścieżkę na 5 km. Gałąź „ile brakuje do pierwszego planu" testujemy więc
//    na bazie 8, gdzie naprawdę nic nie przechodzi.
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
     Przy bazie 12 i mnożniku 2,0 (40 tygodni) piątka przechodzi, dziesiątka
     jeszcze nie — jej minSzczyt to 25, a 12 x 2,0 = 24. Przycisk prowadzący
     do drugiej odmowy jest gorszy niż brak przycisku. */
  await t.test('⚠️ wskazuje piątkę i ten plan NAPRAWDĘ powstaje', () => {
    assert.strictEqual(s.szczegoly.sciezkaDystans, '5k');
    assert.match(s.komunikat, /Najbliżej masz 5 km/);
    const r = G.uloz({ dystans: '5k', dniWTygodniu: 4, dataStartu: zaTyg(40), today: TODAY,
      poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 12 }, celCzasowy: null });
    assert.strictEqual(r.ok, true, 'ścieżka wskazała dystans, który się odbija');
  });

  /* ⚠️ TO JEST ZYSK Z ZALEŻNOŚCI OD HORYZONTU, NIE POLUZOWANIE REGUŁY.
     Ten sam plan przy mnożniku 1,6 był odmawiany, a wymaga wzrostu ~1,8%/tydz
     przy limicie pasma 8% — mieści się w regule przyrostu z ogromnym zapasem.
     Odmawiała go stała, nie bezpieczeństwo. */
  await t.test('…a plan z tej ścieżki jest łagodny, nie ambitny', () => {
    const r = G.uloz({ dystans: '5k', dniWTygodniu: 4, dataStartu: zaTyg(40), today: TODAY,
      poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 12 }, celCzasowy: null });
    const szczyt = Math.max.apply(null, r.meta.objetosciTygodni);
    const budowa = r.meta.tygodnie - r.meta.taperTygodni;
    const przyrost = Math.pow(szczyt / 12, 1 / budowa) - 1;
    assert.ok(przyrost < 0.03, 'wymaga ' + (przyrost * 100).toFixed(2) + '%/tydz — to już nie jest łagodne');
  });

  /* ⚠️ TU JEST TERAZ LICZBA TYGODNI, NIE PORA ROKU — i to jest poprawne.
     Wymagana baza spadła z 29 do 23 km/tydz (minSzczyt 45 / mnożnik 2,0),
     więc horyzont zmieścił się w 26 tygodniach, a mgliscieTygodnie() podaje
     porę roku dopiero powyżej. Zdanie o porze roku broni się niżej, przy
     bazie 8, gdzie horyzont naprawdę jest roczny. */
  await t.test('…a maraton dostaje horyzont, nie datę co do dnia', () => {
    assert.match(s.komunikat, /Maraton realnie za około \d+ tygodni/);
    assert.doesNotMatch(s.komunikat, /\d{1,2}\.\d{2}\.20\d\d/, 'podał datę dzienną');
  });
});

/* Gałąź „nic nie przechodzi" — po 24.08.2026 zaczyna się dopiero przy bazie 9.
   To ta sama treść, której broni komentarz na górze pliku: człowiek ma odejść
   od ekranu z JEDNĄ małą liczbą, nie z 45. */
test('GDY NAPRAWDĘ NIC NIE PRZECHODZI — baza 8, cel maraton', async (t) => {
  const s = odmowa({ poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 8 } });

  await t.test('⚠️ NIE wskazuje żadnego dystansu — bo żaden nie przechodzi', () => {
    assert.strictEqual(s.szczegoly.sciezkaDystans, null,
      'wskazał dystans, który przy tej bazie i tak by się odbił');
  });

  await t.test('⚠️ mówi, ILE BRAKUJE do pierwszego planu, nie ile do celu', () => {
    assert.match(s.komunikat, /Do pierwszego planu — na 5 km — brakuje Ci 2 km tygodniowo/);
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

  /* Przy mnożniku 2,0 (40 tygodni) baza 14 sięga już 28 km/tydz, czyli ponad
     minSzczyt dziesiątki (25). Przed 24.08.2026 była to piątka. */
  await t.test('baza 14 → dziesiątka, i ten plan faktycznie powstaje', () => {
    const s = odmowa({ poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 14 } });
    assert.strictEqual(s.szczegoly.sciezkaDystans, '10k');
    const r = G.uloz({ dystans: '10k', dniWTygodniu: 4, dataStartu: zaTyg(40), today: TODAY,
      poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 14 }, celCzasowy: null });
    assert.strictEqual(r.ok, true);
  });
});

test('BRZEG — gdy do etapu brakuje niewiele', async (t) => {
  /* Zlecenie było: „baza 34 przy wymaganych 35 — co pokazuje?".
     ⚠️ PO 24.08.2026 BAZY 34 i 36 PRZECHODZĄ NA MARATON przy 40 tygodniach
     (mnożnik 2,0 → szczyt 68/70), więc brzeg przesunął się w dół i skrócił.
     Zmierzone: ZA_KROTKIE_WYBIEGANIE żyje przy bazie 30 i 26-tygodniowym
     starcie (najdłuższe wybieganie 22,5 km wobec progu 23,2). Test broni tej
     samej rzeczy co wcześniej — że brzeg mówi „kilka tygodni", a nie liczbę. */
  for (const [baza, tyg] of [[30, 26], [28, 20]]) {
    await t.test('baza ' + baza + ' @' + tyg + ' tyg. → „kilka tygodni", nie liczba', () => {
      const s = odmowa({ dataStartu: zaTyg(tyg),
        poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: baza } });
      assert.strictEqual(s.kod, 'ZA_KROTKIE_WYBIEGANIE');
      assert.match(s.komunikat, /kilka tygodni budowania/);
      assert.doesNotMatch(s.komunikat, /\b[1-7] tygodni budowania\b/);
    });
  }

  await t.test('…i nadal proponuje dystans osiągalny od razu', () => {
    const s = odmowa({ dataStartu: zaTyg(26),
      poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 30 } });
    assert.strictEqual(s.szczegoly.sciezkaDystans, 'half');
  });

  /* ⚠️ BRZEG MA BYĆ BRZEGIEM, NIE ŚCIANĄ: ta sama baza przy dłuższym starcie
     musi przejść. Gdyby nie przechodziła, „kilka tygodni budowania" byłoby
     obietnicą bez pokrycia. */
  await t.test('⚠️ ta sama baza przy dłuższym starcie NAPRAWDĘ przechodzi', () => {
    const r = G.uloz({ dystans: 'marathon', dniWTygodniu: 4, dataStartu: zaTyg(40), today: TODAY,
      poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 30 }, celCzasowy: null });
    assert.strictEqual(r.ok, true, 'brzeg jest ścianą — obietnica bez pokrycia');
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
    for (const baza of [26, 28, 30]) {
      const s = odmowa({ dataStartu: zaTyg(26),
        poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: baza } });
      assert.doesNotMatch(s.komunikat, /\b[1-7] tygodni\b/, 'baza ' + baza);
    }
  });

  /* Pora roku zamiast tygodni zaczyna się powyżej 26 tygodni horyzontu.
     Po 24.08.2026 baza 12 mieści się już w tygodniach (wymagana baza spadła
     z 29 do 23), więc próg pory roku testujemy na bazie 8. */
  await t.test('powyżej pół roku podajemy porę roku, nie tygodnie', () => {
    const s = odmowa({ poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 8 } });
    assert.doesNotMatch(s.komunikat, /Maraton realnie za około/);
    assert.match(s.komunikat, /Maraton realnie (wiosną|latem|jesienią|zimą)/);
  });
});
