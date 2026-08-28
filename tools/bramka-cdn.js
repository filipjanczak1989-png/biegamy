#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// BRAMKA: supabase-js MUSI iść z WŁASNEGO originu jako PIERWSZE źródło
//
// Do 28.08.2026 osiemnaście stron ładowało SDK z `cdn.jsdelivr.net` jako skrypt
// BLOKUJĄCY PARSER, poza cache Service Workera. Aplikacja offline-first miała
// więc twardą zależność od obcego originu — a `sw.js` nie dotykał tego żądania
// wcale (`isStaticAsset` ma warunek `url.origin === self.location.origin`).
//
// ⚠️ NAJGORSZY SCENARIUSZ TO NIE BYŁO `offline.html`, tylko strona w połowie
//    żywa: 10 z 18 stron siedzi w `PRECACHE_URLS`, więc offline HTML wstaje
//    z cache, render rusza, a potem skrypt CDN pada i `window.supabase` nie
//    istnieje. `sb.js` ma guard i przeżywa; skrypty stron używają `sb` bez
//    guardu, więc człowiek dostaje pustą stronę zamiast „jesteś offline".
//
// ⚠️ DRUGI POWÓD, NIEZALEŻNY OD AWARII CDN: adres `@2` to ZAKRES PŁYWAJĄCY,
//    a żaden z tagów nie miał `integrity`. Kod wykonujący się u ludzi mógł się
//    zmienić bez commita i bez naszej wiedzy. To ryzyko istniało codziennie,
//    niezależnie od tego, czy jsdelivr kiedykolwiek padł.
//
// PO CO BRAMKA, SKORO NAPRAWA JUŻ WESZŁA: dziewiętnasta strona wróci do CDN
// przez zwykłe skopiowanie tagu ze starego pliku albo ze Stack Overflow.
// Bez tej kontroli nikt tego nie zauważy — dokładnie jak przez poprzednie
// pół roku.
//
// Uruchomienie:  node tools/bramka-cdn.js  [--samokontrola]
// Kod wyjścia:   0 = OK, 1 = NARUSZENIE
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KORZEN = path.join(__dirname, '..');

const VENDOR = 'vendor/supabase-js-2.112.4.min.js';
/* Suma pliku POBRANEGO Z CDN 28.08.2026 i wgranego BAJT W BAJT (bez własnego
   nagłówka — właśnie po to, żeby dało się ją w każdej chwili odtworzyć):
     curl -s https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/dist/umd/supabase.min.js | sha256sum
   Zweryfikowane wtedy dwoma niezależnymi drogami: pobranie z adresu przypiętego
   (@2.112.4) i z pływającego (@2) dały ten sam bajt, a npm registry potwierdził
   wersję 2.112.4 i licencję MIT. */
const VENDOR_SHA256 = '9a8142ffedb319a3ac0d4a8a123c9c2f7ffdb0e1e86cd9553889911b647175f6';
const VENDOR_BAJTOW = 212718;

/* ⚠️ PRÓG. Bez niego usunięcie SDK ze wszystkich stron dałoby „zgodne" na
   pustym zbiorze — ta sama zasada co MIN_ZRODEL w bramce reguł. */
const MIN_STRON = 15;

const WZ_CDN = /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/;
const WZ_VENDOR = /vendor\/supabase-js-[0-9.]+\.min\.js/;

const bledy = [];
const uwagi = [];

function strony() {
  return fs.readdirSync(KORZEN)
    .filter((f) => f.endsWith('.html') && !f.startsWith('biegus-v14'))
    .filter((f) => {
      const s = fs.readFileSync(path.join(KORZEN, f), 'utf8');
      return WZ_CDN.test(s) || WZ_VENDOR.test(s);
    });
}

function sprawdzKolejnosc() {
  const lista = strony();
  if (lista.length < MIN_STRON) {
    bledy.push('znaleziono ' + lista.length + ' stron z supabase-js, próg to ' + MIN_STRON +
      ' — albo SDK zniknęło ze stron, albo wzorzec przestał pasować. Rozstrzygnij, nie obniżaj progu.');
  }
  for (const plik of lista) {
    const s = fs.readFileSync(path.join(KORZEN, plik), 'utf8');
    const iVendor = s.search(WZ_VENDOR);
    const iCdn = s.search(WZ_CDN);
    if (iVendor === -1) {
      bledy.push(plik + ': ładuje supabase-js z CDN, a NIE MA wersji z własnego originu. ' +
        'Wzorzec: `<script src="' + VENDOR + '">` PIERWSZY, CDN dopiero w `document.write` ' +
        'pod warunkiem `if(!window.supabase)`.');
      continue;
    }
    if (iCdn !== -1 && iCdn < iVendor) {
      bledy.push(plik + ': odwołanie do CDN stoi PRZED vendorem (znak ' + iCdn + ' vs ' + iVendor +
        '). Pierwsze źródło musi być własne — inaczej przy padniętym CDN strona i tak czeka na obcy origin.');
    }
  }
  if (!bledy.length) uwagi.push(lista.length + ' stron: supabase-js z własnego originu jako pierwsze źródło');
  return lista;
}

function sprawdzPlik() {
  const pelna = path.join(KORZEN, VENDOR);
  if (!fs.existsSync(pelna)) {
    bledy.push('brak pliku ' + VENDOR + ' — strony wskazują na nieistniejący zasób');
    return;
  }
  const buf = fs.readFileSync(pelna);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (buf.length !== VENDOR_BAJTOW) {
    bledy.push(VENDOR + ': ' + buf.length + ' B zamiast ' + VENDOR_BAJTOW + ' B');
  }
  if (sha !== VENDOR_SHA256) {
    bledy.push(VENDOR + ': sha256 ' + sha.slice(0, 16) + '… ≠ zapisane ' + VENDOR_SHA256.slice(0, 16) + '…' +
      ' — plik został zmodyfikowany. Vendor ma być BAJT W BAJT taki jak z CDN, ' +
      'inaczej sumy nie da się już z niczym porównać.');
  } else {
    uwagi.push('vendor: sha256 zgodne, ' + buf.length + ' B');
  }
}

function sprawdzPrecache() {
  const sw = fs.readFileSync(path.join(KORZEN, 'sw.js'), 'utf8');
  if (!sw.includes("'/" + VENDOR + "'")) {
    bledy.push('sw.js: ' + VENDOR + ' NIE jest w PRECACHE_URLS — plik jest lokalny, ' +
      'ale offline nadal go zabraknie, czyli naprawa działa tylko przy sieci.');
  } else {
    uwagi.push('sw.js: vendor w PRECACHE_URLS');
  }
}

function main() {
  if (process.argv.includes('--samokontrola')) {
    /* ⚠️ Bramka, która nigdy nie świeci na czerwono, jest ozdobą — i druga
       strona tej monety: taka, która świeci zawsze, też. Sprawdzamy OBIE. */
    const przed = bledy.length;
    const udawana = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';
    const zlapaneBrak = (udawana.search(WZ_VENDOR) === -1) && WZ_CDN.test(udawana);
    console.log(zlapaneBrak ? '  ✓ samokontrola: strona z samym CDN ZŁAPANA'
                            : '  ✗ SAMOKONTROLA PADŁA: sam CDN NIE został wykryty');

    const zlaKolejnosc = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>' +
                         '<script src="vendor/supabase-js-2.112.4.min.js"></script>';
    const zlapanaKolejnosc = zlaKolejnosc.search(WZ_CDN) < zlaKolejnosc.search(WZ_VENDOR);
    console.log(zlapanaKolejnosc ? '  ✓ samokontrola: CDN przed vendorem ZŁAPANY'
                                 : '  ✗ SAMOKONTROLA PADŁA: zła kolejność NIE została wykryta');

    const dobra = '<script src="vendor/supabase-js-2.112.4.min.js"></script>' +
                  '<script>if(!window.supabase)document.write(\'…jsdelivr…supabase-js@2…\')</script>';
    const przepuszcza = dobra.search(WZ_VENDOR) !== -1 &&
                        !(dobra.search(WZ_CDN) !== -1 && dobra.search(WZ_CDN) < dobra.search(WZ_VENDOR));
    console.log(przepuszcza ? '  ✓ samokontrola: poprawny układ PRZEPUSZCZONY'
                            : '  ✗ SAMOKONTROLA PADŁA: bramka odrzuca poprawny układ');

    const zlaSuma = crypto.createHash('sha256').update('nie ten plik').digest('hex') !== VENDOR_SHA256;
    console.log(zlaSuma ? '  ✓ samokontrola: zmieniona treść vendora ZŁAPANA'
                        : '  ✗ SAMOKONTROLA PADŁA: suma kontrolna nic nie sprawdza');

    bledy.length = przed;
    process.exit((zlapaneBrak && zlapanaKolejnosc && przepuszcza && zlaSuma) ? 0 : 1);
  }

  sprawdzKolejnosc();
  sprawdzPlik();
  sprawdzPrecache();

  console.log('\n  BRAMKA CDN — supabase-js z własnego originu\n');
  uwagi.forEach((u) => console.log('  · ' + u));
  if (bledy.length) {
    console.log('\n  NARUSZENIE (' + bledy.length + '):');
    bledy.forEach((b) => console.log('  ⚠ ' + b));
    console.log('\n  Wzorzec „WY3 SELF-HOST" (biegus.html): własny plik PIERWSZY, CDN tylko fallbackiem.\n');
    process.exit(1);
  }
  console.log('\n  Zgodne.\n');
}

main();
