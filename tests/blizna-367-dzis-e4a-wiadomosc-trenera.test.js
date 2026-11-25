// Blizna #367 (25.11.2026) — nowe Dziś, E4a: wiadomość od trenera w kaflu „Trening na dziś”.
//
// Stare Dziś ma sekcję „wiadomość od trenera” (najnowsza, bez limitu wieku). Nowe Dziś jej nie miało, więc zawodnik
// z trenerem nie widział na głównym ekranie, że trener coś napisał.
// Decyzje Filipa 25.11: wiadomość jako własne zapytanie w fali 2 (budżet konta z trenerem: 6, pilnuje blizna-357),
// tylko ŚWIEŻA, do 7 dni; starsza się nie pokazuje, bo wiadomość sprzed miesiąca jako „rada na dziś” myli.
// Wiersz otwiera rozmowę z trenerem tak samo jak „Napisz do trenera” w starej karcie. Moduł tylko czyta.
// Treść w kształcie z bazy: messages.body to tekst, czasem ze znacznikami zdjęcia albo GIF-a (starą kartę rysuje
// renderMessageBody); tu pokazujemy sam tekst, bez żadnego HTML z bazy.
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
const tik = async (n = 16) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const TERAZ = new Date(2026, 10, 25, 12, 0, 0).getTime(), D0 = new Date(TERAZ);
const temu = (dni, h = 0) => new Date(TERAZ - dni * 864e5 - h * 36e5).toISOString();
const wiad = (dni, body = 'Jutro spokojnie, nogi mają odpocząć.') => ({ body, sent_at: temu(dni) });

function strona({ trener = 'c-1', wiadomosci = [wiad(1)], odp = null, search = '', nazwa = 'Marek' } = {}) {
  const klasy = new Set(['dzis-nowy']), wezly = {}, zapytania = [], zgloszenia = [], czasomierze = [], wolania = [], obserwowane = [], st = { zegar: TERAZ };
  const wezel = (sel) => (wezly[sel] = wezly[sel] || { innerHTML: '', textContent: '', hidden: false, _a: {}, setAttribute(k, v) { this._a[k] = v; }, getAttribute(k) { return this._a[k] || null; }, removeAttribute(k) { delete this._a[k]; }, querySelector(s2) { return wezel(sel + ' ' + s2); }, querySelectorAll: () => [] });
  const korzen = { hidden: true, innerHTML: '', _a: {}, _zd: {}, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; }, querySelector: (s) => wezel(s), addEventListener(n, f) { this._zd[n] = f; }, contains: () => true };
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: 'Ola' }, 'zawodnik-bell-dot': { textContent: '', style: { display: 'none' } }, 'coach-nm': { textContent: nazwa } };
  const DANE = { athletes: { id: 'a-1', full_name: 'Ola Nowak', coach_id: trener }, 'rpc akcja_licznik': { wystartowala: false }, 'rpc akcja_moj_wklad': { km: 0 },
    trainings: [{ id: 't1', type: 'Spokojny', distance_km: 6, status: 'planned', description: 'Luźno.', coach_id: trener }], training_logs: [], messages: wiadomosci };
  const wyslij = (nazwaT, opis) => { const z = { nazwa: nazwaT, opis, stan: 'czeka' }; zapytania.push(z); return new Promise((ok, zle) => { z.odpowiedz = () => { if (z.stan !== 'czeka') return; z.stan = 'jest';
    const r = odp && nazwaT === 'messages' ? odp(z) : { data: DANE[nazwaT], error: null, status: 200 }; if (r instanceof Error) zle(r); else ok(r); }; }); };
  const lancuch = (t) => { const kroki = []; let p = null; const q = new Proxy({}, { get(_, k) { if (k === 'then') return (a, b) => (p = p || wyslij(t, kroki.join(''))).then(a, b); return (...arg) => { kroki.push('.' + k + '(' + arg.map((x) => JSON.stringify(x)).join(',') + ')'); return q; }; } }); return q; };
  const w = { _currentSection: 'home', location: { search, hash: '', pathname: '/zawodnik.html' }, URLSearchParams, navigator: { onLine: true }, _logKlienta(o) { zgloszenia.push(o.message); },
    setTimeout(f, ms) { czasomierze.push({ f, ms, zywy: true }); return czasomierze.length; }, clearTimeout(i) { if (czasomierze[i - 1]) czasomierze[i - 1].zywy = false; },
    showSection(n) { wolania.push('showSection ' + n); this._currentSection = n; }, openChatThread(a, b, c) { wolania.push('openChatThread ' + JSON.stringify([a, b, c])); },
    BM_AKCJA_CYTATY: { slugDla: () => 'ulica-glowna' }, MutationObserver: function (f) { this.observe = (cel) => obserwowane.push([cel, f]); },
    sb: { from: lancuch, rpc: (n) => { let p = null; return { then: (a, b) => (p = p || wyslij('rpc ' + n, '')).then(a, b) }; }, auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) } } };
  const d = { readyState: 'complete', documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => el[id] || null, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} };
  const DataT = class extends Date { constructor(...a) { if (a.length) super(...a); else super(st.zegar); } static now() { return st.zegar; } };
  vm.runInNewContext(MODUL, { window: w, document: d, URLSearchParams, Date: DataT, Promise, encodeURIComponent });
  async function doKonca() { await tik(); for (let i = 0; i < 12 && zapytania.some((x) => x.stan === 'czeka'); i++) { for (const x of zapytania.filter((y) => y.stan === 'czeka')) x.odpowiedz(); await tik(); } }
  const dotknij = (co) => korzen._zd.click({ target: { closest: (sel) => (sel === '[data-dn],[data-sekcja]' ? { getAttribute: (k) => (k === 'data-dn' ? co : null) } : null) } });
  return { w, el, korzen, zapytania, zgloszenia, czasomierze, wolania, obserwowane, doKonca, tik, dotknij, B: w.BM_DZIS, trening: wezel('[data-kafel="trening"]') };
}

test('(1) świeża wiadomość trenera stoi w kaflu treningu między przyciskiem wyniku a pasem działań; kto, kiedy, treść, „Czytaj ›”', async () => {
  const s = strona(); s.B.start(); await s.doKonca();
  assert.match(s.trening.innerHTML, /data-dn="zaloguj">Zaloguj wynik<\/button><button type="button" class="dn-rada" data-dn="rada"><span class="dn-rada-kto"><b>Marek<\/b><span>wczoraj<\/span><\/span><span class="dn-rada-t">Jutro spokojnie, nogi mają odpocząć\.<\/span><span class="dn-rada-w">Czytaj ›<\/span><\/button><div class="dn-dzialania" data-dn="dzialania"><\/div>$/);
  assert.equal(s.zapytania.filter((z) => z.nazwa === 'messages').length, 1);
  assert.deepEqual(s.zgloszenia, []);
  assert.match(strona({ nazwa: '' }).B.radaHtml(wiad(0), D0), /<b>Trener<\/b><span>dziś<\/span>/, 'bez imienia w starej sekcji: „Trener”');
  assert.match(HTML, /id="coach-nm">Trener</, 'imię trenera bierzemy z tego samego miejsca co stara sekcja');
  // zwykła kolejność z produkcji: wiadomość przychodzi, zanim stary kod dopisze imię trenera
  const p = strona({ nazwa: 'Trener' }); p.B.start(); await p.doKonca();
  assert.match(p.trening.innerHTML, /<b>Trener<\/b>/);
  p.el['coach-nm'].textContent = 'Marek'; p.obserwowane.filter(([c]) => c === p.el['coach-nm']).forEach(([, f]) => f());
  assert.match(p.trening.innerHTML, /<b>Marek<\/b><span>wczoraj<\/span>/, 'imię dopisane później trafia do wiersza');
  const bezW = strona({ wiadomosci: [] }); bezW.B.start(); await bezW.doKonca(); const przed = bezW.trening.innerHTML;
  bezW.trening.innerHTML = przed + '<!-- znacznik -->'; bezW.obserwowane.filter(([c]) => c === bezW.el['coach-nm']).forEach(([, f]) => f());
  assert.match(bezW.trening.innerHTML, /znacznik/, 'bez wiadomości zmiana imienia nie przerysowuje kafla');
});

test('(2) tylko do 7 dni: zapytanie pyta o okno 7 dni, a rysowanie drugi raz sprawdza wiek po kalendarzu telefonu', async () => {
  const B = strona().B;
  assert.equal(B.OKNO_WIADOMOSCI_DNI, 7);
  for (const dni of [0, 1, 6, 7]) assert.match(B.radaHtml(wiad(dni), D0), /dn-rada/, dni + ' dni: pokazujemy');
  for (const dni of [8, 9, 30, 400]) assert.equal(B.radaHtml(wiad(dni), D0), '', dni + ' dni: wiadomość sprzed ponad tygodnia nie udaje rady na dziś');
  assert.match(B.radaHtml(wiad(7), D0), /<span>7 dni temu<\/span>/);
  assert.equal(B.radaHtml(null, D0), ''); assert.equal(B.radaHtml({ body: 'x', sent_at: 'zła data' }, D0), ''); assert.equal(B.radaHtml({ body: '', sent_at: temu(1) }, D0), '');
  const s = strona(); s.B.start(); await s.doKonca();
  const z = s.zapytania.find((x) => x.nazwa === 'messages');
  assert.match(z.opis, /^\.select\("body,sent_at"\)\.eq\("athlete_id","a-1"\)\.eq\("sender","coach"\)\.gte\("sent_at","[^"]+"\)\.order\("sent_at",\{"ascending":false\}\)\.limit\(1\)$/);
  assert.equal(Math.round((TERAZ - new Date(z.opis.match(/gte\("sent_at","([^"]+)"/)[1]).getTime()) / 864e5), 7);
  const stara = strona({ wiadomosci: [wiad(9)] }); stara.B.start(); await stara.doKonca();   // gdyby baza mimo filtra oddała starszą
  assert.doesNotMatch(stara.trening.innerHTML, /dn-rada/);
  const pusta = strona({ wiadomosci: [] }); pusta.B.start(); await pusta.doKonca();
  assert.doesNotMatch(pusta.trening.innerHTML, /dn-rada/); assert.match(pusta.trening.innerHTML, /Zaloguj wynik/, 'bez wiadomości kafel jak dotąd');
});

test('(3) treść: sam tekst, żadnego HTML z bazy; zdjęcie albo GIF bez tekstu jako dopisek; długa wiadomość ucięta do 140 znaków', () => {
  const B = strona().B, t = (body) => (B.radaHtml({ body, sent_at: temu(0) }, D0).match(/<span class="dn-rada-t">(.*?)<\/span><span class="dn-rada-w">/) || [])[1];
  assert.equal(t('Zwykły tekst.'), 'Zwykły tekst.');
  assert.equal(t('Zobacz <img src="https://media.tenor.com/x.gif" class="chat-gif"> i daj znać'), 'Zobacz i daj znać', 'znacznik obrazka wycięty, tekst zostaje');
  assert.equal(t('<img src="https://media.tenor.com/x.gif">'), 'zdjęcie albo GIF'); assert.equal(t('<video src="x"></video>'), 'zdjęcie albo GIF');
  assert.equal(t('<script>alert(1)</script>'), 'alert(1)', 'znaczniki wycięte, reszta jako tekst');
  assert.equal(t('a < b i "cytat" & reszta'), 'a &lt; b i &quot;cytat&quot; &amp; reszta', 'znaki specjalne escapowane, nie interpretowane');
  assert.equal(t('<img src=x onerror=alert(1)'), '&lt;img src=x onerror=alert(1)', 'niedomknięty znacznik nie przechodzi jako HTML');
  assert.equal(t('&lt;b&gt;x'), '&amp;lt;b&amp;gt;x', 'encje z bazy nie są dekodowane (bez podwójnego dekodowania)');
  assert.equal(t('x'.repeat(200)), 'x'.repeat(137) + '…');
  assert.equal(t('  wiele   \n spacji  '), 'wiele spacji');
  assert.equal(B.radaHtml({ body: '<b></b>', sent_at: temu(0) }, D0), '', 'sam pusty znacznik: nic do pokazania');
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(kod, /renderMessageBody|innerHTML = [^;]*\.body/, 'treść z bazy nie trafia do HTML bez wycięcia znaczników i escapowania');
});

test('(4) dotknięcie otwiera rozmowę z trenerem jak „Napisz do trenera” w starej karcie; moduł niczego nie zapisuje', async () => {
  const s = strona(); s.B.start(); await s.doKonca();
  const przed = s.zapytania.length;
  s.dotknij('rada');
  assert.deepEqual(s.wolania, ['showSection msgs']);
  const t = s.czasomierze.filter((c) => c.zywy && c.ms === 400); assert.equal(t.length, 1);
  t[0].f(); assert.deepEqual(s.wolania, ['showSection msgs', 'openChatThread ["coach",null,null]']);
  assert.equal(s.zapytania.length, przed);
  assert.match(HTML, /showSection\('msgs'\);\s*setTimeout\(\(\) => \{ try \{ openChatThread\('coach', null, null\); \} catch \(e\) \{\} \}, 400\);/, 'ta sama droga co stary przycisk');
  const bezFunkcji = strona(); delete bezFunkcji.w.openChatThread; bezFunkcji.B.start(); await bezFunkcji.doKonca();
  bezFunkcji.dotknij('rada'); bezFunkcji.czasomierze.filter((c) => c.ms === 400).forEach((c) => c.f());
  assert.deepEqual(bezFunkcji.zgloszenia, [], 'brak starej funkcji nie jest błędem ekranu');
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(kod, /from\("messages"\)\.(insert|update|delete)/);
});

test('(5) bez trenera: zero zapytań o wiadomości; błąd zapytania nie psuje kafla treningu i zgłasza „wiadomosc”; kolejność odpowiedzi dowolna', async () => {
  const bez = strona({ trener: null }); bez.B.start(); await bez.doKonca();
  assert.equal(bez.zapytania.filter((z) => z.nazwa === 'messages').length, 0); assert.doesNotMatch(bez.trening.innerHTML, /dn-rada/);
  for (const [opis, r] of [['błąd bazy', { data: null, error: { message: 'x' }, status: 500 }], ['sieć', new Error('sieć')]]) {
    const s = strona({ odp: () => r }); s.B.start(); await s.doKonca();
    assert.match(s.trening.innerHTML, /Zaloguj wynik/, opis + ': trening jest'); assert.doesNotMatch(s.trening.innerHTML, /dn-rada|data-dn="ponow"/, opis);
    assert.deepEqual(s.zgloszenia, ['wiadomosc'], opis);
  }
  // wiadomość przychodzi PRZED treningiem: kafel rysuje się raz, już z wiadomością
  const s = strona(); s.B.start(); await s.tik();
  for (const z of s.zapytania.filter((x) => x.fala !== 2 && x.stan === 'czeka')) z.odpowiedz(); await s.tik();
  const m = s.zapytania.find((x) => x.nazwa === 'messages'), tr = s.zapytania.find((x) => x.nazwa === 'trainings');
  m.odpowiedz(); await s.tik();
  assert.equal(s.trening.innerHTML, '', 'sama wiadomość nie rysuje kafla bez planu');
  tr.odpowiedz(); await s.tik();
  assert.match(s.trening.innerHTML, /dn-rada/);
  // i odwrotnie: trening przed wiadomością
  const o = strona(); o.B.start(); await o.tik();
  for (const z of o.zapytania.filter((x) => x.stan === 'czeka')) z.odpowiedz(); await o.tik();
  const m2 = o.zapytania.find((x) => x.nazwa === 'messages'), tr2 = o.zapytania.find((x) => x.nazwa === 'trainings');
  tr2.odpowiedz(); await o.tik(); assert.match(o.trening.innerHTML, /Zaloguj wynik/); assert.doesNotMatch(o.trening.innerHTML, /dn-rada/);
  m2.odpowiedz(); await o.tik(); assert.match(o.trening.innerHTML, /dn-rada/, 'wiadomość dochodzi później i kafel ją dostaje');
  const trener = strona({ search: '?from=trener' }); trener.B.start(); await trener.doKonca();
  assert.equal(trener.zapytania.length, 0);
});
