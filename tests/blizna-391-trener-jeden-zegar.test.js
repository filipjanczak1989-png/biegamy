// Blizna #391 (26.11.2026) — panel trenera: licznik nieprzeczytanych wiadomości odświeża jeden zegar, jednym żądaniem, tylko w widocznej karcie.
//
// Do 26.11 ten sam licznik odświeżały dwa zegary po 30 s (checkUnreadMessages: 1 żądanie, _checkCoachMessages: 2 żądania),
// także w karcie leżącej w tle. Jedna karta zostawiona na dobę to 8640 żądań i tyle samo wpisów w logach Supabase,
// a limit Log Ingestion był przekroczony (104 %). Teraz: jedno żądanie co 60 s, przy ukrytej karcie zero,
// po powrocie do karty jedno od razu. Trener widzi to samo: plakietka z liczbą, kolor dzwonka, toast o nowej wiadomości.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TRENER = fs.readFileSync(path.join(__dirname, '..', 'trener.html'), 'utf8').replace(/\r/g, '');
const a0 = TRENER.indexOf('const NIEPRZECZYTANE_CO_MS'), b0 = TRENER.indexOf('async function openCoachNotifications()', a0);
assert.ok(a0 > 0 && b0 > a0, 'brak bloku zegara w trener.html');
const BLOK = TRENER.slice(a0, b0);
const MIN = 60000;

function panel({ ukryta = false, nieprzeczytane = 0, zawodnicy = ['z1', 'z2'], trener = 'c1' } = {}) {
  const s = { zadania: [], toasty: [], nieprzeczytane, blad: false, rzuca: false, zegary: [], t: 0, nr: 0, sluchacze: [], wstrzymaj: null };
  const el = () => ({ style: { display: '', background: '', cssText: '' }, textContent: '', atrybuty: {}, setAttribute(k, v) { this.atrybuty[k] = v; } });
  s.kropka = el(); s.dzwonek = el();
  s.document = { hidden: ukryta, getElementById: (id) => (id === 'notif-dot' ? s.kropka : id === 'notif-icon' ? s.dzwonek : null),
    addEventListener: (zd, f) => { if (zd === 'visibilitychange') s.sluchacze.push(f); } };
  const zapytanie = (tabela) => { const z = { tabela, kroki: [] };
    for (const k of ['select', 'eq', 'in']) z[k] = (...a) => { z.kroki.push([k].concat(a)); return z; };
    z.then = (ok, zle) => { s.zadania.push({ tabela, kroki: z.kroki });
      const wynik = s.rzuca ? Promise.reject(new Error('sieć')) : (s.wstrzymaj ? new Promise((r) => { s.wstrzymaj.push(() => r({ count: s.nieprzeczytane, error: null })); }) : Promise.resolve(s.blad ? { count: null, error: { message: 'x' } } : { count: s.nieprzeczytane, error: null }));
      return wynik.then(ok, zle); };
    return z; };
  const sb = { from: zapytanie, auth: { getSession: async () => { s.zadania.push({ tabela: 'auth' }); return { data: { session: { user: { id: trener } } } }; } } };
  const setInterval = (f, ms) => { const z = { f, ms, nr: ++s.nr, nast: s.t + ms }; s.zegary.push(z); return z.nr; };
  const clearInterval = (nr) => { s.zegary = s.zegary.filter((z) => z.nr !== nr); };
  const kod = new Function('document', 'sb', 'setInterval', 'clearInterval', 'showToast', '_coachId', '_dbAthletes',
    BLOK + '\nreturn { sprawdz: checkUnreadMessages, start: _startCoachMsgWatch, co: NIEPRZECZYTANE_CO_MS };')(
    s.document, sb, setInterval, clearInterval, (t) => { s.toasty.push(t); }, trener, zawodnicy.map((id) => ({ id })));
  s.kod = kod;
  /** Przesuwa zegar testu o ms, wykonując zegary strony w kolejności czasu. */
  s.czas = async (ms) => { const koniec = s.t + ms;
    for (;;) { const z = s.zegary.filter((x) => x.nast <= koniec).sort((p, q) => p.nast - q.nast)[0]; if (!z) break; s.t = z.nast; z.nast += z.ms; z.f(); await new Promise((r) => setImmediate(r)); }
    s.t = koniec; await new Promise((r) => setImmediate(r)); };
  s.widocznosc = async (ukryj) => { s.document.hidden = ukryj; s.sluchacze.forEach((f) => f()); await new Promise((r) => setImmediate(r)); };
  return s;
}

test('(1) widoczna karta: jeden zegar co 60 s i jedno żądanie na tyknięcie', async () => {
  const s = panel();
  s.kod.start();
  assert.equal(s.kod.co, MIN);
  assert.equal(s.zegary.length, 1, 'jeden zegar na stronę');
  assert.equal(s.zegary[0].ms, MIN);
  assert.equal(s.zadania.length, 0, 'start zegara sam nie pyta (pierwsze sprawdzenie robi start strony)');
  await s.czas(10 * MIN);
  assert.equal(s.zadania.length, 10, 'dokładnie jedno żądanie na minutę');
  assert.ok(s.zadania.every((z) => z.tabela === 'messages'), 'tylko licznik wiadomości: bez listy zawodników i bez pytania o sesję');
  s.kod.start(); s.kod.start();
  assert.equal(s.zegary.length, 1, 'ponowne wywołanie startu nie dokłada zegara');
  assert.equal(s.sluchacze.length, 1, 'ani drugiego nasłuchu widoczności');
});

test('(2) żądanie liczy nieprzeczytane od zawodników tego trenera, z listy trzymanej przez stronę', async () => {
  const s = panel({ zawodnicy: ['z1', 'z2', 'z3'] });
  await s.kod.sprawdz();
  assert.deepEqual(s.zadania, [{ tabela: 'messages', kroki: [['select', '*', { count: 'exact', head: true }], ['eq', 'read', false], ['eq', 'sender', 'athlete'], ['in', 'athlete_id', ['z1', 'z2', 'z3']]] }]);
});

test('(3) ukryta karta: zero żądań przez 5 minut, po powrocie dokładnie jedno od razu, potem znów co 60 s', async () => {
  const s = panel();
  s.kod.start();
  await s.czas(2 * MIN);
  assert.equal(s.zadania.length, 2);
  await s.widocznosc(true);
  assert.equal(s.zegary.length, 0, 'zegar zatrzymany');
  await s.czas(5 * MIN);
  assert.equal(s.zadania.length, 2, 'ukryta karta nie pyta');
  await s.widocznosc(false);
  assert.equal(s.zadania.length, 3, 'powrót: jedno żądanie od razu');
  assert.equal(s.zegary.length, 1, 'i jeden zegar');
  await s.czas(MIN - 1);
  assert.equal(s.zadania.length, 3, 'następne dopiero po pełnych 60 s');
  await s.czas(1);
  assert.equal(s.zadania.length, 4);
  await s.czas(4 * MIN);
  assert.equal(s.zadania.length, 8);
});

test('(4) wielokrotne chowanie i pokazywanie karty nie mnoży zegarów ani żądań', async () => {
  const s = panel();
  s.kod.start();
  for (let i = 0; i < 5; i++) { await s.widocznosc(true); await s.widocznosc(false); }
  assert.equal(s.zegary.length, 1);
  assert.equal(s.zadania.length, 5, 'jedno żądanie na każdy powrót');
  await s.widocznosc(false);   // zdarzenie bez zmiany stanu (np. pageshow): nadal jeden zegar
  assert.equal(s.zegary.length, 1);
});

test('(5) strona otwarta w tle: zegar nie rusza, dopóki karta nie będzie widoczna', async () => {
  const s = panel({ ukryta: true });
  s.kod.start();
  assert.equal(s.zegary.length, 0);
  await s.czas(5 * MIN);
  assert.equal(s.zadania.length, 0);
  await s.widocznosc(false);
  assert.equal(s.zadania.length, 1);
  assert.equal(s.zegary.length, 1);
});

test('(6) trener widzi to samo co dotąd: plakietka z liczbą, kolor dzwonka, toast o nowej wiadomości', async () => {
  const s = panel({ nieprzeczytane: 3 });
  await s.kod.sprawdz();
  assert.equal(s.kropka.style.display, 'flex'); assert.equal(s.kropka.textContent, 3); assert.equal(s.kropka.style.background, '#5b8cff');
  assert.match(s.kropka.style.cssText, /min-width:16px/);
  assert.equal(s.dzwonek.atrybuty.stroke, 'var(--accent)');
  assert.deepEqual(s.toasty, ['💬 Zawodnik napisał wiadomość'], 'pierwsza nieprzeczytana');
  await s.kod.sprawdz();
  assert.equal(s.toasty.length, 1, 'ta sama liczba: bez nowego toastu');
  s.nieprzeczytane = 12; await s.kod.sprawdz();
  assert.equal(s.kropka.textContent, '9+');
  assert.deepEqual(s.toasty.slice(1), ['💬 Nowa wiadomość od zawodnika'], 'kolejna przy już nieprzeczytanych');
  s.nieprzeczytane = 0; await s.kod.sprawdz();
  assert.equal(s.kropka.style.display, 'none'); assert.equal(s.dzwonek.atrybuty.stroke, 'var(--muted)');
  s.nieprzeczytane = 1; await s.kod.sprawdz();
  assert.equal(s.toasty[2], '💬 Zawodnik napisał wiadomość');
});

test('(7) błąd sieci nie gasi plakietki i nie blokuje następnych prób', async () => {
  const s = panel({ nieprzeczytane: 2 });
  await s.kod.sprawdz();
  s.blad = true; await s.kod.sprawdz();
  assert.equal(s.kropka.style.display, 'flex', 'odpowiedź z błędem: zostaje ostatni znany stan');
  s.blad = false; s.rzuca = true; await s.kod.sprawdz();
  assert.equal(s.kropka.style.display, 'flex', 'wyjątek sieci: bez zmian i bez nieobsłużonego błędu');
  s.rzuca = false; s.nieprzeczytane = 0; await s.kod.sprawdz();
  assert.equal(s.kropka.style.display, 'none', 'kolejna próba działa');
  assert.equal(s.zadania.length, 4);
});

test('(8) wolna odpowiedź nie piętrzy żądań; trener bez zawodników albo niezalogowany nie pyta wcale', async () => {
  const s = panel();
  s.wstrzymaj = [];
  const p1 = s.kod.sprawdz(); const p2 = s.kod.sprawdz();
  await new Promise((r) => setImmediate(r));
  assert.equal(s.zadania.length, 1, 'drugie sprawdzenie czeka, aż pierwsze wróci');
  s.wstrzymaj.forEach((f) => f()); s.wstrzymaj = null; await p1; await p2;
  await s.kod.sprawdz();
  assert.equal(s.zadania.length, 2);
  const bez = panel({ zawodnicy: [] }); await bez.kod.sprawdz(); assert.equal(bez.zadania.length, 0);
  const nikt = panel({ trener: null }); await nikt.kod.sprawdz(); assert.equal(nikt.zadania.length, 0);
});

test('(9) źródło: w całym panelu jeden zegar odświeżania, starego nie ma, start strony woła sprawdzenie raz', () => {
  assert.equal(TRENER.split('setInterval(').length - 1, 1, 'trener.html: dokładnie jeden setInterval');
  assert.ok(!TRENER.includes('_checkCoachMessages'), 'stara, zdublowana funkcja usunięta');
  assert.equal(TRENER.split('async function checkUnreadMessages()').length - 1, 1, 'jedna definicja');
  assert.match(TRENER, /await initAuth\(\); await checkUnreadMessages\(\); loadAppStats\(\); initRealtimeNotifications\(\); loadRacesPendingBadge\(\);/, 'start strony: jedno sprawdzenie, bez własnego zegara');
  assert.match(BLOK, /document\.addEventListener\('visibilitychange'/);
  assert.equal(BLOK.split("sb.from(").length - 1, 1, 'jedno zapytanie do bazy w całym bloku');
});
