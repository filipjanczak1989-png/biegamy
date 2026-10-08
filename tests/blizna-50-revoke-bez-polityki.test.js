// Blizna #50 (08.10.2026) — granty INSERT/UPDATE dla authenticated bez polityki RLS (backlog paki 4, 27 par).
//
// 26 par zdejmuje 20261008_revoke_insert_update_bez_polityki.sql; race_signups:UPDATE ZOSTAJE (front robi
// upsert DO UPDATE — wymaga UPDATE przy każdym wykonaniu). Test pilnuje, że revoke nie złamie zapisu, który
// dziś działa: (1) upsert odznak musi zostać ignoreDuplicates (DO NOTHING = tylko INSERT), (2) każdy zapis
// do tych tabel w Edge Functions idzie klientem service_role BEZ nagłówka Authorization użytkownika
// (klient z JWT usera działa jako authenticated — po revoke dostałby 42501).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '');
const MIG = czytaj('supabase/migrations/20261008_revoke_insert_update_bez_polityki.sql');
const WYC = czytaj('supabase/migrations/20261008_WYCOFANIE_revoke_insert_update_bez_polityki.sql');
const KONTROLA = czytaj('tools/kontrola-revoke-bez-polityki.sql');

const pary = (sql, slowo, kier) => {
  const out = [];
  const re = new RegExp('^' + slowo + ' ([a-z, ]+) on public\\.([a-z_]+) ' + kier + ' authenticated;', 'gm');
  let m;
  while ((m = re.exec(sql))) for (const p of m[1].split(',').map((x) => x.trim().toUpperCase())) out.push(m[2] + ':' + p);
  return out.sort();
};
const ZDJETE = pary(MIG, 'revoke', 'from');

test('migracja zdejmuje 26 par, NIE race_signups:UPDATE; wycofanie jest lustrem; brak czegokolwiek dla anon', () => {
  assert.equal(ZDJETE.length, 26, ZDJETE.join(' '));
  assert.ok(!ZDJETE.includes('race_signups:UPDATE'), 'race_signups:UPDATE ma zostać (upsert DO UPDATE z frontu)');
  assert.deepEqual(pary(WYC, 'grant', 'to'), ZDJETE, 'wycofanie przywraca dokładnie to, co zdjęto');
  assert.match(MIG, /^begin;$/m); assert.match(MIG, /^commit;$/m);
  assert.doesNotMatch(MIG + WYC, /\banon\b/i, 'żadnych zmian dla anon');
  assert.match(KONTROLA, /not in \('race_signups:UPDATE'\)/, 'kontrola: jawny wyjątek tylko dla race_signups:UPDATE');
  assert.match(KONTROLA, /has_any_column_privilege\('authenticated'/, 'kontrola łapie też granty kolumnowe (LEKCJE #23)');
});

test('front: jedyny zapis do zdejmowanych par to upsert odznak z ignoreDuplicates (ON CONFLICT DO NOTHING)', () => {
  const { zwiad } = require('../tools/zwiad-zapisy-bez-polityki.js');
  const front = zwiad(ZDJETE).flatMap((x) => x.trafienia.filter((t) => t.rodzaj === 'front').map((t) => ({ ...t, para: x.para })));
  assert.deepEqual(front.map((t) => t.para + ' ' + t.plik + ' .' + t.metoda), ['achievements:UPDATE zawodnik.html .upsert'],
    'nowy zapis z frontu do pary bez polityki — po revoke dostanie 42501');
  const z = czytaj('zawodnik.html');
  const ogon = z.slice(z.indexOf("sb.from('achievements')", z.indexOf('const { data: wstawione, error }')), z.indexOf("sb.from('achievements')", z.indexOf('const { data: wstawione, error }')) + 300);
  assert.match(ogon, /ignoreDuplicates: true/, 'BEZ ignoreDuplicates upsert = DO UPDATE → wymaga UPDATE, który zdejmujemy');
});

test('Edge Functions: każdy zapis do zdejmowanych par idzie klientem service_role bez Authorization usera', () => {
  const { zwiad } = require('../tools/zwiad-zapisy-bez-polityki.js');
  const ef = zwiad(ZDJETE).flatMap((x) => x.trafienia.filter((t) => t.rodzaj === 'ef'));
  assert.ok(ef.length >= 5, 'za mało trafień EF — narzędzie przestało działać? ' + ef.length);
  for (const t of ef) {
    const tekst = czytaj(t.plik);
    const linie = tekst.split('\n');
    const startLinii = linie.slice(0, t.linia - 1).join('\n').length + (t.linia > 1 ? 1 : 0);
    const idx = tekst.indexOf('.from(', startLinii);
    const m = tekst.slice(0, idx).match(/([A-Za-z_$][\w$]*)\s*$/);   // identyfikator tuż przed .from( (łańcuch może iść przez linie)
    const zmienna = m && m[1];
    assert.ok(zmienna, t.plik + ':' + t.linia + ' — nie ustalono klienta');
    const def = tekst.match(new RegExp('(?:const|let)\\s+' + zmienna.replace(/\$/g, '\\$') + '\\s*=\\s*createClient\\(([^;]*?)\\);'));
    assert.ok(def, t.plik + ':' + t.linia + ' — klient „' + zmienna + '" bez createClient w pliku');
    assert.match(def[1], /SERVICE|SVCKEY/, t.plik + ':' + t.linia + ' — klient „' + zmienna + '" nie jest service_role');
    assert.doesNotMatch(def[1], /Authorization/, t.plik + ':' + t.linia + ' — klient „' + zmienna + '" niesie JWT usera = authenticated');
  }
});
