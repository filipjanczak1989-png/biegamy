// @ts-nocheck
// EF detect-moment — server-side detekcja momentów (KM6 bramka). Generowany przez tools/build-ef.js (NIE edytuj build/; edytuj ten template + js/silnik-momentu.js).
// Deploy: Dashboard. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto). Wołany przez DB trigger (pg_net) z Authorization: Bearer <service_role> (mirror trigger_send_push).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ===== INLINE silnik-momentu.js (NIE edytuj tu — edytuj js/silnik-momentu.js + rebuild) =====
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

  // RUN_TYPES — kopia 1:1 z sb.js:622 window.RUN_TYPES (źródło dla EF snapshot-buildera; NIE używane przez detektory,
  // które czytają snapshot.is_run). ⚠️ Dodanie typu biegowego → tu ORAZ w sb.js (reguła sync). Wystawione: SM.RUN_TYPES/SM.isRunType.
  var RUN_TYPES = ['spokojny', 'bieg spokojny', 'wybieganie', 'długi', 'tempo', 'progresja', 'interwały', 'start', 'wyścig', 'regeneracja'];
  function isRunType(t) { return RUN_TYPES.indexOf((t == null ? '' : String(t)).toLowerCase().trim()) !== -1; }

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

  // WOLUMEN: tydzień newLog = STRICT max w historii 90 dni?
  //
  // OKNO MIESIĘCZNE USUNIĘTE (2026-08-07). Powody z pomiaru, nie z przeczucia:
  // miesiąc bieżący jest niepełny i porównywał się ścisłym `>` z miesiącami pełnymi,
  // więc realnie mógł odpalić tylko w ostatnich dniach miesiąca — i NIE ODPALIŁ ANI RAZU
  // przez cały czas działania silnika (12 momentów `wolumen` w bazie, wszystkie tygodniowe).
  // Do tego horyzont 90 dni znaczył, że „rekord miesiąca" był rekordem z czterech.
  // Karta `miesiac` go nie potrzebuje: ma własny wyzwalacz (cron) i jest podsumowaniem,
  // nie rekordem. Martwy kod udający funkcję — stąd usunięcie, nie naprawa.
  function detectVolume(snap) {
    var logs = snap.logs || [];
    var nl = snap.newLog;
    if (!nl) return null;

    var sums = {};
    for (var i = 0; i < logs.length; i++) {
      var lg = logs[i];
      if (!lg || !lg.logged_at) continue;
      // TYLKO BIEGI. Komentarz obiecywał to od początku, kod nie sprawdzał — przez co
      // 300 km wpisane na treningu wzmacniającym zrobiło „rekord tygodnia 305 km",
      // a jeden zawodnik dostał zatwierdzony TOP 5 za 14 km biegania i 73 km reszty.
      if (lg.is_run === false) continue;
      var km = num(lg.distance_km);
      if (km <= 0) continue;
      var k = weekKey(lg.logged_at);
      sums[k] = (sums[k] || 0) + km;
    }

    var nlKey = weekKey(nl.logged_at);
    var nlSum = sums[nlKey];
    if (!(nlSum > 0)) return null;

    var others = 0, prevMax = 0;
    for (var key in sums) {
      if (key === String(nlKey)) continue;
      others++;
      if (sums[key] > prevMax) prevMax = sums[key];
    }
    if (others < VOL_MIN_WINDOWS) return null;   // za mało historii do orzeczenia „max"
    if (!(nlSum > prevMax)) return null;         // remis = NULL (musi być strict)

    var margin = prevMax > 0 ? (nlSum - prevMax) / prevMax : 1;
    var slupki = [];
    for (var bw = nlKey - 5; bw <= nlKey; bw++) {
      slupki.push({ label: weekLabel(bw), km: Math.round((sums[bw] || 0) * 100) / 100, peak: bw === nlKey });
    }

    // EVIDENCE = SAM IDENTYFIKATOR OKRESU. Wszystko, co rośnie w trakcie tygodnia
    // (suma, słupki), idzie do payloadu — bo evidence jest KLUCZEM DEDUPU, a klucz
    // zmienny znaczy nowy moment przy każdym logu. Dowód z bazy: pięć momentów jednego
    // tygodnia u Martyny (74,39 → 79,39 → 84,39 → 89,39 → 110,01 km).
    // Ten sam wzorzec co `top5` i `dystans`, które tę lekcję mają już odrobioną.
    //
    // BEZ POLA `okno`: po usunięciu miesiąca byłoby stałą, a stała w kluczu dedupu to szum,
    // który każdy czytający musi sprawdzić. Gdyby rekord miesięczny wrócił, należy mu się
    // WŁASNY TYP — inna narracja, inna animacja, inna karta — a nie pole rozróżniające.
    return {
      type: 'wolumen',
      evidence: { tydzien: nlKey },
      suma_km: Math.round(nlSum * 100) / 100,           // ↓ wszystko poniżej ląduje w payload
      poprzednie_max: Math.round(prevMax * 100) / 100,
      slupki: slupki,
      confidence: clamp01(margin / 0.25),               // 25% nad poprzednim maxem = pełna pewność
    };
  }

  // STREAK: ile tygodni z rzędu (do tygodnia `today`) z ≥1 logiem?
  function detectStreak(snap) {
    var logs = snap.logs || [];
    if (!snap.today) return null;
    var present = {};
    for (var i = 0; i < logs.length; i++) {
      if (logs[i] && logs[i].logged_at) present[weekKey(logs[i].logged_at)] = true;
    }
    var odp = snap.planowy_odpoczynek || {};        // {weekKey:true} planowy odpoczynek (tydzień planu BEZ biegów) — MOSTKUJE serię; pusty w browser/debug = stare zachowanie
    var cur = weekKey(snap.today);
    var weeks = 0;
    while (present[cur] || odp[cur]) { if (present[cur]) weeks++; cur--; }   // rest mostkuje (cur--) ale NIE liczy (weeks++ tylko gdy bieg); brak obu = stop
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
      if (lg.is_run === false) continue;   // TOP 5 liczy tygodnie BIEGOWE — patrz detectVolume
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

  // ── KAMIEŃ MILOWY: progi narastające (km / godziny / pierwszy raz) ──────────
  // Rzadkość jest funkcją, nie efektem ubocznym: progi rosną geometrycznie, a oś jest
  // WSPÓLNA z drabiną odznak (500/1000/2000/5000) — dwie skale na jednej osi zawsze się
  // rozjadą. Progi liczone WYŁĄCZNIE z biegów; karta opisuje drogę wszystkimi
  // aktywnościami („AKTYWNOŚCI 135"), ale próg przekracza się bieganiem.
  var KAMIEN_KM = [500, 1000, 2000, 5000];
  var KAMIEN_GODZINY = [100, 250, 500, 1000];
  // „Pierwszy raz" to PRZEDZIAŁ, nie próg od dołu.
  // Dół BEZ tolerancji: bieg musi mieć pełny dystans. GPS na certyfikowanej trasie mierzy
  // raczej za dużo niż za mało, więc próg ścisły nie gubi prawdziwych startów, a chroni
  // przed ogłoszeniem półmaratonu po 20,9 km treningu.
  // Góra jest równie ważna i wyszła dopiero z self-testu: bieg na 30 km POKONUJE dystans
  // półmaratonu, ale nim NIE JEST. Bez górnej granicy karta mówiłaby „PIERWSZY PÓŁMARATON"
  // nad bohaterem „30,0 KM" — a długi bieg ma już swój własny typ (`najdluzszy`).
  // +2 km zapasu mieści realny rozjazd GPS na starcie (21,1–21,6 na certyfikowanej trasie).
  // Kolejność OD NAJWYŻSZEGO: pierwszy maraton jest zarazem pierwszym półmaratonem —
  // ogłaszamy maraton, półmaraton przepada świadomie.
  // Świeżość dotyczy WYŁĄCZNIE „pierwszego razu" (decyzja Filipa 6/8): paczka z zegarka
  // potrafi zakończyć się maratonem sprzed lat i ogłoszenie go dziś wygląda jak pomyłka,
  // choć formalnie jest prawdą. Progów narastających to NIE dotyczy — tam liczy się
  // przejście przez granicę, a granicę przechodzi się raz, niezależnie od daty logu.
  var KAMIEN_PIERWSZY_MAX_DNI = 30;

  var KAMIEN_PIERWSZY = [
    { prog: 'marathon', km: 42.195, gora: 44.2 },
    { prog: 'half', km: 21.0975, gora: 23.1 },
  ];

  // Najwyższy próg, przez który PRZECHODZIMY tym logiem (przed < próg <= po).
  function przekroczonyProg(progi, przed, po) {
    var trafiony = null;
    for (var i = 0; i < progi.length; i++) if (przed < progi[i] && po >= progi[i]) trafiony = progi[i];
    return trafiony;
  }

  function detectKamien(snap) {
    var nl = snap.newLog;
    if (!nl) return null;
    var logs = snap.logs_all || [];
    var nlKm = num(nl.distance_km);

    // ⚠️ snap.dzis to REALNA dzisiejsza data — NIE snap.today, który w EF jest zawsze datą
    // samego newLoga (`today = newLog.logged_at.slice(0,10)`), więc do liczenia wieku logu
    // byłby bezużyteczny (zawsze zero dni). Brak `dzis` = brak bramki (wstecznie zgodne).
    var swiezy = true;
    if (snap.dzis && nl.logged_at) {
      swiezy = (dayIndex(snap.dzis) - dayIndex(nl.logged_at)) <= KAMIEN_PIERWSZY_MAX_DNI;
    }

    // 1) PIERWSZY RAZ — czy TEN bieg jest najwcześniejszym, który pokonał dystans?
    if (swiezy && nl.is_run !== false && nlKm > 0) {
      for (var pi = 0; pi < KAMIEN_PIERWSZY.length; pi++) {
        var kat = KAMIEN_PIERWSZY[pi];
        if (nlKm < kat.km || nlKm >= kat.gora) continue;
        var bylWczesniej = false;
        for (var i = 0; i < logs.length; i++) {
          var lg = logs[i];
          if (!lg || lg.is_run === false) continue;
          var d = num(lg.distance_km);
          if (d < kat.km || d >= kat.gora) continue;      // ten sam przedział, nie „cokolwiek dłuższego"
          if (String(lg.logged_at) < String(nl.logged_at)) { bylWczesniej = true; break; }
        }
        if (bylWczesniej) continue;                    // ktoś już to przebiegł → to nie „pierwszy"
        return {
          type: 'kamien',
          // dystans_km RZECZYWISTY (nie kanoniczny) — to jego liczba na karcie. Zaokrąglony
          // do 2 miejsc, bo evidence jest kluczem dedupu i musi być odporne na szum
          // zmiennoprzecinkowy: 21.400000000000002 dałoby inny JSON niż 21.4.
          evidence: { kategoria: 'pierwszy', prog: kat.prog, dystans_km: Math.round(nlKm * 100) / 100 },
          confidence: 1,
        };
      }
    }

    // 2) PRÓG NARASTAJĄCY — liczy się PRZEJŚCIE przez granicę, nigdy sam stan.
    // Dzięki temu (a) nikt nie dostaje lawiny za progi minięte dawno temu, (b) powtórne
    // wywołanie detect na tej samej historii nie odpala niczego drugi raz — co ma
    // znaczenie, bo import z zegarka woła EF raz na paczkę, a nie raz na życie.
    var sumaKm = 0, sumaSek = 0;
    for (var j = 0; j < logs.length; j++) {
      var l = logs[j];
      if (!l || l.is_run === false) continue;
      sumaKm += num(l.distance_km);
      sumaSek += num(l.duration_s);
    }
    var wkladKm = nl.is_run === false ? 0 : nlKm;
    var wkladSek = nl.is_run === false ? 0 : num(nl.duration_s);

    var pk = przekroczonyProg(KAMIEN_KM, sumaKm - wkladKm, sumaKm);
    if (pk != null) return { type: 'kamien', evidence: { kategoria: 'km', prog: String(pk) }, confidence: 1 };

    var pg = przekroczonyProg(KAMIEN_GODZINY, (sumaSek - wkladSek) / 3600, sumaSek / 3600);
    if (pg != null) return { type: 'kamien', evidence: { kategoria: 'godziny', prog: String(pg) }, confidence: 1 };

    return null;
  }

  // ── AGE-GRADING WMA 2025 (Alan Jones, zatw. USATF; F→K) — dane ze źródła, zweryfikowane vs recon ──
  // AG% = AG_OPEN[g][dist] / (czas_sek * factor) * 100 ; factor=AG_FACTOR[g][dist][wiek-BASE], 1.0 dla open/braku wieku.
  var AG_OPEN = { M:{ '5k':769,'10k':1584,'half':3451,'marathon':7235 }, K:{ '5k':834,'10k':1726,'half':3772,'marathon':7796 } };
  var AG_FACTOR_BASE = 5;   // wiek startowy tablic factor[age-BASE]; 2025 WMA (Alan Jones), F=K
  var AG_F_M = { '5k':[0.608,0.6664,0.72,0.7688,0.8128,0.852,0.8864,0.916,0.9408,0.9608,0.976,0.9864,0.9944,0.9995,1,1,1,1,1,1,1,1,1,1,1,0.9999,0.9988,0.9965,0.993,0.9883,0.9824,0.9755,0.9685,0.9615,0.9545,0.9475,0.9405,0.9335,0.9265,0.9195,0.9125,0.9055,0.8985,0.8915,0.8845,0.8775,0.8705,0.8635,0.8565,0.8495,0.8425,0.8355,0.8285,0.8215,0.8145,0.8075,0.8005,0.7935,0.7865,0.7795,0.7725,0.7655,0.7585,0.7514,0.7436,0.7353,0.7264,0.7169,0.7068,0.696,0.6847,0.6728,0.6603,0.6472,0.6334,0.6191,0.6042,0.5887,0.5726,0.5558,0.5385,0.5206,0.5021,0.483,0.4632,0.4429,0.422,0.4005,0.3784,0.3556,0.3323,0.3084,0.2839,0.2588,0.233], '10k':[0.5073,0.5678,0.6243,0.6768,0.7253,0.7698,0.8103,0.8468,0.8793,0.9078,0.9323,0.9528,0.9693,0.9818,0.9903,0.9968,1,1,1,1,1,1,1,1,1,1,0.9996,0.9985,0.9967,0.9942,0.9909,0.9869,0.9822,0.9767,0.9705,0.9636,0.9561,0.9486,0.9411,0.9336,0.9261,0.9186,0.9111,0.9036,0.8961,0.8886,0.8811,0.8736,0.8661,0.8586,0.8511,0.8436,0.8361,0.8286,0.8211,0.8136,0.8061,0.7986,0.7911,0.7836,0.7761,0.7686,0.7611,0.7536,0.7461,0.7386,0.7308,0.7223,0.7131,0.7033,0.6928,0.6816,0.6697,0.6572,0.644,0.6301,0.6156,0.6004,0.5845,0.568,0.5508,0.5329,0.5143,0.4951,0.4752,0.4546,0.4334,0.4115,0.3889,0.3657,0.3418,0.3172,0.2919,0.266,0.2394], 'half':[0.4621,0.5364,0.605,0.6678,0.7248,0.7762,0.8218,0.8616,0.8957,0.9241,0.9467,0.9636,0.975,0.985,0.995,1,1,1,1,1,1,1,1,1,1,1,1,0.9996,0.9982,0.996,0.9928,0.9888,0.9839,0.9781,0.9714,0.9638,0.956,0.9483,0.9405,0.9327,0.9249,0.9171,0.9094,0.9016,0.8938,0.886,0.8782,0.8705,0.8627,0.8549,0.8471,0.8393,0.8316,0.8238,0.816,0.8082,0.8004,0.7927,0.7849,0.7771,0.7693,0.7615,0.7538,0.746,0.7382,0.7304,0.7223,0.7135,0.704,0.6938,0.683,0.6715,0.6593,0.6464,0.6328,0.6185,0.6036,0.588,0.5717,0.5547,0.537,0.5186,0.4996,0.4799,0.4595,0.4384,0.4167,0.3942,0.3711,0.3473,0.3228,0.2976,0.2718,0.2452,0.218], 'marathon':[0.4414,0.508,0.5702,0.6279,0.6812,0.7301,0.7745,0.8145,0.85,0.8811,0.9078,0.93,0.95,0.968,0.982,0.992,0.998,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0.9999,0.9979,0.9934,0.9865,0.9783,0.9701,0.9619,0.9537,0.9455,0.9373,0.9291,0.9209,0.9127,0.9045,0.8963,0.8881,0.8799,0.8717,0.8635,0.8553,0.8471,0.8389,0.8307,0.8225,0.8143,0.8061,0.7979,0.7897,0.7815,0.7733,0.7651,0.7569,0.7487,0.7405,0.7323,0.7241,0.7155,0.7063,0.6963,0.6857,0.6743,0.6623,0.6495,0.6361,0.6219,0.6071,0.5915,0.5753,0.5583,0.5407,0.5223,0.5033,0.4835,0.4631,0.4419,0.4201,0.3975,0.3743,0.3503,0.3257,0.3003,0.2743,0.2475,0.2201] };
  var AG_F_K = { '5k':[0.6903,0.7222,0.7527,0.7816,0.8091,0.8351,0.8596,0.8827,0.9042,0.9243,0.9433,0.9622,0.9811,0.9953,1,1,1,1,1,1,1,1,0.9997,0.999,0.9977,0.9959,0.9936,0.9908,0.9875,0.9836,0.9793,0.9744,0.9691,0.9632,0.9568,0.9499,0.9425,0.9346,0.9262,0.9172,0.9078,0.898,0.8883,0.8786,0.8689,0.8592,0.8495,0.8398,0.8301,0.8204,0.8107,0.8009,0.7912,0.7815,0.7718,0.7621,0.7524,0.7427,0.733,0.7233,0.7136,0.7038,0.6941,0.6844,0.6747,0.665,0.6553,0.6456,0.6359,0.6262,0.6165,0.6067,0.597,0.5868,0.5758,0.564,0.5515,0.5382,0.5242,0.5094,0.4938,0.4775,0.4604,0.4426,0.424,0.4046,0.3845,0.3636,0.3419,0.3195,0.2964,0.2725,0.2478,0.2223,0.1961], '10k':[0.685,0.7183,0.7498,0.7794,0.8072,0.8333,0.8574,0.8798,0.9004,0.9191,0.936,0.952,0.968,0.982,0.992,0.998,1,1,1,1,1,1,1,0.9998,0.9991,0.998,0.9964,0.9944,0.992,0.9891,0.9857,0.9819,0.9777,0.973,0.9679,0.9623,0.9563,0.9499,0.9429,0.9356,0.9278,0.9195,0.9109,0.9017,0.8921,0.8822,0.8723,0.8623,0.8524,0.8425,0.8325,0.8226,0.8126,0.8027,0.7928,0.7828,0.7729,0.7629,0.753,0.7431,0.7331,0.7232,0.7132,0.7033,0.6934,0.6834,0.6735,0.6635,0.6536,0.6437,0.6337,0.6234,0.6123,0.6005,0.5879,0.5745,0.5604,0.5455,0.5299,0.5135,0.4963,0.4784,0.4597,0.4403,0.4201,0.3991,0.3774,0.3549,0.3317,0.3077,0.2829,0.2574,0.2311,0.2041,0.1763], 'half':[0.608,0.6474,0.6847,0.72,0.7533,0.7845,0.8137,0.8408,0.8659,0.889,0.91,0.93,0.95,0.968,0.982,0.992,0.998,1,1,1,1,1,1,0.9998,0.9991,0.9979,0.9962,0.9941,0.9915,0.9884,0.9849,0.9809,0.9764,0.9714,0.966,0.9601,0.9537,0.9468,0.9395,0.9317,0.9234,0.9147,0.9055,0.8958,0.8856,0.8753,0.8649,0.8546,0.8442,0.8339,0.8235,0.8132,0.8028,0.7925,0.7821,0.7718,0.7614,0.7511,0.7407,0.7304,0.72,0.7097,0.6993,0.689,0.6786,0.6683,0.6579,0.6476,0.6372,0.6269,0.6165,0.6059,0.5945,0.5822,0.5692,0.5554,0.5407,0.5253,0.5091,0.4921,0.4742,0.4556,0.4362,0.4159,0.3949,0.3731,0.3504,0.327,0.3028,0.2778,0.2519,0.2253,0.1979,0.1696,0.1406], 'marathon':[0.5405,0.5874,0.6311,0.6718,0.7093,0.7438,0.7751,0.8034,0.8285,0.8506,0.8695,0.8869,0.9043,0.9217,0.9391,0.9553,0.9689,0.9801,0.9888,0.995,0.9988,1,1,0.9998,0.9992,0.9983,0.997,0.9953,0.9932,0.9907,0.9879,0.9847,0.9811,0.9771,0.9727,0.968,0.9629,0.9574,0.9515,0.9453,0.9386,0.9316,0.9242,0.9165,0.9083,0.8998,0.8909,0.8816,0.872,0.8619,0.8515,0.8407,0.8297,0.8186,0.8076,0.7965,0.7854,0.7744,0.7633,0.7523,0.7412,0.7301,0.7191,0.708,0.697,0.6859,0.6748,0.6638,0.6527,0.6413,0.629,0.6159,0.6021,0.5874,0.572,0.5557,0.5386,0.5208,0.5021,0.4827,0.4624,0.4413,0.4195,0.3968,0.3734,0.3491,0.324,0.2982,0.2715,0.2441,0.2158,0.1867,0.1569,0.1262,0.0948] };
  var AG_FACTOR = { M:AG_F_M, K:AG_F_K };

  function agFactor(g, dist, wiek) {                   // czynnik wieku (1.0 = open / brak wieku / poza tabelą)
    if (wiek == null) return 1;
    var tab = AG_FACTOR[g] && AG_FACTOR[g][dist];
    if (!tab) return 1;
    var i = Math.round(wiek) - AG_FACTOR_BASE;
    if (i < 0) i = 0; if (i >= tab.length) i = tab.length - 1;
    return tab[i] > 0 ? tab[i] : 1;
  }

  // ranking życiówek wg AG% (desc) — tylko dystanse z ważnym PB (sek) i standardem dla danej płci
  function _agRanking(snap) {
    var g = snap.gender, pbs = snap.pbs || {}, wiek = (snap.wiek != null ? snap.wiek : null);
    if (!g || !AG_OPEN[g]) return [];
    var dyst = ['5k', '10k', 'half', 'marathon'], out = [];
    for (var i = 0; i < dyst.length; i++) {
      var d = dyst[i], std = AG_OPEN[g][d], pb = pbs[d];
      if (!std || !(pb > 0)) continue;
      var ag = std / (pb * agFactor(g, d, wiek)) * 100;
      out.push({ dist: d, ag: Math.round(ag * 100) / 100 });   // 2 miejsca — wierność vs recon (73.45)
    }
    out.sort(function (a, b) { return b.ag - a.ag; });
    return out;
  }

  // aktualny lider (najmocniejsza życiówka) — do PERSYSTENCJI przez callera (KM6). null gdy <2 PB / brak płci.
  function _najmocniejszaLider(snap) {
    var r = _agRanking(snap);
    return r.length >= 2 ? r[0].dist : null;
  }

  // NAJMOCNIEJSZA ŻYCIÓWKA: pada TYLKO gdy lider AG% ZMIENIŁ się vs snap.ostatni_lider (persistowany).
  // pierwszy znany lider (ostatni_lider=null) → CISZA (baseline; nie ogłaszamy). INERT bez persystencji (KM6).
  function detectNajmocniejszaZyciowka(snap) {
    if (!snap.gender) return null;                     // płeć wymagana
    var r = _agRanking(snap);
    if (r.length < 2) return null;                     // ≥2 PB (inaczej brak porównania)
    var leader = r[0].dist, prev = snap.ostatni_lider || null;
    if (!prev) return null;                            // pierwszy lider → cisza (caller zapisze baseline)
    if (prev === leader) return null;                  // bez zmiany lidera
    return {
      type: 'najmocniejsza',
      evidence: { dystans: leader, poprzedni: prev },  // tożsamość = zmiana prev→leader
      ag_pct: r[0].ag,                                 // POZA evidence (zmienia się z PB)
      wiek_uzyty: (snap.wiek != null ? snap.wiek : null),
      ranking: r,                                      // POZA evidence (animacja: % między dystansami)
      confidence: clamp01(r[0].ag / 100),
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
  var PRIORITY_SCORE = { pb: 3, kamien: 2.9, najmocniejsza: 2.8, najdluzszy: 2.7, dystans: 2.5, wolumen: 2, top5: 1.5, streak: 1 }; // rekord to WYNIK, kamień to CIERPLIWOŚĆ — wynik wygrywa dzień, stąd kamien POD pb; najmocniejsza=zmiana lidera AG% niżej
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

  // Ta sama zdobycz? — typ + identyczne evidence. UWAGA: evidence wczytane z Postgresa (JSONB)
  // ma INNĄ kolejność kluczy niż świeżo wykryte (JSONB nie zachowuje kolejności) — więc
  // porównujemy po KANONICZNYM JSON (klucze posortowane rekurencyjnie), nie po surowym JSON.stringify.
  function _canon(o) {
    if (o === null || typeof o !== 'object') return JSON.stringify(o);
    if (Array.isArray(o)) return '[' + o.map(_canon).join(',') + ']';   // tablice: kolejność znacząca (np. ranking)
    var keys = Object.keys(o).sort();
    return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + _canon(o[k]); }).join(',') + '}';
  }
  function sameMoment(a, b) {
    return !!(a && b) && a.type === b.type && _canon(a.evidence) === _canon(b.evidence);
  }
  function alreadyDelivered(historia, cand) {
    for (var i = 0; i < historia.length; i++) if (sameMoment(historia[i], cand)) return true;
    return false;
  }

  function detect(snapshot) {
    if (!snapshot || !snapshot.newLog) return null;
    var historia = snapshot.historia || [];
    var dedupHist = historia.concat(snapshot.odrzucone || []);   // dedup TAKŻE vs rejected (trener odrzucił → nie re-proponuj); scoring zostaje vs historia (approved)
    var candidates = [detectPB(snapshot), detectVolume(snapshot), detectStreak(snapshot), detectDystans(snapshot), detectTop5Tygodni(snapshot), detectNajdluzszyBieg(snapshot), detectNajmocniejszaZyciowka(snapshot), detectKamien(snapshot)].filter(Boolean);
    // DEDUP: odrzuć już dostarczone zdobycze (anty-spam) zanim policzymy scoring
    // najmocniejsza ma WŁASNĄ logikę zmiany-lidera (prev vs leader) → wyłączona z generycznego value-dedup
    candidates = candidates.filter(function (c) { return c.type === 'najmocniejsza' ? true : !alreadyDelivered(dedupHist, c); });
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
    _detectNajmocniejszaZyciowka: detectNajmocniejszaZyciowka,
    _najmocniejszaLider: _najmocniejszaLider,
    _agRanking: _agRanking,
    _agFactor: agFactor,
    RUN_TYPES: RUN_TYPES,        // dla EF snapshot-buildera (is_run); single-source z silnikiem
    isRunType: isRunType,
    weekKey: weekKey,           // dla EF: te same klucze tygodni co detectStreak (present[] i planowy_odpoczynek[] muszą trafić)
    _normalizeCity: _normalizeCity,
    _startPoint: _startPoint,
    _dystansCele: DYSTANS_CELE,
    _dystansSroda: DYSTANS_SRODA,
    _haversineKm: haversineKm,
    _resolve: resolve,
    _score: scoreCandidate,
    _sameMoment: sameMoment,
    _canonJSON: _canon,
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
    // Wartości przeniosły się z evidence do payloadu (7/8) — stąd odczyt z wierzchu momentu.
    check('WOLUMEN poprz_max=18 (payload)', m2 && m2.poprzednie_max === 18, m2);
    check('WOLUMEN słupki: 6 tygodni (payload)', m2 && m2.slupki && m2.slupki.length === 6, m2);
    check('WOLUMEN słupki: ostatni = peak = suma', m2 && m2.slupki[5].peak === true && m2.slupki[5].km === m2.suma_km, m2);
    check('WOLUMEN evidence ma DOKŁADNIE {tydzien}', m2 && JSON.stringify(Object.keys(m2.evidence)) === '["tydzien"]', m2 && m2.evidence);
    check('WOLUMEN evidence BEZ suma_km i słupków (klucz dedupu musi być stały)',
          m2 && m2.evidence.suma_km === undefined && m2.evidence.slupki === undefined, m2 && m2.evidence);
    check('WOLUMEN okno miesięczne usunięte — brak pola okno', m2 && m2.evidence.okno === undefined, m2 && m2.evidence);

    // — FAŁSZYWE TRAFIENIE: aktywności NIEBIEGOWE nie robią rekordu —
    // 300 km wpisane kiedyś na treningu wzmacniającym dało „rekord tygodnia 305 km",
    // a inny zawodnik dostał zatwierdzony TOP 5 za 14 km biegania i 73 km reszty.
    (function () {
      function tydz(weeksAgo) { return dateInWeek(weeksAgo); }
      var rowerowe = [];
      for (var w = 8; w >= 2; w -= 2) rowerowe.push({ logged_at: tydz(w), distance_km: 20, duration_s: 3600 });
      var nlRower = { logged_at: tydz(0), distance_km: 100, duration_s: 12000, is_run: false };
      var sRower = { today: TODAY, pbs: {}, newLog: nlRower,
                     logs: rowerowe.concat([nlRower]), logs_all: rowerowe.concat([nlRower]) };
      check('wolumen: 100 km ROWEREM nie robi rekordu tygodnia', detectVolume(sRower) === null, detectVolume(sRower));
      check('top5: rower nie wpycha tygodnia do rankingu', detectTop5Tygodni(sRower) === null, detectTop5Tygodni(sRower));

      // rower W TYM SAMYM tygodniu co bieg — do sumy wchodzi wyłącznie bieg
      var nlBieg = { logged_at: tydz(0), distance_km: 30, duration_s: 9000 };
      var sMix = { today: TODAY, pbs: {}, newLog: nlBieg,
                   logs: rowerowe.concat([nlRower, nlBieg]), logs_all: rowerowe.concat([nlRower, nlBieg]) };
      var mMix = detectVolume(sMix);
      check('wolumen: rower + bieg w tym samym tygodniu → liczy się tylko bieg (30, nie 130)',
            mMix && mMix.suma_km === 30, mMix);
    })();

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

    // 3d) MOSTEK planowego odpoczynku — rest nie zrywa, nie liczy się do N
    function streakBridge(runWeeks, restWeeks) {
      var logs = runWeeks.map(function (w) { return { logged_at: dateInWeek(w), distance_km: 20, duration_s: 7200 }; });
      var odp = {}; (restWeeks || []).forEach(function (w) { odp[weekKey(dateInWeek(w))] = true; });
      return { today: TODAY, logs: logs, planowy_odpoczynek: odp };
    }
    var mb1 = detectStreak(streakBridge([0, 1, 3, 4], [2]));               // rest w ŚRODKU (tydz 2) mostkuje 4 biegowe
    check('STREAK mostek (rest w środku) → tygodnie=4', mb1 && mb1.type === 'streak' && mb1.evidence.tygodnie === 4, mb1);
    var mb2 = detectStreak(streakBridge([1, 2, 3, 4], [0]));               // bieżący tydzień = rest, mostek do prior 4 biegowych
    check('STREAK mostek (bieżący=rest) → tygodnie=4', mb2 && mb2.evidence.tygodnie === 4, mb2);
    var mb3 = detectStreak(streakBridge([0, 1], []));                      // SAMOWOLNY brak (tydz 2 bez loga, NIE rest) → zrywa → 2 < próg → null
    check('STREAK samowolny brak → zrywa (null)', mb3 === null, mb3);
    var mb4 = detectStreak(streakBridge([0, 1, 3, 4], []));                // tydz 2 brak loga + brak w odp (poza planem) → zrywa na 2 → null
    check('STREAK poza planem (brak loga, brak odp) → zrywa (null)', mb4 === null, mb4);

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

      // fix #2 rejected-aware (Option B): Berlin ODRZUCONY (snap.odrzucone, NIE historia) → też deduped (koniec re-firowania po odrzuceniu)
      check('dystans dedup REJECTED (odrzucone) → null', detect(Object.assign({}, berl, { historia: [], odrzucone: h })) === null, true);
      check('rejected NIE blokuje INNEGO momentu (odrzucone tylko dedup)', detect(Object.assign({}, berl, { suma_roczna_km: 1000, historia: [], odrzucone: h })) !== null, true);

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

    // ── NAJMOCNIEJSZA ŻYCIÓWKA (age-grading WMA, zmiana lidera) ─────────────────
    (function () {
      function snap(over) { return Object.assign({ today: TODAY, pbs: {}, newLog: { logged_at: dateInWeek(0), distance_km: 5, duration_s: 1500 }, logs: [] }, over); }
      var SM = SilnikMomentu;
      var base = { gender: 'M', pbs: { '5k': 1047, '10k': 2400 }, wiek: 50 };  // 5k 17:27, 10k 40:00

      // [e] WERYFIKACJA AG% vs recon (KLUCZOWE — dowód że tabele = prawdziwe liczby źródłowe)
      var rW = SM._agRanking(snap(base));
      console.log('[najm e] AG ranking M wiek50:', JSON.stringify(rW));
      check('AG: M 5k 17:27 wiek50 = 83.7 (recon)', rW[0].dist === '5k' && rW[0].ag === 83.7, rW);
      var rO = SM._agRanking(snap(Object.assign({}, base, { wiek: null })));
      check('AG: M 5k 17:27 open = 73.45 (recon)', rO[0].ag === 73.45, rO);

      // [g] ranking desc (lider = max AG%)
      check('AG ranking desc, lider 5k > 10k', rW.length === 2 && rW[0].ag >= rW[1].ag && rW[0].dist === '5k', rW);

      // [f] M vs K różne standardy → różne AG% (ten sam 5k 17:27, open)
      var agK = SM._agRanking(snap({ gender: 'K', pbs: { '5k': 1047, '10k': 2400 }, wiek: null }))[0].ag;
      check('AG: K 5k 17:27 open ≠ M (std K834 vs M769)', Math.abs(agK - rO[0].ag) > 1 && Math.abs(agK - 834 / 1047 * 100) < 0.01, agK);

      // [a] pierwszy lider (ostatni_lider=null) → CISZA (nie ogłaszamy bazowego)
      check('najm [a] baseline (ostatni_lider=null) → null', detect(snap(base)) === null, detect(snap(base)));

      // [b] zmiana lidera: ostatni=10k, obecny=5k → MOMENT
      var mb = detect(snap(Object.assign({}, base, { ostatni_lider: '10k' })));
      console.log('[najm b] zmiana 10k→5k:', JSON.stringify(mb && { t: mb.type, ev: mb.evidence, ag: mb.ag_pct }));
      check('najm [b] zmiana lidera → moment', mb && mb.type === 'najmocniejsza' && mb.evidence.dystans === '5k' && mb.evidence.poprzedni === '10k', mb);
      check('najm [b] ag_pct=83.7, ranking POZA evidence', mb && mb.ag_pct === 83.7 && mb.evidence.ag_pct === undefined && mb.ranking.length === 2, mb);

      // [c] bez zmiany: ostatni=5k, obecny=5k → null
      check('najm [c] bez zmiany lidera → null', detect(snap(Object.assign({}, base, { ostatni_lider: '5k' }))) === null, true);

      // [d] <2 PB → null ; brak gender → null
      check('najm [d] <2 PB → null', detect(snap({ gender: 'M', pbs: { '5k': 1047 }, ostatni_lider: '10k' })) === null, true);
      check('najm [d] brak gender → null', detect(snap({ gender: null, pbs: { '5k': 1047, '10k': 2400 }, ostatni_lider: '10k' })) === null, true);

      // [h] WYŁĄCZENIE z generycznego dedupu: ten sam lider był w historii, ale zmiana vs ostatni_lider → pada
      var h = [{ type: 'najmocniejsza', evidence: { dystans: '5k', poprzedni: 'marathon' } }];
      var mh = detect(snap(Object.assign({}, base, { ostatni_lider: '10k', historia: h })));
      check('najm [h] exempt z value-dedup (5k w historii) → i tak pada (zmiana)', mh && mh.type === 'najmocniejsza' && mh.evidence.dystans === '5k', mh);

      // helper lidera do persystencji
      check('najm: _najmocniejszaLider = 5k', SM._najmocniejszaLider(snap(base)) === '5k', SM._najmocniejszaLider(snap(base)));
      check('najm: _najmocniejszaLider <2PB = null', SM._najmocniejszaLider(snap({ gender: 'M', pbs: { '5k': 1047 } })) === null, true);
    })();

    // ── KAMIEŃ MILOWY ───────────────────────────────────────────────────────────
    // Test, który tylko potwierdza wykrycie, nie mówi nic o fałszywych trafieniach —
    // stąd połowa przypadków to CISZA: próg tuż pod granicą, próg minięty dawno,
    // dystans o 200 m za krótki, rower udający kilometry i kamień już dostarczony.
    (function () {
      var D = dateInWeek(0);
      // historia = N biegów po `each` km (i opcjonalnie `sek` sekund każdy), plus newLog
      function hist(n, each, sek) {
        var a = [];
        for (var i = 0; i < n; i++) a.push({ logged_at: dateInWeek(20), distance_km: each, duration_s: sek || 0 });
        return a;
      }
      function snap(logsAll, nl) {
        return { today: TODAY, newLog: nl, logs: [nl], logs_all: logsAll.concat([nl]), pbs: {} };
      }

      // — PRÓG KILOMETROWY —
      var nl10 = { logged_at: D, distance_km: 10, duration_s: 3000 };
      var przez500 = detectKamien(snap(hist(99, 5), nl10));            // 495 + 10 = 505
      check('kamień: 495→505 km przechodzi próg 500', przez500 && przez500.evidence.kategoria === 'km' && przez500.evidence.prog === '500', przez500);

      var podProgiem = detectKamien(snap(hist(96, 5), nl10));          // 480 + 10 = 490
      check('kamień: 480→490 km NIE odpala (tuż pod progiem)', podProgiem === null, podProgiem);

      var granica = detectKamien(snap(hist(98, 5), nl10));             // 490 + 10 = 500 dokładnie
      check('kamień: dokładnie 500 km odpala (próg to <=, nie <)', granica && granica.evidence.prog === '500', granica);

      var dawnoMiniety = detectKamien(snap(hist(210, 5), nl10));       // 1050 + 10 = 1060, żadnej granicy
      check('kamień: 1050→1060 km NIE odpala (próg 1000 minięty dawno)', dawnoMiniety === null, dawnoMiniety);

      var rowerem = detectKamien(snap(hist(96, 5).concat([{ logged_at: dateInWeek(19), distance_km: 300, duration_s: 0, is_run: false }]), nl10));
      check('kamień: 300 km rowerem NIE dolicza się do progu', rowerem === null, rowerem);

      var rowerNowy = detectKamien(snap(hist(99, 5), { logged_at: D, distance_km: 60, duration_s: 7200, is_run: false }));
      check('kamień: rower jako newLog nie przepycha przez próg', rowerNowy === null, rowerNowy);

      // — PRÓG GODZINOWY —
      var przez100h = detectKamien(snap(hist(99, 1, 3600), { logged_at: D, distance_km: 1, duration_s: 3600 }));   // 99h + 1h
      check('kamień: 99→100 h przechodzi próg godzinowy', przez100h && przez100h.evidence.kategoria === 'godziny' && przez100h.evidence.prog === '100', przez100h);

      var podProgiemH = detectKamien(snap(hist(90, 1, 3600), { logged_at: D, distance_km: 1, duration_s: 3600 }));  // 90h + 1h
      check('kamień: 90→91 h NIE odpala', podProgiemH === null, podProgiemH);

      // km ma pierwszeństwo nad godzinami, gdy jeden log przechodzi oba progi naraz
      var oba = detectKamien(snap(hist(99, 5, 3600), { logged_at: D, distance_km: 10, duration_s: 3600 }));         // 495→505 km ORAZ 99→100 h
      check('kamień: przy dwóch progach naraz wygrywa kilometrowy', oba && oba.evidence.kategoria === 'km', oba);

      // — PIERWSZY RAZ —
      var polmaraton = detectKamien(snap(hist(10, 8), { logged_at: D, distance_km: 21.4, duration_s: 7000 }));
      check('kamień: pierwszy półmaraton 21,4 km odpala', polmaraton && polmaraton.evidence.prog === 'half', polmaraton);
      check('kamień: evidence niesie dystans RZECZYWISTY 21.4', polmaraton && polmaraton.evidence.dystans_km === 21.4, polmaraton);

      var zaKrotki = detectKamien(snap(hist(10, 8), { logged_at: D, distance_km: 20.9, duration_s: 7000 }));
      check('kamień: 20,9 km NIE jest półmaratonem (zero tolerancji)', zaKrotki === null, zaKrotki);

      var drugiPolmaraton = detectKamien(snap(
        hist(10, 8).concat([{ logged_at: dateInWeek(10), distance_km: 21.2, duration_s: 7100 }]),
        { logged_at: D, distance_km: 21.6, duration_s: 6900 }));
      check('kamień: DRUGI półmaraton NIE odpala', drugiPolmaraton === null, drugiPolmaraton);

      var maraton = detectKamien(snap(hist(10, 8), { logged_at: D, distance_km: 42.6, duration_s: 15000 }));
      check('kamień: pierwszy maraton ogłasza maraton, nie półmaraton', maraton && maraton.evidence.prog === 'marathon', maraton);

      // — DEDUP (integracja przez detect) —
      var s = snap(hist(99, 5), nl10);
      s.historia = [{ type: 'kamien', evidence: { kategoria: 'km', prog: '500' } }];
      // NIE oczekujemy null: po odrzuceniu kamienia detect słusznie schodzi do następnego
      // kandydata (tu: najdłuższy bieg). Sprawdzamy więc, że kamień nie wraca — a nie, że
      // zapada cisza. Pierwsza wersja tego testu twierdziła inaczej i to ONA była błędem.
      check('kamień: już dostarczony → detect() nie proponuje kamienia', (detect(s) || {}).type !== 'kamien', detect(s));

      var sOdrzucony = snap(hist(99, 5), nl10);
      sOdrzucony.odrzucone = [{ type: 'kamien', evidence: { kategoria: 'km', prog: '500' } }];
      check('kamień: odrzucony przez trenera → nie wraca', (detect(sOdrzucony) || {}).type !== 'kamien', detect(sOdrzucony));

      // — ŚWIEŻOŚĆ „pierwszego razu" (krawędź importu z zegarka) —
      var maratonStary = { logged_at: '2025-07-15', distance_km: 42.6, duration_s: 15000 };
      var sStary = snap(hist(10, 8), maratonStary); sStary.dzis = '2026-08-06';
      check('kamień: maraton sprzed roku NIE odpala (bramka świeżości)', detectKamien(sStary) === null, detectKamien(sStary));

      var sSwiezy = snap(hist(10, 8), { logged_at: '2026-07-20', distance_km: 42.6, duration_s: 15000 });
      sSwiezy.dzis = '2026-08-06';   // 17 dni
      check('kamień: maraton sprzed 17 dni odpala', (detectKamien(sSwiezy) || {}).evidence && detectKamien(sSwiezy).evidence.prog === 'marathon', detectKamien(sSwiezy));

      var sBezDzis = snap(hist(10, 8), maratonStary);   // brak `dzis` → brak bramki (wstecznie zgodne)
      check('kamień: bez snap.dzis bramka świeżości nie działa (zgodność wstecz)', (detectKamien(sBezDzis) || {}).type === 'kamien', detectKamien(sBezDzis));

      // Świeżość NIE dotyczy progów narastających — granicę przechodzi się raz.
      var sProgStary = snap(hist(99, 5), { logged_at: '2025-07-15', distance_km: 10, duration_s: 3000 });
      sProgStary.dzis = '2026-08-06';
      check('kamień: bramka świeżości NIE tyka progu kilometrowego', (detectKamien(sProgStary) || {}).evidence.prog === '500', detectKamien(sProgStary));

      // — KONFLIKT §3: rekord życiowy bije kamień tego samego dnia —
      var sKonflikt = {
        today: TODAY, pbs: { '5k': 1440 },
        newLog: { logged_at: D, distance_km: 5, duration_s: 1380 },       // PB 24:00 → 23:00
        logs: [{ logged_at: D, distance_km: 5, duration_s: 1380 }],
        logs_all: hist(99, 5).concat([{ logged_at: D, distance_km: 5, duration_s: 1380 }]),  // 495 + 5 = 500
      };
      var mKonflikt = detect(sKonflikt);
      check('§3: PB i kamień naraz → wygrywa PB (wynik przed cierpliwością)', mKonflikt && mKonflikt.type === 'pb', mKonflikt);
      check('§3: sam kamień bez PB nadal przechodzi', (detectKamien(sKonflikt) || {}).evidence.prog === '500', detectKamien(sKonflikt));

      // — KSZTAŁT EVIDENCE (kontrakt z EF share-card; zmiana = re-fire wszystkich kamieni) —
      check('kamień: evidence km ma DOKŁADNIE {kategoria,prog}', JSON.stringify(Object.keys(przez500.evidence).sort()) === '["kategoria","prog"]', Object.keys(przez500.evidence));
      check('kamień: evidence pierwszy ma DOKŁADNIE {dystans_km,kategoria,prog}', JSON.stringify(Object.keys(polmaraton.evidence).sort()) === '["dystans_km","kategoria","prog"]', Object.keys(polmaraton.evidence));
      check('kamień: prog zawsze STRING (klucz nazw w EF)', typeof przez500.evidence.prog === 'string' && typeof przez100h.evidence.prog === 'string', true);
    })();

    // ── RUN_TYPES / isRunType (export dla EF; NIE zmienia detektorów) ────────────
    (function () {
      var SM = SilnikMomentu;
      check('isRunType: 10 typów (1:1 z sb.js)', SM.RUN_TYPES.length === 10, SM.RUN_TYPES.length);
      check('isRunType: bieg spokojny → true', SM.isRunType('bieg spokojny') === true, true);
      check('isRunType: Start (case) → true', SM.isRunType('Start') === true, true);
      check('isRunType: "  Tempo  " (trim) → true', SM.isRunType('  Tempo  ') === true, true);
      check('isRunType: interwały → true', SM.isRunType('interwały') === true, true);
      check('isRunType: Siłownia (niebiegowy) → false', SM.isRunType('Siłownia') === false, false);
      check('isRunType: Rower → false', SM.isRunType('Rower') === false, false);
      check('isRunType: pusty/null → false', SM.isRunType('') === false && SM.isRunType(null) === false, true);
      // detektory NIE używają isRunType (czytają snapshot.is_run) — dodanie czyste, zero wpływu na detekcję (dowód: testy [1-17,najm] wyżej PASS)
    })();

    console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + '  (' + pass + ' ok, ' + fail + ' fail)');
    if (typeof process !== 'undefined') process.exit(fail === 0 ? 0 : 1);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

// ===== /INLINE silnik =====

const SM = globalThis.SilnikMomentu;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const PUSH_HOOK_SECRET = Deno.env.get('PUSH_HOOK_SECRET');   // handshake trigger→EF (Wariant 2); sekret serwisowy NIE w nagłówku triggera

function toSec(s) {
  if (!s) return null;
  const p = String(s).trim().split(':').map(Number);
  if (p.some(isNaN)) return null;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  if (p.length === 1) return p[0] * 60;
  return null;
}
const J = (obj, status = 200) => Response.json(obj, { status });

Deno.serve(async (req) => {
  // auth (Push revival Wariant 2): x-push-secret == PUSH_HOOK_SECRET; sekret serwisowy NIE w nagłówku triggera
  const _hookSecret = req.headers.get('x-push-secret');
  const _isSystem = !!PUSH_HOOK_SECRET && _hookSecret === PUSH_HOOK_SECRET;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  if (!_isSystem) {
    try {
      await sb.from('security_events').insert({
        severity: 'warning', source: 'ef:detect-moment', message: 'rejected handshake',
        details: { reason: 'bad_or_missing_hook', ip: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || null, ua: req.headers.get('user-agent') || null, has_hook: !!_hookSecret },
      });
    } catch (_e) { /* Stróż best-effort — nie wywala 401 */ }
    return new Response('forbidden', { status: 401 });
  }
  // silnik wbudowany — guard na zepsuty build (deploy-time, nie runtime)
  if (!SM || typeof SM.detect !== 'function') { console.error('[detect] SilnikMomentu missing — zły build-ef?'); return J({ detected: false, error: 'engine_missing' }); }

  let body; try { body = await req.json(); } catch { return J({ error: 'bad_body' }, 400); }
  const athlete_id = body && body.athlete_id;
  if (!athlete_id) return J({ error: 'no_athlete_id' }, 400);

  const { data: a } = await sb.from('athletes')
    .select('pb_5k,pb_10k,pb_half,pb_marathon,gender,date_of_birth,city,strongest_pb_dist')
    .eq('id', athlete_id).single();
  if (!a) return J({ error: 'athlete_not_found' }, 404);

  const { data: rows } = await sb.from('training_logs')
    .select('logged_at,distance_km,duration,training_type')
    .eq('athlete_id', athlete_id).not('training_type', 'like', '__badge__%')
    .order('logged_at', { ascending: true });

  const { data: hist } = await sb.from('delivered_moments')
    .select('type,evidence,status').eq('athlete_id', athlete_id).in('status', ['approved', 'rejected']);

  // planowy odpoczynek (streak): approved plany → tydzień z workoutami ale BEZ żadnego biegu = rest → MOSTKUJE serię (nie zrywa, nie liczy)
  const { data: plans } = await sb.from('training_plans').select('id').eq('athlete_id', athlete_id).eq('status', 'approved');
  const planIds = (plans || []).map((p) => p.id);
  const planowy_odpoczynek = {};
  if (planIds.length) {
    const { data: pw } = await sb.from('training_plan_workouts').select('date,workout_type').in('plan_id', planIds);
    const wkAny = {}, wkRun = {};
    (pw || []).forEach((w) => { const k = SM.weekKey(w.date); wkAny[k] = true; if (SM.isRunType(w.workout_type)) wkRun[k] = true; });
    Object.keys(wkAny).forEach((k) => { if (!wkRun[k]) planowy_odpoczynek[k] = true; });   // ma workouty, zero biegów → rest
  }
  console.log('[detect] athlete', athlete_id, 'plans', planIds.length, 'rest-weeks', Object.keys(planowy_odpoczynek).length);   // czujnik mostka streak: rest-weeks>0 = mostek aktywny (sam id+liczby, bez treści planów)

  // ── snapshot-builder (LUSTRO browser buildSnapshot; is_run = SM.isRunType) ──
  const all = (rows || []).map((r) => ({
    logged_at: r.logged_at,
    distance_km: parseFloat(r.distance_km) || 0,
    duration_s: toSec(r.duration),
    training_type: r.training_type,
    is_run: SM.isRunType(r.training_type),
  }));
  if (!all.length) return J({ detected: false, reason: 'no_logs' });

  const since90 = new Date(); since90.setDate(since90.getDate() - 90);
  const logs = all.filter((l) => new Date(l.logged_at) >= since90);
  const rok = new Date().getFullYear();
  const yearStartMs = new Date(rok, 0, 1).getTime();
  const suma_roczna_km = Math.round(all.reduce((s, l) => s + (new Date(l.logged_at).getTime() >= yearStartMs && l.is_run ? l.distance_km : 0), 0) * 10) / 10;
  const pbs = { '5k': toSec(a.pb_5k), '10k': toSec(a.pb_10k), 'half': toSec(a.pb_half), 'marathon': toSec(a.pb_marathon) };
  const newLog = all[all.length - 1];
  const today = String(newLog.logged_at).slice(0, 10);
  let wiek = null;
  if (a.date_of_birth) wiek = Math.floor((Date.now() - new Date(a.date_of_birth).getTime()) / (365.25 * 86400000));
  const historia  = (hist || []).filter((h) => h.status === 'approved').map((h) => ({ type: h.type, evidence: h.evidence }));
  const odrzucone = (hist || []).filter((h) => h.status === 'rejected').map((h) => ({ type: h.type, evidence: h.evidence }));   // dedup-only (NIE scoring)

  // `dzis` to REALNA data, w odróżnieniu od `today`, które jest datą newLoga (patrz wyżej).
  // Bramka świeżości „pierwszego razu" w detektorze kamienia liczy wiek logu WZGLĘDEM NIEJ —
  // bez tego pola paczka z zegarka ogłosiłaby dziś pierwszy maraton sprzed lat.
  const snap = {
    newLog, logs, logs_all: all, pbs, today, dzis: new Date().toISOString().slice(0, 10), historia, odrzucone,
    gender: a.gender || null, wiek, suma_roczna_km, rok,
    start_miasto: a.city || null, ostatni_lider: a.strongest_pb_dist || null,
    planowy_odpoczynek,
  };

  // detect (najmocniejsza czyta snap.ostatni_lider = stary lider, zamrożony)
  const moment = SM.detect(snap);

  // ZAWSZE: persyst lidera (ożywia najmocniejszą) — tylko gdy zmiana, mniej zapisów
  const lider = SM._najmocniejszaLider(snap);
  if (lider && lider !== a.strongest_pb_dist) {
    await sb.from('athletes').update({ strongest_pb_dist: lider }).eq('id', athlete_id);
  }

  if (!moment) return J({ detected: false });

  // dedup double-guard: identyczny pending tego typu już czeka? (np. 2 logi tego samego dnia)
  const { data: pend } = await sb.from('delivered_moments')
    .select('id,evidence').eq('athlete_id', athlete_id).eq('status', 'pending').eq('type', moment.type);
  const dup = (pend || []).some((p) => SM._canonJSON(p.evidence) === SM._canonJSON(moment.evidence));
  if (dup) return J({ detected: false, reason: 'dup_pending' });

  // payload = moment − {type, evidence}; browser rekonstruuje {type, evidence, ...payload}
  const payload = Object.assign({}, moment); delete payload.type; delete payload.evidence;
  const { error: insErr } = await sb.from('delivered_moments')
    .insert({ athlete_id, type: moment.type, evidence: moment.evidence, payload, status: 'pending' });
  if (insErr) { console.error('[detect] insert err', insErr.message); return J({ detected: false, error: 'insert_failed' }); }

  return J({ detected: true, type: moment.type });
});
