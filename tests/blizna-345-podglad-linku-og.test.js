/* BLIZNA 345 (23.11): podgląd linku strony biegu i ulicy akcji. Bez og:image Facebook brał pierwszy obrazek ze strony biegu — ikonę kroku 1
   (assets/bieg/bieg-krok-1.svg, kartka z ołówkiem) — a ulica nie miała nic. Teraz plakat 1200×630 z PUBLICZNEGO kubełka Storage.
   Plakat ma zdjęcie i imię dziecka: plik nigdy nie trafia do repo (tylko adres), og:image nie może wskazywać na plik w repo ani na adres z tokenem
   (podpisany wygasa), a w og:* / twitter:* nie ma imienia (adres ulicy zawiera nazwę pliku strony — to jedyny wyjątek). og:url bez ?proba. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const OBRAZ = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/publiczne/bieg-plakat-og.jpg';
const STRONY = { 'bieg.html': 'https://biegamy.run/bieg', 'dla-fabianka.html': 'https://biegamy.run/dla-fabianka.html' };
/* tytuł i opis przypięte dosłownie: w og:* nic się nie dopisze bez zmiany tej blizny (repo bez imienia i nazwiska dziecka) */
const TEKSTY = {
  'bieg.html': ['Bieg wirtualny · BiegaMy', 'Bieg i marsz dla jednej zbiórki. Pobiegnij albo przejdź swój dystans tam, gdzie mieszkasz.'],
  'dla-fabianka.html': ['BiegaMy · wspólne kilometry', 'Biegniemy i idziemy razem. Każdy krok się liczy.'],
};
const RDZEN = 'dla-fabianka.html'.replace(/^dla-|ka\.html$/g, '');   // rdzeń imienia wyliczony z nazwy pliku strony — imienia nie wpisujemy wprost

/** wszystkie <meta property|name="og:…|twitter:…"> strony: [[klucz, treść], …] */
function metaSpolecznosciowe(h) {
  return [...h.matchAll(/<meta (?:property|name)="((?:og|twitter):[a-z_:]+)" content="([^"]*)">/g)].map((m) => [m[1], m[2]]);
}
const jeden = (lista, klucz) => { const w = lista.filter((x) => x[0] === klucz); assert.equal(w.length, 1, klucz + ': dokładnie jeden'); return w[0][1]; };

for (const [plik, adres] of Object.entries(STRONY)) {
  test(plik + ': komplet og:* i twitter:* z plakatem ze Storage', () => {
    const m = metaSpolecznosciowe(czytaj(plik));
    assert.equal(jeden(m, 'og:image'), OBRAZ);
    assert.equal(jeden(m, 'og:image:secure_url'), OBRAZ);
    assert.equal(jeden(m, 'twitter:image'), OBRAZ);
    assert.equal(jeden(m, 'og:image:type'), 'image/jpeg');
    assert.equal(jeden(m, 'og:image:width'), '1200');
    assert.equal(jeden(m, 'og:image:height'), '630');
    assert.equal(jeden(m, 'og:image:alt'), 'Plakat wirtualnego biegu mikołajkowego BiegaMy');
    assert.equal(jeden(m, 'twitter:card'), 'summary_large_image');
    assert.equal(jeden(m, 'og:url'), adres);
    assert.equal(jeden(m, 'og:type'), 'website');
    assert.deepEqual([jeden(m, 'og:title'), jeden(m, 'og:description')], TEKSTY[plik], 'tytuł i opis bez zmian');
  });

  test(plik + ': obraz z publicznego kubełka (nie plik w repo, nie adres z tokenem), og:url bez ?proba, bez imienia w og:* i twitter:*', () => {
    const m = metaSpolecznosciowe(czytaj(plik));
    for (const [k, v] of m.filter((x) => /image$|image:secure_url$/.test(x[0]))) {
      assert.match(v, /^https:\/\/afqojgkaveykxbltxzwm\.supabase\.co\/storage\/v1\/object\/public\/[a-z0-9-]+\/[a-z0-9-]+\.jpg$/, k + ': publiczny Storage, https, bez parametrów');
      assert.doesNotMatch(v, /\/object\/sign\/|token=|[?#]/, k + ': bez podpisu i tokenu (podpisany adres wygasa)');
    }
    const url = jeden(m, 'og:url');
    assert.match(url, /^https:\/\/biegamy\.run\/[a-z-]+(\.html)?$/, 'og:url bezwzględny, bez parametrów');
    assert.doesNotMatch(url, /proba/);
    for (const [k, v] of m) assert.doesNotMatch(v.replace(/dla-fabianka(\.html)?/g, ''), new RegExp(RDZEN, 'i'), k + ': bez imienia dziecka (poza nazwą pliku strony w adresie)');
    assert.equal(m.length, 12, 'dokładnie 12 tagów og:/twitter: (nic dopisanego poza tym zestawem)');
  });
}

test('og:url biegu = adres udostępniania z js/bieg.mjs (ADRES_BIEGU, blizna-285); plik plakatu nie leży w repo', () => {
  const adresBiegu = /var ADRES_BIEGU = "([^"]+)";/.exec(czytaj('js/bieg.mjs'));
  assert.ok(adresBiegu); assert.equal(adresBiegu[1], STRONY['bieg.html']);
  const znalezione = [];
  (function chodz(kat) {
    for (const w of fs.readdirSync(kat, { withFileTypes: true })) {
      if (w.name === '.git' || w.name === 'node_modules') continue;
      const p = path.join(kat, w.name);
      if (w.isDirectory()) chodz(p); else if (/plakat-og|bieg-plakat/i.test(w.name) && /\.(jpe?g|png|webp|pdf)$/i.test(w.name)) znalezione.push(path.relative(KORZEN, p));
    }
  })(KORZEN);
  assert.deepEqual(znalezione, [], 'plakat ze zdjęciem dziecka nie trafia do repo — tylko adres w Storage');
});
