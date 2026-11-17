/* BLIZNA 280 / 17.11: dyplom zawsze z AKTUALNEGO wyniku (bieg wirtualny, migracja 20261206).
   - po „Wskaż inny trening”, po poprawce organizatora („Popraw”, akcja_bieg_zalicz_recznie), po poprawce dystansu dziecka i po usunięciu wyniku karta, podgląd dyplomu,
     „Udostępnij dyplom” i „Dyplom A4” mają nowy dystans i czas, nic z poprzedniego; po usunięciu nie ma dyplomu ani przycisków;
   - dyplom do udostępnienia rysowany w chwili kliknięcia z bieżącego zapisu, nazwa pliku idzie za wynikiem, klucz karty też;
   - powrót „wstecz” z pamięci przeglądarki (pageshow) czyta wynik od nowa;
   - Service Worker nie pamięta odpowiedzi funkcji bazy ani EF; lista „ukończyli” ma pamięć najwyżej 60 s w EF i 60 s w przeglądarce;
   - dzwonek na zawodnik.html (zamrożony) pokazuje nowy typ 'bieg_wynik' jako zwykły tekst z escapowaniem. */
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
const czekaj = async (n = 60) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const BIEG = (x) => Object.assign({ slug: 'bieg-mikolajki', nazwa: 'Bieg wirtualny', dzien_od: '2026-12-05', dzien_do: '2026-12-06', wynik_do: '2026-12-08', dystanse_km: [5], faza: 'wyniki',
  regulamin_wersja: '2026-11-v2', regulamin_od: '2026-11-18', limit_dzieci: 6, zapisani: 3, zapisani_na: { 5: 1 }, dzieci: 1, ukonczyli_n: 2 }, x || {});
let B;

test.before(async () => {
  const SB = zaladujSb();
  for (const k of ['escapeHtml', 'safeExternalHref', 'safeUrlAttr', 'SB_URL']) globalThis[k] = SB[k];
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href);
  B = globalThis.BM_BIEG_REAL;
});

/* płótno, które zapisuje napisy: podgląd (toDataURL) i plik (toBlob) niosą to, co narysowano */
function nowePlotno() {
  const teksty = [];
  const c2d = new Proxy({}, { get(t, k) { if (k === 'fillText') return (s) => teksty.push(String(s)); if (k === 'measureText') return (s) => ({ width: String(s).length * 5 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
  return { width: 0, height: 0, teksty, getContext: () => c2d, toDataURL: () => 'data:' + JSON.stringify(teksty), toBlob: (cb) => cb({ teksty: teksty.slice() }) };
}
function nowyElement(id, attrs) {
  const h = {};
  const e = { id, hidden: false, innerHTML: '', className: '', href: '', value: '', checked: false, disabled: false, style: {}, attrs: Object.assign({}, attrs || {}),
    addEventListener(t, f) { (h[t] = h[t] || []).push(f); }, getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; },
    setAttribute(n, v) { this.attrs[n] = String(v); }, removeAttribute(n) { delete this.attrs[n]; }, appendChild(c) { (this.dzieci = this.dzieci || []).push(c); return c; }, remove() {},
    querySelectorAll: () => [], querySelector: () => null, scrollIntoView() {}, focus() {}, closest: () => null,
    klik() { (h.click || []).forEach((f) => f.call(e, { target: e, preventDefault() {} })); } };
  let tekst = ''; Object.defineProperty(e, 'textContent', { get: () => tekst, set: (v) => { tekst = String(v); e.dzieci = []; }, enumerable: true });
  return e;
}
/* atrapa bieg.html jak w blizna-253, z obrazami w karcie: img[data-dyplom|data-numer] istnieje, gdy jest w aktualnym innerHTML karty (nowa karta = nowe obrazy) */
async function stronaBiegu({ bieg, odpowiedz, search = '' }) {
  const ctx = zamrozTimery(zaladujSb());
  Object.assign(ctx.location, { pathname: '/bieg.html', search, origin: 'https://biegamy.run' });
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const html = czytaj('bieg.html').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''), rej = new Map(), stany = [], zdarzenia = {}, okno = {}, wywolania = [];
  for (const m of html.matchAll(/<([a-z0-9]+)\b([^>]*)>/gi)) {
    const a = m[2], id = /\bid="([^"]+)"/.exec(a), ds = /\bdata-stan="([^"]+)"/.exec(a), e = nowyElement(id ? id[1] : '', ds ? { 'data-stan': ds[1] } : {}); e.hidden = /\shidden(?=[\s>]|$)/.test(a);
    if (id) rej.set(id[1], e); else if (ds) stany.push(e);
  }
  const daj = (id) => { if (!rej.has(id)) rej.set(id, nowyElement(id)); return rej.get(id); };
  rej.get('bw-cta').querySelectorAll = (s) => (s === '[data-stan]' ? stany : []);
  const karta = daj('bw-moj-tresc'); let kartaHtml = '', obrazy = new Map();
  Object.defineProperty(karta, 'innerHTML', { get: () => kartaHtml, set: (v) => { kartaHtml = String(v); obrazy = new Map(); }, enumerable: true });
  karta.querySelector = (s) => { const m = /^img\[data-(dyplom|numer)="([^"]+)"\]$/.exec(s); if (!m || !kartaHtml.includes('data-' + m[1] + '="' + m[2] + '"')) return null; if (!obrazy.has(s)) obrazy.set(s, { src: '' }); return obrazy.get(s); };
  const udostepnione = [], pobrane = []; let ostatniBlob = null;
  Object.assign(ctx.document, { getElementById: daj, querySelector: () => null, createTextNode: (t) => ({ textContent: t }), head: nowyElement('head'), body: nowyElement('body'),
    createElement: (t) => (t === 'canvas' ? nowePlotno() : Object.assign(nowyElement(''), { tag: t, click() { pobrane.push({ nazwa: this.download, teksty: ostatniBlob && ostatniBlob.teksty }); } })),
    readyState: 'interactive', visibilityState: 'visible', querySelectorAll: () => [], addEventListener: (t, f) => { (zdarzenia[t] = zdarzenia[t] || []).push(f); } });
  const PrawdziwyURL = URL, U = function (a, b) { return new PrawdziwyURL(a, b); };
  U.createObjectURL = (b) => { ostatniBlob = b; return 'blob:test'; }; U.revokeObjectURL = () => {}; ctx.URL = U;
  ctx.Image = class { set src(v) { Promise.resolve().then(() => this.onerror && this.onerror()); } };
  ctx.File = class { constructor(czesci, nazwa) { this.czesci = czesci; this.name = nazwa; } };
  ctx.navigator.canShare = () => true; ctx.navigator.share = async (d) => { udostepnione.push({ nazwa: d.files[0].name, teksty: d.files[0].czesci[0].teksty }); };
  ctx.addEventListener = (t, f) => { (okno[t] = okno[t] || []).push(f); };
  const licznik = { wystartowala: true, nazwa: 'Akcja', imie: 'Janek', url_zbiorki: 'https://www.siepomaga.pl/x', bieg };
  ctx.fetch = async (url) => (/bieg-ukonczyli/.test(url) ? { ok: true, status: 200, json: async () => ({ razem: 0, lista: [] }) } : { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(licznik)) });
  for (const p of ['js/akcja.mjs', 'js/bieg.mjs']) vm.runInContext(kod(p), ctx, { filename: p });
  ctx.sb = { auth: { getSession: async () => ({ data: { session: { user: {} } } }) }, rpc: (n, a) => { wywolania.push([n, a]); return Promise.resolve(odpowiedz(n, a)); } };
  ctx.confirm = () => true; ctx.alert = () => {};
  blokiSkryptow('bieg.html').forEach((k, i) => vm.runInContext(k, ctx, { filename: 'bieg.html#' + i }));
  (zdarzenia.DOMContentLoaded || []).forEach((f) => f());
  await czekaj();
  const cel = (attr, w) => { const e = nowyElement('', { [attr]: w }); e.closest = (s) => (s === '[' + attr + ']' ? e : null); return e; };
  const klik = async (attr, w) => { (zdarzenia.click || []).forEach((f) => f({ target: cel(attr, w), preventDefault() {} })); await czekaj(); };
  const powrot = async () => { (zdarzenia.visibilitychange || []).forEach((f) => f()); await czekaj(); };
  const podglad = (id) => { const o = karta.querySelector('img[data-dyplom="' + id + '"]'); return o ? o.src : null; };
  return { daj, karta: () => kartaHtml, podglad, klik, powrot, okno, wywolania, udostepnione, pobrane };
}
const JA = (x) => Object.assign({ id: 'j1aaaaaa-0001', rodzaj: 'ja', numer: 3, imie: 'Ola', dystans_km: 5, regulamin_wersja: '2026-11-v2', ukonczony_at: '2026-12-06T10:00:00Z',
  wynik_s: 1500, wynik_dystans_km: 5, wynik_trening_km: 5.1, wynik_reczny: false, odznaka: 'zwykla', ranking_zgoda: false }, x || {});
const DZ = (x) => Object.assign({ id: 'd1bbbbbb-0002', rodzaj: 'dziecko', numer: 4, imie: 'Zosia', regulamin_wersja: '2026-11-v2', ukonczony_at: '2026-12-06T11:00:00Z', dystans_wlasny_km: 1.5, odznaka: 'zwykla' }, x || {});

test('po poprawce organizatora, „Wskaż inny trening”, poprawce dystansu dziecka i usunięciu wyniku: karta, podgląd, plik do udostępnienia i A4 tylko z nowym wynikiem', async () => {
  let moi = [JA(), DZ()];
  const s = await stronaBiegu({ bieg: BIEG(), odpowiedz: (n, a) => {
    if (n === 'akcja_bieg_moi') return { data: JSON.parse(JSON.stringify(moi)), error: null };
    if (n === 'akcja_bieg_moja_zgoda') return { data: { zgoda_email: false, ma_zapis: true }, error: null };
    if (n === 'akcja_bieg_treningi_z_okna') return { data: [{ id: 'log10', dzien: '2026-12-06', km: 10, czas_s: 2900, typ: 'Spokojny', zalicza_km: 5, z_zegarka: true }], error: null };
    if (n === 'akcja_bieg_wynik_ustal') { moi = [JA({ wynik_s: 2900, wynik_trening_km: 10 }), moi[1]]; return { data: { ok: true, wynik_s: 2900, wynik_dystans_km: 5, log_id: a.p_log_id }, error: null }; }
    return { data: null, error: null };
  } });
  const J = 'j1aaaaaa-0001', D = 'd1bbbbbb-0002';
  assert.match(s.karta(), /Ukończony: <b>5,1 km · 25:00 · 4:54 \/km<\/b>/);
  assert.ok(s.podglad(J).includes('25:00') && s.podglad(J).includes('Bieg wirtualny · 5,1 km'), 'podgląd dyplomu z wynikiem: ' + s.podglad(J));
  await s.klik('data-dyplom-udostepnij', J);
  assert.equal(s.udostepnione.length, 1); assert.ok(s.udostepnione[0].teksty.includes('25:00'));
  const nazwa1 = s.udostepnione[0].nazwa; assert.match(nazwa1, /^dyplom-j1aaaaaa-[0-9a-z]{1,6}\.png$/);

  /* 1. poprawka organizatora („Popraw”: 5 km, 26:40, bez treningu) — uczestnik wraca na kartę */
  moi = [JA({ wynik_s: 1600, wynik_trening_km: null, wynik_reczny: true }), moi[1]];
  await s.powrot();
  assert.match(s.karta(), /Ukończony: <b>5 km · 26:40 · 5:20 \/km<\/b>/); assert.doesNotMatch(s.karta(), /25:00|5,1 km/);
  assert.ok(s.podglad(J).includes('26:40') && !s.podglad(J).includes('25:00') && !s.podglad(J).includes('Bieg wirtualny · 5,1 km'), 'podgląd po poprawce: ' + s.podglad(J));
  await s.klik('data-dyplom-udostepnij', J);
  const u2 = s.udostepnione[1]; assert.ok(u2.teksty.includes('26:40') && u2.teksty.includes('Bieg wirtualny · 5 km'), 'plik po poprawce: ' + u2.teksty);
  assert.ok(!u2.teksty.includes('25:00') && !u2.teksty.includes('4:54'), 'nic z poprzedniego wyniku'); assert.notEqual(u2.nazwa, nazwa1, 'nowa nazwa pliku po zmianie wyniku');
  await s.klik('data-dyplom-a4', J);
  assert.equal(s.pobrane.length, 1); assert.match(s.pobrane[0].nazwa, /^dyplom-a4-j1aaaaaa-/); assert.ok(s.pobrane[0].teksty.includes('26:40') && !s.pobrane[0].teksty.includes('25:00'));

  /* 2. „Wskaż inny trening”: 10 km 48:20 */
  await s.klik('data-wskaz', J);
  assert.match(s.daj('bw-treningi-lista').innerHTML, /data-wybierz-trening="log10"/);
  await s.klik('data-wybierz-trening', 'log10');
  assert.ok(s.wywolania.some((w) => w[0] === 'akcja_bieg_wynik_ustal' && w[1].p_log_id === 'log10'));
  assert.match(s.karta(), /Ukończony: <b>10 km · 48:20 · 4:50 \/km<\/b>/);
  assert.ok(s.podglad(J).includes('48:20') && !s.podglad(J).includes('26:40'));
  await s.klik('data-dyplom-udostepnij', J);
  const u3 = s.udostepnione[2]; assert.ok(u3.teksty.includes('48:20') && u3.teksty.includes('Bieg wirtualny · 10 km') && !u3.teksty.includes('26:40'), 'plik po wskazaniu: ' + u3.teksty);

  /* 3. dziecko: poprawka dystansu 1,5 → 2,5 km (rodzic albo organizator) */
  assert.ok(s.podglad(D).includes('1,5 km'));
  moi = [moi[0], DZ({ dystans_wlasny_km: 2.5 })];
  await s.powrot();
  assert.ok(s.podglad(D).includes('2,5 km') && !s.podglad(D).includes('1,5 km'), 'dyplom dziecka po poprawce: ' + s.podglad(D));
  await s.klik('data-dyplom-udostepnij', D);
  assert.ok(s.udostepnione[3].teksty.includes('2,5 km') && !s.udostepnione[3].teksty.includes('1,5 km'));

  /* 4. organizator usuwa wynik dorosłego: bez dyplomu, bez przycisków dyplomu, powód escapowany; stary obraz nie wychodzi; automat nie pyta */
  const przed = s.wywolania.filter((w) => w[0] === 'akcja_bieg_wynik_ustal').length, nUd = s.udostepnione.length, nPob = s.pobrane.length;
  moi = [JA({ ukonczony_at: null, wynik_s: null, wynik_dystans_km: null, wynik_trening_km: null, wynik_reczny: false, wynik_usuniety: true, wynik_usuniety_powod: 'brak potwierdzenia <img src=x onerror=alert(1)>' }), moi[1]];
  await s.powrot();
  const k = s.karta();
  assert.match(k, /<div class="bw-wynik" data-wynik-stan="usuniety"><p class="bw-wynik-tytul" data-wynik-usuniety>Organizator usunął Twój wynik<\/p><p class="bw-opis">Powód: brak potwierdzenia &lt;img src=x onerror=alert\(1\)&gt;<\/p>/);
  assert.match(k, /Zgodnie z § 9 regulaminu nie ma dyplomu ani miejsca na liście\./);
  assert.doesNotMatch(k, new RegExp('data-dyplom(-udostepnij|-a4)?="' + J + '"'), 'bez dyplomu i jego przycisków'); assert.doesNotMatch(k, new RegExp('data-wskaz="' + J + '"'), 'bez „Wskaż trening”');
  assert.equal(s.podglad(J), null);
  await s.klik('data-dyplom-udostepnij', J); await s.klik('data-dyplom-a4', J);
  assert.equal(s.udostepnione.length, nUd, 'stary dyplom nie wychodzi po usunięciu wyniku'); assert.equal(s.pobrane.length, nPob);
  assert.equal(s.wywolania.filter((w) => w[0] === 'akcja_bieg_wynik_ustal').length, przed, 'automat nie próbuje przywrócić usuniętego wyniku');
  assert.ok(s.podglad(D).includes('2,5 km'), 'dyplom dziecka zostaje');

  /* 5. przywrócenie przez organizatora („Zalicz ręcznie”): dyplom wraca z nowym wynikiem */
  moi = [JA({ wynik_s: null, wynik_trening_km: null, wynik_reczny: true, ukonczony_at: '2026-12-09T10:00:00Z' }), moi[1]];
  await s.powrot();
  assert.match(s.karta(), /Ukończony: <b>5 km<\/b>/); assert.ok(s.podglad(J).includes('ukończono') && !s.podglad(J).includes('48:20'));
});

test('pageshow z pamięci przeglądarki („wstecz” z dzwonka) czyta zapisy od nowa; zwykłe wczytanie nie dubluje', async () => {
  const s = await stronaBiegu({ bieg: BIEG(), odpowiedz: (n) => (n === 'akcja_bieg_moi' ? { data: [JA()], error: null } : n === 'akcja_bieg_moja_zgoda' ? { data: { zgoda_email: false, ma_zapis: true }, error: null } : { data: null, error: null }) });
  const ile = () => s.wywolania.filter((w) => w[0] === 'akcja_bieg_moi').length, n0 = ile();
  (s.okno.pageshow || []).forEach((f) => f({ persisted: false })); await czekaj();
  assert.equal(ile(), n0);
  (s.okno.pageshow || []).forEach((f) => f({ persisted: true })); await czekaj();
  assert.equal(ile(), n0 + 1);
});

test('czyste funkcje: stan „usuniety”, komunikat odmowy, podpis i nazwa pliku idą za wynikiem', () => {
  const b = BIEG();
  assert.equal(B.stanWyniku({ wynik_usuniety: true }, b), 'usuniety'); assert.equal(B.stanWyniku({ wynik_usuniety: true, ukonczony_at: '2026-12-09T10:00:00Z' }, b), 'gotowy', 'przywrócony');
  assert.equal(B.stanWyniku({ wynik_usuniety: false }, b), 'brak');
  const ogolne = new Set([B.komunikatWyniku({}), B.komunikatWyniku({ siec: true }), B.komunikatWyniku({ kod: '42501' })]);
  assert.ok(!ogolne.has(B.komunikatWyniku({ ok: false, powod: 'usuniety' }))); assert.match(B.komunikatWyniku({ powod: 'usuniety' }), /^Organizator usunął wynik w tym biegu \(§ 9 regulaminu\)/);
  const dz = B.wynikHtml(DZ({ ukonczony_at: null, dystans_wlasny_km: null, wynik_usuniety: true, wynik_usuniety_powod: 'dystans do potwierdzenia' }), b);
  assert.match(dz, /Organizator usunął wynik dziecka<\/p><p class="bw-opis">Powód: dystans do potwierdzenia<\/p>/); assert.doesNotMatch(dz, /data-dziecko-km|data-dziecko-zapisz|data-dyplom/, 'rodzic nie wpisuje dystansu po usunięciu');
  const p0 = B.podpisDyplomu(JA(), b);
  for (const [k, v] of [['wynik_s', 1501], ['wynik_trening_km', 5.2], ['wynik_dystans_km', 10], ['odznaka', 'zlota'], ['imie', 'Ala'], ['numer', 9], ['ukonczony_at', '2026-12-07T10:00:00Z'], ['dystans_wlasny_km', 2]]) {
    assert.notEqual(B.podpisDyplomu(JA({ [k]: v }), b), p0, k); assert.notEqual(B.nazwaPlikuDyplomu(JA({ [k]: v }), 'telefon', b), B.nazwaPlikuDyplomu(JA(), 'telefon', b), 'nazwa: ' + k);
  }
  assert.notEqual(B.podpisDyplomu(JA(), BIEG({ nazwa: 'Inny' })), p0);
  assert.equal(B.podpisDyplomu(JA({ zgoda_email: true, ranking_zgoda: true }), b), p0, 'zgody nie zmieniają dyplomu');
  assert.equal(B.nazwaPlikuDyplomu(JA(), 'telefon', b), B.nazwaPlikuDyplomu(JA(), 'telefon', b));
  assert.match(B.nazwaPlikuDyplomu(JA({ id: '../<x>"y' }), 'a4', b), /^dyplom-a4-xy-[0-9a-z]+\.png$/, 'id oczyszczone w nazwie pliku');
});

test('bieg.html: klucz karty z podpisem wyniku, stare obrazy dyplomu czyszczone przy nowej karcie, plik dyplomu rysowany z bieżącego zapisu', () => {
  const h = czytaj('bieg.html');
  assert.match(h, /klucz = html \+ '\|' \+ \[bieg\.nazwa, bieg\.dzien_od, bieg\.dzien_do\]\.join\('\|'\) \+ '\|' \+ lista\.map\(function \(u\) \{ return B\.podpisDyplomu\(u, bieg\); \}\)\.join\('#'\);/);
  assert.match(h, /B\.odtworzPola\(t, pola\);\n\s*kanwyDyplomu = \{\};/);
  assert.match(h, /function dyplomTeraz\(id, format\) \{\n\s*var u = mojZapis\(id\); if \(!u \|\| B\.stanWyniku\(u, bieg\) !== 'gotowy'\) return null;/);
  assert.doesNotMatch(h, /udostepnijObraz\(kanwyDyplomu\[/, 'udostępnienie nie bierze obrazu z pamięci');
  assert.doesNotMatch(h, /'dyplom-' \+ id\.slice|'dyplom-a4-' \+ u\.id/, 'nazwa pliku tylko z B.nazwaPlikuDyplomu');
  assert.doesNotMatch(h + czytaj('js/bieg.mjs'), /(localStorage|sessionStorage)\.setItem\([^)]*(wynik|dyplom|moi)/i, 'wynik ani dyplom nie trafiają do pamięci przeglądarki');
});

test('Service Worker nie pamięta funkcji bazy ani EF; lista „ukończyli” najwyżej 60 s w EF i 60 s w przeglądarce; dzwonek: nowy typ jako tekst', () => {
  const sw = czytaj('sw.js');
  assert.match(sw, /if \(request\.method !== 'GET'\) return;/, 'RPC (POST) poza SW');
  assert.match(sw, /if \(url\.pathname\.startsWith\('\/functions\/v1\/'\)\) return;/, 'EF poza SW');
  assert.doesNotMatch(sw, /rest\/v1[^\n]*respondWith|respondWith[^\n]*rest\/v1/, 'PostgREST poza SW');
  const ef = czytaj('supabase/functions/bieg-ukonczyli/index.ts');
  assert.match(ef, /const CACHE_MS = 60_000/); assert.match(ef, /'Cache-Control': 'public, max-age=60'/);
  const z = czytaj('zawodnik.html');
  assert.match(z, /\$\{escapeHtml\(\(n\.message \|\| ''\)\.replace\(/, 'treść powiadomienia escapowana');
  assert.match(z, /var emoji = emojiFallback\[n\.type\] \|\| '🔔';/, 'nieznany typ: dzwonek zamiast ikony');
  assert.doesNotMatch(z, /bieg_wynik/, 'zawodnik.html bez zmian (zamrożony)');
  const mig = czytaj('supabase/migrations/20261206_akcja_bieg_dyplom_flagi.sql');
  assert.match(mig, /values \(u\.konto_id, 'bieg_wynik', null, v_msg, false, now\(\)\)/);
  assert.match(mig, /pobierz dyplom jeszcze raz\./); assert.match(mig, /Dyplomu i miejsca na liście już nie ma\./);
  const send = czytaj('supabase/functions/send-push/index.ts');
  assert.match(send, /let meta = map\[type\] \|\| \{ title: "BiegaMy", url: "\/zawodnik\.html" \};/, 'push nieznanego typu: tytuł BiegaMy');
});
