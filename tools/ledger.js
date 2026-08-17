#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// LEDGER — tygodniowy raport: co poszło na produkcję i co się po tym psuło.
//
// !! RAPORT TRAFIA DO PUBLICZNEGO REPO. `.ai/` jest śledzone, a GitHub Pages
//    serwuje pliki z kropką (sprawdzone przy .gitignore: /.gitignore → 200).
//    Dlatego do pliku idą WYŁĄCZNIE dane zagregowane: znormalizowana treść
//    usterki, kohorta przeglądarki i liczby. Nigdy user_id, e-mail, pełny URL
//    ani surowy user_agent. Pilnuje tego BARIERA_PII + --samokontrola.
//
// !! GRUPOWANIE NIE JEST TUTAJ. Idzie z
//    supabase/functions/_shared/grupowanie-bledow.mjs — tego samego modułu
//    używa tools/przeglad-bledow.js i digest w EF. Trzecia kopia rozjechałaby
//    się przy pierwszej zmianie.
//
// !! TO NIE JEST TEST. Odpowiedź zmienia się z każdym commitem i każdym błędem
//    zgłoszonym przez czyjąś przeglądarkę.
//
// UŻYCIE
//     node tools/ledger.js                          → bieżący tydzień (pn–dziś)
//     node tools/ledger.js --od 2026-08-14 --do 2026-08-17
//     node tools/ledger.js --zapisz                 → zapisz do .ai/ledger/
//     node tools/ledger.js --nadpisz                → zapisz MIMO dopisków
//     node tools/ledger.js --samokontrola           → bariera PII, dopiski, daty
//
// !! `--zapisz` ODMAWIA, gdy raport za dany tydzień istnieje i KTOŚ COŚ W NIM
//    DOPISAŁ. Dopiski są pracą człowieka i narzędzie nie ma prawa jej cicho
//    zjeść. Raport nietknięty nadpisuje się bez pytania — nie ma czego stracić.
//
// Kod wyjścia: 0 = raport zrobiony, 1 = błąd odczytu albo samokontrola padła.
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const WORKDIR = process.env.SB_AUDIT_WORKDIR || path.join(os.homedir(), '.cache', 'sb-audit');
const KATALOG = path.join(__dirname, '..', '.ai', 'ledger');

/* ── BARIERA PII ────────────────────────────────────────────────────────────
   Ostatnia linia obrony przed wypchnięciem cudzych danych pod publiczny adres.
   Nie ufa normalizacji z modułu grupującego — ta czyści URL-e i długie liczby,
   ale nie zna się na e-mailach ani UUID-ach. Jeśli cokolwiek przejdzie, raport
   NIE POWSTAJE. Lepiej brak raportu niż raport z czyimś adresem. */
const BARIERA_PII = [
  { nazwa: 'e-mail',  re: /[\w.+-]+@[\w-]+\.[\w.]+/ },
  { nazwa: 'UUID',    re: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i },
  { nazwa: 'adres z hostem', re: /https?:\/\/(?!<)/ }
];
function sprawdzPII(tekst) {
  return BARIERA_PII.filter(b => b.re.test(tekst)).map(b => b.nazwa);
}

/* Czy ktoś dopisał coś ręcznie w sekcji „Dopiski". Odejmujemy komentarz HTML
   (szablon) i zaślepkę `_(brak)_` — co zostanie, jest pracą człowieka.
   ⚠️ Sprawdza WYŁĄCZNIE sekcję po nagłówku `## Dopiski`: dopisek w środku
   raportu i tak zostanie nadpisany, bo tamta treść jest generowana. */
function maDopiski(tekst) {
  const po = String(tekst).split('## Dopiski')[1];
  if (po === undefined) return false;
  return po.replace(/<!--[\s\S]*?-->/g, '')
           .replace(/_\(brak\)_/g, '')
           .trim().length > 0;
}

// ── DATY ────────────────────────────────────────────────────────────────────
function iso(d) { return d.toISOString().slice(0, 10); }
function poniedzialek(d) {
  const x = new Date(d.getTime());
  const dow = (x.getUTCDay() + 6) % 7;               // Pn=0 … Nd=6
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

// ── ŹRÓDŁO 1: GIT ───────────────────────────────────────────────────────────
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', cwd: path.join(__dirname, '..') });
}

/* Deploy rozpoznajemy po commicie „chore: bump SW cache", bo robi go krok
   „Commit bump back" w deploy.yml — czyli powstaje DOPIERO, gdy workflow
   przeszedł.
   ⚠️ To jest WSKAŹNIK ZASTĘPCZY i tak ma być czytany (LEKCJE #11): mówi
   „workflow się dokończył", a nie „kod dotarł do ludzi". Między jednym
   a drugim jest jeszcze cache Service Workera po stronie przeglądarki. */
/* ⚠️ FILTRUJEMY PO DACIE AUTORA, NIE COMMITTERA — i to nie jest drobiazg.
   `git log --since/--until` patrzy na datę COMMITTERA, którą przepisuje każdy
   rebase. Zmierzone 18.08.2026: po rebase trzech commitów na świeży origin/main
   raport za tydzień 14–17.08 przeliczył się z 52 na 65 commitów — czyli
   HISTORYCZNA liczba zmieniła się pod ręką, bo zmieniła się historia, a nie to,
   co się w tamtym tygodniu wydarzyło. Ledger, którego przeszłe liczby się
   przesuwają, nie jest ledgerem.
   Data autora jest odporna na rebase, więc raport za zamknięty tydzień zawsze
   daje ten sam wynik. Zakres bierzemy z zapasem i tniemy w JS, bo git nie umie
   filtrować po dacie autora. */
function przesun(dataISO, dni) {
  const d = new Date(dataISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dni);
  return d.toISOString().slice(0, 10);
}
function commity(od, doDnia) {
  /* ⚠️ Granice liczone w JS, nie wyrażeniem gita. `--since="2026-08-14 -60 days"`
     PARSUJE SIĘ, ale znaczy co innego, niż wygląda — sprawdzone: dało 176 commitów
     zamiast 1578. Git nie liczy tam arytmetyki na podanej dacie, tylko interpretuje
     całość po swojemu. Jawne daty ISO nie zostawiają miejsca na domysły. */
  const out = git(['log', '--since=' + przesun(od, -60), '--until=' + przesun(doDnia, 60),
                   '--date=short', '--format=%h\x1f%ad\x1f%s']);
  return out.split('\n').filter(Boolean).map(l => {
    const [sha, data, temat] = l.split('\x1f');
    return { sha, data, temat, bump: /bump SW cache/i.test(temat) };
  }).filter(c => c.data >= od && c.data <= doDnia);
}


// ── ŹRÓDŁO 2: BŁĘDY KLIENTA ─────────────────────────────────────────────────
function pobierzBledy(od, doDnia) {
  const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  const plik = path.join(kat, 'q.sql');
  fs.writeFileSync(plik,
    `select message, url, user_agent, user_id::text as user_id, created_at::text as created_at
     from public.client_errors
     where created_at >= date '${od}' and created_at < date '${doDnia}' + 1
     order by created_at;`);
  try {
    const out = execFileSync('supabase',
      ['db', 'query', '--linked', '--workdir', WORKDIR, '-o', 'json', '-f', plik],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const start = out.indexOf('{');
    if (start === -1) throw new Error('brak JSON w odpowiedzi CLI — czy `supabase` jest zalogowane?');
    const dane = JSON.parse(out.slice(start, out.lastIndexOf('}') + 1));
    return dane.rows || [];
  } finally {
    fs.rmSync(kat, { recursive: true, force: true });
  }
}

// ── RAPORT ──────────────────────────────────────────────────────────────────
async function zbuduj(od, doDnia) {
  const grup = await import('file://' +
    path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'grupowanie-bledow.mjs')
      .replace(/\\/g, '/'));

  const cs = commity(od, doDnia);
  const deploye = cs.filter(c => c.bump);
  const wlasne  = cs.filter(c => !c.bump);

  let bledy = [], bladOdczytu = null;
  try { bledy = pobierzBledy(od, doDnia); }
  catch (e) { bladOdczytu = e.message; }

  /* ⚠️ `grupuj` zwraca OBIEKT { grupy, pominietych, wierszy }, nie tablicę,
     a pojedyncza grupa niesie `wierszy` i `osob` — nie `ile`. Pomyliłem to przy
     pierwszym podejściu i raport pokazał „zero zgłoszeń" przy 65 wierszach
     w bazie. Wyłapało to ostrzeżenie o zerze wpisane sekcję niżej — i dlatego
     ono tam jest: zero na liczniku najczęściej znaczy zepsuty przyrząd. */
  const wynik = bladOdczytu ? { grupy: [], pominietych: 0, wierszy: 0 } : grup.grupuj(bledy);
  const grupy = wynik.grupy;

  const L = [];
  L.push('# Ledger — tydzień ' + od + ' … ' + doDnia);
  L.push('');
  L.push('Wygenerowane ' + iso(new Date()) + ' przez `tools/ledger.js`.');
  L.push('Dopiski ręczne są mile widziane — to zwykły markdown, a raport');
  L.push('generowany + komentarz człowieka to dopiero pełny obraz.');
  L.push('');

  // ── 1. CO POSZŁO NA PRODUKCJĘ ──
  L.push('## Co poszło na produkcję');
  L.push('');
  L.push('- commitów własnych: **' + wlasne.length + '**');
  L.push('- deployów (commit „bump SW cache" = workflow się dokończył): **' + deploye.length + '**');
  L.push('');
  const wgDnia = {};
  wlasne.forEach(c => { (wgDnia[c.data] = wgDnia[c.data] || []).push(c); });
  Object.keys(wgDnia).sort().forEach(d => {
    const ile = wgDnia[d].length;
    const dep = deploye.filter(x => x.data === d).length;
    L.push('- **' + d + '** — ' + ile + ' commit' + (ile === 1 ? '' : 'ów') +
           ', ' + dep + ' deploy' + (dep === 1 ? '' : 'ów'));
  });
  L.push('');

  // ── 2. CO SIĘ PSUŁO ──
  L.push('## Co się psuło u ludzi');
  L.push('');
  if (bladOdczytu) {
    L.push('⚠️ **Nie udało się odczytać `client_errors`:** ' + bladOdczytu);
    L.push('Sekcja korelacji poniżej jest z tego powodu pusta — brak danych to');
    L.push('brak danych, nie zero błędów.');
  } else if (!grupy.length) {
    L.push('Zero zgłoszeń w tym oknie.');
    L.push('');
    L.push('⚠️ Zero na liczniku bywa poprawnym pomiarem, ale bywa też zepsutym');
    L.push('przyrządem (LEKCJE #10). Przy zerze sprawdź, czy `client_errors`');
    L.push('w ogóle przyjmuje wpisy, zanim uznasz to za dobrą wiadomość.');
  } else {
    L.push('_Pominięto ' + wynik.pominietych + ' z ' + wynik.wierszy +
           ' wierszy (diagnostyczne albo bez treści)._');
    L.push('');
    L.push('| usterka | wystąpień | osób | kohorty |');
    L.push('|---|---|---|---|');
    grupy.slice(0, 15).forEach(g => {
      const koh = (g.kohorty || []).map(k => k.nazwa + ' ' + k.ile).join(', ') || '—';
      L.push('| ' + String(g.usterka).replace(/\|/g, '\\|') + ' | ' + g.wierszy +
             ' | ' + g.osob + ' | ' + koh + ' |');
    });
    if (grupy.length > 15) L.push('');
    if (grupy.length > 15) L.push('…i ' + (grupy.length - 15) + ' rzadszych usterek.');
  }
  L.push('');

  // ── 3. KORELACJA — Z ZASTRZEŻENIEM W NAGŁÓWKU ──
  L.push('## Po deployu przyszły błędy — ⚠️ WSKAZÓWKA, NIE WERDYKT');
  L.push('');
  L.push('⚠️ **Ta sekcja pokazuje zbieżność w czasie, nie przyczynę.** Przy');
  L.push('kilkudziesięciu deployach tygodniowo prawie każdy błąd ma jakiś deploy');
  L.push('kilka godzin wcześniej — korelacja czasowa jest przy takiej gęstości');
  L.push('**słaba** i służy wyłącznie jako podpowiedź, gdzie zajrzeć.');
  L.push('');
  L.push('⚠️ Dochodzi drugie zastrzeżenie: „deploy" to tu commit `bump SW cache`,');
  L.push('czyli sygnał, że **workflow się dokończył** — a nie że kod dotarł');
  L.push('do przeglądarek. Między jednym a drugim stoi cache Service Workera.');
  L.push('');
  L.push('**Nie zapisuj z tej tabeli zdania „deploy X wywołał błąd Y".** To jest');
  L.push('dokładnie LEKCJE #11 — wskaźnik zastępczy podany jako pomiar. Jeśli');
  L.push('chcesz orzec przyczynę, potrzebny jest osobny dowód: treść zmiany,');
  L.push('kohorta i to, czy błąd znika po cofnięciu.');
  L.push('');
  if (!bladOdczytu && grupy.length && deploye.length) {
    L.push('| usterka | pierwsze wystąpienie | ostatni deploy przed nim |');
    L.push('|---|---|---|');
    grupy.slice(0, 8).forEach(g => {
      const pierwsze = g.pierwsze || g.od || '—';
      const dzien = String(pierwsze).slice(0, 10);
      const przed = deploye.filter(d => d.data <= dzien).slice(-1)[0];
      L.push('| ' + String(g.usterka).replace(/\|/g, '\\|') + ' | ' + dzien +
             ' | ' + (przed ? przed.sha + ' (' + przed.data + ')' : '— brak przed') + ' |');
    });
  } else {
    L.push('_Brak danych do zestawienia._');
  }
  L.push('');

  // ── 4. MIEJSCE NA DOPISKI ──
  L.push('## Dopiski');
  L.push('');
  L.push('<!-- Miejsce na komentarz człowieka. Raport generowany nie wie, że');
  L.push('     seria poprawek w jednym pliku bywa JEDNĄ diagnozą, a nie pięcioma');
  L.push('     błędami. To wie tylko ten, kto je pisał. -->');
  L.push('');
  L.push('_(brak)_');
  L.push('');

  return L.join('\n');
}

// ── SAMOKONTROLA ────────────────────────────────────────────────────────────
function samokontrola() {
  let ok = 0, zle = 0;
  const spr = (opis, warunek, got) => {
    if (warunek) { ok++; console.log('  ✓ ' + opis); }
    else { zle++; console.log('  ✗ ' + opis + (got !== undefined ? '  → ' + got : '')); }
  };
  console.log('\nSAMOKONTROLA — bariera PII');
  spr('łapie e-mail',      sprawdzPII('kontakt: a.b@c.pl').includes('e-mail'));
  spr('łapie UUID',        sprawdzPII('id 0064784f-f24f-4dd0-b1d3-8269b4e46c27').includes('UUID'));
  spr('łapie pełny adres', sprawdzPII('padło na https://biegamy.run/x').includes('adres z hostem'));
  spr('przepuszcza <url> po normalizacji', sprawdzPII('błąd w <url> linia <n>').length === 0);
  spr('przepuszcza czysty tekst', sprawdzPII('ReferenceError: PRSclose').length === 0);

  console.log('\nSAMOKONTROLA — ochrona dopisków');
  const szablon = '## Dopiski\n\n<!-- komentarz szablonu -->\n\n_(brak)_\n';
  spr('świeży raport nie ma dopisków', maDopiski(szablon) === false);
  spr('raport z dopiskiem jest wykrywany',
      maDopiski(szablon.replace('_(brak)_', 'seria w sw.js to była JEDNA diagnoza')) === true);
  spr('sam komentarz HTML to nie dopisek',
      maDopiski('## Dopiski\n<!-- tylko szablon -->\n') === false);
  spr('brak sekcji Dopiski → brak dopisków (stary format)',
      maDopiski('# Raport bez tej sekcji') === false);

  console.log('\nSAMOKONTROLA — daty');
  spr('poniedziałek z wtorku', iso(poniedzialek(new Date('2026-08-18T00:00:00Z'))) === '2026-08-17',
      iso(poniedzialek(new Date('2026-08-18T00:00:00Z'))));
  spr('poniedziałek z niedzieli', iso(poniedzialek(new Date('2026-08-16T00:00:00Z'))) === '2026-08-10',
      iso(poniedzialek(new Date('2026-08-16T00:00:00Z'))));
  spr('poniedziałek z poniedziałku', iso(poniedzialek(new Date('2026-08-17T00:00:00Z'))) === '2026-08-17');

  console.log('\n  zaliczone: ' + ok + '   niezaliczone: ' + zle + '\n');
  process.exit(zle === 0 ? 0 : 1);
}

// ── WEJŚCIE ─────────────────────────────────────────────────────────────────
(async function () {
  const a = process.argv.slice(2);
  if (a.includes('--samokontrola')) return samokontrola();

  const argOd = a.indexOf('--od'), argDo = a.indexOf('--do');
  const dzisiaj = new Date();
  const od = argOd >= 0 ? a[argOd + 1] : iso(poniedzialek(dzisiaj));
  const doDnia = argDo >= 0 ? a[argDo + 1] : iso(dzisiaj);

  let raport;
  try { raport = await zbuduj(od, doDnia); }
  catch (e) { console.error('BŁĄD: ' + e.message); process.exit(1); }

  const znalezione = sprawdzPII(raport);
  if (znalezione.length) {
    console.error('\n⚠ BARIERA PII ZATRZYMAŁA RAPORT. Znalezione: ' + znalezione.join(', '));
    console.error('  Raport NIE powstał. Repo jest publiczne i serwuje pliki z kropką —');
    console.error('  lepiej brak raportu niż raport z czyimiś danymi.\n');
    process.exit(1);
  }

  if (a.includes('--zapisz') || a.includes('--nadpisz')) {
    fs.mkdirSync(KATALOG, { recursive: true });
    const plik = path.join(KATALOG, od + '_tydzien.md');

    /* ⚠️ ODMOWA, NIE SCALANIE. Raport jest generowany, ale sekcja „Dopiski"
       jest PRACĄ CZŁOWIEKA — narzędzie nie ma prawa jej cicho zjeść przy
       powtórnym uruchomieniu. Scalanie odrzucone świadomie: wymagałoby
       zgadywania, gdzie kończy się tekst wygenerowany, a zaczyna dopisany,
       i przy pierwszej zmianie szablonu zgadłoby źle.
       Odmowa jest wąska — dotyczy wyłącznie plików, w których KTOŚ COŚ
       DOPISAŁ. Raport nietknięty (dopiski = „(brak)") nadpisuje się sam,
       bo nie ma czego stracić. */
    if (fs.existsSync(plik) && !a.includes('--nadpisz')) {
      if (maDopiski(fs.readFileSync(plik, 'utf8'))) {
        console.error('\n⚠ RAPORT ZA TEN TYDZIEŃ JUŻ ISTNIEJE I MA DOPISKI.');
        console.error('  ' + path.join('.ai', 'ledger', path.basename(plik)));
        console.error('  Nie nadpisuję — dopiski to Twoja praca, nie mój wynik.');
        console.error('  Jeśli świadomie chcesz je stracić: --nadpisz\n');
        process.exit(1);
      }
    }

    fs.writeFileSync(plik, raport, 'utf8');
    console.log('Zapisano: .ai/ledger/' + path.basename(plik));
    console.log('Dopiski dodawaj wprost w pliku, w sekcji „Dopiski".');
  } else {
    console.log(raport);
  }
})();
