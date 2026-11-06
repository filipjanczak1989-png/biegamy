/* BLIZNA 191 / OSTATNIA PROSTA (6.11 wieczór, przed startem 7.11 06:00).
   1. LOGO „NIE DA SIĘ ODCZYTAĆ”: formularz na stronie akcji odrzucał każdy plik powyżej 2 MB (zdjęcie z telefonu), SVG i HEIC, a podgląd z cf577754
      połykał prawdziwy powód i zawsze pisał „Tego logo nie da się odczytać” (odtworzone w Chrome na kodzie z produkcji: JPG 4,9 MB, SVG, HEIC → ten sam napis).
      Teraz formularz i panel trenera mają JEDNO przygotowanie logo (js/logo-firmy.mjs): PNG, JPG, WebP, GIF, AVIF, SVG, zdjęcie do 25 MB z obrotem EXIF → WebP ≤ 400 px
      (granica funkcji firma-zgloszenie), przezroczystość zostaje; zły plik = komunikat z tym, co zrobić („Wyślij logo jako PNG lub JPG”); gdy samo przygotowanie padnie,
      PNG/JPG/WebP do 2 MB idzie jako oryginał (funkcja na serwerze sama go zmniejszy, trener zobaczy plik).
   2. PANEL TRENERA: przy każdej zatwierdzonej firmie (z próby też) i każdym wpisie w murze „Edytuj” i „Usuń z Ulicy” z własnym okienkiem (js/okienko-panelu.js),
      bez window.confirm i prompt. Bez migracji: wpis w murze edytuje się jako nowy wpis + skasowanie starego (baza daje trenerowi INSERT i DELETE, nie UPDATE).
      Usunięcie z Ulicy nie rusza licznika km: licznik liczy ślad wyprawy i treningi, nie firmy i nie mur.
   Po skutku (Chrome, poza repo, ~/.cache/bm-wydajnosc/logo-pliki.js): te same pliki z tests/_dane/logo i JPG 14,9 MB przez prawdziwy formularz, wysyłkę, okienko
   i panel trenera na atrapie bazy. Prawdziwego HEIC nie ma czym zrobić na tej maszynie: plik w _dane to sam nagłówek, sprawdza komunikat, nie dekodowanie w Safari. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const plik = (n) => new Uint8Array(fs.readFileSync(path.join(KORZEN, 'tests/_dane/logo', n)));

function logoFirmy() {
  const c = { URL, Promise, Uint8Array, TextDecoder }; c.globalThis = c; vm.createContext(c);
  vm.runInContext(czytaj('js/logo-firmy.mjs'), c);
  return c.BM_LOGO_FIRMY;
}
function udawanyPlik(bajty, typ, rozmiar) {
  return { type: typ || '', name: 'logo', size: rozmiar == null ? bajty.length : rozmiar, arrayBuffer: () => Promise.resolve(bajty.buffer.slice(bajty.byteOffset, bajty.byteOffset + bajty.length)), slice: (a, b) => ({ arrayBuffer: () => Promise.resolve(bajty.slice(a, b).buffer) }) };
}
function formularz(przygotuj) {
  const c = { Promise, Uint8Array, BM_LOGO_FIRMY: przygotuj ? { przygotuj } : undefined }; c.globalThis = c; vm.createContext(c);
  vm.runInContext(czytaj('js/firma-formularz.mjs'), c);
  return c.BM_FIRMA_FORMULARZ;
}
function orientacjaExif(b) {
  for (let i = 2; i < b.length - 10;) {
    if (b[i] !== 0xff) return null;
    const znak = b[i + 1], dl = (b[i + 2] << 8) | b[i + 3];
    if (znak === 0xe1 && String.fromCharCode(...b.slice(i + 4, i + 8)) === 'Exif') {
      const t = i + 10, le = b[t] === 0x49, u16 = (o) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]), u32 = (o) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
      const ifd = t + u32(t + 4), n = u16(ifd);
      for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (u16(e) === 0x0112) return u16(e + 8); }
      return null;
    }
    i += 2 + dl;
  }
  return null;
}

test('logo: prawdziwe pliki rozpoznane po bajtach (PNG z alfą, JPG z obrotem EXIF, SVG, PDF, zły plik, HEIC)', () => {
  const r = logoFirmy().rodzajPoBajtach;
  const png = plik('przezroczyste.png'), jpg = plik('obrot-exif.jpg');
  assert.equal(r(png), 'obraz'); assert.equal(png[25], 6, 'PNG RGBA: przezroczystość w pliku');
  assert.equal(r(jpg), 'obraz'); assert.equal(orientacjaExif(jpg), 6, 'JPG zapisany poziomo, wyświetlany pionowo');
  assert.equal(r(plik('logo.svg')), 'svg');
  assert.equal(r(plik('zly.pdf')), 'pdf');
  assert.equal(r(plik('zly-tekst.png')), '', 'tekst z rozszerzeniem png to nie obraz');
  assert.equal(r(plik('heic-naglowek.heic')), 'heic');
  assert.equal(r(new TextEncoder().encode('﻿<!-- logo --><svg viewBox="0 0 1 1"></svg>')), 'svg', 'SVG z BOM i komentarzem');
});

test('logo: każdy odrzucony plik mówi, co zrobić; formularz nie przyjmuje PDF, panel przyjmuje', async () => {
  const L = logoFirmy(), PROSBA = /Wyślij logo jako PNG lub JPG\./;
  await assert.rejects(L.przygotuj(udawanyPlik(plik('zly.pdf'), 'application/pdf'), { pdf: false }), (e) => /^Logo: to plik PDF\. /.test(e.message) && PROSBA.test(e.message), 'formularz odrzuca PDF od razu, bez pdf.js');
  await assert.rejects(L.przygotuj(udawanyPlik(plik('przezroczyste.png'), 'image/png', 26 * 1024 * 1024)), (e) => /25 MB/.test(e.message) && PROSBA.test(e.message));
  await assert.rejects(L.przygotuj(udawanyPlik(new Uint8Array(0), 'image/png')), /wybierz plik/);
  const s = czytaj('js/logo-firmy.mjs');
  assert.match(s, /BOK = 400/, '400 px: więcej funkcja firma-zgloszenie nie przyjmie w WebP');
  assert.match(s, /WEJSCIE_MAKS = 25 \* 1024 \* 1024/, 'zdjęcie z telefonu 5–15 MB wchodzi');
  assert.match(s, /sk = Math\.min\(1, ETAP_BOK \/ Math\.max\(sw, sh\)\)/, 'duże zdjęcie od razu do mniejszego canvasu (pamięć telefonu)');
  assert.match(s, /"Logo: zdjęcia HEIC ta przeglądarka nie otworzy\. " \+ PROSBA \+ " Wystarczy zrzut ekranu z logo\."/);
  assert.match(s, /"Logo: tego pliku nie da się otworzyć jako obrazu\. " \+ PROSBA/);
  for (const n of ['przezroczyste.png', 'obrot-exif.jpg', 'logo.svg', 'zly.pdf', 'zly-tekst.png', 'heic-naglowek.heic']) assert.ok(plik(n).length < 4096, n + ': mały plik w repo');
});

test('formularz: to samo przygotowanie co panel; gdy padnie, oryginał PNG/JPG/WebP do 2 MB idzie dalej', async () => {
  const wynik = { blob: 'WEBP' };
  assert.equal(await formularz(() => Promise.resolve(wynik)).logoDoWyslania(udawanyPlik(plik('przezroczyste.png'), 'image/png')), 'WEBP');
  let opcje = null;
  await formularz((p, o) => { opcje = o; return Promise.resolve(wynik); }).logoDoWyslania(udawanyPlik(plik('logo.svg'), 'image/svg+xml'));
  assert.deepEqual(JSON.parse(JSON.stringify(opcje)), { pdf: false }, 'bez PDF na stronie akcji');
  const pada = () => Promise.reject(new Error('Logo: awaria canvasu.'));
  const png = udawanyPlik(plik('przezroczyste.png'), '');
  assert.equal(await formularz(pada).logoDoWyslania(png), png, 'PNG bez typu z telefonu: oryginał');
  assert.equal(await formularz(pada).logoDoWyslania(udawanyPlik(plik('obrot-exif.jpg'), 'image/jpeg')).then((x) => x.type), 'image/jpeg');
  await assert.rejects(formularz(pada).logoDoWyslania(udawanyPlik(plik('przezroczyste.png'), 'image/png', 3 * 1024 * 1024)), /awaria canvasu/, 'ponad 2 MB serwer nie przyjmie');
  await assert.rejects(formularz(pada).logoDoWyslania(udawanyPlik(plik('zly.pdf'), 'application/pdf')), /awaria canvasu/);
  await assert.rejects(formularz(null).logoDoWyslania(udawanyPlik(plik('logo.svg'), 'image/svg+xml')), /Wyślij logo jako PNG lub JPG/, 'moduł się nie wczytał: komunikat, nie cisza');
});

test('formularz: prawdziwy powód zamiast „nie da się odczytać”, pole przyjmuje zdjęcia, moduł wczytany przed formularzem', () => {
  const F = czytaj('js/firma-formularz.mjs'), H = czytaj('dla-fabianka.html');
  assert.doesNotMatch(F, /Tego logo nie da się odczytać/);
  assert.doesNotMatch(F, /plik\.type\)\) return zle|Logo: plik do 2 MB/, 'bez blokady po typie i 2 MB przed przygotowaniem');
  assert.match(F, /pole\("ff-logo", "Logo: PNG, JPG, WebP, SVG albo zdjęcie z telefonu", "file", \{ accept: "image\/\*" \}\)/);
  assert.match(F, /podRada\.textContent = bladLogo;/, 'błąd logo widać od razu, także bez sceny Ulicy');
  assert.match(F, /"Podgląd logo się nie wyświetlił, ale zgłoszenie możesz wysłać: organizator zobaczy plik\."/, 'awaria samego podglądu nie blokuje');
  assert.ok(H.indexOf('<script defer src="js/logo-firmy.mjs"></script>') > 0 && H.indexOf('<script defer src="js/logo-firmy.mjs"></script>') < H.indexOf('<script defer src="js/firma-formularz.mjs"></script>'));
  const sub = F.slice(F.indexOf('f.addEventListener("submit"'));
  assert.match(sub, /e2\.message && \/\^Logo\/\.test\(e2\.message\) \? e2\.message/, 'przy wysyłce ten sam komunikat');
});

test('panel trenera: własne okienko zamiast window.confirm i prompt (firmy, zgłoszenia, mur)', () => {
  const T = czytaj('trener.html'), U = czytaj('js/ulica.mjs'), P = czytaj('js/firmy-panel.mjs'), O = czytaj('js/okienko-panelu.js');
  const edytor = T.slice(T.indexOf('/* Firmy wspierające akcję: jeden formularz'), T.indexOf('</script>', T.indexOf('/* Firmy wspierające akcję: jeden formularz')));
  const panel = U.slice(U.indexOf('function panelTrenera('), U.indexOf('g.BM_ULICA = {'));
  for (const [n, k] of [['edytor firm', edytor], ['mur w panelu', panel], ['zgłoszenia', P]]) assert.doesNotMatch(k.replace(/\/\*[\s\S]*?\*\//g, ''), /confirm\(|prompt\(/, n);
  const i = T.indexOf('<script src="js/okienko-panelu.js"></script>');
  assert.ok(i > 0 && i < T.indexOf('<script src="js/firmy-panel.mjs" defer></script>') && i < T.indexOf('<script src="js/ulica.mjs"></script>'), 'okienko wczytane przed panelami');
  assert.match(O, /g\.BM_OKIENKO = okienko;/);
  assert.doesNotMatch(O, /innerHTML/, 'nazwy firm i imiona tylko przez textContent');
  assert.match(O, /if \(e\.key === "Escape"\) \{ e\.preventDefault\(\); zamknij\(null\); \}/);
  assert.match(O, /tlo\.addEventListener\("click", function \(e\) \{ if \(e\.target === tlo\) zamknij\(null\); \}\);/);
  assert.match(O, /z-index:500/, 'nad nakładką zgłoszeń (400) i dolnym paskiem (310)');
});

test('Usuń z Ulicy i Edytuj: firmy obu akcji, zatwierdzone z próby, wpisy w murze bez migracji', () => {
  const T = czytaj('trener.html'), U = czytaj('js/ulica.mjs'), P = czytaj('js/firmy-panel.mjs');
  assert.match(T, /SLUGI = \['dla-fabianka', 'proba'\]/);
  assert.match(T, /\.in\('akcja_slug', SLUGI\)\.order\('akcja_slug'\)/);
  assert.match(T, /f\.akcja_slug === 'proba' \? 'PRÓBA' : ''/);
  const us = T.slice(T.indexOf('async function usunFirme(f)'), T.indexOf("return 'usunieta';", T.indexOf('async function usunFirme(f)')));
  assert.match(us, /window\.BM_OKIENKO\(\{ tytul: 'Usunąć z Ulicy\?'[\s\S]{0,300}Licznik kilometrów się nie zmienia\.', tak: 'Usuń z Ulicy', grozne: true \}\)/);
  assert.match(us, /sb\.from\('akcja_firmy'\)\.delete\(\)\.eq\('id', f\.id\)\.select\('id'\)/, 'RLS daje 0 wierszy bez błędu: bez select „udałoby się” po cichu');
  assert.match(us, /sb\.storage\.from\(A\.BUCKET_LOGO\)\.remove\(\[plik\]\)/);
  assert.doesNotMatch(us, /rpc\(|akcje|licznik|training_logs/, 'tylko tabela firm i plik logo');
  assert.match(T, /window\.BM_USUN_FIRME = async function \(nazwa, proba\)/);
  assert.match(T, /if \(pasujace\.length > 1\)/, 'kilka firm o tej nazwie: nic nie zgadujemy');
  assert.match(P, /if \(z\.status === "zatwierdzone"\) \{/, 'z próby też');
  assert.match(P, /g\.BM_USUN_FIRME\(z\.nazwa, !!z\.proba\)/);
  const w = U.slice(U.indexOf('function wierszCegielki'), U.indexOf('async function wczytajCegielki'));
  const ins = w.indexOf('sb.from("akcja_cegielki").insert(Object.assign({ akcja_slug: SLUG_PANELU }, p.wiersz)).select("id")'), del = w.indexOf('sb.from("akcja_cegielki").delete().eq("id", c.id).select("id")');
  assert.ok(ins > 0 && del > ins, 'edycja: najpierw nowy wpis, potem skasowanie starego (awaria w środku nie gubi wpisu)');
  assert.match(w, /Licznik kilometrów akcji się nie zmienia\./);
  assert.doesNotMatch(w, /\.update\(|ukryta/, 'baza nie daje trenerowi UPDATE ani kolumny ukryta');
});

test('licznik km akcji nie zależy od firm ani muru', () => {
  const L = czytaj('supabase/schema/funkcje/akcja_licznik.sql');
  const km = L.slice(L.indexOf('v_suma :='), L.indexOf('v_dotarla :='));
  assert.ok(km.length > 200, 'fragment liczący km');
  assert.doesNotMatch(km, /akcja_firmy|akcja_cegielki|akcja_firmy_zgloszenia/);
  const okno = path.join(KORZEN, 'supabase/schema/funkcje/akcja_km_okna.sql');
  if (fs.existsSync(okno)) assert.doesNotMatch(fs.readFileSync(okno, 'utf8'), /akcja_firmy|akcja_cegielki/);
});
