/* BLIZNA 135 (3.11.2026, Filip: „okładki Gemini nie generują się”). Zwiad: EF okladki-imprez wdrożona, cron 02:40 istnieje, ale jeszcze nie
   ruszył; sekretów F6_KONTO_EMAIL/F6_KONTO_HASLO NIE MA w Supabase → noc i przycisk trenera dla imprezy z maszyny padały z 502 („brak konta
   F6”), a okladki_log był pusty (błędu przycisku nie logowaliśmy). Poprawka: przycisk trenera szuka imprezy w maszynie WŁASNYM tokenem trenera
   (maszyna przyjmuje każdy zalogowany token), noc zostaje na koncie serwisowym; błąd listy trafia do okladki_log; przyciski „Wygeneruj okładkę”
   obok „Zmień zdjęcie”; prompt: bez twarzy, tekstu, logo organizatora i nazwy na obrazie; limit dzienny bez zmian (20). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('EF: trener szuka imprezy swoim tokenem (bez konta serwisowego), noc kontem serwisowym; błąd listy w okladki_log; limit 20', () => {
  const e = czytaj('supabase/functions/okladki-imprez/index.ts');
  assert.match(e, /async function imprezyZF6\(tokenTrenera: string \| null = null\): Promise<Impreza\[\]> \{\n  let token = tokenTrenera, anon: any = null;\n  if \(!token\) \{/);
  assert.match(e, /if \(!F6_EMAIL \|\| !F6_HASLO\) throw new Error\("brak konta F6/, 'noc bez sekretów — jawny błąd');
  assert.match(e, /Authorization: `Bearer \$\{token\}`/);
  assert.match(e, /const jwtTrenera = \(req\.headers\.get\("Authorization"\) \|\| ""\)\.replace\(\/\^Bearer\\s\+\/i, ""\)\.trim\(\) \|\| null;/);
  assert.match(e, /e = \(await imprezyZF6\(jwtTrenera\)\)\.find\(\(x\) => x\.klucz === klucz\)/);
  assert.match(e, /await log\(sb, \{ rodzaj: "trener-gemini", klucz, kto: user\.id, ok: false, blad: "lista: " \+ \(err as Error\)\.message \}\); return J\(502/);
  assert.match(e, /try \{ lista = await imprezyZF6\(\); \}/, 'noc: konto serwisowe (bez tokenu z żądania)');
  assert.match(e, /const LIMIT_AUTOMAT = 30, LIMIT_TRENER = 20/); assert.match(e, /if \(\(await dzisWLogu\(sb, \["trener-gemini", "race-gemini"\]\)\) >= LIMIT_TRENER\) return J\(429/);
  assert.match(e, /if \(!trener\) return J\(403, \{ blad: "tylko trener" \}\);/, 'tylko trener (coaches)');
  assert.doesNotMatch(e, /body\.nazwa|body\.miasto|body\.prompt/, 'prompt nigdy z żądania');
});

test('prompt okładki: bez twarzy, tekstu, logo organizatora i nazwy wydarzenia na obrazie', async () => {
  const P = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/_shared/okladka-prompt.mjs')).href);
  const p = P.promptOkladki({ nazwa: 'Bieg Testowy', miasto: 'Poznań', data: '2026-11-11', dystanse: [10], typ: 'ulica' });
  assert.match(p, /Bez rozpoznawalnych twarzy/); assert.match(p, /logo organizatora/); assert.match(p, /nazwy wydarzenia na obrazie/); assert.match(p, /tekstu, liter, numerów startowych/);
});

test('karta imprezy u trenera: „Wygeneruj okładkę” obok „Zmień zdjęcie” (impreza z maszyny i nasze zawody); komunikaty limitu', () => {
  const r = czytaj('races.html');
  const imp = r.slice(r.indexOf('id="m-coach-impreza"'), r.indexOf('id="m-plik"'));
  assert.match(imp, /onclick="nowaOkladkaImprezy\(\)"[^>]*>✨ Wygeneruj okładkę<\/button>/); assert.match(imp, /onclick="wlasneZdjecie\(\)"[^>]*>📷 Zmień zdjęcie<\/button>/);
  const nasze = r.slice(r.indexOf('id="m-coach-approved"'), r.indexOf('id="m-coach-impreza"'));
  assert.match(nasze, /onclick="nowaOkladka\(\)"[^>]*>✨ Wygeneruj okładkę<\/button>/); assert.match(nasze, /onclick="wlasneZdjecie\(\)"[^>]*>📷 Zmień zdjęcie<\/button>/);
  assert.match(r, /Dzienny limit nowych okładek wyczerpany \(20\)\./);
  assert.doesNotMatch(r, /Nowa okładka \(Gemini\)|>📷 Własne zdjęcie</);
});

test('docs: diagnoza okładek z poleceniami (sekrety, ręczne odpalenie nocy, kontrola okladki_log)', () => {
  const d = czytaj('docs/wyniki-okladki-zwiad-2026-11-03.md');
  assert.match(d, /F6_KONTO_EMAIL/); assert.match(d, /F6_KONTO_HASLO/); assert.match(d, /execute \(select command from cron\.job where jobname = 'okladki-imprez-noc'\)/);
  assert.match(d, /select kiedy, rodzaj, ok, blad from okladki_log/);
});
