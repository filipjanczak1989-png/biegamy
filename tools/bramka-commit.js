#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// BRAMKA COMMITA — zasada, która dziś istnieje jako gate w rozmowie, ma istnieć
// jako sprawdzenie w narzędziu. Prozą łamie się ją przez nieuwagę.
//
// !! TO NARZĘDZIE MA DWÓCH WYWOŁUJĄCYCH, JEDNA LOGIKA:
//      .githooks/pre-commit           → lokalnie, PRZYPOMNIENIE
//      .github/workflows/bramka.yml   → na serwerze, BLOKADA
//    Hook da się ominąć `--no-verify` (.ai/LEKCJE.md #4) i nie przeżywa klonu
//    — `.git/hooks` nie jest wersjonowane. CI ominąć się nie da.
//    ⚠️ Hook NIE JEST zamkiem i mówi to wprost w swoim komunikacie.
//
// !! CZYTAMY DIFF, NIE CAŁE PLIKI. Reguła sekretów sprawdza WYŁĄCZNIE linie
//    DODANE (`+`). Inaczej każdy commit dotykający sb.js wywracałby się na
//    słowie `service_role`, które siedzi tam w komentarzu od miesięcy.
//
// !! PROGI DOBRANE POMIAREM, NIE INTUICJĄ. Zmierzone na 23 moich commitach
//    z 15.08.2026 — ile razy każda reguła by mnie zatrzymała:
//        supabase/migrations   0/23   (21 commitów w CAŁEJ historii)  → BLOKADA
//        GRANT/REVOKE/DROP     0/23                                   → BLOKADA
//        sekrety (wąsko)       0/23                                   → BLOKADA
//        theme.css             1/23                                   → ostrzeżenie
//        sb.js                12/23  (52 %)                           → OSTRZEŻENIE
//    ⚠️ sb.js NIE MOŻE BYĆ BLOKADĄ. Zatrzymałaby mnie dwanaście razy w jeden
//       dzień i nauczyła omijania w kilka godzin. Blokada, którą omija się
//       codziennie, uczy omijania — nie ostrożności.
//
// UŻYCIE
//     node tools/bramka-commit.js                    → zmiany zastage'owane (hook)
//     node tools/bramka-commit.js --zakres A..B      → zakres commitów (CI)
//     node tools/bramka-commit.js --samokontrola     → test bramki, OBIE strony
//
// Kod wyjścia: 0 = przeszło (ostrzeżenia nie blokują), 1 = blokada.
'use strict';

const { execFileSync } = require('node:child_process');

// ── REGUŁY ───────────────────────────────────────────────────────────────────

const BLOKADY_SCIEZEK = [
  { re: /^supabase\/migrations\//,
    opis: 'migracja bazy',
    czemu: 'Żaden workflow NIE dotyka bazy — rollback kodu strukturalnie nie cofnie migracji.\n'
         + '     Zmiana w bazie musi być wykonana świadomie, z własnym planem wycofania.' },
];

const OSTRZEZENIA_SCIEZEK = [
  { re: /^sb\.js$/,
    opis: 'sb.js — SSOT dla 27 stron',
    czemu: 'Zmiana tutaj dotyka WSZYSTKICH stron. Sprawdź, czy nie miała dotyczyć jednej.' },
  { re: /^theme\.css$/,
    opis: 'theme.css — tokeny motywu',
    czemu: 'Kolory i zmienne idą do każdej strony naraz.' },
];

/* ⚠️ WĄSKO, BO REPO JEST PEŁNE RZECZY WYGLĄDAJĄCYCH NA SEKRETY.
   Zmierzone 15.08.2026 — co MUSI przejść, bo jest publiczne z definicji:
     sb_publishable_…            4 pliki
     VAPID_PUBLIC_KEY            5 linii w sb.js
     SUPABASE_SERVICE_ROLE_KEY  34 pliki  ← NAZWA zmiennej w EF, poprawna
     eyJ… w index.html                    ← to base64 JPEG, nie JWT
   Reguła szeroka („service_role", „key", „eyJ") świeciłaby na czerwono przy
   większości commitów w sb.js i skończyłaby jak każda bramka krzycząca zawsze. */
const BLOKADY_TRESCI = [
  { re: /sb_secret_[A-Za-z0-9_-]{10,}/,
    opis: 'klucz sekretny Supabase (sb_secret_…)',
    ciBlokada: true,
    czemu: 'Klucz o pełnym dostępie. W repo publicznym = nieodwracalne.' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    opis: 'klucz prywatny',
    ciBlokada: true,
    czemu: 'Nigdy nie należy do repozytorium.' },
  /* ⚠️ KIERUNEK MA ZNACZENIE — rozdzielone 6.09.2026, po tym jak ta reguła
     zatrzymała w CI commit ZAMYKAJĄCY dostęp anona do zgłoszeń bólu
     (`revoke all on public.injuries from anon`). Jedna reguła traktowała GRANT
     i REVOKE identycznie i mówiła o obu „Wyciek danych — cofaj natychmiast".
     Bramka świeciła więc na czerwono dokładnie na pracy, dla której powstała,
     i kazała ją odwrócić — a jedynym wyjściem był `--no-verify`, którego CI
     nie ma. Praca zamykająca dziurę nie miała jak wejść na zielono.

     ⚠️ TO NIE JEST POLUZOWANIE OCHRONY I NA TYM POLEGA CAŁY ARGUMENT.
     Ta bramka pilnuje WYCIEKU. `GRANT … TO anon` otwiera dane
     niezalogowanemu — zostaje blokadą. `REVOKE … FROM anon` nie może niczego
     wyciec; najgorsze, co potrafi, to zepsuć funkcję zależną od anona
     (np. licznik na landingu idzie przez `community_km()` z własnym EXECUTE
     dla anon). To jest ryzyko REGRESJI, nie wycieku — a bramka od sekretów
     nie jest bramką od regresji i nie ma jak jej ocenić.
     Ostrzeżenie niesie za to KONKRETNĄ kontrolę do wykonania, tę samą, którą
     robiliśmy ręcznie 30.08 i 6.09: czy `authenticated` ma WŁASNY grant,
     czy dziedziczył po `anon`.

     ⚠️ ZNACZNIKA `bramka:przyklad` ŚWIADOMIE TU NIE UŻYWAMY. On jest dla
     linii, które WYGLĄDAJĄ na naruszenie, a są danymi testowymi. `revoke`
     w migracji jest prawdziwą instrukcją — oznaczenie jej „przykładem"
     zamieniłoby marker w furtkę i po trzech użyciach nikt by nie wiedział,
     co on właściwie znaczy. */
  { re: /\bGRANT\s+(ALL|SELECT|INSERT|UPDATE|DELETE|EXECUTE|USAGE)\b[^;]*\bTO\s+anon\b/i,
    opis: 'GRANT dla roli anon',
    ciBlokada: true,
    czemu: 'Uprawnienie dla NIEZALOGOWANEGO. Wyciek danych, nie usterka — cofaj natychmiast.' },
  { re: /\bREVOKE\s+(ALL|SELECT|INSERT|UPDATE|DELETE|EXECUTE|USAGE)\b[^;]*\bFROM\s+anon\b/i,
    opis: 'REVOKE dla roli anon (zawężenie dostępu)',
    czemu: 'Kierunek BEZPIECZNY — anon traci dostęp, nic nie wycieka. SPRAWDŹ JEDNO: '
         + 'czy `authenticated` ma WŁASNY grant, czy dziedziczył po `anon`.' },
  { re: /\b(GRANT|REVOKE)\s+(ALL|SELECT|INSERT|UPDATE|DELETE|EXECUTE|USAGE)\b/i,
    opis: 'GRANT / REVOKE',
    czemu: 'Zmiana uprawnień w bazie. Ten sam argument co migracja: CI tego nie cofnie.' },
  /* ⚠️ TRZY DZIURY ZMIERZONE 13.09.2026 w przeglądzie kierunku bramek — każda
     przechodziła 0 blokad / 0 ostrzeżeń, a asercja „przepuszcza zwykły commit"
     świeciła na zielono TAK SAMO z nimi, jak bez nich. Wspólna cecha: reguły
     wyżej rozpoznają SŁOWO uprawnienia po GRANT — a tu wycieku nie robi słowo,
     tylko jego brak albo inna składnia.

     (1) CZŁONKOSTWO W ROLI. `grant <rola> to anon` nie ma słowa SELECT/ALL,
         więc żadna reguła wyżej go nie widziała — a anon dostaje WSZYSTKO, co
         ma `serwisowa`. Kierunek ma znaczenie tak samo jak przy GRANT/REVOKE:
         `… TO anon` = wyciek (blokada, także w CI), `grant anon to <rola>` = ta rola
         dziedziczy uprawnienia anona, czyli niewiele (ostrzeżenie). */
  { re: /\bGRANT\s+(?!(?:ALL|SELECT|INSERT|UPDATE|DELETE|EXECUTE|USAGE|REFERENCES|TRIGGER|TRUNCATE|CREATE|CONNECT|TEMP|TEMPORARY)\b)[a-z_][\w]*(?:\s*,\s*[a-z_][\w]*)*\s+TO\s+anon\b/i,
    opis: 'GRANT <rola> TO anon (członkostwo w roli)',
    ciBlokada: true,
    czemu: 'anon dziedziczy WSZYSTKIE uprawnienia tej roli — bez ani jednego słowa SELECT w diffie. Wyciek, nie usterka.' },
  { re: /\bGRANT\s+(?!(?:ALL|SELECT|INSERT|UPDATE|DELETE|EXECUTE|USAGE|REFERENCES|TRIGGER|TRUNCATE|CREATE|CONNECT|TEMP|TEMPORARY)\b)[a-z_][\w]*(?:\s*,\s*[a-z_][\w]*)*\s+TO\s+[a-z_][\w]*/i,
    opis: 'GRANT <rola> TO <rola> (członkostwo w roli)',
    zawszeOstrzezenie: true,
    czemu: 'Nadanie roli innej roli — bez słowa uprawnienia, więc reguła GRANT/REVOKE tego nie widzi. Sprawdź, CO ta rola potrafi.' },
  /* (2) WYŁĄCZENIE RLS. Reguły nie było W OGÓLE — to nie para pod jednym
         wzorcem, tylko brak. Nie ma powodu, dla którego migracja miałaby
         wyłączać RLS; jeśli kiedyś będzie, niech to będzie świadoma rozmowa
         przy czerwonym runie, nie cicha linia w środku pliku. */
  { re: /\bALTER\s+TABLE\b[^;]*\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i,
    opis: 'wyłączenie RLS (DISABLE ROW LEVEL SECURITY)',
    ciBlokada: true,
    czemu: 'Każdy z grantem czyta i pisze CAŁĄ tabelę. Nie ma migracji, która tego potrzebuje — cofaj natychmiast.' },
  /* (3) NOWY OBIEKT W public. W Supabase `ALTER DEFAULT PRIVILEGES` dosypuje
         anonowi ALL KAŻDEJ nowej tabeli i KAŻDEMU nowemu widokowi (zmierzone
         w `pg_default_acl`; `public_training_logs` wystawiał 592 wiersze bez
         logowania mimo jawnego GRANT tylko dla authenticated). Wyciek dzieje
         się przez NIEOBECNOŚĆ tekstu — w diffie nie ma słowa GRANT, więc żadna
         reguła tekstowa go nie zobaczy. Nie blokada, bo tworzenie tabel jest
         normalne — ale komunikat ma mówić, co właśnie stało się niewidocznie.
         Ostrzeżenie GAŚNIE, gdy ten sam diff niesie `REVOKE … ON <obiekt>
         FROM anon` — patrz `bezRevoke()` niżej; to jedyna reguła tej bramki
         patrząca dalej niż jedna linia, bo tu warunkiem jest PARA. */
  { re: /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:UNLOGGED\s+)?(?:TABLE|VIEW|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?("?[a-z_][\w]*"?)\s*(?:\(|AS\b|WITH\b)/i,
    opis: 'nowa tabela / widok w public',
    zawszeOstrzezenie: true,
    obiektAnon: true,
    czemu: 'W Supabase CREATE TABLE/VIEW nadaje anon pełne DML przez ALTER DEFAULT PRIVILEGES — bez żadnego GRANT w diffie. '
         + 'Dołóż `REVOKE' + ' ALL ON <obiekt> FROM anon;` w TEJ SAMEJ migracji albo zapisz świadomie, dlaczego anon ma widzieć.' },
  { re: /\b(CREATE|ALTER|DROP)\s+POLICY\b/i,
    opis: 'zmiana polityki RLS',
    czemu: 'RLS decyduje, kto widzi cudze dane. Wymaga własnego zwiadu, nie commita przy okazji.' },
  { re: /\bDROP\s+(TABLE|SCHEMA|FUNCTION|TRIGGER)\b/i,
    opis: 'DROP obiektu bazy',
    czemu: 'Nieodwracalne bez kopii zapasowej.' },
];

// ── SEDNO: czysta funkcja, żeby samokontrola mogła ją nakarmić wprost ────────

/**
 * @param {{pliki: string[], dodane: string[]}} zmiana
 * @returns {{blokady: object[], ostrzezenia: object[]}}
 */
/* ⚠️ DWA TRYBY, BO BLOKADA ZNACZY CO INNEGO W KAZDYM Z NICH.
   W HOOKU blokada dziala PRZED — jest jeszcze czas pomyslec, wiec moze byc
   szeroka. W CI dziala PO: kod jest juz wypchniety, migracja juz poszla do bazy,
   a rollback KODU jej nie cofnie. Czerwony run ma wiec sens tylko tam, gdzie
   wlasciwa reakcja brzmi „cofnij natychmiast" — czyli przy sekretach
   i uprawnieniach dla `anon`. Reszta zostaje w CI OSTRZEZENIEM: widac ja
   w podsumowaniu runu, ale nie udaje, ze czemus zapobiegla.
   ⚠️ Zmierzone na 32 commitach z 16.08.2026: bramka zatrzymalaby 5, WSZYSTKIE
      na `supabase/migrations`. Sekrety i GRANT dla anon: ZERO trafien — czyli
      reguly, ktore zostaja blokada, nie generuja falszywych alarmow. */
function sprawdz(zmiana, tryb) {
  const wCI = tryb === 'ci';
  const blokady = [], ostrzezenia = [];
  const pliki = zmiana.pliki || [];
  const dodane = zmiana.dodane || [];

  for (const p of pliki) {
    /* Sciezki (migracje, sb.js, theme.css) w CI NIGDY nie blokuja: sa legalne,
       wymagaja uwagi, a w momencie runu juz sie wydarzyly. */
    for (const r of BLOKADY_SCIEZEK) if (r.re.test(p)) (wCI ? ostrzezenia : blokady).push({ gdzie: p, ...r });
    for (const r of OSTRZEZENIA_SCIEZEK) if (r.re.test(p)) ostrzezenia.push({ gdzie: p, ...r });
  }
  /* PRZYKLADY WLASNE. Bramka blokowala SAMA SIEBIE: asercje w tym pliku niosa
     wzorcowe polecenia nadania uprawnien, a bramka.yml wstrzykuje je celowo w tescie
     negatywnym. Bez wyjscia nikt nie moglby zmienic bramki ani jej CI.
     !! NIE wykluczamy po NAZWIE PLIKU - to byla by maskownica, ktora rosnie
        w ciszy. Wyjsciem jest SWIADOMY ZNACZNIK w tej samej linii: autor musi
        go dopisac recznie, wiec nie da sie przemycic sekretu przez przypadek.
     !! I twardy limit: powyzej MAX_PRZYKLADOW bramka PADA. Rosnaca lista
        wyjatkow znaczy, ze regula jest zla - nie ze potrzeba wiecej wyjatkow.
        Ta sama zasada co MIN_ZRODEL w bramce RUN_TYPES. */
  const ZNACZNIK = /bramka:przyklad/;
  const MAX_PRZYKLADOW = 12;
  let przykladow = 0;

  /* PARA CREATE ↔ REVOKE. Jedyna reguła patrząca dalej niż jedna linia:
     ostrzeżenie o nowym obiekcie gaśnie, gdy TEN SAM diff odbiera anonowi
     dostęp do TEGO obiektu. Instrukcja REVOKE bywa łamana na dwie linie
     (czasownik z `all` w jednej linii, `on public.x from anon` w następnej), więc szukamy w złączonym
     tekście dodanych linii, nie w pojedynczej. */
  const calosc = dodane.join('\n');
  const bezRevoke = (obiekt) => {
    const nazwa = obiekt.replace(/"/g, '');
    return !new RegExp('\\bREVOKE\\b[^;]*\\bON\\s+(?:TABLE\\s+)?(?:public\\.)?"?' + nazwa + '"?\\b[^;]*\\bFROM\\s+anon\\b', 'i').test(calosc);
  };

  for (const linia of dodane) {
    if (ZNACZNIK.test(linia)) { przykladow++; continue; }
    for (const r of BLOKADY_TRESCI) {
      const m = r.re.exec(linia);
      if (m) {
        if (r.obiektAnon && !bezRevoke(m[1])) break;   // para domknięta w tym samym diffie
        // treści nie drukujemy — mogłaby zawierać sam sekret
        const wpis = { gdzie: 'dodana linia (' + linia.trim().slice(0, 24).replace(/\S/g, '·') + '…)', ...r };
        if (r.obiektAnon) wpis.gdzie = 'obiekt ' + m[1];
        ((r.zawszeOstrzezenie || (wCI && !r.ciBlokada)) ? ostrzezenia : blokady).push(wpis);
        /* ⚠️ JEDNA LINIA = JEDEN POWÓD. Reguły są uporządkowane od najbardziej
           szczegółowej: `GRANT … TO anon` stoi PRZED ogólnym GRANT-em, więc
           trafia pierwsza. Bez tego `break` linia z uprawnieniem dla `anon`
           zgłaszała się DWA razy — raz jako blokada CI, raz jako ostrzeżenie —
           i psuła trzy asercje samokontroli, które słusznie oczekiwały jednej.
           Defekt wprowadzony razem z trybem CI 16.08.2026 i złapany przez
           samokontrolę, zanim wyszedł poza tę maszynę. */
        break;
      }
    }
  }
  if (przykladow > MAX_PRZYKLADOW) {
    blokady.push({
      gdzie: przykladow + ' linii ze znacznikiem bramka:przyklad (limit ' + MAX_PRZYKLADOW + ')',
      opis: 'za duzo wyjatkow',
      czemu: 'Rosnaca lista wyjatkow znaczy, ze regula jest zle postawiona. Popraw regule, nie limit.'
    });
  }
  return { blokady, ostrzezenia, przykladow };
}

// ── ODCZYT ZMIAN Z GITA ──────────────────────────────────────────────────────

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function zeStage() {
  const pliki = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  const dodane = git(['diff', '--cached', '--unified=0'])
    .split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
  return { pliki, dodane };
}

function zZakresu(zakres) {
  const pliki = git(['diff', '--name-only', zakres]).split('\n').filter(Boolean);
  const dodane = git(['diff', '--unified=0', zakres])
    .split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
  return { pliki, dodane };
}

// ── WYDRUK ───────────────────────────────────────────────────────────────────

function wypisz(w, naglowek) {
  console.log('\n  ' + naglowek);
  console.log('  ' + '─'.repeat(72));
  for (const o of w.ostrzezenia) {
    console.log('  ⚠  ' + o.opis);
    console.log('     ' + o.czemu + '\n');
  }
  for (const b of w.blokady) {
    console.log('  ✖  BLOKADA — ' + b.opis + '   [' + b.gdzie + ']');
    console.log('     ' + b.czemu + '\n');
  }
  if (!w.blokady.length && !w.ostrzezenia.length) console.log('  ✅ Nic do zgłoszenia.\n');
  else if (!w.blokady.length) console.log('  ✅ Same ostrzeżenia — przechodzi.\n');
}

// ── SAMOKONTROLA ─────────────────────────────────────────────────────────────
// !! OBIE STRONY. Bramka blokująca wszystko przechodzi każdy test na blokowanie,
//    a bramka nieblokująca niczego przechodzi każdy test na przepuszczanie.
//    Punkty 4-6 są tu ważniejsze od 1-3.
function samokontrola() {
  let bledy = 0;
  const ok = (war, opis) => { console.log('  ' + (war ? 'OK  ' : 'PAD ') + opis); if (!war) bledy++; };
  const P = (pliki, dodane) => sprawdz({ pliki: pliki || [], dodane: dodane || [] });

  console.log('\n  1) BLOKUJE to, co ma blokować');
  ok(P(['supabase/migrations/20260816_x.sql']).blokady.length === 1, 'migracja bazy');
  ok(P([], ['  Authorization: Bearer sb_secret_gelF7yVwgAAAAAAAAAAAAAAAAAAAAAAAA']).blokady.length === 1, 'sb_secret_');   // bramka:przyklad
  ok(P([], ['-----BEGIN RSA PRIV' + 'ATE KEY-----']).blokady.length === 1, 'klucz prywatny');
  ok(P([], ['GRA' + 'NT SELECT ON public.athletes TO anon;']).blokady.length === 1, 'nadanie uprawnien');
  ok(P([], ['REVO' + 'KE ALL ON FUNCTION x FROM authenticated;']).blokady.length === 1, 'odebranie uprawnien');
  ok(P([], ['CREATE POL' + 'ICY read_all ON public.athletes FOR SELECT USING (true);']).blokady.length === 1, 'polityka RLS');
  ok(P([], ['DR' + 'OP TABLE public.achievements;']).blokady.length === 1, 'usuniecie tabeli');

  console.log('\n  2) OSTRZEGA, ale NIE blokuje');
  {
    const w = P(['sb.js']);
    ok(w.blokady.length === 0 && w.ostrzezenia.length === 1, 'sb.js ostrzega i przepuszcza');
    ok(/27 stron/.test(w.ostrzezenia[0].opis), 'komunikat mówi, czym jest sb.js');
  }
  ok(P(['theme.css']).blokady.length === 0, 'theme.css nie blokuje');

  console.log('\n  3) NIE zdradza treści sekretu w komunikacie');
  {
    const w = P([], ['const k = "sb_secret_gelF7yVwgAAAAAAAAAAAAAAAAAAAAAAAA";']);   // bramka:przyklad
    const tekst = JSON.stringify(w.blokady);
    ok(!/sb_secret_gelF/.test(tekst), 'sekret zamaskowany w wydruku');
  }

  console.log('\n  4) PRZEPUSZCZA zwykły commit — bez tego blokuje wszystko i „działa"');
  {
    const w = P(['zawodnik.html', 'tests/czas.test.js'], ['  const x = 1;', '  // komentarz']);
    ok(w.blokady.length === 0 && w.ostrzezenia.length === 0, 'html + test: cicho');
  }
  ok(P(['odznaki.html'], ['  {id:\'x\', name:\'Y\', rarity:\'rare\'},']).blokady.length === 0, 'zmiana danych odznak');

  console.log('\n  5) PRZEPUSZCZA to, co WYGLĄDA na sekret, a jest publiczne');
  ok(P([], ['const KEY = "sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY";']).blokady.length === 0, 'sb_publishable_');
  ok(P([], ["window.VAPID_PUBLIC_KEY = 'BATC1Y7rglazNCcKQXV1bqaNA_SnxC3003c5';"]).blokady.length === 0, 'VAPID_PUBLIC_KEY');
  ok(P([], ["Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')"]).blokady.length === 0, 'NAZWA zmiennej środowiskowej');
  ok(P([], ['background-image:url("data:image/jpeg;base64,eyJk0Mq/9j/4AAQSkZJRgABAQ")']).blokady.length === 0, 'base64 JPEG udający JWT');
  ok(P([], ['  // service_role ma pełny dostęp — patrz komentarz wyżej']).blokady.length === 0, 'słowo service_role w komentarzu');

  console.log('\n  6) NIE blokuje SQL-a, który tylko CZYTA');
  ok(P(['tools/pomiar.sql'], ['select count(*) from public.athletes;']).blokady.length === 0, 'zwykły SELECT');
  /* ⚠️ TA ASERCJA MIAŁA ODWROTNE OCZEKIWANIE i przez to samokontrola padała.
     Zmierzone: reguła to `(GRANT|REVOKE)\s+(ALL|SELECT|…)`, więc wymaga
     SŁOWA UPRAWNIENIA po czasowniku. Samo słowo „GRANT" w zdaniu nie odpala —
     i dobrze, bo inaczej każdy komentarz o uprawnieniach byłby blokadą.
     Poprawione zostało OCZEKIWANIE, nie reguła: zachowanie było właściwe. */
  ok(P([], ['-- kiedyś trzeba będzie zrobić GRANT, ale nie teraz']).blokady.length === 0,
     'samo słowo GRANT w zdaniu NIE blokuje (reguła wymaga uprawnienia po czasowniku)');
  ok(P([], ['-- GRA' + 'NT SELECT ON athletes TO anon;']).blokady.length === 1,
     'zakomentowany PRAWDZIWY GRANT jednak blokuje (fałszywy alarm tańszy niż przeoczenie)');

  console.log('\n  7) TRYB CI - blokuje tylko to, na co reakcja to „cofnij natychmiast"');
  const C = (pliki, dodane) => sprawdz({ pliki: pliki || [], dodane: dodane || [] }, 'ci');
  ok(C([], ['sb_sec' + 'ret_AbCdEfGhIjKlMnOp']).blokady.length === 1, 'sekret BLOKUJE w CI');
  ok(C([], ['-----BEGIN RSA PRIV' + 'ATE KEY-----']).blokady.length === 1, 'klucz prywatny BLOKUJE w CI');
  ok(C([], ['GRA' + 'NT SELECT ON public.athletes TO anon;']).blokady.length === 1,
     'GRANT dla anon BLOKUJE w CI');
  /* ⚠️ KIERUNEK: para asercji pilnujaca rozdzialu z 6.09.2026. Do tego dnia
     stalo tu „REVOKE dla anon BLOKUJE w CI" i to bylo SPRAWDZANE — czyli
     bramka zatrzymywala commit ZAMYKAJACY dostep anona i kazala go cofnac,
     a samokontrola potwierdzala, ze robi to poprawnie. Zieleń testu nie znaczy
     wiec, ze regula jest dobra; znaczy tylko, ze robi to, co napisano.
     Obie strony musza byc przypiete, inaczej jedno „uproszczenie" regexpu
     wraca do stanu, w ktorym naprawa nie ma jak wejsc na zielono. */
  {
    const w = C([], ['REVO' + 'KE ALL ON public.injuries FROM anon;']);
    ok(w.blokady.length === 0 && w.ostrzezenia.length >= 1,
       'REVOKE od anona OSTRZEGA, nie blokuje (zawezenie to nie wyciek)');
    ok(/authenticated/i.test(JSON.stringify(w.ostrzezenia)),
       '...i mowi, CO sprawdzic: czy authenticated ma wlasny grant');
  }
  ok(C([], ['GRA' + 'NT ALL ON public.injuries TO anon;']).blokady.length === 1,
     'GRANT dla anona NADAL blokuje (dowod, ze rozdzial nie zdjal ochrony)');
  ok(C([], ['GRA' + 'NT SELECT ON public.x TO authenticated;']).blokady.length === 0,
     'GRANT dla authenticated to w CI OSTRZEZENIE, nie blokada');
  ok(C(['supabase/migrations/2026_x.sql'], []).blokady.length === 0,
     'migracja NIE blokuje w CI (juz poszla do bazy, rollback kodu jej nie cofnie)');
  ok(C(['supabase/migrations/2026_x.sql'], []).ostrzezenia.length === 1,
     '...ale ostrzezenie ZOSTAJE widoczne w podsumowaniu runu');
  ok(P(['supabase/migrations/2026_x.sql'], []).blokady.length === 1,
     'w HOOKU migracja nadal BLOKUJE — tam jest jeszcze czas pomyslec');

  console.log('\n  8) ZNACZNIK bramka:przyklad - wyjscie dla wlasnych danych testowych');
  ok(P([], ['GRA' + 'NT SELECT ON athletes TO anon;   // bramka:przyklad']).blokady.length === 0,
     'linia ze znacznikiem NIE blokuje');
  ok(P([], ['GRA' + 'NT SELECT ON athletes TO anon;']).blokady.length === 1,
     'ta sama linia BEZ znacznika nadal blokuje');
  ok(P([], ['sb_secret_AbCdEfGhIjKlMnOp   // bramka:przyklad']).blokady.length === 0,
     'znacznik dziala tez dla sekretu (autor dopisuje go swiadomie)');
  ok(P([], new Array(13).fill('GRA' + 'NT SELECT ON x TO y;  // bramka:przyklad')).blokady.length === 1,
     'PONAD limit 12 wyjatkow -> bramka PADA (rosnaca lista = zla regula)');
  ok(P([], new Array(12).fill('GRA' + 'NT SELECT ON x TO y;  // bramka:przyklad')).blokady.length === 0,
     'dokladnie 12 wyjatkow jeszcze przechodzi');

  console.log('\n  9) TRZY DZIURY Z 13.09.2026 — asercje NEGATYWNE, wrazliwe na KIERUNEK');
  /* ⚠️ Do 13.09 kazda z tych linii dawala 0 blokad / 0 ostrzezen, a asercja
     „przepuszcza zwykly commit" swiecila na zielono TAK SAMO z nimi. To jest
     wlasciwy objaw: nie brak testu, tylko test niewrazliwy na kierunek.
     Dlatego kazda para nizej ma DWIE strony: zla przechodzi na czerwono,
     odwrotna (albo domknieta) na zielono. */
  const cicho = (w) => w.blokady.length === 0 && w.ostrzezenia.length === 0;
  {
    /* (1) czlonkostwo w roli */
    const doAnon = C([], ['gra' + 'nt serwisowa to anon;']);
    ok(doAnon.blokady.length === 1, 'GRANT <rola> TO anon BLOKUJE w CI (anon dziedziczy cudze uprawnienia)');
    ok(P([], ['gra' + 'nt serwisowa to anon;']).blokady.length === 1, '...i w hooku');
    const odAnona = P([], ['gra' + 'nt anon to serwisowa;']);
    ok(odAnona.blokady.length === 0 && odAnona.ostrzezenia.length === 1,
       'GRANT anon TO <rola> tylko OSTRZEGA (kierunek odwrotny: rola dziedziczy po anonie)');
    ok(!cicho(odAnona), '...ale NIE jest cicho — do 13.09 przechodzilo 0/0');
    const dwie = P([], ['gra' + 'nt czytelnik, pisarz to serwisowa;']);
    ok(dwie.ostrzezenia.length === 1 && dwie.blokady.length === 0, 'lista rol przed TO tez rozpoznana');
    ok(P([], ['gra' + 'nt usage on schema public to authenticated;']).ostrzezenia.length === 0 ||
       P([], ['gra' + 'nt usage on schema public to authenticated;']).blokady.length === 1,
       'GRANT' + ' USAGE (uprawnienie) NIE udaje czlonkostwa — trafia w regule uprawnien');
  }
  {
    /* (2) wylaczenie RLS — regula, ktorej NIE BYLO */
    const off = 'alter table public.injuries dis' + 'able row level security;';
    ok(P([], [off]).blokady.length === 1, 'DISABLE ROW LEVEL SECURITY blokuje w hooku');
    ok(C([], [off]).blokady.length === 1, '...i w CI (cofaj natychmiast)');
    const on = P([], ['alter table public.injuries enable row level security;']);
    ok(cicho(on), 'ENABLE ROW LEVEL SECURITY przechodzi CICHO — kierunek bezpieczny, zero szumu');
    const force = P([], ['alter table public.injuries force row level security;']);
    ok(cicho(force), 'FORCE ROW LEVEL SECURITY tez cicho (zaostrzenie)');
  }
  {
    /* (3) nowy obiekt w public = niewidzialny grant dla anon */
    const tbl = P([], ['cre' + 'ate table public.nowa (id uuid primary key, dane text);']);
    ok(tbl.blokady.length === 0 && tbl.ostrzezenia.length === 1, 'CREATE TABLE ostrzega, nie blokuje');
    ok(/DEFAULT PRIVILEGES/.test(tbl.ostrzezenia[0].czemu) && new RegExp('REVOKE' + ' ALL').test(tbl.ostrzezenia[0].czemu),
       '...i mowi, CO stalo sie niewidocznie i CO dolozyc');
    ok(tbl.ostrzezenia[0].gdzie === 'obiekt nowa', '...i nazywa obiekt po imieniu');
    const vw = P([], ['cre' + 'ate or replace view public.nowy_widok as select 1;']);
    ok(vw.ostrzezenia.length === 1, 'CREATE VIEW tak samo (widok owner-run omija RLS — public_training_logs, 592 wiersze)');
    const para = P([], ['cre' + 'ate table public.nowa (id uuid primary key);',
                        'revo' + 'ke all on public.nowa from anon;']);
    ok(!para.ostrzezenia.some((o) => o.obiektAnon), 'CREATE + REVOKE … FROM anon w tym samym diffie: ostrzezenie GASNIE (para domknieta)');
    const paraLamana = P([], ['cre' + 'ate table public.nowa (id uuid primary key);',
                              'revo' + 'ke all', '  on public.nowa from anon;']);
    ok(!paraLamana.ostrzezenia.some((o) => o.obiektAnon), '...takze gdy REVOKE jest zlamany na dwie linie');
    const innaTabela = P([], ['cre' + 'ate table public.nowa (id uuid primary key);',
                              'revo' + 'ke all on public.inna from anon;']);
    ok(innaTabela.ostrzezenia.some((o) => o.obiektAnon), 'REVOKE na INNYM obiekcie NIE gasi ostrzezenia (para musi dotyczyc tego samego)');
    const odAuth = P([], ['cre' + 'ate table public.nowa (id uuid primary key);',
                          'revo' + 'ke all on public.nowa from authenticated;']);
    ok(odAuth.ostrzezenia.some((o) => o.obiektAnon), 'REVOKE od authenticated NIE gasi — pilnujemy anona, nie kogokolwiek');
    ok(cicho(P([], ['cre' + 'ate temp table roboczo (x int);'])), 'CREATE TEMP TABLE cicho — poza public, default privileges nie dotyczy');
    ok(cicho(P([], ['cre' + 'ate index if not exists i on public.nowa (id);'])), 'CREATE INDEX cicho — to nie obiekt z grantami');
  }

  console.log('\n  ' + (bledy
    ? '✖ ' + bledy + ' asercji padło — BRAMCE NIE MOŻNA UFAĆ'
    : '✅ Bramka blokuje to, co trzeba, i przepuszcza resztę.') + '\n');
  return bledy ? 1 : 0;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

function main() {
  if (process.argv.includes('--samokontrola')) return samokontrola();

  const i = process.argv.indexOf('--zakres');
  let zmiana, naglowek;
  try {
    if (i !== -1 && process.argv[i + 1]) {
      zmiana = zZakresu(process.argv[i + 1]);
      naglowek = 'BRAMKA — zakres ' + process.argv[i + 1];
    } else {
      zmiana = zeStage();
      naglowek = 'BRAMKA — zmiany zastage\'owane';
    }
  } catch (e) {
    console.error('\n  ✖ Nie udało się odczytać zmian z gita: ' + (e.message || e).split('\n')[0] + '\n');
    return 1;
  }

  const tryb = process.argv.includes('--ci') ? 'ci' : 'hook';
  const w = sprawdz(zmiana, tryb);
  wypisz(w, naglowek + (tryb === 'ci' ? '   [CI: blokuja tylko sekrety i anon]' : '') + '   (' + zmiana.pliki.length + ' plików, ' + zmiana.dodane.length + ' dodanych linii)');
  return w.blokady.length ? 1 : 0;
}

module.exports = { sprawdz, BLOKADY_SCIEZEK, OSTRZEZENIA_SCIEZEK, BLOKADY_TRESCI };
if (require.main === module) process.exit(main());
