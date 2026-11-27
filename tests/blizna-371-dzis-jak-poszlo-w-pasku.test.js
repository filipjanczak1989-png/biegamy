// Blizna #371 (25.11.2026) — nowe Dziś: „Jak poszło?” było poza pierwszym ekranem.
//
// Pytanie o odczucie po treningu z zegarka działało, ale stało na dole kafla „Ostatni trening”, pod skrótami, a po
// siatce skrótów 4 × 2 jeszcze niżej. Filip szukał go na zrzucie z produkcji i uznał, że go nie ma. W starym Dziś
// to osobna, wyraźna karta nad listą.
// Decyzje Filipa 25.11: zachęta w pasku zdarzeń na górze, kolejność zegarek → moment → „Jak poszło?”; blok w kaflu
// zostaje JEDYNYM formularzem (dotknięcie paska przewija do niego); pasek bez własnego „×”, pomijanie tylko w bloku;
// po „Pomiń” cisza wszędzie. Do tego: pasek nie może szarpać układem, gdy pojawia się po kaflach.
// Wpisy w kształcie z konta z produkcji: z zegarka (external_source 'intervals'), feel null, z komentarzem.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MODUL = fs.readFileSync(path.join(__dirname, '..', 'js', 'dzis-nowy.mjs'), 'utf8').replace(/\r\n/g, '\n');
const tik = async (n = 16) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const TERAZ = new Date(2026, 10, 25, 12, 0, 0).getTime();
const wpis = (id, h, z) => Object.assign({ id, logged_at: new Date(TERAZ - h * 3600e3).toISOString(), training_type: 'Spokojny', distance_km: 10.01, duration: '55:10', pace: '5:31', heart_rate: 140, elevation_gain: 40, feel: null, external_source: 'intervals', comment: 'Morning Run' }, z);

function strona({ wpisy = [wpis('l1', 23.8), wpis('l2', 76)], moment = 'none', pasekZegarka = '', search = '', zapis = null, ruch = false, kotwiczenie = true, gora = 0 } = {}) {
  const klasy = new Set(['dzis-nowy']), wezly = {}, zapytania = [], czasomierze = [], obserwowane = [], zdarzenia = [], pamiec = new Map(), st = { zegar: TERAZ, wysPaska: 56 };
  const lista = () => { const k = new Set(); return { add: (c) => k.add(c), remove: (c) => k.delete(c), contains: (c) => k.has(c), _k: k }; };
  const wezel = (sel) => (wezly[sel] = wezly[sel] || { innerHTML: '', textContent: '', value: '', className: '', hidden: /zegarek|zdarzenie|licznik|jp-kom/.test(sel), disabled: false, _a: {}, classList: lista(), offsetWidth: 10,
    setAttribute(k, v) { this._a[k] = v; }, getAttribute(k) { return k in this._a ? this._a[k] : null; }, removeAttribute(k) { delete this._a[k]; },
    getBoundingClientRect() { return { top: /zdarzenie/.test(sel) ? gora : 900, height: this.hidden ? 0 : st.wysPaska }; },
    scrollIntoView(o) { zdarzenia.push('scrollIntoView ' + JSON.stringify(o)); }, focus(o) { zdarzenia.push('focus ' + sel.split(' ').pop() + ' ' + JSON.stringify(o)); },
    querySelector(s2) { return wezel(sel + ' ' + s2); }, querySelectorAll: () => [] });
  const korzen = { hidden: true, innerHTML: '', _a: {}, _zd: {}, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; }, querySelector: (s) => wezel(s), addEventListener(n, f) { this._zd[n] = f; }, contains: () => true };
  const przyciskMomentu = { style: { display: moment }, click() { zdarzenia.push('klik starego momentu'); this.style.display = 'none'; } }, staryPasek = { innerHTML: pasekZegarka };
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: 'Ola' }, 'zawodnik-bell-dot': { textContent: '', style: { display: 'none' } }, 'moment-baner': przyciskMomentu, 'watch-pasek-slot': staryPasek };
  const DANE = { athletes: { id: 'a-1', full_name: 'Ola Nowak', coach_id: null }, 'rpc akcja_licznik': { wystartowala: false }, 'rpc akcja_moj_wklad': { km: 0 }, trainings: [], training_logs: wpisy };
  const wyslij = (nazwa, opis) => { const zq = { nazwa, opis, stan: 'czeka' }; zapytania.push(zq); return new Promise((ok, zle) => { zq.odpowiedz = () => { if (zq.stan !== 'czeka') return; zq.stan = 'jest';
    const r = /update/.test(opis) ? (zapis ? zapis() : { data: [{ id: 'l1' }], error: null, status: 200 }) : { data: DANE[nazwa], error: null, status: 200 }; if (r instanceof Error) zle(r); else ok(r); }; }); };
  const lancuch = (t) => { const kroki = []; let p = null; const q = new Proxy({}, { get(_, k) { if (k === 'then') return (a, b) => (p = p || wyslij(t, kroki.join(''))).then(a, b); return (...arg) => { kroki.push('.' + k + '(' + arg.map((x) => JSON.stringify(x)).join(',') + ')'); return q; }; } }); return q; };
  const w = { _currentSection: 'home', location: { search, hash: '', pathname: '/zawodnik.html' }, URLSearchParams, navigator: { onLine: true }, showSection(n) { this._currentSection = n; }, _logKlienta() {},
    setTimeout(f, ms) { czasomierze.push({ f, ms, zywy: true }); return czasomierze.length; }, clearTimeout(i) { if (czasomierze[i - 1]) czasomierze[i - 1].zywy = false; },
    localStorage: { getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null), setItem: (k, v) => pamiec.set(k, String(v)) },
    matchMedia: (q) => ({ matches: ruch && /reduce/.test(q) }), CSS: { supports: () => kotwiczenie }, scrollBy(x, y) { zdarzenia.push('scrollBy ' + y); },
    BM_AKCJA_CYTATY: { slugDla: () => 'ulica-glowna' }, feelSvg: (kod) => '<svg data-mina="' + kod + '"></svg>', FEEL_ETYKIETY: { bad: 'Ciężko', mid: 'Przeciętnie', good: 'Dobrze', great: 'Świetnie' },
    MutationObserver: function (f) { this.observe = (cel) => obserwowane.push([cel, f]); },
    sb: { from: lancuch, rpc: (n) => { let p = null; return { then: (a, b) => (p = p || wyslij('rpc ' + n, '')).then(a, b) }; }, auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) } } };
  const d = { readyState: 'complete', documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => el[id] || null, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} };
  const DataT = class extends Date { constructor(...a) { if (a.length) super(...a); else super(st.zegar); } static now() { return st.zegar; } };
  vm.runInNewContext(MODUL, { window: w, document: d, URLSearchParams, Date: DataT, Promise, encodeURIComponent });
  async function doKonca() { await tik(); for (let i = 0; i < 12 && zapytania.some((x) => x.stan === 'czeka'); i++) { for (const x of zapytania.filter((y) => y.stan === 'czeka')) x.odpowiedz(); await tik(); } }
  const dotknij = (co, kod) => korzen._zd.click({ target: { closest: (sel) => (sel === '[data-dn],[data-sekcja]' ? { getAttribute: (k) => (k === 'data-dn' ? co : k === 'data-kod' ? kod : null) } : null) } });
  const zmiana = (cel) => obserwowane.filter(([c]) => c === cel).forEach(([, f]) => f());
  return { w, korzen, zapytania, czasomierze, zdarzenia, pamiec, st, przyciskMomentu, staryPasek, doKonca, tik, dotknij, zmiana, B: w.BM_DZIS,
    pasek: wezel('[data-dn="zdarzenie"]'), ostatni: wezel('[data-kafel="ostatni"]'), blok: wezel('[data-kafel="ostatni"] [data-dn="jp"]'), cz: (n) => wezel('[data-kafel="ostatni"] [data-dn="' + n + '"]') };
}
const PASEK = '<button type="button" class="dn-moment" data-dn="jp-pokaz"><svg data-mina="good"></svg><span>Jak poszło?<small>Spokojny · wczoraj · 10,0 km</small></span><i aria-hidden="true">›</i></button>';

test('(1) zachęta w pasku na górze: „Jak poszło?” z nazwą wpisu pod spodem; jest wtedy i tylko wtedy, gdy w kaflu jest blok; bez „×”', async () => {
  const s = strona(); s.B.start(); await s.doKonca();
  assert.match(s.ostatni.innerHTML, /class="dn-jp" data-dn="jp"/, 'blok w kaflu zostaje jedynym formularzem');
  assert.equal(s.pasek.hidden, false);
  assert.equal(s.pasek.innerHTML, PASEK);
  assert.doesNotMatch(s.pasek.innerHTML, /×|pz-x|jp-pomin|jp-mina|jp-zapisz|textarea/, 'w pasku nie ma „×” ani drugiej kopii formularza');
  for (const [opis, wp] of [['wpis ma odczucie', [wpis('l1', 5, { feel: 'good' })]], ['wpis ręczny', [wpis('l1', 5, { external_source: 'app' })]], ['starszy niż 48 h', [wpis('l1', 60)]], ['brak wpisów', []]]) {
    const x = strona({ wpisy: wp }); x.B.start(); await x.doKonca();
    assert.doesNotMatch(x.ostatni.innerHTML, /dn-jp"/, opis); assert.equal(x.pasek.hidden, true, opis + ': bez bloku nie ma paska'); assert.equal(x.pasek.innerHTML, '');
  }
  const inny = strona({ wpisy: [wpis('r', 2, { external_source: 'app', feel: 'good', training_type: 'Spacer' }), wpis('l1', 26, { training_type: 'Wybieganie', distance_km: 16.4 })] }); inny.B.start(); await inny.doKonca();
  assert.match(inny.pasek.innerHTML, /<small>Wybieganie · wczoraj · 16,4 km<\/small>/, 'pasek nazywa ten sam wpis co blok');
  assert.match(inny.ostatni.innerHTML, /<div class="dn-jp-kt">Wybieganie · wczoraj · 16,4 km<\/div>/);
  const xss = strona({ wpisy: [wpis('l1', 5, { training_type: '<img src=x>' })] }); xss.B.start(); await xss.doKonca();
  assert.doesNotMatch(xss.pasek.innerHTML, /<img src=x>/, 'nazwa wpisu escapowana');
  const trener = strona({ search: '?from=trener' }); trener.B.start(); await trener.doKonca(); assert.equal(trener.pasek.innerHTML, '');
});

test('(2) kolejność w pasku: problem z zegarkiem → moment → „Jak poszło?”; po zamknięciu wyższego pojawia się następne', async () => {
  const s = strona({ moment: 'inline-flex', pasekZegarka: '<div class="wc-pasek">⌚ problem</div>' }); s.B.start(); await s.doKonca();
  assert.match(s.pasek.innerHTML, /wc-pasek/, 'najpierw zegarek'); assert.doesNotMatch(s.pasek.innerHTML, /dn-moment/);
  s.staryPasek.innerHTML = ''; s.zmiana(s.staryPasek);
  assert.match(s.pasek.innerHTML, /data-dn="moment"/, 'potem moment'); assert.doesNotMatch(s.pasek.innerHTML, /jp-pokaz/);
  s.dotknij('moment');
  assert.equal(s.pasek.innerHTML, PASEK, 'po momencie zachęta „Jak poszło?”'); assert.equal(s.pasek.hidden, false);
  assert.match(s.ostatni.innerHTML, /class="dn-jp" data-dn="jp"/, 'blok w kaflu był tam cały czas, niezależnie od tego, co zajmowało pasek');
  s.przyciskMomentu.style.display = 'inline-flex'; s.zmiana(s.przyciskMomentu);
  assert.match(s.pasek.innerHTML, /data-dn="moment"/, 'nowy moment wraca przed pytanie');
});

test('(3) dotknięcie paska: do bloku w kaflu, podświetlenie, fokus na pierwszej minie; niczego nie zapisuje i o nic nie pyta', async () => {
  const s = strona(); s.B.start(); await s.doKonca();
  const przed = s.zapytania.length;
  s.dotknij('jp-pokaz');
  assert.deepEqual(s.zdarzenia, ['scrollIntoView {"behavior":"smooth","block":"center"}', 'focus [data-dn="jp-mina"] {"preventScroll":true}']);
  assert.equal(s.blok.classList.contains('dn-jp-swiatlo'), true, 'blok podświetlony');
  assert.equal(s.zapytania.length, przed); assert.equal([...s.pamiec.keys()].filter((k) => k !== 'dn_kadr').length, 0, 'dotknięcie paska to nie „Pomiń”');
  assert.equal(s.pasek.innerHTML, PASEK, 'pasek zostaje, dopóki pytanie czeka');
  const spokojny = strona({ ruch: true }); spokojny.B.start(); await spokojny.doKonca(); spokojny.dotknij('jp-pokaz');
  assert.equal(spokojny.zdarzenia[0], 'scrollIntoView {"behavior":"auto","block":"center"}', 'przy ograniczonym ruchu bez animacji przewijania');
  assert.match(MODUL, /prefers-reduced-motion:reduce\)\{[^@]*#dzis-nowy \.dn-zd\.dn-zd-wjazd,#dzis-nowy \.dn-jp\.dn-jp-swiatlo\{animation:none\}/);
  const bez = strona({ wpisy: [] }); bez.B.start(); await bez.doKonca(); bez.dotknij('jp-pokaz'); assert.deepEqual(bez.zdarzenia, [], 'bez bloku dotknięcie nic nie robi');
});

test('(4) „Pomiń” = cisza wszędzie; udany zapis zdejmuje pasek od razu; błąd zapisu i wybrana mina go zostawiają', async () => {
  const s = strona({ wpisy: [wpis('l1', 5), wpis('l2', 30)] }); s.B.start(); await s.doKonca();
  s.dotknij('jp-pomin'); await s.tik();
  assert.equal(s.pasek.hidden, true, 'po „Pomiń” pasek znika razem z blokiem'); assert.equal(s.pasek.innerHTML, '');
  assert.doesNotMatch(s.ostatni.innerHTML, /dn-jp"/); assert.deepEqual([...s.pamiec.keys()].filter((k) => k !== 'dn_kadr'), ['fr_skip_l1'], 'i nie przechodzi na starszy wpis z okna (blizna-370)');
  s.B.wczytaj(true); await s.doKonca(); assert.equal(s.pasek.hidden, true, 'po ponownym wczytaniu dalej cisza');
  const z = strona(); z.B.start(); await z.doKonca();
  z.dotknij('jp-mina', 'good'); assert.equal(z.pasek.innerHTML, PASEK, 'wybrana mina, raport niezapisany: pasek zostaje');
  z.dotknij('jp-zapisz'); await z.doKonca();
  assert.equal(z.pasek.hidden, true, 'udany zapis: pasek znika od razu, nie po 2,6 s podziękowania');
  assert.equal(z.blok.className, 'dn-jp-ok', 'w kaflu jeszcze podziękowanie');
  z.czasomierze.filter((c) => c.zywy && c.ms === 2600).forEach((c) => c.f()); await z.tik();
  assert.equal(z.pasek.hidden, true); assert.doesNotMatch(z.ostatni.innerHTML, /dn-jp/);
  const blad = strona({ zapis: () => ({ data: [], error: null, status: 200 }) }); blad.B.start(); await blad.doKonca();
  blad.dotknij('jp-mina', 'bad'); blad.dotknij('jp-zapisz'); await blad.doKonca();
  assert.equal(blad.pasek.innerHTML, PASEK, 'nieudany zapis: pytanie dalej czeka, więc pasek też');
});

test('(5) pasek nie szarpie układem: nad czytanym miejscem wyrównuje przewinięcie tam, gdzie przeglądarka sama tego nie robi; na widoku wsuwa się dopiero, gdy kafle już stoją', async () => {
  // a) zwykłe wejście: dane dochodzą po szkielecie, więc pasek pojawia się nad stojącymi już kaflami: wsuwa się, przewinięcia nie rusza
  const s = strona(); s.B.start(); await s.doKonca();
  assert.equal(s.pasek.classList.contains('dn-zd-wjazd'), true, 'moduł dociąga wpisy po szkielecie: pasek wsuwa się, nie przeskakuje');
  assert.deepEqual(s.zdarzenia, [], 'żadnego przewijania ekranu');
  // b) pasek pojawia się PÓŹNIEJ, na widoku (moment odsłonięty przez stary kod po kaflach): wsuwa się
  const p = strona({ wpisy: [] }); p.B.start(); await p.doKonca();
  assert.equal(p.pasek.hidden, true);
  p.przyciskMomentu.style.display = 'inline-flex'; p.zmiana(p.przyciskMomentu);
  assert.equal(p.pasek.hidden, false); assert.equal(p.pasek.classList.contains('dn-zd-wjazd'), true, 'późniejsze pojawienie się na widoku: płynne wsunięcie zamiast skoku');
  assert.deepEqual(p.zdarzenia, []);
  // c) ktoś przewinął niżej (pasek nad ekranem), przeglądarka BEZ kotwiczenia przewijania: wyrównujemy o wysokość paska z odstępem
  const n = strona({ wpisy: [], gora: -400, kotwiczenie: false }); n.B.start(); await n.doKonca();
  n.przyciskMomentu.style.display = 'inline-flex'; n.zmiana(n.przyciskMomentu);
  assert.deepEqual(n.zdarzenia, ['scrollBy 68'], '56 px paska + 12 px odstępu: treść pod palcem zostaje w miejscu');
  assert.equal(n.pasek.classList.contains('dn-zd-wjazd'), false, 'poza widokiem bez animacji');
  n.dotknij('moment');
  assert.deepEqual(n.zdarzenia, ['scrollBy 68', 'klik starego momentu', 'scrollBy -68'], 'zniknięcie paska też wyrównane');
  // d) to samo w przeglądarce Z kotwiczeniem: nie ruszamy przewinięcia drugi raz
  const k = strona({ wpisy: [], gora: -400, kotwiczenie: true }); k.B.start(); await k.doKonca();
  k.przyciskMomentu.style.display = 'inline-flex'; k.zmiana(k.przyciskMomentu);
  assert.deepEqual(k.zdarzenia, [], 'przeglądarka wyrównuje sama; druga korekta dałaby skok w drugą stronę');
  // e) ta sama treść jeszcze raz: nic się nie dzieje
  const b = strona(); b.B.start(); await b.doKonca(); assert.equal(b.pasek.classList.contains('dn-zd-wjazd'), true); b.B.start(); b.zmiana(b.staryPasek);
  assert.equal(b.pasek.classList.contains('dn-zd-wjazd'), true, 'bez zmiany treści pasek nie jest ruszany (animacja nie startuje od nowa)'); assert.deepEqual(b.zdarzenia, []);
  assert.match(MODUL, /#dzis-nowy \.dn-zd\{margin:0 0 12px;overflow:hidden\}/);
});
