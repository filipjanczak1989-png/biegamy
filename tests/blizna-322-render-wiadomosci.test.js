/* BLIZNA 322 (20.11.2026) — renderMessageBody (sb.js): treść wiadomości z bazy NIGDY nie idzie na stronę surowo. Rozpoznane formaty
   (cofnięta, głosówka, obrazki) są składane od zera ze zwalidowanych kawałków, reszta przez escapeHtml. W bazie są wiadomości
   z onclick w treści (głosówki i obrazki ze starych formatów) — z tej treści na stronę nie może przejść żaden atrybut zdarzenia
   poza stałymi, które dokłada sama funkcja (playVoice/playVoiceMsg ze zwalidowaną ścieżką, window.open(this.src)). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { zaladujSb } = require('./_srodowisko');

const ctx = zaladujSb();
const r = (b) => ctx.renderMessageBody(b);
const ZNAK = 'XSS_B322';
const ZLE_ON = ` onerror="globalThis.${ZNAK}()"`;
const SCIEZKA = '0123abcd-0123-4567-89ab-0123456789ab/glos_1.webm';

function tagi(html) {
  const wynik = [];
  const re = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>`]+))?)*)\s*\/?>/g;
  let m;
  while ((m = re.exec(html))) {
    const atr = {};
    const ra = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;
    let a;
    while ((a = ra.exec(m[2]))) atr[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    wynik.push({ nazwa: m[1].toLowerCase(), atr });
  }
  return wynik;
}
const zdarzenia = (html) => tagi(html).flatMap((t) => Object.entries(t.atr).filter(([k]) => /^on/.test(k)).map(([k, v]) => k + '=' + v));
const glosowka = (onclick, reszta) => '<div class="voice-msg"><button class="voice-play" onclick="' + onclick + '"' + (reszta || '') + '>▶️</button>'
  + '<div style="flex:1;height:3px;background:var(--border);border-radius:2px;"><div style="height:3px;background:var(--accent);width:100%;border-radius:2px;"></div></div><span class="voice-duration">12s</span></div>';

test('głosówka w formacie aplikacji: odbudowana, jedyne zdarzenie to playVoice ze zwalidowaną ścieżką', () => {
  const h = r(glosowka("playVoice(this,'" + SCIEZKA + "')"));
  assert.deepEqual(zdarzenia(h), ["onclick=playVoice(this,'" + SCIEZKA + "')"]);
  assert.deepEqual(tagi(h).map((t) => t.nazwa), ['div', 'button', 'div', 'div', 'span']);
  assert.match(h, /class="voice-duration">12s</);
});

test('głosówka trenera (biały pasek): playVoiceMsg, ten sam wzorzec', () => {
  const h = r('<div class="voice-msg"><button class="voice-play" onclick="playVoiceMsg(this,\'' + SCIEZKA + '\')">▶️</button><div style="flex:1;height:3px;background:rgba(255,255,255,0.2);"></div><span class="voice-duration">7s</span></div>');
  assert.deepEqual(zdarzenia(h), ["onclick=playVoiceMsg(this,'" + SCIEZKA + "')"]);
});

test('głosówka z dopisanym onerror i obrazkiem: dopiski znikają, zostaje czysta odbudowa', () => {
  const czysta = r(glosowka("playVoice(this,'" + SCIEZKA + "')"));
  const h = r(glosowka("playVoice(this,'" + SCIEZKA + "')", ZLE_ON).replace('<span class="voice-duration">', '<img src=x' + ZLE_ON + '><span class="voice-duration">'));
  assert.equal(h, czysta);
  assert.ok(!h.includes(ZNAK));
});

test('głosówka ze ścieżką spoza wzorca (kod w onclick): żadnego tagu, cała treść jako tekst', () => {
  const h = r(glosowka("playVoice(this,'x');globalThis." + ZNAK + "();('')"));
  assert.deepEqual(tagi(h), []);
  assert.ok(h.includes('&lt;div class=&quot;voice-msg&quot;&gt;'));
});

test('obrazek ze starego formatu (ścieżka + własny onclick): tylko src przechodzi, onclick stały', () => {
  const h = r('<img src="0123abcd/zdj.jpg" style="max-width:100%" onclick="window.open(\'0123abcd/zdj.jpg\',\'_blank\');globalThis.' + ZNAK + '()">');
  const t = tagi(h);
  assert.equal(t.length, 1);
  assert.equal(t[0].nazwa, 'img');
  assert.equal(t[0].atr['data-sp'], '0123abcd/zdj.jpg');
  assert.deepEqual(zdarzenia(h), ["onclick=window.open(this.src,'_blank')"]);
  assert.ok(!h.includes(ZNAK));
});

test('obrazek z dozwolonego hosta z onerror: onerror znika, src zostaje', () => {
  const h = r('<img src="https://media1.tenor.com/a.gif"' + ZLE_ON + '>');
  const t = tagi(h);
  assert.equal(t.length, 1);
  assert.equal(t[0].atr.src, 'https://media1.tenor.com/a.gif');
  assert.deepEqual(zdarzenia(h), ["onclick=window.open(this.src,'_blank')"]);
});

test('obrazek z obcego hosta i obrazek bez cudzysłowów: bez tagu, tekst', () => {
  assert.deepEqual(tagi(r('<img src="https://zly.example/a.png">')), []);
  assert.match(r('<img src="https://zly.example/a.png">'), /^\[zdjęcie: https:\/\/zly\.example\/a\.png\]$/);
  assert.deepEqual(tagi(r('<img src=x' + ZLE_ON + '>')), []);
});

test('wiele obrazków z tekstem między nimi: tekst escapowany, każdy obrazek ze stałym onclick', () => {
  const h = r('a <b>b</b> <img src="p/1.jpg"' + ZLE_ON + '> c <img src="p/2.jpg"> <script>globalThis.' + ZNAK + '()</script>');
  assert.deepEqual(tagi(h).map((t) => t.nazwa), ['img', 'img']);
  assert.deepEqual(zdarzenia(h), ["onclick=window.open(this.src,'_blank')", "onclick=window.open(this.src,'_blank')"]);
  assert.ok(h.includes('&lt;b&gt;b&lt;/b&gt;') && h.includes('&lt;script&gt;'));
});

test('cofnięta: zawsze stały HTML, cokolwiek było w środku', () => {
  assert.equal(r('<span class="msg-recall">Wiadomość cofnięta</span>'), '<span class="msg-recall">Wiadomość cofnięta</span>');
  assert.equal(r('<span class="msg-recall"><img src=x' + ZLE_ON + '></span>'), '<span class="msg-recall">Wiadomość cofnięta</span>');
});

test('zwykły tekst: escapowany, także z tagiem i apostrofem; pusty → pusty', () => {
  const h = r(`hej "trenerze" <img src=x${ZLE_ON}> it's`);
  assert.deepEqual(tagi(h), []);
  assert.doesNotMatch(h, /[<>"']/);
  assert.equal(r(''), '');
  assert.equal(r(null), '');
});

test('samokontrola: detektor widzi atrybut zdarzenia i tag w surowym HTML', () => {
  assert.deepEqual(zdarzenia('<img src=x onerror=a.b()>'), ['onerror=a.b()']);
  assert.equal(tagi('<div><img src="a"></div>').length, 2);
});
