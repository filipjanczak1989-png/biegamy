/* BLIZNA 204 / DANE OSÓB W PUBLICZNYM REPO (Filip 9.11, po analizie „Miasto Dobra”).
   9.11 do main weszła migracja z kwotą wpłaty darczyńcy w komentarzu; starsze migracje miały e-maile i UUID kont organizatora
   oraz tajny cel wyprawy. Wariant (a): pliki poprawione bez przepisywania historii, wartości w notatce Filipa poza repo,
   a bramka commitów (tools/bramka-commit.js + tools/bramka-dane-osob.js) blokuje nowe takie wpisy w hooku i w CI, bez trailera.
   Test nie powtarza żadnej z usuniętych wartości (inaczej sam byłby wyciekiem). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const D = require('../tools/bramka-dane-osob.js');
const POPRAWIONE = ['supabase/migrations/20261102_akcje.sql', 'supabase/migrations/20261102_akcje_startujacy_poprawka.sql',
  'supabase/migrations/20261102_WYCOFANIE_akcje_startujacy_poprawka.sql', 'supabase/migrations/20261104_akcja_wyprawa.sql',
  'supabase/migrations/20261109_akcja_po_starcie.sql', 'tools/akcja-wyprawa-test.sql'];

test('poprawione pliki: zero e-maili, kwot przy imionach i UUID kont (ta sama reguła co bramka)', () => {
  for (const p of POPRAWIONE) assert.deepEqual(D.sprawdzPlik(p, czytaj(p).split('\n')).map((t) => t.regula + ':' + t.nr), [], p);
});

test('konta: rola zamiast wartości, placeholder celowo psuje ponowne uruchomienie; ostrzeżenie w nagłówku', () => {
  const a = czytaj('supabase/migrations/20261102_akcje.sql');
  assert.match(a, /array\['<KONTO TESTOWE PRÓBY: wartość poza repo>'::uuid\]/);
  assert.match(a, /and t\.id = '<KONTO STARTUJĄCE: wartość poza repo>';/);
  assert.match(a, /-- startujący: konto startujące \(prowadzący akcję\)/);
  for (const p of POPRAWIONE.slice(0, 3)) {
    const t = czytaj(p);
    assert.match(t, /e-maile i UUID kont usunięte z repo/, p);
    assert.match(t, /tego pliku NIE uruchamiać ponownie/, p);
    assert.doesNotMatch(t, /@[a-z0-9-]+\.[a-z]{2,}/i, p + ': bez adresów e-mail');
  }
  const pop = czytaj('supabase/migrations/20261102_akcje_startujacy_poprawka.sql');
  assert.match(pop, /declare v_glowny constant uuid := '<KONTO STARTUJĄCE: wartość poza repo>';/);
  assert.match(pop, /--   konto startujące \(główne konto Filipa\) — w coaches,/);
  assert.doesNotMatch(pop, /[0-9a-f]{8}-…/, 'bez skrótów UUID w opisie');
});

test('cel wyprawy: w migracji tylko placeholder (za długi na CHECK, km nie-liczba), strażnik bez km; test SQL porównuje z bazą', () => {
  const w = czytaj('supabase/migrations/20261104_akcja_wyprawa.sql');
  const nazwy = [...w.matchAll(/wyprawa_cel_nazwa = '([^']*)'/g)].map((m) => m[1]);
  assert.ok(nazwy.length >= 1 && nazwy.every((n) => n.startsWith('<CEL WYPRAWY: ustawiony ręcznie') && n.length > 60), 'jedyna wartość celu to placeholder (CHECK do 60 znaków go odrzuci)');
  assert.match(w, /wyprawa_cel_km = '<km celu: ustawione ręcznie, poza repo>'::numeric/);
  assert.match(w, /where wyprawa_cel_nazwa is not null and wyprawa_cel_km is not null\) < 2/);
  assert.doesNotMatch(w.replace(/<[^>]*>/g, ''), /wyprawa_cel_km\s*=\s*\d/, 'km celu nie stoi w pliku');
  const t = czytaj('tools/akcja-wyprawa-test.sql');
  assert.match(t, /is distinct from \(select wyprawa_cel_nazwa from public\.akcje where slug = 'dla-fabianka'\)/);
  assert.match(t, /is distinct from \(select wyprawa_cel_nazwa from public\.akcje where slug = 'proba'\)/);
  assert.doesNotMatch(t, /wyprawa_cel_nazwa' <> '/, 'test nie porównuje z wpisaną nazwą');
  for (const f of ['FAIL 1e', 'FAIL 2b']) assert.ok(t.includes(f), f);
});

test('wpis darczyńcy: bez kwoty i bez minuty; reszta migracji (po id wiersza) bez zmian', () => {
  const m = czytaj('supabase/migrations/20261109_akcja_po_starcie.sql');
  assert.match(m, /--   Wpis Patryka w murze dla-fabianka: złota cegła \(decyzja Filipa\)\./);
  assert.match(m, /-- Wpis Patryka — po id wpisu;/);
  for (const l of m.split('\n').filter((x) => /Patryk/i.test(x))) assert.doesNotMatch(l, /\d\s?(zł|PLN)|\d{1,2}:\d{2}/, 'przy wpisie darczyńcy ani kwoty, ani godziny: ' + l.slice(0, 60));
  assert.match(m, /update public\.akcja_cegielki set zlota = true where id = '[0-9a-f-]{36}' and akcja_slug = 'dla-fabianka';/, 'po id wiersza, jak było');
});

test('bramka: samokontrola zielona (hook i CI), reguła wpięta jako twarda i bez wyjątku na trailer', () => {
  const out = execFileSync(process.execPath, [path.join(KORZEN, 'tools/bramka-commit.js'), '--samokontrola'], { encoding: 'utf8' });
  assert.match(out, /12\) DANE OSÓB/);
  assert.match(out, /Bramka blokuje to, co trzeba, i przepuszcza resztę\./);
  assert.doesNotMatch(out, /✖/);
  const b = czytaj('tools/bramka-commit.js');
  assert.match(b, /for \(const t of DANE_OSOB\.sprawdzDodane\(zmiana\.wPlikach\)\) \{\n\s+blokady\.push\(\{ gdzie: t\.plik \+ ' \(dodana linia ' \+ t\.nr \+ ' w tym pliku\)', opis: 'dane osoby: ' \+ t\.regula, ciBlokada: true, daneOsob: true,/);
  assert.match(b, /return \{ pliki, dodane, wPlikach: dodaneWPlikach\(diff\) \};[\s\S]*return \{ pliki, dodane, wPlikach: dodaneWPlikach\(diff\) \};/, 'hook i CI (zakres) czytają pliki');
  const { dodaneWPlikach } = require('../tools/bramka-commit.js');
  assert.deepEqual(dodaneWPlikach('diff --git a/x.sql b/x.sql\n--- a/x.sql\n+++ b/x.sql\n@@ -1 +1 @@\n-stare\n+nowe\r\n+++ b/usuniety\n'), [{ plik: 'x.sql', linie: ['nowe'] }, { plik: 'usuniety', linie: [] }].filter((x) => x.linie.length));
});

test('reguła: kształt, nie sens — granice opisane i sprawdzone', () => {
  const T = (plik, l) => D.sprawdzPlik(plik, [l]).map((x) => x.regula);
  assert.deepEqual(T('a.sql', '-- ' + 'Zosia' + ' wpłaciła 2' + '00 zł'), ['kwota w zł przy imieniu']);
  assert.deepEqual(T('a.sql', '-- ' + 'Bogumiła' + ' wpłaciła 2' + '00 zł'), [], 'GRANICA: imię spoza listy przy kwocie przechodzi');
  assert.deepEqual(T('a.sql', '-- cel: ' + 'Kraków'), [], 'GRANICA: nazwa miejsca (np. tajny cel) przechodzi — to pilnuje przegląd, nie bramka');
  assert.deepEqual(T('a.md', 'kontakt ' + 'jan' + '@' + 'wp.pl'), [], 'pliki .md poza regułą (dokumentacja)');
  assert.deepEqual(T('a.sql', '-- ' + 'jan' + '@' + 'wp.pl'), ['adres e-mail'], 'krótka prawdziwa domena (wp.pl) to nie atrapa');
  assert.ok(D.atrapaUuid('00000000-0000-0000-0000-000000000000') && D.atrapaUuid('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
  assert.ok(!D.atrapaUuid('5609' + '2926-2cf1-44b6-952f-38614497fdc2'));
});
