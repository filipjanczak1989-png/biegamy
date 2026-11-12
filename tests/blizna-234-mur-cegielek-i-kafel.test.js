/* blizna-234 (12.11, punkty 2a–2c zadania o karcie akcji): kafel bez „Zobacz film startu”, „Zbiórka” na cały wiersz i jedno miejsce na „Bieg wirtualny”,
   mur cegiełek: na Dziś 5 pierwszych + „Cały mur (N)”, na stronie cały + „Zwiń do ostatnich 5”, wybór w localStorage w try/catch, strona akcji renderuje mur. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');

async function modul() {
  globalThis.escapeHtml = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  globalThis.safeUrlAttr = (u) => u; globalThis.safeExternalHref = (u) => u;
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  return globalThis.BM_AKCJA;
}
/* kształt z licznika: {i, z} (jak akcja_ulica_publiczna); co czwarta bez zgody (i = null) */
const cegly = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? { i: 'ZŁOTA-ANNA', z: true } : i % 4 === 3 ? { i: null, z: false } : { i: 'osoba' + i, z: false }));
const D = (n) => ({ wystartowala: true, nazwa: 'A', suma_km: 10, cel_km: 100, url_zbiorki: 'https://www.siepomaga.pl/x', firmy: [], firmy_zgloszenia: true, ulica: { cegly: cegly(n), cegly_n: n } });

test('kafel: bez przycisku filmu, Zbiórka na cały wiersz, jedno miejsce na „Bieg wirtualny”', async () => {
  const A = await modul();
  const k = A.daneKaflaHtml(D(3));
  assert.doesNotMatch(k, /Zobacz film|data-film-akcji|akcja-dzis-film/, 'przycisk filmu zdjęty');
  assert.match(czytaj('js/akcja.mjs'), /\.akcja-dzis-przycisk--zbiorka\{[^}]*grid-column:1\/-1/, 'Zbiórka na całą szerokość wiersza');
  assert.equal(A.przyciskBieguHtml(D(3)), '', 'miejsce na przycisk biegu: dziś puste');
  assert.match(czytaj('js/akcja.mjs'), /noreferrer">Zbiórka<\/a>' : ""\) \+\r?\n\s+przyciskBieguHtml\(d\) \+/, 'jedno oczywiste miejsce: zaraz po „Zbiórka”');
  assert.match(k, /class="akcja-mur akcja-mur--dzis"/, 'mur cegiełek w kaflu');
});

test('mur cegiełek: Dziś 5 + „Cały mur (N)”, strona cały + „Zwiń do ostatnich 5”, imiona ładnie, bez zgody pusta cegła, 0 cegieł = nic', async () => {
  const A = await modul();
  assert.equal(A.murCegielekHtml({ ulica: { cegly: [], cegly_n: 0 } }, { tryb: 'dzis' }), '');
  const d = A.murCegielekHtml(D(30), { tryb: 'dzis' });
  assert.equal((d.match(/class="akcja-mur-cegla/g) || []).length, 5, 'na Dziś pięć cegieł');
  assert.match(d, /Mur cegiełek <span>30<\/span>/); assert.match(d, /data-mur-rozwin="1">Cały mur \(30\)<\/button>/);
  assert.match(d, /akcja-mur-cegla akcja-mur-cegla--zlota">Złota-Anna</, 'złota pierwsza, imię z wielkiej litery po łączniku');
  assert.match(d, /akcja-mur-cegla akcja-mur-cegla--bez" aria-label="cegiełka bez imienia"><\/span>/, 'bez zgody pusta cegła');
  const s = A.murCegielekHtml(D(30), { tryb: 'strona' });
  assert.equal((s.match(/class="akcja-mur-cegla/g) || []).length, 30, 'na stronie cały mur');
  assert.match(s, /akcja-mur--pelny/); assert.match(s, /data-mur-rozwin="0">Zwiń do ostatnich 5<\/button>/);
  assert.match(A.murCegielekHtml(D(30), { tryb: 'dzis', rozwiniety: true }), /data-mur-rozwin="0">Zwiń<\/button>/, 'na Dziś po rozwinięciu „Zwiń”');
  assert.doesNotMatch(A.murCegielekHtml(D(5), { tryb: 'dzis' }), /data-mur-rozwin/, '5 cegieł: bez przycisku');
  assert.doesNotMatch(d + s, /<script|on[a-z]+=/i);
  const x = A.murCegielekHtml({ ulica: { cegly: [{ i: '<b>x</b>', z: false }], cegly_n: 1 } }, { tryb: 'dzis' });
  assert.ok(x.includes('&lt;b&gt;x&lt;/b&gt;') && !x.includes('<b>x</b>'), 'imię escapowane');
  const y = A.murCegielekHtml({ ulica: { cegly: [{ imie: 'ola', zlota: true }, { imie: null, zlota: false }], cegly_n: 2 } }, { tryb: 'dzis' });
  assert.match(y, /akcja-mur-cegla--zlota">Ola</, 'postać po js/ulica.mjs ({imie, zlota}) też czytana');
  assert.equal(A.cegielkiMuru({ ulica: { cegly: 'zle' } }).length, 0, 'śmieci z licznika = pusta lista');
  const poza = A.murCegielekHtml({ ulica: { cegly: cegly(2), cegly_n: 9 } }, { tryb: 'strona' });
  assert.match(poza, /i jeszcze 7 cegiełek/, 'liczba ponad listą z licznika');
});

test('wybór w localStorage w try/catch: brak pamięci nie psuje, zapis odczytywany; klucze osobno dla Dziś i strony', async () => {
  const A = await modul();
  const pam = {};
  globalThis.localStorage = { getItem: (k) => (k in pam ? pam[k] : null), setItem: (k, v) => { pam[k] = String(v); } };
  assert.equal((A.murCegielekHtml(D(30), { tryb: 'dzis' }).match(/class="akcja-mur-cegla/g) || []).length, 5, 'domyślnie Dziś zwinięty');
  pam[A.KLUCZ_MURU + 'dzis'] = '1';
  assert.equal((A.murCegielekHtml(D(30), { tryb: 'dzis' }).match(/class="akcja-mur-cegla/g) || []).length, 30, 'po wyborze rozwinięty');
  pam[A.KLUCZ_MURU + 'strona'] = '0';
  assert.equal((A.murCegielekHtml(D(30), { tryb: 'strona' }).match(/class="akcja-mur-cegla/g) || []).length, 5, 'strona zapamiętała zwinięcie');
  globalThis.localStorage = { getItem: () => { throw new Error('brak zgody'); }, setItem: () => { throw new Error('brak zgody'); } };
  assert.equal((A.murCegielekHtml(D(30), { tryb: 'strona' }).match(/class="akcja-mur-cegla/g) || []).length, 30, 'pamięć rzuca: domyślne dla strony');
  assert.match(czytaj('js/akcja.mjs'), /function murRozwiniety\(tryb\) \{ try \{/); assert.match(czytaj('js/akcja.mjs'), /function zapiszMur\(tryb, roz\) \{ try \{/);
  delete globalThis.localStorage;
});

test('strona akcji: mur cegiełek z licznika pod podpisem sceny, nad „O akcji”; kafel na Dziś: mur po przyciskach', () => {
  const h = czytaj('dla-fabianka.html');
  assert.match(h, /\$\('mur-cegielek'\)\.innerHTML = A\.murCegielekHtml \? A\.murCegielekHtml\(d, \{ tryb: 'strona' \}\) : '';/);
  assert.ok(h.indexOf('id="mur-cegielek"') < h.indexOf('id="o-akcji"'));
  assert.match(h, /#mur-cegielek \{ order: -3; \}/);
  const a = czytaj('js/akcja.mjs');
  assert.match(a, /murCegielekHtml\(d, \{ tryb: "dzis" \}\);\r?\n  \}/, 'kafel: mur na końcu daneKaflaHtml');
  assert.doesNotMatch(a.replace(/dla-fabianka(\.html)?/g, ''), /fabian/i, 'imię dziecka tylko z bazy');
});
