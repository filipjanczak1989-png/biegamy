#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PRZEGLĄD BŁĘDÓW KLIENTA — co realnie psuje się u ludzi, pogrupowane po USTERCE.
//
// !! TO NIE JEST TEST I NIE MA GO W tests/. Odpowiedź zmienia się przy każdym
//    błędzie zgłoszonym przez czyjąś przeglądarkę, więc zamrożona w repo byłaby
//    kłamstwem od następnego dnia. To przegląd żywych danych — jak
//    tools/sprawdz-pb-walidacja.js.
//
// !! DANE PRZEPŁYWAJĄ PRZEZ PAMIĘĆ. Repo jest publiczne, a `client_errors`
//    trzyma adresy stron, user_agent i identyfikatory ludzi. Zapytanie idzie
//    do katalogu tymczasowego systemu, odpowiedź jest parsowana w pamięci,
//    a wydruk pokazuje skrócone identyfikatory bez e-maili.
//
// !! LOGIKA GRUPOWANIA NIE JEST TUTAJ. Siedzi w
//    supabase/functions/_shared/grupowanie-bledow.mjs, żeby digest (B) używał
//    DOKŁADNIE tej samej — bez kopii, która rozjedzie się przy pierwszej zmianie.
//
// UŻYCIE
//     node tools/przeglad-bledow.js                → ostatnie 30 dni
//     node tools/przeglad-bledow.js --dni 7        → inny zakres
//     node tools/przeglad-bledow.js --samokontrola → test grupowania (obie strony)
//
// Kod wyjścia: 0 = przegląd wykonany, 1 = błąd odczytu albo samokontrola padła.
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const WORKDIR = process.env.SB_AUDIT_WORKDIR || path.join(os.homedir(), '.cache', 'sb-audit');
const MODUL = path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'grupowanie-bledow.mjs');

function sql(dni) {
  return `select message, url, user_agent, user_id::text as user_id, created_at::text as created_at
from public.client_errors
where created_at >= now() - interval '${dni} days'
order by created_at;`;
}

/** Pobiera wiersze z żywej bazy. JSON, nie CSV — komunikaty zawierają przecinki. */
function pobierz(dni) {
  const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'bledy-'));
  const plik = path.join(kat, 'q.sql');
  fs.writeFileSync(plik, sql(dni));
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

/* Postgres oddaje `2026-08-15 21:22:21.987865+00` — spacja zamiast `T`
   i przesunięcie BEZ minut. `new Date()` na tym daje Invalid Date.
   !! WALIDUJEMY WYNIK, NIE OPAKOWUJEMY W try/catch: `toLocaleString` NIE RZUCA
      na złej dacie, tylko oddaje napis „Invalid Date", więc catch nigdy nie
      wchodzi, a do wydruku trafia prawdopodobnie wyglądający śmieć.
      To jest .ai/LEKCJE.md #6 — złapane tu przy pierwszym uruchomieniu
      na żywych danych. */
const dt = (iso) => {
  if (!iso) return '-';
  const s = String(iso).replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(iso).slice(0, 16);
  return d.toLocaleString('pl-PL',
    { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

function wypisz(wynik, naglowek) {
  const { grupy, pominietych, wierszy } = wynik;
  console.log('\n  ' + naglowek);
  console.log('  ' + '─'.repeat(76));
  console.log('  ' + wierszy + ' wierszy  →  ' + grupy.length + (grupy.length === 1 ? ' usterka' : ' usterek')
    + (pominietych ? '   (pominięto ' + pominietych + ' z sesji diagnostycznych)' : ''));
  if (!grupy.length) { console.log('\n  ✅ Nic do pokazania.\n'); return; }
  console.log('');
  for (const g of grupy) {
    // Sortowanie po OSOBACH, ale `wierszy` zostaje widoczne: 42 wiersze
    // u jednej osoby znaczą, że coś się u niej zapętla.
    console.log('  ' + g.usterka.padEnd(46) + String(g.wierszy).padStart(4) + '×  '
      + String(g.osob).padStart(2) + ' os.   ostatnie ' + dt(g.ostatnie));
    console.log('      ' + g.strony.join(' ') + '   ' + g.kohorty.map((k) => k.nazwa + '(' + k.ile + ')').join('·'));
    if (g.warianty.length > 1) {
      console.log('      warianty: ' + g.warianty.map((w) => w.nazwa + ' (' + w.ile + ')').join(' · '));
    }
    console.log('');
  }
}

// ── SAMOKONTROLA ─────────────────────────────────────────────────────────────
// !! OBIE STRONY. Reguła „skleisz wszystko w jedną usterkę" przeszłaby test
//    sprawdzający wyłącznie sklejanie. Reguła „nie sklejaj nic" przeszłaby test
//    sprawdzający wyłącznie rozdzielanie. Sprawdzamy więc jedno i drugie,
//    plus to, że po drodze nie gubią się wiersze.
function samokontrola(M) {
  let bledy = 0;
  const ok = (war, opis) => { console.log('  ' + (war ? 'OK  ' : 'PAD ') + opis); if (!war) bledy++; };
  const w = (message, extra) => Object.assign(
    { message, url: '/kalendarz.html', user_agent: 'Mozilla/5.0 (Linux; Android 10; K) Chrome/150.0.0.0 Mobile Safari/537.36',
      user_id: 'u1', created_at: '2026-08-15 10:00:00+00' }, extra || {});

  console.log('\n  1) SKLEJA, gdy powinno — dwa dialekty i cztery napisy VT');
  {
    const r = M.grupuj([
      w("ReferenceError: Can't find variable: PRSclose", { user_agent: 'Mozilla/5.0 (iPhone) Safari/604.1', user_id: 'u1' }),
      w('Uncaught ReferenceError: PRSclose is not defined', { user_id: 'u2' }),
      w('Transition was skipped', { user_id: 'u3' }),
      w('Skipping view transition because skipTransition() was called.', { user_id: 'u4' }),
      w('Transition was aborted because of invalid state', { user_id: 'u5' }),
      w('Transition was aborted because of timeout in DOM update', { user_id: 'u6' }),
    ]);
    ok(r.grupy.length === 2, '6 komunikatów → 2 usterki (dostałem ' + r.grupy.length + ')');
    const pr = r.grupy.find((g) => /PRSclose/.test(g.usterka));
    ok(!!pr && pr.wierszy === 2 && pr.osob === 2, 'PRSclose: 2 wiersze, 2 osoby');
    ok(!!pr && pr.warianty.length === 2, 'oba warianty zachowane w podwierszu');
    const vt = r.grupy.find((g) => /View Transition/.test(g.usterka));
    ok(!!vt && vt.wierszy === 4 && vt.osob === 4, 'VT: 4 wiersze, 4 osoby');
  }

  console.log('\n  2) NIE SKLEJA, gdy nie powinno');
  {
    const r = M.grupuj([
      w('Uncaught ReferenceError: PRSclose is not defined'),
      w('Uncaught ReferenceError: toggleMenu is not defined'),
      w('Cannot set properties of null (setting \'value\')'),
    ]);
    ok(r.grupy.length === 3, 'trzy różne usterki zostają trzema (dostałem ' + r.grupy.length + ')');
    ok(r.grupy.some((g) => g.usterka === 'ReferenceError: PRSclose')
      && r.grupy.some((g) => g.usterka === 'ReferenceError: toggleMenu'),
      'dwa różne ReferenceError NIE zlały się w jeden');
  }

  console.log('\n  3) NIE GUBI wierszy');
  {
    const wej = [w('Transition was skipped'), w('Transition was skipped'),
                 w('Uncaught ReferenceError: X is not defined'),
                 w('cokolwiek', { url: '/trener.html?vtdebug=selftest' })];
    const r = M.grupuj(wej);
    const suma = r.grupy.reduce((s, g) => s + g.wierszy, 0);
    ok(suma + r.pominietych === wej.length, suma + ' + ' + r.pominietych + ' = ' + wej.length);
    ok(r.pominietych === 1, 'sesja diagnostyczna pominięta i POLICZONA');
  }

  console.log('\n  4) WYKLUCZENIE PO URL, nie po treści komunikatu');
  {
    ok(M.czyDiagnostyczny('/trener.html?vtdebug=selftest'), 'rozpoznane po ?vtdebug=');
    ok(M.czyDiagnostyczny('/x.html?a=1&vtdebug=dump'), 'także jako drugi parametr');
    ok(!M.czyDiagnostyczny('/kalendarz.html?role=coach'), 'zwykły adres NIE jest diagnostyczny');
    // Gdyby napis selftestu się zmienił, wykluczenie ma nadal działać.
    const r = M.grupuj([w('DOWOLNY INNY NAPIS', { url: '/t.html?vtdebug=selftest' })]);
    ok(r.grupy.length === 0 && r.pominietych === 1, 'zmiana napisu nie psuje wykluczenia');
  }

  console.log('\n  5) KOHORTY — pięć prawdziwych user_agent z bazy');
  {
    const P = [
      ['Mozilla/5.0 (Linux; Android 11; 2201117TY Build/RKQ1; wv) AppleWebKit/537.36 Chrome/150.0.7871.181 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/571.0.0.41.92;]', 'Messenger'],
      ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36', 'Android'],
      ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.5 Mobile/15E148 Safari/604.1', 'iOS'],
      ['Mozilla/5.0 (iPhone) CriOS/150.0 Mobile/15E148 Safari/604.1', 'ChromeiOS'],
      ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36', 'desktop'],
    ];
    for (const [ua, oczek] of P) ok(M.kohorta(ua) === oczek, oczek.padEnd(10) + ' ← ' + ua.slice(0, 46));
  }

  console.log('\n  6) PODSUMOWANIE dla digestu (B) — jedno zdanie');
  {
    const r = M.grupuj([
      w('Uncaught ReferenceError: PRSclose is not defined', { user_id: 'a' }),
      w('Uncaught ReferenceError: PRSclose is not defined', { user_id: 'b' }),
      w('Cannot set properties of null (setting \'value\')', { user_id: 'c' }),
    ]);
    const z = M.podsumowanie(r.grupy);
    ok(/PRSclose/.test(z) && /2 os\./.test(z), 'zdanie: ' + z);
    ok(M.podsumowanie([]) === 'Brak nowych usterek u zawodników.', 'pusty przypadek ma własne zdanie');
    ok(z.length < 200, 'mieści się w treści powiadomienia (' + z.length + ' znaków)');
  }

  console.log('\n  7) DATY — format Postgresa, nie ISO');
  {
    // Postgres: „2026-08-15 21:22:21.987865+00". Pierwsze uruchomienie na żywych
    // danych dało „Invalid Date" w każdym wierszu — bo toLocaleString NIE RZUCA.
    ok(dt('2026-08-15 21:22:21.987865+00') !== 'Invalid Date', 'format Postgresa parsuje się');
    ok(/15\.08/.test(dt('2026-08-15 21:22:21.987865+00')), 'i daje właściwy dzień: ' + dt('2026-08-15 21:22:21.987865+00'));
    ok(dt('kompletny śmieć') !== 'Invalid Date', 'śmieć NIE staje się napisem „Invalid Date"');
    ok(dt(null) === '-', 'brak daty to „-"');
  }

  console.log('\n  ' + (bledy
    ? '✖ ' + bledy + ' asercji padło — GRUPOWANIU NIE MOŻNA UFAĆ'
    : '✅ Grupowanie skleja to, co trzeba, i NIE skleja reszty. Wynikom można ufać.') + '\n');
  return bledy ? 1 : 0;
}

async function main() {
  const M = await import('file://' + MODUL.split(path.sep).join('/'));

  if (process.argv.includes('--samokontrola')) return samokontrola(M);

  const i = process.argv.indexOf('--dni');
  const dni = i !== -1 ? Math.max(1, parseInt(process.argv[i + 1], 10) || 30) : 30;

  let wiersze;
  try {
    wiersze = pobierz(dni);
  } catch (e) {
    console.error('\n  ✖ Nie udało się odpytać bazy: ' + (e.message || e).toString().split('\n')[0]);
    console.error('    Sprawdź `supabase projects list` i katalog ' + WORKDIR + '\n');
    return 1;
  }

  wypisz(M.grupuj(wiersze), 'USTERKI — client_errors, ostatnie ' + dni + ' dni');
  return 0;
}

main().then((k) => process.exit(k)).catch((e) => { console.error(e); process.exit(1); });
