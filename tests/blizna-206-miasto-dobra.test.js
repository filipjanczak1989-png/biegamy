/* BLIZNA 206 / MIASTO DOBRA, PROTOTYP NA POKAZ (9.11.2026). miasto.html + js/miasto.mjs.
   Pilnuje tego, co przy fundacji kosztuje zaufanie: (1) suma miasta liczy tylko ulice prawdziwe, przykłady są oznaczone na mapie, na karcie i przy każdej
   liczbie; (2) bez danych osobowych, nazwisk, imion w kodzie, logo i nazw prawdziwych organizacji, bez „partner”; (3) strona czyta wyłącznie publiczny licznik
   (przez js/akcja.mjs) i niczego nie wysyła, kreator też; (4) działa bez licznika: ostatni zapisany stan ze „stan z …”, bez pustych kart;
   (5) noindex i żadna strona ani skrypt aplikacji nie linkuje do miasto.html; sw.js (zamrożony) nietknięty. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const HTML = czytaj('miasto.html'), MJS = czytaj('js/miasto.mjs');

function modul(opcje) {
  const o = opcje || {}, pamiec = new Map();
  const ctx = { console, Promise, JSON, Math, Number, String, Object, Array, Date, RegExp, isFinite,
    localStorage: o.bezPamieci ? null : { getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null), setItem: (k, v) => { if (o.pamiecPada) throw new Error('brak zgody'); pamiec.set(k, String(v)); } } };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.runInNewContext(czytaj('js/akcja.mjs'), ctx);
  if (o.bezAkcji) delete ctx.BM_AKCJA;
  vm.runInNewContext(MJS, ctx);
  return { M: ctx.BM_MIASTO, ctx, pamiec };
}
const LICZNIK = { wystartowala: true, wystartowala_at: '2026-11-07T10:00:00Z', nazwa: 'Kilometry dla Marka', imie: 'Marek', url_zbiorki: 'https://www.siepomaga.pl/x', start: '2026-11-07', koniec: null, cel_km: 12500, suma_km: 721.39, pct: 5.77, zamknieta: false,
  firmy: [], ulica: { odblokowane: [], imiona: [], bez_imienia: 0, cegly: [{ imie: null, zlota: false }], cegly_n: 1 }, testowa: false, plakat_url: 'https://x/plakat', koparka_url: 'https://x/k', muzyka: {}, filip_gr: 1, wizerunek: 'https://x/w' };

test('(1) suma miasta: tylko prawdziwe ulice; przykłady oznaczone na mapie, na karcie i przy każdej liczbie', () => {
  const { M } = modul();
  const u = M.ulicaZLicznika(LICZNIK), lista = M.ulice(u), s = M.sumaMiasta(lista);
  assert.equal(M.PRZYKLADY.length, 4); assert.ok(M.PRZYKLADY.every((p) => p.przyklad === true && p.suma_km > 0), 'każdy przykład ma flagę i wymyślone km');
  assert.equal(s.km, 721.39, 'suma = km prawdziwej, przykłady (15 069 km) nie wchodzą'); assert.deepEqual([s.prawdziwe_n, s.przyklady_n], [1, 4]);
  assert.equal(M.podpisSumy(s), '1 ulica prawdziwa, 4 przykładowe');
  assert.equal(M.sumaMiasta(M.ulice(M.ulicaZLicznika(null))).km, 0, 'bez licznika suma 0, nie suma przykładów');
  assert.equal(M.sumaMiasta(M.ulice(M.ulicaZLicznika({ wystartowala: false }))).km, 0, 'przed startem 0');
  for (const p of M.PRZYKLADY) {
    const k = M.kartaHtml(p), liczb = (k.match(/class="md-liczba"/g) || []).length, znaczkow = (k.match(/class="md-przyklad"/g) || []).length;
    assert.ok(liczb >= 4 && znaczkow === liczb, p.id + ': znaczek „przykład” przy każdej z ' + liczb + ' liczb (jest ' + znaczkow + ')');
    assert.match(k, /md-chip--przyklad">PRZYKŁAD</); assert.match(k, /Dane wymyślone na potrzeby pokazu\. Nie wchodzą do licznika miasta\./);
    assert.doesNotMatch(k, /href="dla-fabianka/, 'przykład nie prowadzi na prawdziwą ulicę'); assert.match(k, /data-podglad="/);
    assert.ok(M.etykietaMapy(p).tytul.startsWith(p.nazwa), 'etykieta mapy z nazwą');
  }
  assert.match(M.kartaHtml(M.PRZYKLADY[3]), /md-chip--koniec">ZAKOŃCZONA<[\s\S]*100 %[\s\S]*<ul class="md-podsumowanie">/, 'zakończona: 100 % i podsumowanie');
  assert.match(HTML, /\.dz--przyklad \.dz-et::before \{ content: "PRZYKŁAD";/, 'znaczek PRZYKŁAD na mapie z CSS');
  assert.equal((HTML.match(/class="dz dz--przyklad/g) || []).length, 4, '4 działki przykładowe'); assert.equal((HTML.match(/class="dz dz--prawdziwa"/g) || []).length, 1);
  const kp = M.kartaHtml(u);
  assert.doesNotMatch(kp, /przykład/i, 'prawdziwa bez słowa przykład'); assert.match(kp, /md-chip--trwa">TRWA<[\s\S]*<h2>Ulica Marka<\/h2>[\s\S]*<b>721 km<\/b><span>z 12 500 km celu[\s\S]*<b>5,8 %<\/b>[\s\S]*<b>1<\/b><span>cegła w murze[\s\S]*<b>0<\/b><span>firm na ulicy[\s\S]*href="dla-fabianka\.html">Wejdź na ulicę/);
  assert.deepEqual({ ...M.etykietaMapy(u) }, { tytul: 'Ulica Marka · 721 km', podpis: '5,8 % celu · 1 cegła · 0 firm' });
  assert.equal(M.procent({ suma_km: 1840, cel_km: 5000 }), 36.8); assert.equal(M.procent({ suma_km: 10000, cel_km: 10000 }), 100); assert.equal(M.procent({ suma_km: 5, cel_km: 0 }), 0);
  assert.deepEqual([2, 4, 5, 12, 22, 0].map((n) => M.forma(n, ['firma', 'firmy', 'firm'])), ['firmy', 'firmy', 'firm', 'firm', 'firmy', 'firm']);
});

test('(2) bez danych osób: imię z licznika, nie z kodu; bez nazwisk, e-maili, UUID, logo i nazw organizacji; przykłady bez dzieci i diagnoz; bez „partner”', () => {
  for (const [n, t] of [['miasto.html', HTML], ['js/miasto.mjs', MJS]]) {
    assert.doesNotMatch(t.replace(/dla-fabianka(\.html)?/g, ''), /fabian/i, n + ': imię bohatera tylko z licznika (slug akcji to identyfikator techniczny, jak w 16 innych plikach)'); assert.doesNotMatch(t, /Kasia|Filip/, n + ': bez imion organizatorów');
    assert.doesNotMatch(t, /[\w.+-]+@[\w-]+\.[\w.]+/, n + ': bez e-maili'); assert.doesNotMatch(t, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, n + ': bez UUID');
    assert.doesNotMatch(t, /siepomaga|zrzutka|pomagam\.pl|fundacj[aeiy] [A-ZŁŚŻ]/, n + ': bez nazw serwisów zbiórek i organizacji');
    assert.doesNotMatch(t, /partner|współprac|we współpracy|patronat/i, n + ': żadnej sugestii partnerstwa');
    assert.doesNotMatch(t, /logo_url|akcja-firmy-logo|logo\.(png|jpg|webp|svg)|(?<!favicon-32)\.(png|jpg)"/, n + ': bez logo firm (jedyny png to favicon)'); assert.doesNotMatch(t, /chor(ob|y|uje)|diagnoz|nowotw|szpital|leczeni|rehabilitac|niepełnospraw/i, n + ': bez diagnoz');
    assert.doesNotMatch(t, /zmar[łl]|śmier|pogrzeb|odszed|odeszł/i, n + ': ulica zbudowana bez sugestii śmierci');
    /* Filip 10.11: ukończona ulica to sukces i święto, nie upamiętnienie (przy zbiórkach na leczenie dzieci „pamięci” kojarzy się z kimś, kto odszedł) */
    assert.doesNotMatch(t, /pamięci|pomnik|wieniec|tablica pamiątkowa|pamiątk|upamiętni/i, n + ': nic, co wygląda jak upamiętnienie');
  }
  assert.match(MJS, /u\.nazwa = im \? "Ulica " \+ im : \(d\.nazwa \? String\(d\.nazwa\) : u\.nazwa\);/, 'nazwa ulicy z imienia z licznika (dopełniacz z akcja.mjs)');
  const { M } = modul();
  for (const p of M.PRZYKLADY) assert.match(p.nazwa, /^(Ulica [A-ZŚŻŁ][a-ząęółśżźćń]+|Bieg Wirtualny)$/, p.id + ': nazwa neutralna');
  assert.deepEqual([...M.PRZYKLADY].map((p) => p.nazwa), ['Bieg Wirtualny', 'Ulica Szkolna', 'Ulica Urodzinowa', 'Ulica Słoneczna']);
  const tekst = JSON.stringify(M.PRZYKLADY) + JSON.stringify(M.KROKI);
  assert.doesNotMatch(tekst, /\b[A-ZŁŚŻ][a-ząęółśżźćń]+ [A-ZŁŚŻ][a-ząęółśżźćń]+(ski|cka|wicz|czyk|ak)\b/, 'bez imion i nazwisk');
  assert.match(tekst, /organizacj[aieę] prowadząc/, 'w tekstach: „organizacja prowadząca zbiórkę”');
  assert.match(HTML, /Pieniądze idą prosto do organizacji prowadzących zbiórki\. BiegaMy nic nie przyjmuje\./);
  const grafiki = [...HTML.matchAll(/src="(assets\/[^"]+)"/g)].map((m) => m[1]).concat([...HTML.matchAll(/'(assets\/[^']+\.webp)'/g)].map((m) => m[1]));
  assert.ok(grafiki.length >= 20); for (const g of new Set(grafiki)) { assert.ok(fs.existsSync(path.join(KORZEN, g)), g + ' istnieje'); assert.doesNotMatch(g, /fabian|kasia|filip|rowerzysta|koparka-postac|arkusz/i, g + ': tylko grafiki ogólne'); }
  assert.doesNotMatch(HTML, /supabase\.co\/storage|akcja-wizerunek|share-assets/, 'nic z kubełków');
  /* assets/miasto (10.11, API obrazów ze wzorcem domek-1): dokładnie pliki, których strona albo moduł używa; ≤ 60 kB (tło mapy ≤ 150 kB); nazwy bez imion */
  const uzyte = new Set(grafiki.concat([...MJS.matchAll(/"(assets\/[^"]+\.webp)"/g)].map((m) => m[1])).filter((g) => g.startsWith('assets/miasto/')));
  const wKatalogu = fs.readdirSync(path.join(KORZEN, 'assets/miasto')).map((f) => 'assets/miasto/' + f);
  assert.deepEqual(wKatalogu.sort(), [...uzyte].sort(), 'assets/miasto: dokładnie te pliki, których używa strona');
  assert.equal(wKatalogu.length, 11, 'tło, brama, szkoła, domek urodzinowy, ulica zbudowana, staw, 5 ikon światów');
  for (const g of wKatalogu) {
    const kb = fs.statSync(path.join(KORZEN, g)).size / 1000;
    assert.ok(kb <= (/tlo-mapy/.test(g) ? 150 : 60), g + ': ' + kb.toFixed(1) + ' kB (limit 60, tło 150)');
    assert.match(g, /^assets\/miasto\/[a-z0-9-]+\.webp$/, g + ': nazwa neutralna'); assert.doesNotMatch(g, /fabian|kasia|filip|pamiec|pomnik/i, g + ': bez imion i upamiętnień');
  }
});

test('(3) czyta tylko publiczny licznik przez js/akcja.mjs; nic nie wysyła; kreator niczego nie zapisuje; licznik czytany tylko w polach z listy', async () => {
  for (const [n, t] of [['miasto.html', HTML], ['js/miasto.mjs', MJS]]) {
    assert.doesNotMatch(t, /supabase\.createClient|window\.supabase|\.rpc\(|\.from\(|\.insert\(|\.upsert\(|XMLHttpRequest|sendBeacon|\.storage\.|functions\.invoke/, n + ': żadnej drogi do bazy poza licznikiem');
    assert.doesNotMatch(t, /<form|action=|method="post"|FormData/i, n + ': kreator bez formularza wysyłającego');
    assert.doesNotMatch(t, /sessionStorage\.setItem|indexedDB|document\.cookie/, n + ': bez innych zapisów');
  }
  assert.doesNotMatch(HTML, /<script src="(sb\.js|vendor\/)/, 'strona nie ładuje sb.js ani klienta Supabase (szybki start, tylko licznik)');
  assert.match(HTML, /<script src="js\/akcja\.mjs"><\/script>\s*<script src="js\/miasto\.mjs"><\/script>/);
  const fetche = [...HTML.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(fetche, ['url'], 'jedyny fetch w stronie to własna grafika z assets/ (cache-first)');
  assert.match(HTML, /if \(!url \|\| !\/\^assets\\\/\/\.test\(url\)\) return;/, 'grafiki tylko z assets/');
  assert.equal((MJS.match(/fetch\(/g) || []).length, 0, 'moduł nie woła fetch sam');
  assert.match(MJS, /A\.pobierzPubliczny\(SLUG_PRAWDZIWEJ, \{ baza: BAZA \}\)/, 'licznik przez pobierzPubliczny z akcja.mjs (EF akcja-licznik)');
  assert.equal((MJS.match(/localStorage\.setItem/g) || []).length, 1, 'jedyny zapis: ostatni stan prawdziwej ulicy');
  assert.match(MJS, /setItem\(KLUCZ_PAMIECI, JSON\.stringify\(\{ t: teraz \|\| Date\.now\(\), u: u \}\)\)/);
  assert.match(HTML, /KREATOR\.addEventListener\('submit', function \(e\) \{ e\.preventDefault\(\); \}\);/);
  const { M } = modul();
  for (let i = 0; i < M.KROKI.length; i++) { const k = M.kreatorHtml(i); assert.doesNotMatch(k, /<form|type="submit"|action=/); assert.match(k, new RegExp('Krok ' + (i + 1) + ' z 3')); }
  assert.match(M.kreatorHtml(2), /<button type="button" class="md-przycisk" disabled>Wyślij do weryfikacji<\/button>[\s\S]*<b>Wkrótce\.<\/b> To prototyp: niczego nie zapisuje i nie wysyła\./);
  assert.match(M.kreatorHtml(0), /Link do oficjalnej zbiórki/); assert.match(M.kreatorHtml(1), /Wirtualny bieg charytatywny/); assert.match(M.kreatorHtml(2), /za zgodą opiekuna/);
  /* świat gry (Filip 9.11): pytanie, 6 kafelków, „Bez bohatera” na końcu, dopisek; ikony tylko z assets/ albo emoji */
  const k3 = M.kreatorHtml(2);
  assert.match(k3, /<p class="md-pytanie">Co kocha bohater tej ulicy\?<\/p>/); assert.equal((k3.match(/class="md-swiat[" ]/g) || []).length, 6);
  assert.deepEqual([...M.KROKI[2].swiaty].map((s) => s.nazwa), ['Budowa', 'Kosmos', 'Dinozaury', 'Piłka', 'Zwierzęta', 'Bez bohatera']);
  for (const s of M.KROKI[2].swiaty) { assert.ok((s.obraz && /^assets\//.test(s.obraz) && fs.existsSync(path.join(KORZEN, s.obraz))) || s.emoji, s.id + ': ikona z assets/ albo emoji'); }
  assert.match(k3, /md-swiat md-swiat--bez"><input type="radio" name="md-swiat" value="bez">[\s\S]*<b>Bez bohatera<\/b><small>bieg przez Miasto Dobra<\/small>/);
  assert.match(k3, /<p class="md-dopisek">Ten sam bieg, inny świat/); assert.match(k3, /value="budowa" checked/);

  /* pola licznika: tylko lista; pola plików, pieniędzy i wyprawy nieczytane */
  const czytane = new Set(), proxy = new Proxy(Object.assign({}, LICZNIK), { get(c, k) { if (typeof k === 'string') czytane.add(k); return c[k]; } });
  const u = M.ulicaZLicznika(proxy);
  for (const k of czytane) assert.ok(M.POLA_LICZNIKA.includes(k), 'czyta pole spoza listy: ' + k);
  assert.ok(!czytane.has('plakat_url') && !czytane.has('koparka_url') && !czytane.has('url_zbiorki') && !czytane.has('filip_gr'));
  assert.deepEqual(Object.keys(u).sort(), ['cegly_n', 'cel_km', 'etykieta', 'firmy_n', 'forma', 'id', 'nazwa', 'pct', 'prawdziwa', 'slug', 'status', 'strona', 'suma_km', 'tytul'], 'do pamięci idą tylko liczby i nazwa');
  const z = M.pobierzPrawdziwa(); assert.ok(z && typeof z.then === 'function'); await z.then((w) => assert.equal(w, null, 'bez fetch w atrapie: null, bez wyjątku'));
});

test('(4) bez licznika: ostatni stan z pamięci ze „stan z …”, bez pustych kart; pamięć niedostępna = też bez błędu', () => {
  const { M, pamiec } = modul();
  const u = M.ulicaZLicznika(LICZNIK), t = Date.UTC(2026, 10, 18, 16, 5);
  assert.equal(M.zapamietaj(u, t), true); assert.equal(pamiec.size, 1); assert.ok(pamiec.has(M.KLUCZ_PAMIECI));
  assert.doesNotMatch(pamiec.get(M.KLUCZ_PAMIECI), /siepomaga|plakat|koparka|wizerunek|filip_gr/, 'w pamięci bez linku zbiórki, plików i pieniędzy');
  const od = M.odczytaj(); assert.equal(od.t, t); assert.deepEqual({ ...od.u }, { ...u });
  const k = M.kartaHtml(od.u, { stanZ: od.t });
  assert.match(k, /<p class="md-stan">stan z 18\.11, \d{2}:\d{2} · licznik chwilowo niedostępny<\/p>/); assert.match(k, /<b>721 km<\/b>/);
  assert.match(M.stanZ(t), /^stan z 18\.11, \d{2}:\d{2}$/); assert.equal(M.stanZ('nie-data'), '');
  assert.equal(M.zapamietaj(M.ulicaZLicznika(null), t), false, 'stanu „brak” nie zapisujemy');
  const brak = M.kartaHtml(M.ulicaZLicznika(null));
  assert.match(brak, /LICZNIK NIEDOSTĘPNY[\s\S]*<h2>Ulica akcji BiegaMy<\/h2>[\s\S]*Licznik chwilowo nie odpowiada[\s\S]*Wejdź na ulicę/); assert.doesNotMatch(brak, /md-liczba|NaN|undefined/, 'bez pustych liczb');
  assert.deepEqual({ ...M.etykietaMapy(M.ulicaZLicznika(null)) }, { tytul: 'Ulica akcji BiegaMy', podpis: 'licznik chwilowo niedostępny' });
  assert.match(M.kartaHtml(M.ulicaZLicznika({ wystartowala: false })), /WKRÓTCE[\s\S]*Ulica w przygotowaniu/);
  const bez = modul({ bezPamieci: true }).M; assert.equal(bez.odczytaj(), null); assert.equal(bez.zapamietaj(u, t), false);
  const pada = modul({ pamiecPada: true }).M; assert.equal(pada.zapamietaj(u, t), false, 'brak zgody na zapis = false, bez wyjątku');
  assert.match(HTML, /var pam = M\.odczytaj\(\);\n\s*if \(pam\) \{ prawdziwa = pam\.u; czasPamieci = pam\.t; \}\n\s*rysujMape\(\); rysujKarte\(\);/, 'najpierw pamięć, potem sieć');
  assert.match(HTML, /else if \(pam\) \{ prawdziwa = pam\.u; czasPamieci = pam\.t; \}/, 'licznik pada → zostaje pamięć ze „stan z”');
  assert.match(HTML, /caches\.open\('bm-miasto-grafiki-v1'\)/, 'grafiki mapy w Cache API (sw.js zamrożony nie trzyma własnych .webp)');
  assert.match(czytaj('sw.js'), /if \(request\.mode === 'navigate'\) \{\n\s*event\.respondWith\(navigationHandler\(request\)\);/, 'SW: strona z cache po pierwszym wejściu');
  assert.match(czytaj('sw.js'), /\.\(html\|css\|m\?js\|/, 'SW: js/miasto.mjs jako zasób statyczny');
});

test('(5) noindex; żadna strona ani skrypt aplikacji nie linkuje do miasto.html; sw.js i dla-fabianka.html nietknięte', () => {
  assert.match(HTML, /<meta name="robots" content="noindex, nofollow">/);
  const linkuja = [];
  (function szukaj(kat) {
    for (const w of fs.readdirSync(kat, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'vendor', 'assets', 'tests', 'tools', 'docs', 'supabase'].includes(w.name)) continue;
      const p = path.join(kat, w.name);
      if (w.isDirectory()) szukaj(p);
      else if (/\.(html|m?js|json|webmanifest)$/.test(w.name) && !/^miasto\.(html|mjs)$/.test(w.name) && /miasto\.html/.test(fs.readFileSync(p, 'utf8'))) linkuja.push(path.relative(KORZEN, p));
    }
  })(KORZEN);
  assert.deepEqual(linkuja, [], 'link do miasto.html tylko od Filipa, nie z aplikacji');
  assert.doesNotMatch(czytaj('sw.js'), /miasto/, 'sw.js zamrożony: bez precache nowej strony');
  assert.doesNotMatch(czytaj('dla-fabianka.html'), /miasto/, 'strona akcji nietknięta');
  assert.doesNotMatch(czytaj('js/akcja.mjs'), /miasto/, 'akcja.mjs nietknięty');
});
