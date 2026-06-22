/* silnik-momentu.js — Silnik Momentu, SLICE 1 (mózg detekcji)
 *
 * window.SilnikMomentu.detect(snapshot) -> Moment | null
 *
 * Samodzielny: liczy WSZYSTKO z surowych logów (logs[]). Zero zależności od
 * agregatorów KM0, zero zależności od DOM/Supabase — testowalny w izolacji (Node).
 * BEZ sentence/głosu — to późniejszy slice. Tu tylko: czy wydarzyło się coś
 * naprawdę dobrego, a jak tak — który moment i z jakimi liczbami.
 *
 * KONTRAKT snapshot = {
 *   newLog,   // świeży log (ten właśnie zapisany): { logged_at, distance_km, duration_s, training_type? }
 *   logs,     // pełna historia INCLUDING newLog (logs90 z KM0): [{ logged_at, distance_km, duration_s, training_type? }, ...]
 *   pbs,      // athletes.pb_* jako fakt SPRZED newLog: { '5k':sec, '10k':sec, 'half':sec, 'marathon':sec }  (brak = null/undefined)
 *   today,    // 'YYYY-MM-DD' — data odniesienia dla streak/luki
 * }
 *
 * Moment = { type:'pb'|'wolumen'|'streak', evidence:{...}, confidence:0..1 }
 *
 * FILOZOFIA PROGU: "naprawdę dobrze" — rzadko, ale prawda. Cokolwiek poniżej
 * progu => detect zwraca NULL (cisza, nie naciąganie).
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ ŻELAZNA ZASADA CAŁEGO PROJEKTU (obowiązuje na KAŻDYM etapie):             ║
 * ║   KAŻDY moment wymaga ZATWIERDZENIA TRENERA przed wysłaniem do zawodnika. ║
 * ║   detect() tylko PROPONUJE — człowiek (Filip) decyduje. ZERO automatyzacji║
 * ║   bez wyraźnej zgody. Bramka trenera (KM6) to kręgosłup, nie opcja.       ║
 * ║   Zasada trwa, aż Filip sam powie inaczej.                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
(function (root) {
  'use strict';

  // ── PROGI (świadomie wysoko) ───────────────────────────────────────────────
  var PB_MIN_PCT = 0.01;   // pobicie musi być ≥1% starego czasu...
  var PB_MIN_SEC = 2;      // ...i ≥2s (twardy floor — nie chwalimy szumu pomiaru)
  var VOL_MIN_WINDOWS = 3; // wolumen: ≥3 INNE okna do porównania (=> max nad ≥4)
  var STREAK_MIN = 4;      // streak: odzywa się TYLKO na progach 4,8,12,16,20... (nie co tydzień)

  // Dystanse PB + tolerancja klasyfikacji newLog po distance_km
  var PB_CATS = [
    { key: '5k',       km: 5.0,     tol: 0.4 },
    { key: '10k',      km: 10.0,    tol: 0.7 },
    { key: 'half',     km: 21.0975, tol: 1.0 },
    { key: 'marathon', km: 42.195,  tol: 1.5 },
  ];

  // ── helpery dat (czyste, bez stref czasowych) ──────────────────────────────
  function ymd(s) { return String(s).slice(0, 10); }
  function dayIndex(s) {
    var p = ymd(s).split('-');
    return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }
  function weekKey(s) { return Math.floor((dayIndex(s) + 3) / 7); } // poniedziałek = początek tygodnia
  function monthKey(s) { var p = ymd(s).split('-'); return (+p[0]) * 12 + (+p[1] - 1); }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }

  // ── detektory ───────────────────────────────────────────────────────────────

  // PB: newLog bije zapisany rekord na swoim dystansie?
  function detectPB(snap) {
    var nl = snap.newLog;
    if (!nl) return null;
    var dist = num(nl.distance_km);
    var cat = null;
    for (var i = 0; i < PB_CATS.length; i++) {
      if (Math.abs(dist - PB_CATS[i].km) <= PB_CATS[i].tol) { cat = PB_CATS[i]; break; }
    }
    if (!cat) return null;

    var stary = snap.pbs ? snap.pbs[cat.key] : null;
    if (stary == null) return null; // brak rekordu sprzed = nie ma czego bić (pierwszy PB: cisza w Slice 1)
    stary = num(stary);
    var nowy = num(nl.duration_s);
    if (!(nowy > 0) || !(stary > 0)) return null;

    var delta = stary - nowy;            // dodatnie = szybciej
    if (delta <= 0) return null;
    var minDelta = Math.max(stary * PB_MIN_PCT, PB_MIN_SEC);
    if (delta < minDelta) return null;   // poniżej progu = szum, NULL

    return {
      type: 'pb',
      evidence: { dystans: cat.key, nowy_czas: nowy, stary_czas: stary, delta: delta },
      confidence: clamp01((delta / stary) / 0.05), // 5% poprawy = pełna pewność
    };
  }

  // WOLUMEN: tydzień/miesiąc newLog = STRICT max w historii (i jest co porównywać)?
  function detectVolume(snap) {
    var logs = snap.logs || [];
    var nl = snap.newLog;
    if (!nl) return null;

    function evalWindow(keyFn, okno) {
      var sums = {};
      for (var i = 0; i < logs.length; i++) {
        var lg = logs[i];
        if (!lg || !lg.logged_at) continue;
        var km = num(lg.distance_km);
        if (km <= 0) continue; // tylko biegowy wolumen (logi bez dystansu pomijamy)
        var k = keyFn(lg.logged_at);
        sums[k] = (sums[k] || 0) + km;
      }
      var nlKey = keyFn(nl.logged_at);
      var nlSum = sums[nlKey];
      if (nlSum == null) return null;

      var prevMax = -1, others = 0;
      for (var key in sums) {
        if (!sums.hasOwnProperty(key)) continue;
        if (key === String(nlKey)) continue;
        others++;
        if (sums[key] > prevMax) prevMax = sums[key];
      }
      if (others < VOL_MIN_WINDOWS) return null; // za mało historii do orzeczenia "max"
      if (!(nlSum > prevMax)) return null;        // remis = NULL (musi być strict)

      var margin = prevMax > 0 ? (nlSum - prevMax) / prevMax : 1;
      return {
        type: 'wolumen',
        evidence: { okno: okno, suma_km: Math.round(nlSum * 100) / 100, poprzednie_max: Math.round(prevMax * 100) / 100 },
        confidence: clamp01(margin / 0.25), // 25% nad poprzednim maxem = pełna pewność
      };
    }

    var w = evalWindow(weekKey, 'tydzień');
    var m = evalWindow(monthKey, 'miesiąc');
    if (w && m) return (m.confidence > w.confidence) ? m : w;
    return w || m;
  }

  // STREAK: ile tygodni z rzędu (do tygodnia `today`) z ≥1 logiem?
  function detectStreak(snap) {
    var logs = snap.logs || [];
    if (!snap.today) return null;
    var present = {};
    for (var i = 0; i < logs.length; i++) {
      if (logs[i] && logs[i].logged_at) present[weekKey(logs[i].logged_at)] = true;
    }
    var cur = weekKey(snap.today);
    var weeks = 0;
    while (present[cur]) { weeks++; cur--; }
    if (weeks < STREAK_MIN) return null;
    if (weeks % STREAK_MIN !== 0) return null; // tylko okrągłe progi 4,8,12... — między nimi CISZA
    return {
      type: 'streak',
      evidence: { tygodnie: weeks },
      confidence: clamp01(weeks / 8), // 8 tyg = pełna pewność
    };
  }

  // ── §3 rozstrzyganie ─────────────────────────────────────────────────────────
  // Priorytet: PB > wolumen > streak.
  // TODO(slice-stan): tie-break "rzadszy moment dla tego zawodnika" + anti-powtórzenie
  //   (nie ten sam typ 2x z rzędu) wymagają historii momentów — dochodzą gdy
  //   dołożymy warstwę stanu. Na razie czysty priorytet.
  var PRIORITY = ['pb', 'wolumen', 'streak'];

  function resolve(candidates) {
    for (var i = 0; i < PRIORITY.length; i++) {
      for (var j = 0; j < candidates.length; j++) {
        if (candidates[j] && candidates[j].type === PRIORITY[i]) return candidates[j];
      }
    }
    return null;
  }

  function detect(snapshot) {
    if (!snapshot || !snapshot.newLog) return null;
    var candidates = [detectPB(snapshot), detectVolume(snapshot), detectStreak(snapshot)].filter(Boolean);
    if (!candidates.length) return null; // CISZA — nic nie przekroczyło progu
    return resolve(candidates);
  }

  var API = {
    detect: detect,
    _detectPB: detectPB,
    _detectVolume: detectVolume,
    _detectStreak: detectStreak,
    _weekKey: weekKey,
    _thresholds: { PB_MIN_PCT: PB_MIN_PCT, PB_MIN_SEC: PB_MIN_SEC, VOL_MIN_WINDOWS: VOL_MIN_WINDOWS, STREAK_MIN: STREAK_MIN },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.SilnikMomentu = API;

  // ── SELF-TEST (Node: `node js/silnik-momentu.js`) ─────────────────────────────
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    runSelfTest();
  }

  function runSelfTest() {
    var pass = 0, fail = 0;
    function check(name, cond, got) {
      if (cond) { pass++; console.log('  ✓ ' + name); }
      else { fail++; console.log('  ✗ ' + name + '  → got: ' + JSON.stringify(got)); }
    }
    // generator dat: tydzień 0 = tydzień 'today', ujemne = wstecz (poniedziałki)
    function dateInWeek(weeksAgo) {
      var di = dayIndex(TODAY) - weeksAgo * 7;
      var d = new Date(di * 86400000);
      return d.toISOString().slice(0, 10);
    }
    var TODAY = '2026-06-21'; // niedziela

    console.log('Silnik Momentu — self-test\n');

    // 1) CZYSTY PB: 5k 24:00 -> 23:00, brak historii wolumenu/streaku
    var s1 = {
      today: TODAY,
      pbs: { '5k': 1440 },
      newLog: { logged_at: dateInWeek(0), distance_km: 5.0, duration_s: 1380 },
      logs: [{ logged_at: dateInWeek(0), distance_km: 5.0, duration_s: 1380 }],
    };
    var m1 = detect(s1);
    console.log('[1] czysty PB →', JSON.stringify(m1));
    check('PB wykryty', m1 && m1.type === 'pb', m1);
    check('PB evidence.delta = 60', m1 && m1.evidence.delta === 60, m1);

    // 2) CZYSTY WOLUMEN: tygodnie co drugi (-8..0) by NIE złapać streaku; najnowszy = max km
    var s2logs = [];
    [{ w: 8, km: 10 }, { w: 6, km: 12 }, { w: 4, km: 15 }, { w: 2, km: 18 }, { w: 0, km: 30 }]
      .forEach(function (x) { s2logs.push({ logged_at: dateInWeek(x.w), distance_km: x.km, duration_s: 3600 }); });
    var s2 = { today: TODAY, pbs: {}, newLog: s2logs[s2logs.length - 1], logs: s2logs };
    var m2 = detect(s2);
    console.log('[2] czysty wolumen →', JSON.stringify(m2));
    check('WOLUMEN wykryty', m2 && m2.type === 'wolumen', m2);
    check('WOLUMEN okno=tydzień, poprz_max=18', m2 && m2.evidence.okno === 'tydzień' && m2.evidence.poprzednie_max === 18, m2);

    // helper: N tyg z rzędu (do tyg 0), RÓWNE km (remis => brak wolumenu), brak PB
    function streakSnap(nWeeks) {
      var logs = [];
      for (var w = nWeeks - 1; w >= 0; w--) logs.push({ logged_at: dateInWeek(w), distance_km: 20, duration_s: 7200 });
      return { today: TODAY, pbs: {}, newLog: logs[logs.length - 1], logs: logs };
    }

    // 3) CZYSTY STREAK na progu: 4 tyg z rzędu → moment
    var m3 = detect(streakSnap(4));
    console.log('[3] streak=4 (próg) →', JSON.stringify(m3));
    check('STREAK wykryty na 4', m3 && m3.type === 'streak', m3);
    check('STREAK tygodnie = 4', m3 && m3.evidence.tygodnie === 4, m3);

    // 3b) STREAK MIĘDZY PROGAMI: 5 tyg → CISZA (już świętowane na 4, następny dopiero na 8)
    var m3b = detect(streakSnap(5));
    console.log('[3b] streak=5 (między) →', JSON.stringify(m3b));
    check('streak=5 NIE jest typu streak', !m3b || m3b.type !== 'streak', m3b);
    check('streak=5 → null (nic innego nie odpala)', m3b === null, m3b);

    // 3c) KOLEJNY PRÓG: 8 tyg → moment
    var m3c = detect(streakSnap(8));
    console.log('[3c] streak=8 (próg) →', JSON.stringify(m3c));
    check('STREAK wykryty na 8', m3c && m3c.type === 'streak', m3c);
    check('STREAK tygodnie = 8', m3c && m3c.evidence.tygodnie === 8, m3c);

    // 4) KILKA NARAZ: streak na progu (8) + wolumen-max + PB → §3 musi wybrać PB
    var s4logs = [];
    [{ w: 7, km: 9 }, { w: 6, km: 10 }, { w: 5, km: 11 }, { w: 4, km: 12 },
     { w: 3, km: 13 }, { w: 2, km: 14 }, { w: 1, km: 16 }].forEach(function (x) {
      s4logs.push({ logged_at: dateInWeek(x.w), distance_km: x.km, duration_s: 3600 });
    });
    var s4new = { logged_at: dateInWeek(0), distance_km: 5.0, duration_s: 1380 }; // PB-5k + duży tydzień
    s4logs.push(s4new);
    s4logs.push({ logged_at: dateInWeek(0), distance_km: 20, duration_s: 7200 }); // dobicie km w tyg 0 (8 tyg z rzędu)
    var s4 = { today: TODAY, pbs: { '5k': 1440 }, newLog: s4new, logs: s4logs };
    var m4 = detect(s4);
    console.log('[4] kilka naraz →', JSON.stringify(m4));
    check('§3 wybrał PB (priorytet)', m4 && m4.type === 'pb', m4);
    check('§3: streak też by trafił (8)', detectStreak(s4) && detectStreak(s4).evidence.tygodnie === 8, detectStreak(s4));
    check('§3: wolumen też by trafił', detectVolume(s4) && detectVolume(s4).type === 'wolumen', detectVolume(s4));

    // 5) PUSTY: nic się nie wydarzyło → NULL (test ciszy)
    var s5 = {
      today: TODAY,
      pbs: { '5k': 1440 },
      newLog: { logged_at: dateInWeek(0), distance_km: 5.0, duration_s: 1600 }, // wolniej niż PB
      logs: [{ logged_at: dateInWeek(0), distance_km: 5.0, duration_s: 1600 }],
    };
    var m5 = detect(s5);
    console.log('[5] pusty →', JSON.stringify(m5));
    check('CISZA → null', m5 === null, m5);

    // 6) PB-ZA-MAŁY: delta 1s < próg → NULL (nie naciąga)
    var s6 = {
      today: TODAY,
      pbs: { '5k': 1440 },
      newLog: { logged_at: dateInWeek(0), distance_km: 5.0, duration_s: 1439 }, // o 1s
      logs: [{ logged_at: dateInWeek(0), distance_km: 5.0, duration_s: 1439 }],
    };
    var m6 = detect(s6);
    console.log('[6] PB-za-mały →', JSON.stringify(m6));
    check('poniżej progu → null', m6 === null, m6);

    console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  (' + pass + ' ok, ' + fail + ' fail)');
    if (typeof process !== 'undefined') process.exit(fail === 0 ? 0 : 1);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
