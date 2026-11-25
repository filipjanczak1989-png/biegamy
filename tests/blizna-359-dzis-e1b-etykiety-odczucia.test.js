// Blizna #359 (25.11.2026) — nowe Dziś: kafel „Ostatni trening” pokazywał „good” zamiast „Dobrze”.
//
// Odczucie w bazie to KOD (ograniczenie training_logs_feel_dozwolone: bad, mid, good, great). Commit z danymi E1 wypisywał
// kolumnę feel bez tłumaczenia, a jego test karmił funkcję polskim słowem („Lekko”), którego w bazie nie ma i być nie może.
// Zielony test na danych, jakich produkcja nie zna. Tu dane są takie jak w bazie: cztery kody, null i śmieci.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const MODUL = czytaj('js/dzis-nowy.mjs');
const SB = czytaj('sb' + '.js');
const MIG = czytaj('supabase/migrations/20260816_training_logs_feel_check.sql');

function modul(okno = {}) {
  const w = Object.assign({ location: { search: '', hash: '', pathname: '/zawodnik.html' } }, okno);
  vm.runInNewContext(MODUL, { window: w, document: { documentElement: { classList: { contains: () => false, add() {}, remove() {} } }, getElementById: () => null }, URLSearchParams, Date, Promise });
  return w.BM_DZIS;
}
const TERAZ = new Date(2026, 10, 25, 12, 0, 0);
const czwarta = (B, wpis) => { const m = [...B.ostatniHtml(Object.assign({ training_type: 'Spacer', distance_km: 3, logged_at: new Date(2026, 10, 25, 9, 0).toISOString() }, wpis), TERAZ).matchAll(/<div class="dn-l"><b( class="dn-slowo")?>([^<]*)(?:<small>[^<]*<\/small>)?<\/b><span>([^<]*)<\/span>/g)].pop(); return [m[2], m[3], !!m[1]]; };

test('(1) cztery kody z bazy dają cztery polskie słowa, takie same jak w reszcie aplikacji', () => {
  const kody = [...MIG.matchAll(/feel in \(([^)]*)\)/g)][0][1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.deepEqual(kody.slice().sort(), ['bad', 'good', 'great', 'mid'], 'kody dozwolone przez ograniczenie w bazie');
  const wAplikacji = Function('return (' + SB.match(/window\.FEEL_ETYKIETY = (\{[^}]*\});/)[1] + ')')();
  const B = modul();
  for (const k of kody) {
    assert.equal(B.odczucie(k), wAplikacji[k], k + ': to samo słowo co FEEL_ETYKIETY');
    assert.deepEqual(czwarta(B, { feel: k }), [wAplikacji[k], 'odczucie', true]);
  }
  assert.deepEqual(kody.map((k) => B.odczucie(k)).sort(), ['Ciężko', 'Dobrze', 'Przeciętnie', 'Świetnie']);
});

test('(2) na ekran nie trafia ani kod, ani nic spoza słownika: brak odczucia i nieznana wartość to „—”', () => {
  const B = modul();
  for (const zle of [null, undefined, '', 'Lekko', 'GOOD', 'excellent', '<b>x</b>', 'constructor', 'toString', '__proto__', 0, 3])
    assert.deepEqual(czwarta(B, { feel: zle }), ['—', 'odczucie', false], String(zle));
  for (const k of ['bad', 'mid', 'good', 'great']) assert.doesNotMatch(B.ostatniHtml({ training_type: 'Spacer', feel: k, logged_at: TERAZ.toISOString() }, TERAZ), new RegExp('>' + k + '<'), k + ' nie może być widoczny');
});

test('(3) słownik aplikacji ma pierwszeństwo, ale jego brak albo dziura nie psuje kafla; tętno i przewyższenie dalej przed odczuciem', () => {
  assert.equal(modul({ FEEL_ETYKIETY: { good: 'W porządku' } }).odczucie('good'), 'W porządku');
  assert.equal(modul({ FEEL_ETYKIETY: { good: 'W porządku' } }).odczucie('bad'), 'Ciężko', 'dziura w słowniku aplikacji: własna kopia');
  assert.equal(modul({ FEEL_ETYKIETY: { good: '' } }).odczucie('good'), 'Dobrze');
  assert.equal(modul({ FEEL_ETYKIETY: { excellent: 'Super' } }).odczucie('excellent'), '', 'słownik aplikacji nie dopuszcza kodów spoza czwórki');
  const B = modul();
  assert.deepEqual(czwarta(B, { feel: 'good', heart_rate: 142 }), ['142', 'tętno śr.', false]);
  assert.deepEqual(czwarta(B, { feel: 'good', elevation_gain: 80 }), ['80', 'w górę', false]);
});
