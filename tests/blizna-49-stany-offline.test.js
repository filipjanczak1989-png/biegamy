// Blizna #49 (08.10.2026, PAKA 5) — bez sieci żadna strona nie mówi „brak X", kiedy nie wie.
//
// Zmierzone (tools/smoke-offline.js SMOKE_PUSTE=1 na HEAD 6fec59e, 10 stron offline): ZERO komunikatów
// o braku połączenia; nutrition — ekran powitalny „Witaj w Nutrition" i „0 kcal"; odznaki — „0 zdobyte,
// 112 jeszcze do zdobycia"; wyzwania — „0.0 / 20 km"; profil — „Brak profilu" + szkielety bez końca;
// races — szkielet bez końca; raporty — „Ładowanie..." bez końca; trener.html i compare.html —
// PRZEKIEROWANIE na zawodnik.html. Kryterium błędu sieci jest jedno: DzisOffline.czyBladSieci.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '');
const STRONY = ['nutrition.html', 'races.html', 'radio.html', 'profil.html', 'wyzwania.html', 'odznaki.html', 'compare.html', 'raporty.html', 'trener.html', 'ankieta.html'];

function pomocnik(nav) {
  const sb = czytaj('sb.js');
  const i = sb.indexOf('  window.bmBladSieci = function (error) {');
  const j = sb.indexOf('  window.escapeHtml = function(s) {');
  assert.ok(i > 0 && j > i, 'pomocnik w sb.js');
  const D = require('../js/dzis-offline.js');
  const okno = { DzisOffline: D };
  const el = { innerHTML: 'stary pusty stan', dzieci: [], appendChild(x) { this.dzieci.push(x); } };
  const tekst = (x) => x.textContent + (x.dzieci || []).map(tekst).join(' ');
  const mk = () => ({ style: {}, dzieci: [], textContent: '', className: '', setAttribute() {}, appendChild(x) { this.dzieci.push(x); } });
  const doc = { getElementById: (id) => (id === 'lista' ? el : null), createElement: mk };
  const g = global.navigator;
  Object.defineProperty(global, 'navigator', { value: nav, configurable: true, writable: true });
  try { new Function('window', 'document', sb.slice(i, j))(okno, doc); } finally { Object.defineProperty(global, 'navigator', { value: g, configurable: true, writable: true }); }
  return { okno, el, tekst, nav };
}

test('pomocnik: błąd SIECI → komunikat zamiast pustego stanu; 42501/PGRST/brak błędu → false (loader idzie dalej)', () => {
  const nav = { onLine: true };
  const g = global.navigator;
  Object.defineProperty(global, 'navigator', { value: nav, configurable: true, writable: true });
  try {
    const { okno, el, tekst } = pomocnik(nav);
    assert.equal(okno.bmOfflineGdy({ code: '42501', message: 'permission denied for table x' }, 'lista', 'X'), false);
    assert.equal(okno.bmOfflineGdy({ code: 'PGRST116', message: 'JSON object requested' }, 'lista', 'X'), false);
    assert.equal(okno.bmOfflineGdy(null, 'lista', 'X'), false, 'brak błędu');
    assert.equal(el.innerHTML, 'stary pusty stan', 'inne błędy nie ruszają elementu');
    assert.equal(okno.bmOfflineGdy({ message: 'TypeError: Failed to fetch' }, 'lista', 'kalendarza startów'), true);
    assert.equal(el.innerHTML, '', 'element wyczyszczony');
    assert.match(tekst(el.dzieci[0]), /Brak połączenia — nie można wczytać kalendarza startów\./);
    assert.equal(okno.bmOfflineGdy({ message: 'Failed to fetch' }, 'nie-ma-takiego', 'X'), true, 'brak elementu — nadal rozpoznany błąd sieci');
    nav.onLine = false;
    assert.equal(okno.bmBladSieci({ message: 'cokolwiek' }), true, 'navigator.onLine === false liczy się jak błąd sieci (DzisOffline.czyBladSieci)');
  } finally { Object.defineProperty(global, 'navigator', { value: g, configurable: true, writable: true }); }
});

test('jedno kryterium: bmBladSieci deleguje do DzisOffline.czyBladSieci; każda strona z listy ładuje js/dzis-offline.js po sb.js', () => {
  const sb = czytaj('sb.js');
  assert.match(sb, /window\.bmBladSieci = function \(error\) \{\n\s+try \{ return !!\(window\.DzisOffline && window\.DzisOffline\.czyBladSieci\(error\)\); \}/);
  for (const s of STRONY) {
    const h = czytaj(s);
    const i = h.indexOf('<script src="sb.js"></script>'), j = h.indexOf('<script src="js/dzis-offline.js"></script>');
    assert.ok(i > 0 && j > i, s + ': js/dzis-offline.js po sb.js');
  }
});

test('narzędzie zwiadu: działa, łapie aliasy klienta (_sb) i funkcje renderujące wołane przez loader', () => {
  const { zwiad } = require('../tools/zwiad-stany-puste.js');
  const w = zwiad(['races.html']);
  const r = w.find((x) => x.funkcja === 'renderRaces' && /Brak zawodów/.test(x.zdanie));
  assert.ok(r, 'renderRaces znaleziony');
  assert.ok(r.wolanyPrzez && r.wolanyPrzez.includes('loadRaces'), 'wołany przez loadRaces (alias _sb)');
  assert.equal(r.obslugaSieci, true, 'loadRaces obsługuje błąd sieci (bmOfflineGdy)');
});

test('poprawione loadery: races, wyzwania, odznaki — błąd sieci przed pustym stanem / zerami', () => {
  const r = czytaj('races.html');
  const lr = r.slice(r.indexOf('async function loadRaces()'), r.indexOf('async function loadRaces()') + 900);
  assert.ok(lr.indexOf("bmOfflineGdy(error, 'races-list'") > 0 && lr.indexOf("bmOfflineGdy(error, 'races-list'") < lr.indexOf("showToast('Błąd ładowania"));
  const w = czytaj('wyzwania.html');
  assert.match(w, /if \(window\.bmOfflineGdy\(athErr, 'challenges-content', 'wyzwań'\)\)/);
  assert.match(w, /if \(window\.bmOfflineGdy\(logsRes\.error \|\| achRes\.error, el, 'postępu wyzwań'\)\) return;/);
  const o = czytaj('odznaki.html');
  const io = o.indexOf("bmOfflineGdy(athErr, 'badges-section-content'"), ir = o.indexOf('renderBadgesSection();\n}\n\ninit();');
  assert.ok(io > 0 && ir > io, 'odznaki: komunikat przed renderBadgesSection');
});

test('smoke: tryb SMOKE_PUSTE obejmuje wszystkie 10 stron, sprawdza przekierowanie, fałsz, komunikat i wyjątki', () => {
  const t = czytaj('tools/smoke-offline.js');
  for (const s of STRONY) assert.ok(t.includes("url: '/" + s), 'smoke nie odwiedza ' + s);
  for (const wz of ['bez przekierowania na inną stronę', 'zero fałszu offline', 'komunikat o braku połączenia', 'zero nieobsłużonych wyjątków', 'SMOKE_PUSTE_RAPORT']) assert.ok(t.includes(wz), wz);
});

test('bramka: zdanie pustego stanu w loaderze BEZ obsługi sieci tylko z zatwierdzonej listy (21, każde z powodem)', () => {
  const { zwiad } = require('../tools/zwiad-stany-puste.js');
  // klucz: strona | funkcja | zdanie (bez numerów linii — przesuwają się). Nowe miejsce = obsłuż błąd sieci albo dopisz z powodem.
  const ZATWIERDZONE = {
    "nutrition.html | loadTrainingContext | brak athletes.id": "komentarz w kodzie",
    "races.html | loadRaceParticipantsAvatars | nikt": "zmienna/komentarz, lista offline nierysowana",
    "races.html | updateModalSignupBtn | brak": "stan przycisku zapisu, nie pusty stan",
    "races.html | submitRace | . Do 13.09.2026 nikt tego": "komentarz",
    "profil.html | openRaceDetails | Brak": "nagrobek sekcji w komentarzu",
    "odznaki.html | showBadgeDetail | Brak opisu": "opis z lokalnego katalogu",
    "raporty.html | init | nikt": "tekst przy wysyłce opinii",
    "raporty.html | openReportModal | nikt": "tekst przy wysyłce opinii",
    "trener.html | tpHandleScreensUpload | ❌ Nie udało się wgrać żadnego pliku": "wynik wgrywania plików",
    "trener.html | generateTrainingPlan | Brak sesji": "wyjątek akcji (brak sesji)",
    "trener.html | renderPlanPreviewInCreateModal | Brak treningów": "lokalny, już wygenerowany plan",
    "trener.html | wyslijPlanNaZegarek | Brak treningów z krokami w tym planie.": "lokalny, już wygenerowany plan",
    "trener.html | loadFreshFeedbacks | (tylko reakcja, brak komentarza)": "pole już wczytanego raportu",
    "trener.html | openFeedbackFromList | nikt": "komentarz",
    "trener.html | searchCoachGif | Brak wyników": "zewnętrzne API Tenor",
    "trener.html | zaladujPoranek | brak": "komentarz",
    "trener.html | searchGifsCoach | Brak wyników": "zewnętrzne API Tenor",
    "trener.html | openAIReportModal | (tylko reakcja, brak komentarza)": "pole już wczytanego raportu",
    "trener.html | loadAthleteDetailStats | Brak": "komentarz",
    "trener.html | saveCoachNote | Brak sesji": "wyjątek akcji (brak sesji)",
    "ankieta.html | saveDraft | jeszcze nie": "komunikat zapisu szkicu",
  };
  const teraz = zwiad().filter((x) => (x.czytaZBazy || x.wolanyPrzez) && !x.obslugaSieci).map((x) => x.strona + ' | ' + x.funkcja + ' | ' + x.zdanie);
  const nowe = teraz.filter((k) => !(k in ZATWIERDZONE));
  assert.deepEqual(nowe, [], 'nowe zdanie pustego stanu bez obsługi błędu sieci (bmOfflineGdy): ' + nowe.join('; '));
  for (const [k, p] of Object.entries(ZATWIERDZONE)) assert.ok(p && p !== '?', 'brak powodu: ' + k);
});
