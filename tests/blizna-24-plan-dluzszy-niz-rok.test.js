// ─────────────────────────────────────────────────────────────────────────────
// BLIZNA 24 — PLAN DŁUŻSZY NIŻ ROK I STRONA, KTÓREJ NIKT NIE UMIAŁ UŻYĆ.
//
// Zgłoszenie Maćka z 23-24.08.2026, dwie sprawy z jednego wieczoru:
//
// 1. Generator nie miał ŻADNEGO sufitu tygodni. `tygodnie` szło wprost z daty
//    startu, więc przy zawodach za 520 tygodni oddawał 3634 wiersze i 816 kB
//    JSON-a. Bez błędu, bez ostrzeżenia — plan na dziesięć lat wyglądał jak plan.
//    !! POWÓD SUFITU NIE JEST TECHNICZNY: krzywa objętości planu 113-tygodniowego
//       osiąga szczyt w TYGODNIU 9, a potem 26 razy powtarza cykl 49/49/49/34.
//       Sufit nie odbiera niczego, co istniało — nazywa granicę, za którą silnik
//       i tak nic nowego nie mówi.
//
// 2. narzedzia.html — cztery kalkulatory, z których trzy nie umiały odczytać
//    wpisanego czasu. `autoColonTime` nie wstawia dwukropka poniżej 3 cyfr,
//    a `_parseTimeToSecs` zwraca null bez dwukropka, więc pole wyniku zostawało
//    puste i przez placeholder „6:00" wyglądało na policzone.
//    !! Strona usunięta 24.08.2026. Ten plik pilnuje, żeby nie wróciła bokiem.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../js/generator-planu.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');

const TODAY = '2026-08-24';
const IDX = G._dzienIdx(TODAY);
const zaTyg = (n) => G._isoZIdx(IDX + n * 7);

function plan(tygodni, opcje) {
  return G.uloz(Object.assign({
    dystans: 'half', dniWTygodniu: 5, dataStartu: zaTyg(tygodni), today: TODAY,
    poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 21 }, celCzasowy: null
  }, opcje || {}));
}

test('SUFIT 52 TYGODNI', async (t) => {
  await t.test('MAX_TYGODNI jest wystawione — klient nie ma go przepisywać', () => {
    assert.strictEqual(G.LIMITY.MAX_TYGODNI, 52);
  });

  await t.test('poniżej sufitu plan zachowuje pełną długość', () => {
    for (const h of [16, 40, 51, 52]) {
      const r = plan(h);
      assert.strictEqual(r.ok, true, 'horyzont ' + h);
      assert.strictEqual(r.meta.tygodnie, h, 'horyzont ' + h + ' skrócony bez powodu');
      assert.strictEqual(r.startOdroczony, null, 'horyzont ' + h + ' odroczony bez powodu');
    }
  });

  await t.test('powyżej sufitu plan ma dokładnie 52 tygodnie', () => {
    for (const h of [53, 61, 113, 150, 520]) {
      const r = plan(h);
      assert.strictEqual(r.ok, true, 'horyzont ' + h);
      assert.strictEqual(r.meta.tygodnie, 52, 'horyzont ' + h);
    }
  });

  /* ⚠️ TO JEST CAŁA RÓŻNICA MIĘDZY „SKRÓCENIEM" A „COFNIĘCIEM".
     Plan przycięty od końca kończyłby się rok przed zawodami i taper wypadałby
     w próżni. Kotwicą jest data startu — plan ma się KOŃCZYĆ na zawodach. */
  await t.test('⚠️ plan KOŃCZY SIĘ w dniu zawodów, niezależnie od horyzontu', () => {
    for (const h of [16, 52, 53, 61, 113, 150, 520]) {
      const r = plan(h);
      assert.strictEqual(r.plan.end_date, zaTyg(h),
        'horyzont ' + h + ': plan kończy się ' + r.plan.end_date + ', a zawody są ' + zaTyg(h));
    }
  });

  await t.test('przesunięcie to dokładnie nadmiar ponad 52', () => {
    for (const h of [53, 61, 113, 150]) {
      const r = plan(h);
      assert.strictEqual(r.startOdroczony.tygodni, h - 52, 'horyzont ' + h);
      assert.strictEqual(r.startOdroczony.tygodnieDoStartu, h, 'horyzont ' + h);
    }
  });

  /* Przesunięcie idzie o wielokrotność 7 dni, więc start zostaje poniedziałkiem.
     Gdyby kiedyś ktoś przesunął o „resztę dni", cały układ tygodnia (UKLAD_DNI,
     długie w niedzielę) rozjechałby się cicho. */
  await t.test('⚠️ start planu zostaje PONIEDZIAŁKIEM po cofnięciu', () => {
    for (const h of [53, 61, 113, 150, 520]) {
      const d = new Date(G._dzienIdx(plan(h).plan.start_date) * 86400000);
      assert.strictEqual(d.getUTCDay(), 1, 'horyzont ' + h + ' zaczyna się nie w poniedziałek');
    }
  });

  await t.test('taper nie wypada w próżni — ostatni tydzień jest najlżejszy', () => {
    const r = plan(113);
    const obj = r.meta.objetosciFaktyczne;
    const szczyt = Math.max.apply(null, obj);
    assert.ok(obj[obj.length - 2] < szczyt * 0.8,
      'tydzień przed startem (' + obj[obj.length - 2] + ') nie jest taperem przy szczycie ' + szczyt);
  });

  /* Rozmiar payloadu do bazy — dwa nierozbite .insert() w zawodnik.html.
     Sufit ma go trzymać w ryzach; bez niego 113 tygodni dawało 785 wierszy. */
  await t.test('⚠️ liczba wierszy przestaje rosnąć z horyzontem', () => {
    const maly = plan(113).treningi.length;
    const wielki = plan(520).treningi.length;
    assert.strictEqual(maly, wielki, 'wiersze nadal rosną z datą startu');
    assert.ok(maly <= 366, 'plan 52-tygodniowy ma ' + maly + ' wierszy — więcej niż rok dni');
  });
});

test('ODROCZONY START MUSI NIEŚĆ WYJŚCIE', async (t) => {
  /* Ta sama zasada co przy R1/R2/R5, tylko trudniejsza: to NIE jest odmowa.
     Człowiek widzi zielone „Plan gotowy · 52 TYGODNI" i bez tego bloku wychodzi
     przekonany, że ma co robić od jutra. Ma — dopiero za 98 tygodni. */
  await t.test('komunikat mówi KIEDY plan rusza — konkretną datą', () => {
    const r = plan(150);
    assert.match(r.startOdroczony.komunikat, /rusza \d{1,2} \p{Ll}+ \d{4}/u);
    assert.strictEqual(r.startOdroczony.data, r.plan.start_date);
  });

  await t.test('komunikat mówi, CO ROBIĆ do tego czasu', () => {
    assert.match(plan(150).startOdroczony.komunikat, /nie stracić tego, co już biegasz/);
  });

  await t.test('komunikat mówi, DLACZEGO plan jest krótszy niż horyzont', () => {
    const k = plan(150).startOdroczony.komunikat;
    assert.match(k, /Do startu jest 150 tyg/);
    assert.match(k, /najdłuższy plan, jaki układam, to 52/);
  });

  /* ⚠️ ŚCIEŻKA NIE MOŻE PROWADZIĆ W TĘ SAMĄ DATĘ. Krótszy dystans przy starcie
     za 150 tygodni zostanie cofnięty dokładnie tak samo — przycisk prowadziłby
     do drugiego odroczenia. `najblizszyTeraz` pyta o dystans przy NAJBLIŻSZYM
     możliwym starcie, nie przy tym, który człowiek wpisał. */
  await t.test('⚠️ wskazany dystans NAPRAWDĘ przechodzi przy bliskim starcie', () => {
    const r = plan(150);
    const dyst = r.startOdroczony.sciezkaDystans;
    assert.ok(dyst, 'brak ścieżki przy bazie, która przechodzi');
    assert.ok(G.DYSTANSE[dyst].km < G.DYSTANSE.half.km, 'ścieżka prowadzi na dystans nie krótszy od celu');

    /* ⚠️ SPRAWDZAMY OKNO, NIE JEDEN HORYZONT — i to jest ta sama pomyłka, którą
       popełniał sam silnik do 24.08.2026. `minTygodni` to minimum METODYCZNE;
       przy bazie 21 dziesiątka na 8 tygodni odbija się o SKOK_OBJETOSCI, a na
       12 powstaje. Test na jednym horyzoncie orzekłby „ścieżka kłamie", choć
       prowadzi do planu, który naprawdę da się ułożyć. */
    const przechodzi = [8, 12, 16, 20, 26].filter((h) => {
      const p = G.uloz({
        dystans: dyst, dniWTygodniu: 5, dataStartu: zaTyg(h), today: TODAY,
        poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 21 }, celCzasowy: null
      });
      return p.ok && p.startOdroczony === null;
    });
    assert.ok(przechodzi.length > 0,
      'ścieżka prowadzi w odmowę na KAŻDYM starcie do pół roku — przycisk kłamie');
  });

  /* Plan liczy się z DZISIEJSZEJ objętości, a rusza za wiele tygodni. Silnik
     nie ma jak wiedzieć, co człowiek będzie biegał wtedy — ma o tym powiedzieć. */
  await t.test('⚠️ założenie o nieaktualnej bazie jest WYPOWIEDZIANE', () => {
    const zal = plan(150).meta.zalozenia.join(' ');
    assert.match(zal, /policzony jest z dzisiejszej objętości/);
    assert.match(zal, /ułóż go wtedy jeszcze raz/);
  });

  await t.test('plan bez odroczenia nie dokłada tego założenia', () => {
    const zal = plan(40).meta.zalozenia.join(' ');
    assert.doesNotMatch(zal, /policzony jest z dzisiejszej objętości/);
  });
});

test('KLIENT RENDERUJE ODROCZENIE I JEGO PRZYCISK', async (t) => {
  const zaw = czytaj('zawodnik.html');

  await t.test('ekran wyniku czyta startOdroczony', () => {
    assert.match(zaw, /w\.startOdroczony/);
    assert.match(zaw, /Ten plan rusza później/);
  });

  await t.test('przycisk woła ścieżkę przez dataset, nie przez wklejony string', () => {
    assert.match(zaw, /data-dyst="'\s*\+\s*esc\(w\.startOdroczony\.sciezkaDystans\)/);
    assert.match(zaw, /onclick="genSciezkaBlizszyStart\(this\.dataset\.dyst\)"/);
  });

  /* ⚠️ RÓŻNICA WOBEC genSciezka JEST CAŁYM SENSEM TEJ FUNKCJI: nie układa planu
     od razu, tylko czyści datę i wraca do formularza. Data zmyślona przez silnik
     wpisałaby do kalendarza zawody, których nie ma (dzień startu niesie MARKER_STARTU). */
  await t.test('⚠️ ścieżka CZYŚCI datę i NIE układa planu od razu', () => {
    const fn = zaw.slice(zaw.indexOf('function genSciezkaBlizszyStart'));
    const cialo = fn.slice(0, fn.indexOf('\n}'));
    assert.match(cialo, /_genRaceDate = null/);
    assert.match(cialo, /di\.value = ''/);
    assert.match(cialo, /_genWrocDoFormularza\(\)/);
    assert.doesNotMatch(cialo, /genUlozPlan\(\)/, 'układa plan w tej samej dacie — drugie odroczenie');
  });

  await t.test('telemetria odróżnia plan odroczony od zwykłego', () => {
    assert.match(zaw, /odroczony_tyg: w\.startOdroczony\.tygodni/);
  });
});

test('⚠️ narzedzia.html USUNIĘTE — nie wraca bokiem', async (t) => {
  await t.test('plików nie ma', () => {
    assert.ok(!fs.existsSync(path.join(KORZEN, 'narzedzia.html')), 'narzedzia.html wróciło');
    assert.ok(!fs.existsSync(path.join(KORZEN, 'statystyki.html')), 'statystyki.html wróciło');
  });

  /* Martwy wpis w PRECACHE_URLS nie jest kosmetyką: install() robi addAll(),
     a addAll odrzuca CAŁĄ obietnicę, jeśli choć jeden URL zwróci 404 —
     czyli jeden martwy wpis wywraca instalację Service Workera w całości. */
  await t.test('⚠️ nie ma ich w PRECACHE_URLS — addAll padłby na 404', () => {
    const sw = czytaj('sw.js');
    const lista = sw.slice(sw.indexOf('PRECACHE_URLS'), sw.indexOf('];', sw.indexOf('PRECACHE_URLS')));
    assert.doesNotMatch(lista, /'\/narzedzia\.html'/);
    assert.doesNotMatch(lista, /'\/statystyki\.html'/);
  });

  await t.test('żadna strona nie linkuje do usuniętych plików', () => {
    for (const p of ['zawodnik.html', 'profil.html', 'trener.html', 'kalendarz.html', 'index.html']) {
      const s = czytaj(p);
      assert.doesNotMatch(s, /href="[^"]*narzedzia\.html/, p + ' linkuje do narzedzia.html');
      assert.doesNotMatch(s, /href="[^"]*statystyki\.html/, p + ' linkuje do statystyki.html');
      assert.doesNotMatch(s, /location\.href\s*=\s*'narzedzia\.html/, p + ' przekierowuje na narzedzia.html');
    }
  });

  await t.test('nagrobek stoi tam, skąd prowadził kafel', () => {
    const prof = czytaj('profil.html');
    assert.match(prof, /Kafel „Narzędzia" usunięty 24\.08\.2026/);
    assert.doesNotMatch(prof, /function goToStats/, 'goToStats wróciło');
    assert.doesNotMatch(prof, /onclick="goToStats\(\)"/, 'kafel wrócił');
  });
});
