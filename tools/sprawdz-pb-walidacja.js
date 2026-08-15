#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// BRAMKA: czy WSZYSTKIE życiówki na ŻYWEJ bazie przechodzą przez window.walidujPB.
//
// !! TO NIE JEST TEST I NIE MA GO W tests/. Odpowiedź na pytanie „czy to, co
//    jest teraz w bazie, nadal się waliduje" zmienia się przy każdym wpisanym
//    PB, więc zamrożona w repo byłaby kłamstwem od następnego dnia. To audyt
//    danych, uruchamiany na żądanie — jak pozostałe bramki.
//    Dane testowe do zestawu są SYNTETYCZNE i mają własne uzasadnienie
//    w tests/_dane/pb-ksztalty.js.
//
// !! DANE PRZEPŁYWAJĄ PRZEZ PAMIĘĆ. Repo jest publiczne, a życiówki to dane
//    osobowe ludzi, którzy nie wyrazili zgody na ich publikację. Wynik zapytania
//    nie ląduje w żadnym pliku w repo: SQL idzie do katalogu tymczasowego
//    systemu, odpowiedź jest parsowana w pamięci, a raport pokazuje LICZBY
//    i — przy odrzuceniach — samą wartość PB bez adresu e-mail.
//
// UŻYCIE
//     node tools/sprawdz-pb-walidacja.js                → bramka na żywej bazie
//     node tools/sprawdz-pb-walidacja.js --samokontrola → test negatywny bramki
//
// Kod wyjścia: 0 = wszystko przechodzi, 1 = są odrzucenia albo bramka padła.
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const WORKDIR = process.env.SB_AUDIT_WORKDIR || path.join(os.homedir(), '.cache', 'sb-audit');

const SQL = `select id::text as id, 'pb_5k' as kolumna, pb_5k as wartosc from public.athletes where pb_5k is not null
union all select id::text, 'pb_10k', pb_10k from public.athletes where pb_10k is not null
union all select id::text, 'pb_half', pb_half from public.athletes where pb_half is not null
union all select id::text, 'pb_marathon', pb_marathon from public.athletes where pb_marathon is not null;`;

const DYSTANS = { pb_5k: 5, pb_10k: 10, pb_half: 21.0975, pb_marathon: 42.195 };

/** Ładuje walidator z sb.js — ten sam SSOT, który działa w przeglądarce. */
function walidator() {
  const { zaladujSb } = require(path.join(__dirname, '..', 'tests', '_srodowisko.js'));
  const w = zaladujSb();
  if (typeof w.walidujPB !== 'function') throw new Error('sb.js nie wystawia window.walidujPB');
  return w.walidujPB;
}

/** Pobiera życiówki z żywej bazy. SQL w katalogu tymczasowym, wynik tylko w pamięci. */
function pobierzZBazy() {
  const plik = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pb-gate-')), 'q.sql');
  fs.writeFileSync(plik, SQL);
  try {
    const out = execFileSync('supabase',
      ['db', 'query', '--linked', '--workdir', WORKDIR, '-o', 'csv', '-f', plik],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return parsujCsv(out);
  } finally {
    fs.rmSync(path.dirname(plik), { recursive: true, force: true });
  }
}

/** Minimalny parser CSV — wystarczy, bo kolumny to uuid, nazwa kolumny i czas. */
function parsujCsv(tekst) {
  const linie = tekst.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const start = linie.findIndex((l) => l.startsWith('id,kolumna,wartosc'));
  if (start === -1) throw new Error('brak nagłówka w odpowiedzi CLI — czy `supabase` jest zalogowane?');
  return linie.slice(start + 1)
    .filter((l) => /^[0-9a-f-]{36},/.test(l))
    .map((l) => {
      const [id, kolumna, ...reszta] = l.split(',');
      return { id, kolumna, wartosc: reszta.join(',').replace(/^"|"$/g, '') };
    });
}

/** Sedno bramki: dzieli wiersze na przechodzące i odrzucone. Czysta funkcja. */
function sprawdz(wiersze, walidujPB) {
  const odrzucone = [];
  const zOstrzezeniem = [];
  for (const w of wiersze) {
    const d = DYSTANS[w.kolumna];
    if (!d) { odrzucone.push({ ...w, powod: 'nieznana kolumna ' + w.kolumna }); continue; }
    const r = walidujPB(w.wartosc, d);
    if (!r.ok) odrzucone.push({ ...w, powod: r.blad });
    else if (r.sekundy === null) odrzucone.push({ ...w, powod: 'przechodzi, ale daje pustą wartość (zero?)' });
    else if (r.ostrzezenie) zOstrzezeniem.push(w);
  }
  return { razem: wiersze.length, odrzucone, zOstrzezeniem };
}

function raport(wynik, naglowek) {
  console.log('\n  ' + naglowek);
  console.log('  ' + '─'.repeat(64));
  console.log('  wartości sprawdzonych : ' + wynik.razem);
  console.log('  z ostrzeżeniem        : ' + wynik.zOstrzezeniem.length + '  (wolne tempo — to NIE jest błąd)');
  console.log('  ODRZUCONYCH           : ' + wynik.odrzucone.length);
  if (wynik.odrzucone.length) {
    console.log('  ' + '─'.repeat(64));
    // Bez e-maili i bez id w postaci pozwalającej skojarzyć z osobą przy zerknięciu
    // przez ramię: do naprawy wystarczy kolumna, wartość i skrócony identyfikator.
    for (const o of wynik.odrzucone) {
      console.log('   ' + o.id.slice(0, 8) + '…  ' + o.kolumna.padEnd(12) + JSON.stringify(o.wartosc).padEnd(12) + o.powod);
    }
  }
  console.log('');
}

// ── TEST NEGATYWNY BRAMKI ────────────────────────────────────────────────────
// !! BRAMKA BEZ TESTU NEGATYWNEGO JEST OZDOBĄ (.ai/LEKCJE.md #2). Zielona bramka
//    znaczy „nie znalazłem problemu" tylko wtedy, gdy wiadomo, że UMIE go
//    znaleźć. Poniższe podstawia trzy wartości, których walidator nie przepuszcza,
//    i wymaga, żeby bramka zapaliła się na czerwono. Jeśli przejdzie — bramka
//    jest zepsuta i to jest tak samo zły wynik jak znalezione odrzucenia.
function samokontrola(walidujPB) {
  const dobre = [
    { id: '00000000-0000-0000-0000-000000000001', kolumna: 'pb_5k', wartosc: '25:20' },
    { id: '00000000-0000-0000-0000-000000000002', kolumna: 'pb_half', wartosc: '1:45:00' },
  ];
  const zle = [
    { id: '00000000-0000-0000-0000-0000000000f1', kolumna: 'pb_10k', wartosc: '56' },        // gołe sekundy
    { id: '00000000-0000-0000-0000-0000000000f2', kolumna: 'pb_marathon', wartosc: '9:99:99' }, // człon >= 60
    { id: '00000000-0000-0000-0000-0000000000f3', kolumna: 'pb_half', wartosc: '2:14' },      // h:mm na długim
  ];

  const czyste = sprawdz(dobre, walidujPB);
  raport(czyste, 'SAMOKONTROLA 1/2 — same poprawne wartości, bramka ma MILCZEĆ');
  if (czyste.odrzucone.length !== 0) {
    console.error('  ✖ BRAMKA ZEPSUTA: odrzuciła poprawne życiówki (fałszywy alarm).\n');
    return 1;
  }

  const skazone = sprawdz(dobre.concat(zle), walidujPB);
  raport(skazone, 'SAMOKONTROLA 2/2 — dołożone 3 wartości nie do przyjęcia, bramka ma PAŚĆ');
  if (skazone.odrzucone.length !== zle.length) {
    console.error('  ✖ BRAMKA ZEPSUTA: przepuściła ' + (zle.length - skazone.odrzucone.length)
      + ' z ' + zle.length + ' wartości, których walidator nie przyjmuje.\n');
    return 1;
  }

  console.log('  ✅ Bramka umie zaświecić na czerwono: 3/3 podstawione wartości wyłapane,');
  console.log('     0 fałszywych alarmów na poprawnych. Wynikom na żywej bazie można ufać.\n');
  return 0;
}

function main() {
  const walidujPB = walidator();

  if (process.argv.includes('--samokontrola')) return samokontrola(walidujPB);

  let wiersze;
  try {
    wiersze = pobierzZBazy();
  } catch (e) {
    console.error('\n  ✖ Nie udało się odpytać bazy: ' + (e.message || e).toString().split('\n')[0]);
    console.error('    Sprawdź `supabase projects list` i katalog ' + WORKDIR + '\n');
    return 1;
  }

  const wynik = sprawdz(wiersze, walidujPB);
  raport(wynik, 'ŻYWA BAZA — athletes.pb_5k / pb_10k / pb_half / pb_marathon');

  if (wynik.odrzucone.length) {
    console.error('  ✖ ' + wynik.odrzucone.length + ' wartości nie przechodzi przez walidator.');
    console.error('    Każda z nich to człowiek, któremu karta predykcji pokaże „—"');
    console.error('    zamiast prognozy. Napraw dane, nie rozluźniaj walidatora.\n');
    return 1;
  }
  console.log('  ✅ Wszystkie ' + wynik.razem + ' wartości przechodzą.\n');
  return 0;
}

process.exit(main());
