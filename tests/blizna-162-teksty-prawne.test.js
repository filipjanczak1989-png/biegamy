/* BLIZNA 162 / TEKSTY PRAWNE (Filip 4.11): polityka przeczyła publicznej mapie wyprawy i milczała o akcji i grze, regulamin podawał inny adres niż polityka, a gra, strona akcji i mapa nie prowadziły do żadnego z tych dokumentów. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');

test('polityka po polsku i angielsku: sekcja 13, zdanie o GPS prowadzi do niej, wiek 16, bez imienia dziecka', () => {
  for (const [plik, slowa] of [
    ['privacy.html', ['<a href="#akcja">sekcja 13</a>', 'Akcja charytatywna i gra Cegiełki', 'Swój wkład widzisz wyłącznie Ty', 'Ślad GPS dwóch uczestników wyprawy', 'Nie jest publiczny: nie pokazujemy go na mapie ani w żadnej odpowiedzi serwera', 'bez wartości pieniężnej', 'Dane gry kasujemy razem z kontem', 'BiegaMy w nich nie pośredniczy', 'w przypadku dziecka za zgodą rodzica', 'ukończyła 16 lat']],
    ['privacy-en.html', ['<a href="#akcja">section 13</a>', 'The charity campaign and the Cegiełki game', 'visible only to you', 'GPS track of the two expedition participants', 'It is not public: we do not show it on a map or in any server response', 'no monetary value', 'deleted together with your account', 'BiegaMy does not handle it', "for a child with a parent's consent", 'turned 16']],
  ]) {
    const t = czytaj(plik);
    assert.match(t, /<div class="section" id="akcja">\s*<div class="section-num">13<\/div>/, plik);
    for (const s of slowa) assert.ok(t.includes(s), plik + ': ' + s);
    assert.doesNotMatch(t, /fabian/i, plik + ': imię dziecka nie w polityce');
  }
  const pl = czytaj('privacy.html');
  assert.match(pl, /<a href="#firmy">12\./); assert.match(pl, /<a href="#akcja">13\./);
});

test('regulamin: wiek 16, bezpłatna gra bez wypłat, jeden adres kontaktowy, intervals.icu zamiast Stravy, usuwanie jak w polityce', () => {
  const t = czytaj('terms.html');
  assert.ok(t.includes('ukończyła 16 lat'));
  assert.ok(t.includes('Gra Cegiełki jest bezpłatna. Cegły i złote cegły to wyłącznie waluta w grze, nie można ich kupić ani wypłacić.'));
  assert.match(t, /mailto:biegamy\.run@gmail\.com/);
  assert.doesNotMatch(t, /kontakt@biegamy/);
  assert.doesNotMatch(t, /strav/i, 'jedyne połączenie to intervals.icu');
  for (const s of ['Integrację z intervals.icu (po autoryzacji)', 'Dane intervals.icu:', 'tokeny OAuth', 'Integracja z intervals.icu odbywa się']) assert.ok(t.includes(s), s);
  assert.doesNotMatch(t, /zaszyfrowan/, 'token nie jest szyfrowany w aplikacji, regulamin mówi to samo co polityka');
  assert.doesNotMatch(t, /30 dni/, 'polityka: usuwamy natychmiast');
  assert.equal((t.match(/Dane usuwamy natychmiast po usunięciu konta/g) || []).length, 2);
  for (const a of ['usuwanie', 'retencja']) { assert.ok(t.includes(`privacy.html#${a}`), a); assert.ok(czytaj('privacy.html').includes(`id="${a}"`), a); }
});

test('stopka na grze i stronie akcji (mapa od 9.11 to przekierowanie); podpowiedź przy pseudonimie jest w formularzu, więc znika razem z nim', () => {
  for (const p of ['gra-cegielki.html', 'dla-fabianka.html']) {
    const t = czytaj(p);
    assert.match(t, /<p class="stopka-prawna"><a href="privacy\.html"[^>]*>Polityka prywatności<\/a> · <a href="terms\.html"[^>]*>Regulamin<\/a> · <a href="mailto:biegamy\.run@gmail\.com">biegamy\.run@gmail\.com<\/a><\/p>/, p);
  }
  const gra = czytaj('gra-cegielki.html');
  assert.ok(gra.indexOf('stopka-prawna"><a') > gra.indexOf('id="m-sklep"') && gra.indexOf('stopka-prawna"><a') < gra.indexOf('id="obroc"'), 'stopka w menu gry, nie nad planszą');
  assert.match(gra, /#menu, #koniec \{ padding-bottom:calc\(66px \+ env\(safe-area-inset-bottom\)\); \}/, 'przycisk wyciszenia nie zasłania stopki ani ostatniego zdania');
  const f = czytaj('dla-fabianka.html');
  assert.ok(f.indexOf('stopka-prawna"><a') < f.indexOf('</main>'));
  assert.match(czytaj('js/cegielki-konto.js'), /Masz mniej niż 16 lat\? Poproś rodzica, zanim wpiszesz pseudonim\. Nie podawaj nazwiska\."\);[^\n]*form\.appendChild\(wiek\)/);
});
