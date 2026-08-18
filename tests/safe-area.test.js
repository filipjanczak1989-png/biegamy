// ─────────────────────────────────────────────────────────────────────────────
// SAFE-AREA — czy CSS pod wcięcie iPhone'a w ogóle DZIAŁA.
//
// BLIZNA: siedem stron używało `env(safe-area-inset-*)`, ale ich meta viewport
// nie miała `viewport-fit=cover`. Bez tego przeglądarka zwraca dla wcięć ZERO —
// więc cały ten CSS nie robił nic. Zmierzone 18.08.2026:
//     kalendarz.html 13 użyć · zawodnik.html 8 · trener.html 7
//     biegus 3 · radio 2 · odznaki 1 · wyzwania 1
// Trzy główne ekrany aplikacji. Wzorzec w repo istniał (profil, gra, nutrition,
// narzedzia, races, compare, wieza miały OBA) — po prostu ich nie objął.
//
// !! TO JEST KLASA „CSS, KTÓRY WYGLĄDA NA DZIAŁAJĄCY". Nic nie krzyczy: nie ma
//    błędu w konsoli, nie ma czerwonego testu, a na telefonie bez wcięcia
//    wszystko wygląda dobrze, bo tam inset i tak wynosi zero. Widać to WYŁĄCZNIE
//    na iPhonie z wcięciem — czyli u tej części ludzi, która najczęściej zgłasza
//    „rozjazdy" (iOS to 23 z 48 błędów View Transition w logach).
//
// !! TEST PILNUJE ZALEŻNOŚCI, NIE LISTY PLIKÓW. Nie wypisujemy stron z nazwy,
//    tylko sprawdzamy regułę: kto używa env(safe-area-inset), ten MUSI mieć
//    viewport-fit=cover. Nowa strona z safe-area wpadnie tu sama.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const KORZEN = path.join(__dirname, '..');
const strony = () => fs.readdirSync(KORZEN)
  .filter(f => f.endsWith('.html'))
  // pliki robocze i kopie zapasowe nie idą na produkcję
  .filter(f => !f.startsWith('_') && !/backup|pre-miasto/.test(f));

test('safe-area — kto z niej korzysta, ma viewport-fit=cover', () => {
  const zle = [];
  for (const f of strony()) {
    const s = fs.readFileSync(path.join(KORZEN, f), 'utf8');
    const uzyc = (s.match(/env\(safe-area-inset/g) || []).length;
    if (!uzyc) continue;
    const meta = s.match(/<meta\s+name="viewport"[^>]*>/i);
    assert.ok(meta, f + ' używa safe-area, ale NIE MA meta viewport');
    if (!/viewport-fit\s*=\s*cover/i.test(meta[0])) zle.push(f + ' (' + uzyc + ' użyć)');
  }
  assert.deepStrictEqual(zle, [],
    'strony z martwym CSS safe-area (inset zawsze 0): ' + zle.join(', '));
});

test('⚠️ test ma czego pilnować — safe-area faktycznie jest w użyciu', () => {
  /* Asercja o zerze. Gdyby ktoś kiedyś usunął całe safe-area z repo, test wyżej
     przechodziłby pusty i nikt by nie zauważył, że przestał cokolwiek mierzyć —
     ta sama pułapka co bramka zielona przez brak danych. */
  const ile = strony().reduce((n, f) =>
    n + (fs.readFileSync(path.join(KORZEN, f), 'utf8').match(/env\(safe-area-inset/g) || []).length, 0);
  assert.ok(ile >= 20, 'w repo jest tylko ' + ile + ' użyć safe-area — test przestał mieć sens');
});

test('meta viewport istnieje na każdej stronie produkcyjnej', () => {
  const brak = strony().filter(f =>
    !/<meta\s+name="viewport"/i.test(fs.readFileSync(path.join(KORZEN, f), 'utf8')));
  assert.deepStrictEqual(brak, [], 'strony bez meta viewport: ' + brak.join(', '));
});
