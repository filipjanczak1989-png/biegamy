/* BLIZNA 329 (Filip 21.11): „Co za akcja?” szło do trybu imprezy i sieci (v2: obcy bieg z wynikami z internetu), a pytania o bieg wirtualny — do modelu,
   kalendarza (miejscowość Mikołajki) albo sieci. Teraz:
   - 94 warianty z propozycji (tests/_okienko-warianty-akcja-bieg.js) mają stałą trasę w v1 i v2, zero sieci i modelu dla akcji i biegu;
   - odpowiedzi o biegu to całe ustępy regulaminu z js/bieg.mjs (to samo złożenie co bieg.html), w kodzie Okienka nie ma zdań regulaminu;
   - fragment z imieniem dziecka (§ 1 ust. 2) nigdy nie trafia do odpowiedzi;
   - pytania o BiegaMy nie idą do sieci: „Nie wiem tego na pewno.” + link (bieg.html, dla-fabianka.html, o-nas.html — front je przepuszcza). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');
const { baza, fetchF6, DZIS, TERAZ } = require('./_lawka-pytan.js');
const { WARIANTY } = require('./_okienko-warianty-akcja-bieg.js');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

const IMIE_ATRAPA = 'Atrapek', LINK_ATRAPA = 'https://zrzutka.pl/atrapa-zbiorki';
const BIEG = { slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka', regulamin_wersja: '2026-11-v8', regulamin_od: '2026-11-20', dzien_od: '2026-11-18',
  dzien_do: '2026-12-06', wynik_do: '2026-12-06', koniec_at: '2026-12-06T19:00:00+00:00', dystanse_km: [5], faza: 'trwa', limit_dzieci: 6, dzieci: 3, zapisani: 40,
  zapisani_na: { 5: 40 }, ukonczyli_n: 10, zlote: 2, wsparcie_kwoty_zl: [20, 30, 50] };
const LICZNIK = { wystartowala: true, wystartowala_at: '2026-11-07T06:01:00Z', nazwa: '#12500 km dla Fabianka', imie: IMIE_ATRAPA, start: '2026-11-07', cel_km: 12500,
  suma_km: 2815.2, pct: 22.5, zamknieta: false, url_zbiorki: LINK_ATRAPA, wyprawa_trwa: true, wyprawa_km: 87.4, wyprawa_cel_km: null, wyprawa_cel_nazwa: null,
  wyprawa_dotarla_at: null, bieg: BIEG };

let M = null;
async function moduly() {
  if (M) return M;
  await zaladuj('js/akcja-cytaty.mjs'); await zaladuj('js/akcja.mjs'); await zaladuj('js/bieg.mjs');
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const BO = await zaladuj('supabase/functions/okienko/bieg-odp.mjs');
  const { FAQ } = await zaladuj('supabase/functions/okienko/faq-akcji.mjs');
  const Os = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const Im = await zaladuj('supabase/functions/okienko/impreza.mjs');
  const { oNas } = await zaladuj('supabase/functions/_shared/o-nas.mjs');
  const { potok } = await zaladuj('supabase/functions/okienko-v2/potok.mjs');
  const { INTENCJE_SIECI } = await zaladuj('supabase/functions/okienko-v2/wiedza.mjs');
  M = { R, BO, FAQ, Os, Im, oNas, potok, INTENCJE_SIECI, AK: globalThis.BM_AKCJA_CYTATY, AKK: globalThis.BM_AKCJA, B: globalThis.BM_BIEG_REAL };
  return M;
}

/* ustępy regulaminu policzone w teście niezależnie od bieg-odp.mjs: jak bieg.html — regulaminBloki(wartosciTekstow(bieg, licznik, link)) */
function regulamin(B, licznik) {
  const w = B.wartosciTekstow(licznik.bieg, licznik, licznik.url_zbiorki);
  assert.ok(w, 'atrapa licznika ma komplet wartości do tekstów (inaczej test niczego nie sprawdza)');
  const u = {}; let par = '', tytul = '';
  for (const x of B.regulaminBloki(w)) {
    if (x.typ === 'tytul') tytul = x.tekst;
    else if (x.typ === 'naglowek') { const m = /^§ (\d+)\./.exec(x.tekst); par = m ? m[1] : ''; }
    else if (x.typ === 'punkt' && par) { const m = /^(\d+)\.\s+([\s\S]+)$/.exec(x.tekst); if (m) u[par + '.' + m[1]] = m[2]; }
  }
  return { u, tytul };
}
function oczekiwaneZdania(M, podtemat, ust) {
  const { u, tytul } = regulamin(M.B, LICZNIK);
  if (podtemat === 'regulamin') return [tytul];
  const podpis = 'Regulamin biegu, ' + ust.map((k) => '§ ' + k.split('.')[0] + ' ust. ' + k.split('.')[1]).join(', ') + '.';
  return [...(podtemat === 'termin-zapisow' ? ['Regulamin nie podaje osobnego terminu zapisów.'] : []), ...ust.map((k) => u[k]), podpis];
}

/* v1: kolejność index.ts przed modelem (router → o nas → strażnik BiegaMy → osoba → impreza); katalog jak w ławce (atrapa, warianty go nie trafiają) */
function trasaV1(M, q) {
  M.AK.ustawStan({ ruszyla: true, zamknieta: false, proba: false });
  const t = M.R.dopasuj(q, DZIS);
  if (t && 'zdanie' in t) return { trasa: t.log, traf: t };
  if (t && 'nawiguj' in t) return { trasa: 'nawiguj', traf: t };
  if (t) return { trasa: t.narzedzie, traf: t };
  const on = M.oNas(q);
  if (on) return { trasa: 'o-nas' };   // od 22.11 (krok 3) v1 odpowiada też tematem „liczba”, jak v2
  const bm = M.R.rodzajBiegaMy(q);
  if (bm === 'akcja' || bm === 'bieg') return { trasa: 'nie-wiem', bm };
  if (M.Os.osobaZPytania(q)) return { trasa: 'osoba', bm };
  if (!bm && M.Im.imprezaZPytania(q)) return { trasa: 'impreza', bm };
  return { trasa: 'model', bm };
}

/* v2: prawdziwy potok na atrapach (jak tests/_lawka-akcji.js); sieć i model liczone, nigdy wołane naprawdę */
async function przebiegV2(M, q, licznik, nadpisz = {}) {
  const adm = atrapa({ okienko_v2_log: [], okienko_v2_rozmowa: [], okienko_siec_cache: [], okienko_znaleziska: [] });
  const sieci = [], modele = [];
  const nad = { sprawdzLimity: async () => null, uzyteSiecDzis: async () => 0, uzyteRozmowDzis: async () => 0,
    rozumienie: async () => { modele.push(q); return { intencja: 'nie_wiem', pewnosc: 0, dopytac: true, kandydaci: [], sloty: {}, tok: { we: 0, wy: 0 } }; },
    zapytajSiec: async () => { sieci.push(q); throw new Error('sieć niedozwolona'); },
    zapytajModel: async () => { modele.push(q); throw new Error('model niedozwolony'); },
    rozmowaModel: async () => { modele.push(q); return null; }, generujJson: async () => { modele.push(q); throw new Error('model niedozwolony'); }, ...nadpisz(sieci, modele) };
  const fetchFn = async (url, init) => {
    if (String(url).includes('generativelanguage')) { (String((init && init.body) || '').includes('googleSearch') ? sieci : modele).push(q); throw new Error('atrapa: Gemini niedozwolone'); }
    return fetchF6(url, init);
  };
  const sb = atrapa(baza());
  sb.rpc = async (n) => (n === 'akcja_licznik' && licznik ? { data: licznik, error: null } : { data: null, error: { message: 'rpc' } });
  const r = await M.potok({ tekst: q, historia: [], ekran: 'home', athleteId: JA, sb, adm, jwt: 'T', dzis: DZIS, teraz: TERAZ, gemini: 'K', budzet: 0, fetchFn }, nad);
  return { slad: (r.slad || []).join('>'), body: r.body || {}, sieci: sieci.length, modele: modele.length };
}
const bezNadpisan = () => ({});

test('warianty: 94 pytania z propozycji, bez powtórzeń, każde z oczekiwaniem', () => {
  assert.equal(WARIANTY.length, 94);
  assert.equal(new Set(WARIANTY.map((w) => w[1])).size, 94);
  for (const [, q, o] of WARIANTY) assert.match(o, /^(zagadka(:km)?|faq10|bieg:[a-z-]+:[0-9.,]*|o-nas|biegamy-bez-sieci|bez-zmian:[a-z_]+:.+)$/, q);
  for (const q of ['Co za akcja?', 'Czy trening bez czasu zalicza bieg?', 'Czy mogę pobiec maraton w biegu mikołajkowym?', 'Jak liczy się czas w biegu wirtualnym?',
    'Kiedy kończy się bieg na Mikołajki?', 'Do kiedy trening z zegarka wejdzie do biegu?', 'Gdzie jest mój dyplom z biegu?', 'Czy mogę zapisać dziecko na bieg?', 'Kiedy koniec akcji?'])
    assert.ok(WARIANTY.some((w) => w[1] === q), 'pytanie z przeglądu w wariantach: ' + q);
});

test('v1 (router i kolejność EF): trasa każdego z 94 wariantów; odpowiedź o biegu = ustępy z js/bieg.mjs', async () => {
  const M = await moduly();
  const FAQ10 = M.FAQ.find((f) => f.nr === 10).o;
  const zle = [];
  for (const [, q, o] of WARIANTY) {
    const v = trasaV1(M, q), [rodzaj, a, b] = o.split(':');
    const blad = (co) => zle.push(`${q} → ${v.trasa}: ${co}`);
    if (rodzaj === 'zagadka' || rodzaj === 'faq10') { if (v.trasa !== 'zagadka') blad('oczekiwana zagadka'); else if (rodzaj === 'faq10' && v.traf.zdanie !== FAQ10) blad('oczekiwany FAQ 10'); }
    else if (rodzaj === 'bieg') {
      const ust = b ? b.split(',') : [];
      if (v.trasa !== 'bieg') { blad('oczekiwany bieg'); continue; }
      if (v.traf.bieg.podtemat !== a || v.traf.bieg.ust.join(',') !== ust.join(',')) blad(`temat ${v.traf.bieg.podtemat}:${v.traf.bieg.ust} zamiast ${a}:${ust}`);
      if (v.traf.zdanie !== M.R.ODP_NIE_WIEM || v.traf.karty[0].dane.cel !== 'bieg.html') blad('bez zapasowego „nie wiem” + linku do strony biegu');
      const ob = M.BO.odpowiedzBiegu(LICZNIK, v.traf.bieg);
      if (!ob) { blad('brak odpowiedzi z regulaminu'); continue; }
      try { assert.deepEqual(ob.zdania, oczekiwaneZdania(M, a, ust)); } catch { blad('zdania inne niż ustępy z js/bieg.mjs: ' + JSON.stringify(ob.zdania).slice(0, 120)); }
      if (ob.karty[0].dane.cel !== 'bieg.html' || ob.karty[0].dane.tytul !== BIEG.nazwa) blad('karta: ' + JSON.stringify(ob.karty[0]));
    } else if (rodzaj === 'o-nas') { if (v.trasa !== 'o-nas') blad('oczekiwane o nas'); }
    else if (rodzaj === 'biegamy-bez-sieci') { if (v.trasa !== 'model' || v.bm !== 'biegamy') blad('oczekiwany model bez sieci (strażnik BiegaMy)'); }
    else if (rodzaj === 'bez-zmian') { if (v.trasa !== a) blad('oczekiwane jak dotąd: ' + a); }
  }
  assert.deepEqual(zle, []);
});

test('v2 (prawdziwy potok): trasa i treść każdego z 94 wariantów; akcja i bieg bez sieci i modelu', async () => {
  const M = await moduly();
  const FAQ10 = M.FAQ.find((f) => f.nr === 10).o, km = M.AKK.km(LICZNIK.suma_km);
  const zle = [];
  for (const [, q, o] of WARIANTY) {
    const r = await przebiegV2(M, q, LICZNIK, bezNadpisan), [rodzaj, a, ...reszta] = o.split(':'), zd = (r.body.zdania || []).join(' ');
    const blad = (co) => zle.push(`${q} → ${r.slad}: ${co}`);
    if (['zagadka', 'faq10', 'bieg'].includes(rodzaj) && (r.sieci || r.modele)) blad(`sieć ${r.sieci}, model ${r.modele}`);
    if (rodzaj === 'zagadka') { if (r.slad !== 'router:zagadka') blad('oczekiwana zagadka'); else if (a === 'km' && !zd.includes(km)) blad('licznik bez ' + km + ': ' + zd); }
    else if (rodzaj === 'faq10') { if (r.slad !== 'router:zagadka' || r.body.zdania[0] !== FAQ10) blad('oczekiwany FAQ 10: ' + zd); }
    else if (rodzaj === 'bieg') {
      const ust = reszta[0] ? reszta[0].split(',') : [];
      if (r.slad !== 'router:bieg') { blad('oczekiwany bieg'); continue; }
      try { assert.deepEqual(r.body.zdania, oczekiwaneZdania(M, a, ust)); } catch { blad('zdania inne niż ustępy z js/bieg.mjs: ' + zd.slice(0, 120)); }
      if (!r.body.karty.length || r.body.karty[0].dane.cel !== 'bieg.html') blad('bez karty „Otwórz stronę biegu ›”');
    } else if (rodzaj === 'o-nas') { if (r.slad !== 'router:o-nas') blad('oczekiwane o nas'); }
    else if (rodzaj === 'biegamy-bez-sieci') { if (r.sieci || /impreza|siec/.test(r.slad)) blad('sieć albo tryb imprezy dla pytania o BiegaMy'); }
    else if (rodzaj === 'bez-zmian') { if (r.slad !== reszta.join(':')) blad('oczekiwane jak dotąd: ' + reszta.join(':')); }
  }
  assert.deepEqual(zle, []);
});

test('„Co za akcja?” (próba Filipa 21.11): v1 i v2 — zagadka z kartą akcji, zero sieci, zero modelu, nigdy tryb imprezy', async () => {
  const M = await moduly();
  for (const q of ['Co za akcja?', 'co za akcja', 'Co za akcja']) {
    assert.equal(trasaV1(M, q).trasa, 'zagadka', 'v1: ' + q);
    const r = await przebiegV2(M, q, LICZNIK, bezNadpisan);
    assert.equal(r.slad, 'router:zagadka', 'v2: ' + q);
    assert.equal(r.sieci + r.modele, 0, 'v2 bez sieci i modelu: ' + q);
    assert.equal(r.body.zdania[0], M.AK.PO_STARCIE);
    assert.equal(r.body.karty[0].typ, 'akcja', 'karta akcji (licznik)');
  }
});

test('§ 1 ust. 2 (imię dziecka i link zbiórki) nigdy nie trafia do odpowiedzi', async () => {
  const M = await moduly();
  const { u } = regulamin(M.B, LICZNIK);
  assert.ok(u['1.2'] && u['1.2'].includes(IMIE_ATRAPA) && u['1.2'].includes(LINK_ATRAPA), 'atrapa: fragment z imieniem dziecka istnieje w regulaminie (test ma sens)');
  assert.ok(M.BO.USTEPY_ZAKAZANE.includes('1.2'));
  for (const [podtemat, , ust] of M.R.TEMATY_BIEGU) assert.ok(!ust.includes('1.2'), 'router nie wskazuje § 1 ust. 2: ' + podtemat);
  const tematy = [...M.R.TEMATY_BIEGU.map(([podtemat, , ust]) => ({ podtemat, ust })), { podtemat: 'ogolnie', ust: ['1.1', '2.1', '2.2'] }];
  for (const t of tematy) {
    const s = JSON.stringify(M.BO.odpowiedzBiegu(LICZNIK, t));
    for (const zakazane of [IMIE_ATRAPA, LINK_ATRAPA, u['1.2']]) assert.ok(!s.includes(zakazane), `temat ${t.podtemat}: w odpowiedzi „${zakazane.slice(0, 30)}”`);
  }
  assert.equal(M.BO.odpowiedzBiegu(LICZNIK, { podtemat: 'x', ust: ['1.2'] }), null, 'sam § 1 ust. 2 → brak odpowiedzi (zostaje „nie wiem”)');
  assert.ok(!JSON.stringify(M.BO.odpowiedzBiegu(LICZNIK, { podtemat: 'x', ust: ['1.1', '1.2'] })).includes(IMIE_ATRAPA), '§ 1 ust. 2 wycięty także obok innego ustępu');
  for (const [, q, o] of WARIANTY.filter((w) => w[2].startsWith('bieg:'))) {
    const r = await przebiegV2(M, q, LICZNIK, bezNadpisan);
    const s = JSON.stringify(r.body);
    assert.ok(!s.includes(IMIE_ATRAPA) && !s.includes(LINK_ATRAPA), 'v2: imię dziecka albo link zbiórki w odpowiedzi na „' + q + '”');
  }
});

test('bez licznika, bez pola bieg albo bez linku zbiórki: „Nie wiem tego na pewno.” + link do strony biegu, bez sieci i modelu', async () => {
  const M = await moduly();
  const warianty = { 'błąd RPC': null, 'bez pola bieg': { ...LICZNIK, bieg: null }, 'bez linku zbiórki': { ...LICZNIK, url_zbiorki: '' }, 'link http': { ...LICZNIK, url_zbiorki: 'http://zrzutka.pl/x' },
    'nieznana wersja regulaminu': { ...LICZNIK, bieg: { ...BIEG, regulamin_wersja: '2026-11-v99' } } };
  for (const [nazwa, licznik] of Object.entries(warianty)) {
    assert.equal(M.BO.odpowiedzBiegu(licznik, { podtemat: 'ukonczenie', ust: ['5.1'] }), null, nazwa);
    const r = await przebiegV2(M, 'Czy trening bez czasu zalicza bieg?', licznik, bezNadpisan);
    assert.equal(r.slad, 'router:bieg', nazwa);
    assert.deepEqual(r.body.zdania, [M.R.ODP_NIE_WIEM], nazwa);
    assert.equal(r.body.karty[0].dane.cel, 'bieg.html', nazwa);
    assert.equal(r.sieci + r.modele, 0, nazwa);
  }
});

test('strażnik BiegaMy: akcja bez trafienia → „nie wiem” + strona akcji bez modelu; reszta o BiegaMy → zamiast sieci „nie wiem” + O nas', async () => {
  const M = await moduly();
  // v1 nie ma klasyfikatora: akcja bez trafienia w routerze → od razu „nie wiem” + strona akcji, bez modelu i sieci
  // v2: klasyfikator, który rozpozna akcję, odpowiada jak dotąd zdaniem akcji (red team 3.11); awaria klasyfikatora → zamiast modelu v1 „nie wiem” + strona akcji;
  // klasyfikator kierujący do wiedzy z sieci → zamiast sieci „nie wiem” + strona akcji
  const klasyfikator = (wynik) => (sieci, modele) => ({ rozumienie: async () => { if (wynik === 'awaria') throw new Error('rozumienie: atrapa awarii'); return { intencja: wynik, pewnosc: 0.95, dopytac: false, kandydaci: [], sloty: {}, tok: { we: 1, wy: 1 } }; } });
  for (const q of ['dziecko z akcji', 'czy moje kilometry liczom sie do akcji pomocowej?']) {
    assert.equal(M.R.dopasuj(q, DZIS), null, 'router: ' + q);
    assert.equal(M.R.rodzajBiegaMy(q), 'akcja', q);
    assert.equal(trasaV1(M, q).trasa, 'nie-wiem', 'v1: ' + q);
    for (const wynik of ['awaria', M.INTENCJE_SIECI[0]]) {
      const r = await przebiegV2(M, q, LICZNIK, klasyfikator(wynik));
      assert.match(r.slad, /^(router|v2):nie-wiem$/, `v2 (${wynik}): ${q}`);   // v2:nie-wiem = zamiast sieci; router:nie-wiem = zamiast modelu v1 (też gdy strażnik prywatności blokuje sieć)
      assert.deepEqual(r.body.zdania, [M.R.ODP_NIE_WIEM], `v2 (${wynik}): ${q}`);
      assert.equal(r.body.karty[0].dane.cel, 'dla-fabianka.html', `v2 (${wynik}): ${q}`);
      assert.equal(r.sieci + r.modele, 0, `v2 (${wynik}) bez sieci i modelu v1: ${q}`);
    }
    const a = await przebiegV2(M, q, LICZNIK, klasyfikator('akcja'));
    assert.equal(a.sieci, 0, 'v2 (akcja): ' + q);
    assert.equal(a.body.zdania[0], M.AK.PO_STARCIE, 'v2: klasyfikator „akcja” → zdanie akcji jak dotąd: ' + q);
  }
  // pytanie o BiegaMy, które klasyfikator v2 kieruje do wiedzy z sieci — zamiast sieci „nie wiem” + O nas
  const zSiecia = (sieci, modele) => ({ rozumienie: async () => { modele.push('r'); return { intencja: M.INTENCJE_SIECI[0], pewnosc: 0.95, dopytac: false, kandydaci: [], sloty: {}, tok: { we: 1, wy: 1 } }; } });
  for (const q of ['Czy BiegaMy jest darmowe?', 'jak usunac konto w biegamy', 'Kontakt z BiegaMy']) {
    assert.equal(M.R.rodzajBiegaMy(q), 'biegamy');
    const r = await przebiegV2(M, q, LICZNIK, zSiecia);
    assert.equal(r.sieci, 0, 'bez sieci: ' + q);
    if (q === 'Kontakt z BiegaMy') continue;   // dwa słowa z wielkiej litery = strażnik prywatności (wygladaNaOsobe): sieci i tak nie ma, idzie model
    assert.deepEqual(r.body.zdania, [M.R.ODP_NIE_WIEM], q);
    assert.equal(r.body.karty[0].dane.cel, 'o-nas.html', q);
  }
  // obca impreza z naszą nazwą w tytule i miejscowością — bez strażnika, jak dotąd
  assert.equal(M.R.rodzajBiegaMy('Bieg mikołajkowy w Krakowie'), null);
  assert.equal(M.R.tematBiegu('Biegi w Mikołajkach'), null);
  // kolejność w EF v1: o nas → strażnik → osoba; impreza, pamięć sieci i sieć wyłączone dla pytań o BiegaMy
  const v1 = czytaj('supabase/functions/okienko/index.ts');
  const iOn = v1.indexOf('const on = oNas(tekst)'), iBm = v1.indexOf('const oBiegaMy = rodzajBiegaMy(tekst)'), iOs = v1.indexOf('const os = osobaZPytania(tekst)');
  assert.ok(iOn > 0 && iBm > iOn && iOs > iBm, 'v1: o nas → strażnik BiegaMy → osoba');
  assert.match(v1, /if \(!GEMINI \|\| oBiegaMy\) return false;/, 'v1: sieciDozwolona bez sieci dla BiegaMy');
  assert.match(v1, /if \(imp && !oBiegaMy\) \{/, 'v1: tryb imprezy pominięty dla BiegaMy');
  assert.match(v1, /if \(pam && pam\.zrodla\.length && !oBiegaMy\) \{/, 'v1: pamięć sieci pominięta dla BiegaMy');
  const iPoModelu = v1.indexOf('if (oBiegaMy) {'), iSiec = v1.indexOf('try { w = await zapytajSiec(');
  assert.ok(iPoModelu > v1.indexOf('m = await zapytajModel(') && iPoModelu < iSiec, 'v1: strażnik po modelu, przed siecią');
  assert.ok(v1.slice(iPoModelu, iSiec).includes('zdania: [ODP_NIE_WIEM], karty: [kartaStrony("biegamy")]'), 'v1: po modelu zamiast sieci „nie wiem” + O nas');
  assert.match(v1, /if \(traf\.log === "bieg"\) \{ const ob = odpowiedzBiegu\(akcjaDane,/, 'v1: bieg z licznika przez bieg-odp.mjs');
});

test('jedno źródło: w kodzie Okienka (v1 i v2) nie ma zdań regulaminu — tylko js/bieg.mjs', async () => {
  const M = await moduly();
  const { u } = regulamin(M.B, LICZNIK);
  const pliki = [];
  const zbierz = (d) => { for (const e of fs.readdirSync(path.join(KORZEN, d), { withFileTypes: true })) { const p = d + '/' + e.name; if (e.isDirectory()) zbierz(p); else if (/\.(mjs|ts|js)$/.test(e.name)) pliki.push(p); } };
  zbierz('supabase/functions/okienko'); zbierz('supabase/functions/okienko-v2');
  assert.ok(pliki.length >= 20, 'pliki Okienka: ' + pliki.length);
  const fragmenty = Object.values(u).filter((t) => t.length >= 40).map((t) => t.slice(0, 40));
  assert.ok(fragmenty.length >= 20, 'ustępy regulaminu: ' + fragmenty.length);
  for (const p of pliki) { const s = czytaj(p).replace(/\s+/g, ' '); for (const f of fragmenty) assert.ok(!s.includes(f), `${p}: zdanie regulaminu „${f}…”`); }
  assert.match(czytaj('supabase/functions/okienko/bieg-odp.mjs'), /B\.regulaminBloki\(w\)/);
  assert.match(czytaj('supabase/functions/okienko/bieg-odp.mjs'), /B\.wartosciTekstow\(bieg, licznik,/);
  assert.match(czytaj('supabase/functions/okienko/bieg-odp.mjs'), /^import "\.\.\/\.\.\/\.\.\/js\/bieg\.mjs";$/m);
});

test('front: bezpiecznyCel przepuszcza bieg.html, dla-fabianka.html i o-nas.html (i nic podobnego); karta pokazuje „Otwórz stronę biegu ›”', async () => {
  const M = await moduly();
  const ctx = zaladujSb(); ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  vm.runInContext(czytaj('js/okienko.js'), ctx, { filename: 'js/okienko.js' });
  const O = ctx.OKIENKO;
  for (const c of ['bieg.html', 'dla-fabianka.html', 'o-nas.html']) assert.equal(O.bezpiecznyCel(c), c);
  for (const c of ['bieg.html?x=1', 'bieg.html#a', 'https://zly.pl/bieg.html', '/bieg.html', 'javascript:alert(1)', 'o-nas.html"onclick', 'dla-fabianka.html?proba=1']) assert.equal(O.bezpiecznyCel(c), null, c);
  for (const [rodzaj, cel, napis] of [['bieg', 'bieg.html', 'Otwórz stronę biegu ›'], ['akcja', 'dla-fabianka.html', 'Otwórz stronę akcji ›'], ['biegamy', 'o-nas.html', 'Otwórz stronę O nas ›']]) {
    const h = O.htmlOdpowiedzi(200, { tryb: 'router', zdania: [M.R.ODP_NIE_WIEM], karty: [M.R.kartaStrony(rodzaj)] });
    assert.ok(h.includes('data-cel="' + cel + '">' + napis.replace('›', '') ) || h.includes('data-cel="' + cel + '"'), rodzaj + ': przycisk do ' + cel);
    assert.ok(h.includes(napis), rodzaj + ': ' + napis);
  }
});
