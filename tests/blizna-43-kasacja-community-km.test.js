// Blizna #43 (07.10.2026) — licznik #100kmDlaKasi (RPC community_km) SKASOWANY; odznaki wyzwania zostają.
//
// Okno wyzwania 15.08–20.09.2026 zamknięte. community_km() wołały dwa miejsca (index.html landing z anonem,
// zawodnik.html „Dziś"), oba za bramką dat — martwy kod po 20.09, ale wywołanie istniało (STOP z 7.10 rano).
// Faza 1 (ten commit): oba wywołania, oba paski HTML, stałe tylko-licznika (SPOL_CEL_KM, SPOL_DATA_AMES)
// i bramka tools/sprawdz-spol-stale.py zdjęte; sprawdz-run-types.py pomija po TREŚCI migracje definiujące
// community_km (MIN_ZRODEL 10 → 5, świadomie). Faza 2 (osobny commit): drop function + WYCOFANIE.
//
// CO ZOSTAJE I DLACZEGO: SPOL_OKNO_OD/DO i SPOL_PROG_INDYW w zawodnik.html — WYZWANIA definiują przez nie
// reguły odznak 100km_wrzesien_2026 / razem_wrzesien_2026, które ludzie mają przyznane. Bez stałych reguła
// wyzwania (okno dat) przestałaby istnieć, a odznaka w katalogu stałaby się obietnicą bez pokrycia (blizna-40).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8');
const bezKomentarzy = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('kod: żaden śledzony plik frontu nie woła community_km ani nie renderuje pasków licznika', () => {
  const pliki = execSync('git ls-files "*.html" "*.js" "*.mjs" "*.ts"', { cwd: KORZEN }).toString()
    .split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('tests/') && !x.startsWith('tools/'));
  const slady = [];
  for (const f of pliki) {
    const s = bezKomentarzy(czytaj(f));
    for (const m of s.matchAll(/community_km|hero-licznik|spol-pasek|spol-(ja|my)-fill|_licznikLandingu|_odswiezLicznikSpolecznosci|SPOL_CEL_KM|SPOL_DATA_AMES/g)) {
      const linia = s.slice(0, m.index).split('\n').length;
      slady.push(f + ':~' + linia + ' ' + s.split('\n')[linia - 1].trim().slice(0, 90));
    }
  }
  assert.deepEqual(slady, [], 'licznik wrócił:\n' + slady.join('\n'));
  assert.match(czytaj('index.html'), /NAGROBEK \(07\.10\.2026\): tu stał licznik #100kmDlaKasi/);
  assert.match(czytaj('zawodnik.html'), /NAGROBEK \(07\.10\.2026\): tu stał pasek #100kmDlaKasi/);
});

test('odznaki wyzwania: WYZWANIA nadal odwołują się do stałych SPOL_* (reguła okna dat żyje)', () => {
  const z = czytaj('zawodnik.html');
  assert.match(z, /const SPOL_OKNO_OD\s*=\s*'2026-08-15';/);
  assert.match(z, /const SPOL_OKNO_DO\s*=\s*'2026-09-20';/);
  assert.match(z, /const SPOL_PROG_INDYW\s*=\s*100;/);
  const w = z.match(/const WYZWANIA = \[([\s\S]*?)\];/);
  assert.ok(w, 'brak WYZWANIA');
  assert.match(w[1], /id: '100km_wrzesien_2026'[^}]*prog_km: SPOL_PROG_INDYW[^}]*od: SPOL_OKNO_OD[^}]*do: SPOL_OKNO_DO/, '100km_wrzesien_2026 ma iść przez stałe, nie literały');
  assert.match(w[1], /id: 'razem_wrzesien_2026'[^}]*od: SPOL_OKNO_OD[^}]*do: SPOL_OKNO_DO/);
  for (const id of ['100km_wrzesien_2026', 'razem_wrzesien_2026']) {
    assert.ok(czytaj('odznaki.html').includes("id:'" + id + "'"), id + ' zniknęła z katalogu odznak');
  }
});

test('bramki: sprawdz-spol-stale.py zdjęta z CI i hooka (nie ma już czego porównywać), RUN_TYPES pomija martwą community_km', () => {
  assert.ok(!fs.existsSync(path.join(KORZEN, 'tools/sprawdz-spol-stale.py')), 'sprawdz-spol-stale.py wróciła — po kasacji licznika i SQL została jedna kopia stałych');
  assert.doesNotMatch(czytaj('.github/workflows/bramka.yml'), /sprawdz-spol-stale/);
  assert.doesNotMatch(czytaj('.githooks/pre-commit'), /sprawdz-spol-stale/);
  assert.match(czytaj('.github/workflows/bramka.yml'), /sprawdz-run-types\.py/, 'bramka RUN_TYPES ma zostać w CI');
  const py = czytaj('tools/sprawdz-run-types.py');
  assert.match(py, /MIN_ZRODEL = 5 /, 'MIN_ZRODEL obniżone świadomie do 5 — zmiana wymaga komentarza w tym samym commicie');
  assert.match(py, /WZOR_MARTWEJ = r"create\\s\+\(\?:or\\s\+replace\\s\+\)\?function\\s\+community_km"/);
  assert.match(py, /if re\.search\(WZOR_MARTWEJ, tresc, re\.I\):\s*\n\s*continue/);
});

test('faza 2: migracja kasuje jedyną sygnaturę, WYCOFANIE odtwarza z migawki bez EXECUTE dla anon', () => {
  const m = czytaj('supabase/migrations/20261007_kasacja_community_km.sql');
  assert.match(m, /drop function if exists public\.community_km\(\);/);
  const w = czytaj('supabase/migrations/20261007_WYCOFANIE_kasacja_community_km.sql')
    .split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');   // bez komentarzy — nagłówek MÓWI o grancie dla anon
  assert.match(w, /CREATE OR REPLACE FUNCTION public\.community_km\(\)/);
  assert.match(w, /revoke all on function public\.community_km\(\) from anon;/);
  assert.ok(!/grant\s+[^;]*\bto\s+[^;]*\banon\b/i.test(w), 'WYCOFANIE nadaje coś anonowi');
  assert.match(w, /least\(dzien\.km, 100\)/, 'ciało funkcji ma być 1:1 z migawki (cap 100 km/doba)');
});
