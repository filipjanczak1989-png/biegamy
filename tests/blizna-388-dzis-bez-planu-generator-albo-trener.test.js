// Blizna #388 (26.11.2026) — nowe Dziś: „Dziś bez planu” wyglądało tak samo dla konta z trenerem i bez.
//
// Konto BEZ trenera ma generator planów, konto Z trenerem nie. Nowe Dziś w obu przypadkach pokazywało „Dziś bez planu.
// Każdy kilometr i tak się liczy.” i „Dodaj trening”. Stare Dziś rozróżnia to od dawna: bez trenera kafel „Nie masz
// planu? Ułóż go w minutę.” z przyciskiem „Ułóż plan” (openGenModal), z trenerem nigdy generatora.
// Decyzja Filipa 26.11: bez trenera główny przycisk „Ułóż plan”; z trenerem „Trener jeszcze nie wysłał planu na dziś”
// i „Napisz do trenera”; „Dodaj trening” zostaje w obu jako drugi, cichy przycisk.
// O stanie decyduje TA SAMA reguła co w starym Dziś i w Okienku (js/plan-pusty.mjs, stanPlanu); atrapa ładuje prawdziwy
// plik. Moduł jej nie przepisuje: druga kopia rozjechałaby się przy pierwszej zmianie.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, PROFIL, MODUL, czytaj } = require('./_dzis-nowy-strona.js');

const BEZ_TRENERA = Object.assign({}, PROFIL, { coach_id: null });
const plan = (id, date, type, zrodlo) => ({ id, date, type, distance_km: 8, duration_min: null, pace: null, description: 'opis ' + id, status: 'planned', plan_source: zrodlo || null, coach_id: zrodlo === 'coach' ? 'c-9' : null });
const kafel = async (o) => { const s = strona(o); s.B.start(); await s.doKonca(); return s; };
const przyciski = (h) => [...h.matchAll(/<button type="button" class="([^"]*)" data-dn="([a-z-]+)">([^<]*)<\/button>/g)].map((m) => [m[3], m[2], m[1]]);

test('(1) bez trenera i bez planu: główny „Ułóż plan” otwiera stare okno generatora; „Dodaj trening” jako drugi, cichy', async () => {
  const s = await kafel({ profil: BEZ_TRENERA, trening: [] }), h = s.kafel('trening').innerHTML;
  assert.doesNotMatch(h, /class="dn-kto"/, 'linia „bez planu” pod etykietą powtarzała nagłówek „Dziś bez planu” (P1a, blizna-408)');
  assert.match(h, /<h3 class="dn-tytul">Dziś bez planu<\/h3><p class="dn-tekst">Nie masz planu\? Ułóż go w minutę\.<\/p>/, 'to samo zdanie co w starym Dziś');
  assert.deepEqual(przyciski(h), [['Ułóż plan', 'generator', 'dn-glowny'], ['Dodaj trening', 'zaloguj', 'dn-cichy dn-pod']]);
  assert.doesNotMatch(h, /Napisz do trenera|Trener jeszcze/);
  s.dotknij('generator'); assert.deepEqual(s.stare, ['openGenModal'], 'ta sama droga co przycisk w starym Dziś');
  s.dotknij('zaloguj'); assert.deepEqual(s.stare, ['openGenModal', 'openModal'], '„Dodaj trening” dalej otwiera formularz wyniku');
  assert.equal(s.zapytania.filter((z) => z.nazwa === 'messages').length, 0, 'bez nowych zapytań');
});

test('(2) z trenerem i bez planu: „Trener jeszcze nie wysłał planu na dziś” i „Napisz do trenera”; NIGDY generator', async () => {
  const s = await kafel({ trening: [], wiadomosc: [] }), h = s.kafel('trening').innerHTML;
  assert.match(h, /<h3 class="dn-tytul">Dziś bez planu<\/h3><p class="dn-tekst">Trener jeszcze nie wysłał planu na dziś\.<\/p>/);
  assert.deepEqual(przyciski(h), [['Napisz do trenera', 'napisz', 'dn-glowny'], ['Dodaj trening', 'zaloguj', 'dn-cichy dn-pod']]);
  assert.doesNotMatch(h, /Ułóż plan|data-dn="generator"/, 'konto z trenerem nie ma generatora, choć stare okno istnieje na stronie');
  s.dotknij('napisz');
  assert.deepEqual(s.stare, ['showSection msgs'], 'sekcja wiadomości…');
  s.czasomierze.filter((c) => c.zywy && c.ms === 400).forEach((c) => c.f());
  assert.deepEqual(s.stare, ['showSection msgs', 'openChatThread coach,,'], '…potem wątek trenera, jak „Napisz do trenera” w starej karcie');
  // z trenerem także wtedy, gdy stare flagi mówią o planie z generatora (np. z czasu przed trenerem)
  const g = strona({ trening: [], wiadomosc: [] }); g.w._maPlanGeneratora = true; g.B.start(); await g.doKonca();
  assert.match(g.kafel('trening').innerHTML, /Napisz do trenera/); assert.doesNotMatch(g.kafel('trening').innerHTML, /Ułóż plan|Dziś wolne/);
});

test('(3) bez trenera z planem z generatora, w którym dziś nic nie ma: „Dziś wolne”, bez namawiania do nowego planu', async () => {
  const pozniej = await kafel({ profil: BEZ_TRENERA, trening: [plan('g', '2026-11-28', 'Spokojny', 'generator')] });
  assert.match(pozniej.kafel('trening').innerHTML, /<div class="dn-kto">z generatora<\/div>.*<h3 class="dn-tytul">Dziś wolne<\/h3><p class="dn-tekst">W Twoim planie nie ma dziś treningu\.<\/p>/);
  assert.deepEqual(przyciski(pozniej.kafel('trening').innerHTML), [['Dodaj trening', 'zaloguj', 'dn-drugi']]);
  // plan z generatora zaczyna się dopiero w przyszłym tygodniu: wiemy to tylko ze starej flagi (stary kod pyta o treningi od dziś)
  const flaga = strona({ profil: BEZ_TRENERA, trening: [] }); flaga.w._maPlanGeneratora = true; flaga.B.start(); await flaga.doKonca();
  assert.match(flaga.kafel('trening').innerHTML, /Dziś wolne/); assert.doesNotMatch(flaga.kafel('trening').innerHTML, /Ułóż plan/);
  // plan z generatora był, ale tylko wcześniej w tym tygodniu: od dziś nic nie ma, więc generator wraca
  const wczesniej = await kafel({ profil: BEZ_TRENERA, trening: [plan('g', '2026-11-24', 'Spokojny', 'generator')] });
  assert.match(wczesniej.kafel('trening').innerHTML, /Ułóż plan/);
  // własny (ręczny) plan na później nie jest planem z generatora
  const wlasny = await kafel({ profil: BEZ_TRENERA, trening: [plan('w', '2026-11-28', 'Spokojny', null)] });
  assert.match(wlasny.kafel('trening').innerHTML, /Ułóż plan/);
});

test('(4) jest trening na dziś: kafel bez zmian, żadnego z nowych stanów', async () => {
  const s = await kafel({ profil: BEZ_TRENERA, trening: [plan('t', '2026-11-26', 'Tempo', 'generator')] });
  assert.match(s.kafel('trening').innerHTML, /opis t/); assert.doesNotMatch(s.kafel('trening').innerHTML, /Ułóż plan|Napisz do trenera|Dziś bez planu|Dziś wolne/);
  assert.deepEqual(przyciski(s.kafel('trening').innerHTML), [['Zaloguj wynik', 'zaloguj', 'dn-glowny']]);
});

test('(5) gdy nie wiadomo, nic nie obiecujemy: reguła jeszcze się nie wczytała albo strona nie ma okna generatora', async () => {
  const NEUTRALNY = /<h3 class="dn-tytul">Dziś bez planu<\/h3><p class="dn-tekst">Każdy kilometr i tak się liczy\.<\/p><button type="button" class="dn-drugi" data-dn="zaloguj">Dodaj trening<\/button>/;
  const s = await kafel({ profil: BEZ_TRENERA, trening: [], bezReguly: true });
  assert.match(s.kafel('trening').innerHTML, NEUTRALNY, 'bez reguły: stan sprzed zmiany');
  const czeka = s.czasomierze.filter((c) => c.zywy && c.ms === 500);
  assert.equal(czeka.length, 1, 'moduł zagląda ponownie za pół sekundy, jednym czasomierzem');
  s.B.wczytaj(true); await s.doKonca(); s.B.wczytaj(true); await s.doKonca();
  assert.equal(s.czasomierze.filter((c) => c.zywy && c.ms === 500).length, 1, 'kolejne narysowania kafla nie dokładają czasomierzy');
  s.w._planPusty = { stanPlanu: strona().w._planPusty.stanPlanu };   // stary kod skończył swój import
  czeka[0].f();
  assert.match(s.kafel('trening').innerHTML, /Ułóż plan/, 'reguła doszła: kafel się poprawia sam');
  assert.equal(s.czasomierze.filter((c) => c.ms === 500).length, 1, 'po wczytaniu reguły koniec zaglądania');
  // reguła nie dochodzi nigdy: 20 prób i koniec, kafel zostaje neutralny
  const nigdy = await kafel({ profil: BEZ_TRENERA, trening: [], bezReguly: true });
  for (let i = 0; i < 40; i++) { const c = nigdy.czasomierze.filter((x) => x.zywy && x.ms === 500 && !x.byl)[0]; if (!c) break; c.byl = true; c.f(); }
  assert.equal(nigdy.czasomierze.filter((c) => c.ms === 500).length, 20, 'najwyżej 20 prób (10 s)'); assert.match(nigdy.kafel('trening').innerHTML, NEUTRALNY);
  const bezOkna = await kafel({ profil: BEZ_TRENERA, trening: [], bezGeneratora: true });
  assert.match(bezOkna.kafel('trening').innerHTML, NEUTRALNY, 'strona bez okna generatora: nie pokazujemy przycisku, który nic nie zrobi');
  const zepsuta = strona({ profil: BEZ_TRENERA, trening: [] }); zepsuta.w._planPusty = { stanPlanu() { throw new Error('x'); } }; zepsuta.B.start(); await zepsuta.doKonca();
  assert.match(zepsuta.kafel('trening').innerHTML, NEUTRALNY, 'wyjątek w regule nie zabiera kafla');
  // dzień z treningiem nie czeka na regułę
  const zTreningiem = await kafel({ bezReguly: true }); assert.equal(zTreningiem.czasomierze.filter((c) => c.ms === 500).length, 0);
});

test('(6) jedna reguła: moduł woła stanPlanu z js/plan-pusty.mjs i nie ma własnej kopii decyzji', () => {
  const regula = czytaj('js/plan-pusty.mjs');
  assert.match(regula, /export function stanPlanu\(\{ maTrenera, maPlanGeneratora, brakPlanu \}\)/);
  assert.match(regula, /if \(maTrenera\) return "trener";\s*if \(maPlanGeneratora\) return "wolne";\s*return "generator";/, 'gdy reguła zmieni kształt, ten test trzeba przeczytać razem z modułem');
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(kod, /return R\.stanPlanu\(\{ maTrenera: dane\.trener === true, maPlanGeneratora: gen, brakPlanu: brakPlanu \}\) \|\| null;/);
  assert.match(kod, /function stanBezPlanu\(\) \{ return dane\.trening \? stanPlanuDla\(!dane\.trening\.length\) : null; \}/, 'kafel treningu pyta regułę o dzisiejszy dzień (od blizna-393 ta sama funkcja służy też kaflowi tygodnia)');
  assert.doesNotMatch(kod, /dane\.trener \? "trener"|\? "generator" :|return "generator"/, 'moduł nie rozstrzyga sam, komu należy się generator');
  assert.doesNotMatch(kod, /\bimport\s*\(/, 'plik dalej bez import: regułę wystawia stary kod');
  assert.match(kod, /else if \(co === "generator"\) \{ if \(typeof w\.openGenModal === "function"\) w\.openGenModal\(\); \}/);
});
