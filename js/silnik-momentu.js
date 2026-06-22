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

  // DYSTANS-SKALA: PODRÓŻ DOOKOŁA ŚWIATA wzdłuż jednej trasy (Europa→Bliski Wschód→Azja→Ameryki→Afryka).
  // prog miasta = kumulatywna DROGA WZDŁUŻ TRASY od domu (suma odcinków miasto→miasto), liczona LIVE.
  // Tylko 1. odcinek (Dom→Poznań) zależy od domu (_startPoint); reszta to miasto→miasto (stałe).
  // suma ROCZNA zawodnika (od 1 stycznia) vs prog → "dotarłbyś do {miasto} jadąc przez świat". Zawsze naprzód.
  var DYSTANS_SRODA = { lat: 52.2287, lon: 17.2799 };  // geo-pivot (dom domyślny; patrz _startPoint, hak B)
  var DYSTANS_CELE = [
    { miasto: 'Poznań',        kontynent: 'Europa',        lat: 52.4064, lon: 16.9252 },
    { miasto: 'Berlin',        kontynent: 'Europa',        lat: 52.5200, lon: 13.4050 },
    { miasto: 'Amsterdam',     kontynent: 'Europa',        lat: 52.3676, lon: 4.9041  },
    { miasto: 'Paryż',         kontynent: 'Europa',        lat: 48.8566, lon: 2.3522  },
    { miasto: 'Madryt',        kontynent: 'Europa',        lat: 40.4168, lon: -3.7038 },
    { miasto: 'Lizbona',       kontynent: 'Europa',        lat: 38.7223, lon: -9.1393 },
    { miasto: 'Rzym',          kontynent: 'Europa',        lat: 41.9028, lon: 12.4964 },
    { miasto: 'Ateny',         kontynent: 'Europa',        lat: 37.9838, lon: 23.7275 },
    { miasto: 'Stambuł',       kontynent: 'Bliski Wschód', lat: 41.0082, lon: 28.9784 },
    { miasto: 'Ankara',        kontynent: 'Bliski Wschód', lat: 39.9334, lon: 32.8597 },
    { miasto: 'Teheran',       kontynent: 'Bliski Wschód', lat: 35.6892, lon: 51.3890 },
    { miasto: 'Dubaj',         kontynent: 'Bliski Wschód', lat: 25.2048, lon: 55.2708 },
    { miasto: 'Karaczi',       kontynent: 'Azja',          lat: 24.8607, lon: 67.0011 },
    { miasto: 'Delhi',         kontynent: 'Azja',          lat: 28.6139, lon: 77.2090 },
    { miasto: 'Katmandu',      kontynent: 'Azja',          lat: 27.7172, lon: 85.3240 },
    { miasto: 'Dhaka',         kontynent: 'Azja',          lat: 23.8103, lon: 90.4125 },
    { miasto: 'Bangkok',       kontynent: 'Azja',          lat: 13.7563, lon: 100.5018 },
    { miasto: 'Hanoi',         kontynent: 'Azja',          lat: 21.0285, lon: 105.8542 },
    { miasto: 'Pekin',         kontynent: 'Azja',          lat: 39.9042, lon: 116.4074 },
    { miasto: 'Seul',          kontynent: 'Azja',          lat: 37.5665, lon: 126.9780 },
    { miasto: 'Tokio',         kontynent: 'Azja',          lat: 35.6762, lon: 139.6503 },
    { miasto: 'Vancouver',     kontynent: 'Ameryka Pn',    lat: 49.2827, lon: -123.1207 },
    { miasto: 'San Francisco', kontynent: 'Ameryka Pn',    lat: 37.7749, lon: -122.4194 },
    { miasto: 'Meksyk',        kontynent: 'Ameryka Pn',    lat: 19.4326, lon: -99.1332 },
    { miasto: 'Bogota',        kontynent: 'Ameryka Pd',    lat: 4.7110,  lon: -74.0721 },
    { miasto: 'Lima',          kontynent: 'Ameryka Pd',    lat: -12.0464,lon: -77.0428 },
    { miasto: 'Buenos Aires',  kontynent: 'Ameryka Pd',    lat: -34.6037,lon: -58.3816 },
    { miasto: 'Kapsztad',      kontynent: 'Afryka',        lat: -33.9249,lon: 18.4241 },
    { miasto: 'Nairobi',       kontynent: 'Afryka',        lat: -1.2921, lon: 36.8219 },
    { miasto: 'Kair',          kontynent: 'Afryka',        lat: 30.0444, lon: 31.2357 },
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

  // DYSTANS-SKALA: roczna suma biegowych km (snap.suma_roczna_km) przekroczyła kumulatywny prog miasta na trasie?
  // Zwraca NAJDALSZE osiągnięte miasto. Dedup po MIEŚCIE+ROKU (evidence z rok) → każde miasto raz w roku, reset 1 stycznia.
  function detectDystans(snap) {
    var suma = snap.suma_roczna_km;
    if (suma == null || !(suma > 0)) return null;
    var sp = _startPoint(snap.start_miasto);            // {nazwa, lat, lon} — jedyne wejście o starcie (hak B)
    // prog = kumulatywna droga wzdłuż trasy (1. odcinek dom→Poznań, dalej miasto→miasto). Zawsze rosnąca.
    var reached = null, reachedProg = 0, prev = null, cum = 0, prevPt = sp;
    for (var i = 0; i < DYSTANS_CELE.length; i++) {
      var c = DYSTANS_CELE[i];
      cum += haversineKm(prevPt, c);                    // odcinek poprzedni→c
      prevPt = c;
      if (suma >= cum) { prev = reached; reached = c; reachedProg = cum; } else break;
    }
    if (!reached) return null;                          // jeszcze nie dobiegł do 1. miasta na trasie
    return {
      type: 'dystans',
      // evidence = TOŻSAMOŚĆ (miasto + ROK) → dedup per-rok (sameMoment po JSON). żywa suma_km POZA evidence.
      evidence: { miasto: reached.miasto, dystans_miasta: Math.round(reachedProg), kontynent: reached.kontynent,
                  poprzednie_miasto: prev ? prev.miasto : (sp.nazwa || null), start: sp.nazwa, rok: snap.rok || null },
      suma_km: Math.round(suma * 10) / 10,
      confidence: 1,
    };
  }

  // TOP 5 TYGODNI: bieżący tydzień (tydzień newLog) wszedł do top 5 najmocniejszych w CAŁEJ historii?
  // ALL-TIME (NIE roczne) → tożsamość = weekKey (globalnie unikalny), BEZ rok w evidence (vs dystans, który JEST roczny).
  // Liczone TYLKO z tygodni Z BIEGANIEM (km>0): zerowe tygodnie nie liczą ani do rankingu, ani do progu MIN.
  var TOP5_MIN_TYGODNI = 12;   // ≥12 tygodni z bieganiem zanim "top 5" ma sens
  function detectTop5Tygodni(snap) {
    var logs = snap.logs_all || [];
    var weekly = {};                                   // sumy km per tydzień — tylko km>0
    for (var i = 0; i < logs.length; i++) {
      var lg = logs[i];
      if (!lg || !lg.logged_at) continue;
      var km = num(lg.distance_km);
      if (km <= 0) continue;                            // zerowe/bezdystansowe pomijamy
      var k = weekKey(lg.logged_at);
      weekly[k] = (weekly[k] || 0) + km;
    }
    var klucze = [];
    for (var key in weekly) if (weekly.hasOwnProperty(key)) klucze.push(key);
    if (klucze.length < TOP5_MIN_TYGODNI) return null;  // za mało tygodni z bieganiem

    if (!snap.newLog || !snap.newLog.logged_at) return null;
    var curWeek = weekKey(snap.newLog.logged_at);
    var curKm = weekly[curWeek] || 0;
    if (!(curKm > 0)) return null;                      // newLog w tygodniu bez biegania

    var rank = 1;                                       // 1 + liczba tygodni ŚCIŚLE mocniejszych (tie nie spycha)
    for (var j = 0; j < klucze.length; j++) if (weekly[klucze[j]] > curKm) rank++;
    if (rank === 1) return null;                        // all-time max → robota A (detectVolume)
    if (rank > 5) return null;

    var ranking = klucze.map(function (kk) { return { wk: +kk, km: weekly[kk] }; })
      .sort(function (a, b) { return (b.km - a.km) || (a.wk === curWeek ? -1 : b.wk === curWeek ? 1 : 0); }) // tie → bieżący wyżej
      .slice(0, 5)
      .map(function (e) { return { label: weekLabel(e.wk), km: Math.round(e.km * 100) / 100, current: e.wk === curWeek }; });

    return {
      type: 'top5',
      evidence: { tydzien: curWeek, label: weekLabel(curWeek) }, // tożsamość = weekKey (all-time unikalny), BEZ rok
      pozycja: rank,                                    // POZA evidence (zmienna — wspinaczka nie re-odpala)
      km: Math.round(curKm * 100) / 100,                // POZA evidence
      ranking: ranking,                                 // POZA evidence (do animacji)
      confidence: 1,
    };
  }

  // NAJDŁUŻSZY BIEG: newLog = ściśle najdłuższy pojedynczy bieg w historii (twardy rekord, ALL-TIME).
  // NIE wolumen (tygodniowy) ani PB (czas) — pojedynczy max dystansu. Debiut = cisza (jak PB).
  // Tylko biegi (lg.is_run !== false; flagę ustawia buildSnapshot przez isRunType). Margines anty-szum GPS.
  var NAJDL_MIN_DELTA = 0.3;   // km — rekord musi pobić poprzedni o ≥300 m (nie „o 20 m")
  function detectNajdluzszyBieg(snap) {
    var nl = snap.newLog;
    if (!nl || nl.is_run === false) return null;       // brak newLog lub newLog nie jest biegiem
    var nlKm = num(nl.distance_km);
    if (!(nlKm > 0)) return null;
    var logs = snap.logs_all || [];
    var prevMax = 0, skipped = false;
    for (var i = 0; i < logs.length; i++) {
      var lg = logs[i];
      if (!lg || lg.is_run === false) continue;        // tylko biegi
      var d = num(lg.distance_km);
      if (!(d > 0)) continue;
      if (!skipped && lg.logged_at === nl.logged_at && d === nlKm) { skipped = true; continue; } // pomiń sam newLog raz
      if (d > prevMax) prevMax = d;
    }
    if (!(prevMax > 0)) return null;                   // brak wcześniejszego biegu → debiut = cisza
    if (!(nlKm > prevMax + NAJDL_MIN_DELTA)) return null; // tie / w granicach szumu → nie rekord
    return {
      type: 'najdluzszy',
      evidence: { dystans: Math.round(nlKm * 100) / 100, poprzedni_najdluzszy: Math.round(prevMax * 100) / 100 },
      confidence: 1,                                    // ALL-TIME, BEZ rok (rekord życiowy jak PB/top5)
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
  var PRIORITY_SCORE = { pb: 3, najdluzszy: 2.7, dystans: 2.5, wolumen: 2, top5: 1.5, streak: 1 }; // najdluzszy=rekord życiowy tuż pod PB; dystans=geo; top5 pod wolumenem; streak najniżej
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
    var candidates = [detectPB(snapshot), detectVolume(snapshot), detectStreak(snapshot), detectDystans(snapshot), detectTop5Tygodni(snapshot), detectNajdluzszyBieg(snapshot)].filter(Boolean);
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
    _detectTop5Tygodni: detectTop5Tygodni,
    _detectNajdluzszyBieg: detectNajdluzszyBieg,
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
    _thresholds: { PB_MIN_PCT: PB_MIN_PCT, PB_MIN_SEC: PB_MIN_SEC, VOL_MIN_WINDOWS: VOL_MIN_WINDOWS, STREAK_MIN: STREAK_MIN, TOP5_MIN_TYGODNI: TOP5_MIN_TYGODNI, NAJDL_MIN_DELTA: NAJDL_MIN_DELTA },
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

    // ── DYSTANS-SKALA (suma ROCZNA vs trasa dookoła świata, dedup per-rok) ───────
    (function () {
      var base = { today: TODAY, pbs: {}, newLog: { logged_at: dateInWeek(0), distance_km: 5, duration_s: 1500 }, logs: [], start_miasto: 'siedleczek', rok: 2026 };
      var pod = Object.assign({}, base, { suma_roczna_km: 20 });           // <Poznań ~31
      console.log('[14] dystans <próg →', JSON.stringify(detect(pod)));
      check('dystans poniżej 1. miasta → null', detect(pod) === null, detect(pod));

      var berl = Object.assign({}, base, { suma_roczna_km: 300 });         // ≥Berlin ~270, <Amsterdam ~846
      var mb = detect(berl);
      console.log('[15] dystans 300km →', JSON.stringify(mb));
      check('dystans 300km → Berlin', mb && mb.type === 'dystans' && mb.evidence.miasto === 'Berlin', mb);
      check('dystans 300km: prog ≈270 (droga trasy)', mb && Math.abs(mb.evidence.dystans_miasta - 270) <= 2, mb);
      check('dystans: kontynent=Europa, bez kierunku', mb && mb.evidence.kontynent === 'Europa' && mb.evidence.kierunek === undefined, mb);
      check('dystans: rok w evidence', mb && mb.evidence.rok === 2026, mb);
      check('dystans: suma_km POZA evidence', mb && mb.suma_km === 300 && mb.evidence.suma_km === undefined, mb);
      check('dystans: start znormalizowany (siedleczek→Siedleczek)', mb && mb.evidence.start === 'Siedleczek', mb);
      check('dystans: poprzednie=Poznań', mb && mb.evidence.poprzednie_miasto === 'Poznań', mb);

      var h = recordDelivered([], mb);                                     // Berlin{rok:2026} dostarczony
      check('dystans dedup TEN SAM ROK → null', detect(Object.assign({}, berl, { historia: h })) === null, true);

      // ⚠️ KLUCZOWY: ta sama suma, INNY ROK → Berlin znów odpala (dowód per-rok dedup)
      var berl27 = Object.assign({}, base, { suma_roczna_km: 300, rok: 2027, historia: h });
      var mb27 = detect(berl27);
      console.log('[16] dystans Berlin NOWY ROK →', JSON.stringify(mb27));
      check('dystans PER-ROK: nowy rok → Berlin znów odpala', mb27 && mb27.evidence.miasto === 'Berlin' && mb27.evidence.rok === 2027, mb27);

      var ams = Object.assign({}, base, { suma_roczna_km: 1000 });         // ≥Amsterdam ~846, <Paryż ~1276
      var ma = detect(ams);
      console.log('[17] dystans 1000km → kolejne miasto →', JSON.stringify(ma));
      check('dystans 1000km → Amsterdam (dalej na trasie)', ma && ma.evidence.miasto === 'Amsterdam', ma);

      // start = null gdy brak city
      var bn = Object.assign({}, base, { suma_roczna_km: 300, start_miasto: null });
      check('dystans: brak city → start=null', detect(bn) && detect(bn).evidence.start === null, detect(bn));

      // _normalizeCity
      check('normalizeCity: ŚRODA WIELKOPOLSKA → Środa Wielkopolska', SilnikMomentu._normalizeCity('ŚRODA WIELKOPOLSKA') === 'Środa Wielkopolska', SilnikMomentu._normalizeCity('ŚRODA WIELKOPOLSKA'));
      check('normalizeCity: biała-podlaska → Biała-Podlaska', SilnikMomentu._normalizeCity('biała-podlaska') === 'Biała-Podlaska', SilnikMomentu._normalizeCity('biała-podlaska'));
      check('normalizeCity: pusty → null', SilnikMomentu._normalizeCity('   ') === null, SilnikMomentu._normalizeCity('   '));
    })();

    // ── TOP 5 TYGODNI (all-time ranking, próg z tygodni z bieganiem) ────────────
    (function () {
      // snap z logs_all: 1 log/tydzień; curKm = tydzień 0; pastKms = tygodnie 1..n; zeros = tygodnie 0-km
      function top5Snap(curKm, pastKms, zeros, historia) {
        var logs = [];
        if (curKm > 0) logs.push({ logged_at: dateInWeek(0), distance_km: curKm, duration_s: 3600 });
        pastKms.forEach(function (km, i) { logs.push({ logged_at: dateInWeek(i + 1), distance_km: km, duration_s: 3600 }); });
        (zeros || []).forEach(function (w) { logs.push({ logged_at: dateInWeek(w), distance_km: 0, duration_s: 3600 }); });
        return { today: TODAY, pbs: {}, newLog: { logged_at: dateInWeek(0), distance_km: curKm, duration_s: 3600 },
                 logs: [], logs_all: logs, historia: historia || [] };
      }
      function small(n, start) { var a = []; for (var i = 0; i < n; i++) a.push((start || 30) - i); return a; } // malejące <40

      // [18] <12 tygodni z bieganiem → null (10 past + current = 11)
      check('top5 <12 tyg → null', detect(top5Snap(20, small(10))) === null, detect(top5Snap(20, small(10))));

      // [19] rank 1 (all-time max) → detektor top5 null (robota A). (detect() łączy detektory — 100km tu odpala najdluzszy, słusznie — więc izolujemy detektor top5)
      var t1 = top5Snap(100, small(12));   // 12 past <40 + current 100 = max
      check('top5 rank1 (max) → null (A)', SilnikMomentu._detectTop5Tygodni(t1) === null, SilnikMomentu._detectTop5Tygodni(t1));

      // [20] rank 3 → moment B (2 tygodnie mocniejsze: 60,55)
      var t3 = top5Snap(50, [60, 55].concat(small(11)));   // 13 past + current = 14 distinct
      var m3 = detect(t3);
      console.log('[20] top5 rank3 →', JSON.stringify(m3 && { type: m3.type, pozycja: m3.pozycja, km: m3.km, tydzien: m3.evidence.tydzien }));
      check('top5 rank3 → moment B', m3 && m3.type === 'top5' && m3.pozycja === 3, m3);
      check('top5: evidence.tydzien = weekKey(curWeek), bez rok', m3 && m3.evidence.tydzien === SilnikMomentu._weekKey(dateInWeek(0)) && m3.evidence.rok === undefined, m3);
      check('top5: ranking 5, bieżący oznaczony', m3 && m3.ranking.length === 5 && m3.ranking.some(function (r) { return r.current; }), m3);
      check('top5: pozycja/km/ranking POZA evidence', m3 && m3.evidence.pozycja === undefined && m3.evidence.km === undefined, m3);

      // [21] dedup: ten sam tydzień → null
      var h = recordDelivered([], m3);
      check('top5 dedup: ten sam tydzień → null', detect(top5Snap(50, [60, 55].concat(small(11)), null, h)) === null, true);

      // [22] rank 6 → null (5 tygodni mocniejszych)
      var t6 = top5Snap(50, [60, 59, 58, 57, 56].concat(small(8)));  // 13 past + current = 14, 5 powyżej
      check('top5 rank6 → null', detect(t6) === null, detect(t6));

      // [23] ⚠️ zerowe tygodnie NIE liczą do progu: 11 z bieganiem + 5 zerowych = 16 kalendarzowych, ale 11<12 → null
      // (curKm=50 z jednym tyg 60 → bez progu byłby rank2; dowód że to PRÓG blokuje, nie rank)
      var tz = top5Snap(50, [60].concat(small(9)), [12, 13, 14, 15, 16]);  // 10 past + current = 11 z bieganiem
      check('top5: zera NIE liczą (11<12 mimo 16 kalendarzowych) → null', detect(tz) === null, detect(tz));

      // [24] rank 4 → fires (inny układ, 3 mocniejsze)
      var t4 = top5Snap(50, [60, 55, 53].concat(small(10)));
      var m4 = detect(t4);
      check('top5 rank4 → moment B (pozycja 4)', m4 && m4.type === 'top5' && m4.pozycja === 4, m4);
    })();

    // ── NAJDŁUŻSZY BIEG (pojedynczy max dystansu, all-time) ──────────────────────
    (function () {
      // logs_all = wcześniejsze biegi (priorKms) + newLog (nlKm) na końcu; extra = dodatkowe logi
      function najdlSnap(nlKm, priorKms, extra, nlIsRun, historia) {
        var logs = [];
        priorKms.forEach(function (km, i) { logs.push({ logged_at: dateInWeek(i + 1), distance_km: km, duration_s: 3600 }); });
        var nl = { logged_at: dateInWeek(0), distance_km: nlKm, duration_s: 3600 };
        if (nlIsRun === false) nl.is_run = false;
        logs.push(nl);
        (extra || []).forEach(function (e) { logs.push(e); });
        return { today: TODAY, pbs: {}, newLog: nl, logs: [], logs_all: logs, historia: historia || [] };
      }

      // [25] debiut (brak wcześniejszych biegów) → null
      check('najdłuższy: debiut → null', detect(najdlSnap(10, [])) === null, detect(najdlSnap(10, [])));

      // [26] rekord: 16 km > poprzedni max 14 (+margines) → moment
      var mr = detect(najdlSnap(16, [14, 12, 8, 10]));
      console.log('[26] najdłuższy 16km →', JSON.stringify(mr));
      check('najdłuższy: 16>14 → moment', mr && mr.type === 'najdluzszy', mr);
      check('najdłuższy: evidence dystans=16, poprzedni=14', mr && mr.evidence.dystans === 16 && mr.evidence.poprzedni_najdluzszy === 14, mr);
      check('najdłuższy: ALL-TIME (bez rok w evidence)', mr && mr.evidence.rok === undefined, mr);

      // [27] remis: 14 == poprzedni max 14 → null
      check('najdłuższy: remis (14==14) → null', detect(najdlSnap(14, [14, 12])) === null, detect(najdlSnap(14, [14, 12])));

      // [28] w granicach szumu: 14.2 vs 14 (Δ0.2 < 0.3) → null
      check('najdłuższy: +0.2km < margines → null', detect(najdlSnap(14.2, [14, 10])) === null, detect(najdlSnap(14.2, [14, 10])));

      // [29] krótszy po rekordzie: 10 < poprzedni max 16 → null
      check('najdłuższy: krótszy → null', detect(najdlSnap(10, [16, 14])) === null, detect(najdlSnap(10, [16, 14])));

      // [30] ⚠️ substytut (rower is_run:false 50km) NIE liczy: bieg 16 > biegowy max 14 → fires, rower ignorowany
      var mb = detect(najdlSnap(16, [14, 12], [{ logged_at: dateInWeek(5), distance_km: 50, duration_s: 7200, is_run: false }]));
      check('najdłuższy: rower 50km ignorowany → bieg 16 fires', mb && mb.type === 'najdluzszy' && mb.evidence.dystans === 16, mb);

      // [31] newLog jest rowerem (is_run:false) → null
      check('najdłuższy: newLog=rower → null', detect(najdlSnap(40, [14, 12], null, false)) === null, detect(najdlSnap(40, [14, 12], null, false)));

      // [32] dedup: ten sam rekord → null; nowy dłuższy → fires
      var hh = recordDelivered([], mr);
      check('najdłuższy dedup: ten sam rekord → null', detect(najdlSnap(16, [14, 12], null, true, hh)) === null, true);
      check('najdłuższy: nowy dłuższy (18) → fires', detect(najdlSnap(18, [16, 14], null, true, hh)) && detect(najdlSnap(18, [16, 14], null, true, hh)).evidence.dystans === 18, true);
    })();

    console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  (' + pass + ' ok, ' + fail + ' fail)');
    if (typeof process !== 'undefined') process.exit(fail === 0 ? 0 : 1);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
