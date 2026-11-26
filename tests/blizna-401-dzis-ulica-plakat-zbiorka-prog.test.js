// Blizna #401 (26.11.2026) — nowe Dziś: kafel Ulicy nie miał Plakatu, Zbiórki ani baneru progu, które ma stary kafel.
//
// E3 commit 3 (plan E3, decyzja z 26.11: Plakat, Zbiórka, baner progu; bez „×”, bez zapisu na bieg, bez przycisku firm).
// Pilnujemy, żeby nowy kafel używał REGUŁ starego kodu akcji, a nie własnych kopii: plakat tylko z białej listy hostów
// (plakatUrl → safeUrlAttr), zbiórka tylko https (linkZbiorki → safeExternalHref), próg tylko z pola prog licznika.
// Test wczytuje prawdziwy js/akcja.mjs w osobnym kontekście i podaje modułowi jego funkcje. Zero nowych zapytań.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { strona, MODUL } = require('./_dzis-nowy-strona.js');

const AKCJA = fs.readFileSync(path.join(__dirname, '..', 'js', 'akcja.mjs'), 'utf8');
/** Prawdziwy js/akcja.mjs z pomocnikami jak w sb.js (biała lista hostów dla obrazów, https dla zbiórki). */
function akcjaPrawdziwa() {
  const mapa = new Map();
  const g = { escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    safeUrlAttr: (u) => { try { const x = new URL(u); return x.protocol === 'https:' && ['afqojgkaveykxbltxzwm.supabase.co', 'filipjanczak1989-png.github.io'].includes(x.hostname) ? u : ''; } catch (e) { return ''; } },
    safeExternalHref: (u, o) => (/^https:\/\//.test(u) || (!(o && o.tylkoHttps) && /^http:\/\//.test(u)) ? u : ''),
    localStorage: { getItem: (k) => (mapa.has(k) ? mapa.get(k) : null), setItem: (k, v) => mapa.set(k, String(v)), removeItem: (k) => mapa.delete(k) },
    setTimeout: () => 0, console: { warn() {}, log() {}, error() {} },
    Date, JSON, Math, Promise, String, Number, Object, Array, RegExp, Error, isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, URL, URLSearchParams, Intl };
  vm.createContext(g); vm.runInContext(AKCJA, g);
  return g.BM_AKCJA;
}
const A = akcjaPrawdziwa();
const PLAKAT = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/plakat.webp?token=a1&x=2';
const ZBIORKA = 'https://www.siepomaga.pl/atrapa';
const LICZNIK = { wystartowala: true, km: 3607, suma_km: 3607, cel_km: 12500, nazwa: 'Ulica próbna', plakat_url: PLAKAT, url_zbiorki: ZBIORKA };
const e = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** Strona z funkcjami starego kodu akcji (bez sceny: zUlica nie podana). konfetti: lista wywołań konfettiProgu. */
function zAkcja(licznik, { bezAkcji = false, rzuca = false } = {}) {
  const s = strona({ licznik }), konfetti = [];
  if (!bezAkcji) s.w.BM_AKCJA = { plakatUrl: A.plakatUrl, linkZbiorki: A.linkZbiorki, progPrzekroczony: A.progPrzekroczony, tekstProgu: A.tekstProgu,
    konfettiProgu: (slug, p) => { konfetti.push([slug, p]); if (rzuca) throw new Error('konfetti'); return true; } };
  return { s, konfetti };
}
const pokaz = async (o) => { o.s.B.start(); await o.s.doKonca(); return o; };
const odpalZero = (s) => s.czasomierze.filter((c) => c.ms === 0 && c.zywy && !c.byl).forEach((c) => { c.byl = true; c.f(); });

test('(1) Plakat i Zbiórka pod wkładem: adresy z reguł starego kodu, w atrybutach przez esc; Plakat otwiera stary kod na pełnym ekranie (data-plakat, data-zbiorka)', async () => {
  const { s } = await pokaz(zAkcja(LICZNIK)), h = s.kafel('ulica').innerHTML;
  assert.equal(A.plakatUrl(LICZNIK), PLAKAT); assert.equal(A.linkZbiorki(LICZNIK), ZBIORKA);
  const P = '<div class="dn-ul-przyciski"><a class="dn-drugi" href="' + e(PLAKAT) + '" data-plakat="' + e(PLAKAT) + '" data-zbiorka="' + ZBIORKA + '" target="_blank" rel="noopener noreferrer">Plakat</a>' +
    '<a class="dn-drugi" href="' + ZBIORKA + '" target="_blank" rel="noopener noreferrer">Zbiórka</a></div>';
  assert.ok(h.endsWith('<p class="dn-tekst" data-dn="wklad"></p>' + P), h.slice(-520));
  assert.match(h, /token=a1&amp;x=2/, '& w adresie jako &amp; (atrybut)');
});

test('(2) reguły starego kodu: plakat spoza białej listy, zbiórka bez https i adresy javascript: nie dają przycisków', async () => {
  const obcy = await pokaz(zAkcja({ ...LICZNIK, plakat_url: 'https://obcy.example.com/p.webp' }));
  assert.doesNotMatch(obcy.s.kafel('ulica').innerHTML, />Plakat</); assert.match(obcy.s.kafel('ulica').innerHTML, />Zbiórka</);
  const http = await pokaz(zAkcja({ ...LICZNIK, url_zbiorki: 'http://www.siepomaga.pl/atrapa' }));
  assert.doesNotMatch(http.s.kafel('ulica').innerHTML, />Zbiórka</, 'zbiórka tylko https'); assert.doesNotMatch(http.s.kafel('ulica').innerHTML, /data-zbiorka/);
  const zly = await pokaz(zAkcja({ ...LICZNIK, plakat_url: 'javascript:alert(1)', url_zbiorki: 'javascript:alert(2)' }));
  assert.doesNotMatch(zly.s.kafel('ulica').innerHTML, /javascript:|dn-ul-przyciski/, 'bez adresów: bez rzędu przycisków');
  assert.match(MODUL, /#dzis-nowy \.dn-ul-przyciski \.dn-drugi:only-child\{grid-column:1\/-1\}/, 'jeden przycisk: cała szerokość');
});

test('(3) baner progu pod nagłówkiem: tekst ze starego kodu, „Udostępnij ›” obsługuje stary kod (data-prog-udostepnij), bez data-dn', async () => {
  const d = { ...LICZNIK, prog: { km: 3000, at: '2026-11-26T08:00:00Z', cel: false } };
  const { s } = await pokaz(zAkcja(d)), h = s.kafel('ulica').innerHTML;
  const B = '<div class="dn-ul-prog" role="status"><b>' + A.tekstProgu(3000, d) + '</b><span>Razem, krok po kroku. Dziękujemy.</span><button type="button" class="dn-link" data-prog-udostepnij="3000">Udostępnij ›</button></div>';
  assert.match(A.tekstProgu(3000, d), /^3.000 km razem$/);
  assert.ok(h.includes('</div>' + B + '<div class="dn-ul-km">'), 'między nagłówkiem a liczbami: ' + h.slice(0, 400));
  const cel = { ...LICZNIK, prog: { km: 12500, at: '2026-11-26T08:00:00Z', cel: true } };
  assert.match((await pokaz(zAkcja(cel))).s.kafel('ulica').innerHTML, /Cel osiągnięty razem\./);
  assert.doesNotMatch((await pokaz(zAkcja(LICZNIK))).s.kafel('ulica').innerHTML, /dn-ul-prog/, 'bez pola prog (minęło 48 h): bez baneru');
  assert.doesNotMatch(B + h.slice(h.indexOf('dn-ul-przyciski')), /data-dn=/, 'próg i przyciski bez data-dn: kliknięcia idą do starego kodu, nie do modułu');
});

test('(4) konfetti progu raz na rysunek z bazy, kluczem konta (slug); bez progu nie; z pamięci telefonu nie; błąd konfetti nie psuje kafla', async () => {
  const d = { ...LICZNIK, prog: { km: 3000, at: '2026-11-26T08:00:00Z', cel: false } };
  const o = await pokaz(zAkcja(d)); assert.deepEqual(o.konfetti, [], 'po rysunku, nie w trakcie'); odpalZero(o.s);
  assert.deepEqual(o.konfetti, [['ulica-glowna', 3000]]);
  const bez = await pokaz(zAkcja(LICZNIK)); odpalZero(bez.s); assert.deepEqual(bez.konfetti, []);
  o.s.st.online = false; o.s.st.awaria = { '*': 'siec' }; o.s.B.wczytaj(true); await o.s.doKonca(); odpalZero(o.s);
  assert.match(o.s.kafel('ulica').innerHTML, /dn-ul-prog/, 'z pamięci baner jest'); assert.equal(o.konfetti.length, 1, 'ale konfetti tylko z danych z bazy');
  const r = await pokaz(zAkcja(d, { rzuca: true })); assert.doesNotThrow(() => odpalZero(r.s)); assert.match(r.s.kafel('ulica').innerHTML, /dn-ul-prog/);
});

test('(5) bez starego kodu akcji: kafel jak dotąd (bez przycisków i progu); zero nowych zapytań', async () => {
  const bez = await pokaz(zAkcja({ ...LICZNIK, prog: { km: 3000 } }, { bezAkcji: true })), z = await pokaz(zAkcja({ ...LICZNIK, prog: { km: 3000 } }));
  assert.ok(bez.s.kafel('ulica').innerHTML.endsWith('<p class="dn-tekst" data-dn="wklad"></p>'));
  assert.doesNotMatch(bez.s.kafel('ulica').innerHTML, /dn-ul-prog|dn-ul-przyciski/);
  const n = (s) => s.zapytania.map((q) => q.nazwa).sort();
  assert.deepEqual(n(z.s), n(bez.s), 'te same zapytania: budżet 6 / 7');
});

test('(6) style: bez nowego pomarańczowego tekstu (pomarańcz tylko z istniejących .dn-link i przycisków), przyciski jak „Dodaj trening”', () => {
  const nowe = (MODUL.match(/#dzis-nowy \.dn-ul-(prog|przyciski)[^{]*\{[^}]*\}/g) || []).join('');
  assert.ok(nowe.length > 100); assert.doesNotMatch(nowe, /#ff7a45|#c44a13/);
  assert.match(MODUL, /#dzis-nowy \.dn-ul-przyciski\{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px\}/);
});
