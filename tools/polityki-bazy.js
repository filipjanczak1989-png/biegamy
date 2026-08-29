#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// MIGAWKA DOSTĘPU — RLS, granty i polityki z produkcji do repo, plus porównanie
//
// ⚠️ PO CO TO ISTNIEJE. Zmierzone 29.08.2026: w schemacie `public` żyje 189
// polityk RLS na 67 tabelach, a `supabase/migrations/` opisuje SIEDEMNAŚCIE.
// Pozostałe 172 (91%) nie mają w repo definicji nigdzie. To ta sama wada co
// przy funkcjach (`tools/funkcje-bazy.js`), tylko na wrażliwszym obiekcie:
// funkcja licząca źle daje złą liczbę, polityka licząca źle daje komuś cudze
// dane.
//
// ⚠️ ROZJAZD JEST UDOWODNIONY, NIE PODEJRZEWANY. W repo leżał pełny zrzut
// polityk z 26.05.2026 (`.security-audit/2026-05-26/policies-all.csv`).
// Porównanie z produkcją: 146 → 189 polityk, 14 ZMIENIONYCH, 50 dodanych,
// 7 usuniętych — i ŻADNA z 14 zmian nie ma zapisu w migracjach. Kierunek jak
// przy poprawce burstu: produkcja jest nowsza i poprawniejsza. Patrz README.md.
//
// ⚠️ DLACZEGO TO NIE JEST „MIGAWKA POLITYK". Sama lista polityk ma dokładnie ten
// ślepy punkt, który migawka samych funkcji miała na triggery: `relrowsecurity`
// i GRANT-y NIE SĄ własnością polityki. D7 pokazało, że dla `anon` realną bramką
// był GRANT, nie polityka — `anon` nie ma grantów na 64 z 74 tabel, więc rola
// `public` jest tam martwą literą. Migawka bez grantów pokazywałaby „bez zmian"
// po wyłączeniu RLS albo po dosypaniu grantu dla `anon`.
//
// Uruchomienie:
//   node tools/polityki-bazy.js --zrzut        ← nadpisuje migawkę stanem produkcji
//   node tools/polityki-bazy.js                ← porównuje migawkę z produkcją
//   node tools/polityki-bazy.js --samokontrola ← sprawdza, czy porównanie DZIAŁA
//
// ⚠️ LOKALNIE, NIE W CI — tak samo jak przy funkcjach: sprawdzanie bazy w CI
// wymagałoby poświadczeń do produkcji, co zmienia CI w cel ataku.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const KORZEN = path.join(__dirname, '..');
const KATALOG = path.join(KORZEN, 'supabase', 'schema', 'rls');
const PLIK_SUM = path.join(KATALOG, 'SUMY.txt');

const WORKDIR = process.env.BM_SB_WORKDIR ||
  path.join(process.env.USERPROFILE || process.env.HOME || '', '.cache', 'sb-audit');

/* ── zapytania ──────────────────────────────────────────────────────────────
   Widoki są w migawce razem z tabelami. Nie mają RLS, ale mają granty —
   a 3 z 6 (`public_athletes`, `radio_comments_view`, `radio_top`) są nadane
   roli `anon`. Widok bez `security_invoker` czyta z uprawnieniami WŁAŚCICIELA,
   czyli omija RLS tabel źródłowych. Pominięcie widoków zostawiłoby dziurę
   dokładnie tam, gdzie migawka ma odpowiadać na pytanie „kto co widzi". */
const Q_RELACJE = `
select c.relname as nazwa,
       case c.relkind when 'r' then 'tabela' when 'v' then 'widok' when 'p' then 'tabela_part' else c.relkind::text end as rodzaj,
       c.relrowsecurity as rls,
       c.relforcerowsecurity as force_rls,
       coalesce(array_to_string(c.reloptions, ','), '') as opcje
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','v','p')
order by c.relname;
`;

const Q_POLITYKI = `
select tablename as nazwa, policyname, cmd, permissive, roles::text as roles,
       coalesce(qual,'') as qual, coalesce(with_check,'') as with_check
from pg_policies where schemaname = 'public'
order by tablename, policyname;
`;

const Q_GRANTY = `
select table_name as nazwa, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
order by 1,2,3;
`;

/* ⚠️ GRANTY KOLUMNOWE PONAD TABELOWYMI. Zmierzone 29.08.2026: jest ich 66 i są
   NOŚNE, nie kosmetyczne — `athletes` NIE MA tabelowego SELECT dla
   `authenticated`, ma go na 55 wymienionych kolumnach; `game_events` daje
   `anon` INSERT na czterech kolumnach, ale NIE na `athlete_id`. Migawka
   wyłącznie tabelowa twierdziłaby, że `authenticated` nie czyta `athletes`
   — i byłaby to nieprawda w stronę uspokajającą. */
const Q_GRANTY_KOL = `
select cp.table_name as nazwa, cp.grantee, cp.privilege_type, cp.column_name
from information_schema.column_privileges cp
where cp.table_schema = 'public'
  and not exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = cp.table_schema and g.table_name = cp.table_name
      and g.grantee = cp.grantee and g.privilege_type = cp.privilege_type)
order by 1,2,3,4;
`;

function zapytaj(sql, etykieta) {
  const tmp = path.join(require('os').tmpdir(), 'bm-rls-' + etykieta + '-' + process.pid + '.sql');
  fs.writeFileSync(tmp, sql, 'utf8');
  let out;
  try {
    out = execFileSync('supabase',
      ['db', 'query', '--linked', '--workdir', WORKDIR, '-o', 'json', '-f', tmp],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    console.error('\n  Nie udało się odpytać bazy.');
    console.error('  Sprawdź, czy `supabase` jest w PATH i czy workdir jest zlinkowany:');
    console.error('    ' + WORKDIR + '  (zmienna BM_SB_WORKDIR)\n');
    process.exit(2);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
  return JSON.parse(out.slice(out.indexOf('{'))).rows;
}

/* ⚠️ `roles` przychodzi jako TABLICA (`{anon,authenticated}`) i kolejność nie
   jest niczym gwarantowana — bez sortowania ta sama polityka dawałaby dwie
   różne sumy. */
function role(s) {
  return String(s || '').replace(/^\{|\}$/g, '').split(',')
    .map((x) => x.trim()).filter(Boolean).sort().join(', ');
}

/** Kanoniczna treść pliku dla jednej relacji. Deterministyczna: wszystko
 *  sortowane, nic nie zależy od kolejności wierszy z bazy.
 *
 *  ⚠️ FORMAT JEST OPISOWY, NIE WYKONYWALNY — i to jest decyzja, nie estetyka.
 *  Pierwsza wersja renderowała stan jako `CREATE POLICY …` i `GRANT … TO anon`, (bramka:przyklad)
 *  czyli gotowe DDL. Dwa powody, dla których to było złe:
 *
 *  1. Plik wyglądający na wykonywalny ZACHĘCA do odtworzenia produkcji z repo —
 *     dokładnie do tego, przed czym ostrzega pierwszy akapit README. Migawka ma
 *     być zapisem stanu, nie kuszącym skryptem.
 *  2. Zderzało się to z `tools/bramka-commit.js`, która słusznie blokuje
 *     `GRANT … TO anon` i `CREATE POLICY` w dodanych liniach (dla `anon` (bramka:przyklad)
 *     to blokada także w CI). Migawka prawdziwie zawiera granty dla `anon`,
 *     bo tak jest na produkcji — więc każde jej odświeżenie zapalałoby CI.
 *     ⚠️ Bramka ma wyjście przez znacznik `bramka:przyklad`, ale z twardym
 *     limitem 12 linii i własnym komentarzem „rosnąca lista wyjątków znaczy,
 *     że reguła jest zła". Migawka dałaby ich setki. Osłabienie reguły
 *     chroniącej przed uprawnieniem dla niezalogowanego byłoby złą odpowiedzią
 *     na dobre ostrzeżenie — więc zmienił się format, a nie bramka.
 *
 *  Informacja jest ta sama i czytelniejsza; zmienia się to, że pliku nie da się
 *  bezmyślnie wkleić do `db query`. */
function tresc(rel, polityki, granty, grantyKol) {
  const L = [];
  const pelna = 'public.' + rel.nazwa;
  L.push('MIGAWKA STANU DOSTĘPU — ' + pelna + (rel.rodzaj === 'widok' ? '  (WIDOK)' : ''));
  L.push('⚠️ Zapis stanu produkcji, NIE migracja i NIE skrypt do wykonania.');
  L.push('   Patrz README.md w tym katalogu.');
  L.push('');

  if (rel.rodzaj === 'widok') {
    const inwoker = /security_invoker=(true|on)/i.test(rel.opcje);
    L.push('RLS            : WIDOK NIE MA RLS');
    L.push('security_invoker: ' + (inwoker
      ? 'TAK — czyta uprawnieniami PYTAJĄCEGO, RLS tabel źródłowych DZIAŁA'
      : 'NIE — czyta uprawnieniami WŁAŚCICIELA, RLS tabel źródłowych JEST OMIJANY'));
  } else {
    L.push('RLS            : ' + (rel.rls ? 'WŁĄCZONE' : '⚠️ WYŁĄCZONE'));
    L.push('FORCE RLS      : ' + (rel.force_rls ? 'TAK' : 'nie'));
  }
  L.push('');

  const wgRoli = new Map();
  for (const g of granty) {
    if (!wgRoli.has(g.grantee)) wgRoli.set(g.grantee, []);
    wgRoli.get(g.grantee).push(g.privilege_type);
  }
  L.push('UPRAWNIENIA (tabelowe)');
  const role_ = new Set([...wgRoli.keys(), 'anon', 'authenticated']);
  for (const r of [...role_].sort()) {
    L.push('  ' + r.padEnd(15) + ': ' + (wgRoli.has(r)
      ? [...new Set(wgRoli.get(r))].sort().join(', ') : '— brak'));
  }
  L.push('');

  L.push('UPRAWNIENIA (kolumnowe, ponad tabelowymi)');
  if (!grantyKol.length) {
    L.push('  — brak');
  } else {
    const wg = new Map();
    for (const g of grantyKol) {
      const k = g.grantee + '|' + g.privilege_type;
      if (!wg.has(k)) wg.set(k, []);
      wg.get(k).push(g.column_name);
    }
    for (const k of [...wg.keys()].sort()) {
      const [gr, pr] = k.split('|');
      L.push('  ' + gr + ' / ' + pr + ' na kolumnach:');
      L.push('    ' + wg.get(k).sort().join(', '));
    }
  }
  L.push('');

  L.push('POLITYKI (' + polityki.length + ')');
  if (!polityki.length) {
    if (rel.rodzaj !== 'widok' && rel.rls) {
      L.push('  ⚠️ RLS WŁĄCZONE, ZERO POLITYK → dla ról bez BYPASSRLS tabela jest pusta.');
      L.push('     Jeśli dane i tak wychodzą, idą przez funkcję SECURITY DEFINER.');
    } else {
      L.push('  — brak');
    }
  }
  let i = 0;
  for (const p of [...polityki].sort((a, b) => a.policyname.localeCompare(b.policyname))) {
    L.push('');
    L.push('  [' + (++i) + '] ' + p.policyname);
    L.push('      polecenie : ' + p.cmd + '   rodzaj: ' + p.permissive);
    L.push('      role      : ' + role(p.roles));
    if (p.qual) L.push('      warunek   : ' + p.qual.replace(/\s+/g, ' ').trim());
    if (p.with_check) L.push('      przy zapisie: ' + p.with_check.replace(/\s+/g, ' ').trim());
  }
  return L.join('\n') + '\n';
}

/* Ta sama normalizacja co przy funkcjach — z tego samego powodu: `pg_policies`
   zwraca tekst PO DEPARSE, więc upgrade Postgresa może zmienić białe znaki bez
   zmiany znaczenia, a bramka krzycząca bez powodu przestaje być czytana. */
function normalizuj(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
}
function suma(s) {
  return crypto.createHash('sha256').update(normalizuj(s), 'utf8').digest('hex').slice(0, 16);
}

function zBazy() {
  const relacje = zapytaj(Q_RELACJE, 'rel');
  const polityki = zapytaj(Q_POLITYKI, 'pol');
  const granty = zapytaj(Q_GRANTY, 'gr');
  const grantyKol = zapytaj(Q_GRANTY_KOL, 'grk');
  const wg = (lista) => {
    const m = new Map();
    for (const r of lista) {
      if (!m.has(r.nazwa)) m.set(r.nazwa, []);
      m.get(r.nazwa).push(r);
    }
    return m;
  };
  const mp = wg(polityki), mg = wg(granty), mgk = wg(grantyKol);
  const mapa = new Map();
  for (const rel of relacje) {
    mapa.set(rel.nazwa, tresc(rel, mp.get(rel.nazwa) || [], mg.get(rel.nazwa) || [], mgk.get(rel.nazwa) || []));
  }
  return mapa;
}

function zMigawki() {
  if (!fs.existsSync(KATALOG)) return new Map();
  const mapa = new Map();
  for (const f of fs.readdirSync(KATALOG)) {
    /* ⚠️ SUMY.txt sam konczy sie na .txt i bez tego wyjatku udaje relacje
       o nazwie „SUMY" — porownanie zglaszalo wtedy ducha przy KAZDYM
       uruchomieniu, tuz po swiezym zrzucie. Przy rozszerzeniu .sql problem
       nie istnial, wiec pojawil sie razem ze zmiana formatu. */
    if (!f.endsWith('.txt') || f === 'SUMY.txt') continue;
    mapa.set(f.replace(/\.txt$/, ''), fs.readFileSync(path.join(KATALOG, f), 'utf8'));
  }
  return mapa;
}

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

function zrzut() {
  const baza = zBazy();
  fs.mkdirSync(KATALOG, { recursive: true });
  for (const f of fs.readdirSync(KATALOG)) {
    if (f.endsWith('.txt') && f !== 'SUMY.txt' && !baza.has(f.replace(/\.txt$/, ''))) {
      fs.unlinkSync(path.join(KATALOG, f));
      console.log('  usunięto (nie ma jej już w bazie): ' + f);
    }
  }
  const linie = [];
  for (const [nazwa, t] of [...baza].sort((a, b) => a[0].localeCompare(b[0]))) {
    fs.writeFileSync(path.join(KATALOG, nazwa + '.txt'), t, 'utf8');
    linie.push(suma(t) + '  ' + nazwa);
  }
  fs.writeFileSync(PLIK_SUM,
    '# Sumy stanu dostępu (RLS + granty + polityki) — sha256 z postaci ZNORMALIZOWANEJ\n' +
    '# (białe znaki zwinięte, małe litery), NIE z surowego wyjścia pg_policies.\n' +
    '# Generowane: node tools/polityki-bazy.js --zrzut\n' +
    '# Porównanie:  node tools/polityki-bazy.js\n' +
    '# Relacji: ' + baza.size + '\n\n' + linie.join('\n') + '\n', 'utf8');
  console.log('\n  Zrzucono ' + baza.size + ' relacji do supabase/schema/rls/\n');
}

function porownaj() {
  const baza = zBazy();
  const mig = zMigawki();
  const { rozne, tylkoBaza, tylkoMigawka } = roznice(baza, mig);
  console.log('\n  MIGAWKA DOSTĘPU — produkcja vs supabase/schema/rls/\n');
  console.log('  w bazie: ' + baza.size + ' | w migawce: ' + mig.size + '  (tabele + widoki)');
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
    console.log('\n  INNY STAN DOSTĘPU (' + rozne.length + '):');
    rozne.forEach((n) => console.log('  ≠ ' + n + '   → supabase/schema/rls/' + n + '.txt'));
  }
  console.log('\n  ⚠️ ZANIM ZRÓWNASZ: sprawdź, KTÓRA STRONA jest nowsza.');
  console.log('     Maj→sierpień 2026 zmieniło się 14 polityk i ANI JEDNA zmiana');
  console.log('     nie trafiła do repo — a produkcja była za każdym razem nowsza.');
  console.log('     Odświeżenie migawki: node tools/polityki-bazy.js --zrzut\n');
  return 1;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SAMOKONTROLA — czy to porównanie potrafi świecić na czerwono.

   ⚠️ Przypadki wykrywające są puszczane NA KAŻDYM Z TRZECH WYMIARÓW osobno:
   polityka, flaga RLS, grant. To nie jest nadmiar: cały powód istnienia tego
   narzędzia to fakt, że migawka samych polityk MILCZAŁABY po wyłączeniu RLS
   albo po dosypaniu grantu dla `anon`. Samokontrola sprawdzająca wyłącznie
   zmianę polityki potwierdzałaby działanie tego, co i tak było oczywiste,
   i zostawiała bez testu dokładnie te dwa wymiary, dla których to powstało.
   ───────────────────────────────────────────────────────────────────────── */
const REL = { nazwa: 'trainings', rodzaj: 'tabela', rls: true, force_rls: false, opcje: '' };
const POL = [{
  nazwa: 'trainings', policyname: 'coach_manage_trainings', cmd: 'ALL', permissive: 'PERMISSIVE',
  roles: '{public}', qual: '(coach_id = auth.uid())', with_check: '',
}];
const GR = [
  { nazwa: 'trainings', grantee: 'authenticated', privilege_type: 'SELECT' },
  { nazwa: 'trainings', grantee: 'authenticated', privilege_type: 'INSERT' },
];
const GRK = [];

function samokontrola() {
  const wyniki = [];
  const zdanie = (ok, opis) => {
    wyniki.push(ok);
    console.log((ok ? '  ✓ samokontrola: ' : '  ✗ SAMOKONTROLA PADŁA: ') + opis);
  };
  const wzorzec = () => new Map([['trainings', tresc(REL, POL, GR, GRK)]]);
  const czysta = (r) => !r.rozne.length && !r.tylkoBaza.length && !r.tylkoMigawka.length;

  console.log('\n  SAMOKONTROLA — wykrywanie na trzech wymiarach: polityka, RLS, granty\n');

  /* 1. ZMIENIONA TREŚĆ — wymiar POLITYKI */
  let mig = new Map([['trainings', tresc(REL,
    [{ ...POL[0], qual: '(coach_id = auth.uid() or true)' }], GR, GRK)]]);
  let r = roznice(wzorzec(), mig);
  zdanie(r.rozne.length === 1, 'zmieniony warunek polityki ' + (r.rozne.length === 1 ? 'ZŁAPANY' : 'NIE został wykryty'));

  mig = new Map([['trainings', tresc(REL, [{ ...POL[0], roles: '{anon,authenticated}' }], GR, GRK)]]);
  r = roznice(wzorzec(), mig);
  zdanie(r.rozne.length === 1, 'zmieniona ROLA polityki ' + (r.rozne.length === 1 ? 'ZŁAPANA' : 'NIE została wykryta'));

  /* 2. ZMIENIONA TREŚĆ — wymiar RLS (tego migawka samych polityk by NIE widziała) */
  mig = new Map([['trainings', tresc({ ...REL, rls: false }, POL, GR, GRK)]]);
  r = roznice(wzorzec(), mig);
  zdanie(r.rozne.length === 1, 'WYŁĄCZONE RLS na tabeli ' + (r.rozne.length === 1 ? 'ZŁAPANE' : 'NIE zostało wykryte'));

  /* 3. ZMIENIONA TREŚĆ — wymiar GRANTÓW (to samo) */
  mig = new Map([['trainings', tresc(REL, POL,
    GR.concat([{ nazwa: 'trainings', grantee: 'anon', privilege_type: 'SELECT' }]), GRK)]]);
  r = roznice(wzorzec(), mig);
  zdanie(r.rozne.length === 1, 'dosypany GRANT dla anon ' + (r.rozne.length === 1 ? 'ZŁAPANY' : 'NIE został wykryty'));

  mig = new Map([['trainings', tresc(REL, POL, GR,
    [{ nazwa: 'trainings', grantee: 'anon', privilege_type: 'SELECT', column_name: 'coach_id' }])]]);
  r = roznice(wzorzec(), mig);
  zdanie(r.rozne.length === 1, 'grant KOLUMNOWY dla anon ' + (r.rozne.length === 1 ? 'ZŁAPANY' : 'NIE został wykryty'));

  /* 4. BRAK W MIGAWCE / DUCH W MIGAWCE */
  let baza = wzorzec(); baza.set('nowa_tabela', tresc({ ...REL, nazwa: 'nowa_tabela' }, [], [], []));
  r = roznice(baza, wzorzec());
  zdanie(r.tylkoBaza.length === 1, 'relacja w bazie, brak w migawce ' + (r.tylkoBaza.length === 1 ? 'ZŁAPANA' : 'NIE została wykryta'));

  mig = wzorzec(); mig.set('skasowana_tabela', tresc({ ...REL, nazwa: 'skasowana_tabela' }, [], [], []));
  r = roznice(wzorzec(), mig);
  zdanie(r.tylkoMigawka.length === 1, 'duch relacji w migawce ' + (r.tylkoMigawka.length === 1 ? 'ZŁAPANY' : 'NIE został wykryty'));

  /* 5. POPRAWNY STAN PRZEPUSZCZONY — bez tego narzędzie mogłoby świecić
        na czerwono zawsze i nadal wyglądać na zdane. */
  r = roznice(wzorzec(), wzorzec());
  zdanie(czysta(r), 'zgodny stan ' + (czysta(r) ? 'PRZEPUSZCZONY' : 'zgłoszony jako rozjazd — bramka krzyczy bez powodu'));

  /* ⚠️ Kolejność ról i uprawnień NIE MOŻE ruszać sumy — inaczej migawka
     migotałaby przy niezmienionej bazie, a fałszywy alarm uczy ignorować
     narzędzie równie skutecznie jak brak alarmu. */
  mig = new Map([['trainings', tresc(REL, [{ ...POL[0], roles: '{authenticated,anon}' }],
    GR.slice().reverse(), GRK)]]);
  const wzorzecOdwr = new Map([['trainings', tresc(REL, [{ ...POL[0], roles: '{anon,authenticated}' }], GR, GRK)]]);
  r = roznice(wzorzecOdwr, mig);
  zdanie(czysta(r), 'sama KOLEJNOŚĆ ról i grantów ' + (czysta(r) ? 'NIE budzi bramki' : 'zgłoszona jako rozjazd — fałszywy alarm'));

  const zdane = wyniki.filter(Boolean).length;
  console.log('\n  ' + zdane + '/' + wyniki.length + ' zdanych\n');
  return wyniki.every(Boolean) ? 0 : 1;
}

if (process.argv.includes('--samokontrola')) process.exit(samokontrola());
if (process.argv.includes('--zrzut')) { zrzut(); process.exit(0); }
process.exit(porownaj());
