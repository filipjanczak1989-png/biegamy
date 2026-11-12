/* BLIZNA 213 / BIEG WIRTUALNY, POKAZ OD A DO Z (10.11.2026, na spotkanie 18.11). miasto-bieg.html + js/miasto-bieg.mjs + assets/miasto/bieg-*.svg.
   Pilnuje zasad Miasta Dobra (jak blizna-206) i tego, że strona biegu niczego nie wysyła:
   (1) dane wymyślone oznaczone PRZYKŁAD przy nazwie i każdej liczbie; uczestnicy bez nazwisk, imiona tylko z puli; „Twój dystans” bez czasu; kolejność domyślna „według czasu”
       (najpierw z czasem rosnąco, potem ukończeni bez czasu, potem zapisani), własny wiersz przypięty u góry;
   (2) bez danych osób, nazwisk, e-maili, UUID, logo, nazw serwisów zbiórek i organizacji, bez „partner”, diagnoz, upamiętnień; bez słowa „wpisowe” i „opłata startowa”;
   (3) nic nie idzie do sieci poza własnymi plikami assets/: żadnego Supabase, fetch tylko w jednym miejscu (grafiki), bez formularza, jedyny zapis = localStorage stanu pokazu;
   (4) koder QR (bajty, poziom M, wersje 1–10): rozmiary, wzorce pozycjonujące, moduł stały; odczyt sprawdzony dekoderem jsQR 10.11 poza repo (wersje 1–10, polskie znaki);
   (5) numer startowy, dyplom (telefon i A4), plakat i grafika rysowane na canvasie z właściwymi napisami i znaczkiem PRZYKŁAD; pole „tu znak organizacji” puste, bez logo;
   (6) scena biegu: brama, kibice, droga rośnie z kilometrami, mur, domki firm, META i ZBUDOWANA po biegu; grafiki przez zrodlo (Cache API); bez ruchu przy reduced-motion;
   (7) wejście tylko z karty przykładu na miasto.html; kreator miasta ma pola biegu (B10) ukryte, dopóki forma to nie bieg; sw.js, dla-fabianka.html i akcja.mjs nietknięte. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const HTML = czytaj('miasto-bieg.html'), MJS = czytaj('js/miasto-bieg.mjs'), MIASTO = czytaj('miasto.html'), MIASTO_MJS = czytaj('js/miasto.mjs');

/** Moduł w piaskownicie: udawany DOM (elementy z klasami, stylami, dziećmi), canvas nagrywający fillText, localStorage w Map, matchMedia z opcji. */
function modul(opcje) {
  const o = opcje || {}, pamiec = new Map(), napisy = [], obrazy = [];
  const el = (tag) => { const e = { tagName: tag.toUpperCase(), className: '', style: {}, children: [], attrs: {}, textContent: '', id: '', alt: '', src: '', hidden: false, scrollLeft: 0,
    appendChild(x) { this.children.push(x); x.parentNode = this; return x; }, removeChild(x) { this.children = this.children.filter((c) => c !== x); }, insertBefore(x) { this.children.unshift(x); return x; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; }, get firstChild() { return this.children[0] || null; } };
    e.style.setProperty = (k, v) => { e.style[k] = v; }; Object.defineProperty(e, 'classList', { get() { return { contains: (k) => e.className.split(/\s+/).includes(k) }; } });
    if (tag === 'canvas') e.getContext = () => ctx2d();
    return e; };
  const ctx2d = () => new Proxy({ fillText: (t) => napisy.push(String(t)), drawImage: (im) => obrazy.push(im), measureText: (t) => ({ width: String(t).length * 10 }), createLinearGradient: () => ({ addColorStop() {} }) }, { get: (c, k) => (k in c ? c[k] : () => {}), set: () => true });
  const dokument = { createElement: el, createTextNode: (t) => ({ nodeType: 3, textContent: String(t), children: [] }), head: el('head'), body: el('body'), getElementById: () => null };
  const ctx = { console, Promise, JSON, Math, Number, String, Object, Array, Date, RegExp, isFinite, Infinity, parseInt, TextEncoder, Uint8Array, Proxy, document: dokument,
    localStorage: o.bezPamieci ? null : { getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null), setItem: (k, v) => { if (o.pamiecPada) throw new Error('brak zgody'); pamiec.set(k, String(v)); }, removeItem: (k) => pamiec.delete(k) },
    matchMedia: () => ({ matches: !!o.bezRuchu }) };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.runInNewContext(MJS, ctx);
  return { B: ctx.BM_BIEG, ctx, pamiec, napisy, obrazy, el };
}
const wszystkie = (e, acc = []) => { acc.push(e); (e.children || []).forEach((c) => wszystkie(c, acc)); return acc; };
const zKlasa = (e, k) => wszystkie(e).filter((x) => String(x.className).split(/\s+/).includes(k));

test('(1) dane wymyślone: PRZYKŁAD przy każdej liczbie, imiona z puli bez nazwisk, „Twój dystans” bez czasu, kolejność według czasu i alfabetycznie, własny wiersz u góry', () => {
  const { B } = modul();
  assert.equal(B.BIEG.przyklad, true); assert.deepEqual([B.BIEG.osoby_n, B.BIEG.suma_km, B.BIEG.cegly_n, B.BIEG.firmy_n, B.BIEG.cel_km], [312, 1840, 180, 3, 5000], 'te same liczby co karta przykładu na mapie miasta');
  const M = (() => { const c = { console, Promise, JSON, Math, Number, String, Object, Array, Date, RegExp, isFinite }; c.globalThis = c; vm.runInNewContext(MIASTO_MJS, c); return c.BM_MIASTO; })();
  const p = M.PRZYKLADY.find((x) => x.id === 'bieg'); assert.deepEqual([p.osoby_n, p.suma_km, p.cegly_n, p.firmy_n, p.cel_km], [312, 1840, 180, 3, 5000]);
  const u = B.uczestnicy();
  assert.equal(u.length, 312); assert.deepEqual([...u.map((x) => x.nr)], Array.from({ length: 312 }, (_, i) => i + 1), 'numery 1–312');
  assert.ok(u.every((x) => B.IMIONA.includes(x.imie)), 'imiona tylko z puli'); assert.ok(B.IMIONA.every((i) => /^[A-ZŁŚŻ][a-ząęółśżźćń]+$/.test(i)), 'pula: pojedyncze imiona, bez nazwisk');
  assert.doesNotMatch(B.IMIONA.join(' '), /Fabian|Filip|Kasia|Katarzyna/, 'pula bez bohatera akcji i organizatorów');
  assert.ok(u.filter((x) => x.dystans === 'twoj').every((x) => x.czas_s === null), '„Twój dystans” nigdy nie ma czasu');
  assert.ok(u.filter((x) => x.dystans === '5' && x.czas_s).every((x) => x.czas_s >= 1200 && x.czas_s <= 2700)); assert.ok(u.filter((x) => x.dystans === '10' && x.czas_s).every((x) => x.czas_s >= 2400 && x.czas_s <= 5700));
  assert.ok(u.some((x) => x.dystans === '5') && u.some((x) => x.dystans === '10') && u.some((x) => x.dystans === 'twoj') && u.some((x) => !x.ukonczyl), 'wszystkie dystanse i część jeszcze bez wyniku');
  assert.deepEqual(B.uczestnicy(), u, 'ten sam zestaw przy każdym odczycie');
  const czas = B.listaWynikow('wszyscy', 'czas');
  const zCzasem = czas.filter((x) => x.czas_s), i1 = czas.findIndex((x) => !x.czas_s && x.ukonczyl), i2 = czas.findIndex((x) => !x.ukonczyl);
  assert.ok(zCzasem.every((x, i) => !i || x.czas_s >= zCzasem[i - 1].czas_s), 'z czasem rosnąco'); assert.ok(czas.slice(0, zCzasem.length).every((x) => x.czas_s), 'najpierw wszyscy z czasem'); assert.ok(i1 < i2, 'ukończeni bez czasu przed zapisanymi');
  const alfa = B.listaWynikow('5', 'imie'); assert.ok(alfa.length > 50 && alfa.every((x) => x.dystans === '5') && alfa.every((x, i) => !i || x.imie.localeCompare(alfa[i - 1].imie, 'pl') >= 0), '5 km alfabetycznie');
  const wlasny = { nr: 313, imie: 'Ola', dystans: '10', czas_s: 3482, ukonczyl: true, pokaz: true };
  assert.equal(B.listaWynikow('wszyscy', 'czas', wlasny)[0], wlasny, 'własny wiersz przypięty u góry'); assert.equal(B.listaWynikow('10', 'imie', wlasny)[0], wlasny); assert.ok(!B.listaWynikow('5', 'czas', wlasny).includes(wlasny), 'własny wiersz znika przy obcym filtrze');
  assert.match(B.wierszWyniku(wlasny), /bw-wiersz--ty[\s\S]*<span class="bw-nr">313<\/span><span class="bw-imie">Ola <i>Twój wynik \(pokaz\)<\/i><\/span><span class="bw-dyst">10 km<\/span><span class="bw-czas">58:02<small>5:48 \/km<\/small>/);
  assert.match(B.wierszWyniku({ nr: 5, imie: 'Ula', dystans: 'twoj', czas_s: null, ukonczyl: true }), /ukończył\(a\)/); assert.match(B.wierszWyniku({ nr: 6, imie: 'Ala', dystans: '5', czas_s: null, ukonczyl: false }), /zapisany\(a\)/);
  assert.match(HTML, /function liczbaHtml\(duze, male\) \{ return '<div class="bw-liczba"><b>' \+ B\.esc\(duze\) \+ '<\/b><span>' \+ B\.esc\(male\) \+ '<\/span><i class="bw-przyklad">przykład<\/i><\/div>'; \}/, 'każda liczba ze znaczkiem przykład');
  assert.ok((HTML.match(/bw-chip--przyklad"[^>]*>PRZYKŁAD</g) || []).length >= 3, 'PRZYKŁAD w nagłówku, przy liście i w widoku organizacji'); assert.match(HTML, /Dane wymyślone na potrzeby pokazu\. Nie wchodzą do licznika miasta\./);
  assert.equal((MJS.match(/ znaczekPrzyklad\(c, (W|\d)/g) || []).length, 4, 'znaczek PRZYKŁAD na numerze, dyplomie, plakacie i grafice');
  assert.match(MJS, /el\("div", "bs-chip bs-chip--przyklad", hud, "PRZYKŁAD"\)/, 'PRZYKŁAD na scenie');
});

test('(2) bez danych osób, nazw organizacji i serwisów, logo, „partner”, diagnoz, upamiętnień; udział bezpłatny: bez „wpisowe” i „opłata startowa”', () => {
  for (const [n, t] of [['miasto-bieg.html', HTML], ['js/miasto-bieg.mjs', MJS]]) {
    assert.doesNotMatch(t, /fabian/i, n + ': bez imienia bohatera'); assert.doesNotMatch(t, /Kasia|Filip/, n + ': bez imion organizatorów');
    assert.doesNotMatch(t, /[\w.+-]+@[\w-]+\.[\w.]+/, n + ': bez e-maili'); assert.doesNotMatch(t, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, n + ': bez UUID');
    assert.doesNotMatch(t, /siepomaga|zrzutka|pomagam\.pl|fundacj[aeiy] [A-ZŁŚŻ]|stowarzyszeni[ae] [A-ZŁŚŻ]/, n + ': bez nazw serwisów zbiórek i organizacji');
    assert.doesNotMatch(t, /partner|współprac|we współpracy|patronat/i, n + ': żadnej sugestii partnerstwa');
    assert.doesNotMatch(t, /logo_url|akcja-firmy-logo|logo\.(png|jpg|webp|svg)|(?<!favicon-32)\.(png|jpg)"/, n + ': bez logo'); assert.doesNotMatch(t, /chor(ob|y|uje)|diagnoz|nowotw|szpital|leczeni|rehabilitac|niepełnospraw/i, n + ': bez diagnoz');
    assert.doesNotMatch(t, /zmar[łl]|śmier|pogrzeb|odszed|odeszł|pamięci|pomnik|wieniec|pamiątk|upamiętni/i, n + ': nic, co wygląda jak upamiętnienie');
    assert.doesNotMatch(t, /wpisow|opłat[aąy] startow|opłata za udział/i, n + ': udział bezpłatny, wpłata dobrowolna');
    assert.doesNotMatch(t, /\b[A-ZŁŚŻ][a-ząęółśżźćń]+ [A-ZŁŚŻ][a-ząęółśżźćń]+(ski|cka|wicz|czyk|ak)\b/, n + ': bez imion i nazwisk');
  }
  assert.ok((HTML.match(/organizacj[aąęi] prowadząc/g) || []).length >= 4, '„organizacja prowadząca zbiórkę” w tekstach');
  assert.match(HTML, /Pieniądze idą wyłącznie przez organizację prowadzącą zbiórkę\./, 'zdanie na górze widoku organizacji');
  assert.match(HTML, /Kliknięcia, nie wpłaty\./, 'kliknięcia w link policzone jawnie jako kliknięcia');
  assert.match(HTML, /Link wychodzi poza BiegaMy|poza BiegaMy/);
  assert.doesNotMatch(MIASTO_MJS, /wpisow/i, 'opis przykładu na mapie też bez „wpisowe”');
  const { B } = modul();
  assert.ok(B.FIRMY_PRZYKLADOWE.every((f) => !/sp\. z o\.o\.|S\.A\.|fundacj/i.test(f.nazwa)), 'firmy przykładowe wymyślone i neutralne');
  assert.deepEqual([...B.JAK.map((k) => k.tytul)], ['Zapisz się', 'Jeśli chcesz, wesprzyj zbiórkę', 'Pobiegnij albo przejdź swój dystans', 'Odbierz numer, dyplom i odznakę']);
  assert.match(B.JAK[0].opis, /bezpłatny/); assert.match(B.JAK[1].opis, /nie widzimy wpłat i niczego nie pobieramy/);
  const csv = B.csvZgod(); assert.equal(csv.split('\r\n').length, 26); assert.doesNotMatch(csv, /@/, 'eksport zgód bez adresów'); assert.match(csv, /ukryty w pokazie/);
  for (const f of fs.readdirSync(path.join(KORZEN, 'assets/miasto')).filter((x) => /^bieg-/.test(x))) {
    const s = fs.readFileSync(path.join(KORZEN, 'assets/miasto', f), 'utf8');
    assert.doesNotMatch(s, /<script|<image|href=|xlink:|url\((?!#)|@import|<foreignObject/i, f + ': SVG bez skryptów i zasobów z zewnątrz (url(#…) to własny gradient)'); assert.ok(s.length <= 60000, f + ' ≤ 60 kB');
    if (f !== 'bieg-brama.svg') assert.doesNotMatch(s, /<text/, f + ': bez liter (napis tylko na bramie START · META)'); else assert.match(s, />START · META</, 'brama: napis START · META');
  }
});

test('(3) strona nie wysyła niczego: bez Supabase i formularza, fetch tylko do własnych grafik, jedyny zapis to localStorage stanu pokazu, noindex, skrypt tylko własny', () => {
  for (const [n, t] of [['miasto-bieg.html', HTML], ['js/miasto-bieg.mjs', MJS]]) {
    assert.doesNotMatch(t, /supabase|\.rpc\(|\.from\(["']|\.insert\(|\.upsert\(|XMLHttpRequest|sendBeacon|\.storage\.|functions\.invoke|WebSocket|EventSource/i, n + ': żadnej drogi do bazy ani funkcji (Array.from w koderze QR to nie zapytanie)');
    assert.doesNotMatch(t, /<form|action=|method="post"|FormData/i, n + ': bez formularza wysyłającego');
    assert.doesNotMatch(t, /sessionStorage|indexedDB|document\.cookie/, n + ': bez innych zapisów');
  }
  assert.deepEqual([...HTML.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]), ['js/miasto-bieg.mjs', 'js/miasto-pokaz.mjs'], 'skrypty: własny moduł i tryb pokazu (11.11; bez sb.js, bez CDN)');
  assert.deepEqual([...new Set((HTML + MJS).match(/https?:\/\/[^\s"'<)]+/g))].sort(), ['http://www.w3.org/2000/svg', 'https://fonts.googleapis.com', 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap'].sort(), 'jedyne adresy zewnętrzne: fonty Google (bez nich fonty systemowe) i przestrzeń nazw SVG (nie jest pobierana)');
  const fetche = [...HTML.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(fetche, ['url'], 'jedyny fetch w stronie to własna grafika z assets/ (cache-first, Cache API)');
  assert.match(HTML, /if \(!url \|\| !\/\^assets\\\/\/\.test\(url\) \|\| !window\.fetch\) return Promise\.resolve\(url\);/, 'grafiki tylko z assets/');
  assert.equal((MJS.match(/fetch\(/g) || []).length, 0, 'moduł nie woła fetch');
  assert.equal((MJS.match(/localStorage\.setItem/g) || []).length, 1); assert.match(MJS, /setItem\(KLUCZ_PAMIECI, JSON\.stringify\(stan \|\| \{\}\)\)/);
  assert.equal((HTML.match(/localStorage\./g) || []).length, 0, 'strona zapisuje tylko przez moduł (B.zapisz)');
  assert.match(HTML, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(HTML, /<button type="button" class="bw-przycisk bw-przycisk--obrys" id="bw-wesprzyj">Wesprzyj zbiórkę u organizacji ›<\/button>/, '„Wesprzyj” w pokazie to przycisk z oknem, nie link donikąd');
  assert.match(HTML, /navigator\.canShare\(\{ files: \[plik\] \}\)/, 'udostępnianie przez Web Share'); assert.match(HTML, /pobierz\(blob, nazwa\); return 'pobrane';/, 'zapasowa droga: pobranie');
  assert.match(HTML, /if \(B\.bezRuchu\(\)\) return;/, 'konfetti wyłączone przy reduced-motion'); assert.match(HTML, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(HTML, /@page \{ size: A4 landscape; margin: 0; \}/, 'arkusz druku A4 poziomo');
  const { B, pamiec } = modul();
  const z = B.nowyZapis('ola', '10', { lista: true, kontakt: false });
  assert.deepEqual([z.imie, z.dystans, z.nr], ['Ola', '10', 313], 'imię z wielkiej litery, numer kolejny po 312 przykładowych');
  assert.equal(B.nowyZapis('', '5'), null); assert.equal(B.nowyZapis('x1', '5'), null); assert.equal(B.nowyZapis('a'.repeat(30), '5').imie.length, 24, 'przycięte do 24 znaków'); assert.equal(B.nowyZapis('anna-maria k', 'twoj').imie, 'Anna-maria K');
  assert.equal(B.zapisz({ zapis: z }), true); assert.deepEqual([...pamiec.keys()], ['bm_bieg_pokaz']); assert.deepEqual(B.odczytaj().zapis.imie, 'Ola'); assert.doesNotMatch(pamiec.get('bm_bieg_pokaz'), /@|nazwisko/);
  B.wyczysc(); assert.equal(pamiec.size, 0); assert.deepEqual({ ...B.odczytaj() }, {});
  assert.equal(modul({ bezPamieci: true }).B.zapisz({ a: 1 }), false, 'bez localStorage: false, bez wyjątku'); assert.equal(modul({ pamiecPada: true }).B.zapisz({ a: 1 }), false);
  assert.deepEqual([B.nowyWynik(z, 'zegarek').czas_s, B.nowyWynik(B.nowyZapis('Jan', '5'), 'zegarek').czas_s], [3482, 1771], 'zegarek: udawany trening 10 km 58:02, 5 km 29:31');
  assert.deepEqual([B.nowyWynik(z, 'recznie', '1:02:05').czas_s, B.nowyWynik(z, 'recznie', 'abc'), B.nowyWynik(z, 'recznie', '12:61')], [3725, null, null]);
  const tw = B.nowyWynik(B.nowyZapis('Ewa', 'twoj'), 'recznie', ''); assert.deepEqual([tw.czas_s, tw.ukonczyl, tw.km], [null, true, 3.2], '„Twój dystans”: bez czasu, tylko ukończenie');
  assert.deepEqual([B.czas(1771), B.czas(3725), B.tempo(3482, 10), B.tempo(1771, 5), B.tempo(100, 0)], ['29:31', '1:02:05', '5:48 /km', '5:54 /km', '']);
  assert.deepEqual([B.sekundyZTekstu('29:31'), B.sekundyZTekstu('0:59'), B.sekundyZTekstu('')], [1771, 59, null]);
  assert.equal(B.dataPolska(new Date(2026, 10, 21)), '21 listopada 2026');
  const w = B.wlasnyWiersz({ zapis: z, wynik: B.nowyWynik(z, 'zegarek') }); assert.deepEqual({ ...w }, { nr: 313, imie: 'Ola', dystans: '10', czas_s: 3482, ukonczyl: true, pokaz: true });
});

test('(4) kod QR: własny koder (bajty, poziom M, wersje 1–10), bez CDN; rozmiar, wzorce pozycjonujące, timing, moduł stały; SVG z marginesem', () => {
  const { B } = modul();
  const q = B.QR.koduj('https://biegamy.run/miasto-bieg.html');
  assert.equal(q.wersja, 3); assert.equal(q.n, 29, 'wersja 3 = 29 modułów');
  assert.deepEqual([B.QR.koduj('A').wersja, B.QR.koduj('x'.repeat(100)).wersja, B.QR.koduj('z'.repeat(213)).wersja, B.QR.koduj('z'.repeat(214))], [1, 6, 10, null], 'dobór wersji po pojemności (M): 14, 106, 213 bajtów');
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(B.QR.pojemnosc), [16, 28, 44, 64, 86, 108, 124, 154, 182, 216], 'słowa danych na wersję (M)');
  const n = q.n, m = q.modul;
  for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let i = 0; i < 7; i++) { assert.ok(m(x0 + i, y0) && m(x0 + i, y0 + 6) && m(x0, y0 + i) && m(x0 + 6, y0 + i), 'wzorzec pozycjonujący: ramka'); }
    for (let dy = 1; dy <= 5; dy++) for (let dx = 1; dx <= 5; dx++) assert.equal(m(x0 + dx, y0 + dy), dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4, 'wzorzec: środek 3×3 ciemny, pierścień jasny');
  }
  for (let i = 8; i < n - 8; i++) { assert.equal(m(6, i), i % 2 === 0, 'timing pionowy'); assert.equal(m(i, 6), i % 2 === 0, 'timing poziomy'); }
  assert.equal(m(8, n - 8), true, 'moduł stały ciemny'); assert.equal(m(-1, 0), false); assert.equal(m(n, 0), false);
  const q10 = B.QR.koduj('z'.repeat(200)); assert.equal(q10.n, 57); assert.ok([0, 1, 2, 3, 4, 5, 6, 7].includes(q10.maska));
  const svg = B.qrSvg('https://biegamy.run/miasto-bieg.html');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 37 37" shape-rendering="crispEdges"/, 'margines 4 moduły z każdej strony'); assert.match(svg, /<path d="M4 4h1v1h-1z/); assert.doesNotMatch(svg, /<script|href/);
  assert.equal(B.qrSvg('z'.repeat(300)), '', 'za długi tekst: pusto, bez wyjątku');
  assert.match(HTML, /ADRES_STRONY = location\.origin \+ location\.pathname/, 'QR prowadzi na tę stronę, adres z przeglądarki, bez stałej');
});

test('(5) numer startowy, dyplom (telefon 1080×1350, A4 1754×1240), plakat i grafika do mediów: napisy, PRZYKŁAD, pole na znak organizacji bez logo', () => {
  const { B, napisy, obrazy } = modul();
  const zapis = B.nowyZapis('Ola', '10'), stan = { zapis, wynik: B.nowyWynik(zapis, 'zegarek') };
  const k = B.numerStartowy(zapis, {}); assert.deepEqual([k.width, k.height], [1200, 900]);
  for (const t of ['313', 'OLA', '10 KM', 'BIEG WIRTUALNY', 'PRZYKŁAD', 'bieg i spacer dla jednej zbiórki · udział bezpłatny', 'BiegaMy']) assert.ok(napisy.includes(t), 'numer: ' + t);
  napisy.length = 0;
  const d = B.dyplom(stan, 'telefon', {}); assert.deepEqual([d.width, d.height], [1080, 1350]);
  for (const t of ['DYPLOM', 'Ola', '58:02', '5:48', 'Bieg Wirtualny · 10 km', 'tu znak organizacji', 'PRZYKŁAD', 'KILOMETRY BUDUJĄ ULICĘ', 'Numer startowy: 313', 'BiegaMy']) assert.ok(napisy.includes(t), 'dyplom: ' + t);
  assert.ok(!napisy.some((t) => /@|www\.|\.pl\b/.test(t)), 'dyplom bez adresów');
  napisy.length = 0;
  const a4 = B.dyplom(stan, 'a4', {}); assert.deepEqual([a4.width, a4.height], [1754, 1240]); assert.ok(napisy.includes('DYPLOM') && napisy.includes('Ola') && napisy.includes('tu znak organizacji'));
  napisy.length = 0;
  const tw = B.dyplom({ zapis: B.nowyZapis('Ewa', 'twoj'), wynik: B.nowyWynik(B.nowyZapis('Ewa', 'twoj'), 'recznie') }, 'telefon', {});
  assert.ok(tw && napisy.includes('ukończono') && napisy.includes('Bieg Wirtualny · Twój dystans (3,2 km)'), '„Twój dystans”: „ukończono” i kilometry zamiast czasu i tempa'); assert.ok(!napisy.some((t) => /\/km/.test(t)));
  napisy.length = 0;
  const p = B.plakat('https://biegamy.run/miasto-bieg.html', {}); assert.deepEqual([p.width, p.height], [1080, 1350]);
  for (const t of ['BIEG WIRTUALNY', 'ZAPISZ SIĘ', 'Udział jest bezpłatny.', 'https://biegamy.run/miasto-bieg.html', 'PRZYKŁAD', 'tu znak organizacji →']) assert.ok(napisy.includes(t), 'plakat: ' + t);
  napisy.length = 0;
  const s = B.grafikaSocial({}); assert.deepEqual([s.width, s.height], [1080, 1080]); assert.ok(napisy.includes('WIRTUALNY') && napisy.includes('PRZYKŁAD') && napisy.includes('udział bezpłatny · numer, dyplom i odznaka'));
  assert.equal(obrazy.length, 0, 'bez przekazanych grafik canvas rysuje zapas kształtami, nie pada');
  /* konfetti (11.11): tylko na marginesach i w pustych polach; żaden punkt nie wpada w prostokąty wykluczeń (z zapasem 14 px), a dyplom, plakat i ramki je podają */
  const wyk = [[100, 100, 200, 50], [400, 400, 100, 100]], los = (() => { let a = 7; return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; }; })();
  const pkt = B.konfettiPunkty(1080, 1350, 200, los, wyk);
  assert.ok(pkt.length >= 150 && pkt.length <= 200, 'większość punktów trafia poza wykluczenia (' + pkt.length + ')');
  assert.ok(pkt.every((p) => !wyk.some((r) => p.x >= r[0] - 14 && p.x <= r[0] + r[2] + 14 && p.y >= r[1] - 14 && p.y <= r[1] + r[3] + 14)), 'żaden punkt w polu wykluczonym ani w zapasie 14 px');
  assert.ok(pkt.every((p) => p.x >= 0 && p.x <= 1080 && p.y >= 0 && p.y <= 1350 && p.dl >= 12 && p.alfa >= 0.5), 'punkty w kadrze');
  assert.equal(B.konfettiPunkty(100, 100, 50, los, [[0, 0, 100, 100]]).length, 0, 'całe pole wykluczone = zero konfetti, bez pętli bez końca');
  assert.match(MJS, /konfettiTlo\(c, W, H, 90, los, WYK\);/, 'dyplom podaje wykluczenia (tytuł, imię, ramki, podpisy, pole znaku, wstęga)');
  assert.match(MJS, /tekstWSzer\(c, wart\[i\], x, yy \+ \(i === 2 \? 4 : 14\), \(a4 \? 380 : 280\) - 36, FONT_NAGL/, 'tekst w trzech ramkach dopasowany do ich szerokości');
  assert.match(MJS, /konfettiTlo\(c, W, 420, 40, los, \[\[40, 120, 1000, 150\]/, 'plakat: konfetti nie na tytule');
  /* tekst zmieszczony w szerokości (udawany pomiar: 10 px na znak): cały tekst, gdy się mieści (nawet gdy z „…” już by się nie zmieścił); „…” dopiero, gdy nie mieści się przy 60 % rozmiaru */
  napisy.length = 0; const c2 = B.numerStartowy(zapis, {}).getContext('2d'); napisy.length = 0;
  B.tekstWSzer(c2, 'BIEG WIRTUALNY', 0, 0, 145, 'x', 100); assert.deepEqual([...napisy], ['BIEG WIRTUALNY'], 'pełny tytuł, bez uciętej litery (błąd z 10.11: mierzono od razu z „…”)');
  napisy.length = 0; B.tekstWSzer(c2, 'BIEG WIRTUALNY', 0, 0, 90, 'x', 100); assert.deepEqual([...napisy], ['BIEG WIR…'], 'za długi: przycięty z „…”, 9 znaków po 10 px ≤ 90');
  const im = { naturalWidth: 10, width: 10 }; B.numerStartowy(zapis, { brama: im }); B.dyplom(stan, 'telefon', { medal: im }); assert.equal(obrazy.length, 2, 'z grafikami: brama na numerze, medal na dyplomie');
  assert.match(HTML, /kanwy\.dyplomA4 = B\.dyplom\(stan, 'a4', obrazy\)/); assert.match(HTML, /window\.print\(\)/);
  assert.match(HTML, /document\.fonts\.load\("40px 'Bebas Neue'"\)/, 'fonty wczytane przed rysowaniem (z limitem czasu)');
});

test('(6) scena biegu: brama, kibice, biegacze; ulica rośnie z kilometrami, mur, domki, META i ZBUDOWANA po biegu; grafiki przez zrodlo; bez ruchu przy reduced-motion', () => {
  const { B, el } = modul();
  const h = el('div'); const s = B.scena(h, { tryb: 'hero', wysokosc: 250 });
  assert.ok(s.className.includes('bs--ruch')); assert.equal(s.style.height, '250px');
  assert.equal(zKlasa(s, 'bs-brama').length, 2, 'hero: brama na początku i na końcu'); assert.equal(zKlasa(s, 'bs-kibice').length, 3); assert.equal(zKlasa(s, 'bs-biegacz').length, 4);
  assert.equal(zKlasa(s, 'bs-chip--przyklad').length, 1); assert.equal(zKlasa(s, 'bs-domek').length, 0); assert.equal(zKlasa(s, 'bs-meta').length, 0);
  assert.ok(zKlasa(s, 'bs-chip').some((c) => c.children[0] && c.children[0].textContent === '312'), 'licznik uczestników na scenie');
  const mapa = { 'assets/miasto/bieg-brama.svg': 'blob:brama', 'assets/ulica/droga.webp': 'blob:droga' };
  const u = B.scena(el('div'), { tryb: 'ulica', faza: 'trakcie', suma_km: 1840, cel_km: 5000, cegly_n: 180, wysokosc: 240, zrodlo: (x) => mapa[x] });
  assert.equal(zKlasa(u, 'bs-domek').length, 3, 'trzy domki firm'); assert.deepEqual(zKlasa(u, 'bs-szyld').map((x) => x.textContent), ['Piekarnia na Rogu', 'Warsztat Rowerowy', 'Studio Ruchu']);
  const drogi = zKlasa(u, 'bs-droga').filter((x) => !x.className.includes('szutr')); assert.equal(drogi[0].style.width, '552px', '36,8 % z 1500 px = 552 px drogi'); assert.equal(zKlasa(u, 'bs-droga--szutr').length, 1, 'reszta szutrem');
  assert.equal(drogi[0].style.backgroundImage, 'url("blob:droga")', 'tło drogi przez zrodlo'); assert.equal(zKlasa(u, 'bs-brama')[0].src, 'blob:brama'); assert.equal(zKlasa(u, 'bs-brama')[0].attrs['data-plik'], 'assets/miasto/bieg-brama.svg');
  assert.equal(zKlasa(u, 'bs-kibice')[0].src, 'assets/miasto/bieg-kibice.svg', 'plik spoza mapy: zwykły adres');
  const cegly = zKlasa(u, 'bs-cegla'); assert.equal(cegly.length, 9); assert.equal(cegly[8].textContent, '+172', '8 cegieł z imionami w pierwszym kadrze + reszta liczbą'); assert.ok(cegly.some((c) => c.className.includes('zlota')) && cegly.some((c) => c.className.includes('pusta')), 'złote i puste cegły (bez zgody)');
  assert.ok(cegly.filter((c) => c.textContent && !/^\+/.test(c.textContent)).every((c) => B.IMIONA.includes(c.textContent)), 'imiona na cegłach tylko z puli');
  assert.equal(zKlasa(u, 'bs-meta').length, 0); assert.equal(zKlasa(u, 'bs-brama').length, 1);
  const po = B.scena(el('div'), { tryb: 'ulica', faza: 'po', suma_km: 1840, cel_km: 5000, cegly_n: 180 });
  assert.equal(zKlasa(po, 'bs-meta')[0].textContent, 'ZBUDOWANA'); assert.equal(zKlasa(po, 'bs-brama').length, 2, 'po biegu META na końcu'); assert.equal(zKlasa(po, 'bs-droga--szutr').length, 0, 'cała droga gotowa');
  assert.ok(zKlasa(po, 'bs-chip').some((c) => c.children[0] && c.children[0].textContent === '100 %'));
  const bez = modul({ bezRuchu: true }); const sb = bez.B.scena(bez.el('div'), { tryb: 'hero' });
  assert.ok(!sb.className.includes('bs--ruch'), 'reduced-motion: bez klasy ruchu (biegacze, chmury i brama stoją)'); assert.equal(bez.B.bezRuchu(), true);
  assert.match(MJS, /\.bs--ruch \.bs-biegacz\{animation/); assert.match(MJS, /\.bs--ruch \.bs-chmura\{animation/); assert.doesNotMatch(MJS, /"\.bs-biegacz\{[^}]*animation/, 'animacja tylko pod klasą ruchu');
  assert.match(HTML, /\.bw-hero \{ position: relative; margin: 0 -12px; height: 250px;/, 'zarezerwowana wysokość sceny (bez skoku układu)');
  assert.ok(HTML.indexOf('<div class="bw-hero">') < HTML.indexOf('<h1>Bieg Wirtualny</h1>'), 'kolor najpierw: scena przed tytułem');
});

test('(7) wejście tylko z karty przykładu na miasto.html; kreator ma pola biegu ukryte do wyboru formy; sw.js, dla-fabianka.html i akcja.mjs nietknięte; grafiki z listy w Cache API', () => {
  const linkuja = [];
  (function szukaj(kat) {
    for (const w of fs.readdirSync(kat, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'vendor', 'assets', 'tests', 'tools', 'docs', 'supabase'].includes(w.name)) continue;
      const p = path.join(kat, w.name);
      if (w.isDirectory()) szukaj(p);
      else if (/\.(html|m?js|json|webmanifest)$/.test(w.name) && !/^miasto-bieg\.(html|mjs)$/.test(w.name) && /miasto-bieg\.html/.test(fs.readFileSync(p, 'utf8'))) linkuja.push(path.relative(KORZEN, p).replace(/\\/g, '/'));
    }
  })(KORZEN);
  assert.deepEqual(linkuja.sort(), ['js/miasto-pokaz.mjs', 'js/miasto.mjs', 'miasto.html'], 'link do strony biegu tylko z karty przykładu, ze scenariusza pokazu i z kodu QR w podglądzie kreatora (12.11; adres z location, nie ze stałej)');
  assert.match(MIASTO_MJS, /else if \(u\.strona\) h \+= '<a class="md-przycisk" href="' \+ esc\(u\.strona\) \+ '">' \+ esc\(u\.przycisk \|\| "Zobacz bieg ›"\) \+ '<\/a>';/);   // 11.11: etykieta z ulicy (drużyny: „Zobacz wyzwanie ›”)
  assert.match(HTML, /<a class="bw-wroc" href="miasto\.html">‹ Miasto Dobra<\/a>/, 'powrót do miasta');
  assert.doesNotMatch(czytaj('sw.js'), /miasto|bm-miasto|bieg-wirtualny|bieg-brama/i, 'sw.js zamrożony: bez precache stron pokazu'); assert.doesNotMatch(czytaj('dla-fabianka.html'), /miasto/, 'strona akcji nietknięta'); assert.doesNotMatch(czytaj('js/akcja.mjs'), /miasto/, 'akcja.mjs nietknięty');
  const M = (() => { const c = { console, Promise, JSON, Math, Number, String, Object, Array, Date, RegExp, isFinite }; c.globalThis = c; vm.runInNewContext(MIASTO_MJS, c); return c.BM_MIASTO; })();
  /* 12.11 (blizna-233): kreator to jeden ekran „Załóż bieg w minutę” (bieg = poziom 1 każdej ulicy); stary wybór form i pola biegu zniknęły, formy to poziomy na drabince */
  const k2 = M.kreatorHtml({ teraz: new Date('2026-11-12T10:00:00') });
  assert.doesNotMatch(k2, /md-forma|data-pola-biegu|Wirtualny bieg charytatywny|Krok \d z/, 'bez listy form i bez kroków');
  assert.match(k2, /<h3>Załóż bieg w minutę<\/h3>/); assert.match(k2, /data-zatwierdz>Załóż bieg ›/); assert.doesNotMatch(k2, /<form|type="submit"/);
  assert.match(M.podgladBieguHtml({ swiat: 'kosmos', termin: '2026-11-14' }, ''), /href="miasto-bieg\.html">Zobacz przykład gotowego biegu ›/, 'podgląd prowadzi do przykładu biegu');
  assert.match(MIASTO, /function zatwierdzBieg\(\) \{/); assert.ok(MIASTO.includes("window.BM_BIEG.qrSvg(location.origin + location.pathname.replace(/[^\\/]*$/, '') + 'miasto-bieg.html'"), 'QR z adresu strony, nie ze stałej');
  /* bez sieci: każda grafika sceny, ikon i canvasów jest na liście ZASOBY (Cache API strony), scena rysowana dopiero z adresami z cache */
  const lista = [...HTML.matchAll(/'(assets\/[^']+)'/g)].map((m) => m[1]).filter((u, i, a) => a.indexOf(u) === i);
  for (const u of [...new Set((MJS.match(/assets\/[a-z]+\/[a-z0-9-]+\.(webp|svg)/g) || []))]) { if (/domek-[4-7]/.test(u)) continue; assert.ok(lista.includes(u), u + ' na liście zasobów do cache'); }
  for (const u of lista) assert.ok(fs.existsSync(path.join(KORZEN, u)), u + ' istnieje');
  assert.match(HTML, /caches\.open\('bm-miasto-grafiki-v1'\)/, 'ten sam cache co mapa miasta'); assert.match(HTML, /function rysujHero\(\) \{ gotoweHero\.then\(/, 'scena dopiero z adresami z cache (każdy plik z sieci raz)');
  assert.match(MJS, /nr = 1 \+ \(i % 3\)/, 'ulica biegu używa domków 1–3 (mniej do pobrania)');
});
