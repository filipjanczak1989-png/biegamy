/* BLIZNA 218 / TRYB POKAZU I GOTOWOŚĆ NA 18.11 (11.11.2026). js/miasto-pokaz.mjs na czterech stronach miasta + font Bebas Neue z repo (OFL).
   Pilnuje:
   (1) bez ?pokaz=… moduł nie dotyka strony (żadnego elementu, żadnego zapisu); z ?pokaz=1 pasek; z ?pokaz=gotowosc ekran gotowości tylko na miasto.html;
   (2) scenariusz: 12 kroków pełnych (≈ 6 min), 7 skróconych (≈ 3 min), każdy krok na jednej z czterech stron, selektory kroków istnieją w tych stronach,
       jedno zdanie na krok (≤ 240 znaków), bez imienia bohatera, nazwisk, „partner”, kwot; pierwszy i ostatni krok na mapie miasta;
   (3) stan pokazu w jednym kluczu localStorage; „Wyczyść” kasuje klucze pokazu wszystkich czterech stron;
   (4) lista plików gotowości budowana z żywych stron (script src i literały assets/) + dynamiczne domki i font; strony i skrypty przez cache statyczny SW, grafiki do bm-miasto-grafiki-v1;
   (5) font: assets/fonty/BebasNeue-Regular.ttf (TrueType) + OFL w repo; każda z czterech stron ma @font-face z local() i url() i NIE pobiera Bebas z Google (Inter zostaje);
   (6) sw.js, dla-fabianka.html, akcja.mjs nietknięte; moduł pokazu wpięty na końcu każdej z czterech stron z defer. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const MJS = czytaj('js/miasto-pokaz.mjs'), STRONY = ['miasto.html', 'miasto-bieg.html', 'miasto-firmy.html', 'miasto-druzyny.html'], HTML = {};
for (const s of STRONY) HTML[s] = czytaj(s);

function modul(opcje) {
  const o = opcje || {}, pamiec = new Map(), dodane = [];
  const el = (tag) => ({ tagName: tag.toUpperCase(), className: '', style: {}, children: [], attrs: {}, textContent: '', innerHTML: '', appendChild(x) { this.children.push(x); dodane.push(x); return x; }, setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener() {}, querySelector: () => null, classList: { add() {} } });
  const body = el('body'), head = el('head');
  const ctx = { console, Promise, JSON, Math, Number, String, Object, Array, Date, RegExp, isFinite, setTimeout: (f) => { if (o.odpalTimery) f(); return 1; }, Event: function () {},
    document: { readyState: 'complete', body, head, createElement: el, getElementById: () => null, querySelector: () => null, addEventListener() {} },
    location: { pathname: '/' + (o.strona || 'miasto.html'), search: o.search || '', hash: '', href: '' }, history: { replaceState() {} }, dispatchEvent() {}, scrollTo() {}, pageYOffset: 0,
    localStorage: { getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null), setItem: (k, v) => pamiec.set(k, String(v)), removeItem: (k) => pamiec.delete(k) }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: {}, fetch: o.fetch, caches: o.caches };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.runInNewContext(MJS, ctx);
  if (o.odpalTimery) {}
  return { P: ctx.BM_POKAZ, ctx, pamiec, dodane, body, head };
}

test('(1) bez ?pokaz moduł niczego nie dotyka; z ?pokaz=1 pasek; ?pokaz=gotowosc tylko na miasto.html', () => {
  const nic = modul({ odpalTimery: true });
  assert.equal(nic.dodane.length, 0, 'bez parametru: żaden element nie dodany'); assert.equal(nic.pamiec.size, 0, 'bez parametru: żaden zapis');
  assert.equal(nic.P.parametr(), null);
  const pasek = modul({ search: '?pokaz=1', odpalTimery: true });
  assert.ok(pasek.dodane.some((x) => x.className === 'pk-pasek'), 'pasek pokazu dodany do body');
  assert.ok(pasek.head.children.some((x) => x.tagName === 'STYLE'), 'CSS paska wstrzyknięty');
  const got = modul({ search: '?pokaz=gotowosc', odpalTimery: true, fetch: () => Promise.resolve({ ok: false }), caches: null });
  assert.ok(got.dodane.some((x) => x.className === 'pk-gotowosc'), 'ekran gotowości na miasto.html');
  const gotObca = modul({ search: '?pokaz=gotowosc', strona: 'miasto-bieg.html', odpalTimery: true });
  assert.ok(!gotObca.dodane.some((x) => x.className === 'pk-gotowosc')); assert.equal(gotObca.ctx.location.href, 'miasto.html?pokaz=gotowosc', 'gotowość z innej strony odsyła do miasta');
});

test('(2) scenariusz: 12 kroków pełnych, 7 skróconych; strony i selektory istnieją; jedno zdanie na krok; bez imienia, nazwisk, „partner” i kwot; mapa na początku i na końcu', () => {
  const { P } = modul();
  assert.equal(P.KROKI.length, 12); assert.equal(P.lista('pelny').length, 12); assert.equal(P.lista('krotki').length, 7); assert.equal(P.czasMin('pelny'), 6); assert.equal(P.czasMin('krotki'), 3);
  assert.equal(P.KROKI[0].strona, 'miasto.html'); assert.equal(P.KROKI[P.KROKI.length - 1].strona, 'miasto.html');
  for (const s of STRONY) assert.ok(P.KROKI.some((k) => k.strona === s), 'krok na ' + s);
  for (const k of P.KROKI) {
    assert.ok(STRONY.includes(k.strona), k.co + ': strona z listy'); assert.ok(k.co.length <= 40 && k.zdanie.length <= 240, k.co + ': krótkie'); assert.equal((k.zdanie.match(/[.!?](\s|$)/g) || []).length <= 3, true, k.co + ': najwyżej trzy zdania');
    const h = HTML[k.strona];
    if (k.przewin) { const id = k.przewin.replace('#', ''); assert.match(h, new RegExp('id="' + id + '"'), k.co + ': element ' + k.przewin + ' istnieje'); }
    if (k.hash) assert.match(h, new RegExp("location\\.hash === '" + k.hash + "'"), k.co + ': strona obsługuje ' + k.hash);
    if (k.klik) { const sel = k.klik.replace(/^\[|\]$/g, '').replace(/^\./, ''); const atr = /^(data-[a-z-]+)="([^"]+)"$/.exec(sel) || /\[(data-[a-z-]+)="([^"]+)"\]/.exec(k.klik); if (atr) assert.ok(h.includes(atr[1] + '="' + atr[2] + '"') || h.includes(atr[1] + '="\' + ') || new RegExp(atr[1] + '="\\\'? ?\\+?').test(h) || czytaj('js/' + k.strona.replace('.html', '.mjs')).includes(atr[1]), k.co + ': ' + k.klik); else assert.ok(h.includes('class="dz'), k.co); }
    assert.doesNotMatch(k.zdanie + k.co, /fabian|partner|zł|\b[A-ZŁŚŻ][a-ząęółśżźćń]+ [A-ZŁŚŻ][a-ząęółśżźćń]+(ski|cka|wicz|czyk)\b/i, k.co + ': bez imienia, „partner”, kwot i nazwisk');
  }
  assert.ok(P.KROKI.some((k) => /Kliknięcia, nie wpłaty/.test(k.zdanie)) && P.KROKI.some((k) => /BiegaMy nic nie przyjmuje/.test(k.zdanie)));
  assert.doesNotMatch(MJS, /fabian/i);
});

test('(3) stan w jednym kluczu; „Wyczyść” kasuje klucze czterech stron; krok i tryb zapisane', () => {
  const { P, pamiec } = modul();
  assert.equal(P.KLUCZ, 'bm_pokaz'); assert.deepEqual([...P.KLUCZE_STANU], ['bm_pokaz', 'bm_bieg_pokaz', 'bm_druzyny_pokaz', 'bm_firmy_miasto']);
  for (const [s, k] of [['miasto-bieg.html', 'bm_bieg_pokaz'], ['miasto-druzyny.html', 'bm_druzyny_pokaz']]) assert.match(czytaj('js/' + s.replace('.html', '.mjs')), new RegExp('"' + k + '"'), k + ' to klucz strony ' + s);
  assert.match(czytaj('js/miasto-firmy.mjs'), /"bm_firmy_miasto"/);
  P.zapisz({ krok: 4, tryb: 'krotki' }); assert.deepEqual({ ...P.odczytaj() }, { krok: 4, tryb: 'krotki' });
  pamiec.set('bm_bieg_pokaz', '{"zapis":1}'); pamiec.set('bm_firmy_miasto', 'x'); P.wyczyscPokaz(); assert.equal(pamiec.size, 0);
  assert.deepEqual({ ...P.odczytaj() }, { krok: 0, tryb: 'pelny' }, 'po wyczyszczeniu od zera');
  assert.deepEqual([...new Set((MJS.match(/localStorage\.(set|get|remove)Item\(([^,)]+)/g) || []).map((s) => s.replace(/localStorage\.(set|get|remove)Item\(/, '')))].sort(), ['KLUCZ', 'k'], 'zapis tylko pod KLUCZ, kasowanie po liście');
});

test('(4) lista plików gotowości z żywych stron: 4 strony, ich skrypty, literały assets/, domki i font; strony/skrypty do cache statycznego SW, grafiki do bm-miasto-grafiki-v1', async () => {
  const pliki = {};
  for (const s of STRONY) pliki[s] = HTML[s];
  for (const m of ['js/akcja.mjs', 'js/miasto.mjs', 'js/miasto-bieg.mjs', 'js/miasto-firmy.mjs', 'js/miasto-druzyny.mjs', 'js/miasto-pokaz.mjs']) pliki[m] = czytaj(m);
  const { P } = modul({ fetch: (u) => Promise.resolve({ ok: !!pliki[u], text: () => Promise.resolve(pliki[u] || '') }) });
  const lista = await P.listaPlikow();
  for (const s of STRONY) assert.ok(lista.includes(s), s);
  for (const m of ['js/miasto.mjs', 'js/miasto-bieg.mjs', 'js/miasto-firmy.mjs', 'js/miasto-druzyny.mjs', 'js/akcja.mjs', 'js/miasto-pokaz.mjs']) assert.ok(lista.includes(m), m);
  for (const a of ['assets/miasto/szkola.webp', 'assets/miasto/bieg-kibice.svg', 'assets/ulica/domek-7.webp', 'assets/ulica/wiezowiec.webp', 'assets/fonty/BebasNeue-Regular.ttf', 'assets/miasto/tlo-mapy.webp', 'assets/gra/slonce.webp']) assert.ok(lista.includes(a), a);
  assert.equal(new Set(lista).size, lista.length, 'bez powtórzeń'); assert.ok(lista.length >= 50 && lista.length <= 140, 'rozsądna liczba plików: ' + lista.length);
  for (const u of lista) assert.ok(fs.existsSync(path.join(KORZEN, u)), 'plik istnieje w repo: ' + u);
  assert.match(MJS, /\/-static\$\/\.test\(n\)/, 'cache statyczny SW rozpoznany po nazwie');
  assert.match(MJS, /serviceWorker\.register\("sw\.js", \{ updateViaCache: "none" \}\)/, 'rejestracja SW jak w sb.js');
  assert.match(MJS, /GRAFIKI_CACHE = "bm-miasto-grafiki-v1"/);
  assert.match(MJS, /GOTOWE DO TRYBU SAMOLOTOWEGO/); assert.match(MJS, /BRAKUJE /); assert.match(MJS, /Wyczyść pokaz i zacznij od nowa/);
  assert.doesNotMatch(MJS, /supabase|\.rpc\(|functions\/v1|sendBeacon/, 'moduł nie woła bazy (licznik przez BM_MIASTO, jak dotąd)');
});

test('(5) font Bebas Neue w repo (TrueType, OFL) i @font-face na czterech stronach; Bebas nie z Google, Inter zostaje', () => {
  const ttf = fs.readFileSync(path.join(KORZEN, 'assets/fonty/BebasNeue-Regular.ttf'));
  assert.equal(ttf.readUInt32BE(0), 0x00010000, 'TrueType'); assert.ok(ttf.length > 30000 && ttf.length < 120000);
  assert.match(czytaj('assets/fonty/OFL-BebasNeue.txt'), /SIL OPEN FONT LICENSE Version 1\.1/i);
  for (const s of STRONY) {
    const h = HTML[s];
    assert.match(h, /@font-face \{ font-family: 'Bebas Neue'; font-style: normal; font-weight: 400; font-display: swap; src: local\('Bebas Neue'\), local\('BebasNeue-Regular'\), url\(assets\/fonty\/BebasNeue-Regular\.ttf\) format\('truetype'\); \}/, s + ': @font-face');
    assert.doesNotMatch(h, /family=Bebas/, s + ': Bebas nie z Google'); assert.match(h, /family=Inter/, s + ': Inter z Google (bez sieci: system)');
    assert.match(h, /<script src="js\/miasto-pokaz\.mjs" defer><\/script>/, s + ': moduł pokazu z defer');
    assert.ok(h.indexOf('miasto-pokaz.mjs') > h.lastIndexOf('<script src="js/' + (s === 'miasto.html' ? 'miasto' : s.replace('.html', '')) + '.mjs">'), s + ': pokaz po module strony');
  }
});

test('(6) sw.js, dla-fabianka.html i akcja.mjs nietknięte; strony pokazu nadal noindex', () => {
  assert.doesNotMatch(czytaj('sw.js'), /miasto-pokaz|assets\/fonty|bm_pokaz/); assert.doesNotMatch(czytaj('dla-fabianka.html'), /miasto-pokaz|assets\/fonty/); assert.doesNotMatch(czytaj('js/akcja.mjs'), /miasto-pokaz|bm_pokaz/);
  for (const s of STRONY) assert.match(HTML[s], /<meta name="robots" content="noindex, nofollow">/);
});
