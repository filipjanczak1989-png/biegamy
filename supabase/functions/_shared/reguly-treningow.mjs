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
export function formaSeria(logi, { koniec = new Date(), dni = 90, strefa = 'Europe/Warsaw' } = {}) {
  const dzienne = {};
  for (const l of logi || []) {
    const k = kluczDaty(l.logged_at || l.date, strefa);
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
    seria.push({ dzien: k, trimp: t, ctl, atl, tsb: ctl - atl });
  }

  const tsb = Math.round(ctl - atl);
  return {
    ctl: Math.round(ctl), atl: Math.round(atl), tsb,
    forma: opisFormy(tsb),
    seed: Math.round(seed), blok_start: blokStart,
    seria,
  };
}

/** Wersja metryki zapisywana przy raporcie — patrz `ai_reports.metryka_wersja`. */
export const METRYKA_WERSJA = 'v2';
