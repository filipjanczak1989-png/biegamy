// Blizna #362 (25.11.2026) — nowe Dziś, E1b: menu konta i chip „← Trener”.
//
// Nowe Dziś chowa na sekcji Dziś górny pasek starego ekranu. Razem z nim znikły: avatar z menu konta (jedyne „Wyloguj się”
// i przełącznik dźwięków na tym ekranie) oraz chip „← Trener” (powrót trenera do panelu). Stare menu jest dzieckiem schowanego
// paska, więc nie da się go pokazać; nowe Dziś ma własny avatar i własne menu, ale pozycje wołają TE SAME funkcje starego
// ekranu, a inicjały, zdjęcie, adres konta i napis o dźwiękach są odbiciem starych elementów (bez zapytań, bez pamięci telefonu).
// Chip trenera: stary kod odsłania go tylko trenerom, a na czas banera momentu chowa z braku miejsca. Na nowym Dziś miejsce jest.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const MODUL = czytaj('js/dzis-nowy.mjs');
const HTML = czytaj('zawodnik.html');
const FOTO = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/avatars/11111111-2222-4333-8444-555555555555.jfif';

function strona({ search = '', chip = 'none', foto = null, bezFiltra = false } = {}) {
  const klasy = new Set(['dzis-nowy']), wezly = {}, obserwowane = [], wolania = [], sluchaczeDok = [];
  const wezel = (sel) => (wezly[sel] = wezly[sel] || { innerHTML: '', textContent: '', src: undefined, hidden: /zegarek|zdarzenie|licznik|menu"|foto|trener/.test(sel), _a: {}, setAttribute(k, v) { this._a[k] = v; }, removeAttribute(k) { delete this._a[k]; if (k === 'src') this.src = undefined; }, querySelector(s2) { return wezel(sel + ' ' + s2); } });
  const korzen = { hidden: true, innerHTML: '', _a: {}, _zd: {}, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; }, querySelector: (s) => wezel(s), addEventListener(n, f) { this._zd[n] = f; }, contains: (x) => !!(x && x.wKorzeniu) };
  const staryChip = { style: { display: chip }, klikniec: 0, click() { this.klikniec++; } };
  const stareFoto = { style: { display: foto ? 'block' : 'none' }, _src: foto || '', getAttribute(k) { return k === 'src' ? this._src : null; } };
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: 'Ola' }, 'zawodnik-bell-dot': { textContent: '', style: { display: 'none' } },
    'av-initials': { textContent: 'ON' }, 'av-photo': stareFoto, 'menu-email': { textContent: '...' }, 'sound-menu-item': { textContent: '\n        🔊 Dźwięki: wł.\n      ' }, 'back-to-trener': staryChip };
  const w = { _currentSection: 'home', location: { search, hash: '', pathname: '/zawodnik.html' }, URLSearchParams, navigator: { onLine: true }, setTimeout: () => 0, clearTimeout() {}, showSection(n) { this._currentSection = n; }, _logKlienta() {},
    MutationObserver: function (f) { this.observe = (cel) => obserwowane.push([cel, f]); },
    goToMyProfile() { wolania.push('profil'); }, logout() { wolania.push('wyloguj'); },
    async toggleSoundSetting() { wolania.push('dzwieki'); el['sound-menu-item'].textContent = '🔇 Dźwięki: wył.'; },
    sb: { from: () => new Promise(() => {}), rpc: () => new Promise(() => {}), auth: { getSession: () => new Promise(() => {}) } } };
  if (!bezFiltra) w.safeUrlAttr = (u) => (/^https:\/\/afqojgkaveykxbltxzwm\.supabase\.co\//.test(u) ? u : '');
  const d = { readyState: 'complete', documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => el[id] || null, createElement: () => ({}), head: { appendChild() {} }, addEventListener(n, f) { if (n === 'click') sluchaczeDok.push(f); } };
  vm.runInNewContext(MODUL, { window: w, document: d, URLSearchParams, Date, Promise });
  const cz = (n) => wezel('[data-dn="' + n + '"]');
  const zmiana = (id) => obserwowane.filter(([c]) => c === el[id]).forEach(([, f]) => f());
  const dotknij = (co) => korzen._zd.click({ target: { wKorzeniu: true, closest: (sel) => (sel === '[data-dn],[data-sekcja]' ? { getAttribute: (k) => (k === 'data-dn' ? co : null) } : null) } });
  return { w, el, korzen, klasy, staryChip, stareFoto, obserwowane, wolania, sluchaczeDok, cz, zmiana, dotknij, B: w.BM_DZIS };
}
const tik = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('(1) avatar obok pola „Zapytaj”: inicjały ze starego paska; menu zamknięte, a w nim te same pozycje co w starym menu konta', () => {
  const s = strona(); s.B.start();
  const h = s.korzen.innerHTML;
  assert.match(h, /<div class="dn-rzad"><button type="button" class="dn-zapytaj"[^>]*>.*?<\/button><button type="button" class="dn-okr dn-awatar" data-dn="konto" aria-haspopup="menu" aria-expanded="false" aria-label="Konto"><span data-dn="inicjaly"><\/span><img data-dn="foto" alt="" hidden><\/button><\/div>/);
  const menu = h.match(/<div class="dn-menu" data-dn="menu" role="menu" hidden>(.*?)<\/div><div class="dn-zd"/)[1];
  assert.deepEqual([...menu.matchAll(/role="menuitem"[^>]*>([^<]+)</g)].map((m) => m[1]), ['Mój profil', 'Dźwięki', 'BiegaMy: Wyzwanie', 'O nas', 'Regulamin', 'Polityka prywatności', 'Wyloguj się']);
  assert.deepEqual([...menu.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ['gra.html', 'o-nas.html', 'terms.html', 'privacy.html']);
  // to samo, co ma stare menu (kolejność i adresy); gdyby stare menu się zmieniło, ten test każe zajrzeć i tutaj
  const stare = HTML.match(/<div id="av-menu"[\s\S]*?\n    <\/div>\n  <\/div>/)[0];
  assert.deepEqual([...stare.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]), ['gra.html', 'o-nas.html', 'terms.html', 'privacy.html']);
  assert.deepEqual([...stare.matchAll(/onclick="([a-zA-Z]+)\(\)/g)].map((m) => m[1]), ['goToMyProfile', 'toggleSoundSetting', 'logout']);
  assert.equal(s.cz('inicjaly').textContent, 'ON'); assert.equal(s.cz('foto').hidden, true);
  assert.equal(s.cz('email').hidden, true, '„...” to stan przed wczytaniem konta, nie adres');
  assert.equal(s.cz('m-dzwieki').textContent, 'Dźwięki: wł.', 'napis ze starego menu, bez emoji');
});

test('(2) dane konta dochodzą później niż moduł (initAuth): nasłuch przepisuje inicjały, adres, zdjęcie; zdjęcie tylko przez wspólny filtr adresów', () => {
  const s = strona(); s.B.start();
  for (const id of ['av-initials', 'av-photo', 'menu-email', 'sound-menu-item', 'back-to-trener']) assert.ok(s.obserwowane.some(([c]) => c === s.el[id]), 'nasłuch na #' + id);
  s.el['av-initials'].textContent = 'OLA NOWAK'; s.el['menu-email'].textContent = 'ola@example.test'; s.zmiana('menu-email');
  assert.equal(s.cz('inicjaly').textContent, 'OL', 'najwyżej dwie litery');
  assert.equal(s.cz('email').textContent, 'ola@example.test'); assert.equal(s.cz('email').hidden, false);
  s.stareFoto._src = FOTO; s.stareFoto.style.display = 'block'; s.zmiana('av-photo');
  assert.equal(s.cz('foto').src, FOTO); assert.equal(s.cz('foto').hidden, false); assert.equal(s.cz('inicjaly').hidden, true);
  s.stareFoto.style.display = 'none'; s.zmiana('av-photo');
  assert.equal(s.cz('foto').hidden, true, 'stary kod schował zdjęcie (błąd ładowania): wracają inicjały'); assert.equal(s.cz('inicjaly').hidden, false);
  for (const zly of ['javascript:alert(1)', 'https://zly.example/x.png', 'data:image/png;base64,AAAA']) {
    const x = strona({ foto: zly }); x.B.start();
    assert.equal(x.cz('foto').hidden, true, zly); assert.equal(x.cz('foto').src, undefined, zly + ' nie trafia do src');
  }
  const bez = strona({ foto: FOTO, bezFiltra: true }); bez.B.start();
  assert.equal(bez.cz('foto').hidden, true, 'bez filtra aplikacji zdjęcia nie pokazujemy wcale');
  assert.doesNotMatch(MODUL.replace(/^\s*\/\/.*$/gm, ''), /innerHTML = [^;]*(email|adres|inicjal)/i, 'dane konta idą przez textContent i src, nie przez HTML');
});

test('(3) menu: avatar otwiera i zamyka; pozycje wołają funkcje starego ekranu; każde inne dotknięcie i zmiana sekcji zamykają', async () => {
  const s = strona(); s.B.start();
  const menu = s.cz('menu'), guzik = s.cz('konto');
  s.dotknij('konto'); assert.equal(menu.hidden, false); assert.equal(guzik._a['aria-expanded'], 'true');
  s.dotknij('konto'); assert.equal(menu.hidden, true); assert.equal(guzik._a['aria-expanded'], 'false');
  s.dotknij('konto'); s.dotknij('menu'); assert.equal(menu.hidden, false, 'dotknięcie tła menu i odnośnika nie zamyka przed nawigacją');
  s.dotknij('m-profil'); assert.deepEqual(s.wolania, ['profil']); assert.equal(menu.hidden, true);
  s.dotknij('konto'); s.dotknij('m-dzwieki'); await tik();
  assert.deepEqual(s.wolania, ['profil', 'dzwieki']);
  assert.equal(s.cz('m-dzwieki').textContent, 'Dźwięki: wył.', 'napis po przełączeniu'); assert.equal(menu.hidden, false, 'po przełączeniu dźwięków menu zostaje, żeby było widać nowy stan');
  s.dotknij('m-wyloguj'); assert.deepEqual(s.wolania, ['profil', 'dzwieki', 'wyloguj'], 'wylogowanie robi stara funkcja (push, sesja, pamięć telefonu)'); assert.equal(menu.hidden, true);
  s.dotknij('konto'); s.dotknij('dzwonek'); assert.equal(menu.hidden, true, 'inne dotknięcie na ekranie zamyka menu');
  s.dotknij('konto'); assert.equal(s.sluchaczeDok.length, 1);
  s.sluchaczeDok[0]({ target: { wKorzeniu: true } }); assert.equal(menu.hidden, false, 'kliknięcie wewnątrz ekranu obsługuje sam ekran');
  s.sluchaczeDok[0]({ target: { wKorzeniu: false } }); assert.equal(menu.hidden, true, 'dotknięcie menu dolnego albo paska biegu zamyka');
  s.dotknij('konto'); s.w.showSection('forma'); assert.equal(menu.hidden, true, 'zmiana sekcji zamyka');
  s.B.start(); s.B.start(); assert.equal(s.sluchaczeDok.length, 1, 'jeden nasłuch dokumentu mimo wielu startów');
});

test('(4) chip „← Trener”: tylko gdy stary kod odsłonił swój; dotknięcie klika stary odnośnik; zostaje, gdy stary chowa się na czas momentu', () => {
  const zawodnik = strona(); zawodnik.B.start();
  assert.equal(zawodnik.cz('trener').hidden, true, 'zawodnik nie dostaje przycisku do panelu, do którego nie ma prawa');
  zawodnik.dotknij('trener'); assert.equal(zawodnik.staryChip.klikniec, 1);
  const pusty = strona({ chip: '' }); pusty.B.start(); assert.equal(pusty.cz('trener').hidden, true, 'pusty display to nie „odsłonięty”');
  const s = strona(); s.B.start();
  s.staryChip.style.display = 'block'; s.zmiana('back-to-trener');   // wykrycie trenera przychodzi po zapytaniu, później niż start modułu
  assert.equal(s.cz('trener').hidden, false);
  s.staryChip.style.display = 'none'; s.zmiana('back-to-trener');   // _chipSchowaj na czas banera momentu
  assert.equal(s.cz('trener').hidden, false, 'na nowym Dziś miejsce jest: chip zostaje');
  s.dotknij('trener'); assert.equal(s.staryChip.klikniec, 1, 'stary odnośnik: ten sam adres i to samo sprzątanie po podglądzie');
  assert.match(HTML, /<a id="back-to-trener" href="trener\.html" onclick="sessionStorage\.removeItem\('_fromTrener'\)" style="display:none;/);
  assert.match(s.korzen.innerHTML, /<header class="dn-naglowek[^>]*>(?:<img class="dn-kadr-o"[^>]*>)?(?:<span class="dn-kadr-g" aria-hidden="true"><\/span>)?<div><button type="button" class="dn-trener" data-dn="trener" hidden>← Trener<\/button><div class="dn-data"/);
  const wczesniej = strona({ chip: 'block' }); wczesniej.B.start();
  assert.equal(wczesniej.cz('trener').hidden, false, 'chip odsłonięty przed startem modułu');
  const podglad = strona({ chip: 'block', search: '?from=trener' }); podglad.B.start();
  assert.equal(podglad.korzen.innerHTML, '', 'podgląd trenera zostaje na starym ekranie');
});

test('(5) granice: moduł bez własnego wylogowania i bez sprzątania pamięci telefonu; cele dotyku 44 px; style tylko pod #dzis-nowy', () => {
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(kod, /signOut|sessionStorage.(clear|removeItem|setItem)|localStorage\.(clear|removeItem\((?!"dn_jp_szkic_" \+ id\)))/, 'wylogowanie i sprzątanie robi wyłącznie stara funkcja logout(); jedyny wyjątek: własny szkic odpowiedzi po zapisie albo „Pomiń” (blizna-404)');
  assert.match(MODUL, /#dzis-nowy \.dn-menu button,#dzis-nowy \.dn-menu a\{[^}]*min-height:44px/);
  for (const sel of MODUL.match(/[^"{}]*\.dn-(menu|awatar|trener|rzad)[^{]*\{/g)) for (const jeden of sel.replace(/\{$/, '').split(',')) assert.match(jeden.trim(), /^#dzis-nowy /, 'selektor poza nowym Dziś: ' + jeden);
});
