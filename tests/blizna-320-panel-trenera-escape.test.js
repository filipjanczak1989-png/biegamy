/* BLIZNA 320 (20.11.2026) — panel trenera: dane zawodnika trafiają do HTML wyłącznie przez escape w MIEJSCU wstawienia (escapeHtml / textContent),
   nigdy przez parser HTML. Podgląd ostatniej wiadomości na liście rozmów nie parsuje treści (podgladWiadomosci zamiast „usuń tagi przez innerHTML”).
   Test ładuje PRAWDZIWY trener.html w atrapie przeglądarki, podaje atrapę bazy z ładunkiem w każdym polu tekstowym i woła funkcje renderujące.
   Każdy zapis innerHTML przechodzi przez prosty tokenizer tagów: ładunek nie może utworzyć elementu ani atrybutu zdarzenia.
   Żeby test nie przeszedł „bo nic się nie wyrenderowało”, każdy scenariusz musi pokazać ładunek w postaci zaescapowanej (render doszedł do danych).
   Samokontrola: ten sam detektor łapie stary wzorzec podglądu (innerHTML na treści) i surowe wstawienie pola. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('./_srodowisko');

const KORZEN = path.join(__dirname, '..');
const ZNACZNIK = 'XSS_B320';
const ZLY = `"'><img src=x onerror=globalThis.${ZNACZNIK}()>`;
const ZLY_ESC = '&lt;img src=x onerror=globalThis.' + ZNACZNIK;
const TERAZ = new Date().toISOString();
const DZIS = new Date().toISOString().slice(0, 10);
const ZA_MIESIAC = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

/* Tokenizer tagów: wystarczy na HTML, który składa panel. Zwraca tagi z nazwą i atrybutami (nazwa → wartość). */
function tagi(html) {
  const wynik = [];
  /* wartość bez cudzysłowu może zawierać „=”: przeglądarka ją przyjmie (błąd składni, nie odrzucenie), więc detektor też */
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
/* Ładunek „żyje”, gdy utworzył element <img src=x> albo jakikolwiek atrybut on… niesie znacznik, albo href/src zaczyna się od javascript:. */
function zywe(html) {
  if (html.includes('<img src=x onerror')) return [{ nazwa: 'img', atr: { doslownie: 'tak' } }];   /* drugi, niezależny detektor: dosłowny ładunek w HTML */
  return tagi(html).filter((t) => (t.nazwa === 'img' && t.atr.src === 'x')
    || Object.entries(t.atr).some(([k, v]) => (/^on/.test(k) && v.includes(ZNACZNIK)) || k.includes(ZNACZNIK))
    || ['href', 'src'].some((k) => /^\s*javascript:/i.test(t.atr[k] || '')));
}

function element(log, id) {
  let html = '';
  const el = {
    id, style: { setProperty() {}, removeProperty() {} }, dataset: {}, children: [], value: '', textContent: '', className: '', scrollTop: 0, scrollHeight: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    get innerHTML() { return html; }, set innerHTML(v) { html = String(v); log.push(html); },
    set outerHTML(v) { log.push(String(v)); },
    appendChild(c) { el.children.push(c); return c; }, append() {}, prepend() {}, insertBefore(c) { return c; }, removeChild() {}, remove() {},
    insertAdjacentHTML(_, v) { log.push(String(v)); },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, hasAttribute: () => false,
    focus() {}, click() {}, scrollIntoView() {}, scrollTo() {}, closest: () => null,
    querySelector: () => element(log), querySelectorAll: () => [], getContext: () => null,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }),
  };
  return el;
}

/* Atrapa bazy: każde zapytanie do tabeli oddaje wiersze z ładunkiem; łańcuch metod jak w supabase-js. */
function atrapaSb(dane) {
  const zapytanie = (t) => {
    const rows = (dane[t] || []).map((r) => JSON.parse(JSON.stringify(r)));
    let glowa = false;
    const q = {};
    for (const m of ['eq', 'neq', 'in', 'gte', 'gt', 'lte', 'lt', 'order', 'limit', 'not', 'is', 'or', 'ilike', 'like', 'range', 'match', 'filter', 'contains', 'overlaps', 'textSearch', 'insert', 'update', 'upsert', 'delete'])
      q[m] = () => q;
    q.select = (_k, o) => { if (o && o.head) glowa = true; return q; };
    q.maybeSingle = () => Promise.resolve({ data: rows[0] || null, error: null });
    q.single = q.maybeSingle;
    q.then = (a, b) => Promise.resolve({ data: glowa ? null : rows, error: null, count: rows.length }).then(a, b);
    return q;
  };
  return {
    from: zapytanie, rpc: (n) => zapytanie('rpc:' + n),
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'c1' }, access_token: 't' } }, error: null }),
      getUser: async () => ({ data: { user: { id: 'c1' } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }), createSignedUrls: async () => ({ data: [] }), upload: async () => ({}) }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  };
}

const ZAW = { id: 'a1', user_id: 'u1', coach_id: 'c1', is_public: true, strava_athlete_id: 1, full_name: ZLY, goal: ZLY, city: ZLY, avatar_url: ZLY, created_at: TERAZ,
  race_goals: [{ name: ZLY, date: ZA_MIESIAC }], pb_5k: ZLY, pb_10k: ZLY, pb_half: ZLY, pb_marathon: ZLY };
const LOG = { id: 'l1', athlete_id: 'a1', training_type: ZLY, pace: ZLY, gap_pace: ZLY, heart_rate: 150, comment: ZLY, coach_comment: ZLY,
  athlete_reaction: ZLY, attachment_url: ZLY, strava_link: 'javascript:globalThis.' + ZNACZNIK + '=1', distance_km: 10, elevation_gain: 100,
  logged_at: TERAZ, feel: 'good', source: 'manual', athletes: { id: 'a1', full_name: ZLY, is_public: true, coach_id: 'c1' } };
const DANE = {
  athletes: [ZAW], public_athletes: [ZAW], coaches: [{ id: 'c1', full_name: 'Trener' }],
  training_logs: [LOG],
  messages: [{ id: 'm1', athlete_id: 'a1', sender: 'athlete', body: ZLY, sent_at: TERAZ, read: false }],
  log_comments: [{ id: 'k1', log_id: 'l1', athlete_id: 'a1', body: ZLY, created_at: TERAZ, athletes: { full_name: ZLY } }],
  ai_reports: [{ id: 'r1', athlete_id: 'a1', report_type: 'weekly', athlete_reaction: 'thumbs_up', athlete_feedback: ZLY, athlete_feedback_at: TERAZ,
    generated_at: TERAZ, content_markdown: ZLY, athletes: { full_name: ZLY } }],
  trainings: [{ id: 't1', athlete_id: 'a1', date: DZIS, type: ZLY, status: 'planned', distance_km: 5, plan_source: 'generator' }],
  training_plans: [{ id: 'p1', athlete_id: 'a1', status: 'draft', plan_type: ZLY, target_race_type: ZLY, target_time: ZLY, ai_summary: ZLY,
    start_date: DZIS, end_date: ZA_MIESIAC, total_workouts: 3, total_distance_km: 20 }],
  training_plan_workouts: [{ id: 'w1', plan_id: 'p1', date: DZIS, week_number: 1, workout_type: ZLY, target_pace: ZLY, title: ZLY, description: ZLY, target_distance_km: 5 }],
  athlete_intake_forms: [{ id: 'i1', full_name: ZLY, email: ZLY, phone: ZLY, main_goal: [ZLY], pb_5k: ZLY, km_per_week_now: ZLY, running_since: ZLY,
    target_race_name: ZLY, strong_points: ZLY, weak_points: ZLY, main_blocker: ZLY, garmin_model: ZLY, strava_url: ZLY, has_garmin: true, has_strava: true,
    birth_year: 1990, submitted_at: TERAZ, status: 'pending' }],
  delivered_moments: [{ id: 'd1', athlete_id: 'a1', type: ZLY, evidence: {}, payload: {}, status: 'pending', athletes: { full_name: ZLY } }],
  races: [{ id: 'z1', name: ZLY, date: ZA_MIESIAC, distance_km: 10 }], race_signups: [{ race_id: 'z1', athlete_id: 'a1' }],
  strava_activities: [{ id: 's1', name: ZLY, distance: 5000, average_speed: 3, start_date: TERAZ }],
  nutrition_meals: [{ id: 'n1', athlete_id: 'u1', name: ZLY, meal_type: ZLY, eaten_at: TERAZ, kcal: 100, weight_g: 50 }],
  nutrition_profiles: [{ athlete_id: 'u1', tdee: 2500, goal: ZLY, weight_kg: 70 }],
  injuries: [{ athlete_id: 'a1', poziom: ZLY, miejsce: ZLY }],
  'rpc:znajdz_zawodnika_po_emailu': [{ id: 'a1', full_name: ZLY, coach_id: null }],
  'rpc:get_app_stats': [{ total_count: 1, week_count: 1 }],
  'rpc:prosby_do_mnie': [{ id: 'q1', athlete_id: 'a1', imie: ZLY, utworzono: TERAZ }],   /* K2, blizna-323 */
};

function panel() {
  const ctx = S.zaladujStrone('trener.html');
  const log = [];
  const rej = new Map();
  const daj = (id) => { if (!rej.has(id)) rej.set(id, element(log, id)); return rej.get(id); };
  ctx.document.getElementById = daj;
  ctx.document.querySelector = (s) => (typeof s === 'string' && s[0] === '#') ? daj(s.slice(1)) : element(log);
  ctx.document.createElement = () => element(log);
  ctx.document.body = element(log); ctx.document.head = element(log);
  ctx.sb = atrapaSb(DANE);
  ctx.confirm = () => false; ctx.prompt = () => null; ctx.alert = () => {};
  vm.runInContext("_coachId = 'c1'; _dbAthletes = [" + JSON.stringify(ZAW) + "]; window._selectedAthleteId = 'a1'; _currentChatAthleteId = 'a1';", ctx);
  return { ctx, log };
}
const czekaj = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };

/* Scenariusze: nazwa → wywołanie funkcji panelu, które renderuje dane zawodnika. */
const SCENARIUSZE = [
  ['lista rozmów (podgląd ostatniej wiadomości)', (c) => c.loadCoachMsgsList()],
  ['wątek czatu', (c) => c.loadCoachChat()],
  ['logi zawodnika (karty)', (c) => c.renderLogs_db([DANE.training_logs[0]])],
  ['karty zawodników', (c) => c.renderDbAthletes([ZAW])],
  ['feed aktywności', (c) => c.loadCoachSocialFeed()],
  ['komentarze pod logiem', (c) => c._loadCComments('l1')],
  ['ranking tygodnia', (c) => c.loadCoachRanking()],
  ['statystyki zawodnika w panelu', (c) => c.loadPanelStats()],
  ['statystyki zawodnika (okno)', (c) => c.loadAthleteDetailStats('a1', c.document.getElementById('stat-okno'))],
  ['analityka: zawodnicy 30 dni', (c) => c.loadAnalytics()],
  ['plany treningowe', (c) => c.loadPanelTrainingPlans()],
  ['podgląd planu (treningi)', (c) => c.renderPlanPreviewInCreateModal('p1')],
  ['świeże opinie o raportach', (c) => c.loadFreshFeedbacks()],
  ['ankiety wstępne (lista)', (c) => c.loadPendingIntakes()],
  ['ankieta wstępna (szczegóły)', (c) => c.openIntakeModal('i1')],
  ['momenty do zatwierdzenia', (c) => c.loadPendingMoments()],
  ['żywienie zawodnika', (c) => c.loadPanelDiet()],
  ['Strava zawodnika', (c) => c.loadStravaPanel()],
  ['prośby o trenera (K2)', (c) => c.loadProsbyTrenera()],
];

for (const [nazwa, wolaj] of SCENARIUSZE) {
  test(`panel trenera — ${nazwa}: ładunek tylko zaescapowany, żaden element ani atrybut zdarzenia z danych`, async () => {
    const { ctx, log } = panel();
    assert.equal(typeof wolaj, 'function');
    await wolaj(ctx);
    await czekaj();
    const zle = log.flatMap((h) => zywe(h).map((t) => ({ t, fragment: h.slice(0, 160) })));
    assert.deepEqual(zle.map((z) => z.t), [], 'żywy ładunek w HTML panelu: ' + JSON.stringify(zle.slice(0, 2)));
    assert.ok(log.some((h) => h.includes(ZLY_ESC)), 'render nie doszedł do danych zawodnika (brak ładunku nawet w postaci zaescapowanej) — scenariusz nic nie sprawdza');
  });
}

test('podgladWiadomosci: formaty mediów aplikacji → etykieta, reszta dosłownie; nie dotyka parsera HTML', () => {
  const { ctx, log } = panel();
  const p = ctx.podgladWiadomosci;
  assert.equal(p('<span class="msg-recall">Wiadomość cofnięta</span>'), 'Wiadomość cofnięta');
  assert.equal(p('<div class="voice-msg"><button class="voice-play" onclick="playVoice(this,\'a/b.webm\')">▶️</button></div>'), '🎤 Wiadomość głosowa');
  assert.equal(p('<img src="a1/x.jpg"><img src="a1/y.jpg">'), '📷 Zdjęcie');
  assert.equal(p('cześć <b>trenerze</b>'), 'cześć <b>trenerze</b>');
  assert.equal(p(null), '');
  const przed = log.length;
  p(ZLY);
  assert.equal(log.length, przed, 'podgląd nie może zapisywać innerHTML');
});

test('trener.html: brak parsowania treści wiadomości przez innerHTML, pola zawodnika przez escape', () => {
  const t = fs.readFileSync(path.join(KORZEN, 'trener.html'), 'utf8').replace(/\r/g, '');
  assert.ok(!t.includes('stripHtmlChat'), 'stary podgląd wrócił');
  assert.doesNotMatch(t, /createElement\(['"]div['"]\)\s*;\s*\w+\.innerHTML\s*=\s*\w+\s*;\s*return\s+\w+\.textContent/, 'wzorzec „usuń tagi przez innerHTML”');
  for (const w of ["${escapeHtml(a.pb_marathon)}</span>", "${escapeHtml(l.training_type||'Trening')}</div>", "font-family:'DM Mono',monospace;\">${escapeHtml(l.pace)}</div>",
    "flex-shrink:0;\">${escapeHtml(initials)}</div>", "flex-shrink:0;\">'+escapeHtml(ini)+'</div>'", "value=\"${escapeHtml(l.coach_comment||'')}\"",
    "${escHtml(initials(it.full_name))}", "${escHtml(initials(nm))}", "${escapeHtml(details)}</div>", "${escapeHtml(p.plan_type)} ·",
    "escapeHtml(raceLabels[p.target_race_type] || p.target_race_type)", "const prev=a.lastMsg?podgladWiadomosci(a.lastMsg.body)"])
    assert.ok(t.includes(w), 'brak: ' + w);
  for (const zle of ['${a.pb_marathon}</span>', '${a.pb_half}</span>', '${a.pb_10k}</span>', '${a.pb_5k}</span>', "${l.training_type||'Trening'}</div>",
    "monospace;\">${l.pace}</div>", "flex-shrink:0;\">${initials}</div>", "flex-shrink:0;\">'+ini+'</div>'", '${initials(it.full_name)}</div>', '${initials(nm)}</div>'])
    assert.ok(!t.includes(zle), 'wrócił surowy wzorzec: ' + zle);
});

test('samokontrola: detektor łapie stary podgląd (innerHTML na treści) i surowe wstawienie pola', async () => {
  const log = [];
  const doc = { createElement: () => element(log) };
  const stary = new Function('document', "return function(h){const t=document.createElement('div');t.innerHTML=h;return t.textContent||t.innerText||'';}")(doc);
  stary(ZLY);
  assert.ok(log.some((h) => zywe(h).length > 0), 'detektor nie złapał starego podglądu');
  assert.ok(zywe('<div class="x">' + ZLY + '</div>').length > 0, 'detektor nie złapał surowego tekstu');
  assert.ok(zywe('<a href="javascript:globalThis.' + ZNACZNIK + '=1">x</a>').length > 0, 'detektor nie złapał javascript: w href');
  assert.ok(zywe('<input value="' + ZLY.replace(/'/g, '').replace('<img src=x', '<b') + '">').length > 0, 'detektor nie złapał wyjścia z atrybutu (sam tokenizer, bez dosłownego wzorca)');
  assert.ok(tagi('<img src=x onerror=a.b=1>').some((t) => t.atr.onerror === 'a.b=1'), 'tokenizer: wartość z „=” bez cudzysłowu');
  const { ctx } = panel();
  assert.equal(zywe('<div>' + ctx.escapeHtml(ZLY) + '</div><input value="' + ctx.escapeHtml(ZLY) + '">').length, 0, 'escapeHtml musi dawać czysty wynik');
});
