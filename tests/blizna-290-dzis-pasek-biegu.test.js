/* BLIZNA 290 / 18.11: pasek biegu na Dziś (zawodnik.html, wyjątek od zamrożenia: jeden element #bieg-pasek i jedno wywołanie w _odswiezStanAkcji).
   „🎅 {nazwa biegu} · Zapisz się ›” → bieg.html, tylko gdy bieg otwarty (faza zapisy/trwa, pole bieg licznika akcji) i konto bez aktywnego zapisu „ja”
   (akcja_bieg_moi). Zapisany: nic. Krzyżyk chowa na ten bieg (localStorage). Brak danych albo błąd = brak paska. Nic na Dziś nie czeka na pasek.
   Tekst wyłącznie przez textContent, nazwa z bazy. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
let A;
test.before(async () => {
  const SB = zaladujSb(); for (const k of ['escapeHtml', 'safeExternalHref', 'safeUrlAttr', 'SB_URL']) globalThis[k] = SB[k];
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href); A = globalThis.BM_AKCJA;
});
const BIEG = (x) => Object.assign({ slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka', faza: 'trwa', dzien_od: '2026-11-18', dzien_do: '2026-12-06' }, x || {});
const L = (bieg, x) => Object.assign({ wystartowala: true, testowa: false, bieg }, x || {});

/* mały DOM: tyle, ile rysuje pasek */
function el(tag) {
  const e = { tag, dzieci: [], attrs: {}, style: { cssText: '' }, hidden: true, href: '', type: '', h: {},
    appendChild(c) { this.dzieci.push(c); return c; }, setAttribute(n, v) { this.attrs[n] = String(v); }, addEventListener(t, f) { this.h[t] = f; } };
  let t = ''; Object.defineProperty(e, 'textContent', { get: () => t + e.dzieci.map((c) => c.textContent).join(''), set: (v) => { t = String(v); e.dzieci = []; } });
  Object.defineProperty(e, 'innerHTML', { set: () => { throw new Error('pasek nie używa innerHTML'); } });
  return e;
}
function srodowisko(rpc) {
  const ls = new Map(), wolania = [];
  globalThis.document = { createElement: el };
  globalThis.localStorage = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) };
  const sb = { rpc: (n, a) => { wolania.push([n, a]); return rpc(n, a); } };
  return { ls, wolania, sb, pasek: el('div') };
}

test('stan paska: otwarty bieg i konto bez zapisu „ja”; w każdym innym przypadku brak', () => {
  assert.deepEqual(A.stanPaskaBiegu(L(BIEG()), []), { slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka', href: 'bieg.html' });
  assert.equal(A.stanPaskaBiegu(L(BIEG({ faza: 'zapisy' })), []).href, 'bieg.html');
  assert.equal(A.stanPaskaBiegu(L(BIEG(), { testowa: true }), []).href, 'bieg.html?proba=1', 'konto testowe: licznik próby, bieg próbny');
  assert.ok(A.stanPaskaBiegu(L(BIEG()), [{ rodzaj: 'dziecko', numer: 3 }]), 'same dzieci = konto bez zapisu „ja”: pasek jest');
  for (const [opis, d, moi, ukryty] of [['zapisany „ja”', L(BIEG()), [{ rodzaj: 'ja', numer: 7 }]], ['faza wyniki', L(BIEG({ faza: 'wyniki' })), []], ['zakończony', L(BIEG({ faza: 'zakonczony' })), []],
    ['bez pola bieg (szkic)', L(null), []], ['bieg nie-obiekt', L('<b>x</b>'), []], ['brak licznika', null, []], ['błąd zapisów (null)', L(BIEG()), null], ['schowany krzyżykiem', L(BIEG()), [], true]]) {
    assert.equal(A.stanPaskaBiegu(d, moi, ukryty), null, opis);
  }
});

test('pasek: textContent z nazwą z bazy, link, krzyżyk chowa na ten bieg (także po odświeżeniu)', async () => {
  const s = srodowisko(async () => ({ data: [] }));
  const st = await A.pasekBiegu(s.pasek, L(BIEG({ nazwa: '<img src=x onerror=alert(1)>' })), s.sb);
  assert.ok(st); assert.equal(s.pasek.hidden, false);
  assert.deepEqual(s.wolania, [['akcja_bieg_moi', { p_slug: 'bieg-mikolajki' }]]);
  assert.equal(s.pasek.dzieci.length, 1); assert.deepEqual(s.pasek.style, { cssText: '' }, 'zewnętrzny element bez własnego display: chowa go showSection (fade-in) albo hidden');
  const w = s.pasek.dzieci[0]; assert.match(w.style.cssText, /^display:flex;/);
  const [a, x] = w.dzieci;
  assert.equal(a.tag, 'a'); assert.equal(a.href, 'bieg.html');
  assert.equal(s.pasek.textContent, '🎅 <img src=x onerror=alert(1)> ·Zapisz się ›×', 'nazwa dosłownie jako tekst');
  assert.equal(x.tag, 'button'); assert.equal(x.attrs['aria-label'], 'Ukryj pasek biegu');
  x.h.click();
  assert.equal(s.pasek.hidden, true); assert.equal(s.pasek.dzieci.length, 0); assert.equal(s.ls.get('bm_bieg_pasek_ukryty_bieg-mikolajki'), '1');
  s.wolania.length = 0;
  assert.equal(await A.pasekBiegu(s.pasek, L(BIEG()), s.sb), null);
  assert.equal(s.pasek.hidden, true); assert.deepEqual(s.wolania, [], 'schowany: bez zapytania o zapisy');
  assert.ok(await A.pasekBiegu(s.pasek, L(BIEG({ slug: 'inny-bieg' })), s.sb), 'krzyżyk dotyczy tylko tego biegu');
});

test('błąd albo brak danych = brak paska; bez otwartego biegu nie pytamy o zapisy', async () => {
  for (const rpc of [async () => ({ error: { message: 'x' } }), async () => { throw new Error('sieć'); }, () => { throw new Error('synchronicznie'); }, async () => ({ data: null })]) {
    const s = srodowisko(rpc);
    assert.equal(await A.pasekBiegu(s.pasek, L(BIEG()), s.sb), null); assert.equal(s.pasek.hidden, true);
  }
  const s = srodowisko(async () => ({ data: [] }));
  for (const d of [L(null), L(BIEG({ faza: 'zakonczony' })), null, undefined]) { assert.equal(await A.pasekBiegu(s.pasek, d, s.sb), null); }
  assert.deepEqual(s.wolania, []);
  assert.equal(await A.pasekBiegu(null, L(BIEG()), s.sb), null, 'bez elementu nic');
  assert.equal(await A.pasekBiegu(s.pasek, L(BIEG()), null), null, 'bez klienta nic');
  globalThis.localStorage = { getItem() { throw new Error('zablokowany'); }, setItem() { throw new Error('zablokowany'); } };
  assert.ok(await A.pasekBiegu(s.pasek, L(BIEG()), s.sb), 'zablokowany localStorage nie psuje paska');
});

test('zawodnik.html: jeden element wysoko i jedno wywołanie bez czekania; pasek bez innerHTML', () => {
  const h = czytaj('zawodnik.html');
  assert.equal((h.match(/id="bieg-pasek"/g) || []).length, 1);
  assert.match(h, /<div id="bieg-pasek" class="fade-in" hidden style="margin:0 16px 12px;"><\/div>\n<!-- MOTYWACJA DNIA -->\n<div id="daily-motivation"/,
    'pod nagłówkiem, nad motywacją dnia; fade-in = showSection chowa go poza Dziś');
  assert.ok(h.indexOf('<div class="topbar">') < h.indexOf('id="bieg-pasek"'));
  assert.match(h, /if \(name !== 'home'\) \{\n\s+document\.querySelectorAll\('\.fade-in, /, 'poza Dziś showSection chowa .fade-in');
  assert.match(h, /window\._renderKartyAkcji\(d\);\n\s+if \(window\.BM_AKCJA && window\.BM_AKCJA\.pasekBiegu\) window\.BM_AKCJA\.pasekBiegu\(document\.getElementById\('bieg-pasek'\), d, window\.sb\);/);
  assert.doesNotMatch(h, /await[^\n]*pasekBiegu/, 'nic nie czeka na pasek');
  const kod = czytaj('js/akcja.mjs'), od = kod.indexOf('function stanPaskaBiegu'), doo = kod.indexOf('g.BM_AKCJA = {');
  assert.ok(od > 0 && doo > od); assert.doesNotMatch(kod.slice(od, doo), /innerHTML|fabian/i, 'pasek: tylko textContent, bez imienia na sztywno');
});
