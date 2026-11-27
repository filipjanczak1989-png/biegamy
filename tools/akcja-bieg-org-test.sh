#!/usr/bin/env bash
# WYNIKI SPOZA APLIKACJI (bieg stacjonarny, wpisuje organizator): testy w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# AO_Z_MIGRACJA=1 dokłada niewdrożoną migrację 20261233_akcja_bieg_wyniki_organizatora.sql (przed wdrożeniem); bez niej test woła funkcje z bazy.
# Wpisy testowe (dwa imiona, bieg do sprzątania) giną przy rollback.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${AO_Z_MIGRACJA:-0}" = "1" ]; then
    sed -e '/^begin;$/d' -e '/^commit;$/d' supabase/migrations/20261233_akcja_bieg_wyniki_organizatora.sql
  fi
  cat tools/akcja-bieg-org-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY AKCJA_BIEG_ORG ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY AKCJA_BIEG_ORG ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
