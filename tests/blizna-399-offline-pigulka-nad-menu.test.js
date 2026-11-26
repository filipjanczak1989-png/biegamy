// Blizna #399 (26.11.2026) — pigułka „Offline · dane z HH:MM” stoi nad dolnym menu, nie na przycisku „Log”.
//
// Pigułka (js/dzis-offline.js, wspólna dla starego Dziś, nowego Dziś i kalendarza) stała 80 px nad dołem ekranu. Dolne menu ma
// ok. 89 px, a pomarańczowe kółko „Log” wystaje ponad nie, więc pigułka zachodziła na kółko: napisu nie dało się przeczytać,
// a dotknięcie trafiało raz w jedno, raz w drugie. Teraz przy WIDOCZNYM dolnym menu pigułka stoi 116 px nad dołem plus
// bezpieczny obszar telefonu, czyli tam, gdzie toast (blizna-346). Strona bez menu: 80 px jak dotąd.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLIK = path.join(__dirname, '..', 'js', 'dzis-offline.js');
const ZRODLO = fs.readFileSync(PLIK, 'utf8').replace(/\r/g, '');
const NAD_MENU = 'calc(env(safe-area-inset-bottom,0px) + 116px)', BEZ_MENU = 'calc(env(safe-area-inset-bottom,0px) + 80px)';

/** Strona w pigułce: body, elementy po id, dolne menu (widoczne, ukryte albo brak), zegar pod kontrolą testu. */
function strona(menu) {
  const s = { menu, dzieci: [], zegary: [] };
  const el = (tag) => { const e = { tag, id: '', style: { cssText: '', bottom: '' }, textContent: '', dzieci: [], appendChild(d) { e.dzieci.push(d); return d; }, remove() { s.dzieci = s.dzieci.filter((x) => x !== e); } }; return e; };
  const wszystkie = () => s.dzieci.concat(s.dzieci.flatMap((d) => d.dzieci));
  const document = {
    createElement: el, body: { appendChild(d) { s.dzieci.push(d); return d; } },
    getElementById: (id) => wszystkie().find((e) => e.id === id) || null,
    querySelectorAll: (sel) => { assert.equal(sel, '.bottom-nav'); return s.menu === 'brak' ? [] : [{ getClientRects: () => (s.menu === 'widoczne' ? [{}] : []) }]; },
  };
  const M = new Function('module', 'document', 'setTimeout', 'localStorage', ZRODLO + '\nreturn module.exports;')({ exports: {} }, document, (f, ms) => { s.zegary.push({ f, ms }); return s.zegary.length; }, undefined);
  s.M = M; s.pigulka = () => document.getElementById('bm-offline-pasek'); s.napis = () => document.getElementById('bm-offline-pasek-txt');
  s.poCzasie = () => { const z = s.zegary; s.zegary = []; z.forEach((x) => x.f()); };
  return s;
}
const o10 = () => { const d = new Date(); d.setHours(10, 5, 0, 0); return d.getTime(); };

test('(1) widoczne dolne menu: pigułka 116 px nad dołem plus bezpieczny obszar telefonu', () => {
  const s = strona('widoczne');
  s.M.pokazPasek(o10());
  assert.equal(s.pigulka().style.bottom, NAD_MENU);
  assert.match(s.pigulka().style.bottom, /env\(safe-area-inset-bottom,0px\)/, 'zapas na dolny pasek iPhone\'a');
  assert.equal(s.napis().textContent, 'Offline · dane z 10:05', 'treść bez zmian');
});

test('(2) strona bez dolnego menu albo z ukrytym menu: 80 px jak dotąd', () => {
  for (const menu of ['brak', 'ukryte']) {
    const s = strona(menu);
    s.M.pokazPasek(o10());
    assert.equal(s.pigulka().style.bottom, BEZ_MENU, menu);
  }
});

test('(3) menu dochodzi po pigułce: położenie poprawia się samo po chwili i przy każdym kolejnym pokazaniu', () => {
  const s = strona('brak');
  s.M.pokazPasek(o10());
  assert.equal(s.pigulka().style.bottom, BEZ_MENU);
  assert.deepEqual(s.zegary.map((z) => z.ms), [1500], 'jedno sprawdzenie po 1,5 s');
  s.menu = 'widoczne';
  s.poCzasie();
  assert.equal(s.pigulka().style.bottom, NAD_MENU, 'bez drugiego wywołania');
  const t = strona('brak');
  t.M.pokazPasek(o10()); t.menu = 'widoczne'; t.M.pokazPasek(o10());
  assert.equal(t.pigulka().style.bottom, NAD_MENU, 'kolejne pokazanie liczy położenie od nowa');
  assert.equal(t.zegary.length, 1, 'zegar tylko przy utworzeniu pigułki');
});

test('(4) jedna pigułka na stronę; schowana przed upływem czasu nie wraca i nie rzuca błędu', () => {
  const s = strona('widoczne');
  s.M.pokazPasek(o10()); s.M.pokazPasek(o10());
  assert.equal(s.dzieci.length, 1);
  s.M.ukryjPasek();
  assert.equal(s.pigulka(), null);
  assert.doesNotThrow(() => s.poCzasie());
  assert.equal(s.pigulka(), null);
});

test('(5) położenie nie jest już wpisane na stałe w styl; reszta wyglądu bez zmian', () => {
  const s = strona('widoczne');
  s.M.pokazPasek(o10());
  const css = s.pigulka().style.cssText;
  assert.ok(!/bottom:/.test(css), 'dół ustawia wyłącznie dolPaska');
  for (const kawalek of ['position:fixed', 'left:50%', 'transform:translateX(-50%)', 'z-index:400', 'border-radius:12px', 'max-width:92vw'])
    assert.ok(css.includes(kawalek), 'styl zachowuje: ' + kawalek);
});

test('(6) ta sama wysokość co toast nad menu: jedna liczba w obu miejscach', () => {
  const sb = fs.readFileSync(path.join(__dirname, '..', 'sb' + '.js'), 'utf8');
  assert.match(sb, /calc\(116px \+ env\(safe-area-inset-bottom, 0px\)\)/, 'toast nad dolnym menu stoi na 116 px (blizna-346)');
  assert.match(ZRODLO, /\(zMenu \? 116 : 80\)/);
  assert.equal(ZRODLO.split("bottom:calc(env(safe-area-inset-bottom,0px) + 80px)").length - 1, 0, 'stare, stałe położenie usunięte');
});
