// Blizna #47 (08.10.2026) — HTML i JS jednego deployu muszą być parą: adres zasobu niesie hash treści.
//
// Smoke Filipa po a3e546c. Odtworzone (tools/smoke-offline.js SMOKE_SW=1, scenariusz G, wersja N-1 → N):
// pierwsze wejście online po deployu dostawało NOWY zawodnik.html (nawigacja network-first) ze STARYM
// sb.js i js/dzis-offline.js (stale-while-revalidate z cache SW poprzedniej wersji) →
// „TypeError: window._tydzienWaw is not a function" w updateWeekProgress, połknięty przez try/catch
// loadLogs. Z artefaktem przepuszczonym przez tools/wersjonuj-zasoby.js: zero błędów, JS wersji N.
//
// Test uruchamia narzędzie na kopii prawdziwych plików w katalogu tymczasowym (repo zostaje bez ?v=).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8');
const { wersjonuj, odwolania } = require('../tools/wersjonuj-zasoby.js');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 10);

function artefakt() {
  const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'blizna47-'));
  for (const f of fs.readdirSync(KORZEN)) if (/\.html$/.test(f) || ['sw.js', 'sb.js', 'theme.css'].includes(f)) fs.copyFileSync(path.join(KORZEN, f), path.join(kat, f));
  for (const d of ['js', 'vendor']) fs.cpSync(path.join(KORZEN, d), path.join(kat, d), { recursive: true });
  return kat;
}
const tablica = (sw, nazwa) => sw.match(new RegExp('const ' + nazwa + ' = \\[([\\s\\S]*?)\\];'))[1].match(/'[^']+'/g).map((x) => x.slice(1, -1));

test('repo: odwołania do własnych .js/.css są BEZ ?v= (wersjonuje się tylko artefakt)', () => {
  const zle = [];
  for (const f of fs.readdirSync(KORZEN).filter((x) => /\.html$/.test(x))) for (const o of odwolania(czytaj(f))) if (/\?v=/.test(o.surowy)) zle.push(f + ': ' + o.surowy);
  assert.deepEqual(zle, []);
  assert.doesNotMatch(czytaj('sw.js'), /'\/[^']+\?v=/, 'sw.js w repo bez ?v=');
});

test('artefakt: każde odwołanie ma ?v=<sha256:10 treści>, precache sw.js ma te same adresy, krytyczne ⊂ precache', () => {
  const kat = artefakt();
  try {
    const w = wersjonuj(kat);
    assert.ok(w.odwolan >= 50 && w.plikow >= 7 && w.swWpisow >= 11, JSON.stringify({ o: w.odwolan, p: w.plikow, sw: w.swWpisow }));
    const zHtml = new Map();
    for (const f of fs.readdirSync(kat).filter((x) => /\.html$/.test(x))) {
      for (const o of odwolania(fs.readFileSync(path.join(kat, f), 'utf8'))) {
        const plik = path.join(kat, o.sciezka);
        if (!fs.existsSync(plik)) continue;
        assert.equal(o.surowy, o.sciezka + '?v=' + sha(plik), f + ': ' + o.surowy);
        zHtml.set('/' + o.sciezka, '/' + o.surowy);
      }
    }
    const sw = fs.readFileSync(path.join(kat, 'sw.js'), 'utf8');
    const pre = tablica(sw, 'PRECACHE_URLS'), kryt = tablica(sw, 'PRECACHE_KRYTYCZNE');
    for (const [goly, zV] of zHtml) if (pre.some((u) => u.split('?')[0] === goly)) assert.ok(pre.includes(zV), 'precache nie ma adresu, którego żąda HTML: ' + zV);
    for (const k of kryt) assert.ok(pre.includes(k), 'krytyczny spoza precache po przepisaniu: ' + k);
    for (const k of ['/sb.js', '/js/dzis-offline.js', '/theme.css']) assert.ok(kryt.some((u) => u.startsWith(k + '?v=')), 'krytyczny bez ?v=: ' + k);
    assert.ok(kryt.includes('/zawodnik.html') && kryt.includes('/kalendarz.html'), 'strony HTML zostają bez ?v= (nawigacja)');
    // idempotencja + tryb --sprawdz
    const w2 = wersjonuj(kat);
    assert.equal(w2.zapisanych, 0, 'drugie przebieg nic nie zmienia');
    assert.deepEqual(wersjonuj(kat, { sprawdz: true }).nieaktualne, []);
  } finally { fs.rmSync(kat, { recursive: true, force: true }); }
});

test('nieaktualny ?v= jest podmieniany; adresy obce, CDN, szablony i nie-.js/.css zostają', () => {
  const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'blizna47b-'));
  try {
    fs.writeFileSync(path.join(kat, 'a.js'), 'const a = 1;');
    fs.writeFileSync(path.join(kat, 'sw.js'), "const PRECACHE_URLS = ['/a.js?v=0000000000'];");
    fs.writeFileSync(path.join(kat, 'x.html'), '<script src="a.js?v=deadbeef00"></script><script src="https://cdn.x/y.js"></script><img src="${u}.js"><link rel="manifest" href="manifest.json"><script src="brak.js"></script>');
    const w = wersjonuj(kat, { sprawdz: true });
    assert.deepEqual(w.nieaktualne, ['x.html: a.js?v=deadbeef00']);
    wersjonuj(kat);
    const h = sha(path.join(kat, 'a.js'));
    const html = fs.readFileSync(path.join(kat, 'x.html'), 'utf8');
    assert.ok(html.includes('src="a.js?v=' + h + '"'));
    for (const zostaje of ['src="https://cdn.x/y.js"', 'src="${u}.js"', 'href="manifest.json"', 'src="brak.js"']) assert.ok(html.includes(zostaje), zostaje);
    assert.equal(fs.readFileSync(path.join(kat, 'sw.js'), 'utf8'), "const PRECACHE_URLS = ['/a.js?v=" + h + "'];");
  } finally { fs.rmSync(kat, { recursive: true, force: true }); }
});

test('bezpieczniki: odmowa na repo (.git); sw.js bez wpisów precache → błąd PRZED zapisem (zero połowicznych plików)', () => {
  assert.throws(() => wersjonuj(KORZEN), /repo/);
  const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'blizna47c-'));
  try {
    fs.writeFileSync(path.join(kat, 'a.js'), 'x');
    fs.writeFileSync(path.join(kat, 'sw.js'), 'const PRECACHE_URLS = [];');
    const html = '<script src="a.js"></script>';
    fs.writeFileSync(path.join(kat, 'x.html'), html);
    assert.throws(() => wersjonuj(kat), /przerwane bez zapisu/);
    assert.equal(fs.readFileSync(path.join(kat, 'x.html'), 'utf8'), html, 'HTML nietknięty');
  } finally { fs.rmSync(kat, { recursive: true, force: true }); }
});

test('deploy.yml: krok wersjonowania na /tmp/site, po złożeniu artefaktu i przed uploadem, z continue-on-error (rollback idzie tym workflow)', () => {
  const d = czytaj('.github/workflows/deploy.yml').replace(/\r/g, '');
  const iStage = d.indexOf('- name: Stage site'), iW = d.indexOf('- name: Wersjonuj zasoby (artefakt)'), iUp = d.indexOf('actions/upload-pages-artifact');
  assert.ok(iStage > 0 && iW > iStage && iUp > iW, 'kolejność: Stage site → Wersjonuj → upload');
  const krok = d.slice(iW, iUp);
  assert.match(krok, /continue-on-error: true/);
  assert.match(krok, /node tools\/wersjonuj-zasoby\.js \/tmp\/site\n/);
  assert.match(krok, /node tools\/wersjonuj-zasoby\.js \/tmp\/site --sprawdz/);
  assert.match(czytaj('.github/workflows/rollback.yml'), /deploy\.yml/, 'rollback używa deploy.yml — krok wersjonowania nie może go blokować');
});

test('sw.js: stale-while-revalidate offline bez dokładnej kopii sięga po tę samą ścieżkę z innym ?v= (tylko po błędzie sieci)', () => {
  const sw = czytaj('sw.js').replace(/\r/g, '');
  const f = sw.slice(sw.indexOf('async function staleWhileRevalidate('), sw.indexOf('async function cacheFirst('));
  assert.match(f, /\.catch\(\(\) => cached \|\| cache\.match\(request, \{ ignoreSearch: true \}\)\);/);
  assert.equal((f.match(/ignoreSearch/g) || []).length, 1, 'ignoreSearch wyłącznie w gałęzi błędu sieci');
});

test('smoke: scenariusz G (wersja N-1 → N) i przełącznik SMOKE_G_BEZ_WERSJI do kontroli negatywnej', () => {
  const t = czytaj('tools/smoke-offline.js');
  assert.match(t, /SMOKE_G_BEZ_WERSJI/);
  assert.match(t, /require\('\.\/wersjonuj-zasoby\.js'\)\.wersjonuj\(katN\)/);
  assert.ok(t.includes("SW G: pierwsze wejście po deployu"), 'punkt G');
  assert.ok(t.includes("SW G: po deployu „Dziś\" offline"), 'offline po deployu');
});
