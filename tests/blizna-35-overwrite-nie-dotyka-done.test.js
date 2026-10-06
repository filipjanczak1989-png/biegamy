// Blizna #35 (06.10.2026) — paczka 2, błędy danych zawodników.
//
// Trzy realne rany, każda z pomiarem:
//  1. approve-training-plan przy `conflict_resolution='overwrite'` kasował przez service_role
//     WSZYSTKIE treningi w zakresie dat planu — także `done` i `missed`, czyli zapis wykonania.
//     Generator w zawodnik.html od początku kasował tylko `planned`. Ta EF była jedynym
//     miejscem w repo niszczącym historię.
//  2. `plan_source` nie było ustawiane w 7 z 11 INSERT-ów do trainings; panel „kto zaplanował"
//     dostawał NULL dla wierszy trenerskich. CHECK dopuszcza tylko 'coach' | 'generator'.
//  3. saveLog domykał plan jako `done` TYLKO przy dokładnie jednym kandydacie — przy dwóch
//     planach tego dnia (zmierzone 158 dni) log wpadał, plan wisiał. Jedno ze źródeł
//     293 wiszących `planned` z logiem tego samego dnia.
//
// ⚠️ EF to Deno z importami z esm.sh — nie da się go załadować do node. Testujemy ŹRÓDŁO
//    regexem (ta sama konwencja co tests/pb-daty.test.js). To test NAWROTU, nie zachowania:
//    pilnuje, żeby ktoś nie „uprościł" łańcucha filtrów z powrotem.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const czytaj = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const bezKomentarzy = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('1) approve-training-plan: overwrite kasuje WYŁĄCZNIE status=planned', () => {
  const src = bezKomentarzy(czytaj('supabase/functions/approve-training-plan/index.ts'));
  // jedyny DELETE na trainings w tej EF — łańcuch musi zawierać filtr statusu PRZED zakresem dat
  const m = src.match(/\.from\("trainings"\)\s*\.delete\(\)([\s\S]*?);/);
  assert.ok(m, 'w EF nie ma już DELETE na trainings — test do przepisania, nie do skasowania');
  const lancuch = m[1];
  assert.match(lancuch, /\.eq\("status",\s*"planned"\)/, 'DELETE bez .eq("status","planned") — overwrite znów kasuje done/missed');
  assert.match(lancuch, /\.gte\("date"/, 'zakres dat zniknął z DELETE');
  assert.match(lancuch, /\.lte\("date"/, 'zakres dat zniknął z DELETE');
  // licznik „nadpisane" ma liczyć to, co naprawdę skasowano
  assert.match(src, /overwritten\s*=\s*\(existingTrainings\s*\|\|\s*\[\]\)\.filter\(\(t: any\) => t\.status\s*===\s*"planned"\)\.length/,
    'overwritten liczy wszystkie istniejące, nie tylko planned — liczba w alercie trenera kłamie');
  // dni z wykonaniem są RAPORTOWANE, nie przemilczane
  assert.match(src, /zachowane_wykonane/, 'odpowiedź EF nie mówi trenerowi, które dni z done/missed zostały');
});

test('1a) dzień z done/missed = POMIŃ wstawianie, licznik pominiete_wykonane, trener widzi status (decyzja Filipa 06.10)', () => {
  const ef = bezKomentarzy(czytaj('supabase/functions/approve-training-plan/index.ts'));
  // pominięcie stoi PRZED gałęzią `skip`, więc działa dla każdego conflict_resolution
  const mPomin = /\.some\(\(t: any\) => t\.status !== "planned"\)\)\s*\{\s*pominieteWykonane\+\+;/.exec(ef);   // \s* — plik ma CRLF
  const iPomin = mPomin ? mPomin.index : -1;
  const iSkip = ef.indexOf('conflict_resolution === "skip" && conflictsByDate[w.date]');
  assert.ok(iPomin > 0, 'brak pominięcia dni z done/missed w pętli insertów');
  assert.ok(iSkip > iPomin, 'pominięcie wykonanych musi być PRZED gałęzią skip — inaczej keep_both/overwrite wstawią plan obok wykonania');
  assert.match(ef, /pominiete_wykonane:\s*pominieteWykonane/, 'odpowiedź approve nie niesie pominiete_wykonane');
  assert.match(ef, /dni_wykonane:/, 'check_conflicts nie mówi trenerowi, ile dni zostanie pominiętych');

  const tr = czytaj('trener.html');
  assert.match(tr, /\[\$\{STATUS_PL\[e\.status\]/, 'prompt konfliktu nie pokazuje statusu istniejących wierszy');
  assert.match(tr, /conflictsResp\.dni_wykonane/, 'prompt nie pokazuje liczby pomijanych dni');
  assert.match(tr, /data\.pominiete_wykonane/, 'alert po zatwierdzeniu nie mówi o pominiętych dniach');
  assert.doesNotMatch(tr, /1 = Nadpisz wszystkie \(skasuj istniejące\)/, 'stary tekst „Nadpisz wszystkie (skasuj istniejące)" kłamie — wykonane zostają');
});

test('1b) generator w zawodnik.html nadal kasuje tylko planned (punkt odniesienia)', () => {
  const src = czytaj('zawodnik.html');
  assert.match(src, /const planowane = \(istn \|\| \[\]\)\.filter\(t => t\.status === 'planned'\)/);
  assert.match(src, /\.delete\(\)\.in\('id', planowane\.map\(t => t\.id\)\)/);
});

test('2) plan_source: każdy INSERT trenera do trainings niesie "coach"; CHECK zna tylko coach|generator', () => {
  const check = czytaj('supabase/migrations/20260817_trainings_plan_source.sql');
  assert.match(check, /check \(plan_source is null or plan_source in \('coach', 'generator'\)\)/,
    'CHECK zmienił dozwolone wartości — zaktualizuj ten test ŚWIADOMIE');

  const ef = bezKomentarzy(czytaj('supabase/functions/approve-training-plan/index.ts'));
  assert.match(ef, /plan_source:\s*"coach"/, 'approve-training-plan wstawia bez plan_source');

  const trener = czytaj('trener.html');
  // kopia planu do innego zawodnika (doCopyToAthlete) i szablon tygodnia (sendTemplate)
  assert.equal((trener.match(/plan_source:\s*'coach'/g) || []).length >= 3, true,
    'trener.html ma mniej niż 3 INSERT-y z plan_source:\'coach\' (saveTr_db + doCopyToAthlete + sendTemplate)');

  const kal = czytaj('kalendarz.html');
  assert.equal((kal.match(/plan_source:\s*'coach'/g) || []).length >= 6, true,
    'kalendarz.html ma mniej niż 6 miejsc z plan_source:\'coach\' (update trenera, insert trenera, copyTraining, confirmApplyWeekTemplate, sendWeekTemplate, doCopyWeek)');

  // żaden INSERT w repo nie używa wartości spoza CHECK (np. 'self' padłoby na constraint)
  for (const f of ['trener.html', 'kalendarz.html', 'zawodnik.html', 'supabase/functions/approve-training-plan/index.ts']) {
    const zle = (czytaj(f).match(/plan_source:\s*['"](?!coach['"]|generator['"])[a-z_]+['"]/g) || []);
    assert.deepEqual(zle, [], f + ': plan_source z wartością spoza CHECK: ' + zle.join(', '));
  }
});

test('3) saveLog: przy kilku kandydatach domyka plan TEGO SAMEGO TYPU, missed nie jest kandydatem', () => {
  const src = czytaj('zawodnik.html');
  const i = src.indexOf('async function saveLog');
  assert.ok(i > 0, 'brak saveLog');
  const cialo = src.slice(i, i + 20000);
  assert.match(cialo, /\.select\('id,type,distance_km,status'\)/, 'select bez status — filtr missed nie ma na czym działać');
  assert.match(cialo, /\.limit\(5\)/, 'limit(2) wrócił — przy trzech planach drugi i trzeci są niewidoczne');
  // reguła wyboru żyje w sb.js (SSOT) i w _shared/domknij-plan.mjs — zachowanie pilnuje blizna-37 i bramka-reguly część E
  assert.match(cialo, /window\.wybierzPlanDoDomkniecia\(plannedRows, _logType\)/, 'saveLog nie używa SSOT z sb.js');
  assert.doesNotMatch(cialo, /plannedRows\.length === 1\)\s*\?\s*plannedRows\[0\]/, 'stary warunek „dokładnie jeden" wrócił');
  const sbSrc = czytaj('sb.js');
  assert.match(sbSrc, /filter\(r => r && r\.status !== 'missed'\)/, 'missed znów jest kandydatem do done (sb.js)');
});

test('3b) markDone nie wraca jako martwa gałąź', () => {
  const src = czytaj('zawodnik.html');
  assert.doesNotMatch(src, /async function markDone\(/, 'markDone wróciło — od 3803ce8 (6.05.2026) nie miało wołającego');
  assert.doesNotMatch(src, /onclick="markDone/, 'przycisk markDone wrócił bez decyzji o „zrobiłem dziś" (zasada: plan do północy)');
});
