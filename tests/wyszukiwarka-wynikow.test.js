// ─────────────────────────────────────────────────────────────────────────────
// WYSZUKIWARKA WYNIKÓW (js/wyszukiwarka-wynikow.js, races.html) — widżet na danych z RPC.
//
// Pilnuje decyzji z 9.10.2026: dane z bazy tylko jako TEKST (wyniki to cudze nazwiska z zewnętrznych źródeł),
// link wyłącznie przez window.safeExternalHref z sb.js, kolory wyłącznie var() z theme.css, ŻADNEGO importu
// profilu Enduhub (regulamin V.5.c) i oznaczenie „prawdopodobnie" przy grupach dopiętych po nazwisku+roczniku.
//
// !! WŁASNY MINI-DOM, NIE atrapaElementu(). Atrapa z _srodowisko.js oddaje nowy obiekt przy każdym wywołaniu
//    i nie ma drzewa — test „nic nie wstrzyknięto" byłby zielony zawsze. Tu elementy mają dzieci, tekst
//    i atrybuty, więc da się sprawdzić, CO widżet zbudował. escapeHtml/safeExternalHref pochodzą z PRAWDZIWEGO
//    sb.js (zaladujSb), bo pułapka &amp; leży właśnie na styku z nimi.
// !! jsdom tu NIE wchodzi: repo nie ma package.json, CI uruchamia `node --test` bez zależności.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const ZRODLO = fs.readFileSync(path.join(KORZEN, 'js', 'wyszukiwarka-wynikow.js'), 'utf8');

function miniDom() {
  class Wezel { constructor(doc) { this.ownerDocument = doc; this.children = []; this.parent = null; } }
  class Tekst extends Wezel { constructor(doc, t) { super(doc); this.data = String(t); } get textContent() { return this.data; } }
  class Element extends Wezel {
    constructor(doc, tag) { super(doc); this.tagName = tag.toUpperCase(); this.attrs = {}; this.className = ''; this.sluchacze = {}; }
    append(...w) { for (const x of w) { const n = typeof x === 'string' ? new Tekst(this.ownerDocument, x) : x; n.parent = this; this.children.push(n); } }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    addEventListener(t, f) { (this.sluchacze[t] = this.sluchacze[t] || []).push(f); }
    click() { (this.sluchacze.click || []).forEach((f) => f.call(this, { type: 'click' })); }
    get textContent() { return this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this.children = []; if (v !== '' && v != null) this.append(new Tekst(this.ownerDocument, v)); }
    get innerHTML() { throw new Error('widżet nie może czytać innerHTML'); }
    set innerHTML(v) { throw new Error('widżet nie może pisać innerHTML'); }
    wszystkie(tag) { const out = []; const idz = (n) => { for (const c of n.children) { if (c.tagName === tag) out.push(c); if (c.children) idz(c); } }; idz(this); return out; }
  }
  const doc = { createElement: (t) => new Element(doc, t), createTextNode: (t) => new Tekst(doc, t) };
  return { doc, root: new Element(doc, 'div') };
}

function zaladujWidzet() {
  const ctx = zaladujSb();
  vm.runInContext(ZRODLO, ctx, { filename: 'js/wyszukiwarka-wynikow.js' });
  return ctx;
}

const ZLY = '<img src=x onerror=alert(1)>';
function klient(wywolania) {
  return {
    rpc: async (fn, args) => {
      wywolania.push([fn, args]);
      if (fn === 'search_runners') return { data: [
        { runner_key: 'datasport:1', display_name: ZLY, yob: 1980, results_count: 2, last_city: ZLY, last_event: 'Bieg', probable: true },
        { runner_key: 'k:jan kowalski|1990', display_name: 'Jan Kowalski', yob: 1990, results_count: 1, last_city: null, last_event: 'Inny bieg', probable: false },
      ] };
      if (fn === 'runner_results') return { data: [
        { event_name: ZLY, result_url: 'javascript:alert(1)', event_date: '2026-10-04', distance_km: '10', time_seconds: 2710, position_total: 3, position_category: 1, scope: 'public' },
        { event_name: 'Półmaraton', result_url: 'https://wyniki.example.org/r?a=1&b=2', event_date: '2026-09-01', distance_km: '21.0975', time_seconds: 5400, position_total: 40, scope: 'public' },
      ] };
      return { data: [] };
    },
  };
}

test('dane z RPC trafiają jako tekst — żaden wstrzyknięty element, innerHTML nieużywane', async () => {
  const ctx = zaladujWidzet(); const { root } = miniDom(); const w = [];
  const api = ctx.initResultsSearch({ client: klient(w), root, debounceMs: 0 });
  await api.search('Jan Kowalski');
  assert.equal(root.wszystkie('IMG').length, 0);
  assert.ok(root.textContent.includes(ZLY), 'złośliwy tekst widoczny jako tekst');
  root.wszystkie('BUTTON')[0].click(); await new Promise((r) => setImmediate(r));
  assert.equal(root.wszystkie('IMG').length, 0);
  assert.ok(root.textContent.includes('45:10') && root.textContent.includes('1:30:00'));
});

test('linki: javascript: odrzucony, https z & w parametrach dokładnie jak w bazie (bez &amp;)', async () => {
  const ctx = zaladujWidzet(); const { root } = miniDom();
  const api = ctx.initResultsSearch({ client: klient([]), root, debounceMs: 0 });
  await api.search('Jan Kowalski');
  root.wszystkie('BUTTON')[0].click(); await new Promise((r) => setImmediate(r));
  const a = root.wszystkie('A');
  assert.equal(a.length, 1);
  assert.equal(a[0].getAttribute('href'), 'https://wyniki.example.org/r?a=1&b=2');
  assert.equal(a[0].getAttribute('rel'), 'noopener noreferrer');
});

test('grupa z probable=true ma oznaczenie „prawdopodobnie", grupa bez — nie ma', async () => {
  const ctx = zaladujWidzet(); const { root } = miniDom();
  const api = ctx.initResultsSearch({ client: klient([]), root, debounceMs: 0 });
  await api.search('Jan Kowalski');
  const [b1, b2] = root.wszystkie('BUTTON');
  assert.match(b1.textContent, /prawdopodobnie/);
  assert.doesNotMatch(b2.textContent, /prawdopodobnie/);
});

test('szczegóły pobierane po runner_key (API migracji 004), nie po nazwisku i roczniku', async () => {
  const ctx = zaladujWidzet(); const { root } = miniDom(); const w = [];
  const api = ctx.initResultsSearch({ client: klient(w), root, debounceMs: 0 });
  await api.search('Jan Kowalski');
  root.wszystkie('BUTTON')[1].click(); await new Promise((r) => setImmediate(r));
  assert.deepEqual(JSON.parse(JSON.stringify(w.find(([fn]) => fn === 'runner_results')[1])), { p_runner_key: 'k:jan kowalski|1990' });
});

test('mniej niż 3 znaki nie woła RPC; wyprzedzone zapytanie nie nadpisuje nowszego', async () => {
  const ctx = zaladujWidzet(); const { root } = miniDom(); const w = [];
  let zwolnij;
  const wolny = { rpc: (fn, args) => { w.push(args.q); if (args.q === 'Stary') return new Promise((r) => { zwolnij = () => r({ data: [{ runner_key: 'x', display_name: 'STARY', results_count: 1 }] }); }); return Promise.resolve({ data: [{ runner_key: 'y', display_name: 'NOWY', results_count: 1 }] }); } };
  const api = ctx.initResultsSearch({ client: wolny, root, debounceMs: 0 });
  await api.search('ab');
  assert.equal(w.length, 0);
  const p1 = api.search('Stary'); await api.search('Nowy'); zwolnij(); await p1;
  assert.ok(root.textContent.includes('NOWY') && !root.textContent.includes('STARY'));
});

test('kod: bez importu Enduhub, bez innerHTML, bez functions.invoke — kolory tylko var() istniejące w theme.css', () => {
  const kod = ZRODLO.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(kod, /enduhub|results-import|functions\.invoke|importBox|innerHTML|insertAdjacentHTML|document\.write/i);
  assert.doesNotMatch(kod, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'kolor wpisany na sztywno');
  const theme = fs.readFileSync(path.join(KORZEN, 'theme.css'), 'utf8');
  const zmienne = [...new Set([...kod.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]))];
  for (const v of ['--card', '--fg', '--accent', '--muted']) assert.ok(zmienne.includes(v), `brak ${v}`);
  for (const v of zmienne) assert.match(theme, new RegExp(`${v}\\s*:`), `theme.css nie definiuje ${v}`);
});

test('liczba wyników po polsku: 1 wynik, 2–4 wyniki (bez 12–14), reszta wyników', () => {
  const { liczbaWynikow } = zaladujWidzet()._wyszukiwarkaWynikow;
  const oczek = { 1: '1 wynik', 2: '2 wyniki', 4: '4 wyniki', 5: '5 wyników', 12: '12 wyników', 14: '14 wyników', 22: '22 wyniki', 25: '25 wyników', 0: '0 wyników' };
  for (const [n, t] of Object.entries(oczek)) assert.equal(liczbaWynikow(Number(n)), t);
});

test('races.html: skrypt klasyczny zaraz po sb.js, start dopiero po sprawdzeniu sesji', () => {
  const html = fs.readFileSync(path.join(KORZEN, 'races.html'), 'utf8');
  assert.match(html, /<script src="sb\.js"><\/script><script src="js\/dzis-offline\.js"><\/script><script src="js\/wyszukiwarka-wynikow\.js"><\/script>/);
  assert.doesNotMatch(html, /type="module"[^>]*wyszukiwarka|import\s*\{\s*initResultsSearch/);
  const sesja = html.indexOf("if (!session) { location.href = 'index.html'; return; }");
  const init = html.indexOf('window.initResultsSearch(');
  assert.ok(sesja > 0 && init > sesja, 'initResultsSearch dopiero po sprawdzeniu sesji');
});
