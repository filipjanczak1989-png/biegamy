// Blizna #52 (08.10.2026) — przełącznik PROD/TEST w sb.js (docs/srodowisko-testowe.md).
// TEST tylko dla hosta DOKŁADNIE na liście; wszystko inne, także wyjątek, = PROD jak przed zmianą.
// Host z listy bez kompletnej konfiguracji testowej = BRAK połączenia (nie prod) + pasek.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '');
const SB = czytaj('sb.js');
const PROD_URL = 'https://afqojgkaveykxbltxzwm.supabase.co';
const PROD_KEY = 'sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY';

function blok(hosty, testCfg) {
  const i = SB.indexOf('  var BM_PROD = {');
  const j = SB.indexOf('  // ─── ASSET URL HELPER');
  assert.ok(i > 0 && j > i, 'blok przełącznika w sb.js');
  let k = SB.slice(i, j);
  if (hosty) k = k.replace('var BM_HOSTY_TESTOWE = [];', 'var BM_HOSTY_TESTOWE = ' + JSON.stringify(hosty) + ';');
  if (testCfg) { const z = k.replace(/var BM_TEST = \{[^}]*\};/,'var BM_TEST = ' + JSON.stringify(Object.assign({ nazwa: 'test' }, testCfg)) + ';'); assert.notEqual(z, k, 'podmiana BM_TEST'); k = z; }
  return k;
}
function uruchom(host, hosty, testCfg, opcje) {
  const dodane = [];
  const doc = { readyState: 'complete', getElementById: () => null, createElement: () => ({ style: {}, textContent: '' }),
    body: { appendChild: (x) => dodane.push(x) }, addEventListener() {} };
  const okno = { location: opcje && opcje.rzuca ? { get hostname() { throw new Error('host'); } } : { hostname: host } };
  new Function('window', 'document', blok(hosty, testCfg))(okno, doc);
  return { okno, pasek: dodane[0] && dodane[0].textContent };
}

test('macierz hostów: bez listy i poza listą zawsze PROD — wartości prod niezmienione', () => {
  for (const h of ['biegamy.run', 'www.biegamy.run', 'localhost', '127.0.0.1', '', null, undefined, 'xn--bgamy.example', 'TEST.biegamy-test.pages.dev']) {
    const { okno, pasek } = uruchom(h, null, null);
    assert.equal(okno.BM_SRODOWISKO, 'prod', String(h));
    assert.equal(okno.SB_URL, PROD_URL); assert.equal(okno.SB_KEY, PROD_KEY); assert.equal(okno.SB_FN_URL, PROD_URL + '/functions/v1');
    assert.equal(pasek, undefined, 'na prod bez paska');
  }
});

test('lista z hostem testowym: TYLKO dokładny host → TEST; podobne hosty → PROD; wyjątek → PROD', () => {
  const lista = ['test.biegamy-test.pages.dev'];
  const cfg = { url: 'https://abcdefghijklmnopqrst.supabase.co', key: 'sb_publishable_TEST' };
  const t = uruchom('test.biegamy-test.pages.dev', lista, cfg);
  assert.equal(t.okno.BM_SRODOWISKO, 'test'); assert.equal(t.okno.SB_URL, cfg.url); assert.equal(t.okno.SB_KEY, cfg.key);
  assert.match(t.pasek, /ŚRODOWISKO TESTOWE/);
  assert.equal(uruchom('TEST.Biegamy-Test.pages.dev', lista, cfg).okno.BM_SRODOWISKO, 'test', 'wielkość liter hosta bez znaczenia');
  for (const h of ['x.test.biegamy-test.pages.dev', 'test.biegamy-test.pages.dev.evil.com', 'abc123.biegamy-test.pages.dev', 'biegamy-test.pages.dev', 'biegamy.run', 'localhost']) {
    const r = uruchom(h, lista, cfg);
    assert.equal(r.okno.BM_SRODOWISKO, 'prod', h); assert.equal(r.okno.SB_URL, PROD_URL, h);
  }
  const w = uruchom('cokolwiek', lista, cfg, { rzuca: true });
  assert.equal(w.okno.BM_SRODOWISKO, 'prod', 'wyjątek przy odczycie hosta = prod'); assert.equal(w.okno.SB_URL, PROD_URL);
});

test('host testowy BEZ kompletnej konfiguracji: brak połączenia (NIE prod) i czerwony pasek', () => {
  for (const cfg of [{ url: '', key: '' }, { url: 'https://abc.supabase.co', key: '' }, { url: 'http://abc.supabase.co', key: 'k' }, { url: 'https://evil.example/', key: 'k' }]) {
    const r = uruchom('test.biegamy-test.pages.dev', ['test.biegamy-test.pages.dev'], cfg);
    assert.equal(r.okno.BM_SRODOWISKO, 'test-bez-konfiguracji', JSON.stringify(cfg));
    assert.equal(r.okno.SB_URL, '', 'host testowy nie może spaść na prod');
    assert.match(r.pasek, /BRAK KONFIGURACJI/);
  }
  assert.match(SB, /window\.supabase\.createClient && window\.SB_URL\) \{/, 'bez SB_URL klient się nie tworzy');
});

test('sb.js: w konfiguracji testowej NIGDY klucz secret (plik publiczny — secret omija RLS)', () => {
  const m = SB.match(/var BM_TEST = \{[^}]*\};/);
  assert.ok(m, 'BM_TEST w sb.js');
  assert.doesNotMatch(SB, /sb_secret_[A-Za-z0-9]/, 'klucz sb_secret_ w sb.js');
  assert.doesNotMatch(m[0], /service_role/, 'klucz service_role w BM_TEST');
  // legacy JWT: rola zapisana w ładunku — anon tak, service_role nie
  const jwt = (m[0].match(/key: '(eyJ[^']+)'/) || [])[1];
  if (jwt) assert.equal(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role, 'anon', 'legacy JWT musi mieć role=anon');
  assert.match(m[0], /url: 'https:\/\/[a-z0-9]+\.supabase\.co'|url: ''/);
});

test('repo: lista hostów testowych pusta do czasu założenia; OAuth intervals z location.origin; bez adresów prod na sztywno', () => {
  assert.match(SB, /var BM_HOSTY_TESTOWE = \[\];/, 'lista testowa niepusta — świadomie? zmień test razem z docs/srodowisko-testowe.md');
  assert.match(SB, /const redirect = location\.origin \+ '\/intervals-callback\.html';/);
  const front = fs.readdirSync(KORZEN).filter((f) => /\.html$/.test(f)).concat(['sb.js']);
  const zle = [];
  for (const f of front) {
    czytaj(f).split('\n').forEach((l, i) => {
      if (!l.includes('afqojgkaveykxbltxzwm')) return;
      if (/SB_FN_URL\s*\|\|\s*'https:\/\/afqojgkaveykxbltxzwm/.test(l)) return;                  // wartość awaryjna, gdy sb.js nie wstał
      if (/rel="preconnect"/.test(l)) return;                                                      // kosmetyka (index.html)
      if (f === 'sb.js' && (/var BM_PROD = /.test(l) || /h === 'afqojgkaveykxbltxzwm\.supabase\.co'/.test(l))) return;
      if (f === 'login.html' && /window\.SB_URL !== undefined \?/.test(l)) return;
      zle.push(f + ':' + (i + 1));
    });
  }
  assert.deepEqual(zle, [], 'adres prod na sztywno, z pominięciem przełącznika');
  assert.match(czytaj('login.html'), /<script src="sb\.js"><\/script>/, 'login.html bierze konfigurację z sb.js');
});

test('narzędzia testu odmawiają prod; build Cloudflare podbija CACHE_VERSION i wersjonuje; keepalive bez kluczy', () => {
  for (const f of ['tools/test-env/zaloz-baze-testowa.sh', 'tools/test-env/deploy-ef.sh', 'tools/test-env/seed.js']) {
    assert.match(czytaj(f), /afqojgkaveykxbltxzwm/, f + ': zna adres prod, żeby go odrzucać');
    assert.match(czytaj(f), /STOP/, f + ': ma twardą odmowę');
  }
  const z = czytaj('tools/test-env/zaloz-baze-testowa.sh');
  assert.match(z, /grep -l "\$PROD_REF" "\$KAT"\/\*-test\.sql/, 'kontrola: po podmianie zero adresów prod');
  const cf = czytaj('tools/test-env/cf-build.sh');
  assert.match(cf, /biegamy-test-/); assert.match(cf, /node tools\/wersjonuj-zasoby\.js dist/); assert.match(cf, /git ls-files -z/);
  const k = czytaj('.github/workflows/keepalive-test.yml');
  assert.match(k, /secrets\.TEST_SB_ANON_KEY/); assert.doesNotMatch(k, /sb_publishable_|eyJhbGci/);
  assert.match(czytaj('.gitignore'), /^tools\/test-env\/\*\.env$/m);
  assert.doesNotMatch(czytaj('.github/workflows/deploy.yml'), /test-env|pages\.dev/, 'prod deploy bez zmian');
});

test('artefakt testowy (cf-build.sh): flaga true w dist/sb.js → baza testowa na KAŻDYM hoście; w repo zawsze false', () => {
  assert.equal((SB.match(/^  var BM_ARTEFAKT_TESTOWY = false;$/gm) || []).length, 1, 'w repo flaga musi być false (inaczej prod łączyłby się z testem)');
  assert.doesNotMatch(SB, /BM_ARTEFAKT_TESTOWY = true/);
  const k0 = blok(null, null);
  const zFlaga = k0.replace('var BM_ARTEFAKT_TESTOWY = false;', 'var BM_ARTEFAKT_TESTOWY = true;');
  assert.notEqual(zFlaga, k0);
  const run = (kod, host) => { const o = { location: { hostname: host } }; new Function('window', 'document', kod)(o, { readyState: 'complete', getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild() {} }, addEventListener() {} }); return o; };
  for (const h of ['abc123.biegamy-test.pages.dev', 'biegamy-test.pages.dev', 'cokolwiek.example', '']) {
    const o = run(zFlaga, h);
    assert.equal(o.BM_SRODOWISKO, 'test', h); assert.match(o.SB_URL, /^https:\/\/[a-z0-9]+\.supabase\.co$/); assert.notEqual(o.SB_URL, PROD_URL, h);
  }
  // flaga bez kompletnej konfiguracji testowej → brak połączenia, NIE prod
  const bezKlucza = zFlaga.replace(/var BM_TEST = \{[^}]*\};/, "var BM_TEST = { nazwa: 'test', url: '', key: '' };");
  assert.equal(run(bezKlucza, 'x.pages.dev').BM_SRODOWISKO, 'test-bez-konfiguracji');
  assert.equal(run(bezKlucza, 'x.pages.dev').SB_URL, '');
  const cf = czytaj('tools/test-env/cf-build.sh');
  const iFlaga = cf.indexOf("sed -i 's|^  var BM_ARTEFAKT_TESTOWY = false;$|  var BM_ARTEFAKT_TESTOWY = true;|' dist/sb.js");
  const iWersja = cf.indexOf('node tools/wersjonuj-zasoby.js dist\n');
  assert.ok(iFlaga > 0 && iWersja > iFlaga, 'flaga PRZED wersjonowaniem (hash z treści po podmianie)');
  assert.match(cf, /flaga testowa w sb\.js w REPO/, 'build odmawia, gdy flaga true w repo');
  assert.doesNotMatch(czytaj('.github/workflows/deploy.yml'), /cf-build|BM_ARTEFAKT/, 'artefakt prod nigdy nie przechodzi przez cf-build');
});

test('front testowy na Workers: html_handling "none" (bez przekierowań .html jak GitHub Pages), worker przepisuje tylko „/"', () => {
  const w = czytaj('tools/test-env/wrangler.jsonc');
  assert.match(w, /"html_handling": "none"/, 'inne wartości przekierowują /x.html → /x (Pages: 308) — precache SW nie obsłuży nawigacji offline');
  assert.match(w, /"not_found_handling": "404-page"/);
  assert.match(w, /"directory": "\.\.\/\.\.\/dist"/);
  const k = czytaj('tools/test-env/worker.js');
  assert.match(k, /if \(url\.pathname === '\/'\) \{\n\s+url\.pathname = '\/index\.html';/);
  assert.equal((k.match(/env\.ASSETS\.fetch/g) || []).length, 2, 'worker nie robi nic poza „/" → index i przekazaniem do plików');
  assert.match(czytaj('.gitignore'), /^\.wrangler\/$/m);
});
