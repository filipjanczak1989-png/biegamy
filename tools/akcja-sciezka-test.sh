#!/usr/bin/env bash
# ŚCIEŻKA FABIANKA: testy po skutku migracji 20261105_akcja_sciezka.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  tr -d '\r' < tools/akcja-sciezka-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY SCIEZKI ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY SCIEZKI ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
