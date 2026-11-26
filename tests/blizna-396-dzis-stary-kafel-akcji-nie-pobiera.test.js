// Blizna #396 (26.11.2026) — stary kafel akcji montował się pod nowym Dziś i pobierał całą scenę ulicy.
//
// Stare Dziś chowa tylko CSS (html.dzis-nowy.dzis-gotowy). Stary kod akcji o tym nie wiedział: na koncie z nowym Dziś
// dalej budował kafel Ulicy w schowanym banerze i wołał scenę. Zmierzone 26.11 na prawdziwej stronie z prawdziwym
// klientem bazy (dzis\e3\pomiar-strony.cjs): 2 skrypty sceny (165 kB), 11 obrazów (389 kB) i zapytanie
// akcja_kafel_ukryty na każde wejście, dla kafla o wymiarach 0 × 0 px. Ten sam rodzaj straty co stary kadr (blizna-380).
// Naprawa w js/akcja.mjs, tym samym wzorem: dopóki stare Dziś jest schowane, kafel się nie buduje; dane czekają
// i kafel staje, gdy stary ekran wraca. Ten test przechodzi wszystkie powroty, bo zły warunek zostawiłby stare Dziś
// bez kafla akcji u wszystkich kont bez nowego ekranu.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const AKCJA = fs.readFileSync(path.join(__dirname, '..', 'js', 'akcja.mjs'), 'utf8').replace(/\r\n/g, '\n');
const UID = 'u-1';
const LICZNIK = { wystartowala: true, aktywna: true, nazwa: 'Ulica próbna', imie: 'Próbka', koniec: null, cel_km: 12500, suma_km: 3050, pct: 24.4, filip_gr: 30500, filip_max_gr: 125000, stawka_filip_gr: 10, url_zbiorki: 'https://example.org/z', plakat_url: null, firmy: [], ulica: { cegly: [], cegly_n: 0 } };

function wezel(tag) {
  const n = { tagName: String(tag || 'div').toUpperCase(), className: '', style: {}, _a: {}, _d: [], _auto: {}, innerHTML: '', textContent: '', hidden: false, parentNode: null,
    setAttribute(k, v) { if (k === 'class') this.className = String(v); this._a[k] = String(v); }, getAttribute(k) { return k in this._a ? this._a[k] : null; }, removeAttribute(k) { delete this._a[k]; },
    appendChild(c) { this._d.push(c); c.parentNode = this; return c; }, insertBefore(c) { this._d.unshift(c); c.parentNode = this; return c; },
    removeChild(c) { this._d = this._d.filter((x) => x !== c); return c; }, remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }), querySelectorAll: () => [], closest: () => null, focus() {},
    querySelector(sel) {
      const kl = String(sel).replace(/^\./, '');
      const dziecko = this._d.find((x) => x.className.split(/\s+/).includes(kl)); if (dziecko) return dziecko;
      if (/^[a-z-]+$/.test(kl) && this.innerHTML.includes(kl)) return (this._auto[kl] = this._auto[kl] || wezel('div'));
      return null;
    } };
  n.classList = { add: (...c) => { const s = new Set(n.className.split(/\s+/).filter(Boolean)); c.forEach((x) => s.add(x)); n.className = [...s].join(' '); if (n._poKlasie) n._poKlasie(); },
    remove: (...c) => { n.className = n.className.split(/\s+/).filter((x) => x && !c.includes(x)).join(' '); if (n._poKlasie) n._poKlasie(); }, contains: (c) => n.className.split(/\s+/).includes(c), toggle() {} };
  return n;
}

/** Strona ze starym banerem Dziś i kartą akcji. klasy = klasy <html> przy wczytaniu skryptu; pamiec = dodatkowe wpisy pamięci telefonu. */
function strona({ klasy = '', pamiec = {}, ustepuje = null } = {}) {
  const html = wezel('html'), head = wezel('head'), body = wezel('body'), baner = wezel('div'), karta = wezel('div'), rpc = [], czasomierze = [], obserwatorzy = [];
  html.className = klasy; html._poKlasie = () => obserwatorzy.slice().forEach((f) => f());
  const mapa = new Map(Object.entries(Object.assign({ 'sb-afqojgkaveykxbltxzwm-auth-token': JSON.stringify({ user: { id: UID } }) }, pamiec)));
  const ls = { getItem: (k) => (mapa.has(k) ? mapa.get(k) : null), setItem: (k, v) => { mapa.set(k, String(v)); }, removeItem: (k) => { mapa.delete(k); }, key: (i) => [...mapa.keys()][i] ?? null, get length() { return mapa.size; } };
  const el = { 'daily-motivation': baner, 'akcja-karta': karta };
  const d = { documentElement: html, head, body, readyState: 'complete', getElementById: (id) => el[id] || null, createElement: wezel, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  const g = { document: d, localStorage: ls, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 }, location: { search: '', hash: '', pathname: '/zawodnik.html', href: 'https://biegamy.run/zawodnik.html' },
    navigator: { onLine: true }, _currentSection: 'home', console: { warn() {}, log() {}, error() {} },
    setTimeout(f, ms) { czasomierze.push({ f, ms, zywy: true }); return czasomierze.length; }, clearTimeout(i) { if (czasomierze[i - 1]) czasomierze[i - 1].zywy = false; },
    MutationObserver: function (f) { this.observe = (cel) => { if (cel === html) obserwatorzy.push(f); }; this.disconnect = () => {}; },
    sb: { rpc(n) { rpc.push(n); return Promise.resolve({ data: n === 'akcja_kafel_ukryty' ? false : null, error: null }); } },
    escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), safeExternalHref: (u) => (/^https:\/\//.test(u) ? u : ''), safeUrlAttr: (u) => (/^https:\/\//.test(u) ? u : ''),
    Date, JSON, Math, Promise, String, Number, Object, Array, RegExp, Error, isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, URLSearchParams, Intl };
  if (ustepuje !== null) g.BM_DZIS = { ustepuje: () => ustepuje.v };
  vm.createContext(g); vm.runInContext(AKCJA, g);
  const skrypty = () => head._d.filter((x) => x.tagName === 'SCRIPT').map((x) => String(x.src || x._a.src || ''));
  return { g, A: g.BM_AKCJA, html, baner, karta, rpc, czasomierze, obserwatorzy, skrypty,
    kafel: () => baner.querySelector('.akcja-dzis'), pobieraScene: () => skrypty().some((s) => /js\/(ulica|sezon)\.mjs/.test(s)),
    tykaj: (ms) => { const c = czasomierze.filter((x) => x.zywy && x.ms === ms && !x.byl); c.forEach((x) => { x.byl = true; x.f(); }); return c.length; } };
}

test('(1) kontrola: bez nowego Dziś (brak klas) stary kafel staje jak dotąd, pyta o ukrycie i dociąga scenę', () => {
  const s = strona();
  const karta = s.A.kartaDzisHtml(LICZNIK, { km: 12 });
  assert.ok(s.kafel(), 'kafel Ulicy w starym banerze');
  assert.equal(s.kafel().getAttribute('data-slug'), 'dla-fabianka');
  assert.deepEqual(s.rpc.filter((n) => n === 'akcja_kafel_ukryty'), ['akcja_kafel_ukryty']);
  assert.equal(s.pobieraScene(), true, 'scena ulicy: skrypt dociągany przy pierwszym kaflu');
  assert.match(karta, /akcja-karta/); assert.equal(s.obserwatorzy.length, 0, 'bez nowego Dziś niczego nie pilnujemy');
});

test('(2) stare Dziś schowane (dzis-nowy + dzis-gotowy): kafel się nie buduje, zero skryptów sceny, zero zapytań o ukrycie; karta z formularzem sponsora rysuje się jak dotąd', () => {
  const s = strona({ klasy: 'dzis-nowy dzis-gotowy dzis-na-dzis' });
  const karta = s.A.kartaDzisHtml(LICZNIK, { km: 12 });
  assert.equal(s.kafel(), null, 'kafla nie ma w dokumencie');
  assert.equal(s.pobieraScene(), false, 'żadnego skryptu sceny ani sezonu'); assert.deepEqual(s.skrypty(), []);
  assert.deepEqual(s.rpc.filter((n) => n === 'akcja_kafel_ukryty'), [], 'zapytanie o ukrycie kafla też nie idzie');
  assert.match(karta, /akcja-centrum/, 'karta pod kaflem (nazwa, sponsor, „Więcej o akcji”) nie znika: odłożony kafel liczy się dla niej jak stojący');
  s.A.kartaDzisHtml(LICZNIK, { km: 13 }); s.A.kartaDzisHtml(LICZNIK, { km: 14 });
  assert.equal(s.kafel(), null); assert.equal(s.pobieraScene(), false, 'kolejne odświeżenia licznika dalej niczego nie pobierają');
  assert.equal(s.obserwatorzy.length, 1, 'jeden strażnik powrotu starego ekranu');
});

test('(3) powroty starego ekranu: po każdym kafel staje od razu, z ostatnimi danymi', () => {
  // a) awaria modułu albo konto bez wiersza zawodnika: stop() zdejmuje dzis-gotowy (moduł ustępuje albo go nie ma)
  const a = strona({ klasy: 'dzis-nowy dzis-gotowy', ustepuje: { v: false } }); a.A.kartaDzisHtml(LICZNIK, { km: 12 }); a.A.kartaDzisHtml(LICZNIK, { km: 20 });
  assert.equal(a.kafel(), null);
  a.html.classList.remove('dzis-gotowy');
  assert.ok(a.kafel(), 'stop(): stary ekran wrócił, kafel jest (ekran był już schowany, więc nie czekamy na moduł)'); assert.equal(a.pobieraScene(), true);
  assert.match(a.kafel().querySelector('.akcja-dzis-liczby').innerHTML, /Twój wkład: <b>20 km<\/b>/, 'z ostatnimi danymi, nie z pierwszymi');
  // b) brak modułu albo odpowiedź „stary”: blok DZIS-E0 1 zdejmuje dzis-nowy
  const b = strona({ klasy: 'dzis-nowy dzis-gotowy' }); b.A.kartaDzisHtml(LICZNIK, { km: 12 });
  b.html.classList.remove('dzis-nowy');
  assert.ok(b.kafel(), 'bez dzis-nowy reguły CSS już niczego nie chowają, więc kafel staje od razu, choć dzis-gotowy jeszcze wisi');
  b.html.classList.remove('dzis-gotowy');
  assert.ok(b.kafel()); assert.deepEqual(b.rpc.filter((n) => n === 'akcja_kafel_ukryty'), ['akcja_kafel_ukryty']);
  // c) podgląd trenera, #sponsor, #log-list: dzis-nowy jest, ale moduł ustępuje i nigdy nie ustawi dzis-gotowy
  const c = strona({ klasy: 'dzis-nowy', ustepuje: { v: true } }); c.A.kartaDzisHtml(LICZNIK, { km: 12 });
  assert.ok(c.kafel(), 'moduł ustępuje: kafel od razu, bez czekania'); assert.equal(c.czasomierze.filter((x) => x.ms === 300).length, 0);
  // d) ?dzis=stary i konto bez przełącznika: klas nie ma od początku (test 1)
  // e) kafel wraca tylko raz: kolejne zmiany klas go nie dublują
  a.html.classList.add('x'); a.html.classList.remove('x');
  assert.equal(a.baner._d.filter((x) => x.className.split(' ').includes('akcja-dzis')).length, 1);
});

test('(4) przełącznik włączony, moduł jeszcze nie zdecydował (dzis-nowy bez dzis-gotowy): czekamy najwyżej 12 prób co 300 ms, potem kafel staje jak dotąd', () => {
  const s = strona({ klasy: 'dzis-nowy', ustepuje: { v: false } }); s.A.kartaDzisHtml(LICZNIK, { km: 12 });
  assert.equal(s.kafel(), null, 'nie budujemy kafla, który za chwilę ma być schowany'); assert.equal(s.pobieraScene(), false);
  assert.equal(s.czasomierze.filter((x) => x.zywy && x.ms === 300).length, 1);
  // moduł zdążył: ekran schowany, kafla dalej nie ma i nikt już nie odlicza
  s.html.classList.add('dzis-gotowy'); s.tykaj(300); s.tykaj(300);
  assert.equal(s.kafel(), null); assert.equal(s.pobieraScene(), false);
  // moduł nie dochodzi wcale (wolna sieć): po 12 próbach stare Dziś dostaje kafel
  const wolno = strona({ klasy: 'dzis-nowy', ustepuje: { v: false } }); wolno.A.kartaDzisHtml(LICZNIK, { km: 12 });
  let proby = 0; while (!wolno.kafel() && proby < 40) { if (!wolno.tykaj(300)) break; proby++; }
  assert.ok(wolno.kafel(), 'po limicie kafel staje'); assert.equal(proby, 12, '12 prób co 300 ms = 3,6 s (moduł ma 3 s)');
  // w trakcie czekania moduł zaczyna ustępować (np. wejście z #sponsor): kafel przy najbliższej próbie
  const u = { v: false }, zmiana = strona({ klasy: 'dzis-nowy', ustepuje: u }); zmiana.A.kartaDzisHtml(LICZNIK, { km: 12 });
  u.v = true; zmiana.tykaj(300); assert.ok(zmiana.kafel());
});

test('(5) kafel zbudowany, zanim nowy ekran się pokazał, zostaje i dalej dostaje liczby; karta z pamięci telefonu przy schowanym ekranie też niczego nie buduje', () => {
  const s = strona(); s.A.kartaDzisHtml(LICZNIK, { km: 12 });
  const k = s.kafel(); assert.ok(k);
  s.html.classList.add('dzis-nowy', 'dzis-gotowy'); s.A.kartaDzisHtml(LICZNIK, { km: 30 });
  assert.equal(s.kafel(), k, 'nie rozbieramy tego, co już stoi (i tak się pobrało)');
  assert.match(k.querySelector('.akcja-dzis-liczby').innerHTML, /Twój wkład: <b>30 km<\/b>/, 'stojący kafel dalej się aktualizuje');
  // karta z pamięci: skrypt akcji rysuje ją przy wczytaniu, z ostatniego stanu konta
  const KARTA = JSON.stringify({ d: LICZNIK, wklad: { km: 12 }, uid: UID, t: Date.now(), wys: 120 });
  const zPamieci = strona({ klasy: 'dzis-nowy dzis-gotowy', pamiec: { bm_akcja_ostatnia_karta: KARTA } });
  assert.match(zPamieci.karta.innerHTML, /akcja-centrum/, 'karta z pamięci jest (schowana przez CSS)');
  assert.equal(zPamieci.kafel(), null); assert.equal(zPamieci.pobieraScene(), false, 'ale kafla i sceny nie ma');
  const stareZPamieci = strona({ pamiec: { bm_akcja_ostatnia_karta: KARTA } });
  assert.ok(stareZPamieci.kafel(), 'bez nowego Dziś karta z pamięci stawia kafel od pierwszego obrazu, jak dotąd');
});

test('(6) strony bez banera Dziś (index, strona akcji, Okienko w Deno) nie widzą zmiany', () => {
  assert.match(AKCJA, /function wstawKafel\(d, wklad\) \{\n    var b = banerDzis\(\);\n    if \(!b\) return;\n    if \(!b\.querySelector\("\.akcja-dzis"\) && odlozKafel\(d, wklad\)\) return;/, 'warunek stoi po sprawdzeniu banera: bez banera nic się nie zmienia');
  assert.match(AKCJA, /function klasyStrony\(\) \{ try \{ return g\.document\.documentElement\.classList; \} catch \(e\) \{ return null; \} \}/, 'bez dokumentu (Deno) brak klas = stare zachowanie');
});
