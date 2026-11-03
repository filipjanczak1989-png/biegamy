/* BLIZNA 109 (2.11.2026, L4 kalendarza) — okładki imprez z maszyny HURTEM, nie z klienta.
   Decyzja Filipa 2.11: generowanie lokalnie/serwerowo (nie z klienta — klient dałby nazwę do promptu Gemini), limit 30/dobę,
   ta sama impreza w kolejnych latach = ta sama okładka (klucz bez roku). Tabela imprezy_okladki: zalogowani czytają, nikt
   z przeglądarki nie pisze; url tylko z race-covers (CHECK). Front: jeden select na wejście, okładka po kluczBezRoku,
   inaczej zaślepka wg typu. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('migracja: RLS, tylko select dla authenticated, zero polityk zapisu, anon nic, CHECK url z race-covers i typ', () => {
  const m = czytaj('supabase/migrations/20261102_imprezy_okladki.sql');
  assert.match(m, /alter table public\.imprezy_okladki enable row level security;/);
  assert.match(m, /revoke all on public\.imprezy_okladki from public, anon, authenticated;/);
  assert.match(m, /grant select on public\.imprezy_okladki to authenticated;/);
  assert.equal((m.match(/create policy/g) || []).length, 1, 'jedna polityka — select');
  assert.doesNotMatch(m, /for (insert|update|delete)/);
  assert.match(m, /check \(url ~ '\^https:\/\/afqojgkaveykxbltxzwm\\\.supabase\\\.co\/storage\/v1\/object\/public\/race-covers\/impreza-\[0-9a-f\]\{40\}\\\.jpg/);
  assert.match(m, /typ in \('ulica', 'ulica-noc', 'trail', 'ultra', 'przelaj', 'nordic'\)/);
  assert.match(m, /has_table_privilege\('anon', 'public\.imprezy_okladki', 'select'\)/, 'asercja anon');
  assert.ok(fs.existsSync(path.join(KORZEN, 'supabase/migrations/20261102_WYCOFANIE_imprezy_okladki.sql')));
  assert.match(czytaj('tools/kalendarz-okladki-test.sql'), /FAIL 2c: zalogowany pisze/);
});

test('narzędzie hurtowe: klucz bez roku z BM_KALENDARZ, limit 30/dobę liczony z bazą, prompt bez tekstu, sekrety tylko z env', () => {
  const t = czytaj('tools/kalendarz/generuj-okladki.mjs');
  assert.match(t, /K\.kluczBezRoku\(r\.nazwa, r\.miasto\)/);
  assert.match(t, /LIMIT_DOBA = 30/); assert.match(t, /Math\.min\(ile, LIMIT_DOBA - dzisWBazie\)/, 'limit łącznie z wierszami z dziś');
  assert.match(t, /impreza-\$\{createHash\("sha1"\)\.update\(e\.klucz\)\.digest\("hex"\)\}\.jpg/, 'nazwa pliku z klucza — ta sama w kolejnych latach');
  assert.match(t, /Bez żadnego tekstu, liter, numerów startowych i logotypów/);
  assert.match(t, /process\.env\.GEMINI_API_KEY/); assert.match(t, /process\.env\.SUPABASE_SERVICE_KEY/);
  assert.doesNotMatch(t, /eyJ[A-Za-z0-9_-]{20,}/, 'żadnego klucza w pliku');
  assert.match(t, /--na-sucho/);
});

test('races.html: jeden select imprezy_okladki (bez in(...)), okładka po kluczBezRoku, inaczej zaślepka; żadnego zapisu z klienta', () => {
  const r = czytaj('races.html');
  assert.match(r, /_sb\.from\('imprezy_okladki'\)\.select\('klucz,url'\)/);
  assert.doesNotMatch(r, /imprezy_okladki'\)\.(insert|upsert|update|delete)/);
  assert.doesNotMatch(r, /imprezy-okladki|imprezy_okladki_kolejka/, 'klient nie zleca generowania okładek imprez z maszyny HURTEM (od 3.11 TRENER może dla JEDNEJ karty przez EF okladki-imprez — blizna-120)');
  assert.doesNotMatch(r, /from\('imprezy_okladki'\)\.(insert|upsert|update|delete)\(/, 'żadnego zapisu imprezy_okladki z klienta');
  assert.match(r, /_okladkiImprez\[window\.BM_KALENDARZ\.kluczBezRoku\(x\.nazwa, x\.miasto\)\]/);
  assert.match(r, /await okladkiLaduj\(\);[^\n]*\n\s*imprezyLaduj\(\);/, 'mapa przed renderem imprez');
});
