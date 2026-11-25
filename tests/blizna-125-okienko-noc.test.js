/* BLIZNA 125 (3.11.2026, Filip 16:12 „Okienko samo się sprawdza codziennie”): raport nocy trafia do PUBLICZNEGO repo, więc
   (1) anonimizacja: imiona/nazwiska → [OSOBA], e-maile i telefony usunięte, publiczni sportowcy zostają; (2) każdy plik docs/okienko-raport/*.md
   jest czysty; (3) dane z EF okienko-raport-dane (sekret RAPORT_SECRET; EF: same SELECT, anonimizacja po stronie serwera, bez athlete_id,
   limit wierszy) — klucz serwisowy bazy NIGDY w GitHubie; sędzia tylko ocenia; (4) workflow: cron 02:00 UTC, sekrety GEMINI_API_KEY
   i RAPORT_SECRET, uprawnienia tylko na jobie, commit z [skip ci], issue przy alarmie, ZERO deployu; (5) limit kosztu. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('anonimizacja: imię, imię+nazwisko, para wielkich liter, e-mail, telefon → zamazane; publiczni sportowcy, miasta, imprezy, Filip/Kasia zostają', async () => {
  const A = await import(pathToFileURL(path.join(KORZEN, 'tools/_anonimizuj.mjs')).href);
  assert.equal(A.anonimizuj('kim jest Jan Kowalski'), 'kim jest [OSOBA]');
  assert.equal(A.anonimizuj('wyniki Anny Nowak-Kowalskiej z Dębna'), 'wyniki [OSOBA] z Dębna');
  assert.equal(A.anonimizuj('maciej siedlecki'), '[OSOBA]'); assert.equal(A.anonimizuj('damian bolewski'), '[OSOBA]');
  assert.equal(A.anonimizuj('napisz do jan.kowalski@example.com albo 601 234 567'), 'napisz do [e-mail] albo [telefon]');
  assert.equal(A.anonimizuj('kto wygrał maraton w Berlinie'), 'kto wygrał maraton w Berlinie');
  assert.equal(A.anonimizuj('rekord Kipchoge w Berlinie'), 'rekord Kipchoge w Berlinie', 'sportowiec publiczny zostaje');
  assert.equal(A.anonimizuj('Bieg Niepodległości w Poznaniu 10 km'), 'Bieg Niepodległości w Poznaniu 10 km', 'impreza i miasto to nie osoba');
  assert.equal(A.anonimizuj('kim jest Filip'), 'kim jest Filip', 'Filip/Kasia (o nas) zostają — to publiczne osoby projektu');
  assert.equal(A.anonimizuj('plan na jutro'), 'plan na jutro'); assert.equal(A.anonimizuj(''), '');
  assert.equal(A.anonimizuj('Zapytałem o Kasię Nowak i o Tomka'), 'Zapytałem o [OSOBA] i o [OSOBA]');
  assert.equal(A.czysty('kim jest [OSOBA]'), true); assert.equal(A.czysty('kim jest Jan Kowalski'), false); assert.equal(A.czysty('x@y.pl'), false);
  assert.equal(A.czysty('trening 2026-11-03 10 km'), true, 'data i liczby to nie telefon'); assert.equal(A.czysty('tel 601234567'), false);
});

test('każdy raport w docs/okienko-raport/*.md jest czysty (bez imion ze słownika poza publicznymi, e-maili, telefonów, athlete_id)', async () => {
  const S = await import(pathToFileURL(path.join(KORZEN, 'tools/_straznik-raportu.mjs')).href);   // ten sam strażnik co w narzędziu: ten test biegnie w nocy PO wygenerowaniu raportu
  const dir = path.join(KORZEN, 'docs/okienko-raport');
  const pliki = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)) : [];
  for (const f of pliki) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(t, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, f + ': uuid w raporcie');
    assert.ok(S.raportCzysty(t), f + ': dane osobowe w raporcie');
  }
});

/* 25.11.2026: noc była czerwona w każdy poniedziałek (9, 16, 23.11) i w dni z wpisem „do poprawy” (6, 22.11), bo strażnik brał
   STAŁE słowa narzędzia za imiona: „Wiersz” (odmiana imienia Wiera) i „luka:” (imię Luka). Raport składamy tu z PRAWDZIWYCH
   szablonów narzędzia (kandydatDoLawki i zdanie tygodnia wyjęte ze źródła), bez danych osób. */
function szablony() {
  const r = czytaj('tools/okienko-raport-dnia.mjs');
  const kl = r.match(/export function klasyfikuj\(w\) \{[\s\S]*?\n\}\n/), ka = r.match(/export function kandydatDoLawki\(w\) \{[\s\S]*?\n\}\n/);
  const tydz = r.match(/md\.push\(`(Wiersz tygodnia[^`]*)`, ""\);/);
  assert.ok(kl && ka && tydz, 'szablony narzędzia: klasyfikuj, kandydatDoLawki, zdanie tygodnia');
  const f = new Function('dzis', (kl[0] + ka[0]).replace(/export /g, '') + '\nreturn { klasyfikuj, kandydatDoLawki };')('2026-11-23');
  return { ...f, zdanieTygodnia: tydz[1], zrodlo: r };
}
function raportProbny(pytanie) {
  const { klasyfikuj, kandydatDoLawki, zdanieTygodnia } = szablony();
  const w = { wersja: 'v2', osoba: 'osoba #1', kiedy: '2026-11-22T09:15:00Z', pytanie, sciezka: 'siec:wyniki · wyniki_imprezy 0.91', odpowiedz: 'Nie znalazłem wyników tej imprezy.',
    ocena: -1, narzedzia: [], samosprawdzenie: true, ok: true, ms: 812, tryb: 'siec' };
  assert.ok(klasyfikuj(w).length, 'wpis próbny jest „do poprawy”');
  return ['# Raport Okienka — 2026-11-23 (doba 2026-11-22)', '', 'Wpisów: 1 (v2: 1, v1: 0); do przejrzenia: 1. Osoby = pseudonimy na ten raport; teksty zanonimizowane.', '',
    '## Do poprawy (każdy wpis → poprawka z blizną + pytanie do ławki)', '', `### ${klasyfikuj(w).join(' · ')} — ${w.wersja}, ${w.osoba}, ${w.kiedy.slice(11, 16)} UTC`, '',
    `- pytanie: ${w.pytanie}`, `- ścieżka: ${w.sciezka} · ${w.ms} ms`, `- odpowiedź: ${w.odpowiedz}`, `- kandydat do ławki: \`${kandydatDoLawki(w)}\``, '',
    '## Liczby doby', '', '- czas v2: p50 812 ms, p90 812 ms (cel p90 < 2000)', '', zdanieTygodnia, ''].join('\n');
}

test('strażnik raportu: raport z wpisem „do poprawy” i sekcją tygodniową, bez danych osób, PRZECHODZI; sam `czysty` by go odrzucił (stary błąd)', async () => {
  const S = await import(pathToFileURL(path.join(KORZEN, 'tools/_straznik-raportu.mjs')).href);
  const A = await import(pathToFileURL(path.join(KORZEN, 'tools/_anonimizuj.mjs')).href);
  const t = raportProbny('wyniki maratonu w poznaniu');
  assert.match(t, /\{ luka: 'E\?', uwaga: 'z życia 2026-11-23: /); assert.match(t, /\nWiersz tygodnia dopisany do docs\/okienko-postep\.md\.\n/);
  assert.equal(S.raportCzysty(t), true);
  assert.equal(A.czysty(t.replace(/\[OSOBA\]|\[e-mail\]|\[telefon\]|osoba #\d+/g, '')), false, 'bez wyjątków ten raport nie powstawał');
  assert.equal(A.czyImie('luka:') && A.czyImie('Wiersz'), true, 'słownik bez zmian: oba słowa dalej wyglądają jak imiona');
  // narzędzie używa tego strażnika, a zwroty stoją w nim litera w literę
  const { zrodlo } = szablony();
  assert.match(zrodlo, /import \{ raportCzysty \} from "\.\/_straznik-raportu\.mjs";/);
  assert.match(zrodlo, /if \(!raportCzysty\(tekst\)\) \{ console\.error\("RAPORT NIEZAPISANY: strażnik anonimizacji znalazł dane osobowe"\); process\.exit\(2\); \}/);
  assert.deepEqual(S.STALE_ZWROTY, ['Wiersz tygodnia dopisany do docs/okienko-postep.md.', "{ luka: 'E?', uwaga: 'z życia "], 'dokładnie dwa stałe zwroty');
  assert.ok(zrodlo.includes('md.push(`' + S.STALE_ZWROTY[0] + '`, "");'), 'zdanie tygodnia w narzędziu = wyjątek');
  assert.ok(zrodlo.includes(S.STALE_ZWROTY[1] + '${dzis}: '), 'szablon kandydata w narzędziu = wyjątek');
});

test('strażnik raportu: ten sam raport z danymi osoby dalej ODRZUCONY; wyjątek to dokładny zwrot, nie słowo', async () => {
  const S = await import(pathToFileURL(path.join(KORZEN, 'tools/_straznik-raportu.mjs')).href);
  assert.equal(S.raportCzysty(raportProbny('wyniki Anny Nowak z maratonu')), false, 'imię i nazwisko w pytaniu (także w linii kandydata)');
  assert.equal(S.raportCzysty(raportProbny('napisz na jan@example.com')), false, 'e-mail');
  assert.equal(S.raportCzysty(raportProbny('zadzwoń 601 234 567')), false, 'telefon');
  const czystyRaport = raportProbny('wyniki maratonu w poznaniu');
  assert.equal(S.raportCzysty(czystyRaport + '\nWiersz Luka\n'), false, 'same słowa „Wiersz” i „Luka” poza zwrotami dalej są imionami');
  assert.equal(S.raportCzysty(czystyRaport + "\n{ luka: 'Anna' }\n"), false, 'inna wartość pola luka nie jest wyjątkiem');
  assert.equal(S.raportCzysty(czystyRaport + '\nWiersz tygodnia dopisany do docs/okienko-postep.md. Dopisała Anna\n'), false, 'tekst tuż za zwrotem dalej sprawdzany');
  assert.equal(S.raportCzysty(czystyRaport.replace("uwaga: 'z życia 2026-11-23: ", "uwaga: 'z życia Anny 2026-11-23: ")), false, 'tekst wewnątrz szablonu kandydata dalej sprawdzany');
  assert.equal(S.raportCzysty(czystyRaport.replace('osoba #1', 'Jan')), false, 'imię zamiast pseudonimu');
});

test('narzędzie raportu: dane TYLKO z EF okienko-raport-dane (sekret), bez klucza service i bez REST do tabel; sędzia ocenia (5 kryteriów), limit kosztu, alarm = kod 3; EF: sekret, same SELECT, anonimizacja, bez athlete_id', () => {
  const r = czytaj('tools/okienko-raport-dnia.mjs');
  assert.doesNotMatch(r, /rest\/v1|service_role|OKIENKO_RAPORT_KEY|SUPABASE_SERVICE/, 'narzędzie nie zna klucza do bazy'); assert.doesNotMatch(r, /\.(insert|update|upsert|delete)\(/);
  assert.match(r, /functions\/v1\/okienko-raport-dane/); assert.match(r, /"x-raport-secret": RAPORT_SECRET/); assert.match(r, /anonimizuj\(w\.pytanie\)/); assert.match(r, /anonimizuj\(w\.odpowiedz\)/); assert.match(r, /anonimizuj\(w\.komentarz\)/);
  const ef = czytaj('supabase/functions/okienko-raport-dane/index.ts');
  assert.match(ef, /req\.headers\.get\("x-raport-secret"\) \|\| ""\) !== SEKRET\) return J\(401/); assert.match(ef, /if \(!SEKRET \|\|/, 'bez ustawionego sekretu EF odmawia');
  assert.doesNotMatch(ef, /\.(insert|update|upsert|delete|rpc)\(/, 'EF tylko czyta'); assert.match(ef, /\.limit\(MAX_WIERSZY\)/); assert.match(ef, /const MAX_WIERSZY = 500;/);
  assert.match(ef, /\.from\("okienko_wiedza"\)\.select\("id,pytanie,warianty,odpowiedz,intencja,waznosc,wazna_do,status"\)\.eq\("status", "zatwierdzona"\)\.limit\(MAX_WZORCOW\)/, 'sędzia dostaje z EF tylko zatwierdzone wpisy bazy wiedzy');
  assert.match(ef, /wzorce: wz\.error \? \[\] : \(wz\.data \|\| \[\]\)/, 'brak tabeli przed migracją nie psuje raportu nocy'); assert.match(r, /WZORCE = j\.wzorce/);
  assert.match(ef, /import \{ anonimizuj \} from "\.\.\/_shared\/anonimizuj\.mjs";/); assert.match(ef, /osoba: ps\(w\.athlete_id\)/);
  assert.doesNotMatch(ef.slice(ef.indexOf('const n = ')), /athlete_id: w\.athlete_id|athlete_id,/, 'athlete_id nie wychodzi z EF');
  assert.match(czytaj('supabase/config.toml'), /\[functions\.okienko-raport-dane\]\s*\nverify_jwt = false/);
  assert.match(czytaj('tools/_anonimizuj.mjs'), /from "\.\.\/supabase\/functions\/_shared\/anonimizuj\.mjs"/, 'jedna anonimizacja dla EF i narzędzi');
  const s = czytaj('tools/_sedzia.mjs');   // sędzia wydzielony (blizna-141): wspólny dla raportu, porównania dostawców i wzorców
  assert.match(s, /required: \["odpowiada", "konkret", "liczby_z_pokryciem", "wyciek", "ton", "uzasadnienie"\]/); assert.match(s, /temperature: 0/); assert.match(s, /model: "gemini-3\.5-flash"/);
  assert.match(r, /limit \$\{OPCJE\.limitUsd\} USD przekroczony/); assert.match(r, /if \(!raportCzysty\(tekst\)\)/, 'strażnik przed zapisem'); assert.match(r, /process\.exitCode = 3/);
  assert.match(r, /klasyfikuj|kandydatDoLawki/); assert.doesNotMatch(r, /functions\/v1\/okienko(-v2)?["'`]/, 'raport nie pyta okienka (koszt, limity użytkowników)');
});

test('workflow okienko-noc: cron 02:00 UTC, sekrety, blizna przed commitem, commit [skip ci], issue tylko przy kodzie 3, żadnego deployu', () => {
  const w = czytaj('.github/workflows/okienko-noc.yml');
  assert.match(w, /cron: '0 2 \* \* \*'/); assert.match(w, /GEMINI_API_KEY: \$\{\{ secrets\.GEMINI_API_KEY \}\}/); assert.match(w, /RAPORT_SECRET: \$\{\{ secrets\.RAPORT_SECRET \}\}/);
  assert.match(w, /^permissions: \{\}/m, 'na poziomie workflow nic'); assert.match(w, /    permissions:\n      contents: write[^\n]*\n      issues: write/, 'uprawnienia tylko na jobie raport');
  for (const f of fs.readdirSync(path.join(KORZEN, '.github/workflows'))) assert.doesNotMatch(czytaj('.github/workflows/' + f), /service_role|SERVICE_ROLE|OKIENKO_RAPORT_KEY|SB_SECRET_KEY/, f + ': klucz do bazy w GitHubie');
  assert.match(w, /node tools\/okienko-raport-dnia\.mjs --noc --limit-usd 0\.5/); assert.match(w, /node --test tests\/blizna-125-okienko-noc\.test\.js/);
  assert.ok(w.indexOf('blizna-125') < w.indexOf('git commit'), 'blizna PRZED commitem raportu');
  assert.match(w, /\[skip ci\]/); assert.match(w, /if: steps\.raport\.outputs\.kod == '3'/); assert.match(w, /gh issue create/);
  assert.doesNotMatch(w, /supabase functions deploy|db push|db query|deploy\.yml|workflow_call/, 'noc nigdy nie wdraża');
  /* 3.11: GitHub pokazywał plik jako ścieżkę bez nazwy — treść issue w `run: |` miała linie od kolumny 0 (zepsuty YAML). Każda linia od kolumny 0
     musi być pustą, komentarzem albo jednym z kluczy najwyższego poziomu; wyzwalacze tylko schedule + workflow_dispatch. */
  for (const [i, l] of w.split('\n').entries()) if (l && !/^\s/.test(l) && !/^#/.test(l)) assert.match(l, /^(name|on|permissions|concurrency|jobs):/, `linia ${i + 1} od kolumny 0 w YAML: ${l.slice(0, 60)}`);
  assert.match(w, /^on:\n  schedule:\n    - cron: '0 2 \* \* \*'\n  workflow_dispatch:\n/m, 'tylko schedule + workflow_dispatch'); assert.doesNotMatch(w, /^\s+push:/m);
  assert.match(w, /--body-file "\$RUNNER_TEMP\/issue\.md"/, 'treść issue z pliku, nie z wieloliniowego argumentu');
  assert.doesNotMatch(w, /SUPABASE_ACCESS_TOKEN|SB_SECRET_KEY/, 'tylko klucz do odczytu logów i klucze modeli (Gemini, Anthropic)');
});
