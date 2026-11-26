// Blizna #390 (26.11.2026) — pogoda: miasto, którego funkcja nie zna, nie chowa już kafla bez słowa.
//
// Po poprawce 401 (blizna-372) jedyne zgłoszenia kind 'pogoda' to etap „miasto-nieznane”: konto ma w profilu małą wieś,
// której nie ma w bazie miejsc usługi pogodowej. Kafel pogody wtedy znikał i zawodnik nie wiedział, dlaczego.
// Teraz kafel zostaje z jednym zdaniem „Nie znam miasta „X”. Popraw w profilu ›” i odnośnikiem do miasta w ustawieniach profilu.
// Nazwa miasta to tekst wpisany przez człowieka: do strony wchodzi wyłącznie przez textContent. Zgłoszenie zostaje bez miasta.
// Kalendarz nic nie pokazuje (pogoda jest tam dodatkiem w siatce dni), tylko dalej zgłasza etap.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '');
const ZAW = czytaj('zawodnik.html'), KAL = czytaj('kalendarz.html'), PROFIL = czytaj('profil.html');
const a0 = ZAW.indexOf('window.loadWeather = async function()'), b0 = ZAW.indexOf('window._renderWeather = function', a0);
assert.ok(a0 > 0 && b0 > a0, 'brak bloku pogody w zawodnik.html');
const BLOK = ZAW.slice(a0, b0);
const FN = 'https://projekt.test/functions/v1';
const NIEZNANE = (m) => ({ status: 200, body: { ok: false, _error: 'city_not_found', _message: 'Nie znaleziono miasta "' + m + '"', city_query: m } });
const DOBRA = { status: 200, body: { ok: true, city: 'Kostrzyn', days: [] } };

/** Element strony w pigułce: liczy przypisania innerHTML (nie powinno być żadnego), tekst składa z własnego i dzieci. */
function element(tag, licznik) {
  const e = { tag, id: '', href: '', style: { cssText: '', display: '' }, dzieci: [], _t: '' };
  Object.defineProperty(e, 'textContent', { get() { return e._t + e.dzieci.map((d) => d.textContent).join(''); }, set(v) { e._t = String(v); e.dzieci = []; } });
  Object.defineProperty(e, 'innerHTML', { get() { return ''; }, set(v) { licznik.innerHTML.push(String(v)); } });
  e.appendChild = (d) => { e.dzieci.push(d); return d; };
  return e;
}
function strona({ miasto = 'Libartowo', odpowiedzi, sekcja = 'home', szkielet = true, idZawodnika = 'a1' } = {}) {
  const s = { wolania: 0, wpisy: [], narysowano: [], pamiec: new Map(), licznik: { innerHTML: [] }, sesja: { access_token: 't', user: { id: 'u1' } } };
  odpowiedzi = odpowiedzi || [NIEZNANE(miasto)];
  s.kafel = element('div', s.licznik); s.miasto = element('div', s.licznik); s.dni = element('div', s.licznik);
  const mapa = { 'weather-widget': s.kafel };
  if (szkielet) { mapa['weather-city'] = s.miasto; mapa['weather-days'] = s.dni; }
  const document = { getElementById: (id) => mapa[id] || null, createElement: (tag) => element(tag, s.licznik) };
  const fetch = async () => { const o = odpowiedzi[Math.min(s.wolania, odpowiedzi.length - 1)]; s.wolania++; if (o === 'siec') throw new TypeError('Failed to fetch'); return { status: o.status, ok: o.status >= 200 && o.status < 300, json: async () => o.body }; };
  const zapytanie = { select: () => zapytanie, eq: () => zapytanie, maybeSingle: async () => ({ data: { city: miasto } }) };
  const sb = { from: () => zapytanie, auth: { getSession: async () => ({ data: { session: s.sesja } }), refreshSession: async () => ({ data: { session: null }, error: { message: 'x' } }) } };
  s.window = { SB_FN_URL: FN, _currentSection: sekcja, _logKlienta: (o) => { s.wpisy.push(o); } };
  const sessionStorage = { getItem: (k) => (s.pamiec.has(k) ? s.pamiec.get(k) : null), setItem: (k, v) => { s.pamiec.set(k, v); } };
  new Function('window', 'sb', 'document', 'sessionStorage', 'navigator', 'location', 'fetch', '_athleteId', '_renderWeather', BLOK)(
    s.window, sb, document, sessionStorage, { onLine: true }, { pathname: '/zawodnik.html', search: '?x=1' }, fetch, idZawodnika, (d) => { s.narysowano.push(d); });
  s.laduj = () => s.window.loadWeather();
  s.odnosnik = () => s.dni.dzieci[0] || null;
  return s;
}

test('(1) miasto nieznane: kafel zostaje, jedno zdanie z nazwą miasta i odnośnik do miasta w profilu', async () => {
  const s = strona();
  await s.laduj();
  assert.equal(s.kafel.style.display, 'block', 'kafel pogody widoczny');
  assert.equal(s.dni.dzieci.length, 1);
  const a = s.odnosnik();
  assert.equal(a.tag, 'a'); assert.equal(a.id, 'weather-nieznane');
  assert.equal(a.textContent, 'Nie znam miasta „Libartowo”. Popraw w profilu ›');
  assert.equal(a.href, 'profil.html?id=a1&open=miasto');
  assert.equal(s.miasto.textContent, 'Libartowo', 'nagłówek kafla pokazuje wpisane miasto (dotknięcie otwiera zmianę miasta jak dotąd)');
  assert.deepEqual(s.narysowano, [], 'prognozy nie ma, więc nic się nie rysuje');
  assert.equal(s.pamiec.size, 0, 'odmowy nie zapamiętujemy: po poprawieniu miasta pogoda ma przyjść od razu');
});

test('(2) zgłoszenie zostaje: jeden wpis, sam etap, bez nazwy miasta i bez parametrów adresu', async () => {
  const s = strona();
  await s.laduj(); await s.laduj();
  assert.deepEqual(s.wpisy, [{ kind: 'pogoda', message: 'miasto-nieznane', url: '/zawodnik.html' }]);
  assert.ok(!JSON.stringify(s.wpisy).includes('Libartowo'));
  assert.equal(s.dni.dzieci.length, 1, 'drugie wczytanie nie dokłada drugiego komunikatu');
});

test('(3) nazwa miasta jest tekstem, nie kodem: znaczniki i cudzysłowy widać dosłownie, nic nie idzie przez innerHTML', async () => {
  const zle = '<img src=x onerror=alert(1)>"\'&';
  const s = strona({ miasto: zle });
  await s.laduj();
  assert.deepEqual(s.licznik.innerHTML, [], 'żadnego przypisania innerHTML w tej ścieżce');
  assert.equal(s.odnosnik().textContent, 'Nie znam miasta „' + zle + '”. Popraw w profilu ›');
  assert.ok(!s.odnosnik().href.includes('img') && !s.odnosnik().style.cssText.includes('img'), 'miasto nie trafia do adresu ani do stylu');
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(ZAW.slice(ZAW.indexOf('window._pogodaNieznaneMiasto = function'), ZAW.indexOf('window._renderWeather = function'))), 'w kodzie komunikatu nie ma wstawiania HTML');
});

test('(4) bardzo długa nazwa jest skracana do 40 znaków, a identyfikator w adresie kodowany', async () => {
  const s = strona({ miasto: 'W'.repeat(100), idZawodnika: 'a b&c=d' });
  await s.laduj();
  assert.equal(s.odnosnik().textContent, 'Nie znam miasta „' + 'W'.repeat(39) + '…”. Popraw w profilu ›');
  assert.equal(s.miasto.textContent, 'W'.repeat(39) + '…');
  assert.equal(s.odnosnik().href, 'profil.html?id=a%20b%26c%3Dd&open=miasto');
});

test('(5) inne porażki chowają kafel jak dotąd, bez komunikatu o mieście', async () => {
  for (const [nazwa, o] of [['500', { status: 500, body: {} }], ['bez ok', { status: 200, body: { ok: false, _error: 'empty_forecast' } }], ['sieć', 'siec'], ['401 dwa razy', { status: 401, body: { code: 'X' } }]]) {
    const s = strona({ odpowiedzi: [o] });
    await s.laduj();
    assert.equal(s.kafel.style.display, 'none', nazwa + ': kafel schowany');
    assert.equal(s.dni.dzieci.length, 0, nazwa + ': bez komunikatu');
  }
});

test('(6) powód poprzedniej próby nie przechodzi na następną: po „miasto nieznane” wylogowana sesja chowa kafel', async () => {
  const s = strona();
  await s.laduj();
  assert.equal(s.kafel.style.display, 'block');
  s.sesja = null; s.dni.textContent = '';
  await s.laduj();
  assert.equal(s.kafel.style.display, 'none', 'brak sesji to nie „miasto nieznane”');
  assert.equal(s.dni.dzieci.length, 0);
});

test('(7) poprawione miasto: następne wczytanie rysuje prognozę', async () => {
  const s = strona({ odpowiedzi: [NIEZNANE('Libartowo'), DOBRA] });
  await s.laduj(); await s.laduj();
  assert.equal(s.narysowano.length, 1);
  assert.equal(s.narysowano[0].city, 'Kostrzyn');
});

test('(8) zawodnik jest w innej sekcji: komunikat czeka w kaflu, ale kafel nie wyskakuje', async () => {
  const s = strona({ sekcja: 'forma' });
  await s.laduj();
  assert.equal(s.dni.dzieci.length, 1);
  assert.notEqual(s.kafel.style.display, 'block');
});

test('(9) kafel bez szkieletu (stan „Wpisz miasto” podmienił jego wnętrze) albo bez id zawodnika: kafel schowany, bez wyjątku', async () => {
  const s = strona({ szkielet: false });
  await s.laduj();
  assert.equal(s.kafel.style.display, 'none');
  assert.deepEqual(s.wpisy.map((w) => w.message), ['miasto-nieznane'], 'brak szkieletu to nie błąd sieci: bez wyjątku po drodze');
  const t = strona({ idZawodnika: '' });
  await t.laduj();   // bez id zawodnika loadWeather kończy od razu
  assert.equal(t.wolania, 0);
});

test('(10) profil otwiera ustawienia na mieście, kalendarz tylko zgłasza', () => {
  assert.match(PROFIL, /if\(_open==='miasto' && _isOwnProfile\) setTimeout\(function\(\)\{ Promise\.resolve\(openSettings\(\)\)\.then\(function\(\)\{ var s=document\.getElementById\('settings-city'\)/, 'profil.html: ?open=miasto otwiera ustawienia i przewija do miasta, tylko we własnym profilu');
  assert.match(PROFIL, /<div id="settings-city"><\/div>/, 'profil.html: pole miasta w ustawieniach istnieje');
  assert.match(PROFIL, /function openSettings\(\)/);
  assert.ok(!KAL.includes('Nie znam miasta'), 'kalendarz nie pokazuje komunikatu');
  assert.match(KAL, /json\._error === 'city_not_found' \? 'miasto-nieznane'/, 'kalendarz dalej zgłasza etap');
  assert.ok(window_etapy().includes('miasto-nieznane'));
});
function window_etapy() { const m = /window\._pogodaEtapy = (\[[^\]]+\]);/.exec(ZAW); return m ? JSON.parse(m[1].replace(/'/g, '"')) : []; }
