#!/usr/bin/env bash
# OKIENKO PAMIĘĆ (R1): testy 20261105_okienko_pamiec.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej. Przed wdrożeniem: OP_Z_MIGRACJA=1.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${OP_Z_MIGRACJA:-0}" = 1 ]; then sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d' supabase/migrations/20261105_okienko_pamiec.sql; fi
  cat tools/okienko-pamiec-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY OKIENKO_PAMIEC ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY OKIENKO_PAMIEC ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
