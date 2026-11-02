#!/usr/bin/env node
/* MIGAWKA STARTUJĄCYCH AKCJI (projekt F, 2.11.2026) — fakty z produkcji o kontach, które naciskają guzik
   i liczą się w próbie. Plik: supabase/schema/akcje/startujacy.json. Czyta go blizna-97 (test na zrzucie,
   NIE na żywo — w CI nie ma i nie ma być klucza do produkcji).

   Po co: 2.11 startującym było konto testowe, a konto testowe próby było głównym kontem Filipa — wybrane po
   e-mailu, nie po faktach. Guzik odmówił Filipowi. Migawka zapisuje to, po czym konto się rozpoznaje:
   wpis w coaches, liczba zawodników, ostatnie logowanie. Bez e-maili.

   Użycie:
     node tools/akcje-migawka.js --zrzut   ← nadpisuje migawkę stanem produkcji
     node tools/akcje-migawka.js           ← porównuje migawkę z produkcją (kod 1 przy różnicy) */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const KORZEN = path.join(__dirname, '..');
const PLIK = path.join(KORZEN, 'supabase', 'schema', 'akcje', 'startujacy.json');
const WORKDIR = process.env.BM_SB_WORKDIR || path.join(process.env.USERPROFILE || process.env.HOME || '', '.cache', 'sb-audit');

const Q = `
select a.slug, 'startujacy' as rola, s.athlete_id::text as athlete_id,
       exists (select 1 from public.coaches c where c.id = t.user_id) as w_coaches,
       (select count(*) from public.athletes z where z.coach_id = t.user_id)::int as zawodnikow,
       u.last_sign_in_at
  from public.akcje a
  join public.akcja_startujacy s on s.akcja_id = a.id
  join public.athletes t on t.id = s.athlete_id
  left join auth.users u on u.id = t.user_id
union all
select a.slug, 'konto_testowe', k::text,
       exists (select 1 from public.coaches c where c.id = t.user_id),
       (select count(*) from public.athletes z where z.coach_id = t.user_id)::int,
       u.last_sign_in_at
  from public.akcje a
  cross join lateral unnest(coalesce(a.konta_testowe, '{}'::uuid[])) k
  left join public.athletes t on t.id = k
  left join auth.users u on u.id = t.user_id
 order by 1, 2, 3;`;

function zapytaj(sql) {
  const tmp = path.join(require('os').tmpdir(), 'bm-akcje-' + process.pid + '.sql');
  fs.writeFileSync(tmp, sql, 'utf8');
  try {
    const out = execFileSync('supabase', ['db', 'query', '--linked', '--workdir', WORKDIR, '-o', 'json', '-f', tmp],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(out.slice(out.indexOf('{'))).rows;
  } catch (e) {
    console.error('\n  Nie udało się odpytać bazy (supabase w PATH? workdir zlinkowany: ' + WORKDIR + ')\n');
    process.exit(2);
  } finally { try { fs.unlinkSync(tmp); } catch (_) {} }
}

const wiersze = zapytaj(Q).map((r) => ({
  slug: r.slug, rola: r.rola, athlete_id: r.athlete_id, w_coaches: !!r.w_coaches,
  zawodnikow: Number(r.zawodnikow || 0), last_sign_in_at: r.last_sign_in_at || null,
}));

if (process.argv.includes('--zrzut')) {
  fs.mkdirSync(path.dirname(PLIK), { recursive: true });
  const migawka = { opis: 'Zrzut z produkcji (tools/akcje-migawka.js --zrzut). NIE migracja. Bez e-maili.',
    zrzut_at: new Date().toISOString(), wiersze };
  fs.writeFileSync(PLIK, JSON.stringify(migawka, null, 2) + '\n', 'utf8');
  console.log(`\n  Zrzucono ${wiersze.length} wierszy do ${path.relative(KORZEN, PLIK)}\n`);
  process.exit(0);
}

const stara = JSON.parse(fs.readFileSync(PLIK, 'utf8')).wiersze;
const klucz = (w) => [w.slug, w.rola, w.athlete_id, w.w_coaches].join('|');
const a = new Set(stara.map(klucz)), b = new Set(wiersze.map(klucz));
const roznice = [...a].filter((k) => !b.has(k)).map((k) => '- ' + k).concat([...b].filter((k) => !a.has(k)).map((k) => '+ ' + k));
console.log(roznice.length ? '\n  RÓŻNICE (migawka → produkcja):\n  ' + roznice.join('\n  ') + '\n' : '\n  Zgodne.\n');
process.exit(roznice.length ? 1 : 0);
