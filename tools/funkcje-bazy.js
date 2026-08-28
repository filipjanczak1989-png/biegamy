#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// MIGAWKA FUNKCJI BAZY — zrzut z produkcji do repo i porównanie
//
// ⚠️ PO CO TO ISTNIEJE. Zmierzone 28.08.2026: w schemacie `public` żyją 43
// funkcje, a `supabase/migrations/` opisuje **osiem**. Pozostałe 33 nie mają
// w repo definicji NIGDZIE. Przyczyna nie jest niedopatrzeniem: projekt nigdy
// nie używał śledzonych migracji (nie ma `supabase_migrations.schema_migrations`,
// są tylko wewnętrzne tabele `realtime`/`auth`/`storage`). Pliki w
// `migrations/` są DOKUMENTACJĄ PISANĄ OBOK, nie historią, z której cokolwiek
// się wykonuje — a wszyscy traktowali je jak stan bazy. Patrz .ai/LEKCJE.md #17.
//
// ⚠️ KIERUNEK ROZJAZDU JEST ODWROTNY DO INTUICJI: to PRODUKCJA jest nowsza.
// `trigger_detect_moment` ma na produkcji poprawkę burstu z 5.08.2026
// (statement-level + dedup), a repo — starszą wersję row-level. Odtworzenie
// bazy z migracji COFNĘŁOBY tę poprawkę. Dlatego migawka powstaje ZANIM
// ktokolwiek zacznie „porządkować".
//
// Uruchomienie:
//   node tools/funkcje-bazy.js --zrzut     ← nadpisuje migawkę stanem produkcji
//   node tools/funkcje-bazy.js             ← porównuje migawkę z produkcją
//
// ⚠️ NARZĘDZIE JEST LOKALNE, NIE W CI — świadomie. Sprawdzanie bazy w CI
// wymagałoby wpuszczenia tam poświadczeń do produkcji, co zmienia CI w cel
// ataku; to zmiana o innej wadze niż sama bramka (decyzja Filipa 29.08.2026).
// Każdą migrację i tak wykonuje człowiek przez CLI, więc przypominajka
// w tym samym miejscu wystarcza.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const KORZEN = path.join(__dirname, '..');
const KATALOG = path.join(KORZEN, 'supabase', 'schema', 'funkcje');
const PLIK_SUM = path.join(KATALOG, 'SUMY.txt');

/* Workdir CLI jest poza repo świadomie: `supabase link` śmieci `config.toml`,
   a repo jest publiczne (GH Pages). Patrz pamięć: project_db_sql_access. */
const WORKDIR = process.env.BM_SB_WORKDIR ||
  path.join(process.env.USERPROFILE || process.env.HOME || '', '.cache', 'sb-audit');

const ZAPYTANIE = `
select p.proname as nazwa, pg_get_functiondef(p.oid) as tresc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind in ('f','p')
order by p.proname;
`;

/* ⚠️ SUMA LICZONA Z POSTACI ZNORMALIZOWANEJ, nie z surowego
   `pg_get_functiondef`. Ten ostatni FORMATUJE wynik, więc upgrade Postgresa
   potrafi zmienić białe znaki bez zmiany kodu — surowa suma dawałaby wtedy
   fałszywy alarm, a bramka, która krzyczy bez powodu, przestaje być czytana.
   Komentarze ZOSTAJĄ w porównaniu: różnica w komentarzu też jest rozjazdem
   repo↔baza i chcemy ją widzieć (tak wyszedł `trigger_send_push`). */
function normalizuj(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
}

function suma(s) {
  return require('crypto').createHash('sha256').update(normalizuj(s), 'utf8').digest('hex').slice(0, 16);
}

/* ⚠️ TRIGGERY SĄ CZĘŚCIĄ MIGAWKI, NIE DODATKIEM. Poprawka burstu z 5.08 siedzi
   POŁOWICZNIE w definicji triggera: `REFERENCING NEW TABLE AS nowe FOR EACH
   STATEMENT`. Sama funkcja bez tego jest martwa — `SELECT … FROM nowe` nie ma
   skąd wziąć tabeli. Migawka wyłącznie funkcji byłaby więc niepełna dokładnie
   w tym przypadku, który ją wywołał. */
const ZAPYTANIE_TRG = `
select c.relname || '.' || t.tgname as nazwa, pg_get_triggerdef(t.oid) as tresc
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and n.nspname = 'public'
order by 1;
`;

function zapytaj(sql, etykieta) {
  const tmp = path.join(require('os').tmpdir(), 'bm-' + etykieta + '-' + process.pid + '.sql');
  fs.writeFileSync(tmp, sql, 'utf8');
  let out;
  try {
    out = execFileSync('supabase',
      ['db', 'query', '--linked', '--workdir', WORKDIR, '-o', 'json', '-f', tmp],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    console.error('\n  Nie udało się odpytać bazy.');
    console.error('  Sprawdź: czy `supabase` jest w PATH i czy workdir jest zlinkowany:');
    console.error('    ' + WORKDIR);
    console.error('  (workdir można wskazać zmienną BM_SB_WORKDIR)\n');
    process.exit(2);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
  const i = out.indexOf('{');
  const dane = JSON.parse(out.slice(i));
  const mapa = new Map();
  for (const w of dane.rows) mapa.set(w.nazwa, w.tresc);
  return mapa;
}

/** Funkcje + triggery w jednej mapie. Triggery mają w kluczu kropkę
 *  (`tabela.nazwa`), więc nie kolidują z nazwami funkcji. */
function zBazy() {
  const f = zapytaj(ZAPYTANIE, 'funkcje');
  const t = zapytaj(ZAPYTANIE_TRG, 'triggery');
  for (const [k, v] of t) f.set(k, v);
  return f;
}

function zMigawki() {
  if (!fs.existsSync(KATALOG)) return new Map();
  const mapa = new Map();
  for (const f of fs.readdirSync(KATALOG)) {
    if (!f.endsWith('.sql')) continue;
    mapa.set(f.replace(/\.sql$/, ''), fs.readFileSync(path.join(KATALOG, f), 'utf8'));
  }
  return mapa;
}

function zrzut() {
  const baza = zBazy();
  fs.mkdirSync(KATALOG, { recursive: true });
  /* Sprzątamy pliki po funkcjach, których w bazie już nie ma — inaczej migawka
     rosłaby o duchy i „zgodne" znaczyłoby coraz mniej. */
  for (const f of fs.readdirSync(KATALOG)) {
    if (f.endsWith('.sql') && !baza.has(f.replace(/\.sql$/, ''))) {
      fs.unlinkSync(path.join(KATALOG, f));
      console.log('  usunięto (nie ma jej już w bazie): ' + f);
    }
  }
  const linie = [];
  for (const [nazwa, tresc] of [...baza].sort((a, b) => a[0].localeCompare(b[0]))) {
    fs.writeFileSync(path.join(KATALOG, nazwa + '.sql'), tresc.trimEnd() + '\n', 'utf8');
    linie.push(suma(tresc) + '  ' + nazwa);
  }
  fs.writeFileSync(PLIK_SUM,
    '# Sumy definicji funkcji z produkcji — sha256 z postaci ZNORMALIZOWANEJ\n' +
    '# (białe znaki zwinięte, małe litery), NIE z surowego pg_get_functiondef.\n' +
    '# Generowane: node tools/funkcje-bazy.js --zrzut\n' +
    '# Porównanie:  node tools/funkcje-bazy.js\n' +
    '# Obiektow (funkcje + triggery): ' + baza.size + '\n\n' +
    linie.join('\n') + '\n', 'utf8');
  console.log('\n  Zrzucono ' + baza.size + ' obiektów (funkcje + triggery) do supabase/schema/funkcje/\n');
}

function porownaj() {
  const baza = zBazy();
  const mig = zMigawki();
  const wszystkie = [...new Set([...baza.keys(), ...mig.keys()])].sort();
  const rozne = [], tylkoBaza = [], tylkoMigawka = [];
  for (const n of wszystkie) {
    if (!mig.has(n)) { tylkoBaza.push(n); continue; }
    if (!baza.has(n)) { tylkoMigawka.push(n); continue; }
    if (suma(baza.get(n)) !== suma(mig.get(n))) rozne.push(n);
  }
  console.log('\n  MIGAWKA FUNKCJI — produkcja vs supabase/schema/funkcje/\n');
  console.log('  w bazie: ' + baza.size + ' | w migawce: ' + mig.size + '  (funkcje + triggery)');
  if (!rozne.length && !tylkoBaza.length && !tylkoMigawka.length) {
    console.log('\n  Zgodne.\n');
    return 0;
  }
  if (tylkoBaza.length) {
    console.log('\n  NOWE W BAZIE, BRAK W MIGAWCE (' + tylkoBaza.length + '):');
    tylkoBaza.forEach((n) => console.log('  + ' + n));
  }
  if (tylkoMigawka.length) {
    console.log('\n  SĄ W MIGAWCE, ZNIKŁY Z BAZY (' + tylkoMigawka.length + '):');
    tylkoMigawka.forEach((n) => console.log('  − ' + n));
  }
  if (rozne.length) {
    console.log('\n  INNA TREŚĆ (' + rozne.length + '):');
    rozne.forEach((n) => console.log('  ≠ ' + n + '   → supabase/schema/funkcje/' + n + '.sql'));
  }
  console.log('\n  ⚠️ ZANIM ZRÓWNASZ: sprawdź, KTÓRA STRONA jest nowsza.');
  console.log('     28.08.2026 nowsza była PRODUKCJA — odtworzenie bazy z repo');
  console.log('     cofnęłoby poprawkę burstu w trigger_detect_moment.');
  console.log('     Odświeżenie migawki: node tools/funkcje-bazy.js --zrzut\n');
  return 1;
}

if (process.argv.includes('--zrzut')) { zrzut(); process.exit(0); }
process.exit(porownaj());
