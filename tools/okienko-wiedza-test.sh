#!/usr/bin/env bash
# Baza wiedzy: testy po skutku w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej. Przed wdrożeniem: OKIENKO_WIEDZA_Z_MIGRACJA=1
# (migracja wchodzi do tej samej transakcji i jest cofana razem z testami). Wynik: „TESTY WIEDZA ZIELONE 30/30” (celowy błąd kończący blok) albo FAIL.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${OKIENKO_WIEDZA_Z_MIGRACJA:-0}" = 1 ]; then sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d' supabase/migrations/20261106_okienko_wiedza.sql; fi
  cat tools/okienko-wiedza-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY WIEDZA ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY WIEDZA ZIELONE 30/30' || { echo "$OUT" | tail -5; exit 1; }
