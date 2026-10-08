// Blizna #51 (08.10.2026) — zapis na start: upsert do race_signups ZAWSZE z ignoreDuplicates (ON CONFLICT DO NOTHING).
//
// Zwiad 8.10: race_signups ma tylko klucz (race_id, athlete_id); 5 upsertów ustawiało wyłącznie klucz, czyli
// DO UPDATE wpisywał te same wartości. Bez polityki UPDATE ścieżka konfliktu RZUCA błąd (PostgreSQL: „the UPDATE
// path will never be silently avoided") — ponowny zapis na ten sam start kończył się błędem: w races.html toast
// „Błąd: …", w profil.html sukcesem mimo błędu, w zawodnik.html fałszywym wpisem w client_errors. Do client_errors
// zgłaszało 1 z 5 miejsc (0 śladów race_signups — co nie dowodzi braku konfliktów). DO NOTHING nie wymaga UPDATE,
// więc grant race_signups:UPDATE można zdjąć (20261009_revoke_update_race_signups.sql — PO deployu frontu).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '');

test('każdy upsert do race_signups na froncie ma ignoreDuplicates: true i zgłasza błąd zapisu', () => {
  const { zwiad } = require('../tools/zwiad-zapisy-bez-polityki.js');
  const [ins] = zwiad(['race_signups:INSERT']);
  const ups = ins.trafienia.filter((t) => t.metoda === 'upsert');
  assert.equal(ups.length, 5, 'liczba upsertów do race_signups zmieniła się: ' + ups.map((t) => t.plik + ':' + t.linia).join(', '));
  for (const t of ups) {
    const tekst = czytaj(t.plik);
    const linie = tekst.split('\n');
    const okno = linie.slice(t.linia - 1, t.linia + 6).join('\n');
    assert.match(okno, /ignoreDuplicates:\s*true/, t.plik + ':' + t.linia + ' — upsert bez ignoreDuplicates = ON CONFLICT DO UPDATE (wymaga UPDATE)');
    assert.match(linie.slice(t.linia - 1, t.linia + 10).join('\n'), /zglosNieudanyZapis\('upsert', 'race_signups'/, t.plik + ':' + t.linia + ' — błąd zapisu ma trafić do client_errors');
  }
  const [upd] = zwiad(['race_signups:UPDATE']);
  assert.deepEqual(upd.trafienia, [], 'ktoś znowu robi UPDATE na race_signups (albo upsert DO UPDATE)');
});

test('races.html doSignup: lokalny licznik +1 tylko, gdy wiersz naprawdę powstał (.select po DO NOTHING)', () => {
  const r = czytaj('races.html');
  const f = r.slice(r.indexOf('async function doSignup(raceId)'), r.indexOf('async function doSignup(raceId)') + 2200);
  assert.match(f, /ignoreDuplicates: true \}\)\.select\('id'\);/);
  assert.match(f, /const nowyWiersz = !!\(wstawione && wstawione\.length\);/);
  assert.match(f, /if \(r && nowyWiersz\) r\.signup_count = /);
  const g = r.slice(r.indexOf('async function doSignup(raceId)'), r.indexOf('async function doSignup(raceId)') + 4000);
  assert.match(g, /if \(nowyWiersz\) \{\n\s+await _sb\.from\('race_signups'\)\.delete\(\)/, 'cofnięcie kasuje TYLKO wiersz wstawiony w tej próbie (blizna-30)');
});

test('migracja revoke race_signups:UPDATE przygotowana z warunkiem kolejności i lustrzanym wycofaniem', () => {
  const m = czytaj('supabase/migrations/20261009_revoke_update_race_signups.sql');
  const w = czytaj('supabase/migrations/20261009_WYCOFANIE_revoke_update_race_signups.sql');
  assert.match(m, /^revoke update on public\.race_signups from authenticated;$/m);
  assert.match(w, /^grant update on public\.race_signups to authenticated;$/m);
  assert.match(m, /WYKONAĆ DOPIERO PO DEPLOYU FRONTU/);
  assert.match(m, /usunąć wyjątek 'race_signups:UPDATE' z tools\/kontrola-revoke-bez-polityki\.sql/);
  assert.doesNotMatch(m + w, /\banon\b/i);
});
