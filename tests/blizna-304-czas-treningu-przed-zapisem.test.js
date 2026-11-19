/* BLIZNA 304 / 19.11: czas treningu przed zapisem (decyzja Filipa po diagnozie nr 10 w biegu).
   autoColonTime zostawia 1–2 cyfry bez dwukropka („1”, „45”), formularze zapisywały to jako duration, a takiego wpisu nie czyta nic w aplikacji
   (tempo na Dziś i w kalendarzu, suma_biegowa, bieg). W bazie 49 takich treningów; najnowszy: 14 km z czasem „1” w biegu (bez czasu i tempa).
   Źródło większości: kalendarz wpisywał czas z PLANU (minuty jako liczba, f-time / duration_min) wprost do pola czasu.
   Teraz: jedna funkcja w sb.js (sprawdzCzasTreningu + uwagaCzasu), oba formularze (Dziś l-time, kalendarz lm-time) z niej:
   sama liczba albo czas uszkodzony (minuty/sekundy ≥ 60) się nie zapisuje, pod polem „Wpisz czas jako 45:00 albo 1:05:00.”;
   puste pole wolno, przy dystansie od 5 km łagodna podpowiedź bez blokady; minuty z planu → „45:00” / „1:30:00”. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb, stabilnyDom } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
let ctx;
test.before(() => { ctx = zaladujSb(); });
/* to samo, co akcja_bieg_sekundy w bazie dla formatów z dwukropkiem */
const sekundyBazy = (t) => { let m = /^\s*(\d{1,2}):([0-5]\d):([0-5]\d)\s*$/.exec(t); if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3]; m = /^\s*(\d{1,3}):([0-5]\d)\s*$/.exec(t); return m ? +m[1] * 60 + +m[2] : null; };

test('reguła: M:SS i H:MM:SS przyjęte (te same sekundy co w bazie); sama liczba, uszkodzony i zerowy czas odrzucone; puste wolno', () => {
  const S = ctx.window.sprawdzCzasTreningu;
  for (const t of ['45:00', '1:05:00', '01:05:00', '5:30', '105:00', '23:59:59', ' 45:00 ']) {
    const w = S(t, 10); assert.equal(w.ok, true, t); assert.equal(w.sekundy, sekundyBazy(t), t); assert.equal(w.blad, '');
  }
  for (const t of ['1', '45', '105', '1:00:90', '31:75', '01:19:5', '0:00', '0:00:00', '1h', '1,5', '1:5', 'abc']) {
    const w = S(t, 10); assert.equal(w.ok, false, t); assert.equal(w.blad, 'Wpisz czas jako 45:00 albo 1:05:00.', t);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(S('', 3))), { ok: true, sekundy: null, blad: '', podpowiedz: '' }, 'krótki trening bez czasu: bez podpowiedzi');
  const p = S('  ', 5); assert.equal(p.ok, true); assert.match(p.podpowiedz, /^Bez czasu trening nie ma tempa ani czasu w wynikach\. Wpisz czas, jeśli go znasz \(np\. 45:00 albo 1:05:00\)\.$/);
});

test('komunikat pod polem: przy wpisywaniu tylko podpowiedź, przy zapisie błąd i blokada; puste pole nie blokuje', () => {
  const dom = stabilnyDom(ctx), czas = dom.daj('lm-time'), uw = dom.daj('lm-time-uwaga'), dyst = dom.daj('lm-dist');
  dyst.value = '14'; czas.value = '1';
  assert.equal(ctx.window.uwagaCzasu('lm-time', 'lm-time-uwaga', 'lm-dist', false), true, 'w trakcie wpisywania nie blokuje');
  assert.equal(uw.hidden, true, 'i nie straszy błędem w trakcie wpisywania');
  assert.equal(ctx.window.uwagaCzasu('lm-time', 'lm-time-uwaga', 'lm-dist', true), false, 'przy zapisie blokuje');
  assert.equal(uw.textContent, 'Wpisz czas jako 45:00 albo 1:05:00.'); assert.equal(uw.hidden, false);
  czas.value = '';
  assert.equal(ctx.window.uwagaCzasu('lm-time', 'lm-time-uwaga', 'lm-dist', true), true, 'puste pole: zapis idzie');
  assert.match(uw.textContent, /^Bez czasu trening/); assert.equal(uw.hidden, false, 'łagodna podpowiedź przy 14 km');
  czas.value = '2:50:00';
  assert.equal(ctx.window.uwagaCzasu('lm-time', 'lm-time-uwaga', 'lm-dist', true), true); assert.equal(uw.hidden, true);
});

test('oba formularze: sprawdzenie przed zapisem, miejsce na komunikat pod polem, odświeżenie przy otwarciu; minuty z planu jako 45:00', () => {
  const z = czytaj('zawodnik.html'), k = czytaj('kalendarz.html');
  assert.match(z, /<input type="text" id="l-time"[^>]*oninput="autoColonTime\(this\);calcPaceAuto\(\);calcKcalAuto\(\);uwagaCzasu\('l-time','l-time-uwaga','l-dist',false\)"[^>]*><div id="l-time-uwaga" role="status" hidden/);
  const zSave = z.slice(z.indexOf('async function saveLog()'), z.indexOf('window.zapiszLog({', z.indexOf('async function saveLog()')));
  assert.match(zSave, /if \(window\.uwagaCzasu && !window\.uwagaCzasu\('l-time', 'l-time-uwaga', 'l-dist', true\)\) \{ toast\('Czas: wpisz jako 45:00 albo 1:05:00'\); return; \}/, 'Dziś: przed zapiszLog');
  assert.match(k, /<input id="lm-time"[^>]*oninput="autoColonTime\(this\);kalCalcPaceAuto\(\);uwagaCzasu\('lm-time','lm-time-uwaga','lm-dist',false\)"[^>]*>\s*<div id="lm-time-uwaga" role="status" hidden/);
  const od = k.indexOf("const time = document.getElementById('lm-time').value.trim() || null;"), kSave = k.slice(od, k.indexOf('window.zapiszLog({', od));
  assert.match(kSave, /if \(window\.uwagaCzasu && !window\.uwagaCzasu\('lm-time', 'lm-time-uwaga', 'lm-dist', true\)\) \{ notify\('Czas: wpisz jako 45:00 albo 1:05:00'\); return; \}/, 'kalendarz: przed zapiszLog');
  assert.ok((z.match(/uwagaCzasu\('l-time', 'l-time-uwaga', 'l-dist', false\)/g) || []).length >= 4, 'Dziś: odświeżenie przy resetach, edycji i po zapisie');
  assert.match(k, /if \(window\.uwagaCzasu\) window\.uwagaCzasu\('lm-time', 'lm-time-uwaga', 'lm-dist', false\);/);
  assert.doesNotMatch(k, /timeEl\.value = t\.time \|\| t\.duration_min;/, 'minuty z planu nie trafiają do pola jako sama liczba');
  const plan = k.slice(k.indexOf('if (timeEl && (t.time || t.duration_min)) {'), k.indexOf('if (timeEl && (t.time || t.duration_min)) {') + 400);
  const przelicz = new Function('t', 'const timeEl = { value: "" };' + plan.slice(0, plan.indexOf('\n    }') + 6) + ' return timeEl.value;');
  assert.equal(przelicz({ time: 45 }), '45:00'); assert.equal(przelicz({ duration_min: 90 }), '1:30:00'); assert.equal(przelicz({ time: 125 }), '2:05:00'); assert.equal(przelicz({ time: '1:05:00' }), '1:05:00');
  for (const w of ['45:00', '1:30:00', '2:05:00']) assert.equal(ctx.window.sprawdzCzasTreningu(w, 10).ok, true, w + ' przechodzi sprawdzenie');
});
