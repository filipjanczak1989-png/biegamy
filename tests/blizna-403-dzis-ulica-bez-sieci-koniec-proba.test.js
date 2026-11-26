// Blizna #403 (26.11.2026) — nowe Dziś, kafel Ulicy: bez sieci bez sceny, po końcu akcji bez końca, konto próby bez danych próby.
//
// E3 commit 4 (plan E3: bez sieci i stany brzegowe). Trzy dziury po commitach 0–3:
// 1. Bez sieci kafel z pamięci telefonu zawsze tracił scenę, także gdy sieć padła w trakcie i scena stała (była rozbierana).
// 2. Po końcu akcji kafel dalej mówił „z 12 500 km · 29%” i zachęcał do spaceru, i nigdy nie znikał. Stary kod ma na to regułę
//    (BM_AKCJA.stanKarty: „Zrobiliśmy to” przez 7 dni, potem nic), nowy kafel jej nie znał.
// 3. Konto próby dostawało sam licznik próby, bez nazwy, zbiórki, plakatu i rysunku koparki, które stary kod dociąga osobną
//    funkcją i zostawia w window._akcjaStan. Nowy kafel nie może dociągać sam (zero nowych zapytań), więc bierze to, co stary kod już ma.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { strona, tik } = require('./_dzis-nowy-strona.js');

const AKCJA = fs.readFileSync(path.join(__dirname, '..', 'js', 'akcja.mjs'), 'utf8');
function akcjaPrawdziwa() {
  const g = { escapeHtml: (s) => String(s), safeUrlAttr: (u) => (/^https:\/\/afqojgkaveykxbltxzwm\.supabase\.co\//.test(u) ? u : ''), safeExternalHref: (u) => (/^https:\/\//.test(u) ? u : ''),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, setTimeout: () => 0, console: { warn() {}, log() {}, error() {} },
    Date, JSON, Math, Promise, String, Number, Object, Array, RegExp, Error, isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, URL, URLSearchParams, Intl };
  vm.createContext(g); vm.runInContext(AKCJA, g); return g.BM_AKCJA;
}
const A = akcjaPrawdziwa();
const L = { wystartowala: true, km: 3607, suma_km: 3607, cel_km: 12500, nazwa: 'Ulica próbna', koniec: null };
// „dziś” testów końca akcji daleko od prawdziwego kalendarza: moduł ma liczyć stan zegarem strony (Date.now modułu), nie zegarem systemu
const TERAZ_T = new Date(2027, 0, 20, 12).getTime();
const dniTemu = (n) => { const d = new Date(2027, 0, 20 - n, 12); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/** Stary kod: reguły akcji (prawdziwe) + atrapa ładowania sceny. scena: 'nie' = zUlica nie odpowiada (brak skryptu). */
function staryKod(s, { scena = 'tak', reguly = true } = {}) {
  const log = { naKaflu: [], usun: [], zUlica: 0 };
  const U = { naKaflu(tu, d) { log.naKaflu.push({ tu, d }); if (!tu._bmScena) { tu._bmScena = { n: log.naKaflu.length }; tu.firstChild = {}; } return true; }, usun(tu) { log.usun.push(tu); tu._bmScena = null; } };
  s.w.BM_AKCJA = Object.assign(reguly ? { stanKarty: A.stanKarty, plakatUrl: A.plakatUrl, linkZbiorki: A.linkZbiorki } : {},
    { zUlica(cb) { log.zUlica++; if (scena === 'tak') { s.w.BM_ULICA = U; cb(U); } } });
  return log;
}
/** Pamięć Service Workera: które skrypty sceny są w cache. */
const swCache = (s, jest) => { s.w.caches = { match: (u) => Promise.resolve(jest.includes(u) ? { ok: true } : undefined) }; };
const scena = (s) => s.kafel('ulica').querySelector('[data-dn="scena"]');
const odswiez = async (s) => { s.B.wczytaj(true); await s.doKonca(); };
const offline = (s) => { s.st.online = false; s.st.awaria = { '*': 'siec' }; };
const nazwy = (s) => s.zapytania.map((q) => q.nazwa).sort();

test('(1) akcja zamknięta (do 7 dni po końcu, reguła stanKarty starego kodu): suma razem i „akcja zakończona”, bez celu, paska i zachęty do spaceru; scena zostaje', async () => {
  const d = { ...L, koniec: dniTemu(2) };
  assert.equal(A.stanKarty(d, TERAZ_T), 'zamknieta');
  const s = strona({ licznik: d, wklad: { km: 0 }, teraz: TERAZ_T }), st = staryKod(s); s.B.start(); await s.doKonca();
  const h = s.kafel('ulica').innerHTML;
  assert.equal(s.kafel('ulica').hidden, false);
  assert.match(h, /<div class="dn-ul-km dn-ul-km--koniec"><b>3.607<\/b><span>km razem · akcja zakończona<\/span><\/div>/, 'bez paska: odstęp 8 px pod liczbą (dn-ul-km--koniec)');
  assert.doesNotMatch(h, /dn-pasek|z 12.500 km|%<\/span>/, 'bez celu i paska');
  assert.equal(s.kafel('ulica').querySelector('[data-dn="wklad"]').innerHTML, 'Twój wkład: <b>0 km</b>', 'po końcu bez „Spacer też buduje ulicę.”');
  assert.equal(st.naKaflu.length, 1, 'scena pokazuje ulicę w stanie końcowym');
  const trwa = strona({ licznik: L, wklad: { km: 0 }, teraz: TERAZ_T }); staryKod(trwa); trwa.B.start(); await trwa.doKonca();
  assert.match(trwa.kafel('ulica').querySelector('[data-dn="wklad"]').innerHTML, /Spacer też buduje ulicę\./, 'w trakcie akcji zachęta zostaje');
  assert.match(trwa.kafel('ulica').innerHTML, /dn-pasek/);
});

test('(2) ponad 7 dni po końcu: kafel schowany, sceny nie ma, do pamięci telefonu idzie „brak”', async () => {
  const d = { ...L, koniec: dniTemu(9) };
  assert.equal(A.stanKarty(d, TERAZ_T), 'brak');
  const s = strona({ licznik: d, teraz: TERAZ_T }), st = staryKod(s); s.B.start(); await s.doKonca();
  assert.equal(s.kafel('ulica').hidden, true); assert.equal(st.zUlica, 0);
  assert.equal(s.migawka().czesci.dzisNowe.ulica, null);
});

test('(3) bez reguły starego kodu (stanKarty niedostępne): po starcie kafel jak dotąd, także z datą końca', async () => {
  const s = strona({ licznik: { ...L, koniec: dniTemu(9) } }); staryKod(s, { reguly: false }); s.B.start(); await s.doKonca();
  assert.equal(s.kafel('ulica').hidden, false); assert.match(s.kafel('ulica').innerHTML, /z 12.500 km · 29%/);
});

test('(4) start bez sieci, skrypty sceny w pamięci Service Workera: scena z zapamiętanego licznika, bez konfetti', async () => {
  const on = strona(); staryKod(on); on.B.start(); await on.doKonca();   // wczoraj z siecią: migawka w telefonie
  const s = strona({ pamiec: on.tel.mapa, online: false, awaria: { '*': 'siec' } }), st = staryKod(s); swCache(s, ['js/ulica.mjs', 'js/ulica-scena.mjs']);
  s.B.start(); await s.doKonca();
  const h = s.kafel('ulica').innerHTML;
  assert.match(h, /^<div class="dn-ul-scena">/, 'okno sceny'); assert.match(h, /Ulica próbna/);
  assert.equal(st.naKaflu.length, 1); assert.equal(st.naKaflu[0].d.nazwa, 'Ulica próbna', 'licznik z pamięci telefonu');
  assert.match(s.pasekOffline() || '', /Offline/, 'pasek offline jak przy innych kaflach z pamięci');
});

test('(5) start bez sieci bez skryptów sceny w pamięci (albo bez Cache API): kafel bez okna, nic nie zjeżdża po 10 s', async () => {
  const on = strona(); staryKod(on); on.B.start(); await on.doKonca();
  for (const [opis, przygotuj] of [['brak skryptu sceny w cache', (s) => swCache(s, ['js/ulica.mjs'])], ['brak Cache API', () => {}]]) {
    const s = strona({ pamiec: on.tel.mapa, online: false, awaria: { '*': 'siec' } }), st = staryKod(s, { scena: 'nie' }); przygotuj(s);
    s.B.start(); await s.doKonca();
    assert.doesNotMatch(s.kafel('ulica').innerHTML, /dn-ul-scena/, opis); assert.match(s.kafel('ulica').innerHTML, /Ulica próbna/, opis);
    assert.equal(st.zUlica, 0, opis + ': bez próby ładowania');
  }
});

test('(6) sieć pada w trakcie: kafel z pamięci zostawia stojącą scenę (bez rozbierania), a wraca do zwykłego po powrocie sieci', async () => {
  const s = strona(), st = staryKod(s); s.B.start(); await s.doKonca();
  const tu = scena(s), kontroler = tu._bmScena;
  offline(s); await odswiez(s);
  assert.deepEqual(st.usun, []); assert.equal(tu._bmScena, kontroler); assert.match(s.kafel('ulica').innerHTML, /^<div class="dn-ul-scena">/);
  s.st.online = true; s.st.awaria = {}; await odswiez(s);
  assert.deepEqual(st.usun, []); assert.equal(st.naKaflu.at(-1).tu, tu, 'ta sama scena przez cały czas');
});

test('(7) z pamięci telefonu: akcja zamknięta liczona TERAZ (ponad 7 dni = schowany), zamknięta w oknie = wariant końca', async () => {
  for (const [dni, schowany] of [[9, true], [3, false]]) {
    const on = strona({ licznik: { ...L, koniec: dniTemu(dni) }, teraz: TERAZ_T }); staryKod(on, { reguly: false }); on.B.start(); await on.doKonca();   // w pamięci: licznik z datą końca
    const s = strona({ pamiec: on.tel.mapa, online: false, awaria: { '*': 'siec' }, teraz: TERAZ_T }); staryKod(s, { scena: 'nie' });
    s.B.start(); await s.doKonca();
    assert.equal(s.kafel('ulica').hidden, schowany, dni + ' dni po końcu');
    if (!schowany) assert.match(s.kafel('ulica').innerHTML, /akcja zakończona/);
  }
});

const PROBA_SLUG = (id) => (id ? 'proba' : 'dla-fabianka');
const SCALONY = { ...L, nazwa: 'Ulica Fabianka', imie: 'Fabianek', url_zbiorki: 'https://www.siepomaga.pl/atrapa', plakat_url: 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/plakat.webp?token=t', testowa: true };

test('(8) konto próby: kafel bierze scalony licznik starego kodu (nazwa, zbiórka, plakat), adres z ?proba=1; zero nowych zapytań', async () => {
  const s = strona(); s.w.BM_AKCJA_CYTATY = { slugDla: PROBA_SLUG }; const st = staryKod(s); s.w._akcjaStan = SCALONY;
  s.B.start(); await s.doKonca();
  const h = s.kafel('ulica').innerHTML;
  assert.match(h, /Ulica Fabianka/); assert.match(h, />Plakat</); assert.match(h, />Zbiórka</);
  assert.match(h, /href="dla-fabianka\.html\?proba=1#ulica-po"/);
  assert.equal(st.naKaflu[0].d, SCALONY, 'scena też dostaje scalony licznik (rysunek koparki)');
  // zapytania: scalony stan nic nie dokłada (porównanie z próbą bez stanu starego kodu). Próba pyta o licznik i wkład dwa razy już przed E3 4:
  // pierwsza fala zgaduje slug bez id zawodnika (slugDla(null) = zwykła akcja), druga pyta o „proba”. Tylko konta testowe.
  const bezStanu = strona(); bezStanu.w.BM_AKCJA_CYTATY = { slugDla: PROBA_SLUG }; staryKod(bezStanu); bezStanu.B.start(); await bezStanu.doKonca();
  assert.deepEqual(nazwy(s), nazwy(bezStanu), 'scalony stan starego kodu: zero zapytań');
  assert.equal(s.zapytania.filter((q) => /proba-wizerunek|functions/.test(q.nazwa)).length, 0, 'moduł nie woła funkcji próby');
  const zwykle = strona(); staryKod(zwykle); zwykle.w._akcjaStan = SCALONY; zwykle.B.start(); await zwykle.doKonca();
  assert.doesNotMatch(zwykle.kafel('ulica').innerHTML, /Ulica Fabianka|>Plakat</, 'zwykłe konto rysuje z własnego licznika, nawet gdy stan starego kodu już jest');
  assert.doesNotMatch(JSON.stringify(s.migawka().czesci.dzisNowe.ulica.licznik), /plakat|sign\/|token/, 'do pamięci telefonu idzie licznik z bazy, bez podpisanych adresów próby');
});

test('(9) konto próby, stary kod kończy po module: kafel rysuje się jeszcze raz ze scalonym licznikiem, w tej samej scenie, z wkładem', async () => {
  const s = strona(); s.w.BM_AKCJA_CYTATY = { slugDla: PROBA_SLUG }; const st = staryKod(s);
  let wolania = 0; s.w._odswiezStanAkcji = () => { wolania++; return Promise.resolve().then(() => { s.w._akcjaStan = SCALONY; return SCALONY; }); };
  s.B.start(); await s.doKonca();
  assert.doesNotMatch(s.kafel('ulica').innerHTML, /Ulica Fabianka/, 'na razie sam licznik próby');
  const tu = scena(s);
  s.w._odswiezStanAkcji(); await tik(); await tik(); await tik();
  assert.equal(wolania, 1, 'owinięcie woła oryginał');
  assert.match(s.kafel('ulica').innerHTML, /Ulica Fabianka/); assert.match(s.kafel('ulica').innerHTML, />Plakat</);
  assert.match(s.kafel('ulica').innerHTML, /data-dn="wklad">Twój wkład: <b>196 km<\/b>/, 'wkład nie ginie przy ponownym rysunku');
  assert.equal(st.naKaflu.at(-1).tu, tu); assert.equal(st.naKaflu.at(-1).d, SCALONY); assert.deepEqual(st.usun, []);
  const zwykle = strona(), st2 = staryKod(zwykle); zwykle.w._odswiezStanAkcji = () => { zwykle.w._akcjaStan = SCALONY; return Promise.resolve(SCALONY); };
  zwykle.B.start(); await zwykle.doKonca(); zwykle.w._odswiezStanAkcji(); await tik(); await tik();
  assert.doesNotMatch(zwykle.kafel('ulica').innerHTML, /Ulica Fabianka/, 'zwykłe konto nie bierze stanu starego kodu'); assert.equal(st2.naKaflu.length, 1);
});
