// Blizna #360 (25.11.2026) — nowe Dziś, E1b: plakietka zegarka i pasek problemu z zegarkiem.
//
// Nowe Dziś chowa na sekcji Dziś cały górny pasek starego ekranu, a razem z nim plakietkę zegarka (#watch-badge-slot)
// i pasek „problem z zegarkiem” (#watch-pasek-slot). Konto z nowym Dziś nie widziało więc stanu zegarka wcale.
// Decyzja Filipa: plakietka w nagłówku tą samą WATCH.render('badge') i tym samym klikiem, ale BEZ własnego zapytania:
// cztery kolumny intervals_* jadą w jedynym zapytaniu o profil (fala 1), a wynik idzie do render jako opts.stan.
// Budżet zostaje 5 zapytań (pilnuje go też blizna-357). Pasek problemu jest odbiciem starego slotu.
// Wiersz profilu w atrapie ma kształt z bazy (kolumny i typy ze schematu athletes), nie wymyślony.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const MODUL = czytaj('js/dzis-nowy.mjs');
const SB = czytaj('sb' + '.js');
const plain = (x) => JSON.parse(JSON.stringify(x));
const tik = async (n = 14) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const PROFIL = { id: '11111111-2222-4333-8444-555555555555', full_name: 'Ola Nowak', coach_id: null,
  intervals_athlete_id: 'i123456', intervals_connected_at: '2026-09-01T08:00:00+00:00', intervals_can_write: true, intervals_token_dead_at: null };
const PASEK = '<div class="wc-pasek" data-klucz="wc_pasek_x_token_2026-11-25"><span style="flex:1">⌚ Połączenie wygasło.</span><a href="profil.html?open=icu">Napraw ›</a><button type="button" aria-label="Zamknij">✕</button></div>';

function strona({ search = '', watch = 'nowy', profil = PROFIL, sesja = { user: { id: 'u-1' } }, render = null } = {}) {
  const klasy = new Set(['dzis-nowy']), wezly = {}, zapytania = [], obserwowane = [], rendery = [];
  const wezel = (sel) => (wezly[sel] = wezly[sel] || { innerHTML: '', textContent: '', hidden: /zegarek|zdarzenie|licznik/.test(sel), _a: {}, removeAttribute(k) { delete this._a[k]; }, querySelector(s2) { return wezel(sel + ' ' + s2); } });
  const korzen = { hidden: true, innerHTML: '', _a: {}, _zd: {}, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; }, querySelector: (s) => wezel(s), addEventListener(n, f) { this._zd[n] = f; } };
  const staryPasek = { innerHTML: '' };
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: '—' }, 'zawodnik-bell-dot': { textContent: '', style: { display: 'none' } }, 'watch-pasek-slot': staryPasek };
  const stan = { sesja, zegar: 1e12, hak: 0, pytanOSesje: 0 };
  const DANE = { athletes: profil, 'rpc akcja_licznik': { wystartowala: false }, 'rpc akcja_moj_wklad': { km: 0 }, trainings: [], training_logs: [] };
  const wyslij = (nazwa, opis) => { const z = { nazwa, opis, stan: 'czeka' }; zapytania.push(z); return new Promise((ok) => { z.odpowiedz = () => { if (z.stan !== 'czeka') return; z.stan = 'jest'; ok({ data: DANE[nazwa], error: null, status: 200 }); }; }); };
  const lancuch = (t) => { const kroki = []; let p = null; const q = new Proxy({}, { get(_, k) { if (k === 'then') return (a, b) => (p = p || wyslij(t, kroki.join('.'))).then(a, b); return (...arg) => { kroki.push(k + '(' + arg.map((x) => JSON.stringify(x)).join(',') + ')'); return q; }; } }); return q; };
  const w = { _currentSection: 'home', location: { search, hash: '', pathname: '/zawodnik.html' }, URLSearchParams, navigator: { onLine: true }, setTimeout: () => 0, clearTimeout() {},
    showSection(n) { this._currentSection = n; }, _logKlienta() {}, _onWatchSynced() { stan.hak++; }, BM_AKCJA_CYTATY: { slugDla: () => 'ulica-glowna' },
    MutationObserver: function (f) { this.observe = (cel) => obserwowane.push([cel, f]); },
    sb: { from: lancuch, rpc: (n) => { let p = null; return { then: (a, b) => (p = p || wyslij('rpc ' + n, '')).then(a, b) }; }, auth: { getSession: async () => { stan.pytanOSesje++; return { data: { session: stan.sesja } }; } } } };
  const stanZProfilu = (d0) => ({ polaczony: !!(d0 && d0.intervals_athlete_id), od_kiedy: (d0 && d0.intervals_connected_at) || null, moze_wysylac: !!(d0 && d0.intervals_can_write), tokenMartwy: !!(d0 && d0.intervals_athlete_id && d0.intervals_token_dead_at) });
  const renderuj = (waga, opts) => { rendery.push([waga, opts]); return render ? render(waga, opts) : Promise.resolve('<button class="wc-badge wc-badge-' + (opts.stan.tokenMartwy ? 'warn' : opts.stan.polaczony ? 'ok' : 'off') + '">⌚</button>'); };
  if (watch === 'nowy') w.WATCH = { render: renderuj, stanZProfilu };
  if (watch === 'stary') w.WATCH = { render: renderuj };   // sb.js sprzed tej zmiany, jeszcze w pamięci telefonu
  const d = { readyState: 'complete', documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => el[id] || null, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} };
  const DataT = class extends Date { static now() { return stan.zegar; } };
  vm.runInNewContext(MODUL, { window: w, document: d, URLSearchParams, Date: DataT, Promise, encodeURIComponent });
  async function doKonca() { await tik(); for (let i = 0; i < 12 && zapytania.some((z) => z.stan === 'czeka'); i++) { for (const z of zapytania.filter((x) => x.stan === 'czeka')) z.odpowiedz(); await tik(); } }
  return { w, klasy, korzen, zapytania, rendery, obserwowane, staryPasek, stan, doKonca, tik, B: w.BM_DZIS, slot: wezel('[data-dn="zegarek"]'), pasek: wezel('[data-dn="zdarzenie"]') };
}

test('(1) plakietka zegarka z danych profilu: WATCH.render(badge) dostaje stan z czterech kolumn, a zapytań jest dalej pięć', async () => {
  const s = strona();
  s.B.start(); await s.doKonca();
  assert.deepEqual(s.zapytania.map((z) => z.nazwa), ['rpc akcja_licznik', 'rpc akcja_moj_wklad', 'athletes', 'trainings', 'training_logs'], 'budżet bez zmian: żadnego osobnego zapytania o zegarek');
  assert.equal(s.zapytania[2].opis, 'select("id,full_name,coach_id,intervals_athlete_id,intervals_connected_at,intervals_can_write,intervals_token_dead_at").eq("user_id","u-1").maybeSingle()');
  assert.equal(s.rendery.length, 1);
  assert.equal(s.rendery[0][0], 'badge');
  assert.deepEqual(plain(s.rendery[0][1]), { athleteId: PROFIL.id, returnTo: 'zawodnik.html', stan: { polaczony: true, od_kiedy: '2026-09-01T08:00:00+00:00', moze_wysylac: true, tokenMartwy: false } }, 'te same argumenty co stary pasek + stan z profilu');
  assert.equal(s.slot.innerHTML, '<button class="wc-badge wc-badge-ok">⌚</button>'); assert.equal(s.slot.hidden, false);
  for (const [opis, zmiana, klasa] of [['wygasłe połączenie', { intervals_token_dead_at: '2026-11-20T10:00:00+00:00' }, 'warn'], ['niepołączony', { intervals_athlete_id: null, intervals_connected_at: null, intervals_can_write: null }, 'off']]) {
    const x = strona({ profil: Object.assign({}, PROFIL, zmiana) }); x.B.start(); await x.doKonca();
    assert.match(x.slot.innerHTML, new RegExp('wc-badge-' + klasa), opis);
  }
  const h = s.korzen.innerHTML;
  assert.match(h, /<div class="dn-akcje"><span class="dn-zegarek" data-dn="zegarek" hidden><\/span><button type="button" class="dn-okr" data-dn="dzwonek"/, 'zegarek obok dzwonka');
  assert.match(h, /<\/header><button type="button" class="dn-zapytaj" data-dn="okienko"[^>]*>.*<span>Zapytaj<\/span><\/button><div class="dn-zd" data-dn="zdarzenie" hidden><\/div><div class="dn-kafle">/, '„Zapytaj” jako pole pod nagłówkiem, pod nim pasek zdarzenia');
});

test('(2) bez WATCH albo ze starszym sb.js (bez stanZProfilu): plakietki nie ma, ale nie ma też szóstego zapytania ani błędu', async () => {
  for (const watch of ['brak', 'stary']) {
    const s = strona({ watch }); s.B.start(); await s.doKonca();
    assert.equal(s.slot.hidden, true, watch); assert.equal(s.rendery.length, 0, watch + ': starsza render zapytałaby bazę sama');
    assert.equal(s.zapytania.length, 5, watch);
  }
  const pusta = strona({ render: () => Promise.resolve('') }); pusta.B.start(); await pusta.doKonca();
  assert.equal(pusta.slot.hidden, true, 'pusty wynik = pusty slot schowany');
  const pada = strona({ render: () => Promise.reject(new Error('x')) }); pada.B.start(); await pada.doKonca();
  assert.equal(pada.slot.hidden, true); assert.equal(pada.korzen.hidden, false, 'błąd plakietki nie wywraca ekranu');
  const rzuca = strona({ render: () => { throw new Error('x'); } }); rzuca.B.start(); await rzuca.doKonca();
  assert.equal(rzuca.slot.hidden, true);
  const trener = strona({ search: '?from=trener' }); trener.B.start(); await trener.doKonca();
  assert.equal(trener.rendery.length, 0, 'podgląd trenera: nowe Dziś ustępuje, plakietki nie rysuje');
});

test('(3) po ↺ na plakietce (stary hak _onWatchSynced) dane Dziś wczytują się od nowa; hak owinięty raz', async () => {
  const s = strona();
  s.B.start(); s.B.start(); await s.doKonca();
  s.w._onWatchSynced(); await s.doKonca();
  assert.equal(s.stan.hak, 1, 'stary hak dalej woła swoje (odświeżenie listy starego ekranu)');
  assert.equal(s.zapytania.length, 10, 'jedno ponowne wczytanie mimo okna 60 s');
  assert.equal(s.rendery.length, 2, 'plakietka przerysowana ze świeżego profilu');
  assert.equal(s.stan.pytanOSesje, 2, 'jedno wczytanie na jedną synchronizację (hak owinięty dwa razy startowałby je podwójnie)');
  s.B.start(); s.w._onWatchSynced(); await s.doKonca();
  assert.equal(s.stan.hak, 2); assert.equal(s.zapytania.length, 15, 'kolejny start nie owija haka drugi raz (byłoby 20)');
});

test('(4) pasek problemu z zegarkiem: odbicie starego slotu pod nagłówkiem; „✕” zamyka też oryginał', async () => {
  const s = strona();
  s.B.start(); await s.doKonca();
  assert.equal(s.pasek.hidden, true, 'bez problemu paska nie ma');
  const obs = s.obserwowane.find(([cel]) => cel === s.staryPasek);
  assert.ok(obs, 'nasłuch na #watch-pasek-slot');
  s.staryPasek.innerHTML = PASEK; obs[1]();   // stary kod (mountWatchBadge) wstawił pasek później niż wystartował moduł
  assert.equal(s.pasek.innerHTML, PASEK); assert.equal(s.pasek.hidden, false);
  // „✕”: własny onclick paska już usunął go z drzewa, więc od celu kliknięcia nie ma przodka z data-dn
  s.korzen._zd.click({ target: { closest: (sel) => (sel === '.wc-pasek button' ? {} : null) } });
  assert.equal(s.staryPasek.innerHTML, '', 'oryginał wyczyszczony: nie wróci na Formie ani Społeczności');
  assert.equal(s.pasek.hidden, true); assert.equal(s.pasek.innerHTML, '');
  s.korzen._zd.click({ target: { closest: () => null } });
  const wczesniej = strona(); wczesniej.staryPasek.innerHTML = PASEK;   // pasek był, zanim moduł wystartował
  wczesniej.B.start(); await wczesniej.tik();
  assert.equal(wczesniej.pasek.hidden, false, 'pokazany od razu, bez czekania na zmianę');
});

test('(5) brak sesji przy pierwszej próbie nie zamyka okna 60 s: następny start (initAuth) pyta od nowa', async () => {
  const s = strona({ sesja: null });
  s.B.start(); await s.doKonca();
  assert.equal(s.zapytania.length, 0);
  s.stan.sesja = { user: { id: 'u-1' } };
  s.B.start(); await s.doKonca();
  assert.equal(s.zapytania.length, 5, 'przed poprawką: szkielet na zawsze, bo pierwsza próba zużywała okno');
  assert.equal(s.slot.hidden, false);
});

test('(6) sb.js: jedno źródło stanu zegarka; render nie pyta, gdy dostał stan', () => {
  assert.match(SB, /czyPolaczony: async function\(athleteId\) \{[\s\S]{0,420}?return this\.stanZProfilu\(data\);\s*\},/, 'czyPolaczony liczy stan tą samą funkcją');
  assert.match(SB, /stanZProfilu: function\(data\) \{\s*return \{ polaczony: !!\(data && data\.intervals_athlete_id\),/);
  assert.match(SB, /const st = \(opts\.stan && typeof opts\.stan === 'object'\) \? opts\.stan : await this\.czyPolaczony\(opts\.athleteId\);/);
  assert.equal((SB.match(/await this\.czyPolaczony\(opts\.athleteId\)/g) || []).length, 1, 'render pyta w jednym miejscu, i tylko bez stanu');
  const kolumny = SB.match(/\.select\('(intervals_athlete_id, intervals_connected_at, intervals_can_write, intervals_token_dead_at)'\)/)[1].split(', ');
  for (const k of kolumny) assert.ok(vm.runInNewContext('(' + JSON.stringify(strona().B.PROFIL_KOLUMNY) + ')').split(',').includes(k), 'profil nowego Dziś pobiera ' + k);
});
