/* BLIZNA 223 (11.11.2026, E2 szkielet „Dziś najpierw dane”): js/dzis-dane.mjs — karta planu (kompaktowa) i karta wykonania
   (cztery liczby + miejsce na miniaturę). Pilnuje: stany (brak planu, dzień wolny, plan, plan + wykonanie, wykonanie bez planu),
   źródło wpisu (zegarek z trasą / zegarek / bieżnia / zdjęcie / ręczny) i że bez trasy NIE ma żadnego udawanego kształtu,
   escape każdego tekstu z bazy (typ, opis, komentarz), formaty liczb, brak zapytań i zapisu, moduł nie dotyka strony (od 23.11 zamiast „git diff” zawodnik.html). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const kod = fs.readFileSync(path.join(KORZEN, 'js', 'dzis-dane.mjs'), 'utf8');
const kodTrasy = fs.readFileSync(path.join(KORZEN, 'js', 'trasa-svg.mjs'), 'utf8');
const g = {}; g.globalThis = g; vm.runInNewContext(kodTrasy + '\n' + kod, g);
const D = g.BM_DZIS_DANE, T = g.BM_TRASA;
const PLAN = { type: 'Interwały', distance_km: 8, pace: '5:00', description: '4× 1 km w tempie 4:30, przerwy 2 min truchtem' };
const LOG = { distance_km: 8.21, duration_s: 2605, pace_s: 317, heart_rate: 156, training_type: 'Interwały', source: 'intervals', icu_stream_types: ['time', 'latlng'], comment: 'Nogi ciężkie po wczoraj' };
const TRASA = [[52.23, 21.01], [52.23, 21.02], [52.234, 21.02], [52.234, 21.01], [52.23, 21.01]];

/* 23.11 (Filip, przed E0): wcześniej ten test sprawdzał „git diff HEAD” dla zawodnik.html, sw.js i index.html — robił się czerwony przy każdej pracy nad
   zawodnik.html w tym samym checkoucie (E0) i wymagał repozytorium git. Teraz pilnuje samego modułu: czyste funkcje, bez dotykania strony i bez sieci. */
test('moduł bez import/export, bez sieci, bez zapisu, bez dotykania strony', () => {
  assert.doesNotMatch(kod, /^\s*(import|export)\b/m);
  assert.doesNotMatch(kod, /fetch\(|supabase|localStorage|sessionStorage|innerHTML\s*=/);
  assert.doesNotMatch(kod, /document\.|window\.location|addEventListener|showSection\(/, 'moduł nie dotyka strony: wpięcie należy do etapu nowego Dziś');
  assert.doesNotMatch(kodTrasy, /fetch\(|supabase|localStorage|sessionStorage|document\.|addEventListener/);
});

test('formaty: km, czas, tempo (liczby i napisy z bazy), brak = „—”', () => {
  assert.equal(D.km(8.21), '8,21'); assert.equal(D.km(12.7), '12,7'); assert.equal(D.km(0), '—'); assert.equal(D.km('x'), '—');
  assert.equal(D.czas(2605), '43:25'); assert.equal(D.czas(3725), '1:02:05'); assert.equal(D.czas('1:02:05'), '1:02:05'); assert.equal(D.czas('48:10'), '48:10'); assert.equal(D.czas(null), '—');
  assert.equal(D.tempo(317), '5:17'); assert.equal(D.tempo('5:12/km'), '5:12'); assert.equal(D.tempo('5:07'), '5:07'); assert.equal(D.tempo(''), '—');
});

test('stan: brak planu / dzień wolny / plan / plan + wykonanie / wykonanie bez planu', () => {
  assert.equal(D.stan(null, null), 'brak-planu');
  assert.equal(D.stan({ type: 'Odpoczynek' }, null), 'wolne');
  assert.equal(D.stan(PLAN, null), 'plan');
  assert.equal(D.stan(PLAN, LOG), 'plan-wykonanie');
  assert.equal(D.stan(null, LOG), 'wykonanie-bez-planu');
  assert.equal(D.stan({ type: 'Odpoczynek' }, LOG), 'wykonanie-bez-planu', 'bieg w dzień wolny = wykonanie bez planu');
});

test('źródło wpisu: trasa TYLKO dla zegarka z latlng; bieżnia, zdjęcie i ręczny bez trasy', () => {
  assert.equal(D.zrodloWpisu(LOG), 'zegarek-trasa');
  assert.equal(D.zrodloWpisu({ ...LOG, icu_stream_types: 'time,heartrate' }), 'zegarek');
  assert.equal(D.zrodloWpisu({ ...LOG, icu_trainer: true }), 'bieznia');
  assert.equal(D.zrodloWpisu({ ...LOG, icu_type: 'VirtualRun' }), 'bieznia');
  assert.equal(D.zrodloWpisu({ distance_km: 5, source: 'ocr', attachment_url: 'x' }), 'ocr');
  assert.equal(D.zrodloWpisu({ distance_km: 5, source: 'manual' }), 'reczny');
  assert.equal(D.zrodloWpisu(null), 'brak');
});

test('cztery liczby: dystans, czas, tempo + tętno; bez tętna przewyższenie; bez obu odczucie', () => {
  const l = D.liczbyWykonania(LOG);
  assert.deepEqual([...l.map((x) => x.w)], ['8,21', '43:25', '5:17', '156']);
  assert.equal(D.liczbyWykonania({ ...LOG, heart_rate: null, elevation: 120 })[3].p, 'w górę');
  assert.equal(D.liczbyWykonania({ ...LOG, heart_rate: null, feel: 'dobrze' })[3].w, 'dobrze');
  assert.equal(D.liczbyWykonania({ distance_km: 5, duration: '30:00', pace: '6:00' })[3].w, '—');
});

test('miniatura: SVG z trasy tylko dla zegarka z latlng; bieżnia = ikona; zdjęcie/ręczny = „bez trasy”; nigdy udawany kształt', () => {
  const mini = T.miniatura(TRASA);
  assert.match(D.miniaturaHtml(LOG, { miniatura: mini }), /dd-mini--trasa[\s\S]*<svg/);
  assert.match(D.miniaturaHtml(LOG, {}), /dd-mini--czeka/);
  assert.match(D.miniaturaHtml({ ...LOG, icu_trainer: true }, { miniatura: mini }), /dd-mini--bieznia/);
  assert.doesNotMatch(D.miniaturaHtml({ ...LOG, icu_trainer: true }, { miniatura: mini }), /polyline/, 'bieżnia bez trasy nawet gdy ktoś poda SVG');
  assert.match(D.miniaturaHtml({ distance_km: 5, source: 'ocr', attachment_url: 'x' }, { miniatura: mini }), /bez trasy/);
  assert.match(D.miniaturaHtml({ distance_km: 5, source: 'manual' }, { miniatura: mini }), /bez trasy/);
});

test('karta planu: typ, cel (km · tempo), opis do 140 znaków; brak planu i dzień wolny mają własne teksty', () => {
  const h = D.kartaPlanuHtml(PLAN, { ktoUlozyl: 'trener' });
  assert.match(h, /data-stan="plan"/); assert.match(h, /Interwały/); assert.match(h, /8 km · 5:00 \/km/); assert.match(h, /od trenera/); assert.match(h, /4× 1 km/);
  assert.match(D.kartaPlanuHtml(null, { bezTrenera: true }), /data-stan="brak-planu"[\s\S]*Ułóż plan/);
  assert.doesNotMatch(D.kartaPlanuHtml(null, {}), /Ułóż plan/, 'z trenerem bez wezwania do generatora');
  assert.match(D.kartaPlanuHtml({ type: 'Odpoczynek' }, { ktoUlozyl: 'generator' }), /data-stan="wolne"[\s\S]*z generatora[\s\S]*Dzień wolny/);
  const dlugi = D.kartaPlanuHtml({ ...PLAN, description: 'x'.repeat(200) });
  assert.match(dlugi, /x{137}…/);
});

test('karta wykonania: zdanie o planie zależy od dystansu (±15 %), komentarz skrócony, źródło w nagłówku', () => {
  assert.match(D.kartaWykonaniaHtml(LOG, PLAN, {}), /Plan zrobiony\./);
  assert.match(D.kartaWykonaniaHtml({ ...LOG, distance_km: 12 }, PLAN, {}), /Więcej niż w planie\./);
  assert.match(D.kartaWykonaniaHtml({ ...LOG, distance_km: 4 }, PLAN, {}), /Krócej niż w planie\./);
  assert.match(D.kartaWykonaniaHtml(LOG, null, {}), /Bez planu, ale zrobione\./);
  assert.match(D.kartaWykonaniaHtml(LOG, PLAN, {}), /z zegarka/);
  assert.match(D.kartaWykonaniaHtml({ ...LOG, comment: 'y'.repeat(100) }, PLAN, {}), /y{87}…/);
  assert.equal(D.kartaWykonaniaHtml(null, PLAN, {}), '');
});

test('escape: typ, opis planu i komentarz z bazy nie wchodzą do HTML surowo', () => {
  const zly = '<img src=x onerror=alert(1)>';
  const h = D.dzisHtml({ ...PLAN, type: zly, description: zly }, { ...LOG, training_type: zly, comment: zly, feel: zly, heart_rate: null }, {});
  assert.doesNotMatch(h, /<img src=x/);
  assert.match(h, /&#60;img/);
});

test('dzisHtml: kolejność wykonanie nad planem; po wykonaniu bez planu karty planu nie ma', () => {
  const h = D.dzisHtml(PLAN, LOG, { miniatura: T.miniatura(TRASA) });
  assert.ok(h.indexOf('dd-wykonanie') < h.indexOf('dd-plan'));
  assert.match(h, /data-stan="plan-wykonanie"/);
  assert.doesNotMatch(D.dzisHtml(null, LOG, {}), /dd-plan/);
  assert.match(D.dzisHtml(null, null, {}), /dd-plan--brak/);
  assert.ok(D.CSS.length > 500 && /@media\(min-width:400px\)/.test(D.CSS));
});
