#!/usr/bin/env bash
# PROŚBY O TRENERA (K2 M1, 20.11): test po skutku migracji 20261221_prosby_trenera.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Przed wdrożeniem: PROSBY_TRENERA_Z_MIGRACJA=1 (migracja w tej samej transakcji, też wycofana). Strażnik: athletes(id, coach_id) sprzed testu.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  echo "create temp table _coach_przed as select id, coach_id from public.athletes;"
  if [ "${PROSBY_TRENERA_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261221_prosby_trenera.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/prosby-trenera-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY PROSB O TRENERA ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY PROSB O TRENERA ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
