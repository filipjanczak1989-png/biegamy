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
  { re: /\b(GRANT|REVOKE)\s+(ALL|SELECT|INSERT|UPDATE|DELETE|EXECUTE|USAGE)\b[^;]*\b(TO|FROM)\s+anon\b/i,
    opis: 'GRANT / REVOKE dla roli anon',
    ciBlokada: true,
    czemu: 'Uprawnienie dla NIEZALOGOWANEGO. Wyciek danych, nie usterka — cofaj natychmiast.' },
  { re: /\b(GRANT|REVOKE)\s+(ALL|SELECT|INSERT|UPDATE|DELETE|EXECUTE|USAGE)\b/i,
    opis: 'GRANT / REVOKE',
    czemu: 'Zmiana uprawnień w bazie. Ten sam argument co migracja: CI tego nie cofnie.' },
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

  for (const linia of dodane) {
    if (ZNACZNIK.test(linia)) { przykladow++; continue; }
    for (const r of BLOKADY_TRESCI) {
      if (r.re.test(linia)) {
        // treści nie drukujemy — mogłaby zawierać sam sekret
        const wpis = { gdzie: 'dodana linia (' + linia.trim().slice(0, 24).replace(/\S/g, '·') + '…)', ...r };
        ((wCI && !r.ciBlokada) ? ostrzezenia : blokady).push(wpis);
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
  ok(C([], ['REVO' + 'KE ALL ON public.athletes FROM anon;']).blokady.length === 1,
     'REVOKE dla anon BLOKUJE w CI');
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
