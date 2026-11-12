/* BLIZNA 232 (12.11.2026): WEBHOOK intervals.icu MUSI PRZYJMOWAĆ PRAWDZIWE WYWOŁANIA.
   Wersja z 11.11 (runda C) dodała do guardu warunek „sekret po naszej stronie ma ≥ 16 znaków”. Sekret generuje intervals.icu, my go tylko
   kopiujemy, więc od wdrożenia 12.11 09:09 do cofnięcia 10:02 KAŻDY prawdziwy POST (ponad 30, bez ?secret w adresie, sekret w treści JSON)
   dostawał 401 i żaden trening nie wszedł. Smoke „POST bez sekretu → 401” tego nie wykrył, bo obie wersje odmawiają bez sekretu.
   Reguły: (1) guard to jedna czysta funkcja sekretWebhookaOk(sekretUstawiony, body) w _shared, testowana tutaj na kształcie żądania intervals.icu;
   (2) pusty albo nieustawiony sekret po naszej stronie = odmowa, pusty sekret w treści = odmowa, inny typ = odmowa, inny sekret = odmowa;
   (3) ŻADNEGO wymogu długości; (4) index.ts używa tej funkcji i nie ma własnego warunku. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
/* kształt prawdziwego wywołania intervals.icu: sekret jawnie w treści, lista zdarzeń; sekret TESTOWY krótki (8 znaków), bo taki bywa prawdziwy */
const SEKRET = 'a1b2c3d4';
const ZADANIE_INTERVALS = { secret: SEKRET, events: [{ type: 'ACTIVITY_UPLOADED', athlete_id: 'i123456', activity_id: 'i987654321' }, { type: 'ACTIVITY_ANALYZED', athlete_id: 'i123456', activity_id: 'i987654321' }] };

test('przyjęcie: żądanie w kształcie intervals.icu z krótkim (8 znaków) i z długim sekretem przechodzi; wymogu długości nie ma', async () => {
  const { sekretWebhookaOk } = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/_shared/sekret-webhooka.mjs')).href);
  assert.equal(sekretWebhookaOk(SEKRET, ZADANIE_INTERVALS), true, 'sekret 8 znaków, jaki ustawia intervals.icu → PRZYJĘTE');
  assert.equal(sekretWebhookaOk('x', { secret: 'x', events: [] }), true, 'sekret 1 znak → PRZYJĘTE (długość nie jest naszą sprawą)');
  const dlugi = 'q'.repeat(40);
  assert.equal(sekretWebhookaOk(dlugi, { secret: dlugi, events: [] }), true, 'długi sekret → PRZYJĘTE');
  assert.equal(sekretWebhookaOk(SEKRET, { secret: SEKRET }), true, 'bez listy zdarzeń też przechodzi guard (puste zdarzenia obsłuży dalsza część)');
});

test('odmowa: pusty albo nieustawiony sekret po naszej stronie, pusty/brak/inny typ/inny sekret w treści, brak treści', async () => {
  const { sekretWebhookaOk } = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/_shared/sekret-webhooka.mjs')).href);
  for (const [opis, ustawiony, body] of [
    ['sekret po naszej stronie pusty', '', { secret: '' }], ['nieustawiony (undefined)', undefined, { secret: SEKRET }], ['nieustawiony (null)', null, { secret: SEKRET }],
    ['pusty sekret w treści', SEKRET, { secret: '' }], ['brak sekretu w treści', SEKRET, { events: [] }], ['sekret liczbą', SEKRET, { secret: 12345678 }],
    ['inny sekret', SEKRET, { secret: 'a1b2c3d5' }], ['brak treści', SEKRET, null], ['treść nie-obiekt', SEKRET, 'a1b2c3d4'], ['oba puste (stara dziura)', '', { secret: '' }],
  ]) assert.equal(sekretWebhookaOk(ustawiony, body), false, opis + ' → ODMOWA');
});

test('index.ts: guard przez tę funkcję, 401 tylko tam, bez własnego warunku długości; moduł bez sekretów i bez logowania wartości', () => {
  const s = czytaj('supabase/functions/intervals-webhook/index.ts'), m = czytaj('supabase/functions/_shared/sekret-webhooka.mjs');
  assert.match(s, /import \{ sekretWebhookaOk \} from '\.\.\/_shared\/sekret-webhooka\.mjs';/);
  assert.match(s, /if \(!sekretWebhookaOk\(HOOK_SECRET, body\)\) \{\n\s*return J\(401, \{ ok: false, error: 'bad_secret' \}\);/);
  assert.doesNotMatch(s, /HOOK_SECRET\.length|length < 16|length >= 16/, 'wymóg długości zniknął');
  assert.equal((s.match(/J\(401/g) || []).length, 1, '401 tylko w guardzie');
  assert.doesNotMatch(m, /console\.|Deno\.|fetch\(|process\./, 'czysta funkcja: nic nie loguje, niczego nie czyta z otoczenia');
  assert.match(m, /export function sekretWebhookaOk\(sekretUstawiony, body\)/);
});
