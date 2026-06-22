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

  // DYSTANS-SKALA: narastająca suma WSZYSTKICH biegowych km vs miasta geograficzne.
  // Miasta = współrzędne + kierunek (W=zachód do Londynu, potem trasa ZAWRACA na E=wschód).
  // Dystanse liczone LIVE haversine'em ze startu zawodnika (_startPoint) → km i prog dynamiczne.
  // prog (kumulatywny, rosnący): W → prog=km; E → prog = westmostKm (zawrót) + km. Ultra = trasa bez końca.
  var DYSTANS_SRODA = { lat: 52.2287, lon: 17.2799 };  // geo-pivot (referencyjny środek; patrz _startPoint)
  var DYSTANS_CELE = [
    { miasto: 'Poznań',        kierunek: 'W', lat: 52.4064, lon: 16.9252 },
    { miasto: 'Zielona Góra',  kierunek: 'W', lat: 51.9356, lon: 15.5062 },
    { miasto: 'Berlin',        kierunek: 'W', lat: 52.5200, lon: 13.4050 },
    { miasto: 'Drezno',        kierunek: 'W', lat: 51.0504, lon: 13.7373 },
    { miasto: 'Praga',         kierunek: 'W', lat: 50.0755, lon: 14.4378 },
    { miasto: 'Lipsk',         kierunek: 'W', lat: 51.3397, lon: 12.3731 },
    { miasto: 'Norymberga',    kierunek: 'W', lat: 49.4521, lon: 11.0767 },
    { miasto: 'Frankfurt n.M.',kierunek: 'W', lat: 50.1109, lon: 8.6821  },
    { miasto: 'Strasburg',     kierunek: 'W', lat: 48.5734, lon: 7.7521  },
    { miasto: 'Amsterdam',     kierunek: 'W', lat: 52.3676, lon: 4.9041  },
    { miasto: 'Paryż',         kierunek: 'W', lat: 48.8566, lon: 2.3522  },
    { miasto: 'Londyn',        kierunek: 'W', lat: 51.5074, lon: -0.1278 },
    { miasto: 'Warszawa',      kierunek: 'E', lat: 52.2297, lon: 21.0122 },
    { miasto: 'Białystok',     kierunek: 'E', lat: 53.1325, lon: 23.1688 },
    { miasto: 'Wilno',         kierunek: 'E', lat: 54.6872, lon: 25.2797 },
    { miasto: 'Mińsk',         kierunek: 'E', lat: 53.9006, lon: 27.5590 },
    { miasto: 'Kijów',         kierunek: 'E', lat: 50.4501, lon: 30.5234 },
    { miasto: 'Moskwa',        kierunek: 'E', lat: 55.7558, lon: 37.6173 },
    { miasto: 'Kazań',         kierunek: 'E', lat: 55.8304, lon: 49.0661 },
    { miasto: 'Jekaterynburg', kierunek: 'E', lat: 56.8389, lon: 60.6057 },
    { miasto: 'Omsk',          kierunek: 'E', lat: 54.9885, lon: 73.3242 },
    { miasto: 'Nowosybirsk',   kierunek: 'E', lat: 55.0084, lon: 82.9357 },
  ];

  function haversineKm(a, b) {                          // a,b = {lat,lon} → km (R=6371.0088)
    var R = 6371.0088, rad = function (d) { return d * Math.PI / 180; };
    var dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Normalizacja nazwy miasta: trim, zwiń spacje, title-case po spacjach i myślnikach,
  // polskie znaki zachowane. "środa wielkopolska"→"Środa Wielkopolska", "ŚRODA"→"Środa",
  // "biała-podlaska"→"Biała-Podlaska". Pusty/null → null (fallback robi warstwa zdania).
  function _normalizeCity(raw) {
    if (raw == null) return null;
    var s = String(raw).trim().replace(/\s+/g, ' ').toLowerCase();
    if (!s) return null;
    return s.replace(/(^|[\s\-])(.)/g, function (m, sep, ch) { return sep + ch.toUpperCase(); });
  }

  // HAK EKSPANSJA: punkt startu zawodnika. TERAZ lat/lon = Środa (stałe — cały userbase
  // w klastrze ~30km, błąd dystansu <5%, < zaokrąglenia). Reszta detektora używa TYLKO
  // {nazwa, lat, lon} i nie wie o źródle. Gdy klaster rozproszy się >80km: podmień CIAŁO
  // na geokodowanie (city → realne lat/lon) — i wszystko (km, prog, animacja) policzy się samo.
  function _startPoint(rawCity) {
    return { nazwa: _normalizeCity(rawCity), lat: DYSTANS_SRODA.lat, lon: DYSTANS_SRODA.lon };
  }

  // ── helpery dat (czyste, bez stref czasowych) ──────────────────────────────
  function ymd(s) { return String(s).slice(0, 10); }
  function dayIndex(s) {
    var p = ymd(s).split('-');
    return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }
  function weekKey(s) { return Math.floor((dayIndex(s) + 3) / 7); } // poniedziałek = początek tygodnia
  function weekLabel(wk) {                          // weekKey → "DD.MM" (poniedziałek tego tygodnia)
    var d = new Date((wk * 7 - 3) * 86400000);      // odwrotność weekKey
    return d.getUTCDate() + '.' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }
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

    function evalWindow(keyFn, okno, withBars) {
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
      var evidence = { okno: okno, suma_km: Math.round(nlSum * 100) / 100, poprzednie_max: Math.round(prevMax * 100) / 100 };
      if (withBars) {                              // 6 ostatnich tygodni do nlKey — dane słupków animacji
        var slupki = [];
        for (var bw = nlKey - 5; bw <= nlKey; bw++)
          slupki.push({ label: weekLabel(bw), km: Math.round((sums[bw] || 0) * 100) / 100, peak: bw === nlKey });
        evidence.slupki = slupki;                  // dedup-SAFE: 5 słupków historycznych stałe, 6. śledzi suma_km (już w kluczu)
      }
      return { type: 'wolumen', evidence: evidence, confidence: clamp01(margin / 0.25) }; // 25% nad poprzednim maxem = pełna pewność
    }

    var w = evalWindow(weekKey, 'tydzień', true);  // tylko tydzień niesie słupki (animacja = tygodniowa)
    var m = evalWindow(monthKey, 'miesiąc', false);
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

  // DYSTANS-SKALA: suma WSZYSTKICH biegowych km (snap.suma_calkowita_km) przekroczyła próg miasta?
  // Zwraca NAJDALSZE osiągnięte miasto. Dedup (po mieście — evidence stałe) → każde miasto raz.
  function detectDystans(snap) {
    var suma = snap.suma_calkowita_km;
    if (suma == null || !(suma > 0)) return null;
    var sp = _startPoint(snap.start_miasto);            // {nazwa, lat, lon} — jedyne wejście o starcie
    var i;
    // westmostKm = najdalszy zachodni cel (punkt zawrotu) — liczony dla TEGO startu
    var westmostKm = 0;
    for (i = 0; i < DYSTANS_CELE.length; i++)
      if (DYSTANS_CELE[i].kierunek === 'W') { var dw = haversineKm(sp, DYSTANS_CELE[i]); if (dw > westmostKm) westmostKm = dw; }
    // km (linia prosta start→miasto) + prog (kumulatywny); sort po prog → robust na dowolny start
    var lista = [];
    for (i = 0; i < DYSTANS_CELE.length; i++) {
      var c = DYSTANS_CELE[i], km = haversineKm(sp, c);
      lista.push({ c: c, km: km, prog: c.kierunek === 'W' ? km : westmostKm + km });
    }
    lista.sort(function (a, b) { return a.prog - b.prog; });
    var reached = null, prev = null;
    for (i = 0; i < lista.length; i++) {
      if (suma >= lista[i].prog) { prev = reached; reached = lista[i]; } else break;
    }
    if (!reached) return null;                          // jeszcze nie dobiegł do najbliższego miasta
    return {
      type: 'dystans',
      // evidence = TOŻSAMOŚĆ miasta (stała) → dedup po mieście. żywa suma_km POZA evidence (inaczej re-odpala codziennie).
      evidence: { miasto: reached.c.miasto, dystans_miasta: Math.round(reached.km), kierunek: reached.c.kierunek,
                  poprzednie_miasto: prev ? prev.c.miasto : (sp.nazwa || null), start: sp.nazwa },
      suma_km: Math.round(suma * 10) / 10,
      confidence: 1,
    };
  }

  // ── §3 rozstrzyganie + WARSTWA STANU ─────────────────────────────────────────
  // Gdy >1 detektor odpali, wybór = scoring łączący 3 reguły w jeden porównywalny wynik:
  //   1. PRIORYTET: PB > wolumen > streak  (baza)
  //   2. RZADKOŚĆ ("rzadszy moment dla tego zawodnika"): typ, którego zawodnik
  //      DOSTAŁ mało/nigdy, dostaje bonus — może NADPISAĆ priorytet, gdy wyższy
  //      typ jest dla niego rutyną (np. bije PB co tydzień, a streak 1. raz w życiu).
  //   3. ANTI-POWTÓRZENIE (miękkie): ten sam typ co OSTATNIO dostarczony dostaje
  //      karę — przy alternatywie przełącza na inny typ; samotny powtórzony typ
  //      (np. realny 2. PB) i tak leci. Bramka trenera (KM6) = ostateczny filtr,
  //      więc silnik nie zabija prawdziwego momentu — proponuje, człowiek decyduje.
  //   4. DEDUP (po wartości) — KRĘGOSŁUP ANTY-SPAMU: moment, którego TA SAMA
  //      zdobycz (typ + identyczne evidence, np. "streak 4") już została
  //      dostarczona, jest ODRZUCANY zanim trafi do scoringu. Tak ginie spam
  //      "ten sam kamień milowy codziennie, aż licznik drgnie" (anti-powtórzenie
  //      tego nie łapie, bo gdy moment jest jedynym kandydatem, miękka kara go
  //      nie zeruje). NOWA wartość (streak 8, nowy rekord tygodnia) = inne
  //      evidence → leci normalnie. Dowód na realnym Danielu: 12 → 4 momenty.
  //
  // HISTORIA = momenty DOSTARCZONE (zatwierdzone przez trenera i wysłane do
  //   zawodnika), NIE samo "wykryte". Spójne z żelazną zasadą: do historii trafia
  //   tylko to, co realnie dotarło — odrzucona propozycja nie truje rzadkości/powtórzeń.
  //   snapshot.historia = [{ type, ... }, ...]  (najstarszy → najnowszy; ostatni = ostatnio dostarczony)
  //   Caller (KM6) dopisuje przez recordDelivered() PO zatwierdzeniu trenera.
  //   Brak historii (undefined/[]) ⇒ same wagi rzadkości ⇒ czysty priorytet (wstecznie zgodne).
  //
  // Wagi (strojenie): NOVELTY (count 0) = pełny bonus rzadkości; kara powtórzenia
  //   dobrana tak, by przy RÓWNEJ rzadkości przełączyć typ, ale go nie zerować.
  var PRIORITY_SCORE = { pb: 3, dystans: 2.5, wolumen: 2, streak: 1 }; // dystans = rzadki geo-kamień, nad wolumenem
  var RARITY_W = 2.5;       // bonus rzadkości = RARITY_W / (ile_razy_dostarczony + 1)  → count0=2.5 (nowość)
  var REPEAT_PENALTY = 1.5; // miękka kara, gdy typ == ostatnio dostarczony

  function countDelivered(historia, type) {
    var c = 0;
    for (var i = 0; i < historia.length; i++) if (historia[i] && historia[i].type === type) c++;
    return c;
  }
  function lastDelivered(historia) {
    return historia.length ? historia[historia.length - 1].type : null;
  }
  function scoreCandidate(c, historia) {
    historia = historia || [];
    var prio = PRIORITY_SCORE[c.type] || 0;
    var rarity = RARITY_W / (countDelivered(historia, c.type) + 1);
    var repeat = (lastDelivered(historia) === c.type) ? REPEAT_PENALTY : 0;
    return prio + rarity - repeat;
  }

  function resolve(candidates, historia) {
    historia = historia || [];
    var best = null, bestScore = -Infinity, bestPrio = -Infinity;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (!c) continue;
      var s = scoreCandidate(c, historia);
      var p = PRIORITY_SCORE[c.type] || 0;
      // remis wyniku → rozstrzyga surowy priorytet (deterministycznie)
      if (s > bestScore || (s === bestScore && p > bestPrio)) { best = c; bestScore = s; bestPrio = p; }
    }
    return best;
  }

  // Dopisanie DOSTARCZONEGO momentu do historii (czyste — zwraca NOWĄ tablicę, nie mutuje).
  // Woła caller PO zatwierdzeniu trenera (KM6). Najnowszy ląduje na końcu.
  // MUSI nieść evidence — to po nim działa dedup (rozróżnia streak 4 od streak 8).
  function recordDelivered(historia, moment) {
    var h = (historia || []).slice();
    if (moment && moment.type) h.push({ type: moment.type, evidence: moment.evidence });
    return h;
  }

  // Ta sama zdobycz? — typ + identyczne evidence. (evidence z detektorów ma stały
  // porządek kluczy, więc porównanie po JSON jest stabilne.)
  function sameMoment(a, b) {
    return !!(a && b) && a.type === b.type && JSON.stringify(a.evidence) === JSON.stringify(b.evidence);
  }
  function alreadyDelivered(historia, cand) {
    for (var i = 0; i < historia.length; i++) if (sameMoment(historia[i], cand)) return true;
    return false;
  }

  function detect(snapshot) {
    if (!snapshot || !snapshot.newLog) return null;
    var historia = snapshot.historia || [];
    var candidates = [detectPB(snapshot), detectVolume(snapshot), detectStreak(snapshot), detectDystans(snapshot)].filter(Boolean);
    // DEDUP: odrzuć już dostarczone zdobycze (anty-spam) zanim policzymy scoring
    candidates = candidates.filter(function (c) { return !alreadyDelivered(historia, c); });
    if (!candidates.length) return null; // CISZA — nic NOWEGO ponad próg
    return resolve(candidates, historia);
  }

  var API = {
    detect: detect,
    recordDelivered: recordDelivered,
    _detectPB: detectPB,
    _detectVolume: detectVolume,
    _detectStreak: detectStreak,
    _detectDystans: detectDystans,
    _normalizeCity: _normalizeCity,
    _startPoint: _startPoint,
    _dystansCele: DYSTANS_CELE,
    _dystansSroda: DYSTANS_SRODA,
    _haversineKm: haversineKm,
    _resolve: resolve,
    _score: scoreCandidate,
    _sameMoment: sameMoment,
    _alreadyDelivered: alreadyDelivered,
    _lastDelivered: lastDelivered,
    _countDelivered: countDelivered,
    _weekKey: weekKey,
    _thresholds: { PB_MIN_PCT: PB_MIN_PCT, PB_MIN_SEC: PB_MIN_SEC, VOL_MIN_WINDOWS: VOL_MIN_WINDOWS, STREAK_MIN: STREAK_MIN },
    _weights: { PRIORITY_SCORE: PRIORITY_SCORE, RARITY_W: RARITY_W, REPEAT_PENALTY: REPEAT_PENALTY },
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
    check('WOLUMEN słupki: 6 tygodni', m2 && m2.evidence.slupki && m2.evidence.slupki.length === 6, m2);
    check('WOLUMEN słupki: ostatni = peak = suma', m2 && m2.evidence.slupki[5].peak === true && m2.evidence.slupki[5].km === m2.evidence.suma_km, m2);

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

    // ── WARSTWA STANU (§3 rzadkość + anti-powtórzenie) ──────────────────────────

    // 7) RZADKOŚĆ NADPISUJE PRIORYTET: rutynowy PB (10× dostarczony) vs nowy streak → streak
    //    (last=wolumen, żeby izolować rzadkość od anti-powtórzenia)
    var s7logs = [];
    [{ w: 3, km: 30 }, { w: 2, km: 20 }, { w: 1, km: 20 }].forEach(function (x) {
      s7logs.push({ logged_at: dateInWeek(x.w), distance_km: x.km, duration_s: 7200 });
    });
    var s7new = { logged_at: dateInWeek(0), distance_km: 5.0, duration_s: 1380 }; // 5k PB
    s7logs.push({ logged_at: dateInWeek(0), distance_km: 20, duration_s: 7200 }); // week0 obecny (streak=4), suma 25 < week3=30 → brak wolumenu
    s7logs.push(s7new);
    var s7hist = [];
    for (var k = 0; k < 10; k++) s7hist.push({ type: 'pb' });
    s7hist.push({ type: 'wolumen' }); // ostatnio dostarczony = wolumen
    var s7 = { today: TODAY, pbs: { '5k': 1440 }, newLog: s7new, logs: s7logs, historia: s7hist };
    var m7 = detect(s7);
    console.log('[7] rzadkość > priorytet →', JSON.stringify(m7));
    check('PB i streak kandydują', !!(detectPB(s7) && detectStreak(s7)), [detectPB(s7), detectStreak(s7)]);
    check('wolumen NIE odpala (nie max)', !detectVolume(s7), detectVolume(s7));
    check('§3: rutynowy PB ustępuje nowemu streakowi', m7 && m7.type === 'streak', m7);

    // 8) ANTI-POWTÓRZENIE (miękkie): ostatnio dostarczony = PB, rzadkość RÓWNA → przełącz na wolumen
    var s8logs = [];
    [{ w: 8, km: 10 }, { w: 6, km: 12 }, { w: 4, km: 14 }, { w: 2, km: 16 }].forEach(function (x) {
      s8logs.push({ logged_at: dateInWeek(x.w), distance_km: x.km, duration_s: 7200 });
    });
    var s8new = { logged_at: dateInWeek(0), distance_km: 5.0, duration_s: 1380 }; // 5k PB
    s8logs.push({ logged_at: dateInWeek(0), distance_km: 20, duration_s: 7200 }); // week0 = wolumen-max (luki → brak streaku)
    s8logs.push(s8new);
    var s8base = { today: TODAY, pbs: { '5k': 1440 }, newLog: s8new, logs: s8logs };
    var s8rep = { today: TODAY, pbs: s8base.pbs, newLog: s8new, logs: s8logs,
                  historia: [{ type: 'wolumen' }, { type: 'pb' }, { type: 'wolumen' }, { type: 'pb' }] }; // pb=2, wol=2, last=pb
    var m8 = detect(s8rep);
    console.log('[8] anti-powtórzenie (last=pb) →', JSON.stringify(m8));
    check('PB i wolumen kandydują', !!(detectPB(s8rep) && detectVolume(s8rep)), [detectPB(s8rep), detectVolume(s8rep)]);
    check('streak NIE odpala (luki)', !detectStreak(s8rep), detectStreak(s8rep));
    check('§3: PB=ostatni → przełącz na wolumen', m8 && m8.type === 'wolumen', m8);
    // 8b) KONTROLA: ten sam snapshot, last=streak → brak kary, priorytet wraca → PB
    var s8ctl = { today: TODAY, pbs: s8base.pbs, newLog: s8new, logs: s8logs,
                  historia: [{ type: 'wolumen' }, { type: 'pb' }, { type: 'wolumen' }, { type: 'pb' }, { type: 'streak' }] };
    var m8c = detect(s8ctl);
    console.log('[8b] bez powtórzenia (last=streak) →', JSON.stringify(m8c));
    check('§3: brak powtórzenia → PB (priorytet)', m8c && m8c.type === 'pb', m8c);

    // 9) SAMOTNY POWTÓRZONY TYP leci mimo wszystko (miękkość)
    var s9 = {
      today: TODAY, pbs: { '5k': 1440 },
      newLog: { logged_at: dateInWeek(0), distance_km: 5.0, duration_s: 1380 },
      logs: [{ logged_at: dateInWeek(0), distance_km: 5.0, duration_s: 1380 }],
      historia: [{ type: 'pb' }], // ostatni = pb, brak alternatywy
    };
    var m9 = detect(s9);
    console.log('[9] samotny powtórzony PB →', JSON.stringify(m9));
    check('samotny PB (powtórka) i tak leci', m9 && m9.type === 'pb', m9);

    // 10) recordDelivered: czyste dopisanie na koniec
    var h0 = [{ type: 'pb' }];
    var h1 = recordDelivered(h0, { type: 'streak', evidence: { tygodnie: 4 } });
    check('recordDelivered nie mutuje wejścia', h0.length === 1, h0);
    check('recordDelivered dopisał najnowszy na koniec', h1.length === 2 && h1[1].type === 'streak', h1);

    // ── DEDUP po wartości (anty-spam) ──────────────────────────────────────────

    // 11) TA SAMA zdobycz już dostarczona → CISZA (jedyny kandydat odfiltrowany)
    (function () {
      var snap = streakSnap(4);
      snap.historia = [{ type: 'streak', evidence: { tygodnie: 4 } }]; // streak-4 JUŻ dostarczony
      var m = detect(snap);
      console.log('[11] streak-4 już dostarczony →', JSON.stringify(m));
      check('dedup: ta sama zdobycz → null', m === null, m);
    })();

    // 12) NOWA wartość tego samego typu → leci (inne evidence)
    (function () {
      var snap = streakSnap(8);
      snap.historia = [{ type: 'streak', evidence: { tygodnie: 4 } }]; // dostarczony 4, teraz 8
      var m = detect(snap);
      console.log('[12] streak-8 mimo dostarczonego streak-4 →', JSON.stringify(m));
      check('dedup nie blokuje NOWEJ wartości', m && m.type === 'streak' && m.evidence.tygodnie === 8, m);
    })();

    // 13) REPLAY-STYL: streak-4 codziennie w obrębie progu → ogłoszony 1×, nie N×
    //     (symulacja: detect → recordDelivered → detect z tą samą serią)
    (function () {
      var historia = [];
      var fires = 0;
      for (var day = 0; day < 4; day++) { // 4 "dni" w obrębie tygodnia, streak stoi na 4
        var snap = streakSnap(4);
        snap.historia = historia;
        var m = detect(snap);
        if (m) { fires++; historia = recordDelivered(historia, m); }
      }
      console.log('[13] streak-4 przez 4 "dni" → ogłoszony ' + fires + '×');
      check('dedup: spam codzienny → 1 ogłoszenie', fires === 1, fires);
    })();

    // ── DYSTANS-SKALA (suma całkowita vs miasta, start zawodnika) ────────────────
    (function () {
      var base = { today: TODAY, pbs: {}, newLog: { logged_at: dateInWeek(0), distance_km: 5, duration_s: 1500 }, logs: [], start_miasto: 'siedleczek' };
      var pod = Object.assign({}, base, { suma_calkowita_km: 20 });        // <31 (Poznań)
      console.log('[14] dystans <próg →', JSON.stringify(detect(pod)));
      check('dystans poniżej najbliższego miasta → null', detect(pod) === null, detect(pod));

      var drez = Object.assign({}, base, { suma_calkowita_km: 300 });      // >Drezno~277, <Praga~311
      var md = detect(drez);
      console.log('[15] dystans 300km →', JSON.stringify(md));
      check('dystans 300km → Drezno', md && md.type === 'dystans' && md.evidence.miasto === 'Drezno', md);
      check('dystans 300km: km prosta ≈277', md && Math.abs(md.evidence.dystans_miasta - 277) <= 1, md);
      check('dystans: suma_km POZA evidence', md && md.suma_km === 300 && md.evidence.suma_km === undefined, md);
      check('dystans: start znormalizowany (siedleczek→Siedleczek)', md && md.evidence.start === 'Siedleczek', md);

      var h = recordDelivered([], md);                                     // Drezno dostarczone
      check('dystans dedup: to samo miasto → null', detect(Object.assign({}, drez, { historia: h })) === null, true);

      var mosk = Object.assign({}, base, { suma_calkowita_km: 1500, historia: h }); // >Warszawa~1449 (wschód!)
      var mw = detect(mosk);
      console.log('[17] dystans 1500km (po Londynie, wschód) →', JSON.stringify(mw));
      check('dystans 1500km → Warszawa (E)', mw && mw.evidence.miasto === 'Warszawa' && mw.evidence.kierunek === 'E', mw);
      check('dystans Warszawa: km prosta ≈254 (nie próg)', mw && Math.abs(mw.evidence.dystans_miasta - 254) <= 1, mw);
      check('dystans Warszawa: poprzednie=Londyn', mw && mw.evidence.poprzednie_miasto === 'Londyn', mw);

      // start = null gdy brak city
      var bn = Object.assign({}, base, { suma_calkowita_km: 300, start_miasto: null });
      check('dystans: brak city → start=null', detect(bn) && detect(bn).evidence.start === null, detect(bn));

      // _normalizeCity
      check('normalizeCity: ŚRODA WIELKOPOLSKA → Środa Wielkopolska', SilnikMomentu._normalizeCity('ŚRODA WIELKOPOLSKA') === 'Środa Wielkopolska', SilnikMomentu._normalizeCity('ŚRODA WIELKOPOLSKA'));
      check('normalizeCity: biała-podlaska → Biała-Podlaska', SilnikMomentu._normalizeCity('biała-podlaska') === 'Biała-Podlaska', SilnikMomentu._normalizeCity('biała-podlaska'));
      check('normalizeCity: pusty → null', SilnikMomentu._normalizeCity('   ') === null, SilnikMomentu._normalizeCity('   '));
    })();

    console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  (' + pass + ' ok, ' + fail + ' fail)');
    if (typeof process !== 'undefined') process.exit(fail === 0 ? 0 : 1);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
