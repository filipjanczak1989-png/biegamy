/* BLIZNA 210 / WIZYTÓWKA FIRMY PO TAPIE W DOMEK (Filip 10.11, C). Istniejący dymek rozbudowany, nie przepisany:
   - logo na macie z tą samą regułą co tablica (U.ciemnaMata: jasne → #2a2a2a, ciemne → #f6f1e7), szerokość dymka ≥ 160 px;
   - nazwa, „Wpłata: … zł” WYŁĄCZNIE gdy licznik oddał kwota_gr (akcja_licznik oddaje ją tylko przy zgoda_na_kwote, sprawdzone na prod 10.11), podpis partnera, plakat, „Strona firmy ›” z rel bez zmian;
   - zamykanie jak dotąd: tap w tło, Esc, przesunięcie kamery; bez <dialog>. Atrapa DOM jak w blizna-200. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const S_TXT = czytaj('js/ulica-scena.mjs');

class Wezel {
  constructor(tag) { this.tag = tag; this.atr = {}; this.dzieci = []; this.rodzic = null; this._tekst = ''; this.isConnected = true; this.clientWidth = 390; this.offsetWidth = 390; this.style = { setProperty() {} }; this.sl = {}; }
  setAttribute(k, v) { this.atr[k] = String(v); }
  getAttribute(k) { return k in this.atr ? this.atr[k] : null; }
  removeAttribute(k) { delete this.atr[k]; }
  appendChild(n) { n.rodzic = this; this.dzieci.push(n); return n; }
  insertBefore(n, ref) { n.rodzic = this; const i = this.dzieci.indexOf(ref); this.dzieci.splice(i < 0 ? this.dzieci.length : i, 0, n); return n; }
  removeChild(n) { this.dzieci.splice(this.dzieci.indexOf(n), 1); n.rodzic = null; return n; }
  get firstChild() { return this.dzieci[0] || null; }
  get parentNode() { return this.rodzic; }
  set textContent(v) { this.dzieci = []; this._tekst = String(v); }
  get textContent() { return this._tekst + this.dzieci.map((d) => d.textContent).join(''); }
  set innerHTML(v) { throw new Error('innerHTML w module ulicy: ' + v); }
  get classList() { const n = this, k = () => (n.atr.class || '').split(/\s+/).filter(Boolean); return { add: (c) => { n.atr.class = [...new Set([...k(), c])].join(' '); }, remove: (c) => { n.atr.class = k().filter((x) => x !== c).join(' '); }, contains: (c) => k().includes(c), toggle: () => {} }; }
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
  globalThis.addEventListener = globalThis.addEventListener || (() => {}); globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
  globalThis.Image = class { set src(u) { queueMicrotask(() => this.onerror && this.onerror()); } };
  globalThis.SB_URL = 'https://afqojgkaveykxbltxzwm.supabase.co'; globalThis.safeUrlAttr = (u) => u; globalThis.safeExternalHref = (u) => u;   // pomocnicy z sb.js (link firmy, logo)
  delete globalThis.BM_ULICA_SCENA;
  await import(pathToFileURL(path.join(KORZEN, 'js/moderacja.mjs')).href);
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href + '?n210=' + (++nrImportu));
  await import(pathToFileURL(path.join(KORZEN, 'js/ulica.mjs')).href + '?n210=' + (++nrImportu));
  await import(pathToFileURL(path.join(KORZEN, 'js/ulica-scena.mjs')).href + '?n210=' + (++nrImportu));
  return { U: globalThis.BM_ULICA, S: globalThis.BM_ULICA_SCENA };
}
const LOGO = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/00000000-0000-4000-8000-000000000001.png';
const FIRMY = [
  { nazwa: 'Piekarnia u Ani', rodzaj: 'domek', link: 'https://piekarnia.example.pl', logo_url: LOGO, wsparcie: 'wplata', kwota_gr: 150000 },
  { nazwa: 'Biuro Bez Zgody', rodzaj: 'domek', link: 'https://biuro.example.pl', logo_url: LOGO, wsparcie: 'wplata' },
  { nazwa: 'Fabryka Mebli', rodzaj: 'fabryka', link: 'https://fabryka.example.pl', logo_url: LOGO, wsparcie: 'poprzednie', plakat_tekst: 'Plakat' },
  { nazwa: 'Bez Logo', rodzaj: 'domek', wsparcie: 'wplata', kwota_gr: 0 },
];
const TRWA = { wystartowala: true, suma_km: 3000, cel_km: 12500, imie: 'Atrapa', nazwa: 'Nazwa z bazy', firmy: FIRMY, ulica: { imiona: [], bez_imienia: 0, cegly: [], cegly_n: 0, odblokowane: [] } };
const zamontowane = [];
test.afterEach(() => { while (zamontowane.length) zamontowane.pop().zniszcz(); });
const klasa = (k, c) => k.wszystkie().filter((n) => n.klasy().includes(c));
function dotknij(k, wezel) { const okno = klasa(k, 'us-okno')[0]; for (const f of okno.sl.click || []) f({ target: wezel, preventDefault() {}, stopPropagation() {} }); }
function dymekPo(k, nazwa, prostokat) { const d = klasa(k, 'us-domek').find((n) => n.atr['aria-label'] === 'Firma: ' + nazwa); assert.ok(d, nazwa + ' stoi na Ulicy'); if (prostokat) d.getBoundingClientRect = () => prostokat; dotknij(k, d); const b = klasa(k, 'us-dymek')[0]; assert.ok(b, 'dymek po dotknięciu'); return b; }

test('dane sceny z licznika: kwota_gr tylko jako liczba > 0, inaczej null (licznik i tak oddaje ją tylko za zgodą)', async () => {
  const { U } = await modulSceny();
  const f = U.daneScenyZLicznika(TRWA).firmy, po = (n) => f.find((x) => x.nazwa === n);
  assert.equal(po('Piekarnia u Ani').kwota_gr, 150000); assert.equal(po('Biuro Bez Zgody').kwota_gr, null); assert.equal(po('Bez Logo').kwota_gr, null);
  assert.equal(U.daneScenyZLicznika({ ...TRWA, firmy: [{ nazwa: 'X', kwota_gr: '12 zł' }] }).firmy[0].kwota_gr, null, 'śmieci = null');
});

test('tap w domek: logo na macie, nazwa, kwota tylko przy zgodzie, podpis partnera, link z rel; bez logo bez maty; zamykanie jak dotąd', async () => {
  const { S } = await modulSceny();
  const k = new Wezel('div'), c = S.zamontuj(k, TRWA, {}); assert.ok(c); zamontowane.push(c);
  const b1 = dymekPo(k, 'Piekarnia u Ani');
  const mata = klasa(b1, 'us-dymek-mata'); assert.equal(mata.length, 1, 'logo na macie'); assert.equal(mata[0].dzieci[0].tag, 'img'); assert.equal(mata[0].dzieci[0].atr.crossorigin, 'anonymous', 'odczyt jasności przez ciemnaMata');
  assert.equal(b1.dzieci.indexOf(mata[0]), 0, 'mata na górze dymka');
  assert.equal(b1.dzieci.find((n) => n.tag === 'b')._tekst, 'Piekarnia u Ani');
  assert.equal(klasa(b1, 'us-dymek-kwota')[0]._tekst, 'Wpłata: 1500 zł', 'kwota jak na liście firm (akcja.mjs „Wpłata: … zł”, toLocaleString pl-PL: cztery cyfry bez odstępu, pięć ze spacją)');
  const a = b1.dzieci.find((n) => n.tag === 'a'); assert.equal(a._tekst, 'Strona firmy ›'); assert.equal(a.atr.href, 'https://piekarnia.example.pl/'); assert.equal(a.atr.target, '_blank'); assert.equal(a.atr.rel, 'noopener noreferrer nofollow');
  assert.ok(Number(b1.style.left.replace('px', '')) >= 8 && Number(b1.style.left.replace('px', '')) + 200 <= 390, 'dymek w oknie 390 px: ' + b1.style.left);
  assert.equal(b1.style.top, '58px', 'budynek u góry okna: dymek nie wchodzi pod nakładkę licznika');
  /* dół z faktycznej wysokości (Filip 10.11): budynek na dole sceny (top 300); atrapa bez pomiaru (offsetHeight brak) → zapas 90; z pomiarem 180 px top = 340 − 180 − 8 */
  const nisko = { left: 100, top: 300, width: 160, height: 131 };
  assert.equal(dymekPo(k, 'Piekarnia u Ani', nisko).style.top, (340 - 90 - 8) + 'px', 'bez pomiaru: zapas 90 px');
  Object.defineProperty(Wezel.prototype, 'offsetHeight', { configurable: true, get() { return this.klasy().includes('us-dymek') ? 180 : 0; } });
  assert.equal(dymekPo(k, 'Piekarnia u Ani', nisko).style.top, (340 - 180 - 8) + 'px', 'z pomiarem: cały dymek w oknie, 8 px od dołu');
  delete Wezel.prototype.offsetHeight;
  const b2 = dymekPo(k, 'Biuro Bez Zgody');
  assert.equal(klasa(b2, 'us-dymek-kwota').length, 0, 'bez kwota_gr z licznika kwoty nie ma'); assert.equal(klasa(k, 'us-dymek').length, 1, 'nowy dymek zamyka poprzedni');
  const b3 = dymekPo(k, 'Fabryka Mebli');
  assert.equal(b3.dzieci.find((n) => n.tag === 'i')._tekst, 'Partner poprzednich wyzwań'); assert.ok(b3.dzieci.some((n) => n.tag === 'span' && n._tekst === 'Plakat'), 'plakat w dymku bez zmian'); assert.equal(klasa(b3, 'us-dymek-kwota').length, 0);
  const b4 = dymekPo(k, 'Bez Logo');
  assert.equal(klasa(b4, 'us-dymek-mata').length, 0, 'bez logo bez maty'); assert.equal(klasa(b4, 'us-dymek-kwota').length, 0, 'kwota 0 = brak');
  /* logo się nie wczyta: mata znika, reszta zostaje */
  const b5 = dymekPo(k, 'Piekarnia u Ani'); const img = klasa(b5, 'us-dymek-mata')[0].dzieci[0]; img.onerror();
  assert.equal(klasa(b5, 'us-dymek-mata').length, 0); assert.equal(b5.dzieci.find((n) => n.tag === 'b')._tekst, 'Piekarnia u Ani');
  /* zamykanie: tap w tło i Esc (istniejące drogi) */
  dotknij(k, klasa(k, 'us-okno')[0]); assert.equal(klasa(k, 'us-dymek').length, 0, 'tap w tło zamyka');
  dymekPo(k, 'Piekarnia u Ani'); for (const f of klasa(k, 'us-okno')[0].sl.keydown || []) f({ key: 'Escape', preventDefault() {} }); assert.equal(klasa(k, 'us-dymek').length, 0, 'Esc zamyka');
});

test('źródło: szerokość ≥ 160 px i jedna stała, mata z regułą ciemnaMata, kwota tylko > 0, bez <dialog>', () => {
  const w = Number(/var DYMEK_SZER = (\d+),/.exec(S_TXT)[1]); assert.ok(w >= 160, 'DYMEK_SZER ' + w);
  assert.match(S_TXT, /\.us-dymek\{position:absolute;width:" \+ DYMEK_SZER \+ "px;/); assert.match(S_TXT, /ro\.width - DYMEK_SZER - 8, r\.left - ro\.left \+ r\.width \/ 2 - DYMEK_SZER \/ 2/, 'położenie z tej samej stałej');
  assert.match(S_TXT, /lg\.onload = function \(\) \{ if \(U\.ciemnaMata\(lg\)\) mata\.classList\.add\("us-dymek-mata--ciemna"\); \};/);
  assert.match(S_TXT, /\.us-dymek-mata\{[^}]*background:#f6f1e7/); assert.match(S_TXT, /\.us-dymek-mata--ciemna\{background:#2a2a2a\}/); assert.match(S_TXT, /\.us-dymek-mata img\{[^}]*object-fit:contain/);
  assert.match(S_TXT, /if \(karta && karta\.kwota_gr > 0\) el\("span", "us-dymek-kwota", b, "Wpłata: " \+ zl\(karta\.kwota_gr\)\);/);
  assert.match(S_TXT, /var wys = Number\(b\.offsetHeight\) > 0 \? Number\(b\.offsetHeight\) : DYMEK_WYS_ZAPAS, dolOkna = WYS - 8 - \(okno\.classList\.contains\("us-okno--murek"\) \? MUREK_H : 0\);\n\s*b\.style\.top = Math\.max\(58, Math\.min\(dolOkna - wys, r\.top - ro\.top \+ 6\)\)/, 'top z faktycznej wysokości dymka (nie ze stałej 90), nad murkiem darczyńców');
  assert.match(S_TXT, /\.us-dymek>span\{display:block;margin-top:2px\}/, 'tekst plakatu w osobnej linii, link pod nim');
  assert.doesNotMatch(S_TXT, /<dialog|showModal|\.us-dymek img\{/, 'dymek zostaje dymkiem; stare CSS obrazka usunięte');
  const { S } = { S: null }; void S;
  assert.match(S_TXT, /okno\.addEventListener\("keydown", naKlawisz\)/, 'Esc działa, gdy fokus jest w oknie Ulicy (po tapie w domek fokus jest na przycisku domku)');
  assert.match(czytaj('js/ulica.mjs'), /kwota_gr: Number\(f\.kwota_gr\) > 0 \? Number\(f\.kwota_gr\) : null \};/);
});
