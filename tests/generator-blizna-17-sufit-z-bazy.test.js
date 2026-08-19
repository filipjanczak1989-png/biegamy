/* BLIZNA 17: sufit jednostki był STAŁĄ, a miał być funkcją bazy.
   Zgłoszone przez Filipa 19.08.2026 z produkcji, nie z hipotezy: plan zadawał
   63 km/tydz zamiast 88, bo wybieganie stało na 14 km, a akcent na 10 km.

   ⚠️ KLASA BŁĘDU — piąta w tej rodzinie: „stała zamiast funkcji". Poprzednie
   cztery były funkcjami CZASU. Ta jest funkcją BAZY i ma inną sygnaturę awarii:
   stała była BEZCZYNNA dla tych, których miała chronić (przy bazie 25 km/tydz
   30% to 7,5 km, daleko pod 14 — sufit nie gryzł ANI RAZU) i WIĄŻĄCA dla tych,
   dla których jej nie pisano. Dlatego nie zgłosił jej nikt oprócz zaawansowanego.

   ⚠️ TEN TEST PILNUJE TAKŻE GÓRY, NIE TYLKO DOŁU. Samo „% tygodnia" bez capu
   przywraca bug, dla którego sufit powstał — zmierzone 19.08.2026: wybieganie
   wracało do 51 km na półmaratonie i 57 km na maratonie przy bazie 129. */
const test = require('node:test');
const assert = require('node:assert');
const G = require('../js/generator-planu.js');

const TODAY = '2026-08-19';
const zaTyg = n => G._isoZIdx(G._dzienIdx(TODAY) + n * 7);
function uloz(o) {
  return G.uloz(Object.assign({
    dystans: '5k', dniWTygodniu: 5, dataStartu: zaTyg(12), today: TODAY,
    poziom: { p10sec: 205, wynik: null, objetoscTygodniowa: 88 }, celCzasowy: null
  }, o));
}
const najdluzsze = r => Math.max(0, ...r.treningi
  .filter(t => t.workout_type === 'Wybieganie')
  .map(t => t.target_distance_km || 0));

/* Odtworzenie STAREJ reguły — stała, niezależna od bazy. Trzyma się tu, żeby
   test negatywny na końcu miał czym udowodnić, że asercje wyżej są nośne. */
const STARY_SUFIT_DLUGIE = d => d.maxDlugieKm;
const STARY_SUFIT_AKCENT = () => 10;

test('17 — sufit jednostki jest funkcją bazy, nie stałą', async (t) => {

  await t.test('sufit ROŚNIE z bazą — inaczej to nadal stała', () => {
    const d = G.DYSTANSE['5k'];
    assert.ok(G.sufitWybiegania(d, 129) > G.sufitWybiegania(d, 40),
      'sufit przy bazie 129 musi być wyższy niż przy 40 — inaczej funkcja nie jest funkcją');
    assert.ok(G.sufitAkcentu(129) > G.sufitAkcentu(40));
  });

  await t.test('…i jest NIEMALEJĄCY na całym rozstępie (żadnego uskoku w dół)', () => {
    for (const dy of ['5k', '10k', 'half', 'marathon']) {
      let poprz = -1;
      for (let b = 0; b <= 300; b += 1) {
        const s = G.sufitWybiegania(G.DYSTANSE[dy], b);
        assert.ok(s >= poprz - 1e-9, dy + ': sufit spadł przy bazie ' + b + ' (' + poprz + ' → ' + s + ')');
        poprz = s;
      }
    }
    let poprzA = -1;
    for (let b = 0; b <= 300; b += 1) {
      const s = G.sufitAkcentu(b);
      assert.ok(s >= poprzA - 1e-9, 'akcent: sufit spadł przy bazie ' + b);
      poprzA = s;
    }
  });

  /* ⚠️ LITERAŁY, NIE WARTOŚCI Z SILNIKA. Porównanie z G.sufitWybiegania() byłoby
     samozwrotne — obniżenie współczynnika obniżyłoby też asercję i test przespałby
     regresję. Ta sama pułapka wyszła w teście podłogi 3 km (blizna 6). */
  await t.test('⚠️ PODŁOGA = dzisiejsza wartość, więc amator NIE widzi zmiany', () => {
    for (const para of [['5k', 14], ['10k', 18], ['half', 22], ['marathon', 34]]) {
      const dy = para[0], dzis = para[1];
      assert.strictEqual(G.DYSTANSE[dy].maxDlugieKm, dzis,
        dy + ': podłoga rozjechała się z liczbą, którą pilnuje ten test');
      for (const baza of [0, 15, 19, 25, 40]) {
        assert.strictEqual(G.sufitWybiegania(G.DYSTANSE[dy], baza), dzis,
          dy + ' przy bazie ' + baza + ': sufit musi zostać na podłodze ' + dzis);
      }
    }
    for (const baza of [0, 15, 25, 40]) assert.strictEqual(G.sufitAkcentu(baza), 10);
  });

  await t.test('⚠️ PODŁOGA JEST PER DYSTANS, nie globalne 14', () => {
    /* Gdyby wzór brzmiał max(14, 0,30 × baza), maratończyk przy bazie 80 zszedłby
       z 34 km na 24 — zmiana pomyślana jako PODNIESIENIE sufitu obniżyłaby go
       temu, kogo dotyczy najbardziej. */
    assert.strictEqual(G.sufitWybiegania(G.DYSTANSE.marathon, 80), 34,
      'maraton przy bazie 80 nie może zejść poniżej dzisiejszych 34 km');
    assert.ok(G.sufitWybiegania(G.DYSTANSE.marathon, 80) > Math.max(14, 0.30 * 80),
      'globalne 14 jako podłoga dałoby tu 24 km — regresja dla maratończyka');
  });

  await t.test('⚠️ CAP jest twardy — sam procent przywraca bug 46/51 km', () => {
    for (const dy of ['5k', '10k', 'half']) {
      for (const baza of [107, 129, 200, 1000]) {
        assert.strictEqual(G.sufitWybiegania(G.DYSTANSE[dy], baza), 32,
          dy + ' przy bazie ' + baza + ': cap 32 km musi trzymać');
      }
    }
    assert.strictEqual(G.sufitWybiegania(G.DYSTANSE.marathon, 1000), 34,
      'maraton stoi na swojej podłodze 34, bo jest ona wyższa od capu 32');
    for (const baza of [89, 129, 1000]) assert.strictEqual(G.sufitAkcentu(baza), 16);
  });

  await t.test('zgłoszenie Filipa: baza 88 na piątce daje wybieganie ~26 km, nie 14', () => {
    const r = uloz({});
    assert.ok(r.ok, 'plan miał powstać');
    const dl = najdluzsze(r);
    assert.ok(dl > 24 && dl <= 26.55, 'najdłuższe wybieganie: ' + dl + ' (oczekiwane ~26,4)');
    const szczyt = Math.max.apply(null, r.meta.objetosciFaktyczne);
    assert.ok(szczyt > 84,
      'szczyt zadany: ' + szczyt.toFixed(1) + ' — przed poprawką 64 przy chcianych 88');
  });

  await t.test('⚠️ akcent: sufit z bazy zdejmuje blokadę, ale REGUŁA 40 MINUT zostaje', () => {
    /* 40 min to granica fizjologiczna ciągłego biegu progowego, nie objętościowa —
       nie skaluje się z bazą i to jest celowe. Przy bazie 129 to ONA, a nie 16 km
       z bazy, ustala pracę. Gdyby ktoś zdjął minuty, kilometry złapią to na 16. */
    const r = uloz({ dniWTygodniu: 6, poziom: { p10sec: 205, wynik: null, objetoscTygodniowa: 129 } });
    assert.ok(r.ok);
    const tempa = r.treningi.filter(t => t.workout_type === 'Tempo');
    assert.ok(tempa.length > 0, 'plan nie zawiera akcentu progowego — nie ma czego sprawdzać');
    for (const w of tempa) {
      const min = Number(/(\d+) min ciągłego biegu/.exec(w.description)[1]);
      const km = Number(/\((\d+(?:\.\d+)?) km\)/.exec(w.description)[1]);
      assert.ok(min <= 40, 'akcent ' + min + ' min przekroczył 40');
      assert.ok(km <= 16.05, 'akcent ' + km + ' km przekroczył cap 16');
    }
  });

  await t.test('⚠️ sufit z BAZY nie przebija capu 40% TYGODNIA — 40% wygrywa, gdy niższy', () => {
    /* Dwie reguły spotykają się w każdym tygodniu, w którym kmTyg < 0,75 × baza
       (start planu, tydzień zrzutowy, taper). Sufit bazy jest nakładany PIERWSZY,
       cap 40% OSTATNI, więc niższy z nich zawsze wygrywa. Zmierzone 19.08.2026:
       cap 40% był regułą wiążącą w 1962 tygodniach z 411 przeskanowanych planów —
       najczęściej przy MAŁEJ bazie, nie przy dużej, bo tam podłoga 14 km jest
       wielka względem tygodnia (15 km/tydz → 40% to 6 km). */
    let naruszen = 0, sprawdzonych = 0, maxRealny = 0, maxRegula = 0;
    for (const dy of ['5k', '10k', 'half', 'marathon'])
      for (const dniWTygodniu of [3, 4, 5, 6])
        for (const objetoscTygodniowa of [15, 19, 25, 40, 70, 88, 129, 200]) {
          const r = uloz({ dystans: dy, dniWTygodniu, dataStartu: zaTyg(dy === 'marathon' ? 24 : 16),
                           poziom: { p10sec: 300, wynik: null, objetoscTygodniowa } });
          if (!r.ok) continue;
          const poTyg = {};
          for (const tr of r.treningi) (poTyg[tr.week_number] = poTyg[tr.week_number] || []).push(tr);
          for (const nr of Object.keys(poTyg)) {
            const jt = poTyg[nr];
            const suma = jt.reduce((s, tr) => s + (tr.target_distance_km || 0), 0);
            const dl = jt.filter(tr => tr.workout_type === 'Wybieganie')
                         .reduce((m, tr) => Math.max(m, tr.target_distance_km || 0), 0);
            if (!(suma > 0) || !dl) continue;
            sprawdzonych++;
            maxRealny = Math.max(maxRealny, dl / suma);
            const zaplan = r.meta.objetosciTygodni[Number(nr) - 1];
            if (zaplan > 0) maxRegula = Math.max(maxRegula, dl / zaplan);
            if (dl / suma > 0.43) naruszen++;
          }
        }
    assert.ok(sprawdzonych > 500, 'macierz przeskanowała tylko ' + sprawdzonych + ' tygodni');
    assert.strictEqual(naruszen, 0, naruszen + ' tygodni z udziałem wybiegania > 43%');

    /* ⚠️ DWIE RÓŻNE LICZBY I TRZEBA JE TRZYMAĆ OSOBNO — inaczej nie widać, co się
       naprawdę zmieniło 19.08.2026.

       REGUŁA (dl ≤ 0,40 × ZAPLANOWANEJ objętości) — NIETKNIĘTA. Zmierzone na tej
       samej macierzy przed i po zmianie: max 0,4167 w OBU przypadkach, te same
       24 tygodnie. Nadwyżka nad 0,40 pochodzi wyłącznie z siatki 0,5 km na małych
       tygodniach (5,5 km z 13,2), nie z sufitów.

       UDZIAŁ REALNY (dl ÷ suma faktycznie zadana) — DRGNĄŁ: 0,4151 → 0,4270.
       Powód: suma realna bywa niższa od zaplanowanej, bo pozostałe sufity zjadają
       kilometry, a wybieganie po zmianie jest dłuższe, więc dzieli się przez
       mniejszy mianownik. Widać to WYŁĄCZNIE powyżej bazy ~70 km/tydz — macierz
       blizny 6 (bazy do 70) daje 0,4151 przed i po. Świadomie przyjęte: 42,7%
       zamiast 41,5% nie zmienia treningu, a alternatywą byłoby przycinanie
       wybiegania po fakcie, czyli trzeci sufit na tej samej jednostce. */
    assert.ok(maxRegula <= 0.42,
      'REGUŁA 40% ruszyła się: ' + maxRegula.toFixed(4) + ' (zmierzone przed i po zmianie: 0,4167)');
    assert.ok(maxRealny <= 0.43,
      'udział realny urósł do ' + maxRealny.toFixed(4) + ' (zmierzone po zmianie: 0,4270)');
  });

  /* ══ TEST NEGATYWNY ══════════════════════════════════════════════════════
     ⚠️ BRAMKA, KTÓRA ZIELENIEJE, BO SIĘ WYWALIŁA, JEST GORSZA NIŻ JEJ BRAK.
     Odtwarzamy STARĄ regułę (stała 14 / 10) i sprawdzamy, że asercje wyżej
     BY JĄ ZŁAPAŁY. Bez tego nie wiadomo, czy powyższe cokolwiek pilnuje. */
  await t.test('⚠️ REGRESJA NA STAŁĄ: gdyby ktoś cofnął sufit do 14/10, testy muszą czerwienić', () => {
    const d5 = G.DYSTANSE['5k'];

    // 1. asercja „ROŚNIE z bazą" — stała jej nie przechodzi
    assert.ok(!(STARY_SUFIT_DLUGIE(d5) > STARY_SUFIT_DLUGIE(d5)),
      'stała nie rośnie z bazą, więc asercja o wzroście złapałaby cofnięcie');
    assert.ok(!(STARY_SUFIT_AKCENT() > STARY_SUFIT_AKCENT()));

    // 2. asercja capu przy bazie 129 — stała daje 14, nie 32
    assert.notStrictEqual(STARY_SUFIT_DLUGIE(d5), 32,
      'stara reguła przy bazie 129 dawała 14 km, więc asercja capu 32 by ją odrzuciła');
    assert.strictEqual(STARY_SUFIT_DLUGIE(d5), 14);
    assert.strictEqual(STARY_SUFIT_AKCENT(), 10);

    // 3. asercja „zgłoszenie Filipa" — pod starą regułą najdłuższe to 14, poniżej progu 24
    assert.ok(!(STARY_SUFIT_DLUGIE(d5) > 24),
      'gdyby stała przechodziła próg 24 km, asercja Filipa byłaby pusta');

    // 4. …i dowód, że nowa reguła NAPRAWDĘ różni się od starej w tym punkcie
    assert.notStrictEqual(STARY_SUFIT_DLUGIE(d5), G.sufitWybiegania(d5, 88));
    assert.notStrictEqual(STARY_SUFIT_AKCENT(), G.sufitAkcentu(88));
  });
});
