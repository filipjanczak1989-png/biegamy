#!/usr/bin/env bash
# TRASY (T1): testy tabeli trasy w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# TR_Z_MIGRACJA=1 dokłada niewdrożoną migrację 20261232 (przed wdrożeniem); bez niej test sprawdza bazę taką, jaka jest (po wdrożeniu).
# TR_Z_WYCOFANIEM=1 (razem z TR_Z_MIGRACJA=1) dokłada po migracji jej WYCOFANIE: test ma wtedy być CZERWONY (FAIL 0, tabeli nie ma).
# Zapisy testowe (wpis treningu, trasa) giną przy rollback.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
wytnij() { sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d' "$1"; }
{ echo 'begin;'
  if [ "${TR_Z_MIGRACJA:-0}" = "1" ]; then wytnij supabase/migrations/20261232_trasy.sql; fi
  if [ "${TR_Z_WYCOFANIEM:-0}" = "1" ]; then wytnij supabase/migrations/20261232_WYCOFANIE_trasy.sql; fi
  cat tools/trasy-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY TRASY ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY TRASY ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
