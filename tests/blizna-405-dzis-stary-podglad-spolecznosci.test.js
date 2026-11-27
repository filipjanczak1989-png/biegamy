// Blizna #405 (27.11.2026) — stary podgląd Społeczności nie pyta bazy, gdy stare Dziś jest schowane pod nowym.
//
// Stare Dziś chowa #home-social-preview tylko CSS (html.dzis-nowy.dzis-gotowy), a loadHomeSocialPreview → loadSocialFeed(true)
// i tak pytał bazę 5–6 razy przy każdym wejściu konta z nowym Dziś (profile publiczne, czy konto jest trenerem, podopieczni,
// treningi własne i podopiecznych, publiczne treningi, obserwowani) dla podglądu, którego nikt nie widzi.
// Ten sam wzór co stary kadr (blizna-380) i stary kafel akcji (blizna-396): podgląd czeka, dopóki stare Dziś jest schowane,
// i wczytuje się RAZ przy każdym powrocie starego ekranu. Sekcja Społeczność (showSection('social')) bez zmian.
// Test liczy zapytania na prawdziwej funkcji loadSocialFeed wyciętej z zawodnik.html, z atrapą klienta bazy.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ZAW = fs.readFileSync(path.join(__dirname, '..', 'zawodnik.html'), 'utf8').replace(/\r/g, '');
const OD = ZAW.indexOf('async function loadSocialFeed(compact) {');
const DO = ZAW.indexOf('\n}\n', ZAW.indexOf('function _spolPilnujPowrotu() {')) + 3;
assert.ok(OD > 0 && DO > OD, 'brak loadSocialFeed albo bramki podglądu w zawodnik.html');
const BLOK = ZAW.slice(OD, DO);
const NOWE = ['dzis-nowy', 'dzis-gotowy', 'dzis-na-dzis'];

/** Strona w pigułce: klasy na <html>, zegar i obserwator klas pod kontrolą testu, atrapa bazy licząca zapytania po tabelach. */
function strona(klasy, opcje) {
  opcje = opcje || {};
  const zestaw = new Set(klasy || []), zapytania = [], obserwatorzy = [], zegar = { t: 0, kolejka: [], nr: 0 };
  const DANE = {
    public_athletes: [{ id: 'p-1', full_name: 'Ola', avatar_url: null }],
    coaches: null,
    training_logs: [],
    public_training_logs: [{ id: 'l-1', training_type: 'Spokojny', distance_km: 5, pace: '5:30', logged_at: '2026-11-27T07:00:00Z', athlete_id: 'p-1' }],
    follows: [],
  };
  const sb = {
    from(tabela) {
      zapytania.push(tabela);
      const q = {}, wynik = () => Promise.resolve({ data: DANE[tabela], error: null });
      for (const m of ['select', 'eq', 'in', 'not', 'order', 'limit']) q[m] = () => q;
      q.maybeSingle = wynik; q.then = (a, b) => wynik().then(a, b);
      return q;
    },
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) },
  };
  const el = () => ({ innerHTML: '', style: {} });
  const elementy = { 'home-social-preview': el(), 'social-feed-content': el() };
  const document = { getElementById: (id) => elementy[id] || null, documentElement: { classList: { contains: (k) => zestaw.has(k) } } };
  const window = { feelSvg: () => '', _renderBadgeEvent: null };
  if (opcje.modul) window.BM_DZIS = opcje.modul;
  class MutationObserver { constructor(f) { this.f = f; } observe(cel, o) { obserwatorzy.push({ f: this.f, o }); } }
  const setTimeout = (f, ms) => { zegar.kolejka.push({ f, kiedy: zegar.t + (ms || 0), nr: ++zegar.nr }); return zegar.nr; };
  const PUSTKA = { dekoruj: (k, h) => h };
  const kod = new Function('document', 'window', 'sb', 'MutationObserver', 'setTimeout', 'PUSTKA', '_athleteId', '_runImgs', 'escapeHtml', 'safeUrlAttr', '_makeScreensCarousel', 'loadCommentCounts',
    BLOK + '\nreturn { podglad: loadHomeSocialPreview, feed: loadSocialFeed };')(
    document, window, sb, MutationObserver, setTimeout, PUSTKA, 'a-1', ['tlo.webp'], (s) => String(s), () => '', () => '', () => {});
  const plukanie = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  return {
    kod, zapytania, obserwatorzy, window, elementy,
    async klasy(dodaj, zdejmij) { (zdejmij || []).forEach((k) => zestaw.delete(k)); (dodaj || []).forEach((k) => zestaw.add(k)); obserwatorzy.forEach((o) => o.f([])); await plukanie(); },
    async czas(ms) {
      const koniec = zegar.t + ms;
      for (;;) {
        const nast = zegar.kolejka.filter((x) => x.kiedy <= koniec).sort((a, b) => a.kiedy - b.kiedy || a.nr - b.nr)[0];
        if (!nast) break;
        zegar.kolejka = zegar.kolejka.filter((x) => x !== nast); zegar.t = nast.kiedy; nast.f(); await plukanie();
      }
      zegar.t = koniec; await plukanie();
    },
    plukanie,
  };
}
const PELNY = ['public_athletes', 'coaches', 'training_logs', 'public_training_logs', 'follows'];

test('(1) konto bez przełącznika i ?dzis=stary (klas nie ma): podgląd pyta bazę jak dotąd, od razu', async () => {
  const s = strona([]);
  await s.kod.podglad(); await s.plukanie();
  assert.deepEqual(s.zapytania, PELNY, 'pięć zapytań starego podglądu');
  assert.ok(s.elementy['home-social-preview'].innerHTML.length > 0, 'podgląd narysowany');
});

test('(2) nowe Dziś na ekranie: zero zapytań, także po kolejnych wywołaniach, po czasie i przy zmianie sekcji', async () => {
  const s = strona(NOWE);
  await s.kod.podglad(); await s.kod.podglad();
  await s.czas(10000);
  await s.klasy([], ['dzis-na-dzis']); await s.klasy(['dzis-na-dzis'], []);   // przejście na inną sekcję i powrót
  await s.kod.podglad();
  assert.deepEqual(s.zapytania, []);
  assert.equal(s.elementy['home-social-preview'].innerHTML, '', 'schowany podgląd nie jest nawet budowany');
  assert.equal(s.obserwatorzy.length, 1, 'jeden obserwator klas na stronę, niezależnie od liczby wywołań');
  assert.deepEqual(s.obserwatorzy[0].o, { attributes: true, attributeFilter: ['class'] });
});

test('(3) powrót starego ekranu (stop(): konto bez wiersza zawodnika, awaria modułu): podgląd wczytuje się raz, od razu', async () => {
  const s = strona(NOWE);
  await s.kod.podglad();
  assert.deepEqual(s.zapytania, []);
  await s.klasy([], ['dzis-gotowy', 'dzis-na-dzis']);
  assert.deepEqual(s.zapytania, PELNY);
  await s.klasy(['inna'], []); await s.klasy([], ['inna']);
  assert.deepEqual(s.zapytania, PELNY, 'kolejne zmiany klas nie wczytują ponownie');
});

test('(4) powrót: brak modułu albo odpowiedź „stary” (blok przełącznika zdejmuje dzis-nowy): podgląd wczytuje się raz', async () => {
  const s = strona(NOWE);
  await s.kod.podglad();
  await s.klasy([], ['dzis-nowy']); await s.klasy([], ['dzis-gotowy', 'dzis-na-dzis']);
  assert.deepEqual(s.zapytania, PELNY);
});

test('(5) moduł ustępuje (podgląd trenera, #sponsor, #log-list): podgląd wczytuje się od razu', async () => {
  for (const powod of ['trener', 'sponsor', 'historia']) {
    const s = strona(['dzis-nowy'], { modul: { ustepuje: () => powod } });
    await s.kod.podglad(); await s.plukanie();
    assert.deepEqual(s.zapytania, PELNY, powod);
  }
});

test('(6) przełącznik włączony, moduł jeszcze nie zdecydował: czeka; gdy nowy ekran stanie, zero zapytań', async () => {
  const s = strona(['dzis-nowy'], { modul: { ustepuje: () => '' } });
  await s.kod.podglad();
  await s.czas(400);
  await s.klasy(['dzis-gotowy', 'dzis-na-dzis'], []);
  await s.czas(20000);
  assert.deepEqual(s.zapytania, []);
});

test('(7) moduł nigdy nie zdecyduje: po limicie modułu (12 prób co 300 ms) podgląd wczytuje się jak dotąd, raz', async () => {
  const s = strona(['dzis-nowy']);
  await s.kod.podglad();
  await s.czas(2900);
  assert.deepEqual(s.zapytania, [], 'przez 3 s czekamy');
  await s.czas(1500);
  assert.deepEqual(s.zapytania, PELNY);
  await s.czas(10000);
  assert.deepEqual(s.zapytania, PELNY, 'bez powtórek');
});

test('(8) sekcja Społeczność pod nowym Dziś działa bez zmian', async () => {
  const s = strona(NOWE);
  await s.kod.feed(false); await s.plukanie();
  assert.ok(s.zapytania.length >= 4, 'pełny kanał pyta bazę: ' + s.zapytania.join(','));
  assert.match(ZAW, /\} else if \(name === 'social' \|\| name === 'spolecznosc'\) \{\n\s+document\.getElementById\('section-social'\)\.style\.display = 'block';\n\s+loadSocialFeed\(\);/, 'showSection(\'social\') woła kanał wprost, nie przez bramkę podglądu');
});

test('(9) źródło: jedna definicja podglądu, bramka przed loadSocialFeed(true), obserwator tylko na klasach, CSS dalej chowa podgląd tymi klasami', () => {
  assert.equal(ZAW.split('async function loadHomeSocialPreview()').length - 1, 1);
  const p = ZAW.slice(ZAW.indexOf('async function loadHomeSocialPreview()'));
  assert.ok(p.indexOf('if (_spolStareSchowane())') < p.indexOf('loadSocialFeed(true)'), 'bramka przed zapytaniami');
  assert.match(BLOK, /observe\(document\.documentElement, \{ attributes: true, attributeFilter: \['class'\] \}\)/);
  assert.match(BLOK, /_spolProby >= 12/);
  assert.match(BLOK, /c\.contains\('dzis-nowy'\) && c\.contains\('dzis-gotowy'\)/);
  assert.match(ZAW, /html\.dzis-nowy\.dzis-gotowy body > #home-social-preview/, 'CSS bloku DZIS-E0 2 chowa podgląd tymi dwiema klasami');
  assert.equal(ZAW.split('loadSocialFeed(true);').length - 1, 1, 'loadSocialFeed(true) woła tylko podgląd za bramką (jedno wywołanie w kodzie)');
});
