// ─────────────────────────────────────────────────────────────────────────────
// WYZWANIA — etykieta postępu na karcie.
//
// BLIZNA: warunek etykiety brzmiał `!earned`, czyli „czy masz już odznakę" —
// a widok wyzwań odznak NIE PRZYZNAJE, tylko czyta. Między osiągnięciem progu
// a przyznaniem odznaki karta liczyła `target - prog` i pokazywała liczbę
// UJEMNĄ: Filip zrobił 5 dni przy progu 4 i zobaczył „Zostało -1 dni".
//
// Zmierzone 16.08.2026 na 18 wyzwaniach × 2 przypadki (równo progowi i powyżej):
// BŁĘDNE BYŁY 36 z 36. Jedna funkcja obsługuje wszystkie wyzwania, więc to nie
// był błąd jednego z nich — i żyła w DWÓCH plikach naraz.
//
// ⚠️ U `bez_skipa` okno było WIECZNE: ta odznaka jako jedyna z 18 nie ma reguły
// przyznawania, więc `earned` nigdy nie stawało się prawdą. 14 osób widziało
// wtedy wartości od „0" do „-3".
//
// !! TEN TEST WYKONUJE PRAWDZIWY `buildCard` WYJĘTY Z PLIKU, nie przepisany.
//    Przepisany sprawdzałby to, co MYŚLĘ, że kod robi.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const PLIKI = ['zawodnik.html', 'wyzwania.html'];

/** Wytnij fragment źródła między znacznikami (włącznie z końcowym). */
function wytnij(H, od, doZ) {
  const i = H.indexOf(od);
  assert.notEqual(i, -1, 'nie znaleziono w źródle: ' + od);
  const j = H.indexOf(doZ, i);
  assert.notEqual(j, -1, 'nie znaleziono domknięcia: ' + doZ);
  return H.slice(i, j + doZ.length);
}

function stanowisko(plik) {
  const H = fs.readFileSync(path.join(KORZEN, plik), 'utf8');
  const czytajTablice = (nazwa) => {
    const src = wytnij(H, 'const ' + nazwa + ' = [', '];');
    return eval('(' + src.replace('const ' + nazwa + ' = ', '').replace(/;$/, '') + ')');
  };
  const WEEKLY = czytajTablice('WEEKLY');
  const MONTHLY = czytajTablice('MONTHLY');
  /* buildCard sięga po globalne helpery z sb.js — podstawiamy minimum, żeby
     wykonać ORYGINALNY kod zamiast go przepisywać. */
  globalThis.escapeHtml = (x) => String(x == null ? '' : x);
  const src = wytnij(H, '  function buildCard(ch, prog, earned, isMonthly) {', '\n  }');
  const buildCard = new Function('BASE', src + '\n  return buildCard;')('');
  return { WEEKLY, MONTHLY, buildCard, wszystkie: [...WEEKLY, ...MONTHLY] };
}

/** Liczba wyciągnięta z etykiety „Zostało N …", albo null. */
function zostalo(html) {
  const m = html.match(/Zostało\s+(-?[\d.]+)/);
  return m ? Number(m[1]) : null;
}
const progOsiagniety = (html) => /Próg osiągnięty/.test(html);

for (const plik of PLIKI) {
  describe('wyzwania — ' + plik, () => {
    const st = stanowisko(plik);

    test('wczytano komplet wyzwań (inaczej test mierzyłby pustkę)', () => {
      assert.ok(st.WEEKLY.length >= 10, 'WEEKLY: ' + st.WEEKLY.length);
      assert.ok(st.MONTHLY.length >= 6, 'MONTHLY: ' + st.MONTHLY.length);
      assert.equal(st.wszystkie.length, 18);
    });

    describe('⚠️ RÓWNO progowi — nigdy „Zostało"', () => {
      for (const ch of st.wszystkie) {
        test(ch.id, () => {
          const html = st.buildCard(ch, ch.target, false, false);
          assert.equal(zostalo(html), null,
            ch.id + ': przy wartości równej progowi pokazuje „Zostało ' + zostalo(html) + '"');
          assert.ok(progOsiagniety(html), ch.id + ': brak potwierdzenia osiągnięcia progu');
        });
      }
    });

    describe('⚠️ POWYŻEJ progu — nigdy liczba ujemna', () => {
      for (const ch of st.wszystkie) {
        test(ch.id, () => {
          const html = st.buildCard(ch, ch.target + 1, false, false);
          const n = zostalo(html);
          assert.equal(n, null, ch.id + ': pokazuje „Zostało ' + n + '" mimo przekroczenia progu');
          assert.ok(progOsiagniety(html), ch.id + ': brak potwierdzenia osiągnięcia progu');
        });
      }
    });

    describe('PONIŻEJ progu — etykieta MA się pojawiać (kontrola negatywna)', () => {
      /* Bez tego wszystkie testy wyżej przechodziłyby również wtedy, gdyby
         etykieta zniknęła CAŁKIEM — czyli gdybyśmy zamiast naprawy usunęli
         funkcję, która działa poprawnie w 60-99% postępu.
         ⚠️ ETYKIETA MA WŁASNĄ BRAMKĘ `pct >= 60`. Przy progu 2 wartość 1 daje
            50%, więc etykieta się NIE pojawia — i to jest poprawne. Pierwsza
            wersja tego testu tego nie uwzględniała i oskarżała kod o błąd,
            którego nie było. Sprawdzamy więc zachowanie ZGODNE Z BRAMKĄ:
            powyżej 60% etykieta jest, poniżej jej nie ma. */
      for (const ch of st.wszystkie) {
        test(ch.id, () => {
          const brakuje = Math.max(1, Math.ceil(ch.target * 0.2));
          const val = ch.target - brakuje;
          const html = st.buildCard(ch, val, false, false);
          const pct = Math.min(100, Math.round(val / ch.target * 100));
          if (pct >= 60) {
            assert.equal(zostalo(html), brakuje,
              ch.id + ': przy ' + val + '/' + ch.target + ' powinno brakować ' + brakuje);
            assert.ok(zostalo(html) > 0, ch.id + ': etykieta niedodatnia poniżej progu');
          } else {
            assert.equal(zostalo(html), null,
              ch.id + ': etykieta poniżej bramki 60% (' + pct + '%) nie powinna się pokazać');
          }
          assert.ok(!progOsiagniety(html), ch.id + ': fałszywe „Próg osiągnięty" poniżej progu');
        });
      }
    });

    test('⚠️ przy progu 2 zachęta jest NIEOSIĄGALNA — udokumentowane, nie naprawiane', () => {
      /* `weekend_runner` i `szybki_tydzien` mają target 2: 0/2 = 0%, 1/2 = 50%,
         oba poniżej bramki 60%. Zachęta „Zostało 1" nie pojawi się dla nich
         NIGDY. To ta sama klasa co martwa gałąź progu samopoczucia
         (.ai/LEKCJE.md — gałąź, która nigdy się nie wykonuje). Test tego
         PILNUJE, żeby zmiana bramki albo progu nie przeszła niezauważona. */
      const male = st.wszystkie.filter((c) => c.target <= 2);
      assert.ok(male.length > 0, 'brak wyzwań z progiem <= 2 — zmieniła się definicja');
      for (const ch of male) {
        for (let v = 0; v < ch.target; v++) {
          assert.equal(zostalo(st.buildCard(ch, v, false, false)), null,
            ch.id + ' @ ' + v + '/' + ch.target + ' — zachęta jednak się pojawiła (bramka 60% zmieniona?)');
        }
      }
    });

    test('⚠️ PRÓG 2, POSTĘP 1 — znana własność, nie odkrycie', () => {
      /* Przypadek, ktorego pierwsza wersja tego testu nie miala i przez to
         oskarzyla kod o blad, ktorego nie bylo. `weekend_runner` i „Dwa akcenty"
         maja prog 2: 1/2 = 50%, ponizej bramki `pct >= 60`. Zachęta „Zostało 1"
         NIE POJAWI SIE dla nich nigdy — ani przy 0, ani przy 1.
         To ta sama klasa co martwe galezie progu samopoczucia: galaz, ktora
         nigdy sie nie wykonuje, wyglada w kodzie jak dzialajaca.
         ⚠️ Test UTRWALA to jako wlasnosc znana, zeby nie odkrywac jej co pol
            roku — i PADNIE, gdy ktos ruszy bramke 60% albo prog wyzwania,
            czyli dokladnie wtedy, gdy trzeba to przemyslec ponownie. */
      const male = st.wszystkie.filter((c) => c.target === 2);
      assert.ok(male.length >= 2, 'wyzwan z progiem 2 jest ' + male.length + ' — zmienily sie definicje');
      for (const ch of male) {
        const h0 = st.buildCard(ch, 0, false, false);
        const h1 = st.buildCard(ch, 1, false, false);
        assert.equal(zostalo(h0), null, ch.id + ' @ 0/2 — zachęta jednak sie pojawila');
        assert.equal(zostalo(h1), null, ch.id + ' @ 1/2 (50%) — zachęta jednak sie pojawila (bramka 60% zmieniona?)');
        assert.ok(!progOsiagniety(h1), ch.id + ' @ 1/2 — falszywe „Prog osiagniety"');
        /* a przy 2/2 karta MA cos powiedziec — inaczej ten test przechodzilby
           tez wtedy, gdyby etykiety zniknely calkiem */
        assert.ok(progOsiagniety(st.buildCard(ch, 2, false, false)), ch.id + ' @ 2/2 — brak potwierdzenia');
      }
    });

    test('odznaka przyznana → żadnej etykiety, nawet powyżej progu', () => {
      for (const ch of st.wszystkie) {
        const html = st.buildCard(ch, ch.target + 5, true, false);
        assert.equal(zostalo(html), null, ch.id);
        assert.ok(!progOsiagniety(html), ch.id + ': „Próg osiągnięty" mimo posiadanej odznaki');
      }
    });

    test('⚠️ zero postępu nie udaje osiągnięcia', () => {
      /* `prog` bywa `undefined`, gdy wyzwanie nie ma jeszcze policzonego
         postępu — `(prog||0) >= target` musi wtedy dać fałsz, a nie NaN. */
      for (const ch of st.wszystkie) {
        for (const pusty of [0, undefined, null]) {
          const html = st.buildCard(ch, pusty, false, false);
          assert.ok(!progOsiagniety(html), ch.id + ' przy prog=' + pusty);
        }
      }
    });
  });
}

describe('⚠️ obie kopie karty zachowują się TAK SAMO', () => {
  /* Kod wyzwań żyje w dwóch plikach. Naprawa jednego i przeoczenie drugiego
     jest dokładnie tym, co się tu wydarzyło za pierwszym razem. */
  const a = stanowisko(PLIKI[0]);
  const b = stanowisko(PLIKI[1]);

  test('te same wyzwania w obu plikach', () => {
    assert.deepEqual(a.wszystkie.map((c) => c.id + ':' + c.target),
                     b.wszystkie.map((c) => c.id + ':' + c.target));
  });

  test('ta sama etykieta dla tych samych danych', () => {
    for (const ch of a.wszystkie) {
      for (const val of [0, ch.target - 1, ch.target, ch.target + 1]) {
        const ha = a.buildCard(ch, val, false, false);
        const hb = b.buildCard(ch, val, false, false);
        assert.equal(zostalo(ha), zostalo(hb), ch.id + ' @ ' + val + ' — „Zostało" różni się między plikami');
        assert.equal(progOsiagniety(ha), progOsiagniety(hb), ch.id + ' @ ' + val + ' — „Próg osiągnięty" różni się');
      }
    }
  });
});
