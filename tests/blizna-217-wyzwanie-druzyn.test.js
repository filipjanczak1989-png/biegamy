/* BLIZNA 217 / WYZWANIE FIRM I SZKÓŁ: POKAZ DRUŻYN (11.11.2026, na spotkanie 18.11). miasto-druzyny.html + js/miasto-druzyny.mjs. (Numer 215 z polecenia był już zajęty
   przez nocny test „pierwszy kilometr”, 216 przez kartę „Mój wkład”.) Pilnuje zasad Miasta Dobra jak blizna-213 i tego, że strona drużyn niczego nie wysyła:
   (1) dane wymyślone, PRZYKŁAD przy nazwie i każdej liczbie; liczby ulicy te same co karta „Ulica Szkolna” na mapie (14 drużyn, 260 osób, 3 210 km, cel 8 000);
       klasy bez nazw szkół i bez danych dzieci (tylko nazwa, liczba osób, suma km); firmy wymyślone; ranking tylko drużyn, dwa widoki, inny zwycięzca w każdym;
   (2) bez danych osób, nazwisk, e-maili, UUID, logo, nazw serwisów i organizacji, bez „partner”, diagnoz, upamiętnień, bez „wpisowe” / „opłata startowa”;
   (3) nic nie idzie do sieci poza własnymi assets/: bez Supabase, fetch tylko w jednym miejscu (grafiki), jedyny zapis = localStorage stanu pokazu;
   (4) założenie drużyny: nazwa oczyszczona, kod 6 znaków bez 0/O/1/I, link do tej strony; dopisywanie km bez mutacji; dopłata firmy = km × stawka (tylko informacja);
   (5) plakat drużyny, dyplom drużyny (telefon i A4 pion) i plakat wyzwania na canvasie: właściwe napisy, PRZYKŁAD, pole „tu znak organizacji” puste, konfetti i tekstWSzer z modułu biegu;
   (6) scena: szkoła, plac zabaw, droga z % celu, domki drużyn z szyldami (własna złota); bez ruchu przy reduced-motion;
   (7) wejście tylko z karty „Ulica Szkolna” na miasto.html („Zobacz wyzwanie ›”); sw.js, dla-fabianka.html i akcja.mjs nietknięte. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const HTML = czytaj('miasto-druzyny.html'), MJS = czytaj('js/miasto-druzyny.mjs'), BIEG_MJS = czytaj('js/miasto-bieg.mjs'), MIASTO = czytaj('miasto.html'), MIASTO_MJS = czytaj('js/miasto.mjs');

function modul(opcje) {
  const o = opcje || {}, pamiec = new Map(), napisy = [], obrazy = [];
  const el = (tag) => { const e = { tagName: tag.toUpperCase(), className: '', style: {}, children: [], attrs: {}, textContent: '', id: '', alt: '', src: '', hidden: false, scrollLeft: 0,
    appendChild(x) { this.children.push(x); x.parentNode = this; return x; }, removeChild(x) { this.children = this.children.filter((c) => c !== x); },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; }, get firstChild() { return this.children[0] || null; } };
    e.style.setProperty = (k, v) => { e.style[k] = v; };
    if (tag === 'canvas') e.getContext = () => ctx2d();
    return e; };
  const ctx2d = () => new Proxy({ fillText: (t) => napisy.push(String(t)), drawImage: (im) => obrazy.push(im), measureText: (t) => ({ width: String(t).length * 10 }), createLinearGradient: () => ({ addColorStop() {} }) }, { get: (c, k) => (k in c ? c[k] : () => {}), set: () => true });
  const dokument = { createElement: el, createTextNode: (t) => ({ nodeType: 3, textContent: String(t), children: [] }), head: el('head'), body: el('body'), getElementById: () => null };
  const ctx = { console, Promise, JSON, Math, Number, String, Object, Array, Date, RegExp, isFinite, Infinity, parseInt, TextEncoder, Uint8Array, Proxy, document: dokument,
    localStorage: o.bezPamieci ? null : { getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null), setItem: (k, v) => pamiec.set(k, String(v)), removeItem: (k) => pamiec.delete(k) },
    matchMedia: () => ({ matches: !!o.bezRuchu }) };
  ctx.globalThis = ctx; ctx.window = ctx;
  if (!o.bezBiegu) vm.runInNewContext(BIEG_MJS, ctx);
  vm.runInNewContext(MJS, ctx);
  return { D: ctx.BM_DRUZYNY, B: ctx.BM_BIEG, ctx, pamiec, napisy, obrazy, el };
}
const wszystkie = (e, acc = []) => { acc.push(e); (e.children || []).forEach((c) => wszystkie(c, acc)); return acc; };
const zKlasa = (e, k) => wszystkie(e).filter((x) => String(x.className).split(/\s+/).includes(k));

test('(1) dane wymyślone: liczby jak karta miasta, klasy bez szkół i dzieci, ranking tylko drużyn w dwóch widokach z innym zwycięzcą', () => {
  const { D } = modul();
  const M = (() => { const c = { console, Promise, JSON, Math, Number, String, Object, Array, Date, RegExp, isFinite }; c.globalThis = c; vm.runInNewContext(MIASTO_MJS, c); return c.BM_MIASTO; })();
  const p = M.PRZYKLADY.find((x) => x.id === 'szkolna');
  assert.equal(D.WYZWANIE.przyklad, true);
  assert.deepEqual([D.WYZWANIE.druzyny_n, D.WYZWANIE.osoby_n, D.WYZWANIE.suma_km, D.WYZWANIE.cel_km, D.WYZWANIE.cegly_n, D.WYZWANIE.firmy_n], [p.druzyny_n, p.osoby_n, p.suma_km, p.cel_km, p.cegly_n, p.firmy_n], 'te same liczby co karta przykładu na mapie miasta');
  assert.equal(D.DRUZYNY.length, 14); assert.equal(D.DRUZYNY.reduce((s, d) => s + d.osoby_n, 0), 260); assert.equal(D.DRUZYNY.reduce((s, d) => s + d.km, 0), 3210);
  assert.ok(D.DRUZYNY.filter((d) => d.rodzaj === 'klasa').every((d) => /^Klasa \d[a-c]$/.test(d.nazwa) && d.stawka_gr == null), 'klasy: tylko „Klasa Nx”, bez nazwy szkoły, bez stawki');
  assert.ok(D.DRUZYNY.every((d) => !('uczniowie' in d) && !('osoby' in d) && !('imiona' in d)), 'żadnych list osób w drużynach');
  const razem = D.ranking('razem'), osoba = D.ranking('osoba');
  assert.deepEqual([...razem.map((d) => d.miejsce)], Array.from({ length: 14 }, (_, i) => i + 1));
  assert.ok(razem.every((d, i) => !i || d.km <= razem[i - 1].km), 'razem malejąco'); assert.ok(osoba.every((d, i) => !i || d.wartosc <= osoba[i - 1].wartosc), 'na osobę malejąco');
  assert.notEqual(razem[0].id, osoba[0].id, 'inny zwycięzca w każdym widoku: mała drużyna może wygrać na osobę');
  assert.ok(osoba[0].osoby_n < razem[0].osoby_n, 'zwycięzca na osobę jest mniejszy');
  assert.match(D.wierszRankingu(razem[0], 'razem'), /<span class="dr-nr">1<\/span><span class="dr-nazwa">Klasa 4b<small>Klasa · 26 osób<\/small><\/span><span class="dr-wart">410 km<small>15,8 km\/os\.<\/small>/);
  assert.match(D.wierszRankingu(osoba[0], 'osoba'), /km\/os\.<small>\d+ km razem<\/small>/);
  assert.match(HTML, /function liczbaHtml\(duze, male\) \{ return '<div class="dr-liczba"><b>' \+ D\.esc\(duze\) \+ '<\/b><span>' \+ D\.esc\(male\) \+ '<\/span><i class="dr-przyklad">przykład<\/i><\/div>'; \}/, 'każda liczba ze znaczkiem przykład');
  assert.ok((HTML.match(/dr-chip--przyklad"[^>]*>PRZYKŁAD</g) || []).length >= 4, 'PRZYKŁAD w nagłówku, przy drużynie, rankingu i w widoku organizacji'); assert.match(HTML, /Dane wymyślone na potrzeby pokazu\. Nie wchodzą do licznika miasta\./);
  assert.doesNotMatch(HTML, /ranking (osób|uczniów|dzieci)(?! nie ma)/i, 'bez rankingu osób'); assert.match(HTML, /Rankingu osób nie ma/);
});

test('(2) bez danych osób, nazw organizacji i serwisów, logo, „partner”, diagnoz, upamiętnień, „wpisowe”; „organizacja prowadząca zbiórkę” w tekstach', () => {
  for (const [n, t] of [['miasto-druzyny.html', HTML], ['js/miasto-druzyny.mjs', MJS]]) {
    assert.doesNotMatch(t, /fabian/i, n + ': bez imienia bohatera'); assert.doesNotMatch(t, /Kasia|Filip/, n + ': bez imion organizatorów');
    assert.doesNotMatch(t, /[\w.+-]+@[\w-]+\.[\w.]+/, n + ': bez e-maili'); assert.doesNotMatch(t, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, n + ': bez UUID');
    assert.doesNotMatch(t, /siepomaga|zrzutka|pomagam\.pl|fundacj[aeiy] [A-ZŁŚŻ]|stowarzyszeni[ae] [A-ZŁŚŻ]|szkoł[aąy] (podstawow|nr|im\.)/i, n + ': bez nazw serwisów, organizacji i szkół');
    assert.doesNotMatch(t, /partner|współprac|we współpracy|patronat/i, n + ': żadnej sugestii partnerstwa');
    assert.doesNotMatch(t, /logo_url|akcja-firmy-logo|logo\.(png|jpg|webp|svg)|(?<!favicon-32)\.(png|jpg)"/, n + ': bez logo'); assert.doesNotMatch(t, /chor(ob|y|uje)|diagnoz|nowotw|szpital|leczeni|rehabilitac|niepełnospraw/i, n + ': bez diagnoz');
    assert.doesNotMatch(t, /zmar[łl]|śmier|pogrzeb|odszed|odeszł|pamięci|pomnik|wieniec|pamiątk|upamiętni/i, n + ': nic, co wygląda jak upamiętnienie');
    assert.doesNotMatch(t, /wpisow|opłat[aąy] startow|opłata za udział/i, n + ': udział bezpłatny');
    assert.doesNotMatch(t, /\b[A-ZŁŚŻ][a-ząęółśżźćń]+ [A-ZŁŚŻ][a-ząęółśżźćń]+(ski|cka|wicz|czyk|ak)\b/, n + ': bez imion i nazwisk');
    assert.doesNotMatch(t, /imi[eę] (ucznia|dziecka)|nazwisk[oa] (ucznia|dziecka)|PESEL|data urodzenia/i, n + ': żadnych danych dzieci');
  }
  assert.ok((HTML.match(/organizacj[aąęi] prowadząc/g) || []).length >= 6, '„organizacja prowadząca zbiórkę” w tekstach');
  assert.ok((HTML.match(/BiegaMy nic nie przyjmuje/g) || []).length >= 2);
});

test('(3) nic do sieci poza własnymi assets/: bez Supabase, fetch tylko w zasob(), jedyny zapis = localStorage stanu pokazu', () => {
  assert.doesNotMatch(HTML + MJS, /supabase|sb\.js|\.rpc\(|functions\/v1|sendBeacon|XMLHttpRequest|WebSocket/i);
  assert.equal((HTML.match(/fetch\(/g) || []).length, 1, 'fetch w jednym miejscu (grafiki)'); assert.doesNotMatch(MJS, /fetch\(/);
  assert.match(HTML, /if \(!url \|\| !\/\^assets\\\/\/\.test\(url\) \|\| !window\.fetch\) return Promise\.resolve\(url\);/, 'zasob tylko dla assets/');
  assert.match(HTML, /caches\.open\('bm-miasto-grafiki-v1'\)/, 'ten sam cache co miasto i bieg');
  assert.doesNotMatch(HTML, /<form\b/); assert.doesNotMatch(HTML, /<img[^>]+src="https?:/, 'bez obcych obrazków');
  assert.deepEqual([...new Set(((HTML + MJS).match(/localStorage\.(set|get|remove)Item\(([^,)]+)/g) || []).map((s) => s.replace(/localStorage\.(set|get|remove)Item\(/, '')))], ['KLUCZ_PAMIECI'], 'jeden klucz');
  assert.equal(modul().D.KLUCZ_PAMIECI, 'bm_druzyny_pokaz');
  const h = HTML.replace(/https:\/\/fonts\.(googleapis|gstatic)\.com[^"]*/g, '');
  assert.doesNotMatch(h, /https?:\/\//, 'poza fontami Google żadnych adresów');
});

test('(4) założenie drużyny: nazwa oczyszczona, kod 6 znaków, link do strony; dopisywanie km bez mutacji; karta: miejsca, do następnej; dopłata firmy; stan w pamięci', () => {
  const { D, pamiec } = modul();
  const k = D.zalozDruzyne(' <b>Klasa 5a</b> ', 'klasa', '24', 20);
  assert.equal(k.nazwa, 'Klasa 5a'); assert.equal(k.rodzaj, 'klasa'); assert.equal(k.osoby_n, 24); assert.equal(k.km, 0); assert.equal(k.stawka_gr, undefined, 'klasa bez stawki');
  assert.match(k.kod, /^[A-HJ-NP-Z2-9]{6}$/, 'kod bez 0/O/1/I'); assert.equal(k.link, 'miasto-druzyny.html#d=' + k.kod); assert.equal(D.kod('Klasa 5a', 'klasa'), k.kod, 'kod deterministyczny');
  assert.equal(D.zalozDruzyne('ktoś@przyklad.pl', 'firma', 0, 999).nazwa, 'Moja drużyna', 'e-mail w nazwie odrzucony'); assert.equal(D.zalozDruzyne('x', 'firma', 0, 999).stawka_gr, 500, 'stawka z pułapem');
  assert.equal(D.zalozDruzyne('x', 'firma', 0).osoby_n, 10, 'firma bez liczby: 10'); assert.equal(D.zalozDruzyne('x', 'klasa', 0).osoby_n, 20, 'klasa bez liczby: 20');
  const f = D.zalozDruzyne('Piekarnia Testowa', 'firma', 12, 20), f2 = D.dopiszKm(f, '42,5'.replace(',', '.'), 'trening'), f3 = D.dopiszKm(f2, 400);
  assert.equal(f.km, 0, 'bez mutacji'); assert.equal(f2.km, 42.5); assert.equal(f3.km, 442.5); assert.equal(f3.wpisy.length, 2); assert.equal(D.dopiszKm(f3, -5), f3); assert.equal(D.dopiszKm(f3, 'abc'), f3);
  assert.equal(D.doplataFirmy(f3), Math.round(442.5 * 20)); assert.equal(D.zl(D.doplataFirmy(f3)), '88,5 zł'); assert.equal(D.doplataFirmy(k), 0);
  const karta = D.kartaDruzyny(f3);
  assert.equal(karta.druzyn_n, 15); assert.ok(karta.miejsce_razem >= 1 && karta.miejsce_razem <= 15); assert.ok(karta.miejsce_osoba >= 1);
});

test('(4b) 442,5 km to pierwsze miejsce razem; 150 km to miejsce za Hurtownią; ranking z własną drużyną ma 15 wierszy i „Twoja drużyna (pokaz)”', () => {
  const { D } = modul();
  const f = D.dopiszKm(D.zalozDruzyne('Piekarnia Testowa', 'firma', 12, 20), 442.5), kf = D.kartaDruzyny(f);
  assert.equal(kf.miejsce_razem, 1); assert.equal(kf.nastepna, null); assert.equal(kf.przewaga_km, 32.5);
  const m = D.dopiszKm(D.zalozDruzyne('Klasa 5a', 'klasa', 24), 149), km = D.kartaDruzyny(m);
  assert.equal(km.nastepna, 'Hurtownia Północ'); assert.equal(km.do_nastepnej_km, 1); assert.equal(km.pct_do_nastepnej, 99);
  const r = D.ranking('razem', m); assert.equal(r.length, 15); assert.ok(r.find((d) => d.moja));
  assert.match(D.wierszRankingu(r.find((d) => d.moja), 'razem'), /dr-wiersz--ty[\s\S]*Klasa 5a <i>Twoja drużyna \(pokaz\)<\/i>/);
  assert.equal(D.ranking('razem', D.zalozDruzyne('x', 'klasa', 5)).length, 14, 'drużyna bez km nie wchodzi do rankingu');
  const { D: D2, pamiec } = modul();
  D2.zapisz({ druzyna: m, klikniecia: 2 }); assert.deepEqual(D2.odczytaj().druzyna.nazwa, 'Klasa 5a'); assert.ok(!/@|nazwisko/.test(pamiec.get('bm_druzyny_pokaz'))); D2.wyczysc(); assert.equal(D2.odczytaj(), null);
  assert.equal(modul({ bezPamieci: true }).D.odczytaj(), null, 'bez localStorage: strona działa bez stanu');
});

test('(5) plakat drużyny, dyplom drużyny (telefon, A4 pion) i plakat wyzwania: napisy, PRZYKŁAD, pole znaku puste, konfetti i tekstWSzer z modułu biegu', () => {
  const { D, napisy } = modul();
  const f = D.dopiszKm(D.zalozDruzyne('Klasa 5a', 'klasa', 24), 149);
  const pl = D.plakatDruzyny(f, 'https://biegamy.run/miasto-druzyny.html#d=' + f.kod, {});
  assert.deepEqual([pl.width, pl.height], [1240, 1754]);
  assert.ok(napisy.includes('NASZA KLASA BUDUJE ULICĘ') && napisy.includes('Klasa 5a') && napisy.includes('DOŁĄCZ KILOMETRAMI') && napisy.includes(f.kod) && napisy.includes('PRZYKŁAD') && napisy.includes('tu znak organizacji'), napisy.join(' | ').slice(0, 400));
  assert.ok(napisy.includes('Bez kont i bez danych uczniów w aplikacji.'));
  napisy.length = 0;
  const fi = D.dopiszKm(D.zalozDruzyne('Biuro Testowe', 'firma', 10, 20), 80);
  D.plakatDruzyny(fi, 'x', {}); assert.ok(napisy.includes('NASZA FIRMA BUDUJE ULICĘ') && napisy.includes('DOŁĄCZ DO DRUŻYNY') && napisy.some((t) => /Firma dokłada 20 gr za każdy kilometr/.test(t)));
  napisy.length = 0;
  const w = Object.assign({ data: Date.UTC(2026, 10, 30) }, D.kartaDruzyny(f));
  const d1 = D.dyplomDruzyny(f, w, 'telefon', {}), d2 = D.dyplomDruzyny(f, w, 'a4', {});
  assert.deepEqual([d1.width, d1.height, d2.width, d2.height], [1080, 1350, 1240, 1754]);
  assert.ok(napisy.includes('DYPLOM') && napisy.includes('dla drużyny') && napisy.includes('Klasa 5a') && napisy.includes('149 km') && napisy.includes('6,2') && napisy.includes(w.miejsce_razem + '. / 15') && napisy.includes('KILOMETRY BUDUJĄ ULICĘ') && napisy.includes('tu znak organizacji'));
  assert.ok(!napisy.some((t) => /zł|@/.test(t)), 'dyplom bez kwot');
  napisy.length = 0;
  const pw = D.plakatWyzwania('https://biegamy.run/miasto-druzyny.html', {});
  assert.deepEqual([pw.width, pw.height], [1240, 1754]); assert.ok(napisy.includes('ULICA SZKOLNA') && napisy.includes('ZAŁÓŻ DRUŻYNĘ') && napisy.some((t) => /1\. Załóż drużynę/.test(t)) && napisy.includes('PRZYKŁAD'));
  assert.match(MJS, /b\.konfettiPunkty\(w, h, ile, los, wyk\)/, 'konfetti z wykluczeniami z modułu biegu'); assert.match(MJS, /b\.tekstWSzer\(c, t, x, y, maks, font, rozmiar, waga\)/); assert.match(MJS, /b\.qrNaCanvas\(/);
  assert.equal((MJS.match(/konfetti\(c, W, (H|420), \d+, los, (\[|WYK)/g) || []).length, 3, 'konfetti z wykluczeniami na plakacie drużyny, dyplomie i plakacie wyzwania');
  assert.equal((MJS.match(/znaczekPrzyklad\(c, W - 1\d0,/g) || []).length, 3, 'PRZYKŁAD na trzech grafikach');
  const bez = modul({ bezBiegu: true }); assert.doesNotThrow(() => bez.D.dyplomDruzyny(f, w, 'telefon', {}), 'bez modułu biegu: rysuje bez konfetti i QR, nie pada');
  assert.match(HTML, /<script src="js\/miasto-bieg\.mjs"><\/script>\s*<script src="js\/miasto-druzyny\.mjs"><\/script>/, 'moduł biegu przed modułem drużyn');
  assert.match(HTML, /B\.qrSvg\(adres\)/, 'kod QR drużyny z kodera biegu');
  assert.match(HTML, /@page \{ size: A4 portrait; margin: 0; \}/); assert.match(HTML, /body\.druk-obraz \.dr-druk--obraz \{ display: block; width: 210mm; height: 297mm; \}/);
});

test('(6) scena: szkoła, plac zabaw, droga z % celu, domki drużyn z szyldami (klasy niebieskie, własna złota), PRZYKŁAD; bez ruchu przy reduced-motion; grafiki przez zrodlo', () => {
  const { D, el } = modul();
  const kont = el('div'), zr = (u) => 'blob:' + u, s = D.scena(kont, { wysokosc: 250, zrodlo: zr });
  assert.ok(s.className.includes('ds--ruch'));
  const imgs = wszystkie(s).filter((x) => x.tagName === 'IMG'), pliki = imgs.map((i) => i.getAttribute('data-plik'));
  assert.ok(pliki.includes('assets/miasto/szkola.webp') && pliki.includes('assets/ulica/plac-zabaw.webp') && pliki.filter((p) => /domek-\d/.test(p)).length === 8, pliki.join(','));
  assert.ok(imgs.every((i) => i.src.startsWith('blob:assets/')), 'wszystkie grafiki przez zrodlo');
  const szyldy = zKlasa(s, 'ds-szyld'); assert.equal(szyldy.length, 8); assert.deepEqual(szyldy.map((x) => x.textContent), [...D.ranking('razem').slice(0, 8).map((d) => d.nazwa)], 'szyldy = pierwsze 8 drużyn rankingu razem');
  assert.ok(szyldy.filter((x) => x.className.includes('ds-szyld--klasa')).length >= 5, 'klasy z niebieskim szyldem');
  const droga = zKlasa(s, 'ds-droga').find((x) => !x.className.includes('szutr')); assert.equal(droga.style.width, Math.round(1600 * D.procent(3210, 8000) / 100) + 'px');
  assert.ok(zKlasa(s, 'ds-droga--szutr').length === 1, 'reszta drogi szutrem');
  assert.deepEqual(zKlasa(s, 'ds-chip').filter((x) => !x.className.includes('przyklad')).map((x) => x.children[0].textContent), ['14', '3 210 km', '40,1 %']);
  assert.equal(zKlasa(s, 'ds-chip--przyklad')[0].textContent, 'PRZYKŁAD');
  const moja = D.dopiszKm(D.zalozDruzyne('Klasa 5a', 'klasa', 24), 149), s2 = D.scena(el('div'), { wlasna: moja, zrodlo: zr });
  const zl = zKlasa(s2, 'ds-szyld--moja'); assert.equal(zl.length, 1); assert.equal(zl[0].textContent, 'Klasa 5a', 'własna drużyna zawsze na scenie, złoty szyld');
  assert.deepEqual(zKlasa(s2, 'ds-chip').filter((x) => !x.className.includes('przyklad')).map((x) => x.children[0].textContent), ['15', '3 359 km', '41,9 %']);
  const s3 = modul({ bezRuchu: true }).D.scena(el('div'), {}); assert.ok(!s3.className.includes('ds--ruch'), 'reduced-motion: bez animacji');
  assert.match(MJS, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
});

test('(7) wejście tylko z karty „Ulica Szkolna” na miasto.html; strona wraca do miasta; sw.js, dla-fabianka.html, akcja.mjs nietknięte; grafiki istnieją', () => {
  assert.match(MIASTO_MJS, /id: "szkolna"[^\n]*strona: "miasto-druzyny\.html", przycisk: "Zobacz wyzwanie ›"/);
  assert.match(MIASTO_MJS, /esc\(u\.przycisk \|\| "Zobacz bieg ›"\)/);
  assert.doesNotMatch(MIASTO, /miasto-druzyny/, 'miasto.html nie linkuje wprost: wejście przez kartę z js/miasto.mjs');
  assert.match(HTML, /<a class="dr-wroc" href="miasto\.html">‹ Miasto Dobra<\/a>/);
  assert.match(HTML, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(czytaj('sw.js'), /druzyny/); assert.doesNotMatch(czytaj('dla-fabianka.html'), /druzyny/); assert.doesNotMatch(czytaj('js/akcja.mjs'), /druzyny/);
  const uzyte = [...new Set((HTML + MJS).match(/assets\/[a-z-]+\/[a-z0-9-]+\.(webp|svg)/g))];
  assert.ok(uzyte.length >= 15); for (const u of uzyte) assert.ok(fs.existsSync(path.join(KORZEN, u)), u);
  assert.ok(!uzyte.some((u) => /assets\/miasto\/(?!szkola\.webp)/.test(u)), 'z assets/miasto tylko szkoła (bez nowych plików w katalogu pilnowanym przez blizna-206)');
  for (const z of ['Załóż drużynę: klasę albo firmę ›', 'Wesprzyj zbiórkę u organizacji ›', 'kilometry razem', 'kilometry na osobę', 'Zobacz widok organizacji ›', 'Zacznij pokaz od nowa', 'Kliknięcia, nie wpłaty.']) assert.ok(HTML.includes(z), z);
});
