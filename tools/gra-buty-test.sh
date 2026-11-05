#!/usr/bin/env bash
# BUTY: testy po skutku migracji 20261107_gra_buty.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  tr -d '\r' < tools/gra-buty-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY BUTOW ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY BUTOW ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
