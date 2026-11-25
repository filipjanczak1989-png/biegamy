// Blizna #353 (25.11.2026) — moduły js/*.mjs dostają ?v=<hash treści> tak samo jak .js i .css.
//
// tools/wersjonuj-zasoby.js (blizna-47) znał tylko .js i .css. 26 modułów .mjs wpiętych zwykłym <script src> na 17 stronach
// (55 odwołań: akcja.mjs, odznaki-akcji.mjs, tekst.mjs, ulica.mjs…) szło bez ?v=, więc po deployu nowy HTML mógł dostać
// stary moduł z cache Service Workera — błąd „nowy HTML + stary skrypt”, przed którym narzędzie chroni resztę plików.
// Pierwszy commit E1 nowego Dziś (plan 13.11, §4 „Wersjonowanie i Service Worker”).
//
// Narzędzie czyta tylko atrybuty src/href. Adresy składane w kodzie zostają bez ?v= — ich lista jest tu JAWNA, żeby nowe
// takie miejsce nie weszło po cichu. js/dzis-nowy.mjs ma własną stałą MODUL_V (blizna-336).
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
const STRONY = fs.readdirSync(KORZEN).filter((x) => /\.html$/.test(x));
const MODULY = fs.readdirSync(path.join(KORZEN, 'js')).filter((x) => /\.mjs$/.test(x));

function artefakt() {
  const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'blizna353-'));
  for (const f of fs.readdirSync(KORZEN)) if (/\.html$/.test(f) || ['sw.js', 'sb.js', 'theme.css'].includes(f)) fs.copyFileSync(path.join(KORZEN, f), path.join(kat, f));
  for (const d of ['js', 'vendor']) fs.cpSync(path.join(KORZEN, d), path.join(kat, d), { recursive: true });
  return kat;
}
const tablica = (sw, nazwa) => sw.match(new RegExp('const ' + nazwa + ' = \\[([\\s\\S]*?)\\];'))[1].match(/'[^']+'/g).map((x) => x.slice(1, -1));

test('(1) odwolania(): .mjs jak .js — własny origin tak, obce adresy, szablony i podobne rozszerzenia nie', () => {
  const html = '<script src="js/akcja.mjs"></script><script type="module" src="./js/tekst.mjs?v=stare"></script>' +
    "<link rel='modulepreload' href='/js/ulica.mjs'>" +
    '<script src="https://cdn.example/x.mjs"></script><script src="//cdn.example/y.mjs"></script><script src="js/${n}.mjs"></script>' +
    '<script src="js/plik.mjsx"></script><a href="js/opis.mjs.txt">x</a><script src="js/zwykly.js"></script>';
  assert.deepEqual(odwolania(html).map((o) => [o.surowy, o.sciezka]),
    [['js/akcja.mjs', 'js/akcja.mjs'], ['./js/tekst.mjs?v=stare', 'js/tekst.mjs'], ['/js/ulica.mjs', 'js/ulica.mjs'], ['js/zwykly.js', 'js/zwykly.js']]);
});

test('(2) artefakt: każdy <script src> do js/*.mjs ma ?v=<sha256:10 treści>; precache sw.js trzyma te same adresy', () => {
  const kat = artefakt();
  try {
    const w = wersjonuj(kat);
    let atrybutow = 0; const zHtml = new Map(); const stron = new Set();
    for (const f of STRONY) {
      const html = fs.readFileSync(path.join(kat, f), 'utf8');
      assert.doesNotMatch(html, /<script\b[^>]*\bsrc=["'](?:\.?\/)?js\/[a-z0-9-]+\.mjs["']/, f + ': <script src> do .mjs bez ?v=');
      for (const o of odwolania(html)) {
        if (!/\.mjs$/.test(o.sciezka)) continue;
        assert.equal(o.surowy.replace(/^\.?\//, ''), o.sciezka + '?v=' + sha(path.join(kat, o.sciezka)), f + ': ' + o.surowy);
        atrybutow++; stron.add(f); zHtml.set('/' + o.sciezka, '/' + o.sciezka + '?v=' + sha(path.join(kat, o.sciezka)));
      }
    }
    assert.ok(atrybutow >= 50 && stron.size >= 15 && zHtml.size >= 24, JSON.stringify({ atrybutow, stron: stron.size, modulow: zHtml.size }));
    assert.equal(Object.entries(w.hashe).filter(([k, v]) => v && /\.mjs$/.test(k)).length, zHtml.size, 'tyle samo modułów w raporcie narzędzia');
    // precache: moduł, którego żąda HTML, ma w sw.js DOKŁADNIE ten adres (offline: trafienie bez ignoreSearch)
    const pre = tablica(fs.readFileSync(path.join(kat, 'sw.js'), 'utf8'), 'PRECACHE_URLS').filter((u) => /\.mjs(\?|$)/.test(u));
    assert.ok(pre.length >= 7, 'precache .mjs: ' + pre.length);
    for (const u of pre) {
      const goly = u.split('?')[0];
      if (zHtml.has(goly)) assert.equal(u, zHtml.get(goly), 'precache ma inny adres niż HTML: ' + u);
      else assert.equal(u, goly, 'moduł bez <script src> zostaje w precache bez ?v= (ładowany z kodu pod gołym adresem): ' + u);
    }
    assert.ok(pre.includes('/js/plan-pusty.mjs'), "plan-pusty.mjs: import('./js/plan-pusty.mjs') w zawodnik.html żąda gołego adresu");
    for (const m of ['/js/akcja.mjs', '/js/tekst.mjs', '/js/odznaki-akcji.mjs']) assert.ok(pre.includes(zHtml.get(m)), 'precache bez wersji: ' + m);
    // bieg.html: ręczne ?v= (8 znaków, blizna-299) zastąpione hashem narzędzia. Selektor script[src="…"] w kodzie strony narzędzie
    // przepisuje tak samo jak atrybut; znacznika akcja-cytaty na tej stronie nie ma, więc selektor nie trafia ani przed, ani po.
    const bieg = fs.readFileSync(path.join(kat, 'bieg.html'), 'utf8');
    for (const m of ['js/akcja.mjs', 'js/bieg.mjs']) assert.ok(bieg.includes('<script defer src="' + m + '?v=' + sha(path.join(kat, m)) + '"></script>'), 'bieg.html: ' + m);
    assert.ok(bieg.includes('script[src="' + zHtml.get('/js/akcja-cytaty.mjs').slice(1) + '"]'), 'bieg.html: selektor przepisany jak atrybut');
    assert.doesNotMatch(czytaj('bieg.html'), /<script\b[^>]*akcja-cytaty\.mjs/, 'bieg.html nie ma znacznika akcja-cytaty');
    // własna wersja nowego Dziś nietknięta
    assert.ok(fs.readFileSync(path.join(kat, 'zawodnik.html'), 'utf8').includes("el.src = 'js/dzis-nowy.mjs?v=' + MODUL_V;"));
    assert.equal(wersjonuj(kat).zapisanych, 0, 'drugi przebieg nic nie zmienia');
    assert.deepEqual(wersjonuj(kat, { sprawdz: true }).nieaktualne, []);
  } finally { fs.rmSync(kat, { recursive: true, force: true }); }
});

test('(3) repo: <script src> do .mjs bez ?v= (wersjonuje się tylko artefakt) i żaden moduł nie ma statycznego import/export … from', () => {
  const RECZNE_299 = /^bieg\.html: js\/(akcja|bieg)\.mjs\?v=[0-9a-f]{8}$/;   // jedyny wyjątek: ręczne ?v= pilnowane przez blizna-299
  for (const f of STRONY) for (const o of odwolania(czytaj(f))) if (/\.mjs$/.test(o.sciezka) && !RECZNE_299.test(f + ': ' + o.surowy)) assert.doesNotMatch(o.surowy, /\?/, f + ': ' + o.surowy);
  // statyczny import wewnątrz modułu byłby adresem, którego narzędzie nie widzi (czyta tylko HTML)
  for (const m of MODULY) assert.doesNotMatch(czytaj('js/' + m), /^\s*(?:import\s[^(]*?from|import\s*["']|export\s[^;]*?\sfrom)\s*["']?/m, 'js/' + m + ': statyczny import/export from');
});

test('(4) adresy .mjs składane w kodzie (bez ?v= z narzędzia): lista jawna, nowe miejsce = decyzja', () => {
  const pliki = STRONY.concat(fs.readdirSync(path.join(KORZEN, 'js')).filter((x) => /\.m?js$/.test(x)).map((x) => 'js/' + x), ['sb.js', 'sw.js']);
  const znalezione = [];
  for (const f of pliki) {
    const t = czytaj(f).replace(/\r/g, '');
    for (const m of t.matchAll(/(?:\.src\s*=\s*|\bimport\s*\(\s*|setAttribute\(\s*["']src["']\s*,\s*)["'](?:\.\/)?(js\/[a-z0-9-]+\.mjs)/g)) znalezione.push(f + ' → ' + m[1]);
  }
  assert.deepEqual(znalezione.sort(), [
    'bieg.html → js/akcja-cytaty.mjs',         // tylko gdy na stronie nie ma już <script src> (ten ma ?v=); offline: sw.js ignoreSearch
    'js/akcja.mjs → js/akcja-wklad-karta.mjs', // karta wkładu, po dotknięciu
    'js/akcja.mjs → js/akcja-wklad-karta.mjs',
    'js/akcja.mjs → js/sezon.mjs',             // tylko gdy strona nie wczytała sezonu sama (BM_SEZON)
    'js/akcja.mjs → js/ulica.mjs',             // tylko gdy strona nie wczytała ulicy sama (BM_ULICA)
    'zawodnik.html → js/dzis-nowy.mjs',        // własna stała MODUL_V (blizna-336)
    'zawodnik.html → js/plan-pusty.mjs',       // goły adres = goły wpis w precache
  ]);
});
