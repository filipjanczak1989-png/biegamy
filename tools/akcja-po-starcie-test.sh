#!/usr/bin/env bash
# PO STARCIE AKCJI: testy po skutku migracji 20261109_akcja_po_starcie.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Przed wdrożeniem: PO_STARCIE_Z_MIGRACJA=1 (migracja w tej samej transakcji). Bez migracji na bazie test ma być CZERWONY (FAIL albo brak kolumny/funkcji).
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${PO_STARCIE_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261109_akcja_po_starcie.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/akcja-po-starcie-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY PO STARCIE ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY PO STARCIE ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
