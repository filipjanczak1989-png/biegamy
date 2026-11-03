/* BLIZNA 120 (3.11.2026, KALENDARZ etapy 2–3 — Filip 3.11 02:31): OKŁADKI Z AUTOMATU + „ZMIEŃ ZDJĘCIE” TRENERA.
   2) EF okladki-imprez: tryb 'noc' tylko z x-push-secret (cron 02:40 UTC), lista imprez z F6 przez konto serwisowe (sekrety F6_KONTO_EMAIL/
      F6_KONTO_HASLO, hasło nigdy w logu/odpowiedzi), ≤ 30/dobę z okladki_log, najbliższe terminy najpierw, prompt WYŁĄCZNIE z danych serwera
      (shared okladka-prompt.mjs), zapis imprezy_okladki + okladki_log z kosztem; okladki_log bez dostępu z przeglądarki.
   3) Tryby trenera (JWT + coaches): 'trener-gemini' (klucz bez roku; dane do promptu z bazy albo z F6, nigdy z żądania; limit 20/dobę wspólny
      z race-image), 'wlasne' (typ po BAJTACH, ≤ 3 MB; impreza → imprezy_okladki nadpisuje automat, nasze → races.cover_url). race-image korzysta
      z tego samego modułu, loguje 'race-gemini' i przy force sprawdza limit. Front: przyciski tylko dla trenera, plik → canvas ≤ 1600 px → EF,
      żadnego zapisu imprezy_okladki z klienta. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('shared okladka-prompt: prompt z danych serwera, bez tekstu na obrazie; walidacja zdjęcia po bajtach; obiekt impreza-<sha1>.jpg', async () => {
  const P = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/_shared/okladka-prompt.mjs')).href);
  const p = P.promptOkladki({ nazwa: 'XII Bieg Niepodległości <script>', miasto: 'Poznań', dystanse: [10, 5], data: '2026-11-11', typ: 'ulica' });
  assert.match(p, /^Szeroka okładka wydarzenia biegowego: bieg na 10 km w miejscowości Poznań \(XII Bieg Niepodległości <script>\), pora roku: jesień\./);
  assert.match(p, /Bez żadnego tekstu, liter, numerów startowych i logotypów\.$/); assert.match(p, /naturalne światło dzienne/);
  assert.match(P.promptOkladki({ nazwa: 'Nocny Bieg', dystanse: 5, data: '2026-07-01', typ: 'ulica-noc' }), /nocą/);
  assert.match(P.promptOkladki({ nazwa: 'Marsz', dystanse: 5, data: '2026-01-01', typ: 'nordic' }), /marsz nordic walking/);
  assert.match(P.promptOkladki({ nazwa: 'X', dystanse: 42.195, data: '2026-04-01', typ: 'smieci' }), /maraton[\s\S]*ulice miasta/, 'nieznany typ → ulica');
  assert.match(P.promptOkladki({ nazwa: 'X', dystanse: 10, data: '2026-04-01', typ: 'park', forma: 'Pionowa', kompozycja: 'Kompozycja pionowa.' }), /^Pionowa[\s\S]*alejki parku[\s\S]*Kompozycja pionowa\./, 'race-image: forma i kompozycja');
  assert.equal(P.dystansOpis([21.0975]), 'półmaraton'); assert.equal(P.dystansOpis(60), 'bieg ultra'); assert.equal(P.poraRoku('2026-12-05'), 'zima');
  assert.deepEqual(P.sprawdzWlasneZdjecie(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])).mime, 'image/jpeg');
  assert.equal(P.sprawdzWlasneZdjecie(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])).mime, 'image/png');
  assert.equal(P.sprawdzWlasneZdjecie(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])).mime, 'image/webp');
  assert.match(P.sprawdzWlasneZdjecie(new Uint8Array(12).fill(1)).blad, /nie JPEG/); assert.match(P.sprawdzWlasneZdjecie(new Uint8Array(3 * 1024 * 1024 + 1)).blad, /3 MB/);
  assert.match(P.sprawdzWlasneZdjecie(Buffer.from('<svg onload=alert(1)>')).blad || '', /nie JPEG/, 'SVG odrzucone po bajtach');
  const ob = await P.obiektImprezy('biegniepodleglosci|poznan'); assert.match(ob, /^impreza-[0-9a-f]{40}\.jpg$/);
  assert.equal(P.zBase64('data:image/jpeg;base64,/9j/4AA=')[0], 0xff); assert.equal(P.zBase64('%%%'), null);
  assert.doesNotMatch(czytaj('supabase/functions/_shared/okladka-prompt.mjs'), /deno\.land|Deno\./, 'część czysta bez Deno (ładowana w testach)');
  assert.match(czytaj('supabase/functions/_shared/okladka-gemini.mjs'), /export \* from "\.\/okladka-prompt\.mjs";/);
});

test('EF okladki-imprez: noc tylko z sekretem, F6 przez konto serwisowe, limity z okladki_log, prompt bez danych z żądania, zapisy tylko do 3 miejsc', () => {
  const e = czytaj('supabase/functions/okladki-imprez/index.ts');
  assert.match(e, /if \(rodzaj === "noc"\) \{\s*if \(!SEKRET \|\| \(req\.headers\.get\("x-push-secret"\) \|\| ""\) !== SEKRET\) return J\(401/);
  assert.match(e, /Deno\.env\.get\("F6_KONTO_EMAIL"\)/); assert.match(e, /Deno\.env\.get\("F6_KONTO_HASLO"\)/);
  assert.match(e, /signInWithPassword\(\{ email: F6_EMAIL, password: F6_HASLO \}\)/); assert.doesNotMatch(e, /console\.log\([^)]*HASLO|blad: [^\n]*HASLO/, 'hasło nigdzie nie wychodzi');
  assert.match(e, /rpc\/upcoming_races/); assert.match(e, /out\.sort\(\(a, b\) => \(a\.data < b\.data \? -1 : 1\)\);/, 'najbliższe terminy najpierw');
  assert.match(e, /const LIMIT_AUTOMAT = 30, LIMIT_TRENER = 20/); assert.match(e, /LIMIT_AUTOMAT - \(await dzisWLogu\(sb, \["automat"\]\)\)/);
  assert.match(e, /dzisWLogu\(sb, \["trener-gemini", "race-gemini"\]\)\) >= LIMIT_TRENER\) return J\(429/);
  assert.match(e, /promptOkladki\(e\)/); assert.doesNotMatch(e, /promptOkladki\(\{[^}]*body\./, 'prompt nigdy z ciała żądania');
  assert.match(e, /from\("imprezy_okladki"\)\.select\("klucz,nazwa,miasto,typ"\)\.eq\("klucz", klucz\)/, 'dane do promptu z bazy');
  assert.match(e, /\(await imprezyZF6\(\)\)\.find\(\(x\) => x\.klucz === klucz\)/, 'albo z F6 po kluczu');
  const tabele = new Set(); for (const m of e.matchAll(/from\("([a-z_]+)"\)\s*\.(insert|upsert|update|delete)\(/g)) tabele.add(m[1]);
  assert.deepEqual([...tabele].sort(), ['imprezy_okladki', 'okladki_log', 'races'], 'zapisy tylko: imprezy_okladki, okladki_log, races.cover_url');
  assert.match(e, /sprawdzWlasneZdjecie\(bajty\)/); assert.match(e, /wgrajOkladke\(sb, await obiektImprezy\(klucz\), obraz\)/); assert.match(e, /wgrajOkladke\(sb, `race-\$\{raceId\}`, obraz\)/);
  assert.match(e, /zrodlo: "trener-wlasne"/); assert.match(e, /zrodlo: rodzaj === "automat" \? "gemini-nano-banana-2\.1" : "trener-gemini"/);
  assert.match(e, /const \{ data: trener \} = await sb\.from\("coaches"\)\.select\("id"\)\.eq\("id", user\.id\)\.maybeSingle\(\);\s*if \(!trener\) return J\(403/);
  assert.match(czytaj('supabase/config.toml'), /\[functions\.okladki-imprez\]\s*\nverify_jwt = false/);
  const m = czytaj('supabase/migrations/20261105_okladki_automat.sql');
  assert.match(m, /create table public\.okladki_log \(/); assert.match(m, /revoke all on public\.okladki_log from public, anon, authenticated;/);
  assert.match(m, /rodzaj in \('automat', 'trener-gemini', 'trener-wlasne', 'race-gemini', 'race-wlasne'\)/); assert.match(m, /cron\.schedule\('okladki-imprez-noc', '40 2 \* \* \*'/);
  assert.match(m, /functions\/v1\/okladki-imprez/); assert.match(m, /'\{"rodzaj":"noc"\}'::jsonb/);
  assert.ok(fs.existsSync(path.join(KORZEN, 'supabase/migrations/20261105_WYCOFANIE_okladki_automat.sql')));
  const t = czytaj('tools/okladki-automat-test.sql'); for (const f of ['FAIL 1a', 'FAIL 2a', 'FAIL 2b', 'FAIL 2c', 'FAIL 2d', 'FAIL 3a']) assert.ok(t.includes(f), f);
});

test('race-image: wspólny moduł (zero kopii promptu/skalowania), log race-gemini, limit przy force', () => {
  const r = czytaj('supabase/functions/race-image/index.ts');
  assert.match(r, /import \{ generujGemini, promptOkladki, przeskaluj, wgrajOkladke, DOZWOLONE_MIME, KOSZT_USD \} from "\.\.\/_shared\/okladka-gemini\.mjs";/);
  assert.doesNotMatch(r, /function zbudujPrompt|function przeskaluj|function wyciagnijObraz|generativelanguage\.googleapis|imagescript/, 'bez kopii');
  assert.match(r, /promptOkladki\(\{ nazwa: race\.name, miasto: race\.city, dystanse: race\.distance_km, data: race\.date, typ: typSceny\(race\), forma: wd\.forma, kompozycja: wd\.kompozycja \}\)/);
  assert.match(r, /rodzaj: "race-gemini"/); assert.match(r, /if \(force\) \{[\s\S]*?\.in\("rodzaj", \["trener-gemini", "race-gemini"\]\)[\s\S]*?>= LIMIT_TRENER\) return odpowiedz\(429/);
  assert.match(r, /if \(race\[wd\.kolumna\] && !force\) return wynik\(race\[wd\.kolumna\], false\);/, 'idempotencja bez force zostaje');
});

test('front: przyciski tylko dla trenera, własne zdjęcie przez canvas → EF, impreza/nasze, żadnego zapisu imprezy_okladki z klienta', () => {
  const r = czytaj('races.html');
  assert.match(r, /<div id="m-coach-impreza" style="display:none;/); assert.match(r, /onclick="nowaOkladkaImprezy\(\)"/); assert.equal((r.match(/onclick="wlasneZdjecie\(\)"/g) || []).length, 2, 'własne zdjęcie: impreza i nasze');
  assert.match(r, /<input type="file" id="m-plik" accept="image\/jpeg,image\/png,image\/webp" hidden onchange="wyslijWlasneZdjecie\(this\)">/);
  assert.match(r, /sekTr\.style\.display = _isCoach \? 'flex' : 'none';/); assert.match(r, /if \(!x \|\| !_isCoach\) return;/);
  assert.match(r, /\+ '\/okladki-imprez'/); assert.match(r, /rodzaj: 'trener-gemini', klucz: kluczImprezyOkladki\(x\)/);
  assert.match(r, /Math\.min\(1, 1600 \/ img\.naturalWidth\)/); assert.match(r, /toDataURL\('image\/jpeg', 0\.85\)/);
  assert.match(r, /\{ rodzaj: 'wlasne', klucz: kluczImprezyOkladki\(_currentImpreza\), dane_b64: dane \} : \{ rodzaj: 'wlasne', race_id: _currentRace\.id, dane_b64: dane \}/);
  assert.doesNotMatch(r, /from\('imprezy_okladki'\)\.(insert|upsert|update|delete)\(/); assert.doesNotMatch(r, /storage\.from\('race-covers'\)/, 'upload tylko przez EF');
  assert.match(r, /r\.status === 429 \? 'Dzienny limit nowych okładek wyczerpany \(20\)\.'/);
});

test('konto F6: nieudane logowanie (401 — hasło testowe zmienione bez sekretu) ląduje w okladki_log jako „logowanie F6 nieudane”, a nie ginie cicho', () => {
  const e = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/okladki-imprez/index.ts'), 'utf8').replace(/\r/g, '');
  assert.match(e, /if \(error \|\| !data\.session\) throw new Error\("logowanie F6 nieudane \(hasło konta testowego zmienione bez sekretu F6_KONTO_HASLO\?\)"\);/);
  assert.match(e, /try \{ lista = await imprezyZF6\(\); \} catch \(e\) \{ await log\(sb, \{ rodzaj: "automat", ok: false, blad: "lista: " \+ \(e as Error\)\.message \}\);/, 'automat: błąd listy = wpis w okladki_log');
  assert.doesNotMatch(e, /F6_HASLO[^\n]*(log\(|console\.|blad)/, 'hasło nigdy w logu');
  const d = fs.readFileSync(path.join(__dirname, '..', 'docs/kalendarz-etapy-2026-11-03.md'), 'utf8');
  assert.match(d, /Hasło konta testowego zmieniać TYLKO razem z sekretem/);
});

