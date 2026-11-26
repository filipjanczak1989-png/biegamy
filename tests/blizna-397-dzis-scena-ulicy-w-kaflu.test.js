// Blizna #397 (26.11.2026) — nowe Dziś: kafel „Ulica” miał same liczby, a stare Dziś i strona akcji pokazują scenę ulicy.
//
// E3 commit 1 (decyzja Filipa 26.11: gotowa scena, BM_ULICA.naKaflu). Nowy kafel dostaje tę samą scenę co stary kafel:
// okno 200 px na górze kafla, liczby pod nim bez zmian. Pilnujemy tego, co łatwo zepsuć:
// - zero nowych zapytań (scena dostaje licznik, o który moduł już pyta; budżet 6 / 7),
// - scena ładuje się dopiero, gdy kafel jest blisko ekranu (sekcja Dziś schowana = nic się nie pobiera),
// - odświeżenie danych przesuwa licznik w tej samej scenie, nie buduje drugiej (każda scena ma własną pętlę i zegar),
// - kafel schowany albo narysowany z pamięci telefonu zdejmuje scenę (bez pętli w tle),
// - brak starego kodu albo scena, która nie wstała w 10 s = kafel taki jak przed E3, bez pustego okna.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, MODUL } = require('./_dzis-nowy-strona.js');

const OKNO = '<div class="dn-ul-scena"><div class="dn-ul-tlo" data-dn="scena"></div><a class="dn-ul-link" href="ulica-glowna.html#ulica-po" tabindex="-1" aria-hidden="true"></a></div>';

/** Stary kod na stronie: BM_AKCJA.zUlica ładuje js/ulica.mjs (tu: na żądanie testu), BM_ULICA.naKaflu montuje scenę w elemencie. */
function staryKod(s, { odrazu = false } = {}) {
  const log = { zUlica: 0, naKaflu: [], usun: [], czeka: [] };
  const U = { naKaflu(tu, d) { log.naKaflu.push({ tu, d }); if (!tu._bmScena) { tu._bmScena = { id: log.naKaflu.length }; tu.firstChild = {}; } return true; }, usun(tu) { log.usun.push(tu); tu._bmScena = null; } };
  s.w.BM_AKCJA = { zUlica(cb) { log.zUlica++; if (odrazu || s.w.BM_ULICA) { s.w.BM_ULICA = U; cb(U); } else log.czeka.push(cb); } };   // jak prawdziwy: po wczytaniu js/ulica.mjs jest BM_ULICA
  log.wczytaj = () => { s.w.BM_ULICA = U; log.czeka.splice(0).forEach((cb) => cb(U)); };
  return log;
}
/** IntersectionObserver jak w przeglądarce: test mówi, kiedy kafel jest blisko ekranu. */
function widok(s) {
  const v = { obserwatorzy: [] };
  s.w.IntersectionObserver = function (f, o) { const ob = { f, o, cele: [], rozlaczony: false }; v.obserwatorzy.push(ob); this.observe = (el) => ob.cele.push(el); this.disconnect = () => { ob.rozlaczony = true; }; };
  v.pokaz = (tak) => v.obserwatorzy.filter((x) => !x.rozlaczony).forEach((x) => x.f(x.cele.map((t) => ({ target: t, isIntersecting: tak }))));
  return v;
}
const nazwy = (s) => s.zapytania.map((z) => z.nazwa).sort();
const scena = (s) => s.kafel('ulica').querySelector('[data-dn="scena"]');
const straznicy = (s) => s.czasomierze.filter((c) => c.ms === 10000 && /bezSceny/.test(String(c.f)));
const odswiez = async (s) => { s.B.wczytaj(true); await s.doKonca(); };   // powrót do aplikacji, zapis treningu, ↺ zegarka

test('(1) bez starego kodu akcji (strona go nie ma): kafel jak przed E3, bez okna sceny i bez czekania', async () => {
  const s = strona(); s.B.start(); await s.doKonca();
  const h = s.kafel('ulica').innerHTML;
  assert.match(h, /^<div class="dn-gora">/, 'kafel zaczyna się nagłówkiem, jak dotąd'); assert.doesNotMatch(h, /dn-ul-scena|data-dn="scena"/);
  assert.equal(straznicy(s).length, 0);
});

test('(2) stary kod jest: okno sceny na górze kafla, liczby pod nim bez zmian, scena dostaje licznik z bazy, zero nowych zapytań', async () => {
  const bez = strona(); bez.B.start(); await bez.doKonca();
  const s = strona(), st = staryKod(s, { odrazu: true }); s.B.start(); await s.doKonca();
  const h = s.kafel('ulica').innerHTML;
  assert.ok(h.startsWith(OKNO), h.slice(0, 240));
  assert.equal(h.slice(OKNO.length), bez.kafel('ulica').innerHTML, 'pod sceną dokładnie ten sam kafel co bez sceny');
  assert.equal(st.naKaflu.length, 1); assert.equal(st.naKaflu[0].tu, scena(s), 'scena w oknie kafla');
  assert.equal(st.naKaflu[0].d.nazwa, 'Ulica próbna', 'licznik prosto z akcja_licznik'); assert.equal(st.naKaflu[0].d.wystartowala, true);
  assert.deepEqual(nazwy(s), nazwy(bez), 'te same zapytania co bez sceny: budżet 6 / 7 bez zmian');
  assert.equal(s.zapytania.filter((z) => /akcja_kafel_ukryty|akcja_bieg/.test(z.nazwa)).length, 0);
});

test('(3) scena ładuje się dopiero, gdy kafel jest blisko ekranu (300 px zapasu); daleko albo schowana sekcja = nic się nie pobiera', async () => {
  const s = strona(), st = staryKod(s), v = widok(s); s.B.start(); await s.doKonca();
  assert.ok(s.kafel('ulica').innerHTML.startsWith(OKNO), 'okno stoi od pierwszego rysunku (bez skoku), puste');
  assert.equal(v.obserwatorzy.length, 1); assert.equal(v.obserwatorzy[0].o.rootMargin, '300px 0px'); assert.deepEqual(v.obserwatorzy[0].cele, [s.kafel('ulica')]);
  assert.equal(st.zUlica, 0, 'zanim kafel jest blisko ekranu: ani skryptu ulicy, ani sceny');
  v.pokaz(false); assert.equal(st.zUlica, 0, 'wpis „nie przecina” niczego nie rusza');
  await odswiez(s); assert.equal(v.obserwatorzy.length, 1, 'odświeżenie w czasie czekania nie dokłada drugiego obserwatora'); assert.equal(st.zUlica, 0);
  v.pokaz(true); assert.equal(st.zUlica, 1); assert.equal(v.obserwatorzy[0].rozlaczony, true, 'po starcie obserwator się odłącza');
  assert.equal(st.naKaflu.length, 0, 'skrypt ulicy jeszcze się ładuje'); st.wczytaj(); assert.equal(st.naKaflu.length, 1);
});

test('(4) odświeżenie danych (powrót do aplikacji): ta sama scena dostaje nowy licznik, drugiej sceny nie ma', async () => {
  const s = strona(), st = staryKod(s, { odrazu: true }); s.B.start(); await s.doKonca();
  const tu = scena(s), pierwsza = tu._bmScena;
  await odswiez(s); await odswiez(s);
  assert.equal(st.naKaflu.length, 3); assert.ok(st.naKaflu.every((x) => x.tu === tu)); assert.equal(tu._bmScena, pierwsza, 'kontroler sceny ten sam');
  assert.deepEqual(st.usun, [], 'nic nie rozbieramy przy odświeżeniu');
  // w przeglądarce nowe innerHTML daje nowe miejsce na scenę: stara scena przechodzi do niego, nie powstaje druga
  const kafel = s.kafel('ulica'), stary = kafel.querySelector, wymiany = [];
  const nowe = { parentNode: { replaceChild: (a, b) => wymiany.push([a, b]) } };
  kafel.querySelector = (sel) => (sel === '[data-dn="scena"]' ? nowe : stary.call(kafel, sel));
  await odswiez(s);
  assert.deepEqual(wymiany, [[tu, nowe]], 'stara scena wchodzi w miejsce nowego okna');
  assert.equal(st.naKaflu.at(-1).tu, tu); assert.deepEqual(st.usun, []);
});

test('(5) akcja przed startem: kafel schowany, sceny nie ma wcale', async () => {
  const s = strona({ licznik: { wystartowala: false } }), st = staryKod(s, { odrazu: true }); s.B.start(); await s.doKonca();
  assert.equal(s.kafel('ulica').hidden, true); assert.equal(st.zUlica, 0); assert.equal(st.naKaflu.length, 0);
});

test('(5b) kafel schowany po tym, jak scena stała: usun() na tej scenie', async () => {
  let licznik = { wystartowala: true, km: 3607, cel_km: 12500, nazwa: 'Ulica próbna' };
  const s = strona({ licznik }), st = staryKod(s, { odrazu: true }); s.B.start(); await s.doKonca();
  const tu = scena(s); s.w.BM_ULICA = { naKaflu: () => true, usun: (x) => st.usun.push(x) };
  licznik.wystartowala = false;
  await odswiez(s);
  assert.equal(s.kafel('ulica').hidden, true); assert.deepEqual(st.usun, [tu], 'pętla i zegar sceny nie zostają w tle');
});

test('(6) skrypt ulicy nie doszedł (zUlica nigdy nie odpowiada): po 10 s okno znika, a następne rysunki są bez okna', async () => {
  const s = strona(), st = staryKod(s); s.B.start(); await s.doKonca();
  assert.equal(st.zUlica, 1); const straz = straznicy(s);
  assert.equal(straz.length, 1, 'jeden strażnik na pierwszą scenę');
  straz[0].f();
  assert.equal(s.kafel('ulica').querySelector('.dn-ul-scena').hidden, true, 'puste okno nie zostaje');
  await odswiez(s);
  assert.doesNotMatch(s.kafel('ulica').innerHTML, /dn-ul-scena/, 'kolejny rysunek bez okna: kafel jak przed E3');
  // scena stoi: strażnik nic nie robi
  const ok = strona(), st2 = staryKod(ok, { odrazu: true }); ok.B.start(); await ok.doKonca();
  assert.equal(straznicy(ok).length, 1); straznicy(ok).forEach((c) => c.f());
  assert.notEqual(ok.kafel('ulica').querySelector('.dn-ul-scena').hidden, true); assert.equal(st2.naKaflu.length, 1);
});

test('(7) moduł rysuje kafel, zanim stary skrypt akcji się wczytał: okno od razu, scena po DOMContentLoaded; bez skryptu okno znika', async () => {
  for (const jest of [true, false]) {
    const s = strona(), zd = []; s.d.readyState = 'loading'; s.d.addEventListener = (n, f) => { if (n === 'DOMContentLoaded') zd.push(f); };
    s.B.start(); await s.doKonca();
    assert.ok(s.kafel('ulica').innerHTML.startsWith(OKNO), 'strona jeszcze się czyta: okno czeka na stary skrypt');
    const st = jest ? staryKod(s, { odrazu: true }) : null;
    s.d.readyState = 'interactive'; zd.splice(0).forEach((f) => f());
    if (jest) assert.equal(st.naKaflu.length, 1);
    else assert.equal(s.kafel('ulica').querySelector('.dn-ul-scena').hidden, true, 'skryptu akcji nie ma: bez pustego okna');
  }
});

test('(8) kafel z pamięci telefonu (bez sieci): bez sceny, a scena z wcześniejszego wejścia zdjęta', async () => {
  const s = strona(), st = staryKod(s, { odrazu: true }); s.B.start(); await s.doKonca();
  const tu = scena(s);
  s.st.online = false; s.st.awaria = { '*': 'siec' };
  await odswiez(s);
  const h = s.kafel('ulica').innerHTML;
  assert.match(h, /Ulica próbna/, 'kafel z pamięci jest'); assert.doesNotMatch(h, /dn-ul-scena/, 'bez okna sceny (scena bez sieci: E3 commit 4)');
  assert.deepEqual(st.usun, [tu]);
});

test('(9) style: stała wysokość okna od pierwszego rysunku, scena od krawędzi do krawędzi kafla, cała scena jest linkiem do ulicy', () => {
  assert.match(MODUL, /#dzis-nowy \.dn-ul-scena\{position:relative;height:200px;margin:-16px -16px 14px;overflow:hidden;border-radius:17px 17px 0 0;/);
  assert.match(MODUL, /#dzis-nowy \.dn-ul-tlo\{position:absolute;left:0;right:0;top:-140px\}/, 'okno pokazuje dół sceny (droga, maszyny, mur): 140–340 z 340 px');
  assert.match(MODUL, /#dzis-nowy \.dn-ul-link\{position:absolute;inset:0;z-index:2;/);
  assert.match(MODUL, /function scenaHtml\(adres\) \{\n    return '[^\n]*href="' \+ esc\(adres\) \+ '"/, 'adres przez esc');
});
