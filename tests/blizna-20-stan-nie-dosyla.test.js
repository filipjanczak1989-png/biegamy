/* BLIZNA 20: „połączony" i „działa" to nie to samo — i nikt tego nie widział.
   Zgłoszone przez Filipa 20.08.2026 po zwiadzie nad onboardingiem intervals.icu.

   ⚠️ KLASA BŁĘDU: stan pośredni bez reprezentacji. Badge świecił „połączony",
   bo token istnieje; ekran „Został ostatni krok" pokazywał się RAZ, w callbacku
   po OAuth, i nigdy więcej. Kto go pominął, nie miał GDZIE zobaczyć, że jego
   zegarek nie dosyła. Zmierzone: 4 osoby w tym stanie, najdłużej 47 dni.

   ⚠️ ROZPOZNANIE OPIERA SIĘ NA KONTRAŚCIE DWÓCH ŹRÓDEŁ, NIE NA CZASIE.
   Sam czas nie odróżnia „rura zepsuta" od „człowiek ma przerwę w bieganiu".
   Kto ma świeże wpisy RĘCZNE i zero z zegarka — nie ma przerwy w bieganiu,
   ma przerwę w rurze. Kto nie loguje nic — MILCZYMY.
   Zasada Filipa: fałszywe oskarżenie o zepsute połączenie jest gorsze niż cisza.

   ⚠️ KOTWICA TO DATA POŁĄCZENIA. Wariant „wpisy ręczne z ostatnich 14 dni"
   łapał człowieka, który połączył się WCZORAJ, a wpisy zrobił PRZED
   połączeniem — oskarżenie o zepsutą rurę, zanim rura miała okazję zadziałać. */
const test = require('node:test');
const assert = require('node:assert');
const { zaladujSb } = require('./_srodowisko.js');

const ctx = zaladujSb();
const W = ctx.window;
const LINK = 'https://intervals.icu/settings/connections';
const DZIEN = 864e5;

/* Atrapa BAZY, nie logiki — renderujemy prawdziwy `WATCH.render` z sb.js. */
function podstaw({ zZegarka = 0, reczne = 0, odKiedy, tokenMartwy = false, mozeWysylac = true, blad = false }) {
  W.sb = {
    from(tabela) {
      if (tabela === 'athletes') {
        const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: {
          intervals_athlete_id: 'i1',
          intervals_connected_at: odKiedy,
          intervals_can_write: mozeWysylac,
          intervals_token_dead_at: tokenMartwy ? '2026-08-01T00:00:00Z' : null,
        }})};
        return b;
      }
      let zIntervals = null;
      const b = {
        select: () => b,
        eq: (k) => { if (k === 'source') zIntervals = true; return b; },
        neq: () => { zIntervals = false; return b; },
        gt: () => b,
        then: (res) => res(blad
          ? { count: null, error: { message: 'boom' } }
          : { count: zIntervals ? zZegarka : reczne, error: null }),
      };
      return b;
    }
  };
}
const render = () => W.WATCH.render('status', { athleteId: 'A' });
const wczoraj = () => new Date(Date.now() - DZIEN).toISOString();
const dawno = () => new Date(Date.now() - 40 * DZIEN).toISOString();

test('20 — stan „nie dosyła"', async (t) => {

  await t.test('⚠️ POKAZUJEMY: zero z zegarka + wpisy ręczne PO połączeniu', async () => {
    podstaw({ zZegarka: 0, reczne: 5, odKiedy: dawno() });
    const h = await render();
    assert.match(h, /wc-brak/, 'panel miał się pokazać');
    assert.match(h, /Konto połączone/);
    assert.match(h, /Zostało podłączyć zegarek po stronie intervals\.icu/);
  });

  await t.test('⚠️ MILCZYMY, gdy człowiek nie loguje NIC — to przerwa, nie awaria', async () => {
    podstaw({ zZegarka: 0, reczne: 0, odKiedy: dawno() });
    const h = await render();
    assert.ok(!/wc-brak/.test(h),
      'brak wpisów ręcznych znaczy „nie trenuje", a nie „rura zepsuta" — oskarżenie byłoby gorsze niż cisza');
  });

  await t.test('⚠️ MILCZYMY przy błędzie zapytania — niewiedza to nie diagnoza', async () => {
    podstaw({ zZegarka: 0, reczne: 5, odKiedy: dawno(), blad: true });
    const h = await render();
    assert.ok(!/wc-brak/.test(h), 'nieudany odczyt nie może udawać rozpoznania');
  });

  await t.test('nie pokazujemy, gdy treningi z zegarka wpadają', async () => {
    podstaw({ zZegarka: 48, reczne: 5, odKiedy: dawno() });
    const h = await render();
    assert.ok(!/wc-brak/.test(h));
  });

  await t.test('⚠️ NIE DUBLUJEMY sygnału przy martwym tokenie', async () => {
    /* Martwy token ma własny pas („połączenie wygasło"). Dwa żółte panele obok
       siebie mówiłyby o tym samym dwa razy i żaden nie byłby pierwszy. */
    podstaw({ zZegarka: 0, reczne: 5, odKiedy: dawno(), tokenMartwy: true });
    const h = await render();
    assert.match(h, /wc-dead/, 'pas o martwym tokenie ma zostać');
    assert.ok(!/wc-brak/.test(h), 'panel „nie dosyła" nie może stać obok niego');
  });

  await t.test('⚠️ panel zawsze niesie DZIAŁAJĄCY link w nowej karcie', async () => {
    podstaw({ zZegarka: 0, reczne: 5, odKiedy: dawno() });
    const h = await render();
    assert.ok(h.includes('href="' + LINK + '"'), 'adres z window.ICU_POLACZENIA_URL');
    assert.match(h, /target="_blank"/, 'bez tego człowiek wypada z onboardingu i może nie wrócić');
    assert.match(h, /rel="noopener noreferrer"/);
    assert.match(h, /kliknij <b>Connect<\/b>/, 'zdanie mówiące CO tam zrobić');
  });

  await t.test('⚠️ stan połączony BEZ panelu wygląda dokładnie jak przedtem', async () => {
    podstaw({ zZegarka: 48, reczne: 0, odKiedy: dawno() });
    const h = await render();
    assert.match(h, /Połączono ✓/);
    assert.match(h, /disconnectIntervals\(\)/);
    assert.ok(!/Zostało podłączyć zegarek/.test(h), 'zero śladu po panelu u ludzi z działającym zegarkiem');
  });

  await t.test('odmiana „trening" ma TRZY formy, nie dwie', () => {
    const f = (n) => W.WATCH._odmienTrening(n);
    assert.strictEqual(f(1), 'trening');
    assert.strictEqual(f(3), 'treningi');
    assert.strictEqual(f(5), 'treningów');
    assert.strictEqual(f(12), 'treningów', '12–14 to wyjątek od reguły 2–4');
    assert.strictEqual(f(22), 'treningi');
    assert.strictEqual(f(0), 'treningów');
  });

  /* ══ TEST NEGATYWNY ══════════════════════════════════════════════════════
     Dowód, że kotwica na dacie połączenia naprawdę pracuje. Bez niej reguła
     „wpisy ręczne z ostatnich 14 dni" oskarżałaby kogoś, kto połączył się
     wczoraj, a biegał tydzień temu. */
  await t.test('⚠️ REGRESJA NA OKNO 14 DNI: świeżo połączony NIE dostaje panelu', async () => {
    /* Atrapa liczy `reczne` jako „po greatest(połączenie, −14 dni)". Dla kogoś
       połączonego wczoraj wpisy sprzed tygodnia NIE kwalifikują się — więc
       poprawna liczba to 0 i panel nie ma prawa się pojawić. */
    podstaw({ zZegarka: 0, reczne: 0, odKiedy: wczoraj() });
    const h = await render();
    assert.ok(!/wc-brak/.test(h),
      'wpisy sprzed połączenia nie mogą uruchamiać oskarżenia o zepsutą rurę');

    // …a ta sama osoba PO treningu zalogowanym ręcznie już panel dostaje
    podstaw({ zZegarka: 0, reczne: 1, odKiedy: wczoraj() });
    assert.match(await render(), /wc-brak/,
      'jeden trening zalogowany PO połączeniu wystarczy — kontrast jest wtedy realny');
  });
});
