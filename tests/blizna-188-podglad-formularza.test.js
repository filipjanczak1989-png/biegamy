/* BLIZNA 188 / PODGLĄD W FORMULARZU (6.11): firma widzi swój budynek z logo, a trener nową cegłę w murze, zanim cokolwiek pójdzie do bazy.
   - jedna funkcja rysowania: budynek firmy (budynekFirmy, szyld) i cegła (ceglaMuru) w js/ulica-scena.mjs dla Ulicy i podglądów, bez drugiej kopii;
   - podgląd firmy nad „Wyślij”, logo przygotowane tą samą funkcją co do wysyłki, adres tylko w przeglądarce (blob), podpowiedź bez blokowania wysyłki;
   - podgląd cegły w panelu trenera: z imieniem przy zgodzie, bez imienia bez zgody, tak jak mur na Ulicy.
   Po skutku (Chrome, poza repo): podgląd = budynek i cegła na Ulicy w wymiarach, szyldzie i klasach, nic nie wychodzi przed „Wyślij”. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const S = czytaj('js/ulica-scena.mjs'), U = czytaj('js/ulica.mjs'), F = czytaj('js/firma-formularz.mjs');

test('jedna funkcja rysuje budynek firmy i cegłę na Ulicy i w podglądzie', () => {
  for (const f of ['function budynekFirmy(', 'function szyldFirmyNaBudynku(', 'function szyldNazwyFirmy(', 'function ceglaMuru(']) assert.equal(S.split(f).length - 1, 1, f + ': dokładnie raz');
  const z = S.slice(S.indexOf('function zamontuj(kontener, licznik, opcje)'));
  assert.doesNotMatch(z, /function szyldFirmy\(|function szyldNazwa\(|el\("button", "us-btn us-domek"|"us-cegla" \+/, 'w scenie nie ma drugiej kopii');
  assert.match(z, /var bud = budynekFirmy\(U, ulica, f, m\.wyb, xb, m\.baza, w, m\.nr, function \(im, adres\) \{ return leniwy\(im, adres, rekord\); \}\)/, 'Ulica: leniwie');
  assert.match(z, /for \(var i = 0; i < pokaz; i\+\+\) ceglaMuru\(mur, i < dod\.imiona\.length \? dod\.imiona\[i\] : "", i, kol\);/);
  const pf = S.slice(S.indexOf('function podgladFirmy('), S.indexOf('function podgladCegly('));
  assert.match(pf, /budynekFirmy\(U, k\.ulica, f, wiez \? \{ nazwa: "wiezowiec", lustro: false \} : U\.domekNaMiejscu\(0, f\.nazwa \|\| ""\)/, 'ten sam wybór budynku co pierwszy domek na Ulicy');
  assert.match(pf, /wiez \? POZIOM_DOMKU - ZA_DROGA : POZIOM_DOMKU, w,/, 'wieżowiec głębiej, jak na Ulicy');
  assert.match(S, /var bud = budynekFirmy[^\n]*\n[\s\S]{0,40}rekord\.el = b;/);
  assert.match(S.slice(S.indexOf('function podgladCegly(')), /ceglaMuru\(mur, i === 7 && zgoda && imie \? imie : "", i, kol\)/, 'bez zgody cegła bez imienia');
  assert.match(S, /g\.BM_ULICA_SCENA = \{ budynekFirmy: budynekFirmy, ceglaMuru: ceglaMuru, podgladFirmy: podgladFirmy, podgladCegly: podgladCegly,/);
});

test('formularz firmy: podgląd nad „Wyślij”, logo jak do wysyłki, nic na serwer przed wysłaniem, podpowiedź nie blokuje', () => {
  const p = F.slice(F.indexOf('var podglad = el("div", "ff-podglad", f)'), F.indexOf('var wyslij = el("button", "ff-wyslij", f, "Wyślij zgłoszenie")'));
  assert.ok(p.length > 200, 'podgląd stoi przed przyciskiem');
  assert.match(p, /logoDoWyslania\(plikLogo\)\.then\(function \(b\) \{ return g\.URL\.createObjectURL\(b\); \}/, 'to samo przygotowanie logo co przy wysyłce, adres tylko w przeglądarce');
  assert.doesNotMatch(p, /fetch|FormData|sb\.|rpc|storage/, 'podgląd niczego nie wysyła');
  assert.match(p, /nazwa\.addEventListener\("input"[^\n]*\n\s*rodzaj\.addEventListener\("change", rysujPodglad\); logo\.addEventListener\("change", rysujPodglad\);/, 'zmiana nazwy, budynku albo logo: nowy podgląd');
  assert.match(p, /if \(moj !== nrPodgladu\)/, 'spóźniony podgląd nie nadpisze nowszego');
  assert.match(p, /g\.URL\.revokeObjectURL\(adresLogo\)/, 'stary adres logo zwolniony');
  assert.match(p, /U\.ocenaLogo\(im, ciemny\)\.join\(" "\)/);
  const sub = F.slice(F.indexOf('f.addEventListener("submit"'));
  assert.doesNotMatch(sub, /podRada|ocenaLogo/, 'podpowiedź nie blokuje wysyłki');
  assert.doesNotMatch(F, /\.innerHTML\s*=/, 'tylko textContent');
});

test('ocena logo: za szerokie, słabo widoczne, ciemny prostokąt; panel trenera z podglądem cegły', () => {
  const o = U.slice(U.indexOf('function ocenaLogo('), U.indexOf('function podgladFirmy('));
  assert.match(o, /nw \/ nh > 3\.2/); assert.match(o, /blisko \/ n > 0\.85/); assert.match(o, /tlo = ciemnySzyld \? 40 : 240/);
  assert.match(o, /słabo widać na szyldzie: wyślij wersję na przezroczystym tle/);
  assert.match(U, /function podgladFirmy\(kontener, f, naLogo\) \{ return ladujScene\(\)\.then\(function \(S\) \{ return S\.podgladFirmy\(kontener, f, naLogo\); \}\); \}/);
  const pt = U.slice(U.indexOf('function panelTrenera('));
  assert.match(pt, /podgladCegly\(podCegly, ok \? im : "", iZgoda\.checked\)/);
  assert.match(pt, /iImie\.addEventListener\("input", odswiezCegle\); iZgoda\.addEventListener\("change", odswiezCegle\);/);
  assert.doesNotMatch(pt.slice(pt.indexOf('function odswiezCegle'), pt.indexOf('iImie.addEventListener("input", odswiezCegle)')), /sb\.|insert|from\(/, 'podgląd cegły nic nie zapisuje');
});
