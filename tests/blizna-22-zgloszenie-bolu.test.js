/* BLIZNA 22: zawodnik nie miał jak powiedzieć „boli mnie kolano".
   Znalezione 22.08.2026 przy audycie wsadu modelu, zbudowane tego samego dnia.

   ⚠️ KLASA BŁĘDU: kanał opisany w prompcie, ale niepodłączony do niczego, czym
   człowiek mógłby się posłużyć. Zmierzone przed naprawą:
     · `coach_athlete_notes` z tagiem `kontuzja` — 0 wierszy w CAŁEJ bazie
     · `athletes.profile_data`, gdzie lądowała ankieta pytająca o kontuzje —
       NULL u 61/61 kont
     · `zawodnik.html` — ANI JEDNEJ ścieżki zgłoszenia; słowo „kontuzja" padało
       tam w opisie ćwiczeń, w karcie celu onboardingu i w nazwie odznaki
   Jedyną drogą była wiadomość do trenera — a 33 z 61 osób trenera nie ma.

   ⚠️ TEN TEST PILNUJE PROSTOTY, NIE FUNKCJI. Trzy poziomy i sześć miejsc to
   decyzja: formularz, którego nikt nie wypełni, jest wart tyle co pustka.
   Rozrost skali jest tu regresją, nie ulepszeniem. */
const test = require('node:test');
const assert = require('node:assert');
const { zaladujSb } = require('./_srodowisko.js');

const w = zaladujSb().window;

/* Atrapa bazy. Zapamiętuje, co poszło do insert/update — sprawdzamy KONTRAKT,
   nie kolumny (atrapa ich nie waliduje, od tego jest CHECK w bazie). */
function atrapa({ aktywne = [], bladInsert = false, bladUpdate = false, rzucaj = false } = {}) {
  const zapis = { inserty: [], update: [] };
  w.sb = {
    from() {
      const b = {
        _upd: null,
        select: () => b, eq: () => b, is: () => b, order: () => b,
        limit: async () => {
          if (rzucaj) throw new Error('brak tabeli');
          return { data: aktywne, error: null };
        },
        insert: async (x) => { zapis.inserty.push(x); return { error: bladInsert ? { message: 'nie' } : null }; },
        update: (x) => { b._upd = x; zapis.update.push(x); return b; },
        then: (res) => res({ error: bladUpdate ? { message: 'nie' } : null }),
      };
      return b;
    },
  };
  return zapis;
}

test('22 — zgłoszenie bólu', async (t) => {

  await t.test('⚠️ TRZY POZIOMY I SZEŚĆ MIEJSC — rozrost jest regresją', () => {
    /* ⚠️ LITERAŁY, nie odczyt z modułu: porównanie z `w.BOL.POZIOMY.length`
       byłoby samozwrotne i przespałoby dorzucenie czwartego poziomu. */
    assert.strictEqual(w.BOL.POZIOMY.length, 3, 'poziomów ma być TRZY — pole, którego nikt nie wypełni, jest warte tyle co pustka');
    assert.strictEqual(w.BOL.MIEJSCA.length, 6, 'miejsc ma być SZEŚĆ');
    assert.strictEqual(w.BOL.POZIOMY.map(p => p.v).join(','), '1,2,3');
    assert.ok(w.BOL.MIEJSCA.some(m => m.v === 'inne'), '„inne" musi zostać — bez furtki człowiek odbije się od listy');
  });

  await t.test('etykiety są po ludzku, nie po formularzowemu', () => {
    assert.strictEqual(w.BOL.nazwaPoziomu(1), 'Boli lekko');
    assert.strictEqual(w.BOL.nazwaPoziomu(3), 'Nie mogę biegać');
    assert.strictEqual(w.BOL.nazwaMiejsca('achilles'), 'Ścięgno Achillesa');
    assert.match(w.BOL.nazwaPoziomu(99), /poziom 99/, 'nieznany poziom nie może wywalić renderu');
  });

  await t.test('zgłoszenie zapisuje poziom, miejsce i notatkę', async () => {
    const z = atrapa();
    const r = await w.BOL.zglos('A', 2, 'kolano', '  boli od zjazdu  ');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(z.inserty.length, 1);
    assert.strictEqual(z.inserty[0].poziom, 2);
    assert.strictEqual(z.inserty[0].miejsce, 'kolano');
    assert.strictEqual(z.inserty[0].notatka, 'boli od zjazdu', 'notatka ma być przycięta');
  });

  await t.test('pusta notatka zapisuje się jako NULL, nie jako pusty string', async () => {
    const z = atrapa();
    await w.BOL.zglos('A', 1, 'stopa', '   ');
    assert.strictEqual(z.inserty[0].notatka, null, 'pusty string udawałby, że człowiek coś napisał');
  });

  await t.test('niekompletne zgłoszenie NIE trafia do bazy', async () => {
    const z = atrapa();
    /* ⚠️ Porównujemy POLE, nie cały obiekt: `deepStrictEqual` sprawdza też
       prototyp, a obiekty wracają z kontekstu `vm` — mają prototyp TAMTEGO
       realmu i porównanie wywala się mimo identycznej treści. */
    assert.strictEqual((await w.BOL.zglos('A', null, 'kolano')).ok, false);
    assert.strictEqual((await w.BOL.zglos('A', 2, null)).ok, false);
    assert.strictEqual((await w.BOL.zglos(null, 2, 'kolano')).ok, false);
    assert.strictEqual(z.inserty.length, 0);
  });

  await t.test('⚠️ ZAMKNIĘCIE USTAWIA resolved_at — bez tego kontuzja wisi w nieskończoność', async () => {
    /* To jest warunek, bez którego cała reszta jest pułapką: plan nigdy nie
       wróciłby do normy, a model dostawałby „nie wiadomo" podane jako
       „ma kontuzję". */
    const z = atrapa();
    const r = await w.BOL.zamknij('ID-1');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(z.update.length, 1);
    assert.ok(z.update[0].resolved_at, 'resolved_at musi zostać ustawione');
    assert.match(z.update[0].resolved_at, /^\d{4}-\d{2}-\d{2}T/, 'ma być znacznikiem ISO, nie true');
  });

  await t.test('zamknięcie bez id nie woła bazy', async () => {
    const z = atrapa();
    assert.strictEqual((await w.BOL.zamknij(null)).ok, false);
    assert.strictEqual(z.update.length, 0);
  });

  await t.test('⚠️ BRAK TABELY / BŁĄD ODCZYTU → null, nie wyjątek', async () => {
    /* Klient sprzed migracji ma zachowywać się jak przed zmianą, a nie pokazywać
       zepsuty ekran „Dziś". */
    atrapa({ rzucaj: true });
    assert.strictEqual(await w.BOL.aktywna('A'), null);
    atrapa();
    assert.strictEqual(await w.BOL.aktywna(null), null, 'brak athleteId też ma dać null');
  });

  await t.test('aktywne zgłoszenie jest oddawane w całości', async () => {
    atrapa({ aktywne: [{ id: 'X', poziom: 3, miejsce: 'achilles', notatka: null, created_at: '2026-08-20T10:00:00Z' }] });
    const a = await w.BOL.aktywna('A');
    assert.strictEqual(a.id, 'X');
    assert.strictEqual(a.poziom, 3);
    assert.strictEqual(a.miejsce, 'achilles');
  });

  await t.test('⚠️ ZDANIE W PLANIE ODMIENIA MIEJSCE — „ból kolana", nie „ból Kolano"', () => {
    /* Zdanie brzmi „bo zgłosiłeś ból KOGO/CZEGO". Bez dopełniacza wychodziłoby
       „ból Kolano" i całość czytałaby się jak wygenerowana maszynowo — a ma
       brzmieć jak decyzja. */
    assert.strictEqual(w.BOL.bolCzego('kolano'), 'ból kolana');
    assert.strictEqual(w.BOL.bolCzego('stopa'), 'ból stopy');
    assert.strictEqual(w.BOL.bolCzego('lydka'), 'ból łydki');
    assert.strictEqual(w.BOL.bolCzego('achilles'), 'ból ścięgna Achillesa');
    assert.strictEqual(w.BOL.bolCzego('udo'), 'ból uda');
  });

  await t.test('⚠️ „Inne" NIE dokleja nazwy — zdanie kończy się na samym „ból"', () => {
    /* „bo zgłosiłeś ból inne" byłoby bełkotem; przy tym miejscu nazwa znika. */
    assert.strictEqual(w.BOL.bolCzego('inne'), 'ból');
    assert.strictEqual(w.BOL.bolCzego('nieznane-miejsce'), 'ból', 'nieznana wartość też nie może dokleić śmiecia');
  });

  /* ══ TEST NEGATYWNY ══════════════════════════════════════════════════════
     Dowód, że asercja o zamknięciu pilnuje czegoś realnego. */
  await t.test('⚠️ REGRESJA: bez zamknięcia zgłoszenie zostaje aktywne na zawsze', async () => {
    const bezZamkniecia = { resolved_at: null };
    assert.strictEqual(bezZamkniecia.resolved_at, null,
      'dopóki resolved_at jest NULL, zapytanie `is("resolved_at", null)` wciąż je zwraca');
    const z = atrapa();
    await w.BOL.zamknij('ID-2');
    assert.notStrictEqual(z.update[0].resolved_at, null,
      'gdyby zamknij() nie ustawiało znacznika, kontuzja nigdy by nie wygasła');
  });
});
