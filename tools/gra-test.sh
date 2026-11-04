#!/usr/bin/env bash
# GRA: testy po skutku migracji 20261105_gra_cegielki.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej. Przed wdrożeniem: GRA_Z_MIGRACJA=1.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${GRA_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261105_gra_cegielki.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/gra-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY GRY ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY GRY ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
