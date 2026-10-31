/* BLIZNA 60 (31.10.2026, Dziś v2 A2b + G5): kafle z sygnałem na Dziś i Profilu.

   Zasada (Dzis-v2-A2-G5-projekt.md pkt 0): LICZBA albo KROPKA, nigdy obie, i NIC przy braku danych.
   Ryzyka:
   1) „0" ZAMIAST NICZEGO. Kafel z „0 %" albo „0 d" udaje wiedzę — LEKCJA „nie wiem ≠ nic".
   2) DRUGA KOPIA WYZWAŃ. Do 31.10 listy i postęp żyły w closure wyzwania.html; kafel liczący po swojemu
      rozjechałby % z paskiem na stronie. Teraz jedno źródło: WYZWANIA w sb.js.
   3) STARTY Z LICZBĄ I KROPKĄ. Kafel miał już kropkę „nowe od znajomych" (#starty-dot); liczba dni ją wypiera.
   4) IKONA BEZ PLIKU. Slug kafla bez ikony w puli generatora = 404; nowa ikona ma zapas na stary plik.
   5) RUCH BEZ ZGODY. Sprężyna przy nacisku znika przy prefers-reduced-motion. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const zaw = czytaj('zawodnik.html'), prof = czytaj('profil.html'), wyz = czytaj('wyzwania.html'), css = czytaj('theme.css');
const gen = czytaj('tools/kadry/generuj-kadry.mjs');

test('reguły: zero / null / brak danych → brak sygnału (nie „0")', () => {
  const R = zaladujSb().KAFLE.reguly;
  for (const v of [0, null, undefined, NaN, '3']) {
    assert.equal(R.cialo(v), null, `cialo(${v})`);
    assert.equal(R.czat(v), null, `czat(${v})`);
    assert.equal(R.wyzwania(v), null, `wyzwania(${v})`);
  }
  assert.equal(R.wyzwania(100), null, '100 % to ukończone, nie „najbliższe"');
  assert.equal(R.odznaki(5, null), null, 'pierwsza wizyta: bez punktu odniesienia nie ma „nowej"');
  assert.equal(R.odznaki(5, 5), null);
  assert.equal(R.odznaki(null, 3), null);
  assert.equal(R.starty([], '2026-10-31'), null);
  assert.equal(R.starty([{ date: '2026-10-01' }], '2026-10-31'), null, 'cel w przeszłości');
  assert.equal(R.starty([{ date: 'jutro' }, null, {}], '2026-10-31'), null, 'śmieci w race_goals');
});

test('reguły: liczba ALBO kropka, nigdy obie', () => {
  const R = zaladujSb().KAFLE.reguly;
  const wyniki = [R.cialo(3), R.czat(150), R.wyzwania(72), R.odznaki(6, 5),
    R.starty([{ date: '2026-11-12' }, { date: '2026-11-05' }], '2026-10-31'), R.starty([{ date: '2026-10-31' }], '2026-10-31')];
  for (const w of wyniki) assert.ok(w && (('liczba' in w) !== !!w.kropka), JSON.stringify(w));
  assert.deepEqual({ ...R.starty([{ date: '2026-11-12' }, { date: '2026-11-05' }], '2026-10-31') }, { liczba: 5, jednostka: 'd' }, 'najbliższy cel');
  assert.equal(R.czat(150).liczba, '99+');
});

test('pokaz(): w kaflu zostaje jeden znacznik; null czyści poprzedni', () => {
  const ctx = zaladujSb();
  const dzieci = [], klasy = new Set();
  const kafel = { classList: { add: (c) => klasy.add(c), remove: (...c) => c.forEach((x) => klasy.delete(x)) },
    querySelector: (s) => (s === '.kafel-syg' ? dzieci[0] || null : null), appendChild: (e) => { e.remove = () => dzieci.splice(dzieci.indexOf(e), 1); dzieci.push(e); } };
  ctx.document.createElement = () => ({ setAttribute() {}, className: '', textContent: '' });
  const root = { querySelector: () => kafel };
  ctx.KAFLE.pokaz(root, 'starty', { liczba: 12, jednostka: 'd' });
  assert.equal(dzieci.length, 1); assert.equal(dzieci[0].textContent, '12 d'); assert.ok(klasy.has('kafel-ma-liczbe'));
  ctx.KAFLE.pokaz(root, 'starty', { kropka: true, nowe: true });
  assert.equal(dzieci.length, 1); assert.match(dzieci[0].className, /kropka/); assert.ok(!klasy.has('kafel-ma-liczbe'));
  ctx.KAFLE.pokaz(root, 'starty', null);
  assert.equal(dzieci.length, 0); assert.ok(!klasy.has('kafel-nowe'));
});

test('Starty na Dziś: kropka znajomych gaśnie, gdy kafel ma liczbę', () => {
  const f = zaw.slice(zaw.indexOf('async function checkFriendsRacesDot()'), zaw.indexOf('function toggleFriendsActivity()'));
  assert.match(f, /kafel-ma-liczbe/);
  assert.match(f, /hasNew && !_maLiczbe/);
});

test('WYZWANIA: jedno źródło — wyzwania.html i zawodnik.html bez własnych list i liczenia', () => {
  /* Do 31.10 były DWIE kopie (wyzwania.html, zawodnik.html) i liczyły km inaczej: jedna tylko biegi, druga wszystko. */
  for (const [nazwa, html] of [['wyzwania.html', wyz], ['zawodnik.html', zaw]]) {
    assert.ok(!/const WEEKLY\s*=|const MONTHLY\s*=/.test(html), `listy wyzwań wróciły do ${nazwa}`);
    assert.ok(!/function wProg|const wkm\s*=|let streak\s*=/.test(html), `liczenie postępu wróciło do ${nazwa}`);
    assert.match(html, /window\.WYZWANIA\.aktywne\(/, nazwa); assert.match(html, /window\.WYZWANIA\.postep\(/, nazwa);
  }
  const W = zaladujSb().WYZWANIA;
  const teraz = new Date(2026, 9, 28, 12);                     // środa
  assert.equal(W.najblizsze([], teraz), null, 'brak logów → brak sygnału');
  const logi = [{ logged_at: '2026-10-27T08:00:00Z', distance_km: '10', training_type: 'Spokojny' }];
  const n = W.najblizsze(logi, teraz);
  assert.ok(n === null || (n > 0 && n < 100), String(n));
  /* km tygodnia jak w przyznawaniu odznak (checkBadges): tylko biegi; rower nie dobija paska. */
  const rower = [{ logged_at: '2026-10-27T08:00:00Z', distance_km: '60', training_type: 'Rower' }];
  const p = W.postep(rower, teraz);
  assert.equal(p['20km_tydzien'], 0, 'rower liczony do km tygodnia');
  assert.equal(p['m_50km_miesiaca'], 60, 'km miesiąca: wszystko (jak checkBadges)');
});

test('każdy kafel ma ikonę w puli G5 i odwrotnie (+ dzwonek z topbaru); nowa ikona ma zapas na stary plik', () => {
  const kafle = new Set([...zaw.matchAll(/data-kafel="([a-z]+)"/g), ...prof.matchAll(/data-kafel="([a-z]+)"/g)].map((m) => m[1]));
  const pula = [...gen.slice(gen.indexOf('const IKONY = ['), gen.indexOf('];', gen.indexOf('const IKONY = ['))).matchAll(/slug: "([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...pula].sort(), [...new Set([...kafle, 'dzwonek'])].sort());
  for (const html of [zaw, prof]) {
    const img = [...html.matchAll(/data-kafel="[a-z]+"[^>]*>(?:<span[^>]*><\/span>)?<img ([^>]*)>/g)];
    assert.equal(img.length, [...html.matchAll(/data-kafel="/g)].length, 'kafel bez <img> tuż po znaczniku — test przeszedłby na pusto');
    for (const m of img) { assert.match(m[1], /data-ic="ikona-[a-z]+\.png"/, m[1]); assert.match(m[1], /data-ic-stary="[^"]+\.webp"/, m[1]); }
  }
  assert.match(czytaj('sb.js'), /img\.dataset\.icStary/, '_icZapas bez kroku „stary plik"');
});

test('prefers-reduced-motion: sprężyna kafla wyłączona; sygnał nie ma animacji', () => {
  const blok = css.slice(css.indexOf('===== KAFLE z sygnałem'));
  const rm = blok.slice(blok.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\[data-kafel\]:active\{transform:none;\}/);
  assert.match(rm, /transition:none/);
  assert.ok(!/animation/.test(blok), 'sygnał kafla z animacją');
});
