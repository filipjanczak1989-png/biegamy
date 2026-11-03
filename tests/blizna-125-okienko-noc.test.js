/* BLIZNA 125 (3.11.2026, Filip 16:12 „Okienko samo się sprawdza codziennie”): raport nocy trafia do PUBLICZNEGO repo, więc
   (1) anonimizacja: imiona/nazwiska → [OSOBA], e-maile i telefony usunięte, publiczni sportowcy zostają; (2) każdy plik docs/okienko-raport/*.md
   jest czysty; (3) narzędzie raportu TYLKO CZYTA bazę (klucz service jest pełny — odczyt wymusza kod); sędzia tylko ocenia; (4) workflow:
   cron 02:00 UTC, sekrety GEMINI_API_KEY i OKIENKO_RAPORT_KEY, commit z [skip ci], issue przy alarmie, ZERO deployu; (5) limit kosztu. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('anonimizacja: imię, imię+nazwisko, para wielkich liter, e-mail, telefon → zamazane; publiczni sportowcy, miasta, imprezy, Filip/Kasia zostają', async () => {
  const A = await import(pathToFileURL(path.join(KORZEN, 'tools/_anonimizuj.mjs')).href);
  assert.equal(A.anonimizuj('kim jest Jan Kowalski'), 'kim jest [OSOBA]');
  assert.equal(A.anonimizuj('wyniki Anny Nowak-Kowalskiej z Dębna'), 'wyniki [OSOBA] z Dębna');
  assert.equal(A.anonimizuj('maciej siedlecki'), '[OSOBA]'); assert.equal(A.anonimizuj('damian bolewski'), '[OSOBA]');
  assert.equal(A.anonimizuj('napisz do jan.kowalski@example.com albo 601 234 567'), 'napisz do [e-mail] albo [telefon]');
  assert.equal(A.anonimizuj('kto wygrał maraton w Berlinie'), 'kto wygrał maraton w Berlinie');
  assert.equal(A.anonimizuj('rekord Kipchoge w Berlinie'), 'rekord Kipchoge w Berlinie', 'sportowiec publiczny zostaje');
  assert.equal(A.anonimizuj('Bieg Niepodległości w Poznaniu 10 km'), 'Bieg Niepodległości w Poznaniu 10 km', 'impreza i miasto to nie osoba');
  assert.equal(A.anonimizuj('kim jest Filip'), 'kim jest Filip', 'Filip/Kasia (o nas) zostają — to publiczne osoby projektu');
  assert.equal(A.anonimizuj('plan na jutro'), 'plan na jutro'); assert.equal(A.anonimizuj(''), '');
  assert.equal(A.anonimizuj('Zapytałem o Kasię Nowak i o Tomka'), 'Zapytałem o [OSOBA] i o [OSOBA]');
  assert.equal(A.czysty('kim jest [OSOBA]'), true); assert.equal(A.czysty('kim jest Jan Kowalski'), false); assert.equal(A.czysty('x@y.pl'), false);
  assert.equal(A.czysty('trening 2026-11-03 10 km'), true, 'data i liczby to nie telefon'); assert.equal(A.czysty('tel 601234567'), false);
});

test('każdy raport w docs/okienko-raport/*.md jest czysty (bez imion ze słownika poza publicznymi, e-maili, telefonów, athlete_id)', async () => {
  const A = await import(pathToFileURL(path.join(KORZEN, 'tools/_anonimizuj.mjs')).href);
  const dir = path.join(KORZEN, 'docs/okienko-raport');
  const pliki = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)) : [];
  for (const f of pliki) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(t, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, f + ': uuid w raporcie');
    assert.ok(A.czysty(t.replace(/\[OSOBA\]|\[e-mail\]|\[telefon\]|osoba #\d+/g, '')), f + ': dane osobowe w raporcie');
  }
});

test('narzędzie raportu: tylko GET do Supabase (zero zapisów), sędzia ocenia (schemat 5 kryteriów), limit kosztu przerywa, alarm = kod 3, zapis do docs/okienko-raport', () => {
  const r = czytaj('tools/okienko-raport-dnia.mjs');
  assert.doesNotMatch(r, /method:\s*["'](POST|PATCH|PUT|DELETE)["']/, 'zapis do bazy przez REST'); assert.doesNotMatch(r, /\.(insert|update|upsert|delete)\(/, 'zapis przez klienta');
  assert.match(r, /rest\/v1\/\$\{tabela\}\?\$\{q\}/); assert.match(r, /OKIENKO_RAPORT_KEY/); assert.match(r, /anonimizuj\(w\.tekst\)/); assert.match(r, /anonimizuj\(w\.odpowiedz\)/); assert.match(r, /anonimizuj\(w\.komentarz\)/);
  assert.match(r, /required: \["odpowiada", "konkret", "liczby_z_pokryciem", "wyciek", "ton", "uzasadnienie"\]/); assert.match(r, /temperature: 0/); assert.match(r, /model: "gemini-3\.5-flash"/);
  assert.match(r, /limit \$\{OPCJE\.limitUsd\} USD przekroczony/); assert.match(r, /if \(!czysty\(/, 'strażnik przed zapisem'); assert.match(r, /process\.exitCode = 3/);
  assert.match(r, /klasyfikuj|kandydatDoLawki/); assert.doesNotMatch(r, /functions\/v1\/okienko/, 'raport nie pyta okienka (koszt, limity użytkowników)');
});

test('workflow okienko-noc: cron 02:00 UTC, sekrety, blizna przed commitem, commit [skip ci], issue tylko przy kodzie 3, żadnego deployu', () => {
  const w = czytaj('.github/workflows/okienko-noc.yml');
  assert.match(w, /cron: '0 2 \* \* \*'/); assert.match(w, /GEMINI_API_KEY: \$\{\{ secrets\.GEMINI_API_KEY \}\}/); assert.match(w, /OKIENKO_RAPORT_KEY: \$\{\{ secrets\.OKIENKO_RAPORT_KEY \}\}/);
  assert.match(w, /node tools\/okienko-raport-dnia\.mjs --noc --limit-usd 0\.5/); assert.match(w, /node --test tests\/blizna-125-okienko-noc\.test\.js/);
  assert.ok(w.indexOf('blizna-125') < w.indexOf('git commit'), 'blizna PRZED commitem raportu');
  assert.match(w, /\[skip ci\]/); assert.match(w, /if: steps\.raport\.outputs\.kod == '3'/); assert.match(w, /gh issue create/);
  assert.doesNotMatch(w, /supabase functions deploy|db push|db query|deploy\.yml|workflow_call/, 'noc nigdy nie wdraża');
  assert.doesNotMatch(w, /SUPABASE_ACCESS_TOKEN|SB_SECRET_KEY/, 'tylko klucz do odczytu logów i klucz Gemini');
});
