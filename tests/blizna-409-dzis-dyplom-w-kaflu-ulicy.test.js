// Blizna #409 (27.11.2026, P1b) — nowe Dziś: pasek „🏅 Ukończone · Twój dyplom ›” przyklejony na dole ekranu.
//
// Co to jest: #bieg-pasek z zawodnik.html (blizny 290–292), rysowany przez js/akcja.mjs (rysujPasekBiegu) z licznika akcji (pole bieg)
// i RPC akcja_bieg_moi. Stary kod odświeża go w _odswiezStanAkcji także pod nowym Dziś, a blok chowania starego Dziś celowo go pomijał
// („decyzja w E1”), więc pasek stał pod korzeniem nowego Dziś, na samym dole.
// Teraz (decyzja Filipa 27.11): pod html.dzis-nowy.dzis-gotowy wariantu z dyplomem nie ma, a kafel Ulica ma pod wkładem link „Twój dyplom ›”
// (styl .dn-link) do tego samego adresu co pasek. Dane: stan, który stary kod już narysował w pasku. Zero nowych zapytań.
// Krzyżyk paska zapisuje bm_bieg_pasek_ukryty_<bieg>_dyplom = koniec dnia (czas polski) i chowa pasek: link znika razem z nim,
// do końca tego dnia. Moduł klucza nie czyta i nie pisze, więc znaczenie krzyżyka zostaje jedno.
// Pozostałe warianty (zapis, numer, dzieci) zostają paskiem, jak dotąd.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, MODUL, czytaj } = require('./_dzis-nowy-strona.js');

const AKCJA = czytaj('js/akcja.mjs'), HTML = czytaj('zawodnik.html');
function pasek(wariant, href = 'bieg.html', hidden = false) {
  const a = { getAttribute: (k) => (k === 'href' ? href : null) };
  return { hidden, _a: { 'data-wariant': wariant }, getAttribute(k) { return k in this._a ? this._a[k] : null }, setAttribute(k, v) { this._a[k] = String(v); }, querySelector: (s) => (s === 'a' ? a : null) };
}
/** Strona z paskiem i podsłuchanym obserwatorem (moduł bierze window.MutationObserver dopiero w start()). */
function zPaskiem(p, o) {
  const s = strona(o), obs = [];
  if (p) s.el['bieg-pasek'] = p;
  s.w.MutationObserver = function (f) { this.observe = (cel, opcje) => { if (cel === p) obs.push({ cel, opcje, f }); }; };   // tylko obserwatory paska (moduł ma też inne)
  s.obs = obs;
  return s;
}
const LINK = '<div class="dn-ul-dyplom"><a class="dn-link" href="bieg.html">Twój dyplom ›</a></div>';

test('(1) pasek z dyplomem: kafel Ulica ma pod wkładem „Twój dyplom ›” do bieg.html, przed przyciskami; zero nowych zapytań', async () => {
  const bez = zPaskiem(null); bez.B.start(); await bez.doKonca();
  const s = zPaskiem(pasek('dyplom')); s.B.start(); await s.doKonca();
  const h = s.kafel('ulica').innerHTML;
  assert.ok(h.includes('<p class="dn-tekst" data-dn="wklad">Twój wkład: <b>0 km</b>. Spacer też buduje ulicę.</p>' + LINK) || /data-dn="wklad">[\s\S]*?<\/p><div class="dn-ul-dyplom">/.test(h), 'link stoi zaraz pod wkładem');
  assert.equal(h.split('Twój dyplom ›').length - 1, 1);
  assert.doesNotMatch(bez.kafel('ulica').innerHTML, /dn-ul-dyplom|dyplom/);
  assert.deepEqual(s.zapytania.map((z) => z.nazwa).sort(), bez.zapytania.map((z) => z.nazwa).sort(), 'te same zapytania z paskiem i bez');
});

test('(2) bez linku: pasek schowany (krzyżyk, brak dyplomu, 30 s bez potwierdzenia), inne warianty, brak paska', async () => {
  for (const [p, opis] of [[pasek('dyplom', 'bieg.html', true), 'schowany'], [pasek('numer'), 'numer'], [pasek('zapis'), 'zapis'], [pasek('dzieci'), 'dzieci'], [null, 'brak paska']]) {
    const s = zPaskiem(p); s.B.start(); await s.doKonca();
    assert.doesNotMatch(s.kafel('ulica').innerHTML, /Twój dyplom/, opis);
  }
});

test('(3) adres tylko z listy paska: bieg.html i bieg.html?proba=1 (konto próby); cokolwiek innego = bez linku', async () => {
  const proba = zPaskiem(pasek('dyplom', 'bieg.html?proba=1')); proba.B.start(); await proba.doKonca();
  assert.match(proba.kafel('ulica').innerHTML, /<a class="dn-link" href="bieg\.html\?proba=1">Twój dyplom ›<\/a>/);
  for (const zly of ['javascript:alert(1)', 'https://example.test/bieg.html', 'bieg.html" onclick="x', '', null]) {
    const s = zPaskiem(pasek('dyplom', zly)); s.B.start(); await s.doKonca();
    assert.doesNotMatch(s.kafel('ulica').innerHTML, /dn-ul-dyplom/, String(zly));
  }
});

test('(4) pasek zmienia stan po narysowaniu kafla: obserwator na #bieg-pasek przerysowuje kafel tylko przy zmianie linku', async () => {
  const p = pasek('dyplom', 'bieg.html', true), s = zPaskiem(p); s.B.start(); await s.doKonca();
  assert.equal(s.obs.length, 1, 'jeden obserwator');
  assert.equal(s.obs[0].cel, p);
  assert.deepEqual(JSON.parse(JSON.stringify(s.obs[0].opcje)), { attributes: true, attributeFilter: ['hidden', 'data-wariant'], childList: true });
  assert.doesNotMatch(s.kafel('ulica').innerHTML, /Twój dyplom/);
  p.hidden = false; s.obs[0].f();   // baza potwierdziła dyplom
  assert.ok(s.kafel('ulica').innerHTML.includes(LINK));
  s.kafel('ulica').innerHTML = 'BEZ ZMIAN'; s.obs[0].f();
  assert.equal(s.kafel('ulica').innerHTML, 'BEZ ZMIAN', 'ten sam stan paska: bez przerysowania');
  p.hidden = true; s.obs[0].f();   // krzyżyk: do końca dnia
  assert.doesNotMatch(s.kafel('ulica').innerHTML, /Twój dyplom/);
  assert.match(s.kafel('ulica').innerHTML, /Postęp ulicy/, 'reszta kafla na miejscu');
  s.B.start(); s.B.start();
  assert.equal(s.obs.length, 1, 'ponowny start nie dokłada obserwatorów');
});

test('(5) schowany kafel Ulicy nie wraca przez zmianę paska: akcja przed startem i kafel schowany po narysowaniu (np. odświeżenie, akcja się skończyła)', async () => {
  const p = pasek('dyplom', 'bieg.html', true), s = zPaskiem(p, { licznik: { wystartowala: false } }); s.B.start(); await s.doKonca();
  assert.equal(s.kafel('ulica').hidden, true);
  p.hidden = false; s.obs[0].f();
  assert.equal(s.kafel('ulica').hidden, true);
  const p2 = pasek('dyplom', 'bieg.html', true), s2 = zPaskiem(p2); s2.B.start(); await s2.doKonca();
  assert.equal(s2.kafel('ulica').hidden, false);
  s2.kafel('ulica').hidden = true; s2.kafel('ulica').innerHTML = 'SCHOWANY';   // to, co robi schowaj("ulica") przy kolejnej fali
  p2.hidden = false; s2.obs[0].f();
  assert.equal(s2.kafel('ulica').hidden, true, 'pasek nie odsłania kafla');
  assert.equal(s2.kafel('ulica').innerHTML, 'SCHOWANY');
});

test('(5b) pasek wchodzi do strony PO starcie modułu (moduł startuje, zanim strona się doczyta): obserwator powstaje przy rysunku kafla, bez własnego czekania na wczytanie strony', async () => {
  const p = pasek('dyplom', 'bieg.html', true), s = zPaskiem(null); s.B.start();
  assert.equal(s.obs.length, 0, 'przy starcie paska jeszcze nie ma');
  s.el['bieg-pasek'] = p; s.w.MutationObserver = function (f) { this.observe = (cel, opcje) => { if (cel === p) s.obs.push({ cel, opcje, f }); }; };
  await s.doKonca();
  assert.equal(s.obs.length, 1, 'obserwator z rysunku kafla Ulicy');
  p.hidden = false; s.obs[0].f();
  assert.match(s.kafel('ulica').innerHTML, /Twój dyplom ›/);
});

test('(6) CSS: pod nowym Dziś chowany jest tylko wariant z dyplomem; pozostałe warianty paska zostają', () => {
  assert.ok(MODUL.includes('html.dzis-gotowy #bieg-pasek[data-wariant=dyplom]{display:none!important}'));
  assert.equal((MODUL.match(/#bieg-pasek[[{,]/g) || []).length, 1, 'jedna reguła CSS o pasku, tylko z wariantem dyplom');
});

test('(7) kontrakt ze starym paskiem: wariant w data-wariant, adres w <a>, schowanie przez hidden; krzyżyk = koniec dnia; moduł nie rusza klucza krzyżyka', () => {
  assert.match(AKCJA, /el\.setAttribute\("data-wariant", s\.wariant\);/);
  assert.match(AKCJA, /a\.href = s\.href;/);
  assert.match(AKCJA, /if \(!s\) \{ el\.hidden = true; return; \}/);
  assert.match(AKCJA, /href: d\.testowa === true \? "bieg\.html\?proba=1" : "bieg\.html"/, 'te same dwa adresy co lista w module');
  assert.match(AKCJA, /String\(s\.wariant === "zapis" \? t \+ PASEK_ZAPIS_UKRYTY_MS : koniecDniaWaw\(t\)\)/, 'krzyżyk przy dyplomie: do końca dnia');
  assert.doesNotMatch(MODUL, /["']bm_bieg_pasek/, 'moduł nie czyta i nie pisze pamięci paska (klucz tylko w komentarzu)');
  assert.match(MODUL, /var DYPLOM_ADRESY = \["bieg\.html", "bieg\.html\?proba=1"\]/);
  assert.equal((HTML.match(/bieg-pasek/g) || []).length, 2, 'zawodnik.html bez zmian: element i wywołanie (blizny 290–292)');
});
