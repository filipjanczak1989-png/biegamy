// Blizna #354 (25.11.2026) — wątek czatu między zawodnikami pokazuje 200 NAJNOWSZYCH wiadomości, nie 200 najstarszych.
//
// zawodnik.html _loadPeerThreadZ i profil.html _pcLoad pobierały peer_messages z .order('sent_at',{ascending:true}).limit(200).
// W rozmowie dłuższej niż 200 wiadomości okno stawało na 200. wiadomości od początku: nowe (także własne, dopiero wysłane)
// nie pojawiały się wcale. Poprawka: order malejąco + limit 200, potem odwrócenie do wyświetlenia. Kolejność w oknie
// i przewijanie na dół bez zmian. Czat z trenerem (loadCoachChat, loadMessages, _loadProfileMsgs) robił to dobrze od początku.
//
// Test uruchamia OBIE funkcje ze źródeł stron na atrapie bazy, która naprawdę sortuje i tnie limitem.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '');
const JA = 'ja', ON = 'on';

function rozmowa(n) {
  const start = Date.UTC(2026, 9, 1, 8, 0, 0);
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, from_id: i % 3 ? JA : ON, to_id: i % 3 ? ON : JA, body: 'wiadomość nr ' + (i + 1) + ' <b>&', sent_at: new Date(start + i * 3600e3).toISOString(), read: false }));
}
function atrapaBazy(wiersze) {
  const zapytania = [];
  const sb = { from(tabela) {
    const q = { tabela, order: null, limit: null, op: 'select' };
    const b = {
      select() { return b; }, or() { return b; }, eq() { return b; },
      update() { q.op = 'update'; return b; },
      order(kol, o) { q.order = [kol, o && o.ascending]; return b; },
      limit(n) { q.limit = n; return b; },
      then(ok, zle) {
        zapytania.push(q);
        if (q.op !== 'select') return Promise.resolve({ data: null, error: null }).then(ok, zle);
        let d = wiersze.slice();
        if (q.order) d.sort((x, y) => (x[q.order[0]] < y[q.order[0]] ? -1 : 1) * (q.order[1] ? 1 : -1));
        if (q.limit != null) d = d.slice(0, q.limit);
        return Promise.resolve({ data: d, error: null }).then(ok, zle);
      },
    };
    return b;
  } };
  return { sb, zapytania };
}
function okno() { return { innerHTML: '', scrollTop: 0, scrollHeight: 5000, clientHeight: 600 }; }
const numery = (html) => [...html.matchAll(/wiadomość nr (\d+) /g)].map((m) => Number(m[1]));

const FUNKCJE = [
  ['zawodnik.html', '_loadPeerThreadZ', 'msgs-thread', (kod, sb, el) => new Function('sb', 'document', 'window', '_athleteId', 'var _msgPaginationActive = true;\n' + kod + '\nreturn _loadPeerThreadZ;')(sb, { getElementById: (id) => (id === 'msgs-thread' ? el : null) }, { bmBladSieci: () => false }, JA)],
  ['profil.html', '_pcLoad', 'pc-thread', (kod, sb, el) => new Function('sb', 'document', 'window', '_myId', 'function escHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }\n' + kod + '\nreturn _pcLoad;')(sb, { getElementById: (id) => (id === 'pc-thread' ? el : null) }, { bmBladSieci: () => false, bmStanOffline: () => {} }, JA)],
];
function zrodlo(plik, nazwa) {
  const m = czytaj(plik).match(new RegExp('async function ' + nazwa + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}\\n'));
  assert.ok(m, 'brak ' + nazwa + ' w ' + plik);
  return m[0];
}

for (const [plik, nazwa, , zbuduj] of FUNKCJE) {
  test(plik + ' ' + nazwa + ': rozmowa 250 wiadomości → w oknie 51…250, od najstarszej do najnowszej, przewinięte na dół', async () => {
    const { sb, zapytania } = atrapaBazy(rozmowa(250));
    const el = okno();
    await zbuduj(zrodlo(plik, nazwa), sb, el)(ON, false);
    const n = numery(el.innerHTML);
    assert.equal(n.length, 200);
    assert.deepEqual([n[0], n[199]], [51, 250], 'pierwsza i ostatnia w oknie');
    assert.deepEqual(n, n.slice().sort((a, b) => a - b), 'kolejność w oknie rosnąca jak dotąd');
    assert.equal(el.scrollTop, el.scrollHeight, 'okno przewinięte na dół');
    const q = zapytania.find((x) => x.tabela === 'peer_messages' && x.op === 'select');
    assert.deepEqual([q.order, q.limit], [['sent_at', false], 200], 'zapytanie: od najnowszych, limit 200');
    assert.ok(el.innerHTML.indexOf('Dziś') === -1 && (el.innerHTML.match(/text-transform:uppercase/g) || []).length >= 8, 'nagłówki dni dalej są (rozmowa z października)');
    assert.ok(!/<b>/.test(el.innerHTML), 'treść dalej escapowana');
  });

  test(plik + ' ' + nazwa + ': krótka rozmowa bez zmian (5 wiadomości w kolejności), pusta = „Brak wiadomości”, ciche odświeżenie nie przewija z góry', async () => {
    let el = okno(); let b = atrapaBazy(rozmowa(5));
    await zbuduj(zrodlo(plik, nazwa), b.sb, el)(ON, false);
    assert.deepEqual(numery(el.innerHTML), [1, 2, 3, 4, 5]);
    el = okno(); b = atrapaBazy([]);
    await zbuduj(zrodlo(plik, nazwa), b.sb, el)(ON, false);
    assert.match(el.innerHTML, /Brak wiadomości/);
    el = okno(); el.scrollTop = 100; b = atrapaBazy(rozmowa(250));   // czyta starsze wiadomości (daleko od dołu) → odświeżenie w tle nie rusza przewinięcia
    await zbuduj(zrodlo(plik, nazwa), b.sb, el)(ON, true);
    assert.equal(el.scrollTop, 100);
    assert.equal(numery(el.innerHTML)[199], 250);
  });
}

test('żaden wątek wiadomości nie łączy „od najstarszych” z limitem (messages, peer_messages)', () => {
  const zle = [];
  for (const f of fs.readdirSync(KORZEN).filter((x) => /\.html$/.test(x))) {
    const t = czytaj(f);
    for (const m of t.matchAll(/from\('(messages|peer_messages)'\)[^;]{0,600}?\.order\('sent_at',\s*\{\s*ascending:\s*true\s*\}\)[^;]{0,200}?\.limit\(/g)) zle.push(f + ': ' + m[1]);
  }
  assert.deepEqual(zle, []);
  // wątki czatu z trenerem: od początku „od najnowszych + odwrócenie”
  assert.match(czytaj('trener.html'), /from\('messages'\)\.select\('\*'\)\.eq\('athlete_id',_currentChatAthleteId\)\.order\('sent_at',\{ascending:false\}\)\.limit\(200\);[\s\S]{0,300}data\.reverse\(\)/);
});
