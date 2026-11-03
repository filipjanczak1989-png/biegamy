/* ŁAWKA v2 jako test CI (Okienko 2.0 E1, 3.11.2026): prawdziwy potok v2 na atrapach, 0 $. Dwie reguły:
   1) każdy wiersz BEZ znacznika `luka` musi dać oczekiwany ślad (regresja = czerwono);
   2) wiersz ZE znacznikiem `luka`, który zaczął przechodzić, też jest czerwony z komunikatem „usuń znacznik” — plik ma mówić prawdę
      o stanie v2 (ławka ≥ 95 % to warunek przełączenia wszystkich, decyzja Filipa 3.11).
   Plus: żadne pytanie z parą imię+nazwisko osoby prywatnej nie kończy się w sieci ani w modelu (B2). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { przebieg, PYTANIA } = require('./_lawka-v2.js');

const CEL_PCT = 95;

test('ławka v2: brak regresji, znaczniki luk aktualne, prywatne nazwiska nigdy do sieci/modelu', async () => {
  const w = await przebieg();
  assert.equal(w.length, PYTANIA.length);
  const regres = w.filter((r) => !r.pasuje && !r.luka).map((r) => `${r.p} → oczekiwane ${r.oczekiwane}, jest ${r.slad}`);
  assert.deepEqual(regres, [], 'REGRESJE:\n' + regres.join('\n'));
  const zamkniete = w.filter((r) => r.luka && r.pasuje).map((r) => `${r.p} (${r.luka})`);
  assert.deepEqual(zamkniete, [], 'luka zamknięta — usuń znacznik `luka` w tests/_lawka-v2-pytania.js:\n' + zamkniete.join('\n'));
  const prywatne = w.filter((r) => r.kat === 'osoby' && /\b[A-ZŁŚŻŹĆŃ][a-ząęółśżźćń]+ [A-ZŁŚŻŹĆŃ][a-ząęółśżźćń]+/.test(r.p) && !/Korzeniowski|Lewandowski|Kipchoge/.test(r.p));
  for (const r of prywatne) assert.ok(!/^(siec|flash)/.test(r.slad), `prywatna para w sieci/modelu: ${r.p} → ${r.slad}`);
  const dobre = w.filter((r) => r.pasuje).length, pct = 100 * dobre / w.length;
  console.log(`ławka v2: dobra ${dobre}/${w.length} = ${pct.toFixed(1)} % (cel ${CEL_PCT} % przed przełączeniem wszystkich); znane luki ${w.filter((r) => r.luka).length}`);
  /* wiersze od Claude (zrodlo: 'claude') są osobną listą do pracy: mają własny licznik, a próg pilnuje rdzenia napisanego ręcznie */
  const reczne = w.filter((r) => r.zrodlo !== 'claude'), gen = w.filter((r) => r.zrodlo === 'claude');
  if (gen.length) console.log(`  wygenerowane: dobra ${gen.filter((r) => r.pasuje).length}/${gen.length}, luka 'gen' ${gen.filter((r) => r.luka).length}`);
  assert.ok(reczne.filter((r) => !r.luka).length >= 0.6 * reczne.length, 'ponad 40 % ławki to luki — to już nie ławka, tylko lista życzeń');
});
