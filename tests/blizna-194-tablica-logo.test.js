/* BLIZNA 194 / TABLICA Z LOGO (Filip 6.11 wieczór, przed startem 7.11). Firmy płacą za domek i wieżowiec, więc logo ma być widać, a nazwa zawsze czytelna.
   - szyld nad drzwiami = zawsze nazwa firmy (jedna albo dwie linie; gdy nie mieści się na namalowanej desce, większa drewniana deska w tym samym miejscu); logo nigdy na szyldzie;
   - logo na kwadratowej tablicy: domek nad dachem na dwóch słupkach za kalenicą (bok 55 % szerokości), wieżowiec na elewacji pod szyldem
     (wariant na dachu odrzucony: wieżowiec sięga góry sceny, z tablicy 76 px widać 0 px; zrzuty w Downloads/biegamy-podglady/domki-wiezowiec-warianty.png);
   - drewniana ramka jak szyld, mata dobrana do jasności logo (jasne → #2a2a2a, ciemne → #f6f1e7; JPG bez przezroczystości → kolor brzegu, bez „naklejki”;
     awaria odczytu → kremowa), logo z marginesem 10 % i contain; logo się nie wczyta → tablicy nie ma, nazwa i tak stoi;
   - ta sama funkcja rysuje podgląd w formularzu (1:1 z Ulicą); budynki partnerów i dymek z plakatem bez zmian; domek BiegaMy bez tablicy;
   - formularz: błędy rozdzielone (komunikat funkcji, kod HTTP, brak połączenia z nazwą błędu, awaria przygotowania plików).
   Po skutku: Chrome 412 px (~/.cache/bm-wydajnosc/domki.js): 16 budynków z logo jasnym, ciemnym, przezroczystym, poziomym, pionowym, JPG na białym i czarnym tle,
   długie nazwy, Ulica z 3 firmami, podgląd = Ulica, trzy rodzaje błędów. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const S = czytaj('js/ulica-scena.mjs'), U = czytaj('js/ulica.mjs'), F = czytaj('js/firma-formularz.mjs');

/* ciemnaMata na sztucznym canvasie: piksele 32×32 z funkcji (x, y) → [r, g, b, a] */
function ciemnaMata(piksel, wywal) {
  const c = { Math, Array, Object, String, Number, JSON, isNaN };
  c.globalThis = c; c.window = c;
  c.document = { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => { if (wywal) throw new Error('SecurityError: tainted'); const d = new Uint8ClampedArray(32 * 32 * 4); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) d.set(piksel(x, y), (y * 32 + x) * 4); return { data: d }; } }) }) };
  vm.createContext(c);
  const kod = U.slice(U.indexOf('  function ciemnaMata(im) {'), U.indexOf('  /** Podpowiedź do logo w podglądzie formularza firmy'));
  vm.runInContext('var g = globalThis;\n' + kod + '\nglobalThis.wynik = ciemnaMata({});', c);
  return c.wynik;
}
const srodek = (x, y) => x >= 8 && x < 24 && y >= 8 && y < 24;

test('mata: jasne logo na ciemnej, ciemne na kremowej, JPG wg brzegu, awaria odczytu i puste logo na kremowej', () => {
  assert.equal(ciemnaMata((x, y) => (srodek(x, y) ? [255, 255, 255, 255] : [0, 0, 0, 0])), true, 'białe logo na przezroczystym tle');
  assert.equal(ciemnaMata((x, y) => (srodek(x, y) ? [20, 28, 60, 255] : [0, 0, 0, 0])), false, 'granatowe logo na przezroczystym tle');
  assert.equal(ciemnaMata((x, y) => (srodek(x, y) ? [232, 86, 30, 255] : [0, 0, 0, 0])), false, 'kolorowe średnie (L < 0,6)');
  assert.equal(ciemnaMata((x, y) => (srodek(x, y) && y === 16 ? [30, 60, 140, 255] : [255, 255, 255, 255])), false, 'JPG: ciemny napis na białym tle → kremowa (bez białej naklejki na czarnym)');
  assert.equal(ciemnaMata((x, y) => (srodek(x, y) ? [255, 210, 60, 255] : [18, 18, 22, 255])), true, 'JPG: jasny napis na czarnym tle → ciemna');
  assert.equal(ciemnaMata(() => [0, 0, 0, 0]), false, 'całe przezroczyste → kremowa');
  assert.equal(ciemnaMata(() => [255, 255, 255, 255], true), false, 'obraz bez CORS (getImageData rzuca) → kremowa');
  assert.match(U, /ciemnaMata: ciemnaMata,/, 'scena bierze funkcję z BM_ULICA');
});

test('budynek firmy: szyld = nazwa, logo tylko na tablicy; partnerzy i dymek bez zmian', () => {
  const b = S.slice(S.indexOf('function budynekFirmy('), S.indexOf('/** Cegła w murze'));
  assert.match(b, /poprz = !!U\.BUDYNKI_POPRZEDNICH\[f\.rodzaj\]/);
  assert.match(b, /if \(poprz\) \{\n\s*dolSzyldu = szyldZNazwa\(U, b, f, r, w, false, h0, 0\.5\);\n\s*if \(f\.logo \|\| f\.pustaTablica\) tablicaZLogo\(U, b, oprawa, f, w, h0, false, laduj, naLogo, def\.tablica\);/, 'od B2 (10.11): osiedle, galeria, fabryka z tą samą tablicą, kotwica z SZYLDY (blizna-209)');
  /* 9.11 (blizna-205): pusta tablica tylko z flagą pustaTablica, którą ustawia wyłącznie podgląd w formularzu; Ulica bez logo dalej bez tablicy */
  assert.match(b, /dolSzyldu = szyldZNazwa\(U, b, f, r, w, wyb\.nazwa === "wiezowiec", h0\);\n\s+if \(f\.logo \|\| f\.pustaTablica\) tablicaZLogo\(U, b, oprawa, f, w, h0, wyb\.nazwa === "wiezowiec", laduj, naLogo\);/);
  assert.equal(S.split('pustaTablica: true').length - 1, 1, 'pustą tablicę włącza tylko podgląd');
  const sz = S.slice(S.indexOf('function szyldZNazwa('), S.indexOf('/* TABLICA Z LOGO'));
  assert.doesNotMatch(sz, /img|logo/i, 'na szyldzie nigdy logo');
  assert.match(S, /function dymek\(nad, tytul, link, karta\)/); assert.match(S, /if \(karta && karta\.plakatTekst\) el\("span", "", b, karta\.plakatTekst\);/, 'plakat w dymku bez zmian');
  assert.equal(S.split('.us-slupek{').length - 1, 1, 'klasa słupka przy starcie drogi nietknięta');
  assert.match(S, /var sl = el\("div", "us-bilbord-slupek"\);/, 'słupki tablicy mają własną klasę (us-slupek to słupek z kilometrami)');
  assert.equal(S.split('.us-tablica{').length - 1, 1, 'tablica START nietknięta (us-tablica to szyld startu, nie tablica firmy)');
  assert.equal(S.split('.us-bilbord{').length - 1, 1);
  assert.doesNotMatch(S.slice(S.indexOf('function tablicaZLogo('), S.indexOf('/** Budynek firmy:')), /"us-tablica|us-slupek"/, 'tablica firmy nie używa cudzych klas');
});

test('tablica: domek nad dachem na słupkach za kalenicą, wieżowiec na elewacji; ramka, mata, margines 10 %, contain', () => {
  assert.match(S, /var TABLICA = \{ bok: 0\.55, nadDachem: 0\.04, slupek: 0\.035, rozstaw: 0\.6, wDach: 0\.28, wiezBok: 0\.64, wiezGora: 0\.282 \};/);
  const t = S.slice(S.indexOf('function tablicaZLogo('), S.indexOf('/** Budynek firmy:'));
  const geo = S.slice(S.indexOf('function geometriaTablicy('), S.indexOf('function tablicaZLogo('));   // od B2 (10.11): geometria w czystej funkcji (blizna-209)
  assert.match(geo, /if \(wiez\) \{ var bw = Math\.round\(w \* TABLICA\.wiezBok\); return \{ bok: bw, lewo: \(w - bw\) \/ 2, gora: h0 \* TABLICA\.wiezGora, slupki: \[\] \}; \}/, 'wieżowiec: na elewacji, bez słupków');
  assert.match(geo, /gora = -\(bok \+ w \* \(k\.nadDachem == null \? TABLICA\.nadDachem : k\.nadDachem\)\)/, 'domek: nad dachem');
  assert.match(t, /b\.insertBefore\(sl, oprawa\);/, 'słupki przed obrazem budynku: dach zasłania ich dół');
  assert.match(t, /im\.setAttribute\("crossorigin", "anonymous"\);[\s\S]*laduj\(im, f\.logo\);/, 'crossOrigin przed adresem');
  assert.match(t, /im\.onerror = function \(\) \{\n\s+slupki\.concat\(\[t\]\)\.forEach/, 'logo się nie wczyta: tablicy nie ma');
  assert.match(t, /t\.style\.width = bok \+ "px"; t\.style\.height = bok \+ "px";/, 'kwadrat');
  const css = (k) => (new RegExp('\\.' + k + '\\{([^}]*)\\}').exec(S) || [])[1] || '';
  assert.match(css('us-bilbord'), /padding:4px;border:1\.5px solid #5a2e0e/, 'ramka 4 px w drewnie, obrys jak szyld');
  assert.match(css('us-bilbord-mata'), /padding:10%;[\s\S]*background:#f6f1e7/);
  assert.match(css('us-bilbord-mata--ciemna'), /background:#2a2a2a/);
  assert.match(css('us-bilbord-logo'), /object-fit:contain/); assert.doesNotMatch(css('us-bilbord-logo'), /cover|fill/);
  assert.match(S, /function podgladFirmy\(kontener, f, naLogo\) \{[\s\S]{0,1100}budynekFirmy\(U, k\.ulica, fp, wiez/, 'podgląd w formularzu: ta sama funkcja');
  assert.match(S, /budynekFirmy\(U, k\.ulica, \{ nazwa: "BiegaMy", rodzaj: "domek" \}/, 'sąsiad BiegaMy bez logo, więc bez tablicy');
});

test('szyld z nazwą: jedna linia, dwie linie, bardzo długa z wielokropkiem', () => {
  const kod = S.slice(S.indexOf('  function napisDeski('), S.indexOf('  function szyldZNazwa('));
  const napisDeski = new Function(kod + '\nreturn napisDeski;')();
  const miara = (t, r) => Array.from(t).length * r * 0.56;
  assert.deepEqual(napisDeski('Zielnik', 96, miara), { rozmiar: 9.5, linie: ['Zielnik'] });
  const dwie = napisDeski('Biuro Rachunkowe Kowalski i Wspólnicy', 96, miara);
  assert.equal(dwie.linie.length, 2); assert.ok(dwie.linie.every((l) => !l.endsWith('…') && miara(l, dwie.rozmiar) <= 96), JSON.stringify(dwie));
  assert.equal(dwie.linie.join(' '), 'Biuro Rachunkowe Kowalski i Wspólnicy', 'cała nazwa');
  assert.equal(dwie.rozmiar, 8.5, 'największy rozmiar, w którym dwie linie się mieszczą (nie awaryjne 7 px)');
  const bdl = napisDeski('Przedsiębiorstwo Handlowo-Usługowe Kowalski i Wspólnicy spółka jawna', 96, miara);
  assert.equal(bdl.linie.length, 2); assert.equal(bdl.rozmiar, 7); assert.ok(bdl.linie.some((l) => l.endsWith('…')) && bdl.linie.every((l) => miara(l, 7) <= 96), JSON.stringify(bdl));
  const sz = S.slice(S.indexOf('function szyldZNazwa('), S.indexOf('/* TABLICA Z LOGO'));
  assert.match(sz, /U\.dopasujSzyld\(t, sw - 4, sh, miara, \{ maks: 13, min: 8 \}\)/, 'najpierw namalowana deska, od 8 px');
  assert.match(sz, /maks = w \* \(maksDeski \|\| \(wiez \? 0\.82 : 0\.66\)\)/, 'większa deska: do 66 % domku, 82 % wieżowca (od B2 partner podaje własny ułamek, blizna-209)');
  assert.match(sz, /sz\.className \+= " us-szyld--deska";/);
});

test('formularz: błędy rozdzielone (funkcja, kod HTTP, brak połączenia z nazwą błędu, przygotowanie plików)', () => {
  const sub = F.slice(F.indexOf('var etap = "przygotowanie";'));
  assert.match(sub, /etap = "wysylka";\n\s+return g\.fetch\(/);
  assert.match(sub, /return r\.text\(\)\.then\(function \(t\) \{ var j = \{\}; try \{ j = JSON\.parse\(t\) \|\| \{\}; \} catch \(e\) \{ j = \{\}; \}/, 'odpowiedź bez JSON nie udaje braku sieci');
  assert.match(sub, /info\.textContent = w\.blad \|\| \("Serwer nie przyjął zgłoszenia \(kod " \+ w\.status \+ "\)\./);
  assert.match(sub, /opis = \(\(e2 && e2\.name\) \|\| "Error"\) \+ \(tresc \? ": " \+ tresc : ""\)/, 'nazwa błędu widoczna');
  assert.match(sub, /etap === "wysylka" \? "Nie udało się wysłać: brak połączenia z serwerem \(" \+ opis/);
  assert.match(sub, /"Nie udało się przygotować plików \(" \+ opis/);
  assert.doesNotMatch(F, /Sprawdź połączenie\./, 'stary zbiorczy komunikat zniknął');
});
