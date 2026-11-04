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
  await S.ocenOdpowiedz({ dostawca: 'claude', w, wzorzec: { id: 1, odpowiedz: 'Zacznij od 20 min marszobiegu.' }, klient: k, plik });
  assert.match(JSON.stringify(k.wolania[1].messages), /ODPOWIEDŹ WZORCOWA: Zacznij od 20 min/); assert.ok(k.wolania[1].output_config.format.schema.required.includes('zgodny_ze_wzorcem'));
  assert.match(k.wolania[1].system, /zgodny_ze_wzorcem/);
  let body = null, adres = null;
  const fetchFn = async (u, i) => { adres = u; body = JSON.parse(i.body); return { ok: true, json: async () => ({ usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 }, candidates: [{ content: { parts: [{ text: JSON.stringify(oc) }] } }] }) }; };
  const g = await S.ocenOdpowiedz({ dostawca: 'gemini', w, klucz: 'K', fetchFn });
  assert.match(adres, /gemini-3\.5-flash:/); assert.equal(body.generationConfig.temperature, 0); assert.equal(g.dostawca, 'gemini'); assert.ok(g.usd > 0); assert.equal(g.ocena.odpowiada, 1);
});

test('wzorce: sędzia dopasowuje jak potok, tylko zatwierdzone i ważne; zatwierdzanie przez plik md zniknęło', async () => {
  const S = await zaladuj('tools/_sedzia.mjs');
  const wpisy = [
    { id: 1, intencja: 'porada', status: 'zatwierdzona', waznosc: 'wieczna', wazna_do: null, pytanie: 'Jak zacząć biegać?', odpowiedz: 'Zacznij od 20 minut marszobiegu 3 razy w tygodniu.' },
    { id: 2, intencja: 'zywienie', status: 'odrzucona', waznosc: 'wieczna', wazna_do: null, pytanie: 'Co jeść przed długim wybieganiem?', odpowiedz: 'Zjedz 60–90 g węglowodanów 3 godziny wcześniej.' },
    { id: 3, intencja: 'sprzet', status: 'zatwierdzona', waznosc: 'do_daty', wazna_do: '2026-11-01', pytanie: 'Ile kosztują buty do biegania?', odpowiedz: 'Dobre buty kosztują około 500 zł w listopadzie.' },
  ];
  assert.equal(S.znajdzWzorzec('jak zaczac biegac', wpisy, '2026-11-04').id, 1, 'bez polskich znaków');
  assert.equal(S.znajdzWzorzec('od czego zacząć bieganie', wpisy, '2026-11-04').id, 1, 'innymi słowami, ta sama reguła co w potoku');
  assert.equal(S.znajdzWzorzec('ile kalorii ma banan', wpisy, '2026-11-04'), null);
  assert.equal(S.znajdzWzorzec('co jesc przed dlugim wybieganiem', wpisy, '2026-11-04'), null, 'odrzucony nie jest wzorcem');
  assert.equal(S.znajdzWzorzec('ile kosztują buty do biegania', wpisy, '2026-11-04'), null, 'przeterminowany nie jest wzorcem');
  assert.match(S.trescDlaSedziego({ pytanie: 'q', sciezka: 's', odpowiedz: 'a' }, wpisy[0]), /ODPOWIEDŹ WZORCOWA: Zacznij od 20 minut/);
  for (const nazwa of ['wczytajWzorce', 'wzorceZatwierdzone', 'PLIK_WZORCOW']) assert.equal(S[nazwa], undefined, nazwa + ': bez zatwierdzania przez plik');
  assert.doesNotMatch(czytaj('tools/_sedzia.mjs') + czytaj('tools/okienko-raport-dnia.mjs') + czytaj('tools/okienko-wzorce.mjs').replace(/Nic nie trafia do docs\./, ''), /docs\/okienko-wzorce/, 'docs/okienko-wzorce.md nie powstaje');
  assert.ok(!fs.existsSync(path.join(KORZEN, 'docs/okienko-wzorce.md')));
});

test('wzorce: plik poza repo z wznawianiem i limitem, SQL tylko kandydaci i idempotentny; lista z ławki bez powtórek i bez dopytań; przeciek akcji i dane osoby odpadają', async () => {
  const Z = await zaladuj('tools/okienko-wzorce.mjs');
  assert.match(Z.PLIK_DOMYSLNY, /Downloads[\\/]biegamy-podglady[\\/]wzorce-kandydaci\.json$/, 'poza repo');
  const P = [{ p: 'jak zacząć biegać', intencja: 'porada', waga: 3 }, { p: 'jak zaczac biegac?', intencja: 'porada', waga: 5 }, { p: 'co jeść przed startem', intencja: 'zywienie', waga: 4 },
    { p: 'a jutro?', intencja: 'porada', waga: 5, po: ['x'] }, { p: 'moj plan', intencja: 'moj_plan', waga: 5 }, { p: 'jakie buty na asfalt', intencja: 'sprzet', waga: 2 }, { p: 'jak trenuje Jan Kowalski', intencja: 'porada', waga: 5 }, { p: 'jak pomóc Fabiankowi', intencja: 'porada', waga: 5 }];
  const l = Z.wybierzPytania(P, 10);
  assert.deepEqual(l.map((x) => x.pytanie), ['jak zaczac biegac?', 'co jeść przed startem', 'jakie buty na asfalt'], 'powtórka, dopytanie, osoba i akcja odpadają');
  assert.equal(Z.wybierzPytania(P, 2).length, 2);
  const P2 = [{ p: 'Jak zacząć biegać, jeśli nigdy wcześniej nie trenowałem?', intencja: 'porada', waga: 5 }, { p: 'jak zacząć biegać jeśli nigdy wcześniej nie ćwiczyłem', intencja: 'porada', waga: 4 }, { p: 'czy mogę biegać skoro biegałem wczoraj', intencja: 'porada', waga: 4 }, { p: 'jak przebiec 5 km bez zatrzymywania?? 😩', intencja: 'porada', waga: 3 }, { p: 'jak przebiec 10 km bez zatrzymywania', intencja: 'porada', waga: 2 }];
  assert.deepEqual(Z.wybierzPytania(P2, 10).map((x) => x.pytanie), ['Jak zacząć biegać, jeśli nigdy wcześniej nie trenowałem?', 'jak przebiec 5 km bez zatrzymywania?', 'jak przebiec 10 km bez zatrzymywania'], 'prawie to samo i własne dane odpadają, emoji też; inna liczba to inne pytanie');
  const plik = tmp();
  const kL = klient(json({ pytania: [{ p: 'ile wody pić', intencja: 'zywienie', waga: 9 }, { p: 'jak zacząć biegać', intencja: 'porada', waga: 3 }, { p: 'jaki zegarek do biegania', intencja: 'sprzet', waga: 4 }] }));
  const pelna = await Z.uzupelnijPytania(l, 5, { klient: kL, plik, log: () => {} });
  assert.equal(pelna.length, 5); assert.ok(pelna.some((x) => x.pytanie === 'ile wody pić' && x.waga === 5), 'waga obcięta do 5'); assert.equal(pelna.filter((x) => /zacz/.test(x.pytanie)).length, 1, 'powtórka odsiana');
  const odp = (t) => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 }, content: [
    { type: 'text', text: 'Sprawdzę to.' }, { type: 'server_tool_use', name: 'web_search' }, { type: 'web_search_tool_result', content: [] },
    { type: 'text', text: t, citations: [{ url: 'https://zrodlo.pl/a', title: 'a' }, { url: 'http://niebezpieczne.pl/b', title: 'b' }] }] });
  const k = klient((p) => (/asfalt/.test(p.messages[0].content) ? odp('Meta wyprawy to Częstochowa, a dalej 20 km trasy.') : odp('Zacznij od 20 minut marszobiegu i dokładaj czas.')));
  const zapisy = [];
  const r = await Z.generujWzorce(l, { wpisy: [{ pytanie: 'jak zaczac biegac?', intencja: 'porada', waga: 5, wzorzec: 'x'.repeat(25) }], klient: k, plik, rownolegle: 1, dzis: '2026-11-04', kosztNarzedzia: () => 0, zapisz: (w) => zapisy.push(w.length), log: () => {} });
  assert.equal(k.wolania.length, 2, 'gotowe pytanie bez ponownej zapłaty');
  assert.equal(r.wpisy.length, 2, 'przeciek akcji odrzucony');
  const nowy = r.wpisy[1];
  assert.equal(nowy.wzorzec, 'Zacznij od 20 minut marszobiegu i dokładaj czas.', 'bez „Sprawdzę to” sprzed narzędzia'); assert.deepEqual(nowy.zrodla, [{ tytul: 'a', url: 'https://zrodlo.pl/a' }], 'tylko https');
  assert.equal(nowy.waznosc, 'wieczna'); assert.equal(nowy.wazna_do, null); assert.ok(nowy.temat);
  assert.deepEqual(zapisy, [2], 'zapis po każdym wpisie');
  assert.equal(k.wolania[0].tools[0].type, 'web_search_20250305', '20260209 nie zwraca cytowań (próba na żywo 4.11)'); assert.equal(k.wolania[0].tools[0].max_uses, 1); assert.equal(k.wolania[0].output_config.format, undefined, 'bez formatu JSON przy cytowaniach');
  assert.ok(['trening', 'żywienie', 'sprzęt'].includes(nowy.temat), 'temat czytelny dla trenera: ' + nowy.temat);
  const bezZrodel = klient(() => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'web_search_tool_result', content: [] }, { type: 'text', text: 'Zacznij od 20 minut marszobiegu 3 razy w tygodniu.' }] }));
  assert.equal(await Z.napiszWzorzec({ pytanie: 'jak zacząć biegać', intencja: 'porada' }, { klient: bezZrodel, plik }), null, 'wzorzec z sieci bez źródła odpada');
  const k2 = klient(odp('x'));
  const lim = await Z.generujWzorce(l, { klient: k2, plik, limitUsd: 1, dzis: '2026-11-04', kosztNarzedzia: () => 1, log: () => {} });
  assert.equal(k2.wolania.length, 0); assert.match(lim.stop, /limit 1 USD/);
  const s = Z.sqlKandydatow([{ ...nowy, pytanie: "co jeść przed 'startem'", wzorzec: "Zjedz to, co znasz: 'sprawdzone' 60 g." }, { ...nowy, pytanie: "co jeść przed 'startem'", wzorzec: 'duplikat klucza' }, { ...nowy, pytanie: 'x', wzorzec: 'bez klucza' }, { pytanie: 'jak często biegać', intencja: 'moj_plan', wzorzec: 'obca intencja' },
    { ...nowy, pytanie: 'ile kosztują buty', intencja: 'sprzet', wzorzec: 'Buty kosztują około 500 zł.', waznosc: 'do_daty', wazna_do: '2026-12-04', nietrwala: true }]);
  assert.equal(s.wierszy, 2, 'duplikat, brak klucza i obca intencja odpadają');
  assert.equal((s.tekst.match(/on conflict \(klucz\) do nothing;/g) || []).length, 2, 'idempotentny'); assert.equal((s.tekst.match(/'kandydat', 0\)/g) || []).length, 2, 'tylko kandydat, 0 zapytań');
  assert.doesNotMatch(s.tekst, /zatwierdzona|odrzucona/); assert.match(s.tekst, /''sprawdzone''/, 'apostrof podwojony'); assert.match(s.tekst, /true, true, 'wzorzec'|false, true, 'wzorzec'/, 'wzorzec nie idzie do przepisania');
  assert.match(s.tekst, /'2026-12-04'::date, true, true, 'wzorzec'/); assert.match(s.tekst, /\]'::jsonb/);
  const dlugi = 'Zdanie pierwsze. Żel między 30. a 45. minutą. Trzecie zdanie. Czwarte zdanie. Piąte zdanie. Szóste odpada. Siódme też.';
  assert.equal(Z.przytnijWzorzec(dlugi), 'Zdanie pierwsze. Żel między 30. a 45. minutą. Trzecie zdanie. Czwarte zdanie. Piąte zdanie.', 'najwyżej 5 całych zdań (Filip 4.11)');
  assert.equal(Z.przytnijWzorzec('Krótki wzorzec. Dwa zdania.'), 'Krótki wzorzec. Dwa zdania.');
  const s2 = Z.sqlKandydatow([{ ...nowy, pytanie: 'jak długo biegać rano', wzorzec: dlugi }]);
  assert.doesNotMatch(s2.tekst, /Szóste/, 'SQL też przycięty, bez ponownej zapłaty za istniejące wzorce');
  const k3 = klient(() => odp(dlugi));
  assert.doesNotMatch((await Z.napiszWzorzec({ pytanie: 'jak długo biegać rano', intencja: 'porada' }, { klient: k3, plik })).wzorzec, /Szóste/, 'nowy wzorzec też');
  /* Filip 4.11: bez źródeł komercyjnych, po trenersku, bez nowych liczb */
  for (const u of ['https://www.decathlon.pl/x', 'https://sklep.garmin.com/a', 'https://cokolwiek.store/a', 'https://apka.app/b', 'nie-adres']) assert.equal(Z.czyKomercyjne(u), true, u);
  for (const u of ['https://bieganie.pl/a', 'https://pubmed.ncbi.nlm.nih.gov/1', 'https://magazynbieganie.pl/x']) assert.equal(Z.czyKomercyjne(u), false, u);
  const sk = Z.sqlKandydatow([{ ...nowy, pytanie: 'jak długo biegać w zimie', wzorzec: 'Biegaj spokojnie przez 30 minut w zimie.', zrodla: [{ tytul: 'x', url: 'https://decathlon.pl/x' }, { tytul: 'y', url: 'https://bieganie.pl/y' }] }, { ...nowy, pytanie: 'jak długo biegać latem', wzorzec: 'Biegaj rano przez 40 minut latem.', bez_zrodla: true }]);
  assert.equal(sk.wierszy, 1, 'wpis bez źródła nie idzie do kolejki'); assert.doesNotMatch(sk.tekst, /decathlon/); assert.match(sk.tekst, /bieganie\.pl/);
  const odpJson = (o) => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'text', text: JSON.stringify(o) }] });
  const baza = { pytanie: 'jak często biegać', wzorzec: 'Biegaj 3 razy w tygodniu po 30 minut, a jeden dzień zostaw na odpoczynek po treningu.' };
  const zLiczba = await Z.przepiszWzorzec(baza, { klient: klient(() => odpJson({ zdania: ['Biegaj 5 razy w tygodniu po 30 minut i odpoczywaj po treningu.'] })), plik });
  assert.equal(zLiczba.przepisany, false, 'nowa liczba: zostaje tekst źródłowy'); assert.equal(zLiczba.wzorzec, baza.wzorzec);
  const zMarka = await Z.przepiszWzorzec(baza, { klient: klient(() => odpJson({ zdania: ['Biegaj 3 razy w tygodniu po 30 minut, najlepiej w butach Nike na treningu.'] })), plik });
  assert.equal(zMarka.przepisany, false, 'marka w odpowiedzi');
  const dobry = await Z.przepiszWzorzec(baza, { klient: klient(() => odpJson({ zdania: ['Biegaj 3 razy w tygodniu po 30 minut.', 'Jeden dzień zostaw na odpoczynek.'] })), plik });
  assert.deepEqual(dobry, { wzorzec: 'Biegaj 3 razy w tygodniu po 30 minut. Jeden dzień zostaw na odpoczynek.', przepisany: true });
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
