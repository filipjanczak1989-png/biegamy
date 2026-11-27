// Blizna #358 (25.11.2026) — nowe Dziś: „Nie udało się wczytać” przy pierwszym wczytaniu na produkcji.
//
// Objaw (Filip, telefon, godzinę po pushu E1): wszystkie kafle z błędem, kafel ulicy schowany, „Spróbuj ponownie” działa.
// W client_errors ZERO wpisów 'dzis-nowy', choć każdy błąd danych miał się zgłaszać.
// Przyczyna odtworzona w przeglądarce na kodzie z produkcji: blok DZIS-E0 1 dociąga moduł w nagłówku strony, moduł dochodzi,
// gdy #dzis-nowy już jest w DOM, a skrypt klienta bazy (sb.js, niżej w stronie) jeszcze nie. Moduł pytał bez klienta:
// zero zapytań, od razu błąd kafli. Zgłoszenia nie było, bo logger też siedzi w sb.js, a nieudana próba zużywała jedyny wpis.
// Test z blizna-357 tego nie widział: sprawdzał wczesny start tylko bez korzenia, a klient w atrapie był zawsze.
// Druga droga do tego samego objawu (hipoteza Filipa, get-weather → 401 w konsoli): baza odrzuca token, który supabase-js
// uważa za ważny. Wtedy: bez komunikatu, odświeżenie sesji, JEDNO ponowne wczytanie; dopiero druga odmowa to błąd kafla.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MODUL = fs.readFileSync(path.join(__dirname, '..', 'js', 'dzis-nowy.mjs'), 'utf8').replace(/\r\n/g, '\n');
const plain = (x) => JSON.parse(JSON.stringify(x));
const tik = async (n = 14) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const DANE = {
  athletes: { id: 'a-1', full_name: 'Ola Nowak', coach_id: null },
  'rpc akcja_licznik': { wystartowala: true, nazwa: 'Ulica próbna', suma_km: 3607, cel_km: 12500, pct: 28.9 },
  'rpc akcja_moj_wklad': { km: 196 }, trainings: [], training_logs: [{ id: 'l1', logged_at: '2026-11-24T17:10:00', training_type: 'Spokojny', distance_km: 8 }],
};
const ODMOWA = { data: null, error: { code: 'PGRST303', message: 'JWT expired' }, status: 401 };

/* Atrapa strony. zKlientem = false: skrypt klienta bazy i logger jeszcze nie doszły (dojda() je dokłada).
   token: 'wazny' | 'odrzucany' (baza odpowiada 401, aż refreshSession go naprawi) | 'martwy' (401 także po odświeżeniu). */
function strona({ readyState = 'complete', zKlientem = true, token = 'wazny', odswiezanie = 'ok', odpowiedz = null } = {}) {
  const klasy = new Set(['dzis-nowy']), wezly = {}, zapytania = [], wpisy = [], czasomierze = [], sluchaczeDom = [], sluchaczeSesji = [];
  const wezel = (sel) => (wezly[sel] = wezly[sel] || { innerHTML: '', textContent: '', hidden: false, _a: { 'aria-busy': 'true' }, removeAttribute(k) { delete this._a[k]; }, querySelector(s2) { return wezel(sel + ' ' + s2); } });
  const korzen = { hidden: true, innerHTML: '', _a: {}, _zd: {}, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; },
    querySelector: (s) => wezel(s), addEventListener(n, f) { this._zd[n] = f; } };
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: '—' }, 'zawodnik-bell-dot': { textContent: '', style: { display: 'none' } } };
  const stan = { token, odswiezen: 0, odpisan: 0, fala: 1, odebrane: false, zegar: 1e12 };
  function wyslij(nazwa) {
    if (stan.odebrane) { stan.fala++; stan.odebrane = false; }
    const z = { nazwa, fala: stan.fala, stan: 'czeka', token: stan.token }; zapytania.push(z);
    return new Promise((ok) => { z.odpowiedz = () => { if (z.stan !== 'czeka') return; z.stan = 'jest'; stan.odebrane = true;
      const wlasna = odpowiedz ? odpowiedz(z, stan) : undefined;
      ok(wlasna !== undefined ? wlasna : z.token === 'wazny' ? { data: DANE[nazwa], error: null, status: 200 } : ODMOWA); }; });
  }
  const lancuch = (t) => { let p = null; const q = new Proxy({}, { get(_, k) { if (k === 'then') return (a, b) => (p = p || wyslij(t)).then(a, b); return () => q; } }); return q; };
  const sb = { from: lancuch, rpc: (n) => { let p = null; return { then: (a, b) => (p = p || wyslij('rpc ' + n)).then(a, b) }; },
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }),
      onAuthStateChange(f) { sluchaczeSesji.push(f); return { data: { subscription: { unsubscribe() { stan.odpisan++; const i = sluchaczeSesji.indexOf(f); if (i >= 0) sluchaczeSesji.splice(i, 1); } } } }; },
      refreshSession() {
        stan.odswiezen++;
        if (odswiezanie === 'wisi') return new Promise(() => {});
        if (odswiezanie === 'blad') return Promise.resolve({ data: { session: null }, error: { message: 'x' } });
        if (stan.token === 'odrzucany') stan.token = 'wazny';
        if (odswiezanie === 'zdarzenie') { for (const f of sluchaczeSesji.slice()) f('TOKEN_REFRESHED', {}); return new Promise(() => {}); }   // samo zdarzenie, obietnica nie wraca
        return Promise.resolve({ data: { session: {} }, error: null });
      } } };
  const w = { _currentSection: 'home', location: { search: '', hash: '', pathname: '/zawodnik.html' }, URLSearchParams, navigator: { onLine: true },
    SHARECARD: { otworz: () => Promise.resolve(true) },   // karta dnia z sb.js, jak na prawdziwej stronie (P1d, blizna-411)
    setTimeout(f, ms) { czasomierze.push({ f, ms, zywy: true }); return czasomierze.length; }, clearTimeout(i) { if (czasomierze[i - 1]) czasomierze[i - 1].zywy = false; } };
  const dojda = () => { w.sb = sb; w._logKlienta = (o) => wpisy.push(o); w.BM_AKCJA_CYTATY = { slugDla: () => 'ulica-glowna' }; w.showSection = function (n) { this._currentSection = n; }; };
  if (zKlientem) dojda();
  const d = { readyState, documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => el[id] || null, createElement: () => ({}), head: { appendChild() {} }, addEventListener(n, f) { if (n === 'DOMContentLoaded') sluchaczeDom.push(f); } };
  const DataT = class extends Date { constructor(...a) { if (a.length) super(...a); else super(2026, 10, 25, 12, 0, 0); } static now() { return stan.zegar; } };
  vm.runInNewContext(MODUL, { window: w, document: d, URLSearchParams, Date: DataT, Promise, encodeURIComponent });
  async function doKonca() { await tik(); for (let i = 0; i < 12 && zapytania.some((z) => z.stan === 'czeka'); i++) { for (const z of zapytania.filter((x) => x.stan === 'czeka')) z.odpowiedz(); await tik(); } }
  const kafel = (n) => wezel('[data-kafel="' + n + '"]');
  const bledy = () => ['ulica', 'trening', 'ostatni', 'lista'].filter((n) => /data-dn="ponow"/.test(kafel(n).innerHTML));
  return { w, d, klasy, korzen, zapytania, wpisy, czasomierze, sluchaczeDom, sluchaczeSesji, stan, dojda, doKonca, tik, kafel, bledy, B: w.BM_DZIS, etapy: () => plain(wpisy).map((x) => x.message) };
}

test('(1) awaria z produkcji: moduł doszedł przed skryptem klienta bazy → szkielet bez błędu i bez zgłoszenia, dane po wczytaniu strony w zwykłych dwóch falach', async () => {
  const s = strona({ readyState: 'loading', zKlientem: false });
  s.B.start(); s.B.start(); await s.tik();
  assert.equal(s.korzen.hidden, false, 'szkielet stoi od razu, nie czeka na resztę strony');
  assert.match(s.korzen.innerHTML, /aria-busy="true"/);
  assert.deepEqual(s.bledy(), [], 'przed poprawką: „Nie udało się wczytać” w kaflach treningu i ostatniego treningu');
  assert.equal(s.kafel('ulica').hidden, false, 'przed poprawką kafel ulicy był schowany');
  assert.equal(s.zapytania.length, 0);
  assert.equal(s.sluchaczeDom.length, 1, 'jedno oczekiwanie na stronę mimo dwóch startów');
  s.dojda(); s.d.readyState = 'interactive'; s.sluchaczeDom[0](); await s.doKonca();
  assert.deepEqual(s.zapytania.map((z) => [z.fala, z.nazwa]), [[1, 'rpc akcja_licznik'], [1, 'rpc akcja_moj_wklad'], [1, 'athletes'], [2, 'trainings'], [2, 'training_logs']]);
  assert.match(s.kafel('ulica').innerHTML, /<b>3 607<\/b><span>z 12 500 km/);
  assert.deepEqual(s.bledy(), []); assert.deepEqual(s.wpisy, []);
  s.B.start(); await s.doKonca();   // initAuth woła start jeszcze raz
  assert.equal(s.zapytania.length, 5, 'bez drugiego wczytania');
  assert.equal(typeof s.w.showSection, 'function');
  s.w.showSection('forma'); assert.equal(s.korzen.hidden, true, 'showSection owinięte dopiero, gdy stary kod je zdefiniował');
});

test('(2) brak klienta po wczytaniu całej strony to prawdziwa awaria: błąd kafli i zgłoszenie „klient”; logger, który jeszcze nie doszedł, nie zużywa wpisu', async () => {
  const s = strona({ zKlientem: false });
  s.B.start(); await s.tik();
  assert.deepEqual(s.bledy(), ['trening', 'ostatni']); assert.equal(s.kafel('ulica').hidden, true);
  assert.equal(s.B.zglos('klient'), false, 'bez loggera nic nie poszło');
  s.w._logKlienta = (o) => s.wpisy.push(o);
  assert.equal(s.B.zglos('klient'), true, 'i dlatego wpis dalej jest do wysłania'); assert.equal(s.B.zglos('klient'), false);
  assert.deepEqual(s.etapy(), ['klient']);
});

test('(3) token odrzucony przy pierwszej próbie: bez komunikatu, jedno odświeżenie sesji, po TOKEN_REFRESHED całe wczytanie od nowa i dane na ekranie', async () => {
  for (const odswiezanie of ['ok', 'zdarzenie']) {
    const s = strona({ token: 'odrzucany', odswiezanie });
    s.B.start(); await s.tik();
    assert.equal(s.zapytania.length, 3);
    for (const z of s.zapytania) z.odpowiedz();
    await s.tik();
    assert.deepEqual(s.bledy(), [], odswiezanie + ': odmowa tokenu nie rysuje „Nie udało się wczytać”');
    assert.equal(s.kafel('ulica').hidden, false, 'kafel ulicy zostaje szkieletem');
    assert.equal(s.stan.odswiezen, 1, 'trzy odmowy w jednej fali = jedno odświeżenie');
    await s.doKonca();
    assert.deepEqual(s.zapytania.map((z) => z.nazwa + (z.token === 'wazny' ? '' : ' 401')), ['rpc akcja_licznik 401', 'rpc akcja_moj_wklad 401', 'athletes 401', 'rpc akcja_licznik', 'rpc akcja_moj_wklad', 'athletes', 'trainings', 'training_logs']);
    assert.match(s.kafel('ulica').innerHTML, /3 607/); assert.match(s.kafel('ostatni').innerHTML, /Spokojny · wczoraj/);
    assert.deepEqual(s.bledy(), []);
    assert.deepEqual(s.etapy(), ['sesja'], 'jedno zgłoszenie „sesja”: wiemy, jak często to się zdarza');
    assert.equal(s.stan.odpisan, 1, 'nasłuch sesji zdjęty'); assert.equal(s.sluchaczeSesji.length, 0);
    assert.equal(s.stan.odswiezen, 1);
  }
});

test('(4) druga odmowa to już błąd: kafle z „Spróbuj ponownie”, zgłoszenie etapu, żadnej pętli; przycisk daje nową próbę z jednym odświeżeniem', async () => {
  const s = strona({ token: 'martwy' });
  s.B.start(); await s.doKonca();
  assert.equal(s.stan.odswiezen, 1, 'odświeżamy raz, nie w kółko');
  assert.equal(s.zapytania.length, 6, 'dwie próby fali 1, fala 2 nie wychodzi');
  assert.deepEqual(s.bledy(), ['trening', 'ostatni']); assert.equal(s.kafel('ulica').hidden, true);
  assert.deepEqual(s.etapy().sort(), ['akcja', 'profil', 'sesja']);
  s.stan.token = 'wazny';
  s.korzen._zd.click({ target: { closest: () => ({ getAttribute: (k) => (k === 'data-dn' ? 'ponow' : null) }) } }); await s.doKonca();
  assert.equal(s.zapytania.length, 11); assert.deepEqual(s.bledy(), []);
  const nieUdane = strona({ token: 'odrzucany', odswiezanie: 'blad' });
  nieUdane.B.start(); await nieUdane.doKonca();
  assert.equal(nieUdane.stan.odswiezen, 1); assert.deepEqual(nieUdane.bledy(), ['trening', 'ostatni']);
  assert.deepEqual(nieUdane.etapy().sort(), ['akcja', 'profil'], 'nieudane odświeżenie nie udaje sukcesu wpisem „sesja”');
  const wisi = strona({ token: 'odrzucany', odswiezanie: 'wisi' });
  wisi.B.start(); await wisi.doKonca();
  assert.deepEqual(wisi.bledy(), [], 'czekamy na odświeżenie');
  const limit = wisi.czasomierze.filter((c) => c.zywy);
  assert.deepEqual(limit.map((c) => c.ms), [10000], 'odświeżenie ma limit 10 s');
  limit[0].f(); await wisi.doKonca();
  assert.deepEqual(wisi.bledy(), ['trening', 'ostatni'], 'po limicie zwykły błąd z przyciskiem'); assert.equal(wisi.stan.odpisan, 1);
});

test('(5) odmowa dopiero w fali 2 też ponawia całość raz; błąd, który nie jest odmową tokenu, nie odświeża sesji', async () => {
  const s = strona({ odpowiedz: (z, st) => ((z.nazwa === 'trainings' || z.nazwa === 'training_logs') && st.odswiezen === 0 ? ODMOWA : undefined) });
  s.B.start(); await s.doKonca();
  assert.equal(s.stan.odswiezen, 1, 'dwie odmowy w tej samej fali = jedno odświeżenie i jedno ponowne wczytanie'); assert.equal(s.zapytania.length, 10); assert.deepEqual(s.bledy(), []); assert.deepEqual(s.etapy(), ['sesja']);
  for (const [opis, odp, czyOdmowa] of [
    ['status 401', { data: null, error: { message: 'x' }, status: 401 }, true], ['kod PGRST301', { data: null, error: { code: 'PGRST301', message: 'x' }, status: 400 }, true],
    ['treść o JWT', { data: null, error: { message: 'invalid JWT' } }, true],
    ['RLS 403', { data: null, error: { code: '42501', message: 'permission denied' }, status: 403 }, false], ['błąd serwera', { data: null, error: { message: 'x' }, status: 500 }, false]]) {
    const x = strona({ odpowiedz: (z, st) => (z.nazwa === 'athletes' && st.odswiezen === 0 ? odp : undefined) });
    x.B.start(); await x.doKonca();
    assert.equal(x.stan.odswiezen, czyOdmowa ? 1 : 0, opis);
    assert.deepEqual(x.bledy(), czyOdmowa ? [] : ['trening', 'ostatni'], opis);
    assert.deepEqual(x.etapy(), czyOdmowa ? ['sesja'] : ['profil'], opis);
  }
});

test('(6) spóźnione odświeżenie nie rusza nowszego wczytania', async () => {
  const s = strona({ token: 'odrzucany', odswiezanie: 'wisi' });
  s.B.start(); await s.tik(); for (const z of s.zapytania) z.odpowiedz(); await s.tik();
  s.stan.token = 'wazny'; s.B.wczytaj(true); await s.doKonca();
  assert.equal(s.zapytania.length, 8);
  s.czasomierze.filter((c) => c.zywy).forEach((c) => c.f()); await s.doKonca();
  assert.equal(s.zapytania.length, 8, 'porzucona próba nie wczytuje trzeci raz'); assert.deepEqual(s.bledy(), []);
});
