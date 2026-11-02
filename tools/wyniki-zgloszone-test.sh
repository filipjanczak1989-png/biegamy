#!/usr/bin/env bash
# Etap 2: wyniki_zgloszone — testy w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej. Przed wdrożeniem: WZ_Z_MIGRACJA=1.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${WZ_Z_MIGRACJA:-0}" = 1 ]; then sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d' supabase/migrations/20261102_wyniki_zgloszone.sql; fi
  cat tools/wyniki-zgloszone-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY WZ ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY WZ ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
