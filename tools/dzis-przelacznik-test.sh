#!/usr/bin/env bash
# PRZEŁĄCZNIK NOWEGO DZIŚ (E0, 23.11): test po skutku migracji 20261225_dzis_przelacznik.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Przed wdrożeniem: DZIS_PRZELACZNIK_Z_MIGRACJA=1 (migracja w tej samej transakcji, też wycofana). Nie wypisuje kont.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${DZIS_PRZELACZNIK_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261225_dzis_przelacznik.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/dzis-przelacznik-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY PRZEŁĄCZNIKA DZIŚ ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY PRZEŁĄCZNIKA DZIŚ ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
