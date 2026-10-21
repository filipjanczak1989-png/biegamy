// Blizna #53 (21.10.2026) — publiczne API wyników (api.biegamy.run, F6) i „usuń moje dane” za JEDNĄ flagą.
//
// Ryzyko: front wyszukiwarki i usuwania wchodzi na main (deploy = prod) razem z resztą zmian. Bez twardej flagi
// pierwszy merge wysłałby tokeny PROD do serwera wyników, zanim przejdzie U3 (B8) — albo, na froncie testowym,
// tokeny TEST do serwera, który ich nie przyjmie. Przy fladze false nic nie może wołać api.biegamy.run.
//
// !! Zmiana WYNIKI_API_WLACZONE na true to decyzja U3 (B8): zmień ją świadomie razem z tym testem.
// !! Lista RPC ma być tą samą listą co w Caddy (caddy-f6-api.caddy, @dozwolone) i f6.bramka (repo biegamy-collector,
//    archiwum ca68e3e). Funkcje operatora (erasure_*_operator, erasure_release, erasure_check, erasure_finalize) — nigdy.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8');
const bezKomentarzy = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const KLIENT = czytaj('js/wyniki-api.js');

test('klient: flaga WYNIKI_API_WLACZONE = false w repo (U3/B8 zmienia ją świadomie)', () => {
  assert.match(KLIENT, /^\s*var WYNIKI_API_WLACZONE = false;$/m);
  assert.equal((bezKomentarzy(KLIENT).match(/WYNIKI_API_WLACZONE = (true|false)/g) || []).length, 1, 'flaga ustawiana w jednym miejscu');
});

test('klient: tylko https://api.biegamy.run i tylko 9 RPC z listy Caddy/f6.bramka, bez funkcji operatora', () => {
  assert.match(KLIENT, /var API_URL = 'https:\/\/api\.biegamy\.run';/);
  const lista = KLIENT.match(/var RPC_DOZWOLONE = \[([\s\S]*?)\];/)[1].match(/'[^']+'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(lista.slice().sort(), ['erasure_cancel', 'erasure_confirm', 'erasure_preview', 'erasure_request', 'erasure_status',
    'event_course_status', 'runner_results', 'search_runners', 'upcoming_races']);
  assert.ok(!/_operator|erasure_release|erasure_check|erasure_finalize|resolve_runners/.test(bezKomentarzy(KLIENT)));
});

test('klient: token tylko w nagłówku — bez magazynów, konsoli, innerHTML; credentials omit; tylko środowisko prod', () => {
  const kod = bezKomentarzy(KLIENT);
  assert.ok(!/sessionStorage|indexedDB|document\.cookie|console\.|innerHTML|eval\(|document\.write|setItem|removeItem/.test(kod));
  assert.deepEqual(kod.match(/localStorage\.[a-zA-Z]+/g), ['localStorage.getItem'], 'z localStorage tylko getItem (klucz podglądu)');
  assert.match(kod, /credentials: 'omit'/);
  assert.match(kod, /window\.BM_SRODOWISKO !== 'prod'/);
  assert.match(kod, /if \(window\.BM_SRODOWISKO !== 'prod'\) return blad\(0, 'srodowisko'\);\n\s*if \(!wlaczone\(\)\) return blad\(0, 'wylaczone'\);/, 'najpierw środowisko, potem flaga albo podgląd');
});

test('races.html: na prod sekcja wyników ukryta (hidden) bez dostępnego API; na TEST widoczna z _sb; klient api tylko przy wynikiApiDostepne()', () => {
  const html = czytaj('races.html');
  assert.match(html, /<script src="js\/wyszukiwarka-wynikow\.js"><\/script><script src="js\/wyniki-api\.js"><\/script>/);
  assert.match(html, /<details class="st-card" id="wyniki-szukaj-sekcja" hidden /, 'domyślnie ukryta – bez JS i przed sprawdzeniem flagi');
  assert.match(html, /var apiWynikow = typeof window\.wynikiApiDostepne === 'function' && window\.wynikiApiDostepne\(\);/);
  assert.match(html, /if \(sekcjaWynikow && \(window\.BM_SRODOWISKO !== 'prod' \|\| apiWynikow\)\) \{\n\s*sekcjaWynikow\.hidden = false;\n\s*sekcjaWynikow\.addEventListener\('toggle'/,
    'odkrycie i start wyszukiwarki tylko na TEST albo przy dostępnym API');
  assert.equal((html.match(/initResultsSearch\(/g) || []).length, 1, 'wyszukiwarka startuje tylko w tym jednym miejscu');
  assert.match(html, /client: apiWynikow \? window\.wynikiApi\(_sb\) : _sb/);
  assert.match(html, /usunDaneHref: apiWynikow \? 'usun-dane\.html' : null/);
  assert.match(html, /podglad: typeof window\.wynikiApiPodglad === 'function' && window\.wynikiApiPodglad\(\)/);
  assert.ok(!/api\.biegamy\.run\//.test(html), 'adres API tylko w js/wyniki-api.js');
});

test('przełącznik podglądu: jeden klucz w localStorage, tylko odczyt w try/catch, tylko prod; bez kont, UUID i e-maili w kodzie', () => {
  const kod = bezKomentarzy(KLIENT);
  assert.match(kod, /var KLUCZ_PODGLADU = 'wyniki_api_podglad';/);
  assert.match(kod, /try \{ return !!\(window\.localStorage && window\.localStorage\.getItem\(KLUCZ_PODGLADU\) === '1'\); \} catch \(e\) \{ return false; \}/);
  assert.match(kod, /function podglad\(\) \{ return window\.BM_SRODOWISKO === 'prod' && !WYNIKI_API_WLACZONE && kluczPodgladu\(\); \}/);
  assert.match(kod, /function dostepne\(\) \{ return window\.BM_SRODOWISKO === 'prod' && wlaczone\(\); \}/);
  for (const f of ['js/wyniki-api.js', 'js/usun-dane.js', 'js/wyszukiwarka-wynikow.js', 'races.html', 'usun-dane.html']) {
    const t = bezKomentarzy(czytaj(f));
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(t), f + ': UUID w kodzie');
    assert.ok(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(t.replace(/biegamy\.run@gmail\.com/g, '')), f + ': adres e-mail w kodzie');
  }
  const doc = czytaj('docs/wyniki-api-podglad.md');
  assert.match(doc, /localStorage\.setItem\('wyniki_api_podglad', '1'\); location\.reload\(\)/);
  assert.match(doc, /localStorage\.removeItem\('wyniki_api_podglad'\); location\.reload\(\)/);
});

test('widżet: bez adresu API i bez własnego fetch — wszystko przez przekazany klient', () => {
  const w = bezKomentarzy(czytaj('js/wyszukiwarka-wynikow.js'));
  assert.ok(!/api\.biegamy\.run|fetch\(|localStorage|sessionStorage/.test(w));
});

test('usun-dane.html: skrypty po sb.js, API tylko przy wynikiApiDostepne(), noindex, bez danych w adresach', () => {
  const html = czytaj('usun-dane.html');
  assert.match(html, /<script src="sb\.js"><\/script><script src="js\/dzis-offline\.js"><\/script><script src="js\/wyniki-api\.js"><\/script><script src="js\/usun-dane\.js"><\/script>/);
  assert.match(html, /var dostepne = typeof window\.wynikiApiDostepne === 'function' && window\.wynikiApiDostepne\(\) && !!window\.sb;/);
  assert.match(html, /api: dostepne \? window\.wynikiApi\(window\.sb\) : null/);
  assert.match(html, /var podglad = dostepne && typeof window\.wynikiApiPodglad === 'function' && window\.wynikiApiPodglad\(\);/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.ok(!/api\.biegamy\.run\/|innerHTML|localStorage\.setItem|sessionStorage/.test(html.replace(/<!--[\s\S]*?-->/g, '')));
});

test('js/usun-dane.js: powrót z maila tylko na https://biegamy.run/usun-dane.html, bez zakładania kont, bez magazynów i konsoli', () => {
  const src = czytaj('js/usun-dane.js');
  const kod = bezKomentarzy(src);
  assert.match(kod, /var ADRES_POWROTU = 'https:\/\/biegamy\.run\/usun-dane\.html';/);
  assert.match(kod, /shouldCreateUser: false, emailRedirectTo: ADRES_POWROTU/);
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|localStorage|sessionStorage|indexedDB|document\.cookie|console\.|api\.biegamy\.run|fetch\(/.test(kod));
  assert.ok(!/location\.(href|search|hash)\s*=|location\.assign|location\.replace|pushState/.test(kod), 'żadnych danych w adresie');
  assert.match(kod, /hist\.replaceState\(null, '', lok\.pathname\)/, 'czyszczenie URL po błędzie linku: tylko ścieżka');
  assert.match(kod, /if \(!opts\.dostepne \|\| !api\) \{/);
});
