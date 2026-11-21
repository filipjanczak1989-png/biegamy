#!/usr/bin/env bash
# ODZNAKI CHRONIONE (O1, 21.11): test po skutku migracji 20261223_achievements_chronione.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Przed wdrożeniem: ODZNAKI_CHRONIONE_Z_MIGRACJA=1 (migracja w tej samej transakcji, też wycofana). Strażnik: achievements sprzed testu.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  echo "create temp table _odz_przed as select athlete_id, badge_id, earned_at from public.achievements;"
  if [ "${ODZNAKI_CHRONIONE_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261223_achievements_chronione.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/odznaki-chronione-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY ODZNAK CHRONIONYCH ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY ODZNAK CHRONIONYCH ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
