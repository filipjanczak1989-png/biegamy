/* BLIZNY: trzy usterki generatora zgłoszone i naprawione 18.08.2026.
   Każdy test odpowiada realnemu błędowi, nie hipotezie. */
const test = require('node:test');
const assert = require('node:assert');
const G = require('../js/generator-planu.js');

const TODAY = '2026-08-17';
const zaTyg = n => G._isoZIdx(G._dzienIdx(TODAY) + n * 7);
function uloz(o) {
  return G.uloz(Object.assign({
    dystans: '5k', dniWTygodniu: 5, dataStartu: zaTyg(12), today: TODAY,
    poziom: { p10sec: 300, wynik: null, objetoscTygodniowa: 15 }, celCzasowy: null
  }, o));
}

/* ══ 16. ADAPTACJA NIE WCHODZI TRENEROWI W ROBOTĘ ═══════════════════════════
   ⚠️ KLASA BŁĘDU: „dwa systemy piszą do tej samej tabeli". Generator i panel
   trenerski trzymają treningi w JEDNEJ tabeli `trainings`, rozróżnia je
   wyłącznie `plan_source`. Adaptacja bez tego filtra przeliczałaby tydzień,
   który trener właśnie ułożył — a on ten tydzień WIDZIAŁ, więc jego decyzja
   jest świeższa niż nasza reguła.
   Ten zestaw wróci przy KAŻDEJ przyszłej zmianie adaptacji. */
test('16 — czyj jest tydzień', async (t) => {
  await t.test('same wpisy generatora → tydzień nasz', () => {
    assert.strictEqual(G.tydzienNalezyDoNas(
      [{ plan_source: 'generator' }, { plan_source: 'generator' }]), true);
  });

  await t.test('⚠️ JEDEN wpis trenera zabiera CAŁY tydzień, nie tylko siebie', () => {
    assert.strictEqual(G.tydzienNalezyDoNas(
      [{ plan_source: 'generator' }, { plan_source: 'generator' },
       { plan_source: 'generator' }, { plan_source: 'coach' }]), false,
      'przypadek mieszany 3+1 — przeliczanie tylko swoich dałoby tydzień, którego nikt nie zaprojektował');
  });

  await t.test('⚠️ NULL to też nie nasze — trener EDYTUJĄC zeruje znacznik', () => {
    assert.strictEqual(G.tydzienNalezyDoNas(
      [{ plan_source: 'generator' }, { plan_source: null }]), false);
    assert.strictEqual(G.tydzienNalezyDoNas([{ plan_source: undefined }]), false);
  });

  await t.test('pusty tydzień nie jest cudzy', () => {
    assert.strictEqual(G.tydzienNalezyDoNas([]), true);
    assert.strictEqual(G.tydzienNalezyDoNas(null), true);
  });

  await t.test('nieznane źródło traktujemy jak cudze, nie jak nasze', () => {
    assert.strictEqual(G.tydzienNalezyDoNas([{ plan_source: 'ai' }]), false,
      'domyślnie NIE dotykamy — nowe źródło ma być bezpieczne z automatu');
  });
});

/* ══ 6. ŻADNA JEDNOSTKA PONIŻEJ 3 km ════════════════════════════════════════
   Zgłoszenie: plan wystawiał jednostkę 2,7 km. Zmierzone przed poprawką:
   663 jednostki poniżej 3 km na 5644 tygodni, najkrótsza 1,5 km (Regeneracja
   przy bazie 15 km/tydz, liczona jako 10% tygodnia).
   ⚠️ Poprzednia podłoga `Math.max(2, …)` DOKŁADAŁA kilometry, których nikt nie
   odejmował — tydzień po cichu przekraczał swoją objętość. Nowa bierze je
   z jednostek mających zapas. */
test('6 — podłoga jednostki 3 km', async (t) => {
  const przypadki = [];
  for (const dystans of ['5k', '10k', 'half', 'marathon'])
    for (const dniWTygodniu of [3, 4, 5, 6])
      for (const objetoscTygodniowa of [15, 19, 25, 40, 70])
        przypadki.push({ dystans, dniWTygodniu, dataStartu: zaTyg(16),
          poziom: { p10sec: 300, wynik: null, objetoscTygodniowa } });

  /* ⚠️ PRÓG WPISANY LITERAŁEM, NIE WZIĘTY Z `G.MIN_JEDNOSTKI_KM` — I TO JEST
     ISTOTA TEGO TESTU. Pierwsza wersja porównywała ze stałą z silnika i przez
     to była samozwrotna: obniżenie stałej do 2 obniżało też asercję, więc test
     przechodził dalej i nie pilnował NICZEGO. Wyszło to w teście negatywnym.
     Osobno sprawdzamy, że stała nie odjechała od tej liczby. */
  await t.test('żadna jednostka biegowa nie schodzi poniżej 3 km', () => {
    const PODLOGA = 3;
    assert.strictEqual(G.MIN_JEDNOSTKI_KM, PODLOGA,
      'stała w silniku rozjechała się z progiem, którego pilnuje ten test');
    const zle = [];
    for (const p of przypadki) {
      const r = uloz(p);
      if (!r.ok) continue;
      for (const tr of r.treningi) {
        const km = tr.target_distance_km;
        if (km != null && km > 0 && km < PODLOGA)
          zle.push(p.dystans + '/' + p.dniWTygodniu + 'dni/' + p.poziom.objetoscTygodniowa + 'km: ' +
                   tr.workout_type + ' ' + km);
      }
    }
    assert.deepStrictEqual(zle, [], 'jednostki poniżej podłogi: ' + zle.slice(0, 5).join(', '));
  });

  await t.test('⚠️ podłoga NIE tworzy kilometrów — bierze je z zapasu', () => {
    /* Gdyby podłoga tylko podnosiła, tydzień rósłby o różnicę. Sprawdzamy, że
       tygodnie o małej bazie nie przekraczają zaplanowanej objętości. */
    const r = uloz({ dniWTygodniu: 6, poziom: { p10sec: 300, wynik: null, objetoscTygodniowa: 15 } });
    assert.ok(r.ok, 'plan miał powstać');
    const poTyg = {};
    for (const tr of r.treningi) (poTyg[tr.week_number] = poTyg[tr.week_number] || []).push(tr);
    const zam = r.meta.objetosciTygodni;
    let przekroczen = 0;
    for (const nr of Object.keys(poTyg)) {
      const i = Number(nr) - 1;
      if (!(zam && zam[i] > 0)) continue;
      const suma = poTyg[nr].reduce((s, tr) => s + (tr.target_distance_km || 0), 0);
      if (suma > zam[i] + 3.01) przekroczen++;      // 3 km = jedna podłoga, tolerancja siatki
    }
    assert.strictEqual(przekroczen, 0, 'tygodnie przekraczające plan o więcej niż jedną podłogę');
  });

  await t.test('⚠️ redystrybucja nie przebija sufitu 40% na wybieganiu', () => {
    /* Ryzyko wskazane przy zleceniu: oddawanie kilometrów DO wybiegania mogłoby
       przekroczyć cap przy 3 dniach. Podłoga bierze z zapasu, więc wybieganie
       raczej oddaje niż dostaje — ale sprawdzamy, nie zakładamy. */
    let maks = 0;
    for (const p of przypadki) {
      const r = uloz(p);
      if (!r.ok) continue;
      const poTyg = {};
      for (const tr of r.treningi) (poTyg[tr.week_number] = poTyg[tr.week_number] || []).push(tr);
      for (const nr of Object.keys(poTyg)) {
        const jt = poTyg[nr];
        const suma = jt.reduce((s, tr) => s + (tr.target_distance_km || 0), 0);
        const dl = jt.filter(tr => tr.workout_type === 'Wybieganie')
                     .reduce((m, tr) => Math.max(m, tr.target_distance_km || 0), 0);
        if (suma > 0) maks = Math.max(maks, dl / suma);
      }
    }
    /* 0,42 a nie 0,40: cap liczy się względem ZAPLANOWANEJ objętości tygodnia,
       a realna suma bywa niższa (sufity zjadają kilometry), więc realny udział
       sięga 0,415 — i sięgał go RÓWNIEŻ przed tą zmianą (zmierzone: 116 tygodni
       przed, 113 po). Test pilnuje, żeby podłoga tego nie POGORSZYŁA. */
    assert.ok(maks <= 0.42, 'realny udział wybiegania urósł do ' + maks.toFixed(3));
  });
});

/* ══ 11. KAŻDA ŚCIANA NIESIE WYJŚCIE ════════════════════════════════════════
   SKOK_OBJETOSCI była jedyną z pięciu merytorycznych ścian, która mówiła
   „za duży skok" i kończyła. ⚠️ Komentarz nad nią TWIERDZIŁ, że „każda niesie
   konkretną liczbę tygodni do dołożenia" — a komunikat jej nie zawierał.
   Człowiek czytający tę odmowę ma zwykle opłacony start i datę nie do ruszenia. */
test('11 — odmowa SKOK_OBJETOSCI niesie wyjście', async (t) => {
  // Najczęstszy przypadek w bazie: półmaraton przy 25 km/tydz na 10 tygodni.
  const r = uloz({ dystans: 'half', dniWTygodniu: 4, dataStartu: zaTyg(10),
                   poziom: { p10sec: 300, wynik: null, objetoscTygodniowa: 25 } });

  await t.test('to nadal jest odmowa SKOK_OBJETOSCI', () => {
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.sciana.kod, 'SKOK_OBJETOSCI');
  });

  await t.test('⚠️ komunikat podaje LICZBĘ TYGODNI, nie samą diagnozę', () => {
    assert.match(r.sciana.komunikat, /\d+ tyg\. przygotowania/);
    assert.ok(r.sciana.szczegoly.tygodniePotrzebne > r.sciana.szczegoly.tygodnie,
      'potrzebne tygodnie muszą przekraczać dostępne, inaczej odmowa nie miałaby sensu');
  });

  await t.test('…i wskazuje dystans mieszczący się w dzisiejszej objętości', () => {
    assert.strictEqual(r.sciana.szczegoly.alternatywnyDystans, '10k');
    assert.match(r.sciana.komunikat, /10 km/);
  });

  await t.test('…oraz drogę przez człowieka, jak pozostałe cztery ściany', () => {
    assert.match(r.sciana.komunikat, /Filipa albo Kasi/);
  });

  await t.test('⚠️ alternatywa jest zawsze KRÓTSZA od celu, nigdy dłuższa', () => {
    for (const dystans of ['5k', '10k', 'half', 'marathon']) {
      for (const objetoscTygodniowa of [15, 20, 25, 30]) {
        const w = uloz({ dystans, dniWTygodniu: 4, dataStartu: zaTyg(10),
                         poziom: { p10sec: 300, wynik: null, objetoscTygodniowa } });
        if (w.ok || w.sciana.kod !== 'SKOK_OBJETOSCI') continue;
        const alt = w.sciana.szczegoly.alternatywnyDystans;
        if (!alt) continue;
        assert.ok(G.DYSTANSE[alt].km < G.DYSTANSE[dystans].km,
          'przy celu ' + dystans + ' zaproponowano ' + alt);
      }
    }
  });
});
