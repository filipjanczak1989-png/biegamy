/* BLIZNA 325 (20.11.2026) — zamek na athletes.coach_id (migracja 20261222, K2 krok M2). Pilnuje w repo tego, czego test po skutku nie zobaczy
   przed wdrożeniem: wyzwalacz BEFORE INSERT OR UPDATE OF coach_id, funkcja BEZ security definer (sprawdza current_user — jako definer
   widziałaby właściciela i przepuszczała każdego), role authenticated/anon tylko bez zmian albo NULL, wykonanie funkcji odebrane przeglądarce,
   WYCOFANIE zdejmuje oba obiekty i nie rusza danych, test po skutku podpięty z flagą. Do tego: żadna strona nie zapisuje coach_id ≠ NULL
   wprost do athletes (dosłowny obiekt w update/insert/upsert). Frazy SQL sklejane z kawałków: bramka commitu czyta dodane linie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const MIG = czytaj('supabase/migrations/20261222_athletes_coach_id_zamek.sql');
const WYC = czytaj('supabase/migrations/20261222_WYCOFANIE_athletes_coach_id_zamek.sql');
const SH = czytaj('tools/coach-id-zamek-test.sh');
const SQL = czytaj('tools/coach-id-zamek-test.sql');
const ODBIERZ = 're' + 'voke all on ', ZDEJMIJ = 'dr' + 'op ', DEFINER = 'security ' + 'definer';

test('migracja 20261222: wyzwalacz BEFORE INSERT OR UPDATE OF coach_id na athletes, funkcja bez definera ze stałą search_path', () => {
  assert.match(MIG, /create trigger athletes_coach_id_zamek\n  before insert or update of coach_id on public\.athletes\n  for each row execute function public\.athletes_coach_id_zamek\(\);/);
  const i = MIG.indexOf('create function public.athletes_coach_id_zamek()');
  assert.ok(i > 0);
  const naglowek = MIG.slice(i, MIG.indexOf('$function$', i));
  assert.ok(!naglowek.includes(DEFINER), 'funkcja zamka nie może być ' + DEFINER);
  assert.match(naglowek, /set search_path to 'public', 'pg_temp'/);
  assert.ok(MIG.includes(ODBIERZ + 'function public.athletes_coach_id_zamek() from public, anon, authenticated;'));
});

test('migracja 20261222: authenticated/anon tylko bez zmian albo NULL; reszta ról przechodzi; odrzucenie 42501', () => {
  const cialo = MIG.slice(MIG.indexOf('as $function$'), MIG.lastIndexOf('$function$'));
  assert.ok(cialo.includes("if current_user not in ('authenticated', 'anon') then return new; end if;"));
  assert.ok(cialo.includes('if new.coach_id is null then return new; end if;'));
  assert.ok(cialo.includes("if tg_op = 'UPDATE' and new.coach_id is not distinct from old.coach_id then return new; end if;"));
  assert.match(cialo, /raise exception 'Trenera nie ustawia się wprost[^']*' using errcode = '42501';/);
  assert.doesNotMatch(MIG, /\b(update|insert into|delete from)\s+public\.athletes\b/i, 'migracja nie zmienia danych');
  assert.match(MIG, /to_regprocedure\('public\.rozpatrz_prosbe\(uuid, boolean\)'\) is null/, 'strażnik: najpierw 20261221');
});

test('WYCOFANIE 20261222: zdejmuje wyzwalacz i funkcję, ze strażnikiem, bez zmian danych', () => {
  assert.ok(WYC.includes(ZDEJMIJ + 'trigger athletes_coach_id_zamek on public.athletes;'));
  assert.ok(WYC.includes(ZDEJMIJ + 'function public.athletes_coach_id_zamek();'));
  assert.ok(WYC.indexOf(ZDEJMIJ + 'trigger') < WYC.indexOf(ZDEJMIJ + 'function'), 'wyzwalacz przed funkcją');
  assert.match(WYC, /tgname = 'athletes_coach_id_zamek'/);
  assert.doesNotMatch(WYC, /\b(update|insert into|delete from)\s+public\.athletes\b/i);
});

test('test po skutku: flaga, migracja, strażnik przypisań, wszystkie drogi (UPDATE, INSERT, NULL, prośba, ankieta, service_role)', () => {
  assert.ok(SH.includes('COACH_ID_ZAMEK_Z_MIGRACJA') && SH.includes('supabase/migrations/20261222_athletes_coach_id_zamek.sql'));
  assert.ok(SH.includes('create temp table _coach_przed as select id, coach_id from public.athletes;') && SH.includes("echo 'rollback;'"));
  for (const w of ["raise exception 'TESTY ZAMKA COACH_ID ZIELONE: % sprawdzeń (przypisań przed testem: %)', n, przed;", 'public.rozpatrz_prosbe(p, true)',
    'public.accept_intake_form(f)', "set local role service_role", "FAIL 2e: INSERT z trenerem przeszedł", "if sqlerrm not like 'Trenera nie ustawia się wprost%'", '@example.invalid'])
    assert.ok(SQL.includes(w), 'test bez: ' + w);
  /* user_id (20.11, „nie jest dziurą” na produkcji): przestawienie wiersza na inne konto odpada na RLS — test ma tego pilnować */
  assert.ok(SQL.includes("update public.athletes set user_id = u_cel where id = a_id;") && SQL.includes("if sqlerrm not like 'new row violates row-level security policy%'")
    && SQL.includes('FAIL 2i: zmienił się user_id wiersza A'));
});

function zapisyTreneraWprost(s) {
  const zle = [];
  for (const m of s.matchAll(/from\(\s*['"]athletes['"]\s*\)[\s\S]{0,60}?\.(?:update|insert|upsert)\(\s*\{([\s\S]{0,600}?)\}\s*\)/g)) {
    const w = /(?:^|[,{\s])coach_id\s*:\s*([^,}\n]+)/.exec(m[1]);
    if (w && w[1].trim() !== 'null') zle.push(m[0].replace(/\s+/g, ' ').slice(0, 120));
  }
  return zle;
}

test('żadna strona nie zapisuje do athletes dosłownego coach_id innego niż NULL', () => {
  const pliki = fs.readdirSync(KORZEN).filter((f) => /\.html$/.test(f))
    .concat(fs.readdirSync(path.join(KORZEN, 'js')).filter((f) => /\.m?js$/.test(f)).map((f) => 'js/' + f));
  const zle = pliki.flatMap((p) => zapisyTreneraWprost(czytaj(p)).map((z) => p + ': ' + z));
  assert.deepEqual(zle, []);
  assert.ok(pliki.length > 20, 'skan objął strony');
});

test('samokontrola skanera: dawne zapisy trenera są łapane, NULL i inne tabele nie', () => {
  assert.equal(zapisyTreneraWprost("await sb.from('athletes').update({ coach_id: _changeCoachId }).eq('id', x);").length, 1);
  assert.equal(zapisyTreneraWprost("await sb.from('athletes').insert({\n    coach_id: _coachId,\n    full_name: name\n  });").length, 1);
  assert.equal(zapisyTreneraWprost("await sb.from('athletes').update({ coach_id: null }).eq('id', x);").length, 0);
  assert.equal(zapisyTreneraWprost("await sb.from('trainings').insert({ coach_id: user.id });").length, 0);
});
