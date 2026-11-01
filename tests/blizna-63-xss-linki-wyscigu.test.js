/* BLIZNA 63 (1.11.2026, ZWIAD K2): XSS w linkach wyścigu, races.html.

   „Regulamin zawodów" i „Strona organizatora" szły przez lokalne escAttr (sam cudzysłów → &quot;), więc
   url_regulamin = "javascript:…" trafiał do href. Zawodnik może zgłosić wyścig (status pending), trener zgłoszenia
   widzi i otwiera — link z danych jednej osoby działał w sesji drugiej. Teraz: safeExternalHref(url, {tylkoHttps})
   — javascript:, data:, http: odpadają (link POMINIĘTY, nie martwy), https: przechodzi, rel="noopener" zostaje. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const races = fs.readFileSync(path.join(__dirname, '..', 'races.html'), 'utf8');

test('safeExternalHref {tylkoHttps}: javascript: i http: odpadają, https: przechodzi; bez opcji http: jak dotąd', () => {
  const ctx = zaladujSb();
  const f = ctx.safeExternalHref;
  for (const zly of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'http://x', 'data:text/html,<b>x</b>', 'vbscript:x']) {
    assert.equal(f(zly, { tylkoHttps: true }), '', zly);
  }
  assert.equal(f('https://x', { tylkoHttps: true }), 'https://x');
  assert.equal(f('http://x'), 'http://x', 'bez opcji http: dalej przechodzi (inne miejsca, np. Strava)');
  assert.equal(f('javascript:alert(1)'), '', 'bez opcji javascript: dalej odpada');
});

/* Wycinek z races.html wykonany NAPRAWDĘ (nie regex na wyniku): blok linków z openRace dla podanego wyścigu. */
function linki(race) {
  const ctx = zaladujSb();
  const i = races.indexOf('  // Linki');
  const j = races.indexOf("linksEl.innerHTML", i);
  assert.ok(i > 0 && j > i, 'nie znalazłem bloku linków w openRace');
  const kod = races.slice(i, j) + 'return linksHtml;';
  return new Function('race', 'document', 'window', 'escAttr', kod)(race, { getElementById: () => ({}) }, ctx, (s) => String(s || '').replace(/"/g, '&quot;'));
}

test('openRace: url_regulamin/url_organizer „javascript:" i „http:" → link pominięty; „https:" → link z rel="noopener"', () => {
  for (const zly of ['javascript:alert(1)', 'http://x']) {
    const html = linki({ url_regulamin: zly, url_organizer: zly });
    assert.ok(!/<a /.test(html), `${zly}: link wyrenderowany: ${html.slice(0, 80)}`);
    assert.ok(!/javascript:/i.test(html));
  }
  const ok = linki({ url_regulamin: 'https://x', url_organizer: 'https://y' });
  assert.equal((ok.match(/<a href="https:\/\/[xy]"/g) || []).length, 2, ok.slice(0, 200));
  assert.equal((ok.match(/rel="noopener"/g) || []).length, 2);
});

test('races.html: żaden href nie idzie przez escAttr', () => {
  assert.ok(!/href="\$\{escAttr\(/.test(races), 'href przez escAttr wrócił');
});
