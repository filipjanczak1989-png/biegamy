/* BLIZNA 75 (1.11.2026, M3 v2 / M3b): plan pusty → generator / „Napisz do trenera" / wolne.

   Ryzyka:
   1) DWIE KOPIE REGUŁY. CTA „Ułóż plan" na Dziś i karta plan_pusty w okienku mają brać decyzję z JEDNEGO pliku
      (js/plan-pusty.mjs). Test porównuje wynik CTA i EF dla trzech atrap profilu.
   2) GENERATOR U OSOBY Z TRENEREM. Nigdy — tam „Napisz do trenera", bez oceniania trenera.
   3) PLAN Z GENERATORA Z DNIEM WOLNYM. To nie „brak planu" — zdanie „Na … plan przewiduje wolne.", bez przycisku.
   4) „Nie wiadomo" (błąd odczytu trenera) → nic nie obiecujemy (NIE_MAM, CTA ukryte).
   5) Przyciski wołają istniejące funkcje po tapnięciu (openGenModal, czat z trenerem), przez data-*, bez onclick. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8');
const ZAW = czytaj('zawodnik.html');
const TERAZ = new Date('2026-11-01T10:00:00Z');

const PROFILE = {
  bez_trenera: { athletes: [{ id: JA, coach_id: null }], trainings: [] },
  z_trenerem: { athletes: [{ id: JA, coach_id: 'trener-1' }], trainings: [] },
  generator_wolne: { athletes: [{ id: JA, coach_id: null }], trainings: [{ id: 't1', athlete_id: JA, date: '2026-11-04', type: 'Spokojny', plan_source: 'generator', status: 'planned' }] },
};

/** CTA z zawodnik.html uruchomione naprawdę (wycięta funkcja + prawdziwy moduł), wejście jak po loadCoachMessage/loadToday. */
async function ctaZawodnika({ brakTrenera, brakTreninguDzis, maPlanGeneratora }) {
  const R = await zaladuj('js/plan-pusty.mjs');
  const src = ZAW.slice(ZAW.indexOf('function _odswiezCtaGeneratora() {'), ZAW.indexOf('window._odswiezCtaGeneratora = _odswiezCtaGeneratora;'));
  const el = { style: { display: 'none' } };
  const okno = { _brakTrenera: brakTrenera, _brakTreninguDzis: brakTreninguDzis, _maPlanGeneratora: maPlanGeneratora, _planPusty: R };
  const ctx = vm.createContext({ window: okno, document: { getElementById: (id) => (id === 'gen-cta' ? el : null) } });
  vm.runInContext(src + '; _odswiezCtaGeneratora();', ctx);
  return el.style.display === 'block';
}

test('reguła: trzy stany + „nie wiadomo" + jest plan', async () => {
  const R = await zaladuj('js/plan-pusty.mjs');
  assert.equal(R.stanPlanu({ maTrenera: false, maPlanGeneratora: false, brakPlanu: true }), 'generator');
  assert.equal(R.stanPlanu({ maTrenera: true, maPlanGeneratora: true, brakPlanu: true }), 'trener', 'trener wygrywa z planem z generatora');
  assert.equal(R.stanPlanu({ maTrenera: false, maPlanGeneratora: true, brakPlanu: true }), 'wolne');
  assert.equal(R.stanPlanu({ maTrenera: null, brakPlanu: true }), null);
  assert.equal(R.stanPlanu({ maTrenera: false, brakPlanu: null }), null);
  assert.equal(R.stanPlanu({ maTrenera: false, brakPlanu: false }), 'plan');
});

test('CTA na Dziś i karta EF dają ten sam wynik dla 3 profili (jedna reguła)', async () => {
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const oczek = { bez_trenera: 'generator', z_trenerem: 'trener', generator_wolne: 'wolne' };
  for (const [nazwa, baza] of Object.entries(PROFILE)) {
    const sb = atrapa(JSON.parse(JSON.stringify(baza)));
    const w = await N.wykonaj(sb, JA, 'moj_plan', { zakres: 'jutro' }, TERAZ);
    assert.equal(w.treningi.length, 0, nazwa);
    assert.equal(w.plan_pusty.stan, oczek[nazwa], nazwa);
    assert.ok(sb.zapytania.every((z) => z.zapis === false), `${nazwa}: zapis`);
    const cta = await ctaZawodnika({ brakTrenera: !baza.athletes[0].coach_id, brakTreninguDzis: true, maPlanGeneratora: baza.trainings.some((t) => t.plan_source === 'generator') });
    assert.equal(cta, w.plan_pusty.stan === 'generator', `${nazwa}: CTA ≠ EF`);
  }
  assert.equal(await ctaZawodnika({ brakTrenera: null, brakTreninguDzis: true }), false, 'nie wiadomo → CTA ukryte');
  assert.equal(await ctaZawodnika({ brakTrenera: true, brakTreninguDzis: false }), false, 'jest trening → CTA ukryte');
});

test('jedno źródło: zawodnik.html importuje js/plan-pusty.mjs, EF importuje ten sam plik; stara reguła inline zniknęła; SW precache', () => {
  assert.match(ZAW, /import\('\.\/js\/plan-pusty\.mjs'\)\.then\(function \(m\) \{ window\._planPusty = m; _odswiezCtaGeneratora\(\); \}\)/);
  assert.ok(!/window\._brakTrenera && window\._brakTreninguDzis\)/.test(ZAW), 'druga kopia reguły w zawodnik.html');
  assert.match(czytaj('supabase', 'functions', 'okienko', 'narzedzia.mjs'), /import \{ stanPlanu \} from "\.\.\/\.\.\/\.\.\/js\/plan-pusty\.mjs";/);
  const kat = path.join(KORZEN, 'supabase', 'functions');
  const kopie = [];
  for (const d of fs.readdirSync(kat)) {
    const p = path.join(kat, d);
    if (!fs.statSync(p).isDirectory()) continue;
    for (const f of fs.readdirSync(p)) if (/\.(m?js|ts)$/.test(f) && /function stanPlanu\b/.test(fs.readFileSync(path.join(p, f), 'utf8'))) kopie.push(d + '/' + f);
  }
  assert.deepEqual(kopie, [], 'kopia stanPlanu w EF');
  assert.match(czytaj('sw.js'), /'\/js\/plan-pusty\.mjs'/);
});

test('zdania i karty: generator → „Ułóż plan"; trener → „Napisz do trenera" (nigdy generator); wolne → bez przycisku; nie wiadomo → NIE_MAM', async () => {
  const { zWyniku, NIE_MAM } = await zaladuj('supabase/functions/okienko/odpowiedz.mjs');
  const pusto = (stan, args) => zWyniku('moj_plan', { od: '2026-11-02', do: '2026-11-02', treningi: [], plan_pusty: { stan } }, args);
  const g = pusto('generator', { zakres: 'jutro' });
  assert.deepEqual(g.zdania, ['Nie masz jeszcze planu na jutro. Mogę go ułożyć — trzy pytania.']);
  assert.deepEqual(g.karty, [{ typ: 'plan_pusty', dane: { stan: 'generator', zakres: 'jutro' } }]);
  const t = pusto('trener', { zakres: 'tydzien' });
  assert.deepEqual(t.zdania, ['Trener nie ułożył jeszcze planu na ten tydzień.']);
  assert.equal(t.karty[0].dane.stan, 'trener');
  assert.ok(!/powinien|musi|zapomni/.test(t.zdania[0]), 'bez oceniania trenera');
  assert.deepEqual(pusto('wolne', { zakres: 'jutro' }), { zdania: ['Na jutro plan przewiduje wolne.'], karty: [] });
  assert.deepEqual(pusto(null, {}).zdania, [NIE_MAM]);
});

test('UI: przyciski karty plan_pusty przez data-plan, bez onclick; akcje wołają openGenModal / czat z trenerem', () => {
  const wywolane = [];
  const okno = { escapeHtml: (s) => String(s), openGenModal: () => wywolane.push('gen'), showSection: (s) => wywolane.push('sekcja:' + s),
    openChatThread: (m) => wywolane.push('czat:' + m) };
  const ctx = vm.createContext({ window: okno, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: {}, setTimeout: (f) => f(), console });
  vm.runInContext(czytaj('js', 'okienko.js'), ctx);
  const O = okno.OKIENKO;
  const html = O.htmlOdpowiedzi(200, { tryb: 'router', zdania: ['x'], karty: [{ typ: 'plan_pusty', dane: { stan: 'generator' } }, { typ: 'plan_pusty', dane: { stan: 'trener' } }] });
  assert.match(html, /data-plan="generator">Ułóż plan</); assert.match(html, /data-plan="trener">Napisz do trenera</);
  assert.ok(!/onclick/i.test(html));
  O.akcjaPlanu('generator'); O.akcjaPlanu('trener');
  assert.deepEqual(wywolane, ['gen', 'sekcja:msgs', 'czat:coach']);
});
