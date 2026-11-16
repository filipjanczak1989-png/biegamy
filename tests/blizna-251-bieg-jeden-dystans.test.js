/* BLIZNA 251 / JEDEN DYSTANS (decyzja Filipa 16.11): prawdziwy bieg `bieg-mikolajki` ma JEDEN dystans, 5 km; próba `proba-bieg` zostaje z 5 i 10 km.
   Strona biegu i regulamin biorą dystanse wyłącznie z bieg.dystanse_km (pole `bieg` licznika). Jeden dystans: karta tego dystansu i dzieci, zdanie
   „Liczy się trening co najmniej 5 km”, okno zapisu bez wyboru (dystans ustawiony), „Ukończyli” bez zakładek, etykiety rankingu bez „osobno 5 i 10 km”.
   Dwa dystanse: jak przed 16.11. Regulamin v2 ze znacznikami {dystanse} i {ranking_dystanse}; brak listy dystansów = brak wartości = „WKRÓTCE”.
   Strona nie może przysłać innej wersji ani innego dystansu niż baza: akcja_bieg_zapisz porównuje oba (20261120_akcja_bieg.sql). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { zaladujSb, blokiSkryptow, zamrozTimery } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const kod = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const BIEG = (dystanse, x) => Object.assign({ slug: 'mikolajki', nazwa: 'Bieg na Mikołajki', dzien_od: '2026-12-05', dzien_do: '2026-12-06', wynik_do: '2026-12-08', dystanse_km: dystanse, faza: 'zapisy',
  regulamin_wersja: '2026-11-v2', regulamin_od: '2026-11-18', wsparcie_kwoty_zl: [20, 30, 50], limit_dzieci: 6, zapisani: 4, zapisani_na: { 5: 3 }, dzieci: 1, ukonczyli_n: 0 }, x || {});
const LICZNIK = (bieg) => ({ wystartowala: true, nazwa: 'Akcja', imie: 'Janek', suma_km: 10, cel_km: 100, pct: 10, start: '2026-11-07', koniec: null, zamknieta: false, url_zbiorki: 'https://www.siepomaga.pl/x', stawka_filip_gr: 10, filip_gr: 100, filip_max_gr: 125000, bieg });
const LINK = 'https://example.org/zbiorka';
const czekaj = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
let B;

test.before(async () => {
  const SB = zaladujSb();
  for (const k of ['escapeHtml', 'safeExternalHref', 'safeUrlAttr', 'SB_URL']) globalThis[k] = SB[k];
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href);
  B = globalThis.BM_BIEG_REAL;
});

/* ── atrapa strony (jak blizna-241): elementy z id i [data-stan] z HTML, sb.js, js/akcja.mjs, js/bieg.mjs i blok <script> w vm ── */
function nowyElement(id, attrs) {
  const h = {};
  const e = { id, hidden: false, innerHTML: '', className: '', href: '', value: '', checked: false, disabled: false, style: {}, attrs: Object.assign({}, attrs || {}), _h: h,
    addEventListener(t, f) { (h[t] = h[t] || []).push(f); }, getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; },
    setAttribute(n, v) { this.attrs[n] = String(v); }, removeAttribute(n) { delete this.attrs[n]; }, appendChild(c) { (this.dzieci = this.dzieci || []).push(c); return c; }, remove() {},
    querySelectorAll: () => [], querySelector: () => null, scrollIntoView() {}, focus() {}, closest: () => null,
    klik() { (h.click || []).forEach((f) => f.call(e, { target: e, preventDefault() {} })); } };
  let tekst = ''; Object.defineProperty(e, 'textContent', { get: () => tekst, set: (v) => { tekst = String(v); e.dzieci = []; }, enumerable: true });
  return e;
}
function domStrony(ctx) {
  const html = czytaj('bieg.html').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''), rej = new Map(), stany = [], zdarzenia = {};
  for (const m of html.matchAll(/<([a-z0-9]+)\b([^>]*)>/gi)) {
    const a = m[2], id = /\bid="([^"]+)"/.exec(a), ds = /\bdata-stan="([^"]+)"/.exec(a);
    const e = nowyElement(id ? id[1] : '', ds ? { 'data-stan': ds[1] } : {}); e.hidden = /\shidden(?=[\s>]|$)/.test(a);
    if (id) rej.set(id[1], e); else if (ds) stany.push(e);
  }
  const daj = (id) => { if (!rej.has(id)) rej.set(id, nowyElement(id)); return rej.get(id); };
  rej.get('bw-cta').querySelectorAll = (s) => (s === '[data-stan]' ? stany : []);
  Object.assign(ctx.document, {
    getElementById: daj, querySelector: () => null, createElement: (t) => Object.assign(nowyElement(''), { tag: t }), createTextNode: (t) => ({ textContent: t }), head: nowyElement('head'), body: nowyElement('body'), readyState: 'interactive',
    querySelectorAll: () => [], addEventListener: (t, f) => { (zdarzenia[t] = zdarzenia[t] || []).push(f); },
  });
  return { daj, zdarzenia, widoczny: () => stany.filter((e) => !e.hidden).map((e) => e.attrs['data-stan']) };
}
async function stronaBiegu({ search = '', licznik, licznikProby = null, sesja = { user: { user_metadata: { full_name: 'anna kowalska' } } } } = {}) {
  const ctx = zamrozTimery(zaladujSb());
  Object.assign(ctx.location, { pathname: '/bieg.html', search, origin: 'https://biegamy.run' });
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const dom = domStrony(ctx), wywolania = [];
  ctx.fetch = async (url) => {
    if (/akcja-licznik/.test(url)) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(licznik)) };
    if (/bieg-ukonczyli/.test(url)) { wywolania.push(['ukonczyli', url]); return { ok: true, status: 200, json: async () => ({ razem: 0, lista: [] }) }; }
    return { ok: false, status: 404, json: async () => null };
  };
  for (const p of ['js/akcja.mjs', 'js/bieg.mjs']) vm.runInContext(kod(p), ctx, { filename: p });
  if (licznikProby) ctx.BM_AKCJA.zUlica = (cb) => cb({ licznikProby: () => Promise.resolve(JSON.parse(JSON.stringify(licznikProby))) });
  ctx.sb = { auth: { getSession: async () => ({ data: { session: sesja } }) }, rpc: async (n, a) => { wywolania.push([n, a]); return n === 'akcja_bieg_moi' ? { data: [], error: null } : { data: null, error: null }; } };
  blokiSkryptow('bieg.html').forEach((k, i) => vm.runInContext(k, ctx, { filename: 'bieg.html#' + i }));
  (dom.zdarzenia.DOMContentLoaded || []).forEach((f) => f());
  await czekaj();
  return { ctx, dom, wywolania };
}
const tekstOkna = (s) => (s.dom.daj('bw-regulamin-tresc').dzieci || []).map((e) => (e.tag === 'ul' ? (e.dzieci || []).map((x) => x.textContent).join(' | ') : e.textContent)).join('\n');

test('dystanse z bazy: lista oczyszczona (liczby całkowite 1–100, bez powtórzeń, rosnąco); słownie i krótko; bez listy = pusto', () => {
  assert.deepEqual([...B.dystanseBiegu(BIEG([10, 5, 5]))], [5, 10]); assert.deepEqual([...B.dystanseBiegu(BIEG([5]))], [5]);
  for (const zle of [null, undefined, [], [0], [101], ['x'], [2.5]]) assert.deepEqual([...B.dystanseBiegu(BIEG(zle))], [], JSON.stringify(zle));
  assert.deepEqual([...B.dystanseBiegu(null)], []);
  assert.equal(B.dystanseSlownie([5]), '5 km'); assert.equal(B.dystanseSlownie([5, 10]), '5 km albo 10 km'); assert.equal(B.dystanseSlownie([5, 10, 21]), '5 km, 10 km albo 21 km');
  assert.equal(B.dystanseKrotko([5]), '5 km'); assert.equal(B.dystanseKrotko([5, 10], 'albo'), '5 albo 10 km'); assert.equal(B.dystanseKrotko([5, 10], 'i'), '5 i 10 km'); assert.equal(B.dystanseKrotko([]), '');
  assert.equal(B.ZASADY.dystanse, undefined, 'żadnej listy dystansów na sztywno');
});

test('teksty strony: jeden dystans = „Liczy się trening co najmniej 5 km”, bez wyboru i bez „osobno”; dwa = brzmienie sprzed 16.11; bez biegu = bez dystansu', () => {
  const j = B.tekstyDystansow(BIEG([5])), d = B.tekstyDystansow(BIEG([5, 10])), n = B.tekstyDystansow(null);
  const WYNIK = 'Wynik wchodzi z zegarka (jak każdy trening w BiegaMy) albo wpisujesz go sam, do dwóch dni po biegu. Zapisać można się też jeszcze w tym czasie.';
  assert.equal(j.karty_pod, 'Liczy się trening co najmniej 5 km. ' + WYNIK);
  assert.equal(d.karty_pod, 'Zapis na 5 km, a zrobione 10? Dyplom na 10. ' + WYNIK, 'dwa dystanse: zdanie jak dotąd');
  assert.equal(n.karty_pod, WYNIK);
  assert.equal(j.krok_zapisu, 'Dystans 5 km, imię na numer i dyplom. Dzieci dopisujesz samym imieniem.');
  assert.equal(d.krok_zapisu, 'Dystans 5 albo 10 km, imię na numer i dyplom. Dzieci dopisujesz samym imieniem.');
  assert.equal(n.krok_zapisu, 'Imię na numer i dyplom. Dzieci dopisujesz samym imieniem.');
  assert.match(j.zapis_opis, /^Dystans: 5 km, biegiem albo marszem\. Imię trafi na numer startowy i dyplom;/); assert.doesNotMatch(j.zapis_opis, /Wybierz/);
  assert.equal(d.zapis_opis, 'Wybierz dystans. Imię trafi na numer startowy i dyplom; na listę „ukończyli” tylko za Twoją zgodą. Nic nie jest zaznaczone z góry.');
  assert.equal(d.wybierz, 'Wybierz dystans: 5 albo 10 km.');
  assert.equal(j.zgoda_ranking_pole, 'Pokaż mnie w rankingu: czas i miejsce na liście „ukończyli”. Mam ukończone 18 lat (dobrowolne)');
  assert.equal(d.zgoda_ranking_pole, 'Pokaż mnie w rankingu: czas i miejsce na liście „ukończyli”, osobno 5 i 10 km. Mam ukończone 18 lat (dobrowolne)');
  assert.equal(j.czasy_prywatne, 'Lista pokazuje tych, którzy ukończyli: imię (za zgodą), numer i dystans. Czas i miejsce tylko u pełnoletnich, którzy włączyli ranking. Pozostali są na liście bez czasu, a czas mają na dyplomie. Dzieci nigdy nie są w rankingu.');
  assert.match(d.czasy_prywatne, /którzy włączyli ranking, osobno dla 5 i 10 km\. Pozostali/);
  for (const t of Object.values(j).concat(Object.values(n))) { assert.doesNotMatch(t, /10 km|5 i 10|5 albo 10|osobno/, t); assert.doesNotMatch(t, /\{[a-z_]+\}/, t); }
  assert.doesNotMatch(JSON.stringify(B.TEKSTY), /10 km|5 i 10|5 albo 10/, 'TEKSTY bez dystansów na sztywno');
});

test('karty, wybór w oknie zapisu, dystans zapisu, zakładki „Ukończyli”, liczby, odmowa „dystans”', () => {
  const k1 = B.dystanseHtml(BIEG([5])), k2 = B.dystanseHtml(BIEG([5, 10]));
  assert.equal((k1.match(/class="bw-dystans"/g) || []).length, 2, 'jeden dystans: karta 5 km i Dzieci');
  assert.match(k1, /<b>5 km<\/b><small>bieg albo marsz<\/small>/); assert.match(k1, /<b>Dzieci<\/b><small>swój dystans, bez czasu<\/small>/); assert.doesNotMatch(k1, /10 km|bieg-dystans-10/);
  assert.equal(k2, '<div class="bw-dystans"><img src="assets/bieg/bieg-dystans-5.svg" alt=""><b>5 km</b><small>bieg albo marsz</small></div><div class="bw-dystans"><img src="assets/bieg/bieg-dystans-10.svg" alt=""><b>10 km</b><small>dla tych, którzy lubią dłużej</small></div><div class="bw-dystans"><img src="assets/bieg/bieg-dystans-twoj.svg" alt=""><b>Dzieci</b><small>swój dystans, bez czasu</small></div>', 'dwa dystanse: te same karty co w HTML przed 16.11');
  assert.equal(B.dystanseHtml(BIEG(null)), ''); assert.equal(B.dystanseHtml(null), '');
  assert.equal(B.wyborDystansuHtml(BIEG([5])), '', 'jeden dystans: bez wyboru');
  assert.equal(B.wyborDystansuHtml(BIEG([5, 10])), '<label><input type="radio" name="bw-dystans" value="5"><img src="assets/bieg/bieg-dystans-5.svg" alt=""><span><b>5 km</b><small>bieg albo marsz</small></span></label><label><input type="radio" name="bw-dystans" value="10"><img src="assets/bieg/bieg-dystans-10.svg" alt=""><span><b>10 km</b><small>bieg albo marsz</small></span></label>');
  assert.doesNotMatch(B.wyborDystansuHtml(BIEG([5, 10])), /checked/, 'nic z góry');
  assert.equal(B.dystansZapisu(BIEG([5]), undefined), 5); assert.equal(B.dystansZapisu(BIEG([5]), '10'), 5, 'jeden dystans: zawsze ten z bazy');
  assert.equal(B.dystansZapisu(BIEG([5, 10]), undefined), null); assert.equal(B.dystansZapisu(BIEG([5, 10]), '10'), 10); assert.equal(B.dystansZapisu(BIEG([5, 10]), '7'), null); assert.equal(B.dystansZapisu(BIEG(null), '5'), null);
  assert.equal(B.zakladkiListyHtml([5], null), '', 'jeden dystans: bez zakładek'); assert.equal(B.zakladkiListyHtml([], null), ''); assert.equal(B.zakladkiListyHtml(undefined, null), '');
  assert.match(B.zakladkiListyHtml([5, 10], null), /aria-pressed="true">Wszyscy<\/button>.*>5 km<\/button>.*>10 km<\/button>/);
  assert.match(B.liczbyHtml(BIEG([5])), /<p class="bw-drobne bw-liczby-pod">5 km: 3 · dzieci: swój dystans<\/p>/); assert.doesNotMatch(B.liczbyHtml(BIEG([5])), /10 km/);
  assert.match(B.liczbyHtml(BIEG([5, 10], { zapisani_na: { 5: 1, 10: 2 } })), /5 km: 1 · 10 km: 2 · dzieci: swój dystans/);
  assert.equal(B.krotszyDystans(BIEG([5]), 5), null); assert.equal(B.krotszyDystans(BIEG([5, 10]), 10), 5); assert.equal(B.krotszyDystans(BIEG(null), 10), null);
  assert.doesNotMatch(B.wynikHtml({ id: 'j1', rodzaj: 'ja', imie: 'Ola', numer: 1, dystans_km: 5 }, BIEG([5], { faza: 'wyniki' }), { brakTreningu: true }), /Masz mniej kilometrów/);
  assert.equal(B.komunikat({ powod: 'dystans' }, null, BIEG([5, 10])), 'Wybierz 5 albo 10 km.', 'dwa dystanse: jak dotąd');
  assert.equal(B.komunikat({ powod: 'dystans' }, null, BIEG([5])), 'Dystans biegu się zmienił. Odśwież stronę.');
  assert.equal(B.komunikat({ powod: 'dystans' }), 'Dystans biegu się zmienił. Odśwież stronę.');
});

test('regulamin v2: {dystanse} i {ranking_dystanse} z bazy; jeden dystans bez „10 km”; dwa = „5 km albo 10 km”; brak listy = WKRÓTCE', () => {
  assert.equal(B.WERSJA_TEKSTOW, '2026-11-v2');
  const w1 = B.wartosciTekstow(BIEG([5]), { imie: 'Janek' }, LINK), t1 = B.regulaminTekst(w1);
  assert.equal(w1.dystanse, '5 km'); assert.equal(w1.ranking_dystanse, 'na 5 km');
  assert.match(t1, /\n§ 2\. Termin i dystans\n1\. Bieg trwa od soboty, 5 grudnia 2026 do niedzieli, 6 grudnia 2026\.\n2\. Dystans: 5 km, biegiem albo marszem, na dowolnej trasie\.\n/);
  assert.match(t1, /\n1\. Bieg ukończył uczestnik, który w terminie z § 2 ma w aplikacji trening biegowy albo marszowy na dystansie co najmniej 5 km\. Trening może/);
  assert.match(t1, /\n5\. Bieg nie ma nagród\. Ranking czasów na 5 km obejmuje wyłącznie pełnoletnich uczestników, którzy zgodzili się na udział w rankingu\./);
  assert.match(t1, /Wersja regulaminu: 2026-11-v2, obowiązuje od 18 listopada 2026\./);
  assert.doesNotMatch(t1, /10 km|5 i 10|albo 10|\{[a-z_]+\}/);
  const t2 = B.regulaminTekst(B.wartosciTekstow(BIEG([5, 10]), { imie: 'Janek' }, LINK));
  assert.match(t2, /\n2\. Dystans: 5 km albo 10 km, biegiem albo marszem, na dowolnej trasie\.\n/); assert.match(t2, /na dystansie co najmniej 5 km albo 10 km\./);
  assert.match(t2, /Ranking czasów na 5 i 10 km \(osobno dla każdego dystansu\) obejmuje wyłącznie/);
  for (const zle of [null, [], [0]]) {
    assert.equal(B.wartosciTekstow(BIEG(zle), { imie: 'Janek' }, LINK), null, JSON.stringify(zle));
    assert.equal(B.stanStrony(BIEG(zle), { user: {} }, [], { teksty: B.wartosciTekstow(BIEG(zle), { imie: 'Janek' }, LINK) }).stan, 'wkrotce', 'brak dystansów = bramka');
  }
  assert.deepEqual([...B.brakiTekstow(BIEG([]), { imie: 'Janek' }, LINK)], ['dystanse']);
  assert.equal(B.wartosciTekstow(BIEG([5], { regulamin_wersja: '2026-11-v1' }), { imie: 'Janek' }, LINK), null, 'v1 w bazie przy froncie v2 = WKRÓTCE');
  const zr = JSON.stringify(B.REGULAMIN); assert.doesNotMatch(zr, /10 km|5 i 10|albo 10/, 'regulamin bez dystansów na sztywno');
});

test('strona w atrapie, JEDEN dystans: karty 5 km + Dzieci, zdanie o 5 km, bez zakładek, okno zapisu bez wyboru i zapis z 5 km i wersją v2', async () => {
  const s = await stronaBiegu({ licznik: LICZNIK(BIEG([5])) });
  assert.deepEqual(s.dom.widoczny(), ['przed']);
  assert.equal(s.dom.daj('bw-dystanse-sekcja').hidden, false);
  const karty = s.dom.daj('bw-dystanse').innerHTML; assert.equal((karty.match(/class="bw-dystans"/g) || []).length, 2); assert.doesNotMatch(karty, /10 km/);
  assert.match(s.dom.daj('bw-dystanse-pod').textContent, /^Liczy się trening co najmniej 5 km\. /);
  assert.equal(s.dom.daj('bw-krok-zapis').textContent, 'Dystans 5 km, imię na numer i dyplom. Dzieci dopisujesz samym imieniem.');
  assert.equal(s.dom.daj('bw-ukonczyli-zakladki').innerHTML, '', '„Ukończyli” bez zakładek');
  assert.ok(s.wywolania.some((w) => w[0] === 'ukonczyli' && !/&dystans=/.test(w[1])), 'lista „Wszyscy” (z dziećmi), bez filtra dystansu');
  assert.doesNotMatch(s.dom.daj('bw-czasy-prywatne').textContent, /osobno|10 km/);
  assert.equal(s.dom.daj('bw-zgoda-ranking-tekst').textContent, 'Pokaż mnie w rankingu: czas i miejsce na liście „ukończyli”. Mam ukończone 18 lat (dobrowolne)');
  assert.match(s.dom.daj('bw-liczby').innerHTML, /5 km: 3 · dzieci: swój dystans/);
  const okno = tekstOkna(s); assert.match(okno, /Dystans: 5 km, biegiem albo marszem/); assert.match(okno, /co najmniej 5 km\./); assert.doesNotMatch(okno, /10 km|\{[a-z_]+\}/);
  s.dom.daj('bw-zapisz').klik();
  assert.equal(s.dom.daj('bw-okno-zapis').getAttribute('open'), '');
  assert.equal(s.dom.daj('bw-zapis-dystanse').innerHTML, ''); assert.equal(s.dom.daj('bw-zapis-dystanse').hidden, true, 'bez wyboru dystansu');
  assert.match(s.dom.daj('bw-zapis-opis').textContent, /^Dystans: 5 km, biegiem albo marszem\./);
  s.dom.daj('bw-regulamin').checked = true; s.dom.daj('bw-zapis-ok').klik(); await czekaj();
  const z = s.wywolania.find((w) => w[0] === 'akcja_bieg_zapisz'); assert.ok(z, 'zapis wysłany bez zaznaczania dystansu');
  assert.equal(z[1].p_dystans, 5); assert.equal(z[1].p_regulamin_wersja, '2026-11-v2'); assert.equal(z[1].p_imie, 'Anna');
});

test('strona w atrapie, DWA dystanse: jak przed 16.11 (trzy karty, zakładki, wybór 5/10, bez wyboru odmowa przed wysyłką)', async () => {
  const s = await stronaBiegu({ licznik: LICZNIK(BIEG([5, 10], { zapisani_na: { 5: 1, 10: 2 } })) });
  assert.deepEqual(s.dom.widoczny(), ['przed']);
  assert.equal((s.dom.daj('bw-dystanse').innerHTML.match(/class="bw-dystans"/g) || []).length, 3);
  assert.match(s.dom.daj('bw-dystanse-pod').textContent, /^Zapis na 5 km, a zrobione 10\? Dyplom na 10\. /);
  assert.equal(s.dom.daj('bw-krok-zapis').textContent, 'Dystans 5 albo 10 km, imię na numer i dyplom. Dzieci dopisujesz samym imieniem.');
  assert.match(s.dom.daj('bw-ukonczyli-zakladki').innerHTML, />Wszyscy<\/button>.*>5 km<\/button>.*>10 km<\/button>/);
  assert.match(s.dom.daj('bw-czasy-prywatne').textContent, /osobno dla 5 i 10 km/); assert.match(s.dom.daj('bw-zgoda-ranking-tekst').textContent, /„ukończyli”, osobno 5 i 10 km\./);
  s.dom.daj('bw-zapisz').klik();
  assert.equal(s.dom.daj('bw-zapis-dystanse').hidden, false); assert.equal((s.dom.daj('bw-zapis-dystanse').innerHTML.match(/type="radio"/g) || []).length, 2);
  assert.equal(s.dom.daj('bw-zapis-opis').textContent, 'Wybierz dystans. Imię trafi na numer startowy i dyplom; na listę „ukończyli” tylko za Twoją zgodą. Nic nie jest zaznaczone z góry.');
  s.dom.daj('bw-regulamin').checked = true; s.dom.daj('bw-zapis-ok').klik(); await czekaj();
  assert.equal(s.dom.daj('bw-zapis-blad').textContent, 'Wybierz dystans: 5 albo 10 km.'); assert.ok(!s.wywolania.some((w) => w[0] === 'akcja_bieg_zapisz'), 'bez wyboru nic nie wychodzi');
  assert.match(tekstOkna(s), /Dystans: 5 km albo 10 km, biegiem albo marszem/);
});

test('strona w atrapie: bieg w szkicu (licznik bez pola bieg) = sekcja „Dystanse” schowana, teksty bez dystansu; próba v1 po wdrożeniu v2 zapisuje dalej (wersja z bazy), regulamin mówi „wersja”', async () => {
  const s = await stronaBiegu({ licznik: LICZNIK(null) });
  assert.deepEqual(s.dom.widoczny(), ['wkrotce']); assert.equal(s.dom.daj('bw-dystanse-sekcja').hidden, true); assert.equal(s.dom.daj('bw-dystanse').innerHTML, '');
  assert.equal(s.dom.daj('bw-krok-zapis').textContent, 'Imię na numer i dyplom. Dzieci dopisujesz samym imieniem.');
  const p = await stronaBiegu({ search: '?proba=1', licznik: LICZNIK(null), licznikProby: LICZNIK(BIEG([5, 10], { slug: 'proba-bieg', regulamin_wersja: '2026-11-v1' })) });
  assert.deepEqual(p.dom.widoczny(), ['przed'], '?proba=1 omija bramkę tekstów');
  assert.match((p.dom.daj('bw-regulamin-tresc').dzieci || [])[0].textContent, /^Próba: w bazie brakuje danych do regulaminu: wersja\.$/);
  p.dom.daj('bw-zapisz').klik(); p.dom.daj('bw-regulamin').checked = true;
  const radio = { value: '10' }; p.dom.daj('bw-okno-zapis').querySelector = (sel) => (/:checked/.test(sel) ? radio : null);
  p.dom.daj('bw-zapis-ok').klik(); await czekaj();
  const z = p.wywolania.find((w) => w[0] === 'akcja_bieg_zapisz'); assert.ok(z);
  assert.equal(z[1].p_regulamin_wersja, '2026-11-v1', 'wersja z wiersza próby (baza porównuje ze swoją), więc zapis próby przechodzi'); assert.equal(z[1].p_dystans, 10);
});

test('bieg.html i js/bieg.mjs: żadnych „10 km”, „5 albo 10”, „5 i 10” w tekstach (poza komentarzami); meta bez dystansów; jedno źródło dystansów', () => {
  const h = czytaj('bieg.html'), bezKom = h.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(bezKom, /10 km|5 albo 10|5 i 10|bieg-dystans-10/, 'bieg.html bez dystansów na sztywno');
  assert.match(h, /<section class="bw-sekcja" aria-label="Dystanse" id="bw-dystanse-sekcja" hidden>/);
  assert.match(h, /B\.zakladkiListyHtml\(B\.dystanseBiegu\(bieg\), dystansListy\)/); assert.doesNotMatch(h, /ZASADY\.dystanse/);
  assert.match(h, /var d = B\.dystansZapisu\(bieg, \(OKNO_ZAPIS\.querySelector\('input\[name="bw-dystans"\]:checked'\) \|\| \{\}\)\.value\)/);
  assert.match(h, /wybor\.innerHTML = B\.wyborDystansuHtml\(bieg\); wybor\.hidden = !wybor\.innerHTML;/);
  for (const m of h.match(/<meta (?:name="description"|property="og:[a-z]+") content="[^"]*">/g)) assert.doesNotMatch(m, /\d+ km/, m);
  const mjs = czytaj('js/bieg.mjs').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(mjs, /"[^"\n]*(?:10 km|5 albo 10|5 i 10)[^"\n]*"/, 'js/bieg.mjs: żaden napis z dystansami na sztywno');
  assert.doesNotMatch(mjs, /dystanse:\s*\[/, 'bez listy dystansów w ZASADY');
});

test('baza (20261120, 20261126): zapis wymaga wersji regulaminu z bazy i dystansu z listy biegu; przy {5} trening 10 km zalicza 5 km (tolerancja 2 %)', () => {
  const m1 = czytaj('supabase/migrations/20261120_akcja_bieg.sql'), m2 = czytaj('supabase/migrations/20261126_akcja_bieg_wyniki.sql');
  const zapisz = m1.slice(m1.indexOf('create or replace function public.akcja_bieg_zapisz('), m1.indexOf('rev' + 'oke all on function public.akcja_bieg_zapisz('));   // fraza sklejona: bramka-commit czyta dodane linie
  assert.match(zapisz, /if p_regulamin_wersja is distinct from b\.regulamin_wersja then return jsonb_build_object\('ok', false, 'powod', 'regulamin'/);
  assert.match(zapisz, /if p_dystans is null or not \(p_dystans = any\(b\.dystanse_km\)\) then return jsonb_build_object\('ok', false, 'powod', 'dystans'\)/);
  assert.match(m1, /dystanse_km\s+integer\[\] not null default '\{5,10\}' check \(cardinality\(dystanse_km\) between 1 and 4\)/, 'kolumna przyjmuje jeden dystans');
  assert.match(m2, /select max\(d\) from unnest\(p_dystanse\) d where p_km >= d \* 0\.98;/);
  const zaliczony = (lista, kmT) => { const ok = lista.filter((d) => kmT >= d * 0.98); return ok.length ? Math.max(...ok) : null; };
  assert.equal(zaliczony([5], 10), 5); assert.equal(zaliczony([5], 4.9), 5); assert.equal(zaliczony([5], 4.89), null); assert.equal(zaliczony([5, 10], 10), 10);
  assert.match(m2, /set wynik_log_id = l\.id, wynik_s = case when l\.s between 60 and 86400 then l\.s end, wynik_dystans_km = l\.d,/, 'czas = czas całego treningu (przy {5} trening 10 km daje 5 km z czasem 10 km: raport 16.11)');
});
