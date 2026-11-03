// WYDMUSZKA (Filip 3.11, plan B Garmin/intervals): intervals zapowiada (9.10) blokadę danych Garmina przez API — inne aplikacje spodziewają
// się aktywności jako WYDMUSZEK: id, source, start, typ — bez dystansu, czasu, strumieni. Do 3.11 taka aktywność wpadała w filtr „ogryzków”
// (< 60 s i < 300 m) i znikała bez śladu: plan zostawał otwarty, człowiek nie wiedział, że cokolwiek doszło. Teraz: wydmuszka = osobny
// wiersz training_logs „wykonany, szczegóły niedostępne” — BEZ kilometrów (distance_km null → nie liczy się do akcji, odznak, sum), bez
// czasu i tempa, z komentarzem; plan tego dnia domyka się jak przy każdym imporcie (domknij-plan.mjs: dobór po typie; bez powiązania
// planned_training_id, bo wiarygodneWykonanie wymaga km). Istniejących logów import NIGDY nie nadpisuje ani nie kasuje (dedup po external_id).
export const KOMENTARZ_WYDMUSZKI = "Trening z zegarka — szczegóły niedostępne (Garmin ograniczył dostęp przez intervals.icu)";

const brak = (v) => v == null || Number(v) === 0;
/** aktywność bez dystansu, czasu i obciążenia = wydmuszka (prawdziwy mikro-trening ma dodatni czas albo dystans → to „ogryzek”, nie wydmuszka) */
export function czyWydmuszka(a) {
  if (!a || a.id == null) return false;
  return brak(a.distance) && brak(a.moving_time) && brak(a.elapsed_time) && a.icu_training_load == null;
}
/** czy wydmuszka pochodzi z Garmina (pole `source` intervals albo device_name) */
export function zGarmina(a) {
  const s = String((a && a.source) || "").toUpperCase(), d = String((a && a.device_name) || "").toLowerCase();
  return s.startsWith("GARMIN") || /garmin|fenix|forerunner|venu|instinct|enduro/.test(d);
}
/** wiersz training_logs dla wydmuszki — typ z planu tego dnia (jeśli jest) albo surowy typ intervals przez typeForActivity (podaje wołający) */
export function wierszWydmuszki(a, athleteId, trainingType, rawType) {
  return {
    athlete_id: athleteId,
    training_type: trainingType,
    external_type: rawType ?? null,
    icu_stream_types: [],
    icu_trainer: null,
    distance_km: null, duration: null, pace: null, heart_rate: null, elevation_gain: null, calories: null,
    comment: (a.name ? String(a.name).slice(0, 80) + " — " : "") + KOMENTARZ_WYDMUSZKI,
    logged_at: a.start_date_local || a.start_date,
    source: "intervals", external_source: "intervals", external_id: String(a.id),
    icu_load: null, cadence: null, gap_pace: null, icu_intensity: null,
  };
}
