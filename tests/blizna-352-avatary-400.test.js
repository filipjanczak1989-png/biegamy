// Blizna #352 (24.11.2026) — 5 dużych avatarów (2–8 MB) przepięte na kopie 400 px pod NOWĄ nazwą avatars/<id>.jfif.
//
// Sonda 24.11: CDN Supabase pomija query string (pierwszy nieużywany ?sonda= od razu HIT), więc ?t= w avatar_url nie
// odświeża CDN; świeżość daje tylko nowa ścieżka. Stąd:
//  - kopia pod nową nazwą, z rozszerzeniem, którego aplikacja nie zapisze (policy: jpg/jpeg/png/webp), więc nowe wgranie
//    użytkownika nigdy nie nadpisze kopii z rocznym Cache-Control;
//  - wgrania z aplikacji ZOSTAJĄ przy domyślnym max-age (upsert pod tą samą ścieżką + rok cache = stary avatar w CDN);
//  - delete-account kasuje każdy avatars/<id>.<ext> konta, nie tylko wskazany (stare pliki zostają w kubełku do decyzji).
// Migracja i wycofanie: bez identyfikatorów, sprawdzane tools/avatary-400-test.sh w wycofanej transakcji.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '');
const MIG = 'supabase/migrations/20261226_avatary_400.sql';
const WYC = 'supabase/migrations/20261226_WYCOFANIE_avatary_400.sql';

test('(1) delete-account: wszystkie avatary konta z folderu avatars/ (lista po id), przed RPC, ten sam filtr własności', async () => {
  const s = czytaj('supabase/functions/delete-account/index.ts');
  const od = s.indexOf('  if (athleteId) {\n    const { data: avatary }');
  const doK = s.indexOf('\n  }\n', s.indexOf('objects.push({ bucket: \'biegamy-assets\', path: p });', od)) + 4;
  assert.ok(od > 0 && doK > od, 'brak bloku listy avatarów w delete-account');
  assert.ok(od < s.indexOf("userClient.rpc('delete_my_account')"), 'lista avatarów PRZED rpc (po rpc konto już nie istnieje)');
  const filtr = s.slice(s.indexOf('const nalezyDoKonta = (path: string) =>'), s.indexOf('const objects = refs')).replace(': string', '');
  const zapytania = [];
  const ctx = {
    athleteId: 'A1', uid: 'U1',
    objects: [{ bucket: 'biegamy-assets', path: 'avatars/A1.jfif' }],
    admin: { storage: { from: (b) => ({ list: async (folder, o) => { zapytania.push([b, folder, o]); return { data: [
      { name: 'A1.jpg' }, { name: 'A1.jfif' }, { name: 'A1.jpeg' }, { name: 'A1.PNG' }, { name: 'A1x.png' }, { name: 'A1.jpg.bak.x' }] }; } }) } },
  };
  vm.runInNewContext(filtr + '\nthis.wynik = (async () => {\n' + s.slice(od, doK) + '\n})();', ctx);
  await ctx.wynik;
  assert.deepEqual(JSON.parse(JSON.stringify(zapytania)), [['biegamy-assets', 'avatars', { search: 'A1', limit: 100 }]]);   // obiekty z vm: inny realm
  assert.deepEqual(ctx.objects.map((o) => o.path), ['avatars/A1.jfif', 'avatars/A1.jpg', 'avatars/A1.jpeg', 'avatars/A1.PNG'],
    'oryginał, kopia i stare rozszerzenia; bez A1x.png (inne konto) i bez dziwnej nazwy; bez duplikatu wskazanego');
  ctx.objects = []; ctx.athleteId = null;
  vm.runInNewContext('this.wynik = (async () => {\n' + s.slice(od, doK) + '\n})();', ctx);
  await ctx.wynik;
  assert.equal(zapytania.length, 1, 'bez athleteId (trener bez profilu zawodnika) nic nie listuje');
});

test('(2) migracja i wycofanie: bez identyfikatorów i adresów, trzy stany (pusta / już / 5 z 5) + odmowa częściowego, komunikat jako wiersz', () => {
  const m = czytaj(MIG), w = czytaj(WYC), sh = czytaj('tools/avatary-400-test.sh'), t = czytaj('tools/avatary-400-test.sql');
  const st = czytaj('tools/avatary-400-test-stany.sql');
  for (const [n, x] of [[MIG, m], [WYC, w], ['test.sql', t], ['test-stany.sql', st]]) {
    assert.doesNotMatch(x, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, n + ': UUID w pliku');
    assert.doesNotMatch(x, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/, n + ': adres e-mail w pliku');
  }
  assert.match(m, /if v_duze = 0 and v_kopie = 0 then\n\s*insert into _avatary_400_wynik values \('avatary 400: brak dużych avatarów i kopii \.jfif[^']*'\);\n\s*return;/,
    'pusta baza (projekt testowy, odtwarzanie od zera): bez zmian i komunikat, bez wyjątku');
  assert.match(m, /if v_duze = 0 and v_juz = 5 and v_kopie = 5 then\n\s*insert into _avatary_400_wynik values \('avatary 400: już przepięte[^']*'\);\n\s*return;/);
  assert.match(m, /if not \(v_duze = 5 and v_par = 5 and v_kopie = 5 and v_juz = 0\) then\n\s*raise exception 'avatary 400 \[odmowa %\/%\/%\/%\]: stan częściowy/);
  for (const [n, x] of [[MIG, m], [WYC, w]]) {
    assert.match(x, /\nselect komunikat from _avatary_400_wynik;\ncommit;\n$/, n + ': komunikat jako wiersz wyniku tuż przed commit');
    assert.doesNotMatch(x, /^\s*raise notice/m, n + ': supabase db query nie pokazuje raise notice');
    assert.doesNotMatch(x, /\bdrop table\b/i, n + ': tabele tymczasowe on commit drop');
  }
  assert.match(sh, /# \(3\)\n.*PUSTA/); assert.match(sh, /# \(4\)\n.*CZESCIOWA/); assert.match(sh, /\\\[odmowa 5\/3\/3\/0\\\]/);
  assert.match(m, /m\.name = 'avatars\/' \|\| a\.id::text \|\| '\.jfif'/);
  assert.match(m, /m\.metadata->>'cacheControl' = 'max-age=31536000'/);
  assert.match(m, /replace\(a\.avatar_url, '\/biegamy-assets\/' \|\| p\.stara \|\| '\?', '\/biegamy-assets\/' \|\| p\.nowa \|\| '\?'\)/);
  assert.match(w, /replace\(a\.avatar_url, '\/biegamy-assets\/' \|\| p\.nowa \|\| '\?', '\/biegamy-assets\/' \|\| p\.stara \|\| '\?'\)/);
  assert.doesNotMatch(m + w, /delete from storage|storage\.objects set|remove\(/i, 'migracja nie rusza plików');
  assert.match(sh, /20261226_avatary_400\.sql/); assert.match(sh, /20261226_WYCOFANIE_avatary_400\.sql/);
  assert.match(sh, /echo 'rollback;'/); assert.doesNotMatch(sh, /echo 'commit;'/);
  assert.match(t, /-- @@MIGRACJA@@/); assert.match(t, /-- @@WYCOFANIE@@/);
});

test('(3) .jfif poza listą rozszerzeń policy wgrywania (inaczej wgranie użytkownika mogłoby nadpisać kopię z rocznym cache)', () => {
  const p = czytaj('supabase/migrations/20260802000000_biegamy_assets_policy.sql');
  const listy = p.match(/IN \('jpg','jpeg','png','webp'\)/g) || [];
  assert.equal(listy.length, 3, 'policy insert i update (USING + WITH CHECK) z tą samą listą');
  assert.doesNotMatch(p, /jfif/);
});

test('(4) wgrania avatara z aplikacji: ?t= zostaje, BEZ rocznego cacheControl (upsert pod tą samą ścieżką, CDN pomija ?t=)', () => {
  for (const [f, ile] of [['zawodnik.html', 2], ['profil.html', 1]]) {
    const s = czytaj(f);
    const wgrania = s.match(/(?:storageUploadRetry\('biegamy-assets', |from\('biegamy-assets'\)\.upload\()path, [^)]*\)/g) || [];
    assert.equal(wgrania.length, ile, f + ': liczba wgrań avatara (test nie może przejść na pusto)');
    assert.equal((s.match(/publicUrl \+ '\?t=' \+ Date\.now\(\)/g) || []).length, ile, f + ': avatar_url bez ?t=');
    for (const w of wgrania) {
      assert.match(w, /upsert: ?true/);
      assert.doesNotMatch(w, /cacheControl/, f + ': roczny cache przy upsert pod tą samą ścieżką → stary avatar w CDN');
    }
  }
});
