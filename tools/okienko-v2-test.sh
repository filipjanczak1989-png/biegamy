#!/usr/bin/env bash
# Okienko 2.0 E0: testy przełącznika w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej. Przed wdrożeniem: OV2_Z_MIGRACJA=1
# (migracja wchodzi do tej samej transakcji i jest cofana razem z testami — sprawdza SQL na prod bez skutku).
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${OV2_Z_MIGRACJA:-0}" = 1 ]; then sed -e '/^begin;$/d' -e '/^commit;$/d' supabase/migrations/20261105_okienko_v2_przelacznik.sql; fi
  cat tools/okienko-v2-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY V2 ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY V2 ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
