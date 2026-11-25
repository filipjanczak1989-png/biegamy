// Blizna #372 (25.11.2026) — pogoda: 401 z get-weather nie chowa już kafla po cichu.
//
// Rano 25.11 funkcja get-weather odpowiedziała 401 przy otwarciu aplikacji po przerwie. Stary kod (zawodnik.html
// loadWeather, kalendarz.html loadCalendarWeather) robił console.warn i chował kafel: bez ponowienia i bez śladu
// (console.* nie trafia do client_errors, więc nie dało się ustalić ani daty, ani skali, ani kto odrzucił token).
// Teraz: przy 401 JEDNO odświeżenie sesji i JEDNO ponowienie nowym tokenem; każda porażka → client_errors,
// kind 'pogoda', w treści sam etap z listy, adres strony bez parametrów, każdy etap raz na załadowanie strony.
// '401-bramka' (odpowiedź z polem code) i '401-funkcja' (bez niego) mówią, kto odrzucił.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '');
const ZAW = czytaj('zawodnik.html');
const KAL = czytaj('kalendarz.html');
const MIASTO = 'Kostrzyn';
const FN = 'https://projekt.test/functions/v1';
const ETAPY = ['brak-sesji', '401-bramka', '401-funkcja', 'odswiezenie-nieudane', '401-po-odswiezeniu', 'http-4xx', 'http-5xx', 'miasto-nieznane', 'odpowiedz-bez-ok', 'siec'];

function wytnij(zrodlo, od, doK, co) {
  const a = zrodlo.indexOf(od), b = zrodlo.indexOf(doK, a);
  assert.ok(a > 0 && b > a, 'brak bloku: ' + co);
  return zrodlo.slice(a, b);
}
const BLOK_ZAW = wytnij(ZAW, 'window.loadWeather = async function()', 'window._renderWeather = function', 'loadWeather w zawodnik.html');
const BLOK_KAL = wytnij(KAL, 'async function loadCalendarWeather()', '// ── SMART SUGGEST', 'loadCalendarWeather w kalendarz.html');

const OK = { status: 200, body: { ok: true, city: MIASTO, days: [{ date: '2026-11-25', icon: 'x', temp_max: 4, is_bad: false, weather_code: 3, cloud_pct: 80 }] } };
const BRAMKA = { status: 401, body: { code: 'UNAUTHORIZED_INVALID_JWT_FORMAT', message: 'Invalid JWT' } };
const FUNKCJA = { status: 401, body: { error: 'Niezalogowany' } };

/** Wspólne atrapy: sieć z kolejką odpowiedzi, sesja, odświeżenie, logger. */
function swiat({ odpowiedzi = [OK], sesja = { access_token: 'stary', user: { id: 'u1' } }, odswiezenie = 'ok', online = true, logger = true, strona = '/zawodnik.html' } = {}) {
  const s = { wolania: [], odswiezen: 0, wpisy: [], narysowano: [], pamiec: new Map() };
  s.fetch = async (adres, opcje) => {
    s.wolania.push({ adres, token: String(opcje.headers.Authorization || '').replace('Bearer ', ''), tresc: JSON.parse(opcje.body) });
    const o = odpowiedzi[Math.min(s.wolania.length - 1, odpowiedzi.length - 1)];
    if (o === 'siec') throw new TypeError('Failed to fetch');
    return { status: o.status, ok: o.status >= 200 && o.status < 300, json: async () => { if (o.body === 'nie-json') throw new SyntaxError('x'); return o.body; } };
  };
  const zapytanie = { select: () => zapytanie, eq: () => zapytanie, maybeSingle: async () => ({ data: { city: MIASTO } }) };
  s.sb = {
    from: () => zapytanie,
    auth: {
      getSession: async () => ({ data: { session: sesja } }),
      refreshSession: async () => {
        s.odswiezen++;
        if (odswiezenie === 'rzuca') throw new Error('sieć');
        if (odswiezenie === 'blad') return { data: { session: null }, error: { message: 'Invalid Refresh Token' } };
        return { data: { session: { access_token: 'nowy' } }, error: null };
      },
    },
  };
  s.kafel = { style: { display: '' }, innerHTML: '' };
  s.window = { SB_FN_URL: FN, _currentSection: 'home' };
  if (logger) s.window._logKlienta = (o) => { s.wpisy.push(o); };
  s.navigator = { onLine: online };
  s.location = { pathname: strona, search: '?tab=forma&miasto=' + MIASTO };
  s.sessionStorage = { getItem: (k) => (s.pamiec.has(k) ? s.pamiec.get(k) : null), setItem: (k, v) => { s.pamiec.set(k, v); }, length: 0, key: () => null };
  s.etapy = () => s.wpisy.map((w) => w.message);
  return s;
}
function zawodnik(opcje) {
  const s = swiat(opcje);
  const document = { getElementById: (id) => (id === 'weather-widget' ? s.kafel : null) };
  new Function('window', 'sb', 'document', 'sessionStorage', 'navigator', 'location', 'fetch', '_athleteId', '_renderWeather', BLOK_ZAW)(
    s.window, s.sb, document, s.sessionStorage, s.navigator, s.location, s.fetch, 'a1', (d) => { s.narysowano.push(d); });
  s.laduj = () => s.window.loadWeather();
  return s;
}
function kalendarz(opcje) {
  const s = swiat(Object.assign({ strona: '/kalendarz.html' }, opcje));
  s.window._calWeatherMap = {};
  let rysowan = 0;
  const f = new Function('window', 'sb', 'sessionStorage', 'navigator', 'location', 'fetch', 'render', BLOK_KAL + '\nreturn loadCalendarWeather;')(
    s.window, s.sb, s.sessionStorage, s.navigator, s.location, s.fetch, () => { rysowan++; });
  s.laduj = f; s.rysowan = () => rysowan;
  return s;
}

test('(1) zwykłe wejście: jedno wywołanie tokenem z getSession, bez odświeżania, bez wpisu, kafel narysowany i zapamiętany', async () => {
  const s = zawodnik();
  await s.laduj();
  assert.deepEqual(s.wolania, [{ adres: FN + '/get-weather', token: 'stary', tresc: { city: MIASTO } }]);
  assert.equal(s.odswiezen, 0);
  assert.deepEqual(s.wpisy, []);
  assert.equal(s.narysowano.length, 1);
  assert.equal(s.narysowano[0].city, MIASTO);
  assert.ok(s.pamiec.has('weather:' + MIASTO.toLowerCase()), 'pamięć 30 min jak dotąd');
});

test('(2) 401 z bramki, potem 200: jedno odświeżenie, ponowienie NOWYM tokenem, kafel jest, jeden wpis 401-bramka', async () => {
  const s = zawodnik({ odpowiedzi: [BRAMKA, OK] });
  await s.laduj();
  assert.deepEqual(s.wolania.map((w) => w.token), ['stary', 'nowy']);
  assert.equal(s.odswiezen, 1);
  assert.equal(s.narysowano.length, 1, 'po ponowieniu kafel narysowany');
  assert.notEqual(s.kafel.style.display, 'none');
  assert.deepEqual(s.wpisy, [{ kind: 'pogoda', message: '401-bramka', url: '/zawodnik.html' }], 'dokładnie jeden wpis, tylko te pola');
});

test('(3) 401 z samej funkcji (odpowiedź bez pola code) → etap 401-funkcja', async () => {
  const s = zawodnik({ odpowiedzi: [FUNKCJA, OK] });
  await s.laduj();
  assert.deepEqual(s.etapy(), ['401-funkcja']);
  assert.equal(s.narysowano.length, 1);
  const bezTresci = zawodnik({ odpowiedzi: [{ status: 401, body: 'nie-json' }, OK] });
  await bezTresci.laduj();
  assert.deepEqual(bezTresci.etapy(), ['401-funkcja'], '401 bez czytelnej treści liczy się jak odmowa funkcji i nie wywraca ponowienia');
  assert.equal(bezTresci.narysowano.length, 1);
});

test('(4) 401 dwa razy: dokładnie dwa wywołania i jedno odświeżenie (bez pętli), dwa wpisy, kafel schowany, nic w pamięci', async () => {
  const s = zawodnik({ odpowiedzi: [BRAMKA, BRAMKA, OK] });
  await s.laduj();
  assert.equal(s.wolania.length, 2, 'trzeciego wywołania nie ma');
  assert.equal(s.odswiezen, 1);
  assert.deepEqual(s.etapy(), ['401-bramka', '401-po-odswiezeniu']);
  assert.equal(s.narysowano.length, 0);
  assert.equal(s.kafel.style.display, 'none');
  assert.equal(s.pamiec.size, 0);
});

test('(5) odświeżenie sesji nie daje tokenu (błąd albo wyjątek): bez drugiego wywołania, wpis odswiezenie-nieudane', async () => {
  for (const odswiezenie of ['blad', 'rzuca']) {
    const s = zawodnik({ odpowiedzi: [BRAMKA, OK], odswiezenie });
    await s.laduj();
    assert.equal(s.wolania.length, 1, odswiezenie + ': nie wołamy bez nowego tokenu');
    assert.deepEqual(s.etapy(), ['401-bramka', 'odswiezenie-nieudane'], odswiezenie);
    assert.equal(s.kafel.style.display, 'none');
  }
});

test('(6) brak sesji: funkcja nie jest wołana, wpis brak-sesji, kafel schowany', async () => {
  const s = zawodnik({ sesja: null });
  await s.laduj();
  assert.equal(s.wolania.length, 0);
  assert.equal(s.odswiezen, 0);
  assert.deepEqual(s.etapy(), ['brak-sesji']);
  assert.equal(s.kafel.style.display, 'none');
});

test('(7) pozostałe porażki mają własny etap i nie odświeżają sesji', async () => {
  const przypadki = [
    [{ status: 500, body: { ok: false, _error: 'forecast_api_error' } }, 'http-5xx'],
    [{ status: 400, body: { ok: false, _error: 'invalid_city' } }, 'http-4xx'],
    [{ status: 200, body: { ok: false, _error: 'city_not_found', city_query: MIASTO } }, 'miasto-nieznane'],
    [{ status: 200, body: { ok: false } }, 'odpowiedz-bez-ok'],
    [{ status: 200, body: 'nie-json' }, 'odpowiedz-bez-ok'],
    ['siec', 'siec'],
  ];
  for (const [odp, etap] of przypadki) {
    const s = zawodnik({ odpowiedzi: [odp] });
    await s.laduj();
    assert.deepEqual(s.etapy(), [etap], etap);
    assert.equal(s.odswiezen, 0, etap + ': odświeżenie tylko przy 401');
    assert.equal(s.wolania.length, 1, etap);
    assert.equal(s.narysowano.length, 0, etap);
    assert.equal(s.kafel.style.display, 'none', etap);
  }
});

test('(8) zgłoszenia: raz na etap na stronę, nic offline, bez loggera bez wyjątku, tylko etapy z listy, bez miasta i parametrów adresu', async () => {
  const s = zawodnik({ odpowiedzi: [BRAMKA, BRAMKA] });
  await s.laduj(); await s.laduj(); await s.laduj();
  assert.deepEqual(s.etapy(), ['401-bramka', '401-po-odswiezeniu'], 'trzy nieudane wejścia, dalej po jednym wpisie na etap');
  assert.equal(s.wolania.length, 6, 'ponawianie działa przy każdym wejściu, tylko zgłoszenie jest jednorazowe');

  const offline = zawodnik({ odpowiedzi: ['siec'], online: false });
  await offline.laduj();
  assert.deepEqual(offline.wpisy, [], 'offline: zero wpisów');

  const bez = zawodnik({ odpowiedzi: [BRAMKA, BRAMKA], logger: false });
  await assert.doesNotReject(bez.laduj());
  assert.equal(bez.kafel.style.display, 'none');

  assert.deepEqual(s.window._pogodaEtapy, ETAPY);
  const czysty = zawodnik();
  for (const zly of ['', MIASTO, '401', 'http-500', '401-bramka ' + MIASTO, undefined, 'https://projekt.test/functions/v1/get-weather']) czysty.window._pogodaZglos(zly);
  assert.deepEqual(czysty.wpisy, [], 'spoza listy nic nie idzie');
  for (const e of ETAPY) czysty.window._pogodaZglos(e);
  assert.equal(czysty.wpisy.length, ETAPY.length);
  for (const w of czysty.wpisy) {
    assert.deepEqual(Object.keys(w).sort(), ['kind', 'message', 'url']);
    assert.equal(w.kind, 'pogoda'); assert.equal(w.url, '/zawodnik.html');
    assert.ok(JSON.stringify(w).indexOf(MIASTO) < 0 && JSON.stringify(w).indexOf('?') < 0, 'bez miasta i bez parametrów adresu');
  }
});

test('(9) kalendarz: ta sama reguła — 401 → jedno odświeżenie i ponowienie nowym tokenem, wpis z adresem /kalendarz.html', async () => {
  const s = kalendarz({ odpowiedzi: [BRAMKA, OK] });
  await s.laduj();
  assert.deepEqual(s.wolania.map((w) => w.token), ['stary', 'nowy']);
  assert.deepEqual(s.wolania[1].tresc, { city: MIASTO, days: 7 }, 'kalendarz dalej prosi o 7 dni');
  assert.equal(s.odswiezen, 1);
  assert.deepEqual(s.wpisy, [{ kind: 'pogoda', message: '401-bramka', url: '/kalendarz.html' }]);
  assert.ok(s.window._calWeatherMap['2026-11-25'], 'mapa pogody wypełniona po ponowieniu');
  assert.equal(s.rysowan(), 1);

  const dwa = kalendarz({ odpowiedzi: [FUNKCJA, FUNKCJA] });
  await dwa.laduj(); await dwa.laduj();
  assert.equal(dwa.wolania.length, 4, 'dwa wejścia po dwa wywołania, bez pętli');
  assert.deepEqual(dwa.etapy(), ['401-funkcja', '401-po-odswiezeniu'], 'raz na etap także w kalendarzu');
  assert.equal(dwa.rysowan(), 0);

  const zle = kalendarz({ odpowiedzi: [BRAMKA, OK], odswiezenie: 'blad' });
  await zle.laduj();
  assert.equal(zle.wolania.length, 1);
  assert.deepEqual(zle.etapy(), ['401-bramka', 'odswiezenie-nieudane']);

  for (const [odp, etap] of [[{ status: 500, body: { ok: false } }, 'http-5xx'], [{ status: 200, body: { ok: false, _error: 'city_not_found' } }, 'miasto-nieznane'], [{ status: 200, body: { ok: true } }, 'odpowiedz-bez-ok']]) {
    const k = kalendarz({ odpowiedzi: [odp] });
    await k.laduj();
    assert.deepEqual(k.etapy(), [etap], 'kalendarz: ' + etap);
    assert.equal(k.rysowan(), 0);
  }
  const offline = kalendarz({ odpowiedzi: [BRAMKA, BRAMKA], online: false });
  await offline.laduj();
  assert.deepEqual(offline.wpisy, []);
});

test('(10) źródła: jedno refreshSession na ścieżkę, etapy kalendarza z listy zawodnika, stary console.warn zdjęty', () => {
  assert.equal(BLOK_ZAW.split('refreshSession(').length - 1, 1, 'zawodnik.html: dokładnie jedno odświeżenie w kodzie pogody');
  assert.equal(BLOK_KAL.split('refreshSession(').length - 1, 1, 'kalendarz.html: dokładnie jedno odświeżenie w kodzie pogody');
  assert.ok(!/\b(while|for)\s*\(/.test(wytnij(ZAW, 'window._pogodaPobierz = async function', 'window._renderWeather = function', '_pogodaPobierz')), 'pobranie bez pętli');
  const etapyKal = [...BLOK_KAL.matchAll(/'((?:401|http|brak|odswiezenie|miasto|odpowiedz|siec)[a-z0-9-]*)'/g)].map((m) => m[1]);
  assert.ok(etapyKal.length >= 6, 'kalendarz zgłasza etapy');
  for (const e of etapyKal) assert.ok(ETAPY.includes(e), 'etap kalendarza spoza listy: ' + e);
  assert.ok(ZAW.indexOf("console.warn('[weather] EF error") < 0, 'porażka idzie do client_errors, nie do samej konsoli');
  assert.ok(/kind: 'pogoda', message: etap, url: location\.pathname \}/.test(BLOK_ZAW) && /kind: 'pogoda', message: etap, url: location\.pathname \}/.test(BLOK_KAL), 'w zgłoszeniu sam etap i sama ścieżka');
});
