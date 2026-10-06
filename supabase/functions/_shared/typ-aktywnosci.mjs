// Mapowanie aktywności z intervals.icu (typy Strava/Garmin) → polski typ treningu BiegaMy.
//
// Do 06.10.2026 ta logika żyła w DWÓCH kopiach: intervals-sync (z pełną ACT_MAP od `cce8902`,
// 27.07) i intervals-webhook (BEZ ACT_MAP — każdy nie-bieg → 'Zastępczy'; ostatnia zmiana
// `f2231e4`, 23.07). Nagłówek webhooka mówił „ŚWIADOMY DUPLIKAT", a kopie rozjechały się
// cztery dni później i nikt tego nie zauważył przez 10 tygodni — bo nie było bramki
// (RUN_TYPES ma `sprawdz-run-types.py`, ta mapa nie miała nic). Objaw: spacery i siłownia
// Maćka wpadały jako `Zastępczy` (feedback 14.08, pkt 1), a przyczyny nie dało się ustalić
// z bazy, bo surowy `a.type` nie był nigdzie zapisywany (pkt 1b) — stąd `external_type`.
//
// Od 06.10: JEDNA kopia tutaj, oba EF importują, `tools/bramka-reguly.js` (część D) pilnuje,
// że import jest, a lokalna mapa nie wróciła. RUN_PLAN (mirror RUN_TYPES) zniknął — bierzemy
// RUN_TYPES wprost z reguly-treningow.mjs, czyli z tego samego miejsca co EF raportów.
import { RUN_TYPES } from './reguly-treningow.mjs';

/** Typy aktywności intervals/Strava, które są BIEGIEM — dostają typ z planu, nie z mapy. */
export const RUN_ACT = new Set(['Run', 'TrailRun', 'Treadmill', 'VirtualRun']);

/** Nie-biegi: typ intervals → polski typ. Każda aktywność = własny typ + własny effort w sb.js
 *  (było: wszystko → 'Zastępczy' 1.5 — spacery Kasi pompowały ATL do 153). Typ spoza mapy →
 *  'Zastępczy' (patrz typForActivity). Dokładając pozycję: sb.js `renderTypePill` i
 *  FORMA_EFFORT_FACTORS muszą znać nowy polski typ, inaczej ikona i waga lecą na fallback. */
export const ACT_MAP = Object.freeze({
  'Walk': 'Spacer', 'Hike': 'Spacer',
  'Ride': 'Rower', 'VirtualRide': 'Rower', 'MountainBikeRide': 'Rower', 'GravelRide': 'Rower', 'EBikeRide': 'Rower',
  'Swim': 'Pływanie', 'OpenWaterSwim': 'Pływanie',
  'WeightTraining': 'Siłownia', 'Workout': 'Siłownia', 'Crossfit': 'Siłownia',
  'Yoga': 'Joga', 'Pilates': 'Joga',
  'NordicSki': 'Narty', 'AlpineSki': 'Narty', 'BackcountrySki': 'Narty', 'RollerSki': 'Narty',
  'Rowing': 'Ergometr', 'VirtualRow': 'Ergometr',
  'Elliptical': 'Orbitrek', 'StairStepper': 'Orbitrek',
});

/** Bieg dostaje typ z PLANU na ten dzień (trainings.type). Brak planu / dzień wolny / plan
 *  nie-biegowy → 'Spokojny'. 'bieg spokojny' to jedyny alias (Decyzja A) → kanon ikon UI. */
export function typeFromPlan(planType) {
  const t = String(planType || '').trim();
  const lt = t.toLowerCase();
  if (!t || lt === 'odpoczynek') return 'Spokojny';
  if (lt === 'bieg spokojny') return 'Spokojny';
  return RUN_TYPES.has(lt) ? t : 'Spokojny';
}

/** @param a aktywność z API intervals (pole `type`); @param planType trainings.type na ten dzień */
export function typeForActivity(a, planType) {
  const raw = String((a && a.type) || '');
  if (RUN_ACT.has(raw)) return typeFromPlan(planType);
  return ACT_MAP[raw] || 'Zastępczy';
}

/** Surowy typ do kolumny training_logs.external_type — żeby mapowanie dało się odtworzyć
 *  z bazy (LEKCJE #3: pole ma nieść informację, o której mówi nazwa). Pusty → null. */
export function rawActivityType(a) {
  const raw = String((a && a.type) || '').trim();
  return raw ? raw.slice(0, 64) : null;
}
