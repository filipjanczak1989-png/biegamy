#!/usr/bin/env bash
# BIEG WIRTUALNY, RANKING TYLKO Z ZEGARKA (16.11): testy po skutku migracji 20261203_akcja_bieg_ranking_tylko_gps.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Przed wdrożeniem: AKCJA_BIEG_RANKING_GPS_Z_MIGRACJA=1. Bieg próbny, uczestnicy i treningi powstają tylko w tej transakcji.
# Strażnik licznika: akcja_licznik prawdziwej ulicy zapisany PRZED migracją (service_role jak EF akcja-licznik) i porównany po niej.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  echo "select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true); set local role service_role;"
  echo "create temp table _licznik_przed as select public.akcja_licznik('dla-fabianka') as j; reset role;"
  if [ "${AKCJA_BIEG_RANKING_GPS_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261203_akcja_bieg_ranking_tylko_gps.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/akcja-bieg-ranking-gps-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY RANKINGU Z ZEGARKA ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY RANKINGU Z ZEGARKA ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
