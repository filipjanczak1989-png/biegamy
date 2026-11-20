/* BLIZNA 314 / 20.11 (decyzja Filipa po zwiadzie końca biegu): jedyny e-mail biegu (EF bieg-przypomnienie, 3 dni przed końcem) mówił „dopisujesz trening sam
   na ekranie Dziś”, bez słowa o czasie — a od v7 trening bez czasu nie zalicza biegu. Teraz w HTML i w wersji tekstowej: „Bez zegarka dopisz trening na Dziś
   z czasem (np. 45:00), bo trening bez czasu nie zalicza biegu.” Test renderuje prawdziwą funkcję tresc() z EF (typy zdjęte przez node:module, bez sieci i Deno). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');

const KORZEN = path.join(__dirname, '..');
const ZDANIE = 'Bez zegarka dopisz trening na Dziś z czasem (np. 45:00), bo trening bez czasu nie zalicza biegu.';
function zaladujEf() {
  const src = fs.readFileSync(path.join(KORZEN, 'supabase/functions/bieg-przypomnienie/index.ts'), 'utf8').replace(/\r/g, '');
  const bezSerwera = src.slice(0, src.indexOf('Deno.serve(')).replace(/^import [^\n]*\n/gm, '').replace(/^export /gm, '');
  const js = stripTypeScriptTypes(bezSerwera);
  return new Function('Deno', 'createClient', 'rozeslij', 'wyslijJeden', js + '\nreturn { tresc, kiedy };')({ env: { get: () => '' } }, null, null, null);
}
const O = { bieg_id: 'b', konto_id: 'k', slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka', dzien_od: '2026-11-18', dzien_do: '2026-12-06', wynik_do: '2026-12-06', dni_do_biegu: -15, dni_do_konca: 3,
  koniec_godz: '20:00', email: 'x@example.test', token: '11111111-2222-4333-8444-555555555555', uczestnicy: [{ imie: 'Anna', numer: 1, rodzaj: 'ja', dystans_km: 5 }] };

test('e-mail: zdanie o czasie w HTML i w tekście; reszta treści jak dotąd (3 dni, godz. 20:00, dzieci)', () => {
  const { tresc } = zaladujEf(), t = tresc(O);
  assert.equal(t.temat, 'Zostały 3 dni biegu: Wirtualny Bieg Mikołajkowy dla Fabianka');
  assert.ok(t.html.includes('<p>Wynik wchodzi z zegarka jak każdy trening w BiegaMy. ' + ZDANIE + ' Dystans dziecka wpisujesz na stronie biegu. Czas masz do 6.12.2026, godz. 20:00.'), t.html);
  assert.ok(t.html.includes('Zostały 3 dni do końca biegu (do godz. 20:00 w niedzielę)'));
  assert.ok(t.tekst.includes('Twoje numery: Anna 1.\n' + ZDANIE + '\nWynik do 6.12.2026, godz. 20:00.'), t.tekst);
  assert.doesNotMatch(t.html + t.tekst, /dopisujesz trening sam/);
  const dzieci = tresc(Object.assign({}, O, { uczestnicy: [{ imie: 'Zosia', numer: 2, rodzaj: 'dziecko', dystans_km: null }] }));
  assert.ok(dzieci.html.includes(ZDANIE) && dzieci.html.includes('Numery startowe Twoich dzieci:'));
});
