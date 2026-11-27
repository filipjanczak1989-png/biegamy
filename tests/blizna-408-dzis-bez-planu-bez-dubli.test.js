// Blizna #408 (27.11.2026, P1a) — nowe Dziś, kafel „Trening na dziś” w stanie „Dziś bez planu”: dwa razy to samo.
//
// Zrzut Filipa z komputera (27.11), konto z trenerem, dziś bez planu:
//   1. „Napisz do trenera” dwa razy: duży przycisk kafla (blizna-388) i cichy link w dolnym rzędzie, odbity ze starej karty bólu
//      (#today-bol-czat, blizna-365). Teraz dolny rząd zostawia samo „Coś boli”, gdy kafel ma już duży przycisk.
//   2. Pod etykietą TRENING NA DZIŚ szara linia „bez planu”, a pod nią nagłówek DZIŚ BEZ PLANU. Linia znika w każdym stanie
//      z tym nagłówkiem (z trenerem, bez trenera z „Ułóż plan”, reguła jeszcze nie wiadoma). Pogoda zostaje. „Dziś wolne” (plan z generatora
//      bez treningu na dziś) zostawia swoje „z generatora”, bo tam nagłówek mówi co innego.
// Wariant bez trenera: dubla „Napisz do trenera” nie było (stara karta bez trenera nie ma #today-bol-czat), był tylko dubel „bez planu”.
// Zasada sprawdzana wprost: w kaflu (z dolnym rzędem) „Napisz do trenera” jest najwyżej raz, w każdym stanie.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, PROFIL, MODUL } = require('./_dzis-nowy-strona.js');

const BEZ_TRENERA = Object.assign({}, PROFIL, { coach_id: null });
/** Stara karta bólu: pudełko i przyciski o stałych id; „Napisz do trenera” tylko u konta z trenerem (jak _odswiezBol w starym kodzie). */
function zKartaBolu(o, czat) {
  const s = strona(o), klik = [];
  s.el['today-bol'] = { innerHTML: '<button id="today-bol-btn">Coś boli</button>' };
  s.el['today-bol-btn'] = { click() { klik.push('today-bol-btn'); } };
  if (czat) s.el['today-bol-czat'] = { click() { klik.push('today-bol-czat'); } };
  s.w._aktywnaKontuzja = null;
  s.klik = klik;
  return s;
}
const caly = (s) => s.kafel('trening').innerHTML + s.cz('dzialania').innerHTML;
const ile = (h, t) => h.split(t).length - 1;
const ciche = (s) => [...s.cz('dzialania').innerHTML.matchAll(/data-stary="([a-z-]+)">([^<]+)</g)].map((m) => m[1] + ' ' + m[2]);

test('(1) z trenerem, dziś bez planu: duży „Napisz do trenera” raz, dolny rząd tylko „Coś boli”, bez linii „bez planu”', async () => {
  const s = zKartaBolu({ trening: [], wiadomosc: [] }, true); s.B.start(); await s.doKonca();
  const h = s.kafel('trening').innerHTML;
  assert.match(h, /<h2 class="dn-etykieta">Trening na dziś<\/h2><\/div><a class="dn-link"[^>]*>Plan ›<\/a><\/div>.*<h3 class="dn-tytul">Dziś bez planu<\/h3><p class="dn-tekst">Trener jeszcze nie wysłał planu na dziś\.<\/p><button type="button" class="dn-glowny" data-dn="napisz">Napisz do trenera<\/button>/);
  assert.doesNotMatch(h, /dn-kto/, 'pod etykietą nie ma już linii „bez planu”');
  assert.deepEqual(ciche(s), ['today-bol-btn Coś boli'], 'dolny rząd: samo „Coś boli”');
  assert.equal(ile(caly(s), 'Napisz do trenera'), 1);
  s.dotknij('napisz'); assert.deepEqual(s.stare, ['showSection msgs'], 'duży przycisk dalej prowadzi do wątku trenera');
});

test('(2) z trenerem i z planem na dziś: dolny rząd bez zmian, „Coś boli” i „Napisz do trenera” (jedyny w kaflu)', async () => {
  const s = zKartaBolu({}, true); s.B.start(); await s.doKonca();
  assert.deepEqual(ciche(s), ['today-bol-btn Coś boli', 'today-bol-czat Napisz do trenera']);
  assert.equal(ile(caly(s), 'Napisz do trenera'), 1);
  assert.match(s.kafel('trening').innerHTML, /<div class="dn-kto">od trenera<\/div>/, 'źródło planu przy planie zostaje');
});

test('(3) bez trenera, dziś bez planu: „Ułóż plan”, bez linii „bez planu”, dolny rząd „Coś boli”', async () => {
  const s = zKartaBolu({ profil: BEZ_TRENERA, trening: [] }, false); s.B.start(); await s.doKonca();
  const h = s.kafel('trening').innerHTML;
  assert.match(h, /<h3 class="dn-tytul">Dziś bez planu<\/h3><p class="dn-tekst">Nie masz planu\? Ułóż go w minutę\.<\/p><button type="button" class="dn-glowny" data-dn="generator">Ułóż plan<\/button>/);
  assert.doesNotMatch(h, /dn-kto/);
  assert.deepEqual(ciche(s), ['today-bol-btn Coś boli']);
  assert.equal(ile(caly(s), 'Napisz do trenera'), 0);
});

test('(4) reguła planu niewczytana (stan nieznany): neutralne „Dziś bez planu” bez dużego przycisku, więc cichy „Napisz do trenera” zostaje (jedyny)', async () => {
  const s = zKartaBolu({ trening: [], wiadomosc: [], bezReguly: true }, true); s.B.start(); await s.doKonca();
  const h = s.kafel('trening').innerHTML;
  assert.match(h, /<h3 class="dn-tytul">Dziś bez planu<\/h3><p class="dn-tekst">Każdy kilometr i tak się liczy\.<\/p>/);
  assert.doesNotMatch(h, /dn-kto|data-dn="napisz"/);
  assert.deepEqual(ciche(s), ['today-bol-btn Coś boli', 'today-bol-czat Napisz do trenera'], 'bez dużego przycisku jedyna droga do trenera zostaje');
  assert.equal(ile(caly(s), 'Napisz do trenera'), 1);
});

test('(5) „Dziś wolne” (plan z generatora, dziś bez treningu) zostawia „z generatora”; pogoda w każdym stanie bez planu zostaje', async () => {
  const B = strona().B;
  assert.match(B.treningHtml([], 'dziś 3–8 °C, deszcz', 'wolne'), /<div class="dn-kto">z generatora<\/div>.*<h3 class="dn-tytul">Dziś wolne<\/h3>/);
  for (const stan of ['trener', 'generator', null]) {
    const h = B.treningHtml([], 'dziś 3–8 °C, deszcz', stan);
    assert.match(h, /<p class="dn-pog"><span>dziś 3–8 °C,<\/span> <span>deszcz<\/span><\/p><h3 class="dn-tytul">Dziś bez planu<\/h3>/, 'pogoda zostaje: ' + stan);
    assert.doesNotMatch(h, /dn-kto|>bez planu</, 'bez linii „bez planu”: ' + stan);
  }
});

test('(6) aktywne zgłoszenie bólu: ramka jak dotąd, bez cichych linków, niezależnie od stanu bez planu', async () => {
  const s = zKartaBolu({ trening: [], wiadomosc: [] }, true);
  s.el['today-bol-koniec'] = { click() {} };
  s.w._aktywnaKontuzja = { id: 'i-1', poziom: 2, miejsce: 'kolano', created_at: new Date(Date.now() - 864e5).toISOString() };
  s.B.start(); await s.doKonca();
  assert.match(s.cz('dzialania').innerHTML, /data-stary="today-bol-koniec">Już nie boli</);
  assert.deepEqual(ciche(s).filter((x) => !/koniec/.test(x)), []);
});

test('(7) źródło: decyzja o cichym „Napisz do trenera” bierze ten sam stan co duży przycisk (stanBezPlanu() === "trener"), nie osobną kopię', () => {
  assert.match(MODUL, /function bolHtml\(teraz, bezCzatu\) \{/);
  assert.match(MODUL, /cichy\("today-bol-btn", "Coś boli"\) \+ \(bezCzatu \? "" : cichy\("today-bol-czat", "Napisz do trenera"\)\)/);
  assert.match(MODUL, /var b = bolHtml\(undefined, !!dane\.trening && !dane\.trening\.length && stanBezPlanu\(\) === "trener"\)/);
  assert.match(MODUL, /if \(stan === "trener"\) return '<h3 class="dn-tytul">Dziś bez planu<\/h3><p class="dn-tekst">Trener jeszcze nie wysłał planu na dziś\.<\/p><button type="button" class="dn-glowny" data-dn="napisz">/);
  assert.doesNotMatch(MODUL, /"Trening na dziś", stan === "wolne" \? "z generatora" : "bez planu"/);
});
