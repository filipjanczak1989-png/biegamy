/* BLIZNA 141 (3.11.2026, kredyty Anthropic, pkt 3, 4, 5): przełącznik sędziego SEDZIA=claude|gemini (domyślnie gemini; Claude tylko do daty i tylko z kluczem), wzorce porad
   (sędzia porównuje wyłącznie z zatwierdzonymi), porównanie dostawców (ten sam prompt, schemat, normalizacja i strażnik dla obu; koszt z dziennika). Atrapy klienta: 0 $, bez sieci. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'b141-')), 'budzet.jsonl');

function klient(odp) {
  const wolania = [];
  const create = async (params, opcje) => { wolania.push({ ...params, _opcje: opcje }); return typeof odp === 'function' ? odp(params, wolania.length) : odp; };
  return { wolania, messages: { create }, beta: { messages: { create } } };
}
const json = (o, model = 'claude-opus-5-5') => ({ model, stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'text', text: JSON.stringify(o) }] });

test('wybór sędziego: domyślnie gemini; Claude tylko z datą, przed jej końcem i z kluczem; inaczej gemini z uwagą', async () => {
  const S = await zaladuj('tools/_sedzia.mjs');
  const baza = { dzis: '2026-11-05', claudeDo: '2026-11-13', kluczClaude: 'k', kluczGemini: 'g' };
  assert.deepEqual(S.wybierzSedziego({ ...baza, sedzia: undefined }), { dostawca: 'gemini', uwaga: null });
  assert.deepEqual(S.wybierzSedziego({ ...baza, sedzia: 'gemini' }), { dostawca: 'gemini', uwaga: null });
  assert.deepEqual(S.wybierzSedziego({ ...baza, sedzia: 'claude' }), { dostawca: 'claude', uwaga: null });
  assert.equal(S.wybierzSedziego({ ...baza, sedzia: 'claude', dzis: '2026-11-13' }).dostawca, 'claude', 'ostatni dzień jeszcze Claude');
  const po = S.wybierzSedziego({ ...baza, sedzia: 'claude', dzis: '2026-11-14' }); assert.equal(po.dostawca, 'gemini'); assert.match(po.uwaga, /minęły/);
  const bezK = S.wybierzSedziego({ ...baza, sedzia: 'claude', kluczClaude: '' }); assert.equal(bezK.dostawca, 'gemini'); assert.match(bezK.uwaga, /ANTHROPIC_API_KEY/);
  assert.equal(S.wybierzSedziego({ ...baza, sedzia: 'claude', claudeDo: '' }).dostawca, 'gemini');
  assert.equal(S.wybierzSedziego({ ...baza, sedzia: 'gemini', kluczGemini: '' }).dostawca, null);
});

test('ocena: Claude dostaje schemat strict, effort low i wzorzec tylko, gdy jest; Gemini: flash, temperatura 0; koszt policzony', async () => {
  const S = await zaladuj('tools/_sedzia.mjs');
  const oc = { odpowiada: 1, konkret: 1, liczby_z_pokryciem: 1, wyciek: 0, ton: 1, uzasadnienie: 'ok', zgodny_ze_wzorcem: 1 };
  const k = klient(json(oc)), plik = tmp(), w = { pytanie: 'jak zacząć', sciezka: 'siec', odpowiedz: 'Marszobiegi 20 min.' };
  const bez = await S.ocenOdpowiedz({ dostawca: 'claude', w, klient: k, plik });
  assert.equal(bez.dostawca, 'claude'); assert.ok(bez.usd > 0);
  assert.equal(k.wolania[0].output_config.effort, 'low'); assert.equal(k.wolania[0].output_config.format.schema.additionalProperties, false);
  assert.doesNotMatch(JSON.stringify(k.wolania[0].messages), /WZORCOWA/); assert.ok(!k.wolania[0].output_config.format.schema.required.includes('zgodny_ze_wzorcem'));
  await S.ocenOdpowiedz({ dostawca: 'claude', w, wzorzec: { id: 'w001', wzorzec: 'Zacznij od 20 min marszobiegu.' }, klient: k, plik });
  assert.match(JSON.stringify(k.wolania[1].messages), /ODPOWIEDŹ WZORCOWA: Zacznij od 20 min/); assert.ok(k.wolania[1].output_config.format.schema.required.includes('zgodny_ze_wzorcem'));
  assert.match(k.wolania[1].system, /zgodny_ze_wzorcem/);
  let body = null, adres = null;
  const fetchFn = async (u, i) => { adres = u; body = JSON.parse(i.body); return { ok: true, json: async () => ({ usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 }, candidates: [{ content: { parts: [{ text: JSON.stringify(oc) }] } }] }) }; };
  const g = await S.ocenOdpowiedz({ dostawca: 'gemini', w, klucz: 'K', fetchFn });
  assert.match(adres, /gemini-3\.5-flash:/); assert.equal(body.generationConfig.temperature, 0); assert.equal(g.dostawca, 'gemini'); assert.ok(g.usd > 0); assert.equal(g.ocena.odpowiada, 1);
});

test('wzorce: plik ↔ lista (także CRLF), sędzia widzi tylko OK; zatwierdzanie z --bez; dopasowanie po słowach z progiem', async () => {
  const S = await zaladuj('tools/_sedzia.mjs');
  const Z = await zaladuj('tools/okienko-wzorce.mjs');
  const wpisy = [
    { id: 'w001', intencja: 'porada', waga: 5, status: 'DO-OK', pytanie: 'Jak zacząć biegać?', wzorzec: 'Zacznij od 20 minut marszobiegu 3 razy w tygodniu.', zrodla: ['https://a.pl/x', 'https://b.pl/y'] },
    { id: 'w002', intencja: 'zywienie', waga: 4, status: 'DO-OK', pytanie: 'Co jeść przed długim wybieganiem?', wzorzec: 'Zjedz 60–90 g węglowodanów 3 godziny wcześniej.', zrodla: [] },
  ];
  const md = Z.doMd(wpisy);
  assert.deepEqual(S.wczytajWzorce(md), wpisy); assert.deepEqual(S.wczytajWzorce(md.replace(/\n/g, '\r\n')), wpisy, 'CRLF z Windowsa nie gubi wpisów');
  const plik = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wz-')), 'w.md');
  fs.writeFileSync(plik, md); assert.deepEqual(S.wzorceZatwierdzone(plik), [], 'niezatwierdzone nie idą do sędziego');
  const zatw = Z.zatwierdz(wpisy, ['w002']);
  assert.equal(zatw[0].status, 'OK'); assert.equal(zatw[1].status, 'ODRZUCONY');
  fs.writeFileSync(plik, Z.doMd(zatw)); assert.deepEqual(S.wzorceZatwierdzone(plik).map((w) => w.id), ['w001']);
  assert.deepEqual(S.wzorceZatwierdzone(plik + '.brak'), [], 'brak pliku = brak wzorców, nie błąd');
  assert.equal(S.znajdzWzorzec('jak zaczac biegac', zatw).id, 'w001', 'bez polskich znaków');
  assert.equal(S.znajdzWzorzec('jak zacząć biegać?', zatw).id, 'w001');
  assert.equal(S.znajdzWzorzec('ile kalorii ma banan', zatw), null);
  assert.equal(S.znajdzWzorzec('co jesc przed dlugim wybieganiem', zatw), null, 'odrzucony wzorzec nie pasuje');
  assert.equal(S.znajdzWzorzec('jak zacząć biegać', wpisy), null, 'status DO-OK nie pasuje');
});

test('wzorce: lista z ławki wg wagi bez powtórek i bez dopytań; uzupełnienie do N; wznowienie nie płaci drugi raz; limit punktu; przeciek akcji nie trafia do repo', async () => {
  const Z = await zaladuj('tools/okienko-wzorce.mjs');
  const P = [{ p: 'jak zacząć biegać', intencja: 'porada', waga: 3 }, { p: 'jak zaczac biegac?', intencja: 'porada', waga: 5 }, { p: 'co jeść przed startem', intencja: 'zywienie', waga: 4 },
    { p: 'a jutro?', intencja: 'porada', waga: 5, po: ['x'] }, { p: 'moj plan', intencja: 'moj_plan', waga: 5 }, { p: 'jakie buty na asfalt', intencja: 'sprzet', waga: 2 }];
  const l = Z.wybierzPytania(P, 10);
  assert.deepEqual(l.map((x) => x.pytanie), ['jak zaczac biegac?', 'co jeść przed startem', 'jakie buty na asfalt']);
  assert.equal(Z.wybierzPytania(P, 2).length, 2);
  const plik = tmp();
  const kL = klient(json({ pytania: [{ p: 'ile wody pić', intencja: 'zywienie', waga: 9 }, { p: 'jak zacząć biegać', intencja: 'porada', waga: 3 }, { p: 'ile dni biegać w tygodniu', intencja: 'porada', waga: 4 }] }));
  const pelna = await Z.uzupelnijPytania(l, 5, { klient: kL, plik, log: () => {} });
  assert.equal(pelna.length, 5); assert.ok(pelna.some((x) => x.pytanie === 'ile wody pić' && x.waga === 5), 'waga obcięta do 5'); assert.equal(pelna.filter((x) => /zacz/.test(x.pytanie)).length, 1, 'powtórka odsiana');
  const odp = (t) => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 }, content: [
    { type: 'text', text: 'Sprawdzę to.' }, { type: 'server_tool_use', name: 'web_search' }, { type: 'web_search_tool_result', content: [] },
    { type: 'text', text: t, citations: [{ url: 'https://zrodlo.pl/a', title: 'a' }, { url: 'http://niebezpieczne.pl/b', title: 'b' }] }] });
  const k = klient((p) => (/asfalt/.test(p.messages[0].content) ? odp('Meta wyprawy to Częstochowa.') : odp('Zacznij od 20 minut.')));
  const zapisy = [];
  const r = await Z.generujWzorce(l, { wpisy: [{ id: 'w007', intencja: 'porada', waga: 5, status: 'OK', pytanie: 'jak zaczac biegac?', wzorzec: 'x', zrodla: [] }], klient: k, plik, rownolegle: 1, kosztNarzedzia: () => 0, zapisz: (w) => zapisy.push(w.length), log: () => {} });
  assert.equal(k.wolania.length, 2, 'gotowe pytanie bez ponownego wywołania');
  assert.deepEqual(r.wpisy.map((w) => w.id), ['w007', 'w008'], 'przeciek akcji odrzucony, id ciągłe');
  assert.equal(r.wpisy[1].wzorzec, 'Zacznij od 20 minut.', 'bez „Sprawdzę to” sprzed narzędzia'); assert.deepEqual(r.wpisy[1].zrodla, ['https://zrodlo.pl/a'], 'tylko https'); assert.equal(r.wpisy[1].status, 'DO-OK');
  assert.deepEqual(zapisy, [2], 'zapis po każdym wpisie');
  assert.equal(k.wolania[0].tools[0].type, 'web_search_20260209'); assert.equal(k.wolania[0].output_config.format, undefined, 'bez formatu JSON przy cytowaniach');
  const k2 = klient(odp('x'));
  const lim = await Z.generujWzorce(l, { klient: k2, plik, limitUsd: 1, kosztNarzedzia: () => 1, log: () => {} });
  assert.equal(k2.wolania.length, 0); assert.match(lim.stop, /limit 1 USD/);
});

test('zapytajZWyszukiwaniem: pause_turn dokończone tą samą treścią, koszt i tokeny zsumowane; web search w koszcie', async () => {
  const C = await zaladuj('tools/_claude.mjs');
  const plik = tmp();
  const k = klient((p, n) => ({ model: 'claude-opus-5-5', stop_reason: n === 1 ? 'pause_turn' : 'end_turn', usage: { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: 1 } }, content: [{ type: 'text', text: 'czesc' + n }] }));
  const r = await C.zapytajZWyszukiwaniem({ narzedzie: 't', system: 's', messages: [{ role: 'user', content: 'q' }], tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 2 }], klient: k, plik });
  assert.equal(k.wolania.length, 2); assert.equal(k.wolania[1].messages[1].role, 'assistant'); assert.equal(r.zapytania, 2); assert.deepEqual(r.tok, { we: 2000, wy: 200 });
  assert.ok(Math.abs(r.usd - 2 * (0.004 + 0.002 + 0.01)) < 1e-9, 'tokeny + 2 wyszukania');
});

test('schematClaude: każdy obiekt zamknięty, także zagnieżdżony; schemat klasyfikatora przechodzi; oryginał nietknięty', async () => {
  const C = await zaladuj('tools/_claude.mjs');
  const R = await zaladuj('supabase/functions/okienko-v2/rozumienie.mjs');
  const s = C.schematClaude(R.SCHEMAT);
  assert.equal(s.additionalProperties, false); assert.equal(s.properties.sloty.additionalProperties, false);
  assert.deepEqual(s.required, R.SCHEMAT.required); assert.equal(R.SCHEMAT.additionalProperties, undefined, 'Gemini nie zna tego pola: produkcyjny schemat bez zmian');
});

test('klasyfikator Haiku: ten sam prompt i schemat co produkcja, historia jako tury, ta sama normalizacja; awaria policzona; odpowiedź przez potok', async () => {
  const D = await zaladuj('tools/porownaj-dostawcow.mjs');
  const R = await zaladuj('supabase/functions/okienko-v2/rozumienie.mjs');
  const plik = tmp(), l = D.nowyLicznik();
  const k = klient(json({ intencja: 'moj_plan', pewnosc: 0.9, dopytac: false, kandydaci: ['moj_plan', 'odznaki', 'zmyslona'], sloty: { zakres: 'jutro', osoba: 'nim', data: 'zla' } }, 'claude-haiku-5-5'));
  const r = await D.rozumienieHaiku({ licznik: l, klient: k, plik })({ tekst: 'a jutro', dzis: '2026-11-03', poprzednie: [{ q: 'plan na dziś', intencja: 'moj_plan' }] });
  const p = k.wolania[0];
  assert.equal(p.model, 'claude-haiku-5-5'); assert.equal(p.system, R.promptRozumienia('2026-11-03')); assert.deepEqual(p.thinking, { type: 'disabled' }); assert.equal(p.fallbacks, undefined);
  assert.deepEqual(p.messages.map((m) => m.role), ['user', 'assistant', 'user']); assert.equal(p.messages[2].content, 'a jutro');
  assert.equal(r.intencja, 'moj_plan'); assert.deepEqual(r.kandydaci, ['odznaki'], 'normalizacja jak w produkcji'); assert.deepEqual(r.sloty, { zakres: 'jutro' }, 'zaimek i zła data odpadają');
  assert.equal(l.wywolan, 1); assert.ok(l.usd > 0); assert.equal(l.awarie, 0);
  const zla = klient(() => { throw new Error('529 przeciążenie'); }), l2 = D.nowyLicznik();
  await assert.rejects(D.rozumienieHaiku({ licznik: l2, klient: zla, plik })({ tekst: 'x', dzis: '2026-11-03' }));
  assert.equal(l2.awarie, 1); assert.equal(l2.typy['529 przeciążenie'], 1);
  const { przebieg } = require('./_lawka-v2.js');
  const k3 = klient(json({ intencja: 'nie_wiem', pewnosc: 0.1, dopytac: true, kandydaci: [], sloty: {} }, 'claude-haiku-5-5')), l3 = D.nowyLicznik();
  const w = await przebieg([{ p: 'zupelnie niejasne pytanie xyz', kat: 'poza', waga: 1, oczekiwane: 'v2-niepewne:dopytanie' }], { rozumienieFn: D.rozumienieHaiku({ licznik: l3, klient: k3, plik }) });
  assert.equal(w[0].pasuje, true, 'wynik Haiku idzie prawdziwym potokiem'); assert.equal(l3.wywolan, 1);
});

test('odpowiedzi Haiku: cytowania w kształcie Gemini, więc działa TEN SAM strażnik cyfr (bajty UTF-8, polskie znaki); tekst sprzed wyszukania odpada', async () => {
  const D = await zaladuj('tools/porownaj-dostawcow.mjs');
  const Si = await zaladuj('supabase/functions/okienko/siec.mjs');
  const W = await zaladuj('supabase/functions/okienko-v2/wiedza.mjs');
  const tresc = [
    { type: 'text', text: 'Poszukam źródeł.' }, { type: 'server_tool_use', name: 'web_search' }, { type: 'web_search_tool_result', content: [] },
    { type: 'text', text: 'Żele są potrzebne na dłuższych dystansach. ' },
    { type: 'text', text: 'Bierz żel co 45 minut.', citations: [{ url: 'https://a.pl/zele', title: 'Żele' }] },
    { type: 'text', text: ' Maraton ma 99 km.' }];
  const g = D.naGrounding(tresc);
  assert.doesNotMatch(g.tekst, /Poszukam/); assert.equal(g.gm.groundingChunks[0].web.uri, 'https://a.pl/zele');
  const o = Si.zOdpowiedziSieci(g.tekst, g.gm, () => true, 5);
  assert.deepEqual(o.zdania, ['Żele są potrzebne na dłuższych dystansach.', 'Bierz żel co 45 minut.'], 'cyfra z cytowaniem zostaje, cyfra bez cytowania odpada');
  assert.equal(o.odrzucone.length, 1); assert.equal(o.zrodla[0].url, 'https://a.pl/zele');
  const plik = tmp(), l = D.nowyLicznik();
  const k = klient((p) => ({ model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 500, output_tokens: 50, server_tool_use: { web_search_requests: 1 } }, content: tresc }));
  const w = await W.szukajWiedzy({ d: { zapytajSiec: D.siecHaiku({ licznik: l, klient: k, plik }) }, fetchFn: fetch, klucz: 'x', tekst: 'kiedy żel', dzis: '2026-11-03', intencja: 'zywienie' });
  assert.ok(w.zdania.includes('Bierz żel co 45 minut.')); assert.equal(l.zapytania, 1); assert.ok(l.usd > 0.01, 'koszt z opłatą za wyszukanie');
  assert.equal(k.wolania[0].tools[0].type, 'web_search_20250305', 'Haiku: wariant podstawowy'); assert.doesNotMatch(k.wolania[0].system, /Google Search/);
});

test('porównanie: wiersze odpowiedzi tylko z wiedzą, bez dopytań; percentyle; tabela z liczbami, bez treści odpowiedzi; próbka rozłożona', async () => {
  const D = await zaladuj('tools/porownaj-dostawcow.mjs');
  assert.deepEqual(D.wierszeOdpowiedzi([{ p: 'a', intencja: 'porada', waga: 1 }, { p: 'b', oczekiwane: 'siec', waga: 1 }, { p: 'c', intencja: 'porada', po: ['x'] }, { p: 'd', intencja: 'moj_plan', oczekiwane: 'router:moj_plan' }]).map((x) => [x.p, x.intencja]), [['a', 'porada'], ['b', 'fakt']]);
  assert.equal(D.percentyl([100, 200, 300, 400, 1000], 0.5), 300); assert.equal(D.percentyl([100, 200, 300, 400, 1000], 0.9), 1000); assert.equal(D.percentyl([], 0.5), null);
  assert.equal(D.rozlozona([1, 2, 3], 10).length, 3); assert.deepEqual(D.rozlozona([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 2), [0, 5]);
  assert.ok(Math.abs(D.kosztGemini({ we: 1e6, wy: 1e6 }, 1000) - (0.3 + 2.5 + 14)) < 1e-9);
  const kl = (x) => ({ dobre: x, n: 100, regresje: 1, intencjaDobra: 40, intencjaN: 50, wywolan: 60, awarie: 0, usd: 0.03, p50: 900, p90: 1800, ponad3s: 1, nCzas: 100 });
  const od = (x) => ({ n: 10, odpowiada: x, konkret: 0.8, liczby: 1, ton: 1, wyciek: 0, puste: 1, ogolniki: 0, awarie: 0, p50: 3000, p90: 6000, nCzas: 5, usd: 0.2, zapytania: 12, wiersze: [{ zdania: ['TAJNA TRESC'] }] });
  const t = D.tabelaMd({ n: 100, dostawcy: { gemini: kl(90), haiku: kl(95) } }, { n: 10, dostawcy: { gemini: od(0.9), haiku: od(0.7) } });
  assert.match(t, /\| Ławka: ślad potoku = oczekiwany \| 90\.0 % \(90\/100\) \| 95\.0 % \(95\/100\) \|/);
  assert.match(t, /Koszt na 1000 wywołań klasyfikatora \| 0\.500 USD/); assert.match(t, /Koszt na 1000 odpowiedzi \(z wyszukiwaniem\) \| 20\.00 USD/); assert.match(t, /Sędzia: odpowiada na pytanie \| 90\.0 % \| 70\.0 %/);
  assert.doesNotMatch(t, /TAJNA/);
});

test('workflow i raport: przełącznik w yml, gemini zostaje na Node, sekret tylko w kroku raportu, data końca, strażnik przed wysłaniem do Claude, zapas na Gemini', () => {
  const w = czytaj('.github/workflows/okienko-noc.yml'), r = czytaj('tools/okienko-raport-dnia.mjs');
  assert.match(w, /SEDZIA: claude/); assert.match(w, /SEDZIA_CLAUDE_DO: '2026-11-13'/);
  assert.match(w, /deno run -A tools\/okienko-raport-dnia\.mjs --noc --limit-usd 0\.5/); assert.match(w, /node tools\/okienko-raport-dnia\.mjs --noc --limit-usd 0\.5/);
  assert.match(w, /if: env\.SEDZIA == 'claude'/, 'Deno tylko dla sędziego Claude');
  assert.equal(w.split('secrets.ANTHROPIC_API_KEY').length - 1, 1, 'klucz w jednym kroku');
  const krok = w.slice(w.indexOf('Raport nocy'), w.indexOf('Blizna anonimizacji')); assert.match(krok, /secrets\.ANTHROPIC_API_KEY/);
  assert.match(w, /echo "kod=\$\?"/); assert.ok(w.indexOf('deno run') < w.indexOf('echo "kod=$?"'), 'kod wyjścia po uruchomieniu raportu');
  assert.match(r, /!czysty\(trescDlaSedziego\(w, null\)/, 'strażnik PRZED wysłaniem do Claude');
  assert.match(r, /reszta nocy gemini/, 'koniec kredytów nie zabija nocy');
  for (const f of ['tools/_sedzia.mjs', 'tools/porownaj-dostawcow.mjs', 'tools/okienko-wzorce.mjs', '.github/workflows/okienko-noc.yml']) assert.doesNotMatch(czytaj(f), /sk-ant-[A-Za-z0-9]/, f);
});
