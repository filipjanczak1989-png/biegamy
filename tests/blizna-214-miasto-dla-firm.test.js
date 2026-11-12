/* BLIZNA 214 / MIASTO DOBRA · DLA FIRM (11.11.2026). miasto-firmy.html + js/miasto-firmy.mjs: strona pokazowa, noindex, wejście tylko z miasto.html.
   Pilnuje: (1) zasad Miasta (BiegaMy nie przyjmuje pieniędzy; „organizacja prowadząca zbiórkę”; bez nazw serwisów i organizacji; „partner” tylko jako „partner rzeczowy”
   firmy i „Partner Miasta Dobra” platformy; bez imion w kodzie, nazwisk, e-maili, kwot wpłat przy osobach; przykłady oznaczone PRZYKŁAD; lista odmów i tego, czego firma nie kupuje);
   (2) strona niczego nie wysyła: tylko publiczny licznik przez js/akcja.mjs, grafiki z assets/ przez Cache API, jedyny zapis = localStorage stanu ulicy, bez formularza;
   (3) kalkulator sponsora, odcinki, ranking (PRZYKŁAD), deklaracja (WZÓR), nazwa firmy oczyszczona; (4) podziękowanie na canvasie i scena bez znaku organizacji i bez kwot wpłat;
   (5) druk: A4 pion, oferta i deklaracja osobno, podpisy i miejsce na datę; (6) miasto.html linkuje „Dla firm ›”, nic innego w aplikacji nie linkuje do tej strony. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const HTML = czytaj('miasto-firmy.html'), MJS = czytaj('js/miasto-firmy.mjs'), MIASTO = czytaj('miasto.html');
const LICZNIK = { wystartowala: true, nazwa: 'Kilometry dla Marka', imie: 'Marek', url_zbiorki: 'https://x/zbiorka', cel_km: 12500, suma_km: 1900, pct: 15.2, koniec: null, zamknieta: false, firmy: [{ nazwa: 'A' }, { nazwa: 'B' }, { nazwa: 'C' }], prog_domku_zl: 100, prog_wiezowca_zl: 1000, plakat_url: 'https://x/p', filip_gr: 5, wizerunek: 'x' };

function modul(o) {
  o = o || {};
  const pamiec = new Map(), napisy = [], obrazy = [];
  const el = (tag) => { const e = { tagName: tag.toUpperCase(), className: '', style: {}, children: [], attrs: {}, textContent: '', id: '', alt: '', src: '', hidden: false, appendChild(x) { this.children.push(x); x.parentNode = this; return x; }, removeChild(x) { this.children = this.children.filter((c) => c !== x); }, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; }, get firstChild() { return this.children[0] || null; } }; if (tag === 'canvas') e.getContext = () => ctx2d(); return e; };
  const ctx2d = () => new Proxy({ fillText: (t) => napisy.push(String(t)), drawImage: (im) => obrazy.push(im), measureText: (t) => ({ width: String(t).length * 10 }), createLinearGradient: () => ({ addColorStop() {} }) }, { get: (c, k) => (k in c ? c[k] : () => {}), set: () => true });
  const ctx = { console, Promise, JSON, Math, Number, String, Object, Array, Date, RegExp, isFinite, Proxy, setTimeout, clearTimeout, document: { createElement: el, createTextNode: (t) => ({ textContent: String(t), children: [] }), head: el('head'), getElementById: () => null, addEventListener() {}, querySelector: () => null },
    localStorage: { getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null), setItem: (k, v) => pamiec.set(k, String(v)) } };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.runInNewContext(czytaj('js/akcja.mjs'), ctx);
  vm.runInNewContext(MJS, ctx);
  return { F: ctx.BM_FIRMY_MIASTO, ctx, pamiec, napisy, obrazy, el };
}
const wszystkie = (e, acc = []) => { acc.push(e); (e.children || []).forEach((c) => wszystkie(c, acc)); return acc; };
const zKlasa = (e, k) => wszystkie(e).filter((x) => String(x.className).split(/\s+/).includes(k));

test('(1) zasady Miasta: pieniądze tylko firma → organizacja, „partner” tylko rzeczowy i Miasta Dobra, bez nazw serwisów, imion, nazwisk, e-maili; odmowy i granice; przykłady oznaczone', () => {
  for (const [n, t] of [['miasto-firmy.html', HTML], ['js/miasto-firmy.mjs', MJS]]) {
    assert.doesNotMatch(t.replace(/dla-fabianka(\.html)?/g, ''), /fabian/i, n + ': imię bohatera tylko z licznika'); assert.doesNotMatch(t, /Kasia|Filip/, n + ': bez imion organizatorów');
    assert.doesNotMatch(t, /[\w.+-]+@[\w-]+\.[\w.]+/, n + ': bez e-maili'); assert.doesNotMatch(t, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, n + ': bez UUID');
    assert.doesNotMatch(t, /siepomaga|zrzutka|pomagam\.pl|fundacj[aeiy] [A-ZŁŚŻ]|stowarzyszeni[ae] [A-ZŁŚŻ]/, n + ': bez nazw serwisów zbiórek i organizacji');
    assert.doesNotMatch(t, /chor(ob|y|uje)|diagnoz|nowotw|szpital|leczeni|rehabilitac|niepełnospraw/i, n + ': bez diagnoz'); assert.doesNotMatch(t, /pamięci|pomnik|wieniec|upamiętni/i, n + ': bez upamiętnień');
    assert.doesNotMatch(t, /\b[A-ZŁŚŻ][a-ząęółśżźćń]+ [A-ZŁŚŻ][a-ząęółśżźćń]+(ski|cka|wicz|czyk|ak)\b/, n + ': bez imion i nazwisk');
    assert.doesNotMatch(t, /wpisow|prowizj[aęi] (dla|od) BiegaMy|faktur[aęy] BiegaMy za/i, n + ': bez opłat za udział i faktur BiegaMy');
    /* „partner”: wyłącznie partner rzeczowy (firma) albo Partner Miasta Dobra (platforma, w przygotowaniu); nigdy wobec organizacji */
    const bezDozwolonych = t.replace(/<[^>]+>/g, ' ').replace(/partner rzeczowy|Partnera? Miasta Dobra/g, '');
    assert.ok(/partner rzeczowy|Partner Miasta Dobra/.test(t), n + ': dozwolone zwroty obecne');
    assert.doesNotMatch(bezDozwolonych, /partner/i, n + ': „partner” poza „partner rzeczowy” i „Partner Miasta Dobra”');
  }
  assert.ok((HTML.match(/organizacj[aąęi] prowadząc/gi) || []).length >= 4, '„organizacja prowadząca zbiórkę” w tekstach');
  assert.match(HTML, /BiegaMy nie dotyka pieniędzy\./); assert.match(HTML, /w przygotowaniu/); assert.doesNotMatch(HTML, /Partner Miasta Dobra[^<]{0,120}\d+\s?(zł|PLN)/, 'Partner Miasta Dobra bez cen');
  const { F } = modul();
  assert.deepEqual([...F.ODMOWA], ['hazard i zakłady', 'alkohol', 'tytoń i e-papierosy', 'pożyczki krótkoterminowe („chwilówki”)']);
  assert.equal(F.NIE_KUPUJE.length, 4); assert.ok(F.NIE_KUPUJE.join(' ').includes('wizerunku dziecka') && F.NIE_KUPUJE.join(' ').includes('danych uczestników') && F.NIE_KUPUJE.join(' ').includes('wybór zbiórek'));
  assert.ok(F.rankingDruzyn().every((d) => d.przyklad === true), 'ranking drużyn = PRZYKŁAD'); assert.equal(F.ULICA_PRZYKLAD.przyklad, true);
  assert.match(HTML, /Ranking wymyślony na potrzeby pokazu \(PRZYKŁAD\)/);
  for (const d of F.DRUZYNY_PRZYKLAD) assert.doesNotMatch(d.nazwa, /sp\. z|S\.A\.|fundacj/i);
});

test('(2) nic nie wysyła: licznik tylko przez js/akcja.mjs, grafiki z assets/ przez Cache API, jeden zapis w localStorage, bez formularza; noindex; skrypty tylko własne', () => {
  for (const [n, t] of [['miasto-firmy.html', HTML], ['js/miasto-firmy.mjs', MJS]]) {
    assert.doesNotMatch(t, /supabase\.createClient|window\.supabase|\.rpc\(|\.from\(["']|\.insert\(|\.upsert\(|XMLHttpRequest|sendBeacon|\.storage\.|functions\.invoke/i, n + ': żadnej drogi do bazy poza licznikiem');
    assert.doesNotMatch(t, /<form|action=|method="post"|FormData/i, n + ': bez formularza wysyłającego'); assert.doesNotMatch(t, /sessionStorage|indexedDB|document\.cookie/, n + ': bez innych zapisów');
  }
  assert.deepEqual([...HTML.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]), ['js/akcja.mjs', 'js/miasto-firmy.mjs', 'js/miasto-pokaz.mjs']);   // 11.11: + tryb pokazu
  assert.deepEqual([...new Set((HTML + MJS).match(/https?:\/\/[^\s"'<)]+/g))].sort(), ['https://afqojgkaveykxbltxzwm.supabase.co', 'https://fonts.googleapis.com', 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap'].sort(), 'adresy zewnętrzne: licznik (jak miasto.html) i fonty');
  assert.deepEqual([...HTML.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]), ['url'], 'jedyny fetch w stronie to własna grafika'); assert.match(HTML, /if \(!url \|\| !\/\^assets\\\/\/\.test\(url\) \|\| !window\.fetch\) return Promise\.resolve\(url\);/);
  assert.equal((MJS.match(/fetch\(/g) || []).length, 0); assert.equal((MJS.match(/localStorage\.setItem/g) || []).length, 1); assert.equal((HTML.match(/localStorage\./g) || []).length, 0);
  assert.match(MJS, /A\.pobierzPubliczny\(SLUG, \{ baza: BAZA \}\)/); assert.match(HTML, /<meta name="robots" content="noindex, nofollow">/);
  const { F } = modul();
  const czytane = new Set(), proxy = new Proxy(Object.assign({}, LICZNIK), { get(c, k) { if (typeof k === 'string') czytane.add(k); return c[k]; } });
  const u = F.ulicaZLicznika(proxy);
  for (const k of czytane) assert.ok(F.POLA_LICZNIKA.includes(k), 'czyta pole spoza listy: ' + k);
  assert.ok(!czytane.has('url_zbiorki') && !czytane.has('plakat_url') && !czytane.has('filip_gr'), 'nic z linków, plików i pieniędzy');
  assert.deepEqual({ ...u }, { status: 'trwa', nazwa: 'Ulica Marka', tytul: 'Kilometry dla Marka', cel_km: 12500, suma_km: 1900, pct: 15.2, firmy_n: 3, prog_domku_zl: 100, prog_wiezowca_zl: 1000, strona: 'dla-fabianka.html' });
  assert.equal(F.ulicaZLicznika({ wystartowala: false }).status, 'przed'); assert.equal(F.ulicaZLicznika(null).status, 'brak');
});

test('(3) kalkulator sponsora, odcinki, ranking, deklaracja WZÓR, nazwa firmy oczyszczona', () => {
  const { F } = modul(), u = F.ulicaZLicznika(LICZNIK);
  const k = F.kalkulatorSponsora(10, u);
  assert.deepEqual([k.stawka_gr, k.cel_km, k.limit_gr, k.dzis_gr], [10, 12500, 125000, 19000], '10 gr × 12 500 km = 1 250 zł; dziś 1 900 km = 190 zł');
  assert.deepEqual([...k.transze.map((t) => [t.prog_pct, t.km, t.kwota_gr, t.osiagnieta])].map((x) => x.join(':')), ['25:3125:31250:false', '50:6250:62500:false', '100:12500:125000:false']);
  assert.equal(k.zdanie, 'Każdy kilometr ulicy dokłada 10 gr, najwyżej 1 250 zł przy 12 500 km celu.');
  assert.equal(F.kalkulatorSponsora(7, u).stawka_gr, 10, 'stawka spoza listy → 10 gr'); assert.equal(F.kalkulatorSponsora(20, u).limit_gr, 250000);
  assert.equal(F.kalkulatorSponsora(5, { cel_km: 100, suma_km: 500 }).dzis_gr, 500, '„dziś” nie przekracza limitu');
  assert.deepEqual({ ...F.odcinki(u) }, { n: 125, km_na_odcinek: 100, zbudowane: 19, wolne: 106, biezacy: 20 });
  const r = F.rankingDruzyn(); assert.deepEqual([...r.map((d) => d.miejsce)], [1, 2, 3, 4]); assert.ok(r.every((d, i) => !i || d.km <= r[i - 1].km)); assert.equal(r[0].kwota_gr, 212 * 20);
  const d = F.deklaracja(20, u, '  <b>Piekarnia</b>  na Rogu ');
  assert.equal(d.naglowek, 'WZÓR, do przejrzenia przez prawnika'); assert.equal(d.firma, 'bPiekarnia/b na Rogu'); assert.equal(d.stawka, '20 gr za kilometr'); assert.equal(d.limit, '2 500 zł (12 500 km celu)');
  assert.deepEqual([...d.transze], ['25 % celu (3 125 km): 625 zł', '50 % celu (6 250 km): 1 250 zł', '100 % celu (12 500 km): 2 500 zł']);
  assert.ok(d.zastrzezenia[0].includes('BiegaMy nie przyjmuje pieniędzy') && d.zastrzezenia[1].includes('wizerunku dziecka'));
  assert.equal(F.nazwaFirmy(''), 'Twoja firma'); assert.equal(F.nazwaFirmy('x'.repeat(60)).length, 40); assert.equal(F.nazwaFirmy('<script>'), 'script');
  assert.deepEqual([F.zl(125000), F.zl(19050), F.zl(0)], ['1 250 zł', '190,5 zł', '0 zł']);
});

test('(4) podziękowanie na canvasie i scena: nazwa firmy, liczby ulicy, bez kwot wpłat, bez znaku organizacji; PRZYKŁAD tylko dla ulicy przykładowej', () => {
  const { F, napisy, el } = modul(), u = F.ulicaZLicznika(LICZNIK);
  const k = F.podziekowanie({ firma: 'Piekarnia na Rogu', ulica: u, sposob: 'sponsor', stawka_gr: 10 }, 'pion', {});
  assert.deepEqual([k.width, k.height], [1080, 1350]);
  for (const t of ['DZIĘKUJEMY', 'Piekarnia na Rogu', '1 900 km', '15,2 %', '3', 'MIASTO DOBRA · ULICA MARKA', 'sponsor kilometrów tej ulicy', 'każdy km ulicy dokłada 10 gr na zbiórkę', 'BiegaMy']) assert.ok(napisy.includes(t), 'podziękowanie: ' + t);
  assert.ok(!napisy.includes('PRZYKŁAD'), 'prawdziwa ulica bez znaczka'); assert.ok(!napisy.some((t) => /zł|@|logo/i.test(t)), 'bez kwot wpłat, adresów i logo');
  napisy.length = 0; const kw = F.podziekowanie({ firma: '', ulica: F.ULICA_PRZYKLAD, sposob: 'odcinek' }, 'kwadrat', {});
  assert.deepEqual([kw.width, kw.height], [1080, 1080]); assert.ok(napisy.includes('PRZYKŁAD') && napisy.includes('Twoja firma') && napisy.includes('opiekun odcinka drogi'));
  const s = F.scena(el('div'), { ulica: u, firma: 'Piekarnia na Rogu', sposob: 'sponsor', stawka_gr: 20, zrodlo: (x) => ({ 'assets/ulica/droga.webp': 'blob:droga' })[x] });
  assert.equal(zKlasa(s, 'fs-dom').length, 2, 'domek i wieżowiec'); assert.deepEqual(zKlasa(s, 'fs-szyld').map((x) => x.textContent), ['Piekarnia na Rogu']); assert.deepEqual(zKlasa(s, 'fs-tablica').map((x) => x.textContent), ['Piekarnia na Rogu']);
  assert.match(zKlasa(s, 'fs-tabliczka')[0].children[0].textContent, /^Odcinek 20 · Piekarnia na Rogu/); assert.equal(zKlasa(s, 'fs-cegla').length, 8);
  assert.ok(zKlasa(s, 'fs-chip').some((c) => c.children[0] && c.children[0].textContent === '1 900 km')); assert.equal(zKlasa(s, 'fs-chip--sponsor')[0].textContent, 'każdy km dokłada 20 gr · Piekarnia na Rogu');
  assert.equal(zKlasa(s, 'fs-chip--przyklad').length, 0, 'prawdziwa ulica bez PRZYKŁAD'); assert.equal(zKlasa(s, 'fs-droga')[0].style.backgroundImage, 'url("blob:droga")');
  const sp = F.scena(el('div'), { ulica: F.ULICA_PRZYKLAD }); assert.equal(zKlasa(sp, 'fs-chip--przyklad').length, 1);
  assert.doesNotMatch(MJS, /logo_url|akcja-firmy-logo|\.(png|jpg)"/, 'bez logo firm');
});

test('(5) druk: A4 pion, oferta i deklaracja osobno, miejsce na datę i kontakt, podpisy, WZÓR; przyciski wołają window.print', () => {
  assert.match(HTML, /@page \{ size: A4 portrait; margin: 14mm 16mm; \}/); assert.match(HTML, /body\.druk-oferta #fm-druk-oferta, body\.druk-deklaracja #fm-druk-deklaracja \{ display: block; \}/);
  assert.match(HTML, /main \{ display: none !important; \}/, 'w druku tylko wybrany dokument'); assert.match(HTML, /<div class="d-wzor">WZÓR, do przejrzenia przez prawnika<\/div>/);
  assert.match(HTML, /Data: <span class="d-pole"><\/span>/); assert.match(HTML, /Kontakt BiegaMy: <span class="d-pole">/); assert.match(HTML, /<div>podpis za firmę, data<\/div><div>podpis za organizację prowadzącą zbiórkę, data<\/div>/);
  assert.match(HTML, /function drukuj\(klasa\) \{ rysujDruk\(\); document\.body\.classList\.remove\('druk-oferta', 'druk-deklaracja'\); document\.body\.classList\.add\(klasa\); setTimeout\(function \(\) \{ window\.print\(\); \}, 60\); \}/);
  assert.match(HTML, /id="fm-drukuj-oferte"/); assert.match(HTML, /id="fm-drukuj-deklaracje"/);
});

test('(6) wejście tylko z miasto.html („Dla firm ›”); nic innego w aplikacji nie linkuje; sw.js, dla-fabianka.html i akcja.mjs nietknięte', () => {
  assert.match(MIASTO, /<a class="md-zaloz" href="miasto-firmy\.html"[^>]*>Dla firm ›<\/a>/);
  const linkuja = [];
  (function szukaj(kat) {
    for (const w of fs.readdirSync(kat, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'vendor', 'assets', 'tests', 'tools', 'docs', 'supabase'].includes(w.name)) continue;
      const p = path.join(kat, w.name);
      if (w.isDirectory()) szukaj(p);
      else if (/\.(html|m?js|json|webmanifest)$/.test(w.name) && !/^miasto-firmy\.(html|mjs)$/.test(w.name) && /miasto-firmy\.html/.test(fs.readFileSync(p, 'utf8'))) linkuja.push(path.relative(KORZEN, p).replace(/\\/g, '/'));
    }
  })(KORZEN);
  assert.deepEqual(linkuja.sort(), ['js/miasto-pokaz.mjs', 'miasto.html']);   // 11.11: + scenariusz pokazu
  assert.doesNotMatch(czytaj('sw.js'), /miasto|firmy-miasto/i); assert.doesNotMatch(czytaj('dla-fabianka.html'), /miasto/); assert.doesNotMatch(czytaj('js/akcja.mjs'), /miasto/);
  assert.match(HTML, /<a class="fm-wroc" href="miasto\.html">‹ Miasto Dobra<\/a>/);
  for (const u of [...new Set((HTML + MJS).match(/assets\/[a-z]+\/[a-z0-9-]+\.(webp|svg)/g) || [])]) assert.ok(fs.existsSync(path.join(KORZEN, u)), u + ' istnieje');
});
