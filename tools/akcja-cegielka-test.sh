#!/usr/bin/env bash
# CEGIEŁKA OD OSOBY PRYWATNEJ: testy po skutku migracji 20261107_akcja_cegielka_zgloszenia.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Przed wdrożeniem: CEGIELKA_Z_MIGRACJA=1 (migracja w tej samej transakcji). Bez migracji na bazie test ma być CZERWONY (FAIL albo check_violation w kroku 1).
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${CEGIELKA_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261107_akcja_cegielka_zgloszenia.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/akcja-cegielka-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY CEGIELEK ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY CEGIELEK ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
