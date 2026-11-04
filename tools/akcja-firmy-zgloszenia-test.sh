#!/usr/bin/env bash
# ZGŁOSZENIA FIRM: testy po skutku migracji 20261105_akcja_firmy_zgloszenia.sql i 20261105_akcja_firmy_szyldy.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  tr -d '\r' < tools/akcja-firmy-zgloszenia-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY ZGLOSZEN FIRM ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY ZGLOSZEN FIRM ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
