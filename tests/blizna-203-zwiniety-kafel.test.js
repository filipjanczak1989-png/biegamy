/* BLIZNA 203 / KRZYŻYK ZWIJA, NIE USUWA (Filip 9.11, po wdrożeniu 73d95ab1). Po krzyżyku akcja znikała z Dziś całkiem, a powrót był tylko w Profil → Ustawienia.
   Teraz zamiast kafla zostaje jeden niski pasek w tym samym miejscu: „🧱 Ulica <imię z bazy> · <km z licznika> km · Pokaż ›”. Dotknięcie rozwija kafel i zapisuje to
   w profilu (akcja_kafel_ukryj(slug, false), jak „Pokaż” w Ustawieniach). Pasek bez krzyżyka. Bez migracji: stan zwinięcia już jest w profilu (akcja_ukryte).
   Atrapa DOM szuka dzieci po klasie naprawdę (querySelector, children), więc test widzi pasek i kafel tak jak przeglądarka. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const UID = '11111111-2222-3333-4444-555555555555', KLUCZ = 'bm_akcja_ukryta_dla-fabianka_' + UID;
const D = { wystartowala: true, wystartowala_at: '2026-11-07T08:00:00Z', start: '2026-11-07', nazwa: 'Akcja', imie: 'Marek', cel_km: 12500, suma_km: 702.4, pct: 5.6,
  stawka_filip_gr: 10, filip_gr: 7024, filip_max_gr: 125000, url_zbiorki: 'https://www.siepomaga.pl/x', firmy: [], ulica: { cegly: [], cegly_n: 0 } };

function wezel(tag) {
  const e = { tagName: String(tag).toUpperCase(), className: '', innerHTML: '', style: {}, children: [], atr: {}, sl: {}, parentNode: null,
    classList: { add(c) { const k = e.className.split(/\s+/).filter(Boolean); if (!k.includes(c)) k.push(c); e.className = k.join(' '); },
      remove(c) { e.className = e.className.split(/\s+/).filter((x) => x && x !== c).join(' '); }, contains: (c) => e.className.split(/\s+/).includes(c) },
    setAttribute(k, v) { e.atr[k] = String(v); }, getAttribute: (k) => (k in e.atr ? e.atr[k] : null),
    appendChild(x) { e.children.push(x); x.parentNode = e; return x; }, removeChild(x) { e.children = e.children.filter((y) => y !== x); x.parentNode = null; return x; },
    addEventListener(t, f) { (e.sl[t] = e.sl[t] || []).push(f); },
    /* klasy zakodowane w innerHTML kafla: stała atrapa na selektor, jak elementy z innerHTML w przeglądarce */
    _wnetrze: {},
    querySelector(s) {
      const kl = s.replace(/^\./, '');
      const dziecko = e.children.find((x) => x.className.split(/\s+/).includes(kl));
      if (dziecko) return dziecko;
      if (e.innerHTML.includes('class="' + kl) || e.innerHTML.includes(' ' + kl + '"')) return (e._wnetrze[s] = e._wnetrze[s] || wezel('div'));
      return null;
    },
    querySelectorAll: () => [] };
  return e;
}
function swiat(zapis, rpc) {
  const el = { 'akcja-karta': wezel('div'), 'daily-motivation': wezel('div') }, magazyn = Object.assign({}, zapis), wolania = [], tosty = [];
  const localStorage = { getItem: (k) => (k in magazyn ? magazyn[k] : null), setItem: (k, v) => { magazyn[k] = String(v); }, removeItem: (k) => { delete magazyn[k]; } };
  const document = { readyState: 'complete', addEventListener() {}, getElementById: (id) => el[id] || null, querySelectorAll: () => [], createElement: (t) => wezel(t), head: wezel('head') };
  const sb = { rpc: (n, a) => { wolania.push([n, JSON.stringify(a)]); return Promise.resolve(rpc ? rpc(n, a) : { data: null, error: { message: 'brak' } }); } };
  const https = (u) => (/^https:\/\//.test(String(u || '')) ? String(u) : '');
  const ctx = { document, localStorage, Date, JSON, Math, Number, String, Intl, Promise, setTimeout: () => 0, console, sb, showToast: (t) => tosty.push(t), safeExternalHref: https, safeUrlAttr: https };
  ctx.globalThis = ctx;
  vm.runInNewContext(czytaj('js/akcja.mjs'), ctx);
  const b = el['daily-motivation'];
  return { ctx, b, magazyn, wolania, tosty,
    kafel: () => b.children.find((x) => x.className === 'akcja-dzis') || null,
    pasek: () => b.children.find((x) => x.className === 'akcja-dzis-zwiniety') || null,
    kafelki: () => wolania.filter((w) => /^akcja_kafel_/.test(w[0])) };
}
const sesja = { 'sb-afqojgkaveykxbltxzwm-auth-token': JSON.stringify({ user: { id: UID } }) };
const czekaj = () => new Promise((r) => setImmediate(r));
const tekst = (p) => p.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/ /g, ' ').trim();

test('krzyżyk zwija: zamiast kafla pasek „🧱 Ulica … · km · Pokaż ›” w tym samym banerze, bez krzyżyka; zwinięcie w profilu; mała karta znika', async () => {
  const s = swiat(sesja, (n) => (n === 'akcja_kafel_ukryty' ? { data: false, error: null } : { data: true, error: null }));
  s.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 3 });
  await czekaj();
  const k = s.kafel(); assert.ok(k, 'kafel stoi'); assert.equal(s.pasek(), null);
  k.querySelector('.akcja-dzis-ukryj').sl.click[0]({ preventDefault() {}, stopPropagation() {} });
  assert.equal(s.kafel(), null, 'kafel zwinięty');
  const p = s.pasek();
  assert.ok(p, 'pasek w tym samym banerze'); assert.equal(p.tagName, 'BUTTON'); assert.equal(p.atr['aria-expanded'], 'false');
  assert.equal(tekst(p), '🧱 Ulica Marka · 702 km Pokaż ›', 'imię w dopełniaczu z licznika, km z licznika');
  assert.doesNotMatch(p.innerHTML, /×|ukryj/i, 'pasek bez krzyżyka: bardziej schować się nie da');
  assert.ok(s.b.classList.contains('akcja-baner') && s.b.classList.contains('akcja-baner--zwiniety'), 'baner zwinięty (cytat pod spodem, film nie gra)');
  assert.equal(s.magazyn[KLUCZ], 'czeka');
  await czekaj();
  assert.deepEqual(s.kafelki().map((w) => w.join(' ')).slice(-1), ['akcja_kafel_ukryj {"p_slug":"dla-fabianka","p_ukryj":true}']);
  assert.equal(s.magazyn[KLUCZ], '1');
  assert.match(s.tosty[0], /zwinięty\. Dotknij paska, żeby go rozwinąć\./);
  assert.equal(s.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 3 }), '', 'przy zwiniętym kaflu mała karta nie stoi (decyzja Filipa 9.11)');
  assert.ok(s.pasek(), 'kolejne odświeżenie: dalej pasek, nie pustka');
  s.ctx.BM_AKCJA.kartaDzisHtml(Object.assign({}, D, { suma_km: 1900 }), { km: 3 });
  assert.match(tekst(s.pasek()), /· 1 900 km/, 'km z licznika odświeżają się na pasku');
  assert.equal(s.b.children.filter((x) => x.className === 'akcja-dzis-zwiniety').length, 1, 'jeden pasek');
});

test('dotknięcie paska rozwija kafel i zapisuje to w profilu (jak „Pokaż” w Ustawieniach); bez sieci dopisuje przy następnym wejściu', async () => {
  const s = swiat(Object.assign({ [KLUCZ]: '1' }, sesja), (n) => (n === 'akcja_kafel_ukryty' ? { data: true, error: null } : { data: false, error: null }));
  s.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 3 });
  await czekaj();
  assert.ok(s.pasek()); assert.equal(s.kafel(), null);
  s.pasek().sl.click[0]({ preventDefault() {}, stopPropagation() {} });
  assert.ok(s.kafel(), 'kafel wraca od razu'); assert.equal(s.pasek(), null, 'pasek znika');
  assert.ok(!s.b.classList.contains('akcja-baner--zwiniety'));
  assert.equal(s.magazyn[KLUCZ], 'pokaz-czeka');
  await czekaj();
  assert.equal(s.kafelki().map((w) => w.join(' ')).slice(-1)[0], 'akcja_kafel_ukryj {"p_slug":"dla-fabianka","p_ukryj":false}', 'ta sama funkcja co „Pokaż” w Ustawieniach');
  assert.ok(!(KLUCZ in s.magazyn), 'profil zapisany: kopia w telefonie zbędna');
  /* rozwinięty bez sieci: przy następnym wejściu kafel od razu, a profil dosłany */
  const n = swiat(Object.assign({ [KLUCZ]: 'pokaz-czeka' }, sesja), () => ({ data: false, error: null }));
  n.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 3 });
  assert.ok(n.kafel(), 'rozwinięty bez sieci: kafel, nie pasek'); assert.equal(n.pasek(), null);
  await czekaj();
  assert.deepEqual(n.kafelki().map((w) => w.join(' ')), ['akcja_kafel_ukryj {"p_slug":"dla-fabianka","p_ukryj":false}']);
});

test('zwinięty na innym telefonie: tu pasek (nie pustka); rozwinięty gdzie indziej: tu kafel; koniec akcji zdejmuje i pasek; bez sesji nic', async () => {
  const a = swiat(sesja, (n) => (n === 'akcja_kafel_ukryty' ? { data: true, error: null } : { data: true, error: null }));
  a.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 1 });
  assert.ok(a.kafel(), 'przed odpowiedzią bazy: kafel z telefonu');
  await czekaj();
  assert.equal(a.kafel(), null); assert.ok(a.pasek(), 'profil mówi „zwinięty”: pasek'); assert.equal(a.magazyn[KLUCZ], '1');
  const b = swiat(Object.assign({ [KLUCZ]: '1' }, sesja), (n) => (n === 'akcja_kafel_ukryty' ? { data: false, error: null } : null));
  b.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 1 });
  assert.ok(b.pasek()); await czekaj();
  assert.ok(b.kafel(), 'rozwinięty w Ustawieniach: kafel'); assert.equal(b.pasek(), null);
  const c = swiat(Object.assign({ [KLUCZ]: '1' }, sesja), () => ({ data: true, error: null }));
  c.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 1 });
  assert.ok(c.pasek());
  c.ctx.BM_AKCJA.kartaDzisHtml(Object.assign({}, D, { wystartowala: false }), { km: 1 });
  assert.equal(c.pasek(), null, 'koniec akcji / „od zera”: pasek też znika'); assert.ok(!c.b.classList.contains('akcja-baner'), 'wraca cytat');
  const d = swiat({}, () => ({ data: true, error: null }));
  d.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 1 }); await czekaj();
  assert.ok(d.kafel()); assert.equal(d.pasek(), null); assert.equal(d.kafelki().length, 0, 'bez sesji bez pytań o zwinięcie');
});

test('film akcji nie gra w zwiniętym pasku; Ustawienia zostają drugą drogą; imienia nie ma w kodzie; bez migracji', () => {
  const sb = czytaj('sb.js');
  assert.match(sb, /if \(baner\.classList && typeof baner\.classList\.contains === 'function' && baner\.classList\.contains\('akcja-baner--zwiniety'\)\) \{ baner\.dataset\.film = 'akcja-zwinieta'; return null; \}/);
  assert.ok(sb.indexOf("baner.dataset.film = 'akcja-zwinieta'") < sb.indexOf('var recznie = !!(opcje && opcje.recznie);'), 'przed jakimkolwiek filmem');
  const p = czytaj('profil.html');
  assert.match(p, /window\.sb\.rpc\('akcja_kafel_ukryj', \{ p_slug: slug, p_ukryj: false \}\)/, 'Pokaż w Ustawieniach zostaje');
  for (const plik of ['js/akcja.mjs', 'sb.js']) assert.doesNotMatch(czytaj(plik).replace(/dla-fabianka(\.html)?/g, ''), /fabian/i, plik + ': imię tylko z bazy');
  const a = czytaj('js/akcja.mjs');
  assert.match(a, /"#daily-motivation\.akcja-baner--zwiniety\{min-height:0!important;height:auto!important\}/);
  assert.match(a, /\.akcja-dzis-zwiniety\{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;/, 'pasek ok. 44 px');
  assert.ok(!fs.readdirSync(path.join(KORZEN, 'supabase/migrations')).some((f) => /^2026111|^20261109_akcja_pasek/.test(f)), 'bez nowej migracji');
});
