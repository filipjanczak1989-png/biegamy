/* BLIZNA 200 / PO STARCIE AKCJI: FRONT (Filip 9.11). Migracja: blizna-198. Funkcje: blizna-199.
   - murek darczyńców przypięty do widoku na Ulicy i na kaflu: złote i najnowsze z przodu, imię z wielkiej litery tylko do wyświetlenia, bez zgody cegła bez imienia,
     złota cegła większa z dymkiem „Złota cegła · dziękujemy”, przy wielu cegłach „+N” z listą; kwota nigdy;
   - kafel na Dziś: 4 przyciski bez mapy, krzyżyk „Ukryj” zapisany w profilu (akcja_kafel_ukryj), kopia w telefonie, przywrócenie w Ustawieniach;
   - panel: złota cegła przy wpisie i przy zatwierdzaniu (domyślnie od 100 zł); formularz cegiełki z kwotą opcjonalną;
   - „Dotarliśmy” nad koparką; mapa wyprawy = nagrobek (blizna-116 D). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

/* ── atrapa DOM sceny (jak blizna-151, z closest do dotknięć) ── */
class Wezel {
  constructor(tag) { this.tag = tag; this.atr = {}; this.dzieci = []; this.rodzic = null; this._tekst = ''; this.isConnected = true; this.clientWidth = 390; this.offsetWidth = 390; this.style = { setProperty() {} }; this.sl = {}; }
  setAttribute(k, v) { this.atr[k] = String(v); }
  getAttribute(k) { return k in this.atr ? this.atr[k] : null; }
  removeAttribute(k) { delete this.atr[k]; }
  appendChild(n) { n.rodzic = this; this.dzieci.push(n); return n; }
  insertBefore(n, ref) { n.rodzic = this; const i = this.dzieci.indexOf(ref); this.dzieci.splice(i < 0 ? this.dzieci.length : i, 0, n); return n; }
  removeChild(n) { this.dzieci.splice(this.dzieci.indexOf(n), 1); n.rodzic = null; return n; }
  get firstChild() { return this.dzieci[0] || null; }
  get nextSibling() { const r = this.rodzic; return r ? r.dzieci[r.dzieci.indexOf(this) + 1] || null : null; }
  get parentNode() { return this.rodzic; }
  set textContent(v) { this.dzieci = []; this._tekst = String(v); }
  get textContent() { return this._tekst + this.dzieci.map((d) => d.textContent).join(''); }
  set innerHTML(v) { throw new Error('innerHTML w module ulicy: ' + v); }
  get classList() {
    const n = this, k = () => (n.atr.class || '').split(/\s+/).filter(Boolean);
    return { add: (c) => { n.atr.class = [...new Set([...k(), c])].join(' '); }, remove: (c) => { n.atr.class = k().filter((x) => x !== c).join(' '); }, contains: (c) => k().includes(c), toggle: () => {} };
  }
  klasy() { return (this.atr.class || '').split(/\s+/).filter(Boolean); }
  pasuje(sel) { return sel.split(',').map((s) => s.trim()).some((s) => (s[0] === '.' ? this.klasy().includes(s.slice(1)) : s === '[data-u]' ? 'data-u' in this.atr : false)); }
  closest(sel) { for (let n = this; n; n = n.rodzic) if (n.pasuje && n.pasuje(sel)) return n; return null; }
  addEventListener(t, f) { (this.sl[t] = this.sl[t] || []).push(f); }
  removeEventListener() {}
  setPointerCapture() {}
  getContext() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 340 }; }
  querySelector() { return null; }
  wszystkie(acc = []) { acc.push(this); for (const d of this.dzieci) d.wszystkie(acc); return acc; }
}
function atrapaDokumentu() {
  const head = new Wezel('head');
  return { head, body: new Wezel('body'), hidden: false, createElement: (t) => new Wezel(t), createElementNS: (ns, t) => new Wezel(t), getElementById: (id) => head.wszystkie().find((n) => n.atr.id === id) || null, addEventListener() {}, removeEventListener() {} };
}
let nrImportu = 0;
async function modulSceny() {
  globalThis.document = atrapaDokumentu();
  globalThis.matchMedia = () => ({ matches: true });
  globalThis.addEventListener = globalThis.addEventListener || (() => {});
  globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
  globalThis.Image = class { set src(u) { queueMicrotask(() => this.onerror && this.onerror()); } };
  delete globalThis.BM_ULICA_SCENA;
  await import(pathToFileURL(path.join(KORZEN, 'js/moderacja.mjs')).href);
  await import(pathToFileURL(path.join(KORZEN, 'js/ulica.mjs')).href + '?n200=' + (++nrImportu));
  await import(pathToFileURL(path.join(KORZEN, 'js/ulica-scena.mjs')).href + '?n200=' + (++nrImportu));
  return { U: globalThis.BM_ULICA, S: globalThis.BM_ULICA_SCENA };
}
const TRWA = { wystartowala: true, suma_km: 3000, cel_km: 12500, imie: 'Atrapa', nazwa: 'Nazwa z bazy', firmy: [] };
const zamontowane = [];
test.afterEach(() => { while (zamontowane.length) zamontowane.pop().zniszcz(); });
function scena(S, ulica, o) { const k = new Wezel('div'), c = S.zamontuj(k, { ...TRWA, ulica }, o); assert.ok(c, 'scena wstała'); zamontowane.push(c); return k; }
const klasa = (k, c) => k.wszystkie().filter((n) => n.klasy().includes(c));
function dotknij(k, wezel) { const okno = klasa(k, 'us-okno')[0]; for (const f of okno.sl.click || []) f({ target: wezel, preventDefault() {}, stopPropagation() {} }); }
const cegly = (n, zlote, bezZgody) => Array.from({ length: n }, (_, i) => ({ i: i < bezZgody ? null : 'IMIE' + String.fromCharCode(65 + (i % 26)) + 'X', z: i < zlote }));

test('murek: Patryk złoty, z wielkiej litery, przypięty do okna (warstwa interfejsu, nie ulica), bez „+N”, czoło i podpowiedź nad murkiem', async () => {
  const { S } = await modulSceny();
  const k = scena(S, { imiona: ['PATRYK'], bez_imienia: 0, cegly: [{ i: 'PATRYK', z: true }], cegly_n: 1 });
  const murek = klasa(k, 'us-murek');
  assert.equal(murek.length, 1);
  assert.ok(murek[0].rodzic.klasy().includes('us-ui'), 'murek w warstwie interfejsu: kamera go nie przesuwa');
  const mc = klasa(k, 'us-mc');
  assert.equal(mc.length, 1); assert.equal(mc[0].tag, 'button'); assert.equal(mc[0]._tekst, 'Patryk', 'PATRYK → Patryk tylko w wyświetlaniu');
  assert.ok(mc[0].klasy().includes('us-mc--zlota')); assert.equal(mc[0].atr['aria-label'], 'Złota cegła: Patryk');
  assert.equal(klasa(k, 'us-mc-wiecej').length, 0);
  assert.ok(klasa(k, 'us-okno')[0].klasy().includes('us-okno--murek'));
  assert.equal(klasa(k, 'us-mur').length + klasa(k, 'us-cegla').length, 0, 'na ulicy nie ma starego muru na początku drogi');
  dotknij(k, mc[0]);
  const dymek = klasa(k, 'us-dymek')[0];
  assert.ok(dymek, 'dymek po dotknięciu');
  assert.equal(dymek.dzieci.find((n) => n.tag === 'b')._tekst, 'Patryk');
  assert.equal(klasa(dymek, 'us-dymek-zlota')[0]._tekst, 'Złota cegła · dziękujemy');
  assert.equal(dymek.style.bottom, '42px', 'dymek nad murkiem');
  const css = czytaj('js/ulica-scena.mjs');
  assert.match(css, /\.us-okno--murek \.us-czolo,\.us-okno--murek \.us-podpowiedz\{bottom:" \+ \(MUREK_H \+ 8\) \+ "px\}/);
});

test('murek: 10, 60 i 300 cegieł mieszczą się w szerokości okna, złote z przodu, reszta pod „+N” z listą; bez zgody bez imienia; kwota nigdy', async () => {
  const { S } = await modulSceny();
  for (const n of [10, 60, 300]) {
    const lista = cegly(n, 2, 0).concat([]);
    lista[5] = { i: null, z: false, kwota_gr: 987654 };
    const k = scena(S, { imiona: [], bez_imienia: 0, cegly: lista, cegly_n: n });
    const mc = klasa(k, 'us-mc').filter((c) => !c.klasy().includes('us-mc-wiecej'));
    const szer = mc.reduce((s, c) => s + parseFloat(c.style.width) + 4, 0) + (klasa(k, 'us-mc-wiecej').length ? 54 : 0);
    assert.ok(szer <= 390 - 12 + 4, n + ': cegły mieszczą się w oknie (' + szer + ' px)');
    assert.ok(mc[0].klasy().includes('us-mc--zlota') && mc[1].klasy().includes('us-mc--zlota') && !mc[2].klasy().includes('us-mc--zlota'), n + ': złote z przodu');
    const wiecej = klasa(k, 'us-mc-wiecej')[0];
    assert.ok(wiecej, n + ': „+N”'); assert.equal(wiecej._tekst, '+' + (n - mc.length));
    assert.doesNotMatch(JSON.stringify(k.wszystkie().map((w) => [w.atr, w._tekst])), /987654|kwota/i, 'kwota nie wchodzi do sceny');
    dotknij(k, wiecej);
    const l = klasa(k, 'us-murek-lista')[0];
    assert.ok(l, n + ': lista po dotknięciu „+N”');
    assert.equal(l.dzieci[0]._tekst, 'Mur darczyńców · ' + n + ' ' + (n === 10 ? 'cegieł' : n === 60 ? 'cegieł' : 'cegieł'));
    assert.match(l.textContent, /Złote cegły · dziękujemy/);
    assert.match(l.textContent, /I jeszcze 1 cegła bez imienia\. Dziękujemy!/);
    assert.equal(l.style.bottom, '42px');
  }
  const k2 = scena(S, { imiona: [], bez_imienia: 0, cegly: [{ i: null, z: false }, { i: 'ola', z: false }], cegly_n: 2 });
  const mc2 = klasa(k2, 'us-mc');
  assert.equal(mc2[0].tag, 'div'); assert.equal(mc2[0]._tekst, ''); assert.equal(mc2[0].atr['aria-hidden'], 'true', 'bez zgody: cegła bez imienia, nieklikalna');
  assert.equal(mc2[1]._tekst, 'Ola');
});

test('murek: długie imię ucięte w cegle (pełne w dymku), stara baza bez „cegly” = najnowsze imiona z przodu, pusty mur = bez murku, kafel też ma murek', async () => {
  const { U, S } = await modulSceny();
  const k = scena(S, { imiona: [], bez_imienia: 0, cegly: [{ i: 'Konstantynopolitanka', z: true }, { i: 'Bartłomiej-Maksymilian', z: false }], cegly_n: 2 });
  const mc = klasa(k, 'us-mc');
  assert.ok(parseFloat(mc[0].style.width) <= 120 && parseFloat(mc[1].style.width) <= 104, 'szerokość z limitem, reszta wielokropkiem w CSS');
  assert.match(czytaj('js/ulica-scena.mjs'), /"\.us-mc\{[^"]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis;/);
  dotknij(k, mc[1]);
  assert.equal(klasa(k, 'us-dymek')[0].dzieci.find((n) => n.tag === 'b')._tekst, 'Bartłomiej-Maksymilian', 'pełne imię w dymku');
  const stara = scena(S, { imiona: ['Ala', 'Ewa'], bez_imienia: 1 });
  assert.deepEqual(klasa(stara, 'us-mc').map((c) => c._tekst), ['Ewa', 'Ala', ''], 'bez migracji: od najnowszych, potem bez imienia');
  const pusta = scena(S, { imiona: [], bez_imienia: 0, cegly: [], cegly_n: 0 });
  assert.equal(klasa(pusta, 'us-murek').length, 0); assert.ok(!klasa(pusta, 'us-okno')[0].klasy().includes('us-okno--murek'));
  const kafel = scena(S, { cegly: [{ i: 'PATRYK', z: true }], cegly_n: 1 }, { kafel: true });
  assert.equal(klasa(kafel, 'us-mc')[0]._tekst, 'Patryk', 'mini-scena na Dziś: murek widoczny');
  assert.equal(U.ladneImie('ŁUKASZ'), 'Łukasz'); assert.equal(U.ladneImie('anna-MARIA'), 'Anna-Maria');
  assert.deepEqual([1, 2, 4, 5, 12, 21, 22, 300].map(U.odmianaCegly), ['cegła', 'cegły', 'cegły', 'cegieł', 'cegieł', 'cegieł', 'cegły', 'cegieł']);
  assert.deepEqual(U.ceglyMurku(U.zFirmamiNaMurze(U.dodatkiBezpieczne({ cegly: [{ i: 'ZENEK', z: false }, { i: 'PATRYK', z: true }], cegly_n: 2 }), { firmy: [{ rodzaj: 'cegielka', nazwa: 'BiegaMy' }] })).map((c) => c.tekst),
    ['Patryk', 'BiegaMy', 'Zenek'], 'złote, firmy (nazwa bez zmiany wielkości liter), potem reszta');
});

/* ── kafel na Dziś w piaskownicy (jak blizna-187) ── */
const UID = '11111111-2222-3333-4444-555555555555';
const D = { wystartowala: true, wystartowala_at: '2026-11-07T08:00:00Z', start: '2026-11-07', nazwa: 'Akcja', imie: 'Marek', cel_km: 12500, suma_km: 1900, pct: 15.2,
  stawka_filip_gr: 10, filip_gr: 19000, filip_max_gr: 125000, url_zbiorki: 'https://www.siepomaga.pl/x', firmy: [], ulica: { cegly: [{ i: 'PATRYK', z: true }], cegly_n: 1 } };
function element(id) {
  const dzieci = {}, e = { id, className: '', innerHTML: '', style: {}, hidden: false, children: [], atr: {}, sl: {}, classList: { add() {}, remove() {}, contains: () => false },
    setAttribute(k, v) { e.atr[k] = String(v); }, getAttribute: (k) => (k in e.atr ? e.atr[k] : null), appendChild(x) { e.children.push(x); x.parentNode = e; return x; },
    removeChild(x) { e.children = e.children.filter((y) => y !== x); }, addEventListener(t, f) { (e.sl[t] = e.sl[t] || []).push(f); },
    querySelector: (s) => (s === '.akcja-dzis' ? e.children.find((x) => x.className === 'akcja-dzis') || null : (dzieci[s] = dzieci[s] || element(s))), querySelectorAll: () => [] };
  return e;
}
function swiat(zapis, rpc) {
  const el = { 'akcja-karta': element('akcja-karta'), 'daily-motivation': element('daily-motivation') }, magazyn = Object.assign({}, zapis), wolania = [], tosty = [];
  const localStorage = { getItem: (k) => (k in magazyn ? magazyn[k] : null), setItem: (k, v) => { magazyn[k] = String(v); }, removeItem: (k) => { delete magazyn[k]; } };
  const document = { readyState: 'complete', addEventListener() {}, getElementById: (id) => el[id] || null, querySelectorAll: () => [], createElement: (t) => element(t), head: element('head') };
  const sb = { rpc: (n, a) => { wolania.push([n, a]); return Promise.resolve(rpc ? rpc(n, a) : { data: null, error: { message: 'brak' } }); } };
  const https = (u) => (/^https:\/\//.test(String(u || '')) ? String(u) : '');
  const ctx = { document, localStorage, Date, JSON, Math, Number, String, Intl, Promise, setTimeout: () => 0, console, sb, showToast: (t) => tosty.push(t), safeExternalHref: https, safeUrlAttr: https };
  ctx.globalThis = ctx;
  vm.runInNewContext(czytaj('js/akcja.mjs'), ctx);
  return { ctx, el, magazyn, wolania, tosty, kafel: () => el['daily-motivation'].children.find((x) => x.className === 'akcja-dzis') || null };
}
const sesja = { 'sb-afqojgkaveykxbltxzwm-auth-token': JSON.stringify({ user: { id: UID } }) };
const KLUCZ = 'bm_akcja_ukryta_dla-fabianka_' + UID;
const czekaj = () => new Promise((r) => setImmediate(r));

test('Ukryj: krzyżyk chowa kafel od razu, zapis w profilu (akcja_kafel_ukryj), w telefonie kopia; napis w Ustawieniach z imieniem z bazy; nic poza tym jednym wywołaniem', async () => {
  const s = swiat(sesja, (n) => (n === 'akcja_kafel_ukryty' ? { data: false, error: null } : { data: true, error: null }));
  s.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 3 });
  await czekaj();
  const k = s.kafel();
  assert.ok(k, 'kafel stoi');
  assert.match(k.innerHTML, /<button type="button" class="akcja-dzis-ukryj" aria-label="Ukryj kafel akcji" title="Ukryj">×<\/button>/);
  assert.equal(k.querySelector('.akcja-dzis-scena').atr.class, 'akcja-dzis-scena akcja-dzis-scena--murek', '„Zobacz ulicę” nad murkiem');
  assert.equal(s.magazyn.bm_akcja_etykieta_pokaz, 'Pokaż akcję Marka', 'imię z bazy, nie z kodu');
  s.wolania.length = 0;
  k.querySelector('.akcja-dzis-ukryj').sl.click[0]({ preventDefault() {}, stopPropagation() {} });
  assert.equal(s.kafel(), null, 'kafel znika od razu');
  assert.equal(s.magazyn[KLUCZ], 'czeka');
  await czekaj();
  assert.equal(JSON.stringify(s.wolania), JSON.stringify([['akcja_kafel_ukryj', { p_slug: 'dla-fabianka', p_ukryj: true }]]), 'tylko zapis w profilu: pushe i km bez zmian');
  assert.equal(s.magazyn[KLUCZ], '1');
  assert.match(s.tosty[0], /Kafel akcji zwinięty\. Dotknij paska, żeby go rozwinąć\./, '9.11 po wdrożeniu: krzyżyk zwija do paska (blizna-203)');
  s.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 3 });
  assert.equal(s.kafel(), null, 'kolejne odświeżenie nie przywraca');
});

test('Ukryj: profil jest źródłem: ukryty na innym telefonie chowa tu, „Pokaż” w Ustawieniach przywraca; błąd bazy i brak sesji niczego nie psują; bez sieci ukrycie dopisane przy następnym wejściu', async () => {
  const a = swiat(sesja, (n) => (n === 'akcja_kafel_ukryty' ? { data: true, error: null } : { data: true, error: null }));
  a.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 1 }); await czekaj();
  assert.equal(a.kafel(), null); assert.equal(a.magazyn[KLUCZ], '1', 'ukryty w profilu (inny telefon)');
  const b = swiat(Object.assign({ [KLUCZ]: '1' }, sesja), (n) => (n === 'akcja_kafel_ukryty' ? { data: false, error: null } : null));
  b.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 1 });
  assert.equal(b.kafel(), null, 'kopia w telefonie: bez mignięcia');
  await czekaj();
  assert.ok(b.kafel(), 'przywrócony w Ustawieniach: wraca'); assert.ok(!(KLUCZ in b.magazyn));
  const c = swiat(Object.assign({ [KLUCZ]: '1' }, sesja), () => ({ data: null, error: { message: 'function does not exist' } }));
  c.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 1 }); await czekaj();
  assert.equal(c.kafel(), null); assert.equal(c.magazyn[KLUCZ], '1', 'błąd bazy: zostaje wybór z telefonu');
  const d = swiat({}, () => ({ data: true, error: null }));
  d.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 1 }); await czekaj();
  assert.ok(d.kafel()); assert.equal(d.wolania.filter((w) => /^akcja_kafel_/.test(w[0])).length, 0, 'bez sesji nie pytamy o ukrycie');
  const e = swiat(Object.assign({ [KLUCZ]: 'czeka' }, sesja), () => ({ data: true, error: null }));
  e.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 1 }); await czekaj();
  assert.equal(JSON.stringify(e.wolania.filter((w) => /^akcja_kafel_/.test(w[0]))), JSON.stringify([['akcja_kafel_ukryj', { p_slug: 'dla-fabianka', p_ukryj: true }]])); assert.equal(e.magazyn[KLUCZ], '1');
  const p = swiat(sesja, (n) => (n === 'akcja_kafel_ukryty' ? { data: false, error: null } : { data: true, error: null }));
  p.ctx.BM_AKCJA.kartaDzisHtml(Object.assign({}, D, { testowa: true }), { km: 1 }); await czekaj();
  assert.equal(JSON.stringify(p.wolania.find((w) => /^akcja_kafel_/.test(w[0]))), JSON.stringify(['akcja_kafel_ukryty', { p_slug: 'proba' }]), 'konto testowe: próba osobno');
});

test('kafel: 4 przyciski bez mapy, „Zobacz film” i reszta karty bez zmian; Ustawienia: „Pokaż …” tylko gdy ukryty, czyści kopię w telefonie; imienia nie ma w kodzie', () => {
  const s = swiat({});
  const dane = s.ctx.BM_AKCJA.daneKaflaHtml(Object.assign({}, D, { firmy_zgloszenia: true, plakat_url: 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-wizerunek/plakat-akcji.webp' }));
  assert.equal(JSON.stringify((dane.match(/class="akcja-dzis-przycisk[ "][^>]*>[^<]+/g) || []).map((x) => x.replace(/^.*>/, ''))), JSON.stringify(['Plakat', 'Gra', 'Zbiórka', 'Twoja firma lub cegiełka na Ulicy']));
  const p = czytaj('profil.html');
  assert.match(p, /<div class="st-group" id="akcja-ukryta-section" style="display:none;">/);
  assert.match(p, /window\.sb\.rpc\('akcja_kafel_ukryty', \{ p_slug: slug \}\)/);
  assert.match(p, /window\.sb\.rpc\('akcja_kafel_ukryj', \{ p_slug: slug, p_ukryj: false \}\)/);
  assert.match(p, /k\.indexOf\('bm_akcja_ukryta_'\) === 0/, 'kopia w telefonie czyszczona');
  assert.match(p, /if \(!_isOwnProfile \|\| !window\.sb\) return;/);
  assert.match(p, /sprawdzUkrytaAkcje\(\);\n  return checkIntervalsStatus\(\);/);
  for (const plik of ['js/akcja.mjs', 'profil.html', 'js/ulica.mjs', 'js/ulica-scena.mjs', 'js/firmy-panel.mjs', 'js/firma-formularz.mjs', 'privacy.html', 'privacy-en.html']) {
    assert.doesNotMatch(czytaj(plik).replace(/dla-fabianka(\.html)?/g, ''), /fabian/i, plik + ': imię dziecka tylko z bazy');
  }
});

test('panel i formularz: złota cegła przy wpisie (akcja_cegla_zlota), przy zatwierdzaniu domyślnie od 100 zł, przy edycji zostaje; kwota cegiełki opcjonalna i niepubliczna', () => {
  const u = czytaj('js/ulica.mjs');
  assert.match(u, /sb\.rpc\("akcja_cegla_zlota", \{ p_id: c\.id, p_zlota: zi\.checked \}\)/);
  assert.match(u, /if \(r\.error \|\| r\.data !== true\) \{ zi\.checked = !zi\.checked;/, 'odmowa: przełącznik wraca');
  assert.match(u, /if \(c\.zlota === true\) \{\s+var zz = await sb\.rpc\("akcja_cegla_zlota", \{ p_id: r\.data\[0\]\.id, p_zlota: true \}\)/, 'edycja = nowy wpis, złota zostaje');
  assert.match(u, /zapytaj\("id,akcja_slug,imie,zgoda,dodano,zlota"\)/); assert.match(u, /bezZlotej = true; r = await zapytaj\("id,akcja_slug,imie,zgoda,dodano"\)/, 'stara baza: lista działa bez przełącznika');
  assert.doesNotMatch(u, /from\("akcja_cegielki"\)\.update/, 'bez UPDATE z przeglądarki (RLS bez zmian)');
  const fp = czytaj('js/firmy-panel.mjs');
  assert.match(fp, /zlota\.checked = z\.kwota_gr != null && z\.kwota_gr >= 10000;/);
  assert.match(fp, /dzialaj\(zlota \? \{ akcja: "zatwierdz", id: z\.id, zlota: zlota\.checked \} : \{ akcja: "zatwierdz", id: z\.id \}\)/);
  const ff = czytaj('js/firma-formularz.mjs');
  assert.match(ff, /pole\("ff-kwota-osoby", "Kwota wpłaty, zł \(nieobowiązkowa, nie jest publiczna; od 100 zł złota cegła\)"/);
  assert.match(ff, /if \(kw\) dane\.append\("kwota", kw\);/);
});

test('guzik: „⋯” i panel z „Dotarliśmy” nad koparką; guzik startu bez zmian; strona akcji bez linku do mapy; polityka bez publicznej mapy', () => {
  const s = czytaj('start-akcji.html');
  const zi = (sel) => Number((s.match(new RegExp('\\n  ' + sel + ' \\{[^}]*z-index: (\\d+)')) || [])[1]);
  assert.ok(zi('#panel') > 4 && zi('#wiecej') > 4, 'panel i „⋯” nad rysunkiem (z-index 2) i rozbłyskiem (4)');
  assert.match(s, /#krag img#postac \{ position: absolute; left: -11%; bottom: 3%; width: 122%; max-width: none; opacity: 1; transform-origin: 50% 96%; z-index: 2; \}/, 'koparka bez zmian');
  assert.match(s, /var PRZYTRZYMAJ_MS = 1000, PONOW_MS = 5000, OBWOD = 314\.16;/, 'guzik startu bez zmian');
  const f = czytaj('dla-fabianka.html');
  assert.doesNotMatch(f, /mapa-wyprawy|linkTrasy|id="trasa"/);
  assert.match(f, /var wy = A\.tekstWyprawy\(d\); \$\('wyprawa'\)\.hidden = !wy;/, 'linia wyprawy z km zostaje');
  for (const p of ['privacy.html', 'privacy-en.html']) assert.doesNotMatch(czytaj(p), /publiczn\w* map|public map/i, p);
});

/* 8 (Filip 9.11): DUPLIKATY. Na Dziś kafel u góry i karta „Centrum Akcji” niżej pokazywały to samo (Ulica, licznik, pasek, wkład, Gra, Zbiórka, Firma, plakat, film);
   na Społeczności karta wychodziła na górę, bo render po RPC ustawiał display:'' po przełączeniu zakładki. Zostaje kafel; karta tylko z tym, czego kafel nie ma. */
test('jedna wersja na Dziś: przy kafelku karta bez powtórek (nazwa, sponsor, „Więcej o akcji”); kafel ukryty = bez karty; bez banera karta pełna', async () => {
  const s = swiat(sesja, (n) => (n === 'akcja_kafel_ukryty' ? { data: false, error: null } : { data: true, error: null }));
  const html = s.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 3 });
  assert.ok(s.kafel(), 'kafel stoi');
  assert.match(html, /akcja-centrum--waska/);
  assert.match(html, /<div class="akcja-nazwa">Akcja<\/div>/); assert.match(html, /Więcej o akcji/);
  for (const powtorka of ['Twój wkład', 'Zagraj w Cegiełki', 'Wpłać na zbiórkę', 'Twoja firma na ulicy', 'Zobacz film', 'akcja-pasek', 'akcja-plakat', 'akcja-dzis-filip', 'akcja-filip']) assert.ok(!html.includes(powtorka), 'bez powtórki: ' + powtorka);
  const u = swiat(Object.assign({ [KLUCZ]: '1' }, sesja), () => ({ data: true, error: null }));
  assert.equal(u.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 3 }), '', 'kafel ukryty krzyżykiem: akcja znika z Dziś także z karty');
  globalThis.escapeHtml = (x) => String(x);
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href + '?n200=karta');
  const pelna = globalThis.BM_AKCJA.kartaDzisHtml(D, { km: 3 }, new Date('2026-11-09T12:00:00Z'), true);
  assert.match(pelna, /Twój wkład/); assert.match(pelna, /Zagraj w Cegiełki/, 'bez banera (inna strona): karta pełna jak dotąd');
});

test('Społeczność: karta akcji renderowana po przełączeniu zakładki wraca do ukrycia (window._currentSection), na Dziś zostaje', () => {
  const s = swiat(sesja, (n) => (n === 'akcja_kafel_ukryty' ? { data: false, error: null } : { data: true, error: null }));
  const zegary = []; s.ctx.setTimeout = (f) => { zegary.push(f); return zegary.length; };
  s.ctx._currentSection = 'social';
  const el = s.el['akcja-karta'];
  el.innerHTML = s.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 3 }); el.style.display = '';   // jak _renderKartyAkcji w zawodnik.html
  zegary.forEach((f) => f());
  assert.equal(el.style.display, 'none', 'na Społeczności karta schowana');
  s.ctx._currentSection = 'home'; zegary.length = 0;
  el.innerHTML = s.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 3 }); el.style.display = '';
  zegary.forEach((f) => f());
  assert.equal(el.style.display, '', 'na Dziś zostaje');
});
