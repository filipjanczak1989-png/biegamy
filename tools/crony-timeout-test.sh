#!/usr/bin/env bash
# CRONY (20.11): test po skutku migracji 20261220_crony_timeout_pg_net.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej. Nic nie woła funkcji.
# Przed wdrożeniem: CRONY_TIMEOUT_Z_MIGRACJA=1 (cron.alter_job w tej samej transakcji — wycofany, pg_cron go nie zobaczy).
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  echo "create temp table _cron_przed as select jobname, schedule, command, active from cron.job;"
  if [ "${CRONY_TIMEOUT_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261220_crony_timeout_pg_net.sql | sed -e '/^begin;$/d' -e '/^commit;$/d'; fi
  tr -d '\r' < tools/crony-timeout-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY TIMEOUTOW CRONOW ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY TIMEOUTOW CRONOW ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
