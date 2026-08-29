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
//   node tools/funkcje-bazy.js --samokontrola  ← sprawdza, czy porównanie DZIAŁA
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

/* ⚠️ POROWNANIE JEST WYDZIELONE Z WEJSCIA/WYJSCIA CELOWO. Dopoki roznice
   liczyly sie w srodku `porownaj()`, jedynym sposobem sprawdzenia, czy
   narzedzie w ogole cokolwiek wykrywa, bylo odpytanie produkcji — czyli test
   wymagajacy poswiadczen, ktorego nikt nie odpali przy zmianie samego
   narzedzia. Teraz `--samokontrola` przepuszcza przez TE SAMA funkcje
   spreparowane pary map, na sucho. */
function roznice(baza, mig) {
  const wszystkie = [...new Set([...baza.keys(), ...mig.keys()])].sort();
  const rozne = [], tylkoBaza = [], tylkoMigawka = [];
  for (const n of wszystkie) {
    if (!mig.has(n)) { tylkoBaza.push(n); continue; }
    if (!baza.has(n)) { tylkoMigawka.push(n); continue; }
    if (suma(baza.get(n)) !== suma(mig.get(n))) rozne.push(n);
  }
  return { rozne, tylkoBaza, tylkoMigawka };
}

function porownaj() {
  const baza = zBazy();
  const mig = zMigawki();
  const { rozne, tylkoBaza, tylkoMigawka } = roznice(baza, mig);
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

/* ─────────────────────────────────────────────────────────────────────────────
   SAMOKONTROLA — czy to porownanie w ogole potrafi swiecic na czerwono.

   ⚠️ Bramka, ktora nigdy nie swieci na czerwono, jest ozdoba — i druga strona
   tej monety: taka, ktora swieci zawsze, tez. Dlatego przypadkow jest CZTERY,
   a czwarty sprawdza, ze poprawny stan zostaje PRZEPUSZCZONY.

   ⚠️ KAZDY PRZYPADEK JEST PUSZCZANY NA FUNKCJI **I** NA TRIGGERZE. To nie jest
   symetria dla symetrii: poprawka burstu z 5.08 siedzi POLOWICZNIE w definicji
   triggera (`REFERENCING NEW TABLE AS nowe FOR EACH STATEMENT`), wiec
   samokontrola pokrywajaca tylko funkcje zostawilaby najwiekszy realny rozjazd
   poza testem. Triggery maja w kluczu kropke (`tabela.nazwa`), ida osobnym
   zapytaniem i osobna nazwa pliku — to, ze funkcje sa wykrywane, NIE dowodzi,
   ze triggery tez.

   Dziala NA SUCHO, bez odpytywania bazy: test wymagajacy poswiadczen do
   produkcji nie zostalby uruchomiony wtedy, kiedy jest najpotrzebniejszy —
   przy zmianie samego narzedzia.
   ───────────────────────────────────────────────────────────────────────── */
const FUN = [
  'CREATE OR REPLACE FUNCTION public.auth_is_coach()',
  ' RETURNS boolean',
  ' LANGUAGE sql',
  'AS $function$',
  '  SELECT EXISTS (SELECT 1 FROM public.coaches WHERE id = auth.uid());',
  '$function$',
].join('\n');

/* Prawdziwa tresc z produkcji i prawdziwa regresja, ktora jej grozi: powrot do
   wersji row-level z `migrations/` skasowalby poprawke burstu. */
const TRG_STMT = 'CREATE TRIGGER trg_detect_moment_ins AFTER INSERT ON public.training_logs ' +
  'REFERENCING NEW TABLE AS nowe FOR EACH STATEMENT EXECUTE FUNCTION trigger_detect_moment()';
const TRG_ROW = 'CREATE TRIGGER trg_detect_moment_ins AFTER INSERT ON public.training_logs ' +
  'FOR EACH ROW EXECUTE FUNCTION trigger_detect_moment()';

const KLUCZ_FUN = 'auth_is_coach';
const KLUCZ_TRG = 'training_logs.trg_detect_moment_ins';

function wzorzec() {
  return new Map([[KLUCZ_FUN, FUN], [KLUCZ_TRG, TRG_STMT]]);
}

function samokontrola() {
  const wyniki = [];
  const zdanie = (ok, opis) => {
    wyniki.push(ok);
    console.log((ok ? '  ✓ samokontrola: ' : '  ✗ SAMOKONTROLA PADŁA: ') + opis);
  };

  console.log('\n  SAMOKONTROLA — cztery przypadki, każdy na funkcji I na triggerze\n');

  /* 1. ZMIENIONA TREŚĆ */
  let mig = wzorzec();
  mig.set(KLUCZ_FUN, FUN.replace('public.coaches', 'public.athletes'));
  let r = roznice(wzorzec(), mig);
  zdanie(r.rozne.length === 1 && r.rozne[0] === KLUCZ_FUN,
    'funkcja o zmienionej treści ' + (r.rozne.includes(KLUCZ_FUN) ? 'ZŁAPANA' : 'NIE została wykryta'));

  mig = wzorzec();
  mig.set(KLUCZ_TRG, TRG_ROW);
  r = roznice(wzorzec(), mig);
  zdanie(r.rozne.length === 1 && r.rozne[0] === KLUCZ_TRG,
    'trigger cofnięty do FOR EACH ROW (utrata poprawki burstu) ' +
    (r.rozne.includes(KLUCZ_TRG) ? 'ZŁAPANY' : 'NIE został wykryty'));

  /* 2. BRAK W MIGAWCE — obiekt jest w bazie, w repo go nie ma */
  let baza = wzorzec();
  baza.set('nowa_funkcja_z_produkcji', FUN);
  r = roznice(baza, wzorzec());
  zdanie(r.tylkoBaza.length === 1 && r.tylkoBaza[0] === 'nowa_funkcja_z_produkcji',
    'funkcja w bazie, brak w migawce ' + (r.tylkoBaza.length === 1 ? 'ZŁAPANA' : 'NIE została wykryta'));

  baza = wzorzec();
  baza.set('training_logs.trg_nowy', TRG_STMT);
  r = roznice(baza, wzorzec());
  zdanie(r.tylkoBaza.length === 1 && r.tylkoBaza[0] === 'training_logs.trg_nowy',
    'trigger w bazie, brak w migawce ' + (r.tylkoBaza.length === 1 ? 'ZŁAPANY' : 'NIE został wykryty'));

  /* 3. DUCH W MIGAWCE — obiekt zniknal z bazy, plik zostal */
  mig = wzorzec();
  mig.set('skasowana_funkcja', FUN);
  r = roznice(wzorzec(), mig);
  zdanie(r.tylkoMigawka.length === 1 && r.tylkoMigawka[0] === 'skasowana_funkcja',
    'duch funkcji w migawce ' + (r.tylkoMigawka.length === 1 ? 'ZŁAPANY' : 'NIE został wykryty'));

  mig = wzorzec();
  mig.set('training_logs.trg_skasowany', TRG_STMT);
  r = roznice(wzorzec(), mig);
  zdanie(r.tylkoMigawka.length === 1 && r.tylkoMigawka[0] === 'training_logs.trg_skasowany',
    'duch triggera w migawce ' + (r.tylkoMigawka.length === 1 ? 'ZŁAPANY' : 'NIE został wykryty'));

  /* 4. POPRAWNY STAN PRZEPUSZCZONY — bez tego samokontrola potrafi swiecic
        na czerwono zawsze i nadal wygladac na zdana.
     ⚠️ Wariant „po przeformatowaniu" jest tutaj, a nie osobno, bo to TEN SAM
        warunek: normalizacja ma sprawiac, ze upgrade Postgresa (inne biale
        znaki, inna wielkosc liter) NIE budzi bramki. Falszywy alarm uczy
        ignorowac narzedzie rownie skutecznie jak brak alarmu. */
  r = roznice(wzorzec(), wzorzec());
  const czysto = !r.rozne.length && !r.tylkoBaza.length && !r.tylkoMigawka.length;
  zdanie(czysto, 'zgodny stan ' + (czysto ? 'PRZEPUSZCZONY' : 'zgłoszony jako rozjazd — bramka krzyczy bez powodu'));

  mig = new Map([
    [KLUCZ_FUN, '  create or replace FUNCTION public.auth_is_coach()\n\n RETURNS   boolean\n' +
      ' LANGUAGE sql\nAS $function$\n  SELECT EXISTS (SELECT 1 FROM public.coaches WHERE id = auth.uid());\n$function$  '],
    [KLUCZ_TRG, TRG_STMT.replace(/ /g, '  ').toUpperCase()],
  ]);
  r = roznice(wzorzec(), mig);
  const poFormacie = !r.rozne.length && !r.tylkoBaza.length && !r.tylkoMigawka.length;
  zdanie(poFormacie, 'sama zmiana formatowania (białe znaki, wielkość liter) ' +
    (poFormacie ? 'NIE budzi bramki' : 'zgłoszona jako rozjazd — fałszywy alarm'));

  const zdane = wyniki.filter(Boolean).length;
  console.log('\n  ' + zdane + '/' + wyniki.length + ' zdanych\n');
  return wyniki.every(Boolean) ? 0 : 1;
}

if (process.argv.includes('--samokontrola')) process.exit(samokontrola());
if (process.argv.includes('--zrzut')) { zrzut(); process.exit(0); }
process.exit(porownaj());
