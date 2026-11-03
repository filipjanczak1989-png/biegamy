#!/usr/bin/env bash
# STATUS SYNCHRONIZACJI: testy intervals_status w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej (7 asercji).
# IS_Z_MIGRACJA=1 dokłada NAJNOWSZĄ niewdrożoną migrację (dziś: 20261105_intervals_status_garmin.sql); IS_Z_MIGRACJA=all — obie (świeża baza).
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  case "${IS_Z_MIGRACJA:-0}" in
    all) for m in 20261105_intervals_status 20261105_intervals_status_garmin; do sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d' "supabase/migrations/$m.sql"; done ;;
    1)   sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d' supabase/migrations/20261105_intervals_status_garmin.sql ;;
  esac
  cat tools/intervals-status-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY INTERVALS_STATUS ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY INTERVALS_STATUS ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
