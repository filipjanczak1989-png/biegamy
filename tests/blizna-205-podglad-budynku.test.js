/* BLIZNA 205 / PODGLĄD BUDYNKU W FORMULARZU (zgłoszenie Filipa 9.11: „po wybraniu Firma i budynku nie ma podglądu”).
   Odtworzenie w Chrome na kodzie z produkcji (narzędzie ~/.cache/bm-wydajnosc/podglad-budynku.js): podgląd z logo rysował się, ale (1) dopiero po nazwie
   albo logo (warunek od cf577754, nie regresja żadnego commita) i (2) na samym dole formularza, pod zgodami, więc na telefonie po wyborze budynku nie było nic.
   Teraz: podgląd zaraz pod wyborem budynku, od razu po „Firma” i po każdej zmianie budynku, bez logo z pustą tablicą „Tu będzie Twoje logo”,
   po logo tablica 1:1 jak na Ulicy (ta sama budynekFirmy) i przewinięcie do podglądu; przy „Osoba” podgląd cegły. Na Ulicy firma bez logo dalej bez tablicy. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

/* ── atrapa DOM sceny (jak blizna-151/200) ── */
class Wezel {
  constructor(tag) { this.tag = tag; this.atr = {}; this.dzieci = []; this.rodzic = null; this._tekst = ''; this.isConnected = true; this.clientWidth = 380; this.style = { setProperty() {} }; this.sl = {}; }
  setAttribute(k, v) { this.atr[k] = String(v); } getAttribute(k) { return k in this.atr ? this.atr[k] : null; } removeAttribute(k) { delete this.atr[k]; }
  appendChild(n) { n.rodzic = this; this.dzieci.push(n); return n; }
  insertBefore(n, ref) { n.rodzic = this; const i = this.dzieci.indexOf(ref); this.dzieci.splice(i < 0 ? this.dzieci.length : i, 0, n); return n; }
  removeChild(n) { this.dzieci.splice(this.dzieci.indexOf(n), 1); n.rodzic = null; return n; }
  get firstChild() { return this.dzieci[0] || null; } get parentNode() { return this.rodzic; }
  set textContent(v) { this.dzieci = []; this._tekst = String(v); } get textContent() { return this._tekst + this.dzieci.map((d) => d.textContent).join(''); }
  set innerHTML(v) { throw new Error('innerHTML: ' + v); }
  get classList() { const n = this, k = () => (n.atr.class || '').split(/\s+/).filter(Boolean); return { add: (c) => { n.atr.class = [...new Set([...k(), c])].join(' '); }, remove: (c) => { n.atr.class = k().filter((x) => x !== c).join(' '); }, contains: (c) => k().includes(c), toggle() {} }; }
  klasy() { return (this.atr.class || '').split(/\s+/).filter(Boolean); }
  addEventListener(t, f) { (this.sl[t] = this.sl[t] || []).push(f); } removeEventListener() {}
  getContext() { return null; } getBoundingClientRect() { return { left: 0, top: 0, width: 380, height: 286 }; } querySelector() { return null; }
  wszystkie(acc = []) { acc.push(this); for (const d of this.dzieci) d.wszystkie(acc); return acc; }
}
let nr = 0;
async function scena() {
  const head = new Wezel('head');
  globalThis.document = { head, body: new Wezel('body'), hidden: false, createElement: (t) => new Wezel(t), createElementNS: (ns, t) => new Wezel(t), getElementById: (id) => head.wszystkie().find((n) => n.atr.id === id) || null, addEventListener() {}, removeEventListener() {} };
  globalThis.matchMedia = () => ({ matches: true });
  globalThis.addEventListener = globalThis.addEventListener || (() => {}); globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
  globalThis.Image = class { set src(u) { queueMicrotask(() => this.onerror && this.onerror()); } };
  delete globalThis.BM_ULICA_SCENA;
  await import(pathToFileURL(path.join(KORZEN, 'js/moderacja.mjs')).href);
  await import(pathToFileURL(path.join(KORZEN, 'js/ulica.mjs')).href + '?n205=' + (++nr));
  await import(pathToFileURL(path.join(KORZEN, 'js/ulica-scena.mjs')).href + '?n205=' + (++nr));
  return globalThis.BM_ULICA_SCENA;
}
const klasa = (k, c) => k.wszystkie().filter((n) => n.klasy().includes(c));

test('scena: podgląd bez logo = pusta tablica „Tu będzie Twoje logo” (domek i wieżowiec), z logo = tablica z obrazem; Ulica bez logo bez tablicy', async () => {
  const S = await scena();
  for (const [rodzaj, wiez] of [['domek', false], ['wiezowiec', true]]) {
    const k = new Wezel('div'), wolania = [];
    S.podgladFirmy(k, { nazwa: 'Piekarnia u Ani', rodzaj, logo: null }, (im, c) => wolania.push([im, c]));
    const t = klasa(k, 'us-bilbord').filter((x) => x.rodzic.atr['aria-label'] === 'Firma: Piekarnia u Ani');
    assert.equal(t.length, 1, rodzaj + ': jedna tablica przy budynku firmy');
    assert.equal(t[0].klasy().includes('us-bilbord--wiez'), wiez, rodzaj + ': tablica na elewacji tylko przy wieżowcu');
    assert.equal(klasa(t[0], 'us-bilbord-puste')[0].textContent, 'Tu będzie Twoje logo');
    assert.equal(klasa(t[0], 'us-bilbord-logo').length, 0, 'bez obrazu logo');
    assert.ok(klasa(k, 'us-szyld').some((s) => s.dzieci.map((d) => d.textContent).join(' ') === 'Piekarnia u Ani'), rodzaj + ': nazwa na szyldzie');
    assert.deepEqual(wolania, [[null, false]], 'naLogo: brak logo');
    if (wiez) assert.ok(k.wszystkie().some((n) => /wiezowiec\.webp/.test(n.atr.src || '')), 'obraz wieżowca');
    const z = new Wezel('div');
    S.podgladFirmy(z, { nazwa: 'Piekarnia u Ani', rodzaj, logo: 'blob:https://biegamy.run/abc' });
    const tz = klasa(z, 'us-bilbord').filter((x) => x.rodzic.atr['aria-label'] === 'Firma: Piekarnia u Ani')[0];
    assert.equal(klasa(tz, 'us-bilbord-logo')[0].atr.src, 'blob:https://biegamy.run/abc', rodzaj + ': logo na tablicy 1:1 (ta sama funkcja co Ulica)');
    assert.equal(klasa(tz, 'us-bilbord-puste').length, 0);
  }
  const u = new Wezel('div'), c = S.zamontuj(u, { wystartowala: true, suma_km: 3000, cel_km: 12500, imie: 'Atrapa', nazwa: 'A', firmy: [{ nazwa: 'Bez Logo', rodzaj: 'domek', link: 'https://a.example.pl' }] });
  assert.ok(c); const dom = u.wszystkie().find((n) => n.atr['aria-label'] === 'Firma: Bez Logo');
  assert.ok(dom, 'firma stoi na Ulicy'); assert.equal(klasa(dom, 'us-bilbord').length, 0, 'na Ulicy firma bez logo bez pustej tablicy (tylko podgląd)');
  c.zniszcz();
});

/* ── formularz na atrapie DOM: prawdziwy js/firma-formularz.mjs ── */
function el(tag) {
  const e = { tagName: tag.toUpperCase(), children: [], parentNode: null, atr: {}, sl: {}, style: {}, hidden: false, checked: false, files: null, _value: '', _tekst: '', className: '', id: '', name: '', type: '', przewinieto: 0,
    setAttribute(k, v) { e.atr[k] = String(v); if (k === 'class') e.className = String(v); }, getAttribute: (k) => (k in e.atr ? e.atr[k] : null),
    appendChild(x) { x.parentNode = e; e.children.push(x); return x; }, removeChild(x) { e.children = e.children.filter((y) => y !== x); x.parentNode = null; return x; },
    get firstChild() { return e.children[0] || null; },
    addEventListener(t, f) { (e.sl[t] = e.sl[t] || []).push(f); }, dispatch(t) { (e.sl[t] || []).forEach((f) => f({ target: e, preventDefault() {} })); },
    querySelector(s) { return wszystkie(e).find((x) => x !== e && (s[0] === '.' ? x.className.split(/\s+/).includes(s.slice(1)) : s[0] === '#' ? x.id === s.slice(1) : x.tagName === s.toUpperCase())) || null; },
    scrollIntoView() { e.przewinieto++; }, focus() {}, reset() {} };
  Object.defineProperty(e, 'textContent', { get: () => e._tekst + e.children.map((c) => c.textContent).join(''), set: (v) => { e._tekst = String(v); e.children = []; } });
  Object.defineProperty(e, 'value', { get: () => (e.tagName === 'SELECT' ? (e._value || (e.children.find((o) => o.tagName === 'OPTION') || {}).value || '') : e._value), set: (v) => { e._value = String(v); } });
  return e;
}
const wszystkie = (e, acc = []) => { acc.push(e); e.children.forEach((c) => wszystkie(c, acc)); return acc; };
async function formularz() {
  const wolania = [], document = { head: el('head'), body: el('body'), createElement: (t) => el(t), getElementById: () => null, querySelector: () => null };
  const U = { podgladFirmy: (k, f, naLogo) => { wolania.push({ ...f }); if (naLogo) naLogo(null, false); return Promise.resolve(); },
    podgladCegly: () => { wolania.push('cegla'); return Promise.resolve(); }, poprawneImie: () => true, ocenaLogo: () => [] };
  const ctx = { document, Promise, JSON, Math, Number, String, Object, Array, Error, RegExp, Uint8Array, console, setTimeout: (f) => { f(); return 1; }, clearTimeout() {},
    URL: { createObjectURL: () => 'blob:podglad-logo', revokeObjectURL() {} }, FormData: class {},
    BM_AKCJA: { zUlica: (cb) => cb(U), dopelniacz: (x) => x }, BM_LOGO_FIRMY: { przygotuj: () => Promise.resolve({ blob: 'BLOB' }) } };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.runInNewContext(czytaj('js/firma-formularz.mjs'), ctx);
  const s = el('section');
  assert.ok(ctx.BM_FIRMA_FORMULARZ.zamontuj(s, { wystartowala: true, firmy_zgloszenia: true, prog_domku_zl: 100, prog_wiezowca_zl: 1000, imie: 'Ala' }));
  const znajdz = (id) => wszystkie(s).find((x) => x.id === id);
  const czekaj = () => new Promise((r) => setImmediate(r));
  const wybierz = async (kto) => { znajdz('ff-kto-osoba').checked = kto === 'osoba'; znajdz('ff-kto-firma').checked = kto === 'firma'; znajdz('ff-kto-' + kto).dispatch('change'); await czekaj(); };
  return { s, wolania, znajdz, czekaj, wybierz, podglad: () => wszystkie(s).find((x) => x.className === 'ff-podglad'), firma: () => wszystkie(s).find((x) => x.className === 'ff-firma') };
}
const ost = (w) => w.filter((x) => x !== 'cegla').slice(-1)[0];

test('formularz: „Firma” od razu rysuje podgląd (bez nazwy i logo), zmiana budynku od razu, logo na tablicy i przewinięcie; osoba/firma tam i z powrotem', async () => {
  const F = await formularz();
  assert.equal(F.wolania[0], 'cegla', 'na starcie osoba: podgląd cegły');
  assert.equal(F.podglad().hidden, true);
  await F.wybierz('firma');
  assert.equal(JSON.stringify(ost(F.wolania)), JSON.stringify({ nazwa: 'Twoja firma', logo: null, rodzaj: 'domek' }), 'od razu po „Firma”: domek z pustą tablicą');
  assert.equal(F.podglad().hidden, false, 'podgląd widoczny bez nazwy i bez logo');
  const rodzaj = F.znajdz('ff-rodzaj');
  rodzaj.value = 'wiezowiec'; rodzaj.dispatch('change'); await F.czekaj();
  assert.equal(ost(F.wolania).rodzaj, 'wiezowiec', 'zmiana budynku od razu zmienia podgląd'); assert.equal(ost(F.wolania).logo, null);
  const logo = F.znajdz('ff-logo');
  logo.files = [{ name: 'logo.png', size: 1000, type: 'image/png' }]; logo.dispatch('change'); await F.czekaj(); await F.czekaj();
  assert.equal(JSON.stringify(ost(F.wolania)), JSON.stringify({ nazwa: 'Twoja firma', logo: 'blob:podglad-logo', rodzaj: 'wiezowiec' }), 'logo przygotowane jak do wysyłki trafia na tablicę');
  assert.equal(F.podglad().przewinieto, 1, 'po wyborze logo przewinięcie do podglądu');
  const nazwa = F.znajdz('ff-nazwa');
  nazwa.value = 'Piekarnia u Ani'; nazwa.dispatch('input'); await F.czekaj(); await F.czekaj();
  assert.equal(ost(F.wolania).nazwa, 'Piekarnia u Ani', 'nazwa na szyldzie');
  const ile = F.wolania.length;
  await F.wybierz('osoba');
  assert.equal(F.wolania.slice(ile).join(), 'cegla', 'przy „Osoba” tylko podgląd cegły'); assert.equal(F.firma().hidden, true);
  await F.wybierz('firma'); await F.czekaj();
  assert.equal(JSON.stringify(ost(F.wolania)), JSON.stringify({ nazwa: 'Piekarnia u Ani', logo: 'blob:podglad-logo', rodzaj: 'wiezowiec' }), 'powrót do „Firma”: ten sam budynek z logo');
  rodzaj.value = 'domek'; rodzaj.dispatch('change'); await F.czekaj(); await F.czekaj();
  assert.equal(JSON.stringify(ost(F.wolania)), JSON.stringify({ nazwa: 'Piekarnia u Ani', logo: 'blob:podglad-logo', rodzaj: 'domek' }), 'zmiana budynku po logo: logo zostaje');
  assert.equal(F.podglad().przewinieto, 1, 'zmiana budynku nie przewija (tylko wybór logo)');
});

test('formularz: podgląd stoi zaraz pod wyborem budynku (przed nazwą i logo), nie na dole pod zgodami', async () => {
  const F = await formularz();
  const firma = F.firma(), i = (x) => firma.children.indexOf(x);
  const etykietaBudynku = firma.children.find((x) => x.children.some((c) => c.id === 'ff-rodzaj'));
  const etykietaNazwy = firma.children.find((x) => x.children.some((c) => c.id === 'ff-nazwa'));
  const etykietaLogo = firma.children.find((x) => x.children.some((c) => c.id === 'ff-logo'));
  assert.equal(i(F.podglad()), i(etykietaBudynku) + 1, 'zaraz pod wyborem budynku');
  assert.ok(i(F.podglad()) < i(etykietaNazwy) && i(F.podglad()) < i(etykietaLogo));
  const zrodlo = czytaj('js/firma-formularz.mjs');
  assert.doesNotMatch(zrodlo, /if \(!plikLogo && !n\) \{ podglad\.hidden = true;/, 'bez warunku „nazwa albo logo” (powód, przez który podglądu nie było)');
  assert.match(czytaj('js/ulica-scena.mjs'), /if \(!f\.logo\) \{ el\("span", "us-bilbord-puste", mata, "Tu będzie Twoje logo"\); return t; \}/);
});
