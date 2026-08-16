// ─────────────────────────────────────────────────────────────────────────────
// REGUŁY TRENINGOWE — wspólne dla Edge Functions.
//
// ⚠️ TO JEST DRUGA KOPIA, NIE ŹRÓDŁO PRAWDY. Oryginał żyje w `sb.js` jako
//    `window.RUN_TYPES` / `window.FORMA_EFFORT_FACTORS` / `window.FORMA_FEEL_MODIFIERS`.
//    Projekt nie ma kroku budowania, a `sb.js` to skrypt przeglądarkowy (`window.*`),
//    więc nie da się go zaimportować w Deno. Świadomie utrzymujemy dwie kopie,
//    a rozjazd WYKRYWA bramka: `tools/bramka-reguly.js` (odpalana z `bramka.yml`).
//    Zmieniasz tu → zmień w `sb.js` w TYM SAMYM commicie, i odwrotnie.
//
// POWÓD POWSTANIA (zwiad 16.08.2026): EF raportów liczyły objętość i formę
// inaczej niż aplikacja. Zmierzone na 23 zawodnikach: u 10 z nich raport
// nazwałby stan formy INNĄ kategorią niż wykres, który widzi ten sam człowiek
// (największy rozjazd 58 punktów TSB — „świeżość" zamiast „obciążenia").
// ─────────────────────────────────────────────────────────────────────────────

/** Typy liczone do objętości BIEGOWEJ. Reszta (rower, spacer, siłownia…) — nie. */
export const RUN_TYPES = new Set([
  'spokojny', 'bieg spokojny', 'wybieganie', 'długi', 'tempo',
  'progresja', 'interwały', 'start', 'wyścig', 'regeneracja',
]);

export function isRunType(t) {
  return RUN_TYPES.has(String(t || '').toLowerCase().trim());
}

/** Waga wysiłku per typ. ⚠️ Nieznany typ → 1.5 (jak w `sb.js:formaTRIMP`). */
export const FORMA_EFFORT_FACTORS = {
  'odpoczynek': 0, 'regeneracja': 1.0, 'spacer': 0.5, 'rower': 1.0,
  'pływanie': 1.0, 'siłownia': 1.2, 'joga': 0.6, 'narty': 1.3,
  'ergometr': 1.2, 'orbitrek': 1.0, 'spokojny': 1.5, 'bieg spokojny': 1.5,
  'wybieganie': 2.0, 'długi': 2.5, 'wzmacniający': 1.5, 'zastępczy': 1.5,
  'tempo': 3.5, 'progresja': 3.0, 'interwały': 4.5, 'start': 5.0, 'wyścig': 5.0,
};

export const FORMA_FEEL_MODIFIERS = { good: 1.0, mid: 1.1, bad: 1.3 };

/** Progi TSB — te same, którymi opisany jest wykres w aplikacji (`sb.js:2739`). */
export const TSB_PROGI = { przeciazenie: -30, obciazenie: -10, neutralna: 5, optimum: 15 };

export function opisFormy(tsb) {
  if (tsb < TSB_PROGI.przeciazenie) return 'przeciążenie';
  if (tsb < TSB_PROGI.obciazenie) return 'obciążenie';
  if (tsb < TSB_PROGI.neutralna) return 'neutralna';
  if (tsb <= TSB_PROGI.optimum) return 'optimum';
  return 'świeżość';
}

/** "1:24:24" / "84:24" / "84" → minuty. Nieparsowalne → 0. */
export function durationToMin(d) {
  const t = String(d || '').trim();
  if (!t) return 0;
  const p = t.split(':').map(Number);
  if (p.some(isNaN)) return 0;
  return p.length === 3 ? p[0] * 60 + p[1] + p[2] / 60
       : p.length === 2 ? p[0] + p[1] / 60
       : (+t || 0);
}

export function formaTRIMP(log) {
  const key = String(log.training_type || '').toLowerCase().trim();
  const eff = FORMA_EFFORT_FACTORS[key] !== undefined ? FORMA_EFFORT_FACTORS[key] : 1.5;
  return Math.round(durationToMin(log.duration) * eff * (FORMA_FEEL_MODIFIERS[log.feel] || 1.0));
}

/** Suma kilometrów BIEGOWYCH — zastępcze/rower/marsz poza sumą. */
export function sumaKmBiegowych(logi) {
  return (logi || []).reduce(
    (s, l) => s + (isRunType(l.training_type) ? (parseFloat(l.distance_km) || 0) : 0), 0);
}

/** Klucz daty w dobie LOKALNEJ (Europe/Warsaw), nie UTC. */
export function kluczDaty(d, strefa = 'Europe/Warsaw') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: strefa, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d instanceof Date ? d : new Date(d));
}

/**
 * CTL/ATL/TSB — JEDNA implementacja, ta sama co wykres w aplikacji.
 *
 * ⚠️ SEED JEST TU NAJWAŻNIEJSZY, NIE WYGŁADZANIE. Naiwna EMA od zera zaniża
 *    CTL, bo długoterminowa baza nie zdąży się odbudować w oknie. Aplikacja
 *    dostała FORMA-SEED v2/v3/v4 właśnie po to (`sb.js:3212`), EF nigdy go
 *    nie miały — stąd cały zmierzony rozjazd.
 *      v2: seed od OSTATNIEGO ciągłego bloku (dziura >21 dni zaczyna nowy) —
 *          izolowane stare wpisy nie mogą być bazą.
 *      v4: pomiń wiodące dni zerowe (odpoczynki) — seed od pierwszego REALNEGO
 *          treningu.
 *      v3: clamp outliera — pojedyncze ultra w oknie seeda nie może udawać bazy.
 */
/** Do dziesiątych — tak jak seria wykresu w `sb.js`. */
const d1 = (x) => Math.round(x * 10) / 10;

export function formaSeria(logi, { koniec = new Date(), dni = 90, strefa = 'Europe/Warsaw' } = {}) {
  const dzienne = {};
  for (const l of logi || []) {
    /* ⚠️ KUBEŁKUJEMY PO DACIE ZAPISANEJ, NIE PO STREFIE. `logged_at` niesie
       datę treningu jako fakt (wpisy ręczne są stemplowane na 12:00, właśnie
       żeby doba nie była sporna) — konwersja do Europe/Warsaw przesuwałaby
       wpisy zapisane blisko północy o dzień. Aplikacja robi dokładnie to samo:
       `log.logged_at.split('T')[0]` (sb.js:3171). Zmierzone: konwersja dawała
       rozjazd ATL u 3 z 25 osób.
       ⚠️ `kluczDaty` (Europe/Warsaw) zostaje — ale do pytania „który dziś jest
       dzień", a nie „do którego dnia należy ten trening". To dwie różne rzeczy
       i mylenie ich było źródłem błędu `TODAY_ISO` w EF. */
    const sur = l.logged_at || l.date;
    const k = typeof sur === 'string' ? sur.split('T')[0] : kluczDaty(sur, strefa);
    dzienne[k] = (dzienne[k] || 0) + formaTRIMP(l);
  }

  const klucze = Object.keys(dzienne).sort();
  let seed = 0, blokStart = null;
  if (klucze.length) {
    let bs = klucze[0];
    for (let i = 1; i < klucze.length; i++) {
      if ((new Date(klucze[i]) - new Date(klucze[i - 1])) / 864e5 > 21) bs = klucze[i];
    }
    for (let i = 0; i < klucze.length; i++) {
      if (klucze[i] >= bs && dzienne[klucze[i]] > 0) { bs = klucze[i]; break; }
    }
    blokStart = bs;
    const cut = kluczDaty(new Date(new Date(bs + 'T12:00:00Z').getTime() + 14 * 864e5), 'UTC');
    let suma = 0, max = 0;
    for (const k of klucze) {
      if (k >= bs && k < cut) { suma += dzienne[k]; if (dzienne[k] > max) max = dzienne[k]; }
    }
    seed = Math.min(suma / 14, (suma - max) / 13 * 2.5 + 20);
  }

  const kon = kluczDaty(koniec, strefa);
  const start = kluczDaty(new Date(new Date(kon + 'T12:00:00Z').getTime() - dni * 864e5), 'UTC');

  let ctl = 0, atl = 0;
  if (blokStart && blokStart <= start) { ctl = seed; atl = seed; }
  const seria = [];
  for (let d = new Date(start + 'T12:00:00Z'); kluczDaty(d, 'UTC') <= kon; d = new Date(d.getTime() + 864e5)) {
    const k = kluczDaty(d, 'UTC');
    if (blokStart && k === blokStart) { ctl = seed; atl = seed; }
    const t = dzienne[k] || 0;
    ctl += (t - ctl) / 42;
    atl += (t - atl) / 7;
    /* ⚠️ ZAOKRĄGLENIE DO 0,1 JEST CZĘŚCIĄ KONTRAKTU, nie kosmetyką. Aplikacja
       trzyma serię w dziesiątych (`ctlData.push(Math.round(ctl*10)/10)`, sb.js:3256)
       i dopiero z niej czyta wartość dnia. EMA biegnie dalej na SUROWEJ liczbie —
       zaokrąglamy tylko to, co wychodzi na zewnątrz. Bez tego kroku wartości
       z końcówką .x5 rozjeżdżały się o 1 punkt względem wykresu u 4 z 25 osób. */
    seria.push({ dzien: k, trimp: t, ctl: d1(ctl), atl: d1(atl), tsb: d1(ctl - atl) });
  }

  const tsb = Math.round(d1(ctl - atl));
  return {
    ctl: Math.round(d1(ctl)), atl: Math.round(d1(atl)), tsb,
    forma: opisFormy(tsb),
    seed: Math.round(seed), blok_start: blokStart,
    seria,
  };
}

/**
 * Monotonia i strain z ostatnich 7 dni.
 * Wzór przeniesiony 1:1 z trzech EF (`athlete-report:679`, `coach-brief:513`,
 * `training-plan:272`), gdzie żył w trzech identycznych kopiach.
 *
 * ⚠️ `strain` mnoży przez monotonię NIEZAOKRĄGLONĄ, a zwracana `monotonia_7d`
 *    jest zaokrąglona do 0,1. Zaokrąglenie najpierw zmieniłoby strain o kilka
 *    procent — wygląda niewinnie, a jest zmianą liczby, którą dostaje model.
 * ⚠️ Odchylenie dzielone przez 7 (populacyjne), nie przez 6. Tak było i tak zostaje.
 */
export function monotoniaIStrain(trimpDzienny) {
  const w7 = (trimpDzienny || []).slice(-7);
  const suma = w7.reduce((a, b) => a + b, 0);
  const sr = suma / 7;
  const sd = Math.sqrt(w7.reduce((a, b) => a + (b - sr) * (b - sr), 0) / 7);
  const mono = sr <= 0 ? 0 : (sd > 0 ? Math.min(sr / sd, 4) : 4);
  return { monotonia_7d: Math.round(mono * 10) / 10, strain_7d: Math.round(suma * mono) };
}

/**
 * Trend EF (efektywności tlenowej) — nachylenie regresji liniowej, w % na 90 dni.
 * `punkty`: [{ x: dzień jako liczba, y: EF }]. Poniżej 5 punktów → null.
 */
export function trendEfPct(punkty) {
  const pkt = punkty || [];
  if (pkt.length < 5) return null;
  const n = pkt.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of pkt) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
  const nachylenie = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  return Math.round(nachylenie * 90 / ((sy / n) || 1) * 1000) / 10;
}

/**
 * SKALE SAMOPOCZUCIA — ⚠️ CELOWO DWIE, bo służą różnym rzeczom i mają różne
 * zakresy. Ujednolicenie zmieniłoby treść raportów, więc jest osobną decyzją.
 *   RAPORT (3..9)  → liczba `srednie_samopoczucie` w raw_data_snapshot
 *   TON    (1..4)  → wybór tonu wypowiedzi trenera (próg 3,5 = „świetnie")
 *
 * ⚠️ `great` NIE WYSTĘPUJE W DANYCH — sprawdzone 16.08.2026, zero logów;
 *    kolumna `feel` przyjmuje tylko `bad`/`good`/`mid`/NULL. Zostawiamy
 *    w mapie: gdy klient kiedyś zacznie tę wartość zapisywać, brak wpisu
 *    oznaczałby ciche potraktowanie jej jako nieznanej.
 * ⚠️ SKUTEK UBOCZNY, DO ROZSTRZYGNIĘCIA: bez `great` maksimum skali TON wynosi
 *    3,0, więc próg 3,5 jest NIEOSIĄGALNY — gałąź „czuje się ŚWIETNIE" nie
 *    odpaliła ani razu, nawet dla kogoś, kto każdy trening ocenia na `good`.
 */
export const SAMOPOCZUCIE_RAPORT = { bad: 3, mid: 5, good: 7, great: 9 };
export const SAMOPOCZUCIE_TON = { bad: 1, mid: 2, good: 3, great: 4 };
export const SAMOPOCZUCIE_DOMYSLNE = { raport: 5, ton: 2 };

export function sredniaSamopoczucia(logi, skala = SAMOPOCZUCIE_RAPORT, domyslna = 5) {
  const z = (logi || []).filter((l) => l.feel);
  if (!z.length) return null;
  return z.reduce((s, l) => s + (skala[l.feel] || domyslna) / z.length, 0);
}

/** Wersja metryki zapisywana przy raporcie — patrz `ai_reports.metryka_wersja`. */
export const METRYKA_WERSJA = 'v2';
