/* BLIZNA 157 / FIRMY: samoobsługa i panel ręczny (Filip 4.11).
   - nic publicznie bez zatwierdzenia: EF zapisuje tylko do prywatnego kubełka, klient nie ma dostępu do tabeli ani funkcji, publiczny kubełek dopiero w zatwierdzeniu;
   - zrzut wpłaty znika po decyzji i najpóźniej po 14 dniach (po skutku: tools/akcja-firmy-zgloszenia-test.sql);
   - limit 3/h i pole-pułapka działają przed wgraniem czegokolwiek; SVG odrzucony po bajtach, typ od klienta nic nie znaczy;
   - Partner akcji (sponsor rzeczowy): budynek bez progu i bez potwierdzenia wpłaty, podpis pod szyldem; próg dotyczy tylko wpłat;
   - logo na szyldzie, a gdy brak albo się nie wczyta: nazwa; dane z licznika nigdy przez innerHTML;
   - PDF tylko w panelu trenera, pdf.js ładowany dopiero przy wyborze PDF, bez eval; formularz publiczny PDF-a nie przyjmuje. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const bezKomJs = (s) => s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);

const png = (w, h) => { const b = new Uint8Array(30); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h); return b; };
const jpeg = (w, h) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0]);
const webpX = (w, h) => { const b = new Uint8Array(32); b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 0); b[24] = (w - 1) & 255; b[25] = (w - 1) >> 8; b[27] = (h - 1) & 255; b[28] = (h - 1) >> 8; return b; };

test('pliki po bajtach: PNG, JPG, WebP; SVG, HTML i podmieniony typ odpadają; wymiary z nagłówka', async () => {
  const F = await zaladuj('supabase/functions/_shared/firma-zgloszenie.mjs');
  assert.equal(F.typPoBajtach(png(10, 10)), 'image/png');
  assert.equal(F.typPoBajtach(jpeg(10, 10)), 'image/jpeg');
  assert.equal(F.typPoBajtach(webpX(10, 10)), 'image/webp');
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(F.typPoBajtach(svg), null, 'SVG odrzucony');
  assert.match(F.sprawdzPlik(svg, 'logo').blad, /tylko PNG, JPG albo WebP/);
  assert.equal(F.typPoBajtach(new TextEncoder().encode('<html><body>hej</body></html>')), null);
  assert.equal(F.typPoBajtach(new TextEncoder().encode('%PDF-1.4 cokolwiek tutaj')), null, 'formularz publiczny nie przyjmuje PDF');
  assert.match(F.sprawdzPlik(new Uint8Array(0), 'logo').blad, /Dodaj logo/);
  assert.match(F.sprawdzPlik(new Uint8Array(F.PLIK_MAKS + 1).fill(137), 'logo').blad, /2 MB/);
  assert.deepEqual(F.wymiaryObrazu(png(798, 430), 'image/png'), { w: 798, h: 430 });
  assert.deepEqual(F.wymiaryObrazu(jpeg(640, 480), 'image/jpeg'), { w: 640, h: 480 });
  assert.deepEqual(F.wymiaryObrazu(webpX(300, 200), 'image/webp'), { w: 300, h: 200 });
  assert.equal(F.wymiaryObrazu(new Uint8Array(5), 'image/png'), null);
});

test('pola zgłoszenia: moderacja nazwy, https, e-mail, zgoda, rodzaj tylko domek albo wieżowiec', async () => {
  const F = await zaladuj('supabase/functions/_shared/firma-zgloszenie.mjs');
  await zaladuj('js/moderacja.mjs');
  const M = globalThis.BM_MODERACJA, ok = { rodzaj: 'domek', nazwa: 'Firma Testowa', link: 'firma.pl', email: 'a@firma.pl', zgoda: 'tak', kwota: '150' };
  assert.deepEqual(F.sprawdzZgloszenie(ok, M).wiersz, { rodzaj: 'domek', nazwa: 'Firma Testowa', link: 'https://firma.pl/', email: 'a@firma.pl', kwota_gr: 15000, zgoda_kwota: false });
  assert.equal(F.sprawdzZgloszenie({ ...ok, zgoda_kwota: 'tak' }, M).wiersz.zgoda_kwota, true, 'kwota publicznie tylko po zaznaczeniu');
  assert.match(F.sprawdzZgloszenie({ ...ok, kwota: '' }, M).blad, /kwotę/);
  assert.match(F.sprawdzZgloszenie({ ...ok, rodzaj: 'wiezowiec', kwota: '500' }, M, { prog_domku_zl: 100, prog_wiezowca_zl: 1000 }).blad, /Wieżowiec od 1000/);
  for (const [nad, re] of [[{ rodzaj: 'cegielka' }, /domek albo wieżowiec/], [{ nazwa: 'x' }, /od 2 do 120/], [{ nazwa: 'Kurwa Trans' }, /filtr/i], [{ link: 'http://firma.pl' }, /https/], [{ link: 'javascript:alert(1)' }, /https|adres/], [{ email: 'bez-malpy' }, /e-mail/], [{ zgoda: '' }, /zgodę/]]) {
    assert.match(F.sprawdzZgloszenie({ ...ok, ...nad }, M).blad || '', re, JSON.stringify(nad));
  }
  assert.match(F.sprawdzZgloszenie(ok, null).blad, /Filtr/, 'bez filtra nie przyjmujemy');
});

test('zgłoszenie: pułapka i limit przed plikami, tylko prywatny kubełek, push tylko do Filipa, bez publicznego zapisu', () => {
  const k = bezKomJs(czytaj('supabase/functions/_shared/firma-obsluga.mjs'));
  const z = k.slice(k.indexOf('export async function przyjmijZgloszenie'), k.indexOf('export async function akcjaPanelu'));
  const pulapka = z.indexOf('strona_www'), limit = z.indexOf('akcja_firmy_wpusc'), wgrywanie = z.indexOf('.upload(');
  assert.ok(pulapka > 0 && pulapka < limit && limit < wgrywanie, 'kolejność: pułapka, limit, dopiero wgrywanie');
  assert.match(z, /if \(String\(f\.get\("strona_www"\) \|\| ""\)\.trim\(\)\) return J\(200, \{ ok: true \}\)/, 'bot dostaje ok i nic się nie dzieje');
  assert.match(k, /KUBELEK = "firmy-zgloszenia"/);
  assert.doesNotMatch(z, /PUBLICZNY|share-assets|getPublicUrl|\.from\("akcja_firmy"\)/, 'zgłoszenie nie dotyka niczego publicznego');
  assert.deepEqual([...z.matchAll(/\.rpc\(\s*"([^"]+)/g)].map((m) => m[1]), ['akcja_firmy_wpusc', 'akcja_firmy_zgloszenie_dodaj'], 'klucz serwisowy tylko do dwóch funkcji');
  const ef = czytaj('supabase/functions/firma-zgloszenie/index.ts');
  assert.match(ef, /athlete_id: KONTO_FILIPA/);
  assert.match(k, /Nowa firma: \$\{w\.nazwa\} · /, 'tytuł pushu z komendy');
  assert.match(k, /url: `\/trener\.html#firma-zgloszenie=\$\{id\}`/);
  assert.match(ef, /new Set\(\["https:\/\/biegamy\.run", "https:\/\/run\.biegamy\.app"\]\)/, 'CORS bez gwiazdki');
  assert.match(czytaj('supabase/config.toml'), /\[functions\.firma-zgloszenie\]\nverify_jwt = false/);
});

test('panel: każda akcja poza sprzątaniem wymaga trenera; sprzątanie wymaga sekretu; adres podpisany krótko; zrzut kasowany po decyzji', () => {
  const ef = bezKomJs(czytaj('supabase/functions/firma-panel/index.ts'));
  const sprzatanie = ef.indexOf('body.rodzaj === "sprzatanie"'), trener = ef.indexOf('from("coaches")'), akcja = ef.indexOf('akcjaPanelu(');
  assert.ok(sprzatanie > 0 && sprzatanie < trener && trener < akcja, 'kontrola trenera przed wszystkimi akcjami');
  assert.match(ef, /if \(!SEKRET \|\| \(req\.headers\.get\("x-push-secret"\) \|\| ""\) !== SEKRET\) return J\(401/);
  assert.match(ef, /\.select\("id"\)\.eq\("id", user\.id\)\.maybeSingle\(\)/, 'coaches.id === user.id');
  const k = bezKomJs(czytaj('supabase/functions/_shared/firma-obsluga.mjs'));
  assert.match(k, /WAZNOSC_S = 600/);
  assert.match(k, /createSignedUrl\(z\[pole\], WAZNOSC_S\)/);
  assert.equal((k.match(/\.remove\(data\.pliki \|\| \[\]\)/g) || []).length, 2, 'zatwierdzenie i odrzucenie kasują pliki');
  assert.match(k, /\.from\(PUBLICZNY\)\.upload\(nowy/, 'logo do publicznego dopiero przy zatwierdzeniu');
  const z = k.slice(k.indexOf('body.akcja === "odrzuc"'), k.indexOf('body.akcja === "zatwierdz"'));
  assert.doesNotMatch(z, /PUBLICZNY/, 'odrzucone nigdy nie trafia do publicznego');
  assert.match(czytaj('supabase/functions/_shared/firma-zgloszenie.mjs'), /"image\/png": "png"/);
});

test('migracja: bez dostępu klienta, kubełek prywatny bez polityk, przełącznik wyłączony, cron sprzątania', () => {
  const m = czytaj('supabase/migrations/20261105_akcja_firmy_zgloszenia.sql');
  assert.match(m, /\('firmy-zgloszenia', 'firmy-zgloszenia', false, 2097152, array\['image\/png', 'image\/jpeg', 'image\/webp'\]\)/, 'prywatny, 2 MB, bez SVG');
  assert.doesNotMatch(m.replace(/--[^\n]*/g, '').split('\n').filter((l) => !l.includes('akcja_firmy_do_sprawdzenia')).join('\n'), /to (anon|authenticated)\b/, 'żadnych nadań dla klienta poza samą liczbą dla trenera');
  assert.match(m, /cron\.schedule\('akcja-firmy-sprzatanie'/);
  assert.match(m, /interval '14 days'/); assert.match(m, /a\.koniec \+ 30/);
  assert.match(m, /a\.firmy_zgloszenia and a\.wystartowala_at is not null/, 'przed startem formularz nie działa nawet po włączeniu');
  /* Dostęp klienta i zakres edycji sprawdza po skutku tools/akcja-firmy-zgloszenia-test.sql (kroki 9 i 10) oraz blok asercji w migracji. */
  const s = czytaj('supabase/migrations/20261105_akcja_firmy_szyldy.sql');
  assert.match(s, /add column firmy_zgloszenia boolean not null default false/);
  assert.match(s, /add column prog_domku_zl integer not null default 100/); assert.match(s, /add column prog_wiezowca_zl integer not null default 1000/);
  assert.match(s, /check \(potwierdzenie_widziane = true or wsparcie = 'rzeczowe'\)/, 'Partner akcji bez potwierdzenia, wpłata tylko z potwierdzeniem');
});

test('panel ręczny: wpłata wymaga potwierdzenia, Partner akcji bez progu; edycja wysyła tylko dozwolone kolumny', async () => {
  await zaladuj('js/moderacja.mjs');
  const c = { globalThis: null, URL, BM_MODERACJA: globalThis.BM_MODERACJA }; c.globalThis = c; vm.createContext(c);
  vm.runInContext(czytaj('js/akcja.mjs'), c);
  const A = c.BM_AKCJA, ok = { nazwa: 'MMG', link: 'https://ubraniarobocze.com.pl', zgodaWymienienie: true, rodzaj: 'wiezowiec' };
  assert.match(A.firmaDoZapisu({ ...ok, wsparcie: 'wplata', potwierdzenie: false }).blad, /potwierdzenie wpłaty/);
  const partner = A.firmaDoZapisu({ ...ok, wsparcie: 'rzeczowe', potwierdzenie: false }).wiersz;
  assert.equal(partner.wsparcie, 'rzeczowe'); assert.equal(partner.potwierdzenie_widziane, false); assert.equal(partner.rodzaj, 'wiezowiec');
  assert.equal(A.firmaDoZapisu({ ...ok, wsparcie: 'wplata', potwierdzenie: true }).wiersz.potwierdzenie_widziane, true);
  assert.equal(A.firmaDoZapisu({ ...ok, wsparcie: 'cokolwiek', potwierdzenie: true }).wiersz.wsparcie, 'wplata', 'nieznany typ nie omija potwierdzenia');
  assert.deepEqual(Object.keys(A.firmaDoEdycji(partner)).sort(), ['link', 'nazwa', 'potwierdzenie_widziane', 'rodzaj', 'wsparcie']);
  assert.ok('logo_url' in A.firmaDoEdycji({ ...partner, logo_url: 'x' }), 'nowe logo idzie w edycji');
  const html = A.firmyHtml({ wystartowala: true, imie: 'Fabianek', firmy: [{ nazwa: 'MMG', link: 'https://ubraniarobocze.com.pl', wsparcie: 'rzeczowe' }] });
  assert.match(html, /Partner akcji/);
  const h = czytaj('trener.html');
  const f = h.slice(h.indexOf('<form id="firmy-form"'), h.indexOf('</form>', h.indexOf('<form id="firmy-form"')));
  for (const id of ['firma-nazwa', 'firma-link', 'firma-logo', 'firma-rodzaj', 'firma-wsparcie', 'firma-wymienienie']) assert.match(f, new RegExp('id="' + id + '"'), id);
  assert.match(f, /accept="image\/png,image\/jpeg,image\/webp,application\/pdf"/);
  const start = h.indexOf('/* Firmy wspierające akcję: jeden formularz'), k = h.slice(start, h.indexOf('</script>', start));
  assert.match(k, /\.update\(A\.firmaDoEdycji\(p\.wiersz\)\)\.eq\('id', edycja\.id\)\.select\('id'\)/, 'RLS daje 0 wierszy bez błędu: bez select zapis „udałby się” po cichu');
  assert.match(k, /\.update\(\{ ukryta: !f\.ukryta \}\)\.eq\('id', f\.id\)\.select\('id'\)/);
  assert.match(k, /const stary = wgrany \? plikLogo\(edycja\.logo_url\) : ''/, 'podmiana logo kasuje stary plik dopiero po zapisie');
  assert.doesNotMatch(k, /onclick=|onerror=|onload=/, 'bez JS w atrybutach');
});

test('logo w panelu: PDF po bajtach, pdf.js dopiero po wybraniu i bez eval, biblioteka lokalnie; SVG nie przejdzie', () => {
  const l = bezKomJs(czytaj('js/logo-firmy.mjs'));
  assert.match(l, /await import\(new URL\(KAT_PDF \+ "pdf\.min\.mjs"/, 'dynamicznie: waga panelu bez zmian');
  assert.match(l, /isEvalSupported: false/);
  assert.match(l, /background: "rgba\(0,0,0,0\)"/, 'przezroczyste tło');
  assert.match(l, /BOK = 400/);
  assert.doesNotMatch(l, /svg/i);
  for (const p of ['vendor/pdfjs-4.10.38/pdf.min.mjs', 'vendor/pdfjs-4.10.38/pdf.worker.min.mjs', 'vendor/pdfjs-4.10.38/LICENSE']) assert.ok(fs.existsSync(path.join(KORZEN, p)), p);
  const c = { globalThis: null, URL, Promise }; c.globalThis = c; vm.createContext(c);
  vm.runInContext(czytaj('js/logo-firmy.mjs'), c);
  const r = c.BM_LOGO_FIRMY.rodzajPoBajtach;
  assert.equal(r(new TextEncoder().encode('%PDF-1.7 tresc pliku')), 'pdf');
  assert.equal(r(png(1, 1)), 'obraz'); assert.equal(r(jpeg(1, 1)), 'obraz'); assert.equal(r(webpX(1, 1)), 'obraz');
  assert.equal(r(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), '');
});

test('szyld: logo, a bez niego nazwa; podpis Partner akcji; żadnego innerHTML z danych firmy; wieżowiec głębiej', () => {
  const s = bezKomJs(czytaj('js/ulica-scena.mjs'));
  assert.match(s, /if \(!f\.logo\) \{ szyldNazwa\(sz, f, sw, sh\);/);
  assert.match(s, /im\.onerror = function \(\) \{[\s\S]{0,260}szyldNazwa\(sz, f, sw, sh\)/, 'logo się nie wczyta: nazwa');
  assert.match(s, /el\("div", "us-partner", b, "Partner akcji"\)/);
  assert.match(s, /baza: wiez \? rz\.baza - ZA_DROGA : rz\.baza/, 'za drogą, wyżej niż domki');
  assert.match(s, /el\("button", "us-czolo", ui, "Do czoła budowy"\)/);
  assert.match(s, /U\.domekNaMiejscu\(nrDomku\+\+, f\.nazwa\)/, 'domki rotują');
  assert.match(s, /" zbudowana"/);
  const f = czytaj('js/firma-formularz.mjs'), p = czytaj('js/firmy-panel.mjs');
  assert.doesNotMatch(bezKomJs(f) + bezKomJs(p), /innerHTML/, 'dane z formularza i zgłoszeń tylko przez textContent');
  assert.match(f, /el\("label", "ff-pulapka", f/); assert.match(f, /pp\.name = "strona_www"/);
  assert.match(f, /To podziękowanie, nie reklama\. BiegaMy nie pośredniczy w pieniądzach\./);
  assert.doesNotMatch(f, /@[a-z]+\.[a-z]/, 'adres e-mail tylko z bazy');
  const g = bezKomJs(czytaj('js/cegielki.js'));
  assert.match(g, /firmy = L\.firmyZLicznika\(d\)/);
  assert.match(g, /im\.crossOrigin = "anonymous"/, 'obrazek do udostępnienia nie może się skazić');
  assert.match(g, /k !== "wiezowiec" && !L\.BUDYNKI_POPRZEDNICH\[k\] && !\/\^\(kasia\|filip\|rowerzysta\|dodatek\)_\//, 'grafika budynku poza ładowaniem startowym');
  const c = { globalThis: null, Math }; c.globalThis = c; vm.createContext(c);
  vm.runInContext(czytaj('js/cegielki-logika.mjs'), c);
  const L = c.BM_CEGIELKI, ADR = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/11111111-1111-4111-8111-111111111111.webp';
  const w = Array.from(L.firmyZLicznika({ firmy: [{ nazwa: 'MMG', logo_url: ADR, rodzaj: 'wiezowiec', wsparcie: 'rzeczowe' }, { nazwa: 'Mala', rodzaj: 'cegielka' }, { nazwa: 'Obce', logo_url: 'https://zly.example/x.png' }, null] }));
  assert.equal(w.length, 2, 'cegiełka firmy nie stoi przy trasie');
  assert.equal(w[0].logo, ADR); assert.equal(w[0].partner, true); assert.equal(w[0].rodzaj, 'wiezowiec');
  assert.equal(w[1].logo, '', 'obcy adres logo odpada'); assert.equal(w[1].rodzaj, 'domek');
});

test('Centrum Akcji na Dziś: bez pełnej sceny, kafle, film dopiero po dotknięciu; polityka opisuje zgłoszenia firm i ślad GPS wyprawy po polsku i angielsku', () => {
  const a = bezKomJs(czytaj('js/akcja.mjs'));
  const karta = a.slice(a.indexOf('function kartaDzisHtml'), a.indexOf('var kafle ='));
  assert.doesNotMatch(karta, /ulica-scena/, 'Dziś bez pełnej sceny');
  for (const tekst of ['Mapa wyprawy', 'Zagraj w Cegiełki', 'Wpłać na zbiórkę', 'Twoja firma na ulicy', 'Zobacz film', 'Twój wkład']) assert.ok(a.includes(tekst), tekst);
  assert.match(a, /var f = _filmKarty; if \(!f \|\| !f\.mp4\) return;/);
  assert.match(a, /v\.src = f\.mp4/);
  for (const [plik, slowa] of [['privacy.html', ['id="firmy"', '14 dniach', '30 dni po zakończeniu akcji', 'Z telefonu nie zbieramy dokładnej lokalizacji GPS', 'wyłącznie u uczestników wyprawy']], ['privacy-en.html', ['id="firmy"', '14 days', '30 days after the campaign ends', "We don't collect precise GPS location from your phone", 'only for expedition participants']]]) {
    const t = czytaj(plik);
    for (const s of slowa) assert.ok(t.includes(s), plik + ': ' + s);
    assert.doesNotMatch(t, /Nie zbieramy dokładnej lokalizacji GPS|No GPS\./, plik + ': stare zdanie przeczyło mapie wyprawy');
  }
});

test('logo z pustym tłem: panel przycina biały i przezroczysty margines, biel w środku zostaje', () => {
  const s = czytaj('js/logo-firmy.mjs');
  assert.match(s, /\} else k = bezPustegoMarginesu\(await obrazNaCanvas\(plik\)\);/);
  assert.match(s, /d\[i \+ 3\] > PROG_ALFA && Math\.min\(d\[i\], d\[i \+ 1\], d\[i \+ 2\]\) < 245/);
  assert.match(s, /if \(x1 < 0\) return k;/, 'całe białe logo nie jest błędem');
});

