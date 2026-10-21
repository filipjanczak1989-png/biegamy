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
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|console\.|innerHTML|eval\(|document\.write/.test(kod));
  assert.match(kod, /credentials: 'omit'/);
  assert.match(kod, /window\.BM_SRODOWISKO !== 'prod'/);
  assert.match(kod, /if \(!WYNIKI_API_WLACZONE\) return blad\(0, 'wylaczone'\);/);
});

test('races.html: klient api tylko przy wynikiApiDostepne() (flaga + prod), inaczej _sb; link usuwania tylko wtedy', () => {
  const html = czytaj('races.html');
  assert.match(html, /<script src="js\/wyszukiwarka-wynikow\.js"><\/script><script src="js\/wyniki-api\.js"><\/script>/);
  assert.match(html, /var api = typeof window\.wynikiApiDostepne === 'function' && window\.wynikiApiDostepne\(\);/);
  assert.match(html, /client: api \? window\.wynikiApi\(_sb\) : _sb/);
  assert.match(html, /usunDaneHref: api \? 'usun-dane\.html' : null/);
  assert.ok(!/api\.biegamy\.run/.test(html), 'adres API tylko w js/wyniki-api.js');
});

test('widżet: bez adresu API i bez własnego fetch — wszystko przez przekazany klient', () => {
  const w = bezKomentarzy(czytaj('js/wyszukiwarka-wynikow.js'));
  assert.ok(!/api\.biegamy\.run|fetch\(|localStorage|sessionStorage/.test(w));
});
