#!/usr/bin/env bash
# SPOŁECZNOŚĆ W NOWYM DZIŚ (K1): testy spolecznosc_dzis() w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# SD_Z_MIGRACJA=1 dokłada niewdrożoną migrację 20261228_spolecznosc_dzis.sql (przed wdrożeniem); bez niej test woła funkcję z bazy (po wdrożeniu).
# Odczyt i zapisy testowe (imiona, miasta, biegi, odznaki pięciu kont) giną przy rollback.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${SD_Z_MIGRACJA:-0}" = "1" ]; then
    sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d' supabase/migrations/20261228_spolecznosc_dzis.sql
  fi
  cat tools/spolecznosc-dzis-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY SPOLECZNOSC_DZIS ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY SPOLECZNOSC_DZIS ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
