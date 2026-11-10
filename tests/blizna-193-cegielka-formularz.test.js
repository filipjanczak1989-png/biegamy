/* BLIZNA 193 / CEGIEŁKA OD OSOBY PRYWATNEJ: FORMULARZ I PANEL (Filip 6.11 wieczór). Funkcja i migracja: blizna-192.
   - formularz: na górze „Osoba prywatna: cegiełka w murze” / „Firma: budynek na Ulicy”, domyślnie osoba; imię (te same reguły co panel, funkcja i baza), zgoda na imię
     z podglądem cegły, zrzut, e-mail nieobowiązkowy, bez logo, linku i progu; zrzut (osoba i firma) do 1600 px w przeglądarce, więc limit 2 MB nie odrzuca zdjęć z aparatu;
   - panel: CEGIEŁKA, zgoda na imię, sam zrzut; zatwierdzona cegiełka odsyła do „Ulica akcji”; mur w panelu z próbą (PRÓBA), edycja zostaje w akcji wpisu.
   Po skutku: Chrome (~/.cache/bm-wydajnosc/cegielka.js): formularz z JPG 14,9 MB jako zrzutem, wysyłka osoby i firmy, panel z pushem, zatwierdzeniem i murem próby. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const PNG = () => { const b = new Uint8Array(40); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); new DataView(b.buffer).setUint32(16, 900); new DataView(b.buffer).setUint32(20, 1600); return b; };

test('imię do muru: jedna reguła w czterech miejscach (formularz, panel, funkcja, baza)', async () => {
  const F = czytaj('js/firma-formularz.mjs'), U = czytaj('js/ulica.mjs'), E = await zaladuj('supabase/functions/_shared/firma-zgloszenie.mjs'), S = czytaj('supabase/migrations/20261107_akcja_cegielka_zgloszenia.sql');
  const zF = /var RE_IMIE = (\/.*\/);/.exec(F)[1], zU = /var RE_IMIE = (\/.*\/);/.exec(U)[1];
  assert.equal(zF, zU, 'formularz = panel');
  assert.equal(zF, String(E.RE_IMIE), 'formularz = funkcja');
  const klasa = /\[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ\]\+\(\?:-\[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ\]\+\)\?/;
  assert.match(zF, klasa);
  assert.match(S, /char_length\(nazwa\) between 2 and 20 and nazwa ~ '\^\[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ\]\+\(-\[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ\]\+\)\?\$'/, 'baza: to samo co CHECK akcja_cegielki_jedno_imie');
  for (const t of ['Ania', 'Anna-Maria', 'Łucja', 'Zoë']) assert.ok(E.RE_IMIE.test(t), t);
  for (const t of ['Anna Maria', 'A', 'Ola1', 'Anna-Maria-Zofia', 'abcdefghijklmnopqrstu']) assert.ok(!E.RE_IMIE.test(t), t);
});

test('formularz: osoba albo firma; osoba wysyła imię, zgodę i zrzut, bez logo i linku; zrzut z aparatu przygotowany w przeglądarce', async () => {
  const F = czytaj('js/firma-formularz.mjs');
  assert.match(F, /opcja\("osoba", "Osoba prywatna: cegiełka w murze"\), kFirma = opcja\("firma", "Firma: budynek na Ulicy"\);\n\s+kOsoba\.checked = true;/);
  const os = F.slice(F.indexOf('if (kOsoba.checked) {\n        var im'), F.indexOf('} else {\n        var n = nazwa'));
  assert.match(os, /dane\.append\("rodzaj", "cegielka"\); dane\.append\("imie", im\); if \(zgodaImie\.checked\) dane\.append\("zgoda_imie", "tak"\);/);
  assert.doesNotMatch(os, /"logo"|"link"|prog/, 'osoba bez logo, linku i progu');
  assert.match(os, /if \(kw\) dane\.append\("kwota", kw\);/, '9.11: kwota osoby nieobowiązkowa (złota cegła od 100 zł, blizna-200)');
  assert.match(os, /M\.sprawdz\(im, \{ rodzaj: "imie" \}\)/, 'filtr imion jak w panelu');
  assert.match(os, /przygotowany\("zrzut", zrzut\.files\[0\], zrzutDoWyslania\)/);   // od A2 (10.11, blizna-208): przez bramkę przygotowany()
  assert.match(F, /pole\("ff-zrzut", "Zrzut albo zdjęcie potwierdzenia wpłaty\. Zamaż numer konta\.", "file", \{ accept: "image\/\*" \}\)/);
  assert.doesNotMatch(F, /Zrzut wpłaty: plik do 2 MB|zrzut\.files\[0\]\.type/, 'bez blokady 2 MB i typu przed przygotowaniem');
  assert.match(F, /U\.podgladCegly\(podCegly, ok \? im : "", zgodaImie\.checked\)/, 'podgląd cegły: bez zgody cegła bez imienia, jak w murze');
  assert.match(F, /if \(wlaczone\) formularz\(s, d\); else cegielka\(s, adres\);/, 'osobny podgląd cegiełki tylko bez formularza');
  /* zrzutDoWyslania: przygotowanie, a gdy padnie, kopia bajtów PNG/JPG/WebP do 2 MB (nigdy plik z dysku, blizna-212) */
  const uruchom = (L) => { const c = { Promise, Uint8Array, Blob, BM_LOGO_FIRMY: L }; c.globalThis = c; vm.createContext(c); vm.runInContext(czytaj('js/firma-formularz.mjs'), c); return c.BM_FIRMA_FORMULARZ; };
  const png = PNG(), p = { size: png.length, arrayBuffer: () => Promise.resolve(png.buffer.slice(0)) };
  assert.equal(await uruchom({ przygotujZrzut: () => Promise.resolve('WEBP') }).zrzutDoWyslania(p), 'WEBP');
  const kopia = await uruchom({ przygotujZrzut: () => Promise.reject(new Error('Zrzut wpłaty: x')) }).zrzutDoWyslania(p);
  assert.notEqual(kopia, p, 'droga awaryjna: kopia w pamięci'); assert.equal(kopia.type, 'image/png'); assert.equal(kopia.size, png.length);
  await assert.rejects(uruchom({ przygotujZrzut: () => Promise.reject(new Error('Zrzut wpłaty: x')) }).zrzutDoWyslania({ ...p, size: 3 * 1024 * 1024 }), /Zrzut wpłaty: x/);
  await assert.rejects(uruchom(undefined).zrzutDoWyslania({ size: 5, arrayBuffer: () => Promise.resolve(new Uint8Array(5).buffer) }), /Zrób zrzut ekranu/);
  assert.equal(uruchom(undefined).poprawneImie('Anna-Maria'), true);
});

test('zrzut w przeglądarce: do 1600 px, białe tło, bez przycinania, poniżej 2 MB; PDF i za duży plik z komunikatem', async () => {
  const s = czytaj('js/logo-firmy.mjs');
  assert.match(s, /ZRZUT_BOK = 1600, ZRZUT_MAKS = 2 \* 1024 \* 1024 - 64 \* 1024/);
  const fz = s.slice(s.indexOf('async function przygotujZrzut('), s.indexOf('g.BM_LOGO_FIRMY = {'));
  assert.match(fz, /obrazNaCanvas\(plik, bajty, rodzaj, ZRZUT_BOK\)/);
  assert.doesNotMatch(fz, /bezPustegoMarginesu|przytnij|bezBialegoTla/, 'potwierdzenie to dokument: nic nie wycinamy');
  assert.match(fz, /c\.fillStyle = "#fff"/);
  assert.match(fz, /w\.size <= ZRZUT_MAKS/);
  const c = { URL, Promise, Uint8Array, TextDecoder }; c.globalThis = c; vm.createContext(c);
  vm.runInContext(s, c);
  const L = c.BM_LOGO_FIRMY, pdf = new TextEncoder().encode('%PDF-1.4 potwierdzenie przelewu');
  const udaj = (b, size) => ({ type: '', name: 'x', size: size == null ? b.length : size, arrayBuffer: () => Promise.resolve(b.buffer) });
  await assert.rejects(L.przygotujZrzut(udaj(pdf)), /^Error: Zrzut wpłaty: to plik PDF\. Zrób zrzut ekranu potwierdzenia/);
  await assert.rejects(L.przygotujZrzut(udaj(pdf, 26 * 1024 * 1024)), /ponad 25 MB/);
  await assert.rejects(L.przygotujZrzut(udaj(new Uint8Array(0))), /wybierz plik/);
});

test('panel zgłoszeń: CEGIEŁKA, zgoda na imię, sam zrzut; zatwierdzona cegiełka odsyła do muru, nie do edytora firm', () => {
  const P = czytaj('js/firmy-panel.mjs'), U = czytaj('js/ulica.mjs');
  assert.match(P, /var cegla = z\.rodzaj === "cegielka";/);
  assert.match(P, /if \(cegla\) el\("div", "[^"]*", ramka, "CEGIEŁKA"\);/);
  assert.match(P, /z\.zgoda_na_wymienienie \? "Imię w murze: tak, osoba się zgodziła" : "Bez zgody na imię: cegła stanie bez imienia"/);
  assert.match(P, /\(cegla \? \[\] : \[\["Logo", z\.logo_adres/, 'przy cegiełce bez pola logo');
  const zc = P.slice(P.indexOf('if (z.status === "zatwierdzone" && cegla) {'), P.indexOf('if (z.status === "zatwierdzone" && !cegla) {'));
  assert.ok(zc.length > 100);
  assert.doesNotMatch(zc, /BM_USUN_FIRME|BM_EDYTUJ_FIRME/, 'imię osoby nie trafia do edytora ani kasowania firm');
  assert.match(zc, /getElementById\("ulica-sec"\)/);
  assert.match(P, /"Zgłoszenia do sprawdzenia \(firmy i cegiełki\): " \+ n/);
  assert.match(U, /\(c\.akcja_slug === "proba" \? "PRÓBA · " : ""\) \+ c\.imie/, 'mur próby oznaczony w panelu');
  assert.match(U, /akcja_slug: c\.akcja_slug \|\| SLUG_PANELU/, 'edycja zostaje w akcji wpisu (próba nie przechodzi do prawdziwego muru)');
});
