#!/usr/bin/env bash
# BIEG WIRTUALNY (20.11): test po skutku migracji 20261128_akcja_bieg_przypomnienie_cron.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Przed wdrożeniem: AKCJA_BIEG_CRON_Z_MIGRACJA=1 (cron.schedule w tej samej transakcji — wycofany, pg_cron go nie zobaczy).
# Nic nie woła funkcji; z vault tylko liczba sekretów; z listy odbiorców tylko liczby.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${AKCJA_BIEG_CRON_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261128_akcja_bieg_przypomnienie_cron.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/akcja-bieg-przypomnienie-cron-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY CRONA PRZYPOMNIENIA ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY CRONA PRZYPOMNIENIA ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
