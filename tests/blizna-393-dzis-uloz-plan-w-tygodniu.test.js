// Blizna #393 (26.11.2026) — nowe Dziś: pusty kafel „Ten tydzień” mówił wszystkim to samo.
//
// „W tym tygodniu jeszcze bez treningu.” i „Słupki pojawią się po pierwszym treningu.” widziało i konto z trenerem,
// i konto bez trenera. Dla konta bez trenera pusty tydzień (a zwłaszcza pierwszy tydzień konta) to najlepszy moment,
// żeby zaproponować generator planów. Decyzja Filipa 26.11: link „Ułóż plan ›” w pustym kaflu tygodnia i w pierwszym
// tygodniu konta, TYLKO dla konta bez trenera i bez planu z generatora, tą samą regułą z js/plan-pusty.mjs,
// która steruje kaflem treningu (blizna-388). Konto z trenerem nigdy go nie widzi.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, wpis, PROFIL, MODUL } = require('./_dzis-nowy-strona.js');

const BEZ_TRENERA = Object.assign({}, PROFIL, { coach_id: null });
const plan = (id, date, type, zrodlo, km) => ({ id, date, type, distance_km: km === undefined ? 8 : km, duration_min: null, pace: null, description: 'opis ' + id, status: 'planned', plan_source: zrodlo || null, coach_id: zrodlo === 'coach' ? 'c-9' : null });
const log = (iso, typ, km, czas) => ({ logged_at: iso, training_type: typ, distance_km: km, duration: czas });
const STARY = [wpis('dawny', 30 * 24, { feel: 'good' })];
const LINK = '<button type="button" class="dn-wlink" data-dn="generator">Ułóż plan ›</button>';
const kafel = async (o) => { const s = strona(o); s.B.start(); await s.doKonca(); return s; };

test('(1) konto bez trenera, pusty tydzień bez planu: pod zdaniem link „Ułóż plan ›”, który otwiera stare okno generatora', async () => {
  const s = await kafel({ profil: BEZ_TRENERA, trening: [], wpisy: STARY, wpisyTyg: [] }), h = s.kafel('tydzien').innerHTML;
  assert.ok(h.endsWith('<p class="dn-tekst dn-tl">W tym tygodniu jeszcze bez treningu.</p>' + LINK), h.slice(-160));
  s.dotknij('generator'); assert.deepEqual(s.stare, ['openGenModal'], 'ta sama droga co „Ułóż plan” w kaflu treningu i w starym Dziś');
  assert.match(MODUL, /#dzis-nowy \.dn-wlink\{display:inline-flex;align-items:center;min-height:44px;[^}]*color:#ff7a45;/, 'link pomarańczowy (to akcja), cel dotyku 44 px');
});

test('(2) pierwszy tydzień konta bez trenera: zdanie z makiety i ten sam link', async () => {
  const s = await kafel({ profil: BEZ_TRENERA, trening: [], wpisy: [], wpisyTyg: [] }), h = s.kafel('tydzien').innerHTML;
  assert.ok(h.endsWith('<p class="dn-tekst dn-tl">Słupki pojawią się po pierwszym treningu.</p>' + LINK), h.slice(-160));
  assert.doesNotMatch(h, /dn-liczby/);
});

test('(3) konto z trenerem nigdy nie widzi linku: ani w pustym tygodniu, ani w pierwszym tygodniu konta', async () => {
  for (const [opis, o] of [['pusty tydzień', { trening: [], wpisy: STARY, wpisyTyg: [], wiadomosc: [] }], ['pierwszy tydzień', { trening: [], wpisy: [], wpisyTyg: [], wiadomosc: [] }]]) {
    const s = await kafel(o);
    assert.match(s.kafel('tydzien').innerHTML, /jeszcze bez treningu|po pierwszym treningu/, opis);
    assert.doesNotMatch(s.kafel('tydzien').innerHTML, /Ułóż plan|data-dn="generator"/, opis + ': konto z trenerem nie ma generatora');
  }
  const flaga = strona({ trening: [], wpisy: STARY, wpisyTyg: [], wiadomosc: [] }); flaga.w._maPlanGeneratora = false; flaga.B.start(); await flaga.doKonca();
  assert.doesNotMatch(flaga.kafel('tydzien').innerHTML, /Ułóż plan/);
});

test('(4) bez linku, gdy konto ma plan z generatora albo jakikolwiek plan w tym tygodniu, i gdy tydzień nie jest pusty', async () => {
  const flaga = strona({ profil: BEZ_TRENERA, trening: [], wpisy: STARY, wpisyTyg: [] }); flaga.w._maPlanGeneratora = true; flaga.B.start(); await flaga.doKonca();
  assert.match(flaga.kafel('tydzien').innerHTML, /jeszcze bez treningu/); assert.doesNotMatch(flaga.kafel('tydzien').innerHTML, /Ułóż plan/, 'plan z generatora od przyszłego tygodnia (stara flaga)');
  const sila = await kafel({ profil: BEZ_TRENERA, trening: [plan('s', '2026-11-28', 'Siła', 'generator', null)], wpisy: STARY, wpisyTyg: [] });
  assert.match(sila.kafel('tydzien').innerHTML, /jeszcze bez treningu/); assert.doesNotMatch(sila.kafel('tydzien').innerHTML, /Ułóż plan/, 'plan z generatora (sama siła) później w tygodniu');
  const wlasny = await kafel({ profil: BEZ_TRENERA, trening: [plan('w', '2026-11-28', 'Siła', null, null)], wpisy: STARY, wpisyTyg: [] });
  assert.doesNotMatch(wlasny.kafel('tydzien').innerHTML, /Ułóż plan/, 'własny plan w tym tygodniu: tydzień nie jest „bez planu”');
  const zKm = await kafel({ profil: BEZ_TRENERA, trening: [plan('k', '2026-11-28', 'Spokojny', null, 8)], wpisy: STARY, wpisyTyg: [] });
  assert.doesNotMatch(zKm.kafel('tydzien').innerHTML, /Ułóż plan|jeszcze bez treningu/, 'plan z kilometrami: słupki planu, bez pustego stanu');
  const zBiegiem = await kafel({ profil: BEZ_TRENERA, trening: [], wpisy: STARY, wpisyTyg: [log('2026-11-25T17:00:00+00:00', 'Spokojny', 6, '34:00')] });
  assert.doesNotMatch(zBiegiem.kafel('tydzien').innerHTML, /Ułóż plan/, 'tydzień z biegiem: zwykłe słupki; zachęta jest w kaflu treningu');
});

test('(5) gdy nie wiadomo, nie obiecujemy: bez reguły i bez okna generatora link się nie pojawia; reguła dochodzi później → kafel tygodnia poprawia się razem z kaflem treningu', async () => {
  const bezOkna = await kafel({ profil: BEZ_TRENERA, trening: [], wpisy: STARY, wpisyTyg: [], bezGeneratora: true });
  assert.doesNotMatch(bezOkna.kafel('tydzien').innerHTML, /Ułóż plan/);
  const s = await kafel({ profil: BEZ_TRENERA, trening: [], wpisy: STARY, wpisyTyg: [], bezReguly: true });
  assert.match(s.kafel('tydzien').innerHTML, /jeszcze bez treningu/); assert.doesNotMatch(s.kafel('tydzien').innerHTML, /Ułóż plan/);
  s.w._planPusty = { stanPlanu: strona().w._planPusty.stanPlanu };
  s.czasomierze.filter((c) => c.zywy && c.ms === 500)[0].f();
  assert.ok(s.kafel('tydzien').innerHTML.endsWith(LINK), 'reguła doszła: link w kaflu tygodnia'); assert.match(s.kafel('trening').innerHTML, /Ułóż plan/);
  // bez sieci, z telefonu: profil mówi „bez trenera”, więc link też jest (okno generatora samo poradzi sobie z brakiem sieci)
  const a = await kafel({ profil: BEZ_TRENERA, trening: [], wpisy: STARY, wpisyTyg: [] });
  const bez = strona({ pamiec: new Map(a.tel.mapa), online: false, awaria: { '*': 'siec' }, teraz: a.st.zegar + 3600e3 }); bez.B.start(); await bez.doKonca();
  assert.ok(bez.kafel('tydzien').innerHTML.endsWith(LINK));
});

test('(6) jedna reguła dla obu miejsc: kafel tygodnia pyta tę samą funkcję co kafel treningu', () => {
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(kod, /function generatorWTygodniu\(\) \{ return stanPlanuDla\(true\) === "generator" && typeof w\.openGenModal === "function"; \}/);
  assert.match(kod, /\(generator && !t\.zaplanowane \? '<button type="button" class="dn-wlink" data-dn="generator">Ułóż plan ›<\/button>' : ""\)/, 'tylko w pustym stanie i tylko gdy w tygodniu nie ma żadnego planu');
  assert.equal((kod.match(/R\.stanPlanu\(/g) || []).length, 1, 'reguła wołana w jednym miejscu modułu');
  assert.equal(strona().B.tydzienHtml.length, 4);
});
