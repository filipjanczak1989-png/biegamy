#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// BRAMKA: sb.js vs supabase/functions/_shared/reguly-treningow.mjs
//
// Reguły treningowe żyją w DWÓCH kopiach, bo `sb.js` to skrypt przeglądarkowy
// (`window.*`), a EF to moduły Deno, i projekt nie ma kroku budowania.
// Ta bramka nie usuwa duplikatu — WYKRYWA jego rozjazd.
//
// ⚠️ TWARDE PROGI LICZBY POZYCJI (jak MIN_ZRODEL w bramce RUN_TYPES). Bez nich
//    ktoś usunie pozycję po OBU stronach i bramka przejdzie na krótszej liście,
//    zgłaszając „zgodne" o dwóch pustych zbiorach. Zgodność bez pokrycia to
//    nie zgodność.
//
// Uruchomienie:  node tools/bramka-reguly.js  [--samokontrola]
// Kod wyjścia:   0 = zgodne, 1 = ROZJAZD
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const path = require('path');

const KORZEN = path.join(__dirname, '..');

/* ── PROGI — podnosić razem z dokładaniem reguł, NIGDY nie obniżać „żeby przeszło" ── */
const MIN_RUN_TYPES = 10;
const MIN_WAG = 21;
const MIN_FEEL = 4;   /* 3 -> 4 razem z dolozeniem `great` 16.08.2026 — prog podnosi sie W TYM SAMYM commicie co wartosc, inaczej chronilby starej listy */
const MIN_PROGOW = 4;
/* Część B — funkcje, które MUSZĄ brać reguły z modułu, i wzory, które NIE MOGĄ
   w nich wrócić. Progi są twarde z tego samego powodu co wyżej: bez nich
   skasowanie pozycji z listy daje „zgodne" na pustym zbiorze. */
const MIN_EF = 3;
const MIN_WZORCOW = 5;
const EF_OBJETE = [
  'generate-athlete-report', 'generate-coach-brief', 'generate-training-plan',
];
const ZAKAZANE_WZORY = [
  [/ctl\s*\+=\s*\(\s*t\s*-\s*ctl/i, 'własna EMA CTL (ctl += (t-ctl)...)'],
  [/Math\.min\(\s*sr[0-9a-z]*\s*\/\s*sd[0-9a-z]*\s*,\s*4\s*\)/i, 'własna monotonia (Math.min(sr/sd,4))'],
  [/\{\s*['"]?odpoczynek['"]?\s*:\s*0\s*,/i, 'własna tabela wag wysiłku'],
  /* ⚠️ Kotwiczymy na PARZE mid/bad, nie na otwierającej klamrze. Wzorzec
     `\{ good: 1.0` przestał łapać, gdy tabela dostała `great` na początku —
     bramka przechodziłaby na kopii NOWEJ tabeli. */
  [/mid\s*:\s*1\.1\s*,\s*bad\s*:\s*1\.3/i, 'własna tabela mnożników samopoczucia'],
  [/reduce\([^)]*parseFloat\(l\.distance_km\)|reduce\([^)]*Number\(l\.distance_km\)/i,
   'suma km bez isRunType'],
];

/* ── Część C — PROGI KONTUZJI ─────────────────────────────────────────────
   Te same reguły istnieją w DWÓCH postaciach i nie da się ich scalić:
     · `supabase/functions/generate-training-plan/index.ts` — jako ZDANIA
       W PROMPCIE („OBJĘTOŚĆ −40%"), czyli prośba do modelu;
     · `js/generator-planu.js` — jako ARYTMETYKA (mnożnik na objętość),
       czyli gwarancja.
   Zmiana procentu w prompcie bez zmiany mnożnika (albo odwrotnie) daje dwóch
   zawodników z tą samą kontuzją i różnymi planami, w zależności od tego, czy
   mają trenera. Dokładnie ta klasa, którą zamykaliśmy cały tydzień.
   ⚠️ Czytamy przez ZACHOWANIE silnika, nie przez parsowanie jego źródła —
   tak samo jak progi TSB niżej. Z EF wyciągamy liczbę z tekstu, bo tam
   reguła NIE MA innej postaci niż tekst. */
const BOL_TOLERANCJA = 0.01;
const BOL_EF_PLIK = 'supabase/functions/generate-training-plan/index.ts';

const bledy = [];
const uwagi = [];

/** Procent obniżki objętości zapisany w prompcie EF dla poziomu 2. */
function procentZEf() {
  const fs = require('fs');
  let src;
  try { src = fs.readFileSync(path.join(KORZEN, BOL_EF_PLIK), 'utf8'); }
  catch (e) { bledy.push('nie da się odczytać ' + BOL_EF_PLIK + ': ' + e.message); return null; }
  const m = /OBJĘTOŚĆ\s*−(\d+)%/.exec(src);
  if (!m) {
    bledy.push('w prompcie EF nie znaleziono progu „OBJĘTOŚĆ −NN%" dla poziomu 2 — '
             + 'reguła zniknęła albo zmieniła brzmienie; bramka nie ma czego porównać');
    return null;
  }
  return Number(m[1]);
}

/** Faktyczny mnożnik objętości silnika klienckiego dla danego poziomu bólu. */
function mnoznikSilnika(poziom) {
  const G = require(path.join(KORZEN, 'js/generator-planu.js'));
  const TODAY = '2026-08-28';
  const d = new Date(TODAY + 'T00:00:00'); d.setDate(d.getDate() + 14 * 7);
  const we = {
    dystans: 'half', dniWTygodniu: 5, dataStartu: d.toISOString().slice(0, 10),
    today: TODAY, poziom: { p10sec: 300, wynik: null, objetoscTygodniowa: 40 },
    celCzasowy: null,
  };
  const bez = G.uloz(we);
  const zBolem = G.uloz(Object.assign({}, we, { bol: { poziom: poziom } }));
  if (!bez.ok || !zBolem.ok) {
    bledy.push('silnik odmówił na wejściu kontrolnym bramki (' + (bez.sciana || zBolem.sciana || {}).kod + ')');
    return null;
  }
  const a = bez.meta.objetosciTygodni, b = zBolem.meta.objetosciTygodni;
  /* Ostatni tydzień to taper — porównujemy pierwszy, gdzie krzywa jest pełna. */
  if (!(a[0] > 0)) { bledy.push('wejście kontrolne dało zerowy pierwszy tydzień'); return null; }
  return { mnoznik: b[0] / a[0], pierwszyTydzien: b[0] };
}

function zbierzZSb() {
  /* Ta sama piaskownica co testy (`tests/_srodowisko.js`), nie własna kopia —
     ręczna atrapa przeglądarki wywracała się na `navigator.serviceWorker`,
     a bramka mierzyłaby wtedy własną awarię zamiast rozjazdu reguł. */
  const { zaladujSb } = require(path.join(KORZEN, 'tests/_srodowisko.js'));
  try {
    return zaladujSb();
  } catch (e) {
    bledy.push('sb.js nie wykonał się w piaskownicy: ' + e.message);
    return {};
  }
}

function porownajZbior(nazwa, a, b, minPozycji) {
  const A = [...a].sort(), B = [...b].sort();
  if (A.length < minPozycji) {
    bledy.push(`${nazwa}: sb.js ma ${A.length} pozycji, próg to ${minPozycji}. ` +
      'Albo reguła się skurczyła, albo próg jest nieaktualny — rozstrzygnij, nie obniżaj progu.');
  }
  if (B.length < minPozycji) {
    bledy.push(`${nazwa}: _shared ma ${B.length} pozycji, próg to ${minPozycji}.`);
  }
  const brakWShared = A.filter(x => !b.has ? !B.includes(x) : !b.has(x));
  const brakWSb = B.filter(x => !a.has ? !A.includes(x) : !a.has(x));
  if (brakWShared.length) bledy.push(`${nazwa}: jest w sb.js, BRAK w _shared → ${brakWShared.join(', ')}`);
  if (brakWSb.length) bledy.push(`${nazwa}: jest w _shared, BRAK w sb.js → ${brakWSb.join(', ')}`);
  if (!brakWShared.length && !brakWSb.length) uwagi.push(`${nazwa}: ${A.length} pozycji, zgodne`);
}

function porownajMape(nazwa, a, b, minPozycji) {
  const kA = Object.keys(a || {}), kB = Object.keys(b || {});
  porownajZbior(nazwa + ' (klucze)', new Set(kA), new Set(kB), minPozycji);
  const rozne = kA.filter(k => kB.includes(k) && a[k] !== b[k])
                  .map(k => `${k}: sb.js=${a[k]} vs _shared=${b[k]}`);
  if (rozne.length) bledy.push(`${nazwa}: RÓŻNE WARTOŚCI → ${rozne.join(' | ')}`);
}

async function main() {
  const samokontrola = process.argv.includes('--samokontrola');
  const shared = await import('file://' + path.join(KORZEN, 'supabase/functions/_shared/reguly-treningow.mjs').replace(/\\/g, '/'));
  const sb = zbierzZSb();

  if (!sb.RUN_TYPES || !sb.FORMA_EFFORT_FACTORS) {
    bledy.push('sb.js nie wystawił RUN_TYPES / FORMA_EFFORT_FACTORS — bramka nie ma czego porównać.');
  } else {
    porownajZbior('RUN_TYPES', sb.RUN_TYPES, shared.RUN_TYPES, MIN_RUN_TYPES);
    porownajMape('FORMA_EFFORT_FACTORS', sb.FORMA_EFFORT_FACTORS, shared.FORMA_EFFORT_FACTORS, MIN_WAG);
    porownajMape('FORMA_FEEL_MODIFIERS', sb.FORMA_FEEL_MODIFIERS, shared.FORMA_FEEL_MODIFIERS, MIN_FEEL);
  }

  /* Progi TSB: w sb.js siedzą w ciele funkcji etykietującej, nie w stałej —
     więc czytamy je przez ZACHOWANIE tej funkcji, nie przez parsowanie źródła. */
  const etykieta = sb.formaZoneLabel;
  if (typeof etykieta === 'function') {
    const paryProgow = [
      [shared.TSB_PROGI.przeciazenie, 'przeciążenie'],
      [shared.TSB_PROGI.obciazenie, 'obciążenie'],
      [shared.TSB_PROGI.neutralna, 'neutralna'],
      [shared.TSB_PROGI.optimum, 'optimum'],
    ];
    if (paryProgow.length < MIN_PROGOW) bledy.push(`progi TSB: ${paryProgow.length} < ${MIN_PROGOW}`);
    for (const [prog] of paryProgow) {
      const tuz = String(etykieta(prog - 0.5) || '').toLowerCase();
      const nasz = shared.opisFormy(prog - 0.5);
      if (!tuz.includes(nasz.slice(0, 6))) {
        bledy.push(`próg TSB ${prog}: sb.js mówi "${tuz}", _shared mówi "${nasz}"`);
      }
    }
    if (!bledy.some(b => b.startsWith('próg TSB'))) uwagi.push(`progi TSB: ${paryProgow.length} sprawdzone, zgodne`);
  } else {
    bledy.push('progi TSB: sb.js nie wystawia `formaZoneLabel` — bramka nie ma czego porównać.');
  }

  /* ── CZĘŚĆ B: EF biorą reguły z modułu i nie mają własnych kopii ── */
  const fsB = require('fs');
  if (EF_OBJETE.length < MIN_EF) {
    bledy.push(`część B: objęto ${EF_OBJETE.length} EF, próg to ${MIN_EF}. Lista się skurczyła — rozstrzygnij, nie obniżaj progu.`);
  }
  if (ZAKAZANE_WZORY.length < MIN_WZORCOW) {
    bledy.push(`część B: ${ZAKAZANE_WZORY.length} wzorców, próg to ${MIN_WZORCOW}.`);
  }
  for (const ef of EF_OBJETE) {
    const sciezka = path.join(KORZEN, 'supabase/functions', ef, 'index.ts');
    let kod;
    try { kod = fsB.readFileSync(sciezka, 'utf8'); }
    catch (_) { bledy.push(`część B: nie ma pliku ${ef}/index.ts — lista EF_OBJETE jest nieaktualna.`); continue; }
    if (!/from\s+["']\.\.\/_shared\/reguly-treningow\.mjs["']/.test(kod)) {
      bledy.push(`${ef}: NIE importuje ../_shared/reguly-treningow.mjs — liczy po swojemu.`);
    }
    const trafienia = ZAKAZANE_WZORY.filter(([rx]) => rx.test(kod)).map(([, opis]) => opis);
    if (trafienia.length) {
      bledy.push(`${ef}: wrócił własny wzór → ${trafienia.join('; ')}`);
    } else {
      uwagi.push(`${ef}: importuje moduł, ${ZAKAZANE_WZORY.length} wzorców sprawdzonych, brak własnych kopii`);
    }
  }

  if (samokontrola) {
    /* ⚠️ TEST NEGATYWNY: bramka, która nigdy nie świeci na czerwono, jest ozdobą.
       Psujemy kopię i sprawdzamy, że ROZJAZD zostaje zgłoszony. */
    const przed = bledy.length, przedU = uwagi.length;
    const podmieniona = { ...shared.FORMA_EFFORT_FACTORS, 'spacer': 9.9 };
    porownajMape('SAMOKONTROLA', sb.FORMA_EFFORT_FACTORS, podmieniona, MIN_WAG);
    const zlapane = bledy.length > przed;
    const krotka = new Set(['spokojny']);
    const przed2 = bledy.length;
    porownajZbior('SAMOKONTROLA-próg', krotka, krotka, MIN_RUN_TYPES);
    const zlapanyProg = bledy.length > przed2;
    bledy.length = przed; uwagi.length = przedU;   // usuwamy sztuczne naruszenia I ich echo w uwagach
    console.log(zlapane ? '  ✓ samokontrola: zmieniona waga ZŁAPANA'
                        : '  ✗ SAMOKONTROLA PADŁA: zmieniona waga NIE została zgłoszona');
    console.log(zlapanyProg ? '  ✓ samokontrola: za krótka lista ZŁAPANA (próg działa)'
                            : '  ✗ SAMOKONTROLA PADŁA: próg minimalnej liczby pozycji NIE zadziałał');
    /* Część B: podsuwamy kod z odtworzonym wzorem — musi zostać zgłoszony. */
    const udawany = 'let ctl=0; for (const t of x) { ctl += (t-ctl)*(1/42); }';
    const zlapanyWzor = ZAKAZANE_WZORY.some(([rx]) => rx.test(udawany));
    console.log(zlapanyWzor ? '  ✓ samokontrola: odtworzona własna EMA w EF ZŁAPANA'
                            : '  ✗ SAMOKONTROLA PADŁA: własna EMA w EF NIE została wykryta');

    /* Część C: udajemy, że prompt EF zmienił próg na −25%, a silnik został
       na ×0.60. To jest DOKŁADNIE ten rozjazd, przed którym część C ma bronić:
       jedna kopia reguły ruszona, druga nie. */
    const przed3 = bledy.length;
    const p2s = mnoznikSilnika(2);
    if (p2s) {
      const udawanyProc = 25;                      // EF mówiłby −25%
      const oczekiwanyS = 1 - udawanyProc / 100;   // czyli ×0.75
      if (Math.abs(p2s.mnoznik - oczekiwanyS) > BOL_TOLERANCJA) {
        bledy.push('SAMOKONTROLA-kontuzja');
      }
    }
    const zlapanyBol = bledy.length > przed3;
    bledy.length = przed3;
    console.log(zlapanyBol ? '  ✓ samokontrola: rozjazd progu kontuzji EF↔silnik ZŁAPANY'
                           : '  ✗ SAMOKONTROLA PADŁA: rozjazd progu kontuzji NIE został wykryty');

    /* ⚠️ Druga strona tej samej monety: bramka musi też PRZEPUSZCZAĆ, gdy
       kopie są zgodne. Sama umiejętność świecenia na czerwono nie odróżnia
       działającej bramki od takiej, która pada zawsze. */
    const przed4 = bledy.length;
    if (p2s && Math.abs(p2s.mnoznik - 0.60) > BOL_TOLERANCJA) bledy.push('SAMOKONTROLA-zgodne');
    const przepuszcza = bledy.length === przed4;
    bledy.length = przed4;
    console.log(przepuszcza ? '  ✓ samokontrola: zgodne progi PRZEPUSZCZONE'
                            : '  ✗ SAMOKONTROLA PADŁA: bramka zgłasza rozjazd przy zgodnych progach');
    /* ⚠️ SAMOKONTROLA KONCZY SIE TUTAJ, nie leci dalej do raportu.
       Do 16.08.2026 tryb --samokontrola wykonywal TEZ porownanie wlasciwe,
       wiec self-test padal, gdy w repo byl prawdziwy rozjazd — a w CI jego
       awaria PRZESLANIALA pozostale bramki (wszystkie kroki `skipped`).
       Wyszlo dopiero w tescie negatywnym: run byl czerwony z wlasciwego
       powodu, ale raport wskazywal na zly krok.
       Self-test ma odpowiadac na pytanie „czy bramka umie zlapac", a nie
       „czy dzis jest co lapac" — to dwa rozne pytania. */
    process.exit((zlapane && zlapanyProg && zlapanyWzor && zlapanyBol && przepuszcza) ? 0 : 1);
  }

  /* ── Część C: progi kontuzji EF (prompt) vs silnik kliencki (arytmetyka) ── */
  const procEf = procentZEf();
  const p2 = mnoznikSilnika(2);
  if (procEf != null && p2) {
    const oczekiwany = 1 - procEf / 100;
    if (Math.abs(p2.mnoznik - oczekiwany) > BOL_TOLERANCJA) {
      bledy.push('próg kontuzji poziom 2: prompt EF mówi −' + procEf + '% (mnożnik ' +
        oczekiwany.toFixed(2) + '), silnik kliencki daje ' + p2.mnoznik.toFixed(3) +
        ' — zawodnik z trenerem i bez dostaliby różne plany na tę samą kontuzję');
    } else {
      uwagi.push('kontuzja poziom 2: EF −' + procEf + '% = silnik ×' + p2.mnoznik.toFixed(2) + ' (zgodne)');
    }
  }
  /* Poziom 3 nie ma procentu — ma zdanie „PIERWSZY TYDZIEŃ BEZ BIEGANIA".
     Sprawdzamy więc SKUTEK, jedyną postać, w jakiej obie kopie się spotykają. */
  const p3 = mnoznikSilnika(3);
  if (p3 && p3.pierwszyTydzien !== 0) {
    bledy.push('kontuzja poziom 3: pierwszy tydzień ma ' + p3.pierwszyTydzien +
      ' km zamiast zera — prompt EF obiecuje „PIERWSZY TYDZIEŃ BEZ BIEGANIA"');
  } else if (p3) {
    uwagi.push('kontuzja poziom 3: pierwszy tydzień 0 km (zgodne z EF)');
  }

  console.log('\n  BRAMKA REGUŁ — sb.js vs _shared/reguly-treningow.mjs\n');
  uwagi.forEach(u => console.log('  · ' + u));
  if (bledy.length) {
    console.log('\n  ROZJAZD (' + bledy.length + '):');
    bledy.forEach(b => console.log('  ⚠ ' + b));
    console.log('\n  Reguły są w dwóch kopiach świadomie. Zmieniasz jedną → zmień drugą w TYM SAMYM commicie.\n');
    process.exit(1);
  }
  console.log('\n  Zgodne.\n');
}

main().catch(e => { console.error('bramka padła: ' + e.stack); process.exit(1); });
