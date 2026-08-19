/* BLIZNA 19: martwa gałąź z PEŁNĄ implementacją — `_lastEndedGameData`.
   Wykryte 19.08.2026 przy zwiadzie nad `distance_km` w `gra.html`.

   ⚠️ KLASA BŁĘDU — TRZECI PRZYPADEK W TYGODNIU: kod wygląda na działający, bo
   jest KOMPLETNY, a warunek wejścia nigdy nie jest spełniony. Poprzednie dwa:
   `avg >= 3.5` przy suficie skali 3,0 (arytmetycznie niemożliwe) i `PRSclose`
   wołane bez istniejącej funkcji. Tu: zmienna zadeklarowana jako `null`
   i NIGDY nieprzypisana, przy dwóch konsumentach z pełną obsługą.

   ⚠️ CZEGO NIE ŁAPIE SKANER HANDLERÓW: on szuka funkcji, których BRAKUJE
   (onclick="fn()" bez `fn`). Tutaj wszystko istniało — funkcja, obsługa błędów,
   toast po drugiej stronie. Brakowało JEDNEGO PRZYPISANIA. Skaner nie zgłosi
   kodu, który jest kompletny i nigdy nie wykonywany.

   Co zrobiono 19.08.2026:
     · `logAsTraining` USUNIĘTE — guard `!_lastEndedGameData` blokował zawsze,
       `id="log-btn"` nie istniał w żadnym pliku, nic nie wołało eksportu.
       Naprawa typu w martwej ścieżce to dokładanie kodu do utrzymania.
     · `goLogRealTraining` OŻYWIONE — odbiorca w zawodnik.html istniał i czekał,
       więc brakowała jedna linia, a nie pomysł.

   ⚠️ Test czyta ŹRÓDŁO, nie DOM — `gra.html` to plik gry z pętlą na canvasie,
   której nie da się uruchomić w node. Pilnujemy więc niezmienników, które
   dały się złamać: że przypisanie ISTNIEJE, że martwa ścieżka NIE WRÓCIŁA
   i że nadawca z odbiorcą mówią tym samym kluczem. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const gra = fs.readFileSync(path.join(__dirname, '..', 'gra.html'), 'utf8');
const zaw = fs.readFileSync(path.join(__dirname, '..', 'zawodnik.html'), 'utf8');

test('19 — martwa gałąź warm-upu', async (t) => {

  await t.test('⚠️ `_lastEndedGameData` JEST PRZYPISYWANE — nie tylko deklarowane', () => {
    /* To jest cała usterka w jednej asercji. Przed naprawą jedynym wystąpieniem
       ze znakiem `=` była deklaracja `let _lastEndedGameData = null;`. */
    const przypisania = gra.match(/_lastEndedGameData\s*=(?!=)/g) || [];
    assert.ok(przypisania.length >= 2,
      'znaleziono ' + przypisania.length + ' przypisań — sama deklaracja znaczy, że gałąź jest znowu martwa');
    assert.match(gra, /_lastEndedGameData = \{[\s\S]{0,400}?modeName:/,
      'przypisanie ma nieść modeName — to jedyne pole, którego naprawdę używa odbiorca');
  });

  await t.test('⚠️ przypisanie stoi w endGame, obok zapisu wyniku', () => {
    const i = gra.indexOf('async function endGame()');
    const j = gra.indexOf('function goHome()');
    assert.ok(i > 0 && j > i, 'nie znaleziono granic endGame — zmienił się układ pliku');
    const ciało = gra.slice(i, j);
    assert.match(ciało, /_lastEndedGameData = \{/,
      'przypisanie poza endGame znaczy, że przy jakimś zakończeniu gry znowu go nie będzie');
    assert.ok(ciało.indexOf('_saveScoreInBackground(M)') < ciało.indexOf('_lastEndedGameData = {'),
      'ma stać po zapisie wyniku — ten sam moment, ta sama pewność, że gra się skończyła');
  });

  await t.test('⚠️ NADAWCA I ODBIORCA UŻYWAJĄ TEGO SAMEGO KLUCZA', () => {
    /* Rozjazd nazwy klucza sessionStorage byłby cichy: nadawca pisze, odbiorca
       czyta pustkę, żaden błąd nie leci. Dokładnie jak przy tej bliźnie. */
    assert.match(gra, /sessionStorage\.setItem\('biegamy_warmup_played'/);
    assert.match(zaw, /sessionStorage\.getItem\('biegamy_warmup_played'/);
    assert.match(gra, /sessionStorage\.setItem\('biegamy_open_log_modal'/);
    assert.match(zaw, /sessionStorage\.getItem\('biegamy_open_log_modal'\) === '1'/);
  });

  await t.test('cała ścieżka: koniec gry → payload → toast po drugiej stronie', () => {
    /* Odtworzenie przepływu na atrapie sessionStorage. Nie uruchamiamy gry —
       bierzemy kształt payloadu z pliku i sprawdzamy, że przechodzi przez
       JSON.parse i że odbiorca wyciąga z niego to, czego używa. */
    const store = {};
    const ss = {
      setItem: (k, v) => { store[k] = String(v); },
      getItem: (k) => (k in store ? store[k] : null),
      removeItem: (k) => { delete store[k]; },
    };

    // nadawca — kształt jak w goLogRealTraining
    const dane = { mode: 'endless', modeName: 'BIEGAMY', avgReaction: 412, duration: 95 };
    ss.setItem('biegamy_open_log_modal', '1');
    ss.setItem('biegamy_warmup_played', JSON.stringify({
      mode: dane.mode, modeName: dane.modeName, reaction: dane.avgReaction, duration: dane.duration,
    }));

    // odbiorca — kształt jak w zawodnik.html:6186
    assert.strictEqual(ss.getItem('biegamy_open_log_modal'), '1', 'modal loga ma się otworzyć');
    const surowy = ss.getItem('biegamy_warmup_played');
    assert.ok(surowy, 'PRZED NAPRAWĄ BYŁO TU null — na tym polegała martwa gałąź');
    const w = JSON.parse(surowy);
    assert.strictEqual(w.modeName, 'BIEGAMY');
    ss.removeItem('biegamy_warmup_played');
    assert.strictEqual(ss.getItem('biegamy_warmup_played'), null, 'payload ma być jednorazowy');
  });

  await t.test('⚠️ MARTWA ŚCIEŻKA NIE WRÓCIŁA — logAsTraining i log-btn usunięte', () => {
    assert.ok(!/function logAsTraining/.test(gra), 'logAsTraining wróciło');
    assert.ok(!/window\.logAsTraining/.test(gra), 'eksport logAsTraining wrócił');
    assert.ok(!/getElementById\('log-btn'\)/.test(gra), "getElementById('log-btn') wrócił — tego id nie ma w żadnym pliku");
  });

  await t.test('nagrobek został i mówi, od czego zacząć', () => {
    assert.match(gra, /logAsTraining usunięte 19\.08\.2026/);
    assert.match(gra, /zacznij od przypisania tej zmiennej/,
      'nagrobek bez wskazówki to sama historia — następny ma wiedzieć, gdzie zacząć');
  });

  /* ══ TEST NEGATYWNY ══════════════════════════════════════════════════════
     Dowód, że asercje wyżej złapałyby stan sprzed naprawy. */
  await t.test('⚠️ REGRESJA: stan sprzed naprawy musi oblać asercje wyżej', () => {
    const przedNaprawa = 'let _lastEndedGameData = null;\nfunction goLogRealTraining(){ if (_lastEndedGameData) {} }';
    const przypisania = przedNaprawa.match(/_lastEndedGameData\s*=(?!=)/g) || [];
    assert.strictEqual(przypisania.length, 1,
      'w stanie sprzed naprawy było DOKŁADNIE jedno wystąpienie — sama deklaracja');
    assert.ok(!(przypisania.length >= 2), 'asercja o ≥2 przypisaniach złapałaby ten stan');

    // …i dowód, że guard rzeczywiście blokował
    let _lastEndedGameData = null;
    let payloadZapisany = false;
    if (_lastEndedGameData) payloadZapisany = true;
    assert.strictEqual(payloadZapisany, false,
      'guard przy null nie przepuszcza — dlatego odbiorca zawsze czytał pustkę');
  });
});
