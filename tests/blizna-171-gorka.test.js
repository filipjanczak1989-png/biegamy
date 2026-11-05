/* BLIZNA 171 / GÓRKA WOJTASZAKA (Filip 5.11): odcinek w rundzie: podjazd tempo −25% i cegły wyżej, zjazd +30% i łuk cegieł.
   - nazwa roweru tylko z rowerzysta_opis, w kodzie jej nie ma;
   - przechył to samo rysowanie: kolizje liczą dalej po ziemi;
   - Mały budowniczy bez górki; bez arkusza pchania rower ma zwykłe klatki.
   Po skutku: przeglądarka (narzędzie poza repo). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;

test('fazy, tempo i przechył', () => {
  const g = L.nowaGorka(1000, 400);
  assert.equal(g.szczyt, 1000 + 400 * 0.75 * 6); assert.equal(g.doo, g.szczyt + 400 * 1.3 * 4);
  assert.equal(L.fazaGorki(999, g), null); assert.equal(L.fazaGorki(g.doo, g), null); assert.equal(L.fazaGorki(5000, null), null);
  const pod = L.fazaGorki(1100, g), zj = L.fazaGorki(g.szczyt + 100, g);
  assert.equal(pod.faza, 'podjazd'); assert.equal(zj.faza, 'zjazd');
  assert.equal(L.tempoGorki(pod), 0.75); assert.equal(L.tempoGorki(zj), 1.3); assert.equal(L.tempoGorki(null), 1);
  assert.ok(L.katGorki({ faza: 'podjazd', p: 0.5 }) < 0 && L.katGorki({ faza: 'zjazd', p: 0.5 }) > 0);
  assert.equal(Math.abs(L.katGorki({ faza: 'podjazd', p: 1 })), 0, 'na szczycie płasko'); assert.equal(L.katGorki(null), 0);
});

test('kto ma górkę; klatki pchania 1–3, szczyt 4, zjazd 5–6', () => {
  assert.equal(L.gorkaWRundzie(4, false), false); assert.equal(L.gorkaWRundzie(5, false), true); assert.equal(L.gorkaWRundzie(20, true), false, 'Mały budowniczy');
  for (let a = 0; a < 12; a++) { const k = L.klatkaGorki({ faza: 'podjazd', p: 0.5 }, a); assert.ok(k >= 0 && k <= 2, 'podjazd ' + k); const z = L.klatkaGorki({ faza: 'zjazd', p: 0.5 }, a); assert.ok(z === 4 || z === 5, 'zjazd ' + z); }
  assert.equal(L.klatkaGorki({ faza: 'podjazd', p: 0.95 }, 0), 3);
});

test('dymek o rowerze: nazwa z opisu w bazie, w kodzie jej nie ma', () => {
  assert.equal(L.tekstPrzerzutek('na Składaku'), 'Na Składaku nie ma przerzutek!');
  assert.equal(L.tekstPrzerzutek(''), 'Tu przydałyby się przerzutki!'); assert.equal(L.tekstPrzerzutek(null), 'Tu przydałyby się przerzutki!');
  for (const p of ['js/cegielki-logika.mjs', 'js/cegielki.js', 'js/cegielki-konto.js']) assert.doesNotMatch(czytaj(p), /wigr|sławek|slawek/i, p);
  assert.match(czytaj('js/cegielki-konto.js'), /rowerNa: function \(\) \{ return stan\.rower \? L\.rowerZPodpisu\(stan\.podpisRoweru\) : null; \}/, 'bez przełącznika bez dymka');
});

test('silnik: tempo w celu prędkości, cegły w zasięgu, kolizje bez przechyłu, tło na żądanie', () => {
  const s = czytaj('js/cegielki.js');
  assert.match(s, /var cel = g\.predBaza \* L\.tempoGorki\(g\.gorkaFaza\) \*/);
  assert.match(s, /ep\.h = Math\.min\(zasieg, ep\.h \+ L\.GORKA\.wyzej\)/);
  assert.match(s, /\(fazaXp && fazaXp\.faza === "zjazd"\) \|\| r < pLuk/, 'zjazd: łuk przy każdej przeszkodzie');
  assert.match(s, /&& k !== "gorka" && k !== "trawa_pod_droga"; \}\)/, 'bez górki tła nie pobiera');
  for (const l of s.split('\n').filter((w) => /katDrogi|przechyl/.test(w))) assert.doesNotMatch(l, /roznica|uderzenie|zbierz\(/, l);
  const atlas = JSON.parse(czytaj('assets/gra/atlas.json'));
  assert.ok(atlas.gorka && fs.statSync(path.join(__dirname, '..', 'assets/gra/gorka.webp')).size < 150 * 1024);
});

test('drużyna za graczem: rozdział Wszyscy razem, tłum z muru, sam obraz', () => {
  assert.equal(L.druzynaWRundzie(14, false), false); assert.equal(L.druzynaWRundzie(15, false), true); assert.equal(L.druzynaWRundzie(19, false), true); assert.equal(L.druzynaWRundzie(20, false), false); assert.equal(L.druzynaWRundzie(16, true), false, 'Mały budowniczy');
  assert.deepEqual([0, 0.24, 0.25, 0.5, 0.74, 0.75, 1].map((p) => L.grupyDruzyny(p * 1000, 1000)), [1, 1, 2, 2, 2, 3, 3]);
  assert.equal(L.grupyDruzyny(5, 0), 1); assert.equal(L.grupyDruzyny(undefined, undefined), 1);
  const s = czytaj('js/cegielki.js'), f = s.slice(s.indexOf('function rysujDruzyne'), s.indexOf('function rysujTowarzysza'));
  assert.doesNotMatch(f, /uderzenie|zbierz|g\.cegly|przeszkody/, 'nie jest przeszkodą');
  assert.ok(JSON.parse(czytaj('assets/gra/atlas.json')).druzyna);
});
